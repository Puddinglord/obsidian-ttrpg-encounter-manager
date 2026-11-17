// The content packs in the vault: every .json file in the content folder
// (Ember Vault/Content by default), read and checked against its game
// system's kinds, kept up to date as files change. Systems ask for the packs
// a note's campaign uses (`packs:` on its home note) and put them on top of
// what they ship; a note in the vault still beats a pack.

import { debounce, Events, normalizePath, TAbstractFile, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { KindsFor, LoadedPack, packsEnabled, readPack } from './packs';

export const DEFAULT_CONTENT_FOLDER = 'Ember Vault/Content';

export class ContentStore extends Events {
	private packs = new Map<string, LoadedPack>();

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

	/** Every pack in the folder, with what was left out and why. */
	all(): LoadedPack[] {
		return [...this.packs.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	/** The packs for a system that a note's campaign (else the active one) uses. */
	enabled(system: string, path?: string): LoadedPack[] {
		const mine = this.all().filter(p => !p.error && p.system === system);
		const camp = (path ? this.plugin.campaigns.of(path) : undefined) ?? this.plugin.campaigns.active;
		const home = camp && this.plugin.app.vault.getFileByPath(camp.home.path);
		const setting: unknown = home ? (this.plugin.app.metadataCache.getFileCache(home)?.frontmatter)?.packs : undefined;
		return packsEnabled(setting, mine);
	}

	private inFolder(f: TAbstractFile): f is TFile {
		return f instanceof TFile && f.extension.toLowerCase() === 'json' && (f.path.startsWith(`${this.folder()}/`));
	}

	async load(): Promise<void> {
		this.packs.clear();
		const files = this.plugin.app.vault.getFiles().filter(f => this.inFolder(f));
		await Promise.all(files.map(f => this.read(f, false)));
		this.trigger('changed');
	}

	private async read(f: TFile, notify = true): Promise<void> {
		try {
			this.packs.set(f.path, readPack(await this.plugin.app.vault.cachedRead(f), f.path, this.kindsFor));
		} catch (e) {
			console.error('Ember Vault: could not read a content pack', f.path, e);
		}
		if (notify) this.trigger('changed');
	}

	/** Load now, and keep up with files added, changed, moved or removed. */
	register(): void {
		const plugin = this.plugin;
		plugin.app.workspace.onLayoutReady(() => {
			void this.load();
			const reread = debounce((f: TFile) => { void this.read(f); }, 250, true);
			plugin.registerEvent(plugin.app.vault.on('modify', f => { if (this.inFolder(f)) reread(f); }));
			plugin.registerEvent(plugin.app.vault.on('create', f => { if (this.inFolder(f)) void this.read(f); }));
			plugin.registerEvent(plugin.app.vault.on('delete', f => { if (this.packs.delete(f.path)) this.trigger('changed'); }));
			plugin.registerEvent(plugin.app.vault.on('rename', (f, old) => {
				const had = this.packs.delete(old);
				if (this.inFolder(f)) void this.read(f); else if (had) this.trigger('changed');
			}));
		});
		// A campaign turning packs on or off changes what its notes see.
		plugin.registerEvent(plugin.app.metadataCache.on('changed', (f, _d, cache) => {
			if (cache.frontmatter && 'packs' in cache.frontmatter && plugin.campaigns.campaigns.some(c => c.home.path === f.path)) this.trigger('changed');
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
