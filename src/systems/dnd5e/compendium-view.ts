// The 5e compendium tab: core's compendium browser (typed filters, chips,
// sorts, keyboard) over the 5e entries (compendium-entries.ts) for one
// edition, chosen at the top. Monsters are the SRD's plus your ```5e blocks.

import { debounce, ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { CompendiumBrowser, CompendiumSource } from '../../core/compendium/browser';
import { copyReference, insertReference } from '../../core/compendium/refs';
import { renderCard5e } from './cards';
import { addMonster } from './combat';
import { contentVersion5e, Hit5e, KIND5E } from './compendium';
import { buildEntries5e, Entry5e, entryPills5e, entryReference5e, QUERY_5E, Segment5e, SEGMENTS_5E } from './compendium-entries';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eRuntime } from './runtime';
import { pill } from '../../core/pill';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';
import { HOMEBREW } from '../../core/content/blocks';
import { newButtonLabel, newContent } from '../../core/content/new-entry';

export const DND5E_COMPENDIUM_VIEW = 'nimble-dnd5e-compendium';

/** A tab of the 5e compendium. */
export type Tab = Segment5e;

const PANEL: Record<Segment5e, string[]> = {
	all: ['kind', 'source'],
	monsters: ['type', 'cr', 'size', 'source'],
	spells: ['level', 'school', 'class', 'casting'],
	items: ['rarity', 'type'],
	equipment: ['category', 'weapon', 'range', 'prop', 'mastery', 'armor'],
	classes: ['kind', 'die', 'class'],
	origins: ['kind', 'size'],
	feats: ['category'],
	rules: ['topic'],
};

const PLACEHOLDER: Partial<Record<Segment5e, string>> = {
	all: 'Search the SRD and your notes… try school:evocation',
	monsters: 'Search monsters… try type:undead cr:1-4',
	spells: 'Search spells… try level:3 class:wizard',
	items: 'Search magic items… try rarity:rare is:attunement',
	equipment: 'Search equipment… try weapon:martial prop:finesse',
};

let cache: { key: string; entries: Entry5e[] } | null = null;

/** What New makes on each tab: monsters, spells and items in their builders (equipment is an item block), the rest as a note in the content folder. */
const NEW_KINDS: Record<Segment5e, string[]> = {
	all: ['monster', 'spell', 'item', 'class', 'subclass', 'species', 'background', 'feat'],
	monsters: ['monster'], spells: ['spell'], items: ['item'], equipment: ['item'],
	classes: ['class', 'subclass'], origins: ['species', 'background'], feats: ['feat'], rules: [],
};

/** The note a homebrew hit is written in (a ```5e-class in the content folder, a ```5e-spell), if any. */
export function noteOf5e(h: Hit5e): string | undefined {
	const own = Object.values(h).find(v => v && typeof v === 'object' && typeof (v as { note?: unknown }).note === 'string') as { note?: string } | undefined;
	return own?.note ?? ('filePath' in h && typeof h.filePath === 'string' ? h.filePath : undefined);
}

/** The 5e compendium for core's browser, for one edition. */
export function source5e(rt: Dnd5eRuntime, edition: () => Dnd5eEdition, path: () => string): CompendiumSource<Entry5e, Segment5e, object> {
	const buttons = (el: HTMLElement, list: { label: string; icon: string; run: () => void }[]) => {
		const row = el.createDiv({ cls: 'statblock-actions' });
		for (const a of list) {
			const b = pill(row, { tag: 'button', cls: 'statblock-action', icon: a.icon, text: a.label });
			b.addEventListener('click', (ev) => { ev.preventDefault(); a.run(); });
		}
	};
	return {
		system: 'dnd5e',
		query: QUERY_5E,
		entries(lore) {
			const ed = edition();
			const monsters = rt.index.all(ed, path() || undefined);
			const mine = rt.homebrew.hits(ed, path() || undefined);
			const key = `${ed}|${lore}|${contentVersion5e()}|${monsters.length}|${monsters.filter(m => !m.bundled).map(m => m.filePath + m.name).join(',')}|${mine.map(h => `${h.filePath}${h.name}`).join(',')}`;
			if (cache?.key !== key) cache = { key, entries: buildEntries5e(ed, monsters, lore, mine) };
			return cache.entries;
		},
		panel: (seg, lore) => PANEL[seg].filter(k => !(lore && k === 'cr')),
		panelLimit: key => (key === 'type' || key === 'class' ? 24 : 16),
		panelTip: 'Type filters too: cr:1/4, school:evocation, -level:0, is:concentration, sort:-cr',
		placeholder: seg => PLACEHOLDER[seg],
		drawBadge(badge, e, lore) {
			if (e.monster && !lore) { badge.addClass('is-level'); badge.setText(e.badge ?? '–'); return; }
			if (e.monster) { setIcon(badge, evIcon('paw-print')); return; }
			if (e.hit?.kind === 'spell') { badge.addClass('is-tier', `school-${(e.facets.school?.[0] ?? '').toLowerCase()}`); badge.setText(e.badge ?? ''); return; }
			badge.addClass(`cmp-${e.hit!.kind}`);
			setIcon(badge, KIND5E[e.hit!.kind].glyph);
		},
		pills: entryPills5e,
		maxPills: e => (e.monster ? 4 : 5),
		tags(e, el) {
			if (e.flags.includes('pack')) { el.createSpan({ cls: 'nimble-cmpx-pill-tag bestiary-tag is-source is-pack', text: e.facets.source?.[0] ?? 'Pack' }); return; }
			if (!e.monster) {
				if (e.flags.includes('mine') || e.flags.includes('homebrew')) el.createSpan({ cls: 'nimble-cmpx-pill-tag bestiary-tag is-source is-homebrew', text: HOMEBREW });
				return;
			}
			el.createSpan({ cls: `nimble-cmpx-pill-tag bestiary-tag is-source is-${e.monster.bundled ? 'mm' : 'note'}`, text: e.monster.bundled ? 'SRD' : 'Note' });
		},
		renderDetail(el, e) {
			const at = path();
			const ref = entryReference5e(e);
			const refs = [
				{ label: 'Copy reference', icon: 'copy', run: () => copyReference(ref, e.name) },
				{ label: 'Insert in note', icon: 'at-sign', run: () => insertReference(rt.plugin.app, ref, e.name) },
			];
			if (e.monster) {
				const actions = [...rt.actions(e.monster, at), ...refs.map(r => ({ label: r.label, icon: r.icon, onClick: r.run }))];
				rt.render(el, e.monster.monster, { sourcePath: at, variant: 'block', edition: edition(), actions, lore: rt.plugin.hideStats(e.monster.filePath, at || undefined) });
				return;
			}
			renderCard5e(el.createDiv({ cls: 'dnd5e-cmp-page' }), e.hit!, rt.cardOptions(at));
			// Yours: the note it's written in, to change it.
			const note = noteOf5e(e.hit!);
			buttons(el, [...(note ? [{ label: 'Open note', icon: 'file-symlink', run: () => void rt.plugin.app.workspace.openLinkText(note, '', 'tab') }] : []), ...refs]);
		},
	};
}

export class Dnd5eCompendiumView extends ItemView {
	private edition: Dnd5eEdition;
	private tab: Segment5e = 'all';
	private query = '';
	private browser: CompendiumBrowser<Entry5e, Segment5e, object> | null = null;
	private layout: HTMLElement | null = null;
	private narrow = false;
	private lore = false;

	constructor(leaf: WorkspaceLeaf, private rt: Dnd5eRuntime) {
		super(leaf);
		this.edition = rt.edition(rt.plugin.campaigns.active?.home.path);
	}

	getViewType(): string { return DND5E_COMPENDIUM_VIEW; }
	getDisplayText(): string { return '5e compendium'; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		const refresh = debounce(() => { cache = null; this.browser?.update(); }, 300, true);
		for (const i of [this.rt.index.vault, ...this.rt.homebrew.indexes]) this.registerEvent(i.on('changed', refresh));
		this.registerEvent(this.rt.plugin.campaigns.on('changed', () => { if (this.rt.plugin.hideStats() !== this.lore) this.build(); }));
		this.build();
		const ro = new ResizeObserver(() => {
			const narrow = this.containerEl.clientWidth > 0 && this.containerEl.clientWidth < 620;
			if (narrow === this.narrow) return;
			this.narrow = narrow;
			this.layout?.toggleClass('is-narrow', narrow);
		});
		ro.observe(this.containerEl);
		this.register(() => ro.disconnect());
	}

	async onClose(): Promise<void> {
		if (this.browser) this.removeChild(this.browser);
		this.browser = null;
	}

	/** Show an edition and a tab, with a search typed in. */
	show(o: { edition?: Dnd5eEdition; tab?: Tab; query?: string }): void {
		if (o.edition) this.edition = o.edition;
		if (o.tab) this.tab = o.tab;
		if (o.query !== undefined) this.query = o.query;
		this.build();
	}

	/** Show one entry ("spell:Fireball"). */
	select(id: string): void {
		this.browser?.select(id);
	}

	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('nimble-bestiary', 'nimble-compendium', 'dnd5e-compendium');
		applyLook(root, 'dnd5e');
		if (this.browser) { this.tab = this.browser.currentSegment; this.removeChild(this.browser); }
		const plugin = this.rt.plugin;
		const lore = this.lore = plugin.hideStats();
		root.toggleClass('is-lore', lore);

		const top = root.createDiv({ cls: 'dnd5e-cmp-top' });
		const eds = top.createDiv({ cls: 'dnd5e-cmp-editions', attr: { role: 'radiogroup', 'aria-label': 'Rules' } });
		for (const e of ['2024', '2014'] as Dnd5eEdition[]) {
			const b = eds.createEl('button', { text: `${e} rules`, cls: e === this.edition ? 'is-active' : '', attr: { role: 'radio', 'aria-checked': String(e === this.edition) } });
			b.onclick = () => { if (e === this.edition) return; this.edition = e; this.query = ''; this.build(); };
		}

		const layout = this.layout = root.createDiv({ cls: 'nimble-cmpx-layout' });
		layout.toggleClass('is-narrow', this.narrow);
		const path = () => plugin.campaigns.active?.home.path ?? '';
		const rt = this.rt;
		const fight = (e: Entry5e, n: number) => {
			rt.fights.change(f => { addMonster(f, e.monster!.monster, n, { sourceFile: e.monster!.filePath || undefined }); });
			void rt.openTracker();
		};
		const insert = (e: Entry5e) => insertReference(plugin.app, entryReference5e(e), e.name);
		// Players make heroes' things, not monsters.
		const newKinds = (seg: Segment5e) => NEW_KINDS[seg].filter(k => !(lore && k === 'monster'));
		const browser = this.browser = new CompendiumBrowser<Entry5e, Segment5e, object>(layout, source5e(rt, () => this.edition, path), {
			segments: SEGMENTS_5E.map(s => s.id),
			segment: this.tab,
			lore,
			query: this.query || undefined,
			primary: (e) => (e.monster && !lore
				? { label: 'Add to fight', run: (x, _ev, n) => fight(x, n) }
				: { label: 'Insert reference', run: (x) => insert(x) }),
			secondary: (e) => (e.monster && !lore ? { label: 'Insert reference', run: (x) => insert(x) } : undefined),
			rowButton: (e) => (e.monster && !lore
				? { icon: evIcon('plus'), label: `Add ${e.name} to the fight`, run: (ev) => fight(e, ev.shiftKey ? 2 : 1) }
				: { icon: evIcon('copy'), label: `Copy a reference to ${e.name}`, run: () => copyReference(entryReference5e(e), e.name) }),
			detail: {},
			onNew: (seg, ev) => newContent(rt.plugin, 'dnd5e', newKinds(seg), ev),
			// Equipment is made in the item builder; its button says what it makes there.
			newLabel: (seg) => (seg === 'equipment' && newKinds(seg).length ? 'New equipment' : newButtonLabel(rt.plugin, 'dnd5e', newKinds(seg))),
			onNarrowShow: (d) => {
				layout.toggleClass('show-detail', d && this.narrow);
				if (d) layout.querySelector('.nimble-cmpx-detail')?.scrollTo({ top: 0 });
			},
		});
		this.addChild(browser);
		browser.focus();
	}
}
