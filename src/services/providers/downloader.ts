import { spawn } from "node:child_process";
import { config } from "@/lib/config";
import path from "node:path";
import fs from "node:fs/promises";

export async function downloadYoutubeVideo(url: string, outputPath: string): Promise<void> {
  const directory = path.dirname(outputPath);
  await fs.mkdir(directory, { recursive: true });

  // Resolve ffmpeg directory in case we need to merge audio + video streams
  const ffmpegDir = path.dirname(config.ffmpegPath);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "--no-playlist",
      "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
      "--merge-output-format", "mp4",
      "--ffmpeg-location", ffmpegDir,
      "-o", outputPath,
      url
    ];

    console.log(`Running yt-dlp to download video: ${url} -> ${outputPath}`);
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });
    
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    
    child.on("error", (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
    
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp failed with exit code ${code}. Error: ${stderr.slice(-1200) || "Unknown error"}`));
      }
    });
  });
}
