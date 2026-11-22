// Builders from a schema. A game system describes what it builds (a 5e
// monster, spell or item) as steps of fields: text, numbers, a choice, chips,
// yes/no, and lists of things (actions, traits). The fields read and write a
// plain draft object; formulas show as hints beside a field ("+5", "= 22 HP")
// or as a number field's placeholder, and fill in whatever the GM leaves
// blank. Core draws the fields with the builder's own controls, so every
// system's builder looks and works the same as Nimble's.
//
//   schemaKind({ kind: 'spell', noun: 'spell', icon: 'wand-2',
//     blank: () => ({ name: '', level: 1 }),
//     steps: () => [{ id: 'basics', label: 'Basics', icon: 'sparkles', rows: [
//       { type: 'text', key: 'name', label: 'Name' },
//       { type: 'number', key: 'level', label: 'Level', min: 0, max: 9 },
//     ] }],
//     preview, missing, output })

import { setIcon } from 'obsidian';
import { gameIcon } from '../icons';
import type EmberVaultPlugin from '../../../main';
import { pill } from '../pill';
import { BuilderUI, field, grid, iconButton, KindBuilder, KindFactory, numberInput, Output, section, segmented, StepDef, textArea, textButton, textInput } from './frame';

/** A draft: what the fields edit. */
export type Draft = Record<string, unknown>;

interface FieldBase<M> {
	/** The draft's property. */
	key: string;
	label: string;
	help?: string;
	wide?: boolean;
	/** Shown only when this says so (redrawn on every change). */
	show?: (m: M) => boolean;
	/** A formula's result beside the label ("+5", "DC 13"). */
	hint?: (m: M) => string;
	/** Other fields' options or steps depend on this one (a class's skills): redraw the steps when it changes. */
	rebuilds?: boolean;
}

export type FieldDef<M = Draft> =
	| FieldBase<M> & { type: 'text'; placeholder?: string | ((m: M) => string); words?: boolean; code?: boolean }
	| FieldBase<M> & { type: 'textarea'; placeholder?: string; rows?: number }
	/** A number; `placeholder` is what a blank field means (the formula's value). */
	| FieldBase<M> & { type: 'number'; placeholder?: (m: M) => string; min?: number; max?: number; step?: number }
	/** One of a few (buttons), or of many (a dropdown). */
	| FieldBase<M> & { type: 'choice'; options: (m: M) => { value: string; label: string; icon?: string }[]; dropdown?: boolean; /** The draft holds the value as a number (a level, a bonus). */ numeric?: boolean }
	/**
	 * Any of these (the draft holds a string[]). `groups` sorts long lists under headings (spells by level);
	 * `fixed` are already theirs from elsewhere (a background's skills), shown first and not pickable;
	 * `meta` is a small word after a chip's name ("Int").
	 */
	| FieldBase<M> & { type: 'chips'; options: (m: M) => string[]; max?: (m: M) => number; groups?: (m: M) => { label: string; options: string[] }[]; fixed?: (m: M) => { values: string[]; why: string }; meta?: (opt: string, m: M) => string }
	| FieldBase<M> & { type: 'toggle' }
	/** Drawn by the system (a game's own control, built from the frame's parts). */
	| FieldBase<M> & { type: 'custom'; draw: (control: HTMLElement, m: M, ui: BuilderUI) => void }
	/** A list of things, each with its own fields (the draft holds an array of drafts). */
	| FieldBase<M> & { type: 'list'; item: (item: Draft) => (FieldDef | FieldDef[])[]; blank: () => Draft; add: string; title?: (item: Draft, i: number) => string };

/** A step: its fields, top to bottom. An array is a row of fields side by side. */
export interface StepSchema<M> {
	id: string;
	label: string;
	icon: string;
	title?: string;
	sub?: string;
	rows: (FieldDef<M> | FieldDef<M>[])[];
}

export interface EntitySchema<M extends Draft> {
	kind: string;
	noun: string;
	icon: string;
	/** A new draft, for the note it's built from. */
	blank(plugin: EmberVaultPlugin, sourcePath: string): M;
	/** A draft from what the builder was opened on (a block being edited, a template). */
	seed?(seed: unknown, plugin: EmberVaultPlugin, sourcePath: string): M | undefined;
	steps(m: M): StepSchema<M>[];
	/** The thing as it will look. */
	preview(el: HTMLElement, m: M, ui: BuilderUI): void;
	/** A check beside the preview (a rating, a level). */
	check?(el: HTMLElement, m: M, ui: BuilderUI): void;
	chip?(m: M): { text: string; tone: 'ok' | 'high' | 'low' | 'none' };
	/** Why it can't be created yet (no name), or null. */
	missing(m: M): string | null;
	output(m: M): Output;
}

/** A builder kind from a schema, for `registerKind`. */
export function schemaKind<M extends Draft>(schema: EntitySchema<M>): KindFactory {
	return (plugin, seed) => new SchemaBuilder(plugin, schema, seed);
}

export class SchemaBuilder<M extends Draft> implements KindBuilder {
	readonly kind: string;
	readonly noun: string;
	readonly icon: string;
	readonly draft: M;

	constructor(plugin: EmberVaultPlugin, private s: EntitySchema<M>, seed: unknown) {
		this.kind = s.kind;
		this.noun = s.noun;
		this.icon = s.icon;
		const path = plugin.app.workspace.getActiveFile()?.path ?? '';
		this.draft = (seed !== undefined ? s.seed?.(seed, plugin, path) : undefined) ?? s.blank(plugin, path);
	}

	steps(): StepDef[] {
		return this.s.steps(this.draft).map(({ id, label, icon }) => ({ id, label, icon }));
	}

	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const step = this.s.steps(this.draft).find(x => x.id === id);
		if (!step) return;
		if (step.title) section(panel, step.title, step.sub);
		drawRows(panel, step.rows, this.draft, ui);
	}

	renderCheck(el: HTMLElement, ui: BuilderUI): void { this.s.check?.(el, this.draft, ui); }
	renderPreview(el: HTMLElement, ui: BuilderUI): void { this.s.preview(el, this.draft, ui); }
	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } { return this.s.chip?.(this.draft) ?? { text: '', tone: 'none' }; }
	missing(): string | null { return this.s.missing(this.draft); }
	output(): Output { return this.s.output(this.draft); }
}

function drawRows(parent: HTMLElement, rows: (FieldDef | FieldDef[])[], m: Draft, ui: BuilderUI): void {
	for (const r of rows) {
		if (!Array.isArray(r)) { drawField(parent, r, m, ui); continue; }
		const g = grid(parent, Math.min(3, Math.max(1, r.length)));
		for (const f of r) drawField(g, f, m, ui);
	}
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** One field, wired to `m[f.key]`. */
export function drawField(parent: HTMLElement, f: FieldDef, m: Draft, ui: BuilderUI): void {
	const parts = field(parent, f.label, { help: f.help, wide: f.wide || f.type === 'list' || f.type === 'textarea' || f.type === 'chips' });
	parts.row.dataset.key = f.key;
	const { show, hint } = f;
	if (show) ui.live(() => parts.row.toggleClass('is-hidden', !show(m)));
	if (hint) ui.live(() => parts.aside.setText(hint(m)));
	// A field others depend on redraws the steps once the change has landed.
	const redraw = () => { if (f.rebuilds) window.setTimeout(() => ui.rebuild(), 0); };
	const set = (v: unknown) => { const was = m[f.key]; m[f.key] = v; if (was !== v) redraw(); };
	const named = { label: f.label, labelledBy: parts.labelId };
	switch (f.type) {
		case 'text': {
			const ph = f.placeholder;
			const input = textInput(parts.control, { ...named, value: str(m[f.key]), placeholder: typeof ph === 'string' ? ph : undefined, words: f.words, code: f.code, onInput: v => { set(v); ui.changed(); } });
			if (typeof ph === 'function') ui.live(() => { input.placeholder = ph(m); });
			return;
		}
		case 'textarea':
			textArea(parts.control, { ...named, value: str(m[f.key]), placeholder: f.placeholder, rows: f.rows ?? 3, onInput: v => { set(v); ui.changed(); } });
			return;
		case 'number': {
			const ph = f.placeholder;
			// Typing doesn't redraw (the cursor would jump); leaving the field does.
			const input = numberInput(parts.control, {
				...named, ui, min: f.min, max: f.max, step: f.step,
				get: () => (typeof m[f.key] === 'number' ? m[f.key] as number : undefined),
				set: v => { m[f.key] = v; },
				placeholder: () => (ph ? ph(m) : ''),
			});
			if (f.rebuilds) input.addEventListener('change', redraw);
			return;
		}
		case 'choice': {
			const options = f.options(m);
			const value = (v: string) => (f.numeric ? Number(v) : v);
			if (f.dropdown || options.length > 8) {
				const sel = parts.control.createEl('select', { cls: 'dropdown eb-select', attr: { 'aria-labelledby': parts.labelId } });
				sel.dataset.field = f.label;
				for (const o of options) sel.createEl('option', { value: o.value, text: o.label }).selected = o.value === str(m[f.key]);
				sel.addEventListener('change', () => { set(value(sel.value)); ui.changed(); });
				return;
			}
			const seg = segmented<string>(parts.control, options, () => str(m[f.key] ?? (f.numeric ? 0 : '')), v => set(value(v)), { ...named, ui, cls: 'is-compact is-schema', key: `schema-${f.key}` });
			// On a phone the options sit in even rows (six sizes three by two) instead of running off the edge.
			const n = options.length;
			seg.setCssProps({ '--eb-cols': String(n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4) });
			return;
		}
		case 'toggle':
			segmented<boolean>(parts.control, [{ value: false, label: 'No' }, { value: true, label: 'Yes' }], () => m[f.key] === true, v => set(v), { ...named, ui, cls: 'is-compact' });
			return;
		case 'chips': {
			const box = parts.control.createDiv({ cls: 'eb-picks', attr: { role: 'group', 'aria-labelledby': parts.labelId } });
			const list = () => (Array.isArray(m[f.key]) ? m[f.key] as string[] : []);
			const { max, meta, groups, fixed } = f;
			const chip = (into: HTMLElement, opt: string) => {
				const b = pill(into, { tag: 'button', text: opt, cls: 'eb-pick', attr: { type: 'button', 'aria-pressed': 'false' } }) as HTMLButtonElement;
				// The word follows the draft (a save's bonus moves with its ability).
				if (meta?.(opt, m)) { const w = b.createSpan({ cls: 'eb-pick-meta' }); ui.live(() => w.setText(meta(opt, m))); }
				b.dataset.value = opt;
				b.addEventListener('click', () => {
					const now = list();
					set(now.includes(opt) ? now.filter(x => x !== opt) : [...now, opt]);
					ui.changed();
				});
				ui.live(() => {
					const on = list().includes(opt);
					b.toggleClass('is-active', on);
					b.setAttr('aria-pressed', String(on));
					// At the limit, the rest wait until one is taken off.
					b.disabled = !on && !!max && list().length >= max(m);
				});
			};
			const given = fixed?.(m);
			if (given?.values.length) {
				const row = groups ? box.createDiv({ cls: 'eb-pick-row' }) : box;
				for (const v of given.values) {
					const b = pill(row, { tag: 'span', icon: 'check', text: v, cls: 'eb-pick-given', title: given.why });
					b.dataset.fixed = v;
				}
			}
			if (!groups) { for (const opt of f.options(m)) chip(box, opt); return; }
			box.addClass('is-grouped');
			for (const g of groups(m)) {
				if (!g.options.length) continue;
				const sec = box.createDiv({ cls: 'eb-pick-group' });
				const head = sec.createDiv({ cls: 'eb-pick-head' });
				head.createSpan({ cls: 'eb-pick-head-label', text: g.label });
				const count = head.createSpan({ cls: 'eb-pick-head-count' });
				ui.live(() => {
					const n = g.options.filter(o => list().includes(o)).length;
					count.setText(n ? `${n} picked` : '');
				});
				const row = sec.createDiv({ cls: 'eb-pick-row' });
				for (const opt of g.options) chip(row, opt);
			}
			return;
		}
		case 'custom':
			f.draw(parts.control, m, ui);
			return;
		case 'list': {
			const items = Array.isArray(m[f.key]) ? m[f.key] as Draft[] : (m[f.key] = [] as Draft[]);
			// The cards across the field, Add under them.
			parts.control.addClass('is-stack');
			const box = parts.control.createDiv({ cls: 'eb-attacks eb-list' });
			items.forEach((item, i) => {
				const card = box.createDiv({ cls: 'eb-attack eb-list-item' });
				const head = card.createDiv({ cls: 'eb-attack-head eb-list-head' });
				const title = head.createDiv({ cls: 'eb-list-title' });
				const { title: titleOf } = f;
				ui.live(() => title.setText(titleOf ? titleOf(item, i) : `${f.label} ${i + 1}`));
				iconButton(head, 'trash-2', `Remove ${title.textContent || 'this'}`, () => { items.splice(i, 1); ui.rebuild(); });
				drawRows(card, f.item(item), item, ui);
			});
			const add = textButton(parts.control, 'plus', f.add, () => {
				items.push(f.blank());
				ui.rebuild();
				window.setTimeout(() => parts.control.querySelectorAll<HTMLElement>('.eb-list-item').item(items.length - 1)?.querySelector<HTMLInputElement>('input')?.focus(), 20);
			});
			add.addClass('eb-list-add');
			return;
		}
	}
}

/** A small icon before a hint ("= 22 HP"). */
export function hintIcon(el: HTMLElement, icon: string): void {
	setIcon(el.createSpan({ cls: 'eb-hint-icon' }), gameIcon(icon));
}
