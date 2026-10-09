# SQL Lesson Kit — read this first

Context for building Ali's interactive SQL lessons. The source book is *Learning SQL*, 3rd ed. (Beaulieu). Each lesson is one self-contained HTML deck, styled after `scale-to-millions.html`. **Lesson NN = book chapter NN.**

## 1. Who and what

- **Learner.** Ali is a senior frontend engineer (React/Next.js/TS) who is new to databases. The goal is senior full-stack level.
- **Communication.** He wants direct, specific, data-grounded explanations. Skip the beginner fluff.
- **Length.** Each lesson takes about 15–20 minutes including practice, usually 20–28 slides.
- **Depth.** Cover the book's chapter fully, plus "beyond the book" notes where industry practice differs (PostgreSQL, ORMs, production habits).
- **Practice that forces doing.** Put about 5 checkpoints between concepts and about 3–4 SQL labs near the end, for a total of about 100 points.
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
| `kit.engine.js` | MiniSQL, an in-browser MySQL-flavored SQL engine (see §6) | Only to add features |
| `kit.core.js` | Runtime: utils, highlighting, state/scoring, deck + gating, tables, checkpoint parts, editor, playground, labs, graders, results, `boot()` | Rarely |
| `kit.style.css` | Theme (dark default, light via system or toggle), every component class | Append only |
| `kit.shell.html` | Head, fonts, progress bar, HUD, toast; placeholders `{{TITLE}} {{ID}} {{TOTAL}} {{STYLE}} {{SLIDES}} {{SCRIPT}}` | No |
| `kit.build.py` | Assembles one HTML file | No |
| `kit.smoke_test.py` | Headless check: JS errors, gate/item consistency, screenshots, contact sheets | No |
| `kit.test_engine.js` | `node kit.test_engine.js seed.sql`, an ad-hoc engine probe (MySQL mode) | Add cases |
| `kit.test_engine_pg.js` | `node kit.test_engine_pg.js`, the PostgreSQL-dialect test suite (all lines must PASS) | Add cases with new features |
| `lNN.config.js` | `const LESSON = {...}` (§3) | **Write** |
| `lNN.seed.sql` | The lesson's database. Optional: falls back to the newest earlier `lMM.seed.sql` or to `seedFile` | Write if the DB changes |
| `lNN.slides.html` | `<section class="slide">…` blocks only | **Write** |
| `lNN.viz.js` | Custom animated diagrams (optional) | **Write** |
| `lNN.content.js` | `makeCheckpoint(...)`, `makePlayground(...)`, labs | **Write** |

`l01.*` is the complete reference lesson. Copy its patterns.

## 3. Fast workflow for a new lesson

```bash
mkdir -p /home/claude/kit && cp /mnt/project/kit.* /mnt/project/l0*.* /home/claude/kit/ 2>/dev/null; cd /home/claude/kit
# 1. Read the chapter: project PDFs are zips of per-page N.txt + N.jpeg -> unzip -o X.pdf -d /home/claude/chNN
# 2. Write lNN.config.js, lNN.seed.sql (if needed), lNN.slides.html, lNN.viz.js, lNN.content.js
python3 kit.build.py NN --out lesson-NN.html
python3 kit.smoke_test.py lesson-NN.html --dark      # then view shots/sheet*.png
python3 kit.smoke_test.py lesson-NN.html --mobile
# 3. Play through checkpoints/labs with Playwright (pattern: answer, submit, read state.res[id].score)
cp lesson-NN.html /mnt/user-data/outputs/lesson-NN-<slug>.html  # then present_files
```

Script order inside the HTML is: engine → config → core → viz → content → `boot()`.

Chromium for Playwright is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. The sandbox has no network, so Google Fonts return 403. That is expected; fonts fall back.

## 4. `lNN.config.js` contract

```js
const LESSON = {
  id: '02',                                   // two digits; localStorage key sql-lesson-02:v1
  title: 'Lesson 02 · Creating and Populating a Database — Learning SQL',
  chapter: 2,
  dialect: 'postgres',                        // lessons 02+; 'mysql' only for Lesson 01
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
  - `.beyond` (violet), tagged "Beyond the book", "Senior note" or "Postgres": industry or production practice.
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

- **Fresh database.** Every Run or Submit executes against a fresh `MiniSQL.create(SEED)` plus `setup`.
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
- **Custom graders.** Write `(r = {d, res, error}, fresh) => ({score, verdict})`. See LAB3 in l01.
- **`kind:'dml'`** hides the result-set comparison in feedback.

## 7. MiniSQL engine (`kit.engine.js`)

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

**Extend the engine in the lesson that teaches a feature.** Update that feature's "arrives in Lesson N" message, add cases to `kit.test_engine_pg.js`, and ship the updated `kit.engine.js`.

## 8. Roadmap (book chapter → lesson; PostgreSQL from 02)

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
- Run `node kit.test_engine_pg.js` after any engine change; every line must PASS. Keep `node kit.test_engine.js l01.seed.sql` output stable (Lesson 01 runs in MySQL mode).
- Check that `items` maxima sum to 100 and that the title-slide chip matches ("N checkpoints · 100 points").
- Send a short reply: what's covered, beyond-book additions, anything Ali should decide.
