// Bundles PGlite into one classic-script IIFE (global `PGliteMod`) for `kit.build.py --inline`.
// Output: build/pglite.iife.js
// import.meta.url is defined as a dummy base: PGlite calls new URL("./x.wasm", import.meta.url) eagerly,
// which throws in an inline classic script. The URLs are never fetched because the build passes
// pgliteWasmModule / initdbWasmModule / fsBundle explicitly.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js');
if (!fs.existsSync(entry)) { console.error('PGlite is not installed. Run: npm install'); process.exit(1); }
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const out = path.join(root, 'build/pglite.iife.js');
await build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'PGliteMod', platform: 'browser', minify: true, define: { 'import.meta.url': '"https://pglite.invalid/"' }, outfile: out, logLevel: 'warning' });
console.log(`wrote build/pglite.iife.js (${Math.round(fs.statSync(out).size / 1024)} KB)`);
