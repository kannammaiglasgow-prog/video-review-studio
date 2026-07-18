import { compositeReactionVideo } from "../src/services/render/compositor";
import { database } from "../src/lib/database";
import { config } from "../src/lib/config";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

async function main() {
  console.log("=== Reaction/Review Generator Verification ===");

  const workspaceRoot = process.cwd();
  const testVideoPath = path.join(workspaceRoot, "scratch/TestMedia/family-beach.mp4").replaceAll("\\", "/");

  if (!existsSync(testVideoPath)) {
    console.error(`Test source video not found at: ${testVideoPath}`);
    console.log("Please run test-local-media first or ensure family-beach.mp4 exists in scratch/TestMedia.");
    process.exit(1);
  }

  // Create a dummy project in database to get projectId
  const db = database();
  const res = db.prepare(`
    INSERT INTO projects (
      youtube_url, source_type, script_mode, start_time, end_time,
      stance, tone, persona, voice, tts_provider, aspect_ratio, duration, output_language, status
    ) VALUES ('mock-url', 'youtube', 'reaction', '0', '0', 'neutral', 'fun', 'normal', 'பெண் — இயல்பான', 'local', '16:9', 'auto', 'ta', 'queued')
  `).run();
  const projectId = Number(res.lastInsertRowid);
  console.log(`Created mock project ID: ${projectId}`);

  // 3 Mock Highlights with reaction commentary in Tamil
  const highlights = [
    {
      startMs: 1000,
      endMs: 4000,
      commentary: "பாருங்கள், குழந்தைகள் கடற்கரையில் எவ்வளவு மகிழ்ச்சியாக ஓடுகிறார்கள்!"
    },
    {
      startMs: 6000,
      endMs: 9000,
      commentary: "மிகவும் அழகான இயற்கை காட்சி, இது பார்ப்பதற்கு மிகவும் ரம்மியமாக இருக்கிறது."
    }
  ];

  const layouts: Array<"sequential" | "split-screen" | "pause-and-explain" | "pip" | "news-overlay"> = [
    "sequential",
    "split-screen",
    "pause-and-explain",
    "pip",
    "news-overlay"
  ];

  for (const layout of layouts) {
    console.log(`\n--- Compiling Layout: ${layout} ---`);
    const outPath = path.join(workspaceRoot, `scratch/reaction-${layout}.mp4`).replaceAll("\\", "/");
    
    try {
      await compositeReactionVideo({
        projectId,
        sourceVideoPath: testVideoPath,
        highlights,
        layout,
        outputLanguage: "ta",
        voice: "பெண் — இயல்பான",
        aspectRatio: "16:9",
        outputPath: outPath
      });
      console.log(`✓ successfully rendered: ${outPath}`);
    } catch (err: any) {
      console.error(`✗ failed to render layout ${layout}:`, err);
    }
  }

  // Clean up database row
  db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
  console.log("\n=== Verification Finished ===");
}

main().catch(console.error);
