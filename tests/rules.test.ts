import { describe, expect, it } from 'vitest';
import {
	balanceEncounter, budgetPhrase, describeChange, formatLevel, groupAttack, heroDamage, initiativeActions, lastStandEffect, levelValue, minionDie, minionKills, monsterDamage,
	monsterRole, monsterSaves, parseHpCommand, rateEncounter, scaledHp, tickConditions,
} from '../src/rules';
import { NimbleMonster } from '../src/types';

const mon = (over: Partial<NimbleMonster> = {}): NimbleMonster => ({ name: 'M', armor: 'none', hp: 20, movement: '6', ...over });

describe('levels', () => {
	it.each([['1/2', 0.5], ['1/3', 1 / 3], ['3', 3], ['3x', 3], [4, 4], ['', null], [undefined, null], ['min', null]])('%s → %s', (input, out) => {
		expect(levelValue(input as string)).toBe(out);
	});
	it('formats fractions back', () => {
		expect(formatLevel(0.5)).toBe('1/2');
		expect(formatLevel(1 / 3)).toBe('1/3');
		expect(formatLevel(0.125)).toBe('1/8');
		expect(formatLevel('3x')).toBe('3x');
	});
});

describe('monster facts', () => {
	it('reads role from the old solo flag', () => {
		expect(monsterRole(mon({ monsterType: 'solo' }))).toBe('legendary');
		expect(monsterRole(mon({ role: 'minion' }))).toBe('minion');
		expect(monsterRole(mon())).toBe('regular');
	});
	it('folds legacy save fields', () => {
		expect(monsterSaves(mon({ str: '+', will: '-' }))).toBe('STR+ WIL-');
		expect(monsterSaves(mon({ saves: 'INT+  WIL+' }))).toBe('INT+ WIL+');
	});
	it('scales per-hero HP', () => {
		expect(scaledHp(mon({ hpPerHero: 28 }), 4)).toBe(112);
		expect(scaledHp(mon({ hpPerHero: 28 }), 5)).toBe(140);
		expect(scaledHp(mon({ hp: 30 }), 5)).toBe(30);
	});
	it('finds a minion die from its attack', () => {
		expect(minionDie(mon({ attacks: [{ raw: '**Stab.** 1d8 (follows minion rules)' }] }))).toBe(8);
		expect(minionDie(mon({ minionDie: 4 }))).toBe(4);
		expect(minionDie(mon())).toBe(6);
	});
});

describe('parseHpCommand', () => {
	it.each([
		['7', { kind: 'damage', amount: 7, crit: false, type: undefined }],
		['-7', { kind: 'damage', amount: 7, crit: false, type: undefined }],
		['7!', { kind: 'damage', amount: 7, crit: true, type: undefined }],
		['!7', { kind: 'damage', amount: 7, crit: true, type: undefined }],
		['12v', { kind: 'damage', amount: 12, crit: false, type: 'vulnerable' }],
		['12 r!', { kind: 'damage', amount: 12, crit: true, type: 'resisted' }],
		['+5', { kind: 'heal', amount: 5 }],
		['=20', { kind: 'set', amount: 20 }],
		['t5', { kind: 'temp', amount: 5 }],
	])('%s', (input, out) => expect(parseHpCommand(input)).toEqual(out));
	it('rejects junk', () => {
		expect(parseHpCommand('')).toBeNull();
		expect(parseHpCommand('abc')).toBeNull();
		expect(parseHpCommand('v')).toBeNull();
	});
});

describe('monsterDamage (3.2: flat armor, crits ignore it)', () => {
	it('subtracts Medium and Heavy armor', () => {
		expect(monsterDamage('medium', 15, false, { autoArmor: true }).applied).toBe(5);
		expect(monsterDamage('heavy', 15, false, { autoArmor: true }).applied).toBe(0);
		expect(monsterDamage('heavy', 25, false, { autoArmor: true }).breakdown).toBe('25 − 20 (Heavy armor) = 5');
	});
	it('ignores armor on a crit', () => {
		const r = monsterDamage('heavy', 15, true, { autoArmor: true });
		expect(r.applied).toBe(15);
		expect(r.breakdown).toContain('crit ignores armor');
	});
	it('applies vulnerability and resistance as ±10', () => {
		expect(monsterDamage('none', 8, false, { autoArmor: true, mod: 'vulnerable' }).applied).toBe(18);
		expect(monsterDamage('none', 8, false, { autoArmor: true, mod: 'resisted' }).applied).toBe(0);
		expect(monsterDamage('medium', 30, false, { autoArmor: true, mod: 'resisted' }).applied).toBe(10);
	});
	it('can leave armor to the GM', () => {
		expect(monsterDamage('medium', 15, false, { autoArmor: false }).applied).toBe(15);
	});
});

describe('heroDamage (Wounds and Dying)', () => {
	it('drops to 0 with one Wound', () => {
		expect(heroDamage(5, 0, 6, 9, false)).toEqual({ hp: 0, wounds: 1, events: ['drops to 0 HP: Dying, 1 Wound'] });
	});
	it('adds 2 Wounds while Dying, 3 on a crit', () => {
		expect(heroDamage(0, 1, 6, 4, false).wounds).toBe(3);
		expect(heroDamage(0, 1, 6, 4, true).wounds).toBe(4);
	});
	it('dies at max Wounds', () => {
		const r = heroDamage(0, 5, 6, 3, false);
		expect(r.wounds).toBe(6);
		expect(r.events.at(-1)).toContain('dies');
	});
	it('takes ordinary damage', () => {
		expect(heroDamage(20, 0, 6, 7, false)).toEqual({ hp: 13, wounds: 0, events: [] });
	});
});

describe('minions', () => {
	it('drop one per hit, or more with overkill', () => {
		expect(minionKills(3, 6, true)).toBe(1);
		expect(minionKills(20, 10, true)).toBe(2);
		expect(minionKills(20, 4, true)).toBe(5);
		expect(minionKills(20, 4, false)).toBe(1);
		expect(minionKills(0, 6, true)).toBe(0);
	});
	it('roll group attacks with 1s missing', () => {
		const rolls = [0, 0.99, 0.5, 0.2]; // → 1, 6, 4, 2 on a d6
		let i = 0;
		const r = groupAttack(4, 6, () => rolls[i++]);
		expect(r.dice).toEqual([1, 6, 4, 2]);
		expect(r.total).toBe(12);
		expect(r.misses).toBe(1);
	});
});

describe('lastStandEffect', () => {
	it('reads regained HP per hero', () => {
		expect(lastStandEffect('Grimbeak regains 10 HP per hero and rolls d10s instead of d6s.', 4)).toEqual({ kind: 'regain', hp: 40 });
	});
	it('reads a final damage pool and armor', () => {
		expect(lastStandEffect('At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium Armor.', 4)).toEqual({ kind: 'pool', hp: 20, armor: 'medium' });
	});
	it('returns null when there is nothing to apply', () => {
		expect(lastStandEffect('All heroes have a max of 2 actions each turn.', 4)).toBeNull();
	});
});

describe('tickConditions', () => {
	it('counts durations down and expires them', () => {
		const r = tickConditions([{ name: 'Dazed', rounds: 1 }, { name: 'Prone' }, { name: 'Slowed', rounds: 2 }], 3);
		expect(r.expired).toEqual(['Dazed']);
		expect(r.kept).toEqual([{ name: 'Prone' }, { name: 'Slowed', rounds: 1, tickedRound: 3 }]);
	});
	it('ticks only once per round', () => {
		const once = tickConditions([{ name: 'Slowed', rounds: 2 }], 3).kept;
		expect(tickConditions(once, 3).kept).toEqual(once);
	});
});

describe('initiative', () => {
	it.each([[5, false, 1], [9, false, 1], [10, false, 2], [19, false, 2], [20, false, 3], [8, true, 3]])('%d (nat 20: %s) → %d actions', (total, nat, out) => {
		expect(initiativeActions(total as number, nat as boolean)).toBe(out);
	});
});

describe('rateEncounter (GM Guide budget)', () => {
	const party = [2, 2, 2, 2]; // budget 8
	it('rates regular monsters by level', () => {
		const r = rateEncounter([{ monster: mon({ level: 2 }), count: 4 }], party);
		expect(r.budget).toBe(8);
		expect(r.label).toBe('Hard');
	});
	it('counts minions at half the party level each', () => {
		const r = rateEncounter([{ monster: mon({ role: 'minion' }), count: 4 }], party);
		expect(r.value).toBe(4);
		expect(r.label).toBe('Easy');
	});
	it('counts a legendary monster against the whole party', () => {
		const r = rateEncounter([{ monster: mon({ role: 'legendary', level: 2 }), count: 1 }], party);
		expect(r.value).toBe(8);
		expect(r.warnings).toEqual([]);
	});
	it('warns about early armor and odd monster counts', () => {
		const r = rateEncounter([{ monster: mon({ name: 'Knight', level: 4, armor: 'medium' }), count: 1 }], [1, 1, 1, 1]);
		expect(r.warnings.join(' ')).toMatch(/Medium armor/);
		expect(r.warnings.join(' ')).toMatch(/1–3 per hero/);
		const swarm = rateEncounter([{ monster: mon({ level: 1 / 4 }), count: 13 }], [1, 1, 1, 1]);
		expect(swarm.warnings.join(' ')).toMatch(/more than 3 per hero/);
		// A few weak monsters is just an easy fight, not a warning.
		expect(rateEncounter([{ monster: mon({ level: 1 / 2 }), count: 3 }], [2, 2, 2, 2]).warnings).toEqual([]);
	});
	it.each([[0.2, 'Trivial'], [0.5, 'Easy'], [0.75, 'Medium'], [1, 'Hard'], [1.25, 'Deadly'], [1.6, 'Very Deadly']])('%s of budget → %s', (pct, label) => {
		const r = rateEncounter([{ monster: mon({ level: pct * 8 }), count: 1 }], party);
		expect(r.label).toBe(label);
	});
});

describe('balanceEncounter', () => {
	const krogg = mon({ name: 'Krogg', role: 'legendary', level: 2, hpPerHero: 28 });
	const wolf = mon({ name: 'Wolf', level: 0.5 });
	const minion = mon({ name: 'Goblin Minion', role: 'minion' });
	const goblin = mon({ name: 'Goblin', level: 0.5 });
	const party = [2, 2, 2, 2];

	it('brings a Very Deadly fight down to Hard with the smallest edit, keeping the boss', () => {
		const groups = [{ name: 'Krogg', monster: krogg, count: 1 }, { name: 'Wolf', monster: wolf, count: 1 }, { name: 'Goblin Minion', monster: minion, count: 3 }];
		const [best] = balanceEncounter(groups, party, 'Hard');
		expect(best.rating.label).toBe('Hard');
		expect(best.changes).toEqual([{ name: 'Goblin Minion', from: 3, to: 0 }]);
		expect(best.counts.find(c => c.name === 'Krogg')?.count).toBe(1);
	});

	it('scales up an easy fight, using an extra minion type when it helps', () => {
		const groups = [{ name: 'Goblin', monster: goblin, count: 4 }];
		const res = balanceEncounter(groups, party, 'Hard', [{ name: 'Goblin Minion', monster: minion, count: 0 }]);
		expect(res.length).toBeGreaterThan(0);
		for (const s of res) expect(s.rating.label).toBe('Hard');
		expect(res.some(s => s.changes.some(c => c.name === 'Goblin Minion'))).toBe(true);
	});

	it('returns nothing when already on target', () => {
		expect(balanceEncounter([{ name: 'Goblin', monster: goblin, count: 16 }], party, 'Hard')).toEqual([]);
	});

	it('describes changes in plain words', () => {
		expect(describeChange({ name: 'Goblin Minion', from: 3, to: 0 })).toBe('Remove all 3 Goblin Minions');
		expect(describeChange({ name: 'Wolf', from: 1, to: 0 })).toBe('Remove the Wolf');
		expect(describeChange({ name: 'Wolf', from: 1, to: 3 })).toBe('Add 2 Wolves');
		expect(describeChange({ name: 'Harpy', from: 0, to: 2 })).toBe('Add 2 Harpies');
		expect(describeChange({ name: 'Snakeman', from: 0, to: 2 })).toBe('Add 2 Snakemen');
		expect(describeChange({ name: 'Goblin', from: 0, to: 2 })).toBe('Add 2 Goblins');
	});
});

describe('budgetPhrase', () => {
	it.each([[6, 'a 6-level budget'], [8, 'an 8-level budget'], [11, 'an 11-level budget'], [18, 'an 18-level budget'], [12, 'a 12-level budget'], [80, 'an 80-level budget'], [1, 'a 1-level budget']])('%s → %s', (n, out) => {
		expect(budgetPhrase(n)).toBe(out);
	});
});
