// Builds the GM screen study: the design study's library (every CSS file, and every JS file but its boot), so the
// screens are drawn with the same tokens, icons, Obsidian chrome and game parts; then this study's own files in
// src/ (CSS, the body, JS), into ../gm-screen-study.html. Read the design study's README for the rules both follow.
//
//   node prototypes/gm-screen-study/build.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lib = fileURLToPath(new URL('../design-study/src/', import.meta.url));
const own = fileURLToPath(new URL('./src/', import.meta.url));
const outFile = fileURLToPath(new URL('../gm-screen-study.html', import.meta.url));
const list = (dir, ext, skip = []) => readdirSync(dir).sort().filter(f => f.endsWith(ext) && !skip.includes(f)).map(f => `/* ---- ${f} ---- */\n` + readFileSync(dir + f, 'utf8'));
const css = [...list(lib, '.css'), ...list(own, '.css')].join('\n');
const js = [...list(lib, '.js', ['99-boot.js']), ...list(own, '.js')].join('\n');
const read = f => readFileSync(own + f, 'utf8');
const out = read('00-head.html') + css + read('80-body.html') + js + read('zz-tail.html');
writeFileSync(outFile, out);
console.log('built', out.length, 'bytes');
