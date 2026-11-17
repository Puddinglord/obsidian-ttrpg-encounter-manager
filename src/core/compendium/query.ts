// The compendium's search language, for every game system. Pure: no Obsidian imports.
//
//   goblin                 names first, then anything mentioning it (fuzzy: "fireblal" finds Fireball)
//   "lay on hands"         a phrase
//   type:goblin            a facet (values match by prefix, plurals don't matter)
//   school:fire,ice        either value
//   -school:fire  !role:minion   not
//   level:3  level:>=5  level:2-4   numbers
//   is:minion  is:concentration     flags
//   tag:light              any facet value or flag
//   in:spells              switch tabs
//   sort:level  sort:-cr   order the list (- for descending)
//   sort:level,name        several keys: level, then name within a level (or several sort: tokens)
//
// A game system says what its entries look like (`CompendiumEntry`) and gives
// its words in a `QuerySchema`: the tabs, the facets you can filter on, the
// sorts each tab offers. `createCompendiumQuery(schema)` returns the search,
// the suggestions and the parsing, bound to those words.
//
// suggest() completes what's being typed: keys ("sch" → school:), values
// ("type:gob" → type:Goblins, with counts) and, for a bare word, the filters
// it could mean ("fire" → school:Fire), the way mail apps offer "in:trash".

/** One thing in a compendium: a monster, a spell, a rule… Systems extend it with their own data. */
export interface CompendiumEntry {
	/** Unique and stable: "monster:goblin", "spell:fireball". */
	id: string;
	/** "monster", "spell"… (the system's kinds). */
	kind: string;
	/** Every tab it shows in besides All. */
	segments: string[];
	name: string;
	/** A short line under the name. */
	detail: string;
	/** Text on the badge left of the name: a level, a CR. */
	badge?: string;
	/** Facet key → values as shown ("Goblins", "Fire"). */
	facets: Record<string, string[]>;
	/** Numbers for comparisons and sorting: level, cr, price, hp… */
	nums: Record<string, number>;
	/** `is:` words: minion, legendary, concentration… */
	flags: string[];
	/** Lower-cased text beyond the name that a search can find (abilities, rules text). */
	text: string;
}

/** A tab of the compendium. */
export interface SegmentDef<S extends string = string> {
	id: S;
	label: string;
	/** Players look creatures up; they don't fight them. */
	playerLabel?: string;
	icon: string;
	/** Typed as `in:<word>` (any of these). */
	words: string[];
}

export interface FacetDef {
	key: string;
	label: string;
	aliases?: string[];
	numeric?: boolean;
	/** Example values, shown beside the key suggestion. */
	hint: string;
}

export interface SortDef<E extends CompendiumEntry = CompendiumEntry> {
	key: string;
	label: string;
	aliases?: string[];
	/** Sort value: numbers sort numerically, strings by locale; undefined sinks to the end. */
	value?: (e: E) => string | number | undefined;
	/** Heading for a run of entries (sorts that group). */
	group?: (e: E) => string;
}

/** A game system's words for its compendium. */
export interface QuerySchema<E extends CompendiumEntry, S extends string = string> {
	segments: SegmentDef<S>[];
	facets: FacetDef[];
	/** Every sort; the first must be `relevance` (best match). */
	sorts: SortDef<E>[];
	/** The sort keys each tab offers, the first being its order when nothing is typed. */
	sortsFor(segment: S, lore: boolean): string[];
	/** "Spell", for is:spell. */
	kindLabel(kind: string): string;
	/** "3 spells" under a suggestion. */
	noun(segment: S, n: number): string;
	/** Words that stand for numbers in ranges: `cantrip` → 0. */
	wordNums?: Record<string, number>;
	/** What a typed value means for a key ("strength" → "str", "8" → "d8"). */
	valueAlias?(key: string, typed: string): string;
	/** More names a search matches (an NPC's aliases). */
	names?(e: E): string[];
	/** Ties after the sorts: the tab's natural order. */
	tieBreak?(a: E, b: E): number;
	/** A numeric facet's value as shown in suggestions and the filter panel ("Cantrip", "Tier 3", "1/4"). */
	numText?(key: string, n: number): string;
	/** A shown value back as the token's value ("Tier 3" → "3"). */
	tokenValue?(key: string, shown: string): string;
	/** What `is:` filters on, for its key suggestion: "minion, concentration…". */
	flagHint?: string;
}

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

export interface SortSpec { key: string; desc: boolean }

export interface ParsedQuery<S extends string = string> {
	/** Free words, lower-cased (a quoted phrase is one word). */
	words: string[];
	filters: Filter[];
	/** Sort keys in order of importance (several sort: tokens, or sort:level,name). */
	sorts: SortSpec[];
	segment?: S;
}

export interface Token {
	text: string;
	start: number;
	end: number;
}

export interface SearchOptions<E extends CompendiumEntry, S extends string = string> {
	segment: S;
	/** Sorts picked in the UI, most important first (sort: tokens win). */
	sorts?: SortSpec[];
	/** One sort picked in the UI (shorthand for `sorts: [{ key: sort, desc }]`). */
	sort?: string;
	desc?: boolean;
	lore?: boolean;
	/** The caller's own restriction (only monsters, only spells…). */
	only?: (e: E) => boolean;
	limit?: number;
}

export interface SearchResult<E extends CompendiumEntry, S extends string = string> {
	entries: E[];
	/** Matches before the limit. */
	total: number;
	parsed: ParsedQuery<S>;
	segment: S;
	/** The sort chain in effect, most important first. */
	chain: { def: SortDef<E>; desc: boolean }[];
	/** The first sort (what the headings follow). */
	sort: SortDef<E>;
	desc: boolean;
	/** Headings between runs of entries (a grouping sort with nothing typed). */
	grouped: boolean;
}

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

// ----------------------------------------------------------------------------
// The parts that don't depend on a game's words

/** Lower-case letters and digits only: "Lay on Hands" → "layonhands". */
export function nameKey(name: string): string {
	return String(name ?? '').toLowerCase().replace(/[’‘`]/g, '\'').replace(/[^a-z0-9]+/g, '');
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

/** "3" → 3..3, ">5" → 5+ (exclusive), ">=5", "<3", "2-4", "2..4", "1/2", and the schema's words ("cantrip" → 0). */
export function parseRange(v: string, words: Record<string, number> = {}): { min: number; max: number } | undefined {
	const s = v.trim().toLowerCase().replace(/^tier\s*/, '');
	const num = (x: string): number | undefined => {
		if (x in words) return words[x];
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

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, '\'').trim();

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

// ----------------------------------------------------------------------------
// The parts bound to a game's words

/** Keys that aren't facets. */
const SPECIAL = { is: ['is', 'has'], in: ['in', 'tab'], sort: ['sort', 'by', 'order'] };

function specialKey(key: string): 'is' | 'in' | 'sort' | undefined {
	const k = key.toLowerCase();
	return (Object.keys(SPECIAL) as (keyof typeof SPECIAL)[]).find(s => SPECIAL[s].includes(k));
}

export type CompendiumQuery<E extends CompendiumEntry, S extends string = string> = ReturnType<typeof createCompendiumQuery<E, S>>;

export function createCompendiumQuery<E extends CompendiumEntry, S extends string = string>(schema: QuerySchema<E, S>) {
	const { facets: FACETS, sorts: SORTS, segments: SEGMENTS } = schema;
	const words = schema.wordNums ?? {};
	const range = (v: string) => parseRange(v, words);
	const shownNum = (key: string, n: number) => schema.numText?.(key, n) ?? String(n);
	const tokenValue = (key: string, shown: string) => schema.tokenValue?.(key, shown) ?? shown;

	function facetByKey(key: string): FacetDef | undefined {
		const k = key.toLowerCase();
		return FACETS.find(f => f.key === k || f.aliases?.includes(k));
	}

	function inSegment(e: E, seg: S): boolean {
		return seg === 'all' || e.segments.includes(seg);
	}

	function segmentDef(id: S): SegmentDef<S> {
		return SEGMENTS.find(s => s.id === id) ?? SEGMENTS[0];
	}

	function segmentFromWord(word: string): S | undefined {
		const w = word.toLowerCase();
		return SEGMENTS.find(s => s.id === w || s.words.includes(w) || s.words.some(x => x.startsWith(w) && w.length >= 3))?.id;
	}

	function sortByKey(key: string): SortDef<E> | undefined {
		const k = key.toLowerCase();
		return SORTS.find(s => s.key === k || s.aliases?.includes(k));
	}

	/** The sorts each tab offers, the first being its default when nothing is typed. */
	function sortsFor(seg: S, lore = false): SortDef<E>[] {
		return [SORTS[0], ...schema.sortsFor(seg, lore).map(k => sortByKey(k)).filter((d): d is SortDef<E> => !!d)];
	}

	/** Does facet value `have` match what was typed? Prefix, word start, or the same letters ignoring punctuation; plurals don't matter. */
	function valueMatches(have: string, typed: string, key?: string): boolean {
		const a = norm(have);
		let b = norm(typed);
		if (!b) return false;
		if (key && schema.valueAlias) b = schema.valueAlias(key, b);
		const tries = [b];
		if (b.length > 3 && b.endsWith('s')) tries.push(b.slice(0, -1));
		if (b.length > 4 && b.endsWith('es')) tries.push(b.slice(0, -2));
		return tries.some(t => a === t || a.startsWith(t) || ` ${a}`.includes(` ${t}`) || (nameKey(t).length > 0 && nameKey(a).startsWith(nameKey(t))));
	}

	/** Is `value` a whole value for this key among these entries ("weapon" for category, "3" or ">5" for level)? */
	function isCompleteValue(entries: E[], key: string, value: string): boolean {
		const v = value.trim();
		if (!v) return false;
		const k = key.replace(/^[-!]/, '');
		const special = specialKey(k);
		if (special === 'in') return !!segmentFromWord(v);
		if (special === 'sort') return v.split(',').every(x => !!sortByKey(x.trim().replace(/^-/, '')));
		if (special === 'is') return entries.some(e => e.flags.some(f => nameKey(f) === nameKey(v)));
		const f = facetByKey(k);
		if (!f) return false;
		if (f.numeric) return !!range(v);
		const want = norm(v);
		return entries.some(e => (e.facets[f.key] ?? []).some(x => norm(x) === want || norm(x) === `${want}s`));
	}

	/** The key a filter is stored under ("lvl" → "level", "has" → "is"), or undefined for an unknown key. */
	function canonicalKey(key: string): string | undefined {
		return facetByKey(key)?.key ?? specialKey(key);
	}

	function isKnownKey(key: string): boolean {
		return !!facetByKey(key) || !!specialKey(key);
	}

	/** A token as a filter, or null when it's a plain word (unknown key or no value yet). */
	function parseFilterToken(text: string): Filter | { sorts: SortSpec[] } | { segment: S } | null {
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
				.filter((x): x is { def: SortDef<E>; desc: boolean } => !!x.def).map(x => ({ key: x.def.key, desc: x.desc }));
			return sorts.length ? { sorts } : null;
		}
		if (special === 'is') return { key: 'is', values: value.split(',').map(x => x.trim()).filter(Boolean), negate, raw: text };
		const f = facetByKey(m[2]);
		if (!f) return null;
		if (f.numeric) {
			const r = range(value);
			return r ? { key: f.key, values: [value], negate, range: r, raw: text } : null;
		}
		return { key: f.key, values: value.split(',').map(x => x.trim()).filter(Boolean), negate, raw: text };
	}

	function parseQuery(input: string): ParsedQuery<S> {
		const out: ParsedQuery<S> = { words: [], filters: [], sorts: [] };
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

	function facetValues(e: E, key: string): string[] {
		if (key === 'tag') return [...Object.values(e.facets).flat(), ...e.flags];
		return e.facets[key] ?? [];
	}

	function flagMatches(e: E, v: string): boolean {
		const k = nameKey(v);
		if (!k) return false;
		const plural = k.endsWith('s') ? k.slice(0, -1) : k;
		if (e.flags.some(f => nameKey(f) === k || nameKey(f) === plural)) return true;
		// is:spell, is:monster: the kind.
		const kinds = [e.kind, schema.kindLabel(e.kind)].map(nameKey);
		return kinds.includes(k) || kinds.includes(plural);
	}

	function filterMatches(e: E, f: Filter): boolean {
		if (f.key === 'is') return f.values.some(v => flagMatches(e, v));
		if (f.range) {
			const n = e.nums[f.key];
			return n !== undefined && n >= f.range.min && n <= f.range.max;
		}
		const have = facetValues(e, f.key);
		return f.values.some(v => have.some(h => valueMatches(h, v, f.key)));
	}

	/** Filters of the same key are alternatives (school:fire school:ice); different keys all apply. */
	function passesFilters(e: E, filters: Filter[]): boolean {
		const byKey = new Map<string, Filter[]>();
		for (const f of filters) {
			if (f.negate) { if (filterMatches(e, f)) return false; continue; }
			byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
		}
		for (const list of byKey.values()) if (!list.some(f => filterMatches(e, f))) return false;
		return true;
	}

	/**
	 * Relevance of an entry to the free words: lower is better, null when a word
	 * matches nothing. Names (and aliases) count most; then the detail line and
	 * facets; then the rules or ability text.
	 */
	function textScore(e: E, ws: string[], phrase: string): number | null {
		if (!ws.length) return 0;
		const names = [norm(e.name), ...(schema.names?.(e) ?? []).map(norm)];
		let total = 0;
		for (const w of ws) {
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

	const tieBreak = (a: E, b: E): number => (schema.tieBreak ? schema.tieBreak(a, b) : a.name.localeCompare(b.name));

	function compareBy(sort: SortDef<E>, desc: boolean): (a: E, b: E) => number {
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

	/** Compare by each sort in turn; ties after the last fall back to the tab's natural order. */
	function compareChain(chain: { def: SortDef<E>; desc: boolean }[]): (a: E, b: E) => number {
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

	function search(all: E[], query: string, o: SearchOptions<E, S>): SearchResult<E, S> {
		const parsed = parseQuery(query);
		const segment = parsed.segment ?? o.segment;
		const phrase = parsed.words.join(' ');
		const scored: { e: E; s: number }[] = [];
		for (const e of all) {
			if (!inSegment(e, segment) || (o.only && !o.only(e))) continue;
			if (!passesFilters(e, parsed.filters)) continue;
			const s = textScore(e, parsed.words, phrase);
			if (s !== null) scored.push({ e, s });
		}
		const offered = sortsFor(segment, o.lore);
		const byName = sortByKey('name') ?? SORTS[0];
		const asked: SortSpec[] = parsed.sorts.length ? parsed.sorts : o.sorts?.length ? o.sorts : o.sort ? [{ key: o.sort, desc: !!o.desc }] : [];
		let chain = asked.map(x => ({ def: sortByKey(x.key)!, desc: x.desc })).filter(x => !!x.def);
		// Nothing picked: best match while words are typed, else the tab's natural order.
		if (!chain.length) chain = [{ def: parsed.words.length ? SORTS[0] : offered[1] ?? byName, desc: false }];
		// Best match only makes sense with words; without them it means the tab's order.
		if (chain[0].def.key === 'relevance' && !parsed.words.length) chain = [{ def: offered[1] ?? byName, desc: false }, ...chain.slice(1)];
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

	/** Facets that have values among these entries. */
	function facetsIn(pool: E[]): FacetDef[] {
		const have = new Set<string>();
		for (const e of pool) {
			for (const [k, v] of Object.entries(e.facets)) if (v.length) have.add(k);
			for (const k of Object.keys(e.nums)) have.add(k);
		}
		return FACETS.filter(f => have.has(f.key) || f.key === 'tag');
	}

	/** Values of a facet among these entries, with how many have each. */
	function facetCounts(pool: E[], key: string): { value: string; count: number }[] {
		const counts = new Map<string, { value: string; count: number }>();
		const f = facetByKey(key);
		for (const e of pool) {
			const vals = f?.numeric ? (e.nums[f.key] !== undefined ? [shownNum(f.key, e.nums[f.key])] : []) : facetValues(e, key);
			for (const v of new Set(vals)) {
				const k = v.toLowerCase();
				const c = counts.get(k) ?? { value: v, count: 0 };
				c.count++;
				counts.set(k, c);
			}
		}
		const list = [...counts.values()];
		if (f?.numeric) return list.sort((a, b) => (range(tokenValue(f.key, a.value))?.min ?? 0) - (range(tokenValue(f.key, b.value))?.min ?? 0));
		return list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
	}

	function flagCounts(pool: E[]): { value: string; count: number }[] {
		const counts = new Map<string, number>();
		for (const e of pool) for (const f of new Set(e.flags)) counts.set(f, (counts.get(f) ?? 0) + 1);
		return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
	}

	/**
	 * Completions for the token being typed. `pool` is what the other filters
	 * already leave (so counts are honest); `segment` is the tab.
	 */
	function suggest(token: string, pool: E[], segment: S, o: { lore?: boolean; segments?: boolean; limit?: number; applied?: string[] } = {}): Suggestion[] {
		const limit = o.limit ?? 6;
		// Filters already applied aren't offered again.
		const applied = new Set((o.applied ?? []).map(a => a.toLowerCase().replace(/"/g, '')));
		const fresh = (s: Suggestion) => !applied.has(s.token.toLowerCase().replace(/"/g, ''));
		return suggestAll(token, pool, segment, o, limit * 2).filter(fresh).slice(0, limit);
	}

	function segLabel(s: SegmentDef<S>, lore?: boolean): string {
		return lore && s.playerLabel ? s.playerLabel : s.label;
	}

	function suggestAll(token: string, pool: E[], segment: S, o: { lore?: boolean; segments?: boolean }, limit: number): Suggestion[] {
		const t = token.trim();
		if (!t) return [];
		const noun = (n: number) => schema.noun(segment, n);
		const m = t.match(/^([-!]?)([a-z]+):(.*)$/i);
		if (m) {
			const [, neg, key, rawVal] = m;
			const val = unquote(rawVal);
			const special = specialKey(key);
			if (special === 'in') {
				if (o.segments === false) return [];
				return SEGMENTS.filter(s => !val || s.words.some(w => w.startsWith(val.toLowerCase())) || s.id.startsWith(val.toLowerCase()))
					.map(s => ({ kind: 'segment' as const, token: `in:${s.id}`, label: `in:${s.id}`, detail: `Switch to ${segLabel(s, o.lore)}` })).slice(0, limit);
			}
			if (special === 'sort') {
				const desc = val.startsWith('-');
				const v = val.replace(/^-/, '').toLowerCase();
				return sortsFor(segment, o.lore).filter(s => !v || s.key.startsWith(v) || s.aliases?.some(a => a.startsWith(v)) || s.label.toLowerCase().startsWith(v))
					.map(s => ({ kind: 'sort' as const, token: `sort:${desc ? '-' : ''}${s.key}`, label: `sort:${desc ? '-' : ''}${s.key}`, detail: `Sort by ${s.label.toLowerCase()}${desc ? ', descending' : ''}` })).slice(0, limit);
			}
			if (special === 'is') {
				return flagCounts(pool).filter(f => !val || f.value.startsWith(val.toLowerCase()))
					.map(f => ({ kind: 'flag' as const, token: `${neg}is:${f.value}`, label: `${neg}is:${f.value}`, detail: noun(f.count), count: f.count })).slice(0, limit);
			}
			const f = facetByKey(key);
			if (!f) return [];
			const vals = facetCounts(pool, f.key);
			const typed = val.replace(/^[<>=]+/, '');
			const hits = f.numeric
				? vals.filter(v => !typed || v.value.toLowerCase().startsWith(typed.toLowerCase()))
				: vals.filter(v => !val || valueMatches(v.value, val, f.key));
			// A numeric comparison being typed ("level:>5") is already a complete filter.
			if (f.numeric && /^[<>=]/.test(val) && range(val)) return [{ kind: 'value', token: `${neg}${f.key}:${val}`, label: `${neg}${f.key}:${val}`, detail: `${f.label} ${val}` }];
			// The value typed exactly ("type:undead" → Undead) leads; then the most common.
			if (val && !f.numeric) hits.sort((a, b) => Number(norm(b.value) === norm(val)) - Number(norm(a.value) === norm(val)));
			return hits.slice(0, limit).map(v => {
				const value = tokenValue(f.key, v.value);
				return { kind: 'value' as const, token: `${neg}${f.key}:${quoteValue(value)}`, label: `${neg}${f.key}:${value}`, detail: noun(v.count), count: v.count };
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
				out.push({ kind: 'key', token: `${k}:`, label: `${k}:`, detail: k === 'is' ? `Filter by a flag${schema.flagHint ? ` (${schema.flagHint})` : ''}` : k === 'in' ? 'Switch tab' : 'Sort the list' });
			}
		}
		// Values a bare word could mean: "fire" → school:Fire, "goblin" → type:Goblins.
		if (word.length >= 3) {
			const values: Suggestion[] = [];
			for (const f of facets) {
				if (f.numeric || f.key === 'tag' || f.key === 'source' && segment !== 'all') continue;
				for (const v of facetCounts(pool, f.key)) {
					if (!valueMatches(v.value, word, f.key)) continue;
					values.push({ kind: 'value', token: `${neg}${f.key}:${quoteValue(v.value)}`, label: `${neg}${f.key}:${v.value}`, detail: noun(v.count), count: v.count });
				}
			}
			for (const fl of flagCounts(pool)) {
				if (fl.value.startsWith(word) && fl.value.length > 2) values.push({ kind: 'flag', token: `${neg}is:${fl.value}`, label: `${neg}is:${fl.value}`, detail: noun(fl.count), count: fl.count });
			}
			// Exact value first ("fire" → school:Fire before damage:Fire Giant), then the most common.
			const exact = (s: Suggestion) => (norm(s.label.replace(/^[-!]?[a-z]+:/, '')) === word ? 0 : 1);
			values.sort((a, b) => exact(a) - exact(b) || (b.count ?? 0) - (a.count ?? 0));
			out.push(...values);
			if (o.segments !== false) {
				const seg = SEGMENTS.find(s => s.id !== segment && s.words.some(w => w.startsWith(word)));
				if (seg) out.push({ kind: 'segment', token: `in:${seg.id}`, label: `in:${seg.id}`, detail: `Switch to ${segLabel(seg, o.lore)}` });
			}
		}
		const seen = new Set<string>();
		return out.filter(s => !seen.has(s.label.toLowerCase()) && !!seen.add(s.label.toLowerCase())).slice(0, limit);
	}

	/** Complete filters in the text (not the one at the caret) that should become chips. */
	function finishedFilters(input: string, caret: number): Token[] {
		return tokenize(input).filter(t => (caret < t.start || caret > t.end) && parseFilterToken(t.text) !== null);
	}

	/** Does an entry have a value of a facet (for callers building `only`)? */
	function hasFacet(e: E, key: string, value: string): boolean {
		return (e.facets[key] ?? []).some(v => valueMatches(v, value, key));
	}

	return {
		schema, FACETS, SORTS, SEGMENTS,
		facetByKey, inSegment, segmentDef, segmentFromWord, sortByKey, sortsFor, valueMatches, isCompleteValue, canonicalKey, isKnownKey,
		parseFilterToken, parseQuery, passesFilters, textScore, compareBy, compareChain, search, facetsIn, facetCounts, suggest,
		finishedFilters, hasFacet, tokenValue, parseRange: range,
	};
}
