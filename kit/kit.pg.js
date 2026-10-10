/* =====================================================================
   SQL LESSON KIT · pg.js
   PGlite driver (real PostgreSQL compiled to WASM). Included by the build for
   every lesson whose config does not say engine: 'minisql'.
   Loaded after the lesson config and before kit.core.js; core picks it up as PGDRV.

   Driver contract (shared with the MiniSQL driver in core):
     init()          -> BASE: { tables: { name: { cols, pk, fks, rows } } }  (schema metadata for the UI)
     create(setup?)  -> db: { exec(sql) -> Promise<results[]>, close() }     (fresh copy of the seeded database)
   Results use the MiniSQL shape: {type:'rows', columns, colTypes, rows, msg?, affected?, text} or {type:'ok', msg, affected, text, flag?}.
   A failing exec() rejects with an Error whose .results holds the results of the statements that ran first.

   Delivery: server build loads ./vendor/pglite/* over HTTP (npm run lessons);
   inline build (kit.build.py --inline) ships gzip+base64 assets in __PG_INLINE plus the PGliteMod bundle.
   ===================================================================== */
const PGDRV = (() => {
  const VENDOR = 'vendor/pglite/';
  const NUM_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700]);   // int8 int2 int4 oid float4 float8 numeric: right-aligned
  let lib = null, assets = null, baseSnap = null;
  const snaps = new Map();                                        // setup SQL -> Promise<Blob> (seed + setup, dumped data dir)

  /* ---------- loading ---------- */
  async function inflate(b64) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  async function load() {
    if (assets) return assets;
    if (typeof __PG_INLINE !== 'undefined') {
      lib = PGliteMod;
      const [w, d, i] = await Promise.all([inflate(__PG_INLINE.wasm), inflate(__PG_INLINE.data), inflate(__PG_INLINE.initdb)]);
      assets = { pg: await WebAssembly.compile(w), initdb: await WebAssembly.compile(i), data: new Blob([d]) };
    } else {
      if (location.protocol === 'file:') throw new Error('This lesson runs real PostgreSQL (PGlite) and browsers block that on file:// pages. Start the lesson server with `npm run lessons` and open http://localhost:8080/ instead, or build the offline single file with `kit.build.py --inline`.');
      const url = (f) => new URL(VENDOR + f, location.href).href;
      const get = async (f) => { const r = await fetch(url(f)); if (!r.ok) throw new Error(`Could not load ${VENDOR}${f} (HTTP ${r.status}). Is the page served by \`npm run lessons\`?`); return r; };
      const [mod, pg, initdb, data] = await Promise.all([import(url('index.js')), get('pglite.wasm').then((r) => r.arrayBuffer()).then(WebAssembly.compile), get('initdb.wasm').then((r) => r.arrayBuffer()).then(WebAssembly.compile), get('pglite.data').then((r) => r.blob())]);
      lib = mod; assets = { pg, initdb, data };
    }
    return assets;
  }
  /* Dates, timestamps, numeric and bigint stay as the exact text Postgres prints (what psql would show). */
  const parsers = () => { const raw = (v) => v; const t = lib.types; return { [t.DATE]: raw, [t.TIMESTAMP]: raw, [t.TIMESTAMPTZ]: raw, [t.NUMERIC]: raw, [t.INT8]: raw }; };
  async function boot(loadDataDir) {
    const a = await load();
    return lib.PGlite.create({ pgliteWasmModule: a.pg, initdbWasmModule: a.initdb, fsBundle: a.data, parsers: parsers(), ...(loadDataDir ? { loadDataDir } : {}) });
  }

  /* ---------- statement splitting (psql sends one statement at a time) ---------- */
  const stripComments = (s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  function splitSQL(src) {
    const out = []; let cur = '', i = 0; const n = src.length;
    const push = () => { if (stripComments(cur).replace(/;/g, '').trim()) out.push(cur.trim()); cur = ''; };
    while (i < n) {
      const c = src[i], c2 = src[i + 1];
      if (c === '-' && c2 === '-') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; cur += src.slice(i, j); i = j; }
      else if (c === '/' && c2 === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; cur += src.slice(i, j); i = j; }
      else if (c === "'" || c === '"') { let j = i + 1; while (j < n) { if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; } j++; } cur += src.slice(i, j + 1); i = j + 1; }
      else if (c === '$' && !/[A-Za-z0-9_]/.test(src[i - 1] || ' ')) {
        const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i));
        if (m) { const e = src.indexOf(m[0], i + m[0].length); const j = e < 0 ? n : e + m[0].length; cur += src.slice(i, j); i = j; } else { cur += c; i++; }
      }
      else if (c === '\\' && !stripComments(cur).trim()) { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; out.push(src.slice(i, j).trim()); cur = ''; i = j; }   // psql meta-command: one line
      else if (c === ';') { cur += c; push(); i++; }
      else { cur += c; i++; }
    }
    push();
    return out;
  }

  /* ---------- result mapping ---------- */
  const OBJ_WORDS = new Set(['UNIQUE', 'OR', 'REPLACE', 'TEMP', 'TEMPORARY', 'UNLOGGED', 'GLOBAL', 'LOCAL', 'RECURSIVE', 'CONCURRENTLY']);
  function tagOf(stmt, r) {
    const cmd = r.command || '';
    if (cmd === 'INSERT') return `INSERT 0 ${r.affectedRows}`;
    if (['UPDATE', 'DELETE', 'MERGE', 'COPY'].includes(cmd)) return `${cmd} ${r.affectedRows}`;
    if (cmd === 'SELECT') return `SELECT ${r.rows.length}`;
    const w = stripComments(stmt).trim().split(/\s+/).map((x) => x.toUpperCase().replace(/[;(].*$/, ''));
    if (['CREATE', 'ALTER', 'DROP'].includes(w[0])) { let i = 1; while (OBJ_WORDS.has(w[i])) i++; const two = ['MATERIALIZED', 'FOREIGN', 'EVENT'].includes(w[i]); return `${w[0]} ${w[i]}${two ? ' ' + w[i + 1] : ''}`; }
    if (w[0] === 'TRUNCATE') return 'TRUNCATE TABLE';
    return cmd || w[0];
  }
  function toResult(stmt, r) {
    const cmd = r.command || '';
    const dml = ['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(cmd);
    const flag = (cmd === 'UPDATE' || cmd === 'DELETE') && !/\bwhere\b/i.test(stripComments(stmt).replace(/'(?:[^']|'')*'/g, "''")) ? 'nowhere' : null;
    const msg = tagOf(stmt, r);
    if (r.fields.length) {
      const res = { type: 'rows', columns: r.fields.map((f) => f.name), colTypes: r.fields.map((f) => ({ oid: f.dataTypeID, num: NUM_OIDS.has(f.dataTypeID) })), rows: r.rows, text: stmt };
      if (dml) { res.msg = msg; res.affected = r.affectedRows; res.flag = flag; }
      return res;
    }
    return { type: 'ok', msg, affected: r.affectedRows || 0, text: stmt, flag };
  }
  function errText(e) { return (e && e.message ? e.message : String(e)) + (e && e.detail ? ` — ${e.detail}` : '') + (e && e.hint ? ` Hint: ${e.hint}` : ''); }

  /* ---------- psql meta-commands ---------- */
  async function meta(db, line) {
    const m = /^\\(\w+\+?)\s*(.*)$/.exec(line.trim());
    const cmd = m && m[1].replace('+', ''), arg = m ? m[2].trim().replace(/;$/, '') : '';
    const asRows = (r, text) => ({ type: 'rows', columns: r.fields.map((f) => f.name), colTypes: r.fields.map(() => null), rows: r.rows, text });
    if (cmd === 'dt' || (cmd === 'd' && !arg)) {
      const kinds = cmd === 'dt' ? "('r','p')" : "('r','p','v','m','S','f')";
      return asRows(await db.query(`select n.nspname as "Schema", c.relname as "Name", case c.relkind when 'r' then 'table' when 'p' then 'partitioned table' when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' when 'f' then 'foreign table' end as "Type", pg_get_userbyid(c.relowner) as "Owner" from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ${kinds} and n.nspname = 'public' order by 2`, [], { rowMode: 'array' }), line);
    }
    if (cmd === 'd') {
      const r = await db.query(`select a.attname as "Column", format_type(a.atttypid, a.atttypmod) as "Type", case when a.attnotnull then 'not null' else '' end as "Nullable", coalesce(pg_get_expr(d.adbin, d.adrelid), case a.attidentity when 'a' then 'generated always as identity' when 'd' then 'generated by default as identity' end, '') as "Default" from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`, [arg], { rowMode: 'array' });
      return asRows(r, line);
    }
    throw new Error(`psql meta-command \\${cmd || ''} is not available in this sandbox. Supported: \\dt, \\d, \\d <table>. Run it for real in psql.`);
  }

  /* ---------- database wrapper ---------- */
  function wrap(db) {
    return {
      raw: db,
      async exec(sql) {
        const out = [];
        for (const st of splitSQL(sql)) {
          try {
            if (st[0] === '\\') out.push(await meta(db, st));
            else { const rs = await db.exec(st, { rowMode: 'array' }); out.push(toResult(st, rs[rs.length - 1])); }
          } catch (e) { const err = new Error(errText(e)); err.results = out; err.code = e && e.code; throw err; }
        }
        return out;
      },
      close: () => db.close(),
    };
  }

  /* ---------- schema metadata for the UI (renderTable, schema panel, column checkpoints) ---------- */
  async function introspect(db, names) {
    const tables = {};
    const cols = await db.query(`select table_name as t, column_name as c, data_type as ty, character_maximum_length as len, numeric_scale as sc from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);
    for (const r of cols.rows) {
      if (!names.includes(r.t)) continue;
      (tables[r.t] ||= { name: r.t, cols: [], pk: [], fks: [], rows: [] }).cols.push({ name: r.c, type: r.ty, len: r.len, scale: r.ty === 'numeric' ? r.sc : null });
    }
    const pks = await db.query(`select tc.table_name as t, kcu.column_name as c from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public' order by kcu.ordinal_position`);
    for (const r of pks.rows) if (tables[r.t]) tables[r.t].pk.push(r.c);
    const fks = await db.query(`select c.conrelid::regclass::text as t, c.confrelid::regclass::text as rt,
      (select array_agg(a.attname::text order by k.i) from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as cols,
      (select array_agg(a.attname::text order by k.i) from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) as refcols
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`);
    for (const r of fks.rows) if (tables[r.t]) tables[r.t].fks.push({ cols: r.cols, refTable: r.rt, refCols: r.refcols });
    for (const n of Object.keys(tables)) tables[n].rows = (await db.query(`select * from "${n}"`)).rows;
    return { tables };
  }

  /* CHECKPOINT first: an un-checkpointed dump restores like a crash, replaying WAL that pre-logs 32 sequence values,
     so the first identity/serial value would be 34 instead of 4. */
  const dump = async (db) => { await db.exec('CHECKPOINT'); return db.dumpDataDir('gzip'); };
  async function runScript(db, sql) { const w = wrap(db); try { await w.exec(sql); } catch (e) { throw new Error(`Seed SQL failed: ${e.message}`); } }

  return {
    async init() {
      const db = await boot();
      await runScript(db, SEED);
      baseSnap = await dump(db);
      const base = await introspect(db, LESSON.db.tables);
      await db.close();
      return base;
    },
    async create(setup) {
      let snap = baseSnap;
      if (setup) {
        if (!snaps.has(setup)) snaps.set(setup, (async () => { const d = await boot(baseSnap); await runScript(d, setup); const s = await dump(d); await d.close(); return s; })());
        snap = await snaps.get(setup);
      }
      return wrap(await boot(snap));
    },
    splitSQL,
  };
})();
