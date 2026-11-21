// The Compendium tab: everything in Nimble (and your vault) in one place.
// Adversaries, NPCs, companions, spells, items, class features, classes,
// ancestries and backgrounds, conditions and rules, behind a segmented
// control, with the smart search bar and the selected entry's page beside
// the list (or instead of it, in a narrow pane). It replaces the bestiary and
// keeps its view id, so tabs people already had open come back as this.

import { debounce, ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { openBuilder } from './entity-builder';
import type { Item, Spell } from './compendium';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';
import { ALL_SEGMENTS, BrowserSnapshot, CompendiumBrowser, copyReference, entryReference, insertReference, invalidateCompendium } from './compendium-browser';
import type { Entry, Segment } from './compendium-entries';
import { openEntry } from './compendium-modal';
import { nimble } from './runtime';
import { evIcon } from '../../core/icons';
import { applyLook } from '../../core/look';
import { COMPENDIUM_SPLIT_MIN } from '../../core/compendium/browser';
import { newButtonLabel, newContent } from '../../core/content/new-entry';

export const COMPENDIUM_VIEW_TYPE = 'nimble-bestiary';

/** What New makes on each tab: monsters, spells and items in their builders, the rest as a note in the content folder. */
const NEW_KINDS: Record<Segment, string[]> = {
	all: ['monster', 'spell', 'item', 'class', 'subclass', 'option', 'ancestry', 'background', 'boon', 'rule', 'condition', 'property', 'language'],
	adversaries: ['monster'], npcs: [], companions: ['monster'], spells: ['spell'], items: ['item'],
	features: ['option', 'boon'], classes: ['class', 'subclass'], origins: ['ancestry', 'background'],
	rules: ['rule', 'condition', 'property', 'language'],
};

/** The kinds New offers on a tab; players make heroes' things, not monsters. */
export function newKindsNimble(seg: Segment, lore: boolean): string[] {
	return NEW_KINDS[seg].filter(k => !(lore && k === 'monster'));
}

export class CompendiumView extends ItemView {
	private browser: CompendiumBrowser | null = null;
	private layout: HTMLElement | null = null;
	private narrow = false;
	private lore = false;
	/** The next setState is our own move to an entry: record it in back/forward history. */
	private recording = false;
	/** Where to go once the browser exists (a tab restored with the workspace). */
	private pendingState: BrowserSnapshot | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: EmberVaultPlugin) {
		super(leaf);
		// Not a navigation view: notes opened from here go to their own tab instead of replacing the compendium.
		// Back/forward still work: setState records our own moves in the leaf's history.
		this.navigation = false;
	}

	getState(): Record<string, unknown> {
		const snap = this.browser?.snapshot();
		return { ...super.getState(), ...(snap ?? {}) };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Partial<BrowserSnapshot> | null;
		if (s && typeof s === 'object' && 'selected' in s) {
			const snap: BrowserSnapshot = { segment: s.segment ?? 'adversaries', query: s.query ?? '', sorts: s.sorts ?? [], selected: s.selected ?? null };
			if (this.browser) this.browser.restore(snap);
			else this.pendingState = snap;
		}
		if (this.recording) { result.history = true; this.recording = false; }
		await super.setState(state, result);
	}

	/** Go to a place in the compendium through the leaf, so Back returns to where we were. */
	private navigate(to: BrowserSnapshot): void {
		// Obsidian keeps history only for navigable views, but a navigable view is also where it opens
		// notes ("Open note", a link in an NPC's page). So the tab is navigable just while it records a move.
		this.recording = true;
		this.navigation = true;
		void this.leaf.setViewState({ type: COMPENDIUM_VIEW_TYPE, state: { ...to }, active: true })
			.finally(() => { this.navigation = false; });
	}

	getViewType(): string { return COMPENDIUM_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Compendium'; }
	getIcon(): string { return 'book-open'; }

	async onOpen(): Promise<void> {
		const refresh = debounce(() => { invalidateCompendium(); this.browser?.update(); }, 300, true);
		this.registerEvent(nimble().index.on('changed', refresh));
		// Your notes on a creature: its Notes pill and the notes under its lore follow edits.
		this.registerEvent(this.app.metadataCache.on('changed', (_f, _d, cache) => { if (this.lore && String(cache.frontmatter?.nimble ?? '').toLowerCase() === 'creature') refresh(); }));
		// Switching between a campaign you run and one you play in changes what's shown.
		this.registerEvent(this.plugin.campaigns.on('changed', () => { if (this.plugin.hideStats() !== this.lore) this.build(); else refresh(); }));
		this.build();
		const ro = new ResizeObserver(() => this.checkWidth());
		ro.observe(this.containerEl);
		this.register(() => ro.disconnect());
	}

	async onClose(): Promise<void> {
		if (this.browser) this.removeChild(this.browser);
		this.browser = null;
	}

	private checkWidth(): void {
		const narrow = this.containerEl.clientWidth > 0 && this.containerEl.clientWidth < COMPENDIUM_SPLIT_MIN;
		if (narrow === this.narrow) return;
		this.narrow = narrow;
		this.layout?.toggleClass('is-narrow', narrow);
	}

	/** Narrow layout: the list or the selected entry. */
	private showPane(detail: boolean): void {
		this.layout?.toggleClass('show-detail', detail);
		if (detail) this.layout?.querySelector('.nimble-cmpx-detail')?.scrollTo({ top: 0 });
	}

	/** Show one entry ("monster:goblin", "spell:fireball"). */
	select(id: string): void {
		this.browser?.select(id);
	}

	/** Switch tab and search, as if typed. */
	search(segment?: Segment, query?: string): void {
		if (!this.browser) return;
		if (segment) this.browser.setSegment(segment, false);
		this.browser.setQuery(query ?? '');
		this.browser.update();
		this.browser.focus();
	}

	private build(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('nimble-bestiary', 'nimble-compendium');
		applyLook(root, 'nimble');
		const prev = this.browser?.currentSegment;
		if (this.browser) this.removeChild(this.browser);
		this.lore = this.plugin.hideStats();
		root.toggleClass('is-lore', this.lore);
		const layout = this.layout = root.createDiv({ cls: 'nimble-cmpx-layout' });
		layout.toggleClass('is-narrow', this.narrow);
		const plugin = this.plugin;
		const lore = this.lore;
		const browser = new CompendiumBrowser(plugin, layout, {
			segments: ALL_SEGMENTS,
			segment: prev ?? 'adversaries',
			lore,
			primary: (e) => {
				if (e.monster && !lore) return { label: 'Add to encounter', run: (x, _ev, n) => void nimble().addToEncounter(x.monster!.monster, x.monster!.filePath || undefined, n) };
				if (entryReference(e)) return { label: 'Insert reference', run: (x) => insertReference(plugin, x) };
				return { label: 'Quick look', run: (x) => openEntry(plugin, x) };
			},
			secondary: (e) => (e.monster && !lore && entryReference(e)
				? { label: 'Insert reference', run: (x) => insertReference(plugin, x) }
				: { label: 'Quick look', run: (x) => openEntry(plugin, x) }),
			rowButton: (e) => {
				if (e.monster && !lore) return { icon: evIcon('plus'), label: `Add ${e.name} to the encounter`, run: (ev) => void nimble().addToEncounter(e.monster!.monster, e.monster!.filePath || undefined, ev.shiftKey ? 2 : 1) };
				if (entryReference(e)) return { icon: evIcon('copy'), label: `Copy a reference to ${e.name}`, run: () => copyReference(e) };
				return undefined;
			},
			onNew: (seg, ev) => newContent(plugin, 'nimble', newKindsNimble(seg, lore), ev),
			newLabel: (seg) => newButtonLabel(plugin, 'nimble', newKindsNimble(seg, lore)),
			detail: {
				monsterActions: (e) => [
					{ label: 'Copy reference', icon: 'copy', title: 'Copy `nimble:Name` to paste into any note', onClick: () => copyReference(e) },
					{ label: 'Insert in note', icon: 'at-sign', title: 'Insert `nimble:Name` into the note you were editing (copies it when no note is open)', onClick: () => insertReference(plugin, e) },
					...(lore || !e.monster ? [] : [{ label: 'Use as a template', icon: 'copy-plus', title: 'Make a new monster from this one in the builder', onClick: () => { openBuilder(plugin, { kind: 'monster', seed: { monster: e.monster!.monster } }); } }]),
				],
				actions: (e) => detailActions(plugin, e),
			},
			onNarrowShow: (d) => this.showPane(d && this.narrow),
			navigate: (to) => this.navigate(to),
		});
		this.browser = this.addChild(browser);

		const notice = layout.querySelector('.nimble-cmpx-side')?.createEl('details', { cls: 'bestiary-attribution' });
		if (notice) {
			const summary = notice.createEl('summary');
			summary.createSpan({ text: 'Nimble TTRPG © Nimble Co. · ' });
			summary.createEl('a', { text: 'Get the books', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
			notice.createDiv({ text: NIMBLE_ATTRIBUTION });
			notice.createDiv({ text: NIMBLE_SUPPORT_NOTICE });
		}
		if (this.pendingState) { browser.restore(this.pendingState); this.pendingState = null; }
		window.setTimeout(() => browser.focus(), 0);
	}
}

/** Buttons under a non-monster entry's page. */
export function detailActions(plugin: EmberVaultPlugin, e: Entry): { label: string; icon: string; run: () => void; cta?: boolean }[] {
	const out: { label: string; icon: string; run: () => void; cta?: boolean }[] = [];
	if (e.npc) out.push({ label: 'Open note', icon: 'file-symlink', cta: true, run: () => void plugin.app.workspace.openLinkText(e.npc!.path, '', false) });
	// Yours: the note it's written in, to change it.
	const note = e.hit?.note ?? e.rule?.note;
	if (note) out.push({ label: 'Open note', icon: 'file-symlink', run: () => void plugin.app.workspace.openLinkText(note, '', 'tab') });
	if (entryReference(e)) {
		out.push({ label: 'Copy reference', icon: 'copy', run: () => copyReference(e) });
		out.push({ label: 'Insert in note', icon: 'at-sign', run: () => insertReference(plugin, e) });
	}
	if (e.hit || e.condition || e.rule) out.push({ label: 'Quick look', icon: 'maximize-2', run: () => openEntry(plugin, e) });
	if (e.hit?.kind === 'spell') out.push({ label: 'Use as a template', icon: 'copy-plus', run: () => { openBuilder(plugin, { kind: 'spell', seed: { spell: { ...(e.hit!.entry as Spell), name: `${e.hit!.name} (variant)` } } }); } });
	if (e.hit?.kind === 'item') out.push({ label: 'Use as a template', icon: 'copy-plus', run: () => { openBuilder(plugin, { kind: 'item', seed: { item: { ...(e.hit!.entry as Item), name: `${e.hit!.name} (variant)` } } }); } });
	return out;
}
