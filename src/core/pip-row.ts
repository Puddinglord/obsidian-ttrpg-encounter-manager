// A row of pips that follows core's pip rule (pips.ts): a filled pip takes
// one away, an empty one adds one. Every game's pips use it, so they behave
// the same everywhere.

import { pipStep } from './pips';

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
}

export function renderPipRow(parent: HTMLElement, o: PipRowOptions): HTMLElement {
	const row = parent.createDiv({ cls: `ev-pips${o.cls ? ` ${o.cls}` : ''}`, attr: { role: 'group', 'aria-label': `${o.name}: ${o.count} of ${o.max}` } });
	if (o.label) row.createSpan({ cls: 'ev-pips-label', text: o.name });
	for (let i = 0; i < o.max; i++) {
		const on = i < o.count;
		if (o.readOnly) { row.createSpan({ cls: `ev-pip${on ? ' is-on' : ''}` }); continue; }
		const pip = row.createEl('button', { cls: `ev-pip${on ? ' is-on' : ''}`, attr: { 'aria-pressed': String(on), 'aria-label': `${o.name} ${i + 1}` } });
		pip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.set(pipStep(o.count, on, o.max)); });
	}
	return row;
}
