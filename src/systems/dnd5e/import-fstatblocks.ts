// A creature written for the Fantasy Statblocks plugin (its 5e layout) as a
// Dnd5eMonster, ready for toStatblockSource5e and a ```5e block. Pure: no
// Obsidian imports.
//
// Takes the YAML of a ```statblock block (with or without its fence), JSON,
// or an object already parsed; a Fantasy Statblocks bestiary export (a list
// of creatures) works with importFantasyStatblocks. Their fields:
//   name, size, type, subtype, alignment, ac (or ac_class), hp, hit_dice, speed,
//   stats [6], saves [{ dexterity: 9 }], skillsaves [{ perception: 16 }],
//   damage_vulnerabilities / _resistances / _immunities, condition_immunities,
//   senses, languages, cr, spells, traits / actions / bonus_actions / reactions /
//   legendary_actions ([{ name, desc }]), legendary_description, lair_actions,
//   mythic_actions, mythic_description, regional_effects, source.
//
// What comes out reads back the same: parseStatblock5e(toStatblockSource5e(m))
// equals m. That shapes the clean-up below (one-line fields, no ": " in a
// feature's name, text lines that can't be taken for a field).

import { SKILLS } from './character';
import type { Dnd5eEdition } from './editions';
import { isStatblockField5e } from './parser';
import { pbForCr, xpForCr } from './rules';
import { ABILITIES, type AbilityKey, type Dnd5eMonster, type Feature5e } from './types';
import { parseYamlLite } from './yaml-lite';

export interface FsImport {
	monster: Dnd5eMonster;
	name: string;
	/** Where it's from, if the creature says ("My Homebrew, p. 3"). The ```5e block doesn't keep it; a note's frontmatter can. */
	source?: string;
	/** Plain-language warnings about what didn't carry over. */
	notes: string[];
}

export interface FsImportOptions {
	/** Lay it out for these rules (sets the block's `edition:`). */
	edition?: Dnd5eEdition;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** One line of text: numbers as written, whitespace collapsed. */
const line = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

const num = (v: unknown): number | undefined => {
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	const m = typeof v === 'string' ? /^\s*([+\-−]?\s*\d+(?:\.\d+)?)/.exec(v) : null;
	return m ? Number(m[1].replace(/\s/g, '').replace('−', '-')) : undefined;
};

const ABILITY_WORDS: Record<string, AbilityKey> = {
	str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con', constitution: 'con',
	int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis', cha: 'cha', charisma: 'cha',
};

// ----------------------------------------------------------------------------
// Reading the input.

/** The YAML or JSON text of a ```statblock block (fence optional), or an object, as creature objects. */
export function fantasyStatblockCreatures(input: unknown): Obj[] {
	let raw = input;
	if (typeof raw === 'string') {
		let text = raw.trim();
		if (!text) throw new Error('There is nothing to import. Paste the creature’s stat block, or choose its file.');
		// The first ```statblock (or any fenced) block, when the text has one.
		const fence = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s*\1\s*$/m.exec(text);
		if (fence) text = fence[2];
		if (/^[[{]/.test(text.trim())) {
			try { raw = JSON.parse(text) as unknown; } catch { raw = parseYamlLite(text); }
		} else raw = parseYamlLite(text);
	}
	const list = Array.isArray(raw) ? raw.filter(isObj) : isObj(raw) ? [isObj(raw.monster) ? raw.monster : raw] : [];
	const creatures = list.filter(c => line(c.name));
	if (!creatures.length) throw new Error('That isn’t a Fantasy Statblocks creature: it needs at least a name.');
	return creatures;
}

/** A CR as the 5e block writes it: 0.25 → "1/4". */
function crOf(v: unknown): string {
	if (typeof v === 'number') {
		const frac: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.5': '1/2' };
		return frac[String(v)] ?? (Number.isInteger(v) && v >= 0 ? String(v) : '0');
	}
	const s = line(v);
	const m = /^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/.exec(s);
	if (!m) return '0';
	return m[1].includes('.') ? crOf(Number(m[1])) : m[1].replace(/\s/g, '');
}

/** "+9", 9 or "9" → 9. */
const bonusOf = (v: unknown): number | undefined => {
	const n = num(v);
	return n === undefined ? undefined : Math.trunc(n);
};

/** Entries of a list of one-key objects ([{ dexterity: 9 }]), a map ({ dex: 9 }), or a list of { name, desc|value }. */
function pairs(v: unknown): [string, unknown][] {
	if (isObj(v)) return Object.entries(v);
	if (!Array.isArray(v)) return typeof v === 'string' ? v.split(/[,;]/).map(p => { const m = /^\s*(.*?)\s*([+\-−]\s*\d+)\s*$/.exec(p); return m ? [m[1], m[2]] as [string, unknown] : null; }).filter((x): x is [string, unknown] => !!x) : [];
	return v.flatMap((x): [string, unknown][] => {
		if (!isObj(x)) return [];
		if ('name' in x && ('desc' in x || 'value' in x)) return [[line(x.name), x.desc ?? x.value]];
		return Object.entries(x);
	});
}

function savesOf(v: unknown): Partial<Record<AbilityKey, number>> | undefined {
	const out: Partial<Record<AbilityKey, number>> = {};
	for (const [k, val] of pairs(v)) {
		const a = ABILITY_WORDS[k.toLowerCase().replace(/[^a-z]/g, '').replace(/savingthrows?$|saves?$/, '')];
		const n = bonusOf(val);
		if (a && n !== undefined) out[a] = n;
	}
	return Object.keys(out).length ? out : undefined;
}

function skillsOf(v: unknown): Record<string, number> | undefined {
	const out: Record<string, number> = {};
	for (const [k, val] of pairs(v)) {
		const n = bonusOf(val);
		const known = SKILLS.find(s => s.name.toLowerCase().replace(/[^a-z]/g, '') === k.toLowerCase().replace(/[^a-z]/g, ''));
		// The 5e block reads "Name +N", so a name is letters and spaces.
		const name = known?.name ?? k.replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
		if (name && n !== undefined) out[name] = n;
	}
	return Object.keys(out).length ? out : undefined;
}

/**
 * "fire, poison" → two; "bludgeoning, piercing, and slashing from nonmagical attacks" stays one
 * (a qualified list); semicolons always split.
 */
function damageList(v: unknown): string[] | undefined {
	const parts = (Array.isArray(v) ? v.map(line) : [line(v)]).flatMap(s => s.split(';'));
	const out: string[] = [];
	for (const p of parts) {
		const t = p.trim();
		if (!t) continue;
		if (/\b(from|that|except|unless|while|when|in)\b/i.test(t) && t.includes(',')) out.push(t);
		else out.push(...t.split(',').map(x => x.trim().replace(/^and\s+/i, '')).filter(Boolean));
	}
	return out.length ? out : undefined;
}

/** Text as the 5e block keeps it: lines trimmed, one blank line at most, and no line that reads as a field. */
function textOf(v: unknown): string {
	const raw = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(textOf).filter(Boolean).join('\n') : '';
	const out: string[] = [];
	for (const l of raw.replace(/\r/g, '').split('\n').map(x => x.trim())) {
		if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
		// "Actions: …" on a line of its own would start a new section: keep it with the line above.
		if (out.length && out[out.length - 1] !== '' && isStatblockField5e(l)) out[out.length - 1] += ` ${l}`;
		else if (out.length && out[out.length - 1] === '' && isStatblockField5e(l)) { out.pop(); out[out.length - 1] += ` ${l}`; }
		else out.push(l);
	}
	while (out[out.length - 1] === '') out.pop();
	return out.join('\n');
}

/** A feature's name as the block can read it back: one line, no ": ", no bold, no trailing stop. */
function featureName(v: unknown): string {
	let n = line(v).replace(/\*\*/g, '').replace(/:\s+/g, ' – ').replace(/[.:]+$/, '').trim();
	if (n.length > 75) n = `${n.slice(0, 74).trim()}…`;
	return n;
}

function features(v: unknown): Feature5e[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: Feature5e[] = [];
	for (const x of v) {
		let name = '';
		let desc = '';
		if (isObj(x)) {
			name = featureName(x.name);
			desc = textOf(x.desc ?? x.description ?? x.text ?? x.entries);
		} else if (typeof x === 'string') {
			// "Name. Text" or "Name: Text".
			const m = /^\s*(?:\*\*)?([^.:*]{1,60}?)(?:\*\*)?[.:]\s+([\s\S]*)$/.exec(x);
			name = featureName(m ? m[1] : x);
			desc = m ? textOf(m[2]) : '';
		}
		if (!name && !desc) continue;
		// With no text after it, "Name. More" would read back as a name and its text.
		if (!desc) name = name.replace(/\.\s+/g, ' – ');
		out.push({ name: name || 'Note', desc });
	}
	return out.length ? out : undefined;
}

/** The `spells` list as a Spellcasting trait: the first line, then "Level: spells". */
function spellcasting(v: unknown, notesText: unknown): Feature5e | undefined {
	if (!Array.isArray(v)) return undefined;
	const lines = v.map(x => (isObj(x) ? Object.entries(x).map(([k, val]) => `${line(k)}: ${line(val)}`).join('\n') : line(x))).filter(Boolean);
	const extra = textOf(notesText);
	if (extra) lines.push(extra);
	const desc = textOf(lines.join('\n'));
	return desc ? { name: 'Spellcasting', desc } : undefined;
}

// ----------------------------------------------------------------------------

/** One Fantasy Statblocks creature as a 5e monster. Throws a plain Error when the input has no creature. */
export function importFantasyStatblock(input: unknown, opts: FsImportOptions = {}): FsImport {
	return fromCreature(fantasyStatblockCreatures(input)[0], opts);
}

/** Every creature in the input: one block, or a bestiary export. */
export function importFantasyStatblocks(input: unknown, opts: FsImportOptions = {}): FsImport[] {
	return fantasyStatblockCreatures(input).map(c => fromCreature(c, opts));
}

function fromCreature(c: Obj, opts: FsImportOptions): FsImport {
	const notes: string[] = [];
	const name = line(c.name);

	// Abilities: stats [6], as numbers or "[10, 12, …]".
	const stats = Array.isArray(c.stats) ? c.stats : typeof c.stats === 'string' ? c.stats.match(/\d+/g) ?? [] : [];
	const abilities = ABILITIES.map((_, i) => Math.max(1, Math.min(30, Math.round(num(stats[i]) ?? 10)))) as Dnd5eMonster['abilities'];
	if (stats.length < 6) notes.push(stats.length ? 'Fewer than six ability scores; the rest are 10.' : 'No ability scores; they are all 10.');

	// AC: a number, "17 (natural armor)", or ac_class [{ ac, armor_type }].
	let ac: number | undefined;
	let acNote: string | undefined;
	const acText = line(c.ac);
	const acm = /^(\d+)\s*(?:\((.*)\))?/.exec(acText);
	if (acm) { ac = Number(acm[1]); acNote = line(acm[2]) || undefined; }
	const acClass = Array.isArray(c.ac_class) ? c.ac_class.filter(isObj)[0] : isObj(c.ac_class) ? c.ac_class : undefined;
	if (acClass) {
		ac ??= num(acClass.ac);
		acNote ??= line(acClass.armor_type) || undefined;
	}
	if (ac === undefined) { ac = 10 + Math.floor((abilities[1] - 10) / 2); notes.push(`No armor class; it is ${ac} from Dexterity.`); }
	if (acNote) acNote = acNote.replace(/[()]/g, '');

	// HP: a number or "7 (2d6)"; hit_dice is the formula.
	let hp: number | undefined;
	let hpFormula: string | undefined;
	const hpm = /^(\d+)\s*(?:\((.*)\))?/.exec(line(c.hp));
	if (hpm) { hp = Number(hpm[1]); hpFormula = line(hpm[2]) || undefined; }
	const dice = line(c.hit_dice);
	if (dice) hpFormula = dice.replace(/[()]/g, '');
	if (hp === undefined) {
		const avg = /^(\d+)\s*d\s*(\d+)\s*(?:([+\-−])\s*(\d+))?$/i.exec(hpFormula ?? '');
		hp = avg ? Math.max(1, Math.floor(Number(avg[1]) * (Number(avg[2]) + 1) / 2) + (avg[4] ? Number(avg[4]) * (avg[3] === '+' ? 1 : -1) : 0)) : 1;
		if (!avg) notes.push('No hit points; it has 1.');
	}

	const type = line(c.type);
	const subtype = line(c.subtype);
	const cr = crOf(c.cr);
	const m: Dnd5eMonster = { name, ac, hp, abilities, cr, xp: xpForCr(cr), pb: pbForCr(cr) };
	if (opts.edition) m.edition = opts.edition;
	const set = <K extends keyof Dnd5eMonster>(k: K, v: Dnd5eMonster[K] | undefined | '') => { if (v !== undefined && v !== '') m[k] = v; };
	set('size', line(c.size));
	set('type', subtype && type && !type.includes('(') ? `${type} (${subtype})` : type || subtype);
	set('alignment', line(c.alignment));
	set('acNote', acNote);
	set('hpFormula', hpFormula);
	set('speed', line(c.speed));
	set('saves', savesOf(c.saves));
	set('skills', skillsOf(c.skillsaves ?? c.skills));
	set('vulnerabilities', damageList(c.damage_vulnerabilities));
	set('resistances', damageList(c.damage_resistances));
	set('immunities', damageList(c.damage_immunities));
	set('conditionImmunities', damageList(c.condition_immunities));
	set('senses', line(c.senses));
	set('languages', line(c.languages));

	const traits = features(c.traits) ?? [];
	const spells = spellcasting(c.spells, c.spellsNotes);
	if (spells) traits.push(spells);
	set('traits', traits.length ? traits : undefined);
	set('actions', features(c.actions));
	set('bonusActions', features(c.bonus_actions));
	set('reactions', features(c.reactions));
	set('legendaryActions', features(c.legendary_actions));
	// The intro sits on one line under "legendary actions:".
	const intro = line(c.legendary_description).replace(/^[-*]\s+/, '');
	if (m.legendaryActions && intro && !isStatblockField5e(intro)) m.legendaryIntro = intro;

	// What the 5e block has no place for goes in its description.
	const extra: string[] = [];
	const section = (label: string, list: unknown, intro?: unknown) => {
		const fs = features(list);
		const lead = textOf(intro).replace(/\n+/g, ' ');
		if (!fs && !lead) return;
		extra.push(`**${label}.**${lead ? ` ${lead}` : ''}`);
		for (const f of fs ?? []) extra.push(`- **${f.name}.** ${f.desc.replace(/\n+/g, ' ')}`.trim());
	};
	section('Lair Actions', c.lair_actions);
	section('Regional Effects', c.regional_effects);
	section('Mythic Actions', c.mythic_actions, c.mythic_description);
	if (extra.length) {
		m.description = extra.join('\n');
		notes.push('Lair actions, regional effects and mythic actions are in the description.');
	}

	if (line(c.creature) && !Array.isArray(c.stats)) notes.push(`It builds on “${line(c.creature)}” from your Fantasy Statblocks bestiary, which isn’t included; fill in what’s missing.`);
	const source = Array.isArray(c.source) ? c.source.map(line).filter(Boolean).join(', ') : line(c.source);
	return { monster: m, name, notes, ...(source ? { source } : {}) };
}
