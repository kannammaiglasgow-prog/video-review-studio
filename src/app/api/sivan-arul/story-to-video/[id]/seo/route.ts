import { NextResponse } from "next/server";
import { getStoryProject, updateStoryProject } from "@/lib/database";
import { generateSeo } from "@/services/story/generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row?.script) return NextResponse.json({ error: "Script இன்னும் தயாராகவில்லை" }, { status: 400 });

  try {
    const seo = await generateSeo(row.script, projectId, row.language === "en" ? "en" : "ta");
    updateStoryProject(projectId, { seo_title: seo.title, seo_description: seo.description, seo_tags: JSON.stringify(seo.tags) });
    return NextResponse.json({ success: true, ...seo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SEO generation தோல்வி" }, { status: 500 });
  }
}
