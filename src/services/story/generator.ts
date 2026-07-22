import { config, type OutputLanguage } from "@/lib/config";
import { addStoryCost } from "@/lib/database";

const languageNames: Record<OutputLanguage, string> = { ta: "Tamil", en: "English", hi: "Hindi" };
// Characters read per second by Gemini TTS, per language (drives duration targeting).
const charsPerSecondFor: Record<OutputLanguage, number> = { ta: 12.5, en: 15, hi: 12.5 };

function key() {
  if (!config.api.gemini) throw new Error("GEMINI_API_KEY சேர்க்கப்படவில்லை");
  return config.api.gemini;
}

type CostCtx = { storyId: number; step: string };

async function geminiText(prompt: string, temperature = 0.7, cost?: CostCtx): Promise<string> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // gemini-2.5-flash is a thinking model. Unbounded thinking tokens vary
      // wildly run-to-run (observed 1.8k–11k) and count against the output
      // budget — on heavy-thinking runs the model spends the whole budget
      // thinking and returns empty parts, surfacing as "Gemini பதில் காலியாக
      // உள்ளது". These are deterministic JSON generation calls that need no
      // reasoning, so disable thinking and cap output explicitly.
      generationConfig: {
        responseMimeType: "application/json",
        temperature,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 8192,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini API ${response.status}`);
  if (cost?.storyId) {
    const pt = data?.usageMetadata?.promptTokenCount || 0;
    const ct = data?.usageMetadata?.candidatesTokenCount || 0;
    const amount = pt * (0.075 / 1_000_000) + ct * (0.30 / 1_000_000);
    if (amount > 0) addStoryCost(cost.storyId, cost.step, amount);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  if (!text) throw new Error("Gemini பதில் காலியாக உள்ளது");
  return text;
}

function parseJson<T>(raw: string): T {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text) as T;
}

export async function expandScriptForDuration(storyInput: string, durationSeconds: number, storyId?: number, language: OutputLanguage = "ta", localize = false): Promise<string> {
  const targetChars = Math.round(durationSeconds * (charsPerSecondFor[language] || 12.5));
  const langName = languageNames[language] || "Tamil";
  const seconds = Math.round(durationSeconds);

  // Concrete before/after examples force actual SUBSTITUTION with equivalent
  // local names/places, not transliteration (writing the same foreign name in
  // Tamil script) — a real risk the model defaults to otherwise.
  const localizeEn = localize
    ? `\n- FULL CULTURAL LOCALIZATION (CRITICAL): this is a REPLACEMENT, not a transliteration. Every person's name and every place name must be SWAPPED for a DIFFERENT, equivalent ${langName}-culture name/place — never spell the original foreign name in ${langName} script/pronunciation.
  Example: "John Smith from New York" must become something like "Arjun Kumar from Chennai" (a genuinely different, native ${langName} name and a real ${langName}-region place) — NOT "ஜான் ஸ்மித் நியூயார்க்கிலிருந்து" (that is transliteration, which is WRONG).
  Also localize food, festivals, currency, and customs to match. Keep the plot, emotions, and message exactly the same — only WHO and WHERE change.`
    : "";
  const localizeTa = localize
    ? `\n- முழுமையான கலாச்சார LOCALIZATION (மிக முக்கியம்): இது ஒரு REPLACEMENT — transliteration அல்ல. ஒவ்வொரு நபரின் பெயரும், ஒவ்வொரு இடப்பெயரும் **முற்றிலும் வேறான**, சமமான ${langName} கலாச்சார பெயர்/இடமாக மாற்றப்பட வேண்டும் — மூலப்பெயரை ${langName} எழுத்தில் அப்படியே எழுதக்கூடாது (உச்சரிப்பு மாற்றம் மட்டும் போதாது).
  உதாரணம்: "John Smith from New York" என்பது "அர்ஜுன் குமார், சென்னையிலிருந்து" போன்ற **உண்மையான வேறு** ${langName} பெயராகவும் இடமாகவும் மாற வேண்டும் — "ஜான் ஸ்மித் நியூயார்க்கிலிருந்து" (இது transliteration, இது **தவறு**) என எழுதக்கூடாது.
  உணவு, பண்டிகைகள், நாணயம், வழக்கங்களையும் இதற்கேற்ப மாற்றவும். கதை, உணர்வுகள், செய்தி மாறாமல் இருக்கட்டும் — யார், எங்கே என்பது மட்டும் மாறும்.`
    : "";

  const prompt = language === "en"
    ? `You are a YouTube storyteller. Based on the source story/news below, write an emotional, clear ENGLISH narration script.

Requirements:
- No emoji, hashtags, or markdown — plain prose only.
- It will be read by Text-to-Speech, so use natural, flowing full sentences.
- Total length: exactly ${targetChars} characters (about ${seconds} seconds of narration). Expand if the source is short (add emotional detail, small scenes); condense if long — but never change the core meaning.
- If based on a true event, write respectfully and without exaggeration.${localizeEn}

Source story:
${storyInput}

Now return ONLY the final narration script as JSON (escape newlines inside strings as \\n): {"script": "..."}`
    : `நீங்கள் ஒரு ${langName} YouTube Shorts கதைசொல்லி. கீழே கொடுக்கப்பட்டுள்ள மூல கதை/செய்தியை அடிப்படையாக வைத்து, ஒரு உணர்வுபூர்வமான, தெளிவான ${langName} narration script எழுதுங்கள்.

தேவைகள்:
- Emoji, hashtags, markdown எதுவும் வேண்டாம் — தூய்மையான உரை (plain prose) மட்டும்.
- இது Text-to-Speech (TTS) மூலம் படிக்கப்படும், இயல்பான பேச்சு வழக்கில் நீண்ட தெளிவான வாக்கியங்களில் எழுதுங்கள்.
- மொத்த நீளம்: சரியாக ${targetChars} எழுத்துகள் (characters) அளவு இருக்க வேண்டும் (இது சுமார் ${seconds} விநாடி narration ஆக இருக்கும்). மூலக் கதை குறுகியதாக இருந்தால் விரிவாக்கவும் (உணர்ச்சிகரமான விளக்கங்கள், சிறு காட்சிகள் சேர்த்து); நீளமாக இருந்தால் சுருக்கவும் — ஆனா மையக் கருத்தை மாற்றாதீர்கள்.
- ஒரு உண்மையான நிகழ்வை அடிப்படையாக கொண்டது எனில், மிகைப்படுத்தாமல் மரியாதையுடன் எழுதவும்.${localizeTa}

மூலக் கதை:
${storyInput}

இப்போது இறுதி narration script-ஐ மட்டும் JSON-ல் தாருங்கள்: {"script": "..."}`;

  const raw = await geminiText(prompt, 0.7, storyId ? { storyId, step: "script" } : undefined);
  const data = parseJson<{ script?: string }>(raw);
  const script = typeof data.script === "string" ? data.script.trim() : "";
  if (!script) throw new Error("Gemini script உருவாக்கவில்லை");
  return script;
}

export type StoryScenePrompt = { prompt: string; seconds: number; narrationExcerpt: string; searchTerms: string[] };

export async function generateSceneBreakdown(script: string, durationSeconds: number, storyId?: number, language: OutputLanguage = "ta"): Promise<StoryScenePrompt[]> {
  const langName = languageNames[language] || "Tamil";
  const sceneCount = Math.max(4, Math.min(40, Math.round(durationSeconds / 6)));
  const prompt = `கீழே உள்ள ${langName} narration script-ஐ காலவரிசைப்படி சரியாக ${sceneCount} காட்சிகளாக (scenes) பிரிக்கவும். ஒவ்வொரு காட்சிக்கும்:
1. "narrationExcerpt": அந்த காட்சியின் போது பேசப்படும் script-ன் ${langName} பகுதி (சுருக்கமாக, exact text — same language as the script).
2. "prompt": அந்த காட்சிக்கான ஒரு விரிவான English image-generation prompt (Google Flow / Nano Banana / Midjourney style, cinematic, photorealistic அல்லது painterly, 16:9, real நபர்களை குறிப்பிட்ட பெயரால் அடையாளப்படுத்தாமல் — silhouettes/symbolic/generic depiction பயன்படுத்தவும் இது ஒரு உண்மைக் கதையாக இருந்தால்).
3. "searchTerms": அந்த காட்சிக்கு பொருத்தமான 2-3 சுருக்கமான English stock-footage தேடல் சொற்கள் (Pexels/Pixabay-ல் தேட ஏற்றவை — எ.கா. "rural indian village sunset", "woman walking road"; ambiguous சொற்களை முழு video context வைத்து disambiguate செய்யவும்).

Script:
${script}

JSON மட்டும் தாருங்கள்: {"scenes": [{"narrationExcerpt": "...", "prompt": "...", "searchTerms": ["...", "..."]}]} — சரியாக ${sceneCount} entries இருக்க வேண்டும்.`;

  const raw = await geminiText(prompt, 0.6, storyId ? { storyId, step: "scenes" } : undefined);
  const data = parseJson<{ scenes?: { narrationExcerpt?: string; prompt?: string; searchTerms?: unknown }[] }>(raw);
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  if (scenes.length === 0) throw new Error("Gemini scene breakdown உருவாக்கவில்லை");

  const perSceneSeconds = durationSeconds / scenes.length;
  return scenes.map((scene) => ({
    prompt: typeof scene.prompt === "string" ? scene.prompt.trim() : "cinematic symbolic scene, 16:9",
    seconds: perSceneSeconds,
    narrationExcerpt: typeof scene.narrationExcerpt === "string" ? scene.narrationExcerpt.trim() : "",
    searchTerms: Array.isArray(scene.searchTerms)
      ? scene.searchTerms.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()).slice(0, 4)
      : [],
  }));
}

export async function generateThumbnailPrompt(script: string, title: string, storyId?: number): Promise<string> {
  const prompt = `You are a YouTube thumbnail art director. Based on the video's title and narration script below, write ONE detailed English image-generation prompt for a HIGH-CTR YouTube thumbnail (for Google Flow / Nano Banana / Midjourney).

Guidelines:
- Visually compelling, high contrast, dramatic lighting, clean uncluttered background, optimized for small mobile screens.
- ONE clear focal subject relevant to the story; strong expressive emotion if a person (use a generic/symbolic person, never a named real individual).
- Photorealistic or cinematic, 16:9.
- CRITICAL: absolutely NO text, letters, words, numbers, watermarks or logos inside the image (any title text is added separately later).

Title: ${title || "(none)"}
Script: ${script}

Return ONLY JSON: {"thumbnailPrompt": "the detailed English image prompt"}`;
  const raw = await geminiText(prompt, 0.7, storyId ? { storyId, step: "thumbnail" } : undefined);
  const data = parseJson<{ thumbnailPrompt?: string }>(raw);
  const out = typeof data.thumbnailPrompt === "string" ? data.thumbnailPrompt.trim() : "";
  if (!out) throw new Error("Gemini thumbnail prompt உருவாக்கவில்லை");
  return out;
}

export async function generateSeo(script: string, storyId?: number, language: OutputLanguage = "ta"): Promise<{ title: string; description: string; tags: string[] }> {
  const langName = languageNames[language] || "Tamil";
  const prompt = language === "en"
    ? `You are a YouTube SEO expert. Based on the narration script below, produce:
1. A curiosity-driven, emotional, click-worthy ENGLISH title (under 100 characters).
2. An SEO-optimized ENGLISH description (2-3 paragraphs, with relevant hashtags).
3. 10-15 relevant English tags (for the YouTube tags field).

Script:
${script}

Return ONLY JSON: {"title": "...", "description": "...", "tags": ["...", "..."]}`
    : `நீங்கள் ஒரு ${langName} YouTube SEO நிபுணர். கீழே உள்ள narration script-ஐ அடிப்படையாக வைத்து:
1. ஒரு curiosity-driven, emotional, click-worthy ${langName} தலைப்பு (100 characters-க்குள்).
2. ஒரு SEO-optimized ${langName} description (2-3 பத்திகள், relevant hashtags சேர்த்து).
3. 10-15 relevant ${langName}/ஆங்கில tags (YouTube tags field-க்காக).

Script:
${script}

JSON மட்டும் தாருங்கள்: {"title": "...", "description": "...", "tags": ["...", "..."]}`;

  const raw = await geminiText(prompt, 0.7, storyId ? { storyId, step: "seo" } : undefined);
  const data = parseJson<{ title?: string; description?: string; tags?: string[] }>(raw);
  return {
    title: typeof data.title === "string" ? data.title.trim() : "",
    description: typeof data.description === "string" ? data.description.trim() : "",
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string").slice(0, 20) : [],
  };
}
