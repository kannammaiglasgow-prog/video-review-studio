import fs from "node:fs";
import path from "node:path";
import fsp from "node:fs/promises";
import { config } from "@/lib/config";
import { getStoryProject, updateStoryProject, type StoryScene } from "@/lib/database";
import type { OutputLanguage } from "@/lib/config";
import { geminiSpeechProvider } from "@/services/providers/gemini";
import { edgeSpeechProvider } from "@/services/providers/edge-tts";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { expandScriptForDuration, generateSceneBreakdown } from "@/services/story/generator";
import { downloadScenedStockMedia } from "@/services/providers/stock-media";
import { downloadScenedAIMedia } from "@/services/providers/pollinations";
import { renderVideo, type SceneClip } from "@/services/render/ffmpeg";

export type StoryPipelineParams = {
  story: string;
  durationSeconds: number;
  voice: string;
  aspectRatio: "16:9" | "9:16";
  language: OutputLanguage;
  ttsMode: "free" | "paid";
  localize: boolean;
  mediaDir: string;
  // "stock" = free Pexels/Pixabay footage (default, most reliable); "ai" = free
  // Pollinations/Flux image generated per scene from its own detailed prompt.
  mediaSource?: "stock" | "ai";
};

/** Script → scenes → TTS narration → copyright-free stock media, fully automatic.
 * Shared by the manual create route (POST /api/sivan-arul/story-to-video) and the
 * Idea Engine automation (services/personal/auto-story.ts) — same project record,
 * same steps, just a different origin for the initial `story` text. Any failure
 * is recorded on the project itself (status='failed') rather than thrown, since
 * both callers run this in the background after already responding/logging. */
export async function runStoryGenerationPipeline(projectId: number, params: StoryPipelineParams): Promise<void> {
  const { story, durationSeconds, voice, aspectRatio, language, ttsMode, localize, mediaDir, mediaSource = "stock" } = params;
  try {
    const script = await expandScriptForDuration(story, durationSeconds, projectId, language, localize);
    updateStoryProject(projectId, { script, status: "writing_scenes" });

    // AI-generated images are paced/rate-limited (free Pollinations endpoint —
    // see downloadScenedAIMedia), so an "ai" project uses fewer, longer-held
    // scenes (~18s each via Ken Burns pan/zoom) instead of stock's 6s/scene —
    // a 3-minute video needs ~10 AI images instead of ~30, cutting generation
    // time roughly 3x. Visually this is a normal held-image style, not a
    // quality compromise.
    const secondsPerScene = mediaSource === "ai" ? 18 : 6;
    const scenes = await generateSceneBreakdown(script, durationSeconds, projectId, language, secondsPerScene);
    updateStoryProject(projectId, { scenes_json: JSON.stringify(scenes), status: "generating_audio" });

    const audioPath = path.join(mediaDir, "narration.wav");
    // Free = edge-tts (no cost); Paid = Gemini TTS (records cost to story_projects
    // via storyId=projectId; projectId=undefined avoids the projects-table path).
    const speech = ttsMode === "free" ? edgeSpeechProvider : geminiSpeechProvider;
    await speech.synthesize(script, audioPath, voice, language, undefined, projectId);
    const audioDuration = await probeAudioDuration(audioPath);

    // scene durations-ஐ உண்மையான narration நேரத்துக்கு ஏற்ப rescale செய்யவும்
    const rawTotal = scenes.reduce((sum, scene) => sum + scene.seconds, 0) || audioDuration;
    const scale = audioDuration / rawTotal;
    const rescaledScenes = scenes.map((scene) => ({ ...scene, seconds: scene.seconds * scale }));

    updateStoryProject(projectId, {
      scenes_json: JSON.stringify(rescaledScenes),
      audio_path: audioPath,
      audio_duration: audioDuration,
      status: "fetching_media",
    });

    // Fetch scene media so the video is ready with no manual step. Fully
    // automatic — "stock" pulls free Pexels/Pixabay footage by keyword; "ai"
    // generates a free Pollinations/Flux image per scene from its own prompt.
    try {
      const orientation = aspectRatio === "9:16" ? "portrait" : "landscape";

      if (mediaSource === "ai") {
        const scenePrompts = rescaledScenes.map((s) => s.prompt);
        const { files } = await downloadScenedAIMedia(scenePrompts, orientation, mediaDir);
        const gotAll = files.length > 0 && files.every((f) => f !== null);
        updateStoryProject(projectId, {
          status: "script_ready",
          error_message: gotAll ? null : "சில scenes-க்கு AI image generate ஆகவில்லை — கீழே manual-ஆக upload செய்யவும்",
        });
      } else {
        const sceneSearchTerms = rescaledScenes.map((s) =>
          s.searchTerms?.length ? s.searchTerms : [s.narrationExcerpt || s.prompt].filter(Boolean),
        );
        const { files } = await downloadScenedStockMedia(sceneSearchTerms, orientation, mediaDir);
        // downloadScenedStockMedia writes stock-<i>.<ext>; the render pipeline
        // expects scene_<i>.<ext>, so rename each into place (order = scene index).
        for (let i = 0; i < files.length; i++) {
          const ext = path.extname(files[i]);
          await fsp.rename(files[i], path.join(mediaDir, `scene_${i}${ext}`)).catch(() => {});
        }
        const gotAll = files.length > 0 && files.length === rescaledScenes.length;
        updateStoryProject(projectId, {
          status: "script_ready",
          error_message: gotAll ? null : "சில scenes-க்கு stock media கிடைக்கவில்லை — keywords-ஐ மாற்றவும், அல்லது கீழே manual-ஆக upload செய்யவும்",
        });
      }
    } catch (mediaError) {
      updateStoryProject(projectId, {
        status: "script_ready",
        error_message: `Scene media fetch பிழை: ${mediaError instanceof Error ? mediaError.message : String(mediaError)}`,
      });
    }
  } catch (error) {
    updateStoryProject(projectId, { status: "failed", error_message: error instanceof Error ? error.message : String(error) });
  }
}

const SCENE_MEDIA_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"];

function findScenePath(mediaDir: string, index: number): string | null {
  for (const ext of SCENE_MEDIA_EXTS) {
    const candidate = path.join(mediaDir, `scene_${index}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

type RenderReadiness =
  | { ready: true; audioPath: string; aspectRatio: "16:9" | "9:16"; audioDuration: number | null; bgmEnabled: boolean; animate: boolean; sceneClips: SceneClip[] }
  | { ready: false; error: string };

/** Fast, synchronous-ish check (no FFmpeg) — same "script_ready with every
 * scene's media file present" gate the manual UI uses before "Render Video"
 * becomes clickable. Used by the render API route to return validation errors
 * immediately, and internally by renderStoryVideo. */
function checkStoryReadyToRender(projectId: number): RenderReadiness {
  const row = getStoryProject(projectId);
  if (!row) return { ready: false, error: "Project கிடைக்கவில்லை" };
  if (!row.audio_path || !fs.existsSync(row.audio_path)) return { ready: false, error: "Narration audio இன்னும் தயாராகவில்லை" };

  const scenes: StoryScene[] = row.scenes_json ? JSON.parse(row.scenes_json) : [];
  if (scenes.length === 0) return { ready: false, error: "Scenes இல்லை" };

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  const sceneClips: SceneClip[] = [];
  const missing: number[] = [];
  scenes.forEach((scene, index) => {
    const scenePath = findScenePath(mediaDir, index);
    if (!scenePath) { missing.push(index + 1); return; }
    sceneClips.push({ path: scenePath, seconds: scene.seconds });
  });
  if (missing.length > 0) return { ready: false, error: `இந்த scene எண்களுக்கு படங்கள் இல்லை: ${missing.join(", ")}` };

  return {
    ready: true,
    audioPath: row.audio_path,
    aspectRatio: row.aspect_ratio === "9:16" ? "9:16" : "16:9",
    audioDuration: row.audio_duration,
    bgmEnabled: row.bgm_enabled === 1,
    animate: row.animate_enabled !== 0,
    sceneClips,
  };
}

/** FFmpeg render step — extracted from the manual render API route so the Idea
 * Engine automation can call it directly server-side too (no HTTP self-call,
 * and no reliance on the story-to-video page's client-side auto-render effect
 * ever being opened in a browser). Awaits the full render and reports the
 * real outcome — callers that want a fast ack should check
 * `checkStoryReadyToRender`-style validation first and fire this without
 * awaiting, as the manual render route does. */
export async function renderStoryVideo(projectId: number): Promise<{ success: true } | { success: false; error: string }> {
  const check = checkStoryReadyToRender(projectId);
  if (!check.ready) return { success: false, error: check.error };

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  updateStoryProject(projectId, { status: "rendering" });
  try {
    const outputPath = path.join(mediaDir, "output.mp4");
    await renderVideo({
      aspectRatio: check.aspectRatio,
      audioPath: check.audioPath,
      scenes: check.sceneClips,
      outputPath,
      targetDuration: check.audioDuration || check.sceneClips.reduce((sum, scene) => sum + scene.seconds, 0),
      bgmEnabled: check.bgmEnabled,
      animate: check.animate,
    });
    updateStoryProject(projectId, { output_path: outputPath, status: "rendered" });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStoryProject(projectId, { status: "failed", error_message: message });
    return { success: false, error: message };
  }
}

export { checkStoryReadyToRender };
