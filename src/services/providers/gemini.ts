import fs from "node:fs/promises";
import { config, type OutputLanguage, type VideoStyleConfig } from "@/lib/config";
import type { ReviewProvider, SpeechProvider } from "./types";
import { addProjectActualCost } from "@/lib/database";

function recordGeminiCallCost(projectId: number | undefined, stepName: string, data: any, isAudioOutput = false) {
  if (!projectId) return;
  const promptTokens = data?.usageMetadata?.promptTokenCount || 0;
  const candidatesTokens = data?.usageMetadata?.candidatesTokenCount || 0;
  if (promptTokens === 0 && candidatesTokens === 0) return;

  const inputRate = 0.075 / 1_000_000;
  const outputRate = (isAudioOutput ? 20.00 : 0.30) / 1_000_000;
  const cost = (promptTokens * inputRate) + (candidatesTokens * outputRate);
  addProjectActualCost(projectId, stepName, cost);
}

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

async function requestJson<T>(
  models: string[],
  prompt: string,
  temperature: number,
  projectId?: number,
  stepName?: string,
  image?: { mimeType: string; data: string }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts: any[] = [{ text: prompt }];
    if (image) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }
    const data = await requestWithFallback(models, {
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: attempt === 0 ? temperature : 0.3 },
    });
    if (projectId && stepName) {
      recordGeminiCallCost(projectId, stepName, data);
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) { lastError = new Error("Gemini பதில் காலியாக உள்ளது"); continue; }
    try { return parseGeminiJson<T>(text); } catch (error) { lastError = error; }
  }
  throw new Error(`Gemini சரியான JSON திருப்பவில்லை — மீண்டும் முயற்சிக்கவும் (${lastError instanceof Error ? lastError.message : "parse error"})`);
}

function parseSceneKeywords(value: unknown, sceneCount: number): string[][] {
  if (!Array.isArray(value)) return [];
  const groups = value
    .map((group) => (Array.isArray(group) ? group.filter((term): term is string => typeof term === "string" && term.trim().length > 0).map((term) => term.trim()).slice(0, 4) : []))
    .filter((group) => group.length > 0);
  return groups.slice(0, sceneCount);
}

const sceneKeywordsInstruction = (sceneCount: number) =>
  `,"sceneKeywords":[["keyword1","keyword2"]]} — sceneKeywords-ல் script-ஐ காலவரிசைப்படி சரியாக ${sceneCount} பகுதிகளாக பிரித்து, ஒவ்வொரு பகுதியிலும் அப்போது பேசப்படும் விஷயத்துக்கு பொருத்தமான 2-3 English keywords கொடுக்கவும் (searchTerms-ஐ போலவே stock video தேட ஏற்ற English சொற்கள், script மொழியில் அல்ல). மிக முக்கியம்: ஒவ்வொரு scene-உம் முழு video-வின் பொதுவான தலைப்புடன் பொருந்த வேண்டும் — உதாரணமாக முழு video-வும் கடல் உயிரினங்கள் (underwater/marine life) பற்றி இருந்து, ஒரு பகுதியில் "shark babies" என்று பேசினால், அதற்கான keywords "shark pups underwater" அல்லது "baby shark ocean" போல இருக்க வேண்டும் — "puppy" அல்லது land-animal சம்பந்தமில்லாத keywords கொடுக்கக்கூடாது. ஒவ்வொரு scene-உம் தனித்தனியா யோசிக்காம, முழு video context-ஐ வைத்தே ambiguous வார்த்தைகளை disambiguate செய்யவும். சரியாக ${sceneCount} groups இருக்க வேண்டும்`;

export const geminiReviewProvider: ReviewProvider = {
  async createTamilScript(prompt, sceneCount, projectId?: number, image?: { mimeType: string; data: string }) {
    const result = await requestJson<{ title?: unknown; script?: unknown; searchTerms?: unknown; sceneKeywords?: unknown }>(
      ["gemini-2.5-flash", "gemini-3.1-flash-lite"],
      `${prompt}\n\nJSON மட்டும் பதிலளிக்கவும். மிக முக்கியம்: 'title' மற்றும் 'script' ஆகிய இரண்டுமே தமிழ் மொழியில் மட்டுமே இருக்க வேண்டும் (strings-க்குள் newlines-ஐ \\n ஆக escape செய்யவும்): {"title":"...","script":"...","searchTerms":["English keyword"]${sceneKeywordsInstruction(sceneCount)}`,
      0.8,
      projectId,
      "script",
      image
    );
    const title = typeof result.title === "string" ? result.title.trim() : "";
    const script = typeof result.script === "string" ? result.script.trim() : "";
    const searchTerms = Array.isArray(result.searchTerms) ? result.searchTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0).map((term) => term.trim()).slice(0, 10) : [];
    const sceneKeywords = parseSceneKeywords(result.sceneKeywords, sceneCount);
    if (!title || !script) throw new Error("Gemini பதிலில் title அல்லது script இல்லை");
    return { title, script, searchTerms, sceneKeywords };
  },
};

export async function createVideoMetadata(script: string, language: OutputLanguage = "ta", sceneCount = 1, styleConfig?: VideoStyleConfig, projectId?: number): Promise<{ title: string; searchTerms: string[]; sceneKeywords: string[][] }> {
  const stylePrompt = styleConfig
    ? `\n\nவீடியோ தயாரிப்பு பாணி (Video Style): ${styleConfig.name}\nகாட்சி பாணி (Visual Style / Scene B-roll): ${styleConfig.promptConfig.visualInstructions}`
    : "";
  const result = await requestJson<{ title?: unknown; searchTerms?: unknown; sceneKeywords?: unknown }>(["gemini-3.1-flash-lite", "gemini-2.5-flash"], `கீழே உள்ள ${languageNames[language]} voice-over script-க்கு பொருத்தமான ${languageNames[language]} தலைப்பும், stock video தேட 5 English keywords-உம் மட்டும் கொடுக்கவும் (title script மொழியிலேயே இருக்க வேண்டும், searchTerms எப்போதும் English). Script-ஐ மாற்ற வேண்டாம்.\n\nScript:\n${script}${stylePrompt}\n\nJSON மட்டும் பதிலளிக்கவும்: {"title":"...","searchTerms":["English keyword"]${sceneKeywordsInstruction(sceneCount)}`, 0.4, projectId, "metadata");
  const title = typeof result.title === "string" ? result.title.trim() : "";
  const searchTerms = Array.isArray(result.searchTerms) ? result.searchTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0).map((term) => term.trim()).slice(0, 10) : [];
  const sceneKeywords = parseSceneKeywords(result.sceneKeywords, sceneCount);
  if (!title) throw new Error("Gemini metadata-ல் title இல்லை");
  return { title, searchTerms, sceneKeywords };
}

export async function translateTamilToEnglish(text: string): Promise<string> {
  try {
    const result = await requestJson<{ translation?: unknown }>(
      ["gemini-2.5-flash", "gemini-3.1-flash-lite"],
      `Translate the following Tamil search query into clear, descriptive English keywords for stock video indexing. Return ONLY a JSON object: {"translation": "English keywords translation"}\n\nQuery: "${text}"`,
      0.3
    );
    return typeof result.translation === "string" ? result.translation.trim() : text;
  } catch {
    return text;
  }
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

function splitTextIntoSentences(text: string): string[] {
  const parts = text.split(/([.!?\n]+)/);
  const chunks: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length; i += 2) {
    const textPart = parts[i] || "";
    const punctPart = parts[i + 1] || "";
    const sentence = (textPart + punctPart).trim();
    if (!sentence) continue;
    if (current.length + sentence.length > 200) {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

export const geminiSpeechProvider: SpeechProvider = {
  async synthesize(text, outputPath, voice, language = "ta", projectId?: number) {
    const chunks = splitTextIntoSentences(text);
    const pcmBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const data = await requestWithFallback(["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"], {
        contents: [{ parts: [{ text: `${readInstruction[language]}: ${chunk}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceMap[voice] || "Kore" } } } },
      });
      if (projectId) {
        recordGeminiCallCost(projectId, "tts", data, true);
      }
      const audioBase64 = data?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data?: string } }) => part.inlineData?.data)?.inlineData?.data;
      if (!audioBase64) throw new Error(`Gemini TTS audio text chunk ${i + 1} ஐ திருப்பவில்லை`);
      pcmBuffers.push(Buffer.from(audioBase64, "base64"));
    }

    if (pcmBuffers.length === 0) throw new Error("எந்த audio chunks-உம் உருவாக்கப்படவில்லை");
    const combinedPcm = Buffer.concat(pcmBuffers);
    await fs.writeFile(outputPath, pcmToWav(combinedPcm));
  },
};

export interface ReactionMoment {
  startMs: number;
  endMs: number;
  sourceSpeech?: string;
  commentary: string;
}

export async function generateReactionPlan(
  transcriptText: string,
  outputLanguage: OutputLanguage = "ta",
  tone = "fun",
  persona = "normal",
  projectId?: number
): Promise<{ title: string; highlights: ReactionMoment[]; thumbnailPrompt: string }> {
  const languagePrompt = languageNames[outputLanguage] || "Tamil";
  const prompt = `
      Analyze this YouTube video transcript.
      1. Provide a catchy, high-CTR (Click-Through Rate) title in the target language (${languagePrompt}). 
         Formula: Focus on curiosity, benefits, or urgency (e.g. "யாருக்கெல்லாம் இலவச தங்க மோதிரம் கிடைக்கும்?"). Avoid boring passive titles.
      2. Generate a detailed, highly effective English image generation prompt for a high-CTR YouTube thumbnail ("thumbnailPrompt").
         - Design: Visually compelling, high contrast, clean background, suitable for mobile screens.
         - Instructions: Include visual elements relevant to the topic (e.g., gold coin/ring close-up, dramatic reaction faces, or bold symbolic items). Keep it realistic or stylized, but clear. Avoid any text inside the prompt.
      3. Select 3 to 5 highlights (reaction moments) based on timestamps (in milliseconds, startMs and endMs).
      4. For each highlight, extract the original speaker's speech from the transcript during those timestamps, and return it as "sourceSpeech".
      5. For each highlight, write a reaction/commentary text in ${languagePrompt} as "commentary".
         CRITICAL RETENTION GUIDELINES:
         - **Scene 1 MUST start with a highly engaging Hook**: The very first commentary must act as a hook validating the title/thumbnail click, telling mobile viewers exactly what value they will get within the first 10 seconds.
         - The commentary MUST be a direct, relevant, and contextually matching reply, reaction, or response to what the speaker says in "sourceSpeech".
         - Keep commentaries short and punchy, around 15-30 words, suitable for rapid-paced visual switching (every 3-5 seconds).
         - **CRITICAL TEXT NORMALIZATION FOR LOCAL TTS**: All numbers MUST be written out as words in the target language (e.g., in Tamil, write '24' as 'இருபத்தி நான்கு', '3' as 'மூன்று'). All English abbreviations or names MUST be written in the target language's script (e.g., write 'UK' as 'யுகே', 'US' as 'யுஎஸ்', 'Trump' as 'டிரம்ப்'). There must be absolutely no digits (0-9) or English/Latin characters in the commentary script.
      6. Each commentary script should match the tone: "${tone}" and persona: "${persona}".
      7. Return ONLY a JSON object conforming to this schema:
      {
        "title": "video title",
        "thumbnailPrompt": "English image generation prompt for high-CTR thumbnail",
        "highlights": [
          {
            "startMs": 10000,
            "endMs": 25000,
            "sourceSpeech": "original transcript spoken words",
            "commentary": "commentary script text with hook for the first segment"
          }
        ]
      }

      Transcript:
      ${transcriptText}
    `;

  const result = await requestJson<{ title: string; thumbnailPrompt?: string; highlights: ReactionMoment[] }>(
    ["gemini-2.5-flash", "gemini-3.1-flash-lite"],
    prompt,
    0.7,
    projectId,
    "reaction_plan"
  );

  return {
    title: result.title || "Reaction Video",
    thumbnailPrompt: result.thumbnailPrompt || "High contrast YouTube thumbnail, eye-catching visual, realistic style, highly engaging",
    highlights: Array.isArray(result.highlights) ? result.highlights : []
  };
}
