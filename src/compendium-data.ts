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
