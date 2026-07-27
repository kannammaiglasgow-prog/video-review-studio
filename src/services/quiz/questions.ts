import { geminiText, parseJson } from "@/services/story/generator";
import { getUsedQuizQuestions, isQuizQuestionUsed, type GkQuizQuestion } from "@/lib/database";
import type { QuizBrand } from "./brand";

export type GkDifficulty = "easy" | "medium" | "hard" | "mixed";

/** How many questions each video asks. */
export const QUESTIONS_PER_VIDEO = 4;

const difficultyGuidance: Record<GkDifficulty, string> = {
  easy: "Easy — most adults would know this without thinking hard.",
  medium: "Medium — a well-read person knows it, others will have to guess.",
  hard: "Hard — genuinely challenging, but still a famous/checkable fact, never obscure trivia.",
  mixed: "Mix the questions across easy, medium and hard difficulty.",
};

/** The output-language instruction. Everything the viewer reads or hears is in
 * the channel's language; the JSON keys and the category stay English so the
 * rest of the pipeline (dedup, image prompts, logs) is language-independent. */
function languageRule(brand: QuizBrand): string {
  if (brand.language === "ta") {
    return `- Write the question, all three options and the explanation in TAMIL (தமிழ்). Use natural, everyday spoken Tamil that a narrator can read aloud — not literary or heavily Sanskritised Tamil.
- Widely-known English proper nouns may stay in English script when that is how Tamil speakers actually write them.
- Keep the JSON keys themselves in English exactly as shown.`;
  }
  return "- Write in simple, clear international English. No idioms, no region-specific slang.";
}

/** Tamil sets more glyph width per character than English at the same point
 * size, and the template's cards are fixed, so those channels get a tighter
 * budget rather than an auto-shrunk, unreadable card. */
function lengthRules(brand: QuizBrand): string {
  return brand.language === "ta"
    ? `- Question text must be under 60 characters so it stays readable on a phone screen.
- Each answer choice must be under 18 characters.
- The explanation must be under 70 characters.`
    : `- Question text must be under 90 characters so it stays readable on a phone screen.
- Each answer choice must be under 28 characters.
- The explanation must be under 100 characters.`;
}

function rulesBlock(brand: QuizBrand): string {
  return brand.extraRules.length
    ? `\n\nCHANNEL RULES — these override everything else:\n${brand.extraRules.map((r) => `- ${r}`).join("\n")}`
    : "";
}

/** Shape-checks and trims model-produced questions. */
function structure(list: Partial<GkQuizQuestion>[], category: string, difficulty: GkDifficulty): GkQuizQuestion[] {
  return list
    .filter((q): q is GkQuizQuestion => {
      const correct = String(q.correct || "").toUpperCase();
      return Boolean(
        q.question?.trim() && q.choiceA?.trim() && q.choiceB?.trim() && q.choiceC?.trim() &&
        (correct === "A" || correct === "B" || correct === "C")
      );
    })
    .map((q) => ({
      question: q.question.trim(),
      choiceA: q.choiceA.trim(),
      choiceB: q.choiceB.trim(),
      choiceC: q.choiceC.trim(),
      correct: String(q.correct).toUpperCase() as "A" | "B" | "C",
      explanation: (q.explanation || "").trim(),
      category,
      difficulty,
    }));
}

/** Step 1: invent original multiple-choice questions for this channel. The
 * already-used list is passed in so the model doesn't re-tread ground; the
 * DB's UNIQUE (channel, question) constraint is the real backstop. */
async function draftQuestions(brand: QuizBrand, category: string, difficulty: GkDifficulty): Promise<GkQuizQuestion[]> {
  const used = getUsedQuizQuestions(brand.channel, 200);
  const avoidBlock = used.length
    ? `\n\nALREADY USED — do not repeat these or ask the same fact in different words:\n${used.slice(0, 120).map((q) => `- ${q}`).join("\n")}`
    : "";

  const prompt = `You are a quiz writer for ${brand.persona}.

Write exactly ${QUESTIONS_PER_VIDEO} original multiple-choice questions in the category: ${category}.
Difficulty: ${difficultyGuidance[difficulty]}

Rules for EVERY question:
- The answer must be an objective, well-established, uncontested fact. No opinions, no "most people think", no records that change yearly, no anything disputed between reliable sources.
- Exactly 3 answer choices, labelled A, B and C. Exactly one is correct.
- The two wrong choices must be plausible but clearly wrong to someone who knows the fact — never a second defensible answer.
${lengthRules(brand)}
${languageRule(brand)}
- Add a one-sentence "explanation" giving the interesting reason/context behind the answer.
- The questions must be about clearly different things.${rulesBlock(brand)}${avoidBlock}

Return ONLY JSON:
{"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]} — exactly ${QUESTIONS_PER_VIDEO} entries.`;

  const raw = await geminiText(prompt, 1.0);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(raw);
  return structure(Array.isArray(data.questions) ? data.questions : [], category, difficulty);
}

type VerdictRow = { index: number; verified: boolean; correct?: string; reason?: string };

/** Step 2: independent check. Deliberately a SEPARATE, low-temperature call
 * that is shown only the question + choices (never which answer the writer
 * intended) so it can't just agree with itself — it must independently pick
 * the answer, and we only keep questions where it both picks the same letter
 * and reports the fact as uncontested.
 *
 * IMPORTANT LIMITATION: this is model self-verification, not a lookup against
 * a cited source — it filters out uncertainty and obvious errors, but is not
 * a substitute for a human sanity-check before anything goes public. That's
 * why uploads default to Private. */
async function verifyQuestions(brand: QuizBrand, questions: GkQuizQuestion[]): Promise<GkQuizQuestion[]> {
  if (questions.length === 0) return [];

  const tamilNote = brand.language === "ta"
    ? "The questions are written in Tamil. Read them in Tamil; write your reasons in English.\n\n"
    : "";

  const prompt = `You are a strict fact-checker. For each quiz question below, independently work out the correct answer. You have NOT been told which answer the writer intended — decide for yourself.

${tamilNote}For each question return:
- "index": the question's number as given.
- "correct": the letter (A, B or C) you independently believe is correct.
- "verified": true ONLY if ALL of these hold:
  * You are certain of the answer as a well-established fact.
  * Reliable sources agree — the fact is not disputed, not approximate, and does not change over time.
  * Exactly one of the three choices is defensible as correct.
  Otherwise return false.
- "reason": a short note (under 80 characters) — if verified is false, say why.

Be conservative. If you are not sure, return "verified": false.

Questions:
${questions.map((q, i) => `${i + 1}. ${q.question}\n   A: ${q.choiceA}\n   B: ${q.choiceB}\n   C: ${q.choiceC}`).join("\n\n")}

Return ONLY JSON: {"verdicts":[{"index":1,"correct":"A","verified":true,"reason":"..."}]}`;

  const raw = await geminiText(prompt, 0.1);
  const data = parseJson<{ verdicts?: VerdictRow[] }>(raw);
  const verdicts = Array.isArray(data.verdicts) ? data.verdicts : [];

  const kept: GkQuizQuestion[] = [];
  questions.forEach((q, i) => {
    const verdict = verdicts.find((v) => Number(v.index) === i + 1);
    if (!verdict) {
      console.log(`[Quiz:${brand.channel}] rejected "${q.question}" — no verdict returned`);
      return;
    }
    if (!verdict.verified) {
      console.log(`[Quiz:${brand.channel}] rejected "${q.question}" — not verified: ${verdict.reason || "unspecified"}`);
      return;
    }
    if (String(verdict.correct || "").toUpperCase() !== q.correct) {
      console.log(`[Quiz:${brand.channel}] rejected "${q.question}" — checker said ${verdict.correct}, writer said ${q.correct}`);
      return;
    }
    kept.push(q);
  });

  return kept;
}

/** Produces a full set of fresh, verified, non-duplicate questions, or throws.
 * Retries with new drafts when verification/dedup thins the batch — never
 * pads the set with anything unverified. */
export async function generateVerifiedQuestions(
  brand: QuizBrand,
  category: string,
  difficulty: GkDifficulty,
): Promise<GkQuizQuestion[]> {
  const accepted: GkQuizQuestion[] = [];
  const seenThisRun = new Set<string>();

  for (let attempt = 0; attempt < 4 && accepted.length < QUESTIONS_PER_VIDEO; attempt += 1) {
    const drafted = await draftQuestions(brand, category, difficulty);
    const fresh = drafted.filter((q) => {
      const norm = q.question.toLowerCase().trim();
      if (seenThisRun.has(norm) || isQuizQuestionUsed(brand.channel, q.question)) return false;
      seenThisRun.add(norm);
      return true;
    });
    const verified = await verifyQuestions(brand, fresh);
    for (const q of verified) {
      if (accepted.length < QUESTIONS_PER_VIDEO) accepted.push(q);
    }
    if (accepted.length < QUESTIONS_PER_VIDEO) {
      console.log(`[Quiz:${brand.channel}] attempt ${attempt + 1}: ${accepted.length}/${QUESTIONS_PER_VIDEO} verified so far, retrying`);
    }
  }

  if (accepted.length < QUESTIONS_PER_VIDEO) {
    throw new Error(`Only ${accepted.length}/${QUESTIONS_PER_VIDEO} questions passed fact-verification — video not generated (answers must be certain).`);
  }
  return accepted;
}

/** Turns free-form typed questions into the same verified structure the
 * generator produces. The user may write loosely — numbered or not, options
 * as "A) x" or "A. x", answer as "Answer: B" or "correct: b" — so Gemini
 * normalises the text rather than us guessing at a brittle regex.
 *
 * The answers still go through the SAME independent verification pass as
 * generated ones: a typo or a wrong key in the input gets caught rather than
 * shipped. Questions the checker disputes are reported, not silently fixed. */
export async function parseManualQuestions(
  brand: QuizBrand,
  raw: string,
  category: string,
  difficulty: GkDifficulty,
): Promise<{ questions: GkQuizQuestion[]; rejected: string[] }> {
  const prompt = `Below is a quiz written by hand. Convert it into structured JSON.

For each question found:
- "question": the question text, cleaned up (no leading numbering).
- "choiceA" / "choiceB" / "choiceC": exactly three options. If the author gave more than three, keep the correct one plus the two most plausible others. If they gave fewer than three, invent plausible wrong options that are clearly wrong to someone who knows the fact.
- "correct": "A", "B" or "C" — whichever letter now holds the answer the author marked. If the author did not mark one, work out the correct answer yourself.
- "explanation": one short interesting sentence about the answer. Write one if the author didn't.

${languageRule(brand)}
If the author wrote in a different language from the one required above, translate their questions into it while keeping the meaning exactly.

Do not change the author's intended meaning. Do not drop questions.

Hand-written quiz:
${raw}

Return ONLY JSON: {"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]}`;

  const parsed = await geminiText(prompt, 0.2);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(parsed);
  const structured = structure(Array.isArray(data.questions) ? data.questions : [], category, difficulty);

  if (structured.length === 0) {
    throw new Error("No questions could be read from that text — check the format and try again.");
  }

  const verified = await verifyQuestions(brand, structured);
  const keptText = new Set(verified.map((q) => q.question));
  const rejected = structured.filter((q) => !keptText.has(q.question)).map((q) => q.question);

  return { questions: verified, rejected };
}

/** Verification for questions derived from a supplied source. The generic
 * checker can't be used here: it only knows world facts, so it would reject a
 * perfectly good question about the pasted article. This one is shown the
 * source and must confirm the answer is BOTH supported by that text AND not
 * contradicted by well-known fact. */
async function verifyAgainstSource(brand: QuizBrand, questions: GkQuizQuestion[], source: string): Promise<GkQuizQuestion[]> {
  if (questions.length === 0) return [];

  const tamilNote = brand.language === "ta"
    ? "The questions may be in Tamil while the source is in another language; judge the meaning, not the wording.\n"
    : "";

  const prompt = `You are a strict fact-checker. Below is a SOURCE TEXT, then quiz questions written from it.

For each question decide, independently:
- "correct": which letter (A, B or C) is actually correct.
- "verified": true ONLY if ALL of these hold:
  * The source text clearly supports that answer (not implied, not guessed).
  * Exactly one option is defensible.
  * The answer is not contradicted by well-established general knowledge.
  Otherwise false.
- "reason": under 80 characters; if false, say why.

Be conservative — if the source is vague or the question is ambiguous, return false.
${tamilNote}
SOURCE TEXT:
${source.slice(0, 8000)}

QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q.question}\n   A: ${q.choiceA}\n   B: ${q.choiceB}\n   C: ${q.choiceC}`).join("\n\n")}

Return ONLY JSON: {"verdicts":[{"index":1,"correct":"A","verified":true,"reason":"..."}]}`;

  const raw = await geminiText(prompt, 0.1);
  const data = parseJson<{ verdicts?: VerdictRow[] }>(raw);
  const verdicts = Array.isArray(data.verdicts) ? data.verdicts : [];

  const kept: GkQuizQuestion[] = [];
  questions.forEach((q, i) => {
    const verdict = verdicts.find((v) => Number(v.index) === i + 1);
    if (!verdict?.verified) {
      console.log(`[Quiz:${brand.channel}] source question rejected "${q.question}" — ${verdict?.reason || "no verdict"}`);
      return;
    }
    if (String(verdict.correct || "").toUpperCase() !== q.correct) {
      console.log(`[Quiz:${brand.channel}] source question rejected "${q.question}" — checker said ${verdict.correct}, writer said ${q.correct}`);
      return;
    }
    kept.push(q);
  });
  return kept;
}

/** Builds quiz questions FROM supplied material — a pasted article, story or
 * any block of text. Questions must be answerable from the material itself,
 * so a viewer who read it could get them right, and each is then checked
 * back against that same source. */
export async function generateQuestionsFromSource(
  brand: QuizBrand,
  source: string,
  count: number,
  category: string,
  difficulty: GkDifficulty,
): Promise<{ questions: GkQuizQuestion[]; rejected: string[] }> {
  const prompt = `You are a quiz writer for ${brand.persona}. Read the source text below and write ${count} multiple-choice questions drawn from it.

Rules:
- Every answer must be clearly stated in or directly evidenced by the source text.
- Ask about the most interesting, memorable or surprising facts in it — not trivia about wording or structure ("what does paragraph two say" is bad).
- Do NOT reference the text itself. Write self-contained questions: "Which country invented paper?" not "According to the article, which country...".
- Exactly 3 options labelled A, B and C, exactly one correct. Wrong options must be plausible but clearly wrong.
${lengthRules(brand)}
${languageRule(brand)}
- "explanation": one interesting sentence about the answer.
- Difficulty: ${difficultyGuidance[difficulty]}${rulesBlock(brand)}

SOURCE TEXT:
${source.slice(0, 12000)}

Return ONLY JSON: {"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]} — up to ${count} entries. Return fewer if the source doesn't support that many good questions.`;

  const raw = await geminiText(prompt, 0.7);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(raw);
  const structured = structure(Array.isArray(data.questions) ? data.questions : [], category, difficulty);

  if (structured.length === 0) {
    throw new Error("No usable quiz questions could be drawn from that source.");
  }

  const verified = await verifyAgainstSource(brand, structured, source);
  const keptText = new Set(verified.map((q) => q.question));
  const rejected = structured.filter((q) => !keptText.has(q.question)).map((q) => q.question);

  return { questions: verified, rejected };
}

/** Short English noun phrases naming what each answer option depicts, used
 * only to find or generate its illustration. Needed because stock libraries
 * and the image model are English-only: without this every Tamil option would
 * fall back to a text-only card. English channels already have usable terms,
 * so they skip the call entirely. */
export async function englishImageTerms(brand: QuizBrand, questions: GkQuizQuestion[]): Promise<string[][]> {
  const asWritten = questions.map((q) => [q.choiceA, q.choiceB, q.choiceC]);
  if (brand.language === "en") return asWritten;

  const prompt = `For each quiz option below, give a SHORT English noun phrase (1-4 words) naming the thing it refers to, suitable for searching a stock photo library.

Rules:
- Name the concrete subject, not a sentence: "Meenakshi Amman Temple", "peacock", "River Ganges".
- If an option is a number, a date or an abstract idea with nothing to photograph, return the closest concrete subject of the QUESTION instead.
- Keep the exact order and count.

${questions.map((q, i) => `${i + 1}. Question: ${q.question}\n   A: ${q.choiceA}\n   B: ${q.choiceB}\n   C: ${q.choiceC}`).join("\n\n")}

Return ONLY JSON: {"items":[{"index":1,"a":"...","b":"...","c":"..."}]}`;

  try {
    const raw = await geminiText(prompt, 0.2);
    const data = parseJson<{ items?: { index: number; a?: string; b?: string; c?: string }[] }>(raw);
    const items = Array.isArray(data.items) ? data.items : [];
    const pick = (translated: string | undefined, original: string) => (translated?.trim() ? translated.trim() : original);
    return questions.map((q, i) => {
      const row = items.find((r) => Number(r.index) === i + 1);
      return [pick(row?.a, q.choiceA), pick(row?.b, q.choiceB), pick(row?.c, q.choiceC)];
    });
  } catch (err) {
    // A missing translation costs illustrations, not the video.
    console.log(`[Quiz:${brand.channel}] image-term translation failed, using raw options: ${err instanceof Error ? err.message : String(err)}`);
    return asWritten;
  }
}
