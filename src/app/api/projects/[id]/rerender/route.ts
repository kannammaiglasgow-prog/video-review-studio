import { NextResponse } from "next/server";
import { rerenderProject } from "@/services/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) throw new Error("தவறான project ID");
    return NextResponse.json(await rerenderProject(projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Render தோல்வியடைந்தது" }, { status: 400 });
  }
}
