import { NextResponse } from "next/server";
import { generateGkTigerVideo } from "@/services/gktiger/pipeline";
import { GK_CATEGORIES, type GkCategory, type GkDifficulty } from "@/services/gktiger/questions";

export const runtime = "nodejs";
export const maxDuration = 900;
export const dynamic = "force-dynamic";

const DIFFICULTIES: GkDifficulty[] = ["easy", "medium", "hard", "mixed"];

export async function GET() {
  return NextResponse.json({ categories: GK_CATEGORIES, difficulties: DIFFICULTIES });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = GK_CATEGORIES.includes(body.category) ? (body.category as GkCategory) : undefined;
    const difficulty = DIFFICULTIES.includes(body.difficulty) ? (body.difficulty as GkDifficulty) : "mixed";

    // Awaited rather than fire-and-forget: a run that fails fact-verification
    // must surface that to the caller instead of silently producing nothing.
    const result = await generateGkTigerVideo({ category, difficulty });

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      category: result.category,
      difficulty: result.difficulty,
      durationSeconds: Number(result.durationSeconds.toFixed(2)),
      questions: result.questions.map((q) => ({ question: q.question, correct: q.correct })),
      warnings: result.warnings,
      message: `GK Tiger Short ready (Project #${result.projectId}) — review it, then upload as Private.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "GK Tiger generation failed" },
      { status: 500 },
    );
  }
}
