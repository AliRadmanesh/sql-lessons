/* Lesson 01 · config. Loaded before kit.core.js. `__SEED__` is replaced by build with l01.seed.sql. */
const LESSON = {
  id: '01',
  title: 'Lesson 01 · A Little Background — Learning SQL',
  chapter: 1,
  dialect: 'mysql',   // Lesson 01 only: built before the PostgreSQL decision; its sandbox behaves like MySQL. Lessons 02+ use 'postgres'.
  seed: `__SEED__`,
  db: {
    label: 'Bank database (Figure 1-3)',
    seedNote: 'How it was created (lesson 2 preview)',
    tables: ['customer', 'product', 'account', 'transaction'],
    tableClass: { customer: 't-customer', account: 't-account', product: 't-product', transaction: 't-txn' },
    tableColor: { customer: 'var(--t-customer)', account: 'var(--t-account)', product: 'var(--t-product)', transaction: 'var(--t-txn)' },
  },
  // Order = order on the results slide. review = slide id (section id="...") or index to jump back to.
  items: {
    cp1: { max: 10, label: 'Pre-relational models', review: 's-hier' },
    cp2: { max: 15, label: 'Primary & foreign keys', review: 's-keys' },
    cp3: { max: 10, label: 'Normalization', review: 's-norm' },
    cp4: { max: 10, label: 'Statement classes', review: 's-classes' },
    cp5: { max: 10, label: 'Nonprocedural SQL', review: 's-optimizer' },
    lab1: { max: 10, label: 'Lab 1 · filter rows', review: 's-anatomy' },
    lab2: { max: 10, label: 'Lab 2 · two conditions', review: 's-anatomy' },
    lab3: { max: 15, label: 'Lab 3 · safe UPDATE', review: 's-changing' },
    lab4: { max: 10, label: 'Lab 4 · first join', review: 's-fk' },
  },
  takeaways: [
    "A database system beats paper on speed, multiple indexes and freshness.",
    "Hierarchical and network models link records with pointers; every question is hand-written navigation.",
    "The relational model links rows by <b>matching values</b>: primary keys identify, foreign keys point.",
    "Keys must be unique and never change — prefer surrogate keys over names.",
    "Normalize: one fact, one place; only keys are repeated.",
    "SQL is nonprocedural: you state the result, the optimizer chooses the plan.",
    "Every UPDATE/DELETE needs a WHERE you trust — and check rows affected."
  ],
  next: "Creating and populating a database: MySQL data types (character, numeric, temporal), designing and refining tables, CREATE TABLE, and what happens when statements go bad — duplicate keys, missing foreign keys, bad values and dates.",
};
