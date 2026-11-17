// The 5e compendium: SRD spells, magic items, equipment, classes, species,
// backgrounds, feats and rules for each edition (data/compendium-*.json, built
// by scripts/dnd5e/build.py, read on first use), and one flat list of "hits"
// to search, show as cards and reference (`5e:spell:Fireball`).
// Pure: no Obsidian imports.

import c2014 from './data/compendium-2014.json?gz';
import c2024 from './data/compendium-2024.json?gz';
import { conditionsFor } from './conditions';
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
export interface ClassLevel5e { level: number; pb: number; features: string[]; slots?: number[]; cantrips?: number; extra?: Record<string, unknown> }
export interface Subclass5e { name: string; flavor: string; desc: string; features: ClassFeature5e[] }
export interface Class5e {
	name: string; hitDie: number; primary?: string; saves: string[]; proficiencies: string[]; skillChoice: string; spellcasting?: string;
	features: ClassFeature5e[]; levels: ClassLevel5e[]; subclasses: Subclass5e[];
}
export interface Species5e { name: string; size: string; speed: number; type?: string; abilityBonuses?: string; desc?: string; traits: Feature5e[]; subspecies: { name: string; desc?: string; traits: Feature5e[] }[] }
export interface Background5e { name: string; proficiencies: string[]; abilityScores?: string[]; feat?: string; feature?: Feature5e; equipment?: string }
export interface Feat5e { name: string; desc: string; prerequisite?: string; type?: string }
export interface Rule5e { name: string; desc: string }

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
}

export function compendium5e(edition: Dnd5eEdition): Compendium5e {
	return (edition === '2014' ? c2014 : c2024)() as Compendium5e;
}

export type Kind5e = 'spell' | 'item' | 'equipment' | 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'rule' | 'condition';

/** What `5e:<kind>:Name` may say, and each kind's words. */
export const KIND5E: Record<Kind5e, { label: string; plural: string; icon: string; words: string[] }> = {
	spell: { label: 'Spell', plural: 'Spells', icon: 'wand-2', words: ['spell', 'spells'] },
	item: { label: 'Magic item', plural: 'Magic items', icon: 'gem', words: ['item', 'items', 'magic'] },
	equipment: { label: 'Equipment', plural: 'Equipment', icon: 'sword', words: ['equipment', 'gear', 'weapon', 'armor', 'armour'] },
	class: { label: 'Class', plural: 'Classes', icon: 'graduation-cap', words: ['class', 'classes'] },
	subclass: { label: 'Subclass', plural: 'Subclasses', icon: 'git-branch', words: ['subclass', 'subclasses'] },
	species: { label: 'Species', plural: 'Species', icon: 'users', words: ['species', 'race', 'races', 'ancestry'] },
	background: { label: 'Background', plural: 'Backgrounds', icon: 'scroll', words: ['background', 'backgrounds'] },
	feat: { label: 'Feat', plural: 'Feats', icon: 'award', words: ['feat', 'feats'] },
	rule: { label: 'Rule', plural: 'Rules', icon: 'scale', words: ['rule', 'rules'] },
	condition: { label: 'Condition', plural: 'Conditions', icon: 'activity', words: ['condition', 'conditions'] },
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
		...c.rules.map((rule): Hit5e => ({ kind: 'rule', name: rule.name, edition, detail: 'Rule', rule })),
		...conditionsFor(edition).map((cond): Hit5e => ({ kind: 'condition', name: cond.name, edition, detail: 'Condition', desc: cond.description })),
	];
	cache.set(edition, list);
	return list;
}

/** A hit by name (and kind, when given), in an edition, else the other one. */
export function findHit(edition: Dnd5eEdition, name: string, kind?: Kind5e): Hit5e | undefined {
	const key = name.trim().toLowerCase();
	const match = (h: Hit5e) => h.name.toLowerCase() === key && (!kind || h.kind === kind);
	return allHits(edition).find(match) ?? allHits(edition === '2014' ? '2024' : '2014').find(match);
}
