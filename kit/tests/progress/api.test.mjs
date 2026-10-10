// HTTP endpoint POST /api/events (plan Task 4, spec §6 and §8).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb, migrate } from '../../../scripts/progress-db/db.mjs';
import { handleApi } from '../../../scripts/progress-db/api.mjs';

let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  migrate(db);
  server = http.createServer((req, res) => {
    if (!handleApi(req, res, db)) {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const lessonEv = {
  type: 'lesson',
  lesson: { id: 1, slug: 'creating', title: 'Creating', items: [{ code: 'cp1', kind: 'checkpoint', ordinal: 1, label: 'Keys', max: 10 }] },
};
const sessionEv = { type: 'session', uid: 's-1', lesson: 1, startedAt: '2026-10-10T10:00:00Z', lastSeenAt: '2026-10-10T10:05:00Z', activeSeconds: 300 };
const attemptEv = { type: 'attempt', uid: 'a-1', sessionUid: 's-1', lesson: 1, item: 'cp1', submittedAt: '2026-10-10T10:01:00Z', score: 8, skipped: false };

const post = (body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${base}/api/events`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('a valid batch returns 200 with counts and stores the rows', async () => {
  const res = await post([lessonEv, sessionEv, attemptEv]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.equal(body.applied, 3);
  assert.equal(body.duplicates, 0);
  assert.equal(count('attempt'), 1);
});

test('invalid JSON returns 400', async () => {
  const res = await post('{not json');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /JSON/);
});

test('a validation failure returns 400 with the message and stores nothing', async () => {
  const before = { lessons: count('lesson'), attempts: count('attempt') };
  const res = await post([{ ...lessonEv, lesson: { ...lessonEv.lesson, id: 2, slug: 'other' } }, { ...attemptEv, uid: 'a-9', item: 'nope' }]);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /unknown item/);
  assert.equal(count('lesson'), before.lessons);
  assert.equal(count('attempt'), before.attempts);
});

test('a body over 256 KB returns 413', async () => {
  const huge = JSON.stringify([{ type: 'labRun', sessionUid: 's-1', lesson: 1, item: 'cp1', ranAt: '2026-10-10T10:00:00Z', sql: 'x'.repeat(300_000), error: null }]);
  const res = await post(huge);
  assert.equal(res.status, 413);
});

test('an OPTIONS preflight returns 204 with CORS headers', async () => {
  const res = await fetch(`${base}/api/events`, { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
});

test('GET /api/events returns 405', async () => {
  const res = await fetch(`${base}/api/events`);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
});

test('a body that is not application/json returns 415', async () => {
  const res = await post([lessonEv], { 'content-type': 'text/plain' });
  assert.equal(res.status, 415);
});

test('paths outside /api are not handled', () => {
  const req = { url: '/lesson-01.html', method: 'GET', headers: {} };
  assert.equal(handleApi(req, {}, db), false);
});
