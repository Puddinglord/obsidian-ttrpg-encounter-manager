// A Nimble stat block pasted as text, the way the books print it: a name, a
// header ("lvl 2, large", "Lvl 3 Legendary Large Owlbear", "minion, small"),
// the stat line (the PDF's icon tokens "[hp]31 [ar]M [mv]8 [sv]STR+", or
// words: "HP 31 · Armor M · Speed 8"), then passives ("Name. text"),
// actions (bullets, or under "Actions"), Bloodied and Last Stand. Lines a PDF
// wrapped are joined back. Also reads our own ```nimble block text.
// Pure: no Obsidian imports.

import { emptyBundle, BundleEntry } from '../../core/import/bundle';
import type { Importer } from '../../core/import/importer';
import { inputText } from '../../core/import/importer';
import { parseStatblock } from './parser';

const SIZE = /\b(tiny|small|medium|large|huge|gargantuan)\b/i;
const HEADER = /^(?:lvl|level)\s*([\d/.]+x?)|^minion\b/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Does this read like a Nimble stat block as printed? A level header and a stat line. */
export function looksLikeNimbleText(text: string): boolean {
	const t = text.slice(0, 3000);
	const header = /^\s*(lvl|level)\s*[\d/]+|^\s*minion\b/im.test(t);
	const stats = /\[(hp|ar|mv)\]|\bHP\s*\d+|\barmor\s*[:]?\s*(m|h|medium|heavy)\b/im.test(t);
	return header && stats;
}

interface Feature { name: string; text: string }

export function readNimbleText(text: string): { entry: BundleEntry; notes: string[] } | null {
	const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
	if (lines.length < 2) return null;
	// The name and the header, in either order.
	let name = lines[0];
	let header = lines[1];
	if (HEADER.test(lines[0]) && !HEADER.test(lines[1])) { header = lines[0]; name = lines[1]; }
	if (!HEADER.test(header)) return null;
	const out: BundleEntry = { kind: 'monster', name: name.replace(/^#+\s*/, ''), role: 'regular' };
	const notes: string[] = [];
	const lvl = /^(?:lvl|level)\s*([\d/.]+)/i.exec(header);
	if (lvl) out.level = lvl[1];
	if (/\b(legendary|solo)\b/i.test(header)) out.role = 'legendary';
	else if (/\bminion\b/i.test(header)) out.role = 'minion';
	const size = SIZE.exec(header);
	if (size) out.size = cap(size[1]);
	const rest = header.replace(/^(?:lvl|level)\s*[\d/.]+x?(\s*\([^)]*\))?|\bminion\b|\b(legendary|solo)\b|,/gi, ' ').replace(SIZE, ' ').replace(/\s+/g, ' ').trim();
	if (rest) out.type = rest;
	const traits: Feature[] = [];
	const actions: Feature[] = [];
	let inActions = false;
	let last: Feature | null = null;
	let lastField: 'bloodied' | 'lastStand' | 'flavor' | null = null;
	for (const line of lines.slice(2)) {
		// The stat line(s): tokens or words.
		const stats = /\[(hp|ar|mv|fly|swm|swim|clb|climb|bur|burrow|sv)\]|^(HP|Armor|Speed|Saves)\b/i.test(line);
		if (stats && !last) {
			const tok = (re: RegExp) => re.exec(line)?.[1];
			const hp = tok(/(?:\[hp\]|\bHP)\s*:?\s*(\d+)/i);
			if (hp) { if (/\/\s*hero/i.test(line)) out.hpPerHero = Number(hp); else out.hp = Number(hp); }
			const ar = tok(/(?:\[ar\]|\bArmor)\s*:?\s*(M|H|Medium|Heavy|None)\b/i)?.toLowerCase();
			if (ar && ar !== 'none') out.armor = ar.startsWith('h') ? 'heavy' : 'medium';
			const sp = tok(/(?:\[mv\]|\bSpeed)\s*:?\s*(\d+)/i);
			if (sp) out.speed = Number(sp);
			for (const [re, k] of [[/\[fly\]\s*(\d+)|\bfly\s*(\d+)/i, 'fly'], [/\[(?:swm|swim)\]\s*(\d+)|\bswim\s*(\d+)/i, 'swim'], [/\[(?:clb|climb)\]\s*(\d+)|\bclimb\s*(\d+)/i, 'climb'], [/\[(?:bur|burrow)\]\s*(\d+)|\bburrow\s*(\d+)/i, 'burrow']] as const) {
				const m = re.exec(line);
				if (m) out[k] = Number(m[1] ?? m[2]);
			}
			const sv = /(?:\[sv\]|\bSaves)\s*:?\s*((?:(?:STR|DEX|INT|WIL|ALL)[+-]+\s*)+)/i.exec(line);
			if (sv) out.saves = sv[1].trim();
			continue;
		}
		const bl = /^bloodied\s*[:.]\s*(.*)$/i.exec(line);
		if (bl) { out.bloodied = bl[1]; lastField = 'bloodied'; last = null; continue; }
		const ls = /^last stand\s*[:.]\s*(.*)$/i.exec(line);
		if (ls) { out.lastStand = ls[1]; lastField = 'lastStand'; last = null; continue; }
		const act = /^actions?\s*[:.]?\s*(.*)$/i.exec(line);
		if (act) { inActions = true; if (act[1]) out.actionsIntro = act[1]; last = null; lastField = null; continue; }
		if (/^(choose|pick|do)\b.*[:.]$/i.test(line) && !last) { inActions = true; out.actionsIntro = line; continue; }
		const bullet = /^[•·\-*▸►]\s*(.*)$/.exec(line);
		const body = bullet ? bullet[1] : line;
		const f = /^([A-Z][^.:]{0,60}?)[.:]\s+(\S.*)$/.exec(body);
		if (f || bullet) {
			const feat = f ? { name: f[1].trim(), text: f[2].trim() } : { name: `Action ${actions.length + 1}`, text: body };
			(bullet || inActions ? actions : traits).push(feat);
			last = feat;
			lastField = null;
			continue;
		}
		if (last) { last.text = `${last.text} ${line}`.replace(/(\w)- (\w)/g, '$1$2'); continue; }
		if (lastField) { const was = out[lastField]; out[lastField] = `${typeof was === 'string' ? was : ''} ${line}`.trim(); continue; }
		out.flavor = typeof out.flavor === 'string' ? `${out.flavor} ${line}` : line;
		lastField = 'flavor';
	}
	if (traits.length) out.traits = traits;
	if (actions.length) out.actions = actions;
	if (out.hp === undefined && out.hpPerHero === undefined && out.role !== 'minion') { notes.push('No HP was found.'); return null; }
	return { entry: out, notes };
}

/** Our own ```nimble block text, fenced or not. */
function blockText(text: string): string | null {
	const fenced = /^\s*(`{3,}|~{3,})\s*nimble\s*\n([\s\S]*?)\n\s*\1\s*$/m.exec(text);
	const body = fenced ? fenced[2] : text;
	return /^\s*name\s*:/im.test(body) && parseStatblock(body) ? body : null;
}

/** Stat blocks pasted one after another: each starts at the line before (or of) its level header. */
export function splitNimbleText(text: string): string[] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const starts: number[] = [];
	lines.forEach((l, i) => {
		if (!HEADER.test(l.trim())) return;
		const prev = lines[i - 1]?.trim();
		starts.push(prev && !HEADER.test(prev) && !/[.:]$/.test(prev) ? i - 1 : i);
	});
	if (starts.length <= 1) return [text];
	return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join('\n'));
}

export const textNimbleImporter: Importer = {
	id: 'nimble-text',
	label: 'A Nimble stat block (text)',
	system: 'nimble',
	detect: (input) => {
		const t = inputText(input);
		if (!t || /^\s*[[{]/.test(t)) return 0;
		if (blockText(t)) {
			// Fenced, the fence says which game; bare, its keys do.
			const fence = /^\s*(?:`{3,}|~{3,})\s*([\w-]+)/m.exec(t)?.[1]?.toLowerCase();
			if (fence) return fence === 'nimble' ? 0.9 : 0;
			return /^\s*(level|armor|attacks|movement)\s*:/im.test(t) && !/^\s*(ac|cr|armor class|challenge|hit points)\s*:/im.test(t) ? 0.7 : 0.3;
		}
		return looksLikeNimbleText(t) ? 0.55 : 0;
	},
	read: (input) => {
		const t = inputText(input) ?? '';
		const block = blockText(t);
		if (block) {
			const m = parseStatblock(block)!;
			return { bundle: emptyBundle({ system: 'nimble', source: { name: 'Pasted text' }, content: [{ kind: 'monster', name: m.name, statblock: block }] }) };
		}
		const content: BundleEntry[] = [];
		const notes: string[] = [];
		for (const part of splitNimbleText(t)) {
			const r = readNimbleText(part);
			if (!r) { notes.push('A stat block without its level header or HP was left out.'); continue; }
			content.push(r.entry);
			notes.push(...r.notes.map(n => `${r.entry.name}: ${n}`));
		}
		return content.length ? { bundle: emptyBundle({ system: 'nimble', source: { name: 'Pasted text' }, content }), notes } : { error: 'No stat block with a level and HP was found in this.' };
	},
};
