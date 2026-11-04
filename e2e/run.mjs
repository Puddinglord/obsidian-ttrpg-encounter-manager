// End-to-end tests: drives a real, isolated Obsidian with the built plugin.
//
//   npm run test:e2e              build, then run every test
//   node e2e/run.mjs hover        run tests whose name contains "hover"
//   KEEP_E2E=1 node e2e/run.mjs   keep the temp vault for inspection
//
// Screenshots of failures (and a few showcase shots) go to e2e/artifacts/.

import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { launchObsidian } from './harness.mjs';

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

async function resetEncounter(o) {
	await o.eval(async (app, plugin) => {
		plugin.settings.multipleEncounters = false;
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		plugin.encounters.trigger('changed');
		document.querySelectorAll('.notice').forEach(n => n.remove());
		await plugin.activateEncounterView(false);
	});
	await o.page.waitForTimeout(150);
}

const creatures = (o) => o.eval((app, plugin) => (plugin.encounters.active?.creatures || []).map(c => ({ label: c.label, hp: c.currentHp, max: c.maxHp, conditions: c.conditions, lrUsed: c.lrUsed || 0 })));
const notices = (o) => o.page.evaluate(() => [...document.querySelectorAll('.notice')].map(n => n.innerText));

// ---------------------------------------------------------------------------
// Rendering

test('plugin loads cleanly', async (o) => {
	const loaded = await o.eval((app) => !!app.plugins.plugins['nimble-statblocks']?._loaded);
	assert.ok(loaded);
});

test('regular stat block renders badges, abilities and attacks', async (o) => {
	await o.openFile('Bestiary/Goblin Boss.md');
	const info = await o.page.evaluate((R) => {
		const b = document.querySelector(`${R} .nimble-statblock`);
		return {
			name: b.querySelector('.monster-name-inline')?.textContent,
			badges: [...b.querySelectorAll('.stat-badge')].map(x => x.textContent),
			ability: b.querySelector('.ability-item')?.textContent,
			multi: b.querySelector('.multiattack strong')?.textContent,
			attacks: [...b.querySelectorAll('.actions-list li')].map(li => li.textContent),
			hasAdd: !!b.querySelector('.add-btn'),
		};
	}, R);
	assert.equal(info.name, 'Goblin Boss');
	assert.deepEqual(info.badges, ['2', 'SMALL', '36', 'M', 'STR+ DEX++ WIL-']);
	assert.match(info.ability, /^Redirect Attack\. When missed/);
	assert.equal(info.multi, 'scimitar');
	assert.deepEqual(info.attacks, ['Scimitar 1d6+2 slashing', 'Javelin 2d4 piercing']);
	assert.ok(info.hasAdd);
});

test('solo stat block renders header, senses and phases', async (o) => {
	await o.openFile('Bestiary/Young Dragon.md');
	const info = await o.page.evaluate((R) => {
		const b = document.querySelector(`${R} .nimble-statblock.solo-monster`);
		return {
			header: b.querySelector('.solo-level-type')?.textContent,
			senses: b.querySelector('.monster-senses')?.textContent,
			resist: b.querySelector('.monster-defenses')?.textContent,
			bloodied: b.querySelector('.bloodied-section')?.textContent,
			lastStand: b.querySelector('.laststand-section')?.textContent,
			legendary: [...b.querySelectorAll('.solo-ability-item .ability-name')].map(x => x.textContent),
		};
	}, R);
	assert.equal(info.header, 'Level 7 Solo Large Dragon');
	assert.match(info.senses, /Blindsight 6 spaces/);
	assert.match(info.resist, /Resistances: Fire/);
	assert.match(info.bloodied, /^BLOODIED: Fire Breath recharges/);
	assert.match(info.lastStand, /^LAST STAND:/);
	assert.deepEqual(info.legendary, ['Frightful Presence.', 'Wing Attack (L).']);
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-solo.png') });
});

test('stat block text can never inject HTML or script', async (o) => {
	await o.openFile('Edge Cases.md');
	const r = await o.page.evaluate((R) => ({
		xss: !!window.__nimbleXss,
		tags: document.querySelectorAll(`${R} .nimble-statblock b, ${R} .nimble-statblock img, ${R} .nimble-statblock i`).length,
		name: [...document.querySelectorAll(`${R} .monster-name-inline`)].map(e => e.textContent).find(t => t.includes('Rat')),
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
		golemHp: [...document.querySelectorAll(`${R} .nimble-statblock`)].find(b => b.textContent.includes('Paper Golem'))?.querySelector('.hp-badge')?.textContent,
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
		missing: [...document.querySelectorAll(`${R} .nimble-inline-unresolved`)].map(e => e.dataset.nimbleRef),
	}), R);
	assert.deepEqual(r.found, ['Goblin', 'Goblin Boss', 'Young Dragon', 'Goblin']);
	assert.deepEqual(r.missing, ['Owlbear']);
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
	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Young Dragon' }).hover();
	await o.page.waitForSelector('#nimble-hover-preview-active', { timeout: 2000 });
	assert.equal(await o.page.locator('#nimble-hover-preview-active .solo-name').textContent(), 'Young Dragon');
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-hover.png') });
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator('#nimble-hover-preview-active').count(), 0);

	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' }).hover();
	await o.page.waitForSelector('#nimble-hover-preview-active', { timeout: 2000 });
	await o.openFile('Bestiary/Goblin.md');
	assert.equal(await o.page.locator('#nimble-hover-preview-active').count(), 0);
});

test('clicking an inline reference opens its note', async (o) => {
	await o.openFile('Adventure.md');
	await o.page.locator(`${R} .nimble-inline-name`, { hasText: 'Goblin Boss' }).click();
	await o.page.waitForTimeout(400);
	assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), 'Bestiary/Goblin Boss.md');
});

test('index updates live: new, renamed and deleted monsters', async (o) => {
	await o.openFile('Adventure.md');
	await o.eval((app) => app.vault.create('Bestiary/Owlbear.md', '```nimble\nname: Owlbear\nhp: 30\n```\n'));
	await o.waitFor(() => o.page.evaluate((R) => !document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 5000, what: 'Owlbear to resolve' });
	await o.eval((app) => app.fileManager.renameFile(app.vault.getAbstractFileByPath('Bestiary/Owlbear.md'), 'Bestiary/Owlbear (Forest).md'));
	await o.waitFor(() => o.eval((app, plugin) => plugin.index.get('Owlbear')?.filePath === 'Bestiary/Owlbear (Forest).md'), { timeout: 5000, what: 'rename to be indexed' });
	await o.eval((app) => app.vault.delete(app.vault.getAbstractFileByPath('Bestiary/Owlbear (Forest).md')));
	await o.waitFor(() => o.page.evaluate((R) => !!document.querySelector(`${R} .nimble-inline-unresolved`), R), { timeout: 5000, what: 'Owlbear to go unresolved' });
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
	await o.waitFor(() => o.page.evaluate(() => {
		const names = [...document.querySelectorAll('.suggestion-container .nimble-suggestion-name')].map(e => e.textContent);
		return names.length === 1 && names[0] === 'Goblin Boss';
	}), { timeout: 3000, what: 'only "Goblin Boss" to be suggested' });
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	const text = await o.eval((app) => app.workspace.activeEditor.editor.getLine(0));
	assert.equal(text, 'Meet the `nimble:Goblin Boss`');
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

	await o.page.locator(`${T} .creature-item`).first().locator('.remove-btn').click();
	await o.openFile('Bestiary/Goblin.md');
	await o.page.click(`${R} .add-btn`);
	list = await creatures(o);
	assert.deepEqual(list.map(c => c.label), ['Goblin-2', 'Goblin-3', 'Goblin Boss-1', 'Goblin-4']);
	assert.equal(await o.page.locator(`${T} .creature-item`).count(), 4);
	assert.match(await o.page.locator(`${T} .encounter-summary`).textContent(), /4\/4 standing.*72\/72 HP/);
});

test('add-monster search adds from anywhere', async (o) => {
	await resetEncounter(o);
	await o.eval((app) => app.commands.executeCommandById('nimble-statblocks:add-monster'));
	await o.page.waitForSelector('.prompt-input');
	await o.page.keyboard.type('young');
	await o.page.waitForTimeout(150);
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(200);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Young Dragon-1']);
});

test('typed damage, healing and set; invalid input is flagged', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster, 'Bestiary/Goblin.md'));
	const card = () => o.page.locator(`${T} .creature-item`).first();
	const type = async (value) => {
		await card().locator('.hp-display').click();
		await o.page.keyboard.type(value);
		await o.page.keyboard.press('Enter');
		await o.page.waitForTimeout(100);
	};
	await type('5');
	assert.equal((await creatures(o))[0].hp, 7);
	await type('+3');
	assert.equal((await creatures(o))[0].hp, 10);
	await type('=2');
	assert.equal((await creatures(o))[0].hp, 2);
	assert.ok(await card().evaluate(el => el.classList.contains('hp-critical')));
	await card().locator('.hp-display').click();
	await o.page.keyboard.type('lots');
	await o.page.keyboard.press('Enter');
	assert.ok(await card().locator('.hp-input.is-invalid').count());
	await o.page.keyboard.press('Escape');
	await card().locator('.hp-btn', { hasText: '-5' }).click();
	assert.equal((await creatures(o))[0].hp, 0);
	assert.match(await card().locator('.conditions-row').textContent(), /Dying/);
});

test('solo monsters: bloodied alert, last stand banner, legendary pips', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Young Dragon').monster, 'Bestiary/Young Dragon.md'));
	await o.page.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
	const card = o.page.locator(`${T} .creature-item`).first();
	await card.locator('.hp-display').click();
	await o.page.keyboard.type('60');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(150);
	assert.ok((await notices(o)).some(n => /Young Dragon-1 is Bloodied/.test(n)));
	assert.match(await card.locator('.phase-banner').textContent(), /^BLOODIED:/);

	await card.locator('.legendary-pip').nth(0).click();
	await card.locator('.legendary-pip').nth(1).click();
	assert.equal((await creatures(o))[0].lrUsed, 2);
	await card.locator('.legendary-pip').nth(1).click(); // un-spend
	assert.equal((await creatures(o))[0].lrUsed, 1);

	await card.locator('.hp-display').click();
	await o.page.keyboard.type('=0');
	await o.page.keyboard.press('Enter');
	await o.page.waitForTimeout(150);
	assert.match(await card.locator('.phase-banner').textContent(), /^LAST STAND:/);
	assert.ok((await notices(o)).some(n => /Last Stand/.test(n)));
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-tracker-solo.png') });
});

test('conditions: add from picker, Escape closes it, remove with ×', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	const card = o.page.locator(`${T} .creature-item`).first();
	await card.locator('.add-condition-btn').click();
	await o.page.locator('.condition-picker .picker-option', { hasText: 'Prone' }).click();
	assert.deepEqual((await creatures(o))[0].conditions, ['Prone']);
	await card.locator('.add-condition-btn').click();
	assert.equal(await o.page.locator('.condition-picker').count(), 1);
	assert.equal(await o.page.locator('.condition-picker .picker-option', { hasText: 'Prone' }).count(), 0);
	await o.page.keyboard.press('Escape');
	assert.equal(await o.page.locator('.condition-picker').count(), 0);
	await card.locator('.condition-tag', { hasText: 'Prone' }).locator('.remove-condition').click();
	assert.deepEqual((await creatures(o))[0].conditions, []);
});

test('rename, round counter, clear all', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.page.locator(`${T} .edit-btn`).first().click();
	await o.page.keyboard.press('Meta+A');
	await o.page.keyboard.type('Sneaky Pete');
	await o.page.keyboard.press('Enter');
	assert.equal((await creatures(o))[0].label, 'Sneaky Pete');

	await o.page.locator(`${T} .round-btn[aria-label="Next round"]`).click();
	await o.page.locator(`${T} .round-btn[aria-label="Next round"]`).click();
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 3');
	await o.eval((app) => app.commands.executeCommandById('nimble-statblocks:next-round'));
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 4');

	await o.page.locator(`${T} .delete-encounter-btn`).click();
	await o.page.locator(`${T} .confirm-btn`).click();
	assert.equal((await creatures(o)).length, 0);
	assert.equal(await o.page.locator(`${T} .round-label`).textContent(), 'Round 1');
});

test('viewing a creature shows its stat block in the tracker', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin Boss').monster, 'Bestiary/Goblin Boss.md'));
	await o.page.locator(`${T} .creature-label`).first().click();
	assert.equal(await o.page.locator(`${T} .statblock-viewer .monster-name-inline`).textContent(), 'Goblin Boss');
	await o.page.locator(`${T} .statblock-viewer .close-viewer-btn`).click();
	assert.equal(await o.page.locator(`${T} .statblock-viewer`).count(), 0);
});

test('multiple encounters: create and switch', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => { plugin.settings.multipleEncounters = true; plugin.encounters.trigger('changed'); });
	await o.page.locator(`${T} .encounter-name-input`).fill('Ambush');
	await o.page.keyboard.press('Enter');
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.page.locator(`${T} .encounter-name-input`).fill('Lair');
	await o.page.locator(`${T} .add-encounter-btn`).click();
	assert.equal((await creatures(o)).length, 0);
	const ambushId = await o.eval((app, plugin) => plugin.settings.encounters.find(e => e.name === 'Ambush').id);
	await o.page.locator(`${T} .encounter-select`).selectOption(ambushId);
	assert.deepEqual((await creatures(o)).map(c => c.label), ['Goblin-1']);
});

test('encounter state is saved to disk', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster));
	await o.page.waitForTimeout(300);
	const saved = await o.eval((app, plugin) => plugin.loadData());
	assert.equal(saved.encounters[0].creatures[0].label, 'Goblin-1');
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
	await o.openFile('Bestiary/Goblin Boss.md');
	r = await rollWith([1], '1d6+2');
	assert.equal(r.outcome, undefined);
	assert.equal(r.total, 3);
	await o.eval((app, plugin) => { plugin.settings.nimbleAttackRolls = true; });
});

test('stat blocks indented under a list item are indexed', async (o) => {
	await o.openFile('Camp.md');
	await o.waitFor(() => o.page.evaluate((R) => !!document.querySelector(`${R} .nimble-inline-found`), R), { timeout: 5000, what: 'Camp Guard ref to resolve' });
	assert.equal(await o.eval((app, plugin) => plugin.index.get('Camp Guard')?.monster.hp), 14);
});

test('cancelling HP entry does not swallow the next click', async (o) => {
	await resetEncounter(o);
	await o.eval((app, plugin) => plugin.addToEncounter(plugin.index.get('Goblin').monster, undefined, 2));
	const cards = o.page.locator(`${T} .creature-item`);
	await cards.nth(0).locator('.hp-display').click();
	await cards.nth(1).locator('.hp-btn', { hasText: '-5' }).click();
	const list = await creatures(o);
	assert.equal(list[1].hp, 7);
	assert.equal(list[0].hp, 12);
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
	assert.equal(await o.page.locator(`${R} .nimble-dice`).count(), 0);
	await o.eval(async (app, plugin) => { plugin.settings.statblockStyle = 'book'; plugin.settings.clickableDice = true; plugin.rerenderNotes(); });
	await o.page.waitForTimeout(400);
	assert.equal(await o.page.locator(`${R} .nimble-statblock.is-compact`).count(), 0);
});

test('settings tab renders', async (o) => {
	await o.eval((app) => { app.setting.open(); app.setting.openTabById('nimble-statblocks'); });
	await o.page.waitForTimeout(300);
	const names = await o.page.locator('.vertical-tab-content .setting-item-name').allTextContents();
	await o.page.screenshot({ path: join(ARTIFACTS, 'showcase-settings.png') });
	await o.eval((app) => app.setting.close());
	for (const n of ['Stat block style', 'Clickable dice', 'Multiple encounters', 'Custom conditions']) assert.ok(names.includes(n), `missing setting ${n}`);
});

test('no console errors during the run', async (o) => {
	const errors = o.consoleErrors.filter(e => !/net::ERR_|favicon/.test(e));
	assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------

const selected = tests.filter(t => !filter || t.name.includes(filter));
const o = await launchObsidian();
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
