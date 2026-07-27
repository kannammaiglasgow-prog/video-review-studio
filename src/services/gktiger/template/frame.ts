/** Composes one complete SVG frame of the GK Tiger quiz template from the
 * timeline state — the only place the reusable components are assembled. */

import { CANVAS } from "./theme";
import {
  answerOption, background, countdownTimer, defs, footer, header,
  outroCard, progressIndicator, questionCard, quickFactCard, type AnswerState,
} from "./components";
import { stateAt, type Timeline } from "./timeline";

export function renderFrameSvg(timeline: Timeline, t: number, mascotHref: string | null): string {
  const state = stateAt(timeline, t);

  let body: string;
  if (state.kind === "outro") {
    body = `${header(mascotHref)}
${outroCard(state.enter)}`;
  } else {
    const { slide, revealed } = state;
    const { data } = slide;

    const options = data.answers
      .map((answer, i) => {
        // The correct answer is never styled differently until revealAt — the
        // whole point of the countdown is that the viewer can't cheat.
        let optionState: AnswerState = "idle";
        if (revealed) {
          optionState = answer.letter.toUpperCase() === data.correctAnswer.toUpperCase() ? "correct" : "dimmed";
        }
        return answerOption(i, answer.letter, answer.text, optionState, state.optionEnter[i]);
      })
      .join("\n");

    body = `${header(mascotHref)}
${progressIndicator(data.questionNumber, data.totalQuestions, state.barProgress)}
${countdownTimer(state.secondsLeft, state.ringProgress, state.urgent)}
${questionCard(data.question, state.questionEnter)}
${options}
${quickFactCard(data.explanation, state.factEnter)}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
${defs()}
${background()}
${body}
${footer()}
</svg>`;
}
