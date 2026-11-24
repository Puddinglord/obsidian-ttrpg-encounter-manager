// Converting a bundle's content to another game, through the neutral
// creature (creature.ts): each monster the source game can describe is built
// by the target game, keeps where it came from, and says it was converted
// and what changed. What can't be converted yet (a 5e spell into Nimble) is
// left out, with that said.
// Pure: no Obsidian imports.

import type { BundleEntry, ImportBundle } from './bundle';
import type { NeutralCreature } from './creature';

export interface Converter {
	from: string;
	to: string;
	out(value: Record<string, unknown>): NeutralCreature | null;
	in(c: NeutralCreature): { value: Record<string, unknown>; notes: string[] };
}

export interface Converted {
	bundle: ImportBundle;
	/** Per converted record (by name): what the GM should check, and the record as it was. */
	notes: Map<string, string[]>;
	originals: Map<string, BundleEntry>;
	/** Things about the whole conversion. */
	said: string[];
}

export function convertBundle(b: ImportBundle, c: Converter): Converted {
	const notes = new Map<string, string[]>();
	const originals = new Map<string, BundleEntry>();
	const said: string[] = [];
	const content: BundleEntry[] = [];
	let skipped = 0;
	for (const e of b.content ?? []) {
		if (e.kind !== 'monster') { skipped++; continue; }
		const { kind: _k, from, converted: _c, ...value } = e;
		const n = c.out(value);
		if (!n) { skipped++; continue; }
		const built = c.in(n);
		const name = typeof built.value.name === 'string' ? built.value.name : e.name;
		content.push({ ...built.value, kind: 'monster', name, converted: c.from, ...(from ? { from } : {}) });
		notes.set(name, built.notes);
		originals.set(name, e);
	}
	if (skipped) said.push(`${skipped} ${skipped === 1 ? 'entry isn\'t a monster' : 'entries aren\'t monsters'}, and only monsters convert yet, so ${skipped === 1 ? 'it was' : 'they were'} left out. Import without converting to keep ${skipped === 1 ? 'it' : 'them'} as they are.`);
	return { bundle: { ...b, system: c.to, edition: undefined, content }, notes, originals, said };
}
