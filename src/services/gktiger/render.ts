import fs from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "@/services/render/ffmpeg";
import { probeAudioDuration } from "@/services/render/ffprobe";
import { synthesizeAtRate } from "@/services/providers/edge-tts";
import type { GkQuizQuestion } from "@/lib/database";
import { BRAND, cardY, wrapText } from "./brand";

const LETTERS = ["A", "B", "C"] as const;
/** Energetic quiz-show pace. Also the main lever keeping a 4-question video
 * under the 60s Shorts limit — at default rate the same script runs ~110s. */
const SPEECH_RATE = "+30%";

/** FFmpeg filter-script paths need forward slashes and an escaped drive colon
 * ("C:/x" → "C\:/x"), on every platform we might read a font/textfile from. */
function ffPath(p: string): string {
  return p.replaceAll("\\", "/").replace(/^([A-Za-z])\\?:/, "$1\\:");
}

type Segment = {
  /** null = silence of `seconds` (used to hold a beat after the reveal). */
  text: string | null;
  seconds: number;
  audioPath: string | null;
  /** What the viewer is looking at while this plays. */
  kind: "intro" | "question" | "option" | "countdown" | "answer" | "fact" | "outro";
  questionIndex: number;
  optionIndex?: number;
  start: number;
  end: number;
};

/** Builds the spoken script as discrete lines so each one can be timed
 * independently — the on-screen highlight has to land exactly when the voice
 * says that option, which a single narration file can't give us. */
function buildScript(questions: GkQuizQuestion[]): Omit<Segment, "audioPath" | "seconds" | "start" | "end">[] {
  const out: Omit<Segment, "audioPath" | "seconds" | "start" | "end">[] = [];
  out.push({ text: "Only geniuses get all four!", kind: "intro", questionIndex: -1 });

  // Every spoken line is kept deliberately short — four questions each need a
  // real 3s countdown, and the whole thing has to land under 60s. The question
  // number and the interesting fact are shown on screen rather than narrated
  // for the same reason.
  questions.forEach((q, qi) => {
    out.push({ text: q.question, kind: "question", questionIndex: qi });
    out.push({ text: `A. ${q.choiceA}`, kind: "option", questionIndex: qi, optionIndex: 0 });
    out.push({ text: `B. ${q.choiceB}`, kind: "option", questionIndex: qi, optionIndex: 1 });
    out.push({ text: `C. ${q.choiceC}`, kind: "option", questionIndex: qi, optionIndex: 2 });
    out.push({ text: "Three, two, one!", kind: "countdown", questionIndex: qi });
    const correctText = q.correct === "A" ? q.choiceA : q.correct === "B" ? q.choiceB : q.choiceC;
    out.push({ text: `It's ${q.correct}. ${correctText}!`, kind: "answer", questionIndex: qi });
  });

  out.push({
    text: "How many did you get right? Comment your score and follow GK Tiger!",
    kind: "outro",
    questionIndex: -1,
  });
  return out;
}

/** Synthesises every line, measures it, and lays the timeline out end to end.
 * The countdown line is padded to a full 3s so the on-screen 3-2-1 always has
 * a whole second per number regardless of how fast the voice reads it. */
async function buildTimeline(
  script: ReturnType<typeof buildScript>,
  workDir: string,
  voice: string,
): Promise<{ segments: Segment[]; total: number }> {
  const segments: Segment[] = [];
  let cursor = 0;

  for (let i = 0; i < script.length; i += 1) {
    const line = script[i];
    const audioPath = path.join(workDir, `seg_${String(i).padStart(2, "0")}.wav`);
    // Punchy quiz-show delivery, and the speed is what keeps four questions
    // inside the 60s Shorts ceiling.
    await synthesizeAtRate(line.text!, audioPath, voice, "en", SPEECH_RATE);
    let seconds = await probeAudioDuration(audioPath);

    // A small tail on each line stops the next one treading on it.
    seconds += 0.12;
    // The countdown holds a full 3s so viewers actually get time to choose,
    // regardless of how fast the voice reads it.
    if (line.kind === "countdown") seconds = Math.max(seconds, 3.0);
    if (line.kind === "answer") seconds += 0.5;

    segments.push({ ...line, audioPath, seconds, start: cursor, end: cursor + seconds });
    cursor += seconds;
  }

  return { segments, total: cursor };
}

/** One WAV for the whole video: every line, in order, padded to the slot the
 * timeline gave it (so audio and visuals can never drift apart). */
async function concatAudio(segments: Segment[], workDir: string, total: number): Promise<string> {
  const inputs: string[] = [];
  const parts: string[] = [];

  segments.forEach((seg, i) => {
    inputs.push("-i", seg.audioPath!);
    // Pad each line out to its full timeline slot, then stitch in order.
    parts.push(`[${i}:a]aresample=44100,apad=whole_dur=${seg.seconds.toFixed(3)},atrim=0:${seg.seconds.toFixed(3)},asetpts=N/SR/TB[a${i}]`);
  });

  const concatInputs = segments.map((_, i) => `[a${i}]`).join("");
  const filter = `${parts.join(";")};${concatInputs}concat=n=${segments.length}:v=0:a=1[out]`;

  const outPath = path.join(workDir, "voice.wav");
  await runFfmpeg([
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", "[out]",
    "-t", total.toFixed(3),
    outPath,
  ]);
  return outPath;
}

/** SRT sidecar matching the voice-over exactly (same segments, same timings).
 * Not burned in — the quiz text is already on screen, so this ships as an
 * upload-alongside caption file instead of cluttering the frame. */
async function writeSubtitles(segments: Segment[], outPath: string): Promise<void> {
  const stamp = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    const milli = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${sec},${milli}`;
  };
  const body = segments
    .map((seg, i) => `${i + 1}\n${stamp(seg.start)} --> ${stamp(seg.end)}\n${seg.text}\n`)
    .join("\n");
  await fs.writeFile(outPath, body, "utf8");
}

/** drawtext can't take arbitrary strings safely on a Windows command line, so
 * every string goes to its own file and is referenced with textfile=. */
async function textFile(workDir: string, name: string, content: string): Promise<string> {
  const file = path.join(workDir, `t_${name}.txt`);
  await fs.writeFile(file, content, "utf8");
  return ffPath(file);
}

type BuildArgs = {
  questions: GkQuizQuestion[];
  segments: Segment[];
  total: number;
  optionImages: (string | null)[][];
  workDir: string;
  audioPath: string;
  outputPath: string;
};

/** Composites the whole quiz in one FFmpeg pass: branded background, header,
 * per-question cards + photos, spoken-option highlight, 3-2-1 countdown and a
 * green correct-answer reveal. Written to a filter script because the graph is
 * far past any safe command-line length. */
async function buildAndRun(args: BuildArgs): Promise<void> {
  const { questions, segments, total, optionImages, workDir, audioPath, outputPath } = args;
  const fontPath = ffPath(path.resolve(process.cwd(), "arial.ttf"));
  const between = (a: number, b: number) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`;

  const inputs: string[] = [];
  const filters: string[] = [];
  let label = "[base]";

  // Base canvas + persistent brand header.
  filters.push(`color=c=${BRAND.bg}:s=${BRAND.width}x${BRAND.height}:d=${total.toFixed(3)}:r=30${label}`);
  filters.push(`${label}drawbox=x=0:y=0:w=${BRAND.width}:h=${BRAND.headerH}:color=${BRAND.headerBar}:t=fill[hdr]`);
  label = "[hdr]";
  filters.push(`${label}drawbox=x=0:y=${BRAND.headerH}:w=${BRAND.width}:h=8:color=${BRAND.accentYellow}:t=fill[hdr2]`);
  label = "[hdr2]";

  const titleFile = await textFile(workDir, "title", "GK TIGER QUIZ");
  filters.push(`${label}drawtext=fontfile='${fontPath}':textfile='${titleFile}':fontsize=${BRAND.fontHeader}:fontcolor=${BRAND.headerText}:x=(w-text_w)/2:y=62[t0]`);
  label = "[t0]";

  let n = 0;
  const next = () => `[v${n++}]`;

  // Photo inputs first so their stream indexes are stable. `inputCount` is
  // tracked explicitly — each image contributes 4 argv entries ("-loop 1 -i
  // path"), so it can't be derived from inputs.length.
  const photoIndexOf = new Map<string, number>();
  let inputCount = 0;
  questions.forEach((_, qi) => {
    optionImages[qi]?.forEach((img, oi) => {
      if (!img) return;
      photoIndexOf.set(`${qi}:${oi}`, inputCount);
      inputs.push("-loop", "1", "-i", img);
      inputCount += 1;
    });
  });

  // ── Per-question visuals ────────────────────────────────────────────────
  for (let qi = 0; qi < questions.length; qi += 1) {
    const q = questions[qi];
    const qSegs = segments.filter((s) => s.questionIndex === qi);
    if (qSegs.length === 0) continue;
    const qStart = qSegs[0].start;
    const qEnd = qSegs[qSegs.length - 1].end;
    const answerSeg = qSegs.find((s) => s.kind === "answer");
    const revealAt = answerSeg ? answerSeg.start : qEnd;
    const correctIdx = q.correct === "A" ? 0 : q.correct === "B" ? 1 : 2;

    // Cards: neutral until the reveal, then the correct one goes green.
    for (let oi = 0; oi < 3; oi += 1) {
      const y = cardY(oi);
      const isCorrect = oi === correctIdx;
      const out1 = next();
      filters.push(
        `${label}drawbox=x=${BRAND.cardX}:y=${y}:w=${BRAND.cardW}:h=${BRAND.cardH}:color=${BRAND.cardBg}:t=fill:enable='${between(qStart, qEnd)}'${out1}`
      );
      label = out1;

      // Spoken-option highlight (yellow outline while the voice reads it).
      const optSeg = qSegs.find((s) => s.kind === "option" && s.optionIndex === oi);
      if (optSeg) {
        const out2 = next();
        filters.push(
          `${label}drawbox=x=${BRAND.cardX}:y=${y}:w=${BRAND.cardW}:h=${BRAND.cardH}:color=${BRAND.highlightYellow}:t=8:enable='${between(optSeg.start, optSeg.end)}'${out2}`
        );
        label = out2;
      }

      // Reveal: fill the correct card green for the rest of the question.
      if (isCorrect) {
        const out3 = next();
        filters.push(
          `${label}drawbox=x=${BRAND.cardX}:y=${y}:w=${BRAND.cardW}:h=${BRAND.cardH}:color=${BRAND.correctGreen}@0.85:t=fill:enable='${between(revealAt, qEnd)}'${out3}`
        );
        label = out3;
      }

      // Letter badge.
      const badgeOut = next();
      filters.push(
        `${label}drawbox=x=${BRAND.cardX + BRAND.cardW - 110}:y=${y + BRAND.cardH / 2 - 45}:w=90:h=90:color=${BRAND.letterBadge}:t=fill:enable='${between(qStart, qEnd)}'${badgeOut}`
      );
      label = badgeOut;
    }

    // Option photos on top of the cards.
    for (let oi = 0; oi < 3; oi += 1) {
      const idx = photoIndexOf.get(`${qi}:${oi}`);
      if (idx === undefined) continue;
      const y = cardY(oi) + BRAND.photoInset;
      const size = BRAND.photoSize;
      const scaled = `[p${qi}_${oi}]`;
      filters.push(`[${idx}:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},setsar=1${scaled}`);
      const out = next();
      filters.push(
        `${label}${scaled}overlay=x=${BRAND.cardX + BRAND.photoInset}:y=${y}:enable='${between(qStart, qEnd)}'${out}`
      );
      label = out;
    }

    // Progress + question text.
    const progFile = await textFile(workDir, `prog${qi}`, `Question ${qi + 1} of ${questions.length}`);
    const pOut = next();
    filters.push(
      `${label}drawtext=fontfile='${fontPath}':textfile='${progFile}':fontsize=${BRAND.fontProgress}:fontcolor=${BRAND.accentYellow}:x=(w-text_w)/2:y=${BRAND.progressY}:enable='${between(qStart, qEnd)}'${pOut}`
    );
    label = pOut;

    const qFile = await textFile(workDir, `q${qi}`, wrapText(q.question, 30, BRAND.questionMaxLines));
    const qOut = next();
    filters.push(
      `${label}drawtext=fontfile='${fontPath}':textfile='${qFile}':fontsize=${BRAND.fontQuestion}:fontcolor=${BRAND.questionText}:line_spacing=14:x=(w-text_w)/2:y=${BRAND.questionY}:enable='${between(qStart, qEnd)}'${qOut}`
    );
    label = qOut;

    // Option label text + letter, sitting to the right of each photo.
    const choices = [q.choiceA, q.choiceB, q.choiceC];
    for (let oi = 0; oi < 3; oi += 1) {
      const y = cardY(oi);
      const textX = BRAND.cardX + BRAND.photoInset * 2 + BRAND.photoSize;
      const cFile = await textFile(workDir, `q${qi}o${oi}`, wrapText(choices[oi], 16, 2));
      const cOut = next();
      filters.push(
        `${label}drawtext=fontfile='${fontPath}':textfile='${cFile}':fontsize=${BRAND.fontOption}:fontcolor=${BRAND.cardText}:line_spacing=10:x=${textX}:y=${y + BRAND.cardH / 2}-text_h/2:enable='${between(qStart, qEnd)}'${cOut}`
      );
      label = cOut;

      const lFile = await textFile(workDir, `q${qi}l${oi}`, LETTERS[oi]);
      const lOut = next();
      filters.push(
        `${label}drawtext=fontfile='${fontPath}':textfile='${lFile}':fontsize=52:fontcolor=${BRAND.headerText}:x=${BRAND.cardX + BRAND.cardW - 110}+45-text_w/2:y=${y + BRAND.cardH / 2}-text_h/2:enable='${between(qStart, qEnd)}'${lOut}`
      );
      label = lOut;
    }

    // 3-2-1 countdown — one whole second per number, centred over the cards.
    const cd = qSegs.find((s) => s.kind === "countdown");
    if (cd) {
      for (let k = 0; k < 3; k += 1) {
        const numFile = await textFile(workDir, `cd${qi}_${k}`, String(3 - k));
        const from = cd.start + k * (cd.seconds / 3);
        const to = cd.start + (k + 1) * (cd.seconds / 3);
        const cOut = next();
        filters.push(
          `${label}drawtext=fontfile='${fontPath}':textfile='${numFile}':fontsize=${BRAND.fontCountdown}:fontcolor=${BRAND.countdownText}:borderw=10:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='${between(from, to)}'${cOut}`
        );
        label = cOut;
      }
    }

    // Interesting fact under the cards during the reveal — shown, not narrated,
    // so it costs no runtime against the 60s ceiling.
    if (answerSeg && q.explanation) {
      const fFile = await textFile(workDir, `fact${qi}`, wrapText(q.explanation, 40, 2));
      const fOut = next();
      filters.push(
        `${label}drawtext=fontfile='${fontPath}':textfile='${fFile}':fontsize=${BRAND.fontFact}:fontcolor=${BRAND.factText}:line_spacing=8:x=(w-text_w)/2:y=${cardY(2) + BRAND.cardH + 50}:enable='${between(answerSeg.start, qEnd)}'${fOut}`
      );
      label = fOut;
    }
  }

  // ── Intro / outro cards ─────────────────────────────────────────────────
  const intro = segments.find((s) => s.kind === "intro");
  if (intro) {
    const iFile = await textFile(workDir, "intro", wrapText("Only geniuses get all of these right!", 22, 3));
    const iOut = next();
    filters.push(
      `${label}drawtext=fontfile='${fontPath}':textfile='${iFile}':fontsize=72:fontcolor=${BRAND.accentYellow}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:enable='${between(intro.start, intro.end)}'${iOut}`
    );
    label = iOut;
  }

  const outro = segments.find((s) => s.kind === "outro");
  if (outro) {
    const oFile = await textFile(workDir, "outro", wrapText("How many did you get right? Comment your score and follow GK Tiger!", 20, 5));
    const oOut = next();
    filters.push(
      `${label}drawtext=fontfile='${fontPath}':textfile='${oFile}':fontsize=${BRAND.fontOutro}:fontcolor=${BRAND.outroText}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:enable='${between(outro.start, outro.end)}'${oOut}`
    );
    label = oOut;
  }

  filters.push(`${label}format=yuv420p[vout]`);

  const scriptPath = path.join(workDir, "filters.txt");
  await fs.writeFile(scriptPath, filters.join(";\n"), "utf8");

  await runFfmpeg([
    "-y",
    ...inputs,
    "-i", audioPath,
    "-filter_complex_script", scriptPath,
    "-map", "[vout]",
    "-map", `${inputCount}:a`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k",
    "-r", "30",
    "-t", total.toFixed(3),
    outputPath,
  ]);
}

export type GkRenderResult = { outputPath: string; subtitlePath: string; durationSeconds: number };

/** Full GK Tiger Short render: script → per-line TTS → timeline → composite. */
export async function renderQuizVideo(
  questions: GkQuizQuestion[],
  optionImages: (string | null)[][],
  mediaDir: string,
  voice = "Female — Energetic",
): Promise<GkRenderResult> {
  const workDir = path.join(mediaDir, "work");
  await fs.mkdir(workDir, { recursive: true });

  const script = buildScript(questions);
  const { segments, total } = await buildTimeline(script, workDir, voice);
  const audioPath = await concatAudio(segments, workDir, total);

  const subtitlePath = path.join(mediaDir, "captions.srt");
  await writeSubtitles(segments, subtitlePath);

  const outputPath = path.join(mediaDir, "output.mp4");
  await buildAndRun({ questions, segments, total, optionImages, workDir, audioPath, outputPath });

  return { outputPath, subtitlePath, durationSeconds: total };
}
