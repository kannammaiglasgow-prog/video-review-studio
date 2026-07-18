import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

let instance: DatabaseSync | undefined;

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_url TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT 'auto',
      output_language TEXT NOT NULL DEFAULT 'ta',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      stance TEXT NOT NULL,
      tone TEXT NOT NULL,
      persona TEXT NOT NULL,
      voice TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      duration TEXT NOT NULL,
      custom_instruction TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      transcript TEXT,
      review_script TEXT,
      audio_path TEXT,
      output_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS processed_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS auto_devotional_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      shorts_enabled INTEGER DEFAULT 1,
      selected_voice TEXT DEFAULT 'parler-jaya',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO auto_devotional_settings (id, enabled, shorts_enabled, selected_voice) VALUES (1, 1, 1, 'parler-jaya');
    CREATE TABLE IF NOT EXISTS render_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      payload TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT OR IGNORE INTO migrations (id, name) VALUES (1, 'initial_review_studio');
  `);
  const hasColumn = (name: string) => (db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('projects') WHERE name=?").get(name) as { count: number }).count > 0;
  if (!hasColumn("source_type")) db.exec("ALTER TABLE projects ADD COLUMN source_type TEXT NOT NULL DEFAULT 'youtube'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (2, 'add_source_type')");
  if (!hasColumn("script_mode")) db.exec("ALTER TABLE projects ADD COLUMN script_mode TEXT NOT NULL DEFAULT 'rewrite'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (3, 'add_script_mode')");
  if (!hasColumn("tts_provider")) db.exec("ALTER TABLE projects ADD COLUMN tts_provider TEXT NOT NULL DEFAULT 'local'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (4, 'add_tts_provider')");
  if (!hasColumn("stock_keywords")) db.exec("ALTER TABLE projects ADD COLUMN stock_keywords TEXT");
  if (!hasColumn("allow_gemini_keywords")) db.exec("ALTER TABLE projects ADD COLUMN allow_gemini_keywords INTEGER NOT NULL DEFAULT 0");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (5, 'add_voiceover_mode')");
  if (!hasColumn("tier")) db.exec("ALTER TABLE projects ADD COLUMN tier TEXT NOT NULL DEFAULT 'premium'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (6, 'add_tier')");
  if (!hasColumn("video_style")) db.exec("ALTER TABLE projects ADD COLUMN video_style TEXT NOT NULL DEFAULT 'documentary'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (7, 'add_video_style')");
  if (!hasColumn("estimated_cost")) db.exec("ALTER TABLE projects ADD COLUMN estimated_cost REAL NOT NULL DEFAULT 0");
  if (!hasColumn("actual_cost")) db.exec("ALTER TABLE projects ADD COLUMN actual_cost REAL NOT NULL DEFAULT 0");
  if (!hasColumn("cost_breakdown")) db.exec("ALTER TABLE projects ADD COLUMN cost_breakdown TEXT");
  if (!hasColumn("cta_enabled")) db.exec("ALTER TABLE projects ADD COLUMN cta_enabled INTEGER NOT NULL DEFAULT 0");
  if (!hasColumn("cta_position")) db.exec("ALTER TABLE projects ADD COLUMN cta_position TEXT NOT NULL DEFAULT 'end'");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (9, 'add_cta_options')");

  if (!hasColumn("local_folder_id")) db.exec("ALTER TABLE projects ADD COLUMN local_folder_id INTEGER");
  if (!hasColumn("b_roll_source")) db.exec("ALTER TABLE projects ADD COLUMN b_roll_source TEXT NOT NULL DEFAULT 'stock'");
  if (!hasColumn("thumbnail_prompt")) db.exec("ALTER TABLE projects ADD COLUMN thumbnail_prompt TEXT");
  if (!hasColumn("thumbnail_path")) db.exec("ALTER TABLE projects ADD COLUMN thumbnail_path TEXT");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (12, 'add_thumbnail_prompt_path')");
  
  if (!hasColumn("split_shorts_enabled")) db.exec("ALTER TABLE projects ADD COLUMN split_shorts_enabled INTEGER NOT NULL DEFAULT 0");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (13, 'add_split_shorts_enabled')");

  if (!hasColumn("auto_approve")) db.exec("ALTER TABLE projects ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0");
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (14, 'add_auto_approve')");

  
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      scan_status TEXT NOT NULL DEFAULT 'queued',
      total_files INTEGER NOT NULL DEFAULT 0,
      scanned_files INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS local_media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL UNIQUE,
      duration REAL NOT NULL,
      resolution TEXT NOT NULL,
      fps REAL NOT NULL,
      bitrate INTEGER NOT NULL,
      orientation TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 1.0,
      scan_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(folder_id) REFERENCES local_media_folders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS local_media_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      location TEXT,
      tags TEXT,
      faces TEXT,
      emotions TEXT,
      camera_motion TEXT,
      best_start REAL NOT NULL,
      best_end REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(file_id) REFERENCES local_media_files(id) ON DELETE CASCADE
    );
  `);
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (10, 'add_personal_video_ai_engine')");

  const hasCol = (table: string, col: string) => (db.prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('${table}') WHERE name=?`).get(col) as { count: number }).count > 0;

  // Migration for local_media_folders
  if (!hasCol("local_media_folders", "watch_enabled")) {
    db.exec("ALTER TABLE local_media_folders ADD COLUMN watch_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasCol("local_media_folders", "include_subfolders")) {
    db.exec("ALTER TABLE local_media_folders ADD COLUMN include_subfolders INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasCol("local_media_folders", "last_scan_time")) {
    db.exec("ALTER TABLE local_media_folders ADD COLUMN last_scan_time TEXT");
  }

  // Migration for local_media_files
  if (!hasCol("local_media_files", "file_hash")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN file_hash TEXT");
  }
  if (!hasCol("local_media_files", "description")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN description TEXT");
  }
  if (!hasCol("local_media_files", "ocr_text")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN ocr_text TEXT");
  }
  if (!hasCol("local_media_files", "file_size")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasCol("local_media_files", "created_file_at")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN created_file_at TEXT");
  }
  if (!hasCol("local_media_files", "modified_file_at")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN modified_file_at TEXT");
  }
  if (!hasCol("local_media_files", "blur_score")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN blur_score REAL NOT NULL DEFAULT 0.0");
  }
  if (!hasCol("local_media_files", "brightness_score")) {
    db.exec("ALTER TABLE local_media_files ADD COLUMN brightness_score REAL NOT NULL DEFAULT 0.0");
  }

  // Migration for local_media_scenes
  if (!hasCol("local_media_scenes", "description")) {
    db.exec("ALTER TABLE local_media_scenes ADD COLUMN description TEXT");
  }
  if (!hasCol("local_media_scenes", "duration")) {
    db.exec("ALTER TABLE local_media_scenes ADD COLUMN duration REAL NOT NULL DEFAULT 0.0");
  }
  if (!hasCol("local_media_scenes", "quality_score")) {
    db.exec("ALTER TABLE local_media_scenes ADD COLUMN quality_score REAL NOT NULL DEFAULT 1.0");
  }
  if (!hasCol("local_media_scenes", "ocr_text")) {
    db.exec("ALTER TABLE local_media_scenes ADD COLUMN ocr_text TEXT");
  }
  if (!hasCol("local_media_scenes", "speech_text")) {
    db.exec("ALTER TABLE local_media_scenes ADD COLUMN speech_text TEXT");
  }

  // Table for embeddings
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_media_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER,
      scene_id INTEGER,
      model_name TEXT NOT NULL,
      vector BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(file_id) REFERENCES local_media_files(id) ON DELETE CASCADE,
      FOREIGN KEY(scene_id) REFERENCES local_media_scenes(id) ON DELETE CASCADE
    );
  `);
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (11, 'intelligent_media_library')");
}

export function database() {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  instance = new DatabaseSync(config.databasePath);
  instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;");
  migrate(instance);
  return instance;
}

export function addProjectActualCost(projectId: number, stepName: string, amount: number) {
  const db = database();
  const row = db.prepare("SELECT actual_cost, cost_breakdown FROM projects WHERE id = ?").get(projectId) as { actual_cost: number; cost_breakdown: string | null } | undefined;
  if (!row) return;

  const currentCost = row.actual_cost || 0;
  const newCost = currentCost + amount;

  let breakdown: Record<string, number> = {};
  if (row.cost_breakdown) {
    try { breakdown = JSON.parse(row.cost_breakdown); } catch {}
  }
  breakdown[stepName] = (breakdown[stepName] || 0) + amount;

  db.prepare("UPDATE projects SET actual_cost = ?, cost_breakdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newCost, JSON.stringify(breakdown), projectId);
}
