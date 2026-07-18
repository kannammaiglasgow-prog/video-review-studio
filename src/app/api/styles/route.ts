import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stylesDir = path.resolve(process.cwd(), "data/styles");
    const files = await fs.readdir(stylesDir).catch(() => []);
    const styles = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(stylesDir, file);
        const data = await fs.readFile(filePath, "utf8");
        styles.push(JSON.parse(data));
      }
    }
    return NextResponse.json({ styles });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Styles load failed" }, { status: 500 });
  }
}
