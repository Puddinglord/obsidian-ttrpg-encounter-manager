// Builds the landing page into _site/: the static files in site/, the
// screenshots, the plugin's stylesheet, and the live demo (demo/), which runs
// the plugin's own UI code against a small Obsidian stand-in.
//
//   node scripts/build-site.mjs            build once
//   node scripts/build-site.mjs --serve    build, then serve on http://localhost:8765
import esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDocs } from './build-docs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'images'), { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
buildDocs({ root, out });
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
