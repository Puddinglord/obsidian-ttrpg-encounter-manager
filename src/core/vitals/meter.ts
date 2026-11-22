// A hit point (or mana, or any track) bar, the same in every game: a label,
// − bar + and a calculator. − and + taps add up and commit once; a change
// animates (what's lost lingers, then drains; a gain lights up first). Each
// game passes the values and what a tap or the calculator does, so a sheet
// writes to its note and a tracker to its fight.
//
// The markup keeps the class names it was born with (`ns-meter…`, `ns-step`):
// Nimble's sheet styles them inside `.nimble-sheet`; any other game wraps its
// meters in `.ev-vitals` and sets the colours (styles.css, "Hit points and
// mana"). Nimble's action dots and Wound pips stay in nimble/vitals-ui.ts.

import { setIcon } from 'obsidian';
import { reducedMotion } from '../celebrate';

/**
 * What a sheet or quick look remembers between redraws: each bar's last value
 * (so a change animates), each pip row's last count, and − / + taps not applied yet.
 */
export class VitalsMemory {
	bars = new Map<string, number>();
	counts = new Map<string, number>();
	pending = new Map<string, { delta: number; timer: number }>();
}

/** A round − / + / calculator button. Icons, not text glyphs, so it looks centred. */
export function iconStep(parent: HTMLElement, icon: 'minus' | 'plus' | 'x' | 'calculator', attr: Record<string, string>, cls = 'ns-step'): HTMLButtonElement {
	const b = parent.createEl('button', { cls, attr });
	setIcon(b, icon);
	return b;
}

export interface MeterOptions {
	/** Remembered under this key ("hp", "mana"). */
	key: string;
	/** "is-hp", "is-mana". */
	cls: string;
	icon: string;
	label: string;
	cur: number;
	max: number;
	/** Temp HP: a striped part after the fill, and "+3" by the number. */
	extra?: number;
	extraLabel?: string;
	/** "Dying", "Dead". */
	state?: string;
	/** The bar's class ("ns-hp"); its numbers get `${bar}-cur` and `${bar}-max`. */
	bar: string;
	minus: string;
	plus: string;
	calc: string;
	minusOff: boolean;
	plusOff: boolean;
	onCalc: (anchor: HTMLElement) => void;
	/**
	 * − and + taps add up (the bar shows the running number and a −3 / +3), then
	 * `commit` gets the total once you stop. `floor` is the most that can come off
	 * (HP and temp HP), `soak` what's taken first (temp HP).
	 */
	taps: { floor: number; soak?: number; commit: (delta: number) => void };
	/** Icons for − / + / the calculator, when a game draws its own (Obsidian icon ids; Lucide's by default). */
	icons?: { minus?: string; plus?: string; calc?: string };
	/**
	 * Numbers in two colours, for a bar whose empty part is light: a copy of them rides
	 * in the fill (`.ns-meter-nums.is-on-fill`), so they read on the fill in one colour and
	 * on the track in another. The game's CSS sets both and clips the copy to the fill.
	 */
	twoTone?: boolean;
}

/** An HP or mana bar: label, − bar + calculator. Returns the meter (its header is `.ns-meter-head`). */
export function renderMeter(wrap: HTMLElement, o: MeterOptions, mem: VitalsMemory): HTMLElement {
	const m = wrap.createDiv({ cls: `ns-meter ${o.cls}` });
	const head = m.createDiv({ cls: 'ns-meter-head' });
	const lab = head.createSpan({ cls: 'ns-meter-label' });
	setIcon(lab.createSpan({ cls: 'ns-meter-icon' }), o.icon);
	lab.createSpan({ text: o.label });
	if (o.extra) head.createSpan({ cls: 'ns-meter-extra', text: o.extraLabel ?? '' });
	if (o.state) head.createSpan({ cls: 'ns-meter-state', text: o.state });
	const row = m.createDiv({ cls: 'ns-meter-row' });
	const minus = iconStep(row, 'minus', { 'aria-label': o.minus }, 'ns-step ns-meter-step');
	const bar = row.createEl('button', { cls: `ns-meter-bar ${o.bar}`, attr: { 'aria-label': o.calc } });
	const pct = (v: number) => `${o.max ? Math.round(Math.max(0, Math.min(1, v / o.max)) * 1000) / 10 : 0}%`;
	const fill = bar.createDiv({ cls: 'ns-meter-fill' });
	fill.setCssProps({ '--ns-fill': pct(o.cur) });
	animateBar(mem, o.key, o.cur, bar, fill, pct);
	if (o.extra) bar.createDiv({ cls: 'ns-meter-extra-fill' }).setCssProps({ '--ns-from': pct(o.cur), '--ns-fill': pct(o.extra) });
	const numbers = (parent: HTMLElement, cls: string) => {
		const nums = parent.createSpan({ cls });
		nums.createSpan({ cls: `${o.bar}-cur ns-meter-cur`, text: String(o.cur) });
		nums.createSpan({ cls: 'ns-meter-slash', text: '/' });
		nums.createSpan({ cls: `${o.bar}-max ns-meter-max`, text: String(o.max) });
		if (o.extra) nums.createSpan({ cls: 'ns-meter-plus', text: `+${o.extra}` });
		return nums;
	};
	numbers(bar, 'ns-meter-nums');
	if (o.twoTone) numbers(fill, 'ns-meter-nums is-on-fill').setAttr('aria-hidden', 'true');
	const plus = iconStep(row, 'plus', { 'aria-label': o.plus }, 'ns-step ns-meter-step');
	const calc = iconStep(row, 'calculator', { 'aria-label': o.calc }, 'ns-step ns-meter-calc');
	if (o.icons?.minus) { minus.empty(); setIcon(minus, o.icons.minus); }
	if (o.icons?.plus) { plus.empty(); setIcon(plus, o.icons.plus); }
	if (o.icons?.calc) { calc.empty(); setIcon(calc, o.icons.calc); }
	minus.disabled = o.minusOff;
	plus.disabled = o.plusOff;
	minus.addEventListener('click', () => tap(mem, o, -1, bar));
	plus.addEventListener('click', () => tap(mem, o, 1, bar));
	bar.addEventListener('click', () => o.onCalc(bar));
	calc.addEventListener('click', () => o.onCalc(bar));
	return m;
}

/** − / + on a bar: add up while tapping, then commit the total once (one change, one animation). */
function tap(mem: VitalsMemory, o: MeterOptions, d: number, bar: HTMLElement): void {
	const p = mem.pending.get(o.key) ?? { delta: 0, timer: 0 };
	p.delta = Math.max(o.taps.floor, Math.min(o.max - o.cur, p.delta + d));
	const win = bar.win;
	win.clearTimeout(p.timer);
	mem.pending.set(o.key, p);
	// The running number: temp HP soaks damage first.
	const soaked = p.delta < 0 ? Math.min(o.taps.soak ?? 0, -p.delta) : 0;
	// Every copy of the numbers (one, or two for a two-tone bar) shows the running number and the change.
	bar.querySelectorAll<HTMLElement>('.ns-meter-cur').forEach(el => el.setText(String(Math.max(0, Math.min(o.max, o.cur + p.delta + soaked)))));
	bar.querySelectorAll<HTMLElement>('.ns-meter-nums').forEach(nums => {
		const tag = nums.querySelector<HTMLElement>(':scope > .ns-meter-delta') ?? nums.createSpan({ cls: 'ns-meter-delta' });
		tag.setText(p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `−${-p.delta}` : '±0');
		tag.toggleClass('is-gain', p.delta > 0);
		tag.toggleClass('is-loss', p.delta < 0);
	});
	p.timer = win.setTimeout(() => {
		mem.pending.delete(o.key);
		o.taps.commit(p.delta);
	}, 550);
}

/**
 * A change shows the way games do it: what's lost stays on the bar in a
 * highlight colour for a moment, then drains to the new value; what's gained
 * lights up first, then the fill grows across it. Only when the value changed
 * since the last draw (and not for reduced motion).
 */
function animateBar(mem: VitalsMemory, key: string, now: number, bar: HTMLElement, fill: HTMLElement, pct: (v: number) => string): void {
	const was = mem.bars.get(key);
	mem.bars.set(key, now);
	if (was === undefined || was === now || reducedMotion()) return;
	const lo = Math.min(was, now);
	const ghost = createDiv({ cls: `ns-meter-ghost ${now < was ? 'is-loss' : 'is-gain'}` });
	// A loss sits on top of the fill and drains; a gain sits under it, and the fill grows across it.
	if (now < was) fill.after(ghost);
	else fill.before(ghost);
	ghost.setCssProps({ '--ns-from': pct(lo), '--ns-w': `calc(${pct(Math.max(was, now))} - ${pct(lo)})` });
	const win = bar.win;
	if (now < was) {
		win.setTimeout(() => ghost.addClass('is-draining'), 420);
		win.setTimeout(() => ghost.remove(), 1300);
	} else {
		fill.addClass('is-instant');
		fill.setCssProps({ '--ns-fill': pct(was) });
		win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
			fill.removeClass('is-instant');
			win.setTimeout(() => fill.setCssProps({ '--ns-fill': pct(now) }), 300);
		}));
		win.setTimeout(() => ghost.remove(), 1200);
	}
}
