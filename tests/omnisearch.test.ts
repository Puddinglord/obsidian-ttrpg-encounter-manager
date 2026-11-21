import { describe, expect, it } from 'vitest';
import { orderPicks, parseOmnisearch, rankByName } from '../src/core/omnisearch-def';

describe('parseOmnisearch', () => {
	it('reads dice, with or without "roll"', () => {
		expect(parseOmnisearch('2d6+3').roll).toBe('2d6+3');
		expect(parseOmnisearch(' d20 ').roll).toBe('1d20');
		expect(parseOmnisearch('roll 4d8 - 1').roll).toBe('4d8-1');
		expect(parseOmnisearch('r d6').roll).toBe('1d6');
	});
	it('does not mistake names for dice', () => {
		expect(parseOmnisearch('dragon').roll).toBeUndefined();
		expect(parseOmnisearch('d0').roll).toBeUndefined();
		expect(parseOmnisearch('roll call').roll).toBeUndefined();
		expect(parseOmnisearch('roll call').text).toBe('roll call');
	});
	it('takes a count for adding several', () => {
		expect(parseOmnisearch('3 goblin')).toMatchObject({ count: 3, counted: true, text: 'goblin' });
		expect(parseOmnisearch('2x Dire Wolf')).toMatchObject({ count: 2, counted: true, text: 'dire wolf' });
		expect(parseOmnisearch('goblin')).toMatchObject({ count: 1, counted: false, text: 'goblin' });
		expect(parseOmnisearch('999 rats').count).toBe(50);
	});
	it('limits to commands after >', () => {
		expect(parseOmnisearch('> next')).toMatchObject({ commandsOnly: true, text: 'next' });
		expect(parseOmnisearch('>')).toMatchObject({ commandsOnly: true, text: '' });
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

describe('orderPicks (the filtered picker)', () => {
	const hits = [{ name: 'Death Blow', mine: true }, { name: 'Dash', mine: false }, { name: 'Deathless Rage', mine: true }, { name: 'Death', mine: false }];
	const prefer = (h: typeof hits[number]) => h.mine;
	it('lists the preferred entries first when nothing is typed, keeping their order', () => {
		expect(orderPicks(hits, '', prefer).map(h => h.name)).toEqual(['Death Blow', 'Deathless Rage', 'Dash', 'Death']);
	});
	it('puts an exact name first once something is typed, then preferred matches', () => {
		expect(orderPicks(hits, 'death', prefer).map(h => h.name)).toEqual(['Death', 'Death Blow', 'Deathless Rage', 'Dash']);
	});
	it('sinks entries already taken below the rest of their standing', () => {
		expect(orderPicks(hits, '', prefer, h => h.name === 'Death Blow').map(h => h.name)).toEqual(['Deathless Rage', 'Death Blow', 'Dash', 'Death']);
	});
	it('keeps the search order without a preference', () => {
		expect(orderPicks(hits, '').map(h => h.name)).toEqual(['Death Blow', 'Dash', 'Deathless Rage', 'Death']);
	});
});
