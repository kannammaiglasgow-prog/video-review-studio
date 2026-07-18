import { NextResponse } from "next/server";
import { estimateProjectCost } from "@/lib/cost-estimator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = estimateProjectCost({
      sourceType: body.sourceType,
      sourceText: body.sourceText,
      duration: body.duration,
      ttsProvider: body.ttsProvider,
      tier: body.tier,
      allowGeminiKeywords: Boolean(body.allowGeminiKeywords)
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Estimation failed" }, { status: 400 });
  }
}
