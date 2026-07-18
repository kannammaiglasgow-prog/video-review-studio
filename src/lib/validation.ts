import type { OutputLanguage } from "@/lib/config";

export type SourceType = "youtube" | "news" | "text" | "voiceover" | "local_folder";
export type ScriptMode = "rewrite" | "as-is";
export type TtsProvider = "local" | "gemini" | "upload";
export type Tier = "free" | "premium";
export type { OutputLanguage };

export type ProjectInput = {
  url: string; sourceType: SourceType; scriptMode: ScriptMode; sourceText?: string; startTime: string; endTime: string;
  stance: string; tone: string; persona: string; voice: string; ttsProvider: TtsProvider; format: string; duration: string; customInstruction?: string;
  outputLanguage: OutputLanguage; stockKeywords?: string; allowGeminiKeywords: boolean; tier: Tier; videoStyle: string;
  ctaEnabled: boolean; ctaPosition: string;
  localFolderId?: number;
  bRollSource?: "stock" | "personal" | "mix";
  hasImage?: boolean;
  splitShortsEnabled: boolean;
  autoApprove: boolean;
};

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

function parseOutputLanguage(value: unknown): OutputLanguage {
  return value === "en" ? "en" : value === "hi" ? "hi" : "ta";
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function parseTier(value: unknown): Tier {
  return value === "premium" ? "premium" : "free";
}

export function validateProject(value: unknown): ProjectInput {
  if (!value || typeof value !== "object") throw new Error("தவறான request");
  const input = value as Record<string, unknown>;
  const sourceType: SourceType = 
    input.sourceType === "news" ? "news" : 
    input.sourceType === "text" ? "text" : 
    input.sourceType === "voiceover" ? "voiceover" : 
    input.sourceType === "local_folder" ? "local_folder" : "youtube";
  const scriptMode: ScriptMode = input.scriptMode === "as-is" ? "as-is" : "rewrite";
  const outputLanguage = parseOutputLanguage(input.outputLanguage);
  const tier = parseTier(input.tier);
  const allowGeminiKeywords = tier === "free" ? false : parseBoolean(input.allowGeminiKeywords);
  const stockKeywords = typeof input.stockKeywords === "string" && input.stockKeywords.trim() ? input.stockKeywords.trim() : undefined;
  const videoStyle = typeof input.videoStyle === "string" && input.videoStyle.trim() ? input.videoStyle.trim() : "documentary";
  const ctaEnabled = parseBoolean(input.ctaEnabled);
  const ctaPosition = typeof input.ctaPosition === "string" ? input.ctaPosition.trim() : "end";
  const bRollSource: "stock" | "personal" | "mix" = input.bRollSource === "personal" ? "personal" : input.bRollSource === "mix" ? "mix" : "stock";
  const localFolderId = typeof input.localFolderId === "number" ? input.localFolderId : typeof input.localFolderId === "string" ? Number(input.localFolderId) : undefined;
  const hasImage = parseBoolean(input.hasImage);
  const splitShortsEnabled = parseBoolean(input.splitShortsEnabled);
  const autoApprove = parseBoolean(input.autoApprove);

  if (sourceType === "voiceover") {
    const sourceText = typeof input.sourceText === "string" ? input.sourceText.trim() : "";
    if (sourceText.length < 5) throw new Error("Voice-over-க்கான script-ஐ paste செய்யவும்");
    if (!["9:16", "16:9"].includes(String(input.format))) throw new Error("தவறான video வடிவம்");
    return {
      url: "voiceover:upload", sourceType, scriptMode: "as-is", sourceText, startTime: "00:00", endTime: "00:00",
      stance: "நடுநிலை", tone: "இயல்பான", persona: "யூடியூபர்", voice: "", ttsProvider: "upload",
      format: String(input.format), duration: "", customInstruction: undefined,
      outputLanguage, stockKeywords, allowGeminiKeywords, tier, videoStyle,
      ctaEnabled, ctaPosition, bRollSource, localFolderId, hasImage, splitShortsEnabled, autoApprove
    };
  }

  const ttsProvider: TtsProvider = tier === "free" ? "local" : input.ttsProvider === "gemini" ? "gemini" : "local";
  const required = ["stance", "tone", "persona", "voice", "format", "duration"];
  if (sourceType !== "text" && sourceType !== "local_folder") required.push("url");
  if (sourceType === "youtube") required.push("startTime", "endTime");
  for (const key of required) if (typeof input[key] !== "string" || !input[key]) throw new Error(`${key} தேவை`);

  if (sourceType === "local_folder") {
    const sourceText = typeof input.sourceText === "string" ? input.sourceText.trim() : "";
    if (!hasImage && sourceText.length < 10) throw new Error("குறைந்தது 10 எழுத்துகள் கொண்ட story prompt-ஐ எழுதவும்");
    return {
      url: "local_folder:scanned", sourceType, scriptMode, ttsProvider, sourceText, startTime: "00:00", endTime: "00:00",
      stance: String(input.stance), tone: String(input.tone), persona: String(input.persona), voice: String(input.voice),
      format: String(input.format), duration: String(input.duration), customInstruction: typeof input.customInstruction === "string" ? input.customInstruction : undefined,
      outputLanguage, stockKeywords, allowGeminiKeywords, tier, videoStyle, ctaEnabled, ctaPosition, bRollSource, localFolderId, hasImage, splitShortsEnabled, autoApprove
    };
  }

  if (sourceType === "text") {
    const sourceText = typeof input.sourceText === "string" ? input.sourceText.trim() : "";
    if (!hasImage && sourceText.length < 30) throw new Error("குறைந்தது 30 எழுத்துகள் கொண்ட உரையை paste செய்யவும்");
    return { ...(input as Omit<ProjectInput, "sourceType" | "scriptMode" | "ttsProvider" | "url" | "startTime" | "endTime" | "outputLanguage" | "stockKeywords" | "allowGeminiKeywords" | "tier" | "videoStyle" | "ctaEnabled" | "ctaPosition" | "bRollSource" | "localFolderId" | "hasImage" | "splitShortsEnabled" | "autoApprove">), sourceType, scriptMode, ttsProvider, sourceText, url: "text:pasted", startTime: "00:00", endTime: "00:00", outputLanguage, stockKeywords, allowGeminiKeywords, tier, videoStyle, ctaEnabled, ctaPosition, bRollSource, localFolderId, hasImage, splitShortsEnabled, autoApprove };
  }

  let url: URL;
  try { url = new URL(String(input.url)); } catch { throw new Error(sourceType === "news" ? "சரியான news URL கொடுக்கவும்" : "சரியான YouTube URL கொடுக்கவும்"); }
  if (sourceType === "youtube" && !youtubeHosts.has(url.hostname)) throw new Error("YouTube URL மட்டும் பயன்படுத்தவும்");
  if (sourceType === "news") {
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("http/https URL மட்டும் பயன்படுத்தவும்");
    if (youtubeHosts.has(url.hostname)) throw new Error("News mode-ல் YouTube URL வேண்டாம் — YouTube mode-ஐ பயன்படுத்தவும்");
  }
  if (!["9:16", "16:9"].includes(String(input.format))) throw new Error("தவறான video வடிவம்");
  return { ...(input as Omit<ProjectInput, "sourceType" | "scriptMode" | "ttsProvider" | "outputLanguage" | "stockKeywords" | "allowGeminiKeywords" | "tier" | "videoStyle" | "ctaEnabled" | "ctaPosition" | "bRollSource" | "localFolderId" | "splitShortsEnabled" | "autoApprove">), sourceType, scriptMode, ttsProvider, startTime: String(input.startTime || "00:00"), endTime: String(input.endTime || "00:00"), outputLanguage, stockKeywords, allowGeminiKeywords, tier, videoStyle, ctaEnabled, ctaPosition, bRollSource, localFolderId, splitShortsEnabled, autoApprove };
}
