import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import {
  createStoryProject,
  updateStoryProject,
  recordQuizQuestions,
  type GkQuizQuestion,
} from "@/lib/database";
import { downloadSquareImages } from "@/services/providers/pollinations";
import { BRAND } from "./brand";
import { generateVerifiedQuestions, pickCategory, type GkCategory, type GkDifficulty } from "./questions";
import { renderQuizVideo } from "./render";

const QUESTIONS_PER_VIDEO = 4;
/** Shorts hard limit is 60s; the brief targets 20-35s but four questions with
 * a real 3s countdown each cannot fit that, so this is the practical ceiling. */
const MAX_DURATION_SECONDS = 59;
const MIN_DURATION_SECONDS = 18;

/** Illustration prompt for one answer choice. Deliberately plain and literal —
 * the picture has to read instantly at thumbnail size on a phone, and must not
 * hint at which option is correct. */
function optionImagePrompt(choice: string, category: string): string {
  return `A clear, simple, brightly lit photograph of ${choice}, centered subject, plain uncluttered background, vibrant colors, high detail, subject fills the frame. Educational quiz illustration for the topic ${category}. No text, no words, no letters, no watermarks.`;
}

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

    // Mobile-safe text budgets (see BRAND wrap limits).
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
    // 5. Copyright-safe option photos (AI-generated, one per choice).
    updateStoryProject(projectId, { status: "fetching_media" });
    const prompts: string[] = [];
    const targets: string[] = [];
    questions.forEach((q, qi) => {
      [q.choiceA, q.choiceB, q.choiceC].forEach((choice, oi) => {
        prompts.push(optionImagePrompt(choice, category));
        targets.push(path.join(mediaDir, `opt_${qi}_${oi}`));
      });
    });
    const flat = await downloadSquareImages(prompts, BRAND.photoSize, targets);

    const optionImages: (string | null)[][] = questions.map((_, qi) => [0, 1, 2].map((oi) => flat[qi * 3 + oi]));
    const missing = flat.filter((f) => f === null).length;
    if (missing > 0) warnings.push(`${missing}/${flat.length} option images could not be generated — those cards show text only`);

    // 6-7. Voice-over, subtitles, countdown and the branded 1080x1920 render.
    updateStoryProject(projectId, { status: "rendering" });
    const rendered = await renderQuizVideo(questions, optionImages, mediaDir);

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
