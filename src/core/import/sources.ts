// What the user gave Import…, as sources (each file, the pasted text, a
// fetched link), and how they're read: each data file on its own, with its
// picture when there's one (crypt.json + crypt.png), pasted text on its own,
// and pictures that belong to no data file together, as maps. Each group is
// read by its own importer, so files of different formats dropped together
// all come in.
// Pure: no Obsidian imports.

import { baseName, extOf, IMAGE_EXTS, ImportInput } from './importer';

export interface Source {
	id: string;
	kind: 'file' | 'text' | 'link';
	/** The file's name, "Pasted text", or the link. */
	name: string;
	text?: string;
	data?: Uint8Array;
	/** For a fetched link: where it was fetched from. */
	url?: string;
	/** Bytes. */
	size: number;
}

export interface SourceGroup {
	/** The sources it reads, in the order given: a data file, then its picture. */
	sources: Source[];
	input: ImportInput;
}

export const isPicture = (s: Source): boolean => s.kind === 'file' && !!s.data && IMAGE_EXTS.includes(extOf(s.name));
const isData = (s: Source): boolean => s.text !== undefined;

let next = 0;
/** A new source's id. */
export const sourceId = (): string => `s${++next}`;

/**
 * Sources into groups. A picture goes with the data file of the same base name; else, when there's exactly one data
 * file that takes pictures (`takesPicture`: a dungeon's JSON does, a Nexus monster doesn't) and it has none yet, with
 * that; the rest go together as pictures.
 */
export function groupSources(sources: readonly Source[], takesPicture: (s: Source) => boolean = () => true): SourceGroup[] {
	const data = sources.filter(isData);
	const pics = sources.filter(isPicture);
	const others = sources.filter(s => !isData(s) && !isPicture(s));
	const paired = new Map<Source, Source[]>(data.map(d => [d, []]));
	const loose: Source[] = [];
	for (const p of pics) {
		const base = baseName(p.name).toLowerCase();
		const d = data.find(x => x.kind === 'file' && baseName(x.name).toLowerCase() === base);
		if (d) paired.get(d)!.push(p); else loose.push(p);
	}
	const hosts = data.filter(d => takesPicture(d) && !paired.get(d)!.length);
	if (hosts.length === 1 && loose.length === 1) { paired.get(hosts[0])!.push(loose[0]); loose.length = 0; }
	const groups: SourceGroup[] = data.map(d => {
		const list = [d, ...paired.get(d)!];
		return { sources: list, input: inputOf(list) };
	});
	if (loose.length) groups.push({ sources: loose, input: inputOf(loose) });
	// Files that are neither (a .zip, a PDF): a group each, so each says what it couldn't read.
	for (const o of others) groups.push({ sources: [o], input: inputOf([o]) });
	return groups;
}

/** Sources as an importer's input: pasted text as text, files as files, a fetched link's text with its address. */
export function inputOf(list: readonly Source[]): ImportInput {
	const input: ImportInput = { files: [] };
	for (const s of list) {
		if (s.kind === 'file') input.files.push({ name: s.name, ...(s.text !== undefined ? { text: s.text } : {}), ...(s.data ? { data: s.data } : {}) });
		else { input.text = s.text; if (s.url) input.url = s.url; }
	}
	return input;
}

/** "14 KB", "1.2 MB", "820 bytes". */
export function sizeText(n: number): string {
	if (n < 1024) return `${n} bytes`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}
