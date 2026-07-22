import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getStoryProject } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = getStoryProject(Number(id));
  if (!row?.audio_path || !fs.existsSync(row.audio_path)) return NextResponse.json({ error: "Audio தயாராகவில்லை" }, { status: 404 });
  const size = fs.statSync(row.audio_path).size;
  const stream = Readable.toWeb(fs.createReadStream(row.audio_path)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": "audio/wav", "Content-Length": String(size), "Cache-Control": "private, no-store" } });
}
