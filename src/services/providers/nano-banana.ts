import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { addStoryCost } from "@/lib/database";
import { detectImageType, imageExtension } from "@/lib/images";

const MODEL = "gemini-2.5-flash-image";
// $30 / 1M output tokens, 1290 tokens per image — confirmed live against the
// real API response's usageMetadata.candidatesTokenCount before shipping this.
const COST_PER_IMAGE = 0.039;

function key() {
  if (!config.api.gemini) throw new Error("GEMINI_API_KEY சேர்க்கப்படவில்லை");
  return config.api.gemini;
}

async function generateOneImage(prompt: string, aspectRatio: "16:9" | "9:16"): Promise<Buffer> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Nano Banana API ${response.status}`);
  const part = (data?.candidates?.[0]?.content?.parts || []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Nano Banana-ல் இருந்து image கிடைக்கவில்லை");
  return Buffer.from(part.inlineData.data, "base64");
}

/** Paid Gemini image model ("Nano Banana") — a real, reliable API (unlike
 * the free Pollinations endpoint), so no rate-limit pacing is needed, just a
 * couple of retries on transient failures. Every successful image is
 * recorded via addStoryCost(storyId, "images", ...) so real spend shows up
 * in /dashboard/costs. */
export async function downloadScenedNanoBananaMedia(
  scenePrompts: string[],
  aspectRatio: "16:9" | "9:16",
  directory: string,
  storyId?: number,
): Promise<{ files: (string | null)[] }> {
  await fs.mkdir(directory, { recursive: true });
  const files: (string | null)[] = new Array(scenePrompts.length).fill(null);

  for (let index = 0; index < scenePrompts.length; index += 1) {
    const prompt = scenePrompts[index]?.trim() || "cinematic symbolic scene, atmospheric lighting";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await generateOneImage(prompt, aspectRatio);
        const type = detectImageType(data);
        const filePath = path.join(directory, `scene_${index}${type ? imageExtension(type) : ".png"}`);
        await fs.writeFile(filePath, data);
        files[index] = filePath;
        if (storyId) addStoryCost(storyId, "images", COST_PER_IMAGE);
        break;
      } catch (err) {
        console.error(`[NanoBanana] scene ${index} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { files };
}
