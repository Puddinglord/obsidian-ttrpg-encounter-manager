// A 5e NPC note's fight stats. NPC notes are core's; 5e adds AC, HP, CR and a
// `statblock:` (a monster whose stats the NPC uses: "Veteran", "Mage"), so an
// innkeeper can join a fight without a stat block of her own.
// Pure: no Obsidian imports.

import type { NoteKindExtension } from '../../core/note-kinds';
import { fieldText } from '../../core/note-kinds';
import { averageRoll } from './parser';
import type { Dnd5eMonster } from './types';

export const NPC_FIELDS_5E = [
	{ key: 'ac', label: 'AC', type: 'number', gmOnly: true },
	{ key: 'hp', label: 'HP', gmOnly: true },
	{ key: 'cr', label: 'CR', gmOnly: true },
	{ key: 'statblock', label: 'Stats', gmOnly: true, hideInStats: true },
] as const satisfies NoteKindExtension['fields'];

/** "22", "22 (4d8 + 4)", "4d8+4" → { hp: 22, formula: "4d8 + 4" }. */
export function readHp(v: unknown): { hp: number; formula?: string } | undefined {
	const s = fieldText({ key: 'hp', label: 'HP' }, v);
	const m = /^(\d+)\s*(?:\(([^)]+)\))?$/.exec(s);
	if (m) return { hp: Number(m[1]), ...(m[2] ? { formula: m[2].trim() } : {}) };
	const avg = s ? averageRoll(s) : undefined;
	return avg !== undefined ? { hp: avg, formula: s } : undefined;
}

/** The `statblock:` property's monster name: "Veteran", "[[Veteran]]", "`5e:Veteran`". */
export function statblockName(v: unknown): string {
	return fieldText({ key: 'statblock', label: '' }, v)
		.replace(/^`?5e:/i, '').replace(/`$/, '')
		.replace(/^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/, '$1')
		.trim();
}

/**
 * The NPC as a monster for the tracker: its stat block (when it names one) with
 * the NPC's own name, AC and HP on top; or, with no stat block, a plain one
 * from its AC and HP (all abilities 10). Undefined when there's nothing to fight with.
 */
export function npcMonster5e(name: string, fm: Record<string, unknown>, base?: Dnd5eMonster): Dnd5eMonster | undefined {
	const ac = Number(fieldText({ key: 'ac', label: '', type: 'number' }, fm.ac)) || undefined;
	const hp = readHp(fm.hp);
	const cr = fieldText({ key: 'cr', label: '' }, fm.cr);
	if (base) {
		return {
			...base, name,
			...(ac ? { ac, acNote: undefined } : {}),
			...(hp ? { hp: hp.hp, hpFormula: hp.formula } : {}),
			...(cr ? { cr } : {}),
		};
	}
	if (!ac || !hp) return undefined;
	return { name, ac, hp: hp.hp, hpFormula: hp.formula, cr: cr || '0', abilities: [10, 10, 10, 10, 10, 10], type: 'humanoid' };
}
