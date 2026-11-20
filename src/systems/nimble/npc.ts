// A Nimble NPC note's fight stats. NPC notes are core's; Nimble adds a level, armor (M or H), HP
// and a `statblock:` (a monster whose block the NPC uses: "Vault Captain", "Bandit"), so a
// gatekeeper can join a fight without a block of his own. The card shows them as the books draw
// them (core's NPC card, nimble/npc-card.ts). Pure: no Obsidian imports.

import type { NoteKindExtension } from '../../core/note-kinds';
import { fieldText } from '../../core/note-kinds';
import type { ArmorType, NimbleMonster } from './types';

export const NPC_FIELDS_NIMBLE = [
	{ key: 'level', label: 'Level', gmOnly: true, hideInStats: true },
	{ key: 'armor', label: 'Armor', gmOnly: true, hideInStats: true },
	{ key: 'hp', label: 'HP', type: 'number', gmOnly: true, hideInStats: true },
	{ key: 'statblock', label: 'Stats', gmOnly: true, hideInStats: true },
] as const satisfies NoteKindExtension['fields'];

/** "M", "medium", "Medium armor" → medium; "H", "heavy" → heavy; "none", "-" → none; anything else → undefined. */
export function readArmor(v: unknown): ArmorType | undefined {
	const s = fieldText({ key: 'armor', label: '' }, v).toLowerCase().replace(/\s*armou?r$/, '').trim();
	if (!s) return undefined;
	if (s === 'm' || s === 'medium') return 'medium';
	if (s === 'h' || s === 'heavy') return 'heavy';
	if (s === 'none' || s === 'no' || s === '-' || s === '–' || s === 'n') return 'none';
	return undefined;
}

/** The `statblock:` property's monster name: "Vault Captain", "[[Vault Captain]]", "`nimble:Vault Captain`". */
export function statblockName(v: unknown): string {
	return fieldText({ key: 'statblock', label: '' }, v)
		.replace(/^`?nimble:/i, '').replace(/`$/, '')
		.replace(/^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/, '$1')
		.trim();
}

/**
 * The NPC as a monster for the tracker: its monster block (when it names one) under the NPC's own
 * name, with the NPC's level, armor and HP on top; or, with no block, a plain one from its own
 * numbers. Undefined when there's nothing to fight with (no block and no HP).
 */
export function npcMonster(name: string, fm: Record<string, unknown>, base?: NimbleMonster): NimbleMonster | undefined {
	const hpText = fieldText({ key: 'hp', label: '', type: 'number' }, fm.hp);
	const hp = hpText ? Number(hpText) : undefined;
	const level = fieldText({ key: 'level', label: '' }, fm.level);
	const armor = readArmor(fm.armor);
	if (base) {
		return {
			...base, name,
			...(level ? { level } : {}),
			...(armor ? { armor } : {}),
			// The NPC's own HP is the HP it has, whatever the party's size.
			...(hp !== undefined ? { hp, hpPerHero: undefined } : {}),
		};
	}
	if (hp === undefined) return undefined;
	return { name, ...(level ? { level } : {}), armor: armor ?? 'none', hp, movement: '6', role: 'regular' };
}
