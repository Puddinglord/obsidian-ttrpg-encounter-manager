import { describe, expect, it } from 'vitest';
import { Compendium } from '../src/compendium';
import { chooseCount, groupFor, levelPlan, statIncrease } from '../src/level-plan';
import BUNDLED from '../src/data/compendium.json';

const comp = new Compendium(BUNDLED);
const plan = (className: string, level: number, subclass = '') => levelPlan(comp, { className, subclass, level, hitDie: 12, average: 8 });

describe('level plan', () => {
	it('reads how many to choose', () => {
		expect(chooseCount('Choose 2 Spellshaper abilities.')).toBe(2);
		expect(chooseCount('Choose a 2nd Savage Arsenal ability.')).toBe(1);
		expect(chooseCount('Learn 1 Sacred Decree.')).toBe(1);
		expect(chooseCount('Choose 1 ability from the Savage Arsenal.')).toBe(1);
	});

	it('reads stat increases', () => {
		expect(statIncrease({ name: 'Key Stat Increase', text: '+1 STR or DEX.' })).toEqual({ feature: 'Key Stat Increase', options: ['STR', 'DEX'], count: 1 });
		expect(statIncrease({ name: 'BOUNDLESS RAGE', text: '+1 to any 2 of your stats. Anytime you roll…' })?.count).toBe(2);
		expect(statIncrease({ name: 'Rage', text: 'Roll a Fury Die.' })).toBeUndefined();
	});

	it('finds the option group a feature picks from', () => {
		const groups = comp.optionGroups('Shadowmancer');
		expect(groupFor({ name: 'A Gift from the Master', text: 'Choose 1 Greater Shadow Invocation.' }, groups)?.name).toBe('Greater Invocations');
		expect(groupFor({ name: 'Underhanded Ability', text: 'Choose an Underhanded Ability.' }, comp.optionGroups('The Cheat'))?.name).toBe('Underhanded Abilities');
	});

	it('Berserker 3: choose a subclass; 4: a Savage Arsenal pick and a key stat', () => {
		const three = plan('Berserker', 3);
		expect(three.subclasses.map(s => s.name)).toContain('Path of the Red Mist');
		const four = plan('Berserker', 4, 'Path of the Red Mist');
		expect(four.subclasses).toEqual([]);
		expect(four.picks.map(p => [p.group.name, p.count])).toEqual([['Savage Arsenal', 1]]);
		expect(four.stats).toEqual([{ feature: 'Key Stat Increase', options: ['STR', 'DEX'], count: 1 }]);
	});

	it('Mage 4 picks two Spellshaper abilities; level 19 offers Epic Boons', () => {
		expect(plan('Mage', 4).picks.map(p => [p.group.name, p.count])).toEqual([['Spellshaper Abilities', 2]]);
		expect(plan('Berserker', 19, 'Path of the Red Mist').boons.length).toBeGreaterThan(5);
	});

	it('every class at every level plans without throwing, and never picks from nowhere', () => {
		for (const cls of comp.classes) {
			for (let lv = 2; lv <= 20; lv++) {
				const p = plan(cls.name, lv, cls.subclasses?.[0]?.name ?? '');
				for (const pick of p.picks) expect(pick.group.options.length).toBeGreaterThan(0);
			}
		}
	});
});

describe('features that pick from two lists', () => {
	it('AND gives one pick from each; OR one pick from either', () => {
		const two = plan('Manawright', 2).picks.map(p => p.group.name);
		expect(two).toEqual(expect.arrayContaining(['Major Inventions', 'Gadgets']));
		const four = plan('Manawright', 4, 'x').picks.find(p => p.feature === 'Eureka!');
		expect(four?.group.name).toBe('Major Inventions or Gadgets');
	});
});
