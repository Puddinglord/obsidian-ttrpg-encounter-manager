// What 5e adds to a location's card (core's campaign cards): the boxed text to read aloud when the
// party arrives, as 5e adventures open a keyed area. From the place's `read_aloud:` property. GM only.

import { setIcon } from 'obsidian';
import type { NoteKindExtension, NoteCardContext } from '../../core/note-kinds';
import { fieldText } from '../../core/note-kinds';
import { appendRichText } from '../../core/markdown';
import { evIcon } from '../../core/icons';

export const LOCATION_FIELDS_5E = [
	{ key: 'read_aloud', label: 'Read aloud', gmOnly: true, hideInStats: true },
] as const satisfies NoteKindExtension['fields'];

export function drawLocation5e(el: HTMLElement, ctx: NoteCardContext): void {
	if (ctx.player) return;
	const text = fieldText({ key: 'read_aloud', label: '' }, ctx.fm.read_aloud);
	if (!text) return;
	const box = el.createDiv({ cls: 'ev-cq-read' });
	const k = box.createSpan({ cls: 'ev-cq-read-label' });
	setIcon(k.createSpan({ cls: 'ev-cq-read-icon' }), evIcon('feather'));
	k.createSpan({ text: 'Read aloud' });
	appendRichText(box.createEl('p', { cls: 'ev-cq-read-text' }), text);
}
