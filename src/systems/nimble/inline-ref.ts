// `nimble:Monster Name` inline references and their hover previews. Used by
// both Reading view (post processor) and Live Preview (editor widget).

import { setIcon } from 'obsidian';
import { openRecord } from './record-modal';
import type EmberVaultPlugin from '../../../main';
import { MonsterIndexEntry } from './types';
import { CompendiumHit, KIND_LABEL } from './compendium';
import { CardTarget, CompendiumCardModal, compendiumIcon, CONDITION_ICON, isHit, pluginCardOptions, renderCard } from './compendium-card';
import { bundledCompendium } from './compendium-data';
import { parseCompendiumRef, resolveCompendiumRef } from './compendium-ref';
import { formatLevel, monsterRole } from './rules';
import type { HoverContent } from '../../core/hover-preview';
import { refPill, type InlineRefProvider } from '../../core/inline-refs';
import { nimble } from './runtime';

export const INLINE_PREFIX = 'nimble:';

export function parseInlineRef(text: string): string | null {
	if (!text.startsWith(INLINE_PREFIX)) return null;
	const name = text.slice(INLINE_PREFIX.length).trim();
	return name || null;
}

/** What the text after `nimble:` points at. */
export type InlineTarget =
	| { kind: 'monster'; entry: MonsterIndexEntry }
	| { kind: 'compendium'; target: CardTarget };

/**
 * `spell:Name`, `feature:Name@Class`, `condition:Name`… name a compendium entry
 * of that kind. A bare name is a monster first (vault or bestiary), then any
 * compendium entry, then a condition.
 */
export function resolveInlineRef(plugin: EmberVaultPlugin, text: string, sourcePath: string): InlineTarget | undefined {
	const ref = parseCompendiumRef(text);
	if (!ref) return undefined;
	const condition = (name: string) => {
		const c = nimble().condition(name);
		return c ? { kind: 'compendium' as const, target: { name: c.name, description: c.description } } : undefined;
	};
	if (ref.kind === 'condition') return condition(ref.name);
	if (ref.kind) {
		const hit = resolveCompendiumRef(bundledCompendium(), ref);
		return hit ? { kind: 'compendium', target: hit } : undefined;
	}
	const entry = nimble().index.get(text, sourcePath || undefined);
	if (entry) return { kind: 'monster', entry };
	// Until the vault's monsters are indexed a bare name might still be one; it stays "Indexing…".
	if (!nimble().index.ready) return undefined;
	const hit = resolveCompendiumRef(bundledCompendium(), ref);
	return hit ? { kind: 'compendium', target: hit } : condition(ref.name);
}

/** Open a compendium entry or condition in its card modal. */
export function openCompendiumCard(plugin: EmberVaultPlugin, target: CardTarget): void {
	plugin.hover.hide();
	new CompendiumCardModal(plugin.app, plugin, target).open();
}

export function createInlineRef(plugin: EmberVaultPlugin, monsterName: string, sourcePath: string): HTMLElement {
	const ref = parseCompendiumRef(monsterName);
	// A bare name that's a monster (or might be, while indexing) takes the monster path, unchanged.
	if (ref?.kind) {
		const found = resolveInlineRef(plugin, monsterName, sourcePath);
		if (found?.kind === 'compendium') return createCompendiumRef(plugin, monsterName, sourcePath, found.target);
		return unresolvedRef(monsterName, sourcePath, ref.name, ref.kind === 'condition' ? 'condition' : KIND_LABEL[ref.kind].toLowerCase());
	}
	const bare = nimble().index.ready && !nimble().index.get(monsterName, sourcePath || undefined) ? resolveInlineRef(plugin, monsterName, sourcePath) : undefined;
	if (bare?.kind === 'compendium') return createCompendiumRef(plugin, monsterName, sourcePath, bare.target);
	return createMonsterRef(plugin, monsterName, sourcePath);
}

/** A reference that names nothing: the name, dashed, with a "?". */
function unresolvedRef(text: string, sourcePath: string, shown: string, what: string): HTMLElement {
	const { el } = refPill({ name: shown, unknown: { title: 'Not found', label: `Unknown ${what}` } });
	el.dataset.nimbleRef = text;
	el.dataset.sourcePath = sourcePath;
	return el;
}

/** A spell, item, feature, class… or condition: [icon | name], a card on hover, the card modal on click. */
function createCompendiumRef(plugin: EmberVaultPlugin, text: string, sourcePath: string, target: CardTarget): HTMLElement {
	const hit: CompendiumHit | undefined = isHit(target) ? target : undefined;
	const kind = hit ? hit.kind : 'condition';
	const label = hit ? KIND_LABEL[hit.kind] : 'Condition';
	const owner = hit?.kind === 'feature' ? hit.subclass ?? hit.className : hit?.kind === 'subclass' ? hit.className : undefined;
	const { el, name } = refPill({
		cls: `is-compendium kind-${kind}`,
		icon: { name: hit ? compendiumIcon(hit) : CONDITION_ICON, label },
		name: target.name,
		nameAttr: { 'aria-label': `${label}: ${target.name}`, title: owner ? `${label} · ${owner}` : label },
	});
	el.dataset.nimbleRef = text;
	el.dataset.sourcePath = sourcePath;
	name.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		openCompendiumCard(plugin, target);
	});
	attachHitHover(plugin, name, target);
	return el;
}

function createMonsterRef(plugin: EmberVaultPlugin, monsterName: string, sourcePath: string): HTMLElement {
	const entry = nimble().index.get(monsterName, sourcePath || undefined);
	if (!entry) {
		const { el } = refPill({ name: monsterName, unknown: { title: nimble().index.ready ? 'Not found' : 'Indexing…', label: 'Unknown monster' } });
		el.dataset.nimbleRef = monsterName;
		el.dataset.sourcePath = sourcePath;
		return el;
	}

	// Player view: a name and a lore card, no level, no "add to encounter".
	const lore = plugin.hideStats(entry.filePath, sourcePath || undefined);
	const role = monsterRole(entry.monster);
	const lvl = formatLevel(entry.monster.level);
	const { el: container, name } = refPill({
		cls: `${entry.bundled ? 'is-bundled ' : ''}${lore ? 'is-lore' : `role-${role}`}`,
		badge: !lore && (lvl || role === 'minion')
			? { text: lvl || 'min', title: role === 'legendary' ? `Level ${lvl} ${entry.monster.roleLabel || 'Legendary'}` : role === 'minion' ? 'Minion' : `Level ${lvl}` }
			: undefined,
		name: entry.name,
	});
	container.dataset.nimbleRef = monsterName;
	container.dataset.sourcePath = sourcePath;

	name.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		plugin.hover.hide();
		// Cmd/Ctrl-click goes straight to the page; a plain click opens the quick look.
		if (e.metaKey || e.ctrlKey) { nimble().openMonster(entry, sourcePath, true); return; }
		openRecord(plugin, { kind: 'monster', entry, sourcePath });
	});
	attachMonsterHover(plugin, name, entry);
	if (lore) return container;

	const add = container.createEl('button', {
		cls: 'nimble-inline-add-btn',
		attr: { 'aria-label': `Add ${entry.name}`, title: 'Add to encounter' },
	});
	setIcon(add, 'plus');
	add.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor cursor where it is
	add.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void nimble().addToEncounter(entry.monster, entry.filePath, e.shiftKey ? 2 : 1);
	});

	return container;
}

/** Re-render every inline reference on screen, e.g. after the index changes. */
export function refreshInlineRefs(plugin: EmberVaultPlugin, root?: ParentNode): void {
	// By default, every window with a leaf in it: the main one and any popouts.
	const roots = new Set<ParentNode>(root ? [root] : [activeDocument]);
	if (!root) plugin.app.workspace.iterateAllLeaves((leaf) => { roots.add(leaf.view.containerEl.doc); });
	roots.forEach(r => r.querySelectorAll<HTMLElement>('.nimble-inline-ref[data-nimble-ref]').forEach((el) => {
		// Live Preview's own widgets refresh themselves. Chips the post-processor drew
		// inside a box, callout or embed in Live Preview don't, so those are redrawn here.
		if (el.dataset.nimbleCm) return;
		if (plugin.hover.isAnchoredIn(el)) plugin.hover.hide();
		const fresh = createInlineRef(plugin, el.dataset.nimbleRef || '', el.dataset.sourcePath || '');
		el.replaceWith(fresh);
	}));
}

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// What Nimble shows in the preview card (core/hover-preview.ts owns the card).

/** A monster's stat block (or lore card for players), for the preview card. */
export function monsterHover(plugin: EmberVaultPlugin, entry: MonsterIndexEntry, anchor?: HTMLElement): HoverContent {
	const viewPath = anchor?.closest<HTMLElement>('[data-source-path]')?.dataset.sourcePath || undefined;
	return {
		name: entry.name,
		label: `${entry.name} stat block`,
		open: () => nimble().openMonster(entry, viewPath ?? ''),
		render: (body) => nimble().renderStatblock(body, entry.monster, entry.filePath, 'hover', undefined, {
			actions: nimble().monsterActions(entry, { viewPath }),
			lore: plugin.hideStats(entry.filePath, viewPath),
		}),
	};
}

/** A compendium entry (spell, item, feature, class page…) or a condition, as its card. Dice roll, conditions open, links go to the card modal. */
export function hitHover(plugin: EmberVaultPlugin, target: CardTarget): HoverContent {
	const label = isHit(target) ? KIND_LABEL[target.kind] : 'Condition';
	return {
		name: target.name,
		label: `${target.name} (${label.toLowerCase()})`,
		cls: 'is-compendium',
		open: () => new CompendiumCardModal(plugin.app, plugin, target).open(),
		render: (body) => renderCard(body, target, pluginCardOptions(plugin, target.name, (hit) => openCompendiumCard(plugin, hit))),
	};
}

/** Preview a monster after a short hover. `entry` may be a function so callers can resolve late. */
export function attachMonsterHover(plugin: EmberVaultPlugin, anchor: HTMLElement, entry: MonsterIndexEntry | (() => MonsterIndexEntry | undefined)): void {
	plugin.hover.attach(anchor, (a) => {
		const e = typeof entry === 'function' ? entry() : entry;
		return e ? monsterHover(plugin, e, a) : undefined;
	});
}

/** The same for a compendium entry or a condition. */
export function attachHitHover(plugin: EmberVaultPlugin, anchor: HTMLElement, target: CardTarget | (() => CardTarget | undefined)): void {
	plugin.hover.attach(anchor, () => {
		const t = typeof target === 'function' ? target() : target;
		return t ? hitHover(plugin, t) : undefined;
	});
}

/** `nimble:Name` references, for core's inline-ref finder (Reading view and Live Preview). */
export function nimbleRefProvider(plugin: EmberVaultPlugin): InlineRefProvider {
	return {
		id: 'nimble',
		parse: parseInlineRef,
		create: (ref, sourcePath) => createInlineRef(plugin, ref, sourcePath),
		resolves: (ref, sourcePath) => !!resolveInlineRef(plugin, ref, sourcePath),
		refresh: (root) => refreshInlineRefs(plugin, root),
	};
}
