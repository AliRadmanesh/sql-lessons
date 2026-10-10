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
    { type: 'columns', title: 'Label every column', pts: 8, options: ['PK', 'FK', '—'], hint: 'PK identifies a row of <i>this</i> table. FK points at a row in <i>another</i> table. — is a plain column.',
      tables: [{ name: 'customer', cols: [['cust_id', 0], ['fname', 2], ['lname', 2]] }, { name: 'account', cols: [['account_id', 0], ['product_cd', 1], ['cust_id', 1], ['balance', 2]] }],
      explain: '<code class="i">cust_id</code> is the primary key of <code class="i">customer</code>, but in <code class="i">account</code> the same column is a foreign key: it holds the unique identifier of the customer who opened the account. The role comes from the table, not the column name.' },
    { type: 'mcq', title: 'The bank uses <code class="i">cust_id</code>, a number invented just to identify each customer. What kind of key is that?', pts: 4,
      opts: [{ t: 'A surrogate key', ok: 1 }, { t: 'A natural key', ok: 0 }, { t: 'A compound key', ok: 0 }, { t: 'A foreign key', ok: 0 }],
      explain: 'Natural keys are built from real-world data (like fname + lname, which would also be a compound key). A value created just to be the key is a surrogate key.' },
    { type: 'mcq', title: 'Why did the book not use <code class="i">(fname, lname)</code> as the primary key?', pts: 3,
      opts: [{ t: 'Two customers could share a name, and a name can change — and primary key values must never change', ok: 1 }, { t: 'SQL does not allow primary keys with more than one column', ok: 0 }, { t: 'Primary keys must be numeric', ok: 0 }],
      explain: 'A key must identify exactly one row and must stay the same once assigned. A name can repeat, and a last name may change. Compound keys themselves are fine.' },
  ],
});
makeCheckpoint({
  id: 'cp3', n: 3, title: 'Spot the design problems', intro: 'A teammate proposes this table for an account report screen.',
  parts: [
    { type: 'mcq', multi: true, title: 'Which of these are real problems? <span class="muted" style="font-weight:400">(select all)</span>', pts: 10,
      html: `<div class="tblbox" style="margin-bottom:6px"><table class="tbl"><caption>account_report</caption><thead><tr><th class="pk">account_id</th><th>owner_name</th><th>owner_address</th><th>balance</th></tr></thead><tbody>
<tr><td>103</td><td>George Blake</td><td>12 Elm St, Boston, MA 02134</td><td class="num">75.00</td></tr>
<tr><td>104</td><td>George Blake</td><td>12 Elm St, Boston, MA 02134</td><td class="num">250.00</td></tr>
<tr><td>105</td><td>Sue Smith</td><td>9 Oak Ave, Lynn, MA 01901</td><td class="num">783.64</td></tr></tbody></table></div>`,
      opts: [
        { t: "The customer's name and address are copied into every account row, so one change has to touch several rows", ok: 1 },
        { t: '<code class="i">owner_name</code> packs first and last name into one column', ok: 1 },
        { t: '<code class="i">owner_address</code> packs street, city, state and zip into one column', ok: 1 },
        { t: '<code class="i">balance</code> belongs in the customer table', ok: 0 },
      ],
      explain: 'Each account has its own balance, so balance belongs right here. The three real problems break the normalization rules: customer facts repeated outside the customer table, and single columns holding several pieces of information. The fix: keep only <code class="i">cust_id</code> in account, and store name and address as separate one-fact columns in customer.' },
  ],
});
makeCheckpoint({
  id: 'cp4', n: 4, title: 'Which class is each statement?',
  parts: [
    { type: 'classify', title: 'Schema, data or transaction?', pts: 10, options: ['Schema', 'Data', 'Transaction'],
      rows: [
        ['CREATE TABLE product (product_cd VARCHAR(10), name VARCHAR(50))', 0], ["INSERT INTO product VALUES ('CD', 'Certificate of Deposit')", 1], ['SELECT name FROM product', 1],
        ["UPDATE account SET balance = 0 WHERE account_id = 107", 1], ["DELETE FROM transaction WHERE txn_id = 984", 1],
      ].map(([q, a]) => ({ q: `<code class="i">${esc(q)}</code>`, a })).concat([{ q: 'A statement that rolls back a transaction', a: 2 }]),
      explain: 'CREATE TABLE defines a structure: a schema statement. SELECT, INSERT, UPDATE and DELETE work on the data inside the structures, SELECT included. Statements that begin, end or roll back a transaction are transaction statements (Chapter 12).' },
  ],
});
makeCheckpoint({
  id: 'cp5', n: 5, title: 'Nonprocedural SQL and toolkits',
  parts: [
    { type: 'mcq', title: 'Who decides how a query is executed, for example whether to use an index?', pts: 4,
      opts: [{ t: "The database's optimizer, based on how the tables are configured and which indexes exist", ok: 1 }, { t: 'You, through the order of the conditions in WHERE', ok: 0 }, { t: 'The toolkit your program uses (JDBC, for example)', ok: 0 }, { t: 'The order of the tables in FROM', ok: 0 }],
      explain: 'SQL statements define the inputs and outputs; the how is left to the optimizer. You can influence it with hints, but most SQL users leave that to a database administrator.' },
    { type: 'mcq', title: 'Which frontend code is closest in spirit to a SQL statement?', pts: 3,
      opts: [{ t: 'A loop that calls <code class="i">document.createElement</code> and <code class="i">appendChild</code> for each user', ok: 0 }, { t: 'JSX that describes the list to render and leaves the DOM updates to React', ok: 1 }, { t: 'A <code class="i">requestAnimationFrame</code> loop that mutates styles each frame', ok: 0 }],
      explain: 'Declarative JSX states the desired result and delegates the "how" to the reconciler, just as SQL delegates it to the optimizer.' },
    { type: 'mcq', title: 'A Python or Java program needs to run SQL statements. What does it use?', pts: 3,
      opts: [{ t: 'A toolkit / API for that language (Python DB, JDBC…)', ok: 1 }, { t: 'Nothing: SQL is part of Python and Java', ok: 0 }, { t: 'It must be rewritten in the vendor\'s procedural language', ok: 0 }],
      explain: 'SQL is not a complete programming language. Vendors offer procedural languages with SQL built in (PL/SQL, Transact-SQL), but from a general-purpose language you use a toolkit (Table 1-2).' },
  ],
});

/* ================= playground ================= */
makePlayground({
  root: '#playground', presets: '#pgpresets', schema: '#pgschema', start: 'SELECT * FROM product;',
  items: [
    ['1 · INSERT (typo)', "INSERT INTO product (product_cd, name)\nVALUES ('CD', 'Certificate of Depysit');"],
    ['2 · UPDATE fix', "UPDATE product\nSET name = 'Certificate of Deposit'\nWHERE product_cd = 'CD';"],
    ['3 · SELECT', 'SELECT * FROM product;'],
    ['4 · UPDATE, no match', "UPDATE product\nSET name = 'Nothing'\nWHERE product_cd = 'ZZ';"],
    ['5 · DELETE without WHERE', 'DELETE FROM transaction;', true],
  ],
});

/* ================= labs ================= */
const LAB1 = { id: 'lab1', n: 1, pts: 15, title: "Sue's accounts",
  task: 'Sue Smith is customer <code class="i">2</code>. Return the <b>account_id</b>, <b>product_cd</b> and <b>balance</b> of all her accounts.<br><span class="muted" style="font-size:14.5px">Write it in the book\'s order: FROM, then WHERE, then fill in SELECT.</span>',
  starter: '-- Lab 1\n', ref: 'SELECT account_id, product_cd, balance\nFROM account\nWHERE cust_id = 2;',
  explain: '<b>FROM account</b> — accounts live there. <b>WHERE cust_id = 2</b> keeps Sue\'s rows by their foreign key. <b>SELECT</b> lists the three columns in the requested order. You never touched the customer table: the account row already carries Sue\'s key.' };
LAB1.grade = gradeSelect(LAB1);
const LAB2 = { id: 'lab2', n: 2, pts: 15, kind: 'dml', title: 'Add a product',
  task: 'The bank adds a new product: code <code class="i">CD</code>, name <code class="i">Certificate of Deposit</code>. Write the <b>INSERT</b> for the <b>product</b> table. Run shows the table afterwards.',
  after: 'SELECT * FROM product ORDER BY product_cd', afterLabel: 'product table now',
  starter: '-- Lab 2\n', ref: "INSERT INTO product (product_cd, name)\nVALUES ('CD', 'Certificate of Deposit');", check: 'SELECT * FROM product ORDER BY product_cd',
  explain: 'INSERT INTO names the table and its columns, VALUES supplies one value per column, in the same order. Text values need quotes. The engine answers with how many rows were created: exactly 1 here.' };
LAB2.grade = gradeState(LAB2, { stateOnly: 0.6 });
const LAB3 = { id: 'lab3', n: 3, pts: 15, kind: 'dml', title: 'Fix the typo — one row only',
  task: 'Someone already ran the INSERT below, so the typo is in the database. Fix the product name to <code class="i">Certificate of Deposit</code> with <b>one UPDATE</b> that changes <b>exactly one row</b>. Run shows the product table after your statement.',
  setup: "INSERT INTO product (product_cd, name) VALUES ('CD', 'Certificate of Depysit');", after: 'SELECT * FROM product', afterLabel: 'product table now',
  starter: "-- Already executed:\n-- INSERT INTO product (product_cd, name)\n-- VALUES ('CD', 'Certificate of Depysit');\n\n",
  ref: "UPDATE product\nSET name = 'Certificate of Deposit'\nWHERE product_cd = 'CD';",
  explain: 'Filter on the <b>primary key</b> (<code class="i">product_cd = \'CD\'</code>): it can match at most one row, so "1 row affected" is the only acceptable feedback. <code class="i">WHERE name = \'Certificate of Depysit\'</code> also works here, but keys are the safer habit — names can repeat. Leave out WHERE and every product gets renamed.' };
LAB3.grade = async ({ d, res }, fresh) => {
  const kinds = res.map((r) => (r.text || '').trim().split(/\s+/)[0].toLowerCase());
  const updates = res.filter((r, i) => kinds[i] === 'update');
  if (!updates.length) return { score: 0, verdict: 'No UPDATE statement ran — the task is to fix the row with UPDATE.' };
  const want = await fresh(); await want.exec(LAB3.ref);
  const rowsOf = async (db) => (await db.exec('SELECT product_cd, name FROM product ORDER BY product_cd'))[0].rows;
  const norm = async (db) => (await rowsOf(db)).map((r) => r.join('=')).join('|');
  const got = await rowsOf(d);
  const before = await rowsOf(await fresh());
  const othersSame = got.filter((r) => r[0] !== 'CD').map((r) => r.join('=')).join('|') === before.filter((r) => r[0] !== 'CD').map((r) => r.join('=')).join('|') && got.length === before.length;
  const cd = got.find((r) => r[0] === 'CD');
  const extraDml = kinds.some((k) => ['insert', 'delete', 'create', 'drop'].includes(k));
  if ((await norm(d)) === (await norm(want)) && othersSame) {
    const one = updates.length === 1 && updates[0].affected === 1;
    if (extraDml) return { score: 8, verdict: 'The table ends up right, but you used more than an UPDATE. The task allows one UPDATE only.' };
    return one ? { score: 15, verdict: 'Fixed, with exactly 1 row affected.' } : { score: 10, verdict: 'The table ends up right, but it took more than one UPDATE (or affected more than one row along the way).' };
  }
  if (!othersSame) return { score: 3, verdict: `Valid UPDATE, but it changed other products too (${updates.map((u) => u.affected).join(' + ')} rows affected). That's the missing-WHERE accident.` };
  if (cd && cd[1] !== 'Certificate of Depysit') return { score: 5, verdict: `Right row, wrong value: it now reads '${cd[1]}'.` };
  return { score: 0, verdict: 'Your UPDATE matched no rows (0 rows affected). Check the WHERE value — strings need quotes.' };
};
[LAB1, LAB2, LAB3].forEach(makeLab);
