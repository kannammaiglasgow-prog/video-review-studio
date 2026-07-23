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

  db.exec(`
    CREATE TABLE IF NOT EXISTS story_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_input TEXT NOT NULL,
      script TEXT,
      duration_target INTEGER NOT NULL,
      voice TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generating',
      scenes_json TEXT,
      audio_path TEXT,
      audio_duration REAL,
      output_path TEXT,
      seo_title TEXT,
      seo_description TEXT,
      seo_tags TEXT,
      youtube_channel TEXT,
      youtube_video_id TEXT,
      youtube_url TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (15, 'add_story_projects')");

  // Story options + API cost tracking
  if (!hasCol("story_projects", "aspect_ratio")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT '16:9'");
  }
  if (!hasCol("story_projects", "bgm_enabled")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN bgm_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasCol("story_projects", "animate_enabled")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN animate_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasCol("story_projects", "api_cost")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN api_cost REAL NOT NULL DEFAULT 0");
  }
  if (!hasCol("story_projects", "cost_breakdown")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN cost_breakdown TEXT");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (16, 'story_options_and_cost')");

  if (!hasCol("story_projects", "language")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN language TEXT NOT NULL DEFAULT 'ta'");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (17, 'story_language')");

  if (!hasCol("story_projects", "media_source")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN media_source TEXT NOT NULL DEFAULT 'flow'");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (18, 'story_media_source')");

  if (!hasCol("story_projects", "thumbnail_prompt")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN thumbnail_prompt TEXT");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (19, 'story_thumbnail_prompt')");

  if (!hasCol("story_projects", "tts_mode")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN tts_mode TEXT NOT NULL DEFAULT 'paid'");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (20, 'story_tts_mode')");

  if (!hasCol("story_projects", "localize")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN localize INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (21, 'story_localize')");

  if (!hasCol("story_projects", "facebook_page_id")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN facebook_page_id TEXT");
  }
  if (!hasCol("story_projects", "facebook_video_id")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN facebook_video_id TEXT");
  }
  if (!hasCol("story_projects", "facebook_url")) {
    db.exec("ALTER TABLE story_projects ADD COLUMN facebook_url TEXT");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (22, 'story_facebook')");

  // auto_news_settings/auto_news_logs previously existed only as ad-hoc tables outside
  // migrations tracking; bring them under it here and add the free/paid TTS toggle.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_news_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled INTEGER DEFAULT 0,
      shorts_enabled INTEGER DEFAULT 0,
      selected_voice TEXT DEFAULT 'parler-jaya',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO auto_news_settings (id, enabled, shorts_enabled, selected_voice) VALUES (1, 0, 0, 'parler-jaya');
    CREATE TABLE IF NOT EXISTS auto_news_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      project_id INTEGER,
      region TEXT,
      step TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (!hasCol("auto_news_settings", "tts_mode")) {
    db.exec("ALTER TABLE auto_news_settings ADD COLUMN tts_mode TEXT NOT NULL DEFAULT 'free'");
  }
  db.exec("INSERT OR IGNORE INTO migrations (id, name) VALUES (23, 'auto_news_tts_mode')");
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

export type StoryScene = { prompt: string; seconds: number; imagePath?: string };

export type StoryProjectRow = {
  id: number;
  story_input: string;
  script: string | null;
  duration_target: number;
  voice: string;
  status: string;
  scenes_json: string | null;
  audio_path: string | null;
  audio_duration: number | null;
  output_path: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_tags: string | null;
  youtube_channel: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  facebook_page_id: string | null;
  facebook_video_id: string | null;
  facebook_url: string | null;
  error_message: string | null;
  aspect_ratio: string;
  bgm_enabled: number;
  animate_enabled: number;
  api_cost: number;
  cost_breakdown: string | null;
  language: string;
  media_source: string;
  thumbnail_prompt: string | null;
  tts_mode: string;
  localize: number;
  created_at: string;
  updated_at: string;
};

export type StoryOptions = { aspectRatio?: "16:9" | "9:16"; bgm?: boolean; animate?: boolean; language?: "ta" | "en"; mediaSource?: "flow" | "stock"; ttsMode?: "free" | "paid"; localize?: boolean };

export function createStoryProject(storyInput: string, durationTarget: number, voice: string, options: StoryOptions = {}): number {
  const db = database();
  const result = db.prepare(
    "INSERT INTO story_projects (story_input, duration_target, voice, status, aspect_ratio, bgm_enabled, animate_enabled, language, media_source, tts_mode, localize) VALUES (?, ?, ?, 'generating', ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    storyInput,
    durationTarget,
    voice,
    options.aspectRatio === "9:16" ? "9:16" : "16:9",
    options.bgm ? 1 : 0,
    options.animate === false ? 0 : 1,
    options.language === "en" ? "en" : "ta",
    options.mediaSource === "stock" ? "stock" : "flow",
    options.ttsMode === "free" ? "free" : "paid",
    options.localize ? 1 : 0,
  );
  return Number(result.lastInsertRowid);
}

/** Accumulate an API cost (USD) against a story project, with a per-step breakdown. */
export function addStoryCost(storyId: number, step: string, amount: number) {
  if (!storyId || !amount) return;
  const db = database();
  const row = db.prepare("SELECT api_cost, cost_breakdown FROM story_projects WHERE id = ?").get(storyId) as { api_cost: number; cost_breakdown: string | null } | undefined;
  if (!row) return;
  const breakdown: Record<string, number> = row.cost_breakdown ? safeParse(row.cost_breakdown) : {};
  breakdown[step] = (breakdown[step] || 0) + amount;
  db.prepare("UPDATE story_projects SET api_cost = ?, cost_breakdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run((row.api_cost || 0) + amount, JSON.stringify(breakdown), storyId);
}

function safeParse(text: string): Record<string, number> {
  try { return JSON.parse(text); } catch { return {}; }
}

export function getStoryProject(id: number): StoryProjectRow | undefined {
  const db = database();
  return db.prepare("SELECT * FROM story_projects WHERE id = ?").get(id) as StoryProjectRow | undefined;
}

export type StoryProjectSummary = {
  id: number;
  status: string;
  story_input: string;
  language: string;
  created_at: string;
  has_video: number;
};

/** Newest-first summary list, for a "Recent Projects" picker — lets the user jump
 * back into any in-flight or finished project without needing to know its id. */
export function listStoryProjects(limit = 20): StoryProjectSummary[] {
  const db = database();
  return db.prepare(
    "SELECT id, status, story_input, language, created_at, (output_path IS NOT NULL) AS has_video FROM story_projects ORDER BY id DESC LIMIT ?"
  ).all(limit) as StoryProjectSummary[];
}

export function updateStoryProject(id: number, fields: Partial<Omit<StoryProjectRow, "id" | "created_at" | "updated_at">>) {
  const db = database();
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => (fields as Record<string, unknown>)[key]) as (string | number | null)[];
  db.prepare(`UPDATE story_projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
}
