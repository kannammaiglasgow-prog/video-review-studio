import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { database } from "@/lib/database";
import { probeVideoMetadata } from "../render/ffprobe";
import { callSidecar } from "./sidecar-manager";
import { runFfmpeg } from "../render/ffmpeg";

const CACHE_DIR = path.join(process.cwd(), "data", "media-cache");
const KEYFRAME_DIR = path.join(CACHE_DIR, "keyframes");
const THUMBNAIL_DIR = path.join(CACHE_DIR, "thumbnails");

// Supported extensions
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mts", ".m2ts", ".mpeg", ".mpg", ".wmv"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif"]);

// Active scans and watchers trackers
const activeScans = new Map<number, boolean>();
const activeWatchers = new Map<number, fssync.FSWatcher>();

export function pauseScan(folderId: number) {
  activeScans.set(folderId, false);
  const db = database();
  db.prepare("UPDATE local_media_folders SET scan_status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(folderId);
}

export function resumeScan(folderId: number) {
  activeScans.set(folderId, true);
  const db = database();
  db.prepare("UPDATE local_media_folders SET scan_status='scanning', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(folderId);
  runFolderScan(folderId).catch(console.error);
}

export async function registerFolder(folderPath: string): Promise<number> {
  const db = database();
  const absolutePath = path.resolve(folderPath).replaceAll("\\", "/");
  
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isDirectory()) {
      throw new Error("Not a directory");
    }
  } catch {
    throw new Error(`Folder path not found: ${folderPath}`);
  }

  let row = db.prepare("SELECT id FROM local_media_folders WHERE path=?").get(absolutePath) as { id: number } | undefined;
  if (!row) {
    const res = db.prepare("INSERT INTO local_media_folders (path, scan_status) VALUES (?, 'queued')").run(absolutePath);
    row = { id: Number(res.lastInsertRowid) };
  }

  activeScans.set(row.id, true);
  runFolderScan(row.id).catch(console.error);
  startFolderWatcher(row.id);

  return row.id;
}

// Generate file fingerprint/hash
async function getFileFingerprint(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    const length = Math.min(stat.size, 65536);
    if (length === 0) return `0-${stat.mtimeMs}-empty`;
    
    const buffer = Buffer.alloc(length);
    const handle = await fs.open(filePath, "r");
    await handle.read(buffer, 0, length, 0);
    await handle.close();
    
    const partial = crypto.createHash("sha256").update(buffer).digest("hex");
    return `${stat.size}-${stat.mtimeMs}-${partial}`;
  } catch {
    return `error-${Date.now()}`;
  }
}

async function scanDirectory(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  async function recurse(current: string) {
    try {
      const items = await fs.readdir(current, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(current, item.name).replaceAll("\\", "/");
        if (item.isDirectory()) {
          if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "temp" || item.name === "thumbnails") continue;
          await recurse(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (VIDEO_EXTS.has(ext) || IMAGE_EXTS.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {}
  }
  await recurse(dirPath);
  return results;
}

export async function runFolderScan(folderId: number) {
  const db = database();
  const folder = db.prepare("SELECT path FROM local_media_folders WHERE id=?").get(folderId) as { path: string } | undefined;
  if (!folder) return;

  await fs.mkdir(KEYFRAME_DIR, { recursive: true });
  await fs.mkdir(THUMBNAIL_DIR, { recursive: true });

  db.prepare("UPDATE local_media_folders SET scan_status='scanning', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(folderId);

  try {
    const files = await scanDirectory(folder.path);
    db.prepare("UPDATE local_media_folders SET total_files=? WHERE id=?").run(files.length, folderId);

    const insertFile = db.prepare(`
      INSERT OR IGNORE INTO local_media_files (folder_id, relative_path, absolute_path, duration, resolution, fps, bitrate, orientation, scan_status, file_size)
      VALUES (?, ?, ?, 0.0, '1920x1080', 0.0, 0, 'landscape', 'pending', 0)
    `);

    for (const file of files) {
      const relative = path.relative(folder.path, file).replaceAll("\\", "/");
      insertFile.run(folderId, relative, file);
    }

    const pendingFiles = db.prepare("SELECT id, absolute_path FROM local_media_files WHERE folder_id=? AND scan_status='pending'").all(folderId) as { id: number; absolute_path: string }[];
    let scannedCount = files.length - pendingFiles.length;
    db.prepare("UPDATE local_media_folders SET scanned_files=? WHERE id=?").run(scannedCount, folderId);

    for (const pf of pendingFiles) {
      if (activeScans.get(folderId) === false) return;

      try {
        db.prepare("UPDATE local_media_files SET scan_status='scanning' WHERE id=?").run(pf.id);
        
        const stat = await fs.stat(pf.absolute_path);
        const fileHash = await getFileFingerprint(pf.absolute_path);
        const ext = path.extname(pf.absolute_path).toLowerCase();
        const isImage = IMAGE_EXTS.has(ext);

        // Check for duplicates in database
        const dup = db.prepare("SELECT id, description, ocr_text FROM local_media_files WHERE file_hash=? AND id!=? AND scan_status='completed' LIMIT 1").get(fileHash, pf.id) as { id: number; description: string; ocr_text: string } | undefined;
        
        if (dup) {
          console.log(`Duplicate media detected for hash ${fileHash}. Copying index metadata.`);
          db.prepare(`
            UPDATE local_media_files 
            SET file_hash=?, description=?, ocr_text=?, file_size=?, scan_status='completed'
            WHERE id=?
          `).run(fileHash, dup.description, dup.ocr_text, stat.size, pf.id);

          // Copy scenes
          const scenes = db.prepare("SELECT * FROM local_media_scenes WHERE file_id=?").all(dup.id) as any[];
          const insertScene = db.prepare(`
            INSERT INTO local_media_scenes (file_id, start_time, end_time, location, tags, faces, emotions, camera_motion, best_start, best_end, description, duration, quality_score, ocr_text, speech_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          for (const sc of scenes) {
            insertScene.run(pf.id, sc.start_time, sc.end_time, sc.location, sc.tags, sc.faces, sc.emotions, sc.camera_motion, sc.best_start, sc.best_end, sc.description, sc.duration, sc.quality_score, sc.ocr_text, sc.speech_text);
          }
          
          scannedCount++;
          db.prepare("UPDATE local_media_folders SET scanned_files=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(scannedCount, folderId);
          continue;
        }

        if (isImage) {
          // Process Image Asset
          const analysis = await callSidecar("analyze-media", { imagePath: pf.absolute_path, mode: "balanced" }).catch(() => ({}));
          const tags = Array.isArray(analysis.tags) ? analysis.tags : ["image", "photo"];
          
          db.prepare(`
            UPDATE local_media_files 
            SET file_hash=?, description=?, ocr_text=?, file_size=?, scan_status='completed', resolution='1920x1080', duration=0.0
            WHERE id=?
          `).run(fileHash, analysis.description || "Image file", analysis.ocrText || "", stat.size, pf.id);

          // Create standard scene entry for search uniformity
          const sceneIdRes = db.prepare(`
            INSERT INTO local_media_scenes (file_id, start_time, end_time, location, tags, faces, emotions, camera_motion, best_start, best_end, description, duration, quality_score, ocr_text)
            VALUES (?, 0.0, 0.0, 'indoors', ?, '[]', '[]', 'static', 0.0, 0.0, ?, 0.0, 1.0, ?)
          `).run(pf.id, JSON.stringify(tags), analysis.description || "Image scene", analysis.ocrText || "");

          if (analysis.vector && analysis.vector.length > 0) {
            const sceneId = Number(sceneIdRes.lastInsertRowid);
            const vectorBuffer = Buffer.from(new Float32Array(analysis.vector).buffer);
            db.prepare("INSERT INTO local_media_embeddings (file_id, scene_id, model_name, vector) VALUES (?, ?, ?, ?)").run(pf.id, sceneId, "clip-vit-base-32", vectorBuffer);
          }
        } else {
          // Process Video Asset
          const meta = await probeVideoMetadata(pf.absolute_path);
          const orientation = meta.width < meta.height ? "portrait" : "landscape";
          const resolution = `${meta.width}x${meta.height}`;
          
          db.prepare(`
            UPDATE local_media_files 
            SET file_hash=?, file_size=?, duration=?, resolution=?, fps=?, bitrate=?, orientation=?, scan_status='processing'
            WHERE id=?
          `).run(fileHash, stat.size, meta.duration, resolution, meta.fps, meta.bitrate, orientation, pf.id);

          // Split scenes using Python scene detect API
          const sceneRes = await callSidecar("detect-scenes", { videoPath: pf.absolute_path }).catch(() => ({ scenes: [] }));
          let scenesList = sceneRes.scenes || [];
          
          // Fallback to static 5s segmentation if empty
          if (scenesList.length === 0) {
            const sceneLength = 5.0;
            const numScenes = Math.max(1, Math.ceil(meta.duration / sceneLength));
            for (let i = 0; i < numScenes; i++) {
              const start = i * sceneLength;
              const end = Math.min(meta.duration, start + sceneLength);
              if (end - start >= 1.0) {
                scenesList.push({ start, end, duration: end - start });
              }
            }
          }

          // Process each scene
          const insertScene = db.prepare(`
            INSERT INTO local_media_scenes (file_id, start_time, end_time, location, tags, faces, emotions, camera_motion, best_start, best_end, description, duration, quality_score, ocr_text, speech_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (let index = 0; index < scenesList.length; index++) {
            const sc = scenesList[index];
            const sceneMid = sc.start + (sc.duration / 2);
            const keyframeName = `keyframe-${pf.id}-${index}.jpg`;
            const keyframePath = path.join(KEYFRAME_DIR, keyframeName);

            // Extract mid-scene frame using FFmpeg
            await runFfmpeg([
              "-ss", sceneMid.toFixed(2),
              "-i", pf.absolute_path,
              "-vframes", "1",
              "-vf", "scale=640:360",
              "-q:v", "4",
              keyframePath
            ]).catch(() => null);

            let analysis = { vector: [], description: "Video scene", tags: [], ocrText: "" };
            if (fssync.existsSync(keyframePath)) {
              analysis = await callSidecar("analyze-media", { imagePath: keyframePath, mode: "balanced" }).catch(() => analysis);
            }

            const tags = Array.isArray(analysis.tags) && analysis.tags.length > 0 ? analysis.tags : ["video", "clip"];
            const bestStart = sc.start + (sc.duration > 4 ? 0.5 : 0.0);
            const bestEnd = Math.min(sc.end, bestStart + Math.min(6.0, sc.duration - 0.5));

            const sceneIdRes = insertScene.run(
              pf.id,
              sc.start,
              sc.end,
              "outdoors",
              JSON.stringify(tags),
              "[]",
              "[]",
              "static",
              bestStart,
              bestEnd,
              analysis.description || `Video scene ${index + 1}`,
              sc.duration,
              1.0,
              analysis.ocrText || "",
              ""
            );

            if (analysis.vector && analysis.vector.length > 0) {
              const sceneId = Number(sceneIdRes.lastInsertRowid);
              const vectorBuffer = Buffer.from(new Float32Array(analysis.vector).buffer);
              db.prepare("INSERT INTO local_media_embeddings (file_id, scene_id, model_name, vector) VALUES (?, ?, ?, ?)").run(pf.id, sceneId, "clip-vit-base-32", vectorBuffer);
            }
          }

          db.prepare("UPDATE local_media_files SET scan_status='completed' WHERE id=?").run(pf.id);
        }

        scannedCount++;
        db.prepare("UPDATE local_media_folders SET scanned_files=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(scannedCount, folderId);
      } catch (err) {
        console.error(`File processing failed: ${pf.absolute_path}`, err);
        db.prepare("UPDATE local_media_files SET scan_status='error' WHERE id=?").run(pf.id);
      }
    }

    db.prepare("UPDATE local_media_folders SET scan_status='completed', last_scan_time=CURRENT_TIMESTAMP WHERE id=?").run(folderId);
    activeScans.delete(folderId);
  } catch (err) {
    console.error("Folder scan failed", err);
    db.prepare("UPDATE local_media_folders SET scan_status='error', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(folderId);
    activeScans.delete(folderId);
  }
}

// Background Folder Watching
export function startFolderWatcher(folderId: number) {
  if (activeWatchers.has(folderId)) return;

  const db = database();
  const folder = db.prepare("SELECT path FROM local_media_folders WHERE id=?").get(folderId) as { path: string } | undefined;
  if (!folder) return;

  console.log(`Starting Folder Watcher for: ${folder.path}`);
  const stableFileTimers = new Map<string, NodeJS.Timeout>();

  try {
    const watcher = fssync.watch(folder.path, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(folder.path, filename).replaceAll("\\", "/");
      const ext = path.extname(fullPath).toLowerCase();
      if (!VIDEO_EXTS.has(ext) && !IMAGE_EXTS.has(ext)) return;

      // Handle File stability check before trigger
      if (stableFileTimers.has(fullPath)) {
        clearTimeout(stableFileTimers.get(fullPath));
      }

      const timer = setTimeout(async () => {
        stableFileTimers.delete(fullPath);
        
        const exists = fssync.existsSync(fullPath);
        
        // Verify folder still exists in database to prevent FOREIGN KEY constraint errors from orphaned background watchers
        const folderExists = db.prepare("SELECT id FROM local_media_folders WHERE id = ?").get(folderId);
        if (!folderExists) {
          watcher.close();
          return;
        }

        if (exists) {
          // File created or modified
          const relative = path.relative(folder.path, fullPath).replaceAll("\\", "/");
          db.prepare(`
            INSERT OR IGNORE INTO local_media_files (folder_id, relative_path, absolute_path, duration, resolution, fps, bitrate, orientation, scan_status, file_size)
            VALUES (?, ?, ?, 0.0, '1920x1080', 0.0, 0, 'landscape', 'pending', 0)
          `).run(folderId, relative, fullPath);
          
          activeScans.set(folderId, true);
          runFolderScan(folderId).catch(console.error);
        } else {
          // File deleted
          db.prepare("DELETE FROM local_media_files WHERE absolute_path=?").run(fullPath);
        }
      }, 3000); // stable wait time: 3 seconds

      stableFileTimers.set(fullPath, timer);
    });

    activeWatchers.set(folderId, watcher);
  } catch (err) {
    console.error(`Failed to watch folder: ${folder.path}`, err);
  }
}

export function stopFolderWatcher(folderId: number) {
  const watcher = activeWatchers.get(folderId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(folderId);
  }
}
