# Next task: move in-file SQL labs to PGlite, then build Lesson 02

## Why
The lessons grade SQL inside the HTML file with MiniSQL, a hand-written MySQL/Postgres-flavored engine in `kit/kit.engine.js`.

- It works and has 42 passing PG tests.
- But it is a simulation with known gaps: integer division, no GROUP BY, subqueries, window functions, CTEs, jsonb or EXPLAIN.
- Every new chapter means more engine work.

PGlite (`@electric-sql/pglite`) is real PostgreSQL compiled to WASM, around 3 MB gzipped, and runs in the browser. It gives exact Postgres semantics and error messages with no simulator to maintain.

## Constraint that shapes the design
Browsers block `fetch()` of `.wasm`/`.data` files and ES-module imports from `file://` pages. Opening `dist/lesson-02.html` by double-click therefore **cannot** load PGlite from `node_modules`. Pick one, test it and record the choice in KIT-README:

1. **Local server (preferred; normal dev workflow).** Add `package.json` with `@electric-sql/pglite` and serve the lessons on `http://localhost` with `npm run lessons`. A tiny static server or Vite is enough; it should serve `node_modules/@electric-sql/pglite/dist/` (or a copied `dist/vendor/pglite/`).
   - Works offline after `npm install`.
   - localStorage is per-origin, so Lesson 01 progress saved under `file://` won't carry over. That's acceptable.
2. **Fully offline single file.** Inline PGlite's JS, `.wasm` and `.data` as base64 and pass them to `PGlite.create` via its `wasmModule` / `fsBundle` options.
   - Verify that those option names exist in the installed version.
   - Measure the resulting HTML size and cold-start time.

## Implementation outline
- **A thin async adapter in `kit/kit.core.js`.**
  - Make `newDB()` async: create a PGlite instance, then `exec(seed)`.
  - Map results to the existing shape: `{type:'rows', columns, rows}` / `{type:'ok', msg, affected}`.
    - PGlite `exec()` returns per-statement results with `fields`, `rows` and `affectedRows`.
    - Rebuild psql-style status lines (`INSERT 0 1`, `UPDATE 2`) from the statement keyword plus `affectedRows`.
  - Labs need a fresh DB per Run/Submit. Measure PGlite startup.
    - If it's slow, keep one instance per lab and wrap each run in `BEGIN … ROLLBACK`, or snapshot with `dumpDataDir`/`loadDataDir`.
- **Graders.**
  - Make `makeLab`, `gradeSelect`, `gradeState`, `renderOut` and the playground async.
  - Keep MiniSQL's `compareResults` logic: move it into core, independent of the engine.
- **Engine-backed vizzes.** Lesson 01's visualizations read synchronously from `BASE` (MiniSQL). Either keep MiniSQL only for Lesson 01 (`LESSON.engine: 'minisql'`), or prerender viz data from the seed. Don't break Lesson 01.
- **Smoke test.** It must wait for PGlite readiness, e.g. a `window.__dbReady` promise.
- **Docs.** Update `KIT-README.md` §7 (engine), §3 (workflow) and the build instructions.

## Then: Lesson 02, "Creating and Populating a Database" (chapter 2)
Teach it in PostgreSQL:
- types: text/varchar, numeric, integer family, boolean, date/timestamp/timestamptz
- identity vs serial
- `CREATE TYPE … AS ENUM`
- the book's `person` / `favorite_food` design, translated to PG
- CREATE TABLE and ALTER TABLE
- INSERT … RETURNING
- what bad statements look like in PG: duplicate keys, FK violations, bad values, bad dates

Add a setup section: install Postgres on macOS natively (Postgres.app or `brew install postgresql@17`), connect with `psql`, and pick a GUI (DBeaver or TablePlus). Include a first "Run it for real" exercise. A Docker install path is optional, since Docker Hub access may be unreliable from Ali's location.
