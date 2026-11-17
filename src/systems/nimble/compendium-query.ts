// The compendium's search language. Pure: no Obsidian imports.
//
//   goblin                 names first, then anything mentioning it (fuzzy: "fireblal" finds Fireball)
//   "lay on hands"         a phrase
//   type:goblin            a facet: Goblins (values match by prefix, plurals don't matter)
//   school:fire,ice        either value
//   -school:fire  !role:minion   not
//   level:3  level:>=5  level:2-4  tier:cantrip   numbers
//   is:minion  is:concentration  is:draft          flags
//   tag:light              any facet value or flag
//   in:spells              switch tabs
//   sort:level  sort:-tier  order the list (- for descending)
//   sort:level,name        several keys: level, then name within a level (or several sort: tokens)
//
// suggest() completes what's being typed: keys ("sch" → school:), values
// ("type:gob" → type:Goblins, with counts) and, for a bare word, the filters
// it could mean ("fire" → school:Fire), the way mail apps offer "in:trash".

import { Entry, Segment, SEGMENTS, ENTRY_KIND_LABEL, inSegment } from './compendium-entries';
import { nameKey, tierLabel } from './compendium';

export interface FacetDef {
	key: string;
	label: string;
	aliases?: string[];
	numeric?: boolean;
	/** Example values, shown beside the key suggestion. */
	hint: string;
}

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

/** Keys that aren't facets. */
const SPECIAL = { is: ['is', 'has'], in: ['in', 'tab'], sort: ['sort', 'by', 'order'] };

export function facetByKey(key: string): FacetDef | undefined {
	const k = key.toLowerCase();
	return FACETS.find(f => f.key === k || f.aliases?.includes(k));
}

function specialKey(key: string): 'is' | 'in' | 'sort' | undefined {
	const k = key.toLowerCase();
	return (Object.keys(SPECIAL) as (keyof typeof SPECIAL)[]).find(s => SPECIAL[s].includes(k));
}

/** Is `value` a whole value for this key among these entries ("weapon" for category, "3" or ">5" for level)? */
export function isCompleteValue(entries: Entry[], key: string, value: string): boolean {
	const v = value.trim();
	if (!v) return false;
	const k = key.replace(/^[-!]/, '');
	const special = specialKey(k);
	if (special === 'in') return !!segmentFromWord(v);
	if (special === 'sort') return v.split(',').every(x => !!sortByKey(x.trim().replace(/^-/, '')));
	if (special === 'is') return entries.some(e => e.flags.some(f => nameKey(f) === nameKey(v)));
	const f = facetByKey(k);
	if (!f) return false;
	if (f.numeric) return !!parseRange(v);
	const want = norm(v);
	return entries.some(e => (e.facets[f.key] ?? []).some(x => norm(x) === want || norm(x) === `${want}s`));
}

/** The key a filter is stored under ("lvl" → "level", "has" → "is"), or undefined for an unknown key. */
export function canonicalKey(key: string): string | undefined {
	return facetByKey(key)?.key ?? specialKey(key);
}

export function isKnownKey(key: string): boolean {
	return !!facetByKey(key) || !!specialKey(key);
}

// ----------------------------------------------------------------------------
// Parsing

export interface Filter {
	/** Canonical facet key, or 'is'. */
	key: string;
	values: string[];
	negate: boolean;
	/** Numeric facets: the comparison. */
	range?: { min: number; max: number };
	/** The token as typed. */
	raw: string;
}

export interface ParsedQuery {
	/** Free words, lower-cased (a quoted phrase is one word). */
	words: string[];
	filters: Filter[];
	/** Sort keys in order of importance (several sort: tokens, or sort:level,name). */
	sorts: SortSpec[];
	segment?: Segment;
}

export interface Token {
	text: string;
	start: number;
	end: number;
}

/** Split on spaces, keeping quoted phrases (and key:"quoted values") whole. */
export function tokenize(input: string): Token[] {
	const out: Token[] = [];
	const re = /(?:[-!]?[a-z]+:)?"[^"]*"?|\S+/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
	return out;
}

const unquote = (s: string) => s.replace(/^"|"$/g, '');
export const quoteValue = (v: string) => (/[\s,]/.test(v) ? `"${v}"` : v);

const WORD_NUMS: Record<string, number> = { cantrip: 0, cantrips: 0, min: 0, minion: 0 };

/** "3" → 3..3, ">5" → 5+ (exclusive), ">=5", "<3", "2-4", "2..4", "1/2", "cantrip" → 0. */
export function parseRange(v: string): { min: number; max: number } | undefined {
	const s = v.trim().toLowerCase().replace(/^tier\s*/, '');
	const num = (x: string): number | undefined => {
		if (x in WORD_NUMS) return WORD_NUMS[x];
		const f = x.match(/^(\d+)\s*\/\s*(\d+)$/);
		if (f) return Number(f[1]) / Number(f[2]);
		return /^\d+(\.\d+)?$/.test(x) ? Number(x) : undefined;
	};
	const cmp = s.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
	if (!cmp) return undefined;
	const range = cmp[2].match(/^(.+?)\s*(?:-|\.\.|–|to)\s*(.+)$/);
	if (range && !cmp[1]) {
		const a = num(range[1]), b = num(range[2]);
		return a !== undefined && b !== undefined ? { min: Math.min(a, b), max: Math.max(a, b) } : undefined;
	}
	const n = num(cmp[2]);
	if (n === undefined) return undefined;
	switch (cmp[1]) {
		case '>': return { min: n + 1e-6, max: Infinity };
		case '>=': return { min: n, max: Infinity };
		case '<': return { min: -Infinity, max: n - 1e-6 };
		case '<=': return { min: -Infinity, max: n };
		default: return { min: n, max: n };
	}
}

/** A token as a filter, or null when it's a plain word (unknown key or no value yet). */
export interface SortSpec { key: string; desc: boolean }

export function parseFilterToken(text: string): Filter | { sorts: SortSpec[] } | { segment: Segment } | null {
	const m = text.match(/^([-!]?)([a-z]+):(.*)$/i);
	if (!m || !m[3]) return null;
	const negate = !!m[1];
	const value = unquote(m[3]);
	if (!value) return null;
	const special = specialKey(m[2]);
	if (special === 'in') {
		const seg = segmentFromWord(value);
		return seg ? { segment: seg } : null;
	}
	if (special === 'sort') {
		const sorts = value.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ def: sortByKey(v.replace(/^-/, '')), desc: v.startsWith('-') }))
			.filter((x): x is { def: SortDef; desc: boolean } => !!x.def).map(x => ({ key: x.def.key, desc: x.desc }));
		return sorts.length ? { sorts } : null;
	}
	if (special === 'is') return { key: 'is', values: value.split(',').map(x => x.trim()).filter(Boolean), negate, raw: text };
	const f = facetByKey(m[2]);
	if (!f) return null;
	if (f.numeric) {
		const range = parseRange(value);
		return range ? { key: f.key, values: [value], negate, range, raw: text } : null;
	}
	return { key: f.key, values: value.split(',').map(x => x.trim()).filter(Boolean), negate, raw: text };
}

export function segmentFromWord(word: string): Segment | undefined {
	const w = word.toLowerCase();
	return SEGMENTS.find(s => s.id === w || s.words.includes(w) || s.words.some(x => x.startsWith(w) && w.length >= 3))?.id;
}

export function parseQuery(input: string): ParsedQuery {
	const out: ParsedQuery = { words: [], filters: [], sorts: [] };
	for (const t of tokenize(input)) {
		const f = parseFilterToken(t.text);
		if (!f) {
			const w = unquote(t.text).toLowerCase().replace(/[’‘]/g, '\'').trim();
			if (w && !/^[-!]?[a-z]+:$/i.test(t.text)) out.words.push(w);
			continue;
		}
		if ('sorts' in f) out.sorts.push(...f.sorts.filter(x => !out.sorts.some(y => y.key === x.key)));
		else if ('segment' in f) out.segment = f.segment;
		else out.filters.push(f);
	}
	return out;
}

// ----------------------------------------------------------------------------
// Matching

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, '\'').trim();
const STAT_WORDS: Record<string, string> = { strength: 'str', dexterity: 'dex', intelligence: 'int', will: 'wil', willpower: 'wil', wisdom: 'wil' };

/** Does facet value `have` match what was typed? Prefix, word start, or the same letters ignoring punctuation; plurals don't matter. */
export function valueMatches(have: string, typed: string, key?: string): boolean {
	const a = norm(have);
	let b = norm(typed);
	if (!b) return false;
	if (key === 'die') b = b.replace(/^\d*d?(\d+)$/, 'd$1');
	if (key === 'stat') b = STAT_WORDS[b] ?? b;
	const tries = [b];
	if (b.length > 3 && b.endsWith('s')) tries.push(b.slice(0, -1));
	if (b.length > 4 && b.endsWith('es')) tries.push(b.slice(0, -2));
	return tries.some(t => a === t || a.startsWith(t) || ` ${a}`.includes(` ${t}`) || (nameKey(t).length > 0 && nameKey(a).startsWith(nameKey(t))));
}

function facetValues(e: Entry, key: string): string[] {
	if (key === 'tag') return [...Object.values(e.facets).flat(), ...e.flags];
	return e.facets[key] ?? [];
}

function flagMatches(e: Entry, v: string): boolean {
	const k = nameKey(v);
	if (!k) return false;
	const plural = k.endsWith('s') ? k.slice(0, -1) : k;
	if (e.flags.some(f => nameKey(f) === k || nameKey(f) === plural)) return true;
	// is:spell, is:monster, is:npc: the kind.
	const kinds = [e.kind, ENTRY_KIND_LABEL[e.kind]].map(nameKey);
	return kinds.includes(k) || kinds.includes(plural) || (k === 'monster' && e.kind === 'monster');
}

function filterMatches(e: Entry, f: Filter): boolean {
	if (f.key === 'is') return f.values.some(v => flagMatches(e, v));
	if (f.range) {
		const n = e.nums[f.key];
		return n !== undefined && n >= f.range.min && n <= f.range.max;
	}
	const have = facetValues(e, f.key);
	return f.values.some(v => have.some(h => valueMatches(h, v, f.key)));
}

/** Filters of the same key are alternatives (school:fire school:ice); different keys all apply. */
export function passesFilters(e: Entry, filters: Filter[]): boolean {
	const byKey = new Map<string, Filter[]>();
	for (const f of filters) {
		if (f.negate) { if (filterMatches(e, f)) return false; continue; }
		byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
	}
	for (const list of byKey.values()) if (!list.some(f => filterMatches(e, f))) return false;
	return true;
}

/** Letters of `q` in order inside `s`, with a score that prefers tight, early runs. */
export function subsequenceScore(s: string, q: string): number | null {
	let i = 0, gaps = 0, last = -1, first = -1;
	for (const ch of q) {
		const at = s.indexOf(ch, i);
		if (at < 0) return null;
		if (first < 0) first = at;
		if (last >= 0) gaps += at - last - 1;
		last = at;
		i = at + 1;
	}
	return gaps + first * 0.5;
}

/** Edit distance with transpositions, giving up past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		let rowMin = Infinity;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			rowMin = Math.min(rowMin, d[i][j]);
		}
		if (rowMin > max) return max + 1;
	}
	return d[a.length][b.length];
}

/** How well one typed word matches a name: lower is better, null is no match. */
function nameWordScore(name: string, w: string): number | null {
	const i = name.indexOf(w);
	if (i === 0) return 1;
	if (i > 0 && /[\s\-_:(/'"]/.test(name[i - 1])) return 2;
	if (i > 0) return 3;
	const kn = nameKey(name), kw = nameKey(w);
	if (kw && kn.includes(kw)) return 3.5;
	if (w.length >= 4) {
		const max = w.length >= 7 ? 2 : 1;
		const parts = name.split(/[\s\-/(),:]+/).filter(Boolean);
		if (parts.some(part => editDistance(part, w, max) <= max)) return 5;
		// Still typing, with a slip: "zomv" for "zomb…".
		if (parts.some(part => part.length > w.length && editDistance(part.slice(0, w.length), w, 1) <= 1)) return 5.2;
		const sub = subsequenceScore(kn, kw);
		if (sub !== null && sub <= w.length) return 5.5 + sub * 0.1;
	}
	return null;
}

/**
 * How well some names (a title, aliases) match what was typed, forgiving typos:
 * lower is better, null is no match. `fuzzy` says a word only matched by
 * spelling it differently ("zombieq" → Zombie), so callers can keep such
 * hits behind real ones.
 */
export function nameMatch(texts: string[], query: string): { score: number; fuzzy: boolean } | null {
	const words = norm(query).split(/\s+/).filter(Boolean);
	if (!words.length) return { score: 0, fuzzy: false };
	const names = texts.filter(Boolean).map(norm);
	let total = 0;
	let fuzzy = false;
	for (const w of words) {
		let best: number | null = null;
		for (const n of names) {
			const s = nameWordScore(n, w);
			if (s !== null && (best === null || s < best)) best = s;
		}
		if (best === null) return null;
		if (best >= 5) fuzzy = true;
		total += best;
	}
	const first = names[0] ?? '';
	const phrase = words.join(' ');
	if (first === phrase) total -= 20;
	else if (first.startsWith(phrase)) total -= 5;
	return { score: total + first.length * 0.002, fuzzy };
}

/** Items ranked by nameMatch; typo-only matches come after real ones, and only when there are no real ones unless `keepFuzzy`. */
export function fuzzyRank<T>(items: T[], query: string, texts: (item: T) => string[], limit: number, keepFuzzy = false): { item: T; fuzzy: boolean }[] {
	const scored: { item: T; s: number; fuzzy: boolean }[] = [];
	for (const item of items) {
		const m = nameMatch(texts(item), query);
		if (m) scored.push({ item, s: m.score + (m.fuzzy ? 100 : 0), fuzzy: m.fuzzy });
	}
	scored.sort((a, b) => a.s - b.s);
	const real = scored.filter(x => !x.fuzzy);
	return (real.length && !keepFuzzy ? real : scored).slice(0, limit).map(x => ({ item: x.item, fuzzy: x.fuzzy }));
}

/**
 * Relevance of an entry to the free words: lower is better, null when a word
 * matches nothing. Names (and NPC aliases) count most; then the detail line and
 * facets; then the rules or ability text.
 */
export function textScore(e: Entry, words: string[], phrase: string): number | null {
	if (!words.length) return 0;
	const names = [norm(e.name), ...(e.npc?.aliases ?? []).map(norm)];
	let total = 0;
	for (const w of words) {
		let best: number | null = null;
		for (const n of names) {
			const s = nameWordScore(n, w);
			if (s !== null && (best === null || s < best)) best = s;
		}
		if (best === null) {
			const facetText = norm(`${e.detail} ${Object.values(e.facets).flat().join(' ')}`);
			if (` ${facetText}`.includes(` ${w}`)) best = 6;
			else if (facetText.includes(w)) best = 6.5;
			else if (e.text.includes(w)) best = 8;
		}
		if (best === null) return null;
		total += best;
	}
	const n = names[0];
	if (n === phrase) total -= 20;
	else if (n.startsWith(phrase)) total -= 5;
	return total + n.length * 0.002;
}

// ----------------------------------------------------------------------------
// Sorting

export interface SortDef {
	key: string;
	label: string;
	aliases?: string[];
	/** Sort value: numbers sort numerically, strings by locale; undefined sinks to the end. */
	value?: (e: Entry) => string | number | undefined;
	/** Heading for a run of entries (sorts that group). */
	group?: (e: Entry) => string;
}

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

export function sortByKey(key: string): SortDef | undefined {
	const k = key.toLowerCase();
	return SORTS.find(s => s.key === k || s.aliases?.includes(k));
}

/** The sorts each tab offers, the first being its default when nothing is typed. */
export function sortsFor(seg: Segment, lore = false): SortDef[] {
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
	return [SORTS[0], ...keys[seg].map(k => sortByKey(k)!).filter(Boolean)];
}

/** Ties break on the tab's natural order: level then name for monsters, tier then name for spells… */
function tieBreak(a: Entry, b: Entry): number {
	return (a.nums.level ?? a.nums.tier ?? 0) - (b.nums.level ?? b.nums.tier ?? 0) || a.name.localeCompare(b.name);
}

export function compareBy(sort: SortDef, desc: boolean): (a: Entry, b: Entry) => number {
	const get = sort.value;
	if (!get) return tieBreak;
	return (a, b) => {
		const x = get(a), y = get(b);
		if (x === undefined && y === undefined) return tieBreak(a, b);
		if (x === undefined) return 1;
		if (y === undefined) return -1;
		const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
		return (desc ? -c : c) || tieBreak(a, b);
	};
}

// ----------------------------------------------------------------------------
// Search

export interface SearchOptions {
	segment: Segment;
	/** Sorts picked in the UI, most important first (sort: tokens win). */
	sorts?: SortSpec[];
	/** One sort picked in the UI (shorthand for `sorts: [{ key: sort, desc }]`). */
	sort?: string;
	desc?: boolean;
	lore?: boolean;
	/** The modal's own restriction (only monsters, only spells…). */
	only?: (e: Entry) => boolean;
	limit?: number;
}

export interface SearchResult {
	entries: Entry[];
	/** Matches before the limit. */
	total: number;
	parsed: ParsedQuery;
	segment: Segment;
	/** The sort chain in effect, most important first. */
	chain: { def: SortDef; desc: boolean }[];
	/** The first sort (what the headings follow). */
	sort: SortDef;
	desc: boolean;
	/** Headings between runs of entries (a grouping sort with nothing typed). */
	grouped: boolean;
}

/** Compare by each sort in turn; ties after the last fall back to the tab's natural order. */
export function compareChain(chain: { def: SortDef; desc: boolean }[]): (a: Entry, b: Entry) => number {
	const cmps = chain.filter(c => c.def.value).map(c => ({ get: c.def.value!, desc: c.desc }));
	return (a, b) => {
		for (const { get, desc } of cmps) {
			const x = get(a), y = get(b);
			if (x === undefined && y === undefined) continue;
			if (x === undefined) return 1;
			if (y === undefined) return -1;
			const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
			if (c) return desc ? -c : c;
		}
		return tieBreak(a, b);
	};
}

export function search(all: Entry[], query: string, o: SearchOptions): SearchResult {
	const parsed = parseQuery(query);
	const segment = parsed.segment ?? o.segment;
	const phrase = parsed.words.join(' ');
	const scored: { e: Entry; s: number }[] = [];
	for (const e of all) {
		if (!inSegment(e, segment) || (o.only && !o.only(e))) continue;
		if (!passesFilters(e, parsed.filters)) continue;
		const s = textScore(e, parsed.words, phrase);
		if (s !== null) scored.push({ e, s });
	}
	const offered = sortsFor(segment, o.lore);
	const asked: SortSpec[] = parsed.sorts.length ? parsed.sorts : o.sorts?.length ? o.sorts : o.sort ? [{ key: o.sort, desc: !!o.desc }] : [];
	let chain = asked.map(x => ({ def: sortByKey(x.key)!, desc: x.desc })).filter(x => !!x.def);
	// Nothing picked: best match while words are typed, else the tab's natural order.
	if (!chain.length) chain = [{ def: parsed.words.length ? SORTS[0] : offered[1] ?? SORTS[1], desc: false }];
	// Best match only makes sense with words; without them it means the tab's order.
	if (chain[0].def.key === 'relevance' && !parsed.words.length) chain = [{ def: offered[1] ?? SORTS[1], desc: false }, ...chain.slice(1)];
	if (chain[0].def.key === 'relevance') {
		const rest = compareChain(chain.slice(1));
		scored.sort((a, b) => a.s - b.s || rest(a.e, b.e));
	} else {
		const cmp = compareChain(chain);
		scored.sort((a, b) => cmp(a.e, b.e));
	}
	const total = scored.length;
	const entries = (o.limit ? scored.slice(0, o.limit) : scored).map(x => x.e);
	const head = chain[0];
	return { entries, total, parsed, segment, chain, sort: head.def, desc: head.desc, grouped: !!head.def.group && head.def.key !== 'name' };
}

// ----------------------------------------------------------------------------
// Suggestions

export interface Suggestion {
	kind: 'key' | 'value' | 'flag' | 'segment' | 'sort';
	/** What replaces the token being typed. Ends with ":" for a key (keep typing). */
	token: string;
	/** "school:Fire". */
	label: string;
	/** "13 spells", "Filter by school". */
	detail: string;
	count?: number;
}

/** Facets that have values among these entries. */
export function facetsIn(pool: Entry[]): FacetDef[] {
	const have = new Set<string>();
	for (const e of pool) {
		for (const [k, v] of Object.entries(e.facets)) if (v.length) have.add(k);
		for (const k of Object.keys(e.nums)) have.add(k);
	}
	return FACETS.filter(f => have.has(f.key) || f.key === 'tag');
}

/** Values of a facet among these entries, with how many have each. */
export function facetCounts(pool: Entry[], key: string): { value: string; count: number }[] {
	const counts = new Map<string, { value: string; count: number }>();
	const f = facetByKey(key);
	for (const e of pool) {
		const vals = f?.numeric ? (e.nums[f.key] !== undefined ? [key === 'tier' ? tierLabel(e.nums[f.key]) : String(e.nums[f.key])] : []) : facetValues(e, key);
		for (const v of new Set(vals)) {
			const k = v.toLowerCase();
			const c = counts.get(k) ?? { value: v, count: 0 };
			c.count++;
			counts.set(k, c);
		}
	}
	const list = [...counts.values()];
	if (f?.numeric) return list.sort((a, b) => (parseRange(a.value)?.min ?? 0) - (parseRange(b.value)?.min ?? 0));
	return list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const noun = (seg: Segment, n: number) => {
	const one: Partial<Record<Segment, string>> = { adversaries: 'monster', spells: 'spell', items: 'item', features: 'feature', npcs: 'NPC', classes: 'entry', rules: 'entry', origins: 'entry', companions: 'entry' };
	const w = one[seg] ?? 'entry';
	return `${n} ${n === 1 ? w : w === 'entry' ? 'entries' : `${w}s`}`;
};

/**
 * Completions for the token being typed. `pool` is what the other filters
 * already leave (so counts are honest); `segment` is the tab.
 */
export function suggest(token: string, pool: Entry[], segment: Segment, o: { lore?: boolean; segments?: boolean; limit?: number; applied?: string[] } = {}): Suggestion[] {
	const limit = o.limit ?? 6;
	// Filters already applied aren't offered again.
	const applied = new Set((o.applied ?? []).map(a => a.toLowerCase().replace(/"/g, '')));
	const fresh = (s: Suggestion) => !applied.has(s.token.toLowerCase().replace(/"/g, ''));
	return suggestAll(token, pool, segment, o, limit * 2).filter(fresh).slice(0, limit);
}

function suggestAll(token: string, pool: Entry[], segment: Segment, o: { lore?: boolean; segments?: boolean }, limit: number): Suggestion[] {
	const t = token.trim();
	if (!t) return [];
	const m = t.match(/^([-!]?)([a-z]+):(.*)$/i);
	if (m) {
		const [, neg, key, rawVal] = m;
		const val = unquote(rawVal);
		const special = specialKey(key);
		if (special === 'in') {
			if (o.segments === false) return [];
			return SEGMENTS.filter(s => !val || s.words.some(w => w.startsWith(val.toLowerCase())) || s.id.startsWith(val.toLowerCase()))
				.map(s => ({ kind: 'segment' as const, token: `in:${s.id}`, label: `in:${s.id}`, detail: `Switch to ${o.lore && s.playerLabel ? s.playerLabel : s.label}` })).slice(0, limit);
		}
		if (special === 'sort') {
			const desc = val.startsWith('-');
			const v = val.replace(/^-/, '').toLowerCase();
			return sortsFor(segment, o.lore).filter(s => !v || s.key.startsWith(v) || s.aliases?.some(a => a.startsWith(v)) || s.label.toLowerCase().startsWith(v))
				.map(s => ({ kind: 'sort' as const, token: `sort:${desc ? '-' : ''}${s.key}`, label: `sort:${desc ? '-' : ''}${s.key}`, detail: `Sort by ${s.label.toLowerCase()}${desc ? ', descending' : ''}` })).slice(0, limit);
		}
		if (special === 'is') {
			return flagCounts(pool).filter(f => !val || f.value.startsWith(val.toLowerCase()))
				.map(f => ({ kind: 'flag' as const, token: `${neg}is:${f.value}`, label: `${neg}is:${f.value}`, detail: noun(segment, f.count), count: f.count })).slice(0, limit);
		}
		const f = facetByKey(key);
		if (!f) return [];
		const vals = facetCounts(pool, f.key);
		const typed = val.replace(/^[<>=]+/, '');
		const hits = f.numeric
			? vals.filter(v => !typed || v.value.toLowerCase().startsWith(typed.toLowerCase()))
			: vals.filter(v => !val || valueMatches(v.value, val, f.key));
		// A numeric comparison being typed ("level:>5") is already a complete filter.
		if (f.numeric && /^[<>=]/.test(val) && parseRange(val)) return [{ kind: 'value', token: `${neg}${f.key}:${val}`, label: `${neg}${f.key}:${val}`, detail: `${f.label} ${val}` }];
		// The value typed exactly ("type:undead" → Undead) leads; then the most common.
		if (val && !f.numeric) hits.sort((a, b) => Number(norm(b.value) === norm(val)) - Number(norm(a.value) === norm(val)));
		return hits.slice(0, limit).map(v => {
			const value = f.key === 'tier' ? (v.value === 'Cantrip' ? 'cantrip' : v.value.replace(/^Tier\s*/, '')) : v.value;
			return { kind: 'value' as const, token: `${neg}${f.key}:${quoteValue(value)}`, label: `${neg}${f.key}:${value}`, detail: noun(segment, v.count), count: v.count };
		});
	}
	if (/[:"]/.test(t) || t.startsWith('-') && t.length < 2) return [];
	const word = t.replace(/^[-!]/, '').toLowerCase();
	const neg = t.length > word.length ? t[0] : '';
	const out: Suggestion[] = [];
	const facets = facetsIn(pool).filter(f => f.key !== 'kind' || segment === 'all');
	// Keys: "sch" → school:
	for (const f of facets) {
		const names = [f.key, ...(f.aliases ?? [])];
		const hit = names.find(n => n.startsWith(word));
		if (hit && word.length >= 2) out.push({ kind: 'key', token: `${neg}${f.key}:`, label: `${neg}${f.key}:`, detail: `Filter by ${f.label.toLowerCase()}${f.hint ? ` (${f.hint})` : ''}` });
	}
	for (const [k, names] of Object.entries(SPECIAL)) {
		if (word.length >= 2 && names.some(n => n.startsWith(word)) && !(k === 'in' && o.segments === false)) {
			out.push({ kind: 'key', token: `${k}:`, label: `${k}:`, detail: k === 'is' ? 'Filter by a flag (minion, concentration…)' : k === 'in' ? 'Switch tab' : 'Sort the list' });
		}
	}
	// Values a bare word could mean: "fire" → school:Fire, "goblin" → type:Goblins.
	if (word.length >= 3) {
		const values: Suggestion[] = [];
		for (const f of facets) {
			if (f.numeric || f.key === 'tag' || f.key === 'source' && segment !== 'all') continue;
			for (const v of facetCounts(pool, f.key)) {
				if (!valueMatches(v.value, word, f.key)) continue;
				values.push({ kind: 'value', token: `${neg}${f.key}:${quoteValue(v.value)}`, label: `${neg}${f.key}:${v.value}`, detail: noun(segment, v.count), count: v.count });
			}
		}
		for (const fl of flagCounts(pool)) {
			if (fl.value.startsWith(word) && fl.value.length > 2) values.push({ kind: 'flag', token: `${neg}is:${fl.value}`, label: `${neg}is:${fl.value}`, detail: noun(segment, fl.count), count: fl.count });
		}
		// Exact value first ("fire" → school:Fire before damage:Fire Giant), then the most common.
		const exact = (s: Suggestion) => (norm(s.label.replace(/^[-!]?[a-z]+:/, '')) === word ? 0 : 1);
		values.sort((a, b) => exact(a) - exact(b) || (b.count ?? 0) - (a.count ?? 0));
		out.push(...values);
		if (o.segments !== false) {
			const seg = SEGMENTS.find(s => s.id !== segment && s.words.some(w => w.startsWith(word)));
			if (seg) out.push({ kind: 'segment', token: `in:${seg.id}`, label: `in:${seg.id}`, detail: `Switch to ${o.lore && seg.playerLabel ? seg.playerLabel : seg.label}` });
		}
	}
	const seen = new Set<string>();
	return out.filter(s => !seen.has(s.label.toLowerCase()) && !!seen.add(s.label.toLowerCase())).slice(0, limit);
}

function flagCounts(pool: Entry[]): { value: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const e of pool) for (const f of new Set(e.flags)) counts.set(f, (counts.get(f) ?? 0) + 1);
	return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The token around the caret (what suggest() completes), or null between tokens. */
export function tokenAt(input: string, caret: number): Token | null {
	return tokenize(input).find(t => caret >= t.start && caret <= t.end) ?? null;
}

/** Replace the token at the caret with `text`; a finished filter gets a trailing space. Returns the new value and caret. */
export function applySuggestion(input: string, caret: number, s: Suggestion): { value: string; caret: number } {
	const t = tokenAt(input, caret) ?? { text: '', start: caret, end: caret };
	const tail = s.kind === 'key' ? '' : ' ';
	const before = input.slice(0, t.start);
	const after = input.slice(t.end).replace(/^\s+/, '');
	const value = `${before}${s.token}${tail}${after}`;
	return { value, caret: before.length + s.token.length + tail.length };
}

/** Complete filters in the text (not the one at the caret) that should become chips. */
export function finishedFilters(input: string, caret: number): Token[] {
	return tokenize(input).filter(t => (caret < t.start || caret > t.end) && parseFilterToken(t.text) !== null);
}
