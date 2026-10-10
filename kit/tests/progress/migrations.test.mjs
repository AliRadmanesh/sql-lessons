// Migration runner and schema constraints (spec §4). Runs on an in-memory SQLite DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '../../../db/migrations');
const highestVersion = Math.max(
  ...readdirSync(migrationsDir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => Number(f.slice(0, 3))),
);

const TABLES = ['lesson', 'item', 'concept', 'item_concept', 'session', 'attempt', 'attempt_part', 'lab_run', 'schema_migration'];

function fresh() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

// Minimal valid reference rows; each test overrides only the field it is probing.
function seed(db) {
  db.prepare(`INSERT INTO lesson (id, slug, title, max_points) VALUES (1, 'creating-and-populating', 'Creating', 100)`).run();
  db.prepare(`INSERT INTO item (id, lesson_id, code, kind, ordinal, label, max_points) VALUES (1, 1, 'cp1', 'checkpoint', 1, 'Keys', 10)`).run();
  db.prepare(`INSERT INTO concept (id, name) VALUES (1, 'primary-key')`).run();
  db.prepare(`INSERT INTO item_concept (item_id, concept_id) VALUES (1, 1)`).run();
  db.prepare(`INSERT INTO session (id, client_uid, lesson_id, started_at, last_seen_at, active_seconds) VALUES (1, 's-1', 1, '2026-10-10T10:00:00Z', '2026-10-10T10:05:00Z', 300)`).run();
}

function insertAttempt(db, overrides = {}) {
  const row = {
    id: 1, client_uid: 'a-1', session_id: 1, item_id: 1, attempt_no: 1,
    submitted_at: '2026-10-10T10:01:00Z', score: 8, max_points: 10, skipped: 0,
    ...overrides,
  };
  db.prepare(`INSERT INTO attempt (id, client_uid, session_id, item_id, attempt_no, submitted_at, score, max_points, skipped)
              VALUES (:id, :client_uid, :session_id, :item_id, :attempt_no, :submitted_at, :score, :max_points, :skipped)`).run(row);
}

test('migrating an empty database creates every table', () => {
  const db = fresh();
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  for (const t of TABLES) assert.ok(names.includes(t), `missing table ${t}`);
});

test('user_version equals the highest migration number', () => {
  const db = fresh();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, highestVersion);
});

test('re-running migrate is a no-op', () => {
  const db = fresh();
  const before = db.prepare('SELECT COUNT(*) AS n FROM schema_migration').get().n;
  migrate(db);
  const after = db.prepare('SELECT COUNT(*) AS n FROM schema_migration').get().n;
  assert.equal(after, before);
  assert.equal(after, highestVersion);
});

test('foreign keys are enforced on the connection', () => {
  const db = fresh();
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('every table is STRICT', () => {
  const db = fresh();
  const tables = db.prepare('PRAGMA table_list').all().filter((t) => t.schema === 'main' && t.type === 'table' && !t.name.startsWith('sqlite_'));
  for (const t of TABLES) {
    const row = tables.find((r) => r.name === t);
    assert.ok(row, `table_list lacks ${t}`);
    assert.equal(row.strict, 1, `${t} is not STRICT`);
  }
});

test('attempt rejects score above max_points', () => {
  const db = fresh();
  seed(db);
  assert.throws(() => insertAttempt(db, { score: 11, max_points: 10 }));
});

test('item rejects an unknown kind', () => {
  const db = fresh();
  seed(db);
  assert.throws(() => db.prepare(`INSERT INTO item (lesson_id, code, kind, ordinal, label, max_points) VALUES (1, 'q1', 'quiz', 2, 'x', 5)`).run());
});

test('attempt rejects a missing item', () => {
  const db = fresh();
  seed(db);
  assert.throws(() => insertAttempt(db, { item_id: 999 }));
});

test('attempt rejects a duplicate (item_id, attempt_no)', () => {
  const db = fresh();
  seed(db);
  insertAttempt(db);
  assert.throws(() => insertAttempt(db, { id: 2, client_uid: 'a-2', attempt_no: 1 }));
});

test('attempt_part rejects an answer that is not JSON', () => {
  const db = fresh();
  seed(db);
  insertAttempt(db);
  assert.throws(() => db.prepare(`INSERT INTO attempt_part (attempt_id, part_no, score, max_points, answer) VALUES (1, 1, 1, 1, 'not json')`).run());
});

test('session rejects last_seen_at before started_at', () => {
  const db = fresh();
  seed(db);
  assert.throws(() => db.prepare(`INSERT INTO session (client_uid, lesson_id, started_at, last_seen_at) VALUES ('s-2', 1, '2026-10-10T10:00:00Z', '2026-10-10T09:00:00Z')`).run());
});

test('deleting an item cascades to its item_concept rows', () => {
  const db = fresh();
  seed(db);
  db.prepare('DELETE FROM item WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM item_concept').get().n, 0);
});
