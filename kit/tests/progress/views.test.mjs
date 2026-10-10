// Views (spec §4.6) on a hand-computed fixture. Every expected value below was worked out by hand.
//
// Fixture: one lesson (max 40), three items (cp1 10pts, cp2 10pts, lab1 20pts), two sessions.
//   A1 cp1 #1  s1  4/10   60s
//   A2 cp1 #2  s2  7/10  120s   (better retake)
//   A3 cp2 #1  s1  6/10   30s   parts: 5/5 and 1/5 (failing part 2)
//   A4 lab1 #1 s2 12/20  200s
//   A5 lab1 #2 s2 20/20  150s   (perfect retake)
// lab_run: lab1 has 3 runs, two with an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';

// node:sqlite rows have a null prototype; copy them so deepStrictEqual compares plain values.
const plain = (row) => ({ ...row });

function fixture() {
  const db = openDb(':memory:');
  migrate(db);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  run(`INSERT INTO lesson (id, slug, title, max_points) VALUES (1, 'creating', 'Creating', 40)`);
  run(`INSERT INTO item (id, lesson_id, code, kind, ordinal, label, max_points) VALUES
        (1, 1, 'cp1', 'checkpoint', 1, 'Keys', 10),
        (2, 1, 'cp2', 'checkpoint', 2, 'FKs', 10),
        (3, 1, 'lab1', 'lab', 3, 'Lab', 20)`);
  run(`INSERT INTO concept (id, name) VALUES (1, 'primary-key'), (2, 'foreign-key'), (3, 'where-clause')`);
  run(`INSERT INTO item_concept (item_id, concept_id) VALUES (1, 1), (2, 1), (2, 2), (3, 3)`);
  run(`INSERT INTO session (id, client_uid, lesson_id, started_at, last_seen_at, active_seconds) VALUES
        (1, 's-1', 1, '2026-10-10T10:00:00Z', '2026-10-10T10:30:00Z', 300),
        (2, 's-2', 1, '2026-10-10T10:10:00Z', '2026-10-10T10:45:00Z', 600)`);
  const att = db.prepare(`INSERT INTO attempt (id, client_uid, session_id, item_id, attempt_no, submitted_at, score, max_points, skipped, seconds_spent, answer_sql, verdict)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
  att.run(1, 'a1', 1, 1, 1, '2026-10-10T10:01:00Z', 4, 10, 60, null, null);
  att.run(2, 'a2', 2, 1, 2, '2026-10-10T10:12:00Z', 7, 10, 120, null, null);
  att.run(3, 'a3', 1, 2, 1, '2026-10-10T10:20:00Z', 6, 10, 30, null, null);
  att.run(4, 'a4', 2, 3, 1, '2026-10-10T10:25:00Z', 12, 20, 200, 'SELECT * FROM x', 'wrong table');
  att.run(5, 'a5', 2, 3, 2, '2026-10-10T10:40:00Z', 20, 20, 150, 'SELECT 1', 'correct');
  const part = db.prepare(`INSERT INTO attempt_part (attempt_id, part_no, score, max_points, answer) VALUES (?, ?, ?, ?, ?)`);
  part.run(3, 1, 5, 5, '1');
  part.run(3, 2, 1, 5, '"x"');
  const lr = db.prepare(`INSERT INTO lab_run (session_id, item_id, ran_at, sql, error) VALUES (2, 3, ?, 'SELECT', ?)`);
  lr.run('2026-10-10T10:22:00Z', 'syntax error at or near "SELECT"');
  lr.run('2026-10-10T10:23:00Z', 'relation "x" does not exist');
  lr.run('2026-10-10T10:24:00Z', null);
  return db;
}

test('v_item_latest picks the highest attempt_no per item', () => {
  const db = fixture();
  const rows = db.prepare(`SELECT code, attempt_no, pct FROM v_item_latest ORDER BY code`).all().map(plain);
  assert.deepEqual(rows, [
    { code: 'cp1', attempt_no: 2, pct: 70 },
    { code: 'cp2', attempt_no: 1, pct: 60 },
    { code: 'lab1', attempt_no: 2, pct: 100 },
  ]);
});

test('v_lesson_summary sums active time and uses the latest score per item', () => {
  const db = fixture();
  const [row] = db.prepare(`SELECT lesson_id, sessions, active_seconds, first_studied, last_studied, total_score, total_pct FROM v_lesson_summary`).all().map(plain);
  assert.deepEqual(row, {
    lesson_id: 1,
    sessions: 2,
    active_seconds: 900,
    first_studied: '2026-10-10T10:00:00Z',
    last_studied: '2026-10-10T10:45:00Z',
    total_score: 33, // latest cp1 7 + cp2 6 + lab1 20 (not the older 4 or 12)
    total_pct: 82.5, // 33 of the lesson's 40
  });
});

test('v_item_weakness reports attempts, best/latest %, mistake rate, average time and errored runs', () => {
  const db = fixture();
  const rows = db.prepare(`SELECT code, attempts, latest_pct, best_pct, mistake_rate, avg_seconds, errored_runs FROM v_item_weakness ORDER BY code`).all().map(plain);
  assert.deepEqual(rows, [
    { code: 'cp1', attempts: 2, latest_pct: 70, best_pct: 70, mistake_rate: 1, avg_seconds: 90, errored_runs: 0 },
    { code: 'cp2', attempts: 1, latest_pct: 60, best_pct: 60, mistake_rate: 1, avg_seconds: 30, errored_runs: 0 },
    { code: 'lab1', attempts: 2, latest_pct: 100, best_pct: 100, mistake_rate: 0.5, avg_seconds: 175, errored_runs: 2 },
  ]);
});

test('v_part_mistakes lists only parts that lost points, with the answer given', () => {
  const db = fixture();
  const rows = db.prepare(`SELECT code, part_no, score, max_points, answer FROM v_part_mistakes`).all().map(plain);
  assert.deepEqual(rows, [{ code: 'cp2', part_no: 2, score: 1, max_points: 5, answer: '"x"' }]);
});

test('v_concept_weakness averages the % of every attempt on items tagged with the concept', () => {
  const db = fixture();
  const rows = db.prepare(`SELECT name, items, attempts, avg_pct FROM v_concept_weakness ORDER BY name`).all().map(plain);
  assert.deepEqual(rows, [
    { name: 'foreign-key', items: 1, attempts: 1, avg_pct: 60 },
    { name: 'primary-key', items: 2, attempts: 3, avg_pct: 56.7 }, // (40 + 70 + 60) / 3 = 56.67, rounded in the view
    { name: 'where-clause', items: 1, attempts: 2, avg_pct: 80 },
  ]);
});

test('v_review_queue holds items whose latest % is under 80, worst first', () => {
  const db = fixture();
  const rows = db.prepare(`SELECT code, latest_pct, submitted_at FROM v_review_queue ORDER BY latest_pct`).all().map(plain);
  assert.deepEqual(rows, [
    { code: 'cp2', latest_pct: 60, submitted_at: '2026-10-10T10:20:00Z' },
    { code: 'cp1', latest_pct: 70, submitted_at: '2026-10-10T10:12:00Z' },
  ]);
});

test('v_review_queue excludes items at or above 80%', () => {
  const db = fixture();
  const codes = db.prepare(`SELECT code FROM v_review_queue`).all().map(plain).map((r) => r.code);
  assert.ok(!codes.includes('lab1'));
});
