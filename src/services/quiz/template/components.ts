/** Reusable SVG components for the quiz template.
 *
 * Each export renders one piece of the approved design and takes only the data
 * it needs plus an animation progress value, so the same components compose
 * every frame of every video — only the quiz data changes.
 *
 * Every colour, font and word arrives through the `QuizBrand` argument, so a
 * channel can restyle and re-language the template without any component
 * knowing which channel it is drawing. Geometry stays in theme.ts and is the
 * same everywhere: the approved layout is not per-channel. */

import type { QuizBrand } from "../brand";
import { CANVAS, LAYOUT, esc, fitText, optionY, easeOutBack, easeOutCubic } from "./theme";

/** Gradient/filter definitions shared by every component. Emitted once per frame. */
export function defs(b: QuizBrand): string {
  const c = b.palette;
  return `<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0%" stop-color="${c.bgTop}"/>
    <stop offset="52%" stop-color="${c.bgMid}"/>
    <stop offset="100%" stop-color="${c.bgBottom}"/>
  </linearGradient>
  <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0%" stop-color="${c.bgGlowA}" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="${c.bgGlowA}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0%" stop-color="${c.bgGlowB}" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="${c.bgGlowB}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.optionTop}"/>
    <stop offset="100%" stop-color="${c.optionBottom}"/>
  </linearGradient>
  <linearGradient id="readingGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.readingTop}"/>
    <stop offset="100%" stop-color="${c.readingBottom}"/>
  </linearGradient>
  <linearGradient id="correctGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.correctTop}"/>
    <stop offset="100%" stop-color="${c.correctBottom}"/>
  </linearGradient>
  <linearGradient id="badgeGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.badgeTop}"/>
    <stop offset="100%" stop-color="${c.badgeBottom}"/>
  </linearGradient>
  <linearGradient id="pillGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.pillTop}"/>
    <stop offset="100%" stop-color="${c.pillBottom}"/>
  </linearGradient>
  <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${c.cyan}"/>
    <stop offset="100%" stop-color="${c.panelStroke}"/>
  </linearGradient>
  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${c.accentLight}"/>
    <stop offset="55%" stop-color="${c.accentMid}"/>
    <stop offset="100%" stop-color="${c.accentDeep}"/>
  </linearGradient>
  <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="14" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="cardShadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="${c.cardInk}" flood-opacity="0.55"/>
  </filter>
  <filter id="textShadow" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="${c.cardInk}" flood-opacity="0.7"/>
  </filter>
</defs>`;
}

/** Full-bleed game-show background: gradient, glow pools and a subtle grid. */
export function background(): string {
  const gridLines: string[] = [];
  for (let x = 0; x <= CANVAS.width; x += 90) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${CANVAS.height}" stroke="#ffffff" stroke-opacity="0.045" stroke-width="2"/>`);
  }
  for (let y = 0; y <= CANVAS.height; y += 90) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${CANVAS.width}" y2="${y}" stroke="#ffffff" stroke-opacity="0.045" stroke-width="2"/>`);
  }
  return `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#bgGrad)"/>
${gridLines.join("")}
<ellipse cx="90" cy="60" rx="300" ry="240" fill="url(#glowB)"/>
<ellipse cx="1000" cy="70" rx="300" ry="240" fill="url(#glowB)"/>
<ellipse cx="540" cy="1020" rx="640" ry="520" fill="url(#glowA)" opacity="0.55"/>
<ellipse cx="540" cy="1900" rx="620" ry="260" fill="url(#glowB)" opacity="0.5"/>`;
}

/** Channel mascot + two-word wordmark, the second word in the accent gradient.
 *
 * The two words are one `<text>` element with coloured `<tspan>`s, so the
 * rasterizer advances between them — no per-language width metric to get wrong,
 * which is what previously let the Tamil words overlap. `fitText` still only
 * decides the size that fits beside the mascot. */
export function header(b: QuizBrand, mascotHref: string | null): string {
  const { mascotX, mascotY, mascotSize, wordmarkY, safeX } = LAYOUT;
  const c = b.palette;
  const mascot = mascotHref
    ? `<image href="${mascotHref}" x="${mascotX}" y="${mascotY}" width="${mascotSize}" height="${mascotSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#mascotClip)"/>
<clipPath id="mascotClip"><circle cx="${mascotX + mascotSize / 2}" cy="${mascotY + mascotSize / 2}" r="${mascotSize / 2}"/></clipPath>`
    : "";

  const [first, second] = b.wordmark;
  const startX = mascotHref ? mascotX + mascotSize + 24 : safeX;
  const available = CANVAS.width - startX - safeX;
  const { fontSize } = fitText(`${first} ${second}`, available, 1, 92, 40);

  // With a mascot the wordmark is left-anchored beside it; without one it's
  // centred. A single space between the tspans keeps the words apart.
  const anchor = mascotHref ? "start" : "middle";
  const anchorX = mascotHref ? startX.toFixed(1) : String(CANVAS.width / 2);

  return `${mascot}
<g filter="url(#textShadow)">
  <text x="${anchorX}" y="${wordmarkY}" font-family="${b.fontStack}" font-size="${fontSize}" font-weight="bold" text-anchor="${anchor}" letter-spacing="2">
    <tspan fill="${c.white}">${esc(first)} </tspan><tspan fill="url(#goldGrad)">${esc(second)}</tspan>
  </text>
</g>`;
}

/** "QUESTION x / y" pill plus the animated progress bar beneath it. */
export function progressIndicator(b: QuizBrand, current: number, total: number, barProgress: number): string {
  const { pillW, pillH, pillY, progressX, progressY, progressW, progressH } = LAYOUT;
  const c = b.palette;
  const pillX = (CANVAS.width - pillW) / 2;
  const fill = Math.max(0, Math.min(1, barProgress)) * progressW;

  const pillLabel = b.strings.questionPill(current, total);
  const { fontSize } = fitText(pillLabel, pillW - 40, 1, 30, 17);

  return `<g filter="url(#cardShadow)">
  <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="url(#pillGrad)" stroke="${c.optionStroke}" stroke-opacity="0.6" stroke-width="2"/>
</g>
<text x="${CANVAS.width / 2}" y="${pillY + 39}" font-family="${b.fontStack}" font-size="${fontSize}" font-weight="bold" fill="${c.white}" text-anchor="middle" letter-spacing="2">${esc(pillLabel)}</text>
<rect x="${progressX}" y="${progressY}" width="${progressW}" height="${progressH}" rx="${progressH / 2}" fill="#0b1440" fill-opacity="0.55" stroke="${c.panelStroke}" stroke-opacity="0.35" stroke-width="2"/>
${fill > 4 ? `<rect x="${progressX}" y="${progressY}" width="${fill.toFixed(1)}" height="${progressH}" rx="${progressH / 2}" fill="url(#barGrad)"/>` : ""}`;
}

/** Circular countdown. `secondsLeft` drives the number, `ringProgress` (1→0)
 * drives the arc so it visibly drains while the viewer is choosing. */
export function countdownTimer(b: QuizBrand, secondsLeft: number, ringProgress: number, urgent: boolean): string {
  const { timerCx, timerCy, timerR, timerStroke } = LAYOUT;
  const c = b.palette;
  const circumference = 2 * Math.PI * timerR;
  const dash = Math.max(0, Math.min(1, ringProgress)) * circumference;
  const ringColor = urgent ? "#fb7185" : c.cyan;
  const pulse = urgent ? 1 + 0.04 * Math.sin(secondsLeft * Math.PI * 2) : 1;
  const { fontSize: secSize } = fitText(b.strings.sec, timerR * 1.9, 1, 24, 13);

  return `<g transform="translate(${timerCx} ${timerCy}) scale(${pulse.toFixed(3)}) translate(${-timerCx} ${-timerCy})">
  <circle cx="${timerCx}" cy="${timerCy}" r="${timerR + 14}" fill="#0b1440" fill-opacity="0.5"/>
  <circle cx="${timerCx}" cy="${timerCy}" r="${timerR}" fill="#101a5c" stroke="#1e2a8a" stroke-width="${timerStroke}"/>
  <g filter="url(#softGlow)">
    <circle cx="${timerCx}" cy="${timerCy}" r="${timerR}" fill="none" stroke="${ringColor}" stroke-width="${timerStroke}"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
      transform="rotate(-90 ${timerCx} ${timerCy})"/>
  </g>
  <text x="${timerCx}" y="${timerCy + 10}" font-family="${b.fontStack}" font-size="62" font-weight="bold" fill="${c.white}" text-anchor="middle">${Math.max(0, Math.ceil(secondsLeft))}</text>
  <text x="${timerCx}" y="${timerCy + 52}" font-family="${b.fontStack}" font-size="${secSize}" font-weight="bold" fill="${c.panelStroke}" text-anchor="middle" letter-spacing="2">${esc(b.strings.sec)}</text>
</g>`;
}

/** Large white question card. `enter` (0→1) slides and fades it in. */
export function questionCard(b: QuizBrand, question: string, enter: number): string {
  const { questionX, questionY, questionW, questionH } = LAYOUT;
  const c = b.palette;
  const e = easeOutCubic(enter);
  const offsetY = (1 - e) * -70;
  const opacity = e;
  if (opacity <= 0.01) return "";

  const { lines, fontSize } = fitText(question, questionW - 120, 3, 66, 36);
  const lineHeight = fontSize * 1.22;
  const startY = questionY + questionH / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34;

  const text = lines
    .map((line, i) => `<text x="${CANVAS.width / 2}" y="${(startY + i * lineHeight).toFixed(1)}" font-family="${b.fontStack}" font-size="${fontSize}" font-weight="bold" fill="${c.cardInk}" text-anchor="middle">${esc(line)}</text>`)
    .join("\n");

  return `<g opacity="${opacity.toFixed(3)}" transform="translate(0 ${offsetY.toFixed(1)})">
  <g filter="url(#cardShadow)">
    <rect x="${questionX}" y="${questionY}" width="${questionW}" height="${questionH}" rx="34" fill="${c.cardWhite}" stroke="${c.panelStroke}" stroke-width="5"/>
  </g>
  ${text}
</g>`;
}

export type AnswerState = "hidden" | "idle" | "reading" | "correct" | "dimmed";

/** One answer option. Handles the idle state, the highlighted "reading" state,
 * the correct state with checkmark + confirmation word, and the dimmed rest. */
export function answerOption(
  b: QuizBrand,
  index: number,
  letter: string,
  text: string,
  state: AnswerState,
  enter: number,
  imageHref?: string | null,
): string {
  if (state === "hidden" || enter <= 0.01) return "";

  const { optionX, optionW, optionH, thumbSize } = LAYOUT;
  const c = b.palette;
  const y = optionY(index);
  const e = easeOutBack(enter);
  const isCorrect = state === "correct";
  const isReading = state === "reading";
  const opacity = state === "dimmed" ? 0.82 : 1;

  const fillId = isCorrect ? "correctGrad" : isReading ? "readingGrad" : "optGrad";
  const stroke = isCorrect ? c.correctStroke : isReading ? c.cyan : c.optionStroke;
  const strokeW = isReading ? 7 : 4;

  // Letter badge — angled right edge, matching the mockup's hexagon look.
  const badgeW = 168;
  const notch = 34;
  const badgePath = `M${optionX + 8} ${y + 8} H${optionX + badgeW - notch} L${optionX + badgeW + 6} ${y + optionH / 2} L${optionX + badgeW - notch} ${y + optionH - 8} H${optionX + 8} Z`;

  const hasThumb = Boolean(imageHref);
  const thumbX = optionX + badgeW + 18;
  const thumbY = y + (optionH - thumbSize) / 2;
  const textX = hasThumb ? thumbX + thumbSize + 30 : optionX + badgeW + 40;
  const textBudget = optionW - (textX - optionX) - (isCorrect ? 210 : 40);

  const { lines, fontSize } = fitText(text, textBudget, 2, 52, 26);
  const lineHeight = fontSize * 1.16;
  const textStartY = y + optionH / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34;

  const clipId = `thumbClip${index}`;
  const thumb = hasThumb
    ? `<clipPath id="${clipId}"><rect x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" rx="20"/></clipPath>
  <image href="${imageHref}" x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
  <rect x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" rx="20" fill="none" stroke="${c.white}" stroke-opacity="0.75" stroke-width="4"/>`
    : "";

  const answerText = lines
    .map((line, i) => `<text x="${textX}" y="${(textStartY + i * lineHeight).toFixed(1)}" font-family="${b.fontStack}" font-size="${fontSize}" font-weight="bold" fill="${c.white}">${esc(line)}</text>`)
    .join("\n");

  const correctWord = b.strings.correct;
  const { fontSize: correctSize } = fitText(correctWord, 200, 1, 24, 14);
  const correctMark = isCorrect
    ? `<g filter="url(#softGlow)">
    <circle cx="${optionX + optionW - 108}" cy="${y + optionH / 2 - 12}" r="42" fill="${c.white}"/>
    <path d="M${optionX + optionW - 130} ${y + optionH / 2 - 12} l16 17 l30 -34" fill="none" stroke="${c.correctBottom}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="${optionX + optionW - 108}" y="${y + optionH / 2 + 58}" font-family="${b.fontStack}" font-size="${correctSize}" font-weight="bold" fill="${c.white}" text-anchor="middle" letter-spacing="1">${esc(correctWord)}</text>`
    : "";

  const scale = isReading ? 1.015 : 0.985 + 0.015 * e;
  return `<g opacity="${opacity}" transform="translate(${(CANVAS.width * (1 - scale) / 2).toFixed(1)} ${(y * (1 - scale)).toFixed(1)}) scale(${scale.toFixed(4)})">
  <g filter="url(#cardShadow)">
    <rect x="${optionX}" y="${y}" width="${optionW}" height="${optionH}" rx="26" fill="url(#${fillId})" stroke="${stroke}" stroke-width="${strokeW}"/>
  </g>
  <path d="${badgePath}" fill="${isCorrect ? c.correctBottom : "url(#badgeGrad)"}" stroke="${c.white}" stroke-opacity="0.5" stroke-width="3"/>
  <text x="${optionX + (badgeW - notch) / 2 + 4}" y="${y + optionH / 2 + 22}" font-family="${b.fontStack}" font-size="66" font-weight="bold" fill="${c.white}" text-anchor="middle">${esc(letter)}</text>
  ${thumb}
  ${answerText}
  ${correctMark}
</g>`;
}

/** White fact card with lightbulb icon, shown after the reveal. */
export function quickFactCard(b: QuizBrand, explanation: string, enter: number): string {
  if (enter <= 0.01) return "";
  const { factX, factY, factW, factH } = LAYOUT;
  const c = b.palette;
  const e = easeOutCubic(enter);
  const offsetY = (1 - e) * 60;

  const { lines, fontSize } = fitText(explanation, factW - 300, 3, 38, 22);
  const lineHeight = fontSize * 1.3;
  const textStartY = factY + factH / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34 + 22;
  const textX = factX + 236;

  const body = lines
    .map((line, i) => `<text x="${textX}" y="${(textStartY + i * lineHeight).toFixed(1)}" font-family="${b.fontStack}" font-size="${fontSize}" fill="${c.factInk}">${esc(line)}</text>`)
    .join("\n");

  const bulbCx = factX + 130, bulbCy = factY + factH / 2;
  const tagW = 196;
  const { fontSize: tagSize } = fitText(b.strings.quickFact, tagW - 26, 1, 24, 13);

  return `<g opacity="${e.toFixed(3)}" transform="translate(0 ${offsetY.toFixed(1)})">
  <g filter="url(#cardShadow)">
    <rect x="${factX}" y="${factY}" width="${factW}" height="${factH}" rx="30" fill="${c.cardWhite}" stroke="${c.panelStroke}" stroke-width="4"/>
  </g>
  <circle cx="${bulbCx}" cy="${bulbCy}" r="72" fill="#e0f2fe" stroke="#bae6fd" stroke-width="4"/>
  <path d="M${bulbCx} ${bulbCy - 42} a34 34 0 0 1 20 61 v14 h-40 v-14 a34 34 0 0 1 20 -61 z" fill="#fbbf24" stroke="#f59e0b" stroke-width="3"/>
  <rect x="${bulbCx - 17}" y="${bulbCy + 34}" width="34" height="9" rx="4" fill="#9ca3af"/>
  <rect x="${bulbCx - 13}" y="${bulbCy + 47}" width="26" height="8" rx="4" fill="#9ca3af"/>
  <line x1="${factX + 214}" y1="${factY + 40}" x2="${factX + 214}" y2="${factY + factH - 40}" stroke="#c7d2fe" stroke-width="3"/>
  <rect x="${textX}" y="${factY + 34}" width="${tagW}" height="44" rx="22" fill="url(#pillGrad)"/>
  <text x="${textX + tagW / 2}" y="${factY + 64}" font-family="${b.fontStack}" font-size="${tagSize}" font-weight="bold" fill="${c.white}" text-anchor="middle" letter-spacing="2">${esc(b.strings.quickFact)}</text>
  ${body}
</g>`;
}

export function footer(b: QuizBrand): string {
  const y = LAYOUT.footerY;
  const c = b.palette;
  // The two rules leave ~500px of clear space between them.
  const { fontSize } = fitText(b.strings.footer, 470, 1, 30, 16);
  return `<line x1="96" y1="${y - 9}" x2="286" y2="${y - 9}" stroke="${c.cyan}" stroke-width="4" stroke-linecap="round"/>
<line x1="794" y1="${y - 9}" x2="984" y2="${y - 9}" stroke="${c.cyan}" stroke-width="4" stroke-linecap="round"/>
<text x="${CANVAS.width / 2}" y="${y}" font-family="${b.fontStack}" font-size="${fontSize}" font-weight="bold" fill="${c.footer}" text-anchor="middle" letter-spacing="7">${esc(b.strings.footer)}</text>`;
}

/** Call-to-action banner shown after a question — "tap like" / "subscribe". */
export function ctaBanner(b: QuizBrand, kind: "like" | "subscribe", enter: number): string {
  if (enter <= 0.01) return "";
  const e = easeOutCubic(enter);
  const c = b.palette;
  const { factX, factW } = LAYOUT;
  const y = LAYOUT.factY;
  const h = 232;
  const cx = factX + 132, cy = y + h / 2;

  const { heading, sub } = b.strings.cta[kind];
  const textBudget = factW - 250 - 30;
  const { fontSize: headSize } = fitText(heading, textBudget, 1, 42, 24);
  const { fontSize: subSize } = fitText(sub, textBudget, 1, 58, 30);

  const icon = kind === "like"
    // Thumbs-up
    ? `<path d="M${cx - 30} ${cy + 6} h22 v46 h-22 a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z" fill="#ffffff"/>
       <path d="M${cx - 2} ${cy + 52} v-46 l22 -40 a12 12 0 0 1 20 12 l-8 22 h30 a12 12 0 0 1 11 15 l-12 40 a14 14 0 0 1 -13 10 h-50 z" fill="#ffffff"/>`
    // Bell
    : `<path d="M${cx} ${cy - 52} a34 34 0 0 1 34 34 v22 l14 20 h-96 l14 -20 v-22 a34 34 0 0 1 34 -34 z" fill="#ffffff"/>
       <circle cx="${cx}" cy="${cy - 56}" r="8" fill="#ffffff"/>
       <path d="M${cx - 14} ${cy + 32} a14 14 0 0 0 28 0 z" fill="#ffffff"/>`;

  return `<g opacity="${e.toFixed(3)}" transform="translate(0 ${((1 - e) * 40).toFixed(1)})">
  <g filter="url(#cardShadow)">
    <rect x="${factX}" y="${y}" width="${factW}" height="${h}" rx="30" fill="url(#pillGrad)" stroke="${c.cyan}" stroke-width="5"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="76" fill="#ffffff" fill-opacity="0.18"/>
  ${icon}
  <text x="${factX + 250}" y="${y + 96}" font-family="${b.fontStack}" font-size="${headSize}" font-weight="bold" fill="#ffffff" letter-spacing="1">${esc(heading)}</text>
  <text x="${factX + 250}" y="${y + 166}" font-family="${b.fontStack}" font-size="${subSize}" font-weight="bold" fill="${c.highlight}" letter-spacing="2">${esc(sub)}</text>
</g>`;
}

/** Stacks pre-wrapped lines around the slot the approved design gives them. */
function stack(lines: string[], fontSize: number, firstBaselineY: number, lineFactor: number): { line: string; y: number }[] {
  return lines.map((line, i) => ({ line, y: firstBaselineY + i * fontSize * lineFactor }));
}

/** Closing card: score prompt, thanks, and the share line. */
export function outroCard(b: QuizBrand, enter: number): string {
  const e = easeOutCubic(enter);
  const c = b.palette;
  const s = b.strings;

  // Each block is fitted to its own slot, so a language that needs more words
  // keeps the approved composition instead of overflowing it.
  const title = fitText(`${s.outroTitle[0]} ${s.outroTitle[1]}`, 940, 2, 88, 44);
  const pill = fitText(s.outroPill, 720, 1, 44, 22);
  const thanks = fitText(s.thanks, 940, 1, 72, 38);
  const share = fitText(`${s.shareLines[0]} ${s.shareLines[1]}`, 820, 2, 44, 26);
  const follow = fitText(s.followLine, 900, 1, 38, 20);

  const titleLines = stack(title.lines, title.fontSize, 720, 1.2);
  const shareLines = stack(share.lines, share.fontSize, 1310, 1.4);
  const text = (line: string, y: number, size: number, fill: string, extra = "") =>
    `<text x="${CANVAS.width / 2}" y="${y.toFixed(0)}" font-family="${b.fontStack}" font-size="${size}" font-weight="bold" fill="${fill}" text-anchor="middle"${extra}>${esc(line)}</text>`;

  return `<g opacity="${e.toFixed(3)}">
  ${titleLines.map(({ line, y }) => text(line, y, title.fontSize, c.white)).join("\n  ")}
  <g filter="url(#cardShadow)">
    <rect x="150" y="900" width="780" height="118" rx="59" fill="url(#pillGrad)" stroke="${c.optionStroke}" stroke-width="4"/>
  </g>
  ${text(pill.lines.join(" "), 976, pill.fontSize, c.white)}

  ${text(thanks.lines.join(" "), 1150, thanks.fontSize, c.highlight)}

  <g filter="url(#cardShadow)">
    <rect x="90" y="1230" width="900" height="200" rx="34" fill="${c.cardWhite}" stroke="${c.panelStroke}" stroke-width="4"/>
  </g>
  ${shareLines.map(({ line, y }) => text(line, y, share.fontSize, c.cardInk)).join("\n  ")}

  ${text(follow.lines.join(" "), 1530, follow.fontSize, c.panelStroke, ` letter-spacing="3"`)}
</g>`;
}
