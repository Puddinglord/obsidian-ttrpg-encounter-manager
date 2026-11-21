// 5e's own e2e suites, run by run.mjs in the same Obsidian (see "Suites in their own files" there).
//
// The builders for your own character content: New on the compendium's Classes tab builds a class and a
// subclass, the pencil on their blocks reopens them, and a hero is made and levelled with both.

/** @param {(name: string, fn: (o: any) => Promise<void>) => void} test */
export function register(test, { R, ARTIFACTS, assert, join, pillOffenders, PILL_SELECTORS }) {
	const read = (o, path) => o.eval((app, _p, path) => app.vault.adapter.read(path), path);

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
}
