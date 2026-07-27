/** Animation timeline for the GK Tiger quiz template.
 *
 * Sequence per question: the card and all three options appear together, each
 * option is highlighted as the voice reads it, a 3-second countdown runs with
 * the answer still hidden, then the reveal and Quick Fact. A call-to-action
 * banner follows the first two questions. Audio cues come from these same
 * timings so sound and picture can never drift. */

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

/** Tuned against English narration at +18%. */
export const PHASE = {
  questionIn: 0.6,      // question card + all three options arrive together
  questionRead: 1.9,    // voice reads the question
  optionRead: 0.95,     // each option is highlighted while it's read
  preCountdown: 0.25,
  revealHold: 1.8,      // correct answer + CORRECT! badge
  factHold: 2.4,        // Quick Fact card
  ctaHold: 2.3,         // like / subscribe banner
  outro: 7.6,           // score prompt, thanks, share
} as const;

/** Stretches only the slots that hold narration. A language that reads slower
 * than English needs longer reading beats, but the countdown must stay exactly
 * as long as the number on screen says, and the entrance animation is a fixed
 * piece of motion design — so neither is scaled. */
function pacedPhases(paceScale: number) {
  const k = Math.max(1, paceScale);
  return {
    ...PHASE,
    questionRead: PHASE.questionRead * k,
    optionRead: PHASE.optionRead * k,
    revealHold: PHASE.revealHold * k,
    factHold: PHASE.factHold * k,
    ctaHold: PHASE.ctaHold * k,
    outro: PHASE.outro * k,
  };
}

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
  /** When each option starts being read (and highlighted). */
  optionReadAt: number[];
  countdownStart: number;
  countdownEnd: number;
  revealAt: number;
  factAt: number;
  cta: CtaKind | null;
  ctaAt: number | null;
};

export type Timeline = {
  slides: SlideTiming[];
  outroStart: number;
  total: number;
  cues: CuePoint[];
  /** How long each option stays highlighted — needed by stateAt, and no longer
   * a constant now that pacing varies by language. */
  optionReadDur: number;
};

export function buildTimeline(slides: QuizSlideData[], paceScale = 1): Timeline {
  const P = pacedPhases(paceScale);
  const out: SlideTiming[] = [];
  const cues: CuePoint[] = [];
  let cursor = 0;

  slides.forEach((data, slideIndex) => {
    const start = cursor;
    const questionInAt = start;
    const readsStart = start + P.questionIn + P.questionRead;
    const optionReadAt = data.answers.map((_, i) => readsStart + i * P.optionRead);
    const countdownStart = readsStart + data.answers.length * P.optionRead + P.preCountdown;
    const countdownEnd = countdownStart + data.countdownSeconds;
    const revealAt = countdownEnd;
    const factAt = revealAt + P.revealHold;
    const afterFact = factAt + P.factHold;

    const cta = ctaForSlide(slideIndex);
    const ctaAt = cta ? afterFact : null;
    const end = cta ? afterFact + P.ctaHold : afterFact;

    cues.push({ at: questionInAt, sound: "question" });
    optionReadAt.forEach((t) => cues.push({ at: t, sound: "option" }));
    for (let k = Math.min(3, Math.floor(data.countdownSeconds)); k >= 1; k -= 1) {
      cues.push({ at: countdownEnd - k, sound: "tick" });
    }
    cues.push({ at: revealAt, sound: "correct" });

    out.push({ data, start, end, questionInAt, optionReadAt, countdownStart, countdownEnd, revealAt, factAt, cta, ctaAt });
    cursor = end;
  });

  const outroStart = cursor;
  return { slides: out, outroStart, total: outroStart + P.outro, cues, optionReadDur: P.optionRead };
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

  // Highlight follows the voice: only while that option's line is being read.
  let highlightIndex = -1;
  if (!revealed) {
    slide.optionReadAt.forEach((at, i) => {
      if (t >= at && t < at + timeline.optionReadDur) highlightIndex = i;
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
