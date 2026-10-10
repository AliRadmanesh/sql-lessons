# Progress database

Every checkpoint answer, lab submit, lab run and study session in the lessons is recorded in one SQLite file:
`data/progress.db` (git-ignored; created when you run `npm run lessons`). Nothing leaves your machine.

The schema is also a worked example of relational design. Read `schema.sql` (the whole schema, generated) and
`migrations/` (the same schema, commented, in the order it was built).

## Files

| Path | What it is |
|---|---|
| `migrations/001_init.sql` | Tables, constraints and indexes. Commented for reading. |
| `migrations/002_views.sql` | The views that answer "how am I doing". |
| `schema.sql` | The whole schema after all migrations. Regenerate with `npm run progress:schema`. |
| `../scripts/progress-db/` | `db.mjs` (open and migrate), `events.mjs` (validate and apply), `api.mjs` (HTTP), `report.mjs`, `backup.mjs`, `dump-schema.mjs`. |

## Commands

```bash
npm run lessons            # starts the server and creates data/progress.db if needed
npm run progress:report    # terminal summary from the views
npm run progress:backup    # copies the database to data/backups/ (safe while in use)
npm run progress:schema    # rewrites db/schema.sql after you add a migration
npm run test:progress      # all progress tests
```

## Open it in a GUI or the terminal

- **DBeaver or TablePlus:** New connection, type SQLite, database file `data/progress.db` in the repo.
  Open it read-only if you only want to browse.
- **Terminal:** `sqlite3 data/progress.db` (macOS ships `sqlite3`). Try `.tables`, `.schema attempt`, `.mode column`.

The server writes to the database while you browse it. SQLite's WAL mode lets you read while it writes.

## Entity relationships

```
lesson 1──N item N──M concept            (reference data; "what exists")
  │           │        (via item_concept)
  │ 1         │ 1
  N           N
session 1──N attempt 1──N attempt_part   (events; "what happened")
  │             
  └1──N lab_run N──1 item
schema_migration                          (housekeeping)
```

## Ten starter queries

These run against the real data. Try each one, then read why it is written that way.

1. **Minutes per lesson:**
   `SELECT lesson_id, ROUND(SUM(active_seconds) / 60.0, 1) AS minutes FROM session GROUP BY lesson_id;`
2. **Latest % per item:**
   `SELECT i.code, l.pct AS latest_pct FROM item i JOIN v_item_latest l ON l.item_id = i.id ORDER BY i.code;`
3. **Did a retake help?** Every attempt on one item, in order:
   `SELECT a.attempt_no, ROUND(100.0 * a.score / a.max_points, 1) AS pct FROM attempt a JOIN item i ON i.id = a.item_id WHERE i.code = 'cp2' ORDER BY a.attempt_no;`
4. **Worst concepts:** `SELECT name, avg_pct, attempts FROM v_concept_weakness ORDER BY avg_pct LIMIT 5;`
5. **Lab error rate:** runs and failed runs per lab:
   `SELECT i.code, COUNT(*) AS runs, SUM(r.error IS NOT NULL) AS errors FROM lab_run r JOIN item i ON i.id = r.item_id GROUP BY i.code;`
6. **Longest sessions:** `SELECT client_uid, lesson_id, active_seconds, started_at FROM session ORDER BY active_seconds DESC LIMIT 5;`
7. **A join across six tables:** every checkpoint part that lost points, with its lesson and its concepts:
   `SELECT l.title, i.code, c.name AS concept, p.part_no, p.answer FROM attempt_part p JOIN attempt a ON a.id = p.attempt_id JOIN item i ON i.id = a.item_id JOIN lesson l ON l.id = i.lesson_id JOIN item_concept ic ON ic.item_id = i.id JOIN concept c ON c.id = ic.concept_id WHERE p.score < p.max_points;`
8. **A window function:** how each attempt changed from the one before it, per item:
   `SELECT i.code, a.attempt_no, ROUND(100.0 * a.score / a.max_points, 1) AS pct, ROUND(100.0 * a.score / a.max_points - LAG(100.0 * a.score / a.max_points) OVER (PARTITION BY a.item_id ORDER BY a.attempt_no), 1) AS change FROM attempt a JOIN item i ON i.id = a.item_id;`
9. **A CTE:** active minutes per day:
   `WITH daily AS (SELECT DATE(started_at) AS d, SUM(active_seconds) AS s FROM session GROUP BY DATE(started_at)) SELECT d, ROUND(s / 60.0, 1) AS minutes FROM daily ORDER BY d;`
10. **Read the query plan:** what SQLite does to answer the review queue:
    `EXPLAIN QUERY PLAN SELECT * FROM v_review_queue;`

## Design notes

Each pattern is used on purpose. One sentence each on why:

- **Surrogate keys (`id INTEGER PRIMARY KEY`):** a row keeps its identity even when its names change.
- **Natural keys where they are stable:** `lesson.id` is the chapter number, and `item(lesson_id, code)` is unique.
- **Idempotency keys (`client_uid UNIQUE`):** a retried request cannot create a duplicate row.
- **Junction table (`item_concept`):** an item tests many concepts and a concept appears in many items.
- **Snapshot columns (`attempt.max_points`):** a grade stays true to the maximum it was graded against, even if the item changes later.
- **Derived data in views:** nothing is stored twice, so no aggregate can go stale.
- **Migrations (`migrations/NNN_name.sql`):** a schema change is a new file, never an edit to an old one.
- **Constraints as documentation (`CHECK`, `STRICT`, `json_valid`):** the database rejects bad rows whatever code writes them.
- **Indexes for the queries that run:** each index in `001_init.sql` serves a query above or a foreign-key join.
