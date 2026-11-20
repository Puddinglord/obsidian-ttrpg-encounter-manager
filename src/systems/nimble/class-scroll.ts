// A class name as a heading, between two engraved scrolls (design study,
// 71d-nimble-scroll): a notched end cap, a reach that stretches into the spare
// width, two volutes cradling the class's own motif in the Heroes ochre, a bar and
// a diamond tip. The right scroll is the left one mirrored. Narrow panels get the
// compact scroll (cap, short bar, motif). Every shape is a constant drawn with
// core's drawSvg; the class name is set as text.

import { drawSvg } from '../../core/svg';

/** Each class's motif, filled silhouettes drawn for a 24 × 24 box. */
const MOTIFS: Record<string, string> = {
	Berserker: '<path d="M10.9 1.6 12 0l1.1 1.6V23h-2.2z"/><path d="M10.9 8.4C8.6 8 6.4 6.2 4.6 3.2 2.4 5.8 1.4 8.6 1.6 10L4 12l-2.4 2c-.2 1.4.8 4.2 3 6.8 1.8-3 4-4.8 6.3-5.2zM13.1 8.4c2.3-.4 4.5-2.2 6.3-5.2 2.2 2.6 3.2 5.4 3 6.8L20 12l2.4 2c.2 1.4-.8 4.2-3 6.8-1.8-3-4-4.8-6.3-5.2z"/>',
	Commander: '<path fill-rule="evenodd" d="M5 3.4h2v18.2l-1 2-1-2zM7 4h14.5L17.8 8.6l3.7 4.6H7zM10 6.6l2.8 2.2 2.8-2.2v2.2l-2.8 2.2-2.8-2.2z"/><path d="M4.3 2.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0Z"/>',
	Hunter: '<path d="M4.6 10.9h13v2.2h-13z"/><path d="M15.4 12c1.6-2.6 4.2-2.8 6.6-1.6l1.8 1.6-1.8 1.6c-2.4 1.2-5 1-6.6-1.6z"/><path d="M8.6 11.2C7 7.4 4.2 5.4.6 5c.4 3.2 2.8 5.8 8 6.2zM8.6 12.8c-1.6 3.8-4.4 5.8-8 6.2.4-3.2 2.8-5.8 8-6.2z"/>',
	Mage: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4.4C12.8512 9.568 14.432 11.1488 19.6 12C14.432 12.8512 12.8512 14.432 12 19.6C11.1488 14.432 9.568 12.8512 4.4 12C9.568 11.1488 11.1488 9.568 12 4.4Z"/><path d="M3.4000000000000004 4.9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0ZM17.6 4.9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0ZM3.4000000000000004 19.1a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0ZM17.6 19.1a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z"/>',
	Oathsworn: '<path fill-rule="evenodd" d="M12 1.8l7.6 2.6V11c0 5.4-3.5 9-7.6 11.4C7.9 20 4.4 16.4 4.4 11V4.4zM4.4 9.3h15.2v6.2H4.4z"/><path d="M.6 10.3h22.8l-2.2 2.1 2.2 2.1H.6l2.2-2.1z"/>',
	Shadowmancer: '<path fill-rule="evenodd" d="M12 2.6c3.8 0 5 4 5 7.6V21l-1.7-1.3-1.6 1.3-1.7-1.3-1.7 1.3-1.6-1.3L7 21V10.2c0-3.6 1.2-7.6 5-7.6zM12 7.4c-1.8 0-2.8 1.5-2.8 3.3 0 1.6 1.2 2.9 2.8 2.9s2.8-1.3 2.8-2.9c0-1.8-1-3.3-2.8-3.3z"/><path d="M10.1 10.6a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0ZM12.299999999999999 10.6a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0Z"/><path d="M3.4 8.6c2 0 2.4 2 2.4 3.8v7.4L4.9 19l-.9.8-.9-.8-.9.8-.9-.8-.9.8v-7.4c0-1.8.6-3.8 3.1-3.8zM20.6 8.6c-2 0-2.4 2-2.4 3.8v7.4l.9-.8.9.8.9-.8.9.8.9-.8.9.8v-7.4c0-1.8-.6-3.8-3.1-3.8z" transform="translate(-.3 0)"/>',
	Shepherd: '<g transform="translate(-3 0)"><path d="M9.4 22.6V9.2c0-4.6 2.4-7 5.6-7s5.6 2.4 5.6 5.4c0 2.8-1.8 4.4-4 4.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15 4.6000000000000005C15.392 6.28 16.12 7.008 17.8 7.4C16.12 7.792000000000001 15.392 8.52 15 10.2C14.608 8.52 13.88 7.792000000000001 12.2 7.4C13.88 7.008 14.608 6.28 15 4.6000000000000005Z"/></g>',
	Songweaver: '<path d="M8 19.6C4.2 17 4 11.4 6.6 8.2 8.2 6.2 7.2 3.6 4.8 2.8M16 19.6c3.8-2.6 4-8.2 1.4-11.4-1.6-2-.6-4.6 1.8-5.4M5.6 6.8h12.8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M10 7v12M12 7v12M14 7v12" stroke="currentColor" stroke-width="1"/><path d="M6.6 18.2h10.8c-.6 3-2.6 4.6-5.4 4.6s-4.8-1.6-5.4-4.6z"/>',
	Stormshifter: '<path fill-rule="evenodd" d="M6.2 13.4C3.2 13.4 2 10.8 3.4 9 3.9 6.6 6.4 5.6 8 6.4c1-2.9 5.6-3.8 7.7-1 2.6-1.1 5.6.9 5.2 3.6 2 .8 1.7 4.4-.7 4.4zM12.2 11.4l-1.4 2.6h3.4l1.8-2.6z"/><path d="M11.6 12.6 8.4 18h3.2l-1.8 5.4 6.6-7.6h-3.3l2-3.2z"/>',
	'The Cheat': '<g transform="rotate(-14 7 12.5)"><path fill-rule="evenodd" d="M3.4 7h7.2c1.1 0 2 .9 2 2v7.2c0 1.1-.9 2-2 2H3.4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2zM3.4499999999999997 10.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0ZM5.85 12.6a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0ZM8.25 15.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0Z"/></g><path d="M18 1l1.8 3v10h-3.6V4zM13.6 14h8.8v1.8h-8.8zM17.1 15.8h1.8v4.6h-1.8z"/><path d="M16.5 21.7a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z"/>',
	Zephyr: '<path d="M2.6 3.6h18.8M5 8h14.6M7.6 12.4h10.6M9.6 16.8h6.6M11.4 21.2h2.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
	Manawright: '<path fill-rule="evenodd" d="M8.91 4.19L9.63 1.05L14.37 1.05L15.09 4.19L15.34 4.29L18.06 2.58L21.42 5.94L19.71 8.66L19.81 8.91L22.95 9.63L22.95 14.37L19.81 15.09L19.71 15.34L21.42 18.06L18.06 21.42L15.34 19.71L15.09 19.81L14.37 22.95L9.63 22.95L8.91 19.81L8.66 19.71L5.94 21.42L2.58 18.06L4.29 15.34L4.19 15.09L1.05 14.37L1.05 9.63L4.19 8.91L4.29 8.66L2.58 5.94L5.94 2.58L8.66 4.29ZM12 6.6l4.4 5.4-4.4 5.4-4.4-5.4z"/><path d="M12 8.8l2.6 3.2-2.6 3.2-2.6-3.2z"/>',
	Hexbinder: '<path d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path fill-rule="evenodd" d="M5.4 12c2.6-4.2 10.6-4.2 13.2 0-2.6 4.2-10.6 4.2-13.2 0zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0Z"/><path d="M10.8 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z"/>',
	Psion: '<path fill-rule="evenodd" d="M11.1 3.2C8 2.4 5.6 3.6 4.6 5.6 2.6 6.2 1.8 8.4 2.6 10.2c-1.2 1.6-1 4 .6 5.2-.2 2.4 1.6 4.4 4 4.4 1.2 1.4 3 1.6 3.9.8zM4.8 9.2c1.6-1 3.6-.8 4.8.4-1.4-.4-3-.4-4.8-.4zM5 15c1.4.2 2.8-.4 3.6-1.6-.2 1.4-1.6 2.4-3.6 1.6zM12.9 3.2c3.1-.8 5.5.4 6.5 2.4 2 .6 2.8 2.8 2 4.6 1.2 1.6 1 4-.6 5.2.2 2.4-1.6 4.4-4 4.4-1.2 1.4-3 1.6-3.9.8zM19.2 9.2c-1.6-1-3.6-.8-4.8.4 1.4-.4 3-.4 4.8-.4zM19 15c-1.4.2-2.8-.4-3.6-1.6.2 1.4 1.6 2.4 3.6 1.6z"/>',
	Revenant: '<path fill-rule="evenodd" d="M12 2.2c-5.2 0-8 3.6-8 8 0 3 1.6 5 3.5 5.8v3.4c0 .9.6 1.6 1.5 1.6h6c.9 0 1.5-.7 1.5-1.6V16c1.9-.8 3.5-2.8 3.5-5.8 0-4.4-2.8-8-8-8zM6.3999999999999995 10.4a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0ZM13 10.4a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0ZM12 13l1.1 2.2h-2.2zM10.1 18.2h.9V21h-.9zM13 18.2h.9V21H13zM12.6 2.1l-1.5 2.9 1.6 1.7-1.2 1.9.6.2 1.5-2.1-1.5-1.7 1.2-2.9z"/>',
};
const ALIASES: Record<string, string> = { cheat: 'The Cheat' };

const H = 28;
const CAP = '<path class="ink" d="M1 9.6h9v8.8H1a4.4 4.4 0 0 0 0-8.8z"/>';
const REACH = '<path class="ink" d="M0 12.8h100v2.4H0z"/>';
const ORN = '<path class="ink" d="M-1 12.8h5.4l1.6 1.2-1.6 1.2H-1zM65 12.6h18v2.8H65zM85 14l5-5 5 5-5 5z"/><path class="curl" stroke-width="2.4" d="M3 12.9c8-.4 14-3.6 17-7.2 2.2-2.7 5.4-3.1 7.2-1.2 1.8 1.9.8 4.9-1.8 4.9-1.8 0-2.6-1.8-1.4-3M3 15.1c8 .4 14 3.6 17 7.2 2.2 2.7 5.4 3.1 7.2 1.2 1.8-1.9.8-4.9-1.8-4.9-1.8 0-2.6 1.8-1.4 3"/>';
const COMPACT = '<path class="ink" d="M1 10.4h8v7.2H1a3.6 3.6 0 0 0 0-7.2zM9 13.1h13v1.8H9z"/>';
/** The ornament's width, where the motif sits in it, and the compact scroll's width. */
const OW = 95;
const MX = 34;
const CW = 52;

/** The motif for a class (homebrew classes get the Commander's banner). */
function motif(className: string): string {
	const k = className.trim().toLowerCase();
	const hit = Object.keys(MOTIFS).find(m => m.toLowerCase() === k) ?? ALIASES[k];
	return MOTIFS[hit ?? ''] ?? MOTIFS.Commander;
}

function side(parent: HTMLElement, m: string, right: boolean): void {
	const el = parent.createSpan({ cls: `ns-scroll-side${right ? ' is-r' : ''}`, attr: { 'aria-hidden': 'true' } });
	const full = el.createSpan({ cls: 'ns-scroll-full' });
	drawSvg(full, CAP, 10, H, 'ns-scroll-cap');
	drawSvg(full, REACH, 100, H, 'ns-scroll-reach').setAttribute('preserveAspectRatio', 'none');
	drawSvg(full, `${ORN}<g class="m" transform="translate(${MX} 2)">${m}</g>`, OW, H, 'ns-scroll-orn');
	drawSvg(el, `${COMPACT}<g class="m" transform="translate(28 2)">${m}</g>`, CW, H, 'ns-scroll-compact');
}

/** The heading: scroll, the class's name, scroll. */
export function renderClassScroll(parent: HTMLElement, className: string, cls = ''): HTMLElement {
	const head = parent.createDiv({ cls: `ns-scroll${cls ? ` ${cls}` : ''}` });
	const m = motif(className);
	side(head, m, false);
	head.createEl('b', { cls: 'ns-scroll-title', text: className });
	side(head, m, true);
	return head;
}
