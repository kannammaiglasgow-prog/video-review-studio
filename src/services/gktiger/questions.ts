import { geminiText, parseJson } from "@/services/story/generator";
import { getUsedQuizQuestions, isQuizQuestionUsed, type GkQuizQuestion } from "@/lib/database";

export const GK_CATEGORIES = [
  "animals and nature",
  "science",
  "space",
  "geography",
  "history",
  "human body",
  "food",
  "technology",
  "world records",
  "famous landmarks",
  "mixed general knowledge",
] as const;

export type GkCategory = (typeof GK_CATEGORIES)[number];
export type GkDifficulty = "easy" | "medium" | "hard" | "mixed";

export function pickCategory(): GkCategory {
  return GK_CATEGORIES[Math.floor(Math.random() * GK_CATEGORIES.length)];
}

const difficultyGuidance: Record<GkDifficulty, string> = {
  easy: "Easy — most adults would know this without thinking hard.",
  medium: "Medium — a well-read person knows it, others will have to guess.",
  hard: "Hard — genuinely challenging, but still a famous/checkable fact, never obscure trivia.",
  mixed: "Mix the three questions across easy, medium and hard difficulty.",
};

/** Step 1: invent three original multiple-choice questions. The already-used
 * list is passed in so the model doesn't re-tread ground; the DB's UNIQUE
 * constraint is the real backstop (see recordQuizQuestions). */
async function draftQuestions(category: GkCategory, difficulty: GkDifficulty): Promise<GkQuizQuestion[]> {
  const used = getUsedQuizQuestions(200);
  const avoidBlock = used.length
    ? `\n\nALREADY USED — do not repeat these or ask the same fact in different words:\n${used.slice(0, 120).map((q) => `- ${q}`).join("\n")}`
    : "";

  const prompt = `You are a quiz writer for a fast-paced English general-knowledge Shorts channel with a broad international audience.

Write exactly 3 original multiple-choice questions in the category: ${category}.
Difficulty: ${difficultyGuidance[difficulty]}

Rules for EVERY question:
- The answer must be an objective, well-established, uncontested fact. No opinions, no "most people think", no records that change yearly, no anything disputed between reliable sources.
- Exactly 3 answer choices, labelled A, B and C. Exactly one is correct.
- The two wrong choices must be plausible but clearly wrong to someone who knows the fact — never a second defensible answer.
- Question text must be under 90 characters so it stays readable on a phone screen.
- Each answer choice must be under 28 characters.
- Write in simple, clear international English. No idioms, no region-specific slang.
- Add a one-sentence "explanation" (under 100 characters) giving the interesting reason/context behind the answer.
- The three questions must be about clearly different things.${avoidBlock}

Return ONLY JSON:
{"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]} — exactly 3 entries.`;

  const raw = await geminiText(prompt, 1.0);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(raw);
  const list = Array.isArray(data.questions) ? data.questions : [];

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
 * why uploads are forced to Private. */
async function verifyQuestions(questions: GkQuizQuestion[]): Promise<GkQuizQuestion[]> {
  if (questions.length === 0) return [];

  const prompt = `You are a strict fact-checker. For each quiz question below, independently work out the correct answer. You have NOT been told which answer the writer intended — decide for yourself.

For each question return:
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
      console.log(`[GKTiger] rejected "${q.question}" — no verdict returned`);
      return;
    }
    if (!verdict.verified) {
      console.log(`[GKTiger] rejected "${q.question}" — not verified: ${verdict.reason || "unspecified"}`);
      return;
    }
    if (String(verdict.correct || "").toUpperCase() !== q.correct) {
      console.log(`[GKTiger] rejected "${q.question}" — checker said ${verdict.correct}, writer said ${q.correct}`);
      return;
    }
    kept.push(q);
  });

  return kept;
}

/** Produces exactly 3 fresh, verified, non-duplicate questions, or throws.
 * Retries with new drafts when verification/dedup thins the batch — never
 * pads the set with anything unverified. */
export async function generateVerifiedQuestions(category: GkCategory, difficulty: GkDifficulty): Promise<GkQuizQuestion[]> {
  const accepted: GkQuizQuestion[] = [];
  const seenThisRun = new Set<string>();

  for (let attempt = 0; attempt < 4 && accepted.length < 3; attempt += 1) {
    const drafted = await draftQuestions(category, difficulty);
    const fresh = drafted.filter((q) => {
      const norm = q.question.toLowerCase().trim();
      if (seenThisRun.has(norm) || isQuizQuestionUsed(q.question)) return false;
      seenThisRun.add(norm);
      return true;
    });
    const verified = await verifyQuestions(fresh);
    for (const q of verified) {
      if (accepted.length < 3) accepted.push(q);
    }
    if (accepted.length < 3) {
      console.log(`[GKTiger] attempt ${attempt + 1}: ${accepted.length}/3 verified so far, retrying`);
    }
  }

  if (accepted.length < 3) {
    throw new Error(`Only ${accepted.length}/3 questions passed fact-verification — video not generated (answers must be certain).`);
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
  raw: string,
  category: GkCategory,
  difficulty: GkDifficulty,
): Promise<{ questions: GkQuizQuestion[]; rejected: string[] }> {
  const prompt = `Below is a quiz written by hand. Convert it into structured JSON.

For each question found:
- "question": the question text, cleaned up (no leading numbering).
- "choiceA" / "choiceB" / "choiceC": exactly three options. If the author gave more than three, keep the correct one plus the two most plausible others. If they gave fewer than three, invent plausible wrong options that are clearly wrong to someone who knows the fact.
- "correct": "A", "B" or "C" — whichever letter now holds the answer the author marked. If the author did not mark one, work out the correct answer yourself.
- "explanation": one short interesting sentence (under 100 characters) about the answer. Write one if the author didn't.

Do not change the author's intended meaning. Do not drop questions.

Hand-written quiz:
${raw}

Return ONLY JSON: {"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]}`;

  const parsed = await geminiText(prompt, 0.2);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(parsed);
  const list = Array.isArray(data.questions) ? data.questions : [];

  const structured: GkQuizQuestion[] = list
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

  if (structured.length === 0) {
    throw new Error("No questions could be read from that text — check the format and try again.");
  }

  const verified = await verifyQuestions(structured);
  const keptText = new Set(verified.map((q) => q.question));
  const rejected = structured.filter((q) => !keptText.has(q.question)).map((q) => q.question);

  return { questions: verified, rejected };
}

/** Verification for questions derived from a supplied source. The generic
 * checker can't be used here: it only knows world facts, so it would reject a
 * perfectly good question about the pasted article. This one is shown the
 * source and must confirm the answer is BOTH supported by that text AND not
 * contradicted by well-known fact. */
async function verifyAgainstSource(questions: GkQuizQuestion[], source: string): Promise<GkQuizQuestion[]> {
  if (questions.length === 0) return [];

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
      console.log(`[GKTiger] source question rejected "${q.question}" — ${verdict?.reason || "no verdict"}`);
      return;
    }
    if (String(verdict.correct || "").toUpperCase() !== q.correct) {
      console.log(`[GKTiger] source question rejected "${q.question}" — checker said ${verdict.correct}, writer said ${q.correct}`);
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
  source: string,
  count: number,
  category: GkCategory,
  difficulty: GkDifficulty,
): Promise<{ questions: GkQuizQuestion[]; rejected: string[] }> {
  const prompt = `You are a quiz writer. Read the source text below and write ${count} multiple-choice questions drawn from it, for a fast-paced English general-knowledge Shorts channel.

Rules:
- Every answer must be clearly stated in or directly evidenced by the source text.
- Ask about the most interesting, memorable or surprising facts in it — not trivia about wording or structure ("what does paragraph two say" is bad).
- Do NOT reference the text itself. Write self-contained questions: "Which country invented paper?" not "According to the article, which country...".
- Exactly 3 options labelled A, B and C, exactly one correct. Wrong options must be plausible but clearly wrong.
- Question under 90 characters; each option under 28 characters.
- Simple international English.
- "explanation": one interesting sentence (under 100 characters) about the answer.
- Difficulty: ${difficultyGuidance[difficulty]}

SOURCE TEXT:
${source.slice(0, 12000)}

Return ONLY JSON: {"questions":[{"question":"...","choiceA":"...","choiceB":"...","choiceC":"...","correct":"A|B|C","explanation":"..."}]} — up to ${count} entries. Return fewer if the source doesn't support that many good questions.`;

  const raw = await geminiText(prompt, 0.7);
  const data = parseJson<{ questions?: Partial<GkQuizQuestion>[] }>(raw);
  const list = Array.isArray(data.questions) ? data.questions : [];

  const structured: GkQuizQuestion[] = list
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

  if (structured.length === 0) {
    throw new Error("No usable quiz questions could be drawn from that source.");
  }

  const verified = await verifyAgainstSource(structured, source);
  const keptText = new Set(verified.map((q) => q.question));
  const rejected = structured.filter((q) => !keptText.has(q.question)).map((q) => q.question);

  return { questions: verified, rejected };
}
