import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { validateProject } from "@/lib/validation";
import { config } from "@/lib/config";
import { detectAudioType, audioExtension } from "@/lib/audio";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { projectMediaDir } from "@/lib/thumbnails";
import { estimateProjectCost } from "@/lib/cost-estimator";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const MIN_AUDIO_SECONDS = 0.5;
const MAX_AUDIO_SECONDS = 20 * 60;

function insertProject(input: ReturnType<typeof validateProject>) {
  const db = database();
  const cost = estimateProjectCost({
    sourceType: input.sourceType,
    sourceText: input.sourceText || "",
    duration: input.duration,
    ttsProvider: input.ttsProvider,
    tier: input.tier,
    allowGeminiKeywords: input.allowGeminiKeywords
  });
  const estimatedCost = cost.estimatedCost;

  const insert = db.prepare(`INSERT INTO projects
    (youtube_url,source_type,script_mode,transcript,start_time,end_time,stance,tone,persona,voice,tts_provider,aspect_ratio,duration,custom_instruction,output_language,stock_keywords,allow_gemini_keywords,tier,video_style,status,estimated_cost,cta_enabled,cta_position,local_folder_id,b_roll_source,split_shorts_enabled,auto_approve)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const project = insert.run(
      input.url, input.sourceType, input.scriptMode, input.sourceType === "text" || input.sourceType === "voiceover" || input.sourceType === "local_folder" ? input.sourceText || null : null,
      input.startTime, input.endTime, input.stance, input.tone, input.persona, input.voice, input.ttsProvider, input.format, input.duration,
      input.customInstruction || null, input.outputLanguage, input.stockKeywords || null, input.allowGeminiKeywords ? 1 : 0, input.tier, input.videoStyle, "queued",
      estimatedCost, input.ctaEnabled ? 1 : 0, input.ctaPosition,
      input.localFolderId || null, input.bRollSource || "stock",
      input.splitShortsEnabled ? 1 : 0, input.autoApprove ? 1 : 0
    );
    const projectId = Number(project.lastInsertRowid);
    db.prepare("INSERT INTO render_jobs (project_id,stage,payload) VALUES (?,?,?)").run(projectId, "transcript", JSON.stringify({ sourceLanguage: "auto", outputLanguage: input.outputLanguage }));
    db.exec("COMMIT");
    return projectId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function handleVoiceoverUpload(formData: FormData) {
  const fields: Record<string, unknown> = {};
  for (const key of ["sourceType", "sourceText", "format", "outputLanguage", "stockKeywords", "allowGeminiKeywords", "tier", "videoStyle", "ctaEnabled", "ctaPosition", "localFolderId", "bRollSource", "autoApprove"]) {
    const value = formData.get(key);
    if (typeof value === "string") fields[key] = value;
  }
  const input = validateProject(fields);

  const file = formData.get("audio");
  if (!(file instanceof File)) throw new Error("Voice-over audio file தேவை");
  if (file.size > MAX_AUDIO_BYTES) throw new Error(`Audio file ${MAX_AUDIO_BYTES / (1024 * 1024)}MB-க்கு குறைவாக இருக்க வேண்டும்`);
  const data = Buffer.from(await file.arrayBuffer());
  const audioType = detectAudioType(data);
  if (!audioType) throw new Error("உண்மையான WAV/MP3/M4A/OGG/FLAC audio file மட்டும் upload செய்யலாம்");

  await fsp.mkdir(config.mediaRoot, { recursive: true });
  const stagingPath = path.join(config.mediaRoot, `.staging-${Date.now()}-${Math.random().toString(36).slice(2)}${audioExtension(audioType)}`);
  await fsp.writeFile(stagingPath, data);

  let duration: number;
  try {
    duration = await probeAudioDuration(stagingPath);
  } catch {
    await fsp.rm(stagingPath, { force: true });
    throw new Error("Audio file-ஐ படிக்க முடியவில்லை — சேதமடைந்ததாக இருக்கலாம்");
  }
  if (duration < MIN_AUDIO_SECONDS || duration > MAX_AUDIO_SECONDS) {
    await fsp.rm(stagingPath, { force: true });
    throw new Error(`Audio ${MIN_AUDIO_SECONDS} விநாடிகள் முதல் ${MAX_AUDIO_SECONDS / 60} நிமிடங்கள் வரை இருக்க வேண்டும்`);
  }

  let projectId: number;
  try {
    projectId = insertProject(input);
  } catch (error) {
    await fsp.rm(stagingPath, { force: true });
    throw error;
  }

  const projectDir = projectMediaDir(projectId);
  await fsp.mkdir(projectDir, { recursive: true });
  const finalPath = path.join(projectDir, `voiceover-upload${audioExtension(audioType)}`);
  await fsp.rename(stagingPath, finalPath);
  database().prepare("UPDATE projects SET audio_path=? WHERE id=?").run(finalPath, projectId);

  return projectId;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let projectId: number;
    if (contentType.includes("multipart/form-data")) {
      projectId = await handleVoiceoverUpload(await request.formData());
    } else {
      const body = await request.json();
      const input = validateProject(body);
      projectId = insertProject(input);

      if (body.sourceImage && typeof body.sourceImage === "string") {
        const match = body.sourceImage.match(/^data:image\/(\w+);base64,(.+)$/);
        const base64Data = match ? match[2] : body.sourceImage;
        const buffer = Buffer.from(base64Data, "base64");

        const projectDir = projectMediaDir(projectId);
        await fsp.mkdir(projectDir, { recursive: true });
        await fsp.writeFile(path.join(projectDir, "source_image.png"), buffer);
      }
    }
    return NextResponse.json({ id: projectId, status: "queued" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "திட்டத்தை உருவாக்க முடியவில்லை" }, { status: 400 });
  }
}

export async function GET() {
  const rows = database().prepare("SELECT * FROM projects ORDER BY id DESC LIMIT 50").all();
  return NextResponse.json({ projects: rows });
}
