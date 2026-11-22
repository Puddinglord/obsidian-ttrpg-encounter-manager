// Entering a die rolled at the table: a strip with the die's faces as buttons.
// Any held die (Nimble's Fury and Judgment dice, any game's set-aside dice) uses
// it: tap a held die to change it (its face shows pressed, with Remove), tap an
// empty slot to add one. The faces come in even rows: every face in one row up to
// a d12, a d20 in two rows of 10; on a narrow sheet a d8 to d12 halve (a d12 is
// 6 a row) and a d20 is four rows of 5. The game writes the value wherever it
// keeps the die (a note's frontmatter, a fight).

/** How many faces go in one row: `wide` on a roomy sheet, `narrow` on a phone. */
export function faceRows(sides: number): { wide: number; narrow: number } {
	const n = Math.max(1, Math.round(sides));
	if (n > 12) return { wide: Math.ceil(n / 2), narrow: Math.ceil(n / 4) };
	if (n > 6) return { wide: n, narrow: Math.ceil(n / 2) };
	return { wide: n, narrow: n };
}

export interface FacePickerOptions {
	sides: number;
	/** The face the die shows now (changing it), or 0 / undefined (adding one). */
	current?: number;
	/** What the strip says: "Fury die: change it to", "Add a Fury die you rolled". */
	label: string;
	/** A face was tapped. */
	pick: (face: number) => void;
	/** Changing a die: take it away instead (a Remove button). */
	remove?: () => void;
	cls?: string;
}

/**
 * The strip, in `parent`. Styled by `.ev-face-pick` (styles.css); the row counts
 * are `--ev-faces` and `--ev-faces-narrow`, so the sheet's container queries pick one.
 */
export function renderFacePicker(parent: HTMLElement, o: FacePickerOptions): HTMLElement {
	const rows = faceRows(o.sides);
	const el = parent.createDiv({ cls: ['ev-face-pick', ...(o.sides > 6 ? ['is-many'] : []), ...(o.cls ?? '').split(/\s+/).filter(Boolean)] });
	el.setCssProps({ '--ev-faces': String(rows.wide), '--ev-faces-narrow': String(rows.narrow) });
	el.createSpan({ cls: 'ev-face-pick-label', text: o.label });
	const faces = el.createDiv({ cls: 'ev-face-pick-faces', attr: { role: 'group', 'aria-label': o.label } });
	for (let f = 1; f <= o.sides; f++) {
		const on = o.current === f;
		const b = faces.createEl('button', { cls: `ev-face${on ? ' is-on' : ''}`, attr: { type: 'button', 'aria-pressed': String(on), 'aria-label': `${f}` } });
		b.createSpan({ cls: 'ev-face-n', text: String(f) });
		b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.pick(f); });
	}
	if (o.remove) {
		const rm = el.createEl('button', { cls: 'ev-face-remove', attr: { type: 'button' } });
		rm.createSpan({ text: 'Remove' });
		const remove = o.remove;
		rm.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); remove(); });
	}
	return el;
}
