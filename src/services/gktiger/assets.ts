import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { downloadSquareImages } from "@/services/providers/pollinations";

const MASCOT_DIR = path.resolve(process.cwd(), "public/gktiger");
const MASCOT_PNG = path.join(MASCOT_DIR, "mascot.png");

/** The channel's tiger mascot, generated once and cached on disk. Original
 * artwork (AI-generated for this channel), never traced from another channel's
 * branding. Returned as a data: URI so it can be embedded straight into the
 * frame SVG — sharp won't fetch external hrefs.
 *
 * Returns null if generation fails; the header falls back to the wordmark
 * alone rather than blocking a render on a decorative asset. */
export async function getMascotDataUri(): Promise<string | null> {
  try {
    await fs.access(MASCOT_PNG);
  } catch {
    await fs.mkdir(MASCOT_DIR, { recursive: true });
    const prompt =
      "Friendly cartoon tiger head mascot logo, front facing, big happy smile, bold orange and black stripes, white muzzle, thick clean vector outlines, flat vibrant colors, centered, plain solid dark blue background, esports mascot style, no text, no letters";
    const [file] = await downloadSquareImages([prompt], 512, [path.join(MASCOT_DIR, "mascot_raw")]);
    if (!file) return null;
    await sharp(file).resize(512, 512, { fit: "cover" }).png().toFile(MASCOT_PNG);
    await fs.rm(file, { force: true }).catch(() => {});
  }

  try {
    const buf = await fs.readFile(MASCOT_PNG);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
