const path = require("node:path");
const fs = require("node:fs");
const { database } = require("../src/lib/database");
const { registerFolder, runFolderScan } = require("../src/services/personal/scanner");
const { searchLocalSemantic, searchLocalKeywords } = require("../src/services/personal/vector-store");
const { isSidecarHealthy, startSidecar, stopSidecar } = require("../src/services/personal/sidecar-manager");

// Mock process.cwd to root folder
process.cwd = () => path.resolve(__dirname, "..");

async function runTest() {
  console.log("=== Local AI Media Library E2E Verification ===");

  // 1. Create a dummy media folder in scratch directory
  const testDir = path.join(process.cwd(), "scratch", "TestMedia");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create dummy image and video files
  const testImage = path.join(testDir, "beach-sunset.jpg");
  fs.writeFileSync(testImage, Buffer.alloc(100)); // empty dummy file

  const testVideo = path.join(testDir, "family-beach.mp4");
  fs.writeFileSync(testVideo, Buffer.alloc(100)); // empty dummy file

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
  console.log("✓ Folder scan completed.");

  // 4. Test database indexing
  const db = database();
  const files = db.prepare("SELECT * FROM local_media_files WHERE folder_id=?").all(folderId);
  console.log(`Indexed files count: ${files.length}`);
  files.forEach(f => console.log(` - File: ${f.relative_path} (Status: ${f.scan_status})`));

  const scenes = db.prepare("SELECT * FROM local_media_scenes").all();
  console.log(`Total indexed scenes: ${scenes.length}`);

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
