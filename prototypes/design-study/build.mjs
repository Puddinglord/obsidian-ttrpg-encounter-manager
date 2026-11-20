// Builds the design study: every file in src/ joined in name order (CSS, then the body, then JS),
// into ../encounter-design-study.html. A later file overrides an earlier one, so a refinement can
// live in its own file next to what it refines.
//
//   node prototypes/design-study/build.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./src/', import.meta.url));
const outFile = fileURLToPath(new URL('../encounter-design-study.html', import.meta.url));
const files = readdirSync(dir).sort();
const part = ext => files.filter(f => f.endsWith(ext)).map(f => `/* ---- ${f} ---- */\n` + readFileSync(dir + f, 'utf8')).join('\n');
const read = f => readFileSync(dir + f, 'utf8');
const out = read('00-head.html') + part('.css') + read('80-body.html') + part('.js') + read('zz-tail.html');
writeFileSync(outFile, out);
console.log('built', out.length, 'bytes');
