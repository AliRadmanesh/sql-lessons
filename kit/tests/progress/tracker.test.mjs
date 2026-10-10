// Browser tracker (kit/kit.progress.js) against a fake browser: storage, fetch, clock and visibility.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTracker } = require('../../kit.progress.js');

const OUTBOX = 'sql-progress-outbox:v1';

function fakeEnv({ storageBroken = false } = {}) {
  const store = new Map();
  let n = 0;
  const env = {
    t: Date.parse('2026-10-10T10:00:00Z'),
    visible: true,
    offline: false,
    status: 200,
    sent: [],
    warnings: [],
    store,
    now: () => env.t,
    isVisible: () => env.visible,
    storage: storageBroken
      ? { getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('storage denied'); } }
      : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    fetch: (url, init) => {
      env.sent.push({ url, events: JSON.parse(init.body) });
      if (env.offline) return Promise.reject(new TypeError('Failed to fetch'));
      const reply = () => ({ ok: env.status >= 200 && env.status < 300, status: env.status });
      return env.hold ? env.hold.then(reply) : Promise.resolve(reply());
    },
    apiUrl: 'http://localhost:8080/api/events',
    uuid: () => `u-${++n}`,
    listen: () => {},
    setInterval: () => {},
    warn: (m) => env.warnings.push(m),
  };
  return env;
}

const outbox = (env) => JSON.parse(env.store.get(OUTBOX) || '[]');
const sentEvents = (env) => env.sent.flatMap((s) => s.events);

const LESSON = {
  id: '01',
  chapter: 1,
  title: 'Lesson 01 · A Little Background',
  items: { cp1: { max: 10, label: 'Pre-relational models' }, lab1: { max: 15, label: 'Lab 1' } },
};

function ticks(api, env, n) {
  for (let i = 0; i < n; i++) {
    env.t += 1000;
    api._tick();
  }
}

test('events survive an offline send and drain on the next successful send', async () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  await api.flush();
  assert.equal(outbox(env).length, 1, 'the lesson event waits in the outbox');

  api.attempt({ item: 'cp1', score: 8, parts: [{ score: 8, max: 10, answer: ['a'] }] });
  await api.flush();
  assert.equal(outbox(env).length, 2);

  env.offline = false;
  await api.flush();
  assert.deepEqual(outbox(env), []);
  const lastBatch = env.sent.at(-1).events;
  assert.deepEqual(lastBatch.map((e) => e.type), ['lesson', 'attempt'], 'the final send carries everything still waiting');
});

test('an event queued while a send is in flight is sent when that send finishes', async () => {
  const env = fakeEnv();
  let release;
  env.hold = new Promise((r) => { release = r; });
  const api = createTracker(env);
  api.init(LESSON); // the lesson event goes out, and the send stays in flight
  api.attempt({ item: 'cp1', score: 8 }); // queued during that send
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(outbox(env), [], 'nothing is left waiting for the next trigger');
  assert.ok(sentEvents(env).some((e) => e.type === 'attempt'));
});

test('heartbeats replace one another, so one session event stays pending', async () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  ticks(api, env, 45);
  const sessions = outbox(env).filter((e) => e.type === 'session');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].activeSeconds, 45);
});

test('time with no input for over a minute is not counted', () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  // Input happened at init. Seconds 1..59 are inside the one-minute window; the rest are not.
  ticks(api, env, 300);
  const [session] = outbox(env).filter((e) => e.type === 'session');
  assert.equal(session.activeSeconds, 59);
});

test('time while the tab is hidden is not counted', () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  env.visible = false;
  ticks(api, env, 30);
  const [session] = outbox(env).filter((e) => e.type === 'session');
  assert.equal(session.activeSeconds, 0);
});

test('a 400 response drops the batch and warns once', async () => {
  const env = fakeEnv();
  env.status = 400;
  const api = createTracker(env);
  api.init(LESSON);
  await api.flush();
  assert.deepEqual(outbox(env), [], 'the rejected batch is not kept');
  api.attempt({ item: 'cp1', score: 8 });
  await api.flush();
  assert.deepEqual(outbox(env), []);
  assert.equal(env.warnings.length, 1);
});

test('saved results are backfilled once, with stable uids', async () => {
  const env = fakeEnv();
  env.store.set('sql-lesson-01:v1', JSON.stringify({
    res: { cp1: { score: 8, ans: [null] }, lab1: { score: 12, sql: 'SELECT 1' }, cp9: { score: 1 } },
  }));
  const first = createTracker(env);
  first.init(LESSON);
  await first.flush();
  const backfilled = sentEvents(env).filter((e) => e.type === 'attempt');
  assert.deepEqual(backfilled.map((e) => e.uid), ['backfill-1-cp1', 'backfill-1-lab1'], 'cp9 is not in the lesson');
  assert.ok(backfilled.every((e) => e.source === 'backfill'));
  assert.equal(env.store.get('sql-progress-backfilled:01'), '1');

  const second = createTracker(env);
  second.init(LESSON);
  await second.flush();
  assert.equal(sentEvents(env).filter((e) => e.type === 'attempt').length, 2, 'a second page load sends nothing more');
});

test('attempts record seconds on the current slide and the session they belong to', async () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  api.slide('cp1');
  ticks(api, env, 30);
  api.attempt({ item: 'cp1', score: 8, verdict: 'close', parts: [{ score: 8, max: 10, answer: ['a'] }] });
  const session = outbox(env).find((e) => e.type === 'session');
  const attempt = outbox(env).find((e) => e.type === 'attempt');
  assert.equal(attempt.sessionUid, session.uid);
  assert.equal(attempt.secondsSpent, 30);
  assert.equal(attempt.source, 'live');
  assert.equal(attempt.verdict, 'close');
});

test('a lab run records the database error text, or null when it ran', () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  api.labRun({ item: 'lab1', sql: 'SELECT x', error: 'relation "x" does not exist' });
  api.labRun({ item: 'lab1', sql: 'SELECT 1', error: null });
  const runs = outbox(env).filter((e) => e.type === 'labRun');
  assert.deepEqual(runs.map((r) => r.error), ['relation "x" does not exist', null]);
});

test('the lesson event maps item codes to kinds and ordinals', () => {
  const env = fakeEnv();
  env.offline = true;
  const api = createTracker(env);
  api.init(LESSON);
  const [lesson] = outbox(env);
  assert.equal(lesson.type, 'lesson');
  assert.equal(lesson.lesson.id, 1);
  assert.equal(lesson.lesson.slug, 'lesson-01-a-little-background');
  assert.deepEqual(lesson.lesson.items, [
    { code: 'cp1', kind: 'checkpoint', ordinal: 1, label: 'Pre-relational models', max: 10 },
    { code: 'lab1', kind: 'lab', ordinal: 1, label: 'Lab 1', max: 15 },
  ]);
});

test('a storage that throws does not break the tracker or the send', async () => {
  const env = fakeEnv({ storageBroken: true });
  const api = createTracker(env);
  assert.doesNotThrow(() => {
    api.init(LESSON);
    api.slide('cp1');
    api.attempt({ item: 'cp1', score: 8 });
    api.labRun({ item: 'lab1', sql: 'SELECT 1', error: null });
    ticks(api, env, 20);
  });
  await api.flush();
  assert.ok(sentEvents(env).some((e) => e.type === 'attempt'), 'the event still goes out');
});
