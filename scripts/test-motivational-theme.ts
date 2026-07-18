import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { existsSync } from "node:fs";
import path from "node:path";

async function main() {
  console.log("=== Reaction Generator: Motivational Theme Copy Test ===");

  const workspaceRoot = process.cwd();
  const testVideoPath = path.join(workspaceRoot, "scratch/sample.mp4").replaceAll("\\", "/");

  if (!existsSync(testVideoPath)) {
    console.error(`Test source video not found at: ${testVideoPath}`);
    process.exit(1);
  }

  // Dynamically import database and compositor to ensure environment variables are populated first
  const { database } = await import("../src/lib/database");
  const { compositeReactionVideo } = await import("../src/services/render/compositor");
  const { config } = await import("../src/lib/config");

  console.log(`Loaded PEXELS_API_KEY present: ${Boolean(config.api.pexels)}`);

  // Create mock project in database
  const db = database();
  const res = db.prepare(`
    INSERT INTO projects (
      youtube_url, source_type, script_mode, start_time, end_time,
      stance, tone, persona, voice, tts_provider, aspect_ratio, duration, output_language, status, video_style
    ) VALUES ('mock-url-motivational', 'youtube', 'reaction', '0', '0', 'neutral', 'fun', 'normal', 'பெண் — இயல்பான', 'local', '9:16', 'auto', 'ta', 'queued', 'motivational')
  `).run();
  const projectId = Number(res.lastInsertRowid);
  console.log(`Created mock project ID: ${projectId}`);

  // Mock highlights based on the Rajinikanth interview speech segment
  const highlights = [
    {
      startMs: 1000,
      endMs: 5000,
      commentary: "வாழ்க்கை என்றால் என்ன என்பதை புரிந்து கொள்ள பல ஆண்டுகள் ஆகும். ஆனால் நாம் அதை எளிதாக கடந்து செல்ல வேண்டும்."
    },
    {
      startMs: 7000,
      endMs: 12000,
      commentary: "உங்களது புன்னகை தான் உங்களது உண்மையான பலம். அதை எப்போதும் இழந்து விடாதீர்கள்!"
    }
  ];

  const outputPath = path.join(workspaceRoot, "scratch/reaction-motivational.mp4").replaceAll("\\", "/");
  console.log(`\n--- Compiling Layout: split-screen with theme: motivational ---`);

  try {
    await compositeReactionVideo({
      projectId,
      sourceVideoPath: testVideoPath,
      highlights,
      layout: "split-screen",
      outputLanguage: "ta",
      voice: "ta_IN-rasa_female-medium",
      aspectRatio: "9:16",
      theme: "motivational",
      outputPath
    });

    if (existsSync(outputPath)) {
      console.log(`✓ successfully rendered motivational video: ${outputPath}`);
    } else {
      console.error(`✗ failed to locate output file at: ${outputPath}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ Compilation failed with error:`, err);
    process.exit(1);
  }

  console.log("=== Verification Finished ===");
}

main().catch(console.error);
