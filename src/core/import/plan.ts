// What an import will do with each record: add it (new), bring an earlier
// import of the same thing up to date (update), leave it (same: imported
// before and unchanged), or leave it because the vault already has its own by
// that name (yours: never touched). Earlier imports are found by the source's
// id, else by name among imported things.
// Pure: no Obsidian imports.

import type { CheckedRecord, RecordType } from './bundle';

export type PlanStatus = 'new' | 'update' | 'same' | 'yours' | 'unusable';

/** Something the vault has, for matching: a content entry, a monster note, an NPC, a map. */
export interface Have {
	type: RecordType;
	kind: string;
	name: string;
	/** Its import's id (`importId`), when it was imported. */
	importId?: string;
	/** It was imported (it says `imported:`), so an import may update it. */
	imported: boolean;
	/** The note it's in. */
	file: string;
	/** Its fields, for content: an update is offered only when they differ. */
	value?: Record<string, unknown>;
}

export interface PlanItem {
	record: CheckedRecord;
	status: PlanStatus;
	/** The note it updates, or the one that's already yours. */
	file?: string;
	/** Ticked to start with: new things and updates. */
	on: boolean;
	/** For an update: the vault's copy, for what changed. */
	before?: Record<string, unknown>;
	/** Yours: written as a copy under another name ("Mire Hag (Nimble Nexus)"), when ticked. */
	copy?: boolean;
	/** A map: a location note for each pin with text, the pin linking to it (instead of the map's key). */
	roomNotes?: boolean;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A value with its keys sorted and its import fields gone, as text, for "has it changed?". */
export function stableText(v: unknown): string {
	const norm = (x: unknown): unknown => {
		if (Array.isArray(x)) return x.map(norm);
		if (x && typeof x === 'object') {
			return Object.fromEntries(Object.keys(x).filter(k => k !== 'imported' && k !== 'importId').sort().map(k => [k, norm((x as Record<string, unknown>)[k])]));
		}
		return x;
	};
	return JSON.stringify(norm(v));
}

/** Content entries of a kind, monsters, NPCs…: what a record can be matched against. */
const sameGroup = (r: CheckedRecord, h: Have) => r.type === h.type && (r.type === 'map' || key(r.kind) === key(h.kind));

/**
 * Each record's plan. Only content is ever updated: an NPC or a map imported before is left as it is (you may have
 * written in it since), and said to be imported already.
 */
export function planRecords(records: readonly CheckedRecord[], have: readonly Have[]): PlanItem[] {
	const seen = new Set<string>();
	return records.map((record): PlanItem => {
		if (!record.value) return { record, status: 'unusable', on: false };
		// The same thing twice in one bundle: the first one counts.
		const self = `${record.type}|${key(record.kind)}|${key(record.name)}`;
		if (seen.has(self)) return { record, status: 'unusable', on: false };
		seen.add(self);
		const group = have.filter(h => sameGroup(record, h));
		const id = record.source?.id;
		const earlier = (id ? group.find(h => h.importId === id) : undefined)
			?? group.find(h => h.imported && key(h.name) === key(record.name) && (!id || !h.importId));
		if (earlier) {
			if (record.type !== 'content' || !earlier.value || stableText(earlier.value) === stableText(record.value)) {
				return { record, status: 'same', file: earlier.file, on: false };
			}
			return { record, status: 'update', file: earlier.file, on: true, before: earlier.value };
		}
		const yours = group.find(h => key(h.name) === key(record.name));
		if (yours) return { record, status: 'yours', file: yours.file, on: false };
		return { record, status: 'new', on: true };
	});
}

/** "Added 3, updated 1." */
export function planResultText(r: { added: number; updated: number }): string {
	const parts = [r.added ? `added ${r.added}` : '', r.updated ? `updated ${r.updated}` : ''].filter(Boolean);
	if (!parts.length) return 'Nothing was added.';
	const s = parts.join(', ');
	return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}
