import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getStoryProject } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row?.output_path || !fs.existsSync(row.output_path)) return NextResponse.json({ error: "Video தயாராகவில்லை" }, { status: 404 });

  const filePath = row.output_path;
  const size = fs.statSync(filePath).size;
  const range = request.headers.get("range");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const commonHeaders: Record<string, string> = { "Accept-Ranges": "bytes", "Content-Type": "video/mp4", "Cache-Control": "private, no-store" };
  if (download) commonHeaders["Content-Disposition"] = `attachment; filename="story-${projectId}.mp4"`;

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
