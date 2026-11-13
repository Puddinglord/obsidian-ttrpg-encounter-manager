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
/** "Bandit (GM Guide)" and "Ogre (lvl 5)" are the same creature as "Bandit" and "Ogre" to a player. */
export function baseCreatureName(name: string): string {
	return name.replace(/\s+\((?:GM Guide|lvl [^)]*)\)$/i, '').trim();
}

/** Which book a monster is from (or "Your note"), short and long. */
export function bookOf(e: MonsterIndexEntry): { short: string; long: string } {
	if (!e.bundled) return { short: 'Note', long: 'Your note' };
	const gmg = e.monster.source?.startsWith('GM');
	return gmg ? { short: 'GMG', long: e.monster.source ?? 'GM Guide' } : { short: 'M&M', long: e.monster.source ?? 'Monsters & More' };
}

/** What a player's search can see: names and lore, not abilities. */
function loreHaystack(e: MonsterIndexEntry): string {
	const m = e.monster;
	return [e.name, m.type, m.group, m.habitat, m.source, m.size, m.description].filter(Boolean).join(' ').toLowerCase();
}

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
	/** Player view: names and lore only (no levels, stats or stat filters). */
	private lore = false;
	/** Player view: every printing of a creature, by the one shown (so a creature in both books is listed once). */
	private printings = new Map<MonsterIndexEntry, MonsterIndexEntry[]>();
	/** Player view: creatures you've written notes on (lower-case names). */
	private noted = new Set<string>();

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
	}

	getViewType(): string { return BESTIARY_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Bestiary'; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.index.on('changed', () => this.refreshList()));
		// Your notes on a creature: its row's Notes pill and the notes under its lore follow edits.
		const notesChanged = debounce(() => {
			if (!this.lore) return;
			this.refreshList();
			const cur = this.results.find(r => keyOf(r) === this.selected);
			if (cur) this.show(cur, false);
		}, 400, true);
		this.registerEvent(this.app.metadataCache.on('changed', (_f, _d, cache) => { if (String(cache.frontmatter?.nimble ?? '').toLowerCase() === 'creature') notesChanged(); }));
		// Switching between a campaign you run and one you play in changes what's shown.
		this.registerEvent(this.plugin.campaigns.on('changed', () => { if (this.plugin.hideStats() !== this.lore) this.build(); }));
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
		this.lore = this.plugin.hideStats();
		root.toggleClass('is-lore', this.lore);
		if (this.lore) { this.role = 'all'; this.armor = 'all'; this.minLevel = this.maxLevel = ''; }
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
			attr: { placeholder: this.lore ? 'Search creatures, groups, habitats…' : 'Search monsters, abilities, habitats…', 'aria-label': 'Search the bestiary' },
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
		if (!this.lore) {
			this.segmented(filters, 'Role', [['all', 'All'], ['regular', 'Regular'], ['minion', 'Minion'], ['legendary', 'Legendary']], () => this.role, v => { this.role = v as RoleFilter; });
			this.segmented(filters, 'Armor', [['all', 'Any'], ['none', 'None'], ['medium', 'M'], ['heavy', 'H']], () => this.armor, v => { this.armor = v as ArmorFilter; });
		}
		this.segmented(filters, 'Source', [['all', 'All'], ['mm', 'M&M'], ['gmg', 'GM Guide'], ['vault', 'My notes']], () => this.source, v => { this.source = v as SourceFilter; });

		const row = filters.createDiv({ cls: 'bestiary-filter-row' });
		if (!this.lore) {
			row.createSpan({ cls: 'bestiary-filter-label', text: 'Level' });
			const lvl = (value: string, label: string, set: (v: string) => void) => {
				const i = row.createEl('input', { type: 'text', cls: 'bestiary-level-input', attr: { placeholder: label, 'aria-label': `${label} level`, inputmode: 'decimal' } });
				i.value = value;
				i.addEventListener('input', debounce(() => { set(i.value.trim()); this.refreshList(); }, 200, true));
			};
			lvl(this.minLevel, 'min', v => { this.minLevel = v; });
			row.createSpan({ text: '–' });
			lvl(this.maxLevel, 'max', v => { this.maxLevel = v; });
		} else {
			row.createSpan({ cls: 'bestiary-filter-label', text: 'Habitat' });
		}
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
		// Players: your own monster notes, and creatures you've written notes on.
		if (this.source === 'vault' && e.bundled && !(this.lore && this.noted.has(baseCreatureName(e.name).toLowerCase()))) return false;
		if (this.source === 'mm' && !(e.bundled && m.source?.startsWith('Monsters'))) return false;
		if (this.source === 'gmg' && !(e.bundled && m.source?.startsWith('GM Guide'))) return false;
		if (this.habitat && m.habitat !== this.habitat) return false;
		const lv = levelValue(m.level);
		const min = levelValue(this.minLevel);
		const max = levelValue(this.maxLevel);
		if (min !== null && (lv === null || lv < min)) return false;
		if (max !== null && (lv === null || lv > max)) return false;
		if (this.query.trim()) {
			let h = this.lore ? loreHaystack(e) : this.haystacks.get(e);
			if (!h) { h = haystack(e); this.haystacks.set(e, h); }
			for (const word of this.query.toLowerCase().split(/\s+/).filter(Boolean)) {
				if (!h.includes(word)) return false;
			}
		}
		return true;
	}

	private refreshList(): void {
		if (!this.listEl) return;
		this.noted = this.lore ? new Set(this.plugin.creatureNotes().keys()) : new Set();
		const q = this.query.trim().toLowerCase();
		this.results = this.plugin.index.all().filter(e => this.matches(e)).sort((a, b) => {
			if (q) {
				// Name matches first, then text matches.
				const an = a.name.toLowerCase().includes(q) ? 0 : 1;
				const bn = b.name.toLowerCase().includes(q) ? 0 : 1;
				if (an !== bn) return an - bn;
			}
			if (this.lore) return a.name.localeCompare(b.name);
			return (levelValue(a.monster.level) ?? 0) - (levelValue(b.monster.level) ?? 0) || a.name.localeCompare(b.name);
		});
		if (this.lore) this.results = this.mergePrintings(this.results);
		const total = this.lore ? this.mergePrintings(this.plugin.index.all()).length : this.plugin.index.all().length;
		const active = [this.role !== 'all', this.armor !== 'all', this.source !== 'all', !!this.minLevel, !!this.maxLevel, !!this.habitat].filter(Boolean).length;
		this.containerEl.querySelector('.bestiary-filter-toggle')?.toggleClass('has-active', active > 0);
		const noun = this.lore ? 'creatures' : 'monsters';
		this.countEl?.setText(this.results.length === total ? `${total} ${noun}` : `${this.results.length} of ${total} ${noun}`);
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

	/**
	 * One entry per creature for players: a creature printed in both books (or
	 * at two levels) is the same creature to a hero. The printing with the most
	 * lore is shown; the others are listed as sources.
	 */
	private mergePrintings(list: MonsterIndexEntry[]): MonsterIndexEntry[] {
		const groups = new Map<string, MonsterIndexEntry[]>();
		for (const e of list) {
			const k = baseCreatureName(e.name).toLowerCase();
			groups.set(k, [...(groups.get(k) ?? []), e]);
		}
		this.printings.clear();
		const out: MonsterIndexEntry[] = [];
		const seen = new Set<string>();
		for (const e of list) {
			const k = baseCreatureName(e.name).toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			const all = groups.get(k)!;
			// Your own note first, then the printing with the most to read, then Monsters & More.
			const best = [...all].sort((a, b) => Number(a.bundled) - Number(b.bundled) || (b.monster.description?.length ?? 0) - (a.monster.description?.length ?? 0) || Number(!!a.monster.source?.startsWith('GM')) - Number(!!b.monster.source?.startsWith('GM')))[0];
			this.printings.set(best, all);
			out.push(best);
		}
		return out;
	}

	private row(list: HTMLElement, e: MonsterIndexEntry): void {
		{
			const key = keyOf(e);
			const row = list.createDiv({ cls: 'bestiary-row', attr: { role: 'option', tabindex: '-1', 'data-key': key } });
			if (key === this.selected) { row.addClass('is-selected'); row.setAttr('aria-selected', 'true'); }
			const role = monsterRole(e.monster);
			row.addClass(`role-${role}`);
			if (!this.lore) row.createSpan({ cls: 'bestiary-level', text: formatLevel(e.monster.level) || (role === 'minion' ? 'min' : '–') });
			if (this.lore) {
				row.removeClass(`role-${role}`);
				setIcon(row.createSpan({ cls: 'bestiary-level bestiary-lore-icon' }), 'paw-print');
			}
			const body = row.createDiv({ cls: 'bestiary-row-text' });
			body.createDiv({ cls: 'bestiary-row-name', text: this.lore ? baseCreatureName(e.name) : e.name });
			const meta = this.lore
				? [e.monster.group, [e.monster.size !== 'Medium' ? e.monster.size : '', e.monster.type].filter(Boolean).join(' '), e.monster.habitat]
				: [e.monster.group, describeMonster(e).replace(/^Lvl [^·]+· /, '')];
			const line = body.createDiv({ cls: 'bestiary-row-line' });
			line.createDiv({ cls: 'bestiary-row-meta', text: meta.filter(Boolean).join(' · ') });
			// Where it's from: a pill per book (players see every printing of a creature on its one row).
			const tags = line.createDiv({ cls: 'bestiary-tags' });
			const books = [...new Set((this.lore ? this.printings.get(e) ?? [e] : [e]).map(x => bookOf(x).short))];
			for (const b of books) tags.createSpan({ cls: `bestiary-tag is-${b === 'Note' ? 'note' : b === 'GMG' ? 'gmg' : 'mm'}`, text: b });
			if (this.lore && this.noted.has(baseCreatureName(e.name).toLowerCase())) tags.createSpan({ cls: 'bestiary-tag is-noted', text: 'Notes' });
			if (this.lore) {
				const ins = row.createEl('button', { cls: 'clickable-icon bestiary-row-add', attr: { 'aria-label': `Insert a reference to ${e.name}` } });
				setIcon(ins, 'at-sign');
				ins.addEventListener('click', (ev) => { ev.stopPropagation(); this.insertReference(e.name); });
			} else {
				const add = row.createEl('button', { cls: 'clickable-icon bestiary-row-add', attr: { 'aria-label': `Add ${e.name}` } });
				setIcon(add, 'plus');
				add.addEventListener('click', (ev) => { ev.stopPropagation(); void this.plugin.addToEncounter(e.monster, e.filePath || undefined, ev.shiftKey ? 2 : 1); });
			}
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
		back.appendText(this.results.length ? (this.lore ? 'All creatures' : 'All monsters') : 'Back');
		back.addEventListener('click', () => this.showPane(false));
		const actions = this.plugin.monsterActions(e, { inBestiary: true });
		if (!this.lore) {
			actions.splice(1, 0, {
				label: '+2',
				onClick: () => void this.plugin.addToEncounter(e.monster, e.filePath || undefined, 2),
			});
		}
		actions.push({
			label: 'Insert reference', icon: 'at-sign', title: 'Insert `nimble:Name` into the note you were editing',
			onClick: () => this.insertReference(e.name),
		});
		const sources = this.lore ? [...new Set((this.printings.get(e) ?? [e]).map(x => bookOf(x).long))] : undefined;
		this.plugin.renderStatblock(d, e.monster, e.filePath, 'inline', undefined, { actions, sources });
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
			if (this.lore) { this.insertReference(cur.name); return; }
			void this.plugin.addToEncounter(cur.monster, cur.filePath || undefined, e.shiftKey ? 2 : 1);
		}
	}
}
