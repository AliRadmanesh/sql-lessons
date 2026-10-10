# sql-lessons — context for Claude Code

Interactive SQL lessons for **Ali**: a senior frontend engineer (React/Next.js/TypeScript) learning databases from scratch toward senior full-stack / AI product engineer level. He prefers direct, specific, data-grounded explanations, without hedging or filler.

Source book: *Learning SQL*, 3rd ed. (Alan Beaulieu). Lesson NN = chapter NN. Chapter PDFs live in `book/`; they are ordinary PDFs on this Mac, so read one with `pdftotext -layout "book/N. Chapter N.pdf" /tmp/chN.txt` (poppler: `brew install poppler`) or open it directly. (The older sandbox copies were zips of per-page `N.txt` + `N.jpeg`; ignore that format.)

## Read first
- `KIT-README.md` is the full contract. It covers the lesson format, the config/slide/checkpoint/lab APIs, the engine, the roadmap and the quality checklist.
- `NEXT-TASK.md` is the current task.

## Decisions (do not relitigate)
- **Dialect: PostgreSQL** from Lesson 02. Lesson 01 stays MySQL-mode; it's conceptual. Wherever the book's MySQL syntax differs, show it in an "In the book (MySQL)" note.
- **Pace: a lesson covers only its own chapter** (decided by Ali). Follow the book's sections in order and at its pace. Do not teach concepts the book introduces later (joins in depth, indexes, transactions, EXPLAIN, ORMs, normal forms, etc.). If the chapter mentions one in passing, mention it just as briefly and point to the chapter that covers it. Practice (checkpoints and labs) must be answerable from the chapter alone and only moderately hard. Frontend analogies are fine; they illustrate, they don't add concepts.
- **Lesson format:** one HTML deck per chapter, styled after `reference/scale-to-millions.html`, 15–20 min including practice. About 5 gated checkpoints between concepts and about 4 SQL labs, totalling 100 points. Each checkpoint gates the next slide until it is submitted or skipped. Answers and explanations appear only after submit. Progress is kept in localStorage.
- **Real PostgreSQL alongside the lessons.** Ali installs Postgres natively on macOS and uses `psql` plus a GUI (DBeaver or TablePlus). Every lesson ends with a "Run it for real" section against a local pagila database. From Lesson 12 (transactions, indexes, partitioning, JSONB, pgvector, TS integration), the real database is primary.
- **In-file graded labs run on PGlite** (real Postgres compiled to WASM) from Lesson 02. MiniSQL (`kit.engine.js`) is frozen and used only by Lesson 01 (`engine: 'minisql'`); never extend it.
- **Delivery:** lessons are served by `npm run lessons` (http://localhost:8080). `kit.build.py NN --inline` embeds PGlite (about 8 MB) for double-click `file://` use. Measurements and the reasoning are in KIT-README §3.

## Layout
```
kit/       kit.core.js kit.pg.js (PGlite driver) kit.style.css kit.shell.html kit.build.py kit.smoke_test.py kit.play_test.py kit.engine.js (MiniSQL, legacy) tests/
scripts/   serve.mjs (npm run lessons)  bundle-pglite.mjs (for --inline)
lessons/   lNN.config.js lNN.seed.sql lNN.slides.html lNN.viz.js lNN.content.js
dist/      built lessons (lesson-NN-<slug>.html)
book/      chapter PDFs             reference/  scale-to-millions.html
```

## Commands
- Setup: `npm install`; for tests `pip install playwright pillow` (the scripts fall back to system Chrome if no Playwright browser is installed).
- Build: `python3 kit/kit.build.py NN --dirs lessons kit --out dist/lesson-NN-<slug>.html` (add `--inline` after `npm run bundle:pglite` for a standalone file).
- Serve: `npm run lessons`, then open http://localhost:8080/.
- Smoke test: `python3 kit/kit.smoke_test.py http://localhost:8080/lesson-NN-<slug>.html [--dark|--mobile]`, then look at `shots/sheet*.png`.
- Labs: `python3 kit/kit.play_test.py <url-or-file>` plays every lab with the reference, a wrong answer and broken SQL.
- Driver regression: build the fixture (`python3 kit/kit.build.py 99 --dirs kit/tests kit --out dist/lesson-99.html`), then `python3 kit/tests/pg_playground_test.py`.
- MiniSQL tests (only if `kit.engine.js` is touched): `node kit/kit.test_engine_pg.js` (all lines must PASS).

## Working rules
- Verify every lesson in a real browser before calling it done:
  - no console errors
  - desktop light/dark and mobile screenshots reviewed
  - every checkpoint and lab played with a right answer and a wrong one
- Keep the kit generic. Lesson-specific code goes in `lessons/`.
- Tell Ali plainly what was verified and what wasn't.
