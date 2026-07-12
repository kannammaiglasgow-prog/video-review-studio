import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "@/lib/config";

export type RenderSpec = { aspectRatio: "9:16" | "16:9"; audioPath: string; clips: string[]; subtitlePath?: string; outputPath: string; targetDuration: number };

export const CLIP_DURATION_SECONDS = 6;

export function requiredClipCount(duration: number) {
  return Math.max(1, Math.ceil(duration / CLIP_DURATION_SECONDS));
}

export function dimensions(aspectRatio: RenderSpec["aspectRatio"]) {
  return aspectRatio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

export async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let error = "";
    process.stderr.on("data", (chunk) => { error += String(chunk); });
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}: ${error.slice(-1600)}`)));
  });
}

export function wavDuration(filePath: string) {
  const size = fs.statSync(filePath).size;
  return Math.max(1, (size - 44) / (24000 * 2));
}

function concatPath(filePath: string) {
  return filePath.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

export async function renderVideo(spec: RenderSpec) {
  if (!spec.clips.length) throw new Error("Render செய்ய stock footage தேவை");
  const directory = path.dirname(spec.outputPath);
  const workDir = path.join(directory, "render-work");
  await fsp.mkdir(workDir, { recursive: true });
  const { width, height } = dimensions(spec.aspectRatio);
  const audioDuration = wavDuration(spec.audioPath);
  const duration = spec.targetDuration;
  const sceneCount = requiredClipCount(duration);
  if (spec.clips.length < sceneCount) throw new Error(`${sceneCount} தனித்தனி clips தேவை; ${spec.clips.length} மட்டும் கிடைத்தது`);
  const normalized: string[] = [];

  for (let index = 0; index < sceneCount; index += 1) {
    const clipPath = spec.clips[index];
    const sceneDuration = Math.min(CLIP_DURATION_SECONDS, Math.max(0.1, duration - index * CLIP_DURATION_SECONDS));
    const output = path.join(workDir, `scene-${index}.mp4`);
    const isImage = /\.(jpe?g|png|webp)$/i.test(clipPath);
    if (isImage) {
      // Static image-க்கு Ken Burns: பெரிய canvas-ல் scale செய்து மெதுவாக zoom-in
      const frames = Math.round(sceneDuration * 30);
      const baseWidth = Math.round(width * 1.4 / 2) * 2;
      const baseHeight = Math.round(height * 1.4 / 2) * 2;
      await runFfmpeg(["-i", clipPath, "-vf", `scale=${baseWidth}:${baseHeight}:force_original_aspect_ratio=increase,crop=${baseWidth}:${baseHeight},zoompan=z='min(1.0+0.0012*on,1.35)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=30,format=yuv420p`, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", output]);
    } else {
      await runFfmpeg(["-stream_loop", "-1", "-i", clipPath, "-t", sceneDuration.toFixed(3), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", output]);
    }
    normalized.push(output);
  }

  const concatFile = path.join(workDir, "concat.txt");
  await fsp.writeFile(concatFile, normalized.map((file) => `file '${concatPath(file)}'`).join("\n"), "utf8");
  const videoOnly = path.join(workDir, "video.mp4");
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", videoOnly]);

  const args = ["-i", videoOnly, "-i", spec.audioPath, "-t", duration.toFixed(3), "-map", "0:v:0", "-map", "1:a:0", "-af", `apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}`];
  if (spec.subtitlePath) args.push("-vf", `subtitles=${spec.subtitlePath.replaceAll("\\", "/").replace(":", "\\:")}`);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", spec.outputPath);
  await runFfmpeg(args);
  return { outputPath: spec.outputPath, duration, audioDuration, width, height };
}
