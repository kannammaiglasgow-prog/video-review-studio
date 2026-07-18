import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = { 
  ".mp4": "video/mp4", 
  ".jpg": "image/jpeg", 
  ".jpeg": "image/jpeg", 
  ".png": "image/png", 
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) {
      return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const sceneIndexStr = searchParams.get("sceneIndex");
    if (sceneIndexStr === null) {
      return NextResponse.json({ error: "Scene Index தேவை" }, { status: 400 });
    }

    const sceneIndex = Number(sceneIndexStr);
    const projectDir = path.join(config.mediaRoot, String(projectId));
    
    const files = await fsp.readdir(projectDir).catch(() => []);
    const match = files.find(f => f.startsWith(`uploaded_scene_${sceneIndex}`));
    if (!match) {
      return NextResponse.json({ error: "File கிடைக்கவில்லை" }, { status: 404 });
    }

    const filePath = path.join(projectDir, match);
    const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[extension] || "application/octet-stream";
    
    return new NextResponse(stream, { 
      headers: { 
        "Content-Type": contentType, 
        "Content-Length": String(fs.statSync(filePath).size), 
        "Cache-Control": "private, no-store" 
      } 
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "File பெற முடியவில்லை" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) {
      return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const sceneIndexStr = formData.get("sceneIndex");
    
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File தேவை" }, { status: 400 });
    }
    if (sceneIndexStr === null) {
      return NextResponse.json({ error: "Scene Index தேவை" }, { status: 400 });
    }
    
    const sceneIndex = Number(sceneIndexStr);
    const extension = path.extname(file.name).toLowerCase() || ".mp4";
    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension);
    
    const projectDir = path.join(config.mediaRoot, String(projectId));
    await fsp.mkdir(projectDir, { recursive: true });
    
    // Remove any existing uploaded_scene_${sceneIndex}* file to prevent conflicts
    const files = await fsp.readdir(projectDir).catch(() => []);
    for (const f of files) {
      if (f.startsWith(`uploaded_scene_${sceneIndex}`)) {
        await fsp.rm(path.join(projectDir, f), { force: true });
      }
    }
    
    const fileName = `uploaded_scene_${sceneIndex}${extension}`;
    const filePath = path.join(projectDir, fileName);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await fsp.writeFile(filePath, buffer);
    
    const assetUrl = `/api/projects/${projectId}/scenes/upload?sceneIndex=${sceneIndex}`;
    
    return NextResponse.json({
      provider: "uploaded",
      kind: isImage ? "image" : "video",
      id: `uploaded_scene_${sceneIndex}`,
      url: assetUrl,
      previewUrl: assetUrl,
      localPath: filePath,
      width: 1920,
      height: 1080
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "File பதிவேற்றம் தோல்வியடைந்தது" }, { status: 500 });
  }
}
