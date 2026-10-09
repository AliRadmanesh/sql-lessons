#!/usr/bin/env python3
"""SQL lesson kit · build.py
Assembles one self-contained lesson HTML from kit.* files + lNN.* files.

Usage:  python3 kit.build.py 02 [--out lesson-02.html] [--dirs DIR ...]
Files are looked up in --dirs, then the current dir, then /mnt/project (project knowledge).
Per lesson (NN = two-digit id):
  lNN.config.js   required  const LESSON = {...}; contains `__SEED__`
  lNN.seed.sql    optional  falls back to the newest earlier lMM.seed.sql, then kit.seed-*.sql named in config (seedFile)
  lNN.slides.html required  <section class="slide"> ... only (no shell)
  lNN.viz.js      optional  custom visualizations
  lNN.content.js  required  makeCheckpoint / makePlayground / makeLab calls
Order in the output: engine -> config -> core -> viz -> content -> boot()
"""
import argparse, os, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('id'); ap.add_argument('--out'); ap.add_argument('--dirs', nargs='*', default=[])
a = ap.parse_args()
NN = a.id.zfill(2)
DIRS = a.dirs + [os.getcwd(), '/home/claude/kit', '/mnt/project']

def find(name, required=True):
    for d in DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p): return p
    if required: sys.exit(f'missing {name} (searched {DIRS})')
    return None
read = lambda p: open(p, encoding='utf-8').read()

cfg = read(find(f'l{NN}.config.js'))
seed_p = find(f'l{NN}.seed.sql', False)
m = re.search(r"seedFile:\s*'([^']+)'", cfg)
if not seed_p and m: seed_p = find(m.group(1))
if not seed_p:
    for k in range(int(NN) - 1, 0, -1):
        seed_p = find(f'l{k:02d}.seed.sql', False)
        if seed_p: break
seed = read(seed_p) if seed_p else ''
seed_js = seed.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
assert '__SEED__' in cfg, 'config must contain seed: `__SEED__`'
cfg = cfg.replace('__SEED__', seed_js)

viz_p = find(f'l{NN}.viz.js', False)
js = '\n'.join([read(find('kit.engine.js')), cfg, read(find('kit.core.js')),
                read(viz_p) if viz_p else '', read(find(f'l{NN}.content.js')), 'boot();'])
assert '</script' not in js.lower(), 'a </script> string would break the inline script'

title = re.search(r"title:\s*'([^']+)'", cfg).group(1)
total = sum(int(x) for x in re.findall(r'max:\s*(\d+)', cfg))
html = (read(find('kit.shell.html'))
        .replace('{{TITLE}}', title).replace('{{ID}}', NN).replace('{{TOTAL}}', str(total))
        .replace('{{STYLE}}', read(find('kit.style.css')))
        .replace('{{SLIDES}}', read(find(f'l{NN}.slides.html')))
        .replace('{{SCRIPT}}', js))
out = a.out or f'lesson-{NN}.html'
open(out, 'w', encoding='utf-8').write(html)
print(f'built {out}: {len(html)//1024} KB, total {total} pts, seed {os.path.basename(seed_p) if seed_p else "none"}')
