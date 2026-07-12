import fs from "node:fs/promises";
import path from "node:path";
import { database } from "@/lib/database";
import { config } from "@/lib/config";
import { geminiReviewProvider, geminiSpeechProvider } from "./providers/gemini";
import { downloadStockMedia, searchStockMedia } from "./providers/stock-media";
import { selectTranscriptSegment, youtubeTranscriptProvider } from "./providers/transcript";
import { renderVideo } from "./render/ffmpeg";

export const PIPELINE_STAGES = ["transcript", "analysis", "script", "tts", "stock-media", "render", "complete"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ReviewBrief = {
  transcript: string; stance: string; tone: string; persona: string; duration: string; customInstruction?: string;
};

export function durationToSeconds(duration: string) {
  const durations: Record<string, number> = { "15 விநாடிகள்": 15, "30 விநாடிகள்": 30, "60 விநாடிகள்": 60, "2 நிமிடங்கள்": 120, "5 நிமிடங்கள்": 300, "8 நிமிடங்கள்": 480, "10 நிமிடங்கள்": 600 };
  return durations[duration] || 60;
}

export function buildTamilReviewPrompt(brief: ReviewBrief) {
  const seconds = durationToSeconds(brief.duration);
  const minimumWords = Math.round(seconds * 1.9);
  const maximumWords = Math.round(seconds * 2.1);
  return `கீழே உள்ள transcript-ஐ ஆய்வு செய்து தமிழ் video review voice-over script உருவாக்கவும்.\nநிலைப்பாடு: ${brief.stance}\nTone: ${brief.tone}\nபாத்திரம்: ${brief.persona}\nகால அளவு: ${brief.duration} (${seconds} விநாடிகள்)\nமிக முக்கியம்: script ${minimumWords} முதல் ${maximumWords} தமிழ் சொற்கள் வரை கட்டாயம் இருக்க வேண்டும். தலைப்பு அல்லது இயக்குநர் குறிப்புகளை script-ல் சேர்க்க வேண்டாம். வாசித்தால் ${seconds} விநாடிகளுக்கு இயல்பாகப் பொருந்த வேண்டும்.\nகூடுதல் வழிமுறை: ${brief.customInstruction || "இல்லை"}\nTranscript:\n${brief.transcript}`;
}

type ProjectRow = { id: number; youtube_url: string; start_time: string; end_time: string; stance: string; tone: string; persona: string; voice: string; aspect_ratio: "9:16" | "16:9"; duration: string; custom_instruction?: string };

function timeToMs(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error("நேர வடிவம் MM:SS அல்லது HH:MM:SS ஆக இருக்க வேண்டும்");
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds * 1000;
}

export async function processProject(projectId: number) {
  const db = database();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project) throw new Error("Project கிடைக்கவில்லை");
  const updateStatus = (status: string) => db.prepare("UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, projectId);
  try {
    updateStatus("transcript");
    const source = await youtubeTranscriptProvider.fetch(project.youtube_url);
    const transcript = selectTranscriptSegment(source.segments, timeToMs(project.start_time), timeToMs(project.end_time));
    if (!transcript) throw new Error("தேர்ந்தெடுத்த நேரப்பகுதியில் transcript இல்லை");
    db.prepare("UPDATE projects SET transcript=? WHERE id=?").run(transcript, projectId);

    updateStatus("script");
    const review = await geminiReviewProvider.createTamilScript(buildTamilReviewPrompt({ transcript, stance: project.stance, tone: project.tone, persona: project.persona, duration: project.duration, customInstruction: project.custom_instruction }));
    db.prepare("UPDATE projects SET review_script=? WHERE id=?").run(review.script, projectId);

    updateStatus("tts");
    const projectDir = path.join(config.mediaRoot, String(projectId));
    await fs.mkdir(projectDir, { recursive: true });
    const audioPath = path.join(projectDir, "voiceover.wav");
    await geminiSpeechProvider.synthesize(review.script, audioPath, project.voice);
    db.prepare("UPDATE projects SET audio_path=? WHERE id=?").run(audioPath, projectId);

    updateStatus("stock-media");
    const assets = await searchStockMedia(review.searchTerms || [], project.aspect_ratio === "9:16" ? "portrait" : "landscape");
    db.prepare("UPDATE render_jobs SET stage='render',progress=70,payload=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(JSON.stringify({ title: review.title, assets }), projectId);
    const clipPaths = await downloadStockMedia(assets.slice(0, 6), path.join(projectDir, "stock"));
    if (!clipPaths.length) throw new Error("Copyright-safe stock footage கிடைக்கவில்லை");

    updateStatus("render");
    const outputPath = path.join(projectDir, `review-${project.aspect_ratio.replace(":", "x")}.mp4`);
    const rendered = await renderVideo({ aspectRatio: project.aspect_ratio, audioPath, clips: clipPaths, outputPath, targetDuration: durationToSeconds(project.duration) });
    db.prepare("UPDATE projects SET output_path=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(outputPath, projectId);
    db.prepare("UPDATE render_jobs SET stage='complete',progress=100,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(projectId);
    return { projectId, status: "complete", title: review.title, assetCount: clipPaths.length, audioPath, outputPath: rendered.outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing தோல்வியடைந்தது";
    db.prepare("UPDATE projects SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, projectId);
    db.prepare("UPDATE render_jobs SET stage='failed',error_message=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(message, projectId);
    throw error;
  }
}
