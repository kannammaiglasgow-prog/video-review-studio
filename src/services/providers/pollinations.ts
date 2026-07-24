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
// hard failure.
const REQUEST_GAP_MS = 6_000;
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dimensionsFor(orientation: "portrait" | "landscape"): { width: number; height: number } {
  // 9:16 / 16:9 at a size Pollinations reliably returns without heavy queueing.
  return orientation === "portrait" ? { width: 768, height: 1365 } : { width: 1365, height: 768 };
}

async function generateOneImage(prompt: string, orientation: "portrait" | "landscape", seed: number): Promise<Buffer> {
  const { width, height } = dimensionsFor(orientation);
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

  for (let index = 0; index < scenePrompts.length; index += 1) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
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
    } catch (err) {
      console.error(`[Pollinations] scene ${index} image generation failed:`, err instanceof Error ? err.message : err);
    }
  }

  return { files };
}
