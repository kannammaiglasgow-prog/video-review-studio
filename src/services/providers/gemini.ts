import fs from "node:fs/promises";
import { config, type OutputLanguage } from "@/lib/config";
import type { ReviewProvider, SpeechProvider } from "./types";

const languageNames: Record<OutputLanguage, string> = { ta: "Tamil", en: "English", hi: "Hindi" };
const readInstruction: Record<OutputLanguage, string> = {
  ta: "தமிழில் தெளிவாகவும் இயல்பாகவும் வாசிக்கவும்",
  en: "Read clearly and naturally in English",
  hi: "स्पष्ट और स्वाभाविक रूप से हिंदी में पढ़ें",
};

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

// Gemini சில நேரம் escape ஆகாத newlines/quotes உடன் invalid JSON அனுப்பும் — படிப்படியாக repair செய்யும்
function escapeControlCharsInStrings(text: string) {
  let output = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString && (char === "\n" || char === "\r" || char === "\t")) {
      output += char === "\n" ? "\\n" : char === "\r" ? "\\r" : "\\t";
      continue;
    }
    if (char === '"') {
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
      if (backslashes % 2 === 0) inString = !inString;
    }
    output += char;
  }
  return output;
}

export function parseGeminiJson<T>(raw: string): T {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        let backslashes = 0;
        for (let cursor = index - 1; cursor >= start && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
        if (backslashes % 2 === 0) inString = !inString;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    if (end > start) text = text.slice(start, end + 1);
  }
  const attempts = [text, text.replace(/,\s*([}\]])/g, "$1"), escapeControlCharsInStrings(text), escapeControlCharsInStrings(text.replace(/,\s*([}\]])/g, "$1"))];
  let lastError: unknown;
  for (const attempt of attempts) {
    try { return JSON.parse(attempt) as T; } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini JSON parse தோல்வி");
}

async function requestJson<T>(models: string[], prompt: string, temperature: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const data = await requestWithFallback(models, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: attempt === 0 ? temperature : 0.3 },
    });
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) { lastError = new Error("Gemini பதில் காலியாக உள்ளது"); continue; }
    try { return parseGeminiJson<T>(text); } catch (error) { lastError = error; }
  }
  throw new Error(`Gemini சரியான JSON திருப்பவில்லை — மீண்டும் முயற்சிக்கவும் (${lastError instanceof Error ? lastError.message : "parse error"})`);
}

export const geminiReviewProvider: ReviewProvider = {
  async createTamilScript(prompt) {
    const result = await requestJson<{ title?: unknown; script?: unknown; searchTerms?: unknown }>(["gemini-3.5-flash", "gemini-2.5-flash"], `${prompt}\n\nJSON மட்டும் பதிலளிக்கவும் (strings-க்குள் newlines-ஐ \\n ஆக escape செய்யவும்): {"title":"...","script":"...","searchTerms":["English keyword"]}`, 0.8);
    const title = typeof result.title === "string" ? result.title.trim() : "";
    const script = typeof result.script === "string" ? result.script.trim() : "";
    const searchTerms = Array.isArray(result.searchTerms) ? result.searchTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0).map((term) => term.trim()).slice(0, 10) : [];
    if (!title || !script) throw new Error("Gemini பதிலில் title அல்லது script இல்லை");
    return { title, script, searchTerms };
  },
};

export async function createVideoMetadata(script: string, language: OutputLanguage = "ta"): Promise<{ title: string; searchTerms: string[] }> {
  const result = await requestJson<{ title?: unknown; searchTerms?: unknown }>(["gemini-3.5-flash", "gemini-2.5-flash"], `கீழே உள்ள ${languageNames[language]} voice-over script-க்கு பொருத்தமான ${languageNames[language]} தலைப்பும், stock video தேட 5 English keywords-உம் மட்டும் கொடுக்கவும் (title script மொழியிலேயே இருக்க வேண்டும், searchTerms எப்போதும் English). Script-ஐ மாற்ற வேண்டாம்.\n\nScript:\n${script}\n\nJSON மட்டும் பதிலளிக்கவும்: {"title":"...","searchTerms":["English keyword"]}`, 0.4);
  const title = typeof result.title === "string" ? result.title.trim() : "";
  const searchTerms = Array.isArray(result.searchTerms) ? result.searchTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0).map((term) => term.trim()).slice(0, 10) : [];
  if (!title) throw new Error("Gemini metadata-ல் title இல்லை");
  return { title, searchTerms };
}

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
  async synthesize(text, outputPath, voice, language = "ta") {
    const data = await requestWithFallback(["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"], {
      contents: [{ parts: [{ text: `${readInstruction[language]}: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceMap[voice] || "Kore" } } } },
    });
    const audio = data?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data?: string } }) => part.inlineData?.data)?.inlineData?.data;
    if (!audio) throw new Error("Gemini TTS audio திருப்பவில்லை");
    await fs.writeFile(outputPath, pcmToWav(Buffer.from(audio, "base64")));
  },
};
