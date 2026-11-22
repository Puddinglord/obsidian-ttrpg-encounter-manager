// The small parts 5e's character sheet and its NPCs' mini sheet share, in the
// book's dress (the design study's 50-5e and 70-5e-sheets): AC in a gold-rimmed
// heater shield, a gold plate for a number, a damage roll that shows its dice
// and its type's icon, and the diamond that marks proficiency.

import { setTooltip } from 'obsidian';
import { damageIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { formatDice } from './sheet-actions';

const f = (n: number) => n.toFixed(2);

/** A heater shield's outline in a w × h box, inset by i. */
function shieldPath(w: number, h: number, i: number): string {
	const x0 = i, x1 = w - i, y0 = i, y1 = h - i, W = x1 - x0, H = y1 - y0, cx = w / 2, r = W * 0.1;
	return `M${f(x0)} ${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}H${f(x1 - r)}Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}V${f(y0 + H * 0.46)}`
		+ `C${f(x1)} ${f(y0 + H * 0.78)} ${f(cx + W * 0.24)} ${f(y0 + H * 0.92)} ${f(cx)} ${f(y1)}C${f(cx - W * 0.24)} ${f(y0 + H * 0.92)} ${f(x0)} ${f(y0 + H * 0.78)} ${f(x0)} ${f(y0 + H * 0.46)}Z`;
}

/** Armor Class on a gold-rimmed shield with a tinted chief, "AC" on it when it's big enough. */
export function acShield(parent: HTMLElement, ac: number, size: number, title?: string): HTMLElement {
	const w = size, h = Math.round(size * (size >= 38 ? 1.2 : 1.16)), sm = size < 32;
	const rim = sm ? 1.3 : size >= 52 ? 2.6 : 2;
	const el = parent.createSpan({ cls: `dnd5e-shield${sm ? ' is-sm' : ''}` });
	el.setCssProps({ '--d5-shield-w': `${w}px`, '--d5-shield-h': `${h}px` });
	if (title) setTooltip(el, title, { delay: 350 });
	const svg = el.createSvg('svg', { attr: { viewBox: `0 0 ${w} ${h}`, width: String(w), height: String(h), 'aria-hidden': 'true' } });
	svg.createSvg('path', { cls: 'rim', attr: { d: shieldPath(w, h, 0.4) } });
	svg.createSvg('path', { cls: 'face', attr: { d: shieldPath(w, h, rim) } });
	if (!sm) {
		const i2 = rim + 0.5, r = (w - 2 * i2) * 0.1, band = h * 0.25;
		svg.createSvg('path', { cls: 'band', attr: { d: `M${f(i2)} ${f(i2 + r)}Q${f(i2)} ${f(i2)} ${f(i2 + r)} ${f(i2)}H${f(w - i2 - r)}Q${f(w - i2)} ${f(i2)} ${f(w - i2)} ${f(i2 + r)}V${f(i2 + band)}H${f(i2)}Z` } });
		svg.createSvg('path', { cls: 'edge', attr: { d: shieldPath(w, h, rim + 2.2) } });
	}
	if (!sm && size >= 38) el.createEl('small', { text: 'AC' });
	el.createEl('b', { text: String(ac) });
	return el;
}

/** The gold-rimmed hexagonal plate for a number on the banner (Initiative, Speed, Proficiency). */
export function plateFrame(parent: HTMLElement): SVGSVGElement {
	const svg = parent.createSvg('svg', { cls: 'dnd5e-plate-frame', attr: { viewBox: '0 0 62 32', preserveAspectRatio: 'none', 'aria-hidden': 'true' } });
	svg.createSvg('path', { cls: 'rim', attr: { d: 'M1 16 9 1.5h44L61 16l-8 14.5H9Z' } });
	svg.createSvg('path', { cls: 'in', attr: { d: 'M5 16l6.3-11h39.4L57 16l-6.3 11H11.3Z' } });
	return svg;
}

/** The type's name for a damage word ("fire" → "Fire"). */
const typeName = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/**
 * A damage roll: the dice, and the damage type as its icon (its name in the tooltip).
 * Every damage button on a sheet is one width (styles.css, `.dnd5e-dmg`).
 */
export function damageButton(parent: HTMLElement, expr: string, type: string | undefined, onRoll: () => void, cls = ''): HTMLElement {
	const icon = damageIcon(type);
	const what = type ? `${typeName(type)} damage` : 'damage';
	const b = pill(parent, { tag: 'button', icon: icon?.icon, text: formatDice(expr), cls: `dnd5e-dmg ${cls}`.trim(), attr: { 'aria-label': `Roll ${formatDice(expr)} ${what}` } });
	setTooltip(b, `${formatDice(expr)} ${what}`, { delay: 350 });
	b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onRoll(); });
	return b;
}

/** Proficiency as a diamond: hollow (none), filled (proficient), ringed (expertise). */
export function profMark(parent: HTMLElement, state: 0 | 1 | 2, tag: 'span' | 'button' = 'span', label?: string): HTMLElement {
	const el = parent.createEl(tag, { cls: `dnd5e-pm${state === 2 ? ' is-expert' : state ? ' is-prof' : ''}` });
	el.setAttr('aria-label', label ?? (state === 2 ? 'Expertise' : state ? 'Proficient' : 'Not proficient'));
	return el;
}

/** Gold-leaf corners on a framed card (drawn by one mask in styles.css). */
export function corners(parent: HTMLElement): HTMLElement {
	return parent.createSpan({ cls: 'dnd5e-corners', attr: { 'aria-hidden': 'true' } });
}
