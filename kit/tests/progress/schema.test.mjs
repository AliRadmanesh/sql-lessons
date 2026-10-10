// db/schema.sql is the teaching copy of the migrated schema. It must match a fresh dump,
// so adding a migration without regenerating it fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';
import { dumpSchema } from '../../../scripts/progress-db/dump-schema.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('dumpSchema lists every table, index and view of a migrated database', () => {
  const db = openDb(':memory:');
  migrate(db);
  const text = dumpSchema(db);
  for (const name of ['lesson', 'attempt', 'attempt_part', 'lab_run', 'attempt_item_history', 'v_review_queue']) {
    assert.ok(text.includes(name), `missing ${name}`);
  }
});

test('dumpSchema is deterministic', () => {
  const db = openDb(':memory:');
  migrate(db);
  assert.equal(dumpSchema(db), dumpSchema(db));
});

test('db/schema.sql matches a fresh dump of the migrated schema', () => {
  const db = openDb(':memory:');
  migrate(db);
  const committed = readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
  assert.equal(committed, dumpSchema(db), 'run: npm run progress:schema');
});
