import { describe, expect, it } from 'vitest';
import { formatDice, parseDice, rollPlain } from '../src/dice';

/** RNG that returns the given die faces in order for the given die size. */
function faces(sides: number, ...values: number[]) {
	let i = 0;
	return () => (values[i++ % values.length] - 1) / sides + 1e-9;
}

describe('parseDice', () => {
	it('parses common forms', () => {
		expect(parseDice('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 });
		expect(parseDice('d20')).toEqual({ count: 1, sides: 20, modifier: 0 });
		expect(parseDice('1d8 - 1')).toEqual({ count: 1, sides: 8, modifier: -1 });
		expect(parseDice('3d4+1+1')).toEqual({ count: 3, sides: 4, modifier: 2 });
		expect(parseDice('2d6−2')).toEqual({ count: 2, sides: 6, modifier: -2 });
	});
	it('rejects nonsense', () => {
		expect(parseDice('2x6')).toBeNull();
		expect(parseDice('0d6')).toBeNull();
		expect(parseDice('1d1')).toBeNull();
		expect(parseDice('500d6')).toBeNull();
	});
	it('formats back', () => {
		expect(formatDice({ count: 2, sides: 6, modifier: -1 })).toBe('2d6-1');
	});
});

describe('rollPlain', () => {
	it('sums dice and modifier', () => {
		const r = rollPlain(parseDice('2d6+3')!, faces(6, 4, 5));
		expect(r.rolls).toEqual([4, 5]);
		expect(r.total).toBe(12);
		expect(r.detail).toBe('[4, 5] + 3');
		expect(r.outcome).toBeUndefined();
	});
	it('stays within range', () => {
		for (let i = 0; i < 500; i++) {
			const r = rollPlain(parseDice('1d6')!);
			expect(r.total).toBeGreaterThanOrEqual(1);
			expect(r.total).toBeLessThanOrEqual(6);
		}
	});
});

import { rollNimbleAttack } from '../src/dice';

describe('rollNimbleAttack', () => {
	it('misses when the primary die is a 1', () => {
		const r = rollNimbleAttack(parseDice('2d6+3')!, faces(6, 1, 6));
		expect(r.outcome).toBe('miss');
		expect(r.total).toBe(0);
		expect(r.detail).toBe('[1, 6] miss on a 1');
	});

	it('a 1 on a later die is not a miss', () => {
		const r = rollNimbleAttack(parseDice('2d6')!, faces(6, 4, 1));
		expect(r.outcome).toBeUndefined();
		expect(r.total).toBe(5);
	});

	it('crits on a max primary die and explodes', () => {
		// primary 6 -> crit, extra 6 -> explode again, extra 2 stops
		const r = rollNimbleAttack(parseDice('1d6+2')!, faces(6, 6, 6, 2));
		expect(r.outcome).toBe('crit');
		expect(r.total).toBe(6 + 6 + 2 + 2);
		expect(r.detail).toBe('[6] + crit [6, 2] + 2');
	});

	it('a max on a later die is not a crit', () => {
		const r = rollNimbleAttack(parseDice('2d8')!, faces(8, 3, 8));
		expect(r.outcome).toBeUndefined();
		expect(r.total).toBe(11);
	});

	it('stops exploding eventually', () => {
		const r = rollNimbleAttack(parseDice('1d4')!, () => 0.99);
		expect(r.outcome).toBe('crit');
		expect(r.rolls.length).toBe(1 + 20);
	});
});
