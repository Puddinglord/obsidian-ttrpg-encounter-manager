// The Nimble books' own glyphs, drawn as the GM's Guide prints them: HP in a filled heart, armor as a
// shield with its letter (M or H) on it, and a save's advantage as a triangle (up) or disadvantage
// (down). Stat blocks and NPC cards use them. Constant SVG strings parsed with DOMParser (never innerHTML),
// so they work in unit tests too. The shapes come from the design study (53-nimble.js).

import type { ArmorType } from './types';
import { armorLabel } from './rules';

const NS = 'http://www.w3.org/2000/svg';
const HEART = 'M12 21.2s-7.6-4.6-9.7-9.3C.8 8.5 2.9 4.4 6.7 4.4c2.2 0 3.7 1.2 5.3 3 1.6-1.8 3.1-3 5.3-3 3.8 0 5.9 4.1 4.4 7.5-2.1 4.7-9.7 9.3-9.7 9.3Z';
const SHIELD = 'M11 1.6c3.2 1.5 6.1 2.1 9.4 2.1v7.6c0 5.6-3.9 9.4-9.4 11.3-5.5-1.9-9.4-5.7-9.4-11.3V3.7c3.3 0 6.2-.6 9.4-2.1Z';
const TRI_UP = 'M1 9.25 11 .75l10 8.5Z';
const TRI_DOWN = 'M1 .75 11 9.25l10-8.5Z';

const cache = new Map<string, SVGElement>();

function svg(parent: HTMLElement, key: string, markup: string, cls: string): SVGElement {
	let el = cache.get(key);
	if (!el) {
		el = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement as unknown as SVGElement;
		cache.set(key, el);
	}
	const copy = parent.ownerDocument.importNode(el, true);
	copy.setAttribute('class', cls);
	copy.setAttribute('aria-hidden', 'true');
	parent.appendChild(copy);
	return copy;
}

/** A filled heart (HP), `size` pixels square, in the current colour. */
export function heartGlyph(parent: HTMLElement, size = 16): SVGElement {
	const s = svg(parent, 'heart', `<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="${HEART}" fill="currentColor"/></svg>`, 'nb-heart');
	s.setAttribute('width', String(size));
	s.setAttribute('height', String(size));
	return s;
}

/** The armor shield with its letter: a khaki M for medium, a charcoal H for heavy, an outline – for none. */
export function armorGlyph(parent: HTMLElement, armor: ArmorType | undefined, cls = ''): HTMLElement {
	const kind = armor === 'medium' || armor === 'heavy' ? armor : 'none';
	const el = parent.createSpan({ cls: `nb-armor is-${kind} ${cls}`.trim(), attr: { 'aria-label': armorLabel(armor), role: 'img' } });
	svg(el, 'shield', `<svg xmlns="${NS}" viewBox="0 0 22 24"><path d="${SHIELD}"/></svg>`, 'nb-armor-shape');
	el.createSpan({ cls: 'badge-value', text: kind === 'medium' ? 'M' : kind === 'heavy' ? 'H' : '–' });
	return el;
}

/** A save mark: a filled triangle, up for advantage, down for disadvantage. */
export function saveTriangle(parent: HTMLElement, down: boolean): SVGElement {
	return svg(parent, down ? 'tri-down' : 'tri-up', `<svg xmlns="${NS}" viewBox="0 0 22 10"><path d="${down ? TRI_DOWN : TRI_UP}" fill="currentColor"/></svg>`, `nb-tri ${down ? 'is-down' : 'is-up'}`);
}

/**
 * Saves as the book prints them: "STR+ DEX++ WIL−" → [STR, 1], [DEX, 2], [WIL, −1]. "ALL++" stays ALL.
 * Anything that isn't a stat and its marks is kept as written (null marks).
 */
export function parseSaves(saves: string): { stat: string; marks: number | null }[] {
	const out: { stat: string; marks: number | null }[] = [];
	for (const part of saves.replace(/,/g, ' ').split(/\s+/).filter(Boolean)) {
		const m = part.match(/^([A-Za-z]+)\s*([+\-−]+)$/);
		if (!m) { out.push({ stat: part, marks: null }); continue; }
		const signs = m[2].replace(/−/g, '-');
		const up = (signs.match(/\+/g) ?? []).length;
		const down = (signs.match(/-/g) ?? []).length;
		out.push({ stat: m[1].toUpperCase(), marks: up - down });
	}
	return out;
}
