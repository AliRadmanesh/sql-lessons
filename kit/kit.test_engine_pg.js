// SQL lesson kit · PostgreSQL-dialect engine tests: node kit.test_engine_pg.js  (expects every line to print PASS)
const M = require('./kit.engine.js');
const seed = `
CREATE TYPE txn_kind AS ENUM ('DBT', 'CDT');
CREATE TABLE customer (cust_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, fname varchar(20) NOT NULL, lname text NOT NULL, vip boolean DEFAULT false);
CREATE TABLE account (account_id serial PRIMARY KEY, cust_id integer NOT NULL REFERENCES customer, balance numeric(10,2) CHECK (balance >= 0));
CREATE TABLE txn (txn_id bigserial PRIMARY KEY, account_id integer REFERENCES account (account_id), kind txn_kind NOT NULL, amount numeric(10,2), at timestamptz);
INSERT INTO customer (fname, lname) VALUES ('George', 'Blake'), ('Sue', 'Smith');
INSERT INTO account (cust_id, balance) VALUES (1, 75), (2, 783.64);
INSERT INTO txn (account_id, kind, amount, at) VALUES (1, 'DBT', 100, '2024-01-22 10:15'), (2, 'CDT', 25, '2024-02-05');`;
let pass = 0, fail = 0;
function t(name, sql, check) {
  const db = M.create(seed, { dialect: 'postgres' }); let out, e = null;
  try { out = db.exec(sql); } catch (x) { e = x.message; }
  let ok; try { ok = check(out, e, db); } catch (x) { ok = false; e = (e || '') + ' | check threw ' + x.message; }
  ok ? pass++ : fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(e || out && out.map((r) => r.msg || r.rows)).slice(0, 300));
}
const rows = (o) => o[o.length - 1].rows;
t('case-sensitive =', "SELECT fname FROM customer WHERE fname = 'george'", (o) => rows(o).length === 0);
t('ILIKE', "SELECT fname FROM customer WHERE fname ILIKE 'g%'", (o) => rows(o)[0][0] === 'George');
t('LIKE case-sensitive', "SELECT fname FROM customer WHERE fname LIKE 'g%'", (o) => rows(o).length === 0);
t('|| concat', "SELECT fname || ' ' || lname AS full_name FROM customer ORDER BY cust_id", (o) => rows(o)[0][0] === 'George Blake' && o[0].columns[0] === 'full_name');
t('identity ALWAYS rejects explicit', "INSERT INTO customer (cust_id, fname, lname) VALUES (9, 'X', 'Y')", (o, e) => /non-DEFAULT value/.test(e));
t('RETURNING id', "INSERT INTO customer (fname, lname) VALUES ('Ali', 'R') RETURNING cust_id, fname", (o) => rows(o)[0][0] === 3 && o[0].msg === 'INSERT 0 1' && o[0].affected === 1);
t('UPDATE counts matched', "UPDATE customer SET vip = false", (o) => o[0].affected === 2 && /^UPDATE 2/.test(o[0].msg) && o[0].flag === 'nowhere');
t('UPDATE … RETURNING *', "UPDATE account SET balance = balance + 10 WHERE account_id = 1 RETURNING *", (o) => rows(o)[0][2] === 85);
t('DELETE … RETURNING', "DELETE FROM txn WHERE amount > 50 RETURNING txn_id", (o) => rows(o).length === 1 && o[0].msg === 'DELETE 1');
t('duplicate key msg', "INSERT INTO account (account_id, cust_id, balance) VALUES (1, 1, 0)", (o, e) => /duplicate key value violates unique constraint "account_pkey"/.test(e));
t('FK insert msg', "INSERT INTO account (cust_id, balance) VALUES (99, 0)", (o, e) => /violates foreign key constraint "account_cust_id_fkey".*not present in table "customer"/.test(e));
t('FK delete msg', "DELETE FROM customer WHERE cust_id = 1", (o, e) => /still referenced from table "account"/.test(e));
t('not-null msg', "INSERT INTO customer (fname) VALUES ('Z')", (o, e) => /null value in column "lname" of relation "customer" violates not-null constraint/.test(e));
t('CHECK', "UPDATE account SET balance = -1 WHERE account_id = 1", (o, e) => /violates check constraint/.test(e));
t('enum invalid', "INSERT INTO txn (account_id, kind) VALUES (1, 'dbt')", (o, e) => /invalid input value for enum txn_kind: "dbt"/.test(e));
t('varchar too long', "INSERT INTO customer (fname, lname) VALUES ('abcdefghijklmnopqrstuvwxyz', 'x')", (o, e) => /value too long for type character varying\(20\)/.test(e));
t('bad integer', "INSERT INTO account (cust_id, balance) VALUES ('abc', 0)", (o, e) => /invalid input syntax for type integer: "abc"/.test(e));
t('boolean from int rejected', "INSERT INTO customer (fname, lname, vip) VALUES ('a','b', 1)", (o, e) => /of type boolean but expression is of type integer/.test(e));
t('boolean compare', "SELECT fname FROM customer WHERE vip = false OR vip IS NULL", (o) => rows(o).length === 2);
t('unknown column msg', "SELECT nope FROM customer", (o, e) => e === 'column "nope" does not exist');
t('unknown table msg', "SELECT * FROM nope", (o, e) => e === 'relation "nope" does not exist');
t('ambiguous msg', "SELECT cust_id FROM customer c JOIN account a ON a.cust_id = c.cust_id", (o, e) => /column reference "cust_id" is ambiguous/.test(e));
t('syntax error style', "SELEC * FROM customer", (o, e) => /^syntax error at or near "SELEC"/.test(e));
t('double-quoted identifier', 'SELECT "fname" FROM "customer" WHERE cust_id = 1', (o) => rows(o)[0][0] === 'George');
t('backticks rejected', 'SELECT `fname` FROM customer', (o, e) => /double quotes/.test(e));
t('AUTO_INCREMENT hint', 'CREATE TABLE x (id int AUTO_INCREMENT PRIMARY KEY)', (o, e) => /GENERATED ALWAYS AS IDENTITY/.test(e));
t('inline ENUM hint', "CREATE TABLE x (k enum('a'))", (o, e) => /CREATE TYPE/.test(e));
t('UPDATE LIMIT rejected', 'UPDATE customer SET vip = true LIMIT 1', (o, e) => /no UPDATE … LIMIT/.test(e));
t('SHOW TABLES hint', 'SHOW TABLES', (o, e) => /\\dt/.test(e));
t('\\dt', '\\dt', (o) => rows(o).length === 3);
t('\\d table', '\\d customer', (o) => rows(o)[0][3].startsWith('generated always'));
t(':: cast', "SELECT '42'::integer + 1 AS n, amount::text AS a FROM txn WHERE txn_id = 1", (o) => rows(o)[0][0] === 43 && rows(o)[0][1] === '100');
t('CAST()', "SELECT CAST('2024-01-22' AS date) AS d", (o) => rows(o)[0][0] === '2024-01-22');
t('timestamp normalised', 'SELECT at FROM txn ORDER BY txn_id', (o) => rows(o)[0][0] === '2024-01-22 10:15:00' && rows(o)[1][0] === '2024-02-05 00:00:00');
t('bad date', "INSERT INTO txn (account_id, kind, at) VALUES (1, 'DBT', '2024-02-30')", (o, e) => /invalid input syntax for type timestamp/.test(e));
t('numeric overflow', "UPDATE account SET balance = 123456789 WHERE account_id = 1", (o, e) => /numeric field overflow/.test(e));
t('DEFAULT keyword', "INSERT INTO customer (fname, lname, vip) VALUES ('a', 'b', DEFAULT) RETURNING vip", (o) => rows(o)[0][0] === false);
t('rollback', "BEGIN; DELETE FROM txn; ROLLBACK; SELECT txn_id FROM txn", (o) => rows(o).length === 2 && o[0].msg.startsWith('BEGIN'));
t('rollback without tx warns', "ROLLBACK", (o) => /WARNING: there is no transaction/.test(o[0].msg));
t('drop dependent table', "DROP TABLE customer", (o, e) => /other objects depend on it/.test(e));
t('mysql mode still case-insensitive', "", () => { const d = M.create(`CREATE TABLE p (n varchar(9)); INSERT INTO p VALUES ('Ann')`); return d.exec("SELECT n FROM p WHERE n = 'ann'")[0].rows.length === 1; });
t('mysql: || is OR, RETURNING rejected', "", () => { const d = M.create(`CREATE TABLE p (n int); INSERT INTO p VALUES (1)`); let e; try { d.exec('DELETE FROM p RETURNING n'); } catch (x) { e = x.message; } return /RETURNING is PostgreSQL/.test(e) && d.exec('SELECT n FROM p WHERE 0 || 1')[0].rows.length === 1; });
console.log(`\n${pass} passed, ${fail} failed`);
