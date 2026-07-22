import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { getStoryProject, updateStoryProject, type StoryScene } from "@/lib/database";
import { FlowSession, FlowLoginRequired, FlowCaptcha } from "@/services/flow/flowClient";

export const runtime = "nodejs";
export const maxDuration = 600;

// Only one Flow browser session at a time (a persistent profile can't be opened twice).
let flowBusy = false;

function hasImage(mediaDir: string, index: number): boolean {
  return [".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
    fs.existsSync(path.join(mediaDir, `scene_${index}${ext}`)),
  );
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });

  const scenes: StoryScene[] = row.scenes_json ? JSON.parse(row.scenes_json) : [];
  if (scenes.length === 0) return NextResponse.json({ error: "Scenes இல்லை — முதலில் script generate செய்யவும்" }, { status: 400 });

  if (flowBusy) return NextResponse.json({ error: "Flow generation ஏற்கனவே ஓடுகிறது — முடியும்வரை காத்திருக்கவும்" }, { status: 409 });
  flowBusy = true;

  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  fs.mkdirSync(mediaDir, { recursive: true });
  const profileDir = path.join(process.cwd(), "data", "flow-profile");

  updateStoryProject(projectId, { status: "generating_images", error_message: null });

  // Run the (long) browser automation in the background; the UI polls image progress.
  (async () => {
    const session = new FlowSession({ profileDir });
    const failures: number[] = [];
    try {
      await session.start();
      // Keep the window open up to 3 min on first run so the user can log in manually.
      await session.ensureReady(180_000);

      // PIPELINED so wait-times overlap:
      // Phase 1 — fire every pending scene's prompt in its own fresh project
      // (fresh project per scene avoids the Agent's cross-prompt context-bleed),
      // WITHOUT waiting for the image; Flow keeps generating server-side.
      const jobs: { index: number; url: string }[] = [];
      for (let index = 0; index < scenes.length; index += 1) {
        if (hasImage(mediaDir, index)) continue; // resume: skip already-generated scenes
        const prompt = String(scenes[index].prompt || "").trim();
        if (!prompt) { failures.push(index + 1); continue; }
        try {
          const url = await session.submitPrompt(prompt);
          jobs.push({ index, url });
        } catch (error) {
          if (error instanceof FlowCaptcha) throw error; // stop the whole run on a challenge
          failures.push(index + 1); // per-scene failure: log and continue
        }
      }

      // Phase 2 — revisit each project and download its finished image. By now the
      // earlier scenes have generated while later prompts were being submitted.
      for (const job of jobs) {
        try {
          await session.collectImage(job.url, path.join(mediaDir, `scene_${job.index}.png`));
        } catch (error) {
          if (error instanceof FlowCaptcha) throw error;
          failures.push(job.index + 1);
        }
      }

      const remaining = scenes.map((_, i) => i).filter((i) => !hasImage(mediaDir, i));
      updateStoryProject(projectId, {
        status: "script_ready",
        error_message: remaining.length
          ? `இந்த scene-களுக்கு படம் வரவில்லை: ${remaining.map((i) => i + 1).join(", ")} — மீண்டும் "Flow-ல் படங்கள் உருவாக்கு" அழுத்தவும்`
          : null,
      });
    } catch (error) {
      const message =
        error instanceof FlowLoginRequired || error instanceof FlowCaptcha
          ? error.message
          : `Flow automation பிழை: ${error instanceof Error ? error.message : String(error)}`;
      updateStoryProject(projectId, { status: "script_ready", error_message: message });
    } finally {
      await session.close();
      flowBusy = false;
    }
  })();

  return NextResponse.json({ success: true, started: true, sceneCount: scenes.length });
}
