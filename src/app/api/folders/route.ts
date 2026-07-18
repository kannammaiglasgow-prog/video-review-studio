import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { registerFolder, pauseScan, resumeScan } from "@/services/personal/scanner";

export async function GET() {
  try {
    const db = database();
    const folders = db.prepare("SELECT * FROM local_media_folders ORDER BY created_at DESC").all();
    return NextResponse.json({ folders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "வட்டார சேமிப்புகளை பெற முடியவில்லை" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { path: folderPath, action, folderId } = body;

    if (action === "pause" && folderId) {
      pauseScan(Number(folderId));
      return NextResponse.json({ success: true, status: "paused" });
    }
    if (action === "resume" && folderId) {
      resumeScan(Number(folderId));
      return NextResponse.json({ success: true, status: "scanning" });
    }

    if (!folderPath || typeof folderPath !== "string") {
      return NextResponse.json({ error: "தவறான Folder பாதை (Invalid path)" }, { status: 400 });
    }

    const id = await registerFolder(folderPath);
    return NextResponse.json({ success: true, id, status: "queued" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Folder-ஐ இணைக்க முடியவில்லை" }, { status: 500 });
  }
}
