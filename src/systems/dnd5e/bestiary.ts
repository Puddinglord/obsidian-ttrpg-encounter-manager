// The SRD monsters that ship with the plugin, one list per edition
// (data/monsters-*.json, built by scripts/dnd5e/build.py). Pure: no Obsidian imports.

import m2014 from './data/monsters-2014.json';
import m2024 from './data/monsters-2024.json';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eEntry, Dnd5eMonster } from './types';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const cache = new Map<Dnd5eEdition, Dnd5eEntry[]>();

/** Every bundled monster for an edition, by name. */
export function bundledMonsters(edition: Dnd5eEdition): Dnd5eEntry[] {
	let list = cache.get(edition);
	if (!list) {
		const raw = (edition === '2014' ? m2014 : m2024) as unknown as Dnd5eMonster[];
		list = raw.map((m): Dnd5eEntry => {
			const monster: Dnd5eMonster = { ...m, edition, source: edition === '2014' ? 'SRD 5.1' : 'SRD 5.2', bundledId: `${edition}:${slug(m.name)}` };
			return { name: m.name, filePath: '', monster, bundled: true };
		});
		cache.set(edition, list);
	}
	return list;
}
