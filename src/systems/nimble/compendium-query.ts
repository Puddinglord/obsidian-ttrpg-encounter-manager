// Nimble's words for the compendium's search language (core/compendium/query.ts):
// its tabs, facets and sorts. Everything else is the shared engine; the names
// exported here are the ones Nimble's modules (and tests) have always used.
// Pure: no Obsidian imports.
//
//   goblin  type:goblin  school:fire,ice  -role:minion  level:>=5  tier:cantrip
//   is:minion  is:concentration  tag:light  in:spells  sort:-tier  sort:level,name

import {
	applySuggestion, createCompendiumQuery, editDistance, FacetDef, fuzzyRank, nameMatch, quoteValue, QuerySchema, SortDef as CoreSortDef, subsequenceScore, tokenAt, tokenize,
} from '../../core/compendium/query';
import type { Filter, ParsedQuery as CoreParsed, SearchOptions as CoreOptions, SearchResult as CoreResult, SortSpec, Suggestion, Token } from '../../core/compendium/query';
import { Entry, Segment, SEGMENTS, ENTRY_KIND_LABEL } from './compendium-entries';
import { tierLabel } from './compendium';

export type { FacetDef, Filter, SortSpec, Suggestion, Token };
export type SortDef = CoreSortDef<Entry>;
export type ParsedQuery = CoreParsed<Segment>;
export type SearchOptions = CoreOptions<Entry, Segment>;
export type SearchResult = CoreResult<Entry, Segment>;
export { applySuggestion, editDistance, fuzzyRank, nameMatch, quoteValue, subsequenceScore, tokenAt, tokenize };

export const FACETS: FacetDef[] = [
	{ key: 'type', label: 'Type', aliases: ['family', 'archetype', 'creature'], hint: 'Goblins, Undead…' },
	{ key: 'level', label: 'Level', aliases: ['lvl', 'lv'], numeric: true, hint: '3, >5, 2-4' },
	{ key: 'role', label: 'Role', hint: 'Minion, Legendary…' },
	{ key: 'size', label: 'Size', hint: 'Small, Large…' },
	{ key: 'armor', label: 'Armor', hint: 'None, Medium, Heavy' },
	{ key: 'habitat', label: 'Habitat', aliases: ['where', 'terrain'], hint: 'Forest, Underdark…' },
	{ key: 'hp', label: 'HP', numeric: true, hint: '>50' },
	{ key: 'resist', label: 'Resists', aliases: ['resistance'], hint: 'fire…' },
	{ key: 'immune', label: 'Immune to', aliases: ['immunity'], hint: 'poison…' },
	{ key: 'vuln', label: 'Vulnerable to', aliases: ['vulnerable', 'weak'], hint: 'radiant…' },
	{ key: 'school', label: 'School', aliases: ['element'], hint: 'Fire, Radiant…' },
	{ key: 'tier', label: 'Tier', numeric: true, hint: 'cantrip, 3, >=5' },
	{ key: 'action', label: 'Actions', aliases: ['actions', 'cast'], hint: '1 Action, Reaction…' },
	{ key: 'class', label: 'Class', hint: 'Oathsworn, Mage…' },
	{ key: 'subclass', label: 'Subclass', aliases: ['sub'], hint: 'Beastmaster…' },
	{ key: 'group', label: 'Group', aliases: ['option', 'options'], hint: 'Savage Arsenal…' },
	{ key: 'category', label: 'Category', aliases: ['cat'], hint: 'Weapon, Armor…' },
	{ key: 'stat', label: 'Stat', aliases: ['stats'], hint: 'STR, DEX…' },
	{ key: 'die', label: 'Die', aliases: ['dice'], hint: 'd8, d12…' },
	{ key: 'damage', label: 'Damage type', aliases: ['dmg'], hint: 'slashing…' },
	{ key: 'prop', label: 'Property', aliases: ['property', 'properties'], hint: 'Light, 2-handed…' },
	{ key: 'rarity', label: 'Rarity', hint: 'Rare…' },
	{ key: 'price', label: 'Price (gp)', aliases: ['cost', 'gp'], numeric: true, hint: '<10' },
	{ key: 'str', label: 'STR required', aliases: ['req'], numeric: true, hint: '2' },
	{ key: 'complexity', label: 'Complexity', numeric: true, hint: '1-3' },
	{ key: 'topic', label: 'Topic', hint: 'Skills, Magic…' },
	{ key: 'campaign', label: 'Campaign', hint: '' },
	{ key: 'source', label: 'Source', aliases: ['book', 'from'], hint: 'Core, GMG, M&M…' },
	{ key: 'kind', label: 'Kind', hint: 'Spell, Feature…' },
	{ key: 'tag', label: 'Tag', aliases: ['tags', 'keyword'], hint: 'any keyword' },
];

const first = (e: Entry, key: string) => e.facets[key]?.[0];
const DIE_ORDER = (e: Entry) => { const d = first(e, 'die'); return d ? Number(d.slice(1)) : undefined; };

export const SORTS: SortDef[] = [
	{ key: 'relevance', label: 'Best match', aliases: ['best', 'match'] },
	{ key: 'name', label: 'Name', aliases: ['az', 'alpha', 'alphabetical'], value: e => e.name.toLowerCase(), group: e => (/[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : '#') },
	{ key: 'level', label: 'Level', aliases: ['lvl'], value: e => e.nums.level, group: e => (e.nums.level === undefined ? 'No level' : `Level ${e.badge && e.kind === 'monster' ? e.badge : e.nums.level}`) },
	{ key: 'type', label: 'Type', aliases: ['family', 'archetype'], value: e => first(e, 'type')?.toLowerCase(), group: e => first(e, 'type') ?? 'Other' },
	{ key: 'role', label: 'Role', value: e => first(e, 'role')?.toLowerCase(), group: e => first(e, 'role') ?? 'Other' },
	{ key: 'habitat', label: 'Habitat', value: e => first(e, 'habitat')?.toLowerCase(), group: e => first(e, 'habitat') ?? 'Anywhere' },
	{ key: 'hp', label: 'HP', value: e => e.nums.hp },
	{ key: 'tier', label: 'Tier', value: e => e.nums.tier, group: e => (e.nums.tier === undefined ? 'Other' : tierLabel(e.nums.tier)) },
	{ key: 'school', label: 'School', aliases: ['element'], value: e => first(e, 'school')?.toLowerCase(), group: e => first(e, 'school') ?? 'Other' },
	{ key: 'class', label: 'Class', value: e => first(e, 'class')?.toLowerCase(), group: e => first(e, 'class') ?? 'Any class' },
	{ key: 'category', label: 'Category', aliases: ['cat'], value: e => first(e, 'category')?.toLowerCase(), group: e => first(e, 'category') ?? 'Other' },
	{ key: 'die', label: 'Damage die', aliases: ['dice', 'damage'], value: DIE_ORDER, group: e => first(e, 'die') ?? 'No die' },
	{ key: 'price', label: 'Price', aliases: ['cost', 'gp'], value: e => e.nums.price },
	{ key: 'stat', label: 'Stat', value: e => first(e, 'stat')?.toLowerCase(), group: e => first(e, 'stat') ?? 'Any stat' },
	{ key: 'group', label: 'Group', aliases: ['option'], value: e => first(e, 'group')?.toLowerCase(), group: e => first(e, 'group') ?? 'Class features' },
	{ key: 'kind', label: 'Kind', value: e => ENTRY_KIND_LABEL[e.kind], group: e => KIND_PLURAL[e.kind] },
	{ key: 'size', label: 'Size', value: e => SIZE_ORDER.indexOf(first(e, 'size') ?? '') + 1 || undefined, group: e => first(e, 'size') ?? 'Any size' },
	{ key: 'rarity', label: 'Rarity', value: e => first(e, 'rarity')?.toLowerCase(), group: e => first(e, 'rarity') ?? 'Common' },
	{ key: 'complexity', label: 'Complexity', value: e => e.nums.complexity },
	{ key: 'topic', label: 'Topic', value: e => first(e, 'topic')?.toLowerCase(), group: e => first(e, 'topic') ?? 'Other' },
	{ key: 'campaign', label: 'Campaign', value: e => first(e, 'campaign')?.toLowerCase(), group: e => first(e, 'campaign') ?? 'No campaign' },
	{ key: 'source', label: 'Source', aliases: ['book'], value: e => first(e, 'source')?.toLowerCase(), group: e => first(e, 'source') ?? 'Other' },
];
const KIND_PLURAL: Record<Entry['kind'], string> = {
	monster: 'Adversaries', npc: 'NPCs', condition: 'Conditions', rule: 'Rules', class: 'Classes', subclass: 'Subclasses',
	ancestry: 'Ancestries', background: 'Backgrounds', item: 'Items', spell: 'Spells', feature: 'Features', boon: 'Boons',
};
const SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const STAT_WORDS: Record<string, string> = { strength: 'str', dexterity: 'dex', intelligence: 'int', will: 'wil', willpower: 'wil', wisdom: 'wil' };

const NOUN: Partial<Record<Segment, string>> = { adversaries: 'monster', spells: 'spell', items: 'item', features: 'feature', npcs: 'NPC', classes: 'entry', rules: 'entry', origins: 'entry', companions: 'entry' };

export const NIMBLE_QUERY_SCHEMA: QuerySchema<Entry, Segment> = {
	segments: SEGMENTS,
	facets: FACETS,
	sorts: SORTS,
	sortsFor(seg, lore) {
	const keys: Record<Segment, string[]> = {
		all: ['kind', 'name', 'source'],
		adversaries: lore ? ['name', 'type', 'habitat', 'source'] : ['level', 'name', 'type', 'role', 'habitat', 'hp', 'source'],
		npcs: ['name', 'campaign'],
		companions: ['kind', 'name', 'class'],
		spells: ['tier', 'school', 'name', 'class', 'source'],
		items: ['category', 'name', 'die', 'price', 'stat'],
		features: ['class', 'name', 'level', 'group', 'source'],
		classes: ['kind', 'name', 'class', 'complexity', 'source'],
		origins: ['kind', 'name', 'size', 'rarity'],
		rules: ['topic', 'name'],
	};
		return keys[seg];
	},
	kindLabel: kind => ENTRY_KIND_LABEL[kind as Entry['kind']] ?? kind,
	noun(seg, n) {
		const w = NOUN[seg] ?? 'entry';
		return `${n} ${n === 1 ? w : w === 'entry' ? 'entries' : `${w}s`}`;
	},
	wordNums: { cantrip: 0, cantrips: 0, min: 0, minion: 0 },
	valueAlias(key, b) {
		if (key === 'die') return b.replace(/^\d*d?(\d+)$/, 'd$1');
		if (key === 'stat') return STAT_WORDS[b] ?? b;
		return b;
	},
	names: e => e.npc?.aliases ?? [],
	// Ties break on the tab's natural order: level then name for monsters, tier then name for spells…
	tieBreak: (a, b) => (a.nums.level ?? a.nums.tier ?? 0) - (b.nums.level ?? b.nums.tier ?? 0) || a.name.localeCompare(b.name),
	numText: (key, n) => (key === 'tier' ? tierLabel(n) : String(n)),
	tokenValue: (key, v) => (key === 'tier' ? (v === 'Cantrip' ? 'cantrip' : v.replace(/^Tier\s*/, '')) : v),
	flagHint: 'minion, concentration…',
};

/** The engine, bound to Nimble's words. */
export const NIMBLE_QUERY = createCompendiumQuery(NIMBLE_QUERY_SCHEMA);

export const {
	facetByKey, segmentFromWord, sortByKey, sortsFor, valueMatches, isCompleteValue, canonicalKey, isKnownKey, parseFilterToken, parseQuery,
	passesFilters, textScore, compareBy, compareChain, search, facetsIn, facetCounts, suggest, finishedFilters, parseRange,
} = NIMBLE_QUERY;
