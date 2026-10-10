// Terminal report from the views (npm run progress:report): per-lesson totals and the review queue.
import { openDb, migrate, DEFAULT_DB_PATH } from './db.mjs';

const db = openDb(DEFAULT_DB_PATH);
migrate(db);

const lessons = db.prepare(`SELECT title, sessions, ROUND(active_seconds / 3600.0, 2) AS active_hours,
                                   total_score, total_pct, first_studied, last_studied
                            FROM v_lesson_summary ORDER BY lesson_id`).all().map((r) => ({ ...r }));
const queue = db.prepare(`SELECT lesson_id, code, latest_pct, submitted_at FROM v_review_queue LIMIT 10`).all().map((r) => ({ ...r }));

console.log(`Progress database: ${DEFAULT_DB_PATH}\n`);
console.log('Lessons');
if (lessons.length) console.table(lessons); else console.log('  no lesson data yet: open a lesson in the browser first');
console.log('\nReview queue (worst first, latest result under 80%)');
if (queue.length) console.table(queue); else console.log('  empty: nothing under 80% yet');
db.close();
