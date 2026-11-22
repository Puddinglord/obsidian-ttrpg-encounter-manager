// A 5e NPC note's fight stats. NPC notes are core's; 5e adds a mini character
// sheet for the GM, its numbers from one of three places:
//   - a linked stat block, `statblock: Priest`, with the NPC's own AC, HP and CR on top;
//   - the note itself (every key below is optional, and falls back to the block);
//   - nowhere: a story NPC.
// Pure: no Obsidian imports.
//
//   statblock: Priest     ac: 15     hp: 27 (5d8 + 5)     cr: 2      (written into new NPC notes)
//   hp_now: 20            what's left after a fight in the note (missing: full)
//   str: 15 … cha: 10     saves: [con]  or  "Con +4"
//   skills: { athletics: 4 }  or  "Athletics +4, Perception +2"
//   speed: 25 ft          senses: darkvision 60 ft     languages: Common, Dwarvish
//   actions:              (bonus_actions:, reactions:) one line each, in the stat block's words
//     - "Bell hammer: Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Bludgeoning damage."

import type { NoteField } from '../../core/note-kinds';
import { fieldText } from '../../core/note-kinds';
import { averageRoll, parseFeature, parseSaves, parseSkills } from './parser';
import { abilityMod, pbForCr } from './rules';
import { ABILITIES, AbilityKey, Dnd5eMonster, Feature5e } from './types';

const OPTIONAL = { gmOnly: true, hideInStats: true, optional: true } as const;

/** The NPC fields 5e adds. The card draws them as a mini sheet, so none are chips. */
export const NPC_FIELDS_5E: readonly NoteField[] = [
	{ key: 'ac', label: 'AC', type: 'number', gmOnly: true, hideInStats: true },
	{ key: 'hp', label: 'HP', gmOnly: true, hideInStats: true },
	{ key: 'cr', label: 'CR', gmOnly: true, hideInStats: true },
	{ key: 'statblock', label: 'Stats', gmOnly: true, hideInStats: true },
	{ key: 'hp_now', label: 'HP now', type: 'number', ...OPTIONAL },
	...ABILITIES.map((a): NoteField => ({ key: a, label: a.toUpperCase(), ...OPTIONAL })),
	{ key: 'saves', label: 'Saves', ...OPTIONAL },
	{ key: 'skills', label: 'Skills', ...OPTIONAL },
	{ key: 'speed', label: 'Speed', ...OPTIONAL },
	{ key: 'senses', label: 'Senses', ...OPTIONAL },
	{ key: 'languages', label: 'Languages', ...OPTIONAL },
	{ key: 'actions', label: 'Actions', ...OPTIONAL },
	{ key: 'bonus_actions', label: 'Bonus actions', ...OPTIONAL },
	{ key: 'reactions', label: 'Reactions', ...OPTIONAL },
];

/** "22", "22 (4d8 + 4)", "4d8+4" → { hp: 22, formula: "4d8 + 4" }. */
export function readHp(v: unknown): { hp: number; formula?: string } | undefined {
	const s = fieldText({ key: 'hp', label: 'HP' }, v);
	const m = /^(\d+)\s*(?:\(([^)]+)\))?$/.exec(s);
	if (m) return { hp: Number(m[1]), ...(m[2] ? { formula: m[2].trim() } : {}) };
	const avg = s ? averageRoll(s) : undefined;
	return avg !== undefined ? { hp: avg, formula: s } : undefined;
}

/** The `statblock:` property's monster name: "Veteran", "[[Veteran]]", "`5e:Veteran`". */
export function statblockName(v: unknown): string {
	return fieldText({ key: 'statblock', label: '' }, v)
		.replace(/^`?5e:/i, '').replace(/`$/, '')
		.replace(/^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/, '$1')
		.trim();
}

const text = (v: unknown): string => fieldText({ key: '', label: '' }, v);
const ABILITY_WORDS: Record<string, AbilityKey> = {
	str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con', constitution: 'con',
	int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis', cha: 'cha', charisma: 'cha',
};
const SKILL_NAMES = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation',
	'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
export const SKILL_ABILITY: Record<string, AbilityKey> = {
	Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis', Intimidation: 'cha',
	Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha', Religion: 'int',
	'Sleight of Hand': 'dex', Stealth: 'dex', Survival: 'wis',
};
const skillName = (s: string) => SKILL_NAMES.find(n => n.toLowerCase().replace(/[^a-z]/g, '') === s.toLowerCase().replace(/[^a-z]/g, '')) ?? s.trim();

/** `actions:` as written: a list of "Name: text" lines, or one such line. */
function features(v: unknown): Feature5e[] | undefined {
	const lines = Array.isArray(v) ? v.map(text) : typeof v === 'string' && v.trim() ? [v] : [];
	const out = lines.filter(Boolean).map(l => parseFeature(`- ${l}`)).filter(f => f.name);
	return out.length ? out : undefined;
}

/** What the note types in, on top of (or instead of) a stat block. */
function typed(fm: Record<string, unknown>, base: Dnd5eMonster | undefined, cr: string): Partial<Dnd5eMonster> {
	const out: Partial<Dnd5eMonster> = {};
	const scores = ABILITIES.map((a, i) => {
		const n = Number(text(fm[a]));
		return text(fm[a]) && Number.isFinite(n) ? n : base?.abilities[i] ?? 10;
	}) as Dnd5eMonster['abilities'];
	if (ABILITIES.some(a => text(fm[a]))) out.abilities = scores;
	// Saves: proficient abilities ([con, wis]) take the proficiency bonus; "Con +4" says the bonus.
	const sv = fm.saves;
	if (Array.isArray(sv) || (typeof sv === 'string' && sv.trim())) {
		const said = typeof sv === 'string' ? parseSaves(sv) : {};
		if (Object.keys(said).length) out.saves = said;
		else {
			const pb = pbForCr(cr || base?.cr);
			const words = (Array.isArray(sv) ? sv.map(text) : String(sv).split(/[,;]/)).map(w => ABILITY_WORDS[w.trim().toLowerCase()]).filter((a): a is AbilityKey => !!a);
			if (words.length) out.saves = Object.fromEntries(words.map(a => [a, abilityMod(scores[ABILITIES.indexOf(a)]) + pb]));
		}
	}
	const sk = fm.skills;
	if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
		const skills: Record<string, number> = {};
		for (const [k, v] of Object.entries(sk as Record<string, unknown>)) {
			const n = Number(text(v).replace('−', '-'));
			if (text(v) && Number.isFinite(n)) skills[skillName(k)] = n;
		}
		out.skills = skills;
	} else if (text(sk)) out.skills = Object.fromEntries(Object.entries(parseSkills(text(sk))).map(([k, v]) => [skillName(k), v]));
	if (text(fm.speed)) out.speed = text(fm.speed);
	if (text(fm.senses)) out.senses = text(fm.senses);
	if (text(fm.languages)) out.languages = text(fm.languages);
	const actions = features(fm.actions);
	if (actions) out.actions = actions;
	const bonus = features(fm.bonus_actions);
	if (bonus) out.bonusActions = bonus;
	const reactions = features(fm.reactions);
	if (reactions) out.reactions = reactions;
	return out;
}

/**
 * The NPC as a monster for the tracker and its card: its stat block (when it names one) with
 * the NPC's own name, AC, HP and typed stats on top; or, with no stat block, one from its own
 * properties (abilities 10 unless it says otherwise). Undefined when there's nothing to fight with.
 */
export function npcMonster5e(name: string, fm: Record<string, unknown>, base?: Dnd5eMonster): Dnd5eMonster | undefined {
	const ac = Number(fieldText({ key: 'ac', label: '', type: 'number' }, fm.ac)) || undefined;
	const hp = readHp(fm.hp);
	const cr = fieldText({ key: 'cr', label: '' }, fm.cr);
	const own = typed(fm, base, cr);
	if (base) {
		return {
			...base, name,
			...(ac ? { ac, acNote: undefined } : {}),
			...(hp ? { hp: hp.hp, hpFormula: hp.formula } : {}),
			...(cr ? { cr, pb: undefined, xp: undefined } : {}),
			...own,
		};
	}
	if (!ac || !hp) return undefined;
	return { name, ac, hp: hp.hp, hpFormula: hp.formula, cr: cr || '0', abilities: [10, 10, 10, 10, 10, 10], type: 'humanoid', ...own };
}

/** The NPC's mini sheet: its numbers, where they come from, and which of them are its own over the block's. */
export interface NpcSheet5e {
	monster: Dnd5eMonster;
	/** The stat block it's built on; undefined: typed into the note. */
	from?: string;
	/** Numbers the note changes from the block: "AC", "HP", with the block's. */
	own: { label: 'AC' | 'HP'; block: number }[];
	/** Hit points left (`hp_now`; missing: all). */
	hpNow: number;
}

export function npcSheet5e(name: string, fm: Record<string, unknown>, base?: { name: string; monster: Dnd5eMonster }): NpcSheet5e | undefined {
	const monster = npcMonster5e(name, fm, base?.monster);
	if (!monster) return undefined;
	const own: NpcSheet5e['own'] = [];
	if (base && monster.ac !== base.monster.ac) own.push({ label: 'AC', block: base.monster.ac });
	if (base && monster.hp !== base.monster.hp) own.push({ label: 'HP', block: base.monster.hp });
	const now = Number(text(fm.hp_now));
	const hpNow = text(fm.hp_now) && Number.isFinite(now) ? Math.max(0, Math.min(monster.hp, Math.floor(now))) : monster.hp;
	return { monster, from: base?.name, own, hpNow };
}

/** Hit points left, written back (`hp_now`, gone again at full). */
export function setHpNow(fm: Record<string, unknown>, s: NpcSheet5e, hp: number): void {
	const n = Math.max(0, Math.min(s.monster.hp, Math.floor(hp)));
	if (n >= s.monster.hp) delete fm.hp_now; else fm.hp_now = n;
}

/** The skills a monster lists, in the book's order, with the ability each uses. */
export function npcSkills5e(m: Dnd5eMonster): { name: string; ability: AbilityKey; bonus: number }[] {
	return Object.entries(m.skills ?? {}).map(([n, bonus]) => {
		const name = skillName(n);
		return { name, ability: SKILL_ABILITY[name] ?? 'wis', bonus };
	}).sort((a, b) => SKILL_NAMES.indexOf(a.name) - SKILL_NAMES.indexOf(b.name));
}

/** Senses as the block words them, with Passive Perception added when the note's own senses leave it out. */
export function npcSenses5e(m: Dnd5eMonster): string {
	const senses = (m.senses ?? '').trim().replace(/\bpassive Perception\b/, 'Passive Perception');
	if (/passive perception/i.test(senses)) return senses;
	const pp = `Passive Perception ${10 + (m.skills?.Perception ?? abilityMod(m.abilities[ABILITIES.indexOf('wis')]))}`;
	return senses ? `${senses.charAt(0).toUpperCase()}${senses.slice(1)} · ${pp}` : pp;
}

// ----------------------------------------------------------------------------
// Actions as rows: a to-hit or a save DC, the damage, and the rest as a short note.

export interface NpcAction5e {
	group: 'Actions' | 'Bonus Actions' | 'Reactions' | 'Legendary Actions';
	/** Without its usage ("Peal", not "Peal (Recharge 5–6)"). */
	name: string;
	/** "Melee · 5 ft", "Recharge 5–6 · Con save", "plus 2d4 radiant". */
	note: string;
	hit?: number;
	dc?: number;
	save?: AbilityKey;
	/** A roll expression ("1d8+2") and its type ("bludgeoning"). */
	damage?: string;
	damageType?: string;
	/** The action in its own words. */
	text: string;
}

const TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
const ABBR: Record<AbilityKey, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
const dice = (s: string) => s.replace(/\s+/g, '').replace('−', '-');

/** One action's numbers, from its words: "Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Bludgeoning damage." */
export function npcAction5e(f: Feature5e, group: NpcAction5e['group'] = 'Actions'): NpcAction5e {
	const t = f.desc;
	const usage = /\s*\(([^)]*)\)\s*$/.exec(f.name);
	const name = usage ? f.name.slice(0, usage.index).trim() : f.name.trim();
	const note: string[] = [];
	if (usage) note.push(usage[1]);
	const out: NpcAction5e = { group, name, note: '', text: t };
	const hit = /([+\-−]\s?\d+) to hit|Attack Roll:\s*([+\-−]\s?\d+)|^\s*([+\-−]\d+)\b/i.exec(t);
	if (hit) out.hit = Number((hit[1] ?? hit[2] ?? hit[3]).replace(/\s/g, '').replace('−', '-'));
	const kind = /^(Melee or Ranged|Melee|Ranged)\b/i.exec(t.replace(/^\s*/, ''))?.[1] ?? /\b(Melee or Ranged|Melee|Ranged) (?:Weapon |Spell )?Attack/i.exec(t)?.[1];
	if (kind && out.hit !== undefined) note.push(kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase());
	const reach = /reach (\d+) ft/i.exec(t)?.[1];
	const range = /range (\d+(?:\/\d+)?) ft/i.exec(t)?.[1];
	if (reach || range) note.push(reach && range ? `${reach} or ${range} ft` : `${reach ?? range} ft`);
	const dc = /DC\s*(\d+)/i.exec(t);
	if (dc && out.hit === undefined) {
		out.dc = Number(dc[1]);
		const ab = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw/i.exec(t) ?? /DC\s*\d+\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha)\b/i.exec(t);
		const a = ab ? ABILITY_WORDS[ab[1].toLowerCase()] : undefined;
		if (a) { out.save = a; note.push(`${ABBR[a]} save`); }
	}
	const dmg = [...t.matchAll(new RegExp(`(\\d+d\\d+(?:\\s*[+\\-−]\\s*\\d+)?)\\)?\\s+(${TYPES})\\b`, 'gi'))];
	if (dmg[0]) { out.damage = dice(dmg[0][1]); out.damageType = dmg[0][2].toLowerCase(); }
	for (const extra of dmg.slice(1, 3)) note.push(`plus ${extra[1].replace(/\s+/g, ' ')} ${extra[2].toLowerCase()}`);
	out.note = note.join(' · ');
	return out;
}

/** Every action a monster has, grouped as the book groups them. */
export function npcActions5e(m: Dnd5eMonster): NpcAction5e[] {
	return [
		...(m.actions ?? []).map(f => npcAction5e(f, 'Actions')),
		...(m.bonusActions ?? []).map(f => npcAction5e(f, 'Bonus Actions')),
		...(m.reactions ?? []).map(f => npcAction5e(f, 'Reactions')),
		...(m.legendaryActions ?? []).map(f => npcAction5e(f, 'Legendary Actions')),
	];
}
