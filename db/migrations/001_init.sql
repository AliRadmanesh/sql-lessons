-- 001_init: the progress database's tables and indexes (spec §4.2–4.5).
--
-- Conventions used throughout (read these once, then the table comments make sense):
--   * STRICT tables: SQLite checks each value's type against the column type.
--   * Every table has an INTEGER PRIMARY KEY surrogate id (or a composite key).
--   * Rows the browser creates carry client_uid, a UUID generated in the browser.
--     The UNIQUE constraint makes a retried request a no-op instead of a duplicate.
--   * Timestamps are UTC ISO-8601 text, e.g. '2026-10-10T14:03:22Z'. Text sorts correctly.
--   * Durations are whole seconds. Booleans are INTEGER 0/1 with a CHECK.
--   * JSON is stored as TEXT and guarded by json_valid().
--   * foreign_keys is ON per connection (set in scripts/progress-db/db.mjs), so
--     REFERENCES is enforced. SQLite does not index FK columns automatically; see indexes below.

-- ---------------------------------------------------------------------------
-- Reference data: what exists. Changes rarely; synced from the lesson configs.
-- ---------------------------------------------------------------------------

CREATE TABLE lesson (
  id          INTEGER PRIMARY KEY,                  -- the chapter number: lesson 07 -> 7
  slug        TEXT NOT NULL UNIQUE,                 -- 'creating-and-populating-a-database'
  title       TEXT NOT NULL,
  max_points  INTEGER NOT NULL CHECK (max_points > 0)  -- sum of its items (the kit uses 100)
) STRICT;

-- One graded checkpoint or lab. Its code is the key used in LESSON.items.
CREATE TABLE item (
  id          INTEGER PRIMARY KEY,
  lesson_id   INTEGER NOT NULL REFERENCES lesson(id),
  code        TEXT NOT NULL,                        -- 'cp3', 'lab2'
  kind        TEXT NOT NULL CHECK (kind IN ('checkpoint', 'lab')),  -- CHECK is the only guard here; no enum type
  ordinal     INTEGER NOT NULL CHECK (ordinal > 0),
  label       TEXT NOT NULL,                        -- 'Primary & foreign keys'
  max_points  INTEGER NOT NULL CHECK (max_points > 0),
  UNIQUE (lesson_id, code)                          -- a code names one item within its lesson only
) STRICT;

-- A tag vocabulary: 'primary-key', 'where-clause', ...
CREATE TABLE concept (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
) STRICT;

-- Many-to-many junction: an item tests many concepts, and a concept appears in many items.
-- A composite primary key and no surrogate id, so WITHOUT ROWID stores it as one B-tree.
CREATE TABLE item_concept (
  item_id     INTEGER NOT NULL REFERENCES item(id)    ON DELETE CASCADE,
  concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, concept_id)
) STRICT, WITHOUT ROWID;

-- ---------------------------------------------------------------------------
-- Event tables: what happened. Append-only, except session totals.
-- ---------------------------------------------------------------------------

-- One continuous visit to one lesson. Heartbeats update it (the active_seconds total only grows).
CREATE TABLE session (
  id              INTEGER PRIMARY KEY,
  client_uid      TEXT NOT NULL UNIQUE,
  lesson_id       INTEGER NOT NULL REFERENCES lesson(id),
  started_at      TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  active_seconds  INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  CHECK (last_seen_at >= started_at)                -- text comparison is valid for this fixed format
) STRICT;

-- One submit (or skip) of one item. A row per attempt; retakes add rows.
CREATE TABLE attempt (
  id             INTEGER PRIMARY KEY,
  client_uid     TEXT NOT NULL UNIQUE,              -- idempotency key from the browser
  session_id     INTEGER NOT NULL REFERENCES session(id),
  item_id        INTEGER NOT NULL REFERENCES item(id),
  attempt_no     INTEGER NOT NULL CHECK (attempt_no > 0),  -- 1, 2, 3 per item; the server computes it
  submitted_at   TEXT NOT NULL,
  score          REAL NOT NULL CHECK (score >= 0),
  max_points     INTEGER NOT NULL CHECK (max_points > 0),  -- snapshot: grading may change later
  skipped        INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1)),
  seconds_spent  INTEGER CHECK (seconds_spent >= 0),       -- active time on the slide; NULL if unknown
  answer_sql     TEXT,                                     -- labs only
  verdict        TEXT,                                     -- the grader's message for labs
  source         TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'backfill')),
  CHECK (score <= max_points),
  UNIQUE (item_id, attempt_no)                       -- the same attempt number cannot repeat for an item
) STRICT;

-- The per-question detail of a checkpoint: which part was wrong, and what was answered.
CREATE TABLE attempt_part (
  attempt_id  INTEGER NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  part_no     INTEGER NOT NULL CHECK (part_no > 0),
  score       REAL    NOT NULL CHECK (score >= 0),
  max_points  REAL    NOT NULL CHECK (max_points > 0),
  answer      TEXT CHECK (answer IS NULL OR json_valid(answer)),  -- NULL means skipped
  PRIMARY KEY (attempt_id, part_no),
  CHECK (score <= max_points)
) STRICT, WITHOUT ROWID;

-- Every Run click on a lab, graded or not. The errors are the mistake signal.
-- No client_uid: losing or duplicating one run is harmless.
CREATE TABLE lab_run (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES session(id),
  item_id     INTEGER NOT NULL REFERENCES item(id),
  ran_at      TEXT NOT NULL,
  sql         TEXT NOT NULL,
  error       TEXT                                  -- NULL means it ran; otherwise the Postgres message
) STRICT;

-- ---------------------------------------------------------------------------
-- Indexes. Each one serves a query in spec §4.6 or a foreign-key join.
-- ---------------------------------------------------------------------------

CREATE INDEX attempt_item_history ON attempt (item_id, submitted_at);   -- "history of one item"
CREATE INDEX attempt_session      ON attempt (session_id);              -- join from session
CREATE INDEX lab_run_session      ON lab_run (session_id);              -- join from session
CREATE INDEX lab_run_item_time    ON lab_run (item_id, ran_at);         -- errors per item over time
CREATE INDEX session_lesson_time  ON session (lesson_id, started_at);   -- per-lesson timeline
CREATE INDEX item_concept_reverse ON item_concept (concept_id);         -- concept -> items
