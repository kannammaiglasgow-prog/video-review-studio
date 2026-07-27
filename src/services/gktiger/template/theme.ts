/** GK Tiger quiz template — colours and layout taken from the approved design
 * mockup. This file is the single source of truth for the look; components.ts
 * and frame.ts read everything from here so the design stays identical across
 * every video and only the quiz data changes. */

export const CANVAS = { width: 1080, height: 1920, fps: 30 } as const;

export const COLOR = {
  bgTop: "#1b2ec9",
  bgMid: "#2a1f9e",
  bgBottom: "#7c3aed",
  bgGlowA: "#4f46e5",
  bgGlowB: "#a855f7",

  panelStroke: "#7dd3fc",
  cyan: "#22d3ee",
  cyanDeep: "#0ea5e9",

  optionTop: "#3b46d8",
  optionBottom: "#2a2a9e",
  optionStroke: "#8b93ff",

  badgeTop: "#8b5cf6",
  badgeBottom: "#6d28d9",

  correctTop: "#2dd4a7",
  correctBottom: "#14b8a6",
  correctStroke: "#5eead4",

  cardWhite: "#ffffff",
  cardInk: "#0b1440",
  factInk: "#1e2352",

  pillTop: "#8b5cf6",
  pillBottom: "#6d28d9",

  white: "#ffffff",
  footer: "#dbeafe",
} as const;

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

  // Answer options
  optionX: 62,
  optionW: 956,
  optionH: 150,
  optionGap: 44,
  optionsTop: 736,

  // Quick fact card
  factX: 60,
  factW: 960,
  factH: 232,
  factY: 1322,

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

/** Arial-bold advance widths average ~0.56em; good enough to wrap and
 * auto-shrink reliably without shipping a font-metrics library. */
const AVG_CHAR_EM = 0.56;

export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * AVG_CHAR_EM;
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
  const size = minSize;
  const perLine = Math.max(8, Math.floor(maxWidth / (size * AVG_CHAR_EM)));
  const lines: string[] = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    lines.push(rest.slice(0, perLine));
    rest = rest.slice(perLine);
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
