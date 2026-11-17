// What 5e draws in an NPC's card (core's ```nimble-npc), for the GM: the stat
// block the NPC uses (a 5e: reference, with its hover card) and Add to fight,
// which puts the NPC in the 5e tracker under its own name, AC and HP.

import { setIcon } from 'obsidian';
import { fmText } from '../../core/campaign-model';
import type { NoteCardContext } from '../../core/note-kinds';
import { addMonster } from './combat';
import { npcMonster5e, statblockName } from './npc';
import type { Dnd5eRuntime } from './runtime';

export function drawNpc5e(rt: Dnd5eRuntime, el: HTMLElement, ctx: NoteCardContext): void {
	if (ctx.player) return;
	const ref = statblockName(ctx.fm.statblock);
	const base = ref ? rt.get(ref, ctx.path) : undefined;
	const name = fmText(ctx.fm.title).trim() || ctx.path.replace(/^.*\//, '').replace(/\.md$/i, '');
	const monster = npcMonster5e(name, ctx.fm, base?.monster);
	if (!ref && !monster) return;
	const row = el.createDiv({ cls: 'dnd5e-npc-row' });
	if (ref) {
		row.createSpan({ cls: 'dnd5e-npc-label', text: 'Stats' });
		row.appendChild(rt.createRef(ref, ctx.path));
	}
	if (!monster) return;
	const b = row.createEl('button', { cls: 'dnd5e-npc-fight', attr: { 'aria-label': `Add ${name} to the 5e tracker` } });
	setIcon(b.createSpan({ cls: 'dnd5e-btn-icon' }), 'swords');
	b.createSpan({ text: 'Add to fight' });
	b.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		rt.fights.change(f => { addMonster(f, monster, 1, { sourceFile: ctx.path }); });
		void rt.openTracker();
	});
}
