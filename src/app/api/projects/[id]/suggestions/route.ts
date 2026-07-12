import { NextResponse } from "next/server";
import { database } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });
  const row = database().prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
  try {
    const payload = row?.payload ? JSON.parse(row.payload) : {};
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    return NextResponse.json({ title: typeof payload.title === "string" ? payload.title : undefined, results: assets.map((asset: Record<string, unknown>) => ({ ...asset, kind: asset.kind === "image" ? "image" : "video" })).slice(0, 12) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
