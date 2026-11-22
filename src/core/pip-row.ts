// A row of pips, the same in every game:
// - Tapping follows core's rule (pips.ts): a filled pip takes one away, an
//   empty one adds one, one step at a time.
// - A pip that just changed animates: its fill grows in with a little bounce,
//   or shrinks out (Nimble's sheet pips, now everyone's). Rows are redrawn on
//   every change, so the row remembers its last count by `key`.
// - Reduced motion: no animation.

import { reducedMotion } from './celebrate';
import { pipMoved, pipStep } from './pips';

export interface PipRowOptions {
	/** How many are filled. */
	count: number;
	max: number;
	/** The new count after a tap. */
	set: (count: number) => void;
	/** Read by screen readers ("Legendary actions"), and the row's label when `label` is shown. */
	name: string;
	/** Show the name before the pips. */
	label?: boolean;
	/** Extra class on the row, for its colour: "is-legendary", "is-success". */
	cls?: string;
	/** Read only: no taps. */
	readOnly?: boolean;
	/** Stable per row ("legendary:<combatant id>"), so a pip that changed since the last draw animates. */
	key?: string;
}

const lastCounts = new Map<string, number>();

export function renderPipRow(parent: HTMLElement, o: PipRowOptions): HTMLElement {
	const row = parent.createDiv({ cls: `ev-pips${o.cls ? ` ${o.cls}` : ''}`, attr: { role: 'group', 'aria-label': `${o.name}: ${o.count} of ${o.max}` } });
	if (o.label) row.createSpan({ cls: 'ev-pips-label', text: o.name });
	const was = o.key ? lastCounts.get(o.key) : undefined;
	if (o.key) lastCounts.set(o.key, o.count);
	const still = reducedMotion();
	for (let i = 0; i < o.max; i++) {
		const on = i < o.count;
		const moved = still ? undefined : pipMoved(was, i, on);
		const cls = `ev-pip${on ? ' is-on' : ''}${moved ? ` just-${moved}` : ''}`;
		if (o.readOnly) { row.createSpan({ cls }); continue; }
		const pip = row.createEl('button', { cls, attr: { 'aria-pressed': String(on), 'aria-label': `${o.name} ${i + 1}` } });
		pip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.set(pipStep(o.count, on, o.max)); });
	}
	return row;
}
