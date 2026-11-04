// Launches an isolated copy of Obsidian (its own user-data dir and a throwaway
// vault copied from e2e/fixtures/vault), installs the freshly built plugin and
// connects to it over the Chrome DevTools Protocol with playwright-core.
//
// Nothing here touches the user's real Obsidian config or vaults.

import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_VAULT = join(ROOT, 'e2e', 'fixtures', 'vault');
const PLUGIN_ID = 'nimble-statblocks';

const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN || {
	darwin: '/Applications/Obsidian.app/Contents/MacOS/Obsidian',
	linux: '/usr/bin/obsidian',
	win32: join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
}[process.platform];

function freePort() {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

async function waitFor(fn, { timeout = 30000, interval = 250, what = 'condition' } = {}) {
	const start = Date.now();
	let lastErr;
	while (Date.now() - start < timeout) {
		try {
			const v = await fn();
			if (v) return v;
		} catch (e) { lastErr = e; }
		await new Promise(r => setTimeout(r, interval));
	}
	throw new Error(`Timed out waiting for ${what}${lastErr ? `: ${lastErr.message}` : ''}`);
}

export async function launchObsidian({ settings } = {}) {
	if (!existsSync(OBSIDIAN_BIN)) throw new Error(`Obsidian not found at ${OBSIDIAN_BIN}. Set OBSIDIAN_BIN.`);
	for (const f of ['main.js', 'manifest.json', 'styles.css']) {
		if (!existsSync(join(ROOT, f))) throw new Error(`${f} missing, run npm run build first`);
	}

	const work = mkdtempSync(join(tmpdir(), 'nimble-e2e-'));
	const vault = join(work, 'vault');
	const userData = join(work, 'userdata');
	cpSync(FIXTURE_VAULT, vault, { recursive: true });
	const pluginDir = join(vault, '.obsidian', 'plugins', PLUGIN_ID);
	mkdirSync(pluginDir, { recursive: true });
	for (const f of ['main.js', 'manifest.json', 'styles.css']) cpSync(join(ROOT, f), join(pluginDir, f));
	if (settings) writeFileSync(join(pluginDir, 'data.json'), JSON.stringify(settings));
	writeFileSync(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify([PLUGIN_ID]));
	mkdirSync(userData, { recursive: true });
	writeFileSync(join(userData, 'obsidian.json'), JSON.stringify({
		vaults: { e2evault000000001: { path: vault, ts: Date.now(), open: true } },
		updateDisabled: true,
	}));

	const port = await freePort();
	const proc = spawn(OBSIDIAN_BIN, [
		`--user-data-dir=${userData}`,
		`--remote-debugging-port=${port}`,
		// Obsidian waits on animation frames when opening notes. Without these, a
		// background window (or a sleeping display) can stall a test for minutes.
		'--disable-renderer-backgrounding',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
	], { stdio: ['ignore', 'pipe', 'pipe'] });
	if (process.platform === 'darwin') {
		// Keep the display awake for as long as the test Obsidian runs.
		spawn('caffeinate', ['-d', '-i', '-w', String(proc.pid)], { stdio: 'ignore', detached: true }).unref();
	}
	let log = '';
	proc.stdout.on('data', d => { log += d; });
	proc.stderr.on('data', d => { log += d; });
	const killProc = async () => {
		if (proc.exitCode !== null || proc.signalCode !== null) return;
		proc.kill('SIGTERM');
		const exited = await Promise.race([
			new Promise(r => proc.once('exit', () => r(true))),
			new Promise(r => setTimeout(() => r(false), 3000)),
		]);
		if (!exited) proc.kill('SIGKILL');
	};
	// Never leave a test Obsidian running, even if the runner crashes or is interrupted.
	const killNow = () => { try { proc.kill('SIGKILL'); } catch { /* already gone */ } };
	process.once('exit', killNow);
	for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { killNow(); process.exit(130); });

	const browser = await waitFor(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`), { what: 'Obsidian debug port' });
	const page = await waitFor(() => browser.contexts()[0]?.pages().find(p => p.url().includes('index.html')), { what: 'Obsidian window' });
	const consoleErrors = [];
	page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
	page.on('pageerror', e => consoleErrors.push(String(e)));

	try {
		await waitFor(() => page.evaluate(() => !!window.app?.workspace?.layoutReady), { what: 'workspace layout' });
		// A fresh profile starts in restricted mode and may show a trust prompt.
		// Turn community plugins on through the API and close whatever dialog is up.
		await page.evaluate(async (id) => {
			const plugins = window.app.plugins;
			if (!plugins.isEnabled()) await plugins.setEnable(true);
			if (!plugins.plugins[id]) await plugins.enablePlugin(id);
			document.querySelectorAll('.modal-container').forEach(m => m.remove());
		}, PLUGIN_ID);
		await waitFor(() => page.evaluate(id => !!window.app.plugins?.plugins?.[id]?._loaded, PLUGIN_ID), { what: 'plugin to load' });
	} catch (e) {
		await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
		await killProc();
		throw new Error(`${e.message}\n--- obsidian log ---\n${log}`);
	}

	const obsidian = {
		page, browser, vault, work, consoleErrors,
		get log() { return log; },
		waitFor,
		/** Run a function inside Obsidian with `app` and `plugin` in scope. */
		eval: (fn, arg) => page.evaluate(async ([src, a]) => {
			const app = window.app;
			const plugin = app.plugins.plugins['nimble-statblocks'];
			const result = await (0, eval)(`(${src})`)(app, plugin, a);
			// Only plain data can cross back to Node; drop Obsidian objects like TFile.
			try { return result === undefined ? undefined : JSON.parse(JSON.stringify(result)); } catch { return undefined; }
		}, [fn.toString(), arg]),
		async openFile(path, mode = 'preview') {
			await obsidian.eval(async (app, _p, [path, mode]) => {
				const leaf = app.workspace.getLeaf(false);
				await leaf.openFile(app.vault.getAbstractFileByPath(path), { state: { mode } });
				app.workspace.setActiveLeaf(leaf, { focus: true });
			}, [path, mode]);
			await page.waitForTimeout(400);
		},
		async close() {
			// Disconnecting from a CDP-attached browser can hang; never wait long.
			await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
			await killProc();
			if (!process.env.KEEP_E2E) rmSync(work, { recursive: true, force: true });
		},
	};
	return obsidian;
}
