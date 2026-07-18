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
    const templeName = typeof body.templeName === "string" ? body.templeName.trim() : "";
    const storyDetails = typeof body.storyDetails === "string" ? body.storyDetails.trim() : "";
    const privacyStatus = ["public", "unlisted", "private"].includes(body.privacyStatus) ? body.privacyStatus : "private";

    if (templeName.length < 3) return NextResponse.json({ error: "கோவில்/தெய்வம் பெயரைக் குறிப்பிடவும்" }, { status: 400 });
    if (storyDetails.length < 20) return NextResponse.json({ error: "குறைந்தது 20 எழுத்துகள் கொண்ட புராணக் கதை விவரத்தை எழுதவும்" }, { status: 400 });

    const sessionId = `legend-shorts-${Date.now()}`;

    const customInstruction = `கீழே கொடுக்கப்பட்டுள்ள புராணக் கதை/வரலாற்றுத் தகவலை அடிப்படையாகக் கொண்டு, "${templeName}" பற்றிய 45-60 விநாடிகள் ஓடக்கூடிய பக்தி/புராணக் கதை தமிழ் YouTube Shorts ஸ்கிரிப்ட் ஒன்றை எழுதவும்.
வடிவமைப்பு வழிமுறைகள்:
1. முதல் வரியே ஒரு ஆர்வமூட்டும் கேள்வி அல்லது வியப்பூட்டும் தகவலாக இருக்க வேண்டும் (hook).
2. கதையை காலவரிசைப்படி, தெளிவாகவும் பக்தி உணர்வோடும் விவரிக்க வேண்டும்.
3. கடைசியில் "இந்த தெய்வத்தை/கோவிலை பிடிக்கும்னா ஒரு லைக் பண்ணுங்க" போன்ற ஒரு இயல்பான CTA வரியுடன் முடிக்க வேண்டும்.
4. வரலாற்று/புராண உண்மைகளை மாற்றாமல் சொல்லவும்.

புராணக் கதை விவரம்:
${storyDetails}`;

    const db = database();
    const settings = db.prepare("SELECT selected_voice FROM auto_devotional_settings LIMIT 1").get() as { selected_voice: string } | undefined;
    const voice = typeof body.voice === "string" && body.voice ? body.voice : settings?.selected_voice || "parler-jaya";

    const insert = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time,
        stance, tone, persona, voice, tts_provider,
        aspect_ratio, duration, transcript, output_language, status, custom_instruction, video_style,
        tier, cta_enabled, cta_position, b_roll_source, split_shorts_enabled, auto_approve
      ) VALUES ('', 'text', 'rewrite', '00:00', '00:00', 'spiritual', 'Calm, peaceful, and confident', 'Devotional Guide', ?, 'gemini', '9:16', '60 விநாடிகள்', ?, 'ta', 'queued', ?, 'devotional', 'premium', 0, 'end', 'stock', 0, 1)
    `);

    const result = insert.run(voice, templeName, customInstruction);
    const projectId = Number(result.lastInsertRowid);

    writeLog(sessionId, "start", `🛕 புராணக் கதை Shorts — "${templeName}" வீடியோ தயாரிப்பு தொடங்குகிறது...`, "running", templeName, projectId);
    writeLog(sessionId, "project", `📝 Project #${projectId} உருவாக்கப்பட்டது`, "running", templeName, projectId);
    writeLog(sessionId, "script", `✍️ Gemini AI தமிழ் புராணக் கதை ஸ்கிரிப்ட் எழுதுகிறது...`, "running", templeName, projectId);

    (async () => {
      const pipelineResult = await processProject(projectId);
      const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;

      if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
        throw new Error(`Video file missing for project #${projectId}`);
      }

      try {
        writeLog(sessionId, "thumbnail", `🎨 Video Thumbnail generate ஆகிறது...`, "running", templeName, projectId);
        await generateAutoThumbnail({
          projectId,
          keyword: "hindu temple ancient statue",
          title: templeName,
          footerText: "சிவன் அருள்  |  புராணக் கதைகள்",
          aspectRatio: "9:16"
        });
      } catch (thumbErr: any) {
        console.error("Thumbnail generation failed:", thumbErr);
      }

      writeLog(sessionId, "upload", `📤 "${templeName}" புராணக் கதை Shorts YouTube-ல் அப்லோடு செய்யப்படுகிறது (${privacyStatus})...`, "running", templeName, projectId);
      const ytResult = await uploadToYoutube({
        filePath: path.resolve(row.output_path),
        title: `${templeName} — புராணக் கதை #shorts`,
        description: `${templeName} தொடர்பான பக்தி புராணக் கதை.\n\n#sivanarul #devotional #templehistory #tamilshorts #puranam`,
        tags: ["devotional", "sivanarul", "templehistory", "tamilshorts", "puranam"],
        privacyStatus
      }, "devotional");

      writeLog(sessionId, "upload", `✅ YouTube upload வெற்றி! ID: ${ytResult.videoId}`, "done", templeName, projectId);

      const thumb = thumbnailPath(projectId);
      if (thumb && fs.existsSync(thumb)) {
        try {
          await setYoutubeThumbnail(ytResult.videoId, thumb, "devotional");
        } catch (tErr) {
          console.error("Failed to set thumbnail:", tErr);
        }
      }

      writeLog(sessionId, "complete", `🎉 "${templeName}" புராணக் கதை வீடியோ முழுமையாக தயாராகியது! Video ID: ${ytResult.videoId}`, "done", templeName, projectId);
    })().catch(err => {
      console.error(`[Legend-Shorts] Project #${projectId} processing failed:`, err);
      writeLog(sessionId, "render", `❌ Project #${projectId} தோல்வி: ${err.message || err}`, "error", templeName, projectId);
    });

    return NextResponse.json({
      success: true,
      message: "Temple Legend Shorts queue started",
      projectId,
      sessionId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Legend Shorts API error" },
      { status: 500 }
    );
  }
}
