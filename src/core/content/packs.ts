// Content packs: JSON files of entries for one game system, for what can't
// ship with the plugin (a book's subclasses, a third-party bestiary, your
// table's homebrew). The plugin never hosts them; they live in the vault.
//
//   { "pack": "My homebrew", "system": "5e", "edition": "2024",
//     "entries": [ { "kind": "spell", "name": "Ember Lash", … } ] }
//
// Reading a pack keeps every entry it can use and says, in plain words, why
// each other one was left out. Pure: no Obsidian imports.

import { checkEntry, KindSpec } from './spec';

export interface PackEntry {
	kind: string;
	name: string;
	value: Record<string, unknown>;
}

/** An entry that was left out, or one with something ignored. */
export interface PackNote {
	/** "Entry 3 (Mire Hag)". */
	at: string;
	reasons: string[];
}

export interface LoadedPack {
	/** The file, in the vault. */
	path: string;
	name: string;
	/** The system's id ("dnd5e"), once known. */
	system: string;
	edition?: string;
	version?: number;
	description?: string;
	entries: PackEntry[];
	rejected: PackNote[];
	warnings: PackNote[];
	/** Why nothing could be read at all. */
	error?: string;
}

/** What a system takes in packs (from its `content` member), by any of its names. */
export type KindsFor = (system: string) => { id: string; name: string; kinds: readonly KindSpec[]; editions?: readonly string[] } | null | 'no-packs';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Text for a value a person wrote (a number, a word), never "[object Object]". */
const said = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v) ?? '');

/** "Unexpected token } in JSON at position 120" → "line 7". */
function jsonWhere(text: string, message: string): string {
	const pos = /position (\d+)/.exec(message);
	if (!pos) return '';
	const line = text.slice(0, Number(pos[1])).split('\n').length;
	return ` (around line ${line})`;
}

export function readPack(text: string, path: string, kindsFor: KindsFor): LoadedPack {
	const base: LoadedPack = { path, name: path.replace(/^.*\//, '').replace(/\.json$/i, ''), system: '', entries: [], rejected: [], warnings: [] };
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { ...base, error: `This isn't valid JSON${jsonWhere(text, message)}. A missing comma or quote is the usual cause.` };
	}
	if (!isObj(raw)) return { ...base, error: 'A pack is an object with "pack", "system" and "entries".' };
	const name = typeof raw.pack === 'string' && raw.pack.trim() ? raw.pack.trim() : base.name;
	if (typeof raw.system !== 'string' || !raw.system.trim()) return { ...base, name, error: 'The pack doesn\'t say which game it\'s for: add "system", like "5e".' };
	const sys = kindsFor(raw.system);
	if (sys === 'no-packs') return { ...base, name, system: raw.system, error: `${raw.system} doesn't take content packs yet.` };
	if (!sys) return { ...base, name, system: raw.system, error: `Ember Vault doesn't know the game "${raw.system}".` };
	const pack: LoadedPack = { ...base, name, system: sys.id };
	if (raw.edition !== undefined) {
		const ed = said(raw.edition).trim();
		if (sys.editions && !sys.editions.includes(ed)) return { ...pack, error: `"edition" should be one of: ${sys.editions.join(', ')} (or leave it out for all).` };
		pack.edition = ed;
	}
	if (typeof raw.version === 'number') pack.version = raw.version;
	if (typeof raw.description === 'string') pack.description = raw.description;
	if (!Array.isArray(raw.entries)) return { ...pack, error: 'The pack has no "entries" list.' };
	const kinds = new Map(sys.kinds.map(k => [k.kind, k]));
	raw.entries.forEach((e, i) => {
		const label = isObj(e) && typeof e.name === 'string' && e.name.trim() ? `Entry ${i + 1} (${e.name.trim()})` : `Entry ${i + 1}`;
		if (!isObj(e)) { pack.rejected.push({ at: label, reasons: ['An entry is an object, like { "kind": "spell", "name": "…" }.'] }); return; }
		const kind = typeof e.kind === 'string' ? kinds.get(e.kind.trim().toLowerCase()) : undefined;
		if (!kind) {
			pack.rejected.push({ at: label, reasons: [e.kind === undefined ? `It needs a "kind": one of ${[...kinds.keys()].join(', ')}.` : `"${said(e.kind)}" isn't a kind ${sys.name} takes: use one of ${[...kinds.keys()].join(', ')}.`] });
			return;
		}
		const checked = checkEntry(kind, e);
		if (!checked.value) { pack.rejected.push({ at: label, reasons: checked.errors }); return; }
		if (checked.warnings.length) pack.warnings.push({ at: label, reasons: checked.warnings });
		const entryName = said(checked.value.name ?? '').trim();
		if (!entryName) { pack.rejected.push({ at: label, reasons: ['"name" is missing'] }); return; }
		pack.entries.push({ kind: kind.kind, name: entryName, value: checked.value });
	});
	return pack;
}

/**
 * Which packs a campaign uses, from `packs:` on its home note: missing means
 * every pack; `none` (or false, or an empty list) means none; a list names them
 * (by pack name or file name, any case).
 */
export function packsEnabled(setting: unknown, packs: LoadedPack[]): LoadedPack[] {
	if (setting === undefined || setting === null || setting === true || setting === 'all') return packs;
	if (setting === false || setting === 'none' || (Array.isArray(setting) && !setting.length)) return [];
	const names = (Array.isArray(setting) ? setting as unknown[] : said(setting).split(',')).map(x => said(x).trim().toLowerCase()).filter(Boolean);
	return packs.filter(p => names.includes(p.name.toLowerCase()) || names.includes(p.path.replace(/^.*\//, '').replace(/\.json$/i, '').toLowerCase()));
}

/** "class" → "classes", "ancestry" → "ancestries", "species" → "species". */
export function kindPlural(kind: string): string {
	if (/^(?:species|equipment)$/i.test(kind)) return kind;
	if (/(?:s|x|ch|sh)$/i.test(kind)) return `${kind}es`;
	if (/[^aeiou]y$/i.test(kind)) return `${kind.slice(0, -1)}ies`;
	return `${kind}s`;
}

/** A one-line summary: "12 entries: 5 spells, 4 monsters, 3 subclasses". */
export function packSummary(p: LoadedPack, plural: (kind: string, n: number) => string = (k, n) => `${n} ${n === 1 ? k : kindPlural(k)}`): string {
	if (p.error) return p.error;
	const counts = new Map<string, number>();
	for (const e of p.entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
	const parts = [...counts.entries()].map(([k, n]) => plural(k, n));
	const n = p.entries.length;
	return `${n} ${n === 1 ? 'entry' : 'entries'}${parts.length ? `: ${parts.join(', ')}` : ''}${p.rejected.length ? ` · ${p.rejected.length} left out` : ''}`;
}
