import fs from "node:fs";
import { spawn } from "node:child_process";
import { config } from "@/lib/config";
import type { SpeechProvider } from "./types";

export const piperSpeechProvider: SpeechProvider = {
  async synthesize(text, outputPath) {
    if (!fs.existsSync(config.piper.executablePath)) {
      throw new Error("Local Piper TTS நிறுவப்படவில்லை. .venv-local-tts environment-ஐ சரிபார்க்கவும்");
    }
    if (!fs.existsSync(config.piper.modelPath)) {
      throw new Error("Tamil Piper voice model கிடைக்கவில்லை. models/piper folder-ல் model files-ஐச் சேர்க்கவும்");
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(config.piper.executablePath, [
        "--model", config.piper.modelPath,
        "--output_file", outputPath,
      ], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
      let errors = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.on("error", (error) => reject(new Error(`Piper TTS தொடங்கவில்லை: ${error.message}`)));
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(`Piper TTS தோல்வி${errors.trim() ? `: ${errors.trim()}` : ""}`));
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(text, "utf8");
    });
  },
};
