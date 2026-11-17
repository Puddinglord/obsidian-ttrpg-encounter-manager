// The builder's ways in that don't belong to another view: commands, and
// the Edit button on blocks in notes.

import { MarkdownPostProcessorContext, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { EntityKind, kindAvailable, openBuilder } from './entity-builder';
import { rewriteBlock } from './statblock-issues';
import { registerMonsterBuilder } from './entity-monster-ui';
import { registerHomebrewBuilders } from './entity-homebrew-ui';

export function registerBuilders(plugin: NimbleStatblocksPlugin): void {
	registerMonsterBuilder();
	registerHomebrewBuilders();
	const cmd = (kind: EntityKind, name: string, icon: string) => {
		if (!kindAvailable(kind)) return;
		plugin.addCommand({ id: `new-${kind}`, name, icon, callback: () => { openBuilder(plugin, { kind }); } });
	};
	cmd('monster', 'New monster…', 'skull');
	cmd('spell', 'New spell…', 'wand-2');
	cmd('item', 'New item…', 'backpack');
}

/**
 * A small Edit button on a block in a note: opens the builder on it, and Save
 * writes the block back in place. Only where the block can be found to save.
 */
export function addEditButton(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, o: { kind: EntityKind; lang: string; source: string; seed: unknown }): void {
	if (!kindAvailable(o.kind) || !ctx.getSectionInfo(el)) return;
	const btn = el.createEl('button', { cls: 'nimble-block-edit clickable-icon', attr: { 'aria-label': `Edit in the ${o.kind} builder` } });
	setIcon(btn, 'pencil');
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		openBuilder(plugin, { kind: o.kind, seed: o.seed, sourcePath: ctx.sourcePath, writeBack: (body) => rewriteBlock(plugin, el, ctx, o.source, body, o.lang) });
	});
}
