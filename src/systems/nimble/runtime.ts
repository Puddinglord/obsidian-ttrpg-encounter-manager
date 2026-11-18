// Nimble at runtime: its monster index, its encounter store, and what the rest
// of Nimble asks for (stat blocks drawn with the plugin's dice and keywords,
// conditions, creature notes, the compendium and tracker views). Made once by
// Nimble's register(); everything in Nimble reaches it through nimble(), as 5e
// does through dnd5e(). The plugin itself holds no Nimble state.

import { Component, MarkdownRenderer, Menu, normalizePath, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { safeName } from '../../core/campaign-model';
import { creatureNote } from '../../core/campaign-templates';
import { keywordPattern } from '../../core/markdown';
import { openPopover } from '../../core/popover';
import { BestiaryEntry, bestiaryEntries } from './bestiary';
import { openAddMonsterPicker } from './compendium-pickers';
import { baseCreatureName, bookOf } from './compendium-entries';
import type { Segment } from './compendium-entries';
import { bundledCompendium } from './compendium-data';
import { COMPENDIUM_VIEW_TYPE, CompendiumView } from './compendium-view';
import { AddSeveralModal } from './count-modal';
import { notesBody } from './creature-notes';
import BESTIARY from './data/bestiary.json';
import { EncounterStore } from './encounters';
import { MonsterIndex } from './monster-index';
import { toStatblockSource } from './parser';
import { DiceKind, renderStatblock, RenderOptions, StatblockAction } from './render';
import { monsterRole, shiftMonster } from './rules';
import { ENCOUNTER_VIEW_TYPE, EncounterTrackerView } from './tracker-view';
import { MonsterIndexEntry, NIMBLE_CONDITIONS, NimbleCondition, NimbleMonster } from './types';

let runtime: NimbleRuntime | null = null;

/** Nimble's runtime (after register). */
export function nimble(): NimbleRuntime {
	if (!runtime) throw new Error('Nimble is not registered yet');
	return runtime;
}

export class NimbleRuntime {
	readonly index: MonsterIndex;
	readonly encounters: EncounterStore;
	private keywordCache: { key: string; re: RegExp | undefined } | null = null;

	constructor(readonly plugin: EmberVaultPlugin) {
		this.index = new MonsterIndex(plugin.app);
		this.encounters = new EncounterStore(() => plugin.settings, () => plugin.saveSettings(), () => plugin.campaigns.defaults());
	}

	private get app() { return this.plugin.app; }
	private get settings() { return this.plugin.settings; }
	private get hover() { return this.plugin.hover; }
	private get campaigns() { return this.plugin.campaigns; }

	/** (Re)load the bundled Nimble bestiary, or clear it when the setting is off. */
	loadBundledBestiary(): void {
		const entries = this.settings.bundledBestiary
			? bestiaryEntries(BESTIARY as unknown as BestiaryEntry[], this.encounters.partySize())
			: [];
		this.index.setBundled(entries);
	}

	getAllConditions(): NimbleCondition[] {
		return [...NIMBLE_CONDITIONS, ...(this.settings.customConditions || [])];
	}

	condition(name: string): NimbleCondition | undefined {
		return this.getAllConditions().find(c => c.name.toLowerCase() === name.toLowerCase());
	}

	/** Matches condition names in rules text ("Grappled", "Prone", "Dazed"…). */
	conditionKeywords(): RegExp | undefined {
		const names = this.getAllConditions().filter(c => !c.auto).map(c => c.name);
		const key = names.join('|');
		if (this.keywordCache?.key !== key) this.keywordCache = { key, re: keywordPattern(names) };
		return this.keywordCache.re;
	}

	/** A small popover with a condition's rules text. */
	showConditionInfo(anchor: HTMLElement, name: string): void {
		const cond = this.condition(name);
		if (!cond) return;
		openPopover(anchor, (el) => {
			el.addClass('condition-info');
			el.createDiv({ cls: 'popover-title', text: cond.name });
			el.createDiv({ cls: 'popover-body', text: cond.description });
		}, { width: 280 });
	}

	renderStatblock(
		container: HTMLElement,
		monster: NimbleMonster,
		sourcePath: string,
		variant: 'block' | 'inline' | 'hover',
		onAdd?: (ev: MouseEvent) => void,
		extra: Partial<RenderOptions> = {},
	): HTMLElement {
		// A note's own stat block is always shown; looked-up monsters are lore cards for players.
		const lore = extra.lore ?? (variant !== 'block' && this.plugin.hideStats(sourcePath));
		const block = renderStatblock(container, monster, {
			app: this.app,
			sourcePath,
			variant,
			lore,
			compact: this.settings.statblockStyle === 'compact',
			onAdd,
			onDice: this.settings.clickableDice ? (el, expr, label, kind) => this.wireDice(el, expr, label, kind) : undefined,
			keywords: this.conditionKeywords(),
			onKeyword: (el, word) => this.wireKeyword(el, word),
			partySize: this.encounters.partySize(this.encounters.active),
			// Lore cards list every book the creature is in, wherever they show.
			sources: lore ? extra.sources ?? this.printingsOf(monster) : undefined,
			...extra,
		});
		// …and your own notes on it, under the card (bestiary, hover preview, quick look alike).
		if (lore) {
			const note = this.creatureNote(baseCreatureName(monster.name));
			if (note) void this.renderCreatureNotes(container, block, note);
		}
		return block;
	}

	/** Every book a bundled creature is printed in ("Monsters & More p.6", "GM Guide p.30"). */
	printingsOf(monster: NimbleMonster): string[] | undefined {
		if (!monster.bundledId) return undefined;
		const base = baseCreatureName(monster.name).toLowerCase();
		const all = this.index.all().filter(e => e.bundled && baseCreatureName(e.name).toLowerCase() === base);
		return all.length > 1 ? [...new Set(all.map(e => bookOf(e).long))] : undefined;
	}

	/** "Your notes" under a lore card: the note's text (without its empty template parts) and a button to open it. */
	private async renderCreatureNotes(container: HTMLElement, after: HTMLElement, file: TFile): Promise<void> {
		const text = await this.app.vault.cachedRead(file);
		if (!after.parentElement) return;
		const body = notesBody(text);
		const box = createDiv({ cls: 'nimble-creature-notes' });
		after.after(box);
		const head = box.createDiv({ cls: 'nimble-creature-notes-head' });
		setIcon(head.createSpan({ cls: 'nimble-creature-notes-icon' }), 'notebook-pen');
		head.createSpan({ cls: 'nimble-creature-notes-title', text: 'Your notes' });
		const open = head.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open your notes' } });
		setIcon(open, 'external-link');
		open.addEventListener('click', (ev) => { this.hover.hide(); void this.app.workspace.getLeaf(ev.metaKey || ev.ctrlKey).openFile(file); });
		const md = box.createDiv({ cls: 'nimble-creature-notes-body markdown-rendered' });
		if (!body) { md.createDiv({ cls: 'nimble-creature-notes-empty', text: 'Nothing written yet.' }); return; }
		// Rendered once into a card that's thrown away; the component goes with it.
		const owner = new Component();
		owner.load();
		await MarkdownRenderer.render(this.app, body, md, file.path, owner);
		const gone = new MutationObserver(() => { if (!box.isConnected) { owner.unload(); gone.disconnect(); } });
		gone.observe(box.ownerDocument.body, { childList: true, subtree: true });
	}

	private wireKeyword(el: HTMLElement, word: string): void {
		const cond = this.condition(word);
		if (!cond) return;
		el.addClass('nimble-condition-ref');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		const show = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.showConditionInfo(el, word); };
		el.addEventListener('click', show);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') show(e); });
	}

	/** Buttons shown under a hover preview or bestiary stat block. */
	monsterActions(entry: MonsterIndexEntry, opts: { inBestiary?: boolean; viewPath?: string } = {}): StatblockAction[] {
		if (this.plugin.hideStats(entry.filePath, opts.viewPath)) {
			// Players can't add monsters to a fight; they can look them up and open their own notes.
			const out: StatblockAction[] = [];
			if (entry.bundled && !opts.inBestiary) out.push({ label: 'Compendium', icon: 'book-open', onClick: () => { this.hover.hide(); void this.openBestiary(entry.monster.bundledId); } });
			if (!entry.bundled && entry.filePath) out.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { this.hover.hide(); void this.app.workspace.openLinkText(entry.filePath, '', ev.metaKey || ev.ctrlKey); } });
			const name = baseCreatureName(entry.name);
			const noted = !!this.creatureNote(name);
			out.push({ label: noted ? 'Open notes' : 'Add notes', icon: noted ? 'notebook-pen' : 'notebook', onClick: () => { this.hover.hide(); void this.openCreatureNote(name); } });
			return out;
		}
		const actions: StatblockAction[] = [
			{
				label: 'Add', icon: 'plus', cls: 'mod-cta',
				onClick: (ev) => void this.addToEncounter(entry.monster, entry.filePath || undefined, ev.shiftKey ? 2 : 1),
				menu: (ev) => {
					const m = new Menu();
					const add = (title: string, icon: string, n: number, shift = 0) => m.addItem(i => i.setTitle(title).setIcon(icon)
						.onClick(() => void this.addToEncounter(shiftMonster(entry.monster, shift), entry.filePath || undefined, n)));
					m.addItem(i => i.setTitle('Add several…').setIcon('copy-plus').onClick(() => {
						this.hover.hide();
						new AddSeveralModal(this.app, this.plugin, entry.monster, entry.filePath || undefined).open();
					}));
					if (monsterRole(entry.monster) !== 'minion') {
						m.addSeparator();
						add('Add tougher (+1 level)', 'trending-up', 1, 1);
						add('Add weaker (−1 level)', 'trending-down', 1, -1);
					}
					m.showAtMouseEvent(ev);
				},
			},
		];
		if (entry.bundled) {
			if (!opts.inBestiary) actions.push({ label: 'Compendium', icon: 'book-open', onClick: () => { this.hover.hide(); void this.openBestiary(entry.monster.bundledId); } });
			actions.push({ label: 'Copy to vault', icon: 'file-plus', onClick: () => { this.hover.hide(); void this.copyMonsterToVault(entry.monster); } });
		} else if (entry.filePath) {
			actions.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { this.hover.hide(); void this.app.workspace.openLinkText(entry.filePath, '', ev.metaKey || ev.ctrlKey); } });
		}
		return actions;
	}

	private wireDice(el: HTMLElement, expression: string, label: string, kind: DiceKind): void {
		el.addClass('is-clickable');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		el.setAttr('aria-label', `Roll ${expression}`);
		el.setAttr('title', `Roll ${expression}`);
		const roll = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			this.plugin.rollDice(expression, label, kind);
		};
		el.addEventListener('click', roll);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') roll(e); });
	}

	/** Your notes on creatures, by lower-case creature name (notes with `nimble: creature`; the active campaign's win). */
	creatureNotes(): Map<string, TFile> {
		const active = this.settings.activeCampaign;
		const out = new Map<string, TFile>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			if (!fm || String(fm.nimble ?? '').toLowerCase() !== 'creature') continue;
			const k = String(fm.creature ?? f.basename).trim().toLowerCase();
			if (!out.has(k) || (active && f.path.startsWith(`${active}/`))) out.set(k, f);
		}
		return out;
	}

	/** Your notes on one creature, if you've written any. */
	creatureNote(name: string): TFile | null {
		return this.creatureNotes().get(name.trim().toLowerCase()) ?? null;
	}

	/** Open your notes on a creature, making them (in the campaign's Bestiary folder) the first time. */
	async openCreatureNote(name: string): Promise<void> {
		let file = this.creatureNote(name);
		if (!file) {
			const c = this.campaigns.active;
			const folder = normalizePath(c ? `${c.folder}/Bestiary` : 'Bestiary');
			if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder).catch(() => undefined);
			file = await this.app.vault.create(this.campaigns.available(`${folder}/${safeName(name)}.md`), creatureNote(name));
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** Open the Compendium tab, showing a bundled monster when given one. */
	async openBestiary(monsterId?: string): Promise<void> {
		const view = await this.openCompendium();
		if (monsterId) view?.select(`monster:${monsterId}`);
	}

	/** Open (or reveal) the Compendium tab, optionally on a tab and search. */
	async openCompendium(segment?: Segment, query?: string): Promise<CompendiumView | null> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(COMPENDIUM_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: COMPENDIUM_VIEW_TYPE, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
		const view = leaf.view instanceof CompendiumView ? leaf.view : null;
		if (view && (segment || query !== undefined)) view.search(segment, query);
		return view;
	}

	/** Open a monster wherever it lives: its note, or the bestiary for bundled ones. */
	openMonster(entry: MonsterIndexEntry, sourcePath = '', newLeaf = false): void {
		if (entry.bundled || !entry.filePath) void this.openBestiary(entry.monster.bundledId);
		else void this.app.workspace.openLinkText(entry.filePath, sourcePath, newLeaf);
	}

	/** Write a monster to an editable note in the vault and open it. */
	async copyMonsterToVault(monster: NimbleMonster): Promise<void> {
		const folder = normalizePath('Bestiary');
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		const safe = monster.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Monster';
		let path = normalizePath(`${folder}/${safe}.md`);
		for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${safe} ${i}.md`);
		const fm = ['---', 'nimble: monster', `level: "${monster.level ?? ''}"`, `role: ${monster.role ?? 'regular'}`];
		if (monster.group) fm.push(`group: "${monster.group.replace(/"/g, '\'')}"`);
		if (monster.source) fm.push(`source: "${monster.source}"`);
		fm.push('---', '');
		const body = `${fm.join('\n')}# ${monster.name}\n\n\`\`\`nimble\n${toStatblockSource(monster)}\n\`\`\`\n`;
		const file = await this.app.vault.create(path, body);
		await this.app.workspace.getLeaf('tab').openFile(file);
		new Notice(`Created ${file.path}. Edits here replace the bestiary version everywhere.`);
	}

	getEncounterView(): EncounterTrackerView | null {
		const leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0];
		return leaf?.view instanceof EncounterTrackerView ? leaf.view : null;
	}

	async activateEncounterView(focus = true): Promise<WorkspaceLeaf | null> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: ENCOUNTER_VIEW_TYPE, active: focus });
		}
		if (focus) await this.app.workspace.revealLeaf(leaf);
		return leaf;
	}

	/** Make sure the tracker is visible (even in a collapsed sidebar) without stealing focus. */
	async showTracker(): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0] ?? await this.activateEncounterView(false);
		if (leaf && !leaf.view.containerEl.isShown()) await this.app.workspace.revealLeaf(leaf);
	}

	async addToEncounter(monster: NimbleMonster, sourceFile?: string, count = 1): Promise<void> {
		if (this.settings.multipleEncounters && !this.encounters.active) {
			new Notice('Create or select an encounter first');
			await this.activateEncounterView();
			return;
		}
		const added = this.encounters.add(monster, sourceFile, count);
		if (!added.length) return;
		await this.showTracker();
		new Notice(added.length === 1 && added[0].count !== undefined
			? `${count} × ${monster.name} added (${added[0].alive} in the group)`
			: `Added ${added.map(c => c.label).join(', ')}`);
	}

	openAddMonsterModal(): void {
		openAddMonsterPicker(this.plugin);
	}

	/** The bundled player compendium (classes, items, spells…). */
	get compendium() { return bundledCompendium(); }
}

/** Make Nimble's runtime (once, at load) and let tools and tests find it as plugin.runtime('nimble'). */
export function createNimbleRuntime(plugin: EmberVaultPlugin): NimbleRuntime {
	runtime = new NimbleRuntime(plugin);
	plugin.runtimes.set('nimble', runtime);
	return runtime;
}
