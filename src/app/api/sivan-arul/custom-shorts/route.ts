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

function writeLog(sessionId: string, step: string, message: string, status: string, deityName: string, projectId?: number) {
  const db = database();
  db.prepare(`
    INSERT INTO auto_news_logs (session_id, project_id, region, step, message, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, projectId || null, deityName, step, message, status);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const deityName = "சிவபெருமான்";
    const sessionId = `custom-devo-${Date.now()}`;

    const prompt = `மருந்தீஸ்வரர் திருத்தலம்`;
    const customInstruction = `சென்னையிலுள்ள திருவான்மியூர் மருந்தீஸ்வரர் திருக்கோவில் பற்றி 60 விநாடிகள் ஓடக்கூடிய பக்தி மற்றும் வரலாற்றுச் சிறப்புகள் கொண்ட தமிழ் YouTube Shorts ஸ்கிரிப்ட் ஒன்றை எழுதவும். 
பின்வரும் செய்திகளை உள்ளடக்கவும்:
1. இக்கோவில் 2000 ஆண்டுகள் பழமையான பாடல் பெற்ற சிவ தலம்.
2. வான்மீகி முனிவர் இங்கு சிவபெருமானை வழிபட்டதால் இவ்வூர் திருவான்மியூர் எனப்பட்டது.
3. அகத்திய முனிவருக்குச் சிவபெருமான் இங்கு மூலிகைகள் பற்றிய அறிவை வழங்கினார். நோய்களைக் குணமாக்கும் மருந்தீஸ்வரராக அருள்கிறார்.
4. பக்தி பூர்வமாகவும், தெளிவாகவும் எழுத வேண்டும்.`;

    const db = database();
    
    // Fetch voice from settings
    const settings = db.prepare("SELECT selected_voice FROM auto_devotional_settings LIMIT 1").get() as { selected_voice: string } | undefined;
    const voice = settings?.selected_voice || "parler-jaya";

    const insert = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time,
        stance, tone, persona, voice, tts_provider,
        aspect_ratio, duration, transcript, output_language, status, custom_instruction, video_style,
        tier, cta_enabled, cta_position, b_roll_source, split_shorts_enabled, auto_approve
      ) VALUES ('', 'text', 'rewrite', '00:00', '00:00', 'spiritual', 'Calm, peaceful, and confident', 'Devotional Guide', ?, 'gemini', '9:16', '60 விநாடிகள்', ?, 'ta', 'queued', ?, 'devotional', 'premium', 0, 'end', 'stock', 0, 1)
    `);
    
    const result = insert.run(voice, prompt, customInstruction);
    const projectId = Number(result.lastInsertRowid);

    writeLog(sessionId, "start", `🕉️ சிவன் அருள் (Shorts) — மருந்தீஸ்வரர் திருக்கோவில் பக்தி வீடியோ தயாரிப்பு தொடங்குகிறது...`, "running", deityName, projectId);
    writeLog(sessionId, "project", `📝 Project #${projectId} உருவாக்கப்பட்டது`, "running", deityName, projectId);
    writeLog(sessionId, "script", `✍️ Gemini AI தமிழ் பக்தி ஸ்கிரிப்ட் எழுதுகிறது...`, "running", deityName, projectId);

    // Run pipeline asynchronously in background
    (async () => {
      const pipelineResult = await processProject(projectId);
      const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;

      if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
        throw new Error(`Video file missing for project #${projectId}`);
      }

      // Generate Thumbnail
      try {
        writeLog(sessionId, "thumbnail", `🎨 Video Thumbnail generate ஆகிறது...`, "running", deityName, projectId);
        await generateAutoThumbnail({
          projectId,
          keyword: "hindu temple statue shiva",
          title: "மருந்தீஸ்வரர் கோவில் வரலாறு",
          footerText: "சிவன் அருள்  |  ஆன்மீக சிந்தனைகள்",
          aspectRatio: "9:16"
        });
      } catch (thumbErr: any) {
        console.error("Thumbnail generation failed:", thumbErr);
      }

      // Upload to YouTube
      writeLog(sessionId, "upload", `📤 மருந்தீஸ்வரர் பக்தி Shorts YouTube-ல் அப்லோடு செய்யப்படுகிறது...`, "running", deityName, projectId);
      const ytResult = await uploadToYoutube({
        filePath: path.resolve(row.output_path),
        title: "திருவான்மியூர் மருந்தீஸ்வரர் கோவில் வரலாறு #shorts",
        description: `சென்னையிலுள்ள 2000 ஆண்டுகள் பழமையான திருவான்மியூர் மருந்தீஸ்வரர் திருக்கோவில் வரலாறு மற்றும் ஆன்மீகச் சிறப்புகள்.\n\n#sivanarul #devotional #marundeeswarar #templehistory #tamilshorts`,
        tags: ["devotional", "sivanarul", "marundeeswarar", "shiva", "tamilgod"],
        privacyStatus: "public"
      }, "devotional");

      writeLog(sessionId, "upload", `✅ YouTube upload வெற்றி! ID: ${ytResult.videoId}`, "done", deityName, projectId);

      const thumb = thumbnailPath(projectId);
      if (thumb && fs.existsSync(thumb)) {
        try {
          await setYoutubeThumbnail(ytResult.videoId, thumb, "devotional");
        } catch (tErr) {
          console.error("Failed to set thumbnail:", tErr);
        }
      }

      writeLog(sessionId, "complete", `🎉 மருந்தீஸ்வரர் பக்தி வீடியோ முழுமையாக அப்லோடு செய்யப்பட்டது! Video ID: ${ytResult.videoId}`, "done", deityName, projectId);
    })().catch(err => {
      console.error(`[Custom-Devotional] Project #${projectId} processing failed:`, err);
      writeLog(sessionId, "render", `❌ Project #${projectId} தோல்வி: ${err.message || err}`, "error", deityName, projectId);
    });

    return NextResponse.json({
      success: true,
      message: "Marundeeswarar Temple Shorts queue started",
      projectId,
      sessionId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Custom Devotional Shorts API error" },
      { status: 500 }
    );
  }
}
