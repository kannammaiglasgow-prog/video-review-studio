import { NextResponse } from "next/server";
import path from "node:path";
import fsp from "node:fs/promises";
import { config } from "@/lib/config";
import { createStoryProject, updateStoryProject } from "@/lib/database";
import { geminiSpeechProvider } from "@/services/providers/gemini";
import { edgeSpeechProvider } from "@/services/providers/edge-tts";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { expandScriptForDuration, generateSceneBreakdown } from "@/services/story/generator";
import { downloadScenedStockMedia } from "@/services/providers/stock-media";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const story = typeof body.story === "string" ? body.story.trim() : "";
    const durationSeconds = Number(body.durationSeconds) || 180;
    const voice = typeof body.voice === "string" && body.voice ? body.voice : "Female — Warm";
    const aspectRatio: "16:9" | "9:16" = body.aspectRatio === "9:16" ? "9:16" : "16:9";
    const bgm = Boolean(body.bgm);
    const animate = body.animate !== false; // default on
    const language: "ta" | "en" = body.language === "en" ? "en" : "ta";
    // Scene media is always copyright-free stock (Pexels/Pixabay) — Google Flow
    // browser-automation has been removed.
    const mediaSource = "stock" as const;
    const ttsMode: "free" | "paid" = body.ttsMode === "free" ? "free" : "paid";
    const localize = Boolean(body.localize);

    if (story.length < 20) return NextResponse.json({ error: "குறைந்தது 20 எழுத்துகள் கொண்ட கதை/செய்தியை பேஸ்ட் செய்யவும்" }, { status: 400 });
    if (durationSeconds < 20 || durationSeconds > 1200) return NextResponse.json({ error: "Duration 20 விநாடி முதல் 20 நிமிடம் வரை மட்டுமே" }, { status: 400 });

    const projectId = createStoryProject(story, Math.round(durationSeconds), voice, { aspectRatio, bgm, animate, language, mediaSource, ttsMode, localize });
    const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
    await fsp.mkdir(mediaDir, { recursive: true });

    (async () => {
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
    })();

    return NextResponse.json({ success: true, projectId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Story-to-video API error" }, { status: 500 });
  }
}
