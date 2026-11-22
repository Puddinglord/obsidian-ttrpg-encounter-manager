// The e2e suite split across several hidden Obsidians at once (npm run test:e2e).
//
//   node e2e/parallel.mjs                 every test, in 3 slices side by side
//   node e2e/parallel.mjs 5e              only tests whose name contains "5e"
//   node e2e/parallel.mjs --shards=4      more slices (each is one Obsidian; mind the machine)
//
// Each slice is run.mjs with E2E_SHARD=k/n: a contiguous run of tests sized by how long each took last time
// (artifacts/timings.json, which this updates). A slice's full log is artifacts/shard-k.log; this prints each
// slice's tally as it finishes, then every failure and the total.

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, 'artifacts');
const args = process.argv.slice(2);
const n = Number(args.find(a => a.startsWith('--shards='))?.split('=')[1] ?? 3);
const filter = args.filter(a => !a.startsWith('--'));
mkdirSync(ARTIFACTS, { recursive: true });
// A fresh artifacts folder (as run.mjs makes for itself when it runs alone), keeping the visual check's and the timings.
for (const f of readdirSync(ARTIFACTS)) if (f !== 'visual' && f !== 'timings.json') rmSync(join(ARTIFACTS, f), { recursive: true, force: true });

const started = Date.now();
// Stopped (Ctrl+C), this stops its slices too, so no Obsidian is left running.
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) c.kill('SIGTERM'); process.exit(130); });
const runShard = (k) => new Promise((done) => {
	const log = join(ARTIFACTS, `shard-${k}.log`);
	rmSync(join(ARTIFACTS, `timings-${k}.json`), { force: true });
	const out = createWriteStream(log);
	const child = spawn(process.execPath, [join(HERE, 'run.mjs'), ...filter], { env: { ...process.env, E2E_SHARD: `${k}/${n}` }, stdio: ['ignore', 'pipe', 'pipe'] });
	children.add(child);
	child.stdout.pipe(out);
	child.stderr.pipe(out);
	child.on('close', (code) => {
		children.delete(child);
		out.end(() => {
			let text = '';
			try { text = readFileSync(log, 'utf8'); } catch { /* no log: reported as stopped below */ }
			const tally = text.match(/^(\d+)\/(\d+) passed in ([\d.]+)s$/m);
			console.log(`  slice ${k}/${n}: ${tally ? `${tally[1]}/${tally[2]} passed in ${Math.round(Number(tally[3]))}s` : `stopped (exit ${code}), see ${log}`}`);
			done({ k, code, text, tally });
		});
	});
});

// Start them a moment apart, so the Obsidians don't all load at once.
const shards = [];
for (let k = 1; k <= n; k++) {
	shards.push(runShard(k));
	if (k < n) await new Promise(r => setTimeout(r, 1500));
}
const results = await Promise.all(shards);

// Merge what each test took, for the next split.
const file = join(ARTIFACTS, 'timings.json');
let all = {};
try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
for (let k = 1; k <= n; k++) {
	const part = join(ARTIFACTS, `timings-${k}.json`);
	if (existsSync(part)) { try { Object.assign(all, JSON.parse(readFileSync(part, 'utf8'))); } catch { /* skip */ } rmSync(part, { force: true }); }
}
writeFileSync(file, JSON.stringify(all));

let passed = 0, total = 0, broken = false;
for (const r of results) {
	if (r.tally) { passed += Number(r.tally[1]); total += Number(r.tally[2]); } else broken = true;
	// Each failure: its ✗ line and the indented lines under it.
	const failures = r.text.split('\n').reduce((acc, line) => {
		if (line.startsWith('  ✗ ')) acc.push([line]);
		else if (acc.length && /^ {6}/.test(line) && !acc[acc.length - 1].done) acc[acc.length - 1].push(line);
		else if (acc.length) acc[acc.length - 1].done = true;
		return acc;
	}, []);
	for (const f of failures) console.log(f.join('\n'));
}
console.log(`\n${passed}/${total} passed in ${Math.round((Date.now() - started) / 1000)}s across ${n} Obsidians${broken ? ' (a slice stopped early: see its log)' : ''}`);
process.exit(broken || passed < total ? 1 : 0);
