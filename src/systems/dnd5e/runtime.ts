// 5e at runtime: the ```5e block, `5e:Name` references with their hover card
// and quick look, the monster index, and Copy to vault. Created once by the
// system's register(); everything else in dnd5e reaches it through dnd5e().

import { MarkdownPostProcessorContext, MarkdownRenderChild, Modal, normalizePath, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import type { HoverContent } from '../../core/hover-preview';
import { refPill, type InlineRefProvider } from '../../core/inline-refs';
import { pill } from '../../core/pill';
import { fmText, homeFolderFor } from '../../core/campaign-model';
import type { NpcInfo } from '../../core/campaigns';
import { openNoteQuickLook } from '../../core/note-quick-look';
import { npcSheet5e, statblockName } from './npc';
import { asEdition, Dnd5eEdition } from './editions';
import { Dnd5eIndex } from './monster-index';
import { parseStatblock5e, STATBLOCK_LANG, toStatblockSource5e } from './parser';
import { Render5eOptions, renderStatblock5e, Statblock5eAction } from './render';
import { termContext } from '../../core/rule-term-ui';
import type { Dnd5eEntry, Dnd5eMonster } from './types';
import { Dnd5eRefSuggest } from './suggest';
import { FightStore } from './combat-store';
import { DND5E_TRACKER_VIEW, Dnd5eTrackerView } from './tracker-view';
import { Dnd5eEncounterBlock } from './encounter-block';
import type { EncounterDef } from '../../core/encounter-def';
import { equipmentLine, Hit5e, KIND5E, Kind5e, kindFromWord, spellLine } from './compendium';
import { findIn, Homebrew5e, mergeHits } from './homebrew-index';
import { setContentLayer5e, setSpellLibrary5e } from './compendium';
import { content5e } from './content';
import type { LoadedPack } from '../../core/content/packs';
import { homebrewSource, ITEM_LANG, parseEquipment5e, parseItem5e, parseSpell5e, SPELL_LANG } from './homebrew';
import { registerBuilders5e } from './builders';
import { registerWizards5e } from './character-wizard';
import { registerContentBuilders5e } from './content-builders';
import { registerImports5e } from './import-ui';
import { addEditButton } from '../../core/builder/commands';
import { renderCard5e, Card5eOptions } from './cards';
import { DND5E_COMPENDIUM_VIEW, Dnd5eCompendiumView, Tab } from './compendium-view';
import { Dnd5eSheet, SHEET_LANG } from './sheet';
import { applyLook } from '../../core/look';
import { gameIcon } from '../../core/icons';
import { anyTrackerLeaf } from '../../core/tracker/follow';
import { addMonster } from './combat';

/** `5e:Goblin` → "Goblin". */
export const REF_PREFIX = '5e:';
export function parse5eRef(code: string): string | null {
	const m = /^\s*5e:\s*(.+?)\s*$/i.exec(code);
	return m ? m[1] : null;
}

/** What a line of an encounter block fights with: a monster, or an NPC note with stats (`npc`, with the HP it has left). */
export interface Fighter5e {
	entry: Dnd5eEntry;
	npc?: NpcInfo;
	hpNow?: number;
}

export class Dnd5eRuntime {
	readonly index: Dnd5eIndex;
	readonly fights: FightStore;
	/** Your ```5e-spell and ```5e-item blocks. */
	readonly homebrew: Homebrew5e;

	constructor(readonly plugin: EmberVaultPlugin) {
		this.index = new Dnd5eIndex(plugin.app);
		this.fights = new FightStore(plugin);
		this.homebrew = new Homebrew5e(plugin.app);
		for (const i of [this.index.vault, ...this.homebrew.indexes]) i.setScope((filePath, from) => plugin.canSee(filePath, from));
	}

	/** Which rules a note plays by: its campaign's 5e edition, else 2024. */
	edition(path?: string): Dnd5eEdition {
		return this.plugin.system(path).id === 'dnd5e' ? asEdition(this.plugin.edition(path)) : '2024';
	}

	get(name: string, from?: string): Dnd5eEntry | undefined {
		return this.index.get(name, this.edition(from), from || undefined);
	}

	/**
	 * A line of an encounter block as what fights: a [[link]] to an NPC note means the NPC; any other
	 * name is a monster first, then an NPC (only NPCs `from` can see). An NPC is made the way Add to
	 * fight on its card makes it: its stat block under its own name, its own AC, HP and stats on top,
	 * and the HP its note says are left.
	 */
	fighter(m: { name: string; written?: string }, from?: string): Fighter5e | undefined {
		const link = m.written?.startsWith('[[') ? m.written : undefined;
		const monster = (): Fighter5e | undefined => {
			const e = this.get(m.name, from);
			return e ? { entry: e } : undefined;
		};
		const npc = (): Fighter5e | undefined => {
			const n = this.plugin.campaigns.npcNamed(link ?? m.name, from);
			if (!n) return undefined;
			const fm = this.plugin.campaigns.npcProps(n);
			const ref = statblockName(fm.statblock);
			// The block it uses, found the way its card finds it: from the NPC's own note.
			const base = ref ? this.get(ref, n.path) : undefined;
			const name = fmText(fm.title).trim() || n.name;
			const s = npcSheet5e(name, fm, base ? { name: ref, monster: base.monster } : undefined);
			return s ? { entry: { name, filePath: n.path, monster: s.monster }, npc: n, hpNow: s.hpNow } : undefined;
		};
		return link ? npc() ?? monster() : monster() ?? npc();
	}

	/** An NPC in a fight: [CR | their name], their numbers on hover, their note in a quick look on click (Cmd/Ctrl-click: the page). */
	createNpcRef(f: Fighter5e, sourcePath: string): HTMLElement {
		const { el, name } = refPill({
			system: 'dnd5e', cls: 'dnd5e-ref is-npc', name: f.entry.name,
			badge: { text: f.entry.monster.cr, title: `CR ${f.entry.monster.cr}` },
			nameAttr: { 'aria-label': `NPC: ${f.entry.name}` },
		});
		name.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.plugin.hover.hide();
			const file = this.plugin.app.vault.getFileByPath(f.entry.filePath);
			if (!file) return;
			if (e.metaKey || e.ctrlKey) { void this.plugin.app.workspace.getLeaf('tab').openFile(file); return; }
			openNoteQuickLook(this.plugin.app, { file, sourcePath, subtitle: f.npc?.role, system: 'dnd5e' });
		});
		this.plugin.hover.attach(name, () => this.hover(f.entry, sourcePath));
		return el;
	}

	register(): void {
		const plugin = this.plugin;
		plugin.registerMarkdownCodeBlockProcessor(STATBLOCK_LANG, (source, el, ctx) => {
			const m = parseStatblock5e(source);
			if (!m) {
				el.createDiv({ cls: 'dnd5e-empty', text: 'A 5e stat block starts with a name line, like "name: Goblin".' });
				return;
			}
			const draw = () => {
				el.empty();
				const lore = plugin.hideStats(ctx.sourcePath, ctx.sourcePath);
				this.render(el, m, { sourcePath: ctx.sourcePath, variant: 'block', lore });
				if (!lore) addEditButton(plugin, el, ctx, { system: 'dnd5e', kind: 'monster', lang: STATBLOCK_LANG, source, seed: { monster: m } });
			};
			draw();
			// The campaign's edition (the layout) and side (lore for players) can change, or only be known after startup.
			const child = new MarkdownRenderChild(el);
			let seen = `${this.edition(ctx.sourcePath)}:${plugin.hideStats(ctx.sourcePath, ctx.sourcePath)}`;
			child.registerEvent(plugin.campaigns.on('changed', () => {
				const now = `${this.edition(ctx.sourcePath)}:${plugin.hideStats(ctx.sourcePath, ctx.sourcePath)}`;
				if (now !== seen) { seen = now; draw(); }
			}));
			ctx.addChild(child);
		});
		// Your own spells and items: the compendium's card, and Edit for the GM.
		const homebrew = (lang: string, kind: 'spell' | 'item') => plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
			const edition = this.edition(ctx.sourcePath);
			const spell = kind === 'spell' ? parseSpell5e(source) : null;
			const item = kind === 'item' ? parseItem5e(source, edition) : null;
			// An item block with a category is a weapon, armor or gear.
			const equipment = kind === 'item' && !item ? parseEquipment5e(source) : null;
			// Yours, so the card says Homebrew where the book's say SRD 5.2.
			const hit: Hit5e | null = spell ? { kind: 'spell', name: spell.name, edition, detail: spellLine(spell, edition), spell: homebrewSource(spell) }
				: item ? { kind: 'item', name: item.name, edition, detail: item.line ?? '', item: homebrewSource(item) }
					: equipment ? { kind: 'equipment', name: equipment.name, edition, detail: equipmentLine(equipment), equipment: homebrewSource(equipment) } : null;
			if (!hit) { el.createDiv({ cls: 'dnd5e-empty', text: `A ${kind} block starts with a name line, like "name: ${kind === 'spell' ? 'Ember Lash' : 'Ember Blade'}".` }); return; }
			el.addClass('dnd5e-homebrew');
			renderCard5e(el, hit, this.cardOptions(ctx.sourcePath));
			if (!plugin.playerView(ctx.sourcePath)) addEditButton(plugin, el, ctx, { system: 'dnd5e', kind, lang, source, seed: spell ? { spell } : item ? { item } : { equipment } });
		});
		homebrew(SPELL_LANG, 'spell');
		homebrew(ITEM_LANG, 'item');
		registerBuilders5e(this);
		registerWizards5e(this);
		registerContentBuilders5e(this);
		registerImports5e(this);
		plugin.registerMarkdownCodeBlockProcessor(SHEET_LANG, (_source, el, ctx) => { ctx.addChild(new Dnd5eSheet(this, el, ctx)); });
		plugin.inlineRefs.add(this.refProvider());
		plugin.registerEditorSuggest(new Dnd5eRefSuggest(plugin.app, this));
		plugin.registerView(DND5E_TRACKER_VIEW, (leaf) => new Dnd5eTrackerView(leaf, this));
		plugin.registerView(DND5E_COMPENDIUM_VIEW, (leaf) => new Dnd5eCompendiumView(leaf, this));

		// Content packs the active campaign uses go on top of the SRD (a note still beats them).
		let applied: LoadedPack[] = [];
		const applyPacks = () => {
			const packs = plugin.content.enabled('dnd5e', plugin.campaigns.active?.home.path);
			if (packs.length === applied.length && packs.every((p, i) => p === applied[i])) return;
			applied = packs;
			const forEdition = (ed: Dnd5eEdition) => {
				const mine = packs.filter(p => !p.edition || p.edition === ed);
				return mine.length ? content5e(mine.flatMap(p => p.entries.map(e => ({ ...e, pack: p.name })))) : null;
			};
			setContentLayer5e(packs.length ? forEdition : null);
			this.index.vault.trigger('changed');
		};
		plugin.registerEvent(plugin.content.on('changed', applyPacks));
		// Your ```5e-spell blocks (homebrew, imported) join the wizards' spell picks, as the active campaign sees them.
		setSpellLibrary5e(() => this.homebrew.library(plugin.campaigns.active?.home.path).spells);
		plugin.registerEvent(plugin.campaigns.on('changed', applyPacks));

		const indexes = [this.index.vault, ...this.homebrew.indexes];
		for (const index of indexes) {
			plugin.registerEvent(index.on('changed', () => plugin.refsChanged()));
			// Campaigns moving, switching sides or editions change what a reference sees.
			plugin.registerEvent(plugin.campaigns.on('changed', () => index.trigger('changed')));
		}
		plugin.app.workspace.onLayoutReady(async () => {
			await Promise.all(indexes.map(i => i.build()));
			plugin.registerEvent(plugin.app.vault.on('modify', f => { if (f instanceof TFile) for (const i of indexes) void i.update(f); }));
			plugin.registerEvent(plugin.app.vault.on('create', f => { if (f instanceof TFile) for (const i of indexes) void i.update(f); }));
			plugin.registerEvent(plugin.app.vault.on('delete', f => { for (const i of indexes) i.remove(f.path); }));
			plugin.registerEvent(plugin.app.vault.on('rename', (f, oldPath) => {
				for (const i of indexes) {
					i.remove(oldPath, false);
					if (f instanceof TFile) void i.update(f);
				}
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
		// Another game's tracker is open: this one takes its place.
		const other = leaf ? null : anyTrackerLeaf(this.plugin);
		if (other) { await other.setViewState({ type: DND5E_TRACKER_VIEW, active: true }); leaf = other; }
		if (!leaf) {
			leaf = ws.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: DND5E_TRACKER_VIEW, active: true });
		}
		await ws.revealLeaf(leaf);
		return leaf;
	}

	/** Show the 5e compendium in a tab, set to the note's (else the active campaign's) edition. */
	async openCompendium(o: { tab?: Tab; query?: string; path?: string } = {}): Promise<void> {
		const ws = this.plugin.app.workspace;
		const leaf = ws.getLeavesOfType(DND5E_COMPENDIUM_VIEW)[0] ?? ws.getLeaf('tab');
		await leaf.setViewState({ type: DND5E_COMPENDIUM_VIEW, active: true });
		await ws.revealLeaf(leaf);
		if (leaf.view instanceof Dnd5eCompendiumView) leaf.view.show({ edition: this.edition(o.path ?? this.plugin.campaigns.active?.home.path), tab: o.tab, query: o.query });
	}

	encounterBlock(def: EncounterDef, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string): void {
		ctx.addChild(new Dnd5eEncounterBlock(this, el, def, ctx, source));
	}

	/** Draw a stat block, rolling dice through the plugin (3D dice, roll log). */
	render(el: HTMLElement, m: Dnd5eMonster, o: Omit<Render5eOptions, 'app' | 'onRoll' | 'edition' | 'terms'> & { edition?: Dnd5eEdition }): HTMLElement {
		return renderStatblock5e(el, m, {
			...o,
			app: this.plugin.app,
			edition: o.edition ?? this.edition(o.sourcePath),
			terms: termContext(this.plugin, o.sourcePath),
			onRoll: this.plugin.settings.clickableDice ? (expr, label) => { this.plugin.rollDice(expr, label, 'effect'); } : undefined,
		});
	}

	/** Buttons under a monster's card: open its note, or copy a book monster into the vault. */
	actions(entry: Dnd5eEntry, sourcePath: string, close?: () => void): Statblock5eAction[] {
		const plugin = this.plugin;
		const out: Statblock5eAction[] = [];
		// Wherever a monster shows up (quick look, Omnisearch, hover card), the GM can put it in the fight.
		if (!plugin.playerView(sourcePath || undefined)) out.push({ label: 'Add to fight', icon: 'swords', cls: 'mod-cta', onClick: () => { close?.(); plugin.hover.hide(); void this.addToFight(entry); } });
		if (entry.filePath) out.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { close?.(); plugin.hover.hide(); void plugin.app.workspace.openLinkText(entry.filePath, sourcePath, ev.metaKey || ev.ctrlKey); } });
		else if (entry.bundled) out.push({ label: 'Copy to vault', icon: 'file-plus', onClick: () => { close?.(); plugin.hover.hide(); void this.copyToVault(entry.monster, sourcePath); } });
		return out;
	}

	/** Put a monster in the current fight and show the tracker. */
	async addToFight(entry: Dnd5eEntry, count = 1): Promise<void> {
		this.fights.change(f => { addMonster(f, entry.monster, count, { sourceFile: entry.filePath || undefined }); });
		new Notice(count > 1 ? `Added ${count} ${entry.name} to the fight` : `Added ${entry.name} to the fight`);
		await this.openTracker();
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

	/** Every compendium hit a note can see: your spells and items, then the edition's SRD. */
	hits(edition: Dnd5eEdition, from?: string): Hit5e[] {
		return mergeHits(this.homebrew.hits(edition, from), edition);
	}

	/** A compendium hit by name: yours first, then the SRD's. */
	findHit(name: string, sourcePath: string, kind?: Kind5e): Hit5e | undefined {
		const edition = this.edition(sourcePath);
		return findIn(this.homebrew.hits(edition, sourcePath || undefined), edition, name, kind);
	}

	/** `spell:Fireball` → the spell; `Fireball` → a monster of that name, else anything in the compendium called that. */
	resolveRef(ref: string, sourcePath: string): { monster: Dnd5eEntry } | { hit: Hit5e } | undefined {
		const m = /^\s*([a-z]+)\s*:\s*(.+)$/i.exec(ref);
		const kind = m ? kindFromWord(m[1]) : undefined;
		if (kind) { const hit = this.findHit(m![2], sourcePath, kind); return hit ? { hit } : undefined; }
		const monster = this.get(ref, sourcePath);
		if (monster) return { monster };
		const hit = this.findHit(ref, sourcePath);
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

	cardOptions(sourcePath: string): Card5eOptions {
		return {
			app: this.plugin.app, sourcePath, terms: termContext(this.plugin, sourcePath),
			onRoll: this.plugin.settings.clickableDice ? (expr, label) => { this.plugin.rollDice(expr, label, 'effect'); } : undefined,
		};
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
			const label = KIND5E[hit.kind].label;
			const { el, name: link } = refPill({
				system: 'dnd5e',
				cls: `dnd5e-ref dnd5e-hit is-compendium kind-${hit.kind}`,
				icon: { name: KIND5E[hit.kind].icon, label },
				name: hit.name,
				nameAttr: { 'aria-label': `${label}: ${hit.name}` },
			});
			el.dataset.dnd5eRef = name;
			el.dataset.sourcePath = sourcePath;
			link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openCard(hit, sourcePath); });
			this.plugin.hover.attach(link, () => this.hitHover(hit, sourcePath));
			return el;
		}
		return this.createMonsterRef(name, sourcePath);
	}

	private createMonsterRef(name: string, sourcePath: string): HTMLElement {
		const plugin = this.plugin;
		const entry = this.get(name, sourcePath);
		const lore = !!entry && plugin.hideStats(entry.filePath, sourcePath || undefined);
		const { el, name: link } = entry
			? refPill({ system: 'dnd5e', cls: 'dnd5e-ref', badge: lore ? undefined : { text: entry.monster.cr, title: `CR ${entry.monster.cr}` }, name: entry.name })
			: refPill({ system: 'dnd5e', cls: 'dnd5e-ref', name, unknown: { title: this.index.ready ? 'Not found' : 'Indexing…' } });
		el.dataset.dnd5eRef = name;
		el.dataset.sourcePath = sourcePath;
		if (!entry) return el;
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
		applyLook(this.modalEl, 'dnd5e');
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
		applyLook(this.modalEl, 'dnd5e');
		const lore = this.rt.plugin.hideStats(this.entry.filePath, this.sourcePath || undefined);
		const head = this.contentEl.createDiv({ cls: 'record-head' });
		const titles = head.createDiv({ cls: 'record-titles' });
		titles.createDiv({ cls: 'record-title', text: this.entry.name });
		if (!lore) titles.createDiv({ cls: 'record-sub', text: `CR ${this.entry.monster.cr}` });
		const bar = head.createDiv({ cls: 'record-actions' });
		for (const a of lore ? [] : this.rt.actions(this.entry, this.sourcePath, () => this.close())) {
			const b = pill(bar, { tag: 'button', cls: `record-btn ${a.cls ?? ''}`.trim(), icon: a.icon ? gameIcon(a.icon) : undefined, text: a.label });
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

export function registerDnd5e(plugin: EmberVaultPlugin): Dnd5eRuntime {
	runtime = new Dnd5eRuntime(plugin);
	plugin.runtimes.set('dnd5e', runtime);
	runtime.register();
	plugin.register(() => { runtime = null; plugin.runtimes.delete('dnd5e'); });
	return runtime;
}
