// Battle notes in a Nimble campaign you play in: the GM's encounter block card on Nimble's paper,
// with core's battle-note parts (core/battle-notes.ts): how it went, who you fought (monster names
// open lore cards, not stat blocks), where, when, loot, notes, and Edit.

import { MarkdownPostProcessorContext, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import type { EncounterDef } from '../../core/encounter-def';
import { BattleEditOptions, battleEditButton, battleFacts, battleNotesText, outcomePill } from '../../core/battle-notes';
import { createInlineRef } from './inline-ref';
import { appendRichText } from '../../core/markdown';
import { wireWikiLinks } from '../../core/wiki-links';
import { searchMonsters } from './suggest';
import { nimble } from './runtime';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';

/** The battle notes dialog in Nimble's look, the bestiary's names suggested as you type a foe. */
export const nimbleBattleEdit = (): BattleEditOptions => ({ system: 'nimble', suggest: (q) => searchMonsters(nimble().index.all(), q, 20).map(e => e.name) });

export function renderBattleNotes(plugin: EmberVaultPlugin, el: HTMLElement, def: EncounterDef, ctx: MarkdownPostProcessorContext, save: (next: EncounterDef) => void): void {
	const app = plugin.app;
	const card = el.createDiv({ cls: 'nimble-encounter-block nimble-battle-notes ev-battle-notes' });
	applyLook(card, 'nimble');
	const head = card.createDiv({ cls: 'encounter-block-head' });
	setIcon(head.createSpan({ cls: 'encounter-block-icon' }), evIcon('swords'));
	head.createSpan({ cls: 'encounter-block-name', text: def.name });
	outcomePill(head, def, save);

	const list = card.createDiv({ cls: 'encounter-block-monsters' });
	for (const m of def.monsters) {
		const row = list.createDiv({ cls: 'encounter-chip battle-foe' });
		row.createSpan({ cls: 'encounter-count-n battle-foe-count', text: `${m.count}×` });
		// In the bestiary or the player's notes: a lore card on hover. Otherwise just the name as written.
		if (nimble().index.get(m.name, ctx.sourcePath)) row.appendChild(createInlineRef(plugin, m.name, ctx.sourcePath));
		else appendRichText(row.createSpan({ cls: 'battle-foe-name' }), m.written ?? m.name);
	}
	if (!def.monsters.length) list.createDiv({ cls: 'encounter-block-empty', text: 'No foes yet' });
	wireWikiLinks(list, app, ctx.sourcePath);

	battleFacts(card, app, def, ctx.sourcePath);
	battleNotesText(card, app, def, ctx.sourcePath, 'encounter-block-notes');

	const bar = card.createDiv({ cls: 'encounter-block-actions' });
	battleEditButton(bar, app, def, save, nimbleBattleEdit());
}
