// Every 5e monster a note can see: those written in ```5e blocks in the vault
// (a vault note with a book monster's name replaces it), then the SRD monsters
// for the note's edition, then the other edition's (2024 tables use 2014
// monsters all the time).

import type { App, TFile } from 'obsidian';
import { BlockIndex } from '../../core/block-index';
import { bundledMonsters } from './bestiary';
import { packContent5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { extract5eBlocks, parseStatblock5e } from './parser';
import type { Dnd5eEntry, Dnd5eMonster } from './types';

export class Dnd5eIndex {
	readonly vault: BlockIndex<Dnd5eMonster>;

	constructor(app: App) {
		this.vault = new BlockIndex<Dnd5eMonster>(app, { mentions: /(`{3,}|~{3,})\s*5e\b/, extract: extract5eBlocks, parse: parseStatblock5e });
	}

	get ready(): boolean { return this.vault.ready; }
	build(): Promise<void> { return this.vault.build(); }
	update(file: TFile): Promise<void> { return this.vault.update(file); }
	remove(path: string): void { this.vault.remove(path); }

	/** A monster by name, as seen from a note in a campaign using `edition`. */
	get(name: string, edition: Dnd5eEdition, from?: string): Dnd5eEntry | undefined {
		const v = this.vault.get(name, from);
		if (v) return { name: v.name, filePath: v.filePath, monster: v.item };
		const key = name.trim().toLowerCase();
		const other: Dnd5eEdition = edition === '2014' ? '2024' : '2014';
		return packMonsters(edition).find(e => e.name.toLowerCase() === key)
			?? bundledMonsters(edition).find(e => e.name.toLowerCase() === key) ?? bundledMonsters(other).find(e => e.name.toLowerCase() === key);
	}

	/** A bundled monster by its stable id ("2024:goblin-warrior"). */
	getBundled(id: string): Dnd5eEntry | undefined {
		const edition = id.startsWith('2014:') ? '2014' : '2024';
		return bundledMonsters(edition).find(e => e.monster.bundledId === id);
	}

	/** Everything a note can see: its vault monsters, then content packs', then the edition's SRD monsters they don't replace. */
	all(edition: Dnd5eEdition, from?: string): Dnd5eEntry[] {
		const vault = this.vault.all(from).map((v): Dnd5eEntry => ({ name: v.name, filePath: v.filePath, monster: v.item }));
		const taken = new Set(vault.map(e => e.name.toLowerCase()));
		const packs = packMonsters(edition).filter(e => !taken.has(e.name.toLowerCase()));
		for (const e of packs) taken.add(e.name.toLowerCase());
		return [...vault, ...packs, ...bundledMonsters(edition).filter(e => !taken.has(e.name.toLowerCase()))].sort((a, b) => a.name.localeCompare(b.name));
	}
}

/** Content packs' monsters for an edition (a later pack wins a name). */
function packMonsters(edition: Dnd5eEdition): Dnd5eEntry[] {
	const add = packContent5e(edition);
	if (!add) return [];
	const byName = new Map<string, Dnd5eEntry>();
	for (const m of add.monsters) byName.set(m.monster.name.toLowerCase(), { name: m.monster.name, filePath: '', monster: m.monster, pack: m.pack });
	return [...byName.values()];
}
