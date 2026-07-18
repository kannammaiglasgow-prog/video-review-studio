import { spawn } from "node:child_process";
import { config } from "@/lib/config";

export async function probeAudioDuration(filePath: string): Promise<number> {
  const output = await new Promise<string>((resolve, reject) => {
    const args = ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath];
    const child = spawn(config.ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(new Error(`ffprobe தொடங்கவில்லை: ${error.message}`)));
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-800)}`))));
  });
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Audio duration கண்டறிய முடியவில்லை — file சேதமடைந்திருக்கலாம்");
  return duration;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export async function probeVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const output = await new Promise<string>((resolve, reject) => {
    const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,duration,bit_rate", "-of", "json", filePath];
    const child = spawn(config.ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(new Error(`ffprobe தொடங்கவில்லை: ${error.message}`)));
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-800)}`))));
  });
  
  const parsed = JSON.parse(output);
  const stream = parsed?.streams?.[0];
  if (!stream) {
    throw new Error("வீடியோ ஸ்ட்ரீம் கண்டறியப்படவில்லை");
  }
  
  const width = Number(stream.width) || 1920;
  const height = Number(stream.height) || 1080;
  const duration = Number(stream.duration) || 0;
  
  let fps = 30;
  if (stream.avg_frame_rate) {
    const [num, den] = stream.avg_frame_rate.split("/").map(Number);
    if (num && den) fps = num / den;
  }
  
  const bitrate = Number(stream.bit_rate) || 0;
  
  return { duration, width, height, fps, bitrate };
}
