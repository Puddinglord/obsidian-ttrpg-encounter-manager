// Rules words a game's text uses (abilities, senses, languages, conditions,
// actions…), so stat blocks, sheets and cards can make them clickable. Each game
// gives its own terms through the contract's `ruleTerms`; core marks them in text
// and shows a term's card (rule-term-ui.ts). Pure: no Obsidian imports.

import { keywordPattern } from './markdown';

export interface RuleTerm {
	/** Stable within its game: "darkvision", "ability:str". */
	id: string;
	/** The card's title: "Darkvision". */
	name: string;
	/** Words that name it in text, matched whole and as written ("Darkvision", "darkvision"). The name is always one. */
	names?: string[];
	/** What kind of rule: "Sense", "Condition", "Language", "Ability", "Skill", "Action", "Rule". */
	tag?: string;
	/** The rule: markdown (bold, italics, [[links]]) and dice. Other terms in it are clickable too. */
	text: string;
	/** Also marked in running text (traits, actions, spells). Off: only where the game asks for it (labels, fields). */
	prose?: boolean;
}

export interface RuleTerms {
	all(): readonly RuleTerm[];
	/** By any of its names; falls back to ignoring case. */
	get(word: string): RuleTerm | undefined;
	/** Matches terms in text (group 1 is leading context, as keywordPattern). `prose`: only terms marked for running text. */
	pattern(prose: boolean): RegExp | undefined;
}

const EMPTY: RuleTerms = { all: () => [], get: () => undefined, pattern: () => undefined };
const made = new WeakMap<readonly RuleTerm[], RuleTerms>();

/** The lookups for a list of terms. Keep the list (a game caches its own) and this is made once for it. */
export function ruleTerms(list: readonly RuleTerm[]): RuleTerms {
	if (!list.length) return EMPTY;
	const known = made.get(list);
	if (known) return known;
	const out = build(list);
	made.set(list, out);
	return out;
}

function build(list: readonly RuleTerm[]): RuleTerms {
	const exact = new Map<string, RuleTerm>();
	const folded = new Map<string, RuleTerm>();
	for (const t of list) {
		for (const n of [t.name, ...(t.names ?? [])]) {
			if (!exact.has(n)) exact.set(n, t);
			const k = n.toLowerCase();
			if (!folded.has(k)) folded.set(k, t);
		}
	}
	const words = (prose: boolean) => list.filter(t => !prose || t.prose).flatMap(t => [t.name, ...(t.names ?? [])]);
	let all: RegExp | undefined | null = null;
	let running: RegExp | undefined | null = null;
	return {
		all: () => list,
		get: (word) => exact.get(word) ?? folded.get(word.toLowerCase()),
		pattern: (prose) => {
			if (prose) return running === null ? (running = keywordPattern(words(true))) : running;
			return all === null ? (all = keywordPattern(words(false))) : all;
		},
	};
}

