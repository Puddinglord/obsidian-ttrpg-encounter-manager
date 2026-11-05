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
}

export interface EncounterDef {
	name: string;
	/** Add the party's heroes when the encounter is run. */
	party: boolean;
	monsters: EncounterDefMonster[];
	notes?: string;
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
	s = s.replace(/^`nimble:\s*/i, '').replace(/`$/, '');
	const link = s.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
	if (link) s = link[1];
	s = s.trim();
	if (!s || count <= 0) return null;
	return shift ? { name: s, count, shift } : { name: s, count };
}

export function parseEncounterBlock(source: string): EncounterDef {
	const def: EncounterDef = { name: 'Encounter', party: false, monsters: [] };
	let section: string | null = null;
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const header = line.match(/^([a-z]+):\s*$/i);
		if (header) { section = header[1].toLowerCase(); continue; }
		if (/^[-*+]\s/.test(line) && section === 'monsters') {
			const m = parseMonsterLine(line);
			if (m) {
				const existing = def.monsters.find(x => x.name.toLowerCase() === m.name.toLowerCase());
				if (existing) existing.count += m.count;
				else def.monsters.push(m);
			}
			continue;
		}
		const kv = line.match(/^([^:]+):\s*(.*)$/);
		if (kv) {
			section = null;
			const key = kv[1].trim().toLowerCase();
			const value = kv[2].trim();
			if (key === 'name' || key === 'title') def.name = value || def.name;
			else if (key === 'party' || key === 'heroes') def.party = /^(true|yes|on|1)$/i.test(value);
			else if (key === 'notes' || key === 'note') def.notes = value;
		}
	}
	return def;
}

export function encounterBlockSource(def: EncounterDef): string {
	const lines = [`name: ${def.name}`];
	if (def.party) lines.push('party: true');
	lines.push('monsters:');
	for (const m of def.monsters) lines.push(`- ${m.count} ${m.name}${m.shift ? ` ${m.shift > 0 ? '+' : '-'}${Math.abs(m.shift)}` : ''}`);
	if (def.notes) lines.push(`notes: ${def.notes.replace(/\s*\n\s*/g, ' ')}`);
	return lines.join('\n');
}
