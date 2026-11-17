// The builder: one dialog for making a monster, a spell or an item. The same
// frame as the level-up wizard (steps across the top, a carousel, Back and Next),
// but always the same size, wide rather than tall, with a live preview beside
// the form (a sheet on phones). Every kind fills itself in from the books'
// numbers; whatever the GM types is kept. The first step holds everything a
// quick build needs, and Create works from any step.

import { Modal, normalizePath, Notice, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { isPhone, isTouch } from './touch';
import type { Dice } from './builder-math';

export type EntityKind = 'monster' | 'spell' | 'item';

export interface StepDef { id: string; label: string; icon: string }

/** Where the finished entity goes. */
export interface Output {
	/** The fence's language: nimble, nimble-spell, nimble-item. */
	lang: string;
	body: string;
	name: string;
	/** Properties for a new note. */
	frontmatter: Record<string, string>;
	/** The folder a new note goes in, before the GM changes it. */
	folder: string;
}

/** What the frame needs from each kind. */
export interface KindBuilder {
	kind: EntityKind;
	noun: string;
	icon: string;
	steps(): StepDef[];
	/** Build one step's inputs. `ui` re-renders, refreshes, and registers live updaters. */
	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void;
	/** The level or tier check (empty when there isn't one). */
	renderCheck(el: HTMLElement, ui: BuilderUI): void;
	/** The card as it will look. */
	renderPreview(el: HTMLElement, ui: BuilderUI): void;
	/** A short line for the phone's check chip ("Plays like 4 ✓"). */
	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' };
	missing(): string | null;
	output(): Output;
}

/** What a step can ask of the frame. */
export interface BuilderUI {
	plugin: NimbleStatblocksPlugin;
	sourcePath: string;
	/** Something changed that only the preview, the check and live hints show. */
	changed(): void;
	/** Something changed the shape of the steps (role, a list grew): redraw them, staying put. */
	rebuild(): void;
	/** Run on every change: keep a hint, an expected value or an untouched field current. */
	live(fn: () => void): void;
	go(stepId: string): void;
	phone: boolean;
}

export interface BuilderOptions {
	kind: EntityKind;
	/** Opens on this monster (or spell, item) as a template. */
	seed?: unknown;
	/** Put the block in the note being edited instead of making a note. */
	insert?: (block: string) => void;
	/** Editing a block in a note: write it back instead. */
	writeBack?: (body: string) => Promise<boolean>;
	/** The note the builder was opened from (for links and the preview). */
	sourcePath?: string;
}

export type KindFactory = (plugin: NimbleStatblocksPlugin, seed: unknown) => KindBuilder;
const FACTORIES: Partial<Record<EntityKind, KindFactory>> = {};

/** Kinds register themselves (entity-monster-ui.ts, …), so this file doesn't import them all. */
export function registerKind(kind: EntityKind, f: KindFactory): void { FACTORIES[kind] = f; }
export function kindAvailable(kind: EntityKind): boolean { return !!FACTORIES[kind]; }

const KIND_LABEL: Record<EntityKind, { label: string; icon: string }> = {
	monster: { label: 'Monster', icon: 'skull' },
	spell: { label: 'Spell', icon: 'wand-2' },
	item: { label: 'Item', icon: 'backpack' },
};

export class EntityBuilder extends Modal implements BuilderUI {
	phone = isPhone();
	sourcePath: string;
	private builders = new Map<EntityKind, KindBuilder>();
	private b!: KindBuilder;
	private steps: StepDef[] = [];
	private at = 0;
	private updaters: (() => void)[] = [];
	private queued = false;
	private kindBar!: HTMLElement;
	private dots!: HTMLElement;
	private viewport!: HTMLElement;
	private track!: HTMLElement;
	private panels: HTMLElement[] = [];
	private checkEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private chip!: HTMLElement;
	private sheet!: HTMLElement;
	private backBtn!: HTMLButtonElement;
	private createBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private previewBtn?: HTMLButtonElement;
	private counter!: HTMLElement;
	private busy = false;

	constructor(public plugin: NimbleStatblocksPlugin, private o: BuilderOptions) {
		super(plugin.app);
		this.sourcePath = o.sourcePath ?? plugin.app.workspace.getActiveFile()?.path ?? '';
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-entity-builder');
		if (this.phone) this.modalEl.addClass('is-phone-layout');
		this.titleEl.empty();
		const { contentEl } = this;
		contentEl.empty();

		const head = contentEl.createDiv({ cls: 'eb-head' });
		this.kindBar = head.createDiv({ cls: 'eb-kinds', attr: { role: 'radiogroup', 'aria-label': 'What to make' } });
		this.chip = head.createDiv({ cls: 'eb-chip', attr: { 'aria-live': 'polite' } });
		this.dots = contentEl.createDiv({ cls: 'eb-dots', attr: { role: 'tablist', 'aria-label': 'Steps' } });

		const body = contentEl.createDiv({ cls: 'eb-body' });
		this.viewport = body.createDiv({ cls: 'eb-viewport' });
		this.track = this.viewport.createDiv({ cls: 'eb-track' });
		const side = body.createDiv({ cls: 'eb-side' });
		this.sheet = side;
		const sheetHead = side.createDiv({ cls: 'eb-sheet-head' });
		sheetHead.createSpan({ text: 'Preview' });
		const closeSheet = sheetHead.createEl('button', { cls: 'eb-sheet-close', attr: { 'aria-label': 'Close the preview' } });
		setIcon(closeSheet, 'x');
		closeSheet.addEventListener('click', () => this.toggleSheet(false));
		this.checkEl = side.createDiv({ cls: 'eb-check' });
		this.previewEl = side.createDiv({ cls: 'eb-preview' });

		const foot = contentEl.createDiv({ cls: 'eb-foot' });
		this.backBtn = foot.createEl('button', { cls: 'eb-back' });
		this.counter = foot.createDiv({ cls: 'eb-counter' });
		if (this.phone) {
			this.previewBtn = foot.createEl('button', { cls: 'eb-preview-btn', attr: { 'aria-label': 'Preview' } });
			setIcon(this.previewBtn, 'eye');
			this.previewBtn.addEventListener('click', () => this.toggleSheet());
		}
		this.createBtn = foot.createEl('button', { cls: 'eb-create' });
		this.nextBtn = foot.createEl('button', { cls: 'mod-cta eb-next' });
		this.backBtn.addEventListener('click', () => (this.at === 0 ? this.close() : this.go(this.steps[this.at - 1].id)));
		this.nextBtn.addEventListener('click', () => (this.at === this.steps.length - 1 ? void this.finish() : this.go(this.steps[this.at + 1].id)));
		this.createBtn.addEventListener('click', () => void this.finish());

		// Arrow keys move between steps (not while typing); a sideways swipe does on touch screens.
		this.scope.register([], 'ArrowRight', (e) => { if (typing(e)) return true; this.step(1); return false; });
		this.scope.register([], 'ArrowLeft', (e) => { if (typing(e)) return true; this.step(-1); return false; });
		this.scope.register(['Mod'], 'Enter', () => { void this.finish(); return false; });
		// Focusing a field in a step that's still sliding in scrolls the clipped viewport; the carousel moves by transform only.
		this.viewport.addEventListener('scroll', () => { if (this.viewport.scrollLeft) this.viewport.scrollLeft = 0; });
		let x0: number | null = null;
		let y0 = 0;
		this.viewport.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
		this.viewport.addEventListener('touchend', (e) => {
			if (x0 === null) return;
			const dx = e.changedTouches[0].clientX - x0;
			const dy = e.changedTouches[0].clientY - y0;
			x0 = null;
			if ((e.target as HTMLElement | null)?.closest('input, textarea, .eb-noswipe')) return;
			if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) this.step(dx < 0 ? 1 : -1);
		});

		this.setKind(this.o.kind, this.o.seed);
	}

	onClose(): void { this.contentEl.empty(); }

	// ------------------------------------------------------------------------
	// Kinds and steps

	private builderFor(kind: EntityKind, seed?: unknown): KindBuilder | null {
		let b = this.builders.get(kind);
		if (!b || seed !== undefined) {
			const f = FACTORIES[kind];
			if (!f) return null;
			b = f(this.plugin, seed);
			this.builders.set(kind, b);
		}
		return b;
	}

	private setKind(kind: EntityKind, seed?: unknown): void {
		const b = this.builderFor(kind, seed);
		if (!b) return;
		this.b = b;
		this.modalEl.dataset.kind = kind;
		this.renderKinds();
		this.at = 0;
		this.rebuild();
		this.go(this.steps[0].id, false);
		// Desktop: straight into the name. Touch: don't throw the keyboard up over the dialog.
		if (!isTouch()) window.setTimeout(() => {
			if (this.modalEl.contains(activeDocument.activeElement) && activeDocument.activeElement?.matches('input, textarea')) return; // already typing
			this.panels[0]?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')?.focus();
		}, 30);
	}

	private renderKinds(): void {
		this.kindBar.empty();
		// Editing a block in place keeps its kind.
		const kinds = (Object.keys(KIND_LABEL) as EntityKind[]).filter(k => FACTORIES[k] && (!this.o.writeBack || k === this.b.kind));
		for (const k of kinds) {
			const on = k === this.b.kind;
			const btn = this.kindBar.createEl('button', { cls: `eb-kind${on ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(on) } });
			setIcon(btn.createSpan({ cls: 'eb-kind-icon' }), KIND_LABEL[k].icon);
			btn.createSpan({ text: KIND_LABEL[k].label });
			btn.addEventListener('click', () => { if (k !== this.b.kind) this.setKind(k); });
		}
		const title = this.kindBar.createDiv({ cls: 'eb-title' });
		title.setText(this.o.writeBack ? `Edit ${this.b.noun}` : `New ${this.b.noun}`);
	}

	rebuild(): void {
		const current = this.steps[this.at]?.id;
		this.steps = this.b.steps();
		this.at = Math.max(0, this.steps.findIndex(s => s.id === current));
		this.updaters = [];
		const scrolls = this.panels.map(p => p.scrollTop);
		this.track.empty();
		this.panels = this.steps.map(() => this.track.createDiv({ cls: 'eb-panel' }));
		this.steps.forEach((st, i) => {
			const p = this.panels[i];
			this.b.renderStep(st.id, p, this);
			p.scrollTop = scrolls[i] ?? 0;
		});
		this.placeTrack(false);
		this.refresh();
	}

	changed(): void {
		if (this.queued) return;
		this.queued = true;
		// Batches a burst of changes from one event; a microtask, not a frame, so a hidden window doesn't hold it back.
		queueMicrotask(() => { this.queued = false; this.refresh(); });
	}

	live(fn: () => void): void { this.updaters.push(fn); }

	private refresh(): void {
		for (const fn of this.updaters) fn();
		this.checkEl.empty();
		this.b.renderCheck(this.checkEl, this);
		this.checkEl.toggleClass('is-empty', !this.checkEl.childElementCount);
		const top = this.previewEl.scrollTop;
		this.previewEl.empty();
		this.b.renderPreview(this.previewEl, this);
		this.previewEl.scrollTop = top;
		const c = this.b.checkChip();
		this.chip.empty();
		this.chip.toggleClass('is-hidden', c.tone === 'none');
		this.chip.className = `eb-chip tone-${c.tone}${c.tone === 'none' ? ' is-hidden' : ''}`;
		this.chip.setText(c.text);
		this.renderChrome();
	}

	go(id: string, animate = true): void {
		const i = this.steps.findIndex(s => s.id === id);
		if (i < 0) return;
		this.at = i;
		this.placeTrack(animate);
		this.renderChrome();
	}

	private step(by: number): void {
		const next = this.steps[this.at + by];
		if (next) this.go(next.id);
	}

	private placeTrack(animate: boolean): void {
		this.track.toggleClass('no-anim', !animate);
		this.track.setCssProps({ '--eb-at': String(this.at) });
		this.panels.forEach((p, k) => {
			p.toggleClass('is-active', k === this.at);
			if (k === this.at) p.removeAttribute('inert'); else p.setAttr('inert', '');
		});
	}

	private renderChrome(): void {
		this.dots.empty();
		this.steps.forEach((st, i) => {
			const d = this.dots.createEl('button', { cls: `eb-dot${i === this.at ? ' is-active' : ''}${i < this.at ? ' is-done' : ''}`, attr: { role: 'tab', 'aria-selected': String(i === this.at), 'aria-label': st.label } });
			setIcon(d.createSpan({ cls: 'eb-dot-icon' }), st.icon);
			d.createSpan({ cls: 'eb-dot-label', text: st.label });
			d.addEventListener('click', () => this.go(st.id));
		});
		this.dots.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
		this.backBtn.empty();
		if (this.at === 0) this.backBtn.createSpan({ text: 'Cancel' });
		else { setIcon(this.backBtn.createSpan(), 'chevron-left'); this.backBtn.createSpan({ text: 'Back' }); }
		this.counter.setText(`${this.at + 1} of ${this.steps.length}`);
		const last = this.at === this.steps.length - 1;
		const verb = this.o.writeBack ? 'Save' : this.o.insert ? 'Insert' : 'Create';
		this.nextBtn.empty();
		if (last) {
			setIcon(this.nextBtn.createSpan(), 'check');
			this.nextBtn.createSpan({ text: `${verb} ${this.b.noun}` });
		} else {
			this.nextBtn.createSpan({ text: `Next: ${this.steps[this.at + 1].label}` });
			setIcon(this.nextBtn.createSpan(), 'chevron-right');
		}
		// Create from any step: the rest fills in from the book.
		this.createBtn.toggleClass('is-hidden', last);
		this.createBtn.setText(this.phone ? verb : `${verb} now`);
		this.createBtn.setAttr('title', 'Anything you haven\'t filled in uses the book\'s numbers');
	}

	private toggleSheet(open?: boolean): void {
		const show = open ?? !this.sheet.hasClass('is-open');
		this.sheet.toggleClass('is-open', show);
		this.previewBtn?.toggleClass('is-active', show);
	}

	// ------------------------------------------------------------------------
	// Finishing

	private async finish(): Promise<void> {
		if (this.busy) return;
		const why = this.b.missing();
		if (why) {
			new Notice(why);
			this.go(this.steps[0].id);
			const input = this.panels[0]?.querySelector<HTMLInputElement>('input');
			input?.focus();
			this.panels[0]?.addClass('is-shake');
			window.setTimeout(() => this.panels[0]?.removeClass('is-shake'), 450);
			return;
		}
		this.busy = true;
		try {
			const out = this.b.output();
			const block = fence(out.lang, out.body);
			if (this.o.writeBack) {
				if (await this.o.writeBack(out.body)) { this.close(); new Notice(`Saved ${out.name}.`); }
				return;
			}
			if (this.o.insert) { this.o.insert(block); this.close(); return; }
			const file = await this.createNote(out, block);
			this.close();
			await this.app.workspace.getLeaf(false).openFile(file);
			new Notice(`Created ${file.path}.`);
		} catch (e) {
			console.error('Ember Vault: could not save from the builder', e);
			new Notice('Couldn\'t save it. Nothing was written.');
		} finally {
			this.busy = false;
		}
	}

	private async createNote(out: Output, block: string): Promise<TFile> {
		const folder = normalizePath(out.folder || '/');
		if (folder !== '/' && !this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
		const safe = out.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';
		const path = this.plugin.campaigns.available(`${folder === '/' ? '' : `${folder}/`}${safe}.md`);
		const fm = Object.entries(out.frontmatter).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${/^[\w ./-]+$/.test(v) && !/^\d/.test(v) ? v : JSON.stringify(v)}`);
		const text = `${fm.length ? `---\n${fm.join('\n')}\n---\n\n` : ''}${block}\n`;
		return this.app.vault.create(path, text);
	}
}

/** A fenced block, with a longer fence if the body itself has one. */
export function fence(lang: string, body: string): string {
	const longest = Math.max(2, ...[...body.matchAll(/`{3,}/g)].map(m => m[0].length));
	const f = '`'.repeat(longest + 1);
	return `${f}${lang}\n${body}\n${f}`;
}

function typing(e: KeyboardEvent): boolean {
	const t = e.target as HTMLElement | null;
	return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/** Where new homebrew goes: the active GM campaign's folder for it, else a vault-level one. */
export function homeFolder(plugin: NimbleStatblocksPlugin, campaignSub: string, vaultFolder: string): string {
	const c = plugin.campaigns?.active;
	return c && c.role !== 'player' ? normalizePath(`${c.folder}/${campaignSub}`) : vaultFolder;
}

export function openBuilder(plugin: NimbleStatblocksPlugin, o: BuilderOptions): EntityBuilder | null {
	if (!FACTORIES[o.kind]) return null;
	const m = new EntityBuilder(plugin, o);
	m.open();
	return m;
}

// ----------------------------------------------------------------------------
// Fields: one look for every kind. Labels above, help under, expected values
// beside, controls that fit a phone.

export interface FieldParts { row: HTMLElement; control: HTMLElement; aside: HTMLElement; help: HTMLElement }

export function section(panel: HTMLElement, title: string, sub?: string): HTMLElement {
	const h = panel.createDiv({ cls: 'eb-step-head' });
	h.createDiv({ cls: 'eb-step-title', text: title });
	if (sub) h.createDiv({ cls: 'eb-step-sub', text: sub });
	return h;
}

export function grid(parent: HTMLElement, cols = 2): HTMLElement {
	return parent.createDiv({ cls: `eb-grid cols-${cols}` });
}

export function field(parent: HTMLElement, label: string, o: { help?: string; wide?: boolean; cls?: string } = {}): FieldParts {
	const row = parent.createDiv({ cls: `eb-field${o.wide ? ' is-wide' : ''}${o.cls ? ` ${o.cls}` : ''}` });
	const top = row.createDiv({ cls: 'eb-label-row' });
	top.createEl('label', { cls: 'eb-label', text: label });
	const aside = top.createDiv({ cls: 'eb-aside' });
	const control = row.createDiv({ cls: 'eb-control' });
	const help = row.createDiv({ cls: 'eb-help' });
	if (o.help) help.setText(o.help); else help.addClass('is-empty');
	return { row, control, aside, help };
}

export function textInput(parent: HTMLElement, o: { value?: string; placeholder?: string; onInput: (v: string) => void; words?: boolean; code?: boolean; label?: string; cls?: string }): HTMLInputElement {
	const i = parent.createEl('input', { cls: `eb-input${o.cls ? ` ${o.cls}` : ''}`, attr: { type: 'text', enterkeyhint: 'next', spellcheck: o.code ? 'false' : 'true' } });
	if (o.label) i.setAttr('aria-label', o.label);
	i.autocapitalize = o.code ? 'off' : o.words ? 'words' : 'sentences';
	if (o.code) i.setAttr('autocorrect', 'off');
	i.value = o.value ?? '';
	if (o.placeholder) i.placeholder = o.placeholder;
	i.addEventListener('input', () => o.onInput(i.value));
	i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); focusNext(i); } });
	return i;
}

export function textArea(parent: HTMLElement, o: { value?: string; placeholder?: string; onInput: (v: string) => void; rows?: number; label?: string }): HTMLTextAreaElement {
	const t = parent.createEl('textarea', { cls: 'eb-textarea', attr: { rows: String(o.rows ?? 2) } });
	if (o.label) t.setAttr('aria-label', o.label);
	t.value = o.value ?? '';
	if (o.placeholder) t.placeholder = o.placeholder;
	t.addEventListener('input', () => o.onInput(t.value));
	return t;
}

/** Moves to the next input in the step (Enter on a phone's keyboard does too, via enterkeyhint). */
function focusNext(from: HTMLElement): void {
	const panel = from.closest('.eb-panel');
	if (!panel) return;
	const all = [...panel.querySelectorAll<HTMLElement>('input, textarea')].filter(el => !(el as HTMLInputElement).disabled && el.offsetParent !== null);
	const i = all.indexOf(from);
	if (i >= 0 && all[i + 1]) all[i + 1].focus();
	else from.blur();
}

/**
 * A number with − and + either side. Empty means "use the book's number",
 * which shows as the placeholder. `get` keeps it current when something else
 * moves it (the level, a template).
 */
export function numberInput(parent: HTMLElement, o: { get: () => number | undefined; placeholder: () => string; set: (v: number | undefined) => void; min?: number; max?: number; step?: number; label: string; ui: BuilderUI }): HTMLInputElement {
	const wrap = parent.createDiv({ cls: 'eb-num' });
	const minus = wrap.createEl('button', { cls: 'eb-num-btn', attr: { 'aria-label': `Less ${o.label}`, tabindex: '-1' } });
	setIcon(minus, 'minus');
	const input = wrap.createEl('input', { cls: 'eb-num-input', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', enterkeyhint: 'next', 'aria-label': o.label, autocomplete: 'off' } });
	const plus = wrap.createEl('button', { cls: 'eb-num-btn', attr: { 'aria-label': `More ${o.label}`, tabindex: '-1' } });
	setIcon(plus, 'plus');
	const min = o.min ?? 0;
	const max = o.max ?? 9999;
	const clamp = (v: number) => Math.max(min, Math.min(max, v));
	const sync = () => {
		const v = o.get();
		if (activeDocument.activeElement !== input) input.value = v === undefined ? '' : String(v);
		input.placeholder = o.placeholder();
	};
	input.addEventListener('input', () => {
		const t = input.value.replace(/[^\d]/g, '');
		if (t !== input.value) input.value = t;
		o.set(t === '' ? undefined : clamp(parseInt(t, 10)));
		o.ui.changed();
	});
	input.addEventListener('blur', () => sync());
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); focusNext(input); }
		else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1); }
	});
	const bump = (dir: number, mult = 1) => {
		const base = o.get() ?? (parseFloat(o.placeholder()) || 0);
		o.set(clamp(Math.round(base + dir * (o.step ?? 1) * mult)));
		input.value = String(o.get());
		o.ui.changed();
	};
	minus.addEventListener('click', () => bump(-1));
	plus.addEventListener('click', () => bump(1));
	o.ui.live(sync);
	sync();
	return input;
}

export interface SegOption<T> { value: T; label: string; icon?: string; title?: string }

/** A row of buttons, one picked. Wraps on narrow screens rather than shrinking text. */
export function segmented<T>(parent: HTMLElement, options: SegOption<T>[], get: () => T, set: (v: T) => void, o: { label: string; ui: BuilderUI; cls?: string }): HTMLElement {
	const row = parent.createDiv({ cls: `eb-seg${o.cls ? ` ${o.cls}` : ''}`, attr: { role: 'radiogroup', 'aria-label': o.label } });
	const buttons = options.map(opt => {
		const b = row.createEl('button', { cls: 'eb-seg-btn', attr: { role: 'radio' } });
		if (opt.icon) setIcon(b.createSpan({ cls: 'eb-seg-icon' }), opt.icon);
		b.createSpan({ text: opt.label });
		if (opt.title) b.setAttr('title', opt.title);
		b.addEventListener('click', () => { set(opt.value); o.ui.changed(); });
		return { b, opt };
	});
	const sync = () => {
		for (const { b, opt } of buttons) {
			const on = opt.value === get();
			b.toggleClass('is-active', on);
			b.setAttr('aria-checked', String(on));
		}
	};
	o.ui.live(sync);
	sync();
	return row;
}

/** A small "Book: 52 · Use it" tag beside a field, shown while the field differs from the book. */
export function bookTag(aside: HTMLElement, o: { text: () => string | null; use?: () => void; ui: BuilderUI }): void {
	const tag = aside.createDiv({ cls: 'eb-book' });
	const label = tag.createSpan({ cls: 'eb-book-text' });
	const btn = o.use ? tag.createEl('button', { cls: 'eb-book-use', text: 'Use' }) : null;
	btn?.addEventListener('click', () => { o.use!(); o.ui.changed(); });
	o.ui.live(() => {
		const t = o.text();
		tag.toggleClass('is-hidden', t === null);
		label.setText(t ?? '');
	});
}

/** A meter: how a value compares with what the book expects (100% in the middle band). */
export function meter(parent: HTMLElement, label: string, have: number, want: number, fmt: (n: number) => string = n => String(Math.round(n))): void {
	const row = parent.createDiv({ cls: 'eb-meter' });
	const top = row.createDiv({ cls: 'eb-meter-top' });
	top.createSpan({ cls: 'eb-meter-label', text: label });
	top.createSpan({ cls: 'eb-meter-value', text: `${fmt(have)} / ${fmt(want)}` });
	const ratio = want > 0 ? have / want : 1;
	const bar = row.createDiv({ cls: 'eb-meter-bar' });
	// The bar runs 0 → 2× expected; the expected mark sits in the middle.
	const fill = bar.createDiv({ cls: `eb-meter-fill ${ratio > 1.2 ? 'is-high' : ratio < 0.8 ? 'is-low' : 'is-ok'}` });
	fill.setCssProps({ '--eb-fill': `${Math.max(2, Math.min(100, ratio * 50))}%` });
	bar.createDiv({ cls: 'eb-meter-mark' });
}

export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
	const b = parent.createEl('button', { cls: `eb-icon-btn ${cls}`.trim(), attr: { 'aria-label': label, title: label } });
	setIcon(b, icon);
	b.addEventListener('click', onClick);
	return b;
}

export function textButton(parent: HTMLElement, icon: string, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
	const b = parent.createEl('button', { cls: `eb-text-btn ${cls}`.trim() });
	setIcon(b.createSpan({ cls: 'eb-text-btn-icon' }), icon);
	b.createSpan({ text });
	b.addEventListener('click', onClick);
	return b;
}

/**
 * Dice without typing: − count +, the die, − bonus +, the average against what
 * the book expects, and a reset to the book's dice. `read` and `write` work on
 * whatever holds the dice (an attack's text, a spell's damage).
 */
export function dicePad(parent: HTMLElement, o: { read: () => Dice | null; write: (d: Dice) => void; sides: () => number; avg: () => number | null; want?: () => number; reset?: { shown: () => boolean; run: () => void }; ui: BuilderUI }): HTMLElement {
	const pad = parent.createDiv({ cls: 'eb-dice eb-noswipe' });
	const parts = () => o.read() ?? { count: 1, sides: o.sides(), bonus: 0 };
	const set = (d: Dice) => { o.write(d); o.ui.changed(); };
	iconButton(pad, 'minus', 'One die fewer', () => { const p = parts(); if (p.count > 1) set({ ...p, count: p.count - 1 }); }, 'eb-dice-btn');
	const diceText = pad.createSpan({ cls: 'eb-dice-text' });
	iconButton(pad, 'plus', 'One die more', () => { const p = parts(); set({ ...p, count: Math.min(20, p.count + 1) }); }, 'eb-dice-btn');
	pad.createSpan({ cls: 'eb-dice-sep', text: 'bonus' });
	iconButton(pad, 'minus', 'Less bonus', () => { const p = parts(); set({ ...p, bonus: Math.max(0, p.bonus - (p.bonus > 20 ? 5 : 1)) }); }, 'eb-dice-btn');
	const bonusText = pad.createSpan({ cls: 'eb-dice-text' });
	iconButton(pad, 'plus', 'More bonus', () => { const p = parts(); set({ ...p, bonus: p.bonus + (p.bonus >= 20 ? 5 : 1) }); }, 'eb-dice-btn');
	const avg = pad.createSpan({ cls: 'eb-dice-avg' });
	const reset = o.reset ? textButton(pad, 'rotate-ccw', 'Book dice', () => { o.reset!.run(); o.ui.changed(); }, 'eb-dice-reset') : null;
	o.ui.live(() => {
		const p = o.read();
		diceText.setText(p ? `${p.count}d${p.sides}` : '—');
		bonusText.setText(p ? `+${Math.max(0, p.bonus)}` : '—');
		avg.empty();
		const have = o.avg();
		const want = o.want?.();
		if (have !== null) {
			avg.createSpan({ cls: 'eb-dice-avg-have', text: `avg ${Math.round(have * 10) / 10}` });
			if (want !== undefined) {
				const off = want ? have / want : 1;
				avg.createSpan({ cls: `eb-dice-avg-want ${off > 1.25 ? 'is-high' : off < 0.75 ? 'is-low' : 'is-ok'}`, text: `book ${Math.round(want)}` });
			}
		}
		reset?.toggleClass('is-hidden', !o.reset!.shown());
	});
	return pad;
}
