import { NextResponse } from "next/server";
import { prepareQuizQuestions } from "@/services/quiz/pipeline";
import { brandFor, isQuizChannel } from "@/services/quiz/brand";
import type { GkDifficulty } from "@/services/quiz/questions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DIFFICULTIES: GkDifficulty[] = ["easy", "medium", "hard", "mixed"];

/** Preview step: generate + fact-check the questions and return them WITHOUT
 * rendering anything. The client shows them for approval; "regenerate" just
 * calls this again, and only the render endpoint commits to a video. */
export async function POST(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  if (!isQuizChannel(channel)) {
    return NextResponse.json({ success: false, error: `Unknown channel "${channel}"` }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const brand = brandFor(channel);
    const category = brand.categories.includes(body.category) ? String(body.category) : undefined;
    const difficulty: GkDifficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : "mixed";

    const preview = await prepareQuizQuestions(channel, {
      category,
      difficulty,
      manualQuestions: typeof body.manualQuestions === "string" ? body.manualQuestions : undefined,
      sourceMaterial: typeof body.sourceMaterial === "string" ? body.sourceMaterial : undefined,
    });

    return NextResponse.json({
      success: true,
      channel: preview.channel,
      channelLabel: preview.channelLabel,
      category: preview.category,
      difficulty: preview.difficulty,
      warnings: preview.warnings,
      // Full objects so the render step can reuse the exact approved set.
      questions: preview.questions,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Question generation failed" },
      { status: 500 },
    );
  }
}
