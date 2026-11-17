// The bundled compendium (src/data/compendium.json), indexed once on first use.

import { Compendium } from './compendium';
import COMPENDIUM_JSON from './data/compendium.json';
import { HomebrewItem, HomebrewSpell, itemForCompendium } from './homebrew-def';

let bundled: Compendium | null = null;
let withDrafts = true;
let homebrew: { spells: HomebrewSpell[]; items: HomebrewItem[] } = { spells: [], items: [] };
let full: Compendium | null = null;

/** The book's data with the vault's homebrew in front, so a note named like a book entry replaces it. */
function data(): unknown {
	if (!homebrew.spells.length && !homebrew.items.length) return COMPENDIUM_JSON;
	const book = COMPENDIUM_JSON as unknown as { spells?: { name: string }[]; items?: { name: string }[] };
	return { ...COMPENDIUM_JSON, spells: replacing(homebrew.spells, book.spells ?? []), items: replacing(homebrew.items.map(itemForCompendium), book.items ?? []) };
}

/** Homebrew first (the first note wins a name), then the book's entries it doesn't replace. */
function replacing<T extends { name: string }>(mine: T[], book: { name: string }[]): unknown[] {
	const key = (e: { name: string }) => e.name.trim().toLowerCase();
	const seen = new Set<string>();
	const own = mine.filter(e => !seen.has(key(e)) && !!seen.add(key(e)));
	return [...own, ...book.filter(e => !seen.has(key(e)))];
}

export function bundledCompendium(): Compendium {
	bundled ??= new Compendium(data(), { drafts: withDrafts });
	return bundled;
}

/** The vault's homebrew spells and items (```nimble-spell, ```nimble-item). Re-indexes on the next lookup when they change. */
export function setHomebrew(next: { spells: HomebrewSpell[]; items: HomebrewItem[] }): void {
	if (JSON.stringify(next) === JSON.stringify(homebrew)) return;
	homebrew = next;
	bundled = null;
	full = null;
}

/** Include the expansion drafts (Manawright, Hexbinder, Psion, Revenant)? Re-indexes on the next lookup when it changes. */
export function setCompendiumDrafts(on: boolean): void {
	if (on === withDrafts) return;
	withDrafts = on;
	bundled = null;
}


/** Every class, drafts included, whatever the setting says. */
export function fullCompendium(): Compendium {
	if (withDrafts) return bundledCompendium();
	full ??= new Compendium(data(), { drafts: true });
	return full;
}

/**
 * The compendium a hero's sheet reads from. A hero whose class is one of the
 * expansion drafts (a Manawright, say) keeps their whole sheet when drafts are
 * turned off: the setting only hides drafts from heroes who don't use them.
 */
export function compendiumFor(className: unknown): Compendium {
	const comp = bundledCompendium();
	const name = typeof className === 'string' ? className.trim() : '';
	if (!name || comp.classByName(name)) return comp;
	return fullCompendium().classByName(name) ? fullCompendium() : comp;
}

/** The compendium for reading sheets in bulk (the GM party): drafts always included. */
export const sheetCompendium = fullCompendium;

