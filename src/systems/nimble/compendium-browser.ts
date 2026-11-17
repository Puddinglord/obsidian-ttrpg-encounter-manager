// The compendium's browser: a segmented control of tabs, a search field that
// turns typed filters into chips (with suggestions as you type), sort and
// filter controls, the result list, and (optionally) the selected entry's
// page. One component for the Compendium tab and every pre-filtered picker
// (add a monster, /spell, the character sheet's Add buttons), so they all
// search, sort and handle the keyboard the same way.
//
// Keys, with the cursor in the search field:
//   ↑ ↓            move through suggestions and results
//   ↵              use the selected suggestion, or the entry's main action
//   ⌘/Ctrl ↵       the entry's second action (add and keep the picker open…)
//   Tab            take the top suggestion ("type:gob" → type:Goblins)
//   ⌫ (empty)      edit the last filter chip
//   ⌥ ← → / ⌥ 1-0  switch tabs

import { Component, MarkdownRenderer, setIcon, TFile } from 'obsidian';
import { copyReference as copyRef, insertReference as insertRef } from '../../core/compendium/refs';
import type NimbleStatblocksPlugin from '../../../main';
import { bundledCompendium } from './compendium-data';
import { artKey, buildEntries, Entry, entryPills, entrySnippet, Segment, SEGMENTS, bookOf, baseCreatureName } from './compendium-entries';
import { renderArtSlot, renderBadgeArt } from './compendium-art';
import { NIMBLE_QUERY, valueMatches } from './compendium-query';
import { compendiumIcon, pluginCardOptions, renderCard, renderRulesText, renderSource } from './compendium-card';
import { refForHit } from './compendium-ref';
import { monsterRole } from './rules';
import {
	BrowserAction as CoreBrowserAction, BrowserOptions as CoreBrowserOptions, BrowserSnapshot as CoreSnapshot, CompendiumBrowser as CoreBrowser, CompendiumSource,
} from '../../core/compendium/browser';
import type { StatblockAction } from './render';

// ----------------------------------------------------------------------------
// Entries, built once and rebuilt when the vault changes

let cache: { key: string; entries: Entry[] } | null = null;

/** Forget the built entries (the index, NPCs, conditions or settings changed). */
export function invalidateCompendium(): void { cache = null; }

/** Every compendium entry for the current side of the table. */
export function compendiumEntries(plugin: NimbleStatblocksPlugin, lore = plugin.hideStats()): Entry[] {
	const noted = lore ? new Set(plugin.creatureNotes().keys()) : new Set<string>();
	const conditions = plugin.getAllConditions();
	const key = [lore, plugin.index.size, plugin.campaigns.npcs.length, conditions.length, plugin.settings.compendiumDrafts, [...noted].sort().join('|')].join('#');
	if (cache?.key === key) return cache.entries;
	const campaignNames = new Map(plugin.campaigns.campaigns.map(c => [c.folder, c.name]));
	const entries = buildEntries({
		monsters: plugin.index.all(), npcs: plugin.campaigns.npcs, compendium: bundledCompendium(), conditions, lore, noted, campaignNames,
	});
	cache = { key, entries };
	return entries;
}

/** What goes after `nimble:` (or the wikilink) to point at an entry; undefined when it can't be referenced. */
export function entryReference(e: Entry): string | undefined {
	if (e.monster) return `\`nimble:${e.monster.name}\``;
	if (e.hit) return `\`nimble:${refForHit(bundledCompendium(), e.hit)}\``;
	if (e.condition) return `\`nimble:condition:${e.condition.name}\``;
	if (e.npc) return `[[${e.npc.name}]]`;
	return undefined;
}

/** Copy an entry's reference, ready to paste into any note. */
export function copyReference(e: Entry): void {
	copyRef(entryReference(e), e.name);
}

/** Put an entry's reference into the note you were last editing; with no note open, copy it instead. Focus stays where it is. */
export function insertReference(plugin: NimbleStatblocksPlugin, e: Entry): void {
	insertRef(plugin.app, entryReference(e), e.name);
}

// ----------------------------------------------------------------------------
// An entry's page

export interface DetailContext {
	plugin: NimbleStatblocksPlugin;
	component: Component;
	lore: boolean;
	/** Extra buttons under a monster's stat block (the tab's +2, Insert reference). */
	monsterActions?: (e: Entry) => StatblockAction[];
	/** Buttons under any other entry. */
	actions?: (e: Entry) => { label: string; icon: string; run: () => void; cta?: boolean }[];
	/** Follow a link inside a card (a feature's class). */
	open?: (e: Entry) => void;
	variant?: 'inline' | 'hover';
}

/** The page for an entry: a stat block, a note, a compendium card or a rule. */
export function renderEntryDetail(el: HTMLElement, e: Entry, ctx: DetailContext): void {
	const { plugin } = ctx;
	if (e.monster) {
		const m = e.monster;
		const actions = [...plugin.monsterActions(m, { inBestiary: true }), ...(ctx.monsterActions?.(e) ?? [])];
		const sources = e.printings ? [...new Set(e.printings.map(x => bookOf(x).long))] : undefined;
		const block = plugin.renderStatblock(el, m.monster, m.filePath, ctx.variant ?? 'inline', undefined, { actions, sources, lore: ctx.lore || undefined });
		addArtSlot(plugin, block, e);
		return;
	}
	const card = el.createDiv({ cls: 'nimble-cmpx-page' });
	if (e.npc) {
		const file = plugin.app.vault.getAbstractFileByPath(e.npc.path);
		const head = card.createDiv({ cls: 'nimble-cmp-head' });
		head.createDiv({ cls: 'nimble-cmp-kind', text: 'NPC' });
		head.createDiv({ cls: 'nimble-cmp-name', text: e.name });
		if (e.detail && e.detail !== 'NPC') head.createDiv({ cls: 'nimble-cmp-detail', text: e.detail });
		const body = card.createDiv({ cls: 'nimble-cmpx-note markdown-rendered' });
		if (file instanceof TFile) {
			void plugin.app.vault.cachedRead(file).then((text) => {
				if (!body.isConnected) return;
				const md = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
				void MarkdownRenderer.render(plugin.app, md || '*Empty note*', body, file.path, ctx.component);
			});
		}
	} else if (e.rule) {
		const head = card.createDiv({ cls: 'nimble-cmp-head' });
		head.createDiv({ cls: 'nimble-cmp-kind', text: e.rule.topic });
		head.createDiv({ cls: 'nimble-cmp-name', text: e.name });
		const body = card.createDiv({ cls: 'nimble-cmp-body' });
		renderRulesText(body, e.rule.text, pluginCardOptions(plugin, e.name));
		renderSource(body, e.rule);
	} else if (e.hit || e.condition) {
		const open = ctx.open;
		renderCard(card, (e.hit ?? e.condition)!, pluginCardOptions(plugin, e.name, open ? (hit) => {
			const target = compendiumEntries(plugin, ctx.lore).find(x => x.hit === hit);
			if (target) open(target);
		} : undefined));
	}
	addArtSlot(plugin, card, e);
	const actions = ctx.actions?.(e) ?? [];
	if (actions.length) {
		const row = card.createDiv({ cls: 'statblock-actions' });
		for (const a of actions) {
			const b = row.createEl('button', { cls: `statblock-action${a.cta ? ' mod-cta' : ''}` });
			setIcon(b.createSpan({ cls: 'statblock-action-icon' }), a.icon);
			b.createSpan({ text: a.label });
			b.addEventListener('click', (ev) => { ev.preventDefault(); a.run(); });
		}
	}
}

/** Your art beside the page's title: a portrait you can change (NPCs have their own portraits). */
function addArtSlot(plugin: NimbleStatblocksPlugin, page: HTMLElement, e: Entry): void {
	if (e.npc) return;
	const header = page.querySelector<HTMLElement>('.monster-header, .nimble-cmp-head');
	if (header) renderArtSlot(plugin, header, artKey(e), e.name);
}

// ----------------------------------------------------------------------------
// The browser

export type BrowserAction = CoreBrowserAction<Entry>;
export type BrowserSnapshot = CoreSnapshot<Segment>;
/** What a Nimble page takes: extra buttons under a monster's stat block, and under anything else. */
export interface NimbleDetailOptions { monsterActions?: DetailContext['monsterActions']; actions?: DetailContext['actions'] }
export type BrowserOptions = CoreBrowserOptions<Entry, Segment, NimbleDetailOptions>;

/** Filters shown as pills in the filter panel, per tab. */
const PANEL: Record<Segment, string[]> = {
	all: ['kind', 'source'],
	adversaries: ['type', 'level', 'role', 'armor', 'size', 'habitat', 'source'],
	npcs: ['campaign', 'role'],
	companions: ['kind', 'class'],
	spells: ['school', 'tier', 'action', 'class', 'source'],
	items: ['category', 'stat', 'die', 'prop', 'damage', 'rarity'],
	features: ['class', 'level', 'group', 'action', 'source'],
	classes: ['kind', 'stat', 'die', 'school', 'source'],
	origins: ['kind', 'size', 'rarity'],
	rules: ['topic'],
};

/** Nimble's compendium, for core's browser. */
export function nimbleSource(plugin: NimbleStatblocksPlugin): CompendiumSource<Entry, Segment, NimbleDetailOptions> {
	return {
		query: NIMBLE_QUERY,
		entries: lore => compendiumEntries(plugin, lore),
		panel: (seg, lore) => PANEL[seg].filter(k => !(lore && ['level', 'role', 'armor'].includes(k))),
		panelLimit: key => (key === 'type' || key === 'habitat' || key === 'group' ? 24 : 16),
		panelTip: 'Type filters too: type:goblin, level:2-4, -role:minion, is:concentration',
		pillText: (key, value) => (key === 'tier' && value !== 'cantrip' ? `T${value}` : undefined),
		placeholder(seg, lore) {
			const ex: Partial<Record<Segment, string>> = {
				all: 'Search everything… try "lay on hands" or school:fire',
				adversaries: lore ? 'Search creatures… try type:goblin' : 'Search adversaries… try type:goblin level:3',
				spells: 'Search spells… try school:necrotic tier:3',
				items: 'Search items… try stat:str die:d8',
				features: 'Search features… try class:oathsworn',
				classes: 'Search classes and subclasses…',
				npcs: 'Search NPCs…',
				companions: 'Search companions…',
				origins: 'Search ancestries and backgrounds…',
				rules: 'Search rules and conditions…',
			};
			return ex[seg];
		},
		drawBadge(badge, e, lore) {
			if (renderBadgeArt(plugin, badge, artKey(e))) {
				// Your art is the icon; a monster keeps its level on a small chip.
				if (e.monster && !lore && e.badge && e.badge !== '–') badge.createSpan({ cls: `nimble-art-level role-${monsterRole(e.monster.monster)}`, text: e.badge });
			} else if (e.monster && !lore) {
				badge.addClass('is-level', `role-${monsterRole(e.monster.monster)}`);
				badge.setText(e.badge ?? '–');
			} else if (e.monster) {
				setIcon(badge, 'paw-print');
			} else if (e.hit?.kind === 'spell') {
				badge.addClass('is-tier', `school-${(e.facets.school?.[0] ?? '').toLowerCase()}`);
				badge.setText(e.badge ?? '');
			} else if (e.hit) {
				badge.addClass(`cmp-${e.hit.kind}`);
				setIcon(badge, compendiumIcon(e.hit));
			} else {
				setIcon(badge, e.npc ? 'user-round' : e.condition ? 'activity' : 'scale');
			}
		},
		pills: (e, lore) => entryPills(e, lore),
		maxPills: e => (e.monster ? 4 : 5),
		snippet: (e, lore) => entrySnippet(e, lore),
		tags(e, tags) {
			if (!e.monster) return;
			const books = [...new Set((e.printings ?? [e.monster]).map(x => bookOf(x).short))];
			for (const b of books) tags.createSpan({ cls: `nimble-cmpx-pill-tag bestiary-tag is-source is-${b === 'Note' ? 'note' : b === 'GMG' ? 'gmg' : 'mm'}`, text: b });
			if (e.noted) tags.createSpan({ cls: 'nimble-cmpx-pill-tag bestiary-tag is-noted', text: 'Notes' });
		},
		renderDetail(el, e, ctx) {
			renderEntryDetail(el, e, { plugin, component: ctx.component, lore: ctx.lore, monsterActions: ctx.options.monsterActions, actions: ctx.options.actions, open: ctx.open });
		},
		watch(owner, redraw) {
			// New or removed art: redraw the list icons and the page.
			owner.registerEvent(plugin.events.on('compendium-art-changed', redraw));
		},
	};
}

/** Core's browser with Nimble's compendium. */
export class CompendiumBrowser extends CoreBrowser<Entry, Segment, NimbleDetailOptions> {
	constructor(plugin: NimbleStatblocksPlugin, parent: HTMLElement, o: BrowserOptions) {
		super(parent, nimbleSource(plugin), { newLabel: 'New monster, spell or item', ...o });
	}
}

/** Does any entry in the list match a value of a facet (for callers building `only`). */
export function hasFacet(e: Entry, key: string, value: string): boolean {
	return (e.facets[key] ?? []).some(v => valueMatches(v, value, key));
}

/** A creature's name as a player knows it ("Bandit", not "Bandit (GM Guide)"). */
export const creatureName = baseCreatureName;

/** Every tab. */
export const ALL_SEGMENTS: Segment[] = SEGMENTS.map(s => s.id);
