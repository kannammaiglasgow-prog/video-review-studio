/** Composes one complete SVG frame of the GK Tiger quiz template from the
 * timeline state — the only place the reusable components are assembled. */

import { CANVAS } from "./theme";
import {
  answerOption, background, countdownTimer, ctaBanner, defs, footer, header,
  outroCard, progressIndicator, questionCard, quickFactCard, type AnswerState,
} from "./components";
import { CTA_TEXT, stateAt, type Timeline } from "./timeline";

export function renderFrameSvg(timeline: Timeline, t: number, mascotHref: string | null): string {
  const state = stateAt(timeline, t);

  let body: string;
  if (state.kind === "outro") {
    body = `${header(mascotHref)}
${outroCard(state.enter)}`;
  } else {
    const { slide, revealed, highlightIndex } = state;
    const { data } = slide;

    // Every option appears with the question card; the only thing that changes
    // before the reveal is which one is highlighted as the voice reads it.
    const options = data.answers
      .map((answer, i) => {
        let optionState: AnswerState = "idle";
        if (revealed) {
          optionState = answer.letter.toUpperCase() === data.correctAnswer.toUpperCase() ? "correct" : "dimmed";
        } else if (i === highlightIndex) {
          optionState = "reading";
        }
        return answerOption(i, answer.letter, answer.text, optionState, state.enter, answer.image);
      })
      .join("\n");

    // The Quick Fact card and the CTA banner share the same slot, and never
    // overlap — the CTA only starts once the fact has had its time.
    const lower = state.ctaEnter > 0 && slide.cta
      ? ctaBanner(slide.cta, CTA_TEXT[slide.cta].heading, CTA_TEXT[slide.cta].sub, state.ctaEnter)
      : quickFactCard(data.explanation, state.factEnter);

    body = `${header(mascotHref)}
${progressIndicator(data.questionNumber, data.totalQuestions, state.barProgress)}
${countdownTimer(state.secondsLeft, state.ringProgress, state.urgent)}
${questionCard(data.question, state.enter)}
${options}
${lower}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
${defs()}
${background()}
${body}
${footer()}
</svg>`;
}
