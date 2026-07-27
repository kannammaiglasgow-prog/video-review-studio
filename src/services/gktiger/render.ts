import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runFfmpeg } from "@/services/render/ffmpeg";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { synthesizeAtRate } from "@/services/providers/edge-tts";
import type { GkQuizQuestion } from "@/lib/database";
import { CANVAS, LAYOUT } from "./template/theme";
import { renderFrameSvg } from "./template/frame";
import { buildTimeline, CTA_TEXT, type CuePoint, type QuizSlideData, type SlideTiming, type Timeline } from "./template/timeline";
import { getMascotDataUri } from "./assets";
import { downloadSquareImages } from "@/services/providers/pollinations";
import { searchStockImages } from "@/services/providers/stock-media";

/** Energetic quiz-show delivery. Lines are fitted into the template's fixed
 * animation slots, so this mainly controls how natural the reads sound. */
const SPEECH_RATE = "+18%";

/** Sound effects, reusing the repo's existing synthesized (copyright-safe)
 * cues in public/audio. Volume is per-cue so nothing buries the voice-over. */
const SFX: Record<CuePoint["sound"], { file: string; volume: number }> = {
  question: { file: "whoosh.wav", volume: 0.5 },
  option: { file: "swipe.wav", volume: 0.32 },
  tick: { file: "page-flip.wav", volume: 0.45 },
  correct: { file: "sparkle.wav", volume: 0.75 },
};

export type GkRenderResult = {
  outputPath: string;
  subtitlePath: string;
  durationSeconds: number;
  frameCount: number;
};

export function toSlideData(questions: GkQuizQuestion[], countdownSeconds: number): QuizSlideData[] {
  return questions.map((q, i) => ({
    questionNumber: i + 1,
    totalQuestions: questions.length,
    question: q.question,
    answers: [
      { letter: "A", text: q.choiceA },
      { letter: "B", text: q.choiceB },
      { letter: "C", text: q.choiceC },
    ],
    correctAnswer: q.correct,
    explanation: q.explanation,
    countdownSeconds,
  }));
}

/** Illustration prompt for one answer choice. Deliberately literal and
 * uncluttered — it has to read at 150px on a phone — and it must never hint
 * at which option is correct. */
function optionImagePrompt(choice: string, category: string): string {
  return `A clear, simple, brightly lit photograph of ${choice}, single centered subject filling the frame, plain uncluttered background, vibrant colors, sharp focus. Educational quiz illustration about ${category}. No text, no words, no letters, no watermark.`;
}

/** Generates one illustration per answer option and returns them as small
 * data: URIs, ready to embed in each frame's SVG. Downscaled hard on purpose:
 * they render at 150px, and a big payload would be re-decoded on every one of
 * the ~2500 frames. A failed image just leaves that option text-only. */
async function buildOptionImages(
  slides: QuizSlideData[],
  category: string,
  workDir: string,
): Promise<void> {
  const prompts: string[] = [];
  const targets: string[] = [];
  const index: { slide: number; option: number }[] = [];

  slides.forEach((slide, si) => {
    slide.answers.forEach((answer, oi) => {
      prompts.push(optionImagePrompt(answer.text, category));
      targets.push(path.join(workDir, `opt_${si}_${oi}`));
      index.push({ slide: si, option: oi });
    });
  });

  // Free stock first (real photos, instant, no rate limit); anything stock
  // can't cover falls back to an AI illustration.
  const files: (string | null)[] = new Array(prompts.length).fill(null);
  await Promise.all(
    index.map(async (ref, i) => {
      const term = slides[ref.slide].answers[ref.option].text;
      try {
        const hits = await searchStockImages(term, "landscape", 3);
        for (const hit of hits) {
          const res = await fetch(hit.url, { signal: AbortSignal.timeout(20_000) });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const file = `${targets[i]}.jpg`;
          await fs.writeFile(file, buf);
          files[i] = file;
          break;
        }
      } catch {
        // fall through to AI
      }
    }),
  );

  const missing = files.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
  if (missing.length > 0) {
    console.log(`[GKTiger] ${missing.length}/${prompts.length} option images not on stock — generating with AI`);
    const generated = await downloadSquareImages(
      missing.map((i) => prompts[i]),
      320,
      missing.map((i) => targets[i]),
    );
    missing.forEach((target, k) => { files[target] = generated[k]; });
  }

  await Promise.all(
    files.map(async (file, i) => {
      if (!file) return;
      const { slide, option } = index[i];
      try {
        const buf = await sharp(file)
          .resize(LAYOUT.thumbSize * 2, LAYOUT.thumbSize * 2, { fit: "cover" })
          .jpeg({ quality: 78 })
          .toBuffer();
        slides[slide].answers[option].image = `data:image/jpeg;base64,${buf.toString("base64")}`;
      } catch {
        // Leave this option text-only.
      }
    }),
  );
}

type VoiceLine = { text: string; at: number; path: string };

/** Voice-over lines, each pinned to the template moment it belongs to — the
 * question as its card lands, each option as it slides in, the answer on the
 * reveal. The template owns the timing; audio is placed into it. */
function planVoiceLines(timeline: Timeline, workDir: string): VoiceLine[] {
  const lines: VoiceLine[] = [];
  let n = 0;
  const add = (text: string, at: number) => {
    lines.push({ text, at, path: path.join(workDir, `v_${String(n++).padStart(3, "0")}.wav`) });
  };

  timeline.slides.forEach((slide: SlideTiming) => {
    const { data } = slide;
    add(data.question, slide.questionInAt + 0.35);
    data.answers.forEach((a, i) => add(`${a.letter}. ${a.text}`, slide.optionReadAt[i] + 0.05));
    const correct = data.answers.find((a) => a.letter.toUpperCase() === data.correctAnswer.toUpperCase());
    add(`It's ${data.correctAnswer}. ${correct?.text ?? ""}!`, slide.revealAt + 0.2);
    // Like after Q1, subscribe after Q2 — spoken over the matching banner.
    if (slide.cta && slide.ctaAt !== null) add(CTA_TEXT[slide.cta].spoken, slide.ctaAt + 0.15);
  });

  add("How many did you get right? Comment your score below!", timeline.outroStart + 0.25);
  add("Thanks for watching! Share this with your favourite person in the world.", timeline.outroStart + 3.0);
  return lines;
}

/** SRT matching the voice-over exactly — same text, same timings. Shipped as a
 * sidecar rather than burned in, since the template already shows the text. */
async function writeSubtitles(lines: (VoiceLine & { duration: number })[], outPath: string): Promise<void> {
  const stamp = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const pad = (v: number, n = 2) => String(v).padStart(n, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`;
  };
  const body = lines
    .map((l, i) => `${i + 1}\n${stamp(l.at)} --> ${stamp(l.at + l.duration)}\n${l.text}\n`)
    .join("\n");
  await fs.writeFile(outPath, body, "utf8");
}

/** Mixes voice lines, sound-effect cues and background music into one track,
 * each placed at its exact timeline offset via adelay. */
async function buildAudio(
  lines: (VoiceLine & { duration: number })[],
  cues: CuePoint[],
  total: number,
  workDir: string,
): Promise<string> {
  const audioDir = path.resolve(process.cwd(), "public/audio");
  const inputs: string[] = [];
  const filters: string[] = [];
  const mixLabels: string[] = [];
  let idx = 0;

  for (const line of lines) {
    const ms = Math.round(line.at * 1000);
    inputs.push("-i", line.path);
    filters.push(`[${idx}:a]aresample=44100,adelay=${ms}|${ms},volume=1.0[v${idx}]`);
    mixLabels.push(`[v${idx}]`);
    idx += 1;
  }

  for (const cue of cues) {
    const spec = SFX[cue.sound];
    const file = path.join(audioDir, spec.file);
    try {
      await fs.access(file);
    } catch {
      continue; // Missing effect is not worth failing a render over.
    }
    const ms = Math.round(cue.at * 1000);
    inputs.push("-i", file);
    filters.push(`[${idx}:a]aresample=44100,volume=${spec.volume},adelay=${ms}|${ms}[v${idx}]`);
    mixLabels.push(`[v${idx}]`);
    idx += 1;
  }

  // Low background music under everything (looped to length).
  const bgm = path.join(audioDir, "bgm-devotional.wav");
  let hasBgm = true;
  try {
    await fs.access(bgm);
  } catch {
    hasBgm = false;
  }
  if (hasBgm) {
    inputs.push("-stream_loop", "-1", "-i", bgm);
    filters.push(`[${idx}:a]aresample=44100,volume=0.10[v${idx}]`);
    mixLabels.push(`[v${idx}]`);
    idx += 1;
  }

  const outPath = path.join(workDir, "mix.wav");
  const filter = `${filters.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=0:${total.toFixed(3)},alimiter=limit=0.95[out]`;

  await runFfmpeg([
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", "[out]",
    "-t", total.toFixed(3),
    outPath,
  ]);
  return outPath;
}

/** Renders every frame of the template to PNG. Sharp rasterises the SVG, which
 * is what lets the design keep its gradients, glows and rounded cards — none
 * of which FFmpeg's drawing filters can produce. */
async function renderFrames(timeline: Timeline, framesDir: string, mascot: string | null): Promise<number> {
  await fs.mkdir(framesDir, { recursive: true });
  const frameCount = Math.ceil(timeline.total * CANVAS.fps);
  const CONCURRENCY = 4;

  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= frameCount) return;
      const svg = renderFrameSvg(timeline, i / CANVAS.fps, mascot);
      await sharp(Buffer.from(svg))
        .png({ compressionLevel: 6 })
        .toFile(path.join(framesDir, `f_${String(i).padStart(5, "0")}.png`));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return frameCount;
}

/** Full GK Tiger Short: template frames + synchronised voice/SFX/music. */
export async function renderQuizVideo(
  questions: GkQuizQuestion[],
  mediaDir: string,
  options: { countdownSeconds?: number; voice?: string; category?: string; onPhase?: (phase: "rendering") => void } = {},
): Promise<GkRenderResult> {
  const countdownSeconds = options.countdownSeconds ?? 10;
  const voice = options.voice ?? "Female — Energetic";

  const workDir = path.join(mediaDir, "work");
  const framesDir = path.join(workDir, "frames");
  await fs.mkdir(workDir, { recursive: true });

  const slides = toSlideData(questions, countdownSeconds);
  if (options.category) {
    await buildOptionImages(slides, options.category, workDir);
  }
  options.onPhase?.("rendering");
  const timeline = buildTimeline(slides);
  const mascot = await getMascotDataUri();

  // Voice-over first: each line is measured so the SRT is accurate.
  const planned = planVoiceLines(timeline, workDir);
  const lines: (VoiceLine & { duration: number })[] = [];
  for (const line of planned) {
    await synthesizeAtRate(line.text, line.path, voice, "en", SPEECH_RATE);
    lines.push({ ...line, duration: await probeAudioDuration(line.path) });
  }

  const [frameCount, audioPath] = await Promise.all([
    renderFrames(timeline, framesDir, mascot),
    buildAudio(lines, timeline.cues, timeline.total, workDir),
  ]);

  const subtitlePath = path.join(mediaDir, "captions.srt");
  await writeSubtitles(lines, subtitlePath);

  const outputPath = path.join(mediaDir, "output.mp4");
  await runFfmpeg([
    "-y",
    "-framerate", String(CANVAS.fps),
    "-i", path.join(framesDir, "f_%05d.png"),
    "-i", audioPath,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-r", String(CANVAS.fps),
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outputPath,
  ]);

  // Frames are large and disposable once encoded.
  await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});

  return { outputPath, subtitlePath, durationSeconds: timeline.total, frameCount };
}
