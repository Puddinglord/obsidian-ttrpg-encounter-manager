// What Nimble draws in an NPC's card (core's ```nimble-npc), for the GM: the level, the armor
// letter on its shield (a dash for none), HP in a heart, its speed, a link to the monster block
// the NPC uses (a nimble: reference, with its hover card and quick look) and Add to fight, which
// puts the NPC in the tracker under its own name. Players see none of it.

import type EmberVaultPlugin from '../../../main';
import { pill } from '../../core/pill';
import { fmText } from '../../core/campaign-model';
import { evIcon } from '../../core/icons';
import type { NoteCardContext } from '../../core/note-kinds';
import { armorGlyph, heartGlyph } from './book-glyphs';
import { createInlineRef } from './inline-ref';
import { npcMonster, statblockName } from './npc';
import { parseMovement } from './parser';
import { formatLevel } from './rules';
import { nimble } from './runtime';

export function drawNpcNimble(plugin: EmberVaultPlugin, el: HTMLElement, ctx: NoteCardContext): void {
	if (ctx.player) return;
	const ref = statblockName(ctx.fm.statblock);
	const base = ref ? nimble().index.get(ref, ctx.path) : undefined;
	const name = fmText(ctx.fm.title).trim() || ctx.path.replace(/^.*\//, '').replace(/\.md$/i, '');
	const monster = npcMonster(name, ctx.fm, base?.monster);
	if (!ref && !monster) return;
	const row = el.createDiv({ cls: 'nimble-npc-stats' });
	if (monster) {
		const lvl = formatLevel(monster.level);
		if (lvl) {
			const s = row.createSpan({ cls: 'nimble-npc-stat is-level' });
			s.createSpan({ cls: 'nimble-npc-stat-label', text: 'Level' });
			s.createSpan({ cls: 'nimble-npc-stat-value', text: lvl });
		}
		const armor = row.createSpan({ cls: 'nimble-npc-stat is-armor' });
		armorGlyph(armor, monster.armor);
		armor.createSpan({ cls: 'nimble-npc-stat-label', text: 'Armor' });
		const hp = row.createSpan({ cls: 'nimble-npc-stat is-hp', attr: { 'aria-label': `${monster.hp} HP` } });
		heartGlyph(hp, 14);
		hp.createSpan({ cls: 'nimble-npc-stat-value', text: String(monster.hp) });
		const speed = row.createSpan({ cls: 'nimble-npc-stat is-speed' });
		speed.createSpan({ cls: 'nimble-npc-stat-label', text: 'Speed' });
		speed.createSpan({ cls: 'nimble-npc-stat-value', text: parseMovement(monster.movement).display ?? '6' });
	}
	// The block it uses, as a reference: hover for the block, click for the quick look.
	if (ref) row.appendChild(createInlineRef(plugin, ref, ctx.path));
	if (!monster) return;
	const b = pill(row, { tag: 'button', cls: 'nimble-npc-fight', icon: evIcon('attack'), text: 'Add to fight', attr: { 'aria-label': `Add ${name} to the encounter` } });
	b.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void nimble().addToEncounter(monster, ctx.path);
	});
}
