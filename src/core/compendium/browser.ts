// The compendium's browser, for every game system: a segmented control of
// tabs, a search field that turns typed filters into chips (with suggestions as
// you type), sort and filter controls, the result list, and (optionally) the
// selected entry's page. One component for a system's Compendium tab and every
// pre-filtered picker (add a monster, /spell, a sheet's Add buttons), so they
// all search, sort and handle the keyboard the same way.
//
// A game system supplies a `CompendiumSource`: its entries, its search words
// (a bound `createCompendiumQuery`), and how a row and a page look.
//
// Keys, with the cursor in the search field:
//   ↑ ↓            move through suggestions and results
//   ↵              use the selected suggestion, or the entry's main action
//   ⌘/Ctrl ↵       the entry's second action (add and keep the picker open…)
//   Tab            take the top suggestion ("type:gob" → type:Goblins)
//   ⌫ (empty)      edit the last filter chip
//   ⌥ ← → / ⌥ 1-0  switch tabs

import { Component, Platform, setIcon } from 'obsidian';
import { evIcon } from '../icons';
import { applyLook } from '../look';
import { pill } from '../pill';
import { slideThumb } from '../segmented';
import { isTouch } from '../touch';
import { FilterField } from './filter-field';
import { CompendiumEntry, CompendiumQuery, quoteValue, SearchResult, SortSpec, Suggestion } from './query';

/** The tab with everything. */
const ALL = 'all';

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';
const ALT = Platform.isMacOS ? '⌥' : 'Alt';

/** What the system's page for an entry gets. */
export interface DetailContext<E extends CompendiumEntry, D> {
	component: Component;
	lore: boolean;
	/** The browser's `detail` options (the system's own: extra buttons…). */
	options: D;
	/** Follow a link inside a page to another entry. */
	open: (e: E) => void;
}

/**
 * A fact on a row: a chip, with an icon when the kind of thing reads faster as one (a spell's school). `tag`: a
 * tag instead (dark, white text), led with the row's other tags (Legendary, Draft).
 */
export interface RowPill { text: string; tone?: string; icon?: string; tag?: boolean }

/** A game system's compendium, as the browser sees it. */
export interface CompendiumSource<E extends CompendiumEntry, S extends string = string, D = unknown> {
	/** The game it belongs to: the browser takes that game's look (`.ev-sys-<id>`). */
	system?: string;
	/** Its search language. */
	query: CompendiumQuery<E, S>;
	/** Every entry for this side of the table (players see creatures as lore). */
	entries(lore: boolean): E[];
	/** Filters shown as pills in the filter panel, per tab. */
	panel(segment: S, lore: boolean): string[];
	/** At most this many values of a facet in the panel (16). */
	panelLimit?(key: string): number;
	/** The tip under the panel: examples of typed filters. */
	panelTip?: string;
	/** A value's pill text in the panel ("T3"). */
	pillText?(key: string, value: string): string | undefined;
	placeholder?(segment: S, lore: boolean): string | undefined;
	/** The square left of a row's name: a level, an icon, your art. */
	drawBadge(badge: HTMLElement, e: E, lore: boolean): void;
	/** The facts on a row, as pills. */
	pills(e: E, lore: boolean): RowPill[];
	maxPills?(e: E): number;
	/** A line of the entry's own words under the pills. */
	snippet?(e: E, lore: boolean): string | undefined;
	/** Tags after the pills: where it's from ("SRD", "Note"). */
	tags?(e: E, el: HTMLElement, lore: boolean): void;
	/** The entry's page. */
	renderDetail(el: HTMLElement, e: E, ctx: DetailContext<E, D>): void;
	/** Redraw when the system's data changes (art added). */
	watch?(owner: Component, redraw: () => void): void;
}

export interface BrowserAction<E extends CompendiumEntry> {
	label: string;
	run: (e: E, ev: KeyboardEvent | MouseEvent, count: number) => void;
}

export interface BrowserOptions<E extends CompendiumEntry, S extends string = string, D = unknown> {
	/** Tabs offered; with one there's no segmented control. */
	segments: S[];
	segment: S;
	/** Only these entries (on top of the tab). */
	only?: (e: E) => boolean;
	/** Enter (and a click in pickers). */
	primary: (e: E) => BrowserAction<E> | undefined;
	/** Cmd/Ctrl+Enter. */
	secondary?: (e: E) => BrowserAction<E> | undefined;
	/** Show the selected entry's page beside (or, narrow, instead of) the list, with these options for the system's page. */
	detail?: false | D;
	/** A trailing button on each row. */
	rowButton?: (e: E) => { icon: string; label: string; run: (ev: MouseEvent) => void } | undefined;
	/** Extra bits on a row (a "2 in fight" badge). */
	decorate?: (e: E, row: HTMLElement) => void;
	/** Pickers: a click on a row runs the primary action instead of selecting. */
	clickPicks?: boolean;
	/** "3 goblin": a leading count is passed to the actions. */
	counts?: boolean;
	/** Entries to list first, and a filter chip for just them. */
	prefer?: { label: string; test: (e: E) => boolean };
	/** Already chosen: tagged and listed after the rest. */
	isTaken?: (e: E) => boolean;
	/** A New button in the search bar: make something for the tab you're on (`ev`: the click, for a menu of kinds). */
	onNew?: (segment: S, ev: MouseEvent) => void;
	/** The New button's label: one for every tab, or each tab's ("New class"); undefined hides the button on that tab. */
	newLabel?: string | ((segment: S) => string | undefined);
	/** Offer "Add “what you typed”" when nothing matches exactly. */
	custom?: { label: (text: string) => string; run: (text: string, ev: KeyboardEvent | MouseEvent) => void };
	placeholder?: string;
	query?: string;
	/** Players see creatures as lore. */
	lore: boolean;
	/** Narrow layout: switch between list and page. */
	onNarrowShow?: (detail: boolean) => void;
	/** A picker closes itself; the tab doesn't. */
	onDone?: () => void;
	/**
	 * The tab: clicking a row or following a link inside a page goes through
	 * this (so it lands in back/forward history) instead of selecting directly.
	 */
	navigate?: (to: BrowserSnapshot<S>) => void;
}

/** Where the browser is: enough to come back to it (back/forward). */
export interface BrowserSnapshot<S extends string = string> {
	segment: S;
	/** Chips and text, as typed. */
	query: string;
	sorts: SortSpec[];
	selected: string | null;
}

interface Row { type: 'suggestion'; s: Suggestion }
interface ERow<E> { type: 'entry'; e: E }
interface CRow { type: 'custom'; text: string }
type AnyRow<E> = Row | ERow<E> | CRow;

export class CompendiumBrowser<E extends CompendiumEntry, S extends string = string, D = unknown> extends Component {
	readonly root: HTMLElement;
	private segment: S;
	private field!: FilterField;
	/** Arrow keys used since the last keystroke (the first ↓ after typing goes to the top suggestion). */
	private navigated = false;
	/** Sorts the user picked, most important first; empty means the tab's own order. */
	private sorts: SortSpec[] = [];
	private sortEl!: HTMLElement;
	private sortOpen = false;
	/** The pointer's last position: rows only take the selection when it really moves (not when the list scrolls under it). */
	private pointer = { x: -1, y: -1 };
	private input!: HTMLInputElement;
	private chipsEl!: HTMLElement;
	private segEl: HTMLElement | null = null;
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;
	private sortBtn!: HTMLElement;
	private filterBtn!: HTMLElement;
	private panelEl!: HTMLElement;
	private detailEl: HTMLElement | null = null;
	private hintEl!: HTMLElement;
	private newBtn: HTMLElement | null = null;
	private rows: AnyRow<E>[] = [];
	private rowEls: (HTMLElement | null)[] = [];
	private sel = 0;
	private result: SearchResult<E, S> | null = null;
	private renderToken = 0;
	private shownId: string | null = null;
	private detailComponent: Component | null = null;
	private panelOpen = false;
	private preferOnly = false;
	private pending = 0;
	private count = 1;
	/** The next refresh draws the page again even if it's the same entry. */
	private redraw = false;

	/** The game system's search language. */
	private q: CompendiumQuery<E, S>;

	constructor(parent: HTMLElement, private source: CompendiumSource<E, S, D>, private o: BrowserOptions<E, S, D>) {
		super();
		this.q = source.query;
		this.segment = o.segment;
		this.root = parent.createDiv({ cls: 'nimble-cmpx' });
		applyLook(this.root, source.system);
		if (o.detail) this.root.addClass('has-detail');
	}

	onload(): void {
		// The system's data changed (new art): redraw the list icons and the page.
		this.source.watch?.(this, () => this.update());
		this.build();
		if (this.o.query) this.setQuery(this.o.query);
		this.refresh();
	}

	onunload(): void {
		this.detailComponent?.unload();
		this.root.remove();
	}

	focus(): void {
		if (!isTouch()) this.input.focus();
	}

	get currentSegment(): S { return this.segment; }

	/** Put text in the search box as if typed (filters become chips). */
	setQuery(q: string): void {
		this.field.set(q);
	}

	/** Show one entry (by id), clearing the search so it's in the list. */
	select(id: string): void {
		const e = this.entries().find(x => x.id === id);
		if (!e) return;
		this.preferOnly = false;
		this.field.clear();
		if (!this.offers(ALL) && !e.segments.some(s => this.offers(s))) return;
		this.setSegment(this.home(e), false);
		this.refresh(id);
		this.rowEls[this.sel]?.scrollIntoView({ block: 'center' });
		this.o.onNarrowShow?.(true);
	}

	/** Is this one of the browser's tabs? */
	private offers(s: string): s is S {
		return (this.o.segments as string[]).includes(s);
	}

	/** The tab an entry belongs on: its first, else All. */
	private home(e: E): S {
		const first = e.segments[0];
		return first !== undefined && this.offers(first) ? first : ALL as S;
	}

	private entries(): E[] {
		return this.source.entries(this.o.lore);
	}

	/** Where we are now (for history). */
	snapshot(selected = this.shownId ?? this.selectedEntry()?.id ?? null): BrowserSnapshot<S> {
		return { segment: this.segment, query: this.field.serialize(), sorts: [...this.sorts], selected };
	}

	/** Go back to a snapshot (back/forward, or a navigation the view recorded). */
	restore(s: BrowserSnapshot<S>): void {
		if (s.segment && this.o.segments.includes(s.segment)) this.setSegment(s.segment, false);
		this.preferOnly = false;
		this.field.clear();
		this.sorts = Array.isArray(s.sorts) ? s.sorts.filter(x => x && typeof x.key === 'string') : [];
		if (s.query) this.setQuery(s.query);
		this.refresh(s.selected ?? undefined);
		if (s.selected) {
			const e = this.entries().find(x => x.id === s.selected);
			if (e) this.show(e);
			this.rowEls[this.sel]?.scrollIntoView({ block: 'nearest' });
		}
	}

	/** A deliberate move to an entry: through the view's history when there is one. */
	private go(to: BrowserSnapshot<S>): void {
		if (this.o.navigate) this.o.navigate(to);
		else this.restore(to);
	}

	/** Did the pointer really move (rather than the list scrolling under it)? */
	private moved(ev: MouseEvent): boolean {
		if (ev.clientX === this.pointer.x && ev.clientY === this.pointer.y) return false;
		this.pointer = { x: ev.clientX, y: ev.clientY };
		return true;
	}

	// --------------------------------------------------------------------------
	// Layout

	private build(): void {
		const r = this.root;
		r.empty();
		if (this.o.segments.length > 1) {
			r.addClass('has-segments');
			this.segEl = r.createDiv({ cls: `nimble-cmpx-segments${this.o.segments.length > 5 ? ' is-crowded' : ''}`, attr: { role: 'tablist' } });
			this.drawSegments();
		}
		const side = r.createDiv({ cls: 'nimble-cmpx-side' });
		if (this.o.detail) this.detailEl = r.createDiv({ cls: 'nimble-cmpx-detail' });

		const bar = side.createDiv({ cls: 'nimble-cmpx-searchbar' });
		const field = bar.createDiv({ cls: 'nimble-cmpx-field' });
		setIcon(field.createSpan({ cls: 'nimble-cmpx-search-icon' }), evIcon('search'));
		this.chipsEl = field.createDiv({ cls: 'nimble-cmpx-chips' });
		this.input = this.chipsEl.createEl('input', {
			type: 'text', cls: 'nimble-cmpx-input',
			attr: { placeholder: this.o.placeholder ?? this.placeholder(), spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'search' },
		});
		field.addEventListener('mousedown', (e) => { if (e.target === field || e.target === this.chipsEl) { e.preventDefault(); this.input.focus(); } });
		this.field = new FilterField({
			query: this.q,
			input: this.input,
			chipsEl: this.chipsEl,
			onChange: () => { this.navigated = false; this.scheduleRefresh(); },
			// in: switches tabs, sort: sets the sort, is:suggested is the picker's own filter.
			consume: (token) => {
				const f = this.q.parseFilterToken(token);
				if (f && 'segment' in f) { this.setSegment(f.segment, false); return true; }
				if (f && 'sorts' in f) { for (const x of f.sorts) this.sorts = [...this.sorts.filter(y => y.key !== x.key), x]; return true; }
				if (/^is:(suggested|preferred)$/i.test(token) && this.o.prefer) { this.preferOnly = true; return true; }
				return false;
			},
			isValue: (key, value) => this.q.isCompleteValue(this.entries().filter(e => (this.segment === 'all' || e.segments.includes(this.segment)) && (!this.o.only || this.o.only(e))), key, value),
			extraChips: () => (this.preferOnly && this.o.prefer ? [{ label: this.o.prefer.label, remove: () => { this.preferOnly = false; } }] : []),
		});
		this.input.addEventListener('keydown', (e) => this.onKey(e));
		this.input.addEventListener('click', () => this.scheduleRefresh());

		this.sortBtn = bar.createEl('button', { cls: 'clickable-icon nimble-cmpx-sort', attr: { 'aria-label': 'Sort', 'aria-expanded': 'false' } });
		this.sortBtn.addEventListener('click', () => { this.sortOpen = !this.sortOpen; if (this.sortOpen) this.panelOpen = false; this.drawPanel(); this.drawSortPanel(); });
		this.filterBtn = bar.createEl('button', { cls: 'clickable-icon nimble-cmpx-filter', attr: { 'aria-label': 'Filters', 'aria-expanded': 'false' } });
		setIcon(this.filterBtn, evIcon('sliders'));
		this.filterBtn.addEventListener('click', () => { this.panelOpen = !this.panelOpen; if (this.panelOpen) this.sortOpen = false; this.drawSortPanel(); this.drawPanel(); this.input.focus(); });
		if (this.o.onNew) {
			const nb = this.newBtn = bar.createEl('button', { cls: 'clickable-icon nimble-cmpx-new' });
			setIcon(nb, evIcon('plus'));
			nb.addEventListener('click', (ev) => this.o.onNew!(this.segment, ev));
			this.drawNew();
		}

		this.sortEl = side.createDiv({ cls: 'nimble-cmpx-sortpanel' });
		this.panelEl = side.createDiv({ cls: 'nimble-cmpx-panel' });
		this.countEl = side.createDiv({ cls: 'nimble-cmpx-count' });
		this.listEl = side.createDiv({ cls: 'nimble-cmpx-list', attr: { role: 'listbox' } });
		this.hintEl = side.createDiv({ cls: 'nimble-cmpx-hints' });
	}

	/** The New button says what it makes on this tab, and hides where nothing can be made. */
	private drawNew(): void {
		const b = this.newBtn;
		if (!b) return;
		const l = this.o.newLabel;
		const label = typeof l === 'function' ? l(this.segment) : l ?? 'New';
		b.toggle(label !== undefined);
		b.setAttr('aria-label', label ?? 'New');
	}

	private placeholder(): string {
		const s = this.q.segmentDef(this.segment);
		const label = this.o.lore && s.playerLabel ? s.playerLabel : s.label;
		return this.source.placeholder?.(this.segment, this.o.lore) ?? `Search ${label.toLowerCase()}…`;
	}

	private drawSegments(): void {
		const el = this.segEl;
		if (!el) return;
		el.empty();
		this.o.segments.forEach((id, i) => {
			const s = this.q.segmentDef(id);
			const label = this.o.lore && s.playerLabel ? s.playerLabel : s.label;
			const b = el.createEl('button', {
				cls: `nimble-cmpx-seg${id === this.segment ? ' is-active' : ''}`,
				attr: { role: 'tab', 'aria-selected': String(id === this.segment), 'aria-label': `${label}  ${ALT}${i < 9 ? i + 1 : 0}`, tabindex: '-1', 'data-segment': id },
			});
			setIcon(b.createSpan({ cls: 'nimble-cmpx-seg-icon' }), s.icon);
			b.createSpan({ cls: 'nimble-cmpx-seg-label', text: label });
			b.addEventListener('mousedown', (e) => e.preventDefault()); // keep typing
			b.addEventListener('click', () => { this.setSegment(id); this.input.focus(); });
		});
		slideThumb(el, Math.max(0, this.o.segments.indexOf(this.segment)), this.o.segments.length);
	}

	setSegment(id: S, refresh = true): void {
		if (!this.o.segments.includes(id)) return;
		const changed = id !== this.segment;
		const from = this.o.segments.indexOf(this.segment);
		this.segment = id;
		if (this.segEl) slideThumb(this.segEl, this.o.segments.indexOf(id), this.o.segments.length, changed ? from : undefined);
		if (changed) {
			this.sorts = [];
			// Filters that mean nothing here (type:goblin on Spells) go; the rest carry over.
			const pool = this.entries().filter(e => id === 'all' || e.segments.includes(id));
			const keys = new Set(this.q.facetsIn(pool).map(f => f.key));
			const flags = new Set(pool.flatMap(e => e.flags));
			this.field.chips = this.field.chips.filter(c => {
				const f = this.q.parseFilterToken(c);
				if (!f || !('key' in f)) return true;
				return f.key === 'is' ? f.values.some(v => flags.has(v.toLowerCase())) : keys.has(f.key);
			});
		}
		this.segEl?.querySelectorAll<HTMLElement>('.nimble-cmpx-seg').forEach(b => {
			const on = b.dataset.segment === id;
			b.toggleClass('is-active', on);
			b.setAttr('aria-selected', String(on));
			if (on && changed) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});
		this.input.placeholder = this.o.placeholder ?? this.placeholder();
		this.drawNew();
		if (refresh) this.refresh();
	}

	// --------------------------------------------------------------------------
	// Searching

	private query(): string {
		return this.field.query();
	}

	private scheduleRefresh(): void {
		if (this.pending) return;
		this.pending = window.requestAnimationFrame(() => { this.pending = 0; this.refresh(); });
	}

	/** Run the search, rebuild suggestions and rows. `keepId` keeps (or picks) that entry selected. */
	refresh(keepId?: string): void {
		const prevId = keepId ?? this.selectedEntry()?.id ?? this.shownId ?? undefined;
		let q = this.query();
		// "3 goblin": the count is for the action, not the search.
		this.count = 1;
		if (this.o.counts) {
			const m = this.input.value.match(/^\s*(\d+)\s*[x×]?\s+(.*)$/i);
			if (m && !this.field.pending) { this.count = Math.max(1, Math.min(50, Number(m[1]))); q = [...this.field.chips, m[2]].join(' ').trim(); }
		}
		const all = this.entries();
		const only = this.o.only;
		const prefer = this.o.prefer;
		const filter = (e: E) => (!only || only(e)) && (!this.preferOnly || !prefer || prefer.test(e));
		const res = this.q.search(all, q, { segment: this.segment, sorts: this.sorts, lore: this.o.lore, only: filter });
		if (res.segment !== this.segment) this.setSegment(res.segment, false);
		let list = res.entries;
		// Pickers: preferred first, taken last, when nothing is typed or the list is by relevance.
		if ((prefer || this.o.isTaken) && (res.sort.key === 'relevance' || !res.parsed.words.length) && !this.sorts.length) {
			const rank = (e: E) => (prefer && !this.preferOnly && !prefer.test(e) ? 1 : 0) + (this.o.isTaken?.(e) ? 2 : 0);
			list = list.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.e);
		}
		this.result = { ...res, entries: list };

		// Suggestions for what's being typed (a chip waiting for its value, or the word at the caret),
		// counted against what the rest of the query leaves.
		const tok = this.field.pending || this.input === activeDocument.activeElement || this.input.value ? this.field.token() : null;
		let sugs: Suggestion[] = [];
		// "3 goblin" in the add dialog is a count and a name, not a filter.
		const counted = !!this.o.counts && !this.field.pending && /^\s*\d+\s/.test(this.input.value);
		if (tok && tok.text && !counted) {
			const pool = this.q.search(all, this.field.rest(), { segment: this.segment, lore: this.o.lore, only: filter }).entries;
			sugs = this.q.suggest(tok.text, pool, this.segment, { lore: this.o.lore, segments: this.o.segments.length > 1, limit: /:/.test(tok.text) ? 8 : 4, applied: this.field.chips });
			if (this.o.prefer && !this.field.pending && 'suggested'.startsWith(tok.text.replace(/^is:/, '').toLowerCase()) && tok.text.length >= 3 && !this.preferOnly) {
				sugs.unshift({ kind: 'flag', token: 'is:suggested', label: 'is:suggested', detail: this.o.prefer.label });
			}
		}
		const rows: AnyRow<E>[] = [...sugs.map(s => ({ type: 'suggestion' as const, s })), ...list.map(e => ({ type: 'entry' as const, e }))];
		const words = res.parsed.words.join(' ');
		if (this.o.custom && words && !list.some(e => e.name.toLowerCase() === words)) rows.push({ type: 'custom', text: this.input.value.trim() });
		this.rows = rows;

		// Selection: a filter being typed ("type", "type:gob") starts on its first completion, so ↓ walks the
		// completions and then the results; a plain word ("goblin") keeps the best result selected.
		const wantSug = !!tok && sugs.length > 0 && (!!this.field.pending || /:/.test(tok.text) || sugs.some(x => x.kind === 'key' || x.kind === 'sort' || x.kind === 'segment'));
		let sel = wantSug ? 0 : sugs.length;
		if (!wantSug && prevId) {
			const i = rows.findIndex(r => r.type === 'entry' && r.e.id === prevId);
			if (i >= 0) sel = i;
		}
		this.sel = Math.min(sel, Math.max(0, rows.length - 1));
		this.field.draw();
		this.drawCount();
		this.drawSortButton();
		if (this.panelOpen) this.drawPanel();
		if (this.sortOpen) this.drawSortPanel();
		this.drawRows();
		this.drawHints();
		const e = this.selectedEntry() ?? (list[0]);
		if (e && this.detailEl) this.show(e, this.redraw);
		else if (this.detailEl && !e) { this.detailEl.empty(); this.shownId = null; }
		this.redraw = false;
	}

	private drawCount(): void {
		const r = this.result;
		if (!r) return;
		const total = this.entries().filter(e => (r.segment === 'all' || e.segments.includes(r.segment)) && (!this.o.only || this.o.only(e))).length;
		const n = r.entries.length;
		this.countEl.empty();
		this.countEl.createSpan({ text: n === total ? `${total} ${total === 1 ? 'entry' : 'entries'}` : `${n} of ${total}` });
		const chain = r.chain.map((c, i) => `${i ? '' : 'by '}${c.def.key === 'relevance' ? 'best match' : c.def.label.toLowerCase()}${c.desc ? ' ↓' : ''}`).join(', then ');
		this.countEl.createSpan({ cls: 'nimble-cmpx-count-sort', text: ` · ${chain.replace(/^by best match/, 'best match')}` });
	}

	private drawSortButton(): void {
		const r = this.result;
		this.sortBtn.empty();
		setIcon(this.sortBtn, evIcon(r?.desc ? 'sort-descending' : 'sort-ascending'));
		this.sortBtn.toggleClass('has-active', this.sorts.length > 0);
		this.sortBtn.setAttr('aria-expanded', String(this.sortOpen));
		const chain = r?.chain.map(c => `${c.def.label}${c.desc ? ' ↓' : ''}`).join(', then ') ?? 'Best match';
		this.sortBtn.setAttr('aria-label', `Sorted by ${chain}`);
		this.filterBtn.toggleClass('has-active', this.field.chips.length > 0 || this.preferOnly);
	}

	/**
	 * The sort panel: a chain of keys ("Level, then Name"), each with its own
	 * direction, as long as you like. Starts from the order in effect, so
	 * editing it never jumps.
	 */
	private drawSortPanel(): void {
		const p = this.sortEl;
		p.empty();
		this.root.toggleClass('sort-open', this.sortOpen);
		this.sortBtn.setAttr('aria-expanded', String(this.sortOpen));
		if (!this.sortOpen) return;
		const offered = this.q.sortsFor(this.segment, this.o.lore);
		const words = !!this.result?.parsed.words.length;
		const current: SortSpec[] = this.sorts.length ? this.sorts : (this.result?.chain ?? []).map(c => ({ key: c.def.key, desc: c.desc }));
		const set = (next: SortSpec[]) => { this.sorts = next; this.refresh(); };
		const keep = (e: Event) => e.preventDefault(); // keep typing in the box
		current.forEach((spec, i) => {
			const row = p.createDiv({ cls: 'nimble-cmpx-sort-row' });
			row.createSpan({ cls: 'nimble-cmpx-sort-label', text: i ? 'then by' : 'Sort by' });
			const sel = row.createEl('select', { cls: 'dropdown nimble-cmpx-sort-key' });
			for (const def of offered) {
				if (def.key === 'relevance' && (i > 0 || !words)) continue;
				if (def.key !== spec.key && current.some(x => x.key === def.key)) continue;
				sel.createEl('option', { value: def.key, text: def.label }).selected = def.key === spec.key;
			}
			sel.addEventListener('change', () => set(current.map((x, j) => (j === i ? { key: sel.value, desc: x.desc } : x))));
			const def = this.q.sortByKey(spec.key);
			if (def?.value) {
				const dir = row.createEl('button', { cls: 'nimble-cmpx-sort-dir', attr: { 'aria-label': spec.desc ? 'Descending: click for ascending' : 'Ascending: click for descending' } });
				setIcon(dir.createSpan(), evIcon(spec.desc ? 'sort-descending' : 'sort-ascending'));
				dir.createSpan({ text: spec.desc ? 'High → low' : 'Low → high' });
				dir.addEventListener('mousedown', keep);
				dir.addEventListener('click', () => set(current.map((x, j) => (j === i ? { ...x, desc: !x.desc } : x))));
			}
			if (current.length > 1) {
				const x = row.createEl('button', { cls: 'clickable-icon nimble-cmpx-sort-x', attr: { 'aria-label': 'Remove this sort' } });
				setIcon(x, evIcon('x'));
				x.addEventListener('mousedown', keep);
				x.addEventListener('click', () => set(current.filter((_, j) => j !== i)));
			}
		});
		const foot = p.createDiv({ cls: 'nimble-cmpx-sort-foot' });
		const unused = offered.filter(d => d.key !== 'relevance' && d.value && !current.some(x => x.key === d.key));
		if (unused.length) {
			const add = foot.createEl('button', { cls: 'nimble-cmpx-sort-add' });
			setIcon(add.createSpan(), evIcon('plus'));
			add.createSpan({ text: 'Then by…' });
			add.addEventListener('mousedown', keep);
			add.addEventListener('click', () => set([...current, { key: unused[0].key, desc: false }]));
		}
		if (this.sorts.length) {
			const reset = foot.createEl('button', { cls: 'nimble-cmpx-sort-reset', text: 'Reset' });
			reset.addEventListener('mousedown', keep);
			reset.addEventListener('click', () => set([]));
		}
		foot.createSpan({ cls: 'nimble-cmpx-panel-tip', text: 'Or type it: sort:level,name or sort:-tier' });
	}

	/** Pills for the tab's common filters; a click adds or removes the chip. */
	private drawPanel(): void {
		const p = this.panelEl;
		p.empty();
		this.root.toggleClass('panel-open', this.panelOpen);
		this.filterBtn.setAttr('aria-expanded', String(this.panelOpen));
		if (!this.panelOpen) return;
		const pool = (this.result?.entries ?? []);
		const base = this.entries().filter(e => (this.segment === 'all' || e.segments.includes(this.segment)) && (!this.o.only || this.o.only(e)));
		if (this.o.prefer) {
			const row = p.createDiv({ cls: 'nimble-cmpx-panel-row' });
			row.createSpan({ cls: 'nimble-cmpx-panel-label', text: 'Show' });
			const pills = row.createDiv({ cls: 'nimble-cmpx-pills' });
			const b = pills.createEl('button', { cls: `nimble-cmpx-pill${this.preferOnly ? ' is-active' : ''}`, text: this.o.prefer.label, attr: { tabindex: '-1' } });
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', () => { this.preferOnly = !this.preferOnly; this.refresh(); });
		}
		for (const key of this.source.panel(this.segment, this.o.lore)) {
			const f = this.q.facetByKey(key);
			if (!f) continue;
			let values = this.q.facetCounts(base, key);
			if (values.length < 2) continue;
			const numeric = !!f.numeric;
			if (!numeric) values = values.slice(0, this.source.panelLimit?.(key) ?? 16);
			const row = p.createDiv({ cls: 'nimble-cmpx-panel-row' });
			row.createSpan({ cls: 'nimble-cmpx-panel-label', text: f.label });
			const pills = row.createDiv({ cls: 'nimble-cmpx-pills' });
			const inPool = new Set(this.q.facetCounts(pool, key).map(v => v.value.toLowerCase()));
			for (const v of values) {
				const value = this.q.tokenValue(key, v.value);
				const token = `${f.key}:${quoteValue(value)}`;
				const on = this.field.has(token);
				const b = pills.createEl('button', {
					cls: `nimble-cmpx-pill${on ? ' is-active' : ''}${!on && !inPool.has(v.value.toLowerCase()) ? ' is-empty' : ''}`,
					attr: { tabindex: '-1', title: `${f.key}:${value} · ${v.count}` },
				});
				b.createSpan({ text: this.source.pillText?.(key, value) ?? v.value });
				b.addEventListener('mousedown', (e) => e.preventDefault());
				b.addEventListener('click', () => {
					if (this.field.has(token)) this.field.remove(token);
					else this.field.add(token);
					this.field.draw();
					this.refresh();
				});
			}
		}
		const tips = p.createDiv({ cls: 'nimble-cmpx-panel-tip' });
		tips.setText(this.source.panelTip ?? 'Type filters too: key:value, -key:value');
	}

	// --------------------------------------------------------------------------
	// Rows

	private drawRows(): void {
		const list = this.listEl;
		list.empty();
		this.rowEls = this.rows.map(() => null);
		const token = ++this.renderToken;
		const r = this.result;
		const nSug = this.rows.findIndex(x => x.type !== 'suggestion');
		const firstEntry = nSug < 0 ? this.rows.length : nSug;
		if (!this.rows.length) {
			list.createDiv({ cls: 'nimble-cmpx-empty', text: this.field.chips.length ? 'Nothing matches. Remove a filter or try fewer words.' : 'Nothing matches.' });
			return;
		}
		let lastGroup: string | null = null;
		const draw = (from: number, to: number) => {
			for (let i = from; i < Math.min(to, this.rows.length); i++) {
				const row = this.rows[i];
				if (i === firstEntry && firstEntry > 0) list.createDiv({ cls: 'nimble-cmpx-divider' });
				if (row.type === 'entry' && r?.grouped && r.sort.group) {
					const g = r.sort.group(row.e);
					// The heading's words in a span, so a game whose face sits high or low can nudge them onto the centre line.
					if (g !== lastGroup) { list.createDiv({ cls: 'nimble-cmpx-group' }).createSpan({ cls: 'nimble-cmpx-group-text', text: g }); lastGroup = g; }
				}
				this.rowEls[i] = row.type === 'suggestion' ? this.suggestionRow(list, row.s, i) : row.type === 'custom' ? this.customRow(list, row.text, i) : this.entryRow(list, row.e, i);
			}
		};
		// The first screenful now, the rest in the background so typing stays quick.
		const first = Math.max(80, this.sel + 20);
		draw(0, first);
		const more = (from: number) => {
			if (token !== this.renderToken || from >= this.rows.length) return;
			draw(from, from + 150);
			window.setTimeout(() => more(from + 150), 16);
		};
		window.setTimeout(() => more(first), 16);
		this.highlight(false);
	}

	private suggestionRow(list: HTMLElement, s: Suggestion, i: number): HTMLElement {
		const el = list.createDiv({ cls: `nimble-cmpx-row is-suggestion kind-${s.kind}`, attr: { role: 'option', 'data-index': String(i) } });
		setIcon(el.createSpan({ cls: 'nimble-cmpx-row-badge' }), suggestionIcon(s));
		const text = el.createDiv({ cls: 'nimble-cmpx-row-text' });
		const m = s.label.match(/^([-!]?[a-z]+:)(.*)$/i);
		const name = text.createDiv({ cls: 'nimble-cmpx-row-name' });
		if (m) { name.createSpan({ cls: 'nimble-cmpx-token-key', text: m[1] }); name.createSpan({ text: m[2] }); } else name.setText(s.label);
		text.createDiv({ cls: 'nimble-cmpx-row-meta', text: s.detail });
		if (i === 0) el.createSpan({ cls: 'nimble-cmpx-kbd', text: 'Tab' });
		el.addEventListener('mousedown', (e) => e.preventDefault());
		el.addEventListener('click', () => this.field.apply(s));
		el.addEventListener('mousemove', (ev) => { if (this.moved(ev) && this.sel !== i) { this.sel = i; this.highlight(false); this.drawHints(); } });
		return el;
	}

	private customRow(list: HTMLElement, text: string, i: number): HTMLElement {
		const el = list.createDiv({ cls: 'nimble-cmpx-row is-custom', attr: { role: 'option', 'data-index': String(i) } });
		setIcon(el.createSpan({ cls: 'nimble-cmpx-row-badge' }), evIcon('edit'));
		const t = el.createDiv({ cls: 'nimble-cmpx-row-text' });
		t.createDiv({ cls: 'nimble-cmpx-row-name', text: this.o.custom!.label(text) });
		t.createDiv({ cls: 'nimble-cmpx-row-meta', text: 'Not in the compendium: added by name.' });
		el.addEventListener('mousedown', (e) => e.preventDefault());
		el.addEventListener('click', (ev) => this.o.custom!.run(text, ev));
		el.addEventListener('mousemove', (ev) => { if (this.moved(ev) && this.sel !== i) { this.sel = i; this.highlight(false); } });
		return el;
	}

	private entryRow(list: HTMLElement, e: E, i: number): HTMLElement {
		const el = list.createDiv({ cls: `nimble-cmpx-row kind-${e.kind}`, attr: { role: 'option', 'data-index': String(i), 'data-id': e.id } });
		const badge = el.createSpan({ cls: 'nimble-cmpx-row-badge' });
		this.source.drawBadge(badge, e, this.o.lore);
		el.addClass('is-card');
		const body = el.createDiv({ cls: 'nimble-cmpx-row-text' });
		const head = body.createDiv({ cls: 'nimble-cmpx-row-head' });
		const name = head.createDiv({ cls: 'nimble-cmpx-row-name' });
		name.createSpan({ text: e.name });
		// The tags lead as one strip (what it is on All, a role or Draft, where it's from), then the facts as chips;
		// then a line of the entry's own words.
		const pillLine = body.createDiv({ cls: 'nimble-cmpx-row-pills' });
		const tags = pillLine.createDiv({ cls: 'nimble-cmpx-row-src' });
		// Facts clip as a group at the end of the line (a chip that doesn't fit drops out whole); the tags always show.
		const pillRow = pillLine.createDiv({ cls: 'nimble-cmpx-row-facts' });
		if (this.segment === 'all') tags.createSpan({ cls: `nimble-cmpx-pill-tag is-kind kind-${e.kind}`, text: this.q.schema.kindLabel(e.kind) });
		const pills = this.source.pills(e, this.o.lore).slice(0, this.source.maxPills?.(e) ?? 5);
		for (const p of pills) {
			const cls = `nimble-cmpx-pill-tag${p.tone ? ` tone-${p.tone}` : ''}`;
			const into = p.tag ? tags : pillRow;
			if (p.icon) pill(into, { icon: p.icon, text: p.text, cls });
			else into.createSpan({ cls, text: p.text });
		}
		if (!pills.length && e.detail) pillRow.createSpan({ cls: 'nimble-cmpx-pill-tag', text: e.detail });
		const snippet = this.source.snippet?.(e, this.o.lore);
		if (snippet) body.createDiv({ cls: 'nimble-cmpx-row-snippet', text: snippet });
		this.source.tags?.(e, tags, this.o.lore);
		if (this.o.isTaken?.(e)) { el.addClass('is-taken'); tags.createSpan({ cls: 'nimble-cmpx-pill-tag nimble-cmpx-tag is-taken', text: 'Added' }); }
		this.o.decorate?.(e, el);
		pillLine.toggleClass('is-empty', ![pillRow, tags].some(x => x.hasChildNodes()));
		const btn = this.o.rowButton?.(e);
		if (btn) {
			const b = el.createEl('button', { cls: 'clickable-icon nimble-cmpx-row-btn', attr: { 'aria-label': btn.label, tabindex: '-1' } });
			setIcon(b, btn.icon);
			b.addEventListener('mousedown', (ev) => ev.preventDefault());
			b.addEventListener('click', (ev) => { ev.stopPropagation(); btn.run(ev); });
		}
		el.addEventListener('mousedown', (ev) => { if (this.o.clickPicks) ev.preventDefault(); });
		el.addEventListener('click', (ev) => {
			this.sel = i;
			if (this.o.clickPicks) { this.runPrimary(e, ev); return; }
			this.highlight(false);
			if (this.o.navigate && this.shownId !== e.id) this.go(this.snapshot(e.id));
			else this.show(e);
			this.o.onNarrowShow?.(true);
		});
		if (this.o.clickPicks) el.addEventListener('mousemove', (ev) => { if (this.moved(ev) && this.sel !== i) { this.sel = i; this.highlight(false); if (this.detailEl) this.show(e); } });
		return el;
	}

	private highlight(scroll = true): void {
		this.listEl.querySelectorAll('.nimble-cmpx-row.is-selected').forEach(r => { r.removeClass('is-selected'); r.setAttr('aria-selected', 'false'); });
		const el = this.rowEls[this.sel];
		if (!el) return;
		el.addClass('is-selected');
		el.setAttr('aria-selected', 'true');
		if (scroll) el.scrollIntoView({ block: 'nearest' });
	}

	private selectedEntry(): E | undefined {
		const r = this.rows[this.sel];
		return r?.type === 'entry' ? r.e : undefined;
	}

	private drawHints(): void {
		const h = this.hintEl;
		h.empty();
		const add = (key: string, what: string) => { const s = h.createSpan({ cls: 'nimble-cmpx-hint' }); s.createSpan({ cls: 'nimble-cmpx-kbd', text: key }); s.appendText(what); };
		const row = this.rows[this.sel];
		const e = this.selectedEntry();
		add('↑↓', 'move');
		if (row?.type === 'suggestion') add('↵', 'apply filter');
		else if (e) {
			const p = this.o.primary(e);
			if (p) add('↵', p.label.toLowerCase());
			const s = this.o.secondary?.(e);
			if (s) add(`${MOD} ↵`, s.label.toLowerCase());
		}
		if (this.rows.some(r => r.type === 'suggestion')) add('Tab', 'complete');
		if (this.o.segments.length > 1) add(`${ALT} ←→`, 'tabs');
	}

	// --------------------------------------------------------------------------
	// Detail

	/** `redraw`: the same entry again, its data changed (a player's notes on a creature). */
	private show(e: E, redraw = false): void {
		const d = this.detailEl;
		if (!d || !this.o.detail) return;
		const same = this.shownId === e.id && d.childElementCount > 0;
		if (same && !redraw) return;
		const top = same ? d.scrollTop : 0;
		this.shownId = e.id;
		this.detailComponent?.unload();
		this.detailComponent = this.addChild(new Component());
		d.empty();
		if (this.o.onNarrowShow) {
			const back = d.createEl('button', { cls: 'bestiary-back' });
			setIcon(back.createSpan(), evIcon('chevron-left'));
			back.appendText('Back to the list');
			back.addEventListener('click', () => this.o.onNarrowShow?.(false));
		}
		const detail = this.o.detail;
		this.source.renderDetail(d, e, {
			component: this.detailComponent, lore: this.o.lore, options: detail,
			open: (target) => this.go({ segment: this.home(target), query: '', sorts: [], selected: target.id }),
		});
		d.scrollTo({ top });
	}

	// --------------------------------------------------------------------------
	// Keys

	private onKey(e: KeyboardEvent): void {
		const mod = e.metaKey || e.ctrlKey;
		// Typing faster than a frame: bring the rows up to date before a key acts on them.
		if (this.pending && ['Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) {
			window.cancelAnimationFrame(this.pending);
			this.pending = 0;
			this.refresh();
		}
		if (e.altKey && !mod && this.o.segments.length > 1) {
			const digit = e.code.match(/^Digit(\d)$/)?.[1];
			if (digit !== undefined) {
				const i = digit === '0' ? 9 : Number(digit) - 1;
				if (this.o.segments[i]) { e.preventDefault(); this.setSegment(this.o.segments[i]); }
				return;
			}
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				e.preventDefault();
				const i = this.o.segments.indexOf(this.segment);
				const n = this.o.segments.length;
				this.setSegment(this.o.segments[(i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n]);
				return;
			}
		}
		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp': {
				if (!this.rows.length) return;
				e.preventDefault();
				const step = e.key === 'ArrowDown' ? 1 : -1;
				const onSuggestion = this.rows[this.sel]?.type === 'suggestion';
				// The first ↓ after typing goes to the top of the suggestions, wherever the selection was.
				if (step > 0 && !this.navigated && !onSuggestion && this.rows[0]?.type === 'suggestion') this.sel = 0;
				else this.sel = Math.max(0, Math.min(this.rows.length - 1, this.sel + step));
				this.navigated = true;
				this.highlight();
				const sel = this.selectedEntry();
				if (sel) this.show(sel);
				this.drawHints();
				return;
			}
			case 'PageDown':
			case 'PageUp': {
				if (!this.rows.length) return;
				e.preventDefault();
				this.sel = Math.max(0, Math.min(this.rows.length - 1, this.sel + (e.key === 'PageDown' ? 10 : -10)));
				this.highlight();
				const sel = this.selectedEntry();
				if (sel) this.show(sel);
				return;
			}
			case 'Tab': {
				const s = this.rows.find((r): r is Row => r.type === 'suggestion');
				if (!s || e.shiftKey) return;
				e.preventDefault();
				const cur = this.rows[this.sel];
				this.field.apply(cur?.type === 'suggestion' ? cur.s : s.s);
				return;
			}
			case 'Enter': {
				if (e.isComposing) return;
				e.preventDefault();
				const row = this.rows[this.sel];
				if (!row) return;
				if (row.type === 'suggestion') { this.field.apply(row.s); return; }
				// A chip waiting for its value: Enter finishes it as typed ("level:>3"), and never acts on a result.
				if (this.field.pending) { this.field.commit(); return; }
				if (row.type === 'custom') { this.o.custom?.run(row.text, e); return; }
				if (mod) {
					const a = this.o.secondary?.(row.e);
					if (a) a.run(row.e, e, this.count);
					return;
				}
				this.runPrimary(row.e, e);
				return;
			}
			case 'Backspace': {
				if (this.field.key(e)) e.preventDefault();
				return;
			}
			case 'Escape': {
				// The first Escape closes the filter panel; then the picker closes as usual.
				if (this.panelOpen || this.sortOpen) { e.preventDefault(); e.stopPropagation(); this.panelOpen = false; this.sortOpen = false; this.drawPanel(); this.drawSortPanel(); return; }
				// Then a chip waiting for its value is cancelled; then the picker closes as usual.
				if (this.field.pending && this.field.key(e)) { e.preventDefault(); e.stopPropagation(); }
				return;
			}
		}
	}

	private runPrimary(e: E, ev: KeyboardEvent | MouseEvent): void {
		const a = this.o.primary(e);
		if (a) a.run(e, ev, ev.shiftKey && this.count === 1 ? 2 : this.count);
	}

	/** Re-run after the entries changed (the vault, a picker's "add and keep open"): tags update, and the page is drawn again. */
	update(): void {
		this.redraw = true;
		this.refresh(this.selectedEntry()?.id);
	}
}

/** A filter suggestion's icon: a sort, a tab, a filter's name, or one of its values. */
export function suggestionIcon(s: Suggestion): string {
	return evIcon(s.kind === 'sort' ? 'arrows-down-up' : s.kind === 'segment' ? 'tabs' : s.kind === 'key' ? 'funnel' : 'tag');
}
