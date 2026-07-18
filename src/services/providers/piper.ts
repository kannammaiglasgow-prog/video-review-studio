import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { config, type OutputLanguage } from "@/lib/config";
import type { SpeechProvider } from "./types";

const languageNames: Record<OutputLanguage, string> = { ta: "Tamil", en: "English", hi: "Hindi" };

const voiceDownloadPaths: Record<string, { onnx: string; json: string }> = {
  "ta_IN-rasa_female-medium": {
    onnx: "https://huggingface.co/tinisoft/piper-ta_IN-rasa_female-medium/resolve/main/ta_IN-rasa_female-medium.onnx",
    json: "https://huggingface.co/tinisoft/piper-ta_IN-rasa_female-medium/resolve/main/ta_IN-rasa_female-medium.onnx.json"
  },
  "ta_IN-rasa_male-medium": {
    onnx: "https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx",
    json: "https://huggingface.co/tinisoft/piper-ta_IN-rasa_male-medium/resolve/main/ta_IN-rasa_male-medium.onnx.json"
  }
};

async function downloadVoiceFile(url: string, destPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  if (!response.body) throw new Error("Response body is empty");
  
  const fileStream = fs.createWriteStream(destPath);
  const nodeReadable = Readable.fromWeb(response.body as any);
  nodeReadable.pipe(fileStream);
  await finished(fileStream);
}

// Split long text paragraphs into clean sentences with newlines
// This instructs Piper CLI to synthesize sentence-by-sentence, which preserves premium voice quality
// for long scripts (e.g. 40s to 60s) and prevents metallic/degraded sound at the end.
function splitIntoSentences(text: string): string {
  const chunks = text.split(/([.!?]+)/);
  const sentences: string[] = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const content = (chunks[i] || "").trim();
    const punct = (chunks[i + 1] || "").trim();
    if (content) {
      sentences.push(content + punct);
    }
  }
  return sentences.join("\n");
}

export const piperSpeechProvider: SpeechProvider = {
  async synthesize(text, outputPath, voice, language = "ta") {
    // Determine the ONNX model file name
    let voiceKey: string | undefined = voice;
    if (language === "ta") {
      // Default to Rasa female if not a valid Tamil option
      if (voiceKey !== "ta_IN-rasa_female-medium" && voiceKey !== "ta_IN-rasa_male-medium") {
        voiceKey = "ta_IN-rasa_female-medium";
      }
    } else {
      voiceKey = undefined; // Use config language defaults for non-Tamil languages
    }

    const modelDir = path.resolve(process.cwd(), "models/piper");
    await fs.promises.mkdir(modelDir, { recursive: true });

    let modelPath = voiceKey ? path.join(modelDir, `${voiceKey}.onnx`) : config.piper.models[language];
    let configPath = `${modelPath}.json`;

    // Trigger auto-download if files are missing
    if (voiceKey && (!fs.existsSync(modelPath) || !fs.existsSync(configPath))) {
      console.log(`Downloading missing Piper voice model: ${voiceKey}...`);
      const downloads = voiceDownloadPaths[voiceKey];
      if (downloads) {
        try {
          await downloadVoiceFile(downloads.onnx, modelPath);
          await downloadVoiceFile(downloads.json, configPath);
          console.log(`✓ Completed downloading: ${voiceKey}`);
        } catch (err) {
          throw new Error(
            `TTS குரல் கோப்பு டவுன்லோட் செய்ய முடியவில்லை: ${err instanceof Error ? err.message : String(err)}.\n\n` +
            `மன்னிக்கவும், Hugging Face-ன் பாதுகாப்பு காரணமாக தானியங்கி பதிவிறக்கம் தடுக்கப்பட்டுள்ளது. ` +
            `கீழே உள்ள இரண்டு லிங்க்குகளையும் தனித்தனியாக பிரவுசரில் திறந்து டவுன்லோட் செய்யவும்:\n\n` +
            `Model File (.onnx):\n` +
            `${downloads.onnx}?download=true\n` +
            `Config File (.json):\n` +
            `${downloads.json}?download=true\n\n` +
            `இவற்றை கணினியில் "${path.relative(process.cwd(), modelDir)}" என்ற கோப்பிற்குள் (Folder) போடுங்கள்.`
          );
        }
      } else {
        throw new Error(`No download links registered for voice: ${voiceKey}`);
      }
    }

    if (!fs.existsSync(config.piper.executablePath)) {
      throw new Error("Local Piper TTS நிறுவப்படவில்லை. .venv-local-tts environment-ஐ சரிபார்க்கவும்");
    }
    if (!fs.existsSync(modelPath)) {
      throw new Error(`${languageNames[language]} Piper voice model கிடைக்கவில்லை. models/piper folder-ல் model files-ஐச் சேர்க்கவும்`);
    }

    const tempTextFile = `${outputPath}.txt`;
    try {
      const cleanText = typeof text.toWellFormed === "function" ? text.toWellFormed() : text;
      // Split into sentences so that Piper processes each sentence as a separate clear utterance!
      const formattedText = splitIntoSentences(cleanText);
      fs.writeFileSync(tempTextFile, formattedText, "utf8");
    } catch (err) {
      throw new Error(`Temp file script write failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    await new Promise<void>((resolve, reject) => {
      const args = [
        "--model", modelPath,
        "--output_file", outputPath,
      ];
      
      // Tamil rasa voice models slow down to a natural, premium speaking pace.
      if (language === "ta") {
        args.push("--length_scale", "1.12");
      } else {
        args.push("--length_scale", "1.02");
      }

      const child = spawn(config.piper.executablePath, args, {
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe"],
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
      let errors = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.on("error", (error) => {
        try { fs.unlinkSync(tempTextFile); } catch {}
        reject(new Error(`Piper TTS தொடங்கவில்லை: ${error.message}`));
      });
      child.on("close", (code) => {
        try { fs.unlinkSync(tempTextFile); } catch {}
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(`Piper TTS தோல்வி${errors.trim() ? `: ${errors.trim()}` : ""}`));
      });
      
      child.stdin.on("error", () => undefined);
      
      const fileStream = fs.createReadStream(tempTextFile);
      fileStream.pipe(child.stdin);
    });
  },
};
