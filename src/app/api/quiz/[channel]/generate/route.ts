import { NextResponse } from "next/server";
import { generateQuizVideo, type QuizGenerateOptions } from "@/services/quiz/pipeline";
import { brandFor, isQuizChannel } from "@/services/quiz/brand";
import type { GkDifficulty } from "@/services/quiz/questions";

export const runtime = "nodejs";
export const maxDuration = 900;
export const dynamic = "force-dynamic";

const DIFFICULTIES: GkDifficulty[] = ["easy", "medium", "hard", "mixed"];

/** GET → what this channel's quiz section should offer: its own topic list,
 * its language and the wording shown on its videos. */
export async function GET(_request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  if (!isQuizChannel(channel)) {
    return NextResponse.json({ error: `Unknown channel "${channel}"` }, { status: 404 });
  }
  const brand = brandFor(channel);
  return NextResponse.json({
    channel,
    label: brand.label,
    language: brand.language,
    wordmark: brand.wordmark,
    categories: brand.categories,
    difficulties: DIFFICULTIES,
  });
}

export async function POST(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  if (!isQuizChannel(channel)) {
    return NextResponse.json({ success: false, error: `Unknown channel "${channel}"` }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const brand = brandFor(channel);

    // Only offer this channel's own topics; anything else falls back to a
    // random one from its list rather than pulling in another channel's subject.
    const category = brand.categories.includes(body.category) ? String(body.category) : undefined;
    const difficulty: GkDifficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : "mixed";

    const options: QuizGenerateOptions = {
      category,
      difficulty,
      manualQuestions: typeof body.manualQuestions === "string" ? body.manualQuestions : undefined,
      sourceMaterial: typeof body.sourceMaterial === "string" ? body.sourceMaterial : undefined,
      autoUpload: body.autoUpload === true,
      // Private unless explicitly told otherwise — nothing unreviewed goes public.
      privacy: body.privacy === "public" ? "public" : body.privacy === "unlisted" ? "unlisted" : "private",
    };

    // Awaited rather than fire-and-forget: a run that fails fact-verification
    // must surface that to the caller instead of silently producing nothing.
    const result = await generateQuizVideo(channel, options);

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      channel: result.channel,
      channelLabel: result.channelLabel,
      category: result.category,
      difficulty: result.difficulty,
      durationSeconds: Number(result.durationSeconds.toFixed(2)),
      questions: result.questions.map((q) => ({ question: q.question, correct: q.correct })),
      warnings: result.warnings,
      youtubeUrl: result.youtubeUrl,
      message: result.youtubeUrl
        ? `${result.channelLabel} quiz uploaded (Project #${result.projectId}): ${result.youtubeUrl}`
        : `${result.channelLabel} quiz ready (Project #${result.projectId}) — review it, then upload.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Quiz generation failed" },
      { status: 500 },
    );
  }
}
