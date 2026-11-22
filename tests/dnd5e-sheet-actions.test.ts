// The 5e sheet's Actions tab and limited-use features (sheet-actions.ts), and the NPC card's mini sheet (npc.ts).
import { describe, expect, it } from 'vitest';
import { Frontmatter, longRest, readSheet5e } from '../src/systems/dnd5e/character';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import { castGroup, formatDice, resources5e, restoreUses, setUsesLeft, sheetActions5e, slotFor, spellEffect } from '../src/systems/dnd5e/sheet-actions';
import { npcAction5e, npcActions5e, npcMonster5e, npcSenses5e, npcSheet5e, npcSkills5e, setHpNow, NPC_FIELDS_5E } from '../src/systems/dnd5e/npc';
import { fieldDefaults, fieldsKey } from '../src/core/note-kinds';
import type { Dnd5eMonster } from '../src/systems/dnd5e/types';

const ilse = (more: Frontmatter = {}): Frontmatter => ({
	class: 'Wizard', subclass: 'Evoker', level: 5, species: 'Elf', background: 'Sage', str: 8, dex: 14, con: 15, int: 18, wis: 12, cha: 10,
	spells: ['Fire Bolt', 'Light', 'Magic Missile', 'Shield', 'Misty Step', 'Counterspell', 'Hellish Rebuke'],
	inventory: [{ name: 'Dagger', equipped: true }, { name: 'Quarterstaff', equipped: true }], ...more,
});

describe('the 5e sheet’s actions', () => {
	it('prints dice as the book does', () => {
		expect(formatDice('1d4+2')).toBe('1d4 + 2');
		expect(formatDice('1d6-1')).toBe('1d6 − 1');
		expect(formatDice('2d10')).toBe('2d10');
	});
	it('reads how a spell is cast, in both editions’ words', () => {
		expect(castGroup('Action')).toBe('action');
		expect(castGroup('1 action')).toBe('action');
		expect(castGroup('Bonus Action')).toBe('bonus');
		expect(castGroup('1 reaction, which you take when you are hit')).toBe('reaction');
		expect(castGroup('1 minute')).toBeUndefined();
	});
	it('finds a spell’s attack or save and its damage; cantrips grow at 5, 11 and 17', () => {
		for (const ed of ['2024', '2014'] as const) {
			const spell = (n: string) => compendium5e(ed).spells.find(s => s.name === n)!;
			expect(spellEffect(spell('Fire Bolt'), 1)).toMatchObject({ attack: true, damage: '1d10', damageType: 'fire' });
			expect(spellEffect(spell('Fire Bolt'), 5).damage).toBe('2d10');
			expect(spellEffect(spell('Fire Bolt'), 17).damage).toBe('4d10');
			expect(spellEffect(spell('Sacred Flame'), 11)).toMatchObject({ attack: false, save: 'dex', damage: '3d8', damageType: 'radiant' });
			expect(spellEffect(spell('Fireball'), 5)).toMatchObject({ save: 'dex', damage: '8d6', damageType: 'fire' });
		}
	});
	it('groups weapons and damaging cantrips as actions, quicker spells as bonus actions and reactions', () => {
		const rows = sheetActions5e(readSheet5e(ilse(), '2024'));
		const by = (g: string) => rows.filter(r => r.group === g).map(r => r.name);
		expect(by('action')).toEqual(['Dagger', 'Quarterstaff', 'Fire Bolt']);
		expect(by('bonus')).toEqual(['Misty Step']);
		expect(by('reaction')).toEqual(['Shield', 'Counterspell', 'Hellish Rebuke']);
		expect(by('limited')).toEqual(['Arcane Recovery']);
		expect(rows.find(r => r.name === 'Dagger')).toMatchObject({ hit: 5, damage: '1d4+2', damageType: 'piercing', note: 'Finesse, light, thrown · 20/60 ft' });
		expect(rows.find(r => r.name === 'Quarterstaff')).toMatchObject({ hit: 2, damage: '1d6-1', note: 'Versatile · 5 ft' });
		expect(rows.find(r => r.name === 'Fire Bolt')).toMatchObject({ hit: 7, damage: '2d10', damageType: 'fire', note: 'Cantrip · 120 ft' });
		expect(rows.find(r => r.name === 'Hellish Rebuke')).toMatchObject({ save: { dc: 15, ability: 'dex' }, damage: '2d10', slotLevel: 1 });
		expect(rows.find(r => r.name === 'Counterspell')?.note).toBe('Level 3 · 60 ft · Con save');
		// Light does nothing to a target, so it stays on the Spells tab.
		expect(rows.some(r => r.name === 'Light' || r.name === 'Magic Missile')).toBe(false);
	});
	it('casts from the lowest slot left at or above the spell’s level', () => {
		const s = readSheet5e(ilse({ slots_used: [4, 1] }), '2024');
		expect(slotFor(s, 1)).toBe(2);
		expect(slotFor(s, 3)).toBe(3);
		expect(slotFor(readSheet5e(ilse({ slots_used: [4, 3, 2] }), '2024'), 1)).toBeUndefined();
	});
});

describe('limited-use features', () => {
	it('counts the class table’s uses and the once-per-rest features, in each edition', () => {
		const fighter = readSheet5e({ class: 'Fighter', level: 5, str: 16 }, '2024');
		expect(resources5e(fighter).map(r => [r.name, r.max, r.per, !!r.shortOne])).toEqual([['Second Wind', 3, 'long', true], ['Action Surge', 1, 'short', false]]);
		const fighter14 = readSheet5e({ class: 'Fighter', level: 5, str: 16 }, '2014');
		expect(resources5e(fighter14).map(r => [r.name, r.max, r.per])).toEqual([['Action Surge', 1, 'short'], ['Second Wind', 1, 'short']]);
		const barbarian = readSheet5e({ class: 'Barbarian', level: 5 }, '2024');
		expect(resources5e(barbarian)[0]).toMatchObject({ name: 'Rage', max: 3, per: 'long', shortOne: true, used: 0 });
		const bard = readSheet5e({ class: 'Bard', level: 1, cha: 16 }, '2024');
		expect(resources5e(bard)).toEqual([{ name: 'Bardic Inspiration', max: 3, per: 'long', used: 0 }]);
	});
	it('spends them from pips, and rests bring them back', () => {
		const fm: Frontmatter = { class: 'Fighter', level: 5, str: 16 };
		const s = readSheet5e(fm, '2024');
		const [wind, surge] = resources5e(s);
		setUsesLeft(fm, wind, 1);
		setUsesLeft(fm, surge, 0);
		expect(fm.uses_spent).toEqual({ 'Second Wind': 2, 'Action Surge': 1 });
		expect(resources5e(readSheet5e(fm, '2024')).map(r => r.used)).toEqual([2, 1]);
		// A short rest: Action Surge all back, Second Wind one back.
		restoreUses(fm, readSheet5e(fm, '2024'), 'short');
		expect(fm.uses_spent).toEqual({ 'Second Wind': 1 });
		setUsesLeft(fm, wind, 3);
		expect(fm.uses_spent).toBeUndefined();
		setUsesLeft(fm, surge, 0);
		longRest(fm, readSheet5e(fm, '2024'));
		expect(fm.uses_spent).toBeUndefined();
	});
	it('knows the species’ size', () => {
		expect(readSheet5e(ilse(), '2024').size).toBe('Medium');
		expect(readSheet5e({ class: 'Wizard', species: 'Nobody' }, '2024').size).toBe('');
	});
});

const priest: Dnd5eMonster = {
	name: 'Priest', ac: 13, hp: 38, hpFormula: '7d8 + 7', cr: '2', abilities: [16, 10, 12, 13, 16, 13], skills: { Medicine: 7, Perception: 5 }, senses: 'Passive Perception 15',
	actions: [{ name: 'Mace', desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Bludgeoning damage plus 5 (2d4) Radiant damage.' }],
};

describe('a 5e NPC’s mini sheet', () => {
	it('takes a stat block and marks the numbers the note changes', () => {
		const s = npcSheet5e('Odile', { ac: 15, hp: '30', hp_now: 21 }, { name: 'Priest', monster: priest })!;
		expect(s.from).toBe('Priest');
		expect(s.own).toEqual([{ label: 'AC', block: 13 }, { label: 'HP', block: 38 }]);
		expect([s.monster.ac, s.monster.hp, s.hpNow]).toEqual([15, 30, 21]);
		expect(npcSheet5e('Odile', {}, { name: 'Priest', monster: priest })!.own).toEqual([]);
		expect(npcSheet5e('Odile', { hp_now: 99 }, { name: 'Priest', monster: priest })!.hpNow).toBe(38);
	});
	it('reads stats typed into the note, on their own or over a block', () => {
		const fm: Frontmatter = {
			ac: 13, hp: '19 (3d8 + 6)', cr: '1/2', str: 15, dex: 12, con: 14, int: 9, wis: 11, cha: 10, saves: ['con'], skills: { athletics: 4, perception: 2 },
			speed: '25 ft', senses: 'darkvision 60 ft', languages: 'Common, Dwarvish',
			actions: ['Bell hammer: Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Bludgeoning damage.'],
		};
		const m = npcMonster5e('Hask', fm)!;
		expect(m).toMatchObject({ ac: 13, hp: 19, hpFormula: '3d8 + 6', cr: '1/2', abilities: [15, 12, 14, 9, 11, 10], saves: { con: 4 }, skills: { Athletics: 4, Perception: 2 }, speed: '25 ft' });
		expect(m.actions?.[0].name).toBe('Bell hammer');
		expect(npcSenses5e(m)).toBe('Darkvision 60 ft · Passive Perception 12');
		expect(npcSenses5e(priest)).toBe('Passive Perception 15');
		expect(npcSkills5e(m)).toEqual([{ name: 'Athletics', ability: 'str', bonus: 4 }, { name: 'Perception', ability: 'wis', bonus: 2 }]);
		expect(npcMonster5e('Hask', { ...fm, saves: 'Con +5, Wis +2', skills: 'Stealth +6' })).toMatchObject({ saves: { con: 5, wis: 2 }, skills: { Stealth: 6 } });
		// Over a block: the note's Strength, the block's actions.
		expect(npcMonster5e('Odile', { str: 8 }, priest)).toMatchObject({ abilities: [8, 10, 12, 13, 16, 13], actions: priest.actions });
	});
	it('writes what HP is left, and nothing at full', () => {
		const fm: Frontmatter = { ac: 13, hp: '19' };
		const s = npcSheet5e('Hask', fm)!;
		setHpNow(fm, s, 9);
		expect(fm.hp_now).toBe(9);
		setHpNow(fm, s, 40);
		expect(fm.hp_now).toBeUndefined();
		setHpNow(fm, s, -3);
		expect(fm.hp_now).toBe(0);
	});
	it('reads an action’s numbers from its words, in both editions and in short', () => {
		expect(npcAction5e(priest.actions![0])).toMatchObject({ name: 'Mace', hit: 5, damage: '1d6+3', damageType: 'bludgeoning', note: 'Melee · 5 ft · plus 2d4 radiant' });
		expect(npcAction5e({ name: 'Dagger', desc: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d4 + 3) piercing damage.' }))
			.toMatchObject({ hit: 5, damage: '1d4+3', damageType: 'piercing', note: 'Melee or ranged · 5 or 20/60 ft' });
		expect(npcAction5e({ name: 'Peal (Recharge 5–6)', desc: 'Constitution Saving Throw: DC 12, each creature in a 10-foot Emanation. Failure: 7 (2d6) Thunder damage. Success: Half damage.' }))
			.toMatchObject({ name: 'Peal', dc: 12, save: 'con', damage: '2d6', damageType: 'thunder', note: 'Recharge 5–6 · Con save' });
		expect(npcAction5e({ name: 'Fire Breath (Recharge 5–6)', desc: 'The dragon exhales fire in a 15-foot cone. Each creature in that area must make a DC 13 Dexterity saving throw, taking 24 (7d6) fire damage on a failed save.' }))
			.toMatchObject({ name: 'Fire Breath', dc: 13, save: 'dex', damage: '7d6', damageType: 'fire' });
		expect(npcAction5e({ name: 'Bell hammer', desc: '+4, 1d8 + 2 bludgeoning' })).toMatchObject({ hit: 4, damage: '1d8+2', damageType: 'bludgeoning' });
		const multi = npcAction5e({ name: 'Multiattack', desc: 'The priest makes two attacks.' });
		expect([multi.hit, multi.dc, multi.damage, multi.note]).toEqual([undefined, undefined, undefined, '']);
		expect(npcActions5e({ ...priest, bonusActions: [{ name: 'Divine Aid (3/Day)', desc: 'The priest casts Bless.' }] }).map(a => [a.group, a.name, a.note])).toEqual([
			['Actions', 'Mace', 'Melee · 5 ft · plus 2d4 radiant'], ['Bonus Actions', 'Divine Aid', '3/Day'],
		]);
	});
	it('adds its typed keys to notes only when asked, and redraws when any of them changes', () => {
		const defaults = fieldDefaults(NPC_FIELDS_5E, 'gm');
		expect(Object.keys(defaults)).toEqual(['ac', 'hp', 'cr', 'statblock']);
		expect(fieldDefaults(NPC_FIELDS_5E, 'player')).toEqual({});
		expect(fieldsKey(NPC_FIELDS_5E, { skills: { athletics: 4 } })).not.toBe(fieldsKey(NPC_FIELDS_5E, { skills: { athletics: 5 } }));
		expect(fieldsKey(NPC_FIELDS_5E, { str: 10 })).not.toBe(fieldsKey(NPC_FIELDS_5E, { str: 12 }));
	});
});
