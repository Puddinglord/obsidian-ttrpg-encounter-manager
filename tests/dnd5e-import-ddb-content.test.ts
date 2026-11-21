import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeEntities, htmlToText, labelledValues } from '../src/systems/dnd5e/ddb-html';
import { ddbCharacterOf, importDdbCharacter } from '../src/systems/dnd5e/import-ddb';
import {
	ddbBlock, ddbContent, DdbContentEntry, DdbContentKind, DdbHave, fillIn, levelsMissing, maxLevel, planDdbContent, renameInFrontmatter, replaceBlock, startingEquipmentOf,
} from '../src/systems/dnd5e/import-ddb-content';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import { KINDS_5E } from '../src/systems/dnd5e/content';
import { checkEntry } from '../src/core/content/spec';
import { fencedBlocks, readContentBlock } from '../src/core/content/blocks';
import { parseSpell5e } from '../src/systems/dnd5e/homebrew';
import { parseItemBlock5e } from '../src/systems/dnd5e/homebrew-index';

// Mira Hollowell, a made-up level 7 Hollowblade in the shape D&D Beyond's character service returns. Every
// name and sentence in it is invented for these tests; the SRD names it carries (Elf, Alert, Light, Longsword)
// hold placeholder text, since the importer leaves them to the SRD.

type Obj = Record<string, unknown>;
const FIXTURE = readFileSync('tests/fixtures/ddb-hollowblade.json', 'utf8');
const mira = (): Obj => ddbCharacterOf(FIXTURE);
const content = (c: Obj = mira(), edition: '2014' | '2024' = '2024') => ddbContent(c, edition);
const byName = (list: DdbContentEntry[], kind: DdbContentKind, name: string) => list.find(e => e.kind === kind && e.name === name)!;
const html = (s: string) => `<p>${s}</p>`;

/** The same character two levels on: D&D Beyond now gives the class's features up to level 9. */
function miraAt9(): Obj {
	const c = mira();
	const cls = (c.classes as Obj[])[0];
	cls.level = 9;
	const def = cls.definition as Obj;
	(def.classFeatures as Obj[]).push(
		{ id: 910010, name: 'Ability Score Improvement', description: html('You gain the Ability Score Improvement feat or another feat of your choice for which you qualify.'), requiredLevel: 8 },
		{ id: 910011, name: 'Undying Edge', description: html('Your weapon attacks score a Critical Hit on a roll of 19 or 20 against undead.'), requiredLevel: 9 },
	);
	return c;
}

/** The SRD for an edition, as the import dialog asks it (have5e in import-content-ui.ts does the same with the vault). */
function srdOnly(edition: '2014' | '2024', mine: DdbHave['mine'] = []): DdbHave {
	const c = compendium5e(edition);
	const lists: Record<DdbContentKind, { name: string }[]> = {
		class: c.classes, subclass: c.classes.flatMap(x => x.subclasses), species: c.species.flatMap(s => [s, ...s.subspecies]), background: c.backgrounds,
		feat: c.feats, spell: c.spells, item: c.items, equipment: c.equipment,
	};
	const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	return { srd: (kind, name) => lists[kind].find(x => key(x.name) === key(name)), mine };
}

describe('D&D Beyond HTML as text', () => {
	it('keeps paragraphs, bold and italic, lists and tables as our cards draw them', () => {
		expect(htmlToText('<p>You gain the following benefits.</p><p><strong><em>Ringing Blade.</em></strong> Your die grows.</p>'))
			.toBe('You gain the following benefits.\n**Ringing Blade.** Your die grows.');
		expect(htmlToText('<p>Spaces <strong>inside </strong>bold and<em> italic</em>.</p>')).toBe('Spaces **inside** bold and *italic*.');
		expect(htmlToText('<ul><li>One</li><li>Two <b>bold</b></li></ul><p>After</p>')).toBe('- One\n- Two **bold**\nAfter');
		expect(htmlToText('<table><thead><tr><th>Level</th><th>Die</th></tr></thead><tbody><tr><td>1st</td><td>1d4</td></tr><tr><td>5th</td><td>1d6</td></tr></tbody></table>'))
			.toBe('| Level | Die |\n| --- | --- |\n| 1st | 1d4 |\n| 5th | 1d6 |');
		expect(htmlToText('<h4>Hollow Die</h4><p>Line one<br>line two</p>')).toBe('**Hollow Die**\nLine one\nline two');
	});

	it('decodes entities, drops tags it doesn\'t know and never keeps script or style', () => {
		expect(decodeEntities('Can&rsquo;t &amp; won&#39;t &#x2014; 5&nbsp;ft. &bogus;')).toBe('Can’t & won\'t — 5 ft. &bogus;');
		expect(htmlToText('<p>A <a href="https://example.com">link</a> and <span class="tooltip" data-x="1">frightened</span>.</p>')).toBe('A link and frightened.');
		expect(htmlToText('<p>Safe</p><script>alert(1)</script><style>p{}</style><img src="x" onerror="alert(1)"><p>still</p>')).toBe('Safe\nstill');
		expect(htmlToText('<p>3 < 4 and <strong>unclosed</p><p>next</p>')).toBe('3 < 4 and **unclosed**\n**next**');
		expect(htmlToText('')).toBe('');
	});

	it('finds labelled values in a traits table and in bold run-in labels', () => {
		const lv = labelledValues('<table><tr><th>Primary Ability</th><td>Strength</td></tr><tr><th>Skill Proficiencies</th><td><em>Choose 2:</em> Arcana or Athletics</td></tr></table><p><strong>Feat:</strong> Alert</p><p>Tool Proficiency: Mason\'s Tools</p>');
		expect(Object.fromEntries(lv)).toEqual({ 'primary ability': 'Strength', 'skill proficiencies': 'Choose 2: Arcana or Athletics', feat: 'Alert', 'tool proficiency': 'Mason\'s Tools' });
	});
});

describe('a D&D Beyond character\'s content', () => {
	it('reads a class with its features by level, its table as far as D&D Beyond gave it, and its limited uses', () => {
		const cls = byName(content(), 'class', 'Hollowblade');
		expect(cls.ddbId).toBe(900001);
		expect(cls.seen).toBe(7);
		const v = cls.value;
		expect(v).toMatchObject({
			name: 'Hollowblade', imported: 'D&D Beyond', ddbId: 900001, hitDie: 10, primary: 'Strength and Intelligence', saves: ['STR', 'INT'],
			proficiencies: ['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons'],
			skillChoice: 'Choose 2: Arcana, Athletics, Insight, Investigation, Perception, or Survival',
			// Uses equal to the proficiency bonus are a resource; uses that grow by level are the table's column.
			resources: [{ name: 'Ashen Step', level: 2, reset: 'long', uses: 'PB' }],
			startingEquipment: [{ options: [{ label: 'A', items: ['Scale Mail', 'Shield', 'Longsword', '2 Dagger'], gold: 12 }, { label: 'B', gold: 160 }] }],
		});
		// No spell slots for a class that doesn't cast; no "Core Hollowblade Traits" feature (its table is the fields above).
		expect(v.spellcasting).toBeUndefined();
		const features = v.features as { level: number; name: string; desc: string }[];
		expect(features.map(f => `${f.level} ${f.name}`)).toEqual(['1 Hollow Strike', '1 Grave Sense', '2 Ashen Step', '3 Hollowblade Order', '4 Ability Score Improvement', '5 Extra Attack', '6 Lantern Ward', '7 Order Feature']);
		// A die that grows by level is written into its feature's text.
		expect(features[0].desc).toMatch(/\n\*\*By level\.\*\* 1d4 at level 1, 1d6 at level 5, 1d8 at level 11\.$/);
		expect(features[6].desc).toBe('You and allies within 10 feet of you have Advantage on saving throws against the **Frightened** condition.');
		const levels = v.levels as { level: number; pb: number; features: string[]; extra?: Obj }[];
		expect(levels.map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(levels.map(l => l.pb)).toEqual([2, 2, 2, 2, 3, 3, 3]);
		expect(levels[3].features).toEqual(['Ability Score Improvement']);
		expect(levels.map(l => l.extra?.grave_sense_uses)).toEqual([2, 2, 2, 2, 3, 3, 3]);
	});

	it('reads a caster\'s slots, cantrips and prepared spells, and 2014\'s Proficiencies feature', () => {
		const c = mira();
		const def = (c.classes as Obj[])[0].definition as Obj;
		Object.assign(def, {
			description: '', canCastSpells: true, spellCastingAbilityId: 4, hitDice: 8,
			spellRules: {
				levelCantripsKnownMaxes: [0, 2, 2, 2, 3, 3, 3, 3], levelSpellKnownMaxes: [0, 0, 2, 3, 3, 4, 4, 5],
				levelSpellSlots: [[0, 0, 0], [0, 0, 0], [2, 0, 0], [3, 0, 0], [3, 0, 0], [4, 2, 0], [4, 2, 0], [4, 3, 0]],
			},
		});
		(def.classFeatures as Obj[]).unshift({ id: 1, name: 'Proficiencies', requiredLevel: 1, description: '<p><strong>Armor:</strong> Light armor</p><p><strong>Weapons:</strong> Simple weapons, hand crossbows</p><p><strong>Tools:</strong> Tinker\'s tools</p><p><strong>Saving Throws:</strong> Intelligence, Wisdom</p><p><strong>Skills:</strong> Choose two from Arcana, History, and Nature</p>' });
		const v = byName(content(c, '2014'), 'class', 'Hollowblade').value;
		expect(v).toMatchObject({ hitDie: 8, spellcasting: 'INT', saves: ['INT', 'WIS'], proficiencies: ['Light Armor', 'Simple Weapons', 'Hand Crossbows', 'Tinker\'s tools'], skillChoice: 'Choose two from Arcana, History, and Nature' });
		const levels = v.levels as Obj[];
		expect(levels[0]).toEqual({ level: 1, pb: 2, features: ['Hollow Strike', 'Grave Sense'], cantrips: 2, extra: { grave_sense_uses: 2 } });
		expect(levels[1]).toMatchObject({ level: 2, slots: [2, 0, 0], prepared: 2 });
		expect(levels[4]).toMatchObject({ level: 5, slots: [4, 2, 0], cantrips: 3, prepared: 4 });
		expect((v.features as Obj[]).some(f => f.name === 'Proficiencies')).toBe(false);
	});

	it('reads the subclass for its class, with its features and what the class calls it', () => {
		expect(byName(content(), 'subclass', 'Order of the Quiet Lantern')).toMatchObject({
			ddbId: 900101, seen: 7,
			value: {
				name: 'Order of the Quiet Lantern', imported: 'D&D Beyond', ddbId: 900101, class: 'Hollowblade', flavor: 'Hollowblade Order',
				desc: 'Hollowblades of this order carry a small lantern that never goes out.',
				features: [
					{ level: 3, name: 'Quiet Flame', desc: 'Your Hollow Strike can deal Radiant damage instead of Force damage.' },
					{ level: 3, name: 'Lantern Bearer', desc: 'You always know the way back to the last place you lit a fire.' },
					{ level: 7, name: 'Steady Light', desc: expect.stringMatching(/can’t use it again until you finish a Long Rest\.$/) as string },
				],
			},
		});
	});

	it('reads a species: size and speed, its traits, 2014\'s bonuses, lore traits in its description', () => {
		const c = mira();
		c.race = {
			entityRaceId: 77, fullName: 'Ashborn', isHomebrew: true, sizeId: 3, weightSpeeds: { normal: { walk: 25 } },
			description: html('Ashborn are small folk born in the cinders.'),
			racialTraits: [
				{ definition: { id: 1, name: 'Ability Score Increase', description: html('Your Constitution score increases by 2.') } },
				{ definition: { id: 2, name: 'Age', description: html('Ashborn live about a century.') } },
				{ definition: { id: 3, name: 'Speed', description: html('Your speed is 25 feet.') } },
				{ definition: { id: 4, name: 'Ember Blood', description: html('You have Resistance to Fire damage.') } },
			],
		};
		(c.modifiers as Obj).race = [{ type: 'bonus', subType: 'constitution-score', value: 2, componentId: 1 }];
		expect(byName(content(c, '2014'), 'species', 'Ashborn')).toEqual({
			kind: 'species', name: 'Ashborn', ddbId: 77, homebrew: true,
			value: {
				name: 'Ashborn', imported: 'D&D Beyond', ddbId: 77, size: 'Small', speed: 25, abilityBonuses: 'CON +2',
				desc: 'Ashborn are small folk born in the cinders.\n**Age.** Ashborn live about a century.',
				traits: [{ name: 'Ember Blood', desc: 'You have Resistance to Fire damage.' }],
			},
		});
	});

	it('reads a background: skills and tools, ability scores, its feat and its starting equipment', () => {
		expect(byName(content(), 'background', 'Grave Tender').value).toEqual({
			name: 'Grave Tender', imported: 'D&D Beyond', ddbId: 930001,
			proficiencies: ['Skill: Insight', 'Skill: Religion', 'Tool: Mason\'s Tools'],
			abilityScores: ['STR', 'INT', 'WIS'], feat: 'Alert',
			equipment: 'Choose A or B: (A) Mason\'s Tools, Shovel, Lantern, Traveler\'s Clothes, and 8 GP; or (B) 50 GP',
			startingEquipment: [{ label: '(A) Mason\'s Tools, Shovel, Lantern, Traveler\'s Clothes, and 8 GP; or (B) 50 GP', options: [{ label: 'A', items: ['Mason\'s Tools', 'Shovel', 'Lantern', 'Traveler\'s Clothes'], gold: 8 }, { label: 'B', gold: 50 }] }],
			tools: ['Mason\'s Tools'],
		});
		expect(startingEquipmentOf('You start with a shovel.')).toBeUndefined();
		expect(startingEquipmentOf('(A) Book (prayers, hymns), 2 Candle; or (B) 9 GP')?.[0].options[0].items).toEqual(['Book (prayers, hymns)', '2 Candle']);
	});

	it('reads a feat with its type and prerequisite, its text as markdown', () => {
		expect(byName(content(), 'feat', 'Hollow Focus').value).toEqual({
			name: 'Hollow Focus', imported: 'D&D Beyond', ddbId: 940001, type: 'general', prerequisite: 'Level 4+, Hollowblade',
			desc: 'You gain the following benefits.\n**Ringing Blade.** Your Hollow Strike die increases by one size against undead.\n**Lantern Lance.** You learn the *Lantern Lance* spell.',
		});
	});

	it('reads a spell: casting time, range, components and duration in the edition\'s words, its higher-level text apart', () => {
		const v = byName(content(), 'spell', 'Lantern Lance').value;
		expect(v).toEqual({
			name: 'Lantern Lance', imported: 'D&D Beyond', ddbId: 950001, level: 1, school: 'Evocation', castingTime: 'Action', range: '60 feet', components: 'V, S, M (a lantern wick)',
			duration: 'Instantaneous', desc: expect.stringMatching(/^A spear of pale lantern light[\s\S]*next turn\.$/) as string,
			higherLevel: 'The damage increases by 1d8 for each spell slot level above 1.', classes: [],
		});
		const c = mira();
		const lance = ((c.spells as Obj).feat as Obj[])[0].definition as Obj;
		Object.assign(lance, { activation: { activationTime: 1, activationType: 3 }, range: { origin: 'Self', aoeType: 'Cone', aoeValue: 15 }, duration: { durationInterval: 1, durationUnit: 'Minute', durationType: 'Concentration' }, ritual: true });
		// Known through the class: on the class's list.
		(c.classSpells as Obj[])[0].spells = [{ definition: lance }];
		expect(byName(content(c, '2014'), 'spell', 'Lantern Lance').value).toMatchObject({ castingTime: '1 bonus action', range: 'Self (15-foot cone)', duration: 'Concentration, up to 1 minute', concentration: true, ritual: true, classes: ['Hollowblade'] });
	});

	it('reads items: a magic item, and a weapon or armor as equipment', () => {
		const all = content();
		expect(byName(all, 'item', 'Lantern of Last Light').value).toEqual({
			name: 'Lantern of Last Light', imported: 'D&D Beyond', ddbId: 960001, rarity: 'Uncommon', type: 'Wondrous item', attunement: true,
			desc: expect.stringMatching(/^While attuned to this lantern/) as string,
		});
		expect(byName(all, 'equipment', 'Hookblade').value).toEqual({
			name: 'Hookblade', imported: 'D&D Beyond', ddbId: 960002, category: 'Martial Melee Weapon', weaponCategory: 'Martial', weaponRange: 'Melee',
			damage: '1d6 slashing', properties: ['Finesse', 'Light'], cost: '12 gp', weight: 2, desc: 'A short blade with a hooked tip, made for pulling shields aside.',
		});
		const c = mira();
		(c.inventory as Obj[]).push({ quantity: 1, definition: { id: 5, name: 'Ashweave Coat', magic: false, filterType: 'Armor', armorTypeId: 2, armorClass: 13, stealthCheck: 2, cost: 60, weight: 12 } });
		expect(byName(content(c), 'equipment', 'Ashweave Coat').value).toMatchObject({ category: 'Medium Armor', armorCategory: 'Medium', ac: { base: 13, dex: true, max: 2 }, stealthDisadvantage: true, cost: '60 gp' });
	});

	it('gives every entry in a shape its kind accepts, and writes blocks that read back the same', () => {
		for (const e of content()) {
			const kind = KINDS_5E.find(k => k.kind === e.kind)!;
			const checked = checkEntry(kind, e.value);
			expect([e.name, checked.errors, checked.warnings]).toEqual([e.name, [], []]);
			const { lang, body } = ddbBlock(e.kind, e.value, '2024');
			if (e.kind === 'spell') {
				expect(lang).toBe('5e-spell');
				expect(parseSpell5e(body)).toMatchObject({ name: e.name, imported: 'D&D Beyond', ddbId: e.ddbId, level: e.value.level, castingTime: e.value.castingTime });
			} else if (e.kind === 'item' || e.kind === 'equipment') {
				expect(lang).toBe('5e-item');
				const read = parseItemBlock5e(body)!;
				expect((read.item ?? read.equipment)).toMatchObject({ name: e.name, imported: 'D&D Beyond', ddbId: e.ddbId });
				expect(!!read.equipment).toBe(e.kind === 'equipment');
			} else {
				expect(lang).toBe(`5e-${e.kind}`);
				expect(readContentBlock(kind, body).entry?.value).toEqual(e.value);
			}
		}
	});

	it('writes the class block with where it came from at the top', () => {
		const body = ddbBlock('class', byName(content(), 'class', 'Hollowblade').value, '2024').body;
		expect(body.split('\n').slice(0, 4)).toEqual(['name: Hollowblade', 'imported: D&D Beyond', 'ddbId: 900001', 'hitDie: 10']);
	});
});

describe('a character that says little', () => {
	it('brings nothing D&D Beyond gave only a name for, and isn\'t mistaken for homebrew', () => {
		// The shape the older import tests use: names and numbers, no definitions.
		const pip = ddbCharacterOf({ data: {
			name: 'Pip', race: { fullName: 'Elf' }, background: { definition: { name: 'Sage' } },
			classes: [{ level: 3, definition: { name: 'Wizard' }, subclassDefinition: { name: 'Evoker' } }], stats: [],
			classSpells: [{ spells: [{ definition: { name: 'Fire Bolt' } }] }], inventory: [{ definition: { id: 10, name: 'Quarterstaff' } }], feats: [{ definition: { name: 'Alert' } }],
		} });
		expect(content(pip)).toEqual([]);
		// A Wizard D&D Beyond gave features for but no hit die is still the SRD's Wizard.
		const def = (pip.classes as Obj[])[0].definition as Obj;
		def.classFeatures = [{ name: 'Arcane Recovery', requiredLevel: 1, description: html('Placeholder text.') }];
		expect(planDdbContent(content(pip), srdOnly('2024')).map(p => `${p.name}: ${p.status}`)).toEqual(['Wizard: srd']);
	});
});

describe('planning an import', () => {
	it('leaves what the SRD has to the SRD, and ticks what\'s new', () => {
		const plan = planDdbContent(content(), srdOnly('2024'));
		const status = Object.fromEntries(plan.map(p => [`${p.entry.kind}:${p.name}`, `${p.status}${p.on ? ' on' : ''}`]));
		expect(status).toEqual({
			'class:Hollowblade': 'new on', 'subclass:Order of the Quiet Lantern': 'new on', 'species:Elf': 'srd', 'background:Grave Tender': 'new on',
			'feat:Hollow Focus': 'new on', 'feat:Alert': 'srd', 'spell:Light': 'srd', 'spell:Lantern Lance': 'new on',
			'item:Lantern of Last Light': 'new on', 'equipment:Hookblade': 'new on', 'equipment:Longsword': 'srd',
		});
		expect(levelsMissing(plan)).toEqual([{ name: 'Hollowblade', kind: 'class', seen: 7 }]);
	});

	it('imports an SRD name whose version is clearly different under its own name, and the character note follows', () => {
		const c = mira();
		((c.spells as Obj).race as Obj[])[0].definition = { id: 2129, name: 'Light', level: 2, school: 'Necromancy', isHomebrew: true, description: html('A homebrew Light.') };
		const plan = planDdbContent(content(c), srdOnly('2024'));
		const light = plan.find(p => p.entry.name === 'Light')!;
		expect([light.status, light.name, light.on, light.value.name]).toEqual(['new', 'Light (D&D Beyond)', true, 'Light (D&D Beyond)']);
		const fm: Obj = { spells: ['Light', 'Lantern Lance'], class: 'Hollowblade' };
		renameInFrontmatter(fm, plan.filter(p => p.on));
		expect(fm).toEqual({ spells: ['Light (D&D Beyond)', 'Lantern Lance'], class: 'Hollowblade' });
	});

	it('fills in levels an earlier import didn\'t have, keeping what you changed, and leaves a complete one alone', () => {
		const first = content();
		const cls = byName(first, 'class', 'Hollowblade');
		// The earlier import, with a feature's text you rewrote since.
		const old = { ...cls.value, features: (cls.value.features as Obj[]).map(f => (f.name === 'Lantern Ward' ? { ...f, desc: 'My table\'s version.' } : f)) };
		const mine: DdbHave['mine'] = [{ kind: 'class', name: 'Hollowblade', value: old, file: 'Ember Vault/Content/5e/Classes/Hollowblade.md' }];
		const again = planDdbContent(content(miraAt9()), srdOnly('2024', mine)).find(p => p.entry.kind === 'class')!;
		expect([again.status, again.what, again.on, again.file]).toEqual(['update', 'levels 8–9', true, 'Ember Vault/Content/5e/Classes/Hollowblade.md']);
		expect(maxLevel(again.value)).toBe(9);
		const features = again.value.features as Obj[];
		expect(features.find(f => f.name === 'Lantern Ward')!.desc).toBe('My table\'s version.');
		expect(features.slice(-2).map(f => `${String(f.level)} ${String(f.name)}`)).toEqual(['8 Ability Score Improvement', '9 Undying Edge']);
		expect((again.value.levels as Obj[]).find(l => l.level === 9)).toEqual({ level: 9, pb: 4, features: ['Undying Edge'], extra: { grave_sense_uses: 4 } });

		// The same character again: nothing new, nothing ticked.
		const same = planDdbContent(content(), srdOnly('2024', mine)).find(p => p.entry.kind === 'class')!;
		expect([same.status, same.on]).toEqual(['same', false]);
		// Found by D&D Beyond's id even under another name.
		const renamed: DdbHave['mine'] = [{ kind: 'class', name: 'Hollow Knight', value: { ...old, name: 'Hollow Knight' }, file: 'x.md' }];
		const byId = planDdbContent(content(miraAt9()), srdOnly('2024', renamed)).find(p => p.entry.kind === 'class')!;
		expect([byId.status, byId.name]).toEqual(['update', 'Hollow Knight']);
	});

	it('a subclass gains the features of the levels it didn\'t have', () => {
		const sub = byName(content(), 'subclass', 'Order of the Quiet Lantern');
		const early = { ...sub.value, features: (sub.value.features as Obj[]).filter(f => f.level === 3) };
		expect(fillIn(early, sub.value, 'subclass')).toMatchObject({ what: 'level 7' });
		expect(fillIn(sub.value, sub.value, 'subclass').what).toBeUndefined();
		// Other kinds an earlier import wrote are left as they are.
		expect(fillIn({ name: 'A', desc: 'old' }, { name: 'A', desc: 'new' }, 'feat')).toEqual({ value: { name: 'A', desc: 'old' } });
	});

	it('never touches a note of yours by that name', () => {
		const mine: DdbHave['mine'] = [{ kind: 'feat', name: 'Hollow Focus', value: { name: 'Hollow Focus', desc: 'Mine.' }, file: 'Ember Vault/Content/5e/Feats/Hollow Focus.md' }];
		const p = planDdbContent(content(), srdOnly('2024', mine)).find(x => x.entry.name === 'Hollow Focus')!;
		expect([p.status, p.on]).toEqual(['yours', false]);
		// A magic item and equipment share the item block: a note's equipment of that name is yours too.
		const items: DdbHave['mine'] = [{ kind: 'equipment', name: 'Lantern of Last Light', value: { name: 'Lantern of Last Light' }, file: 'a.md' }];
		expect(planDdbContent(content(), srdOnly('2024', items)).find(x => x.entry.kind === 'item')!.status).toBe('yours');
	});

	it('replaces an earlier import\'s block in its note, leaving the rest of the note alone', () => {
		const note = 'Notes above.\n\n```5e-class\nname: Hollowblade\nimported: D&D Beyond\nddbId: 900001\nhitDie: 10\n```\n\nNotes below.\n';
		const next = '```5e-class\nname: Hollowblade\nimported: D&D Beyond\nddbId: 900001\nhitDie: 12\n```';
		expect(replaceBlock(note, '5e-class', { ddbId: 900001, name: 'Hollowblade' }, next)).toBe(note.replace('hitDie: 10', 'hitDie: 12'));
		expect(replaceBlock(note, '5e-class', { ddbId: 1, name: 'Other' }, next)).toBeNull();
		expect(fencedBlocks(replaceBlock(note, '5e-class', { name: 'Hollowblade' }, next)!, new Set(['5e-class']))).toHaveLength(1);
	});

	it('the character note and its content agree on names', () => {
		const r = importDdbCharacter(FIXTURE);
		const names = content().map(e => e.name);
		expect(names).toEqual(expect.arrayContaining([r.frontmatter.class, r.frontmatter.subclass, r.frontmatter.background, ...(r.frontmatter.feats as string[])]));
		expect(r.frontmatter).toMatchObject({ class: 'Hollowblade', subclass: 'Order of the Quiet Lantern', level: 7, species: 'Elf', background: 'Grave Tender', edition: '2024' });
	});
});
