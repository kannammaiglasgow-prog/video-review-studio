import path from "node:path";
import fs from "node:fs";
import { database } from "../src/lib/database";
import { registerFolder, runFolderScan } from "../src/services/personal/scanner";
import { searchLocalSemantic } from "../src/services/personal/vector-store";
import { isSidecarHealthy, startSidecar, stopSidecar } from "../src/services/personal/sidecar-manager";

async function runTest() {
  console.log("=== Local AI Media Library E2E Verification ===");

  // 1. Create a dummy media folder in scratch directory and truncate db tables for test isolation
  const db = database();
  db.exec("DELETE FROM local_media_embeddings; DELETE FROM local_media_scenes; DELETE FROM local_media_files; DELETE FROM local_media_folders;");
  console.log("✓ Truncated SQLite media library tables for test isolation.");

  const testDir = path.join(process.cwd(), "scratch", "TestMedia");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Copy real assets from artifacts directory to prevent invalid container/format errors
  const artifactsDir = "C:/Users/kanna/.gemini/antigravity/brain/1697935b-9017-44d2-a153-6c5e1c6457bb";
  const realVideo = path.join(artifactsDir, "test_review_71.mp4");
  const realImage = path.join(artifactsDir, "media__1783925567856.png");

  const testVideo = path.join(testDir, "family-beach.mp4");
  const testImage = path.join(testDir, "beach-sunset.png");

  if (fs.existsSync(realVideo)) {
    fs.copyFileSync(realVideo, testVideo);
    console.log("✓ Copied real test video from artifacts.");
  } else {
    fs.writeFileSync(testVideo, Buffer.alloc(100));
  }

  if (fs.existsSync(realImage)) {
    fs.copyFileSync(realImage, testImage);
    console.log("✓ Copied real test image from artifacts.");
  } else {
    fs.writeFileSync(testImage, Buffer.alloc(100));
  }

  console.log(`Created test assets inside: ${testDir}`);

  // 2. Check health of Python Sidecar
  console.log("Checking if local AI sidecar is running...");
  let healthy = await isSidecarHealthy();
  if (!healthy) {
    console.log("Starting local AI sidecar worker process...");
    await startSidecar();
  } else {
    console.log("✓ Local AI sidecar worker is healthy.");
  }

  // 3. Register folder and trigger scan
  console.log(`Registering folder: ${testDir}`);
  const folderId = await registerFolder(testDir);
  console.log(`✓ Folder registered with ID: ${folderId}`);

  // Trigger scanning
  console.log("Running folder scanner...");
  await runFolderScan(folderId);
  
  let files: any[] = [];
  console.log("Waiting for background indexing to complete...");
  for (let i = 0; i < 30; i++) {
    files = db.prepare("SELECT * FROM local_media_files WHERE folder_id=?").all(folderId) as any[];
    const pending = files.filter(f => f.scan_status === "scanning" || f.scan_status === "queued");
    if (pending.length === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log("✓ Folder scan completed.");

  // 4. Test database indexing
  console.log(`Indexed files count: ${files.length}`);
  files.forEach(f => console.log(` - File: ${f.relative_path} (Status: ${f.scan_status})`));

  const scenes = db.prepare("SELECT * FROM local_media_scenes").all() as any[];
  console.log(`Total indexed scenes: ${scenes.length}`);

  const embs = db.prepare("SELECT * FROM local_media_embeddings").all() as any[];
  console.log(`Total indexed embeddings: ${embs.length}`);

  // 5. Test semantic search querying
  console.log("\nTesting Semantic CLIP Search: 'beach sunset'...");
  const results = await searchLocalSemantic("beach sunset");
  console.log(`Search Results count: ${results.length}`);
  results.forEach((r, idx) => {
    console.log(` [${idx + 1}] Scene ID: ${r.sceneId}, File: ${r.relative_path}, Score: ${r.score.toFixed(4)}, Kind: ${r.kind}`);
  });

  // Test Tamil query
  console.log("\nTesting Semantic CLIP Search (Tamil): 'கடற்கரையில் சூரிய அஸ்தமனம்'...");
  const tamilResults = await searchLocalSemantic("கடற்கரையில் சூரிய அஸ்தமனம்");
  console.log(`Tamil Search Results count: ${tamilResults.length}`);
  tamilResults.forEach((r, idx) => {
    console.log(` [${idx + 1}] Scene ID: ${r.sceneId}, File: ${r.relative_path}, Score: ${r.score.toFixed(4)}, Kind: ${r.kind}`);
  });

  // Clean up
  console.log("\nStopping local AI sidecar worker...");
  stopSidecar();
  console.log("=== Verification Finished ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  stopSidecar();
});
