// Event application (plan Task 3, spec §4, §6). Every batch is all-or-nothing and idempotent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';
import { applyEvents, ValidationError } from '../../../scripts/progress-db/events.mjs';

// node:sqlite rows have a null prototype; copy them so deepStrictEqual compares plain values.
const plain = (row) => ({ ...row });
const one = (db, sql, ...args) => plain(db.prepare(sql).get(...args));
const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

function fresh() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

const lessonEv = () => ({
  type: 'lesson',
  lesson: {
    id: 1,
    slug: 'creating-and-populating',
    title: 'Creating and populating',
    items: [
      { code: 'cp1', kind: 'checkpoint', ordinal: 1, label: 'Keys', max: 10, concepts: ['primary-key'] },
      { code: 'lab1', kind: 'lab', ordinal: 2, label: 'Lab', max: 20 },
    ],
  },
});

const sessionEv = (overrides = {}) => ({
  type: 'session', uid: 's-1', lesson: 1,
  startedAt: '2026-10-10T10:00:00Z', lastSeenAt: '2026-10-10T10:05:00Z', activeSeconds: 300,
  ...overrides,
});

const attemptEv = (overrides = {}) => ({
  type: 'attempt', uid: 'a-1', sessionUid: 's-1', lesson: 1, item: 'cp1',
  submittedAt: '2026-10-10T10:01:00Z', score: 8, skipped: false,
  ...overrides,
});

const labRunEv = (overrides = {}) => ({
  type: 'labRun', sessionUid: 's-1', lesson: 1, item: 'lab1',
  ranAt: '2026-10-10T10:02:00Z', sql: 'SELECT 1', error: null,
  ...overrides,
});

const base = () => [lessonEv(), sessionEv()];

test('applying the same attempt twice stores one row and reports a duplicate', () => {
  const db = fresh();
  applyEvents(db, [...base(), attemptEv()]);
  const again = applyEvents(db, [attemptEv()]);
  assert.equal(again.duplicates, 1);
  assert.equal(again.applied, 0);
  assert.equal(count(db, 'attempt'), 1);
});

test('two different attempts on one item get attempt_no 1 and 2', () => {
  const db = fresh();
  applyEvents(db, [...base(), attemptEv({ uid: 'a-1', score: 4 }), attemptEv({ uid: 'a-2', score: 9 })]);
  const rows = db.prepare(`SELECT attempt_no, score FROM attempt ORDER BY attempt_no`).all().map(plain);
  assert.deepEqual(rows, [{ attempt_no: 1, score: 4 }, { attempt_no: 2, score: 9 }]);
});

test('an attempt for an unknown item throws ValidationError and nothing in the batch is applied', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [...base(), attemptEv({ item: 'nope' })]), ValidationError);
  assert.equal(count(db, 'lesson'), 0);
  assert.equal(count(db, 'session'), 0);
  assert.equal(count(db, 'attempt'), 0);
});

test('when the third event of a batch is invalid, the first two are rolled back too', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [lessonEv(), sessionEv(), attemptEv({ score: -1 })]), ValidationError);
  assert.equal(count(db, 'lesson'), 0);
  assert.equal(count(db, 'session'), 0);
});

test('sql longer than 20 000 characters is rejected', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [...base(), labRunEv({ sql: 'x'.repeat(20001) })]), ValidationError);
});

test('verdict longer than 2 000 characters is rejected', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [...base(), attemptEv({ verdict: 'x'.repeat(2001) })]), ValidationError);
});

test('score must be finite and between 0 and the item maximum', () => {
  for (const score of [Number.NaN, Infinity, -1, 11]) {
    const db = fresh();
    assert.throws(() => applyEvents(db, [...base(), attemptEv({ score })]), ValidationError, `score ${score}`);
  }
});

test('timestamps: milliseconds are dropped, other formats are rejected', () => {
  const db = fresh();
  applyEvents(db, [...base(), attemptEv({ submittedAt: '2026-10-10T10:01:00.123Z' })]);
  assert.equal(one(db, 'SELECT submitted_at FROM attempt').submitted_at, '2026-10-10T10:01:00Z');
  const other = fresh();
  assert.throws(() => applyEvents(other, [lessonEv(), sessionEv(), attemptEv({ submittedAt: '10/10/2026' })]), ValidationError);
});

test('events are applied in type order inside a batch, whatever order they arrive in', () => {
  const db = fresh();
  const result = applyEvents(db, [labRunEv(), attemptEv(), sessionEv(), lessonEv()]);
  assert.equal(result.applied, 4);
  assert.equal(count(db, 'lab_run'), 1);
  assert.equal(count(db, 'attempt'), 1);
});

test('a lab run for an unknown session is skipped without failing the batch', () => {
  const db = fresh();
  const result = applyEvents(db, [lessonEv(), labRunEv({ sessionUid: 'missing' })]);
  assert.equal(result.skipped, 1);
  assert.equal(count(db, 'lab_run'), 0);
  assert.equal(count(db, 'lesson'), 1);
});

test('checkpoint parts are stored with part_no from 1 and answers as JSON', () => {
  const db = fresh();
  applyEvents(db, [...base(), attemptEv({
    parts: [
      { score: 5, max: 5, answer: ['a', 'b'] },
      { score: 0, max: 5, answer: null },
    ],
  })]);
  const rows = db.prepare(`SELECT part_no, score, max_points, answer FROM attempt_part ORDER BY part_no`).all().map(plain);
  assert.deepEqual(rows, [
    { part_no: 1, score: 5, max_points: 5, answer: '["a","b"]' },
    { part_no: 2, score: 0, max_points: 5, answer: null },
  ]);
});

test('a re-sent session keeps the larger active_seconds and the latest last_seen_at', () => {
  const db = fresh();
  applyEvents(db, [...base()]);
  applyEvents(db, [sessionEv({ activeSeconds: 120, lastSeenAt: '2026-10-10T10:09:00Z' })]);
  const row = one(db, 'SELECT active_seconds, last_seen_at FROM session WHERE client_uid = ?', 's-1');
  assert.deepEqual(row, { active_seconds: 300, last_seen_at: '2026-10-10T10:09:00Z' });
});

test('a lesson event sets lesson.max_points to the sum of its item maximums', () => {
  const db = fresh();
  applyEvents(db, [lessonEv()]);
  assert.equal(one(db, 'SELECT max_points FROM lesson WHERE id = 1').max_points, 30);
});

test('an event with an unknown field is rejected', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [...base(), attemptEv({ surprise: true })]), ValidationError);
});

test('an event with an unknown type is rejected', () => {
  const db = fresh();
  assert.throws(() => applyEvents(db, [{ type: 'delete-everything' }]), ValidationError);
});
