// Builds the landing page into _site/: the static files in site/, the
// screenshots, the plugin's stylesheet, and the live demo (demo/), which runs
// the plugin's own UI code against a small Obsidian stand-in.
//
//   node scripts/build-site.mjs            build once
//   node scripts/build-site.mjs --serve    build, then serve on http://localhost:8765
import esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDocs } from './build-docs.mjs';
import { buildChangelog } from './build-changelog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'images'), { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
buildDocs({ root, out });
const releases = buildChangelog({ root, out });
// The landing page's "New in" chip links the latest release.
const latest = releases[0];
if (latest) {
	const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const html = readFileSync(join(out, 'index.html'), 'utf8').replace(
		/<!-- latest-release -->[\s\S]*?<!-- \/latest-release -->/,
		`<a class="new-chip" href="changelog/${latest.version}/"><b><span class="t">New in ${esc(latest.version)}</span></b><span>${esc(latest.title)}</span></a>`,
	);
	writeFileSync(join(out, 'index.html'), html);
}
for (const f of readdirSync(join(root, 'docs/images'))) {
	if (f.endsWith('.png')) cpSync(join(root, 'docs/images', f), join(out, 'images', f));
}
cpSync(join(root, 'styles.css'), join(out, 'plugin.css'));

const options = {
	entryPoints: [join(root, 'demo/demo.ts'), join(root, 'demo/gate.ts')],
	bundle: true,
	format: 'esm',
	splitting: true, // three.js loads on the first 3D roll
	outdir: join(out, 'demo'),
	target: 'es2020',
	minify: true,
	sourcemap: false,
	loader: { '.md': 'text' },
	alias: {
		obsidian: join(root, 'demo/obsidian-shim.ts'),
		'sample-vault-settings': join(root, 'sample-vault', '.obsidian', 'plugins', 'nimble-gm', 'data.json'),
	},
	logLevel: 'info',
	metafile: true,
};

const result = await esbuild.build(options);
const sizes = Object.entries(result.metafile.outputs).map(([f, o]) => `${f.replace(out + '/', '')} ${(o.bytes / 1024).toFixed(0)} kB`);
console.log(sizes.join('\n'));

if (process.argv.includes('--serve')) {
	const { host, port } = await (await esbuild.context({ ...options, logLevel: 'silent' })).serve({ servedir: out, port: 8765 });
	console.log(`Serving _site on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
}
