/* =====================================================================
   SQL LESSON KIT · core.js
   Shared runtime for every lesson: utils, highlighting, state/scoring, deck
   navigation + gating, table rendering, checkpoint parts, SQL editor, playground,
   labs + graders, results slide, boot().
   Requires (loaded before this file): the lesson's config (const LESSON = {...}) and either
   kit.pg.js (PGDRV, the default engine) or kit.engine.js (MiniSQL, LESSON.engine 'minisql').
   See KIT-README.md for the full contract.
   ===================================================================== */
/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= syntax highlighting ================= */
const SQL_KW = new Set(('select from where and or not insert into values update set delete create table drop inner left right outer cross join on as order by asc desc limit offset distinct null is in like between primary key foreign references constraint commit rollback group having show tables describe begin start if exists returning ilike begin commit rollback type enum cast true false default check generated always identity references primary key foreign unique').split(' '));
const SQL_TY = new Set('smallint int integer varchar char decimal date unsigned auto_increment default bigint tinyint serial bigserial smallserial text boolean bool numeric timestamp timestamptz real double precision jsonb json uuid'.split(' '));
function hlSQL(src) {
  const re = /(\/\*[\s\S]*?(?:\*\/|$)|--[^\n]*|#[^\n]*)|('(?:[^'\\]|''|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|(____)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let out = '', m, prev = '';
  while ((m = re.exec(src))) {
    if (m[1]) out += `<span class="c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="n">${m[3]}</span>`;
    else if (m[4]) out += `<span class="blank">____</span>`;
    else if (m[5]) {
      const w = m[5], lc = w.toLowerCase();
      const isFn = src[re.lastIndex] === '(' && !SQL_KW.has(lc) && !SQL_TY.has(lc);
      if (SQL_KW.has(lc) || (lc === 'transaction' && prev === 'start')) out += `<span class="k">${w}</span>`;
      else if (SQL_TY.has(lc) || isFn) out += `<span class="f">${w}</span>`;
      else out += esc(w);
      prev = lc;
    } else out += esc(m[6]);
  }
  return out;
}
function hlJS(src) {
  const re = /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*')|(\b(?:const|let|for|of|if|return|function|new)\b)|(\b\d+\b)|([\s\S])/g;
  let out = '', m;
  while ((m = re.exec(src))) {
    if (m[1]) out += `<span class="c">${esc(m[1])}</span>`; else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="k">${m[3]}</span>`; else if (m[4]) out += `<span class="n">${m[4]}</span>`; else out += esc(m[5]);
  }
  return out;
}
$$('pre[data-sql]').forEach((p) => { p.innerHTML = hlSQL(p.textContent); });
$$('pre[data-js]').forEach((p) => { p.innerHTML = hlJS(p.textContent); });

/* ================= database =================
   Two interchangeable drivers behind one async interface (see kit.pg.js for the contract):
     LESSON.engine 'pglite' (default) -> PGDRV, real PostgreSQL in WASM
     LESSON.engine 'minisql'          -> the legacy in-file simulator (Lesson 01 only)
   BASE is schema metadata ({tables}) used by renderTable, the schema panel and column checkpoints. */
const SEED = LESSON.seed;
const DIALECT = LESSON.dialect || 'mysql';            // 'postgres' from Lesson 02 on; Lesson 01 is 'mysql'
const ENGINE = LESSON.engine || 'pglite';
const MINIDRV = {
  async init() { return MiniSQL.create(SEED, { dialect: DIALECT }); },
  async create(setup) {
    const d = MiniSQL.create(SEED, { dialect: DIALECT }); if (setup) d.exec(setup);
    return { raw: d, close: async () => {}, exec: async (sql) => { try { return d.exec(sql); } catch (e) { e.results = []; throw e; } } };
  },
};
const DRIVER = ENGINE === 'minisql' ? MINIDRV : PGDRV;
const newDB = (setup) => DRIVER.create(setup);          // async: resolves to a fresh, seeded {exec(sql), close()}
let BASE = null;
const T = (name) => BASE.tables[name];

/* Database work runs one task at a time: each PGlite instance is a full WASM Postgres, so labs queue instead of piling up. */
let dbChain = Promise.resolve();
const serial = (fn) => { const p = dbChain.then(fn); dbChain = p.catch(() => {}); return p; };

/* Value formatting and result comparison live here, independent of the engine. */
const round9 = (n) => Math.round(n * 1e9) / 1e9;
function fmt(v, col) {
  if (v == null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return col && col.scale != null ? v.toFixed(col.scale) : String(round9(v));
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return `{${v.map((x) => (x == null ? 'NULL' : fmt(x))).join(',')}}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const numLike = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
function canon(v) {
  if (v == null) return '\u2205';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  if (numLike(v)) return Number(v).toFixed(4);
  return DIALECT === 'postgres' ? String(v) : String(v).toLowerCase();     // PostgreSQL compares strings case-sensitively
}
/* Row-set comparison: {equal} or {equal:false, reason:'rows'|'columns'|'not-rows', missing, extra, rowsRight}. Order is ignored. */
function compareResults(got, exp) {
  if (!got || got.type !== 'rows') return { equal: false, reason: 'not-rows' };
  const key = (r) => JSON.stringify(r.map(canon));
  const gk = got.rows.map(key), ek = exp.rows.map(key);
  if (got.columns.length === exp.columns.length) {
    if ([...gk].sort().join('|') === [...ek].sort().join('|')) return { equal: true };
    return { equal: false, reason: 'rows', missing: ek.filter((k) => !gk.includes(k)).length, extra: gk.filter((k) => !ek.includes(k)).length };
  }
  if (got.rows.length === exp.rows.length) {      // extra or missing columns: do the learner's rows still contain the expected values?
    const pool = got.rows.map((r) => r.map(canon));
    const allIn = exp.rows.every((er) => { const i = pool.findIndex((gr) => er.map(canon).every((v) => gr.includes(v))); if (i < 0) return false; pool.splice(i, 1); return true; });
    if (allIn) return { equal: false, reason: 'columns', rowsRight: true };
  }
  return { equal: false, reason: 'columns', rowsRight: false };
}
const NUM_TYPES = new Set(['int', 'smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision']);
const TABLE_CLASS = LESSON.db.tableClass || {};
const TABLE_COLOR = LESSON.db.tableColor || {};
const pkKey = (t, r) => t.pk.map((c) => r[c]).join('|');

/* Start the engine as soon as core loads. The build runs viz + content + boot() after KIT_READY, and exposes
   window.__dbReady (resolves once the deck is fully built) for the smoke test. */
const loaderEl = h('div', { id: 'dbload', role: 'status' }, h('i'), h('span', {}, ENGINE === 'minisql' ? 'Loading…' : 'Starting PostgreSQL…'));
document.body.append(loaderEl);
function fatal(e) {
  console.error(e);
  loaderEl.className = 'err'; loaderEl.innerHTML = '';
  loaderEl.append(h('b', {}, 'This lesson could not start the database.'), h('span', {}, e && e.message ? e.message : String(e)));
}
const KIT_READY = (async () => { BASE = await DRIVER.init(); loaderEl.remove(); })();

/* ================= state ================= */
const STORE = `sql-lesson-${LESSON.id}:v1`;
const MAX = Object.fromEntries(Object.entries(LESSON.items).map(([k, v]) => [k, v.max]));
const LABEL = Object.fromEntries(Object.entries(LESSON.items).map(([k, v]) => [k, v.label]));
const COUNT = { cp: Object.keys(MAX).filter((k) => k.startsWith('cp')).length, lab: Object.keys(MAX).filter((k) => k.startsWith('lab')).length };
const TOTAL = Object.values(MAX).reduce((a, b) => a + b, 0);
let state = { idx: 0, res: {}, revealed: {}, theme: null };
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && typeof s === 'object') state = { ...state, ...s }; } catch (e) { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } };
if (window.Progress) Progress.init(LESSON); // optional database tracking; the lesson works without it
const totalScore = () => Object.values(state.res).reduce((a, r) => a + (r.score || 0), 0);
const roundHalf = (x) => Math.round(x * 2) / 2;

/* theme */
function applyTheme() { if (state.theme) document.documentElement.setAttribute('data-theme', state.theme); else document.documentElement.removeAttribute('data-theme'); }
applyTheme();
$('#themebtn').addEventListener('click', () => {
  const cur = state.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  state.theme = cur === 'dark' ? 'light' : 'dark'; applyTheme(); save();
});

/* toast */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ================= deck ================= */
const slides = $$('.slide');
const N = slides.length;
const onEnter = {};
function stepsOf(i) { return $$('[data-step]', slides[i]); }
function applySteps(i) { const n = state.revealed[i] || 0; stepsOf(i).forEach((s, k) => s.classList.toggle('shown', k < n)); const hint = $('.stephint', slides[i]); if (hint) hint.style.visibility = n >= stepsOf(i).length ? 'hidden' : 'visible'; }
function gateOf(i) { return slides[i].dataset.gate || null; }
function locked(i) { const g = gateOf(i); return g && !state.res[g]; }
function go(i, back = false) {
  if (typeof i === 'string') i = Math.max(0, slides.findIndex((s) => s.id === i));
  i = Math.max(0, Math.min(N - 1, i));
  slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.classList.toggle('back', k < i); });
  state.idx = i; save(); applySteps(i); updateHud();
  if (window.Progress) Progress.slide(gateOf(i)); // the gate of the slide is the item being worked on
  slides[i].scrollTop = 0;
  if (onEnter[i]) onEnter[i]();
}
function next() {
  const i = state.idx; const st = stepsOf(i); const n = state.revealed[i] || 0;
  if (n < st.length) { state.revealed[i] = n + 1; save(); applySteps(i); return; }
  if (locked(i)) { toast('Submit this checkpoint to unlock the next slide.'); const b = $('#nextbtn'); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
  if (i < N - 1) go(i + 1);
}
function prev() { if (state.idx > 0) go(state.idx - 1, true); }
function updateHud() {
  const i = state.idx;
  $('#prog').style.width = `${(i / (N - 1)) * 100}%`;
  $('#pos').textContent = `${i + 1} / ${N}`;
  $('#hudsec').textContent = slides[i].dataset.sec || '';
  $('#scoreval').textContent = totalScore();
  $('#prevbtn').disabled = i === 0;
  const nb = $('#nextbtn'); nb.disabled = i === N - 1 && (state.revealed[i] || 0) >= stepsOf(i).length; nb.classList.toggle('locked', !!locked(i) && (state.revealed[i] || 0) >= stepsOf(i).length);
}
$('#nextbtn').addEventListener('click', next);
$('#prevbtn').addEventListener('click', prev);
document.addEventListener('keydown', (e) => {
  const tg = e.target;
  if (tg.closest && tg.closest('textarea,input,select,[contenteditable]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && tg.tagName !== 'BUTTON')) { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
});
let tx0 = null;
$('#deck').addEventListener('touchstart', (e) => { if (e.target.closest('textarea,.editor,.tblbox,.rs,.timeline')) { tx0 = null; return; } tx0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
$('#deck').addEventListener('touchend', (e) => { if (!tx0) return; const dx = e.changedTouches[0].clientX - tx0[0], dy = e.changedTouches[0].clientY - tx0[1]; if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) dx < 0 ? next() : prev(); tx0 = null; });
const slideIndexOf = (el) => slides.indexOf(el.closest('.slide'));

/* ================= data table rendering ================= */
function renderTable(name, { cols = null, rows = null, compact = false, caption = true, keyed = true } = {}) {
  const t = T(name); const cs = cols ? cols.map((c) => t.cols.find((x) => x.name === c)) : t.cols;
  const fkOf = (c) => t.fks.find((f) => f.cols.includes(c.name));
  const head = h('tr', {}, cs.map((c) => { const fk = fkOf(c); return h('th', { class: t.pk.includes(c.name) ? 'pk' : fk ? 'fk' : null, style: fk ? `--fkc:${TABLE_COLOR[fk.refTable]}` : null, title: fk ? `foreign key → ${fk.refTable}.${fk.refCols[0]}` : t.pk.includes(c.name) ? 'primary key' : null }, c.name); }));
  const body = (rows || t.rows).map((r) => h('tr', { class: 'r', 'data-key': keyed ? pkKey(t, r) : null }, cs.map((c) => h('td', { class: c.scale != null || NUM_TYPES.has(c.type) ? 'num' : null, 'data-col': c.name }, fmt(r[c.name], c)))));
  const tbl = h('table', { class: 'tbl' }, caption ? h('caption', {}, name) : null, h('thead', {}, head), h('tbody', {}, body));
  if (compact) tbl.style.fontSize = '12.5px';
  return h('div', { class: `tblbox ${TABLE_CLASS[name] || ''}`, style: TABLE_COLOR[name] ? `--tc:${TABLE_COLOR[name]}` : null, 'data-table': name }, tbl);
}

/* ================= checkpoint framework ================= */
function partOrder(p, onChange) {
  const el = h('div', { class: 'ord' }); let ans = [];
  const btns = p.display.map((i) => { const b = h('button', { type: 'button', 'data-i': i }, h('span', { class: 'n' }, ''), h('span', {}, p.items[i])); el.append(b); return b; });
  const paint = () => btns.forEach((b) => { const k = ans.indexOf(+b.dataset.i); b.classList.toggle('picked', k >= 0); $('.n', b).textContent = k >= 0 ? k + 1 : ''; });
  btns.forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; const k = ans.indexOf(i); if (k >= 0) ans = ans.slice(0, k); else ans.push(i); paint(); onChange(); }));
  return {
    el, complete: () => ans.length === p.items.length, get: () => ans, set: (a) => { ans = a.slice(); paint(); },
    grade: (a) => { const right = a.filter((v, k) => v === k).length; return { score: roundHalf((p.pts * right) / p.items.length), fb: `${right} of ${p.items.length} in the right position. ${p.explain}` }; },
    lock: (a) => { btns.forEach((b) => { b.disabled = true; const i = +b.dataset.i; const k = a.indexOf(i); b.classList.add(k === i ? 'right' : 'wrong'); if (k !== i) $('.n', b).textContent = `${k + 1}→${i + 1}`; }); },
  };
}
function partClassify(p, onChange) {
  const el = h('div', {}); const ans = p.rows.map(() => null);
  const segs = p.rows.map((r, ri) => {
    const seg = h('div', { class: 'seg', role: 'group' }, p.options.map((o, oi) => h('button', { type: 'button', 'data-o': oi, onclick: () => { ans[ri] = oi; paint(); onChange(); } }, o)));
    el.append(h('div', { class: 'cls' }, h('div', { class: 'q', html: r.q }), seg)); return seg;
  });
  const paint = () => segs.forEach((s, ri) => $$('button', s).forEach((b) => b.classList.toggle('on', +b.dataset.o === ans[ri])));
  return {
    el, complete: () => ans.every((a) => a != null), get: () => ans.slice(), set: (a) => { a.forEach((v, i) => { ans[i] = v; }); paint(); },
    grade: (a) => { const right = a.filter((v, i) => v === p.rows[i].a).length; return { score: roundHalf((p.pts * right) / p.rows.length), fb: `${right} of ${p.rows.length} correct. ${p.explain}` }; },
    lock: (a) => segs.forEach((s, ri) => $$('button', s).forEach((b) => { b.disabled = true; const o = +b.dataset.o; b.classList.remove('on'); if (o === a[ri]) b.classList.add(o === p.rows[ri].a ? 'right' : 'wrong'); else if (o === p.rows[ri].a) b.classList.add('missed'); })),
  };
}
function partColumns(p, onChange) {
  const el = h('div', { class: 'colsel' }); const flat = []; const segs = [];
  for (const tb of p.tables) {
    const t = T(tb.name);
    const head = h('tr', {}, tb.cols.map(([c]) => h('th', {}, c)));
    const ctl = h('tr', {}, tb.cols.map(([c, a]) => { const idx = flat.length; flat.push(a); const seg = h('div', { class: 'seg' }, p.options.map((o, oi) => h('button', { type: 'button', 'data-o': oi, onclick: () => { ans[idx] = oi; paint(); onChange(); } }, o))); segs.push(seg); return h('td', { class: 'ctl' }, seg); }));
    const body = t.rows.slice(0, 2).map((r) => h('tr', {}, tb.cols.map(([c]) => h('td', {}, fmt(r[c], t.cols.find((x) => x.name === c))))));
    el.append(h('div', { class: `tblbox ${TABLE_CLASS[tb.name] || ''}`, style: TABLE_COLOR[tb.name] ? `--tc:${TABLE_COLOR[tb.name]}` : null }, h('table', { class: 'tbl' }, h('caption', {}, tb.name), h('thead', {}, head), h('tbody', {}, body, h('tr', {}, tb.cols.map(() => h('td', { style: 'color:var(--muted)' }, '…'))), ctl))));
  }
  const ans = flat.map(() => null);
  const paint = () => segs.forEach((s, i) => $$('button', s).forEach((b) => b.classList.toggle('on', +b.dataset.o === ans[i])));
  return {
    el, complete: () => ans.every((a) => a != null), get: () => ans.slice(), set: (a) => { a.forEach((v, i) => { ans[i] = v; }); paint(); },
    grade: (a) => { const right = a.filter((v, i) => v === flat[i]).length; return { score: roundHalf((p.pts * right) / flat.length), fb: `${right} of ${flat.length} columns labeled correctly. ${p.explain}` }; },
    lock: (a) => segs.forEach((s, i) => $$('button', s).forEach((b) => { b.disabled = true; const o = +b.dataset.o; b.classList.remove('on'); if (o === a[i]) b.classList.add(o === flat[i] ? 'right' : 'wrong'); else if (o === flat[i]) b.classList.add('missed'); })),
  };
}
function partMCQ(p, onChange) {
  const el = h('div', {}); let ans = [];
  const btns = p.opts.map((o, i) => { const b = h('button', { type: 'button', class: `opt${p.multi ? '' : ' single'}` }, h('span', { class: 'box' }), h('span', { html: o.t })); b.addEventListener('click', () => { if (p.multi) ans = ans.includes(i) ? ans.filter((x) => x !== i) : [...ans, i]; else ans = [i]; paint(); onChange(); }); el.append(b); return b; });
  const paint = () => btns.forEach((b, i) => b.classList.toggle('on', ans.includes(i)));
  const okCount = p.opts.filter((o) => o.ok).length;
  return {
    el, complete: () => ans.length > 0, get: () => ans.slice(), set: (a) => { ans = a.slice(); paint(); },
    grade: (a) => {
      let s;
      if (p.multi) { const hits = a.filter((i) => p.opts[i].ok).length, wrong = a.length - hits; s = Math.max(0, (hits - wrong) / okCount) * p.pts; }
      else s = p.opts[a[0]].ok ? p.pts : 0;
      return { score: roundHalf(s), fb: p.explain };
    },
    lock: (a) => btns.forEach((b, i) => { b.disabled = true; b.classList.remove('on'); const picked = a.includes(i), ok = !!p.opts[i].ok; if (picked) b.classList.add(ok ? 'right' : 'wrong'); else if (ok) b.classList.add('missed'); }),
  };
}
/* text: type a short answer. p.accept = array of accepted answers (compared case/space-insensitively) or a RegExp. */
function partText(p, onChange) {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/;$/, '');
  const inp = h('input', { type: 'text', class: 'txtans', spellcheck: 'false', autocomplete: 'off', placeholder: p.placeholder || 'Your answer' });
  inp.addEventListener('input', onChange);
  const ok = (v) => (p.accept instanceof RegExp ? p.accept.test(String(v).trim()) : p.accept.map(norm).includes(norm(v)));
  return {
    el: h('div', {}, inp), complete: () => inp.value.trim().length > 0, get: () => inp.value, set: (v) => { inp.value = v; },
    grade: (v) => ({ score: ok(v) ? p.pts : 0, fb: `${ok(v) ? '' : `Expected: <code class="i">${esc(p.show || (Array.isArray(p.accept) ? p.accept[0] : ''))}</code>. `}${p.explain}` }),
    lock: (v) => { inp.disabled = true; inp.classList.add(ok(v) ? 'right' : 'wrong'); },
  };
}
const PART = { order: partOrder, classify: partClassify, columns: partColumns, mcq: partMCQ, text: partText };

function finishRecord(id, score) { updateHud(); renderResults(); toast(`Saved: ${score} / ${MAX[id]} points. The next slide is unlocked.`); }

const CPS = {};
function makeCheckpoint(def) {
  const root = $('#' + def.id);
  const max = def.parts.reduce((a, p) => a + p.pts, 0);
  root.append(
    h('div', { class: 'cp-head' }, h('span', { class: 'cp-badge' }, `Checkpoint ${def.n} of ${COUNT.cp}`), h('span', { class: 'cp-pts' }, `${max} points`)),
    h('h2', { class: 'title wide', style: 'margin-top:12px' }, def.title),
    ...(def.intro ? [h('p', { class: 'lead', style: 'margin-bottom:6px', html: def.intro })] : []),
  );
  const apis = def.parts.map((p, i) => {
    const api = PART[p.type](p, () => refresh());
    const fb = h('div', { class: 'fbslot' });
    root.append(h('div', { class: 'part' }, h('h4', {}, h('span', { html: p.title }), h('span', { class: 'pp' }, `${p.pts} pts`)), p.hint ? h('p', { class: 'hint', html: p.hint }) : null, p.html ? h('div', { html: p.html, style: 'margin-bottom:8px' }) : null, api.el, fb));
    api.fb = fb; return api;
  });
  const submit = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Submit answers');
  const skip = h('button', { class: 'skip', type: 'button' }, 'Skip for 0 points');
  const out = h('span', { class: 'cp-score' });
  root.append(h('div', { class: 'cp-foot' }, submit, skip, out));
  function refresh() { submit.disabled = !apis.every((a) => a.complete()); }
  CPS[def.id] = { def, apis, submit };              // for kit.play_test.py
  function showGraded(rec) {
    apis.forEach((a, i) => {
      const ans = rec.ans[i];
      if (ans == null) { a.fb.innerHTML = '<div class="fb bad">Skipped.</div>'; a.lock(a.get()); return; }
      a.set(ans); const g = a.grade(ans); a.lock(ans);
      a.fb.innerHTML = `<div class="fb ${g.score === def.parts[i].pts ? 'good' : g.score > 0 ? 'mid' : 'bad'}"><b>${g.score} / ${def.parts[i].pts}</b> — ${g.fb}</div>`;
    });
    submit.remove(); skip.remove();
    out.innerHTML = `Score: <span style="color:${rec.score >= max * 0.8 ? 'var(--green)' : rec.score >= max * 0.5 ? 'var(--amber)' : 'var(--red)'}">${rec.score} / ${max}</span>${rec.skipped ? ' · skipped' : ''}`;
  }
  submit.addEventListener('click', () => {
    const ans = apis.map((a) => a.get()); const parts = apis.map((a, i) => ({ score: a.grade(ans[i]).score, max: def.parts[i].pts, answer: ans[i] }));
    const score = parts.reduce((s, p) => s + p.score, 0);
    state.res[def.id] = { score, ans }; save(); showGraded(state.res[def.id]); finishRecord(def.id, score);
    if (window.Progress) Progress.attempt({ item: def.id, score, parts });
  });
  skip.addEventListener('click', () => {
    if (!confirm('Skip this checkpoint? It locks at 0 points and reveals the answers.')) return;
    state.res[def.id] = { score: 0, ans: apis.map(() => null), skipped: true }; save(); showGraded(state.res[def.id]); finishRecord(def.id, 0);
    if (window.Progress) Progress.attempt({ item: def.id, score: 0, skipped: true, parts: apis.map((a, i) => ({ score: 0, max: def.parts[i].pts, answer: null })) });
  });
  if (state.res[def.id]) showGraded(state.res[def.id]);
}


/* ================= SQL editor + output ================= */
function makeEditor(value, onRun) {
  const pre = h('pre', { 'aria-hidden': 'true' });
  const ta = h('textarea', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'SQL editor' });
  ta.value = value;
  const sync = () => { pre.innerHTML = hlSQL(ta.value) + '\n'; pre.scrollTop = ta.scrollTop; const lines = ta.value.split('\n').length; ta.style.height = 'auto'; ta.style.height = Math.max(150, Math.min(420, ta.scrollHeight + 2)) + 'px'; };
  ta.addEventListener('input', sync); ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); sync(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onRun(); }
    if (e.key === 'Escape') ta.blur();
  });
  const el = h('div', { class: 'editor' }, pre, ta);
  requestAnimationFrame(sync);
  return { el, get: () => ta.value, set: (v) => { ta.value = v; sync(); }, ta, sync };
}
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
function rsTable(r, title) {
  const wrap = h('div', { class: 'rs' });
  if (!r.rows.length) { wrap.append(h('div', { class: 'rsmeta' }, `${title ? title + ' · ' : ''}Empty set (0 rows)`)); return wrap; }
  wrap.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, r.columns.map((c) => h('th', {}, c)))), h('tbody', {}, r.rows.map((row) => h('tr', {}, row.map((v, i) => h('td', { class: typeof v === 'number' || (r.colTypes[i] && r.colTypes[i].num) ? 'num' : null, style: v == null ? 'color:var(--muted)' : null }, fmt(v, r.colTypes[i]))))))));
  wrap.append(h('div', { class: 'rsmeta' }, `${title ? title + ' · ' : ''}${r.rows.length} row${r.rows.length === 1 ? '' : 's'} in set`));
  return wrap;
}
function renderOut(box, results, error) {
  box.innerHTML = '';
  (results || []).forEach((r, i) => {
    const multi = results.length > 1;
    if (r.type === 'rows') { if (r.msg) box.append(h('div', { class: `msg${r.flag === 'nowhere' ? ' warn' : ''}` }, `${multi ? `#${i + 1} ` : ''}${r.msg}${r.flag === 'nowhere' ? '  ⚠ no WHERE clause: every row in the table was affected' : ''}`)); box.append(rsTable(r, multi ? `#${i + 1}` : '')); }
    else box.append(h('div', { class: `msg${r.flag === 'nowhere' ? ' warn' : ''}` }, `${multi ? `#${i + 1} ` : ''}${r.msg}${r.flag === 'nowhere' ? '  ⚠ no WHERE clause: every row in the table was affected' : ''}`));
  });
  if (error) box.append(h('div', { class: 'msg err' }, `ERROR: ${error}`));
}
function schemaPanel() {
  const tables = LESSON.db.tables;
  const body = tables.map((n) => { const t = T(n); return `<div class="t"><b style="color:${TABLE_COLOR[n]}">${n}</b><br><span>${t.cols.map((c) => { const fk = t.fks.find((f) => f.cols.includes(c.name)); return t.pk.includes(c.name) ? `<span class="pkc">◆${c.name}</span>` : fk ? `<span style="color:${TABLE_COLOR[fk.refTable]}">${c.name}↗</span>` : c.name; }).join(', ')}</span></div>`; }).join('');
  return h('div', { class: 'schema', html: `<h5>${LESSON.db.label}</h5>${body}<div class="muted" style="font-size:11.5px">◆ primary key · ↗ foreign key (colored by the table it points to)</div><details><summary>${LESSON.db.seedNote || 'How it was created'}</summary><pre class="code">${hlSQL(SEED)}</pre></details>` });
}
const kbdHint = () => h('span', { class: 'kbd' }, `${isMac ? '⌘' : 'Ctrl'}+Enter runs`);

/* ================= playground =================
   makePlayground({ root: '#playground', presets: '#pgpresets', schema: '#pgschema', start: 'SELECT ...', items: [[label, sql, danger?], ...] })
   State persists across runs until "Reset database" (unlike labs, which run on a fresh copy every time). */
function makePlayground(o) {
  let db = null;
  const out = h('div', { class: 'out' });
  const ed = makeEditor(o.start || '', run);
  const getDB = async () => db || (db = await newDB());
  function run() {
    const sql = ed.get();
    return serial(async () => {
      let res = [];
      try { res = await (await getDB()).exec(sql); renderOut(out, res); } catch (e) { renderOut(out, e.results || res, e.message); }
    });
  }
  async function reset() { await serial(async () => { if (db) await db.close(); db = null; await getDB(); }); renderOut(out, [{ type: 'ok', msg: `Database reset to ${LESSON.db.label}.` }]); }
  const pbox = $(o.presets);
  if (pbox) (o.items || []).forEach(([l, s, danger]) => pbox.append(h('button', { type: 'button', class: danger ? 'danger' : null, onclick: () => { ed.set(s); run(); } }, l)));
  $(o.root).append(ed.el, h('div', { class: 'edbar' }, h('button', { class: 'btn primary', type: 'button', onclick: run }, 'Run'), h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Reset database'), kbdHint()), out);
  if (o.schema && $(o.schema)) $(o.schema).append(schemaPanel());
  return { ed, run, reset, getDB };
}

/* ================= labs ================= */
const LABS = {};
function makeLab(def) {
  const root = $('#' + def.id);
  const open = [];                                               // every database opened by one operation; closed when it ends
  const fresh = async () => { const d = await newDB(def.setup); open.push(d); return d; };
  const closeAll = () => Promise.all(open.splice(0).map((d) => d.close()));
  const out = h('div', { class: 'out' }); const fb = h('div', {});
  const ed = makeEditor(def.starter, run);
  async function exec(sql) { const d = await fresh(); const res = []; try { for (const r of await d.exec(sql)) res.push(r); return { d, res, error: null }; } catch (e) { return { d, res: e.results || res, error: e.message }; } }
  const buttons = [];
  /* One queued, button-locked database operation. */
  const task = (fn) => { buttons.forEach((b) => { b.disabled = true; }); return serial(async () => { try { return await fn(); } finally { await closeAll(); buttons.forEach((b) => { b.disabled = false; }); } }); };
  function run() {
    const sql = ed.get();
    if (sql.includes('____')) { renderOut(out, [], 'Replace each ____ blank before running.'); return; }
    return task(async () => {
      const { d, res, error } = await exec(sql); renderOut(out, res, error);
      if (window.Progress) Progress.labRun({ item: def.id, sql, error });
      if (def.after && !error) out.append(rsTable((await d.exec(def.after))[0], def.afterLabel || 'table after your statement'));
    });
  }
  const submit = h('button', { class: 'btn primary', type: 'button', style: '--c:var(--green)' }, 'Submit for grading');
  const runBtn = h('button', { class: 'btn', type: 'button', onclick: run }, 'Run');
  const resetBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => ed.set(def.starter) }, 'Reset code');
  const skip = h('button', { class: 'skip', type: 'button' }, 'Skip for 0 points');
  buttons.push(runBtn, submit, skip);
  LABS[def.id] = { def, ed, submit, runBtn };      // for kit.play_test.py
  root.append(
    h('div', { class: 'cp-head' }, h('span', { class: 'cp-badge', style: 'background:color-mix(in srgb,var(--green) 18%,transparent);color:var(--green);border-color:color-mix(in srgb,var(--green) 40%,transparent)' }, `SQL lab ${def.n} of ${COUNT.lab}`), h('span', { class: 'cp-pts' }, `${def.pts} points · run as often as you like, submit once`)),
    h('h2', { class: 'title wide', style: 'margin-top:12px' }, def.title),
    h('div', { class: 'lab' }, h('div', {}, h('p', { class: 'task', html: def.task }), ed.el, h('div', { class: 'edbar' }, runBtn, submit, resetBtn, kbdHint(), skip), out, fb), schemaPanel()),
  );
  /* Builds the graded view. `pre` ({mine, g}) reuses the run that was just graded. Call inside task(). */
  async function showGraded(rec, pre) {
    ed.set(rec.sql || ''); ed.ta.readOnly = true; submit.remove(); skip.remove(); resetBtn.remove();
    const mine = rec.skipped ? null : (pre ? pre.mine : await exec(rec.sql));
    const g = rec.skipped ? { score: 0, verdict: 'Skipped.', cls: 'bad' } : (pre ? pre.g : await def.grade(mine, fresh));
    const refRun = await exec(def.ref);
    fb.innerHTML = '';
    fb.append(h('div', { class: `fb ${g.score === def.pts ? 'good' : g.score > 0 ? 'mid' : 'bad'}`, html: `<b>${g.score} / ${def.pts}</b> — ${g.verdict}` }));
    if (!rec.skipped && def.kind !== 'dml' && def.kind !== 'update') {
      const last = [...mine.res].reverse().find((r) => r.type === 'rows');
      const exp = [...refRun.res].reverse().find((r) => r.type === 'rows');
      fb.append(h('div', { class: 'cmp' }, h('div', {}, h('h6', {}, 'Your result'), last ? rsTable(last) : h('div', { class: 'msg' }, 'No result set')), h('div', {}, h('h6', {}, 'Expected'), rsTable(exp))));
    }
    fb.append(h('div', { style: 'margin-top:12px' }, h('h6', { class: 'muted', style: 'margin:0 0 4px;font:600 12.5px JetBrains Mono,monospace' }, 'Reference solution'), h('pre', { class: 'code', html: hlSQL(def.ref) })));
    fb.append(h('div', { class: 'fb', html: def.explain }));
  }
  submit.addEventListener('click', () => {
    const sql = ed.get();
    if (sql.includes('____')) { toast('Fill in the ____ blanks first.'); return; }
    if (!sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim()) { toast('Write a statement first.'); return; }
    task(async () => {
      const r = await exec(sql);
      if (r.error) { renderOut(out, r.res, r.error); toast('Your SQL has an error — fix it, then submit. Errors are not graded.'); return; }
      const g = await def.grade(r, fresh);
      state.res[def.id] = { score: g.score, sql }; save(); await showGraded(state.res[def.id], { mine: r, g }); finishRecord(def.id, g.score);
      if (window.Progress) Progress.attempt({ item: def.id, score: g.score, sql, verdict: g.verdict });
    });
  });
  skip.addEventListener('click', () => {
    if (!confirm('Skip this lab? It locks at 0 points and shows the solution.')) return;
    task(async () => { state.res[def.id] = { score: 0, sql: ed.get(), skipped: true }; save(); await showGraded(state.res[def.id]); finishRecord(def.id, 0); if (window.Progress) Progress.attempt({ item: def.id, score: 0, skipped: true, sql: state.res[def.id].sql }); });
  });
  if (state.res[def.id]) task(() => showGraded(state.res[def.id]));
}
/* Graders receive ({d, res, error}, fresh) and may be async. `d` is the learner's database after their script;
   `fresh()` resolves to a new seeded database (plus the lab's setup) and is closed for you when grading ends. */
function gradeSelect(def, partial = {}) {
  return async ({ res }, fresh) => {
    const got = [...res].reverse().find((r) => r.type === 'rows');
    if (!got) return { score: 0, verdict: 'Your script didn\'t return a result set — the task asks for a SELECT.' };
    const exp = (await (await fresh()).exec(def.ref)).find((r) => r.type === 'rows');
    const c = compareResults(got, exp);
    if (c.equal) return { score: def.pts, verdict: 'Exactly the expected result set.' };
    if (c.reason === 'columns' && c.rowsRight) return { score: Math.round(def.pts * 0.6), verdict: `Right rows, but the columns differ: return exactly ${exp.columns.join(', ')} (${exp.columns.length} columns), in that order.` };
    if (c.reason === 'columns') return { score: 0, verdict: `Expected ${exp.columns.length} columns (${exp.columns.join(', ')}) and different rows.` };
    if (partial.superset && c.missing === 0 && c.extra > 0) return { score: partial.superset, verdict: `All expected rows are there, plus ${c.extra} extra — a condition is missing.` };
    return { score: 0, verdict: `The rows don't match: ${c.missing} expected row${c.missing === 1 ? '' : 's'} missing, ${c.extra} unexpected row${c.extra === 1 ? '' : 's'}. Compare below.` };
  };
}

/* gradeState(def, opts): generic grader for DML/DDL labs (INSERT/UPDATE/DELETE/CREATE...).
   def.check = SQL whose result describes the end state (e.g. 'SELECT * FROM product ORDER BY 1').
   Full points: end state equals the reference's AND rows affected by the learner's DML equals the reference's.
   opts.stateOnly = points when the state is right but rows-affected differs (default 60%).
   opts.verdicts = { full, stateOnly, wrong } overrides. */
function gradeState(def, opts = {}) {
  const dmlAffected = (res) => res.filter((r) => /^(insert|update|delete)/i.test((r.text || '').trim())).reduce((a, r) => a + (r.affected || 0), 0);
  return async ({ d, res }, fresh) => {
    const ref = await fresh(); const refRes = await ref.exec(def.ref);
    const q = async (db) => (await db.exec(def.check)).find((r) => r.type === 'rows');
    const c = compareResults(await q(d), await q(ref));
    const v = opts.verdicts || {};
    if (!c.equal) return { score: 0, verdict: v.wrong || `The end state doesn't match: ${c.missing || 0} expected row(s) missing, ${c.extra || 0} unexpected.` };
    const mine = dmlAffected(res), want = dmlAffected(refRes);
    if (mine === want) return { score: def.pts, verdict: v.full || `Correct end state, ${want} row${want === 1 ? '' : 's'} affected.` };
    return { score: Math.round(def.pts * (opts.stateOnly ?? 0.6)), verdict: v.stateOnly || `The end state is right, but your statements affected ${mine} row(s) in total; the clean solution affects ${want}.` };
  };
}

/* ================= results ================= */
function renderResults() {
  const root = $('#results'); if (!root) return;
  const tot = totalScore(); const done = Object.keys(state.res).length; const all = Object.keys(MAX).length;
  const pct = tot / TOTAL; const C = 2 * Math.PI * 80;
  const col = pct >= 0.85 ? 'var(--green)' : pct >= 0.6 ? 'var(--amber)' : 'var(--red)';
  const nextN = String(+LESSON.id + 1).padStart(2, '0');
  const verdict = done < all ? `${all - done} of ${all} checkpoints still open — go back and submit them.` : pct >= 0.85 ? `Solid. You're ready for lesson ${nextN}.` : pct >= 0.6 ? `Good base. Review the weak spots below before lesson ${nextN}.` : 'Worth a second pass: review the weak spots below, then reset and retake.';
  root.innerHTML = '';
  root.append(
    h('p', { class: 'kicker', style: '--acc:var(--green)' }, `Lesson ${LESSON.id} · results`),
    h('h2', { class: 'title wide' }, 'How you did'),
    h('div', { class: 'split', style: 'margin-top:8px' },
      h('div', { class: 'stack' },
        h('div', { class: 'row', style: 'gap:24px;align-items:center' },
          h('div', { class: 'ring', html: `<svg viewBox="0 0 190 190" width="190" height="190"><circle cx="95" cy="95" r="80" fill="none" stroke="var(--line2)" stroke-width="12"/><circle cx="95" cy="95" r="80" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset 1s var(--ease)"/></svg><div class="val"><div><b>${tot}</b><small>/ ${TOTAL}</small></div></div>` }),
          h('p', { class: 'soft', style: 'margin:0;max-width:30ch;font-size:17px' }, verdict)),
        h('div', { class: 'bars' }, Object.keys(MAX).map((id) => {
          const r = state.res[id]; const s = r ? r.score : 0; const p = s / MAX[id];
          return h('div', { class: 'bar' }, h('span', {}, LABEL[id]), h('div', { class: 'track' }, h('i', { style: `width:${r ? p * 100 : 0}%;--c:${p >= 0.8 ? 'var(--green)' : p >= 0.5 ? 'var(--amber)' : 'var(--red)'}` })), h('span', { class: 's' }, r ? `${s}/${MAX[id]}` : '\u2014'), h('button', { type: 'button', onclick: () => go(LESSON.items[id].review) }, r && p >= 0.8 ? 'Revisit' : 'Review'));
        }))),
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', {}, 'Take with you'), h('ul', { html: LESSON.takeaways.map((t) => `<li>${t}</li>`).join('') })),
        h('div', { class: 'card accent', style: '--c:var(--violet)' }, h('h3', {}, `Next: lesson ${nextN}`), h('p', { html: LESSON.next })),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm('Erase all answers and scores for this lesson?')) { try { localStorage.removeItem(STORE); } catch (e) {} location.reload(); } } }, 'Reset lesson and retake'))),
    ),
  );
}

/* ================= boot (called by build after lesson content) ================= */
function boot() {
  renderResults();
  onEnter[N - 1] = renderResults;
  go(Math.min(state.idx || 0, N - 1));
}
