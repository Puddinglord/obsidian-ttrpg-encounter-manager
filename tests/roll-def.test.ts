import { describe, expect, it } from 'vitest';
import { actionCost, edgeLabel, keepAfterEdge, rollEdge } from '../src/roll-def';

/** An rng that returns these die faces in order (for a die of `sides`). */
const faces = (sides: number, ...vals: number[]) => { let i = 0; return () => (vals[i++ % vals.length] - 0.5) / sides; };

describe('advantage and disadvantage', () => {
	it('drops the lowest for advantage and the highest for disadvantage, ties left to right', () => {
		expect(keepAfterEdge([3, 6], 1)).toEqual({ kept: [6], dropped: [3] });
		expect(keepAfterEdge([5, 2, 6, 4], -2)).toEqual({ kept: [2, 4], dropped: [5, 6] });
		expect(keepAfterEdge([4, 4, 2], 1)).toEqual({ kept: [4, 4], dropped: [2] });
		expect(keepAfterEdge([4, 4], -1)).toEqual({ kept: [4], dropped: [4] });
		expect(keepAfterEdge([1, 2], 0)).toEqual({ kept: [1, 2], dropped: [] });
	});

	it('book example 1: short sword 1d6 with advantage, the kept die is the primary', () => {
		const r = rollEdge({ dice: { count: 1, sides: 6, modifier: 2 }, edge: 1, attack: true }, faces(6, 1, 5));
		expect(r.kept).toEqual([5]);
		expect(r.dropped).toEqual([1]);
		expect(r.outcome).toBeUndefined();
		expect(r.total).toBe(7);
	});

	it('book example 2: greataxe 2d6 with disadvantage 2 can miss', () => {
		const r = rollEdge({ dice: { count: 2, sides: 6, modifier: 0 }, edge: -2, attack: true }, faces(6, 1, 6, 5, 3));
		expect(r.kept).toEqual([1, 3]);
		expect(r.outcome).toBe('miss');
		expect(r.total).toBe(0);
	});

	it('crits explode and extra dice and bonuses add on a hit', () => {
		const r = rollEdge({ dice: { count: 1, sides: 6, modifier: 1 }, edge: 0, attack: true, bonus: 2, extras: [{ label: 'Judgment Dice', count: 2, sides: 6 }] }, faces(6, 6, 3, 4, 2));
		expect(r.outcome).toBe('crit');
		expect(r.explosions).toEqual([3]);
		expect(r.extras[0].rolls).toEqual([4, 2]);
		expect(r.total).toBe(6 + 3 + 4 + 2 + 1 + 2);
		expect(r.detail).toContain('Judgment Dice [4, 2]');
	});

	it('saves and checks never miss or crit', () => {
		const r = rollEdge({ dice: { count: 1, sides: 20, modifier: 3 }, edge: -1, attack: false }, faces(20, 1, 20));
		expect(r.kept).toEqual([1]);
		expect(r.outcome).toBeUndefined();
		expect(r.total).toBe(4);
	});

	it('reads action costs and labels the edge', () => {
		expect(actionCost('2 Actions')).toBe(2);
		expect(actionCost('1 Action')).toBe(1);
		expect(actionCost('Reaction')).toBe(1);
		expect(actionCost('1 Minute')).toBe(0);
		expect(edgeLabel(2)).toBe('Advantage 2');
		expect(edgeLabel(-1)).toBe('Disadvantage');
		expect(edgeLabel(0)).toBe('Normal');
	});
});
