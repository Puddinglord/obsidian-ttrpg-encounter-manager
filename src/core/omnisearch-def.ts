// What an Omnisearch query means. Pure: no Obsidian imports.
//
//   2d6+3, d20, roll 4d8   a dice roll
//   goblin                 search everything
//   3 goblin               search, with a count for "add to the encounter"
//   > next                 commands only

import { nameMatch } from './compendium/query';
import { formatDice, parseDice } from './dice';

export interface OmnisearchQuery {
	/** A dice expression to roll ("2d6+3"), when the query is one. */
	roll?: string;
	/** How many to add: "3 goblin" is 3. 1 when no count was typed. */
	count: number;
	/** True when a count was typed, so adding is what the query is for. */
	counted: boolean;
	/** Only commands (the query began with ">"). */
	commandsOnly: boolean;
	/** The text to search for, trimmed and lower-cased. */
	text: string;
}

export function parseOmnisearch(input: string): OmnisearchQuery {
	const raw = input.trim();
	if (raw.startsWith('>')) return { count: 1, counted: false, commandsOnly: true, text: raw.slice(1).trim().toLowerCase() };
	// "roll 2d6", "r d20", or just the dice.
	const said = raw.match(/^(?:roll|r)\s+(.+)$/i);
	const dice = parseDice(said ? said[1] : raw);
	if (dice) return { roll: formatDice(dice), count: 1, counted: false, commandsOnly: false, text: '' };
	const m = raw.match(/^(\d+)\s*[x×]?\s+(\S.*)$/i);
	if (m) return { count: Math.max(1, Math.min(50, Number(m[1]))), counted: true, commandsOnly: false, text: m[2].trim().toLowerCase() };
	return { count: 1, counted: false, commandsOnly: false, text: raw.toLowerCase() };
}

/** Something Omnisearch lists for a typed name: a monster, an NPC, a note, a spell, a command. */
export interface OmnisearchCandidate<T> {
	item: T;
	/** Names to rank by, the main one first (aliases after). */
	names: string[];
	/** Secondary text (a monster's group, a note's area): a match here ranks below name matches. */
	others?: string[];
	/** Ties go to the lower group: monsters 0, people 1, places 2, conditions 3, the compendium 4, commands 5. */
	order: number;
}

/**
 * Omnisearch's one list, ranked by how well each name matches (an exact name, then
 * the start of a name, then the start of a word…), whatever kind of thing it is.
 * A match only in secondary text ranks below name matches, and typo matches
 * ("compen" for Companions) only show when nothing anywhere matches for real.
 * Ties go to the lower order group, then to the order the candidates came in.
 */
export function rankOmnisearch<T>(candidates: OmnisearchCandidate<T>[], text: string, limit = 14): T[] {
	const ranked: { item: T; score: number; fuzzy: boolean; order: number }[] = [];
	for (const c of candidates) {
		const own = nameMatch(c.names, text);
		const other = own ? null : nameMatch(c.others ?? [], text);
		const m = own ?? (other ? { score: other.score + 8, fuzzy: other.fuzzy } : null);
		if (m) ranked.push({ item: c.item, score: m.score + (m.fuzzy ? 100 : 0), fuzzy: m.fuzzy, order: c.order });
	}
	const anyReal = ranked.some(r => !r.fuzzy);
	return ranked.filter(r => !anyReal || !r.fuzzy).sort((a, b) => a.score - b.score || a.order - b.order).slice(0, limit).map(r => r.item);
}

/** Rank `items` by how well `text` of each matches the query: prefix, then word start, then anywhere. Non-matches are dropped. */
export function rankByName<T>(items: T[], query: string, text: (item: T) => string[], limit: number): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return items.slice(0, limit);
	const score = (item: T): number => {
		let best = Infinity;
		for (const t of text(item)) {
			const s = t.toLowerCase();
			const i = s.indexOf(q);
			if (i < 0) continue;
			const rank = i === 0 ? 0 : /[\s\-_:(]/.test(s[i - 1]) ? 1 : 2;
			best = Math.min(best, rank * 1000 + s.length);
		}
		return best;
	};
	return items.map(item => ({ item, s: score(item) })).filter(x => x.s < Infinity).sort((a, b) => a.s - b.s).slice(0, limit).map(x => x.item);
}

/**
 * Picker order (Omnisearch's filtered mode): with nothing typed, the preferred
 * entries (the class's own options, the caster's schools) come first, the rest
 * after; once something is typed, an exact name leads, then preferred matches,
 * then the rest, each keeping the search's ranking. Taken entries sink below
 * untaken ones of the same standing.
 */
export function orderPicks<T extends { name: string }>(hits: T[], query: string, prefer?: (h: T) => boolean, taken?: (h: T) => boolean): T[] {
	const q = query.trim().toLowerCase();
	const rank = (h: T): number => (q && h.name.toLowerCase() === q ? 0 : 2) + (prefer?.(h) ? 0 : 1) * (q ? 1 : 2) + (taken?.(h) ? 0.5 : 0);
	return hits.map((h, i) => ({ h, i, r: rank(h) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.h);
}
