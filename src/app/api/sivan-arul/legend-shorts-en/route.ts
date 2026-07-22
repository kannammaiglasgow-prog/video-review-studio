import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { database } from "@/lib/database";
import { processProject } from "@/services/pipeline";
import { uploadToYoutube, setYoutubeThumbnail } from "@/services/providers/youtube";
import { generateAutoThumbnail } from "@/services/render/thumbnail-generator";
import { thumbnailPath } from "@/lib/thumbnails";

export const runtime = "nodejs";
export const maxDuration = 600;

function writeLog(sessionId: string, step: string, message: string, status: string, topicName: string, projectId?: number) {
  const db = database();
  db.prepare(`
    INSERT INTO auto_news_logs (session_id, project_id, region, step, message, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, projectId || null, topicName, step, message, status);
}

// English-language sibling of /api/sivan-arul/legend-shorts, targeting the "sanatana"
// (Sanatana Spirit) YouTube channel instead of the Tamil "devotional" (Sivan Arul) channel.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topicName = typeof body.topicName === "string" ? body.topicName.trim() : "";
    const storyDetails = typeof body.storyDetails === "string" ? body.storyDetails.trim() : "";
    const privacyStatus = ["public", "unlisted", "private"].includes(body.privacyStatus) ? body.privacyStatus : "private";
    const ttsProvider = body.ttsProvider === "local" ? "local" : "gemini";
    const voice = typeof body.voice === "string" && body.voice ? body.voice : "parler-jaya";

    if (topicName.length < 3) return NextResponse.json({ error: "Provide a topic/title" }, { status: 400 });
    if (storyDetails.length < 20) return NextResponse.json({ error: "Story details must be at least 20 characters" }, { status: 400 });

    const sessionId = `legend-shorts-en-${Date.now()}`;

    const customInstruction = `Based on the background information given below, write a 45-60 second English YouTube Shorts script about "${topicName}".
Formatting rules:
1. The very first line must be an intriguing question or a surprising fact (a hook).
2. Tell the story/explanation clearly, in chronological order, with genuine spiritual warmth.
3. End with a natural call-to-action line like "If this resonates with you, hit like and follow for more."
4. Do not alter historical or spiritual facts.

Background information:
${storyDetails}`;

    const db = database();

    const insert = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time,
        stance, tone, persona, voice, tts_provider,
        aspect_ratio, duration, transcript, output_language, status, custom_instruction, video_style,
        tier, cta_enabled, cta_position, b_roll_source, split_shorts_enabled, auto_approve
      ) VALUES ('', 'text', 'rewrite', '00:00', '00:00', 'spiritual', 'Calm, peaceful, and confident', 'Devotional Guide', ?, ?, '9:16', '60 விநாடிகள்', ?, 'en', 'queued', ?, 'devotional', 'premium', 0, 'end', 'stock', 0, 1)
    `);

    const result = insert.run(voice, ttsProvider, topicName, customInstruction);
    const projectId = Number(result.lastInsertRowid);

    writeLog(sessionId, "start", `Sanatana Spirit Shorts — starting "${topicName}"...`, "running", topicName, projectId);
    writeLog(sessionId, "project", `Project #${projectId} created`, "running", topicName, projectId);
    writeLog(sessionId, "script", `Gemini is writing the English script...`, "running", topicName, projectId);

    (async () => {
      const pipelineResult = await processProject(projectId);
      const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;

      if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
        throw new Error(`Video file missing for project #${projectId}`);
      }

      try {
        writeLog(sessionId, "thumbnail", `Generating video thumbnail...`, "running", topicName, projectId);
        await generateAutoThumbnail({
          projectId,
          keyword: "hindu temple ancient statue",
          title: topicName,
          footerText: "Sanatana Spirit",
          aspectRatio: "9:16"
        });
      } catch (thumbErr: any) {
        console.error("Thumbnail generation failed:", thumbErr);
      }

      writeLog(sessionId, "upload", `Uploading "${topicName}" to YouTube (${privacyStatus})...`, "running", topicName, projectId);
      const ytResult = await uploadToYoutube({
        filePath: path.resolve(row.output_path),
        title: `${topicName} #shorts`,
        description: `${topicName} — spiritual wisdom and ancient temple heritage.\n\n#sanatanaspirit #spirituality #hinduism #templehistory #shorts`,
        tags: ["spirituality", "sanatanaspirit", "templehistory", "shorts", "hinduism"],
        privacyStatus,
        language: "en"
      }, "sanatana");

      writeLog(sessionId, "upload", `YouTube upload succeeded! ID: ${ytResult.videoId}`, "done", topicName, projectId);

      const thumb = thumbnailPath(projectId);
      if (thumb && fs.existsSync(thumb)) {
        try {
          await setYoutubeThumbnail(ytResult.videoId, thumb, "sanatana");
        } catch (tErr) {
          console.error("Failed to set thumbnail:", tErr);
        }
      }

      writeLog(sessionId, "complete", `"${topicName}" is fully ready! Video ID: ${ytResult.videoId}`, "done", topicName, projectId);
    })().catch(err => {
      console.error(`[Legend-Shorts-EN] Project #${projectId} processing failed:`, err);
      writeLog(sessionId, "render", `Project #${projectId} failed: ${err.message || err}`, "error", topicName, projectId);
    });

    return NextResponse.json({
      success: true,
      message: "Sanatana Spirit Shorts queue started",
      projectId,
      sessionId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Legend Shorts EN API error" },
      { status: 500 }
    );
  }
}
