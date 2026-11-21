// Every surface e2e/visual.mjs looks at, in both games. Each one:
//
//   game     'nimble', '5e' or 'shared' (what every game shows the same way)
//   name     its folder under e2e/artifacts/visual/<game>/
//   mode     'content' (a note or a view in the main area: widths are the content's width),
//            'window' (a dialog or floating thing: widths are the window's) or
//            'sidebar' (a panel: widths are the sidebar's, `side` says which)
//   root     the surface's selector (its first visible match is checked and shot)
//   setup    drives the app into the state (it starts from a clean window: one tab, sidebars shut)
//   states   optional: several states after one setup, each its own surface (`<name>-<state>`);
//            a list, or a function of the context returning one (builder steps, compendium tabs)
//
// The vault is the sample vault (a Nimble GM campaign and a player one) plus what prepareVault
// writes: 5e campaigns in both editions, a 5e player campaign, and notes for the surfaces the
// sample doesn't have (references, homebrew, stat blocks of each kind, a dying hero).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAIN = '.workspace-split.mod-root';
const R = `${MAIN} .markdown-reading-view`;
const S = `${MAIN} .markdown-source-view`;
const SIZER = `${R} .markdown-preview-sizer`;
const T = '.nimble-encounter-tracker';
const TR5 = '.workspace-leaf-content[data-type="nimble-dnd5e-tracker"]';
const CP = '.nimble-campaign-view';
const CMP = '.workspace-leaf-content[data-type="nimble-bestiary"]';
const CV5 = '.workspace-leaf-content[data-type="nimble-dnd5e-compendium"]';
const EB = '.modal.nimble-entity-builder';

const NQ = 'Campaigns/The Old Quarter';
const BJ = "Campaigns/Brakka's Journal";
const CH = `${NQ}/1 The Quicksilver Vaults`;
const X5 = 'Campaigns/Visual Coast';
const X14 = 'Campaigns/Visual Coast 2014';
const XP = 'Campaigns/Visual Party';
const V = 'Visual';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// the notes the surfaces need

const ILSE_5E = (extra = []) => [
	'---', 'nimble: character', 'title: Ilse Vane', 'species: Elf', 'class: Wizard', 'subclass: Evoker', 'background: Sage', 'level: 5', 'edition: "2024"',
	'str: 8', 'dex: 14', 'con: 13', 'int: 18', 'wis: 12', 'cha: 10', 'hp: 24', 'hp_max: 32', 'temp_hp: 5', 'hit_dice_used: 2', 'inspiration: true',
	'skills: [Arcana, History, Investigation, Insight]', 'expertise: [Arcana]', 'conditions: [Poisoned]',
	'spells: [Fire Bolt, Mage Hand, Shield, Magic Missile, Misty Step, Hold Person, Fireball, Counterspell]', 'slots_used: [1, 0, 1]',
	'inventory:', '  - { name: Dagger, equipped: true }', '  - { name: Quarterstaff, equipped: true }', '  - { name: Potion of Healing, qty: 2 }', 'gold: 42',
	...extra, '---', '', '```5e-sheet', '```', '',
].join('\n');

const STATBLOCK_5E = [
	'```5e', 'name: Cinder Hound Alpha', 'size: Large', 'type: elemental', 'alignment: Neutral', 'ac: 15 (natural armor)', 'hp: 85 (10d10 + 30)', 'speed: 40 ft., climb 20 ft.',
	'str: 18', 'dex: 15', 'con: 16', 'int: 6', 'wis: 13', 'cha: 8', 'saves: Dex +5, Wis +4', 'skills: Perception +4, Stealth +5', 'resistances: Bludgeoning, Piercing',
	'immunities: Fire', 'senses: Darkvision 60 ft., Passive Perception 14', 'languages: understands Ignan but can\'t speak', 'cr: 5',
	'traits:', '- Glowing Coat: The hound sheds dim light in a 10-foot radius.', '- Pack Tactics: The hound has Advantage on an attack roll against a creature if at least one of its allies is within 5 feet of the creature.',
	'actions:', '- Multiattack: The hound makes two Bite attacks.', '- Bite: Melee Attack Roll: +7, reach 5 ft. Hit: 13 (2d8 + 4) Piercing damage plus 7 (2d6) Fire damage.',
	'- Cinder Breath (Recharge 5–6): Dexterity Saving Throw: DC 14, each creature in a 15-foot Cone. Failure: 21 (6d6) Fire damage. Success: Half damage.',
	'legendary:', '- Snap: The hound makes one Bite attack.', '- Flare (Costs 2 Actions): Each creature within 10 feet must succeed on a DC 14 Constitution saving throw or be Blinded until the end of its next turn.',
	'```', '',
].join('\n');

/** Write everything the surfaces need into this run's copy of the vault (never sample-vault/ itself). */
export async function prepareVault(o, ROOT) {
	const bear = readFileSync(join(ROOT, 'e2e', 'fixtures', 'vault', 'Hand-written Bear.md'), 'utf8');
	await o.eval(async (app, plugin, [X5, X14, XP, V, NQ, ILSE, ILSE_DYING, STATBLOCK, bear]) => {
		plugin.settings.dice3d = false;
		app.vault.setConfig('readableLineLength', true);
		const write = async (path, text) => {
			const dir = path.split('/').slice(0, -1).join('/');
			if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir).catch(() => {});
			const f = app.vault.getAbstractFileByPath(path);
			if (f) await app.vault.modify(f, text); else await app.vault.create(path, text);
		};
		const wait = async (folder) => { for (let i = 0; i < 60 && !plugin.campaigns.campaigns.find(c => c.folder === folder); i++) await new Promise(r => setTimeout(r, 100)); };
		// 5e, 2024 rules, run by the GM.
		if (!app.vault.getAbstractFileByPath(X5)) await plugin.campaigns.createCampaign({ name: 'Visual Coast', level: 5, heroes: 4, starter: true, system: '5e', edition: '2024', firstChapter: 'Chapter 1' });
		await wait(X5);
		if (!app.vault.getAbstractFileByPath(X14)) await plugin.campaigns.createCampaign({ name: 'Visual Coast 2014', level: 5, heroes: 4, starter: true, system: '5e', edition: '2014', firstChapter: 'Chapter 1' });
		await wait(X14);
		if (!app.vault.getAbstractFileByPath(XP)) await plugin.campaigns.createCampaign({ name: 'Visual Party', level: 5, heroes: 4, starter: true, system: '5e', edition: '2024', role: 'player', character: 'Ilse Vane' });
		await wait(XP);

		await write(`${X5}/Party/Ilse Vane.md`, ILSE);
		await write(`${X5}/Party/Dorn Ashby.md`, ILSE_DYING);
		await write(`${X5}/Party/Bram Holt.md`, ['---', 'nimble: character', 'title: Bram Holt', 'species: Human', 'class: Fighter', 'subclass: Champion', 'background: Soldier', 'level: 5', 'edition: "2024"',
			'str: 17', 'dex: 13', 'con: 15', 'int: 10', 'wis: 12', 'cha: 8', 'hp: 44', 'hp_max: 44', 'skills: [Athletics, Intimidation, Perception, Survival]',
			'inventory:', '  - { name: Longsword, equipped: true }', '  - { name: Chain Mail, equipped: true }', '  - { name: Shield, equipped: true }', '---', '', '```5e-sheet', '```', ''].join('\n'));
		await write(`${XP}/Party/Ilse Vane.md`, ILSE.replace('nimble: character', 'nimble: character\nmine: true\nplayer: You'));
		await write(`${X5}/Chapter 1/Road Ambush.md`, ['# Road ambush', '', 'Goblins spring from the ditch while their mage holds back. An ogre lumbers out of the trees on round two.', '',
			'```nimble-encounter', 'name: Road ambush', 'monsters:', '- 2 `5e:Goblin Warrior`', '- `5e:Ogre`', '- `5e:Mage`', '- `5e:Young Red Dragon`', '```', ''].join('\n'));
		await write(`${XP}/Locations/Waymoot Bridge.md`, '---\nnimble: location\n---\n');
		await write(`${XP}/Sessions/Session 1 - The Bridge.md`, ['---', 'nimble: session', '---', '', 'We held the bridge against goblins until the ogre came.', '',
			'```nimble-encounter', 'name: Ambush at Waymoot Bridge', 'outcome: won', 'where: "[[Waymoot Bridge]]"', 'when: Day 3, dusk', 'loot: 40 gp, a silver key, the ogre\'s war horn',
			'monsters:', '- 4 Goblin Warrior', '- `5e:Ogre`', '- Mystery Hag', 'notes: The shaman fled north across the river.', '```', ''].join('\n'));
		await write(`${X5}/NPCs/Old Tam.md`, ['---', 'nimble: npc', 'role: Ferryman', 'ancestry: Halfling', 'attitude: friendly', '---', '', 'Runs the ferry below the bridge.', ''].join('\n'));
		await write(`${X5}/Monsters/Cinder Hound Alpha.md`, STATBLOCK);
		await write(`${X14}/Monsters/Cinder Hound Alpha.md`, STATBLOCK.replace('Melee Attack Roll: +7', 'Melee Weapon Attack: +7 to hit'));
		await write(`${X5}/NPCs/Marta Vey.md`, ['---', 'nimble: npc', 'role: Captain of the Waymoot watch', 'ancestry: Human', 'pronouns: she/her', 'age: 44',
			'status: alive', 'attitude: neutral', 'location: "[[Waymoot Bridge]]"', 'ac: 16', 'hp: "30 (4d8 + 12)"', 'hp_now: 22', 'cr: "2"', 'statblock: Bandit Captain', '---', '',
			'```nimble-npc', 'look: Grey braid, a scar through one eyebrow, a watch coat she never buttons.', 'wants: The bridge toll back from the Zhentarim.', 'secret: She takes a cut of the toll herself.', '```', ''].join('\n'));
		await write(`${XP}/NPCs/Marta Vey.md`, ['---', 'nimble: npc', 'role: Captain of the Waymoot watch', 'ancestry: Human', 'attitude: friendly', '---', '', 'She paid us to clear the bridge.', ''].join('\n'));
		await write(`${X5}/Quests/Clear the Bridge.md`, ['---', 'nimble: quest', 'status: active', 'type: main', 'giver: "[[Marta Vey]]"', 'location: "[[Waymoot Bridge]]"', 'reward: 50 gp and the toll for a month', '---', '',
			'## Objectives', '- [x] Find out who holds the bridge', '- [ ] Drive the goblins off', '- [ ] Tell Marta', ''].join('\n'));
		await write(`${X5}/Locations/Waymoot Bridge.md`, ['---', 'nimble: location', 'type: bridge', 'region: The Trade Way', 'monsters: [Goblin Warrior, Ogre]', 'secret: The toll house cellar runs under the river.', '---', '',
			'A stone bridge over the Delimbiyr, its toll house shuttered.', ''].join('\n'));
		await write(`${X5}/Sessions/Session 1 - The Bridge.md`, ['---', 'nimble: session', 'party: ["[[Ilse Vane]]", "[[Bram Holt]]"]', 'quests: ["[[Clear the Bridge]] new"]', 'loot: [50 gp, A goblin war horn]', 'next: Into the toll house cellar.', '---', '',
			'- The party met Marta at the bridge.', '- Goblins held the far end; the ogre came on round two.', ''].join('\n'));
		await write(`${X5}/Chapter 1/The Bridge Map.md`, '```nimble-map\nimage: [[quicksilver-vaults-map.png]]\npins:\n- 31.1, 9.4 | The bridge | [[Road Ambush]] | encounter\n- 69, 51.7 | Reed bank | | danger\n- 45, 70 | Toll house | | treasure\n```\n');
		await write(`${X5}/References.md`, ['# References', '',
			'Two `5e:Goblin Warrior` hold the far end; a `5e:Bugbear Warrior` waits in the reeds and a `5e:Young Red Dragon` circles. The hedge mage casts `5e:spell:Fire Bolt` and `5e:spell:Fireball`, the chest holds a `5e:item:Potion of Healing`, and the ogre falls `5e:Prone`. Nobody knows `5e:Nobody Knows`.', ''].join('\n'));
		await write(`${X5}/Homebrew.md`, ['# Homebrew', '',
			'```5e-spell', 'name: Ember Lash', 'level: 1', 'school: Evocation', 'casting time: Action', 'range: 30 feet', 'components: V, S', 'duration: Instantaneous', 'classes: Sorcerer, Wizard', '',
			'A whip of fire cracks at one creature you can see within range. Make a ranged spell attack. On a hit, the target takes 2d8 Fire damage.', '',
			'Using a Higher-Level Spell Slot: The damage increases by 1d8 for each spell slot level above 1.', '```', '',
			'```5e-item', 'name: Ember Blade', 'type: Weapon (Longsword)', 'rarity: Uncommon', 'attunement: yes', '',
			'This blade glows like a coal. You gain a +1 bonus to attack and damage rolls made with it, and it deals an extra 1d6 Fire damage on a hit.', '```', '',
			'```5e-background', 'name: Bridge Warden', 'skills: Athletics, Insight', 'feat: Alert', 'bogus: 12', 'abilities: STR, WIS, Nope', '```', ''].join('\n'));
		// Nimble: references, homebrew (one block with problems), stat blocks of each kind, a dying hero.
		await write(`${V}/Nimble References.md`, ['# References', '',
			'A `nimble:Quicksilver Hound` circles; the `nimble:Mercury Ooze` waits and `nimble:Krogg, Goblin King` holds court. Wren casts `nimble:spell:Flame Dart` and `nimble:spell:Pyroclasm` with a `nimble:item:Healing Potion` in her belt; the ooze leaves her `nimble:Dazed`. Nobody knows `nimble:Nobody Knows`.', ''].join('\n'));
		await write(`${NQ}/Homebrew.md`, ['# Homebrew', '',
			'```nimble-spell', 'name: Quicksilver Lash', 'school: Fire', 'tier: 1', 'actions: 2', 'range: 8', 'damage: 2d10', 'upcast: +1d10 per extra mana.', 'text: A rope of molten silver lashes one creature. On a crit, it is Smoldering.', '```', '',
			'```nimble-item', "name: Alchemist's Fuse", 'kind: magic', 'rarity: Uncommon', 'charges: 3', 'cost: 120 gp', 'text: Light it and throw: 2d6 fire damage to everything within 2 spaces. Each time you use a charge, roll a d6. On a 1, it goes off in your hand.', '```', '',
			'```nimble-background', 'name: Lantern Bearer', 'text: You carried the Night Watch\'s lantern.', 'bogus: 12', 'requirement: [[[', '```', ''].join('\n'));
		await write(`${V}/Krogg.md`, ['```nimble', 'name: Krogg, Goblin King', 'level: 2', 'role: solo', 'size: Medium', 'type: Angry Bugbear', 'hp: 28/hero', 'armor: none', 'movement: 6', 'saves: STR+ DEX+',
			"actionText: After each hero's turn, choose one:", 'attacks:', '- **Manglemaul.** Move 6. 2d6+2 damage, Grappled (escape DC 10).', '- **Crack Skulls.** Move 6. Swing a Grappled creature at another creature. Both take 2d6+2.',
			"bloodied: At 45 HP, Krogg's damage increases to 2d8+2.", 'lastStand: At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium Armor.',
			'easier: Have the Manglemaul jam after using Crack Skulls.', 'harder: Move often; end turns out of melee reach.', '```', ''].join('\n'));
		await write(`${V}/Goblin Sneak.md`, ['```nimble', 'name: Goblin Sneak', 'level: 1/3', 'role: minion', 'size: Small', 'type: Goblin', 'hp: 1', 'armor: none', 'movement: 6', 'minion die: 4',
			'attacks:', '- **Shiv.** 1d4+1 piercing.', '```', ''].join('\n'));
		await write(`${V}/Hand-written Bear.md`, bear);
		const brakka = app.vault.getAbstractFileByPath("Campaigns/Brakka's Journal/Party/Brakka.md");
		const text = await app.vault.read(brakka);
		await write(`${V}/Dara Ashfall.md`, text.replace('hp: 22', 'hp: 0').replace('wounds: 1', 'wounds: 3').replace(/^ancestry: Orc$/m, 'ancestry: Human'));
	}, [X5, X14, XP, V, NQ, ILSE_5E(), ILSE_5E(['death_saves: [1, 2]']).replace('title: Ilse Vane', 'title: Dorn Ashby').replace('hp: 24', 'hp: 0').replace('class: Wizard', 'class: Fighter').replace('subclass: Evoker', 'subclass: Champion'), STATBLOCK_5E, bear]);
	await o.page.waitForTimeout(1500);
	// The map image the 5e map uses lives in the Old Quarter's assets; copy it beside the 5e campaign.
	await o.eval(async (app, _p, X5) => {
		const src = app.vault.getFiles().find(f => f.name === 'quicksilver-vaults-map.png');
		if (src && !app.vault.getAbstractFileByPath(`${X5}/Assets/quicksilver-vaults-map.png`)) {
			if (!app.vault.getAbstractFileByPath(`${X5}/Assets`)) await app.vault.createFolder(`${X5}/Assets`).catch(() => {});
			await app.vault.createBinary(`${X5}/Assets/quicksilver-vaults-map.png`, await app.vault.readBinary(src));
		}
	}, X5);
}

// ---------------------------------------------------------------------------
// helpers the setups share (c is the runner's context: o, page, open, clean, campaign, cmd, click, wait, restore)

/** The states for a dialog with step dots: one per dot, named by the dot's label. */
const dotSteps = (root, dot) => async (c) => {
	const labels = await c.page.locator(`${root} ${dot}`).allInnerTexts();
	return labels.map((label, i) => ({
		name: `${String(i + 1).padStart(2, '0')}-${slug(label) || 'step'}`,
		go: async () => { await c.page.locator(`${root} ${dot}`).nth(i).click(); await c.wait(450); await c.page.mouse.move(2, 2); },
	}));
};

/** The states for a compendium: one per tab. */
const tabStates = (root) => async (c) => {
	const labels = await c.page.locator(`${root} .nimble-cmpx-seg`).allInnerTexts();
	return labels.map((label, i) => ({
		name: `tab-${slug(label)}`,
		go: async () => { await c.page.locator(`${root} .nimble-cmpx-seg`).nth(i).click(); await c.wait(500); await c.page.mouse.move(2, 2); },
	}));
};

/** On a narrow compendium (a phone), a page covers the list: go back to it first. */
async function toList(c, view) {
	const back = c.page.locator(`${view} .bestiary-back`).filter({ visible: true });
	if (await back.count()) { await back.first().click(); await c.wait(300); }
}

/** Open a game's compendium on its All tab and pick "New <kind>…" from its New button. */
async function newFromCompendium(c, view, kind) {
	if (view === CMP) await c.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); });
	else await c.cmd('open-bestiary');
	await c.page.locator(`${view} .nimble-cmpx-seg`).first().waitFor({ timeout: 5000 });
	await c.page.locator(`${view} .nimble-cmpx-seg`).first().click();
	await c.wait(300);
	await c.page.locator(`${view} .nimble-cmpx-new`).click();
	await c.wait(300);
	const items = c.page.locator('.menu .menu-item');
	const titles = await items.allInnerTexts();
	const i = titles.findIndex(t => t.trim().toLowerCase().endsWith(` ${kind}…`));
	if (i < 0) throw new Error(`no "New ${kind}…" in the New menu (${titles.join(', ')})`);
	await items.nth(i).click();
	await c.page.locator(`${EB} .eb-panel.is-active`).waitFor({ timeout: 5000 });
	await c.wait(400);
}

/** A builder opened from a command, with its name typed. */
async function builder(c, from, command, name) {
	await c.open(from);
	await c.cmd(command);
	await c.page.locator(`${EB} .eb-panel.is-active`).waitFor({ timeout: 5000 });
	const first = c.page.locator(`${EB} .eb-panel.is-active input[type="text"], ${EB} .eb-panel.is-active input:not([type])`).first();
	if (name && await first.count()) await first.fill(name);
	await c.wait(400);
}

/** Nimble's fight, through the encounter store: the party and `monsters`, started, with `then` run on it. */
async function nimbleFight(c, monsters, then) {
	await c.campaign(NQ);
	await c.eval(async (app, plugin, [monsters, thenSrc]) => {
		const nb = plugin.runtime('nimble');
		plugin.settings.encounters = [];
		plugin.settings.activeEncounterId = null;
		plugin.settings.rollLog = [];
		const st = nb.encounters;
		const enc = st.ensureActive();
		st.addParty(enc.id);
		for (const [name, n] of monsters) st.add(nb.index.get(name).monster, undefined, n, enc.id);
		st.start(enc.id);
		const by = (label) => enc.creatures.find(x => x.label === label);
		if (thenSrc) (0, eval)(`(${thenSrc})`)(st, enc, by);
		st.trigger('changed');
		const leaf = await nb.activateEncounterView(false);
		app.workspace.rightSplit.expand();
		if (leaf) await app.workspace.revealLeaf(leaf);
	}, [monsters, then?.toString()]);
	await c.page.locator(`${T} .creature-item`).first().waitFor({ timeout: 5000 });
	await c.wait(500);
}

/** 5e's fight from the road ambush: run it, roll in, hurt a few, the dragon's legendary actions spent. */
async function fight5e(c) {
	await c.campaign(X5);
	await c.eval((app, plugin) => { const rt = plugin.runtime('dnd5e'); if (rt.fights?.fight) rt.fights.change(f => { f.combatants.length = 0; f.round = 0; f.turnId = null; }); });
	await c.open(`${X5}/Chapter 1/Road Ambush.md`);
	await c.page.locator(`${R} .dnd5e-encounter button`, { hasText: 'Run' }).first().click();
	await c.page.locator(TR5).waitFor({ timeout: 5000 });
	const start = c.page.locator(`${TR5} button`, { hasText: /Start combat/ }).first();
	if (await start.count()) await start.click();
	await c.wait(400);
	await c.eval((app, plugin) => {
		plugin.runtime('dnd5e').fights.change((f) => {
			const by = (n) => f.combatants.find(x => x.label === n);
			const set = (n, hp, conds = []) => { const x = by(n); if (x) { x.hp = hp; x.conditions.push(...conds.map(name => ({ name }))); } };
			set('Goblin Warrior', 4, ['Frightened']);
			set('Goblin Warrior 2', 0);
			set('Ogre', 41, ['Prone', 'Restrained']);
			const mage = by('Mage'); if (mage) { mage.hp = 52; mage.concentrating = true; }
			const dragon = by('Young Red Dragon'); if (dragon) { dragon.hp = Math.round(dragon.maxHp * 0.62); if (dragon.legendary) dragon.legendary.used = 1; }
		});
	});
	await c.wait(600);
}

// ---------------------------------------------------------------------------
// the surfaces

const nimble = [
	// Character sheets: Brakka's tabs, Ilse the Mage's spells, a dying hero, the class panel with its rules and the face picker.
	{
		name: 'sheet', mode: 'content', root: `${R} .nimble-sheet`,
		setup: async (c) => { await c.restore(`${BJ}/Party/Brakka.md`); await c.campaign(BJ); await c.open(`${BJ}/Party/Brakka.md`); },
		states: ['actions', 'features', 'inventory', 'notes'].map(t => ({ name: t, go: async (c) => { await c.click(`${R} .nimble-sheet .ns-tab[data-tab="${t}"]`); } })),
	},
	{
		name: 'sheet-caster', mode: 'content', root: `${R} .nimble-sheet`,
		setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/Party/Ilse.md`); await c.click(`${R} .nimble-sheet .ns-tab[data-tab="spells"]`); },
	},
	{
		name: 'sheet-dying', mode: 'content', root: `${R} .nimble-sheet`,
		setup: async (c) => { await c.open(`${V}/Dara Ashfall.md`); },
	},
	{
		name: 'sheet-class-rules', mode: 'content', root: `${R} .nimble-sheet`,
		setup: async (c) => {
			await c.restore(`${BJ}/Party/Tomas.md`);
			await c.campaign(BJ);
			await c.open(`${BJ}/Party/Tomas.md`);
			await c.click(`${R} .nimble-sheet .ns-class .ns-feat-name`, { hasText: 'Lay on Hands' });
		},
	},
	{
		name: 'sheet-face-picker', mode: 'content', root: `${R} .nimble-sheet`,
		setup: async (c) => {
			await c.restore(`${BJ}/Party/Brakka.md`);
			await c.campaign(BJ);
			await c.open(`${BJ}/Party/Brakka.md`);
			await c.click(`${R} .nimble-sheet .ns-tab[data-tab="actions"]`);
			await c.click(`${R} .nimble-sheet .ns-class .ns-btn`, { hasText: /^\s*Rage\s*$/ });
			await c.wait(400);
			await c.click(`${R} .nimble-sheet .ns-class .ns-held-die.is-empty`);
			await c.page.locator(`${R} .ev-face-pick`).first().waitFor({ timeout: 3000 });
		},
	},
	{
		name: 'roll-dialog', mode: 'window', root: '.modal.nimble-roll-dialog',
		setup: async (c) => {
			await c.campaign(BJ);
			await c.open(`${BJ}/Party/Brakka.md`);
			await c.click(`${R} .nimble-sheet .ns-stat .ns-stat-box`);
			await c.page.locator('.modal.nimble-roll-dialog').waitFor({ timeout: 3000 });
		},
	},
	{
		name: 'roll-toast', mode: 'window', root: '.notice:has(.ev-roll-toast)',
		setup: async (c) => {
			await c.eval((app, plugin) => plugin.rollDice('1d6+2', 'Brakka · Battleaxe', 'attack', [6, 6, 3]));
			await c.page.locator('.notice .ev-roll-toast').first().waitFor({ timeout: 5000 });
		},
	},
	{
		name: 'character-panel', mode: 'sidebar', side: 'right', root: '.nimble-character-view',
		setup: async (c) => {
			await c.campaign(BJ);
			await c.open(`${BJ}/Sessions/Session 1 - Down the Cellar Stair.md`);
			await c.cmd('open-my-character');
			await c.page.locator('.nimble-character-view .nimble-sheet').first().waitFor({ timeout: 5000 });
		},
	},
	// The tracker mid-fight: Brakka on the card (Dazed), hurt hounds in the queue; the legendary beat; a minion group.
	{
		name: 'tracker', mode: 'sidebar', side: 'right', root: T,
		setup: (c) => nimbleFight(c, [['Quicksilver Hound', 3]], (st, enc, by) => {
			st.setHp(enc.id, by('Quicksilver Hound-1').id, 9);
			st.setHp(enc.id, by('Quicksilver Hound-2').id, 4);
			st.addCondition(enc.id, by('Brakka').id, 'Dazed', { rounds: 2 });
			st.setHp(enc.id, by('Brakka').id, 7);
			st.setActing(enc.id, by('Brakka').id);
		}),
	},
	// The tracker as a page in a tab (the ribbon, or Open in a tab from its menu).
	{
		name: 'tracker-tab', mode: 'window', widths: [700, 1200], root: `.workspace-split.mod-root ${T}`,
		setup: async (c) => {
			await nimbleFight(c, [['Quicksilver Hound', 3]], (st, enc, by) => { st.setHp(enc.id, by('Quicksilver Hound-1').id, 9); st.setActing(enc.id, by('Brakka').id); });
			await c.eval(async (app, plugin) => { await plugin.openTracker('tab'); app.workspace.rightSplit.collapse(); });
			await c.page.locator(`.workspace-split.mod-root ${T} .creature-item`).first().waitFor({ timeout: 5000 });
			await c.wait(400);
		},
	},
	{
		name: 'tracker-legendary', mode: 'sidebar', side: 'right', root: T,
		setup: async (c) => {
			await nimbleFight(c, [['Krogg, Goblin King', 1]], (st, enc, by) => { st.setActing(enc.id, by('Brakka').id); });
			await c.click(`${T} .ev-foot-primary`);
			await c.page.locator(`${T} .ev-card.is-beat`).waitFor({ timeout: 3000 });
		},
	},
	{
		name: 'tracker-groups', mode: 'sidebar', side: 'right', root: T,
		setup: (c) => nimbleFight(c, [['Goblin Minion', 4], ['Goblin Taskmaster', 1]], (st, enc, by) => {
			const g = enc.creatures.find(x => x.label.startsWith('Goblin Minion'));
			st.setAlive(enc.id, g.id, 3);
			st.setActing(enc.id, g.id);
		}),
	},
	{
		name: 'hp-keypad', mode: 'sidebar', side: 'right', root: '.nimble-hp-pad',
		setup: async (c) => {
			await nimbleFight(c, [['Quicksilver Hound', 3]], (st, enc, by) => { st.setActing(enc.id, by('Wren').id); });
			const row = c.page.locator(`${T} .creature-item`).filter({ has: c.page.locator('.creature-label', { hasText: 'Quicksilver Hound-3' }) }).first();
			await row.locator('.hp-display').click();
			await c.page.locator('.nimble-hp-pad').waitFor({ timeout: 3000 });
			await c.page.keyboard.type('9');
			const vuln = c.page.locator('.nimble-hp-pad button', { hasText: 'Vulnerable' });
			if (await vuln.count()) await vuln.first().click();
			await c.wait(300);
		},
	},
	{
		name: 'condition-picker', mode: 'sidebar', side: 'right', root: '.condition-picker',
		setup: async (c) => {
			await nimbleFight(c, [['Quicksilver Hound', 2]], (st, enc, by) => { st.setActing(enc.id, by('Quicksilver Hound-1').id); });
			await c.click(`${T} .ev-card .add-condition-btn`);
			await c.page.locator('.condition-picker').first().waitFor({ timeout: 3000 });
		},
	},
	// Encounter blocks: the GM's and a player's battle note.
	{ name: 'encounter-block', mode: 'content', root: `${R} .nimble-encounter-block`, setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q3 The Calcinator.md`); } },
	{ name: 'battle-note', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/Sessions/Session 1 - Down the Cellar Stair.md`); } },
	{
		name: 'battle-note-edit', mode: 'window', root: '.modal.nimble-battle-modal',
		setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/Sessions/Session 1 - Down the Cellar Stair.md`); await c.click(`${R} button[aria-label="Edit these battle notes"]`); await c.page.locator('.modal.nimble-battle-modal').waitFor({ timeout: 3000 }); },
	},
	// Stat blocks.
	{ name: 'statblock', mode: 'content', root: `${R} .nimble-statblock`, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/Monsters/Quicksilver Hound.md`); } },
	{ name: 'statblock-legendary', mode: 'content', root: `${R} .nimble-statblock`, setup: async (c) => { await c.open(`${V}/Krogg.md`); } },
	{ name: 'statblock-minion', mode: 'content', root: `${R} .nimble-statblock`, setup: async (c) => { await c.open(`${V}/Goblin Sneak.md`); } },
	{ name: 'statblock-hints', mode: 'content', root: SIZER, setup: async (c) => { await c.open(`${V}/Hand-written Bear.md`); const t = c.page.locator(`${R} .nimble-issues-toggle, ${R} .nimble-issues-summary`).first(); if (await t.count()) { await t.click(); await c.wait(300); } } },
	{
		name: 'quick-look', mode: 'window', root: '.modal.nimble-record-modal',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${V}/Nimble References.md`);
			await c.click(`${R} .nimble-inline-ref.nimble-inline-found .nimble-inline-name`, { hasText: 'Krogg' });
			await c.page.locator('.modal.nimble-record-modal').waitFor({ timeout: 3000 });
		},
	},
	// NPC, quest, place and session cards, GM and player.
	{ name: 'npc', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/NPCs/Tobren Kask.md`); } },
	{ name: 'npc-player', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/NPCs/Tobren Kask.md`); } },
	{ name: 'quest', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/Quests/Bring Wick Home.md`); } },
	{ name: 'quest-player', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/Quests/Tobren Kask's Job.md`); } },
	{ name: 'location', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/Locations/The Alchemists' Guild.md`); } },
	{ name: 'session', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/Sessions/Session 1 - Silver Between the Stones.md`); } },
	{ name: 'scene', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q2 Mercury Pool.md`); } },
	{
		name: 'campaign-panel', mode: 'sidebar', side: 'left', root: CP,
		setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q1 Entry Chamber.md`); await c.eval(async (app, plugin) => { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); }); await c.page.locator(`${CP} .campaign-group`).first().waitFor({ timeout: 5000 }); },
	},
	{
		name: 'campaign-panel-player', mode: 'sidebar', side: 'left', root: CP,
		setup: async (c) => { await c.campaign(BJ); await c.open(`${BJ}/Sessions/Session 1 - Down the Cellar Stair.md`); await c.eval(async (app, plugin) => { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); }); await c.page.locator(`${CP} .campaign-group`).first().waitFor({ timeout: 5000 }); },
	},
	// The compendium: every tab, a class page, a monster, the filters, and the dialog.
	{
		name: 'compendium', mode: 'content', root: `${CMP} .nimble-compendium`,
		setup: async (c) => { await c.campaign(NQ); await c.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); }); await c.page.locator(`${CMP} .nimble-cmpx-row[data-id]`).first().waitFor({ timeout: 5000 }); },
		states: tabStates(CMP),
	},
	{
		name: 'compendium-pages', mode: 'content', root: `${CMP} .nimble-compendium`,
		setup: async (c) => { await c.campaign(NQ); await c.eval(async (app, plugin) => { await plugin.runtime('nimble').openBestiary(); }); await c.page.locator(`${CMP} .nimble-cmpx-row[data-id]`).first().waitFor({ timeout: 5000 }); },
		states: [
			{ name: 'class', go: async (c) => { await c.eval((app) => { const l = app.workspace.getLeavesOfType('nimble-bestiary')[0]; l?.view.select('class:oathsworn'); }); await c.page.locator(`${CMP} .nimble-cmp-card.kind-class`).first().waitFor({ timeout: 3000 }); const s = c.page.locator(`${CMP} .nimble-cmpx-detail .nimble-cmp-summary`).first(); if (await s.count()) await s.click(); await c.wait(300); } },
			{ name: 'spell', go: async (c) => { await c.eval((app) => { const l = app.workspace.getLeavesOfType('nimble-bestiary')[0]; l?.view.select('spell:pyroclasm'); }); await c.wait(500); } },
			{ name: 'monster', go: async (c) => { await toList(c, CMP); await c.page.locator(`${CMP} .nimble-cmpx-seg`).first().click(); await c.page.locator(`${CMP} .nimble-cmpx-input`).fill('krogg'); await c.wait(500); await c.page.locator(`${CMP} .nimble-cmpx-row[data-id]`).first().click(); await c.wait(500); } },
			{ name: 'filters', go: async (c) => { await toList(c, CMP); await c.page.locator(`${CMP} .nimble-cmpx-input`).fill(''); await c.page.locator(`${CMP} .nimble-cmpx-input`).pressSequentially('level:2 role:solo ', { delay: 20 }); await c.click(`${CMP} .nimble-cmpx-filter`); await c.page.mouse.move(2, 2); } },
			{ name: 'sorting', go: async (c) => { await toList(c, CMP); await c.click(`${CMP} .nimble-cmpx-sort`); await c.page.mouse.move(2, 2); } },
		],
	},
	{
		name: 'compendium-dialog', mode: 'window', root: '.modal.nimble-cmpx-modal',
		setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q1 Entry Chamber.md`); await c.cmd('search-compendium'); await c.page.locator('.modal.nimble-cmpx-modal .nimble-cmpx-row[data-id]').first().waitFor({ timeout: 5000 }); await c.page.keyboard.type('hound'); await c.wait(500); },
	},
	{
		name: 'omnisearch', mode: 'window', root: '.modal-container .prompt.nimble-omnisearch',
		setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q2 Mercury Pool.md`); await c.cmd('spotlight'); await c.page.locator('.nimble-omnisearch .prompt-input').waitFor(); await c.page.keyboard.type('level:2 alchemist'); await c.wait(600); },
	},
	{
		name: 'slash-menu', mode: 'window', root: '.suggestion-container:has(.nimble-slash-item)',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.eval(async (app, _p, path) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.vault.modify(f, '# Prep\n\n'); else await app.vault.create(path, '# Prep\n\n'); }, `${NQ}/Slash.md`);
			await c.open(`${NQ}/Slash.md`, 'source');
			await c.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
			await c.page.keyboard.type('/', { delay: 15 });
			await c.page.locator('.suggestion-container .nimble-slash-item').first().waitFor({ timeout: 3000 });
			await c.wait(300);
		},
		states: [
			{ name: 'all', go: async () => {} },
			{ name: 'encounter', go: async (c) => { await c.page.keyboard.type('enc', { delay: 15 }); await c.wait(250); await c.page.keyboard.press('Enter'); await c.wait(250); await c.page.keyboard.type('3 goblin minion, krogg', { delay: 15 }); await c.page.locator('.suggestion-container .nimble-slash-badge').first().waitFor({ timeout: 3000 }).catch(() => {}); } },
		],
	},
	{ name: 'references', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${V}/Nimble References.md`); } },
	{ name: 'references-live-preview', mode: 'content', root: `${S} .cm-contentContainer`, setup: async (c) => { await c.campaign(NQ); await c.open(`${V}/Nimble References.md`, 'source'); await c.eval((app) => { const ed = app.workspace.activeEditor?.editor; ed?.setCursor({ line: 0, ch: 0 }); }); } },
	{
		name: 'hover-card', mode: 'window', root: '.nimble-hover-preview', hover: true, phone: false, // no hover on a touch screen
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${V}/Nimble References.md`);
			await c.page.locator(`${R} .nimble-inline-name`, { hasText: 'Krogg' }).first().hover();
			await c.page.locator('.nimble-hover-preview .nimble-statblock').first().waitFor({ timeout: 4000 });
			await c.page.locator('.nimble-hover-preview').first().hover({ position: { x: 4, y: 4 } });
			await c.wait(400);
		},
	},
	// Builders: each kind, each step.
	...[['monster', 'new-monster', 'Cave Bear'], ['spell', 'new-spell', 'Silver Spark'], ['item', 'new-item', 'Lantern of Mercury']].map(([kind, command, name]) => ({
		name: `builder-${kind}`, mode: 'window', root: EB,
		setup: async (c) => { await c.campaign(NQ); await builder(c, `${CH}/Q1 Entry Chamber.md`, command, name); },
		states: dotSteps(EB, '.eb-dot'),
	})),
	...['class', 'subclass', 'option', 'ancestry', 'background', 'boon'].map(kind => ({
		name: `builder-${kind}`, mode: 'window', root: EB,
		setup: async (c) => { await c.campaign(NQ); await c.open(`${CH}/Q1 Entry Chamber.md`); await newFromCompendium(c, CMP, kind); },
		states: dotSteps(EB, '.eb-dot'),
	})),
	{
		name: 'new-character', mode: 'window', root: '.modal.nimble-newchar-modal',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${CH}/Q1 Entry Chamber.md`);
			await c.cmd('new-character');
			const m = c.page.locator('.modal.nimble-newchar-modal');
			await m.waitFor({ timeout: 5000 });
			await m.locator('input.lu-name-input').fill('Lyra Thornwood');
			await m.locator('select[data-k="ancestry"]').selectOption('Elf');
			await m.locator('select[data-k="class"]').selectOption('Songweaver');
			await m.locator('select[data-k="background"]').selectOption('Academy Dropout');
			for (let i = 0; i < 2; i++) await m.locator('[data-k="level-plus"]').click();
			await c.wait(300);
		},
		states: dotSteps('.modal.nimble-newchar-modal', '.lu-dot'),
	},
	{
		name: 'level-up', mode: 'window', root: '.modal.nimble-levelup',
		setup: async (c) => {
			await c.campaign(BJ);
			await c.open(`${BJ}/Party/Brakka.md`);
			await c.click(`${R} .nimble-sheet .ns-camp`);
			await c.click('.modal.ns-camp-dialog .ns-camp-card', { hasText: 'Level up' });
			await c.page.locator('.modal.nimble-levelup').waitFor({ timeout: 5000 });
			await c.wait(400);
		},
		states: dotSteps('.modal.nimble-levelup', '.lu-dot'),
	},
	{
		name: 'add-several', mode: 'window', root: '.modal.nimble-count-modal', phone: false, // reached from a hover card here
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${V}/Nimble References.md`);
			await c.page.locator(`${R} .nimble-inline-name`, { hasText: 'Quicksilver Hound' }).first().hover();
			await c.page.locator('.nimble-hover-preview .statblock-action-more').first().waitFor({ timeout: 4000 });
			await c.page.locator('.nimble-hover-preview .statblock-action-more').first().click();
			await c.click('.menu .menu-item', { hasText: 'Add several' });
			await c.page.locator('.modal.nimble-count-modal').waitFor({ timeout: 3000 });
			const tougher = c.page.locator('.modal.nimble-count-modal .nimble-count-seg', { hasText: 'Tougher' });
			if (await tougher.count()) await tougher.click();
			await c.wait(300);
		},
	},
	{
		name: 'encounter-builder', mode: 'window', root: '.modal.nimble-builder-modal',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${CH}/Q1 Entry Chamber.md`);
			await c.cmd('build-encounter');
			const B = '.modal.nimble-builder-modal';
			await c.page.locator(B).waitFor({ timeout: 5000 });
			await c.page.locator(`${B} .builder-search`).fill('quicksilver');
			await c.wait(300);
			await c.page.locator(`${B} .builder-result`).first().click();
			await c.page.locator(`${B} .builder-result`).first().click();
			await c.page.locator(`${B} .builder-result`).nth(1).click();
			await c.page.locator(`${B} .builder-search`).fill('');
			await c.wait(300);
		},
	},
	{
		name: 'map', mode: 'content', root: `${R} .nimble-map`,
		setup: async (c) => {
			await nimbleFight(c, [['Quicksilver Hound', 2], ['Mercury Ooze', 1]]);
			await c.eval((app) => app.workspace.rightSplit.collapse());
			await c.open(`${CH}/Map - The Quicksilver Vaults.md`);
			const tok = c.page.locator(`${R} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`);
			if (await tok.count()) { await tok.first().click(); await c.wait(600); }
		},
	},
	{ name: 'homebrew', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(NQ); await c.open(`${NQ}/Homebrew.md`); } },
	{
		name: 'import-content', mode: 'window', root: '.modal.nimble-import-content',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.open(`${CH}/Q1 Entry Chamber.md`);
			await c.cmd('import-content');
			await c.page.locator('.modal.nimble-import-content textarea').fill(c.pack('nimble-lantern-road.json'));
			await c.wait(600);
			await c.page.locator('.modal.nimble-import-content textarea').evaluate(t => { t.scrollTop = 0; });
		},
	},
];

const dnd5e = [
	{
		name: 'sheet', mode: 'content', root: `${R} .dnd5e-sheet`,
		setup: async (c) => { await c.restore(`${X5}/Party/Ilse Vane.md`); await c.campaign(X5); await c.open(`${X5}/Party/Ilse Vane.md`); await c.page.locator(`${R} .dnd5e-sheet`).first().waitFor({ timeout: 5000 }); },
		states: ['actions', 'spells', 'features', 'inventory'].map(t => ({ name: t, go: async (c) => { await c.click(`${R} .dnd5e-tab[data-tab="${t}"]`); } })),
	},
	{ name: 'sheet-martial', mode: 'content', root: `${R} .dnd5e-sheet`, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Party/Bram Holt.md`); await c.page.locator(`${R} .dnd5e-sheet`).first().waitFor({ timeout: 5000 }); } },
	{ name: 'sheet-dying', mode: 'content', root: `${R} .dnd5e-sheet`, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Party/Dorn Ashby.md`); await c.page.locator(`${R} .dnd5e-sheet`).first().waitFor({ timeout: 5000 }); } },
	{
		name: 'rules-term', mode: 'window', root: '.ev-term-popover',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Party/Ilse Vane.md`);
			await c.click(`${R} .dnd5e-tab[data-tab="actions"]`);
			await c.click(`${R} .dnd5e-sheet .ev-term`);
			await c.page.locator('.ev-term-popover').first().waitFor({ timeout: 3000 });
		},
	},
	// (5e has no Character panel: Open my character opens the character's note, the sheet surfaces above.)
	{ name: 'tracker', mode: 'sidebar', side: 'right', root: TR5, setup: (c) => fight5e(c) },
	{
		name: 'tracker-tab', mode: 'window', widths: [700, 1200], root: '.workspace-split.mod-root .dnd5e-tracker',
		setup: async (c) => {
			await fight5e(c);
			await c.eval(async (app, plugin) => { await plugin.openTracker('tab'); app.workspace.rightSplit.collapse(); });
			await c.page.locator(`.workspace-split.mod-root ${TR5} .dnd5e-combatant`).first().waitFor({ timeout: 5000 });
			await c.wait(400);
		},
	},
	{
		name: 'hp-keypad', mode: 'sidebar', side: 'right', root: '.nimble-hp-pad',
		setup: async (c) => {
			await fight5e(c);
			const row = c.page.locator(`${TR5} .dnd5e-combatant`, { has: c.page.locator('.dnd5e-combatant-name', { hasText: 'Ogre' }) }).first();
			await row.locator('.dnd5e-hp-text, .dnd5e-focus-hp-btn').first().click();
			await c.page.locator('.nimble-hp-pad').waitFor({ timeout: 3000 });
			await c.page.keyboard.type('12');
			await c.wait(300);
		},
	},
	{
		name: 'condition-picker', mode: 'sidebar', side: 'right', root: '.condition-picker',
		setup: async (c) => {
			await fight5e(c);
			const btn = c.page.locator(`${TR5} .ev-card-condition`).first();
			if (await btn.count()) await btn.click();
			else { await c.page.locator(`${TR5} .dnd5e-combatant-name`).first().click({ button: 'right' }); await c.click('.menu .menu-item', { hasText: 'Add a condition' }); }
			await c.page.locator('.condition-picker').first().waitFor({ timeout: 3000 });
		},
	},
	{ name: 'encounter-block', mode: 'content', root: `${R} .dnd5e-encounter`, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.page.locator(`${R} .dnd5e-encounter`).first().waitFor({ timeout: 5000 }); } },
	{ name: 'battle-note', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(XP); await c.open(`${XP}/Sessions/Session 1 - The Bridge.md`); await c.page.locator(`${R} .dnd5e-battle-notes`).first().waitFor({ timeout: 5000 }); } },
	{
		name: 'battle-note-edit', mode: 'window', root: '.modal.nimble-battle-modal',
		setup: async (c) => { await c.campaign(XP); await c.open(`${XP}/Sessions/Session 1 - The Bridge.md`); await c.click(`${R} button[aria-label="Edit these battle notes"]`); await c.page.locator('.modal.nimble-battle-modal').waitFor({ timeout: 3000 }); },
	},
	// The compendium as a picker (pick mode): the tracker's Add monster, the sheet's Add spell and Add item, an NPC's From a stat block.
	{
		name: 'compendium-pick-monster', mode: 'window', root: '.modal.dnd5e-cmpx-modal',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Chapter 1/Road Ambush.md`);
			await c.eval(async (app, plugin) => {
				await plugin.runtime('dnd5e').openTracker();
				app.workspace.rightSplit.expand();
				const leaf = app.workspace.getLeavesOfType('nimble-dnd5e-tracker')[0];
				if (leaf) await app.workspace.revealLeaf(leaf);
			});
			await c.click(`${TR5} button.dnd5e-tracker-add`);
			await c.page.locator('.modal.dnd5e-cmpx-modal .nimble-cmpx-input').waitFor({ timeout: 3000 });
			await c.page.locator('.modal.dnd5e-cmpx-modal .nimble-cmpx-input').fill('2 goblin warrior');
			await c.wait(500);
		},
	},
	...[['spell', 'Add spell', 'spells'], ['item', 'Add item', 'inventory']].map(([kind, label, tab]) => ({
		name: `compendium-pick-${kind}`, mode: 'window', root: '.modal.dnd5e-cmpx-modal',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Party/Ilse Vane.md`);
			await c.click(`${R} .dnd5e-tab[data-tab="${tab}"]`);
			await c.click(`${R} .dnd5e-sheet-add`, { hasText: label });
			await c.page.locator('.modal.dnd5e-cmpx-modal .nimble-cmpx-row[data-id]').first().waitFor({ timeout: 4000 });
			await c.wait(400);
		},
	})),
	{
		name: 'compendium-pick-stats', mode: 'window', root: '.modal.dnd5e-cmpx-modal',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/NPCs/Old Tam.md`);
			await c.click(`${R} .dnd5e-npc-btn`, { hasText: 'From a stat block' });
			await c.page.locator('.modal.dnd5e-cmpx-modal .nimble-cmpx-input').waitFor({ timeout: 3000 });
			await c.page.locator('.modal.dnd5e-cmpx-modal .nimble-cmpx-input').fill('bandit');
			await c.wait(500);
		},
	},
	{ name: 'statblock-2024', mode: 'content', root: `${R} .dnd5e-statblock`, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Monsters/Cinder Hound Alpha.md`); } },
	{ name: 'statblock-2014', mode: 'content', root: `${R} .dnd5e-statblock`, setup: async (c) => { await c.campaign(X14); await c.open(`${X14}/Monsters/Cinder Hound Alpha.md`); } },
	...[['quick-look-2024', X5], ['quick-look-2014', X14]].map(([name, folder]) => ({
		name, mode: 'window', root: '.modal.dnd5e-quick-look',
		setup: async (c) => {
			await c.campaign(folder);
			await c.eval(async (app, _p, [from, to]) => { const f = app.vault.getAbstractFileByPath(to); const text = await app.vault.read(app.vault.getAbstractFileByPath(from)); if (f) await app.vault.modify(f, text); else await app.vault.create(to, text); }, [`${X5}/References.md`, `${folder}/References.md`]);
			await c.open(`${folder}/References.md`);
			await c.page.locator(`${R} .dnd5e-ref .nimble-inline-name`, { hasText: 'Young Red Dragon' }).first().click();
			await c.page.locator('.modal.dnd5e-quick-look .dnd5e-statblock').waitFor({ timeout: 4000 });
		},
	})),
	{ name: 'npc', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/NPCs/Marta Vey.md`); await c.page.locator(`${R} .dnd5e-npc-stats`).first().waitFor({ timeout: 5000 }).catch(() => {}); } },
	{ name: 'npc-player', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(XP); await c.open(`${XP}/NPCs/Marta Vey.md`); } },
	{ name: 'quest', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Quests/Clear the Bridge.md`); } },
	{ name: 'location', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Locations/Waymoot Bridge.md`); } },
	{ name: 'session', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Sessions/Session 1 - The Bridge.md`); } },
	{
		name: 'campaign-panel', mode: 'sidebar', side: 'left', root: CP,
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.eval(async (app, plugin) => { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); }); await c.page.locator(`${CP} .campaign-group`).first().waitFor({ timeout: 5000 }); },
	},
	{
		name: 'campaign-panel-player', mode: 'sidebar', side: 'left', root: CP,
		setup: async (c) => { await c.campaign(XP); await c.open(`${XP}/Sessions/Session 1 - The Bridge.md`); await c.eval(async (app, plugin) => { app.workspace.leftSplit.expand(); await plugin.openCampaignView(); }); await c.page.locator(`${CP} .campaign-group`).first().waitFor({ timeout: 5000 }); },
	},
	{
		name: 'compendium', mode: 'content', root: `${CV5} .nimble-compendium`,
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.cmd('open-bestiary'); await c.page.locator(`${CV5} .nimble-cmpx-row[data-id]`).first().waitFor({ timeout: 5000 }); },
		states: tabStates(CV5),
	},
	{
		name: 'compendium-pages', mode: 'content', root: `${CV5} .nimble-compendium`,
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.cmd('open-bestiary'); await c.page.locator(`${CV5} .nimble-cmpx-row[data-id]`).first().waitFor({ timeout: 5000 }); },
		states: [
			{ name: 'class', go: async (c) => { await toList(c, CV5); await c.page.locator(`${CV5} .nimble-cmpx-seg`, { hasText: 'Classes' }).first().click(); await c.page.locator(`${CV5} .nimble-cmpx-input`).fill('wizard'); await c.wait(500); await c.page.locator(`${CV5} .nimble-cmpx-row[data-id]`).first().click(); await c.wait(600); } },
			{ name: 'spell', go: async (c) => { await toList(c, CV5); await c.page.locator(`${CV5} .nimble-cmpx-seg`, { hasText: 'Spells' }).first().click(); await c.page.locator(`${CV5} .nimble-cmpx-input`).fill('fireball'); await c.wait(500); await c.page.locator(`${CV5} .nimble-cmpx-row[data-id]`).first().click(); await c.wait(500); } },
			{ name: 'monster', go: async (c) => { await toList(c, CV5); await c.page.locator(`${CV5} .nimble-cmpx-seg`, { hasText: 'Monsters' }).first().click(); await c.page.locator(`${CV5} .nimble-cmpx-input`).fill('young red dragon'); await c.wait(500); await c.page.locator(`${CV5} .nimble-cmpx-row[data-id]`).first().click(); await c.wait(500); } },
			{ name: 'filters', go: async (c) => { await toList(c, CV5); await c.page.locator(`${CV5} .nimble-cmpx-seg`, { hasText: 'Spells' }).first().click(); await c.page.locator(`${CV5} .nimble-cmpx-input`).fill(''); await c.page.locator(`${CV5} .nimble-cmpx-input`).pressSequentially('level:3 school:evocation ', { delay: 20 }); await c.click(`${CV5} .nimble-cmpx-filter`); await c.page.mouse.move(2, 2); } },
		],
	},
	{
		name: 'compendium-dialog', mode: 'window', root: '.modal.nimble-cmpx-modal',
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.cmd('search-compendium'); await c.page.locator('.modal.nimble-cmpx-modal .nimble-cmpx-row[data-id]').first().waitFor({ timeout: 5000 }); await c.page.keyboard.type('goblin'); await c.wait(500); },
	},
	{
		name: 'omnisearch', mode: 'window', root: '.modal-container .prompt.nimble-omnisearch',
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await c.cmd('spotlight'); await c.page.locator('.nimble-omnisearch .prompt-input').waitFor(); await c.page.keyboard.type('school:evocation fire'); await c.wait(600); },
	},
	{
		name: 'slash-menu', mode: 'window', root: '.suggestion-container:has(.nimble-slash-item)',
		setup: async (c) => {
			await c.campaign(X5);
			await c.eval(async (app, _p, path) => { const f = app.vault.getAbstractFileByPath(path); if (f) await app.vault.modify(f, '# Prep\n\n'); else await app.vault.create(path, '# Prep\n\n'); }, `${X5}/Slash.md`);
			await c.open(`${X5}/Slash.md`, 'source');
			await c.eval((app) => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 2, ch: 0 }); ed.focus(); });
			await c.page.keyboard.type('/', { delay: 15 });
			await c.page.locator('.suggestion-container .nimble-slash-item').first().waitFor({ timeout: 3000 });
			await c.wait(300);
		},
		states: [
			{ name: 'all', go: async () => {} },
			{ name: 'encounter', go: async (c) => { await c.page.keyboard.type('enc', { delay: 15 }); await c.wait(250); await c.page.keyboard.press('Enter'); await c.wait(250); await c.page.keyboard.type('2 goblin warrior, ogre', { delay: 15 }); await c.wait(600); } },
		],
	},
	{ name: 'references', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/References.md`); } },
	{ name: 'references-live-preview', mode: 'content', root: `${S} .cm-contentContainer`, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/References.md`, 'source'); await c.eval((app) => { app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }); }); } },
	{
		name: 'hover-card', mode: 'window', root: '.nimble-hover-preview', hover: true, phone: false, // no hover on a touch screen
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/References.md`);
			await c.page.locator(`${R} .dnd5e-ref .nimble-inline-name`, { hasText: 'Young Red Dragon' }).first().hover();
			await c.page.locator('.nimble-hover-preview').first().waitFor({ timeout: 4000 });
			await c.page.locator('.nimble-hover-preview').first().hover({ position: { x: 4, y: 4 } });
			await c.wait(500);
		},
	},
	...[['monster', 'new-monster', 'Cinder Drake'], ['spell', 'new-spell', 'Cinder Ward'], ['item', 'new-item', 'Ember Blade']].map(([kind, command, name]) => ({
		name: `builder-${kind}`, mode: 'window', root: EB,
		setup: async (c) => { await c.campaign(X5); await builder(c, `${X5}/Chapter 1/Road Ambush.md`, command, name); },
		states: dotSteps(EB, '.eb-dot'),
	})),
	...['class', 'subclass', 'species', 'background', 'feat'].map(kind => ({
		name: `builder-${kind}`, mode: 'window', root: EB,
		setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Chapter 1/Road Ambush.md`); await newFromCompendium(c, CV5, kind); },
		states: dotSteps(EB, '.eb-dot'),
	})),
	{
		name: 'new-character', mode: 'window', root: EB,
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Chapter 1/Road Ambush.md`);
			await c.cmd('new-character');
			await c.page.locator(`${EB} .eb-panel.is-active`).waitFor({ timeout: 5000 });
			await c.page.locator(`${EB} .eb-panel.is-active input[data-field="Name"]`).fill('Ilse Vane');
			await c.page.locator(`${EB} .eb-panel.is-active select[data-field="Class"]`).selectOption('Wizard');
			await c.wait(300);
		},
		states: dotSteps(EB, '.eb-dot'),
	},
	{
		name: 'level-up', mode: 'window', root: EB,
		setup: async (c) => {
			await c.restore(`${X5}/Party/Ilse Vane.md`);
			await c.campaign(X5);
			await c.open(`${X5}/Party/Ilse Vane.md`);
			await c.click(`${R} .dnd5e-sheet-actions button`, { hasText: 'Level up' });
			await c.page.locator(`${EB} .eb-panel.is-active`).waitFor({ timeout: 5000 });
		},
		states: dotSteps(EB, '.eb-dot'),
	},
	{
		name: 'ddb-import', mode: 'window', root: '.modal.dnd5e-import',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Chapter 1/Road Ambush.md`);
			await c.cmd('import-ddb-character');
			await c.page.locator('.modal.dnd5e-import textarea').fill(c.fixture('tests/fixtures/ddb-hollowblade.json'));
			await c.page.locator('.modal.dnd5e-import .dnd5e-ddb-content').waitFor({ timeout: 5000 });
			await c.page.locator('.modal.dnd5e-import textarea').evaluate(t => { t.scrollTop = 0; });
			await c.wait(400);
		},
	},
	{
		name: 'import-content', mode: 'window', root: '.modal.nimble-import-content',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Chapter 1/Road Ambush.md`);
			await c.cmd('import-content');
			await c.page.locator('.modal.nimble-import-content textarea').fill(c.pack('5e-hearth-and-cinder.json'));
			await c.wait(600);
			await c.page.locator('.modal.nimble-import-content textarea').evaluate(t => { t.scrollTop = 0; });
		},
	},
	{
		name: 'roll-toast', mode: 'window', root: '.notice:has(.ev-roll-toast)',
		setup: async (c) => {
			await c.campaign(X5);
			await c.open(`${X5}/Chapter 1/Road Ambush.md`);
			await c.eval((app, plugin) => plugin.rollDice('1d20+4', 'Goblin Warrior · Scimitar', 'attack'));
			await c.page.locator('.notice .ev-roll-toast').first().waitFor({ timeout: 5000 });
		},
	},
	{
		name: 'map', mode: 'content', root: `${R} .nimble-map`,
		setup: async (c) => {
			await fight5e(c);
			await c.eval((app) => app.workspace.rightSplit.collapse());
			await c.open(`${X5}/Chapter 1/The Bridge Map.md`);
			const tok = c.page.locator(`${R} .nimble-map-btn[aria-label="Show the current encounter as tokens"]`);
			if (await tok.count()) { await tok.first().click(); await c.wait(600); }
		},
	},
	{ name: 'homebrew', mode: 'content', root: SIZER, setup: async (c) => { await c.campaign(X5); await c.open(`${X5}/Homebrew.md`); } },
];

const shared = [
	{
		name: 'party-editor', mode: 'window', root: '.modal.nimble-party-modal',
		setup: async (c) => {
			await c.campaign(null);
			await c.eval((app, plugin) => {
				plugin.settings.party = [
					{ id: 'p1', name: 'Brakka', className: 'Berserker', level: 3, maxHp: 34, defense: 13, maxWounds: 6 },
					{ id: 'p2', name: 'Wren', className: 'Mage', level: 3, maxHp: 22, defense: 11, maxWounds: 6 },
					{ id: 'p3', name: 'Tomas Underbough-Ferrante', className: 'Oathsworn', level: 3, maxHp: 27, defense: 14, maxWounds: 6 },
				];
				plugin.openParty();
			});
			await c.page.locator('.modal.nimble-party-modal').waitFor({ timeout: 4000 });
		},
	},
	{
		name: 'settings', mode: 'window', root: '.modal.mod-settings .vertical-tab-content',
		setup: async (c) => {
			await c.campaign(NQ);
			await c.eval((app) => { app.setting.open(); app.setting.openTabById('nimble-gm'); });
			await c.page.locator('.modal.mod-settings .vertical-tab-content .setting-item').first().waitFor({ timeout: 4000 });
			await c.wait(300);
		},
	},
	{
		name: 'new-campaign', mode: 'window', root: '.modal.nimble-new-campaign',
		setup: async (c) => { await c.cmd('new-campaign'); await c.page.locator('.modal.nimble-new-campaign').waitFor({ timeout: 4000 }); await c.page.locator('.modal.nimble-new-campaign input[type="text"]').first().fill('The Long Road'); },
	},
];

export const SURFACES = [
	...nimble.map(s => ({ game: 'nimble', ...s })),
	...dnd5e.map(s => ({ game: '5e', ...s })),
	...shared.map(s => ({ game: 'shared', ...s })),
];
