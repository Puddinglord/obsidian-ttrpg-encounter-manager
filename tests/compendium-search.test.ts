import { describe, expect, it } from 'vitest';
import BESTIARY from '../src/systems/nimble/data/bestiary.json';
import DATA from '../src/systems/nimble/data/compendium.json';
import { BestiaryEntry, bestiaryEntries } from '../src/systems/nimble/bestiary';
import { Compendium } from '../src/systems/nimble/compendium';
import { artKey, buildEntries, Entry, entryPills, entrySnippet, hitArtKey, propertyName, priceGp } from '../src/systems/nimble/compendium-entries';
import {
	applySuggestion, editDistance, finishedFilters, fuzzyRank, nameMatch, parseQuery, parseRange, search, suggest, tokenize, valueMatches,
} from '../src/systems/nimble/compendium-query';
import type { MonsterIndexEntry } from '../src/systems/nimble/types';

const monsters = bestiaryEntries(BESTIARY as unknown as BestiaryEntry[]);
const comp = new Compendium(DATA);
const vault: MonsterIndexEntry = { name: 'Bramble the Wolf', filePath: 'Party/Bramble.md', monster: { name: 'Bramble the Wolf', level: 2, type: 'Companion', armor: 'none', hp: 20, movement: '8' } };
const conditions = [{ name: 'Dazed', description: 'Can only take 1 action.' }, { name: 'Bloodied', description: 'x', auto: true }];
const all = buildEntries({
	monsters: [...monsters, vault], compendium: comp, conditions,
	npcs: [{ path: 'Camp/NPCs/Kevori.md', name: 'Kevori', aliases: ['The Fox'], role: 'Innkeeper', campaign: 'Camp' }],
});
const names = (es: Entry[]) => es.map(e => e.name);
const find = (q: string, segment: Parameters<typeof search>[2]['segment'] = 'all') => search(all, q, { segment }).entries;

describe('compendium entries', () => {
	it('holds every kind of thing', () => {
		const kinds = new Set(all.map(e => e.kind));
		for (const k of ['monster', 'npc', 'spell', 'item', 'feature', 'class', 'subclass', 'ancestry', 'background', 'boon', 'condition', 'rule']) expect(kinds, k).toContain(k);
		expect(new Set(all.map(e => e.id)).size).toBe(all.length);
	});

	it('leaves the tracker-only conditions out', () => {
		expect(all.some(e => e.name === 'Bloodied' && e.kind === 'condition')).toBe(false);
	});

	it('puts companions in their own tab', () => {
		const c = search(all, '', { segment: 'companions' }).entries;
		expect(names(c)).toContain('Bramble the Wolf');
		expect(names(c)).toContain('Beastmaster');
		expect(names(c)).toContain('Adventuring Companions');
		expect(c.every(e => e.kind !== 'monster' || !e.monster?.bundled)).toBe(true);
	});

	it('normalises item properties and prices', () => {
		expect(propertyName('2-handed (Req. 2 STR)')).toBe('2-handed');
		expect(propertyName('Range 8')).toBe('Range');
		expect(propertyName('Load: 1 action')).toBe('Load');
		expect(priceGp('5 sp')).toBe(0.5);
		expect(priceGp('1,000 gp')).toBe(1000);
	});

	it('merges printings for players and hides stats', () => {
		const lore = buildEntries({ monsters, lore: true, noted: new Set(['goblin']) });
		const bandits = lore.filter(e => e.name === 'Bandit');
		expect(bandits.length).toBeLessThanOrEqual(1);
		expect(lore.every(e => e.nums.level === undefined && !e.facets.role)).toBe(true);
	});
});

describe('query parsing', () => {
	it('splits filters, words, sort and tab', () => {
		const q = parseQuery('type:goblin -role:minion level:>=3 "lay on hands" sort:-level in:spells fire');
		expect(q.words).toEqual(['lay on hands', 'fire']);
		expect(q.filters.map(f => [f.key, f.negate])).toEqual([['type', false], ['role', true], ['level', false]]);
		expect(q.sorts).toEqual([{ key: 'level', desc: true }]);
		expect(q.segment).toBe('spells');
	});

	it('keeps quoted values and unknown keys as words', () => {
		expect(tokenize('type:"Fiendish Tyrants" foo').map(t => t.text)).toEqual(['type:"Fiendish Tyrants"', 'foo']);
		expect(parseQuery('http:thing').words).toEqual(['http:thing']);
	});

	it('reads numbers, ranges and words', () => {
		expect(parseRange('3')).toEqual({ min: 3, max: 3 });
		expect(parseRange('2-4')).toEqual({ min: 2, max: 4 });
		expect(parseRange('1/2')).toEqual({ min: 0.5, max: 0.5 });
		expect(parseRange('cantrip')).toEqual({ min: 0, max: 0 });
		expect(parseRange('>=5')?.min).toBe(5);
		expect(parseRange('<3')?.max).toBeLessThan(3);
		expect(parseRange('lots')).toBeUndefined();
	});

	it('matches facet values loosely', () => {
		expect(valueMatches('Goblins', 'goblin')).toBe(true);
		expect(valueMatches('Goblins', 'goblins')).toBe(true);
		expect(valueMatches('Fiendish Tyrants', 'tyrant')).toBe(true);
		expect(valueMatches('d8', '8', 'die')).toBe(true);
		expect(valueMatches('d8', '1d8', 'die')).toBe(true);
		expect(valueMatches('STR', 'strength', 'stat')).toBe(true);
		expect(valueMatches('Fire', 'ice')).toBe(false);
	});

	it('measures typos', () => {
		expect(editDistance('fireball', 'firebal')).toBe(1);
		expect(editDistance('fireball', 'fierball')).toBe(1);
		expect(editDistance('goblin', 'dragon')).toBeGreaterThan(2);
	});
});

describe('search', () => {
	it('finds class features by name: lay on hands is an Oathsworn feature', () => {
		const hit = find('lay on hands')[0];
		expect(hit.name).toBe('Lay on Hands');
		expect(hit.kind).toBe('feature');
		expect(hit.facets.class).toContain('Oathsworn');
	});

	it('forgives typos', () => {
		expect(find('pyroclsm', 'spells')[0]?.name).toBe('Pyroclasm');
		expect(find('flame drat', 'spells')[0]?.name).toBe('Flame Dart');
		expect(names(find('goblinn', 'adversaries'))).toContain('Goblin Taskmaster');
	});

	it('filters monsters by type and level, sorted by level', () => {
		const r = search(all, 'type:goblin level:1-3', { segment: 'adversaries' });
		expect(r.entries.length).toBeGreaterThan(2);
		expect(r.entries.every(e => (e.facets.type ?? []).some(t => /goblin/i.test(t)))).toBe(true);
		expect(r.entries.every(e => (e.nums.level ?? 0) >= 1 && (e.nums.level ?? 0) <= 3)).toBe(true);
		const lv = r.entries.map(e => e.nums.level ?? 0);
		expect(lv).toEqual([...lv].sort((a, b) => a - b));
	});

	it('filters spells by school and tier', () => {
		const r = find('school:necrotic tier:cantrip', 'spells');
		expect(r.length).toBeGreaterThan(0);
		expect(r.every(e => e.facets.school?.[0] === 'Necrotic' && e.nums.tier === 0)).toBe(true);
		const eighth = find('tier:8', 'spells');
		expect(eighth.length).toBeGreaterThan(0);
		expect(eighth.every(e => e.nums.tier === 8)).toBe(true);
	});

	it('or-s values of one key and negates', () => {
		const both = find('school:fire,ice', 'spells');
		expect(new Set(both.map(e => e.facets.school?.[0]))).toEqual(new Set(['Fire', 'Ice']));
		expect(find('school:fire school:ice', 'spells').length).toBe(both.length);
		expect(find('-school:fire', 'spells').some(e => e.facets.school?.[0] === 'Fire')).toBe(false);
	});

	it('filters items by stat, die and property', () => {
		const str = find('stat:str category:weapon', 'items');
		expect(str.length).toBeGreaterThan(0);
		expect(str.every(e => e.facets.stat.includes('STR'))).toBe(true);
		expect(find('die:d8', 'items').every(e => e.facets.die.includes('d8'))).toBe(true);
		expect(find('prop:light', 'items').map(e => e.name)).toContain('Dagger');
		expect(find('tag:light', 'items').map(e => e.name)).toContain('Dagger');
	});

	it('honours is: flags and tabs', () => {
		expect(find('is:minion', 'adversaries').every(e => e.flags.includes('minion'))).toBe(true);
		expect(find('is:concentration', 'spells').length).toBeGreaterThan(0);
		const r = search(all, 'in:spells fire', { segment: 'all' });
		expect(r.segment).toBe('spells');
		expect(r.entries.every(e => e.kind === 'spell')).toBe(true);
	});

	it('finds NPCs by alias', () => {
		expect(find('fox')[0]?.name).toBe('Kevori');
	});

	it('sorts by an explicit sort and groups', () => {
		const r = search(all, 'sort:-tier', { segment: 'spells' });
		expect(r.sort.key).toBe('tier');
		expect(r.entries[0].nums.tier).toBe(9);
		expect(r.grouped).toBe(true);
		const byName = search(all, '', { segment: 'spells', sort: 'name' });
		const ns = byName.entries.map(e => e.name);
		expect(ns).toEqual([...ns].sort((a, b) => a.localeCompare(b)));
	});

	it('sorts by several keys in turn', () => {
		expect(parseQuery('sort:level,-name sort:type').sorts).toEqual([{ key: 'level', desc: false }, { key: 'name', desc: true }, { key: 'type', desc: false }]);
		const r = search(all, 'sort:type,-level', { segment: 'adversaries' });
		expect(r.chain.map(c => [c.def.key, c.desc])).toEqual([['type', false], ['level', true]]);
		const goblins = r.entries.filter(e => e.facets.type?.[0] === 'Goblins').map(e => e.nums.level ?? 0);
		expect(goblins.length).toBeGreaterThan(3);
		expect(goblins).toEqual([...goblins].sort((a, b) => b - a));
		const ui = search(all, '', { segment: 'spells', sorts: [{ key: 'school', desc: false }, { key: 'tier', desc: true }] });
		const fire = ui.entries.filter(e => e.facets.school?.[0] === 'Fire').map(e => e.nums.tier ?? 0);
		expect(fire).toEqual([...fire].sort((a, b) => b - a));
	});

	it('is relevance-ordered when words are typed and defaults per tab otherwise', () => {
		expect(search(all, 'goblin', { segment: 'adversaries' }).sort.key).toBe('relevance');
		expect(search(all, '', { segment: 'adversaries' }).sort.key).toBe('level');
		expect(search(all, '', { segment: 'spells' }).sort.key).toBe('tier');
	});
});

describe('suggestions', () => {
	const spells = search(all, '', { segment: 'spells' }).entries;
	const mons = search(all, '', { segment: 'adversaries' }).entries;

	it('completes keys', () => {
		expect(suggest('sch', spells, 'spells')[0]).toMatchObject({ kind: 'key', token: 'school:' });
		expect(suggest('ty', mons, 'adversaries').map(s => s.token)).toContain('type:');
	});

	it('completes values with counts', () => {
		const s = suggest('type:gob', mons, 'adversaries');
		expect(s[0].token).toBe('type:Goblins');
		expect(s[0].count).toBeGreaterThan(5);
		expect(suggest('type:fiendish', mons, 'adversaries')[0].token).toBe('type:"Fiendish Tyrants"');
		expect(suggest('tier:', spells, 'spells')[0].token).toBe('tier:cantrip');
	});

	it('offers the filter a bare word could mean', () => {
		const s = suggest('necrotic', spells, 'spells');
		expect(s[0].token).toBe('school:Necrotic');
		expect(suggest('spell', all, 'all').map(x => x.token)).toContain('in:spells');
	});

	it("never offers an NPC's role, or any line of prose, as a filter", () => {
		const npcs = buildEntries({
			monsters: [], compendium: comp, conditions: [],
			npcs: [
				{ path: 'Q/NPCs/Tobren.md', name: 'Tobren Kask', aliases: [], role: "Master assayer of the Alchemists' Guild", campaign: 'Q' },
				{ path: 'Q/NPCs/Vess.md', name: 'Magistrix Vess', aliases: ['The Alchemist'], role: 'The Alchemist, half flesh and half mercury', campaign: 'Q' },
			],
		});
		expect(npcs.filter(e => e.kind === 'npc').every(e => !e.facets.role)).toBe(true);
		expect(suggest('alchemist', npcs, 'all').map(x => x.token).filter(t => t.startsWith('role:'))).toEqual([]);
		// Still found by searching for it.
		expect(search(npcs, 'assayer', { segment: 'all' }).entries.map(e => e.name)).toContain('Tobren Kask');
		// A long value typed into any property isn't offered from a bare word either; short ones are.
		const prose = { ...vault, name: 'Odd Thing', monster: { ...vault.monster, name: 'Odd Thing', type: 'A twisted thing that was once a miller' } };
		const odd = buildEntries({ monsters: [prose, vault], compendium: comp, conditions: [] });
		expect(suggest('twisted', odd, 'all').map(x => x.token)).not.toContain('type:"A twisted thing that was once a miller"');
		expect(suggest('companion', odd, 'all').map(x => x.token)).toContain('type:Companion');
	});

	it('does not offer a filter that is already applied', () => {
		expect(suggest('type:gob', mons, 'adversaries', { applied: ['type:Goblins'] }).map(x => x.token)).not.toContain('type:Goblins');
		expect(suggest('necrotic', spells, 'spells', { applied: ['school:necrotic'] }).map(x => x.token)).not.toContain('school:Necrotic');
	});

	it('completes sort and is', () => {
		expect(suggest('sort:le', mons, 'adversaries')[0].token).toBe('sort:level');
		expect(suggest('is:min', mons, 'adversaries')[0].token).toBe('is:minion');
	});

	it('replaces the token at the caret', () => {
		expect(applySuggestion('type:gob', 8, { kind: 'value', token: 'type:Goblins', label: '', detail: '' })).toEqual({ value: 'type:Goblins ', caret: 13 });
		expect(applySuggestion('fire sch', 8, { kind: 'key', token: 'school:', label: '', detail: '' })).toEqual({ value: 'fire school:', caret: 12 });
	});

	it('knows which filters are finished', () => {
		expect(finishedFilters('type:goblins level:3 gob', 24).map(t => t.text)).toEqual(['type:goblins', 'level:3']);
		expect(finishedFilters('type:gob', 8)).toEqual([]);
	});
});

describe('result cards', () => {
	const byName = (n: string, kind?: string) => all.find(e => e.name === n && (!kind || e.kind === kind))!;
	it('shows a spell\'s school, cast and range as pills, and its words without the range', () => {
		const e = byName('Flame Dart', 'spell');
		const pills = entryPills(e);
		expect(pills[0]).toEqual({ text: 'Fire', tone: 'school-fire' });
		expect(pills.map(p => p.text)).toContain('1 Action');
		expect(entrySnippet(e)).not.toMatch(/^Range/);
	});
	it('marks minions and legendary monsters, and caps the pills at five', () => {
		expect(entryPills(byName('Goblin Minion')).some(p => p.tone === 'minion')).toBe(true);
		expect(all.every(e => entryPills(e).length <= 5)).toBe(true);
	});
});

describe('art keys', () => {
	it('gives a creature one key across its printings, and a card the same key as its list entry', () => {
		const bandits = all.filter(e => e.kind === 'monster' && /^Bandit( \(GM Guide\))?$/.test(e.name));
		expect(bandits.length).toBe(2);
		expect(new Set(bandits.map(artKey)).size).toBe(1);
		for (const e of all.filter(x => x.hit).slice(0, 400)) expect(artKey(e)).toBe(hitArtKey(e.hit!));
		expect(artKey(all.find(e => e.kind === 'condition')!)).toBe(hitArtKey(all.find(e => e.kind === 'condition')!.condition!));
	});
});

describe('fuzzy names', () => {
	it('forgives a stray letter, a swap and a slip while typing', () => {
		expect(nameMatch(['Zombie'], 'zombieq')).toMatchObject({ fuzzy: true });
		expect(nameMatch(['Zombie'], 'zomibe')).toMatchObject({ fuzzy: true });
		expect(nameMatch(['Zombie Lord'], 'zomv')).toMatchObject({ fuzzy: true });
		expect(nameMatch(['Zombie'], 'zom')).toMatchObject({ fuzzy: false });
		expect(nameMatch(['Goblin'], 'dragon')).toBeNull();
	});
	it('keeps typo matches behind real ones, and only uses them when nothing matches outright', () => {
		const names = ['Zombie', 'Zombie Lord', 'Bomber'];
		expect(fuzzyRank(names, 'zombie', n => [n], 5).map(x => x.item)).toEqual(['Zombie', 'Zombie Lord']);
		expect(fuzzyRank(names, 'zombieq', n => [n], 5).map(x => x.item)[0]).toBe('Zombie');
	});
	it('finds a monster in the compendium with a stray letter', () => {
		expect(find('zombieq', 'adversaries')[0]?.name).toMatch(/^Zombie/);
	});
});

