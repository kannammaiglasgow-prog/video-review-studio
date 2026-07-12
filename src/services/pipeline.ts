import fs from "node:fs/promises";
import path from "node:path";
import { database } from "@/lib/database";
import { config, type OutputLanguage } from "@/lib/config";
import { createVideoMetadata, geminiReviewProvider, geminiSpeechProvider } from "./providers/gemini";
import { alignSceneCount, localTitleFromText, resolveSceneKeywords } from "./providers/keywords";
import { downloadScenedStockMedia } from "./providers/stock-media";
import { fetchNewsArticle } from "./providers/news";
import { piperSpeechProvider } from "./providers/piper";
import { selectTranscriptSegment, youtubeTranscriptProvider } from "./providers/transcript";
import { probeAudioDuration } from "./render/ffprobe";
import { renderVideo, requiredClipCount } from "./render/ffmpeg";

export const PIPELINE_STAGES = ["transcript", "analysis", "script", "tts", "stock-media", "render", "complete"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ReviewBrief = {
  transcript: string; stance: string; tone: string; persona: string; duration: string; customInstruction?: string;
  sourceType?: "youtube" | "news" | "text" | "voiceover"; sourceTitle?: string; outputLanguage: OutputLanguage;
};

// Voice-over முடிந்த பிறகே video முடிய வேண்டும் — requested duration-ல் voice-ஐ வெட்டக்கூடாது
const AUDIO_TAIL_SECONDS = 2;

async function finalRenderDuration(requestedDuration: string, audioPath: string, ignoreRequestedDuration = false) {
  const audioSeconds = await probeAudioDuration(audioPath);
  if (ignoreRequestedDuration) return audioSeconds + AUDIO_TAIL_SECONDS;
  return Math.max(durationToSeconds(requestedDuration), audioSeconds + AUDIO_TAIL_SECONDS);
}

export const AUTO_DURATION_LABEL = "ஆட்டோ — voice முடியும் வரை";

export function durationToSeconds(duration: string) {
  const durations: Record<string, number> = { "15 விநாடிகள்": 15, "30 விநாடிகள்": 30, "60 விநாடிகள்": 60, "2 நிமிடங்கள்": 120, "5 நிமிடங்கள்": 300, "8 நிமிடங்கள்": 480, "10 நிமிடங்கள்": 600 };
  return durations[duration] || 60;
}

const languageNames: Record<OutputLanguage, string> = { ta: "Tamil", en: "English", hi: "Hindi" };
const wordsPerSecond: Record<OutputLanguage, [number, number]> = { ta: [1.9, 2.1], en: [2.3, 2.6], hi: [2.0, 2.3] };

export function buildReviewPrompt(brief: ReviewBrief) {
  const isAuto = brief.duration === AUTO_DURATION_LABEL;
  const seconds = durationToSeconds(brief.duration);
  const [minWps, maxWps] = wordsPerSecond[brief.outputLanguage];
  const minimumWords = Math.round(seconds * minWps);
  const maximumWords = Math.round(seconds * maxWps);
  const language = languageNames[brief.outputLanguage];
  const isNews = brief.sourceType === "news";
  const intro = isNews
    ? `கீழே உள்ள செய்தி கட்டுரையை ஆய்வு செய்து ${language} news video voice-over script உருவாக்கவும்.${brief.sourceTitle ? `\nசெய்தி தலைப்பு: ${brief.sourceTitle}` : ""}`
    : brief.sourceType === "text"
    ? `கீழே உள்ள உரையை அடிப்படையாகக் கொண்டு ${language} video voice-over script உருவாக்கவும்.`
    : `கீழே உள்ள transcript-ஐ ஆய்வு செய்து ${language} video review voice-over script உருவாக்கவும்.`;
  const sourceLabel = isNews ? "செய்தி கட்டுரை" : brief.sourceType === "text" ? "உரை" : "Transcript";
  const durationLine = isAuto ? "கால அளவு: ஆட்டோ — video, voice-over பேசி முடியும் வரை நீளும்; கண்டிப்பான கால வரம்பு இல்லை." : `கால அளவு: ${brief.duration} (${seconds} விநாடிகள்)`;
  const lengthInstruction = isAuto
    ? `script இயல்பான, முழுமையான நீளத்தில் இருக்கட்டும் — தேவையற்ற நீட்டிப்பு வேண்டாம், தேவையான அளவு சுருக்கமாகவோ விரிவாகவோ இருக்கலாம் (தோராயமாக ${minimumWords}-${maximumWords} சொற்கள் ஒரு reasonable guide, கண்டிப்பான வரம்பு அல்ல).`
    : `script ${minimumWords} முதல் ${maximumWords} ${language} சொற்கள் வரை கட்டாயம் இருக்க வேண்டும். வாசித்தால் ${seconds} விநாடிகளுக்கு இயல்பாகப் பொருந்த வேண்டும்.`;
  return `${intro}\nநிலைப்பாடு: ${brief.stance}\nTone: ${brief.tone}\nபாத்திரம்: ${brief.persona}\n${durationLine}\nமிக முக்கியம்: script ${language} மொழியில் மட்டும் இருக்க வேண்டும். ${lengthInstruction} தலைப்பு அல்லது இயக்குநர் குறிப்புகளை script-ல் சேர்க்க வேண்டாம்.${isNews ? "\nசெய்தியில் உள்ள உண்மைகளை மாற்றாமல் சொல்லவும்; நிலைப்பாடு நடுநிலை என்றால் கருத்து சேர்க்காமல் செய்தி சுருக்கமாக மட்டும் சொல்லவும்." : ""}\nகூடுதல் வழிமுறை: ${brief.customInstruction || "இல்லை"}\n${sourceLabel}:\n${brief.transcript}`;
}

type ProjectRow = {
  id: number; youtube_url: string; source_type: "youtube" | "news" | "text" | "voiceover"; script_mode: "rewrite" | "as-is";
  start_time: string; end_time: string; stance: string; tone: string; persona: string; voice: string;
  tts_provider: "local" | "gemini" | "upload"; aspect_ratio: "9:16" | "16:9"; duration: string; custom_instruction?: string;
  transcript?: string; audio_path?: string; output_language: OutputLanguage; stock_keywords?: string; allow_gemini_keywords: number;
  tier: "free" | "premium";
};

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
  const projectDir = path.join(config.mediaRoot, String(projectId));
  const isVoiceover = project.source_type === "voiceover";
  const orientation = project.aspect_ratio === "9:16" ? "portrait" : "landscape";
  try {
    let script: string;
    let title: string;
    let audioPath: string;
    let geminiSceneKeywords: string[][] = [];

    if (isVoiceover) {
      updateStatus("script");
      script = (project.transcript || "").trim();
      if (!script) throw new Error("Voice-over script கிடைக்கவில்லை");
      if (!project.audio_path) throw new Error("Voice-over audio file கிடைக்கவில்லை");
      db.prepare("UPDATE projects SET review_script=? WHERE id=?").run(script, projectId);

      updateStatus("tts");
      audioPath = project.audio_path; // ஏற்கனவே upload ஆனது — TTS தேவையில்லை, Gemini call இல்லை
      title = "Voice-over video";
    } else {
      updateStatus("transcript");
      let transcript: string;
      let sourceTitle: string | undefined;
      if (project.source_type === "news") {
        const article = await fetchNewsArticle(project.youtube_url);
        transcript = article.text;
        sourceTitle = article.title;
      } else if (project.source_type === "text") {
        transcript = (project.transcript || "").trim();
        if (!transcript) throw new Error("Paste செய்த உரை கிடைக்கவில்லை");
      } else {
        const source = await youtubeTranscriptProvider.fetch(project.youtube_url);
        transcript = selectTranscriptSegment(source.segments, timeToMs(project.start_time), timeToMs(project.end_time));
        if (!transcript) throw new Error("தேர்ந்தெடுத்த நேரப்பகுதியில் transcript இல்லை");
      }
      db.prepare("UPDATE projects SET transcript=? WHERE id=?").run(transcript, projectId);

      updateStatus("script");
      // Gemini call பண்ணும்போதே, script-ஐ எத்தனை scenes-ஆக பிரிக்கணும் என்ற estimate-ஐயும் அதே call-ல் கேட்டு, extra API call தவிர்க்கிறோம்
      const estimatedSceneCount = requiredClipCount(durationToSeconds(project.duration));
      if (project.tier === "free") {
        // Free tier-ல் Gemini call இல்லை — raw transcript-ஐயே script-ஆக பயன்படுத்தும்
        script = transcript;
        title = localTitleFromText(transcript);
      } else if (project.source_type === "text" && project.script_mode === "as-is") {
        const metadata = await createVideoMetadata(transcript, project.output_language, estimatedSceneCount);
        script = transcript;
        title = metadata.title;
        geminiSceneKeywords = metadata.sceneKeywords || [];
      } else {
        const review = await geminiReviewProvider.createTamilScript(buildReviewPrompt({ transcript, stance: project.stance, tone: project.tone, persona: project.persona, duration: project.duration, customInstruction: project.custom_instruction, sourceType: project.source_type, sourceTitle, outputLanguage: project.output_language }), estimatedSceneCount);
        script = review.script;
        title = review.title;
        geminiSceneKeywords = review.sceneKeywords || [];
      }
      db.prepare("UPDATE projects SET review_script=? WHERE id=?").run(script, projectId);

      updateStatus("tts");
      await fs.mkdir(projectDir, { recursive: true });
      audioPath = path.join(projectDir, "voiceover.wav");
      const speechProvider = project.tts_provider === "gemini" ? geminiSpeechProvider : piperSpeechProvider;
      await speechProvider.synthesize(script, audioPath, project.voice, project.output_language);
      db.prepare("UPDATE projects SET audio_path=? WHERE id=?").run(audioPath, projectId);
    }

    updateStatus("stock-media");
    await fs.mkdir(projectDir, { recursive: true });
    const targetDuration = await finalRenderDuration(project.duration, audioPath, isVoiceover || project.duration === AUTO_DURATION_LABEL);
    const requiredClips = requiredClipCount(targetDuration);
    // ஒவ்வொரு 3-வினாடி scene-க்கும் அப்போது பேசப்படும் விஷயத்துக்கே பொருத்தமான தனி clip தேடி assign செய்யும் — positional-ஆக இல்லை
    const { sceneSearchTerms } = await resolveSceneKeywords({
      script, language: project.output_language, sceneCount: requiredClips, customKeywords: project.stock_keywords,
      allowGemini: project.tier !== "free" && (isVoiceover ? Boolean(project.allow_gemini_keywords) : true),
      geminiSceneKeywords,
    });
    const { files: clipPaths, assets } = await downloadScenedStockMedia(sceneSearchTerms, orientation, path.join(projectDir, "stock"));
    db.prepare("UPDATE render_jobs SET stage='render',progress=70,payload=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(JSON.stringify({ title, sceneSearchTerms, assets }), projectId);
    if (clipPaths.length < requiredClips) throw new Error(`${requiredClips} தனித்தனி copyright-safe clips தேவை; ${clipPaths.length} மட்டும் download ஆனது`);

    updateStatus("render");
    const outputPath = path.join(projectDir, `review-${project.aspect_ratio.replace(":", "x")}.mp4`);
    const rendered = await renderVideo({ aspectRatio: project.aspect_ratio, audioPath, clips: clipPaths, outputPath, targetDuration });
    db.prepare("UPDATE projects SET output_path=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(outputPath, projectId);
    db.prepare("UPDATE render_jobs SET stage='complete',progress=100,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(projectId);
    return { projectId, status: "complete", title, assetCount: clipPaths.length, audioPath, outputPath: rendered.outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing தோல்வியடைந்தது";
    db.prepare("UPDATE projects SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, projectId);
    db.prepare("UPDATE render_jobs SET stage='failed',error_message=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(message, projectId);
    throw error;
  }
}

export async function stockClipPaths(projectId: number) {
  const stockDir = path.join(config.mediaRoot, String(projectId), "stock");
  const files = await fs.readdir(stockDir).catch(() => [] as string[]);
  return files
    .filter((file) => /^stock-\d+\.(mp4|jpe?g|png|webp)$/i.test(file))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((file) => path.join(stockDir, file));
}

export async function rerenderProject(projectId: number) {
  const db = database();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project) throw new Error("Project கிடைக்கவில்லை");
  if (!project.audio_path) throw new Error("Voiceover இல்லை — முதலில் video-ஐ முழுமையாக உருவாக்கவும்");
  let clipPaths = await stockClipPaths(projectId);
  const targetDuration = await finalRenderDuration(project.duration, project.audio_path, project.source_type === "voiceover" || project.duration === AUTO_DURATION_LABEL);
  const requiredClips = requiredClipCount(targetDuration);
  if (clipPaths.length < requiredClips) {
    const job = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
    let payload: { title?: string; sceneSearchTerms?: string[][] } = {};
    try { payload = job?.payload ? JSON.parse(job.payload) : {}; } catch { payload = {}; }
    const savedScenes = Array.isArray(payload.sceneSearchTerms) ? payload.sceneSearchTerms : [];
    const sceneSearchTerms = savedScenes.length ? alignSceneCount(savedScenes, requiredClips) : Array.from({ length: requiredClips }, () => [payload.title || "people lifestyle", "technology", "city", "nature"]);
    const { files } = await downloadScenedStockMedia(sceneSearchTerms, project.aspect_ratio === "9:16" ? "portrait" : "landscape", path.join(config.mediaRoot, String(projectId), "stock"));
    clipPaths = files;
  }
  if (clipPaths.length < requiredClips) throw new Error(`${requiredClips} தனித்தனி clips தேவை; ${clipPaths.length} மட்டும் கிடைத்தது`);
  db.prepare("UPDATE projects SET status='render',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(projectId);
  try {
    const outputPath = path.join(config.mediaRoot, String(projectId), `review-${project.aspect_ratio.replace(":", "x")}.mp4`);
    await renderVideo({ aspectRatio: project.aspect_ratio, audioPath: project.audio_path, clips: clipPaths, outputPath, targetDuration });
    db.prepare("UPDATE projects SET output_path=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(outputPath, projectId);
    return { projectId, status: "complete", clipCount: clipPaths.length, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render தோல்வியடைந்தது";
    db.prepare("UPDATE projects SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, projectId);
    throw error;
  }
}
