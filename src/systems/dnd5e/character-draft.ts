// What 5e's character wizards edit: a new character (class, species,
// background, abilities, skills, subclass, spells) and a level up (hit
// points, a subclass when it's time, an ability score increase or a feat, new
// spells), and the rules that shape each step. Everything is read from the
// compendium (the SRD and content packs), so a pack's class or subclass works
// the same. Pure: no Obsidian imports.

import type { Draft } from '../../core/builder/schema';
import { Background5e, Class5e, compendium5e, Species5e } from './compendium';
import { Frontmatter, newCharacterFm, readSheet5e, SKILLS, STANDARD_ARRAY } from './character';
import type { Dnd5eEdition } from './editions';
import { abilityMod } from './rules';
import { ABILITIES, AbilityKey } from './types';

export const ABILITY_OF: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

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

/** The class's spells up to a level (0: cantrips only). */
export function classSpells(edition: Dnd5eEdition, cls: string, upTo: number, cantrips: boolean): string[] {
	return compendium5e(edition).spells.filter(s => s.classes.some(c => same(c, cls)) && (cantrips ? s.level === 0 : s.level >= 1 && s.level <= upTo)).map(s => s.name).sort();
}

// ----------------------------------------------------------------------------
// A new character

/** Point buy: what each score from 8 to 15 costs, out of 27. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export interface Character5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	className: string;
	level?: number;
	species: string;
	/** 2014: a subrace ("Hill Dwarf"). */
	subspecies: string;
	background: string;
	method: 'array' | 'pointbuy' | 'manual';
	str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
	/** 2024: the background's +2 and +1 (empty: the best for the class). */
	plus2: string;
	plus1: string;
	skills: string[];
	subclass: string;
	cantrips: string[];
	spells: string[];
	mine: boolean;
}

/** A new character with the standard array set out for the class (its saves first). */
export function newCharacter5e(edition: Dnd5eEdition, o: { name?: string; level?: number; mine?: boolean } = {}): Character5eDraft {
	const c = compendium5e(edition);
	const cls = c.classes[0];
	const d: Character5eDraft = {
		edition, name: o.name ?? '', className: cls?.name ?? '', level: Math.max(1, o.level ?? 1), species: c.species[0]?.name ?? '', subspecies: '',
		background: c.backgrounds[0]?.name ?? '', method: 'array', plus2: '', plus1: '', skills: [], subclass: '', cantrips: [], spells: [], mine: o.mine ?? true,
	};
	return withArray(d);
}

/** The standard array, highest in the class's saves, then Con. */
export function withArray(d: Character5eDraft): Character5eDraft {
	const saves = classOf(d.edition, d.className)?.saves.map(s => ABILITY_OF[s.toUpperCase()]).filter(Boolean) ?? [];
	const rest: AbilityKey[] = ['con', 'dex', 'str', 'wis', 'int', 'cha'];
	const order = [...new Set([...saves, ...rest])];
	order.forEach((a, i) => { d[a] = STANDARD_ARRAY[i]; });
	return d;
}

export function speciesOf(d: Character5eDraft): Species5e | undefined {
	return compendium5e(d.edition).species.find(s => same(s.name, d.species));
}

export function backgroundOf(d: Character5eDraft): Background5e | undefined {
	return compendium5e(d.edition).backgrounds.find(b => same(b.name, d.background));
}

/** Points spent in point buy (scores outside 8–15 count as over budget). */
export function pointsSpent(d: Character5eDraft): number {
	return ABILITIES.reduce((n, a) => n + (POINT_COST[d[a] ?? 8] ?? 99), 0);
}

/** Each ability's bonus: 2024 from the background (+2 and +1), 2014 from the race and subrace. */
export function bonuses(d: Character5eDraft): Partial<Record<AbilityKey, number>> {
	if (d.edition === '2014') {
		const sp = speciesOf(d);
		const sub = sp?.subspecies.find(s => same(s.name, d.subspecies));
		const a = speciesBonuses(sp?.abilityBonuses), b = speciesBonuses((sub as { abilityBonuses?: string } | undefined)?.abilityBonuses);
		const out: Partial<Record<AbilityKey, number>> = { ...a };
		for (const [k, v] of Object.entries(b) as [AbilityKey, number][]) out[k] = (out[k] ?? 0) + v;
		return out;
	}
	const out: Partial<Record<AbilityKey, number>> = {};
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

/** Final scores: base plus bonuses, at most 20. */
export function finalScores(d: Character5eDraft): Record<AbilityKey, number> {
	const b = bonuses(d);
	return Object.fromEntries(ABILITIES.map(a => [a, Math.min(20, (d[a] ?? 10) + (b[a] ?? 0))])) as Record<AbilityKey, number>;
}

/** What the character still needs before it can be made, or null. */
export function characterMissing(d: Character5eDraft): string | null {
	if (!d.name.trim()) return 'Name your character first.';
	if (!classOf(d.edition, d.className)) return 'Pick a class.';
	if (d.method === 'pointbuy' && pointsSpent(d) > 27) return `That's ${pointsSpent(d)} points: point buy allows 27.`;
	return null;
}

/** The note's properties: newCharacterFm, then skills (background's and chosen), subclass and spells. */
export function characterFm(d: Character5eDraft): Frontmatter {
	const level = Math.max(1, Math.min(20, d.level ?? 1));
	const species = d.edition === '2014' && d.subspecies ? d.subspecies : d.species;
	const fm = newCharacterFm({ name: d.name.trim(), className: d.className, level, species, background: d.background, scores: finalScores(d), mine: d.mine, edition: d.edition });
	const cls = classOf(d.edition, d.className);
	const skills = [...new Set([...backgroundSkills(backgroundOf(d)), ...d.skills])];
	fm.skills = skills;
	if (d.subclass && level >= subclassLevel(cls)) fm.subclass = d.subclass;
	const { cantrips, maxLevel } = spellsAt(cls, level);
	fm.spells = [...d.cantrips.slice(0, cantrips || d.cantrips.length), ...(maxLevel ? d.spells : [])];
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
	hp: 'average' | 'roll' | 'manual';
	manual?: number;
	subclass: string;
	/** At an Ability Score Improvement: +2 to one, +1 to two, or a feat. */
	asi: 'plus2' | 'plus1' | 'feat';
	a1: string;
	a2: string;
	feat: string;
	spells: string[];
	/** Scores now (for the caps and hints). */
	scores: Record<AbilityKey, number>;
	/** Hit point maximum now (for the summary). */
	hpMax?: number;
	known: string[];
}

/** A level up for a character's properties. */
export function newLevelUp5e(fm: Frontmatter, edition: Dnd5eEdition, name = 'Hero'): LevelUp5eDraft {
	const s = readSheet5e(fm, edition, name);
	const cls = classOf(edition, s.className ?? '');
	const scores = Object.fromEntries(ABILITIES.map(a => [a, s.scores[a]])) as Record<AbilityKey, number>;
	const best = [...ABILITIES].sort((x, y) => scores[y] - scores[x]).filter(a => scores[a] < 20);
	return {
		edition, name: s.name, className: s.className ?? '', level: Math.min(20, s.level + 1), hitDie: cls?.hitDie ?? s.hitDie, conMod: abilityMod(scores.con),
		hasSubclass: !!s.subclass, hp: 'average', subclass: '', asi: 'plus2', a1: best[0] ?? 'str', a2: best[1] ?? 'dex', feat: '', spells: [], scores, hpMax: s.hpMax,
		known: Array.isArray(fm.spells) ? (fm.spells as unknown[]).map(String) : [],
	};
}

export const averageGain = (d: LevelUp5eDraft) => Math.max(1, Math.floor(d.hitDie / 2) + 1 + d.conMod);
export const needsSubclass = (d: LevelUp5eDraft) => !d.hasSubclass && (classOf(d.edition, d.className)?.subclasses.length ?? 0) > 0 && d.level >= subclassLevel(classOf(d.edition, d.className));
export const hasAsi = (d: LevelUp5eDraft) => asiLevels(classOf(d.edition, d.className)).includes(d.level);
export const newSpellLevel = (d: LevelUp5eDraft) => spellsAt(classOf(d.edition, d.className), d.level).maxLevel;

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
	if (hasAsi(d)) {
		if (d.asi === 'feat' && d.feat) {
			const feats = Array.isArray(fm.feats) ? (fm.feats as unknown[]).map(String) : [];
			if (!feats.includes(d.feat)) fm.feats = [...feats, d.feat];
		} else {
			const bump = (a: string, n: number) => { const k = ABILITY_OF[a.toUpperCase()] ?? (a as AbilityKey); if (ABILITIES.includes(k)) fm[k] = Math.min(20, Number(fm[k] ?? 10) + n); };
			if (d.asi === 'plus2') bump(d.a1, 2);
			else { bump(d.a1, 1); if (d.a2 !== d.a1) bump(d.a2, 1); else bump(d.a1, 1); }
		}
	}
	if (d.spells.length) {
		const now = Array.isArray(fm.spells) ? (fm.spells as unknown[]).map(String) : [];
		fm.spells = [...now, ...d.spells.filter(x => !now.includes(x))];
	}
}
