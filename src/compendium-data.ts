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
	const book = COMPENDIUM_JSON as unknown as { spells?: unknown[]; items?: unknown[] };
	return { ...COMPENDIUM_JSON, spells: [...homebrew.spells, ...(book.spells ?? [])], items: [...homebrew.items.map(itemForCompendium), ...(book.items ?? [])] };
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

