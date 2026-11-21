// A content block in reading view (```5e-class, ```nimble-ancestry…): the
// entry's compendium card, drawn by its game (`content.card`), with what's
// wrong listed under it. A block with errors still shows the card for the
// fields that checked out; nothing is ever blank, and nothing in the block's
// text is set as HTML.

import type EmberVaultPlugin from '../../../main';
import { applyLook } from '../look';
import { readContentBlock } from './blocks';

const things = (n: number) => (n === 1 ? 'one thing' : `${n} things`);

/** Every game's content blocks, drawn as their cards. Call after the systems have registered. */
export function registerContentBlocks(plugin: EmberVaultPlugin): void {
	for (const [lang, { system, kind }] of plugin.content.blockKinds()) {
		plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
			const read = readContentBlock(kind, source);
			el.addClass('ev-content-block');
			applyLook(el, system);
			const card = el.createDiv({ cls: 'ev-content-card' });
			try {
				plugin.systems.get(system)?.content?.card?.(card, { kind: kind.kind, value: read.value }, { plugin, sourcePath: ctx.sourcePath });
			} catch (e) {
				console.error(`Ember Vault: could not draw a ${lang} block`, e);
				card.empty();
			}
			if (!card.childElementCount) {
				card.createDiv({ cls: 'ev-content-kind', text: kind.label });
				card.createDiv({ cls: 'ev-content-name', text: typeof read.value.name === 'string' && read.value.name.trim() ? read.value.name : `New ${kind.label.toLowerCase()}` });
			}
			if (read.errors.length || read.warnings.length) {
				const box = el.createDiv({ cls: `ev-content-issues${read.errors.length ? ' is-error' : ''}` });
				box.createDiv({
					cls: 'ev-content-issues-title',
					text: read.errors.length ? `Fix ${things(read.errors.length)} to add it to the compendium` : `Left out: ${things(read.warnings.length)}`,
				});
				const list = box.createEl('ul');
				for (const p of [...read.errors, ...read.warnings]) list.createEl('li', { text: p });
			}
			const folder = plugin.content.folder();
			if (!ctx.sourcePath.startsWith(`${folder}/`)) el.createDiv({ cls: 'ev-content-where', text: `It joins the compendium from a note in ${folder}.` });
		});
	}
}
