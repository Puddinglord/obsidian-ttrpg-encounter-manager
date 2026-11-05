import { describe, expect, it } from 'vitest';
import { legendaryOption, parseCountQuery } from '../src/tracker-text';

describe('parseCountQuery', () => {
	it.each([
		['goblin', 1, 'goblin'],
		['3 goblin', 3, 'goblin'],
		['3x goblin minion', 3, 'goblin minion'],
		['3× goblin', 3, 'goblin'],
		['  12   wolf ', 12, 'wolf'],
		['500 rats', 50, 'rats'],
		['0 rats', 1, 'rats'],
		['42', 1, '42'],
	])('%s → %i × %s', (input, count, query) => expect(parseCountQuery(input)).toEqual({ count, query }));
});

describe('legendaryOption', () => {
	it('reads a bold name, area, dice and whether it is a save', () => {
		expect(legendaryOption('**Metallic Burst.** Cone 3. DEX save DC 12 or take 2d6 damage and be Slowed for 1 round.')).toEqual({
			name: 'Metallic Burst', text: 'Cone 3. DEX save DC 12 or take 2d6 damage and be Slowed for 1 round.', tag: 'Cone 3', dice: '2d6', save: true,
		});
	});

	it('handles attacks with a modifier', () => {
		const o = legendaryOption('**Staff and spell.** Reach 1. 1d6+2, and the target is Slowed until the end of its next turn.');
		expect([o.name, o.tag, o.dice, o.save]).toEqual(['Staff and spell', 'Reach 1', '1d6+2', false]);
	});

	it('reads plain "Name. text" lines from the bundled bestiary', () => {
		const o = legendaryOption('Manglemaul. Move 6. 2d6 + 2 damage, Grappled (escape DC 10).');
		expect([o.name, o.dice, o.tag]).toEqual(['Manglemaul', '2d6+2', undefined]);
	});

	it('normalizes a typographic minus so the dice can roll', () => {
		expect(legendaryOption('**Weak Swipe.** 1d6−1.').dice).toBe('1d6-1');
	});

	it('copes with a line that has no name or dice', () => {
		const o = legendaryOption('Moves up to 6 spaces without provoking');
		expect(o.dice).toBeUndefined();
		expect(o.name.length).toBeGreaterThan(0);
	});
});
