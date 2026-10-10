// Static dev server for the built lessons: npm run lessons  (PORT=8080 by default)
// Serves dist/ at / and maps /vendor/pglite/* to node_modules/@electric-sql/pglite/dist/*,
// so there is no copy step and the engine files are cached once for every lesson.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const VENDOR = path.join(root, 'node_modules/@electric-sql/pglite/dist');
const PORT = Number(process.env.PORT) || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

if (!fs.existsSync(VENDOR)) { console.error('PGlite is not installed. Run: npm install'); process.exit(1); }

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  const [base, rel] = p.startsWith('/vendor/pglite/') ? [VENDOR, p.slice('/vendor/pglite/'.length)] : [DIST, p === '/' ? '' : p.slice(1)];
  const file = path.resolve(base, rel);
  return file === base || file.startsWith(base + path.sep) ? file : null;   // no path traversal
}

http.createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) { res.writeHead(403).end('forbidden'); return; }
  if (file === DIST) {
    const links = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter((f) => f.endsWith('.html')).sort() : [];
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(`<!doctype html><meta charset=utf-8><title>SQL lessons</title><body style="font:16px system-ui;max-width:640px;margin:48px auto"><h1>SQL lessons</h1>${links.length ? `<ul>${links.map((f) => `<li><a href="/${f}">${f}</a></li>`).join('')}</ul>` : '<p>No lessons in dist/ yet. Build one: <code>python3 kit/kit.build.py 01 --dirs lessons kit --out dist/lesson-01.html</code></p>'}`);
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    const vendor = file.startsWith(VENDOR);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': vendor ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Lessons: http://localhost:${PORT}/  (serving dist/ + PGlite from node_modules)`));
