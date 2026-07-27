import fs from "node:fs/promises";
import path from "node:path";
import { detectImageType, imageExtension } from "@/lib/images";

// Pollinations.ai's free "legacy" image endpoint — no API key, no signup,
// backed by the open-weight Flux model (Apache 2.0, commercial-use-friendly).
// Used as an EXTRA scene-media option alongside the existing free stock media
// (Pexels/Pixabay) — the user picks per-project/per-channel which to use.
const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

// The free endpoint rate-limits aggressively (confirmed live: firing 8
// back-to-back requests for one video's scenes returns 429 Too Many Requests
// after just a couple). Scenes are generated one at a time with a pause
// between them, and a 429 is retried with backoff rather than treated as a
// hard failure. 5s (down from 8s) — recent live runs at 8s completed with no
// 429s, so this trims total time while staying well above the failure zone.
const REQUEST_GAP_MS = 5_000;
const MAX_RETRIES = 3;
// After the main pass, any scene that still failed gets one more try after this
// cooldown — by then the rate-limit window from the whole video's requests has
// usually cleared, so a scene that failed early (before the limiter reset)
// often succeeds on this final sweep instead of being left for manual upload.
const FINAL_SWEEP_COOLDOWN_MS = 25_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dimensionsFor(orientation: "portrait" | "landscape"): { width: number; height: number } {
  // 9:16 / 16:9 at a size Pollinations reliably returns without heavy queueing.
  return orientation === "portrait" ? { width: 768, height: 1365 } : { width: 1365, height: 768 };
}

async function generateOneImage(
  prompt: string,
  orientation: "portrait" | "landscape",
  seed: number,
  dims?: { width: number; height: number },
): Promise<Buffer> {
  const { width, height } = dims ?? dimensionsFor(orientation);
  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (response.status === 429) {
      const backoff = REQUEST_GAP_MS * (attempt + 2); // 12s, 18s, 24s, 30s
      console.log(`[Pollinations] 429 rate-limited, retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      await sleep(backoff);
      continue;
    }
    if (!response.ok) throw new Error(`Pollinations image API ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (!detectImageType(data)) throw new Error("Pollinations-ல் இருந்து ஒரு valid image கிடைக்கவில்லை");
    return data;
  }
  throw new Error("Pollinations rate limit — பல தடவை retry பண்ணியும் தோல்வி");
}

/** One AI-generated image per scene, using each scene's own detailed English
 * image-generation prompt (already written by generateSceneBreakdown — the
 * same prompt shown as manual-upload reference for the stock-media path).
 * Same contract as downloadScenedStockMedia: writes scene_<i>.<ext> files
 * directly into `directory` and returns their paths — a missing/failed scene
 * leaves a null entry so the pipeline can flag it exactly like a stock-media gap.
 * Requests are paced (not fired concurrently) to stay under the free tier's
 * rate limit. */
export async function downloadScenedAIMedia(scenePrompts: string[], orientation: "portrait" | "landscape", directory: string): Promise<{ files: (string | null)[] }> {
  await fs.mkdir(directory, { recursive: true });
  const files: (string | null)[] = new Array(scenePrompts.length).fill(null);

  const tryScene = async (index: number) => {
    const prompt = scenePrompts[index]?.trim() || "cinematic symbolic scene, atmospheric lighting";
    // Fixed-but-varied seed per scene so a retry (empty pool refill etc.) is
    // reproducible-ish while still giving each scene a distinct composition.
    const seed = 1000 + index;
    try {
      const data = await generateOneImage(prompt, orientation, seed);
      const type = detectImageType(data)!;
      const filePath = path.join(directory, `scene_${index}${imageExtension(type)}`);
      await fs.writeFile(filePath, data);
      files[index] = filePath;
      return true;
    } catch (err) {
      console.error(`[Pollinations] scene ${index} image generation failed:`, err instanceof Error ? err.message : err);
      return false;
    }
  };

  for (let index = 0; index < scenePrompts.length; index += 1) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    await tryScene(index);
  }

  // Final sweep: a scene that failed early in the main pass (e.g. leftover
  // rate-limit pressure from a previous video) often succeeds once the
  // limiter has had time to reset — worth one more try before giving up and
  // asking for a manual upload.
  const stillMissing = files.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
  if (stillMissing.length > 0) {
    console.log(`[Pollinations] ${stillMissing.length} scene(s) missing after main pass, retrying after ${FINAL_SWEEP_COOLDOWN_MS / 1000}s cooldown`);
    await sleep(FINAL_SWEEP_COOLDOWN_MS);
    for (const index of stillMissing) {
      await tryScene(index);
      await sleep(REQUEST_GAP_MS);
    }
  }

  return { files };
}

/** Square images written to caller-chosen paths — used by the GK Tiger quiz
 * renderer, which needs one picture per answer option rather than one per
 * scene. Same pacing/backoff as the scene path (shared generateOneImage), so
 * a quiz video's dozen images don't trip the free tier's rate limit. */
export async function downloadSquareImages(
  prompts: string[],
  size: number,
  filePaths: string[],
): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(prompts.length).fill(null);

  const attempt = async (i: number, seedOffset: number): Promise<boolean> => {
    try {
      const data = await generateOneImage(prompts[i], "portrait", 2000 + i + seedOffset, { width: size, height: size });
      const type = detectImageType(data)!;
      const target = `${filePaths[i]}${imageExtension(type)}`;
      await fs.writeFile(target, data);
      out[i] = target;
      return true;
    } catch (err) {
      console.error(`[Pollinations] square image ${i} failed:`, err instanceof Error ? err.message : err);
      return false;
    }
  };

  for (let i = 0; i < prompts.length; i += 1) {
    if (i > 0) await sleep(REQUEST_GAP_MS);
    await attempt(i, 0);
  }

  // A dozen images in one run leans hard on the free tier's limiter — a live
  // 12-image quiz run lost 8 of them to 429s on the first pass. Sweep the
  // stragglers a couple more times after a cooldown, which is what actually
  // gets a full set.
  for (let sweep = 1; sweep <= 2; sweep += 1) {
    const missing = out.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
    if (missing.length === 0) break;
    console.log(`[Pollinations] sweep ${sweep}: retrying ${missing.length} image(s) after cooldown`);
    await sleep(FINAL_SWEEP_COOLDOWN_MS);
    for (const i of missing) {
      await attempt(i, sweep * 500);
      await sleep(REQUEST_GAP_MS);
    }
  }

  return out;
}

/** A prompt Pollinations keeps failing/429-ing on sometimes succeeds once
 * reworded — each variant is progressively shorter/more generic so the last
 * attempt is nearly guaranteed to render something (if far less specific). */
function promptVariants(original: string): string[] {
  const short = original.split(",").slice(0, 2).join(",").trim() || original;
  return [
    `${original}, alternate composition, different framing`,
    `${short}, minimalist symbolic illustration, soft lighting`,
    "cinematic atmospheric scene, symbolic art, soft dramatic lighting",
  ];
}

/** For scenes still missing after downloadScenedAIMedia's own main pass +
 * final sweep, try up to 3 more times each with a reworded prompt (see
 * promptVariants) before the caller gives up on AI generation for that scene
 * and falls back to stock media. Writes scene_<i> files in place, same as
 * downloadScenedAIMedia. */
export async function retryScenesWithVariantPrompts(
  missingIndices: number[],
  scenePrompts: string[],
  orientation: "portrait" | "landscape",
  directory: string,
): Promise<{ recovered: { index: number; path: string }[] }> {
  const recovered: { index: number; path: string }[] = [];
  for (const index of missingIndices) {
    const original = scenePrompts[index]?.trim() || "cinematic symbolic scene, atmospheric lighting";
    const variants = promptVariants(original);
    for (let v = 0; v < variants.length; v += 1) {
      await sleep(REQUEST_GAP_MS);
      try {
        const seed = 5000 + index * 100 + v;
        const data = await generateOneImage(variants[v], orientation, seed);
        const type = detectImageType(data)!;
        const filePath = path.join(directory, `scene_${index}${imageExtension(type)}`);
        await fs.writeFile(filePath, data);
        recovered.push({ index, path: filePath });
        break;
      } catch (err) {
        console.error(`[Pollinations] scene ${index} variant ${v + 1}/${variants.length} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { recovered };
}
