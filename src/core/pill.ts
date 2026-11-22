// The one way to draw a pill, chip or compact button with an icon and/or a
// label: [icon] [text] on one centre line. The layout comes from `.ev-pill` in
// styles.css (with the shared pill rule); the look (colours, border, padding,
// size) stays with the caller's own class. e2e/align.mjs measures the result.

import { setIcon, setTooltip } from 'obsidian';

export interface PillOptions {
	/** A Lucide icon name, drawn before the text at the text's size. */
	icon?: string;
	text?: string;
	/** 'span' by default. */
	tag?: 'span' | 'button' | 'a';
	/** The caller's classes (space-separated), for the pill's look. */
	cls?: string;
	/** Tooltip, which is also the accessible label. */
	title?: string;
	attr?: Record<string, string>;
}

/** A pill in `parent` (or detached, with null): `<tag class="ev-pill …"><span class="ev-pill-icon"><svg></span><span class="ev-pill-text">…</span></tag>`. */
export function pill(parent: HTMLElement | null, opts: PillOptions): HTMLElement {
	const info: DomElementInfo = { cls: ['ev-pill', ...(opts.cls ?? '').split(/\s+/).filter(Boolean)], attr: opts.attr };
	const tag = opts.tag ?? 'span';
	const el = parent ? parent.createEl(tag, info) : createEl(tag, info);
	if (tag === 'a' && !el.hasAttribute('href')) el.setAttr('href', '#');
	setPill(el, opts);
	if (opts.title) setTooltip(el, opts.title, { delay: 350 });
	return el;
}

/** Redraw a pill's icon and text (a toggle that changes its label, a count that moves). */
export function setPill(el: HTMLElement, opts: Pick<PillOptions, 'icon' | 'text'>): void {
	el.empty();
	el.toggleClass('is-icon-only', !!opts.icon && !opts.text);
	if (opts.icon) setIcon(el.createSpan({ cls: 'ev-pill-icon', attr: { 'aria-hidden': 'true' } }), opts.icon);
	if (opts.text) el.createSpan({ cls: 'ev-pill-text', text: opts.text });
}
