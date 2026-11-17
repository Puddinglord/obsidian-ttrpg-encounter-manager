// The 5e compendium on core's search engine: entries from both editions, the
// facets read the same way in both, and the search language works with 5e's words.
import { describe, expect, it } from 'vitest';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import {
	buildEntries5e, castingTime, Entry5e, entryPills5e, entryReference5e, itemType, priceGp, QUERY_5E, rarities, SEGMENTS_5E,
} from '../src/systems/dnd5e/compendium-entries';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';

const entries = (ed: Dnd5eEdition) => buildEntries5e(ed, bundledMonsters(ed));
const names = (r: { entries: Entry5e[] }) => r.entries.map(e => e.name);

describe('5e facets read the same in both editions', () => {
	it('rarities', () => {
		expect(rarities('Rare')).toEqual(['Rare']);
		expect(rarities('Very Rare')).toEqual(['Very Rare']);
		expect(rarities('Uncommon (+1), Rare (+2), or Very Rare (+3)')).toEqual(['Uncommon', 'Rare', 'Very Rare']);
		expect(rarities('Rare (Silver or Brass), Very Rare (Bronze), or Legendary (Iron)')).toEqual(['Rare', 'Very Rare', 'Legendary']);
		expect(rarities('Rarity Varies')).toEqual(['Varies']);
		expect(rarities('Varies')).toEqual(['Varies']);
	});
	it('item types, casting times and prices', () => {
		expect(itemType('Wondrous Items')).toBe('Wondrous item');
		expect(itemType('Staffs')).toBe('Staff');
		expect(itemType('Armor')).toBe('Armor');
		expect(castingTime('1 action')).toBe('Action');
		expect(castingTime('Action')).toBe('Action');
		expect(castingTime('1 bonus action')).toBe('Bonus action');
		expect(castingTime('Bonus Action, which you take immediately after hitting a creature with a weapon')).toBe('Bonus action');
		expect(castingTime('Action (Overgrowth) or 8 hours (Enrichment)')).toBe('Action');
		expect(castingTime('1 minute')).toBe('1 minute');
		expect(priceGp('15 gp')).toBe(15);
		expect(priceGp('1 sp')).toBeCloseTo(0.1);
		expect(priceGp('1,500 gp')).toBe(1500);
		expect(priceGp(undefined)).toBeUndefined();
	});
});

describe.each(['2024', '2014'] as Dnd5eEdition[])('the %s compendium', (ed) => {
	const all = entries(ed);
	const search = (q: string, segment: Parameters<typeof QUERY_5E.search>[2]['segment'] = 'all') => QUERY_5E.search(all, q, { segment });

	it('has every kind, each on its tab, with unique ids', () => {
		const ids = all.map(e => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const seg of SEGMENTS_5E.filter(s => s.id !== 'all' && !(ed === '2024' && s.id === 'rules'))) {
			expect(all.some(e => e.segments.includes(seg.id)), seg.id).toBe(true);
		}
		for (const e of all) expect(e.segments.length).toBe(1);
	});
	it('finds Fireball by name, with a typo, and by its facets', () => {
		expect(names(search('fireball'))[0]).toBe('Fireball');
		expect(names(search('firebal'))[0]).toBe('Fireball');
		expect(names(search('school:evocation level:3', 'spells'))).toContain('Fireball');
		expect(names(search('school:evocation level:3 class:wizard', 'spells'))).toContain('Fireball');
		expect(names(search('school:evocation -level:3', 'spells'))).not.toContain('Fireball');
		expect(names(search('level:cantrip', 'spells')).length).toBeGreaterThan(10);
		expect(search('level:cantrip', 'spells').entries.every(e => e.nums.level === 0)).toBe(true);
	});
	it('filters monsters by CR, type, size and flags', () => {
		const r = search('cr:1/4 type:humanoid', 'monsters');
		expect(r.entries.length).toBeGreaterThan(0);
		expect(r.entries.every(e => e.nums.cr === 0.25 && e.facets.type[0] === 'Humanoid')).toBe(true);
		expect(search('cr:>=20', 'monsters').entries.every(e => (e.nums.cr ?? 0) >= 20)).toBe(true);
		expect(search('is:legendary', 'monsters').entries.every(e => e.flags.includes('legendary'))).toBe(true);
		expect(search('is:legendary', 'monsters').entries.length).toBeGreaterThan(5);
		expect(names(search('size:gargantuan', 'monsters'))).toContain('Tarrasque');
		expect(search('resist:fire', 'monsters').entries.length).toBeGreaterThan(5);
		const swarms = search('is:swarm', 'monsters').entries;
		expect(swarms.length).toBeGreaterThan(3);
		expect(swarms.every(e => !/swarm/i.test(e.facets.type[0]))).toBe(true);
		expect(search('', 'monsters').entries.every(e => !/^swarm/i.test(e.facets.type[0] ?? ''))).toBe(true);
	});
	it('sorts monsters by CR with headings, and by name on request', () => {
		const r = search('', 'monsters');
		expect(r.sort.key).toBe('cr');
		expect(r.grouped).toBe(true);
		const crs = r.entries.map(e => e.nums.cr ?? 0);
		expect(crs).toEqual([...crs].sort((a, b) => a - b));
		expect(r.sort.group!(r.entries[0])).toMatch(/^CR /);
		const byName = search('sort:-name', 'monsters');
		expect(byName.entries[0].name.localeCompare(byName.entries[1].name)).toBeGreaterThanOrEqual(0);
	});
	it('filters magic items and equipment', () => {
		expect(search('rarity:legendary', 'items').entries.every(e => e.facets.rarity.includes('Legendary'))).toBe(true);
		expect(search('is:attunement', 'items').entries.length).toBeGreaterThan(20);
		const martial = search('weapon:martial range:melee', 'equipment');
		expect(names(martial)).toContain('Longsword');
		expect(names(martial)).not.toContain('Club');
		expect(names(search('prop:finesse', 'equipment'))).toContain('Rapier');
		expect(names(search('damage:slashing', 'equipment'))).toContain('Longsword');
		expect(search('price:<1', 'equipment').entries.every(e => (e.nums.price ?? 99) < 1)).toBe(true);
		expect(names(search('armor:heavy', 'equipment'))).toContain('Plate Armor');
	});
	it('suggests filters as you type', () => {
		const pool = all.filter(e => e.segments.includes('spells'));
		expect(QUERY_5E.suggest('sch', pool, 'spells').map(s => s.token)).toContain('school:');
		expect(QUERY_5E.suggest('school:evo', pool, 'spells')[0].token).toBe('school:Evocation');
		expect(QUERY_5E.suggest('evocation', pool, 'spells').map(s => s.token)).toContain('school:Evocation');
		expect(QUERY_5E.suggest('in:mon', all, 'all')[0].token).toBe('in:monsters');
		expect(QUERY_5E.suggest('level:', pool, 'spells')[0].label).toBe('level:cantrip');
	});
	it('writes references the way 5e: references read them', () => {
		expect(entryReference5e(all.find(e => e.name === 'Fireball')!)).toBe('`5e:spell:Fireball`');
		expect(entryReference5e(all.find(e => e.kind === 'monster')!)).toMatch(/^`5e:[^:]+`$/);
	});
	it('gives every entry pills or a detail line', () => {
		for (const e of all) expect(entryPills5e(e, false).length > 0 || !!e.detail, e.id).toBe(true);
	});
	it('hides numbers from players (lore)', () => {
		const lore = buildEntries5e(ed, bundledMonsters(ed), true).filter(e => e.kind === 'monster');
		expect(lore.every(e => e.badge === undefined && e.nums.cr === undefined && !e.detail.includes('CR'))).toBe(true);
		expect(QUERY_5E.sortsFor('monsters', true).map(s => s.key)).not.toContain('cr');
	});
});
