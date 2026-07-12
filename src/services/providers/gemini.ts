import fs from "node:fs/promises";
import { config } from "@/lib/config";
import type { ReviewProvider, SpeechProvider } from "./types";

const baseUrl = "https://generativelanguage.googleapis.com/v1beta";

function key() {
  if (!config.api.gemini) throw new Error("GEMINI_API_KEY சேர்க்கப்படவில்லை");
  return config.api.gemini;
}

class GeminiApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function geminiRequest(model: string, body: unknown) {
  const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new GeminiApiError(data?.error?.message || `Gemini API ${response.status}`, response.status);
  return data;
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestWithFallback(models: string[], body: unknown) {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await geminiRequest(model, body); }
      catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const retryable = error instanceof GeminiApiError ? [429, 500, 502, 503, 504].includes(error.status) : message.includes("high demand") || message.includes("temporar");
        if (!retryable) break;
        if (attempt < 2) await delay([1500, 4000][attempt]);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini சேவை தற்போது கிடைக்கவில்லை");
}

export const geminiReviewProvider: ReviewProvider = {
  async createTamilScript(prompt) {
    const data = await requestWithFallback(["gemini-3.5-flash", "gemini-2.5-flash"], {
      contents: [{ parts: [{ text: `${prompt}\n\nJSON மட்டும் பதிலளிக்கவும்: {"title":"...","script":"...","searchTerms":["English keyword"]}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
    });
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) throw new Error("Gemini review script திருப்பவில்லை");
    return JSON.parse(text);
  },
};

function pcmToWav(pcm: Buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const voiceMap: Record<string, string> = { "ஆண் — இயல்பான": "Puck", "பெண் — இயல்பான": "Kore", "ஆண் — ஆற்றலான": "Charon", "பெண் — ஆற்றலான": "Aoede", "டிராமாட்டிக்": "Fenrir" };

export const geminiSpeechProvider: SpeechProvider = {
  async synthesize(text, outputPath, voice) {
    const data = await requestWithFallback(["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"], {
      contents: [{ parts: [{ text: `தமிழில் தெளிவாகவும் இயல்பாகவும் வாசிக்கவும்: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceMap[voice] || "Kore" } } } },
    });
    const audio = data?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data?: string } }) => part.inlineData?.data)?.inlineData?.data;
    if (!audio) throw new Error("Gemini TTS audio திருப்பவில்லை");
    await fs.writeFile(outputPath, pcmToWav(Buffer.from(audio, "base64")));
  },
};
