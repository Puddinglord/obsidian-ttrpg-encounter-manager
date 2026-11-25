// What a converted note keeps of where it came from: the original, as its own
// game writes it, in an ```ev-original block under the converted one. Plain
// text in the note, so nothing is lost: it can be shown, and converted again
// (say after the converter improves) without importing it again.
//
// ```ev-original
// game: dnd5e
// lang: 5e
// converted: 2026-11-24
// ---
// name: Goblin Warrior
// …the original block's body…
// ```
// Pure: no Obsidian imports.

import { fencedBlocks } from '../content/blocks';

export const ORIGINAL_LANG = 'ev-original';

export interface Original {
	/** The game it was written for: "dnd5e". */
	game: string;
	/** The original block's language: "5e". */
	lang: string;
	/** When it was converted: "2026-11-24". */
	converted?: string;
	/** The original block's body. */
	body: string;
}

/** The ```ev-original block's body. */
export function originalBody(o: Original): string {
	return [`game: ${o.game}`, `lang: ${o.lang}`, ...(o.converted ? [`converted: ${o.converted}`] : []), '---', o.body].join('\n');
}

/** An ```ev-original block's body read back; null when it isn't one. */
export function readOriginal(source: string): Original | null {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const cut = lines.findIndex(l => l.trim() === '---');
	if (cut < 0) return null;
	const head: Record<string, string> = {};
	for (const l of lines.slice(0, cut)) { const m = /^\s*(\w+)\s*:\s*(.*)$/.exec(l); if (m) head[m[1].toLowerCase()] = m[2].trim(); }
	const body = lines.slice(cut + 1).join('\n').replace(/^\n+|\n+$/g, '');
	if (!head.game || !head.lang || !body) return null;
	return { game: head.game, lang: head.lang, ...(head.converted ? { converted: head.converted } : {}), body };
}

/** A note's text with its first ```lang block (the converted one) replaced by `fenced`; null when it has none. */
export function replaceConverted(content: string, lang: string, fenced: string): string | null {
	const b = fencedBlocks(content, new Set([lang]))[0];
	if (!b) return null;
	const lines = content.split('\n');
	const end = b.line + (b.body ? b.body.split('\n').length : 0) + 1;
	return [...lines.slice(0, b.line), ...fenced.split('\n'), ...lines.slice(end + 1)].join('\n');
}
