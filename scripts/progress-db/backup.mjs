// Copies the progress database to data/backups/ while it is in use (npm run progress:backup).
// VACUUM INTO writes a consistent, compacted copy; it is built into SQLite, so no extra tools are needed.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, migrate, DEFAULT_DB_PATH } from './db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(here, '../../data/backups');

/** @returns {string} the path of the new copy, named progress-YYYYMMDD-HHMMSS.db (UTC). */
export function backupDb(db, dir = BACKUP_DIR, now = new Date()) {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const file = path.join(dir, `progress-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDb(DEFAULT_DB_PATH);
  migrate(db);
  console.log(`backup written: ${backupDb(db)}`);
  db.close();
}
