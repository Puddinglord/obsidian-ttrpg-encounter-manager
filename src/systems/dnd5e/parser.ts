// The ```5e stat block format. Pure: no Obsidian imports.
//
//   name: Goblin
//   size: Small
//   type: Humanoid (Goblinoid)
//   alignment: Neutral Evil
//   ac: 15 (leather armor, shield)
//   hp: 7 (2d6)
//   speed: 30 ft.
//   str: 8            (or one line: abilities: 8, 14, 10, 10, 8, 8)
//   dex: 14
//   saves: Dex +4
//   skills: Stealth +6
//   senses: darkvision 60 ft., passive Perception 9
//   languages: Common, Goblin
//   cr: 1/4
//   traits:
//   - Nimble Escape: The goblin can take the Disengage or Hide action as a bonus action.
//   actions:
//   - Scimitar: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
//
// Field names are forgiving: "Armor Class", "Hit Points", "Challenge", "Damage
// Resistances" all work, as do list items written "- **Name.** text".

import { ABILITIES, AbilityKey, Dnd5eMonster, Feature5e } from './types';
import { abilityMod, pbForCr, xpForCr } from './rules';
import { asEdition } from './editions';

export const STATBLOCK_LANG = '5e';

type ListKey = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions';

const LIST_KEYS: Record<string, ListKey> = {
	traits: 'traits', trait: 'traits', 'special abilities': 'traits', features: 'traits',
	actions: 'actions', action: 'actions',
	'bonus actions': 'bonusActions', 'bonus action': 'bonusActions',
	reactions: 'reactions', reaction: 'reactions',
	'legendary actions': 'legendaryActions', 'legendary action': 'legendaryActions',
};

const ABILITY_WORDS: Record<string, AbilityKey> = {
	str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con', constitution: 'con',
	int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis', cha: 'cha', charisma: 'cha',
};

const num = (s: string): number | undefined => {
	const m = /[+\-−]?\d+/.exec(s);
	return m ? Number(m[0].replace('−', '-')) : undefined;
};

/** "15 (leather armor, shield)" → 15 and the note. */
function parseAc(v: string): { ac?: number; note?: string } {
	const m = /^\s*(\d+)\s*(?:\((.*)\))?/.exec(v);
	return m ? { ac: Number(m[1]), note: m[2]?.trim() || undefined } : {};
}

/** Average of "2d6+3" (rounded down), or undefined. */
export function averageRoll(formula: string): number | undefined {
	const m = /^\s*(\d+)\s*d\s*(\d+)\s*(?:([+\-−])\s*(\d+))?\s*$/i.exec(formula);
	if (!m) return undefined;
	const mod = m[4] ? Number(m[4]) * (m[3] === '+' ? 1 : -1) : 0;
	return Math.max(1, Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2) + mod);
}

/** "7 (2d6)", "7", or "2d6" (its average). */
function parseHp(v: string): { hp?: number; formula?: string } {
	const m = /^\s*(\d+)\s*(?:\((.*)\))?\s*$/.exec(v);
	if (m) return { hp: Number(m[1]), formula: m[2]?.trim() || undefined };
	const avg = averageRoll(v);
	return avg !== undefined ? { hp: avg, formula: v.trim() } : {};
}

/** "Dex +4, Con +2" → { dex: 4, con: 2 }. */
function parseSaves(v: string): Partial<Record<AbilityKey, number>> {
	const out: Partial<Record<AbilityKey, number>> = {};
	for (const part of v.split(/[,;]/)) {
		const m = /([a-z]+)\s*([+\-−]\s*\d+)/i.exec(part.trim());
		const key = m && ABILITY_WORDS[m[1].toLowerCase()];
		if (m && key) out[key] = Number(m[2].replace(/\s/g, '').replace('−', '-'));
	}
	return out;
}

/** "Stealth +6, Perception +2" → { Stealth: 6, Perception: 2 }. */
function parseSkills(v: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const part of v.split(/[,;]/)) {
		const m = /^\s*([A-Za-z][A-Za-z ]*?)\s*([+\-−]\s*\d+)\s*$/.exec(part);
		if (m) out[m[1].trim()] = Number(m[2].replace(/\s/g, '').replace('−', '-'));
	}
	return out;
}

/** "cold; fire" or "cold, fire": semicolons win, so "bludgeoning, piercing, and slashing from nonmagical weapons" stays one item. */
const list = (v: string) => v.split(v.includes(';') ? ';' : ',').map(s => s.trim()).filter(Boolean);

/** "- Name: text", "- **Name.** text", "- Name. text" → a feature. */
function parseFeature(line: string): Feature5e {
	const body = line.replace(/^\s*[-*]\s*/, '');
	const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(body);
	if (bold) return { name: bold[1].replace(/[.:]\s*$/, '').trim(), desc: bold[2].trim() };
	const colon = body.indexOf(': ');
	if (colon > 0 && colon < 80) return { name: body.slice(0, colon).trim(), desc: body.slice(colon + 2).trim() };
	const dot = /^([^.]{1,60})\.\s+(.*)$/.exec(body);
	if (dot) return { name: dot[1].trim(), desc: dot[2].trim() };
	return { name: body.trim(), desc: '' };
}

/** Parse a ```5e block. Null when it has no name. */
export function parseStatblock5e(source: string): Dnd5eMonster | null {
	const m: Partial<Dnd5eMonster> & { abilities: Dnd5eMonster['abilities'] } = { abilities: [10, 10, 10, 10, 10, 10] };
	let current: ListKey | 'description' | null = null;
	let last: Feature5e | null = null;
	const desc: string[] = [];
	/** A blank line since the last text: the next line of the same item starts a new paragraph. */
	let blank = false;

	for (const raw of source.split('\n')) {
		const line = raw.replace(/\s+$/, '');
		if (!line.trim()) { if (current === 'description') desc.push(''); blank = true; continue; }
		const gap = blank ? '\n\n' : '\n';
		blank = false;
		// A list item under a list heading.
		// (Indented bullets are part of the item above: a spellcaster's spell list.)
		if (current && current !== 'description' && /^ ?[-*]\s+/.test(line)) {
			last = parseFeature(line);
			(m[current] ??= []).push(last);
			continue;
		}
		const kv = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(line);
		const key = kv?.[1].toLowerCase();
		const isField = !!key && (key in LIST_KEYS || key in ABILITY_WORDS || FIELD_KEYS.has(key));
		if (!kv || !isField) {
			// Text under a list: the legendary actions' opening line, or more of the last item.
			if (current === 'description') desc.push(line.trim());
			else if (current === 'legendaryActions' && !last) m.legendaryIntro = m.legendaryIntro ? `${m.legendaryIntro} ${line.trim()}` : line.trim();
			else if (last) last.desc = last.desc ? `${last.desc}${gap}${line.trim()}` : line.trim();
			continue;
		}
		const value = kv[2].trim();
		current = null;
		last = null;
		if (key in LIST_KEYS) { current = LIST_KEYS[key]; if (value) (m[current] ??= []).push(last = parseFeature(`- ${value}`)); continue; }
		if (key in ABILITY_WORDS) { const n = num(value); if (n !== undefined) m.abilities[ABILITIES.indexOf(ABILITY_WORDS[key])] = n; continue; }
		applyField(m, key, value);
		if (key === 'description' || key === 'lore') { current = 'description'; if (value) desc.push(value); }
	}
	if (desc.length) m.description = desc.join('\n').trim();
	if (!m.name) return null;
	m.ac ??= 10 + abilityMod(m.abilities[1]);
	m.hp ??= 1;
	m.cr ??= '0';
	m.xp ??= xpForCr(m.cr);
	m.pb ??= pbForCr(m.cr);
	return m as Dnd5eMonster;
}

const FIELD_KEYS = new Set([
	'name', 'size', 'type', 'alignment', 'ac', 'armor class', 'armor', 'hp', 'hit points', 'speed', 'abilities', 'stats',
	'saves', 'saving throws', 'skills', 'vulnerabilities', 'damage vulnerabilities', 'resistances', 'damage resistances',
	'immunities', 'damage immunities', 'condition immunities', 'senses', 'languages', 'cr', 'challenge', 'challenge rating',
	'xp', 'lair xp', 'xp in lair', 'initiative', 'pb', 'proficiency bonus', 'gear', 'edition', 'rules', 'source', 'description', 'lore',
]);

function applyField(m: Partial<Dnd5eMonster> & { abilities: Dnd5eMonster['abilities'] }, key: string, v: string): void {
	switch (key) {
		case 'name': m.name = v; break;
		case 'size': m.size = v; break;
		case 'type': m.type = v; break;
		case 'alignment': m.alignment = v; break;
		case 'ac': case 'armor class': case 'armor': { const a = parseAc(v); if (a.ac !== undefined) m.ac = a.ac; if (a.note) m.acNote = a.note; break; }
		case 'hp': case 'hit points': { const h = parseHp(v); if (h.hp !== undefined) m.hp = h.hp; if (h.formula) m.hpFormula = h.formula; break; }
		case 'speed': m.speed = v; break;
		case 'abilities': case 'stats': {
			const ns = v.match(/\d+/g)?.map(Number) ?? [];
			if (ns.length >= 6) m.abilities = [ns[0], ns[1], ns[2], ns[3], ns[4], ns[5]];
			break;
		}
		case 'saves': case 'saving throws': m.saves = parseSaves(v); break;
		case 'skills': m.skills = parseSkills(v); break;
		case 'vulnerabilities': case 'damage vulnerabilities': m.vulnerabilities = list(v); break;
		case 'resistances': case 'damage resistances': m.resistances = list(v); break;
		case 'immunities': case 'damage immunities': m.immunities = list(v); break;
		case 'condition immunities': m.conditionImmunities = list(v); break;
		case 'senses': m.senses = v; break;
		case 'languages': m.languages = v; break;
		case 'cr': case 'challenge': case 'challenge rating': {
			// "1/4 (50 XP)" carries its XP too.
			const cr = /^\s*(\d+\s*\/\s*\d+|\d+)/.exec(v);
			if (cr) m.cr = cr[1].replace(/\s/g, '');
			const xp = /([\d,]+)\s*XP/i.exec(v);
			if (xp) m.xp = Number(xp[1].replace(/,/g, ''));
			break;
		}
		case 'xp': { const n = Number(v.replace(/[,\s]/g, '').replace(/xp$/i, '')); if (Number.isFinite(n)) m.xp = n; break; }
		case 'lair xp': case 'xp in lair': { const n = Number(v.replace(/[,\s]/g, '').replace(/xp$/i, '')); if (Number.isFinite(n)) m.xpLair = n; break; }
		case 'initiative': { const n = num(v); if (n !== undefined) m.initiative = n; break; }
		case 'pb': case 'proficiency bonus': { const n = num(v); if (n !== undefined) m.pb = n; break; }
		case 'gear': m.gear = v; break;
		case 'edition': case 'rules': m.edition = asEdition(v); break;
		case 'source': m.source = v; break;
	}
}

/** Find the bodies of every ```5e block in a note. */
export function extract5eBlocks(content: string): string[] {
	const out: string[] = [];
	const re = /^(\s*)(`{3,}|~{3,})\s*5e\s*$([\s\S]*?)^\1\2\s*$/gm;
	for (let m = re.exec(content); m; m = re.exec(content)) out.push(m[3].replace(/^\n/, ''));
	return out;
}

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** A monster as ```5e block text (the body, without the fences). */
export function toStatblockSource5e(m: Dnd5eMonster): string {
	const lines: string[] = [`name: ${m.name}`];
	const add = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== '') lines.push(`${k}: ${v}`); };
	add('edition', m.edition);
	add('size', m.size);
	add('type', m.type);
	add('alignment', m.alignment);
	add('ac', m.acNote ? `${m.ac} (${m.acNote})` : m.ac);
	add('hp', m.hpFormula ? `${m.hp} (${m.hpFormula})` : m.hp);
	add('speed', m.speed);
	if (m.initiative !== undefined) add('initiative', signed(m.initiative));
	ABILITIES.forEach((a, i) => add(a, m.abilities[i]));
	if (m.saves && Object.keys(m.saves).length) add('saves', Object.entries(m.saves).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${signed(v)}`).join(', '));
	if (m.skills && Object.keys(m.skills).length) add('skills', Object.entries(m.skills).map(([k, v]) => `${k} ${signed(v)}`).join(', '));
	// A comma inside an item: separate with semicolons (one such item gets a trailing one).
	const items = (xs: string[] | undefined) => (xs?.some(x => x.includes(',')) ? `${xs.join('; ')}${xs.length === 1 ? ';' : ''}` : xs?.join(', '));
	add('vulnerabilities', items(m.vulnerabilities));
	add('resistances', items(m.resistances));
	add('immunities', items(m.immunities));
	add('condition immunities', items(m.conditionImmunities));
	add('gear', m.gear);
	add('senses', m.senses);
	add('languages', m.languages);
	add('cr', m.xp !== undefined && m.xp !== xpForCr(m.cr) ? `${m.cr} (${m.xp} XP)` : m.cr);
	add('lair xp', m.xpLair);
	if (m.pb !== undefined && m.pb !== pbForCr(m.cr)) add('pb', signed(m.pb));
	const section = (label: string, items: Feature5e[] | undefined, intro?: string) => {
		if (!items?.length) return;
		lines.push(`${label}:`);
		if (intro) lines.push(intro);
		for (const f of items) lines.push(`- ${f.name}: ${f.desc.replace(/\n(?=.)/g, '\n  ')}`);
	};
	section('traits', m.traits);
	section('actions', m.actions);
	section('bonus actions', m.bonusActions);
	section('reactions', m.reactions);
	section('legendary actions', m.legendaryActions, m.legendaryIntro);
	if (m.description) lines.push(`description: ${m.description}`);
	return lines.join('\n');
}
