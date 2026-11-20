// The builder, for every game system: one dialog for making a monster, a spell
// or an item. Each system registers its kinds (`registerKind`), either written
// by hand (Nimble's monster, with the GM Guide's numbers) or from a schema
// (core/builder/schema.ts). The same
// frame as the level-up wizard (steps across the top, a carousel, Back and Next),
// but always the same size, wide rather than tall, with a live preview beside
// the form (a sheet on phones). Every kind fills itself in from the books'
// numbers; whatever the GM types is kept. The first step holds everything a
// quick build needs, and Create works from any step.

import { App, Menu, Modal, normalizePath, Notice, setIcon, stringifyYaml, TFile } from 'obsidian';
import { gameIcon } from '../icons';
import type EmberVaultPlugin from '../../../main';
import { confirmAction, isPhone, isTouch } from '../touch';
import { fuzzyRank } from '../compendium/query';
import { applyLook } from '../look';

/** What a builder makes: "monster", "spell", "item"… (each system has its own). */
export type EntityKind = string;

/** Dice as the dice pad edits them: 2d6 + 3. */
export interface Dice { count: number; sides: number; bonus: number }

export interface StepDef { id: string; label: string; icon: string }

/** Where the finished entity goes. */
export interface Output {
	/** The fence's language: nimble, nimble-spell, 5e… */
	lang: string;
	body: string;
	name: string;
	/** Properties for a new note. */
	frontmatter: Record<string, string>;
	/** The folder a new note goes in, before the GM changes it. */
	folder: string;
	/** Properties of any shape (lists, numbers) for a new note; written as YAML instead of `frontmatter`. */
	properties?: Record<string, unknown>;
	/** Text after the block in a new note ("## Notes"). */
	after?: string;
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
	plugin: EmberVaultPlugin;
	sourcePath: string;
	/** Something changed that only the preview, the check and live hints show. */
	changed(): void;
	/** Something changed the shape of the steps (role, a list grew): redraw them, staying put. */
	rebuild(): void;
	/** Run on every change: keep a hint, an expected value or an untouched field current. */
	live(fn: () => void): void;
	go(stepId: string): void;
	/** Go to a step and put the cursor in a field (by its data-field), with a glow that fades. */
	nudge(stepId: string, field: string): void;
	phone: boolean;
}

export interface BuilderOptions {
	kind: EntityKind;
	/** The game system whose builder opens (its id); else the note's. */
	system?: string;
	/** Opens on this monster (or spell, item) as a template. */
	seed?: unknown;
	/** Put the block in the note being edited instead of making a note. */
	insert?: (block: string) => void;
	/** Editing a block in a note: write it back instead. */
	writeBack?: (body: string) => Promise<boolean>;
	/** Lines in the block being edited that it doesn't read: Save rewrites the block without them, so it asks first. */
	unread?: number;
	/** The note the builder was opened from (for links and the preview). */
	sourcePath?: string;
	/** Finish some other way (a level up writes a sheet's properties). True when it's done. */
	apply?: (out: Output) => Promise<boolean>;
	/** A new note was made (instead of opening it). */
	onCreated?: (file: TFile) => void;
}

export type KindFactory = (plugin: EmberVaultPlugin, seed: unknown) => KindBuilder;

/** A kind a system can build, in the order the kind bar shows them. */
interface KindEntry { system: string; kind: EntityKind; label: string; icon: string; factory: KindFactory; hidden?: boolean }
const KINDS: KindEntry[] = [];

/** Systems register their kinds when they load, so this file doesn't import them. */
/** `hidden`: opened only on purpose (a character, a level up), never in the kind bar or the New… commands. */
export function registerKind(system: string, kind: EntityKind, meta: { label: string; icon: string; hidden?: boolean }, f: KindFactory): void {
	const i = KINDS.findIndex(k => k.system === system && k.kind === kind);
	const entry = { system, kind, ...meta, factory: f };
	if (i >= 0) KINDS[i] = entry; else KINDS.push(entry);
}

export function kindAvailable(system: string, kind: EntityKind): boolean {
	return KINDS.some(k => k.system === system && k.kind === kind);
}

/** What a system can build ("New monster…"), in order. */
export function kindsOf(system: string): { kind: EntityKind; label: string; icon: string }[] {
	return KINDS.filter(k => k.system === system && !k.hidden).map(({ kind, label, icon }) => ({ kind, label, icon }));
}

const factory = (system: string, kind: EntityKind) => KINDS.find(k => k.system === system && k.kind === kind)?.factory;

export class EntityBuilder extends Modal implements BuilderUI {
	/** Phones, and anything narrower than two columns need (an iPad held upright): one column, the preview as a sheet. */
	phone = isPhone() || (typeof window !== 'undefined' && window.innerWidth < 900);
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
	private busy = false;
	/** Each kind's output as it opened, so closing only asks when something has changed. */
	private baselines = new Map<EntityKind, string>();
	/** Leaving on purpose (saved, or Discard chosen): close without asking. */
	private leaving = false;
	private asking = false;

	/** The game system whose kinds this builder makes. */
	readonly system: string;

	constructor(public plugin: EmberVaultPlugin, private o: BuilderOptions) {
		super(plugin.app);
		this.sourcePath = o.sourcePath ?? plugin.app.workspace.getActiveFile()?.path ?? '';
		this.system = o.system ?? plugin.system(this.sourcePath).id;
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-entity-builder');
		applyLook(this.modalEl, this.system);
		if (this.phone) this.modalEl.addClass('is-phone-layout');
		this.titleEl.empty();
		const { contentEl } = this;
		contentEl.empty();

		const head = contentEl.createDiv({ cls: 'eb-head' });
		this.kindBar = head.createDiv({ cls: 'eb-kinds', attr: { role: 'radiogroup' } });
		this.chip = head.createDiv({ cls: 'eb-chip', attr: { 'aria-live': 'polite' } });
		this.dots = contentEl.createDiv({ cls: 'eb-dots', attr: { role: 'tablist' } });

		const body = contentEl.createDiv({ cls: 'eb-body' });
		this.viewport = body.createDiv({ cls: 'eb-viewport' });
		this.track = this.viewport.createDiv({ cls: 'eb-track' });
		const side = body.createDiv({ cls: 'eb-side' });
		this.sheet = side;
		const sheetHead = side.createDiv({ cls: 'eb-sheet-head' });
		sheetHead.createSpan({ text: 'Preview' });
		const closeSheet = sheetHead.createEl('button', { cls: 'eb-sheet-close', attr: { 'aria-label': 'Close the preview' } });
		setIcon(closeSheet, gameIcon('x'));
		closeSheet.addEventListener('click', () => this.toggleSheet(false));
		this.checkEl = side.createDiv({ cls: 'eb-check' });
		this.previewEl = side.createDiv({ cls: 'eb-preview' });

		const foot = contentEl.createDiv({ cls: 'eb-foot' });
		this.backBtn = foot.createEl('button', { cls: 'eb-back' });
		foot.createDiv({ cls: 'eb-foot-space' });
		if (this.phone) {
			this.previewBtn = foot.createEl('button', { cls: 'eb-preview-btn', attr: { 'aria-label': 'Preview' } });
			setIcon(this.previewBtn, gameIcon('eye'));
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

	/** The kinds with something changed since they opened (the one on screen first). */
	private changedKinds(): KindBuilder[] {
		const all = [this.b, ...[...this.builders.values()].filter(b => b !== this.b)];
		return all.filter(b => b && this.baselines.has(b.kind) && b.output().body !== this.baselines.get(b.kind));
	}

	/**
	 * Every way out (Cancel, the x, Escape, a click outside) asks first when
	 * something's been filled in, so a stray click doesn't lose a build.
	 */
	close(): void {
		if (this.leaving || this.asking) { if (this.leaving) super.close(); return; }
		const changed = this.changedKinds();
		if (!changed.length) { super.close(); return; }
		const b = changed[0];
		const title = this.o.writeBack ? `Discard your changes to ${b.output().name || `this ${b.noun}`}?` : `Discard this new ${b.noun}?`;
		this.asking = true;
		void confirmAction(this.app, title, '', 'Discard', true, 'Keep building').then((discard) => {
			this.asking = false;
			if (!discard) return;
			this.leaving = true;
			super.close();
		});
	}

	/** Close after saving: nothing to ask about. */
	private done(): void {
		this.leaving = true;
		this.close();
	}

	// ------------------------------------------------------------------------
	// Kinds and steps

	private builderFor(kind: EntityKind, seed?: unknown): KindBuilder | null {
		let b = this.builders.get(kind);
		if (!b || seed !== undefined) {
			const f = factory(this.system, kind);
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
		if (!this.baselines.has(kind)) this.baselines.set(kind, b.output().body);
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
		const kinds = KINDS.filter(k => k.system === this.system && (k.kind === this.b.kind || (!k.hidden && !this.o.writeBack && !this.o.apply && !KINDS.find(x => x.system === this.system && x.kind === this.b.kind)?.hidden)));
		for (const { kind: k, label, icon } of kinds) {
			const on = k === this.b.kind;
			const btn = this.kindBar.createEl('button', { cls: `eb-kind${on ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(on) } });
			setIcon(btn.createSpan({ cls: 'eb-kind-icon' }), gameIcon(icon));
			btn.createSpan({ cls: 'eb-t', text: label });
			// Phones show the icon only: then it needs a name (and gets a tooltip).
			if (this.phone) btn.setAttr('aria-label', label);
			btn.addEventListener('click', () => { if (k !== this.b.kind) this.setKind(k); });
		}
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
		this.chip.createSpan({ cls: 'eb-t', text: c.text });
		this.renderChrome();
	}

	go(id: string, animate = true): void {
		const i = this.steps.findIndex(s => s.id === id);
		if (i < 0) return;
		this.at = i;
		this.placeTrack(animate);
		this.renderChrome();
	}

	nudge(id: string, fieldName: string): void {
		this.go(id);
		const i = this.steps.findIndex(s => s.id === id);
		const panel = this.panels[i];
		if (!panel) return;
		// After the slide, so the browser doesn't scroll the carousel to reach the field.
		window.setTimeout(() => {
			const el = panel.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldName)}"]`);
			if (!el) return;
			const target = el.closest<HTMLElement>('.eb-field, .eb-attack, .eb-ability') ?? el;
			target.removeClass('eb-nudge');
			void target.offsetWidth; // restart the glow
			target.addClass('eb-nudge');
			window.setTimeout(() => target.removeClass('eb-nudge'), 1900);
			if (el.matches('input, textarea')) (el as HTMLInputElement).focus({ preventScroll: true });
			target.scrollIntoView({ block: 'nearest' });
		}, 360);
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
			const d = this.dots.createEl('button', { cls: `eb-dot${i === this.at ? ' is-active' : ''}${i < this.at ? ' is-done' : ''}`, attr: { role: 'tab', 'aria-selected': String(i === this.at) } });
			setIcon(d.createSpan({ cls: 'eb-dot-icon' }), gameIcon(st.icon));
			d.createSpan({ cls: 'eb-dot-label eb-t', text: st.label });
			d.addEventListener('click', () => this.go(st.id));
		});
		this.dots.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
		this.backBtn.empty();
		if (this.at === 0) this.backBtn.createSpan({ cls: 'eb-t', text: 'Cancel' });
		else { setIcon(this.backBtn.createSpan(), gameIcon('chevron-left')); this.backBtn.createSpan({ cls: 'eb-t', text: 'Back' }); }
		const last = this.at === this.steps.length - 1;
		const verb = this.o.writeBack ? 'Save' : this.o.insert ? 'Insert' : this.o.apply ? 'Finish' : 'Create';
		this.nextBtn.empty();
		if (last) {
			setIcon(this.nextBtn.createSpan(), gameIcon('check'));
			this.nextBtn.createSpan({ cls: 'eb-t', text: `${verb} ${this.b.noun}` });
		} else {
			this.nextBtn.createSpan({ cls: 'eb-t', text: 'Next' });
			setIcon(this.nextBtn.createSpan(), gameIcon('chevron-right'));
		}
		// Create from any step: the rest fills in from the book.
		this.createBtn.toggleClass('is-gone', last);
		this.createBtn.empty();
		this.createBtn.createSpan({ cls: 'eb-t', text: this.phone ? verb : `${verb} now` });
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
				const n = this.o.unread ?? 0;
				if (n && !await confirmAction(this.app, 'Save without the lines it can\'t read?',
					`${n === 1 ? 'One line in this block isn\'t' : `${n} lines in this block aren't`} shown as written. Saving rewrites the block without ${n === 1 ? 'it' : 'them'}.`,
					'Save anyway', true, 'Keep editing')) return;
				if (await this.o.writeBack(out.body)) { this.done(); new Notice(`Saved ${out.name}.`); }
				return;
			}
			if (this.o.apply) { if (await this.o.apply(out)) this.done(); return; }
			if (this.o.insert) { this.o.insert(block); this.done(); return; }
			const file = await this.createNote(out, block);
			this.done();
			if (this.o.onCreated) this.o.onCreated(file);
			else await this.app.workspace.getLeaf(false).openFile(file);
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
		const props = out.properties ? `---\n${stringifyYaml(out.properties)}---\n\n` : fm.length ? `---\n${fm.join('\n')}\n---\n\n` : '';
		const text = `${props}${block}\n${out.after ? `\n${out.after}\n` : ''}`;
		return this.app.vault.create(path, text);
	}
}

/** A fenced block, with a longer fence if the body itself has one. */
export function fence(lang: string, body: string): string {
	const longest = Math.max(2, ...[...body.matchAll(/`{3,}/g)].map(m => m[0].length));
	const f = '`'.repeat(longest + 1);
	return body ? `${f}${lang}\n${body}\n${f}` : `${f}${lang}\n${f}`;
}

function typing(e: KeyboardEvent): boolean {
	const t = e.target as HTMLElement | null;
	return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/** Where new homebrew goes: the active GM campaign's folder for it, else a vault-level one. */
export function homeFolder(plugin: EmberVaultPlugin, campaignSub: string, vaultFolder: string): string {
	const c = plugin.campaigns?.active;
	return c && c.role !== 'player' ? normalizePath(`${c.folder}/${campaignSub}`) : vaultFolder;
}

/** Open the builder for a kind of the note's system (or `o.system`). Null when that system can't build it. */
export function openBuilder(plugin: EmberVaultPlugin, o: BuilderOptions): EntityBuilder | null {
	const sourcePath = o.sourcePath ?? plugin.app.workspace.getActiveFile()?.path ?? '';
	const system = o.system ?? plugin.system(sourcePath).id;
	if (!kindAvailable(system, o.kind)) return null;
	const m = new EntityBuilder(plugin, { ...o, system, sourcePath });
	m.open();
	return m;
}

// ----------------------------------------------------------------------------
// Fields: one look for every kind. Labels above, help under, expected values
// beside, controls that fit a phone.
//
// Obsidian shows a tooltip for anything with an aria-label, so only buttons get
// one (worded as what they do). Fields take their name from the visible label
// (aria-labelledby), or a hidden one where there's no label on screen.

export interface FieldParts { row: HTMLElement; control: HTMLElement; aside: HTMLElement; help: HTMLElement; labelId: string }

let ids = 0;
const nextId = () => `eb-l-${++ids}`;

/** A name for a control that has no label on screen, read by screen readers but never shown as a tooltip. */
function hiddenLabel(parent: HTMLElement, text: string): string {
	const id = nextId();
	parent.createSpan({ cls: 'eb-sr', text, attr: { id } });
	return id;
}

/** Name a control: by a label's id, or by a hidden label. `data-field` is for finding it again (tests, focus). */
function name(el: HTMLElement, parent: HTMLElement, o: { labelledBy?: string; label?: string }): void {
	const id = o.labelledBy ?? (o.label ? hiddenLabel(parent, o.label) : undefined);
	if (id) el.setAttr('aria-labelledby', id);
	if (o.label) el.dataset.field = o.label;
}

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
	const labelId = nextId();
	top.createEl('label', { cls: 'eb-label', text: label, attr: { id: labelId } });
	const aside = top.createDiv({ cls: 'eb-aside' });
	const control = row.createDiv({ cls: 'eb-control' });
	const help = row.createDiv({ cls: 'eb-help' });
	if (o.help) help.setText(o.help); else help.addClass('is-empty');
	return { row, control, aside, help, labelId };
}

export interface TextOpts { value?: string; placeholder?: string; onInput: (v: string) => void; words?: boolean; code?: boolean; label?: string; labelledBy?: string; cls?: string }

export function textInput(parent: HTMLElement, o: TextOpts): HTMLInputElement {
	const i = parent.createEl('input', { cls: `eb-input${o.cls ? ` ${o.cls}` : ''}`, attr: { type: 'text', enterkeyhint: 'next', spellcheck: o.code ? 'false' : 'true', autocomplete: 'off' } });
	name(i, parent, o);
	i.autocapitalize = o.code ? 'off' : o.words ? 'words' : 'sentences';
	if (o.code) i.setAttr('autocorrect', 'off');
	i.value = o.value ?? '';
	if (o.placeholder) i.placeholder = o.placeholder;
	i.addEventListener('input', () => o.onInput(i.value));
	i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !e.defaultPrevented) { e.preventDefault(); focusNext(i); } });
	return i;
}

export function textArea(parent: HTMLElement, o: { value?: string; placeholder?: string; onInput: (v: string) => void; rows?: number; label?: string; labelledBy?: string }): HTMLTextAreaElement {
	const t = parent.createEl('textarea', { cls: 'eb-textarea', attr: { rows: String(o.rows ?? 2) } });
	name(t, parent, o);
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

/** ↑ and ↓ (Shift for 10) nudge a number typed in a text field. */
export function arrowNudge(input: HTMLInputElement, bump: (dir: number, mult: number) => void): void {
	input.addEventListener('keydown', (e) => {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
	});
}

/**
 * A number with − and + either side. Empty means "use the book's number",
 * which shows as the placeholder. `get` keeps it current when something else
 * moves it (the level, a template).
 */
export function numberInput(parent: HTMLElement, o: { get: () => number | undefined; placeholder: () => string; set: (v: number | undefined) => void; min?: number; max?: number; step?: number; label: string; labelledBy?: string; ui: BuilderUI }): HTMLInputElement {
	const wrap = parent.createDiv({ cls: 'eb-num' });
	const step = o.step ?? 1;
	const minus = wrap.createEl('button', { cls: 'eb-num-btn', attr: { 'aria-label': `Subtract ${step}`, tabindex: '-1' } });
	setIcon(minus, gameIcon('minus'));
	const input = wrap.createEl('input', { cls: 'eb-num-input', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', enterkeyhint: 'next', autocomplete: 'off' } });
	name(input, wrap, o);
	const plus = wrap.createEl('button', { cls: 'eb-num-btn', attr: { 'aria-label': `Add ${step}`, tabindex: '-1' } });
	setIcon(plus, gameIcon('plus'));
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
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(input); } });
	const bump = (dir: number, mult = 1) => {
		const base = o.get() ?? (parseFloat(o.placeholder()) || 0);
		o.set(clamp(Math.round(base + dir * step * mult)));
		input.value = String(o.get());
		o.ui.changed();
	};
	arrowNudge(input, bump);
	minus.addEventListener('click', () => bump(-1));
	plus.addEventListener('click', () => bump(1));
	o.ui.live(sync);
	sync();
	return input;
}

export interface SegOption<T> { value: T; label: string; icon?: string; title?: string; /** A tint for this option (a school's colour). */ tone?: string }

/**
 * A row of buttons, one picked, with a thumb that slides to the pick (across
 * rows too, when it wraps into a grid). Never shrinks text: it wraps instead.
 */
/** Where each keyed thumb was, so a control drawn again (a step redrawn after the pick) still slides from the old pick. */
const thumbs = new Map<string, Record<string, string>>();

export function segmented<T>(parent: HTMLElement, options: SegOption<T>[], get: () => T, set: (v: T) => void, o: { label: string; labelledBy?: string; ui: BuilderUI; cls?: string; key?: string }): HTMLElement {
	const row = parent.createDiv({ cls: `eb-seg${o.cls ? ` ${o.cls}` : ''}`, attr: { role: 'radiogroup' } });
	name(row, parent, o);
	const thumb = row.createDiv({ cls: 'eb-seg-thumb is-still', attr: { 'aria-hidden': 'true' } });
	const buttons = options.map(opt => {
		const b = row.createEl('button', { cls: `eb-seg-btn${opt.tone ? ` tone-${opt.tone}` : ''}`, attr: { role: 'radio' } });
		if (opt.icon) setIcon(b.createSpan({ cls: 'eb-seg-icon' }), gameIcon(opt.icon));
		b.createSpan({ cls: 'eb-t', text: opt.label });
		if (opt.title) b.setAttr('title', opt.title);
		b.addEventListener('click', () => { set(opt.value); o.ui.changed(); });
		return { b, opt };
	});
	let placed = false;
	const place = (animate: boolean) => {
		const on = buttons.find(x => x.opt.value === get())?.b;
		thumb.toggleClass('is-hidden', !on);
		if (!on) return;
		if (!on.offsetWidth) { window.requestAnimationFrame(() => place(false)); return; } // not laid out yet
		const to = { '--x': `${on.offsetLeft}px`, '--y': `${on.offsetTop}px`, '--w': `${on.offsetWidth}px`, '--h': `${on.offsetHeight}px` };
		const from = !placed && o.key ? thumbs.get(o.key) : undefined;
		if (from && JSON.stringify(from) !== JSON.stringify(to)) {
			// Drawn again after a pick: start where the old control's thumb was, then slide.
			thumb.addClass('is-still');
			thumb.setCssProps(from);
			void thumb.offsetWidth;
			thumb.removeClass('is-still');
		} else thumb.toggleClass('is-still', !animate || !placed);
		thumb.setCssProps(to);
		if (o.key) thumbs.set(o.key, to);
		placed = true;
	};
	const sync = () => {
		for (const { b, opt } of buttons) {
			const v = opt.value === get();
			b.toggleClass('is-active', v);
			b.setAttr('aria-checked', String(v));
		}
		// The thumb takes the picked option's tint.
		const tone = options.find(x => x.value === get())?.tone;
		thumb.className = `eb-seg-thumb${thumb.hasClass('is-still') ? ' is-still' : ''}${tone ? ` tone-${tone}` : ''}`;
		place(true);
	};
	// A wrap or a resize moves the buttons: the thumb follows without sliding. Not on the observer's first
	// call (it fires as the control appears), which would cut short a slide that has just started.
	let size = '';
	new ResizeObserver(() => {
		const now = `${row.offsetWidth}x${row.offsetHeight}`;
		if (size && now !== size) place(false);
		size = now;
	}).observe(row);
	o.ui.live(sync);
	sync();
	return row;
}

/** A small "Book: 52 · Use it" tag beside a field, shown while the field differs from the book. */
export function bookTag(aside: HTMLElement, o: { text: () => string | null; use?: () => void; ui: BuilderUI }): void {
	const tag = aside.createDiv({ cls: 'eb-book' });
	const label = tag.createSpan({ cls: 'eb-book-text eb-t' });
	const btn = o.use ? tag.createEl('button', { cls: 'eb-book-use' }) : null;
	btn?.createSpan({ cls: 'eb-t', text: 'Use' });
	btn?.addEventListener('click', () => { o.use!(); o.ui.changed(); });
	o.ui.live(() => {
		const t = o.text();
		tag.toggleClass('is-hidden', t === null);
		label.setText(t ?? '');
	});
}

/** A pill whose text is centred on its letters, whatever the font. */
export function pill(parent: HTMLElement, text: string, cls: string): HTMLElement {
	const el = parent.createSpan({ cls: `eb-pill ${cls}` });
	el.createSpan({ cls: 'eb-t', text });
	return el;
}

/** One of a row of stat tiles: a label over a big number, with a line under it ("4d8", "200 XP"). */
export interface StatTile { label: string; value: string; sub?: string; /** The one that matters most: set in the game's colour. */ lead?: boolean; title?: string }

/**
 * Stat tiles (AC 15, HP 22, PB +2…): the numbers a GM or player checks at a
 * glance, in the game's paper and type. A game's builder check and summaries use them.
 */
export function statTiles(parent: HTMLElement, tiles: StatTile[], cls = ''): HTMLElement {
	const row = parent.createDiv({ cls: `eb-tiles${cls ? ` ${cls}` : ''}` });
	for (const t of tiles) {
		const tile = row.createDiv({ cls: `eb-tile${t.lead ? ' is-lead' : ''}` });
		if (t.title) tile.setAttr('title', t.title);
		tile.createDiv({ cls: 'eb-tile-label', text: t.label });
		tile.createDiv({ cls: 'eb-tile-value', text: t.value });
		if (t.sub) tile.createDiv({ cls: 'eb-tile-sub', text: t.sub });
	}
	return row;
}

/** The head of a check: a kicker over a big value ("Challenge / CR 3"), and a tag beside it. */
export function checkHead(parent: HTMLElement, o: { kicker: string; value: string; tag?: string }): HTMLElement {
	const head = parent.createDiv({ cls: 'eb-check-head' });
	const level = head.createDiv({ cls: 'eb-check-level' });
	level.createSpan({ cls: 'eb-check-kicker', text: o.kicker });
	level.createSpan({ cls: 'eb-check-value', text: o.value });
	if (o.tag) pill(head, o.tag, 'eb-check-tag');
	return head;
}

/** A meter: how a value compares with what the book expects (100% in the middle band). */
export function meter(parent: HTMLElement, label: string, have: number, want: number, fmt: (n: number) => string = n => String(Math.round(n))): void {
	// HP takes the game's HP colour (Nimble's red, 5e's green).
	const row = parent.createDiv({ cls: `eb-meter${/^HP\b|hit points/i.test(label) ? ' is-hp' : ''}` });
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
	const b = parent.createEl('button', { cls: `eb-icon-btn ${cls}`.trim(), attr: { 'aria-label': label } });
	setIcon(b, gameIcon(icon));
	b.addEventListener('click', onClick);
	return b;
}

export function textButton(parent: HTMLElement, icon: string, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
	const b = parent.createEl('button', { cls: `eb-text-btn ${cls}`.trim() });
	setIcon(b.createSpan({ cls: 'eb-text-btn-icon' }), gameIcon(icon));
	b.createSpan({ cls: 'eb-t', text });
	b.addEventListener('click', onClick);
	return b;
}

/** Remove something only after "Are you sure?" (the plugin's own small dialog, which works on phones too). */
export function removeButton(parent: HTMLElement, app: App, what: string, onRemove: () => void): HTMLButtonElement {
	return iconButton(parent, 'trash-2', `Remove ${what}`, () => {
		void confirmAction(app, `Remove ${what}?`, '', 'Remove', true).then(ok => { if (ok) onRemove(); });
	}, 'eb-remove');
}

// ----------------------------------------------------------------------------
// Type to filter: a field with suggestions under it that narrow as you type
// (fuzzy, like the compendium's search). ↑ ↓ move, Enter picks, Escape closes;
// anything else typed is kept as it is.

export interface Suggestion<T> { item: T; label: string; meta?: string }

export function suggestField<T>(parent: HTMLElement, o: TextOpts & {
	suggest: (query: string) => Suggestion<T>[];
	onPick: (s: Suggestion<T>, input: HTMLInputElement) => void;
	/** Show suggestions before anything is typed (the most used ones). */
	onEmpty?: boolean;
	/** Word fields: once what's typed is exactly the one suggestion, there's nothing left to suggest. */
	hideExact?: boolean;
}): HTMLInputElement {
	const box = parent.createDiv({ cls: 'eb-search' });
	const input = textInput(box, o);
	input.setAttr('role', 'combobox');
	input.setAttr('aria-autocomplete', 'list');
	input.setAttr('aria-expanded', 'false');
	const list = box.createDiv({ cls: 'eb-search-list', attr: { role: 'listbox', id: nextId() } });
	input.setAttr('aria-controls', list.id);
	let hits: Suggestion<T>[] = [];
	let sel = -1;
	const close = () => { list.removeClass('is-open'); input.setAttr('aria-expanded', 'false'); hits = []; sel = -1; };
	const pick = (s: Suggestion<T>) => { close(); o.onPick(s, input); };
	const mark = () => [...list.children].forEach((r, i) => { r.toggleClass('is-selected', i === sel); if (i === sel) r.scrollIntoView({ block: 'nearest' }); });
	const draw = () => {
		const q = input.value.trim();
		list.empty();
		hits = q || o.onEmpty ? o.suggest(q).slice(0, 6) : [];
		// Nothing to suggest when what's typed is already exactly a suggestion.
		if (o.hideExact && hits.length === 1 && hits[0].label.toLowerCase() === q.toLowerCase()) hits = [];
		sel = hits.length && q ? 0 : -1;
		hits.forEach((h, i) => {
			const r = list.createDiv({ cls: 'eb-search-row', attr: { role: 'option', id: `${list.id}-${i}` } });
			r.createSpan({ cls: 'eb-search-name', text: h.label });
			if (h.meta) r.createSpan({ cls: 'eb-search-meta', text: h.meta });
			r.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(h); });
		});
		mark();
		list.toggleClass('is-open', hits.length > 0);
		input.setAttr('aria-expanded', String(hits.length > 0));
	};
	input.addEventListener('input', draw);
	input.addEventListener('focus', draw);
	input.addEventListener('blur', () => window.setTimeout(close, 100));
	input.addEventListener('keydown', (e) => {
		if (!hits.length) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault(); e.stopPropagation();
			sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
			input.setAttr('aria-activedescendant', `${list.id}-${sel}`);
			mark();
		} else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); e.stopPropagation(); pick(hits[sel]); }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
	}, true);
	return input;
}

/** Fuzzy suggestions from a list of words with how often each is used (most used first when nothing's typed). */
export function wordSuggestions(words: Map<string, number>, query: string, noun = 'monster'): Suggestion<string>[] {
	const all = [...words.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w, n]) => ({ item: w, label: w, meta: `${n} ${noun}${n === 1 ? '' : 's'}` }));
	if (!query) return all;
	return fuzzyRank(all, query.toLowerCase(), s => [s.label], 12).map(x => x.item);
}

// ----------------------------------------------------------------------------
// Where it's saved: a pill ("Saved in Monsters") that opens into a folder
// picker; type a new path to make one.

export function folderPill(parent: HTMLElement, o: { app: App; get: () => string; set: (path: string) => void }): HTMLElement {
	const wrap = parent.createDiv({ cls: 'eb-folder' });
	const draw = () => {
		wrap.empty();
		const path = o.get() || '/';
		const parts = path.split('/').filter(Boolean);
		const btn = wrap.createEl('button', { cls: 'eb-folder-pill', attr: { 'aria-label': `Saved in ${path}. Change the folder` } });
		setIcon(btn.createSpan({ cls: 'eb-folder-icon' }), gameIcon('save'));
		btn.createSpan({ cls: 'eb-folder-kicker eb-t', text: 'Saved in' });
		btn.createSpan({ cls: 'eb-folder-name eb-t', text: parts[parts.length - 1] ?? 'the vault root' });
		if (parts.length > 1) btn.createSpan({ cls: 'eb-folder-parent eb-t', text: parts.slice(0, -1).join(' / ') });
		setIcon(btn.createSpan({ cls: 'eb-folder-edit' }), gameIcon('chevron-down'));
		btn.addEventListener('click', () => edit());
	};
	const edit = () => {
		wrap.empty();
		const folders = o.app.vault.getAllFolders(true).map(f => f.path || '/').filter(p => !p.startsWith('.'));
		let committed = false;
		const commit = (v: string) => { if (committed) return; committed = true; o.set(v.trim().replace(/^\/+|\/+$/g, '') || '/'); draw(); };
		const input = suggestField<string>(wrap, {
			value: o.get(), code: true, label: 'Folder', placeholder: 'Folder path', onEmpty: true, onInput: () => { /* committed on Enter or leaving */ },
			suggest: (q) => fuzzyRank(folders, q.toLowerCase(), f => [f, f.split('/').pop() ?? f], 40).map(x => ({ item: x.item, label: x.item })).concat(q ? [] : folders.slice(0, 40).map(f => ({ item: f, label: f }))).slice(0, 8),
			onPick: (s) => commit(s.item),
		});
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); commit(input.value); } else if (e.key === 'Escape') { committed = true; draw(); } });
		input.addEventListener('blur', () => window.setTimeout(() => commit(input.value), 120));
		input.focus();
		input.select();
	};
	draw();
	return wrap;
}

// ----------------------------------------------------------------------------
// Dice without typing

/** What a die is for, from the GM Guide's themes (p.26). */
export const DIE_THEME: Record<number, string> = { 4: 'Undead: slow, big bonus damage', 6: 'Goblins: chaotic, likely to miss or crit', 8: 'Humans: balanced and reliable', 10: 'Beasts: stronger than humans', 12: 'Giants: superhumanly strong', 20: 'The mightiest creatures' };

/**
 * Dice in one joined field: [ 1 ⌃⌄ │ d8 ▾ │ + 6 ⌃⌄ ]. The numbers can be typed
 * (the number pad on phones, ↑ ↓ on a keyboard) or stepped; the die is a menu.
 * Beside it, the average and the book's figure, which puts the book's dice
 * back when they've been changed. `read` and `write` work on whatever holds the
 * dice (an attack's text, a spell's damage).
 */
export function dicePad(parent: HTMLElement, o: { read: () => Dice | null; write: (d: Dice) => void; sides: () => number; avg: () => number | null; want?: () => number; reset?: { shown: () => boolean; run: () => void }; dieMenu?: boolean; ui: BuilderUI }): HTMLElement {
	const pad = parent.createDiv({ cls: 'eb-dice eb-noswipe' });
	const parts = () => o.read() ?? { count: 1, sides: o.sides(), bonus: 0 };
	const set = (d: Dice) => { o.write(d); o.ui.changed(); };
	const box = pad.createDiv({ cls: 'eb-dicefield' });

	/** A typeable number with a tiny up/down stepper. */
	const spin = (cls: string, get: () => number, put: (n: number) => void, min: number, max: number, labels: () => [string, string]) => {
		const seg = box.createDiv({ cls: `eb-df-seg ${cls}` });
		const input = seg.createEl('input', { cls: 'eb-df-num', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'done' } });
		input.dataset.field = cls === 'is-count' ? 'Dice' : 'Bonus';
		input.setAttr('aria-labelledby', hiddenLabel(seg, cls === 'is-count' ? 'Number of dice' : 'Bonus'));
		const steps = seg.createDiv({ cls: 'eb-df-steps' });
		const up = steps.createEl('button', { cls: 'eb-df-step', attr: { tabindex: '-1' } });
		setIcon(up, gameIcon('chevron-up'));
		const down = steps.createEl('button', { cls: 'eb-df-step', attr: { tabindex: '-1' } });
		setIcon(down, gameIcon('chevron-down'));
		const clamp = (n: number) => Math.max(min, Math.min(max, n));
		const bump = (dir: number, mult = 1) => { const step = cls === 'is-bonus' && get() >= 20 ? 5 : 1; put(clamp(get() + dir * step * mult)); };
		up.addEventListener('click', () => bump(1));
		down.addEventListener('click', () => bump(-1));
		arrowNudge(input, bump);
		input.addEventListener('input', () => {
			const t = input.value.replace(/[^\d]/g, '');
			if (t !== input.value) input.value = t;
			if (t !== '') put(clamp(parseInt(t, 10)));
		});
		input.addEventListener('focus', () => input.select());
		input.addEventListener('blur', () => { input.value = String(get()); });
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
		o.ui.live(() => {
			if (activeDocument.activeElement !== input) input.value = String(get());
			const [u, d] = labels();
			up.setAttr('aria-label', u);
			down.setAttr('aria-label', d);
			up.disabled = get() >= max;
			down.disabled = get() <= min;
		});
		return seg;
	};

	spin('is-count', () => parts().count, (n) => set({ ...parts(), count: n }), 1, 20, () => [`Add 1d${parts().sides}`, `Remove 1d${parts().sides}`]);
	const die = box.createEl('button', { cls: 'eb-df-seg eb-df-die' });
	const dieText = die.createSpan({ cls: 'eb-t' });
	if (o.dieMenu) setIcon(die.createSpan({ cls: 'eb-die-caret' }), gameIcon('chevron-down'));
	else die.disabled = true;
	die.addEventListener('click', (ev) => {
		if (!o.dieMenu) return;
		const m = new Menu();
		for (const sides of [4, 6, 8, 10, 12, 20]) {
			m.addItem(i => i.setTitle(`d${sides}  ·  ${DIE_THEME[sides]}`).setChecked(parts().sides === sides).onClick(() => {
				// Same damage in the new die: the bonus makes up the difference.
				const p = parts();
				const avg = p.count * (p.sides + 1) / 2 + p.bonus;
				set({ count: p.count, sides, bonus: Math.max(0, Math.round(avg - p.count * (sides + 1) / 2)) });
			}));
		}
		m.showAtMouseEvent(ev);
	});
	box.createSpan({ cls: 'eb-df-plus', text: '+' });
	spin('is-bonus', () => Math.max(0, parts().bonus), (n) => set({ ...parts(), bonus: n }), 0, 200, () => {
		const b = parts().bonus;
		return [`Add ${b >= 20 ? 5 : 1}`, `Subtract ${b > 20 ? 5 : 1}`];
	});

	const avg = pad.createDiv({ cls: 'eb-dice-avg' });
	o.ui.live(() => {
		const sides = o.read()?.sides ?? o.sides();
		dieText.setText(`d${sides}`);
		die.setAttr('aria-label', o.dieMenu ? `d${sides}: change the die` : `d${sides}`);
		avg.empty();
		const have = o.avg();
		const want = o.want?.();
		if (have === null) return;
		avg.createSpan({ cls: 'eb-dice-avg-have', text: `avg ${Math.round(have * 10) / 10}` });
		if (want === undefined) return;
		const off = want ? have / want : 1;
		const tone = off > 1.25 ? 'is-high' : off < 0.75 ? 'is-low' : 'is-ok';
		if (o.reset?.shown()) {
			// Changed from the book's dice: the book's figure is the way back.
			const b = avg.createEl('button', { cls: `eb-pill eb-dice-avg-want eb-book-reset ${tone}`, attr: { 'aria-label': 'Use the book\'s dice' } });
			b.createSpan({ cls: 'eb-t', text: `book ${Math.round(want)}` });
			setIcon(b.createSpan({ cls: 'eb-book-reset-icon' }), gameIcon('rotate-ccw'));
			b.addEventListener('click', () => { o.reset!.run(); o.ui.changed(); });
		} else pill(avg, `book ${Math.round(want)}`, `eb-dice-avg-want ${tone}`);
	});
	return pad;
}

// ----------------------------------------------------------------------------
// Review notes: what's worth a second look before saving, each with its fixes.

export interface NoteView { tone: 'warn' | 'tip' | 'ok'; text: string; fixes: { label: string; run: () => void }[] }

export function reviewNotesView(parent: HTMLElement, ui: BuilderUI, notes: () => NoteView[]): void {
	const box = parent.createDiv({ cls: 'eb-checks' });
	ui.live(() => {
		box.empty();
		for (const n of notes()) {
			const row = box.createDiv({ cls: `eb-note tone-${n.tone}` });
			setIcon(row.createSpan({ cls: 'eb-note-icon' }), gameIcon(n.tone === 'ok' ? 'circle-check' : n.tone === 'warn' ? 'triangle-alert' : 'lightbulb'));
			const body = row.createDiv({ cls: 'eb-note-body' });
			body.createDiv({ cls: 'eb-note-text', text: n.text });
			if (!n.fixes.length) continue;
			const acts = body.createDiv({ cls: 'eb-note-fixes' });
			for (const f of n.fixes) {
				const b = acts.createEl('button', { cls: 'eb-note-fix' });
				b.createSpan({ cls: 'eb-t', text: f.label });
				b.addEventListener('click', f.run);
			}
		}
	});
}

/** The review's summary: label, value, and a jump back to the step. */
export function reviewRows(panel: HTMLElement, ui: BuilderUI, rows: [string, string, () => string][]): void {
	const box = panel.createDiv({ cls: 'eb-review' });
	for (const [label, step, text] of rows) {
		const r = box.createDiv({ cls: 'eb-review-row' });
		r.createSpan({ cls: 'eb-review-label', text: label });
		const v = r.createSpan({ cls: 'eb-review-value' });
		const edit = r.createEl('button', { cls: 'eb-review-edit' });
		edit.createSpan({ cls: 'eb-t', text: 'Edit' });
		edit.addEventListener('click', () => ui.go(step));
		ui.live(() => v.setText(text()));
	}
}
