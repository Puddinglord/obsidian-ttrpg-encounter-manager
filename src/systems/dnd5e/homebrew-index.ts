// Your ```5e-spell and ```5e-item blocks, indexed like monsters (core's
// BlockIndex, scoped per campaign), as compendium hits that come before the
// SRD's: a note's spell replaces the book's spell of the same name. An item
// block with a category is a weapon, armor or gear: equipment, not a magic item.

import type { App } from 'obsidian';
import { BlockIndex } from '../../core/block-index';
import { allHits, Equipment5e, equipmentLine, Hit5e, itemLine, Item5e, Kind5e, Spell5e, spellLine } from './compendium';
import type { Dnd5eEdition } from './editions';
import { extractBlocks, homebrewSource, ITEM_LANG, parseEquipment5e, parseItem5e, parseSpell5e, SPELL_LANG } from './homebrew';

/** A hit from a note: where it's written. */
export type HomebrewHit = Hit5e & { filePath: string };

/** An item block: a magic item, or equipment (a weapon, armor or gear). */
export interface ItemBlock5e { name: string; item?: Item5e; equipment?: Equipment5e }

/** An item block's body as a magic item or as equipment. */
export function parseItemBlock5e(body: string): ItemBlock5e | null {
	const item = parseItem5e(body);
	if (item) return { name: item.name, item };
	const equipment = parseEquipment5e(body);
	return equipment ? { name: equipment.name, equipment } : null;
}

export class Homebrew5e {
	readonly spells: BlockIndex<Spell5e>;
	readonly items: BlockIndex<ItemBlock5e>;

	constructor(app: App) {
		this.spells = new BlockIndex<Spell5e>(app, { mentions: /(`{3,}|~{3,})\s*5e-spell\b/, extract: c => extractBlocks(c, SPELL_LANG), parse: parseSpell5e });
		this.items = new BlockIndex<ItemBlock5e>(app, { mentions: /(`{3,}|~{3,})\s*5e-item\b/, extract: c => extractBlocks(c, ITEM_LANG), parse: parseItemBlock5e });
	}

	get indexes(): BlockIndex<Spell5e | ItemBlock5e>[] {
		return [this.spells, this.items] as BlockIndex<Spell5e | ItemBlock5e>[];
	}

	/** Every spell, item and piece of equipment a note can see, as hits for an edition. */
	hits(edition: Dnd5eEdition, from?: string): HomebrewHit[] {
		return [
			...this.spells.all(from).map((e): HomebrewHit => ({ kind: 'spell', name: e.name, edition, detail: `${spellLine(e.item, edition)}${e.item.concentration ? ' · concentration' : ''}`, spell: homebrewSource(e.item), filePath: e.filePath })),
			...this.items.all(from).map((e): HomebrewHit => (e.item.equipment
				? { kind: 'equipment', name: e.name, edition, detail: equipmentLine(e.item.equipment), equipment: homebrewSource(e.item.equipment), filePath: e.filePath }
				: { kind: 'item', name: e.name, edition, detail: itemLine(e.item.item!), item: homebrewSource(e.item.item!), filePath: e.filePath })),
		];
	}

	/** Your equipment, magic items and spells, for a character sheet to find before the SRD's. */
	library(from?: string): { equipment: Equipment5e[]; items: Item5e[]; spells: Spell5e[] } {
		const blocks = this.items.all(from).map(e => e.item);
		return {
			equipment: blocks.flatMap(b => (b.equipment ? [b.equipment] : [])),
			items: blocks.flatMap(b => (b.item ? [b.item] : [])),
			spells: this.spells.all(from).map(e => e.item),
		};
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
