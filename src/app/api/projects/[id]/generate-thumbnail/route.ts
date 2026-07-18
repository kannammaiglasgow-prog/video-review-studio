import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { generateAutoThumbnail } from "@/services/render/thumbnail-generator";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const projectId = Number(resolvedParams.id);
    const body = await request.json();
    const { prompt, title, footerText } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const db = database();
    const project = db.prepare("SELECT aspect_ratio, review_script FROM projects WHERE id=?").get(projectId) as { aspect_ratio: string; review_script: string | null } | undefined;
    const aspect = project?.aspect_ratio || "16:9";

    // Deduce title text: prefer body title, then project review script first line, then prompt
    let titleText = title || "";
    if (!titleText && project?.review_script) {
      // Get first non-empty line of the review script
      const lines = project.review_script.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        titleText = lines[0];
      }
    }
    if (!titleText) {
      titleText = prompt;
    }

    console.log(`[Thumbnail API] Generating auto thumbnail for project #${projectId}`);
    const thumbnailPath = await generateAutoThumbnail({
      projectId,
      keyword: prompt,
      title: titleText,
      footerText: footerText,
      aspectRatio: aspect as "9:16" | "16:9"
    });

    return NextResponse.json({
      success: true,
      thumbnailPath: thumbnailPath,
      isMock: false,
      estimatedCost: 0
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate thumbnail" }, { status: 500 });
  }
}
