import path from "node:path";
import fsp from "node:fs/promises";
import { updateStoryProject } from "@/lib/database";
import type { OutputLanguage } from "@/lib/config";
import { geminiSpeechProvider } from "@/services/providers/gemini";
import { edgeSpeechProvider } from "@/services/providers/edge-tts";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { expandScriptForDuration, generateSceneBreakdown } from "@/services/story/generator";
import { downloadScenedStockMedia } from "@/services/providers/stock-media";

export type StoryPipelineParams = {
  story: string;
  durationSeconds: number;
  voice: string;
  aspectRatio: "16:9" | "9:16";
  language: OutputLanguage;
  ttsMode: "free" | "paid";
  localize: boolean;
  mediaDir: string;
};

/** Script → scenes → TTS narration → copyright-free stock media, fully automatic.
 * Shared by the manual create route (POST /api/sivan-arul/story-to-video) and the
 * Idea Engine automation (services/personal/auto-story.ts) — same project record,
 * same steps, just a different origin for the initial `story` text. Any failure
 * is recorded on the project itself (status='failed') rather than thrown, since
 * both callers run this in the background after already responding/logging. */
export async function runStoryGenerationPipeline(projectId: number, params: StoryPipelineParams): Promise<void> {
  const { story, durationSeconds, voice, aspectRatio, language, ttsMode, localize, mediaDir } = params;
  try {
    const script = await expandScriptForDuration(story, durationSeconds, projectId, language, localize);
    updateStoryProject(projectId, { script, status: "writing_scenes" });

    const scenes = await generateSceneBreakdown(script, durationSeconds, projectId, language);
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

    // Auto-fetch copyright-free video/images (Pexels/Pixabay) per scene so
    // the video is ready with no manual step. Fully automatic.
    try {
      const orientation = aspectRatio === "9:16" ? "portrait" : "landscape";
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
    } catch (stockError) {
      updateStoryProject(projectId, {
        status: "script_ready",
        error_message: `Stock media fetch பிழை: ${stockError instanceof Error ? stockError.message : String(stockError)}`,
      });
    }
  } catch (error) {
    updateStoryProject(projectId, { status: "failed", error_message: error instanceof Error ? error.message : String(error) });
  }
}
