// A ```5e-<kind> block (a class, a subclass, a feat, a species, a background)
// in reading view: the compendium's own card for it, in the book's dress for
// the note's edition. Core reads and checks the block
// (core/content/blocks-ui.ts) and lists what's wrong under the card.

import type EmberVaultPlugin from '../../../main';
import { renderCard5e } from './cards';
import { contentHit5e, Kind5e, KIND5E } from './compendium';
import { dnd5e } from './runtime';

/** The card for a block's entry (the fields that checked out). */
export function draw5eContent(el: HTMLElement, entry: { kind: string; value: Record<string, unknown> }, ctx: { plugin: EmberVaultPlugin; sourcePath: string }): void {
	if (!(entry.kind in KIND5E)) return;
	const kind = entry.kind as Kind5e;
	const rt = dnd5e();
	const hit = contentHit5e(kind, entry.value, rt.edition(ctx.sourcePath), KIND5E[kind].label);
	if (!hit) return;
	// A card in the note, as a ```5e-spell is.
	el.addClass('dnd5e-homebrew');
	renderCard5e(el, hit, rt.cardOptions(ctx.sourcePath));
}
