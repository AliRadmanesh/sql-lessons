# Next task: Lesson 02, "Creating and Populating a Database" (chapter 2)

## Done: PGlite migration
In-file labs now run on PGlite (real PostgreSQL in WASM). Lesson 01 stays on MiniSQL (`engine: 'minisql'`) and still works by double-click. Details, measurements and the driver contract are in `KIT-README.md` §3 and §7.

Things to know before writing Lesson 02:
- Config: `dialect: 'postgres'`, no `engine` line (PGlite is the default).
- Everything database-related in graders is async: `await d.exec(sql)`, `await fresh()`. Built-in `gradeSelect` / `gradeState` already are.
- Lesson code runs only after the database is up, so `renderTable()` and `T()` work at the top level of `lNN.content.js`.
- Lesson 02 teaches CREATE TABLE, so its seed may be empty or partial. `LESSON.db.tables` entries that do not exist in the seed are skipped when reading the schema. Only call `renderTable` / `columns` checkpoints on tables the seed creates.
- Labs that build the schema themselves should use `kind: 'dml'` and `gradeState` with a `check` query against `information_schema` / `pg_catalog` or against the data itself. Real Postgres errors reach the learner unchanged.
- Not reproduced from psql: NOTICE/WARNING output and meta-commands other than `\dt`, `\d`, `\d <table>`.
- Dev loop: `npm run lessons`, build to `dist/`, smoke test and `kit.play_test.py` against the localhost URL.

## Lesson 02
Teach it in PostgreSQL:
- types: text/varchar, numeric, integer family, boolean, date/timestamp/timestamptz
- identity vs serial
- `CREATE TYPE … AS ENUM`
- the book's `person` / `favorite_food` design, translated to PG
- CREATE TABLE and ALTER TABLE
- INSERT … RETURNING
- what bad statements look like in PG: duplicate keys, FK violations, bad values, bad dates

Add a setup section: install Postgres on macOS natively (Postgres.app or `brew install postgresql@17`), connect with `psql`, and pick a GUI (DBeaver or TablePlus). Include a first "Run it for real" exercise. A Docker install path is optional, since Docker Hub access may be unreliable from Ali's location.

Follow the book chapter (`book/2. Chapter 2.pdf`; extract text with `pdftotext -layout`) and the checklist in `KIT-README.md` §9.
