// Dice expressions like "2d6+3". Pure functions; pass your own RNG in tests.

export type Rng = () => number;

export interface DiceExpression {
	count: number;
	sides: number;
	modifier: number;
}

export interface DiceResult {
	expression: string;
	total: number;
	rolls: number[];
	modifier: number;
	detail: string;
	outcome?: 'miss' | 'crit';
}

export function parseDice(expr: string): DiceExpression | null {
	const s = expr.replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
	const m = s.match(/^(\d*)d(\d+)((?:[+-]\d+)*)$/);
	if (!m) return null;
	const count = m[1] ? parseInt(m[1], 10) : 1;
	const sides = parseInt(m[2], 10);
	if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
	let modifier = 0;
	for (const part of m[3].match(/[+-]\d+/g) || []) modifier += parseInt(part, 10);
	return { count, sides, modifier };
}

export function formatDice(d: DiceExpression): string {
	const mod = d.modifier > 0 ? `+${d.modifier}` : d.modifier < 0 ? `${d.modifier}` : '';
	return `${d.count}d${d.sides}${mod}`;
}

export function rollDie(sides: number, rng: Rng = Math.random): number {
	return Math.floor(rng() * sides) + 1;
}

function describe(rolls: number[], modifier: number): string {
	const mod = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : '';
	return `[${rolls.join(', ')}]${mod}`;
}

/** Plain roll: sum of the dice plus modifier. */
export function rollPlain(d: DiceExpression, rng: Rng = Math.random): DiceResult {
	const rolls = Array.from({ length: d.count }, () => rollDie(d.sides, rng));
	const total = rolls.reduce((a, b) => a + b, 0) + d.modifier;
	return { expression: formatDice(d), total, rolls, modifier: d.modifier, detail: describe(rolls, d.modifier) };
}

const MAX_EXPLOSIONS = 20;

/**
 * Nimble attack roll. The first die is the primary die:
 *  - a 1 on it is a miss (total 0),
 *  - its max is a crit: roll one more die and add it, again on every max (explodes).
 * Otherwise it's the plain sum. The modifier only applies on a hit.
 */
export function rollNimbleAttack(d: DiceExpression, rng: Rng = Math.random): DiceResult {
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
