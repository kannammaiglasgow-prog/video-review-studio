import { NextResponse } from "next/server";
import { database } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const projectId = Number(resolvedParams.id);
    const db = database();
    const row = db.prepare("SELECT status, error_message, review_script, thumbnail_prompt, thumbnail_path FROM projects WHERE id=?").get(projectId) as any;
    if (!row) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ 
      status: row.status, 
      errorMessage: row.error_message, 
      reviewScript: row.review_script,
      thumbnailPrompt: row.thumbnail_prompt,
      thumbnailPath: row.thumbnail_path
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch status" }, { status: 500 });
  }
}
