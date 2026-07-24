import { NextResponse } from "next/server";
import { checkStoryReadyToRender, renderStoryVideo } from "@/services/story/pipeline";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);

  const check = checkStoryReadyToRender(projectId);
  if (!check.ready) return NextResponse.json({ error: check.error }, { status: 400 });

  // Fire-and-forget the actual FFmpeg render — the UI polls project status
  // separately, same convention as the rest of this pipeline.
  renderStoryVideo(projectId).catch(() => {});

  return NextResponse.json({ success: true });
}
