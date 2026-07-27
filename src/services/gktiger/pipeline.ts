import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import {
  createStoryProject,
  updateStoryProject,
  recordQuizQuestions,
  type GkQuizQuestion,
} from "@/lib/database";
import { generateVerifiedQuestions, pickCategory, type GkCategory, type GkDifficulty } from "./questions";
import { renderQuizVideo } from "./render";

const QUESTIONS_PER_VIDEO = 4;
/** Time the viewer gets to choose, per the approved design's timer. */
const COUNTDOWN_SECONDS = 10;
/** Four questions each holding a full 10s countdown cannot fit the original
 * 20-35s brief; YouTube Shorts accepts up to 3 minutes, so this is the
 * practical ceiling for the approved template. */
const MAX_DURATION_SECONDS = 75;
const MIN_DURATION_SECONDS = 18;

export type GkGenerateOptions = {
  category?: GkCategory;
  difficulty?: GkDifficulty;
};

export type GkGenerateResult = {
  projectId: number;
  category: string;
  difficulty: string;
  questions: GkQuizQuestion[];
  outputPath: string;
  subtitlePath: string;
  durationSeconds: number;
  warnings: string[];
};

/** Pre-render sanity checks from the channel brief. Anything in the "fail"
 * list stops the render outright; softer issues come back as warnings so the
 * reviewer sees them next to the video. */
function qualityCheck(questions: GkQuizQuestion[]): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  questions.forEach((q, i) => {
    const label = `Q${i + 1}`;
    const choices = [q.choiceA, q.choiceB, q.choiceC];

    // The displayed option for `correct` must actually exist and be non-empty.
    const correctText = q.correct === "A" ? q.choiceA : q.correct === "B" ? q.choiceB : q.choiceC;
    if (!correctText?.trim()) failures.push(`${label}: correct answer ${q.correct} has no option text`);

    if (new Set(choices.map((c) => c.toLowerCase().trim())).size !== 3) {
      failures.push(`${label}: duplicate answer choices`);
    }
    const norm = q.question.toLowerCase().trim();
    if (seen.has(norm)) failures.push(`${label}: duplicate question within this video`);
    seen.add(norm);

    // Mobile-safe text budgets — the template auto-shrinks beyond these, but
    // flag them so the reviewer knows a card is running tight.
    if (q.question.length > 95) warnings.push(`${label}: question is long (${q.question.length} chars), may wrap tightly`);
    choices.forEach((c, ci) => {
      if (c.length > 30) warnings.push(`${label}: option ${"ABC"[ci]} is long (${c.length} chars)`);
    });
    if (!q.explanation?.trim()) warnings.push(`${label}: no interesting fact supplied`);
  });

  return { failures, warnings };
}

/** End-to-end GK Tiger Short: verified questions → option photos → branded
 * render. Creates an ordinary story_projects row (intended_channel='gktiger')
 * so the existing dashboard, upload and cost plumbing all work unchanged.
 * Never uploads — that stays a separate, explicitly-Private step. */
export async function generateGkTigerVideo(options: GkGenerateOptions = {}): Promise<GkGenerateResult> {
  const category = options.category || pickCategory();
  const difficulty = options.difficulty || "mixed";

  // 1-3. Questions, each independently fact-checked (uncertain ones are
  // dropped and redrafted; if we can't reach a full set this throws).
  const questions: GkQuizQuestion[] = [];
  while (questions.length < QUESTIONS_PER_VIDEO) {
    const batch = await generateVerifiedQuestions(category, difficulty);
    for (const q of batch) {
      if (questions.length < QUESTIONS_PER_VIDEO && !questions.some((e) => e.question === q.question)) {
        questions.push(q);
      }
    }
  }

  const { failures, warnings } = qualityCheck(questions);
  if (failures.length > 0) {
    throw new Error(`GK Tiger quality check failed — video not rendered:\n- ${failures.join("\n- ")}`);
  }

  const title = `${questions.length} ${category} questions — can you get them all? | GK Tiger`;
  const projectId = createStoryProject(
    questions.map((q, i) => `Q${i + 1}. ${q.question} (A: ${q.choiceA} / B: ${q.choiceB} / C: ${q.choiceC}) → ${q.correct}`).join("\n"),
    MAX_DURATION_SECONDS,
    "Female — Energetic",
    { aspectRatio: "9:16", bgm: false, animate: false, language: "en", mediaSource: "ai", ttsMode: "free", localize: false, intendedChannel: "gktiger" },
  );

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  await fs.mkdir(mediaDir, { recursive: true });

  try {
    // 5-7. The approved template renders every frame itself (SVG -> PNG), so
    // there is no per-scene media fetch — only the quiz data varies.
    updateStoryProject(projectId, { status: "rendering" });
    const rendered = await renderQuizVideo(questions, mediaDir, { countdownSeconds: COUNTDOWN_SECONDS });

    if (rendered.durationSeconds > MAX_DURATION_SECONDS) {
      warnings.push(`Video is ${rendered.durationSeconds.toFixed(1)}s — over the ${MAX_DURATION_SECONDS}s Shorts ceiling`);
    } else if (rendered.durationSeconds < MIN_DURATION_SECONDS) {
      warnings.push(`Video is only ${rendered.durationSeconds.toFixed(1)}s — shorter than intended`);
    }

    // 10. Record what shipped, and burn the questions so they never repeat.
    const stored = recordQuizQuestions(questions, projectId);
    if (stored < questions.length) {
      warnings.push(`${questions.length - stored} question(s) were already in the bank — dedup caught a repeat`);
    }

    updateStoryProject(projectId, {
      status: "rendered",
      output_path: rendered.outputPath,
      audio_duration: rendered.durationSeconds,
      seo_title: title,
      seo_description: `${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}\n\nHow many did you get right? Comment your score and follow GK Tiger for more!\n\n#gk #quiz #generalknowledge #shorts #gktiger #trivia`,
      seo_tags: JSON.stringify(["gk", "quiz", "general knowledge", "trivia", "shorts", "gktiger", category]),
      error_message: warnings.length ? warnings.join(" | ") : null,
    });

    return {
      projectId, category, difficulty, questions,
      outputPath: rendered.outputPath,
      subtitlePath: rendered.subtitlePath,
      durationSeconds: rendered.durationSeconds,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStoryProject(projectId, { status: "failed", error_message: message });
    throw error;
  }
}
