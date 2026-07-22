import { NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { getStoryProject, type StoryScene } from "@/lib/database";

export const runtime = "nodejs";

function extFor(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return ".png";
  if (name.endsWith(".webp")) return ".webp";
  return ".jpg";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });

  const scenes: StoryScene[] = row.scenes_json ? JSON.parse(row.scenes_json) : [];
  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  await fsp.mkdir(mediaDir, { recursive: true });

  const formData = await request.formData();

  // ஒவ்வொரு scene-க்கும் தனித்தனி file (scene_0, scene_1, ...) — ஆகவே சரியான scene-க்கு சரியான படம் போகும்
  let savedCount = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const file = formData.get(`scene_${index}`);
    if (file instanceof File) {
      const ext = extFor(file);
      // முந்தைய வேறு extension-ல் இருந்தால் நீக்கவும்
      for (const oldExt of [".jpg", ".jpeg", ".png", ".webp"]) {
        const oldPath = path.join(mediaDir, `scene_${index}${oldExt}`);
        if (fs.existsSync(oldPath)) await fsp.unlink(oldPath).catch(() => {});
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      await fsp.writeFile(path.join(mediaDir, `scene_${index}${ext}`), buffer);
      savedCount += 1;
    }
  }

  // bulk multi-select fallback: "batch" key-ல் பல files ஒரே நேரத்தில் அனுப்பப்பட்டால், முதல் காலியான scenes-ல் வரிசைப்படி நிரப்பவும்
  const batchFiles = formData.getAll("batch").filter((item): item is File => item instanceof File);
  if (batchFiles.length > 0) {
    const emptyIndices: number[] = [];
    for (let index = 0; index < scenes.length; index += 1) {
      const exists = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => fs.existsSync(path.join(mediaDir, `scene_${index}${ext}`)));
      if (!exists) emptyIndices.push(index);
    }
    for (let i = 0; i < batchFiles.length && i < emptyIndices.length; i += 1) {
      const file = batchFiles[i];
      const ext = extFor(file);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fsp.writeFile(path.join(mediaDir, `scene_${emptyIndices[i]}${ext}`), buffer);
      savedCount += 1;
    }
  }

  const uploadedImages = scenes.map((_, index) => [".jpg", ".jpeg", ".png", ".webp"].some((ext) => fs.existsSync(path.join(mediaDir, `scene_${index}${ext}`))));
  return NextResponse.json({ success: true, savedCount, uploadedImages });
}
