// A ```nimble-<kind> block (a class, an ancestry, a boon…) in reading view: the
// compendium's own card for it, in Nimble's look. Core reads and checks the
// block (core/content/blocks-ui.ts) and lists what's wrong under the card.

import type EmberVaultPlugin from '../../../main';
import { contentTarget, KINDS_NIMBLE } from './content';
import { pluginCardOptions, renderCard, renderRuleCard } from './compendium-card';
import { applyLook } from '../../core/look';

/** The card for a block's entry (the fields that checked out). */
export function drawNimbleContent(el: HTMLElement, entry: { kind: string; value: Record<string, unknown> }, ctx: { plugin: EmberVaultPlugin; sourcePath: string }): void {
	const label = KINDS_NIMBLE.find(k => k.kind === entry.kind)?.label ?? entry.kind;
	const t = contentTarget(entry.kind, entry.value, label);
	if (!t) return;
	// On Nimble's paper as a card in the note, as a ```nimble-spell is.
	const wrap = el.createDiv({ cls: `nimble-homebrew is-${entry.kind}` });
	applyLook(wrap, 'nimble');
	if ('rule' in t) { renderRuleCard(wrap.createDiv(), t.rule, pluginCardOptions(ctx.plugin, t.rule.name)); return; }
	const target = 'hit' in t ? t.hit : t.condition;
	renderCard(wrap, target, pluginCardOptions(ctx.plugin, target.name));
}
