// What a game system puts in Spotlight (app/spotlight.ts), through the contract's
// `spotlight` member. Spotlight keeps what every game has (NPCs, the campaign's
// notes, conditions, commands, dice); the system gives its own things (monsters,
// its compendium), how each row looks and what choosing it does, adding several
// ("3 goblin"), and its compendium's search language for typed filters with chips
// ("school:fire").
//
// No Obsidian at runtime (types only), so the pieces here are unit-tested.

import type { Modal } from 'obsidian';
import type { FilterQuery } from './compendium/filter-field';
import type { CompendiumEntry, CompendiumQuery, Suggestion } from './compendium/query';
import type { SpotlightQuery } from './spotlight-def';

/** How a row looks. Spotlight draws it with its own classes. */
export interface SpotlightLook {
	/** The row's kind, as its class (`spot-<kind>`): "monster", "compendium", "entry". */
	kind: string;
	/** A Lucide icon on the left. */
	icon?: string;
	/** Text in the icon's place instead (a level, a CR). */
	badge?: string;
	/** More classes for the icon slot ("nimble-spot-level", "role-solo", "cmp-spell"). */
	iconClass?: string[];
	title: string;
	/** A "Draft" mark after the title (homebrew still being written). */
	draft?: boolean;
	/** The line under the title. */
	meta?: string;
	/** The tag on the right ("Adversary", "Spell"). */
	tag?: string;
}

/** One of the system's results. */
export interface SpotlightRow {
	look: SpotlightLook;
	/** Names to rank by, the main one first. */
	names: string[];
	/** Secondary text (a monster's group or type, a spell's detail): matches here rank below name matches. */
	others?: string[];
	/** Ties go to the lower group: monsters 0, the compendium 4 (Spotlight's own: people 1, places 2, conditions 3, commands 5). */
	order: number;
	/** Enter (and a click). Return the dialog it opened: closing that with Escape comes back to Spotlight. */
	open(): Modal | void;
	/** Cmd/Ctrl+Enter, keeping Spotlight open with its box cleared (Nimble adds the monster to the fight). Without it, Enter's action. */
	alt?(): void;
}

/** The system's results for a typed name. */
export interface SpotlightResults {
	rows: SpotlightRow[];
	/** The text was a search in the compendium's language ("in:spells fire"): show just these rows, in this order, and the lookup. */
	only?: boolean;
}

/** Typed filters with chips: the system's compendium search language over its entries. */
export interface SpotlightFilters {
	/** The words the chips understand (a bound compendium query). */
	query: FilterQuery;
	/** Is this a whole value for the key? A space after one finishes the chip. */
	isValue(key: string, value: string): boolean;
	/** Filter suggestions for the token being typed, counted against the rest of the query. */
	suggest(token: string, rest: string, o: { applied: string[]; limit: number }): Suggestion[];
	/** Every entry that matches a whole query (chips and all), as rows. */
	search(query: string, limit: number): SpotlightRow[];
}

export interface SpotlightSource {
	/** Its things matching a typed name (`q.text`; `input` is the whole box). Spotlight ranks them with its own. */
	results(q: SpotlightQuery, input: string): SpotlightResults;
	/** "3 goblin": rows that add that many, or nothing when adding isn't what this means here (players, a game without fights). */
	adding?(q: SpotlightQuery): SpotlightRow[] | undefined;
	filters?: SpotlightFilters;
	/** "Search the compendium for …": open the system's compendium with this query (filters as typed). */
	lookup?(query: string): Modal | void;
}

/** Typed filters from a compendium bound with createCompendiumQuery: suggestions and results over `entries()` in the "all" tab. */
export function compendiumFilters<E extends CompendiumEntry, S extends string>(o: {
	query: CompendiumQuery<E, S>;
	/** The tab that holds everything. */
	all: S;
	entries(): E[];
	row(e: E): SpotlightRow;
}): SpotlightFilters {
	const q = o.query;
	return {
		query: q,
		isValue: (key, value) => q.isCompleteValue(o.entries(), key, value),
		suggest(token, rest, s) {
			const pool = q.search(o.entries(), rest, { segment: o.all }).entries;
			return q.suggest(token, pool, o.all, { applied: s.applied, segments: true, limit: s.limit });
		},
		search: (query, limit) => q.search(o.entries(), query, { segment: o.all, limit }).entries.map(e => o.row(e)),
	};
}
