import { describe, expect, it } from 'vitest';
import { addItem, changeHp, cycleSkill, Frontmatter, levelUp, longRest, newCharacterFm, pbForLevel, readSheet5e, setItem, shortRest, useSlot } from '../src/systems/dnd5e/character';

const wizard = (): Frontmatter => ({ class: 'Wizard', subclass: 'Evoker', level: 5, species: 'Elf', background: 'Sage', str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10, skills: ['Arcana', 'History'], hp: 27, hp_max: 32, spells: ['Fireball', 'Shield', 'Not A Spell'] });

describe('a 5e character sheet, read from its note', () => {
	it('works out modifiers, proficiency, class saves, skills and passive Perception', () => {
		const s = readSheet5e(wizard(), '2024');
		expect(pbForLevel(1)).toBe(2);
		expect(pbForLevel(5)).toBe(3);
		expect(pbForLevel(17)).toBe(6);
		expect(s.pb).toBe(3);
		expect(s.mods).toEqual({ str: -1, dex: 2, con: 2, int: 3, wis: 1, cha: 0 });
		expect(s.saves.int).toEqual({ proficient: true, bonus: 6 });
		expect(s.saves.str).toEqual({ proficient: false, bonus: -1 });
		expect(s.skills.find(k => k.name === 'Arcana')).toMatchObject({ proficient: true, bonus: 6 });
		expect(s.skills.find(k => k.name === 'Stealth')).toMatchObject({ proficient: false, bonus: 2 });
		expect(s.passivePerception).toBe(11);
		expect(s.hitDie).toBe(6);
	});
	it('casts with the class ability: DC, attack and slots from the class table', () => {
		const s = readSheet5e({ ...wizard(), slots_used: [2, 0, 1] }, '2024');
		expect(s.spellcasting).toEqual({ ability: 'int', dc: 14, attack: 6 });
		expect(s.slots).toEqual([{ level: 1, max: 4, used: 2 }, { level: 2, max: 3, used: 0 }, { level: 3, max: 2, used: 1 }]);
		expect(s.spells.map(x => [x.name, !!x.spell])).toEqual([['Fireball', true], ['Shield', true], ['Not A Spell', false]]);
	});
	it('lists class and subclass features up to its level, and the species’ traits', () => {
		const s = readSheet5e(wizard(), '2024');
		expect(s.features.some(f => f.source === 'Wizard' && f.level === 1)).toBe(true);
		expect(s.features.every(f => (f.level ?? 0) <= 5)).toBe(true);
		expect(s.features.some(f => f.source === 'Elf')).toBe(true);
	});
	it('AC: armor and Dex (capped for medium), a shield, Unarmored Defense, or set by hand', () => {
		const base: Frontmatter = { class: 'Fighter', level: 1, str: 16, dex: 16, con: 14, wis: 14 };
		expect(readSheet5e(base, '2024').ac).toBe(13);
		expect(readSheet5e({ ...base, inventory: [{ name: 'Leather Armor', equipped: true }] }, '2024').ac).toBe(14);
		const half = readSheet5e({ ...base, inventory: [{ name: 'Half Plate Armor', equipped: true }, { name: 'Shield', equipped: true }] }, '2024');
		expect([half.ac, half.acFrom]).toEqual([19, 'Half Plate Armor + Dex + Shield']);
		expect(readSheet5e({ ...base, inventory: [{ name: 'Chain Mail', equipped: true }] }, '2024').ac).toBe(16);
		expect(readSheet5e({ ...base, class: 'Barbarian' }, '2024').ac).toBe(15);
		expect(readSheet5e({ ...base, class: 'Monk' }, '2024').ac).toBe(15);
		expect(readSheet5e({ ...base, ac: 21 }, '2024')).toMatchObject({ ac: 21, acFrom: 'set by hand' });
	});
	it('turns weapons in hand into attacks: Str, Dex for ranged, the better for finesse', () => {
		const s = readSheet5e({ class: 'Rogue', level: 1, str: 10, dex: 16, inventory: [{ name: 'Dagger', equipped: true }, { name: 'Shortbow', equipped: true }, { name: 'Longsword' }] }, '2024');
		expect(s.attacks.map(a => [a.name, a.toHit, a.damage, a.damageType])).toEqual([['Dagger', 5, '1d4+3', 'piercing'], ['Shortbow', 5, '1d6+3', 'piercing']]);
	});
	it('reads 2014 notes too (race:, 2014 class tables)', () => {
		const s = readSheet5e({ class: 'Cleric', level: 1, race: 'Hill Dwarf', wis: 16 }, '2014');
		expect(s.species).toBe('Hill Dwarf');
		expect(s.spellcasting?.ability).toBe('wis');
		expect(s.slots[0].max).toBe(2);
		expect(s.features.some(f => /Dwarven Toughness/.test(f.name))).toBe(true);
	});
});

describe('changes to a 5e character note', () => {
	it('damage takes temp HP first; at 0 it is a failed death save; healing ends them', () => {
		const fm: Frontmatter = { ...wizard(), temp_hp: 5 };
		changeHp(fm, readSheet5e(fm, '2024'), { kind: 'damage', amount: 8 });
		expect([fm.temp_hp, fm.hp]).toEqual([0, 24]);
		changeHp(fm, readSheet5e(fm, '2024'), { kind: 'damage', amount: 40 });
		expect(fm.hp).toBe(0);
		changeHp(fm, readSheet5e(fm, '2024'), { kind: 'damage', amount: 3 });
		expect(fm.death_saves).toEqual([0, 1]);
		changeHp(fm, readSheet5e(fm, '2024'), { kind: 'heal', amount: 4 });
		expect([fm.hp, fm.death_saves]).toEqual([4, undefined]);
	});
	it('spends and restores slots, and cycles a skill through proficiency and expertise', () => {
		const fm = wizard();
		useSlot(fm, readSheet5e(fm, '2024'), 3, 1);
		expect(fm.slots_used).toEqual([0, 0, 1]);
		useSlot(fm, readSheet5e(fm, '2024'), 3, -1);
		expect(fm.slots_used).toBeUndefined();
		cycleSkill(fm, 'Stealth');
		expect(fm.skills).toContain('Stealth');
		cycleSkill(fm, 'Stealth');
		expect(fm.expertise).toEqual(['Stealth']);
		cycleSkill(fm, 'Stealth');
		expect(fm.skills).not.toContain('Stealth');
		expect(fm.expertise).toBeUndefined();
	});
	it('long rests: everything back; hit dice all back in 2024, half in 2014', () => {
		const fm24: Frontmatter = { ...wizard(), hit_dice_used: 4, slots_used: [3], temp_hp: 2 };
		longRest(fm24, readSheet5e(fm24, '2024'));
		expect([fm24.hp, fm24.hit_dice_used, fm24.slots_used, fm24.temp_hp]).toEqual([32, undefined, undefined, undefined]);
		const fm14: Frontmatter = { ...wizard(), hit_dice_used: 4 };
		longRest(fm14, readSheet5e(fm14, '2014'));
		expect(fm14.hit_dice_used).toBe(2);
	});
	it('short rests spend hit dice; levelling up adds the average plus Con', () => {
		const fm = wizard();
		shortRest(fm, readSheet5e(fm, '2024'), 2, 9);
		expect([fm.hit_dice_used, fm.hp]).toEqual([2, 32]);
		levelUp(fm, readSheet5e(fm, '2024'));
		expect([fm.level, fm.hp_max]).toEqual([6, 38]);
	});
	it('adds and stacks inventory, and equips', () => {
		const fm: Frontmatter = {};
		addItem(fm, 'Dagger');
		addItem(fm, 'Dagger');
		addItem(fm, 'Leather Armor', { equipped: true });
		expect(fm.inventory).toEqual([{ name: 'Dagger', qty: 2 }, { name: 'Leather Armor', equipped: true }]);
		setItem(fm, 0, { equipped: true });
		setItem(fm, 1, { qty: 0 });
		expect(fm.inventory).toEqual([{ name: 'Dagger', qty: 2, equipped: true }]);
	});
	it('makes a new character: hit die max + Con at level 1, the average after', () => {
		const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
		const fm = newCharacterFm({ name: 'Bo', className: 'Fighter', level: 3, species: 'Human', background: 'Soldier', scores, mine: true, edition: '2024' });
		expect([fm.hp_max, fm.species, fm.mine, fm.edition]).toEqual([10 + 1 + 2 * (6 + 1), 'Human', true, '2024']);
		expect(newCharacterFm({ name: 'Bo', className: 'Fighter', level: 1, species: 'Human', background: 'Acolyte', scores, mine: false, edition: '2014' }).race).toBe('Human');
	});
});
