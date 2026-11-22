// What a line of an encounter block fights with: a monster from the index, or one of the campaign's
// NPC notes with stats, made into a monster the way Add to fight on the NPC's card makes it (its
// stat block under its own name, its own level, armor and HP on top). The block, its balance, the
// builder and Run all read lines through here, so an NPC counts wherever a monster does.

import type EmberVaultPlugin from '../../../main';
import type { EncounterDefMonster } from '../../core/encounter-def';
import { fmText } from '../../core/campaign-model';
import type { NpcInfo } from '../../core/campaigns';
import { npcMonster, statblockName } from './npc';
import { nimble } from './runtime';
import type { MonsterIndexEntry } from './types';

export interface Fighter {
	/** The monster (for an NPC: its note's path, its name, its numbers). */
	entry: MonsterIndexEntry;
	/** Set when the line is an NPC note. */
	npc?: NpcInfo;
}

/** An NPC note seen from `from`, as a monster; undefined when there's no such NPC or nothing to fight with. */
export function npcFighter(plugin: EmberVaultPlugin, name: string, from?: string): Fighter | undefined {
	const npc = plugin.campaigns.npcNamed(name, from);
	if (!npc) return undefined;
	const fm = plugin.campaigns.npcProps(npc);
	const ref = statblockName(fm.statblock);
	// The block it uses, found the way its card finds it: from the NPC's own note.
	const base = ref ? nimble().index.get(ref, npc.path) : undefined;
	const shown = fmText(fm.title).trim() || npc.name;
	const monster = npcMonster(shown, fm, base?.monster);
	return monster ? { entry: { name: shown, filePath: npc.path, monster }, npc } : undefined;
}

/** A line of a block: a [[link]] to an NPC means the NPC; any other name is a monster first, then an NPC. */
export function fighterFor(plugin: EmberVaultPlugin, m: Pick<EncounterDefMonster, 'name' | 'written'>, from?: string): Fighter | undefined {
	const monster = (): Fighter | undefined => {
		const e = nimble().index.get(m.name, from);
		return e ? { entry: e } : undefined;
	};
	const npc = () => npcFighter(plugin, m.written?.startsWith('[[') ? m.written : m.name, from);
	return m.written?.startsWith('[[') ? npc() ?? monster() : monster() ?? npc();
}
