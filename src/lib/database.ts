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
}

export function database() {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  instance = new DatabaseSync(config.databasePath);
  instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(instance);
  return instance;
}
