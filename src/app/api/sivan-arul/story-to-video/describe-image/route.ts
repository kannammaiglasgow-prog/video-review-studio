import { NextResponse } from "next/server";
import { describeImageForStory } from "@/services/providers/gemini";
import type { OutputLanguage } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_CHARS = 20_000_000; // ~15MB decoded, well under Gemini's inline-data limit

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const data = typeof body.data === "string" ? body.data : "";
    const language: OutputLanguage = body.language === "en" ? "en" : "ta";

    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "இது ஒரு image கோப்பு அல்ல" }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Image data இல்லை" }, { status: 400 });
    }
    if (data.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "Image மிகப் பெரியது — சிறிய image paste செய்யவும்" }, { status: 400 });
    }

    const description = await describeImageForStory({ mimeType, data }, language);
    return NextResponse.json({ success: true, description });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image analysis தோல்வி" }, { status: 500 });
  }
}
