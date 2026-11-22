// Exploding attack rolls, a dice mode a game turns on (Nimble's attacks: the
// contract's `attackRolls`): the primary die misses on a 1 and explodes on its
// max. Pure: no Obsidian imports.

import { DiceExpression, DiceResult, formatDice, rollDie, Rng } from './dice';

const MAX_EXPLOSIONS = 20;

/**
 * An exploding attack roll. The first die is the primary die:
 *  - a 1 on it is a miss (total 0),
 *  - its max is a crit: roll one more die and add it, again on every max (explodes).
 * Otherwise it's the plain sum. The modifier only applies on a hit.
 */
export function rollExplodingAttack(d: DiceExpression, rng: Rng = Math.random): DiceResult {
	const rolls = Array.from({ length: d.count }, () => rollDie(d.sides, rng));
	const expression = formatDice(d);
	const primary = rolls[0];

	if (primary === 1) {
		return { expression, total: 0, rolls, modifier: d.modifier, detail: `[${rolls.join(', ')}] miss on a 1`, outcome: 'miss' };
	}

	const extra: number[] = [];
	if (primary === d.sides) {
		let r: number;
		do {
			r = rollDie(d.sides, rng);
			extra.push(r);
		} while (r === d.sides && extra.length < MAX_EXPLOSIONS);
	}

	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const total = sum(rolls) + sum(extra) + d.modifier;
	const mod = d.modifier > 0 ? ` + ${d.modifier}` : d.modifier < 0 ? ` − ${Math.abs(d.modifier)}` : '';
	const critPart = extra.length ? ` + crit [${extra.join(', ')}]` : '';
	return {
		expression,
		total,
		rolls: [...rolls, ...extra],
		modifier: d.modifier,
		detail: `[${rolls.join(', ')}]${critPart}${mod}`,
		outcome: extra.length ? 'crit' : undefined,
	};
}

/** Whether a roll is an attack (a game may roll those its own way) or anything else. */
export type DiceKind = 'attack' | 'effect';
