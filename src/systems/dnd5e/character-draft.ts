// What 5e's character wizards edit: a new character (class, species,
// background, abilities, skills, expertise, tools, languages, subclass,
// feature choices, weapon masteries, spells, ability score increases for the
// levels it starts above 1, and starting equipment) and a level up (hit points,
// a subclass when it's time, an increase or a feat, expertise, feature choices,
// new cantrips and spells). The rules are read from the compendium (the SRD and
// content packs) and data/creation.json (starting equipment, spells known and
// prepared, species' and backgrounds' choices). Pure: no Obsidian imports.

import type { Draft } from '../../core/builder/schema';
import creationJson from './data/creation.json';
import { Background5e, Class5e, ClassFeature5e, compendium5e, Species5e } from './compendium';
import { Frontmatter, newCharacterFm, optionGroupOf, readSheet5e, SKILLS, STANDARD_ARRAY } from './character';

export { optionGroupOf };
import type { Dnd5eEdition } from './editions';
import { abilityMod } from './rules';
import { ABILITIES, AbilityKey } from './types';

export const ABILITY_OF: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ----------------------------------------------------------------------------
// What the SRD offers a new character (data/creation.json)

export interface Choice5e { count: number; from: string[] }
export interface EquipOption5e { label: string; items: { name: string; qty: number }[]; picks: (Choice5e & { label: string })[]; gold: number }
export interface EquipGroup5e { label: string; options: EquipOption5e[] }
export interface ClassCreation5e { items?: { name: string; qty: number }[]; equipment: EquipGroup5e[]; tools?: Choice5e; known?: number[]; prepared?: number[]; mastery?: number[] }
export interface SpeciesCreation5e {
	languages?: string[]; languageChoices?: Choice5e; skills?: string[]; skillChoices?: Choice5e; toolChoices?: Choice5e;
	abilityChoices?: Choice5e & { bonus: number }; abilityBonuses?: string; cantripChoices?: Choice5e; traitChoices?: Choice5e & { label: string };
}
export interface BackgroundCreation5e { items?: { name: string; qty: number }[]; gold?: number; equipment: EquipGroup5e[]; tools?: string[]; toolChoices?: Choice5e; languageChoices?: Choice5e }
interface Creation5e { classes: Record<string, ClassCreation5e>; species: Record<string, SpeciesCreation5e>; backgrounds: Record<string, BackgroundCreation5e> }
const CREATION = creationJson as unknown as Record<Dnd5eEdition, Creation5e>;

const findIn = <T>(m: Record<string, T>, name: string): T | undefined => Object.entries(m).find(([k]) => same(k, name))?.[1];
export const classCreation = (edition: Dnd5eEdition, name: string): ClassCreation5e | undefined => findIn(CREATION[edition].classes, name);
export const speciesCreation = (edition: Dnd5eEdition, name: string): SpeciesCreation5e | undefined => (name ? findIn(CREATION[edition].species, name) : undefined);
export const backgroundCreation = (edition: Dnd5eEdition, name: string): BackgroundCreation5e | undefined => findIn(CREATION[edition].backgrounds, name);

export function classOf(edition: Dnd5eEdition, name: string): Class5e | undefined {
	return compendium5e(edition).classes.find(c => same(c.name, name));
}

/** "Choose two from A, B, and C" (2014), "Choose 2: A, B, or C" (2024), "Choose any 3" → how many, from which. */
export function skillChoice(text: string): { count: number; from: string[] } {
	const m = /choose\s+(any\s+)?(\w+)(?:\s+(?:skills?\s+)?from|:)?\s*(.*)$/i.exec(text.trim());
	const count = m ? Number(m[2]) || WORDS[m[2].toLowerCase()] || 2 : 2;
	const rest = m?.[3] ?? '';
	const any = !!m?.[1] || !rest.trim() || /any/i.test(rest);
	const from = any ? SKILLS.map(s => s.name) : SKILLS.map(s => s.name).filter(s => new RegExp(`\\b${s.replace(/ /g, '\\s+')}\\b`, 'i').test(rest));
	return { count, from: from.length ? from : SKILLS.map(s => s.name) };
}

/** A background's skills ("Skill: Insight"). */
export function backgroundSkills(b: Background5e | undefined): string[] {
	return (b?.proficiencies ?? []).map(p => /^skills?:\s*(.+)$/i.exec(p)?.[1]?.trim() ?? '').flatMap(s => s.split(/,\s*/)).filter(s => SKILLS.some(k => same(k.name, s)));
}

/** "CON +2", "Dex +2, Wis +1", "All +1" → per ability. */
export function speciesBonuses(text: string | undefined): Partial<Record<AbilityKey, number>> {
	const out: Partial<Record<AbilityKey, number>> = {};
	for (const m of (text ?? '').matchAll(/\b(STR|DEX|CON|INT|WIS|CHA|ALL)\w*\s*\+\s*(\d)/gi)) {
		const n = Number(m[2]);
		const keys = m[1].toUpperCase() === 'ALL' ? ABILITIES : [ABILITY_OF[m[1].toUpperCase()]];
		for (const k of keys) out[k] = (out[k] ?? 0) + n;
	}
	return out;
}

/** The level a class picks its subclass: its subclasses' first feature (1 for 2014 clerics, 2 for 2014 wizards, 3 otherwise). */
export function subclassLevel(cls: Class5e | undefined): number {
	const firsts = (cls?.subclasses ?? []).map(s => Math.min(...s.features.map(f => f.level))).filter(Number.isFinite);
	return firsts.length ? Math.min(...firsts) : 3;
}

/** Levels with an Ability Score Improvement (or an Epic Boon) in the class's table. */
export function asiLevels(cls: Class5e | undefined): number[] {
	return (cls?.levels ?? []).filter(l => l.features.some(f => /ability score improvement|epic boon/i.test(f))).map(l => l.level);
}

/** Cantrips known and the highest spell level with slots at a level (0 for no spells). */
export function spellsAt(cls: Class5e | undefined, level: number): { cantrips: number; maxLevel: number } {
	const row = cls?.levels.find(l => l.level === level);
	const slots = row?.slots ?? [];
	let maxLevel = 0;
	slots.forEach((n, i) => { if (n > 0) maxLevel = i + 1; });
	return { cantrips: row?.cantrips ?? 0, maxLevel };
}

/**
 * How many level 1+ spells a class has at a level, and what kind: known (2014 Bard, Ranger, Sorcerer, Warlock, from
 * their tables), prepared (2024's Prepared Spells column; 2014 Clerics and Druids, Wis + level; 2014 Paladins, Cha +
 * half their level), or a Wizard's spellbook (six, and two more each level). Null for a class without spells.
 */
export function spellCount(edition: Dnd5eEdition, cls: Class5e | undefined, level: number, scores: Partial<Record<AbilityKey, number>>): { count: number; kind: 'known' | 'prepared' | 'spellbook' } | null {
	if (!cls || !spellsAt(cls, level).maxLevel) return null;
	if (same(cls.name, 'Wizard')) return { count: 6 + 2 * (level - 1), kind: 'spellbook' };
	const c = classCreation(edition, cls.name);
	if (c?.prepared?.[level - 1]) return { count: c.prepared[level - 1], kind: 'prepared' };
	if (c?.known?.[level - 1]) return { count: c.known[level - 1], kind: 'known' };
	const ab = ABILITY_OF[(cls.spellcasting ?? '').toUpperCase()];
	const mod = ab ? abilityMod(scores[ab] ?? 10) : 0;
	const lv = same(cls.name, 'Paladin') ? Math.floor(level / 2) : level;
	return { count: Math.max(1, mod + lv), kind: 'prepared' };
}

/** The class's spells up to a level (0: cantrips only). */
export function classSpells(edition: Dnd5eEdition, cls: string, upTo: number, cantrips: boolean): string[] {
	return compendium5e(edition).spells.filter(s => s.classes.some(c => same(c, cls)) && (cantrips ? s.level === 0 : s.level >= 1 && s.level <= upTo)).map(s => s.name).sort();
}

/** Expertise picks a class grants at exactly this level (its table): two for each Expertise, one for 2024's Deft Explorer. */
export function expertiseAt(cls: Class5e | undefined, level: number): number {
	const row = cls?.levels.find(l => l.level === level)?.features ?? [];
	return row.reduce((n, f) => n + (f === 'Expertise' ? 2 : f === 'Deft Explorer' ? 1 : 0), 0);
}

/** 2024: how many kinds of weapons a class masters at a level (0 without Weapon Mastery). */
export function masteryCount(edition: Dnd5eEdition, cls: Class5e | undefined, level: number): number {
	if (edition !== '2024' || !cls?.features.some(f => f.name === 'Weapon Mastery' && f.level <= level)) return 0;
	return classCreation(edition, cls.name)?.mastery?.[level - 1] ?? 2;
}

/** 2024: the weapons a class can master (each with a mastery property; Rogues' are finesse or light, Barbarians' melee). */
export function masteryWeapons(edition: Dnd5eEdition, cls: string): string[] {
	return compendium5e(edition).equipment.filter(e => e.mastery && e.damage).filter(e => {
		if (same(cls, 'Rogue')) return (e.properties ?? []).some(p => /finesse|light/i.test(p));
		if (same(cls, 'Barbarian')) return /melee/i.test(`${e.category} ${(e.tags ?? []).join(' ')}`);
		return true;
	}).map(e => e.name).sort();
}

// Feature choices -------------------------------------------------------------

/** One choice a class or subclass offers among its own features (2014: Fighting Style, Metamagic, invocations, Pact Boon, Hunter's Prey…). */
export interface OptionGroup5e { group: string; count: number; from: string[] }


/** The choices among features a character has made by a level (or gains between two levels), with how many of each. */
export function optionGroups(cls: Class5e | undefined, subclass: string, level: number, after = 0): OptionGroup5e[] {
	if (!cls) return [];
	const sub = cls.subclasses.find(s => same(s.name, subclass));
	const out: OptionGroup5e[] = [];
	const at = (lv: number, list: ClassFeature5e[], fromTable: boolean) => {
		const groups = new Map<string, string[]>();
		for (const f of list) {
			const g = optionGroupOf(f.name, list);
			if (g && f.level <= lv) groups.set(g, [...(groups.get(g) ?? []), f.name]);
		}
		const counts = new Map<string, number>();
		for (const [g] of groups) {
			const parent = list.find(f => f.name === g || f.name === `${g}s`);
			if (!parent || parent.level > lv) continue;
			const row = cls.levels.find(l => l.level === lv);
			const known = Number(row?.extra?.invocations_known ?? 0);
			const times = fromTable ? cls.levels.filter(l => l.level <= lv && l.features.some(x => x === parent.name)).length : 1;
			counts.set(g, g === 'Eldritch Invocation' && known ? known : g === 'Metamagic' ? times + 1 : Math.max(1, times));
		}
		return { groups, counts };
	};
	for (const [list, fromTable] of [[cls.features, true], [sub?.features ?? [], false]] as const) {
		const now = at(level, list, fromTable), before = at(after, list, fromTable);
		for (const [g, from] of now.groups) {
			const count = (now.counts.get(g) ?? 0) - (before.counts.get(g) ?? 0);
			if (count > 0) out.push({ group: g, count, from });
		}
	}
	return out;
}

/** 2024: a Fighting Style feat comes with the class's Fighting Style feature (Fighter 1, Paladin and Ranger 2). */
export function fightingStyleAt(edition: Dnd5eEdition, cls: Class5e | undefined, level: number, after = 0): boolean {
	return edition === '2024' && !!cls?.features.some(f => f.name === 'Fighting Style' && f.level <= level && f.level > after);
}

// ----------------------------------------------------------------------------
// A new character

/** Point buy: what each score from 8 to 15 costs, out of 27. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** An Ability Score Improvement (or a feat in its place) at one of the levels the character starts past. */
export interface Increase5e { level: number; take: 'plus2' | 'plus1' | 'feat'; a1: string; a2: string; feat: string }

export interface Character5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	className: string;
	level?: number;
	species: string;
	/** 2014: a subrace ("Hill Dwarf"); 2024: a lineage or ancestry. */
	subspecies: string;
	background: string;
	method: 'array' | 'pointbuy' | 'roll' | 'manual';
	str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
	/** The array or the rolled scores have been moved around by hand (the class no longer sets them out). */
	arranged?: boolean;
	/** The six rolled scores, highest first. */
	rolled?: number[];
	/** 2024: the background's increases: +2 and +1, or +1 to all three. */
	spread?: '21' | '111';
	/** 2024: the background's +2 and +1 (empty: the best for the class). */
	plus2: string;
	plus1: string;
	/** 2014: a race's choice of abilities (a half-elf's two +1s). */
	raceUp?: string[];
	skills: string[];
	/** Skills from the species' choice (a half-elf's two, a 2024 human's one, a 2024 elf's Keen Senses). */
	speciesSkills?: string[];
	expertise?: string[];
	tools?: string[];
	languages?: string[];
	/** 2014: a dragonborn's Draconic Ancestry, a high elf's cantrip. */
	ancestry?: string;
	raceCantrip?: string;
	subclass: string;
	/** Features chosen among a class's options (2014's Fighting Style: Archery…). */
	choices?: string[];
	/** 2024: a Fighting Style feat, a human's Versatile origin feat. */
	styleFeat?: string;
	originFeat?: string;
	/** 2024: Magic Initiate's spell list and spells (from the background's or an origin feat). */
	miClass?: string;
	miCantrips?: string[];
	miSpell?: string[];
	masteries?: string[];
	increases?: Increase5e[];
	cantrips: string[];
	spells: string[];
	/** Starting equipment: each group's option (by label), what's picked from a category, or gold instead (2024). */
	equip?: Record<string, string>;
	equipPicks?: Record<string, string[]>;
	mine: boolean;
}

/** A new character with the standard array set out for the class (its saves first). */
export function newCharacter5e(edition: Dnd5eEdition, o: { name?: string; level?: number; mine?: boolean } = {}): Character5eDraft {
	const c = compendium5e(edition);
	const cls = c.classes[0];
	const d: Character5eDraft = {
		edition, name: o.name ?? '', className: cls?.name ?? '', level: Math.max(1, o.level ?? 1), species: c.species[0]?.name ?? '', subspecies: '',
		background: c.backgrounds[0]?.name ?? '', method: 'array', spread: '21', plus2: '', plus1: '', raceUp: [], skills: [], speciesSkills: [], expertise: [], tools: [], languages: [],
		subclass: '', choices: [], masteries: [], increases: [], cantrips: [], spells: [], equip: {}, equipPicks: {}, mine: o.mine ?? true,
	};
	return withArray(d);
}

/** Where each SRD class wants its best scores (its main ability first, then what keeps it alive). */
const CLASS_PRIORITY: Record<string, AbilityKey[]> = {
	barbarian: ['str', 'con', 'dex'], bard: ['cha', 'dex', 'con'], cleric: ['wis', 'con', 'str'], druid: ['wis', 'con', 'dex'], fighter: ['str', 'con', 'dex'], monk: ['dex', 'wis', 'con'],
	paladin: ['str', 'cha', 'con'], ranger: ['dex', 'wis', 'con'], rogue: ['dex', 'con', 'wis'], sorcerer: ['cha', 'con', 'dex'], warlock: ['cha', 'con', 'dex'], wizard: ['int', 'con', 'dex'],
};

/** The class's priorities (another class's: its saves first), then Con, Dex, Str, Wis, Int, Cha. */
function priority(d: Character5eDraft): AbilityKey[] {
	const known = CLASS_PRIORITY[d.className.toLowerCase()];
	const saves = classOf(d.edition, d.className)?.saves.map(s => ABILITY_OF[s.toUpperCase()]).filter(Boolean) ?? [];
	return uniq([...(known ?? saves), 'con', 'dex', 'str', 'wis', 'int', 'cha'] as AbilityKey[]);
}

/** Scores (the standard array, or rolls) set out for the class: highest in its saves, then Con. */
export function assignByClass(d: Character5eDraft, values: number[]): Character5eDraft {
	const sorted = [...values].sort((a, b) => b - a);
	priority(d).forEach((a, i) => { d[a] = sorted[i] ?? 10; });
	return d;
}

export function withArray(d: Character5eDraft): Character5eDraft {
	return assignByClass(d, STANDARD_ARRAY);
}

/** Roll 4d6 six times, dropping each lowest die (`die` gives 1–6; Math.random by default). */
export function rollScores(die: () => number = () => 1 + Math.floor(Math.random() * 6)): number[] {
	return Array.from({ length: 6 }, () => {
		const four = [die(), die(), die(), die()].sort((a, b) => a - b);
		return four[1] + four[2] + four[3];
	}).sort((a, b) => b - a);
}

/** Swap two abilities' scores (the array and rolls are moved, not typed). */
export function swapScores(d: Character5eDraft, a: AbilityKey, b: AbilityKey): void {
	const x = d[a], y = d[b];
	d[a] = y; d[b] = x;
	d.arranged = true;
}

export function speciesOf(d: Character5eDraft): Species5e | undefined {
	return compendium5e(d.edition).species.find(s => same(s.name, d.species));
}

export function backgroundOf(d: Character5eDraft): Background5e | undefined {
	return compendium5e(d.edition).backgrounds.find(b => same(b.name, d.background));
}

/** The species' and subspecies' creation data (their choices, 2014 subraces' bonuses). */
export function speciesChoices(d: Character5eDraft): SpeciesCreation5e {
	const a = speciesCreation(d.edition, d.species) ?? {};
	const b = speciesCreation(d.edition, d.subspecies) ?? {};
	return { ...a, ...b, languages: uniq([...(a.languages ?? []), ...(b.languages ?? [])]), skills: uniq([...(a.skills ?? []), ...(b.skills ?? [])]) };
}

/** Points spent in point buy (scores outside 8–15 count as over budget). */
export function pointsSpent(d: Character5eDraft): number {
	return ABILITIES.reduce((n, a) => n + (POINT_COST[d[a] ?? 8] ?? 99), 0);
}

/** Each ability's bonus: 2024 from the background (+2/+1 or +1 to three), 2014 from the race, subrace and a half-elf's choice. */
export function bonuses(d: Character5eDraft): Partial<Record<AbilityKey, number>> {
	const out: Partial<Record<AbilityKey, number>> = {};
	const add = (k: AbilityKey | undefined, n: number) => { if (k) out[k] = (out[k] ?? 0) + n; };
	if (d.edition === '2014') {
		const sp = speciesOf(d);
		for (const [k, v] of Object.entries(speciesBonuses(sp?.abilityBonuses)) as [AbilityKey, number][]) add(k, v);
		const sub = speciesCreation(d.edition, d.subspecies)?.abilityBonuses;
		for (const [k, v] of Object.entries(speciesBonuses(sub)) as [AbilityKey, number][]) add(k, v);
		const choice = speciesChoices(d).abilityChoices;
		if (choice) for (const a of (d.raceUp ?? []).slice(0, choice.count)) add(ABILITY_OF[a.toUpperCase()], choice.bonus);
		return out;
	}
	if (d.spread === '111') {
		for (const s of backgroundOf(d)?.abilityScores ?? []) add(ABILITY_OF[s.toUpperCase()], 1);
		return out;
	}
	const { p2, p1 } = plusOf(d);
	if (p2) out[p2] = 2;
	if (p1 && p1 !== p2) out[p1] = (out[p1] ?? 0) + 1;
	return out;
}

/** 2024: where the background's +2 and +1 go: as chosen, else to its best abilities for these scores. */
export function plusOf(d: Character5eDraft): { p2: AbilityKey | ''; p1: AbilityKey | '' } {
	const key = (v: string): AbilityKey | undefined => ABILITY_OF[v.toUpperCase()] ?? ABILITIES.find(a => a === v);
	const offered = (backgroundOf(d)?.abilityScores ?? []).map(s => ABILITY_OF[s.toUpperCase()]).filter(Boolean);
	const best = [...offered].sort((x, y) => (d[y] ?? 10) - (d[x] ?? 10));
	const p2 = key(d.plus2) ?? best[0] ?? '';
	const p1 = key(d.plus1) ?? best.find(a => a !== p2) ?? '';
	return { p2, p1 };
}

/** Scores after the background or race, before any increase from levels: at most 20. */
export function startScores(d: Character5eDraft): Record<AbilityKey, number> {
	const b = bonuses(d);
	return Object.fromEntries(ABILITIES.map(a => [a, Math.min(20, (d[a] ?? 10) + (b[a] ?? 0))])) as Record<AbilityKey, number>;
}

/** The increases the character's levels give (2024's Epic Boon at 19 is one). */
export function increaseLevels(d: Character5eDraft): number[] {
	return asiLevels(classOf(d.edition, d.className)).filter(l => l <= (d.level ?? 1));
}

/** Keep one increase per level the character starts past, the best abilities first for a new one. */
export function settleIncreases(d: Character5eDraft): Increase5e[] {
	const levels = increaseLevels(d);
	const have = d.increases ?? [];
	const scores = startScores(d);
	const best = priority(d).filter(a => scores[a] < 20);
	d.increases = levels.map(level => have.find(i => i.level === level) ?? { level, take: 'plus2', a1: best[0] ?? 'str', a2: best[1] ?? 'dex', feat: '' });
	return d.increases;
}

/** Apply increases to scores (in place): +2 to one, or +1 to two, never above 20. */
function applyIncreases(scores: Record<AbilityKey, number>, increases: Increase5e[]): void {
	const bump = (a: string, n: number) => { const k = ABILITY_OF[a.toUpperCase()] ?? (a as AbilityKey); if (ABILITIES.includes(k)) scores[k] = Math.min(20, scores[k] + n); };
	for (const i of increases) {
		if (i.take === 'plus2') bump(i.a1, 2);
		else if (i.take === 'plus1') { bump(i.a1, 1); if (i.a2 !== i.a1) bump(i.a2, 1); else bump(i.a1, 1); }
	}
}

/** Final scores: base, the background's or race's bonuses, then the increases from levels; at most 20. */
export function finalScores(d: Character5eDraft): Record<AbilityKey, number> {
	const scores = startScores(d);
	applyIncreases(scores, (d.increases ?? []).filter(i => i.level <= (d.level ?? 1)));
	return scores;
}

/** Every skill the character is proficient in: the background's, the species', and the ones chosen. */
export function allSkills(d: Character5eDraft): string[] {
	return uniq([...backgroundSkills(backgroundOf(d)), ...(speciesChoices(d).skills ?? []), ...(d.speciesSkills ?? []), ...d.skills]);
}

/** Expertise picks up to the character's level. */
export function expertiseCount(d: Character5eDraft): number {
	const cls = classOf(d.edition, d.className);
	let n = 0;
	for (let lv = 1; lv <= (d.level ?? 1); lv++) n += expertiseAt(cls, lv);
	return n;
}

/** Languages the character knows without choosing: 2014 the race's, 2024 Common. */
export function givenLanguages(d: Character5eDraft): string[] {
	return d.edition === '2024' ? ['Common'] : speciesChoices(d).languages ?? [];
}

/** How many languages to choose, and from which: 2024's two standard languages; 2014's race, subrace and background choices. */
export function languageChoice(d: Character5eDraft): Choice5e {
	const all = (compendium5e(d.edition).languages ?? []).filter(l => !/druidic|thieves/i.test(l.name));
	const known = givenLanguages(d);
	if (d.edition === '2024') return { count: 2, from: all.filter(l => l.type === 'Standard' && !known.includes(l.name)).map(l => l.name) };
	const count = (speciesChoices(d).languageChoices?.count ?? 0) + (backgroundCreation(d.edition, d.background)?.languageChoices?.count ?? 0);
	return { count, from: all.map(l => l.name).filter(n => !known.includes(n)) };
}

/** Tools the character has without choosing (the class's, the background's, a rock gnome's tinker's tools). */
export function givenTools(d: Character5eDraft): string[] {
	const fromClass = (classOf(d.edition, d.className)?.proficiencies ?? []).map(p => /^Tool:\s*(.+)$/.exec(p)?.[1] ?? (/(kit|tools|supplies)$/i.test(p) ? p : '')).filter(Boolean);
	return uniq([...fromClass, ...(backgroundCreation(d.edition, d.background)?.tools ?? [])]);
}

/** Tool choices: the class's (a bard's three instruments), the species' (a dwarf's artisan's tools), the background's (a soldier's gaming set). */
export function toolChoices(d: Character5eDraft): (Choice5e & { label: string })[] {
	const out: (Choice5e & { label: string })[] = [];
	const c = classCreation(d.edition, d.className)?.tools;
	if (c) out.push({ ...c, label: d.className });
	const s = speciesChoices(d).toolChoices;
	if (s) out.push({ ...s, label: d.subspecies || d.species });
	const b = backgroundCreation(d.edition, d.background)?.toolChoices;
	if (b) out.push({ ...b, label: d.background });
	return out;
}

/** 2024: the origin feat's Magic Initiate list, if it has one ("Magic Initiate (Cleric)", or a human's Versatile pick). */
export function magicInitiate(d: Character5eDraft): string | null {
	if (d.edition !== '2024') return null;
	const feats = [backgroundOf(d)?.feat ?? '', d.originFeat ?? ''];
	const mi = feats.find(f => /^Magic Initiate/i.test(f));
	if (!mi) return null;
	return /\((\w+)\)/.exec(mi)?.[1] ?? (d.miClass || 'Wizard');
}

/** 2024: a human's Versatile: an origin feat of their choice. */
export const hasVersatile = (d: Character5eDraft) => d.edition === '2024' && (speciesOf(d)?.traits ?? []).some(t => t.name === 'Versatile');

/** The equipment a choice gives: every group's option (A by default), what's picked, and the gold. */
export function startingEquipment(d: Character5eDraft): { items: { name: string; qty: number }[]; gold: number } {
	const items: { name: string; qty: number }[] = [];
	let gold = 0;
	const add = (name: string, qty: number) => { const have = items.find(i => same(i.name, name)); if (have) have.qty += qty; else items.push({ name, qty }); };
	const take = (prefix: string, given: { name: string; qty: number }[] | undefined, groups: EquipGroup5e[]) => {
		for (const g of given ?? []) add(g.name, g.qty);
		groups.forEach((g, gi) => {
			const key = `${prefix}${gi}`;
			const opt = g.options.find(o => o.label === d.equip?.[key]) ?? g.options[0];
			if (!opt) return;
			for (const i of opt.items) add(i.name, i.qty);
			gold += opt.gold;
			opt.picks.forEach((p, pi) => {
				const chosen = (d.equipPicks?.[`${key}.${opt.label}.${pi}`] ?? []).filter(x => p.from.includes(x)).slice(0, p.count);
				for (const x of chosen.length ? chosen : p.from.slice(0, p.count)) add(x, 1);
			});
		});
	};
	take('c', classCreation(d.edition, d.className)?.items, classCreation(d.edition, d.className)?.equipment ?? []);
	const bg = backgroundCreation(d.edition, d.background);
	take('b', bg?.items, bg?.equipment ?? []);
	gold += bg?.gold ?? 0;
	return { items, gold };
}

/** What the character still needs before it can be made, or null. */
export function characterMissing(d: Character5eDraft): string | null {
	if (!d.name.trim()) return 'Name your character first.';
	if (!classOf(d.edition, d.className)) return 'Pick a class.';
	if (d.method === 'pointbuy' && pointsSpent(d) > 27) return `That's ${pointsSpent(d)} points: point buy allows 27.`;
	return null;
}

/** The note's properties: newCharacterFm, then everything chosen. */
export function characterFm(d: Character5eDraft): Frontmatter {
	const level = Math.max(1, Math.min(20, d.level ?? 1));
	const species = d.edition === '2014' && d.subspecies ? d.subspecies : d.species;
	settleIncreases(d);
	const scores = finalScores(d);
	const fm = newCharacterFm({ name: d.name.trim(), className: d.className, level, species, background: d.background, scores, mine: d.mine, edition: d.edition });
	if (d.edition === '2024' && d.subspecies) fm.lineage = d.subspecies;
	const cls = classOf(d.edition, d.className);
	const skills = allSkills(d);
	fm.skills = skills;
	const expertise = (d.expertise ?? []).filter(s => skills.includes(s)).slice(0, expertiseCount(d));
	if (expertise.length) fm.expertise = expertise;
	if (d.subclass && level >= subclassLevel(cls)) fm.subclass = d.subclass;
	// Feature choices: only those the class (and subclass) offer by this level, as many as it allows.
	const groups = optionGroups(cls, fm.subclass ? d.subclass : '', level);
	const choices = groups.flatMap(g => (d.choices ?? []).filter(c => g.from.includes(c)).slice(0, g.count));
	if (d.edition === '2014' && d.ancestry) choices.push(d.ancestry);
	if (choices.length) fm.choices = choices;
	const feats = [
		...(fightingStyleAt(d.edition, cls, level) && d.styleFeat ? [d.styleFeat] : []),
		...(hasVersatile(d) && d.originFeat ? [d.originFeat] : []),
		...(d.increases ?? []).filter(i => i.take === 'feat' && i.feat).map(i => i.feat),
	];
	if (feats.length) fm.feats = uniq(feats);
	const masteries = (d.masteries ?? []).slice(0, masteryCount(d.edition, cls, level));
	if (masteries.length) fm.masteries = masteries;
	const tools = uniq([...givenTools(d), ...(d.tools ?? [])]);
	if (tools.length) fm.tools = tools;
	const languages = uniq([...givenLanguages(d), ...(d.languages ?? []).slice(0, languageChoice(d).count)]);
	if (languages.length) fm.languages = languages;
	const { cantrips, maxLevel } = spellsAt(cls, level);
	const count = spellCount(d.edition, cls, level, scores)?.count ?? 0;
	const mi = magicInitiate(d) ? [...(d.miCantrips ?? []).slice(0, 2), ...(d.miSpell ?? []).slice(0, 1)] : [];
	fm.spells = uniq([
		...d.cantrips.slice(0, cantrips || d.cantrips.length),
		...(maxLevel ? d.spells.slice(0, count || d.spells.length) : []),
		...(d.edition === '2014' && d.raceCantrip ? [d.raceCantrip] : []),
		...mi,
	]);
	const { items, gold } = startingEquipment(d);
	const eq = compendium5e(d.edition).equipment;
	// Armor, a shield and weapons go on equipped (the sheet's AC and attacks follow them); the first armor only.
	let armored = false;
	fm.inventory = items.map(i => {
		const e = eq.find(x => same(x.name, i.name));
		const armor = !!e?.ac && !/shield/i.test(e.name);
		const equipped = !!e && (!!e.damage || (/shield/i.test(e.name)) || (armor && !armored));
		if (armor && equipped) armored = true;
		return { name: i.name, ...(i.qty !== 1 ? { qty: i.qty } : {}), ...(equipped ? { equipped: true } : {}) };
	});
	fm.gold = gold;
	return fm;
}

// ----------------------------------------------------------------------------
// Levelling up

export interface LevelUp5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	className: string;
	/** The level being reached. */
	level: number;
	hitDie: number;
	conMod: number;
	hasSubclass: boolean;
	/** The subclass the character has (for its features and choices). */
	subclassNow: string;
	hp: 'average' | 'roll' | 'manual';
	manual?: number;
	subclass: string;
	/** At an Ability Score Improvement: +2 to one, +1 to two, or a feat. */
	asi: 'plus2' | 'plus1' | 'feat';
	a1: string;
	a2: string;
	feat: string;
	/** A feat's own +1 (2024: Grappler's Str or Dex, an Epic Boon's any). */
	featUp: string;
	cantrips: string[];
	spells: string[];
	expertise: string[];
	choices: string[];
	styleFeat: string;
	masteries: string[];
	/** Scores now (for the caps and hints). */
	scores: Record<AbilityKey, number>;
	/** Hit point maximum now (for the summary). */
	hpMax?: number;
	known: string[];
	/** Skills, expertise, choices and masteries the character has (so they aren't offered again). */
	skillsNow: string[];
	expertiseNow: string[];
	choicesNow: string[];
	masteriesNow: string[];
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()) : []);

/** A level up for a character's properties. */
export function newLevelUp5e(fm: Frontmatter, edition: Dnd5eEdition, name = 'Hero'): LevelUp5eDraft {
	const s = readSheet5e(fm, edition, name);
	const cls = classOf(edition, s.className ?? '');
	const scores = Object.fromEntries(ABILITIES.map(a => [a, s.scores[a]])) as Record<AbilityKey, number>;
	const best = [...ABILITIES].sort((x, y) => scores[y] - scores[x]).filter(a => scores[a] < 20);
	return {
		edition, name: s.name, className: s.className ?? '', level: Math.min(20, s.level + 1), hitDie: cls?.hitDie ?? s.hitDie, conMod: abilityMod(scores.con),
		hasSubclass: !!s.subclass, subclassNow: s.subclass, hp: 'average', subclass: '', asi: 'plus2', a1: best[0] ?? 'str', a2: best[1] ?? 'dex', feat: '', featUp: '',
		cantrips: [], spells: [], expertise: [], choices: [], styleFeat: '', masteries: [], scores, hpMax: s.hpMax,
		known: listOf(fm.spells), skillsNow: s.skills.filter(k => k.proficient).map(k => k.name), expertiseNow: listOf(fm.expertise), choicesNow: listOf(fm.choices), masteriesNow: listOf(fm.masteries),
	};
}

export const averageGain = (d: LevelUp5eDraft) => Math.max(1, Math.floor(d.hitDie / 2) + 1 + d.conMod);
export const needsSubclass = (d: LevelUp5eDraft) => !d.hasSubclass && (classOf(d.edition, d.className)?.subclasses.length ?? 0) > 0 && d.level >= subclassLevel(classOf(d.edition, d.className));
export const hasAsi = (d: LevelUp5eDraft) => asiLevels(classOf(d.edition, d.className)).includes(d.level);
export const newSpellLevel = (d: LevelUp5eDraft) => spellsAt(classOf(d.edition, d.className), d.level).maxLevel;
/** New cantrips at this level. */
export const newCantrips = (d: LevelUp5eDraft) => {
	const cls = classOf(d.edition, d.className);
	return Math.max(0, spellsAt(cls, d.level).cantrips - spellsAt(cls, d.level - 1).cantrips);
};
/** New spells known, prepared or in a spellbook at this level. */
export const newSpellCount = (d: LevelUp5eDraft) => {
	const cls = classOf(d.edition, d.className);
	const now = spellCount(d.edition, cls, d.level, d.scores)?.count ?? 0;
	const was = spellCount(d.edition, cls, d.level - 1, d.scores)?.count ?? 0;
	return Math.max(0, now - was);
};
/** The subclass this level counts with: the one chosen now, or the one the character has. */
const subclassFor = (d: LevelUp5eDraft) => (needsSubclass(d) ? d.subclass : d.subclassNow);
export const levelOptions = (d: LevelUp5eDraft) => optionGroups(classOf(d.edition, d.className), subclassFor(d), d.level, d.level - 1)
	.map(g => ({ ...g, from: g.from.filter(f => !d.choicesNow.includes(f)) }));
export const newMasteries = (d: LevelUp5eDraft) => {
	const cls = classOf(d.edition, d.className);
	return Math.max(0, masteryCount(d.edition, cls, d.level) - masteryCount(d.edition, cls, d.level - 1));
};
/** 2024: what a feat's own increase allows ("Strength or Dexterity", "one ability score of your choice"), or none. */
export function featIncrease(edition: Dnd5eEdition, feat: string): AbilityKey[] {
	const f = compendium5e(edition).feats.find(x => same(x.name, feat));
	const m = /Ability Score Increase\.\*{0,2}\s*Increase (?:your )?(.*?) score/i.exec(f?.desc ?? '');
	if (!m) return [];
	if (/one ability/i.test(m[1])) return [...ABILITIES];
	return ABILITIES.filter(a => new RegExp({ str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[a]).test(m[1]));
}

/** The class's and subclass's features at the level being reached. */
export function featuresGained(d: LevelUp5eDraft): string[] {
	const cls = classOf(d.edition, d.className);
	const sub = cls?.subclasses.find(s => same(s.name, subclassFor(d)));
	const plain = (list: ClassFeature5e[]) => list.filter(f => f.level === d.level && !optionGroupOf(f.name, list)).map(f => f.name);
	return uniq([...plain(cls?.features ?? []), ...plain(sub?.features ?? [])]);
}

/** Apply a level up to a character's properties; `rolled` is the hit die rolled (for `roll`). */
export function applyLevelUp5e(fm: Frontmatter, d: LevelUp5eDraft, rolled?: number): void {
	const s = readSheet5e(fm, d.edition, d.name);
	if (s.level >= 20) return;
	const die = d.hp === 'manual' ? (d.manual ?? Math.floor(d.hitDie / 2) + 1) : d.hp === 'roll' ? (rolled ?? Math.floor(d.hitDie / 2) + 1) : Math.floor(d.hitDie / 2) + 1;
	const gain = Math.max(1, die + d.conMod);
	fm.level = s.level + 1;
	fm.hp_max = s.hpMax + gain;
	fm.hp = s.hp + gain;
	if (needsSubclass(d) && d.subclass) fm.subclass = d.subclass;
	const cap = (feat: string) => (compendium5e(d.edition).feats.find(f => same(f.name, feat))?.type === 'epic-boon' ? 30 : 20);
	const bump = (a: string, n: number, max = 20) => { const k = ABILITY_OF[a.toUpperCase()] ?? (a as AbilityKey); if (ABILITIES.includes(k)) fm[k] = Math.min(max, Number(fm[k] ?? 10) + n); };
	const feats = listOf(fm.feats);
	if (hasAsi(d)) {
		if (d.asi === 'feat' && d.feat) {
			if (!feats.includes(d.feat)) feats.push(d.feat);
			if (d.featUp && featIncrease(d.edition, d.feat).includes(d.featUp as AbilityKey)) bump(d.featUp, 1, cap(d.feat));
		} else if (d.asi === 'plus2') bump(d.a1, 2);
		else { bump(d.a1, 1); if (d.a2 !== d.a1) bump(d.a2, 1); else bump(d.a1, 1); }
	}
	if (fightingStyleAt(d.edition, classOf(d.edition, d.className), d.level, d.level - 1) && d.styleFeat && !feats.includes(d.styleFeat)) feats.push(d.styleFeat);
	if (feats.length) fm.feats = feats;
	// A higher Constitution raises the maximum by one per level, this one included.
	const conGain = abilityMod(Number(fm.con ?? 10)) - d.conMod;
	if (conGain > 0) { fm.hp_max = Number(fm.hp_max) + conGain * (s.level + 1); fm.hp = Number(fm.hp) + conGain * (s.level + 1); }
	const picked = [...d.cantrips.slice(0, newCantrips(d)), ...d.spells];
	if (picked.length) {
		const now = listOf(fm.spells);
		fm.spells = [...now, ...picked.filter(x => !now.includes(x))];
	}
	const exp = d.expertise.filter(x => d.skillsNow.includes(x)).slice(0, expertiseAt(classOf(d.edition, d.className), d.level));
	if (exp.length) fm.expertise = uniq([...listOf(fm.expertise), ...exp]);
	const groups = levelOptions(d);
	const choices = groups.flatMap(g => d.choices.filter(c => g.from.includes(c)).slice(0, g.count));
	if (choices.length) fm.choices = uniq([...listOf(fm.choices), ...choices]);
	const masteries = d.masteries.filter(m => !d.masteriesNow.includes(m)).slice(0, newMasteries(d));
	if (masteries.length) fm.masteries = uniq([...listOf(fm.masteries), ...masteries]);
}
