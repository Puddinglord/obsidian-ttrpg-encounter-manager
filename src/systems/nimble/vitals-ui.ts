// A hero's vitals, drawn the same everywhere: the character sheet, and the
// encounter tracker's quick look. An HP or mana bar with − and + either side
// and a calculator, a row of action dots, a row of Wound pips. Each takes the
// values to show and what to do when tapped, so the sheet writes to the note
// and the tracker to the fight. Styled by the sheet's CSS (inside .nimble-sheet).

import { setIcon } from 'obsidian';
import { reducedMotion } from '../../core/celebrate';
import type { VitalsMemory } from '../../core/vitals/meter';
import { pipStep } from './rules';

// The bar itself is core's, shared with every game.
export { iconStep, renderMeter, VitalsMemory } from '../../core/vitals/meter';
export type { MeterOptions } from '../../core/vitals/meter';

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
