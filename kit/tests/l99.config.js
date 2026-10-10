/* Test fixture for the PGlite path (not a real lesson). Build: python3 kit/kit.build.py 99 --dirs kit/tests kit --out dist/lesson-99.html */
const LESSON = {
  id: '99',
  title: 'Lesson 99 · PGlite fixture',
  chapter: 0,
  dialect: 'postgres',
  seed: `__SEED__`,
  db: {
    label: 'fixture database', seedNote: 'How it was created',
    tables: ['customer', 'orders'],
    tableColor: { customer: 'var(--cyan)', orders: 'var(--violet)' },
  },
  items: {
    cp1: { max: 10, label: 'Keys', review: 's-tables' },
    lab1: { max: 30, label: 'Lab 1 · SELECT', review: 's-tables' },
    lab2: { max: 30, label: 'Lab 2 · INSERT RETURNING', review: 's-tables' },
    lab3: { max: 30, label: 'Lab 3 · DDL on a setup', review: 's-tables' },
  },
  takeaways: ['PGlite is real PostgreSQL.', 'Labs run on a fresh copy.', 'Errors are real Postgres errors.', 'Integer division is 3.', 'psql tags are rebuilt.'],
  next: 'Nothing: this is a fixture.',
};
