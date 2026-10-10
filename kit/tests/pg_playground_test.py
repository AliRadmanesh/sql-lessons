#!/usr/bin/env python3
"""PGlite driver regression test against the lesson-99 fixture (needs `npm run lessons` running).
Build the fixture first:  python3 kit/kit.build.py 99 --dirs kit/tests kit --out dist/lesson-99.html
Run:  python3 kit/tests/pg_playground_test.py [http://localhost:8080/lesson-99.html]
Checks real PostgreSQL behaviour through the playground: error text, psql tags, \\dt, \\d, integer division,
identity numbering after a snapshot restore, Reset, and the graded view surviving a reload."""
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080/lesson-99.html'
bad = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: bad.append(msg)
with sync_playwright() as p:
    try: b = p.chromium.launch()
    except Exception: b = p.chromium.launch(channel='chrome')
    pg = b.new_context().new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.goto(url); pg.evaluate('window.__dbReady'); pg.evaluate('go(3)')
    def play(sql):
        pg.evaluate("s => { document.querySelector('#playground textarea').value = s; }", sql)
        pg.evaluate("document.querySelector('#playground .btn.primary').click()")
        pg.wait_for_function("!document.querySelector('#playground .out:empty')", timeout=15000); pg.wait_for_timeout(400)
        return pg.inner_text('#playground .out')
    has = lambda out, *xs: all(x in out for x in xs)
    check(has(play("INSERT INTO customer (id, name) VALUES (1, 'x');"), 'GENERATED ALWAYS', 'ERROR:'), 'identity ALWAYS rejects explicit id')
    check(has(play("INSERT INTO customer (name) VALUES ('Z') RETURNING id, name;"), 'INSERT 0 1', '\n4\tZ'), 'first identity value after seed is 4 (no WAL-replay jump), RETURNING tag')
    q = play('SELECT 7/2 AS q, 7/2.0 AS r;'); check(has(q, '3\t3.5'), 'integer division is 3, numeric division is 3.5')
    check(has(play('\\dt'), 'customer', 'orders', 'postgres'), '\\dt lists tables')
    check(has(play('\\d orders'), 'customer_id', 'numeric(8,2)', 'generated always as identity'), '\\d orders describes columns')
    check(has(play("INSERT INTO orders (customer_id, amount, placed) VALUES (99, 1, '2026-01-01');"), 'violates foreign key constraint "orders_customer_id_fkey"', 'Key (customer_id)=(99)'), 'FK violation text')
    check(has(play("INSERT INTO orders (customer_id, amount, placed) VALUES (1, 1, 'nope');"), 'invalid input syntax for type date: "nope"'), 'bad date text')
    check(has(play("UPDATE customer SET tier = 'x';"), 'UPDATE 4', 'no WHERE'), 'UPDATE tag + missing-WHERE warning')
    check(has(play('SELECT * FROM nothing;'), 'relation "nothing" does not exist'), 'missing relation')
    check(has(play('CREATE TABLE t (a int); DROP TABLE t; SELEC 1;'), '#1 CREATE TABLE', '#2 DROP TABLE', 'syntax error at or near "SELEC"'), 'earlier statements keep their output when a later one fails')
    pg.evaluate("[...document.querySelectorAll('#playground .btn.ghost')].find(b => b.textContent === 'Reset database').click()"); pg.wait_for_timeout(1000)
    check(has(play('SELECT count(*) FROM customer;'), '\n3\n'), 'Reset restores the seed (3 customers)')
    pg.evaluate('LABS.lab1.ed.set(LABS.lab1.def.ref); LABS.lab1.submit.click()'); pg.wait_for_function('state.res.lab1 !== undefined', timeout=15000); pg.wait_for_timeout(500)
    pg.reload(); pg.evaluate('window.__dbReady'); pg.wait_for_function("document.querySelectorAll('#lab1 .cmp .rs').length === 2", timeout=15000)
    check('30 / 30' in pg.text_content('#lab1 .fb'), 'graded lab is rebuilt after reload')
    check(not errs, f'no console errors {errs[:2]}')
    b.close()
sys.exit(1 if bad else 0)
