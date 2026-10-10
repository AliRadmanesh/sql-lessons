-- 002_views: the "how am I doing" queries (spec §4.6).
-- Views hold derived data only. Nothing here is stored, so nothing can go stale.
-- Percentages are computed here and rounded here, never in storage.

-- Latest attempt per item. ROW_NUMBER() numbers each item's attempts newest first; rn = 1 keeps the newest.
CREATE VIEW v_item_latest AS
WITH ranked AS (
  SELECT a.*, i.code, i.lesson_id,
         ROW_NUMBER() OVER (PARTITION BY a.item_id ORDER BY a.attempt_no DESC) AS rn
  FROM attempt a
  JOIN item i ON i.id = a.item_id
)
SELECT item_id, code, lesson_id,
       id AS attempt_id,
       attempt_no,
       score,
       max_points,
       ROUND(100.0 * score / max_points, 1) AS pct,
       submitted_at
FROM ranked
WHERE rn = 1;

-- One row per lesson. Time comes from sessions. Score uses only the latest attempt per item,
-- so a retake replaces the earlier result instead of adding to it.
CREATE VIEW v_lesson_summary AS
SELECT l.id AS lesson_id,
       l.title,
       (SELECT COUNT(*) FROM session s WHERE s.lesson_id = l.id)                  AS sessions,
       (SELECT COALESCE(SUM(s.active_seconds), 0) FROM session s WHERE s.lesson_id = l.id) AS active_seconds,
       (SELECT MIN(s.started_at)   FROM session s WHERE s.lesson_id = l.id)       AS first_studied,
       (SELECT MAX(s.last_seen_at) FROM session s WHERE s.lesson_id = l.id)       AS last_studied,
       (SELECT COALESCE(SUM(li.score), 0) FROM v_item_latest li WHERE li.lesson_id = l.id) AS total_score,
       ROUND(100.0 * (SELECT COALESCE(SUM(li.score), 0) FROM v_item_latest li WHERE li.lesson_id = l.id)
             / l.max_points, 1)                                                    AS total_pct
FROM lesson l;

-- One row per item, across all its attempts.
-- mistake_rate is the share of attempts that lost any points (0..1).
-- errored_runs counts Run clicks on this item whose SQL failed.
CREATE VIEW v_item_weakness AS
SELECT i.id AS item_id,
       i.code,
       (SELECT COUNT(*) FROM attempt a WHERE a.item_id = i.id)                     AS attempts,
       (SELECT pct FROM v_item_latest l WHERE l.item_id = i.id)                    AS latest_pct,
       (SELECT MAX(ROUND(100.0 * a.score / a.max_points, 1)) FROM attempt a WHERE a.item_id = i.id) AS best_pct,
       (SELECT ROUND(1.0 * SUM(CASE WHEN a.score < a.max_points THEN 1 ELSE 0 END) / COUNT(*), 2)
          FROM attempt a WHERE a.item_id = i.id)                                   AS mistake_rate,
       (SELECT AVG(a.seconds_spent) FROM attempt a WHERE a.item_id = i.id)         AS avg_seconds,
       (SELECT COUNT(*) FROM lab_run r WHERE r.item_id = i.id AND r.error IS NOT NULL) AS errored_runs
FROM item i;

-- Checkpoint parts that lost points, newest first, with what was answered.
CREATE VIEW v_part_mistakes AS
SELECT i.code,
       a.item_id,
       a.id AS attempt_id,
       a.submitted_at,
       p.part_no,
       p.score,
       p.max_points,
       p.answer
FROM attempt_part p
JOIN attempt a ON a.id = p.attempt_id
JOIN item i    ON i.id = a.item_id
WHERE p.score < p.max_points
ORDER BY a.submitted_at DESC;

-- Per concept: the average % of every attempt on an item tagged with it.
-- A low average is the signal to bias future quizzes toward that concept.
-- LEFT JOIN keeps a concept that has no attempts yet (its avg_pct is NULL).
CREATE VIEW v_concept_weakness AS
SELECT c.id AS concept_id,
       c.name,
       COUNT(DISTINCT ic.item_id)                            AS items,
       COUNT(a.id)                                           AS attempts,
       ROUND(AVG(100.0 * a.score / a.max_points), 1)         AS avg_pct
FROM concept c
JOIN item_concept ic ON ic.concept_id = c.id
LEFT JOIN attempt a  ON a.item_id = ic.item_id
GROUP BY c.id, c.name;

-- "What should I review next": items whose latest result is under 80%.
-- Worst score first; among ties, the one submitted longest ago first.
CREATE VIEW v_review_queue AS
SELECT l.item_id,
       l.code,
       l.lesson_id,
       l.pct          AS latest_pct,
       l.submitted_at
FROM v_item_latest l
WHERE l.pct < 80
ORDER BY l.pct ASC, l.submitted_at ASC;
