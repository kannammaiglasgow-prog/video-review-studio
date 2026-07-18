import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { processProject } from "@/services/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });

    const db = database();
    const row = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
    if (!row || !row.payload) return NextResponse.json({ scenes: [] });

    const payload = JSON.parse(row.payload);
    return NextResponse.json({ scenes: Array.isArray(payload.scenes) ? payload.scenes : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scenes பெற முடியவில்லை" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });

    const { scenes } = await request.json();
    if (!Array.isArray(scenes)) return NextResponse.json({ error: "Scenes array தேவை" }, { status: 400 });

    const db = database();
    const row = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
    if (!row || !row.payload) return NextResponse.json({ error: "Render job payload கிடைக்கவில்லை" }, { status: 404 });

    const payload = JSON.parse(row.payload);
    payload.scenes = scenes;

    db.prepare("UPDATE render_jobs SET payload=? WHERE project_id=?").run(JSON.stringify(payload), projectId);
    db.prepare("UPDATE projects SET status='scenes_approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(projectId);

    const result = await processProject(projectId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scenes ஒப்புதல் தோல்வியடைந்தது" }, { status: 400 });
  }
}
