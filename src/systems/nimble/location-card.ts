// What Nimble adds to a location's card (core's campaign cards): the monsters to use there, by name,
// each a reference to its block (hover for it, click for the quick look, + to add it), as Nimble's
// adventures list them. GM only.

import type { NoteKindExtension, NoteCardContext } from '../../core/note-kinds';
import { fieldText } from '../../core/note-kinds';
import { createInlineRef } from './inline-ref';
import { statblockName } from './npc';
import { nimble } from './runtime';

export const LOCATION_FIELDS_NIMBLE = [
	{ key: 'monsters', label: 'Monsters', gmOnly: true, hideInStats: true },
] as const satisfies NoteKindExtension['fields'];

/** `monsters:` as names: a list, or one line split at commas ("Vault Rat, Copper Golem"). */
export function locationMonsters(v: unknown): string[] {
	const raw = Array.isArray(v) ? v.map(x => fieldText({ key: 'monsters', label: '' }, x)) : fieldText({ key: 'monsters', label: '' }, v).split(/\s*,\s*/);
	return raw.map(statblockName).filter(Boolean);
}

export function drawLocationNimble(el: HTMLElement, ctx: NoteCardContext): void {
	if (ctx.player) return;
	const names = locationMonsters(ctx.fm.monsters);
	if (!names.length) return;
	const row = el.createDiv({ cls: 'ev-cq-mons' });
	row.createSpan({ cls: 'ev-cq-mons-label', text: 'Monsters here' });
	for (const n of names) row.appendChild(createInlineRef(nimble().plugin, n, ctx.path));
}
