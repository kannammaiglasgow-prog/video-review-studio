import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { config, type OutputLanguage } from "@/lib/config";
import type { SpeechProvider } from "./types";

// Free, high-quality Microsoft Edge neural voices (no API key, requires the
// `edge-tts` python package + internet). Used as the "free" narration option.
const edgeVoices: Record<OutputLanguage, { female: string; male: string }> = {
  ta: { female: "ta-IN-PallaviNeural", male: "ta-IN-ValluvarNeural" },
  en: { female: "en-US-AriaNeural", male: "en-US-GuyNeural" },
  hi: { female: "hi-IN-SwaraNeural", male: "hi-IN-MadhurNeural" },
};

function pickVoice(voice: string, language: OutputLanguage): string {
  const set = edgeVoices[language] || edgeVoices.ta;
  const isMale = /\bmale\b|ஆண்/i.test(voice || "");
  return isMale ? set.male : set.female;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (chunk) => (err += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-800)}`))));
  });
}

export const edgeSpeechProvider: SpeechProvider = {
  async synthesize(text, outputPath, voice, language = "ta") {
    const chosen = pickVoice(voice, language);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edge-tts-"));
    const txtFile = path.join(tmpDir, "text.txt");
    const mp3File = path.join(tmpDir, "out.mp3");
    try {
      await fs.writeFile(txtFile, text, "utf8");
      await run("python", ["-m", "edge_tts", "--voice", chosen, "--file", txtFile, "--write-media", mp3File]);
      // Convert to WAV so the rest of the pipeline (which expects narration.wav)
      // is consistent with the Gemini path. ffmpeg detects the input by content.
      await run(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", mp3File, outputPath]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
