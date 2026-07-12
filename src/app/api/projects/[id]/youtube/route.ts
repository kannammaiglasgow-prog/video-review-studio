import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { config } from "@/lib/config";
import { uploadToYoutube } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) throw new Error("தவறான project ID");
    const row = database().prepare("SELECT output_path, review_script FROM projects WHERE id=? AND status='complete'").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;
    if (!row?.output_path) throw new Error("Video இன்னும் தயாராகவில்லை");
    const filePath = path.resolve(row.output_path);
    const mediaRoot = path.resolve(config.mediaRoot) + path.sep;
    if (!filePath.startsWith(mediaRoot) || !fs.existsSync(filePath)) throw new Error("Video file கிடைக்கவில்லை");

    const body = await request.json();
    const title = String(body?.title || "").trim();
    if (!title) throw new Error("Video title தேவை");
    const privacy = ["private", "unlisted", "public"].includes(body?.privacy) ? body.privacy : "private";
    const description = typeof body?.description === "string" && body.description.trim() ? body.description : (row.review_script || "").slice(0, 4000);
    const tags = Array.isArray(body?.tags) ? body.tags.filter((tag: unknown) => typeof tag === "string").slice(0, 20) : [];

    const result = await uploadToYoutube({ filePath, title, description, tags, privacyStatus: privacy });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube upload தோல்வியடைந்தது" }, { status: 400 });
  }
}
