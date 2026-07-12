import type { OutputLanguage } from "@/lib/config";
import { createVideoMetadata } from "./gemini";

// Pexels/Pixabay-க்கு English queries மட்டும் நல்ல results தரும் — local mode-ல் Tamil/Hindi-ஐ English-ஆக மொழிபெயர்க்க முடியாது.
// எனவே scene-per-scene முன்னுரிமை: "|" custom scene groups > Gemini sceneKeywords (Premium) > local English segmentation > flat custom/generic (எல்லா scenes-க்கும் ஒரே terms).
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

// முழு script-லும் அடிக்கடி வரும் content words-ஐ "overall theme"-ஆக எடுத்து, ஒவ்வொரு scene-க்கும் சேர்க்கிறோம் —
// "shark babies" மாதிரி ambiguous scene-local word, theme "shark/ocean" இல்லாம தனியா தேடினால் "puppy" வரலாம். theme சேர்த்தால் அது தவிர்க்கப்படும்.
export function extractThemeWords(script: string, language: OutputLanguage, limit = 4) {
  if (language !== "en") return [] as string[];
  const stop = stopWords.en;
  const words = tokenize(script).map((word) => word.toLowerCase()).filter((word) => word.length > 2 && !stop.has(word));
  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
  const ranked = [...frequency.entries()].sort((a, b) => b[1] - a[1]);
  const repeated = ranked.filter(([, count]) => count >= 2).map(([word]) => word);
  return (repeated.length ? repeated : ranked.map(([word]) => word)).slice(0, limit);
}

export function localTitleFromText(text: string, maxLength = 60) {
  const trimmed = text.trim();
  const firstSentence = trimmed.match(/^.+?[.!?।॥\n]/)?.[0]?.trim();
  const candidate = firstSentence && firstSentence.length <= maxLength ? firstSentence : trimmed.slice(0, maxLength).trim();
  const cleaned = candidate.replace(/[.!?।॥]+$/, "").trim();
  return cleaned.length < trimmed.length ? `${cleaned}…` : cleaned || "Video";
}

export function alignSceneCount<T>(items: T[], count: number): T[] {
  if (!items.length || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => items[index % items.length]);
}

// "temple architecture | election crowd | tamil politics" — ஒவ்வொரு "|" group-உம் ஒரு scene range-க்கு
export function parseSceneGroups(customKeywords: string | undefined): string[][] | null {
  if (!customKeywords || !customKeywords.includes("|")) return null;
  const groups = customKeywords
    .split("|")
    .map((group) => group.split(",").map((term) => term.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
  return groups.length ? groups : null;
}

function distributeGroupsToScenes(groups: string[][], sceneCount: number): string[][] {
  if (!groups.length || sceneCount <= 0) return [];
  const perGroup = Math.ceil(sceneCount / groups.length);
  return Array.from({ length: sceneCount }, (_, index) => groups[Math.min(groups.length - 1, Math.floor(index / perGroup))]);
}

export async function resolveSceneKeywords(options: {
  script: string;
  language: OutputLanguage;
  sceneCount: number;
  customKeywords?: string;
  allowGemini: boolean;
  geminiSceneKeywords?: string[][];
}): Promise<{ sceneSearchTerms: string[][]; source: "custom-scenes" | "gemini" | "local-english" | "custom-flat" | "generic" }> {
  const { sceneCount } = options;

  const sceneGroups = parseSceneGroups(options.customKeywords);
  if (sceneGroups) return { sceneSearchTerms: distributeGroupsToScenes(sceneGroups, sceneCount), source: "custom-scenes" };

  if (options.geminiSceneKeywords?.length) return { sceneSearchTerms: alignSceneCount(options.geminiSceneKeywords, sceneCount), source: "gemini" };

  if (options.language === "en") {
    const themeWords = extractThemeWords(options.script, "en");
    const localScenes = segmentScenes(options.script, sceneCount, "en");
    if (localScenes.some((words) => words.length) || themeWords.length) {
      const sceneSearchTerms = localScenes.map((words) => {
        if (words.length) return [...new Set([...words, ...themeWords])].slice(0, 5);
        return themeWords.length ? themeWords : genericFallback;
      });
      return { sceneSearchTerms, source: "local-english" };
    }
  }

  if (options.allowGemini) {
    try {
      const metadata = await createVideoMetadata(options.script, options.language, sceneCount);
      if (metadata.sceneKeywords?.length) return { sceneSearchTerms: alignSceneCount(metadata.sceneKeywords, sceneCount), source: "gemini" };
      if (metadata.searchTerms?.length) return { sceneSearchTerms: Array.from({ length: sceneCount }, () => metadata.searchTerms), source: "gemini" };
    } catch {
      // Gemini தோல்வியடைந்தால் generic fallback-க்கு தொடரவும் — voiceover mode Gemini இல்லாமல் இயங்க வேண்டும்
    }
  }

  const flat = (options.customKeywords || "").split(/[,\n]/).map((term) => term.trim()).filter(Boolean);
  const terms = flat.length ? flat : genericFallback;
  return { sceneSearchTerms: Array.from({ length: sceneCount }, () => terms), source: flat.length ? "custom-flat" : "generic" };
}
