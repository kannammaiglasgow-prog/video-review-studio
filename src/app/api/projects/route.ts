import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { validateProject } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = validateProject(await request.json());
    const db = database();
    const insert = db.prepare(`INSERT INTO projects
      (youtube_url,source_type,script_mode,transcript,start_time,end_time,stance,tone,persona,voice,aspect_ratio,duration,custom_instruction,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN IMMEDIATE");
    try {
      const project = insert.run(input.url,input.sourceType,input.scriptMode,input.sourceType === "text" ? input.sourceText || null : null,input.startTime,input.endTime,input.stance,input.tone,input.persona,input.voice,input.format,input.duration,input.customInstruction || null,"queued");
      db.prepare("INSERT INTO render_jobs (project_id,stage,payload) VALUES (?,?,?)").run(project.lastInsertRowid,"transcript",JSON.stringify({ sourceLanguage: "auto", outputLanguage: "ta" }));
      db.exec("COMMIT");
      return NextResponse.json({ id: Number(project.lastInsertRowid), status: "queued" }, { status: 201 });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "திட்டத்தை உருவாக்க முடியவில்லை" }, { status: 400 });
  }
}

export async function GET() {
  const rows = database().prepare("SELECT * FROM projects ORDER BY id DESC LIMIT 50").all();
  return NextResponse.json({ projects: rows });
}
