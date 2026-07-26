import { NextResponse } from "next/server";
import { generateHookLine } from "@/services/story/generator";
import type { OutputLanguage } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const story = typeof body.story === "string" ? body.story.trim() : "";
    const language: OutputLanguage = body.language === "en" ? "en" : "ta";
    // Hooks already shown and rejected, so a regenerate returns a genuinely
    // different angle instead of a rephrasing of the same idea.
    const avoid = Array.isArray(body.avoid)
      ? body.avoid.filter((h: unknown): h is string => typeof h === "string" && h.trim().length > 0).slice(-5)
      : [];

    if (story.length < 20) {
      return NextResponse.json({ error: "முதலில் கதை/செய்தியை உள்ளிடவும் (குறைந்தது 20 எழுத்துகள்)" }, { status: 400 });
    }

    const hook = await generateHookLine(story, language, avoid);
    return NextResponse.json({ success: true, hook });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hook உருவாக்க முடியவில்லை" }, { status: 500 });
  }
}
