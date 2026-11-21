// 5e's own e2e suites, run by run.mjs in the same Obsidian (see "Suites in their own files" there).
//
// The builders for your own character content: New on the compendium's Classes tab builds a class and a
// subclass, the pencil on their blocks reopens them, and a hero is made and levelled with both.
//
// Every entity in a 5e campaign, as a user meets it, in both editions (2024 = SRD 5.2, 2014 = SRD 5.1):
// create it the way a user does, see it (reading view and Live Preview), edit it, link it, find it,
// use it at the table, and what a player campaign shows. Each test makes its own campaign and deletes
// it afterwards, so they run in any order.
//
//   node e2e/run.mjs "entities 5e"
//
// A test whose name starts "entities 5e: KNOWN:" records a gap that needs a decision; it logs why and
// returns without failing.

import { readFileSync } from 'node:fs';

export function register(test, h) {
	const { R, S, ARTIFACTS, ROOT, assert, join, exact, read, exists, clickMenu, CP, cgroup, crow, panelSections, cmpNames, cmpRow, pickCondition5e, hpPad5e, measurePills, pillOffenders, PILL_SELECTORS } = h;

	const TR = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	const CV = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
	const B = '.modal.nimble-entity-builder';
	const PANEL = `${B} .eb-panel.is-active`;
	const SP = '.modal-container .prompt.nimble-spotlight';
	// The note on screen: the main area's reading view (or Live Preview) that's showing. Not `.mod-active`, which
	// moves to the Campaign panel or the tracker as soon as they're clicked.
	const MAIN = '.workspace-split.mod-root';
	const view = (o, sel) => o.page.locator(`${MAIN} ${R} ${sel}`).filter({ visible: true });
	const lp = (o, sel) => o.page.locator(`${MAIN} ${S} ${sel}`).filter({ visible: true });
	const CONTENT = 'Ember Vault/Content';
	const shot = (o, name, loc) => (loc ?? o.page).screenshot({ path: join(ARTIFACTS, `entities-5e-${name}.png`) }).catch(() => {});

	/** Close menus, dialogs, hover cards and notices a step (or a failed test) left behind. */
	const tidy = (o) => o.eval((app, plugin) => {
		plugin.hover?.hide();
		document.querySelectorAll('.menu, .nimble-popover, .suggestion-container').forEach(n => n.remove());
		document.querySelectorAll('.modal-container').forEach(n => n.remove());
		document.querySelectorAll('.notice').forEach(n => n.remove());
	});

	/** A 5e campaign of our own, made fresh and active, with the panel open. */
	async function campaign5e(o, name, { edition = '2024', role = 'gm', starter = true, level = 1, heroes = 4, character } = {}) {
		const folder = `Campaigns/${name}`;
		await o.eval(async (app, plugin, [folder, opts]) => {
			document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
			app.vault.setConfig('trashOption', 'local');
			const old = app.vault.getAbstractFileByPath(folder);
			if (old) await app.vault.delete(old, true);
			plugin.settings.party = [];
			await plugin.campaigns.createCampaign({ ...opts, system: '5e', firstChapter: 'Chapter 1' });
			let c;
			for (let i = 0; i < 60 && !(c = plugin.campaigns.campaigns.find(x => x.folder === folder && x.system)); i++) await new Promise(r => setTimeout(r, 100));
			await plugin.campaigns.setActive(folder);
			await plugin.openCampaignView();
		}, [folder, { name, edition, role, starter, level, heroes, character }]);
		await o.waitFor(async () => (await o.eval((app, plugin, f) => plugin.system(`${f}/x.md`).id === 'dnd5e' && plugin.edition(`${f}/x.md`), folder)) === edition, { what: `${name} as a 5e ${edition} campaign` });
		if (starter) await o.waitFor(async () => (await cgroup(o, `${folder}/NPCs`).count()) === 1, { what: 'the starter folders in the panel' });
		return folder;
	}

	/** Delete what a test made (campaigns, content), forget the fight and the party, leave no campaign active. */
	async function drop(o, paths) {
		await tidy(o).catch(() => {});
		await o.eval(async (app, plugin, paths) => {
			app.workspace.detachLeavesOfType('nimble-dnd5e-tracker');
			app.workspace.detachLeavesOfType('nimble-dnd5e-compendium');
			for (const p of paths) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f, true); }
			plugin.settings.party = [];
			if (plugin.settings.systemData) delete plugin.settings.systemData.dnd5e;
			await plugin.campaigns.setActive(null);
		}, paths);
	}

	/**
	 * Run a test's body in its own campaign(s): a screenshot of the moment it failed (before clean-up hides it),
	 * then delete what it made whatever happened.
	 */
	async function scenario(o, id, paths, fn) {
		try {
			await fn();
		} catch (e) {
			await shot(o, `FAIL-${id}`);
			throw e;
		} finally {
			await drop(o, paths);
		}
	}

	/** A note's frontmatter, once the cache has it. */
	const fmOf = (o, path) => o.eval((app, _p, path) => app.metadataCache.getCache(path)?.frontmatter ?? null, path);
	async function waitFm(o, path, check, what) {
		let fm = null;
		await o.waitFor(async () => { fm = await fmOf(o, path); return fm && check(fm); }, { what });
		return fm;
	}
	const write = (o, path, text) => o.eval(async (app, _p, [path, text]) => {
		const dir = path.split('/').slice(0, -1).join('/');
		if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir).catch(() => {});
		const f = app.vault.getAbstractFileByPath(path);
		if (f) await app.vault.modify(f, text); else await app.vault.create(path, text);
	}, [path, text]);
	const setFm = (o, path, fields) => o.eval(async (app, _p, [path, fields]) => {
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), (fm) => {
			for (const [k, v] of Object.entries(fields)) { if (v === null) delete fm[k]; else fm[k] = v; }
		});
	}, [path, fields]);
	const lastRoll = (o) => o.eval((app, plugin) => plugin.settings.rollLog[0] ?? null);
	const fight = (o) => o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.map(c => ({ label: c.label, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac, init: c.init, side: c.side, conditions: c.conditions.map(x => x.name), legendary: c.legendary, death: c.death })));
	const row5e = (o, name) => o.page.locator(`${TR} .dnd5e-combatant`, { has: o.page.locator('.dnd5e-combatant-name', { hasText: exact(name) }) });
	const turnName = (o) => o.page.locator(`${TR} .dnd5e-combatant.is-turn .dnd5e-combatant-name`).first().innerText().catch(() => '');

	/** Type into the open editor where the cursor is, slowly enough for the "/" menu and suggestions. */
	const type = async (o, text) => { await o.page.keyboard.type(text, { delay: 15 }); await o.page.waitForTimeout(250); };
	const slashMenu = (o) => o.page.locator('.suggestion-container .nimble-slash-item');
	const slashTitles = (o) => slashMenu(o).locator('.nimble-slash-title').allInnerTexts();
	/** Open a note in Live Preview with the cursor on a new last line. */
	async function editAtEnd(o, path) {
		await o.openFile(path, 'source');
		await o.eval((app) => { const ed = app.workspace.activeEditor.editor; const n = ed.lineCount(); ed.setCursor({ line: n - 1, ch: ed.getLine(n - 1).length }); ed.replaceSelection('\n'); ed.focus(); });
	}
	/** The note open in the active tab, read back. */
	const editorText = (o) => o.eval((app) => app.workspace.activeEditor?.editor?.getValue() ?? '');

	/** Open Spotlight with a query; returns the rows' text. */
	async function spotlight(o, query, until) {
		await o.eval((app) => { document.querySelectorAll('.modal-container').forEach(n => n.remove()); app.commands.executeCommandById('nimble-gm:spotlight'); });
		await o.page.locator(`${SP} .prompt-input`).waitFor();
		await o.page.locator(`${SP} .prompt-input`).fill(query);
		let rows = [];
		await o.waitFor(async () => { rows = await o.page.locator(`${SP} .suggestion-item`).allInnerTexts(); return until(rows); }, { what: `Spotlight for "${query}"` });
		return rows;
	}

	/** The 5e compendium on a tab, searched. */
	async function compendium(o, tab, query) {
		await o.eval((app) => { if (!app.workspace.getLeavesOfType('nimble-dnd5e-compendium').length) app.commands.executeCommandById('nimble-gm:open-bestiary'); else app.workspace.revealLeaf(app.workspace.getLeavesOfType('nimble-dnd5e-compendium')[0]); });
		await o.page.locator(CV).waitFor({ timeout: 5000 });
		await o.page.locator(`${CV} .nimble-cmpx-seg`, { hasText: tab }).first().click();
		await o.page.locator(`${CV} .nimble-cmpx-input`).fill(query ?? '');
	}

	/**
	 * New character, filled in the way a player does: who they are, then a pick for every step that asks for one
	 * (skills, tools and languages, class choices, spells). The wizard must already be open.
	 */
	async function fillCharacter(o, c) {
		await o.page.locator(B).waitFor({ timeout: 3000 });
		await o.page.locator(`${PANEL} input[data-field="Name"]`).fill(c.name);
		await o.page.locator(`${PANEL} select[data-field="Class"]`).selectOption(c.className);
		if (c.level) await o.page.locator(`${PANEL} input[data-field="Level"]`).fill(String(c.level));
		const sp = o.page.locator(`${PANEL} select[data-field="Species"], ${PANEL} select[data-field="Race"]`).first();
		if (c.species) await sp.selectOption(c.species);
		if (c.subspecies) await o.page.locator(`${PANEL} select[data-field="Subrace"], ${PANEL} select[data-field="Lineage"]`).first().selectOption({ label: c.subspecies });
		if (c.background) await o.page.locator(`${PANEL} select[data-field="Background"]`).selectOption(c.background);
		await o.waitFor(async () => new RegExp(c.className).test(await o.page.locator(`${B} .eb-preview`).innerText()), { what: 'the class in the preview' });
		const steps = await o.page.locator(`${B} .eb-dot`).allInnerTexts();
		/** Pick the first `n` choices still open in a group of chips. */
		const takeFirst = async (key, n) => {
			for (let i = 0; i < n; i++) {
				const free = o.page.locator(`${PANEL} [data-key="${key}"] .eb-pick:not(.is-active):not([disabled])`);
				if (!(await free.count())) break;
				await free.first().click();
			}
		};
		if (steps.includes('Skills')) {
			await step(o, 'Skills');
			for (const s of c.skills ?? []) await pick(o, s, `${PANEL} [data-key="skills"]`);
		}
		if (steps.includes('Tools')) {
			await step(o, 'Tools');
			for (const l of c.languages ?? []) await pick(o, l, `${PANEL} [data-key="languages"]`);
		}
		if (steps.includes('Class')) {
			await step(o, 'Class');
			if (c.subclass) await o.page.locator(`${PANEL} select[data-field="Subclass"]`).selectOption(c.subclass);
			const style = o.page.locator(`${PANEL} select[data-field="Fighting Style"]`);
			if (await style.count()) await style.selectOption(c.fightingStyle ?? { index: 1 });
			if (await o.page.locator(`${PANEL} [data-key="masteries"]`).count()) {
				for (const w of c.masteries ?? []) await pick(o, w, `${PANEL} [data-key="masteries"]`);
			}
			for (const sp of c.cantrips ?? []) await pick(o, sp, `${PANEL} [data-key="cantrips"]`);
			for (const sp of c.spells ?? []) await pick(o, sp, `${PANEL} [data-key="spells"]`);
			if (c.fillSpells) { await takeFirst('cantrips', 6); await takeFirst('spells', 12); }
		}
		await shot(o, `wizard-${c.name.replace(/\W+/g, '-')}`);
		// Create from the last step; if something's missing, the wizard goes to that step instead: say which.
		for (let i = 0; i < 10 && await o.page.locator(B).count(); i++) {
			const create = o.page.locator(`${B} .eb-create`);
			if (await create.isVisible().catch(() => false)) await create.click();
			else await o.page.locator(`${B} .eb-next`).click().catch(() => {});
			await o.page.waitForTimeout(200);
		}
		if (await o.page.locator(B).count()) {
			const where = await o.page.locator(`${B} .eb-dot.is-active`).innerText().catch(() => '?');
			throw new Error(`New character stayed open on "${where}": ${(await o.page.locator(PANEL).innerText().catch(() => '')).slice(0, 400)}`);
		}
	}

	/** Pick a choice from a builder or wizard step by its label. */
	const pick = (o, value, scope = PANEL) => o.page.locator(`${scope} .eb-pick[data-value="${value}"]`).first().click();
	const step = (o, name) => o.page.locator(`${B} .eb-dot`, { hasText: name }).first().click();
	/** Finish the builder or wizard from any step. */
	async function finish(o) {
		const create = o.page.locator(`${B} .eb-create`);
		if (await create.isVisible().catch(() => false)) await create.click(); else await o.page.locator(`${B} .eb-next`).click();
		await o.page.locator(B).waitFor({ state: 'detached', timeout: 5000 });
	}

	// -----------------------------------------------------------------------
	// Content builders

	test('5e content builders: New on Classes builds a class and a subclass, the pencil reopens them, and a hero is made and levelled with both', async (o) => {
		const C = 'Campaigns/Builder Coast';
		const F = 'Ember Vault/Content';
		const V = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
		const B = '.modal.nimble-entity-builder';
		const panel = `${B} .eb-panel.is-active`;
		const note = `${C}/Party/Wren Ashby.md`;
		const cls = `${F}/5e/Classes/Hearth Warden.md`;
		const sub = `${F}/5e/Subclasses/Circle of Embers.md`;
		const fm = () => o.eval((app, _p, path) => app.metadataCache.getCache(path)?.frontmatter ?? {}, note);
		const finish = async () => { while (await o.page.locator(B).count()) { await o.page.locator(`${B} .eb-next`).click(); await o.page.waitForTimeout(200); } };
		try {
			await o.eval(async (app, plugin, [C, F]) => {
				document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
				app.workspace.detachLeavesOfType('nimble-dnd5e-compendium');
				for (const p of [C, F]) { const old = app.vault.getAbstractFileByPath(p); if (old) await app.vault.delete(old, true); }
				plugin.settings.party = [];
				await plugin.campaigns.createCampaign({ name: 'Builder Coast', level: 1, heroes: 4, starter: false, system: '5e', edition: '2024' });
			}, [C, F]);
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.system().id)) === 'dnd5e', { what: '5e campaign active' });

			// New on the Classes tab asks which; a class opens the class builder, with the content kinds in its bar.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:open-bestiary'); });
			await o.page.locator(V).waitFor({ timeout: 5000 });
			await o.page.locator(`${V} .nimble-cmpx-seg`, { hasText: 'Classes' }).click();
			await o.page.locator(`${V} .nimble-cmpx-new`).click();
			await o.page.locator('.menu .menu-item', { hasText: 'New class…' }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Class');
			assert.deepEqual(await o.page.locator(`${B} .eb-kind`).allInnerTexts(), ['Class', 'Subclass', 'Species', 'Background', 'Feat']);
			assert.deepEqual(await o.page.locator(`${B} .eb-dot`).allInnerTexts(), ['Class', 'Training', 'Gear', 'Spells', 'Features', 'Table', 'Uses']);

			// The class: d10, Strength and Wisdom saves, three skills to pick two of.
			await o.page.locator(`${panel} input[data-field="Name"]`).fill('Hearth Warden');
			await o.page.locator(`${panel} [data-key="hitDie"] .eb-seg-btn`, { hasText: 'd10' }).click();
			for (const a of ['STR', 'WIS']) await o.page.locator(`${panel} [data-key="saves"] .eb-pick[data-value="${a}"]`).click();
			await o.page.locator(`${B} .eb-dot`, { hasText: 'Training' }).click();
			for (const a of ['Light Armor', 'Shields']) await o.page.locator(`${panel} [data-key="armor"] .eb-pick[data-value="${a}"]`).click();
			for (const s of ['Athletics', 'Insight', 'Survival']) await o.page.locator(`${panel} [data-key="skillFrom"] .eb-pick[data-value="${s}"]`).click();
			// A feature with two options to choose from, one more at level 6.
			await o.page.locator(`${B} .eb-dot`, { hasText: 'Features' }).click();
			const features = () => o.page.locator(`${panel} [data-key="features"] .eb-list-item[data-depth="0"], ${panel} [data-key="features"] > .eb-control > .eb-list > .eb-list-item`);
			await features().first().locator('input[data-field="Name"]').first().fill('Hearthfire');
			await features().first().locator('textarea[data-field="Text"]').first().fill('As a Bonus Action, you kindle a warding flame around an ally you can see.');
			await o.page.locator(`${panel} [data-key="features"] > .eb-control > .eb-list-add`).click();
			await features().nth(1).locator('input[data-field="Name"]').first().fill('Warding Style');
			for (const name of ['Ember Guard', 'Ash Step']) {
				await features().nth(1).locator('[data-key="options"] .eb-list-add').click();
				await features().nth(1).locator('[data-key="options"] .eb-list-item').last().locator('input[data-field="Name"]').fill(name);
			}
			await features().nth(1).locator('[data-key="more"] .eb-pick[data-value="6"]').click();
			// The table: the subclass is a Warden Circle; the check says what level 3 grants.
			await o.page.locator(`${B} .eb-dot`, { hasText: 'Table' }).click();
			await o.page.locator(`${panel} input[data-field="Subclass called"]`).fill('Warden Circle');
			await o.page.locator(`${B} .eb-check .dnd5e-cb-level`, { hasText: /^3$/ }).click();
			await o.waitFor(async () => /What level 3 grants[\s\S]*Warden Circle/.test(await o.page.locator(`${B} .eb-check`).innerText()), { what: 'the check at level 3' });
			assert.match(await o.page.locator(`${B} .eb-preview .dnd5e-card`).innerText(), /Hearth Warden[\s\S]*Hit Die\s*d10[\s\S]*Saving Throws\s*STR, WIS/);
			assert.deepEqual(await o.page.evaluate(pillOffenders, { root: `${B} .eb-check`, tolerance: 1, selectors: PILL_SELECTORS }), []);
			await o.page.screenshot({ path: join(ARTIFACTS, 'content-builder-class.png') });
			await o.page.locator(`${B} .eb-create`).click();
			await o.page.locator(B).waitFor({ state: 'detached' });
			await o.waitFor(async () => /^```5e-class\nname: Hearth Warden\nhitDie: 10\n/.test(await read(o, cls).catch(() => '')), { what: 'the class note' });
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.enabled('dnd5e').flatMap(p => p.entries.map(e => e.name)))).includes('Hearth Warden'), { what: 'the class in the compendium' });
			// It opened in a tab of its own; the compendium is still there.
			assert.equal(await o.eval((app) => app.workspace.getLeavesOfType('nimble-dnd5e-compendium').length), 1);

			// New subclass: its class is any in the compendium, and its features come at the class's subclass levels.
			await o.eval((app) => { const l = app.workspace.getLeavesOfType('nimble-dnd5e-compendium')[0]; app.workspace.setActiveLeaf(l, { focus: true }); });
			await o.page.locator(`${V} .nimble-cmpx-new`).click();
			await o.page.locator('.menu .menu-item', { hasText: 'New subclass…' }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			await o.page.locator(`${panel} select[data-field="Class"]`).selectOption('Hearth Warden');
			await o.page.locator(`${panel} input[data-field="Name"]`).fill('Circle of Embers');
			await o.page.locator(`${B} .eb-dot`, { hasText: 'Features' }).click();
			await o.waitFor(async () => (await features().count()) === 4, { what: 'a feature at each subclass level' });
			assert.equal(await features().first().locator('select[data-field="Level"]').inputValue(), '3');
			await features().first().locator('input[data-field="Name"]').first().fill('Banked Coals');
			await features().first().locator('textarea[data-field="Text"]').first().fill('Your Hearthfire lingers for 1 round after it ends.');
			await o.page.locator(`${B} .eb-dot`, { hasText: 'Spells' }).click();
			await o.page.locator(`${panel} [data-key="spells"] .eb-list-add`).click();
			await o.page.locator(`${panel} [data-key="spells"] .eb-pick[data-value="Burning Hands"]`).click();
			await o.waitFor(async () => /Level 3[\s\S]*Banked Coals[\s\S]*Burning Hands/.test(await o.page.locator(`${B} .eb-check`).innerText()), { what: 'the subclass check' });
			await o.page.screenshot({ path: join(ARTIFACTS, 'content-builder-subclass.png') });
			await o.page.locator(`${B} .eb-create`).click();
			await o.page.locator(B).waitFor({ state: 'detached' });
			await o.waitFor(async () => /^```5e-subclass\nname: Circle of Embers\nclass: Hearth Warden\nflavor: Warden Circle\n/.test(await read(o, sub).catch(() => '')), { what: 'the subclass note' });

			// The pencil on the class's block reopens it in the builder; Save writes the change back in place.
			await o.openFile(cls, 'preview');
			const edit = o.page.locator(`${R} .ev-content-block .nimble-block-edit`);
			await edit.waitFor({ timeout: 5000 });
			await edit.click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			assert.equal(await o.page.locator(`${panel} input[data-field="Name"]`).inputValue(), 'Hearth Warden');
			assert.equal(await o.page.locator(`${B} .eb-kind`).count(), 1);
			await o.page.locator(`${panel} [data-key="hitDie"] .eb-seg-btn`, { hasText: 'd12' }).click();
			await o.page.locator(`${B} .eb-create`).click();
			await o.page.locator(B).waitFor({ state: 'detached' });
			await o.waitFor(async () => /hitDie: 12\n/.test(await read(o, cls)), { what: 'the class saved in place' });
			assert.match(await read(o, cls), /name: Warding Style\n[\s\S]*name: Ember Guard\n\s+desc: Ember Guard\n\s+group: Warding Style/);
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));

			// New character with the built class, then Level up to 3 for the subclass.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
			await o.page.locator(B).waitFor({ timeout: 3000 });
			await o.page.locator(`${panel} input[data-field="Name"]`).fill('Wren Ashby');
			await o.page.locator(`${panel} select[data-field="Class"]`).selectOption('Hearth Warden');
			await o.page.locator(`${B} .eb-dot`, { hasText: /^Class$/ }).click();
			await o.page.locator(`${panel} .eb-pick[data-value="Ember Guard"]`).click();
			await finish();
			await o.waitFor(async () => (await fm()).class === 'Hearth Warden', { what: 'the hero\'s note' });
			assert.deepEqual((await fm()).choices, ['Ember Guard']);
			await o.openFile(note, 'preview');
			const S = `${R} .dnd5e-sheet`;
			await o.page.locator(S).waitFor({ timeout: 5000 });
			for (const level of [2, 3]) {
				await o.page.locator(`${S} .dnd5e-sheet-actions button`, { hasText: 'Level up' }).click();
				await o.page.locator(B).waitFor({ timeout: 3000 });
				if (level === 3) {
					await o.page.locator(`${B} select[data-field="Subclass"]`).selectOption('Circle of Embers');
					await o.waitFor(async () => /Banked Coals/.test(await o.page.locator(`${B} .eb-preview`).innerText()), { what: 'the subclass feature in the level up' });
				}
				await finish();
				await o.waitFor(async () => (await fm()).level === level, { what: `level ${level}` });
			}
			assert.equal((await fm()).subclass, 'Circle of Embers');
			assert.ok((await fm()).spells.includes('Burning Hands'), 'the subclass\'s spell');
			await o.page.locator(`${S} .dnd5e-tab[data-tab="features"]`).click();
			await o.waitFor(async () => /Banked Coals/.test(await o.page.locator(S).innerText()), { what: 'the subclass feature on the sheet' });
			assert.match(await o.page.locator(S).innerText(), /Hearthfire[\s\S]*Ember Guard/);
			assert.doesNotMatch(await o.page.locator(S).innerText(), /Ash Step/);
			await o.page.screenshot({ path: join(ARTIFACTS, 'content-builder-hero.png') });
		} finally {
			await o.eval(async (app, plugin, [C, F]) => {
				document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
				app.workspace.detachLeavesOfType('nimble-dnd5e-compendium');
				for (const p of [C, F]) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f, true); }
				await plugin.campaigns.setActive(null);
			}, [C, F]);
		}
	});

	// -----------------------------------------------------------------------
	// Campaign and editions

	test('entities 5e: campaign: New campaign makes a 5e campaign; Campaign settings switch 2024 ↔ 2014 and stat blocks, encounter ratings, conditions and the compendium follow', async (o) => {
		const C = 'Campaigns/E5 Edition Vale';
		const note = `${C}/Chapter 1/Wolf Den.md`;
		await scenario(o, 'campaign', [C], async () => {
			await o.eval(async (app, plugin, C) => {
				document.querySelectorAll('.menu, .modal-container').forEach(n => n.remove());
				const old = app.vault.getAbstractFileByPath(C); if (old) await app.vault.delete(old, true);
				plugin.settings.party = [];
				app.commands.executeCommandById('nimble-gm:new-campaign');
			}, C);
			const modal = o.page.locator('.modal.nimble-new-campaign');
			await modal.waitFor({ timeout: 3000 });
			await modal.locator('input[type="text"]').first().fill('E5 Edition Vale');
			await modal.locator('select').first().selectOption({ label: '5e, 2024 rules (SRD 5.2)' });
			await modal.locator('button', { hasText: 'Create campaign' }).click();
			const home = `${C}/E5 Edition Vale.md`;
			await o.waitFor(() => exists(o, home), { what: 'the home note' });
			assert.match(await read(o, home), /system: 5e[\s\S]*edition: 2024/);
			await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.edition(p), home)) === '2024', { what: '2024 resolved' });

			// The panel wears 5e's look and lists the starter folders.
			await o.eval(async (app, plugin, C) => { await plugin.campaigns.setActive(C); await plugin.openCampaignView(); }, C);
			await o.waitFor(async () => (await o.page.locator(CP).evaluate(n => n.classList.contains('ev-sys-dnd5e')).catch(() => false)), { what: 'the panel in 5e\'s look' });
			await o.waitFor(async () => (await panelSections(o)).includes('NPCs'), { what: 'the starter folders' });
			for (const s of ['Sessions', 'Quests', 'NPCs', 'Locations', 'Party', 'Monsters']) assert.ok((await panelSections(o)).includes(s), `${s} in ${await panelSections(o)}`);

			// A scene with a hand-written stat block (no edition: it follows the campaign) and four wolves.
			await write(o, note, [
				'# Wolf Den', '',
				'```5e', 'name: Den Mother', 'size: Large', 'type: Beast', 'ac: 13 (natural armor)', 'hp: 37 (5d10 + 10)', 'speed: 50 ft.',
				'str: 17', 'dex: 15', 'con: 15', 'int: 3', 'wis: 12', 'cha: 7', 'skills: Perception +3, Stealth +4', 'senses: passive Perception 13', 'cr: 1',
				'actions:', '- Bite: Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage.', '```', '',
				'```nimble-encounter', 'name: The den', 'monsters:', '- 4 Wolf', '```', '',
			].join('\n'));
			await o.openFile(note, 'preview');
			const block = view(o, '.dnd5e-statblock');
			const enc = view(o, '.dnd5e-encounter');
			await o.waitFor(async () => (await block.count()) === 1 && (await enc.count()) === 1, { what: 'the stat block and the encounter' });
			assert.ok(await block.evaluate(el => el.classList.contains('ed-2024')), '2024 layout');
			assert.match(await block.innerText(), /AC\s*13[\s\S]*Initiative\s*\+2/);
			// Four level 1 heroes: 2024's budget is Low 200, Moderate 300, High 400. Four wolves are 200 XP.
			await o.waitFor(async () => /^Low · 50%$/i.test(await enc.locator('.nimble-difficulty').innerText().catch(() => '')), { what: 'Low by the 2024 budget' });
			assert.match(await enc.locator('.dnd5e-encounter-sum').innerText(), /^200 XP$/);
			const conditionNames = () => o.eval((app, plugin, p) => plugin.system(p).conditions(plugin.edition(p)).map(c => c.name), note);
			assert.ok((await conditionNames()).includes('Burning'), '2024 has Burning');

			// Campaign settings: 2014 rules. The block lays out the 2014 way, and the fight is rated by thresholds × the multiplier.
			await o.page.locator(`${CP} .campaign-switch-btn`).first().click();
			await clickMenu(o, 'Campaign settings…');
			const settings = o.page.locator('.modal.nimble-campaign-settings');
			await settings.waitFor({ timeout: 3000 });
			const select = settings.locator('select').filter({ has: o.page.locator('option', { hasText: '5e, 2014 rules' }) });
			assert.equal(await select.inputValue(), 'dnd5e:2024');
			await select.selectOption({ label: '5e, 2014 rules (SRD 5.1)' });
			await settings.locator('button', { hasText: 'Save' }).click();
			await o.waitFor(async () => /edition: "?2014/.test(await read(o, home)), { what: 'edition: 2014 written' });
			await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.edition(p), note)) === '2014', { what: `2014 resolved for the note (${await o.eval((app, plugin, p) => JSON.stringify([plugin.edition(p), plugin.campaigns.campaigns.find(c => p.startsWith(c.folder + '/'))?.edition]), note)})` });
			await o.waitFor(async () => (await block.evaluate(el => el.classList.contains('ed-2014')).catch(() => false)), { what: 'the block redrawn the 2014 way' });
			assert.match(await block.innerText(), /Armor Class\s*13 \(natural armor\)[\s\S]*Hit Points\s*37 \(5d10 \+ 10\)[\s\S]*Challenge\s*1 \(200 XP\)/);
			// 2014: Easy 100, Medium 200, Hard 300, Deadly 400 for four level 1 heroes; four monsters count double.
			await o.waitFor(async () => /^Deadly · 100%$/i.test(await enc.locator('.nimble-difficulty').innerText().catch(() => '')), { what: 'Deadly by the 2014 thresholds' });
			assert.match(await enc.locator('.dnd5e-encounter-sum').innerText(), /200 × 2 = 400 XP/);
			assert.match(await enc.locator('.nimble-difficulty').getAttribute('aria-label') ?? await enc.locator('.nimble-difficulty').getAttribute('title'), /2014 rules/);
			// 2014's conditions (no Burning), and the compendium opens on the 2014 rules.
			assert.equal((await conditionNames()).includes('Burning'), false, '2014 has no Burning');
			assert.equal((await conditionNames()).length, 15);
			await compendium(o, 'Spells', 'fireball');
			assert.match(await o.page.locator(`${CV} .dnd5e-cmp-editions button.is-active`).innerText(), /2014/);
			await o.waitFor(async () => /3rd-level evocation/.test(await o.page.locator(`${CV} .nimble-cmpx-detail .dnd5e-card-line`).innerText().catch(() => '')), { what: '2014 Fireball' });
			await shot(o, 'edition-2014');

			// And back to 2024: everything follows again.
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));
			await o.openFile(note, 'preview');
			await o.page.locator(`${CP} .campaign-switch-btn`).first().click();
			await clickMenu(o, 'Campaign settings…');
			await settings.waitFor({ timeout: 3000 });
			await settings.locator('select').filter({ has: o.page.locator('option', { hasText: '5e, 2014 rules' }) }).selectOption({ label: '5e, 2024 rules (SRD 5.2)' });
			await settings.locator('button', { hasText: 'Save' }).click();
			await o.waitFor(async () => /edition: "?2024/.test(await read(o, home)), { what: 'edition: 2024 written' });
			await o.waitFor(async () => (await block.evaluate(el => el.classList.contains('ed-2024')).catch(() => false)), { what: 'the 2024 layout again' });
			await o.waitFor(async () => /^Low · 50%$/i.test(await enc.locator('.nimble-difficulty').innerText().catch(() => '')), { what: 'Low again' });
		});
	});

	// -----------------------------------------------------------------------
	// NPCs

	test('entities 5e: NPC (2024): New NPC from the panel, its mini sheet from a stat block, edited, rolled, linked, found and added to the fight', async (o) => {
		const C = 'Campaigns/E5 Harbour';
		const npc = `${C}/NPCs/Marta Vey.md`;
		const scene = `${C}/Chapter 1/The Quay.md`;
		await scenario(o, 'npc', [C], async () => {
			await campaign5e(o, 'E5 Harbour', { edition: '2024', level: 3 });
			// Create: the NPCs folder's + opens New with NPC picked.
			await h.openPicker(o, `${C}/NPCs`);
			await h.createFromPicker(o, 'Marta Vey');
			await o.waitFor(() => exists(o, npc), { what: 'the NPC note' });
			const text = await read(o, npc);
			assert.match(text, /nimble: npc[\s\S]*ac: ""\nhp: ""\ncr: ""\nstatblock: ""\n---/);
			assert.match(text, /```nimble-npc\n/);
			// It opens for editing; Live Preview draws the card with the story NPC's quiet line.
			await o.waitFor(async () => (await lp(o, '.nimble-npc-card .dnd5e-npc-stats.is-empty').count()) === 1, { what: 'the card in Live Preview' });
			assert.match(await lp(o, '.nimble-npc-card .dnd5e-npc-stats').innerText(), /A story NPC: no stats/);

			// From a stat block: the picker lists 5e monsters; the card becomes the Bandit Captain's sheet.
			await o.openFile(npc, 'preview');
			const card = view(o, '.nimble-npc-card');
			await card.locator('.dnd5e-npc-stats button', { hasText: 'From a stat block' }).click();
			await o.page.locator('.prompt-input').fill('bandit captain');
			await o.waitFor(async () => /Bandit Captain/.test(await o.page.locator('.suggestion-item.is-selected').innerText().catch(() => '')), { what: 'the Bandit Captain offered' });
			await o.page.keyboard.press('Enter');
			await waitFm(o, npc, fm => fm.statblock === 'Bandit Captain', 'statblock: Bandit Captain');
			const captain = await o.eval((app, plugin, p) => { const m = plugin.runtime('dnd5e').get('Bandit Captain', p).monster; return { ac: m.ac, hp: m.hp }; }, npc);
			const stats = card.locator('.dnd5e-npc-stats');
			await o.waitFor(async () => /From[\s\S]*Bandit Captain/.test(await stats.locator('.dnd5e-npc-src').innerText().catch(() => '')), { what: 'the sheet from the Bandit Captain' });
			assert.equal(await stats.locator('.dnd5e-npc-ac b').innerText(), String(captain.ac));
			assert.equal(await stats.locator('.dnd5e-npc-hp-bar-max').innerText(), String(captain.hp));
			assert.equal(await stats.locator('.dnd5e-npc-ab').count(), 6);

			// Edit: her own AC and HP in the properties, a role and a faction; the card says which numbers are hers.
			await setFm(o, npc, { ac: 17, hp: '45 (6d8 + 18)', role: 'Harbour master', faction: 'The Salt Guild' });
			await o.waitFor(async () => (await stats.locator('.dnd5e-npc-ac b').innerText().catch(() => '')) === '17', { what: 'her own AC' });
			assert.match(await stats.locator('.dnd5e-npc-src').innerText(), /AC and HP are (her|their) own/i);
			assert.equal(await stats.locator('.dnd5e-npc-hp-bar-max').innerText(), '45');
			assert.match(await card.locator('.nimble-npc-role').innerText(), /Harbour master/i);
			assert.match(await card.innerText(), /Faction\s*The Salt Guild/i);
			// The attitude pill changes with a click.
			await card.locator('.nimble-npc-pill.npc-attitude').click();
			await clickMenu(o, 'Hostile');
			await waitFm(o, npc, fm => fm.attitude === 'hostile', 'attitude: hostile');
			// A secret row in her block is blurred for a shared screen.
			await o.eval(async (app, _p, p) => { const f = app.vault.getAbstractFileByPath(p); await app.vault.modify(f, (await app.vault.read(f)).replace('```nimble-npc\n', '```nimble-npc\nsecret: She sells the harbour\'s tide tables to smugglers.\n')); }, npc);
			await o.waitFor(async () => (await card.locator('.nimble-npc-field.is-secret').count()) === 1, { what: 'the secret row' });

			// Use the sheet: a save, an attack, initiative; the HP bar keeps what's left in hp_now.
			await o.eval((app, plugin) => { plugin.settings.rollLog = []; });
			await stats.locator('.dnd5e-npc-save').first().click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Marta Vey: Strength save', { what: 'a save rolled' });
			await stats.locator('.dnd5e-npc-roll').first().click();
			await o.waitFor(async () => /^Marta Vey: .+ \(attack\)$/.test((await lastRoll(o))?.label ?? ''), { what: 'an attack rolled' });
			await stats.locator('.dnd5e-npc-fact.is-roll').click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Marta Vey: initiative', { what: 'initiative rolled' });
			await stats.locator('.ns-meter-step[aria-label="Take 1 damage"]').click();
			await waitFm(o, npc, fm => fm.hp_now === 44, 'hp_now 44');
			// Stats folds it to one line, and back.
			await stats.locator('.dnd5e-npc-fold').click();
			await o.waitFor(async () => (await card.locator('.dnd5e-npc-sum').count()) === 1, { what: 'folded' });
			await card.locator('.dnd5e-npc-fold').click();
			await o.waitFor(async () => (await card.locator('.dnd5e-npc-ab').count()) === 6, { what: 'unfolded' });
			await shot(o, 'npc-card', card);
			const bad = [];
			await measurePills(o, bad, 'NPC mini sheet', `${MAIN} ${R} .nimble-npc-card`);
			assert.deepEqual(bad, [], 'misaligned pills');

			// Link: a scene with a [[link]] and a plain mention. The link is a chip that opens a quick look; the mention is linked as you read.
			await write(o, scene, '# The Quay\n\nAsk [[Marta Vey]] about the ships. The dockhands say Marta Vey never sleeps.\n');
			await o.openFile(scene, 'preview');
			await o.waitFor(async () => (await view(o, 'a.nimble-npc-link').count()) === 1 && (await view(o, '.nimble-npc-mention').count()) === 1, { what: 'the chip and the mention' });
			await view(o, 'a.nimble-npc-link').click();
			const look = o.page.locator('.modal.nimble-record-modal');
			await look.waitFor({ timeout: 3000 });
			assert.match(await look.locator('.record-title').innerText(), /Marta Vey/);
			await o.page.keyboard.press('Escape');
			await look.waitFor({ state: 'detached', timeout: 3000 });

			// /npc links her from any note in the campaign.
			await editAtEnd(o, scene);
			await type(o, 'Then /npc mart');
			await o.waitFor(async () => (await slashTitles(o)).some(t => /Marta Vey/.test(t)), { what: '/npc offers her' });
			await o.page.keyboard.press('Enter');
			await o.waitFor(async () => /Then \[\[Marta Vey\]\]/.test(await editorText(o)), { what: 'the link written' });

			// Find: the panel lists her under NPCs; Spotlight finds her.
			await crow(o, npc).waitFor();
			await spotlight(o, 'marta', r => r.some(t => /Marta Vey/.test(t)));
			await o.page.keyboard.press('Escape');
			await tidy(o);

			// Use: Add to fight puts her in the 5e tracker on her own AC and the HP she has left, with the captain's actions.
			await o.openFile(npc, 'preview');
			await view(o, '.nimble-npc-card button.dnd5e-npc-fight').click();
			await o.page.locator(TR).waitFor({ timeout: 5000 });
			await o.waitFor(async () => (await fight(o)).length === 1, { what: 'Marta in the fight' });
			const [m] = await fight(o);
			assert.deepEqual([m.label, m.ac, m.hp, m.maxHp], ['Marta Vey', 17, 44, 45]);
			assert.ok(await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants[0].monster.actions.length > 0), 'the stat block\'s actions came along');
		});
	});

	// -----------------------------------------------------------------------
	// Locations, quests and sessions

	test('entities 5e: location, quest and session (2014): made from the panel and commands, their cards, links both ways, open quests, /quest, finished and failed', async (o) => {
		const C = 'Campaigns/E5 Saltmarsh';
		const place = `${C}/Locations/The Salt Stair.md`;
		const chapel = `${C}/Locations/The Drowned Chapel.md`;
		const ferryman = `${C}/NPCs/Old Brannoc.md`;
		const quest = `${C}/Quests/The Drowned Bell.md`;
		const tithe = `${C}/Quests/The Smugglers' Tithe.md`;
		const scene = `${C}/Chapter 1/Opening Scene.md`;
		const session = `${C}/Sessions/Session 1.md`;
		const prompt = o.page.locator('.modal.nimble-name-prompt');
		const byCommand = async (id, name) => {
			await o.eval((app, _p, id) => { app.commands.executeCommandById(id); }, id);
			await prompt.waitFor({ timeout: 3000 });
			await prompt.locator('input').fill(name);
			await prompt.locator('input').press('Enter');
			await prompt.waitFor({ state: 'detached', timeout: 3000 });
		};
		await scenario(o, 'world', [C], async () => {
			await campaign5e(o, 'E5 Saltmarsh', { edition: '2014', level: 2 });

			// A location from the Locations folder's +: 5e places get a read-aloud, and open on their card (Live Preview too).
			await h.openPicker(o, `${C}/Locations`);
			await h.createFromPicker(o, 'The Salt Stair', 'location');
			await o.waitFor(() => exists(o, place), { what: 'the location note' });
			assert.match(await read(o, place), /nimble: location[\s\S]*read_aloud: ""[\s\S]*---\n\n```nimble-note\n```\n/);
			await o.waitFor(async () => (await lp(o, '.ev-cq.kind-location').count()) === 1, { what: 'the place card in Live Preview' });
			// Another place from the command, and an NPC who lives on the stair.
			await byCommand('nimble-gm:new-location', 'The Drowned Chapel');
			await o.waitFor(() => exists(o, chapel), { what: 'the second place' });
			await byCommand('nimble-gm:new-npc', 'Old Brannoc');
			await o.waitFor(() => exists(o, ferryman), { what: 'the NPC' });
			await setFm(o, ferryman, { role: 'Ferryman', location: '[[The Salt Stair]]' });
			await setFm(o, place, { type: 'stairway', region: 'The Drowned Quarter', read_aloud: 'Worn steps run down into black water. A bell tolls somewhere below.', secret: 'The ninth step is hollow.', leads: ['[[The Drowned Chapel]]'] });

			// The place's card: read aloud, region, who's here (from the NPC's location:), where it leads, the GM's secret.
			await o.openFile(place, 'preview');
			const pc = view(o, '.ev-cq.kind-location');
			await o.waitFor(async () => /Old Brannoc/.test(await pc.locator('.ev-cq-whos').innerText().catch(() => '')), { what: 'who\'s here' });
			assert.ok(await pc.evaluate(n => !!n.closest('.ev-sys-dnd5e')), 'the card in 5e\'s look');
			assert.match(await pc.locator('.ev-cq-kicker').innerText(), /Location · Stairway/i);
			assert.match(await pc.locator('.ev-cq-read').innerText(), /Read aloud[\s\S]*Worn steps run down into black water/i);
			assert.match(await pc.locator('.ev-cq-facts').innerText(), /Region\s*The Drowned Quarter/i);
			assert.match(await pc.locator('.ev-cq-leads').innerText(), /The Drowned Chapel/);
			assert.match(await pc.locator('.ev-cq-secret').innerText(), /ninth step/);
			await shot(o, 'location-card', pc);
			// Both ways: the name on the place's card opens the NPC, whose card says where they're found.
			await pc.locator('.ev-cq-whos a.internal-link', { hasText: 'Old Brannoc' }).first().click();
			await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.path)) === ferryman, { what: 'the NPC opened from the place' });
			await o.waitFor(async () => /Found at[\s\S]*The Salt Stair/i.test(await view(o, '.nimble-npc-card').innerText().catch(() => '')), { what: 'Found at on the NPC card' });
			assert.equal(await view(o, '.nimble-npc-card a.nimble-note-link.kind-location, .nimble-npc-card a.internal-link').filter({ hasText: 'The Salt Stair' }).count(), 1, 'the place is a link on the NPC card');

			// A quest from the Quests folder's +: Quest is picked for you.
			await h.openPicker(o, `${C}/Quests`);
			await h.createFromPicker(o, 'The Drowned Bell');
			await o.waitFor(() => exists(o, quest), { what: 'the quest note' });
			const qText = await read(o, quest);
			assert.match(qText, /nimble: quest\nstatus: available[\s\S]*## Objectives[\s\S]*## The truth/);
			await write(o, quest, qText.replace(/## Objectives\n- \[ \] [^\n]*/, '## Objectives\n- [ ] Find the bell\n- [ ] Ring it at low tide').replace("*What's really going on, that the heroes don't know yet.*", 'The bell calls the drowned up the stair.'));
			await setFm(o, quest, { status: 'active', type: 'main', giver: '[[Old Brannoc]]', location: '[[The Salt Stair]]', reward: '50 gp and free passage' });
			await o.openFile(quest, 'preview');
			const qc = view(o, '.ev-cq.kind-quest');
			await o.waitFor(async () => /Given by[\s\S]*Old Brannoc[\s\S]*Where[\s\S]*The Salt Stair[\s\S]*Reward[\s\S]*50 gp and free passage/i.test(await qc.locator('.ev-cq-facts').innerText().catch(() => '')), { what: 'the quest card\'s facts' });
			assert.match(await qc.locator('.ev-cq-kicker').innerText(), /Main quest/i);
			assert.match(await qc.locator('.ev-cq-stamp.is-active').innerText(), /active/i);
			assert.deepEqual(await qc.locator('.ev-cq-objs li').allInnerTexts(), ['Find the bell', 'Ring it at low tide']);
			assert.match(await qc.locator('.ev-cq-secret').innerText(), /calls the drowned/);
			await qc.locator('.ev-cq-objs li', { hasText: 'Find the bell' }).locator('.ev-cq-box').click();
			await o.waitFor(async () => /- \[x\] Find the bell/.test(await read(o, quest)), { what: 'the objective ticked in the note' });
			await shot(o, 'quest-card', qc);
			// The panel lists it among the open quests, active.
			const openQuests = o.page.locator(`${CP} .campaign-quest`);
			await o.waitFor(async () => (await openQuests.count()) === 1, { what: 'one open quest in the panel' });
			assert.equal(await openQuests.locator('.campaign-quest-dot.is-active').count(), 1);
			assert.match(await o.page.locator(`${CP} .campaign-heading-quests`).innerText(), /1 open/i);

			// /quest links it from a scene, where it's an orange pill with a flag (and the NPC a chip).
			await editAtEnd(o, scene);
			await type(o, 'Brannoc wants /quest drown');
			await o.waitFor(async () => (await slashTitles(o)).join() === 'The Drowned Bell', { what: '/quest finds it' });
			await o.page.keyboard.press('Enter');
			await o.waitFor(async () => /Brannoc wants \[\[The Drowned Bell\]\]/.test(await editorText(o)), { what: 'the quest link written' });
			await o.openFile(scene, 'preview');
			await o.waitFor(async () => (await view(o, 'a.nimble-note-link.kind-quest').count()) === 1, { what: 'the quest pill' });

			// A session from the Sessions folder's +: named for you, dated, with quests, loot and next time on its card.
			await h.openPicker(o, `${C}/Sessions`);
			assert.equal(await o.page.locator('.nimble-new-note .nimble-name-input').inputValue(), 'Session 1');
			await o.page.locator('.nimble-new-note .nimble-name-input').press('Enter');
			await o.waitFor(() => exists(o, session), { what: 'the session log' });
			const sText = await read(o, session);
			assert.match(sText, /nimble: session\n[\s\S]*date: \d{4}-\d\d-\d\d[\s\S]*quests: \[\][\s\S]*```nimble-note/);
			await write(o, session, sText.replace('*What happened, for next time.*', '- Met [[Old Brannoc]] on the stair.\n- Heard the bell.'));
			await setFm(o, session, { quests: ['[[The Drowned Bell]] new'], loot: ['A rusted bell clapper'], next: 'Down the stair at low tide.' });
			await o.openFile(session, 'preview');
			const sc = view(o, '.ev-cq.kind-session');
			await o.waitFor(async () => /The Drowned Bell\s*New/i.test(await sc.locator('.ev-cq-thread').innerText().catch(() => '')), { what: 'the quest it moved' });
			assert.match(await sc.locator('.ev-cq-recap').innerText(), /Met Old Brannoc on the stair[\s\S]*Heard the bell/);
			assert.match(await sc.locator('.ev-cq-loot').innerText(), /rusted bell clapper/);
			assert.match(await sc.locator('.ev-cq-next').innerText(), /low tide/);
			// The recap is on the card, so the page doesn't show it twice.
			await o.waitFor(async () => (await o.page.locator(`${MAIN} ${R} .markdown-preview-sizer > .ev-on-card`).filter({ visible: false }).count()) >= 1, { what: 'the recap section left to the card' });

			// Finished: it leaves the open quests, is ticked at the bottom of its folder, and its pill ticks.
			await setFm(o, quest, { status: 'completed' });
			await o.waitFor(async () => (await openQuests.count()) === 0, { what: 'no open quests' });
			await o.waitFor(async () => crow(o, quest).evaluate(el => el.classList.contains('is-quest-done')).catch(() => false), { what: 'the quest ticked in the panel' });
			await o.openFile(scene, 'preview');
			await o.waitFor(async () => (await view(o, 'a.nimble-note-link.kind-quest.is-quest-done').count()) === 1, { what: 'the quest pill ticked' });
			// Failed: crossed out.
			await byCommand('nimble-gm:new-quest', "The Smugglers' Tithe");
			await o.waitFor(() => exists(o, tithe), { what: 'the second quest' });
			await o.waitFor(async () => (await openQuests.count()) === 1, { what: 'the new quest is open' });
			await setFm(o, tithe, { status: 'failed' });
			await o.waitFor(async () => crow(o, tithe).evaluate(el => el.classList.contains('is-quest-failed')).catch(() => false), { what: 'the failed quest crossed out' });
			assert.equal(await openQuests.count(), 0);
		});
	});

	// -----------------------------------------------------------------------
	// Characters

	test('entities 5e: character (2024): Add a hero in the Party section makes a fighter; the sheet in reading view and Live Preview; attacks, uses, HP, rests, a condition, level up; the party, its card and the encounter maths follow', async (o) => {
		const C = 'Campaigns/E5 Shieldwall';
		const pc = `${C}/Party/Bryn Ashby.md`;
		const SH = (sel = '') => view(o, `.dnd5e-sheet ${sel}`);
		await scenario(o, 'character-2024', [C], async () => {
			await campaign5e(o, 'E5 Shieldwall', { edition: '2024', level: 1 });
			// Create: the Party section's Add a hero opens 5e's New character.
			await o.page.locator(`${CP} .campaign-roster-head [aria-label="Add a hero"]`).click();
			await fillCharacter(o, {
				name: 'Bryn Ashby', className: 'Fighter', species: 'Dwarf', background: 'Soldier',
				skills: ['Perception', 'Survival'], languages: ['Dwarvish', 'Giant'], masteries: ['Greatsword', 'Flail', 'Javelin'],
			});
			const fm0 = await waitFm(o, pc, fm => fm.class === 'Fighter', 'the fighter\'s note');
			assert.equal(fm0.edition, '2024');
			assert.equal(fm0.level, 1);
			assert.ok(fm0.inventory.some(i => (i.name ?? i) === 'Chain Mail' && i.equipped), `chain mail worn: ${JSON.stringify(fm0.inventory)}`);
			assert.match(await read(o, pc), /```5e-sheet\n```/);

			// See: the sheet in reading view, the note's title and properties stepping aside.
			await o.openFile(pc, 'preview');
			await SH().waitFor({ timeout: 5000 });
			assert.match(await SH('.dnd5e-sheet-sub').innerText(), /Level 1[\s\S]*Dwarf[\s\S]*Fighter/i);
			assert.match(await SH().innerText(), /Soldier background/i);
			assert.match(await SH('.dnd5e-sheet-box').filter({ hasText: 'AC' }).innerText(), /16/);
			// Actions: the greatsword from the starting equipment, its to-hit and damage roll.
			await SH('.dnd5e-tab[data-tab="actions"]').click();
			const sword = SH('.dnd5e-sheet-attack').filter({ hasText: 'Greatsword' });
			await sword.waitFor();
			const str = Math.floor((fm0.str - 10) / 2);
			assert.match(await sword.locator('.dnd5e-act-hit').innerText(), new RegExp(`\\+${str + 2}`));
			await sword.locator('.dnd5e-act-hit button').click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Bryn Ashby: Greatsword (attack)', { what: 'the greatsword attack rolled' });
			assert.equal((await lastRoll(o)).expression, `1d20+${str + 2}`);
			await sword.locator('.dnd5e-dmg').click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Bryn Ashby: Greatsword damage', { what: 'the greatsword damage rolled' });
			assert.match((await lastRoll(o)).expression, /^2d6/);
			// Limited use: Second Wind's pip spends one.
			const wind = SH('.dnd5e-sheet-attack').filter({ hasText: 'Second Wind' });
			await wind.locator('.ev-pip.is-on').first().click();
			await waitFm(o, pc, fm => fm.uses_spent?.['Second Wind'] === 1, 'Second Wind used');
			// HP: 5 damage on the keypad.
			await SH('.ns-meter-calc').click();
			await o.page.locator('.nimble-hp-pad').waitFor();
			await o.page.keyboard.type('5');
			await o.page.keyboard.press('Enter');
			await waitFm(o, pc, fm => fm.hp === fm0.hp_max - 5, 'HP down 5');
			// A condition from the 2024 list.
			await SH('.dnd5e-sheet-condition-add').click();
			await clickMenu(o, 'Prone');
			await waitFm(o, pc, fm => JSON.stringify(fm.conditions) === '["Prone"]', 'Prone');
			// Short rest: a hit die heals, and Second Wind comes back (one use per short rest in 2024).
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Short rest' }).click();
			const rested = await waitFm(o, pc, fm => fm.hit_dice_used === 1, 'a hit die spent on the short rest');
			assert.ok(rested.hp > fm0.hp_max - 5, `healed: ${rested.hp}`);
			assert.equal(rested.uses_spent, undefined, 'Second Wind back');
			// Long rest: full HP, hit dice back.
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Long rest' }).click();
			await waitFm(o, pc, fm => fm.hp === fm0.hp_max && fm.hit_dice_used === undefined, 'the long rest');
			await shot(o, 'sheet-2024');

			// Live Preview draws the same sheet.
			await o.openFile(pc, 'source');
			await o.waitFor(async () => (await lp(o, '.dnd5e-sheet').count()) === 1, { what: 'the sheet in Live Preview' });

			// Level up: level 2 brings Action Surge.
			await o.openFile(pc, 'preview');
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Level up' }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			assert.match(await o.page.locator(`${B} .eb-preview`).innerText(), /Bryn Ashby[\s\S]*level 1 → 2/);
			await finish(o);
			const fm2 = await waitFm(o, pc, fm => fm.level === 2, 'level 2');
			assert.ok(fm2.hp_max > fm0.hp_max);
			await SH('.dnd5e-tab[data-tab="features"]').click();
			await o.waitFor(async () => /Action Surge/.test(await SH().innerText()), { what: 'Action Surge on the sheet' });

			// The party: the panel's card for the sheet, with HP; the encounter party is read from it.
			const hero = o.page.locator(`${CP} .campaign-hero[data-path="${pc}"]`);
			await o.waitFor(async () => /Bryn Ashby/.test(await hero.innerText().catch(() => '')), { what: 'the hero card in the panel' });
			assert.match(await hero.locator('.campaign-hero-hp-text').innerText(), new RegExp(`^${fm2.hp ?? fm2.hp_max}/${fm2.hp_max}$`));
			await o.waitFor(async () => JSON.stringify(await o.eval((app, plugin) => plugin.settings.party.map(p => [p.name, p.level, p.maxHp, p.defense]))) === JSON.stringify([['Bryn Ashby', 2, fm2.hp_max, 16]]), { what: 'the encounter party from the sheet' });
			const fightNote = `${C}/Chapter 1/Ogre Bridge.md`;
			await write(o, fightNote, '```nimble-encounter\nname: Ogre bridge\nmonsters:\n- Ogre\n```\n');
			await o.openFile(fightNote, 'preview');
			await o.waitFor(async () => /1 hero, level 2/.test(await view(o, '.dnd5e-encounter-party').innerText().catch(() => '')), { what: 'the block rated for the hero' });
			// A link to the sheet is a party pill (a shield).
			await write(o, fightNote, '```nimble-encounter\nname: Ogre bridge\nmonsters:\n- Ogre\n```\n\n[[Bryn Ashby]] holds the bridge.\n');
			await o.waitFor(async () => (await view(o, 'a.nimble-note-link.kind-character').count()) === 1, { what: 'the party pill' });
			// Clicking the card in the panel opens the sheet.
			await hero.click();
			await o.waitFor(async () => (await o.eval((app) => app.workspace.getActiveFile()?.path)) === pc, { what: 'the sheet opened from the panel' });
		});
	});

	test('entities 5e: character (2014): New character makes a hill dwarf cleric with a domain at level 1 and prepared spells; short and long rests the 2014 way; level 2 brings Channel Divinity', async (o) => {
		const C = 'Campaigns/E5 Old Faith';
		const pc = `${C}/Party/Hilde Stonebrow.md`;
		const SH = (sel = '') => view(o, `.dnd5e-sheet ${sel}`);
		await scenario(o, 'character-2014', [C], async () => {
			await campaign5e(o, 'E5 Old Faith', { edition: '2014', level: 1 });
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
			await o.page.locator(B).waitFor({ timeout: 3000 });
			// 2014 words: Race and Subrace.
			assert.equal(await o.page.locator(`${PANEL} select[data-field="Race"]`).count(), 1);
			await fillCharacter(o, {
				name: 'Hilde Stonebrow', className: 'Cleric', species: 'Dwarf', subspecies: 'Hill Dwarf', background: 'Acolyte',
				skills: ['Medicine', 'History'], subclass: 'Life', fillSpells: true,
			});
			const fm0 = await waitFm(o, pc, fm => fm.class === 'Cleric', 'the cleric\'s note');
			assert.equal(String(fm0.edition), '2014');
			assert.equal(fm0.subclass, 'Life');
			assert.match(String(fm0.species ?? fm0.race ?? ''), /Dwarf/);
			assert.ok((fm0.spells ?? []).length >= 3, `spells: ${JSON.stringify(fm0.spells)}`);
			await o.openFile(pc, 'preview');
			await SH().waitFor({ timeout: 5000 });
			assert.match(await SH('.dnd5e-sheet-sub').innerText(), /Level 1[\s\S]*Hill Dwarf[\s\S]*Cleric/i);
			// The domain's level 1 feature, and Wisdom spellcasting with two level 1 slots.
			await SH('.dnd5e-tab[data-tab="features"]').click();
			await o.waitFor(async () => /Disciple of Life/.test(await SH().innerText()), { what: 'the Life Domain feature' });
			await SH('.dnd5e-tab[data-tab="spells"]').click();
			assert.match(await SH('.dnd5e-sheet-cast').innerText(), /Spellcasting\s*Wisdom/i);
			assert.deepEqual(await SH('.dnd5e-slot-group').evaluateAll(gs => gs.map(g => g.querySelectorAll('.ev-pip').length)), [2]);
			await SH('.dnd5e-slot-group').first().locator('.ev-pip.is-on').first().click();
			await waitFm(o, pc, fm => JSON.stringify(fm.slots_used) === '[1]', 'a slot spent');

			// Level 2: Channel Divinity, once per short rest.
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Level up' }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			await finish(o);
			await waitFm(o, pc, fm => fm.level === 2, 'level 2');
			await SH('.dnd5e-tab[data-tab="actions"]').click();
			const channel = SH('.dnd5e-sheet-attack').filter({ hasText: 'Channel Divinity' });
			await o.waitFor(async () => (await channel.count()) >= 1, { what: 'Channel Divinity on the sheet' });
			await channel.first().locator('.ev-pip.is-on').first().click();
			await waitFm(o, pc, fm => Object.values(fm.uses_spent ?? {}).some(n => n >= 1), 'Channel Divinity used');
			// A short rest brings it back; slots stay spent (a cleric's come back on a long rest).
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Short rest' }).click();
			const short = await waitFm(o, pc, fm => fm.uses_spent === undefined && fm.hit_dice_used === 1, 'Channel Divinity back after a short rest');
			assert.equal(JSON.stringify(short.slots_used), '[1]');
			// Spend the last hit die; a 2014 long rest brings back half your level in hit dice (1 at level 2).
			await SH('.ev-pips.is-hit-dice .ev-pip.is-on').first().click();
			await waitFm(o, pc, fm => fm.hit_dice_used === 2, 'both hit dice spent');
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Long rest' }).click();
			const long = await waitFm(o, pc, fm => fm.slots_used === undefined && fm.hit_dice_used === 1, 'a 2014 long rest: one hit die back');
			assert.equal(long.hp, long.hp_max);
			await shot(o, 'sheet-2014');
		});
	});
}
