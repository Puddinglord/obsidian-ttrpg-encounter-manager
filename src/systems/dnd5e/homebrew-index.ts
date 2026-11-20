// Your ```5e-spell and ```5e-item blocks, indexed like monsters (core's
// BlockIndex, scoped per campaign), as compendium hits that come before the
// SRD's: a note's spell replaces the book's spell of the same name.

import type { App } from 'obsidian';
import { BlockIndex } from '../../core/block-index';
import { allHits, Hit5e, itemLine, Item5e, Kind5e, Spell5e, spellLine } from './compendium';
import type { Dnd5eEdition } from './editions';
import { extractBlocks, homebrewSource, ITEM_LANG, parseItem5e, parseSpell5e, SPELL_LANG } from './homebrew';

/** A hit from a note: where it's written. */
export type HomebrewHit = Hit5e & { filePath: string };

export class Homebrew5e {
	readonly spells: BlockIndex<Spell5e>;
	readonly items: BlockIndex<Item5e>;

	constructor(app: App) {
		this.spells = new BlockIndex<Spell5e>(app, { mentions: /(`{3,}|~{3,})\s*5e-spell\b/, extract: c => extractBlocks(c, SPELL_LANG), parse: parseSpell5e });
		this.items = new BlockIndex<Item5e>(app, { mentions: /(`{3,}|~{3,})\s*5e-item\b/, extract: c => extractBlocks(c, ITEM_LANG), parse: b => parseItem5e(b) });
	}

	get indexes(): BlockIndex<Spell5e | Item5e>[] {
		return [this.spells, this.items] as BlockIndex<Spell5e | Item5e>[];
	}

	/** Every spell and item a note can see, as hits for an edition. */
	hits(edition: Dnd5eEdition, from?: string): HomebrewHit[] {
		return [
			...this.spells.all(from).map((e): HomebrewHit => ({ kind: 'spell', name: e.name, edition, detail: `${spellLine(e.item, edition)}${e.item.concentration ? ' · concentration' : ''}`, spell: homebrewSource(e.item), filePath: e.filePath })),
			...this.items.all(from).map((e): HomebrewHit => ({ kind: 'item', name: e.name, edition, detail: itemLine(e.item), item: homebrewSource(e.item), filePath: e.filePath })),
		];
	}
}

/** Your hits, then the edition's SRD hits they don't replace. */
export function mergeHits(mine: Hit5e[], edition: Dnd5eEdition): Hit5e[] {
	const key = (h: Hit5e) => `${h.kind}:${h.name.toLowerCase()}`;
	const taken = new Set(mine.map(key));
	return [...mine, ...allHits(edition).filter(h => !taken.has(key(h)))];
}

/** A hit by name (and kind): yours first, then this edition's SRD, then the other edition's. */
export function findIn(mine: Hit5e[], edition: Dnd5eEdition, name: string, kind?: Kind5e): Hit5e | undefined {
	const k = name.trim().toLowerCase();
	const match = (h: Hit5e) => h.name.toLowerCase() === k && (!kind || h.kind === kind);
	return mine.find(match) ?? allHits(edition).find(match) ?? allHits(edition === '2014' ? '2024' : '2014').find(match);
}
