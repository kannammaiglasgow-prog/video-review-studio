import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import {
  createStoryProject,
  updateStoryProject,
  recordQuizQuestions,
  type GkQuizQuestion,
} from "@/lib/database";
import { isYoutubeConnected, uploadToYoutube, type ChannelType } from "@/services/providers/youtube";
import { extractArticleFromUrl } from "@/services/story/link-import";
import { brandFor, pickCategoryFor, type QuizBrand } from "./brand";
import {
  englishImageTerms, generateQuestionsFromSource, generateVerifiedQuestions,
  parseManualQuestions, QUESTIONS_PER_VIDEO, type GkDifficulty,
} from "./questions";
import { renderQuizVideo } from "./render";

/** Time the viewer gets to choose once all options have been read. */
const COUNTDOWN_SECONDS = 3;
/** Four questions each holding a full countdown cannot fit the original
 * 20-35s brief; YouTube Shorts accepts up to 3 minutes, so this is the
 * practical ceiling for the approved template. Channels that read slower get
 * the same allowance scaled by the factor their timeline is paced with. */
const BASE_MAX_DURATION_SECONDS = 75;
const MIN_DURATION_SECONDS = 18;

export type QuizGenerateOptions = {
  category?: string;
  difficulty?: GkDifficulty;
  /** Upload straight to this channel once the render succeeds. */
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

export type QuizGenerateResult = {
  projectId: number;
  channel: ChannelType;
  channelLabel: string;
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
 * reviewer sees them next to the video.
 *
 * The text budgets are per-language: the template auto-shrinks past them, but
 * Tamil reaches the limit sooner, so the warning threshold moves with it. */
function qualityCheck(brand: QuizBrand, questions: GkQuizQuestion[]): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const maxQuestion = brand.language === "ta" ? 66 : 95;
  const maxChoice = brand.language === "ta" ? 20 : 30;

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

    if (q.question.length > maxQuestion) warnings.push(`${label}: question is long (${q.question.length} chars), may wrap tightly`);
    choices.forEach((c, ci) => {
      if (c.length > maxChoice) warnings.push(`${label}: option ${"ABC"[ci]} is long (${c.length} chars)`);
    });
    if (!q.explanation?.trim()) warnings.push(`${label}: no interesting fact supplied`);
  });

  return { failures, warnings };
}

/** Resolves the three question sources into one verified set. */
async function collectQuestions(
  brand: QuizBrand,
  category: string,
  difficulty: GkDifficulty,
  options: QuizGenerateOptions,
): Promise<{ questions: GkQuizQuestion[]; warnings: string[] }> {
  const warnings: string[] = [];
  const source = options.sourceMaterial?.trim();

  if (source) {
    // A bare URL is fetched and reduced to its article text; anything else is
    // treated as the material itself.
    let material = source;
    if (/^https?:\/\/\S+$/i.test(source)) {
      const article = await extractArticleFromUrl(source);
      material = article.title ? `${article.title}\n\n${article.article}` : article.article;
    }
    const { questions, rejected } = await generateQuestionsFromSource(brand, material, QUESTIONS_PER_VIDEO, category, difficulty);
    if (rejected.length > 0) {
      warnings.push(`${rejected.length} question(s) drawn from your source failed verification and were dropped`);
    }
    if (questions.length === 0) {
      throw new Error("No questions from that source passed verification — nothing was rendered.");
    }
    return { questions: questions.slice(0, QUESTIONS_PER_VIDEO), warnings };
  }

  if (options.manualQuestions?.trim()) {
    const { questions, rejected } = await parseManualQuestions(brand, options.manualQuestions, category, difficulty);
    if (rejected.length > 0) {
      warnings.push(`${rejected.length} of your question(s) failed fact-verification and were dropped: ${rejected.join(" | ")}`);
    }
    if (questions.length === 0) {
      throw new Error("None of your questions passed fact-verification — nothing was rendered.");
    }
    return { questions, warnings };
  }

  const generated: GkQuizQuestion[] = [];
  while (generated.length < QUESTIONS_PER_VIDEO) {
    const batch = await generateVerifiedQuestions(brand, category, difficulty);
    for (const q of batch) {
      if (generated.length < QUESTIONS_PER_VIDEO && !generated.some((e) => e.question === q.question)) {
        generated.push(q);
      }
    }
  }
  return { questions: generated, warnings };
}

/** End-to-end quiz Short for one channel: verified questions → option photos →
 * that channel's branded render. Creates an ordinary story_projects row
 * (intended_channel = the channel key) so the existing dashboard, upload and
 * cost plumbing all work unchanged. Uploads only when explicitly asked, and
 * defaults to Private when it does. */
export async function generateQuizVideo(
  channel: ChannelType,
  options: QuizGenerateOptions = {},
): Promise<QuizGenerateResult> {
  const brand = brandFor(channel);
  const category = options.category?.trim() || pickCategoryFor(brand);
  const difficulty = options.difficulty || "mixed";
  const maxDuration = BASE_MAX_DURATION_SECONDS * brand.paceScale;

  // 1-3. Questions, each independently fact-checked (uncertain ones are
  // dropped; generated sets are redrafted until full, hand-written ones are
  // used exactly as given minus anything that failed verification).
  const { questions, warnings } = await collectQuestions(brand, category, difficulty, options);

  const { failures, warnings: qualityWarnings } = qualityCheck(brand, questions);
  warnings.push(...qualityWarnings);
  if (failures.length > 0) {
    throw new Error(`${brand.label} quiz quality check failed — video not rendered:\n- ${failures.join("\n- ")}`);
  }

  const title = `${questions.length} ${category} questions — can you get them all? | ${brand.label}`;
  const projectId = createStoryProject(
    questions.map((q, i) => `Q${i + 1}. ${q.question} (A: ${q.choiceA} / B: ${q.choiceB} / C: ${q.choiceC}) → ${q.correct}`).join("\n"),
    Math.round(maxDuration),
    brand.voice,
    {
      aspectRatio: "9:16", bgm: false, animate: false,
      language: brand.language,
      mediaSource: "ai", ttsMode: "free", localize: false, intendedChannel: channel,
    },
  );

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  await fs.mkdir(mediaDir, { recursive: true });

  try {
    // 5-7. Option illustrations, then the template renders every frame itself.
    updateStoryProject(projectId, { status: "fetching_media" });
    const searchTerms = await englishImageTerms(brand, questions);
    const rendered = await renderQuizVideo(brand, questions, mediaDir, {
      countdownSeconds: COUNTDOWN_SECONDS,
      category,
      searchTerms,
      onPhase: (phase) => updateStoryProject(projectId, { status: phase }),
    });

    if (rendered.durationSeconds > maxDuration) {
      warnings.push(`Video is ${rendered.durationSeconds.toFixed(1)}s — over the ${maxDuration.toFixed(0)}s Shorts ceiling`);
    } else if (rendered.durationSeconds < MIN_DURATION_SECONDS) {
      warnings.push(`Video is only ${rendered.durationSeconds.toFixed(1)}s — shorter than intended`);
    }

    // 10. Record what shipped, and burn the questions so they never repeat on
    // this channel (another channel may still legitimately ask them).
    const stored = recordQuizQuestions(channel, questions, projectId);
    if (stored < questions.length) {
      warnings.push(`${questions.length - stored} question(s) were already in this channel's bank — dedup caught a repeat`);
    }

    const description = `${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}\n\nHow many did you get right? Comment your score and follow ${brand.label} for more!\n\n#quiz #generalknowledge #shorts #trivia`;
    const tags = ["quiz", "general knowledge", "trivia", "shorts", brand.label.toLowerCase(), category];

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
      if (!isYoutubeConnected(channel)) {
        warnings.push(`Auto-upload skipped — the ${brand.label} YouTube channel is not connected`);
      } else {
        const privacyStatus = options.privacy ?? "private";
        try {
          const result = await uploadToYoutube({
            filePath: rendered.outputPath,
            title,
            description,
            tags,
            privacyStatus,
            language: brand.language,
          }, channel);
          youtubeUrl = `https://youtu.be/${result.videoId}`;
          updateStoryProject(projectId, {
            status: "uploaded",
            youtube_video_id: result.videoId,
            youtube_url: youtubeUrl,
            youtube_channel: channel,
          });
          console.log(`[Quiz:${channel}] uploaded #${projectId} as ${privacyStatus}: ${youtubeUrl}`);
        } catch (err) {
          warnings.push(`Auto-upload failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return {
      projectId, channel, channelLabel: brand.label, category, difficulty, questions,
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
