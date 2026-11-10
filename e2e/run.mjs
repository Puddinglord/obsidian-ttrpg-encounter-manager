// End-to-end tests: drives a real, isolated Obsidian with the built plugin.
//
//   npm run test:e2e              build, then run every test
//   node e2e/run.mjs hover        run tests whose name contains "hover"
//   KEEP_E2E=1 node e2e/run.mjs   keep the temp vault for inspection
//
// Screenshots of failures (and a few showcase shots) go to e2e/artifacts/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { launchObsidian } from './harness.mjs';
import { createServer } from 'node:http';
import { strToU8, zipSync } from 'fflate';

const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), 'artifacts');
rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const filter = process.argv[2];

// ---------------------------------------------------------------------------
// helpers

const R = '.markdown-reading-view';
const S = '.markdown-source-view';
const T = '.nimble-encounter-tracker';
const PREVIEW = '#nimble-hover-preview-active';

const PARTY = [
	{ id: 'hero-aria', name: 'Aria', level: 2, maxHp: 10, defense: 14, maxWounds: 6, className: 'Shadowmancer' },
	{ id: 'hero-bram', name: 'Bram', level: 2, maxHp: 20, defense: 16, maxWounds: 6, className: 'Commander' },
];

/** Fresh single encounter, default rules, no party, nothing floating on screen. */
async function resetEncounter(o, { party = [] } = {}) {
	await o.eval(async (app, plugin, party) => {
		plugin.hover.hide();
		document.querySelectorAll('.nimble-popover, .menu').forEach(n => n.remove());
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()); // a dialog left open by a failed test
		plugin.settings.multipleEncounters = false;
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		// No campaign active: tests own the party.
		if (plugin.campaigns && plugin.settings.activeCampaign) await plugin.campaigns.setActive(null);
		plugin.settings.party = party;
		plugin.settings.autoArmor = true;
		plugin.settings.minionOverkill = true;
		plugin.settings.nimbleAttackRolls = true;
		const view = plugin.getEncounterView();
		if (view) {
			view.prompts = [];
			view.viewingCreatureId = null;
			view.expanded?.clear();
			view.flash?.clear();
		}
		plugin.encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
		await plugin.activateEncounterView(false);
	}, party);
	await o.page.waitForTimeout(150);
}

const creatures = (o) => o.eval((app, plugin) => (plugin.encounters.active?.creatures || []).map(c => ({
	label: c.label, side: c.side, hp: c.currentHp, max: c.maxHp, conditions: c.conditions, done: !!c.done,
	alive: c.alive, count: c.count, wounds: c.wounds, armor: c.monster.armor, lastStand: !!c.lastStand,
})));
const encounter = (o) => o.eval((app, plugin) => {
	const e = plugin.encounters.active;
	return e && { name: e.name, round: e.round, phase: e.phase, sourcePath: e.sourcePath };
});
const notices = (o) => o.page.evaluate(() => [...document.querySelectorAll('.notice')].map(n => n.innerText));
const exact = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** The tracker row for a combatant, by its exact label. */
const card = (o, label) => o.page.locator(`${T} .creature-item`).filter({ has: o.page.locator('.creature-label', { hasText: exact(label) }) });

/** Type into a combatant's HP box, like a GM would: click the HP, type, Enter. */
async function typeHp(o, label, value) {
	await card(o, label).locator('.hp-display').click();
	await o.page.keyboard.type(value);
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(120);
}

/** Pick an item from a combatant's ⋮ menu. */
async function creatureMenu(o, label, item) {
	await card(o, label).locator('.creature-more').click();
	await o.page.locator('.menu .menu-item', { hasText: item }).first().click();
	await o.page.waitForTimeout(100);
}

/** Move the pointer somewhere neutral so no hover preview is pending or open. */
async function parkMouse(o) {
	await o.page.mouse.move(2, 450);
	await o.page.waitForTimeout(450);
	await o.eval((app, plugin) => plugin.hover.hide());
}

const rectsOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ---------------------------------------------------------------------------
// Rendering

test('plugin loads cleanly', async (o) => {
	const loaded = await o.eval((app) => !!app.plugins.plugins['nimble-gm']?._loaded);
	assert.ok(loaded);
	assert.ok(await o.eval((app, plugin) => plugin.index.bundledCount) >= 500, 'bundled bestiary loaded');
});

test('regular stat block renders kicker, badges, abilities and attacks', async (o) => {
	await o.openFile('Bestiary/Goblin Boss.md');
	const info = await o.page.evaluate((R) => {
		const b = document.querySelector(`${R} .nimble-statblock`);
		return {
			kicker: b.querySelector('.monster-kicker')?.textContent,
			name: b.querySelector('.monster-name')?.textContent,
			badges: [...b.querySelectorAll('.monster-badges .stat-badge .badge-value')].map(x => x.textContent),
			armorTitle: b.querySelector('.armor-badge')?.getAttribute('aria-label'),
			ability: b.querySelector('.ability-item')?.textContent,
			multi: b.querySelector('.multiattack')?.textContent,
			attacks: [...b.querySelectorAll('.actions-list li')].map(li => li.textContent),
			hasAdd: !!b.querySelector('.add-btn'),
		};
	}, R);
	assert.equal(info.name, 'Goblin Boss');
	assert.equal(info.kicker, 'Lvl 2 · Small · Humanoid');
	assert.deepEqual(info.badges, ['36', 'M', 'STR+ DEX++ WIL−']);
	assert.equal(info.armorTitle, 'Medium armor');
	assert.match(info.ability, /^Redirect Attack\. When missed/);
	assert.equal(info.multi, 'Makes two scimitar attacks');
	assert.deepEqual(info.attacks, ['Scimitar 1d6+2 slashing', 'Javelin 2d4 piercing']);
	assert.ok(info.hasAdd);
});

test('legendary stat block renders header, senses and phases', async (o) => {
	await o.openFile('Bestiary/Young Dragon.md');
	const info = await o.page.evaluate((R) => {
		const b = document.querySelector(`${R} .nimble-statblock.solo-monster`);
		return {
			role: b.classList.contains('role-legendary'),
			kicker: b.querySelector('.monster-kicker')?.textContent,
			name: b.querySelector('h2.monster-name')?.textContent,
			badges: [...b.querySelectorAll('.monster-badges .badge-value')].map(x => x.textContent),
			defenses: b.querySelector('.monster-defenses')?.textContent,
			intro: b.querySelector('.actions-intro')?.textContent,
			bloodied: b.querySelector('.phase-section.bloodied-section')?.textContent,
			lastStand: b.querySelector('.phase-section.laststand-section')?.textContent,
			abilities: [...b.querySelectorAll('.ability-item .ability-name')].map(x => x.textContent),
			frightened: b.querySelector('.nimble-condition-ref')?.textContent,
		};
	}, R);
	assert.ok(info.role);
	assert.equal(info.kicker, 'Lvl 7 · Solo · Large · Dragon');
	assert.equal(info.name, 'Young Dragon');
	assert.deepEqual(info.badges, ['120', 'H', '8, fly 16', 'STR++ DEX+ WIL++']);
	assert.match(info.defenses, /Resistant: Fire/);
	assert.match(info.defenses, /Senses: Blindsight 6 spaces/);
	assert.match(info.intro, /^SOLO: After each hero's turn, choose one:/);
	assert.match(info.bloodied, /^BLOODIED: Fire Breath recharges/);
	assert.match(info.lastStand, /^LAST STAND: The dragon lashes out/);
	assert.deepEqual(info.abilities, ['Frightful Presence.', 'Wing Attack.']);
	assert.equal(info.frightened, 'Frightened');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-solo.png') });
});

test('stat block text can never inject HTML or script', async (o) => {
	await o.openFile('Edge Cases.md');
	const r = await o.page.evaluate((R) => ({
		xss: !!window.__nimbleXss,
		tags: document.querySelectorAll(`${R} .nimble-statblock b, ${R} .nimble-statblock img, ${R} .nimble-statblock i`).length,
		name: [...document.querySelectorAll(`${R} .monster-name`)].map(e => e.textContent).find(t => t.includes('Rat')),
	}), R);
	assert.equal(r.xss, false);
	assert.equal(r.tags, 0);
	assert.equal(r.name, 'Tagged <b>Bold</b> Rat');
});

test('wikilinks with underscores resolve and open', async (o) => {
	await o.openFile('Edge Cases.md');
	const link = o.page.locator(`${R} a.nimble-wikilink`, { hasText: 'snake_case_note' });
	assert.equal(await link.getAttribute('href'), 'snake_case_note.md');
	await link.click();
	await o.page.waitForTimeout(400);
	assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'snake_case_note.md');
});

test('hp 0, tilde fences and missing names are handled', async (o) => {
	await o.openFile('Edge Cases.md');
	const r = await o.page.evaluate((R) => ({
		golemHp: [...document.querySelectorAll(`${R} .nimble-statblock`)].find(b => b.textContent.includes('Paper Golem'))?.querySelector('.hp-badge .badge-value')?.textContent,
		error: document.querySelector(`${R} .nimble-error`)?.textContent,
	}), R);
	assert.equal(r.golemHp, '0');
	assert.match(r.error, /needs a name/);
	assert.ok(await o.eval((app, plugin) => !!plugin.index.get('Tilde Toad')));
});

// ---------------------------------------------------------------------------
// Inline references

test('reading view: inline references resolve, unknown ones are flagged', async (o) => {
	await o.openFile('Adventure.md');
	await o.waitFor(() => o.page.evaluate((R) => document.querySelectorAll(`${R} .nimble-inline-ref`).length === 5, R),
		{ timeout: 5000, what: 'reading view to render 5 inline references' });
	const r = await o.page.evaluate((R) => ({
		found: [...document.querySelectorAll(`${R} .nimble-inline-found .nimble-inline-name`)].map(e => e.textContent),
		bundled: document.querySelectorAll(`${R} .nimble-inline-found.is-bundled`).length,
		missing: [...document.querySelectorAll(`${R} .nimble-inline-unresolved`)].map(e => e.dataset.nimbleRef),
	}), R);
	// The vault's Goblin note wins over the bundled Goblin.
	assert.deepEqual(r.found, ['Goblin', 'Goblin Boss', 'Young Dragon', 'Goblin']);
	assert.equal(r.bundled, 0);
	assert.deepEqual(r.missing, ['Mire Owlbear']);
	assert.equal(await o.eval((app, plugin) => plugin.index.get('Goblin').filePath), 'Bestiary/Goblin.md');
});

test('bundled reference: Krogg resolves, previews with an action bar, and goes away with the bestiary setting', async (o) => {
	await resetEncounter(o);
	await o.openFile('Goblin Court.md');
	await parkMouse(o);
	const krogg = o.page.locator(`${R} .nimble-inline-found.is-bundled`, { hasText: 'Krogg, Goblin King' });
	await krogg.waitFor({ timeout: 5000 });
	await krogg.locator('.nimble-inline-name').hover();
	await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
	const p = await o.page.evaluate((P) => {
		const el = document.querySelector(P);
		return {
			name: el.querySelector('.monster-name')?.textContent,
			kicker: el.querySelector('.monster-kicker')?.textContent,
			actions: [...el.querySelectorAll('.statblock-actions .statblock-action:not(.statblock-action-more)')].map(b => b.textContent),
			more: el.querySelectorAll('.statblock-actions .statblock-action-more').length,
			source: el.querySelector('.monster-source')?.textContent,
		};
	}, PREVIEW);
	assert.equal(p.name, 'Krogg, Goblin King');
	assert.match(p.kicker, /Lvl 2 · Solo/);
	assert.deepEqual(p.actions, ['Add', 'Bestiary', 'Copy to vault']);
	assert.equal(p.more, 1, 'Add has a menu (Add 2, tougher, weaker)');
	assert.match(p.source, /Monsters & More p\.7/);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-hover-bundled.png') });

	// Add from the preview's action bar.
	await o.page.locator(`${PREVIEW} .statblock-action`, { hasText: 'Add' }).click();
	await o.page.waitForTimeout(200);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Krogg, Goblin King-1']);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(PREVIEW).count(), 0);

	// Turning the bundled bestiary off leaves the reference unresolved.
	try {
		await o.eval((app, plugin) => { plugin.settings.bundledBestiary = false; plugin.loadBundledBestiary(); });
		await o.waitFor(() => o.page.evaluate((R) => [...document.querySelectorAll(`${R} .nimble-inline-unresolved`)].some(e => e.dataset.nimbleRef === 'Krogg, Goblin King'), R),
			{ timeout: 3000, what: 'Krogg to go unresolved' });
	} finally {
		await o.eval((app, plugin) => { plugin.settings.bundledBestiary = true; plugin.loadBundledBestiary(); });
	}
	await o.waitFor(() => o.page.evaluate((R) => !document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 3000, what: 'Krogg to resolve again' });
});

test('live preview: inline references render, raw text returns under the cursor', async (o) => {
	await o.openFile('Adventure.md', 'source');
	await o.page.waitForTimeout(300);
	const count = await o.page.locator(`${S} .cm-content .nimble-inline-ref`).count();
	assert.equal(count, 5);
	// Put the cursor inside the first reference: it should show as raw text.
	await o.eval((app) => {
		const editor = app.workspace.activeEditor.editor;
		const line = 2; // "The party walks into a `nimble:Goblin` patrol..."
		const ch = editor.getLine(line).indexOf('nimble:Goblin') + 3;
		editor.setCursor({ line, ch });
		editor.focus();
	});
	await o.page.waitForTimeout(200);
	assert.equal(await o.page.locator(`${S} .cm-content .nimble-inline-ref`).count(), 4);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-live-preview.png') });
});

test('hover preview shows, then closes on Escape and on note change', async (o) => {
	await o.openFile('Adventure.md');
	await parkMouse(o); // start with the pointer off every reference
	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Young Dragon' }).hover();
	await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
	assert.equal(await o.page.locator(`${PREVIEW} .monster-name`).textContent(), 'Young Dragon');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-hover.png') });
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(PREVIEW).count(), 0);

	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' }).hover();
	await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
	await o.openFile('Bestiary/Goblin.md');
	assert.equal(await o.page.locator(PREVIEW).count(), 0);
});

test('hover preview is interactive: roll dice inside it, it pins, never covers its anchor', async (o) => {
	await resetEncounter(o);
	await o.openFile('Adventure.md');
	await parkMouse(o); // start with the pointer off every reference
	const anchor = o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' });
	await anchor.hover();
	await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
	const rects = await o.page.evaluate(([P, R]) => {
		const a = [...document.querySelectorAll(`${R} .nimble-inline-name`)].find(e => e.textContent === 'Goblin Boss').getBoundingClientRect();
		const p = document.querySelector(P).getBoundingClientRect();
		return { a: { left: a.left, right: a.right, top: a.top, bottom: a.bottom }, p: { left: p.left, right: p.right, top: p.top, bottom: p.bottom } };
	}, [PREVIEW, R]);
	assert.ok(!rectsOverlap(rects.a, rects.p), `preview ${JSON.stringify(rects.p)} covers its anchor ${JSON.stringify(rects.a)}`);
	assert.equal(await o.page.locator(`${PREVIEW}.is-pinned`).count(), 0);

	// Move into the preview and roll the Scimitar damage.
	const dice = o.page.locator(`${PREVIEW} .nimble-dice.is-clickable`, { hasText: '1d6+2' });
	await dice.hover();
	await o.page.waitForTimeout(500); // longer than the hide delay: it must stay open
	assert.equal(await o.page.locator(PREVIEW).count(), 1);
	await dice.click();
	await o.page.waitForTimeout(200);
	const log = await o.eval((app, plugin) => plugin.settings.rollLog);
	assert.equal(log.length, 1);
	assert.equal(log[0].label, 'Goblin Boss: Scimitar');
	assert.equal(await o.page.locator(`${T} .roll-log-entry`).count(), 1);

	// Clicking inside pinned it: moving away no longer closes it.
	assert.equal(await o.page.locator(`${PREVIEW}.is-pinned`).count(), 1);
	assert.equal(await o.page.locator(`${PREVIEW} .hover-preview-hint`).textContent(), 'Pinned');
	await o.page.mouse.move(2, 450);
	await o.page.waitForTimeout(500);
	assert.equal(await o.page.locator(PREVIEW).count(), 1);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(PREVIEW).count(), 0);

	// The ✕ button closes a pinned preview too.
	await anchor.hover();
	await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
	await o.page.locator(`${PREVIEW} .hover-preview-close`).click();
	assert.equal(await o.page.locator(PREVIEW).count(), 0);
});

test('clicking an inline reference opens a quick look; Open page (or Cmd-click) goes to the note', async (o) => {
	await o.openFile('Adventure.md');
	const Q = '.modal.nimble-record-modal';
	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' }).click();
	await o.waitFor(async () => (await o.page.locator(Q).count()) === 1, { what: 'the quick-look modal' });
	assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'Adventure.md', 'no page jump');
	assert.equal(await o.page.locator(`${Q} .record-title`).textContent(), 'Goblin Boss');
	assert.equal(await o.page.locator(`${Q} .nimble-statblock .monster-name`).textContent(), 'Goblin Boss');
	assert.equal(await o.page.locator(PREVIEW).count(), 0);
	await o.page.locator(`${Q} .record-btn`, { hasText: 'Open page' }).click();
	await o.page.waitForTimeout(400);
	assert.equal(await o.page.locator(Q).count(), 0);
	assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'Bestiary/Goblin Boss.md');
	await o.openFile('Adventure.md');
	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' }).click({ modifiers: ['Meta'] });
	await o.page.waitForTimeout(400);
	assert.equal(await o.page.locator(Q).count(), 0, 'Cmd-click skips the quick look');
	await o.eval((app) => { app.workspace.getLeavesOfType('markdown').slice(1).forEach(l => l.detach()); });
});

test('index updates live: new, renamed and deleted monsters', async (o) => {
	await o.openFile('Adventure.md');
	await o.eval((app) => app.vault.create('Bestiary/Mire Owlbear.md', '```nimble\nname: Mire Owlbear\nhp: 30\n```\n'));
	await o.waitFor(() => o.page.evaluate((R) => !document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 5000, what: 'Mire Owlbear to resolve' });
	await o.eval((app) => app.fileManager.renameFile(app.vault.getAbstractFileByPath('Bestiary/Mire Owlbear.md'), 'Bestiary/Mire Owlbear (Swamp).md'));
	await o.waitFor(() => o.eval((app, plugin) => plugin.index.get('Mire Owlbear')?.filePath === 'Bestiary/Mire Owlbear (Swamp).md'), { timeout: 5000, what: 'rename to be indexed' });
	await o.eval((app) => app.vault.delete(app.vault.getAbstractFileByPath('Bestiary/Mire Owlbear (Swamp).md')));
	await o.waitFor(() => o.page.evaluate((R) => !!document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 5000, what: 'Mire Owlbear to go unresolved' });
});

test('autocomplete inserts a monster reference', async (o) => {
	await o.eval(async (app) => {
		const f = await app.vault.create('Scratch.md', 'Meet the \n');
		await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'source' } });
		const editor = app.workspace.activeEditor.editor;
		editor.setCursor({ line: 0, ch: 9 });
		editor.focus();
	});
	await o.page.keyboard.type('`nimble:boss', { delay: 30 });
	// The list updates per keystroke; wait for it to reflect the full query.
	// Substring matches rank above fuzzy matches from the bundled bestiary.
	await o.waitFor(() => o.page.evaluate(() => {
		const names = [...document.querySelectorAll('.suggestion-container .nimble-suggestion-name')].map(e => e.textContent);
		return names[0] === 'Goblin Boss';
	}), { timeout: 3000, what: '"Goblin Boss" to be the top suggestion' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), 'Meet the `nimble:Goblin Boss`');

	// Bundled monsters are suggested too, labelled with their book.
	await o.eval((app) => {
		const editor = app.workspace.activeEditor.editor;
		editor.setValue('Bow before \n');
		editor.setCursor({ line: 0, ch: 11 });
		editor.focus();
	});
	await o.page.keyboard.type('`nimble:krogg', { delay: 30 });
	await o.waitFor(() => o.page.evaluate(() => {
		const first = document.querySelector('.suggestion-container .nimble-suggestion');
		return first?.querySelector('.nimble-suggestion-name')?.textContent === 'Krogg, Goblin King'
			&& /Monsters & More/.test(first.querySelector('.nimble-suggestion-note')?.textContent || '');
	}), { timeout: 3000, what: 'Krogg to be suggested from the bundled bestiary' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), 'Bow before `nimble:Krogg, Goblin King`');
});

// ---------------------------------------------------------------------------
// Bestiary

test('bestiary: search, role filter, add to the tracker', async (o) => {
	await resetEncounter(o);
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:open-bestiary'));
	const B = '.nimble-bestiary';
	await o.page.waitForSelector(`${B} .bestiary-row`, { timeout: 5000 });
	const total = Number((await o.page.locator(`${B} .bestiary-count`).textContent()).match(/^(\d+) monsters$/)?.[1]);
	assert.ok(total >= 525, `count shows every monster (${total})`);
	// The detail pane shows a stat block with an action bar.
	assert.ok(await o.page.locator(`${B} .bestiary-detail .nimble-statblock .statblock-actions`).count());

	await o.page.locator(`${B} .bestiary-search-input`).fill('krogg');
	await o.waitFor(() => o.page.evaluate((B) => document.querySelectorAll(`${B} .bestiary-row`).length === 2, B), { timeout: 3000, what: 'search to narrow to the two Kroggs' });
	assert.deepEqual(await o.page.locator(`${B} .bestiary-row-name`).allTextContents(), ['Krogg, Goblin King', 'Krogg, Goblin King (GM Guide)']);
	assert.match(await o.page.locator(`${B} .bestiary-count`).textContent(), /^2 of \d+ monsters$/);
	assert.equal(await o.page.locator(`${B} .bestiary-detail .monster-name`).textContent(), 'Krogg, Goblin King');

	await o.page.locator(`${B} .bestiary-search-input`).fill('');
	await o.page.locator(`${B} .nimble-segmented[aria-label="Role"] button`, { hasText: 'Legendary' }).click();
	await o.page.waitForTimeout(200);
	const legendary = await o.page.evaluate((B) => {
		const rows = [...document.querySelectorAll(`${B} .bestiary-row`)];
		return { n: rows.length, allLegendary: rows.every(r => r.classList.contains('role-legendary')), count: document.querySelector(`${B} .bestiary-count`).textContent };
	}, B);
	assert.ok(legendary.n > 10 && legendary.n < total, `legendary filter shows ${legendary.n}`);
	assert.ok(legendary.allLegendary);
	assert.equal(legendary.count, `${legendary.n} of ${total} monsters`);
	assert.equal(await o.page.locator(`${B} .nimble-segmented[aria-label="Role"] button.is-active`).textContent(), 'Legendary');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-bestiary.png') });

	// Add straight from a row, and two from the detail pane.
	await o.page.locator(`${B} .bestiary-row`).filter({ has: o.page.locator('.bestiary-row-name', { hasText: exact('Krogg, Goblin King') }) }).locator('.bestiary-row-add').click();
	await o.page.locator(`${B} .nimble-segmented[aria-label="Role"] button`, { hasText: 'Minion' }).click();
	await o.page.locator(`${B} .bestiary-search-input`).fill('goblin minion');
	await o.waitFor(() => o.page.evaluate((B) => document.querySelector(`${B} .bestiary-detail .monster-name`)?.textContent === 'Goblin Minion', B), { timeout: 3000, what: 'Goblin Minion in the detail pane' });
	await o.page.locator(`${B} .bestiary-detail .statblock-action`, { hasText: '+2' }).click();
	await o.page.waitForTimeout(200);
	const list = await creatures(o);
	assert.deepEqual(list.map(c => [c.label, c.count]), [['Krogg, Goblin King-1', undefined], ['Goblin Minion', 2]]);
	assert.equal(list[0].max, 90);
	assert.equal(await card(o, 'Krogg, Goblin King-1').count(), 1);

	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));
});

// ---------------------------------------------------------------------------
// Encounter tracker

test('add to encounter: button, shift-click, inline +, unique labels', async (o) => {
	await resetEncounter(o);
	await o.openFile('Bestiary/Goblin.md');
	await o.page.click(`${R} .add-btn`);
	await o.page.click(`${R} .add-btn`, { modifiers: ['Shift'] });
	await o.openFile('Adventure.md');
	await o.page.locator(`${R} .nimble-inline-found`, { hasText: 'Goblin Boss' }).locator('.nimble-inline-add-btn').click();
	let list = await creatures(o);
	assert.deepEqual(list.map(c => c.label), ['Goblin-1', 'Goblin-2', 'Goblin-3', 'Goblin Boss-1']);

	await creatureMenu(o, 'Goblin-1', 'Remove');
	await o.openFile('Bestiary/Goblin.md');
	await o.page.click(`${R} .add-btn`);
	list = await creatures(o);
	assert.deepEqual(list.map(c => c.label), ['Goblin-2', 'Goblin-3', 'Goblin Boss-1', 'Goblin-4']);
	assert.equal(await o.page.locator(`${T} .creature-item`).count(), 4);
	assert.deepEqual(await o.page.locator(`${T} .side-header > span:first-child`).allTextContents(), ['Monsters']);
	assert.equal(await o.page.locator(`${T} .side-header .side-count`).textContent(), '0/4 gone');
	assert.deepEqual(await o.page.locator(`${T} .creature-label`).allTextContents(), ['Goblin-2', 'Goblin-3', 'Goblin Boss-1', 'Goblin-4']);
	assert.equal(await card(o, 'Goblin Boss-1').locator('.hp-display').textContent(), '36/36');
	assert.match(await card(o, 'Goblin Boss-1').locator('.creature-meta').textContent(), /Lvl 2.*Medium/);
	assert.equal(await card(o, 'Goblin Boss-1').locator('.armor-chip.armor-medium').count(), 1, 'armor shows as a badge');
});

test('add-monster search adds from anywhere', async (o) => {
	await resetEncounter(o);
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:add-monster'));
	await o.page.waitForSelector('.prompt-input');
	await o.page.keyboard.type('young dragon');
	await o.waitFor(() => o.page.evaluate(() => document.querySelector('.prompt .suggestion-item.is-selected .nimble-add-name')?.textContent === 'Young Dragon'),
		{ timeout: 3000, what: 'Young Dragon to be the selected suggestion' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Young Dragon-1']);
});

test('add monster dialog: "3 goblin minion" makes one minion group', async (o) => {
	await resetEncounter(o);
	const M = '.nimble-add-monster-modal';
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector(`${M} input`, { timeout: 3000 });
	await o.page.keyboard.type('3 goblin minion');
	await o.waitFor(() => o.page.evaluate((M) => document.querySelector(`${M} .suggestion-item.is-selected .nimble-add-name`)?.textContent === 'Goblin Minion', M),
		{ timeout: 3000, what: 'Goblin Minion as the first result' });
	assert.match(await o.page.locator(`${M} .suggestion-item.is-selected .nimble-add-meta`).textContent(), /Minion/);
	assert.equal(await o.page.locator(`${M} .suggestion-item.is-selected .nimble-add-n`).textContent(), '3', 'the row quantity starts at the typed count');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	const [group] = await creatures(o);
	assert.equal(group.label, 'Goblin Minion');
	assert.equal(group.count, 3);
	assert.equal(group.alive, 3);
	const row = card(o, 'Goblin Minion');
	assert.equal(await row.locator('.minion-pip').count(), 3);
	assert.equal(await row.locator('.minion-pip.is-on').count(), 3);
	assert.equal(await row.locator('.hp-display').textContent(), '3/3');
	assert.match(await row.locator('.group-attack').textContent(), /Group attack ×3/);
	assert.equal(await o.page.locator(M).count(), 0, 'the dialog closes after adding');

	// Unknown names say so.
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector(`${M} input`, { timeout: 3000 });
	await o.page.keyboard.type('zzz nobody');
	await o.waitFor(async () => /No matching monsters/.test(await o.page.locator(`${M} .suggestion-empty`).textContent().catch(() => '')), { what: 'the empty state' });

	// Row buttons: pick a quantity, Add, and the dialog stays open for the next monster.
	await o.page.keyboard.press('Meta+A');
	await o.page.keyboard.type('goblin boss');
	const rowEl = o.page.locator(`${M} .suggestion-item`).filter({ has: o.page.locator('.nimble-add-name > span:first-child', { hasText: exact('Goblin Boss') }) }).first();
	await rowEl.hover();
	await rowEl.locator('.nimble-add-step[aria-label="One more"]').click();
	await rowEl.locator('.nimble-add-btn').click();
	await o.waitFor(async () => /2 in fight/.test(await rowEl.locator('.nimble-add-here').textContent()), { what: 'the in-fight badge' });
	assert.equal(await o.page.locator(M).count(), 1, 'still open after adding from a row');
	assert.equal((await creatures(o)).filter(c => c.label.startsWith('Goblin Boss')).length, 2);
	await o.page.keyboard.press('Escape');

	// The group attack rolls one die per minion into the roll log.
	await row.locator('.group-attack').click();
	await o.page.waitForTimeout(150);
	const roll = (await o.eval((app, plugin) => plugin.settings.rollLog))[0];
	assert.equal(roll.label, '3 Goblin Minions attack together');
	assert.equal(roll.expression, '3d6');
});

test('turn flow: party, Start combat, heroes then monsters, Next round', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.page.locator(`${T} .quick-add-party`).click();
	await o.page.waitForTimeout(100);
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector('.nimble-add-monster-modal input', { timeout: 3000 });
	await o.page.keyboard.type('3 goblin minion');
	await o.waitFor(() => o.page.evaluate(() => !!document.querySelector('.nimble-add-monster-modal .suggestion-item.is-selected')), { timeout: 3000, what: 'add monster results' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(150);
	assert.deepEqual((await creatures(o)).map(c => [c.label, c.side]), [['Aria', 'hero'], ['Bram', 'hero'], ['Goblin Minion', 'monster']]);
	assert.deepEqual(await o.page.locator(`${T} .side-header > span:first-child`).allTextContents(), ['Heroes', 'Monsters']);
	assert.equal(await o.page.locator(`${T} .quick-add-party`).count(), 0, 'Party button hides once heroes are in');
	assert.equal((await encounter(o)).phase, 'setup');

	const action = o.page.locator(`${T} .round-action`);
	assert.equal(await action.textContent(), 'Start combat');
	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [1, 'heroes']);
	assert.equal(await o.page.locator(`${T} .phase-pill.is-active .phase-pill-text`).textContent(), "Heroes' turn");
	assert.equal(await action.textContent(), 'Next round');
	assert.ok(await card(o, 'Goblin Minion').evaluate(el => el.classList.contains('is-waiting')));

	await card(o, 'Aria').locator('.turn-toggle').click();
	assert.equal((await encounter(o)).phase, 'heroes');
	assert.equal(await card(o, 'Aria').locator('.turn-toggle').getAttribute('aria-pressed'), 'true');
	assert.match(await o.page.locator(`${T} .side-header`).first().textContent(), /1\/2 gone/);
	await card(o, 'Bram').locator('.turn-toggle').click();
	assert.equal((await encounter(o)).phase, 'monsters');
	assert.equal(await o.page.locator(`${T} .phase-pill.is-active .phase-pill-text`).textContent(), "Monsters' turn");
	assert.ok(await card(o, 'Aria').evaluate(el => el.classList.contains('is-done')));
	await card(o, 'Goblin Minion').locator('.turn-toggle').click();
	assert.equal(await o.page.locator(`${T} .turn-toggle.is-done`).count(), 3);

	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [2, 'heroes']);
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 2');
	assert.ok((await creatures(o)).every(c => !c.done));
	assert.equal(await o.page.locator(`${T} .turn-toggle.is-done`).count(), 0);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-turns.png') });

	// The phase pills switch sides by hand.
	await o.page.locator(`${T} .phase-pill.phase-monsters`).click();
	assert.equal((await encounter(o)).phase, 'monsters');
});

test('tracker controls: calculator modes, quick look from the tracker, End and save', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.eval(async (app, plugin) => {
		plugin.settings.dice3d = false;
		const id = plugin.encounters.ensureActive().id;
		plugin.encounters.addParty(id);
		await plugin.addToEncounter(plugin.index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md', 1);
		await plugin.addToEncounter(plugin.index.get('Krogg, Goblin King').monster, undefined, 1);
	});
	await o.page.waitForTimeout(300);
	const action = o.page.locator(`${T} .round-action`);
	assert.equal(await action.textContent(), 'Start combat');
	assert.equal(await o.page.locator(`${T} .tracker-end, ${T} .turn-segmented`).count(), 0, 'no End or turn control before combat');

	// Calculator by tapping: starts on Damage, switch to Heal, preview, apply.
	await typeHp(o, 'Aria', '6');
	await card(o, 'Aria').locator('.hp-display').click();
	const pad = o.page.locator('.nimble-hp-pad');
	assert.equal(await pad.locator('.hp-pad-mode.is-active').textContent(), 'Damage');
	await pad.locator('.hp-pad-mode', { hasText: 'Heal' }).click();
	for (const k of ['3']) await pad.locator('.hp-pad-keys button', { hasText: exact(k) }).click();
	assert.match(await pad.locator('.hp-pad-preview').textContent(), /→ 7\/10/);
	assert.equal(await pad.locator('.hp-pad-apply').textContent(), 'Heal 3');
	await pad.locator('.hp-pad-apply').click();
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 7);
	assert.equal(await o.page.locator('.nimble-hp-pad').count(), 0, 'closes after applying');

	// Crit toggle on a monster with armor shows the working.
	const boss = (await creatures(o)).find(c => c.label.startsWith('Goblin Boss'));
	await card(o, boss.label).locator('.hp-display').click();
	await o.page.keyboard.type('8');
	await pad.locator('.hp-pad-crit').click();
	assert.match(await pad.locator('.hp-pad-preview').textContent(), /crit ignores armor/);
	await o.page.keyboard.press('Escape');

	// Start, then the legendary card after a hero's turn: pick one, it rolls and logs.
	await action.click();
	assert.equal(await action.textContent(), 'Next round');
	assert.equal(await o.page.locator(`${T} .turn-segmented .phase-pill`).count(), 2);
	assert.match(await o.page.locator(`${T} .phase-pill.phase-heroes .phase-pill-count`).textContent(), /0\/2/);
	await card(o, 'Aria').locator('.turn-toggle').click();
	assert.equal(await o.page.locator(`${T} .tracker-prompt`).count(), 0, 'no legendary helper card any more');

	// Clicking a combatant opens their sheet over the tracker, with the fight's state.
	const Q = '.modal.nimble-record-modal';
	const krogg = (await creatures(o)).find(c => c.label.startsWith('Krogg'));
	await card(o, krogg.label).locator('.creature-label').click();
	await o.waitFor(async () => (await o.page.locator(Q).count()) === 1, { what: 'the quick look' });
	assert.equal(await o.page.locator(`${Q} .nimble-statblock .monster-name`).textContent(), 'Krogg, Goblin King');
	assert.match(await o.page.locator(`${Q} .record-sub`).textContent(), /Legendary|Solo/);
	assert.equal(await o.page.locator(`${Q} .record-btn`, { hasText: 'Open in bestiary' }).count(), 1);
	await o.page.locator(`${Q} .record-hp-btn`).click();
	await o.page.keyboard.type('10');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.equal((await creatures(o)).find(c => c.label === krogg.label).hp, krogg.hp - 10, 'HP from the modal');
	assert.match(await o.page.locator(`${Q} .record-hp-btn`).textContent(), new RegExp(`^${krogg.hp - 10}/`), 'the strip stays live');
	await o.page.locator(`${Q} .record-turn`).click();
	assert.equal((await creatures(o)).find(c => c.label === krogg.label).done, true);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(Q).count(), 0);

	// A hero's quick look shows actions and Wounds.
	await card(o, 'Bram').locator('.creature-label').click();
	await o.waitFor(async () => (await o.page.locator(`${Q} .record-pip-group.is-wounds`).count()) === 1, { what: 'hero pips' });
	await o.page.locator(`${Q} .is-wounds .record-pip`).first().click();
	assert.equal((await creatures(o)).find(c => c.label === 'Bram').wounds, 1);
	await o.page.keyboard.press('Escape');

	// End combat: no callout, just Resume / New fight. HP is kept.
	await o.page.locator(`${T} .tracker-end`).click();
	await o.page.waitForTimeout(150);
	assert.equal((await encounter(o)).phase, 'setup');
	assert.equal(await o.page.locator(`${T} .tracker-prompt`).count(), 0, 'no "combat over" callout');
	assert.equal(await action.textContent(), 'Resume round 1');
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 7);
	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [1, 'heroes'], 'resumes where it stopped');
	await o.page.locator(`${T} .tracker-end`).click();
	await o.page.locator(`${T} .tracker-new-fight`).click();
	assert.equal(await action.textContent(), 'Next round', 'New fight starts round 1');

	// Save the fight to a note; the note resumes it, and the source block offers Resume.
	await o.eval(async (app, plugin) => {
		for (const f of ['Fights/Saved fight test.md', 'Saved fight test.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		await app.vault.create('Saved fight test.md', '```nimble-encounter\nname: Current Encounter\nmonsters:\n- 1 Goblin\n```\n');
		plugin.encounters.active.sourcePath = 'Saved fight test.md';
	});
	await o.page.locator(`${T} .tracker-save`).click();
	await o.waitFor(() => o.eval((app) => !!app.vault.getAbstractFileByPath('Fights/Saved fight test - Current Encounter.md')), { what: 'the fight note' });
	const note = await o.eval((app) => app.vault.adapter.read('Fights/Saved fight test - Current Encounter.md'));
	assert.match(note, /nimble: combat/);
	assert.match(note, /\| Aria \| 7\/10 \|/, 'the digest lists everyone');
	await typeHp(o, 'Aria', '5');
	await o.openFile('Saved fight test.md', 'preview');
	await o.eval((app, plugin) => plugin.rerenderNotes());
	const resume = o.page.locator(`${R} .encounter-resume`);
	await o.waitFor(async () => (await resume.count()) === 1, { what: 'Resume on the encounter block' });
	await resume.click();
	await o.page.waitForTimeout(300);
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 7, 'restored from the save');
	await o.openFile('Fights/Saved fight test - Current Encounter.md', 'preview');
	assert.equal(await o.page.locator(`${R} .nimble-fight-card .nimble-fight-resume`).count(), 1, 'the note renders a Resume card');
});

test('typed damage, healing and set; invalid input is flagged', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster, 'Bestiary/Goblin.md'));
	const row = card(o, 'Goblin-1');
	await typeHp(o, 'Goblin-1', '5');
	assert.equal((await creatures(o))[0].hp, 7);
	await typeHp(o, 'Goblin-1', '+3');
	assert.equal((await creatures(o))[0].hp, 10);
	await typeHp(o, 'Goblin-1', '=2');
	assert.equal((await creatures(o))[0].hp, 2);
	assert.ok(await row.evaluate(el => el.classList.contains('hp-critical')));
	assert.equal(await row.locator('.hp-display').textContent(), '2/12');
	// The calculator ignores keys it doesn't know, won't apply nothing, and Escape closes it.
	await row.locator('.hp-display').click();
	await o.page.keyboard.type('lots');
	await o.page.keyboard.press('Enter');
	assert.equal(await o.page.locator('.nimble-hp-pad').count(), 1, 'nothing to apply: the calculator stays open');
	assert.equal((await creatures(o))[0].hp, 2);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator('.nimble-hp-pad').count(), 0);
	assert.equal(await row.locator('.hp-display').textContent(), '2/12', 'the HP button never changes size or swaps out');

	// Down at 0 HP, and back up.
	await typeHp(o, 'Goblin-1', '5');
	assert.equal((await creatures(o))[0].hp, 0);
	assert.ok(await row.evaluate(el => el.classList.contains('is-down')));
	assert.match(await row.locator('.conditions-row').textContent(), /Defeated/);
	await typeHp(o, 'Goblin-1', '+5');
	assert.equal((await creatures(o))[0].hp, 5);
});

test('damage rules: armor, crits, minions and hero Wounds', async (o) => {
	await resetEncounter(o, { party: PARTY.slice(0, 1) });
	await o.eval((app, plugin) => {
		plugin.encounters.addParty();
		plugin.addToEncounter(plugin.index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md');
		plugin.addToEncounter(plugin.index.get('Goblin Minion').monster, undefined, 3);
	});
	await o.page.waitForTimeout(150);

	// Medium armor takes 10 off a normal hit, with the working shown.
	await typeHp(o, 'Goblin Boss-1', '15');
	let boss = (await creatures(o)).find(c => c.label === 'Goblin Boss-1');
	assert.equal(boss.hp, 31);
	assert.equal(await card(o, 'Goblin Boss-1').locator('.creature-flash').textContent(), '15 − 10 (Medium armor) = 5');
	assert.equal(await card(o, 'Goblin Boss-1').locator('.hp-display').textContent(), '31/36');
	// A crit ignores armor.
	await typeHp(o, 'Goblin Boss-1', '15!');
	boss = (await creatures(o)).find(c => c.label === 'Goblin Boss-1');
	assert.equal(boss.hp, 16);
	assert.equal(await card(o, 'Goblin Boss-1').locator('.creature-flash').textContent(), '15 (crit ignores armor) = 15');
	// A hit smaller than the armor does nothing.
	await typeHp(o, 'Goblin Boss-1', '8');
	assert.equal((await creatures(o)).find(c => c.label === 'Goblin Boss-1').hp, 16);
	// Vulnerable adds 10 on top.
	await typeHp(o, 'Goblin Boss-1', '10v');
	assert.equal((await creatures(o)).find(c => c.label === 'Goblin Boss-1').hp, 6);

	// Any hit drops one minion.
	await typeHp(o, 'Goblin Minion', '5');
	let minions = (await creatures(o)).find(c => c.label === 'Goblin Minion');
	assert.equal(minions.alive, 2);
	assert.equal(await card(o, 'Goblin Minion').locator('.minion-pip.is-on').count(), 2);
	assert.equal(await card(o, 'Goblin Minion').locator('.hp-display').textContent(), '2/3');
	// Clicking a pip drops one too, and a lit-off pip brings one back.
	await card(o, 'Goblin Minion').locator('.minion-pip.is-on').first().click();
	assert.equal((await creatures(o)).find(c => c.label === 'Goblin Minion').alive, 1);
	await card(o, 'Goblin Minion').locator('.minion-pip:not(.is-on)').first().click();
	assert.equal((await creatures(o)).find(c => c.label === 'Goblin Minion').alive, 2);
	// Overkill: 12 damage against d6 minions drops two.
	await typeHp(o, 'Goblin Minion', '12');
	minions = (await creatures(o)).find(c => c.label === 'Goblin Minion');
	assert.equal(minions.alive, 0);
	assert.ok(await card(o, 'Goblin Minion').evaluate(el => el.classList.contains('is-down')));

	// A hero hit to 0 is Dying with a Wound.
	await typeHp(o, 'Aria', '12');
	let aria = (await creatures(o)).find(c => c.label === 'Aria');
	assert.equal(aria.hp, 0);
	assert.equal(aria.wounds, 1);
	assert.equal(await card(o, 'Aria').locator('.wound-pip.is-on').count(), 1);
	assert.equal(await card(o, 'Aria').locator('.wound-pip').count(), 6);
	assert.match(await card(o, 'Aria').locator('.conditions-row').textContent(), /Dying/);
	// Hit again while Dying: two more Wounds (three on a crit).
	await typeHp(o, 'Aria', '3');
	aria = (await creatures(o)).find(c => c.label === 'Aria');
	assert.equal(aria.wounds, 3);
	assert.equal(await card(o, 'Aria').locator('.wound-pip.is-on').count(), 3);
	// Healing ends Dying.
	await typeHp(o, 'Aria', '+4');
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 4);
	assert.doesNotMatch(await card(o, 'Aria').locator('.conditions-row').textContent(), /Dying/);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-damage.png') });
});

test('conditions: add from picker, Escape closes it, remove with ×', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	const row = card(o, 'Goblin-1');
	await row.locator('.add-condition-btn').click();
	await o.page.locator('.condition-picker .condition-option', { hasText: exact('Prone') }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Prone' }]);
	assert.equal(await o.page.locator('.condition-picker').count(), 0);
	await row.locator('.add-condition-btn').click();
	assert.equal(await o.page.locator('.condition-picker').count(), 1);
	assert.equal(await o.page.locator('.condition-picker .condition-option.is-applied', { hasText: exact('Prone') }).count(), 1);
	// The search box has focus, and typing filters the list.
	await o.waitFor(() => o.page.evaluate(() => document.activeElement?.classList.contains('condition-search')), { timeout: 2000, what: 'condition search to take focus' });
	await o.page.keyboard.type('fri');
	assert.deepEqual(await o.page.locator('.condition-picker .condition-option').allTextContents(), ['Frightened']);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator('.condition-picker').count(), 0);
	await row.locator('.condition-tag', { hasText: 'Prone' }).locator('.remove-condition').click();
	assert.deepEqual((await creatures(o))[0].conditions, []);
});

test('conditions: durations count down at end of turn, X values, chip editor', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	const row = card(o, 'Goblin-1');

	// Dazed for 1 round.
	await row.locator('.add-condition-btn').click();
	await o.page.locator('.condition-picker .nimble-segmented button', { hasText: '1 rd' }).click();
	assert.equal(await o.page.locator('.condition-picker .nimble-segmented button.is-active').textContent(), '1 rd');
	await o.page.locator('.condition-picker .condition-option', { hasText: exact('Dazed') }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Dazed', rounds: 1 }]);
	const dazed = row.locator('.condition-tag', { hasText: 'Dazed' });
	assert.equal(await dazed.locator('.condition-rounds').textContent(), '1');
	// Ending the goblin's turn wears it off.
	await row.locator('.turn-toggle').click();
	assert.deepEqual((await creatures(o))[0].conditions, []);
	assert.equal(await row.locator('.condition-tag:not(.auto-condition)').count(), 0);
	assert.ok((await notices(o)).some(n => /Goblin-1: Dazed wore off/.test(n)));

	// Empowered asks for X.
	await row.locator('.add-condition-btn').click();
	await o.page.locator('.condition-picker .condition-option', { hasText: exact('Empowered') }).click();
	assert.equal(await o.page.locator('.condition-picker .condition-value-row').isVisible(), true);
	assert.match(await o.page.locator('.condition-picker .condition-value-row').textContent(), /Empowered X =/);
	assert.deepEqual((await creatures(o))[0].conditions, []);
	await o.page.locator('.condition-picker .condition-value-row button', { hasText: exact('2') }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Empowered', value: 2 }]);
	const empowered = row.locator('.condition-tag', { hasText: 'Empowered' });
	assert.match(await empowered.textContent(), /^Empowered 2/);

	// Clicking a chip opens its editor: change the duration and X.
	await empowered.click();
	const editor = o.page.locator('.nimble-popover.condition-editor');
	await editor.waitFor({ timeout: 2000 });
	assert.equal(await editor.locator('.popover-title').textContent(), 'Empowered 2');
	await editor.locator('button', { hasText: '3 rds' }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Empowered', value: 2, rounds: 3 }]);
	await row.locator('.condition-tag', { hasText: 'Empowered' }).click();
	await o.page.locator('.nimble-popover.condition-editor button', { hasText: exact('4') }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Empowered', value: 4, rounds: 3 }]);
	assert.equal(await row.locator('.condition-tag', { hasText: 'Empowered' }).locator('.condition-rounds').textContent(), '3');

	// × removes it.
	await row.locator('.condition-tag', { hasText: 'Empowered' }).locator('.remove-condition').click();
	assert.deepEqual((await creatures(o))[0].conditions, []);
	assert.equal(await o.page.locator('.nimble-popover').count(), 0);
});

test('legendary: Bloodied and Last Stand prompts, acts after each hero', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.eval((app, plugin) => {
		plugin.encounters.addParty();
		plugin.addToEncounter(plugin.index.get('Krogg, Goblin King').monster);
	});
	await o.page.waitForTimeout(150);
	const label = 'Krogg, Goblin King-1';
	const row = card(o, label);
	assert.equal(await row.locator('.hp-display').textContent(), '90/90');
	assert.match(await row.locator('.legendary-line').textContent(), /Bloodied at 45/);

	// Past half: a Bloodied prompt with the monster's Bloodied text.
	await typeHp(o, label, '50');
	const bloodied = o.page.locator(`${T} .tracker-prompt.prompt-bloodied`);
	assert.equal(await bloodied.locator('.prompt-title').textContent(), `${label} is Bloodied`);
	assert.match(await bloodied.locator('.prompt-text').textContent(), /damage increases to 2d8\+2/);
	assert.equal(await bloodied.locator('.nimble-dice').count(), 1);
	assert.equal(await row.locator('.legendary-line .phase-chip.is-on').textContent(), 'Bloodied');
	assert.equal(await notices(o).then(n => n.filter(t => /Bloodied/.test(t)).length), 0, 'Bloodied is a tracker prompt, not a Notice');

	// To 0: Last Stand prompt; Apply gives the final damage pool and Medium armor.
	await typeHp(o, label, '40');
	const last = o.page.locator(`${T} .tracker-prompt.prompt-laststand`);
	assert.equal(await last.locator('.prompt-title').textContent(), `${label}: Last Stand!`);
	assert.match(await last.locator('.prompt-text').textContent(), /20 more damage he dies/);
	assert.equal(await row.locator('.laststand-btn').count(), 1);
	// Not defeated yet: he's waiting on his Last Stand.
	assert.match(await row.locator('.conditions-row').textContent(), /Last Stand ready/);
	assert.ok(!(await row.evaluate(el => el.classList.contains('is-down'))));
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-solo.png') });
	await last.locator('.prompt-action', { hasText: 'Apply: 20 more damage to finish' }).click();
	let krogg = (await creatures(o)).find(c => c.label === label);
	assert.equal(krogg.hp, 20);
	assert.equal(krogg.armor, 'medium');
	assert.equal(krogg.lastStand, true);
	assert.equal(await last.count(), 0);
	assert.equal(await row.locator('.laststand-btn').count(), 0);
	assert.equal(await row.locator('.phase-chip.laststand.is-on').textContent(), 'Last Stand');
	assert.match(await row.locator('.creature-meta .armor-chip').textContent(), /Medium/);
	// His new armor applies.
	await typeHp(o, label, '15');
	krogg = (await creatures(o)).find(c => c.label === label);
	assert.equal(krogg.hp, 15);

});

test('rename, round counter, clear all', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await creatureMenu(o, 'Goblin-1', 'Rename');
	await o.page.locator(`${T} .label-edit-input`).waitFor({ timeout: 2000 });
	await o.page.keyboard.press('Meta+A');
	await o.page.keyboard.type('Sneaky Pete');
	await o.page.keyboard.press('Enter');
	assert.equal((await creatures(o))[0].label, 'Sneaky Pete');

	assert.equal(await o.page.locator(`${T} .round-label`).count(), 0, 'no round counter until combat starts');
	await o.page.locator(`${T} .round-action`).click();
	const up = o.page.locator(`${T} .round-btn[aria-label="Round up"]`);
	await up.click();
	await up.click();
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 3');
	await o.page.locator(`${T} .round-btn[aria-label="Previous round"]`).click();
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 2');
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:next-round'));
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 3');

	// Encounter options menu → Clear encounter → confirm in the dialog.
	await o.page.locator(`${T} .encounter-header [aria-label="Encounter options"]`).click();
	await o.page.locator('.menu .menu-item', { hasText: 'Clear encounter' }).click();
	await o.page.locator('.modal-container button', { hasText: exact('Clear') }).click();
	await o.page.waitForTimeout(150);
	assert.equal((await creatures(o)).length, 0);
	assert.equal(await o.page.locator(`${T} .round-label`).count(), 0, 'back to setup');
	assert.equal(await o.page.locator(`${T} .round-action`).textContent(), 'Start combat');
});

test('creature menu: view stat block, duplicate, add note', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md'));
	await creatureMenu(o, 'Goblin Boss-1', 'View stat block');
	const Q = '.modal.nimble-record-modal';
	assert.equal(await o.page.locator(`${Q} .record-title`).textContent(), 'Goblin Boss-1');
	assert.equal(await o.page.locator(`${Q} .nimble-statblock .monster-name`).textContent(), 'Goblin Boss');
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(Q).count(), 0);

	await creatureMenu(o, 'Goblin Boss-1', 'Duplicate');
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Goblin Boss-1', 'Goblin Boss-2']);

	// A real Obsidian modal (window.prompt doesn't exist in Electron).
	await creatureMenu(o, 'Goblin Boss-2', 'Add note');
	await o.page.locator('.modal .nimble-note-input').fill('Holds the key');
	await o.page.locator('.modal button', { hasText: 'Save' }).click();
	assert.equal(await card(o, 'Goblin Boss-2').locator('.creature-note').textContent(), 'Holds the key');
});

test('slash commands: /encounter, /monster, /add, /roll', async (o) => {
	await resetEncounter(o);
	await o.eval(async (app) => {
		const old = app.vault.getAbstractFileByPath('Slash.md');
		if (old) await app.vault.delete(old);
		await app.vault.create('Slash.md', '# Prep\n\n');
	});
	await o.openFile('Slash.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
	const type = async (t) => { await o.page.keyboard.type(t, { delay: 15 }); await o.page.waitForTimeout(250); };
	const menu = o.page.locator('.suggestion-container .nimble-slash-item');

	await type('/');
	await o.waitFor(async () => (await menu.count()) > 10, { what: 'the slash menu' });
	await type('enc');
	await o.page.keyboard.press('Enter');
	await type('3 goblin minion, krogg');
	await o.waitFor(async () => /Krogg/.test(await menu.first().textContent()), { what: 'encounter suggestion' });
	assert.match(await menu.first().locator('.nimble-slash-badge').textContent(), /%/);
	await o.page.keyboard.press('Enter');
	await type('Boss: /monster krogg');
	await o.page.keyboard.press('Enter');
	await o.page.keyboard.press('Enter');
	await type('/add 2 bandit');
	await o.page.keyboard.press('Enter');
	await type('/roll 2d6+3');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(300);

	const text = await o.eval((app) => app.workspace.activeEditor.editor.getValue());
	assert.match(text, /```nimble-encounter\nname: New encounter\n(party: true\n)?monsters:\n- 3 Goblin Minion\n- 1 Krogg, Goblin King\n```\nBoss: `nimble:Krogg, Goblin King` /);
	assert.match(text, /🎲 2d6\+3 → \*\*\d+\*\*/);
	assert.doesNotMatch(text, /\/add/);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Bandit-1', 'Bandit-2']);
});

test('boxes: /treasure inserts one, the icon editor restyles and saves; NPCs link', async (o) => {
	await resetEncounter(o);
	await o.eval(async (app) => {
		for (const f of ['Box.md', 'Campaigns/Test/Test.md', 'Campaigns/Test/NPCs/Mara Vell.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		await app.vault.create('Box.md', '# Room\n\n');
	});
	await o.openFile('Box.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
	const menu = o.page.locator('.suggestion-container .nimble-slash-item');
	await o.page.keyboard.type('/treasure', { delay: 15 });
	await o.waitFor(async () => /treasure/i.test((await menu.first().textContent()) || ''), { what: 'the /treasure command' });
	await o.page.keyboard.press('Enter');
	await o.page.keyboard.type('A silver key', { delay: 10 });
	await o.page.waitForTimeout(200);
	let text = await o.eval((app) => app.workspace.activeEditor.editor.getValue());
	assert.match(text, /```box treasure\nA silver key\n```/, 'cursor lands inside the new box');

	// Reading view: restyle through the icon popover, then check the fence line.
	await o.openFile('Box.md', 'preview');
	const box = o.page.locator(`${R} .nimble-box.box-treasure`);
	await o.waitFor(async () => (await box.count()) === 1, { what: 'the treasure box' });
	assert.match(await box.locator('.nimble-box-body').innerText(), /A silver key/);
	await box.locator('.nimble-box-icon').click();
	const pop = o.page.locator('.nimble-box-editor');
	await pop.locator('.bxe-tab', { hasText: 'Look' }).click();
	await pop.locator('[data-color="red"]').click();
	await pop.locator('[data-style="parchment"]').click();
	await pop.locator('.bxe-tab', { hasText: 'Icon' }).click();
	await pop.locator('.bxe-search').fill('crown');
	await pop.locator('[data-icon="crown"]').click();
	assert.match(await box.getAttribute('class'), /box-style-parchment/, 'previews live');
	await o.page.keyboard.press('Escape'); // closing the editor saves
	await o.waitFor(async () => /```box treasure icon=crown color=red style=parchment/.test(await o.eval((app) => app.vault.adapter.read('Box.md'))), { what: 'the fence line to be saved' });

	// NPCs: a link becomes a chip, a plain mention becomes a link (inside the campaign only).
	await o.eval(async (app) => {
		for (const d of ['Campaigns', 'Campaigns/Test', 'Campaigns/Test/NPCs']) if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d);
		await app.vault.create('Campaigns/Test/Test.md', '---\nnimble: campaign\n---\nOur contact [[Mara Vell]] met Captain Mara at the docks. Mara Vell waved.\n');
		await app.vault.create('Campaigns/Test/NPCs/Mara Vell.md', '---\nnimble: npc\nrole: Smuggler\naliases:\n  - Captain Mara\n---\nA smuggler.\n');
	});
	await o.page.waitForTimeout(1200);
	await o.openFile('Campaigns/Test/Test.md', 'preview');
	await o.page.waitForTimeout(600);
	await o.eval((app, plugin) => plugin.rerenderNotes());
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-npc-link`).count()) === 1, { what: 'the NPC chip' });
	const mentions = await o.page.locator(`${R} .nimble-npc-mention`).allInnerTexts();
	assert.deepEqual(mentions, ['Captain Mara', 'Mara Vell']);
	// Clicking an NPC opens their note in the quick look; you stay on the page.
	await o.page.locator(`${R} .nimble-npc-link`).click();
	const Q = '.modal.nimble-record-modal';
	await o.waitFor(async () => (await o.page.locator(Q).count()) === 1, { what: 'the NPC quick look' });
	assert.equal(await o.page.locator(`${Q} .record-title`).textContent(), 'Mara Vell');
	assert.equal(await o.page.locator(`${Q} .record-sub`).textContent(), 'Smuggler');
	assert.match(await o.page.locator(`${Q} .record-note`).innerText(), /A smuggler/);
	assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'Campaigns/Test/Test.md');
	await o.page.keyboard.press('Escape');
	await o.eval(async (app) => { for (const f of ['Box.md', 'Campaigns/Test/NPCs/Mara Vell.md', 'Campaigns/Test/Test.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); } });
	await o.page.waitForTimeout(700); // let the campaign index settle before the next test
});

test('encounter chips: make a monster tougher from its count', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.eval(async (app) => {
		const old = app.vault.getAbstractFileByPath('Shift.md'); if (old) await app.vault.delete(old);
		await app.vault.create('Shift.md', '```nimble-encounter\nname: Pack\nmonsters:\n- 2 Wolf\n```\n');
	});
	await o.openFile('Shift.md', 'preview');
	const block = o.page.locator(`${R} .nimble-encounter-block`);
	await block.waitFor();
	const before = await block.locator('.nimble-difficulty').textContent();
	assert.equal(await block.locator('.encounter-count-n').first().evaluate(e => getComputedStyle(e.closest('.encounter-chip')).width), await block.locator('.encounter-count-n').first().evaluate(e => { e.closest('.encounter-chip').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return getComputedStyle(e.closest('.encounter-chip')).width; }), 'chip keeps its size on hover');
	await block.locator('.encounter-count').first().click();
	await o.page.locator('.encounter-count-editor .ece-shift-btn', { hasText: 'Tougher' }).click();
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => /- 2 Wolf \+1/.test(await o.eval((app) => app.vault.adapter.read('Shift.md'))), { what: 'the shift to be saved' });
	await o.waitFor(async () => (await block.locator('.encounter-shift.is-up').count()) === 1, { what: 'the +1 badge' });
	assert.notEqual(await block.locator('.nimble-difficulty').textContent(), before, 'rating follows the shift');
	await o.eval(async (app) => { const f = app.vault.getAbstractFileByPath('Shift.md'); if (f) await app.vault.delete(f); });
});

test('encounter block: steppers, balance suggestions, party from the block and /party', async (o) => {
	await resetEncounter(o);
	await o.eval(async (app, plugin) => {
		plugin.settings.party = ['A', 'B', 'C', 'D'].map((n, i) => ({ id: 'p' + i, name: n, level: 2, maxHp: 20, maxWounds: 6 }));
		const old = app.vault.getAbstractFileByPath('Balance.md');
		if (old) await app.vault.delete(old);
		await app.vault.create('Balance.md', "```nimble-encounter\nname: Klarg's Cave\nmonsters:\n- Krogg, Goblin King\n- 1 Wolf\n- 3 Goblin Minion\n```\n");
	});
	await o.openFile('Balance.md');
	const block = o.page.locator(`${R} .nimble-encounter-block`);
	const read = () => o.eval((app) => app.vault.adapter.read('Balance.md'));
	assert.match(await block.locator('.nimble-difficulty').textContent(), /Very Deadly · 144%/);

	// Count and name share one vertical centre.
	const centres = await o.page.evaluate((R) => [...document.querySelectorAll(`${R} .encounter-chip`)].map(ch => {
		const a = ch.querySelector('.encounter-count-n').getBoundingClientRect();
		const b = ch.querySelector('.nimble-inline-name').getBoundingClientRect();
		return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
	}), R);
	assert.ok(centres.every(d => d < 1), `misaligned chips: ${centres}`);

	// Count editor: click the Wolf's count, +, close: the block says "2 Wolf".
	const wolf = block.locator('.encounter-chip', { hasText: 'Wolf' });
	await wolf.locator('.encounter-count').click();
	await o.page.locator('.encounter-count-editor [aria-label="One more"]').click();
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => /- 2 Wolf/.test(await read()), { what: 'the count editor to write 2 Wolf' });

	// Balance: the difficulty chip offers small edits; pick one that lands on Hard.
	await o.page.locator(`${R} .nimble-encounter-block .nimble-difficulty`).click();
	const option = o.page.locator('.nimble-popover .balance-option').first();
	await option.waitFor();
	assert.match(await option.textContent(), /Hard/);
	await option.click();
	await o.waitFor(async () => /Hard/.test(await o.page.locator(`${R} .nimble-encounter-block .nimble-difficulty`).textContent()), { what: 'the block to re-rate as Hard' });
	assert.match(await read(), /Krogg, Goblin King/); // the boss stays

	// Party: the "4 heroes, level 2" line opens the party editor; Level up raises everyone.
	await o.page.locator(`${R} .nimble-encounter-block .encounter-party-link`).click();
	await o.page.locator('.modal .nimble-party-table').waitFor();
	await o.page.locator('.modal button', { hasText: 'Level up' }).click();
	assert.deepEqual(await o.eval((app, plugin) => plugin.settings.party.map(h => h.level)), [3, 3, 3, 3]);
	await o.page.keyboard.press('Escape');

	// /party opens it from any note.
	await o.openFile('Balance.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lastLine(), ch: 0 }); ed.focus(); });
	await o.page.keyboard.type('/party', { delay: 20 });
	await o.page.locator('.suggestion-container .nimble-slash-item', { hasText: '/party' }).first().waitFor();
	await o.page.keyboard.press('Enter');
	await o.page.locator('.modal .nimble-party-table').waitFor();
	await o.page.keyboard.press('Escape');
	await o.eval((app, plugin) => { plugin.settings.party = []; });
});

test('multiple encounters: create and switch', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => {
		plugin.settings.multipleEncounters = true;
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.encounters.trigger('changed');
	});
	assert.match(await o.page.locator(`${T} .empty-message`).textContent(), /Create or select an encounter/);
	await o.page.locator(`${T} .encounter-picker [aria-label="New encounter"]`).click();
	assert.equal((await encounter(o)).name, 'Encounter 1');
	// Rename by clicking the title.
	await o.page.locator(`${T} .encounter-title`).click();
	await o.page.keyboard.press('Meta+A');
	await o.page.keyboard.type('Ambush');
	await o.page.keyboard.press('Enter');
	assert.equal((await encounter(o)).name, 'Ambush');
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.page.locator(`${T} .encounter-picker [aria-label="New encounter"]`).click();
	assert.equal((await encounter(o)).name, 'Encounter 2');
	assert.equal((await creatures(o)).length, 0);
	const ambushId = await o.eval((app, plugin) => plugin.settings.encounters.find(e => e.name === 'Ambush').id);
	await o.page.locator(`${T} .encounter-select`).selectOption(ambushId);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Goblin-1']);
	assert.equal(await o.page.locator(`${T} .encounter-title`).textContent(), 'Ambush');
	await resetEncounter(o);
});

test('encounter state is saved to disk', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.eval((app, plugin) => plugin.encounters.addCondition(plugin.encounters.active.id, plugin.encounters.active.creatures[0].id, 'Dazed', { rounds: 2 }));
	await o.page.waitForTimeout(300);
	const saved = await o.eval((app, plugin) => plugin.loadData());
	assert.equal(saved.encounters[0].creatures[0].label, 'Goblin-1');
	assert.deepEqual(saved.encounters[0].creatures[0].conditions, [{ name: 'Dazed', rounds: 2 }]);
});

// ---------------------------------------------------------------------------
// Encounter blocks

test('nimble-encounter block: difficulty chip, Run loads it with the party', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.openFile('Encounters.md');
	await o.eval((app, plugin) => plugin.rerenderNotes());
	const block = o.page.locator(`${R} .nimble-encounter-block`);
	await block.waitFor({ timeout: 5000 });
	assert.equal(await block.locator('.encounter-block-name').textContent(), 'Throne room');
	// Two level-2 heroes: budget 4. Krogg is worth 2×2, four minions 4×1 → 200%.
	assert.equal(await block.locator('.nimble-difficulty').textContent(), 'Very Deadly · 200%');
	assert.ok(await block.locator('.nimble-difficulty.diff-very-deadly').count());
	assert.deepEqual(await block.locator('.encounter-chip').evaluateAll(els => els.map(e => `${e.querySelector('.encounter-count-n').textContent} ${e.querySelector('.nimble-inline-found .nimble-inline-name')?.textContent}`)),
		['1× Krogg, Goblin King', '4× Goblin Minion']);
	assert.match(await block.locator('.encounter-block-meta').textContent(), /2 heroes, level 2/);
	assert.equal(await block.locator('.encounter-block-notes').textContent(), 'Krogg bellows from his throne.');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-encounter-block.png') });

	await block.locator('.encounter-block-actions button', { hasText: 'Run' }).click();
	await o.page.waitForTimeout(300);
	const enc = await encounter(o);
	assert.equal(enc.name, 'Throne room');
	assert.equal(enc.sourcePath, 'Encounters.md');
	assert.deepEqual((await creatures(o)).map(c => [c.label, c.side, c.count]), [
		['Aria', 'hero', undefined], ['Bram', 'hero', undefined], ['Krogg, Goblin King-1', 'monster', undefined], ['Goblin Minion', 'monster', 4],
	]);
	assert.equal(await o.page.locator(`${T} .encounter-title`).textContent(), 'Throne room');
	assert.equal(await o.page.locator(`${T} .creature-item`).count(), 4);

	// "Add to current" appends the monsters to what's already there.
	await block.locator('.encounter-block-actions button', { hasText: 'Add to current' }).click();
	await o.page.waitForTimeout(200);
	const after = await creatures(o);
	assert.deepEqual(after.map(c => c.label), ['Aria', 'Bram', 'Krogg, Goblin King-1', 'Goblin Minion', 'Krogg, Goblin King-2']);
	assert.equal(after.find(c => c.label === 'Goblin Minion').count, 8);
});

test('nimble-encounter block without a party rates against the default party', async (o) => {
	await resetEncounter(o);
	await o.openFile('Encounters.md');
	await o.eval((app, plugin) => plugin.rerenderNotes());
	await o.page.waitForTimeout(300);
	const block = o.page.locator(`${R} .nimble-encounter-block`);
	assert.match(await block.locator('.encounter-block-meta').textContent(), /4 level-1 heroes \(no party set\)/);
	await block.locator('.encounter-block-actions button', { hasText: 'Run' }).click();
	await o.page.waitForTimeout(300);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Krogg, Goblin King-1', 'Goblin Minion']);
});

// ---------------------------------------------------------------------------
// Dice + settings

test('clicking dice rolls them into a notice and the roll log', async (o) => {
	await resetEncounter(o);
	await o.openFile('Bestiary/Goblin Boss.md');
	const dice = o.page.locator(`${R} .nimble-dice.is-clickable`, { hasText: '1d6+2' });
	assert.equal(await dice.count(), 1);
	await dice.click();
	await o.page.waitForTimeout(200);
	const log = await o.eval((app, plugin) => plugin.settings.rollLog);
	assert.equal(log.length, 1);
	assert.equal(log[0].label, 'Goblin Boss: Scimitar');
	assert.equal(log[0].expression, '1d6+2');
	assert.ok(log[0].total >= 3 && log[0].total <= 8 || log[0].outcome, `total ${log[0].total}`);
	assert.ok((await notices(o)).some(n => n.includes('Goblin Boss: Scimitar')));
	assert.equal(await o.page.locator(`${T} .roll-log-entry`).count(), 1);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-dice.png') });
});

test('nimble attack rolls: 1 misses, max crits and explodes, saves stay plain', async (o) => {
	await resetEncounter(o);
	await o.openFile('Bestiary/Goblin Boss.md');
	// Force the dice: Math.random -> faces in order. 1d6+2 primary 1 = miss.
	const rollWith = async (faces, text) => {
		await o.page.evaluate((faces) => {
			const queue = [...faces];
			window.__realRandom = window.__realRandom || Math.random;
			Math.random = () => queue.length ? (queue.shift() - 1) / 6 + 1e-9 : window.__realRandom();
		}, faces);
		await o.page.locator(`${R} .nimble-dice.is-clickable`, { hasText: text }).first().click();
		await o.page.evaluate(() => { Math.random = window.__realRandom; });
		return (await o.eval((app, plugin) => plugin.settings.rollLog[0]));
	};
	let r = await rollWith([1], '1d6+2');
	assert.equal(r.outcome, 'miss');
	assert.equal(r.total, 0);
	assert.ok((await notices(o)).some(n => n.includes('MISS')));

	r = await rollWith([6, 6, 3], '1d6+2');
	assert.equal(r.outcome, 'crit');
	assert.equal(r.total, 6 + 6 + 3 + 2);
	assert.match(await o.page.locator(`${T} .roll-log-entry`).first().locator('.roll-log-total').textContent(), /17 CRIT/);

	// Fire Breath calls for a save: plain sum, a 1 is not a miss.
	await o.openFile('Bestiary/Young Dragon.md');
	await o.page.evaluate(() => {
		window.__realRandom = window.__realRandom || Math.random;
		Math.random = () => 0; // every die rolls 1
	});
	await o.page.locator(`${R} .nimble-dice.is-clickable`, { hasText: '10d6' }).click();
	await o.page.evaluate(() => { Math.random = window.__realRandom; });
	r = await o.eval((app, plugin) => plugin.settings.rollLog[0]);
	assert.equal(r.outcome, undefined);
	assert.equal(r.total, 10);

	// Turning the setting off makes attack dice plain too.
	await o.eval((app, plugin) => { plugin.settings.nimbleAttackRolls = false; });
	try {
		await o.openFile('Bestiary/Goblin Boss.md');
		r = await rollWith([1], '1d6+2');
		assert.equal(r.outcome, undefined);
		assert.equal(r.total, 3);
	} finally {
		await o.eval((app, plugin) => { plugin.settings.nimbleAttackRolls = true; });
	}
});

test('stat blocks indented under a list item are indexed', async (o) => {
	await o.openFile('Camp.md');
	await o.waitFor(() => o.page.evaluate((R) => !!document.querySelector(`${R} .nimble-inline-found`), R), { timeout: 5000, what: 'Camp Guard ref to resolve' });
	assert.equal(await o.eval((app, plugin) => plugin.index.get('Camp Guard')?.monster.hp), 14);
});

test('cancelling HP entry does not swallow the next click', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster, undefined, 2));
	await card(o, 'Goblin-1').locator('.hp-display').click();
	assert.equal(await o.page.locator('.nimble-hp-pad').count(), 1);
	// Click straight from one HP box to the next one.
	await typeHp(o, 'Goblin-2', '5');
	const list = await creatures(o);
	assert.equal(list[1].hp, 7);
	assert.equal(list[0].hp, 12);
	assert.equal(await card(o, 'Goblin-1').locator('.hp-display').textContent(), '12/12');
});

test('adding reveals the tracker even when the sidebar is collapsed', async (o) => {
	await o.eval((app) => {
		app.workspace.getLeavesOfType('nimble-encounter-tracker').forEach(l => l.detach());
		app.workspace.rightSplit.collapse();
	});
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.page.waitForTimeout(300);
	assert.ok(await o.eval((app) => {
		const leaf = app.workspace.getLeavesOfType('nimble-encounter-tracker')[0];
		return !!leaf && leaf.view.containerEl.isShown() && !app.workspace.rightSplit.collapsed;
	}));
});

test('compact style and dice toggle apply to open notes', async (o) => {
	await o.openFile('Bestiary/Goblin.md');
	await o.eval(async (app, plugin) => { plugin.settings.statblockStyle = 'compact'; plugin.settings.clickableDice = false; plugin.rerenderNotes(); });
	await o.page.waitForTimeout(400);
	assert.equal(await o.page.locator(`${R} .nimble-statblock.is-compact`).count(), 1);
	assert.equal(await o.page.locator(`${R} .nimble-dice.is-clickable`).count(), 0);
	await o.eval(async (app, plugin) => { plugin.settings.statblockStyle = 'book'; plugin.settings.clickableDice = true; plugin.rerenderNotes(); });
	await o.page.waitForTimeout(400);
	assert.equal(await o.page.locator(`${R} .nimble-statblock.is-compact`).count(), 0);
	assert.ok(await o.page.locator(`${R} .nimble-dice.is-clickable`).count() > 0);
});

test('settings tab: party editor, toggles and attribution', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.eval((app) => { app.setting.open(); app.setting.openTabById('nimble-gm'); });
	const C = '.vertical-tab-content';
	// Obsidian 1.13+ opens settings in a window of their own.
	const sp = await o.waitFor(async () => {
		for (const pg of o.browser.contexts().flatMap(c => c.pages())) {
			if (await pg.locator(`${C} .nimble-notice`).count().catch(() => 0)) return pg;
		}
	}, { timeout: 5000, what: 'the settings tab' });
	try {
		const names = await sp.locator(`${C} .setting-item-name`).allTextContents();
		for (const n of ['Include the Nimble bestiary', 'Nimble slash commands', 'Party', 'Stat block style', 'Clickable dice', 'Nimble attack rolls', 'Multiple encounters',
			'Apply monster armor automatically', 'Minion overkill', 'Custom conditions']) assert.ok(names.includes(n), `missing setting ${n}`);

		// Attribution and the link to buy the books.
		const notice = sp.locator(`${C} .nimble-notice`).first();
		assert.match(await notice.textContent(), /Nimble 3rd Party Creator License/);
		const link = notice.locator('a', { hasText: 'nimbleRPG.com' });
		assert.equal(await link.getAttribute('href'), 'https://nimbleRPG.com');

		// Party editor: one row per hero, with their values.
		const rows = sp.locator(`${C} .nimble-party-row`);
		assert.equal(await rows.count(), 2);
		assert.equal(await rows.first().locator('input[aria-label="Aria name"]').inputValue(), 'Aria');
		assert.equal(await rows.first().locator('input[aria-label="Aria max HP"]').inputValue(), '10');
		assert.equal(await rows.nth(1).locator('input[aria-label="Bram class"]').inputValue(), 'Commander');
		await sp.screenshot({ path: join(ARTIFACTS, 'showcase-settings.png') });
		await sp.locator(`${C} button`, { hasText: 'Add hero' }).click();
		await sp.waitForTimeout(150);
		assert.equal(await rows.count(), 3);
		assert.equal(await o.eval((app, plugin) => plugin.settings.party.length), 3);
		await rows.nth(2).locator('input').first().fill('Cyra');
		await sp.keyboard.press('Tab'); // commits on change
		await sp.waitForTimeout(100);
		assert.equal(await o.eval((app, plugin) => plugin.settings.party[2].name), 'Cyra');
		await rows.nth(2).locator('button[aria-label^="Remove"]').click();
		await sp.waitForTimeout(150);
		assert.equal(await o.eval((app, plugin) => plugin.settings.party.length), 2);

		// Toggling the bundled bestiary from settings empties and refills the index.
		const toggle = sp.locator(`${C} .setting-item`, { hasText: 'Include the Nimble bestiary' }).locator('.checkbox-container');
		await toggle.click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.index.bundledCount === 0 && !plugin.settings.bundledBestiary), { timeout: 3000, what: 'bestiary to unload' });
		await toggle.click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.index.bundledCount >= 500 && plugin.settings.bundledBestiary), { timeout: 3000, what: 'bestiary to reload' });
	} finally {
		await o.eval((app, plugin) => { app.setting.close(); plugin.settings.party = []; if (!plugin.settings.bundledBestiary) { plugin.settings.bundledBestiary = true; plugin.loadBundledBestiary(); } });
	}
});

test('phone: touch HP pad, bottom sheets, narrow bestiary, pinch-zoom map', async (o) => {
	const p = o.page;
	await resetEncounter(o, { party: PARTY });
	const cdp = await p.context().newCDPSession(p);
	const tap = async (loc) => {
		await loc.scrollIntoViewIfNeeded().catch(() => {});
		const b = await loc.boundingBox();
		assert.ok(b, 'tap target is visible');
		const x = b.x + b.width / 2, y = b.y + b.height / 2;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await p.waitForTimeout(250);
	};
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await o.eval((app) => app.emulateMobile(true));
	await p.waitForTimeout(1200);
	try {
		assert.ok(await p.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer under touch emulation');

		// HP pad: tap the HP, key in 15, Damage. Medium armor takes 10 off.
		await o.eval(async (app, plugin) => {
			await plugin.activateEncounterView(true);
			await plugin.addToEncounter(plugin.index.get('Goblin Taskmaster').monster, undefined, 1);
		});
		await p.waitForTimeout(400);
		const before = (await creatures(o)).find(c => c.label.startsWith('Goblin Taskmaster'));
		await tap(p.locator(`${T} .creature-item`).filter({ hasText: 'Goblin Taskmaster' }).locator('.hp-display'));
		assert.equal(await p.locator('.nimble-hp-pad').count(), 1, 'HP calculator opens on tap');
		for (const k of ['1', '5']) await tap(p.locator('.hp-pad-keys button', { hasText: exact(k) }));
		assert.match(await p.locator('.hp-pad-preview').innerText(), /15 − 10 \(Medium armor\) = 5/);
		assert.equal(await p.locator('.nimble-hp-pad.is-sheet').count(), 1, 'a bottom sheet on phones');
		await tap(p.locator('.hp-pad-apply'));
		const after = (await creatures(o)).find(c => c.label.startsWith('Goblin Taskmaster'));
		assert.equal(after.hp, before.hp - 5);

		// Status picker is a bottom sheet.
		await tap(p.locator(`${T} .creature-item`).filter({ hasText: 'Goblin Taskmaster' }).locator('.add-condition-btn'));
		assert.equal(await p.locator('.nimble-popover.is-sheet').count(), 1, 'popover is a sheet on phones');
		await p.evaluate(() => document.querySelectorAll('.nimble-popover').forEach(n => n.remove()));

		// Narrow bestiary: list → monster → back; filters behind a toggle.
		await o.eval(async (app, plugin) => { await plugin.openBestiary(); });
		await p.waitForTimeout(500);
		const layout = p.locator('.bestiary-layout');
		assert.match(await layout.getAttribute('class'), /is-narrow/);
		assert.equal(await p.locator('.bestiary-filters').isVisible(), false, 'filters start collapsed');
		await tap(p.locator('.bestiary-row').nth(2));
		assert.match(await layout.getAttribute('class'), /show-detail/);
		assert.equal(await p.locator('.bestiary-list').isVisible(), false);
		await tap(p.locator('.bestiary-back'));
		assert.doesNotMatch(await layout.getAttribute('class'), /show-detail/);
		await tap(p.locator('.bestiary-filter-toggle'));
		assert.equal(await p.locator('.bestiary-filters').isVisible(), true);

		// Map: two-finger pinch zooms in; a tap on a pin opens its card.
		await o.eval(async (app) => {
			const c = document.createElement('canvas'); c.width = 800; c.height = 600;
			const g = c.getContext('2d'); g.fillStyle = '#556'; g.fillRect(0, 0, 800, 600);
			const blob = await new Promise(r => c.toBlob(r, 'image/png'));
			if (!app.vault.getAbstractFileByPath('touch-map.png')) await app.vault.createBinary('touch-map.png', await blob.arrayBuffer());
			const md = '```nimble-map\nimage: [[touch-map.png]]\npins:\n- 20, 20 | Gate | | place\n```\n';
			const f = app.vault.getAbstractFileByPath('Touch Map.md') || await app.vault.create('Touch Map.md', md);
			await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'preview' } });
		});
		await p.waitForTimeout(900);
		const vp = p.locator(`${R} .nimble-map-viewport`);
		const scale = () => p.evaluate((r) => Number(/scale\(([\d.]+)\)/.exec(document.querySelector(`${r} .nimble-map-stage`).style.transform)?.[1] ?? 0), R);
		const s0 = await scale();
		assert.ok(s0 > 0, 'map fitted');
		const b = await vp.boundingBox();
		const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 20, y: cy, id: 1 }, { x: cx + 20, y: cy, id: 2 }] });
		for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 20 - i * 12, y: cy, id: 1 }, { x: cx + 20 + i * 12, y: cy, id: 2 }] });
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		const s1 = await scale();
		assert.ok(s1 > s0 * 2, `pinch zooms in (${s0} → ${s1})`);
		await o.eval((app, plugin) => document.querySelector('.markdown-reading-view .nimble-map-viewport').focus());
		await p.keyboard.press('0'); // fit again so the pin is on screen
		await tap(p.locator(`${R} .nimble-map-pin`).first());
		assert.equal(await p.locator('.nimble-popover.nimble-pin-card').count(), 1, 'tapping a pin opens its card');
		assert.equal(await p.locator('.menu').count(), 0, 'no stray long-press menu');
	} finally {
		await p.evaluate(() => document.querySelectorAll('.nimble-popover, .modal-container, .menu').forEach(n => n.remove()));
		await o.eval((app) => app.emulateMobile(false));
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await cdp.send('Emulation.clearDeviceMetricsOverride');
		await p.waitForTimeout(800);
		await o.eval(async (app) => { for (const f of ['Touch Map.md', 'touch-map.png']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); } });
	}
});

test('3D dice: an attack roll animates, then the notice shows the result', async (o) => {
	await resetEncounter(o);
	const supported = await o.page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
	if (!supported) { console.log('      (skipped: no WebGL in this run)'); return; }
	await o.eval(async (app, plugin) => {
		plugin.settings.dice3d = true;
		document.querySelectorAll('.notice').forEach(n => n.remove());
		plugin.rollDice('3d6+2', 'Dice test', 'attack');
	});
	await o.waitFor(async () => (await o.page.locator('canvas.nimble-dice3d-overlay').count()) === 1, { what: 'the 3D dice overlay' });
	assert.equal(await o.page.locator('.nimble-roll-notice').count(), 0, 'the notice waits for the dice');
	await o.waitFor(async () => (await o.page.locator('.nimble-roll-notice').count()) === 1, { what: 'the roll notice after landing', timeout: 8000 });
	assert.match(await o.page.locator('.nimble-roll-notice').innerText(), /Dice test/);
	// The overlay fades away afterwards and never blocks clicks.
	assert.equal(await o.page.evaluate(() => getComputedStyle(document.querySelector('canvas.nimble-dice3d-overlay') ?? document.body).pointerEvents), 'none');
	await o.waitFor(async () => (await o.page.locator('canvas.nimble-dice3d-overlay').count()) === 0, { what: 'the overlay to go away', timeout: 8000 });
	await o.eval((app, plugin) => { plugin.settings.dice3d = false; document.querySelectorAll('.notice').forEach(n => n.remove()); });
});

test('NPC card: empty portrait slot, choose an image, secret blur, lightbox, panel avatar', async (o) => {
	await resetEncounter(o);
	// A 2×3 PNG, so the image has a real size to lay out.
	const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFklEQVR4nGP4z8Dwn4GBgYGJAQoYGAAeBgEEhSb/JAAAAABJRU5ErkJggg==';
	await o.eval(async (app, plugin, png) => {
		for (const f of ['Campaigns/Card/NPCs/Marta Hale.md', 'Campaigns/Card/Assets/marta.png', 'Campaigns/Card/Card.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		for (const d of ['Campaigns', 'Campaigns/Card', 'Campaigns/Card/NPCs', 'Campaigns/Card/Assets']) if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d);
		await app.vault.create('Campaigns/Card/Card.md', '---\nnimble: campaign\n---\n');
		const bin = Uint8Array.from(atob(png), c => c.charCodeAt(0));
		await app.vault.createBinary('Campaigns/Card/Assets/marta.png', bin.buffer);
		await app.vault.create('Campaigns/Card/NPCs/Marta Hale.md', '---\nnimble: npc\nrole: Miller\'s widow\n---\n```nimble-npc\nlook: Soot on her apron\nwants: The mill back\nvoice:\nsecret: She sold the water rights\n```\n\nShe runs the mill.\n');
	}, PNG);
	await o.openFile('Campaigns/Card/NPCs/Marta Hale.md', 'preview');
	const cardEl = o.page.locator(`${R} .nimble-npc-card`);
	await o.waitFor(async () => (await cardEl.count()) === 1, { what: 'the NPC card' });
	assert.equal(await cardEl.locator('.nimble-npc-name').innerText(), 'Marta Hale', 'name from the note title');
	assert.match(await cardEl.locator('.nimble-npc-role').innerText(), /miller's widow/i, 'role from properties');
	assert.equal(await cardEl.locator('.nimble-npc-field').count(), 4);
	assert.equal(await cardEl.locator('.nimble-npc-value.is-empty').count(), 1, 'empty voice shows a dash');
	assert.equal(await cardEl.locator('.nimble-npc-portrait.is-empty').count(), 1, 'no portrait yet: an add slot');

	// Secret starts blurred and reveals on click.
	const secret = cardEl.locator('.nimble-npc-field.is-secret');
	assert.notEqual(await secret.locator('.nimble-npc-value').evaluate(el => getComputedStyle(el).filter), 'none');
	await secret.locator('.nimble-npc-value').click();
	await o.waitFor(async () => (await secret.locator('.nimble-npc-value').evaluate(el => getComputedStyle(el).filter)) === 'none', { what: 'the secret to unblur' });

	// Choose an image from the vault through the slot's menu.
	await cardEl.locator('.nimble-npc-portrait').click();
	await o.page.locator('.menu .menu-item', { hasText: 'Choose from vault' }).click();
	await o.page.keyboard.type('marta.png', { delay: 10 });
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => /portrait: "?\[\[.*marta\.png\]\]/.test(await o.eval((app) => app.vault.adapter.read('Campaigns/Card/NPCs/Marta Hale.md'))), { what: 'the portrait property' });
	const img = o.page.locator(`${R} .nimble-npc-card .nimble-npc-portrait img`);
	await o.waitFor(async () => (await img.count()) === 1 && await img.evaluate(el => el.complete && el.naturalWidth > 0), { what: 'the portrait to render' });

	// Click to enlarge.
	await o.page.locator(`${R} .nimble-npc-card .nimble-npc-portrait`).click();
	const modal = o.page.locator('.modal.nimble-portrait-modal');
	await o.waitFor(async () => (await modal.count()) === 1, { what: 'the portrait lightbox' });
	assert.match(await modal.locator('.nimble-portrait-caption').innerText(), /Marta Hale/);
	await o.page.keyboard.press('Escape');

	// Campaign panel shows the portrait as the NPC's avatar.
	await o.eval(async (app, plugin) => { await plugin.campaigns.setActive('Campaigns/Card'); await plugin.openCampaignView(); });
	const avatar = o.page.locator('.campaign-note[data-path="Campaigns/Card/NPCs/Marta Hale.md"] .campaign-note-avatar img');
	await o.waitFor(async () => (await avatar.count()) === 1, { what: 'the panel avatar' });

	// Live Preview renders the card too.
	await o.openFile('Campaigns/Card/NPCs/Marta Hale.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lastLine(), ch: 0 }); });
	await o.waitFor(async () => (await o.page.locator(`${S} .nimble-npc-card img`).count()) === 1, { what: 'the card in Live Preview' });
	await o.eval(async (app, plugin) => plugin.campaigns.setActive(null));
});

// ---------------------------------------------------------------------------
// Campaign panel: folders, the New note picker, menus, drag and drop

const CP = '.nimble-campaign-view';
const cgroup = (o, folder) => o.page.locator(`${CP} .campaign-group[data-folder="${folder}"]`);
const crow = (o, path) => o.page.locator(`${CP} .campaign-note[data-path="${path}"]`);
const menuTitles = (o) => o.page.evaluate(() => [...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent));
const clickMenu = (o, title) => o.page.locator('.menu .menu-item', { hasText: exact(title) }).click();
const exists = (o, path) => o.eval((app, _p, path) => !!app.vault.getAbstractFileByPath(path), path);
const read = (o, path) => o.eval((app, _p, path) => app.vault.adapter.read(path), path);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Panel sections, in the order shown. */
const panelSections = (o) => o.page.evaluate((cp) => [...document.querySelectorAll(`${cp} .campaign-section-name`)].map(e => e.textContent), CP);

/** A new campaign straight out of "New campaign" (starter folders on), shown in the panel. */
async function freshCampaign(o, name) {
	await o.eval(async (app, plugin, name) => {
		document.querySelectorAll('.menu').forEach(n => n.remove());
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		app.vault.setConfig('trashOption', 'local'); // deletes go to .trash in the test vault
		const old = app.vault.getAbstractFileByPath(`Campaigns/${name}`);
		if (old) await app.vault.delete(old, true);
		await plugin.campaigns.createCampaign({ name, level: 1, heroes: 4, starter: true, firstChapter: 'Chapter 1' });
		await plugin.openCampaignView();
	}, name);
	await o.waitFor(async () => (await panelSections(o)).length >= 5, { what: 'the starter folders in the panel' });
}

async function endCampaign(o, name) {
	await o.eval(async (app, plugin, name) => {
		document.querySelectorAll('.menu').forEach(n => n.remove());
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		const f = app.vault.getAbstractFileByPath(`Campaigns/${name}`);
		if (f) await app.vault.delete(f, true);
		await plugin.campaigns.setActive(null);
	}, name);
	await o.page.waitForTimeout(500);
}

/** Open the New note picker from a folder's + button. */
async function openPicker(o, folder) {
	await cgroup(o, folder).locator('.campaign-group-head button.campaign-add-scene').click();
	await o.page.locator('.nimble-new-note').waitFor();
}
const activeStarter = (o) => o.page.locator('.nimble-new-note .nimble-starter.is-active').getAttribute('data-kind');
async function createFromPicker(o, name, kind) {
	if (kind) await o.page.locator(`.nimble-new-note .nimble-starter[data-kind="${kind}"]`).click();
	await o.page.locator('.nimble-new-note .nimble-name-input').fill(name);
	await o.page.locator('.nimble-new-note .nimble-name-input').press('Enter');
}

test('campaign panel: a new campaign shows its empty starter folders, each with a +', async (o) => {
	await freshCampaign(o, 'Fresh');
	assert.deepEqual(await panelSections(o), ['Sessions', 'NPCs', 'Locations', 'Monsters', 'Assets']);
	for (const name of ['Sessions', 'NPCs', 'Locations', 'Monsters', 'Assets']) {
		const g = cgroup(o, `Campaigns/Fresh/${name}`);
		assert.equal(await g.locator('.campaign-group-head button.campaign-add-scene').count(), 1, `${name} has a +`);
		assert.match(await g.locator('.campaign-empty').innerText(), /Nothing here yet/);
	}
	assert.match(await cgroup(o, 'Campaigns/Fresh/NPCs').locator('.campaign-empty').innerText(), /\+ New NPC/);
	assert.match(await cgroup(o, 'Campaigns/Fresh/Assets').locator('.campaign-empty').innerText(), /\+ Add files/);
	// The Campaign heading is there from the start, with its New folder and + buttons.
	const heading = o.page.locator(`${CP} .campaign-heading-folders`);
	assert.equal(await heading.locator('button[aria-label="New folder"]').count(), 1);
	await heading.locator('button[aria-label="New note or folder"]').click();
	assert.deepEqual(await menuTitles(o), ['New session log', 'New NPC', 'New location', 'New note…', 'New chapter', 'New folder']);
	await o.page.keyboard.press('Escape');
	await o.page.screenshot({ path: join(ARTIFACTS, 'campaign-fresh.png') });

	// The dashboard block on the home note lists the same folders.
	await o.openFile('Campaigns/Fresh/Fresh.md', 'preview');
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-campaign-block .campaign-section-name`).count()) === 5, { what: 'folders in the dashboard block' });
	await endCampaign(o, 'Fresh');
});

test('campaign panel: vaults from before the fix show their empty folders after updating', async (o) => {
	// A campaign written to disk the way 1.0.2 left it, while the plugin is off.
	await o.eval(async (app) => { await app.plugins.disablePlugin('nimble-gm'); });
	const root = join(o.vault, 'Campaigns', 'Old Vault');
	for (const d of ['NPCs', 'Locations', 'Sessions', 'Monsters', 'Assets', 'Factions', 'Act 1']) mkdirSync(join(root, d), { recursive: true });
	writeFileSync(join(root, 'Old Vault.md'), '---\nnimble: campaign\nlevel: 2\n---\n');
	writeFileSync(join(root, 'Act 1', 'Act 1.md'), '---\nnimble: chapter\norder: 1\n---\n');
	writeFileSync(join(root, 'Assets', 'handout.pdf'), '%PDF-1.4\n%%EOF\n');
	await o.waitFor(() => o.eval((app) => !!app.vault.getAbstractFileByPath('Campaigns/Old Vault/Assets/handout.pdf') && !!app.vault.getAbstractFileByPath('Campaigns/Old Vault/Factions')), { what: 'Obsidian to see the files' });
	// "Update": turn the plugin back on.
	await o.eval(async (app) => { await app.plugins.enablePlugin('nimble-gm'); });
	await o.waitFor(() => o.eval((app) => !!app.plugins.plugins['nimble-gm']?._loaded), { what: 'the plugin to load' });
	await o.eval(async (app, plugin) => {
		await o_wait(() => plugin.campaigns.campaigns.some(c => c.folder === 'Campaigns/Old Vault'));
		await plugin.campaigns.setActive('Campaigns/Old Vault');
		await plugin.openCampaignView();
		function o_wait(fn) { return new Promise(r => { const t = setInterval(() => { if (fn()) { clearInterval(t); r(); } }, 50); }); }
	});
	await o.waitFor(async () => (await panelSections(o)).length === 6, { what: 'the old campaign\'s folders' });
	assert.deepEqual(await panelSections(o), ['Sessions', 'NPCs', 'Locations', 'Factions', 'Monsters', 'Assets']);
	assert.equal(await crow(o, 'Campaigns/Old Vault/Assets/handout.pdf').count(), 1);
	assert.equal(await cgroup(o, 'Campaigns/Old Vault/Factions').locator('button.campaign-add-scene').count(), 1);
	await endCampaign(o, 'Old Vault');
});

test('campaign panel: a folder made in the file explorer shows up, and + adds a note to it', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app) => { await app.vault.createFolder('Campaigns/Fresh/Factions'); });
	await cgroup(o, 'Campaigns/Fresh/Factions').waitFor();
	assert.match(await cgroup(o, 'Campaigns/Fresh/Factions').locator('.campaign-empty').innerText(), /\+ New note/);
	await openPicker(o, 'Campaigns/Fresh/Factions');
	assert.equal(await o.page.locator('.nimble-new-note .modal-title').innerText(), 'New in Factions');
	assert.equal(await activeStarter(o), 'note');
	await createFromPicker(o, 'Zhentarim');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Factions/Zhentarim.md'), { what: 'the new note' });
	assert.equal(await read(o, 'Campaigns/Fresh/Factions/Zhentarim.md'), '');
	await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.path)) === 'Campaigns/Fresh/Factions/Zhentarim.md', { what: 'the note to open' });
	await crow(o, 'Campaigns/Fresh/Factions/Zhentarim.md').waitFor();
	// The empty-folder link opens the same picker.
	await cgroup(o, 'Campaigns/Fresh/Locations').locator('.campaign-empty a').click();
	await o.page.locator('.nimble-new-note').waitFor();
	assert.equal(await activeStarter(o), 'location');
	await o.page.keyboard.press('Escape');
	await endCampaign(o, 'Fresh');
});

test('New note picker: each starter writes its template where it was opened', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app, _p, png) => {
		const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
		await app.vault.createBinary('Campaigns/Fresh/Assets/cave.png', bytes.buffer);
		await app.vault.createFolder('Campaigns/Fresh/Factions');
	}, PNG);
	await cgroup(o, 'Campaigns/Fresh/Factions').waitFor();

	// NPCs: NPC is picked for you.
	await openPicker(o, 'Campaigns/Fresh/NPCs');
	assert.equal(await activeStarter(o), 'npc');
	await createFromPicker(o, 'Sister Garaele');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/Sister Garaele.md'), { what: 'the NPC' });
	assert.match(await read(o, 'Campaigns/Fresh/NPCs/Sister Garaele.md'), /nimble: npc[\s\S]*```nimble-npc/);

	// Any starter can go in any folder.
	await openPicker(o, 'Campaigns/Fresh/Factions');
	await createFromPicker(o, 'Phandalin', 'location');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Factions/Phandalin.md'), { what: 'the location' });
	assert.match(await read(o, 'Campaigns/Fresh/Factions/Phandalin.md'), /nimble: location/);

	// Sessions: suggests the next session's name.
	await openPicker(o, 'Campaigns/Fresh/Sessions');
	assert.equal(await activeStarter(o), 'session');
	assert.equal(await o.page.locator('.nimble-new-note .nimble-name-input').inputValue(), 'Session 1');
	await o.page.locator('.nimble-new-note .nimble-name-input').press('Enter');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Sessions/Session 1.md'), { what: 'the session log' });
	assert.match(await read(o, 'Campaigns/Fresh/Sessions/Session 1.md'), /nimble: session\ndate: \d{4}-\d\d-\d\d/);

	// Monsters: a stat block the bestiary picks up under its name.
	await openPicker(o, 'Campaigns/Fresh/Monsters');
	assert.equal(await activeStarter(o), 'monster');
	await createFromPicker(o, 'Quarry Boss');
	await o.waitFor(() => o.eval((app, plugin) => plugin.index.get('Quarry Boss')?.filePath === 'Campaigns/Fresh/Monsters/Quarry Boss.md'), { what: 'the monster in the index' });

	// Map: pick the image from the campaign's files.
	await openPicker(o, 'Campaigns/Fresh/Factions');
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="map"]').click();
	await o.page.locator('.nimble-new-note .nimble-starter-map select').selectOption('Campaigns/Fresh/Assets/cave.png');
	await createFromPicker(o, 'Cave Map');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Factions/Cave Map.md'), { what: 'the map' });
	assert.match(await read(o, 'Campaigns/Fresh/Factions/Cave Map.md'), /nimble: map[\s\S]*```nimble-map\nimage: \[\[cave\.png\]\]\npins:/);
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-map img, ${S} .nimble-map img`).count()) >= 1, { what: 'the map image to render' });

	// Handout, chosen with the arrow keys from the tile before it.
	await openPicker(o, 'Campaigns/Fresh/Factions');
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="monster"]').click();
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="monster"]').press('ArrowRight');
	assert.equal(await activeStarter(o), 'handout');
	await createFromPicker(o, 'Letter from Iarno');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Factions/Letter from Iarno.md'), { what: 'the handout' });
	assert.match(await read(o, 'Campaigns/Fresh/Factions/Letter from Iarno.md'), /nimble: handout/);

	// A chapter's + starts on Scene and puts it at the end of the chapter.
	await openPicker(o, 'Campaigns/Fresh/Chapter 1');
	assert.equal(await activeStarter(o), 'scene');
	assert.equal(await o.page.locator('.nimble-new-note .nimble-starter[data-kind="session"]').count(), 0, 'no session logs in a chapter');
	await createFromPicker(o, 'The Bridge');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Chapter 1/The Bridge.md'), { what: 'the scene' });
	assert.match(await read(o, 'Campaigns/Fresh/Chapter 1/The Bridge.md'), /nimble: scene\norder: 2/);
	await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-group[data-folder="Campaigns/Fresh/Chapter 1"] .campaign-note-title`).allInnerTexts()).join() === 'Opening Scene,The Bridge', { what: 'the scene in the chapter' });
	await endCampaign(o, 'Fresh');
});

test('campaign panel: Assets lists its files and + adds files from this device', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app, _p, png) => {
		const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
		await app.vault.createBinary('Campaigns/Fresh/Assets/cave.png', bytes.buffer);
	}, PNG);
	await crow(o, 'Campaigns/Fresh/Assets/cave.png').waitFor();

	const chooser = o.page.waitForEvent('filechooser');
	await cgroup(o, 'Campaigns/Fresh/Assets').locator('.campaign-group-head button.campaign-add-scene').click();
	await (await chooser).setFiles([
		{ name: 'Letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') },
		{ name: 'cave.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') },
	]);
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Assets/Letter.pdf'), { what: 'the imported PDF' });
	assert.ok(await exists(o, 'Campaigns/Fresh/Assets/cave 2.png'), 'a name clash gets a number, nothing is overwritten');
	await crow(o, 'Campaigns/Fresh/Assets/Letter.pdf').waitFor();
	assert.equal(await cgroup(o, 'Campaigns/Fresh/Assets').locator('.campaign-count').innerText(), '3');

	// Clicking a file opens it in Obsidian's viewer.
	await crow(o, 'Campaigns/Fresh/Assets/cave.png').click();
	await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.path)) === 'Campaigns/Fresh/Assets/cave.png', { what: 'the image to open' });

	// The New note picker can add files instead, into the folder it came from.
	await openPicker(o, 'Campaigns/Fresh/NPCs');
	const chooser2 = o.page.waitForEvent('filechooser');
	await o.page.locator('.nimble-new-note .nimble-starter-files').click();
	await (await chooser2).setFiles([{ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') }]);
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/portrait.png'), { what: 'the file in NPCs' });
	await crow(o, 'Campaigns/Fresh/NPCs/portrait.png').waitFor();
	await endCampaign(o, 'Fresh');
});

test('campaign panel: New folder makes a section you can add to', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.page.locator(`${CP} .campaign-heading-folders button[aria-label="New folder"]`).click();
	await o.page.locator('.nimble-name-prompt .nimble-name-input').fill('Handouts');
	await o.page.locator('.nimble-name-prompt .nimble-name-input').press('Enter');
	await cgroup(o, 'Campaigns/Fresh/Handouts').waitFor();
	assert.ok(await exists(o, 'Campaigns/Fresh/Handouts'));
	await openPicker(o, 'Campaigns/Fresh/Handouts');
	assert.equal(await activeStarter(o), 'handout');
	await o.page.keyboard.press('Escape');
	// A second folder with the same name doesn't clash.
	await o.page.locator(`${CP} .campaign-heading-folders button[aria-label="New note or folder"]`).click();
	await clickMenu(o, 'New folder');
	await o.page.locator('.nimble-name-prompt .nimble-name-input').fill('Handouts');
	await o.page.locator('.nimble-name-prompt .nimble-name-input').press('Enter');
	await cgroup(o, 'Campaigns/Fresh/Handouts 2').waitFor();
	await endCampaign(o, 'Fresh');
});

test('campaign panel: right-click to move, rename and delete notes, folders and chapters', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app) => {
		await app.vault.createFolder('Campaigns/Fresh/Factions');
		await app.vault.create('Campaigns/Fresh/Factions/Zhentarim.md', 'A faction.\n');
		await app.vault.create('Campaigns/Fresh/Factions/Harpers.md', 'Another.\n');
	});
	const zh = crow(o, 'Campaigns/Fresh/Factions/Zhentarim.md');
	await zh.waitFor();

	await zh.click({ button: 'right' });
	const titles = await menuTitles(o);
	for (const t of ['Open in new tab', 'Move to chapter or folder…', 'Rename…', 'Delete']) assert.ok(titles.includes(t), `menu has ${t}: ${titles}`);
	// Move into a chapter: it becomes the chapter's last scene.
	await clickMenu(o, 'Move to chapter or folder…');
	await o.page.locator('.prompt-input').fill('Chapter 1');
	await o.page.locator('.prompt-input').press('Enter');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Chapter 1/Zhentarim.md'), { what: 'the move into the chapter' });
	await o.waitFor(async () => /order: 2/.test(await read(o, 'Campaigns/Fresh/Chapter 1/Zhentarim.md')), { what: 'the scene order' });
	await crow(o, 'Campaigns/Fresh/Chapter 1/Zhentarim.md').waitFor();

	// Rename.
	await crow(o, 'Campaigns/Fresh/Chapter 1/Zhentarim.md').click({ button: 'right' });
	await clickMenu(o, 'Rename…');
	const input = o.page.locator('.nimble-name-prompt .nimble-name-input');
	assert.equal(await input.inputValue(), 'Zhentarim');
	await input.fill('The Black Network');
	await input.press('Enter');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Chapter 1/The Black Network.md'), { what: 'the rename' });

	// Delete asks first, then goes to the trash.
	await crow(o, 'Campaigns/Fresh/Chapter 1/The Black Network.md').click({ button: 'right' });
	await clickMenu(o, 'Delete');
	await o.page.locator('.modal-container button', { hasText: exact('Delete') }).click();
	await o.waitFor(async () => !(await exists(o, 'Campaigns/Fresh/Chapter 1/The Black Network.md')), { what: 'the delete' });

	// Folder: rename keeps its notes, delete takes them along.
	await cgroup(o, 'Campaigns/Fresh/Factions').locator('.campaign-group-head').click({ button: 'right' });
	assert.ok((await menuTitles(o)).includes('New note…'));
	await clickMenu(o, 'Rename folder…');
	await input.fill('Guilds');
	await input.press('Enter');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Guilds/Harpers.md'), { what: 'the folder rename' });
	await cgroup(o, 'Campaigns/Fresh/Guilds').locator('.campaign-group-head').click({ button: 'right' });
	await clickMenu(o, 'Delete folder');
	assert.match(await o.page.locator('.modal-container .modal-content').innerText(), /1 item inside/);
	await o.page.locator('.modal-container button', { hasText: exact('Delete') }).click();
	await o.waitFor(async () => !(await exists(o, 'Campaigns/Fresh/Guilds')), { what: 'the folder delete' });
	assert.equal(await cgroup(o, 'Campaigns/Fresh/Guilds').count(), 0);

	// Chapter: rename renames its folder and its home note.
	await cgroup(o, 'Campaigns/Fresh/Chapter 1').locator('.campaign-group-head').click({ button: 'right' });
	await clickMenu(o, 'Rename chapter…');
	await input.fill('Act One');
	await input.press('Enter');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Act One/Act One.md'), { what: 'the chapter rename' });
	assert.ok(await exists(o, 'Campaigns/Fresh/Act One/Opening Scene.md'));
	await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-chapter-name`).allInnerTexts()).join() === 'Act One', { what: 'the renamed chapter in the panel' });
	await endCampaign(o, 'Fresh');
});

test('campaign panel: drag notes between folders and chapters, and in from the file explorer', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app) => {
		await app.vault.create('Campaigns/Fresh/NPCs/Mara.md', '---\nnimble: npc\n---\n');
		await app.vault.create('Campaigns/Fresh/Locations/Docks.md', '---\nnimble: location\n---\n');
		for (const d of ['Old notes', 'Old notes/Factions']) if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d);
		await app.vault.create('Old notes/Ledger.md', 'From before the campaign.\n');
		await app.vault.create('Old notes/Factions/Harpers.md', 'A faction.\n');
	});
	await crow(o, 'Campaigns/Fresh/NPCs/Mara.md').waitFor();

	// Folder to folder.
	await crow(o, 'Campaigns/Fresh/NPCs/Mara.md').dragTo(cgroup(o, 'Campaigns/Fresh/Locations').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Locations/Mara.md'), { what: 'the drag into Locations' });
	await crow(o, 'Campaigns/Fresh/Locations/Mara.md').waitFor();

	// Folder to chapter: joins the end of the scenes.
	await crow(o, 'Campaigns/Fresh/Locations/Docks.md').dragTo(cgroup(o, 'Campaigns/Fresh/Chapter 1').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Chapter 1/Docks.md'), { what: 'the drag into the chapter' });
	await o.waitFor(async () => /order: 2/.test(await read(o, 'Campaigns/Fresh/Chapter 1/Docks.md')), { what: 'the scene order' });

	// Chapter back out to the top of the campaign.
	await crow(o, 'Campaigns/Fresh/Chapter 1/Docks.md').dragTo(o.page.locator(`${CP} .campaign-heading-folders`));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Docks.md'), { what: 'the drag to the campaign folder' });
	await o.page.locator(`${CP} .campaign-loose .campaign-note[data-path="Campaigns/Fresh/Docks.md"]`).waitFor();

	// Migrating: drag a note and then a whole folder in from Obsidian's file explorer.
	await o.eval(async (app) => {
		const leaf = app.workspace.getRightLeaf(false);
		await leaf.setViewState({ type: 'file-explorer', active: true });
		app.workspace.revealLeaf(leaf);
		leaf.view.revealInFolder(app.vault.getAbstractFileByPath('Old notes/Ledger.md'));
	});
	const explorerFile = o.page.locator('.workspace-split.mod-right-split .nav-file-title[data-path="Old notes/Ledger.md"]');
	await explorerFile.waitFor();
	await explorerFile.dragTo(cgroup(o, 'Campaigns/Fresh/NPCs').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/Ledger.md'), { what: 'the drop from the file explorer' });
	const explorerFolder = o.page.locator('.workspace-split.mod-right-split .nav-folder-title[data-path="Old notes/Factions"]');
	await explorerFolder.waitFor();
	await explorerFolder.dragTo(o.page.locator(`${CP} .campaign-heading-folders`));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Factions/Harpers.md'), { what: 'the folder dropped into the campaign' });
	await crow(o, 'Campaigns/Fresh/Factions/Harpers.md').waitFor();
	assert.ok((await panelSections(o)).includes('Factions'));

	await o.eval(async (app) => {
		app.workspace.getLeavesOfType('file-explorer').filter(l => l.getRoot() === app.workspace.rightSplit).forEach(l => l.detach());
		const old = app.vault.getAbstractFileByPath('Old notes');
		if (old) await app.vault.delete(old, true);
	});
	await endCampaign(o, 'Fresh');
});

test('campaign panel: long-press opens the same menus on touch', async (o) => {
	await freshCampaign(o, 'Fresh');
	await o.eval(async (app) => { await app.vault.create('Campaigns/Fresh/NPCs/Mara.md', '---\nnimble: npc\n---\n'); });
	const row = crow(o, 'Campaigns/Fresh/NPCs/Mara.md');
	await row.waitFor();
	await o.page.waitForTimeout(500); // let the panel finish re-rendering after the new note
	const press = async (loc) => {
		await loc.evaluate((el) => {
			const r = el.getBoundingClientRect();
			el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: r.x + 10, clientY: r.y + r.height / 2 }));
		});
		await o.page.waitForTimeout(650);
		await loc.evaluate((el) => el.ownerDocument.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 7 })));
	};
	await press(row);
	assert.ok((await menuTitles(o)).includes('Move to chapter or folder…'), 'note menu on long-press');
	await o.page.keyboard.press('Escape');
	await press(cgroup(o, 'Campaigns/Fresh/NPCs').locator('.campaign-group-head'));
	assert.ok((await menuTitles(o)).includes('Rename folder…'), 'folder menu on long-press');
	await o.page.keyboard.press('Escape');
	// The long-press didn't also collapse the folder or open the note.
	assert.equal(await cgroup(o, 'Campaigns/Fresh/NPCs').getAttribute('class'), 'campaign-group');
	await endCampaign(o, 'Fresh');
});

// ---------------------------------------------------------------------------
// 3D dice (1.0.4): sizes, looks, imported model sets, effects, settings

const webgl = (o) => o.page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });

/** Fast dice for tests: quick playback, short stay, no effects unless a test asks. */
async function diceReset(o, extra = {}) {
	await o.eval((app, plugin, extra) => {
		document.querySelectorAll('.notice, .modal-container').forEach(n => n.remove());
		plugin.settings.dice3d = true;
		Object.assign(plugin.settings.dice, { normal: 'bone', primary: 'ember', crit: 'molten', perDie: {}, size: 1, speed: 3, stayMs: 500, shadows: 'soft', effects: { crit: 'none', miss: 'none', max: 'none', min: 'none' } }, extra);
	}, extra);
}

/** Run `start` (which throws dice) and wait for that throw to land. Returns its stats. */
async function throwAndLand(o, start, arg) {
	const before = JSON.stringify(await o.eval((app, plugin) => plugin.diceStats()));
	await o.eval(start, arg);
	return o.waitFor(async () => {
		const st = await o.eval((app, plugin) => plugin.diceStats());
		return st && JSON.stringify(st) !== before ? st : null;
	}, { what: 'the dice to land', timeout: 15000 });
}

/** A Dice So Nice style module zip with one model die: a flat-shaded d20 built for the test. */
function testDiceZip(id = 'test-glow') {
	const P = 1.618033988749895;
	const V = [[-1, P, 0], [1, P, 0], [-1, -P, 0], [1, -P, 0], [0, -1, P], [0, 1, P], [0, -1, -P], [0, 1, -P], [P, 0, -1], [P, 0, 1], [-P, 0, -1], [-P, 0, 1]];
	const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
	const pos = new Float32Array(F.flatMap(f => f.flatMap(i => V[i])));
	const bytes = Buffer.from(pos.buffer);
	const gltf = {
		asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
		materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.8, 0.5, 1], metallicFactor: 0.2, roughnessFactor: 0.4 } }],
		buffers: [{ byteLength: bytes.length, uri: 'dice_20.bin' }],
		bufferViews: [{ buffer: 0, byteLength: bytes.length }],
		accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-P, -P, -P], max: [P, P, P] }],
	};
	const script = `Hooks.once('diceSoNiceReady', (dice3d) => {\n  dice3d.addSystem({ id: "${id}", name: "Test Glow", group: "Tests" }, false);\n  dice3d.addDicePreset({ type: "d20", labels: "", modelFile: "modules/${id}/models/dice_20.gltf", system: "${id}" });\n  dice3d.addColorset({ name: '${id}-ember', description: 'Test Ember', foreground: '#fff1d6', background: '#c2410c', outline: 'black', texture: 'marble', material: 'metal' });\n});`;
	return Buffer.from(zipSync({
		[`${id}/module.json`]: strToU8(JSON.stringify({ id, title: 'Test Glow Dice Set', version: '1.0.0', authors: [{ name: 'Ember Vault tests' }], scripts: ['diceset.js'] })),
		[`${id}/diceset.js`]: strToU8(script),
		[`${id}/models/dice_20.gltf`]: strToU8(JSON.stringify(gltf)),
		[`${id}/models/dice_20.bin`]: new Uint8Array(bytes),
		[`${id}/models/notes.js`]: strToU8('alert(1)'),
	}));
}

test('3D dice: every size from 50% to 300% lands on screen showing the rolled values', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o);
	const values = [3, 5, 7, 9, 11, 17];
	const px = {};
	for (const [w, h] of [[1400, 900], [390, 844]]) {
		await o.page.setViewportSize({ width: w, height: h });
		for (const size of [0.5, 1, 2, 3]) {
			await o.eval((app, plugin, size) => { plugin.settings.dice.size = size; }, size);
			const st = await throwAndLand(o, (app, plugin, values) => plugin.rollLookPreview('bone', values), values);
			assert.deepEqual(st.shown, values, `${w}×${h} at ${size * 100}%: the dice show the rolled values`);
			assert.ok(st.inBounds, `${w}×${h} at ${size * 100}%: every die stays on the table (overshoot ${st.overshoot})`);
			px[`${w}-${size}`] = st.pxPerUnit;
		}
		// Bigger setting, bigger dice, until that many dice wouldn't fit on this screen.
		const steps = [0.5, 1, 2, 3].map(z => px[`${w}-${z}`]);
		assert.ok(steps.every((v, i) => i === 0 || v >= steps[i - 1]), `${w}: dice never get smaller as the setting grows ${JSON.stringify(steps)}`);
		assert.ok(steps[3] > steps[1] * 1.5, `${w}: 300% is clearly bigger than 100%`);
	}
	// One die has room to be the full three times the size.
	await o.page.setViewportSize({ width: 1400, height: 900 });
	const one = {};
	for (const size of [1, 3]) {
		await o.eval((app, plugin, size) => { plugin.settings.dice.size = size; }, size);
		const st = await throwAndLand(o, (app, plugin) => plugin.rollDice('1d20', 'Big', 'effect', [12]));
		assert.deepEqual(st.shown, [12]);
		assert.ok(st.inBounds);
		one[size] = st.pxPerUnit;
	}
	assert.ok(Math.abs(one[3] / one[1] - 3) < 0.05, `a single die at 300% is three times as big (${one[1]} → ${one[3]})`);
	await o.page.setViewportSize({ width: 1400, height: 900 });
	await o.page.screenshot({ path: join(ARTIFACTS, 'dice-large.png') });
	await o.eval((app, plugin) => { plugin.settings.dice.size = 1; });
});

test('3D dice: every preset look rolls, with the right values', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o);
	const presets = await o.eval((app, plugin) => [...document.querySelectorAll('x')].length === 0 && plugin.settings.dice && null);
	void presets;
	const ids = ['ember', 'bone', 'molten', 'rainbow', 'obsidian', 'gilded', 'silver', 'sea', 'velvet', 'oak', 'granite', 'parchment', 'dragon', 'starfield', 'nebula', 'opal', 'frost', 'marble', 'glitter'];
	for (const id of ids) {
		const values = [2, 4, 6, 8, 10, 20];
		const st = await throwAndLand(o, (app, plugin, [id, values]) => plugin.rollLookPreview(id, values), [id, values]);
		assert.deepEqual(st.shown, values, `${id} shows the rolled values`);
	}
});

test('3D dice: crit, miss, max and min play their effects', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o, { effects: { crit: 'ring', miss: 'ring', max: 'confetti', min: 'gloom' } });
	const crit = await throwAndLand(o, (app, plugin) => plugin.rollDice('2d6+2', 'Crit', 'attack', [6, 3, 6, 2]));
	assert.equal(crit.segmentsMs.length - 1, 2, 'two dice explode');
	assert.equal(crit.effects, 2, 'one gold ring per explosion, none again when the chain lands');
	const miss = await throwAndLand(o, (app, plugin) => plugin.rollDice('2d6+2', 'Miss', 'attack', [1, 4]));
	assert.equal(miss.effects, 1, 'a burst on the die that missed');
	const max = await throwAndLand(o, (app, plugin) => plugin.rollDice('1d20', 'Nat 20', 'effect', [20]));
	assert.equal(max.effects, 1);
	const min = await throwAndLand(o, (app, plugin) => plugin.rollDice('2d6', 'Snake eyes', 'effect', [1, 1]));
	assert.equal(min.effects, 2);
	const plain = await throwAndLand(o, (app, plugin) => plugin.rollDice('2d6', 'Plain', 'effect', [3, 4]));
	assert.equal(plain.effects, 0, 'no effect on an ordinary roll');
	await diceReset(o);
	const off = await throwAndLand(o, (app, plugin) => plugin.rollDice('1d20', 'Nat 20, effects off', 'effect', [20]));
	assert.equal(off.effects, 0, 'None turns an effect off');
	await o.eval(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
});

test('3D dice: settings from 1.0.3 carry over after updating', async (o) => {
	await o.eval(async (app, plugin) => {
		const data = JSON.parse(JSON.stringify(plugin.settings));
		delete data.dice;
		Object.assign(data, { dicePrimaryColor: '#ff0000', diceMaterialPrimary: 'gem', diceColor: '#ece6d8', diceMaterialNormal: 'classic', diceExplosionColor: '#e0a030', diceMaterialCrit: 'lava' });
		await plugin.saveData(data);
		await app.plugins.disablePlugin('nimble-gm');
		await app.plugins.enablePlugin('nimble-gm');
	});
	await o.waitFor(() => o.eval((app) => !!app.plugins.plugins['nimble-gm']?._loaded), { what: 'the plugin to load' });
	const d = await o.eval((app, plugin) => ({ dice: plugin.settings.dice, legacy: 'dicePrimaryColor' in plugin.settings }));
	assert.equal(d.dice.normal, 'bone', 'untouched other dice map to the Bone preset');
	assert.equal(d.dice.crit, 'molten', 'untouched crit dice map to Molten');
	assert.equal(d.dice.primary, 'legacy-primary', 'a changed primary die becomes a look of its own');
	assert.deepEqual(d.dice.styles.map(s => [s.name, s.body[0], s.finish]), [['My primary die', '#ff0000', 'glass']]);
	assert.equal(d.legacy, false, 'the old fields are gone');
	await o.eval(async (app, plugin) => { plugin.settings.dice.styles = []; plugin.settings.dice.primary = 'ember'; await plugin.saveSettings(); });
});

test('Dice settings: gallery, new look, edit it, assign it, preview, delete', async (o) => {
	await diceReset(o);
	await o.eval((app, plugin) => plugin.openSettings());
	const studio = o.page.locator('.nimble-dice-studio');
	await studio.waitFor();
	assert.ok(await studio.locator('.nimble-dice-card').count() >= 20, 'every preset is in the gallery');
	await studio.locator('.nimble-dice-card[data-style="oak"]').click();
	await o.waitFor(async () => (await o.page.locator('.nimble-dice-editor-name').innerText()) === 'Oak', { what: 'the editor to show Oak' });
	assert.match(await o.page.locator('.nimble-dice-editor').innerText(), /built-in look/);
	assert.equal(await o.page.locator('.nimble-dice-preview-canvas').count(), 1);
	// New look: an editable copy of the selected one.
	await o.page.locator('.nimble-dice-card-new').click();
	await o.waitFor(async () => (await o.page.locator('.nimble-dice-editor-name').innerText()) === 'Oak (mine)', { what: 'the new look' });
	const fields = o.page.locator('.nimble-dice-fields');
	await fields.locator('.setting-item', { hasText: 'Finish' }).locator('select').selectOption('chrome');
	await o.waitFor(() => o.eval((app, plugin) => plugin.settings.dice.styles.at(-1)?.finish === 'chrome'), { what: 'the finish to save' });
	await o.page.locator('.nimble-dice-fields .setting-item', { hasText: 'Font' }).locator('select').selectOption('mono');
	await o.page.locator('.nimble-dice-editor-actions button', { hasText: 'Use for all dice' }).click();
	const mine = await o.eval((app, plugin) => plugin.settings.dice.styles.at(-1));
	assert.equal(mine.font, 'mono');
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.normal), mine.id);
	// Per die size.
	const d20 = o.page.locator('.nimble-dice-perdie-cell', { hasText: 'd20' }).locator('select');
	await d20.selectOption('rainbow');
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.perDie.d20), 'rainbow');
	// Size, speed, effects.
	await o.page.locator('.setting-item', { hasText: 'Effect on a miss' }).locator('select').selectOption('smoke');
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.effects.miss), 'smoke');
	await o.page.screenshot({ path: join(ARTIFACTS, 'dice-settings.png') });
	// Delete asks first, then whatever used it falls back.
	await o.page.locator('.nimble-dice-card', { hasText: 'Oak (mine)' }).click();
	await o.page.locator('.nimble-dice-editor-actions button', { hasText: 'Delete' }).click();
	await o.page.locator('.modal-container').last().locator('button', { hasText: exact('Delete') }).click();
	await o.waitFor(() => o.eval((app, plugin, id) => !plugin.settings.dice.styles.some(s => s.id === id) && plugin.settings.dice.normal === 'bone', mine.id), { what: 'the delete' });
	await o.eval(() => document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()));
	await diceReset(o);
});

test('Dice import: a Dice So Nice set (zip, then by link) rolls its own models on the rolled number', async (o) => {
	await diceReset(o);
	await o.eval((app, plugin) => plugin.openSettings());
	await o.page.locator('.nimble-dice-import').waitFor();
	const chooser = o.page.waitForEvent('filechooser');
	await o.page.locator('.nimble-dice-import button', { hasText: 'Import file…' }).click();
	await (await chooser).setFiles([{ name: 'test-glow.zip', mimeType: 'application/zip', buffer: testDiceZip() }]);
	await o.waitFor(() => o.eval((app, plugin) => plugin.settings.dice.sets.some(s => s.id === 'test-glow')), { what: 'the set to import', timeout: 15000 });
	const set = await o.eval((app, plugin) => plugin.settings.dice.sets.find(s => s.id === 'test-glow'));
	assert.deepEqual(set.models, { 20: 'models/dice_20.gltf' });
	assert.equal(set.name, 'Test Glow');
	const files = await o.eval(async (app, plugin) => {
		const dir = `${plugin.manifest.dir}/dice-sets/test-glow`;
		const a = app.vault.adapter;
		return { gltf: await a.exists(`${dir}/models/dice_20.gltf`), bin: await a.exists(`${dir}/models/dice_20.bin`), js: await a.exists(`${dir}/models/notes.js`) || await a.exists(`${dir}/diceset.js`) };
	});
	assert.deepEqual(files, { gltf: true, bin: true, js: false }, 'models kept, scripts never stored');
	// Its look and colour set are in the gallery.
	await o.page.locator('.nimble-dice-card[data-style="set:test-glow"]').waitFor();
	assert.equal(await o.page.locator('.nimble-dice-card', { hasText: 'Test Ember' }).count(), 1);
	await o.eval(() => document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()));
	if (await webgl(o)) {
		await diceReset(o, { perDie: { d20: 'set:test-glow' } });
		for (const v of [13, 1, 20]) {
			const st = await throwAndLand(o, (app, plugin, v) => plugin.rollDice('1d20', 'Model', 'effect', [v]), v);
			assert.equal(st.models, 1, 'the d20 is the imported model');
			assert.deepEqual(st.shown, [v], `the model shows ${v}`);
		}
		// A crit with model dice: the extra dice still pop out of the one that crit, with the burst and glow.
		await diceReset(o, { primary: 'set:test-glow', crit: '', normal: 'set:test-glow', effects: { crit: 'ring', miss: 'none', max: 'none', min: 'none' } });
		const crit = await throwAndLand(o, (app, plugin) => plugin.rollDice('1d20+2', 'Model crit', 'attack', [20, 20, 7]));
		assert.equal(crit.models, 3, 'the crit dice are the imported model too');
		assert.deepEqual(crit.shown, [20, 20, 7]);
		assert.equal(crit.segmentsMs.length, 3, 'two dice explode out of the ones before them');
		assert.equal(crit.effects, 2, 'one burst per explosion');
		await diceReset(o, { perDie: { d20: 'set:test-glow' } });
		// Sizes the set doesn't have fall back to the look's colours.
		const d6 = await throwAndLand(o, (app, plugin) => plugin.rollLookPreview('set:test-glow', [1, 2, 3, 4, 5, 6]));
		assert.equal(d6.models, 1, 'only the d20 is a model');
		assert.deepEqual(d6.shown, [1, 2, 3, 4, 5, 6]);
	}
	// By link: a module.json whose download is the zip (how The Rollsmith delivers sets).
	const server = createServer((req, res) => {
		if (req.url === '/module.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'linked-glow', download: `http://127.0.0.1:${server.address().port}/set.zip` })); return; }
		if (req.url === '/set.zip') { res.setHeader('content-type', 'application/zip'); res.end(testDiceZip('linked-glow')); return; }
		res.statusCode = 404; res.end();
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	try {
		await o.eval((app, plugin) => plugin.openSettings());
		await o.page.locator('.nimble-dice-import-url').fill(`http://127.0.0.1:${server.address().port}/module.json`);
		await o.page.locator('.nimble-dice-import button', { hasText: 'Import link' }).click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.settings.dice.sets.some(s => s.id === 'linked-glow')), { what: 'the linked set', timeout: 15000 });
		// A link that isn't a dice set says so.
		await o.page.locator('.nimble-dice-import-url').fill(`http://127.0.0.1:${server.address().port}/nothing`);
		await o.page.locator('.nimble-dice-import button', { hasText: 'Import link' }).click();
		await o.waitFor(async () => (await notices(o)).some(n => /Couldn't import/.test(n)), { what: 'the error notice' });
	} finally { server.close(); }
	// Removing a set deletes its files and its look.
	await o.page.locator('.nimble-dice-set').first().locator('button', { hasText: 'Edit' }).click();
	assert.equal(await o.page.locator('.nimble-dice-editor-name').innerText(), 'Test Glow');
	await o.page.locator('.nimble-dice-editor-actions button', { hasText: 'Remove set' }).click();
	await o.page.locator('.modal-container').last().locator('button', { hasText: exact('Delete') }).click();
	await o.waitFor(() => o.eval(async (app, plugin) => !plugin.settings.dice.sets.some(s => s.id === 'test-glow') && !(await app.vault.adapter.exists(`${plugin.manifest.dir}/dice-sets/test-glow`))), { what: 'the set to go' });
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.perDie.d20 ?? ''), '', 'nothing points at the removed set');
	await o.eval(async (app, plugin) => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		plugin.settings.dice.sets = plugin.settings.dice.sets.filter(s => s.id !== 'linked-glow');
		plugin.settings.dice.styles = plugin.settings.dice.styles.filter(s => !/glow/.test(s.id));
		await plugin.saveSettings();
	});
	await diceReset(o);
});

test('Dice import: a Dice So Nice export brings over your looks and saves', async (o) => {
	await diceReset(o);
	await o.eval(async (app, plugin) => { plugin.settings.dice.styles = []; await plugin.saveSettings(); });
	await o.eval((app, plugin) => plugin.openSettings());
	const exportJson = {
		appearance: {
			global: { labelColor: '#ffffff', diceColor: '#7a1f1f', outlineColor: '#000000', edgeColor: '#7a1f1f', colorset: 'custom', texture: 'marble', material: 'glass', font: 'auto', system: 'standard' },
			d20: { labelColor: '#ffd700', diceColor: '#101010', outlineColor: '#000000', edgeColor: '#101010', colorset: 'custom', texture: 'stars', material: 'pristine', font: 'auto', system: 'standard' },
		},
		saves: { 'Wood night': { appearance: { global: { labelColor: '#111111', diceColor: '#a0522d', texture: 'wood', material: 'wood', font: 'Georgia', system: 'standard' } } } },
	};
	const chooser = o.page.waitForEvent('filechooser');
	await o.page.locator('.nimble-dice-import button', { hasText: 'Import file…' }).click();
	await (await chooser).setFiles([{ name: 'fvtt-dicesonice-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportJson)) }]);
	await o.waitFor(() => o.eval((app, plugin) => plugin.settings.dice.styles.length === 3), { what: 'the looks to import' });
	const styles = await o.eval((app, plugin) => plugin.settings.dice.styles.map(s => [s.name, s.body[0], s.finish, s.texture]));
	assert.deepEqual(styles, [['Dice So Nice', '#7a1f1f', 'glass', 'marble'], ['Dice So Nice (d20)', '#101010', 'pristine', 'stars'], ['Wood night', '#a0522d', 'wood', 'wood']]);
	await o.page.locator('.nimble-dice-card', { hasText: 'Wood night' }).waitFor();
	// Bad file: a clear message, nothing added.
	const chooser2 = o.page.waitForEvent('filechooser');
	await o.page.locator('.nimble-dice-import button', { hasText: 'Import file…' }).click();
	await (await chooser2).setFiles([{ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }]);
	await o.waitFor(async () => (await notices(o)).some(n => /no Dice So Nice appearance/.test(n)), { what: 'the error notice' });
	await o.eval(async (app, plugin) => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click());
		plugin.settings.dice.styles = [];
		await plugin.saveSettings();
	});
	await diceReset(o);
});

test('no console errors during the run', async (o) => {
	const errors = o.consoleErrors.filter(e => !/net::ERR_|favicon/.test(e));
	assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------

const selected = tests.filter(t => !filter || t.name.includes(filter));
// 3D dice are off for the general run (notices would wait for them to land); one test turns them on.
const o = await launchObsidian({ settings: { dice3d: false } });
await o.page.setViewportSize?.({ width: 1400, height: 900 }).catch(() => {});
let failed = 0;
const started = Date.now();
for (const t of selected) {
	const t0 = Date.now();
	try {
		await t.fn(o);
		console.log(`  ✓ ${t.name} (${Date.now() - t0}ms)`);
	} catch (e) {
		failed++;
		const file = join(ARTIFACTS, `FAIL-${t.name.replace(/[^a-z0-9]+/gi, '-')}.png`);
		await o.page.screenshot({ path: file }).catch(() => {});
		console.log(`  ✗ ${t.name}\n      ${String(e.message).split('\n').join('\n      ')}\n      screenshot: ${file}`);
	}
}
await o.close();
console.log(`\n${selected.length - failed}/${selected.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
