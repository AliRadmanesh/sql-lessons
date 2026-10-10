#!/usr/bin/env python3
"""SQL lesson kit · lab play-through.
python3 kit.play_test.py dist/lesson-01.html            # file:// (MiniSQL or --inline)
python3 kit.play_test.py http://localhost:8080/lesson-99.html
For every lab, in a fresh browser context each: submit the reference solution (expect full points),
submit `SELECT 1;` (expect partial or zero, no crash), submit broken SQL (expect it rejected, not graded).
For every checkpoint: answer every part correctly (expect full points) and with deliberately wrong answers (expect fewer).
Exit code 1 if any lab misbehaves or the page logs errors.
"""
import os, sys
from playwright.sync_api import sync_playwright
f = sys.argv[1]; url = f if f.startswith('http') else 'file://' + os.path.abspath(f)
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
bad = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: bad.append(msg)
with sync_playwright() as p:
    try: b = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
    except Exception: b = p.chromium.launch(channel='chrome')
    def page():
        ctx = b.new_context(); ctx.route('**/fonts.g*/**', lambda r: r.abort())   # fonts never block the test
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg.goto(url); pg.evaluate('window.__dbReady'); return pg, errs
    pg, errs = page()
    labs = pg.evaluate('Object.keys(LABS)')
    pts = pg.evaluate('Object.fromEntries(Object.entries(LABS).map(([k, v]) => [k, v.def.pts]))')
    check(bool(labs), f'found labs {labs}')
    pg.context.close()
    for lab in labs:
        for case, sql in [('reference', None), ('wrong', 'SELECT 1;'), ('error', 'SELEC oops')]:
            pg, errs = page()
            if sql is None: sql = pg.evaluate(f'LABS["{lab}"].def.ref')
            pg.evaluate('([id, sql]) => { LABS[id].ed.set(sql); LABS[id].submit.click(); }', [lab, sql])
            try: pg.wait_for_function(f'state.res["{lab}"] !== undefined', timeout=15000)
            except Exception: pass
            score = pg.evaluate(f'state.res["{lab}"] ? state.res["{lab}"].score : null')
            if case == 'reference': check(score == pts[lab], f'{lab} reference solution scores {score}/{pts[lab]}')
            elif case == 'wrong': check(score is not None and score < pts[lab], f'{lab} SELECT 1 scores {score}/{pts[lab]}')
            else:
                pg.wait_for_timeout(500)
                check(score is None, f'{lab} broken SQL is rejected, not graded (score={score})')
            # only real page errors fail the run; SQL errors are shown in the UI, not thrown
            check(not errs, f'{lab}/{case}: no console errors {errs[:2] if errs else ""}')
            pg.context.close()
    # ---- checkpoints: right answers vs wrong answers, derived from each part's definition
    RIGHT = '''(id) => { const {def, apis} = CPS[id];
      def.parts.forEach((p, i) => { const a = apis[i]; let v;
        if (p.type === 'order') v = p.items.map((_, k) => k);
        else if (p.type === 'classify') v = p.rows.map((r) => r.a);
        else if (p.type === 'columns') v = p.tables.flatMap((t) => t.cols.map((c) => c[1]));
        else if (p.type === 'mcq') v = p.opts.map((o, k) => (o.ok ? k : -1)).filter((k) => k >= 0);
        else if (p.type === 'text') v = p.show || (Array.isArray(p.accept) ? p.accept[0] : '');
        a.set(v); }); apis.forEach((a) => a.complete()); CPS[id].submit.disabled = false; CPS[id].submit.click(); }'''
    WRONG = '''(id) => { const {def, apis} = CPS[id];
      def.parts.forEach((p, i) => { const a = apis[i]; let v;
        if (p.type === 'order') v = p.items.map((_, k) => k).reverse();
        else if (p.type === 'classify') v = p.rows.map((r) => (r.a + 1) % p.options.length);
        else if (p.type === 'columns') v = p.tables.flatMap((t) => t.cols.map((c) => (c[1] + 1) % p.options.length));
        else if (p.type === 'mcq') v = [p.opts.findIndex((o) => !o.ok)];
        else if (p.type === 'text') v = 'definitely not the answer';
        a.set(v); }); CPS[id].submit.disabled = false; CPS[id].submit.click(); }'''
    pg, errs = page()
    cps = pg.evaluate('Object.keys(CPS)'); maxes = pg.evaluate('Object.fromEntries(Object.entries(CPS).map(([k, v]) => [k, v.def.parts.reduce((a, p) => a + p.pts, 0)]))')
    pg.context.close()
    for cp in cps:
        for case, js in [('right', RIGHT), ('wrong', WRONG)]:
            pg, errs = page()
            pg.evaluate(js, cp)
            score = pg.evaluate(f'state.res["{cp}"] ? state.res["{cp}"].score : null')
            if case == 'right': check(score == maxes[cp], f'{cp} right answers score {score}/{maxes[cp]}')
            else: check(score is not None and score < maxes[cp], f'{cp} wrong answers score {score}/{maxes[cp]}')
            pg.reload(); pg.evaluate('window.__dbReady')
            check(pg.evaluate(f'state.res["{cp}"] && state.res["{cp}"].score') == score and pg.locator(f'#{cp} .fb').count() > 0, f'{cp}/{case}: graded view survives reload')
            check(not errs, f'{cp}/{case}: no console errors {errs[:2] if errs else ""}')
            pg.context.close()
    b.close()
sys.exit(1 if bad else 0)
