import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { stockClipPaths } from "@/services/pipeline";
import { detectImageType, imageExtension } from "@/lib/images";

export const runtime = "nodejs";

const allowedHosts = /(^|\.)pexels\.com$|(^|\.)pixabay\.com$/;
const contentTypes: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
async function clipPath(id: string, index: string) {
  const projectId = Number(id);
  const clipIndex = Number(index);
  if (!Number.isInteger(projectId) || projectId < 1 || !Number.isInteger(clipIndex) || clipIndex < 0) return null;
  const paths = await stockClipPaths(projectId);
  return paths[clipIndex] || null;
}

function insideMediaRoot(filePath: string) {
  const relative = path.relative(path.resolve(config.mediaRoot), path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function responseBuffer(response: Response, maximumBytes: number) {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maximumBytes) throw new Error("Download file மிகவும் பெரியது");
  if (!response.body) throw new Error("Download response காலியாக உள்ளது");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximumBytes) { await reader.cancel(); throw new Error("Download file மிகவும் பெரியது"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
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
      if (file.size > 25 * 1024 * 1024) throw new Error("Image 25MB-க்கு குறைவாக இருக்க வேண்டும்");
      const data = Buffer.from(await file.arrayBuffer());
      const imageType = detectImageType(data);
      if (!imageType) throw new Error("உண்மையான JPG/PNG/WebP image மட்டும் upload செய்யலாம்");
      await replaceClipFile(filePath, imageExtension(imageType), data);
      return NextResponse.json({ replaced: true, index: Number(index), kind: "image" });
    }

    const body = await request.json();
    const url = new URL(String(body?.url || ""));
    if (url.protocol !== "https:" || !allowedHosts.test(url.hostname)) throw new Error("Pexels/Pixabay URL மட்டும் அனுமதி");
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Download செய்ய முடியவில்லை (HTTP ${response.status})`);
    const isImage = body?.kind === "image";
    const data = await responseBuffer(response, isImage ? 25 * 1024 * 1024 : 150 * 1024 * 1024);
    const imageType = isImage ? detectImageType(data) : null;
    if (isImage && !imageType) throw new Error("Stock image response செல்லுபடியாகவில்லை");
    if (!isImage && !/^video\//i.test(response.headers.get("content-type") || "")) throw new Error("Stock video response செல்லுபடியாகவில்லை");
    await replaceClipFile(filePath, imageType ? imageExtension(imageType) : ".mp4", data);
    return NextResponse.json({ replaced: true, index: Number(index), kind: isImage ? "image" : "video" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Clip மாற்ற முடியவில்லை" }, { status: 400 });
  }
}
