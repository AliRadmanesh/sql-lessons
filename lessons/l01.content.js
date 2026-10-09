/* Lesson 01 · content: checkpoints, playground, labs.
   Loaded after kit.core.js and l01.viz.js; boot() runs after this file. */

/* ================= checkpoint content ================= */
makeCheckpoint({
  id: 'cp1', n: 1, title: 'Navigating pre-relational data',
  parts: [
    { type: 'order', title: 'Put the network-model lookup in order', pts: 4, hint: "Click the steps in the order the system performs them to find the transactions on Sue's money market account. Clicking a numbered step undoes it and everything after it.",
      items: ['Find the customer record for Sue Smith', "Follow the link from Sue's record to her list of accounts", 'Traverse the chain of accounts until you reach the money market account', 'Follow the link from the money market account to its list of transactions'],
      display: [2, 0, 3, 1], explain: 'Customer → her account list → walk the chain → that account\'s transaction list. Each step follows a stored link, and the path is code you write by hand.' },
    { type: 'classify', title: 'Which model does each sentence describe?', pts: 6, options: ['Hierarchical', 'Network', 'Relational'],
      rows: [{ q: 'Each record has at most one parent; you find data by walking down a tree.', a: 0 }, { q: 'An account record can be reached from its customer <i>and</i> from its product record.', a: 1 }, { q: 'Records are related by storing matching values such as <code class="i">cust_id = 2</code>, not pointers.', a: 2 }],
      explain: 'Single parent = hierarchical. Several parents through explicit links = network. Matching values instead of links = relational.' },
  ],
});
makeCheckpoint({
  id: 'cp2', n: 2, title: 'Primary and foreign keys',
  parts: [
    { type: 'columns', title: 'Label every column', pts: 8, options: ['PK', 'FK', '—'], hint: 'PK identifies a row of <i>this</i> table. FK points at a row in <i>another</i> table. — is a plain attribute.',
      tables: [{ name: 'account', cols: [['account_id', 0], ['product_cd', 1], ['cust_id', 1], ['balance', 2]] }, { name: 'transaction', cols: [['txn_id', 0], ['account_id', 1], ['amount', 2], ['txn_date', 2]] }],
      explain: '<code class="i">account_id</code> is the identity of an account, but inside <code class="i">transaction</code> the same column is a foreign key. The role comes from the table, not the column name.' },
    { type: 'mcq', multi: true, title: 'A bank makes <code class="i">(fname, lname)</code> the primary key of customer. Which terms apply? <span class="muted" style="font-weight:400">(select all)</span>', pts: 4,
      opts: [{ t: 'Natural key', ok: 1 }, { t: 'Compound key', ok: 1 }, { t: 'Surrogate key', ok: 0 }, { t: 'Foreign key', ok: 0 }],
      explain: 'Built from real-world data → natural. Two columns → compound. A surrogate would be an invented value like cust_id. Each wrong pick cancels a right one.' },
    { type: 'mcq', title: 'Why does the book reject that key?', pts: 3,
      opts: [{ t: 'Two customers can share a name, and a name can change — a key must be unique and must never change', ok: 1 }, { t: 'Text columns cannot be indexed', ok: 0 }, { t: 'SQL does not allow primary keys with more than one column', ok: 0 }, { t: 'Primary keys must be numeric', ok: 0 }],
      explain: 'Uniqueness and stability are the two requirements. Compound keys and text keys are legal SQL; a name just fails both requirements.' },
  ],
});
makeCheckpoint({
  id: 'cp3', n: 3, title: 'Spot the design problems', intro: 'A teammate proposes this table for an account report screen.',
  parts: [
    { type: 'mcq', multi: true, title: 'Which of these are real problems? <span class="muted" style="font-weight:400">(select all)</span>', pts: 10,
      html: `<div class="tblbox" style="margin-bottom:6px"><table class="tbl"><caption>account_report</caption><thead><tr><th class="pk">account_id</th><th>owner_name</th><th>owner_address</th><th>product</th><th>balance</th></tr></thead><tbody>
<tr><td>103</td><td>George Blake</td><td>12 Elm St, Boston, MA 02134</td><td>Checking</td><td class="num">75.00</td></tr>
<tr><td>104</td><td>George Blake</td><td>12 Elm St, Boston, MA 02134</td><td>Savings</td><td class="num">250.00</td></tr>
<tr><td>105</td><td>Sue Smith</td><td>9 Oak Ave, Lynn, MA 01901</td><td>Checking</td><td class="num">783.64</td></tr></tbody></table></div>`,
      opts: [
        { t: 'Customer data is copied into every account row, so one name change has to touch several rows', ok: 1 },
        { t: '<code class="i">owner_name</code> packs first and last name into one column', ok: 1 },
        { t: '<code class="i">owner_address</code> packs street, city, state and zip into one column', ok: 1 },
        { t: '<code class="i">product</code> repeats the product name instead of storing its key (<code class="i">product_cd</code>)', ok: 1 },
        { t: '<code class="i">balance</code> belongs in the customer table', ok: 0 },
        { t: '<code class="i">account_id</code> is a surrogate key, which the relational model forbids', ok: 0 },
      ],
      explain: 'Each account has its own balance, so balance belongs right here. Surrogate keys are fully relational — the book picks cust_id over names. The fix: store cust_id and product_cd as foreign keys, and keep names and addresses as one-fact columns in customer.' },
  ],
});
makeCheckpoint({
  id: 'cp4', n: 4, title: 'Which class is each statement?',
  parts: [
    { type: 'classify', title: 'Schema, data or transaction?', pts: 10, options: ['Schema', 'Data', 'Transaction'],
      rows: [
        ['CREATE TABLE product (product_cd VARCHAR(10), name VARCHAR(50))', 0], ["INSERT INTO product VALUES ('CD', 'Certificate of Deposit')", 1], ['SELECT name FROM product', 1],
        ["UPDATE account SET balance = 0 WHERE account_id = 107", 1], ['ROLLBACK', 2], ['DROP TABLE corporation', 0], ['START TRANSACTION', 2],
        ["DELETE FROM transaction WHERE txn_id = 984", 1], ['ALTER TABLE customer ADD birth_date DATE', 0], ['COMMIT', 2],
      ].map(([q, a]) => ({ q: `<code class="i">${esc(q)}</code>`, a })),
      explain: 'CREATE / ALTER / DROP define structures (schema, DDL). SELECT / INSERT / UPDATE / DELETE work on the data (DML) — SELECT included. START TRANSACTION / COMMIT / ROLLBACK delimit units of work (TCL).' },
  ],
});
makeCheckpoint({
  id: 'cp5', n: 5, title: 'Nonprocedural SQL and the optimizer',
  parts: [
    { type: 'mcq', title: 'Who decides whether a query scans every row or uses an index?', pts: 4,
      opts: [{ t: "The database's optimizer, based on the tables and the indexes that exist", ok: 1 }, { t: 'You, through the order of the conditions in WHERE', ok: 0 }, { t: 'The driver (JDBC, pg, mysql2)', ok: 0 }, { t: 'The order of the tables in FROM', ok: 0 }],
      explain: 'SQL states what you want; the optimizer chooses how. You can influence it — by creating indexes, or with hints — but the plan is its decision.' },
    { type: 'mcq', title: 'Which frontend code is closest in spirit to a SQL statement?', pts: 3,
      opts: [{ t: 'A loop that calls <code class="i">document.createElement</code> and <code class="i">appendChild</code> for each user', ok: 0 }, { t: 'JSX that describes the list to render and leaves the DOM updates to React', ok: 1 }, { t: 'A <code class="i">requestAnimationFrame</code> loop that mutates styles each frame', ok: 0 }],
      explain: 'Declarative JSX states the desired result and delegates the "how" to the reconciler, just as SQL delegates it to the optimizer.' },
    { type: 'mcq', title: 'A Next.js server action must read from PostgreSQL. What does it need?', pts: 3,
      opts: [{ t: 'Nothing: JavaScript can execute SQL natively', ok: 0 }, { t: 'A toolkit — a driver such as pg, possibly with a query builder or ORM on top', ok: 1 }, { t: "The logic rewritten in the database's procedural language", ok: 0 }],
      explain: "Non-database languages talk to the server through a toolkit (Table 1-2's JDBC, ADO.NET… and pg / mysql2 in Node). Builders and ORMs sit on top and still send SQL." },
  ],
});

/* ================= playground ================= */
makePlayground({
  root: '#playground', presets: '#pgpresets', schema: '#pgschema', start: 'SELECT * FROM product;',
  items: [
    ['1 · INSERT (typo)', "INSERT INTO product (product_cd, name)\nVALUES ('CD', 'Certificate of Depysit');"],
    ['2 · UPDATE fix', "UPDATE product\nSET name = 'Certificate of Deposit'\nWHERE product_cd = 'CD';"],
    ['3 · SELECT', 'SELECT * FROM product;'],
    ['4 · duplicate key', "INSERT INTO customer (cust_id, fname, lname)\nVALUES (1, 'Ali', 'Test');"],
    ['5 · orphan', "INSERT INTO account (account_id, product_cd, cust_id, balance)\nVALUES (200, 'CHK', 9, 10.00);"],
    ['6 · rehearse safely', 'START TRANSACTION;\nDELETE FROM transaction;\nSELECT * FROM transaction;\nROLLBACK;\nSELECT txn_id FROM transaction;'],
    ['7 · DELETE without WHERE', 'DELETE FROM transaction;', true],
  ],
});

/* ================= labs ================= */
const LAB1 = { id: 'lab1', n: 1, pts: 10, title: "Sue's accounts",
  task: 'Sue Smith is customer <code class="i">2</code>. Return the <b>account_id</b>, <b>product_cd</b> and <b>balance</b> of all her accounts.<br><span class="muted" style="font-size:14.5px">Write it in the book\'s order: FROM, then WHERE, then fill in SELECT.</span>',
  starter: '-- Lab 1\n', ref: 'SELECT account_id, product_cd, balance\nFROM account\nWHERE cust_id = 2;',
  explain: '<b>FROM account</b> — accounts live there. <b>WHERE cust_id = 2</b> keeps Sue\'s rows by their foreign key. <b>SELECT</b> lists the three columns in the requested order. You never touched the customer table: the account row already carries Sue\'s key.' };
LAB1.grade = gradeSelect(LAB1);
const LAB2 = { id: 'lab2', n: 2, pts: 10, title: 'Debits under $600',
  task: 'Return the <b>txn_id</b> and <b>amount</b> of every <b>debit</b> transaction (<code class="i">txn_type_cd = \'DBT\'</code>) for <b>less than $600</b>.',
  starter: '-- Lab 2\n', ref: "SELECT txn_id, amount\nFROM transaction\nWHERE txn_type_cd = 'DBT'\n  AND amount < 600;",
  explain: 'Both conditions must hold, so they\'re joined with <b>AND</b>. Strings take quotes (<code class="i">\'DBT\'</code>); numbers don\'t, and never include a $ sign. Without the DBT filter the three credits sneak in; with OR you\'d get almost every row.' };
LAB2.grade = gradeSelect(LAB2, { superset: 4 });
const LAB3 = { id: 'lab3', n: 3, pts: 15, kind: 'dml', title: 'Fix the typo — one row only',
  task: 'Someone already ran the INSERT below, so the typo is in the database. Fix the product name to <code class="i">Certificate of Deposit</code> with <b>one UPDATE</b> that changes <b>exactly one row</b>. Run shows the product table after your statement.',
  setup: "INSERT INTO product (product_cd, name) VALUES ('CD', 'Certificate of Depysit');", after: 'SELECT * FROM product', afterLabel: 'product table now',
  starter: "-- Already executed:\n-- INSERT INTO product (product_cd, name)\n-- VALUES ('CD', 'Certificate of Depysit');\n\n",
  ref: "UPDATE product\nSET name = 'Certificate of Deposit'\nWHERE product_cd = 'CD';",
  explain: 'Filter on the <b>primary key</b> (<code class="i">product_cd = \'CD\'</code>): it can match at most one row, so "1 row affected" is the only acceptable feedback. <code class="i">WHERE name = \'Certificate of Depysit\'</code> also works here, but keys are the safer habit — names can repeat. Leave out WHERE and every product gets renamed.' };
LAB3.grade = ({ d, res }, fresh) => {
  const kinds = res.map((r) => (r.text || '').trim().split(/\s+/)[0].toLowerCase());
  const updates = res.filter((r, i) => kinds[i] === 'update');
  if (!updates.length) return { score: 0, verdict: 'No UPDATE statement ran — the task is to fix the row with UPDATE.' };
  const want = fresh(); want.exec(LAB3.ref);
  const norm = (db) => db.exec('SELECT product_cd, name FROM product ORDER BY product_cd')[0].rows.map((r) => r.join('=')).join('|');
  const got = d.exec('SELECT product_cd, name FROM product ORDER BY product_cd')[0].rows;
  const before = fresh().exec('SELECT product_cd, name FROM product ORDER BY product_cd')[0].rows;
  const othersSame = got.filter((r) => r[0] !== 'CD').map((r) => r.join('=')).join('|') === before.filter((r) => r[0] !== 'CD').map((r) => r.join('=')).join('|') && got.length === before.length;
  const cd = got.find((r) => r[0] === 'CD');
  const extraDml = kinds.some((k) => ['insert', 'delete', 'create', 'drop'].includes(k));
  if (norm(d) === norm(want) && othersSame) {
    const one = updates.length === 1 && updates[0].affected === 1;
    if (extraDml) return { score: 8, verdict: 'The table ends up right, but you used more than an UPDATE. The task allows one UPDATE only.' };
    return one ? { score: 15, verdict: 'Fixed, with exactly 1 row affected.' } : { score: 10, verdict: 'The table ends up right, but it took more than one UPDATE (or affected more than one row along the way).' };
  }
  if (!othersSame) return { score: 3, verdict: `Valid UPDATE, but it changed other products too (${updates.map((u) => u.affected).join(' + ')} rows affected). That's the missing-WHERE accident.` };
  if (cd && cd[1] !== 'Certificate of Depysit') return { score: 5, verdict: `Right row, wrong value: it now reads '${cd[1]}'.` };
  return { score: 0, verdict: 'Your UPDATE matched no rows (0 rows affected). Check the WHERE value — strings need quotes.' };
};
const LAB4 = { id: 'lab4', n: 4, pts: 10, title: 'Stretch: your first join',
  task: 'George Blake is customer <code class="i">1</code>; checking accounts have <code class="i">product_cd = \'CHK\'</code>. Replace the two <b>____</b> blanks so the query returns every transaction on his checking account. This is the book\'s shorter version of the title-slide query; joins get their own lessons later.',
  starter: 'SELECT t.txn_id, t.txn_date, t.amount\nFROM account a\n  INNER JOIN transaction t ON ____\nWHERE ____;',
  ref: "SELECT t.txn_id, t.txn_date, t.amount\nFROM account a\n  INNER JOIN transaction t ON t.account_id = a.account_id\nWHERE a.cust_id = 1 AND a.product_cd = 'CHK';",
  explain: '<b>ON</b> says how rows pair up: a transaction belongs to an account when the foreign key <code class="i">t.account_id</code> equals the key <code class="i">a.account_id</code>. <b>WHERE</b> then keeps only George\'s checking account. Knowing the ids lets you skip the customer and product tables entirely.' };
LAB4.grade = gradeSelect(LAB4, { superset: 4 });
[LAB1, LAB2, LAB3, LAB4].forEach(makeLab);
