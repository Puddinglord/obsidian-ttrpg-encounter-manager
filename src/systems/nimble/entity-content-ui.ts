// The guided builders for a hero's content, in the builder frame (core/builder):
// what they share (the preview is the block's own card, the check, the review,
// where a new one is saved), the small kinds (a class's option, an ancestry, a
// background, a boon), and the editors the class and subclass builders reuse
// (features, lists, chips, a stepper). The drafts and the rules are
// entity-content.ts; the class and subclass are entity-class-ui.ts.

import { setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { contentFolderFor } from '../../core/content/new-entry';
import { gameIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { Compendium, CompendiumData, Feature, itemDetail, nameKey } from './compendium';
import { compendiumData } from './compendium-data';
import { drawNimbleContent } from './content-blocks';
import {
	blankFeature, cleanEntry, ContentKind, Draft, draftMissing, draftProblems, entryBody, fromEntry, newDraft, optionLevels, STEPS, withDraft,
} from './entity-content';
import {
	BuilderUI, checkHead, field, folderPill, grid, iconButton, KindBuilder, Output, registerKind as coreRegister, reviewNotesView, reviewRows, section, segmented,
	StepDef, suggestField, textArea, textButton, textInput,
} from '../../core/builder/frame';

/** What a builder for a hero's content opens on: a block to edit, or where a new one goes (its class, list). */
export interface ContentSeed { entry?: Record<string, unknown>; editing?: boolean; className?: string; subclass?: string; group?: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export const arr = <T = Draft>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Each kind's word, icon (the compendium's own glyphs) and steps. */
export const META: Record<ContentKind, { label: string; noun: string; icon: string }> = {
	class: { label: 'Class', noun: 'class', icon: 'shield-star' },
	subclass: { label: 'Subclass', noun: 'subclass', icon: 'path' },
	option: { label: 'Option', noun: 'option', icon: 'sparkle' },
	ancestry: { label: 'Ancestry', noun: 'ancestry', icon: 'users-three' },
	background: { label: 'Background', noun: 'background', icon: 'scroll' },
	boon: { label: 'Boon', noun: 'boon', icon: 'diamond' },
};
const STEP: Record<string, { label: string; icon: string }> = {
	start: { label: 'Start', icon: 'sparkles' }, stats: { label: 'Stats', icon: 'chart' }, gear: { label: 'Gear', icon: 'backpack' },
	magic: { label: 'Magic', icon: 'wand' }, resources: { label: 'Resources', icon: 'dice' }, levels: { label: 'Levels', icon: 'list' },
	options: { label: 'Options', icon: 'books' }, traits: { label: 'Traits', icon: 'sparkle' }, review: { label: 'Review', icon: 'check-check' },
};

/** What every hero-content builder shares: the draft, the card as the preview, the check chip, the review, the output. */
export abstract class ContentBuilder implements KindBuilder {
	readonly noun: string;
	readonly icon: string;
	d: Draft;
	protected folder: string;
	protected editing: boolean;
	private cached?: { key: string; comp: Compendium; name: string; className: string };

	constructor(protected plugin: EmberVaultPlugin, readonly kind: ContentKind, seed: unknown) {
		const s: ContentSeed = isObj(seed) ? seed : {};
		this.d = s.entry ? fromEntry(kind, s.entry) : newDraft(kind, s);
		this.editing = !!s.editing;
		this.noun = META[kind].noun;
		this.icon = META[kind].icon;
		this.folder = contentFolderFor(plugin, 'nimble', kind);
	}

	steps(): StepDef[] {
		return STEPS[this.kind].map(id => ({ id, label: id === 'options' && this.kind === 'subclass' ? 'Lists' : STEP[id].label, icon: STEP[id].icon }));
	}

	renderStep(id: string, panel: HTMLElement, ui: BuilderUI): void {
		panel.addClass('ncb-panel');
		if (id === 'review') this.renderReview(panel, ui);
		else this.draw(id, panel, ui);
	}

	/** One step's fields. */
	protected abstract draw(id: string, panel: HTMLElement, ui: BuilderUI): void;
	/** The review's summary rows: label, step, text. */
	protected abstract summary(): [string, string, () => string][];

	protected renderReview(panel: HTMLElement, ui: BuilderUI): void {
		const head = section(panel, 'Review');
		// A new one's note goes in the content folder (it joins the compendium from there); an edit writes back in place.
		if (!this.editing) {
			head.addClass('has-aside');
			folderPill(head, { app: this.plugin.app, get: () => this.folder, set: (p) => { this.folder = p; } });
		}
		reviewRows(panel, ui, this.summary());
		reviewNotesView(panel, ui, () => {
			const problems = draftProblems(this.kind, this.d);
			if (!problems.length) return [{ tone: 'ok', text: `Ready. It joins the compendium as Homebrew.`, fixes: [] }];
			return problems.map(p => ({ tone: 'warn', text: p.text, fixes: [{ label: 'Fix', run: () => ui.go(p.step) }] }));
		});
	}

	/** The books, the campaign's packs and your homebrew, with this draft in front (cached until the draft changes). */
	protected world(): { comp: Compendium; name: string; className: string } {
		const key = entryBody(this.kind, this.d);
		if (this.cached?.key !== key) this.cached = { key, ...withDraft(this.base(), this.kind, this.d) };
		return this.cached;
	}

	protected base(): CompendiumData { return compendiumData(); }

	renderCheck(_el: HTMLElement, _ui: BuilderUI): void { /* the class, subclass and option say what they bring */ }

	renderPreview(el: HTMLElement, ui: BuilderUI): void {
		const before = el.childElementCount;
		try {
			drawNimbleContent(el, { kind: this.kind, value: cleanEntry(this.kind, this.d) }, { plugin: this.plugin, sourcePath: ui.sourcePath });
		} catch (e) {
			console.error('Ember Vault: could not draw the preview', e);
		}
		if (el.childElementCount === before) el.createDiv({ cls: 'ncb-preview-empty', text: `Your ${this.noun} shows here as its card.` });
	}

	checkChip(): { text: string; tone: 'ok' | 'high' | 'low' | 'none' } {
		const n = draftProblems(this.kind, this.d).length;
		return n ? { text: `${n} to fix`, tone: 'low' } : { text: 'Ready', tone: 'ok' };
	}

	missing(): string | null { return draftMissing(this.kind, this.d); }

	output(): Output {
		return { lang: `nimble-${this.kind}`, body: entryBody(this.kind, this.d), name: str(this.d.name).trim() || `New ${this.noun}`, frontmatter: {}, folder: this.folder };
	}

	// ------------------------------------------------------------------------
	// Fields every kind uses

	/** Name, as the compendium shows it (Vollkorn). */
	protected nameField(parent: HTMLElement, ui: BuilderUI, placeholder: string): void {
		const f = field(parent, 'Name');
		textInput(f.control, { value: str(this.d.name), placeholder, words: true, labelledBy: f.labelId, label: 'Name', onInput: v => { this.d.name = v; ui.changed(); } });
	}

	protected textField(parent: HTMLElement, ui: BuilderUI, key: string, label: string, placeholder: string, o: { wide?: boolean; area?: boolean; rows?: number; code?: boolean } = {}): void {
		const f = field(parent, label, { wide: o.wide || o.area });
		if (o.area) textArea(f.control, { value: str(this.d[key]), placeholder, rows: o.rows ?? 3, labelledBy: f.labelId, label, onInput: v => { this.d[key] = v; ui.changed(); } });
		else textInput(f.control, { value: str(this.d[key]), placeholder, code: o.code, labelledBy: f.labelId, label, onInput: v => { this.d[key] = v; ui.changed(); } });
	}

	/** The class it's for: any class in the compendium (the books, a pack's, yours), or one typed that isn't yet. */
	protected classField(parent: HTMLElement, ui: BuilderUI, onPick?: () => void): void {
		const f = field(parent, 'Class');
		const classes = () => this.world().comp.classes;
		suggestField<string>(f.control, {
			value: str(this.d.class), placeholder: 'Berserker, or your own', words: true, labelledBy: f.labelId, label: 'Class', onEmpty: true, hideExact: true,
			onInput: v => { this.d.class = v; ui.changed(); },
			suggest: (q) => classes().filter(c => !q || nameKey(c.name).includes(nameKey(q))).slice(0, 8).map(c => ({ item: c.name, label: c.name, meta: c.note ? 'Homebrew' : c.pack ?? c.source ?? '' })),
			onPick: (s, input) => { input.value = s.item; this.d.class = s.item; onPick?.(); ui.rebuild(); },
		});
	}
}

// ----------------------------------------------------------------------------
// Editors the class and subclass builders share

/** Chips that toggle values in a list (stats, schools, lists). `max`: at the limit, the rest wait. */
export function chipToggles(parent: HTMLElement, ui: BuilderUI, options: { value: string; label?: string }[], get: () => string[], set: (v: string[]) => void, o: { label: string; labelledBy?: string; max?: number; cls?: string }): HTMLElement {
	const box = parent.createDiv({ cls: `eb-picks${o.cls ? ` ${o.cls}` : ''}`, attr: { role: 'group' } });
	if (o.labelledBy) box.setAttr('aria-labelledby', o.labelledBy); else box.setAttr('aria-label', o.label);
	for (const opt of options) {
		const b = pill(box, { tag: 'button', text: opt.label ?? opt.value, cls: 'eb-pick', attr: { type: 'button', 'aria-pressed': 'false' } }) as HTMLButtonElement;
		b.dataset.value = opt.value;
		b.addEventListener('click', () => {
			const now = get();
			const on = now.some(x => nameKey(x) === nameKey(opt.value));
			set(on ? now.filter(x => nameKey(x) !== nameKey(opt.value)) : [...now, opt.value]);
			ui.changed();
		});
		ui.live(() => {
			const on = get().some(x => nameKey(x) === nameKey(opt.value));
			b.toggleClass('is-active', on);
			b.setAttr('aria-pressed', String(on));
			b.disabled = !on && !!o.max && get().length >= o.max;
		});
	}
	return box;
}

/** A small number with − and + (it can go below zero: a Skilled Hero's −1), the value between them. */
export function stepper(parent: HTMLElement, ui: BuilderUI, o: { get: () => number; set: (n: number) => void; min: number; max: number; label: string; signed?: boolean }): HTMLElement {
	const wrap = parent.createDiv({ cls: 'ncb-stepper', attr: { role: 'group', 'aria-label': o.label } });
	const down = iconButton(wrap, 'minus', `Lower ${o.label}`, () => { o.set(Math.max(o.min, o.get() - 1)); ui.changed(); }, 'eb-num-btn');
	const v = wrap.createSpan({ cls: 'ncb-stepper-value' });
	const up = iconButton(wrap, 'plus', `Raise ${o.label}`, () => { o.set(Math.min(o.max, o.get() + 1)); ui.changed(); }, 'eb-num-btn');
	ui.live(() => {
		const n = o.get();
		v.setText(o.signed ? (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0') : String(n));
		v.toggleClass('is-zero', n === 0);
		down.disabled = n <= o.min;
		up.disabled = n >= o.max;
	});
	return wrap;
}

/** A card for one of a list (a feature, a trait, an option): its head (title, remove), then its fields. */
export function listCard(parent: HTMLElement, ui: BuilderUI, o: { title: () => string; remove: () => void; cls?: string }): { card: HTMLElement; head: HTMLElement } {
	const card = parent.createDiv({ cls: `eb-attack eb-list-item ncb-card${o.cls ? ` ${o.cls}` : ''}` });
	const head = card.createDiv({ cls: 'eb-attack-head eb-list-head ncb-card-head' });
	const title = head.createDiv({ cls: 'eb-list-title ncb-card-title' });
	ui.live(() => title.setText(o.title()));
	iconButton(head, 'trash-2', 'Remove it', o.remove, 'ncb-card-remove');
	return { card, head };
}

/**
 * Features (or traits): name and words for each, and `extras` for what one does besides (a class's choices,
 * increases, uses). Add puts a blank one at the end and the cursor in its name.
 */
export function featureCards(parent: HTMLElement, ui: BuilderUI, o: {
	list: () => Feature[];
	noun: string;
	name: string;
	text: string;
	extras?: (card: HTMLElement, f: Feature) => void;
	add?: string;
}): void {
	const box = parent.createDiv({ cls: 'eb-attacks eb-list ncb-features' });
	const features = o.list();
	features.forEach((f, i) => {
		const { card } = listCard(box, ui, { title: () => str(f.name).trim() || `${o.noun[0].toUpperCase()}${o.noun.slice(1)} ${i + 1}`, remove: () => { features.splice(i, 1); ui.rebuild(); } });
		const g = card.createDiv({ cls: 'ncb-feature-fields' });
		textInput(g, { value: str(f.name), placeholder: o.name, words: true, label: `${o.noun} name`, cls: 'ncb-feature-name', onInput: v => { f.name = v; ui.changed(); } });
		textArea(g, { value: str(f.text), placeholder: o.text, rows: 2, label: `${o.noun} text`, onInput: v => { f.text = v; ui.changed(); } });
		o.extras?.(card, f);
	});
	const add = textButton(parent, 'plus', o.add ?? `Add a ${o.noun}`, () => {
		o.list().push(blankFeature() as unknown as Feature);
		ui.rebuild();
		window.setTimeout(() => parent.querySelectorAll<HTMLElement>('.ncb-features > .ncb-card').item(features.length - 1)?.querySelector<HTMLInputElement>('input')?.focus(), 20);
	});
	add.addClass('eb-list-add');
}

/** The cost words the books use, offered as you type (anything else is kept as typed). */
const COSTS = ['Passive', '1 Action', '2 Actions', '3 Actions', 'Reaction', 'Free Action', '1+ Mana'];
export function costField(parent: HTMLElement, ui: BuilderUI, get: () => string, set: (v: string) => void, label = 'Cost'): void {
	const f = field(parent, label);
	suggestField<string>(f.control, {
		value: get(), placeholder: 'Passive, 1 Action…', labelledBy: f.labelId, label, onEmpty: true, hideExact: true,
		onInput: v => { set(v); ui.changed(); },
		suggest: (q) => COSTS.filter(c => !q || c.toLowerCase().includes(q.toLowerCase())).map(c => ({ item: c, label: c })),
		onPick: (s, input) => { input.value = s.item; set(s.item); ui.changed(); },
	});
}

/** Option lists (a class's, a subclass's): each list's name and words, then its options. */
export function optionListsEditor(parent: HTMLElement, ui: BuilderUI, d: Draft): void {
	const groups = Array.isArray(d.optionGroups) ? d.optionGroups as Draft[] : (d.optionGroups = [] as Draft[]);
	const box = parent.createDiv({ cls: 'eb-attacks eb-list ncb-lists' });
	groups.forEach((g, gi) => {
		const { card } = listCard(box, ui, { title: () => str(g.name).trim() || `List ${gi + 1}`, remove: () => { groups.splice(gi, 1); ui.rebuild(); }, cls: 'ncb-list-card' });
		const top = grid(card, 2);
		const n = field(top, 'List');
		textInput(n.control, { value: str(g.name), placeholder: 'Savage Arsenal', words: true, labelledBy: n.labelId, label: 'List name', onInput: v => { g.name = v; ui.changed(); } });
		const i = field(top, 'Opening words');
		textInput(i.control, { value: str(g.intro), placeholder: 'Choose from these.', labelledBy: i.labelId, label: 'Opening words', onInput: v => { g.intro = v; ui.changed(); } });
		const options = Array.isArray(g.options) ? g.options as Draft[] : (g.options = [] as Draft[]);
		const obox = card.createDiv({ cls: 'ncb-options' });
		options.forEach((op, oi) => {
			const row = obox.createDiv({ cls: 'ncb-option' });
			const line = row.createDiv({ cls: 'ncb-option-line' });
			textInput(line, { value: str(op.name), placeholder: 'Option name', words: true, label: 'Option name', cls: 'ncb-feature-name', onInput: v => { op.name = v; ui.changed(); } });
			textInput(line, { value: str(op.cost), placeholder: 'Passive', label: 'Cost', cls: 'ncb-option-cost', onInput: v => { op.cost = v; ui.changed(); } });
			iconButton(line, 'x', 'Remove this option', () => { options.splice(oi, 1); ui.rebuild(); }, 'ncb-option-remove');
			textArea(row, { value: str(op.text), placeholder: 'What it does.', rows: 2, label: 'Option text', onInput: v => { op.text = v; ui.changed(); } });
			textInput(row, { value: str(op.requirement), placeholder: 'Requirement, if any: Req. level 5', label: 'Requirement', cls: 'ncb-option-req', onInput: v => { op.requirement = v; ui.changed(); } });
		});
		textButton(card, 'plus', 'Add an option', () => { options.push({ name: '', cost: '', text: '' }); ui.rebuild(); }).addClass('eb-list-add');
	});
	textButton(parent, 'plus', 'Add a list', () => { groups.push({ name: '', intro: '', options: [{ name: '', cost: '', text: '' }] }); ui.rebuild(); }).addClass('eb-list-add');
}

/** A check's rows: level by level, what it grants, as tags. */
export function grantRows(el: HTMLElement, rows: { level: number; grants: { kind: string; text: string }[] }[], empty: string): void {
	const box = el.createDiv({ cls: 'ncb-levels-check' });
	if (!rows.length) { box.createDiv({ cls: 'eb-check-text', text: empty }); return; }
	for (const r of rows) {
		const row = box.createDiv({ cls: 'ncb-grant-row' });
		row.createSpan({ cls: 'ncb-grant-level', text: String(r.level) });
		const tags = row.createDiv({ cls: 'ncb-grant-tags' });
		for (const g of r.grants) pill(tags, { text: g.text, icon: GRANT_ICON[g.kind] ? gameIcon(GRANT_ICON[g.kind]) : undefined, cls: `ncb-grant is-${g.kind}` });
	}
}

const GRANT_ICON: Record<string, string> = {
	subclass: 'path', pick: 'list', stat: 'trend-up', spell: 'wand', knows: 'check', boon: 'diamond', tier: 'sparkle', mana: 'droplet', die: 'dice', more: 'plus', uses: 'clock', state: 'flame', target: 'target',
};

// ----------------------------------------------------------------------------
// The small kinds

class OptionBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'option', seed); }

	protected draw(_id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'A new choice for a class');
		const top = grid(panel, 2);
		this.nameField(top, ui, 'Cleave Through');
		this.classField(top, ui, () => { d.subclass = ''; });
		const cls = this.world().comp.classByName(str(d.class));
		const subs = arr<{ name: string }>(cls?.subclasses);
		const mid = grid(panel, 2);
		if (subs.length) {
			const f = field(mid, 'Subclass');
			const sel = f.control.createEl('select', { cls: 'dropdown eb-select', attr: { 'aria-labelledby': f.labelId } });
			sel.createEl('option', { value: '', text: 'None: the class\'s own list' });
			for (const s of subs) sel.createEl('option', { value: s.name, text: s.name }).selected = nameKey(s.name) === nameKey(str(d.subclass));
			sel.addEventListener('change', () => { d.subclass = sel.value; ui.rebuild(); });
		}
		const lists = () => {
			const c = this.world().comp.classByName(str(d.class));
			const sub = str(d.subclass) ? this.world().comp.subclass(c?.name, str(d.subclass)) : undefined;
			return arr<{ name: string; options?: unknown[] }>(sub ? sub.optionGroups : c?.optionGroups);
		};
		const lf = field(mid, 'List');
		suggestField<string>(lf.control, {
			value: str(d.group), placeholder: 'Savage Arsenal, or a new list', words: true, labelledBy: lf.labelId, label: 'List', onEmpty: true, hideExact: true,
			onInput: v => { d.group = v; ui.changed(); },
			suggest: (q) => lists().filter(g => !q || nameKey(g.name).includes(nameKey(q))).map(g => ({ item: g.name, label: g.name, meta: `${arr(g.options).length} options` })),
			onPick: (s, input) => { input.value = s.item; d.group = s.item; ui.changed(); },
		});
		// A new list takes its opening words from here.
		const intro = field(panel, 'The new list\'s opening words', { wide: true });
		textInput(intro.control, { value: str(d.groupIntro), placeholder: 'Choose 1 of these when your class says so.', labelledBy: intro.labelId, label: 'Opening words', onInput: v => { d.groupIntro = v; ui.changed(); } });
		ui.live(() => intro.row.toggleClass('is-hidden', !str(d.group).trim() || lists().some(g => nameKey(g.name) === nameKey(str(d.group)))));
		const low = grid(panel, 2);
		costField(low, ui, () => str(d.cost), v => { d.cost = v; });
		this.textField(low, ui, 'requirement', 'Requirement', 'Req. level 5');
		this.textField(panel, ui, 'text', 'What it does', 'Hit two creatures within Reach with one attack.', { area: true, rows: 4 });
	}

	renderCheck(el: HTMLElement): void {
		const d = this.d;
		const className = str(d.class).trim();
		const name = str(d.name).trim();
		if (!className || !name || !str(d.group).trim()) return;
		const levels = optionLevels(this.world().comp, className, name, str(d.subclass) || undefined);
		checkHead(el, { kicker: 'Offered at', value: levels.length ? `Level ${levels.join(', ')}` : 'No level yet' });
		if (!levels.length) el.createDiv({ cls: 'eb-check-text', text: `No feature of the ${className} picks from ${str(d.group)} yet.` });
	}

	protected summary(): [string, string, () => string][] {
		return [
			['For', 'start', () => [str(this.d.class), str(this.d.subclass)].filter(Boolean).join(' · ') || 'No class yet'],
			['List', 'start', () => str(this.d.group) || 'No list yet'],
			['Cost', 'start', () => str(this.d.cost) || '—'],
		];
	}
}

const SIZES = ['Small', 'Medium', 'Large', 'Small or Medium'];
const RARITIES = ['common', 'uncommon', 'exotic'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

class AncestryBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'ancestry', seed); }

	protected draw(id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		if (id === 'traits') {
			section(panel, 'Traits');
			featureCards(panel, ui, { list: () => (Array.isArray(d.traits) ? d.traits as Feature[] : (d.traits = [] as Feature[])), noun: 'trait', name: 'Warm Blood', text: 'You resist cold damage.' });
			return;
		}
		section(panel, 'Your ancestry');
		this.nameField(panel, ui, 'Wickfolk');
		const size = field(panel, 'Size', { wide: true });
		segmented<string>(size.control, SIZES.map(s => ({ value: s, label: s })), () => str(d.size), v => { d.size = v; }, { label: 'Size', labelledBy: size.labelId, ui, cls: 'is-compact', key: 'anc-size' });
		const rarity = field(panel, 'Rarity', { wide: true });
		segmented<string>(rarity.control, RARITIES.map(r => ({ value: r, label: cap(r) })), () => str(d.rarity).toLowerCase(), v => { d.rarity = v; }, { label: 'Rarity', labelledBy: rarity.labelId, ui, cls: 'is-compact', key: 'anc-rarity' });
		this.textField(panel, ui, 'flavor', 'About them', 'Small folk who carry a little light inside.', { area: true });
	}

	protected summary(): [string, string, () => string][] {
		return [
			['Size and rarity', 'start', () => [str(this.d.size), str(this.d.rarity)].filter(Boolean).join(' · ') || '—'],
			['Traits', 'traits', () => arr<Feature>(this.d.traits).map(t => str(t.name).trim()).filter(Boolean).join(', ') || 'None yet'],
		];
	}
}

class BackgroundBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'background', seed); }

	protected draw(_id: string, panel: HTMLElement, ui: BuilderUI): void {
		section(panel, 'Your background');
		const top = grid(panel, 2);
		this.nameField(top, ui, 'Lamplighter');
		this.textField(top, ui, 'category', 'Category', 'Trades');
		this.textField(panel, ui, 'requirement', 'Requirement', 'Req. 0 or negative INT at character creation.', { wide: true });
		this.textField(panel, ui, 'text', 'What it gives', 'You know every street by its lamps. Learn any 1 Utility Spell.', { area: true, rows: 5 });
	}

	protected summary(): [string, string, () => string][] {
		return [['Requirement', 'start', () => str(this.d.requirement) || 'None']];
	}
}

const BOON_TYPES = [{ value: 'epic', label: 'Epic', icon: 'crown' }, { value: 'lodging', label: 'Lodging', icon: 'bed' }, { value: 'other', label: 'Other', icon: 'gem' }];

class BoonBuilder extends ContentBuilder {
	constructor(plugin: EmberVaultPlugin, seed: unknown) { super(plugin, 'boon', seed); }

	protected draw(_id: string, panel: HTMLElement, ui: BuilderUI): void {
		const d = this.d;
		section(panel, 'Your boon');
		this.nameField(panel, ui, 'Undying Light');
		const type = field(panel, 'Type', { wide: true });
		segmented<string>(type.control, BOON_TYPES, () => str(d.type) || 'other', v => { d.type = v; }, { label: 'Type', labelledBy: type.labelId, ui, cls: 'is-compact', key: 'boon-type' });
		const top = grid(panel, 2);
		this.textField(top, ui, 'category', 'Category', 'Major Boons');
		this.textField(top, ui, 'requirement', 'Requirement', 'Req. level 19');
		this.textField(panel, ui, 'text', 'What it does', 'Once a day, when you would drop to 0 HP, drop to 1 instead.', { area: true, rows: 5 });
	}

	protected summary(): [string, string, () => string][] {
		return [['Type', 'start', () => cap(str(this.d.type) || 'other')]];
	}
}

// ----------------------------------------------------------------------------

/** Starting gear: what's in the list (each removable), and a field to add an item from the compendium or as typed. */
export function gearField(parent: HTMLElement, ui: BuilderUI, comp: () => Compendium, d: Draft): void {
	const f = field(parent, 'Starting gear', { wide: true });
	f.control.addClass('is-stack');
	const gear = () => (Array.isArray(d.startingGear) ? d.startingGear as string[] : (d.startingGear = [] as string[]));
	const chips = f.control.createDiv({ cls: 'eb-picks ncb-gear' });
	const draw = () => {
		chips.empty();
		gear().forEach((g, i) => {
			const b = pill(chips, { tag: 'button', text: g, icon: gameIcon('x'), cls: 'eb-pick is-active ncb-gear-item', attr: { type: 'button', 'aria-label': `Take ${g} out` } }) as HTMLButtonElement;
			b.addEventListener('click', () => { gear().splice(i, 1); draw(); ui.changed(); });
		});
	};
	draw();
	const add = (name: string) => { const n = name.trim(); if (!n) return; gear().push(n); draw(); ui.changed(); };
	const input = suggestField<string>(f.control, {
		placeholder: 'Add an item: dagger, rope…', label: 'Add an item', code: true, onInput: () => { /* searching */ },
		suggest: (q) => comp().search(q, ['item'], 6).map(h => ({ item: h.name, label: h.name, meta: itemDetail(h.entry as never) })),
		onPick: (s, el) => { add(s.item); el.value = ''; },
	});
	// Enter with nothing picked keeps what's typed.
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented && input.value.trim()) { e.preventDefault(); add(input.value); input.value = ''; } });
}

/** A tiny caption-free icon for a card's head (the kind's glyph). */
export function kindIcon(parent: HTMLElement, kind: ContentKind): void {
	setIcon(parent.createSpan({ cls: 'ncb-kind-icon' }), gameIcon(META[kind].icon));
}

/** Nimble's builders for a hero's content: registered under the kinds' own ids, so New on a compendium tab opens them. */
export function registerContentKind(kind: ContentKind, f: (plugin: EmberVaultPlugin, seed: unknown) => KindBuilder): void {
	coreRegister('nimble', kind, { label: META[kind].label, icon: META[kind].icon, group: 'hero' }, f);
}

export function registerSmallContentBuilders(): void {
	registerContentKind('option', (p, s) => new OptionBuilder(p, s));
	registerContentKind('ancestry', (p, s) => new AncestryBuilder(p, s));
	registerContentKind('background', (p, s) => new BackgroundBuilder(p, s));
	registerContentKind('boon', (p, s) => new BoonBuilder(p, s));
}
