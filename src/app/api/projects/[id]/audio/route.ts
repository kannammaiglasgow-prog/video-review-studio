import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = database().prepare("SELECT audio_path FROM projects WHERE id=?").get(Number(id)) as { audio_path: string | null } | undefined;
  if (!row?.audio_path) return NextResponse.json({ error: "Voiceover தயாராகவில்லை" }, { status: 404 });
  const filePath = path.resolve(row.audio_path);
  const mediaRoot = path.resolve(config.mediaRoot) + path.sep;
  if (!filePath.startsWith(mediaRoot) || !fs.existsSync(filePath)) return NextResponse.json({ error: "Audio file கிடைக்கவில்லை" }, { status: 404 });
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": "audio/wav", "Content-Length": String(fs.statSync(filePath).size), "Cache-Control": "private, no-store" } });
}
