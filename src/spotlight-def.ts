// What a Spotlight query means. Pure: no Obsidian imports.
//
//   2d6+3, d20, roll 4d8   a dice roll
//   goblin                 search everything
//   3 goblin               search, with a count for "add to the encounter"
//   > next                 commands only

import { formatDice, parseDice } from './dice';

export interface SpotlightQuery {
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

export function parseSpotlight(input: string): SpotlightQuery {
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
