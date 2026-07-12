import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { stockClipPaths } from "@/services/pipeline";

export const runtime = "nodejs";

const allowedHosts = /(^|\.)pexels\.com$|(^|\.)pixabay\.com$/;
const contentTypes: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function clipPath(id: string, index: string) {
  const projectId = Number(id);
  const clipIndex = Number(index);
  if (!Number.isInteger(projectId) || projectId < 1 || !Number.isInteger(clipIndex) || clipIndex < 0) return null;
  const paths = await stockClipPaths(projectId);
  return paths[clipIndex] || null;
}

function insideMediaRoot(filePath: string) {
  return path.resolve(filePath).startsWith(path.resolve(config.mediaRoot) + path.sep);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await context.params;
  const filePath = await clipPath(id, index);
  if (!filePath || !fs.existsSync(filePath)) return NextResponse.json({ error: "Clip கிடைக்கவில்லை" }, { status: 404 });
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  const contentType = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  return new NextResponse(stream, { headers: { "Content-Type": contentType, "Content-Length": String(fs.statSync(filePath).size), "Cache-Control": "private, no-store" } });
}

async function replaceClipFile(existingPath: string, extension: string, data: Buffer) {
  const directory = path.dirname(existingPath);
  const indexMatch = path.basename(existingPath).match(/\d+/);
  const newPath = path.join(directory, `stock-${indexMatch![0]}${extension}`);
  if (!insideMediaRoot(newPath) || !insideMediaRoot(existingPath)) throw new Error("தவறான file path");
  await fsp.writeFile(newPath, data);
  if (path.resolve(newPath) !== path.resolve(existingPath)) await fsp.rm(existingPath, { force: true });
  return newPath;
}

export async function POST(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await context.params;
    const filePath = await clipPath(id, index);
    if (!filePath) return NextResponse.json({ error: "Clip கிடைக்கவில்லை" }, { status: 404 });

    const requestType = request.headers.get("content-type") || "";
    if (requestType.includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) throw new Error("Image file தேவை");
      const extension = path.extname(file.name).toLowerCase();
      if (!imageExtensions.has(extension)) throw new Error("JPG/PNG/WebP images மட்டும் upload செய்யலாம்");
      if (file.size > 25 * 1024 * 1024) throw new Error("Image 25MB-க்கு குறைவாக இருக்க வேண்டும்");
      await replaceClipFile(filePath, extension, Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({ replaced: true, index: Number(index), kind: "image" });
    }

    const body = await request.json();
    const url = new URL(String(body?.url || ""));
    if (url.protocol !== "https:" || !allowedHosts.test(url.hostname)) throw new Error("Pexels/Pixabay URL மட்டும் அனுமதி");
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Download செய்ய முடியவில்லை (HTTP ${response.status})`);
    const isImage = body?.kind === "image";
    const extension = isImage ? (/\.png$/i.test(url.pathname) ? ".png" : /\.webp$/i.test(url.pathname) ? ".webp" : ".jpg") : ".mp4";
    await replaceClipFile(filePath, extension, Buffer.from(await response.arrayBuffer()));
    return NextResponse.json({ replaced: true, index: Number(index), kind: isImage ? "image" : "video" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Clip மாற்ற முடியவில்லை" }, { status: 400 });
  }
}
