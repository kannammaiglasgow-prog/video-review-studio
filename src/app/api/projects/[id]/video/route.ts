import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { config } from "@/lib/config";

export const runtime = "nodejs";

type VideoRow = { output_path: string | null };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = database().prepare("SELECT output_path FROM projects WHERE id=? AND status='complete'").get(projectId) as VideoRow | undefined;
  if (!row?.output_path) return NextResponse.json({ error: "Video தயாராகவில்லை" }, { status: 404 });
  const filePath = path.resolve(row.output_path);
  const mediaRoot = path.resolve(config.mediaRoot) + path.sep;
  if (!filePath.startsWith(mediaRoot) || !fs.existsSync(filePath)) return NextResponse.json({ error: "Video file கிடைக்கவில்லை" }, { status: 404 });

  const size = fs.statSync(filePath).size;
  const range = request.headers.get("range");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const commonHeaders: Record<string, string> = { "Accept-Ranges": "bytes", "Content-Type": "video/mp4", "Cache-Control": "private, no-store" };
  if (download) commonHeaders["Content-Disposition"] = `attachment; filename="review-${projectId}.mp4"`;

  if (range) {
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers: { ...commonHeaders, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { headers: { ...commonHeaders, "Content-Length": String(size) } });
}
