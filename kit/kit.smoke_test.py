#!/usr/bin/env python3
"""SQL lesson kit · smoke test.
python3 kit.smoke_test.py dist/lesson-01.html [--mobile] [--dark]      # file:// (MiniSQL lessons, or --inline builds)
python3 kit.smoke_test.py http://localhost:8080/lesson-02.html          # PGlite lessons: start `npm run lessons` first
- loads the page in headless Chromium, waits for window.__dbReady (database started, deck built), reports page errors (font 403s are expected offline)
- visits every slide with all [data-step] parts revealed, saves shots/sNN.png
- writes contact sheets shots/sheetK.png (6 slides each) -> view them to review layout
- checks: every data-gate has a matching #id container, every LESSON.items key has a gate, review targets resolve
"""
import os, sys
from playwright.sync_api import sync_playwright
from PIL import Image
f = sys.argv[1]; mobile = '--mobile' in sys.argv; dark = '--dark' in sys.argv
os.makedirs('shots', exist_ok=True)
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
vw = (390, 844) if mobile else (1440, 900)
with sync_playwright() as p:
    try: b = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
    except Exception: b = p.chromium.launch(channel='chrome')      # no Playwright browser installed: use the system Chrome
    ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, color_scheme='dark' if dark else 'light')
    ctx.route('**/fonts.g*/**', lambda r: r.abort())   # offline/slow Google Fonts would stall the load event; fonts fall back
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.goto(f if f.startswith('http') else 'file://' + os.path.abspath(f))
    try: pg.evaluate('window.__dbReady')   # awaits the promise
    except Exception as e: errs.append('NOT READY ' + str(e)[:200])
    pg.wait_for_timeout(700)
    print('static checks:', pg.evaluate('''() => {
      const out = [];
      document.querySelectorAll('[data-gate]').forEach(s => { const g = s.dataset.gate; if (!document.getElementById(g)) out.push('gate without container: ' + g); if (!LESSON.items[g]) out.push('gate not in LESSON.items: ' + g); });
      Object.entries(LESSON.items).forEach(([k, v]) => { if (!document.querySelector(`[data-gate="${k}"]`)) out.push('item without gated slide: ' + k);
        if (typeof v.review === 'string' && !document.getElementById(v.review)) out.push('review target missing: ' + v.review); });
      return out.length ? out : 'ok'; }'''))
    n = pg.evaluate('N')
    for i in range(n):
        pg.evaluate(f'go({i})'); pg.wait_for_timeout(300)
        pg.evaluate('document.querySelectorAll(".slide.active [data-step]").forEach(e=>e.classList.add("shown"))'); pg.wait_for_timeout(150)
        pg.screenshot(path=f'shots/s{i:02d}.png')
    b.close()
fs = [f'shots/s{i:02d}.png' for i in range(n)]
W, H = (vw[0] // 2, vw[1] // 2) if not mobile else (vw[0], vw[1])
cols = 2 if not mobile else 4; per = 6 if not mobile else 4
for k in range(0, n, per):
    ims = [Image.open(x).resize((W, H)) for x in fs[k:k + per]]
    rows = (len(ims) + cols - 1) // cols
    sh = Image.new('RGB', (W * cols, H * rows), 'black')
    for j, im in enumerate(ims): sh.paste(im, ((j % cols) * W, (j // cols) * H))
    sh.save(f'shots/sheet{k // per}.png')
print(f'{n} slides; sheets in shots/;', '\n'.join(errs) or 'no JS errors')
