// Develop against a real vault with hot reload.
//
//   npm run dev:vault -- "~/Documents/My Test Vault"     install, then watch: every rebuild lands in the vault
//   npm run dev:vault -- "~/Documents/My Test Vault" --once   install the current build once and exit
//
// With no vault given it uses ~/Documents/DevVault (the vault deploy.sh uses).
//
// It installs pjeby's Hot Reload plugin into the vault (downloaded from its
// latest GitHub release the first time), enables it and Ember Vault, and puts a
// `.hotreload` file in Ember Vault's plugin folder. Hot Reload then reloads the
// plugin in Obsidian whenever main.js or styles.css changes there, so a save in
// your editor shows up in Obsidian a moment later with no restart.

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ID = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).id;
const HOT_RELOAD = 'https://github.com/pjeby/hot-reload/releases/latest/download';
const FILES = ['main.js', 'manifest.json', 'styles.css'];

const args = process.argv.slice(2);
const once = args.includes('--once');
const given = args.find(a => !a.startsWith('--'));
const vault = resolve((given ?? '~/Documents/DevVault').replace(/^~(?=$|\/)/, homedir()));
if (!existsSync(vault)) {
	console.error(`No vault at ${vault}. Make the folder (or open it in Obsidian once) first.`);
	process.exit(1);
}

const pluginsDir = join(vault, '.obsidian', 'plugins');
const ours = join(pluginsDir, PLUGIN_ID);

/** Hot Reload in the vault, enabled, with Ember Vault marked for reloading. */
async function installHotReload() {
	const dir = join(pluginsDir, 'hot-reload');
	mkdirSync(dir, { recursive: true });
	for (const f of ['main.js', 'manifest.json']) {
		if (existsSync(join(dir, f))) continue;
		const res = await fetch(`${HOT_RELOAD}/${f}`);
		if (!res.ok) throw new Error(`Couldn't download Hot Reload's ${f}: ${res.status} ${res.statusText}`);
		writeFileSync(join(dir, f), Buffer.from(await res.arrayBuffer()));
		console.log(`  installed Hot Reload ${f}`);
	}
	mkdirSync(ours, { recursive: true });
	writeFileSync(join(ours, '.hotreload'), '');
	const listFile = join(vault, '.obsidian', 'community-plugins.json');
	const enabled = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : [];
	for (const id of [PLUGIN_ID, 'hot-reload']) if (!enabled.includes(id)) enabled.push(id);
	writeFileSync(listFile, JSON.stringify(enabled, null, 2));
}

/** Copy the built plugin into the vault (Hot Reload notices and reloads it). */
function copyBuild(quiet = false) {
	mkdirSync(ours, { recursive: true });
	for (const f of FILES) {
		if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(ours, f));
	}
	if (!quiet) console.log(`  → ${ours} (${new Date().toLocaleTimeString()})`);
}

await installHotReload();
console.log(`Hot Reload is set up in ${vault}`);

if (once) {
	if (!existsSync(join(ROOT, 'main.js'))) {
		console.error('No main.js yet: run npm run build first.');
		process.exit(1);
	}
	copyBuild();
	process.exit(0);
}

// Watch: esbuild rebuilds main.js on every source change; styles.css is copied when it changes.
console.log('Watching. Save a file and Obsidian reloads Ember Vault. Ctrl+C to stop.');
let timer = null;
const soon = () => { clearTimeout(timer); timer = setTimeout(() => copyBuild(), 150); };
// Watch the folder rather than the files: a build may replace main.js rather than rewrite it.
watch(ROOT, (_event, name) => { if (name === 'main.js' || name === 'styles.css') soon(); });
const build = spawn(process.execPath, [join(ROOT, 'esbuild.config.mjs')], { cwd: ROOT, stdio: 'inherit' });
build.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => { build.kill('SIGINT'); process.exit(0); });
