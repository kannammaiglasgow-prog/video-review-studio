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
