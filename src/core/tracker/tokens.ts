// Fighters as tokens on a GM map (app/map-block.ts): whatever game's fight is
// running gives its combatants this way (the contract's `combatTokens`), and
// the map draws them, lets you drag them on, and remembers where they stand.
// Pure: no Obsidian imports.

export interface CombatToken {
	/** Stable through the fight (positions are saved by it). */
	id: string;
	label: string;
	/** What the token shows: initials, or how many are left in a group. */
	text: string;
	/** For its colour: 'hero', 'minion', 'legendary', 'regular'… */
	role: string;
	down: boolean;
	/** Has had its turn this round. */
	done: boolean;
	/** "Goblin 2: 4/7 HP · Prone". */
	title: string;
	/** The stat block's hover card on the token, when it has one. */
	hover?: (el: HTMLElement) => void;
}

export interface CombatTokens {
	/** The fight's name, over the tray. */
	name: string;
	tokens: CombatToken[];
}

/** "Goblin Warrior 2" → "GW2". */
export function initials(label: string): string {
	return label.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+|-/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || '?';
}
