// The ```ev-original block (original.ts) in reading view: one quiet line saying
// what it was converted from, folded; opened, the original drawn by its own
// game's block. Behind ⋯, Convert again rebuilds the converted block from the
// original with today's converter, for the note's campaign's game.

import { MarkdownRenderChild, MarkdownRenderer, Menu, Notice, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { fence } from '../builder/frame';
import { evIcon } from '../icons';
import { confirmAction } from '../touch';
import { ORIGINAL_LANG, readOriginal, replaceConverted } from './original';

export function registerOriginalBlocks(plugin: EmberVaultPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(ORIGINAL_LANG, (source, el, ctx) => {
		const o = readOriginal(source);
		const box = el.createDiv({ cls: 'ev-original' });
		if (!o) { box.createDiv({ cls: 'ev-original-head', text: 'An original from a conversion, but it can\'t be read.' }); return; }
		const from = plugin.systems.get(o.game);
		const child = new MarkdownRenderChild(box);
		ctx.addChild(child);
		// One quiet line, folded: what it was converted from. Opened, the original as its own game draws it.
		// Convert again sits behind ⋯: it runs today's converter, so a better converter fixes older notes.
		const head = box.createDiv({ cls: 'ev-original-head' });
		const toggle = head.createEl('button', { cls: 'ev-original-toggle', attr: { 'aria-expanded': 'false' } });
		setIcon(toggle.createSpan({ cls: 'ev-original-caret' }), evIcon('caret-right'));
		toggle.createSpan({ cls: 'ev-original-text', text: `Converted from ${from?.name ?? o.game}${o.converted ? ` on ${o.converted}` : ''}` });
		const more = head.createEl('button', { cls: 'ev-original-more clickable-icon', attr: { 'aria-label': 'More' } });
		setIcon(more, evIcon('more'));
		const body = box.createDiv({ cls: 'ev-original-body' });
		body.hide();
		const setOpen = (open: boolean) => {
			body.toggle(open);
			toggle.setAttr('aria-expanded', String(open));
			box.toggleClass('is-open', open);
			if (open && !body.childElementCount) void MarkdownRenderer.render(plugin.app, fence(o.lang, o.body), body, ctx.sourcePath, child);
		};
		toggle.addEventListener('click', () => setOpen(!body.isShown()));
		more.addEventListener('click', (e) => {
			const menu = new Menu();
			menu.addItem(i => i.setTitle(body.isShown() ? 'Hide the original' : 'Show the original').setIcon(evIcon('eye')).onClick(() => setOpen(!body.isShown())));
			menu.addItem(i => i.setTitle('Convert again').setIcon(evIcon('arrows-clockwise')).onClick(() => { void convertAgain(plugin, ctx.sourcePath); }));
			menu.showAtMouseEvent(e);
		});
	});
}

/** Rebuild a note's converted block from its original, for the note's campaign's game. */
export async function convertAgain(plugin: EmberVaultPlugin, path: string): Promise<boolean> {
	const file = plugin.app.vault.getFileByPath(path);
	if (!file) return false;
	const text = await plugin.app.vault.read(file);
	const block = /^ {0,3}(`{3,}|~{3,})\s*ev-original\s*\n([\s\S]*?)\n {0,3}\1\s*$/m.exec(text);
	const o = block ? readOriginal(block[2]) : null;
	const src = o ? plugin.systems.get(o.game) : undefined;
	const dst = plugin.system(path);
	const out = src?.content?.creatures?.out;
	const into = dst.content?.creatures?.in;
	if (!o || !out || !into) { new Notice(`${dst.name} can't convert this yet.`); return false; }
	const c = out({ statblock: o.body });
	if (!c) { new Notice('The original couldn\'t be read.'); return false; }
	const built = into(c);
	const written = dst.content?.writeEntry?.('monster', built.value);
	if (!written) { new Notice(`${dst.name} can't write this yet.`); return false; }
	const ok = await confirmAction(plugin.app, 'Convert again?', `The ${dst.name} stat block is built again from the original, with the converter as it is now. Changes you made to it are replaced.`, 'Convert again', true);
	if (!ok) return false;
	let done = false;
	await plugin.app.vault.process(file, t => {
		const next = replaceConverted(t, written.lang, fence(written.lang, written.body));
		done = next !== null;
		return next ?? t;
	});
	new Notice(done ? `Converted again. ${built.notes.length ? built.notes[0] : ''}`.trim() : 'There was no stat block to replace.');
	return done;
}
