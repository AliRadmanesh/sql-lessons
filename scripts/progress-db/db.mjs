// Open the progress database and apply numbered migrations (spec §4.4, §7).
// Uses node:sqlite (built in since Node 22.5), so there is no npm dependency.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(here, '../../db/migrations');
export const DEFAULT_DB_PATH = path.join(here, '../../data/progress.db');

export function openDb(file = DEFAULT_DB_PATH) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // These are per-connection settings; SQLite defaults them off.
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

// Housekeeping table, created by the runner so the first migration does not have to.
const HOUSEKEEPING = `
CREATE TABLE IF NOT EXISTS schema_migration (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;`;

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), name: f.slice(4, -4), file: path.join(MIGRATIONS_DIR, f) }));
}

// Applies every migration not yet in schema_migration, one transaction each.
export function migrate(db) {
  db.exec(HOUSEKEEPING);
  const done = new Set(db.prepare('SELECT version FROM schema_migration').all().map((r) => r.version));
  for (const m of listMigrations()) {
    if (done.has(m.version)) continue;
    const sql = readFileSync(m.file, 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare(`INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`).run(m.version, m.name);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${m.version}_${m.name} failed: ${err.message}`);
    }
  }
}
