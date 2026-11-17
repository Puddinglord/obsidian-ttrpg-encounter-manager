// The 5e compendium: monsters, spells, magic items, equipment, classes,
// origins, feats, rules and conditions from the SRD (and your ```5e notes),
// searchable, with the selected entry's stat block or card beside the list.

import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { rankByName } from '../../core/spotlight-def';
import { allHits, Hit5e, Kind5e, KIND5E } from './compendium';
import { renderCard5e } from './cards';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';

export const DND5E_COMPENDIUM_VIEW = 'nimble-dnd5e-compendium';

type Tab = 'all' | 'monsters' | 'spells' | 'items' | 'equipment' | 'classes' | 'origins' | 'feats' | 'rules';
const TABS: { id: Tab; label: string; kinds?: Kind5e[] }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'monsters', label: 'Monsters' },
	{ id: 'spells', label: 'Spells', kinds: ['spell'] },
	{ id: 'items', label: 'Magic items', kinds: ['item'] },
	{ id: 'equipment', label: 'Equipment', kinds: ['equipment'] },
	{ id: 'classes', label: 'Classes', kinds: ['class', 'subclass'] },
	{ id: 'origins', label: 'Origins', kinds: ['species', 'background'] },
	{ id: 'feats', label: 'Feats', kinds: ['feat'] },
	{ id: 'rules', label: 'Rules', kinds: ['rule', 'condition'] },
];

type Row = { id: string; name: string; detail: string; badge?: string; icon?: string; monster?: Dnd5eEntry; hit?: Hit5e };

export class Dnd5eCompendiumView extends ItemView {
	private edition: Dnd5eEdition;
	private tab: Tab = 'all';
	private query = '';
	private selected?: string;
	private listEl!: HTMLElement;
	private detailEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private rt: Dnd5eRuntime) {
		super(leaf);
		this.edition = rt.edition(rt.plugin.campaigns.active?.home.path);
	}

	getViewType(): string { return DND5E_COMPENDIUM_VIEW; }
	getDisplayText(): string { return '5e compendium'; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.rt.index.vault.on('changed', () => this.renderList()));
		this.build();
	}

	/** Show an edition, a tab and (optionally) an entry. */
	show(o: { edition?: Dnd5eEdition; tab?: Tab; query?: string }): void {
		if (o.edition) this.edition = o.edition;
		if (o.tab) this.tab = o.tab;
		if (o.query !== undefined) this.query = o.query;
		this.build();
	}

	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('dnd5e-compendium');
		const top = root.createDiv({ cls: 'dnd5e-cmp-top' });
		const eds = top.createDiv({ cls: 'dnd5e-cmp-editions', attr: { role: 'radiogroup', 'aria-label': 'Rules' } });
		for (const e of ['2024', '2014'] as Dnd5eEdition[]) {
			const b = eds.createEl('button', { text: e, cls: e === this.edition ? 'is-active' : '', attr: { role: 'radio', 'aria-checked': String(e === this.edition) } });
			b.onclick = () => { this.edition = e; this.selected = undefined; this.build(); };
		}
		const search = top.createEl('input', { type: 'search', cls: 'dnd5e-cmp-search', attr: { placeholder: 'Search the SRD and your notes…', 'aria-label': 'Search' } });
		search.value = this.query;
		search.addEventListener('input', () => { this.query = search.value; this.renderList(); });
		const tabs = root.createDiv({ cls: 'dnd5e-cmp-tabs' });
		for (const t of TABS) {
			const b = tabs.createEl('button', { text: t.label, cls: t.id === this.tab ? 'is-active' : '' });
			b.dataset.tab = t.id;
			b.onclick = () => { this.tab = t.id; this.build(); };
		}
		const body = root.createDiv({ cls: 'dnd5e-cmp-body' });
		this.listEl = body.createDiv({ cls: 'dnd5e-cmp-list' });
		this.detailEl = body.createDiv({ cls: 'dnd5e-cmp-detail' });
		this.renderList();
		window.setTimeout(() => search.focus(), 0);
	}

	private rows(): Row[] {
		const tab = TABS.find(t => t.id === this.tab)!;
		const out: Row[] = [];
		const path = this.rt.plugin.campaigns.active?.home.path;
		if (this.tab === 'all' || this.tab === 'monsters') {
			for (const e of this.rt.index.all(this.edition, path)) out.push({ id: `monster:${e.monster.bundledId ?? e.filePath + e.name}`, name: e.name, detail: [`CR ${e.monster.cr}`, [e.monster.size, e.monster.type].filter(Boolean).join(' '), e.bundled ? '' : 'your note'].filter(Boolean).join(' · '), badge: e.monster.cr, monster: e });
		}
		if (this.tab !== 'monsters') {
			for (const h of allHits(this.edition)) {
				if (tab.kinds && !tab.kinds.includes(h.kind)) continue;
				const badge = h.kind === 'spell' ? (h.spell.level === 0 ? 'C' : String(h.spell.level)) : undefined;
				out.push({ id: `${h.kind}:${h.name}`, name: h.name, detail: h.detail, badge, icon: badge ? undefined : KIND5E[h.kind].icon, hit: h });
			}
		}
		return out;
	}

	private renderList(): void {
		const all = this.rows();
		const q = this.query.trim();
		const list = q ? rankByName(all, q, r => [r.name, r.detail], 200) : all.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400);
		this.listEl.empty();
		this.listEl.createDiv({ cls: 'dnd5e-cmp-count', text: `${q ? list.length : all.length} ${all.length === 1 ? 'entry' : 'entries'}${!q && all.length > 400 ? ' (first 400 shown; search to find more)' : ''}` });
		for (const r of list) {
			const row = this.listEl.createDiv({ cls: `dnd5e-cmp-row${r.id === this.selected ? ' is-selected' : ''}` });
			row.dataset.id = r.id;
			const badge = row.createSpan({ cls: 'dnd5e-cmp-badge' });
			if (r.badge) badge.setText(r.badge);
			else if (r.icon) setIcon(badge, r.icon);
			const t = row.createDiv({ cls: 'dnd5e-cmp-titles' });
			t.createDiv({ cls: 'dnd5e-cmp-name', text: r.name });
			t.createDiv({ cls: 'dnd5e-cmp-detail-line', text: r.detail });
			row.onclick = () => { this.selected = r.id; this.listEl.querySelectorAll('.is-selected').forEach(x => x.removeClass('is-selected')); row.addClass('is-selected'); this.renderDetail(r); };
		}
		const sel = list.find(r => r.id === this.selected) ?? list[0];
		if (sel) { this.selected = sel.id; this.listEl.querySelector(`[data-id="${CSS.escape(sel.id)}"]`)?.addClass('is-selected'); this.renderDetail(sel); }
		else this.detailEl.empty();
	}

	private renderDetail(r: Row): void {
		this.detailEl.empty();
		const path = this.rt.plugin.campaigns.active?.home.path ?? '';
		if (r.monster) this.rt.render(this.detailEl, r.monster.monster, { sourcePath: path, variant: 'block', edition: this.edition, actions: this.rt.actions(r.monster, path) });
		else if (r.hit) renderCard5e(this.detailEl, r.hit, this.rt.cardOptions(path));
	}
}
