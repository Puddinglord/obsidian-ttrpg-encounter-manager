// Live campaign index for the vault, plus the active campaign. The active
// campaign follows the note you open, and each campaign keeps its own party.

import { fieldDefaults, SHARED_NOTE_KINDS, SharedNoteKind } from './note-kinds';
import { debounce, Events, normalizePath, Notice, TAbstractFile, TFile, TFolder } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import {
	adjacentScene, buildCampaigns, Campaign, campaignOf, CampaignRole, fmTrue, canMoveInto, Chapter, chapterOf, fmText, homeFolderFor, isPlayable, joinPath, nextOrder, NoteInfo, noteKind, parentOf, safeName,
} from './campaign-model';
import {
	blankNote, campaignHome, chapterHome, characterNote, handoutNote, locationNote, mapNote, monsterNote, npcNote, playerCampaignHome, questNote, sceneNote, sessionNote, StarterKind,
} from './campaign-templates';

export type NewNoteKind = 'scene' | 'npc' | 'location' | 'quest' | 'session';

export const SECTION_FOR: Record<Exclude<NewNoteKind, 'scene'>, string> = { npc: 'NPCs', location: 'Locations', quest: 'Quests', session: 'Sessions' };

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

/** A hero in a campaign you play in: a note with `nimble: character`. */
export interface CharacterInfo {
	path: string;
	name: string;
	/** `mine: true`: the hero you play. */
	mine: boolean;
	player?: string;
	ancestry?: string;
	className?: string;
	level?: number;
	hp?: number;
	hpMax?: number;
}

const numOf = (v: unknown): number | undefined => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
};
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export class CampaignStore extends Events {
	campaigns: Campaign[] = [];
	npcs: NpcInfo[] = [];
	/** Each campaign's side at the last rebuild, to notice a hand-edited `role:`. */
	private lastRoles = new Map<string, CampaignRole>();
	private ready = false;

	constructor(private plugin: EmberVaultPlugin) {
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
		// A campaign's side changed (say role: was edited by hand in Properties): redraw what depends on it.
		const roles = new Map(this.campaigns.map(c => [c.folder, c.role]));
		const flipped = this.ready && [...roles].some(([f, r]) => this.lastRoles.has(f) && this.lastRoles.get(f) !== r);
		this.lastRoles = roles;
		if (flipped) window.setTimeout(() => this.plugin.refreshSide(), 0);
		this.npcs = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
			const tags = [...list(fm.tags), ...(cache?.tags?.map(t => t.tag) ?? [])];
			if (!isNpc(fm, tags)) continue;
			this.npcs.push({
				path: f.path,
				name: f.basename,
				// A `title:` (the name as typed, when the file name couldn't hold it) is linked like an alias.
				aliases: [...list(fm.aliases ?? fm.alias), ...(typeof fm.title === 'string' && fm.title.trim() && fm.title.trim() !== f.basename ? [fm.title.trim()] : [])],
				role: typeof fm.role === 'string' && fm.role ? fm.role : undefined,
				campaign: campaignOf(this.campaigns, f.path)?.folder,
			});
		}
		this.ready = true;
		// A campaign that no longer exists stops being active. One whose folder is
		// still there is only unreadable for a moment (its home note's properties are
		// mid-edit, or not indexed yet), so it's left alone rather than swapping the party.
		if (this.s.activeCampaign && !this.campaigns.some(c => c.folder === this.s.activeCampaign)) {
			if (!this.app.vault.getFolderByPath(this.s.activeCampaign)) void this.setActive(this.campaigns[0]?.folder ?? null);
		} else if (!this.s.activeCampaign && this.campaigns.length === 1) {
			void this.setActive(this.campaigns[0].folder);
		}
		this.trigger('changed');
	}

	get active(): Campaign | undefined {
		return this.campaigns.find(c => c.folder === this.s.activeCampaign);
	}

	of(path: string): Campaign | undefined { return campaignOf(this.campaigns, path); }

	/**
	 * Which side the plugin should show for a note: its campaign's, or for a note
	 * outside any campaign (and for views with no note) the active campaign's.
	 */
	role(path?: string): CampaignRole {
		return (path ? this.of(path) : undefined)?.role ?? this.active?.role ?? 'gm';
	}

	/** Switch a campaign between running it and playing in it. Only `role:` on its home note changes. */
	async setRole(c: Campaign, role: CampaignRole): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(c.home.path);
		if (!(f instanceof TFile)) return;
		await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
			if (role === 'player') fm.role = 'player';
			else delete fm.role;
		});
		c.role = role; // the metadata cache catches up a moment later
		this.lastRoles.set(c.folder, role);
		this.plugin.refreshSide();
		this.trigger('changed');
	}

	/** Update a campaign home note's properties (title, level, gm…). Empty values are removed. */
	async setDetails(c: Campaign, values: Record<string, string | number | undefined>): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(c.home.path);
		if (!(f instanceof TFile)) return;
		await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(values)) {
				if (v === undefined || v === '') delete fm[k];
				else fm[k] = v;
			}
		});
		this.rebuildSoon();
	}
	chapterOf(path: string): Chapter | undefined { const c = this.of(path); return c && chapterOf(c, path); }

	/** The heroes in a campaign: every character note in its folder, yours first. */
	characters(c: Campaign): CharacterInfo[] {
		const out: CharacterInfo[] = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (!f.path.startsWith(c.folder + '/') || this.of(f.path) !== c) continue;
			const fm = (this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
			if (noteKind(fm) !== 'character') continue;
			out.push({
				path: f.path,
				name: textOf(fm.title) ?? f.basename,
				mine: fmTrue(fm.mine),
				player: textOf(fm.player),
				// Nimble says ancestry; 5e says species (race in 2014 notes).
				ancestry: textOf(fm.ancestry) ?? textOf(fm.species) ?? textOf(fm.race),
				className: textOf(fm.class),
				level: numOf(fm.level),
				hp: numOf(fm.hp),
				hpMax: numOf(fm.hp_max),
			});
		}
		return out.sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, undefined, { numeric: true }));
	}

	/** The hero you play in `c` (the active campaign by default). */
	myCharacter(c = this.active): CharacterInfo | undefined {
		return c ? this.characters(c).find(h => h.mine) : undefined;
	}

	/** Flag `path` as your hero in its campaign; any other hero there loses the flag. */
	async setMine(c: Campaign, path: string): Promise<void> {
		const write = async (p: string, mine: boolean) => {
			const f = this.app.vault.getFileByPath(p);
			if (f) await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => { if (mine) fm.mine = true; else delete fm.mine; });
		};
		// The new hero may be too new for the metadata cache, so it's written directly.
		await write(path, true);
		for (const h of this.characters(c)) if (h.mine && h.path !== path) await write(h.path, false);
		this.rebuildSoon();
	}

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
		// Each game's fight belongs to the campaign it was run in: put it away, and bring back the next one's.
		const games: Record<string, unknown> = {};
		for (const sys of this.plugin.systems.all()) if (sys.campaignState) games[sys.id] = sys.campaignState.take(this.plugin);
		if (prev) store[prev] = { ...(store[prev] ?? {}), party: this.s.party, games };
		else { this.s.looseParty = this.s.party; this.s.looseGames = games; }
		this.s.party = (folder ? store[folder]?.party : this.s.looseParty) ?? [];
		this.s.activeCampaign = folder;
		const next = (folder ? store[folder]?.games : this.s.looseGames) ?? {};
		for (const sys of this.plugin.systems.all()) sys.campaignState?.put(this.plugin, next[sys.id]);
		await this.plugin.saveSettings();
		// Systems follow the new campaign (Nimble reloads its bundled bestiary for the campaign's books).
		this.plugin.events.trigger('active-campaign-changed', folder);
		this.plugin.events.trigger('party-changed');
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
		if (ch && ch.scenes.some(s => s.path === file.path && isPlayable(s))) {
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

	/**
	 * `path`, or `path` with " 2", " 3"… before the extension if it's taken
	 * (ignoring case, as most file systems Obsidian runs on do). For every new
	 * note or folder the plugin names: campaign notes, character sheets, creature notes.
	 */
	available(path: string, folder = false): string {
		const p = normalizePath(path);
		const slash = p.lastIndexOf('/');
		const dot = p.lastIndexOf('.');
		const hasExt = !folder && dot > slash + 1;
		const base = hasExt ? p.slice(0, dot) : p;
		const ext = hasExt ? p.slice(dot) : '';
		// Most file systems Obsidian runs on ignore case, so "marta.md" clashes with "Marta.md".
		const siblings = new Set((this.app.vault.getFolderByPath(parentOf(p)) ?? this.app.vault.getRoot()).children.map(c => c.path.toLowerCase()));
		const taken = (x: string) => !!this.app.vault.getAbstractFileByPath(x) || siblings.has(x.toLowerCase());
		let out = p;
		for (let i = 2; taken(out); i++) out = `${base} ${i}${ext}`;
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

	async createCampaign(opts: { name: string; level: number; heroes: number; starter: boolean; firstChapter?: string; role?: CampaignRole; gm?: string; character?: string; system?: string; edition?: string }): Promise<TFile> {
		const name = safeName(opts.name);
		const root = normalizePath(this.s.campaignsFolder || 'Campaigns');
		let folder = `${root}/${name}`;
		for (let i = 2; this.app.vault.getAbstractFileByPath(folder); i++) folder = `${root}/${name} ${i}`;
		await this.ensureFolder(folder);
		const player = opts.role === 'player';
		const title = opts.name.trim() || name;
		const hero = opts.character?.trim();
		const home = await this.createNote(`${folder}/${name}.md`, player
			? playerCampaignHome(title, { gm: opts.gm?.trim() || undefined, level: opts.level, character: hero }, opts.system ?? this.plugin.systems.default.name, opts.edition)
			: campaignHome(title, opts.level, opts.heroes, opts.system ?? this.plugin.systems.default.name, opts.edition));
		if (opts.starter) {
			const subs = player ? ['Party', 'Sessions', 'Quests', 'NPCs', 'Locations', 'Assets'] : ['Party', 'Quests', 'NPCs', 'Locations', 'Sessions', 'Monsters', 'Assets'];
			for (const sub of subs) await this.ensureFolder(`${folder}/${sub}`);
			const ch = safeName(opts.firstChapter || 'Chapter 1');
			await this.createNote(`${folder}/${ch}/${ch}.md`, chapterHome(opts.firstChapter || 'Chapter 1', 1, undefined, player ? undefined : opts.level));
			if (!player) await this.createNote(`${folder}/${ch}/Opening Scene.md`, sceneNote('Opening Scene', 1));
		}
		if (player && hero) await this.createNote(`${folder}/Party/${safeName(hero)}.md`, characterNote(hero, { mine: true, level: opts.level }));
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
		// The campaign's folder for this kind, even if it's been renamed (NPCs to Characters, say).
		return this.createStarter(homeFolderFor(c, kind, c.folder), kind, name);
	}

	/**
	 * A new note from a starter, in any folder. Scenes in a chapter go to the end
	 * of it; a map can start with its image already set.
	 */
	async createStarter(folder: string, kind: StarterKind, name: string, opts: { image?: string; mine?: boolean } = {}): Promise<TFile> {
		const path = this.available(`${joinPath(folder, safeName(name))}.md`);
		const c = this.of(path);
		const ch = c && chapterOf(c, path);
		const side = c?.role ?? this.role();
		// What the campaign's game system adds to this kind of note.
		const ext = (SHARED_NOTE_KINDS as readonly string[]).includes(kind) ? this.plugin.system(path).noteKinds?.[kind as SharedNoteKind] : undefined;
		// Quests, places and sessions always open on core's card; other kinds when the game draws one.
		const x = { fields: fieldDefaults(ext?.fields, side), card: kind !== 'npc' && (kind === 'quest' || kind === 'location' || kind === 'session' || !!ext?.card) };
		let body: string;
		switch (kind) {
			case 'scene': body = sceneNote(name, nextOrder(ch?.scenes ?? [])); break;
			case 'npc': body = npcNote(name, side, x); break;
			case 'location': body = locationNote(name, side, x); break;
			case 'quest': body = questNote(name, side, x); break;
			// The campaign's game writes the block, so its own bestiary reads the note (a 5e campaign gets a ```5e block).
			case 'monster': body = monsterNote(name, this.plugin.system(path).monsterStarter?.(name.replace(/[\r\n]+/g, ' ').trim() || 'Monster', this.plugin.edition(path))); break;
			case 'handout': body = handoutNote(name, side); break;
			case 'character': body = characterNote(name, { level: c?.level, mine: opts.mine }); break;
			case 'session': {
				const last = c && this.lastScene(c);
				// Who was at the table: the party's sheets as links, else the party as typed in.
				const sheets = c ? this.characters(c) : [];
				const party = sheets.length
					? sheets.map(h => `[[${h.path.replace(/^.*\//, '').replace(/\.md$/i, '')}]]`)
					: (c && this.active === c ? this.plugin.settings.party.map(p => p.name).filter(Boolean) : []);
				body = sessionNote(name, new Date().toISOString().slice(0, 10), last?.replace(/^.*\//, '').replace(/\.md$/, ''), side, { ...x, party });
				break;
			}
			case 'map': {
				const img = opts.image ? this.app.vault.getAbstractFileByPath(opts.image) : null;
				body = mapNote(name, img instanceof TFile ? this.app.metadataCache.fileToLinktext(img, path, false) : undefined, x);
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
			const wasInChapter = !!this.chapterOf(p);
			await this.app.fileManager.renameFile(f, to);
			if (f instanceof TFile && f.extension === 'md') {
				const fmNow = this.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
				const kind = noteKind(fmNow);
				if (ch && (kind === 'scene' || kind === 'note')) {
					// A scene (or plain note) joins the end of the chapter. NPCs, handouts and maps kept in a chapter aren't numbered.
					const n = order++;
					await this.app.fileManager.processFrontMatter(f, (fmData: Record<string, unknown>) => { fmData.order = n; });
				} else if (!ch && wasInChapter && fmNow.order !== undefined && !(c && chapterOf(c, to))) {
					// Leaving a chapter for a folder: drop its place in the chapter, or it would sort above everything there.
					await this.app.fileManager.processFrontMatter(f, (fmData: Record<string, unknown>) => { delete fmData.order; });
				}
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
		const folder = homeFolderFor(c, 'session', c.folder);
		const sec = c.sections.find(s => s.folder === folder);
		const n = (sec?.notes.filter(x => x.kind === 'session').length ?? 0) + 1;
		return `Session ${n}`;
	}
}
