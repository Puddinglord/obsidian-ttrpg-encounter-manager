import { describe, expect, it } from 'vitest';
import { ddbJsonUrl, importDdbCharacter } from '../src/systems/dnd5e/import-ddb';
import { readSheet5e } from '../src/systems/dnd5e/character';

// Made-up characters in the shape D&D Beyond's character service returns.
// Only the fields the importer reads; no real players, no book text.

type Obj = Record<string, unknown>;
const stat = (values: (number | null)[]) => values.map((value, i) => ({ id: i + 1, name: null, value }));
const mod = (type: string, subType: string, value: number | null = null, extra: Obj = {}) => ({ type, subType, value, friendlySubtypeName: subType, ...extra });
const cls = (name: string, level: number, o: { sub?: string; starting?: boolean; sources?: number[]; hitDiceUsed?: number } = {}) => ({
	level,
	isStartingClass: o.starting ?? false,
	hitDiceUsed: o.hitDiceUsed ?? 0,
	definition: { name, sources: (o.sources ?? [145]).map(sourceId => ({ sourceId, pageNumber: 1 })) },
	subclassDefinition: o.sub ? { name: o.sub } : null,
});
const spell = (name: string) => ({ definition: { name } });
const item = (id: number, name: string, o: { qty?: number; equipped?: boolean; attune?: boolean; attuned?: boolean } = {}) => ({
	quantity: o.qty ?? 1, equipped: o.equipped ?? false, isAttuned: o.attuned ?? false,
	definition: { id, name, canAttune: o.attune ?? false },
});

/** Pip Underbough, a level 3 wizard: a 2024 species, a 2024 background. */
function wizard(): Obj {
	return {
		id: 1001, name: 'Pip Underbough',
		race: { fullName: 'Elf', baseRaceName: 'Elf', isLegacy: false, isSubRace: false, sources: [{ sourceId: 145 }] },
		background: { hasCustomBackground: false, definition: { name: 'Sage', sources: [{ sourceId: 145 }] }, customBackground: { name: null } },
		classes: [cls('Wizard', 3, { sub: 'Evoker', starting: true })],
		stats: stat([8, 14, 13, 15, 12, 10]),
		bonusStats: stat([null, null, null, null, null, null]),
		overrideStats: stat([null, null, null, null, null, null]),
		modifiers: {
			race: [mod('proficiency', 'perception')],
			class: [mod('proficiency', 'arcana'), mod('proficiency', 'history'), mod('proficiency', 'intelligence-saving-throws')],
			background: [mod('bonus', 'intelligence-score', 2), mod('bonus', 'constitution-score', 1)],
			item: [], feat: [], condition: [],
		},
		baseHitPoints: 14, bonusHitPoints: null, overrideHitPoints: null, removedHitPoints: 5, temporaryHitPoints: 3,
		classSpells: [{ characterClassId: 1, spells: [spell('Fire Bolt'), spell('Magic Missile'), spell('Shield')] }],
		spells: { race: [spell('Light')], class: [], feat: [], item: [spell('Not From The Wizard')] },
		inventory: [item(10, 'Quarterstaff', { equipped: true }), item(11, 'Potion of Healing', { qty: 2 }), item(12, 'Spellbook')],
		currencies: { cp: 7, sp: 3, ep: 0, gp: 12, pp: 0 },
		feats: [],
	};
}

const wrap = (data: Obj) => ({ id: 1001, success: true, message: 'Character successfully received.', data, pagination: null });

describe('ddbJsonUrl', () => {
	const svc = 'https://character-service.dndbeyond.com/character/v5/character/123456789';
	it('turns a character link, a profile link, a share link or an id into the JSON link', () => {
		expect(ddbJsonUrl('https://www.dndbeyond.com/characters/123456789')).toBe(svc);
		expect(ddbJsonUrl('https://www.dndbeyond.com/characters/123456789/AbCdEf')).toBe(svc);
		expect(ddbJsonUrl('https://dndbeyond.com/profile/someone/characters/123456789')).toBe(svc);
		expect(ddbJsonUrl('www.dndbeyond.com/characters/123456789?tab=spells')).toBe(svc);
		expect(ddbJsonUrl('https://ddb.ac/characters/123456789/xYz')).toBe(svc);
		expect(ddbJsonUrl('  123456789  ')).toBe(svc);
		expect(ddbJsonUrl(svc)).toBe(svc);
	});
	it('says no to anything else', () => {
		for (const s of ['', 'abc', 'https://example.com/characters/123', 'https://www.dndbeyond.com/monsters/123-goblin', 'https://www.dndbeyond.com/characters', 'https://evil-dndbeyond.com.example.org/characters/1']) {
			expect(ddbJsonUrl(s)).toBeNull();
		}
	});
});

describe('importing a D&D Beyond character', () => {
	it('reads a single-class 2024 character into the sheet’s frontmatter', () => {
		const r = importDdbCharacter(wrap(wizard()));
		expect(r.name).toBe('Pip Underbough');
		expect(r.edition).toBe('2024');
		expect(r.notes).toEqual([]);
		expect(r.frontmatter).toEqual({
			nimble: 'character', system: '5e', edition: '2024', cssclasses: ['nimble-sheet-note'],
			class: 'Wizard', subclass: 'Evoker', level: 3, species: 'Elf', background: 'Sage',
			str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10,
			skills: ['Arcana', 'History', 'Perception'],
			// 14 base + Con +2 × 3.
			hp: 15, hp_max: 20, temp_hp: 3,
			spells: ['Fire Bolt', 'Magic Missile', 'Shield', 'Light'],
			inventory: [{ name: 'Quarterstaff', equipped: true }, { name: 'Potion of Healing', qty: 2 }, { name: 'Spellbook' }],
			gold: 12.37,
		});
	});

	it('gives the sheet what it needs: the SRD resolves the names', () => {
		const s = readSheet5e(importDdbCharacter(wizard()).frontmatter, '2024', 'Pip');
		expect(s.className).toBe('Wizard');
		expect(s.cls?.name).toBe('Wizard');
		expect(s.mods.int).toBe(3);
		expect(s.hp).toBe(15);
		expect(s.spells.find(x => x.name === 'Magic Missile')?.spell).toBeTruthy();
		expect(s.attacks.map(a => a.name)).toEqual(['Quarterstaff']);
		expect(s.skills.find(k => k.name === 'Arcana')?.proficient).toBe(true);
	});

	it('accepts the JSON as text, wrapped or not', () => {
		const a = importDdbCharacter(JSON.stringify(wrap(wizard())));
		const b = importDdbCharacter(JSON.stringify(wizard()));
		expect(a).toEqual(b);
		expect(importDdbCharacter({ character: wizard() }).name).toBe('Pip Underbough');
	});

	it('multiclass: the starting class first, total level, the rest under classes, and a note', () => {
		const c = wizard();
		c.name = 'Bram Ironwood';
		c.classes = [cls('Fighter', 2, { sub: '' }), cls('Wizard', 3, { sub: 'Evoker', starting: true }), cls('Cleric', 1)];
		const r = importDdbCharacter(c);
		expect(r.frontmatter).toMatchObject({ class: 'Wizard', subclass: 'Evoker', level: 6 });
		expect(r.frontmatter.classes).toEqual([{ name: 'Wizard', level: 3, subclass: 'Evoker' }, { name: 'Fighter', level: 2 }, { name: 'Cleric', level: 1 }]);
		expect(r.notes).toContain('Multiclass: the sheet shows Wizard at level 6; Fighter 2, Cleric 1 are listed under classes. Its spell slots and features follow Wizard only.');
		// Con +2 for every level.
		expect(r.frontmatter.hp_max).toBe(14 + 2 * 6);
	});

	it('a 2014 character: race with its subrace, race:, and 2014 by the books', () => {
		const c = wizard();
		c.race = { fullName: 'Hill Dwarf', baseRaceName: 'Dwarf', subRaceShortName: 'Hill', isSubRace: true, isLegacy: true, sources: [{ sourceId: 2 }] };
		c.classes = [cls('Cleric', 1, { sub: 'Life Domain', starting: true, sources: [2] })];
		c.background = { hasCustomBackground: false, definition: { name: 'Acolyte', sources: [{ sourceId: 2 }] } };
		c.modifiers = {
			race: [mod('bonus', 'constitution-score', 2), mod('bonus', 'wisdom-score', 1), mod('bonus', 'hit-points-per-level', 1)],
			class: [mod('proficiency', 'insight'), mod('proficiency', 'religion')],
		};
		c.baseHitPoints = 8;
		c.removedHitPoints = 0;
		c.temporaryHitPoints = 0;
		const r = importDdbCharacter(c);
		expect(r.edition).toBe('2014');
		expect(r.frontmatter).toMatchObject({ edition: '2014', race: 'Hill Dwarf', class: 'Cleric', subclass: 'Life Domain', background: 'Acolyte', con: 15, wis: 13 });
		expect(r.frontmatter.species).toBeUndefined();
		// 8 base + Con +2 + Dwarven Toughness +1.
		expect(r.frontmatter).toMatchObject({ hp: 11, hp_max: 11 });
		expect(r.frontmatter.temp_hp).toBeUndefined();
		const s = readSheet5e(r.frontmatter, '2014');
		expect(s.species).toBe('Hill Dwarf');
		expect(s.features.some(f => /Dwarven Toughness/.test(f.name))).toBe(true);
	});

	it('2014 or 2024: the race’s books, then the classes’, then the background’s, else 2024 with a note', () => {
		const c = wizard();
		c.race = { fullName: 'Human', sources: [] };
		c.classes = [cls('Fighter', 1, { sources: [1] })];
		expect(importDdbCharacter(c).edition).toBe('2014');
		c.classes = [cls('Fighter', 1, { sources: [] })];
		c.background = { definition: { name: 'Soldier', sources: [{ sourceId: 148 }] } };
		expect(importDdbCharacter(c).edition).toBe('2024');
		c.background = { definition: { name: 'Soldier' } };
		const r = importDdbCharacter(c);
		expect(r.edition).toBe('2024');
		expect(r.notes[0]).toMatch(/Couldn’t tell which rules/);
	});

	it('the caller can choose the rules', () => {
		const r = importDdbCharacter(wizard(), { edition: '2014', mine: true });
		expect(r.edition).toBe('2014');
		expect(r.frontmatter).toMatchObject({ edition: '2014', race: 'Elf', mine: true });
		expect(r.notes).toEqual([]);
	});

	it('ability scores: base, other bonuses, race, background, feats and items in use, set-base and overrides', () => {
		const c = wizard();
		c.stats = stat([10, 12, 14, 8, 13, 15]);
		c.bonusStats = stat([1, null, null, null, null, 2]);
		c.overrideStats = stat([null, 18, null, null, null, null]);
		c.inventory = [
			item(50, 'Belt of Hill Giant Strength', { equipped: true, attune: true, attuned: true }),
			item(51, 'Headband of Intellect', { equipped: true, attune: true, attuned: false }),
			item(52, 'Ioun Stone of Fortitude', { equipped: false }),
		];
		c.modifiers = {
			race: [mod('bonus', 'charisma-score', 2), mod('bonus', 'wisdom-score', 1)],
			background: [mod('bonus', 'constitution-score', 1)],
			feat: [mod('bonus', 'wisdom-score', 1), mod('set-base', 'intelligence-score', 11)],
			class: [mod('bonus', 'constitution-score', 2)],
			item: [
				mod('set', 'strength-score', 21, { componentId: 50 }),
				mod('set', 'intelligence-score', 19, { componentId: 51 }),
				mod('bonus', 'constitution-score', 2, { componentId: 52 }),
			],
		};
		const fm = importDdbCharacter(c).frontmatter;
		// Str set to 21 by the attuned belt; Dex overridden; Con 14 + 1 + 2 (not the unequipped stone);
		// Int set-base 11 (the headband isn't attuned); Wis 13 + 1 + 1; Cha 15 + 2 + 2.
		expect([fm.str, fm.dex, fm.con, fm.int, fm.wis, fm.cha]).toEqual([21, 18, 17, 11, 15, 19]);
	});

	it('skills: proficiency and expertise (expertise counts as proficient), in the sheet’s spelling', () => {
		const c = wizard();
		c.modifiers = {
			class: [mod('proficiency', 'sleight-of-hand'), mod('proficiency', 'stealth'), mod('expertise', 'stealth'), mod('expertise', 'thieves-tools'), mod('proficiency', 'dexterity-saving-throws')],
			background: [mod('proficiency', 'animal-handling'), mod('expertise', 'persuasion'), mod('proficiency', 'stealth')],
		};
		const fm = importDdbCharacter(c).frontmatter;
		expect(fm.skills).toEqual(['Animal Handling', 'Persuasion', 'Sleight of Hand', 'Stealth']);
		expect(fm.expertise).toEqual(['Persuasion', 'Stealth']);
		const s = readSheet5e({ ...fm, class: 'Rogue', level: 1 }, '2024');
		expect(s.skills.find(k => k.name === 'Stealth')).toMatchObject({ proficient: true, expertise: true, bonus: 2 + 4 });
	});

	it('hit points: D&D Beyond’s override wins; bonuses add; damage and temp HP carry over', () => {
		const c = wizard();
		c.bonusHitPoints = 4;
		c.modifiers = { feat: [mod('bonus', 'hit-points-per-level', 2), mod('bonus', 'hit-points', null, { dice: { diceString: '1d4' } })] };
		// 14 + Con +1 (13) × 3 + Tough 2 × 3 + 4.
		expect(importDdbCharacter(c).frontmatter).toMatchObject({ hp_max: 27, hp: 22 });
		c.overrideHitPoints = 40;
		c.removedHitPoints = 50;
		expect(importDdbCharacter(c).frontmatter).toMatchObject({ hp_max: 40, hp: 0 });
	});

	it('spells: every class’s list and the race’s, feats’ and background’s, once each; not items’', () => {
		const c = wizard();
		c.classSpells = [
			{ spells: [spell('Cure Wounds'), spell('Bless')] },
			{ spells: [spell('Fire Bolt'), spell('cure wounds')] },
		];
		c.spells = { race: [spell('Thaumaturgy')], feat: [spell('Guidance')], background: [spell('Fire Bolt')], class: null, item: [spell('Fireball')] };
		expect(importDdbCharacter(c).frontmatter.spells).toEqual(['Cure Wounds', 'Bless', 'Fire Bolt', 'Thaumaturgy', 'Guidance']);
	});

	it('inventory: names, quantities and what’s equipped; custom items; duplicates merged', () => {
		const c = wizard();
		c.inventory = [item(1, 'Dagger', { equipped: true }), item(2, 'Dagger', { qty: 2 }), item(3, 'Dagger'), item(4, 'Arrows', { qty: 20 }), { quantity: 1 }];
		c.customItems = [{ name: 'Locket of Aunt Meg', quantity: 1, description: 'not copied' }];
		expect(importDdbCharacter(c).frontmatter.inventory).toEqual([
			{ name: 'Dagger', equipped: true }, { name: 'Dagger', qty: 3 }, { name: 'Arrows', qty: 20 }, { name: 'Locket of Aunt Meg' },
		]);
	});

	it('currency: every coin as gold', () => {
		const c = wizard();
		c.currencies = { pp: 2, gp: 15, ep: 3, sp: 7, cp: 9 };
		expect(importDdbCharacter(c).frontmatter.gold).toBe(37.29);
		c.currencies = { gp: '5', cp: -3 };
		expect(importDdbCharacter(c).frontmatter.gold).toBe(5);
	});

	it('feats: by name, once each, and the sheet shows them with the compendium\'s text', () => {
		const c = wizard();
		c.feats = [{ definition: { name: 'Alert', description: '<p>book text</p>' } }, { definition: { name: 'Tough' } }, { definition: { name: 'alert' } }];
		const r = importDdbCharacter(c);
		expect(r.frontmatter.feats).toEqual(['Alert', 'Tough']);
		expect(r.frontmatter.features).toBeUndefined();
		const s = readSheet5e(r.frontmatter, r.edition, r.name);
		const alert = s.features.find(f => f.name === 'Alert' && f.source === 'Feat');
		expect(alert?.desc).toBeTruthy();
		expect(alert?.desc).not.toContain('book text');
	});

	it('never copies book text', () => {
		const c = wizard();
		const BOOK = 'SECRET BOOK TEXT';
		(c.classes as Obj[])[0].definition = { name: 'Wizard', description: BOOK, classFeatures: [{ name: 'Arcane Recovery', description: BOOK }] };
		(c.race as Obj).racialTraits = [{ definition: { name: 'Darkvision', description: BOOK } }];
		c.classSpells = [{ spells: [{ definition: { name: 'Shield', description: BOOK } }] }];
		c.inventory = [{ quantity: 1, equipped: false, definition: { id: 1, name: 'Rope', description: BOOK } }];
		c.notes = { backstory: BOOK };
		c.traits = { personalityTraits: BOOK };
		expect(JSON.stringify(importDdbCharacter(c))).not.toContain(BOOK);
	});

	it('carries spent hit dice, spell slots and inspiration', () => {
		const c = wizard();
		c.classes = [cls('Wizard', 3, { starting: true, hitDiceUsed: 2 })];
		c.spellSlots = [{ level: 1, used: 2, available: 4 }, { level: 2, used: 0, available: 2 }, { level: 3, used: 1, available: 0 }];
		c.inspiration = true;
		expect(importDdbCharacter(c).frontmatter).toMatchObject({ hit_dice_used: 2, slots_used: [2, 0, 1], inspiration: true });
	});

	it('custom backgrounds and "(Legacy)" names', () => {
		const c = wizard();
		c.background = { hasCustomBackground: true, definition: null, customBackground: { name: 'Lighthouse Keeper' } };
		c.race = { fullName: 'Half-Orc (Legacy)', isLegacy: true };
		const fm = importDdbCharacter(c).frontmatter;
		expect(fm).toMatchObject({ background: 'Lighthouse Keeper', race: 'Half-Orc' });
	});

	it('missing sections give defaults, not errors', () => {
		const r = importDdbCharacter({ name: 'Nobody', stats: [] , race: null });
		expect(r.frontmatter).toEqual({
			nimble: 'character', system: '5e', edition: '2024', cssclasses: ['nimble-sheet-note'],
			level: 1, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
			skills: [], hp: 1, hp_max: 1, spells: [], inventory: [], gold: 0,
		});
		expect(r.notes.length).toBe(3);
		expect(r.notes.join(' ')).toMatch(/No class found/);
		expect(importDdbCharacter({ classes: [{}], race: 'x' }).name).toBe('Imported character');
	});

	it('odd values don’t throw', () => {
		const odd: Obj = {
			name: 42, classes: [null, 'Wizard', { level: 'x', definition: { name: 'Bard' } }, { level: 99, definition: { name: 'Bard' } }],
			race: { fullName: ['?'] }, stats: [{ id: 'one', value: 'two' }, null, { id: 1, value: 50 }],
			bonusStats: 'none', overrideStats: { 1: 3 }, modifiers: { race: 'x', class: [null, 1, { type: 5 }] },
			baseHitPoints: 'many', removedHitPoints: -4, temporaryHitPoints: NaN,
			classSpells: [{ spells: [{ definition: null }, { name: 'Light' }] }], spells: [], inventory: { a: 1 },
			currencies: null, feats: [{}, 'Alert'], spellSlots: [{ level: 12, used: 3 }],
		};
		const r = importDdbCharacter(odd);
		expect(r.name).toBe('42');
		expect(r.frontmatter).toMatchObject({ class: 'Bard', level: 20, str: 30, spells: ['Light'], gold: 0 });
	});

	it('throws a clear error for anything that isn’t a character', () => {
		expect(() => importDdbCharacter('')).toThrow(/nothing to import/);
		expect(() => importDdbCharacter('not json {')).toThrow(/isn’t JSON/);
		expect(() => importDdbCharacter('[1, 2]')).toThrow(/isn’t a D&D Beyond character/);
		expect(() => importDdbCharacter(null)).toThrow(/isn’t a D&D Beyond character/);
		expect(() => importDdbCharacter(42)).toThrow(/isn’t a D&D Beyond character/);
		expect(() => importDdbCharacter({ name: 'Goblin', hp: 7 })).toThrow(/isn’t a D&D Beyond character/);
		expect(() => importDdbCharacter('<!DOCTYPE html><html>')).toThrow(/isn’t JSON/);
		// A private character: the service says no.
		expect(() => importDdbCharacter({ id: 0, success: false, message: 'An unexpected error has occurred', data: { serverMessage: 'Unauthorized Access Attempt.' } })).toThrow(/Public/);
	});
});
