import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { projectMediaDir, thumbnailPath } from "@/lib/thumbnails";
import { runFfmpeg } from "@/services/render/ffmpeg";
import { config } from "@/lib/config";
import { detectImageType, imageExtension } from "@/lib/images";

export const runtime = "nodejs";

function parseProjectId(id: string) {
  const projectId = Number(id);
  return Number.isInteger(projectId) && projectId >= 1 ? projectId : null;
}

function insideMediaRoot(filePath: string) {
  const relative = path.relative(path.resolve(config.mediaRoot), path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = parseProjectId(id);
  const project = projectId ? database().prepare("SELECT id, thumbnail_path FROM projects WHERE id=?").get(projectId) as { id: number; thumbnail_path: string | null } : undefined;
  if (!project) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });
  
  let filePath = project.thumbnail_path;
  if (!filePath && projectId) {
    filePath = thumbnailPath(projectId);
  }
  
  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Thumbnail இல்லை" }, { status: 404 });
  }
  
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": /\.png$/i.test(filePath) ? "image/png" : "image/jpeg", "Content-Length": String(fs.statSync(filePath).size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = parseProjectId(id);
    if (!projectId) throw new Error("தவறான project ID");
    const project = database().prepare("SELECT output_path,status FROM projects WHERE id=?").get(projectId) as { output_path: string | null; status: string } | undefined;
    if (!project) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });
    const directory = projectMediaDir(projectId);
    await fsp.mkdir(directory, { recursive: true });
    const requestType = request.headers.get("content-type") || "";
    if (requestType.includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) throw new Error("Image file தேவை");
      if (file.size > 2 * 1024 * 1024) throw new Error("Thumbnail 2MB-க்கு குறைவாக இருக்க வேண்டும் (YouTube வரம்பு)");
      const data = Buffer.from(await file.arrayBuffer());
      const type = detectImageType(data);
      if (type !== "jpg" && type !== "png") throw new Error("உண்மையான JPG/PNG image மட்டும் upload செய்யலாம்");
      const output = path.join(directory, `thumbnail${imageExtension(type)}`);
      await fsp.writeFile(output, data);
      for (const candidate of [path.join(directory, "thumbnail.jpg"), path.join(directory, "thumbnail.png")]) {
        if (path.resolve(candidate) !== path.resolve(output)) await fsp.rm(candidate, { force: true });
      }
      return NextResponse.json({ saved: true, source: "upload" });
    }

    const body = await request.json().catch(() => ({}));
    const atSec = Math.max(0, Number(body?.atSec) || 1.5);
    if (project.status !== "complete" || !project.output_path || !insideMediaRoot(project.output_path) || !fs.existsSync(project.output_path)) throw new Error("Video இன்னும் தயாராகவில்லை");
    const output = path.join(directory, "thumbnail.jpg");
    await runFfmpeg(["-ss", atSec.toFixed(2), "-i", project.output_path, "-frames:v", "1", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "-q:v", "3", output]);
    return NextResponse.json({ saved: true, source: "video", atSec });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Thumbnail சேமிக்க முடியவில்லை" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = parseProjectId(id);
  if (!projectId) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });
  const project = database().prepare("SELECT id FROM projects WHERE id=?").get(projectId);
  if (!project) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });
  const filePath = projectId ? thumbnailPath(projectId) : null;
  if (filePath) await fsp.rm(filePath, { force: true });
  return NextResponse.json({ deleted: true });
}
