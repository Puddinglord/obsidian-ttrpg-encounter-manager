// Searchable bestiary: every bundled Nimble monster plus every monster written
// in the vault, with filters, a stat block pane and quick actions.

import { debounce, ItemView, MarkdownView, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';
import { formatLevel, levelValue, monsterRole } from './rules';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';
import { describeMonster } from './suggest';
import { isTouch } from './touch';

export const BESTIARY_VIEW_TYPE = 'nimble-bestiary';

type RoleFilter = 'all' | 'regular' | 'minion' | 'legendary';
type SourceFilter = 'all' | 'mm' | 'gmg' | 'vault';
type ArmorFilter = 'all' | 'none' | 'medium' | 'heavy';

const keyOf = (e: MonsterIndexEntry) => e.monster.bundledId || `vault:${e.filePath}#${e.name}`;

/** Lowercased text a search runs against. */
function haystack(e: MonsterIndexEntry): string {
	const m = e.monster;
	return [
		e.name, m.type, m.group, m.habitat, m.source, m.size,
		...(m.abilities || []).map(a => `${a.name} ${a.description}`),
		...(m.attacks || []).map(a => a.raw),
	].filter(Boolean).join(' ').toLowerCase();
}

export class BestiaryView extends ItemView {
	private query = '';
	private role: RoleFilter = 'all';
	private source: SourceFilter = 'all';
	private armor: ArmorFilter = 'all';
	private minLevel = '';
	private maxLevel = '';
	private habitat = '';
	private selected: string | null = null;
	private listEl: HTMLElement | null = null;
	private detailEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private results: MonsterIndexEntry[] = [];
	private haystacks = new WeakMap<MonsterIndexEntry, string>();
	private layoutEl: HTMLElement | null = null;
	private filtersOpen = false;
	private renderToken = 0;
	/** Narrow panes (phones, a slim sidebar) show the list or one monster, not both. */
	private narrow = false;

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
	}

	getViewType(): string { return BESTIARY_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Bestiary'; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.index.on('changed', () => this.refreshList()));
		this.build();
		const ro = new ResizeObserver(() => this.checkWidth());
		ro.observe(this.containerEl);
		this.register(() => ro.disconnect());
	}

	private checkWidth(): void {
		const narrow = this.containerEl.clientWidth > 0 && this.containerEl.clientWidth < 620;
		if (narrow === this.narrow) return;
		this.narrow = narrow;
		this.layoutEl?.toggleClass('is-narrow', narrow);
	}

	/** Narrow layout: switch between the list and the selected monster. */
	private showPane(detail: boolean): void {
		this.layoutEl?.toggleClass('show-detail', detail);
		if (detail) this.detailEl?.scrollTo({ top: 0 });
	}

	/** Select a monster by bundled id (or vault key) and scroll to it. */
	select(id: string): void {
		this.query = '';
		this.role = 'all';
		this.source = 'all';
		this.armor = 'all';
		this.minLevel = this.maxLevel = this.habitat = '';
		this.selected = id;
		this.build();
		this.listEl?.querySelector('.bestiary-row.is-selected')?.scrollIntoView({ block: 'center' });
		this.showPane(true);
	}

	private build(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('nimble-bestiary');
		const layout = root.createDiv({ cls: 'bestiary-layout' });
		this.layoutEl = layout;
		layout.toggleClass('is-narrow', this.narrow);
		layout.toggleClass('filters-open', this.filtersOpen);
		const side = layout.createDiv({ cls: 'bestiary-side' });
		this.detailEl = layout.createDiv({ cls: 'bestiary-detail' });

		// Search
		const search = side.createDiv({ cls: 'bestiary-search' });
		setIcon(search.createSpan({ cls: 'bestiary-search-icon' }), 'search');
		const input = search.createEl('input', {
			type: 'search',
			cls: 'bestiary-search-input',
			attr: { placeholder: 'Search monsters, abilities, habitats…', 'aria-label': 'Search the bestiary' },
		});
		input.value = this.query;
		const run = debounce(() => { this.query = input.value; this.refreshList(); }, 120, true);
		input.addEventListener('input', run);
		input.addEventListener('keydown', (e) => this.onListKey(e));
		const ft = search.createEl('button', { cls: 'clickable-icon bestiary-filter-toggle', attr: { 'aria-label': 'Filters', 'aria-expanded': String(this.filtersOpen) } });
		setIcon(ft, 'sliders-horizontal');
		ft.addEventListener('click', () => {
			this.filtersOpen = !this.filtersOpen;
			layout.toggleClass('filters-open', this.filtersOpen);
			ft.setAttr('aria-expanded', String(this.filtersOpen));
		});

		// Filters (behind the toggle on narrow screens)
		const filters = side.createDiv({ cls: 'bestiary-filters' });
		this.segmented(filters, 'Role', [['all', 'All'], ['regular', 'Regular'], ['minion', 'Minion'], ['legendary', 'Legendary']], () => this.role, v => { this.role = v as RoleFilter; });
		this.segmented(filters, 'Armor', [['all', 'Any'], ['none', 'None'], ['medium', 'M'], ['heavy', 'H']], () => this.armor, v => { this.armor = v as ArmorFilter; });
		this.segmented(filters, 'Source', [['all', 'All'], ['mm', 'M&M'], ['gmg', 'GM Guide'], ['vault', 'My notes']], () => this.source, v => { this.source = v as SourceFilter; });

		const row = filters.createDiv({ cls: 'bestiary-filter-row' });
		row.createSpan({ cls: 'bestiary-filter-label', text: 'Level' });
		const lvl = (value: string, label: string, set: (v: string) => void) => {
			const i = row.createEl('input', { type: 'text', cls: 'bestiary-level-input', attr: { placeholder: label, 'aria-label': `${label} level`, inputmode: 'decimal' } });
			i.value = value;
			i.addEventListener('input', debounce(() => { set(i.value.trim()); this.refreshList(); }, 200, true));
		};
		lvl(this.minLevel, 'min', v => { this.minLevel = v; });
		row.createSpan({ text: '–' });
		lvl(this.maxLevel, 'max', v => { this.maxLevel = v; });
		const habitats = [...new Set(this.plugin.index.all().map(e => e.monster.habitat).filter((h): h is string => !!h))].sort();
		if (habitats.length) {
			const sel = row.createEl('select', { cls: 'dropdown bestiary-habitat', attr: { 'aria-label': 'Habitat' } });
			sel.createEl('option', { text: 'Any habitat', value: '' });
			for (const h of habitats) sel.createEl('option', { text: h, value: h }).selected = h === this.habitat;
			sel.addEventListener('change', () => { this.habitat = sel.value; this.refreshList(); });
		}

		this.countEl = side.createDiv({ cls: 'bestiary-count' });
		this.listEl = side.createDiv({ cls: 'bestiary-list', attr: { role: 'listbox', 'aria-label': 'Monsters' } });

		const notice = side.createEl('details', { cls: 'bestiary-attribution' });
		const summary = notice.createEl('summary');
		summary.createSpan({ text: 'Nimble TTRPG © Nimble Co. · ' });
		summary.createEl('a', { text: 'Get the books', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
		notice.createDiv({ text: NIMBLE_ATTRIBUTION });
		notice.createDiv({ text: NIMBLE_SUPPORT_NOTICE });

		this.refreshList();
		// Don't pop the on-screen keyboard over the list on touch devices.
		if (!isTouch()) window.setTimeout(() => input.focus(), 0);
	}

	private segmented(parent: HTMLElement, label: string, options: [string, string][], get: () => string, set: (v: string) => void): void {
		const row = parent.createDiv({ cls: 'bestiary-filter-row' });
		row.createSpan({ cls: 'bestiary-filter-label', text: label });
		const group = row.createDiv({ cls: 'nimble-segmented', attr: { role: 'radiogroup', 'aria-label': label } });
		for (const [value, text] of options) {
			const b = group.createEl('button', { text, attr: { role: 'radio', 'aria-checked': String(get() === value) } });
			if (get() === value) b.addClass('is-active');
			b.addEventListener('click', () => {
				set(value);
				group.querySelectorAll('button').forEach(x => { x.removeClass('is-active'); x.setAttr('aria-checked', 'false'); });
				b.addClass('is-active');
				b.setAttr('aria-checked', 'true');
				this.refreshList();
			});
		}
	}

	private matches(e: MonsterIndexEntry): boolean {
		const m = e.monster;
		if (this.role !== 'all' && monsterRole(m) !== this.role) return false;
		if (this.armor !== 'all' && m.armor !== this.armor) return false;
		if (this.source === 'vault' && e.bundled) return false;
		if (this.source === 'mm' && !(e.bundled && m.source?.startsWith('Monsters'))) return false;
		if (this.source === 'gmg' && !(e.bundled && m.source?.startsWith('GM Guide'))) return false;
		if (this.habitat && m.habitat !== this.habitat) return false;
		const lv = levelValue(m.level);
		const min = levelValue(this.minLevel);
		const max = levelValue(this.maxLevel);
		if (min !== null && (lv === null || lv < min)) return false;
		if (max !== null && (lv === null || lv > max)) return false;
		if (this.query.trim()) {
			let h = this.haystacks.get(e);
			if (!h) { h = haystack(e); this.haystacks.set(e, h); }
			for (const word of this.query.toLowerCase().split(/\s+/).filter(Boolean)) {
				if (!h.includes(word)) return false;
			}
		}
		return true;
	}

	private refreshList(): void {
		if (!this.listEl) return;
		const q = this.query.trim().toLowerCase();
		this.results = this.plugin.index.all().filter(e => this.matches(e)).sort((a, b) => {
			if (q) {
				// Name matches first, then text matches.
				const an = a.name.toLowerCase().includes(q) ? 0 : 1;
				const bn = b.name.toLowerCase().includes(q) ? 0 : 1;
				if (an !== bn) return an - bn;
			}
			return (levelValue(a.monster.level) ?? 0) - (levelValue(b.monster.level) ?? 0) || a.name.localeCompare(b.name);
		});
		const total = this.plugin.index.all().length;
		const active = [this.role !== 'all', this.armor !== 'all', this.source !== 'all', !!this.minLevel, !!this.maxLevel, !!this.habitat].filter(Boolean).length;
		this.containerEl.querySelector('.bestiary-filter-toggle')?.toggleClass('has-active', active > 0);
		this.countEl?.setText(this.results.length === total ? `${total} monsters` : `${this.results.length} of ${total} monsters`);
		this.listEl.empty();
		if (!this.results.length) {
			this.listEl.createDiv({ cls: 'bestiary-empty', text: 'No monsters match. Try fewer filters.' });
		}
		const token = ++this.renderToken;
		const list = this.listEl;
		const rows = (from: number, to: number) => { for (const e of this.results.slice(from, to)) this.row(list, e); };
		// The first screenful now, the rest in the background so typing stays quick on phones.
		rows(0, 80);
		const more = (from: number) => {
			if (token !== this.renderToken || from >= this.results.length) return;
			rows(from, from + 150);
			window.setTimeout(() => more(from + 150), 16);
		};
		window.setTimeout(() => more(80), 16);
		const sel = this.results.find(e => keyOf(e) === this.selected) ?? this.results[0];
		if (sel) this.show(sel, false);
		else this.detailEl?.empty();
	}

	private row(list: HTMLElement, e: MonsterIndexEntry): void {
		{
			const key = keyOf(e);
			const row = list.createDiv({ cls: 'bestiary-row', attr: { role: 'option', tabindex: '-1', 'data-key': key } });
			if (key === this.selected) { row.addClass('is-selected'); row.setAttr('aria-selected', 'true'); }
			const role = monsterRole(e.monster);
			row.addClass(`role-${role}`);
			row.createSpan({ cls: 'bestiary-level', text: formatLevel(e.monster.level) || (role === 'minion' ? 'min' : '–') });
			const text = row.createDiv({ cls: 'bestiary-row-text' });
			text.createDiv({ cls: 'bestiary-row-name', text: e.name });
			text.createDiv({ cls: 'bestiary-row-meta', text: [e.monster.group, describeMonster(e).replace(/^Lvl [^·]+· /, '')].filter(Boolean).join(' · ') });
			if (!e.bundled) row.createSpan({ cls: 'bestiary-tag', text: 'note' });
			const add = row.createEl('button', { cls: 'clickable-icon bestiary-row-add', attr: { 'aria-label': `Add ${e.name}` } });
			setIcon(add, 'plus');
			add.addEventListener('click', (ev) => { ev.stopPropagation(); void this.plugin.addToEncounter(e.monster, e.filePath || undefined, ev.shiftKey ? 2 : 1); });
			row.addEventListener('click', () => { this.show(e); this.showPane(true); });
		}
	}

	private show(e: MonsterIndexEntry, scroll = true): void {
		this.selected = keyOf(e);
		this.listEl?.querySelectorAll('.bestiary-row').forEach(r => {
			const on = (r as HTMLElement).dataset.key === this.selected;
			r.toggleClass('is-selected', on);
			r.setAttr('aria-selected', String(on));
			if (on && scroll) r.scrollIntoView({ block: 'nearest' });
		});
		const d = this.detailEl;
		if (!d) return;
		d.empty();
		const back = d.createEl('button', { cls: 'bestiary-back' });
		setIcon(back.createSpan(), 'chevron-left');
		back.appendText(this.results.length ? 'All monsters' : 'Back');
		back.addEventListener('click', () => this.showPane(false));
		const actions = this.plugin.monsterActions(e, { inBestiary: true });
		actions.splice(1, 0, {
			label: '+2',
			onClick: () => void this.plugin.addToEncounter(e.monster, e.filePath || undefined, 2),
		});
		actions.push({
			label: 'Insert reference', icon: 'at-sign', title: 'Insert `nimble:Name` into the note you were editing',
			onClick: () => this.insertReference(e.name),
		});
		this.plugin.renderStatblock(d, e.monster, e.filePath, 'inline', undefined, { actions });
	}

	private insertReference(name: string): void {
		const view = this.app.workspace.getMostRecentLeaf()?.view;
		const md = view instanceof MarkdownView ? view : this.app.workspace.getLeavesOfType('markdown').map(l => l.view).find((v): v is MarkdownView => v instanceof MarkdownView);
		if (!md) { new Notice('Open a note to insert a reference into.'); return; }
		md.editor.replaceSelection(`\`nimble:${name}\``);
		new Notice(`Inserted nimble:${name} into ${md.file?.basename ?? 'the note'}`);
	}

	private onListKey(e: KeyboardEvent): void {
		if (!this.results.length) return;
		const i = Math.max(0, this.results.findIndex(r => keyOf(r) === this.selected));
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = this.results[Math.min(this.results.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
			this.show(next);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const cur = this.results[i];
			void this.plugin.addToEncounter(cur.monster, cur.filePath || undefined, e.shiftKey ? 2 : 1);
		}
	}
}
