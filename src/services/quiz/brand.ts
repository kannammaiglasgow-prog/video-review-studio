/** Per-channel identity for the quiz template.
 *
 * The approved GK Tiger design is the shape; this file is everything that
 * changes between channels wearing it — palette, wordmark, language, voice,
 * subject matter and every word that appears on screen or is spoken.
 *
 * GK Tiger's entry reproduces the approved design exactly, so adding channels
 * cannot drift the original. */

import type { ChannelType } from "@/services/providers/youtube";

/** The languages the quiz template ships in. A subset of the repo's
 * OutputLanguage: the template's strings and the story-project record both
 * only cover these two, so the narrower type keeps that honest. */
export type QuizLanguage = "ta" | "en";

export type Palette = {
  bgTop: string; bgMid: string; bgBottom: string;
  bgGlowA: string; bgGlowB: string;

  panelStroke: string;
  cyan: string;        // accent: timer ring, footer rules, "reading" outline
  cyanDeep: string;

  optionTop: string; optionBottom: string; optionStroke: string;
  readingTop: string; readingBottom: string;

  badgeTop: string; badgeBottom: string;

  correctTop: string; correctBottom: string; correctStroke: string;

  cardWhite: string; cardInk: string; factInk: string;

  pillTop: string; pillBottom: string;

  // Wordmark / highlight gold
  accentLight: string; accentMid: string; accentDeep: string;
  highlight: string;

  white: string;
  footer: string;
};

/** The approved GK Tiger palette. Every other channel is expressed as a
 * deviation from it, so the shared design language survives. */
export const BASE_PALETTE: Palette = {
  bgTop: "#1b2ec9",
  bgMid: "#2a1f9e",
  bgBottom: "#7c3aed",
  bgGlowA: "#4f46e5",
  bgGlowB: "#a855f7",

  panelStroke: "#7dd3fc",
  cyan: "#22d3ee",
  cyanDeep: "#0ea5e9",

  optionTop: "#3b46d8",
  optionBottom: "#2a2a9e",
  optionStroke: "#8b93ff",
  readingTop: "#5566ff",
  readingBottom: "#3a3ac4",

  badgeTop: "#8b5cf6",
  badgeBottom: "#6d28d9",

  correctTop: "#2dd4a7",
  correctBottom: "#14b8a6",
  correctStroke: "#5eead4",

  cardWhite: "#ffffff",
  cardInk: "#0b1440",
  factInk: "#1e2352",

  pillTop: "#8b5cf6",
  pillBottom: "#6d28d9",

  accentLight: "#fde68a",
  accentMid: "#f59e0b",
  accentDeep: "#ea8104",
  highlight: "#FFD84D",

  white: "#ffffff",
  footer: "#dbeafe",
};

/** Everything the template writes on screen or says out loud. Kept together so
 * a new language is one object, not a hunt through the components. */
export type QuizStrings = {
  questionPill: (current: number, total: number) => string;
  sec: string;
  correct: string;
  quickFact: string;
  footer: string;

  /** Outro card, two lines each where the design stacks them. */
  outroTitle: [string, string];
  outroPill: string;
  thanks: string;
  shareLines: [string, string];
  followLine: string;

  /** Spoken lines. */
  speakReveal: (letter: string, text: string) => string;
  speakScore: string;
  speakThanks: string;

  cta: {
    like: { spoken: string; heading: string; sub: string };
    subscribe: { spoken: string; heading: string; sub: string };
  };
};

export type QuizBrand = {
  channel: ChannelType;
  /** Human label for the dashboard section. */
  label: string;
  /** Wordmark rendered as two words — the second takes the accent gradient. */
  wordmark: [string, string];
  palette: Palette;
  language: QuizLanguage;
  /** Matches the repo's existing voice labels (see edge-tts pickVoice). */
  voice: string;
  /** edge-tts speaking rate. */
  speechRate: string;
  /** Stretches the fixed animation slots for languages that read slower than
   * the English the timeline was tuned against. */
  paceScale: number;
  /** SVG font stack — Tamil needs an Indic-capable family first. */
  fontStack: string;
  /** Topic pool. Always written in English even for Tamil channels: it steers
   * subject matter and the option-illustration prompts, while `language`
   * decides what the viewer actually reads. */
  categories: readonly string[];
  /** One line telling the question writer who this channel is for. */
  persona: string;
  /** Extra hard rules appended to the question prompt. */
  extraRules: string[];
  /** Cached mascot artwork prompt, generated once per channel. */
  mascotPrompt: string;
  strings: QuizStrings;
};

const EN_STRINGS = (channelName: string): QuizStrings => ({
  questionPill: (c, t) => `QUESTION ${c} / ${t}`,
  sec: "SEC",
  correct: "CORRECT!",
  quickFact: "QUICK FACT",
  footer: "NEW QUIZ EVERY DAY",

  outroTitle: ["How many did", "you get right?"],
  outroPill: "Comment your score below!",
  thanks: "Thanks for watching!",
  shareLines: ["Share this with your", "favourite person in the world"],
  followLine: `FOLLOW ${channelName.toUpperCase()} FOR MORE`,

  speakReveal: (letter, text) => `It's ${letter}. ${text}!`,
  speakScore: "How many did you get right? Comment your score below!",
  speakThanks: "Thanks for watching! Share this with your favourite person in the world.",

  cta: {
    like: { spoken: "If you got that right, tap the like button!", heading: "GOT IT RIGHT?", sub: "TAP LIKE" },
    subscribe: { spoken: "Make sure you subscribe to the channel!", heading: "ENJOYING THIS?", sub: "SUBSCRIBE NOW" },
  },
});

const TA_STRINGS: QuizStrings = {
  questionPill: (c, t) => `கேள்வி ${c} / ${t}`,
  sec: "நொடி",
  correct: "சரி!",
  quickFact: "சுவாரஸ்யம்",
  footer: "தினமும் புதிய வினாடி வினா",

  outroTitle: ["எத்தனை சரியாக", "சொன்னீர்கள்?"],
  outroPill: "உங்கள் மதிப்பெண்ணை கமெண்ட் செய்யுங்கள்!",
  thanks: "பார்த்ததற்கு நன்றி!",
  shareLines: ["இதை உங்களுக்குப் பிடித்த", "நபருக்கு பகிருங்கள்"],
  followLine: "மேலும் பார்க்க FOLLOW செய்யுங்கள்",

  speakReveal: (letter, text) => `சரியான பதில் ${letter}. ${text}!`,
  speakScore: "எத்தனை கேள்விகளுக்கு சரியாக பதில் சொன்னீர்கள்? உங்கள் மதிப்பெண்ணை கீழே கமெண்ட் செய்யுங்கள்!",
  speakThanks: "பார்த்ததற்கு நன்றி! இதை உங்களுக்குப் பிடித்த நபருக்கு பகிருங்கள்.",

  cta: {
    like: { spoken: "சரியாக சொன்னீர்களா? லைக் பட்டனை அழுத்துங்கள்!", heading: "சரியா சொன்னீங்களா?", sub: "LIKE செய்யுங்கள்" },
    subscribe: { spoken: "இந்த சேனலை சப்ஸ்கிரைப் செய்ய மறக்காதீர்கள்!", heading: "பிடிச்சிருக்கா?", sub: "SUBSCRIBE செய்யுங்கள்" },
  },
};

const TAMIL_FONTS = "Nirmala UI, Latha, Arial, Helvetica, sans-serif";
const LATIN_FONTS = "Arial, Helvetica, sans-serif";

/** Shared shape so each channel entry only states what differs. */
function brand(
  channel: ChannelType,
  label: string,
  wordmark: [string, string],
  language: QuizLanguage,
  paletteOverride: Partial<Palette>,
  rest: Pick<QuizBrand, "voice" | "categories" | "persona" | "mascotPrompt"> & { extraRules?: string[] },
): QuizBrand {
  const tamil = language === "ta";
  return {
    channel,
    label,
    wordmark,
    palette: { ...BASE_PALETTE, ...paletteOverride },
    language,
    voice: rest.voice,
    // Tamil neural voices already read briskly; pushing them as hard as the
    // English ones slurs the joined consonants.
    speechRate: tamil ? "+10%" : "+18%",
    paceScale: tamil ? 1.3 : 1,
    fontStack: tamil ? TAMIL_FONTS : LATIN_FONTS,
    categories: rest.categories,
    persona: rest.persona,
    extraRules: rest.extraRules ?? [],
    mascotPrompt: rest.mascotPrompt,
    strings: tamil ? TA_STRINGS : EN_STRINGS(label),
  };
}

const GENERAL_CATEGORIES = [
  "animals and nature", "science", "space", "geography", "history",
  "human body", "food", "technology", "world records", "famous landmarks",
  "mixed general knowledge",
] as const;

export const QUIZ_BRANDS: Record<ChannelType, QuizBrand> = {
  // The approved design, unchanged.
  gktiger: brand("gktiger", "GK Tiger", ["GK", "TIGER"], "en", {}, {
    voice: "Female — Energetic",
    categories: GENERAL_CATEGORIES,
    persona: "a fast-paced English general-knowledge Shorts channel with a broad international audience",
    mascotPrompt:
      "Friendly cartoon tiger head mascot logo, front facing, big happy smile, bold orange and black stripes, white muzzle, thick clean vector outlines, flat vibrant colors, centered, plain solid dark blue background, esports mascot style, no text, no letters",
  }),

  story: brand("story", "Tamil Story", ["தமிழ்", "வினா"], "ta", {
    bgTop: "#7f1d3f", bgMid: "#5b1230", bgBottom: "#b45309",
    bgGlowA: "#be123c", bgGlowB: "#f59e0b",
    optionTop: "#9f1239", optionBottom: "#6b0f2a", optionStroke: "#fda4af",
    readingTop: "#e11d48", readingBottom: "#9f1239",
    badgeTop: "#f59e0b", badgeBottom: "#b45309",
    pillTop: "#be123c", pillBottom: "#881337",
    panelStroke: "#fcd34d", cyan: "#fbbf24", cyanDeep: "#d97706",
    footer: "#fde68a",
  }, {
    voice: "Female — Energetic",
    categories: [
      "Tamil Nadu geography", "Tamil cinema", "Tamil literature and Sangam poetry",
      "Indian history", "famous Indian landmarks", "animals and nature",
      "science", "space", "food and cooking", "mixed general knowledge",
    ],
    persona: "a fast-paced Tamil general-knowledge Shorts channel for a Tamil-speaking audience in India and abroad",
    mascotPrompt:
      "Friendly cartoon storyteller mascot head, warm smile, traditional South Indian look, thick clean vector outlines, flat vibrant maroon and gold colors, centered, plain solid dark maroon background, mascot logo style, no text, no letters",
  }),

  english: brand("english", "English Stories", ["STORY", "QUIZ"], "en", {
    bgTop: "#0f766e", bgMid: "#134e4a", bgBottom: "#1e3a8a",
    bgGlowA: "#0d9488", bgGlowB: "#3b82f6",
    optionTop: "#0e7490", optionBottom: "#134e4a", optionStroke: "#5eead4",
    readingTop: "#14b8a6", readingBottom: "#0f766e",
    badgeTop: "#0891b2", badgeBottom: "#155e75",
    pillTop: "#0891b2", pillBottom: "#155e75",
    correctTop: "#a3e635", correctBottom: "#65a30d", correctStroke: "#d9f99d",
  }, {
    voice: "Female — Warm",
    categories: [
      "world literature", "English words and their origins", "famous authors",
      "history", "geography", "mythology and folklore", "famous landmarks",
      "science", "animals and nature", "mixed general knowledge",
    ],
    persona: "an English storytelling Shorts channel whose viewers love books, words and world stories",
    mascotPrompt:
      "Friendly cartoon owl mascot head wearing small round glasses, front facing, warm smile, thick clean vector outlines, flat vibrant teal and cream colors, centered, plain solid dark teal background, mascot logo style, no text, no letters",
  }),

  food: brand("food", "Food Business", ["FOOD", "QUIZ"], "en", {
    bgTop: "#c2410c", bgMid: "#9a3412", bgBottom: "#b91c1c",
    bgGlowA: "#f97316", bgGlowB: "#ef4444",
    optionTop: "#b45309", optionBottom: "#7c2d12", optionStroke: "#fdba74",
    readingTop: "#f97316", readingBottom: "#c2410c",
    badgeTop: "#dc2626", badgeBottom: "#991b1b",
    pillTop: "#dc2626", pillBottom: "#991b1b",
    panelStroke: "#fed7aa", cyan: "#fbbf24", cyanDeep: "#d97706",
    footer: "#fed7aa",
  }, {
    voice: "Female — Bright",
    categories: [
      "food and cooking", "world cuisines", "ingredients and spices",
      "fruits and vegetables", "drinks and beverages", "food history",
      "kitchen science", "famous dishes", "mixed general knowledge",
    ],
    persona: "a food and cooking Shorts channel for people who love eating, cooking and food trivia",
    mascotPrompt:
      "Friendly cartoon chef mascot head wearing a white chef hat, big happy smile, thick clean vector outlines, flat vibrant orange and red colors, centered, plain solid dark red background, mascot logo style, no text, no letters",
  }),

  devotional: brand("devotional", "Sivan Arul", ["சிவன்", "வினா"], "ta", {
    bgTop: "#4c1d95", bgMid: "#312e81", bgBottom: "#c2410c",
    bgGlowA: "#7c3aed", bgGlowB: "#f97316",
    optionTop: "#5b21b6", optionBottom: "#3730a3", optionStroke: "#c4b5fd",
    readingTop: "#8b5cf6", readingBottom: "#6d28d9",
    badgeTop: "#ea580c", badgeBottom: "#9a3412",
    pillTop: "#7c3aed", pillBottom: "#5b21b6",
    panelStroke: "#fcd34d", cyan: "#fbbf24", cyanDeep: "#d97706",
    footer: "#fde68a",
  }, {
    voice: "Female — Warm",
    categories: [
      "Shiva and Shaivism", "Tamil temples", "Hindu festivals",
      "Puranas and epics", "Thevaram and Tamil devotional literature",
      "sacred rivers and pilgrimage sites", "Hindu symbols and rituals",
      "Indian history", "mixed devotional knowledge",
    ],
    persona: "a Tamil devotional Shorts channel about Lord Shiva, temples and Hindu tradition, watched by devotees",
    extraRules: [
      "Write with reverence. Never mock, trivialise or sensationalise any deity, belief or ritual.",
      "Only ask about things that are settled and widely agreed within the tradition and mainstream scholarship — never about disputed theology, sectarian arguments or miracle claims.",
      "Temple locations, deity names, festival months and scripture names are good subject matter.",
    ],
    mascotPrompt:
      "Friendly cartoon Nandi bull mascot head, front facing, calm gentle smile, decorated with a small garland, thick clean vector outlines, flat vibrant saffron and deep purple colors, centered, plain solid deep purple background, mascot logo style, no text, no letters",
  }),

  sanatana: brand("sanatana", "Sanatana Spirit", ["SANATANA", "QUIZ"], "en", {
    bgTop: "#9a3412", bgMid: "#7c2d12", bgBottom: "#a21caf",
    bgGlowA: "#f97316", bgGlowB: "#c026d3",
    optionTop: "#9a3412", optionBottom: "#7c2d12", optionStroke: "#fdba74",
    readingTop: "#f97316", readingBottom: "#c2410c",
    badgeTop: "#c026d3", badgeBottom: "#86198f",
    pillTop: "#c026d3", pillBottom: "#86198f",
    panelStroke: "#fcd34d", cyan: "#fbbf24", cyanDeep: "#d97706",
    footer: "#fde68a",
  }, {
    voice: "Male — Warm",
    categories: [
      "Hindu epics and Puranas", "Indian temples", "yoga and meditation",
      "Sanskrit words and their meanings", "Hindu festivals",
      "Indian philosophy", "sacred geography of India", "Indian history",
      "mixed general knowledge",
    ],
    persona: "an English-language Shorts channel about Sanatana Dharma for a global audience curious about Indian spirituality",
    extraRules: [
      "Write respectfully. Never mock, trivialise or sensationalise any deity, belief or ritual.",
      "Only ask about things that are settled and widely agreed — never disputed theology, sectarian arguments or miracle claims.",
    ],
    mascotPrompt:
      "Friendly cartoon meditating sage mascot head, serene smile, closed eyes, simple forehead marking, thick clean vector outlines, flat vibrant saffron and magenta colors, centered, plain solid deep maroon background, mascot logo style, no text, no letters",
  }),

  news: brand("news", "Tamil Politics Star", ["அரசியல்", "வினா"], "ta", {
    bgTop: "#1e3a8a", bgMid: "#172554", bgBottom: "#991b1b",
    bgGlowA: "#2563eb", bgGlowB: "#dc2626",
    optionTop: "#1e40af", optionBottom: "#172554", optionStroke: "#93c5fd",
    readingTop: "#3b82f6", readingBottom: "#1d4ed8",
    badgeTop: "#dc2626", badgeBottom: "#991b1b",
    pillTop: "#dc2626", pillBottom: "#991b1b",
    panelStroke: "#bfdbfe", cyan: "#60a5fa", cyanDeep: "#2563eb",
    footer: "#dbeafe",
  }, {
    voice: "Male — Heroic/Firm",
    categories: [
      "Indian constitution and civics", "Tamil Nadu history",
      "Indian independence movement", "Indian geography",
      "how Indian elections work", "Indian government institutions",
      "world capitals and countries", "mixed general knowledge",
    ],
    persona: "a Tamil current-affairs Shorts channel whose viewers follow politics and public life",
    extraRules: [
      "STRICTLY NON-PARTISAN. Never ask anything that favours, attacks or invites judgement of any party, leader, community or ideology.",
      "Ask only about settled civic and historical facts — constitutional provisions, institutions, dates, offices, geography.",
      "Never ask about ongoing disputes, court cases, allegations, election predictions or anything whose answer could change with the news.",
    ],
    mascotPrompt:
      "Friendly cartoon eagle mascot head, front facing, confident expression, thick clean vector outlines, flat vibrant navy blue and red colors, centered, plain solid navy background, mascot logo style, no text, no letters",
  }),
};

export function brandFor(channel: ChannelType): QuizBrand {
  return QUIZ_BRANDS[channel] ?? QUIZ_BRANDS.gktiger;
}

export function isQuizChannel(value: string): value is ChannelType {
  return Object.prototype.hasOwnProperty.call(QUIZ_BRANDS, value);
}

export function pickCategoryFor(brandDef: QuizBrand): string {
  return brandDef.categories[Math.floor(Math.random() * brandDef.categories.length)];
}
