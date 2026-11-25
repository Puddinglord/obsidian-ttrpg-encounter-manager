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
	/** Per converted record (by name): what the GM should check. */
	notes: Map<string, string[]>;
	/** Entries the target game can't build yet (a 5e spell, for Nimble): shown as coming soon, never written. */
	waiting: BundleEntry[];
}

export function convertBundle(b: ImportBundle, c: Converter): Converted {
	const notes = new Map<string, string[]>();
	const waiting: BundleEntry[] = [];
	const content: BundleEntry[] = [];
	for (const e of b.content ?? []) {
		const { kind, importedFrom, convertedFrom: _c, original: _o, ...value } = e;
		const n = kind === 'monster' ? c.out(value) : null;
		if (!n) { waiting.push(e); continue; }
		const built = c.in(n);
		const name = typeof built.value.name === 'string' ? built.value.name : e.name;
		// The original stays with it, as its own game had it, so the note can show it and convert it again.
		content.push({ ...built.value, kind: 'monster', name, convertedFrom: c.from, original: { kind, ...value }, ...(importedFrom ? { importedFrom } : {}) });
		notes.set(name, built.notes);
	}
	return { bundle: { ...b, system: c.to, edition: undefined, content }, notes, waiting };
}
