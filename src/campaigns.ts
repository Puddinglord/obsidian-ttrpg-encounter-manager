// Live campaign index for the vault, plus the active campaign. The active
// campaign follows the note you open, and each campaign keeps its own party.

import { debounce, Events, normalizePath, Notice, TAbstractFile, TFile, TFolder } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import {
	adjacentScene, buildCampaigns, Campaign, campaignOf, canMoveInto, Chapter, chapterOf, fmText, joinPath, nextOrder, NoteInfo, parentOf, safeName,
} from './campaign-model';
import {
	blankNote, campaignHome, chapterHome, handoutNote, locationNote, mapNote, monsterNote, npcNote, sceneNote, sessionNote, StarterKind,
} from './campaign-templates';

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
	if (fmText(fm.nimble).toLowerCase() === 'npc') return true;
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
		// Every file and folder, not just notes: empty folders and an Assets folder full of images still show.
		const notes: NoteInfo[] = this.app.vault.getFiles().map(f => ({
			path: f.path,
			fm: f.extension === 'md' ? this.app.metadataCache.getFileCache(f)?.frontmatter ?? {} : {},
		}));
		const folders = this.app.vault.getAllFolders(false).map(f => f.path);
		this.campaigns = buildCampaigns(notes, folders);
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
				role: typeof fm.role === 'string' && fm.role ? fm.role : undefined,
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

	/** `path`, or `path` with " 2", " 3"… before the extension if it's taken. */
	private available(path: string, folder = false): string {
		const p = normalizePath(path);
		const slash = p.lastIndexOf('/');
		const dot = p.lastIndexOf('.');
		const hasExt = !folder && dot > slash + 1;
		const base = hasExt ? p.slice(0, dot) : p;
		const ext = hasExt ? p.slice(dot) : '';
		let out = p;
		for (let i = 2; this.app.vault.getAbstractFileByPath(out); i++) out = `${base} ${i}${ext}`;
		return out;
	}

	private async createNote(path: string, body: string): Promise<TFile> {
		const p = this.available(path);
		await this.ensureFolder(parentOf(p));
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
		return this.createStarter(ch.folder, 'scene', name);
	}

	async createInSection(c: Campaign, kind: Exclude<NewNoteKind, 'scene'>, name: string): Promise<TFile> {
		return this.createStarter(`${c.folder}/${SECTION_FOR[kind]}`, kind, name);
	}

	/**
	 * A new note from a starter, in any folder. Scenes in a chapter go to the end
	 * of it; a map can start with its image already set.
	 */
	async createStarter(folder: string, kind: StarterKind, name: string, opts: { image?: string } = {}): Promise<TFile> {
		const path = this.available(`${joinPath(folder, safeName(name))}.md`);
		const c = this.of(path);
		const ch = c && chapterOf(c, path);
		let body: string;
		switch (kind) {
			case 'scene': body = sceneNote(name, nextOrder(ch?.scenes ?? [])); break;
			case 'npc': body = npcNote(name); break;
			case 'location': body = locationNote(name); break;
			case 'monster': body = monsterNote(name); break;
			case 'handout': body = handoutNote(name); break;
			case 'session': {
				const last = c && this.lastScene(c);
				body = sessionNote(name, new Date().toISOString().slice(0, 10), last?.replace(/^.*\//, '').replace(/\.md$/, ''));
				break;
			}
			case 'map': {
				const img = opts.image ? this.app.vault.getAbstractFileByPath(opts.image) : null;
				body = mapNote(name, img instanceof TFile ? this.app.metadataCache.fileToLinktext(img, path, false) : undefined);
				break;
			}
			default: body = blankNote();
		}
		return this.createNote(path, body);
	}

	/** A new folder (a section) in the campaign. Returns its path. */
	async createFolder(parent: string, name: string): Promise<string> {
		const path = this.available(joinPath(parent, safeName(name)), true);
		await this.app.vault.createFolder(path);
		this.rebuild();
		return path;
	}

	/**
	 * Move notes, files or folders into `target`, keeping links working (Obsidian
	 * rewrites them). A note moved into a chapter joins the end of its scenes.
	 * Returns the new paths of what moved.
	 */
	async move(paths: string[], target: string): Promise<string[]> {
		const moved: string[] = [];
		const dest = this.app.vault.getAbstractFileByPath(target);
		if (target && !(dest instanceof TFolder)) return moved;
		const c = this.of(joinPath(target, 'x'));
		const ch = c?.chapters.find(x => x.folder === target);
		let order = ch ? nextOrder(ch.scenes) : 0;
		for (const p of paths) {
			const f = this.app.vault.getAbstractFileByPath(p);
			if (!f || !canMoveInto(f.path, target)) continue;
			if (c && f.path === c.folder) continue; // the campaign itself
			if (f instanceof TFile && this.campaigns.some(x => x.home.path === f.path)) continue; // a campaign's home note
			const to = this.available(joinPath(target, f.name), f instanceof TFolder);
			await this.app.fileManager.renameFile(f, to);
			if (ch && f instanceof TFile && f.extension === 'md' && !ch.maps.some(m => m.path === p)) {
				const n = order++;
				await this.app.fileManager.processFrontMatter(f, (fmData: Record<string, unknown>) => { fmData.order = n; });
			}
			moved.push(f.path);
		}
		this.rebuild();
		if (moved.length) {
			const where = target === c?.folder ? c.name : target.replace(/^.*\//, '');
			new Notice(moved.length === 1 ? `Moved ${moved[0].replace(/^.*\//, '').replace(/\.md$/, '')} to ${where}` : `Moved ${moved.length} items to ${where}`);
		}
		return moved;
	}

	/** Rename a note, file or folder in place. Keeps the extension. Returns the new path, or null. */
	async rename(path: string, name: string): Promise<string | null> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!f) return null;
		const ext = f instanceof TFile ? `.${f.extension}` : '';
		const to = normalizePath(joinPath(parentOf(f.path), safeName(name.replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '')) + ext));
		if (to === f.path) return to;
		if (this.app.vault.getAbstractFileByPath(to)) { new Notice(`"${to.replace(/^.*\//, '')}" already exists here.`); return null; }
		await this.app.fileManager.renameFile(f, to);
		this.rebuild();
		return to;
	}

	/** Rename a chapter: its folder, and its home note too when the two share a name. */
	async renameChapter(ch: Chapter, name: string): Promise<void> {
		const oldName = ch.folder.replace(/^.*\//, '');
		const homeName = ch.home.path.replace(/^.*\//, '').replace(/\.md$/, '');
		const folder = await this.rename(ch.folder, name);
		if (!folder || homeName !== oldName) return;
		await this.rename(`${folder}/${homeName}.md`, name);
	}

	/** Move to Obsidian's trash (it follows the user's "Deleted files" setting). */
	async trash(path: string): Promise<void> {
		const f: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
		if (!f) return;
		await this.app.fileManager.trashFile(f);
		this.rebuild();
	}

	/** Copy files picked from the device into a folder. Returns the new paths. */
	async importFiles(folder: string, files: File[]): Promise<string[]> {
		await this.ensureFolder(folder);
		const out: string[] = [];
		for (const file of files) {
			const path = this.available(joinPath(folder, safeName(file.name)));
			await this.app.vault.createBinary(path, await file.arrayBuffer());
			out.push(path);
		}
		this.rebuild();
		if (out.length) new Notice(out.length === 1 ? `Added ${out[0].replace(/^.*\//, '')}` : `Added ${out.length} files`);
		return out;
	}

	/** "Session 4" when there are three already. */
	nextSessionName(c: Campaign): string {
		const sec = c.sections.find(s => s.name === SECTION_FOR.session);
		const n = (sec?.notes.filter(x => x.kind === 'session').length ?? 0) + 1;
		return `Session ${n}`;
	}
}
