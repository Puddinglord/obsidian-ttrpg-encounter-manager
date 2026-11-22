import { describe, expect, it } from 'vitest';
import { allHits, compendium5e, equipmentLine, findHit, itemLine, kindFromWord, spellLine } from '../src/systems/dnd5e/compendium';

describe('the 5e compendium', () => {
	it('ships both SRDs: spells, items, equipment, classes with subclasses and levels, origins, feats', () => {
		const c14 = compendium5e('2014');
		const c24 = compendium5e('2024');
		expect(c14.spells.length).toBeGreaterThan(300);
		expect(c24.spells.length).toBeGreaterThan(300);
		expect(c24.classes.map(c => c.name)).toEqual(['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']);
		const wizard = c24.classes.find(c => c.name === 'Wizard')!;
		expect(wizard.hitDie).toBe(6);
		expect(wizard.levels).toHaveLength(20);
		expect(wizard.levels[4].slots?.slice(0, 3)).toEqual([4, 3, 2]);
		expect(wizard.subclasses.length).toBeGreaterThan(0);
		expect(c24.backgrounds.map(b => b.name)).toEqual(expect.arrayContaining(['Acolyte', 'Criminal', 'Sage', 'Soldier']));
	});
	it('describes each entry in a line, the way each edition prints it', () => {
		const fireball24 = findHit('2024', 'Fireball', 'spell');
		const fireball14 = findHit('2014', 'Fireball', 'spell');
		expect(fireball24?.detail).toBe('Level 3 Evocation');
		expect(fireball14?.detail).toBe('3rd-level evocation');
		expect(spellLine({ name: 'x', level: 0, school: 'Evocation', castingTime: '', range: '', components: '', duration: '', desc: '', classes: [] }, '2024')).toBe('Evocation cantrip');
		expect(itemLine({ name: 'Ring', rarity: 'Rare', type: 'Rings', desc: '', attunement: true })).toBe('Ring, rare (requires attunement)');
		expect(equipmentLine({ name: 'Longsword', category: 'Weapon', weaponCategory: 'Martial', weaponRange: 'Melee', damage: '1d8 slashing', cost: '15 gp' })).toBe('Martial Melee · 1d8 slashing · 15 gp');
		expect(equipmentLine({ name: 'Leather', category: 'Armor', armorCategory: 'Light', ac: { base: 11, dex: true }, cost: '10 gp' })).toBe('Light armor · AC 11 + Dex · 10 gp');
	});
	it('finds by name and kind, in the other edition when this one hasn’t got it', () => {
		expect(findHit('2024', 'bag of holding', 'item')?.kind).toBe('item');
		expect(findHit('2024', 'Prone')?.kind).toBe('condition');
		expect(findHit('2024', 'Hill Dwarf', 'species')).toBeUndefined();
		expect(kindFromWord('race')).toBe('species');
		expect(kindFromWord('Spells')).toBe('spell');
		expect(kindFromWord('monster')).toBeUndefined();
		const names = allHits('2024').map(h => `${h.kind}:${h.name}`);
		expect(new Set(names).size).toBe(names.length);
	});
});
