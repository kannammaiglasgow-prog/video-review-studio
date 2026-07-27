/** Quiz template — layout and text metrics taken from the approved design
 * mockup. The geometry here is fixed for every channel: only the palette,
 * wordmark and wording change, and those live in ../brand.ts so a new channel
 * can never move a card or resize a button by accident. */

export const CANVAS = { width: 1080, height: 1920, fps: 30 } as const;

export const LAYOUT = {
  safeX: 60,

  // Header — mascot + wordmark
  mascotX: 232,
  mascotY: 34,
  mascotSize: 172,
  wordmarkY: 128,

  // "QUESTION x / y" pill
  pillW: 300,
  pillH: 56,
  pillY: 220,

  // Progress bar
  progressX: 218,
  progressY: 302,
  progressW: 474,
  progressH: 16,

  // Circular countdown
  timerCx: 822,
  timerCy: 238,
  timerR: 92,
  timerStroke: 15,

  // Question card
  questionX: 60,
  questionY: 356,
  questionW: 960,
  questionH: 340,

  // Answer options — taller than the flat design so each can carry a
  // thumbnail, using the empty space that sat below the options.
  optionX: 62,
  optionW: 956,
  optionH: 188,
  optionGap: 38,
  optionsTop: 730,

  // Option thumbnail (sits between the letter badge and the answer text)
  thumbSize: 150,
  thumbInset: 19,

  // Quick fact card
  factX: 60,
  factW: 960,
  factH: 232,
  factY: 1418,

  footerY: 1858,
} as const;

export function optionY(index: number): number {
  return LAYOUT.optionsTop + index * (LAYOUT.optionH + LAYOUT.optionGap);
}

/** Escapes text for safe inclusion in SVG markup. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Per-character advance as a fraction of the font size — enough to wrap and
 * auto-shrink reliably without shipping a font-metrics library.
 *
 * Both figures are calibrated against strings actually rasterised by sharp
 * (see quiz-measure): Arial bold Latin averages ~0.60em, and Nirmala UI bold
 * Tamil averages ~0.73em PER CODEPOINT once the stacking marks are amortised
 * across the base glyphs. A flat per-codepoint Tamil factor (rather than a
 * base/mark split) both matched the measurement and, critically, stopped the
 * wordmark under-measuring and overflowing. 0.78 leaves a small safety margin
 * so a line is never estimated narrower than it renders. */
const LATIN_EM = 0.6;
const TAMIL_EM = 0.78;

const TAMIL_RANGE = /[஀-௿]/;

function charEm(ch: string): number {
  return TAMIL_RANGE.test(ch) ? TAMIL_EM : LATIN_EM;
}

export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontSize;
}

/** Wraps to fit `maxWidth`, shrinking the font until it fits `maxLines`.
 * Returns the chosen size so long questions/answers never overflow the card. */
export function fitText(
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);

  for (let size = startSize; size >= minSize; size -= 2) {
    const lines: string[] = [];
    let current = "";
    let overflowed = false;

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
        if (lines.length > maxLines) { overflowed = true; break; }
      } else {
        current = candidate;
      }
    }
    if (!overflowed) {
      if (current) lines.push(current);
      if (lines.length <= maxLines) return { lines, fontSize: size };
    }
  }

  // Nothing fit even at the floor size — hard-truncate so layout never breaks.
  // Cut by measured width rather than a character count, so a Tamil line is
  // trimmed at the point it actually overflows.
  const size = minSize;
  const lines: string[] = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    let take = 0;
    while (take < rest.length && textWidth(rest.slice(0, take + 1), size) <= maxWidth) take += 1;
    if (take === 0) take = 1;
    lines.push(rest.slice(0, take));
    rest = rest.slice(take);
  }
  if (rest.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  }
  return { lines, fontSize: size };
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeOutBack = (t: number): number => {
  const c = 1.70158, c3 = c + 1;
  const x = Math.min(1, Math.max(0, t));
  return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
