import { NextResponse } from "next/server";
import { stockClipPaths } from "@/services/pipeline";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });
  const paths = await stockClipPaths(projectId);
  return NextResponse.json({ clips: paths.map((filePath, index) => ({ index, url: `/api/projects/${projectId}/clips/${index}`, kind: /\.mp4$/i.test(filePath) ? "video" : "image" })) });
}
