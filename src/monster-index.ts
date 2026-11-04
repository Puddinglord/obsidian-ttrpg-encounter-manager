// Vault-wide index of every monster defined in a ```nimble block.

import { App, Events, TFile } from 'obsidian';
import { MonsterIndexEntry, NimbleMonster } from './types';
import { extractNimbleBlocks, parseStatblock } from './parser';

export class MonsterIndex extends Events {
	/** name (lowercase) -> every definition, in discovery order. */
	private byName = new Map<string, MonsterIndexEntry[]>();
	/** file path -> lowercase names defined there. */
	private byFile = new Map<string, string[]>();
	ready = false;

	constructor(private app: App) {
		super();
	}

	async build(): Promise<void> {
		this.byName.clear();
		this.byFile.clear();
		const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
		await Promise.all(files.map(f => this.indexFile(f, false)));
		this.ready = true;
		this.trigger('changed');
	}

	get(name: string): MonsterIndexEntry | undefined {
		return this.byName.get(name.trim().toLowerCase())?.[0];
	}

	all(): MonsterIndexEntry[] {
		return [...this.byName.values()].map(list => list[0]).sort((a, b) => a.name.localeCompare(b.name));
	}

	get size(): number {
		return this.byName.size;
	}

	async update(file: TFile): Promise<void> {
		const before = this.snapshot(file.path);
		const gen = this.bump(file.path);
		const parsed = await this.parseFile(file);
		// A newer update or a delete happened while we were reading: drop this result.
		if (gen !== this.generation.get(file.path)) return;
		this.remove(file.path, false);
		this.store(file.path, parsed);
		// Saving a note fires 'modify' constantly; only notify when monsters changed.
		if (this.snapshot(file.path) !== before) this.trigger('changed');
	}

	remove(path: string, notify = true): void {
		if (notify) this.bump(path); // cancels any in-flight update of this path
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

	private generation = new Map<string, number>();

	private bump(path: string): number {
		const next = (this.generation.get(path) ?? 0) + 1;
		this.generation.set(path, next);
		return next;
	}

	private snapshot(path: string): string {
		const names = this.byFile.get(path) ?? [];
		return JSON.stringify(names.map(n => this.byName.get(n)?.find(e => e.filePath === path)?.monster ?? null));
	}

	private async indexFile(file: TFile, notify: boolean): Promise<void> {
		const gen = this.bump(file.path);
		const parsed = await this.parseFile(file);
		if (gen !== this.generation.get(file.path)) return;
		this.store(file.path, parsed);
		if (notify && parsed.length) this.trigger('changed');
	}

	private async parseFile(file: TFile): Promise<NimbleMonster[]> {
		if (file.extension !== 'md') return [];
		try {
			const content = await this.app.vault.cachedRead(file);
			if (!/nimble/i.test(content)) return [];
			const monsters: NimbleMonster[] = [];
			for (const body of extractNimbleBlocks(content)) {
				const monster = parseStatblock(body);
				if (monster?.name) monsters.push(monster);
			}
			return monsters;
		} catch (e) {
			console.error(`Nimble Statblocks: error indexing ${file.path}`, e);
			return [];
		}
	}

	private store(path: string, monsters: NimbleMonster[]): void {
		const names: string[] = [];
		for (const monster of monsters) {
			const key = monster.name.toLowerCase();
			const list = this.byName.get(key) || [];
			list.push({ name: monster.name, filePath: path, monster });
			list.sort((a, b) => a.filePath.localeCompare(b.filePath));
			this.byName.set(key, list);
			names.push(key);
		}
		if (names.length) this.byFile.set(path, names);
	}
}
