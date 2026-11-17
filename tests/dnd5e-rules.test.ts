import { describe, expect, it } from 'vitest';
import { abilityMod, crLabel, crValue, encounterMultiplier, formatMod, initiativeOf, pbForCr, rateEncounter5e, saveOf, xpForCr } from '../src/systems/dnd5e/rules';
import type { Dnd5eMonster } from '../src/systems/dnd5e/types';

const mon = (cr: string, extra: Partial<Dnd5eMonster> = {}): Dnd5eMonster => ({ name: 'M', ac: 12, hp: 10, cr, abilities: [10, 14, 10, 10, 10, 10], ...extra });

describe('5e numbers', () => {
	it('ability modifiers and how they print', () => {
		expect([1, 8, 9, 10, 11, 12, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 5, 10]);
		expect(formatMod(2)).toBe('+2');
		expect(formatMod(0)).toBe('+0');
		expect(formatMod(-1)).toBe('−1');
	});
	it('challenge ratings: fractions, XP and proficiency', () => {
		expect(crValue('1/4')).toBe(0.25);
		expect(crValue('1/8')).toBe(0.125);
		expect(crValue('17')).toBe(17);
		expect(crValue('')).toBeUndefined();
		expect(crValue('lots')).toBeUndefined();
		expect(crLabel(0.5)).toBe('1/2');
		expect([xpForCr('0'), xpForCr('1/4'), xpForCr('1'), xpForCr('5'), xpForCr('17'), xpForCr('30')]).toEqual([10, 50, 200, 1800, 18000, 155000]);
		expect([0, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29, 30].map(pbForCr)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
	});
	it('saves and initiative fall back to the modifier', () => {
		const m = mon('1', { saves: { dex: 6 } });
		expect(saveOf(m, 'dex')).toBe(6);
		expect(saveOf(m, 'str')).toBe(0);
		expect(initiativeOf(m)).toBe(2);
		expect(initiativeOf({ ...m, initiative: 7 })).toBe(7);
	});
});

describe('2014 encounter difficulty', () => {
	it('multiplies by the number of monsters, shifted for small and big parties', () => {
		expect([1, 2, 3, 6, 7, 10, 11, 14, 15].map(n => encounterMultiplier(n, 4))).toEqual([1, 1.5, 2, 2, 2.5, 2.5, 3, 3, 4]);
		expect(encounterMultiplier(1, 2)).toBe(1.5);
		expect(encounterMultiplier(1, 6)).toBe(0.5);
		expect(encounterMultiplier(15, 2)).toBe(5);
	});
	it('rates against the party\'s thresholds (DMG example: four 3rd-level heroes)', () => {
		// Thresholds for 4 × level 3: Easy 300, Medium 600, Hard 900, Deadly 1600.
		const r = rateEncounter5e([{ monster: mon('1/4'), count: 5 }], [3, 3, 3, 3], '2014');
		expect(r.xp).toBe(250);
		expect(r.multiplier).toBe(2);
		expect(r.adjusted).toBe(500);
		expect(r.thresholds.map(t => t.xp)).toEqual([300, 600, 900, 1600]);
		expect(r.label).toBe('Easy');
		expect(rateEncounter5e([{ monster: mon('5'), count: 1 }], [3, 3, 3, 3], '2014').label).toBe('Deadly');
		expect(rateEncounter5e([{ monster: mon('1/8'), count: 1 }], [3, 3, 3, 3], '2014').label).toBe('Trivial');
	});
});

describe('2024 encounter difficulty', () => {
	it('adds XP with no multiplier, against the per-character budget', () => {
		// Five level-5 heroes: Low 2,500, Moderate 3,750, High 5,500.
		const r = rateEncounter5e([{ monster: mon('3'), count: 4 }], [5, 5, 5, 5, 5], '2024');
		expect(r.xp).toBe(2800);
		expect(r.adjusted).toBe(2800);
		expect(r.multiplier).toBe(1);
		expect(r.thresholds.map(t => t.xp)).toEqual([2500, 3750, 5500]);
		expect(r.label).toBe('Low');
		expect(rateEncounter5e([{ monster: mon('1'), count: 1 }], [5, 5, 5, 5, 5], '2024').label).toBe('Trivial');
		const big = rateEncounter5e([{ monster: mon('10'), count: 1 }], [5, 5, 5, 5, 5], '2024');
		expect(big.label).toBe('High');
		expect(big.pct).toBeGreaterThan(1);
	});
	it('uses the monster\'s own XP when it has one, and level 20\'s budget at the top', () => {
		const r = rateEncounter5e([{ monster: mon('1', { xp: 999 }), count: 2 }], [20], '2024');
		expect(r.xp).toBe(1998);
		expect(r.thresholds.map(t => t.xp)).toEqual([6400, 13200, 22000]);
	});
});
