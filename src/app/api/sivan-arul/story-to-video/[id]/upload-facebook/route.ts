import { NextResponse } from "next/server";
import fs from "node:fs";
import { getStoryProject, updateStoryProject } from "@/lib/database";
import { uploadToFacebook } from "@/services/providers/facebook";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row?.output_path || !fs.existsSync(row.output_path)) return NextResponse.json({ error: "Video இன்னும் ரெண்டர் ஆகவில்லை" }, { status: 400 });

  const body = await request.json();
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ error: "Facebook Page தேர்ந்தெடுக்கவும்" }, { status: 400 });
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (row.seo_title || "Story Video");
  const description = typeof body.description === "string" ? body.description.trim() : (row.seo_description || "");

  try {
    const result = await uploadToFacebook({ filePath: row.output_path, pageId, title, description });
    updateStoryProject(projectId, {
      facebook_page_id: result.pageId,
      facebook_video_id: result.videoId,
      facebook_url: result.url,
    });
    return NextResponse.json({ success: true, videoId: result.videoId, url: result.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Facebook upload தோல்வி" }, { status: 500 });
  }
}
