// Screenshots of the builders and dialogs (the design study's "Builders & dialogs" tab), in both games:
// the encounter builder, Add several, the roll dialog and its result, homebrew blocks, references and their
// hover cards, the entity builder, the party editor, and map tokens. Opens the sample vault in a hidden
// Obsidian (harness.mjs) and adds a 5e campaign to it for the 5e shots.
//
//   node e2e/tools-shots.mjs [outDir] [filter]     (default outDir: prototypes/design-study/shots)
//   THEME=dark node e2e/tools-shots.mjs /tmp/x builder
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchObsidian } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'prototypes', 'design-study', 'shots');
const filter = process.argv[3];
const wanted = (name) => !filter || filter.split(',').some(f => name.includes(f));
mkdirSync(OUT, { recursive: true });

const NQ = 'Campaigns/The Old Quarter';
const X5 = 'Campaigns/Sword Coast';
const R = '.workspace-leaf.mod-active .markdown-reading-view';

const o = await launchObsidian({ vaultDir: join(ROOT, 'sample-vault') });
const { page } = o;

async function size(w, h, { phone = false } = {}) {
	await page.setViewportSize({ width: w, height: h });
	await page.evaluate((p) => {
		document.body.classList.toggle('is-phone', p);
		document.body.classList.toggle('is-mobile', p);
	}, phone);
}

async function theme(dark) {
	await page.evaluate((d) => { document.body.classList.toggle('theme-dark', d); document.body.classList.toggle('theme-light', !d); }, dark);
}

async function clean() {
	await o.eval(async (app, plugin) => {
		document.querySelectorAll('.menu, .notice').forEach(n => n.remove());
		document.querySelectorAll('.modal-container').forEach(n => n.remove());
		plugin.hover.hide();
		const leaves = [];
		app.workspace.iterateRootLeaves(l => leaves.push(l));
		leaves.slice(1).forEach(l => l.detach());
		app.workspace.leftSplit.collapse();
		app.workspace.rightSplit.collapse();
	});
	await page.mouse.move(2, 2);
	await page.waitForTimeout(250);
}

async function open(path, mode = 'preview') {
	await o.openFile(path, mode);
	await page.waitForTimeout(900);
}

/** Shoot an element with a margin of the page around it. */
async function shoot(name, locator, pad = 16) {
	if (!wanted(name)) return;
	const box = await locator.boundingBox();
	if (!box) { console.warn('no box for', name); return; }
	const vp = page.viewportSize();
	const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
	const clip = { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height: Math.min(vp.height - y, box.height + pad * 2) };
	await page.screenshot({ path: join(OUT, `${name}.png`), clip });
	console.log('shot', name, `${Math.round(clip.width)}x${Math.round(clip.height)}`);
}
async function shootPage(name) {
	if (!wanted(name)) return;
	await page.screenshot({ path: join(OUT, `${name}.png`) });
	console.log('shot', name);
}

try {
	// Setup: a 5e campaign with homebrew, references and a map; Nimble homebrew and references in the Old Quarter.
	await o.eval(async (app, plugin, [NQ, X5]) => {
		await plugin.campaigns.createCampaign({ name: 'Sword Coast', level: 3, heroes: 4, starter: false, system: '5e', edition: '2024' });
		await app.vault.create(`${X5}/Homebrew.md`, [
			'# Homebrew', '',
			'```5e-spell', 'name: Ember Lash', 'level: 1', 'school: Evocation', 'casting time: Action', 'range: 30 feet', 'components: V, S',
			'duration: Instantaneous', 'classes: Sorcerer, Wizard', '',
			'A whip of fire cracks at one creature you can see within range. Make a ranged spell attack. On a hit, the target takes 2d8 Fire damage.', '',
			'Using a Higher-Level Spell Slot: The damage increases by 1d8 for each spell slot level above 1.', '```', '',
			'```5e-item', 'name: Ember Blade', 'type: Weapon (Longsword)', 'rarity: Uncommon', 'attunement: yes', '',
			'This blade glows like a coal. You gain a +1 bonus to attack and damage rolls made with it, and it deals an extra 1d6 Fire damage on a hit.', '```', '',
		].join('\n'));
		await app.vault.create(`${X5}/Ambush.md`, [
			'# The bridge', '',
			'Two `5e:Goblin Warrior` hold the far end; a `5e:Bugbear Warrior` waits in the reeds. The hedge mage casts `5e:spell:Fire Bolt`, and the chest holds a `5e:item:Potion of Healing`.', '',
			'```nimble-encounter', 'name: Bridge', 'monsters:', '- 2 `5e:Goblin Warrior`', '- 1 `5e:Bugbear Warrior`', '```', '',
		].join('\n'));
		const map = app.vault.getAbstractFileByPath(`${NQ}/Assets/quicksilver-vaults-map.png`);
		await app.vault.create(`${X5}/Bridge Map.md`, `\`\`\`nimble-map\nimage: [[${map.name}]]\npins:\n- 31.1, 9.4 | The bridge | [[Ambush]] | encounter\n- 69, 51.7 | Reed bank | | danger\n\`\`\`\n`);
		await app.vault.create(`${NQ}/Homebrew.md`, [
			'# Homebrew', '',
			'```nimble-spell', 'name: Quicksilver Lash', 'school: Fire', 'tier: 1', 'actions: 2', 'range: 8',
			'damage: 2d10', 'upcast: +1d10 per extra mana.', 'text: A rope of molten silver lashes one creature. On a crit, it is Smoldering.', '```', '',
			'```nimble-item', 'name: Alchemist\'s Fuse', 'kind: magic', 'rarity: Uncommon', 'charges: 3', 'cost: 120 gp',
			'text: Light it and throw: 2d6 fire damage to everything within 2 spaces. Each time you use a charge, roll a d6. On a 1, it goes off in your hand.', '```', '',
			'A `nimble:Quicksilver Hound` circles; the `nimble:Mercury Ooze` waits. Wren casts `nimble:spell:Flame Dart` with `nimble:item:Healing Potion` in her belt.', '',
		].join('\n'));
	}, [NQ, X5]);
	await page.waitForTimeout(1500);

	for (const dark of process.env.THEME === 'dark' ? [true] : [false]) {
		await theme(dark);
		const t = dark ? '-dark' : '';

		// ---- Nimble ----
		await size(1200, 860);
		await clean();
		await open(`${NQ}/Homebrew.md`);
		await o.eval(async (app, plugin, NQ) => { await plugin.campaigns.setActive(NQ); }, NQ);
		await page.waitForTimeout(500);
		const hb = page.locator(`${R} .nimble-homebrew`);
		if (await hb.count()) {
			await shoot(`nimble-homebrew-spell${t}`, hb.nth(0), 12);
			await shoot(`nimble-homebrew-item${t}`, hb.nth(1), 12);
		}
		// References and a hover card.
		const ref = page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Hound' }).first();
		if (await ref.count()) {
			await shoot(`nimble-refs${t}`, page.locator(`${R} p`, { hasText: 'circles' }).first(), 10);
			await ref.hover();
			await page.waitForSelector('.nimble-hover-preview', { timeout: 4000 }).catch(() => {});
			await page.waitForTimeout(500);
			await shoot(`nimble-hover${t}`, page.locator('.nimble-hover-preview').first(), 12);
		}

		// The encounter builder.
		await clean();
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:build-encounter'));
		await page.waitForSelector('.modal.nimble-builder-modal');
		await page.locator('.nimble-builder-modal .builder-search').fill('quicksilver');
		await page.waitForTimeout(300);
		await page.locator('.nimble-builder-modal .builder-result').first().click();
		await page.locator('.nimble-builder-modal .builder-result').first().click();
		await page.locator('.nimble-builder-modal .builder-result').nth(1).click();
		await page.locator('.nimble-builder-modal .builder-search').fill('');
		await page.waitForTimeout(300);
		await page.mouse.move(2, 2);
		await shoot(`nimble-encounter-builder${t}`, page.locator('.modal.nimble-builder-modal'));

		// Add several.
		await clean();
		await open(`${NQ}/Homebrew.md`);
		await o.eval((app, plugin) => {
			const nb = plugin.runtime('nimble');
			const e = nb.index.get('Quicksilver Hound');
			const acts = nb.statblockActions ? null : null;
			return !!e && !!acts;
		});
		await page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Hound' }).first().hover();
		await page.waitForSelector('.nimble-hover-preview .statblock-action-more', { timeout: 4000 });
		await page.locator('.nimble-hover-preview .statblock-action-more').click();
		await page.locator('.menu .menu-item', { hasText: 'Add several' }).click();
		await page.waitForSelector('.modal.nimble-count-modal');
		await page.waitForTimeout(300);
		await shoot(`nimble-add-several${t}`, page.locator('.modal.nimble-count-modal'));

		// The roll dialog and its result, from Brakka's sheet.
		await clean();
		await open(`${NQ}/Party/Brakka.md`);
		const stat = page.locator(`${R} .ns-stat .ns-stat-box`).first();
		if (await stat.count()) {
			await stat.click();
			await page.waitForSelector('.modal.nimble-roll-dialog');
			await page.waitForTimeout(300);
			await shoot(`nimble-roll-dialog${t}`, page.locator('.modal.nimble-roll-dialog'));
			await page.locator('.modal.nimble-roll-dialog .rd-roll').click();
			await page.waitForSelector('.nimble-roll-notice', { timeout: 8000 });
			await page.waitForTimeout(400);
			await shoot(`nimble-roll-result${t}`, page.locator('.notice', { has: page.locator('.nimble-roll-notice') }).first(), 10);
		}

		// The entity builder: New monster, New spell.
		for (const kind of ['monster', 'spell']) {
			await clean();
			await open(`${NQ}/Homebrew.md`);
			await o.eval((app, _p, k) => app.commands.executeCommandById(`nimble-gm:new-${k}`), kind);
			await page.waitForSelector('.nimble-entity-builder .eb-panel.is-active');
			await page.locator('.nimble-entity-builder .eb-panel.is-active input').first().fill(kind === 'monster' ? 'Cave Bear' : 'Silver Spark');
			await page.waitForTimeout(400);
			await shoot(`nimble-builder-${kind}${t}`, page.locator('.modal.nimble-entity-builder'), 0);
		}

		// The party editor (outside a campaign it's a dialog).
		await clean();
		await o.eval(async (app, plugin) => {
			await plugin.campaigns.setActive(null);
			plugin.settings.party = [
				{ id: 'p1', name: 'Brakka', className: 'Berserker', level: 3, maxHp: 34, defense: 13, maxWounds: 6 },
				{ id: 'p2', name: 'Wren', className: 'Mage', level: 3, maxHp: 22, defense: 11, maxWounds: 6 },
				{ id: 'p3', name: 'Tomas', className: 'Hunter', level: 3, maxHp: 27, defense: 14, maxWounds: 6 },
			];
			plugin.openParty();
		});
		await page.waitForSelector('.modal.nimble-party-modal', { timeout: 4000 }).catch(() => {});
		await page.waitForTimeout(300);
		await shoot(`party-editor${t}`, page.locator('.modal.nimble-party-modal'));

		// The character wizard: New character's Stats (DEX picked to swap), and Level up's subclass for Brakka.
		if (wanted(`nimble-new-character${t}`)) {
			await clean();
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-character'));
			const m = page.locator('.modal.nimble-newchar-modal');
			await m.waitFor();
			await m.locator('input.lu-name-input').fill('Lyra Thornwood');
			await m.locator('select[data-k="ancestry"]').selectOption('Elf');
			await m.locator('select[data-k="class"]').selectOption('Hunter');
			await m.locator('.lu-next').click();
			await page.waitForTimeout(500);
			await m.locator('.lu-panel.is-active .ev-seg button', { hasText: 'Balanced' }).click();
			await m.locator('.lu-panel.is-active .lu-place', { hasText: 'DEX' }).locator('.ns-stat-box').click();
			await page.mouse.move(2, 2);
			await page.waitForTimeout(400);
			await shoot(`nimble-new-character${t}`, m);
		}
		if (wanted(`nimble-level-up${t}`)) {
			await clean();
			await open(`Campaigns/Brakka's Journal/Party/Brakka.md`);
			await page.locator(`${R} .nimble-sheet .ns-camp >> visible=true`).first().click();
			await page.locator('.modal.ns-camp-dialog .ns-camp-card', { hasText: 'Level up' }).click();
			const lv = page.locator('.modal.nimble-levelup');
			await lv.waitFor();
			await lv.locator('.lu-dot', { hasText: 'Hit points' }).click();
			await page.waitForTimeout(400);
			await lv.locator('.lu-hp-option', { hasText: 'Take the flat bonus' }).click();
			await lv.locator('.lu-dot', { hasText: 'Subclass' }).click();
			await page.waitForTimeout(500);
			await lv.locator('.lu-panel.is-active .lu-sub-tab', { hasText: 'Red Mist' }).click();
			await lv.locator('.lu-panel.is-active .lu-sub-band-choose').click();
			await page.mouse.move(2, 2);
			await page.waitForTimeout(500);
			await shoot(`nimble-level-up${t}`, lv);
		}

		// Map tokens: the Old Quarter's encounter on its map.
		await clean();
		await o.eval(async (app, plugin, NQ) => {
			await plugin.campaigns.setActive(NQ);
			const nb = plugin.runtime('nimble');
			await nb.addToEncounter(nb.index.get('Quicksilver Hound').monster, undefined, 2);
			await nb.addToEncounter(nb.index.get('Mercury Ooze').monster, undefined, 1);
		}, NQ);
		await open(`${NQ}/1 The Quicksilver Vaults/Map - The Quicksilver Vaults.md`);
		const tokBtn = page.locator(`${R} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`);
		if (await tokBtn.count()) { await tokBtn.click(); await page.waitForTimeout(600); }
		await shoot(`nimble-map${t}`, page.locator(`${R} .nimble-map`).first(), 8);

		// ---- 5e ----
		await clean();
		await open(`${X5}/Homebrew.md`);
		await o.eval(async (app, plugin, X5) => { await plugin.campaigns.setActive(X5); }, X5);
		await page.waitForTimeout(800);
		const hb5 = page.locator(`${R} .block-language-5e-spell, ${R} .block-language-5e-item`);
		if (await hb5.count()) {
			await shoot(`5e-homebrew-spell${t}`, hb5.nth(0), 12);
			await shoot(`5e-homebrew-item${t}`, hb5.nth(1), 12);
		}
		await open(`${X5}/Ambush.md`);
		await shoot(`5e-refs${t}`, page.locator(`${R} p`, { hasText: 'far end' }).first(), 10);
		const ref5 = page.locator(`${R} .dnd5e-ref .nimble-inline-name`).first();
		if (await ref5.count()) {
			await ref5.hover();
			await page.waitForSelector('.nimble-hover-preview', { timeout: 4000 }).catch(() => {});
			await page.waitForTimeout(500);
			await shoot(`5e-hover${t}`, page.locator('.nimble-hover-preview').first(), 12);
		}
		// A roll's result in 5e: a d20 from the stat block in the hover card.
		await clean();
		await o.eval((app, plugin) => plugin.rollDice('1d20+4', 'Goblin Warrior · Scimitar', 'attack'));
		await page.waitForSelector('.nimble-roll-notice', { timeout: 8000 });
		await page.waitForTimeout(400);
		await shoot(`5e-roll-result${t}`, page.locator('.notice', { has: page.locator('.nimble-roll-notice') }).first(), 10);

		for (const kind of ['monster', 'spell']) {
			await clean();
			await open(`${X5}/Homebrew.md`);
			await o.eval((app, _p, k) => app.commands.executeCommandById(`nimble-gm:new-${k}`), kind);
			await page.waitForSelector('.nimble-entity-builder .eb-panel.is-active');
			await page.locator('.nimble-entity-builder .eb-panel.is-active input').first().fill(kind === 'monster' ? 'Ember Hound' : 'Cinder Ward');
			await page.waitForTimeout(400);
			await shoot(`5e-builder-${kind}${t}`, page.locator('.modal.nimble-entity-builder'), 0);
		}

		// 5e map tokens: run the bridge fight, then its map.
		await clean();
		await open(`${X5}/Ambush.md`);
		const run = page.locator(`${R} .dnd5e-encounter button`, { hasText: 'Run' });
		if (await run.count()) { await run.first().click(); await page.waitForTimeout(800); }
		await clean();
		await open(`${X5}/Bridge Map.md`);
		const tok5 = page.locator(`${R} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`);
		if (await tok5.count()) { await tok5.click(); await page.waitForTimeout(600); }
		await shoot(`5e-map${t}`, page.locator(`${R} .nimble-map`).first(), 8);

		// Phones: the encounter builder and the entity builder.
		await clean();
		await size(390, 844, { phone: true });
		await o.eval(async (app, plugin, NQ) => { await plugin.campaigns.setActive(NQ); }, NQ);
		await open(`${NQ}/Homebrew.md`);
		await o.eval((app) => app.commands.executeCommandById('nimble-gm:build-encounter'));
		await page.waitForSelector('.modal.nimble-builder-modal');
		await page.locator('.nimble-builder-modal .builder-search').fill('quicksilver');
		await page.waitForTimeout(300);
		await page.locator('.nimble-builder-modal .builder-result').first().click();
		await page.locator('.nimble-builder-modal .builder-search').fill('');
		await page.waitForTimeout(300);
		await shootPage(`nimble-encounter-builder-phone${t}`);

		// The roll dialog at a phone's width, from Brakka's sheet (the desktop dialog: the sheet doesn't draw under
		// the emulated phone classes alone).
		await clean();
		await size(390, 844);
		await open(`${NQ}/Party/Brakka.md`);
		const pstat = page.locator('.ns-stat-box:visible').first();
		if (await pstat.count() && wanted(`nimble-roll-dialog-phone${t}`)) {
			await pstat.click();
			await page.waitForSelector('.modal.nimble-roll-dialog');
			await page.locator('.modal.nimble-roll-dialog .rd-mode-btn', { hasText: 'Save' }).click();
			await page.waitForTimeout(400);
			await shootPage(`nimble-roll-dialog-phone${t}`);
		}
		await size(390, 844, { phone: true });

		// New character on a phone: the Stats step.
		if (wanted(`nimble-new-character-phone${t}`)) {
			await clean();
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-character'));
			const m = page.locator('.modal.nimble-newchar-modal');
			await m.waitFor();
			await m.locator('input.lu-name-input').fill('Lyra Thornwood');
			await m.locator('select[data-k="class"]').selectOption('Hunter');
			await m.locator('.lu-next').click();
			await page.waitForTimeout(500);
			await m.locator('.lu-panel.is-active .ev-seg button', { hasText: 'Min-Max' }).click();
			await page.waitForTimeout(400);
			await shootPage(`nimble-new-character-phone${t}`);
		}

		// 5e's New monster on a phone: the builder full screen.
		await clean();
		await o.eval(async (app, plugin, X5) => { await plugin.campaigns.setActive(X5); }, X5);
		await open(`${X5}/Homebrew.md`);
		if (wanted(`5e-builder-phone${t}`)) {
			await o.eval((app) => app.commands.executeCommandById('nimble-gm:new-monster'));
			await page.waitForSelector('.nimble-entity-builder .eb-panel.is-active');
			await page.locator('.nimble-entity-builder .eb-panel.is-active input').first().fill('Ember Hound');
			await page.waitForTimeout(400);
			await shootPage(`5e-builder-phone${t}`);
		}
	}
} finally {
	await o.close();
}
