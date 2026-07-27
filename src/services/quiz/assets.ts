import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { downloadSquareImages } from "@/services/providers/pollinations";
import type { QuizBrand } from "./brand";

/** Where a channel's cached mascot lives — one folder per channel, so a new
 * channel can never pick up another channel's artwork. */
function mascotPath(channel: string): { dir: string; png: string } {
  const dir = path.resolve(process.cwd(), "public/quiz", channel);
  return { dir, png: path.join(dir, "mascot.png") };
}

/** The channel's mascot, generated once from its own prompt and cached on
 * disk. Original artwork (AI-generated per channel), never traced from another
 * channel's branding. Returned as a data: URI so it can be embedded straight
 * into the frame SVG — sharp won't fetch external hrefs.
 *
 * Returns null if generation fails; the header falls back to the wordmark
 * alone rather than blocking a render on a decorative asset. */
export async function getMascotDataUri(brand: QuizBrand): Promise<string | null> {
  const { dir, png } = mascotPath(brand.channel);

  try {
    await fs.access(png);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    const [file] = await downloadSquareImages([brand.mascotPrompt], 512, [path.join(dir, "mascot_raw")]);
    if (!file) return null;
    await sharp(file).resize(512, 512, { fit: "cover" }).png().toFile(png);
    await fs.rm(file, { force: true }).catch(() => {});
  }

  try {
    const buf = await fs.readFile(png);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
