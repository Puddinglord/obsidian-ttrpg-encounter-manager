import { describe, expect, it } from 'vitest';
import { parseSpotlight, rankByName } from '../src/spotlight-def';

describe('parseSpotlight', () => {
	it('reads dice, with or without "roll"', () => {
		expect(parseSpotlight('2d6+3').roll).toBe('2d6+3');
		expect(parseSpotlight(' d20 ').roll).toBe('1d20');
		expect(parseSpotlight('roll 4d8 - 1').roll).toBe('4d8-1');
		expect(parseSpotlight('r d6').roll).toBe('1d6');
	});
	it('does not mistake names for dice', () => {
		expect(parseSpotlight('dragon').roll).toBeUndefined();
		expect(parseSpotlight('d0').roll).toBeUndefined();
		expect(parseSpotlight('roll call').roll).toBeUndefined();
		expect(parseSpotlight('roll call').text).toBe('roll call');
	});
	it('takes a count for adding several', () => {
		expect(parseSpotlight('3 goblin')).toMatchObject({ count: 3, counted: true, text: 'goblin' });
		expect(parseSpotlight('2x Dire Wolf')).toMatchObject({ count: 2, counted: true, text: 'dire wolf' });
		expect(parseSpotlight('goblin')).toMatchObject({ count: 1, counted: false, text: 'goblin' });
		expect(parseSpotlight('999 rats').count).toBe(50);
	});
	it('limits to commands after >', () => {
		expect(parseSpotlight('> next')).toMatchObject({ commandsOnly: true, text: 'next' });
		expect(parseSpotlight('>')).toMatchObject({ commandsOnly: true, text: '' });
	});
});

describe('rankByName', () => {
	const names = ['Hobgoblin', 'Goblin Boss', 'Goblin', 'Young Dragon', 'Bog Goblin'];
	const rank = (q: string, limit = 10) => rankByName(names, q, n => [n], limit);
	it('puts prefix matches first, shortest first, then word starts, then the rest', () => {
		expect(rank('gob')).toEqual(['Goblin', 'Goblin Boss', 'Bog Goblin', 'Hobgoblin']);
	});
	it('drops what does not match and respects the limit', () => {
		expect(rank('dragon')).toEqual(['Young Dragon']);
		expect(rank('gob', 2)).toHaveLength(2);
		expect(rank('zzz')).toEqual([]);
	});
	it('matches on any of the texts given (aliases)', () => {
		expect(rankByName([{ n: 'Tobren Kask', a: ['Master Kask'] }], 'master', x => [x.n, ...x.a], 5)).toHaveLength(1);
	});
});
