// 5e at runtime: the ```5e block, `5e:Name` references with their hover card
// and quick look, the monster index, and Copy to vault. Created once by the
// system's register(); everything else in dnd5e reaches it through dnd5e().

import { MarkdownPostProcessorContext, Modal, normalizePath, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import type { HoverContent } from '../../core/hover-preview';
import type { InlineRefProvider } from '../../core/inline-refs';
import { homeFolderFor } from '../../core/campaign-model';
import { asEdition, Dnd5eEdition } from './editions';
import { Dnd5eIndex } from './monster-index';
import { parseStatblock5e, STATBLOCK_LANG, toStatblockSource5e } from './parser';
import { Render5eOptions, renderStatblock5e, Statblock5eAction } from './render';
import type { Dnd5eEntry, Dnd5eMonster } from './types';
import { Dnd5eRefSuggest } from './suggest';
import { FightStore } from './combat-store';
import { DND5E_TRACKER_VIEW, Dnd5eTrackerView } from './tracker-view';
import { Dnd5eEncounterBlock } from './encounter-block';
import type { EncounterDef } from '../../core/encounter-def';
import { findHit, Hit5e, KIND5E, kindFromWord } from './compendium';
import { renderCard5e } from './cards';
import { DND5E_COMPENDIUM_VIEW, Dnd5eCompendiumView } from './compendium-view';

/** `5e:Goblin` → "Goblin". */
export const REF_PREFIX = '5e:';
export function parse5eRef(code: string): string | null {
	const m = /^\s*5e:\s*(.+?)\s*$/i.exec(code);
	return m ? m[1] : null;
}

export class Dnd5eRuntime {
	readonly index: Dnd5eIndex;
	readonly fights: FightStore;

	constructor(readonly plugin: NimbleStatblocksPlugin) {
		this.index = new Dnd5eIndex(plugin.app);
		this.fights = new FightStore(plugin);
		this.index.vault.setScope((filePath, from) => plugin.canSee(filePath, from));
	}

	/** Which rules a note plays by: its campaign's 5e edition, else 2024. */
	edition(path?: string): Dnd5eEdition {
		return this.plugin.system(path).id === 'dnd5e' ? asEdition(this.plugin.edition(path)) : '2024';
	}

	get(name: string, from?: string): Dnd5eEntry | undefined {
		return this.index.get(name, this.edition(from), from || undefined);
	}

	register(): void {
		const plugin = this.plugin;
		plugin.registerMarkdownCodeBlockProcessor(STATBLOCK_LANG, (source, el, ctx) => {
			const m = parseStatblock5e(source);
			if (!m) {
				el.createDiv({ cls: 'dnd5e-empty', text: 'A 5e stat block starts with a name line, like "name: Goblin".' });
				return;
			}
			this.render(el, m, { sourcePath: ctx.sourcePath, variant: 'block', lore: plugin.hideStats(ctx.sourcePath, ctx.sourcePath) });
		});
		plugin.inlineRefs.add(this.refProvider());
		plugin.registerEditorSuggest(new Dnd5eRefSuggest(plugin.app, this));
		plugin.registerView(DND5E_TRACKER_VIEW, (leaf) => new Dnd5eTrackerView(leaf, this));
		plugin.registerView(DND5E_COMPENDIUM_VIEW, (leaf) => new Dnd5eCompendiumView(leaf, this));

		const index = this.index.vault;
		plugin.registerEvent(index.on('changed', () => plugin.refsChanged()));
		// Campaigns moving, switching sides or editions change what a reference sees.
		plugin.registerEvent(plugin.campaigns.on('changed', () => index.trigger('changed')));
		plugin.app.workspace.onLayoutReady(async () => {
			await index.build();
			plugin.registerEvent(plugin.app.vault.on('modify', f => { if (f instanceof TFile) void index.update(f); }));
			plugin.registerEvent(plugin.app.vault.on('create', f => { if (f instanceof TFile) void index.update(f); }));
			plugin.registerEvent(plugin.app.vault.on('delete', f => index.remove(f.path)));
			plugin.registerEvent(plugin.app.vault.on('rename', (f, oldPath) => {
				index.remove(oldPath, false);
				if (f instanceof TFile) void index.update(f);
			}));
		});
	}

	/** The heroes' levels for encounter maths: the party, else the campaign's starting level and hero count. */
	partyLevels(): number[] {
		const party = this.plugin.settings.party;
		if (party.length) return party.map(p => p.level || 1);
		const d = this.plugin.campaigns?.defaults() ?? { level: 1, heroes: this.plugin.settings.defaultPartySize || 4 };
		return Array.from({ length: d.heroes }, () => d.level);
	}

	/** Show the 5e tracker in the right sidebar. */
	async openTracker(): Promise<WorkspaceLeaf | null> {
		const ws = this.plugin.app.workspace;
		let leaf: WorkspaceLeaf | null = ws.getLeavesOfType(DND5E_TRACKER_VIEW)[0] ?? null;
		if (!leaf) {
			leaf = ws.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: DND5E_TRACKER_VIEW, active: true });
		}
		await ws.revealLeaf(leaf);
		return leaf;
	}

	/** Show the 5e compendium in a tab, set to the active campaign's edition. */
	async openCompendium(): Promise<void> {
		const ws = this.plugin.app.workspace;
		const leaf = ws.getLeavesOfType(DND5E_COMPENDIUM_VIEW)[0] ?? ws.getLeaf('tab');
		await leaf.setViewState({ type: DND5E_COMPENDIUM_VIEW, active: true });
		await ws.revealLeaf(leaf);
		if (leaf.view instanceof Dnd5eCompendiumView) leaf.view.show({ edition: this.edition(this.plugin.campaigns.active?.home.path) });
	}

	encounterBlock(def: EncounterDef, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		ctx.addChild(new Dnd5eEncounterBlock(this, el, def, ctx));
	}

	/** Draw a stat block, rolling dice through the plugin (3D dice, roll log). */
	render(el: HTMLElement, m: Dnd5eMonster, o: Omit<Render5eOptions, 'app' | 'onRoll' | 'edition'> & { edition?: Dnd5eEdition }): HTMLElement {
		return renderStatblock5e(el, m, {
			...o,
			app: this.plugin.app,
			edition: o.edition ?? this.edition(o.sourcePath),
			onRoll: this.plugin.settings.clickableDice ? (expr, label) => { this.plugin.rollDice(expr, label, 'effect'); } : undefined,
		});
	}

	/** Buttons under a monster's card: open its note, or copy a book monster into the vault. */
	actions(entry: Dnd5eEntry, sourcePath: string, close?: () => void): Statblock5eAction[] {
		const plugin = this.plugin;
		const out: Statblock5eAction[] = [];
		if (entry.filePath) out.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { close?.(); plugin.hover.hide(); void plugin.app.workspace.openLinkText(entry.filePath, sourcePath, ev.metaKey || ev.ctrlKey); } });
		else if (entry.bundled) out.push({ label: 'Copy to vault', icon: 'file-plus', onClick: () => { close?.(); plugin.hover.hide(); void this.copyToVault(entry.monster, sourcePath); } });
		return out;
	}

	hover(entry: Dnd5eEntry, sourcePath: string): HoverContent {
		const lore = this.plugin.hideStats(entry.filePath, sourcePath || undefined);
		return {
			name: entry.name,
			label: `${entry.name} stat block`,
			open: () => this.quickLook(entry, sourcePath),
			render: (body) => { this.render(body, entry.monster, { sourcePath, variant: 'hover', lore, actions: lore ? [] : this.actions(entry, sourcePath) }); },
		};
	}

	quickLook(entry: Dnd5eEntry, sourcePath: string): Modal {
		this.plugin.hover.hide();
		const m = new Dnd5eQuickLook(this, entry, sourcePath);
		m.open();
		return m;
	}

	/** `spell:Fireball` → the spell; `Fireball` → a monster of that name, else anything in the compendium called that. */
	resolveRef(ref: string, sourcePath: string): { monster: Dnd5eEntry } | { hit: Hit5e } | undefined {
		const m = /^\s*([a-z]+)\s*:\s*(.+)$/i.exec(ref);
		const kind = m ? kindFromWord(m[1]) : undefined;
		const edition = this.edition(sourcePath);
		if (kind) { const hit = findHit(edition, m![2], kind); return hit ? { hit } : undefined; }
		const monster = this.get(ref, sourcePath);
		if (monster) return { monster };
		const hit = findHit(edition, ref);
		return hit ? { hit } : undefined;
	}

	/** A compendium entry's card, as hover content. */
	hitHover(hit: Hit5e, sourcePath: string): HoverContent {
		return {
			name: hit.name,
			label: `${hit.name} (${KIND5E[hit.kind].label.toLowerCase()})`,
			cls: 'is-compendium',
			open: () => this.openCard(hit, sourcePath),
			render: (body) => { renderCard5e(body, hit, this.cardOptions(sourcePath)); },
		};
	}

	cardOptions(sourcePath: string): { app: NimbleStatblocksPlugin['app']; sourcePath: string; onRoll?: (e: string, l: string) => void } {
		return { app: this.plugin.app, sourcePath, onRoll: this.plugin.settings.clickableDice ? (expr, label) => { this.plugin.rollDice(expr, label, 'effect'); } : undefined };
	}

	openCard(hit: Hit5e, sourcePath: string): Modal {
		this.plugin.hover.hide();
		const m = new Card5eModal(this, hit, sourcePath);
		m.open();
		return m;
	}

	/** A pill for `5e:Name` or `5e:spell:Name`: the monster's CR or the entry's icon, its name (hover for the card, click to open it). */
	createRef(name: string, sourcePath: string): HTMLElement {
		const target = this.resolveRef(name, sourcePath);
		if (target && 'hit' in target) {
			const hit = target.hit;
			const el = createSpan({ cls: `nimble-inline-ref dnd5e-ref nimble-inline-found dnd5e-hit kind-${hit.kind}` });
			el.dataset.dnd5eRef = name;
			el.dataset.sourcePath = sourcePath;
			setIcon(el.createSpan({ cls: 'dnd5e-ref-icon' }), KIND5E[hit.kind].icon);
			const link = el.createEl('a', { text: hit.name, cls: 'nimble-inline-name', attr: { href: '#', role: 'link' } });
			link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openCard(hit, sourcePath); });
			this.plugin.hover.attach(link, () => this.hitHover(hit, sourcePath));
			return el;
		}
		return this.createMonsterRef(name, sourcePath);
	}

	private createMonsterRef(name: string, sourcePath: string): HTMLElement {
		const plugin = this.plugin;
		const el = createSpan({ cls: 'nimble-inline-ref dnd5e-ref' });
		el.dataset.dnd5eRef = name;
		el.dataset.sourcePath = sourcePath;
		const entry = this.get(name, sourcePath);
		if (!entry) {
			el.addClass('nimble-inline-unresolved');
			el.createSpan({ text: name, cls: 'nimble-inline-name unresolved' });
			el.createSpan({ text: '?', cls: 'nimble-inline-unknown', attr: { title: this.index.ready ? 'Not found' : 'Indexing…' } });
			return el;
		}
		el.addClass('nimble-inline-found');
		const lore = plugin.hideStats(entry.filePath, sourcePath || undefined);
		if (!lore) el.createSpan({ cls: 'nimble-inline-level', text: entry.monster.cr, attr: { title: `CR ${entry.monster.cr}` } });
		const link = el.createEl('a', { text: entry.name, cls: 'nimble-inline-name', attr: { href: '#', role: 'link' } });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if ((e.metaKey || e.ctrlKey) && entry.filePath) { void plugin.app.workspace.openLinkText(entry.filePath, sourcePath, true); return; }
			this.quickLook(entry, sourcePath);
		});
		plugin.hover.attach(link, () => this.hover(entry, sourcePath));
		return el;
	}

	refProvider(): InlineRefProvider {
		return {
			id: 'dnd5e',
			parse: parse5eRef,
			create: (ref, sourcePath) => this.createRef(ref, sourcePath),
			resolves: (ref, sourcePath) => !!this.resolveRef(ref, sourcePath),
			refresh: (root) => {
				const roots = new Set<ParentNode>(root ? [root] : [activeDocument]);
				if (!root) this.plugin.app.workspace.iterateAllLeaves((leaf) => { roots.add(leaf.view.containerEl.doc); });
				roots.forEach(r => r.querySelectorAll<HTMLElement>('.dnd5e-ref[data-dnd5e-ref]').forEach((el) => {
					if (el.dataset.nimbleCm) return; // Live Preview redraws its own
					if (this.plugin.hover.isAnchoredIn(el)) this.plugin.hover.hide();
					el.replaceWith(this.createRef(el.dataset.dnd5eRef || '', el.dataset.sourcePath || ''));
				}));
			},
		};
	}

	/** A book monster as a note of your own: in the campaign's Monsters folder (else Bestiary), ready to change. */
	async copyToVault(m: Dnd5eMonster, sourcePath = ''): Promise<TFile> {
		const app = this.plugin.app;
		const campaign = this.plugin.campaigns.of(sourcePath) ?? this.plugin.campaigns.active;
		const folder = normalizePath(campaign ? homeFolderFor(campaign, 'monster', campaign.folder) : 'Bestiary');
		if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
		const safe = m.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Monster';
		let path = normalizePath(`${folder}/${safe}.md`);
		for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${safe} ${i}.md`);
		const { bundledId: _id, ...mine } = m;
		const fm = ['---', 'nimble: monster', `cr: "${m.cr}"`];
		if (m.source) fm.push(`source: "${m.source}"`);
		fm.push('---', '');
		const file = await app.vault.create(path, `${fm.join('\n')}# ${m.name}\n\n\`\`\`5e\n${toStatblockSource5e(mine)}\n\`\`\`\n`);
		await app.workspace.getLeaf('tab').openFile(file);
		new Notice(`Created ${file.path}. Edits here replace the book version in this campaign.`);
		return file;
	}
}

/** A compendium entry's card in a modal. */
class Card5eModal extends Modal {
	constructor(private rt: Dnd5eRuntime, private hit: Hit5e, private sourcePath: string) {
		super(rt.plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('dnd5e-card-modal');
		renderCard5e(this.contentEl, this.hit, this.rt.cardOptions(this.sourcePath));
	}

	onClose(): void { this.contentEl.empty(); }
}

/** A 5e monster's stat block in a modal over whatever you're doing. */
class Dnd5eQuickLook extends Modal {
	constructor(private rt: Dnd5eRuntime, private entry: Dnd5eEntry, private sourcePath: string) {
		super(rt.plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-record-modal', 'dnd5e-quick-look');
		const lore = this.rt.plugin.hideStats(this.entry.filePath, this.sourcePath || undefined);
		const head = this.contentEl.createDiv({ cls: 'record-head' });
		const titles = head.createDiv({ cls: 'record-titles' });
		titles.createDiv({ cls: 'record-title', text: this.entry.name });
		if (!lore) titles.createDiv({ cls: 'record-sub', text: `CR ${this.entry.monster.cr}` });
		const bar = head.createDiv({ cls: 'record-actions' });
		for (const a of lore ? [] : this.rt.actions(this.entry, this.sourcePath, () => this.close())) {
			const b = bar.createEl('button', { cls: 'record-btn' });
			if (a.icon) setIcon(b.createSpan(), a.icon);
			b.createSpan({ text: a.label });
			b.onclick = (e) => a.onClick(e);
		}
		this.rt.render(this.contentEl.createDiv({ cls: 'record-body' }), this.entry.monster, { sourcePath: this.sourcePath, variant: 'block', lore });
	}

	onClose(): void { this.contentEl.empty(); }
}

let runtime: Dnd5eRuntime | null = null;

/** 5e's runtime (after register). */
export function dnd5e(): Dnd5eRuntime {
	if (!runtime) throw new Error('5e is not registered yet');
	return runtime;
}

export function registerDnd5e(plugin: NimbleStatblocksPlugin): Dnd5eRuntime {
	runtime = new Dnd5eRuntime(plugin);
	runtime.register();
	plugin.register(() => { runtime = null; });
	return runtime;
}
