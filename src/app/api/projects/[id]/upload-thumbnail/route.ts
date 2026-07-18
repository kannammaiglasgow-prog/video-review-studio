import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { config } from "@/lib/config";
import path from "node:path";
import fs from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const projectId = Number(resolvedParams.id);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const projectDir = path.join(config.mediaRoot, "projects", String(projectId));
    await fs.mkdir(projectDir, { recursive: true });
    
    const ext = path.extname(file.name) || ".jpg";
    const localFileName = `thumbnail_uploaded_${Date.now()}${ext}`;
    const outputPath = path.join(projectDir, localFileName).replaceAll("\\", "/");

    // Write file to disk
    await fs.writeFile(outputPath, buffer);

    // Save path in SQLite database
    const db = database();
    db.prepare("UPDATE projects SET thumbnail_path=? WHERE id=?").run(outputPath, projectId);

    return NextResponse.json({
      success: true,
      thumbnailPath: outputPath
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upload thumbnail" }, { status: 500 });
  }
}
