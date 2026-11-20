// Product screenshots for the README, the user guide and the community
// directory listing. Opens the sample vault in an isolated Obsidian (see
// harness.mjs), drives it into each state and saves 1200×800 PNGs, the
// listing's desktop size, to docs/images/.
//
//   npm run screenshots            build, then take every shot
//   node e2e/screenshots.mjs map   only shots whose name contains "map"
//   THEME=dark node e2e/screenshots.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const VAULT = join(ROOT, 'sample-vault');
const C = 'Campaigns/The Old Quarter';
const CHAPTER = '1 The Quicksilver Vaults';
const CH = `${C}/${CHAPTER}`;
const R = '.workspace-leaf.mod-active .markdown-reading-view';
const T = '.nimble-encounter-tracker';
const filter = process.argv[2];
/** Several filters, comma-separated, take any shot matching one of them. */
const wanted = (name) => !filter || filter.split(',').some(f => name.includes(f));
mkdirSync(OUT, { recursive: true });

const o = await launchObsidian({ vaultDir: VAULT });
const { page } = o;
await page.setViewportSize({ width: 1200, height: 800 });
if (process.env.THEME === 'dark') await page.evaluate(() => { document.body.removeClass('theme-light'); document.body.addClass('theme-dark'); });

// The sample's quest, place, session and NPC notes say little in their properties; fill some in (in this run's
// copy of the vault, never sample-vault/) so their cards have something to show: who gave a quest, who's at a
// place, who was at the table, an NPC's numbers. A third quest, finished, sits below the open ones.
await o.eval(async (app) => {
	const C = 'Campaigns/The Old Quarter';
	const fm = async (path, fn) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.fileManager.processFrontMatter(f, fn); };
	const edit = async (path, fn) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.vault.process(f, fn); };
	await fm(`${C}/Quests/The Guild's Quiet Job.md`, (m) => { m.status = 'active'; });
	await edit(`${C}/Quests/Bring Wick Home.md`, t => t.replace('- [ ] Find Wick', '- [x] Find Wick'));
	await app.vault.create(`${C}/Quests/The Sealed Cellar.md`, [
		'---', 'nimble: quest', 'status: completed', 'type: side', 'giver: "[[Sister Odile Varr]]"', 'location: "[[The Alchemists\' Guild]]"', 'reward: Odile\'s blessing', '---', '',
		'## Objectives', '- [x] Find the bricked-up cellar under Lantern Row', '- [x] Tell Odile what\'s behind it', '',
	].join('\n'));
	await fm(`${C}/Locations/The Alchemists' Guild.md`, (m) => Object.assign(m, {
		type: 'guildhall', region: 'The Old Quarter', image: '[[Alchemy bench.png]]', leads: ['[[Q1 Entry Chamber]]'], monsters: ['City Guard'],
		secret: 'The Guild bricked up the cellar under Lantern Row a year before Vess went quiet.',
	}));
	await fm(`${C}/NPCs/Tobren Kask.md`, (m) => Object.assign(m, {
		ancestry: 'Dwarf', pronouns: 'he/him', age: 61, faction: "[[The Alchemists' Guild]]", location: "[[The Alchemists' Guild]]",
		status: 'alive', attitude: 'friendly', level: 3, armor: 'M', hp: 40, statblock: 'City Guard',
	}));
	await fm(`${C}/NPCs/Sister Odile Varr.md`, (m) => { m.location = "[[The Alchemists' Guild]]"; });
	const S = `${C}/Sessions/Session 1 - Silver Between the Stones.md`;
	await fm(S, (m) => Object.assign(m, {
		party: ['[[Brakka]]', '[[Ilse]]', '[[Tomas]]', '[[Wren]]'],
		quests: ["[[The Guild's Quiet Job]] new", '[[Bring Wick Home]] new', '[[The Sealed Cellar]] done'],
		loot: ['30 gp each, up front', "Vess's last letter"], next: 'Down the cellar stair, into Q1.',
	}));
	await edit(S, t => t.replace('*What happened, for next time.*', [
		'- Kask hired the party to find Magistrix Vess and bring back her notes.',
		'- Sister Odile showed them the bricked-up cellar under Lantern Row.',
		'- They broke through and found the stair going down.',
	].join('\n')));
});
await page.waitForTimeout(800);

/** Sidebars: 'left' shows the Campaign panel, 'right' the tracker. */
async function layout({ left = false, right = false } = {}) {
	await o.eval(async (app, plugin, [left, right]) => {
		document.querySelectorAll('.menu, .nimble-popover').forEach(n => n.remove());
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		plugin.hover.hide();
		plugin.spotlight?.close();
		document.getElementById('shot-focus')?.remove(); // focusPanel's hidden party cards
		// One tab only, so stale tabs from earlier shots don't show.
		const leaves = [];
		app.workspace.iterateRootLeaves(l => leaves.push(l));
		leaves.forEach(l => l.detach());
		if (left) { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); } else app.workspace.leftSplit.collapse();
		// The panel starts at the top, whatever an earlier shot scrolled to.
		app.workspace.leftSplit.containerEl.querySelectorAll('*').forEach(n => { if (n.scrollTop) n.scrollTop = 0; });
		if (right) { app.workspace.rightSplit.expand(); await plugin.runtime('nimble').activateEncounterView(false); } else app.workspace.rightSplit.collapse();
	}, [left, right]);
	// The builder asks before it closes with something typed in (the builder shot).
	const discard = page.locator('.modal-container button.mod-warning', { hasText: 'Discard' });
	if (await discard.count()) await discard.first().click();
	await page.waitForTimeout(500);
}

async function open(path) {
	await o.openFile(path, 'preview');
	await page.waitForTimeout(900);
}

/**
 * Collapse every chapter and folder in the Campaign panel except `keep` (a chapter or folder name,
 * like 'Quests'; null for none), scrolled to the top so the campaign and every heading show. Sets the
 * panel's own collapsed set, so it's per shot: the next shot's call replaces it. The party cards at
 * the top can't collapse, so they're hidden unless `keep` is 'Party' (layout() brings them back).
 */
async function focusPanel(keep) {
	await o.eval((app, plugin, keep) => {
		const view = app.workspace.getLeavesOfType('nimble-campaign')[0]?.view;
		const c = plugin.campaigns.active;
		if (!view || !c) return;
		const all = [...c.chapters.map(ch => [ch.name, ch.folder]), ...c.sections.map(s => [s.name, s.folder])];
		view.collapsed = new Set(all.filter(([name, folder]) => name !== keep && folder.split('/').pop() !== keep).map(([, folder]) => folder));
		if (keep !== 'Party') document.head.createEl('style', { attr: { id: 'shot-focus' }, text: '.nimble-campaign-view .campaign-roster { display: none; }' });
		view.render();
		view.contentEl.scrollTop = 0;
	}, keep);
	await page.waitForTimeout(300);
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

/** Tap a row in the tracker's queue, putting that creature on the card. */
async function onCard(label) {
	await page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: label }) }).locator('.creature-name-box').first().click();
	await page.waitForTimeout(400);
}

/** The footer's main button: Heroes go first, Done, Next… */
async function mainButton() {
	await page.locator(`${T} .ev-foot-primary`).click();
	await page.waitForTimeout(400);
}

/** Run the encounter block in the open scene, type the heroes' Initiative, and let the heroes go first. */
async function runFight(init = [14, 9, 18, 21]) {
	await scrollTo(`${R} .nimble-encounter-block`, 0.2);
	await page.locator(`${R} .nimble-encounter-block .encounter-block-actions button`, { hasText: 'Run' }).click();
	await page.waitForTimeout(500);
	const boxes = page.locator(`${T} .nimble-init-input`);
	for (const [i, v] of init.entries()) { await boxes.nth(i).fill(String(v)); await boxes.nth(i).press('Tab'); await page.waitForTimeout(100); }
	await mainButton();
}

/** The sample's hound fight in round 1: Wren has gone, two hounds are hurt, and Brakka is on the card. */
async function houndFight(width) {
	await layout({ right: true });
	if (width) await o.eval((app, _p, w) => app.workspace.rightSplit.setSize?.(w), width);
	await open(`${CH}/Q6 Storage Vault.md`);
	await resetTracker(); // after opening: each campaign keeps its own fight
	await runFight();
	await onCard('Wren');
	await mainButton(); // Done
	await typeHp('Quicksilver Hound-1', '9');
	await typeHp('Quicksilver Hound-2', '4');
	await typeHp('Brakka', '7');
	await onCard('Brakka');
	await page.evaluate((T) => {
		document.querySelectorAll('.notice').forEach(n => n.remove());
		document.querySelectorAll(`${T}, ${T} *`).forEach(n => { if (n.scrollTop) n.scrollTop = 0; });
	}, T);
	await page.waitForTimeout(300);
}

/** The sample's last fight: the heroes go first, and The Alchemist has taken a beating. */
async function bossFight() {
	await layout({ right: true });
	await open(`${CH}/Q7 Sacred Circle.md`);
	await resetTracker();
	await runFight();
	await typeHp('The Alchemist', '31');
	await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
}

async function resetTracker() {
	await o.eval(async (app, plugin) => {
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		plugin.runtime('nimble').encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
	});
}

const shots = {
	async 'campaign-panel'() {
		await layout({ left: true });
		await open(`${CH}/Q1 Entry Chamber.md`);
		await focusPanel(CHAPTER);
	},
	async 'encounter-block'() {
		await layout({ left: true });
		await open(`${CH}/Q3 The Calcinator.md`);
		await focusPanel(CHAPTER);
		await scrollTo(`${R} .nimble-encounter-block`, 0.35);
	},
	// The hound fight beside its scene: Brakka on the card, the rest of the heroes and the hounds in the queue.
	async tracker() {
		await houndFight();
	},
	// The HP keypad open on a hound, showing its math before you commit.
	async 'hp-calculator'() {
		await houndFight();
		const row = page.locator(`${T} .creature-item`).filter({ has: page.locator('.creature-label', { hasText: 'Quicksilver Hound-3' }) }).first();
		await row.scrollIntoViewIfNeeded();
		await row.locator('.hp-display').click();
		await page.waitForTimeout(300);
		await page.keyboard.type('9');
		await page.locator('.nimble-popover button', { hasText: 'Vulnerable' }).first().click();
		await page.waitForTimeout(400);
	},
	// The Alchemist on the card, and her quick look opened from it.
	async boss() {
		await bossFight();
		await onCard('The Alchemist');
		await page.locator(`${T} .ev-card-sheet`).first().click();
		await page.waitForSelector('.modal-container .modal');
		await page.waitForTimeout(700);
	},
	async map() {
		await layout();
		await open(`${CH}/Map - The Quicksilver Vaults.md`);
		await scrollTo(`${R} .nimble-map`, 0.08);
	},
	async 'npc-card'() {
		await layout({ left: true });
		await open(`${C}/NPCs/Tobren Kask.md`);
		await focusPanel('NPCs');
	},
	async bestiary() {
		await layout();
		await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
		await page.waitForSelector('.nimble-compendium .nimble-cmpx-row[data-id]', { timeout: 5000 });
		await page.locator('.nimble-compendium .nimble-cmpx-input').fill('quicksilver');
		await page.waitForTimeout(500);
		await page.locator('.nimble-compendium .nimble-cmpx-row[data-id]').first().click();
		await page.waitForTimeout(400);
	},
	// The monster builder mid-build: typed stats on the Attacks step, the live stat block and the level check.
	async builder() {
		await layout();
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
		const B = '.nimble-entity-builder';
		await page.waitForSelector(`${B} .eb-panel.is-active`);
		await page.locator(`${B} .eb-panel.is-active input`).first().fill('Cave Bear');
		for (let i = 0; i < 6; i++) {
			const lv = Number(await page.locator(`${B} .eb-level-value`).textContent());
			if (lv === 3) break;
			await page.locator(`${B} button[aria-label="${lv > 3 ? 'Lower' : 'Higher'} level"]`).click();
		}
		const step = async (n) => { await page.locator(`${B} .eb-dot`).nth(n).click(); await page.waitForTimeout(450); };
		await step(1);
		await page.locator(`${B} .eb-panel.is-active .eb-num-input`).nth(0).fill('40');
		await page.locator(`${B} .eb-panel.is-active .eb-num-input`).nth(1).fill('8');
		await page.locator(`${B} .eb-modes button`, { hasText: 'Climb' }).click();
		await step(3);
		await page.locator(`${B} .eb-add-row button`, { hasText: 'Add an ability' }).click();
		await page.waitForTimeout(200);
		await page.locator(`${B} .eb-ability-name`).first().fill('Bear Hug');
		await page.locator(`${B} .eb-ability textarea`).first().fill('A hero hit by both attacks is Grappled.');
		await step(2);
		await page.locator(`${B} .eb-seg-btn`, { hasText: '2' }).first().click();
		await page.waitForTimeout(200);
		const names = page.locator(`${B} .eb-attack-name`), bodies = page.locator(`${B} .eb-attack-body`);
		await names.nth(0).fill('Bite');
		await bodies.nth(0).fill('1d8+2');
		if (await names.count() < 2) { await page.locator(`${B} .eb-add-row button`, { hasText: 'Add an attack' }).click(); await page.waitForTimeout(200); }
		await names.nth(1).fill('Claws');
		await bodies.nth(1).fill('2d4+1');
		await page.evaluate(() => activeDocument.activeElement?.blur());
		await page.waitForTimeout(450);
	},
	// The compendium's Spells tab, filtered by a typed school chip, with a spell's card beside the list.
	async compendium() {
		await layout();
		await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
		const X = '.nimble-compendium';
		await page.waitForSelector(`${X} .nimble-cmpx-row[data-id]`, { timeout: 5000 });
		await page.locator(`${X} .nimble-cmpx-seg`, { hasText: 'Spells' }).first().click();
		await page.waitForTimeout(400);
		await page.locator(`${X} .nimble-cmpx-input`).click();
		await page.keyboard.type('school:fire ');
		await page.waitForTimeout(500);
		await page.locator(`${X} .nimble-cmpx-row[data-id]`, { hasText: 'Pyroclasm' }).first().click();
		await page.waitForTimeout(400);
		// Start the list on a whole tier, not a half-cut row.
		await page.evaluate((X) => {
			const head = [...document.querySelectorAll(`${X} *`)].find(n => n.childElementCount === 0 && n.textContent.trim().toLowerCase() === 'tier 3');
			let s = head?.parentElement;
			while (s && s.scrollHeight <= s.clientHeight) s = s.parentElement;
			if (head && s) s.scrollTop += head.getBoundingClientRect().top - s.getBoundingClientRect().top - 4;
		}, X);
		await page.waitForTimeout(300);
	},
	// A GM quest note beside the Campaign panel's Quests folder.
	async quest() {
		await layout({ left: true });
		await open(`${C}/Quests/Bring Wick Home.md`);
		await focusPanel('Quests');
	},
	// Spotlight over a scene, searching everything at once.
	async spotlight() {
		await layout({ left: true });
		await open(`${CH}/Q2 Mercury Pool.md`);
		await focusPanel(CHAPTER);
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:spotlight'));
		await page.waitForSelector('.nimble-spotlight .nimble-cmpx-input');
		await page.keyboard.type('alchemist');
		await page.waitForTimeout(500);
		// Select the adversary (Obsidian's suggestions select on hover; the mouse leaves before the shot).
		await page.locator('.nimble-spotlight .nimble-spot-row.spot-monster').first().hover();
		await page.waitForTimeout(200);
	},
	// Links to campaign notes as pills: locations, scenes, maps and NPCs in a session's prep list.
	async 'link-pills'() {
		await layout({ left: true });
		await open(`${C}/Sessions/Session 1 - Silver Between the Stones.md`);
		await focusPanel('Sessions');
		// The session's card comes first; start just under it, at the prep list, where the pills are.
		await page.evaluate((R) => {
			const card = [...document.querySelectorAll(`${R} .nimble-note-card`)].find(n => n.getBoundingClientRect().width);
			const sc = card?.closest('.markdown-preview-view');
			if (card && sc) sc.scrollTop += card.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + 4;
		}, R);
		await page.waitForTimeout(400);
	},
	async boxes() {
		await layout({ left: true });
		await open(`${CH}/Q2 Mercury Pool.md`);
		await focusPanel(CHAPTER);
		await scrollTo(`${R} .nimble-box.box-read-aloud`, 0.04);
	},
	// Brakka's sheet beside the party in the Campaign panel (character-sheets.md, README).
	async 'character-sheet'() {
		await layout({ left: true });
		await open(`Campaigns/Brakka's Journal/Party/Brakka.md`);
		await focusPanel('Party');
	},
	// A player campaign: the party up top, a session note with its battle notes (players.md).
	async 'player-campaign'() {
		await layout({ left: true });
		await open(`Campaigns/Brakka's Journal/Sessions/Session 1 - Down the Cellar Stair.md`);
		await focusPanel('Sessions');
		// The party is what this shot is about, so it stays (focusPanel hides it for every other folder).
		await page.evaluate(() => document.getElementById('shot-focus')?.remove());
		await page.waitForTimeout(300);
	},
	async hover() {
		await layout({ left: true });
		await open(`${CH}/Q1 Entry Chamber.md`);
		await focusPanel(CHAPTER);
		await scrollTo(`${R} .nimble-encounter-block`, 0.7);
		await page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Construct' }).first().hover();
		await page.waitForTimeout(900);
	},
};

// Feature shots for the landing page: just the feature, cut out of the app with
// even padding, at 2× for sharp text. Saved as docs/images/feature-<name>.png.
// Everything outside the feature is hidden (visibility, so nothing moves) and
// the padding shows a plain background, so a clip never catches a neighbour.
//
// Each one: `setup` drives the app (mostly the matching shot above), `show`
// returns the elements to keep, `region` (optional) the box to frame instead
// of all of them. The clip is the box plus `pad` on every side; a box taller
// than the aspect ratio keeps its top part. `viewport` and `lineWidth` (the
// note's readable width) reshape the feature so it fits the ratio by itself.
const FEATURE_PAD = 28;

/** Brakka's sheet in reading view, 3D dice off so rolls don't throw dice over it. */
async function brakka() {
	await hero(`Campaigns/Brakka's Journal/Party/Brakka.md`);
}

/** A hero's sheet in reading view, 3D dice off. The note's text is kept, so restoreHeroes() can undo what a shot did to it. */
async function hero(path) {
	await layout();
	await o.eval(async (app, plugin, path) => {
		plugin.settings.dice3d = false;
		window.ftHeroes ??= {};
		const f = app.vault.getAbstractFileByPath(path);
		if (f && !(path in window.ftHeroes)) window.ftHeroes[path] = await app.vault.read(f);
	}, path);
	await open(path);
}

/** Put back every hero sheet a shot changed (a Rage, dice, a used reaction), for the shots after it. */
async function restoreHeroes() {
	await o.eval(async (app) => {
		for (const [path, text] of Object.entries(window.ftHeroes ?? {})) {
			const f = app.vault.getAbstractFileByPath(path);
			if (f) await app.vault.modify(f, text);
		}
		window.ftHeroes = {};
	});
	await page.waitForTimeout(400);
}

/** The visible copy of the active note's Nimble sheet (a note can be drawn twice, once hidden). */
const SHEET = '.workspace-leaf.mod-active .markdown-reading-view .nimble-sheet';
async function sheetClick(selector, text) {
	await page.locator(`${SHEET} ${selector}:visible`, text ? { hasText: text } : {}).first().click();
	await page.waitForTimeout(500);
}

/** Switch the active note to Live Preview (the sample vault opens notes in reading view). */
async function livePreview() {
	await o.eval(async (app) => {
		const leaf = app.workspace.getMostRecentLeaf();
		await leaf.setViewState({ ...leaf.getViewState(), state: { ...leaf.getViewState().state, mode: 'source', source: false } });
	});
	await page.waitForTimeout(700);
}

/** A monster in the builder: level 3, typed HP and attacks, then the step to show ('last' for Review). */
async function buildMonster({ hp, attacks = [], step }) {
	await layout();
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
	const B = '.nimble-entity-builder';
	await page.waitForSelector(`${B} .eb-panel.is-active`);
	await page.locator(`${B} .eb-panel.is-active input`).first().fill('Cave Bear');
	for (let i = 0; i < 6; i++) {
		const lv = Number(await page.locator(`${B} .eb-level-value`).textContent());
		if (lv === 3) break;
		await page.locator(`${B} button[aria-label="${lv > 3 ? 'Lower' : 'Higher'} level"]`).click();
	}
	const go = async (n) => { await page.locator(`${B} .eb-dot`).nth(n).click(); await page.waitForTimeout(450); };
	await go(1);
	await page.locator(`${B} .eb-panel.is-active .eb-num-input`).nth(0).fill(String(hp));
	if (attacks.length) {
		await go(2);
		const names = page.locator(`${B} .eb-attack-name`), bodies = page.locator(`${B} .eb-attack-body`);
		for (const [i, [n, d]] of attacks.entries()) { await names.nth(i).fill(n); await bodies.nth(i).fill(d); }
	}
	await go(step === 'last' ? (await page.locator(`${B} .eb-dot`).count()) - 1 : step);
	await page.evaluate(() => activeDocument.activeElement?.blur());
	await page.waitForTimeout(450);
}

/** The text and inline pieces of the shown blocks, not the blocks' full width. */
function inkRegion() {
	const rs = [];
	for (const el of document.querySelectorAll('.ft-show')) {
		const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let t = walk.nextNode(); t; t = walk.nextNode()) {
			if (!t.textContent.trim()) continue;
			const r = document.createRange(); r.selectNodeContents(t); rs.push(...r.getClientRects());
		}
		el.querySelectorAll('*').forEach(n => { if (n.tagName === 'INPUT' || (/^inline/.test(getComputedStyle(n).display) && n.textContent.trim())) rs.push(n.getBoundingClientRect()); });
	}
	const ok = rs.filter(r => r.width && r.height);
	return { left: Math.min(...ok.map(r => r.left)), top: Math.min(...ok.map(r => r.top)), right: Math.max(...ok.map(r => r.right)), bottom: Math.max(...ok.map(r => r.bottom)) };
}
// The Campaign panel as a rounded card only as tall as its contents.
const PANEL_CARD_CSS = '.nimble-campaign-view { background: var(--background-secondary) !important; border-radius: 12px; height: auto !important; flex: none !important; padding-bottom: 4px !important; }';

/** Write a note into this run's throwaway copy of the vault (never sample-vault/). */
async function writeNote(path, text) {
	await o.eval(async (app, _p, [path, text]) => {
		const dir = path.split('/').slice(0, -1).join('/');
		if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
		const f = app.vault.getAbstractFileByPath(path);
		if (f) await app.vault.modify(f, text); else await app.vault.create(path, text);
	}, [path, text]);
	await page.waitForTimeout(300);
}

/** The 5e campaign the 5e shots use (2024 rules), made on first use, and active. */
async function swordCoast() {
	await o.eval(async (app, plugin) => {
		if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
	});
	await page.waitForTimeout(300);
}
const features = {
	// The monster builder on its Attacks step, the level check and live stat block beside it.
	'feature-builder': {
		wide: true, viewport: [1200, 650], bg: 'var(--background-secondary)',
		setup: () => shots.builder(),
		show: () => ['.modal.nimble-entity-builder'],
	},
	'feature-compendium': {
		viewport: [904, 800], extend: true, css: '.workspace-split.mod-root { margin-right: 24px !important; }',
		setup: async () => { await shots.compendium(); },
		show: () => ['.workspace-leaf.mod-active .nimble-compendium'],
		region: () => {
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			// The view runs to the window's edge; its tab row spans the content inside.
			const box = document.querySelector(`${X} .nimble-cmpx-seg`).parentElement.getBoundingClientRect();
			const top = box.top;
			const btns = [...document.querySelectorAll(`${X} button`)].filter(b => /Use as a template|Insert in note/.test(b.textContent));
			const bottom = Math.max(...btns.map(b => b.getBoundingClientRect().bottom));
			return { left: box.left, right: box.right, top, bottom };
		},
	},
	// A quest note's card: kicker, title and status stamp, who gave it, where, the reward, objectives and the secret.
	'feature-quest': {
		lineWidth: 700,
		setup: async () => { await layout(); await open(`${C}/Quests/Bring Wick Home.md`); },
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-note-card.kind-quest'],
	},
	// The same quest's card beside the Campaign panel, folded down to its Quests folder with this quest selected.
	'feature-quest-panel': {
		viewport: [1000, 800], lineWidth: 544, extend: true,
		// The panel as a rounded card only as tall as its contents, and the card level with its top.
		css: `${PANEL_CARD_CSS}
			.workspace-split.mod-root .workspace-leaf.mod-active .view-content { transform: translateY(-78px); }`,
		setup: async () => {
			await layout({ left: true });
			await open(`${C}/Quests/Bring Wick Home.md`);
			await focusPanel('Quests');
		},
		show: () => ['.workspace-split.mod-left-split .nimble-campaign-view', '.workspace-leaf.mod-active .markdown-reading-view .nimble-note-card.kind-quest'],
	},
	// campaigns.md "Places": a location's card, its banner, region, the monsters to use there, who's here, where it leads.
	'guide-place-card': {
		lineWidth: 600, viewport: [1200, 1200], ratio: 0.5, // the whole card
		setup: async () => { await layout(); await open(`${C}/Locations/The Alchemists' Guild.md`); },
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-note-card.kind-location'],
	},
	// campaigns.md "Sessions": a session's card, who was at the table, what happened, which quests moved, loot, next time.
	'guide-session-card': {
		lineWidth: 600, viewport: [1200, 1200], ratio: 0.5, // the whole card
		setup: async () => { await layout(); await open(`${C}/Sessions/Session 1 - Silver Between the Stones.md`); },
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-note-card.kind-session'],
	},
	// The top of Brakka's sheet: who he is, the band (stats, Armor, Initiative, Wounds, HP) and the skills.
	'feature-character-sheet': {
		lineWidth: 760,
		setup: async () => { await layout(); await open(`Campaigns/Brakka's Journal/Party/Brakka.md`); },
		show: () => {
			const S = [...document.querySelectorAll('.workspace-leaf.mod-active .nimble-sheet')].find(n => n.getBoundingClientRect().width);
			return [...S.querySelectorAll(':scope > .ns-hero, :scope > .ns-band, :scope > .ns-skills')];
		},
	},
	// tracker.md "Running a fight": the whole tracker mid-fight, Brakka on the card, the queue under him.
	'feature-tracker': {
		// Just tall enough for the whole fight, so the footer's Done sits under the combat log.
		viewport: [1200, 940], bg: 'var(--background-secondary)', ratio: 0.3,
		setup: () => houndFight(400),
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		show: () => ['.nimble-encounter-tracker'],
		region: () => {
			const T = document.querySelector('.nimble-encounter-tracker');
			const rs = [...T.children].map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
			return { left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) };
		},
	},
	// tracker.md "Legendary monsters": Done on Ilse turns the card to The Alchemist's beat, her actions to pick from.
	'guide-tracker-beat': {
		viewport: [1200, 1300], bg: 'var(--background-secondary)', ratio: 0.5,
		setup: async () => {
			await o.eval((app) => app.workspace.rightSplit.setSize?.(400));
			await bossFight();
			await onCard('Ilse');
			await mainButton(); // Done · The Alchemist acts
			await page.evaluate((T) => document.querySelectorAll(`${T}, ${T} *`).forEach(n => { if (n.scrollTop) n.scrollTop = 0; }), T);
		},
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		show: () => ['.nimble-encounter-tracker'],
		// From the encounter's name to the end of the card; the queue under it is hidden.
		region: () => {
			const T = document.querySelector('.nimble-encounter-tracker');
			const card = [...T.querySelectorAll('.ev-tracker-body > *')].find(n => /After .*'s turn/.test(n.textContent) && n.querySelector('h2'));
			for (let n = card.nextElementSibling; n; n = n.nextElementSibling) n.style.visibility = 'hidden';
			T.querySelector('.ev-foot')?.style.setProperty('visibility', 'hidden');
			const b = T.getBoundingClientRect();
			return { left: b.left, right: b.right, top: b.top, bottom: card.getBoundingClientRect().bottom };
		},
	},
	// tracker.md "HP": a hero's damage keypad with the players' answers as chips; Defend takes Brakka's Armor off.
	'guide-tracker-defend': {
		viewport: [1200, 1000], bg: 'var(--background-secondary)', ratio: 0.5, // the whole keypad
		setup: async () => {
			await houndFight(300);
			await page.locator(`${T} .ev-card-damage`).first().click();
			await page.waitForTimeout(400);
			await page.keyboard.type('9');
			await page.locator('.nimble-popover .qa-defend').first().click();
			await page.waitForTimeout(400);
		},
		show: () => ['.nimble-popover'],
	},
	'feature-encounter': {
		wide: true, lineWidth: 410,
		setup: () => shots['encounter-block'](),
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-encounter-block'],
	},
	'feature-spotlight': {
		bg: 'var(--background-secondary)', snapText: true,
		setup: () => shots.spotlight(),
		show: () => ['.nimble-spotlight'],
	},
	// Link pills in a session's prep list.
	'feature-pills': {
		lineWidth: 440,
		setup: async () => {
			// The sample vault doesn't link its quests from a session; add one to this run's copy for a quest pill.
			const S = `${C}/Sessions/Session 1 - Silver Between the Stones.md`;
			await o.eval(async (app, _p, S) => {
				const f = app.vault.getAbstractFileByPath(S);
				await app.vault.process(f, t => t.includes('[[Bring Wick Home]]') ? t : t.replace(/(- \[ \] Map open:.*\n)/, '$1- [ ] Side quest: [[Bring Wick Home]]\n'));
			}, S);
			await shots['link-pills']();
		},
		show: () => {
			const R = '.workspace-leaf.mod-active .markdown-reading-view';
			const blocks = [...document.querySelectorAll(`${R} .markdown-preview-sizer > div`)];
			const prep = blocks.findIndex(b => b.querySelector('h2')?.textContent.trim() === 'Prep');
			return blocks.slice(prep, prep + 2);
		},
		// The blocks are as wide as the note; frame the text and pills themselves.
		region: () => {
			const rs = [];
			for (const el of document.querySelectorAll('.ft-show')) {
				const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
				for (let t = walk.nextNode(); t; t = walk.nextNode()) {
					if (!t.textContent.trim()) continue;
					const r = document.createRange(); r.selectNodeContents(t); rs.push(...r.getClientRects());
				}
				el.querySelectorAll('*').forEach(n => { if (n.tagName === 'INPUT' || (/^inline/.test(getComputedStyle(n).display) && n.textContent.trim())) rs.push(n.getBoundingClientRect()); });
			}
			const ok = rs.filter(r => r.width && r.height);
			return { left: Math.min(...ok.map(r => r.left)), top: Math.min(...ok.map(r => r.top)), right: Math.max(...ok.map(r => r.right)), bottom: Math.max(...ok.map(r => r.bottom)) };
		},
	},
	'feature-npc': {
		lineWidth: 700,
		setup: () => shots['npc-card'](),
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-npc-card'],
	},
	// The map zoomed to fill a wide viewport, the top rooms and their pins.
	'feature-map': {
		wide: true, viewport: [1200, 900], lineWidth: 860,
		setup: async () => {
			await shots.map();
			const M = `${R} .nimble-map`;
			// A 16:9 frame: shrink the viewport, fit the map, then zoom from the top edge until it fills the width
			// (zoomed out less, the next pins sit cut in half on the bottom edge).
			const steps = await page.evaluate((M) => {
				const map = document.querySelector(M), vp = map.querySelector('.nimble-map-viewport'), img = map.querySelector('.nimble-map-stage img');
				const bar = map.getBoundingClientRect().height - vp.getBoundingClientRect().height;
				const w = map.getBoundingClientRect().width;
				vp.style.height = `${Math.round((w + 56) * 9 / 16 - 56 - bar)}px`;
				return Math.ceil(Math.log((vp.clientWidth * img.naturalHeight) / (vp.clientHeight * img.naturalWidth)) / Math.log(1.15));
			}, M);
			await page.waitForTimeout(300);
			await page.locator(`${M} [aria-label="Fit map"]`).click();
			await page.waitForTimeout(300);
			const vb = await page.locator(`${M} .nimble-map-viewport`).boundingBox();
			await page.mouse.move(vb.x + vb.width / 2, vb.y + 1);
			for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
			await page.waitForTimeout(400);
		},
		css: '.nimble-map-viewport { resize: none !important; }',
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-map'],
	},
	// The HP calculator on a hound: 9 typed, Vulnerable on, the math before you commit.
	'feature-hp': {
		viewport: [1200, 800], bg: 'var(--background-secondary)', ratio: 1.2,
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		setup: async () => {
			// The sidebar's usual width, whatever feature-tracker left it at.
			await o.eval((app) => app.workspace.rightSplit.setSize?.(300));
			await shots['hp-calculator']();
		},
		show: () => {
			const row = [...document.querySelectorAll('.nimble-encounter-tracker .creature-item')].find(n => n.querySelector('.creature-label')?.textContent.includes('Hound-3'));
			return ['.nimble-popover', row];
		},
	},
	// A boss's quick look from the tracker: her HP and turn, then her stat block.
	'feature-boss': {
		viewport: [1200, 900], bg: 'var(--background-secondary)', ratio: 1.45, snapText: true,
		setup: () => shots.boss(),
		show: () => ['.modal-container .modal'],
	},
	// The slash menu, just opened on an empty line of a scene.
	'feature-slash': {
		// Tall enough that the menu opens below the line; as tall as the menu, so its key hints show.
		viewport: [1200, 800], keepFocus: true, ratio: 1.3,
		// CodeMirror resets its lines' classes, dropping ours; keep the typed line visible this way.
		css: '.cm-editor .cm-content .cm-active.cm-line, .cm-editor .cm-content .cm-active.cm-line * { visibility: visible !important; } .cm-editor .cm-content { caret-color: transparent !important; }',
		setup: async () => {
			await layout();
			await open(`${CH}/Q1 Entry Chamber.md`);
			// Live Preview (the sample vault opens notes in reading view).
			await o.eval(async (app) => {
				const leaf = app.workspace.getMostRecentLeaf();
				await leaf.setViewState({ ...leaf.getViewState(), state: { ...leaf.getViewState().state, mode: 'source', source: false } });
			});
			await page.waitForTimeout(700);
			await o.eval((app) => {
				const ed = app.workspace.activeEditor.editor;
				window.ftRestore = ed.getValue();
				// A new line above the read-aloud box, near the top, so the menu opens below it.
				const at = ed.getValue().split('\n').findIndex(l => l.startsWith('```box read-aloud'));
				ed.replaceRange('\n', { line: at, ch: 0 });
				ed.setCursor({ line: at, ch: 0 });
				ed.focus();
			});
			await page.waitForTimeout(300);
			await page.keyboard.type('/', { delay: 20 });
			await page.waitForSelector('.suggestion-container .nimble-slash-item');
			await page.waitForTimeout(500);
		},
		// Put the scene back as it was, for the shots after this one.
		after: async () => {
			await page.keyboard.press('Escape');
			await o.eval(async (app) => {
				const f = app.vault.getAbstractFileByPath('Campaigns/The Old Quarter/1 The Quicksilver Vaults/Q1 Entry Chamber.md');
				app.workspace.activeEditor?.editor?.setValue(window.ftRestore);
				await app.vault.modify(f, window.ftRestore);
			});
			await layout();
		},
		show: () => {
			const line = [...document.querySelectorAll('.cm-active.cm-line')].find(n => n.getBoundingClientRect().width);
			return ['.suggestion-container', line];
		},
		// The line is as wide as the note; frame the "/" and the menu.
		region: () => {
			const line = [...document.querySelectorAll('.cm-active.cm-line')].find(n => n.getBoundingClientRect().width);
			const r = document.createRange(); r.selectNodeContents(line);
			const t = r.getBoundingClientRect(), m = document.querySelector('.suggestion-container').getBoundingClientRect();
			return { left: Math.min(t.left, m.left), top: Math.min(t.top, m.top), right: Math.max(t.right, m.right), bottom: Math.max(t.bottom, m.bottom) };
		},
	},
	// A hand-written stat block's notes on what it couldn't show, opened, each with its fix.
	'feature-statblock-help': {
		lineWidth: 520,
		setup: async () => {
			await layout();
			await writeNote('Feature Shots/Bog Lurker.md', [
				'```nimble', 'name: Bog Lurker', 'level: 3', 'size: Large', 'type: Beast', 'hp: 52', 'armor: medium',
				'movment: 6, swim 8', 'saves STR+', '- Bite 1d10+3', '- Tail Slap 2d6 (Reach 2)',
				'abilities:', '- **Murky.** Hidden while it lies in deep water.', '```', '',
			].join('\n'));
			await open('Feature Shots/Bog Lurker.md');
			await page.locator(`${R} .nimble-issues-toggle`).first().click();
			await page.waitForTimeout(400);
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-issues'],
	},
	// Tougher: a monster's count opened in an encounter block, a level up chosen.
	'feature-tougher': {
		lineWidth: 600,
		setup: async () => {
			await resetTracker();
			await layout();
			await open(`${CH}/Q6 Storage Vault.md`);
			await scrollTo(`${R} .nimble-encounter-block`, 0.15);
			await page.locator(`${R} .nimble-encounter-block .encounter-count`).first().click();
			await page.waitForTimeout(300);
			await page.locator('.nimble-popover .ece-shift-btn', { hasText: 'Tougher' }).click();
			await page.waitForTimeout(300);
		},
		// The block's title and monster row, and the count editor hanging from them (it would cover the rest).
		show: () => {
			const B = '.workspace-leaf.mod-active .markdown-reading-view .nimble-encounter-block';
			return [`${B} .encounter-block-head`, `${B} .encounter-block-monsters`, '.nimble-popover'];
		},
	},
	// What a player sees for a monster: its lore card, opened from a reference in their notes.
	'feature-lore': {
		viewport: [1200, 900], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await writeNote(`Campaigns/Brakka's Journal/Sessions/Under the Cellar.md`, '---\nnimble: session\n---\n\nSomething huge moved under the cellar floor: `nimble:Elder Ooze`.\n');
			await open(`Campaigns/Brakka's Journal/Sessions/Under the Cellar.md`);
			await page.locator(`${R} .nimble-inline-name`).first().click();
			await page.waitForSelector('.modal .nimble-lore-card');
			await page.waitForTimeout(500);
		},
		show: () => ['.modal-container .modal'],
	},
	// A homebrew spell written as a block, shown as its compendium card.
	// 5e: New character in a 5e campaign, on its Class step with the sheet in brief beside it.
	'feature-5e-character': {
		wide: true, viewport: [1200, 650], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
				for (let i = 0; i < 50 && plugin.system().id !== 'dnd5e'; i++) await new Promise(r => setTimeout(r, 100));
				app.commands.executeCommandById('nimble-gm:new-character');
			});
			const B = '.modal.nimble-entity-builder';
			const panel = `${B} .eb-panel.is-active`;
			await page.locator(B).waitFor();
			await page.locator(`${panel} input[data-field="Name"]`).fill('Ilse Vane');
			await page.locator(`${panel} select[data-field="Class"]`).selectOption('Wizard');
			await page.locator(`${panel} input[data-field="Level"]`).fill('3');
			await page.locator(`${B} .eb-dot`, { hasText: 'Skills' }).click();
			for (const sk of ['Arcana', 'History']) await page.locator(`${panel} .eb-pick[data-value="${sk}"]`).click();
			await page.locator(`${B} .eb-dot`, { hasText: 'Class' }).click();
			await page.locator(`${panel} select[data-field="Subclass"]`).selectOption({ index: 1 });
			for (const sp of ['Fire Bolt', 'Light', 'Mage Hand']) await page.locator(`${panel} [data-key="cantrips"] .eb-pick[data-value="${sp}"]`).click();
			for (const sp of ['Shield', 'Magic Missile', 'Misty Step']) await page.locator(`${panel} [data-key="spells"] .eb-pick[data-value="${sp}"]`).click();
			await page.waitForTimeout(600);
		},
		show: () => ['.modal.nimble-entity-builder'],
	},
	// 5e.md "Make your own": the monster builder on its Actions step, a breath weapon worded with its DC, the check on the banner.
	'guide-5e-builder': {
		wide: true, viewport: [1200, 650], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
				for (let i = 0; i < 50 && plugin.system().id !== 'dnd5e'; i++) await new Promise(r => setTimeout(r, 100));
				app.commands.executeCommandById('nimble-gm:new-monster');
			});
			const B = '.modal.nimble-entity-builder';
			const panel = `${B} .eb-panel.is-active`;
			await page.locator(B).waitFor();
			await page.locator(`${panel} input[data-field="Name"]`).fill('Cinder Drake');
			await page.locator(`${panel} [data-key="size"] .eb-seg-btn`, { hasText: 'Large' }).click();
			await page.locator(`${panel} select[data-field="Type"]`).selectOption('Dragon');
			await page.locator(`${panel} select[data-field="Challenge"]`).selectOption('5');
			await page.locator(`${B} .eb-dot`, { hasText: 'Armor' }).click();
			await page.locator(`${panel} select[data-field="Armor"]`).selectOption('natural');
			await page.locator(`${panel} input[data-field="AC"]`).fill('17');
			await page.locator(`${panel} input[data-field="Hit dice"]`).fill('12');
			await page.locator(`${panel} input[data-field="Fly"]`).fill('60');
			await page.locator(`${B} .eb-dot`, { hasText: 'Abilities' }).click();
			for (const [a, v] of [['STR', '19'], ['DEX', '12'], ['CON', '17'], ['WIS', '13'], ['CHA', '14']]) await page.locator(`${panel} input[data-field="${a}"]`).fill(v);
			await page.locator(`${B} .eb-dot`, { hasText: /^Actions$/ }).click();
			const strike = page.locator(`${panel} [data-key="actions"] .eb-list-item`).first();
			await strike.locator('input[data-field="Name"]').fill('Rend');
			await strike.locator('select[data-field="Die"]').selectOption('10');
			await page.locator(`${panel} [data-key="actions"] .eb-list-add`).click();
			const breath = page.locator(`${panel} [data-key="actions"] .eb-list-item`).nth(1);
			await breath.locator('input[data-field="Name"]').fill('Cinder Breath');
			await breath.locator('[data-key="kind"] .eb-seg-btn', { hasText: 'Save' }).click();
			await breath.locator('select[data-field="Uses"]').selectOption('Recharge 5–6');
			await breath.locator('input[data-field="Who and where"]').fill('each creature in a 30-foot Cone');
			await breath.locator('input[data-field="Dice"]').fill('6');
			await breath.locator('select[data-field="Die"]').selectOption('6');
			await breath.locator('select[data-field="Damage"]').selectOption('Fire');
			await page.waitForTimeout(600);
		},
		show: () => ['.modal.nimble-entity-builder'],
	},
	// 5e.md "Character sheets": Level up on its Spells step, a cantrip and two spellbook spells picked, what the level brings beside.
	'guide-5e-level-up': {
		wide: true, viewport: [1200, 650], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			const note = 'Campaigns/Sword Coast/Party/Ilse Vane.md';
			await o.eval(async (app, plugin, note) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
				for (let i = 0; i < 50 && plugin.system().id !== 'dnd5e'; i++) await new Promise(r => setTimeout(r, 100));
				const old = app.vault.getAbstractFileByPath(note); if (old) await app.vault.delete(old);
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast/Party')) await app.vault.createFolder('Campaigns/Sword Coast/Party');
				await app.vault.create(note, ['---', 'nimble: character', 'system: 5e', 'edition: 2024', 'class: Wizard', 'subclass: Evoker', 'level: 3', 'species: Elf', 'background: Sage',
					'str: 8', 'dex: 14', 'con: 14', 'int: 17', 'wis: 12', 'cha: 10', 'hp: 20', 'hp_max: 20', 'skills: [Arcana, History, Investigation, Insight]', 'spells: [Fire Bolt, Light, Prestidigitation, Shield, Magic Missile, Detect Magic, Sleep, Misty Step]',
					'---', '', '```5e-sheet', '```', ''].join('\n'));
			}, note);
			await open(note);
			await page.locator('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-sheet-actions button', { hasText: 'Level up' }).click();
			const B = '.modal.nimble-entity-builder';
			const panel = `${B} .eb-panel.is-active`;
			await page.locator(B).waitFor();
			await page.locator(`${B} .eb-dot`, { hasText: 'Spells' }).click();
			await page.locator(`${panel} [data-key="cantrips"] .eb-pick[data-value="Mage Hand"]`).click();
			for (const sp of ['Invisibility', 'Scorching Ray']) await page.locator(`${panel} [data-key="spells"] .eb-pick[data-value="${sp}"]`).click();
			await page.waitForTimeout(600);
		},
		show: () => ['.modal.nimble-entity-builder'],
	},
	// The 5e character sheet: the header, hit points, conditions and the first abilities.
	'feature-5e-sheet': {
		lineWidth: 900, viewport: [1200, 900],
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			});
			await writeNote('Campaigns/Sword Coast/Party/Ilse Vane.md', [
				'---', 'title: Ilse Vane', 'species: Elf', 'class: Wizard', 'subclass: Evoker', 'background: Sage', 'level: 5', 'edition: "2024"',
				'str: 8', 'dex: 14', 'con: 13', 'int: 18', 'wis: 12', 'cha: 10', 'hp: 24', 'hp_max: 32', 'temp_hp: 5', 'hit_dice_used: 2', 'inspiration: true',
				'skills: [Arcana, History, Investigation, Insight]', 'expertise: [Arcana]', 'conditions: [Poisoned]',
				'spells: [Fire Bolt, Mage Hand, Shield, Magic Missile, Misty Step, Hold Person, Fireball, Counterspell]', 'slots_used: [1, 0, 1]',
				'inventory:', '  - { name: Dagger, equipped: true }', '  - { name: Quarterstaff, equipped: true }', '  - { name: Potion of Healing, qty: 2 }',
				'portrait: "[[Campaigns/The Old Quarter/Assets/Art/Tobren Kask.png]]"', 'portrait-position: center 20%', '---', '', '```5e-sheet', '```', '',
			].join('\n'));
			await open('Campaigns/Sword Coast/Party/Ilse Vane.md');
			await page.locator('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-sheet').waitFor();
			await page.waitForTimeout(600);
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .dnd5e-sheet'],
		// From the banner to the first row of ability plaques.
		region: () => {
			const sheet = document.querySelector('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-sheet');
			const b = sheet.getBoundingClientRect();
			const conds = sheet.querySelector('.dnd5e-conditions-row');
			const plaques = [...sheet.querySelectorAll('.dnd5e-sheet-ability')].map(n => n.getBoundingClientRect()).filter(r => r.width);
			const firstRow = plaques.filter(r => Math.abs(r.top - (plaques[0]?.top ?? 0)) < 4);
			const bottom = firstRow.length ? Math.max(...firstRow.map(r => r.bottom)) : conds ? conds.getBoundingClientRect().bottom : b.top + 600;
			return { left: b.left, right: b.right, top: b.top, bottom };
		},
	},
	// The 5e tracker mid-fight: initiative rows, the current turn, conditions, concentration and legendary pips.
	'feature-5e-tracker': {
		viewport: [1200, 900], ratio: 4 / 5,
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			});
			await writeNote('Campaigns/Sword Coast/Road Ambush.md', [
				'# Road ambush', '', 'Goblins spring from the ditch while their mage holds back. An ogre lumbers out of the trees on round two.', '',
				'```nimble-encounter', 'name: Road ambush', 'monsters:', '- 2 `5e:Goblin Warrior`', '- `5e:Ogre`', '- `5e:Mage`', '- `5e:Young Red Dragon`', '```', '',
			].join('\n'));
			await open('Campaigns/Sword Coast/Road Ambush.md');
			const R5 = '.workspace-leaf.mod-active .markdown-reading-view';
			await page.locator(`${R5} .dnd5e-encounter button`, { hasText: 'Run' }).click();
			const TR = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
			await page.locator(TR).waitFor();
			await o.eval((app) => app.workspace.rightSplit.setSize?.(480));
			await page.locator(`${TR} button`, { hasText: /Start combat/ }).first().click();
			await page.waitForTimeout(400);
			await o.eval((app, plugin) => {
				const rt = plugin.runtime('dnd5e');
				rt.fights.change((f) => {
					const by = (n) => f.combatants.find(c => c.label === n);
					const set = (n, hp, conds = []) => { const c = by(n); if (c) { c.hp = hp; c.conditions.push(...conds.map(name => ({ name }))); } };
					set('Goblin Warrior', 4, ['Frightened']);
					set('Goblin Warrior 2', 0);
					set('Ogre', 41, ['Prone']);
					const mage = by('Mage'); if (mage) { mage.hp = 52; mage.concentrating = true; }
					const dragon = by('Young Red Dragon'); if (dragon) { dragon.hp = Math.round(dragon.maxHp * 0.62); if (dragon.legendary) dragon.legendary.used = 1; }
				});
			});
			await page.waitForTimeout(700);
		},
		show: () => ['.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]'],
		region: () => {
			const b = document.querySelector('.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]').getBoundingClientRect();
			const rows = [...document.querySelectorAll('.workspace-leaf-content[data-type="nimble-dnd5e-tracker"] .dnd5e-combatant')];
			const last = rows[rows.length - 1];
			return { left: b.left, right: b.right, top: b.top, bottom: last ? last.getBoundingClientRect().bottom : b.bottom };
		},
	},
	// Timed conditions: at the turn change, the tracker asks for a save and rolls Burning's damage.
	'feature-conditions': {
		viewport: [1200, 800], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			});
			await writeNote('Campaigns/Sword Coast/Road Ambush.md', [
				'# Road ambush', '', '```nimble-encounter', 'name: Road ambush', 'monsters:', '- `5e:Mage`', '- `5e:Ogre`', '```', '',
			].join('\n'));
			await open('Campaigns/Sword Coast/Road Ambush.md');
			await page.locator('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-encounter button', { hasText: 'Run' }).click();
			const TR = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
			await page.locator(TR).waitFor();
			await o.eval((app, plugin) => {
				plugin.runtime('dnd5e').fights.change((f) => {
					const mage = f.combatants.find(c => c.label === 'Mage'); const ogre = f.combatants.find(c => c.label === 'Ogre');
					mage.init = 18; ogre.init = 9;
					mage.conditions.push({ name: 'Hold Person', triggers: [{ kind: 'save', at: 'end', ability: 'Wisdom', dc: 13, endsOnSave: true }] });
					ogre.conditions.push({ name: 'Burning', triggers: [{ kind: 'damage', at: 'start', dice: '1d4', damageType: 'Fire' }] });
				});
			});
			await page.locator(`${TR} button`, { hasText: /Start combat/ }).first().click();
			await page.waitForTimeout(300);
			await page.locator(`${TR} button`, { hasText: /^\s*Next:/ }).first().click();
			await page.locator('.modal.ev-effect-prompt').waitFor();
			await page.waitForTimeout(500);
		},
		show: () => ['.modal.ev-effect-prompt'],
	},
	// A 5e stat block (the example content pack's Cinder Hound) laid out the 2024 way.
	'feature-5e-statblock': {
		lineWidth: 520,
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => {
				if (!app.vault.getAbstractFileByPath('Campaigns/Sword Coast')) await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			});
			await writeNote('Campaigns/Sword Coast/Cinder Hound.md', [
				'```5e', 'name: Cinder Hound', 'size: Medium', 'type: elemental', 'alignment: Neutral', 'ac: 13 (natural armor)', 'hp: 27 (5d8 + 5)', 'speed: 40 ft.',
				'str: 14', 'dex: 15', 'con: 12', 'int: 4', 'wis: 13', 'cha: 6', 'immunities: Fire', 'senses: Darkvision 60 ft., Passive Perception 13', 'languages: —', 'cr: 1',
				'traits:', '- Glowing Coat: The hound sheds dim light in a 10-foot radius.',
				'actions:', '- Bite: Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Piercing damage plus 3 (1d6) Fire damage.', '```', '',
			].join('\n'));
			await open('Campaigns/Sword Coast/Cinder Hound.md');
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .dnd5e-statblock'],
		// From the name to Languages: the shot ends on a whole line.
		region: () => {
			const block = document.querySelector('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-statblock');
			const b = block.getBoundingClientRect();
			const lang = [...block.querySelectorAll('*')].find(n => /^Languages/.test(n.textContent?.trim() ?? '') && n.getBoundingClientRect().height < 40);
			return { left: b.left, right: b.right, top: b.top, bottom: (lang?.getBoundingClientRect().bottom ?? b.bottom) + 2 };
		},
	},
	// 5e.md "NPCs": the GM's mini sheet under a 5e NPC's card, from a linked stat block with her own AC and HP.
	'guide-5e-npc': {
		lineWidth: 700, viewport: [1200, 1400], ratio: 0.5,
		setup: async () => {
			await layout();
			await swordCoast();
			await writeNote('Campaigns/Sword Coast/NPCs/Marta Vey.md', [
				'---', 'nimble: npc', 'role: Captain of the Waymoot watch', 'ancestry: Human', 'pronouns: she/her', 'age: 44',
				'status: alive', 'attitude: neutral', 'ac: 16', 'hp: "30 (4d8 + 12)"', 'hp_now: 22', 'cr: "2"', 'statblock: Bandit Captain', '---', '',
				'```nimble-npc', 'look: Grey braid, a scar through one eyebrow, a watch coat she never buttons.', 'wants: The bridge toll back from the Zhentarim.', 'secret: She takes a cut of the toll herself.', '```', '',
			].join('\n'));
			await open('Campaigns/Sword Coast/NPCs/Marta Vey.md');
			await page.locator(`${R} .dnd5e-npc-stats`).first().waitFor();
			await scrollTo(`${R} .dnd5e-npc-stats`, 0.05);
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .dnd5e-npc-stats'],
	},
	// Import content with the example pack pasted in: what it adds, before it's saved.
	'feature-content-packs': {
		viewport: [1000, 800], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			const pack = readFileSync(join(ROOT, 'docs/content/examples/5e-hearth-and-cinder.json'), 'utf8');
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-content'); });
			await page.locator('.modal.nimble-import-content textarea').fill(pack);
			await page.locator('.modal.nimble-import-content textarea').evaluate(t => { t.scrollTop = 0; });
			await page.waitForTimeout(500);
		},
		css: '.nimble-import-content textarea.nimble-import-text { height: 6.5em !important; }',
		show: () => ['.modal.nimble-import-content'],
	},
	'feature-homebrew': {
		lineWidth: 500,
		setup: async () => {
			await layout();
			await writeNote('Feature Shots/Ember Lash.md', [
				'```nimble-spell', 'name: Ember Lash', 'school: Fire', 'tier: 1', 'actions: 2', 'range: Range 8', 'damage: 3d8',
				'upcast: +5 damage.', "text: A whip of flame cracks across one target. On a crit, it's Smoldering.", '```', '',
			].join('\n'));
			await open('Feature Shots/Ember Lash.md');
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-homebrew'],
	},
	// The Campaign panel alone, folded down to the first chapter, a scene selected.
	'feature-panel': {
		viewport: [1000, 1000], ratio: 4 / 5, snapText: true,
		css: PANEL_CARD_CSS,
		setup: async () => {
			await layout({ left: true });
			await o.eval((app) => app.workspace.leftSplit.setSize?.(380));
			await open(`${CH}/Q1 Entry Chamber.md`);
			await focusPanel(CHAPTER);
		},
		show: () => ['.workspace-split.mod-left-split .nimble-campaign-view'],
	},
	// The sample adventure: its chapter in the panel, and the first scene's read-aloud and encounter.
	'feature-sample': {
		viewport: [1000, 800], lineWidth: 544, extend: true, snapText: true,
		// The scene's properties are hidden in this shot; take them out so the read-aloud sits under the title.
		css: `${PANEL_CARD_CSS}
			.workspace-leaf.mod-active .markdown-reading-view .metadata-container { display: none !important; }
			.workspace-split.mod-root .workspace-leaf.mod-active .view-content { transform: translateY(-60px); }`,
		setup: async () => {
			await layout({ left: true });
			await open(`${CH}/Q1 Entry Chamber.md`);
			await focusPanel(CHAPTER);
		},
		show: () => {
			const R = '.workspace-leaf.mod-active .markdown-reading-view';
			const blocks = [...document.querySelectorAll(`${R} .markdown-preview-sizer > div`)];
			const enc = blocks.findIndex(b => b.querySelector('.nimble-encounter-block'));
			return ['.workspace-split.mod-left-split .nimble-campaign-view', `${R} .inline-title`, ...blocks.slice(0, enc + 1).filter(b => !b.querySelector('.inline-title, .metadata-container, .mod-header, .mod-frontmatter') && b.textContent.trim())];
		},
	},
	// The whole Campaign panel, every chapter and folder open, for a tall tile.
	'feature-panel-full': {
		viewport: [1000, 2200], ratio: 0.2, snapText: true, // all of it; the tile crops from the bottom
		css: PANEL_CARD_CSS,
		setup: async () => {
			await layout({ left: true });
			await o.eval((app) => app.workspace.leftSplit.setSize?.(330));
			await open(`${CH}/Q1 Entry Chamber.md`);
			await o.eval((app) => {
				const view = app.workspace.getLeavesOfType('nimble-campaign')[0]?.view;
				if (!view) return;
				view.collapsed = new Set();
				view.render();
				view.contentEl.scrollTop = 0;
			});
			await page.waitForTimeout(600);
		},
		show: () => ['.workspace-split.mod-left-split .nimble-campaign-view'],
	},
	// The tracker mid-fight from top to bottom, the card and the queue, for a tall tile.
	'feature-tracker-tall': {
		viewport: [1100, 2000], bg: 'var(--background-secondary)', ratio: 0.2, // all of it; the tile crops from the bottom
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		setup: async () => {
			await houndFight(340);
			await typeHp('Ilse', '4');
			await page.evaluate((T) => document.querySelectorAll(`${T}, ${T} *`).forEach(n => { if (n.scrollTop) n.scrollTop = 0; }), T);
		},
		show: () => ['.nimble-encounter-tracker'],
		region: () => {
			const rs = [...document.querySelectorAll('.nimble-encounter-tracker > *')].map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
			return { left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) };
		},
	},
	// ---- User guide shots (docs/*.md), guide-<name>.png ----
	// builder.md "Review": stats that play like another level, each note with its fix, and the Saved in pill.
	'guide-builder-review': {
		viewport: [1200, 700], bg: 'var(--background-secondary)',
		setup: async () => { await buildMonster({ hp: 70, attacks: [['Maul', '3d8+4']], step: 'last' }); },
		show: () => ['.modal.nimble-entity-builder'],
	},
	// builder.md "Level first, or stats first": typed HP on Toughness, the level check disagreeing, the Book tag.
	'guide-builder-level': {
		viewport: [1200, 700], bg: 'var(--background-secondary)',
		setup: async () => { await buildMonster({ hp: 70, step: 1 }); },
		show: () => ['.modal.nimble-entity-builder'],
	},
	// character-sheets.md "Rolling": the roll dialog for Brakka's Battleaxe while he's Raging, his Fury Die to put in.
	'guide-roll-dialog': {
		viewport: [1200, 900], bg: 'var(--background-secondary)', ratio: 0.8,
		setup: async () => {
			await brakka();
			await sheetClick('.ns-class .ns-btn', /^\s*Rage\s*$/);
			await page.waitForTimeout(600);
			await sheetClick('[aria-label^="Attack with Battleaxe"]');
			await page.waitForSelector('.nimble-roll-dialog');
			await page.waitForTimeout(400);
		},
		show: () => ['.modal.nimble-roll-dialog'],
		after: async () => { await page.keyboard.press('Escape'); await restoreHeroes(); },
	},
	// character-sheets.md "The class panel": Tomas's Judgment Dice and Lay on Hands, with Lay on Hands' rules open.
	'guide-class-panel': {
		lineWidth: 620,
		setup: async () => {
			await hero(`Campaigns/Brakka's Journal/Party/Tomas.md`);
			await sheetClick('.ns-class .ns-feat-name', 'Lay on Hands');
			await page.evaluate((S) => document.querySelector(`${S} .ns-class`)?.scrollIntoView({ block: 'center' }), SHEET);
			await page.waitForTimeout(300);
		},
		show: () => [[...document.querySelectorAll('.workspace-leaf.mod-active .markdown-reading-view .nimble-sheet .ns-class')].find(n => n.getBoundingClientRect().width)],
		after: restoreHeroes,
	},
	// character-sheets.md "Class dice": Brakka Raging with a Fury Die, an empty slot tapped for a die rolled at the table.
	'guide-class-dice': {
		lineWidth: 620,
		setup: async () => {
			await brakka();
			await sheetClick('.ns-class .ns-btn', /^\s*Rage\s*$/);
			await page.waitForTimeout(600);
			await sheetClick('.ns-class .ns-held-die.is-empty');
			await page.evaluate((S) => document.querySelector(`${S} .ns-class`)?.scrollIntoView({ block: 'center' }), SHEET);
			await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
			await page.waitForTimeout(300);
		},
		show: () => [[...document.querySelectorAll('.workspace-leaf.mod-active .markdown-reading-view .nimble-sheet .ns-class')].find(n => n.getBoundingClientRect().width)],
		after: restoreHeroes,
	},
	// character-sheets.md "Reactions": the four reaction cards on the Actions tab.
	'guide-reactions': {
		lineWidth: 760,
		setup: async () => {
			await brakka();
			await page.evaluate((S) => {
				const sec = [...document.querySelectorAll(`${S} .ns-tabpanel-actions .ns-section`)].find(n => n.getBoundingClientRect().width && /^Reactions/.test(n.textContent.trim()));
				sec?.scrollIntoView({ block: 'center' });
			}, SHEET);
			await page.waitForTimeout(400);
		},
		show: () => [[...document.querySelectorAll('.workspace-leaf.mod-active .markdown-reading-view .nimble-sheet .ns-tabpanel-actions .ns-section')].find(n => n.getBoundingClientRect().width && /^Reactions/.test(n.textContent.trim()))],
	},
	// character-sheets.md "Making a character": the Stats step, DEX picked to swap with another stat.
	'guide-new-character': {
		viewport: [1200, 860], bg: 'var(--background-secondary)',
		setup: async () => {
			await brakka();
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-character'));
			const m = page.locator('.modal.nimble-newchar-modal');
			await m.waitFor();
			await m.locator('input.lu-name-input').fill('Lyra Thornwood');
			await m.locator('select[data-k="ancestry"]').selectOption('Elf');
			await m.locator('select[data-k="class"]').selectOption('Hunter');
			await m.locator('select[data-k="background"]').selectOption('Wild One');
			await m.locator('.lu-next').click();
			await page.waitForTimeout(500);
			await m.locator('.lu-panel.is-active .ev-seg button', { hasText: 'Balanced' }).click();
			await m.locator('.lu-panel.is-active .lu-place', { hasText: 'DEX' }).locator('.ns-stat-box').click();
			await page.mouse.move(0, 0);
			await page.waitForTimeout(500);
		},
		show: () => ['.modal.nimble-newchar-modal'],
	},
	// character-sheets.md "Levelling up": the wizard's first screen.
	'guide-level-up': {
		viewport: [1200, 860], bg: 'var(--background-secondary)',
		setup: async () => {
			await brakka();
			await page.locator(`${R} .nimble-sheet .ns-camp`).first().click();
			await page.waitForTimeout(400);
			await page.locator('.ns-camp-dialog .is-level').first().click();
			await page.waitForSelector('.nimble-levelup');
			await page.waitForTimeout(600);
			// The Hit points screen, the flat bonus taken so the new max HP shows.
			await page.locator('.nimble-levelup button', { hasText: 'Hit points' }).first().click();
			await page.waitForTimeout(500);
			await page.locator('.nimble-levelup', { hasText: 'Take the flat bonus' }).locator('text=Take the flat bonus').first().click();
			await page.waitForTimeout(600);
		},
		show: () => ['.modal.nimble-levelup'],
	},
	// character-sheets.md "The Character panel": the sheet in the right sidebar.
	'guide-character-panel': {
		viewport: [1200, 900], bg: 'var(--background-secondary)', ratio: 0.9, snapText: true,
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		setup: async () => {
			await resetTracker();
			await layout({ right: true });
			await o.eval((app) => app.workspace.rightSplit.setSize?.(420));
			await open(`Campaigns/Brakka's Journal/Sessions/Session 1 - Down the Cellar Stair.md`);
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:open-my-character'));
			await page.waitForSelector('.nimble-character-view .nimble-sheet');
			await page.waitForTimeout(800);
		},
		show: () => ['.workspace-split.mod-right-split .nimble-character-view'],
	},
	// dice.md "Dice Workshop".
	'guide-dice-workshop': {
		viewport: [1200, 900], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await o.eval((app, plugin) => { plugin.settings.dice3d = true; app.commands.executeCommandById('nimble-gm:dice-workshop'); });
			await page.waitForSelector('.nimble-dice-workshop');
			await page.waitForTimeout(2500);
		},
		ratio: 0.9,
		show: () => ['.modal.nimble-dice-workshop'],
		after: async () => { await page.keyboard.press('Escape'); await layout(); },
	},
	// dice.md "The roll log": Recent rolls in the tracker.
	'guide-roll-log': {
		viewport: [1200, 800], bg: 'var(--background-secondary)', ratio: 1.3,
		css: '.workspace-split.mod-right-split { margin-right: 40px !important; }',
		setup: async () => {
			await resetTracker();
			// The Character panel (guide-character-panel) shares the sidebar; close it.
			await o.eval((app) => app.workspace.getLeavesOfType('nimble-character').forEach(l => l.detach()));
			await layout({ right: true });
			// A GM note, so the campaign in play is one you run (a player campaign hides the tracker).
			await open(`${CH}/Q6 Storage Vault.md`);
			await o.eval((app) => app.workspace.rightSplit.setSize?.(380));
			// The tracker's tab in front (an earlier shot may have left the Character panel there).
			await o.eval(async (app) => { const l = app.workspace.getLeavesOfType('nimble-encounter-tracker')[0]; if (l) await app.workspace.revealLeaf(l); });
			await o.eval((app, plugin) => {
				plugin.settings.dice3d = false;
				plugin.rollDice('1d20+3', 'Brakka · STR save', 'check', [14]);
				plugin.rollDice('1d10+3', 'Brakka · Battleaxe', 'attack', [7]);
				plugin.rollDice('2d6+2', 'Mercury Ooze · Engulfing Touch', 'attack', [6, 4]);
				plugin.rollDice('1d8+2', 'Quicksilver Hound · Bite', 'attack', [1]);
				plugin.rollDice('4d6', 'Treasure', 'effect', [3, 5, 2, 6]);
			});
			await page.waitForTimeout(600);
			// The log sits under the tracker's empty state; bring it into view.
			await page.evaluate(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); document.querySelector('.nimble-encounter-tracker .roll-log')?.scrollIntoView({ block: 'center' }); });
			await page.waitForTimeout(300);
		},
		show: () => ['.nimble-encounter-tracker .roll-log'],
	},
	// dice.md "Rolling into a note": /roll 2d6+3 written into a note.
	'guide-roll-note': {
		lineWidth: 640,
		setup: async () => {
			await layout();
			await writeNote('Feature Shots/Rolls.md', '## The chest\n\n');
			await open('Feature Shots/Rolls.md');
			await livePreview();
			await o.eval((app, plugin) => { plugin.settings.dice3d = false; const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
			// A plain roll, then the same as a Nimble attack (the menu's second choice).
			for (const [text, pick] of [['Gold inside: /roll 2d6+3', 0], ['The trap\'s needle: /roll 1d8+2', 1]]) {
				await page.keyboard.type(text, { delay: 20 });
				await page.waitForSelector('.suggestion-container .nimble-slash-item');
				await page.waitForTimeout(300);
				for (let i = 0; i < pick; i++) await page.keyboard.press('ArrowDown');
				await page.keyboard.press('Enter');
				await page.waitForTimeout(500);
				await page.keyboard.press('Enter');
				await page.keyboard.press('Enter');
			}
			await page.waitForTimeout(500);
			await open('Feature Shots/Rolls.md');
			await page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
		},
		show: () => {
			const R = '.workspace-leaf.mod-active .markdown-reading-view';
			return [...document.querySelectorAll(`${R} .markdown-preview-sizer > div`)].filter(b => b.textContent.trim() && !b.querySelector('.inline-title, .metadata-container, .mod-header, .mod-frontmatter'));
		},
		region: inkRegion,
	},
	// encounters.md "The encounter builder".
	'guide-encounter-builder': {
		viewport: [1200, 860], bg: 'var(--background-secondary)',
		setup: async () => {
			await resetTracker();
			await layout({ left: true });
			await open(`${CH}/Q6 Storage Vault.md`);
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:build-encounter'));
			await page.waitForSelector('.nimble-builder-modal .builder-search');
			for (const [q, n] of [['quicksilver hound', 3], ['mercury ooze', 1]]) {
				await page.locator('.nimble-builder-modal .builder-search').fill(q);
				await page.waitForTimeout(400);
				for (let i = 0; i < n; i++) { await page.locator('.nimble-builder-modal .builder-result').first().click(); await page.waitForTimeout(150); }
			}
			await page.locator('.nimble-builder-modal .builder-name').fill('Ambush in the storage vault');
			await page.locator('.nimble-builder-modal .builder-search').fill('');
			await page.waitForTimeout(500);
		},
		show: () => ['.modal.nimble-builder-modal'],
	},
	// players.md "Battle notes": a battle in a player campaign's session.
	'guide-battle-notes': {
		lineWidth: 520,
		setup: async () => {
			await layout();
			await open(`Campaigns/Brakka's Journal/Sessions/Session 1 - Down the Cellar Stair.md`);
			await scrollTo(`${R} .nimble-battle-notes`, 0.2);
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-battle-notes'],
	},
	// quests.md "Linking a quest": the /quest menu.
	'guide-quest-suggest': {
		viewport: [1200, 800], keepFocus: true,
		css: '.cm-editor .cm-content .cm-active.cm-line, .cm-editor .cm-content .cm-active.cm-line * { visibility: visible !important; } .cm-editor .cm-content { caret-color: transparent !important; }',
		setup: async () => {
			await layout();
			await writeNote(`${C}/Sessions/Session 2 - Into the Vaults.md`, '---\nnimble: session\n---\n\n## Prep\n\n');
			await open(`${C}/Sessions/Session 2 - Into the Vaults.md`);
			await livePreview();
			await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lineCount() - 1, ch: 0 }); ed.focus(); });
			await page.keyboard.type('Hook them with /quest ', { delay: 20 });
			await page.waitForSelector('.suggestion-container .nimble-slash-item');
			await page.waitForTimeout(500);
		},
		show: () => ['.suggestion-container', [...document.querySelectorAll('.cm-active.cm-line')].find(n => n.getBoundingClientRect().width)],
		region: () => {
			const line = [...document.querySelectorAll('.cm-active.cm-line')].find(n => n.getBoundingClientRect().width);
			const r = document.createRange(); r.selectNodeContents(line);
			const t = r.getBoundingClientRect(), m = document.querySelector('.suggestion-container').getBoundingClientRect();
			return { left: Math.min(t.left, m.left), top: Math.min(t.top, m.top), right: Math.max(t.right, m.right), bottom: Math.max(t.bottom, m.bottom) };
		},
		after: async () => {
			await page.keyboard.press('Escape');
			await o.eval(async (app) => { const f = app.vault.getAbstractFileByPath('Campaigns/The Old Quarter/Sessions/Session 2 - Into the Vaults.md'); if (f) await app.vault.delete(f); });
			await layout();
		},
	},
	// quests.md "Open, finished and failed": the panel's open quests (an active one filled, a waiting one a ring),
	// and the Quests folder with the finished one ticked below them.
	'guide-quests-folder': {
		viewport: [1000, 800], css: PANEL_CARD_CSS, ratio: 0.9,
		setup: async () => {
			await layout({ left: true });
			await o.eval((app) => app.workspace.leftSplit.setSize?.(300)); // the default, whatever earlier shots left
			await open(`${C}/Sessions/Session 1 - Silver Between the Stones.md`);
			await focusPanel('Quests');
			await page.waitForTimeout(500);
		},
		bg: 'var(--background-secondary)',
		show: () => ['.workspace-split.mod-left-split .nimble-campaign-view'],
		// From the open quests down to the end of the Quests folder.
		region: () => {
			const P = document.querySelector('.workspace-split.mod-left-split .nimble-campaign-view');
			const box = P.getBoundingClientRect();
			const head = P.querySelector('.campaign-heading-quests');
			const folder = [...P.querySelectorAll('.campaign-group-head')].find(h => /Quests/.test(h.textContent)).parentElement;
			// What sits above the open quests and below the folder would peek into the padding: hide it.
			const hideAround = (el, dir) => { for (let n = el; n && n !== P; n = n.parentElement) for (let s = n[dir]; s; s = s[dir]) s.style.visibility = 'hidden'; };
			hideAround(head, 'previousElementSibling');
			hideAround(folder, 'nextElementSibling');
			return { left: box.left + 8, right: box.right - 8, top: head.getBoundingClientRect().top, bottom: folder.getBoundingClientRect().bottom };
		},
	},
	// getting-started.md "Install": the ribbon's Campaign, tracker and compendium icons.
	'guide-ribbon': {
		viewport: [1000, 800], ratio: 0.8,
		// The ribbon sits at the window's edge; move it in so it gets the same padding as the rest.
		css: '.workspace-ribbon.mod-left { margin-left: 28px !important; } .workspace-ribbon.mod-left::before { display: none !important; }',
		setup: async () => {
			await layout({ left: true });
			await o.eval((app) => app.workspace.leftSplit.setSize?.(300)); // the default, whatever earlier shots left
			await open(`${CH}/Q1 Entry Chamber.md`);
			await focusPanel(CHAPTER);
		},
		show: () => ['.workspace-ribbon.mod-left', '.workspace-split.mod-left-split .nimble-campaign-view'],
		region: () => {
			const rib = document.querySelector('.workspace-ribbon.mod-left').getBoundingClientRect();
			const icons = [...document.querySelectorAll('.workspace-ribbon.mod-left .side-dock-ribbon-action')].filter(n => /^(Campaign|Encounter tracker|Compendium|My character)$/.test(n.getAttribute('aria-label') || ''));
			const bottom = Math.max(...icons.map(n => n.getBoundingClientRect().bottom)) + 8;
			const panel = document.querySelector('.workspace-split.mod-left-split .nimble-campaign-view').getBoundingClientRect();
			return { left: rib.left, top: rib.top, right: panel.right, bottom };
		},
	},
	// compendium.md "Referencing anything": references as chips in a sentence, one hovered for its card.
	'guide-compendium-ref': {
		lineWidth: 640, viewport: [1200, 900], keepHover: true,
		setup: async () => {
			await layout();
			await writeNote('Feature Shots/Prep notes.md', 'If the hounds swarm Ilse, she casts `nimble:spell:Flame Dart` at the closest, Tomas uses `nimble:feature:Lay on Hands` on whoever drops, and anyone caught in the gas is `nimble:condition:Dazed`.\n');
			await open('Feature Shots/Prep notes.md');
			// The last chip in the sentence, so its card opens below the whole paragraph.
			await page.locator(`${R} .nimble-inline-name`, { hasText: 'Dazed' }).first().hover();
			await page.waitForSelector('.nimble-hover-preview');
			await page.waitForTimeout(800);
		},
		show: () => {
			const R = '.workspace-leaf.mod-active .markdown-reading-view';
			const p = [...document.querySelectorAll(`${R} .markdown-preview-sizer > div`)].find(b => b.querySelector('.nimble-inline-ref'));
			return [p, '.nimble-hover-preview'];
		},
	},
	// compendium.md "Sorting": the sort panel on the Spells tab, school then tier high to low.
	'guide-compendium-sort': {
		viewport: [1000, 800], css: '.workspace-split.mod-root { margin-right: 24px !important; }', snapText: true, ratio: 1,
		setup: async () => {
			await layout();
			await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			await page.waitForSelector(`${X} .nimble-cmpx-row[data-id]`, { timeout: 5000 });
			await page.locator(`${X} .nimble-cmpx-seg`, { hasText: 'Spells' }).first().click();
			await page.waitForTimeout(400);
			await page.locator(`${X} .nimble-cmpx-sort`).click();
			await page.waitForTimeout(300);
			await page.locator(`${X} .nimble-cmpx-sort-key`).first().selectOption('school');
			await page.waitForTimeout(300);
			await page.locator(`${X} .nimble-cmpx-sort-add`).click();
			await page.waitForTimeout(300);
			await page.locator(`${X} .nimble-cmpx-sort-key`).nth(1).selectOption('tier');
			await page.waitForTimeout(300);
			await page.locator(`${X} .nimble-cmpx-sort-dir`).nth(1).click();
			await page.waitForTimeout(500);
		},
		show: () => [document.querySelector('.workspace-leaf.mod-active .nimble-compendium .nimble-cmpx-sortpanel').parentElement],
		// The search bar, the sort panel and the top of the list: the left column only.
		region: () => {
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			const bar = document.querySelector(`${X} .nimble-cmpx-sort`).parentElement.getBoundingClientRect();
			const side = document.querySelector(`${X} .nimble-cmpx-sortpanel`).parentElement.getBoundingClientRect();
			return { left: side.left, right: side.right, top: bar.top, bottom: bar.top + side.width * 0.95 };
		},
	},
	// compendium.md "The compendium as a dialog": opened from the sheet's + Item.
	'guide-compendium-dialog': {
		viewport: [1200, 860], bg: 'var(--background-secondary)',
		setup: async () => {
			await brakka();
			await page.locator(`${R} .nimble-sheet button`, { hasText: /^\s*Item\s*$/ }).first().click();
			await page.waitForSelector('.modal .nimble-cmpx-row[data-id]');
			await page.waitForTimeout(400);
			await page.keyboard.type('shield');
			await page.waitForTimeout(600);
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(500);
		},
		show: () => ['.modal-container .modal'],
	},
	// dice.md "The roll's result": three rolls from Brakka's sheet as they land: a save, a crit and a miss.
	'guide-roll-toast': {
		viewport: [1200, 800], bg: 'var(--background-secondary)', ratio: 1.2, keepNotices: true,
		setup: async () => {
			await brakka();
			await o.eval((app, plugin) => {
				document.querySelectorAll('.notice').forEach(n => n.remove());
				plugin.rollDice('1d20+3', 'Brakka · STR save', 'check', [14]);
				plugin.rollDice('1d8+3', 'Brakka · Battleaxe', 'attack', [8, 5]);
				plugin.rollDice('1d8+3', 'Brakka · Battleaxe', 'attack', [1]);
			});
			await page.waitForTimeout(700);
		},
		show: () => ['.notice-container'],
	},
	// encounters.md "Several at once": Add several on a Quicksilver Hound, three of them one level tougher.
	'guide-add-several': {
		viewport: [1200, 800], bg: 'var(--background-secondary)', ratio: 1,
		setup: async () => {
			await layout();
			await open(`${CH}/Q6 Storage Vault.md`);
			await resetTracker();
			await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			await page.waitForSelector(`${X} .nimble-cmpx-row[data-id]`, { timeout: 5000 });
			await page.locator(`${X} .nimble-cmpx-input`).fill('quicksilver hound');
			await page.waitForTimeout(500);
			await page.locator(`${X} .nimble-cmpx-row[data-id]`).first().click();
			await page.waitForTimeout(400);
			await page.locator(`${X} .statblock-action-more:visible`).first().click();
			await page.locator('.menu .menu-item', { hasText: 'Add several' }).first().click();
			await page.waitForSelector('.modal-container .modal');
			await page.keyboard.press('Backspace');
			await page.keyboard.type('3');
			await page.locator('.modal-container .modal button', { hasText: /^\s*Tougher\s*$/ }).first().click();
			await page.waitForTimeout(400);
		},
		show: () => ['.modal-container .modal'],
	},
	// settings.md "Party": the party editor, opened outside any campaign.
	'guide-party-editor': {
		viewport: [1200, 800], bg: 'var(--background-secondary)',
		setup: async () => {
			await layout();
			await open('Start Here.md');
			await o.eval(async (app, plugin) => {
				await plugin.campaigns.setActive(null);
				plugin.settings.party = [
					{ id: 'ft-1', name: 'Kaelen', className: 'Oathsworn', level: 3, maxHp: 34, defense: 6, maxWounds: 6 },
					{ id: 'ft-2', name: 'Mira', className: 'Mage', level: 3, maxHp: 21, defense: 2, maxWounds: 6 },
					{ id: 'ft-3', name: 'Roan', className: 'Hunter', level: 3, maxHp: 27, defense: 4, maxWounds: 6 },
				];
				app.commands.executeCommandById('nimble-gm:edit-party');
			});
			await page.waitForSelector('.modal-container .modal');
			await page.waitForTimeout(500);
		},
		show: () => ['.modal-container .modal'],
		after: async () => {
			await page.keyboard.press('Escape');
			await o.eval(async (app, plugin) => { plugin.settings.party = []; await plugin.campaigns.setActive('Campaigns/The Old Quarter'); });
			await layout();
		},
	},
	// compendium.md "Classes": a class page under its scrollwork, Nimble's levels under khaki ribbons.
	'guide-compendium-class': {
		viewport: [1200, 900], css: '.workspace-split.mod-root { margin-right: 24px !important; }', ratio: 1.2, snapText: true,
		setup: async () => {
			await layout();
			await open(`${CH}/Q1 Entry Chamber.md`);
			await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			await page.waitForSelector(`${X} .nimble-cmpx-row[data-id]`, { timeout: 5000 });
			await page.locator(`${X} .nimble-cmpx-seg`, { hasText: 'Classes' }).first().click();
			await page.waitForTimeout(400);
			await page.locator(`${X} .nimble-cmpx-row[data-id]`, { hasText: 'Berserker' }).first().click();
			await page.waitForTimeout(600);
		},
		// The page beside the list, from its top.
		show: () => {
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			const card = [...document.querySelectorAll(`${X} .nimble-cmpx-detail .nimble-cmp-card`)].find(n => n.getBoundingClientRect().width > 200);
			return [card];
		},
	},
	// 5e.md "The 5e compendium": Fireball's card in the 2024 dress, beside the Spells list.
	'guide-5e-compendium': {
		viewport: [1200, 800], css: '.workspace-split.mod-root { margin-right: 24px !important; }',
		setup: async () => {
			await layout();
			await swordCoast();
			await writeNote('Campaigns/Sword Coast/Road Ambush.md', '# Road ambush\n');
			await open('Campaigns/Sword Coast/Road Ambush.md');
			await o.eval(async (app, plugin) => { for (let i = 0; i < 50 && plugin.system().id !== 'dnd5e'; i++) await new Promise(r => setTimeout(r, 100)); await plugin.openSystemCompendium(); });
			const X = '.workspace-leaf.mod-active .nimble-compendium';
			await page.waitForSelector(`${X} .nimble-cmpx-row[data-id]`, { timeout: 8000 });
			await page.locator(`${X} .nimble-cmpx-seg`, { hasText: 'Spells' }).first().click();
			await page.waitForTimeout(400);
			await page.locator(`${X} .nimble-cmpx-input`).fill('fire');
			await page.waitForTimeout(500);
			await page.locator(`${X} .nimble-cmpx-row[data-id]`, { hasText: 'Fireball' }).first().click();
			await page.waitForTimeout(600);
		},
		show: () => ['.workspace-leaf.mod-active .nimble-compendium'],
		region: () => {
			const X = document.querySelector('.workspace-leaf.mod-active .nimble-compendium');
			const b = X.getBoundingClientRect();
			const tabs = X.querySelector('.nimble-cmpx-seg').parentElement.getBoundingClientRect();
			// Down to the bottom of what the page shows (its card and buttons).
			const shown = [...X.querySelectorAll('.nimble-cmpx-detail button, .nimble-cmpx-detail p, .nimble-cmpx-detail div')].map(n => n.getBoundingClientRect()).filter(r => r.width && r.height && r.top > b.top + 100 && r.bottom < b.bottom - 4);
			const bottom = shown.length ? Math.max(...shown.map(r => r.bottom)) : b.bottom;
			return { left: b.left, right: Math.min(b.right, tabs.right), top: b.top, bottom };
		},
	},
	// bestiary.md "Writing a stat block": Krogg from the field reference, drawn as the GM's Guide draws a legendary.
	'guide-statblock': {
		lineWidth: 640, viewport: [1200, 1100], ratio: 0.5,
		setup: async () => {
			await layout();
			await writeNote('Feature Shots/Krogg.md', [
				'```nimble', 'name: Krogg, Goblin King', 'level: 2', 'role: solo', 'size: Medium', 'type: Angry Bugbear', 'hp: 28/hero', 'armor: none', 'movement: 6', 'saves: STR+ DEX+',
				"actionText: After each hero's turn, choose one:", 'attacks:',
				'- **Manglemaul.** Move 6. 2d6+2 damage, Grappled (escape DC 10).',
				'- **Crack Skulls.** Move 6. Swing a Grappled creature at another creature. Both take 2d6+2.',
				"bloodied: At 45 HP, Krogg's damage increases to 2d8+2.",
				'lastStand: At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium Armor.',
				'easier: Have the Manglemaul jam after using Crack Skulls.', 'harder: Move often; end turns out of melee reach.',
				'```', '',
			].join('\n'));
			await open('Feature Shots/Krogg.md');
		},
		show: () => ['.workspace-leaf.mod-active .markdown-reading-view .nimble-statblock'],
	},
};

const FEATURE_CSS = `
body.ft-iso *:not(.ft-path):not(.ft-show):not(.ft-show *) { visibility: hidden !important; }
body.ft-iso, body.ft-iso .ft-path { background: var(--ft-bg) !important; border-color: transparent !important; box-shadow: none !important; }
body.ft-iso .ft-path::before, body.ft-iso .ft-path::after { display: none !important; }
body.ft-iso ::-webkit-scrollbar { display: none !important; }
body.ft-lw, body.ft-lw .markdown-preview-view { --file-line-width: var(--ft-line-width) !important; }
`;

let cdp;
async function featureShot(name, f) {
	cdp ??= await page.context().newCDPSession(page);
	const [w, h] = f.viewport || [1200, 800];
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
	await page.evaluate(([css, lw]) => {
		(document.getElementById('ft-style') || document.head.createEl('style', { attr: { id: 'ft-style' } })).textContent = css;
		if (lw) { document.body.style.setProperty('--ft-line-width', `${lw}px`); document.body.addClass('ft-lw'); }
		document.body.addClass('ft-on');
	}, [FEATURE_CSS + (f.css ? `body.ft-on ${f.css}` : ''), f.lineWidth]);
	await page.waitForTimeout(600);
	await f.setup();
	if (!f.keepHover) await page.mouse.move(w - 1, h - 1);
	await page.evaluate(([keep, notices]) => { if (!keep) activeDocument.activeElement?.blur?.(); if (!notices) document.querySelectorAll('.notice').forEach(n => n.remove()); }, [!!f.keepFocus, !!f.keepNotices]);
	await page.waitForTimeout(400);
	let box = await page.evaluate(([bg, showSrc, regionSrc]) => {
		// The first visible match of each selector (a note can be rendered twice, once hidden).
		const els = (0, eval)(`(${showSrc})`)().flatMap(s => typeof s === 'string' ? [...document.querySelectorAll(s)].filter(n => n.getBoundingClientRect().width).slice(0, 1) : [s]);
		if (!els.length) throw new Error('nothing to show');
		for (const el of els) {
			el.addClass('ft-show');
			for (let p = el.parentElement; p; p = p.parentElement) p.addClass('ft-path');
		}
		document.body.style.setProperty('--ft-bg', bg);
		document.body.addClass('ft-iso');
		if (regionSrc) return (0, eval)(`(${regionSrc})`)();
		const rs = els.map(e => e.getBoundingClientRect());
		return { left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) };
	}, [f.bg || 'var(--background-primary)', f.show.toString(), f.region?.toString()]);
	// Hiding the rest can reflow the feature (no scrollbars, a re-render); measure again once it settles.
	await page.waitForTimeout(500);
	box = await page.evaluate((regionSrc) => {
		if (regionSrc) return (0, eval)(`(${regionSrc})`)();
		const rs = [...document.querySelectorAll('.ft-show')].map(e => e.getBoundingClientRect()).filter(r => r.width);
		return { left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) };
	}, f.region?.toString()).catch(() => box);
	if (process.env.DEBUG) console.log(name, box);
	const ratio = f.ratio || (f.wide ? 16 / 9 : 16 / 10);
	const x = Math.round(box.left - FEATURE_PAD), y = Math.round(box.top - FEATURE_PAD);
	const width = Math.round(box.right + FEATURE_PAD) - x;
	let height = Math.round(box.bottom + FEATURE_PAD) - y;
	const natural = width / height;
	// Close enough keeps its bottom padding; the frame's crop absorbs the rest.
	if (natural < ratio * 0.92 || f.extend) height = Math.round(width / ratio);
	const clip = { x: Math.max(0, x), y: Math.max(0, y), width: Math.min(width, w - Math.max(0, x)), height: Math.min(height, h - Math.max(0, y)), scale: 1 };
	// A bottom cut that would slice a line of text moves up into the gap above it.
	if (f.snapText) {
		const cut = await page.evaluate((cut) => {
			const rs = [];
			for (const el of document.querySelectorAll('.ft-show')) {
				const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
				for (let t = walk.nextNode(); t; t = walk.nextNode()) {
					if (!t.textContent.trim()) continue;
					const r = document.createRange(); r.selectNodeContents(t); rs.push(...r.getClientRects());
				}
			}
			for (let moved = true; moved;) {
				moved = false;
				for (const r of rs) if (r.top < cut && r.bottom > cut) { cut = r.top - 10; moved = true; }
			}
			return cut;
		}, clip.y + clip.height);
		clip.height = Math.round(cut - clip.y);
	}
	const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
	writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
	await page.evaluate(() => {
		document.body.removeClass('ft-iso', 'ft-lw', 'ft-on');
		document.querySelectorAll('.ft-show, .ft-path').forEach(n => n.removeClass('ft-show', 'ft-path'));
		document.body.style.removeProperty('--ft-bg');
		document.body.style.removeProperty('--ft-line-width');
	});
	if (f.after) await f.after();
	return `${clip.width}×${clip.height} css (natural ${natural.toFixed(2)}, want ${ratio.toFixed(2)})`;
}

// Device shots for the landing page's phone and iPad mockups: the whole app in
// Obsidian's own mobile layout (app.emulateMobile, the same switch as its
// "Toggle mobile emulation"), at 2×, no padding. Run last: switching to
// mobile reloads the plugin, and the run switches back afterwards.
const devices = {
	// iPad landscape: the Campaign panel on the first chapter beside a scene.
	'device-ipad': {
		size: [1180, 820],
		setup: async () => {
			await layout({ left: true });
			await open(`${CH}/Q1 Entry Chamber.md`);
			// Opening a note shuts the sidebar on mobile; open it again and pin it beside the note.
			await o.eval(async (app, plugin) => { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); });
			await page.waitForTimeout(600);
			const pin = page.locator('.workspace-drawer.mod-left svg.lucide-pin').locator('..');
			if (await pin.count()) { await pin.first().click(); await page.waitForTimeout(800); }
			await focusPanel(CHAPTER);
			await page.waitForTimeout(1200);
		},
	},
	// iPhone portrait: the top of Brakka's character sheet.
	'device-phone': {
		size: [390, 844], phone: true,
		setup: async () => {
			await layout();
			await open(`Campaigns/Brakka's Journal/Party/Brakka.md`);
		},
	},
};

async function deviceShot(name, d) {
	cdp ??= await page.context().newCDPSession(page);
	const [width, height] = d.size;
	await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
	await o.eval((app) => app.emulateMobile(true));
	await page.waitForTimeout(1500);
	await o.waitFor(() => page.evaluate(() => !!window.app.plugins?.plugins?.['nimble-gm']?._loaded), { what: 'plugin after mobile switch' });
	await d.setup();
	await page.mouse.move(width - 1, height - 1);
	await page.waitForTimeout(400);
	// No tooltips left over from the taps above.
	await page.evaluate(() => { activeDocument.activeElement?.blur?.(); document.querySelectorAll('.notice, .tooltip').forEach(n => n.remove()); });
	await page.waitForTimeout(800);
	const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
	writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
	return `${width}×${height} css, body: ${await page.evaluate(() => [...document.body.classList].filter(c => /^is-/.test(c)).join(' '))}`;
}

let failed = 0;
try {
	// These two keep the size they were first taken at (1400×900); the rest are the listing's 1200×800.
	const sizes = { 'character-sheet': [1400, 900], 'player-campaign': [1400, 900] };
	for (const [name, setup] of Object.entries(shots)) {
		if (!wanted(name)) continue;
		try {
			const [vw, vh] = sizes[name] || [1200, 800];
			await page.setViewportSize({ width: vw, height: vh });
			await setup();
			await page.mouse.move(vw - 1, vh - 1); // no stray hover states (except the hover shot)
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
	for (const [name, f] of Object.entries(features)) {
		if (!wanted(name)) continue;
		try {
			console.log(`  ✓ ${name}: ${await featureShot(name, f)}`);
		} catch (e) {
			failed++;
			console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
		}
	}
	let mobile = false;
	for (const [name, d] of Object.entries(devices)) {
		if (!wanted(name)) continue;
		mobile = true;
		try {
			console.log(`  ✓ ${name}: ${await deviceShot(name, d)}`);
		} catch (e) {
			failed++;
			console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
		}
	}
	if (mobile) {
		await o.eval((app) => app.emulateMobile(false));
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await cdp.send('Emulation.setScrollbarsHidden', { hidden: false });
	}
	if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride');
	if (o.consoleErrors.length) console.log('console errors:', o.consoleErrors);
} finally {
	await o.close();
}
process.exit(failed ? 1 : 0);
