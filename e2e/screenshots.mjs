// Product screenshots for the README, the user guide and the community
// directory listing. Opens the sample vault in an isolated Obsidian (see
// harness.mjs), drives it into each state and saves 1200×800 PNGs, the
// listing's desktop size, to docs/images/.
//
//   npm run screenshots            build, then take every shot
//   node e2e/screenshots.mjs map   only shots whose name contains "map"
//   THEME=dark node e2e/screenshots.mjs

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const VAULT = join(ROOT, 'sample-vault');
const C = 'Campaigns/The Old Quarter';
const CH = `${C}/1 The Quicksilver Vaults`;
const R = '.workspace-leaf.mod-active .markdown-reading-view';
const T = '.nimble-encounter-tracker';
const filter = process.argv[2];
mkdirSync(OUT, { recursive: true });

const o = await launchObsidian({ vaultDir: VAULT });
const { page } = o;
await page.setViewportSize({ width: 1200, height: 800 });
if (process.env.THEME === 'dark') await page.evaluate(() => { document.body.removeClass('theme-light'); document.body.addClass('theme-dark'); });

/** Sidebars: 'left' shows the Campaign panel, 'right' the tracker. */
async function layout({ left = false, right = false } = {}) {
	await o.eval(async (app, plugin, [left, right]) => {
		document.querySelectorAll('.menu, .nimble-popover, .modal-container').forEach(n => n.remove());
		plugin.hover.hide();
		// One tab only, so stale tabs from earlier shots don't show.
		const leaves = [];
		app.workspace.iterateRootLeaves(l => leaves.push(l));
		leaves.forEach(l => l.detach());
		if (left) { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); } else app.workspace.leftSplit.collapse();
		if (right) { app.workspace.rightSplit.expand(); await plugin.activateEncounterView(false); } else app.workspace.rightSplit.collapse();
	}, [left, right]);
	await page.waitForTimeout(500);
}

async function open(path) {
	await o.openFile(path, 'preview');
	await page.waitForTimeout(900);
}

/** Scroll the active note so `selector` sits `at` (0–1) of the way down the screen. */
async function scrollTo(selector, at = 0.3) {
	await page.evaluate(([sel, at]) => {
		const el = document.querySelector(sel);
		const scroller = el?.closest('.markdown-preview-view');
		if (!el || !scroller) return;
		const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
		scroller.scrollTop = Math.max(0, top - scroller.clientHeight * at);
	}, [selector, at]);
	await page.waitForTimeout(500);
}

async function typeHp(label, text) {
	const row = page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: label }) }).first();
	await row.locator('.hp-display').click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(250);
}

async function resetTracker() {
	await o.eval(async (app, plugin) => {
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		plugin.encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
	});
}

const shots = {
	async 'campaign-panel'() {
		await layout({ left: true });
		await open(`${CH}/Q1 Entry Chamber.md`);
	},
	async 'encounter-block'() {
		await layout({ left: true });
		await open(`${CH}/Q3 The Calcinator.md`);
		await scrollTo(`${R} .nimble-encounter-block`, 0.35);
	},
	async tracker() {
		await resetTracker();
		await layout({ right: true });
		await open(`${CH}/Q6 Storage Vault.md`);
		await scrollTo(`${R} .nimble-encounter-block`, 0.2);
		await page.locator(`${R} .nimble-encounter-block .encounter-block-actions button`, { hasText: 'Run' }).click();
		await page.waitForTimeout(500);
		await page.locator(`${T} .round-action`).click();
		await page.waitForTimeout(200);
		for (const hero of ['Brakka', 'Wren', 'Ilse', 'Tomas']) {
			await page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: hero }) }).locator('.turn-toggle').click();
		}
		await typeHp('Quicksilver Hound-1', '20');
		await typeHp('Quicksilver Hound-2', '9');
		await typeHp('Quicksilver Hound-3', '6!');
		await typeHp('Brakka', '7');
		await page.evaluate((T) => {
			document.querySelectorAll('.notice').forEach(n => n.remove());
			const head = [...document.querySelectorAll(`${T} .side-header`)].find(h => /Monsters/.test(h.textContent));
			head?.scrollIntoView({ block: 'start' });
		}, T);
		await page.waitForTimeout(300);
	},
	async boss() {
		await resetTracker();
		await layout({ right: true });
		await open(`${CH}/Q7 Sacred Circle.md`);
		await scrollTo(`${R} .nimble-encounter-block`, 0.2);
		await page.locator(`${R} .nimble-encounter-block .encounter-block-actions button`, { hasText: 'Run' }).click();
		await page.waitForTimeout(500);
		await page.locator(`${T} .round-action`).click();
		await typeHp('The Alchemist', '31');
		await page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: 'Ilse' }) }).locator('.turn-toggle').click();
		await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
		await page.waitForTimeout(400);
	},
	async map() {
		await layout();
		await open(`${CH}/Map - The Quicksilver Vaults.md`);
		await scrollTo(`${R} .nimble-map`, 0.08);
	},
	async 'npc-card'() {
		await layout({ left: true });
		await open(`${C}/NPCs/Tobren Kask.md`);
		await scrollTo(`${R} .nimble-npc-card`, 0.06);
	},
	async bestiary() {
		await layout();
		await o.eval(async (app, plugin) => { await plugin.openBestiary(); });
		await page.waitForSelector('.nimble-bestiary .bestiary-row', { timeout: 5000 });
		await page.locator('.nimble-bestiary .bestiary-search-input').fill('quicksilver');
		await page.waitForTimeout(500);
		await page.locator('.nimble-bestiary .bestiary-row').first().click();
		await page.waitForTimeout(400);
	},
	async boxes() {
		await layout({ left: true });
		await open(`${CH}/Q2 Mercury Pool.md`);
		await scrollTo(`${R} .nimble-box.box-read-aloud`, 0.04);
	},
	async hover() {
		await layout({ left: true });
		await open(`${CH}/Q1 Entry Chamber.md`);
		await scrollTo(`${R} .nimble-encounter-block`, 0.7);
		await page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Construct' }).first().hover();
		await page.waitForTimeout(900);
	},
};

let failed = 0;
try {
	for (const [name, setup] of Object.entries(shots)) {
		if (filter && !name.includes(filter)) continue;
		try {
			await setup();
			await page.mouse.move(1199, 799); // no stray hover states (except the hover shot)
			if (name === 'hover') await page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Construct' }).first().hover();
			await page.waitForTimeout(300);
			const file = join(OUT, `${name}${process.env.THEME === 'dark' ? '-dark' : ''}.png`);
			await page.screenshot({ path: file });
			console.log(`  ✓ ${name}`);
		} catch (e) {
			failed++;
			console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
		}
	}
	if (o.consoleErrors.length) console.log('console errors:', o.consoleErrors);
} finally {
	await o.close();
}
process.exit(failed ? 1 : 0);
