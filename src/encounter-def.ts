// The ```nimble-encounter block format. Pure: no Obsidian imports.
//
//   name: Goblin ambush
//   party: true
//   monsters:
//   - 2 Goblin
//   - 4× Goblin Minion
//   - Krogg, Goblin King
//   notes: The goblins start hidden in the reeds.

export interface EncounterDefMonster {
	name: string;
	count: number;
	/** Levels tougher (+) or weaker (−) than the stat block: "- 2 Cultist +1". */
	shift?: number;
	/** The name as it was typed when that isn't the bare name ("[[Goblin]]", "`nimble:Goblin`"), so a rewrite keeps it. */
	written?: string;
}

export interface EncounterDef {
	name: string;
	/** Add the party's heroes when the encounter is run. */
	party: boolean;
	monsters: EncounterDefMonster[];
	/** May span several lines. */
	notes?: string;
	/** Lines this format doesn't understand ("loot: 40 gp"), kept so an edit doesn't delete them. */
	extra?: string[];
	/** The same, for lines inside the monsters list ("- 0 Goblin"). */
	monsterExtra?: string[];
}

/** "2 Goblin", "2x Goblin", "2× Goblin", "Goblin x2", "[[Goblin]]", "`nimble:Goblin`". */
export function parseMonsterLine(line: string): EncounterDefMonster | null {
	let s = line.trim().replace(/^[-*+]\s*/, '').trim();
	if (!s) return null;
	let count = 1;
	// A level shift at the end, with an explicit sign: "+1", "-1", "(+1)", "(−2)".
	let shift = 0;
	const sh = s.match(/\s+\(?([+\-−]\d+)\)?$/);
	if (sh) { shift = Number(sh[1].replace('−', '-')); s = s.slice(0, sh.index).trim(); }
	const lead = s.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
	const trail = s.match(/^(.+?)\s+[x×]\s*(\d+)$/i);
	if (lead) { count = Number(lead[1]); s = lead[2]; }
	else if (trail) { s = trail[1]; count = Number(trail[2]); }
	const written = s.trim();
	s = s.replace(/^`nimble:\s*/i, '').replace(/`$/, '');
	const link = s.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
	if (link) s = link[1];
	s = s.trim();
	if (!s || count <= 0) return null;
	const m: EncounterDefMonster = { name: s, count };
	if (shift) m.shift = shift;
	if (written !== s) m.written = written;
	return m;
}

export function parseEncounterBlock(source: string): EncounterDef {
	const def: EncounterDef = { name: 'Encounter', party: false, monsters: [] };
	let section: string | null = null;
	// True while lines may still belong to a multi-line "notes:".
	let inNotes = false;
	const extra: string[] = [];
	const monsterExtra: string[] = [];
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		// An indented line under notes continues them, whatever it looks like.
		if (inNotes && /^\s/.test(raw)) { def.notes = def.notes ? `${def.notes}\n${line}` : line; continue; }
		const header = line.match(/^([a-z]+):\s*$/i);
		if (header) {
			section = header[1].toLowerCase();
			if (section === 'note') section = 'notes';
			inNotes = section === 'notes';
			if (section !== 'monsters' && section !== 'notes') extra.push(raw.trimEnd());
			continue;
		}
		if (section === 'monsters' && /^[-*+]\s/.test(line)) {
			const m = parseMonsterLine(line);
			if (m) {
				const existing = def.monsters.find(x => x.name.toLowerCase() === m.name.toLowerCase());
				if (existing) existing.count += m.count;
				else def.monsters.push(m);
			} else monsterExtra.push(line);
			continue;
		}
		const kv = /^[-*+]\s/.test(line) ? null : line.match(/^([^:]+):\s*(.*)$/);
		if (kv) {
			const key = kv[1].trim().toLowerCase();
			const value = kv[2].trim();
			// Under notes, "They flee: north" is more notes. A one-word key ("loot: 40 gp") is a field of its own.
			const known = ['name', 'title', 'party', 'heroes', 'notes', 'note'].includes(key);
			if (inNotes && !known && /\s/.test(key)) { def.notes = def.notes ? `${def.notes}\n${line}` : line; continue; }
			section = null;
			inNotes = false;
			if (key === 'name' || key === 'title') def.name = value || def.name;
			else if (key === 'party' || key === 'heroes') def.party = /^(true|yes|on|1)$/i.test(value);
			else if (key === 'notes' || key === 'note') { def.notes = value; inNotes = true; }
			else extra.push(raw.trimEnd());
			continue;
		}
		if (inNotes) def.notes = def.notes ? `${def.notes}\n${line}` : line;
		else if (section === 'monsters') monsterExtra.push(line);
		else extra.push(raw.trimEnd());
	}
	if (extra.length) def.extra = extra;
	if (monsterExtra.length) def.monsterExtra = monsterExtra;
	return def;
}

export function encounterBlockSource(def: EncounterDef): string {
	const lines = [`name: ${def.name}`];
	if (def.party) lines.push('party: true');
	// Before "monsters:", so nothing here can be read back as a monster or as part of the notes.
	lines.push(...(def.extra ?? []));
	lines.push('monsters:');
	for (const m of def.monsters) lines.push(`- ${m.count} ${m.written ?? m.name}${m.shift ? ` ${m.shift > 0 ? '+' : '-'}${Math.abs(m.shift)}` : ''}`);
	lines.push(...(def.monsterExtra ?? []));
	const notes = (def.notes ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
	// Continuation lines are indented: that's what marks them as notes when the block is read again.
	if (notes.length) lines.push(`notes: ${notes[0]}`, ...notes.slice(1).map(l => `  ${l}`));
	return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Finding a block's own lines in its note

export interface FenceSpan {
	/** Line index of the opening fence. */
	open: number;
	/** Line index of the closing fence. */
	close: number;
	/** What sits in front of every line of the block: "> " in a callout, indentation under a list item. */
	prefix: string;
}

/** A fence opening a `lang` block ("nimble" doesn't match "nimble-encounter"). */
const openFence = (lang: string) => new RegExp(`^([ \\t>]*)(\`{3,}|~{3,})[ \\t]*${lang}(?![\\w-])`, 'i');

function sameBody(a: string, b: string): boolean {
	const norm = (t: string) => t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n');
	return norm(a) === norm(b);
}

function unprefix(line: string, prefix: string): string {
	if (line.startsWith(prefix)) return line.slice(prefix.length);
	const bare = prefix.trimEnd(); // an empty callout line is just ">"
	return bare && line.startsWith(bare) ? line.slice(bare.length) : line;
}

/**
 * The ```nimble-encounter fence between two lines of a note (inclusive).
 * Obsidian reports the whole enclosing section for a block inside a callout
 * or a list, so the range can hold other text and other blocks. `body` (the
 * block's source as rendered) picks the right one; without a match there's no
 * answer, and the caller must leave the note alone.
 */
export function findEncounterFence(lines: string[], lineStart: number, lineEnd: number, body?: string, lang = 'nimble-encounter'): FenceSpan | null {
	const open = openFence(lang);
	const last = Math.min(lineEnd, lines.length - 1);
	const found: FenceSpan[] = [];
	for (let i = Math.max(0, lineStart); i <= last; i++) {
		const m = open.exec(lines[i]);
		if (!m) continue;
		const fence = m[2];
		let close = -1;
		for (let j = i + 1; j <= last; j++) {
			const rest = lines[j].replace(/^[ \t>]*/, '').trimEnd();
			if (rest.length >= fence.length && rest[0] === fence[0] && rest === fence[0].repeat(rest.length)) { close = j; break; }
		}
		if (close === -1) break; // unclosed: everything after it is inside this fence
		found.push({ open: i, close, prefix: m[1] });
		i = close;
	}
	if (body === undefined) return found[0] ?? null;
	return found.find(f => sameBody(lines.slice(f.open + 1, f.close).map(l => unprefix(l, f.prefix)).join('\n'), body)) ?? null;
}

/**
 * A note's text with one encounter block's body replaced, or null when the
 * block can't be found (the note changed since it was rendered). Every written
 * line keeps the block's prefix, and the fences themselves aren't touched.
 */
export function replaceEncounterBlock(text: string, lineStart: number, lineEnd: number, oldBody: string, newBody: string, lang = 'nimble-encounter'): string | null {
	const lines = text.split('\n');
	const span = findEncounterFence(lines, lineStart, lineEnd, oldBody, lang);
	if (!span) return null;
	const cr = lines[span.open].endsWith('\r') ? '\r' : '';
	const next = newBody.split(/\r?\n/).map(l => (l ? span.prefix + l : span.prefix.trimEnd()) + cr);
	lines.splice(span.open + 1, span.close - span.open - 1, ...next);
	return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Battle notes: the player's side of the same block
//
//   name: Ambush at the ford
//   outcome: won
//   where: [[Tresendar Manor]]
//   loot: 40 gp, a silver key
//   monsters:
//   - 4 Goblin
//   - Goblin Shaman
//   notes: The shaman fled north.
//
// `outcome`, `where`, `when` and `loot` are kept among the block's extra lines,
// so a GM-side edit never drops them and the format stays one format.

export const BATTLE_FIELDS = ['outcome', 'where', 'when', 'loot'] as const;
export type BattleField = typeof BATTLE_FIELDS[number];

export const OUTCOMES = ['won', 'fled', 'lost', 'parley', 'ongoing'] as const;
export type Outcome = typeof OUTCOMES[number];

/** A battle field's value ("" when it isn't set). */
export function battleField(def: EncounterDef, key: BattleField): string {
	for (const line of def.extra ?? []) {
		const m = line.match(/^\s*([a-z]+):\s*(.*)$/i);
		if (m && m[1].toLowerCase() === key) return m[2].trim();
	}
	return '';
}

/** "won" for anything that reads like a win ("victory", "we won"), and so on; undefined when it's something else. */
export function outcomeOf(value: string): Outcome | undefined {
	const v = value.trim().toLowerCase();
	if (!v) return undefined;
	if (/^(won|win|victory|victorious|we won|defeated them|killed them)/.test(v)) return 'won';
	if (/^(fled|retreat|ran|escaped|withdrew)/.test(v)) return 'fled';
	if (/^(lost|defeat|tpk|captured)/.test(v)) return 'lost';
	if (/^(parley|talked|truce|negotiat|peace)/.test(v)) return 'parley';
	if (/^(ongoing|unfinished|to be continued|paused)/.test(v)) return 'ongoing';
	return undefined;
}

/** A copy of `def` with a battle field set (or removed when `value` is empty). Other extra lines keep their place. */
export function withBattleField(def: EncounterDef, key: BattleField, value: string): EncounterDef {
	const v = value.replace(/[\r\n]+/g, ' ').trim();
	const extra = [...(def.extra ?? [])];
	const i = extra.findIndex(l => (l.match(/^\s*([a-z]+):/i)?.[1] ?? '').toLowerCase() === key);
	if (!v) { if (i >= 0) extra.splice(i, 1); }
	else if (i >= 0) extra[i] = `${key}: ${v}`;
	else extra.push(`${key}: ${v}`);
	const next: EncounterDef = { ...def, extra };
	if (!extra.length) delete next.extra;
	return next;
}
