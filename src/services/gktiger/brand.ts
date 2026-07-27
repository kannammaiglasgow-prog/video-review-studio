/** GK Tiger visual identity — original branding for this channel only.
 * Palette: orange / black / yellow / white, per the channel brief. All values
 * live here so the look stays consistent across intro, questions and outro. */

export const BRAND = {
  width: 1080,
  height: 1920,

  // 0xRRGGBB with @alpha, in the form FFmpeg's drawbox/drawtext want.
  bg: "0x101014",
  headerBar: "0xF57C1F",       // orange
  headerText: "0xFFFFFF",
  accentYellow: "0xFFC93C",
  cardBg: "0x1E1E28",
  cardBorder: "0x3A3A4A",
  cardText: "0xFFFFFF",
  letterBadge: "0xF57C1F",
  correctGreen: "0x22C55E",
  highlightYellow: "0xFFC93C",
  questionText: "0xFFFFFF",
  countdownText: "0xFFC93C",
  factText: "0xFFC93C",
  outroText: "0xFFFFFF",

  // Layout (1080x1920 canvas)
  headerH: 190,
  progressY: 215,
  questionY: 330,
  questionMaxLines: 3,

  cardX: 70,
  cardW: 940,
  cardH: 300,
  cardGap: 40,
  cardsStartY: 660,

  photoInset: 22,     // photo sits inside the card with this margin
  get photoSize() { return this.cardH - this.photoInset * 2; },

  fontQuestion: 62,
  fontOption: 54,
  fontHeader: 60,
  fontProgress: 38,
  fontCountdown: 260,
  fontFact: 40,
  fontOutro: 58,
} as const;

export function cardY(index: number): number {
  return BRAND.cardsStartY + index * (BRAND.cardH + BRAND.cardGap);
}

/** Wrap text to a rough character budget per line — drawtext has no wrapping,
 * so long question text must be broken up before it's written to the textfile. */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.join("\n");
}
