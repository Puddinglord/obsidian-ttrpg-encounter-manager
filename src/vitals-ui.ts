// A hero's vitals, drawn the same everywhere: the character sheet, and the
// encounter tracker's quick look. An HP or mana bar with − and + either side
// and a calculator, a row of action dots, a row of Wound pips. Each takes the
// values to show and what to do when tapped, so the sheet writes to the note
// and the tracker to the fight. Styled by the sheet's CSS (inside .nimble-sheet).

import { setIcon } from 'obsidian';
import { reducedMotion } from './celebrate';
import { pipStep } from './rules';

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
	const nums = bar.createSpan({ cls: 'ns-meter-nums' });
	nums.createSpan({ cls: `${o.bar}-cur ns-meter-cur`, text: String(o.cur) });
	nums.createSpan({ cls: 'ns-meter-slash', text: '/' });
	nums.createSpan({ cls: `${o.bar}-max ns-meter-max`, text: String(o.max) });
	if (o.extra) nums.createSpan({ cls: 'ns-meter-plus', text: `+${o.extra}` });
	const plus = iconStep(row, 'plus', { 'aria-label': o.plus }, 'ns-step ns-meter-step');
	const calc = iconStep(row, 'calculator', { 'aria-label': o.calc }, 'ns-step ns-meter-calc');
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
	bar.querySelector('.ns-meter-cur')?.setText(String(Math.max(0, Math.min(o.max, o.cur + p.delta + soaked))));
	let tag = bar.querySelector<HTMLElement>('.ns-meter-delta');
	if (!tag) tag = bar.querySelector('.ns-meter-nums')?.createSpan({ cls: 'ns-meter-delta' }) ?? null;
	tag?.setText(p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `−${-p.delta}` : '±0');
	tag?.toggleClass('is-gain', p.delta > 0);
	tag?.toggleClass('is-loss', p.delta < 0);
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

/** The action dots: one per action (at least 3), filled for those left. Taps move one step (pipStep). */
export function renderActionDots(parent: HTMLElement, o: { key?: string; count: number; perTurn: number; set: (n: number) => void }, mem: VitalsMemory): HTMLElement {
	const dots = parent.createDiv({ cls: 'ns-action-dots', attr: { role: 'group', 'aria-label': `${o.count} of ${o.perTurn} actions left` } });
	const key = o.key ?? 'actions';
	const was = mem.counts.get(key);
	mem.counts.set(key, o.count);
	for (let i = 0; i < Math.max(o.perTurn, o.count); i++) {
		const on = i < o.count;
		const dot = dots.createEl('button', { cls: `ns-action-dot${on ? ' is-on' : ''}${moved(was, i, on)}`, attr: { 'aria-label': `${on ? 'Spend an action' : 'Get an action back'} (${o.count} left)`, 'aria-pressed': String(on) } });
		dot.addEventListener('click', () => o.set(pipStep(o.count, on)));
	}
	return dots;
}

/** The Wounds: a label, a row of pips (the last a skull) and the count. Taps move one step (pipStep). */
export function renderWoundPips(parent: HTMLElement, o: { key?: string; wounds: number; max: number; set: (n: number) => void; count?: boolean }, mem: VitalsMemory): HTMLElement {
	const w = parent.createDiv({ cls: 'ns-wounds' });
	const tab = w.createSpan({ cls: 'ns-wounds-tab' });
	setIcon(tab.createSpan({ cls: 'ns-wounds-drop' }), 'droplet');
	tab.createSpan({ text: 'Wounds' });
	const track = w.createDiv({ cls: 'ns-wounds-track', attr: { role: 'group', 'aria-label': `Wounds ${o.wounds} of ${o.max}` } });
	const key = o.key ?? 'wounds';
	const was = mem.counts.get(key);
	mem.counts.set(key, o.wounds);
	for (let i = 0; i < o.max; i++) {
		const last = i === o.max - 1;
		const on = i < o.wounds;
		const pip = track.createEl('button', { cls: `ns-pip${on ? ' is-on' : ''}${last ? ' is-skull' : ''}${moved(was, i, on)}`, attr: { 'aria-pressed': String(on), 'aria-label': `${on ? 'Heal a Wound' : 'Add a Wound'} (${o.wounds} of ${o.max}${last ? '; the last is death' : ''})` } });
		if (last) setIcon(pip, 'skull');
		pip.addEventListener('click', () => o.set(pipStep(o.wounds, on, o.max)));
	}
	if (o.count !== false) w.createSpan({ cls: 'ns-wounds-count', text: `${o.wounds}/${o.max}` });
	return w;
}

/** " just-on" / " just-off" for a pip that changed since the last draw (it animates). */
function moved(was: number | undefined, i: number, on: boolean): string {
	if (was === undefined || (i < was) === on || reducedMotion()) return '';
	return on ? ' just-on' : ' just-off';
}
