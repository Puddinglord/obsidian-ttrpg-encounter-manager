// Spotlight's merging of a game system's rows with its own, and typed filters
// from a system's compendium (core/spotlight-source.ts).
import { describe, expect, it } from 'vitest';
import { rankSpotlight, SpotlightCandidate } from '../src/core/spotlight-def';
import { compendiumFilters, SpotlightRow } from '../src/core/spotlight-source';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import { buildEntries5e, Entry5e, QUERY_5E } from '../src/systems/dnd5e/compendium-entries';

const c = (name: string, order: number, others: string[] = []): SpotlightCandidate<string> => ({ item: `${name}#${order}`, names: [name], others, order });

describe('rankSpotlight', () => {
	it('ranks by how well the name matches, whatever the kind', () => {
		expect(rankSpotlight([c('Goblin Boss', 0), c('Goblin', 4), c('Hobgoblin', 0)], 'goblin')).toEqual(['Goblin#4', 'Goblin Boss#0', 'Hobgoblin#0']);
	});
	it('puts a match only in secondary text below name matches', () => {
		expect(rankSpotlight([c('Snaggletooth', 0, ['Goblins']), c('Goblin Lair', 2)], 'goblin')).toEqual(['Goblin Lair#2', 'Snaggletooth#0']);
	});
	it('gives ties to the lower order group, then keeps the order they came in', () => {
		expect(rankSpotlight([c('Prone', 3), c('Prone', 1), c('Prone', 1)], 'prone')).toEqual(['Prone#1', 'Prone#1', 'Prone#3']);
		const a = { ...c('Zombie', 0), item: 'first' };
		const b = { ...c('Zombie', 0), item: 'second' };
		expect(rankSpotlight([a, b], 'zombie')).toEqual(['first', 'second']);
	});
	it('shows typo matches only when nothing matches for real', () => {
		expect(rankSpotlight([c('Zombie', 0)], 'zombiq')).toEqual(['Zombie#0']);
		expect(rankSpotlight([c('Zombie', 0), c('Zombiq Lord', 1)], 'zombiq')).toEqual(['Zombiq Lord#1']);
	});
	it('drops what does not match and keeps to the limit', () => {
		expect(rankSpotlight([c('Dragon', 0), c('Goblin', 0)], 'xyzzy')).toEqual([]);
		expect(rankSpotlight(Array.from({ length: 20 }, (_, i) => c(`Goblin ${i}`, 0)), 'goblin')).toHaveLength(14);
		expect(rankSpotlight(Array.from({ length: 20 }, (_, i) => c(`Goblin ${i}`, 0)), 'goblin', 3)).toHaveLength(3);
	});
});

describe('compendiumFilters (typed filters from a system\'s compendium)', () => {
	const entries = buildEntries5e('2024', bundledMonsters('2024'));
	const row = (e: Entry5e): SpotlightRow => ({ look: { kind: 'entry', title: e.name }, names: [e.name], order: 4, open: () => {} });
	const filters = compendiumFilters({ query: QUERY_5E, all: 'all', entries: () => entries, row });
	it('searches with filters, as rows', () => {
		const names = filters.search('school:evocation', 200).map(r => r.look.title);
		expect(names).toContain('Fireball');
		expect(names).not.toContain('Mage Hand');
		expect(filters.search('school:evocation', 5)).toHaveLength(5);
	});
	it('suggests values for a key, counted against the rest of the query', () => {
		const s = filters.suggest('school:evo', '', { applied: [], limit: 8 });
		expect(s.map(x => x.label.toLowerCase())).toContain('school:evocation');
		expect(filters.suggest('school:', 'level:3', { applied: [], limit: 8 }).every(x => (x.count ?? 1) > 0)).toBe(true);
	});
	it('knows a whole value from a partial one, and speaks the system\'s words', () => {
		expect(filters.isValue('school', 'evocation')).toBe(true);
		expect(filters.isValue('school', 'evo')).toBe(false);
		expect(filters.query.canonicalKey('school')).toBe('school');
		expect(filters.query.parseFilterToken('cr:1-4')).not.toBeNull();
	});
});
