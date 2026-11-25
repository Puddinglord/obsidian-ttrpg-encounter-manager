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
// returns without failing. (None are open now.)

import { readFileSync } from 'node:fs';

export function register(test, h) {
	const { importAndClose } = h;
	const { R, S, ARTIFACTS, ROOT, assert, join, exact, read, exists, clickMenu, CP, cgroup, crow, panelSections, cmpNames, cmpRow, hpPad5e, measurePills, pillOffenders, PILL_SELECTORS } = h;

	const TR = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
	const CV = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
	const B = '.modal.nimble-entity-builder';
	const PANEL = `${B} .eb-panel.is-active`;
	const SP = '.modal-container .prompt.nimble-omnisearch';
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
	const fight = (o) => o.eval((app, plugin) => plugin.runtime('dnd5e').fights.fight.combatants.map(c => ({ label: c.label, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac, init: c.init, side: c.side, conditions: c.conditions.map(x => x.name), legendary: c.legendary, resistances: c.resistances, death: c.deathSaves, concentrating: !!c.concentrating, rounds: Object.fromEntries(c.conditions.map(x => [x.name, x.rounds])) })));
	const fightState = (o) => o.eval((app, plugin) => { const f = plugin.runtime('dnd5e').fights.fight; return { round: f.round, turn: f.combatants.find(c => c.id === f.turnId)?.label ?? null }; });
	const row5e = (o, name) => o.page.locator(`${TR} .dnd5e-combatant`, { has: o.page.locator('.dnd5e-combatant-name', { hasText: exact(name) }) });

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

	/** Open Omnisearch with a query; returns the rows' text. */
	async function omnisearch(o, query, until) {
		await o.eval((app) => { document.querySelectorAll('.modal-container').forEach(n => n.remove()); app.commands.executeCommandById('nimble-gm:spotlight'); });
		await o.page.locator(`${SP} .prompt-input`).waitFor();
		await o.page.locator(`${SP} .prompt-input`).fill(query);
		let rows = [];
		await o.waitFor(async () => { rows = await o.page.locator(`${SP} .suggestion-item`).allInnerTexts(); return until(rows); }, { what: `Omnisearch for "${query}"` });
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
	/** In 5e's compendium dialog (a picker): search, wait for `name` to be the selected row, Enter. */
	async function pickInCompendium(o, query, name) {
		const M = '.modal.dnd5e-cmpx-modal';
		await o.page.locator(`${M} .nimble-cmpx-input`).waitFor({ timeout: 3000 });
		await o.page.locator(`${M} .nimble-cmpx-input`).fill(query);
		await o.waitFor(async () => (await o.page.locator(`${M} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === name, { what: `${name} selected in the compendium` });
		await o.page.keyboard.press('Enter');
		await o.page.locator(M).waitFor({ state: 'detached' });
	}

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

			// From a stat block: the compendium, on its Monsters tab, is the picker; the card becomes the Bandit Captain's sheet.
			await o.openFile(npc, 'preview');
			const card = view(o, '.nimble-npc-card');
			await card.locator('.dnd5e-npc-stats button', { hasText: 'From a stat block' }).click();
			const cmp = o.page.locator('.modal.dnd5e-cmpx-modal');
			await cmp.waitFor();
			assert.equal(await cmp.locator('.modal-title').innerText(), 'Stats for Marta Vey');
			assert.equal(await cmp.evaluate(el => el.classList.contains('ev-sys-dnd5e')), true);
			await pickInCompendium(o, 'bandit captain', 'Bandit Captain');
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

			// Find: the panel lists her under NPCs; Omnisearch finds her.
			await crow(o, npc).waitFor();
			await omnisearch(o, 'marta', r => r.some(t => /Marta Vey/.test(t)));
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
			// Both ways: the name on the place's card is the NPC's quick look (as NPC chips are); its Open page goes to
			// his note, whose card says where he's found.
			await pc.locator('.ev-cq-whos a.internal-link', { hasText: 'Old Brannoc' }).first().click();
			const look = o.page.locator('.modal.nimble-record-modal');
			await look.waitFor({ timeout: 3000 });
			assert.equal(await look.locator('.record-title').innerText(), 'Old Brannoc');
			assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), place, 'still on the place');
			await look.locator('button', { hasText: 'Open page' }).click();
			await look.waitFor({ state: 'detached' });
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

	test('entities 5e: New character… in a campaign you run makes a party member, not "You"', async (o) => {
		const C = 'Campaigns/E5 New Hero';
		const pc = `${C}/Party/Bryn Ashby.md`;
		await scenario(o, 'new-hero-gm', [C], async () => {
			await campaign5e(o, 'E5 New Hero', { edition: '2024', level: 1 });
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-character'));
			await fillCharacter(o, {
				name: 'Bryn Ashby', className: 'Fighter', species: 'Dwarf', background: 'Soldier',
				skills: ['Perception', 'Survival'], languages: ['Dwarvish', 'Giant'], masteries: ['Greatsword', 'Flail', 'Javelin'],
			});
			const fm = await waitFm(o, pc, f => f.class === 'Fighter', 'the fighter\'s note');
			assert.notEqual(fm.mine, true);
			await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-hero`, { hasText: 'Bryn Ashby' }).count()) === 1, { what: 'Bryn in the party' });
			assert.equal(await o.page.locator(`${CP} .campaign-hero-you`).count(), 0, 'no You in a campaign you run');
		});
	});

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
			// The panel's card redraws after the level up lands; wait for it rather than reading it once.
			const wantHp = `${fm2.hp ?? fm2.hp_max}/${fm2.hp_max}`;
			await o.waitFor(async () => (await hero.locator('.campaign-hero-hp-text').innerText().catch(() => '')) === wantHp, { what: `the hero card shows ${wantHp}` });
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

	// -----------------------------------------------------------------------
	// Monsters

	test('entities 5e: monster: SRD monsters, the Monsters folder\'s starter, a hand-written block in both layouts, the builder, the content folder seen from every campaign, Copy to vault in 2014; found in the compendium and run in a fight', async (o) => {
		const C = 'Campaigns/E5 Reef';
		const C2 = 'Campaigns/E5 Old Reef';
		const lurker = `${C}/Monsters/Reef Lurker.md`;
		const imp = `${CONTENT}/5e/Monsters/Cinder Imp.md`;
		await scenario(o, 'monster', [C, C2, imp], async () => {
			await campaign5e(o, 'E5 Reef', { edition: '2024', level: 3 });
			// The Monsters folder's +: in a 5e campaign the starter is a ```5e block, which the 5e bestiary picks up.
			await h.openPicker(o, `${C}/Monsters`);
			assert.equal(await o.page.locator('.nimble-new-note .nimble-starter.is-active').getAttribute('data-kind'), 'monster');
			await h.createFromPicker(o, 'Reef Lurker');
			await o.waitFor(() => exists(o, lurker), { what: 'the monster note' });
			assert.match(await read(o, lurker), /nimble: monster[\s\S]*```5e\nname: Reef Lurker\n/);
			await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.runtime('dnd5e').get('Reef Lurker', p)?.filePath, lurker)) === lurker, { what: 'the starter in the 5e index' });

			// Edit it by hand: a block as the book prints it, and a second laid out the 2014 way.
			await write(o, lurker, [
				'---', 'nimble: monster', '---', '',
				'```5e', 'name: Reef Lurker', 'size: Large', 'type: Monstrosity', 'ac: 15 (natural armor)', 'hp: 52 (7d10 + 14)', 'speed: 10 ft., swim 40 ft.',
				'str: 18', 'dex: 12', 'con: 15', 'int: 3', 'wis: 12', 'cha: 5', 'skills: Stealth +5', 'senses: darkvision 60 ft., passive Perception 11', 'cr: 3',
				'traits:', '- Amphibious: The lurker can breathe air and water.',
				'actions:', '- Multiattack: The lurker makes two Bite attacks.', '- Bite: Melee Attack Roll: +6, reach 10 ft. Hit: 11 (2d6 + 4) Piercing damage.', '```', '',
				'```5e', 'name: Reef Lurker Hatchling', 'edition: 2014', 'size: Small', 'type: Monstrosity', 'ac: 12', 'hp: 9 (2d6 + 2)', 'speed: 10 ft., swim 30 ft.',
				'str: 10', 'dex: 14', 'con: 12', 'int: 2', 'wis: 10', 'cha: 4', 'cr: 1/8',
				'actions:', '- Bite: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.', '```', '',
			].join('\n'));
			await o.openFile(lurker, 'preview');
			const blocks = view(o, '.dnd5e-statblock');
			await o.waitFor(async () => (await blocks.count()) === 2, { what: 'both stat blocks' });
			assert.deepEqual(await blocks.evaluateAll(bs => bs.map(b => ['ed-2024', 'ed-2014'].find(c => b.classList.contains(c)))), ['ed-2024', 'ed-2014']);
			assert.match(await blocks.first().innerText(), /AC\s*15[\s\S]*HP\s*52[\s\S]*CR\s*3 \(XP 700; PB \+2\)/);
			assert.match(await blocks.nth(1).innerText(), /Armor Class\s*12[\s\S]*Challenge\s*1\/8 \(25 XP\)/);
			// Every number rolls: the bite's to-hit.
			await blocks.first().locator('.dnd5e-feature .dnd5e-roll.is-clickable').first().click();
			await o.waitFor(async () => (await lastRoll(o))?.expression === '1d20+6', { what: 'the bite rolled' });
			// Live Preview draws them too.
			await o.openFile(lurker, 'source');
			await o.waitFor(async () => (await lp(o, '.dnd5e-statblock').count()) === 2, { what: 'the blocks in Live Preview' });

			// The pencil reopens the block in the builder; Save writes the change back in place.
			await o.openFile(lurker, 'preview');
			const first = view(o, '.block-language-5e').first();
			await first.hover();
			await first.locator('.nimble-block-edit').click();
			await o.page.locator(B).waitFor();
			assert.equal(await o.page.locator(`${PANEL} input[data-field="Name"]`).inputValue(), 'Reef Lurker');
			await step(o, 'Armor');
			await o.page.locator(`${PANEL} input[data-field="AC"]`).fill('16');
			await finish(o);
			await o.waitFor(async () => /\nac: 16\b/.test(await read(o, lurker)), { what: 'AC written back' });
			assert.match(await read(o, lurker), /name: Reef Lurker Hatchling/, 'the other block is left alone');

			// New monster… builds one into the campaign's Monsters folder.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-monster'); });
			await o.page.locator(B).waitFor();
			assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Monster');
			await o.page.locator(`${PANEL} input[data-field="Name"]`).fill('Tide Hag');
			await o.page.locator(`${PANEL} select[data-field="Challenge"]`).selectOption('4');
			await finish(o);
			const hag = `${C}/Monsters/Tide Hag.md`;
			await o.waitFor(() => exists(o, hag), { what: 'the built monster' });
			assert.match(await read(o, hag), /^---\nnimble: monster\ncr: "?4"?\n---[\s\S]*```5e\nname: Tide Hag\nedition: 2024\n[\s\S]*cr: 4\n/);
			// Like every monster note, it's listed with a skull in the panel.
			await o.waitFor(async () => crow(o, hag).evaluate(el => el.classList.contains('kind-monster')).catch(() => false), { what: 'the built monster listed as a monster' });
			assert.ok(await crow(o, lurker).evaluate(el => el.classList.contains('kind-monster')));

			// Homebrew in the content folder is seen from every campaign, in either edition.
			await write(o, imp, '```5e\nname: Cinder Imp\nsize: Tiny\ntype: Fiend\nac: 13\nhp: 10 (4d4)\nspeed: 20 ft., fly 40 ft.\nstr: 6\ndex: 17\ncon: 10\nint: 11\nwis: 12\ncha: 14\ncr: 1/2\nactions:\n- Sting: Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Fire damage.\n```\n');
			await campaign5e(o, 'E5 Old Reef', { edition: '2014', level: 1, starter: false });
			for (const camp of [C, C2]) {
				await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.runtime('dnd5e').get('Cinder Imp', p)?.filePath, `${camp}/x.md`)) === imp, { what: `the imp seen from ${camp}` });
			}
			// But a campaign's own monsters stay in their campaign.
			assert.equal(await o.eval((app, plugin, p) => plugin.runtime('dnd5e').get('Reef Lurker', p)?.filePath ?? null, `${C2}/x.md`), null, 'the 2014 campaign doesn\'t see the other campaign\'s Reef Lurker');

			// Copy to vault in the 2014 campaign: the Goblin's quick look makes it a note with the 2014 layout.
			await write(o, `${C2}/Notes.md`, 'Watch for `5e:Goblin` and `5e:Cinder Imp`.\n');
			await o.openFile(`${C2}/Notes.md`, 'preview');
			await o.waitFor(async () => (await view(o, '.dnd5e-ref.nimble-inline-found').count()) === 2, { what: 'both references found' });
			await view(o, '.dnd5e-ref .nimble-inline-name').first().click();
			const look = o.page.locator('.modal.dnd5e-quick-look');
			await look.locator('.dnd5e-statblock.ed-2014').waitFor({ timeout: 3000 });
			await look.locator('button', { hasText: 'Copy to vault' }).click();
			await o.waitFor(() => exists(o, `${C2}/Monsters/Goblin.md`), { what: 'the copy' });
			assert.match(await read(o, `${C2}/Monsters/Goblin.md`), /```5e\nname: Goblin\nedition: 2014\n/);
			await o.page.keyboard.press('Escape');
			await tidy(o);

			// The compendium finds them all in the 2024 campaign: the SRD's, yours, the content folder's, with filters.
			await o.eval(async (app, plugin, C) => { await plugin.campaigns.setActive(C); }, C);
			await compendium(o, 'Monsters', 'reef lurker');
			await o.waitFor(async () => (await cmpNames(o, CV)).includes('Reef Lurker'), { timeout: 5000, what: 'Reef Lurker in the compendium' });
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('');
			await o.page.locator(`${CV} .nimble-cmpx-input`).pressSequentially('type:fiend cr:1/2 ', { delay: 15 });
			await o.waitFor(async () => (await cmpNames(o, CV)).includes('Cinder Imp'), { timeout: 5000, what: 'the imp by its filters' });
			assert.ok(!(await cmpNames(o, CV)).includes('Reef Lurker'), 'filters leave the lurker out');
			// Enter on a monster adds it to the fight.
			while (await o.page.locator(`${CV} .nimble-cmpx-chip-x`).count()) await o.page.locator(`${CV} .nimble-cmpx-chip-x`).first().click();
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('owlbear');
			await o.waitFor(async () => /Owlbear/.test(await o.page.locator(`${CV} .nimble-cmpx-row.is-selected`).innerText().catch(() => '')), { what: 'the Owlbear selected' });
			await o.page.locator(`${CV} .nimble-cmpx-input`).press('Enter');
			await o.waitFor(async () => (await fight(o)).some(c => c.name === 'Owlbear'), { what: 'the Owlbear in the fight' });

			// A fight with an SRD monster, your own and the content folder's: each resolves, rated, and Run puts them in the tracker.
			await write(o, `${C}/Chapter 1/Reef.md`, '```nimble-encounter\nname: The reef\nmonsters:\n- 2 `5e:Reef Lurker`\n- Cinder Imp\n- [[Tide Hag]]\n- Sahuagin Warrior\n```\n');
			await o.openFile(`${C}/Chapter 1/Reef.md`, 'preview');
			const enc = view(o, '.dnd5e-encounter');
			await o.waitFor(async () => (await enc.locator('.dnd5e-encounter-xp').count()) === 4, { what: 'four groups with XP' });
			assert.equal(await enc.locator('.dnd5e-encounter-missing').count(), 0, 'nothing missing');
			await enc.locator('button', { hasText: 'Run' }).click();
			await o.page.locator(TR).waitFor({ timeout: 5000 });
			await o.waitFor(async () => (await fight(o)).length === 5, { what: 'five in the fight' });
			assert.deepEqual((await fight(o)).map(c => c.name).sort(), ['Cinder Imp', 'Reef Lurker', 'Reef Lurker', 'Sahuagin Warrior', 'Tide Hag']);
			assert.equal((await fight(o)).find(c => c.name === 'Reef Lurker').ac, 16, 'the edited AC');
		});
	});

	// -----------------------------------------------------------------------
	// Spells, magic items and equipment

	test('entities 5e: spells, items and equipment: the SRD\'s in both editions, homebrew blocks typed by hand (cards, references, compendium, Omnisearch, the pencil), a homebrew weapon on a sheet, a homebrew spell offered by New character', async (o) => {
		const C = 'Campaigns/E5 Armory';
		const armory = `${C}/Armory.md`;
		const refs = `${C}/Chapter 1/Opening Scene.md`;
		const fighter = `${C}/Party/Tamsin Reed.md`;
		const wizard = `${C}/Party/Oriel Vash.md`;
		const SH = (sel = '') => view(o, `.dnd5e-sheet ${sel}`);
		await scenario(o, 'gear', [C], async () => {
			await campaign5e(o, 'E5 Armory', { edition: '2024', level: 3 });
			await write(o, armory, [
				'# Armory', '',
				'```5e-spell', 'name: Brine Bolt', 'level: 1', 'school: Evocation', 'casting time: Action', 'range: 90 feet', 'components: V, S', 'duration: Instantaneous', 'classes: Wizard, Sorcerer', '',
				'A lance of seawater strikes a creature you can see. Make a ranged spell attack against the target. On a hit, the target takes 2d8 Cold damage.', '```', '',
				'```5e-item', 'name: Ember Pike', 'category: Martial Melee Weapon', 'damage: 1d10 piercing', 'properties: Heavy, Reach, Two-Handed', 'mastery: Cleave', 'cost: 20 gp', 'weight: 18 lb.', '```', '',
				'```5e-item', 'name: Gloomfang', 'type: Weapon (Longsword)', 'rarity: Uncommon', '',
				'You gain a +1 bonus to attack and damage rolls made with this magic weapon.', '```', '',
			].join('\n'));
			// See: each block is its compendium card, tagged Homebrew, in reading view and Live Preview.
			await o.openFile(armory, 'preview');
			const cards = view(o, '.dnd5e-homebrew .dnd5e-card');
			await o.waitFor(async () => (await cards.count()) === 3, { what: 'three homebrew cards' });
			assert.match(await cards.nth(0).innerText(), /Brine Bolt[\s\S]*Level 1 Evocation[\s\S]*lance of seawater/i);
			assert.match(await cards.nth(1).innerText(), /Ember Pike[\s\S]*1d10[\s\S]*Cleave/i);
			assert.match(await cards.nth(2).innerText(), /Gloomfang[\s\S]*Uncommon/i);
			for (const c of await cards.allInnerTexts()) assert.match(c, /Homebrew/);
			await o.openFile(armory, 'source');
			await o.waitFor(async () => (await lp(o, '.dnd5e-homebrew .dnd5e-card').count()) === 3, { what: 'the cards in Live Preview' });

			// Link: references to yours and the SRD's, by kind; the hover card is the entry.
			await write(o, refs, '# Opening Scene\n\nShe casts `5e:spell:Brine Bolt` and `5e:spell:Fireball`, swings an `5e:equipment:Ember Pike` and a `5e:item:Gloomfang`, and carries a `5e:item:Bag of Holding`.\n');
			await o.openFile(refs, 'preview');
			await o.waitFor(async () => (await view(o, '.dnd5e-ref.dnd5e-hit').count()) === 5, { what: 'five references found' });
			assert.deepEqual(await view(o, '.dnd5e-ref.dnd5e-hit').evaluateAll(els => els.map(e => [...e.classList].find(c => c.startsWith('kind-')))), ['kind-spell', 'kind-spell', 'kind-equipment', 'kind-item', 'kind-item']);
			await view(o, '.dnd5e-ref.kind-spell .nimble-inline-name').first().hover();
			await o.waitFor(async () => /lance of seawater/.test(await o.page.locator('.nimble-hover-preview .dnd5e-card').innerText().catch(() => '')), { what: 'the homebrew spell\'s hover card' });
			await o.page.keyboard.press('Escape');
			await tidy(o);

			// Find: the compendium lists yours with the SRD's, tagged Homebrew, and the filters take them.
			await compendium(o, 'Spells', 'brine bolt');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Brine Bolt', { timeout: 5000, what: 'Brine Bolt in the Spells tab' });
			assert.equal(await cmpRow(o, 'Brine Bolt', CV).locator('.bestiary-tag.is-homebrew').textContent(), 'Homebrew');
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('');
			await o.page.locator(`${CV} .nimble-cmpx-input`).pressSequentially('level:cantrip class:wizard ', { delay: 15 });
			await o.waitFor(async () => (await cmpNames(o, CV)).includes('Fire Bolt'), { timeout: 5000, what: 'Fire Bolt among wizard cantrips' });
			assert.ok(!(await cmpNames(o, CV)).includes('Brine Bolt'), 'a level 1 spell isn\'t a cantrip');
			while (await o.page.locator(`${CV} .nimble-cmpx-chip-x`).count()) await o.page.locator(`${CV} .nimble-cmpx-chip-x`).first().click();
			await o.page.locator(`${CV} .nimble-cmpx-seg`, { hasText: 'Equipment' }).click();
			await o.page.locator(`${CV} .nimble-cmpx-input`).pressSequentially('weapon:martial prop:reach ', { delay: 15 });
			await o.waitFor(async () => { const n = await cmpNames(o, CV); return n.includes('Ember Pike') && n.includes('Glaive'); }, { timeout: 5000, what: 'Ember Pike with the SRD\'s reach weapons' });
			while (await o.page.locator(`${CV} .nimble-cmpx-chip-x`).count()) await o.page.locator(`${CV} .nimble-cmpx-chip-x`).first().click();
			await o.page.locator(`${CV} .nimble-cmpx-seg`, { hasText: 'Magic items' }).click();
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('gloomfang');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Gloomfang', { timeout: 5000, what: 'Gloomfang in Magic items' });
			// The 2014 rules have their own SRD gear.
			await o.page.locator(`${CV} .dnd5e-cmp-editions button`, { hasText: '2014' }).click();
			await o.page.locator(`${CV} .nimble-cmpx-seg`, { hasText: 'Magic items' }).click();
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('bag of holding');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Bag of Holding', { timeout: 5000, what: 'the 2014 Bag of Holding' });
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));
			// Omnisearch finds a homebrew spell too.
			await omnisearch(o, 'brine bolt', rows => rows.some(r => /Brine Bolt/.test(r)));
			await o.page.keyboard.press('Escape');
			await tidy(o);

			// Edit: the pencil on the pike reopens it in the item builder; Save writes the change in place.
			await o.openFile(armory, 'preview');
			const pike = view(o, '.block-language-5e-item').first();
			await pike.hover();
			await pike.locator('.nimble-block-edit').click();
			await o.page.locator(B).waitFor();
			assert.equal(await o.page.locator(`${PANEL} input[data-field="Name"]`).inputValue(), 'Ember Pike');
			await o.page.locator(`${PANEL} input[data-field="Cost"]`).fill('25 gp');
			await finish(o);
			await o.waitFor(async () => /name: Ember Pike[\s\S]*cost: 25 gp/.test(await read(o, armory)), { what: 'the new cost written back' });
			assert.match(await read(o, armory), /name: Gloomfang/, 'the other blocks stay');

			// Use: on a fighter's sheet, Add item finds the homebrew weapons; they attack with their own numbers.
			await write(o, fighter, '---\nnimble: character\nsystem: 5e\nedition: "2024"\nclass: Fighter\nlevel: 3\nhp: 28\nhp_max: 28\nstr: 16\ndex: 12\ncon: 14\nint: 10\nwis: 12\ncha: 8\ninventory: []\n---\n\n```5e-sheet\n```\n');
			await o.openFile(fighter, 'preview');
			await SH().waitFor({ timeout: 5000 });
			const addItem = async (name) => {
				await SH('.dnd5e-tab[data-tab="inventory"]').click();
				await SH('.dnd5e-sheet-add').filter({ hasText: 'Add item' }).click();
				await pickInCompendium(o, name, name);
				await o.waitFor(async () => (await SH('.dnd5e-sheet-item').filter({ hasText: name }).count()) === 1, { what: `${name} carried` });
			};
			await addItem('Ember Pike');
			await addItem('Gloomfang');
			// Both are weapons, so both go on equipped (the magic one by its base, a longsword).
			await waitFm(o, fighter, fm => fm.inventory?.length === 2 && fm.inventory.every(i => i.equipped), 'both weapons equipped');
			await SH('.dnd5e-tab[data-tab="actions"]').click();
			const pikeRow = SH('.dnd5e-sheet-attack').filter({ hasText: 'Ember Pike' });
			const fangRow = SH('.dnd5e-sheet-attack').filter({ hasText: 'Gloomfang' });
			await o.waitFor(async () => (await pikeRow.count()) === 1 && (await fangRow.count()) === 1, { what: 'both weapons as attacks' });
			// Str 16 (+3) and proficiency +2: the pike +5 for 1d10 + 3 piercing; Gloomfang a longsword with its +1.
			assert.match(await pikeRow.locator('.dnd5e-act-hit').innerText(), /\+5/);
			assert.match(await pikeRow.locator('.dnd5e-dmg').getAttribute('aria-label'), /1d10 \+ 3 Piercing damage/);
			assert.match(await fangRow.locator('.dnd5e-act-hit').innerText(), /\+6/);
			assert.match(await fangRow.locator('.dnd5e-dmg').getAttribute('aria-label'), /1d8 \+ 4 Slashing damage/);
			await pikeRow.locator('.dnd5e-dmg').click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Tamsin Reed: Ember Pike damage', { what: 'the pike\'s damage rolled' });
			assert.equal((await lastRoll(o)).expression.replace(/\s/g, ''), '1d10+3');
			await shot(o, 'homebrew-weapons');

			// New character offers your spell beside the SRD's: a wizard takes Brine Bolt into the spellbook.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
			await o.page.locator(B).waitFor({ timeout: 3000 });
			await o.page.locator(`${PANEL} input[data-field="Name"]`).fill('Oriel Vash');
			await o.page.locator(`${PANEL} select[data-field="Class"]`).selectOption('Wizard');
			await step(o, 'Class');
			await o.waitFor(async () => (await o.page.locator(`${PANEL} [data-key="spells"] .eb-pick[data-value="Brine Bolt"]`).count()) === 1, { what: 'Brine Bolt offered to a wizard' });
			await o.page.locator(B).locator('.eb-dot').first().click();
			await fillCharacter(o, { name: 'Oriel Vash', className: 'Wizard', skills: ['Arcana', 'History'], languages: ['Elvish', 'Draconic'], spells: ['Brine Bolt'], fillSpells: true });
			await waitFm(o, wizard, fm => (fm.spells ?? []).includes('Brine Bolt'), 'Brine Bolt in the spellbook');
			await o.openFile(wizard, 'preview');
			await SH().waitFor({ timeout: 5000 });
			await SH('.dnd5e-tab[data-tab="spells"]').click();
			await o.waitFor(async () => (await SH('.dnd5e-sheet-spell').filter({ hasText: 'Brine Bolt' }).count()) === 1, { what: 'Brine Bolt on the sheet' });
		});
	});

	// -----------------------------------------------------------------------
	// Encounters

	test('entities 5e: encounter (2014): a block rated with the multiplier, Run with the party, a full round: initiative, a group stepping, a tap out of turn, legendary actions and resistance, concentration, a timed condition, death saves, Back, round 2, End', async (o) => {
		const C = 'Campaigns/E5 Red Peak';
		const lair = `${C}/Lair.md`;
		const next = o.page.locator(`${TR} .dnd5e-next`);
		const of = async (label) => (await fight(o)).find(c => c.label === label);
		await scenario(o, 'encounter', [C], async () => {
			await campaign5e(o, 'E5 Red Peak', { edition: '2014', level: 10, heroes: 2, starter: false });
			// Two heroes typed in (no sheets): the block and the tracker read them.
			await o.eval((app, plugin) => { plugin.settings.party = [{ id: 'e5-ilse', name: 'Ilse', level: 10, maxHp: 70, defense: 17 }, { id: 'e5-bram', name: 'Bram', level: 10, maxHp: 85, defense: 18 }]; plugin.campaigns.trigger('changed'); });
			await write(o, lair, '# Lair\n\n```nimble-encounter\nname: The red peak\nparty: true\nmonsters:\n- `5e:Adult Red Dragon`\n- 2 Kobold\n```\n');
			await o.openFile(lair, 'preview');
			const enc = view(o, '.dnd5e-encounter');
			// 2014: 18,000 + 2 × 25 XP, three monsters against two heroes counts ×2.5.
			await o.waitFor(async () => /18,050 × 2\.5 = 45,125 XP/.test(await enc.locator('.dnd5e-encounter-sum').innerText().catch(() => '')), { what: 'the 2014 sum with its multiplier' });
			assert.match(await enc.locator('.nimble-difficulty').innerText(), /^Deadly · \d+%$/i);
			assert.match(await enc.locator('.dnd5e-encounter-party').innerText(), /2 heroes, level 10/);
			assert.deepEqual((await enc.locator('.dnd5e-encounter-budget-label').allInnerTexts()).map(s => s.toLowerCase()), ['easy', 'medium', 'hard', 'deadly']);

			// Run: the monsters and the party.
			await enc.locator('button', { hasText: 'Run' }).click();
			await o.page.locator(TR).waitFor({ timeout: 5000 });
			await o.waitFor(async () => (await fight(o)).length === 5, { what: 'five in the fight' });
			const f0 = await fight(o);
			assert.deepEqual(f0.map(c => c.label).sort(), ['Adult Red Dragon', 'Bram', 'Ilse', 'Kobold', 'Kobold 2']);
			assert.deepEqual((await of('Adult Red Dragon')).legendary, { max: 3, used: 0 });
			assert.deepEqual((await of('Adult Red Dragon')).resistances, { max: 3, used: 0 });
			// Initiative: the players' rolls typed in, Roll all for the monsters (the kobolds share one), then the dragon's set by hand.
			const setInit = async (name, n) => {
				await row5e(o, name).locator('.dnd5e-init').click();
				await o.page.locator('.dnd5e-init-pop input').fill(String(n));
				await o.page.keyboard.press('Enter');
				await o.page.locator('.dnd5e-init-pop').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
			};
			await setInit('Ilse', 15);
			await setInit('Bram', 8);
			await o.page.locator(`${TR} button[aria-label="Roll initiative"]`).click();
			await o.waitFor(async () => (await o.page.locator(`${TR} .dnd5e-init.is-unset`).count()) === 0, { what: 'everyone rolled' });
			await o.waitFor(async () => (await row5e(o, 'Kobolds ×2').count()) === 1, { what: 'the kobolds on one roll' });
			await setInit('Kobolds ×2', 12);
			await setInit('Adult Red Dragon', 20);
			await o.waitFor(async () => (await fight(o)).map(c => `${c.label}:${c.init}`).sort().join() === 'Adult Red Dragon:20,Bram:8,Ilse:15,Kobold 2:12,Kobold:12', { timeout: 5000, what: `everyone's initiative: ${JSON.stringify((await fight(o)).map(c => [c.label, c.init]))}` });
			await o.page.locator(`${TR} button`, { hasText: 'Start combat' }).click();
			await o.waitFor(async () => (await fightState(o)).turn === 'Adult Red Dragon', { what: 'the dragon first' });
			assert.equal((await fightState(o)).round, 1);

			// The dragon's card: Legendary actions and resistance as pips; it burns a resistance.
			const dragon = row5e(o, 'Adult Red Dragon');
			assert.equal(await dragon.locator('.ev-pips.is-legendary .ev-pip').count(), 3);
			await dragon.locator('.ev-pips.is-resist .ev-pip.is-on').first().click();
			await o.waitFor(async () => (await of('Adult Red Dragon')).resistances.used === 1, { what: 'a legendary resistance spent' });
			// Its stat block from the card, laid out the 2014 way.
			await shot(o, 'tracker-dragon');

			// Ilse's turn, then the kobolds': after a turn that isn't the dragon's, the strip offers its legendary actions.
			await next.click();
			await o.waitFor(async () => (await fightState(o)).turn === 'Ilse', { what: 'Ilse up' });
			// She concentrates; damage calls for the save.
			await o.page.locator(`${TR} .dnd5e-combatant.is-turn .dnd5e-combatant-more`).click();
			await clickMenu(o, 'Concentrating');
			await o.waitFor(async () => (await of('Ilse')).concentrating, { what: 'concentrating' });
			await tidy(o);
			await hpPad5e(o, row5e(o, 'Ilse'), '14');
			await o.waitFor(async () => (await of('Ilse')).hp === 56, { what: 'Ilse hit for 14' });
			await o.waitFor(async () => /Ilse: Constitution save DC 10/.test((await o.page.locator('.notice').allInnerTexts()).join(' ')), { what: 'the concentration save called' });
			await next.click();
			await o.waitFor(async () => (await fightState(o)).turn === 'Kobold', { what: 'the first kobold up' });
			const moment = o.page.locator(`${TR} .dnd5e-moment`);
			await o.waitFor(async () => /Adult Red Dragon: a legendary action\?/.test(await moment.innerText().catch(() => '')), { what: 'the legendary strip' });
			assert.match(await moment.innerText(), /After Ilse's turn · 3 of 3 uses left/);
			await moment.locator('.ev-moment-btn', { hasText: 'Wing Attack' }).click();
			await o.waitFor(async () => (await of('Adult Red Dragon')).legendary.used === 2, { what: 'the wing attack costs two' });
			await o.waitFor(async () => (await moment.locator('.ev-moment-btn', { hasText: 'Wing Attack' }).isDisabled().catch(() => false)), { what: 'no uses left for another wing attack' });
			// The group: two kobolds on one initiative, the card steps through them.
			assert.equal(await o.page.locator(`${TR} .dnd5e-members .dnd5e-member`).count(), 2);
			assert.equal(await next.innerText(), 'Next: Kobold 2');

			// Out of turn: tap Bram and he acts now; Next goes back to the kobold who hadn't acted.
			await row5e(o, 'Bram').locator('.dnd5e-combatant-name').click();
			await o.waitFor(async () => (await fightState(o)).turn === 'Bram', { what: 'Bram acts now' });
			// Nobody is reshuffled: the kobolds, who hadn't acted yet, are next.
			assert.equal(await next.innerText(), 'Next: Kobolds');
			// Frightened for 1 round, from the picker (2014's list: no Burning).
			await o.page.locator(`${TR} .dnd5e-combatant.is-turn .ev-card-condition`).click();
			await o.page.locator('.condition-picker .condition-search').fill('burn');
			assert.equal(await o.page.locator('.condition-picker .condition-option[aria-label="Burning"]').count(), 0, '2014 has no Burning');
			await o.page.locator('.condition-picker .condition-search').fill('');
			// Each says what it does in a line, from the 2014 rules (their bullet lists read as plain sentences).
			assert.match(await o.page.locator('.condition-picker .condition-option[aria-label="Blinded"] small').innerText(), /^A blinded creature can't see/);
			await o.page.locator('.condition-picker .nimble-segmented button', { hasText: exact('1 rd') }).click();
			await o.page.locator('.condition-picker .condition-option[aria-label="Frightened"]').click();
			await o.waitFor(async () => (await of('Bram')).rounds.Frightened === 1, { what: 'Frightened for a round' });
			// Bram drops: death saves on his card, rolled from there.
			await hpPad5e(o, row5e(o, 'Bram'), '100');
			await o.waitFor(async () => (await of('Bram')).hp === 0, { what: 'Bram at 0' });
			await o.waitFor(async () => (await row5e(o, 'Bram').locator('.dnd5e-death').count()) === 1, { what: 'death saves on the card' });
			await row5e(o, 'Bram').locator('.dnd5e-death-roll').click();
			await o.waitFor(async () => (await lastRoll(o))?.label === 'Bram: death save', { what: 'a death save rolled' });
			// Back undoes the tap: the kobold is up again.
			await o.page.locator(`${TR} button[aria-label="Back a turn"]`).click();
			await o.waitFor(async () => (await fightState(o)).turn === 'Kobold', { what: 'Back to the kobold' });

			// The rest of round 1, then round 2: the dragon's legendary actions come back at the start of its turn.
			for (let i = 0; i < 8 && (await fightState(o)).round === 1; i++) { await next.click(); await o.page.waitForTimeout(150); await o.eval(() => document.querySelectorAll('.modal.ev-effect-prompt .ev-effect-done').forEach(b => b.click())); }
			await o.waitFor(async () => (await fightState(o)).round === 2 && (await fightState(o)).turn === 'Adult Red Dragon', { what: 'round 2, the dragon first' });
			assert.equal((await of('Adult Red Dragon')).legendary.used, 0, 'legendary actions back');
			assert.equal((await of('Adult Red Dragon')).resistances.used, 1, 'legendary resistance stays spent');
			// A kobold falls and folds into Defeated.
			await o.eval((app, plugin) => plugin.runtime('dnd5e').fights.change(f => { const k = f.combatants.find(c => c.label === 'Kobold 2'); k.hp = 0; }));
			await o.waitFor(async () => (await o.page.locator(`${TR} .dnd5e-tracker-defeated .dnd5e-combatant`).count()) === 1, { what: 'a kobold defeated' });
			await shot(o, 'tracker-round-2');

			// End combat, from the tracker's menu: the round resets, the fight stays to run again.
			await o.page.locator(`${TR} .dnd5e-tracker-more`).click();
			await clickMenu(o, 'End combat');
			await o.waitFor(async () => (await fightState(o)).round === 0, { what: 'combat over' });
			await o.page.locator(`${TR} button`, { hasText: 'Start combat' }).waitFor({ timeout: 3000 });
			assert.equal((await fight(o)).length, 5);
		});
	});

	// -----------------------------------------------------------------------
	// Your own character content

	test('entities 5e: homebrew character content: a species, background and feat from the compendium\'s builders, a subclass typed as a block; New character takes them, level up takes the feat; all in the compendium, referenced and edited', async (o) => {
		const C = 'Campaigns/E5 Emberfolk';
		const pc = `${C}/Party/Kael Ashby.md`;
		const knight = `${CONTENT}/5e/Subclasses/Ember Knight.md`;
		const SH = (sel = '') => view(o, `.dnd5e-sheet ${sel}`);
		/** The note in the content folder that holds a block named `name`, once it's written. */
		const findNote = async (lang, name) => {
			let path = null;
			await o.waitFor(async () => {
				path = await o.eval(async (app, _p, [CONTENT, lang, name]) => {
					for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith(`${CONTENT}/`))) {
						if (new RegExp(`^\`\`\`${lang}\\nname: ${name}\\n`, 'm').test(await app.vault.cachedRead(f))) return f.path;
					}
					return null;
				}, [CONTENT, lang, name]);
				return path;
			}, { what: `the ${lang} note for ${name}` });
			return path;
		};
		const entries = () => o.eval((app, plugin) => plugin.content.enabled('dnd5e').flatMap(p => p.entries.map(e => `${e.kind}:${e.name}`)).sort().join());
		const newOn = async (tab, menuItem) => {
			await compendium(o, tab, '');
			await o.page.locator(`${CV} .nimble-cmpx-new`).click();
			if (menuItem) await o.page.locator('.menu .menu-item', { hasText: menuItem }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
		};
		await scenario(o, 'homebrew-content', [C, CONTENT], async () => {
			await o.eval(async (app, _p, CONTENT) => { const f = app.vault.getAbstractFileByPath(CONTENT); if (f) await app.vault.delete(f, true); }, CONTENT);
			await campaign5e(o, 'E5 Emberfolk', { edition: '2024', level: 3, starter: false });

			// A species from New on the Origins tab: its builder, a trait, a skill it gives.
			await newOn('Origins', 'New species…');
			assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Species');
			await o.page.locator(`${PANEL} input[data-field="Name"]`).fill('Emberfolk');
			await o.page.locator(`${PANEL} [data-key="darkvision"] .eb-seg-btn`, { hasText: '60 ft.' }).click();
			await step(o, 'Traits');
			const traits = o.page.locator(`${PANEL} [data-key="traits"] .eb-list-item`);
			if (!(await traits.count())) await o.page.locator(`${PANEL} [data-key="traits"] .eb-list-add`).first().click();
			await traits.first().locator('input[data-field="Name"]').fill('Warm Blood');
			await traits.first().locator('textarea').first().fill('You have Resistance to Cold damage.');
			await step(o, 'Choices');
			await pick(o, 'Survival', `${PANEL} [data-key="skills"]`);
			await finish(o);
			const species = await findNote('5e-species', 'Emberfolk');
			assert.match(await read(o, species), /name: Darkvision[\s\S]*60 feet[\s\S]*name: Warm Blood\n\s+desc: You have Resistance to Cold damage\./);

			// A background from the same tab: three abilities, an origin feat, two skills and a tool.
			await newOn('Origins', 'New background…');
			await o.page.locator(`${PANEL} input[data-field="Name"]`).fill('Lamplighter');
			for (const a of ['WIS', 'DEX', 'CON']) await pick(o, a, `${PANEL} [data-key="abilities"]`);
			await o.page.locator(`${PANEL} select[data-field="Origin feat"]`).selectOption('Alert');
			await step(o, 'Training');
			for (const s of ['Perception', 'Stealth']) await pick(o, s, `${PANEL} [data-key="skills"]`);
			await o.page.locator(`${PANEL} [data-key="tools"] .eb-pick`).first().click();
			await finish(o);
			await findNote('5e-background', 'Lamplighter');

			// A feat from New on the Feats tab.
			await newOn('Feats');
			assert.equal(await o.page.locator(`${B} .eb-kind.is-active`).innerText(), 'Feat');
			await o.page.locator(`${PANEL} input[data-field="Name"]`).fill('Ember Heart');
			await step(o, 'Benefit');
			await pick(o, 'CON', `${PANEL} [data-key="increase"]`);
			await o.page.locator(`${PANEL} textarea[data-field="Text"]`).fill('Fire you take heals you instead, once per Long Rest.');
			await finish(o);
			await findNote('5e-feat', 'Ember Heart');
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));

			// A subclass of the SRD's Fighter, typed as a block.
			await write(o, knight, '```5e-subclass\nname: Ember Knight\nclass: Fighter\nflavor: Fighter Subclass\nfeatures:\n  - level: 3\n    name: Banked Fire\n    desc: When you use Second Wind, you also gain 5 Temporary Hit Points.\n```\n');
			await o.waitFor(async () => (await entries()) === 'background:Lamplighter,feat:Ember Heart,species:Emberfolk,subclass:Ember Knight', { what: `the four in the Homebrew pack (${await entries()})` });

			// New character takes them: an Emberfolk Lamplighter, a level 3 fighter of the Ember Knights.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
			await fillCharacter(o, {
				name: 'Kael Ashby', className: 'Fighter', level: 3, species: 'Emberfolk', background: 'Lamplighter', subclass: 'Ember Knight',
				skills: ['Athletics', 'Intimidation'], languages: ['Dwarvish', 'Giant'], masteries: ['Greatsword', 'Longsword', 'Javelin'],
			});
			const fm = await waitFm(o, pc, f => f.class === 'Fighter', 'the hero');
			assert.deepEqual([fm.species, fm.background, fm.subclass], ['Emberfolk', 'Lamplighter', 'Ember Knight']);
			for (const s of ['Perception', 'Stealth', 'Survival']) assert.ok(fm.skills.includes(s), `${s} from the species or background: ${fm.skills}`);
			await o.openFile(pc, 'preview');
			await SH().waitFor({ timeout: 5000 });
			await SH('.dnd5e-tab[data-tab="features"]').click();
			await o.waitFor(async () => /Banked Fire[\s\S]*|Warm Blood/.test(await SH().innerText()), { what: 'the features' });
			const feats = await SH().innerText();
			for (const f of ['Banked Fire', 'Warm Blood', 'Alert']) assert.match(feats, new RegExp(f), `${f} on the sheet`);

			// Level up to 4: the increase can be your feat.
			await SH('.dnd5e-sheet-actions button').filter({ hasText: 'Level up' }).click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			await step(o, 'Increase');
			await o.page.locator(`${PANEL} [data-key="asi"] .eb-seg-btn`, { hasText: 'A feat' }).click();
			await o.page.locator(`${PANEL} select[data-field="Feat"]`).selectOption('Ember Heart');
			await finish(o);
			const fm4 = await waitFm(o, pc, f => f.level === 4, 'level 4');
			assert.ok((fm4.feats ?? []).includes('Ember Heart'), `feats: ${JSON.stringify(fm4.feats)}`);
			assert.equal(fm4.con, fm.con + 1, 'the feat\'s +1 Constitution');

			// Find: each is in the compendium, tagged Homebrew; references resolve by kind.
			await compendium(o, 'Origins', 'emberfolk');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Emberfolk', { timeout: 5000, what: 'Emberfolk on the Origins tab' });
			assert.equal(await cmpRow(o, 'Emberfolk', CV).locator('.bestiary-tag.is-homebrew').textContent(), 'Homebrew');
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('lamplighter');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Lamplighter', { timeout: 5000, what: 'Lamplighter on the Origins tab' });
			await o.page.locator(`${CV} .nimble-cmpx-seg`, { hasText: 'Classes' }).click();
			await o.page.locator(`${CV} .nimble-cmpx-input`).fill('ember knight');
			await o.waitFor(async () => (await cmpNames(o, CV))[0] === 'Ember Knight', { timeout: 5000, what: 'the subclass on the Classes tab' });
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));
			await write(o, `${C}/Lore.md`, 'Kael is `5e:species:Emberfolk`, a `5e:background:Lamplighter`, sworn to the `5e:subclass:Ember Knight` and blessed with `5e:feat:Ember Heart`.\n');
			await o.openFile(`${C}/Lore.md`, 'preview');
			await o.waitFor(async () => (await view(o, '.dnd5e-ref.dnd5e-hit').count()) === 4, { what: 'four references found' });

			// Edit: the pencil on the species block reopens its builder; Save writes it back in place.
			await o.openFile(species, 'preview');
			const block = view(o, '.ev-content-block').first();
			await block.waitFor({ timeout: 5000 });
			await block.hover();
			await block.locator('.nimble-block-edit').click();
			await o.page.locator(B).waitFor({ timeout: 3000 });
			assert.equal(await o.page.locator(`${PANEL} input[data-field="Name"]`).inputValue(), 'Emberfolk');
			await o.page.locator(`${PANEL} input[data-field="Speed"]`).fill('35');
			await finish(o);
			await o.waitFor(async () => /speed: 35/.test(await read(o, species)), { what: 'the new speed written back' });
			assert.match(await read(o, species), /Warm Blood/, 'the trait kept');
		});
	});

	// -----------------------------------------------------------------------
	// Content packs and imports

	test('entities 5e: content pack and imports (2014): Import content… adds the example pack (its subclass makes a hero, its monster runs in a fight); a D&D Beyond character and a Fantasy Statblocks creature land in the campaign', async (o) => {
		const C = 'Campaigns/E5 Hearthguard';
		const pack = readFileSync(join(ROOT, 'docs/content/examples/5e-hearth-and-cinder.json'), 'utf8');
		const ddb = readFileSync(join(ROOT, 'tests/fixtures/ddb-hollowblade.json'), 'utf8');
		const IC = '.modal.nimble-import-content';
		const M = '.modal.dnd5e-import';
		const hero = `${C}/Party/Orla Venn.md`;
		const SH = (sel = '') => view(o, `.dnd5e-sheet ${sel}`);
		await scenario(o, 'packs', [C, CONTENT], async () => {
			await o.eval(async (app, _p, CONTENT) => { const f = app.vault.getAbstractFileByPath(CONTENT); if (f) await app.vault.delete(f, true); }, CONTENT);
			await campaign5e(o, 'E5 Hearthguard', { edition: '2014', level: 3 });

			// Import content…: the example pack, pasted; all five entries go in.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-content'); });
			await o.page.locator(IC).waitFor();
			await o.page.locator(`${IC} textarea`).fill(pack);
			await o.waitFor(async () => /Hearth and Cinder[\s\S]*5 entries/.test(await o.page.locator(`${IC} .nimble-import-report`).innerText().catch(() => '')), { what: 'the pack read' });
			assert.equal(await o.page.locator(`${IC} .nimble-pack-notes.is-rejected`).count(), 0, 'nothing left out');
			await importAndClose(o, IC);
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.all().map(p => p.name).join())) === 'Hearth and Cinder', { what: 'the pack loaded' });

			// Find: each kind on its tab, tagged with the pack's name, in the 2014 compendium.
			for (const [tab, name] of [['Classes', 'Path of the Hearthguard'], ['Spells', 'Ember Lash'], ['Magic items', 'Lantern of Steady Light'], ['Feats', 'Kindler'], ['Monsters', 'Cinder Hound']]) {
				await compendium(o, tab, name.toLowerCase());
				await o.waitFor(async () => (await cmpNames(o, CV)).includes(name), { timeout: 5000, what: `${name} on the ${tab} tab` });
				if (tab !== 'Monsters') assert.equal(await cmpRow(o, name, CV).locator('.bestiary-tag.is-pack').textContent(), 'Hearth and Cinder', `${name} tagged with its pack`);
			}
			assert.match(await o.page.locator(`${CV} .dnd5e-cmp-editions button.is-active`).innerText(), /2014/);
			await o.eval((app) => app.workspace.detachLeavesOfType('nimble-dnd5e-compendium'));

			// Use: its subclass for a 2014 barbarian at level 3, from New character.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:new-character'); });
			await fillCharacter(o, { name: 'Orla Venn', className: 'Barbarian', level: 3, species: 'Half-Orc', background: 'Acolyte', skills: ['Athletics', 'Survival'], subclass: 'Path of the Hearthguard' });
			await waitFm(o, hero, f => f.subclass === 'Path of the Hearthguard', 'the pack\'s subclass on the hero');
			await o.openFile(hero, 'preview');
			await SH().waitFor({ timeout: 5000 });
			await SH('.dnd5e-tab[data-tab="features"]').click();
			await o.waitFor(async () => /Hearth Ward/.test(await SH().innerText()), { what: 'the subclass\'s level 3 feature' });
			// And its monster in a fight, beside an SRD one.
			await write(o, `${C}/Chapter 1/Kennels.md`, '```nimble-encounter\nname: The kennels\nmonsters:\n- 2 `5e:Cinder Hound`\n- Goblin\n```\n');
			await o.openFile(`${C}/Chapter 1/Kennels.md`, 'preview');
			const enc = view(o, '.dnd5e-encounter');
			await o.waitFor(async () => (await enc.locator('.dnd5e-encounter-xp').count()) === 2, { what: 'both groups rated' });
			await enc.locator('button', { hasText: 'Run' }).click();
			await o.waitFor(async () => (await fight(o)).map(c => c.name).sort().join() === 'Cinder Hound,Cinder Hound,Goblin', { what: 'the pack\'s monster in the fight' });

			// A D&D Beyond character: the note in the Party folder, its sheet, its class in the compendium as Imported.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-ddb-character'); });
			await o.page.locator(M).waitFor();
			await o.page.locator(`${M} textarea`).fill(ddb);
			await o.waitFor(async () => /Mira Hollowell[\s\S]*Level 7 Hollowblade/.test(await o.page.locator(`${M} .nimble-import-report`).innerText().catch(() => '')), { what: 'the character read' });
			await importAndClose(o, M);
			const mira = `${C}/Party/Mira Hollowell.md`;
			await waitFm(o, mira, f => f.class === 'Hollowblade', 'the imported character');
			await o.openFile(mira, 'preview');
			await SH().waitFor({ timeout: 5000 });
			assert.match(await SH('.dnd5e-sheet-sub').innerText(), /Level 7[\s\S]*Hollowblade/i);
			await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-hero[data-path="${mira}"]`).count()) === 1, { what: 'Mira in the party' });
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.enabled('dnd5e').flatMap(p => p.entries.map(e => e.name)))).includes('Hollowblade'), { what: 'the class in the content folder' });

			// A Fantasy Statblocks creature: a monster note in the campaign's Monsters folder, in the fight from a block.
			await o.eval((app) => { app.commands.executeCommandById('nimble-gm:import-fantasy-statblocks'); });
			await o.page.locator(M).waitFor();
			await o.page.locator(`${M} textarea`).fill('```statblock\nname: Bog Wisp\nsize: Tiny\ntype: undead\nalignment: chaotic evil\nac: 13\nhp: 9\nhit_dice: 2d4 + 4\nspeed: 0 ft., fly 40 ft. (hover)\nstats: [3, 16, 14, 10, 12, 6]\ncr: 1/2\nactions:\n  - name: Chill Touch\n    desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) cold damage."\n```');
			await o.waitFor(async () => /Bog Wisp/.test(await o.page.locator(`${M} .ev-import-frame`).innerText().catch(() => '')), { what: 'the creature read' });
			await importAndClose(o, M);
			const wisp = `${C}/Monsters/Bog Wisp.md`;
			await o.waitFor(() => exists(o, wisp), { what: 'the creature note' });
			assert.match(await read(o, wisp), /^---\nnimble: monster\ncr: "1\/2"\nimported: Fantasy Statblocks\n---\n\n```5e\nname: Bog Wisp\n/);
			await o.waitFor(async () => crow(o, wisp).evaluate(el => el.classList.contains('kind-monster')).catch(() => false), { what: 'listed as a monster in the panel' });
			await write(o, `${C}/Chapter 1/Bog.md`, '```nimble-encounter\nname: The bog\nmonsters:\n- 3 [[Bog Wisp]]\n```\n');
			await o.openFile(`${C}/Chapter 1/Bog.md`, 'preview');
			await o.waitFor(async () => /3 × .*|75 XP|300 XP/.test(await view(o, '.dnd5e-encounter-xp').innerText().catch(() => '')), { what: 'the wisps rated' });
			assert.equal(await view(o, '.dnd5e-encounter-missing').count(), 0);

			// Delete: the imported class changed, then the whole content folder deleted at once. Nothing of it stays in the compendium.
			await o.eval(async (app, _p, CONTENT) => {
				const f = app.vault.getAbstractFileByPath(`${CONTENT}/5e/Classes/Hollowblade.md`);
				await app.vault.modify(f, `${await app.vault.read(f)}\n`);
				await app.vault.delete(app.vault.getAbstractFileByPath(CONTENT), true);
			}, CONTENT);
			// (A change is read a moment after it's made: wait for that moment to pass.)
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.timers.size)) === 0, { what: 'pending reads done' });
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.content.all().length + plugin.content.enabled('dnd5e').length)) === 0, { what: `nothing left of the deleted content (${await o.eval((app, plugin) => plugin.content.enabled('dnd5e').flatMap(p => p.entries.map(e => e.name)).join())})` });
		});
	});

	// -----------------------------------------------------------------------
	// The player's side

	test('entities 5e: player campaign: your character marked You; NPC, quest and place cards without stats, secrets or read-aloud; monsters as lore; battle notes; no tracker', async (o) => {
		const C = 'Campaigns/E5 Players';
		const me = `${C}/Party/Pip Thistle.md`;
		const npc = `${C}/NPCs/Marta Vey.md`;
		const quest = `${C}/Quests/The Drowned Bell.md`;
		const place = `${C}/Locations/The Salt Stair.md`;
		const fightNote = `${C}/Sessions/Ambush.md`;
		await scenario(o, 'player', [C], async () => {
			await campaign5e(o, 'E5 Players', { edition: '2024', role: 'player', level: 2 });
			assert.equal(await o.eval((app, plugin, C) => plugin.playerView(`${C}/x.md`), C), true);
			assert.equal(await cgroup(o, `${C}/Monsters`).count(), 0, 'no Monsters folder for a player');

			// Your character: Add your character opens 5e's New character; the sheet is yours, marked You.
			await o.page.locator(`${CP} .campaign-roster-empty`).click();
			await fillCharacter(o, { name: 'Pip Thistle', className: 'Rogue', level: 2, skills: ['Stealth', 'Perception', 'Sleight of Hand', 'Acrobatics'], languages: ['Halfling', 'Elvish'] });
			const fm = await waitFm(o, me, f => f.class === 'Rogue', 'your character');
			assert.equal(fm.mine, true);
			await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-hero.is-mine .campaign-hero-you`).count()) === 1, { what: 'You in the party' });
			await o.openFile(me, 'preview');
			await view(o, '.dnd5e-sheet').waitFor({ timeout: 5000 });

			// An NPC from the panel: the player's starter (no stats, Suspicions instead of a secret).
			await h.openPicker(o, `${C}/NPCs`);
			await h.createFromPicker(o, 'Marta Vey');
			await o.waitFor(() => exists(o, npc), { what: 'the NPC note' });
			const npcText = await read(o, npc);
			assert.doesNotMatch(npcText, /\nac: |\nstatblock: |\nsecret: /, 'no GM properties in a player\'s NPC');
			assert.match(npcText, /suspicions:/);
			// Even with numbers and a secret pasted in, the player's card shows neither.
			await o.eval(async (app, _p, p) => { const f = app.vault.getAbstractFileByPath(p); await app.vault.modify(f, (await app.vault.read(f)).replace('```nimble-npc\n', '```nimble-npc\nsecret: She sells the tide tables.\nsaid: Mind the ninth step.\n')); }, npc);
			await setFm(o, npc, { role: 'Harbour master', ac: 17, hp: 45, statblock: 'Bandit Captain' });
			await o.openFile(npc, 'preview');
			const card = view(o, '.nimble-npc-card');
			await o.waitFor(async () => /Mind the ninth step/.test(await card.innerText().catch(() => '')), { what: 'the player\'s card' });
			assert.ok(await card.evaluate(n => n.classList.contains('is-player')));
			assert.equal(await card.locator('.dnd5e-npc-stats, .dnd5e-npc-fight, .nimble-npc-field.is-secret').count(), 0);
			assert.doesNotMatch(await card.innerText(), /tide tables|Bandit Captain/);

			// A quest: it starts active; a secret typed in stays off the card.
			await h.openPicker(o, `${C}/Quests`);
			await h.createFromPicker(o, 'The Drowned Bell');
			await o.waitFor(() => exists(o, quest), { what: 'the quest note' });
			assert.match(await read(o, quest), /status: active/);
			await setFm(o, quest, { giver: '[[Marta Vey]]', reward: '50 gp', secret: 'Marta rang it herself.' });
			await o.openFile(quest, 'preview');
			const qc = view(o, '.ev-cq.kind-quest');
			await o.waitFor(async () => /Given by[\s\S]*Marta Vey/i.test(await qc.innerText().catch(() => '')), { what: 'the quest card' });
			assert.equal(await qc.locator('.ev-cq-secret').count(), 0);
			assert.doesNotMatch(await qc.innerText(), /rang it herself/);

			// A place: no read-aloud box, no secret.
			await h.openPicker(o, `${C}/Locations`);
			await h.createFromPicker(o, 'The Salt Stair', 'location');
			await o.waitFor(() => exists(o, place), { what: 'the place' });
			await setFm(o, place, { read_aloud: 'Worn steps run down into black water.', secret: 'The ninth step is hollow.', region: 'The Drowned Quarter' });
			await o.openFile(place, 'preview');
			const pcard = view(o, '.ev-cq.kind-location');
			await o.waitFor(async () => /The Drowned Quarter/.test(await pcard.innerText().catch(() => '')), { what: 'the place card' });
			assert.equal(await pcard.locator('.ev-cq-read, .ev-cq-secret').count(), 0);

			// Monsters: a reference is a lore card, never the numbers; an encounter block is a battle note.
			await write(o, fightNote, '# Ambush\n\nWe met a `5e:Goblin Warrior`.\n\n```nimble-encounter\nname: Ambush on the stair\noutcome: won\nmonsters:\n- 3 Goblin Warrior\n```\n');
			await o.openFile(fightNote, 'preview');
			await o.waitFor(async () => (await view(o, 'p .dnd5e-ref.nimble-inline-found').count()) === 1, { what: 'the reference' });
			assert.equal(await view(o, '.dnd5e-ref .nimble-inline-level').count(), 0, 'no CR on a player\'s reference');
			await view(o, 'p .dnd5e-ref .nimble-inline-name').click();
			const look = o.page.locator('.modal.dnd5e-quick-look');
			await look.waitFor({ timeout: 3000 });
			await o.waitFor(async () => (await look.locator('.dnd5e-lore').count()) === 1, { what: 'the lore card' });
			assert.doesNotMatch(await look.innerText(), /Armor Class|\bAC\b|Hit Points|Challenge|Add to fight|Copy to vault/);
			await o.page.keyboard.press('Escape');
			const enc = view(o, '.dnd5e-encounter');
			await enc.waitFor({ timeout: 5000 });
			assert.equal(await enc.locator('.nimble-difficulty, .dnd5e-encounter-xp, .dnd5e-encounter-stats').count(), 0, 'no rating or numbers for a player');
			assert.equal(await enc.locator('button', { hasText: /^(Run|Add to fight)$/ }).count(), 0, 'no Run for a player');
			assert.match(await enc.innerText(), /Ambush on the stair[\s\S]*Won[\s\S]*3×[\s\S]*Goblin Warrior/i);

			// The compendium's monsters are lore too, and the tracker isn't offered.
			// (A player's tab says Creatures.)
			await compendium(o, 'Creatures', 'goblin warrior');
			await o.waitFor(async () => (await cmpNames(o, CV)).includes('Goblin Warrior'), { timeout: 5000, what: 'the Goblin Warrior listed' });
			await cmpRow(o, 'Goblin Warrior', CV).click();
			await o.waitFor(async () => (await o.page.locator(`${CV} .nimble-cmpx-detail .dnd5e-lore`).count()) === 1, { what: 'the compendium page as lore' });
			assert.doesNotMatch(await o.page.locator(`${CV} .nimble-cmpx-detail`).innerText(), /Armor Class|Hit Points|Add to fight/);
			assert.equal(await o.eval((app) => app.commands.findCommand('nimble-gm:open-tracker').checkCallback(true)), false, 'no tracker in a campaign you play in');
			// But a stat block you wrote yourself, in your own campaign, shows in full.
			await write(o, `${C}/Notes/Our familiar.md`, '```5e\nname: Sprocket\nsize: Tiny\ntype: Construct\nac: 13\nhp: 7 (2d4 + 2)\nspeed: 30 ft.\ncr: 0\n```\n');
			await o.openFile(`${C}/Notes/Our familiar.md`, 'preview');
			await o.waitFor(async () => /AC\s*13[\s\S]*HP\s*7/.test(await view(o, '.dnd5e-statblock').innerText().catch(() => '')), { what: 'your own block in full' });
		});
	});

	// -----------------------------------------------------------------------
	// Linking it all together

	test('entities 5e: a small adventure, linked: a quest given by an NPC with a mini sheet who lives at a read-aloud place, a fight there, a session with the party; every link both ways; renaming and deleting keep the rest working', async (o) => {
		const C = 'Campaigns/E5 Saltwick';
		const P = (p) => `${C}/${p}.md`;
		const bryn = P('Party/Bryn Ashby'), wren = P('Party/Wren Hale');
		let marta = P('NPCs/Marta Vey'), stair = P('Locations/The Salt Stair');
		const bell = P('Quests/The Drowned Bell'), drowned = P('Monsters/Drowned One'), session = P('Sessions/Session 1');
		const links = (from) => o.eval((app, _p, from) => Object.keys(app.metadataCache.resolvedLinks[from] ?? {}), from);
		const updateLinks = await o.eval((app) => app.vault.getConfig('alwaysUpdateLinks'));
		await scenario(o, 'adventure', [C], async () => {
			// Renames update links, as Obsidian's "Automatically update internal links" does.
			await o.eval((app) => app.vault.setConfig('alwaysUpdateLinks', true));
			await campaign5e(o, 'E5 Saltwick', { edition: '2024', level: 2 });

			// The party, from New character (Add a hero), twice.
			await o.page.locator(`${CP} .campaign-roster-empty`).click();
			await fillCharacter(o, { name: 'Bryn Ashby', className: 'Fighter', level: 2, skills: ['Perception', 'Survival'], languages: ['Dwarvish', 'Giant'], masteries: ['Greatsword', 'Flail', 'Javelin'] });
			await o.page.locator(`${CP} .campaign-roster-head [aria-label="Add a hero"]`).click();
			await fillCharacter(o, { name: 'Wren Hale', className: 'Wizard', level: 2, skills: ['Arcana', 'History'], languages: ['Elvish', 'Draconic'], fillSpells: true });
			await o.waitFor(async () => (await o.eval((app, plugin) => plugin.settings.party.map(p => p.name).sort().join())) === 'Bryn Ashby,Wren Hale', { what: 'the party from the sheets' });

			// The place, the NPC who lives there (with a stat block), the quest she gives, a monster of our own.
			await h.openPicker(o, `${C}/Locations`);
			await h.createFromPicker(o, 'The Salt Stair', 'location');
			await o.waitFor(() => exists(o, stair), { what: 'the place' });
			await setFm(o, stair, { region: 'Saltwick harbour', read_aloud: 'Worn steps run down into black water. A bell tolls somewhere below.' });
			await h.openPicker(o, `${C}/NPCs`);
			await h.createFromPicker(o, 'Marta Vey');
			await o.waitFor(() => exists(o, marta), { what: 'the NPC' });
			await setFm(o, marta, { role: 'Harbour master', location: '[[The Salt Stair]]', statblock: 'Bandit Captain', ac: 16 });
			await h.openPicker(o, `${C}/Quests`);
			await h.createFromPicker(o, 'The Drowned Bell');
			await o.waitFor(() => exists(o, bell), { what: 'the quest' });
			await setFm(o, bell, { status: 'active', type: 'main', giver: '[[Marta Vey]]', location: '[[The Salt Stair]]', reward: '50 gp' });
			await h.openPicker(o, `${C}/Monsters`);
			await h.createFromPicker(o, 'Drowned One');
			await o.waitFor(async () => (await o.eval((app, plugin, p) => plugin.runtime('dnd5e').get('Drowned One', p)?.filePath, drowned)) === drowned, { what: 'our monster indexed' });

			// The fight at the place: SRD monsters and ours, under the place's own text.
			const placeText = await read(o, stair);
			await write(o, stair, `${placeText}\n## The fight on the stair\n[[Marta Vey]] watches from the top step.\n\n\`\`\`nimble-encounter\nname: Ambush on the stair\nparty: true\nmonsters:\n- 2 \`5e:Bandit\`\n- [[Drowned One]]\n- Goblin Warrior\n\`\`\`\n`);

			// The session: the party filled in from the sheets, the quest it moved, a recap that names her.
			await h.openPicker(o, `${C}/Sessions`);
			await o.page.locator('.nimble-new-note .nimble-name-input').press('Enter');
			await o.waitFor(() => exists(o, session), { what: 'the session' });
			const sText = await read(o, session);
			assert.match(sText, /party: \n {2}- "\[\[Bryn Ashby\]\]"\n {2}- "\[\[Wren Hale\]\]"/);
			await write(o, session, sText.replace('*What happened, for next time.*', '- Took [[The Drowned Bell]] from [[Marta Vey]] at [[The Salt Stair]].'));
			await setFm(o, session, { quests: ['[[The Drowned Bell]] advanced'], next: 'Down the stair.' });

			// Both ways, as Obsidian sees them: every note links where it should.
			await o.waitFor(async () => { const l = await links(bell); return l.includes(marta) && l.includes(stair); }, { what: 'the quest links its giver and place' });
			await o.waitFor(async () => (await links(marta)).includes(stair), { what: 'the NPC links her place' });
			await o.waitFor(async () => { const l = await links(session); return [bell, marta, stair, bryn, wren].every(p => l.includes(p)); }, { what: 'the session links the quest, the NPC, the place and the party' });
			// (Links inside a block, like the fight's [[Drowned One]], are the block's: Obsidian doesn't count them.)
			await o.waitFor(async () => (await links(stair)).includes(marta), { what: 'the place links her' });

			// The cards say the same: the quest's giver and place, the place's people and read-aloud, the NPC's place, the session's table.
			await o.openFile(bell, 'preview');
			const qc = view(o, '.ev-cq.kind-quest');
			await o.waitFor(async () => /Given by[\s\S]*Marta Vey[\s\S]*Where[\s\S]*The Salt Stair/i.test(await qc.locator('.ev-cq-facts').innerText().catch(() => '')), { what: 'the quest card' });
			await o.openFile(stair, 'preview');
			const pc = view(o, '.ev-cq.kind-location');
			await o.waitFor(async () => /Marta Vey/.test(await pc.locator('.ev-cq-whos').innerText().catch(() => '')), { what: 'who\'s here' });
			assert.match(await pc.locator('.ev-cq-read').innerText(), /A bell tolls/);
			// The fight there: rated for the party, our monster found; Run, then the NPC joins from her card.
			const enc = view(o, '.dnd5e-encounter');
			await o.waitFor(async () => (await enc.locator('.dnd5e-encounter-xp').count()) === 3, { what: 'three groups rated' });
			assert.match(await enc.locator('.dnd5e-encounter-party').innerText(), /2 heroes, level 2/);
			await enc.locator('button', { hasText: 'Run' }).click();
			await o.waitFor(async () => (await fight(o)).length === 6, { what: 'the monsters and the party in the fight' });
			await o.openFile(marta, 'preview');
			const npcCard = view(o, '.nimble-npc-card');
			await o.waitFor(async () => /Found at[\s\S]*The Salt Stair/i.test(await npcCard.innerText().catch(() => '')), { what: 'Found at' });
			await o.waitFor(async () => (await npcCard.locator('.dnd5e-npc-ac b').innerText().catch(() => '')) === '16', { what: 'her mini sheet' });
			await npcCard.locator('button.dnd5e-npc-fight').click();
			await o.waitFor(async () => (await fight(o)).some(c => c.label === 'Marta Vey' && c.ac === 16), { what: 'Marta in the fight' });
			assert.deepEqual((await fight(o)).map(c => c.name).sort(), ['Bandit', 'Bandit', 'Bryn Ashby', 'Drowned One', 'Goblin Warrior', 'Marta Vey', 'Wren Hale']);
			await o.openFile(session, 'preview');
			const sc = view(o, '.ev-cq.kind-session');
			await o.waitFor(async () => (await sc.locator('.ev-cq-who').count()) === 2, { what: 'the table on the session card' });
			assert.match(await sc.locator('.ev-cq-thread').innerText(), /The Drowned Bell\s*Advanced/i);
			assert.match(await sc.locator('.ev-cq-recap').innerText(), /Took The Drowned Bell from Marta Vey at The Salt Stair/);
			// The panel: the open quest, and the NPC, place, monster and session in their folders.
			await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-quest`).count()) === 1, { what: 'the open quest in the panel' });
			for (const p of [marta, stair, drowned, session, bell]) await crow(o, p).waitFor();
			await shot(o, 'adventure');

			// Rename the NPC from the panel: the quest's giver, the session's recap and the place's people follow.
			await crow(o, marta).click({ button: 'right' });
			await clickMenu(o, 'Rename…');
			await o.page.locator('.nimble-name-prompt .nimble-name-input').fill('Marta Salt');
			await o.page.locator('.nimble-name-prompt .nimble-name-input').press('Enter');
			marta = P('NPCs/Marta Salt');
			await o.waitFor(() => exists(o, marta), { what: 'the NPC renamed' });
			await waitFm(o, bell, f => f.giver === '[[Marta Salt]]', 'the quest\'s giver updated');
			await o.waitFor(async () => /\[\[Marta Salt\]\]/.test(await read(o, session)), { what: 'the session\'s recap updated' });
			await o.openFile(stair, 'preview');
			await o.waitFor(async () => /Marta Salt/.test(await view(o, '.ev-cq.kind-location .ev-cq-whos').innerText().catch(() => '')), { what: 'who\'s here, renamed' });
			await o.openFile(bell, 'preview');
			await o.waitFor(async () => /Marta Salt/.test(await view(o, '.ev-cq.kind-quest .ev-cq-facts').innerText().catch(() => '')), { what: 'the quest card, renamed' });
			// Her card still has her stats, now under her new name.
			await o.openFile(marta, 'preview');
			await o.waitFor(async () => (await view(o, '.nimble-npc-card .dnd5e-npc-ac b').innerText().catch(() => '')) === '16', { what: 'her mini sheet after the rename' });

			// Rename the place: the NPC's location, the quest's place and the session follow.
			await crow(o, stair).click({ button: 'right' });
			await clickMenu(o, 'Rename…');
			await o.page.locator('.nimble-name-prompt .nimble-name-input').fill('The Salt Steps');
			await o.page.locator('.nimble-name-prompt .nimble-name-input').press('Enter');
			stair = P('Locations/The Salt Steps');
			await o.waitFor(() => exists(o, stair), { what: 'the place renamed' });
			await waitFm(o, marta, f => f.location === '[[The Salt Steps]]', 'the NPC\'s location updated');
			await waitFm(o, bell, f => f.location === '[[The Salt Steps]]', 'the quest\'s place updated');
			await o.openFile(stair, 'preview');
			await o.waitFor(async () => /Marta Salt/.test(await view(o, '.ev-cq.kind-location .ev-cq-whos').innerText().catch(() => '')), { what: 'who\'s here at the renamed place' });
			// The fight block inside it still finds its monsters.
			await o.waitFor(async () => (await view(o, '.dnd5e-encounter .dnd5e-encounter-xp').count()) === 3 && (await view(o, '.dnd5e-encounter-missing').count()) === 0, { what: 'the fight still resolves' });

			// Delete the quest: the session's card still draws, naming it; the panel has no open quests.
			await crow(o, bell).click({ button: 'right' });
			await clickMenu(o, 'Delete');
			await o.page.locator('.modal-container button', { hasText: exact('Delete') }).click();
			await o.waitFor(async () => !(await exists(o, bell)), { what: 'the quest deleted' });
			await o.waitFor(async () => (await o.page.locator(`${CP} .campaign-quest`).count()) === 0, { what: 'no open quests' });
			await o.openFile(session, 'preview');
			await o.waitFor(async () => /The Drowned Bell/.test(await view(o, '.ev-cq.kind-session .ev-cq-thread').innerText().catch(() => '')), { what: 'the session card without the quest note' });
			// Delete the NPC: the place's card draws with nobody there.
			await o.eval(async (app, _p, p) => { await app.vault.delete(app.vault.getAbstractFileByPath(p)); }, marta);
			await o.openFile(stair, 'preview');
			await o.waitFor(async () => (await view(o, '.ev-cq.kind-location').count()) === 1 && (await view(o, '.ev-cq.kind-location .ev-cq-whos').count()) === 0, { what: 'the place card without her' });
			assert.match(await view(o, '.ev-cq.kind-location .ev-cq-read').innerText(), /A bell tolls/);
		});
		await o.eval((app, _p, v) => app.vault.setConfig('alwaysUpdateLinks', v), updateLinks ?? false);
	});

	// -----------------------------------------------------------------------
	// Maps

	/** A small PNG in the vault, drawn on a canvas so the map has real pixels. */
	const pngAt = (o, path) => o.eval(async (app, _p, path) => {
		const c = document.createElement('canvas'); c.width = 400; c.height = 300;
		c.getContext('2d').fillRect(0, 0, 400, 300);
		const blob = await new Promise(r => c.toBlob(r, 'image/png'));
		await app.vault.createBinary(path, await blob.arrayBuffer());
	}, path);

	test('entities 5e: map: New → Map in a chapter picks the campaign\'s image; pins to a place and an NPC open quick looks; the 5e fight shows as tokens', async (o) => {
		const C = 'Campaigns/E5 Harbour Map';
		const map = `${C}/Chapter 1/Harbour Map.md`;
		const M = `${MAIN} ${R}`;
		await scenario(o, 'map', [C], async () => {
			await campaign5e(o, 'E5 Harbour Map', { edition: '2024', level: 2 });
			await pngAt(o, `${C}/Assets/harbour.png`);
			await write(o, `${C}/Locations/The Salt Stair.md`, '---\nnimble: location\nread_aloud: Worn steps.\n---\nSteps into the sea.\n');
			await write(o, `${C}/NPCs/Marta Vey.md`, '---\nnimble: npc\nrole: Harbour master\nac: 15\nhp: 30\n---\nShe runs the harbour.\n');
			// Create: New on the chapter's +, Map, the image picked from the campaign's files (once the panel lists it).
			await o.page.locator(`${CP} [data-path="${C}/Assets/harbour.png"]`).waitFor({ timeout: 5000 });
			await h.openPicker(o, `${C}/Chapter 1`);
			await o.page.locator('.nimble-new-note .nimble-starter[data-kind="map"]').click();
			await o.page.locator('.nimble-new-note .nimble-starter-map select').selectOption(`${C}/Assets/harbour.png`);
			await h.createFromPicker(o, 'Harbour Map');
			await o.waitFor(() => exists(o, map), { what: 'the map note' });
			assert.match(await read(o, map), /nimble: map[\s\S]*```nimble-map\nimage: \[\[harbour\.png\]\]\npins:/);
			// Pins written into the block: the place and the NPC.
			await write(o, map, (await read(o, map)).replace('pins:\n', 'pins:\n- 40, 60 | The stair | [[The Salt Stair]] | place\n- 70, 30 | Marta | [[Marta Vey]] | npc\n'));
			await o.openFile(map, 'preview');
			await o.waitFor(() => o.page.evaluate((M) => { const img = document.querySelector(`${M} .nimble-map img`); return !!img && img.naturalWidth > 0; }, M), { what: 'the map image' });
			const pins = o.page.locator(`${M} .nimble-map-pin .nimble-map-pin-inner`);
			await o.waitFor(async () => (await pins.count()) === 2, { what: 'two pins' });
			assert.ok(await o.page.locator(`${M} .nimble-map`).first().evaluate(n => !!n.closest('.ev-sys-dnd5e')), 'the map in 5e\'s look');
			// The chapter in the panel has a button for its map.
			await o.waitFor(async () => (await cgroup(o, `${C}/Chapter 1`).locator('[aria-label*="Harbour Map"]').count()) >= 1, { what: 'the map on its chapter in the panel' });
			// A pin opens a quick look of its note, over the map.
			await pins.first().click();
			const look = o.page.locator('.modal.nimble-record-modal');
			await look.waitFor({ timeout: 3000 });
			assert.match(await look.locator('.record-title').innerText(), /The Salt Stair/);
			assert.equal(await o.eval((app) => app.workspace.getActiveFile()?.path), map, 'still on the map');
			await o.page.keyboard.press('Escape');
			await look.waitFor({ state: 'detached', timeout: 3000 });
			// The fight as tokens: the NPC added from her card, and a monster.
			await o.openFile(`${C}/NPCs/Marta Vey.md`, 'preview');
			await view(o, '.nimble-npc-card button.dnd5e-npc-fight').click();
			await o.eval(async (app, plugin) => { const rt = plugin.runtime('dnd5e'); await rt.addToFight(rt.get('Goblin Warrior')); });
			await o.waitFor(async () => (await fight(o)).length === 2, { what: 'two in the fight' });
			await o.openFile(map, 'preview');
			await o.page.locator(`${M} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`).click();
			await o.waitFor(async () => (await o.page.locator(`${M} .nimble-map-token .nimble-map-token-name`).allInnerTexts()).sort().join() === 'Goblin Warrior,Marta Vey', { what: 'the fight as tokens' });
			await shot(o, 'map');
		});
	});

	// -----------------------------------------------------------------------
	// Gaps the entity tests found, now closed.

	test('entities 5e: the compendium is the picker — the tracker\'s Add monster opens it on Monsters, "2 goblin warrior" adds two, Cmd/Ctrl+Enter keeps it open', async (o) => {
		const C = 'Campaigns/E5 Picker';
		await scenario(o, 'picker', [C], async () => {
			await campaign5e(o, 'E5 Picker', { edition: '2024', level: 1, starter: false });
			await o.eval((app, plugin) => plugin.runtime('dnd5e').openTracker());
			await o.page.locator(`${TR} button`, { hasText: 'Add monster' }).first().click();
			const M = '.modal.dnd5e-cmpx-modal';
			await o.page.locator(`${M} .nimble-cmpx-input`).waitFor({ timeout: 3000 });
			assert.equal(await o.page.locator(`${M} .modal-title`).innerText(), 'Add to the fight');
			// Only monsters: a spell's name finds nothing.
			await o.page.locator(`${M} .nimble-cmpx-input`).fill('fireball');
			await o.page.waitForTimeout(300);
			assert.equal(await o.page.locator(`${M} .nimble-cmpx-row[data-id^="spell:"]`).count(), 0, 'no spells offered');
			// Cmd/Ctrl+Enter adds and keeps the dialog open; Enter adds and closes.
			await o.page.locator(`${M} .nimble-cmpx-input`).fill('bandit captain');
			await o.waitFor(async () => (await o.page.locator(`${M} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === 'Bandit Captain', { what: 'the captain selected' });
			await o.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
			await o.waitFor(async () => (await fight(o)).length === 1, { what: 'the captain added' });
			assert.equal(await o.page.locator(M).count(), 1, 'still open');
			await o.page.locator(`${M} .nimble-cmpx-input`).fill('2 goblin warrior');
			await o.waitFor(async () => (await o.page.locator(`${M} .nimble-cmpx-row.is-selected .nimble-cmpx-row-name > span:first-child`).textContent().catch(() => '')) === 'Goblin Warrior', { what: 'the goblin warrior selected' });
			await o.page.keyboard.press('Enter');
			await o.page.locator(M).waitFor({ state: 'detached' });
			await o.waitFor(async () => (await fight(o)).length === 3, { what: 'two goblin warriors more' });
			assert.deepEqual((await fight(o)).map(c => c.name).sort(), ['Bandit Captain', 'Goblin Warrior', 'Goblin Warrior']);
		});
	});

	test('entities 5e: renaming a note a map pin and an encounter block link to updates them; the pin opens the place under its new name', async (o) => {
		const C = 'Campaigns/E5 Rename Map';
		const map = `${C}/Harbour Map.md`;
		const fightNote = `${C}/Ambush.md`;
		const M = `${MAIN} ${R}`;
		const was = await o.eval((app) => app.vault.getConfig('alwaysUpdateLinks'));
		await scenario(o, 'rename-map', [C], async () => {
			await campaign5e(o, 'E5 Rename Map', { edition: '2024', level: 2, starter: false });
			await pngAt(o, `${C}/harbour.png`);
			await write(o, `${C}/The Salt Stair.md`, '---\nnimble: location\n---\nSteps into the sea.\n');
			const mapText = (name) => `---\nnimble: map\n---\n\`\`\`nimble-map\nimage: [[harbour.png]]\npins:\n- 40, 60 | The stair | [[${name}]] | place\n\`\`\`\n`;
			const fightText = (name) => `\`\`\`nimble-encounter\nname: Ambush\nwhere: [[${name}]]\nmonsters:\n- 2 Bandit\n\`\`\`\n`;
			await write(o, map, mapText('The Salt Stair'));
			await write(o, fightNote, fightText('The Salt Stair'));
			await o.eval(async (app, _p, C) => { app.vault.setConfig('alwaysUpdateLinks', true); await app.fileManager.renameFile(app.vault.getAbstractFileByPath(`${C}/The Salt Stair.md`), `${C}/The Salt Steps.md`); }, C);
			await o.waitFor(() => exists(o, `${C}/The Salt Steps.md`), { what: 'the rename' });
			await o.waitFor(async () => (await read(o, map)) === mapText('The Salt Steps'), { what: 'the pin follows', timeout: 8000 });
			await o.waitFor(async () => (await read(o, fightNote)) === fightText('The Salt Steps'), { what: 'the encounter\'s where: follows' });
			await o.openFile(map, 'preview');
			await o.page.locator(`${M} .nimble-map-pin .nimble-map-pin-inner`).first().waitFor({ state: 'visible', timeout: 10000 });
			await o.page.locator(`${M} .nimble-map-pin .nimble-map-pin-inner`).first().click();
			const look = o.page.locator('.modal.nimble-record-modal');
			await look.waitFor({ timeout: 3000 });
			assert.equal(await look.locator('.record-title').innerText(), 'The Salt Steps');
			await shot(o, 'map-pin-rename');
		});
		await o.eval((app, _p, v) => app.vault.setConfig('alwaysUpdateLinks', v), was ?? false);
	});

	test('entities 5e: an NPC listed in an encounter block — under her own name with her own AC and HP, counted in the XP, run in from the HP she has left; NPCs of other campaigns stay unknown', async (o) => {
		const C = 'Campaigns/E5 NPC Fight';
		const OTHER = 'Campaigns/E5 NPC Elsewhere';
		const npc = `${C}/NPCs/Marta Vey.md`;
		await scenario(o, 'npc-fight', [C, OTHER], async () => {
			await campaign5e(o, 'E5 NPC Elsewhere', { edition: '2024', level: 2, starter: false });
			await write(o, `${OTHER}/NPCs/Hask Morrow.md`, '---\nnimble: npc\nstatblock: Bandit\n---\n');
			await campaign5e(o, 'E5 NPC Fight', { edition: '2024', level: 2, starter: false });
			await write(o, npc, '---\nnimble: npc\nrole: Harbour master\nstatblock: Bandit Captain\nac: 16\nhp_now: 30\n---\n');
			// By link, by name; Hask lives in another campaign, so this one can't see him.
			await write(o, `${C}/Ambush.md`, '```nimble-encounter\nname: Ambush\nmonsters:\n- [[Marta Vey]]\n- 2 Bandit\n- Hask Morrow\n```\n');
			await o.waitFor(() => o.eval((app, plugin, p) => plugin.campaigns.npcs.some(n => n.path === p), npc), { what: 'Marta indexed as an NPC' });
			const captain = await o.eval((app, plugin, p) => { const m = plugin.runtime('dnd5e').get('Bandit Captain', p).monster; return { hp: m.hp }; }, npc);
			await o.openFile(`${C}/Ambush.md`, 'preview');
			const enc = view(o, '.dnd5e-encounter');
			await enc.waitFor({ timeout: 5000 });
			const her = enc.locator('.dnd5e-encounter-row').filter({ has: o.page.locator('.dnd5e-ref.is-npc') });
			await o.waitFor(async () => (await her.count()) === 1, { what: 'Marta\'s row' });
			assert.equal(await her.locator('.nimble-inline-name').innerText(), 'Marta Vey');
			assert.match(await her.innerText(), new RegExp(`AC 16[\\s\\S]*HP ${captain.hp}`), 'her own AC, the captain\'s HP');
			assert.match(await enc.locator('.dnd5e-encounter-missing').innerText(), /^Not found: Hask Morrow$/);
			// Counted: her XP is in the total with the bandits'.
			const xps = (await enc.locator('.dnd5e-encounter-xp').allInnerTexts()).map(t => Number(t.replace(/[^\d]/g, '')));
			assert.equal(xps.length, 2);
			assert.ok(xps[0] > 0, 'Marta is worth XP');
			assert.equal(Number((await enc.locator('.dnd5e-encounter-sum').innerText()).replace(/[^\d]/g, '')), xps[0] + xps[1]);
			// A click on her name is a quick look at her note.
			await her.locator('.nimble-inline-name').click();
			const look = o.page.locator('.modal.nimble-record-modal');
			await look.waitFor({ timeout: 3000 });
			assert.equal(await look.locator('.record-title').innerText(), 'Marta Vey');
			await o.page.keyboard.press('Escape');
			await look.waitFor({ state: 'detached' });
			// Run: Marta under her own name, her AC, from the 30 HP her note says she has left; and two bandits.
			await enc.locator('.dnd5e-encounter-actions button', { hasText: 'Run' }).click();
			await o.waitFor(async () => (await fight(o)).length === 3, { what: 'three in the fight' });
			const marta = (await fight(o)).find(c => c.name === 'Marta Vey');
			assert.ok(marta, 'Marta in the fight');
			assert.deepEqual([marta.ac, marta.hp, marta.maxHp], [16, 30, captain.hp]);
			assert.equal((await fight(o)).filter(c => /^Bandit/.test(c.name)).length, 2);
		});
	});

	test('entities 5e: a player\'s battle note — how it went, who you fought (as lore), where, loot, notes, and Edit, written back to the block', async (o) => {
		const C = 'Campaigns/E5 Battle Notes';
		const note = `${C}/Session 1.md`;
		await scenario(o, 'battle-notes', [C], async () => {
			await campaign5e(o, 'E5 Battle Notes', { edition: '2024', role: 'player', level: 2, starter: false });
			await write(o, `${C}/The Ford.md`, '---\nnimble: location\n---\n');
			await write(o, note, '```nimble-encounter\nname: Ambush at the ford\noutcome: won\nwhere: [[The Ford]]\nloot: 40 gp, a silver key\nmonsters:\n- 4 Goblin Warrior\n- Mystery Hag\nnotes: The shaman fled north.\n```\n');
			await o.openFile(note, 'preview');
			const enc = view(o, '.dnd5e-encounter.dnd5e-battle-notes');
			await enc.waitFor({ timeout: 5000 });
			// 5e's page with what a player keeps: no rating, numbers, Run or Add to fight.
			assert.equal(await enc.locator('.nimble-difficulty, .dnd5e-encounter-xp, .dnd5e-encounter-stats, .dnd5e-encounter-total').count(), 0);
			assert.deepEqual(await enc.locator('button').allInnerTexts().then(t => t.map(x => x.trim().toLowerCase())), ['won', 'edit']);
			assert.equal(await enc.evaluate(el => el.classList.contains('ev-sys-dnd5e')), true);
			// Who: the goblin warriors as a lore reference (no CR), the hag as written.
			const rows = enc.locator('.dnd5e-encounter-row');
			assert.equal(await rows.count(), 2);
			assert.match(await rows.nth(0).innerText(), /4×\s*Goblin Warrior/);
			assert.equal(await rows.nth(0).locator('.dnd5e-ref.nimble-inline-found').count(), 1);
			assert.equal(await rows.nth(0).locator('.nimble-inline-level').count(), 0, 'no CR for a player');
			assert.match(await rows.nth(1).locator('.battle-foe-name').innerText(), /^Mystery Hag$/);
			// Where (a link to the place), loot, notes.
			assert.equal(await enc.locator(`.battle-fact a.nimble-wikilink[href="${C}/The Ford.md"]`).count(), 1);
			assert.match(await enc.locator('.battle-facts').innerText(), /The Ford[\s\S]*40 gp, a silver key/);
			assert.match(await enc.locator('.dnd5e-encounter-notes').innerText(), /The shaman fled north\./);
			await shot(o, 'battle-notes', enc);
			// Its pills (how it went, the place, Edit) sit on their capitals.
			assert.deepEqual(await o.page.evaluate(pillOffenders, { root: `${MAIN} ${R} .dnd5e-battle-notes`, tolerance: 1, selectors: PILL_SELECTORS }), []);

			// How it went, from the pill: Fled.
			await enc.locator('button.battle-outcome').click();
			await clickMenu(o, 'Fled');
			await o.waitFor(async () => /\noutcome: fled\n/.test(await read(o, note)), { what: 'outcome: fled' });
			await o.waitFor(async () => /fled/i.test(await enc.locator('button.battle-outcome').innerText().catch(() => '')), { what: 'the pill redrawn' });

			// Edit: the dialog in 5e's look. Two hired thugs more (as typed), when, saved into the block; the rest kept.
			await enc.locator('button', { hasText: 'Edit' }).click();
			const m = o.page.locator('.modal.nimble-battle-modal');
			await m.waitFor();
			assert.equal(await m.evaluate(el => el.classList.contains('ev-sys-dnd5e')), true);
			const add = m.locator('.battle-modal-add');
			await add.fill('Hired Thug');
			await add.press('Enter');
			await m.locator('.battle-modal-foe', { hasText: 'Hired Thug' }).locator('button[aria-label="One more Hired Thug"]').click();
			await m.locator('.setting-item', { hasText: 'When' }).locator('input').fill('Day 3');
			await m.locator('.battle-modal-save').click();
			await m.waitFor({ state: 'detached' });
			await o.waitFor(async () => /- 2 Hired Thug/.test(await read(o, note)), { what: 'the thugs written' });
			const text = await read(o, note);
			assert.match(text, /^```nimble-encounter\nname: Ambush at the ford\n/);
			for (const line of ['outcome: fled', 'where: [[The Ford]]', 'loot: 40 gp, a silver key', 'when: Day 3', '- 4 Goblin Warrior', '- 1 Mystery Hag', 'notes: The shaman fled north.']) assert.ok(text.includes(line), line);
			await o.waitFor(async () => (await view(o, '.dnd5e-battle-notes .dnd5e-encounter-row').count()) === 3, { what: 'three rows of foes' });
		});
	});
}
