$('#tcust').append(renderTable('customer'));
$('#tord').append(renderTable('orders'));
makeCheckpoint({ id: 'cp1', n: 1, title: 'Label the keys', parts: [
  { type: 'columns', title: 'Mark each column', pts: 10, options: ['PK', 'FK', '—'], explain: 'orders.customer_id points at customer.id.',
    tables: [{ name: 'customer', cols: [['id', 0], ['name', 2]] }, { name: 'orders', cols: [['id', 0], ['customer_id', 1]] }] },
] });
makePlayground({ root: '#playground', presets: '#pgpresets', schema: '#pgschema', start: 'SELECT * FROM customer;',
  items: [['dup', "INSERT INTO customer (id, name) VALUES (1, 'x');"], ['int div', 'SELECT 7/2 AS q, 7/2.0 AS r;'], ['\\dt', '\\dt'], ['\\d orders', '\\d orders']] });
const LAB1 = { id: 'lab1', n: 1, pts: 30, title: 'Pro customers', task: 'Return <b>name</b> of customers on tier <code class="i">pro</code>.',
  starter: '-- Lab 1\n', ref: "SELECT name FROM customer WHERE tier = 'pro';", explain: 'Filter on tier.' };
LAB1.grade = gradeSelect(LAB1, { superset: 10 });
const LAB2 = { id: 'lab2', n: 2, pts: 30, kind: 'dml', title: 'Add a customer', task: 'Insert customer <b>Margaret</b> on the default tier, returning the new row.',
  starter: '-- Lab 2\n', ref: "INSERT INTO customer (name) VALUES ('Margaret') RETURNING *;", check: 'SELECT * FROM customer ORDER BY id', explain: 'Identity assigns id 4.' };
LAB2.grade = gradeState(LAB2, { stateOnly: 0.5 });
const LAB3 = { id: 'lab3', n: 3, pts: 30, kind: 'dml', title: 'Add a column', task: 'The setup already added a <code class="i">vip</code> table. Insert one row into it.',
  setup: 'CREATE TABLE vip (customer_id integer PRIMARY KEY REFERENCES customer(id)); INSERT INTO vip VALUES (1);',
  starter: '-- Lab 3\n', ref: 'INSERT INTO vip VALUES (2);', check: 'SELECT * FROM vip ORDER BY 1', explain: 'One row.' };
LAB3.grade = gradeState(LAB3);
[LAB1, LAB2, LAB3].forEach(makeLab);
