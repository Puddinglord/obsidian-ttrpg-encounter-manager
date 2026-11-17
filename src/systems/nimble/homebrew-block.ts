// ```nimble-spell and ```nimble-item blocks: a homebrew spell or item shown as
// the compendium's own card, in reading view and Live Preview.

import type EmberVaultPlugin from '../../../main';
import { Compendium, CompendiumHit } from './compendium';
import { pluginCardOptions, renderHitCard } from './compendium-card';
import { addEditButton } from './builder-register';
import { ITEM_LANG, itemForCompendium, parseItemBlock, parseSpellBlock, SPELL_LANG, unreadLines } from './homebrew-def';

/** The card the compendium would show for one homebrew entry. */
export function homebrewHit(kind: 'spell' | 'item', body: string): CompendiumHit | null {
	if (kind === 'spell') {
		const s = parseSpellBlock(body);
		return s ? new Compendium({ spells: [s] }).all()[0] ?? null : null;
	}
	const it = parseItemBlock(body);
	return it ? new Compendium({ items: [itemForCompendium(it)] }).all()[0] ?? null : null;
}

export function registerHomebrewBlocks(plugin: EmberVaultPlugin): void {
	for (const [lang, kind] of [[SPELL_LANG, 'spell'], [ITEM_LANG, 'item']] as const) {
		plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
			const hit = homebrewHit(kind, source);
			if (!hit) {
				const err = el.createDiv({ cls: 'nimble-error' });
				err.createEl('strong', { text: `This ${kind} needs a name. ` });
				err.appendText(`Add a line like "name: ${kind === 'spell' ? 'Ember Lash' : 'Lantern of Echoes'}" to this block.`);
				return;
			}
			const wrap = el.createDiv({ cls: 'nimble-homebrew' });
			renderHitCard(wrap, hit, pluginCardOptions(plugin, hit.name));
			const seed = kind === 'spell' ? { spell: parseSpellBlock(source), editing: true } : { item: parseItemBlock(source), editing: true };
			addEditButton(plugin, el, ctx, { kind, lang, source, seed, unread: unreadLines(source, kind) });
		});
	}
}
