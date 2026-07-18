import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { createReactionPlan } from "@/services/providers/review-planner";
import { compositeReactionVideo } from "@/services/render/compositor";
import { config } from "@/lib/config";
import path from "node:path";

export const runtime = "nodejs";

async function runReactionPipeline(
  projectId: number,
  youtubeUrl: string,
  outputLanguage: "ta" | "en" | "hi",
  tone: string,
  persona: string
) {
  const db = database();
  try {
    // 1. Download & Index
    db.prepare("UPDATE projects SET status='downloading' WHERE id=?").run(projectId);
    const plan = await createReactionPlan(youtubeUrl, projectId, outputLanguage, tone, persona);

    // 2. Planning highlight scripts -> Awaiting script approval
    db.prepare("UPDATE projects SET status='awaiting_script_approval', transcript=?, review_script=?, thumbnail_prompt=? WHERE id=?")
      .run(plan.title, JSON.stringify(plan.highlights), plan.thumbnailPrompt, projectId);
    console.log(`[Reaction Pipeline] Project ${projectId} is ready and awaiting script approval.`);
  } catch (err: any) {
    console.error(`[Reaction Pipeline] Project ${projectId} failed during planning:`, err);
    db.prepare("UPDATE projects SET status='failed', error_message=? WHERE id=?")
      .run(err.message || String(err), projectId);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { youtubeUrl, layout, outputLanguage, voice, tone, persona, aspectRatio, videoStyle, splitShortsEnabled } = body;

    if (!youtubeUrl) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const db = database();
    
    // Insert new project record into SQLite database
    const insert = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time, 
        stance, tone, persona, voice, tts_provider, 
        aspect_ratio, duration, output_language, status, custom_instruction, video_style, split_shorts_enabled
      ) VALUES (?, 'youtube', 'reaction', '0', '0', 'neutral', ?, ?, ?, 'local', ?, 'auto', ?, 'queued', ?, ?, ?)
    `);

    const result = insert.run(
      youtubeUrl,
      tone || "fun",
      persona || "normal",
      voice || "ஆண் — இயல்பான",
      aspectRatio || "9:16",
      outputLanguage || "ta",
      layout || "pause-and-explain",
      videoStyle || "standard",
      splitShortsEnabled ? 1 : 0
    );

    const projectId = Number(result.lastInsertRowid);

    // Trigger initial planning pipeline asynchronously
    runReactionPipeline(
      projectId,
      youtubeUrl,
      outputLanguage || "ta",
      tone || "fun",
      persona || "normal"
    ).catch(err => console.error("Reaction pipeline background task crashed", err));

    return NextResponse.json({ id: projectId, projectId, message: "Reaction generation queued successfully" });
  } catch (err: any) {
    console.error("API POST /api/projects/reaction failed:", err);
    return NextResponse.json({ error: err.message || "Failed to create reaction project" }, { status: 500 });
  }
}
