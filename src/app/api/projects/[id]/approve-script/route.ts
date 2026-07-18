import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { processProject } from "@/services/pipeline";
import { config } from "@/lib/config";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 300;

async function runBackgroundReactionRender(projectId: number, highlightsJson: string) {
  const db = database();
  try {
    const project = db.prepare("SELECT youtube_url, voice, output_language, aspect_ratio, custom_instruction, video_style FROM projects WHERE id=?").get(projectId) as any;
    const projectDir = path.join(config.mediaRoot, "projects", String(projectId));
    const videoPath = path.join(projectDir, "source.mp4").replaceAll("\\", "/");
    const outputPath = path.join(projectDir, "output.mp4").replaceAll("\\", "/");
    const highlights = JSON.parse(highlightsJson);
    
    const { compositeReactionVideo } = await import("@/services/render/compositor");
    await compositeReactionVideo({
      projectId,
      sourceVideoPath: videoPath,
      highlights,
      layout: project.custom_instruction || "pause-and-explain",
      outputLanguage: project.output_language,
      voice: project.voice,
      aspectRatio: project.aspect_ratio,
      theme: project.video_style || "standard",
      outputPath
    });
    
    db.prepare("UPDATE projects SET status='complete', output_path=? WHERE id=?").run(outputPath, projectId);
    console.log(`[Reaction Background Render] Project ${projectId} completed successfully!`);
  } catch (err: any) {
    console.error(`[Reaction Background Render] Project ${projectId} failed:`, err);
    db.prepare("UPDATE projects SET status='failed', error_message=? WHERE id=?").run(err.message || String(err), projectId);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) return NextResponse.json({ error: "தவறான project ID" }, { status: 400 });

    const { script } = await request.json();
    if (!script || typeof script !== "string") return NextResponse.json({ error: "Script தேவை" }, { status: 400 });

    const db = database();
    
    // Check if the project is a reaction video project
    const project = db.prepare("SELECT script_mode FROM projects WHERE id=?").get(projectId) as any;
    if (project?.script_mode === "reaction") {
      db.prepare("UPDATE projects SET review_script=?, status='rendering', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(script, projectId);
      
      // Trigger rendering in background
      runBackgroundReactionRender(projectId, script).catch(err => console.error("Reaction background render crashed", err));
      
      return NextResponse.json({ status: "rendering", message: "Reaction video rendering started" });
    }

    db.prepare("UPDATE projects SET review_script=?, status='script_approved', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(script, projectId);

    const result = await processProject(projectId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Script ஒப்புதல் தோல்வியடைந்தது" }, { status: 400 });
  }
}
