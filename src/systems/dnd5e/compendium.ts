// The 5e compendium: SRD spells, magic items, equipment, classes, species,
// backgrounds, feats and rules for each edition (data/compendium-*.json, built
// by scripts/dnd5e/build.py, read on first use), and one flat list of "hits"
// to search, show as cards and reference (`5e:spell:Fireball`).
// Pure: no Obsidian imports.

import c2014 from './data/compendium-2014.json?gz';
import c2024 from './data/compendium-2024.json?gz';
import { conditionsFor } from './conditions';
import { Content5e, mergeCompendium5e } from './content';
import type { Dnd5eEdition } from './editions';
import type { Feature5e } from './types';

export interface Spell5e {
	name: string; level: number; school: string; castingTime: string; range: string; components: string; duration: string;
	desc: string; higherLevel?: string; classes: string[]; concentration?: boolean; ritual?: boolean;
}
export interface Item5e { name: string; rarity: string; type: string; line?: string; desc: string; attunement?: boolean }
export interface Equipment5e {
	name: string; category: string; tags?: string[]; cost?: string; weight?: number; weaponCategory?: string; weaponRange?: string;
	damage?: string; versatile?: string; range?: string; properties?: string[]; mastery?: string;
	armorCategory?: string; ac?: { base: number; dex: boolean; max?: number }; strMin?: number; stealthDisadvantage?: boolean; desc?: string;
}
export interface ClassFeature5e { level: number; name: string; desc: string }
/** A class table's row. `prepared`: spells known or prepared (a pack's column; the SRD's come from creation.json). `extra`: the class's own numbers. */
export interface ClassLevel5e { level: number; pb: number; features: string[]; slots?: number[]; cantrips?: number; prepared?: number; extra?: Record<string, unknown> }
export interface Subclass5e { name: string; flavor: string; desc: string; features: ClassFeature5e[] }
export interface Class5e {
	name: string; hitDie: number; primary?: string; saves: string[]; proficiencies: string[]; skillChoice: string; spellcasting?: string;
	/** Casts from another class's spell list ("Paladin"); else its own name's. */
	spellList?: string;
	features: ClassFeature5e[]; levels: ClassLevel5e[]; subclasses: Subclass5e[];
}
export interface Species5e { name: string; size: string; speed: number; type?: string; abilityBonuses?: string; desc?: string; traits: Feature5e[]; subspecies: { name: string; desc?: string; traits: Feature5e[] }[] }
export interface Background5e { name: string; proficiencies: string[]; abilityScores?: string[]; feat?: string; feature?: Feature5e; equipment?: string }
export interface Feat5e { name: string; desc: string; prerequisite?: string; type?: string }
/** A rules section (2014) or a Rules Glossary entry (2024, `tag`: Condition, Action, Hazard…). */
export interface Rule5e { name: string; desc: string; topic?: string; tag?: string }
export interface Ability5e { abbr: string; name: string; desc: string; skills: string[] }
export interface Skill5e { name: string; ability: string; desc: string }
/** 2014: who speaks it and its script. 2024: Standard or Rare, nothing more. */
export interface Language5e { name: string; type?: string; speakers?: string; script?: string; desc?: string; note?: string }

export interface Compendium5e {
	spells: Spell5e[];
	items: Item5e[];
	equipment: Equipment5e[];
	weaponProperties: Record<string, string>;
	classes: Class5e[];
	species: Species5e[];
	backgrounds: Background5e[];
	feats: Feat5e[];
	rules: Rule5e[];
	abilities?: Ability5e[];
	skills?: Skill5e[];
	languages?: Language5e[];
}

// ----------------------------------------------------------------------------
// Content packs on top (the runtime sets the layer for the active campaign's packs)

let layer: ((edition: Dnd5eEdition) => Content5e | null) | null = null;
let version = 0;
const merged = new Map<Dnd5eEdition, Compendium5e>();
const added = new Map<Dnd5eEdition, Content5e | null>();

/** Put content packs' entries on top of the SRD (null: none). Everything built from the compendium is rebuilt. */
export function setContentLayer5e(fn: ((edition: Dnd5eEdition) => Content5e | null) | null): void {
	layer = fn;
	version++;
	merged.clear();
	added.clear();
	cache.clear();
}

/** Changes whenever the layer does (for caches built from the compendium). */
export function contentVersion5e(): number {
	return version;
}

/** What the packs add for an edition. */
export function packContent5e(edition: Dnd5eEdition): Content5e | null {
	if (!layer) return null;
	if (!added.has(edition)) added.set(edition, layer(edition));
	return added.get(edition) ?? null;
}

/** An edition's compendium: the SRD, with any content packs on top. */
export function compendium5e(edition: Dnd5eEdition): Compendium5e {
	const base = (edition === '2014' ? c2014 : c2024)() as Compendium5e;
	const add = packContent5e(edition);
	if (!add) return base;
	let m = merged.get(edition);
	if (!m) merged.set(edition, m = mergeCompendium5e(base, add));
	return m;
}

export type Kind5e = 'spell' | 'item' | 'equipment' | 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'rule' | 'condition';

/** What `5e:<kind>:Name` may say, and each kind's words. */
/** Each kind's words; `icon` for the editor's chrome (references, the slash menu), `glyph` for the game's own surfaces (the compendium, Spotlight). */
export const KIND5E: Record<Kind5e, { label: string; plural: string; icon: string; glyph: string; words: string[] }> = {
	spell: { label: 'Spell', plural: 'Spells', icon: 'wand-2', glyph: 'ev-spell', words: ['spell', 'spells'] },
	item: { label: 'Magic item', plural: 'Magic items', icon: 'gem', glyph: 'ev-diamond', words: ['item', 'items', 'magic'] },
	equipment: { label: 'Equipment', plural: 'Equipment', icon: 'sword', glyph: 'ev-sword', words: ['equipment', 'gear', 'weapon', 'armor', 'armour'] },
	class: { label: 'Class', plural: 'Classes', icon: 'graduation-cap', glyph: 'ev-shield-star', words: ['class', 'classes'] },
	subclass: { label: 'Subclass', plural: 'Subclasses', icon: 'git-branch', glyph: 'ev-path', words: ['subclass', 'subclasses'] },
	species: { label: 'Species', plural: 'Species', icon: 'users', glyph: 'ev-users-three', words: ['species', 'race', 'races', 'ancestry'] },
	background: { label: 'Background', plural: 'Backgrounds', icon: 'scroll', glyph: 'ev-scroll', words: ['background', 'backgrounds'] },
	feat: { label: 'Feat', plural: 'Feats', icon: 'award', glyph: 'ev-medal', words: ['feat', 'feats'] },
	rule: { label: 'Rule', plural: 'Rules', icon: 'scale', glyph: 'ev-scales', words: ['rule', 'rules'] },
	condition: { label: 'Condition', plural: 'Conditions', icon: 'activity', glyph: 'ev-condition', words: ['condition', 'conditions'] },
};

/** "spell" → 'spell', "race" → 'species'… */
export function kindFromWord(word: string): Kind5e | undefined {
	const w = word.trim().toLowerCase();
	return (Object.keys(KIND5E) as Kind5e[]).find(k => KIND5E[k].words.includes(w));
}

export type Hit5e =
	| { kind: 'spell'; name: string; edition: Dnd5eEdition; detail: string; spell: Spell5e }
	| { kind: 'item'; name: string; edition: Dnd5eEdition; detail: string; item: Item5e }
	| { kind: 'equipment'; name: string; edition: Dnd5eEdition; detail: string; equipment: Equipment5e }
	| { kind: 'class'; name: string; edition: Dnd5eEdition; detail: string; cls: Class5e }
	| { kind: 'subclass'; name: string; edition: Dnd5eEdition; detail: string; cls: Class5e; subclass: Subclass5e }
	| { kind: 'species'; name: string; edition: Dnd5eEdition; detail: string; species: Species5e }
	| { kind: 'background'; name: string; edition: Dnd5eEdition; detail: string; background: Background5e }
	| { kind: 'feat'; name: string; edition: Dnd5eEdition; detail: string; feat: Feat5e }
	| { kind: 'rule'; name: string; edition: Dnd5eEdition; detail: string; rule: Rule5e }
	| { kind: 'condition'; name: string; edition: Dnd5eEdition; detail: string; desc: string };

const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** "Level 3 Evocation", "Evocation cantrip", with (ritual) and concentration. */
export function spellLine(s: Spell5e, edition: Dnd5eEdition): string {
	const base = s.level === 0
		? `${s.school} cantrip`
		: edition === '2014' ? `${ORDINAL[s.level]}-level ${s.school.toLowerCase()}` : `Level ${s.level} ${s.school}`;
	return `${base}${s.ritual ? ' (ritual)' : ''}`;
}

/** "Wondrous item, uncommon (requires attunement)". */
export function itemLine(i: Item5e): string {
	if (i.line) return i.line;
	return `${i.type.replace(/s$/, '')}, ${i.rarity.toLowerCase()}${i.attunement ? ' (requires attunement)' : ''}`;
}

/** "Martial Melee · 1d8 slashing · 15 gp", "Heavy armor · AC 16 · 75 gp". */
export function equipmentLine(e: Equipment5e): string {
	const kind = e.weaponCategory ? `${e.weaponCategory} ${e.weaponRange ?? ''}`.trim() : e.armorCategory ? `${e.armorCategory} armor` : e.category;
	const ac = e.ac ? `AC ${e.ac.base}${e.ac.dex ? (e.ac.max !== undefined ? ` + Dex (max ${e.ac.max})` : ' + Dex') : ''}` : '';
	return [kind, e.damage, ac, e.cost].filter(Boolean).join(' · ');
}

const cache = new Map<Dnd5eEdition, Hit5e[]>();

/** Everything in an edition's compendium, by kind then name. */
export function allHits(edition: Dnd5eEdition): Hit5e[] {
	let list = cache.get(edition);
	if (list) return list;
	const c = compendium5e(edition);
	list = [
		...c.spells.map((spell): Hit5e => ({ kind: 'spell', name: spell.name, edition, detail: `${spellLine(spell, edition)}${spell.concentration ? ' · concentration' : ''}`, spell })),
		...c.items.map((item): Hit5e => ({ kind: 'item', name: item.name, edition, detail: itemLine(item), item })),
		...c.equipment.map((equipment): Hit5e => ({ kind: 'equipment', name: equipment.name, edition, detail: equipmentLine(equipment), equipment })),
		...c.classes.map((cls): Hit5e => ({ kind: 'class', name: cls.name, edition, detail: `d${cls.hitDie} hit die${cls.primary ? ` · ${cls.primary}` : ''}`, cls })),
		...c.classes.flatMap(cls => cls.subclasses.map((subclass): Hit5e => ({ kind: 'subclass', name: subclass.name, edition, detail: `${cls.name} subclass${subclass.flavor ? ` · ${subclass.flavor}` : ''}`, cls, subclass }))),
		...c.species.map((species): Hit5e => ({ kind: 'species', name: species.name, edition, detail: [edition === '2014' ? 'Race' : 'Species', species.size, `${species.speed} ft.`].join(' · '), species })),
		...c.backgrounds.map((background): Hit5e => ({ kind: 'background', name: background.name, edition, detail: background.feat ? `Background · ${background.feat}` : 'Background', background })),
		...c.feats.map((feat): Hit5e => ({ kind: 'feat', name: feat.name, edition, detail: [feat.type ? `${feat.type} feat` : 'Feat', feat.prerequisite ? `needs ${feat.prerequisite}` : ''].filter(Boolean).join(' · '), feat })),
		// Glossary entries for conditions are the condition hits below.
		...[...c.rules.filter(r => r.tag !== 'Condition'), ...extraRules(c)].map((rule): Hit5e => ({ kind: 'rule', name: rule.name, edition, detail: ruleDetail(rule), rule })),
		...conditionsFor(edition).map((cond): Hit5e => ({ kind: 'condition', name: cond.name, edition, detail: 'Condition', desc: cond.description })),
	];
	cache.set(edition, list);
	return list;
}

function ruleDetail(rule: Rule5e): string {
	if (rule.tag) return `Rule · ${rule.tag}`;
	return rule.topic && rule.topic !== rule.name ? `Rule · ${rule.topic}` : 'Rule';
}

/** The abilities, skills and languages as rules pages (so a stat block's "Str" or "Giant" has one to open). */
export function extraRules(c: Compendium5e): Rule5e[] {
	const taken = new Set(c.rules.map(r => r.name.toLowerCase()));
	const out: Rule5e[] = [];
	const add = (r: Rule5e) => { if (!taken.has(r.name.toLowerCase())) { taken.add(r.name.toLowerCase()); out.push(r); } };
	for (const a of c.abilities ?? []) add({ name: a.name, topic: 'Abilities', desc: abilityText(a) });
	for (const k of c.skills ?? []) add({ name: k.name, topic: 'Skills', desc: skillText(k, c) });
	for (const l of c.languages ?? []) add({ name: l.name, topic: 'Languages', desc: languageText(l) });
	return out;
}

const fullAbility = (abbr: string, c: Compendium5e) => c.abilities?.find(a => a.abbr.toLowerCase() === abbr.toLowerCase())?.name ?? abbr;

export function abilityText(a: Ability5e): string {
	const what = /[.!?]$/.test(a.desc) ? a.desc : `${a.name} measures: ${a.desc.charAt(0).toLowerCase()}${a.desc.slice(1)}.`;
	return [what, a.skills.length ? `**Skills.** ${a.skills.join(', ')}.` : ''].filter(Boolean).join('\n');
}

export function skillText(k: Skill5e, c: Compendium5e): string {
	return `${k.desc}\n**Ability.** ${fullAbility(k.ability, c)} (${k.name}) checks.`;
}

export function languageText(l: Language5e): string {
	const lines = [l.desc ?? `${l.type === 'Rare' ? 'A rare language: secret, or from another plane of existence.' : 'A standard language, widespread in the world.'}`];
	if (l.speakers) lines.push(`**Typical speakers.** ${l.speakers}.`);
	if (l.script) lines.push(`**Script.** ${l.script}.`);
	if (l.note) lines.push(l.note);
	return lines.join('\n');
}

/** A hit by name (and kind, when given), in an edition, else the other one. */
export function findHit(edition: Dnd5eEdition, name: string, kind?: Kind5e): Hit5e | undefined {
	const key = name.trim().toLowerCase();
	const match = (h: Hit5e) => h.name.toLowerCase() === key && (!kind || h.kind === kind);
	return allHits(edition).find(match) ?? allHits(edition === '2014' ? '2024' : '2014').find(match);
}
