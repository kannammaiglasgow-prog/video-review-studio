import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function POST() {
  try {
    const db = database();
    const { count: deletedProjects } = db.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number };

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM auto_news_logs").run();
      db.prepare("DELETE FROM projects").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    let freedDirs = 0;
    const entries = await fsp.readdir(config.mediaRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await fsp.rm(`${config.mediaRoot}/${entry.name}`, { recursive: true, force: true });
      freedDirs++;
    }

    return NextResponse.json({ deletedProjects, freedDirs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "வரலாற்றை அழிக்க முடியவில்லை" }, { status: 500 });
  }
}
