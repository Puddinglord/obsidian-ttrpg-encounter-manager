// Index of every monster: those defined in ```nimble blocks across the vault,
// those in the content packs a campaign uses, and the Nimble bestiary bundled
// with the plugin. A vault note with the same name as a pack's or a bundled
// monster replaces it (that's how GMs customise one), and a pack's replaces the book's.
//
// Campaigns don't share monsters: a lookup from a note (or, with no note, the
// active campaign) only sees vault monsters its campaign may see (see `setScope`).
// The bundled bestiary is seen everywhere.

import { App, Events, TFile } from 'obsidian';
import { MonsterIndexEntry, NimbleMonster } from './types';
import { extractNimbleBlocks, parseStatblock } from './parser';
import { HomebrewItem, HomebrewSpell, ITEM_LANG, parseItemBlock, parseSpellBlock, SPELL_LANG } from './homebrew-def';

interface Parsed { monsters: NimbleMonster[]; spells: HomebrewSpell[]; items: HomebrewItem[] }

const NONE: ReadonlyMap<string, MonsterIndexEntry> = new Map();

export class MonsterIndex extends Events {
	/** name (lowercase) -> every definition, in discovery order. */
	private byName = new Map<string, MonsterIndexEntry[]>();
	/** file path -> lowercase names defined there. */
	private byFile = new Map<string, string[]>();
	ready = false;
	/** Bundled monsters, by lowercase name. */
	private bundled = new Map<string, MonsterIndexEntry>();
	private bundledById = new Map<string, MonsterIndexEntry>();
	/** file path -> the homebrew spells and items written there (```nimble-spell, ```nimble-item). */
	private brew = new Map<string, { spells: HomebrewSpell[]; items: HomebrewItem[] }>();

	/** Can a lookup from `from` (a note path, or none) see the monster defined in `filePath`? */
	private visible: (filePath: string, from?: string) => boolean = () => true;
	/** The content packs' monsters a lookup from `from` sees (its campaign's packs), by lowercase name. */
	private packs: (from?: string) => ReadonlyMap<string, MonsterIndexEntry> = () => NONE;

	constructor(private app: App) {
		super();
	}

	/** Which vault monsters each lookup can see (the plugin keeps campaigns apart with this). */
	setScope(fn: (filePath: string, from?: string) => boolean): void {
		this.visible = fn;
		this.trigger('changed');
	}

	/** The content packs' monsters each lookup sees (null: none). */
	setPacks(fn: ((from?: string) => ReadonlyMap<string, MonsterIndexEntry>) | null): void {
		this.packs = fn ?? (() => NONE);
		this.trigger('changed');
	}

	/** The first definition of a name that `from` can see. */
	private pick(list: MonsterIndexEntry[] | undefined, from?: string): MonsterIndexEntry | undefined {
		return list?.find(e => this.visible(e.filePath, from));
	}

	setBundled(entries: MonsterIndexEntry[]): void {
		this.bundled.clear();
		this.bundledById.clear();
		for (const e of entries) {
			const key = e.name.toLowerCase();
			if (!this.bundled.has(key)) this.bundled.set(key, e);
			if (e.monster.bundledId) this.bundledById.set(e.monster.bundledId, e);
		}
		this.trigger('changed');
	}

	/** A bundled monster by its stable id (even if a vault note overrides its name). */
	getBundled(id: string): MonsterIndexEntry | undefined {
		return this.bundledById.get(id);
	}

	get bundledCount(): number {
		return this.bundled.size;
	}

	/** Every homebrew spell and item in the vault, by note path (so the first note wins a name clash). */
	homebrew(): { spells: HomebrewSpell[]; items: HomebrewItem[] } {
		const paths = [...this.brew.keys()].sort((a, b) => a.localeCompare(b));
		return { spells: paths.flatMap(p => this.brew.get(p)!.spells), items: paths.flatMap(p => this.brew.get(p)!.items) };
	}

	async build(): Promise<void> {
		this.byName.clear();
		this.byFile.clear();
		this.brew.clear();
		const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
		await Promise.all(files.map(f => this.indexFile(f, false)));
		this.ready = true;
		this.trigger('changed');
	}

	/** A monster by name, as seen from the note `from` (or the active campaign): a note, then a pack, then the books. */
	get(name: string, from?: string): MonsterIndexEntry | undefined {
		const key = name.trim().toLowerCase();
		return this.pick(this.byName.get(key), from) ?? this.packs(from).get(key) ?? this.bundled.get(key);
	}

	/** Every monster `from` can see: vault notes first-class; then packs' and bundled ones unless something closer has the name. */
	all(from?: string): MonsterIndexEntry[] {
		const vault = [...this.byName.values()].map(list => this.pick(list, from)).filter((e): e is MonsterIndexEntry => !!e);
		const shadowed = new Set(vault.map(e => e.name.toLowerCase()));
		const packs = [...this.packs(from).entries()].filter(([key]) => !shadowed.has(key)).map(([key, e]) => { shadowed.add(key); return e; });
		const bundled = [...this.bundled.entries()].filter(([key]) => !shadowed.has(key)).map(([, e]) => e);
		return [...vault, ...packs, ...bundled].sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Only monsters written in vault notes (that `from` can see). */
	vaultOnly(from?: string): MonsterIndexEntry[] {
		return [...this.byName.values()].map(list => this.pick(list, from)).filter((e): e is MonsterIndexEntry => !!e).sort((a, b) => a.name.localeCompare(b.name));
	}

	get size(): number {
		const packs = this.packs();
		return this.byName.size + [...packs.keys()].filter(k => !this.byName.has(k)).length + [...this.bundled.keys()].filter(k => !this.byName.has(k) && !packs.has(k)).length;
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
		const hadBrew = this.brew.delete(path);
		const names = this.byFile.get(path);
		if (!names) { if (hadBrew && notify) this.trigger('changed'); return; }
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
		return JSON.stringify([names.map(n => this.byName.get(n)?.find(e => e.filePath === path)?.monster ?? null), this.brew.get(path) ?? null]);
	}

	private async indexFile(file: TFile, notify: boolean): Promise<void> {
		const gen = this.bump(file.path);
		const parsed = await this.parseFile(file);
		if (gen !== this.generation.get(file.path)) return;
		this.store(file.path, parsed);
		if (notify && (parsed.monsters.length || parsed.spells.length || parsed.items.length)) this.trigger('changed');
	}

	private async parseFile(file: TFile): Promise<Parsed> {
		const none: Parsed = { monsters: [], spells: [], items: [] };
		if (file.extension !== 'md') return none;
		try {
			const content = await this.app.vault.cachedRead(file);
			if (!/nimble/i.test(content)) return none;
			const monsters: NimbleMonster[] = [];
			for (const body of extractNimbleBlocks(content)) {
				const monster = parseStatblock(body);
				if (monster?.name) monsters.push(monster);
			}
			const spells = extractNimbleBlocks(content, SPELL_LANG).map(parseSpellBlock).filter((s): s is HomebrewSpell => !!s).map(s => ({ ...s, filePath: file.path }));
			const items = extractNimbleBlocks(content, ITEM_LANG).map(parseItemBlock).filter((i): i is HomebrewItem => !!i).map(i => ({ ...i, filePath: file.path }));
			return { monsters, spells, items };
		} catch (e) {
			console.error(`Ember Vault: error indexing ${file.path}`, e);
			return none;
		}
	}

	private store(path: string, parsed: Parsed): void {
		const { monsters } = parsed;
		if (parsed.spells.length || parsed.items.length) this.brew.set(path, { spells: parsed.spells, items: parsed.items });
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
