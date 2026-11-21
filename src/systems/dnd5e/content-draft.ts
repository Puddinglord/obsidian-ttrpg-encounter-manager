// What 5e's builders for your own character content edit: a class (its
// proficiencies, starting equipment, spellcasting, features and their
// options, level table, resources and subclass levels), a subclass, a feat, a
// species and a background. Each draft is read from the kind's pack entry
// (a ```5e-class block's fields, content.ts) and written back as one, so a
// built entry is exactly what a person could type; fields the builder doesn't
// edit are kept as they were. The numbers the books work out (proficiency
// bonus, spell slots by caster type, the SRD's spell columns) are filled in.
// Pure: no Obsidian imports.

import type { Draft } from '../../core/builder/schema';
import { classCreation, classOf, toolOf } from './character-draft';
import { pbForLevel, SKILLS } from './character';
import { Class5e, ClassFeature5e, ClassResource5e, compendium5e, spellsFor5e, StartingEquipment5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';

type Entry = Record<string, unknown>;
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).map(s => s.trim()).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
const list = (v: unknown): Entry[] => (Array.isArray(v) ? v.filter((x): x is Entry => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const isObj = (v: unknown): v is Entry => !!v && typeof v === 'object' && !Array.isArray(v);
/** Text split on commas, for the fields people type as a list ("Chain Mail, Shield, 2 Javelin"). */
export const splitList = (s: string): string[] => s.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
/** Drop what's empty, so the block holds only what was filled in. */
function tidy(o: Entry): Entry {
	const out: Entry = {};
	for (const [k, v] of Object.entries(o)) {
		if (v === undefined || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length)) continue;
		out[k] = v;
	}
	return out;
}
/** The fields this builder writes (a required list stays, even empty), then what the entry had that it doesn't (kept as written). */
function keep(base: Entry | undefined, owned: readonly string[], fields: Entry, required: readonly string[] = []): Entry {
	const kept = tidy(fields);
	const out: Entry = {};
	for (const [k, v] of Object.entries(fields)) if (k in kept || (required.includes(k) && v !== undefined)) out[k] = v;
	for (const [k, v] of Object.entries(base ?? {})) if (!owned.includes(k) && !(k in out) && k !== 'kind' && k !== 'source' && k !== 'note') out[k] = v;
	return out;
}

export const ABILITY_ABBR: readonly string[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
/** STR, Strength, str → STR. */
export function abbrOf(a: string): string | undefined {
	const t = a.trim().toLowerCase();
	const k = ABILITIES.find(x => x === t || ABILITY_NAME[x].toLowerCase() === t);
	return k ? k.toUpperCase() : undefined;
}
export const abilityName = (abbr: string): string => ABILITY_NAME[abbr.toLowerCase() as AbilityKey] ?? abbr;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const numberWord = (n: number): string => WORDS[n] ?? String(n);
/** "A, B, or C" / "A, B, and C" / "A or B". */
export function joinWords(xs: string[], word: 'or' | 'and'): string {
	if (xs.length < 3) return xs.join(` ${word} `);
	return `${xs.slice(0, -1).join(', ')}, ${word} ${xs[xs.length - 1]}`;
}
export const SKILL_NAMES: readonly string[] = SKILLS.map(s => s.name);

/** A value that steps up the levels: set at some levels, the same until the next. */
export type Steps = Record<string, number>;
/** The value at a level: the last step at or before it (0 before the first). */
export function atLevel(steps: Steps | undefined, level: number): number {
	let best = -1, value = 0;
	for (const [k, v] of Object.entries(steps ?? {})) {
		const l = Number(k);
		if (l <= level && l > best && typeof v === 'number') { best = l; value = v; }
	}
	return value;
}
/** Twenty values (level 1 first) as steps: only where the value changes. */
export function toSteps(values: (number | undefined)[]): Steps {
	const out: Steps = {};
	let last = 0;
	values.forEach((v, i) => { const n = v ?? 0; if (n !== last) { out[String(i + 1)] = n; last = n; } });
	return out;
}

// ----------------------------------------------------------------------------
// Spell slots by caster type (the classes' tables: full casters' row by level,
// half and third casters' at half or a third of their level, rounded up; Pact Magic's own)

const FULL: number[][] = [
	[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
	[4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
	[4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Pact Magic: how many slots, and their level. */
const PACT: [number, number][] = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];
export type Caster = '' | 'full' | 'half' | 'third' | 'pact' | 'own';
export const CASTERS: readonly Exclude<Caster, '' | 'own'>[] = ['full', 'half', 'third', 'pact'];
const nine = (xs: number[]) => Array.from({ length: 9 }, (_, i) => xs[i] ?? 0);

/** A caster type's slots at a level, nine spell levels long (undefined: none yet). */
export function slotsFor(caster: Caster, edition: Dnd5eEdition, level: number): number[] | undefined {
	let row: number[] | undefined;
	if (caster === 'full') row = FULL[level - 1];
	else if (caster === 'half') row = edition === '2014' && level < 2 ? undefined : FULL[Math.ceil(level / 2) - 1];
	else if (caster === 'third') row = level < 3 ? undefined : FULL[Math.ceil(level / 3) - 1];
	else if (caster === 'pact') { const [n, at] = PACT[level - 1]; row = nine([]).map((_, i) => (i === at - 1 ? n : 0)); }
	return row ? nine(row) : undefined;
}

/** Which caster type a class's table follows, or 'own' when it follows none ('' without slots). */
export function casterOf(levels: { level: number; slots?: number[] }[], edition: Dnd5eEdition): Caster {
	const rows = LEVELS.map(l => nine(levels.find(r => r.level === l)?.slots ?? []));
	if (rows.every(r => r.every(n => !n))) return '';
	return CASTERS.find(c => LEVELS.every(l => (slotsFor(c, edition, l) ?? nine([])).join() === rows[l - 1].join())) ?? 'own';
}

/** The SRD's casters, for "spells like": each one's cantrips and spells known or prepared, by level. */
export function spellColumns(edition: Dnd5eEdition, like: string): { cantrips: number[]; prepared: number[] } | null {
	const c = classOf(edition, like);
	if (!c || c.source) return null;
	const cr = classCreation(edition, c.name);
	const cantrips = LEVELS.map(l => c.levels.find(r => r.level === l)?.cantrips ?? 0);
	const prepared = LEVELS.map(l => cr?.prepared?.[l - 1] ?? cr?.known?.[l - 1] ?? 0);
	return { cantrips, prepared };
}
/** The SRD classes with spells, for "spells like". */
export function srdCasters(edition: Dnd5eEdition): string[] {
	return compendium5e(edition).classes.filter(c => !c.source && c.spellcasting).map(c => c.name);
}

// ----------------------------------------------------------------------------
// A class

export interface Option5eDraft extends Draft { name: string; desc: string }
export interface ClassFeature5eDraft extends Draft {
	level: number;
	name: string;
	desc: string;
	/** Its options (a Fighting Style's styles), written as features with `group`. */
	options: Option5eDraft[];
	/** With options: how many when gained. */
	choose?: number;
	/** With options: levels that give one more (the table names the feature again). */
	more: string[];
	/** With options: the column that counts them instead. */
	known: string;
}
export interface Column5eDraft extends Draft {
	label: string;
	/** A limited-use feature: pips on the sheet (its key ends in _uses). */
	uses: boolean;
	steps: Steps;
	/** The key it was read with, kept when the label isn't changed. */
	key?: string;
}
export interface Resource5eDraft extends Draft {
	name: string;
	/** A number ("2"), an ability's modifier ("WIS"), "PB", "level", "half", or the formula as written. */
	uses: string;
	count?: number;
	min1: boolean;
	level?: number;
	reset: 'long' | 'short';
	shortFrom?: number;
	shortOne: boolean;
}
export interface EquipOption5eDraft extends Draft { items: string; gold?: number; picks?: unknown }
export interface EquipChoice5eDraft extends Draft { options: EquipOption5eDraft[]; label?: string }

export interface Class5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	hitDie: number;
	primary: string[];
	/** Two primary abilities: both ("and"), or either ("or"). */
	primaryEither: boolean;
	saves: string[];
	armor: string[];
	weapons: string[];
	otherWeapons: string;
	tools: string;
	skillCount: number;
	skillFrom: string[];
	equipment: EquipChoice5eDraft[];
	toolCount?: number;
	toolFrom: string[];
	castAbility: string;
	caster: Caster;
	spellList: string;
	/** 2014: spells known (a column) or prepared (ability modifier + level). */
	spellsKnown: boolean;
	/** The SRD class whose cantrips and spells columns it follows, or '' for its own. */
	spellsLike: string;
	cantrips: Steps;
	prepared: Steps;
	features: ClassFeature5eDraft[];
	columns: Column5eDraft[];
	resources: Resource5eDraft[];
	subclassTitle: string;
	subclassLevels: string[];
	asiLevels: string[];
	epicBoon: boolean;
	/** The level the level table step and the check show (not written). */
	levelAt: number;
	/** The slots of a table that follows no caster type, kept as written. */
	ownSlots?: (number[] | undefined)[];
	/** The entry being edited, for the fields this doesn't edit. */
	base?: Entry;
}

export const ARMOR_5E: readonly string[] = ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shields'];
export const WEAPONS_5E: readonly string[] = ['Simple Weapons', 'Martial Weapons'];
const ASI = 'Ability Score Improvement';
const EPIC = 'Epic Boon';

/** A feature's level, 1 to 20 (a cleared field is level 1). */
export const levelOf = (f: { level?: number }): number => Math.min(20, Math.max(1, Math.floor(f.level || 1)));

export function newFeature5e(level = 1): ClassFeature5eDraft {
	return { level, name: '', desc: '', options: [], more: [], known: '' };
}
export function newResource5e(): Resource5eDraft {
	return { name: '', uses: 'PB', min1: false, reset: 'long', shortOne: false };
}

export function newClass5e(edition: Dnd5eEdition): Class5eDraft {
	return {
		edition, name: '', hitDie: 8, primary: [], primaryEither: false, saves: [], armor: [], weapons: ['Simple Weapons'], otherWeapons: '', tools: '',
		skillCount: 2, skillFrom: [], equipment: [], toolFrom: [], castAbility: '', caster: '', spellList: '', spellsKnown: edition === '2014', spellsLike: '',
		cantrips: {}, prepared: {}, features: [newFeature5e(1)], columns: [], resources: [], subclassTitle: '', subclassLevels: ['3', '6', '10', '14'],
		asiLevels: ['4', '8', '12', '16', ...(edition === '2014' ? ['19'] : [])], epicBoon: edition === '2024', levelAt: 1,
	};
}

/** What its subclasses are called: the title given, else "<Class> Subclass". */
export const subclassTitleOf = (d: Pick<Class5eDraft, 'subclassTitle' | 'name'>): string => d.subclassTitle.trim() || `${d.name.trim() || 'Class'} Subclass`;
const levelsOf = (xs: string[]) => uniq(xs.map(Number).filter(n => n >= 1 && n <= 20)).sort((a, b) => a - b);
export const subclassLevelsOf = (d: Pick<Class5eDraft, 'subclassLevels'>): number[] => levelsOf(d.subclassLevels);
export const asiLevelsOf = (d: Class5eDraft): number[] => levelsOf(d.asiLevels).filter(l => !(d.edition === '2024' && d.epicBoon && l === 19));

/** "hearthfire uses" → hearthfire_uses (a column's key). */
export function columnKey(c: Column5eDraft): string {
	const words = c.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'column';
	// The key it was read with, while its label is the one it was read as.
	const root = (c.key && c.label.trim() === columnLabel(c.key) ? c.key : words).replace(/_uses$/, '');
	return c.uses ? `${root}_uses` : root;
}
/** hearthfire_uses → "Hearthfire". */
export const columnLabel = (key: string): string => key.replace(/_uses$/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** How a resource's uses are written: a number, or a formula the sheet works out ("Wisdom modifier", "PB"). */
export function usesValue(r: Resource5eDraft): number | string {
	if (r.uses === 'number') return Math.max(0, r.count ?? 1);
	const ab = ABILITY_ABBR.find(a => a === r.uses);
	if (ab) return `${abilityName(ab)} modifier`;
	if (r.uses === 'PB') return 'PB';
	if (r.uses === 'level') return 'level';
	if (r.uses === 'half') return 'level / 2';
	return r.uses;
}
/** A resource as it was written, as the builder edits it. */
function resourceDraft(r: Entry): Resource5eDraft {
	const u = r.uses;
	let uses = 'number', count: number | undefined;
	if (typeof u === 'number') count = u;
	else {
		const t = str(u).trim();
		const ab = abbrOf(t.replace(/\s*modifier$/i, '').replace(/\s*mod$/i, ''));
		if (ab) uses = ab;
		else if (/^(pb|proficiency bonus)$/i.test(t)) uses = 'PB';
		else if (/^(class )?level$/i.test(t)) uses = 'level';
		else if (/^(class )?level\s*\/\s*2$|^half (your |class )?level$/i.test(t)) uses = 'half';
		else if (num(t) !== undefined) count = num(t);
		else uses = t;
	}
	return {
		name: str(r.name), uses, count, min1: num(r.min) === 1, level: num(r.level), reset: r.reset === 'short' ? 'short' : 'long', shortFrom: num(r.shortFrom), shortOne: r.shortOne === true,
	};
}
export function resourceEntry(r: Resource5eDraft): ClassResource5e | null {
	if (!r.name.trim()) return null;
	return tidy({
		name: r.name.trim(), uses: usesValue(r), min: r.min1 ? 1 : undefined, level: r.level && r.level > 1 ? levelOf(r) : undefined,
		reset: r.reset === 'short' ? 'short' : undefined, shortFrom: r.reset === 'long' && r.shortFrom ? r.shortFrom : undefined, shortOne: r.shortOne || undefined,
	}) as unknown as ClassResource5e;
}

/** A class's own skill choice as the edition writes it: "Choose 2: A, B, or C" / "Choose two from A, B, and C". */
export function skillChoiceText(edition: Dnd5eEdition, count: number, from: string[]): string {
	const n = Math.max(1, count || 1);
	if (!from.length) return edition === '2014' ? `Choose any ${numberWord(n)}` : `Choose any ${n} skills`;
	return edition === '2014' ? `Choose ${numberWord(n)} from ${joinWords(from, 'and')}` : `Choose ${n}: ${joinWords(from, 'or')}`;
}
/** The words of a generated feature, so reading a block back can tell them from yours. */
export function generatedText(edition: Dnd5eEdition, what: 'asi' | 'epic' | 'subclass' | 'spellcasting' | 'pact', d: { name: string; title?: string; levels?: number[]; list?: string; ability?: string }): string {
	switch (what) {
		case 'asi': return edition === '2014'
			? 'You can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can\'t increase an ability score above 20 using this feature.'
			: 'You gain the Ability Score Improvement feat or another feat of your choice for which you qualify.';
		case 'epic': return 'You gain an Epic Boon feat or another feat of your choice for which you qualify.';
		case 'subclass': return `You choose a ${d.title ?? 'subclass'}. It grants you features at ${d.levels && d.levels.length > 1 ? `${d.name} levels ${joinWords(d.levels.map(String), 'and')}` : `this level`}.`;
		case 'spellcasting': return `You can cast spells from the ${d.list || d.name} spell list, using ${d.ability ? abilityName(d.ability) : 'your spellcasting ability'} as your spellcasting ability.`;
		case 'pact': return `You can cast spells from the ${d.list || d.name} spell list through Pact Magic, using ${d.ability ? abilityName(d.ability) : 'your spellcasting ability'} as your spellcasting ability. Your spell slots come back when you finish a Short or Long Rest.`;
	}
}

/** "Choose A or B: (A) Chain Mail, Shield and 2 Javelins; or (B) 75 GP" for one choice. */
export function equipmentLabel(c: EquipChoice5eDraft): string {
	const letters = 'ABCDEFGH';
	const opt = (o: EquipOption5eDraft) => [...splitList(o.items), ...(o.gold ? [`${o.gold} GP`] : [])].join(', ') || 'nothing';
	const opts = c.options.map((o, i) => `(${letters[i]}) ${opt(o)}`);
	if (opts.length === 1) return opt(c.options[0]);
	return `Choose ${joinWords(c.options.map((_, i) => letters[i]), 'or')}: ${opts.join('; or ')}`;
}
export function equipmentEntry(choices: EquipChoice5eDraft[]): StartingEquipment5e[] {
	const letters = 'ABCDEFGH';
	return choices.filter(c => c.options.some(o => o.items.trim() || o.gold)).map(c => ({
		label: equipmentLabel(c),
		options: c.options.map((o, i) => tidy({ label: letters[i], items: splitList(o.items), picks: o.picks, gold: o.gold || undefined }) as StartingEquipment5e['options'][number]),
	}));
}
function equipmentDraft(v: unknown): EquipChoice5eDraft[] {
	return list(v).map(g => ({
		options: list(g.options).map(o => ({ items: strings(o.items).join(', '), gold: num(o.gold), ...(o.picks ? { picks: o.picks } : {}) })),
	}));
}
/** One option of items and gold (a background's), or (2024) items or gold. */
export const equipmentText = (items: string, gold?: number): string => [...splitList(items), ...(gold ? [`${gold} GP`] : [])].join(', ');

/** The features a class's table names at a level (the class page's Features column). */
function rowFeatures(d: Class5eDraft, level: number): string[] {
	const out: string[] = [];
	const firstSlot = LEVELS.find(l => (slotsAt(d, l) ?? []).some(n => n > 0));
	for (const f of d.features) {
		if (!f.name.trim()) continue;
		if (levelOf(f) === level || (f.options.length && f.more.includes(String(level)) && level > levelOf(f))) out.push(f.name.trim());
	}
	if (d.castAbility && firstSlot === level && !d.features.some(f => same(f.name, castFeature(d)))) out.unshift(castFeature(d));
	const subs = subclassLevelsOf(d);
	if (subs[0] === level) out.push(subclassTitleOf(d));
	else if (subs.includes(level)) out.push(d.edition === '2014' ? `${subclassTitleOf(d)} feature` : 'Subclass feature');
	if (asiLevelsOf(d).includes(level)) out.push(ASI);
	if (d.edition === '2024' && d.epicBoon && level === 19) out.push(EPIC);
	return uniq(out);
}
const castFeature = (d: Class5eDraft) => (d.caster === 'pact' ? 'Pact Magic' : 'Spellcasting');
/** The slots at a level, as the caster type (or the table as written) has them. */
export function slotsAt(d: Class5eDraft, level: number): number[] | undefined {
	if (!d.castAbility || !d.caster) return undefined;
	if (d.caster === 'own') return d.ownSlots?.[level - 1];
	return slotsFor(d.caster, d.edition, level);
}
/** Cantrips and spells known or prepared at a level: the SRD class it follows, else its own. */
export function spellNumbersAt(d: Class5eDraft, level: number): { cantrips: number; prepared: number } {
	if (!d.castAbility || !d.caster) return { cantrips: 0, prepared: 0 };
	const like = d.spellsLike ? spellColumns(d.edition, d.spellsLike) : null;
	const prepared = like ? like.prepared[level - 1] : atLevel(d.prepared, level);
	return { cantrips: like ? like.cantrips[level - 1] : atLevel(d.cantrips, level), prepared: d.edition === '2014' && !d.spellsKnown ? 0 : prepared };
}

/** Everything the class's features say, in order: yours, then what the builder writes for you. */
function classFeatures(d: Class5eDraft): ClassFeature5e[] {
	const out: ClassFeature5e[] = [];
	const name = d.name.trim();
	for (const f of [...d.features].sort((a, b) => levelOf(a) - levelOf(b))) {
		if (!f.name.trim()) continue;
		const parent: ClassFeature5e = { level: levelOf(f), name: f.name.trim(), desc: f.desc.trim() || f.name.trim() };
		if (f.options.some(o => o.name.trim())) {
			if (f.known) parent.known = f.known;
			else if (f.choose && f.choose > 1) parent.choose = f.choose;
		}
		out.push(tidy(parent as unknown as Entry) as unknown as ClassFeature5e);
		for (const o of f.options) if (o.name.trim()) out.push({ level: levelOf(f), name: o.name.trim(), desc: o.desc.trim() || o.name.trim(), group: f.name.trim() });
	}
	const has = (n: string, level?: number) => out.some(f => same(f.name, n) && (level === undefined || f.level === level));
	const firstSlot = LEVELS.find(l => (slotsAt(d, l) ?? []).some(n => n > 0));
	if (d.castAbility && firstSlot && !has(castFeature(d))) {
		out.push({ level: firstSlot, name: castFeature(d), desc: generatedText(d.edition, d.caster === 'pact' ? 'pact' : 'spellcasting', { name, list: d.spellList, ability: d.castAbility }) });
	}
	const subs = subclassLevelsOf(d);
	if (subs.length && !has(subclassTitleOf(d))) out.push({ level: subs[0], name: subclassTitleOf(d), desc: generatedText(d.edition, 'subclass', { name, title: subclassTitleOf(d), levels: subs }) });
	for (const l of asiLevelsOf(d)) if (!has(ASI, l)) out.push({ level: l, name: ASI, desc: generatedText(d.edition, 'asi', { name }) });
	if (d.edition === '2024' && d.epicBoon && !has(EPIC, 19)) out.push({ level: 19, name: EPIC, desc: generatedText(d.edition, 'epic', { name }) });
	return out.sort((a, b) => a.level - b.level);
}

/** The level table: proficiency bonus, features, slots, cantrips, spells, and the class's own columns. */
function classLevels(d: Class5eDraft): Entry[] {
	return LEVELS.map(level => {
		const row: Entry = { level, pb: pbForLevel(level), features: rowFeatures(d, level) };
		// Slots up to the highest spell level it has (the sheet and the class page read a short list the same).
		const slots = slotsAt(d, level) ?? [];
		const top = slots.reduce((n, x, i) => (x > 0 ? i + 1 : n), 0);
		if (top) row.slots = slots.slice(0, top);
		const { cantrips, prepared } = spellNumbersAt(d, level);
		if (cantrips) row.cantrips = cantrips;
		if (prepared) row.prepared = prepared;
		const extra: Entry = {};
		for (const c of d.columns) {
			if (!c.label.trim() && !c.key) continue;
			if (Object.keys(c.steps).some(k => Number(k) <= level)) extra[columnKey(c)] = atLevel(c.steps, level);
		}
		if (Object.keys(extra).length) row.extra = extra;
		return row;
	});
}

/** "Strength", "Strength and Charisma", "Strength or Dexterity". */
export const primaryText = (d: Pick<Class5eDraft, 'primary' | 'primaryEither'>): string => joinWords(d.primary.map(abilityName), d.primaryEither ? 'or' : 'and');

const CLASS_FIELDS = [
	'name', 'hitDie', 'primary', 'saves', 'proficiencies', 'skillChoice', 'spellcasting', 'spellList', 'resources', 'startingEquipment', 'toolChoices',
	'subclassTitle', 'subclassLevels', 'features', 'levels',
] as const;

/** The class as its pack entry: what a ```5e-class block holds. */
export function toClassEntry(d: Class5eDraft): Entry {
	// A tool the compendium knows is written by its name; anything else says it's a tool.
	const tools = splitList(d.tools).map(t => (toolOf(d.edition, t) ? t : `Tool: ${t}`));
	const others = splitList(d.otherWeapons);
	const resources = d.resources.map(resourceEntry).filter((r): r is ClassResource5e => !!r);
	const equipment = equipmentEntry(d.equipment);
	return keep(d.base, CLASS_FIELDS, {
		name: d.name.trim(),
		hitDie: d.hitDie,
		primary: d.primary.length ? primaryText(d) : undefined,
		saves: d.saves,
		proficiencies: [...ARMOR_5E.filter(a => d.armor.includes(a)), ...WEAPONS_5E.filter(w => d.weapons.includes(w)), ...others, ...tools],
		skillChoice: skillChoiceText(d.edition, d.skillCount ?? 2, d.skillFrom),
		spellcasting: d.castAbility && d.caster ? d.castAbility : undefined,
		spellList: d.castAbility && d.caster && d.spellList && !same(d.spellList, d.name) ? d.spellList : undefined,
		resources: resources.length ? resources : undefined,
		startingEquipment: equipment.length ? equipment : undefined,
		toolChoices: d.toolCount && d.toolFrom.length ? { count: d.toolCount, from: d.toolFrom } : undefined,
		subclassTitle: subclassLevelsOf(d).length ? subclassTitleOf(d) : undefined,
		subclassLevels: subclassLevelsOf(d).length ? subclassLevelsOf(d) : undefined,
		features: classFeatures(d),
		levels: classLevels(d),
	}, ['saves', 'features']);
}

/** A class's entry (a block's fields, a pack's entry, the compendium's) as the builder edits it. */
export function fromClassEntry(v: Entry, edition: Dnd5eEdition): Class5eDraft {
	const d = newClass5e(edition);
	d.base = v;
	d.name = str(v.name);
	d.hitDie = num(v.hitDie) ?? 8;
	const primary = str(v.primary);
	d.primary = ABILITY_ABBR.filter(a => new RegExp(`\\b(${a}|${abilityName(a)})\\b`, 'i').test(primary));
	d.primaryEither = /\bor\b/i.test(primary);
	d.saves = strings(v.saves).map(s => abbrOf(s) ?? s);
	const profs = strings(v.proficiencies).filter(p => !/^saving throw/i.test(p));
	d.armor = ARMOR_5E.filter(a => profs.some(p => same(p, a) || same(p, a.replace(/s$/, ''))));
	d.weapons = WEAPONS_5E.filter(w => profs.some(p => same(p, w)));
	d.tools = profs.map(p => toolOf(edition, p)).filter(Boolean).join(', ');
	d.otherWeapons = profs.filter(p => !ARMOR_5E.some(a => same(p, a) || same(p, a.replace(/s$/, ''))) && !WEAPONS_5E.some(w => same(p, w)) && !toolOf(edition, p) && !/^skills?:/i.test(p)).join(', ');
	const sc = str(v.skillChoice);
	const m = /choose\s+(any\s+)?(\w+)/i.exec(sc);
	const word = m ? WORDS.indexOf(m[2].toLowerCase()) : -1;
	d.skillCount = m ? Number(m[2]) || (word > 0 ? word : 2) : 2;
	d.skillFrom = m?.[1] || /any/i.test(sc) ? [] : SKILL_NAMES.filter(s => new RegExp(`\\b${s.replace(/ /g, '\\s+')}\\b`, 'i').test(sc));
	d.equipment = equipmentDraft(v.startingEquipment);
	const tc = isObj(v.toolChoices) ? v.toolChoices : undefined;
	d.toolCount = num(tc?.count);
	d.toolFrom = strings(tc?.from);
	const levels = list(v.levels).map(r => ({ level: num(r.level) ?? 0, pb: num(r.pb), features: strings(r.features), slots: Array.isArray(r.slots) ? r.slots.map(n => num(n) ?? 0) : undefined, cantrips: num(r.cantrips), prepared: num(r.prepared), extra: isObj(r.extra) ? r.extra : {} }));
	d.castAbility = abbrOf(str(v.spellcasting)) ?? '';
	d.caster = d.castAbility ? casterOf(levels, edition) : '';
	if (d.caster === 'own') d.ownSlots = LEVELS.map(l => levels.find(r => r.level === l)?.slots);
	d.spellList = str(v.spellList);
	const cantrips = LEVELS.map(l => levels.find(r => r.level === l)?.cantrips ?? 0);
	const prepared = LEVELS.map(l => levels.find(r => r.level === l)?.prepared ?? 0);
	d.spellsKnown = edition === '2024' || prepared.some(n => n > 0);
	// The SRD class it follows: the one whose list it casts from first (2024's Paladin and Ranger have the same columns).
	d.spellsLike = [...srdCasters(edition)].sort((a, b) => Number(same(b, d.spellList)) - Number(same(a, d.spellList))).find(c => { const col = spellColumns(edition, c); return !!col && col.cantrips.join() === cantrips.join() && col.prepared.join() === prepared.join(); }) ?? '';
	if (!d.spellsLike) { d.cantrips = toSteps(cantrips); d.prepared = toSteps(prepared); }
	const keys = uniq(levels.flatMap(r => Object.keys(r.extra)));
	d.columns = keys.filter(k => LEVELS.some(l => typeof levels.find(r => r.level === l)?.extra[k] === 'number')).map(k => ({
		key: k, label: columnLabel(k), uses: /_uses$/.test(k), steps: toSteps(LEVELS.map(l => num(levels.find(r => r.level === l)?.extra[k]))),
	}));
	d.resources = list(v.resources).map(resourceDraft);
	// Subclass levels: as written, else the rows naming the title, else its subclasses' features.
	d.subclassTitle = str(v.subclassTitle);
	const subLevels = Array.isArray(v.subclassLevels) ? v.subclassLevels.map(n => num(n) ?? 0).filter(n => n > 0) : [];
	const subs = list(v.subclasses).flatMap(s => list(s.features).map(f => num(f.level) ?? 0));
	d.subclassLevels = (subLevels.length ? subLevels : subs.length ? uniq(subs).sort((a, b) => a - b) : [3, 6, 10, 14]).map(String);
	// ASI levels and the Epic Boon from the table.
	d.asiLevels = levels.filter(r => r.features.some(f => same(f, ASI))).map(r => String(r.level));
	d.epicBoon = edition === '2024' && levels.some(r => r.level === 19 && r.features.some(f => same(f, EPIC)));
	// Features: options gathered under their feature; what the builder writes for you left out (it's written again).
	const features = list(v.features).map(f => ({ level: num(f.level) ?? 1, name: str(f.name), desc: str(f.desc), group: str(f.group), choose: num(f.choose), known: str(f.known) }));
	const generated = (f: { level: number; name: string; desc: string }) =>
		(same(f.name, ASI) && f.desc === generatedText(edition, 'asi', { name: d.name }))
		|| (same(f.name, EPIC) && f.desc === generatedText(edition, 'epic', { name: d.name }))
		|| (same(f.name, subclassTitleOf(d)) && f.desc === generatedText(edition, 'subclass', { name: d.name, title: subclassTitleOf(d), levels: subclassLevelsOf(d) }))
		|| (/^(Spellcasting|Pact Magic)$/.test(f.name) && [generatedText(edition, 'spellcasting', { name: d.name, list: d.spellList, ability: d.castAbility }), generatedText(edition, 'pact', { name: d.name, list: d.spellList, ability: d.castAbility })].includes(f.desc));
	const parentOf = (f: { name: string; group: string }) => {
		if (f.group) return f.group;
		const m2 = /^(.+?):\s/.exec(f.name);
		return m2 && features.some(p => p.name === m2[1] || p.name === `${m2[1]}s`) ? m2[1] : '';
	};
	const drafts: ClassFeature5eDraft[] = [];
	for (const f of features) {
		if (parentOf(f) || generated(f)) continue;
		const options = features.filter(o => { const g = parentOf(o); return g && (g === f.name || `${g}s` === f.name); }).map(o => ({ name: o.group ? o.name : o.name.replace(/^[^:]+:\s*/, ''), desc: o.desc }));
		const more = levels.filter(r => r.level > f.level && r.features.includes(f.name)).map(r => String(r.level));
		drafts.push({ level: f.level, name: f.name, desc: f.desc === f.name ? '' : f.desc, options, choose: f.choose, more: options.length ? more : [], known: f.known });
	}
	// Repeats of one feature at later levels (2014's Metamagic at 10 and 17) are its "more" levels.
	d.features = drafts.filter((f, i) => !drafts.slice(0, i).some(g => g.name === f.name));
	if (!d.features.length) d.features = [newFeature5e(1)];
	return d;
}

/** What a level brings, for the check: features and options, a subclass feature, an increase, slots and numbers. */
export interface LevelBrief5e {
	level: number;
	pb: number;
	features: string[];
	/** "Choose 2 Warding Styles". */
	options: { group: string; count: number }[];
	subclass?: 'choose' | 'feature';
	increase?: 'asi' | 'epic';
	slots?: number[];
	cantrips: number;
	prepared: number;
	columns: { label: string; value: number; uses: boolean }[];
	resources: { name: string; from: boolean }[];
}

export function levelBrief(d: Class5eDraft, level: number): LevelBrief5e {
	const subs = subclassLevelsOf(d);
	const named = d.features.filter(f => f.name.trim() && levelOf(f) === level).map(f => f.name.trim());
	const options: LevelBrief5e['options'] = [];
	for (const f of d.features.filter(x => x.name.trim() && x.options.some(o => o.name.trim()))) {
		if (levelOf(f) > level) continue;
		if (f.known) {
			const col = d.columns.find(c => columnKey(c) === f.known);
			const now = atLevel(col?.steps, level), was = level > 1 ? atLevel(col?.steps, level - 1) : 0;
			if (now > was) options.push({ group: f.name.trim(), count: now - was });
		} else if (levelOf(f) === level) options.push({ group: f.name.trim(), count: Math.max(1, f.choose ?? 1) });
		else if (f.more.includes(String(level))) options.push({ group: f.name.trim(), count: 1 });
	}
	const firstSlot = LEVELS.find(l => (slotsAt(d, l) ?? []).some(n => n > 0));
	const { cantrips, prepared } = spellNumbersAt(d, level);
	return {
		level, pb: pbForLevel(level),
		features: uniq([...(d.castAbility && firstSlot === level && !named.some(n => same(n, castFeature(d))) ? [castFeature(d)] : []), ...named]),
		options,
		subclass: subs[0] === level ? 'choose' : subs.includes(level) ? 'feature' : undefined,
		increase: d.edition === '2024' && d.epicBoon && level === 19 ? 'epic' : asiLevelsOf(d).includes(level) ? 'asi' : undefined,
		slots: slotsAt(d, level)?.some(n => n > 0) ? slotsAt(d, level) : undefined,
		cantrips, prepared,
		columns: d.columns.filter(c => c.label.trim() && Object.keys(c.steps).some(k => Number(k) <= level)).map(c => ({ label: c.label.trim(), value: atLevel(c.steps, level), uses: c.uses })),
		resources: d.resources.filter(r => r.name.trim() && (r.level ?? 1) <= level).map(r => ({ name: r.name.trim(), from: (r.level ?? 1) === level })),
	};
}

export function classMissing(d: Class5eDraft): string | null {
	return d.name.trim() ? null : 'Name the class first.';
}
/** An SRD entry of the same name, which yours would replace. */
export function replacesSrd(edition: Dnd5eEdition, kind: 'classes' | 'feats' | 'species' | 'backgrounds', name: string): boolean {
	return !!name.trim() && (compendium5e(edition)[kind] as { name: string; source?: string }[]).some(x => !x.source && same(x.name, name));
}

// ----------------------------------------------------------------------------
// A subclass

export interface SubclassSpells5eDraft extends Draft { level: number; spells: string[] }
export interface Subclass5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	className: string;
	flavor: string;
	desc: string;
	features: ClassFeature5eDraft[];
	spells: SubclassSpells5eDraft[];
	resources: Resource5eDraft[];
	/** The class the blank features were laid out for (not written). */
	followed?: string;
	base?: Entry;
}

/** The levels a class's subclass gives features: as the class says, else its subclasses', else the table's. */
export function subclassLevelsFor(cls: Class5e | undefined): number[] {
	if (!cls) return [3, 6, 10, 14];
	if (cls.subclassLevels?.length) return [...cls.subclassLevels].sort((a, b) => a - b);
	const own = uniq(cls.subclasses.filter(s => !s.source).flatMap(s => s.features.map(f => f.level))).sort((a, b) => a - b);
	if (own.length) return own;
	const any = uniq(cls.subclasses.flatMap(s => s.features.map(f => f.level))).sort((a, b) => a - b);
	if (any.length) return any;
	const title = cls.subclassTitle;
	const rows = cls.levels.filter(l => l.features.some(f => (title && same(f, title)) || /subclass/i.test(f))).map(l => l.level);
	return rows.length ? rows : [3, 6, 10, 14];
}
/** What a class calls its subclasses: as it says, else its SRD subclass's heading ("Primal Path"). */
export function subclassTitleFor(cls: Class5e | undefined): string {
	if (!cls) return '';
	if (cls.subclassTitle) return cls.subclassTitle;
	const first = subclassLevelsFor(cls)[0];
	const row = cls.levels.find(l => l.level === first)?.features ?? [];
	return row.find(f => /subclass/i.test(f)) ?? (cls.subclasses.find(s => !s.source)?.flavor || `${cls.name} Subclass`);
}
/** The levels its spells come at, for a new row: a full caster's odd levels from its subclass, a half caster's 3, 5, 9, 13, 17. */
export function spellLevelsFor(cls: Class5e | undefined): number[] {
	const first = subclassLevelsFor(cls)[0] ?? 3;
	const top = maxSpellLevel(cls, 20);
	const pact = (cls?.levels ?? []).every(r => (r.slots ?? []).filter(n => n > 0).length <= 1);
	return top > 0 && top <= 5 && !pact ? [3, 5, 9, 13, 17] : [first, first + 2, first + 4, first + 6, first + 8].filter(l => l <= 20);
}

export function newSubclass5e(edition: Dnd5eEdition, className = ''): Subclass5eDraft {
	const cls = className ? classOf(edition, className) : compendium5e(edition).classes[0];
	return {
		edition, name: '', className: cls?.name ?? className, flavor: '', desc: '',
		features: subclassLevelsFor(cls).map(l => newFeature5e(l)), spells: [], resources: [], followed: cls?.name ?? className,
	};
}

/** When its class changes, its features follow the new class's levels, while they're still blank. */
export function followClass(d: Subclass5eDraft): void {
	if (d.followed === d.className) return;
	d.followed = d.className;
	if (d.features.some(f => f.name.trim() || f.desc.trim() || f.options.length)) return;
	d.features = subclassLevelsFor(classOf(d.edition, d.className)).map(l => newFeature5e(l));
}

const SUBCLASS_FIELDS = ['name', 'class', 'flavor', 'desc', 'features', 'resources', 'spells'] as const;

export function toSubclassEntry(d: Subclass5eDraft): Entry {
	const features: Entry[] = [];
	for (const f of [...d.features].sort((a, b) => levelOf(a) - levelOf(b))) {
		if (!f.name.trim()) continue;
		features.push(tidy({ level: levelOf(f), name: f.name.trim(), desc: f.desc.trim() || f.name.trim(), choose: f.options.some(o => o.name.trim()) && f.choose && f.choose > 1 ? f.choose : undefined }));
		for (const o of f.options) if (o.name.trim()) features.push({ level: levelOf(f), name: o.name.trim(), desc: o.desc.trim() || o.name.trim(), group: f.name.trim() });
	}
	const resources = d.resources.map(resourceEntry).filter((r): r is ClassResource5e => !!r);
	const spells = d.spells.filter(s => s.spells.length).sort((a, b) => levelOf(a) - levelOf(b)).map(s => ({ level: levelOf(s), spells: s.spells }));
	// Its heading: as typed, else the class's (a homebrew class's "Warden Circle", 2014's "Primal Path"), not 2024's "Barbarian Subclass".
	const title = subclassTitleFor(classOf(d.edition, d.className));
	return keep(d.base, SUBCLASS_FIELDS, {
		name: d.name.trim(), class: d.className, flavor: d.flavor.trim() || (title && !/subclass$/i.test(title) ? title : undefined), desc: d.desc.trim() || undefined,
		features, resources: resources.length ? resources : undefined, spells: spells.length ? spells : undefined,
	}, ['features']);
}

export function fromSubclassEntry(v: Entry, edition: Dnd5eEdition): Subclass5eDraft {
	const d = newSubclass5e(edition, str(v.class));
	d.base = v;
	d.name = str(v.name);
	d.className = str(v.class) || d.className;
	d.followed = d.className;
	d.flavor = str(v.flavor);
	d.desc = str(v.desc);
	const features = list(v.features).map(f => ({ level: num(f.level) ?? 3, name: str(f.name), desc: str(f.desc), group: str(f.group), choose: num(f.choose) }));
	d.features = features.filter(f => !f.group).map(f => ({
		level: f.level, name: f.name, desc: f.desc === f.name ? '' : f.desc, choose: f.choose, more: [], known: '',
		options: features.filter(o => o.group === f.name).map(o => ({ name: o.name, desc: o.desc })),
	}));
	if (!d.features.length) d.features = [newFeature5e(subclassLevelsFor(classOf(edition, d.className))[0])];
	d.spells = list(v.spells).map(s => ({ level: num(s.level) ?? 1, spells: strings(s.spells) }));
	d.resources = list(v.resources).map(resourceDraft);
	return d;
}

export function subclassMissing(d: Subclass5eDraft): string | null {
	if (!d.name.trim()) return 'Name the subclass first.';
	if (!d.className.trim()) return 'Pick its class.';
	return null;
}

// ----------------------------------------------------------------------------
// A feat

export type FeatType5e = 'origin' | 'general' | 'fighting-style' | 'epic-boon';
export const FEAT_TYPES: readonly { value: FeatType5e; label: string }[] = [
	{ value: 'origin', label: 'Origin' }, { value: 'general', label: 'General' }, { value: 'fighting-style', label: 'Fighting Style' }, { value: 'epic-boon', label: 'Epic Boon' },
];
export interface Feat5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	type: FeatType5e;
	prerequisite: string;
	repeatable: boolean;
	increase: string[];
	desc: string;
	base?: Entry;
}
/** A feat type's usual prerequisite, as the 2024 book writes it. */
export function defaultPrerequisite(d: Pick<Feat5eDraft, 'edition' | 'type'>): string {
	if (d.edition === '2014') return '';
	return d.type === 'general' ? 'Level 4+' : d.type === 'epic-boon' ? 'Level 19+' : d.type === 'fighting-style' ? 'Fighting Style Feature' : '';
}
export function newFeat5e(edition: Dnd5eEdition): Feat5eDraft {
	return { edition, name: '', type: 'general', prerequisite: '', repeatable: false, increase: [], desc: '' };
}
const FEAT_FIELDS = ['name', 'type', 'prerequisite', 'repeatable', 'increase', 'desc'] as const;
/** "Increase your Strength or Dexterity score by 1, to a maximum of 20." */
export function increaseText(d: Pick<Feat5eDraft, 'increase' | 'type'>): string {
	const names = ABILITY_ABBR.filter(a => d.increase.includes(a)).map(abilityName);
	return names.length ? `Increase your ${names.length === 6 ? 'one ability' : joinWords(names, 'or')} score by 1, to a maximum of ${d.type === 'epic-boon' ? 30 : 20}.` : '';
}
export function toFeatEntry(d: Feat5eDraft): Entry {
	return keep(d.base, FEAT_FIELDS, {
		name: d.name.trim(), type: d.edition === '2024' || d.base?.type ? d.type : undefined,
		prerequisite: d.prerequisite.trim() || defaultPrerequisite(d) || undefined, repeatable: d.repeatable || undefined,
		increase: d.increase.length ? ABILITY_ABBR.filter(a => d.increase.includes(a)) : undefined,
		// Text is what a feat is; one with only an increase says so.
		desc: d.desc.trim() || (d.increase.length ? `**Ability Score Increase.** ${increaseText(d)}` : d.name.trim()),
	});
}
export function fromFeatEntry(v: Entry, edition: Dnd5eEdition): Feat5eDraft {
	const type = FEAT_TYPES.find(t => t.value === str(v.type))?.value ?? 'general';
	const d: Feat5eDraft = { ...newFeat5e(edition), base: v, name: str(v.name), type, repeatable: v.repeatable === true, increase: strings(v.increase).map(a => abbrOf(a) ?? a), desc: str(v.desc).trim() };
	const pre = str(v.prerequisite);
	d.prerequisite = pre === defaultPrerequisite(d) ? '' : pre;
	return d;
}

// ----------------------------------------------------------------------------
// A species (2014: a race) and its lineages or subraces

export interface Trait5eDraft extends Draft { name: string; desc: string }
export interface OriginChoices5eDraft extends Draft {
	/** Skills it gives, and to choose. */
	skills: string[];
	skillCount?: number;
	skillFrom: string[];
	/** A cantrip to choose, from these. */
	cantripFrom: string[];
	/** Tools to choose. */
	toolCount?: number;
	toolFrom: string[];
	/** 2014: languages it gives, and how many more. */
	languages: string[];
	languageCount?: number;
}
export interface Subspecies5eDraft extends OriginChoices5eDraft { name: string; desc: string; traits: Trait5eDraft[]; bonuses: Record<string, number> }
export interface Species5eDraft extends OriginChoices5eDraft {
	edition: Dnd5eEdition;
	name: string;
	size: string;
	speed: number;
	type: string;
	darkvision: number;
	desc: string;
	traits: Trait5eDraft[];
	/** 2014: +N to an ability, by abbreviation. */
	bonuses: Record<string, number>;
	/** 2014: abilities to choose for a bonus (a half-elf's two +1s). */
	abilityChoiceCount?: number;
	subspecies: Subspecies5eDraft[];
	base?: Entry;
}
export const SIZES_5E: readonly string[] = ['Small', 'Medium', 'Small or Medium'];

const noChoices = (): OriginChoices5eDraft => ({ skills: [], skillFrom: [], cantripFrom: [], toolFrom: [], languages: [] });
export function newSpecies5e(edition: Dnd5eEdition): Species5eDraft {
	return {
		edition, name: '', size: 'Medium', speed: 30, type: 'Humanoid', darkvision: 0, desc: '', traits: [{ name: '', desc: '' }], bonuses: {}, subspecies: [],
		...noChoices(), languages: edition === '2014' ? ['Common'] : [],
	};
}
export function newSubspecies5e(): Subspecies5eDraft {
	return { name: '', desc: '', traits: [{ name: '', desc: '' }], bonuses: {}, ...noChoices() };
}
/** The Darkvision trait, in the edition's words. */
export function darkvisionTrait(edition: Dnd5eEdition, feet: number): { name: string; desc: string } {
	return edition === '2014'
		? { name: 'Darkvision', desc: `You can see in dim light within ${feet} feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.` }
		: { name: 'Darkvision', desc: `You have Darkvision with a range of ${feet} feet.` };
}
/** "DEX +2, WIS +1". */
export const bonusText = (b: Record<string, number>): string => ABILITY_ABBR.filter(a => b[a]).map(a => `${a} +${b[a]}`).join(', ');
function bonusesOf(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const m of text.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\w*\s*\+\s*(\d)/gi)) out[m[1].toUpperCase()] = (out[m[1].toUpperCase()] ?? 0) + Number(m[2]);
	return out;
}
function choicesEntry(c: OriginChoices5eDraft, edition: Dnd5eEdition): Entry {
	return {
		languages: edition === '2014' && c.languages.length ? c.languages : undefined,
		languageChoices: edition === '2014' && c.languageCount ? { count: c.languageCount } : undefined,
		skills: c.skills.length ? c.skills : undefined,
		skillChoices: c.skillCount && c.skillFrom.length ? { count: c.skillCount, from: c.skillFrom } : undefined,
		toolChoices: c.toolCount && c.toolFrom.length ? { count: c.toolCount, from: c.toolFrom } : undefined,
		cantripChoices: c.cantripFrom.length ? { count: 1, from: c.cantripFrom } : undefined,
	};
}
function choicesDraft(v: Entry): OriginChoices5eDraft {
	const obj = (x: unknown) => (isObj(x) ? x : undefined);
	return {
		languages: strings(v.languages), languageCount: num(obj(v.languageChoices)?.count),
		skills: strings(v.skills), skillCount: num(obj(v.skillChoices)?.count), skillFrom: strings(obj(v.skillChoices)?.from),
		toolCount: num(obj(v.toolChoices)?.count), toolFrom: strings(obj(v.toolChoices)?.from),
		cantripFrom: strings(obj(v.cantripChoices)?.from),
	};
}
const traitList = (ts: Trait5eDraft[]) => ts.filter(t => t.name.trim()).map(t => ({ name: t.name.trim(), desc: t.desc.trim() || t.name.trim() }));
const SPECIES_FIELDS = ['name', 'size', 'speed', 'type', 'abilityBonuses', 'abilityChoices', 'desc', 'traits', 'languages', 'languageChoices', 'skills', 'skillChoices', 'toolChoices', 'cantripChoices', 'subspecies'] as const;

export function toSpeciesEntry(d: Species5eDraft): Entry {
	const traits = traitList(d.traits);
	if (d.darkvision > 0 && !traits.some(t => /^darkvision/i.test(t.name))) traits.unshift(darkvisionTrait(d.edition, d.darkvision));
	return keep(d.base, SPECIES_FIELDS, {
		name: d.name.trim(), size: d.size, speed: d.speed ?? 30, type: d.type.trim() || undefined,
		abilityBonuses: d.edition === '2014' ? bonusText(d.bonuses) || undefined : undefined,
		abilityChoices: d.edition === '2014' && d.abilityChoiceCount ? { count: d.abilityChoiceCount, bonus: 1 } : undefined,
		desc: d.desc.trim() || undefined,
		traits,
		...choicesEntry(d, d.edition),
		subspecies: d.subspecies.filter(s => s.name.trim()).map(s => tidy({
			name: s.name.trim(), desc: s.desc.trim() || undefined, traits: traitList(s.traits),
			abilityBonuses: d.edition === '2014' ? bonusText(s.bonuses) || undefined : undefined, ...choicesEntry(s, d.edition),
		})).map(s => ({ traits: [], ...s })),
	});
}
export function fromSpeciesEntry(v: Entry, edition: Dnd5eEdition): Species5eDraft {
	const d = newSpecies5e(edition);
	d.base = v;
	d.name = str(v.name);
	d.size = str(v.size) || 'Medium';
	d.speed = num(v.speed) ?? 30;
	d.type = str(v.type);
	d.desc = str(v.desc);
	const traits = list(v.traits).map(t => ({ name: str(t.name), desc: str(t.desc) }));
	const dv = traits.find(t => /^darkvision/i.test(t.name));
	const feet = dv ? Number(/(\d+)\s*(?:feet|ft)/i.exec(`${dv.name} ${dv.desc}`)?.[1] ?? 0) : 0;
	if (dv && feet && dv.desc === darkvisionTrait(edition, feet).desc) { d.darkvision = feet; traits.splice(traits.indexOf(dv), 1); }
	d.traits = traits;
	d.bonuses = bonusesOf(str(v.abilityBonuses));
	d.abilityChoiceCount = num(isObj(v.abilityChoices) ? v.abilityChoices.count : undefined);
	Object.assign(d, choicesDraft(v));
	d.subspecies = list(v.subspecies).map(s => ({
		name: str(s.name), desc: str(s.desc), traits: list(s.traits).map(t => ({ name: str(t.name), desc: str(t.desc) })), bonuses: bonusesOf(str(s.abilityBonuses)), ...choicesDraft(s),
	}));
	return d;
}

// ----------------------------------------------------------------------------
// A background

export interface Background5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	/** 2024: the three abilities it raises. */
	abilities: string[];
	/** 2024: its origin feat. */
	feat: string;
	skills: string[];
	/** Tools it gives. */
	tools: string[];
	/** Or a tool to choose, from these. */
	toolFrom: string[];
	/** 2014: languages to choose. */
	languageCount?: number;
	/** Option A: items and gold; (2024) option B: gold instead. */
	items: string;
	gold?: number;
	goldInstead?: number;
	/** 2014: its feature. */
	featureName: string;
	featureDesc: string;
	base?: Entry;
}
export function newBackground5e(edition: Dnd5eEdition): Background5eDraft {
	return { edition, name: '', abilities: [], feat: '', skills: [], tools: [], toolFrom: [], items: '', gold: 10, goldInstead: edition === '2024' ? 50 : undefined, featureName: '', featureDesc: '' };
}
const BACKGROUND_FIELDS = ['name', 'abilityScores', 'feat', 'proficiencies', 'tools', 'toolChoices', 'languageChoices', 'equipment', 'startingEquipment', 'feature'] as const;
export function toBackgroundEntry(d: Background5eDraft): Entry {
	const toolProf = (t: string) => `Tool: ${t}`;
	const a = { items: d.items, gold: d.gold };
	const options = d.edition === '2024' && d.goldInstead
		? [{ label: 'A', items: splitList(a.items), gold: a.gold || undefined }, { label: 'B', gold: d.goldInstead }]
		: [{ label: 'A', items: splitList(a.items), gold: a.gold || undefined }];
	const has = splitList(d.items).length || d.gold || d.goldInstead;
	const text = d.edition === '2024' && d.goldInstead
		? `Choose A or B: (A) ${equipmentText(d.items, d.gold) || 'nothing'}; or (B) ${d.goldInstead} GP`
		: equipmentText(d.items, d.gold);
	return keep(d.base, BACKGROUND_FIELDS, {
		name: d.name.trim(),
		abilityScores: d.edition === '2024' && d.abilities.length ? ABILITY_ABBR.filter(x => d.abilities.includes(x)) : undefined,
		feat: d.edition === '2024' ? d.feat || undefined : undefined,
		proficiencies: [...d.skills.map(s => `Skill: ${s}`), ...d.tools.map(toolProf)],
		tools: d.tools.length ? d.tools : undefined,
		toolChoices: d.toolFrom.length ? { count: 1, from: d.toolFrom } : undefined,
		languageChoices: d.edition === '2014' && d.languageCount ? { count: d.languageCount } : undefined,
		equipment: has ? text : undefined,
		startingEquipment: has ? [tidy({ label: d.edition === '2024' && d.goldInstead ? text : undefined, options: options.map(o => tidy(o)) })] : undefined,
		feature: d.edition === '2014' && d.featureName.trim() ? { name: d.featureName.trim(), desc: d.featureDesc.trim() || d.featureName.trim() } : undefined,
	});
}
export function fromBackgroundEntry(v: Entry, edition: Dnd5eEdition): Background5eDraft {
	const d = newBackground5e(edition);
	d.base = v;
	d.name = str(v.name);
	d.abilities = strings(v.abilityScores).map(a => abbrOf(a) ?? a);
	d.feat = str(v.feat);
	const profs = strings(v.proficiencies);
	d.skills = profs.map(p => /^skills?:\s*(.+)$/i.exec(p)?.[1] ?? '').filter(Boolean);
	d.tools = uniq([...profs.map(p => /^tools?:\s*(.+)$/i.exec(p)?.[1] ?? '').filter(Boolean), ...strings(v.tools)]);
	d.toolFrom = strings(isObj(v.toolChoices) ? v.toolChoices.from : undefined);
	d.languageCount = num(isObj(v.languageChoices) ? v.languageChoices.count : undefined);
	const eq = list(v.startingEquipment)[0];
	const opts = list(eq?.options);
	d.items = strings(opts[0]?.items).join(', ');
	d.gold = num(opts[0]?.gold);
	d.goldInstead = num(opts[1]?.gold);
	if (!eq) { d.gold = undefined; d.goldInstead = undefined; }
	const f = isObj(v.feature) ? v.feature : undefined;
	d.featureName = str(f?.name);
	d.featureDesc = str(f?.desc);
	return d;
}

// ----------------------------------------------------------------------------
// Choices the builders offer

/** Tools and instruments in the compendium, for a choice of tools. */
export function toolNames(edition: Dnd5eEdition): string[] {
	return uniq(compendium5e(edition).equipment.filter(e => /tools|instrument|gaming set|kit$|supplies/i.test(`${e.category} ${(e.tags ?? []).join(' ')} ${e.name}`) && !/weapon|armor|ammunition|focus/i.test(e.category)).map(e => e.name)).sort();
}
/** Cantrips (all, or a class's list's). */
export function cantripNames(edition: Dnd5eEdition, cls = ''): string[] {
	const listName = cls ? classOf(edition, cls)?.spellList || cls : '';
	return uniq(spellsFor5e(edition).filter(s => s.level === 0 && (!listName || (s.classes ?? []).some(c => same(c, listName) || same(c, cls)))).map(s => s.name)).sort();
}
/** The highest spell level a class can cast at a class level. */
export function maxSpellLevel(cls: Class5e | undefined, level: number): number {
	let top = 0;
	for (const r of cls?.levels ?? []) if (r.level <= level) (r.slots ?? []).forEach((n, i) => { if (n > 0) top = Math.max(top, i + 1); });
	return top;
}
/**
 * A class's list's spells up to a spell level (a subclass's always-prepared spells come from it); for a class
 * without spells, every spell.
 */
export function classSpellNames(edition: Dnd5eEdition, cls: string, upTo: number): { level: number; names: string[] }[] {
	const c = classOf(edition, cls);
	const listName = c?.spellcasting ? c.spellList || cls : '';
	const spells = spellsFor5e(edition).filter(s => s.level >= 1 && s.level <= Math.max(1, upTo) && (!listName || (s.classes ?? []).some(x => same(x, listName) || same(x, cls))));
	const levels = uniq(spells.map(s => s.level)).sort((a, b) => a - b);
	return levels.map(l => ({ level: l, names: uniq(spells.filter(s => s.level === l).map(s => s.name)).sort() }));
}
