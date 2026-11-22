// The campaign note kinds every game shares (NPC, location, quest, map, session) and
// what a game system may add to them. Core writes the notes and draws them; a
// system adds fields (a 5e NPC has AC and HP, like a small monster) and, if it
// wants, draws a kind its own way (Call of Cthulhu might show a location's
// sanity threats). Pure: no Obsidian imports.

/** The kinds a system may extend. */
export type SharedNoteKind = 'npc' | 'location' | 'quest' | 'map' | 'session';
export const SHARED_NOTE_KINDS: readonly SharedNoteKind[] = ['npc', 'location', 'quest', 'map', 'session'];

/** A property a system adds to a kind of note. */
export interface NoteField {
	/** The frontmatter key ("ac"). Lowercase, no spaces. */
	key: string;
	/** As shown: "AC", "HP", "Challenge". */
	label: string;
	/** How it's written and read. `number` values are shown only when they're numbers. */
	type?: 'text' | 'number';
	/** Only the GM's notes get it, and players never see it. */
	gmOnly?: boolean;
	/** Left out of the card's stats (the system's `card` shows it its own way). */
	hideInStats?: boolean;
	/** Not written into new notes: a property people add when they want it (the card still reads it and redraws when it changes). */
	optional?: boolean;
}

/** What the system draws in a note's card. */
export interface NoteCardContext {
	/** The note. */
	path: string;
	fm: Record<string, unknown>;
	/** Drawn for a player: GM-only fields and stats are left out. */
	player: boolean;
}

export interface NoteKindExtension {
	/** Properties new notes of this kind get, and the card shows as stats. */
	fields?: readonly NoteField[];
	/** Draw more in the kind's card, below core's (a 5e NPC's stat block and Add to fight). */
	card?(el: HTMLElement, ctx: NoteCardContext): void;
	/** `card` draws the whole card instead of adding to core's. */
	replace?: boolean;
}

export type NoteKindExtensions = Partial<Record<SharedNoteKind, NoteKindExtension>>;

/** A property's value as card text: "" when unset, or (for `number`) not a number. */
export function fieldText(f: NoteField, v: unknown): string {
	if (v === null || v === undefined) return '';
	if (Array.isArray(v)) return v.map(x => fieldText(f, x)).filter(Boolean).join(', ');
	const s = typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? `${v}` : '';
	if (f.type === 'number' && !/^-?\d+(?:\.\d+)?$/.test(s)) return '';
	return s;
}

/** The stats a card shows: each field with a value, in order, without GM-only ones for players. */
export function noteStats(fields: readonly NoteField[] | undefined, fm: Record<string, unknown>, player: boolean): { key: string; label: string; value: string }[] {
	return (fields ?? [])
		.filter(f => !(player && f.gmOnly) && !f.hideInStats)
		.map(f => ({ key: f.key, label: f.label, value: fieldText(f, fm[f.key]) }))
		.filter(s => s.value !== '');
}

/** Every field's value, as one string: a card redraws when it changes (a map, like `skills: { athletics: 4 }`, too). */
export function fieldsKey(fields: readonly NoteField[] | undefined, fm: Record<string, unknown>): string {
	return (fields ?? []).map(f => {
		const v = fm[f.key];
		return v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : fieldText(f, v);
	}).join('|');
}

/** The frontmatter a new note gets for a system's fields: empty values, GM-only ones left out of a player's note. */
export function fieldDefaults(fields: readonly NoteField[] | undefined, side: 'gm' | 'player'): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of fields ?? []) if (!f.optional && (side === 'gm' || !f.gmOnly)) out[f.key] = '""';
	return out;
}
