import fs from "node:fs/promises";
import path from "node:path";
import { database } from "@/lib/database";
import { config, type OutputLanguage, type VideoStyleConfig } from "@/lib/config";
import { recommendTransitions, transitionPresetsMap } from "../../packages/transition-library/src";
import { createVideoMetadata, geminiReviewProvider, geminiSpeechProvider } from "./providers/gemini";
import { alignSceneCount, localTitleFromText, resolveSceneKeywords } from "./providers/keywords";
import { buildScenePlan } from "./providers/sentences";
import { downloadScenedStockMedia, searchStockMedia, downloadApprovedClips, searchStockImages } from "./providers/stock-media";
import { fetchNewsArticle } from "./providers/news";
import { piperSpeechProvider } from "./providers/piper";
import { parlerSpeechProvider } from "./providers/parler";
import { selectTranscriptSegment, youtubeTranscriptProvider } from "./providers/transcript";
import { probeAudioDuration } from "./render/ffprobe";
import { CLIP_DURATION_SECONDS, renderVideo, requiredClipCount, optimizeAudioTrack, runFfmpeg } from "./render/ffmpeg";

export const PIPELINE_STAGES = ["transcript", "analysis", "script", "tts", "stock-media", "render", "complete"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ReviewBrief = {
  transcript: string; stance: string; tone: string; persona: string; duration: string; customInstruction?: string;
  sourceType?: "youtube" | "news" | "text" | "voiceover" | "local_folder"; sourceTitle?: string; outputLanguage: OutputLanguage;
  format?: "9:16" | "16:9"; hasImage?: boolean;
};

// Voice-over முடிந்தவுடன் video முடிய வேண்டும்
const AUDIO_TAIL_SECONDS = 0.5;

async function finalRenderDuration(requestedDuration: string, audioPath: string, ignoreRequestedDuration = false) {
  const audioSeconds = await probeAudioDuration(audioPath);
  return audioSeconds + AUDIO_TAIL_SECONDS;
}

export const AUTO_DURATION_LABEL = "ஆட்டோ — voice முடியும் வரை";

export function durationToSeconds(duration: string) {
  const durations: Record<string, number> = { "15 விநாடிகள்": 15, "30 விநாடிகள்": 30, "60 விநாடிகள்": 60, "2 நிமிடங்கள்": 120, "5 நிமிடங்கள்": 300, "8 நிமிடங்கள்": 480, "10 நிமிடங்கள்": 600 };
  return durations[duration] || 60;
}

const languageNames: Record<OutputLanguage, string> = { ta: "Tamil", en: "English", hi: "Hindi" };
const wordsPerSecond: Record<OutputLanguage, [number, number]> = { ta: [1.9, 2.1], en: [2.3, 2.6], hi: [2.0, 2.3] };

export function buildReviewPrompt(brief: ReviewBrief, styleConfig?: VideoStyleConfig) {
  const isAuto = brief.duration === AUTO_DURATION_LABEL;
  const seconds = durationToSeconds(brief.duration);
  const [minWps, maxWps] = wordsPerSecond[brief.outputLanguage];
  const minimumWords = Math.round(seconds * minWps);
  const maximumWords = Math.round(seconds * maxWps);
  const language = languageNames[brief.outputLanguage];
  const isNews = brief.sourceType === "news";
  const intro = brief.hasImage
    ? `கீழே இணைக்கப்பட்டுள்ள படத்தையும் (Image), அதிலுள்ள விவரங்களையும் ஆய்வு செய்து, அதனடிப்படையில் ${language} video voice-over script உருவாக்கவும்.`
    : isNews
    ? `கீழே உள்ள செய்தி கட்டுரையை ஆய்வு செய்து ${language} news video voice-over script உருவாக்கவும்.${brief.sourceTitle ? `\nசெய்தி தலைப்பு: ${brief.sourceTitle}` : ""}`
    : brief.sourceType === "text"
    ? `கீழே உள்ள உரையை அடிப்படையாகக் கொண்டு ${language} video voice-over script உருவாக்கவும்.`
    : brief.sourceType === "local_folder"
    ? `கீழே உள்ள கதை குறிப்பைக் கொண்டு (Story prompt) ${language} வீடியோ voice-over script உருவாக்கவும்.`
    : `கீழே உள்ள transcript-ஐ ஆய்வு செய்து ${language} video review voice-over script உருவாக்கவும்.`;
  const sourceLabel = brief.hasImage ? "கூடுதல் உரை / குறிப்பு" : isNews ? "செய்தி கட்டுரை" : brief.sourceType === "text" ? "உரை" : brief.sourceType === "local_folder" ? "கதை குறிப்பு" : "Transcript";
  const durationLine = isAuto ? "கால அளவு: ஆட்டோ — video, voice-over பேசி முடியும் வரை நீளும்; கண்டிப்பான கால வரம்பு இல்லை." : `கால அளவு: ${brief.duration} (${seconds} விநாடிகள்)`;
  const lengthInstruction = isAuto
    ? `script இயல்பான, முழுமையான நீளத்தில் இருக்கட்டும் — தேவையற்ற நீட்டிப்பு வேண்டாம், தேவையான அளவு சுருக்கமாகவோ விரிவாகவோ இருக்கலாம் (தோராயமாக ${minimumWords}-${maximumWords} சொற்கள் ஒரு reasonable guide, கண்டிப்பான வரம்பு அல்ல).`
    : `script ${minimumWords} முதல் ${maximumWords} ${language} சொற்கள் வரை கட்டாயம் இருக்க வேண்டும். வாசித்தால் ${seconds} விநாடிகளுக்கு இயல்பாகப் பொருந்த வேண்டும்.`;
  const stylePrompt = styleConfig
    ? `\nவீடியோ தயாரிப்பு பாணி (Video Style): ${styleConfig.name}\nகட்டமைப்பு (Script Structure): ${styleConfig.promptConfig.structure}\nகுரல் ஒலிக்கும் பாணி (Voice Style / Tone): ${styleConfig.promptConfig.tone}\nகாட்சி பாணி (Visual Style / Scene B-roll): ${styleConfig.promptConfig.visualInstructions}`
    : "";
    
  const shortsPrompt = brief.format === "9:16"
    ? `\n\n[Shorts / High-Retention Optimization Rules]:
1. **No Greetings / Intros**: Banned words: "வணக்கம்", "அன்பான", "இன்று நாம்", "இந்த வீடியோவில்", "வரவேற்கிறோம்". Do NOT start with any greeting or channel introduction.
2. **Immediate First-Sentence Hook**: The absolute first sentence must be a high-impact hook (e.g. a shocking fact, a sharp question, or a contradiction) that grabs attention in under 2 seconds.
3. **Seamless Loop (தடையற்ற சுழற்சி)**: The very last sentence of the script must flow naturally and grammatically back into the first sentence, so that when the video restarts, it loops seamlessly.
4. **Action-Oriented Scripting**: Keep sentences punchy and short. Eliminate any filler words.`
    : "";

  const normalizationPrompt = `\n**முக்கியமான உரை ஒழுங்குமுறை (Text Normalization for TTS)**: ஸ்கிரிப்ட்டில் எந்தவொரு ஆங்கில எழுத்துக்களோ (English/Latin characters) அல்லது எண்களோ (digits 0-9) இருக்கக் கூடாது. அனைத்து எண்களும் எழுத்துக்களால் முழுமையாக எழுதப்பட வேண்டும் (எ.கா: '24' என்பதை 'இருபத்தி நான்கு' என்றும், 'UK' என்பதை 'யுகே' என்றும் எழுதவும்).`;

  return `${intro}\nநிலைப்பாடு: ${brief.stance}\nTone: ${brief.tone}\nபாத்திரம்: ${brief.persona}\n${durationLine}${stylePrompt}${shortsPrompt}\nமிக முக்கியம்: script ${language} மொழியில் மட்டும் இருக்க வேண்டும். ${lengthInstruction} தலைப்பு அல்லது இயக்குநர் குறிப்புகளை script-ல் சேர்க்க வேண்டாம்.${isNews ? "\nசெய்தியில் உள்ள உண்மைகளை மாற்றாமல் சொல்லவும்; நிலைப்பாடு நடுநிலை என்றால் கருத்து சேர்க்காமல் செய்தி சுருக்கமாக மட்டும் சொல்லவும்." : ""}${normalizationPrompt}\nகூடுதல் வழிமுறை: ${brief.customInstruction || "இல்லை"}\n${sourceLabel}:\n${brief.transcript}`;
}

type ProjectRow = {
  id: number; youtube_url: string; source_type: "youtube" | "news" | "text" | "voiceover" | "local_folder"; script_mode: "rewrite" | "as-is";
  start_time: string; end_time: string; stance: string; tone: string; persona: string; voice: string;
  tts_provider: "local" | "gemini" | "upload"; aspect_ratio: "9:16" | "16:9"; duration: string; custom_instruction?: string;
  transcript?: string; review_script?: string; audio_path?: string; output_language: OutputLanguage; stock_keywords?: string; allow_gemini_keywords: number;
  tier: "free" | "premium"; video_style: string; status: string;
  cta_enabled: number; cta_position: string;
  split_shorts_enabled?: number;
  auto_approve?: number;
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

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
  const updateStatus = (status: string) => {
    db.prepare("UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, projectId);
    try {
      const logRow = db.prepare("SELECT session_id, region FROM auto_news_logs WHERE project_id = ? LIMIT 1").get(projectId) as { session_id: string; region: string | null } | undefined;
      if (logRow) {
        const stepMessages: Record<string, string> = {
          "script": "✍️ Gemini AI தமிழ் ஸ்கிரிப்ட் எழுதுகிறது...",
          "tts": "🎤 தமிழ் குரல் (Parler-TTS) உருவாகிறது...",
          "stock-media": "🎬 வீடியோவிற்கான காட்சித் தொகுப்புகள் (B-Roll) தேடுகிறது...",
          "render": "🎞️ வீடியோவை அசெம்பிள் செய்து Render செய்கிறது..."
        };
        const msg = stepMessages[status];
        if (msg) {
          db.prepare(
            "INSERT INTO auto_news_logs (session_id, project_id, region, step, message, status) VALUES (?, ?, ?, ?, ?, ?)"
          ).run(logRow.session_id, projectId, logRow.region, status, msg, "running");
        }
      }
    } catch {}
  };
  const projectDir = path.join(config.mediaRoot, String(projectId));
  const isVoiceover = project.source_type === "voiceover";
  const orientation = project.aspect_ratio === "9:16" ? "portrait" : "landscape";
  try {
    let styleConfig: VideoStyleConfig | undefined = undefined;
    try {
      const stylePath = path.resolve(process.cwd(), "data/styles", `${project.video_style || "documentary"}.json`);
      const styleData = await fs.readFile(stylePath, "utf8");
      styleConfig = JSON.parse(styleData);
    } catch {
      styleConfig = {
        id: "documentary",
        name: "Documentary",
        icon: "🎥",
        description: "Documentary style",
        exampleUseCases: [],
        estimatedViewerRetention: "85%",
        promptConfig: {
          structure: "Hook -> Problem -> Background -> Facts -> Evidence -> Story -> Conclusion -> CTA",
          tone: "Calm, professional, and confident",
          visualInstructions: "Professional documentary footage, slow zooms, drone shots."
        },
        renderConfig: {
          cameraMotions: ["Zoom In", "Zoom Out", "Pan Left", "Pan Right", "Static"],
          transitions: ["fade", "cross_dissolve"],
          musicEmotion: "suspense"
        }
      };
    }

    if (project.status === "queued") {
      if (isVoiceover) {
        const script = (project.transcript || "").trim();
        if (!script) throw new Error("Voice-over script கிடைக்கவில்லை");
        if (!project.audio_path) throw new Error("Voice-over audio file கிடைக்கவில்லை");
        db.prepare("UPDATE projects SET review_script=?, status='script_approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(script, projectId);
        return processProject(projectId);
      } else {
        updateStatus("transcript");
        let transcript: string;
        let sourceTitle: string | undefined;
        if (project.source_type === "news") {
          const article = await fetchNewsArticle(project.youtube_url);
          transcript = article.text;
          sourceTitle = article.title;
        } else if (project.source_type === "text" || project.source_type === "local_folder") {
          transcript = (project.transcript || "").trim();
          const imagePath = path.join(projectDir, "source_image.png");
          let hasImage = false;
          try {
            const stats = await fs.stat(imagePath);
            hasImage = stats.isFile();
          } catch {}
          if (!transcript && !hasImage) throw new Error("உரை அல்லது கதை குறிப்பு கிடைக்கவில்லை");
        } else {
          const source = await youtubeTranscriptProvider.fetch(project.youtube_url);
          transcript = selectTranscriptSegment(source.segments, timeToMs(project.start_time), timeToMs(project.end_time));
          if (!transcript) throw new Error("தேர்ந்தெடுத்த நேரப்பகுதியில் transcript இல்லை");
        }
        db.prepare("UPDATE projects SET transcript=? WHERE id=?").run(transcript, projectId);

        updateStatus("script");
        const estimatedSceneCount = requiredClipCount(durationToSeconds(project.duration));
        let script: string;
        let title: string;
        let geminiSceneKeywords: string[][] = [];

        if (project.tier === "free") {
          script = transcript;
          title = localTitleFromText(transcript);
        } else if (project.source_type === "text" && project.script_mode === "as-is") {
          const metadata = await createVideoMetadata(transcript, project.output_language, estimatedSceneCount, styleConfig, projectId);
          script = transcript;
          title = metadata.title;
          geminiSceneKeywords = metadata.sceneKeywords || [];
        } else {
          const imagePath = path.join(projectDir, "source_image.png");
          let image: { mimeType: string; data: string } | undefined = undefined;
          let hasImage = false;
          try {
            const stats = await fs.stat(imagePath);
            if (stats.isFile()) {
              const buf = await fs.readFile(imagePath);
              image = {
                mimeType: "image/png",
                data: buf.toString("base64")
              };
              hasImage = true;
            }
          } catch {}

          const review = await geminiReviewProvider.createTamilScript(
            buildReviewPrompt({
              transcript,
              stance: project.stance,
              tone: project.tone,
              persona: project.persona,
              duration: project.duration,
              customInstruction: project.custom_instruction,
              sourceType: project.source_type,
              sourceTitle,
              outputLanguage: project.output_language,
              format: project.aspect_ratio,
              hasImage
            }, styleConfig),
            estimatedSceneCount,
            projectId,
            image
          );
          script = review.script;
          title = review.title;
          geminiSceneKeywords = review.sceneKeywords || [];
        }

        if (project.auto_approve === 1) {
          db.prepare("UPDATE projects SET review_script=?, status='script_approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(script, projectId);
          db.prepare("INSERT OR REPLACE INTO render_jobs (project_id, stage, progress, payload, created_at, updated_at) VALUES (?, 'script_ready', 30, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(projectId, JSON.stringify({ title, geminiSceneKeywords }));
          return processProject(projectId);
        } else {
          db.prepare("UPDATE projects SET review_script=?, status='awaiting_script_approval', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(script, projectId);
          db.prepare("UPDATE render_jobs SET stage='script_ready', progress=30, payload=?, updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(JSON.stringify({ title, geminiSceneKeywords }), projectId);
          return { projectId, status: "awaiting_script_approval", title, script };
        }
      }
    }

    if (project.status === "script_approved") {
      const script = (project.review_script || "").trim();
      if (!script) throw new Error("Review script கிடைக்கவில்லை");

      updateStatus("tts");
      await fs.mkdir(projectDir, { recursive: true });
      const audioPath = isVoiceover ? project.audio_path! : path.join(projectDir, "voiceover.wav");
      if (!isVoiceover) {
        let speechProvider = project.tts_provider === "gemini" ? geminiSpeechProvider : piperSpeechProvider;
        if (project.tts_provider !== "gemini" && project.output_language === "ta") {
          speechProvider = parlerSpeechProvider;
        }
        try {
          await speechProvider.synthesize(script, audioPath, project.voice, project.output_language, projectId);
        } catch (ttsErr) {
          if (speechProvider === parlerSpeechProvider) {
            console.warn("⚠️ Parler-TTS synthesis failed. Falling back to Piper Speech Provider:", ttsErr);
            speechProvider = piperSpeechProvider;
            await speechProvider.synthesize(script, audioPath, project.voice, project.output_language, projectId);
          } else {
            throw ttsErr;
          }
        }
        
        // Post-process the audio track to remove initial silence and speed up for short-form
        const tempAudioPath = path.join(projectDir, "voiceover_raw.wav");
        await fs.rename(audioPath, tempAudioPath);
        const isShortForm = project.aspect_ratio === "9:16";
        try {
          await optimizeAudioTrack(tempAudioPath, audioPath, isShortForm);
          await fs.unlink(tempAudioPath).catch(() => undefined);
        } catch (err) {
          console.error("Audio post-processing failed, falling back to raw audio", err);
          await fs.rename(tempAudioPath, audioPath).catch(() => undefined);
        }

        db.prepare("UPDATE projects SET audio_path=? WHERE id=?").run(audioPath, projectId);
      }

      const targetDuration = await finalRenderDuration(project.duration, audioPath, isVoiceover || project.duration === AUTO_DURATION_LABEL);
      const scenePlan = buildScenePlan(script, targetDuration, CLIP_DURATION_SECONDS);

      let title = "Video Review";
      let geminiSceneKeywords: string[][] = [];
      const renderJob = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
      if (renderJob?.payload) {
        try {
          const parsed = JSON.parse(renderJob.payload);
          if (parsed.title) title = parsed.title;
          if (Array.isArray(parsed.geminiSceneKeywords)) geminiSceneKeywords = parsed.geminiSceneKeywords;
        } catch { /* ignore */ }
      }

      const { sceneSearchTerms } = await resolveSceneKeywords({
        script, scenePlan, language: project.output_language, customKeywords: project.stock_keywords,
        allowGemini: project.tier !== "free" && (isVoiceover ? Boolean(project.allow_gemini_keywords) : true),
        geminiSceneKeywords,
        projectId,
      });

      updateStatus("stock-media");
      const scenes: any[] = [];
      const usedAssetKeys = new Set<string>();
      const assetKey = (asset: any) => `${asset.provider}:${asset.kind || "video"}:${asset.id}`;

      for (let i = 0; i < scenePlan.length; i++) {
        const terms = sceneSearchTerms[i]?.length ? sceneSearchTerms[i] : ["people lifestyle", "technology", "nature"];
        
        const suggestions: any[] = await searchStockMedia(
          terms,
          orientation,
          15,
          (project as any).b_roll_source || "stock",
          (project as any).local_folder_id || undefined
        ).catch(() => []);
        
        let chosen = null;
        const shuffledSuggestions = shuffleArray(suggestions);
        for (const asset of shuffledSuggestions) {
          const key = assetKey(asset);
          if (!usedAssetKeys.has(key)) {
            chosen = asset;
            usedAssetKeys.add(key);
            break;
          }
        }
        
        // Fallback: search images if candidates are exhausted
        if (!chosen) {
          for (const term of terms) {
            const images = await searchStockImages(term, orientation, 20).catch(() => []);
            const shuffledImages = shuffleArray(images);
            for (const image of shuffledImages) {
              const key = assetKey(image);
              if (!usedAssetKeys.has(key)) {
                chosen = image;
                usedAssetKeys.add(key);
                suggestions.push(image);
                break;
              }
            }
            if (chosen) break;
          }
        }
        
        // Generic unique image fallback
        if (!chosen) {
          const genericTerms = ["people lifestyle", "city", "technology", "nature", "abstract background"];
          for (const term of genericTerms) {
            const images = await searchStockImages(term, orientation, 20).catch(() => []);
            const shuffledImages = shuffleArray(images);
            for (const image of shuffledImages) {
              const key = assetKey(image);
              if (!usedAssetKeys.has(key)) {
                chosen = image;
                usedAssetKeys.add(key);
                suggestions.push(image);
                break;
              }
            }
            if (chosen) break;
          }
        }

        if (!chosen && suggestions.length > 0) {
          chosen = suggestions[0];
        }

        scenes.push({
          index: i,
          text: scenePlan[i].text,
          seconds: scenePlan[i].seconds,
          keywords: terms,
          chosenAsset: chosen,
          suggestions: suggestions.slice(0, 8)
        });
      }

      const recentTransitionIds: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        if (i < scenes.length - 1) {
          const nextTerms = sceneSearchTerms[i + 1]?.length ? sceneSearchTerms[i + 1] : ["people lifestyle", "technology"];
          const recs = recommendTransitions({
            currentScene: { keywords: scenes[i].keywords },
            nextScene: { keywords: nextTerms },
            videoStyle: project.video_style || "documentary",
            recentTransitionIds
          });
          const defaultRec = recs[0];
          const preset = defaultRec ? transitionPresetsMap.get(defaultRec.transitionId) : undefined;
          scenes[i].transition = {
            id: defaultRec?.transitionId || "cross_dissolve",
            durationFrames: preset?.defaultDurationFrames ?? 15,
            intensity: preset?.defaultIntensity ?? 0.5,
            direction: preset?.supportsDirection ? "left" : undefined
          };
          if (defaultRec) recentTransitionIds.push(defaultRec.transitionId);
        } else {
          scenes[i].transition = null;
        }
      }

      if (project.auto_approve === 1) {
        db.prepare("UPDATE projects SET status='scenes_approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(projectId);
        db.prepare("INSERT OR REPLACE INTO render_jobs (project_id, stage, progress, payload, created_at, updated_at) VALUES (?, 'render', 60, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(projectId, JSON.stringify({ title, targetDuration, audioPath, scenes }));
        return processProject(projectId);
      } else {
        db.prepare("UPDATE projects SET status='awaiting_scenes_approval', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(projectId);
        db.prepare("UPDATE render_jobs SET stage='scenes_ready', progress=60, payload=?, updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(
          JSON.stringify({ title, targetDuration, audioPath, scenes }),
          projectId
        );
        return { projectId, status: "awaiting_scenes_approval", title, scenes };
      }
    }

    if (project.status === "scenes_approved") {
      const renderJob = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
      if (!renderJob || !renderJob.payload) throw new Error("Scene list payload missing");
      const { title, targetDuration, audioPath, scenes } = JSON.parse(renderJob.payload);

      updateStatus("stock-media");
      const clipPaths = await downloadApprovedClips(scenes, orientation, path.join(projectDir, "stock"));

      updateStatus("render");
      const outputPath = path.join(projectDir, `review-${project.aspect_ratio.replace(":", "x")}.mp4`);
      const renderScenes = clipPaths.map((clipPath, index) => ({
        path: clipPath,
        seconds: scenes[index].seconds,
        transition: scenes[index].transition
      }));
      const rendered = await renderVideo({
        aspectRatio: project.aspect_ratio,
        audioPath,
        scenes: renderScenes,
        outputPath,
        targetDuration,
        styleConfig,
        ctaEnabled: Boolean(project.cta_enabled),
        ctaPosition: project.cta_position,
        splitShortsEnabled: Boolean(project.split_shorts_enabled),
        bgmEnabled: project.video_style === "devotional"
      });



      db.prepare("UPDATE projects SET output_path=?, status='complete', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(outputPath, projectId);
      db.prepare("UPDATE render_jobs SET stage='complete', progress=100, updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(projectId);

      return { projectId, status: "complete", title, assetCount: clipPaths.length, audioPath, outputPath: rendered.outputPath };
    }

    return { projectId, status: project.status };
  } catch (error) {
    let subErrors = "";
    if (error instanceof Error && (error as any).cause) {
      const cause = (error as any).cause;
      if (typeof cause === "object") {
        if (Array.isArray(cause.errors)) {
          subErrors = "\nSub-errors:\n" + cause.errors.map((e: any) => `${e.message || String(e)} (${e.code || "no code"})`).join("\n");
        } else {
          subErrors = `\nCause details: ${cause.message || String(cause)} (${cause.code || "no code"})`;
        }
      }
    }
    const message = error instanceof Error 
      ? `${error.message}\n${error.stack || ""}\nCause: ${error.cause ? String(error.cause) : "none"}${subErrors}`
      : "Processing தோல்வியடைந்தது";
    db.prepare("UPDATE projects SET status='failed', error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, projectId);
    db.prepare("UPDATE render_jobs SET stage='failed', error_message=?, attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE project_id=?").run(message, projectId);
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
  const script = (project.review_script || project.transcript || "").trim();
  let clipPaths = await stockClipPaths(projectId);
  const targetDuration = await finalRenderDuration(project.duration, project.audio_path, project.source_type === "voiceover" || project.duration === AUTO_DURATION_LABEL);
  const scenePlan = buildScenePlan(script, targetDuration, CLIP_DURATION_SECONDS);
  const requiredClips = scenePlan.length;
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
    const scenes = clipPaths.map((clipPath, index) => ({ path: clipPath, seconds: scenePlan[index].seconds }));
    await renderVideo({
      aspectRatio: project.aspect_ratio,
      audioPath: project.audio_path,
      scenes,
      outputPath,
      targetDuration,
      splitShortsEnabled: Boolean(project.split_shorts_enabled),
      bgmEnabled: project.video_style === "devotional"
    });
    db.prepare("UPDATE projects SET output_path=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(outputPath, projectId);
    return { projectId, status: "complete", clipCount: clipPaths.length, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render தோல்வியடைந்தது";
    db.prepare("UPDATE projects SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, projectId);
    throw error;
  }
}
