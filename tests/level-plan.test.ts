import { describe, expect, it } from 'vitest';
import { Compendium } from '../src/systems/nimble/compendium';
import { chooseCount, groupFor, levelPlan, statIncrease } from '../src/systems/nimble/level-plan';
import BUNDLED from '../src/systems/nimble/data/compendium.json';

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

// A class whose features say nothing the wording rules know: everything it does is in its data.
describe('a class\'s data before its words (spell tiers, unlocks, swaps, grants, the boon, companions)', () => {
	const quiet = (name: string) => ({ name, text: 'You grow stronger.' });
	const lanternkeeper = {
		name: 'Lanternkeeper', keyStats: ['WIL'], hitDie: 8, startingHp: 12, saves: { adv: 'WIL', dis: 'STR' },
		casting: { manaFormula: 'WIL*2+LVL', schools: ['Fire'] },
		levels: [
			{ level: 1, features: [{ ...quiet('First Flame'), spellTier: 1 }] },
			{ level: 2, features: [{ ...quiet('Wick Lore'), unlock: ['Lesser Wicks'], choose: { from: ['Wicks'] } }] },
			{ level: 3, features: [{ name: 'Subclass', text: 'Choose a lantern.' }, { ...quiet('Brighter'), spellTier: 2 }] },
			{ level: 4, features: [{ ...quiet('Wick Lore (2)'), unlock: ['Greater Wicks'], choose: { from: ['Wicks'] } }] },
			{ level: 5, features: [{ ...quiet('Every Wick'), knows: { lists: ['Lesser Wicks'], options: ['Blue Wick'], utility: ['Fire'] } }] },
			{ level: 6, features: [{ ...quiet('Pick a Tactic'), choose: { from: ['Tactics'] } }] },
			{ level: 19, features: [{ ...quiet('The Last Light'), boon: 'epic' }] },
		],
		optionGroups: [
			{ name: 'Wicks', options: [] },
			{ name: 'Lesser Wicks', options: [{ name: 'Red Wick', text: 'x' }, { name: 'Green Wick', text: 'x' }] },
			{ name: 'Greater Wicks', options: [{ name: 'Blue Wick', text: 'x' }, { name: 'White Wick', text: 'x' }] },
			{ name: 'Tactics', options: [{ name: 'Shutter', text: 'x' }] },
		],
		subclasses: [
			{ name: 'Hooded Lantern', lose: ['Wicks'], instead: [{ from: 'Tactics', to: 'Hoods' }], optionGroups: [{ name: 'Hoods', options: [{ name: 'Iron Hood', text: 'x' }] }], levels: [{ level: 3, features: [quiet('Shade')] }] },
			{ name: 'Moth Lantern', companions: ['Moth Swarm', 'Ember Moth'], optionGroups: [{ name: 'Moth Swarm', intro: 'A cloud of moths.', options: [] }, { name: 'Ember Moth', intro: 'One big moth.', options: [] }], levels: [{ level: 3, features: [quiet('Fluttering')] }] },
		],
	};
	const c = new Compendium({ ...BUNDLED, classes: [...(BUNDLED as { classes: unknown[] }).classes, lanternkeeper] } as never);
	const at = (level: number, subclass = '', chosen?: string) => levelPlan(c, { className: 'Lanternkeeper', subclass, chosen, level, hitDie: 8, average: 5 });

	it('spell tiers come from `spellTier`, not a feature named "Tier 2 Spells"', async () => {
		const { readCharacter, spellTierOf } = await import('../src/systems/nimble/character-def');
		expect(spellTierOf({ name: 'Brighter', text: 'You grow stronger.', spellTier: 2 })).toBe(2);
		expect(spellTierOf({ name: 'Tier 4 Spells', text: '' })).toBe(4);
		expect(spellTierOf({ name: 'Brighter', text: 'You grow stronger.' })).toBeUndefined();
		expect(readCharacter({ class: 'Lanternkeeper', level: 2 }, c).maxTier).toBe(1);
		expect(readCharacter({ class: 'Lanternkeeper', level: 3 }, c).maxTier).toBe(2);
	});
	it('`unlock` opens a list\'s next tier: picks from the list then offer both', () => {
		expect(at(2).picks.map(p => p.group.options.map(o => o.name))).toEqual([['Red Wick', 'Green Wick']]);
		expect(at(4).picks.map(p => p.group.options.map(o => o.name))).toEqual([['Red Wick', 'Green Wick', 'Blue Wick', 'White Wick']]);
	});
	it('`knows` gives every option of a list, options by name, and a school\'s Utility Spells', () => {
		const five = at(5);
		expect(five.grants).toEqual(['Red Wick', 'Green Wick', 'Blue Wick']);
		expect(five.spellGrants).toEqual([{ feature: 'Every Wick', schools: ['Fire'] }]);
		expect(five.picks).toEqual([]);
	});
	it('`boon` offers the boons of that type', () => {
		expect(at(19).boons.length).toBeGreaterThan(0);
		expect(at(19).boons.every(b => b.kind === 'epic')).toBe(true);
	});
	it('a subclass\'s `lose` and `instead`: its lists swap in, the lost list asks for nothing', () => {
		expect(at(6, 'Hooded Lantern').picks.map(p => p.group.name)).toEqual(['Hoods']);
		expect(at(2, 'Hooded Lantern').picks).toEqual([]);
		// Without the subclass, the class's own lists.
		expect(at(6).picks.map(p => p.group.name)).toEqual(['Tactics']);
	});
	it('a subclass\'s `companions`: one is chosen with it', () => {
		const three = at(3, '', 'Moth Lantern');
		expect(three.subclasses.map(s => s.name)).toEqual(['Hooded Lantern', 'Moth Lantern']);
		expect(three.picks).toEqual([{ feature: 'Moth Lantern', group: { name: 'Companion', options: [{ name: 'Moth Swarm', text: 'A cloud of moths.', requirement: undefined }, { name: 'Ember Moth', text: 'One big moth.', requirement: undefined }] }, count: 1 }]);
	});
	it('the books still read from their words', () => {
		expect(plan('Mage', 19).boons.length).toBeGreaterThan(0);
		expect(plan('Psion', 5).picks[0]?.group.options.length).toBeGreaterThan(plan('Psion', 2).picks[0]?.group.options.length ?? 0);
		expect(plan('Shepherd', 11).spellGrants).toEqual([{ feature: 'Master of Twilight (3)', schools: ['Necrotic', 'Radiant'] }]);
	});
});
