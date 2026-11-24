// Importers: each one reads one kind of file (a Fantasy Statblocks creature, a
// Nimble Nexus monster, a Watabou dungeon) and turns it into an import bundle
// (bundle.ts), or, for the few that need a review of their own (a D&D Beyond
// character, a content pack), draws that review. Core's Import… dialog asks
// every importer how sure it is that the input is its kind, reads it with the
// best, and does the rest (plan, review, write) the same way for all of them.
// Pure: no Obsidian imports.

import type { ImportBundle } from './bundle';

/** What the user gave: files (chosen or dropped together), pasted text, and the link it was fetched from. */
export interface ImportInput {
	files: ImportFile[];
	text?: string;
	/** The link the text was fetched from, when it was. */
	url?: string;
}

export interface ImportFile {
	name: string;
	/** The file as text, for text formats (JSON, YAML, Markdown). */
	text?: string;
	/** The file's bytes, for pictures and archives. */
	data?: Uint8Array;
}

/** A review an importer draws itself, instead of the bundle's plan (a D&D Beyond character, a content pack). */
export interface CustomReview {
	/** Draw what it brings into `el` (emptied first), with the choice of what to add; call `changed` when that changes. */
	render(el: HTMLElement, changed: () => void): void;
	/** How many things are chosen: Add is off at none. */
	chosen(): number;
	/** Write what's chosen; the sentence for the notice. */
	add(): Promise<string>;
	/** The Add button's label ("Import", "Add to vault"). */
	action?: string;
}

/** What an importer read: a bundle (with anything worth a look), or its own review, or why it couldn't. */
export type ImportRead =
	| { bundle: ImportBundle; notes?: string[] }
	| { custom: CustomReview }
	| { error: string };

/** What an importer may use besides the input: the plugin (for importers that draw their own review). */
export interface ImportContext {
	/** The plugin, typed loosely so pure importers don't need it. */
	plugin: unknown;
	/** The note the import was started from, for the campaign (and so the game) it lands in. */
	sourcePath: string;
}

export interface Importer {
	/** Stable: "fantasy-statblocks", "bundle". Commands and tests name it. */
	id: string;
	/** What people call the format: "Fantasy Statblocks". */
	label: string;
	/** The game its content is written for; none for formats any game reads (maps, bundles). */
	system?: string;
	/**
	 * How sure it is that this is its kind: 0 (not mine) to 1 (certainly mine). Cheap: look at file names and the
	 * first keys; don't read everything twice.
	 */
	detect(input: ImportInput): number;
	read(input: ImportInput, ctx: ImportContext): ImportRead | Promise<ImportRead>;
	/** Links it can fetch when one is pasted: which, and the address of their data. */
	links?: readonly ImportLink[];
	/** A word on how to get the file, shown when the format is picked by hand (D&D Beyond's link helper). */
	hint?(el: HTMLElement): void;
}

export interface ImportLink {
	match: RegExp;
	/** The address that returns the data, for a matching link. */
	dataUrl(url: string): string;
}

/** Importers that think the input is theirs, surest first. Ties keep the order given (games' own before core's). */
export function detectImporters(input: ImportInput, importers: readonly Importer[]): { importer: Importer; score: number }[] {
	const out: { importer: Importer; score: number; i: number }[] = [];
	importers.forEach((importer, i) => {
		let score = 0;
		try { score = importer.detect(input); } catch { score = 0; }
		if (score > 0) out.push({ importer, score: Math.min(1, score), i });
	});
	return out.sort((a, b) => b.score - a.score || a.i - b.i).map(({ importer, score }) => ({ importer, score }));
}

/** The importer that fetches this link, and the address of its data; null when none does. */
export function linkImporter(url: string, importers: readonly Importer[]): { importer: Importer; dataUrl: string } | null {
	const u = url.trim();
	if (!/^https:\/\//i.test(u)) return null;
	for (const importer of importers) {
		for (const l of importer.links ?? []) if (l.match.test(u)) return { importer, dataUrl: l.dataUrl(u) };
	}
	return null;
}

// ----------------------------------------------------------------------------
// Helpers importers share

/** The text to read: the pasted text, else the one text file given; undefined when there's neither or several. */
export function inputText(input: ImportInput): string | undefined {
	if (input.text?.trim()) return input.text;
	const texts = input.files.filter(f => f.text !== undefined);
	return texts.length === 1 ? texts[0].text : undefined;
}

/** The input's text as JSON; undefined when it isn't JSON. */
export function inputJson(input: ImportInput): unknown {
	const text = inputText(input)?.trim();
	if (!text || !/^[[{]/.test(text)) return undefined;
	try { return JSON.parse(text) as unknown; } catch { return undefined; }
}

/** The file's extension, lower case, without the dot: "png". */
export const extOf = (name: string): string => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/** A file's name without its folder or extension: "crypt" from "maps/crypt.json". */
export const baseName = (name: string): string => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp'];

/** Files given that are pictures. */
export const imagesOf = (input: ImportInput): ImportFile[] => input.files.filter(f => IMAGE_EXTS.includes(extOf(f.name)));
