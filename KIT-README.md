# SQL Lesson Kit — read this first

Context for building Ali's interactive SQL lessons. The source book is *Learning SQL*, 3rd ed. (Beaulieu). Each lesson is one self-contained HTML deck, styled after `scale-to-millions.html`. **Lesson NN = book chapter NN.**

## 1. Who and what

- **Learner.** Ali is a senior frontend engineer (React/Next.js/TS) who is new to databases. The goal is senior full-stack level.
- **Communication.** He wants direct, specific, data-grounded explanations. Skip the beginner fluff.
- **Length.** Each lesson takes about 15–20 minutes including practice, usually 20–28 slides.
- **Depth.** Cover the book's chapter fully and **only** that chapter, at the book's pace. No advance concepts from later chapters: if the chapter mentions one in passing, mention it as briefly and point to the chapter that covers it. The one allowed addition is the "In the book (MySQL)" note where PostgreSQL syntax differs, and short frontend analogies. Practice must be answerable from the chapter alone and only moderately hard.
- **Practice that forces doing.** Put about 5 checkpoints between concepts and about 3 SQL labs near the end (Lesson 01 has 5 + 3), for a total of 100 points.
  - A checkpoint gates the next slide until it is submitted or skipped.
  - Answers, explanations and reference solutions appear only after submission.
- **Dialect: PostgreSQL (decided).** Ali is aiming for full-stack TypeScript / AI Product Engineer, so lessons 02+ teach PostgreSQL.
  - Set `dialect: 'postgres'` in every config from Lesson 02.
  - Translate the book's MySQL examples to PostgreSQL. Show the book's version in an "In the book (MySQL)" note wherever the syntax or behavior differs.
  - Use the pagila (PostgreSQL Sakila) schema where the book uses sakila.
  - Lesson 01 stays `dialect: 'mysql'`. It's conceptual, and a note on its landscape slide explains the switch.
- **Where the two differ, slow down and teach it.** Spend real time on the PostgreSQL-specific points:
  - case-sensitive comparisons and `ILIKE`
  - identity and serial columns instead of AUTO_INCREMENT
  - `boolean`, `text`, `timestamptz`, and `CREATE TYPE … AS ENUM`
  - `RETURNING`
  - `||` for concatenation and `::` casts
  - UPDATE reporting matched rows rather than changed rows
  - READ COMMITTED as the default isolation level (Ch 12)
  - GIN, GiST and partial indexes (Ch 13)
  - `pg_catalog` alongside `information_schema` (Ch 15)

## 2. Files

| File | Role | Edit per lesson? |
|---|---|---|
| `kit.pg.js` | PGlite driver: loads real PostgreSQL (WASM), snapshots, statement splitting, psql-style results and tags, `\dt` / `\d`, schema introspection (see §7) | Rarely |
| `kit.engine.js` | **Legacy** MiniSQL simulator. Used only by lessons with `engine: 'minisql'` (Lesson 01) | No (frozen) |
| `kit.core.js` | Runtime: utils, highlighting, driver selection, state/scoring, deck + gating, tables, checkpoint parts, editor, playground, labs, graders, results, `boot()` | Rarely |
| `kit.style.css` | Theme (dark default, light via system or toggle), every component class | Append only |
| `kit.shell.html` | Head, fonts, progress bar, HUD, toast; placeholders `{{TITLE}} {{ID}} {{TOTAL}} {{STYLE}} {{SLIDES}} {{SCRIPT}}` | No |
| `kit.build.py` | Assembles one HTML file (`--inline` embeds PGlite for `file://`) | No |
| `kit.smoke_test.py` | Headless check: waits for the DB, JS errors, gate/item consistency, screenshots, contact sheets | No |
| `kit.play_test.py` | Plays every lab: reference solution, wrong answer, broken SQL | No |
| `tests/` | `l99.*` fixture lesson for the PGlite path and `pg_playground_test.py` (real-Postgres behaviour through the UI) | Add cases with new driver features |
| `../package.json`, `../scripts/` | `@electric-sql/pglite` dependency, `npm run lessons` (dev server), `npm run bundle:pglite` (for `--inline`) | No |
| `kit.test_engine.js` | `node kit.test_engine.js seed.sql`, an ad-hoc MiniSQL probe (MySQL mode) | Frozen |
| `kit.test_engine_pg.js` | `node kit.test_engine_pg.js`, the MiniSQL PostgreSQL-dialect suite (all lines must PASS). Legacy; only guards the frozen simulator | Frozen |
| `lNN.config.js` | `const LESSON = {...}` (§3) | **Write** |
| `lNN.seed.sql` | The lesson's database. Optional: falls back to the newest earlier `lMM.seed.sql` or to `seedFile` | Write if the DB changes |
| `lNN.slides.html` | `<section class="slide">…` blocks only | **Write** |
| `lNN.viz.js` | Custom animated diagrams (optional) | **Write** |
| `lNN.content.js` | `makeCheckpoint(...)`, `makePlayground(...)`, labs | **Write** |

`l01.*` is the complete reference lesson. Copy its patterns.

## 3. Fast workflow for a new lesson

One-time setup (from the repo root):

```bash
npm install                                   # @electric-sql/pglite (+ esbuild for --inline)
pip install playwright pillow && playwright install chromium   # smoke + play tests (or rely on system Chrome)
```

Per lesson:

```bash
# 1. Read the chapter: book PDFs are ordinary PDFs -> pdftotext -layout "book/N. Chapter N.pdf" /tmp/chN.txt
# 2. Write lessons/lNN.config.js, lNN.seed.sql (if needed), lNN.slides.html, lNN.viz.js, lNN.content.js
python3 kit/kit.build.py NN --dirs lessons kit --out dist/lesson-NN-<slug>.html
npm run lessons                                # http://localhost:8080/  (leave running)
python3 kit/kit.smoke_test.py http://localhost:8080/lesson-NN-<slug>.html --dark   # then view shots/sheet*.png
python3 kit/kit.smoke_test.py http://localhost:8080/lesson-NN-<slug>.html --mobile
python3 kit/kit.play_test.py  http://localhost:8080/lesson-NN-<slug>.html          # every lab: right, wrong, broken
# 3. Play the checkpoints by hand or with a small Playwright script (answer, submit, read state.res[id].score)
```

**How lessons are delivered (decided, measured with PGlite 0.5.8 in Chrome):**

| | Local server (default) | `--inline` single file |
|---|---|---|
| Command | `npm run lessons`, open `http://localhost:8080/…` | `npm run bundle:pglite` once, then `kit.build.py NN --inline` |
| Lesson file | about 0.2 MB (engine files are shared, cached once) | about 8 MB (gzip + base64 wasm/data/initdb inside) |
| Deck ready after navigation (start, seed, snapshot, introspect) | about 1.0 s | about 1.2 s |
| Works by double-click (`file://`) | no: the page shows how to start the server | yes |
| localStorage progress | per origin (`localhost:8080`); Lesson 01 progress saved under `file://` does not carry over | per file path |

Use the server for everything day to day. Use `--inline` only to hand someone a lesson. Lesson 01 (`engine: 'minisql'`) needs neither: it works by double-click.

Notes:
- The server serves `dist/` and maps `/vendor/pglite/*` straight to `node_modules/@electric-sql/pglite/dist/`. There is no copy step.
- `PORT=9000 npm run lessons` changes the port.
- Script order inside the HTML: [MiniSQL engine, if `engine: 'minisql'`] → config → kit.pg.js → core → (after the database is ready) viz → content → `boot()`.
- `window.__dbReady` resolves once the database is up and the deck is built. Tests await it.
- Without a Playwright browser, the test scripts fall back to the system Chrome (`channel='chrome'`).

## 4. `lNN.config.js` contract

```js
const LESSON = {
  id: '02',                                   // two digits; localStorage key sql-lesson-02:v1
  title: 'Lesson 02 · Creating and Populating a Database — Learning SQL',
  chapter: 2,
  dialect: 'postgres',                        // lessons 02+; 'mysql' only for Lesson 01
  // engine: 'minisql',                       // omit for the default, 'pglite' (real PostgreSQL). Only Lesson 01 uses 'minisql'.
  seed: `__SEED__`,                           // build injects lNN.seed.sql here
  // seedFile: 'kit.seed-pagila.sql',          // optional explicit seed (lessons 03+)
  db: {
    label: 'pagila database',                 // schema-panel title, reset message
    seedNote: 'How it was created',           // <details> label over the seed SQL
    tables: ['actor', 'film', ...],           // tables shown in the schema panel
    tableColor: { actor: 'var(--cyan)', ... },// colors table cards (--tc) and FK hints
    tableClass: {},                           // legacy; l01 uses t-customer etc.
  },
  items: {                                    // EVERY graded item; order = results order
    cp1: { max: 10, label: 'Data types', review: 's-types' },   // review = slide id or index
    lab1: { max: 10, label: 'Lab 1 · CREATE TABLE', review: 's-create' },
  },                                          // ids must start with cp / lab (drives "n of N")
  takeaways: ['...', '...'],                  // HTML strings, 5–7
  next: 'One-paragraph teaser of the next lesson (HTML ok).',
};
```

The HUD and results slide compute the total from `items[*].max`.

## 5. Slide authoring (`lNN.slides.html`)

### Skeleton

```html
<section class="slide" id="s-types" data-sec="2 · Data types">   <!-- data-sec = HUD label -->
 <div class="wrap">                       <!-- .wrap.top = align top (dense/scrolling slides) -->
  <p class="kicker" style="--acc:var(--violet)">2.1 · Character data</p>
  <h2 class="title wide">One-line claim, not a topic name</h2>
  <p class="lead">Short framing paragraph.</p>
  <div class="split">  ...  </div>        <!-- .split / .split.r (wider right) / .grid2 / .grid3 / .stack / .row -->
  <p class="stephint">→ reveals the next part</p>
 </div>
</section>
```

### Building blocks

- **Cards.** `.card` (inside: h3, p, ul). Use `.card.accent` with `style="--c:var(--violet)"` for emphasis.
- **Notes.** Every note is `<div class="note X"><span class="tag">Label</span><span>…</span></div>`, where X sets its role:
  - `.fe` (cyan), tagged "You know this": a frontend analogy such as React keys, Redux normalization or the reconciler. Use at least one per major concept.
  - `.beyond` (violet), tagged "Postgres" (or "Senior note" for a one-line pointer): use it only for PostgreSQL-vs-book differences and pointers to the chapter that covers a mentioned topic, never to teach later chapters' material early.
  - `.warn` (pink), tagged "Classic" or "The catch": a pitfall.
  - `.note` (no modifier), tagged "In the book (MySQL)": shows the book's MySQL syntax next to the PostgreSQL version taught on the slide. Use it wherever the book's code differs.
- **Progressive reveal.** Put `data-step` on any element; →/Space reveals the steps in order before the deck advances.
- **Code.** `<pre class="code">` holds SQL. Highlight it at runtime with `hlSQL(src)` or `hlJS(src)` (as l01 does), or hand-mark spans with `.k` and `.hl`. Use `<code class="i">` for inline code.
- **Tables.**
  - `renderTable(name, {cols, rows, compact, caption, keyed})` returns a `.tblbox` built from the seeded DB. PK headers get ◆ and FK headers get ↗.
  - For a static table, use `.tbl` inside `.tblbox`.
- **Diagrams.**
  - Hand-written SVG: `<svg class="dg">` with `.nd rect/text`, `.ln` and `.lbl`. Highlight with `.on`.
  - Interactive viz: put it in `<div class="vizbox">`, with buttons in `.vizbar` and a caption in `.vizmsg`.
- **Step lists.** Use `<ol class="steps"><li><span class="n">1</span><span class="t">text</span></li>`. Keep the `.t` wrapper; flex breaks without it. Use `.cur` and `.done` for state.
- **Chips.** `<span class="chip" style="--c:var(--amber)"><i></i>text</span>`.
- **Title slide.** `.hero` contains `.sub`, chips, a code preview and `.how`, which explains the →/Space and gating rules.
- **Gated slide** (one per item):
  ```html
  <section class="slide" data-sec="Checkpoint 1" data-gate="cp1"><div class="wrap top"><div id="cp1"></div></div></section>
  ```
- **Playground slide.** Needs `#playground`, `#pgpresets` (class `presets`) and `#pgschema` containers. See l01 slide 19.
- **Results slide.** The last slide must contain `<div id="results"></div>`.

### Tokens

- **Colors:** `--cyan --violet --pink --lime --amber --green --red`.
- **Surfaces and text:** `--panel --panel2 --line --line2 --text --soft --muted`.
- **Motion:** `--ease`.
- **Fonts:** Space Grotesk (titles), Inter (body), JetBrains Mono (code and labels).

### Rules

- Always use theme tokens, never raw colors, so both themes work.
- Keep slides at 1440×900 or smaller, or use `.wrap.top` and let the slide scroll.
- Test on mobile (390px). Grid children already have `min-width:0`.

### Viz pattern (`lNN.viz.js`)

Write an IIFE per diagram: `(function name(){ const root=$('#myviz'); ... })();`.

- Helpers from core: `$ $$ h() esc sleep reduced T(name) fmt renderTable hlSQL toast`, plus `onEnter[slideIndex] = fn` (runs when that slide becomes active).
- Respect `reduced` (prefers-reduced-motion).

## 6. Practice (`lNN.content.js`)

### Checkpoints

```js
makeCheckpoint({ id: 'cp1', n: 1, title: '...', intro: 'optional HTML', parts: [ /* parts */ ] });
```

Part types. Each part has `title` (HTML), `pts`, optional `hint` and `html`, and `explain`, which is shown after submit.

- `order`: `{ type:'order', items:[correct order], display:[shuffled indices] }`. Scores per item in the right position.
- `classify`: `{ type:'classify', options:['A','B'], rows:[{ q:'html', a:0 }] }`.
- `columns`: `{ type:'columns', options:['PK','FK','—'], tables:[{ name, cols:[['col', answerIdx]] }] }`. Uses the seeded DB rows.
- `mcq`: `{ type:'mcq', multi?:true, opts:[{ t:'html', ok:1 }] }`. With `multi`, each wrong pick cancels a right one.
- `text`: `{ type:'text', accept:['answer', ...] | /regex/, show:'shown answer', placeholder }`. Comparison ignores case, whitespace and a trailing `;`.

Scores are rounded to 0.5. Add new part types to the `PART` map in core (contract: `{el, complete, get, set, grade(a)→{score,fb}, lock(a)}`), and add their CSS to the end of `kit.style.css`.

### Playground

```js
makePlayground({ root:'#playground', presets:'#pgpresets', schema:'#pgschema', start:'SELECT ...', items:[[label, sql, danger?]] })
```

State persists between runs until the learner clicks Reset.

### Labs

```js
const LAB1 = { id:'lab1', n:1, pts:10, title, task:'html', starter:'-- Lab 1\n', ref:'SQL', explain:'html',
  setup?:'SQL run before the learner's code', after?:'SELECT shown after Run', afterLabel?, kind?:'dml' };
LAB1.grade = gradeSelect(LAB1, { superset: 4 });   // SELECT labs
// LAB2.grade = gradeState(LAB2, { stateOnly: 0.6 }); // DML/DDL labs; needs LAB2.check = 'SELECT ... ORDER BY ...'
[LAB1, LAB2].forEach(makeLab);
```

- **Fresh database.** Every Run or Submit executes against a fresh copy of the seeded database plus `setup`. With PGlite that is a restore of a data-dir snapshot (about 0.1 s), taken once per distinct `setup`; the instance is closed when the operation ends. Database work is queued, one task at a time, and the lab's buttons lock while it runs.
- **Blanks.** A `____` in `starter` makes it a fill-in-the-blanks lab; Run and Submit refuse until every blank is replaced.
- **Errors.** Submissions with SQL errors are rejected (not graded), so the learner can fix them.
- **RETURNING results.** An `INSERT/UPDATE/DELETE … RETURNING` result is `type:'rows'` with `msg` and `affected`. It counts as a result set for `gradeSelect` and as DML for `gradeState`.
- **`gradeSelect`.** The last result set is compared to the reference result set:
  - exact match: full points
  - right rows but wrong columns: 60%
  - all expected rows plus extras: the `superset` points
  - anything else: 0
  - Row order matters only if the reference has `ORDER BY`.
- **`gradeState`.** Compares the `check` query output after the learner's script with the output after the reference, and compares the total rows affected by INSERT/UPDATE/DELETE.
- **Custom graders.** Write `async ({d, res, error}, fresh) => ({score, verdict})`. Everything database-related is async: `await d.exec(sql)` returns the results array, and `await fresh()` returns a new seeded database (plus `setup`) that is closed for you when grading ends. See LAB3 in l01.
- **`kind:'dml'`** hides the result-set comparison in feedback.

## 7. Engines

Lessons grade SQL with one of two engines behind the same async driver interface (`create(setup)` → `{exec(sql), close()}`; `init()` → schema metadata for the UI):

- **PGlite** (default, `kit.pg.js`): real PostgreSQL 17 compiled to WASM. Exact semantics and error messages, including integer division, GROUP BY, subqueries, CTEs, window functions, jsonb, EXPLAIN and extensions. **Use it for Lesson 02 onward. There is no simulator to extend.**
- **MiniSQL** (`engine: 'minisql'`, `kit.engine.js`): the legacy hand-written simulator. Lesson 01 only. Frozen: do not extend it.

### PGlite driver (`kit.pg.js`)

- **Statements run one at a time**, like psql. A splitter handles quotes, `$$` blocks and comments. When a statement fails, the results of the earlier statements are kept and shown above the error (`error.results`).
- **Result shape** (same as MiniSQL, so the UI and graders are engine-agnostic): `{type:'rows', columns, colTypes, rows, text}` or `{type:'ok', msg, affected, text, flag}`. `INSERT/UPDATE/DELETE … RETURNING` is a `rows` result that also carries `msg` and `affected`. `text` is the statement; `gradeState` uses it to count affected rows.
- **psql-style tags** are rebuilt from the statement: `INSERT 0 1`, `UPDATE 2`, `DELETE 1`, `SELECT 3`, `CREATE TABLE`, `ALTER TABLE`, `DROP TYPE`, `BEGIN`, … `UPDATE`/`DELETE` without WHERE sets `flag:'nowhere'`.
- **Values.** `date`, `timestamp`, `timestamptz`, `numeric` and `bigint` come back as the exact text Postgres prints (`3.50`, `2026-01-05`). `integer`, `boolean`, `jsonb` and arrays are parsed. Numeric types right-align.
- **Errors** are PostgreSQL's own, joined as `message — DETAIL` plus `Hint: …`.
- **psql meta-commands:** `\dt`, `\d` and `\d <table>` only. Anything else throws a message pointing to real psql.
- **Not reproduced:** NOTICE/WARNING output (for example the ROLLBACK-without-transaction warning), `\timing`, `COPY` from files.
- **Snapshots.** `init()` seeds once, runs `CHECKPOINT`, and dumps the data dir. Each `create()` restores it. **The `CHECKPOINT` is required:** an un-checkpointed dump restores like crash recovery and sequences jump 32 ahead (the first identity value would be 34, not 4). `tests/pg_playground_test.py` guards this.
- **Schema metadata.** `init()` reads `LESSON.db.tables` from `information_schema` / `pg_catalog` into `BASE` (`T(name)` → `{cols, pk, fks, rows}`) for `renderTable`, the schema panel and `columns` checkpoints. Tables that do not exist in the seed are skipped, so a lesson that starts from an empty database (Lesson 02) can list tables it creates later and use `renderTable` only on tables that exist.
- **Assets.** Server build: `import()` of `./vendor/pglite/index.js` plus fetches of `pglite.wasm`, `pglite.data`, `initdb.wasm`. Inline build: `__PG_INLINE` (gzip+base64) and the `PGliteMod` bundle; the options used are `pgliteWasmModule`, `initdbWasmModule` and `fsBundle`.
- **Memory.** Each instance is a full Postgres. Labs close theirs after every run; the playground keeps one open until Reset.

### MiniSQL engine (`kit.engine.js`) — legacy, Lesson 01 only

The sections below describe the frozen simulator. They do not apply to PGlite lessons.

### API

- `MiniSQL.create(seedSql, { dialect: 'postgres' | 'mysql' })` returns a database object `db`. The default dialect is `'mysql'`. Core calls `newDB()`, which uses `LESSON.dialect`.
- `db.exec(sql)` returns an array of results:
  - `{type:'rows', columns, colTypes, rows}`. With RETURNING it also carries `msg` and `affected`.
  - `{type:'ok', msg, affected, text, flag}`, where `flag:'nowhere'` marks a DELETE/UPDATE without WHERE.
- `db.tables[name]` is `{cols:[{name,type,len,scale,autoInc,...}], pk:[], fks:[{cols,refTable,refCols}], checks:[], rows:[{col:val}]}`. `db.types` holds PostgreSQL enums.
- `MiniSQL.compareResults(got, exp)` returns `{equal, reason, missing, extra, rowsRight}`. It is case-sensitive in PostgreSQL mode.
- `MiniSQL.formatValue(v, col)`.

### Both dialects

- **DDL:** CREATE TABLE with PK (incl. compound), FK (table-level or inline `REFERENCES t [(col)]`, which defaults to the target's PK), NOT NULL, UNIQUE and DEFAULT; DROP TABLE [IF EXISTS].
- **DML:** INSERT (with or without a column list, multi-row, `DEFAULT` as a value), UPDATE, DELETE. Each statement is atomic.
- **Queries:** SELECT [DISTINCT] with expressions and aliases; INNER/LEFT/CROSS JOIN … ON; WHERE with AND/OR/NOT, comparison operators, arithmetic, BETWEEN, IN (list), LIKE, IS [NOT] NULL; ORDER BY (column, alias or position; ASC/DESC); LIMIT/OFFSET; `CAST(x AS type)`; `current_date` and `current_timestamp`.
- **Functions:** upper, lower, length, char_length, concat, concat_ws, trim, abs, round, coalesce, ifnull, nullif, greatest, least, left, right, replace, substring/substr, now, curdate.
- **Transactions:** BEGIN / START TRANSACTION, COMMIT, ROLLBACK (snapshot-based).

### PostgreSQL mode (`dialect: 'postgres'`)

- **Identifiers and strings.** Unquoted identifiers fold to lowercase. `"double quotes"` are identifiers and keep their case; backticks are an error with a hint. There are no backslash escapes in strings, and `#` is not a comment.
- **Case-sensitive strings.** `=`, LIKE, ORDER BY, UNIQUE and PK checks are all case-sensitive. `ILIKE` is supported.
- **Operators.** `||` concatenates (NULL in, NULL out) and `::type` casts.
- **Types.** smallint/integer/bigint (int2/4/8), numeric(p,s) with overflow checks, real, double precision, varchar(n), character varying, text, boolean (`true`/`false`; an integer is rejected), date, timestamp, timestamptz, and `CREATE TYPE x AS ENUM (...)` (labels are case-sensitive).
- **Auto-numbering.** `serial`, `bigserial` and `smallserial`, plus `GENERATED ALWAYS | BY DEFAULT AS IDENTITY`. ALWAYS rejects explicit values.
- **CHECK constraints** at column or table level.
- **`RETURNING *` or expressions** on INSERT, UPDATE and DELETE.
- **psql-style status lines:** `INSERT 0 1`, `UPDATE 2`, `DELETE 1`, `CREATE TABLE`, `BEGIN`, `COMMIT`, `ROLLBACK`, and the no-transaction ROLLBACK warning. **UPDATE reports matched rows.**
- **psql meta-commands.** `\dt` lists tables and `\d table` describes one. `SHOW TABLES` and `DESCRIBE` throw a teaching hint.
- **PostgreSQL error messages:**
  - `duplicate key value violates unique constraint "t_pkey" — Key (id)=(1) already exists.`
  - FK messages, both `insert or update on table` and `update or delete on table`
  - `null value in column "x" of relation "t" violates not-null constraint`
  - `column "x" does not exist`
  - `relation "t" does not exist`
  - `column reference "x" is ambiguous`
  - `value too long for type character varying(n)`
  - `invalid input syntax for type …`
  - `syntax error at or near "…"`
- **MySQL-isms throw hints:** AUTO_INCREMENT, UNSIGNED, inline ENUM, datetime, tinyint, UPDATE/DELETE … LIMIT, and backticks.

### MySQL mode (Lesson 01)

- Case-insensitive strings, backticks, AUTO_INCREMENT, inline ENUM, SHOW TABLES / DESCRIBE.
- MySQL messages. UPDATE reports changed rows.
- `||` means OR, and RETURNING, ILIKE and `::` throw hints.

### Not yet supported

These throw a friendly "arrives in Lesson N" error:

- GROUP BY/HAVING/aggregates (Lesson 8)
- UNION/INTERSECT/EXCEPT (6)
- subqueries (9)
- RIGHT/FULL/NATURAL joins and USING (10)
- ALTER/TRUNCATE/GRANT

Missing entirely:

- CASE (11), window functions (16), views (14), indexes and EXPLAIN (13)
- json/jsonb operators, arrays, sequences functions
- `ON CONFLICT`
- **PostgreSQL integer division** (`7/2` returns 3.5 here, but 3 in real PostgreSQL). Mention it in Lesson 07 and implement it there.

**Do not extend MiniSQL.** PGlite lessons get every feature for free. The "arrives in Lesson N" errors and the engine work listed in §8 no longer apply.

## 8. Roadmap (book chapter → lesson; PostgreSQL from 02)

The **Engine:** items and "Add …" entries below were written for MiniSQL and are obsolete; PGlite already supports all of them. Read the right-hand column as the PostgreSQL teaching focus only.

| Lesson | Chapter | PostgreSQL focus / engine work |
|---|---|---|
| 01 | A Little Background | ✅ done; bank DB (Figure 1-3); MySQL-mode sandbox |
| 02 | Creating and Populating a Database | PG types (text, varchar, numeric, boolean, date, timestamptz), identity vs serial, CREATE TYPE enum, the book's `person`/`favorite_food` in PG, RETURNING, PG error messages. **Engine:** add ALTER TABLE (ADD/DROP COLUMN, ADD CONSTRAINT) |
| 03 | Query Primer | Switch to **pagila** (PG Sakila) via a one-time `kit.seed-pagila.sql` subset; `\dt` and `\d` |
| 04 | Filtering | Case sensitivity, ILIKE, NULL logic |
| 05 | Querying Multiple Tables | |
| 06 | Working with Sets | Add UNION/INTERSECT/EXCEPT |
| 07 | Data Generation, Manipulation, Conversion | PG string/date functions, `::` vs CAST, integer division, `to_char`, intervals |
| 08 | Grouping and Aggregates | Add GROUP BY/HAVING/aggregates, `string_agg` (vs MySQL group_concat), `FILTER` |
| 09 | Subqueries | Add subqueries, EXISTS |
| 10 | Joins Revisited | RIGHT/FULL/NATURAL, USING |
| 11 | Conditional Logic | CASE, COALESCE patterns |
| 12 | Transactions | MVCC, READ COMMITTED default, simulated two sessions |
| 13 | Indexes and Constraints | B-tree viz, EXPLAIN, GIN/GiST/partial, `ON CONFLICT` |
| 14 | Views | Views, materialized views |
| 15 | Metadata | information_schema + pg_catalog |
| 16 | Analytic Functions | Window functions |
| 17 | Working with Large Databases | Partitioning (PG declarative), sharding concepts |
| 18 | SQL and Big Data | |
| B1 | Beyond the book: JSONB | Operators `-> ->> @>`, GIN indexes |
| B2 | Beyond the book: pgvector | Embeddings, similarity search, RAG storage |
| B3 | Beyond the book: Postgres from TypeScript | node-postgres, Drizzle/Prisma, migrations, N+1, pooling |

**pagila subset (create once, in the Lesson 03 session).**
- Save it as `kit.seed-pagila.sql` and point later configs at it with `seedFile`.
- Keep it to a realistic, consistent subset of about 10–40 rows per table: actor, film, film_actor, category, film_category, language, customer, address, city, country, store, staff, inventory, rental, payment.
- Use the real pagila column names and types.

## 9. Quality checklist before shipping

- `smoke_test`: static checks report `ok`; no JS errors; desktop light, desktop dark and mobile sheets all reviewed. Watch for overflow, `null` text and broken glyphs.
- Build children with `h(...)`. Never pass `null` to native `.append`; it prints "null".
- Avoid rare glyphs such as ⚿. They render as tofu boxes. Use ◆ ↗ → ✓ ✕.
- Play through every checkpoint and lab with a correct answer (full points) and a wrong answer (partial or 0 with a useful verdict).
- Run `node kit/kit.test_engine_pg.js` if you touch `kit.engine.js` (you should not), and keep `node kit/kit.test_engine.js lessons/l01.seed.sql` output stable (Lesson 01 runs in MySQL mode).
- After touching `kit.pg.js` or `kit.core.js`: build and run `kit/kit.play_test.py` on Lesson 01 and on the fixture (`kit/tests/l99.*`), and `kit/tests/pg_playground_test.py`. All must PASS.
- Check that `items` maxima sum to 100 and that the title-slide chip matches ("N checkpoints · 100 points").
- Send a short reply: what's covered, anything the chapter mentioned that you deferred, anything Ali should decide.
