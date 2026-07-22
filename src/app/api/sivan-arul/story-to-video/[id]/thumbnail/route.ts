import { NextResponse } from "next/server";
import { getStoryProject, updateStoryProject } from "@/lib/database";
import { generateThumbnailPrompt } from "@/services/story/generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row?.script) return NextResponse.json({ error: "Script இன்னும் தயாராகவில்லை" }, { status: 400 });

  try {
    const thumbnailPrompt = await generateThumbnailPrompt(row.script, row.seo_title || "", projectId);
    updateStoryProject(projectId, { thumbnail_prompt: thumbnailPrompt });
    return NextResponse.json({ success: true, thumbnailPrompt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Thumbnail prompt generation தோல்வி" }, { status: 500 });
  }
}
