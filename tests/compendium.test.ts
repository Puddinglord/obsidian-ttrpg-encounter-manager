import { describe, expect, it } from 'vitest';
import { Compendium, nameKey } from '../src/compendium';
import BUNDLED from '../src/data/compendium.json';
import { FIXTURE } from './compendium-fixture';

const comp = new Compendium(FIXTURE);

describe('Compendium', () => {
	it('loads nothing without complaint', () => {
		for (const bad of [null, undefined, 42, 'x', {}, { classes: 'nope', items: [null, 3, { name: '' }] }]) {
			const c = new Compendium(bad);
			expect(c.isEmpty).toBe(true);
			expect(c.search('a')).toEqual([]);
			expect(c.featuresFor('Berserker', null, 5)).toEqual([]);
			expect(c.item('Battleaxe')).toBeUndefined();
		}
	});

	it('loads the bundled file, which follows the schema', () => {
		const c = new Compendium(BUNDLED);
		expect(c.classes.length).toBeGreaterThan(0);
		for (const cls of c.classes) {
			expect(typeof cls.name).toBe('string');
			expect(Array.isArray(cls.levels ?? [])).toBe(true);
		}
		expect(c.rules.skills?.length ?? 10).toBe(10);
	});

	it('looks names up regardless of case, spacing and curly quotes', () => {
		expect(nameKey('Short Sword')).toBe(nameKey('shortsword'));
		expect(comp.classByName('berserker')?.hitDie).toBe(12);
		expect(comp.ancestry('DWARF')?.size).toBe('Medium');
		expect(comp.background('taste for the finer things')?.page).toBe(29);
		expect(comp.spell('flame dart')?.tier).toBe(0);
		expect(comp.boon('Boon of Fortitude')?.kind).toBe('epic');
		expect(comp.item('Shortsword')?.name).toBe('Short Sword');
		expect(comp.item('Adventurer\'s Garb')?.armor).toBe('2+DEX');
		expect(comp.classByName('Nope')).toBeUndefined();
	});

	it('finds items the way notes write them', () => {
		expect(comp.item('Rations (meat)')?.name).toBe('Rations');
		expect(comp.item('Javelin')?.name).toBe('Javelins');
		expect(comp.item('Healing Potions')?.name).toBe('Healing Potion');
		expect(comp.item('Rope (50 ft.)')?.name).toBe('Rope (50 ft.)');
		expect(comp.item('')).toBeUndefined();
	});

	it('lists features up to a level, class first, then subclass, in order', () => {
		const at1 = comp.featuresFor('Berserker', 'Path of the Red Mist', 1).map(f => f.name);
		expect(at1).toEqual(['Rage', 'That all you got?!']);
		const at3 = comp.featuresFor('Berserker', 'Path of the Red Mist', 3);
		expect(at3.map(f => f.name)).toEqual(['Rage', 'That all you got?!', 'Intensifying Fury', 'Subclass', 'Bloodlust', 'Blood Frenzy']);
		expect(at3.at(-1)).toMatchObject({ from: 'subclass', subclass: 'Path of the Red Mist', level: 3, source: 'Berserker 3.0', page: 9 });
		expect(comp.featuresFor('Berserker', null, 3).some(f => f.from === 'subclass')).toBe(false);
		expect(comp.featuresAt('Berserker', 'Path of the Red Mist', 7).map(f => f.name)).toEqual(['Unstoppable Brutality']);
	});

	it('finds subclasses, options and their classes', () => {
		expect(comp.subclass('Berserker', 'path of the red mist')?.page).toBe(9);
		expect(comp.subclass(null, 'Path of the Mountainheart')?.name).toBe('Path of the Mountainheart');
		expect(comp.classOfSubclass('Path of the Red Mist')?.name).toBe('Berserker');
		expect(comp.optionGroups('Berserker').map(g => g.name)).toEqual(['Savage Arsenal']);
		const o = comp.option('death blow');
		expect(o?.option.cost).toBe('Passive');
		expect(o?.group.name).toBe('Savage Arsenal');
		expect(o?.cls.name).toBe('Berserker');
	});

	it('searches: prefix, then word start, then anywhere; filters by kind', () => {
		const names = comp.search('fl').map(h => h.name);
		expect(names[0]).toBe('Flame Dart');
		expect(comp.search('dart', ['spell'])[0].name).toBe('Flame Dart');
		expect(comp.search('dart', ['item'])).toEqual([]);
		const red = comp.search('red mist');
		expect(red[0]).toMatchObject({ kind: 'subclass', className: 'Berserker' });
		const blow = comp.search('death blow', ['feature'])[0];
		expect(blow).toMatchObject({ group: 'Savage Arsenal', cost: 'Passive', className: 'Berserker' });
		expect(comp.search('', ['spell']).map(h => h.name)).toEqual(['Enchant Weapon', 'Flame Dart', 'Ice Lance', 'Ignite', 'Warm Hands', 'Zap']);
		// Placeholders like "Subclass" aren't features you can pick.
		expect(comp.search('subclass', ['feature'])).toEqual([]);
		expect(comp.search('Stone\'s', ['feature'])[0]?.name).toBe('Stone’s Resilience');
	});

	it('hides draft books when asked', () => {
		expect(comp.classByName('Hexbinder')?.draft).toBe(true);
		expect(comp.search('hex').some(h => h.draft)).toBe(true);
		const noDrafts = new Compendium(FIXTURE, { drafts: false });
		expect(noDrafts.classByName('Hexbinder')).toBeUndefined();
		expect(noDrafts.item('Hex Bag')).toBeUndefined();
		expect(noDrafts.search('hex')).toEqual([]);
	});
});

describe('combined names', () => {
	it('finds "Club/Mace" as "Mace" and as "Club"', async () => {
		const { Compendium } = await import('../src/compendium');
		const data = (await import('../src/data/compendium.json')).default;
		const comp = new Compendium(data);
		expect(comp.item('Mace')?.name).toBe('Club/Mace');
		expect(comp.item('club')?.name).toBe('Club/Mace');
	});
});
