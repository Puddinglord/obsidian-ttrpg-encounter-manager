import { describe, expect, it } from 'vitest';
import { findNpc, NpcRef } from '../src/core/npc-lookup';
import { parseEncounterBlock } from '../src/core/encounter-def';

type Npc = NpcRef & { campaign?: string };
const npcs: Npc[] = [
	{ path: 'Campaigns/Lantern/NPCs/Ysolde Krenn.md', name: 'Ysolde Krenn', aliases: ['Captain Krenn'], campaign: 'Campaigns/Lantern' },
	{ path: 'Campaigns/Other/NPCs/Ysolde Krenn.md', name: 'Ysolde Krenn', aliases: [], campaign: 'Campaigns/Other' },
	{ path: 'Campaigns/Lantern/NPCs/Tobren Kask.md', name: 'Tobren Kask', aliases: ['Master Kask', 'Krenn'], campaign: 'Campaigns/Lantern' },
	{ path: 'Loose/Old Bram.md', name: 'Old Bram', aliases: [] },
];
const from = (campaign: string) => (n: Npc) => !n.campaign || n.campaign === campaign;

describe('which NPC a name in a block means', () => {
	it('finds a name, case and spacing aside', () => {
		expect(findNpc(npcs, 'Tobren Kask')?.path).toBe('Campaigns/Lantern/NPCs/Tobren Kask.md');
		expect(findNpc(npcs, '  tobren   kask ')?.path).toBe('Campaigns/Lantern/NPCs/Tobren Kask.md');
	});

	it('finds an alias, but a note\'s own name comes first', () => {
		expect(findNpc(npcs, 'Master Kask')?.name).toBe('Tobren Kask');
		// "Krenn" is only Tobren's alias; "Captain Krenn" is Ysolde's.
		expect(findNpc(npcs, 'Captain Krenn')?.name).toBe('Ysolde Krenn');
		expect(findNpc(npcs, 'Krenn')?.name).toBe('Tobren Kask');
	});

	it('reads the name inside a [[link]], with or without its shown text or heading', () => {
		for (const written of ['[[Tobren Kask]]', '[[Tobren Kask|the assayer]]', '[[Tobren Kask#Secrets]]']) {
			expect(findNpc(npcs, written)?.name).toBe('Tobren Kask');
		}
	});

	it('takes a path to tell two NPCs of the same name apart', () => {
		expect(findNpc(npcs, 'Other/NPCs/Ysolde Krenn')?.path).toBe('Campaigns/Other/NPCs/Ysolde Krenn.md');
		expect(findNpc(npcs, '[[Campaigns/Lantern/NPCs/Ysolde Krenn.md]]')?.path).toBe('Campaigns/Lantern/NPCs/Ysolde Krenn.md');
		// Whole segments only: "s/Ysolde Krenn" is no path of anyone's.
		expect(findNpc(npcs, 's/Ysolde Krenn')).toBeUndefined();
	});

	it('only sees the NPCs the block\'s campaign can see', () => {
		expect(findNpc(npcs, 'Ysolde Krenn', from('Campaigns/Other'))?.path).toBe('Campaigns/Other/NPCs/Ysolde Krenn.md');
		expect(findNpc(npcs, 'Tobren Kask', from('Campaigns/Other'))).toBeUndefined();
		// A note outside any campaign is seen from campaigns that let it be.
		expect(findNpc(npcs, 'Old Bram', from('Campaigns/Other'))?.path).toBe('Loose/Old Bram.md');
		expect(findNpc(npcs, 'Old Bram', () => false)).toBeUndefined();
	});

	it('only matches whole names', () => {
		expect(findNpc(npcs, 'Ysolde')).toBeUndefined();
		expect(findNpc(npcs, 'Tobren Kask the Elder')).toBeUndefined();
		expect(findNpc(npcs, '')).toBeUndefined();
	});

	it('reads the names an encounter block\'s lines give it', () => {
		const def = parseEncounterBlock('name: The guard turns\nmonsters:\n- 2 Goblin\n- [[Ysolde Krenn]]\n- Master Kask\n');
		const seen = def.monsters.map(m => findNpc(npcs, m.written ?? m.name, from('Campaigns/Lantern'))?.name ?? null);
		expect(seen).toEqual([null, 'Ysolde Krenn', 'Tobren Kask']);
	});
});
