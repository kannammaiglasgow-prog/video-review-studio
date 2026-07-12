export type ScenePlanEntry = { text: string; seconds: number };

const MIN_SCENE_SECONDS = 2;
const MAX_SCENE_SECONDS = 5;

// Tamil/Hindi/English sentence-ending punctuation, அல்லது newline
export function splitSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?।॥])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function wordCount(text: string) {
  return Math.max(1, text.split(/\s+/).filter(Boolean).length);
}

// Reading-pace estimate: நேரடி forced-alignment இல்லாமல், ஒவ்வொரு sentence-உம் அதன் word-proportion-க்கு ஏற்ப
// audio-வின் மொத்த நேரத்தில் இருந்து ஒரு approximate duration பெறுகிறது. குறுகிய sentences அடுத்தவற்றுடன் merge ஆகும்;
// நீண்ட sentences பல scenes-ஆக பிரிக்கப்படும் — ஒரு sentence முழுவதும் ஒரே static clip-ஆக இருக்காது.
export function buildScenePlan(script: string, totalSeconds: number, idealSceneSeconds: number): ScenePlanEntry[] {
  const sentences = splitSentences(script);
  if (!sentences.length || totalSeconds <= 0) return [{ text: script.trim() || script, seconds: Math.max(totalSeconds, MIN_SCENE_SECONDS) }];

  const wordCounts = sentences.map(wordCount);
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const rawSeconds = wordCounts.map((count) => (count / totalWords) * totalSeconds);

  // Merge pass: குறுகிய sentences-ஐ MIN_SCENE_SECONDS வரும் வரை அடுத்தடுத்து சேர்க்கும்
  const merged: ScenePlanEntry[] = [];
  let bufferText: string[] = [];
  let bufferSeconds = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    bufferText.push(sentences[index]);
    bufferSeconds += rawSeconds[index];
    const isLast = index === sentences.length - 1;
    if (bufferSeconds >= MIN_SCENE_SECONDS || isLast) {
      merged.push({ text: bufferText.join(" "), seconds: bufferSeconds });
      bufferText = [];
      bufferSeconds = 0;
    }
  }
  if (merged.length > 1 && merged[merged.length - 1].seconds < MIN_SCENE_SECONDS) {
    const last = merged.pop()!;
    merged[merged.length - 1] = { text: `${merged[merged.length - 1].text} ${last.text}`, seconds: merged[merged.length - 1].seconds + last.seconds };
  }

  // Split pass: நீண்ட sentence-groups-ஐ ~idealSceneSeconds அளவு பல scenes-ஆக பிரிக்கும்
  const final: ScenePlanEntry[] = [];
  for (const scene of merged) {
    if (scene.seconds <= MAX_SCENE_SECONDS) { final.push(scene); continue; }
    const parts = Math.max(2, Math.round(scene.seconds / idealSceneSeconds));
    const words = scene.text.split(/\s+/).filter(Boolean);
    const perPart = Math.ceil(words.length / parts);
    for (let part = 0; part < parts; part += 1) {
      const chunkWords = words.slice(part * perPart, (part + 1) * perPart);
      if (!chunkWords.length) continue;
      final.push({ text: chunkWords.join(" "), seconds: scene.seconds / parts });
    }
  }

  // Rescale: merge/split rounding-ஆல் ஏற்படும் drift-ஐ சரிசெய்து, மொத்தமும் totalSeconds-க்கு சரியாக பொருந்தும்
  const summedSeconds = final.reduce((sum, scene) => sum + scene.seconds, 0) || totalSeconds;
  const scale = totalSeconds / summedSeconds;
  return final.map((scene) => ({ text: scene.text, seconds: Math.max(0.5, scene.seconds * scale) }));
}
