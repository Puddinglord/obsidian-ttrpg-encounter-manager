// Rolls with advantage, disadvantage and situational modifiers, the Nimble way.
// Pure: no Obsidian imports.
//
// Core Rules p.9: for each instance of advantage roll 1 extra die of the same
// type and remove the lowest; for disadvantage remove the highest. Ties are
// removed left to right, and 1 advantage cancels 1 disadvantage before rolling.
// On an attack the first die left is the Primary Die: a 1 misses, its max crits
// and explodes (p.14). Extra dice (Judgment Dice and the like) and flat
// bonuses are added on a hit.

// The roll itself is core's (dice with an edge); Nimble keeps action costs and pools.
export { edgeLabel, keepAfterEdge, rollEdge } from '../../core/dice-edge';
export type { EdgeRollInput, EdgeRollResult, ExtraDice } from '../../core/dice-edge';

/** "2 Actions" → 2, "1 Action" → 1, "Reaction" → 1; anything else (a minute, passive) → 0. */
export function actionCost(actions: string | undefined): number {
	if (!actions) return 0;
	const m = actions.match(/(\d+)\s*actions?/i);
	if (m) return Number(m[1]);
	if (/\breaction\b/i.test(actions)) return 1;
	if (/\baction\b/i.test(actions)) return 1;
	return 0;
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
