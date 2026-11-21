// The compendium: the bundled books (data/compendium.json), with the content
// packs a campaign uses on top and the vault's homebrew on top of those (a
// note beats a pack beats the books). Indexed once per set of packs, on first use.

import { Compendium, CompendiumData } from './compendium';
import COMPENDIUM_JSON from './data/compendium.json';
import { HomebrewItem, HomebrewSpell, itemForCompendium } from './homebrew-def';
import { mergeNimbleData, NimbleContent, onTop } from './content';

let withDrafts = true;
let homebrew: { spells: HomebrewSpell[]; items: HomebrewItem[] } = { spells: [], items: [] };
/** Built compendiums, by drafts and the set of packs. */
const built = new Map<string, Compendium>();

/** The packs a note's campaign uses (else the active campaign's), as content; `key` names the set. Set by the runtime. */
export type ContentLayer = (path?: string) => { key: string; content: NimbleContent } | null;
let layer: ContentLayer | null = null;
let version = 0;

/** The book's data with the packs' content on top, then the vault's homebrew, so a note named like a book entry replaces it. */
function data(content: NimbleContent | null): unknown {
	const book = content ? mergeNimbleData(COMPENDIUM_JSON as unknown as CompendiumData, content) : COMPENDIUM_JSON as unknown as CompendiumData;
	if (!homebrew.spells.length && !homebrew.items.length) return book;
	return { ...book, spells: onTop(firstOfEach(homebrew.spells), book.spells ?? []), items: onTop(firstOfEach(homebrew.items.map(itemForCompendium)), book.items ?? []) };
}

/** The first note wins a name. */
function firstOfEach<T extends { name: string }>(mine: T[]): T[] {
	const key = (e: { name: string }) => e.name.trim().toLowerCase();
	const seen = new Set<string>();
	return mine.filter(e => !seen.has(key(e)) && !!seen.add(key(e)));
}

function build(drafts: boolean, path?: string): Compendium {
	const packs = layer?.(path) ?? null;
	const key = `${drafts ? 'drafts' : ''}|${packs?.key ?? ''}`;
	let comp = built.get(key);
	if (!comp) built.set(key, comp = new Compendium(data(packs?.content ?? null), { drafts }));
	return comp;
}

/**
 * The compendium for a note (or the active campaign): the books, drafts as the setting says, with the
 * campaign's content packs and the vault's homebrew. Every lookup that isn't about one hero reads this.
 */
export function bundledCompendium(path?: string): Compendium {
	return build(withDrafts, path);
}

/** The vault's homebrew spells and items (```nimble-spell, ```nimble-item). Re-indexes on the next lookup when they change. */
export function setHomebrew(next: { spells: HomebrewSpell[]; items: HomebrewItem[] }): void {
	if (JSON.stringify(next) === JSON.stringify(homebrew)) return;
	homebrew = next;
	built.clear();
}

/** Include the expansion drafts (Manawright, Hexbinder, Psion, Revenant)? */
export function setCompendiumDrafts(on: boolean): void {
	withDrafts = on;
}

/** Put the content packs campaigns use on top of the books (null: none). Everything built from the compendium is rebuilt. */
export function setContentLayer(fn: ContentLayer | null): void {
	layer = fn;
	built.clear();
	version++;
}

/** Changes whenever the packs do (for caches built from the compendium). */
export function contentVersion(): number {
	return version;
}

/** What the packs a note's campaign (else the active one) uses add, if any. */
export function packContent(path?: string): NimbleContent | null {
	return layer?.(path)?.content ?? null;
}

/** Every class, drafts included, whatever the setting says. */
export function fullCompendium(path?: string): Compendium {
	return build(true, path);
}

/**
 * The compendium a hero's sheet reads from. A hero whose class is one of the
 * expansion drafts (a Manawright, say) keeps their whole sheet when drafts are
 * turned off: the setting only hides drafts from heroes who don't use them.
 */
export function compendiumFor(className: unknown, path?: string): Compendium {
	const comp = bundledCompendium(path);
	const name = typeof className === 'string' ? className.trim() : '';
	if (!name || comp.classByName(name)) return comp;
	return fullCompendium(path).classByName(name) ? fullCompendium(path) : comp;
}

/**
 * The one place a hero's content comes from: the classes, subclasses, ancestries, backgrounds, option lists,
 * spells and rules that New character, Level up and the sheet read, for a note (`path`: its campaign's content
 * packs) and a hero's class. The books (drafts as the setting says, a draft class kept for its heroes), the
 * campaign's packs on top, and the vault's homebrew on top of those; nothing past this asks for the books by name.
 */
export function heroCompendium(o: { path?: string; className?: unknown } = {}): Compendium {
	return compendiumFor(o.className, o.path);
}

/** The compendium for reading sheets in bulk (the GM party): drafts always included. */
export function sheetCompendium(path?: string): Compendium {
	return fullCompendium(path);
}
