import { NextResponse } from "next/server";
import path from "node:path";
import fsp from "node:fs/promises";
import { config } from "@/lib/config";
import { createStoryProject } from "@/lib/database";
import { runStoryGenerationPipeline } from "@/services/story/pipeline";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const story = typeof body.story === "string" ? body.story.trim() : "";
    const durationSeconds = Number(body.durationSeconds) || 180;
    const voice = typeof body.voice === "string" && body.voice ? body.voice : "Female — Warm";
    const aspectRatio: "16:9" | "9:16" = body.aspectRatio === "9:16" ? "9:16" : "16:9";
    const bgm = Boolean(body.bgm);
    const animate = body.animate !== false; // default on
    const language: "ta" | "en" = body.language === "en" ? "en" : "ta";
    // Scene media: "stock" = free Pexels/Pixabay footage (default, most
    // reliable); "ai" = free Pollinations/Flux image generated per scene.
    const mediaSource: "stock" | "ai" = body.mediaSource === "ai" ? "ai" : "stock";
    const ttsMode: "free" | "paid" = body.ttsMode === "free" ? "free" : "paid";
    const localize = Boolean(body.localize);
    const intendedChannel = typeof body.channel === "string" && body.channel ? body.channel : "story";

    if (story.length < 20) return NextResponse.json({ error: "குறைந்தது 20 எழுத்துகள் கொண்ட கதை/செய்தியை பேஸ்ட் செய்யவும்" }, { status: 400 });
    if (durationSeconds < 20 || durationSeconds > 1200) return NextResponse.json({ error: "Duration 20 விநாடி முதல் 20 நிமிடம் வரை மட்டுமே" }, { status: 400 });

    const projectId = createStoryProject(story, Math.round(durationSeconds), voice, { aspectRatio, bgm, animate, language, mediaSource, ttsMode, localize, intendedChannel });
    const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
    await fsp.mkdir(mediaDir, { recursive: true });

    // Errors are recorded on the project itself (status='failed') by the pipeline,
    // not thrown here — this response has already been sent by the time it matters.
    runStoryGenerationPipeline(projectId, { story, durationSeconds, voice, aspectRatio, language, ttsMode, localize, mediaDir, mediaSource });

    return NextResponse.json({ success: true, projectId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Story-to-video API error" }, { status: 500 });
  }
}
