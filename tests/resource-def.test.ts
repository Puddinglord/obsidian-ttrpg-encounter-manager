import { describe, expect, it } from 'vitest';
import { dieAt, heldFaces, resourceRule, ruleFromData, ruleOf, spendsOn, startsOn } from '../src/systems/nimble/resource-def';
import { rollEdge } from '../src/systems/nimble/roll-def';
import { safeRest, setResource, setRolled, readCharacter, Frontmatter } from '../src/systems/nimble/character-def';
import { Compendium } from '../src/systems/nimble/compendium';
import { poolText, spendCount } from '../src/systems/nimble/roll-def';

const comp = new Compendium({ classes: [], ancestries: [], backgrounds: [], spells: [], items: [], boons: [] } as never);

describe('class dice, the book way', () => {
	it('Judgment Dice: a count, rolled with the Reach attack or spell they go into, as radiant damage', () => {
		const r = resourceRule('Judgment Dice')!;
		expect(r.rolledWhen).toBe('spent');
		expect(r.amount).toBe('any');
		expect(r.reachOnly).toBe(true);
		expect(r.clearsOnRest).toBe(true);
		// Radiant Judgment: 2; Oath of Vengeance's Aura of Zeal (level 3) and Radiant Judgment (6) (level 14) add 1 each.
		expect(r.maxAt!(1, '')).toBe(2);
		expect(r.maxAt!(2, 'Oath of Vengeance')).toBe(2);
		expect(r.maxAt!(3, 'Oath of Vengeance')).toBe(3);
		expect(r.maxAt!(3, 'Oath of Refuge')).toBe(2);
		expect(r.maxAt!(14, '')).toBe(3);
		expect(r.maxAt!(14, 'Oath of Vengeance')).toBe(4);
		expect(r.damageType).toBe('radiant');
		expect(startsOn(r, [])).toBe(true);
		expect(spendsOn('Judgment Dice', 'attack')).toBe(true);
		expect(spendsOn('Judgment Dice', 'spell')).toBe(true);
		expect(spendsOn('Judgment Dice', 'save')).toBe(false);
		// Radiant Judgment (2)…(5): d8s at 3, d10s at 5, d12s at 8, d20s at 10.
		expect([1, 2, 3, 5, 7, 8, 10, 20].map(l => dieAt(r, l))).toEqual(['d6', 'd6', 'd8', 'd10', 'd10', 'd12', 'd20', 'd20']);
	});

	it('Fury Dice stay after the attack and are on while Raging', () => {
		const r = resourceRule('fury dice')!;
		expect(r.keep).toBe(true);
		expect(startsOn(r, ['Raging'])).toBe(true);
		expect(startsOn(r, ['Prone'])).toBe(false);
	});

	it('Combat Dice: one per attack, off until you pick a tactic', () => {
		const r = resourceRule('Combat Dice')!;
		expect(r.amount).toBe('one');
		expect(startsOn(r, [])).toBe(false);
	});

	it('held faces line up with the count; unrolled ones are 0', () => {
		expect(heldFaces(2, [4, 6, 1])).toEqual([4, 6]);
		expect(heldFaces(3, [5])).toEqual([5, 0, 0]);
		expect(heldFaces(0, [5])).toEqual([]);
	});
});

describe('held dice in a roll', () => {
	it('adds the faces set aside instead of rolling them again, with the damage type', () => {
		const r = rollEdge({ dice: { count: 1, sides: 8, modifier: 2 }, edge: 0, attack: true, extras: [{ label: 'Judgment Dice', count: 2, sides: 6, faces: [4, 6], damageType: 'radiant' }] }, () => 0.5);
		expect(r.extras[0].rolls).toEqual([4, 6]);
		expect(r.total).toBe(5 + 2 + 10);
		expect(r.detail).toContain('Judgment Dice [4, 6] radiant');
	});

	it('the dialog shows faces as a sum, and how many go in', () => {
		const sp = { key: 'Fury Dice', label: 'Fury Dice', sides: 6, available: 2, on: true, amount: 'all' as const, faces: [4, 6] };
		expect(poolText(sp, 2)).toBe('[4, 6] = 10');
		expect(poolText({ ...sp, faces: [0, 0] }, 2)).toBe('2d6');
		expect(poolText({ ...sp, faces: undefined, amount: 'any' }, 3)).toBe('3d6');
		expect(spendCount(sp)).toBe(2);
		expect(spendCount({ ...sp, amount: 'one' })).toBe(1);
	});
});

describe('held dice in the note', () => {
	it('setRolled keeps faces and count together; spending trims them; a Safe Rest clears them', () => {
		const fm: Frontmatter = { name: 'Brakka' };
		setRolled(fm, 'Fury Dice', [3, 5]);
		expect(fm.resources).toEqual({ 'Fury Dice': { current: 2, rolled: [3, 5] } });
		let s = readCharacter(fm, comp, 'Brakka');
		expect(s.resources[0]).toMatchObject({ name: 'Fury Dice', current: 2, rolled: [3, 5] });
		setResource(fm, 'Fury Dice', 1);
		expect(fm.resources).toEqual({ 'Fury Dice': { current: 1, rolled: [3] } });
		setRolled(fm, 'Fury Dice', [3, 5]);
		s = readCharacter(fm, comp, 'Brakka');
		safeRest(fm, { ...s, resources: s.resources.map(r => ({ ...r, max: 4 })) });
		expect(fm.resources).toEqual({ 'Fury Dice': { current: 0 } });
	});

	it('Judgment Dice are a plain count and gone after a Safe Rest', () => {
		const fm: Frontmatter = { name: 'Odo', resources: { 'Judgment Dice': 2 } };
		const s = readCharacter(fm, comp, 'Odo');
		expect(s.resources[0]).toMatchObject({ name: 'Judgment Dice', current: 2 });
		safeRest(fm, s);
		expect(fm.resources).toEqual({ 'Judgment Dice': 0 });
	});
});

describe('a miss', () => {
	it('says spent dice are lost, but not dice that are kept', () => {
		const r = rollEdge({ dice: { count: 1, sides: 6, modifier: 0 }, edge: 0, attack: true, extras: [
			{ label: 'Judgment Dice', count: 2, sides: 6, faces: [4, 6] },
			{ label: 'Fury Dice', count: 1, sides: 4, faces: [3], keep: true },
		] }, () => 0);
		expect(r.outcome).toBe('miss');
		expect(r.detail).toBe('[1] miss on a 1 · Judgment Dice lost');
	});
});

describe('dice a class describes itself (homebrew, content packs)', () => {
	it('become a rule like the books\' own: when rolled, what they go into, how many, kept, switched on, the die by level', () => {
		const r = ruleFromData({ name: 'Ember Dice', dice: { rolled: 'gained', addTo: ['attack', 'Spell', 'nonsense'], use: 'all', keep: true, onWhile: 'Blazing', damageType: 'fire', gain: 2, gainLabel: 'Stoke', clearsOnRest: true, byLevel: [{ level: 1, die: 'd4' }, { level: 5, die: 'D8' }], rules: ['Stoke the Flame'] } })!;
		expect(r).toMatchObject({ rolledWhen: 'gained', on: ['attack', 'spell'], amount: 'all', keep: true, damageType: 'fire', gain: { count: 2, label: 'Stoke' }, clearsOnRest: true, dieByLevel: { 1: 'd4', 5: 'd8' }, rules: ['Stoke the Flame'] });
		expect(r.match.test('ember dice')).toBe(true);
		expect(startsOn(r, ['Blazing'])).toBe(true);
		expect(startsOn(r, ['Dazed'])).toBe(false);
		expect([1, 4, 5, 9].map(l => dieAt(r, l))).toEqual(['d4', 'd4', 'd8', 'd8']);
		// The plainest: spent one at a time on attacks, off until switched on.
		expect(ruleFromData({ name: 'Sparks', dice: { rolled: 'spent' } })).toMatchObject({ rolledWhen: 'spent', on: ['attack'], amount: 'one', autoOn: false });
		expect(ruleFromData({ name: 'Sparks' })).toBeUndefined();
	});
	it('a resource\'s own rule comes first; otherwise the books\' by name', () => {
		const own = ruleFromData({ name: 'Fury Dice', dice: { rolled: 'spent' } })!;
		expect(ruleOf({ name: 'Fury Dice', rule: own })).toBe(own);
		expect(ruleOf({ name: 'Fury Dice' })?.rolledWhen).toBe('gained');
		expect(ruleOf({ name: 'Sparks' })).toBeUndefined();
	});
});
