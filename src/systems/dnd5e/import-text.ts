// A 5e stat block pasted as text, the way books and web pages print it
// (copied from a PDF, the SRD, a blog), in both layouts: 2014's "Armor Class
// 15 (leather armor)", "Hit Points 7 (2d6)", the STR DEX CON… table and
// "Challenge 1/4 (50 XP)"; 2024's "AC 15 Initiative +2 (12)", "HP 10 (3d6)",
// the Str 8 −1 −1 rows and "CR 1/4 (XP 50; PB +2)". Lines a PDF wrapped are
// joined back onto the feature they belong to. Also reads our own ```5e
// block text ("name: …" lines), fenced or not.
// Pure: no Obsidian imports.

import { emptyBundle, BundleEntry } from '../../core/import/bundle';
import type { Importer } from '../../core/import/importer';
import { inputText } from '../../core/import/importer';
import { parseStatblock5e } from './parser';

const SIZES = 'Tiny|Small|Medium|Large|Huge|Gargantuan';
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const SECTIONS: Record<string, string> = { traits: 'traits', actions: 'actions', 'bonus actions': 'bonusActions', reactions: 'reactions', 'legendary actions': 'legendaryActions', 'mythic actions': 'legendaryActions', 'lair actions': 'legendaryActions' };
const LABELS: [RegExp, string][] = [
	[/^(?:Armor Class|AC)\b\s*(.*)$/i, 'ac'], [/^(?:Hit Points|HP)\b\s*(.*)$/i, 'hp'], [/^Speed\b\s*(.*)$/i, 'speed'],
	[/^(?:Saving Throws|Saves)\b\s*(.*)$/i, 'saves'], [/^Skills\b\s*(.*)$/i, 'skills'], [/^Senses\b\s*(.*)$/i, 'senses'], [/^Languages\b\s*(.*)$/i, 'languages'],
	[/^(?:Challenge|CR)\b\s*(.*)$/i, 'cr'], [/^Damage Vulnerabilities\b\s*(.*)$/i, 'vulnerabilities'], [/^Vulnerabilities\b\s*(.*)$/i, 'vulnerabilities'],
	[/^Damage Resistances\b\s*(.*)$/i, 'resistances'], [/^Resistances\b\s*(.*)$/i, 'resistances'], [/^Damage Immunities\b\s*(.*)$/i, 'immunities'],
	[/^Condition Immunities\b\s*(.*)$/i, 'conditionImmunities'], [/^Immunities\b\s*(.*)$/i, 'immunities2024'], [/^Gear\b\s*(.*)$/i, 'gear'],
	[/^Proficiency Bonus\b\s*(.*)$/i, 'pb'], [/^Initiative\b\s*(.*)$/i, 'initiative'],
];

const num = (s: string | undefined): number | undefined => {
	const m = /[+\-−–]?\s*\d+/.exec(s ?? '');
	return m ? Number(m[0].replace(/[−–]/, '-').replace(/\s/g, '')) : undefined;
};
const list = (s: string) => s.split(/[;,]\s*/).map(x => x.trim()).filter(Boolean);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Stealth +6, Perception +4" → { Stealth: 6, Perception: 4 }; "Dex +4" → { dex: 4 }. */
function bonuses(s: string, abilities = false): Record<string, number> | undefined {
	const out: Record<string, number> = {};
	for (const m of s.matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+\-−–]\s*\d+)/g)) {
		const k = m[1].trim();
		const key = abilities ? (ABIL.find(a => k.toLowerCase().startsWith(a)) ?? k.toLowerCase()) : k.split(/\s+/).map(cap).join(' ');
		out[key] = Number(m[2].replace(/[−–]/, '-').replace(/\s/g, ''));
	}
	return Object.keys(out).length ? out : undefined;
}

/** A feature line: "Scimitar. Melee Attack Roll…", "Multiattack. …", "Legendary Resistance (3/Day). …". */
const FEATURE = /^([A-Z][^.:]{0,70}?(?:\s\([^)]{1,40}\))?)\.\s+(\S.*)$/;

/** Is this text a 5e stat block as books print it? Enough of AC, HP and CR to be sure. */
export function looksLike5eText(text: string): boolean {
	const t = text.slice(0, 4000);
	const hits = [/^\s*(Armor Class|AC)\s+\d+/im, /^\s*(Hit Points|HP)\s+\d+/im, /^\s*(Challenge|CR)\s+[\d/]+/im, /^\s*Speed\s+\d+/im].filter(re => re.test(t)).length;
	return hits >= 3;
}

/** One stat block's text as a 5e content-pack monster; null when it has no name or no numbers. */
export function read5eText(text: string): { entry: BundleEntry; notes: string[] } | null {
	const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
	if (!lines.length) return null;
	const out: BundleEntry = { kind: 'monster', name: lines[0].replace(/^#+\s*/, '') };
	const notes: string[] = [];
	let i = 1;
	const typeLine = new RegExp(`^(${SIZES})(?:\\s+or\\s+(?:${SIZES}))?\\s+(.+?)(?:,\\s*(.+))?$`, 'i').exec(lines[1] ?? '');
	if (typeLine) { out.size = cap(typeLine[1].toLowerCase()); out.type = typeLine[2]; if (typeLine[3]) out.alignment = typeLine[3]; i = 2; }
	let section = '';
	let last: { name: string; desc: string } | null = null;
	const abilityRows: string[] = [];
	let tableHead = false;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const head = SECTIONS[line.toLowerCase().replace(/:$/, '')];
		if (head) { section = head; last = null; continue; }
		// The 2014 table: STR DEX CON INT WIS CHA, then a row of "8 (−1)".
		if (/^STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA$/i.test(line)) { tableHead = true; continue; }
		if (tableHead) {
			const scores = [...line.matchAll(/(\d+)\s*\([+\-−–]?\d+\)/g)].map(m => Number(m[1]));
			if (scores.length === 6) { out.abilities = scores; tableHead = false; continue; }
		}
		// The 2024 rows: "Str 8 −1 −1 Dex 15 +2 +2 Con 10 +0 +0" (score, modifier, save).
		if (/^(MOD\s+SAVE\s*)+$/i.test(line)) continue;
		if (/\b(Str|Dex|Con|Int|Wis|Cha)\s+\d+\s+[+\-−–]\d+\s+[+\-−–]\d+/i.test(line) && !section) { abilityRows.push(line); continue; }
		if (!section && !last) {
			const label = LABELS.find(([re]) => re.test(line));
			if (label) {
				const v = label[0].exec(line)![1].trim();
				switch (label[1]) {
					case 'ac': {
						const m = /^(\d+)\s*(?:\(([^)]*)\))?\s*(?:Initiative\s+([+\-−–]\d+))?/i.exec(v);
						if (m) { out.ac = Number(m[1]); if (m[2]) out.acNote = m[2]; if (m[3]) out.initiative = num(m[3]); }
						break;
					}
					case 'hp': { const m = /^(\d+)\s*(?:\(([^)]*)\))?/.exec(v); if (m) { out.hp = Number(m[1]); if (m[2]) out.hpFormula = m[2]; } break; }
					case 'speed': out.speed = v; break;
					case 'saves': { const b = bonuses(v, true); if (b) out.saves = b; break; }
					case 'skills': { const b = bonuses(v); if (b) out.skills = b; break; }
					case 'senses': out.senses = v; break;
					case 'languages': out.languages = v; break;
					case 'cr': {
						const m = /^([\d/]+)/.exec(v);
						if (m) out.cr = m[1];
						const xp = /([\d,]+)\s*XP|XP\s*([\d,]+)/i.exec(v);
						if (xp) out.xp = Number((xp[1] ?? xp[2]).replace(/,/g, ''));
						break;
					}
					case 'immunities2024': {
						// 2024 puts damage and conditions on one line: "Poison; Charmed, Poisoned".
						const [dmg, cond] = v.split(';').map(s => s.trim());
						if (dmg) out.immunities = list(dmg).map(cap);
						if (cond) out.conditionImmunities = list(cond).map(cap);
						break;
					}
					case 'vulnerabilities': case 'resistances': case 'immunities': case 'conditionImmunities': out[label[1]] = list(v).map(cap); break;
					case 'gear': out.gear = v; break;
					case 'pb': { const n = num(v); if (n !== undefined) out.pb = n; break; }
					case 'initiative': { const n = num(v); if (n !== undefined) out.initiative = n; break; }
				}
				continue;
			}
		}
		const f = FEATURE.exec(line);
		const into = section || 'traits';
		if (f && (section || !/^(Armor|Hit|Speed|Skills|Senses|Languages|Challenge)\b/.test(f[1]))) {
			last = { name: f[1].trim(), desc: f[2].trim() };
			((out[into] as { name: string; desc: string }[] | undefined) ?? (out[into] = [])).push(last);
			continue;
		}
		if (section === 'legendaryActions' && !last) { out.legendaryIntro = typeof out.legendaryIntro === 'string' ? `${out.legendaryIntro} ${line}` : line; continue; }
		// More of the last feature: a line the PDF wrapped.
		if (last) { last.desc = `${last.desc}${/[-–]$/.test(last.desc) ? '' : ' '}${line}`.replace(/(\w)- (\w)/g, '$1$2'); continue; }
		notes.push(`"${line.length > 60 ? `${line.slice(0, 57)}…` : line}" wasn't read.`);
	}
	if (abilityRows.length) {
		const joined = abilityRows.join(' ');
		const scores: number[] = [];
		const saves: Record<string, number> = {};
		for (const a of ABIL) {
			const m = new RegExp(`\\b${a}\\s+(\\d+)\\s+([+\\-−–]\\d+)\\s+([+\\-−–]\\d+)`, 'i').exec(joined);
			if (!m) continue;
			scores.push(Number(m[1]));
			const mod = num(m[2])!, save = num(m[3])!;
			if (save !== mod) saves[a] = save;
		}
		if (scores.length === 6) out.abilities = scores;
		if (Object.keys(saves).length && !out.saves) out.saves = saves;
	}
	if (out.ac === undefined || out.hp === undefined) return null;
	if (!out.abilities) { notes.push('No ability scores were found, so they\'re all 10.'); out.abilities = [10, 10, 10, 10, 10, 10]; }
	out.cr ??= '0';
	return { entry: out, notes };
}

/** Several stat blocks pasted one after another: each starts at the line before its size-and-type line. */
export function split5eText(text: string): string[] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const starts: number[] = [];
	const typeRe = new RegExp(`^\\s*(${SIZES})\\b`, 'i');
	lines.forEach((l, i) => { if (typeRe.test(l) && i > 0 && lines[i - 1].trim() && /^\s*(Armor Class|AC)\b/i.test(lines.slice(i + 1, i + 4).join('\n'))) starts.push(i - 1); });
	if (starts.length <= 1) return [text];
	return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join('\n'));
}

/** Our own ```5e block text, fenced or not. */
function blockText(text: string): string | null {
	const fenced = /^\s*(`{3,}|~{3,})\s*5e\s*\n([\s\S]*?)\n\s*\1\s*$/m.exec(text);
	const body = fenced ? fenced[2] : text;
	return /^\s*name\s*:/im.test(body) && parseStatblock5e(body) ? body : null;
}

export const text5eImporter: Importer = {
	id: '5e-text',
	label: 'A 5e stat block (text)',
	system: 'dnd5e',
	detect: (input) => {
		const t = inputText(input);
		if (!t || /^\s*[[{]/.test(t)) return 0;
		if (blockText(t)) {
			// Fenced, the fence says which game; bare, its keys do.
			const fence = /^\s*(?:`{3,}|~{3,})\s*([\w-]+)/m.exec(t)?.[1]?.toLowerCase();
			if (fence) return fence === '5e' ? 0.9 : 0;
			return /^\s*(ac|cr|armor class|challenge|hit points)\s*:/im.test(t) && !/^\s*(level|armor|attacks|movement)\s*:/im.test(t) ? 0.7 : 0.3;
		}
		return looksLike5eText(t) ? 0.55 : 0;
	},
	read: (input) => {
		const t = inputText(input) ?? '';
		const block = blockText(t);
		if (block) {
			const m = parseStatblock5e(block)!;
			return { bundle: emptyBundle({ system: 'dnd5e', source: { name: 'Pasted text' }, content: [{ kind: 'monster', name: m.name, statblock: block }] }) };
		}
		const content: BundleEntry[] = [];
		const notes: string[] = [];
		for (const part of split5eText(t)) {
			const r = read5eText(part);
			if (!r) { notes.push('A stat block without its AC or HP was left out.'); continue; }
			content.push(r.entry);
			notes.push(...r.notes.map(n => `${r.entry.name}: ${n}`));
		}
		return content.length ? { bundle: emptyBundle({ system: 'dnd5e', source: { name: 'Pasted text' }, content }), notes } : { error: 'No stat block with an AC and HP was found in this.' };
	},
};
