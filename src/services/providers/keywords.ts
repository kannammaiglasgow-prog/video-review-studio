import type { OutputLanguage } from "@/lib/config";
import { createVideoMetadata } from "./gemini";

// Pexels/Pixabay-க்கு English queries மட்டும் நல்ல results தரும் — local mode-ல் Tamil/Hindi-ஐ English-ஆக மொழிபெயர்க்க முடியாது.
// எனவே: custom English keywords (இருந்தால்) > generic safe English categories > (opt-in) Gemini.
const genericFallback = ["people talking", "city lifestyle", "nature landscape", "technology abstract", "office work"];

const stopWords: Record<OutputLanguage, Set<string>> = {
  ta: new Set([
    "இது", "அது", "இந்த", "அந்த", "என்று", "என்ற", "மற்றும்", "அல்லது", "ஆனால்", "இருந்து", "வரை",
    "என்ன", "எப்படி", "எங்கே", "எப்போது", "யார்", "நான்", "நீங்கள்", "அவர்", "அவள்", "அவர்கள்", "நாம்",
    "ஒரு", "இரண்டு", "மேலும்", "கூட", "தான்", "தான்", "உள்ளது", "இருக்கிறது", "இருந்தது", "செய்ய",
    "செய்து", "என", "போல", "அதன்", "இதன்", "அங்கு", "இங்கு", "மிக", "மிகவும்", "ஆக", "ஆகும்", "இல்லை",
  ]),
  en: new Set([
    "the", "a", "an", "is", "are", "was", "were", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "this", "that", "it", "as", "by", "at", "from", "be", "has", "have", "had", "will",
    "would", "can", "could", "we", "you", "they", "he", "she", "i", "not", "so", "then", "than",
  ]),
  hi: new Set([
    "है", "हैं", "था", "थे", "और", "या", "लेकिन", "का", "की", "के", "में", "पर", "से", "को", "यह",
    "वह", "एक", "भी", "तो", "ही", "कि", "जो", "इस", "उस", "हम", "आप", "वे", "नहीं", "कर", "करना",
    "किया", "होगा", "अपने", "साथ",
  ]),
};

function tokenize(text: string) {
  return text.split(/[\s,.!?;:"'()।॥]+/).map((word) => word.trim()).filter(Boolean);
}

export function segmentScenes(script: string, sceneCount: number, language: OutputLanguage) {
  const words = tokenize(script);
  if (!words.length || sceneCount <= 0) return [] as string[][];
  const perScene = Math.ceil(words.length / sceneCount);
  const scenes: string[][] = [];
  for (let index = 0; index < sceneCount; index += 1) {
    const chunk = words.slice(index * perScene, (index + 1) * perScene);
    const stop = stopWords[language];
    const distinct = [...new Set(chunk.map((word) => word.toLowerCase()).filter((word) => word.length > 1 && !stop.has(word)))];
    scenes.push(distinct.slice(0, 6));
  }
  return scenes;
}

export function localTitleFromText(text: string, maxLength = 60) {
  const trimmed = text.trim();
  const firstSentence = trimmed.match(/^.+?[.!?।॥\n]/)?.[0]?.trim();
  const candidate = firstSentence && firstSentence.length <= maxLength ? firstSentence : trimmed.slice(0, maxLength).trim();
  const cleaned = candidate.replace(/[.!?।॥]+$/, "").trim();
  return cleaned.length < trimmed.length ? `${cleaned}…` : cleaned || "Video";
}

export async function resolveStockKeywords(options: {
  script: string;
  language: OutputLanguage;
  customKeywords?: string;
  allowGemini: boolean;
}): Promise<{ searchTerms: string[]; source: "custom" | "gemini" | "generic" }> {
  const custom = (options.customKeywords || "").split(/[,\n]/).map((term) => term.trim()).filter(Boolean);
  if (custom.length) return { searchTerms: custom.slice(0, 10), source: "custom" };

  if (options.allowGemini) {
    try {
      const metadata = await createVideoMetadata(options.script, options.language);
      if (metadata.searchTerms?.length) return { searchTerms: metadata.searchTerms, source: "gemini" };
    } catch {
      // Gemini தோல்வியடைந்தால் generic fallback-க்கு தொடரவும் — voiceover mode Gemini இல்லாமல் இயங்க வேண்டும்
    }
  }

  return { searchTerms: genericFallback, source: "generic" };
}
