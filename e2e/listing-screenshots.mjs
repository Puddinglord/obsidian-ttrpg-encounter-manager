// Screenshots for the Obsidian community directory listing: five desktop shots
// at 1200×800 and five phone shots at 900×1600 (a 450×800 phone at 2×).
// Opens the sample vault in an isolated Obsidian (see harness.mjs).
//
//   npm run build && node e2e/listing-screenshots.mjs [outDir] [filter]
//   ONLY=desktop|phone node e2e/listing-screenshots.mjs
//
// Each shot is saved as <outDir>/<desktop|phone>-<n>-<name>.png. The dice shot
// grabs several frames of the throw (dice-frames/) and keeps the one taken as
// the result notice appears.

import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'listing-screenshots'));
const filter = process.argv[3];
const VAULT = join(ROOT, 'sample-vault');
const C = 'Campaigns/The Old Quarter';
const CH = `${C}/1 The Quicksilver Vaults`;
const R = '.workspace-leaf.mod-active .markdown-reading-view';
const T = '.nimble-encounter-tracker';
mkdirSync(OUT, { recursive: true });

// No `settings` here: that would replace the sample vault's data.json (and its party).
const o = await launchObsidian({ vaultDir: VAULT });
const { page } = o;
await o.eval((app, plugin) => { plugin.settings.dice3d = true; plugin.settings.dice3dOnPhone = true; });
const cdp = await page.context().newCDPSession(page);
let phone = false;

async function setDesktop() {
	phone = false;
	// Size both modes the same way (CDP), so neither override fights the other.
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
	await cdp.send('Emulation.setScrollbarsHidden', { hidden: false }).catch(() => {});
	await o.eval((app) => app.emulateMobile(false));
	await page.waitForTimeout(1200);
}

async function setPhone() {
	phone = true;
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: 450, height: 800, deviceScaleFactor: 2, mobile: true });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	// Phones overlay their scrollbars; desktop Chrome would reserve 16px for one.
	await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
	await o.eval((app) => app.emulateMobile(true));
	await page.waitForTimeout(1500);
	// Switching to mobile reloads the plugin from data.json; turn the phone dice back on.
	await o.waitFor(() => page.evaluate(() => !!window.app.plugins?.plugins?.['nimble-gm']?._loaded), { what: 'plugin after mobile switch' });
	await o.eval((app, plugin) => { plugin.settings.dice3d = true; plugin.settings.dice3dOnPhone = true; });
}

async function tap(locator) {
	const b = await locator.boundingBox();
	if (!b) throw new Error('nothing to tap');
	const x = b.x + b.width / 2, y = b.y + b.height / 2;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.waitForTimeout(300);
}

const press = (locator) => (phone ? tap(locator) : locator.click());

/** One tab, sidebars as asked (desktop only; phone drawers stay shut). */
async function layout({ left = false, right = false } = {}) {
	await o.eval(async (app, plugin, [left, right, phone]) => {
		document.querySelectorAll('.menu, .nimble-popover, .notice').forEach(n => n.remove());
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		plugin.hover.hide();
		const leaves = [];
		app.workspace.iterateRootLeaves(l => leaves.push(l));
		leaves.forEach(l => l.detach());
		if (phone) { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); return; }
		if (left) { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); } else app.workspace.leftSplit.collapse();
		if (right) { app.workspace.rightSplit.expand(); await plugin.activateEncounterView(false); } else app.workspace.rightSplit.collapse();
	}, [left, right, phone]);
	await page.waitForTimeout(500);
}

async function open(path) {
	await o.openFile(path, 'preview');
	await page.waitForTimeout(900);
}

/** Scroll the active note so `selector` sits `at` (0–1) of the way down the screen. */
async function scrollTo(selector, at = 0.3) {
	if (phone) at = Math.max(at, 0.12); // clear of the floating header buttons
	await page.evaluate(([sel, at, phone]) => {
		const el = document.querySelector(sel);
		const scroller = el?.closest('.markdown-preview-view');
		if (!el || !scroller) return;
		const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
		scroller.scrollTop = Math.max(0, top - scroller.clientHeight * at) + (phone ? 80 : 0);
	}, [selector, at, phone]);
	await page.waitForTimeout(500);
	// Obsidian mobile hides its header and toolbar on scroll down; a small scroll up brings them back.
	if (phone) {
		for (let k = 0; k < 4; k++) {
			await page.evaluate((sel) => { const sc = document.querySelector(sel)?.closest('.markdown-preview-view'); if (sc) sc.scrollTop -= 20; }, selector);
			await page.waitForTimeout(80);
		}
		await page.waitForTimeout(600);
	}
}

async function resetTracker() {
	await o.eval(async (app, plugin) => {
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		plugin.settings.mapTokens = {};
		plugin.encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
	});
}

const row = (label) => page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: label }) }).first();

async function typeHp(label, text) {
	await row(label).locator('.hp-display').click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(250);
}

/** Start the hounds fight in Q6 with some damage dealt, via the API (works on both layouts). */
async function houndsFight() {
	await resetTracker();
	await open(`${CH}/Q6 Storage Vault.md`);
	await scrollTo(`${R} .nimble-encounter-block`, 0.2);
	await press(page.locator(`${R} .nimble-encounter-block .encounter-block-actions button`, { hasText: 'Run' }));
	await page.waitForTimeout(600);
	await o.eval(async (app, plugin) => { await plugin.activateEncounterView(false); });
	await page.waitForTimeout(400);
	const round = page.locator(`${T} .round-action`).first();
	if (await round.count()) { await press(round); await page.waitForTimeout(300); }
	if (!phone) {
		for (const hero of ['Brakka', 'Wren', 'Ilse']) await row(hero).locator('.turn-toggle').click();
	}
	await o.eval(async (app, plugin, phone) => {
		const enc = plugin.encounters.active;
		// The phone drawer may be shut, so mark turns through the API there.
		if (phone) for (const c of enc.creatures) if (['Brakka', 'Wren', 'Ilse'].includes(c.label)) c.done = true;
		const dmg = { 'Quicksilver Hound-1': 16, 'Quicksilver Hound-2': 9, 'Quicksilver Hound-3': 5, Brakka: 7, Ilse: 4 };
		for (const c of enc.creatures) if (dmg[c.label] !== undefined) c.currentHp = Math.max(0, c.currentHp - dmg[c.label]);
		plugin.encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
	}, phone);
	await page.waitForTimeout(300);
}

/** Scroll the tracker so the Monsters header sits just under its sticky controls. */
async function scrollTrackerToMonsters() {
	await page.evaluate((T) => {
		const head = [...document.querySelectorAll(`${T} .side-header`)].find(h => /Monsters/.test(h.textContent));
		if (!head) return;
		let sc = head.parentElement;
		while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
		if (!sc) return;
		// An open combat log gives the list enough height to scroll the monsters up.
		sc.querySelectorAll('details').forEach(d => { d.open = true; });
		const controls = sc.querySelector('.tracker-controls');
		// The sticky controls shrink once the title scrolls away, so settle in a few passes.
		for (let k = 0; k < 3; k++) {
			const sticky = controls ? controls.getBoundingClientRect().bottom : sc.getBoundingClientRect().top;
			sc.scrollTop += head.getBoundingClientRect().top - sticky - 6;
		}
	}, T);
	await page.waitForTimeout(300);
}

const shots = [
	// 1. A room page: read-aloud, trap and skill-check boxes.
	['room-boxes', async () => {
		await layout({ left: true });
		await open(`${CH}/Q2 Mercury Pool.md`);
		await scrollTo(`${R} .nimble-box.box-read-aloud`, 0.04);
	}],
	// 2. 3D dice: a crit chain landing over a monster's stat block.
	['3d-dice', async (file) => {
		await resetTracker();
		await layout();
		await open(`${C}/Monsters/Mercury Ooze.md`);
		await scrollTo(`${R} .nimble-statblock`, phone ? 0.08 : 0.04);
		if (!phone) await page.mouse.move(5, 795);
		const frames = join(OUT, 'dice-frames');
		mkdirSync(frames, { recursive: true });
		const base = file.split('/').pop().replace('.png', '');
		let kept = null;
		// Each throw lands differently; take a few and pick the best frame by eye.
		for (let a = 0; a < Number(process.env.DICE_TRIES || 4); a++) {
			await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
			await o.eval((app, plugin) => { plugin.rollDice('2d6+2', 'Mercury Ooze: Engulfing Touch', 'attack', [6, 4, 6, 6, 3]); });
			let i = 0, seen = 0;
			const start = Date.now();
			while (Date.now() - start < 10000) {
				const hasCanvas = await page.locator('canvas.nimble-dice3d-overlay').count();
				const hasNotice = await page.locator('.nimble-roll-notice').count();
				if (!hasCanvas && i > 0) break;
				const f = join(frames, `${base}-try${a}-${String(i++).padStart(2, '0')}${hasNotice ? '-notice' : ''}.png`);
				await page.screenshot({ path: f, scale: phone ? 'device' : 'css' });
				// The second frame with the notice: it has finished sliding in by then.
				if (hasNotice && !kept && ++seen === 2) kept = f;
				await page.waitForTimeout(120);
			}
			await page.waitForTimeout(500);
		}
		if (!kept) throw new Error('the dice never showed a result');
		copyFileSync(kept, file);
		return 'saved';
	}],
	// 3. The GM map: pins, with the running fight's tokens in the storage vault.
	['map-pins', async () => {
		await houndsFight();
		await layout({ right: true });
		await open(`${CH}/Map - The Quicksilver Vaults.md`);
		await page.locator(`${R} .nimble-map-btn`, { hasText: 'Encounter tokens' }).first().click();
		await page.waitForTimeout(400);
		await o.eval(async (app, plugin) => {
			const enc = plugin.encounters.active;
			const key = Object.keys(plugin.settings.mapTokens || {})[0];
			const spots = {
				Brakka: [74, 78], Tomas: [81, 78], Wren: [77, 66], Ilse: [84, 66],
				'Quicksilver Hound-1': [73, 89], 'Quicksilver Hound-2': [80, 86], 'Quicksilver Hound-3': [86, 90], 'Quicksilver Hound-4': [86, 83],
			};
			const pos = {};
			for (const c of enc.creatures) if (spots[c.label]) pos[c.id] = { x: spots[c.label][0], y: spots[c.label][1] };
			Object.assign(plugin.settings.mapTokens[key], pos);
		});
		// Toggle off and on to redraw with the tokens placed.
		for (let k = 0; k < 2; k++) { await page.locator(`${R} .nimble-map-btn`, { hasText: 'Encounter tokens' }).first().click(); await page.waitForTimeout(300); }
		await scrollTo(`${R} .nimble-map`, 0.02);
	}],
	// 4. The tracker mid-fight with the HP calculator open.
	['tracker-hp', async () => {
		await layout({ right: true });
		await houndsFight();
		if (phone) {
			// Full-screen tracker in the main area, the way you'd run a fight on a phone.
			await o.eval(async (app) => {
				const old = app.workspace.getLeavesOfType('nimble-encounter-tracker');
				const leaf = app.workspace.getLeaf('tab');
				await leaf.setViewState({ type: 'nimble-encounter-tracker', active: true });
				old.forEach(l => l.detach());
				// Just the tracker tab, so the tab counter reads 1.
				const others = [];
				app.workspace.iterateRootLeaves(l => { if (l !== leaf) others.push(l); });
				others.forEach(l => l.detach());
				app.workspace.rightSplit.collapse();
				app.workspace.setActiveLeaf(leaf, { focus: true });
			});
			await page.waitForTimeout(900);
			await scrollTrackerToMonsters();
			// Hound-4 sits under the floating toolbar; Hound-3 is in clear view.
			await tap(row('Quicksilver Hound-3').locator('.hp-display'));
			await page.waitForTimeout(500);
			await tap(page.locator('.nimble-hp-pad button', { hasText: /^9$/ }).first());
			await tap(page.locator('.nimble-hp-pad button', { hasText: 'Vulnerable' }).first());
			await page.waitForTimeout(1200);
		} else {
			await scrollTrackerToMonsters();
			await row('Quicksilver Hound-4').locator('.hp-display').click();
			await page.waitForTimeout(300);
			await page.keyboard.type('9');
			await page.locator('.nimble-popover button', { hasText: 'Vulnerable' }).first().click();
		}
		await page.waitForTimeout(500);
	}],
	// 5. An encounter block rated for the party, with a monster's quick look.
	['encounter-quicklook', async () => {
		await resetTracker();
		await layout({ left: true });
		await open(`${CH}/Q1 Entry Chamber.md`);
		await scrollTo(`${R} .nimble-encounter-block`, phone ? 0.1 : 0.55);
		const name = page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Construct' }).first();
		if (phone) await tap(name);
		else await name.hover();
		await page.waitForTimeout(900);
		return phone ? undefined : 'keep-hover';
	}],
];

let failed = 0;
try {
	for (const mode of ['desktop', 'phone']) {
		if (process.env.ONLY && process.env.ONLY !== mode) continue;
		if (mode === 'desktop') await setDesktop(); else await setPhone();
		for (const [n, [name, setup]] of shots.entries()) {
			if (filter && !name.includes(filter)) continue;
			const file = join(OUT, `${mode}-${n + 1}-${name}.png`);
			try {
				const r = await setup(file);
				if (r === 'saved') { console.log(`  ✓ ${mode} ${name}`); continue; }
				if (r !== 'keep-hover' && !phone) await page.mouse.move(5, 795);
				await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
				await page.waitForTimeout(300);
				await page.screenshot({ path: file, scale: phone ? 'device' : 'css' });
				console.log(`  ✓ ${mode} ${name}`);
			} catch (e) {
				failed++;
				console.log(`  ✗ ${mode} ${name}: ${e.message.split('\n')[0]}`);
			}
		}
	}
	if (o.consoleErrors.length) console.log('console errors:', o.consoleErrors.slice(0, 10));
} finally {
	await o.close();
}
process.exit(failed ? 1 : 0);
