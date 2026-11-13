// Rolls with advantage, disadvantage and situational modifiers, the Nimble way.
// Pure: no Obsidian imports.
//
// Core Rules p.9: for each instance of advantage roll 1 extra die of the same
// type and remove the lowest; for disadvantage remove the highest. Ties are
// removed left to right, and 1 advantage cancels 1 disadvantage before rolling.
// On an attack the first die left is the Primary Die: a 1 misses, its max crits
// and explodes (p.14). Extra dice (Judgment Dice and the like) and flat
// bonuses are added on a hit.

import { DiceExpression, formatDice, rollDie, Rng } from './dice';

export interface ExtraDice {
	/** "Judgment Dice" */
	label: string;
	count: number;
	sides: number;
	/** Faces rolled already (dice set aside as they were gained); a 0 or a missing face is rolled now. */
	faces?: number[];
	/** "radiant": shown in the roll's detail. */
	damageType?: string;
	/** Still held after the roll (Fury Dice), so not "lost" on a miss. */
	keep?: boolean;
}

export interface EdgeRollInput {
	dice: DiceExpression;
	/** Net advantage: +2 is advantage 2, −1 is disadvantage 1. */
	edge: number;
	/** Nimble attack rules (miss on 1, crit on max) for the primary die. */
	attack: boolean;
	/** Flat situational bonus (added to the expression's own modifier). */
	bonus?: number;
	extras?: ExtraDice[];
}

export interface EdgeRollResult {
	expression: string;
	total: number;
	/** The dice that count, in the order rolled (primary first). */
	kept: number[];
	/** Dice removed by advantage/disadvantage. */
	dropped: number[];
	/** Crit explosions. */
	explosions: number[];
	/** `held`: faces rolled earlier (set aside), so nothing new to throw. */
	extras: { label: string; sides: number; rolls: number[]; damageType?: string; keep?: boolean; held?: boolean }[];
	modifier: number;
	outcome?: 'miss' | 'crit';
	detail: string;
}

/** Which dice survive: remove `n` lowest (advantage) or highest (disadvantage), ties left to right. */
export function keepAfterEdge(rolls: number[], edge: number): { kept: number[]; dropped: number[] } {
	const n = Math.min(Math.abs(edge), Math.max(0, rolls.length - 1));
	if (!n) return { kept: [...rolls], dropped: [] };
	const order = rolls.map((v, i) => ({ v, i }));
	// Lowest first for advantage, highest first for disadvantage; equal values: leftmost first.
	order.sort((a, b) => (edge > 0 ? a.v - b.v : b.v - a.v) || a.i - b.i);
	const gone = new Set(order.slice(0, n).map(x => x.i));
	return { kept: rolls.filter((_, i) => !gone.has(i)), dropped: rolls.filter((_, i) => gone.has(i)) };
}

const MAX_EXPLOSIONS = 20;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function rollEdge(input: EdgeRollInput, rng: Rng = Math.random): EdgeRollResult {
	const d = input.dice;
	const edge = Math.max(-6, Math.min(6, Math.round(input.edge)));
	const rolled = Array.from({ length: d.count + Math.abs(edge) }, () => rollDie(d.sides, rng));
	const { kept, dropped } = keepAfterEdge(rolled, edge);
	const modifier = d.modifier + (input.bonus ?? 0);
	const expression = `${formatDice(d)}${edge > 0 ? ` adv ${edge}` : edge < 0 ? ` dis ${-edge}` : ''}`;
	const dropText = dropped.length ? ` (dropped ${dropped.join(', ')})` : '';
	const modText = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : '';
	const missed = input.attack && kept[0] === 1;
	const explosions: number[] = [];
	if (!missed && input.attack && kept[0] === d.sides) {
		let r: number;
		do { r = rollDie(d.sides, rng); explosions.push(r); } while (r === d.sides && explosions.length < MAX_EXPLOSIONS);
	}
	// Extra dice are rolled (and spent) even on a miss; they only add on a hit.
	const extras = (input.extras ?? []).filter(x => x.count > 0).map(x => ({
		label: x.label, sides: x.sides, damageType: x.damageType, keep: x.keep, held: !!x.faces?.some(f => f > 0),
		rolls: Array.from({ length: x.count }, (_, i) => x.faces?.[i] || rollDie(x.sides, rng)),
	}));
	const extraTotal = sum(extras.flatMap(x => x.rolls));
	const extraText = extras.map(x => ` + ${x.label} [${x.rolls.join(', ')}]${x.damageType ? ` ${x.damageType}` : ''}`).join('');
	if (missed) {
		const lost = extras.filter(x => !x.keep).map(x => `${x.label} lost`).join(', ');
		return { expression, total: 0, kept, dropped, explosions: [], extras, modifier, outcome: 'miss', detail: `[${kept.join(', ')}]${dropText} miss on a 1${lost ? ` · ${lost}` : ''}` };
	}
	const total = sum(kept) + sum(explosions) + extraTotal + modifier;
	const critText = explosions.length ? ` + crit [${explosions.join(', ')}]` : '';
	return {
		expression, total, kept, dropped, explosions, extras, modifier,
		outcome: explosions.length ? 'crit' : undefined,
		detail: `[${kept.join(', ')}]${dropText}${critText}${extraText}${modText}`,
	};
}

/** "2 Actions" → 2, "1 Action" → 1, "Reaction" → 1; anything else (a minute, passive) → 0. */
export function actionCost(actions: string | undefined): number {
	if (!actions) return 0;
	const m = actions.match(/(\d+)\s*actions?/i);
	if (m) return Number(m[1]);
	if (/\breaction\b/i.test(actions)) return 1;
	if (/\baction\b/i.test(actions)) return 1;
	return 0;
}

/** "Advantage 2", "Disadvantage 1", "Normal". */
export function edgeLabel(edge: number): string {
	return edge > 0 ? `Advantage${edge > 1 ? ` ${edge}` : ''}` : edge < 0 ? `Disadvantage${edge < -1 ? ` ${-edge}` : ''}` : 'Normal';
}

/** Dice a hero can put into this roll (Judgment Dice…), spent when it's rolled unless `keep`. */
export interface Spendable {
	key: string;
	label: string;
	sides: number;
	/** How many they have. */
	available: number;
	/** Switched on when the dialog opens. */
	on: boolean;
	/** All of them go in (Judgment Dice), any number (a stepper), or one (Combat Dice). */
	amount: 'all' | 'any' | 'one';
	/** Faces already rolled (set aside as they were gained); 0 = not rolled yet. */
	faces?: number[];
	damageType?: string;
	/** Not spent by the roll (Fury Dice add to every attack while Raging). */
	keep?: boolean;
	/** Why it's here ("while Raging"). */
	note?: string;
}

/** How many dice of a pool go in when it's switched on. */
export function spendCount(sp: Spendable): number {
	return sp.amount === 'one' ? Math.min(1, sp.available) : sp.available;
}

/** "[4, 6] = 10" for rolled faces, "2d6" when they aren't rolled yet. */
export function poolText(sp: Spendable, n: number): string {
	const f = (sp.faces ?? []).slice(0, n);
	if (f.length === n && n > 0 && f.every(x => x > 0)) return n === 1 ? String(f[0]) : `[${f.join(', ')}] = ${f.reduce((a, b) => a + b, 0)}`;
	return `${n}d${sp.sides}`;
}
