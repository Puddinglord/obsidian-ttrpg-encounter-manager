// End-to-end tests: drives a real, isolated Obsidian with the built plugin.
//
//   npm run test:e2e              build, then run every test
//   node e2e/run.mjs hover        run tests whose name contains "hover"
//   KEEP_E2E=1 node e2e/run.mjs   keep the temp vault for inspection
//
// Screenshots of failures (and a few showcase shots) go to e2e/artifacts/.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { launchObsidian } from './harness.mjs';
import { pillOffenders, PILL_SELECTORS } from './align.mjs';
import { createServer } from 'node:http';
import { strToU8, zipSync } from 'fflate';

const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), 'artifacts');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
		const view = plugin.runtime('nimble').getEncounterView();
		if (view) {
			view.prompts = [];
			view.viewingCreatureId = null;
			view.expanded?.clear();
			view.flash?.clear();
		}
		plugin.runtime('nimble').encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
		await plugin.runtime('nimble').activateEncounterView(false);
		// The tracker in view (a test run on its own starts with the sidebar folded).
		app.workspace.rightSplit.expand();
		const leaf = app.workspace.getLeavesOfType('nimble-encounter-tracker')[0];
		if (leaf) await app.workspace.revealLeaf(leaf);
	}, party);
	await o.page.waitForTimeout(150);
}

const creatures = (o) => o.eval((app, plugin) => (plugin.runtime('nimble').encounters.active?.creatures || []).map(c => ({
	label: c.label, side: c.side, hp: c.currentHp, max: c.maxHp, conditions: c.conditions, done: !!c.done,
	alive: c.alive, count: c.count, wounds: c.wounds, armor: c.monster.armor, lastStand: !!c.lastStand,
})));
const encounter = (o) => o.eval((app, plugin) => {
	const e = plugin.runtime('nimble').encounters.active;
	return e && { name: e.name, round: e.round, phase: e.phase, sourcePath: e.sourcePath };
});
const notices = (o) => o.page.evaluate(() => [...document.querySelectorAll('.notice')].map(n => n.innerText));
const exact = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** The tracker row for a combatant, by its exact label. */
const card = (o, label) => o.page.locator(`${T} .creature-item`).filter({ has: o.page.locator('.creature-label', { hasText: exact(label) }) });

/** Type into a combatant's HP box, like a GM would: click the HP, type, Enter. */
async function typeHp(o, label, value) {
	// A hero before the fight is an Initiative row: their HP is on their card.
	if (!(await card(o, label).locator('.hp-display').count())) await onCard(o, label);
	await card(o, label).locator('.hp-display').click();
	await o.page.keyboard.type(value);
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(120);
}

/** Pick an item from a combatant's menu: the card's ⋯, or a right-click on their row. */
async function creatureMenu(o, label, item) {
	const c = card(o, label);
	const more = c.locator('.creature-more');
	if (await more.count()) await more.click();
	else await c.locator('.creature-label').click({ button: 'right' });
	await o.page.locator('.menu .menu-item', { hasText: item }).first().click();
	await o.page.waitForTimeout(100);
}

/** Put a combatant on the tracker's card (a tap on their row), as the GM does; returns the card. */
async function onCard(o, label) {
	const c = card(o, label);
	if (!(await c.evaluate(el => el.classList.contains('ev-card')).catch(() => false))) {
		await c.locator('.creature-label').click();
		await o.waitFor(async () => (await o.page.locator(`${T} .ev-card .creature-label`, { hasText: exact(label) }).count()) === 1, { what: `${label} on the card` });
	}
	return card(o, label);
}

/** The tracker's main button (Done, Next, Monsters' turn…) and Back. */
const mainButton = (o) => o.page.locator(`${T} .ev-foot .round-action`);
/** A condition in the picker, by name (each row also says what it does). */
const pickOption = (o, name) => o.page.locator(`.condition-picker .condition-option[aria-label="${name}"]`);

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
	assert.ok(await o.eval((app, plugin) => plugin.runtime('nimble').index.bundledCount) >= 500, 'bundled bestiary loaded');
});

test('regular stat block renders kicker, badges, abilities and attacks', async (o) => {
	await o.openFile('Bestiary/Goblin Boss.md');
	const info = await o.page.evaluate((R) => {
		const b = document.querySelector(`${R} .nimble-statblock`);
		return {
			look: b.classList.contains('ev-sys-nimble'),
			kicker: b.querySelector('.monster-kicker')?.textContent,
			name: b.querySelector('.monster-name')?.textContent,
			badges: [...b.querySelectorAll('.monster-badges .badge-value')].map(x => x.textContent),
			saves: b.querySelector('.saves-badge')?.getAttribute('aria-label'),
			triangles: [...b.querySelectorAll('.saves-badge .save-mark')].map(s => `${s.textContent}${'▲'.repeat(s.querySelectorAll('.nb-tri.is-up').length)}${'▼'.repeat(s.querySelectorAll('.nb-tri.is-down').length)}`),
			armorTitle: b.querySelector('.armor-badge')?.getAttribute('aria-label'),
			ability: b.querySelector('.ability-item')?.textContent,
			multi: b.querySelector('.multiattack')?.textContent,
			attacks: [...b.querySelectorAll('.actions-list li')].map(li => li.textContent),
			damage: [...b.querySelectorAll('.actions-list .monster-damage-type')].map(d => d.getAttribute('aria-label')),
			hasAdd: !!b.querySelector('.add-btn'),
			// The GM's Guide's box: cut corners drawn by a border image, never a clip-path.
			frame: getComputedStyle(b).borderImageSource.startsWith('url('),
		};
	}, R);
	assert.ok(info.look, 'the block wears Nimble\'s look');
	assert.equal(info.name, 'Goblin Boss');
	// Name and level inline, as the book prints a regular monster ("Lvl 2, small humanoid" in small caps).
	assert.equal(info.kicker, 'Lvl 2, Small Humanoid');
	// HP in the heart, the armor letter on its shield; speed 6 is the default, so it's left off.
	assert.deepEqual(info.badges, ['36', 'M']);
	assert.equal(info.saves, 'Saves: STR+ DEX++ WIL−');
	assert.deepEqual(info.triangles, ['STR▲', 'DEX▲▲', 'WIL▼']);
	assert.deepEqual(info.damage, ['Slashing damage', 'Piercing damage']);
	assert.ok(info.frame);
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
			fireIcon: b.querySelector('.monster-defenses .monster-damage-type')?.getAttribute('aria-label'),
			// The after-each-hero actions beside Bloodied and Last Stand, at a note's width.
			split: getComputedStyle(b.querySelector('.monster-body')).gridTemplateColumns.split(' ').length,
		};
	}, R);
	assert.ok(info.role);
	assert.equal(info.kicker, 'Level 7 Solo · Large · Dragon');
	assert.equal(info.name, 'Young Dragon');
	assert.deepEqual(info.badges, ['120', 'H', '8, fly 16']);
	assert.match(info.defenses, /Resistant Fire/);
	assert.equal(info.fireIcon, 'Fire damage');
	assert.match(info.defenses, /Senses Blindsight 6 spaces/);
	// The book's words: "Actions: after each hero's turn, choose one", never "Solo:" or "Legendary:".
	assert.match(info.intro, /^Actionsafter each hero's turn, choose one$/);
	assert.match(info.bloodied, /^BloodiedFire Breath recharges/);
	assert.match(info.lastStand, /^Last StandThe dragon lashes out/);
	assert.equal(info.split, 2);
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
	assert.ok(await o.eval((app, plugin) => !!plugin.runtime('nimble').index.get('Tilde Toad')));
});

test('stat block hints: a quiet line under a hand-written block, opening into fixes', async (o) => {
	await o.openFile('Hand-written Bear.md');
	const box = o.page.locator(`${R} .nimble-issues`);
	await box.waitFor();
	// The forgiving reader still shows the bear's attacks and Bloodied.
	assert.equal(await o.page.locator(`${R} .nimble-statblock .actions-list li`).count(), 3);
	assert.match(await o.page.locator(`${R} .nimble-statblock .phase-section`).first().textContent(), /bite as a free action/);
	assert.match(await box.locator('.nimble-issues-summary').textContent(), /3 lines here aren't shown as written/);
	assert.equal(await box.locator('.nimble-issues-list').isVisible(), false);
	await box.locator('.nimble-issues-toggle').click();
	assert.equal(await box.locator('.nimble-issue').count(), 3);
	assert.deepEqual(await box.locator('.nimble-issue-line mark').allTextContents(), ['movment', '**Bite']);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-statblock-hints.png') });
	await box.locator('.nimble-issue-fix', { hasText: 'Change to movement:' }).click();
	await o.page.waitForTimeout(600);
	const text = await o.eval((app) => app.vault.adapter.read('Hand-written Bear.md'));
	assert.match(text, /\nmovement: 6\/10 charge {13}# e\.g\. 8, fly 10\n/);
	// Re-rendered: two left, and the list stays open.
	await o.page.locator(`${R} .nimble-issues.is-open .nimble-issue`).nth(1).waitFor();
	assert.equal(await o.page.locator(`${R} .nimble-issues .nimble-issue`).count(), 2);
});

test('monster builder: a quick build makes a note with a clean stat block', async (o) => {
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
	const B = '.modal.nimble-entity-builder';
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Quick Bear');
	// One level up from the party's (1), then Create from the first step.
	await o.page.locator(`${B} button[aria-label="Higher level"]`).click();
	assert.equal(await o.page.locator(`${B} .eb-level-value`).textContent(), '2');
	assert.match(await o.page.locator(`${B} .eb-preview .nimble-statblock`).textContent(), /Quick Bear/);
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const text = await o.eval((app) => app.vault.adapter.read('Bestiary/Quick Bear.md'));
	assert.match(text, /^---\nnimble: monster\nlevel: "2"\nrole: regular\n---/);
	assert.match(text, /```nimble\nname: Quick Bear\nlevel: 2\nsize: Medium\nhp: 31\nattacks:\n- \*\*Strike\.\*\* 1d8\+6\.\n```/);
	// The new note opens in the editor (Live Preview), its block rendered there.
	const leaf = '.workspace-leaf.mod-active';
	await o.page.locator(`${leaf} .nimble-statblock >> visible=true`).first().waitFor();
	assert.equal(await o.page.locator(`${leaf} .nimble-issues`).count(), 0);
	assert.ok(await o.eval((app, plugin) => !!plugin.runtime('nimble').index.get('Quick Bear')));
});

test('monster builder: a solo from a template, re-levelled, with stats typed first', async (o) => {
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
	const B = '.modal.nimble-entity-builder';
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Goblin Warlord');
	await o.page.locator(`${B} input[data-field="Copy a monster"]`).fill('goblin boss');
	await o.page.locator(`${B} .eb-search-row.is-selected`, { hasText: 'Goblin Boss' }).waitFor();
	await o.page.keyboard.press('Enter');
	await o.page.locator(`${B} .eb-template`).waitFor();
	assert.equal(await o.page.locator(`${B} .eb-panel.is-active input`).first().inputValue(), 'Goblin Warlord');
	await o.page.locator(`${B} .eb-seg-btn`, { hasText: 'Solo' }).click();
	// Stats first: type HP per hero, and the level check says what it plays like.
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Toughness' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input[data-field="HP"]`).fill('44');
	await o.page.waitForTimeout(150);
	assert.match(await o.page.locator(`${B} .eb-check-value`).textContent(), /level 4/);
	await o.page.locator(`${B} .eb-check-fix`).click();
	// The template's attacks move up with it, and the check settles on a level that agrees.
	await o.page.locator(`${B} .eb-verdict`, { hasText: /^Right for level \d+$/ }).waitFor();
	assert.equal(await o.page.locator(`${B} .eb-check-fix`).count(), 0);
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Review' }).click();
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-monster-builder.png') });
	await o.page.locator(`${B} .eb-next`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const text = await o.eval((app) => app.vault.adapter.read('Bestiary/Goblin Warlord.md'));
	assert.match(text, /role: solo\n/);
	assert.match(text, /saves: STR\+ DEX\+\+ WIL-/); // the Goblin Boss's old-style saves, carried over
	assert.match(text, /hp: 44\/hero/);
	assert.match(text, /actionText: After each hero's turn, choose one:/);
	assert.match(text, /lastStand: Regains \d+ HP per hero and fights on\./);
	await o.page.locator('.workspace-leaf.mod-active .nimble-statblock >> visible=true').first().waitFor();
	assert.equal(await o.page.locator('.workspace-leaf.mod-active .nimble-issues').count(), 0);
});

test('spell and item builders: homebrew lands in a note, renders as a card and joins the compendium', async (o) => {
	const B = '.modal.nimble-entity-builder';
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-spell'));
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Ember Lash');
	await o.page.locator(`${B} button[aria-label="Higher tier"]`).click();
	assert.equal(await o.page.locator(`${B} .eb-tier-value`).textContent(), 'Tier 2');
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const spell = await o.eval((app) => app.vault.adapter.read('Homebrew/Ember Lash.md'));
	assert.match(spell, /```nimble-spell\nname: Ember Lash\nschool: Fire\ntier: 2\nactions: 2 Actions\nrange: Range 8\ndamage: \S+\nupcast: \+\d+ damage\.\n```/);
	// The tab holds both the reading view and the editor, so only one card is on screen.
	await o.page.locator('.workspace-leaf.mod-active .nimble-homebrew .nimble-cmp-card:visible').first().waitFor();
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').compendium.spell('Ember Lash')?.tier === 2), { what: 'the spell in the compendium' });

	// An item from the switch at the top of the same dialog.
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-spell'));
	await o.page.locator(`${B} .eb-kind`, { hasText: 'Item' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Lantern of Echoes');
	await o.page.locator(`${B} .eb-seg-btn`, { hasText: /^Rare$/ }).click();
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Details' }).click();
	await o.page.locator(`${B} .eb-panel.is-active textarea`).fill('Replays the last minute of sound.');
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const item = await o.eval((app) => app.vault.adapter.read('Homebrew/Lantern of Echoes.md'));
	assert.match(item, /category: magic\nrarity: rare\ncost: 500 gp\ntext: Replays the last minute of sound\./);
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').compendium.item('Lantern of Echoes')?.rarity === 'rare'), { what: 'the item in the compendium' });
});

test('builder ways in: Edit on a block writes it back, /new-spell builds in place, the compendium has New', async (o) => {
	const B = '.modal.nimble-entity-builder';
	// Edit a hand-written stat block: change its HP, Save writes the block back.
	const goblin = await o.eval((app) => app.vault.adapter.read('Bestiary/Goblin.md'));
	await o.openFile('Bestiary/Goblin.md');
	const block = o.page.locator(`${R} .block-language-nimble`).first();
	await block.hover();
	await block.locator('.nimble-block-edit').click();
	await o.page.locator(B).waitFor();
	assert.equal(await o.page.locator(`${B} .eb-panel.is-active input`).first().inputValue(), 'Goblin');
	assert.equal(await o.page.locator(`${B} input[data-field="Copy a monster"]`).count(), 0); // editing, not copying
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Toughness' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input[data-field="HP"]`).fill('14');
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	await o.waitFor(async () => /\nhp: 14\n/.test(await o.eval((app) => app.vault.adapter.read('Bestiary/Goblin.md'))), { what: 'the block written back' });
	assert.match(await o.eval((app) => app.vault.adapter.read('Bestiary/Goblin.md')), /^# Goblin\n\n```nimble\nname: Goblin\n/);
	// Later tests count on the fixture's Goblin (12 HP).
	await o.eval((app, _p, text) => app.vault.adapter.write('Bestiary/Goblin.md', text), goblin);
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.get('Goblin')?.monster.hp === 12), { what: 'the Goblin back to 12 HP' });

	// /new-spell in a note: the builder, then the block lands where the slash was.
	await o.eval(async (app) => { await app.vault.create('Spellbook.md', 'Spells:\n'); });
	await o.openFile('Spellbook.md', 'source');
	await o.eval((app) => { const e = app.workspace.activeEditor.editor; e.focus(); e.setCursor({ line: 1, ch: 0 }); });
	await o.page.keyboard.type('/new-spell', { delay: 20 });
	await o.page.keyboard.press('Enter');
	await o.page.locator(B).waitFor();
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Frost Nip');
	// Other: a full-width field for the school's name, focused; a core school hides it again.
	await o.page.locator(`${B} .eb-seg-btn`, { hasText: 'Other' }).click();
	const schoolName = o.page.locator(`${B} input[data-field="School name"]`);
	await schoolName.waitFor();
	// Focus moves on the next tick, after the field shows.
	await o.waitFor(async () => (await o.page.evaluate(() => document.activeElement?.getAttribute('data-field'))) === 'School name', { what: 'the school name field focused', timeout: 3000 });
	await schoolName.fill('Shadow');
	assert.match(await o.page.locator(`${B} .eb-preview .nimble-cmp-detail`).textContent(), /^Shadow · /);
	await o.page.locator(`${B} .eb-seg-btn`, { hasText: 'Ice' }).click();
	assert.equal(await schoolName.isVisible(), false);
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	await o.waitFor(async () => /```nimble-spell\nname: Frost Nip\nschool: Ice\n/.test(await o.eval((app) => app.workspace.activeEditor.editor.getValue())), { what: 'the spell block in the note' });

	// The compendium's New button opens the builder for the tab you're on.
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:open-bestiary'));
	await o.page.locator('.nimble-cmpx-new').first().waitFor();
	await o.page.locator('.nimble-cmpx-new').first().click();
	await o.page.locator(B).waitFor();
	assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).textContent(), 'Monster');
	await o.page.keyboard.press('Escape');
	await o.page.locator(B).waitFor({ state: 'detached' });
});

test('builder Edit on spell and item blocks: one change is written back, the rest stays as written', async (o) => {
	const B = '.modal.nimble-entity-builder';
	// Fields the builder has no control for (Reaction, Touch, class, a wand, "varies", slots) and no damage or price.
	const spell = ['name: Ward', 'school: Wind', 'tier: 1', 'actions: Reaction', 'range: Touch', 'class: Mage', 'source: My book', 'text: +2 armor until your next turn.'];
	const item = ['name: Wand of Sparks', 'category: wand', 'subcategory: arcane', 'rarity: varies', 'range: 8', 'slots: 1', 'charges: 3', 'source: Mine', 'text: Shoots sparks.'];
	await o.eval(async (app, _p, [s, i]) => {
		await app.vault.create('Edit Spell.md', `# Ward\n\n\`\`\`nimble-spell\n${s}\n\`\`\`\n`);
		await app.vault.create('Edit Item.md', `# Wand\n\n\`\`\`nimble-item\n${i}\n\`\`\`\n`);
	}, [spell.join('\n'), item.join('\n')]);
	const edit = async (path, lang) => {
		await o.openFile(path);
		const block = o.page.locator(`${R} .block-language-${lang}`).first();
		await block.waitFor();
		await block.hover();
		await block.locator('.nimble-block-edit').click();
		await o.page.locator(B).waitFor();
	};

	// The spell: concentration on the Casting step.
	await edit('Edit Spell.md', 'nimble-spell');
	assert.equal(await o.page.locator(`${B} .eb-panel.is-active input`).first().inputValue(), 'Ward');
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Casting' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input[data-field="Concentration"]`).fill('up to 1 minute');
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const wantSpell = [...spell.slice(0, 5), 'concentration: up to 1 minute', ...spell.slice(5)].join('\n');
	await o.waitFor(async () => (await o.eval((app) => app.vault.adapter.read('Edit Spell.md'))).includes(`\`\`\`nimble-spell\n${wantSpell}\n\`\`\``), { what: 'the spell written back with only concentration added' });
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').compendium.spell('Ward')?.actions === 'Reaction'), { what: 'the edited spell in the compendium' });

	// The item: a price on the Details step.
	await edit('Edit Item.md', 'nimble-item');
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Details' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input[data-field="Price"]`).fill('40 gp');
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const wantItem = [...item.slice(0, 7), 'cost: 40 gp', ...item.slice(7)].join('\n');
	await o.waitFor(async () => (await o.eval((app) => app.vault.adapter.read('Edit Item.md'))).includes(`\`\`\`nimble-item\n${wantItem}\n\`\`\``), { what: 'the item written back with only its price added' });
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').compendium.item('Wand of Sparks')?.category === 'wand'), { what: 'the edited item in the compendium' });
});

test('builder Edit asks before Save drops lines the block can\'t read', async (o) => {
	const B = '.modal.nimble-entity-builder';
	await o.eval(async (app) => { await app.vault.create('Edit Unread.md', '# Gust\n\n```nimble-spell\nname: Gust\nschool: Wind\ntier: 1\nflavour: very windy\ntext: Pushes.\n```\n'); });
	await o.openFile('Edit Unread.md');
	const block = o.page.locator(`${R} .block-language-nimble-spell`).first();
	await block.waitFor();
	await block.hover();
	await block.locator('.nimble-block-edit').click();
	await o.page.locator(B).waitFor();
	const ask = o.page.locator('.modal', { hasText: 'Save without the lines it can\'t read?' });
	// Keep editing: nothing written, the builder stays open.
	await o.page.locator(`${B} .eb-create`).click();
	await ask.waitFor();
	assert.match(await ask.textContent(), /One line in this block isn't shown as written/);
	await ask.getByRole('button', { name: 'Keep editing' }).click();
	await ask.waitFor({ state: 'detached' });
	assert.equal(await o.page.locator(B).count(), 1);
	assert.match(await o.eval((app) => app.vault.adapter.read('Edit Unread.md')), /flavour: very windy/);
	// Save anyway: written without it.
	await o.page.locator(`${B} .eb-create`).click();
	await ask.getByRole('button', { name: 'Save anyway' }).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	await o.waitFor(async () => !/flavour/.test(await o.eval((app) => app.vault.adapter.read('Edit Unread.md'))), { what: 'the block saved without the unread line' });
	assert.match(await o.eval((app) => app.vault.adapter.read('Edit Unread.md')), /```nimble-spell\nname: Gust\nschool: Wind\ntier: 1\ntext: Pushes\.\n```/);
});

test('monster builder: a minion, with the party level\'s die, joins the tracker as a group', async (o) => {
	const B = '.modal.nimble-entity-builder';
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Pack Rat');
	await o.page.locator(`${B} .eb-seg-btn`, { hasText: /^Minion$/ }).click();
	await o.page.locator(`${B} .eb-create`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	const text = await o.eval((app) => app.vault.adapter.read('Bestiary/Pack Rat.md'));
	assert.match(text, /```nimble\nname: Pack Rat\nrole: minion\nsize: Medium\nminion die: d\d+\nattacks:\n- \*\*\w+\.\*\* 1d\d+ \(follows minion rules\)\.\n```/);
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.get('Pack Rat')?.monster.role === 'minion'), { what: 'the minion in the index' });
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Pack Rat').monster, 'Bestiary/Pack Rat.md', 4));
	const group = await o.eval((app, plugin) => plugin.runtime('nimble').encounters.active?.creatures.map(c => ({ count: c.count, alive: c.alive })));
	assert.deepEqual(group, [{ count: 4, alive: 4 }]);
});

test('builder feedback round: type-to-filter, sliding segments, a die per attack, review fixes, folder pill', async (o) => {
	const B = '.modal.nimble-entity-builder';
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Grave Hound');
	// Type: "und" narrows to the compendium's Undead; ↓ Enter picks it.
	const type = o.page.locator(`${B} input[data-field="Type"]`);
	await type.click();
	await type.pressSequentially('und', { delay: 20 });
	await o.page.locator(`${B} .eb-search-list.is-open .eb-search-row`, { hasText: 'Undead' }).first().waitFor();
	const rows = await o.page.locator(`${B} .eb-search-list.is-open .eb-search-name`).allTextContents();
	await o.page.keyboard.press('ArrowDown');
	await o.page.keyboard.press('ArrowUp');
	await o.page.keyboard.press('Enter');
	assert.equal(await type.inputValue(), rows[0]);
	assert.match(rows[0], /undead/i);
	// The thumb slides under the picked size.
	const thumb = async () => o.page.evaluate(() => { const t = document.querySelector('.modal.nimble-entity-builder .eb-panel.is-active .is-wrap .eb-seg-thumb'); return t && getComputedStyle(t).transform; });
	const before = await thumb();
	await o.page.locator(`${B} .eb-panel.is-active .eb-seg-btn`, { hasText: 'Huge' }).click();
	await o.page.waitForTimeout(350);
	assert.notEqual(await thumb(), before);
	// Role slides too, even though picking it redraws the step: sampled mid-slide, the thumb is between the two.
	const mid = await o.page.evaluate(async () => {
		const seg = () => document.querySelector('.modal.nimble-entity-builder .eb-panel.is-active .eb-seg');
		const x = () => new DOMMatrix(getComputedStyle(seg().querySelector('.eb-seg-thumb')).transform).m41;
		const start = x();
		[...seg().querySelectorAll('.eb-seg-btn')].find(b => b.textContent.includes('Minion')).click();
		await new Promise(r => setTimeout(r, 70));
		const during = x();
		await new Promise(r => setTimeout(r, 400));
		return { start, during, end: x() };
	});
	assert.ok(mid.during > mid.start && mid.during < mid.end, `role thumb slides: ${JSON.stringify(mid)}`);
	await o.page.locator(`${B} .eb-panel.is-active .eb-seg-btn`, { hasText: 'Regular' }).click();
	// No tooltip on the step chips' row, and fields aren't labelled with tooltips.
	assert.equal(await o.page.locator(`${B} .eb-dots[aria-label]`).count(), 0);
	assert.equal(await o.page.locator(`${B} input[aria-label]`).count(), 0);

	// Attacks: each has its own die; removing one asks first.
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Attacks' }).click();
	await o.page.locator(`${B} .eb-panel.is-active .eb-add-row .eb-text-btn`, { hasText: 'Add an attack' }).click();
	const second = o.page.locator(`${B} .eb-panel.is-active .eb-attack`).nth(1);
	await second.locator('.eb-df-die').click();
	await o.page.locator('.menu .menu-item', { hasText: 'd12' }).click();
	assert.match(await second.locator('input.eb-attack-body').inputValue(), /\dd12/);
	assert.match(await o.page.locator(`${B} .eb-panel.is-active .eb-attack`).nth(0).locator('input.eb-attack-body').inputValue(), /\dd8/);
	assert.equal(await second.locator('button[aria-label^="Add 1d12"]').count(), 1);
	await second.locator('.eb-remove').click();
	await o.page.locator('.modal-container .mod-warning, .modal-container button', { hasText: 'Remove' }).last().click();
	await o.page.waitForTimeout(200);
	assert.equal(await o.page.locator(`${B} .eb-panel.is-active .eb-attack`).count(), 1);

	// Review: type tough HP, and the review offers to move the level.
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Toughness' }).click();
	await o.page.locator(`${B} .eb-panel.is-active input[data-field="HP"]`).fill('90');
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Review' }).click();
	// The footer doesn't shift from step to step.
	assert.equal(await o.page.locator(`${B} .eb-next`).evaluate(b => b.getBoundingClientRect().width), 176);
	// A fix that names a field jumps to it, focused, with a glow.
	await o.page.locator(`${B} .eb-panel.is-active .eb-note-fix`, { hasText: 'Add tactics' }).click();
	await o.page.locator(`${B} .eb-panel.is-active .eb-field.eb-nudge`).waitFor();
	assert.equal(await o.page.evaluate(() => document.activeElement?.getAttribute('data-field')), 'Easier');
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Review' }).click();
	const fix = o.page.locator(`${B} .eb-panel.is-active .eb-note.tone-warn .eb-note-fix`, { hasText: /^Make it level/ });
	await fix.waitFor();
	await fix.click();
	await o.page.locator(`${B} .eb-panel.is-active .eb-note.tone-ok`).waitFor();
	assert.match(await o.page.locator(`${B} .eb-panel.is-active .eb-review-value`).nth(1).textContent(), /^90 HP · Armor: None$/);
	// Saved in: a pill that opens into a folder picker.
	await o.page.locator(`${B} .eb-folder-pill`).click();
	const folder = o.page.locator(`${B} input[data-field="Folder"]`);
	await folder.fill('Bestiary/Undead');
	await folder.press('Enter');
	assert.equal(await o.page.locator(`${B} .eb-folder-name`).textContent(), 'Undead');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-builder-review.png') });
	await o.page.locator(`${B} .eb-next`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	assert.match(await o.eval((app) => app.vault.adapter.read('Bestiary/Undead/Grave Hound.md')), /hp: 90\n/);
});

test('builder asks before discarding: Cancel, Escape and the x, only once something is filled in', async (o) => {
	const B = '.modal.nimble-entity-builder';
	const ask = '.modal:not(.nimble-entity-builder)';
	// Untouched: Cancel just closes.
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-spell'));
	await o.page.locator(`${B} .eb-back`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	assert.equal(await o.page.locator(ask).count(), 0);
	// Something typed: Cancel asks; Keep building stays.
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-spell'));
	await o.page.locator(`${B} .eb-panel.is-active input`).first().fill('Half a spell');
	await o.page.locator(`${B} .eb-back`).click();
	await o.page.locator(`${ask} .modal-title`, { hasText: 'Discard this new spell?' }).waitFor();
	await o.page.locator(`${ask} button`, { hasText: 'Keep building' }).click();
	await o.page.locator(ask).waitFor({ state: 'detached' });
	assert.equal(await o.page.locator(`${B} .eb-panel.is-active input`).first().inputValue(), 'Half a spell');
	// Escape asks too; Discard closes it.
	await o.page.locator(`${B} .eb-dot`, { hasText: 'Casting' }).click();
	await o.page.keyboard.press('Escape');
	await o.page.locator(`${ask} button`, { hasText: 'Discard' }).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	assert.equal(await o.eval((app) => app.vault.getFiles().some(f => f.basename === 'Half a spell')), false);
	// Editing a block without changing it: the x just closes.
	await o.openFile('Bestiary/Goblin.md');
	const block = o.page.locator(`${R} .block-language-nimble`).first();
	await block.hover();
	await block.locator('.nimble-block-edit').click();
	await o.page.locator(`${B} .modal-close-button`).click();
	await o.page.locator(B).waitFor({ state: 'detached' });
	assert.equal(await o.page.locator(ask).count(), 0);
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
	assert.equal(await o.eval((app, plugin) => plugin.runtime('nimble').index.get('Goblin').filePath), 'Bestiary/Goblin.md');
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
			// The note's block, a size down, in Nimble's look.
			block: [...(el.querySelector('.nimble-statblock')?.classList ?? [])].filter(c => c === 'is-compact' || c === 'ev-sys-nimble').sort(),
		};
	}, PREVIEW);
	assert.deepEqual(p.block, ['ev-sys-nimble', 'is-compact']);
	assert.equal(p.name, 'Krogg, Goblin King');
	assert.match(p.kicker, /^Level 2 Solo/);
	assert.deepEqual(p.actions, ['Add', 'Compendium', 'Copy to vault']);
	assert.equal(p.more, 1, 'Add has a menu (Add several…, tougher, weaker)');
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
		await o.eval((app, plugin) => { plugin.settings.bundledBestiary = false; plugin.runtime('nimble').loadBundledBestiary(); });
		await o.waitFor(() => o.page.evaluate((R) => [...document.querySelectorAll(`${R} .nimble-inline-unresolved`)].some(e => e.dataset.nimbleRef === 'Krogg, Goblin King'), R),
			{ timeout: 3000, what: 'Krogg to go unresolved' });
	} finally {
		await o.eval((app, plugin) => { plugin.settings.bundledBestiary = true; plugin.runtime('nimble').loadBundledBestiary(); });
	}
	await o.waitFor(() => o.page.evaluate((R) => !document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 3000, what: 'Krogg to resolve again' });
});

test('add several: the Add menu asks how many, the field takes keys, Enter adds them', async (o) => {
	await resetEncounter(o);
	await o.openFile('Adventure.md');
	await parkMouse(o);
	const M = '.modal.nimble-count-modal';
	const openDialog = async () => {
		await o.page.locator(`${R} .nimble-inline-name`, { hasText: /^Goblin$/ }).first().hover();
		await o.page.waitForSelector(PREVIEW, { timeout: 2000 });
		await o.page.locator(`${PREVIEW} .statblock-action-more`).click();
		const titles = await menuTitles(o);
		assert.ok(titles.includes('Add several…'), `menu: ${titles.join(', ')}`);
		assert.ok(!titles.includes('Add 2'));
		assert.ok(titles.includes('Add tougher (+1 level)') && titles.includes('Add weaker (−1 level)'));
		await clickMenu(o, 'Add several…');
		await o.page.waitForSelector(M, { timeout: 2000 });
		// The preview steps aside so it doesn't float over the dialog.
		assert.equal(await o.page.locator(PREVIEW).count(), 0);
	};

	await openDialog();
	assert.equal((await o.page.locator(`${M} .modal-title`).textContent()), 'Add Goblin');
	const field = await o.page.evaluate(() => ({ focused: document.activeElement?.classList.contains('nimble-count-input'), value: document.activeElement?.value }));
	assert.deepEqual(field, { focused: true, value: '2' });
	assert.equal(await o.page.locator(`${M} .nimble-count-add`).textContent(), 'Add 2');
	// Escape cancels: nothing added.
	await o.page.keyboard.press('Escape');
	await o.page.waitForSelector(M, { state: 'detached', timeout: 2000 });
	assert.deepEqual(await creatures(o), []);

	await parkMouse(o);
	await openDialog();
	// The 2 is selected, so typing replaces it; arrows step it; − stops at 1.
	await o.page.keyboard.type('4');
	await o.page.keyboard.press('ArrowUp');
	assert.equal(await o.page.inputValue(`${M} .nimble-count-input`), '5');
	await o.page.keyboard.press('ArrowDown');
	assert.equal(await o.page.inputValue(`${M} .nimble-count-input`), '4');
	assert.equal(await o.page.locator(`${M} .nimble-count-add`).textContent(), 'Add 4');
	await o.page.keyboard.press('Enter');
	await o.page.waitForSelector(M, { state: 'detached', timeout: 2000 });
	await o.page.waitForTimeout(200);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Goblin-1', 'Goblin-2', 'Goblin-3', 'Goblin-4']);

	// Tougher: two more, a level up (more HP than the 12 as written).
	await parkMouse(o);
	await openDialog();
	await o.page.locator(`${M} .nimble-count-seg`, { hasText: 'Tougher' }).click();
	assert.equal(await o.page.locator(`${M} .nimble-count-add`).textContent(), 'Add 2 tougher');
	await o.page.locator(`${M} .nimble-count-add`).click();
	await o.page.waitForSelector(M, { state: 'detached', timeout: 2000 });
	await o.page.waitForTimeout(200);
	const all = await creatures(o);
	assert.equal(all.length, 6);
	assert.ok(all.slice(4).every(c => c.max > 12), `tougher HP: ${all.slice(4).map(c => c.max)}`);
	await o.page.keyboard.press('Escape');
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
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.get('Mire Owlbear')?.filePath === 'Bestiary/Mire Owlbear (Swamp).md'), { timeout: 5000, what: 'rename to be indexed' });
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

	// Compendium entries too: `nimble:spell:` limits the list to spells.
	await o.eval((app) => {
		const editor = app.workspace.activeEditor.editor;
		editor.setValue('Cast \n');
		editor.setCursor({ line: 0, ch: 5 });
		editor.focus();
	});
	await o.page.keyboard.type('`nimble:spell:flame d', { delay: 30 });
	await o.waitFor(() => o.page.evaluate(() => document.querySelector('.suggestion-container .nimble-suggestion-name')?.textContent === 'Flame Dart'),
		{ timeout: 3000, what: 'Flame Dart suggested' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), 'Cast `nimble:spell:Flame Dart`');
});

test('inline compendium refs: spells, features, classes and conditions resolve; click opens the card, hover previews it', async (o) => {
	await resetEncounter(o);
	await o.openFile('Compendium refs.md', 'preview');
	const found = `${R} .nimble-inline-ref.nimble-inline-found.is-compendium`;
	await o.waitFor(async () => (await o.page.locator(found).count()) === 10, { timeout: 5000, what: 'ten compendium refs' });
	const info = await o.page.evaluate((R) => ({
		kinds: [...document.querySelectorAll(`${R} .nimble-inline-ref.is-compendium`)].map(e => [...e.classList].find(c => c.startsWith('kind-'))),
		names: [...document.querySelectorAll(`${R} .nimble-inline-ref.is-compendium .nimble-inline-name`)].map(e => e.textContent),
		monsters: [...document.querySelectorAll(`${R} .nimble-inline-found:not(.is-compendium) .nimble-inline-name`)].map(e => e.textContent),
		unresolved: [...document.querySelectorAll(`${R} .nimble-inline-unresolved`)].map(e => e.querySelector('.nimble-inline-name')?.textContent),
	}), R);
	assert.deepEqual(info.kinds, ['kind-feature', 'kind-spell', 'kind-spell', 'kind-class', 'kind-subclass', 'kind-feature', 'kind-feature', 'kind-item', 'kind-ancestry', 'kind-condition']);
	assert.deepEqual(info.names, ['Lay on Hands', 'Flame Dart', 'Flame Dart', 'Oathsworn', 'Oath of Vengeance', 'Blur', 'Blinding Aura', 'Short Sword', 'Dwarf', 'Dazed']);
	assert.deepEqual(info.monsters, ['Goblin'], 'a bare monster name is still a monster');
	assert.deepEqual(info.unresolved, ['Not A Real Spell']);

	// Click: the card in a dialog.
	await o.page.locator(found, { hasText: 'Flame Dart' }).first().locator('.nimble-inline-name').click();
	await o.page.locator('.modal.nimble-cmp-modal').waitFor({ timeout: 3000 });
	assert.match(await o.page.locator('.modal.nimble-cmp-modal').innerText(), /Flame Dart/);
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator('.modal.nimble-cmp-modal').count()) === 0, { what: 'the card to close' });
	// The class page lists the class level by level.
	await o.page.locator(found, { hasText: 'Oathsworn' }).locator('.nimble-inline-name').click();
	await o.page.locator('.modal.nimble-cmp-modal .nimble-cmp-levels').first().waitFor({ timeout: 3000 });
	assert.ok(await o.page.locator('.modal.nimble-cmp-modal .nimble-cmp-level').count() >= 10, 'class levels');
	await o.page.keyboard.press('Escape');

	// Hover: the same card as a preview.
	await parkMouse(o);
	await o.page.locator(found, { hasText: 'Dazed' }).locator('.nimble-inline-name').hover();
	await o.page.waitForSelector(`${PREVIEW}.is-compendium`, { timeout: 3000 });
	assert.match(await o.page.locator(PREVIEW).innerText(), /Dazed/);
	await parkMouse(o);

	// Live Preview renders the same pills.
	await o.openFile('Compendium refs.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 0, ch: 0 }); });
	await o.waitFor(async () => (await o.page.locator(`${S} .nimble-inline-ref.is-compendium`).count()) === 10, { timeout: 5000, what: 'compendium refs in Live Preview' });
	assert.equal(await o.page.locator(`${S} .nimble-inline-unresolved`).count(), 1);
});

// ---------------------------------------------------------------------------
// Compendium (the old Bestiary tab)

const CMP = '.nimble-compendium';
/** Entry rows (not suggestions) in a compendium list. */
const cmpRows = (o, root = CMP) => o.page.locator(`${root} .nimble-cmpx-row[data-id]`);
const cmpNames = (o, root = CMP) => o.page.locator(`${root} .nimble-cmpx-row[data-id] .nimble-cmpx-row-name > span:first-child`).allTextContents();
const cmpRow = (o, name, root = CMP) => cmpRows(o, root).filter({ has: o.page.locator('.nimble-cmpx-row-name > span:first-child', { hasText: exact(name) }) });
/** Finished chips as [key, value] (a chip still waiting for its value isn't one). */
const cmpChips = (o, root = CMP) => o.page.evaluate((root) => [...document.querySelectorAll(`${root} .nimble-cmpx-chip:not(.is-pending)`)]
	.map(c => [c.querySelector('.nimble-cmpx-chip-key')?.textContent ?? '', c.querySelector('.nimble-cmpx-chip-value')?.textContent ?? '']), root);
/** A fresh Compendium tab (a tab left open keeps its tab, chips and search). */
async function openCompendiumTab(o) {
	await o.eval(async (app) => {
		app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach());
		await app.commands.executeCommandById('nimble-gm:open-bestiary');
	});
	await o.page.waitForSelector(`${CMP} .nimble-cmpx-row[data-id]`, { timeout: 5000 });
}
async function closeCompendiumTab(o) {
	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));
}

test('compendium: search, role filter, add to the tracker', async (o) => {
	await resetEncounter(o);
	await openCompendiumTab(o);
	const input = o.page.locator(`${CMP} .nimble-cmpx-input`);
	assert.equal(await o.page.locator(`${CMP} .nimble-cmpx-seg.is-active`).getAttribute('data-segment'), 'adversaries', 'opens on Adversaries');
	const total = Number((await o.page.locator(`${CMP} .nimble-cmpx-count`).textContent()).match(/^(\d+) entries/)?.[1]);
	assert.ok(total >= 525, `count shows every monster (${total})`);
	// The detail pane shows a stat block with an action bar.
	assert.ok(await o.page.locator(`${CMP} .nimble-cmpx-detail .nimble-statblock .statblock-actions`).count());

	await input.fill('krogg');
	await o.waitFor(async () => (await cmpRows(o).count()) === 2, { timeout: 3000, what: 'search to narrow to the two Kroggs' });
	assert.deepEqual(await cmpNames(o), ['Krogg, Goblin King', 'Krogg, Goblin King (GM Guide)']);
	assert.match(await o.page.locator(`${CMP} .nimble-cmpx-count`).textContent(), new RegExp(`^2 of ${total} · best match$`));
	assert.equal(await o.page.locator(`${CMP} .nimble-cmpx-detail .monster-name`).textContent(), 'Krogg, Goblin King');

	// Role filter, typed: it becomes a chip once a space follows it.
	await input.fill('role:legendary ');
	await o.waitFor(async () => (await cmpChips(o)).length === 1, { timeout: 3000, what: 'the role chip' });
	assert.deepEqual(await cmpChips(o), [['Role', 'legendary']]);
	assert.equal(await input.inputValue(), '', 'the filter left the text box');
	await o.page.waitForTimeout(300); // the rest of the rows render in the background
	const legendary = await o.page.evaluate((CMP) => {
		const rows = [...document.querySelectorAll(`${CMP} .nimble-cmpx-row[data-id]`)];
		return {
			n: rows.length,
			allLegendary: rows.every(r => r.querySelector('.nimble-cmpx-row-badge.is-level')?.classList.contains('role-legendary')),
			count: document.querySelector(`${CMP} .nimble-cmpx-count`).textContent,
			groups: [...document.querySelectorAll(`${CMP} .nimble-cmpx-group`)].map(g => g.textContent),
		};
	}, CMP);
	assert.ok(legendary.n > 10 && legendary.n < total, `legendary filter shows ${legendary.n}`);
	assert.ok(legendary.allLegendary, 'every row is legendary');
	assert.equal(legendary.count, `${legendary.n} of ${total} · by level`);
	assert.ok(legendary.groups.length > 1 && legendary.groups.every(g => /^Level \d|^No level$/.test(g)), `grouped by level: ${legendary.groups}`);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-bestiary.png') });

	// Add straight from a row, and two from the page.
	await cmpRow(o, 'Krogg, Goblin King').locator('.nimble-cmpx-row-btn').click();
	await o.page.locator(`${CMP} .nimble-cmpx-chip-x`).click();
	await input.fill('role:minion goblin minion');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-detail .monster-name`).textContent().catch(() => '')) === 'Goblin Minion', { timeout: 3000, what: 'Goblin Minion in the detail pane' });
	assert.deepEqual(await cmpChips(o), [['Role', 'minion']]);
	// Shift-click on the page's Add adds two (the menu's Add several… asks for any number).
	await o.page.locator(`${CMP} .nimble-cmpx-detail .statblock-action`, { hasText: exact('Add') }).click({ modifiers: ['Shift'] });
	await o.page.waitForTimeout(200);
	const list = await creatures(o);
	assert.deepEqual(list.map(c => [c.label, c.count]), [['Krogg, Goblin King-1', undefined], ['Goblin Minion', 2]]);
	assert.equal(list[0].max, 90);
	assert.equal(await card(o, 'Krogg, Goblin King-1').count(), 1);

	// Enter adds the selected monster, Shift+Enter two.
	await o.page.locator(`${CMP} .nimble-cmpx-chip-x`).click();
	await input.fill('goblin boss');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === 'Goblin Boss', { timeout: 3000, what: 'Goblin Boss selected' });
	await o.page.keyboard.press('Shift+Enter');
	await o.waitFor(async () => (await creatures(o)).filter(c => c.label.startsWith('Goblin Boss')).length === 2, { what: 'two bosses from Shift+Enter' });

	await closeCompendiumTab(o);
});

test('compendium: typed filters become chips, Tab completes, Backspace edits, Alt+arrows switch tabs', async (o) => {
	await resetEncounter(o);
	await openCompendiumTab(o);
	const input = o.page.locator(`${CMP} .nimble-cmpx-input`);
	await input.click();
	await input.fill('');
	await o.page.keyboard.type('type:gob', { delay: 20 });
	const sug = o.page.locator(`${CMP} .nimble-cmpx-row.is-suggestion`);
	await o.waitFor(async () => /type:Goblins/.test(await sug.first().textContent().catch(() => '')), { timeout: 3000, what: 'type:Goblins suggested first' });
	assert.equal(await sug.first().locator('.nimble-cmpx-kbd').textContent(), 'Tab', 'the top suggestion shows its key');
	assert.ok(await sug.first().evaluate(el => el.classList.contains('is-selected')), 'a filter being typed selects its completion');
	await o.page.keyboard.press('Tab');
	await o.waitFor(async () => (await cmpChips(o)).length === 1, { timeout: 3000, what: 'the type chip' });
	assert.deepEqual(await cmpChips(o), [['Type', 'Goblins']]);
	assert.equal(await input.inputValue(), '');
	assert.equal(await o.page.evaluate(() => document.activeElement?.classList.contains('nimble-cmpx-input')), true, 'focus stays in the search box');

	// A finished filter (a space after it) turns into a chip too.
	await o.page.keyboard.type('level:1-3 ', { delay: 20 });
	await o.waitFor(async () => (await cmpChips(o)).length === 2, { timeout: 3000, what: 'the level chip' });
	assert.deepEqual(await cmpChips(o), [['Type', 'Goblins'], ['Level', '1-3']]);
	await o.page.waitForTimeout(300);
	const ids = await o.page.evaluate((CMP) => [...document.querySelectorAll(`${CMP} .nimble-cmpx-row[data-id]`)].map(r => r.dataset.id), CMP);
	assert.ok(ids.length >= 3, `some goblins of level 1-3: ${ids.length}`);
	const bad = await o.eval((app, plugin, ids) => {
		const lvl = (v) => { const s = String(v ?? ''); const f = s.match(/^(\d+)\/(\d+)$/); return f ? Number(f[1]) / Number(f[2]) : Number(s); };
		return ids.filter(id => {
			const e = plugin.runtime('nimble').index.all().find(x => `monster:${x.monster.bundledId || `vault:${x.filePath}#${x.name}`}` === id);
			if (!e) return true;
			const types = [e.monster.group, e.monster.type].filter(Boolean).join(' ');
			const l = lvl(e.monster.level);
			return !/goblin/i.test(types) || !(l >= 1 && l <= 3);
		});
	}, ids);
	assert.deepEqual(bad, [], 'every result is a Goblin of level 1-3');
	assert.match(await o.page.locator(`${CMP} .nimble-cmpx-count`).textContent(), new RegExp(`^${ids.length} of \\d+ · by level$`));

	// Backspace in the empty box reopens the last chip: it waits for its value again, with the value in the box to edit.
	await o.page.keyboard.press('Backspace');
	await o.waitFor(async () => (await cmpChips(o)).length === 1, { timeout: 3000, what: 'the level chip to reopen' });
	assert.equal(await o.page.locator(`${CMP} .nimble-cmpx-chip.is-pending`).count(), 1, 'the level chip waits for its value');
	assert.equal(await input.inputValue(), '1-3');
	// Clear the value; Backspace again cancels the waiting chip.
	await o.page.keyboard.press('ControlOrMeta+a');
	await o.page.keyboard.press('Delete');
	await o.page.keyboard.press('Backspace');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-chip.is-pending`).count()) === 0, { timeout: 3000, what: 'the waiting chip cancelled' });
	await o.page.waitForTimeout(150);

	// Alt+→ moves to the next tab (NPCs); Goblins mean nothing there, so the chip goes.
	await o.page.keyboard.press('Alt+ArrowRight');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-seg.is-active`).getAttribute('data-segment')) === 'npcs', { timeout: 3000, what: 'the NPCs tab' });
	assert.deepEqual(await cmpChips(o), [], 'type:Goblins dropped on NPCs');
	await o.page.keyboard.press('Alt+ArrowLeft');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-seg.is-active`).getAttribute('data-segment')) === 'adversaries', { timeout: 3000, what: 'back on Adversaries' });
	// Alt+digit jumps straight to a tab (5 is Spells).
	await o.page.keyboard.press('Alt+5');
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-seg.is-active`).getAttribute('data-segment')) === 'spells', { timeout: 3000, what: 'the Spells tab' });
	await closeCompendiumTab(o);
});

test('compendium art: pick an image for an entry; it shows on the page and as the list icon, and follows a rename', async (o) => {
	await o.eval(async (app) => {
		const c = document.createElement('canvas'); c.width = 64; c.height = 48;
		const g = c.getContext('2d'); g.fillStyle = '#c0392b'; g.fillRect(0, 0, 64, 48);
		const blob = await new Promise(r => c.toBlob(r, 'image/png'));
		if (!app.vault.getAbstractFileByPath('flame-art.png')) await app.vault.createBinary('flame-art.png', await blob.arrayBuffer());
	});
	await o.eval((app, plugin) => plugin.runtime('nimble').openCompendium('spells', 'flame dart'));
	const D = '.nimble-compendium .nimble-cmpx-detail';
	await o.waitFor(async () => (await o.page.locator(`${D} .nimble-cmp-name`).first().textContent().catch(() => '')) === 'Flame Dart', { timeout: 4000, what: 'Flame Dart on the page' });
	assert.equal(await o.page.locator(`${D} .nimble-art-slot:not(.has-art)`).count(), 1, 'an empty art slot');
	await o.page.locator(`${D} .nimble-art-slot`).click();
	await o.page.locator('.menu-item', { hasText: 'Choose from vault' }).click();
	await o.page.keyboard.type('flame-art');
	await o.page.waitForTimeout(250);
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(`${D} .nimble-art-slot.has-art img`).count()) === 1, { timeout: 3000, what: 'the art on the page' });
	assert.equal(await o.page.locator('.nimble-compendium .nimble-cmpx-row[data-id="spell:flamedart"] .nimble-cmpx-row-badge.has-art img').count(), 1, 'the art as the list icon');
	assert.equal(await o.eval((app, plugin) => plugin.settings.compendiumArt['spell:flamedart']), 'flame-art.png');
	await o.eval(async (app) => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('flame-art.png'), 'flame-art-moved.png'); });
	await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.compendiumArt['spell:flamedart'])) === 'flame-art-moved.png', { timeout: 3000, what: 'the link to follow the rename' });
	// Remove it again so other tests see the plain icons.
	await o.page.locator(`${D} .nimble-art-slot`).click();
	await o.page.locator('.menu-item', { hasText: 'Remove art' }).click();
	await o.waitFor(async () => (await o.page.locator(`${D} .nimble-art-slot.has-art`).count()) === 0, { timeout: 3000, what: 'the art removed' });
	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));
});

test('compendium: "lay on hands" finds the Oathsworn feature; the Classes tab shows a class by level', async (o) => {
	await resetEncounter(o);
	await openCompendiumTab(o);
	const input = o.page.locator(`${CMP} .nimble-cmpx-input`);
	await o.page.locator(`${CMP} .nimble-cmpx-seg[data-segment="features"]`).click();
	await input.fill('lay on hands');
	await o.waitFor(async () => (await cmpNames(o))[0] === 'Lay on Hands', { timeout: 3000, what: 'Lay on Hands first' });
	assert.match(await cmpRows(o).first().getAttribute('data-id'), /^feature:oathsworn:/);
	const detail = o.page.locator(`${CMP} .nimble-cmpx-detail`);
	await o.waitFor(async () => (await detail.locator('.nimble-cmp-name').first().textContent().catch(() => '')) === 'Lay on Hands', { timeout: 3000, what: 'the feature card' });
	assert.match(await detail.innerText(), /Oathsworn/);

	await o.page.locator(`${CMP} .nimble-cmpx-seg[data-segment="classes"]`).click();
	await input.fill('oathsworn');
	await o.waitFor(async () => (await cmpNames(o))[0] === 'Oathsworn', { timeout: 3000, what: 'Oathsworn first' });
	await o.waitFor(async () => (await detail.locator('.nimble-cmp-name').first().textContent().catch(() => '')) === 'Oathsworn', { timeout: 3000, what: 'the class page' });
	const levels = await detail.locator('.nimble-cmp-levels .nimble-cmp-level-badge').allTextContents();
	assert.ok(levels.length >= 10 && levels[0] === '1', `levels listed in order: ${levels}`);
	assert.match(await detail.innerText(), /Lay on Hands/);
	await closeCompendiumTab(o);
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
	assert.deepEqual(await o.page.locator(`${T} .ev-sec > .ev-sec-title`).allTextContents(), ['Monsters']);
	assert.equal(await o.page.locator(`${T} .ev-sec > small`).textContent(), '4');
	assert.deepEqual(await o.page.locator(`${T} .creature-label`).allTextContents(), ['Goblin-2', 'Goblin-3', 'Goblin Boss-1', 'Goblin-4']);
	assert.equal(await card(o, 'Goblin Boss-1').locator('.hp-display').textContent(), '36/36');
	// The row: its level, and its armor as the books draw it (the letter in a filled shield).
	assert.equal(await card(o, 'Goblin Boss-1').locator('.nimble-lvl').textContent(), 'L2');
	assert.equal(await card(o, 'Goblin Boss-1').locator('.nimble-armor.is-medium').textContent(), 'M');
	// On the card: "Level 2" and the armor.
	const boss = await onCard(o, 'Goblin Boss-1');
	assert.match(await boss.locator('.creature-meta').textContent(), /Level 2/);
	assert.equal(await boss.locator('.armor-chip.armor-medium').count(), 1, 'armor shows as a badge');
});

test('add-monster search adds from anywhere', async (o) => {
	await resetEncounter(o);
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:add-monster'));
	const M = '.modal.nimble-cmpx-modal';
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`);
	assert.equal(await o.page.locator(`${M} .modal-title`).textContent(), 'Add to the encounter');
	await o.waitFor(() => o.page.evaluate((M) => document.activeElement === document.querySelector(`${M} .nimble-cmpx-input`), M), { timeout: 3000, what: 'the search box focused' });
	await o.page.keyboard.type('young dragon');
	await o.waitFor(() => o.page.evaluate((M) => document.querySelector(`${M} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`)?.textContent === 'Young Dragon', M),
		{ timeout: 3000, what: 'Young Dragon to be the selected result' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Young Dragon-1']);
	assert.equal(await o.page.locator(M).count(), 0, 'Enter adds and closes');
});

test('add monster dialog: "3 goblin minion" makes one minion group', async (o) => {
	await resetEncounter(o);
	const M = '.modal.nimble-cmpx-modal';
	const selected = `${M} .nimble-cmpx-row.is-selected`;
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`, { timeout: 3000 });
	await o.waitFor(() => o.page.evaluate((M) => document.activeElement === document.querySelector(`${M} .nimble-cmpx-input`), M), { timeout: 3000, what: 'the search box focused' });
	await o.page.keyboard.type('3 goblin minion');
	await o.waitFor(() => o.page.evaluate((s) => document.querySelector(`${s} .nimble-cmpx-row-name > span:first-child`)?.textContent === 'Goblin Minion', selected),
		{ timeout: 3000, what: 'Goblin Minion as the first result' });
	assert.match(await o.page.locator(`${selected} .nimble-cmpx-row-pills`).textContent(), /Minion/);
	assert.ok(await o.page.locator(`${selected} .nimble-cmpx-row-badge.role-minion`).count(), 'minion badge');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	const [group] = await creatures(o);
	assert.equal(group.label, 'Goblin Minion');
	assert.equal(group.count, 3);
	assert.equal(group.alive, 3);
	const row = await onCard(o, 'Goblin Minion');
	assert.equal(await row.locator('.minion-pip').count(), 3);
	assert.equal(await row.locator('.minion-pip.is-on').count(), 3);
	assert.equal(await row.locator('.hp-display').textContent(), '3/3');
	assert.match(await row.locator('.group-attack').textContent(), /Group attack ×3/);
	assert.equal(await o.page.locator(M).count(), 0, 'the dialog closes after adding');

	// Unknown names say so.
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`, { timeout: 3000 });
	await o.waitFor(() => o.page.evaluate((M) => document.activeElement === document.querySelector(`${M} .nimble-cmpx-input`), M), { timeout: 3000, what: 'the search box focused' });
	await o.page.keyboard.type('zzz nobody');
	await o.waitFor(async () => /Nothing matches/.test(await o.page.locator(`${M} .nimble-cmpx-empty`).textContent().catch(() => '')), { what: 'the empty state' });

	// Cmd/Ctrl+Enter adds ("2 goblin": two) and keeps the dialog open for the next monster.
	await o.page.keyboard.press('ControlOrMeta+a');
	await o.page.keyboard.type('2 goblin');
	await o.waitFor(() => o.page.evaluate((s) => document.querySelector(`${s} .nimble-cmpx-row-name > span:first-child`)?.textContent === 'Goblin', selected), { timeout: 3000, what: 'Goblin selected' });
	await o.page.keyboard.press('ControlOrMeta+Enter');
	await o.waitFor(async () => (await creatures(o)).filter(c => /^Goblin-\d+$/.test(c.label)).length === 2, { what: 'two goblins' });
	assert.equal(await o.page.locator(M).count(), 1, 'still open after Cmd/Ctrl+Enter');

	// Row buttons: + adds one (Shift: two), and the dialog stays open; the row says how many are in the fight.
	await o.page.keyboard.press('ControlOrMeta+a');
	await o.page.keyboard.type('goblin boss');
	const rowEl = cmpRow(o, 'Goblin Boss', M);
	await rowEl.first().waitFor({ timeout: 3000 });
	await rowEl.first().hover();
	await rowEl.first().locator('.nimble-cmpx-row-btn').click({ modifiers: ['Shift'] });
	await o.waitFor(async () => /2 in fight/.test(await rowEl.first().locator('.nimble-cmpx-infight').textContent()), { what: 'the in-fight badge' });
	assert.equal(await o.page.locator(M).count(), 1, 'still open after adding from a row');
	assert.equal((await creatures(o)).filter(c => c.label.startsWith('Goblin Boss')).length, 2);
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator(M).count()) === 0, { what: 'Escape closes the dialog' });

	// The group attack rolls one die per minion into the roll log.
	await row.locator('.group-attack').click();
	await o.page.waitForTimeout(150);
	const roll = (await o.eval((app, plugin) => plugin.settings.rollLog))[0];
	assert.equal(roll.label, '3 Goblin Minions attack together');
	assert.equal(roll.expression, '3d6');
});

test('turn flow: party, heroes go first in any order, the monsters\' side, the next round, Back', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.page.locator(`${T} .quick-add-party`).click();
	await o.page.waitForTimeout(100);
	await o.page.locator(`${T} .tracker-add-monster`).click();
	await o.page.waitForSelector('.nimble-cmpx-modal .nimble-cmpx-input', { timeout: 3000 });
	await o.waitFor(() => o.page.evaluate(() => document.activeElement?.classList.contains('nimble-cmpx-input')), { timeout: 3000, what: 'the search box focused' });
	await o.page.keyboard.type('3 goblin minion');
	await o.waitFor(() => o.page.evaluate(() => document.querySelector('.nimble-cmpx-modal .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child')?.textContent === 'Goblin Minion'), { timeout: 3000, what: 'add monster results' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(150);
	assert.deepEqual((await creatures(o)).map(c => [c.label, c.side]), [['Aria', 'hero'], ['Bram', 'hero'], ['Goblin Minion', 'monster']]);
	assert.deepEqual(await o.page.locator(`${T} .ev-sec > .ev-sec-title`).allTextContents(), ['Initiative', 'Monsters']);
	assert.equal(await o.page.locator(`${T} .quick-add-party`).count(), 0, 'Party button hides once heroes are in');
	assert.equal((await encounter(o)).phase, 'setup');

	// Initiative typed before the fight sets a hero's first-turn actions (10–19: two).
	await o.page.locator(`${T} .nimble-init-input[aria-label="Aria: Initiative"]`).fill('12');
	await o.page.keyboard.press('Enter');
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').encounters.active.creatures[0].actions === 2), { what: 'two actions from Initiative 12' });

	const action = mainButton(o);
	assert.equal(await action.textContent(), 'Heroes go first');
	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [1, 'heroes']);
	assert.equal(await o.page.locator(`${T} .phase-pill.is-active .phase-pill-text`).textContent(), 'Heroes');
	// Nobody is assumed: the card waits for whoever speaks up, and no hero is marked next.
	assert.equal(await o.page.locator(`${T} .ev-card.is-empty`).count(), 1);
	assert.equal(await o.page.locator(`${T} .side-hero .ev-mark.is-next`).count(), 0);
	assert.equal(await action.textContent(), "Monsters' turn");
	assert.ok(await card(o, 'Goblin Minion').evaluate(el => el.classList.contains('is-waiting')));

	// Bram speaks up first: one tap puts him on the card; Done marks him.
	await onCard(o, 'Bram');
	assert.equal(await action.textContent(), 'Done');
	await action.click();
	assert.equal((await encounter(o)).phase, 'heroes');
	assert.equal(await card(o, 'Bram').locator('.turn-toggle').getAttribute('aria-pressed'), 'true');
	assert.ok(await card(o, 'Bram').evaluate(el => el.classList.contains('is-acted')), 'acted rows look acted');
	assert.match(await o.page.locator(`${T} .phase-pill.phase-heroes .phase-pill-count`).textContent(), /1 of 2 done/);
	// Aria's mark, straight from her row: every hero has gone, so it's the monsters' side, the minions up.
	await card(o, 'Aria').locator('.turn-toggle').click();
	assert.equal((await encounter(o)).phase, 'monsters');
	assert.equal(await o.page.locator(`${T} .phase-pill.is-active .phase-pill-text`).textContent(), 'Monsters');
	assert.ok(await card(o, 'Aria').evaluate(el => el.classList.contains('is-done')));
	assert.equal(await o.page.locator(`${T} .ev-card .creature-label`).textContent(), 'Goblin Minion');
	assert.equal(await action.textContent(), 'Round 2');
	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [2, 'heroes']);
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 2');
	assert.ok((await creatures(o)).every(c => !c.done));
	assert.equal(await o.page.locator(`${T} .turn-toggle.is-done`).count(), 0);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-turns.png') });

	// Back undoes the step: round 1, the minions on the card again.
	await o.page.locator(`${T} .ev-foot-back`).click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [1, 'monsters']);
	assert.equal(await o.page.locator(`${T} .ev-card .creature-label`).textContent(), 'Goblin Minion');
	await action.click();
	assert.equal((await encounter(o)).round, 2);

	// The keys: ↓ moves through the rows, Enter puts one on the card, Space is Done, Z undoes it.
	await o.page.locator(`${T} .creature-item`, { hasText: 'Aria' }).focus();
	await o.page.keyboard.press('ArrowDown');
	assert.equal(await o.page.evaluate(() => document.activeElement?.querySelector('.creature-label')?.textContent), 'Bram');
	await o.page.keyboard.press('Enter');
	assert.equal(await o.page.locator(`${T} .ev-card .creature-label`).textContent(), 'Bram');
	await o.page.locator(`${T} .ev-card`).focus();
	await o.page.keyboard.press(' ');
	await o.waitFor(async () => (await creatures(o)).find(c => c.label === 'Bram').done, { what: 'Space: Bram done' });
	await o.page.locator(`${T} .creature-item`, { hasText: 'Aria' }).focus();
	await o.page.keyboard.press('z');
	await o.waitFor(async () => !(await creatures(o)).find(c => c.label === 'Bram').done, { what: 'Z: undone' });

	// The side switch moves sides by hand.
	await o.page.locator(`${T} .phase-pill.phase-monsters`).click();
	assert.equal((await encounter(o)).phase, 'monsters');
});

test('tracker controls: calculator modes, quick look from the tracker, End and save', async (o) => {
	await resetEncounter(o, { party: PARTY });
	await o.eval(async (app, plugin) => {
		plugin.settings.dice3d = false;
		const id = plugin.runtime('nimble').encounters.ensureActive().id;
		plugin.runtime('nimble').encounters.addParty(id);
		await plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md', 1);
		await plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Krogg, Goblin King').monster, undefined, 1);
	});
	await o.page.waitForTimeout(300);
	const action = o.page.locator(`${T} .round-action`);
	assert.equal(await action.textContent(), 'Heroes go first');
	assert.equal(await o.page.locator(`${T} .turn-segmented`).count(), 0, 'no side switch before combat');

	// Calculator by tapping: starts on Damage, switch to Heal, preview, apply.
	await typeHp(o, 'Aria', '6');
	await (await onCard(o, 'Aria')).locator('.hp-display').click();
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

	// Start: nobody is on the card until a hero speaks up.
	await action.click();
	assert.equal(await action.textContent(), "Monsters' turn");
	assert.equal(await o.page.locator(`${T} .turn-segmented .phase-pill`).count(), 2);
	assert.match(await o.page.locator(`${T} .phase-pill.phase-heroes .phase-pill-count`).textContent(), /0 of 2 done/);
	assert.equal(await o.page.locator(`${T} .ev-card.is-empty`).count(), 1);
	// Aria goes: Done turns the card to the legendary monster, which acts after each hero.
	await onCard(o, 'Aria');
	assert.match(await action.textContent(), /^Done · Krogg acts$/);
	await action.click();
	const beat = o.page.locator(`${T} .ev-card.is-beat`);
	await beat.waitFor({ timeout: 2000 });
	assert.match(await beat.locator('.ev-card-kicker').textContent(), /After Aria's turn/);
	assert.match(await beat.locator('.nimble-card-menu-h').first().textContent(), /After each hero.s turn, choose one/);
	assert.equal(await beat.locator('.nimble-card-act').count(), 2);
	await beat.locator('.nimble-card-act strong', { hasText: 'Crack Skulls' }).click();
	await o.waitFor(async () => (await beat.locator('.nimble-card-act.is-used').count()) === 1, { what: 'the used action marked' });
	assert.equal(await action.textContent(), 'Back to heroes');
	await action.click();
	assert.equal(await o.page.locator(`${T} .ev-card.is-empty`).count(), 1, 'back to the heroes, nobody assumed');
	assert.equal(await o.page.locator(`${T} .tracker-prompt`).count(), 0, 'no legendary helper card any more');

	// The card's stat block button opens their sheet over the tracker, with the fight's state.
	const Q = '.modal.nimble-record-modal';
	const krogg = (await creatures(o)).find(c => c.label.startsWith('Krogg'));
	await (await onCard(o, krogg.label)).locator('.ev-card-sheet').click();
	await o.waitFor(async () => (await o.page.locator(Q).count()) === 1, { what: 'the quick look' });
	assert.equal(await o.page.locator(`${Q} .nimble-statblock .monster-name`).textContent(), 'Krogg, Goblin King');
	assert.match(await o.page.locator(`${Q} .record-sub`).textContent(), /Legendary|Solo/);
	assert.equal(await o.page.locator(`${Q} .record-btn`, { hasText: 'Open in compendium' }).count(), 1);
	// The strip is the sheet's own HP bar (tap it for the calculator), action dots, Wounds and turn pill.
	await o.page.locator(`${Q} .record-strip .ns-meter.is-hp .ns-meter-bar`).click();
	await o.page.keyboard.type('10');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.equal((await creatures(o)).find(c => c.label === krogg.label).hp, krogg.hp - 10, 'HP from the modal');
	await o.waitFor(async () => (await o.page.locator(`${Q} .record-strip .ns-meter-cur`).textContent()) === String(krogg.hp - 10), { what: 'the strip stays live' });
	assert.equal(await o.page.locator(`${Q} .record-strip .ns-action-dot`).count(), 0, 'no action dots for a monster');
	await o.page.locator(`${Q} .record-strip .ns-actions-end`).click();
	assert.equal((await creatures(o)).find(c => c.label === krogg.label).done, true);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator(Q).count(), 0);

	// A hero's quick look: the sheet's round Wound pips (last a skull) and action dots, one step a tap.
	await (await onCard(o, 'Bram')).locator('.ev-card-sheet').click();
	await o.waitFor(async () => (await o.page.locator(`${Q} .record-strip .ns-wounds .ns-pip`).count()) > 0, { what: 'hero pips' });
	assert.equal(await o.page.locator(`${Q} .record-strip .ns-pip.is-skull`).count(), 1);
	await o.page.locator(`${Q} .record-strip .ns-wounds .ns-pip`).first().click();
	await o.waitFor(async () => (await creatures(o)).find(c => c.label === 'Bram').wounds === 1, { what: 'a Wound' });
	await o.page.locator(`${Q} .record-strip .ns-wounds .ns-pip`).last().click();
	await o.waitFor(async () => (await creatures(o)).find(c => c.label === 'Bram').wounds === 2, { what: 'one more Wound, not the skull' });
	const bramActions = () => o.eval((app, plugin) => plugin.runtime('nimble').encounters.active.creatures.find(c => c.label === 'Bram').actions ?? 3);
	const before = await bramActions();
	await o.page.locator(`${Q} .record-strip .ns-action-dot`).first().click();
	await o.waitFor(async () => (await bramActions()) === before - 1, { what: 'one action spent' });
	await o.page.waitForTimeout(600); // the dot shrinks out
	await o.page.locator(`${Q} .record-strip`).screenshot({ path: join(ARTIFACTS, 'quick-look-hero-strip.png') });
	const bad = await o.page.evaluate(pillOffenders, { root: `${Q} .record-strip`, tolerance: 1, selectors: PILL_SELECTORS });
	assert.deepEqual(bad, [], 'misaligned pills in the strip');
	await o.page.keyboard.press('Escape');

	// End combat (the ⋯ menu): no callout, just Resume / New fight. HP is kept.
	const endCombat = async () => { await o.page.locator(`${T} .tracker-more`).click(); await o.page.locator('.menu .menu-item', { hasText: 'End combat' }).click(); await o.page.waitForTimeout(150); };
	await endCombat();
	assert.equal((await encounter(o)).phase, 'setup');
	assert.equal(await o.page.locator(`${T} .tracker-prompt`).count(), 0, 'no "combat over" callout');
	assert.equal(await action.textContent(), 'Resume round 1');
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 7);
	await action.click();
	assert.deepEqual(await encounter(o).then(e => [e.round, e.phase]), [1, 'heroes'], 'resumes where it stopped');
	await endCombat();
	await o.page.locator(`${T} .tracker-new-fight`).click();
	assert.equal(await action.textContent(), "Monsters' turn", 'New fight starts round 1');
	assert.equal((await encounter(o)).round, 1);

	// Save the fight to a note; the note resumes it, and the source block offers Resume.
	await o.eval(async (app, plugin) => {
		for (const f of ['Fights/Saved fight test.md', 'Saved fight test.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		await app.vault.create('Saved fight test.md', '```nimble-encounter\nname: Current Encounter\nmonsters:\n- 1 Goblin\n```\n');
		plugin.runtime('nimble').encounters.active.sourcePath = 'Saved fight test.md';
	});
	await o.page.locator(`${T} .tracker-more`).click();
	await o.page.locator('.menu .menu-item', { hasText: 'Save fight to a note' }).click();
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
	// There's a fight with damage in the tracker, so it asks before replacing it; Cancel leaves it alone.
	const replace = o.page.locator('.modal-container .modal', { hasText: 'Replace "Current Encounter"?' });
	await replace.waitFor();
	await replace.locator('button', { hasText: exact('Cancel') }).click();
	await o.page.waitForTimeout(200);
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 2, 'cancelled: the fight in the tracker is untouched');
	await resume.click();
	await replace.waitFor();
	await replace.locator('button', { hasText: exact('Replace') }).click();
	await o.page.waitForTimeout(300);
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 7, 'restored from the save');
	await o.openFile('Fights/Saved fight test - Current Encounter.md', 'preview');
	assert.equal(await o.page.locator(`${R} .nimble-fight-card .nimble-fight-resume`).count(), 1, 'the note renders a Resume card');
});

test('typed damage, healing and set; invalid input is flagged', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster, 'Bestiary/Goblin.md'));
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
		plugin.runtime('nimble').encounters.addParty();
		plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md');
		plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin Minion').monster, undefined, 3);
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
	await onCard(o, 'Goblin Minion');
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
	await onCard(o, 'Aria');
	assert.equal(await card(o, 'Aria').locator('.wound-pip.is-on').count(), 1);
	assert.equal(await card(o, 'Aria').locator('.wound-pip').count(), 6);
	assert.match(await card(o, 'Aria').locator('.nimble-card-dying').textContent(), /Dying · 1 of 6 Wounds/);
	// Hit again while Dying: two more Wounds (three on a crit).
	await typeHp(o, 'Aria', '3');
	aria = (await creatures(o)).find(c => c.label === 'Aria');
	assert.equal(aria.wounds, 3);
	assert.equal(await card(o, 'Aria').locator('.wound-pip.is-on').count(), 3);
	// Healing ends Dying.
	await typeHp(o, 'Aria', '+4');
	assert.equal((await creatures(o)).find(c => c.label === 'Aria').hp, 4);
	assert.equal(await card(o, 'Aria').locator('.nimble-card-dying').count(), 0);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-damage.png') });
});

test('conditions: add from picker, Escape closes it, remove with ×', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
	const row = await onCard(o, 'Goblin-1');
	await row.locator('.add-condition-btn').click();
	await pickOption(o, 'Prone').click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Prone' }]);
	assert.equal(await o.page.locator('.condition-picker').count(), 0);
	await row.locator('.add-condition-btn').click();
	assert.equal(await o.page.locator('.condition-picker').count(), 1);
	assert.equal(await o.page.locator('.condition-picker .condition-option.is-applied[aria-label="Prone"]').count(), 1);
	// Each row says what the condition does, in a line.
	assert.match(await pickOption(o, 'Prone').locator('.condition-option-text small').textContent(), /\w/);
	// The search box has focus, and typing filters the list.
	await o.waitFor(() => o.page.evaluate(() => document.activeElement?.classList.contains('condition-search')), { timeout: 2000, what: 'condition search to take focus' });
	await o.page.keyboard.type('fri');
	assert.deepEqual(await o.page.locator('.condition-picker .condition-option-name').allTextContents(), ['Frightened']);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator('.condition-picker').count(), 0);
	await row.locator('.condition-tag', { hasText: 'Prone' }).locator('.remove-condition').click();
	assert.deepEqual((await creatures(o))[0].conditions, []);
});

test('conditions: durations count down at end of turn, X values, chip editor', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
	let row = await onCard(o, 'Goblin-1');

	// Dazed for 1 round.
	await row.locator('.add-condition-btn').click();
	await o.page.locator('.condition-picker .nimble-segmented button', { hasText: '1 rd' }).click();
	assert.equal(await o.page.locator('.condition-picker .nimble-segmented button.is-active').textContent(), '1 rd');
	await pickOption(o, 'Dazed').click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Dazed', rounds: 1 }]);
	const dazed = row.locator('.condition-tag', { hasText: 'Dazed' });
	assert.equal(await dazed.locator('.condition-rounds').textContent(), '1');
	// Ending the goblin's turn wears it off.
	await creatureMenu(o, 'Goblin-1', 'Mark turn done');
	assert.deepEqual((await creatures(o))[0].conditions, []);
	assert.equal(await row.locator('.condition-tag:not(.auto-condition)').count(), 0);
	assert.ok((await notices(o)).some(n => /Goblin-1: Dazed wore off/.test(n)));

	// Empowered asks for X.
	row = await onCard(o, 'Goblin-1');
	await row.locator('.add-condition-btn').click();
	await pickOption(o, 'Empowered').click();
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
	// Lasts: Rounds, then up to 3 (each change applies as it's made).
	await editor.locator('.ev-cond-lasts button', { hasText: 'Rounds' }).click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Empowered', value: 2, rounds: 1 }]);
	await editor.locator('.ev-stepper button[aria-label="More rounds"]').click();
	await editor.locator('.ev-stepper button[aria-label="More rounds"]').click();
	assert.deepEqual((await creatures(o))[0].conditions, [{ name: 'Empowered', value: 2, rounds: 3 }]);
	await o.page.keyboard.press('Escape');
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
		plugin.runtime('nimble').encounters.addParty();
		plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Krogg, Goblin King').monster);
	});
	await o.page.waitForTimeout(150);
	const label = 'Krogg, Goblin King-1';
	const row = await onCard(o, label);
	assert.equal(await row.locator('.hp-display').textContent(), '90/90');
	assert.match(await row.locator('.legendary-line').textContent(), /Bloodied at 45/);

	// Past half: a Bloodied prompt with the monster's Bloodied text.
	await typeHp(o, label, '50');
	const bloodied = o.page.locator(`${T} .tracker-prompt.prompt-bloodied`);
	assert.equal(await bloodied.locator('.prompt-title').textContent(), `${label} is Bloodied`);
	assert.match(await bloodied.locator('.prompt-text').textContent(), /damage increases to 2d8\+2/);
	assert.equal(await bloodied.locator('.nimble-dice').count(), 1);
	assert.equal(await row.locator('.nimble-phase-chip.is-on').textContent(), 'Bloodied');
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
	assert.equal(await row.locator('.nimble-phase-chip.is-on').textContent(), 'Last Stand');
	assert.equal(await row.locator('.creature-meta .armor-chip.armor-medium').count(), 1);
	// His new armor applies.
	await typeHp(o, label, '15');
	krogg = (await creatures(o)).find(c => c.label === label);
	assert.equal(krogg.hp, 15);

});

test('rename, round counter, clear all', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
	await creatureMenu(o, 'Goblin-1', 'Rename');
	await o.page.locator(`${T} .label-edit-input`).waitFor({ timeout: 2000 });
	await o.page.keyboard.press('Meta+A');
	await o.page.keyboard.type('Sneaky Pete');
	await o.page.keyboard.press('Enter');
	assert.equal((await creatures(o))[0].label, 'Sneaky Pete');

	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Setting up', 'no round until combat starts');
	await o.page.locator(`${T} .round-action`).click();
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:next-round'));
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:next-round'));
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 3');
	await o.page.locator(`${T} .tracker-more`).click();
	await o.page.locator('.menu .menu-item', { hasText: 'Back to round 2' }).click();
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
	assert.match(await o.page.locator(`${T} .empty-message`).textContent(), /No one here yet/);
});

test('creature menu: view stat block, duplicate, add note', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md'));
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

test('slash: /quest links a quest from this campaign, finished ones last; /hook is the quest box', async (o) => {
	try {
		await o.eval(async (app, plugin) => {
			const old = app.vault.getAbstractFileByPath('Campaigns/Questing');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Questing', level: 1, heroes: 4, starter: true });
			await app.vault.create('Campaigns/Questing/Quests/Clear the Mine.md', '---\nnimble: quest\nstatus: completed\n---\n');
			await app.vault.create('Campaigns/Questing/Quests/The Missing Caravan.md', '---\nnimble: quest\nstatus: active\ntype: side\ngiver: "[[Tobren Kask]]"\n---\n');
			await app.vault.create('Campaigns/Questing/Quests/Vecna- The Hand.md', '---\nnimble: quest\ntitle: "Vecna: The Hand"\n---\n');
		});
		await o.waitFor(() => o.eval((app, plugin) => plugin.campaigns.campaigns.find(c => c.folder === 'Campaigns/Questing')?.sections.find(s => s.name === 'Quests')?.notes.length === 3), { what: 'the quests in the index' });
		await o.openFile('Campaigns/Questing/Chapter 1/Opening Scene.md', 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lineCount(), ch: 0 }); ed.replaceSelection('\n'); ed.focus(); });
		const type = async (t) => { await o.page.keyboard.type(t, { delay: 15 }); await o.page.waitForTimeout(250); };
		const menu = o.page.locator('.suggestion-container .nimble-slash-item');
		const titles = () => menu.locator('.nimble-slash-title').allInnerTexts();

		// Bare /quest lists them all, open quests first; the finished one is last.
		await type('/quest');
		await o.waitFor(async () => (await titles())[0] === '/quest', { what: '/quest first in the menu' });
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await titles()).length === 3, { what: 'the quest list' });
		assert.deepEqual(await titles(), ['The Missing Caravan', 'Vecna: The Hand', 'Clear the Mine']);
		assert.match(await menu.first().locator('.nimble-slash-detail').innerText(), /active · side · from Tobren Kask/);
		// Typing narrows it; Enter writes the link.
		await type('carav');
		await o.waitFor(async () => (await titles()).join() === 'The Missing Caravan', { what: 'the search to narrow' });
		await o.page.keyboard.press('Enter');
		await type(' then ');
		// A quest whose name isn't a safe file name links under its real title.
		await type('/quest vecna');
		await o.waitFor(async () => (await titles()).join() === 'Vecna: The Hand', { what: 'the titled quest' });
		await o.page.keyboard.press('Enter');
		await type(' ');
		// No match: says where quests are made, and writes nothing.
		await type('/quest dragon');
		await o.waitFor(async () => /No quest matches "dragon"/.test((await titles()).join()), { what: 'the no-match row' });
		assert.match(await menu.first().locator('.nimble-slash-detail').innerText(), /Campaign panel/);
		await o.page.keyboard.press('Escape');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; const l = ed.lastLine(); ed.replaceRange('', { line: l, ch: ed.getLine(l).lastIndexOf('/quest dragon') }, { line: l, ch: ed.getLine(l).length }); ed.replaceSelection('\n'); });
		// /hook is the quest box now.
		await type('/hook');
		await o.waitFor(async () => (await titles())[0] === '/hook', { what: '/hook first in the menu' });
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(300);

		const text = await o.eval((app) => app.workspace.activeEditor.editor.getValue());
		assert.match(text, /\[\[The Missing Caravan\]\] then \[\[Vecna- The Hand\|Vecna: The Hand\]\] /);
		assert.match(text, /```box quest/);
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Questing');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('link pills: links to quests, places and party members show their icon, in reading view and Live Preview', async (o) => {
	const P = 'Campaigns/Pills/Notes.md';
	try {
		await o.eval(async (app, plugin, P) => {
			const old = app.vault.getAbstractFileByPath('Campaigns/Pills');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Pills', level: 1, heroes: 4, starter: true });
			await app.vault.create('Campaigns/Pills/Quests/Find the Bell.md', '---\nnimble: quest\nstatus: active\n---\n');
			await app.vault.create('Campaigns/Pills/Locations/Belltower.md', '---\nnimble: location\n---\n');
			await app.vault.create('Campaigns/Pills/Party/Ada.md', '---\nnimble: character\n---\n');
			await app.vault.create('Campaigns/Pills/Loose.md', 'Just a note.\n');
			await app.vault.create(P, 'Do [[Find the Bell]] at [[Belltower]] with [[Ada]]. See [[Loose]].\n');
		}, P);
		await o.waitFor(() => o.eval((app, plugin) => !!plugin.campaigns.campaigns.find(c => c.folder === 'Campaigns/Pills')?.sections.find(s => s.name === 'Party')?.notes.length), { what: 'the campaign index' });
		const pills = (root) => o.page.evaluate((root) => [...document.querySelectorAll(`.workspace-leaf.mod-active ${root}`)].map(a => `${a.textContent.trim()}:${a.className.match(/kind-\w+/)?.[0] ?? ''}:${a.querySelector('svg')?.classList[1] ?? ''}`), root);

		await o.openFile(P, 'preview');
		await o.waitFor(async () => (await pills('.markdown-reading-view a.nimble-note-link')).length === 3, { what: 'three pills in reading view' });
		assert.deepEqual(await pills('.markdown-reading-view a.nimble-note-link'), ['Find the Bell:kind-quest:lucide-flag', 'Belltower:kind-location:lucide-map-pin', 'Ada:kind-character:lucide-shield']);
		assert.equal(await o.page.locator('.workspace-leaf.mod-active .markdown-reading-view a.internal-link:not(.nimble-note-link)').innerText(), 'Loose', 'a plain note stays a plain link');

		// Pills on lines that wrap under each other keep some space between them.
		await o.eval(async (app, _p, P) => { await app.vault.modify(app.vault.getAbstractFileByPath(P), 'Do [[Find the Bell]] at [[Belltower]] with [[Ada]]. See [[Loose]].\n\n' + 'Then [[Belltower]] and [[Find the Bell]] with [[Ada]], '.repeat(12) + '\n'); }, P);
		const rowGap = () => o.page.evaluate(() => {
			const rs = [...document.querySelectorAll('.workspace-leaf.mod-active .markdown-reading-view a.nimble-note-link')].map(a => a.getBoundingClientRect());
			const gaps = rs.flatMap(r => rs.filter(q => q.top > r.bottom - 2 && q.top - r.bottom < 20).map(q => q.top - r.bottom));
			return gaps.length ? Math.min(...gaps) : null;
		});
		await o.waitFor(async () => (await rowGap()) !== null, { what: 'pills on wrapped lines' });
		assert.ok((await rowGap()) >= 2, `pills on wrapped lines have space between them (${await rowGap()}px)`);
		await o.eval(async (app, _p, P) => { await app.vault.modify(app.vault.getAbstractFileByPath(P), 'Do [[Find the Bell]] at [[Belltower]] with [[Ada]]. See [[Loose]].\n'); }, P);
		await o.waitFor(async () => (await pills('.markdown-reading-view a.nimble-note-link')).length === 3, { what: 'back to three pills' });

		// A finished quest's pill shows a tick.
		await o.eval(async (app) => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Pills/Quests/Find the Bell.md'), (fm) => { fm.status = 'completed'; }); });
		await o.waitFor(async () => (await pills('.markdown-reading-view a.nimble-note-link.is-quest-done')).join() === 'Find the Bell:kind-quest:lucide-circle-check', { what: 'the quest pill to tick' });

		// Live Preview: the same kinds, as an icon before a tinted link.
		await o.openFile(P, 'source');
		await o.eval((app) => { app.workspace.activeEditor.editor.setCursor({ line: 1, ch: 0 }); });
		await o.waitFor(async () => (await o.page.locator('.workspace-leaf.mod-active .markdown-source-view .nimble-note-lp-icon').count()) === 3, { what: 'three pill icons in Live Preview' });
		const lp = await o.page.evaluate(() => [...document.querySelectorAll('.workspace-leaf.mod-active .markdown-source-view .nimble-note-lp-icon')].map(s => s.className.match(/kind-\w+/)?.[0]));
		assert.deepEqual(lp, ['kind-quest', 'kind-location', 'kind-character']);
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Pills');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('slash: /spell opens the compendium dialog; Enter writes the reference and typing carries on', async (o) => {
	await resetEncounter(o);
	await o.eval(async (app) => {
		const old = app.vault.getAbstractFileByPath('Slash spell.md');
		if (old) await app.vault.delete(old);
		await app.vault.create('Slash spell.md', '# Spells\n\n');
	});
	await o.openFile('Slash spell.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
	const menu = o.page.locator('.suggestion-container .nimble-slash-item');
	await o.page.keyboard.type('She casts /spell', { delay: 15 });
	await o.waitFor(async () => /\/spell/.test((await menu.first().textContent().catch(() => '')) || ''), { what: 'the /spell command' });
	await o.page.keyboard.press('Enter');
	const M = '.modal.nimble-cmpx-modal';
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`, { timeout: 3000 });
	assert.equal(await o.page.locator(`${M} .modal-title`).textContent(), 'Insert a spell');
	await o.waitFor(() => o.page.evaluate((M) => document.activeElement === document.querySelector(`${M} .nimble-cmpx-input`), M), { timeout: 3000, what: 'the dialog search box focused' });
	assert.ok((await o.page.locator(`${M} .nimble-cmpx-row[data-id]`).first().getAttribute('data-id')).startsWith('spell:'), 'set to spells');
	await o.page.keyboard.type('flame dart', { delay: 15 });
	await o.waitFor(async () => (await o.page.locator(`${M} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === 'Flame Dart', { timeout: 3000, what: 'Flame Dart selected' });
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(M).count()) === 0, { what: 'the dialog to close' });
	await o.waitFor(() => o.page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), { timeout: 3000, what: 'focus back in the editor' });
	await o.page.keyboard.type('at the troll.', { delay: 15 });
	await o.page.waitForTimeout(200);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(2)), 'She casts `nimble:spell:Flame Dart` at the troll.');

	// Escape hands the cursor back too, with nothing written.
	await o.page.keyboard.press('Enter');
	await o.page.keyboard.type('/monster', { delay: 15 });
	await o.waitFor(async () => /\/monster/.test((await menu.first().textContent().catch(() => '')) || ''), { what: 'the /monster command' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`, { timeout: 3000 });
	assert.equal(await o.page.locator(`${M} .modal-title`).textContent(), 'Insert a monster');
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator(M).count()) === 0, { what: 'Escape to close the dialog' });
	await o.waitFor(() => o.page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), { timeout: 3000, what: 'focus back in the editor after Escape' });
	await o.page.keyboard.type('Ogres.', { delay: 15 });
	await o.page.waitForTimeout(200);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(3)), 'Ogres.');

	// With an argument the menu lists results inline, and its last row opens the dialog.
	await o.page.keyboard.press('Enter');
	await o.page.keyboard.type('/spell flame', { delay: 15 });
	await o.waitFor(async () => (await menu.allTextContents()).some(t => /Flame Dart/.test(t)), { what: 'Flame Dart in the slash menu' });
	assert.match(await menu.last().textContent(), /Search the compendium…/);
	await o.page.keyboard.press('Escape');
	await o.eval(async (app) => { const x = app.vault.getAbstractFileByPath('Slash spell.md'); if (x) await app.vault.delete(x); });
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
		plugin.runtime('nimble').encounters.trigger('changed');
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
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
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
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
	await o.eval((app, plugin) => plugin.runtime('nimble').encounters.addCondition(plugin.runtime('nimble').encounters.active.id, plugin.runtime('nimble').encounters.active.creatures[0].id, 'Dazed', { rounds: 2 }));
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
	assert.equal(await o.eval((app, plugin) => plugin.runtime('nimble').index.get('Camp Guard')?.monster.hp), 14);
});

test('cancelling HP entry does not swallow the next click', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster, undefined, 2));
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
	await o.eval((app, plugin) => plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin').monster));
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
		for (const n of ['Include the Nimble bestiary', 'Slash commands', 'Party', 'Stat block style', 'Clickable dice', 'Nimble attack rolls', 'Multiple encounters',
			'Apply monster armor automatically', 'Minion overkill', 'Custom conditions']) assert.ok(names.includes(n), `missing setting ${n}`);
		// The shared settings come first, then each game's own sections (from the game, not the plugin).
		const at = (n) => names.indexOf(n);
		assert.ok(at('Keep the screen on during combat') < at('Include the Nimble bestiary'), `order: ${names.join(' | ')}`);
		assert.ok(at('Minion overkill') < at('Custom conditions'), `order: ${names.join(' | ')}`);

		// Attribution and the link to buy the books.
		const notice = sp.locator(`${C} .nimble-notice`).first();
		assert.match(await notice.textContent(), /Nimble 3rd Party Creator License/);
		const link = notice.locator('a', { hasText: 'nimbleRPG.com' });
		assert.equal(await link.getAttribute('href'), 'https://nimbleRPG.com');
		assert.match(await notice.textContent(), /books at nimbleRPG\.com\./, 'the store name in the notice is the link, not repeated');
		// Every game's attribution.
		assert.match(await sp.locator(`${C} .nimble-notice`).allTextContents().then(t => t.join(' ')), /SRD/);

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
		await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.bundledCount === 0 && !plugin.settings.bundledBestiary), { timeout: 3000, what: 'bestiary to unload' });
		await toggle.click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.bundledCount >= 500 && plugin.settings.bundledBestiary), { timeout: 3000, what: 'bestiary to reload' });
	} finally {
		await o.eval((app, plugin) => { app.setting.close(); plugin.settings.party = []; if (!plugin.settings.bundledBestiary) { plugin.settings.bundledBestiary = true; plugin.runtime('nimble').loadBundledBestiary(); } });
	}
});

test('Spotlight: Cmd/Ctrl+K searches adversaries, NPCs and commands, rolls dice and adds to the encounter', async (o) => {
	await resetEncounter(o);
	await o.eval(async (app) => {
		for (const f of ['Spot NPC.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		await app.vault.create('Spot NPC.md', '---\nnimble: npc\nrole: Ferryman\naliases: [Old Tob]\n---\nHe ferries smugglers.\n');
		app.workspace.getLeavesOfType('markdown').forEach(l => l.view?.editor?.blur?.());
	});
	await o.openFile('Adventure.md', 'source');
	await o.waitFor(() => o.eval((app, plugin) => plugin.campaigns.npcs.some(n => n.name === 'Spot NPC')), { what: 'the NPC to be indexed' });
	const S = '.modal-container .prompt.nimble-spotlight';
	const input = o.page.locator(`${S} .prompt-input`);
	const rows = o.page.locator(`${S} .suggestion-item:not(.is-filter)`);
	const names = () => o.page.locator(`${S} .suggestion-item:not(.is-filter) .nimble-spot-name`).allInnerTexts();
	// Cmd/Ctrl+K is Obsidian's hotkey for "Insert Markdown link"; its hotkey manager runs that command, which the
	// plugin shares. Most steps run the command directly; a real key press is checked below, in three places.
	const pressK = () => o.eval((app) => { app.commands.executeCommandById('editor:insert-link'); });
	const openIt = async () => { await pressK(); await input.waitFor(); };

	// Until it's turned on, the key is Obsidian's alone.
	const line0 = await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 0, ch: 0 }); ed.focus(); return ed.getLine(0); });
	await pressK();
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), `[]()${line0}`, 'off: an empty link, as Obsidian does');
	assert.equal(await o.page.locator(S).count(), 0);
	await o.eval((app, plugin, line0) => { app.workspace.activeEditor.editor.setLine(0, line0); plugin.settings.spotlightKey = true; }, line0);

	// Opens from the editor, with pointers and the commands that make sense right now.
	await o.eval((app) => { const ed = app.workspace.activeEditor?.editor; ed?.setCursor({ line: 0, ch: 0 }); ed?.focus(); });
	await openIt();
	const home = await names();
	assert.ok(home.includes('Roll dice') && home.includes('Search adversaries'), `home: ${home}`);
	assert.ok(home.includes('Add monster to encounter…'), `home commands: ${home}`);
	assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getValue().includes('[]()')), false, 'no Markdown link was inserted');
	// The same key closes it.
	await pressK();
	await o.waitFor(async () => (await o.page.locator(S).count()) === 0, { what: 'Spotlight to close' });

	// Adversaries: Enter is a quick look.
	await openIt();
	await input.fill('goblin');
	await o.waitFor(async () => (await names())[0] === 'Goblin', { what: 'Goblin first' });
	assert.match(await rows.first().innerText(), /Adversary/i);
	await o.page.screenshot({ path: join(ARTIFACTS, 'spotlight-search.png') });
	await o.page.keyboard.press('Enter');
	await o.page.locator('.modal.nimble-record-modal').waitFor();
	// Escape out of the quick look comes back to Spotlight, still searching.
	await o.page.keyboard.press('Escape');
	await input.waitFor();

	// "3 goblin" adds three; Cmd+Enter on a plain search adds one and keeps the box open.
	await input.fill('3 goblin');
	await o.waitFor(async () => (await names())[0] === 'Add 3 × Goblin', { what: 'the add row' });
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await creatures(o)).filter(c => /^Goblin(-\d+)?$/.test(c.label)).length === 3, { what: 'three goblins in the tracker' });
	await openIt();
	await input.fill('goblin boss');
	await o.waitFor(async () => (await names())[0] === 'Goblin Boss', { what: 'Goblin Boss first' });
	await o.page.keyboard.press('Meta+Enter');
	await o.waitFor(async () => (await creatures(o)).some(c => /^Goblin Boss/.test(c.label)), { what: 'the boss in the tracker' });
	assert.equal(await o.page.locator(S).count(), 1, 'still open for the next one');
	assert.equal(await input.inputValue(), '');

	// Dice: typed, and from the quick row.
	const before = await o.eval((app, plugin) => plugin.settings.rollLog.length);
	await input.fill('2d6+3');
	await o.waitFor(async () => (await names())[0] === 'Roll 2d6+3', { what: 'the roll row' });
	await o.page.keyboard.press('Meta+Enter');
	await o.waitFor(async () => /2d6\+3 → \d+/.test(await o.page.locator(`${S} .nimble-spotlight-result`).innerText().catch(() => '')), { what: 'the result in the box' });
	await o.page.locator(`${S} .nimble-spotlight-die`, { hasText: exact('d20') }).click();
	await o.waitFor(async () => /1d20 → \d+/.test(await o.page.locator(`${S} .nimble-spotlight-result`).innerText()), { what: 'the d20 result' });
	await input.fill('d8');
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(S).count()) === 0, { what: 'Enter to roll and close' });
	const log = await o.eval((app, plugin) => plugin.settings.rollLog.map(r => r.expression));
	assert.equal(log.length, before + 3);
	for (const e of ['2d6+3', '1d20', '1d8']) assert.ok(log.includes(e), `${e} is in the roll log: ${log}`);

	// NPCs by name or alias; commands after ">".
	await openIt();
	await input.fill('old tob');
	await o.waitFor(async () => (await names())[0] === 'Spot NPC', { what: 'the NPC by alias' });
	await o.page.keyboard.press('Enter');
	await o.page.locator('.modal.nimble-record-modal').waitFor();
	// Escape out of the quick look comes back to Spotlight.
	await o.page.keyboard.press('Escape');
	await input.waitFor();
	await input.fill('> open compendium');
	await o.waitFor(async () => (await names())[0] === 'Open compendium', { what: 'the command' });
	await o.page.keyboard.press('Enter');
	await o.waitFor(() => o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').length > 0), { what: 'the compendium to open' });
	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));

	// With text selected, the key still makes a link.
	await o.openFile('Adventure.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 5 }); });
	await pressK();
	await o.page.waitForTimeout(300);
	assert.equal(await o.page.locator(S).count(), 0, 'a selection keeps the link shortcut');
	assert.match(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), /\[The\]\(/, 'and makes the link');
	await o.eval((app, _p, line0) => { const ed = app.workspace.activeEditor.editor; ed.setLine(0, line0); ed.setCursor({ line: 0, ch: 0 }); }, line0);
	// The key itself, wherever the focus is: an editor, a note in reading view, a sidebar panel.
	const keyOpens = async (where) => {
		await o.page.keyboard.press('Meta+k');
		await input.waitFor({ timeout: 5000 }).catch(() => { throw new Error(`Cmd+K did not open Spotlight with focus in ${where}`); });
		await o.page.waitForTimeout(350); // a person doesn't press it again within a fifth of a second
		await o.page.keyboard.press('Meta+k');
		await o.waitFor(async () => (await o.page.locator(S).count()) === 0, { what: `Cmd+K to close Spotlight (${where})` });
	};
	await keyOpens('the editor');
	await o.openFile('Adventure.md', 'preview');
	await o.page.locator(`${R} h1, ${R} p`).first().click();
	await keyOpens('reading view');
	await o.eval(async (app, plugin) => { await plugin.runtime('nimble').activateEncounterView(); });
	await o.page.locator(`${T}`).first().click({ position: { x: 5, y: 5 } });
	await keyOpens('the tracker sidebar');
	await openIt();
	await o.page.screenshot({ path: join(ARTIFACTS, 'spotlight.png') });
	await o.page.keyboard.press('Escape');
	// Spotlight's own command works whatever the setting, and outside an editor.
	await o.eval((app, plugin) => { plugin.settings.spotlightKey = false; app.commands.executeCommandById('nimble-gm:spotlight'); });
	await input.waitFor();
	await o.page.keyboard.press('Escape');
	await o.eval(async (app) => { const x = app.vault.getAbstractFileByPath('Spot NPC.md'); if (x) await app.vault.delete(x); });
});

test('Spotlight: Escape in a card or quick look opened from it comes back to Spotlight with the same search', async (o) => {
	const open = async (q) => {
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:spotlight'));
		await o.page.waitForSelector('.nimble-spotlight .prompt-input');
		await o.page.keyboard.type(q);
		await o.page.waitForTimeout(300);
	};
	const spotlight = () => o.page.evaluate(() => document.querySelector('.nimble-spotlight .prompt-input')?.value ?? null);
	// A spell's card: Escape → back to Spotlight, still searching "flame dart".
	await open('flame dart');
	await o.page.keyboard.press('Enter');
	await o.page.waitForSelector('.modal.nimble-cmp-modal');
	assert.equal(await spotlight(), null, 'Spotlight closed while the card is up');
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await spotlight()) === 'flame dart', { timeout: 3000, what: 'Spotlight back with the search' });
	assert.equal(await o.page.locator('.modal.nimble-cmp-modal').count(), 0);
	// Closing the card with its × doesn't bring Spotlight back.
	await o.page.keyboard.press('Enter');
	await o.page.waitForSelector('.modal.nimble-cmp-modal');
	await o.page.locator('.modal.nimble-cmp-modal .modal-close-button').click();
	await o.page.waitForTimeout(300);
	assert.equal(await spotlight(), null, 'no Spotlight after closing with ×');
	// A monster's quick look works the same way.
	await open('krogg');
	await o.page.keyboard.press('Enter');
	await o.page.waitForSelector('.modal.nimble-record-modal');
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await spotlight()) === 'krogg', { timeout: 3000, what: 'Spotlight back after the quick look' });
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await spotlight()) === null, { timeout: 2000, what: 'Spotlight closed' });
});

test('Spotlight and the compendium forgive typos: "zombieq" still finds Zombie', async (o) => {
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:spotlight'));
	await o.page.waitForSelector('.nimble-spotlight .prompt-input');
	await o.page.keyboard.type('zombieq');
	await o.waitFor(async () => /^Zombie/.test((await o.page.locator('.nimble-spotlight .suggestion-item .nimble-spot-name').first().textContent().catch(() => '')) ?? ''), { timeout: 3000, what: 'Zombie for "zombieq" in Spotlight' });
	await o.page.keyboard.press('Escape');
	// A real name match beats typo matches of anything else: "compen" is Open compendium, not monsters in a Companions group.
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:spotlight'));
	await o.page.waitForSelector('.nimble-spotlight .prompt-input');
	await o.page.keyboard.type('compen');
	await o.waitFor(async () => (await o.page.locator('.nimble-spotlight .suggestion-item .nimble-spot-name').first().textContent().catch(() => '')) === 'Open compendium', { timeout: 3000, what: 'Open compendium first for "compen"' });
	assert.equal(await o.page.locator('.nimble-spotlight .suggestion-item.spot-monster').count(), 0, 'no typo-matched monsters beside a real match');
	await o.page.keyboard.press('Escape');
	await o.eval((app, plugin) => plugin.runtime('nimble').openCompendium('adversaries', 'zombieq'));
	await o.waitFor(async () => /^Zombie/.test((await o.page.locator('.nimble-compendium .nimble-cmpx-row[data-id] .nimble-cmpx-row-name > span:first-child').first().textContent().catch(() => '')) ?? ''), { timeout: 3000, what: 'Zombie for "zombieq" in the compendium' });
	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));
});

test('compendium: after picking a row, typing a filter key starts on its suggestions, and Enter makes a chip and clears the text', async (o) => {
	const C = '.nimble-compendium';
	await o.eval((app, plugin) => plugin.runtime('nimble').openCompendium('adversaries', 'type:undead '));
	const input = o.page.locator(`${C} .nimble-cmpx-input`);
	await o.waitFor(async () => (await o.page.locator(`${C} .nimble-cmpx-chip`).count()) === 1, { timeout: 3000, what: 'the Undead chip' });
	assert.match(await o.page.locator(`${C} .nimble-cmpx-chip`).first().textContent(), /undead/i);
	// Pick a row, then come back to the box and start a second type: filter.
	await o.page.locator(`${C} .nimble-cmpx-row[data-id]`).nth(2).click();
	await input.click();
	await o.page.keyboard.type('type:');
	await o.waitFor(async () => (await o.page.locator(`${C} .nimble-cmpx-row.is-suggestion`).count()) > 1, { timeout: 3000, what: 'other types offered' });
	const sel = () => o.page.locator(`${C} .nimble-cmpx-row.is-selected`).first();
	assert.equal(await sel().evaluate(el => el.classList.contains('is-suggestion')), true, 'the selection starts on the first suggestion');
	assert.ok(!(await o.page.locator(`${C} .nimble-cmpx-row.is-suggestion .nimble-cmpx-row-name`).allTextContents()).some(t => t.toLowerCase() === 'type:undead'), 'the applied type is not offered again');
	await o.page.keyboard.press('ArrowDown');
	const picked = (await sel().locator('.nimble-cmpx-row-name').textContent()).replace(/^type:/, '');
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(`${C} .nimble-cmpx-chip`).count()) === 2, { timeout: 3000, what: 'a second chip' });
	assert.equal(await input.inputValue(), '', 'the typed "type:" is consumed');
	assert.match((await o.page.locator(`${C} .nimble-cmpx-chip`).nth(1).textContent()), new RegExp(picked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));
});

test('Spotlight: filters work right in Spotlight (chips, suggestions, filtered results), and the lookup row takes them to the compendium', async (o) => {
	await resetEncounter(o);
	const S = '.modal-container .prompt.nimble-spotlight';
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:spotlight'));
	const input = o.page.locator(`${S} .prompt-input`);
	await input.waitFor();
	// A finished filter becomes a chip in Spotlight's own box; the results are compendium entries that match.
	await input.fill('school:fire ');
	await o.waitFor(async () => (await cmpChips(o, S)).length === 1, { timeout: 3000, what: 'the School chip in Spotlight' });
	assert.deepEqual(await cmpChips(o, S), [['School', 'fire']]);
	assert.equal(await input.inputValue(), '');
	const rows = o.page.locator(`${S} .suggestion-item`);
	await o.waitFor(async () => (await o.page.locator(`${S} .suggestion-item.spot-lookup`).count()) === 1, { timeout: 3000, what: 'the lookup row' });
	const kinds = await rows.evaluateAll(els => els.map(e => ['entry', 'lookup', 'filter'].find(k => e.classList.contains(`spot-${k}`)) ?? e.className));
	assert.ok(kinds.slice(0, -1).every(k => k === 'entry'), `compendium entries: ${kinds}`);
	assert.ok((await o.page.locator(`${S} .spot-entry .nimble-spot-name`).allInnerTexts()).includes('Flame Dart'));
	// Naming a filter makes a chip that waits for its value; its values are suggested at the top, already selected.
	await o.page.keyboard.type('tier', { delay: 20 });
	await o.waitFor(async () => (await o.page.locator(`${S} .suggestion-item.is-filter.is-selected`).count()) === 1, { timeout: 3000, what: 'the tier: key suggested and selected' });
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(`${S} .nimble-cmpx-chip.is-pending`).count()) === 1, { timeout: 3000, what: 'a Tier chip waiting for its value' });
	assert.equal(await input.inputValue(), '');
	await o.page.keyboard.type('cantrip', { delay: 20 });
	await o.waitFor(async () => /tier:cantrip/i.test(await o.page.locator(`${S} .suggestion-item.is-filter.is-selected`).innerText().catch(() => '')), { timeout: 3000, what: 'tier:cantrip selected' });
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await cmpChips(o, S)).length === 2, { timeout: 3000, what: 'the Tier chip' });
	assert.equal(await input.inputValue(), '', 'nothing typed is left behind');
	// The lookup row (last; ↑ from the top wraps to it) opens the compendium with the same chips.
	await o.page.keyboard.press('ArrowUp');
	await o.waitFor(async () => rows.last().evaluate(el => el.classList.contains('is-selected')), { timeout: 2000, what: 'the lookup row selected' });
	await o.page.keyboard.press('Enter');
	const M = '.modal.nimble-cmpx-modal';
	await o.page.waitForSelector(`${M} .nimble-cmpx-input`, { timeout: 3000 });
	await o.waitFor(async () => (await cmpChips(o, M)).length === 2, { timeout: 3000, what: 'both chips in the compendium' });
	const names = await cmpNames(o, M);
	assert.ok(names.includes('Flame Dart'), `fire cantrips listed: ${names.slice(0, 5)}`);
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator(M).count()) === 0, { what: 'the dialog to close' });
	// Escape from the compendium opened from Spotlight comes back to Spotlight; close that too.
	await input.waitFor();
	await o.page.keyboard.press('Escape');
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
			await plugin.runtime('nimble').activateEncounterView(true);
			await plugin.runtime('nimble').addToEncounter(plugin.runtime('nimble').index.get('Goblin Taskmaster').monster, undefined, 1);
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

		// The condition picker is a bottom sheet: tap the row to put it on the card, then its condition button.
		await tap(p.locator(`${T} .creature-item`).filter({ hasText: 'Goblin Taskmaster' }).locator('.creature-label'));
		await tap(p.locator(`${T} .ev-card.creature-item`).filter({ hasText: 'Goblin Taskmaster' }).locator('.add-condition-btn'));
		assert.equal(await p.locator('.nimble-popover.is-sheet').count(), 1, 'popover is a sheet on phones');
		await p.evaluate(() => document.querySelectorAll('.nimble-popover').forEach(n => n.remove()));

		// Narrow compendium: list → monster → back; filters behind a toggle.
		await o.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
		await p.waitForTimeout(500);
		const layout = p.locator('.nimble-compendium .nimble-cmpx-layout');
		assert.match(await layout.getAttribute('class'), /is-narrow/);
		assert.equal(await p.locator('.nimble-compendium .nimble-cmpx-panel').isVisible(), false, 'filters start collapsed');
		assert.notEqual(await p.evaluate(() => document.activeElement?.className ?? ''), 'nimble-cmpx-input', 'no keyboard popping up on open');
		const third = p.locator('.nimble-compendium .nimble-cmpx-row[data-id]').nth(2);
		const thirdName = await third.locator('.nimble-cmpx-row-name > span:first-child').textContent();
		await tap(third);
		assert.match(await layout.getAttribute('class'), /show-detail/);
		assert.equal(await p.locator('.nimble-compendium .nimble-cmpx-list').isVisible(), false);
		assert.equal(await p.locator('.nimble-compendium .nimble-cmpx-detail .monster-name').textContent(), thirdName);
		await tap(p.locator('.nimble-compendium .nimble-cmpx-detail .bestiary-back'));
		assert.doesNotMatch(await layout.getAttribute('class'), /show-detail/);
		await tap(p.locator('.nimble-compendium .nimble-cmpx-filter'));
		assert.equal(await p.locator('.nimble-compendium .nimble-cmpx-panel').isVisible(), true);
		await o.eval((app) => app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach()));

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
	// Dice are the top layer, above modals, notices and menus.
	const layers = await o.page.evaluate(() => {
		const z = (sel) => { const el = document.querySelector(sel); return el ? Number(getComputedStyle(el).zIndex) : null; };
		const probe = (cls) => { const d = document.createElement('div'); d.className = cls; document.body.appendChild(d); const v = Number(getComputedStyle(d).zIndex); d.remove(); return v; };
		return { dice: z('canvas.nimble-dice3d-overlay'), modal: probe('modal-container'), notice: probe('notice-container'), menu: probe('menu') };
	});
	assert.ok(layers.dice > layers.modal && layers.dice > layers.notice && layers.dice > layers.menu, `dice above everything ${JSON.stringify(layers)}`);
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

	// Narrow places keep the card readable: Obsidian's page preview (Cmd/Ctrl + hover) is about 370px wide inside.
	await o.eval(async (app) => {
		const x = app.vault.getAbstractFileByPath('Campaigns/Card/Hello.md');
		if (x) await app.vault.delete(x);
		await app.vault.create('Campaigns/Card/Hello.md', 'Ask [[Marta Hale]] about the mill.\n\n![[Marta Hale]]\n');
	});
	await o.openFile('Campaigns/Card/Hello.md', 'preview');
	const npcLink = o.page.locator(`${R} a.internal-link`, { hasText: 'Marta Hale' }).first();
	await npcLink.waitFor();
	const popCard = o.page.locator('.popover.hover-popover .nimble-npc-card');
	await o.waitFor(async () => {
		if (await popCard.count()) return true;
		await o.page.mouse.move(5, 5);
		await o.page.keyboard.down('Meta');
		await npcLink.hover();
		await o.page.waitForTimeout(900);
		await o.page.keyboard.up('Meta');
		return (await popCard.count()) > 0;
	}, { what: 'the page preview of the NPC note', interval: 100 });
	const readable = (loc) => loc.evaluate((card) => {
		const box = (sel) => card.querySelector(sel).getBoundingClientRect();
		const c = card.getBoundingClientRect();
		return {
			card: Math.round(c.width), portrait: Math.round(box('.nimble-npc-portrait').width),
			name: Math.round(box('.nimble-npc-name').width), nameLines: Math.round(box('.nimble-npc-name').height / parseFloat(getComputedStyle(card.querySelector('.nimble-npc-name')).lineHeight)),
			value: Math.round(box('.nimble-npc-value').width), inside: box('.nimble-npc-value').right <= c.right + 1,
		};
	});
	const inPop = await readable(popCard);
	await o.page.screenshot({ path: join(ARTIFACTS, 'npc-card-hover-preview.png') });
	assert.ok(inPop.card < 420, `the preview is a narrow place: ${JSON.stringify(inPop)}`);
	assert.ok(inPop.portrait < inPop.card / 2, `the portrait leaves room for the text: ${JSON.stringify(inPop)}`);
	assert.ok(inPop.value > inPop.card / 2 && inPop.inside, `rows have room to read: ${JSON.stringify(inPop)}`);
	assert.equal(inPop.nameLines, 1, `the name sits on one line: ${JSON.stringify(inPop)}`);
	await o.page.mouse.move(5, 5);
	await o.page.keyboard.press('Escape');
	// The same card embedded in another note (![[Marta Hale]]) at full width keeps the wide layout.
	const embedded = o.page.locator(`${R} .markdown-embed .nimble-npc-card`);
	await o.waitFor(async () => (await embedded.count()) === 1, { what: 'the embedded card' });
	const wide = await readable(embedded);
	assert.ok(wide.card > 420 && wide.value > 150, `embedded card is readable: ${JSON.stringify(wide)}`);

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
/** The 5e tracker's condition picker: the row's +, then the condition. */
const pickCondition5e = async (o, row, name) => {
	// The card has its condition button; a row in the queue has it in its menu (right-click, long-press).
	const btn = row.locator('.ev-card-condition');
	if (await btn.count()) await btn.click();
	else { await row.locator('.dnd5e-combatant-name').first().click({ button: 'right' }); await clickMenu(o, 'Add a condition…'); }
	await o.page.locator(`.condition-picker .condition-option[aria-label="${name}"]`).click();
};
/** Type into the 5e tracker's HP keypad (the HP language: 7, 7r, +7, t7, =7) and apply. */
const hpPad5e = async (o, row, keys) => {
	await row.locator('.dnd5e-hp-text, .dnd5e-focus-hp-btn').first().click();
	await o.page.locator('.nimble-hp-pad').waitFor();
	await o.page.keyboard.type(keys);
	await o.page.keyboard.press('Enter');
	await o.page.locator('.nimble-hp-pad').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
};
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
	// The first chapter shows as a chapter once its note's properties are indexed (a beat after the folder appears).
	await o.waitFor(async () => (await panelSections(o)).length >= 5 && (await cgroup(o, `Campaigns/${name}/Chapter 1`).locator('.campaign-chapter-head').count()) === 1, { what: 'the starter folders and first chapter in the panel' });
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
	assert.deepEqual(await panelSections(o), ['Sessions', 'Quests', 'NPCs', 'Locations', 'Party', 'Monsters', 'Assets']);
	for (const name of ['Sessions', 'Quests', 'NPCs', 'Locations', 'Party', 'Monsters', 'Assets']) {
		const g = cgroup(o, `Campaigns/Fresh/${name}`);
		assert.equal(await g.locator('.campaign-group-head button.campaign-add-scene').count(), 1, `${name} has a +`);
		assert.match(await g.locator('.campaign-empty').innerText(), /Nothing here yet/);
	}
	assert.match(await cgroup(o, 'Campaigns/Fresh/NPCs').locator('.campaign-empty').innerText(), /\+ New NPC/);
	assert.match(await cgroup(o, 'Campaigns/Fresh/Quests').locator('.campaign-empty').innerText(), /\+ New quest/);
	assert.match(await cgroup(o, 'Campaigns/Fresh/Assets').locator('.campaign-empty').innerText(), /\+ Add files/);
	// The Campaign heading is there from the start, with its New folder and + buttons.
	const heading = o.page.locator(`${CP} .campaign-heading-folders`);
	assert.equal(await heading.locator('button[aria-label="New folder"]').count(), 1);
	await heading.locator('button[aria-label="New note or folder"]').click();
	assert.deepEqual(await menuTitles(o), ['New session log', 'New NPC', 'New location', 'New quest', 'New note…', 'New chapter', 'New folder']);
	await o.page.keyboard.press('Escape');
	await o.page.screenshot({ path: join(ARTIFACTS, 'campaign-fresh.png') });

	// The dashboard block on the home note lists the same folders.
	await o.openFile('Campaigns/Fresh/Fresh.md', 'preview');
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-campaign-block .campaign-section-name`).count()) === 7, { what: 'folders in the dashboard block (Party, Quests, NPCs, Locations, Sessions, Monsters, Assets)' });
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

	// Quests: Quest is picked for you, and the note opens on its hook.
	await openPicker(o, 'Campaigns/Fresh/Quests');
	assert.equal(await activeStarter(o), 'quest');
	await createFromPicker(o, 'The Missing Caravan');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Quests/The Missing Caravan.md'), { what: 'the quest' });
	assert.match(await read(o, 'Campaigns/Fresh/Quests/The Missing Caravan.md'), /nimble: quest\nstatus: available[\s\S]*```box quest title="The hook"[\s\S]*## Objectives[\s\S]*## The truth/);
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-box.box-quest, ${S} .nimble-box.box-quest`).count()) >= 1, { what: 'the hook box to render' });
	// A finished quest is ticked off and drops below the ones still open.
	await o.eval(async (app) => {
		await app.vault.create('Campaigns/Fresh/Quests/Clear the Mine.md', '---\nnimble: quest\nstatus: active\n---\n');
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Fresh/Quests/The Missing Caravan.md'), (fm) => { fm.status = 'completed'; });
	});
	const questTitles = () => cgroup(o, 'Campaigns/Fresh/Quests').locator('.campaign-note-title').allInnerTexts();
	await o.waitFor(async () => (await questTitles()).join() === 'Clear the Mine,The Missing Caravan', { what: 'the finished quest to sink' });
	assert.equal(await crow(o, 'Campaigns/Fresh/Quests/The Missing Caravan.md').evaluate(el => el.classList.contains('is-quest-done')), true);
	assert.equal(await crow(o, 'Campaigns/Fresh/Quests/Clear the Mine.md').evaluate(el => el.classList.contains('is-quest-done')), false);

	// Monsters: a stat block the bestiary picks up under its name.
	await openPicker(o, 'Campaigns/Fresh/Monsters');
	assert.equal(await activeStarter(o), 'monster');
	await createFromPicker(o, 'Quarry Boss');
	await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.get('Quarry Boss')?.filePath === 'Campaigns/Fresh/Monsters/Quarry Boss.md'), { what: 'the monster in the index' });

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

	// An NPC asked for from a chapter is filed with the campaign's NPCs, and the dialog says so first.
	const dest = o.page.locator('.nimble-new-note .nimble-starter-dest');
	await openPicker(o, 'Campaigns/Fresh/Chapter 1');
	assert.equal(await dest.isVisible(), false, 'a scene stays in the chapter: nothing to say');
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="npc"]').click();
	assert.match(await dest.innerText(), /campaign's NPCs folder/);
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="map"]').click();
	assert.equal(await dest.isVisible(), false, 'a chapter keeps its own maps');
	await createFromPicker(o, 'Old Mother Silt', 'npc');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/Old Mother Silt.md'), { what: 'the NPC in the NPCs folder' });
	assert.equal(await exists(o, 'Campaigns/Fresh/Chapter 1/Old Mother Silt.md'), false, 'not left among the chapter\'s scenes');
	await crow(o, 'Campaigns/Fresh/NPCs/Old Mother Silt.md').waitFor();
	assert.equal(await cgroup(o, 'Campaigns/Fresh/Chapter 1').locator('.campaign-count').innerText(), '2', 'the chapter still has two scenes');
	// A kind with no folder yet gets one (the starter campaign has no Handouts folder).
	await openPicker(o, 'Campaigns/Fresh/Chapter 1');
	await createFromPicker(o, 'Torn Ledger Page', 'handout');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Handouts/Torn Ledger Page.md'), { what: 'the handout in a new Handouts folder' });
	await crow(o, 'Campaigns/Fresh/Handouts/Torn Ledger Page.md').waitFor();
	// The same from the top of the campaign: New note… → Location lands in Locations, not loose.
	await o.page.locator(`${CP} .campaign-heading-folders button[aria-label="New note or folder"]`).click();
	await clickMenu(o, 'New note…');
	await o.page.locator('.nimble-new-note').waitFor();
	await createFromPicker(o, 'The Docks', 'location');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Locations/The Docks.md'), { what: 'the location in Locations' });
	// A renamed folder is used instead of making a second one.
	await o.eval(async (app) => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Campaigns/Fresh/NPCs'), 'Campaigns/Fresh/Characters'); });
	await cgroup(o, 'Campaigns/Fresh/Characters').waitFor();
	await openPicker(o, 'Campaigns/Fresh/Chapter 1');
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="npc"]').click();
	assert.match(await dest.innerText(), /campaign's Characters folder/);
	await createFromPicker(o, 'Wick');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Characters/Wick.md'), { what: 'the NPC in the renamed folder' });
	assert.equal(await exists(o, 'Campaigns/Fresh/NPCs'), false, 'no second NPCs folder');
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
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Assets/cave 2.png'), { what: 'the clashing name to get a number (nothing is overwritten)' });
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
	await o.page.waitForTimeout(800); // the panel re-renders a beat after each move; a drag started mid-render loses its row
	await crow(o, 'Campaigns/Fresh/NPCs/Mara.md').dragTo(cgroup(o, 'Campaigns/Fresh/Locations').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Locations/Mara.md'), { what: 'the drag into Locations' });
	await crow(o, 'Campaigns/Fresh/Locations/Mara.md').waitFor();

	// Folder to chapter: it's kept with the chapter. A location isn't a scene, so it isn't numbered as one.
	await o.page.waitForTimeout(800); // the panel re-renders a beat after each move; a drag started mid-render loses its row
	await crow(o, 'Campaigns/Fresh/Locations/Docks.md').dragTo(cgroup(o, 'Campaigns/Fresh/Chapter 1').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/Chapter 1/Docks.md'), { what: 'the drag into the chapter' });
	await crow(o, 'Campaigns/Fresh/Chapter 1/Docks.md').waitFor();
	assert.doesNotMatch(await read(o, 'Campaigns/Fresh/Chapter 1/Docks.md'), /order:/);

	// Chapter back out to the top of the campaign.
	await o.page.waitForTimeout(800); // the panel re-renders a beat after each move; a drag started mid-render loses its row
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
	await o.page.waitForTimeout(800); // the panel re-renders a beat after each move; a drag started mid-render loses its row
	await explorerFile.dragTo(cgroup(o, 'Campaigns/Fresh/NPCs').locator('.campaign-group-head'));
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/Ledger.md'), { what: 'the drop from the file explorer' });
	const explorerFolder = o.page.locator('.workspace-split.mod-right-split .nav-folder-title[data-path="Old notes/Factions"]');
	await explorerFolder.waitFor();
	await o.page.waitForTimeout(800); // the panel re-renders a beat after each move; a drag started mid-render loses its row
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

test('campaign panel: chapter files and maps are listed, real titles are kept, moves only number scenes', async (o) => {
	await freshCampaign(o, 'Fresh');
	const CH = 'Campaigns/Fresh/Chapter 1';

	// A file added to a chapter is listed in it, and offered as the image for a new map.
	const chooser = o.page.waitForEvent('filechooser');
	await cgroup(o, CH).locator('.campaign-group-head').click({ button: 'right' });
	await clickMenu(o, 'Add files…');
	await (await chooser).setFiles([{ name: 'cave.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') }]);
	await crow(o, `${CH}/cave.png`).waitFor();
	await openPicker(o, CH);
	await o.page.locator('.nimble-new-note .nimble-starter[data-kind="map"]').click();
	await o.page.locator('.nimble-new-note .nimble-starter-map select').selectOption(`${CH}/cave.png`);
	await createFromPicker(o, 'Cave Map');
	// The map has a row of its own (rename, move, delete), not just the button on the chapter.
	await crow(o, `${CH}/Cave Map.md`).waitFor();
	await crow(o, `${CH}/Cave Map.md`).click({ button: 'right' });
	assert.ok((await menuTitles(o)).includes('Rename…'), 'a chapter map has the note menu');
	await o.page.keyboard.press('Escape');
	// A file dropped at the top of the campaign stays visible.
	await o.eval(async (app, plugin, ch) => { await plugin.campaigns.move([`${ch}/cave.png`], 'Campaigns/Fresh'); }, CH);
	await o.page.locator(`${CP} .campaign-loose .campaign-note[data-path="Campaigns/Fresh/cave.png"]`).waitFor();

	// A name the file system can't hold keeps its real spelling in the panel.
	await openPicker(o, CH);
	await createFromPicker(o, 'Who goes there?');
	await o.waitFor(() => exists(o, `${CH}/Who goes there-.md`), { what: 'the scene file' });
	assert.match(await read(o, `${CH}/Who goes there-.md`), /title: "Who goes there\?"/);
	await o.waitFor(async () => (await crow(o, `${CH}/Who goes there-.md`).locator('.campaign-note-title').innerText().catch(() => '')) === 'Who goes there?', { what: 'the typed name in the panel' });

	// A second note whose name differs only by case gets a number instead of failing quietly.
	await openPicker(o, 'Campaigns/Fresh/NPCs');
	await createFromPicker(o, 'Mara');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/Mara.md'), { what: 'Mara' });
	await openPicker(o, 'Campaigns/Fresh/NPCs');
	await createFromPicker(o, 'mara');
	await o.waitFor(() => exists(o, 'Campaigns/Fresh/NPCs/mara 2.md'), { what: 'the second mara' });

	// An NPC moved into a chapter is kept there but isn't numbered as a scene…
	await o.eval(async (app, plugin, ch) => { await plugin.campaigns.move(['Campaigns/Fresh/NPCs/Mara.md'], ch); }, CH);
	await o.waitFor(() => exists(o, `${CH}/Mara.md`), { what: 'the NPC in the chapter' });
	await o.page.waitForTimeout(400);
	assert.doesNotMatch(await read(o, `${CH}/Mara.md`), /order:/);
	// …and a scene moved out to a folder loses its place in the chapter.
	assert.match(await read(o, `${CH}/Opening Scene.md`), /order: 1/);
	await o.eval(async (app, plugin, ch) => { await plugin.campaigns.move([`${ch}/Opening Scene.md`], 'Campaigns/Fresh/Locations'); }, CH);
	await o.waitFor(async () => (await exists(o, 'Campaigns/Fresh/Locations/Opening Scene.md')) && !/order:/.test(await read(o, 'Campaigns/Fresh/Locations/Opening Scene.md')), { what: 'the order to be dropped' });

	// Chapters kept one folder down (Chapters/Act 2) are chapters of their own, and deleting one leaves the rest.
	await o.eval(async (app) => {
		for (const d of ['Campaigns/Fresh/Chapters', 'Campaigns/Fresh/Chapters/Act 2', 'Campaigns/Fresh/Chapters/Act 3']) await app.vault.createFolder(d);
		await app.vault.create('Campaigns/Fresh/Chapters/Act 2/Act 2.md', '---\nnimble: chapter\norder: 2\n---\n');
		await app.vault.create('Campaigns/Fresh/Chapters/Act 2/Gate.md', '---\nnimble: scene\n---\n');
		await app.vault.create('Campaigns/Fresh/Chapters/Act 3/Act 3.md', '---\nnimble: chapter\norder: 3\n---\n');
		await app.vault.create('Campaigns/Fresh/Chapters/Act 3/Keep.md', '---\nnimble: scene\n---\n');
	});
	await cgroup(o, 'Campaigns/Fresh/Chapters/Act 3').waitFor();
	assert.deepEqual(await o.page.locator(`${CP} .campaign-chapter-name`).allInnerTexts(), ['Chapter 1', 'Act 2', 'Act 3']);
	assert.equal(await cgroup(o, 'Campaigns/Fresh/Chapters/Act 2').locator('.campaign-note-title').allInnerTexts().then(a => a.join()), 'Gate');
	await cgroup(o, 'Campaigns/Fresh/Chapters/Act 2').locator('.campaign-group-head').click({ button: 'right' });
	await clickMenu(o, 'Delete chapter');
	await o.page.locator('.modal-container button', { hasText: exact('Delete') }).click();
	await o.waitFor(async () => !(await exists(o, 'Campaigns/Fresh/Chapters/Act 2')), { what: 'the chapter delete' });
	assert.ok(await exists(o, 'Campaigns/Fresh/Chapters/Act 3/Keep.md'), 'the chapter beside it is untouched');
	await endCampaign(o, 'Fresh');
});

test('campaign panel: the search bar under the switcher opens Spotlight; the key hint follows the setting', async (o) => {
	await freshCampaign(o, 'Fresh');
	const bar = o.page.locator(`${CP} .campaign-search`);
	const SPOT = '.modal-container .prompt.nimble-spotlight';
	assert.ok(await o.page.evaluate((cp) => document.querySelector(`${cp} .campaign-search`)?.previousElementSibling?.classList.contains('campaign-switcher'), CP), 'right under the switcher');
	assert.equal(await bar.getAttribute('aria-label'), 'Search (opens Spotlight)');

	await bar.click();
	await o.waitFor(async () => (await o.page.locator(`${SPOT} .prompt-input`).count()) === 1, { what: 'Spotlight from the panel search bar' });
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator(SPOT).count()) === 0, { what: 'Spotlight to close' });
	// Keyboard: focus and Enter.
	await bar.focus();
	await o.page.keyboard.press('Enter');
	await o.waitFor(async () => (await o.page.locator(`${SPOT} .prompt-input`).count()) === 1, { what: 'Spotlight via Enter on the search bar' });
	await o.page.keyboard.press('Escape');
	await o.waitFor(async () => (await o.page.locator(SPOT).count()) === 0, { what: 'Spotlight to close' });

	// The key hint only shows when the shortcut is on.
	const was = await o.eval((app, plugin) => plugin.settings.spotlightKey);
	for (const on of [true, false]) {
		await o.eval((app, plugin, on) => { plugin.settings.spotlightKey = on; plugin.campaigns.trigger('changed'); }, on);
		await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-search-kbd`).count()) === (on ? 1 : 0), { what: `key hint ${on ? 'shown' : 'hidden'}` });
		if (on) await o.page.screenshot({ path: join(ARTIFACTS, 'campaign-search-bar.png'), clip: { x: 0, y: 0, width: 700, height: 420 } });
	}
	await o.eval((app, plugin, was) => { plugin.settings.spotlightKey = was; }, was);
	// It fits a narrow sidebar without spilling.
	await o.waitFor(() => o.page.evaluate((cp) => {
		const el = document.querySelector(`${cp} .campaign-search`);
		return !!el?.parentElement && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right + 1;
	}, CP), { what: 'the search bar to sit inside the panel', timeout: 5000 });
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

test('blocks inside callouts and lists: editing an encounter or a map rewrites only its own lines', async (o) => {
	await resetEncounter(o);
	const NOTE = 'Nested blocks.md';
	const BODY = [
		'Intro line.', '',
		'> [!note] Ambush',
		'> Before the fight.',
		'> ```nimble-encounter',
		'> name: Ambush',
		'> monsters:',
		'> - 2 Goblin',
		'> ```',
		'> After the fight.', '',
		'- A list item',
		'  ```nimble-encounter',
		'  name: Listed',
		'  monsters:',
		'  - 1 Goblin',
		'  ```',
		'- Next item', '',
		'> [!info] The cave',
		'> Above the map.',
		'> ```nimble-map',
		'> image: [[nested-map.png]]',
		'> pins:',
		'> - 20, 20 | Gate',
		'> ```',
		'> Below the map.', '',
		'```nimble-map',
		'image: [[nested-map.png]]',
		'pins:',
		'```', '',
		'Outro line.', '',
	].join('\n');
	await o.eval(async (app, _p, [note, body, png]) => {
		for (const f of [note, 'nested-map.png', 'Nested embed.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		await app.vault.createBinary('nested-map.png', Uint8Array.from(atob(png), c => c.charCodeAt(0)).buffer);
		await app.vault.create(note, body);
		await app.vault.create('Nested embed.md', `![[${note.replace('.md', '')}]]\n`);
	}, [NOTE, BODY, PNG]);
	await o.openFile(NOTE, 'preview');
	const blocks = o.page.locator(`${R} .nimble-encounter-block`);
	await o.waitFor(async () => (await blocks.count()) === 2 && (await o.page.locator(`${R} .nimble-map`).count()) === 2, { what: 'the nested blocks to render' });

	// One more goblin, in the callout and then in the list item.
	const bump = async (name) => {
		const block = o.page.locator(`${R} .nimble-encounter-block`, { hasText: name });
		await block.locator('.encounter-count').first().click();
		await o.page.locator('.nimble-popover button[aria-label="One more"]').click();
		await o.page.keyboard.press('Escape');
		await o.page.waitForTimeout(500);
	};
	await bump('Ambush');
	await o.waitFor(async () => (await read(o, NOTE)).includes('> - 3 Goblin'), { what: 'the callout encounter to save' });
	await bump('Listed');
	await o.waitFor(async () => (await read(o, NOTE)).includes('  - 2 Goblin'), { what: 'the list encounter to save' });
	let text = await read(o, NOTE);
	assert.equal(text, BODY.replace('> - 2 Goblin', '> - 3 Goblin').replace('  - 1 Goblin', '  - 2 Goblin'), 'only the two count lines changed');

	// Add a pin to the map in the callout, then to the plain one.
	const addPin = async (map, label) => {
		await map.locator('button[aria-label="Add pin"]').click();
		const view = map.locator('.nimble-map-viewport');
		await view.evaluate(el => el.scrollIntoView({ block: 'center' }));
		await o.page.waitForTimeout(200);
		const box = await view.boundingBox();
		await o.page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
		await o.page.locator('.modal', { hasText: 'New pin' }).locator('input').first().fill(label);
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(500);
	};
	const maps = o.page.locator(`${R} .nimble-map`);
	await o.waitFor(async () => (await maps.first().locator('button[aria-label="Add pin"]').count()) === 1, { what: 'the map toolbar' });
	await addPin(maps.first(), 'Kennel');
	await o.waitFor(async () => /\| Kennel/.test(await read(o, NOTE)), { what: 'the callout map to save' });
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-map`).count()) === 2, { what: 'the maps to re-render' });
	await addPin(o.page.locator(`${R} .nimble-map`).nth(1), 'Well');
	await o.waitFor(async () => /\| Well/.test(await read(o, NOTE)), { what: 'the plain map to save' });
	text = await read(o, NOTE);
	const lines = text.split('\n');
	for (const keep of ['Intro line.', '> [!note] Ambush', '> Before the fight.', '> After the fight.', '- A list item', '- Next item', '> [!info] The cave', '> Above the map.', '> Below the map.', 'Outro line.', '> - 20, 20 | Gate']) {
		assert.ok(lines.includes(keep), `"${keep}" is still there:\n${text}`);
	}
	const kennel = lines.find(l => l.includes('| Kennel'));
	const well = lines.find(l => l.includes('| Well'));
	assert.match(kennel, /^> - /, 'the pin in the callout keeps its quote marker');
	assert.match(well, /^- /, 'the pin in the plain map has none');
	assert.equal(lines.filter(l => /^> ```/.test(l)).length, 4, 'the callout fences are intact');

	// Embedded in another note: an edit either saves to the note the map lives in, or isn't offered. Never a pin that vanishes.
	await o.openFile('Nested embed.md', 'preview');
	const embedded = o.page.locator(`${R} .markdown-embed .nimble-map`);
	await o.waitFor(async () => (await embedded.count()) === 2, { what: 'the embedded maps' });
	await o.page.waitForTimeout(700);
	if (await embedded.nth(1).locator('button[aria-label="Add pin"]').count()) {
		await addPin(embedded.nth(1), 'Shrine');
		await o.waitFor(async () => /^- .*\| Shrine/m.test(await read(o, NOTE)), { what: 'the pin added through the embed to save' });
		assert.ok((await read(o, NOTE)).includes('> Below the map.'));
	}
	await o.eval(async (app) => { for (const f of ['Nested blocks.md', 'nested-map.png', 'Nested embed.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); } });
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

test('3D dice: a roll from inside a modal draws above the modal', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o, { stayMs: 3000 });
	await o.eval((app, plugin) => plugin.openSettings());
	await o.page.locator('.modal-container').first().waitFor();
	await o.eval((app, plugin) => plugin.rollDice('1d20', 'From a modal', 'effect', [11]));
	await o.waitFor(async () => (await o.page.locator('canvas.nimble-dice3d-overlay').count()) === 1, { what: 'the overlay' });
	const order = await o.page.evaluate(() => {
		const dice = document.querySelector('canvas.nimble-dice3d-overlay');
		const modal = document.querySelector('.modal-container');
		return { dice: Number(getComputedStyle(dice).zIndex), modal: Number(getComputedStyle(modal).zIndex), diceParent: dice.parentElement === document.body };
	});
	assert.ok(order.dice > order.modal, `dice (${order.dice}) above the modal (${order.modal})`);
	assert.ok(order.diceParent, 'the overlay is a direct child of the page, not trapped under a modal');
	await o.page.screenshot({ path: join(ARTIFACTS, 'dice-over-modal.png') });
	await o.eval(() => document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()));
	await diceReset(o);
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

test('3D dice: a crit with Judgment Dice in it still explodes one die at a time', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o, { effects: { crit: 'ring' } });
	// Faces in order: primary 6 (crit), explosions 6 then 2, then Judgment Dice 4 and 3.
	const st = await throwAndLand(o, (app, plugin) => {
		const faces = [6, 6, 2, 4, 3];
		let i = 0;
		const real = Math.random;
		Math.random = () => (faces[i++ % faces.length] - 0.5) / 6;
		try {
			plugin.rollWithEdge({ dice: { count: 1, sides: 6, modifier: 2 }, edge: 0, attack: true, extras: [{ label: 'Judgment Dice', count: 2, sides: 6, damageType: 'radiant' }] }, 'Crit with Judgment Dice');
		} finally { Math.random = real; }
	});
	assert.equal(st.segmentsMs.length - 1, 2, 'two explosions, each after the one before');
	assert.equal(st.effects, 2, 'a ring per explosion');
	assert.deepEqual([...st.shown].sort(), [2, 3, 4, 6, 6], 'the Judgment Dice are on the table too');
	const log = (await o.eval((app, plugin) => plugin.settings.rollLog))[0];
	assert.equal(log.total, 6 + 6 + 2 + 4 + 3 + 2);
	await diceReset(o);
});

test('3D dice: every effect plays (no shader errors), on light and dark themes', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	const ids = await o.eval(() => null) ?? ['ring', 'sparks', 'embers', 'stars', 'twinkle', 'shooting', 'nebula', 'supernova', 'arcane', 'confetti', 'smoke', 'shatter', 'gloom'];
	for (const theme of ['theme-light', 'theme-dark']) {
		await o.eval((app, plugin, theme) => { document.body.classList.remove('theme-light', 'theme-dark'); document.body.classList.add(theme); }, theme);
		for (const fx of ids) {
			await diceReset(o, { speed: 3, effects: { crit: 'none', miss: 'none', max: fx, min: 'none' } });
			const st = await throwAndLand(o, (app, plugin) => plugin.workshopRoll({ pool: [{ sides: 6, count: 1 }], test: 'max' }));
			assert.equal(st.effects, 1, `${fx} (${theme}) plays`);
		}
	}
	await o.eval(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); });
	await o.page.waitForTimeout(800); // let the last effects finish drawing (shader errors would show in the console check)
	await diceReset(o);
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

test('Dice Workshop: tests beside their effects, primary die, pool chips, look, motion', async (o) => {
	if (!(await webgl(o))) { console.log('      (skipped: no WebGL in this run)'); return; }
	await diceReset(o, { effects: { crit: 'ring', miss: 'ring', max: 'supernova', min: 'gloom' } });
	await o.eval((app, plugin) => plugin.openSettings());
	await o.page.locator('.nimble-dice-workshop-cta button', { hasText: 'Open Dice Workshop' }).click();
	const ws = o.page.locator('.modal.nimble-dice-workshop');
	await ws.waitFor();
	assert.equal(await ws.locator('.modal-title').innerText(), 'Dice Workshop');
	assert.equal(await o.page.locator('.modal-container').count(), 2, 'it opens over settings');
	assert.deepEqual(await ws.locator('.nimble-workshop-moment').allInnerTexts(), ['Crit', 'Miss', 'Max', 'Min', 'Pool']);
	assert.equal(await ws.locator('select[data-field="primary"]').inputValue(), '4', 'the primary die starts as a d4');
	// Crit: a d4 exploding twice by default, one burst per explosion.
	let st = await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="crit"]').click());
	assert.equal(st.segmentsMs.length, 3);
	assert.deepEqual(st.shown.slice(0, 2), [4, 4]);
	assert.equal(st.effects, 2);
	// Bigger primary die, more explosions.
	await ws.locator('select[data-field="primary"]').selectOption('8');
	await ws.locator('select[data-field="explosions"]').selectOption('3');
	st = await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="crit"]').click());
	assert.deepEqual(st.shown.slice(0, 3), [8, 8, 8]);
	assert.equal(st.effects, 3);
	// Miss on the primary die.
	st = await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="miss"]').click());
	assert.deepEqual(st.shown, [1]);
	// Pool chips: starts 2d6 + 1d20; click adds, right-click removes.
	assert.deepEqual(await ws.locator('.nimble-workshop-die.has-dice').evaluateAll(els => els.map(e => e.textContent)), ['d62', 'd201']);
	await ws.locator('.nimble-workshop-die[data-sides="4"]').click();
	await ws.locator('.nimble-workshop-die[data-sides="20"]').click({ button: 'right' });
	assert.deepEqual(await ws.locator('.nimble-workshop-die.has-dice').evaluateAll(els => els.map(e => e.textContent)), ['d41', 'd62']);
	st = await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="pool"]').click());
	assert.equal(st.shown.length, 3);
	assert.match(await ws.locator('.nimble-workshop-result').innerText(), new RegExp(`^Pool · 1d4 \\+ 2d6 · ${st.shown.join(', ')}$`));
	// Max rolls the pool with every die on its highest face.
	st = await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="max"]').click());
	assert.deepEqual(st.shown.slice().sort((a, b) => a - b), [4, 6, 6]);
	assert.equal(st.effects, 3);
	// Changing an effect saves it and plays it straight away.
	st = await throwAndLand(o, () => { const sel = document.querySelector('.nimble-dice-workshop select[data-event="miss"]'); sel.value = 'shatter'; sel.dispatchEvent(new Event('change')); });
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.effects.miss), 'shatter');
	assert.deepEqual(st.shown, [1], 'the preview is a miss');
	// Size slider saves.
	await ws.locator('input[aria-label="Size"]').evaluate(el => { el.value = '200'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.size), 2);
	// Try a look, then keep it.
	await ws.locator('select[data-field="look"]').selectOption('oak');
	await throwAndLand(o, () => document.querySelector('.nimble-workshop-moment[data-event="pool"]').click());
	assert.equal(await o.eval((app, plugin) => plugin.settings.dice.normal), 'bone', 'trying a look doesn\'t change your dice');
	await ws.locator('.nimble-workshop-keep').click();
	await o.waitFor(() => o.eval((app, plugin) => plugin.settings.dice.normal === 'oak'), { what: 'the look to be kept' });
	await o.page.screenshot({ path: join(ARTIFACTS, 'dice-workshop.png') });
	// The command palette opens it too.
	await o.eval(() => document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()));
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:dice-workshop'));
	await o.page.locator('.modal.nimble-dice-workshop').waitFor();
	await o.eval(() => document.querySelectorAll('.modal-container .modal-close-button').forEach(n => n.click()));
	await diceReset(o);
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

test('settings: a change synced from another device is picked up, and a damaged file is set aside', async (o) => {
	await resetEncounter(o, { party: PARTY });
	const DIR = '.obsidian/plugins/nimble-gm';
	const DATA = `${DIR}/data.json`;
	const reload = async () => {
		await o.eval(async (app) => { await app.plugins.disablePlugin('nimble-gm'); await app.plugins.enablePlugin('nimble-gm'); });
		await o.waitFor(() => o.eval((app) => !!app.plugins.plugins['nimble-gm']?._loaded), { what: 'the plugin to load' });
	};
	// Another device changed the party; Sync delivered the file. Nothing here may write the old party back over it.
	const good = await o.eval(async (app, plugin, data) => {
		await plugin.saveSettings();
		const good = await app.vault.adapter.read(data);
		const j = JSON.parse(good);
		j.party[0].name = 'Synced Hero';
		await app.vault.adapter.write(data, JSON.stringify(j));
		await plugin.onExternalSettingsChange();
		return good;
	}, DATA);
	assert.equal(await o.eval((app, plugin) => plugin.settings.party[0].name), 'Synced Hero', 'the synced party is in use');
	await o.eval(async (app, plugin) => { plugin.runtime('nimble').encounters.trigger('changed'); await plugin.saveSettings(); });
	assert.equal(JSON.parse(await read(o, DATA)).party[0].name, 'Synced Hero', 'and the next save keeps it');

	// A file a sync conflict left unreadable: the plugin still loads, and the bad file is kept beside it.
	const errorsBefore = o.consoleErrors.length;
	await o.eval(async (app, _p, data) => { await app.vault.adapter.write(data, '{broken'); }, DATA);
	await reload();
	assert.ok(await o.eval((app, plugin) => Array.isArray(plugin.settings.party) && Array.isArray(plugin.settings.encounters)), 'running on defaults');
	const copies = await o.eval(async (app, _p, dir) => (await app.vault.adapter.list(dir)).files.filter(f => /data\.broken-/.test(f)), DIR);
	assert.equal(copies.length, 1, 'one copy of the damaged file');
	assert.equal(await read(o, copies[0]), '{broken');
	// Oddly shaped but readable data loads without a fuss.
	await o.eval(async (app, _p, data) => { await app.vault.adapter.write(data, JSON.stringify({ encounters: [null, { creatures: 'x' }], dice: { styles: [null] }, party: 'nope' })); }, DATA);
	await reload();
	assert.ok(await o.eval((app, plugin) => Array.isArray(plugin.settings.encounters) && plugin.settings.encounters.every(e => e && Array.isArray(e.creatures))), 'bad entries are dropped');

	// Put the real settings back for the tests that follow.
	await o.eval(async (app, _p, [data, good, copies]) => { for (const c of copies) await app.vault.adapter.remove(c); await app.vault.adapter.write(data, good); }, [DATA, good, copies]);
	await reload();
	await o.eval(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
	o.consoleErrors.length = errorsBefore; // the damaged file is reported to the console on purpose
});

test('player campaign: roster, lore cards, battle notes, GM tools hidden, switch sides', async (o) => {
	try {
		await resetEncounter(o);
		await o.eval(async (app, plugin) => {
			document.querySelectorAll('.menu').forEach(n => n.remove());
			app.vault.setConfig('trashOption', 'local');
			const old = app.vault.getAbstractFileByPath('Campaigns/Ironbrow Saga');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Ironbrow Saga', level: 2, heroes: 4, starter: true, role: 'player', gm: 'Sam', character: 'Thorga' });
			await plugin.openCampaignView();
		});
		await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-hero.is-mine`).count()) >= 1, { what: 'my character in the roster' });
		assert.match(await o.page.locator(`${CP} .campaign-role-pill`).first().innerText(), /^player$/i);
		assert.match(await o.page.locator(`${CP} .campaign-hero.is-mine`).first().innerText(), /Thorga[\s\S]*you/i);
		assert.deepEqual(await o.page.evaluate((cp) => [...(document.querySelector(cp)?.querySelectorAll('.campaign-section-name') ?? [])].map(e => e.textContent), CP), ['Sessions', 'Quests', 'NPCs', 'Locations', 'Party', 'Assets']);
		const home = await read(o, 'Campaigns/Ironbrow Saga/Ironbrow Saga.md');
		assert.match(home, /role: player/);
		assert.match(home, /gm: "Sam"/);
		assert.match(await read(o, 'Campaigns/Ironbrow Saga/Party/Thorga.md'), /nimble: character[\s\S]*mine: true[\s\S]*```nimble-sheet/);

		// GM tools are out of the palette, and the tracker says why.
		assert.equal(await o.eval((app, plugin) => plugin.playerView()), true);
		assert.equal(await o.eval((app) => app.commands.findCommand('nimble-gm:open-tracker').checkCallback(true)), false);
		assert.equal(await o.eval((app) => app.commands.findCommand('nimble-gm:build-encounter').checkCallback(true)), false);

		// Session notes with battle notes: names, counts, outcome; no difficulty, no Run.
		await o.eval(async (app) => {
			await app.vault.create('Campaigns/Ironbrow Saga/Sessions/Session 1.md',
				'---\nnimble: session\n---\n# Session 1\n\nWe met `nimble:Goblin Taskmaster` at the ford.\n\n```nimble-encounter\nname: Ambush at the ford\noutcome: won\nloot: 40 gp\nmonsters:\n- 4 Goblin\n- Goblin Taskmaster\n- Mystery Hag\nnotes: The taskmaster fled north.\n```\n');
		});
		await o.openFile('Campaigns/Ironbrow Saga/Sessions/Session 1.md', 'preview');
		const block = o.page.locator(`${R} .nimble-battle-notes`);
		await o.waitFor(async () => (await block.count()) === 1, { what: 'battle notes' });
		assert.match(await block.locator('.battle-outcome').innerText(), /won/i);
		assert.equal(await block.locator('.nimble-difficulty').count(), 0);
		assert.equal(await block.locator('button', { hasText: 'Run' }).count(), 0);
		assert.match(await block.innerText(), /4×[\s\S]*Goblin[\s\S]*Mystery Hag[\s\S]*40 gp[\s\S]*fled north/);
		// References are names and lore: no level, no + to add.
		const ref = o.page.locator(`${R} p .nimble-inline-ref`).first();
		assert.equal(await ref.locator('.nimble-inline-level').count(), 0);
		assert.equal(await ref.locator('.nimble-inline-add-btn').count(), 0);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-session.png') });

		// A quick look is a lore card.
		await ref.locator('.nimble-inline-name').click();
		await o.waitFor(async () => (await o.page.locator('.modal .nimble-lore-card').count()) === 1, { what: 'lore card' });
		assert.equal(await o.page.locator('.modal .nimble-lore-card .stat-badge').count(), 0);
		assert.equal(await o.page.locator('.modal .nimble-lore-card .monster-attacks, .modal .nimble-lore-card .ability').count(), 0);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-lore.png') });
		await o.page.keyboard.press('Escape');

		// The outcome chip changes the outcome in the note.
		await block.locator('.battle-outcome').click();
		await clickMenu(o, 'Fled');
		await o.waitFor(async () => /outcome: fled/.test(await read(o, 'Campaigns/Ironbrow Saga/Sessions/Session 1.md')), { what: 'outcome written' });

		// The compendium's creatures are names and lore: no levels, no stats.
		await o.eval((app, plugin) => plugin.runtime('nimble').openBestiary());
		await o.waitFor(async () => (await o.page.locator('.nimble-compendium.is-lore .nimble-cmpx-row[data-id]').count()) > 0, { what: 'lore compendium' });
		assert.equal(await o.page.locator('.nimble-compendium .nimble-cmpx-seg[data-segment="adversaries"] .nimble-cmpx-seg-label').textContent(), 'Creatures');
		assert.equal(await o.page.locator('.nimble-compendium .nimble-cmpx-row-badge.is-level').count(), 0);
		await o.page.waitForSelector('.nimble-compendium .nimble-cmpx-detail .nimble-lore-card', { timeout: 3000 });
		assert.equal(await o.page.locator('.nimble-compendium .nimble-cmpx-detail .stat-badge').count(), 0);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-bestiary.png') });

		// Switch sides from Campaign settings: the same block is a GM encounter again.
		await o.page.locator(`${CP} .campaign-switch-btn`).first().click();
		assert.ok((await menuTitles(o)).includes('Campaign settings…'));
		await clickMenu(o, 'Switch to GM view');
		await o.waitFor(async () => /role/.test(await read(o, 'Campaigns/Ironbrow Saga/Ironbrow Saga.md')) === false, { what: 'role removed' });
		await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-role-pill`).first().innerText()) === 'GM', { what: 'GM pill' });
		await o.openFile('Campaigns/Ironbrow Saga/Sessions/Session 1.md', 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .nimble-encounter-block .nimble-difficulty`).count()) === 1, { what: 'GM encounter block' });
		assert.equal(await o.page.locator(`${R} .nimble-battle-notes`).count(), 0);
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Ironbrow Saga');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
			app.workspace.getLeavesOfType('nimble-bestiary').forEach(l => l.detach());
		});
		await o.page.waitForTimeout(400);
	}
});

// ---------------------------------------------------------------------------
// Character sheet

const SHEET_NOTE = 'Characters/Thorga Ironbrow.md';
const sheetFm = (o) => o.eval((app, _p, path) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.frontmatter ?? null, SHEET_NOTE);
const setTheme = (o, theme) => o.eval((app, plugin, theme) => { document.body.classList.remove('theme-light', 'theme-dark'); document.body.classList.add(theme); }, theme);

/** Camp on a sheet, then pick Field rest, Safe rest or Level up. */
async function camp(o, sheet, which) {
	await sheet.locator('.ns-camp').first().click();
	const d = o.page.locator('.modal.ns-camp-dialog');
	await d.waitFor({ timeout: 3000 });
	await o.page.waitForTimeout(200);
	await d.screenshot({ path: join(ARTIFACTS, `camp-${which.toLowerCase().replace(/\s+/g, '-')}.png`) });
	await d.locator('.ns-camp-card', { hasText: which }).click();
	await d.waitFor({ state: 'detached', timeout: 3000 });
}

/** Roll from the roll dialog a sheet roll opens. */
async function rollThrough(o) {
	const d = o.page.locator('.modal.nimble-roll-dialog');
	await d.waitFor({ timeout: 3000 });
	await d.locator('.rd-roll').click();
	await d.waitFor({ state: 'detached', timeout: 3000 });
}

/** Keep the fixture note as it was, whatever a test did to it. */
async function withSheetNote(o, fn) {
	const original = await o.eval((app, _p, path) => app.vault.cachedRead(app.vault.getAbstractFileByPath(path)), SHEET_NOTE);
	try {
		await fn();
	} finally {
		await o.eval(async (app, _p, [path, text]) => { await app.vault.modify(app.vault.getAbstractFileByPath(path), text); }, [SHEET_NOTE, original]);
		await setTheme(o, 'theme-light');
		await o.page.waitForTimeout(300);
	}
}

/** A note's frontmatter now. */
const sheetFmOf = (o, path) => o.eval((app, _p, path) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.frontmatter ?? null, path);

/** waitFm for any note. */
async function waitFmAt(o, path, check, what) {
	let fm = null;
	await o.waitFor(async () => { fm = await o.eval((app, _p, path) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.frontmatter ?? null, path); return fm && check(fm); }, { what });
	return fm;
}

/** Wait for the note's frontmatter to satisfy `check` (writes land through processFrontMatter, then the cache). */
async function waitFm(o, check, what) {
	await o.waitFor(async () => { const fm = await sheetFm(o); return fm && check(fm) ? fm : null; }, { what });
	return sheetFm(o);
}

test('character sheet: renders from frontmatter, rolls a save, takes damage, adds an item through the picker', async (o) => {
	await resetEncounter(o);
	await withSheetNote(o, async () => {
		await o.openFile(SHEET_NOTE);
		const p = o.page;
		const sheet = p.locator(`${R} .nimble-sheet`);
		await sheet.waitFor();
		const info = await p.evaluate((R) => {
			const s = document.querySelector(`${R} .nimble-sheet`);
			const txt = (sel) => [...s.querySelectorAll(sel)].map(e => e.textContent.trim());
			return {
				name: s.querySelector('.ns-name')?.textContent,
				line: s.querySelector('.ns-line')?.textContent,
				stats: txt('.ns-stat-value'),
				// The stat's name (its ▲ / ▼ badge is a child of the label).
				adv: [...s.querySelectorAll('.ns-stat.is-adv .ns-stat-label')].map(e => e.firstChild.textContent.trim()),
				dis: [...s.querySelectorAll('.ns-stat.is-dis .ns-stat-label')].map(e => e.firstChild.textContent.trim()),
				// The save marks are the official sheet's triangles: filled above a stat for its ▲ save, below for its ▼ one,
				// centred on the stat's box.
				saveMarks: [...s.querySelectorAll('.ns-stat .ns-tri.is-on')].map(t => {
					const b = t.closest('.ns-stat-box').getBoundingClientRect();
					const r = t.getBoundingClientRect();
					const stat = t.closest('.ns-stat').querySelector('.ns-stat-label').textContent;
					return { dir: t.classList.contains('is-up') ? '▲' : '▼', stat, dx: Math.abs((r.left + r.right) / 2 - (b.left + b.right) / 2), edge: t.classList.contains('is-up') ? r.top - b.top : b.bottom - r.bottom };
				}),
				tris: s.querySelectorAll('.ns-stat .ns-tri').length,
				hp: s.querySelector('.ns-hp-cur')?.textContent + '/' + s.querySelector('.ns-hp-max')?.textContent,
				armor: s.querySelector('.ns-box-armor .ns-box-value')?.textContent,
				wounds: s.querySelectorAll('.ns-pip').length,
				woundsOn: s.querySelectorAll('.ns-pip.is-on').length,
				skills: txt('.ns-skill-total'),
				tabs: txt('.ns-tab-label'),
				conds: txt('.ns-cond-name'),
				attacks: txt('.ns-row.is-weapon .ns-roll'),
				propsHidden: [...document.querySelectorAll(`${R} .metadata-container`)].every(m => getComputedStyle(m).display === 'none'),
				inner: s.innerHTML.includes('<script'),
			};
		}, R);
		assert.equal(info.name, 'Thorga Ironbrow');
		assert.equal(info.line, 'Dwarf · Berserker · Level 3');
		assert.deepEqual(info.stats, ['2', '2', '−1', '0'], 'stats as the official sheet prints them');
		assert.deepEqual(info.adv, ['STR']);
		assert.deepEqual(info.dis, ['INT']);
		assert.deepEqual(info.saveMarks.map(m => `${m.dir}${m.stat}`), ['▲STR', '▼INT'], 'filled marks only for the advantaged and disadvantaged saves');
		assert.equal(info.tris, 8, 'every stat has both marks (outlines when not its save)');
		for (const m of info.saveMarks) assert.ok(m.dx < 0.6 && Math.abs(m.edge) < 0.6, `${m.dir} sits centred on its box's edge: ${JSON.stringify(m)}`);
		assert.equal(info.hp, '20/32');
		assert.equal(info.armor, '8', 'Rusty Mail 6+DEX (max 2)');
		assert.equal(info.wounds, 7, 'Dwarf: +1 max Wounds');
		assert.equal(info.woundsOn, 1);
		assert.equal(info.skills[6], '+6', 'Might: STR 2 + 2 points + 2 Berserker Skilled Hero');
		assert.deepEqual(info.tabs, ['Actions', 'Features', 'Inventory', 'Notes']);
		assert.deepEqual(info.conds, ['Dazed']);
		assert.deepEqual(info.attacks, ['1d10 + 2', '1d6 + 2']);
		// Damage buttons say the damage type with an icon, not a die (the dice are on the button).
		assert.deepEqual(await sheet.locator('.ns-row.is-weapon .ns-roll').evaluateAll(bs => bs.map(b => !!b.querySelector('.ns-dmg-t svg'))), [true, true], 'damage type icons');
		// The sheet wears Nimble's look.
		assert.ok(await sheet.evaluate(el => el.classList.contains('ev-sys-nimble')), 'the sheet carries .ev-sys-nimble');
		assert.ok(info.propsHidden, 'the Properties box is hidden on character notes');
		await p.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-light.png') });
		await sheet.locator('.ns-stats').screenshot({ path: join(ARTIFACTS, 'sheet-stats.png') });

		// Show properties, then hide them again.
		await sheet.locator('.ns-head-actions [aria-label="Show properties"]').click();
		await p.waitForTimeout(150);
		assert.ok(await p.evaluate((R) => [...document.querySelectorAll(`${R} .metadata-container`)].some(m => getComputedStyle(m).display !== 'none'), R), 'properties shown');
		await sheet.locator('.ns-head-actions [aria-label="Hide properties"]').click();

		// A STR save: the roll dialog starts at advantage (Berserker ▲); roll it, labelled with the hero.
		await sheet.locator('.ns-stat.is-adv .ns-stat-box').click();
		const dlg = p.locator('.modal.nimble-roll-dialog');
		await dlg.waitFor();
		// It opens on a STR check: no advantage (that's for saves).
		assert.equal(await dlg.locator('.rd-mode-btn.is-on').innerText(), 'Check');
		assert.equal(await dlg.locator('.modal-title').textContent(), 'Thorga Ironbrow · STR check');
		assert.equal(await dlg.locator('.rd-edge-value').textContent(), 'Normal');
		// Save: STR is Thorga's ▲ save, so it goes to advantage. Nothing moves when you switch.
		const h0 = await dlg.evaluate(el => el.getBoundingClientRect().height);
		await dlg.locator('.rd-mode-btn', { hasText: 'Save' }).click();
		assert.equal(await dlg.evaluate(el => el.getBoundingClientRect().height), h0, 'the dialog keeps its height switching Check → Save');
		assert.equal(await dlg.locator('.modal-title').textContent(), 'Thorga Ironbrow · STR save');
		assert.equal(await dlg.locator('.rd-edge-value').textContent(), 'Advantage');
		assert.equal(await dlg.locator('.rd-seg-btn.is-on').textContent(), '+1');
		await dlg.screenshot({ path: join(ARTIFACTS, 'roll-dialog-advantage.png') });
		const segBad = await p.evaluate(pillOffenders, { root: '.modal.nimble-roll-dialog', tolerance: 1, selectors: PILL_SELECTORS });
		assert.deepEqual(segBad, [], 'misaligned pills in the roll dialog');
		await dlg.locator('.rd-roll').click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.settings.rollLog[0]?.label ?? null), { what: 'a save in the roll log' });
		const save = (await o.eval((app, plugin) => plugin.settings.rollLog))[0];
		assert.match(save.label, /^Thorga Ironbrow · STR save/);
		assert.equal(save.expression, '1d20+2 adv 1');
		const [kept, dropped] = save.detail.match(/^\[(\d+)\] \(dropped (\d+)\)/).slice(1).map(Number);
		assert.ok(kept >= dropped, 'keeps the higher d20');
		assert.equal(save.total, kept + 2);

		// A skill check and an attack roll.
		await sheet.locator('.ns-skill', { hasText: 'Might' }).click();
		await rollThrough(o);
		await o.waitFor(async () => /Thorga Ironbrow · Might check/.test((await o.eval((app, plugin) => plugin.settings.rollLog[0]?.label)) ?? ''), { what: 'the Might check logged' });
		await sheet.locator('.ns-row.is-weapon', { hasText: 'Battleaxe' }).locator('.ns-roll').click();
		await rollThrough(o);
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.rollLog[0]?.label)) === 'Thorga Ironbrow · Battleaxe', { what: 'the Battleaxe roll logged' });

		// Damage through the HP pad: 5 off 20.
		await sheet.locator('.ns-hp').click();
		await p.locator('.nimble-hp-pad').waitFor();
		await p.keyboard.type('5');
		await p.keyboard.press('Enter');
		let fm = await waitFm(o, f => f.hp === 15, 'hp 15 in the frontmatter');
		assert.equal(fm.hp, 15);
		await p.waitForFunction((R) => document.querySelector(`${R} .ns-hp-cur`)?.textContent === '15', R);

		// Temp HP soaks first.
		await sheet.locator('.ns-hp').click();
		await p.locator('.nimble-hp-pad .hp-pad-mode', { hasText: 'Temp' }).click();
		await p.keyboard.type('4');
		await p.keyboard.press('Enter');
		await waitFm(o, f => f.temp_hp === 4, 'temp hp');
		await sheet.locator('.ns-hp').click();
		await p.keyboard.type('6');
		await p.keyboard.press('Enter');
		fm = await waitFm(o, f => f.temp_hp === 0 && f.hp === 13, 'temp first, then hp');

		// A wound pip.
		await sheet.locator('.ns-pip').nth(1).click();
		await waitFm(o, f => f.wounds === 2, 'two wounds');

		// Inventory: add an item through the compendium dialog, set to items.
		await sheet.locator('.ns-tab[data-tab="inventory"]').click();
		await sheet.locator('.ns-tabpanel-inventory .ns-add.is-big').click();
		const S = '.modal.nimble-cmpx-modal';
		const sInput = p.locator(`${S} .nimble-cmpx-input`);
		await sInput.waitFor();
		assert.match(await p.locator(`${S} .modal-title`).textContent(), /inventory/);
		await o.waitFor(() => p.evaluate((S) => document.activeElement === document.querySelector(`${S} .nimble-cmpx-input`), S), { timeout: 3000, what: 'the search box focused' });
		assert.equal(await p.locator(`${S} .nimble-cmpx-seg`).count(), 0, 'one tab: no segmented control');
		const ids = () => p.evaluate((S) => [...document.querySelectorAll(`${S} .nimble-cmpx-row[data-id]`)].map(r => r.dataset.id), S);
		assert.ok((await ids()).length > 20 && (await ids()).every(id => id.startsWith('item:')), 'only items');
		// Weapons only, by a typed filter.
		await p.keyboard.type('category:weapon ', { delay: 10 });
		await o.waitFor(async () => (await p.locator(`${S} .nimble-cmpx-chip`).count()) === 1, { timeout: 3000, what: 'the category chip' });
		assert.equal(await p.locator(`${S} .nimble-cmpx-chip-key`).textContent(), 'Category');
		await o.waitFor(async () => (await ids()).some(id => id === 'item:battleaxe'), { timeout: 3000, what: 'weapons listed' });
		assert.ok(!(await ids()).includes('item:healingpotion'), 'no potions among the weapons');
		// Backspace reopens the chip (its value back in the box); clear it, and Backspace again drops the chip.
		await p.keyboard.press('Backspace');
		await p.keyboard.press('ControlOrMeta+a');
		await p.keyboard.press('Delete');
		await p.keyboard.press('Backspace');
		await sInput.fill('healing potion');
		await o.waitFor(async () => (await p.locator(`${S} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === 'Healing Potion', { timeout: 3000, what: 'Healing Potion selected' });
		assert.equal(await p.locator(`${S} .nimble-cmpx-chip`).count(), 0, 'Backspace took the chip back');
		await p.keyboard.press('Enter');
		fm = await waitFm(o, f => f.inventory?.includes('Healing Potion'), 'the potion in the inventory');
		assert.equal(await p.locator(S).count(), 0, 'picker closes');
		await p.waitForFunction((R) => [...document.querySelectorAll(`${R} .ns-row.is-item .ns-row-name`)].some(e => e.textContent === 'Healing Potion'), R);

		// Quantity stepper and equip toggle.
		const potion = sheet.locator('.ns-row.is-item', { hasText: 'Healing Potion' });
		await potion.locator('.ns-step[aria-label^="One more"]').click();
		fm = await waitFm(o, f => f.inventory?.some(e => e?.name === 'Healing Potion' && e.qty === 2), 'two potions');
		await sheet.locator('.ns-row.is-item', { hasText: 'Rusty Mail' }).locator('.ns-equip').click();
		await waitFm(o, f => f.inventory?.includes('Rusty Mail'), 'mail unequipped');
		await p.waitForFunction((R) => document.querySelector(`${R} .ns-box-armor .ns-box-value`)?.textContent === '2', R);

		// Expand a compendium entry inline: text, source, page.
		await sheet.locator('.ns-tab[data-tab="features"]').click();
		await sheet.locator('.ns-row', { hasText: 'Death Blow' }).locator('.ns-row-toggle').click();
		const body = await sheet.locator('.ns-row.is-open .ns-row-body').innerText();
		assert.match(body, /Whenever you crit/);
		assert.match(body, /Berserker 3\.1/);
		await sheet.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-features.png') });

		// Spotlight's normal search finds compendium entries and opens their card.
		await p.keyboard.press('Escape');
		await o.eval((app, plugin) => plugin.toggleSpotlight());
		await p.locator('.modal-container .prompt.nimble-spotlight .prompt-input').fill('battleaxe');
		await p.waitForTimeout(200);
		const row = p.locator('.modal-container .prompt.nimble-spotlight .suggestion-item.spot-compendium', { hasText: 'Battleaxe' });
		await row.first().click();
		await p.locator('.modal.nimble-cmp-modal').waitFor();
		assert.match(await p.locator('.modal.nimble-cmp-modal').innerText(), /1d10\+STR slashing/);
		// Escape goes back to Spotlight (still on "battleaxe"); a second Escape closes it.
		await p.keyboard.press('Escape');
		await p.locator('.modal-container .prompt.nimble-spotlight .prompt-input').waitFor();
		await p.keyboard.press('Escape');
		await o.waitFor(async () => (await p.locator('.modal-container .prompt.nimble-spotlight').count()) === 0, { what: 'Spotlight closed' });

		// Edit mode: change a stat.
		await sheet.locator('.ns-head-actions [aria-label="Edit details and stats"]').click();
		await p.waitForTimeout(150);
		await sheet.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-editing.png'), clip: undefined });
		// Moving between fields keeps going while the sheet redraws: type a height, Tab, and keep typing the weight.
		const height = sheet.locator('input[data-key="height"]');
		await height.click();
		await p.keyboard.press('ControlOrMeta+a');
		await p.keyboard.type('4\'6"');
		await p.keyboard.press('Tab');
		await p.keyboard.type('185 lb');
		await waitFm(o, f => f.height === '4\'6"', 'height saved on Tab');
		await p.waitForTimeout(400); // the redraw from saving the height has happened
		const focused = await p.evaluate(() => ({ key: document.activeElement?.getAttribute('data-key'), value: document.activeElement?.value }));
		assert.deepEqual(focused, { key: 'weight', value: '185 lb' }, 'still in Weight, with what was typed');
		await p.keyboard.press('Tab');
		await waitFm(o, f => f.weight === '185 lb', 'weight saved');
		const dex = sheet.locator('.ns-stat-input').nth(1);
		await dex.fill('3');
		await dex.press('Enter');
		await dex.evaluate(el => el.blur());
		await waitFm(o, f => f.dex === 3, 'dex 3');
		await sheet.locator('.ns-head-actions [aria-label="Done editing"]').click();

		// Safe rest restores HP and heals a Wound.
		await camp(o, sheet, 'Safe rest');
		await p.locator('.modal-container button.mod-cta', { hasText: 'Rest' }).click();
		fm = await waitFm(o, f => f.hp === 32, 'rested');
		assert.equal(fm.wounds, 1);
		assert.equal(fm.resources['Fury Dice'], 0, 'rage dice empty after a rest');

		// Field rest: make camp with 2 Hit Dice (each d12 max + STR 2) after taking 30.
		await o.eval(async (app, _p, path) => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), fm => { fm.hp = 2; }); }, SHEET_NOTE);
		await waitFm(o, f => f.hp === 2, 'hurt');
		await camp(o, sheet, 'Field rest');
		await p.locator('.nimble-sheet-dialog .ns-rest-pop .ns-step[aria-label="One more die"]').click();
		await p.locator('.nimble-sheet-dialog .ns-rest-pop button', { hasText: 'Make camp' }).click();
		fm = await waitFm(o, f => f.hp === 30, 'healed 28 by making camp');
		assert.equal(fm.hit_dice, 3);

		// Level up: a carousel wizard. Try a manual roll, then take the flat bonus (d12: 6), pick a Savage Arsenal option,
		// raise a key stat and a skill, and check the review before anything is written.
		await camp(o, sheet, 'Level up');
		const lv = p.locator('.modal.nimble-levelup');
		await lv.waitFor();
		assert.match(await lv.locator('.lu-panel.is-active').innerText(), /Enduring Rage/, 'level 4 features listed');
		const steps = await lv.locator('.lu-dot').allInnerTexts();
		assert.deepEqual(steps.map(t => t.trim()), ['Overview', 'Hit points', 'Savage Arsenal', 'Stats', 'Skills', 'Review']);
		const next = () => lv.locator('.lu-next').click();
		await next();
		// Hit points have to be decided before moving on.
		assert.equal(await lv.locator('.lu-next').isDisabled(), true);
		await lv.locator('.lu-hp-input').fill('20');
		assert.equal(await lv.locator('.lu-next').isDisabled(), true, 'a roll above the die is refused');
		await lv.locator('.lu-hp-input').fill('9');
		assert.match(await lv.locator('.lu-hp-new').innerText(), /^41$/);
		await lv.locator('.lu-hp-option', { hasText: 'Take the flat bonus' }).click();
		assert.match(await lv.locator('.lu-hp-new').innerText(), /^38$/);
		await next();
		await lv.locator('.lu-panel.is-active .lu-option', { hasText: 'Whirlwind' }).click();
		await next();
		await lv.locator('.lu-panel.is-active .lu-stat', { hasText: 'DEX' }).click();
		await next();
		// The new point goes to Stealth, and a point moves from Insight to Stealth too.
		const skill = (name) => lv.locator('.lu-panel.is-active .lu-skill-row', { hasText: name });
		await skill('Stealth').locator('.lu-step-btn.is-plus').click();
		assert.equal(await skill('Arcana').locator('.lu-step-btn.is-plus').isDisabled(), true, 'nothing left to place');
		assert.equal(await skill('Arcana').locator('.lu-step-btn').first().isDisabled(), true, 'no points of yours on Arcana to move');
		await skill('Insight').locator('.lu-step-btn').first().click();
		await skill('Stealth').locator('.lu-step-btn.is-plus').click();
		assert.match(await skill('Stealth').innerText(), /\+2/);
		// Going back keeps what was chosen.
		await lv.locator('.lu-dot', { hasText: 'Savage Arsenal' }).click();
		assert.equal(await lv.locator('.lu-panel.is-active .lu-option.is-chosen').count(), 1);
		await lv.locator('.lu-dot', { hasText: 'Review' }).click();
		const review = await lv.locator('.lu-panel.is-active .lu-review').innerText();
		assert.match(review, /32 → 38/);
		assert.match(review, /Whirlwind/);
		assert.match(review, /DEX/);
		assert.match(review, /Stealth/);
		assert.equal((await sheetFm(o)).level, 3, 'nothing written before the button');
		await lv.screenshot({ path: join(ARTIFACTS, 'sheet-level-up.png') });
		await next();
		fm = await waitFm(o, f => f.level === 4, 'level 4');
		assert.equal(fm.hp_max, 38);
		assert.equal(fm.hp, 36);
		assert.ok(fm.features.includes('Whirlwind'));
		assert.equal(fm.skills.stealth, 2);
		assert.equal(fm.skills.insight, 1);
		assert.equal(fm.dex, 4, 'DEX 3 (set earlier in this test) +1');
		await lv.locator('.lu-celebrate button').click();

		// Screens: desktop dark, and the Character panel.
		await sheet.locator('.ns-tab[data-tab="actions"]').click();
		await setTheme(o, 'theme-dark');
		await p.waitForTimeout(250);
		await p.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-dark.png') });
		await sheet.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-dark-crop.png') });
		await setTheme(o, 'theme-light');
		await sheet.locator('.ns-tab[data-tab="inventory"]').click();
		await sheet.screenshot({ path: join(ARTIFACTS, 'sheet-desktop-inventory.png') });
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:open-my-character'));
		await p.locator('.nimble-character-view .nimble-sheet').waitFor();
		assert.equal(await p.locator('.nimble-character-view .ns-name').innerText(), 'Thorga Ironbrow');
		await p.waitForTimeout(700); // the sidebar slides open
		const panel = await p.evaluate(() => { const v = document.querySelector('.nimble-character-view'); const sh = v.querySelector('.nimble-sheet'); return { view: v.clientWidth, sheet: sh.scrollWidth }; });
		assert.ok(panel.sheet <= panel.view, `the sheet fits the panel: ${JSON.stringify(panel)}`);
		await p.screenshot({ path: join(ARTIFACTS, 'sheet-panel.png') });
		const clippedInPanel = await p.evaluate(() => [...document.querySelectorAll('.nimble-character-view :is(.ns-box-label, .ns-skill-name, .ns-stat-label, .ns-tab-label, .ns-rc-name, .ns-scroll-title, .ev-pill-text)')]
			.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
		assert.deepEqual(clippedInPanel, [], 'labels cut off in the Character panel');
		// Tapping the sheet never scrolls the panel: an action dot and a wound pip, scrolled down.
		const scroller = await p.evaluateHandle(() => {
			const sheet = document.querySelector('.nimble-character-view .nimble-sheet');
			for (let el = sheet.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
			return null;
		});
		for (const [what, sel] of [['an action dot', '.ns-action-dot'], ['a wound pip', '.ns-pip:not(.is-skull)']]) {
			// The target in plain view (so the click needn't scroll to it), with the panel scrolled well down.
			await p.evaluate(([sc, sel]) => { const t = document.querySelector(`.nimble-character-view ${sel}`); sc.scrollTop += t.getBoundingClientRect().top - sc.getBoundingClientRect().top - 220; }, [scroller, sel]);
			await p.waitForTimeout(150);
			const before = await p.evaluate((sc) => sc.scrollTop, scroller);
			assert.ok(before > 100, `scrolled down first (${before})`);
			const fmBefore = JSON.stringify(await sheetFm(o));
			await p.locator(`.nimble-character-view ${sel}`).last().click();
			await o.waitFor(async () => JSON.stringify(await sheetFm(o)) !== fmBefore, { what: `${what} changes the note` });
			await p.waitForTimeout(400);
			assert.equal(await p.evaluate((sc) => sc.scrollTop, scroller), before, `tapping ${what} leaves the panel where it was`);
		}
		// Thin: the Actions bar wraps as whole groups, End turn on one line inside the bar, nothing past its edge.
		const end = await p.evaluate(() => {
			const bar = document.querySelector('.nimble-character-view .ns-turn');
			const b = bar.querySelector('.ns-actions-end');
			const r = b.getBoundingClientRect(), c = bar.getBoundingClientRect();
			return { text: b.innerText.trim(), oneLine: r.height < 34, inside: r.right <= c.right + 0.5 && [...bar.children].every(k => k.getBoundingClientRect().right <= c.right + 0.5) };
		});
		assert.deepEqual(end, { text: 'End turn', oneLine: true, inside: true }, JSON.stringify(end));
		// The rest of the panel, a screen at a time.
		for (const [i, sel] of [['2', '.ns-turn'], ['3', '.ns-rcards']].entries()) {
			if (sel[1] === '.ns-rcards') await p.locator('.nimble-character-view .ns-tab[data-tab="actions"]').click();
			await p.evaluate((sel) => document.querySelector(`.nimble-character-view ${sel}`)?.scrollIntoView({ block: 'start' }), sel[1]);
			await p.waitForTimeout(150);
			const box = await p.locator('.nimble-character-view').boundingBox();
			await p.screenshot({ path: join(ARTIFACTS, `sheet-panel-${sel[0]}.png`), clip: box });
			void i;
		}
		await o.eval((app) => app.workspace.getLeavesOfType('nimble-character').forEach(l => l.detach()));
	});
});

test('character sheet: Live Preview renders it too, and New character writes a note', async (o) => {
	await withSheetNote(o, async () => {
		await o.openFile(SHEET_NOTE, 'source');
		await o.page.locator(`${S} .nimble-sheet`).waitFor();
		assert.equal(await o.page.locator(`${S} .nimble-sheet .ns-name`).innerText(), 'Thorga Ironbrow');
		assert.ok(await o.page.evaluate((S) => [...document.querySelectorAll(`${S} .metadata-container`)].every(m => getComputedStyle(m).display === 'none'), S), 'properties hidden in Live Preview');
		await o.page.locator(`${S} .nimble-sheet`).screenshot({ path: join(ARTIFACTS, 'sheet-live-preview.png') });
	});
	await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-character'));
	const m = o.page.locator('.modal.nimble-newchar-modal');
	await m.waitFor();
	await m.locator('input[type="text"]').first().fill('Wren Ashdown');
	const selects = m.locator('select');
	await selects.nth(0).selectOption('Human');
	await selects.nth(1).selectOption('Mage');
	await selects.nth(2).selectOption('Min-Max');
	assert.match(await m.locator('.nimble-newchar-preview').innerText(), /10 HP/);
	await m.screenshot({ path: join(ARTIFACTS, 'sheet-new-character.png') });
	await m.locator('button.mod-cta', { hasText: 'Create' }).click();
	// It goes to the active campaign's Party folder, or the vault root when there's none (earlier tests may leave one active).
	const WREN = await o.waitFor(() => o.eval((app) => app.vault.getMarkdownFiles().find(f => f.basename === 'Wren Ashdown')?.path ?? null), { what: 'the new note' });
	const made = await o.waitFor(() => o.eval((app, _p, p) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(p))?.frontmatter ?? null, WREN), { what: 'its frontmatter' });
	assert.equal(made.nimble, 'character');
	assert.equal(made.class, 'Mage');
	assert.equal(made.int, 3);
	assert.equal(made.hp, 10);
	assert.ok(made.inventory.some(i => (i.name ?? i) === 'Adventurer’s Garb'));
	await o.openFile(WREN);
	const wren = o.page.locator(`${R} .nimble-sheet`);
	await wren.waitFor();
	await wren.locator('.ns-tab[data-tab="spells"]').click();
	const spells = await wren.locator('.ns-row.is-spell .ns-row-name').allInnerTexts();
	assert.ok(spells.includes('Flame Dart'), `a level 1 Mage knows the Fire cantrips: ${spells}`);
	await wren.locator('.ns-row.is-spell', { hasText: 'Flame Dart' }).locator('.ns-roll').click();
	await rollThrough(o);
	assert.equal((await o.eval((app, plugin) => plugin.settings.rollLog))[0].label, 'Wren Ashdown · Flame Dart');
	await wren.screenshot({ path: join(ARTIFACTS, 'sheet-mage-spells.png') });
	const text = await o.eval((app, _p, p) => app.vault.cachedRead(app.vault.getAbstractFileByPath(p)), WREN);
	assert.match(text, /```nimble-sheet\n```/);
	assert.match(text, /## Backstory/);
	await o.eval(async (app, _p, p) => { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f); }, WREN);
});

test('character sheet: Judgment Dice typed in from the table or rolled, all on the next attack; Fury Dice stay while Raging', async (o) => {
	const p = o.page;
	await resetEncounter(o);
	const ODO = 'Characters/Odo Brightshield.md';
	const R = '.markdown-reading-view';
	const bad = [];
	const measure = async (root) => bad.push(...await p.evaluate(pillOffenders, { root, tolerance: 1, selectors: PILL_SELECTORS }));
	try {
		await o.eval(async (app, _p, path) => {
			const old = app.vault.getAbstractFileByPath(path);
			if (old) await app.vault.delete(old);
			await app.vault.create(path, '---\nnimble: character\nclass: Oathsworn\nlevel: 1\nstr: 2\ndex: 0\nint: 0\nwil: 2\nhp: 17\nhp_max: 17\ninventory:\n  - Mace\n  - Shortbow\n---\n\n```nimble-sheet\n```\n');
		}, ODO);
		await o.openFile(ODO, 'preview');
		const sheet = p.locator(`${R} .nimble-sheet`);
		await sheet.waitFor();
		const held = sheet.locator('.ns-class .ns-feat', { hasText: 'Judgment Dice' });
		const count = (f) => { const v = f.resources?.['Judgment Dice']; return typeof v === 'object' && v ? v.current : v; };
		// The most a level 1 Oathsworn can hold, as empty slots: 2 (Oath of Vengeance and level 14 add more).
		assert.equal(await held.locator('.ns-held-die.is-empty').count(), 2, 'two empty slots to start');
		assert.equal(await held.locator('.ns-held-die:not(.is-empty)').count(), 0);
		// The formula is the name's tooltip; the chevron opens the book's words.
		await held.locator('.ns-feat-name').click();
		assert.match(await held.locator('.ns-feat-rule').innerText(), /Whenever an enemy attacks you, roll and set aside 2d6 Judgment Dice/);
		await held.locator('.ns-feat-name').click();
		assert.equal(await held.locator('.ns-feat-rule').isVisible(), false, 'the chevron closes it again');
		// Typed in from the table: tap an empty slot, then the face rolled.
		await held.locator('.ns-held-die.is-empty').first().click();
		const pick = sheet.locator('.ev-face-pick');
		await pick.waitFor();
		assert.match(await pick.locator('.ev-face-pick-label').textContent(), /^Add a Judgment die you rolled$/);
		assert.deepEqual(await pick.locator('.ev-face').allInnerTexts(), ['1', '2', '3', '4', '5', '6'], 'a d6: its faces in one row');
		assert.equal(await pick.locator('.ev-face-remove').count(), 0, 'nothing to remove when adding');
		await sheet.locator('.ns-class').screenshot({ path: join(ARTIFACTS, 'sheet-face-picker.png') });
		await measure(`${R} .nimble-sheet`);
		await pick.locator('.ev-face', { hasText: '4' }).click();
		await waitFmAt(o, ODO, f => count(f) === 1 && f.resources['Judgment Dice'].rolled?.[0] === 4, 'one Judgment Die showing 4');
		// The other rolled in the app: the slots are full, so Roll is off.
		await held.locator('.ns-btn', { hasText: /^Roll/ }).click();
		await waitFmAt(o, ODO, f => count(f) === 2 && f.resources['Judgment Dice'].rolled?.length === 2, 'two Judgment Dice');
		await p.waitForFunction((R) => document.querySelectorAll(`${R} .ns-class .ns-held-die:not(.is-empty) .ns-die-num`).length === 2, R);
		assert.ok(await held.locator('.ns-btn', { hasText: /^Roll/ }).isDisabled(), 'no more than the rules allow');
		// Changing one: its face is pressed, and it can go.
		await held.locator('.ns-held-die').first().click();
		await pick.waitFor();
		assert.match(await pick.locator('.ev-face-pick-label').textContent(), /^Judgment die: change it to$/);
		assert.deepEqual(await pick.locator('.ev-face.is-on').allInnerTexts(), ['4'], 'the face it shows is pressed');
		await pick.locator('.ev-face', { hasText: '6' }).click();
		await waitFmAt(o, ODO, f => f.resources['Judgment Dice'].rolled?.[0] === 6, 'changed to 6');
		await held.locator('.ns-held-die').nth(1).click();
		await pick.locator('.ev-face-remove').click();
		await waitFmAt(o, ODO, f => count(f) === 1, 'one removed');
		await held.locator('.ns-held-die.is-empty').first().click();
		await pick.locator('.ev-face', { hasText: '2' }).click();
		await waitFmAt(o, ODO, f => count(f) === 2 && JSON.stringify(f.resources['Judgment Dice'].rolled) === '[6,2]', 'two dice, typed in: 6 and 2');
		assert.equal(await sheet.locator('.ev-face-pick').count(), 0, 'the strip closes once a face is picked');
		await measure(`${R} .nimble-sheet`);
		// A bow is not a Reach attack: no Judgment Dice on it.
		await sheet.locator('.ns-row.is-weapon', { hasText: 'Shortbow' }).locator('.ns-roll').click();
		const dlg = p.locator('.modal.nimble-roll-dialog');
		await dlg.waitFor();
		assert.equal(await dlg.locator('.rd-spend').count(), 0, 'no Judgment Dice on a ranged attack');
		await p.keyboard.press('Escape');
		await dlg.waitFor({ state: 'detached' });
		// The Mace: Judgment Dice on, all of them, rolled with the attack as radiant damage.
		await sheet.locator('.ns-row.is-weapon', { hasText: 'Mace' }).locator('.ns-roll').click();
		await dlg.waitFor();
		const row = dlg.locator('.rd-spend', { hasText: 'Judgment Dice' });
		assert.ok(await row.evaluate(el => el.classList.contains('is-on')), 'on by default');
		// The faces typed in go into the roll as they are.
		assert.match(await row.locator('.rd-spend-have').textContent(), /^\[6, 2\] = 8 · radiant$/);
		await p.screenshot({ path: join(ARTIFACTS, 'roll-dialog-judgment.png') });
		await measure('.modal.nimble-roll-dialog');
		await dlg.locator('.rd-roll').click();
		const fm = await waitFmAt(o, ODO, f => count(f) === 0, 'Judgment Dice spent');
		assert.equal(fm.actions, 2, 'the attack took an action');
		// Pips move one step: the first (filled) dot takes one away, not down to it; an empty one adds one back.
		await sheet.locator('.ns-action-dot').first().click();
		await waitFmAt(o, ODO, f => f.actions === 1, 'first dot: 2 → 1');
		await sheet.locator('.ns-action-dot').last().click();
		await waitFmAt(o, ODO, f => f.actions === 2, 'last (empty) dot: 1 → 2');
		// A reaction clicked twice before the sheet catches up is taken once: one roll, one action.
		await sheet.locator('.ns-tab[data-tab="actions"]').click();
		await p.evaluate((R) => { const foot = document.querySelector(`${R} .ns-rcard[data-reaction="Opportunity Attack"] .ns-rc-foot`); foot.click(); foot.click(); }, R);
		await p.locator('.modal.nimble-roll-dialog').first().waitFor();
		await p.waitForTimeout(600);
		assert.equal(await p.locator('.modal.nimble-roll-dialog').count(), 1, 'one Opportunity Attack, not two');
		await p.keyboard.press('Escape');
		const afterReaction = await waitFmAt(o, ODO, f => Array.isArray(f.reactions_used), 'the reaction is recorded');
		assert.deepEqual(afterReaction.reactions_used, ['Opportunity Attack']);
		assert.equal(afterReaction.actions, 1, 'one action for it');
		const log = (await o.eval((app, plugin) => plugin.settings.rollLog))[0];
		assert.match(log.detail, log.outcome === 'miss' ? /Judgment Dice lost/ : /Judgment Dice \[6, 2\] radiant/);

		// Fury Dice: added to an attack while Raging, and still held after it.
		await withSheetNote(o, async () => {
			await o.eval(async (app, _p, path) => {
				await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), fm => { fm.conditions = ['Raging']; fm.resources = { 'Fury Dice': { current: 1, rolled: [3] } }; });
			}, SHEET_NOTE);
			await o.openFile(SHEET_NOTE, 'preview');
			const thorga = p.locator(`${R} .nimble-sheet`);
			await p.waitForFunction((R) => document.querySelector(`${R} .ns-class .ns-held-die .ns-die-num`)?.textContent === '3', R);
			// Rage sits under the Fury Dice, on while Raging; its rules are the book's.
			const rage = thorga.locator('.ns-feat[data-key="rage"]');
			assert.equal(await rage.locator('.ns-state').innerText(), 'Raging');
			assert.equal(await rage.locator('.ns-btn').innerText(), 'End rage');
			await thorga.locator('.ns-tab[data-tab="actions"]').click();
			await thorga.locator('.ns-row.is-weapon', { hasText: 'Battleaxe' }).locator('.ns-roll').click();
			await dlg.waitFor();
			const fury = dlg.locator('.rd-spend', { hasText: 'Fury Dice' });
			assert.ok(await fury.evaluate(el => el.classList.contains('is-on')), 'on while Raging');
			assert.match(await fury.locator('.rd-spend-have').textContent(), /^3 · kept · while Raging$/);
			await dlg.locator('.rd-roll').click();
			await dlg.waitFor({ state: 'detached' });
			await p.waitForTimeout(400);
			const after = await sheetFm(o);
			assert.deepEqual(after.resources['Fury Dice'], { current: 1, rolled: [3] }, 'Fury Dice stay');
		});
		assert.deepEqual(bad, [], 'misaligned pills');
	} finally {
		await o.eval(async (app, _p, path) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.vault.delete(f); }, ODO);
	}
});

test('character sheet: HP and mana bars, with − and +, and a calculator for each', async (o) => {
	const p = o.page;
	await resetEncounter(o);
	const ILSE = 'Characters/Ilse Varn.md';
	const R = '.markdown-reading-view';
	try {
		await o.eval(async (app, _p, path) => {
			const old = app.vault.getAbstractFileByPath(path);
			if (old) await app.vault.delete(old);
			await app.vault.create(path, '---\nnimble: character\nclass: Mage\nlevel: 3\nstr: 0\ndex: 1\nint: 3\nwil: 1\nhp: 14\nhp_max: 20\ntemp_hp: 3\nmana: 6\nmana_max: 10\n---\n\n```nimble-sheet\n```\n');
		}, ILSE);
		await o.openFile(ILSE, 'preview');
		const sheet = p.locator(`${R} .nimble-sheet`);
		await sheet.waitFor();
		const hp = sheet.locator('.ns-meter.is-hp');
		const mana = sheet.locator('.ns-meter.is-mana');
		const NUMS = '.ns-meter-nums:not(.is-on-fill)';
		assert.equal(await hp.locator(NUMS).textContent(), '14/20+3');
		// Temp HP sits in the box's dark foot, as on the official sheet.
		assert.equal(await sheet.locator('.ns-hpw-foot b').textContent(), '3');
		assert.equal(await mana.locator(NUMS).textContent(), '6/10');
		await sheet.locator('.ns-band').screenshot({ path: join(ARTIFACTS, 'sheet-meters.png') });
		// The numbers read on every part of both bars, light and dark (WCAG 4.5:1): one colour on the fill
		// (the copy that rides in it), another on the track.
		const contrast = () => p.evaluate((R) => {
			const rgb = (c) => {
				const n = c.match(/[\d.]+/g).map(Number);
				return c.startsWith('color(') ? n.slice(0, 3).map(v => v * 255) : n.slice(0, 3);
			};
			const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
			const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
			const out = {};
			for (const m of document.querySelectorAll(`${R} .ns-sheet .ns-meter`)) {
				const kind = m.classList.contains('is-hp') ? 'hp' : 'mana';
				const color = (sel) => getComputedStyle(m.querySelector(sel)).color;
				out[`${kind} on the fill`] = ratio(getComputedStyle(m.querySelector('.ns-meter-fill')).backgroundColor, color('.ns-meter-nums.is-on-fill .ns-meter-cur'));
				out[`${kind} on the track`] = ratio(getComputedStyle(m.querySelector('.ns-meter-bar')).backgroundColor, color('.ns-meter-nums:not(.is-on-fill) .ns-meter-cur'));
			}
			return out;
		}, R);
		for (const theme of ['theme-light', 'theme-dark']) {
			await setTheme(o, theme);
			await p.waitForTimeout(150);
			const c = await contrast();
			assert.equal(Object.keys(c).length, 4, JSON.stringify(c));
			for (const [k, v] of Object.entries(c)) assert.ok(v >= 4.5, `${theme} ${k}: ${v.toFixed(2)}:1`);
			await sheet.locator('.ns-band').screenshot({ path: join(ARTIFACTS, `sheet-meters-${theme.slice(6)}.png`) });
		}
		await setTheme(o, 'theme-light');
		// − and +: damage takes temp HP first; mana spends and regains one.
		await hp.locator('[aria-label="Take 1 damage"]').click();
		await waitFmAt(o, ILSE, f => f.temp_hp === 2 && f.hp === 14, 'temp HP soaks 1');
		await hp.locator('[aria-label="Heal 1"]').click();
		// A heal lights up green under the fill, and the fill grows across it.
		await p.waitForSelector(`${R} .ns-meter.is-hp .ns-meter-ghost.is-gain + .ns-meter-fill`, { timeout: 2000 });
		const fillW = () => p.evaluate((R) => document.querySelector(`${R} .ns-meter.is-hp .ns-meter-fill`).getBoundingClientRect().width, R);
		const w0 = await fillW();
		await p.waitForTimeout(1000);
		const w1 = await fillW();
		assert.ok(w1 > w0 + 2, `the fill grows into the heal (${w0} → ${w1})`);
		await waitFmAt(o, ILSE, f => f.hp === 15, 'healed 1');
		// Quick taps add up: three − taps show −3 and land as one change of 3 (temp HP first).
		await p.waitForTimeout(1300);
		for (let i = 0; i < 3; i++) await hp.locator('[aria-label="Take 1 damage"]').click();
		assert.equal(await hp.locator(`${NUMS} .ns-meter-delta`).textContent(), '−3');
		assert.equal(await hp.locator(`${NUMS} .ns-meter-cur`).textContent(), '14', 'the running number: 15 + 2 temp − 3');
		assert.equal(await hp.locator('.ns-meter-nums.is-on-fill .ns-meter-cur').textContent(), '14', 'both tones show it');
		assert.equal((await sheetFmOf(o, ILSE)).hp, 15, 'nothing written while tapping');
		await waitFmAt(o, ILSE, f => f.hp === 14 && f.temp_hp === 0, 'one change of 3');
		await mana.locator('[aria-label="Spend 1 mana"]').click();
		await waitFmAt(o, ILSE, f => f.mana === 5, 'spent 1 mana');
		await mana.locator('[aria-label="Regain 1 mana"]').click();
		await p.waitForSelector(`${R} .ns-meter.is-mana .ns-meter-ghost.is-gain`, { timeout: 2000 });
		await waitFmAt(o, ILSE, f => f.mana === 6, 'regained 1 mana');
		// The HP calculator from the bar: 7 damage (2 temp, then 5).
		await hp.locator('.ns-meter-bar').click();
		const pad = p.locator('.nimble-hp-pad');
		await pad.waitFor();
		await p.keyboard.type('7');
		await pad.locator('.hp-pad-apply').click();
		// The lost HP lingers on the bar in the highlight colour, then drains away.
		await p.waitForSelector(`${R} .ns-meter.is-hp .ns-meter-ghost.is-loss`, { timeout: 2000 });
		await p.waitForTimeout(150);
		await hp.screenshot({ path: join(ARTIFACTS, 'sheet-hp-damage-ghost.png') });
		await p.waitForSelector(`${R} .ns-meter.is-hp .ns-meter-ghost`, { state: 'detached', timeout: 3000 });
		await waitFmAt(o, ILSE, f => f.hp === 7 && f.temp_hp === 0, '7 damage through the calculator');
		// The mana calculator from its button: spend 4, then set 9.
		await mana.locator('.ns-meter-calc').click();
		const mp = p.locator('.nimble-mana-pad');
		await mp.waitFor();
		assert.equal(await mp.locator('.hp-pad-mode.is-active').textContent(), 'Spend');
		await p.keyboard.type('4');
		assert.equal(await mp.locator('.hp-pad-preview').textContent(), '6 → 2 of 10 mana');
		await p.screenshot({ path: join(ARTIFACTS, 'sheet-mana-calculator.png') });
		await mp.locator('.hp-pad-apply').click();
		await waitFmAt(o, ILSE, f => f.mana === 2, 'spent 4 through the calculator');
		await mana.locator('.ns-meter-bar').click();
		await mp.waitFor();
		await mp.locator('.hp-pad-mode', { hasText: 'Set' }).click();
		await p.keyboard.type('9');
		await mp.locator('.hp-pad-apply').click();
		await waitFmAt(o, ILSE, f => f.mana === 9, 'set mana to 9');
		const bad = await p.evaluate(pillOffenders, { root: `${R} .ns-sheet`, tolerance: 1, selectors: ['.ns-meter-bar'] });
		assert.deepEqual(bad, [], 'misaligned meters');
	} finally {
		await o.eval(async (app, _p, path) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.vault.delete(f); }, ILSE);
	}
});

test('phone: character sheet at phone width, HP pad as a sheet, sticky tabs', async (o) => {
	const p = o.page;
	await resetEncounter(o);
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
	// Playwright's own viewport wins over a CDP metrics override in this harness, so size the page through it.
	await p.setViewportSize({ width: 360, height: 780 });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await o.eval(async (app, plugin) => { await plugin.saveSettings(); }); await p.waitForTimeout(400); // switching to and from phone mode reloads settings; don't let it read a half-written file
	await o.eval((app) => app.emulateMobile(true));
	await p.waitForTimeout(1200);
	try {
		await withSheetNote(o, async () => {
			await o.openFile(SHEET_NOTE);
			const sheet = p.locator(`${R} .nimble-sheet`);
			await sheet.waitFor();
			// Nothing spills past the screen.
			const spill = await p.evaluate((R) => {
				const s = document.querySelector(`${R} .nimble-sheet`);
				const r = s.getBoundingClientRect();
				return [...s.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).map(e => e.className).slice(0, 5);
			}, R);
			assert.deepEqual(spill, [], 'nothing wider than the sheet');
			assert.equal(await p.evaluate((R) => getComputedStyle(document.querySelector(`${R} .ns-sk-row`)).gridTemplateColumns.split(' ').length, R), 5, 'the skills band, five to a row on a phone');
			// Nothing in the band, the skills or the tabs is cut off: every label shows in full.
			const clipped = await p.evaluate((R) => [...document.querySelectorAll(`${R} :is(.ns-box-label, .ns-skill-name, .ns-stat-label, .ns-tab-label, .ns-scroll-title, .ev-pill-text)`)]
				.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), R);
			assert.deepEqual(clipped, [], 'labels cut off on a phone');
			await p.screenshot({ path: join(ARTIFACTS, 'sheet-phone-light.png') });

			await tap(sheet.locator('.ns-hp'));
			assert.equal(await p.locator('.nimble-hp-pad.is-sheet').count(), 1, 'HP pad is a bottom sheet');
			for (const k of ['3']) await tap(p.locator('.hp-pad-keys button', { hasText: exact(k) }));
			await tap(p.locator('.hp-pad-apply'));
			await waitFm(o, f => f.hp === 17, 'hp 17');

			await tap(sheet.locator('.ns-tab[data-tab="inventory"]'));
			await p.waitForTimeout(200);
			await p.screenshot({ path: join(ARTIFACTS, 'sheet-phone-inventory.png') });
			// Scroll down: the tabs stick to the top.
			const scroller = `${R} .markdown-preview-view`;
			// Scroll just past where the tabs start (the sheet ends soon after on a short tab), whatever the top.
			await p.evaluate(([R, sel]) => {
				const view = document.querySelector(sel);
				const tabs = document.querySelector(`${R} .ns-tabs`);
				view.scrollTop += tabs.getBoundingClientRect().top - view.getBoundingClientRect().top + 80;
			}, [R, scroller]);
			await p.waitForTimeout(200);
			const stuck = await p.evaluate(([R, sel]) => {
				// The scroller's top padding leaves room for the phone's floating header; sticky stops there.
				const view = document.querySelector(sel);
				const t = document.querySelector(`${R} .ns-tabs`).getBoundingClientRect();
				const top = view.getBoundingClientRect().top + parseFloat(getComputedStyle(view).paddingTop);
				return { ok: Math.abs(t.top - top) < 4, tabs: t.top, top };
			}, [R, scroller]);
			assert.ok(stuck.ok, `tabs stick at the top while scrolling: ${JSON.stringify(stuck)}`);
			await p.evaluate((sel) => { document.querySelector(sel).scrollTop = 0; }, scroller);
			await tap(sheet.locator('.ns-tab[data-tab="actions"]'));
			await setTheme(o, 'theme-dark');
			await p.waitForTimeout(250);
			await p.screenshot({ path: join(ARTIFACTS, 'sheet-phone-dark.png') });
		});
	} finally {
		await p.evaluate(() => document.querySelectorAll('.nimble-popover, .modal-container, .menu').forEach(n => n.remove()));
		await o.eval(async (app, plugin) => { await plugin.saveSettings(); }); await p.waitForTimeout(400); // switching to and from phone mode reloads settings; don't let it read a half-written file
		await o.eval((app) => app.emulateMobile(false));
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.setViewportSize({ width: 1400, height: 900 });
		await p.waitForTimeout(800);
	}
});

test('phone: the 5e character sheet fits a phone, its HP opens the keypad as a sheet', async (o) => {
	const p = o.page;
	const C = 'Campaigns/Phone Coast';
	const note = `${C}/Party/Wren.md`;
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
	await o.eval(async (app, plugin, [C, note]) => {
		const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
		await plugin.campaigns.createCampaign({ name: 'Phone Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
		await app.vault.createFolder(`${C}/Party`).catch(() => {});
		// Written by hand, without the sheet note class: the sheet still takes the page.
		await app.vault.create(note, ['---', 'class: Wizard', 'species: Elf', 'background: Sage', 'level: 5', 'edition: "2024"', 'int: 17', 'dex: 14', 'con: 13', 'hp: 20', 'hp_max: 27',
			'skills: [Arcana, Sleight of Hand]', 'spells: [Fire Bolt, Shield, Fireball]', 'conditions: [Frightened]', 'inventory:', '  - { name: Dagger, equipped: true }', '---', '', '```5e-sheet', '```', ''].join('\n'));
	}, [C, note]);
	await p.setViewportSize({ width: 360, height: 780 });
	await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await o.eval(async (app, plugin) => { await plugin.saveSettings(); }); await p.waitForTimeout(400); // switching to and from phone mode reloads settings; don't let it read a half-written file
	await o.eval((app) => app.emulateMobile(true));
	await p.waitForTimeout(1200);
	try {
		await o.openFile(note, 'preview');
		const sheet = p.locator(`${R} .dnd5e-sheet`);
		await sheet.waitFor({ timeout: 5000 });
		await p.waitForTimeout(300);
		// Nothing spills past the screen, and the labels show in full.
		const spill = await p.evaluate((R) => {
			const s = document.querySelector(`${R} .dnd5e-sheet`);
			const r = s.getBoundingClientRect();
			return [...s.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).map(e => e.className).slice(0, 5);
		}, R);
		assert.deepEqual(spill, [], 'nothing wider than the sheet');
		// Every damage button on the sheet is one width.
		const dmgWidths = await p.evaluate((R) => [...document.querySelectorAll(`${R} .dnd5e-sheet .dnd5e-dmg`)].map(b => Math.round(b.getBoundingClientRect().width)), R);
		assert.ok(dmgWidths.length >= 2 && new Set(dmgWidths).size === 1, `damage buttons one width: ${dmgWidths}`);
		const clipped = await p.evaluate((R) => [...document.querySelectorAll(`${R} .dnd5e-sheet :is(.dnd5e-sheet-box-label, .dnd5e-row-name, .dnd5e-sheet-ability-name, .dnd5e-tab .ev-pill-text)`)]
			.filter(e => e.checkVisibility() && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), R);
		assert.deepEqual(clipped, [], 'labels cut off on a phone');
		assert.equal(await p.evaluate((R) => document.querySelector(`${R} .metadata-container`)?.checkVisibility() ?? false, R), false, 'properties hidden');
		await p.screenshot({ path: join(ARTIFACTS, 'dnd5e-sheet-phone-light.png') });

		// The bar opens the keypad, a bottom sheet on a phone.
		await tap(sheet.locator('.ns-meter-bar'));
		assert.equal(await p.locator('.nimble-hp-pad.is-sheet').count(), 1, 'HP pad is a bottom sheet');
		await tap(p.locator('.hp-pad-keys button', { hasText: exact('3') }));
		await tap(p.locator('.hp-pad-apply'));
		await o.waitFor(async () => (await o.eval((app, _p, path) => app.metadataCache.getCache(path)?.frontmatter?.hp, note)) === 17, { what: 'hp 17' });
		await tap(sheet.locator('.dnd5e-tab[data-tab="spells"]'));
		await p.waitForTimeout(200);
		await p.screenshot({ path: join(ARTIFACTS, 'dnd5e-sheet-phone-spells.png') });
		await tap(sheet.locator('.dnd5e-tab[data-tab="actions"]'));
		await setTheme(o, 'theme-dark');
		await p.waitForTimeout(250);
		await p.evaluate((R) => { document.querySelector(`${R} .markdown-preview-view`).scrollTop = 0; }, R);
		await p.screenshot({ path: join(ARTIFACTS, 'dnd5e-sheet-phone-dark.png') });
	} finally {
		await setTheme(o, 'theme-light');
		await p.evaluate(() => document.querySelectorAll('.nimble-popover, .modal-container, .menu').forEach(n => n.remove()));
		await o.eval(async (app, plugin) => { await plugin.saveSettings(); }); await p.waitForTimeout(400);
		await o.eval((app) => app.emulateMobile(false));
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.setViewportSize({ width: 1400, height: 900 });
		await p.waitForTimeout(800);
		await o.eval(async (app, plugin, C) => {
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('campaign pages open in reading view; sessions and new notes open for editing', async (o) => {
	const mode = () => o.eval((app) => app.workspace.getActiveFileView()?.getMode?.() ?? null);
	const open = (path) => o.eval(async (app, _p, path) => { await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(path), { state: { mode: 'source' } }); }, path);
	try {
		await o.eval(async (app, plugin) => {
			plugin.settings.readingView = true;
			const old = app.vault.getAbstractFileByPath('Campaigns/Reading Room');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Reading Room', level: 1, heroes: 4, starter: true, role: 'player', character: 'Pip' });
		});
		await o.page.waitForTimeout(16000); // past the "just made" grace period for the starter notes
		await open('Campaigns/Reading Room/Party/Pip.md');
		await o.waitFor(async () => (await mode()) === 'preview', { what: 'character in reading view' });
		// The user switches to editing: it stays that way while they're on the page.
		await o.eval(async (app) => { const leaf = app.workspace.getMostRecentLeaf(); const st = leaf.getViewState(); await leaf.setViewState({ ...st, state: { ...st.state, mode: 'source' } }); });
		await o.page.waitForTimeout(300);
		assert.equal(await mode(), 'source');
		// Opened from the party roster (the Campaign panel keeps focus): still reading view.
		await o.eval(async (app) => { await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Campaigns/Reading Room/Reading Room.md'), { state: { mode: 'source' } }); });
		await o.eval(async (app, plugin) => { await plugin.openCampaignView(); });
		await o.page.waitForTimeout(400);
		await o.page.locator('.nimble-campaign-view .campaign-hero.is-mine').first().click();
		await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.basename)) === 'Pip' && (await mode()) === 'preview', { what: 'roster click opens in reading view' });
		// A chapter page reads too; a session log and a loose note open as Obsidian would (Source here).
		await open('Campaigns/Reading Room/Chapter 1/Chapter 1.md');
		await o.waitFor(async () => (await mode()) === 'preview', { what: 'chapter in reading view' });
		await o.eval(async (app) => { await app.vault.create('Campaigns/Reading Room/Sessions/Session 1.md', '---\nnimble: session\n---\n'); });
		await o.page.waitForTimeout(16000);
		await open('Campaigns/Reading Room/Sessions/Session 1.md');
		await o.page.waitForTimeout(400);
		assert.equal(await mode(), 'source');
		// A page made just now is for writing.
		await o.eval(async (app) => { await app.vault.create('Campaigns/Reading Room/NPCs/Fresh.md', '---\nnimble: npc\n---\n'); });
		await open('Campaigns/Reading Room/NPCs/Fresh.md');
		await o.page.waitForTimeout(400);
		assert.equal(await mode(), 'source');
	} finally {
		await o.eval(async (app, plugin) => {
			plugin.settings.readingView = false;
			const f = app.vault.getAbstractFileByPath('Campaigns/Reading Room');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('campaign properties as tags: empty ones stay hidden, and show once filled in', async (o) => {
	const R = '.workspace-leaf.mod-active .nimble-props-tags .markdown-reading-view';
	// 'shown', 'hidden', or 'missing' when Obsidian hasn't drawn it.
	const tag = (key) => o.page.evaluate(([R, key]) => {
		const el = document.querySelector(`${R} .metadata-property[data-property-key="${key}"]`);
		return !el ? 'missing' : getComputedStyle(el).display === 'none' ? 'hidden' : 'shown';
	}, [R, key]);
	const shown = async (key) => (await tag(key)) === 'shown';
	try {
		await o.eval(async (app, plugin) => {
			plugin.settings.tagProperties = true;
			const old = app.vault.getAbstractFileByPath('Campaigns/Tag Room');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Tag Room', level: 1, heroes: 4, starter: false });
			// A place: an NPC's card shows its status and role, so on an NPC the tags leave them out.
			const f = await app.vault.create('Campaigns/Tag Room/Mira.md', '---\nnimble: location\nstatus: alive\nrole: \n---\nA tinker\'s yard.\n');
			await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'preview' } });
		});
		await o.waitFor(() => shown('status'), { what: 'status shows as a tag' });
		await o.waitFor(async () => (await tag('role')) === 'hidden', { what: 'empty role drawn but hidden' });
		// Filled in, Obsidian draws the properties again and the tag shows.
		await o.eval(async (app) => {
			await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Tag Room/Mira.md'), (fm) => { fm.role = 'Smith'; });
		});
		await o.waitFor(() => shown('role'), { what: 'filled role shows' });
		// A number (level: 2) is an input in Obsidian; its pill fits the number rather than the input's fixed width.
		await o.eval(async (app) => {
			await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Tag Room/Mira.md'), (fm) => { fm.level = 2; });
		});
		await o.waitFor(() => shown('level'), { what: 'level shows as a tag' });
		const levelWidth = () => o.page.evaluate((R) => document.querySelector(`${R} .metadata-property[data-property-key="level"] .metadata-property-value input`)?.getBoundingClientRect().width ?? 0, R);
		await o.waitFor(async () => (await levelWidth()) > 0, { what: 'the level input to be drawn' });
		assert.ok((await levelWidth()) < 30, `the level input fits its number (${await levelWidth()}px, Obsidian's own is 170px)`);
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Tag Room');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('player bestiary: one row per creature with book pills, and your own notes on it', async (o) => {
	await resetEncounter(o);
	const B = '.nimble-compendium';
	try {
		await o.eval(async (app, plugin) => {
			const old = app.vault.getAbstractFileByPath('Campaigns/Beast Lore');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Beast Lore', level: 1, heroes: 4, starter: false, role: 'player', character: 'Pip' });
			await app.commands.executeCommandById('nimble-gm:open-bestiary');
		});
		await o.page.waitForSelector(`${B}.is-lore .nimble-cmpx-row[data-id]`, { timeout: 5000 });
		const input = o.page.locator(`${B} .nimble-cmpx-input`);
		// Krogg is in Monsters & More and the GM Guide: one row, two book pills.
		await input.fill('krogg');
		await o.waitFor(async () => (await cmpRows(o, B).count()) === 1, { timeout: 3000, what: 'one Krogg row' });
		assert.deepEqual(await cmpNames(o, B), ['Krogg, Goblin King']);
		assert.deepEqual(await o.page.locator(`${B} .nimble-cmpx-row[data-id] .bestiary-tag`).allTextContents(), ['M&M', 'GMG']);
		assert.equal(await o.page.locator(`${B} .nimble-cmpx-row-badge.is-level`).count(), 0, 'no level badges for players');
		// The row button copies a reference (players don't add monsters to fights).
		assert.match(await cmpRows(o, B).first().locator('.nimble-cmpx-row-btn').getAttribute('aria-label'), /^Copy a reference/);
		await cmpRows(o, B).first().click();
		const card = o.page.locator(`${B} .nimble-cmpx-detail .nimble-lore-card`);
		assert.equal(await card.locator('.lore-source').count(), 2, 'both printings as source pills');
		// Add notes: makes Campaigns/Beast Lore/Bestiary/Krogg, Goblin King.md and opens it.
		await card.locator('.statblock-action', { hasText: 'Add notes' }).click();
		const path = 'Campaigns/Beast Lore/Bestiary/Krogg, Goblin King.md';
		await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.path)) === path, { what: 'notes note opened' });
		await o.eval(async (app, _p, path) => {
			const f = app.vault.getAbstractFileByPath(path);
			await app.vault.process(f, (t) => t.replace("## What we've seen\n-", "## What we've seen\n- Hates the smell of **garlic**."));
		}, path);
		await o.eval(async (app) => { await app.commands.executeCommandById('nimble-gm:open-bestiary'); });
		await o.waitFor(() => o.page.evaluate((B) => document.querySelector(`${B} .nimble-creature-notes-body`)?.textContent.includes('garlic'), B), { timeout: 5000, what: 'your notes under the lore' });
		await o.waitFor(async () => (await o.page.locator(`${B} .nimble-cmpx-row[data-id] .bestiary-tag`).allTextContents()).join() === 'M&M,GMG,Notes', { timeout: 3000, what: 'the Notes pill' });
		assert.equal(await card.locator('.statblock-action', { hasText: 'Open notes' }).count(), 1);
		// is:noted: the creatures you've written about.
		await input.fill('is:noted ');
		await o.waitFor(async () => (await cmpChips(o, B)).length === 1, { timeout: 3000, what: 'the is:noted chip' });
		await o.waitFor(async () => (await cmpNames(o, B)).join('|') === 'Krogg, Goblin King', { timeout: 3000, what: 'only Krogg under is:noted' });
		await o.page.locator(`${B} .nimble-cmpx-chip-x`).click();
		await input.fill('krogg');
		await o.waitFor(async () => (await cmpRows(o, B).count()) === 1, { timeout: 3000, what: 'one Krogg row again' });
		await o.page.waitForTimeout(300);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-bestiary-notes.png') });
		const bad = await o.page.evaluate(pillOffenders, { root: B, tolerance: 1, selectors: PILL_SELECTORS });
		assert.deepEqual(bad, [], 'misaligned pills in the bestiary');

		// The same notes, and both books, in a hover preview and a quick look from a note in the campaign.
		await o.eval(async (app) => { await app.vault.create('Campaigns/Beast Lore/Rumours.md', 'They say `nimble:Krogg, Goblin King` is back.\n'); });
		await o.openFile('Campaigns/Beast Lore/Rumours.md', 'preview');
		const ref = o.page.locator('.markdown-reading-view .nimble-inline-name', { hasText: 'Krogg' });
		await ref.waitFor();
		await ref.hover();
		await o.page.waitForSelector(`${PREVIEW} .nimble-creature-notes`, { timeout: 4000 });
		assert.match(await o.page.locator(`${PREVIEW} .nimble-creature-notes-body`).textContent(), /garlic/);
		assert.equal(await o.page.locator(`${PREVIEW} .lore-source`).count(), 2, 'both books in the hover');
		assert.equal(await o.page.locator(`${PREVIEW} .statblock-action`, { hasText: 'Open notes' }).count(), 1);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-hover-notes.png') });
		await o.page.mouse.move(2, 450);
		await o.page.keyboard.press('Escape');
		await o.page.waitForTimeout(400);
		await ref.click();
		const Q = '.modal.nimble-record-modal';
		await o.page.waitForSelector(`${Q} .nimble-creature-notes`, { timeout: 4000 });
		assert.match(await o.page.locator(`${Q} .nimble-creature-notes-body`).textContent(), /garlic/);
		assert.equal(await o.page.locator(`${Q} .lore-source`).count(), 2, 'both books in the quick look');
		assert.equal(await o.page.locator(`${Q} .record-btn`, { hasText: 'Open notes' }).count(), 1);
		await o.page.screenshot({ path: join(ARTIFACTS, 'player-quicklook-notes.png') });
		await o.page.keyboard.press('Escape');
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Beast Lore');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('campaigns keep their monsters apart: a player campaign never opens the GM\'s monster notes', async (o) => {
	await resetEncounter(o);
	const p = o.page;
	try {
		await o.eval(async (app, plugin) => {
			for (const f of ['Campaigns/Iso Run', 'Campaigns/Iso Play']) { const old = app.vault.getAbstractFileByPath(f); if (old) await app.vault.delete(old, true); }
			await plugin.campaigns.createCampaign({ name: 'Iso Run', level: 2, heroes: 4, starter: false });
			await app.vault.createFolder('Campaigns/Iso Run/Monsters').catch(() => undefined);
			await app.vault.create('Campaigns/Iso Run/Monsters/Quicksilver Hound.md', '```nimble\nname: Quicksilver Hound\nlevel: 3\nhp: 30\nattacks:\n- Bite 1d8+2\n```\n');
			await app.vault.create('Campaigns/Iso Run/Monsters/Ogre.md', '```nimble\nname: Ogre\nlevel: 9\nhp: 999\nattacks:\n- Club 9d9\n```\n');
			await app.vault.create('Campaigns/Iso Run/Prep.md', 'Hounds: `nimble:Quicksilver Hound`, and `nimble:Ogre`.\n');
			await plugin.campaigns.createCampaign({ name: 'Iso Play', level: 2, heroes: 4, starter: false, role: 'player', character: 'Pip' });
			await app.vault.create('Campaigns/Iso Play/Session.md', '---\nnimble: session\n---\nWe met `nimble:Quicksilver Hound` and `nimble:Ogre`.\n\n```nimble-encounter\nname: Cellar\noutcome: won\nmonsters:\n- 2 Quicksilver Hound\n- 1 Ogre\n```\n');
		});
		await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('nimble').index.get('Quicksilver Hound', 'Campaigns/Iso Run/Prep.md')?.filePath === 'Campaigns/Iso Run/Monsters/Quicksilver Hound.md'), { what: 'the GM monster indexed' });
		const seen = await o.eval((app, plugin) => {
			const at = (name, from) => { const e = plugin.runtime('nimble').index.get(name, from); return e ? (e.bundled ? 'bundled' : e.filePath) : null; };
			return {
				gmHound: at('Quicksilver Hound', 'Campaigns/Iso Run/Prep.md'),
				gmOgre: at('Ogre', 'Campaigns/Iso Run/Prep.md'),
				playerHound: at('Quicksilver Hound', 'Campaigns/Iso Play/Session.md'),
				playerOgre: at('Ogre', 'Campaigns/Iso Play/Session.md'),
				playerAll: plugin.runtime('nimble').index.all('Campaigns/Iso Play/Session.md').some(e => e.filePath.startsWith('Campaigns/Iso Run/')),
			};
		});
		assert.deepEqual(seen, {
			gmHound: 'Campaigns/Iso Run/Monsters/Quicksilver Hound.md',
			gmOgre: 'Campaigns/Iso Run/Monsters/Ogre.md',
			playerHound: null,
			playerOgre: 'bundled',
			playerAll: false,
		});
		// In the player's session: the hound is just a name, the ogre is the book's lore card.
		await o.openFile('Campaigns/Iso Play/Session.md', 'preview');
		const R = '.markdown-reading-view';
		await p.waitForSelector(`${R} .nimble-battle-notes .battle-foe`, { timeout: 5000 });
		const refs = await p.evaluate((R) => [...document.querySelectorAll(`${R} p .nimble-inline-ref`)].map(r => ({ name: r.dataset.nimbleRef, found: r.classList.contains('nimble-inline-found'), bundled: r.classList.contains('is-bundled') })), R);
		assert.deepEqual(refs, [{ name: 'Quicksilver Hound', found: false, bundled: false }, { name: 'Ogre', found: true, bundled: true }]);
		const foes = await p.evaluate((R) => [...document.querySelectorAll(`${R} .battle-foe`)].map(f => ({ text: f.textContent.replace(/\s+/g, ' ').trim(), bundled: !!f.querySelector('.nimble-inline-ref.is-bundled') })), R);
		assert.deepEqual(foes, [{ text: '2×Quicksilver Hound', bundled: false }, { text: '1×Ogre', bundled: true }]);
		// The count has room on its left: it starts inside the chip's rounded end.
		const pad = await p.evaluate((R) => {
			const f = document.querySelector(`${R} .battle-foe`);
			const r = document.createRange();
			r.selectNodeContents(f.querySelector('.battle-foe-count'));
			return Math.round(r.getBoundingClientRect().left - f.getBoundingClientRect().left);
		}, R);
		assert.ok(pad >= 8, `count padding ${pad}px`);
		// The block can redraw as the index settles; a second try takes the fresh one.
		const notesShot = () => p.locator(`${R} .nimble-battle-notes`).screenshot({ path: join(ARTIFACTS, 'battle-notes-player.png') });
		await notesShot().catch(async () => { await p.waitForTimeout(300); await notesShot(); });
	} finally {
		await o.eval(async (app, plugin) => {
			for (const f of ['Campaigns/Iso Run', 'Campaigns/Iso Play']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
			await plugin.campaigns.setActive(null);
		});
	}
});

test('GM party: character sheets in a Party section, and the encounter party read from them', async (o) => {
	await resetEncounter(o);
	const p = o.page;
	const V = '.nimble-campaign-view';
	try {
		// A campaign run with a party entered by hand: shown, with a button to make sheets for it.
		await o.eval(async (app, plugin) => {
			const old = app.vault.getAbstractFileByPath('Campaigns/Iron Road');
			if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Iron Road', level: 2, heroes: 4, starter: false });
			plugin.settings.party = [
				{ id: 'h1', name: 'Kestrel', level: 2, maxHp: 21, defense: 3, maxWounds: 6, className: 'Hunter' },
				{ id: 'h2', name: 'Bram', level: 2, maxHp: 26, maxWounds: 6, className: 'Berserker' },
			];
			await plugin.saveSettings();
			await plugin.openCampaignView();
			plugin.campaigns.trigger('changed');
		});
		await p.waitForSelector(`${V} .campaign-roster.is-gm .campaign-hero.is-plain`, { timeout: 5000 });
		assert.equal(await p.locator(`${V} .campaign-party`, { hasText: 'heroes ·' }).count(), 0, 'no heroes pill any more');
		assert.deepEqual(await p.locator(`${V} .campaign-hero.is-plain .campaign-hero-name`).allTextContents(), ['Kestrel', 'Bram']);
		// The first sheet arrives (a new hero, Wren): the heroes typed in before stay, in the party and on the panel.
		await o.eval(async (app) => {
			await app.vault.createFolder('Campaigns/Iron Road/Party').catch(() => undefined);
			await app.vault.create('Campaigns/Iron Road/Party/Wren.md', '---\nnimble: character\nclass: Hunter\nlevel: 2\nhp: 19\nhp_max: 19\n---\n\n```nimble-sheet\n```\n');
		});
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.party.map(h => h.name).join())) === 'Wren,Kestrel,Bram', { what: 'Wren joins Kestrel and Bram' });
		await p.waitForSelector(`${V} a.campaign-hero[data-path="Campaigns/Iron Road/Party/Wren.md"]`, { timeout: 5000 });
		assert.deepEqual(await p.locator(`${V} .campaign-hero.is-plain .campaign-hero-name`).allTextContents(), ['Kestrel', 'Bram'], 'the typed-in heroes still show');
		await p.locator(`${V} .campaign-roster-empty`, { hasText: 'Make character sheets for these 2' }).click();
		// Two more sheets in Party, keeping HP, Defense and Wounds; the cards are now all sheets, with HP.
		await o.waitFor(() => o.eval((app) => ['Kestrel', 'Bram'].every(n => app.vault.getAbstractFileByPath(`Campaigns/Iron Road/Party/${n}.md`))), { what: 'sheets made' });
		await o.waitFor(async () => (await p.locator(`${V} .campaign-hero.is-plain`).count()) === 0, { what: 'no typed-in heroes left' });
		const kestrel = await sheetFmOf(o, 'Campaigns/Iron Road/Party/Kestrel.md');
		assert.equal(kestrel.class, 'Hunter');
		assert.equal(kestrel.level, 2);
		assert.equal(kestrel.hp_max, 21);
		assert.equal(kestrel.armor, 3);
		assert.equal(await p.locator(`${V} a.campaign-hero .campaign-hero-hp`).count(), 3, 'every hero shows HP on the GM side');
		assert.equal(await p.locator(`${V} .campaign-hero-you`).count(), 0);
		// The encounter party is read from the sheets: levelling a sheet up changes it.
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.party.map(h => h.id).sort().join())) === 'sheet:Campaigns/Iron Road/Party/Bram.md,sheet:Campaigns/Iron Road/Party/Kestrel.md,sheet:Campaigns/Iron Road/Party/Wren.md', { what: 'party from sheets' });
		await o.eval(async (app) => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Iron Road/Party/Bram.md'), fm => { fm.level = 3; fm.hp_max = 33; }); });
		await o.waitFor(async () => {
			const bram = await o.eval((app, plugin) => plugin.settings.party.find(h => h.name === 'Bram'));
			return bram?.level === 3 && bram.maxHp === 33;
		}, { what: 'Bram at level 3 in the encounter party' });
		// A hero at a quarter HP or less: the bar gets darker red (more urgent), not amber.
		await o.eval(async (app) => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Campaigns/Iron Road/Party/Bram.md'), fm => { fm.hp = 5; }); });
		await p.waitForSelector(`${V} .campaign-hero-hp-fill.is-low`, { timeout: 5000 });
		const fills = await p.evaluate((V) => {
			const rgb = (el) => getComputedStyle(el).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number);
			const low = rgb(document.querySelector(`${V} .campaign-hero-hp-fill.is-low`));
			const ok = rgb(document.querySelector(`${V} .campaign-hero-hp-fill:not(.is-low)`));
			return { low, ok };
		}, V);
		const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
		assert.ok(lum(fills.low) < lum(fills.ok), `low HP is darker than healthy: ${JSON.stringify(fills)}`);
		assert.ok(fills.low[0] > fills.low[1] * 1.5, `and still red, not amber: ${JSON.stringify(fills.low)}`);
		await p.locator(`${V} .campaign-roster`).screenshot({ path: join(ARTIFACTS, 'gm-party.png') });
		// Settings › Party: heroes with sheets are read-only rows (their sheet keeps them current), with no Level up.
		await o.eval((app) => { app.setting.open(); app.setting.openTabById('nimble-gm'); });
		await p.waitForSelector('.vertical-tab-content .nimble-party-row.is-sheet', { timeout: 5000 });
		assert.equal(await p.locator('.vertical-tab-content .nimble-party-row.is-sheet').count(), 3);
		assert.equal(await p.locator('.vertical-tab-content .nimble-party-row:not(.is-sheet) input').count(), 0);
		assert.equal(await p.locator('.vertical-tab-content .nimble-party-actions button', { hasText: 'Level up' }).count(), 0);
		await o.eval((app) => app.setting.close());
		// A new note's name never clashes with one already there, even by case ("wren" next to "Wren.md").
		assert.equal(await o.eval((app, plugin) => plugin.campaigns.available('Campaigns/Iron Road/Party/wren.md')), 'Campaigns/Iron Road/Party/wren 2.md');
		// + adds a hero (not yours): the new-character dialog, into Party.
		await p.locator(`${V} .campaign-roster-head [aria-label="Add a hero"]`).click();
		await p.locator('.modal.nimble-newchar-modal').waitFor({ timeout: 3000 });
		assert.equal(await p.locator('.modal.nimble-newchar-modal .modal-title').textContent(), 'New party member');
		await p.keyboard.press('Escape');
	} finally {
		await o.eval(async (app, plugin) => {
			const f = app.vault.getAbstractFileByPath('Campaigns/Iron Road');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
			plugin.settings.party = [];
		});
	}
});

test('pills: every icon and label sits on its pill centre line (within 1px)', async (o) => {
	await resetEncounter(o);
	const measure = async (root) => o.page.evaluate(pillOffenders, { root, tolerance: 1, selectors: PILL_SELECTORS });
	const bad = [];
	await withSheetNote(o, async () => {
		await o.openFile(SHEET_NOTE, 'preview');
		await o.page.waitForTimeout(600);
		bad.push(...await measure('.markdown-reading-view .nimble-sheet'));
		// The level-up wizard, every step.
		await camp(o, o.page.locator('.markdown-reading-view .nimble-sheet'), 'Level up');
		const lv = o.page.locator('.modal.nimble-levelup');
		await lv.waitFor();
		const steps = await lv.locator('.lu-dot').count();
		for (let k = 0; k < steps; k++) {
			await lv.locator('.lu-dot').nth(k).click();
			if (k === 1) await lv.locator('.lu-hp-option', { hasText: 'Take the flat bonus' }).click();
			await o.page.waitForTimeout(450);
			bad.push(...await measure('.modal.nimble-levelup'));
		}
		await o.page.keyboard.press('Escape');
	});
	assert.deepEqual(bad, [], 'misaligned pills');
});

/** Measure every pill under `root` and add what's off to `bad`, tagged with where it was. */
async function measurePills(o, bad, where, root) {
	for (const b of await o.page.evaluate(pillOffenders, { root, tolerance: 1, selectors: PILL_SELECTORS })) bad.push({ where, ...b });
	// Which pills were there to measure, so a surface that drew none (a selector gone stale) shows up.
	const seen = await o.page.evaluate(({ root, selectors }) => {
		const out = {};
		for (const scope of document.querySelectorAll(root)) {
			for (const sel of selectors) {
				const n = [...scope.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width).length;
				if (n) out[sel] = (out[sel] ?? 0) + n;
			}
		}
		return out;
	}, { root, selectors: PILL_SELECTORS });
	if (process.env.PILLS_VERBOSE) {
		// PILLS_VERBOSE=1: what each surface had, and a picture of it in e2e/artifacts/ to look over.
		console.log(`    ${where}: ${Object.entries(seen).map(([k, v]) => `${k}×${v}`).join(' ')}`);
		await o.page.locator(root).filter({ visible: true }).first().screenshot({ path: join(ARTIFACTS, `pills-${where.replace(/\W+/g, '-')}.png`) }).catch(() => {});
	}
	if (!Object.keys(seen).length) bad.push({ where, el: root, part: 'no pills measured', offset: 0 });
}

test('pills: Nimble references, stat block buttons, compendium, Spotlight and the slash menu line up', async (o) => {
	const bad = [];
	// The tracker mid-fight: the ticker, the side switch, a hero's card with a timed condition, the turn control;
	// then the legendary beat, a Bloodied moment, and a hero's keypad with Defend and Interpose.
	await resetEncounter(o, { party: PARTY });
	await o.eval((app, plugin) => {
		const st = plugin.runtime('nimble').encounters;
		const enc = st.ensureActive();
		st.addParty(enc.id);
		st.add(plugin.runtime('nimble').index.get('Krogg, Goblin King').monster, undefined, 1, enc.id);
		st.start(enc.id);
		const aria = enc.creatures.find(c => c.label === 'Aria');
		st.addCondition(enc.id, aria.id, 'Dazed', { rounds: 2 });
		st.setActing(enc.id, aria.id);
	});
	await o.waitFor(async () => (await o.page.locator(`${T} .ev-card .creature-label`).allTextContents()).join() === 'Aria', { what: 'Aria on the card' });
	await measurePills(o, bad, 'Nimble tracker (a hero acting)', T);
	await mainButton(o).click();
	await o.page.locator(`${T} .ev-card.is-beat`).waitFor({ timeout: 2000 });
	await typeHp(o, 'Krogg, Goblin King-1', '50');
	await o.page.locator(`${T} .ev-moment`).first().waitFor({ timeout: 2000 });
	await measurePills(o, bad, 'Nimble tracker (the legendary beat)', T);
	await card(o, 'Bram').locator('.hp-display').click();
	await o.page.keyboard.type('6');
	await o.page.locator('.nimble-hp-pad .qa-defend').click();
	await o.page.locator('.nimble-hp-pad .qa-interpose').click();
	await o.page.waitForTimeout(200);
	await measurePills(o, bad, 'Nimble HP keypad', '.nimble-hp-pad');
	await o.page.keyboard.press('Escape');
	await resetEncounter(o);
	// Inline references: monsters [level | name | +], compendium entries [icon | name], unknown names; both views.
	await o.openFile('Compendium refs.md', 'preview');
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-inline-ref.is-compendium`).count()) >= 8, { what: 'compendium refs' });
	await o.page.waitForTimeout(200);
	await o.page.locator(`${R} .nimble-inline-ref.kind-spell`).first().screenshot({ path: join(ARTIFACTS, 'pill-nimble-spell.png') });
	await measurePills(o, bad, 'Nimble refs (reading)', `${R}`);
	await o.openFile('Adventure.md', 'preview');
	await o.waitFor(async () => (await o.page.locator(`${R} .nimble-inline-ref.nimble-inline-found`).count()) >= 2, { what: 'monster refs' });
	await measurePills(o, bad, 'Nimble monster refs (reading)', `${R}`);
	// A monster's quick look: its buttons and the stat block's badges.
	await o.page.locator(`${R} .nimble-inline-ref.nimble-inline-found .nimble-inline-name`).first().click();
	await o.page.locator('.modal.nimble-record-modal').waitFor({ timeout: 3000 });
	await o.page.waitForTimeout(200);
	await measurePills(o, bad, 'Nimble quick look', '.modal.nimble-record-modal');
	await o.page.keyboard.press('Escape');
	// The hover card, with its Add button.
	await o.page.locator(`${R} .nimble-inline-ref.nimble-inline-found .nimble-inline-name`).first().hover();
	await o.page.locator('.nimble-hover-preview .nimble-statblock').waitFor({ timeout: 3000 });
	await o.page.waitForTimeout(200);
	await measurePills(o, bad, 'Nimble hover card', '.nimble-hover-preview');
	await parkMouse(o);
	await o.openFile('Compendium refs.md', 'source');
	await o.waitFor(async () => (await o.page.locator(`${S} .nimble-inline-ref.is-compendium`).count()) >= 8, { what: 'Live Preview refs' });
	await measurePills(o, bad, 'Nimble refs (Live Preview)', `${S}`);
	// A stat block and its buttons.
	await o.openFile('Bestiary/Goblin Boss.md', 'preview');
	await o.page.locator(`${R} .nimble-statblock`).first().waitFor();
	await measurePills(o, bad, 'Nimble stat block', `${R}`);
	// The compendium: tabs, rows with their pills and tags, a page with its buttons, a filter chip.
	await openCompendiumTab(o);
	await o.page.locator(`${CMP} .nimble-cmpx-input`).pressSequentially('level:1 ', { delay: 20 });
	await o.waitFor(async () => (await o.page.locator(`${CMP} .nimble-cmpx-chip`).count()) === 1, { what: 'a filter chip' });
	await o.page.waitForTimeout(300);
	await measurePills(o, bad, 'Nimble compendium', CMP);
	// Spotlight with a typed filter.
	await o.eval((app) => { app.commands.executeCommandById('nimble-gm:spotlight'); });
	const SP = '.modal-container .prompt.nimble-spotlight';
	await o.page.locator(`${SP} .prompt-input`).fill('level:2 gob');
	await o.waitFor(async () => (await o.page.locator(`${SP} .nimble-cmpx-chip`).count()) >= 1, { what: 'Spotlight chip' });
	await o.page.waitForTimeout(300);
	await measurePills(o, bad, 'Nimble Spotlight', SP);
	await o.page.keyboard.press('Escape');
	// The slash menu, with a difficulty badge.
	await o.eval(async (app) => {
		const old = app.vault.getAbstractFileByPath('Pill slash.md');
		if (old) await app.vault.delete(old);
		await app.vault.create('Pill slash.md', '# Prep\n\n');
	});
	await o.openFile('Pill slash.md', 'source');
	await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
	await o.page.keyboard.type('/', { delay: 15 });
	await o.waitFor(async () => (await o.page.locator('.suggestion-container .nimble-slash-item').count()) > 10, { what: 'the slash menu' });
	await o.page.keyboard.type('enc', { delay: 15 });
	await o.page.waitForTimeout(250);
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(250);
	await o.page.keyboard.type('3 goblin minion, krogg', { delay: 15 });
	await o.waitFor(async () => (await o.page.locator('.suggestion-container .nimble-slash-badge').count()) >= 1, { what: 'slash menu badge' });
	await measurePills(o, bad, 'Slash menu (encounter)', '.suggestion-container');
	await o.page.keyboard.press('Escape');
	await o.eval(async (app) => { const f = app.vault.getAbstractFileByPath('Pill slash.md'); if (f) await app.vault.delete(f); });
	assert.deepEqual(bad, [], 'misaligned pills');
});

test('pills: 5e references, stat block, compendium, tracker and character sheet line up', async (o) => {
	const C = 'Campaigns/Pill Coast';
	const note = `${C}/Session.md`;
	const V = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
	const TR = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	const bad = [];
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			await plugin.campaigns.createCampaign({ name: 'Pill Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Session.md`, [
				'# Session', '',
				'A `5e:Goblin Warrior` casts `5e:spell:Fireball`, drinks a `5e:item:Potion of Healing`, falls `5e:Prone` and meets a `5e:Nobody Knows`.', '',
				'```5e', 'name: Ash Wight', 'type: Undead', 'ac: 14 (studded leather)', 'hp: 45 (6d8 + 18)', 'speed: 30 ft.',
				'str: 15', 'dex: 14', 'con: 16', 'int: 10', 'wis: 13', 'cha: 15', 'cr: 3',
				'actions:', '- Claw: Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Slashing damage.', '```', '',
				'```nimble-encounter', 'name: Road ambush', 'monsters:', '- 2 `5e:Goblin Warrior`', '- Ogre', '```', '',
			].join('\n'));
			await app.vault.create(`${C}/Ilse.md`, [
				'---', 'title: Ilse', 'class: Wizard', 'level: 5', 'edition: "2024"', 'str: 8', 'dex: 14', 'con: 13', 'int: 17', 'wis: 12', 'cha: 10',
				'skills: [Arcana, History]', 'spells: [Fire Bolt, Sacred Flame, Shield, Hellish Rebuke, Fireball, Hold Person]', 'conditions: [Prone]', 'exhaustion: 1', 'inspiration: true', 'inventory:', '  - { name: Dagger, equipped: true }', '  - { name: Potion of Healing, qty: 2 }', 'gold: 12', '---', '', '```5e-sheet', '```', '',
			].join('\n'));
			// An NPC on the Priest's stats, with her own AC: the mini sheet under her card.
			await app.vault.create(`${C}/Odile.md`, ['---', 'nimble: npc', 'role: Keeper of the chapel', 'statblock: Priest', 'ac: 15', 'hp: 30', 'cr: 2', '---', '', '```nimble-npc', 'Wants: The bell raised.', '```', ''].join('\n'));
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, note)) === 'dnd5e', { what: '5e campaign' });

		// References in both views, the stat block, the encounter block.
		await o.openFile(note, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.dnd5e-hit`).count()) >= 3, { what: 'compendium refs' });
		await o.page.locator(`${R} .dnd5e-encounter`).waitFor();
		await o.page.waitForTimeout(300);
		await o.page.locator(`${R} p`, { has: o.page.locator('.dnd5e-ref') }).first().screenshot({ path: join(ARTIFACTS, 'pill-5e-refs.png') });
		// Every reference sits on the line the same way: a spell's (icon first) as high as a monster's (level first).
		const tops = await o.page.locator(`${R} p`, { has: o.page.locator('.dnd5e-ref') }).first().evaluate((p) => {
			const line = (n) => Math.round(n.getBoundingClientRect().top / 4);
			const refs = [...p.querySelectorAll('.nimble-inline-ref')];
			const first = refs.filter(r => line(r) === line(refs[0]));
			return first.map(r => ({ cls: r.className, top: r.getBoundingClientRect().top }));
		});
		assert.ok(tops.length >= 2, 'two references on the first line');
		for (const t of tops) assert.ok(Math.abs(t.top - tops[0].top) < 0.6, `${t.cls} sits ${(t.top - tops[0].top).toFixed(1)}px off the monster reference`);
		await measurePills(o, bad, '5e note (reading)', `${R}`);
		await o.openFile(note, 'source');
		await o.waitFor(async () => (await o.page.locator(`${S} .dnd5e-ref.dnd5e-hit`).count()) >= 3, { what: 'Live Preview refs' });
		await measurePills(o, bad, '5e note (Live Preview)', `${S}`);
		// A monster's quick look: the stat block with its buttons.
		await o.openFile(note, 'preview');
		await o.page.locator(`${R} .dnd5e-ref`).first().locator('.nimble-inline-name').click();
		await o.page.locator('.modal.dnd5e-quick-look .dnd5e-statblock').waitFor({ timeout: 3000 });
		await measurePills(o, bad, '5e quick look', '.modal.dnd5e-quick-look');
		await o.page.keyboard.press('Escape');

		// The compendium: spells with a filter chip and Fireball's page; monsters with their tags.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:open-bestiary'); });
		await o.page.locator(V).waitFor({ timeout: 5000 });
		const input = o.page.locator(`${V} .nimble-cmpx-input`);
		await o.page.locator(`${V} .nimble-cmpx-seg`, { hasText: 'Spells' }).click();
		await input.fill('');
		await input.pressSequentially('level:3 fireball', { delay: 20 });
		await o.waitFor(async () => (await o.page.locator(`${V} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name`).innerText().catch(() => '')) === 'Fireball', { what: 'Fireball selected' });
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, '5e compendium (spells)', V);
		await o.page.locator(`${V} .nimble-cmpx-seg`, { hasText: 'Monsters' }).click();
		await input.fill('goblin');
		await o.waitFor(async () => (await o.page.locator(`${V} .nimble-cmpx-row.is-selected`).count()) === 1, { what: 'a monster selected' });
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, '5e compendium (monsters)', V);

		// The tracker before the fight (Roll all, the boxes), then mid-fight: the Ogre's card with a condition, the queue.
		await o.openFile(note, 'preview');
		await o.page.locator(`${R} .dnd5e-encounter button`, { hasText: 'Run' }).click();
		await o.page.locator(TR).waitFor({ timeout: 5000 });
		await o.waitFor(async () => (await o.page.locator(`${TR} .dnd5e-combatant`).count()) === 3, { what: 'three combatants' });
		await measurePills(o, bad, '5e tracker (setting up)', TR);
		await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.change(f => { for (const c of f.combatants) c.init = c.name === 'Ogre' ? 20 : 10; }));
		await o.page.locator(`${TR} button`, { hasText: 'Start combat' }).click();
		const ogre = o.page.locator(`${TR} .dnd5e-combatant.is-turn`);
		await ogre.waitFor({ timeout: 3000 });
		await pickCondition5e(o, ogre, 'Prone');
		await o.waitFor(async () => (await ogre.locator('.dnd5e-condition').count()) === 1, { what: 'Prone chip' });
		await measurePills(o, bad, '5e tracker', TR);

		// The character sheet, and a rules term's card.
		await o.openFile(`${C}/Ilse.md`, 'preview');
		await o.page.locator(`${R} .dnd5e-sheet`).waitFor({ timeout: 5000 });
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, '5e sheet', `${R} .dnd5e-sheet`);
		for (const t of ['spells', 'features', 'inventory']) {
			await o.page.locator(`${R} .dnd5e-tab[data-tab="${t}"]`).click();
			await o.page.locator(`${R} .dnd5e-panel.is-${t}`).waitFor();
			await measurePills(o, bad, `5e sheet (${t})`, `${R} .dnd5e-sheet`);
		}
		// The NPC's mini sheet: its buttons, skills, saves, actions (one opened to its words).
		await o.openFile(`${C}/Odile.md`, 'preview');
		await o.page.locator(`${R} .dnd5e-npc-stats .dnd5e-npc-act`).first().waitFor({ timeout: 5000 });
		await o.page.locator(`${R} .dnd5e-npc-act-name`).first().click();
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, '5e NPC stats', `${R} .dnd5e-npc-stats`);
		await o.openFile(`${C}/Ilse.md`, 'preview');
		await o.page.locator(`${R} .dnd5e-sheet`).waitFor({ timeout: 5000 });
		await o.page.locator(`${R} .dnd5e-tab[data-tab="actions"]`).click();
		const term = o.page.locator(`${R} .dnd5e-sheet .ev-term`).first();
		if (await term.count()) {
			await term.click();
			await o.page.locator('.ev-term-popover').waitFor({ timeout: 3000 });
			await measurePills(o, bad, 'rules term card', '.ev-term-popover');
			await o.page.keyboard.press('Escape');
		}

		// New character: the skill chips (the background's ticked, the class's to pick) and the sheet in brief.
		const B = '.modal.nimble-entity-builder';
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
		await o.page.locator(B).waitFor({ timeout: 3000 });
		await o.page.locator(`${B} .eb-panel.is-active select[data-field="Class"]`).selectOption('Wizard');
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Skills' }).click();
		await o.page.locator(`${B} .eb-panel.is-active .eb-pick[data-value="Arcana"]`).click();
		await o.page.waitForTimeout(500);
		await measurePills(o, bad, '5e New character', B);
		await o.eval(() => document.querySelectorAll('.modal-container').forEach(n => n.remove()));

		// Spotlight in a 5e campaign, with a typed filter.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:spotlight'); });
		const SP = '.modal-container .prompt.nimble-spotlight';
		await o.page.locator(`${SP} .prompt-input`).fill('school:evocation fire');
		await o.waitFor(async () => (await o.page.locator(`${SP} .nimble-cmpx-chip`).count()) >= 1, { what: 'Spotlight chip' });
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, '5e Spotlight', SP);
		await o.page.keyboard.press('Escape');
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container, .ev-term-popover').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			app.workspace.detachLeavesOfType('nimble-dnd5e-compendium');
			plugin.settings.party = [];
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
	assert.deepEqual(bad, [], 'misaligned pills');
});

test('game systems: a new campaign can be 5e (2014 rules), and Campaign settings switch it back to Nimble', async (o) => {
	const home = 'Campaigns/Dragon Coast/Dragon Coast.md';
	try {
		await o.eval(async (app) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath('Campaigns/Dragon Coast');
			if (old) await app.vault.delete(old, true);
			app.commands.executeCommandById('nimble-gm:new-campaign');
		});
		const modal = o.page.locator('.modal.nimble-new-campaign');
		await modal.waitFor({ timeout: 3000 });
		const options = await modal.locator('select').first().locator('option').allInnerTexts();
		assert.deepEqual(options, ['Nimble', '5e, 2024 rules (SRD 5.2)', '5e, 2014 rules (SRD 5.1)']);
		assert.equal(await modal.locator('select').first().inputValue(), 'nimble');
		await modal.locator('input[type="text"]').first().fill('Dragon Coast');
		await modal.locator('select').first().selectOption({ label: '5e, 2014 rules (SRD 5.1)' });
		await modal.locator('button', { hasText: 'Create campaign' }).click();
		await o.waitFor(async () => o.eval((app, _p, path) => !!app.vault.getAbstractFileByPath(path), home), { what: 'home note' });
		const text = await read(o, home);
		assert.match(text, /system: 5e/);
		assert.match(text, /edition: 2014/);
		await o.waitFor(async () => (await o.eval((app, plugin, path) => plugin.system(path).id, home)) === 'dnd5e', { what: '5e resolved' });
		assert.equal(await o.eval((app, plugin, path) => plugin.edition(path), home), '2014');
		assert.equal(await o.eval((app, plugin, path) => plugin.system(path).conditions(plugin.edition(path)).length, home), 15);

		// Campaign settings show the same picker, set to this campaign's system, and switch it.
		await o.eval(async (app, plugin) => { await plugin.openCampaignView(); });
		await o.page.locator(`${CP} .campaign-switch-btn`).first().click();
		await clickMenu(o, 'Campaign settings…');
		const settings = o.page.locator('.modal.nimble-campaign-settings');
		await settings.waitFor({ timeout: 3000 });
		const select = settings.locator('select').filter({ has: o.page.locator('option', { hasText: '5e, 2014 rules' }) });
		assert.equal(await select.inputValue(), 'dnd5e:2014');
		await select.selectOption({ label: 'Nimble' });
		await settings.locator('button', { hasText: 'Save' }).click();
		await o.waitFor(async () => /system: Nimble/.test(await read(o, home)), { what: 'system: Nimble written' });
		assert.doesNotMatch(await read(o, home), /edition:/);
		await o.waitFor(async () => (await o.eval((app, plugin, path) => plugin.system(path).id, home)) === 'nimble', { what: 'Nimble resolved' });
		assert.equal(await o.eval((app, plugin, path) => plugin.edition(path), home), undefined);
	} finally {
		await o.eval(async (app, plugin) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const f = app.vault.getAbstractFileByPath('Campaigns/Dragon Coast');
			if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		});
	}
});

test('5e monsters: ```5e blocks in both layouts, 5e: references with CR, hover card, quick look, Copy to vault', async (o) => {
	const C = 'Campaigns/Sword Coast';
	const note = `${C}/Session 1.md`;
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const p of [C, 'Campaigns/Old Rules']) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f, true); }
			await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: true, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Session 1.md`, [
				'# Session 1', '',
				'An ambush by `5e:Goblin Warrior`, an old-rules `5e:Goblin`, and a `5e:Nobody Knows`.', '',
				'```5e', 'name: Ash Wight', 'type: Undead', 'ac: 14 (studded leather)', 'hp: 45 (6d8 + 18)', 'speed: 30 ft.',
				'str: 15', 'dex: 14', 'con: 16', 'int: 10', 'wis: 13', 'cha: 15', 'saves: Con +5', 'cr: 3',
				'actions:', '- Claw: Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Slashing damage.', '```', '',
			].join('\n'));
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, note)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(note, 'preview');
		const block = o.page.locator(`${R} .dnd5e-statblock`);
		await o.waitFor(async () => (await block.count()) === 1, { what: '5e stat block' });
		assert.ok(await block.evaluate(el => el.classList.contains('ed-2024')), '2024 layout in a 2024 campaign');
		assert.match(await block.locator('.dnd5e-name').innerText(), /Ash Wight/i);
		assert.match(await block.innerText(), /AC\s*14[\s\S]*Initiative\s*\+2 \(12\)[\s\S]*HP\s*45/);
		assert.match(await block.locator('.ab-con').innerText(), /16\s*\+3\s*\+5/);
		assert.match(await block.innerText(), /CR\s*3 \(XP 700; PB \+2\)/);
		// The attack bonus rolls a d20.
		await block.locator('.dnd5e-feature .dnd5e-roll.is-clickable').first().click();
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.rollLog[0]?.expression)) === '1d20+4', { what: 'attack roll logged' });

		// References: the edition's monster, the other edition's when this one hasn't got it, and an unknown name.
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.nimble-inline-found`).count()) === 2, { what: 'two found refs' });
		const refs = await o.page.evaluate((R) => [...document.querySelectorAll(`${R} .dnd5e-ref`)].map(r => ({ name: r.dataset.dnd5eRef, cr: r.querySelector('.nimble-inline-level')?.textContent ?? null, found: r.classList.contains('nimble-inline-found') })), R);
		assert.deepEqual(refs, [{ name: 'Goblin Warrior', cr: '1/4', found: true }, { name: 'Goblin', cr: '1/4', found: true }, { name: 'Nobody Knows', cr: null, found: false }]);

		// Hover: the stat block card. Click: a quick look.
		const warrior = o.page.locator(`${R} .dnd5e-ref`).first().locator('.nimble-inline-name');
		await warrior.hover();
		await o.waitFor(async () => (await o.page.locator('.nimble-hover-preview .dnd5e-statblock').count()) === 1, { what: 'hover card' });
		assert.match(await o.page.locator('.nimble-hover-preview .dnd5e-name').innerText(), /Goblin Warrior/i);
		await o.page.keyboard.press('Escape');
		await warrior.click();
		const look = o.page.locator('.modal.dnd5e-quick-look');
		await look.waitFor({ timeout: 3000 });
		assert.match(await look.locator('.record-sub').innerText(), /CR 1\/4/);
		assert.ok(await look.locator('.dnd5e-statblock.ed-2024').count() === 1);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-quick-look.png') });

		// Copy to vault: a note in the campaign's Monsters folder, and the reference now opens it.
		await look.locator('button', { hasText: 'Copy to vault' }).click();
		const copy = `${C}/Monsters/Goblin Warrior.md`;
		await o.waitFor(async () => o.eval((app, _p, path) => !!app.vault.getAbstractFileByPath(path), copy), { what: 'copied note' });
		const copied = await read(o, copy);
		assert.match(copied, /```5e\nname: Goblin Warrior\nedition: 2024\n[\s\S]*cr: 1\/4[\s\S]*```/);
		await o.page.keyboard.press('Escape');
		await o.openFile(note, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.nimble-inline-found`).count()) === 2, { what: 'refs again' });
		await o.page.locator(`${R} .dnd5e-ref`).first().locator('.nimble-inline-name').click();
		await o.waitFor(async () => (await o.page.locator('.modal.dnd5e-quick-look button', { hasText: 'Open note' }).count()) === 1, { what: 'the copy is the one referenced' });
		assert.equal(await o.page.locator('.modal.dnd5e-quick-look button', { hasText: 'Copy to vault' }).count(), 0);
		await o.page.keyboard.press('Escape');

		// Spotlight in a 5e campaign: 5e monsters with their CR, no Nimble bestiary; Enter is a quick look.
		await o.eval(async (app, plugin, C) => { await plugin.campaigns.setActive(C); app.commands.executeCommandById('nimble-gm:spotlight'); }, C);
		const SP = '.modal-container .prompt.nimble-spotlight';
		await o.page.locator(`${SP} .prompt-input`).waitFor();
		await o.page.locator(`${SP} .prompt-input`).fill('goblin');
		await o.waitFor(async () => (await o.page.locator(`${SP} .suggestion-item .nimble-spot-name`).allInnerTexts()).includes('Goblin Warrior'), { what: '5e goblin in Spotlight' });
		const spotNames = await o.page.locator(`${SP} .suggestion-item .nimble-spot-name`).allInnerTexts();
		assert.ok(!spotNames.includes('Goblin Taskmaster'), 'no Nimble monsters in a 5e campaign');
		assert.match(await o.page.locator(`${SP} .suggestion-item`, { hasText: 'Goblin Warrior' }).first().innerText(), /1\/4[\s\S]*Goblin Warrior[\s\S]*CR 1\/4/);
		await o.page.locator(`${SP} .suggestion-item`, { hasText: 'Goblin Warrior' }).first().click();
		await o.page.locator('.modal.dnd5e-quick-look').waitFor({ timeout: 3000 });
		// Escape from the quick look goes back to Spotlight; a second closes it.
		await o.page.keyboard.press('Escape');
		await o.page.locator(`${SP} .prompt-input`).waitFor({ timeout: 3000 });
		await o.page.keyboard.press('Escape');
		await o.waitFor(async () => (await o.page.locator('.modal-container').count()) === 0, { what: 'Spotlight closed' });

		// Typing `5e: suggests 5e monsters.
		await o.eval(async (app, plugin, C) => {
			const f = await app.vault.create(`${C}/Scratch.md`, 'Meet the \n');
			await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'source' } });
			const editor = app.workspace.activeEditor.editor;
			editor.setCursor({ line: 0, ch: 9 });
			editor.focus();
		}, C);
		await o.page.keyboard.type('`5e:adult red', { delay: 30 });
		await o.waitFor(() => o.page.evaluate(() => document.querySelector('.suggestion-container .nimble-suggestion-name')?.textContent === 'Adult Red Dragon'), { timeout: 5000, what: 'Adult Red Dragon suggested' });
		assert.match(await o.page.locator('.suggestion-container .nimble-suggestion-note').first().innerText(), /CR 17/);
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(200);
		assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), 'Meet the `5e:Adult Red Dragon`');

		// A 2014 campaign lays its monsters out the 2014 way.
		await o.eval(async (app, plugin) => {
			await plugin.campaigns.createCampaign({ name: 'Old Rules', level: 1, heroes: 4, starter: false, system: '5e', edition: '2014' });
			await app.vault.create('Campaigns/Old Rules/Notes.md', 'Watch out for `5e:Goblin`.\n');
		});
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.edition('Campaigns/Old Rules/Notes.md'))) === '2014', { what: '2014 campaign' });
		await o.openFile('Campaigns/Old Rules/Notes.md', 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.nimble-inline-found`).count()) === 1, { what: 'goblin ref' });
		await o.page.locator(`${R} .dnd5e-ref .nimble-inline-name`).click();
		await o.page.locator('.modal.dnd5e-quick-look .dnd5e-statblock.ed-2014').waitFor({ timeout: 3000 });
		assert.match(await o.page.locator('.modal.dnd5e-quick-look .dnd5e-statblock').innerText(), /Armor Class\s*15 \(leather armor, shield\)[\s\S]*Challenge\s*1\/4 \(50 XP\)/);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-2014.png') });
		await o.page.keyboard.press('Escape');

		// Live Preview draws them too.
		await o.openFile('Campaigns/Old Rules/Notes.md', 'source');
		await o.waitFor(async () => (await o.page.locator('.workspace-leaf.mod-active .markdown-source-view .dnd5e-ref.nimble-inline-found').count()) === 1, { what: 'live preview ref' });
	} finally {
		await o.eval(async (app, plugin) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const p of ['Campaigns/Sword Coast', 'Campaigns/Old Rules']) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f, true); }
			await plugin.campaigns.setActive(null);
		});
	}
});

test('5e encounters: a block rated by 2024 XP, Run into the 5e tracker, initiative, turns, HP, conditions, death saves', async (o) => {
	const C = 'Campaigns/Sword Coast';
	const note = `${C}/Ambush.md`;
	const T = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Ambush.md`, '# Ambush\n\n```nimble-encounter\nname: Road ambush\nparty: true\nmonsters:\n- 4 `5e:Goblin Warrior`\n- Ogre\n```\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, note)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(note, 'preview');
		const block = o.page.locator(`${R} .dnd5e-encounter`);
		await o.waitFor(async () => (await block.count()) === 1, { what: '5e encounter block' });
		// Four level-3 heroes: Low 600, Moderate 900, High 1,600. 4 × 50 + 450 = 650 XP.
		await o.waitFor(async () => /Low · 41%/i.test(await block.locator('.nimble-difficulty').innerText().catch(() => '')), { what: 'Low rating' });
		assert.match((await block.locator('.nimble-difficulty').getAttribute('title')) ?? (await block.locator('.nimble-difficulty').getAttribute('aria-label')), /650 XP[\s\S]*Low: 600 XP[\s\S]*High: 1,600 XP[\s\S]*2024 rules/);
		assert.deepEqual(await block.locator('.dnd5e-encounter-xp').allInnerTexts(), ['200 XP', '450 XP']);

		// Run: a fresh fight in the 5e tracker, set up row by row.
		await block.locator('button', { hasText: 'Run' }).click();
		await o.page.locator(T).waitFor({ timeout: 5000 });
		const rows = o.page.locator(`${T} .dnd5e-combatant`);
		await o.waitFor(async () => (await rows.count()) === 5, { what: 'five combatants' });
		assert.deepEqual((await o.page.locator(`${T} .dnd5e-combatant-name`).allInnerTexts()).sort(), ['Goblin Warrior', 'Goblin Warrior 2', 'Goblin Warrior 3', 'Goblin Warrior 4', 'Ogre']);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-tracker-setup.png') });

		// Roll all: identical monsters share one roll, so the four goblins become one row.
		await o.page.locator(`${T} button[aria-label="Roll initiative"]`).click();
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-init.is-unset`).count()) === 0, { what: 'initiative rolled' });
		await o.waitFor(async () => (await rows.count()) === 2, { what: 'the goblins on one roll' });
		assert.deepEqual((await o.page.locator(`${T} .dnd5e-combatant-name`).allInnerTexts()).sort(), ['Goblin Warriors ×4', 'Ogre']);
		const inits = await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.filter(c => c.name === 'Goblin Warrior').map(c => c.init));
		assert.equal(new Set(inits).size, 1, `one roll for the group: ${inits}`);
		// The group's box sets the whole group (12, so the order below doesn't hang on the dice).
		const goblins = o.page.locator(`${T} .dnd5e-combatant`, { has: o.page.locator('.dnd5e-combatant-name', { hasText: /^Goblin Warriors ×4$/ }) });
		await goblins.locator('.dnd5e-init').click();
		await o.page.locator('.dnd5e-init-pop input').fill('12');
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.filter(c => c.name === 'Goblin Warrior').every(c => c.init === 12))), { what: 'the group set to 12' });
		// The initiative box takes a typed roll: the Ogre goes first.
		const ogre = o.page.locator(`${T} .dnd5e-combatant`, { has: o.page.locator('.dnd5e-combatant-name', { hasText: /^Ogre$/ }) });
		await ogre.locator('.dnd5e-init').click();
		await o.page.locator('.dnd5e-init-pop input').fill('30');
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-combatant-name`).first().innerText()) === 'Ogre', { what: 'Ogre first' });
		assert.equal(await ogre.locator('.dnd5e-init').innerText(), '30');
		await o.page.locator(`${T} button`, { hasText: 'Start combat' }).click();
		await o.waitFor(async () => /Round 1/i.test(await o.page.locator(`${T} .dnd5e-tracker-round`).innerText()), { what: 'round 1' });
		// The card is whoever acts: the Ogre, with its initiative gem, AC shield and HP.
		assert.equal(await o.page.locator(`${T} .dnd5e-combatant.is-turn`).count(), 1);
		const first = await o.page.locator(`${T} .dnd5e-combatant.is-turn .dnd5e-combatant-name`).innerText();
		assert.equal(first, 'Ogre');
		assert.match(await o.page.locator(`${T} .dnd5e-tracker-status`).innerText(), /Ogre's turn/);
		assert.equal(await ogre.locator('.dnd5e-gem').innerText(), '30');
		assert.equal(await ogre.locator('.dnd5e-ac').getAttribute('aria-label'), 'AC 11');
		const hp = async (label) => (await o.eval((app, plugin, l) => plugin.runtime('dnd5e').fights.fight.combatants.find(c => c.label === l)?.hp, label));
		assert.equal(await hp('Ogre'), 68);

		// Damage the Ogre on the HP keypad: 68 HP → 58. Then 6 resisted (halved to 3), previewed before it lands.
		await hpPad5e(o, ogre, '10');
		await o.waitFor(async () => (await hp('Ogre')) === 58, { what: 'ogre damaged' });
		await ogre.locator('.dnd5e-focus-hp-btn').click();
		const pad = o.page.locator('.nimble-hp-pad');
		await pad.waitFor();
		await o.page.keyboard.type('6r');
		assert.match(await pad.locator('.hp-pad-preview').innerText(), /→ 55\/68 · takes 3 \(resisted\)/);
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await hp('Ogre')) === 55, { what: 'ogre resisted 6' });
		// Knock it Prone, from the card's condition button.
		await pickCondition5e(o, ogre, 'Prone');
		await o.waitFor(async () => (await ogre.locator('.dnd5e-condition', { hasText: 'Prone' }).count()) === 1, { what: 'Prone chip' });
		// Concentrating, from the card's menu: damage calls for the save.
		await ogre.locator('.dnd5e-combatant-more').click();
		await clickMenu(o, 'Concentrating');
		await o.waitFor(async () => (await ogre.locator('.dnd5e-condition.is-concentration').count()) === 1, { what: 'concentrating' });
		await o.eval(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
		await hpPad5e(o, ogre, '24');
		await o.waitFor(async () => /Constitution save DC 12/.test((await o.page.locator('.notice').allInnerTexts()).join(' ')), { what: 'concentration save called' });

		// Next: the goblins' turn, one member at a time on the card.
		const turnName = () => o.page.locator(`${T} .dnd5e-combatant.is-turn .dnd5e-combatant-name`).innerText();
		const next = o.page.locator(`${T} .dnd5e-next`);
		assert.equal(await next.innerText(), 'Next: Goblin Warriors');
		await next.click();
		await o.waitFor(async () => (await turnName()) === 'Goblin Warrior', { what: 'the goblins up' });
		assert.equal(await o.page.locator(`${T} .dnd5e-members .dnd5e-member`).count(), 4);
		assert.equal(await next.innerText(), 'Next: Goblin Warrior 2');
		await next.click();
		await o.waitFor(async () => (await turnName()) === 'Goblin Warrior 2', { what: 'the second goblin' });
		assert.equal(await o.page.locator(`${T} .is-acted-list .dnd5e-combatant-name`).allInnerTexts().then(n => n.join('|')), 'Ogre');

		// The party joins mid-fight; tapping a row out of order makes them act now, and nobody is reshuffled.
		await o.eval(async (app, plugin) => { plugin.settings.party = [{ id: 'h1', name: 'Ilse', level: 3, maxHp: 24, defense: 16 }]; });
		await o.page.locator(`${T} button[aria-label="Add the party"]`).click();
		const ilse = o.page.locator(`${T} .dnd5e-combatant.side-hero`);
		await o.waitFor(async () => (await ilse.count()) === 1, { what: 'hero added' });
		assert.equal(await ilse.locator('.dnd5e-ac').getAttribute('aria-label'), 'AC 16');
		await ilse.locator('.dnd5e-init').click();
		await o.page.locator('.dnd5e-init-pop input').fill('5');
		await o.page.keyboard.press('Enter');
		await ilse.locator('.dnd5e-combatant-name').click();
		await o.waitFor(async () => (await turnName()) === 'Ilse', { what: 'Ilse acts now' });
		assert.equal(await next.innerText(), 'Next: Goblin Warrior 2', 'whoever was up stays next');
		// A hero at 0 HP makes death saves on the card.
		await hpPad5e(o, ilse, '30');
		await o.waitFor(async () => (await ilse.locator('.dnd5e-death').count()) === 1, { what: 'death saves' });
		await ilse.locator('.dnd5e-death-roll').click();
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.rollLog[0]?.label)) === 'Ilse: death save', { what: 'death save rolled' });
		await o.waitFor(async () => {
			const t = await ilse.innerText();
			return (await ilse.locator('.ev-pip.is-on').count()) >= 1 || /Stable|Dead/i.test(t) || /\b1\s*\/\s*24\b/.test(t);
		}, { what: 'death save recorded' });
		// Back: the goblin is up again, Ilse still to act.
		await o.page.locator(`${T} button[aria-label="Back a turn"]`).click();
		await o.waitFor(async () => (await turnName()) === 'Goblin Warrior 2', { what: 'Back undoes the tap' });

		// Round 2: everyone still to act. Drag Ilse to the top: she takes the goblins' initiative and goes before them.
		await next.click(); await next.click(); await next.click(); await next.click();
		await o.waitFor(async () => /Round 2/.test(await o.page.locator(`${T} .dnd5e-tracker-round`).innerText()), { what: 'round 2' });
		await o.waitFor(async () => (await turnName()) === 'Ogre', { what: 'the Ogre first again' });
		const L = `${T} .dnd5e-tracker-list.is-to-act > .dnd5e-combatant`;
		const names = () => o.page.locator(`${L} .dnd5e-combatant-name`).allInnerTexts();
		assert.deepEqual(await names(), ['Goblin Warriors', 'Ilse']);
		const grab = await o.page.locator(L).last().locator('.dnd5e-combatant-name').boundingBox();
		const top = await o.page.locator(L).first().boundingBox();
		await o.page.mouse.move(grab.x + 8, grab.y + grab.height / 2);
		await o.page.mouse.down();
		await o.page.mouse.move(grab.x + 10, grab.y - 20, { steps: 4 });
		await o.waitFor(async () => (await o.page.locator(`${T} .ev-sort-slot`).count()) === 1, { what: 'drop slot while dragging' });
		await o.page.mouse.move(grab.x + 10, top.y + 2, { steps: 14 });
		await o.page.waitForTimeout(150);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-tracker-drag.png') });
		await o.page.mouse.up();
		await o.waitFor(async () => (await names())[0] === 'Ilse', { what: 'dragged to the top' });
		assert.equal(await turnName(), 'Ogre', 'the turn stayed put');
		assert.equal(await o.page.locator(`${T} .ev-sort-slot, ${T} .ev-sort-lifted`).count(), 0, 'nothing left lifted');
		assert.equal(await next.innerText(), 'Next: Ilse');
		// Move down, from the row menu: back under the goblins.
		await o.page.locator(L).first().locator('.dnd5e-combatant-name').click({ button: 'right' });
		await clickMenu(o, 'Move down');
		await o.waitFor(async () => (await names())[1] === 'Ilse', { what: 'moved down one' });

		// A defeated monster folds away under Defeated, still in the fight: its group's HP asks which one.
		await o.page.locator(L).first().locator('.dnd5e-hp-text').click();
		await o.page.locator('.dnd5e-member-pick', { hasText: 'Goblin Warrior 4' }).click();
		await o.page.locator('.nimble-hp-pad').waitFor();
		await o.page.keyboard.type('50');
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-tracker-defeated .dnd5e-combatant`).count()) === 1, { what: 'goblin defeated' });
		assert.match(await o.page.locator(`${T} .dnd5e-tracker-defeated summary`).innerText(), /Defeated\s*1/i);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-tracker-fight.png') });

		// The fight is saved with the plugin's data, and Open encounter tracker shows it in a 5e campaign.
		assert.equal(await o.eval((app, plugin) => plugin.settings.systemData?.dnd5e?.fight?.combatants?.length), 6);
		await o.eval(async (app) => { app.workspace.detachLeavesOfType('nimble-dnd5e-tracker'); app.commands.executeCommandById('nimble-gm:open-tracker'); });
		await o.page.locator(T).waitFor({ timeout: 5000 });
		assert.equal(await o.page.locator(`${T} .dnd5e-combatant.is-turn`).count(), 1);
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			plugin.settings.party = [];
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('5e encounters: timed conditions run out, damage effects prompt at the start of a turn, your own conditions come back', async (o) => {
	const C = 'Campaigns/Timed Coast';
	const T = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	const row = (name) => o.page.locator(`${T} .dnd5e-combatant`, { has: o.page.locator('.dnd5e-combatant-name', { hasText: new RegExp(`^${name}$`) }) });
	const fight = () => o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.map(c => ({ label: c.label, hp: c.hp, conditions: c.conditions.map(x => x.name), rounds: Object.fromEntries(c.conditions.map(x => [x.name, x.rounds])) })));
	const of = async (label) => (await fight()).find(c => c.label === label);
	const modal = o.page.locator('.modal.ev-effect-prompt');
	const nextTurn = async () => { await o.page.locator(`${T} .dnd5e-next`).click(); await o.page.waitForTimeout(150); };
	/** The picker for anyone: the card's button, or a row's menu (right-click, long-press). */
	const addFor = async (name) => {
		const r = row(name);
		const btn = r.locator('.ev-card-condition');
		if (await btn.count()) await btn.click();
		else { await r.locator('.dnd5e-combatant-name').click({ button: 'right' }); await o.page.locator('.menu .menu-item', { hasText: exact('Add a condition…') }).click(); }
	};
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			plugin.settings.customConditions = plugin.settings.customConditions.filter(c => c.name !== 'Seared');
			await plugin.campaigns.createCampaign({ name: 'Timed Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Fight.md`, '```nimble-encounter\nname: Timed fight\nmonsters:\n- 2 `5e:Goblin Warrior`\n- `5e:Ogre`\n```\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, `${C}/Fight.md`)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(`${C}/Fight.md`, 'preview');
		await o.page.locator('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-encounter button', { hasText: 'Run' }).first().click();
		await o.page.locator(T).waitFor({ timeout: 5000 });
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-combatant`).count()) === 3, { what: 'three combatants' });
		await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.change(f => { const inits = { 'Ogre': 20, 'Goblin Warrior': 15, 'Goblin Warrior 2': 10 }; for (const c of f.combatants) c.init = inits[c.label]; }));
		await o.page.locator(`${T} button`, { hasText: 'Start combat' }).click();
		await o.waitFor(async () => /Ogre's turn/.test(await o.page.locator(`${T} .dnd5e-tracker-status`).innerText()), { what: "Ogre's turn" });

		// Frightened for 2 rounds, from the picker (a row's menu): two taps and a duration. The row says so.
		await addFor('Goblin Warrior');
		await o.page.locator('.condition-picker .nimble-segmented button', { hasText: exact('2') }).click();
		await o.page.locator('.condition-picker .condition-option[aria-label="Frightened"]').click();
		await o.waitFor(async () => (await of('Goblin Warrior')).rounds.Frightened === 2, { what: 'Frightened, 2 rounds' });
		await o.waitFor(async () => /Frightened · 2 rd/.test(await row('Goblin Warrior').locator('.dnd5e-row-sub').innerText().catch(() => '')), { what: 'the row says so' });

		// Burning (SRD 5.2) comes with its effect: 1d4 Fire at the start of each turn. The Ogre is on the card.
		await addFor('Ogre');
		await o.page.locator('.condition-picker .condition-search').fill('burn');
		await o.page.locator('.condition-picker .condition-option[aria-label="Burning"]').click();
		await o.waitFor(async () => (await row('Ogre').locator('.dnd5e-condition', { hasText: 'Burning' }).locator('.dnd5e-condition-mark.is-damage').count()) === 1, { what: 'Burning chip with its mark' });

		// A condition of your own, made on the spot: 3 Fire damage at the start of its turns, kept for next time.
		await addFor('Goblin Warrior 2');
		await o.page.locator('.condition-picker .condition-search').fill('Seared');
		await o.page.locator('.condition-picker .ev-cond-new').click();
		const ed = o.page.locator('.nimble-popover.condition-editor');
		await ed.locator('.ev-cond-add-trigger', { hasText: 'Damage' }).click();
		await ed.locator('.ev-trigger-dice').fill('3');
		await ed.locator('.ev-trigger-type').fill('Fire');
		await ed.locator('.ev-trigger-type').press('Tab');
		assert.equal(await ed.locator('.ev-cond-keep input').isChecked(), true);
		await ed.locator('.ev-cond-apply').click();
		await o.waitFor(async () => (await of('Goblin Warrior 2')).conditions.includes('Seared'), { what: 'Seared applied' });
		const kept = await o.eval((app, plugin) => plugin.settings.customConditions.find(c => c.name === 'Seared'));
		assert.deepEqual(kept.timing, { triggers: [{ kind: 'damage', at: 'start', dice: '3', damageType: 'Fire' }] });

		// Ogre → Goblin → Goblin 2: Frightened counts down at the end of the goblin's turn; Seared asks at the start of Goblin 2's.
		await nextTurn();
		assert.equal(await modal.count(), 0);
		await nextTurn();
		assert.equal((await of('Goblin Warrior')).rounds.Frightened, 1);
		await modal.waitFor({ timeout: 3000 });
		assert.match(await modal.locator('.ev-effect').innerText(), /Goblin Warrior 2 is Seared[\s\S]*3 Fire damage/i);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-effect-prompt.png') });
		await modal.locator('.ev-effect-roll', { hasText: 'Apply 3' }).click();
		assert.equal((await of('Goblin Warrior 2')).hp, 7);
		await modal.locator('.ev-effect-done').click();
		await modal.waitFor({ state: 'detached', timeout: 3000 });

		// Round 2: the Ogre burns at the start of its turn; rolling applies it.
		await nextTurn();
		await modal.waitFor({ timeout: 3000 });
		assert.match(await modal.innerText(), /Ogre is Burning[\s\S]*1d4 Fire damage/i);
		const before = (await of('Ogre')).hp;
		await modal.locator('.ev-effect-roll').click();
		await o.waitFor(async () => /Rolled \d/.test(await modal.locator('.ev-effect-result').innerText().catch(() => '')), { what: 'burn rolled' });
		const lost = before - (await of('Ogre')).hp;
		assert.ok(lost >= 1 && lost <= 4, `burned for ${lost}`);
		assert.equal(await o.eval((app, plugin) => plugin.settings.rollLog[0]?.label), 'Ogre: Burning');
		await modal.locator('.ev-effect-done').click();

		// Goblin → Goblin 2: Frightened runs out at the end of the goblin's second turn. Skip the sear this time.
		await nextTurn();
		await nextTurn();
		assert.deepEqual((await of('Goblin Warrior')).conditions, []);
		await modal.waitFor({ timeout: 3000 });
		await modal.locator('.ev-effect-skip').click();
		await modal.locator('.ev-effect-done').click();
		assert.equal((await of('Goblin Warrior 2')).hp, 7);

		// Back puts Frightened back (1 round left); Next again ends it, and doesn't ask about the sear twice.
		await o.page.locator(`${T} button[aria-label="Back a turn"]`).click();
		await o.waitFor(async () => (await of('Goblin Warrior')).rounds.Frightened === 1, { what: 'Frightened back after Back' });
		await nextTurn();
		assert.deepEqual((await of('Goblin Warrior')).conditions, []);
		assert.equal(await modal.count(), 0);

		// Your own condition is offered next time, with its effect.
		await addFor('Ogre');
		await o.page.locator('.condition-picker .condition-search').fill('sea');
		const offered = o.page.locator('.condition-picker .condition-option[aria-label="Seared"]');
		assert.equal(await offered.count(), 1);
		assert.equal(await offered.locator('.ev-cond-mark').count(), 1);
		await o.page.keyboard.press('Escape');
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			plugin.settings.customConditions = plugin.settings.customConditions.filter(c => c.name !== 'Seared');
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('encounter settings: the 5e tracker menu opens 5e\'s own settings; heroes left blank for players to fill in', async (o) => {
	const C = 'Campaigns/Settings Coast';
	const T = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Settings Coast', level: 3, heroes: 1, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Fight.md`, '```nimble-encounter\nname: Test fight\nmonsters:\n- `5e:Goblin Warrior`\n```\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, `${C}/Fight.md`)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(`${C}/Fight.md`, 'preview');
		// The campaign is active now, so this is its party.
		await o.eval((app, plugin) => { plugin.settings.party = [{ id: 'h1', name: 'Ilse', level: 3, maxHp: 24, defense: 16 }]; });
		await o.page.locator('.workspace-leaf.mod-active .markdown-reading-view .dnd5e-encounter button', { hasText: 'Run' }).click();
		await o.page.locator(T).waitFor({ timeout: 5000 });
		await o.page.locator(`${T} button[aria-label="Add the party"]`).click();
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-combatant`).count()) === 2, { what: 'two in the fight' });

		await o.eval(() => document.querySelectorAll('.notice').forEach(n => n.remove())); // a notice from earlier can sit over the menu button
		await o.page.locator(`${T} .dnd5e-tracker-more`).click();
		await o.page.locator('.menu-item', { hasText: 'Encounter settings…' }).click();
		const dlg = o.page.locator('.modal.ev-settings-modal');
		await dlg.waitFor();
		assert.match(await dlg.locator('.modal-title').innerText(), /5e encounter settings/);
		const heroes = dlg.locator('.setting-item', { hasText: 'Roll heroes\' initiative when combat starts' });
		await heroes.locator('.checkbox-container').click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.settings.systemData?.dnd5e?.options?.rollHeroes === false), { what: 'setting saved' });
		await o.page.keyboard.press('Escape');

		await o.page.locator(`${T} button`, { hasText: 'Start combat' }).click();
		await o.waitFor(() => o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.round === 1), { what: 'combat started' });
		const inits = await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.map(c => [c.side, c.init ?? null]));
		assert.ok(inits.some(([side, init]) => side === 'monster' && init !== null), `monster rolled: ${JSON.stringify(inits)}`);
		assert.ok(inits.some(([side, init]) => side === 'hero' && init === null), `hero left blank: ${JSON.stringify(inits)}`);
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			if (plugin.settings.systemData?.dnd5e?.options) delete plugin.settings.systemData.dnd5e.options;
			plugin.settings.party = [];
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			if (plugin.settings.activeCampaign) await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('map pins: a click shows the note in a quick look over the map; Cmd/Ctrl-click opens the page', async (o) => {
	await resetEncounter(o);
	const M = '.workspace-leaf.mod-active .markdown-reading-view';
	try {
		await o.eval(async (app) => {
			for (const f of ['Pin Map.md', 'Pin NPC.md']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
			const c = document.createElement('canvas'); c.width = 400; c.height = 300;
			c.getContext('2d').fillRect(0, 0, 400, 300);
			const blob = await new Promise(r => c.toBlob(r, 'image/png'));
			if (!app.vault.getAbstractFileByPath('pin-map.png')) await app.vault.createBinary('pin-map.png', await blob.arrayBuffer());
			await app.vault.create('Pin NPC.md', '---\nnimble: npc\nrole: Ferryman\n---\nHe ferries smugglers.\n');
			await app.vault.create('Pin Map.md', '```nimble-map\nimage: [[pin-map.png]]\npins:\n- 50, 50 | The ferryman | [[Pin NPC]] | npc\n```\n');
		});
		await o.openFile('Pin Map.md', 'preview');
		// The pin's own box is a point; its badge is what you click.
		const pin = o.page.locator(`${M} .nimble-map-pin .nimble-map-pin-inner`).first();
		await o.waitFor(() => o.page.evaluate((M) => { const img = document.querySelector(`${M} .nimble-map img`); return !!img && img.naturalWidth > 0; }, M), { what: 'the map image' });
		await pin.waitFor({ state: 'visible', timeout: 10000 });
		// Show pin labels shows them (a small image counts as zoomed out; a label without a key still shows), and hides them.
		const label = o.page.locator(`${M} .nimble-map-pin .pin-label-full`).first();
		const toggle = o.page.locator(`${M} .nimble-map-btn[aria-label="Show pin labels"]`);
		assert.equal(await label.isVisible(), true, 'labels show by default');
		await toggle.click();
		await o.waitFor(async () => !(await label.isVisible()), { what: 'labels hidden' });
		await toggle.click();
		await o.waitFor(() => label.isVisible(), { what: 'labels back' });
		await pin.click();
		await o.waitFor(async () => (await o.page.locator('.modal-container .modal').count()) === 1, { what: 'a quick look' });
		assert.match(await o.page.locator('.modal-container .modal').innerText(), /Pin NPC|ferries smugglers/);
		assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'Pin Map.md', 'still on the map');
		await o.page.keyboard.press('Escape');
		await o.waitFor(async () => (await o.page.locator('.modal-container').count()) === 0, { what: 'quick look closed' });
		await pin.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
		await o.waitFor(async () => (await o.eval((app) => app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === 'Pin NPC.md'))), { what: 'the page in a new tab' });
	} finally {
		await o.eval(async (app) => {
			app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === 'Pin NPC.md').forEach(l => l.detach());
			document.querySelectorAll('.modal-container').forEach(n => n.remove());
			for (const f of ['Pin Map.md', 'Pin NPC.md', 'pin-map.png']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x); }
		});
	}
});

test('map tokens come from the campaign\'s game: Nimble\'s encounter, then 5e\'s fight', async (o) => {
	await resetEncounter(o);
	const C = 'Campaigns/Token Coast';
	const M = '.workspace-leaf.mod-active .markdown-reading-view';
	const trayNames = () => o.page.locator(`${M} .nimble-map-token.in-tray .nimble-map-token-name`).allInnerTexts();
	const openMap = async (path) => {
		await o.openFile(path, 'preview');
		const btn = o.page.locator(`${M} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`);
		await btn.waitFor({ timeout: 5000 });
		await btn.click();
	};
	try {
		await o.eval(async (app, plugin, C) => {
			const c = document.createElement('canvas'); c.width = 400; c.height = 300;
			c.getContext('2d').fillRect(0, 0, 400, 300);
			const blob = await new Promise(r => c.toBlob(r, 'image/png'));
			if (!app.vault.getAbstractFileByPath('token-map.png')) await app.vault.createBinary('token-map.png', await blob.arrayBuffer());
			const md = '```nimble-map\nimage: [[token-map.png]]\n```\n';
			for (const f of ['Token Map.md', C]) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
			await app.vault.create('Token Map.md', md);
		}, C);

		// Nimble (a map outside any campaign): the active campaign's Nimble encounter. Each campaign keeps its
		// own fight, so the goblin goes in once the map is open and whichever campaign is active has settled.
		await o.openFile('Token Map.md', 'preview');
		await o.page.waitForTimeout(300);
		await o.eval(async (app, plugin) => {
			const nb = plugin.runtime('nimble');
			await nb.addToEncounter(nb.index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md', 1);
		});
		await openMap('Token Map.md');
		await o.waitFor(async () => (await trayNames()).some(n => /^Goblin Boss/.test(n)), { what: 'the Nimble encounter in the tray' });

		// 5e: Run the fight, and the 5e campaign's map shows its fighters, not Nimble's.
		await o.eval(async (app, plugin, C) => {
			await plugin.campaigns.createCampaign({ name: 'Token Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Ambush.md`, '```nimble-encounter\nname: Bridge\nmonsters:\n- 2 `5e:Goblin Warrior`\n```\n');
			await app.vault.create(`${C}/Bridge Map.md`, '```nimble-map\nimage: [[token-map.png]]\n```\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, `${C}/Ambush.md`)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(`${C}/Ambush.md`, 'preview');
		const block = o.page.locator(`${M} .dnd5e-encounter`);
		await block.locator('button', { hasText: 'Run' }).waitFor();
		await block.locator('button', { hasText: 'Run' }).click();
		await o.waitFor(() => o.eval((app, plugin) => { const f = plugin.runtime('dnd5e').fights.fight; return f.name === 'Bridge' && f.combatants.length === 2; }), { what: 'the 5e fight' });
		await openMap(`${C}/Bridge Map.md`);
		await o.waitFor(async () => {
			const n = await trayNames();
			return n.length === 2 && n.every(x => /^Goblin Warrior/.test(x));
		}, { what: '5e fighters in the tray' });
		await o.waitFor(async () => /Bridge: drag onto the map/.test(await o.page.locator(`${M} .nimble-map-tray-title`).innerText().catch(() => '')), { what: 'the 5e fight\'s name over the tray' });
		// A change in the fight redraws the tokens.
		await o.eval((app, plugin) => { plugin.runtime("dnd5e").fights.change(f => { f.combatants[0].hp = 0; }); });
		await o.waitFor(async () => (await o.page.locator(`${M} .nimble-map-token.in-tray.is-down`).count()) === 1, { what: 'the downed goblin' });
	} finally {
		await o.eval(async (app, plugin, C) => {
			for (const f of ['Token Map.md', C]) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
			if (plugin.settings.activeCampaign) await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('5e slash commands: /monster, /spell, /encounter rated by 2024 XP, /statblock, /add into the 5e tracker, /roll with advantage, AC in /party-table', async (o) => {
	const C = 'Campaigns/Slash Coast';
	const note = `${C}/Prep.md`;
	const T = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			await plugin.campaigns.createCampaign({ name: 'Slash Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Prep.md`, '# Prep\n\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, note)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(note, 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
		const type = async (t) => { await o.page.keyboard.type(t, { delay: 15 }); await o.page.waitForTimeout(250); };
		const menu = o.page.locator('.suggestion-container .nimble-slash-item');
		const titles = () => menu.locator('.nimble-slash-title').allInnerTexts();

		// The bare menu offers 5e's commands, not Nimble's builders.
		await type('/');
		await o.waitFor(async () => (await menu.count()) > 10, { what: 'the slash menu' });
		const all = await titles();
		for (const c of ['/monster', '/spell', '/species', '/encounter', '/condition', '/new-monster', '/new-item']) assert.ok(all.includes(c), `${c} in ${all.join(' ')}`);
		for (const c of ['/legendary', '/minion', '/companion']) assert.ok(!all.includes(c), `${c} is Nimble's`);
		await o.page.keyboard.press('Backspace');

		// /encounter: four level-3 heroes, 4 Goblin Warriors + an Ogre = 650 XP, Low.
		await type('/enc 4 goblin warrior, ogre');
		await o.waitFor(async () => /Ogre/.test(await menu.first().textContent()), { what: 'encounter suggestion' });
		assert.match(await menu.first().locator('.nimble-slash-badge').innerText(), /Low 41%/i);
		assert.match(await menu.first().locator('.nimble-slash-detail').innerText(), /650 XP/);
		await o.page.keyboard.press('Enter');
		await type('Boss: /monster ogre');
		await o.waitFor(async () => (await titles())[0] === 'Ogre', { what: 'Ogre first' });
		assert.match(await menu.first().locator('.nimble-slash-detail').innerText(), /CR 2/);
		await o.page.keyboard.press('Enter');
		await type('/spell school:evocation level:3 class:wiz');
		await o.waitFor(async () => (await titles()).includes('Fireball'), { what: 'Fireball by its facets' });
		assert.ok(!(await titles()).includes('Magic Missile'));
		for (let i = 0; i < 'school:evocation level:3 class:wiz'.length + 7; i++) await o.page.keyboard.press('Backspace');
		await type('/spell firebal');
		await o.waitFor(async () => (await titles())[0] === 'Fireball', { what: 'Fireball' });
		await o.page.keyboard.press('Enter');
		await o.page.keyboard.press('Enter');
		await type('/roll +5');
		await o.waitFor(async () => (await titles()).some(t => /advantage/.test(t)), { what: 'advantage row' });
		await o.page.keyboard.press('ArrowDown');
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(300);
		await o.page.keyboard.press('Enter');
		await type('/statblock goblin war');
		await o.waitFor(async () => (await titles())[0] === 'Goblin Warrior', { what: 'Goblin Warrior stat block' });
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(300);

		const text = await o.eval((app) => app.workspace.activeEditor.editor.getValue());
		assert.match(text, /```nimble-encounter\nname: New encounter\nmonsters:\n- 4 Goblin Warrior\n- 1 Ogre\n```\nBoss: `5e:Ogre` `5e:spell:Fireball` /);
		assert.match(text, /🎲 1d20\+5 \(advantage\) → \*\*\d+\*\*/);
		assert.match(text, /```5e\nname: Goblin Warrior\n[\s\S]*\n```/);
		assert.match(await o.eval((app, plugin) => plugin.settings.rollLog[0]?.detail ?? ''), /\[\d+, \d+\]|drop/i);

		// /add: straight into the 5e tracker.
		await type('/add 2 ogre');
		await o.waitFor(async () => /Add 2 × Ogre/.test(await menu.first().textContent()), { what: 'add suggestion' });
		await o.page.keyboard.press('Enter');
		await o.page.locator(T).waitFor({ timeout: 5000 });
		await o.waitFor(async () => (await o.page.locator(`${T} .dnd5e-combatant`).count()) === 2, { what: 'two ogres' });
		assert.doesNotMatch(await o.eval((app, plugin, p) => app.vault.cachedRead(app.vault.getAbstractFileByPath(p)), note), /\/add/);

		// /party-table says AC in a 5e campaign.
		await o.eval(async (app, plugin) => { plugin.settings.party = [{ id: 'h1', name: 'Ilse', level: 3, maxHp: 24, defense: 16 }]; });
		await o.openFile(note, 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lineCount() - 1, ch: ed.getLine(ed.lineCount() - 1).length }); ed.focus(); });
		await o.page.keyboard.press('Enter');
		await type('/party-table');
		await o.waitFor(async () => (await titles())[0] === '/party-table', { what: '/party-table' });
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(300);
		assert.match(await o.eval((app) => app.workspace.activeEditor.editor.getValue()), /\| Hero \| Class \| Level \| HP \| AC \|\n[^\n]*\n\| Ilse \|  \| 3 \| 24 \| 16 \|/);
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			plugin.settings.party = [];
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('fights follow the campaign: each campaign keeps its own, and the tracker switches to the campaign\'s game', async (o) => {
	const A = 'Campaigns/Follow Coast', B = 'Campaigns/Follow Vale';
	const TR5 = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	const TRN = '.workspace-leaf-content[data-type="nimble-encounter-tracker"]';
	try {
		await o.eval(async (app, plugin, [A, B]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const c of [A, B]) { const old = app.vault.getAbstractFileByPath(c); if (old) await app.vault.delete(old, true); }
			await plugin.campaigns.createCampaign({ name: 'Follow Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await plugin.campaigns.createCampaign({ name: 'Follow Vale', level: 2, heroes: 4, starter: false });
			await app.vault.create(`${A}/Fight.md`, '```nimble-encounter\nname: Bridge toll\nmonsters:\n- 2 `5e:Goblin Warrior`\n```\n');
			await app.vault.create(`${B}/Note.md`, 'A Nimble note.\n');
		}, [A, B]);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, `${A}/Fight.md`)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(`${A}/Fight.md`, 'preview');
		await o.page.locator(`${R} .dnd5e-encounter button`, { hasText: 'Run' }).click();
		await o.waitFor(async () => (await o.page.locator(`${TR5} .dnd5e-combatant`).count()) === 2, { what: 'two goblins in the 5e tracker' });

		// A Nimble campaign: the same panel becomes Nimble's tracker, with no goblins in it.
		await o.openFile(`${B}/Note.md`, 'preview');
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.campaigns.active?.folder)) === B, { what: 'Nimble campaign active' });
		await o.waitFor(async () => (await o.page.locator(TRN).count()) === 1 && (await o.page.locator(TR5).count()) === 0, { what: 'the tracker switched to Nimble\'s' });
		assert.equal(await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.length), 0, 'the Nimble campaign has no 5e fight');

		// Back to the 5e campaign: its fight comes back.
		await o.openFile(`${A}/Fight.md`, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${TR5} .dnd5e-combatant`).count()) === 2, { what: 'the goblins came back with their campaign' });
		assert.equal(await o.page.locator(TRN).count(), 0);
	} finally {
		await o.eval(async (app, plugin, [A, B]) => {
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			await plugin.campaigns.setActive(null);
			for (const c of [A, B]) { const f = app.vault.getAbstractFileByPath(c); if (f) await app.vault.delete(f, true); }
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
		}, [A, B]);
	}
});

test('5e: Add to fight from Spotlight and the quick look; "2 goblin warrior" adds two', async (o) => {
	const C = 'Campaigns/Add Coast';
	const SP = '.modal-container .prompt.nimble-spotlight';
	const count = () => o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.map(c => c.label));
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Add Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Notes.md`, 'Notes.\n');
		}, C);
		await o.openFile(`${C}/Notes.md`, 'preview');
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.system().id)) === 'dnd5e', { what: '5e campaign active' });
		await o.eval((app, plugin) => { plugin.runtime('dnd5e').fights.put(undefined); });

		// Spotlight → the Wyvern's quick look → Add to fight.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:spotlight'); });
		await o.page.locator(`${SP} .prompt-input`).fill('wyvern');
		await o.waitFor(async () => /Wyvern/.test(await o.page.locator(`${SP} .suggestion-item`).first().innerText().catch(() => '')), { what: 'Wyvern in Spotlight' });
		await o.page.keyboard.press('Enter');
		const add = o.page.locator('.modal.dnd5e-quick-look button', { hasText: 'Add to fight' });
		await add.waitFor({ timeout: 3000 });
		await add.click();
		await o.waitFor(async () => (await count()).join() === 'Wyvern', { what: 'the Wyvern in the fight' });
		await o.page.keyboard.press('Escape');
		await o.page.waitForTimeout(200);
		await o.eval(() => document.querySelectorAll('.modal-container').forEach(n => n.remove()));

		// "2 goblin warrior": Enter adds two.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:spotlight'); });
		await o.page.locator(`${SP} .prompt-input`).fill('2 goblin warrior');
		await o.waitFor(async () => /Add 2 × Goblin Warrior/.test(await o.page.locator(`${SP} .suggestion-item`).first().innerText().catch(() => '')), { what: 'the add row' });
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await count()).length === 3, { what: 'two goblins added' });
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			plugin.runtime('dnd5e').fights.put(undefined);
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('NPC card without the block: a hand-written NPC note still shows its card, portrait slot and game stats; the tags leave them to the card', async (o) => {
	const C = 'Campaigns/Bare Coast';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Bare Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.createFolder(`${C}/NPCs`).catch(() => {});
			await app.vault.create(`${C}/NPCs/Sildar.md`, '---\nnimble: npc\nrole: Knight of the Order\nac: 16\nhp: 27\naliases: [Sir Sildar]\n---\nA veteran knight.\n');
			await app.vault.create(`${C}/NPCs/Has Block.md`, '---\nnimble: npc\nrole: Clerk\n---\n\n```nimble-npc\nlook: Ink on her cuffs.\n```\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, `${C}/NPCs/Sildar.md`)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(`${C}/NPCs/Sildar.md`, 'preview');
		const card = o.page.locator(`${R} .nimble-npc-card`);
		await o.waitFor(async () => (await card.count()) === 1, { what: 'one card on a note with no block' });
		assert.match(await card.locator('.nimble-npc-name').innerText(), /sildar/i);
		assert.match(await card.locator('.nimble-npc-role').innerText(), /Knight of the Order/i);
		assert.equal(await card.locator('.nimble-npc-portrait.is-empty').count(), 1, 'the portrait slot offers to add one');
		// 5e draws its stats as the mini sheet under the card: AC on its shield, HP on the meter.
		await o.waitFor(async () => (await card.locator('.dnd5e-npc-stats .dnd5e-npc-ac b').innerText().catch(() => '')) === '16', { what: 'AC 16 on the mini sheet' });
		assert.equal(await card.locator('.dnd5e-npc-stats .dnd5e-npc-hp-bar-max').innerText(), '27');
		assert.match(await card.locator('.dnd5e-npc-src').innerText(), /Typed in this note/);
		assert.ok(await card.evaluate(n => !!n.closest('.ev-sys-dnd5e')), 'the card takes 5e\'s look');
		// The row of tags keeps what the card doesn't show (aliases) and leaves the rest to the card.
		await o.waitFor(async () => (await o.page.locator(`${R} .metadata-property[data-property-key="role"]`).evaluate(n => getComputedStyle(n).display).catch(() => 'none')) === 'none', { what: 'role left to the card' });
		assert.notEqual(await o.page.locator(`${R} .metadata-property[data-property-key="aliases"]`).evaluate(n => getComputedStyle(n).display), 'none');
		// A note with its own block gets just the one card.
		await o.openFile(`${C}/NPCs/Has Block.md`, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .nimble-npc-card`).count()) >= 1, { what: 'the block card' });
		await o.page.waitForTimeout(400);
		assert.equal(await o.page.locator(`${R} .nimble-npc-card`).count(), 1);
		assert.match(await o.page.locator(`${R} .nimble-npc-card`).innerText(), /Ink on her cuffs/);
	} finally {
		await o.eval(async (app, plugin, C) => {
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('note kinds: a 5e NPC gets AC, HP, CR and a stat block, shows them on its card and joins the 5e fight; a system can draw a location card', async (o) => {
	const C = 'Campaigns/Kinds Coast';
	const T = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	try {
		const npc = await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			await plugin.campaigns.createCampaign({ name: 'Kinds Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			let camp;
			for (let i = 0; i < 50 && !(camp = plugin.campaigns.campaigns.find(c => c.folder === C && c.system)); i++) await new Promise(r => setTimeout(r, 100));
			const f = await plugin.campaigns.createInSection(camp, 'npc', 'Marta Hale');
			return { path: f.path, text: await app.vault.read(f) };
		}, C);
		assert.match(npc.text, /attitude: neutral\nac: ""\nhp: ""\ncr: ""\nstatblock: ""\n---/);
		await o.eval(async (app, plugin, p) => {
			await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(p), (fm) => { fm.ac = 15; fm.hp = '30 (4d8 + 12)'; fm.statblock = 'Bandit Captain'; });
		}, npc.path);
		await o.openFile(npc.path, 'preview');
		const card = o.page.locator(`${R} .nimble-npc-card`);
		// A mini character sheet under the card: AC in its shield, HP as the meter, the Bandit Captain's abilities and actions.
		const stats = card.locator('.dnd5e-npc-stats');
		await o.waitFor(async () => (await stats.locator('.dnd5e-npc-ac b').innerText().catch(() => '')) === '15', { what: 'AC 15 on the card' });
		assert.equal(await card.locator('.nimble-note-stat').count(), 0, 'no stat chips beside the mini sheet');
		assert.match(await stats.locator('.dnd5e-npc-src').innerText(), /From[\s\S]*Bandit Captain[\s\S]*HP is their own/i);
		assert.equal(await stats.locator('.dnd5e-npc-hp-bar-cur').innerText(), '30');
		assert.match(await stats.locator('.dnd5e-npc-hpd').innerText(), /4d8 \+ 12/);
		assert.equal(await stats.locator('.dnd5e-npc-ab').count(), 6);
		assert.ok(await stats.locator('.dnd5e-npc-act .dnd5e-dmg').count() >= 1, 'actions with damage buttons');
		await card.screenshot({ path: join(ARTIFACTS, 'note-kinds-5e-npc.png') });
		// Taking a hit in the note: the meter writes what's left, and the fight starts from it.
		await stats.locator('.ns-meter-step[aria-label="Take 1 damage"]').click();
		await o.waitFor(async () => (await o.eval((app, _p, p) => app.metadataCache.getCache(p)?.frontmatter?.hp_now, npc.path)) === 29, { what: 'hp_now 29' });
		await o.waitFor(async () => (await card.locator('.dnd5e-npc-hp-bar-cur').innerText().catch(() => '')) === '29', { what: 'the meter redrawn' });

		// Add to fight: the NPC under her own name, AC and HP, with the Bandit Captain's actions.
		await card.locator('button.dnd5e-npc-fight').click();
		await o.page.locator(T).waitFor({ timeout: 5000 });
		const row = o.page.locator(`${T} .dnd5e-combatant`);
		await o.waitFor(async () => (await row.count()) === 1, { what: 'Marta in the tracker' });
		assert.match(await row.locator('.dnd5e-combatant-name').innerText(), /^Marta Hale$/);
		// Before the fight her row is about Initiative; her HP (29, after the hit in her note) and AC are in the fight, and on her card once it starts.
		const marta = await o.eval((app, plugin) => { const c = plugin.settings.systemData.dnd5e.fight.combatants[0]; return [c.hp, c.maxHp, c.ac]; });
		assert.deepEqual(marta, [29, 30, 15]);
		assert.ok((await o.eval((app, plugin) => plugin.settings.systemData.dnd5e.fight.combatants[0].monster.actions.length)) > 0);

		// A story NPC (no stats yet): one quiet line; Type them in writes a starting set into the note.
		const story = await o.eval(async (app, plugin, C) => {
			const camp = plugin.campaigns.campaigns.find(c => c.folder === C);
			return (await plugin.campaigns.createInSection(camp, 'npc', 'Mother Sel')).path;
		}, C);
		await o.openFile(story, 'preview');
		const quiet = o.page.locator(`${R} .nimble-npc-card .dnd5e-npc-stats.is-empty`);
		await quiet.waitFor({ timeout: 5000 });
		assert.match(await quiet.innerText(), /A story NPC: no stats[\s\S]*From a stat block[\s\S]*Type them in/);
		await quiet.locator('button', { hasText: 'Type them in' }).click();
		await o.waitFor(async () => /Typed in this note/.test(await o.page.locator(`${R} .nimble-npc-card .dnd5e-npc-src`).innerText().catch(() => '')), { what: 'typed-in stats' });
		assert.deepEqual(await o.eval((app, _p, p) => { const f = app.metadataCache.getCache(p).frontmatter; return [f.ac, f.hp, f.str]; }, story), [10, '4 (1d8)', 10]);

		// A system that draws locations its own way: new locations get a ```nimble-note block for it.
		const loc = await o.eval(async (app, plugin, C) => {
			const sys = plugin.systems.resolve('5e');
			window.__e2eLocation = sys.noteKinds.location; sys.noteKinds.location = { fields: [{ key: 'danger', label: 'Danger' }], card: (el, ctx) => { el.createDiv({ cls: 'e2e-location-card', text: `Spooky ${ctx.fm.title ?? ''}`.trim() }); } };
			const camp = plugin.campaigns.campaigns.find(c => c.folder === C);
			const f = await plugin.campaigns.createInSection(camp, 'location', 'Old Mill');
			await app.fileManager.processFrontMatter(f, (fm) => { fm.danger = 'high'; });
			return { path: f.path, text: await app.vault.read(f) };
		}, C);
		assert.match(loc.text, /danger: /);
		assert.match(loc.text, /\n---\n\n```nimble-note\n```\n/);
		await o.openFile(loc.path, 'preview');
		const lc = o.page.locator(`${R} .nimble-note-card`);
		await o.waitFor(async () => (await lc.locator('.e2e-location-card').count()) === 1, { what: 'the system\'s location card' });
		assert.match(await lc.locator('.nimble-note-stat').innerText(), /Danger\s*high/i);
	} finally {
		await o.eval(async (app, plugin, C) => {
			plugin.systems.resolve('5e').noteKinds.location = window.__e2eLocation;
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('NPC card in Nimble: level, the armor letter, HP in a heart, its monster block and Add to fight; players see their notes, never stats or secrets', async (o) => {
	const C = 'Campaigns/Copper Card';
	const P = 'Campaigns/Copper Notes';
	await resetEncounter(o);
	try {
		const npc = await o.eval(async (app, plugin, [C, P]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const d of [C, P]) { const old = app.vault.getAbstractFileByPath(d); if (old) await app.vault.delete(old, true); }
			await plugin.campaigns.createCampaign({ name: 'Copper Card', level: 3, heroes: 4, starter: false });
			let camp;
			for (let i = 0; i < 50 && !(camp = plugin.campaigns.campaigns.find(c => c.folder === C)); i++) await new Promise(r => setTimeout(r, 100));
			const f = await plugin.campaigns.createInSection(camp, 'npc', 'Ysolde Krenn');
			const text = await app.vault.read(f);
			await app.vault.modify(f, text.replace('```nimble-npc\n', '```nimble-npc\ntactics: Holds the door.\n').replace('secret: ', 'secret: She skims the ingots.'));
			await app.fileManager.processFrontMatter(f, (fm) => { fm.role = 'Captain of the vault guard'; fm.faction = 'The Assayers'; fm.attitude = 'hostile'; fm.level = 3; fm.armor = 'M'; fm.hp = 33; fm.statblock = 'Goblin Boss'; });
			// A player's own note on her: their notes, and a secret they shouldn't see even if one was pasted in.
			await plugin.campaigns.createCampaign({ name: 'Copper Notes', level: 3, heroes: 4, starter: false, role: 'player', character: 'Pip' });
			await app.vault.createFolder(`${P}/NPCs`).catch(() => {});
			await app.vault.create(`${P}/NPCs/Ysolde.md`, '---\nnimble: npc\nrole: Captain\nlevel: 3\nhp: 33\nstatblock: Goblin Boss\n---\n```nimble-npc\nsaid: Nobody leaves with copper.\nsecret: She skims the ingots.\n```\n');
			return { path: f.path, text };
		}, [C, P]);
		// A new Nimble NPC gets the book's numbers as properties.
		assert.match(npc.text, /attitude: neutral\nlevel: ""\narmor: ""\nhp: ""\nstatblock: ""\n---/);
		await o.openFile(npc.path, 'preview');
		const card = o.page.locator(`${R} .nimble-npc-card`);
		await o.waitFor(async () => (await card.locator('.nimble-npc-stats .nimble-npc-stat').count()) === 3, { what: 'Nimble stats on the card' });
		assert.ok(await card.evaluate(n => !!n.closest('.ev-sys-nimble')), 'the card wears Nimble\'s look');
		assert.deepEqual((await card.locator('.nimble-npc-stat').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()), ['Level 3', 'M Armor', '33']);
		assert.equal(await card.locator('.nimble-npc-stat.is-armor .nb-armor').getAttribute('aria-label'), 'Medium armor');
		assert.equal(await card.locator('.nimble-npc-stat.is-hp .nb-heart').count(), 1);
		assert.equal(await card.locator('.nimble-npc-stats .nimble-inline-ref[data-nimble-ref="Goblin Boss"]').count(), 1, 'a reference to her block');
		// Each fact keeps its label beside its value.
		assert.match(await card.locator('.nimble-npc-link').first().innerText(), /Faction\s*The Assayers/);
		assert.deepEqual(await card.locator('.nimble-npc-pill').allInnerTexts(), ['Alive', 'Hostile']);
		await card.screenshot({ path: join(ARTIFACTS, 'npc-card-nimble.png') });
		// Add to fight: under her own name, with her HP and the block's actions.
		await card.locator('button.nimble-npc-fight').click();
		await o.waitFor(async () => (await creatures(o)).length === 1, { what: 'Ysolde in the encounter' });
		const [c] = await creatures(o);
		assert.match(c.label, /^Ysolde Krenn/);
		assert.equal(c.max, 33);
		assert.equal(c.armor, 'medium');
		// The player's card: their notes under "What we know", no numbers, no secret (not even blurred).
		await o.openFile(`${P}/NPCs/Ysolde.md`, 'preview');
		const mine = o.page.locator(`${R} .nimble-npc-card`);
		await o.waitFor(async () => (await mine.count()) === 1, { what: 'the player\'s card' });
		assert.ok(await mine.evaluate(n => n.classList.contains('is-player')));
		assert.match(await mine.locator('.nimble-npc-fields-head').innerText(), /What we know/);
		assert.equal(await mine.locator('.nimble-npc-stats, .nimble-npc-stat, .nimble-npc-fight').count(), 0);
		assert.equal(await mine.locator('.nimble-npc-field.is-secret').count(), 0);
		assert.doesNotMatch(await mine.innerText(), /skims/);
	} finally {
		await o.eval(async (app, plugin, dirs) => {
			for (const d of dirs) { const f = app.vault.getAbstractFileByPath(d); if (f) await app.vault.delete(f, true); }
			await plugin.campaigns.setActive(null);
		}, [C, P]);
		await resetEncounter(o);
	}
});

test('campaign cards: quests, places and sessions open on a card in the game\'s look; the panel wears it too; nothing shows twice', async (o) => {
	const C = 'Campaigns/Card Vaults';
	const F = 'Campaigns/Card Coast';
	await resetEncounter(o);
	try {
		const made = await o.eval(async (app, plugin, [C, F]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const d of [C, F]) { const old = app.vault.getAbstractFileByPath(d); if (old) await app.vault.delete(old, true); }
			await plugin.campaigns.createCampaign({ name: 'Card Vaults', level: 3, heroes: 4, starter: false });
			let camp;
			for (let i = 0; i < 50 && !(camp = plugin.campaigns.campaigns.find(c => c.folder === C)); i++) await new Promise(r => setTimeout(r, 100));
			await plugin.campaigns.setActive(C);
			plugin.settings.party = [{ id: 'a', name: 'Brakka', level: 3, maxHp: 28 }, { id: 'b', name: 'Wren', level: 3, maxHp: 20 }];
			const quest = await plugin.campaigns.createInSection(camp, 'quest', 'The missing assayer');
			const place = await plugin.campaigns.createInSection(camp, 'location', 'The Lower Gate');
			const session = await plugin.campaigns.createInSection(camp, 'session', 'Session 7');
			const texts = { quest: await app.vault.read(quest), place: await app.vault.read(place), session: await app.vault.read(session) };
			await app.vault.createFolder(`${C}/NPCs`).catch(() => {});
			await app.vault.create(`${C}/NPCs/Ollo.md`, '---\nnimble: npc\nrole: Gatekeeper\nlocation: "[[The Lower Gate]]"\n---\n');
			await app.vault.modify(quest, texts.quest.replace('## Objectives\n- [ ] ', '## Objectives\n- [x] Get past the gate\n- [ ] Find Dunn').replace("*What's really going on, that the heroes don't know yet.*", "*What's really going on, that the heroes don't know yet.*\nDunn is hiding from Krenn."));
			await app.fileManager.processFrontMatter(quest, (fm) => { fm.status = 'active'; fm.giver = '[[Ollo]]'; fm.location = '[[The Lower Gate]]'; fm.reward = '60 gp'; });
			await app.fileManager.processFrontMatter(place, (fm) => { fm.region = 'Below the gate'; fm.monsters = ['Goblin Boss']; fm.secret = 'The golem obeys the whistle.'; });
			const st = await app.vault.read(session);
			await app.vault.modify(session, st.replace('*What happened, for next time.*', '- Talked Ollo into opening the gate.'));
			await app.fileManager.processFrontMatter(session, (fm) => { fm.quests = ['[[The missing assayer]] advanced']; fm.loot = ['40 gp']; fm.next = 'Down to the pits.'; });
			// A 5e place opens on its read-aloud.
			await plugin.campaigns.createCampaign({ name: 'Card Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			let coast;
			for (let i = 0; i < 50 && !(coast = plugin.campaigns.campaigns.find(c => c.folder === F && c.system)); i++) await new Promise(r => setTimeout(r, 100));
			const light = await plugin.campaigns.createInSection(coast, 'location', 'Gullhaven Lighthouse');
			const lightText = await app.vault.read(light);
			await app.fileManager.processFrontMatter(light, (fm) => { fm.read_aloud = 'Salt has eaten the door to a lace of rust.'; });
			return { quest: quest.path, place: place.path, session: session.path, light: light.path, texts, lightText };
		}, [C, F]);
		// New quests, places and sessions start with the card's block; a session knows who's at the table.
		for (const t of [made.texts.quest, made.texts.place, made.texts.session]) assert.match(t, /\n---\n\n```nimble-note\n```\n/);
		assert.match(made.texts.session, /party: \n {2}- "Brakka"\n {2}- "Wren"\nquests: \[\]\nloot: \[\]\nnext: ""/);
		assert.match(made.texts.place, /monsters: ""/, 'Nimble places get a list of monsters to use');
		assert.match(made.lightText, /read_aloud: ""/, '5e places get a read-aloud');

		// The quest: kicker, title, stamp; who, where, reward; objectives to tick; the GM's secret. Its own
		// Objectives and The truth sections, now on the card, leave the page; so does the inline title.
		await o.openFile(made.quest, 'preview');
		const q = o.page.locator(`${R} .ev-cq.kind-quest`);
		await o.waitFor(async () => (await q.count()) === 1, { what: 'the quest card' });
		assert.ok(await q.evaluate(n => !!n.closest('.ev-sys-nimble')));
		assert.equal(await q.locator('.ev-cq-title').innerText(), 'The missing assayer');
		assert.match(await q.locator('.ev-cq-kicker').innerText(), /side quest/i);
		assert.match(await q.locator('.ev-cq-stamp.is-active').innerText(), /active/i);
		assert.match(await q.locator('.ev-cq-facts').innerText(), /Given by[\s\S]*Ollo[\s\S]*Where[\s\S]*The Lower Gate[\s\S]*Reward[\s\S]*60 gp/i);
		assert.deepEqual(await q.locator('.ev-cq-objs li').allInnerTexts(), ['Get past the gate', 'Find Dunn']);
		assert.match(await q.locator('.ev-cq-sec').first().innerText(), /1 of 2/);
		assert.match(await q.locator('.ev-cq-secret').innerText(), /Dunn is hiding from Krenn/);
		await o.waitFor(async () => (await o.page.locator(`${R} .markdown-preview-sizer > .ev-on-card`).count()) >= 2, { what: 'the sections the card shows to be marked' });
		const shown = await o.page.evaluate((R) => [...document.querySelectorAll(`.workspace-leaf.mod-active ${R} .markdown-preview-sizer > div`)].filter(d => getComputedStyle(d).display !== 'none' && !d.querySelector('.ev-cq')).map(d => d.innerText).join('\n'), R);
		assert.doesNotMatch(shown, /Find Dunn|Dunn is hiding/, 'the objectives and the truth show once, on the card');
		assert.match(shown, /Stakes/, 'the rest of the note is still there');
		assert.equal(await o.page.locator(`.workspace-leaf.mod-active ${R} .inline-title`).evaluate(n => getComputedStyle(n).display), 'none');
		await q.screenshot({ path: join(ARTIFACTS, 'campaign-card-quest.png') });
		// The pills, chips and facts on the cards and in the panel sit on their centre lines.
		const bad = [];
		await measurePills(o, bad, 'Quest card', `.workspace-leaf.mod-active ${R} .ev-cq`);
		// Ticking an objective on the card ticks it in the note.
		await q.locator('.ev-cq-objs li', { hasText: 'Find Dunn' }).locator('.ev-cq-box').click();
		await o.waitFor(async () => /- \[x\] Find Dunn/.test(await read(o, made.quest)), { what: 'the objective ticked in the note' });

		// The place: who's here (NPCs whose location is it), the monsters to use, the secret.
		await o.openFile(made.place, 'preview');
		const p = o.page.locator(`${R} .ev-cq.kind-location`);
		await o.waitFor(async () => (await p.locator('.ev-cq-who').count()) === 1, { what: 'who\'s here' });
		assert.match(await p.locator('.ev-cq-whos').innerText(), /Ollo/);
		assert.equal(await p.locator('.ev-cq-mons .nimble-inline-ref[data-nimble-ref="Goblin Boss"]').count(), 1);
		assert.match(await p.locator('.ev-cq-facts').innerText(), /Region\s*Below the gate/i);
		assert.match(await p.locator('.ev-cq-secret').innerText(), /golem/);
		await p.screenshot({ path: join(ARTIFACTS, 'campaign-card-location.png') });

		// The session repeats nothing: the date over "Session 7", who was there, what happened (the Recap leaves
		// the page), the quests it moved, the loot, next time.
		await o.openFile(made.session, 'preview');
		const s = o.page.locator(`${R} .ev-cq.kind-session`);
		await o.waitFor(async () => (await s.count()) === 1, { what: 'the session card' });
		assert.equal(await s.locator('.ev-cq-title').innerText(), 'Session 7');
		assert.doesNotMatch(await s.locator('.ev-cq-kicker').innerText(), /session 7/i);
		assert.deepEqual((await s.locator('.ev-cq-who').allInnerTexts()).map(t => t.replace(/^\S+\s+/, '').trim()), ['Brakka', 'Wren']);
		assert.match(await s.locator('.ev-cq-recap').innerText(), /Talked Ollo/);
		assert.match(await s.locator('.ev-cq-thread').innerText(), /The missing assayer\s*Advanced/i);
		assert.match(await s.locator('.ev-cq-loot').innerText(), /40 gp/);
		assert.match(await s.locator('.ev-cq-next').innerText(), /Down to the pits/);
		await s.screenshot({ path: join(ARTIFACTS, 'campaign-card-session.png') });
		await measurePills(o, bad, 'Session card', `.workspace-leaf.mod-active ${R} .ev-cq`);

		// The Campaign panel wears the campaign's game; open quests sit in their own list with a status dot.
		await o.eval(async (app, plugin, C) => { await plugin.campaigns.setActive(C); await plugin.openCampaignView(); }, C);
		const panel = o.page.locator('.nimble-campaign-view');
		await o.waitFor(async () => (await panel.locator('.campaign-quest').count()) === 1, { what: 'the open quest in the panel' });
		assert.ok(await panel.evaluate(n => n.classList.contains('ev-sys-nimble')));
		assert.match(await panel.locator('.campaign-heading-quests').innerText(), /Quests\s*1 open/i);
		assert.equal(await panel.locator('.campaign-quest .campaign-quest-dot.is-active').count(), 1);
		await panel.screenshot({ path: join(ARTIFACTS, 'campaign-panel-nimble.png') });
		await measurePills(o, bad, 'Campaign panel', '.nimble-campaign-view');

		// 5e: the place opens on its read-aloud, and the panel turns 5e's.
		await o.openFile(made.light, 'preview');
		const l = o.page.locator(`${R} .ev-cq.kind-location`);
		await o.waitFor(async () => (await l.locator('.ev-cq-read').count()) === 1, { what: 'the read-aloud' });
		assert.ok(await l.evaluate(n => !!n.closest('.ev-sys-dnd5e')));
		assert.match(await l.locator('.ev-cq-read').innerText(), /Read aloud[\s\S]*lace of rust/i);
		await o.eval(async (app, plugin, F) => { await plugin.campaigns.setActive(F); }, F);
		await o.waitFor(async () => panel.evaluate(n => n.classList.contains('ev-sys-dnd5e')), { what: 'the panel in 5e\'s look' });
		await o.page.waitForTimeout(300);
		await measurePills(o, bad, 'Campaign panel (5e)', '.nimble-campaign-view');
		assert.deepEqual(bad, [], 'misaligned pills');
	} finally {
		await o.eval(async (app, plugin, dirs) => {
			for (const d of dirs) { const f = app.vault.getAbstractFileByPath(d); if (f) await app.vault.delete(f, true); }
			plugin.settings.party = [];
			await plugin.campaigns.setActive(null);
		}, [C, F]);
		await resetEncounter(o);
	}
});

test('5e builders: /new-monster writes a ```5e block with 2024 numbers, Edit reopens it, /new-spell makes a homebrew spell that 5e:spell: and /spell find, New item… is 5e\'s', async (o) => {
	const C = 'Campaigns/Forge Coast';
	const note = `${C}/Forge.md`;
	const B = '.modal.nimble-entity-builder';
	// Create from any step; on the last one it's the Next button.
	const create = async () => {
		const c = o.page.locator(`${B} .eb-create`);
		if (await c.isVisible()) await c.click(); else await o.page.locator(`${B} .eb-next`).click();
	};
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Forge Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Forge.md`, '# Forge\n\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.system(p).id, note)) === 'dnd5e', { what: '5e campaign' });
		await o.openFile(note, 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });

		// /new-monster: 5e's builder, with 5e's kinds.
		await o.page.keyboard.type('/new-monster', { delay: 20 });
		await o.page.keyboard.press('Enter');
		await o.page.locator(B).waitFor();
		assert.deepEqual(await o.page.locator(`${B} .eb-kind`).allInnerTexts(), ['Monster', 'Spell', 'Magic item']);
		await o.page.locator(`${B} .eb-panel.is-active input[data-field="Name"]`).fill('Ember Hound');
		await o.page.locator(`${B} .eb-panel.is-active select[data-field="Challenge"]`).selectOption('5');
		assert.match(await o.page.locator(`${B} .eb-panel.is-active [data-key="cr"] .eb-aside`).innerText(), /PB \+3 · 1,800 XP/);
		await o.page.locator(`${B} .eb-next`).click();
		await o.page.locator(`${B} .eb-panel.is-active input[data-field="CON"]`).fill('16');
		await o.waitFor(async () => /4d8 \+ 12/.test(await o.page.locator(`${B} .eb-panel.is-active [data-key="hp"] .eb-aside`).innerText()), { what: 'HP formula hint' });
		assert.match(await o.page.locator(`${B} .eb-preview`).innerText(), /Ember Hound[\s\S]*30 \(4d8 \+ 12\)/);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-builder-monster.png') });
		await create();
		await o.page.locator(B).waitFor({ state: 'detached' });
		const text = await o.eval((app) => app.workspace.activeEditor.editor.getValue());
		assert.match(text, /```5e\nname: Ember Hound\nedition: 2024\nsize: Medium\ntype: humanoid\n[\s\S]*hp: 30 \(4d8 \+ 12\)[\s\S]*cr: 5\n[\s\S]*- Strike: Melee Attack Roll: \+3, reach 5 ft\. Hit: 3 \(1d6\) Slashing damage\.\n```/);

		// Edit on the block: the builder opens on it; Save writes it back.
		await o.openFile(note, 'preview');
		const block = o.page.locator(`${R} .block-language-5e`).first();
		await block.waitFor();
		await block.hover();
		await block.locator('.nimble-block-edit').click();
		await o.page.locator(B).waitFor();
		assert.equal(await o.page.locator(`${B} .eb-panel.is-active input[data-field="Name"]`).inputValue(), 'Ember Hound');
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Stats' }).click();
		await o.page.locator(`${B} .eb-panel.is-active input[data-field="AC"]`).fill('15');
		await create();
		await o.page.locator(B).waitFor({ state: 'detached' });
		await o.waitFor(async () => /\nac: 15\n/.test(await o.eval((app, _p, p) => app.vault.adapter.read(p), note)), { what: 'AC written back' });

		// /new-spell: a homebrew spell block; references and /spell find it before the SRD.
		await o.openFile(note, 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; const n = ed.lineCount(); ed.setCursor({ line: n - 1, ch: ed.getLine(n - 1).length }); ed.replaceSelection('\n'); ed.focus(); });
		await o.page.keyboard.type('/new-spell', { delay: 20 });
		await o.page.keyboard.press('Enter');
		await o.page.locator(B).waitFor();
		assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Spell');
		await o.page.locator(`${B} .eb-panel.is-active input[data-field="Name"]`).fill('Ember Lash');
		await o.page.locator(`${B} .eb-panel.is-active .eb-pick[data-value="Wizard"]`).click();
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Effect' }).click();
		await o.page.locator(`${B} .eb-panel.is-active textarea[data-field="Text"]`).fill('A whip of fire deals 2d6 Fire damage.');
		await create();
		await o.page.locator(B).waitFor({ state: 'detached' });
		await o.waitFor(async () => /```5e-spell\nname: Ember Lash\nlevel: 1\nschool: Evocation\n[\s\S]*classes: Wizard\n\nA whip of fire deals 2d6 Fire damage\.\n```/.test(await o.eval((app) => app.workspace.activeEditor.editor.getValue())), { what: 'the spell block' });
		await o.eval(async (app, _p, C) => { await app.vault.create(`${C}/Lash.md`, 'She casts `5e:spell:Ember Lash`.\n'); }, C);
		await o.openFile(`${C}/Lash.md`, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.kind-spell`).count()) === 1, { what: 'the homebrew spell reference' });
		await o.page.locator(`${R} .dnd5e-ref.kind-spell .nimble-inline-name`).hover();
		await o.waitFor(async () => /A whip of fire/.test(await o.page.locator('.nimble-hover-preview .dnd5e-card').innerText().catch(() => '')), { what: 'homebrew card on hover' });
		await o.page.keyboard.press('Escape');

		// New item… in a 5e campaign is 5e's item builder.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-item'); });
		await o.page.locator(B).waitFor();
		assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Magic item');
		await o.page.keyboard.press('Escape');
		await o.page.locator(B).waitFor({ state: 'detached' });
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('content packs: a pack in the content folder adds a 5e spell, subclass and monster; a campaign can turn packs off; Import content reports what it left out', async (o) => {
	const C = 'Campaigns/Pack Coast';
	const F = 'Ember Vault/Content';
	const example = readFileSync(join(ROOT, 'docs/content/examples/5e-hearth-and-cinder.json'), 'utf8');
	try {
		await o.eval(async (app, plugin, [C, F, example]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const p of [C, F]) { const old = app.vault.getAbstractFileByPath(p); if (old) await app.vault.delete(old, true); }
			await plugin.campaigns.createCampaign({ name: 'Pack Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Refs.md`, 'She casts `5e:spell:Ember Lash`, a `5e:Cinder Hound` growls, and the barbarian walks the `5e:subclass:Path of the Hearthguard`.\n');
			await app.vault.createFolder(F);
			await app.vault.create(`${F}/hearth.json`, example);
		}, [C, F, example]);
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.all().map(p => `${p.name}:${p.entries.length}`).join())) === 'Hearth and Cinder:5', { what: 'the pack loaded' });
		await o.openFile(`${C}/Refs.md`, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.dnd5e-hit`).count()) === 2 && (await o.page.locator(`${R} .dnd5e-ref .nimble-inline-unknown`).count()) === 0, { what: 'the pack\'s spell, subclass and monster resolve' });
		await o.page.locator(`${R} .dnd5e-ref.kind-spell .nimble-inline-name`).hover();
		await o.waitFor(async () => /whip of fire[\s\S]*Hearth and Cinder/.test(await o.page.locator('.nimble-hover-preview .dnd5e-card').innerText().catch(() => '')), { what: 'the pack spell\'s card, naming its pack' });
		await o.page.keyboard.press('Escape');
		// The subclass is the Barbarian's.
		assert.match(await o.page.locator(`${R} .dnd5e-ref.kind-subclass`).innerText(), /Path of the Hearthguard/);

		// The campaign turns packs off: the references don't find them any more.
		await o.eval(async (app, plugin, C) => {
			const home = plugin.campaigns.campaigns.find(c => c.folder === C).home.path;
			await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(home), (fm) => { fm.packs = 'none'; });
		}, C);
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref .nimble-inline-unknown`).count()) >= 1 && (await o.page.locator(`${R} .dnd5e-ref.kind-spell`).count()) === 0, { what: 'packs off' });
		await o.eval(async (app, plugin, C) => {
			const home = plugin.campaigns.campaigns.find(c => c.folder === C).home.path;
			await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(home), (fm) => { fm.packs = ['Hearth and Cinder']; });
		}, C);
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.kind-spell`).count()) === 1, { what: 'the pack back on by name' });

		// Import content: paste a pack with a bad entry; the report says why; Add saves the rest.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-content'); });
		const M = '.modal.nimble-import-content';
		await o.page.locator(M).waitFor();
		const pasted = JSON.stringify({ pack: 'Table Rules', system: '5e', entries: [{ kind: 'feat', name: 'Lucky Charm', desc: 'Once a day, reroll a 1.' }, { kind: 'spell', name: 'Half Done', level: 2 }] });
		await o.page.locator(`${M} textarea`).fill(pasted);
		await o.waitFor(async () => /1 entry: 1 feat · 1 left out/.test(await o.page.locator(`${M} .nimble-import-report`).innerText()), { what: 'the import report' });
		assert.match(await o.page.locator(`${M} .nimble-pack-notes.is-rejected`).innerText(), /Entry 2 \(Half Done\): "school" is missing; "castingTime" is missing/);
		await o.page.screenshot({ path: join(ARTIFACTS, 'content-import.png') });
		await o.page.locator(`${M} button.mod-cta`).click();
		await o.page.locator(M).waitFor({ state: 'detached' });
		await o.waitFor(async () => (await o.eval((app, _p, F) => app.vault.getAbstractFileByPath(`${F}/Table Rules.json`) !== null, F)), { what: 'the pack saved' });
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.all().map(p => p.name).join())) === 'Hearth and Cinder,Table Rules', { what: 'both packs loaded' });
	} finally {
		await o.eval(async (app, plugin, [C, F]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			for (const p of [C, F]) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f, true); }
			await plugin.campaigns.setActive(null);
		}, [C, F]);
	}
});

test('5e imports: a D&D Beyond character becomes a sheet (the link box shows its data address); Fantasy Statblocks creatures become ```5e notes', async (o) => {
	const C = 'Campaigns/Import Coast';
	const M = '.modal.dnd5e-import';
	// A made-up character in D&D Beyond's shape (names and numbers only).
	const stat = (v) => v.map((value, i) => ({ id: i + 1, name: null, value }));
	const ddb = { success: true, data: {
		id: 1001, name: 'Pip Underbough',
		race: { fullName: 'Elf', baseRaceName: 'Elf', isLegacy: false, isSubRace: false, sources: [{ sourceId: 145 }] },
		background: { hasCustomBackground: false, definition: { name: 'Sage', sources: [{ sourceId: 145 }] } },
		classes: [{ level: 3, isStartingClass: true, hitDiceUsed: 0, definition: { name: 'Wizard', sources: [{ sourceId: 145 }] }, subclassDefinition: { name: 'Evoker' } }],
		stats: stat([8, 14, 13, 15, 12, 10]), bonusStats: stat([null, null, null, null, null, null]), overrideStats: stat([null, null, null, null, null, null]),
		modifiers: { race: [], class: [{ type: 'proficiency', subType: 'arcana' }], background: [{ type: 'bonus', subType: 'intelligence-score', value: 2 }], item: [], feat: [], condition: [] },
		baseHitPoints: 14, removedHitPoints: 0, temporaryHitPoints: 0,
		classSpells: [{ spells: [{ definition: { name: 'Fire Bolt' } }, { definition: { name: 'Shield' } }] }],
		spells: { race: [], class: [], feat: [], item: [] },
		inventory: [{ quantity: 1, equipped: true, definition: { id: 10, name: 'Quarterstaff' } }],
		currencies: { cp: 0, sp: 0, ep: 0, gp: 12, pp: 0 }, feats: [{ definition: { name: 'Alert' } }],
	} };
	const creatures = '```statblock\nname: Bog Wisp\nsize: Tiny\ntype: undead\nalignment: chaotic evil\nac: 13\nhp: 9\nhit_dice: 2d4 + 4\nspeed: 0 ft., fly 40 ft. (hover)\nstats: [3, 16, 14, 10, 12, 6]\ncr: 1/2\nactions:\n  - name: Chill Touch\n    desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Cold damage."\n```';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Import Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.system().id)) === 'dnd5e', { what: '5e campaign active' });

		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-ddb-character'); });
		await o.page.locator(M).waitFor();
		await o.page.locator(`${M} .dnd5e-import-link`).fill('https://www.dndbeyond.com/characters/123456789/AbCdEf');
		assert.equal(await o.page.locator(`${M} .dnd5e-import-url a`).getAttribute('href'), 'https://character-service.dndbeyond.com/character/v5/character/123456789');
		await o.page.locator(`${M} textarea`).fill(JSON.stringify(ddb));
		await o.waitFor(async () => /Pip Underbough[\s\S]*Level 3 Wizard[\s\S]*2024 rules/.test(await o.page.locator(`${M} .nimble-import-report`).innerText()), { what: 'the character found' });
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-import-ddb.png') });
		await o.page.locator(`${M} button.mod-cta`).click();
		await o.page.locator(M).waitFor({ state: 'detached' });
		const sheet = `${C}/Party/Pip Underbough.md`;
		await o.waitFor(async () => (await o.eval((app, _p, p) => app.metadataCache.getCache(p)?.frontmatter?.class, sheet)) === 'Wizard', { what: 'the imported character note' });
		const fm = await o.eval((app, _p, p) => app.metadataCache.getCache(p).frontmatter, sheet);
		assert.deepEqual([fm.level, fm.subclass, fm.int, fm.gold, fm.feats], [3, 'Evoker', 17, 12, ['Alert']]);
		await o.openFile(sheet, 'preview');
		await o.page.locator(`${R} .dnd5e-sheet`).waitFor({ timeout: 5000 });
		await o.page.locator(`${R} .dnd5e-tab[data-tab="features"]`).click();
		await o.waitFor(async () => /Alert/.test(await o.page.locator(`${R} .dnd5e-sheet`).innerText()), { what: 'the feat on the sheet' });

		// A private character's page says so plainly.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-ddb-character'); });
		await o.page.locator(M).waitFor();
		await o.page.locator(`${M} textarea`).fill('{"success":false,"message":"Unauthorized Access Attempt."}');
		await o.waitFor(async () => /Public/i.test(await o.page.locator(`${M} .nimble-import-report`).innerText()), { what: 'the private character message' });
		assert.equal(await o.page.locator(`${M} button.mod-cta`).isDisabled(), true);
		await o.page.keyboard.press('Escape');

		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-fantasy-statblocks'); });
		await o.page.locator(M).waitFor();
		await o.page.locator(`${M} textarea`).fill(creatures);
		await o.waitFor(async () => /Bog Wisp/.test(await o.page.locator(`${M} .nimble-import-report`).innerText()), { what: 'the creature found' });
		await o.page.locator(`${M} button.mod-cta`).click();
		await o.page.locator(M).waitFor({ state: 'detached' });
		const wisp = `${C}/Monsters/Bog Wisp.md`;
		await o.waitFor(async () => o.eval((app, _p, p) => !!app.vault.getAbstractFileByPath(p), wisp), { what: 'the creature note' });
		assert.match(await read(o, wisp), /```5e\nname: Bog Wisp\n[\s\S]*hp: 9 \(2d4 \+ 4\)[\s\S]*cr: 1\/2[\s\S]*- Chill Touch: Melee Attack Roll: \+5/);
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('5e compendium: spells, items and classes for both editions, 5e:spell: references, autocomplete, Spotlight', async (o) => {
	const C = 'Campaigns/Sword Coast';
	const V = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
			await app.vault.create(`${C}/Spells.md`, 'She casts `5e:spell:Fireball`, drinks a `5e:item:Potion of Healing` and is `5e:Prone`.\n');
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.system().id)) === 'dnd5e', { what: '5e campaign active' });

		// Open compendium in a 5e campaign is the 5e one: the shared browser, with tabs, typed filters and chips.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:open-bestiary'); });
		await o.page.locator(V).waitFor({ timeout: 5000 });
		const input = o.page.locator(`${V} .nimble-cmpx-input`);
		const selected = () => o.page.locator(`${V} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name`).innerText().catch(() => '');
		const tab = (name) => o.page.locator(`${V} .nimble-cmpx-seg`, { hasText: name }).click();
		await tab('Spells');
		await input.fill('fireball');
		await o.waitFor(async () => (await selected()) === 'Fireball', { what: 'Fireball selected' });
		const card = o.page.locator(`${V} .nimble-cmpx-detail .dnd5e-card`);
		assert.match(await card.innerText(), /Level 3 Evocation[\s\S]*Casting Time\s*Action[\s\S]*Range\s*150 feet/);
		await card.locator('.nimble-dice.is-clickable').first().click();
		await o.waitFor(async () => /8d6/.test(await o.eval((app, plugin) => plugin.settings.rollLog[0]?.expression ?? '')), { what: 'fireball damage rolled' });
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-compendium.png') });

		// Typed filters become chips: level 3 evocation wizard spells.
		await input.fill('');
		await input.pressSequentially('school:evocation level:3 class:wizard ', { delay: 20 });
		await o.waitFor(async () => (await o.page.locator(`${V} .nimble-cmpx-chip`).count()) === 3, { what: 'three filter chips' });
		const rows = o.page.locator(`${V} .nimble-cmpx-row.is-card .nimble-cmpx-row-name`);
		await o.waitFor(async () => (await rows.allInnerTexts()).includes('Fireball'), { what: 'Fireball in the filtered list' });
		assert.ok(!(await rows.allInnerTexts()).includes('Magic Missile'));
		// Monsters sort by CR, with headings; a filter suggestion completes as you type.
		await tab('Monsters');
		await o.waitFor(async () => /^CR /.test(await o.page.locator(`${V} .nimble-cmpx-group`).first().innerText().catch(() => '')), { what: 'CR headings' });
		await input.pressSequentially('type:und', { delay: 20 });
		await o.waitFor(async () => /type:\s*Undead/.test(await o.page.locator(`${V} .nimble-cmpx-row.is-suggestion`).first().innerText().catch(() => '')), { what: 'type:Undead suggested' });
		await o.page.keyboard.press('Tab');
		await o.waitFor(async () => (await o.page.locator(`${V} .nimble-cmpx-chip`, { hasText: /Undead/ }).count()) === 1, { what: 'Undead chip' });
		await o.waitFor(async () => (await rows.allInnerTexts()).includes('Zombie'), { what: 'Zombie listed' });

		// The 2014 rules print it the 2014 way.
		await o.page.locator(`${V} .dnd5e-cmp-editions button`, { hasText: '2014' }).click();
		await tab('Spells');
		await o.page.locator(`${V} .nimble-cmpx-input`).fill('fireball');
		await o.waitFor(async () => /3rd-level evocation/.test(await o.page.locator(`${V} .nimble-cmpx-detail .dnd5e-card-line`).innerText().catch(() => '')), { what: '2014 Fireball' });
		// A class page: hit die and the level table with spell slots.
		await tab('Classes');
		await o.page.locator(`${V} .nimble-cmpx-input`).fill('wizard');
		await o.waitFor(async () => (await o.page.locator(`${V} .nimble-cmpx-detail .dnd5e-level-table tr`).count()) === 21, { what: 'wizard level table' });
		assert.match(await o.page.locator(`${V} .nimble-cmpx-detail .dnd5e-card`).innerText(), /Hit Die\s*d6/);

		// References: a spell, an item, and a bare name that's a condition.
		await o.openFile(`${C}/Spells.md`, 'preview');
		await o.waitFor(async () => (await o.page.locator(`${R} .dnd5e-ref.dnd5e-hit`).count()) === 3, { what: 'three compendium refs' });
		assert.deepEqual(await o.page.locator(`${R} .dnd5e-ref.dnd5e-hit`).evaluateAll(els => els.map(e => [...e.classList].find(c => c.startsWith('kind-')))), ['kind-spell', 'kind-item', 'kind-condition']);
		await o.page.locator(`${R} .dnd5e-ref.kind-spell .nimble-inline-name`).hover();
		await o.waitFor(async () => (await o.page.locator('.nimble-hover-preview .dnd5e-card.kind-spell').count()) === 1, { what: 'spell hover card' });
		await o.page.keyboard.press('Escape');
		await o.page.locator(`${R} .dnd5e-ref.kind-item .nimble-inline-name`).click();
		await o.page.locator('.modal.dnd5e-card-modal .dnd5e-card.kind-item').waitFor({ timeout: 3000 });
		await o.page.keyboard.press('Escape');

		// Autocomplete: `5e:spell: lists spells and writes the kind.
		await o.eval(async (app, plugin, C) => {
			const f = await app.vault.create(`${C}/Scratch.md`, 'Cast \n');
			await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'source' } });
			const editor = app.workspace.activeEditor.editor;
			editor.setCursor({ line: 0, ch: 5 });
			editor.focus();
		}, C);
		await o.page.keyboard.type('`5e:spell:magic miss', { delay: 30 });
		await o.waitFor(() => o.page.evaluate(() => document.querySelector('.suggestion-container .nimble-suggestion-name')?.textContent === 'Magic Missile'), { timeout: 5000, what: 'Magic Missile suggested' });
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(200);
		assert.equal(await o.eval((app) => app.workspace.activeEditor.editor.getLine(0)), 'Cast `5e:spell:Magic Missile`');

		// Spotlight finds spells in a 5e campaign.
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:spotlight'); });
		const SP = '.modal-container .prompt.nimble-spotlight';
		await o.page.locator(`${SP} .prompt-input`).fill('magic missile');
		await o.waitFor(async () => /Magic Missile[\s\S]*Spell/i.test(await o.page.locator(`${SP} .suggestion-item`).first().innerText().catch(() => '')), { what: 'spell in Spotlight' });
		// Typed filters work in a 5e campaign's Spotlight too: a chip in 5e's words, 5e entries that match.
		await o.page.locator(`${SP} .prompt-input`).fill('school:evocation ');
		await o.waitFor(async () => (await cmpChips(o, SP)).length === 1, { timeout: 3000, what: 'the School chip in 5e Spotlight' });
		assert.deepEqual(await cmpChips(o, SP), [['School', 'evocation']]);
		await o.waitFor(async () => (await o.page.locator(`${SP} .spot-entry .nimble-spot-name`).allInnerTexts()).includes('Fireball'), { timeout: 3000, what: 'Fireball for school:evocation' });
		const evocation = await o.page.locator(`${SP} .spot-entry .nimble-spot-name`).allInnerTexts();
		assert.ok(!evocation.includes('Mage Hand'), `only evocation spells: ${evocation.slice(0, 8)}`);
		assert.equal(await o.page.locator(`${SP} .suggestion-item.spot-lookup`).count(), 1, 'the lookup row');
		await o.page.keyboard.press('Escape');
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.workspace.detachLeavesOfType('nimble-dnd5e-compendium');
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('5e character sheets: New character makes a 2024 wizard; the sheet rolls, tracks HP, skills, items, spells, slots, rests and levels', async (o) => {
	const C = 'Campaigns/Sword Coast';
	const note = `${C}/Party/Ilse Vane.md`;
	const fm = () => o.eval((app, _p, path) => app.metadataCache.getCache(path)?.frontmatter ?? {}, note);
	const S = `${R} .dnd5e-sheet`;
	try {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: true, system: '5e', edition: '2024' });
		}, C);
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.system().id)) === 'dnd5e', { what: '5e campaign active' });

		// New character is 5e's wizard in a 5e campaign: who, abilities, skills, subclass and spells.
		const B = '.modal.nimble-entity-builder';
		await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
		await o.page.locator(B).waitFor({ timeout: 3000 });
		assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Character');
		assert.equal(await o.page.locator(`${B} .eb-kind`).count(), 1);
		const panel = `${B} .eb-panel.is-active`;
		await o.page.locator(`${panel} input[data-field="Name"]`).fill('Ilse Vane');
		await o.page.locator(`${panel} select[data-field="Class"]`).selectOption('Wizard');
		await o.page.locator(`${panel} input[data-field="Level"]`).fill('3');
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Skills' }).click();
		for (const sk of ['Arcana', 'History']) await o.page.locator(`${panel} .eb-pick[data-value="${sk}"]`).click();
		// Wizards pick two: the rest wait until one is taken off.
		assert.equal(await o.page.locator(`${panel} .eb-pick.is-active`).count(), 2);
		assert.equal(await o.page.locator(`${panel} .eb-pick[data-value="Investigation"]`).isDisabled(), true);
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Class' }).click();
		await o.page.locator(`${panel} select[data-field="Subclass"]`).selectOption({ index: 1 });
		for (const sp of ['Fire Bolt', 'Light']) await o.page.locator(`${panel} [data-key="cantrips"] .eb-pick[data-value="${sp}"]`).click();
		await o.page.locator(`${panel} [data-key="spells"] .eb-pick[data-value="Shield"]`).click();
		assert.match(await o.page.locator(`${B} .eb-preview`).innerText(), /Ilse Vane[\s\S]*Level 3[\s\S]*Wizard[\s\S]*HP\s*17/);
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-new-character.png') });
		await o.page.locator(`${B} .eb-next`).click();
		await o.page.locator(B).waitFor({ state: 'detached' });
		await o.waitFor(async () => o.eval((app, _p, path) => !!app.vault.getAbstractFileByPath(path), note), { what: 'character note' });
		await o.waitFor(async () => (await fm()).class === 'Wizard', { what: 'frontmatter indexed' });
		const f0 = await fm();
		// The standard array set out for a wizard, then the Acolyte's +2 Int and +1 Wis.
		assert.deepEqual([f0.level, f0.int, f0.wis, f0.con, f0.dex, f0.str, f0.cha, f0.hp_max, f0.edition], [3, 17, 15, 13, 12, 10, 8, 17, '2024']);
		assert.deepEqual([...f0.skills].sort(), ['Arcana', 'History', 'Insight', 'Religion']);
		assert.deepEqual(f0.spells, ['Fire Bolt', 'Light', 'Shield']);
		assert.ok(f0.subclass);
		assert.match(await read(o, note), /```5e-sheet\n```/);

		await o.openFile(note, 'preview');
		await o.page.locator(S).waitFor({ timeout: 5000 });
		const tab = async (id) => { await o.page.locator(`${S} .dnd5e-tab[data-tab="${id}"]`).click(); await o.page.locator(`${S} .dnd5e-panel.is-${id}`).waitFor(); };
		// The sheet is the page: no inline title, no Properties box until its button shows them.
		// The view the sheet is drawn in (other tabs, left open by earlier tests, have reading views too).
		const pageShows = () => o.page.evaluate((S) => {
			const view = [...document.querySelectorAll(S)].find(n => n.checkVisibility())?.closest('.markdown-preview-view');
			return { title: !!view?.querySelector('.inline-title')?.checkVisibility(), props: !!view?.querySelector('.metadata-container')?.checkVisibility() };
		}, S);
		assert.deepEqual(await pageShows(), { title: false, props: false });
		await o.page.locator(`${S} .dnd5e-props-btn`).click();
		await o.waitFor(async () => (await pageShows()).props, { what: 'properties shown' });
		await o.page.locator(`${S} .dnd5e-props-btn`).click();
		await o.waitFor(async () => !(await pageShows()).props, { what: 'properties hidden again' });
		assert.match(await o.page.locator(`${S} .dnd5e-sheet-sub`).innerText(), /Level 3[\s\S]*Wizard/i);
		assert.match(await o.page.locator(`${S} .dnd5e-sheet-box`, { hasText: 'AC' }).innerText(), /11/);
		await tab('spells');
		assert.match(await o.page.locator(`${S} .dnd5e-sheet-cast`).innerText(), /Spellcasting\s*Intelligence[\s\S]*Save DC\s*13[\s\S]*Spell attack\s*\+5/i);
		// The class's scrollwork heads the tabs.
		assert.equal(await o.page.locator(`${S} .dnd5e-scroll .dnd5e-scroll-title`).innerText(), 'Wizard');
		assert.deepEqual(await o.page.locator(`${S} .dnd5e-slot-group`).evaluateAll(gs => gs.map(g => g.querySelectorAll('.ev-pip').length)), [4, 2]);
		await o.page.locator(`${S} .dnd5e-plate.is-init button.dnd5e-plate-n`).click();
		await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.rollLog[0]?.label)) === 'Ilse Vane: initiative', { what: 'initiative rolled' });

		// Skills: the dot takes Nature from untrained (+3) to proficient (+5).
		const nature = o.page.locator(`${S} .dnd5e-sheet-skill`, { hasText: 'Nature' });
		assert.match(await nature.locator('.dnd5e-sheet-roll').innerText(), /\+3/);
		await nature.locator('.dnd5e-skill-dot').click();
		await o.waitFor(async () => (await fm()).skills?.includes('Nature'), { what: 'Nature proficient' });
		await o.waitFor(async () => /\+5/.test(await o.page.locator(`${S} .dnd5e-sheet-skill`, { hasText: 'Nature' }).locator('.dnd5e-sheet-roll').innerText()), { what: 'Nature +5' });

		// HP: 5 damage on the keypad, then − twice and + once add up to one change of 1 damage.
		await o.page.locator(`${S} .ns-meter-calc`).click();
		await o.page.locator('.nimble-hp-pad').waitFor();
		await o.page.keyboard.type('5');
		assert.match(await o.page.locator('.nimble-hp-pad .hp-pad-preview').innerText(), /→ 12\/17/);
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await fm()).hp === 12, { what: 'HP 12' });
		await o.waitFor(async () => (await o.page.locator(`${S} .dnd5e-sheet-hp-cur`).innerText()) === '12', { what: 'bar shows 12' });
		for (const step of ['Take 1 damage', 'Take 1 damage', 'Heal 1']) await o.page.locator(`${S} .ns-meter-step[aria-label="${step}"]`).click();
		await o.waitFor(async () => (await fm()).hp === 11, { what: 'HP 11 from the steps' });
		// Hit dice: a filled pip spends one.
		await o.page.locator(`${S} .ev-pips.is-hit-dice .ev-pip.is-on`).first().click();
		await o.waitFor(async () => (await fm()).hit_dice_used === 1, { what: 'a hit die spent' });
		// A condition from the rules' list, and off again.
		await o.page.locator(`${S} .dnd5e-sheet-condition-add`).click();
		await clickMenu(o, 'Poisoned');
		await o.waitFor(async () => JSON.stringify((await fm()).conditions) === '["Poisoned"]', { what: 'Poisoned' });
		await o.page.locator(`${S} .dnd5e-sheet-condition-x[aria-label="End Poisoned"]`).click();
		await o.waitFor(async () => (await fm()).conditions === undefined, { what: 'Poisoned ends' });

		// A quarterstaff becomes an attack; Magic Missile joins the spells.
		await tab('inventory');
		await o.page.locator(`${S} .dnd5e-sheet-add`, { hasText: 'Add item' }).click();
		await o.page.locator('.prompt-input').fill('Quarterstaff');
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await o.page.locator(`${S} .dnd5e-sheet-item`, { hasText: 'Quarterstaff' }).count()) === 1, { what: 'quarterstaff carried' });
		await tab('actions');
		await o.waitFor(async () => (await o.page.locator(`${S} .dnd5e-sheet-attack`, { hasText: 'Quarterstaff' }).count()) === 1, { what: 'quarterstaff attack' });
		const staff = o.page.locator(`${S} .dnd5e-sheet-attack`).first();
		assert.match(await staff.innerText(), /Quarterstaff[\s\S]*Versatile[\s\S]*\+2\s*1d6/);
		// The damage type is the button's icon; its name is in the tooltip.
		assert.match(await staff.locator('.dnd5e-dmg').getAttribute('aria-label'), /1d6 Bludgeoning damage/);
		assert.equal(await staff.locator('.dnd5e-dmg .ev-pill-icon svg').count(), 1);
		// Shield is a reaction: Cast spends a level 1 slot.
		const shield = o.page.locator(`${S} .dnd5e-sheet-attack`, { hasText: 'Shield' });
		await shield.locator('.dnd5e-cast-btn').click();
		await o.waitFor(async () => JSON.stringify((await fm()).slots_used) === '[1]', { what: 'Shield cast' });
		await tab('spells');
		await o.page.locator(`${S} .dnd5e-sheet-add`, { hasText: 'Add spell' }).click();
		await o.page.locator('.prompt-input').fill('Magic Missile');
		await o.page.keyboard.press('Enter');
		await o.waitFor(async () => (await o.page.locator(`${S} .dnd5e-sheet-spell`, { hasText: 'Magic Missile' }).count()) === 1, { what: 'Magic Missile listed' });

		// Spend a slot, then a long rest brings everything back.
		await o.page.locator(`${S} .dnd5e-slot-group`).first().locator('.ev-pip.is-on').first().click();
		await o.waitFor(async () => JSON.stringify((await fm()).slots_used) === '[2]', { what: 'slot spent' });
		// Arcane Recovery is once per Long Rest: its pip spends it.
		await tab('features');
		const recovery = o.page.locator(`${S} .dnd5e-sheet-feature`, { hasText: 'Arcane Recovery' });
		await recovery.locator('.ev-pip.is-on').click();
		await o.waitFor(async () => JSON.stringify((await fm()).uses_spent) === '{"Arcane Recovery":1}', { what: 'Arcane Recovery used' });
		// Its name opens its own words.
		await recovery.locator('.dnd5e-feature-toggle').click();
		await o.waitFor(async () => /spell slots/i.test(await o.page.locator(`${S} .dnd5e-sheet-feature`, { hasText: 'Arcane Recovery' }).locator('.dnd5e-sheet-feature-text').innerText().catch(() => '')), { what: 'Arcane Recovery text' });
		await tab('spells');
		await o.page.screenshot({ path: join(ARTIFACTS, 'dnd5e-sheet.png') });
		await o.page.locator(`${S} .dnd5e-sheet-actions button`, { hasText: 'Long rest' }).click();
		await o.waitFor(async () => { const f = await fm(); return f.hp === 17 && f.slots_used === undefined && f.hit_dice_used === undefined && f.uses_spent === undefined; }, { what: 'long rest' });

		// Level up in the wizard: d6 average (4) + Con (1), and level 4's increase (+2 Int, the best score).
		await o.page.locator(`${S} .dnd5e-sheet-actions button`, { hasText: 'Level up' }).click();
		await o.page.locator(B).waitFor({ timeout: 3000 });
		assert.deepEqual(await o.page.locator(`${B} .eb-dot`).allInnerTexts(), ['Hit points', 'Increase', 'Spells']);
		assert.match(await o.page.locator(`${B} .eb-preview`).innerText(), /Ilse Vane[\s\S]*level 3 → 4[\s\S]*HP\s*\+5\s*max 22/);
		await o.page.locator(`${B} .eb-dot`, { hasText: 'Spells' }).click();
		await o.page.locator(`${panel} .eb-pick[data-value="Misty Step"]`).click();
		await o.page.locator(`${B} .eb-next`).click();
		await o.page.locator(B).waitFor({ state: 'detached' });
		await o.waitFor(async () => { const f = await fm(); return f.level === 4 && f.hp_max === 22 && f.int === 19; }, { what: 'level 4' });
		assert.ok((await fm()).spells.includes('Misty Step'));

		// Another note in the same tab has its title and properties back.
		await o.eval(async (app, _p, C) => { await app.vault.create(`${C}/Plain note.md`, '---\ntags: [x]\n---\nJust a note.\n'); }, C);
		await o.openFile(`${C}/Plain note.md`, 'preview');
		const activeShows = () => o.page.evaluate(() => {
			const view = document.querySelector('.workspace-leaf.mod-active .markdown-preview-view');
			return { title: !!view?.querySelector('.inline-title')?.checkVisibility(), props: !!view?.querySelector('.metadata-container')?.checkVisibility() };
		});
		await o.waitFor(async () => { const v = await activeShows(); return v.title && v.props; }, { what: 'a plain note shows its title and properties' });

		// The encounter party reads the sheet: level and AC.
		await o.eval((app, plugin) => plugin.syncPartyFromSheets());
		await o.waitFor(async () => (await o.eval((app, plugin) => JSON.stringify(plugin.settings.party.map(p => [p.name, p.level, p.maxHp, p.defense])))) === JSON.stringify([['Ilse Vane', 4, 22, 11]]), { what: 'party from the sheet' });
	} finally {
		await o.eval(async (app, plugin, C) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			plugin.settings.party = [];
			const f = app.vault.getAbstractFileByPath(C); if (f) await app.vault.delete(f, true);
			await plugin.campaigns.setActive(null);
		}, C);
	}
});

test('no console errors during the run', async (o) => {
	const errors = o.consoleErrors.filter(e => !/net::ERR_|favicon/.test(e));
	assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------

// E2E_RANGE=10-20 runs tests 10..20 by position, plus any whose name contains the filter: for finding which earlier test upsets a later one.
const range = process.env.E2E_RANGE?.split('-').map(Number);
// A file-chooser wait left pending by a test that failed earlier must not take the whole run down with it.
process.on('unhandledRejection', (e) => console.log(`      (ignored a late rejection: ${String(e?.message ?? e).split('\n')[0]})`));
const selected = range ? tests.filter((t, i) => (i >= range[0] && i <= range[1]) || (filter && t.name.includes(filter))) : tests.filter(t => !filter || t.name.includes(filter));
// 3D dice are off for the general run (notices would wait for them to land); one test turns them on.
// Reading view for campaign pages is off for the general run (tests open campaign notes in Source mode on purpose); one test turns it on.
const o = await launchObsidian({ settings: { dice3d: false, readingView: false } });
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
		if (process.env.E2E_STACK) console.log(e.stack);
		console.log(`  ✗ ${t.name}\n      ${String(e.message).split('\n').join('\n      ')}\n      screenshot: ${file}`);
	}
}
await o.close();
console.log(`\n${selected.length - failed}/${selected.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
