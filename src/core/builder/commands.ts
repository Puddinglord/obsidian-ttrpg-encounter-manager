// The builder's ways in for every game: New monster…, New spell…, New item…
// (for the active note's system), and the Edit button on blocks in notes.

import { MarkdownPostProcessorContext, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import { replaceEncounterBlock } from '../encounter-def';
import { EntityKind, kindAvailable, kindsOf, openBuilder } from './frame';

/** The commands (their ids are kept from when only Nimble had them, so hotkeys still work). */
export function registerBuilderCommands(plugin: NimbleStatblocksPlugin): void {
	const cmd = (kind: EntityKind, name: string, icon: string) => {
		plugin.addCommand({
			id: `new-${kind}`, name, icon,
			callback: () => {
				const system = plugin.system(plugin.app.workspace.getActiveFile()?.path);
				if (!openBuilder(plugin, { kind, system: system.id })) {
					const can = kindsOf(system.id).map(k => k.label.toLowerCase());
					new Notice(can.length ? `${system.name} can't build a ${kind} yet. It can build: ${can.join(', ')}.` : `${system.name} has no builder yet.`);
				}
			},
		});
	};
	cmd('monster', 'New monster…', 'skull');
	cmd('spell', 'New spell…', 'wand-2');
	cmd('item', 'New item…', 'backpack');
}

/** Write a block's new body over the old one, where it is in the note. False (with a notice) when the note changed meanwhile. */
export async function rewriteBlock(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, next: string, lang: string, what = 'save it'): Promise<boolean> {
	const info = ctx.getSectionInfo(el);
	const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
	if (!info || !file) { new Notice(`Couldn't find this block in the note to ${what}.`); return false; }
	let ok = false;
	try {
		await plugin.app.vault.process(file, (text) => {
			const out = replaceEncounterBlock(text, info.lineStart, info.lineEnd, source, next, lang);
			ok = out !== null;
			return out ?? text;
		});
	} catch (e) {
		console.error('Ember Vault: could not rewrite the block', e);
	}
	if (!ok) new Notice(`Couldn't ${what}: the note changed since this was shown. Nothing was written.`);
	return ok;
}

/**
 * A small Edit button on a block in a note: opens the system's builder on it,
 * and Save writes the block back in place. Only where the block can be found to save.
 */
export function addEditButton(plugin: NimbleStatblocksPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, o: { system: string; kind: EntityKind; lang: string; source: string; seed: unknown; unread?: number }): void {
	if (!kindAvailable(o.system, o.kind) || !ctx.getSectionInfo(el)) return;
	const btn = el.createEl('button', { cls: 'nimble-block-edit clickable-icon', attr: { 'aria-label': `Edit in the ${o.kind} builder` } });
	setIcon(btn, 'pencil');
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		openBuilder(plugin, { system: o.system, kind: o.kind, seed: o.seed, sourcePath: ctx.sourcePath, unread: o.unread, writeBack: (body) => rewriteBlock(plugin, el, ctx, o.source, body, o.lang) });
	});
}
