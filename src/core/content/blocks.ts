// Content written in notes, in our syntax: a fenced block per kind
// (```5e-class, ```nimble-ancestry…) whose body is that kind's pack entry as
// YAML, with the same field names as a pack's JSON and the same checks
// (spec.ts), so a block and a pack entry are one format. Notes holding them in
// the content folder are the vault's homebrew: together they're one more pack
// for each game, "Homebrew", on top of the others (store.ts).
// Pure: no Obsidian imports.

import { kindPlural, PackEntry, PackNote } from './packs';
import { checkEntry, KindSpec, starterEntry } from './spec';
import { readYaml, toYaml } from '../yaml-lite';

/** The pack the content folder's notes make, for every game: its tag, its `packs:` name. */
export const HOMEBREW = 'Homebrew';

/**
 * The tag on an entry imported from another app (a D&D Beyond character's class): a block in the content folder
 * that says where it came from (`imported: D&D Beyond`). It's still in the Homebrew pack; only its tag differs.
 */
export const IMPORTED = 'Imported';

/**
 * How a game system writes its kinds as blocks: ```<prefix>-<kind>, in notes under
 * <content folder>/<folder>/<the kind's plural>/. Kinds that already have a block of their own
 * (a game's spells, items and monsters) aren't listed.
 */
export interface BlockSpec {
	/** The fence's first word: "5e", "nimble". */
	prefix: string;
	/** The game's folder in the content folder: "5e", "Nimble". */
	folder: string;
	kinds: readonly string[];
}

/** "5e" + "class" → "5e-class". */
export const blockLang = (prefix: string, kind: string): string => `${prefix}-${kind}`;

export interface FencedBlock {
	lang: string;
	body: string;
	/** The opening fence's line (0-based). */
	line: number;
}

/** Every fenced block in a note whose language is one of `langs`. */
export function fencedBlocks(content: string, langs: ReadonlySet<string>): FencedBlock[] {
	const out: FencedBlock[] = [];
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const open = /^ {0,3}(`{3,}|~{3,})\s*([\w-]+)\s*$/.exec(lines[i]);
		if (!open) continue;
		const fence = open[1];
		const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
		let end = i + 1;
		while (end < lines.length && !close.test(lines[end])) end++;
		if (langs.has(open[2])) out.push({ lang: open[2], body: lines.slice(i + 1, end).join('\n'), line: i });
		i = end;
	}
	return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "Line 4", "Lines 4 and 5", "Lines 4–7": runs of lines. */
function linesText(ns: number[]): string[] {
	const runs: [number, number][] = [];
	for (const n of ns) {
		const last = runs[runs.length - 1];
		if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
	}
	return runs.map(([a, b]) => (a === b ? `Line ${a}` : b === a + 1 ? `Lines ${a} and ${b}` : `Lines ${a}–${b}`));
}

/** A block, read: the entry when it can be used, and always every field that checked out, with what's wrong. */
export interface ReadBlock {
	entry?: PackEntry;
	/** The fields that checked out (the card shows these while the rest is fixed). */
	value: Record<string, unknown>;
	/** Why it can't be used yet. */
	errors: string[];
	/** What was left out or couldn't be read; it's used without them. */
	warnings: string[];
}

/** A block's body against its kind: YAML in, the same checks a pack's entry gets. */
export function readContentBlock(kind: KindSpec, body: string): ReadBlock {
	const { value: raw, skipped } = readYaml(body);
	if (!isObj(raw)) {
		return { value: {}, errors: [body.trim() ? 'Write one field on each line, like "name: Ember Knight".' : '"name" is missing'], warnings: [] };
	}
	const warnings = linesText(skipped).map(l => `${l} ${/^Lines/.test(l) ? 'weren\'t' : 'wasn\'t'} read: check the indent, and the colon after each field's name`);
	const fields = { ...raw };
	if (fields.kind !== undefined && kind.fields.kind === undefined) {
		const said = typeof fields.kind === 'string' ? fields.kind.trim().toLowerCase() : '';
		if (said !== kind.kind) warnings.push(`"kind" isn't needed here: this block is a ${kind.label.toLowerCase()}`);
		delete fields.kind;
	}
	const checked = checkEntry(kind, fields);
	const name = typeof checked.partial.name === 'string' || typeof checked.partial.name === 'number' ? String(checked.partial.name).trim() : '';
	const entry = checked.value && name ? { kind: kind.kind, name, value: checked.value } : undefined;
	return { entry, value: checked.partial, errors: checked.errors, warnings: [...warnings, ...checked.warnings] };
}

/** What a note in the content folder adds: its blocks' entries (each with the note), and what was left out. */
export function readContentNote(content: string, path: string, kinds: ReadonlyMap<string, KindSpec>): { entries: PackEntry[]; rejected: PackNote[]; warnings: PackNote[] } {
	const out = { entries: [] as PackEntry[], rejected: [] as PackNote[], warnings: [] as PackNote[] };
	const file = path.replace(/^.*\//, '').replace(/\.md$/i, '');
	for (const b of fencedBlocks(content, new Set(kinds.keys()))) {
		const kind = kinds.get(b.lang)!;
		const read = readContentBlock(kind, b.body);
		const at = `${file}, line ${b.line + 1} (${read.entry?.name ?? kind.label})`;
		if (read.entry) out.entries.push({ ...read.entry, file: path });
		else out.rejected.push({ at, reasons: read.errors });
		if (read.warnings.length) out.warnings.push({ at, reasons: read.warnings });
	}
	return out;
}

/** A new entry's block body: its name and the kind's starter, as YAML. */
export function starterBody(kind: KindSpec, name: string): string {
	return toYaml(starterEntry(kind, name));
}

/** Characters a file name can't hold, gone. */
export function safeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';
}

/** "Class" → "Classes", "Class option" → "Class options": a kind's folder. */
export function kindFolder(kind: KindSpec): string {
	const p = kindPlural(kind.label);
	return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Where a new entry's note goes: <content folder>/<game>/<the kind's plural>/<name>.md. */
export function contentNotePath(folder: string, blocks: Pick<BlockSpec, 'folder'>, kind: KindSpec, name: string): string {
	return `${folder}/${blocks.folder}/${kindFolder(kind)}/${safeFileName(name)}.md`;
}
