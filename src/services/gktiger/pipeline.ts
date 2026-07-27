import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import {
  createStoryProject,
  updateStoryProject,
  recordQuizQuestions,
  type GkQuizQuestion,
} from "@/lib/database";
import { isYoutubeConnected, uploadToYoutube } from "@/services/providers/youtube";
import { extractArticleFromUrl } from "@/services/story/link-import";
import { generateQuestionsFromSource, generateVerifiedQuestions, parseManualQuestions, pickCategory, type GkCategory, type GkDifficulty } from "./questions";
import { renderQuizVideo } from "./render";

const QUESTIONS_PER_VIDEO = 4;
/** Time the viewer gets to choose once all options have been read. */
const COUNTDOWN_SECONDS = 3;
/** Four questions each holding a full 10s countdown cannot fit the original
 * 20-35s brief; YouTube Shorts accepts up to 3 minutes, so this is the
 * practical ceiling for the approved template. */
const MAX_DURATION_SECONDS = 75;
const MIN_DURATION_SECONDS = 18;

export type GkGenerateOptions = {
  category?: GkCategory;
  difficulty?: GkDifficulty;
  /** Upload straight to the GK Tiger channel once the render succeeds. */
  autoUpload?: boolean;
  /** Defaults to Private — an unreviewed quiz should not go public by
   * accident, and the facts are only model-verified (see questions.ts). */
  privacy?: "private" | "unlisted" | "public";
  /** Hand-written questions. When supplied, nothing is auto-generated — the
   * text is structured and fact-checked, but the questions stay the user's. */
  manualQuestions?: string;
  /** A URL or a block of text to build the quiz from. A URL is fetched and
   * reduced to its article body first; questions are then drawn from that
   * material and checked back against it. */
  sourceMaterial?: string;
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
  youtubeUrl: string | null;
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
  // dropped; generated sets are redrafted until full, hand-written ones are
  // used exactly as given minus anything that failed verification).
  const questions: GkQuizQuestion[] = [];
  const manualWarnings: string[] = [];

  const source = options.sourceMaterial?.trim();
  if (source) {
    // A bare URL is fetched and reduced to its article text; anything else is
    // treated as the material itself.
    let material = source;
    if (/^https?:\/\/\S+$/i.test(source)) {
      const article = await extractArticleFromUrl(source);
      material = article.title ? `${article.title}\n\n${article.article}` : article.article;
    }
    const { questions: fromSource, rejected } = await generateQuestionsFromSource(
      material, QUESTIONS_PER_VIDEO, category, difficulty,
    );
    questions.push(...fromSource.slice(0, QUESTIONS_PER_VIDEO));
    if (rejected.length > 0) {
      manualWarnings.push(`${rejected.length} question(s) drawn from your source failed verification and were dropped`);
    }
    if (questions.length === 0) {
      throw new Error("No questions from that source passed verification — nothing was rendered.");
    }
  } else if (options.manualQuestions?.trim()) {
    const { questions: parsed, rejected } = await parseManualQuestions(options.manualQuestions, category, difficulty);
    questions.push(...parsed);
    if (rejected.length > 0) {
      manualWarnings.push(`${rejected.length} of your question(s) failed fact-verification and were dropped: ${rejected.join(" | ")}`);
    }
    if (questions.length === 0) {
      throw new Error("None of your questions passed fact-verification — nothing was rendered.");
    }
  } else {
    while (questions.length < QUESTIONS_PER_VIDEO) {
      const batch = await generateVerifiedQuestions(category, difficulty);
      for (const q of batch) {
        if (questions.length < QUESTIONS_PER_VIDEO && !questions.some((e) => e.question === q.question)) {
          questions.push(q);
        }
      }
    }
  }

  const { failures, warnings } = qualityCheck(questions);
  warnings.unshift(...manualWarnings);
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
    // 5-7. Option illustrations, then the template renders every frame itself.
    updateStoryProject(projectId, { status: "fetching_media" });
    const rendered = await renderQuizVideo(questions, mediaDir, {
      countdownSeconds: COUNTDOWN_SECONDS,
      category,
      onPhase: (phase) => updateStoryProject(projectId, { status: phase }),
    });

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

    const description = `${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}\n\nHow many did you get right? Comment your score and follow GK Tiger for more!\n\n#gk #quiz #generalknowledge #shorts #gktiger #trivia`;
    const tags = ["gk", "quiz", "general knowledge", "trivia", "shorts", "gktiger", category];

    updateStoryProject(projectId, {
      status: "rendered",
      output_path: rendered.outputPath,
      audio_duration: rendered.durationSeconds,
      seo_title: title,
      seo_description: description,
      seo_tags: JSON.stringify(tags),
      error_message: warnings.length ? warnings.join(" | ") : null,
    });

    let youtubeUrl: string | null = null;
    if (options.autoUpload) {
      if (!isYoutubeConnected("gktiger")) {
        warnings.push("Auto-upload skipped — the GK Tiger YouTube channel is not connected");
      } else {
        const privacyStatus = options.privacy ?? "private";
        try {
          updateStoryProject(projectId, { status: "rendered" });
          const result = await uploadToYoutube({
            filePath: rendered.outputPath,
            title,
            description,
            tags,
            privacyStatus,
            language: "en",
          }, "gktiger");
          youtubeUrl = `https://youtu.be/${result.videoId}`;
          updateStoryProject(projectId, {
            status: "uploaded",
            youtube_video_id: result.videoId,
            youtube_url: youtubeUrl,
            youtube_channel: "gktiger",
          });
          console.log(`[GKTiger] uploaded #${projectId} as ${privacyStatus}: ${youtubeUrl}`);
        } catch (err) {
          warnings.push(`Auto-upload failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return {
      projectId, category, difficulty, questions,
      outputPath: rendered.outputPath,
      subtitlePath: rendered.subtitlePath,
      durationSeconds: rendered.durationSeconds,
      warnings,
      youtubeUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStoryProject(projectId, { status: "failed", error_message: message });
    throw error;
  }
}
