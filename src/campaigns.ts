// Live campaign index for the vault, plus the active campaign. The active
// campaign follows the note you open, and each campaign keeps its own party.

import { debounce, Events, normalizePath, Notice, TFile, TFolder } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import {
	adjacentScene, buildCampaigns, Campaign, campaignOf, Chapter, chapterOf, nextOrder, NoteInfo, safeName,
} from './campaign-model';
import { campaignHome, chapterHome, locationNote, npcNote, sceneNote, sessionNote } from './campaign-templates';

export type NewNoteKind = 'scene' | 'npc' | 'location' | 'session';

export const SECTION_FOR: Record<Exclude<NewNoteKind, 'scene'>, string> = { npc: 'NPCs', location: 'Locations', session: 'Sessions' };

export interface NpcInfo {
	path: string;
	name: string;
	aliases: string[];
	role?: string;
	/** Folder of the campaign it belongs to, if any. */
	campaign?: string;
}

/** A note is an NPC when its properties say `nimble: npc`, or it's tagged #npc. */
export function isNpc(fm: Record<string, unknown>, tags: string[]): boolean {
	if (String(fm.nimble ?? '').toLowerCase() === 'npc') return true;
	return tags.some(t => t.replace(/^#/, '').toLowerCase() === 'npc');
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.split(',') : []).map(s => s.trim()).filter(Boolean);

export class CampaignStore extends Events {
	campaigns: Campaign[] = [];
	npcs: NpcInfo[] = [];
	private ready = false;

	constructor(private plugin: NimbleStatblocksPlugin) {
		super();
	}

	private get app() { return this.plugin.app; }
	private get s() { return this.plugin.settings; }

	/** Watch the vault. Call once the layout is ready. */
	start(): void {
		const rebuild = debounce(() => this.rebuild(), 250, true);
		const p = this.plugin;
		p.registerEvent(this.app.metadataCache.on('changed', rebuild));
		p.registerEvent(this.app.vault.on('create', rebuild));
		p.registerEvent(this.app.vault.on('delete', rebuild));
		p.registerEvent(this.app.vault.on('rename', (f, oldPath) => { this.renamed(f.path, oldPath); rebuild(); }));
		p.registerEvent(this.app.workspace.on('file-open', (f) => { if (f) this.opened(f); }));
		this.rebuild();
		const f = this.app.workspace.getActiveFile();
		if (f) this.opened(f);
	}

	rebuild(): void {
		const notes: NoteInfo[] = this.app.vault.getMarkdownFiles().map(f => ({
			path: f.path,
			fm: (this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>,
		}));
		this.campaigns = buildCampaigns(notes);
		this.npcs = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
			const tags = [...list(fm.tags), ...(cache?.tags?.map(t => t.tag) ?? [])];
			if (!isNpc(fm, tags)) continue;
			this.npcs.push({
				path: f.path,
				name: f.basename,
				aliases: list(fm.aliases ?? fm.alias),
				role: typeof fm.role === 'string' ? fm.role : undefined,
				campaign: campaignOf(this.campaigns, f.path)?.folder,
			});
		}
		this.ready = true;
		// A campaign that no longer exists stops being active.
		if (this.s.activeCampaign && !this.campaigns.some(c => c.folder === this.s.activeCampaign)) {
			void this.setActive(this.campaigns[0]?.folder ?? null);
		} else if (!this.s.activeCampaign && this.campaigns.length === 1) {
			void this.setActive(this.campaigns[0].folder);
		}
		this.trigger('changed');
	}

	get active(): Campaign | undefined {
		return this.campaigns.find(c => c.folder === this.s.activeCampaign);
	}

	of(path: string): Campaign | undefined { return campaignOf(this.campaigns, path); }
	chapterOf(path: string): Chapter | undefined { const c = this.of(path); return c && chapterOf(c, path); }

	/** Hero level and count to assume when the party hasn't been entered yet. */
	defaults(): { level: number; heroes: number } {
		const c = this.active;
		return { level: c?.level ?? 1, heroes: c?.heroes ?? (this.s.defaultPartySize || 4) };
	}

	/**
	 * Switch campaigns. The party in `settings.party` is always the active
	 * campaign's, so everything that reads the party keeps working unchanged.
	 */
	async setActive(folder: string | null): Promise<void> {
		const prev = this.s.activeCampaign ?? null;
		if (prev === folder) return;
		const store = this.s.campaigns ?? (this.s.campaigns = {});
		if (prev) store[prev] = { ...(store[prev] ?? {}), party: this.s.party };
		else this.s.looseParty = this.s.party;
		this.s.party = (folder ? store[folder]?.party : this.s.looseParty) ?? [];
		this.s.activeCampaign = folder;
		await this.plugin.saveSettings();
		this.plugin.loadBundledBestiary();
		this.plugin.encounters.trigger('changed');
		this.plugin.rerenderNotes();
		this.trigger('changed');
	}

	/** Last scene opened in a campaign, for "Continue". */
	lastScene(c: Campaign): string | undefined {
		const p = this.s.campaigns?.[c.folder]?.last;
		return p && this.app.vault.getAbstractFileByPath(p) ? p : undefined;
	}

	private opened(file: TFile): void {
		if (!this.ready) return;
		const c = this.of(file.path);
		if (!c) return; // notes outside any campaign leave the active one alone
		if (c.folder !== this.s.activeCampaign) void this.setActive(c.folder);
		const ch = chapterOf(c, file.path);
		if (ch && ch.scenes.some(s => s.path === file.path)) {
			const store = this.s.campaigns ?? (this.s.campaigns = {});
			if (store[c.folder]?.last !== file.path) {
				store[c.folder] = { ...(store[c.folder] ?? { party: [] }), last: file.path };
				void this.plugin.saveSettings();
				this.trigger('changed');
			}
		}
	}

	/** Keep per-campaign data when a campaign folder (or a parent) is renamed. */
	private renamed(path: string, oldPath: string): void {
		const store = this.s.campaigns;
		if (!store) return;
		let changed = false;
		const move = (p: string) => (p === oldPath ? path : p.startsWith(oldPath + '/') ? path + p.slice(oldPath.length) : p);
		for (const key of Object.keys(store)) {
			const next = move(key);
			const entry = store[key];
			if (entry.last) entry.last = move(entry.last);
			if (next !== key) { store[next] = entry; delete store[key]; changed = true; }
		}
		if (this.s.activeCampaign) {
			const next = move(this.s.activeCampaign);
			if (next !== this.s.activeCampaign) { this.s.activeCampaign = next; changed = true; }
		}
		if (changed) void this.plugin.saveSettings();
	}

	// ------------------------------------------------------------------------
	// Navigation

	async open(path: string, newLeaf = false): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) await this.app.workspace.getLeaf(newLeaf).openFile(f);
	}

	/** Open the next/previous scene after the active note. Returns false if there isn't one. */
	step(dir: 1 | -1): boolean {
		const f = this.app.workspace.getActiveFile();
		const c = f && this.of(f.path);
		const target = c && f ? adjacentScene(c, f.path, dir) : undefined;
		if (!target) return false;
		void this.open(target.path);
		return true;
	}

	// ------------------------------------------------------------------------
	// Creating things

	private async ensureFolder(path: string): Promise<void> {
		const p = normalizePath(path);
		if (!p || p === '/') return;
		const existing = this.app.vault.getAbstractFileByPath(p);
		if (existing instanceof TFolder) return;
		await this.app.vault.createFolder(p).catch(() => undefined);
	}

	private async createNote(path: string, body: string): Promise<TFile> {
		let p = normalizePath(path);
		const base = p.replace(/\.md$/, '');
		for (let i = 2; this.app.vault.getAbstractFileByPath(p); i++) p = `${base} ${i}.md`;
		await this.ensureFolder(p.slice(0, p.lastIndexOf('/')));
		const file = await this.app.vault.create(p, body);
		this.rebuildSoon();
		return file;
	}

	/** metadataCache fills in a moment after create; rebuild once it has. */
	private rebuildSoon(): void { window.setTimeout(() => this.rebuild(), 300); }

	async createCampaign(opts: { name: string; level: number; heroes: number; starter: boolean; firstChapter?: string }): Promise<TFile> {
		const name = safeName(opts.name);
		const root = normalizePath(this.s.campaignsFolder || 'Campaigns');
		let folder = `${root}/${name}`;
		for (let i = 2; this.app.vault.getAbstractFileByPath(folder); i++) folder = `${root}/${name} ${i}`;
		await this.ensureFolder(folder);
		const home = await this.createNote(`${folder}/${name}.md`, campaignHome(opts.name.trim() || name, opts.level, opts.heroes));
		if (opts.starter) {
			for (const sub of ['NPCs', 'Locations', 'Sessions', 'Monsters', 'Assets']) await this.ensureFolder(`${folder}/${sub}`);
			const ch = safeName(opts.firstChapter || 'Chapter 1');
			await this.createNote(`${folder}/${ch}/${ch}.md`, chapterHome(opts.firstChapter || 'Chapter 1', 1, undefined, opts.level));
			await this.createNote(`${folder}/${ch}/Opening Scene.md`, sceneNote('Opening Scene', 1));
		}
		// Make it active straight away, with an empty party of its own.
		this.rebuild();
		await this.setActive(folder);
		new Notice(`Campaign "${opts.name}" created`);
		return home;
	}

	async createChapter(c: Campaign, name: string, label?: string): Promise<TFile> {
		const n = safeName(name);
		let folder = `${c.folder}/${n}`;
		for (let i = 2; this.app.vault.getAbstractFileByPath(folder); i++) folder = `${c.folder}/${n} ${i}`;
		const order = nextOrder(c.chapters);
		return this.createNote(`${folder}/${n}.md`, chapterHome(name, order, label, c.level));
	}

	async createScene(ch: Chapter, name: string): Promise<TFile> {
		return this.createNote(`${ch.folder}/${safeName(name)}.md`, sceneNote(name, nextOrder(ch.scenes)));
	}

	async createInSection(c: Campaign, kind: Exclude<NewNoteKind, 'scene'>, name: string): Promise<TFile> {
		const folder = `${c.folder}/${SECTION_FOR[kind]}`;
		if (kind === 'session') {
			const date = new Date().toISOString().slice(0, 10);
			const last = this.lastScene(c);
			return this.createNote(`${folder}/${safeName(name)}.md`, sessionNote(name, date, last?.replace(/^.*\//, '').replace(/\.md$/, '')));
		}
		return this.createNote(`${folder}/${safeName(name)}.md`, kind === 'npc' ? npcNote(name) : locationNote(name));
	}

	/** "Session 4" when there are three already. */
	nextSessionName(c: Campaign): string {
		const sec = c.sections.find(s => s.name === SECTION_FOR.session);
		const n = (sec?.notes.filter(x => x.kind === 'session').length ?? 0) + 1;
		return `Session ${n}`;
	}
}
