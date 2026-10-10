/* Progress tracker: writes lesson activity to the local progress database (docs: KIT-README §progress).
   Generic: it reads only LESSON.id / chapter / title / items and the lesson's own saved state. Nothing here may
   break a lesson. Every entry point is wrapped in try/catch, and an unreachable server only means events wait in
   the outbox (localStorage) until the next successful send. */
(function (root) {
  'use strict';
  var OUTBOX = 'sql-progress-outbox:v1', OUTBOX_CAP = 500, BATCH_BYTES = 200000, BATCH_MAX = 200;
  var TICK_MS = 1000, HEARTBEAT_TICKS = 15, IDLE_MS = 60000, SESSION_GAP_MS = 30 * 60000, MAX_ELAPSED_MS = 5000;
  var SQL_MAX = 20000, VERDICT_MAX = 2000;

  function createTracker(env) {
    var api = {}, L = null, lessonId = 0, outbox = [], flushing = null, again = false, warned = false;
    var sessionUid = null, sessionStart = 0, activeMs = 0, lastInput = 0, lastTick = 0, ticks = 0;
    var itemCode = null, itemMs = 0;

    function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
    function iso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
    function cap(s, n) { return typeof s === 'string' ? s.slice(0, n) : undefined; }

    function saveOutbox() { safe(function () { env.storage.setItem(OUTBOX, JSON.stringify(outbox)); }); }
    function loadOutbox() {
      var arr = safe(function () { return JSON.parse(env.storage.getItem(OUTBOX) || '[]'); });
      outbox = Array.isArray(arr) ? arr : [];
    }
    function push(ev) {
      outbox.push(ev);
      if (outbox.length > OUTBOX_CAP) outbox.splice(0, outbox.length - OUTBOX_CAP);
      saveOutbox();
    }
    // Keeps one pending event per key: a heartbeat or a re-sent lesson replaces the waiting copy in place.
    function pushOrReplace(ev, same) {
      var i = outbox.findIndex(same);
      if (i < 0) push(ev); else { outbox[i] = ev; saveOutbox(); }
    }

    // Sends queued events in batches, oldest first. Only a 2xx removes events; a 400 is a poison batch
    // (the server will never accept it), so it is dropped with one warning. Anything else waits for the next try.
    function flush() {
      // A send is already running: remember that more events arrived, and send them when it finishes.
      if (flushing) { again = true; return flushing; }
      if (!outbox.length || !env.fetch) return Promise.resolve();
      var batch = [], bytes = 0;
      for (var i = 0; i < outbox.length && batch.length < BATCH_MAX; i++) {
        var size = JSON.stringify(outbox[i]).length;
        if (batch.length && bytes + size > BATCH_BYTES) break;
        batch.push(outbox[i]); bytes += size;
      }
      var drop = function () { outbox = outbox.filter(function (e) { return batch.indexOf(e) < 0; }); saveOutbox(); };
      flushing = safe(function () {
        return env.fetch(env.apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch), keepalive: true })
          .then(function (res) {
            if (res.ok) return drop();
            if (res.status === 400) {
              drop();
              if (!warned) { warned = true; safe(function () { env.warn('progress: the server rejected a batch (400); those events were dropped'); }); }
            }
          }, function () { /* offline or server down: keep the events */ })
          .then(function () {
            flushing = null;
            if (again) { again = false; flush(); }
          });
      });
      return flushing || Promise.resolve();
    }

    function startSession(now) {
      sessionUid = env.uuid();
      sessionStart = now;
      activeMs = 0;
    }

    function heartbeat(now) {
      if (!sessionUid) return;
      var ev = {
        type: 'session', uid: sessionUid, lesson: lessonId,
        startedAt: iso(sessionStart), lastSeenAt: iso(Math.max(now, sessionStart)),
        activeSeconds: Math.round(activeMs / 1000)
      };
      pushOrReplace(ev, function (e) { return e.type === 'session' && e.uid === sessionUid; });
      flush();
    }

    // A second of active time counts only while the tab is visible and the last input was under a minute ago.
    function tick() {
      safe(function () {
        var now = env.now();
        var elapsed = lastTick ? Math.min(now - lastTick, MAX_ELAPSED_MS) : 0;
        lastTick = now;
        if (sessionUid && env.isVisible() && now - lastInput < IDLE_MS && elapsed > 0) {
          activeMs += elapsed;
          if (itemCode) itemMs += elapsed;
        }
        if (++ticks % HEARTBEAT_TICKS === 0) heartbeat(now);
      });
    }

    function onInput() {
      safe(function () {
        var now = env.now();
        if (sessionUid && now - lastInput > SESSION_GAP_MS) startSession(now);
        lastInput = now;
      });
    }

    function onHide() {
      safe(function () { heartbeat(env.now()); });
    }

    function lessonEvent(LESSON) {
      var items = Object.keys(LESSON.items || {}).reduce(function (acc, code) {
        var m = /^(cp|lab)(\d+)$/.exec(code), it = LESSON.items[code];
        if (!m) return acc;
        var out = { code: code, kind: m[1] === 'cp' ? 'checkpoint' : 'lab', ordinal: +m[2], label: String(it.label || code), max: it.max };
        if (Array.isArray(it.concepts) && it.concepts.length) out.concepts = it.concepts;
        acc.push(out);
        return acc;
      }, []);
      var slug = LESSON.slug || String(LESSON.title || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return { type: 'lesson', lesson: { id: lessonId, slug: slug, title: String(LESSON.title || slug), items: items } };
    }

    // Results saved before tracking existed. Deterministic uids make a repeat send a no-op on the server.
    function backfill() {
      var flagKey = 'sql-progress-backfilled:' + L.id;
      if (safe(function () { return env.storage.getItem(flagKey); })) return;
      var saved = safe(function () { return JSON.parse(env.storage.getItem('sql-lesson-' + L.id + ':v1') || 'null'); });
      var res = saved && saved.res && typeof saved.res === 'object' ? saved.res : {};
      var n = 0;
      Object.keys(res).forEach(function (code) {
        var r = res[code];
        if (!L.items || !L.items[code] || !r || !isFinite(r.score)) return;
        var ev = { type: 'attempt', uid: 'backfill-' + lessonId + '-' + code, sessionUid: sessionUid, lesson: lessonId, item: code,
          submittedAt: iso(env.now()), score: r.score, skipped: !!r.skipped, source: 'backfill' };
        if (typeof r.sql === 'string') ev.sql = cap(r.sql, SQL_MAX);
        pushOrReplace(ev, function (e) { return e.uid === ev.uid; });
        n++;
      });
      if (n) safe(function () { env.storage.setItem(flagKey, '1'); });
    }

    api.init = function (LESSON) {
      safe(function () {
        L = LESSON;
        lessonId = LESSON.chapter || parseInt(LESSON.id, 10);
        loadOutbox();
        var now = env.now();
        startSession(now);
        lastInput = now;
        lastTick = now;
        pushOrReplace(lessonEvent(LESSON), function (e) { return e.type === 'lesson'; });
        backfill();
        flush();
        env.listen(root, 'pointerdown', onInput, true);
        env.listen(root, 'keydown', onInput, true);
        env.listen(root, 'pointermove', onInput, true);
        env.listen(root, 'scroll', onInput, true);
        env.listen(root, 'wheel', onInput, true);
        env.listen(root.document, 'visibilitychange', function () { if (!env.isVisible()) onHide(); });
        env.listen(root, 'pagehide', onHide, false);
        env.setInterval(tick, TICK_MS);
      });
    };

    // The lesson calls this when a slide changes. The current item's clock restarts.
    api.slide = function (code) { safe(function () { itemCode = code || null; itemMs = 0; }); };

    // One graded submit or skip. parts: [{score, max, answer}] for checkpoints.
    api.attempt = function (o) {
      safe(function () {
        if (!sessionUid) return;
        var ev = { type: 'attempt', uid: env.uuid(), sessionUid: sessionUid, lesson: lessonId, item: o.item,
          submittedAt: iso(env.now()), score: o.score, skipped: !!o.skipped, secondsSpent: Math.round(itemMs / 1000), source: 'live' };
        if (typeof o.sql === 'string') ev.sql = cap(o.sql, SQL_MAX);
        if (typeof o.verdict === 'string') ev.verdict = cap(o.verdict, VERDICT_MAX);
        if (Array.isArray(o.parts)) ev.parts = o.parts.map(function (p) { return { score: p.score, max: p.max, answer: p.answer === undefined ? null : p.answer }; });
        push(ev);
        flush();
      });
    };

    // One Run click on a lab, graded or not. error is the database's message, or null when it ran.
    api.labRun = function (o) {
      safe(function () {
        if (!sessionUid) return;
        push({ type: 'labRun', sessionUid: sessionUid, lesson: lessonId, item: o.item, ranAt: iso(env.now()),
          sql: cap(o.sql || '', SQL_MAX), error: o.error ? cap(String(o.error), VERDICT_MAX) : null });
        flush();
      });
    };

    api.flush = flush;
    api._tick = tick;
    return api;
  }

  function browserEnv() {
    var loc = root.location || {};
    var store = safe(function () { return root.localStorage; });
    return {
      now: function () { return Date.now(); },
      isVisible: function () { return root.document.visibilityState === 'visible'; },
      storage: store,
      fetch: typeof root.fetch === 'function' ? root.fetch.bind(root) : null,
      apiUrl: (loc.protocol === 'http:' ? '' : 'http://localhost:8080') + '/api/events',
      uuid: function () {
        if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
      },
      listen: function (target, type, fn, capture) { target.addEventListener(type, fn, { passive: true, capture: !!capture }); },
      setInterval: function (fn, ms) { return root.setInterval(fn, ms); },
      warn: function (m) { console.warn(m); }
    };
  }

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createTracker: createTracker };
  if (typeof root.document !== 'undefined') root.Progress = createTracker(browserEnv());
})(typeof window !== 'undefined' ? window : globalThis);
