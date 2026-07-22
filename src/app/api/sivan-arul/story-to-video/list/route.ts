import { NextResponse } from "next/server";
import { listStoryProjects } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listStoryProjects(20);
  return NextResponse.json({
    projects: rows.map((row) => ({
      id: row.id,
      status: row.status,
      storyPreview: row.story_input.slice(0, 90),
      language: row.language,
      createdAt: row.created_at,
      hasVideo: row.has_video === 1,
    })),
  });
}
