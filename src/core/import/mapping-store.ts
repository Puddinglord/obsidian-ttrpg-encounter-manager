// The mapping files Import… can use: the ones Ember Vault ships, and the ones
// in <content folder>/Importers/ (re-read when they change). A file of yours
// with the same id as a shipped one replaces it. Each file's problems are kept
// for the settings page, so a broken mapping says why instead of doing nothing.

import { Events, TAbstractFile, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { IMPORTERS_FOLDER } from '../content/store';
import type { Importer } from './importer';
import { Mapping, mappingImporter, readMapping } from './mapping';
import { SHIPPED_MAPPINGS } from './mappings';

export interface MappingReport {
	/** The file, for one of yours; undefined for a shipped one. */
	file?: string;
	id?: string;
	label?: string;
	errors: string[];
}

export class MappingStore extends Events {
	private shipped: Mapping[] = [];
	private mine = new Map<string, { mapping?: Mapping; errors: string[] }>();

	constructor(private plugin: EmberVaultPlugin) {
		super();
		for (const raw of SHIPPED_MAPPINGS) {
			const r = readMapping(raw);
			if (r.mapping) this.shipped.push(r.mapping);
			else console.error('Ember Vault: a shipped mapping is broken', r.errors);
		}
	}

	/** The folder people's mapping files go in. */
	folder(): string {
		return `${this.plugin.content.folder()}/${IMPORTERS_FOLDER}`;
	}

	private ours(f: TAbstractFile): f is TFile {
		return f instanceof TFile && f.path.startsWith(`${this.folder()}/`) && f.extension.toLowerCase() === 'json';
	}

	/** Every mapping in use: yours over shipped ones of the same id. */
	mappings(): Mapping[] {
		const yours = [...this.mine.values()].flatMap(m => (m.mapping ? [m.mapping] : []));
		const ids = new Set(yours.map(m => m.id));
		return [...yours, ...this.shipped.filter(m => !ids.has(m.id))];
	}

	importers(): Importer[] {
		return this.mappings().map(mappingImporter);
	}

	/** Your mapping files, each with what's wrong with it. */
	reports(): MappingReport[] {
		return [...this.mine].map(([file, m]) => ({ file, id: m.mapping?.id, label: m.mapping?.label, errors: m.errors }));
	}

	async load(): Promise<void> {
		this.mine.clear();
		for (const f of this.plugin.app.vault.getFiles().filter(x => this.ours(x))) await this.read(f, false);
		this.trigger('changed');
	}

	private async read(f: TFile, notify = true): Promise<void> {
		let raw: unknown;
		try {
			raw = JSON.parse(await this.plugin.app.vault.cachedRead(f)) as unknown;
		} catch {
			this.mine.set(f.path, { errors: ['This isn\'t JSON Ember Vault can read. Check for a missing comma or quote.'] });
			if (notify) this.trigger('changed');
			return;
		}
		const r = readMapping(raw);
		this.mine.set(f.path, r);
		if (notify) this.trigger('changed');
	}

	register(): void {
		const plugin = this.plugin;
		plugin.app.workspace.onLayoutReady(() => {
			void this.load();
			plugin.registerEvent(plugin.app.vault.on('modify', f => { if (this.ours(f)) void this.read(f); }));
			plugin.registerEvent(plugin.app.vault.on('create', f => { if (this.ours(f)) void this.read(f); }));
			plugin.registerEvent(plugin.app.vault.on('delete', f => { if (this.mine.delete(f.path)) this.trigger('changed'); }));
			plugin.registerEvent(plugin.app.vault.on('rename', (f, old) => {
				const had = this.mine.delete(old);
				if (this.ours(f)) void this.read(f); else if (had) this.trigger('changed');
			}));
		});
	}
}
