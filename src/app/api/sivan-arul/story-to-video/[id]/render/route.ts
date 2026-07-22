import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { getStoryProject, updateStoryProject, type StoryScene } from "@/lib/database";
import { renderVideo, type SceneClip } from "@/services/render/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 600;

// Stock media can be a video clip, so accept video extensions too — renderVideo
// handles both stills (Ken Burns) and video (stream_loop).
const SCENE_MEDIA_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"];

function findImagePath(mediaDir: string, index: number): string | null {
  for (const ext of SCENE_MEDIA_EXTS) {
    const candidate = path.join(mediaDir, `scene_${index}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });
  if (!row.audio_path || !fs.existsSync(row.audio_path)) return NextResponse.json({ error: "Narration audio இன்னும் தயாராகவில்லை" }, { status: 400 });

  const scenes: StoryScene[] = row.scenes_json ? JSON.parse(row.scenes_json) : [];
  if (scenes.length === 0) return NextResponse.json({ error: "Scenes இல்லை" }, { status: 400 });

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  const sceneClips: SceneClip[] = [];
  const missing: number[] = [];
  scenes.forEach((scene, index) => {
    const imagePath = findImagePath(mediaDir, index);
    if (!imagePath) { missing.push(index + 1); return; }
    sceneClips.push({ path: imagePath, seconds: scene.seconds });
  });

  if (missing.length > 0) {
    return NextResponse.json({ error: `இந்த scene எண்களுக்கு படங்கள் upload செய்யவில்லை: ${missing.join(", ")}` }, { status: 400 });
  }

  updateStoryProject(projectId, { status: "rendering" });

  (async () => {
    try {
      const outputPath = path.join(mediaDir, "output.mp4");
      await renderVideo({
        aspectRatio: row.aspect_ratio === "9:16" ? "9:16" : "16:9",
        audioPath: row.audio_path!,
        scenes: sceneClips,
        outputPath,
        targetDuration: row.audio_duration || sceneClips.reduce((sum, scene) => sum + scene.seconds, 0),
        bgmEnabled: row.bgm_enabled === 1,
        animate: row.animate_enabled !== 0,
      });
      updateStoryProject(projectId, { output_path: outputPath, status: "rendered" });
    } catch (error) {
      updateStoryProject(projectId, { status: "failed", error_message: error instanceof Error ? error.message : String(error) });
    }
  })();

  return NextResponse.json({ success: true });
}
