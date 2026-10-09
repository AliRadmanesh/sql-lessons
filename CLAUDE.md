# sql-lessons — context for Claude Code

Interactive SQL lessons for **Ali**: a senior frontend engineer (React/Next.js/TypeScript) learning databases from scratch toward senior full-stack / AI product engineer level. He prefers direct, specific, data-grounded explanations, without hedging or filler.

Source book: *Learning SQL*, 3rd ed. (Alan Beaulieu). Lesson NN = chapter NN. Chapter PDFs live in `book/`; each "PDF" is really a zip of per-page `N.txt` + `N.jpeg`, so read it with `unzip -o X.pdf -d /tmp/chNN`.

## Read first
- `KIT-README.md` is the full contract. It covers the lesson format, the config/slide/checkpoint/lab APIs, the engine, the roadmap and the quality checklist.
- `NEXT-TASK.md` is the current task.

## Decisions (do not relitigate)
- **Dialect: PostgreSQL** from Lesson 02. Lesson 01 stays MySQL-mode; it's conceptual. Wherever the book's MySQL syntax differs, show it in an "In the book (MySQL)" note.
- **Lesson format:** one HTML deck per chapter, styled after `reference/scale-to-millions.html`, 15–20 min including practice. About 5 gated checkpoints between concepts and about 4 SQL labs, totalling 100 points. Each checkpoint gates the next slide until it is submitted or skipped. Answers and explanations appear only after submit. Progress is kept in localStorage.
- **Real PostgreSQL alongside the lessons.** Ali installs Postgres natively on macOS and uses `psql` plus a GUI (DBeaver or TablePlus). Every lesson ends with a "Run it for real" section against a local pagila database. From Lesson 12 (transactions, indexes, partitioning, JSONB, pgvector, TS integration), the real database is primary.
- **In-file graded labs move to PGlite** (real Postgres compiled to WASM), replacing the hand-written MiniSQL engine. See `NEXT-TASK.md`.

## Layout
```
kit/       kit.core.js kit.style.css kit.shell.html kit.build.py kit.smoke_test.py kit.engine.js (MiniSQL, legacy) tests
lessons/   lNN.config.js lNN.seed.sql lNN.slides.html lNN.viz.js lNN.content.js
dist/      built lessons (lesson-NN-<slug>.html)
book/      chapter PDFs (zips)      reference/  scale-to-millions.html
```

## Commands
- Build: `python3 kit/kit.build.py NN --dirs lessons kit --out dist/lesson-NN.html`
- Smoke test: `python3 kit/kit.smoke_test.py dist/lesson-NN.html [--dark|--mobile]`, then look at `shots/sheet*.png`.
  - On this Mac, the smoke test needs Python Playwright (`pip install playwright pillow && playwright install chromium`).
  - Point `CHROME` in the script at the installed browser, or let Playwright use its default.
- Engine tests: `node kit/kit.test_engine_pg.js` (MiniSQL; all lines must PASS).

## Working rules
- Verify every lesson in a real browser before calling it done:
  - no console errors
  - desktop light/dark and mobile screenshots reviewed
  - every checkpoint and lab played with a right answer and a wrong one
- Keep the kit generic. Lesson-specific code goes in `lessons/`.
- Tell Ali plainly what was verified and what wasn't.
