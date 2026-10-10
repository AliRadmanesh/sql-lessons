// Backups use VACUUM INTO, which is safe while the database is in use (spec §7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';
import { backupDb } from '../../../scripts/progress-db/backup.mjs';

test('backupDb writes a readable, migrated copy named by UTC time', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'progress-backup-'));
  try {
    const db = openDb(':memory:');
    migrate(db);
    db.prepare(`INSERT INTO lesson (id, slug, title, max_points) VALUES (1, 'a', 'A', 10)`).run();

    const file = backupDb(db, dir, new Date('2026-10-10T12:34:56Z'));

    assert.equal(path.basename(file), 'progress-20261010-123456.db');
    assert.ok(existsSync(file));
    const copy = new DatabaseSync(file);
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM lesson').get().n, 1);
    assert.equal(copy.prepare('PRAGMA user_version').get().user_version, 2);
    copy.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
