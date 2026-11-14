// The bundled compendium (src/data/compendium.json), indexed once on first use.

import { Compendium } from './compendium';
import COMPENDIUM_JSON from './data/compendium.json';

let bundled: Compendium | null = null;
let withDrafts = true;

export function bundledCompendium(): Compendium {
	bundled ??= new Compendium(COMPENDIUM_JSON, { drafts: withDrafts });
	return bundled;
}

/** Include the expansion drafts (Manawright, Hexbinder, Psion, Revenant)? Re-indexes on the next lookup when it changes. */
export function setCompendiumDrafts(on: boolean): void {
	if (on === withDrafts) return;
	withDrafts = on;
	bundled = null;
}

let full: Compendium | null = null;

/** Every class, drafts included, whatever the setting says. */
export function fullCompendium(): Compendium {
	if (withDrafts) return bundledCompendium();
	full ??= new Compendium(COMPENDIUM_JSON, { drafts: true });
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

