// Validate and apply learning events in one transaction (spec §4, §6; plan Task 3).
//
// Event shapes (times are UTC 'YYYY-MM-DDTHH:MM:SSZ'; a '.mmm' part is dropped on input):
//   lesson:  { type:'lesson', lesson:{ id, slug, title, items:[{ code, kind, ordinal, label, max, concepts? }] } }
//   session: { type:'session', uid, lesson, startedAt, lastSeenAt, activeSeconds }
//   attempt: { type:'attempt', uid, sessionUid, lesson, item, submittedAt, score, skipped,
//              secondsSpent?, sql?, verdict?, parts?:[{ score, max, answer }], source? }
//   labRun:  { type:'labRun', sessionUid, lesson, item, ranAt, sql, error? }
//
// Rules:
//   * A batch is all-or-nothing: any invalid event rolls the whole batch back.
//   * Events are applied in type order (lesson, session, attempt, labRun), so a batch may arrive in any order.
//   * Sending the same attempt twice stores it once (idempotent by `uid`).
//   * attempt_no is computed here, never trusted from the client.
//   * A labRun whose session is unknown is skipped, not an error (spec §4.3).
//   * Strings are length-capped, scores must lie in 0..max, and unknown fields are rejected.
//   * SQL is always a prepared statement with bound parameters. The learner's SQL is data only.

export const MAX_EVENTS = 500;
const TYPE_ORDER = { lesson: 0, session: 1, attempt: 2, labRun: 3 };
const KEYS = {
  lesson: ['type', 'lesson'],
  session: ['type', 'uid', 'lesson', 'startedAt', 'lastSeenAt', 'activeSeconds'],
  attempt: ['type', 'uid', 'sessionUid', 'lesson', 'item', 'submittedAt', 'score', 'skipped', 'secondsSpent', 'sql', 'verdict', 'parts', 'source'],
  labRun: ['type', 'sessionUid', 'lesson', 'item', 'ranAt', 'sql', 'error'],
};
const LESSON_KEYS = ['id', 'slug', 'title', 'items'];
const ITEM_KEYS = ['code', 'kind', 'ordinal', 'label', 'max', 'concepts'];
const TIME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d{1,3})?Z$/;
const CODE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (message) => {
  throw new ValidationError(message);
};

function checkKeys(obj, allowed, where) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) fail(`${where} must be an object`);
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(`${where}: unknown field "${k}"`);
}

function str(v, where, max, min = 1) {
  if (typeof v !== 'string' || v.length < min || v.length > max) fail(`${where} must be a string of ${min}..${max} characters`);
  return v;
}

function optStr(v, where, max) {
  if (v === undefined || v === null) return null;
  return str(v, where, max, 0);
}

function int(v, where, min, max = 100_000_000) {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${where} must be an integer ${min}..${max}`);
  return v;
}

function num(v, where) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where} must be a finite number`);
  return v;
}

function time(v, where) {
  const m = typeof v === 'string' && TIME.exec(v);
  if (!m) fail(`${where} must be a UTC timestamp like 2026-10-10T10:00:00Z`);
  return `${m[1]}Z`;
}

function normalizeLesson(ev) {
  checkKeys(ev, KEYS.lesson, 'lesson event');
  const l = ev.lesson;
  checkKeys(l, LESSON_KEYS, 'lesson');
  if (!Array.isArray(l.items) || l.items.length < 1 || l.items.length > 100) fail('lesson.items must be an array of 1..100 items');
  const codes = new Set();
  const items = l.items.map((it, i) => {
    const where = `lesson.items[${i}]`;
    checkKeys(it, ITEM_KEYS, where);
    const code = str(it.code, `${where}.code`, 40);
    if (!CODE.test(code)) fail(`${where}.code has invalid characters`);
    if (codes.has(code)) fail(`lesson.items: duplicate code "${code}"`);
    codes.add(code);
    if (it.kind !== 'checkpoint' && it.kind !== 'lab') fail(`${where}.kind must be checkpoint or lab`);
    let concepts = [];
    if (it.concepts !== undefined) {
      if (!Array.isArray(it.concepts) || it.concepts.length > 20) fail(`${where}.concepts must be an array of at most 20 names`);
      concepts = it.concepts.map((c) => str(c, `${where}.concepts`, 40));
    }
    return {
      code,
      kind: it.kind,
      ordinal: int(it.ordinal, `${where}.ordinal`, 1, 1000),
      label: str(it.label, `${where}.label`, 200),
      max: int(it.max, `${where}.max`, 1, 10_000),
      concepts,
    };
  });
  return {
    type: 'lesson',
    id: int(l.id, 'lesson.id', 1, 10_000),
    slug: str(l.slug, 'lesson.slug', 100),
    title: str(l.title, 'lesson.title', 200),
    items,
    maxPoints: items.reduce((sum, it) => sum + it.max, 0),
  };
}

function normalizeSession(ev) {
  checkKeys(ev, KEYS.session, 'session event');
  const startedAt = time(ev.startedAt, 'session.startedAt');
  const lastSeenAt = time(ev.lastSeenAt, 'session.lastSeenAt');
  if (lastSeenAt < startedAt) fail('session.lastSeenAt is before startedAt');
  return {
    type: 'session',
    uid: str(ev.uid, 'session.uid', 64),
    lesson: int(ev.lesson, 'session.lesson', 1, 10_000),
    startedAt,
    lastSeenAt,
    activeSeconds: int(ev.activeSeconds, 'session.activeSeconds', 0),
  };
}

function normalizeAttempt(ev) {
  checkKeys(ev, KEYS.attempt, 'attempt event');
  const parts = [];
  if (ev.parts !== undefined) {
    if (!Array.isArray(ev.parts) || ev.parts.length > 50) fail('attempt.parts must be an array of at most 50 parts');
    for (const [i, p] of ev.parts.entries()) {
      const where = `attempt.parts[${i}]`;
      checkKeys(p, ['score', 'max', 'answer'], where);
      const max = num(p.max, `${where}.max`);
      if (max <= 0) fail(`${where}.max must be positive`);
      const score = num(p.score, `${where}.score`);
      if (score < 0 || score > max) fail(`${where}.score must be between 0 and ${max}`);
      const answer = p.answer === undefined || p.answer === null ? null : JSON.stringify(p.answer);
      if (answer === undefined) fail(`${where}.answer is not JSON`);
      if (answer !== null && answer.length > 20_000) fail(`${where}.answer is too long`);
      parts.push({ score, max, answer });
    }
  }
  if (ev.skipped !== undefined && typeof ev.skipped !== 'boolean') fail('attempt.skipped must be a boolean');
  if (ev.source !== undefined && ev.source !== 'live' && ev.source !== 'backfill') fail('attempt.source must be live or backfill');
  return {
    type: 'attempt',
    uid: str(ev.uid, 'attempt.uid', 64),
    sessionUid: str(ev.sessionUid, 'attempt.sessionUid', 64),
    lesson: int(ev.lesson, 'attempt.lesson', 1, 10_000),
    item: str(ev.item, 'attempt.item', 40),
    submittedAt: time(ev.submittedAt, 'attempt.submittedAt'),
    score: num(ev.score, 'attempt.score'),
    skipped: ev.skipped === true ? 1 : 0,
    secondsSpent: ev.secondsSpent === undefined || ev.secondsSpent === null ? null : int(ev.secondsSpent, 'attempt.secondsSpent', 0),
    sql: optStr(ev.sql, 'attempt.sql', 20_000),
    verdict: optStr(ev.verdict, 'attempt.verdict', 2_000),
    parts,
    source: ev.source ?? 'live',
  };
}

function normalizeLabRun(ev) {
  checkKeys(ev, KEYS.labRun, 'labRun event');
  return {
    type: 'labRun',
    sessionUid: str(ev.sessionUid, 'labRun.sessionUid', 64),
    lesson: int(ev.lesson, 'labRun.lesson', 1, 10_000),
    item: str(ev.item, 'labRun.item', 40),
    ranAt: time(ev.ranAt, 'labRun.ranAt'),
    sql: str(ev.sql, 'labRun.sql', 20_000, 0),
    error: optStr(ev.error, 'labRun.error', 2_000),
  };
}

const NORMALIZERS = { lesson: normalizeLesson, session: normalizeSession, attempt: normalizeAttempt, labRun: normalizeLabRun };

function normalize(ev) {
  if (ev === null || typeof ev !== 'object' || !(ev.type in NORMALIZERS)) fail('each event needs a known type');
  return NORMALIZERS[ev.type](ev);
}

// Statements are prepared once per batch. Every value is bound, never concatenated.
function prepareAll(db) {
  return {
    lessonUpsert: db.prepare(`INSERT INTO lesson (id, slug, title, max_points) VALUES (?, ?, ?, ?)
                              ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, max_points = excluded.max_points`),
    itemUpsert: db.prepare(`INSERT INTO item (lesson_id, code, kind, ordinal, label, max_points) VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(lesson_id, code) DO UPDATE SET kind = excluded.kind, ordinal = excluded.ordinal,
                              label = excluded.label, max_points = excluded.max_points
                            RETURNING id`),
    conceptUpsert: db.prepare(`INSERT INTO concept (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = excluded.name RETURNING id`),
    itemConceptClear: db.prepare(`DELETE FROM item_concept WHERE item_id = ?`),
    itemConceptAdd: db.prepare(`INSERT INTO item_concept (item_id, concept_id) VALUES (?, ?) ON CONFLICT DO NOTHING`),
    lessonExists: db.prepare(`SELECT id FROM lesson WHERE id = ?`),
    sessionByUid: db.prepare(`SELECT id FROM session WHERE client_uid = ?`),
    sessionUpsert: db.prepare(`INSERT INTO session (client_uid, lesson_id, started_at, last_seen_at, active_seconds) VALUES (?, ?, ?, ?, ?)
                               ON CONFLICT(client_uid) DO UPDATE SET
                                 active_seconds = MAX(session.active_seconds, excluded.active_seconds),
                                 last_seen_at = MAX(session.last_seen_at, excluded.last_seen_at)`),
    attemptByUid: db.prepare(`SELECT id FROM attempt WHERE client_uid = ?`),
    itemByCode: db.prepare(`SELECT i.id, i.max_points FROM item i WHERE i.lesson_id = ? AND i.code = ?`),
    nextAttemptNo: db.prepare(`SELECT COALESCE(MAX(attempt_no), 0) + 1 AS n FROM attempt WHERE item_id = ?`),
    attemptInsert: db.prepare(`INSERT INTO attempt (client_uid, session_id, item_id, attempt_no, submitted_at, score, max_points,
                                 skipped, seconds_spent, answer_sql, verdict, source)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    partInsert: db.prepare(`INSERT INTO attempt_part (attempt_id, part_no, score, max_points, answer) VALUES (?, ?, ?, ?, ?)`),
    labRunInsert: db.prepare(`INSERT INTO lab_run (session_id, item_id, ran_at, sql, error) VALUES (?, ?, ?, ?, ?)`),
  };
}

function applyLesson(s, ev) {
  s.lessonUpsert.run(ev.id, ev.slug, ev.title, ev.maxPoints);
  for (const it of ev.items) {
    const { id } = s.itemUpsert.get(ev.id, it.code, it.kind, it.ordinal, it.label, it.max);
    s.itemConceptClear.run(id);
    for (const name of it.concepts) {
      const { id: conceptId } = s.conceptUpsert.get(name);
      s.itemConceptAdd.run(id, conceptId);
    }
  }
  return 'applied';
}

function applySession(s, ev) {
  if (!s.lessonExists.get(ev.lesson)) fail(`unknown lesson ${ev.lesson}`);
  s.sessionUpsert.run(ev.uid, ev.lesson, ev.startedAt, ev.lastSeenAt, ev.activeSeconds);
  return 'applied';
}

function applyAttempt(s, ev) {
  if (s.attemptByUid.get(ev.uid)) return 'duplicate';
  const session = s.sessionByUid.get(ev.sessionUid);
  if (!session) fail(`unknown session ${ev.sessionUid}`);
  const item = s.itemByCode.get(ev.lesson, ev.item);
  if (!item) fail(`unknown item ${ev.lesson}/${ev.item}`);
  if (ev.score > item.max_points) fail(`attempt.score ${ev.score} is above the item maximum ${item.max_points}`);
  const { n: attemptNo } = s.nextAttemptNo.get(item.id);
  const { lastInsertRowid } = s.attemptInsert.run(ev.uid, session.id, item.id, attemptNo, ev.submittedAt, ev.score,
    item.max_points, ev.skipped, ev.secondsSpent, ev.sql, ev.verdict, ev.source);
  ev.parts.forEach((p, i) => s.partInsert.run(lastInsertRowid, i + 1, p.score, p.max, p.answer));
  return 'applied';
}

function applyLabRun(s, ev) {
  const session = s.sessionByUid.get(ev.sessionUid);
  if (!session) return 'skipped';
  const item = s.itemByCode.get(ev.lesson, ev.item);
  if (!item) fail(`unknown item ${ev.lesson}/${ev.item}`);
  s.labRunInsert.run(session.id, item.id, ev.ranAt, ev.sql, ev.error);
  return 'applied';
}

const APPLY = { lesson: applyLesson, session: applySession, attempt: applyAttempt, labRun: applyLabRun };

// Maps SQLite constraint failures to ValidationError, so the API can answer 400 instead of 500.
function asValidation(err) {
  if (err instanceof ValidationError) return err;
  if (/constraint failed|UNIQUE constraint|FOREIGN KEY/i.test(err.message)) return new ValidationError(err.message);
  return err;
}

/**
 * Applies a batch of events atomically.
 * @returns {{applied:number, duplicates:number, skipped:number}}
 * @throws {ValidationError} for any invalid event; nothing from the batch is stored.
 */
export function applyEvents(db, events) {
  if (!Array.isArray(events)) fail('body must be an array of events');
  if (events.length > MAX_EVENTS) fail(`at most ${MAX_EVENTS} events per batch`);
  const normalized = events.map(normalize);
  const ordered = normalized
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => TYPE_ORDER[a.ev.type] - TYPE_ORDER[b.ev.type] || a.i - b.i)
    .map((x) => x.ev);

  const s = prepareAll(db);
  const tally = { applied: 0, duplicates: 0, skipped: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const ev of ordered) {
      const outcome = APPLY[ev.type](s, ev);
      if (outcome === 'duplicate') tally.duplicates++;
      else if (outcome === 'skipped') tally.skipped++;
      else tally.applied++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw asValidation(err);
  }
  return tally;
}
