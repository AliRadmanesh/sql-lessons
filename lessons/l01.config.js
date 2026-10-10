/* Lesson 01 · config. Loaded before kit.core.js. `__SEED__` is replaced by build with l01.seed.sql. */
const LESSON = {
  id: '01',
  title: 'Lesson 01 · A Little Background — Learning SQL',
  chapter: 1,
  engine: 'minisql',  // Lesson 01 only: graded by the in-file MiniSQL simulator. Lessons 02+ default to 'pglite' (real PostgreSQL).
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
    lab1: { max: 15, label: 'Lab 1 · SELECT with WHERE', review: 's-anatomy' },
    lab2: { max: 15, label: 'Lab 2 · INSERT', review: 's-changing' },
    lab3: { max: 15, label: 'Lab 3 · fix with UPDATE', review: 's-changing' },
  },
  takeaways: [
    "A database system beats paper on speed, multiple indexes and up-to-the-minute data.",
    "Hierarchical and network systems link records with pointers; every question is hand-written navigation.",
    "The relational model links rows by <b>matching values</b>: a primary key identifies a row, a foreign key points to a row in another table.",
    "Primary key values must be unique and must never change, which is why the bank uses a surrogate <code>cust_id</code> instead of a name.",
    "Normalization: each independent piece of information lives in one place; only keys are repeated.",
    "SQL is nonprocedural: you state the result, the optimizer decides how. Schema, data and transaction statements are its three classes.",
    "A query is SELECT, FROM, WHERE. Always check the rows affected by INSERT, UPDATE and DELETE."
  ],
  next: "Creating and populating a database: choosing column types (character, numeric, temporal), designing and refining tables, CREATE TABLE and INSERT in PostgreSQL, and what happens when statements go wrong.",
};
