/** Animation timeline for the quiz template.
 *
 * The timeline is DURATION-DRIVEN: each voice-over line is synthesised and
 * measured first, and the layout is then built from those real durations so
 * narration never overlaps and never gets rushed. The sequence per question is
 *   question read in full → 0.5s pause → each answer read in full, one by one →
 *   countdown → answer reveal read in full → Quick Fact.
 * A call-to-action banner follows the first two questions. Audio cues come from
 * these same timings so sound and picture can never drift.
 *
 * The card and all three options still appear together; the only thing that
 * moves before the reveal is which option is highlighted as it's being read. */

export type QuizSlideData = {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  /** `image` is a data: URI when an option illustration is available. */
  answers: { letter: string; text: string; image?: string | null }[];
  correctAnswer: string;
  explanation: string;
  countdownSeconds: number;
};

export type CtaKind = "like" | "subscribe";

export type CuePoint = { at: number; sound: "question" | "option" | "tick" | "correct" };

/** Measured voice-over durations (seconds) for one slide, and for the outro. */
export type SlideVo = { question: number; options: number[]; reveal: number; cta: number | null };
export type VoTiming = { slides: SlideVo[]; outroScore: number; outroThanks: number };

/** Fixed motion/beat lengths that are NOT narration — these stay constant in
 * every language. Everything narration-shaped is driven by measured audio. */
export const PHASE = {
  questionIn: 0.6,       // question card + all three options arrive together
  questionLead: 0.3,     // narration starts this far into the entrance
  factHold: 2.4,         // Quick Fact card (shown, not read)
  ctaMinHold: 2.3,       // like / subscribe banner floor
  outroTail: 1.4,        // quiet beat after the final spoken line
} as const;

/** Silences between spoken beats. `afterQuestion` is the pause the user asked
 * for between the question and the first answer. */
export const GAP = {
  afterQuestion: 0.5,
  betweenOptions: 0.25,
  beforeCountdown: 0.35,
  afterReveal: 0.4,
  afterFact: 0.3,
  afterCta: 0.35,
  outroLead: 0.35,
  betweenOutro: 0.5,
} as const;

/** Which questions are followed by a call to action. */
export function ctaForSlide(index: number): CtaKind | null {
  if (index === 0) return "like";
  if (index === 1) return "subscribe";
  return null;
}

export type SlideTiming = {
  data: QuizSlideData;
  start: number;
  end: number;
  questionInAt: number;
  /** When the question voice-over starts. */
  questionReadAt: number;
  /** When each option starts being read, and for how long it stays highlighted. */
  optionReadAt: number[];
  optionReadDur: number[];
  countdownStart: number;
  countdownEnd: number;
  revealAt: number;
  /** When the answer-reveal voice-over starts (== revealAt). */
  revealReadAt: number;
  factAt: number;
  cta: CtaKind | null;
  ctaAt: number | null;
};

export type Timeline = {
  slides: SlideTiming[];
  outroStart: number;
  scoreAt: number;
  thanksAt: number;
  total: number;
  cues: CuePoint[];
};

/** Builds the whole timeline from the measured voice-over durations. Every
 * spoken line gets exactly its own length plus a deliberate gap, so lines are
 * strictly sequential. */
export function buildTimeline(slides: QuizSlideData[], vo: VoTiming): Timeline {
  const out: SlideTiming[] = [];
  const cues: CuePoint[] = [];
  let cursor = 0;

  slides.forEach((data, slideIndex) => {
    const svo = vo.slides[slideIndex];
    const start = cursor;
    const questionInAt = start;
    const questionReadAt = start + PHASE.questionLead;

    // Options begin only after the question has been read in full, plus the
    // requested pause; each one runs for its own measured length.
    const optionReadAt: number[] = [];
    const optionReadDur: number[] = [];
    let optCursor = questionReadAt + svo.question + GAP.afterQuestion;
    data.answers.forEach((_, i) => {
      const dur = svo.options[i] ?? 0.8;
      optionReadAt.push(optCursor);
      optionReadDur.push(dur);
      optCursor += dur + GAP.betweenOptions;
    });

    const countdownStart = optCursor - GAP.betweenOptions + GAP.beforeCountdown;
    const countdownEnd = countdownStart + data.countdownSeconds;
    const revealAt = countdownEnd;
    const revealReadAt = revealAt;
    // Fact appears only after the reveal line has finished.
    const factAt = revealAt + svo.reveal + GAP.afterReveal;
    const afterFact = factAt + PHASE.factHold;

    const cta = ctaForSlide(slideIndex);
    const ctaAt = cta ? afterFact + GAP.afterFact : null;
    const end = cta && ctaAt !== null
      ? ctaAt + Math.max(PHASE.ctaMinHold, (svo.cta ?? 0) + GAP.afterCta)
      : afterFact;

    cues.push({ at: questionReadAt, sound: "question" });
    optionReadAt.forEach((t) => cues.push({ at: t, sound: "option" }));
    for (let k = Math.min(3, Math.floor(data.countdownSeconds)); k >= 1; k -= 1) {
      cues.push({ at: countdownEnd - k, sound: "tick" });
    }
    cues.push({ at: revealAt, sound: "correct" });

    out.push({
      data, start, end, questionInAt, questionReadAt,
      optionReadAt, optionReadDur, countdownStart, countdownEnd,
      revealAt, revealReadAt, factAt, cta, ctaAt,
    });
    cursor = end;
  });

  const outroStart = cursor;
  const scoreAt = outroStart + GAP.outroLead;
  const thanksAt = scoreAt + vo.outroScore + GAP.betweenOutro;
  const total = thanksAt + vo.outroThanks + PHASE.outroTail;

  return { slides: out, outroStart, scoreAt, thanksAt, total, cues };
}

export type FrameState =
  | {
      kind: "slide";
      slide: SlideTiming;
      /** Drives the shared entrance of the question card and all options. */
      enter: number;
      /** Index of the option currently being read, or -1. */
      highlightIndex: number;
      secondsLeft: number;
      ringProgress: number;
      urgent: boolean;
      countdownActive: boolean;
      revealed: boolean;
      factEnter: number;
      ctaEnter: number;
      barProgress: number;
    }
  | { kind: "outro"; enter: number };

const p = (t: number, from: number, dur: number) => Math.min(1, Math.max(0, (t - from) / dur));

export function stateAt(timeline: Timeline, t: number): FrameState {
  if (t >= timeline.outroStart) {
    return { kind: "outro", enter: p(t, timeline.outroStart, 0.5) };
  }

  const slide = timeline.slides.find((s) => t >= s.start && t < s.end) ?? timeline.slides[timeline.slides.length - 1];
  const inCountdown = t >= slide.countdownStart && t < slide.countdownEnd;
  const revealed = t >= slide.revealAt;

  let secondsLeft: number;
  let ringProgress: number;
  if (t < slide.countdownStart) {
    secondsLeft = slide.data.countdownSeconds;
    ringProgress = 1;
  } else if (inCountdown) {
    const elapsed = t - slide.countdownStart;
    secondsLeft = slide.data.countdownSeconds - elapsed;
    ringProgress = 1 - elapsed / slide.data.countdownSeconds;
  } else {
    secondsLeft = 0;
    ringProgress = 0;
  }

  // Highlight follows the voice: only while that option's line is being read,
  // for that option's own measured duration.
  let highlightIndex = -1;
  if (!revealed) {
    slide.optionReadAt.forEach((at, i) => {
      if (t >= at && t < at + slide.optionReadDur[i]) highlightIndex = i;
    });
  }

  return {
    kind: "slide",
    slide,
    enter: p(t, slide.questionInAt, PHASE.questionIn),
    highlightIndex,
    secondsLeft,
    ringProgress,
    urgent: inCountdown,
    countdownActive: inCountdown,
    revealed,
    factEnter: p(t, slide.factAt, 0.4),
    ctaEnter: slide.ctaAt === null ? 0 : p(t, slide.ctaAt, 0.4),
    barProgress: (slide.data.questionNumber - 1 + p(t, slide.start, slide.end - slide.start)) / slide.data.totalQuestions,
  };
}
