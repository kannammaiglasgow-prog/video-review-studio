/** Animation timeline for the GK Tiger quiz template.
 *
 * Owns the exact sequence the brief specifies — question card in, options
 * revealed one by one, countdown running with the answer still hidden, then
 * reveal + Quick Fact — and exposes, for any point in time, exactly what the
 * frame renderer should draw. Audio cues are emitted from the same timings so
 * sound and picture can never drift. */

export type QuizSlideData = {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  answers: { letter: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  countdownSeconds: number;
};

export type CuePoint = { at: number; sound: "question" | "option" | "tick" | "correct" };

/** Per-phase durations (seconds). Voice-over lines are fitted into these
 * slots, not the other way round, so the on-screen animation stays identical
 * across videos regardless of how fast the narration reads. */
export const PHASE = {
  questionIn: 0.55,
  questionHold: 1.7,      // question is read aloud here
  optionStagger: 0.85,    // gap between option reveals (each is read aloud)
  preCountdown: 0.35,
  revealHold: 1.9,        // correct answer + CORRECT! badge
  factHold: 2.6,          // Quick Fact card on screen
  outro: 3.4,
} as const;

export type SlideTiming = {
  data: QuizSlideData;
  start: number;
  end: number;
  questionInAt: number;
  optionAt: number[];
  countdownStart: number;
  countdownEnd: number;
  revealAt: number;
  factAt: number;
};

export type Timeline = {
  slides: SlideTiming[];
  outroStart: number;
  total: number;
  cues: CuePoint[];
};

/** Slot lengths for one question, given its countdown length. */
export function slideDuration(data: QuizSlideData): number {
  return (
    PHASE.questionIn + PHASE.questionHold +
    data.answers.length * PHASE.optionStagger +
    PHASE.preCountdown + data.countdownSeconds +
    PHASE.revealHold + PHASE.factHold
  );
}

export function buildTimeline(slides: QuizSlideData[]): Timeline {
  const out: SlideTiming[] = [];
  const cues: CuePoint[] = [];
  let cursor = 0;

  for (const data of slides) {
    const start = cursor;
    const questionInAt = start;
    const optionsStart = start + PHASE.questionIn + PHASE.questionHold;
    const optionAt = data.answers.map((_, i) => optionsStart + i * PHASE.optionStagger);
    const countdownStart = optionsStart + data.answers.length * PHASE.optionStagger + PHASE.preCountdown;
    const countdownEnd = countdownStart + data.countdownSeconds;
    const revealAt = countdownEnd;
    const factAt = revealAt + PHASE.revealHold;
    const end = factAt + PHASE.factHold;

    cues.push({ at: questionInAt, sound: "question" });
    optionAt.forEach((t) => cues.push({ at: t, sound: "option" }));
    // Tick on each of the final three seconds.
    for (let k = 3; k >= 1; k -= 1) {
      const at = countdownEnd - k;
      if (at >= countdownStart) cues.push({ at, sound: "tick" });
    }
    cues.push({ at: revealAt, sound: "correct" });

    out.push({ data, start, end, questionInAt, optionAt, countdownStart, countdownEnd, revealAt, factAt });
    cursor = end;
  }

  const outroStart = cursor;
  const total = outroStart + PHASE.outro;
  return { slides: out, outroStart, total, cues };
}

export type FrameState =
  | {
      kind: "slide";
      slide: SlideTiming;
      questionEnter: number;
      optionEnter: number[];
      /** Seconds still on the clock (drives the big number). */
      secondsLeft: number;
      /** 1 → 0 as the countdown drains (drives the ring). */
      ringProgress: number;
      urgent: boolean;
      revealed: boolean;
      factEnter: number;
      /** Overall video progress, for the bar under the pill. */
      barProgress: number;
    }
  | { kind: "outro"; enter: number };

const p = (t: number, from: number, dur: number) => Math.min(1, Math.max(0, (t - from) / dur));

/** Everything the renderer needs to draw the frame at time `t`. */
export function stateAt(timeline: Timeline, t: number): FrameState {
  if (t >= timeline.outroStart) {
    return { kind: "outro", enter: p(t, timeline.outroStart, 0.5) };
  }

  const slide = timeline.slides.find((s) => t >= s.start && t < s.end) ?? timeline.slides[timeline.slides.length - 1];

  const beforeCountdown = t < slide.countdownStart;
  const inCountdown = t >= slide.countdownStart && t < slide.countdownEnd;
  const revealed = t >= slide.revealAt;

  // Before the countdown the timer shows the full duration; during it, it
  // drains; after it, zero. The answer is never highlighted before revealAt.
  let secondsLeft: number;
  let ringProgress: number;
  if (beforeCountdown) {
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

  return {
    kind: "slide",
    slide,
    questionEnter: p(t, slide.questionInAt, PHASE.questionIn),
    optionEnter: slide.optionAt.map((at) => p(t, at, 0.42)),
    secondsLeft,
    ringProgress,
    urgent: inCountdown && secondsLeft <= 3,
    revealed,
    factEnter: p(t, slide.factAt, 0.45),
    barProgress: (slide.data.questionNumber - 1 + p(t, slide.start, slide.end - slide.start)) / slide.data.totalQuestions,
  };
}
