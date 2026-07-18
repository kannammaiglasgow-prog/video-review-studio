import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Path parameter is required" }, { status: 400 });
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(resolvedPath, { start, end });
      
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": contentType,
      };

      // @ts-ignore
      return new Response(file, {
        status: 206,
        headers: head,
      });
    } else {
      const file = fs.createReadStream(resolvedPath);
      const head = {
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      };

      // @ts-ignore
      return new Response(file, {
        status: 200,
        headers: head,
      });
    }
  } catch (err: any) {
    console.error("Media proxy failed:", err);
    return NextResponse.json({ error: err.message || "Failed to proxy media" }, { status: 500 });
  }
}
