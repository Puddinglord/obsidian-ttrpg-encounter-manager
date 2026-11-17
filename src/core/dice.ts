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
