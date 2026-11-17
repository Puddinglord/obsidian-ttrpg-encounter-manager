// A live index of named things written in fenced blocks across the vault (a
// system's stat blocks): parse every note once, then keep up as notes change.
// The first definition of a name (by path) wins; campaigns can be kept apart
// with setScope. What the blocks are and how to read them is the caller's.

import { App, Events, TFile } from 'obsidian';

export interface BlockEntry<T> {
	name: string;
	/** The note it's written in. */
	filePath: string;
	item: T;
}

export interface BlockIndexOptions<T> {
	/** Cheap test: notes that don't match can't have the blocks, so they aren't parsed. */
	mentions: RegExp;
	/** The bodies of the blocks in a note. */
	extract: (content: string) => string[];
	/** One block → a thing with a name, or null to skip it. */
	parse: (body: string) => T | null;
}

export class BlockIndex<T extends { name: string }> extends Events {
	/** name (lowercase) → every definition, sorted by path. */
	private byName = new Map<string, BlockEntry<T>[]>();
	/** file path → lowercase names defined there. */
	private byFile = new Map<string, string[]>();
	private generation = new Map<string, number>();
	ready = false;
	/** Can a lookup from `from` (a note path, or none) see a thing defined in `filePath`? */
	private visible: (filePath: string, from?: string) => boolean = () => true;

	constructor(private app: App, private opts: BlockIndexOptions<T>) {
		super();
	}

	setScope(fn: (filePath: string, from?: string) => boolean): void {
		this.visible = fn;
		this.trigger('changed');
	}

	async build(): Promise<void> {
		this.byName.clear();
		this.byFile.clear();
		const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
		await Promise.all(files.map(async (f) => {
			const gen = this.bump(f.path);
			const items = await this.parseFile(f);
			if (gen === this.generation.get(f.path)) this.store(f.path, items);
		}));
		this.ready = true;
		this.trigger('changed');
	}

	/** The first definition of a name that `from` can see. */
	get(name: string, from?: string): BlockEntry<T> | undefined {
		return this.byName.get(name.trim().toLowerCase())?.find(e => this.visible(e.filePath, from));
	}

	/** Everything `from` can see, one per name, by name. */
	all(from?: string): BlockEntry<T>[] {
		return [...this.byName.values()].map(list => list.find(e => this.visible(e.filePath, from))).filter((e): e is BlockEntry<T> => !!e).sort((a, b) => a.name.localeCompare(b.name));
	}

	async update(file: TFile): Promise<void> {
		const before = this.snapshot(file.path);
		const gen = this.bump(file.path);
		const items = await this.parseFile(file);
		// A newer update or a delete happened while we were reading: drop this result.
		if (gen !== this.generation.get(file.path)) return;
		this.remove(file.path, false);
		this.store(file.path, items);
		// Saving a note fires 'modify' constantly; only notify when what it defines changed.
		if (this.snapshot(file.path) !== before) this.trigger('changed');
	}

	remove(path: string, notify = true): void {
		if (notify) this.bump(path);
		const names = this.byFile.get(path);
		if (!names) return;
		for (const key of names) {
			const remaining = (this.byName.get(key) || []).filter(e => e.filePath !== path);
			if (remaining.length) this.byName.set(key, remaining);
			else this.byName.delete(key);
		}
		this.byFile.delete(path);
		if (notify) this.trigger('changed');
	}

	private bump(path: string): number {
		const next = (this.generation.get(path) ?? 0) + 1;
		this.generation.set(path, next);
		return next;
	}

	private snapshot(path: string): string {
		return JSON.stringify((this.byFile.get(path) ?? []).map(n => this.byName.get(n)?.find(e => e.filePath === path)?.item ?? null));
	}

	private async parseFile(file: TFile): Promise<T[]> {
		if (file.extension !== 'md') return [];
		try {
			const content = await this.app.vault.cachedRead(file);
			if (!this.opts.mentions.test(content)) return [];
			return this.opts.extract(content).map(this.opts.parse).filter((x): x is T => !!x?.name);
		} catch (e) {
			console.error(`Ember Vault: error indexing ${file.path}`, e);
			return [];
		}
	}

	private store(path: string, items: T[]): void {
		const names: string[] = [];
		for (const item of items) {
			const key = item.name.toLowerCase();
			const list = this.byName.get(key) || [];
			list.push({ name: item.name, filePath: path, item });
			list.sort((a, b) => a.filePath.localeCompare(b.filePath));
			this.byName.set(key, list);
			names.push(key);
		}
		if (names.length) this.byFile.set(path, names);
	}
}
