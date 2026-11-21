// The content in the vault's content folder (Ember Vault/Content by default):
// every .json file there is a content pack, read and checked against its game
// system's kinds; every note there with a game's content blocks (```5e-class,
// ```nimble-ancestry…, blocks.ts) is homebrew. Both are kept up to date as
// files change. Systems ask for what a note's campaign uses (`packs:` on its
// home note) and put it on top of what they ship: the packs, then the
// homebrew (one more pack, named Homebrew), so a note beats a pack.

import { Events, normalizePath, TAbstractFile, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { blockLang, HOMEBREW, readContentNote } from './blocks';
import { KindsFor, LoadedPack, PackEntry, PackNote, packsEnabled, readPack } from './packs';
import type { KindSpec } from './spec';

export const DEFAULT_CONTENT_FOLDER = 'Ember Vault/Content';

/** What one note in the content folder adds, by game. */
interface NoteContent { system: string; entries: PackEntry[]; rejected: PackNote[]; warnings: PackNote[] }

export class ContentStore extends Events {
	private packs = new Map<string, LoadedPack>();
	/** Note path → what its blocks add, per game. */
	private notes = new Map<string, NoteContent[]>();
	/** The Homebrew pack each game and campaign sees, built on first ask, forgotten when a note changes. */
	private homebrewCache = new Map<string, LoadedPack | null>();
	private timers = new Map<string, number>();

	constructor(private plugin: EmberVaultPlugin) {
		super();
	}

	folder(): string {
		return normalizePath(this.plugin.settings.contentFolder?.trim() || DEFAULT_CONTENT_FOLDER);
	}

	/** What a system (by any of its names) takes in packs. */
	readonly kindsFor: KindsFor = (name) => {
		const sys = this.plugin.systems.get(name);
		if (!sys) return null;
		if (!sys.content) return 'no-packs';
		return { id: sys.id, name: sys.name, kinds: sys.content.kinds, editions: sys.editions?.map(e => e.id) };
	};

	/** Every game's block languages ("5e-class"), with the game and the kind. */
	blockKinds(): Map<string, { system: string; kind: KindSpec }> {
		const out = new Map<string, { system: string; kind: KindSpec }>();
		for (const sys of this.plugin.systems.all()) {
			const b = sys.content?.blocks;
			if (!b) continue;
			for (const k of b.kinds) {
				const kind = sys.content.kinds.find(x => x.kind === k);
				if (kind) out.set(blockLang(b.prefix, k), { system: sys.id, kind });
			}
		}
		return out;
	}

	/** Every pack in the folder, with what was left out and why. */
	all(): LoadedPack[] {
		return [...this.packs.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * What a system's content a note's campaign (else the active one) uses: its packs, then the content
	 * folder's notes as the Homebrew pack, last, so they win a name. `packs:` on the campaign's home note
	 * picks them (Homebrew by that name).
	 */
	enabled(system: string, path?: string): LoadedPack[] {
		const camp = (path ? this.plugin.campaigns.of(path) : undefined) ?? this.plugin.campaigns.active;
		const mine = this.all().filter(p => !p.error && p.system === system);
		const brew = this.homebrew(system, camp?.folder);
		const home = camp && this.plugin.app.vault.getFileByPath(camp.home.path);
		const setting: unknown = home ? (this.plugin.app.metadataCache.getFileCache(home)?.frontmatter)?.packs : undefined;
		return packsEnabled(setting, brew ? [...mine, brew] : mine);
	}

	/**
	 * A game's homebrew as one pack: the entries of every note in the content folder that a campaign can see
	 * (a note inside a campaign's folder is that campaign's alone). The same object until a note changes.
	 */
	homebrew(system: string, campaignFolder?: string): LoadedPack | null {
		const key = `${system}|${campaignFolder ?? ''}`;
		if (this.homebrewCache.has(key)) return this.homebrewCache.get(key) ?? null;
		const pack: LoadedPack = { path: `${this.folder()}#${HOMEBREW}${campaignFolder ? `/${campaignFolder}` : ''}`, name: HOMEBREW, system, entries: [], rejected: [], warnings: [], homebrew: true };
		// By path, so the first note wins a name, as with every other note.
		for (const path of [...this.notes.keys()].sort()) {
			const at = this.plugin.campaigns.of(path)?.folder;
			if (at && at !== campaignFolder) continue;
			for (const n of this.notes.get(path) ?? []) {
				if (n.system !== system) continue;
				const taken = new Set(pack.entries.map(e => `${e.kind}:${e.name.toLowerCase()}`));
				pack.entries.push(...n.entries.filter(e => !taken.has(`${e.kind}:${e.name.toLowerCase()}`)));
				pack.rejected.push(...n.rejected);
				pack.warnings.push(...n.warnings);
			}
		}
		const out = pack.entries.length ? pack : null;
		this.homebrewCache.set(key, out);
		return out;
	}

	/** Is this a file the store reads: a pack or a note in the content folder? */
	private inFolder(f: TAbstractFile): f is TFile {
		return f instanceof TFile && f.path.startsWith(`${this.folder()}/`) && /^(json|md)$/i.test(f.extension);
	}

	async load(): Promise<void> {
		this.packs.clear();
		this.notes.clear();
		this.homebrewCache.clear();
		const files = this.plugin.app.vault.getFiles().filter(f => this.inFolder(f));
		await Promise.all(files.map(f => this.read(f, false)));
		this.trigger('changed');
	}

	private async read(f: TFile, notify = true): Promise<void> {
		try {
			const text = await this.plugin.app.vault.cachedRead(f);
			if (f.extension.toLowerCase() === 'json') this.packs.set(f.path, readPack(text, f.path, this.kindsFor));
			else {
				const before = JSON.stringify(this.notes.get(f.path) ?? null);
				this.readNote(f.path, text);
				// Saving a note fires 'modify' constantly; only say so when what it adds changed.
				if (JSON.stringify(this.notes.get(f.path) ?? null) === before) return;
				this.homebrewCache.clear();
			}
		} catch (e) {
			console.error('Ember Vault: could not read content', f.path, e);
		}
		if (notify) this.trigger('changed');
	}

	private readNote(path: string, text: string): void {
		const langs = this.blockKinds();
		const bySystem = new Map<string, Map<string, KindSpec>>();
		for (const [lang, { system, kind }] of langs) {
			if (!text.includes(lang)) continue;
			if (!bySystem.has(system)) bySystem.set(system, new Map());
			bySystem.get(system)!.set(lang, kind);
		}
		const out: NoteContent[] = [];
		for (const [system, kinds] of bySystem) {
			const c = readContentNote(text, path, kinds);
			if (c.entries.length || c.rejected.length) out.push({ system, ...c });
		}
		if (out.length) this.notes.set(path, out); else this.notes.delete(path);
	}

	/** A note is read a moment after typing stops; a pack straight away. */
	private soon(f: TFile): void {
		window.clearTimeout(this.timers.get(f.path));
		this.timers.set(f.path, window.setTimeout(() => { this.timers.delete(f.path); void this.read(f); }, 300));
	}

	private forget(path: string): boolean {
		const had = this.packs.delete(path) || this.notes.delete(path);
		if (had) this.homebrewCache.clear();
		return had;
	}

	/** Load now, and keep up with files added, changed, moved or removed. */
	register(): void {
		const plugin = this.plugin;
		plugin.app.workspace.onLayoutReady(() => {
			void this.load();
			plugin.registerEvent(plugin.app.vault.on('modify', f => { if (this.inFolder(f)) this.soon(f); }));
			plugin.registerEvent(plugin.app.vault.on('create', f => { if (this.inFolder(f)) void this.read(f); }));
			plugin.registerEvent(plugin.app.vault.on('delete', f => { if (this.forget(f.path)) this.trigger('changed'); }));
			plugin.registerEvent(plugin.app.vault.on('rename', (f, old) => {
				const had = this.forget(old);
				if (this.inFolder(f)) void this.read(f); else if (had) this.trigger('changed');
			}));
		});
		plugin.register(() => { for (const t of this.timers.values()) window.clearTimeout(t); });
		// A campaign turning packs on or off changes what its notes see; campaigns moving change whose homebrew is whose.
		plugin.registerEvent(plugin.app.metadataCache.on('changed', (f, _d, cache) => {
			if (cache.frontmatter && 'packs' in cache.frontmatter && plugin.campaigns.campaigns.some(c => c.home.path === f.path)) this.trigger('changed');
		}));
		let folders = '';
		plugin.registerEvent(plugin.campaigns.on('changed', () => {
			const next = plugin.campaigns.campaigns.map(c => c.folder).join('|');
			if (next === folders) return;
			folders = next;
			if (this.homebrewCache.size) { this.homebrewCache.clear(); this.trigger('changed'); }
		}));
	}

	/** Check a pack without saving it (Import content shows this first). */
	check(text: string, fileName: string): LoadedPack {
		return readPack(text, `${this.folder()}/${fileName}`, this.kindsFor);
	}

	/** Save a pack into the content folder (a new file; never over another). Returns its path. */
	async save(text: string, pack: LoadedPack): Promise<string> {
		const folder = this.folder();
		if (!this.plugin.app.vault.getFolderByPath(folder)) await this.plugin.app.vault.createFolder(folder);
		const safe = pack.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Content';
		let path = `${folder}/${safe}.json`;
		for (let i = 2; this.plugin.app.vault.getAbstractFileByPath(path); i++) path = `${folder}/${safe} ${i}.json`;
		await this.plugin.app.vault.create(path, text);
		return path;
	}
}
