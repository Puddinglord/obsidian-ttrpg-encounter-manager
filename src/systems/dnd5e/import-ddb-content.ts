// The content a D&D Beyond character's JSON carries, for your compendium: the
// full definitions of its classes and subclasses (features by level, the level
// table where D&D Beyond gives it), its species, background, feats, spells and
// items, each as the entry a content pack writes (content.ts's kinds), marked
// as imported from D&D Beyond with D&D Beyond's id so a later import finds it.
// It's the user's own copy of what they own, written into their own vault;
// nothing here ships with the plugin and nothing connects to D&D Beyond.
//
// Then the plan: what's new, what the SRD already has (not imported again),
// what an earlier import already wrote (a class gains the levels it didn't
// have), and what you wrote yourself (never touched).
// Pure: no Obsidian imports.
//
// Where things are in the JSON (under `data`), besides what import-ddb.ts reads:
//   classes[].definition: { id, name, description, hitDice, spellCastingAbilityId, canCastSpells, primaryAbilities,
//     classFeatures[]: { id, name, description, requiredLevel }, spellRules: { levelSpellSlots[lvl][], levelCantripsKnownMaxes[lvl],
//     levelSpellKnownMaxes[lvl], levelPreparedSpellMaxes[lvl] }, isHomebrew }
//   classes[].subclassDefinition: { id, name, description, classFeatures[] }
//   classes[].classFeatures[].definition: the character's features, with levelScales[]: { level, dice: { diceString }, fixedValue }
//   actions.{class,race,feat}[]: { componentId, limitedUse: { maxUses, resetType, useProficiencyBonus, statModifierUsesId } }
//   race: { entityRaceId, fullName, description, sizeId, weightSpeeds.normal.walk, racialTraits[].definition: { id, name, description } }
//   background.definition: { id, name, description, skillProficienciesDescription, toolProficienciesDescription,
//     equipmentDescription, featureName, featureDescription, grantedFeats[] }
//   feats[].definition: { id, name, description, prerequisites[].description, categories[].tagName }
//   classSpells[].spells[].definition, spells.{race,class,feat,background}[].definition: { id, name, level, school,
//     activation, range, components, componentsDescription, duration, concentration, ritual, description }
//   inventory[].definition: { id, name, magic, rarity, filterType, type, canAttune, attunementDescription, description,
//     categoryId, attackType, damage, damageType, properties[], range, longRange, armorTypeId, armorClass, cost, weight }

import { htmlToText, labelledValues } from './ddb-html';
import type { Dnd5eEdition } from './editions';
import { equipmentSource5e, itemSource5e, ITEM_LANG, SPELL_LANG, spellSource5e } from './homebrew';
import { toYaml } from '../../core/yaml-lite';
import { fencedBlocks } from '../../core/content/blocks';
import type { ClassFeature5e, ClassLevel5e, ClassResource5e, Equipment5e, Spell5e, StartingEquipment5e } from './compendium';
import { ABILITIES, ABILITY_NAME } from './types';

/** Where an imported entry came from: written on its block as `imported:`, and the compendium tags it Imported. */
export const DDB_ORIGIN = 'D&D Beyond';

export type DdbContentKind = 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'spell' | 'item' | 'equipment';

export interface DdbContentEntry {
	kind: DdbContentKind;
	name: string;
	/** D&D Beyond's id for the definition, the same for every character: a later import finds the entry by it. */
	ddbId?: number;
	/** The entry as a content pack writes it (content.ts's kinds), with `imported` and `ddbId`. */
	value: Record<string, unknown>;
	/** A class or subclass: the highest level D&D Beyond gave its features for (the class's table stops there). */
	seen?: number;
	/** D&D Beyond marks it homebrew. */
	homebrew?: boolean;
	/** What D&D Beyond itself said (not filled in by default), for telling its version from the SRD's. */
	facts?: { hitDie?: number; level?: number; school?: string; rarity?: string; damage?: string };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const raw = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
};
/** D&D Beyond marks 2014 printings "(Legacy)" in some places; the SRD names don't. */
const clean = (s: string) => s.replace(/\s*[([]legacy[)\]]\s*$/i, '').trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a: string, b: string) => key(a) === key(b);
const clampLevel = (n: number | undefined) => Math.max(1, Math.min(20, Math.floor(n ?? 1)));
const pbAt = (level: number) => 2 + Math.floor((level - 1) / 4);
const ABBR_BY_ID: Record<number, string> = { 1: 'STR', 2: 'DEX', 3: 'CON', 4: 'INT', 5: 'WIS', 6: 'CHA' };
const NAME_BY_ID: Record<number, string> = { 1: 'Strength', 2: 'Dexterity', 3: 'Constitution', 4: 'Intelligence', 5: 'Wisdom', 6: 'Charisma' };
const NO_TEXT = 'D&D Beyond gave no text for this.';
/** A feature that only lists the class's numbers and proficiencies (2014's Hit Points, Proficiencies, Equipment; 2024's Core Traits). */
const META_FEATURE = /^(hit points|proficiencies|equipment|core .+ traits)$/i;
const origin = (id: number | undefined): Obj => ({ imported: DDB_ORIGIN, ...(id !== undefined ? { ddbId: id } : {}) });
const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** "Strength and Intelligence", "Str, Int" → ["STR", "INT"]. */
function abilitiesIn(text: string): string[] {
	const out: string[] = [];
	for (const a of ABILITIES) {
		const full = ABILITY_NAME[a];
		if (new RegExp(`\\b(${full}|${a})\\b`, 'i').test(text) && !out.includes(a.toUpperCase())) out.push(a.toUpperCase());
	}
	return out;
}

/** Split a list at commas and semicolons outside brackets: "Book (prayers, hymns), Robe" → two. */
function splitTop(text: string, also?: RegExp): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of text) {
		if (ch === '(' || ch === '[') depth++;
		if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
		if (!depth && (ch === ',' || ch === ';')) { out.push(cur); cur = ''; continue; }
		cur += ch;
	}
	out.push(cur);
	const pieces = out.map(s => s.trim()).filter(Boolean);
	return also ? pieces.flatMap(p => (/\b(that|with|which|of your choice)\b/i.test(p) ? [p] : p.split(also))).map(s => s.replace(/^(and|or)\s+/i, '').trim()).filter(Boolean) : pieces;
}

const SMALL = new Set(['a', 'an', 'and', 'or', 'of', 'the', 'that', 'with', 'have', 'has', 'to', 'in', 'your', 'for']);
const titleCase = (s: string) => s.split(' ').map((w, i) => (i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

/** "Light and Medium armor and Shields" → ["Light Armor", "Medium Armor", "Shields"]; the same for weapons and tools. */
function profList(text: string, kind: 'armor' | 'weapons' | 'tools'): string[] {
	if (!text || /^none\.?$/i.test(text.trim())) return [];
	return splitTop(text.replace(/\.$/, ''), kind === 'tools' ? undefined : /\s+and\s+|\s+or\s+/i).map(p => {
		const t = p.replace(/\.$/, '').trim();
		if (kind === 'armor' && /^(light|medium|heavy)$/i.test(t)) return `${titleCase(t.toLowerCase())} Armor`;
		if (kind === 'weapons' && /^(simple|martial)$/i.test(t)) return `${titleCase(t.toLowerCase())} Weapons`;
		return kind === 'tools' ? t : titleCase(t);
	}).filter(t => !/^none$/i.test(t));
}

/** The first value whose label matches. */
function pick(lv: Map<string, string>, re: RegExp): string {
	for (const [k, v] of lv) if (re.test(k)) return v;
	return '';
}

/** "Choose A or B: (A) Leather Armor, 2 Daggers, and 15 GP; or (B) 75 GP" as starting equipment; undefined for anything looser. */
export function startingEquipmentOf(text: string): StartingEquipment5e[] | undefined {
	const t = text.replace(/\*/g, '').trim();
	const parts = [...t.matchAll(/\(([A-F])\)\s*([\s\S]*?)(?=;?\s*(?:or\s+)?\([A-F]\)|$)/g)];
	if (parts.length < 2) return undefined;
	const options = parts.map(([, label, body]) => {
		const items: string[] = [];
		let gold = 0;
		for (const piece of splitTop(body.replace(/[;.]\s*$/, ''), /\s+and\s+/i)) {
			const gp = /^(\d+)\s*GP$/i.exec(piece);
			if (gp) gold += Number(gp[1]);
			else if (piece && !/^or$/i.test(piece)) items.push(piece.replace(/^or\s+/i, ''));
		}
		return { label, ...(items.length ? { items } : {}), ...(gold ? { gold } : {}) };
	});
	return [{ label: t.replace(/^choose [a-f](?: or [a-f])+:\s*/i, ''), options }];
}

// ----------------------------------------------------------------------------
// Features, with their text and what scales by level

interface FeatureDef { id?: number; name: string; level: number; html: string; snippet: string; scales: Obj[]; classId?: number; sub: boolean }

function featureDef(d: Obj): FeatureDef | null {
	const name = clean(str(d.name));
	if (!name) return null;
	return {
		id: num(d.id), name, level: clampLevel(num(d.requiredLevel)), html: raw(d.description), snippet: raw(d.snippet),
		scales: objs(d.levelScales), classId: num(d.classId), sub: d.isSubClassFeature === true,
	};
}

/** The same feature from two lists (the class's definition, the character's own), joined: the longer text, any scales. */
function joinFeatures(lists: FeatureDef[][]): FeatureDef[] {
	const out: FeatureDef[] = [];
	for (const f of lists.flat()) {
		const have = out.find(x => (f.id !== undefined && x.id === f.id) || (same(x.name, f.name) && x.level === f.level));
		if (!have) { out.push({ ...f }); continue; }
		if (f.html.length > have.html.length) have.html = f.html;
		if (!have.snippet) have.snippet = f.snippet;
		if (!have.scales.length) have.scales = f.scales;
		if (have.id === undefined) have.id = f.id;
	}
	return out.sort((a, b) => a.level - b.level);
}

/** A level scale's value: "1d6", "3". */
function scaleValue(s: Obj): string {
	const dice = obj(s.dice);
	const ds = str(dice.diceString) || (num(dice.diceCount) && num(dice.diceValue) ? `${num(dice.diceCount)}d${num(dice.diceValue)}` : '');
	return ds || (num(s.fixedValue) !== undefined ? String(num(s.fixedValue)) : str(s.description));
}

/** "1d4 at level 1, 1d6 at level 5": a feature whose number grows, written into its text. */
function scaleLine(f: FeatureDef): string {
	const steps = f.scales.map(s => ({ level: clampLevel(num(s.level)), value: scaleValue(s) })).filter(s => s.value).sort((a, b) => a.level - b.level);
	const distinct = steps.filter((s, i) => !i || s.value !== steps[i - 1].value);
	return distinct.length >= 2 ? `**By level.** ${distinct.map(s => `${s.value} at level ${s.level}`).join(', ')}.` : '';
}

function featureText(f: FeatureDef): string {
	const body = htmlToText(f.html) || htmlToText(f.snippet).replace(/\{\{[^}]*\}\}/g, '').trim() || NO_TEXT;
	const scale = scaleLine(f);
	return scale && !body.includes(scale) ? `${body}\n${scale}` : body;
}

/** A number scale at a level (the last step at or below it). */
function scaleAt(f: FeatureDef, level: number): number | undefined {
	let out: number | undefined;
	for (const s of [...f.scales].sort((a, b) => (num(a.level) ?? 0) - (num(b.level) ?? 0))) {
		if ((num(s.level) ?? 99) > level) break;
		const v = num(s.fixedValue);
		if (v !== undefined) out = v;
	}
	return out;
}

/** The character's limited-use actions, by the feature they belong to. */
function limitedUses(c: Obj): Map<number, Obj> {
	const out = new Map<number, Obj>();
	for (const list of Object.values(obj(c.actions))) {
		for (const a of objs(list)) {
			const id = num(a.componentId);
			const lu = obj(a.limitedUse);
			if (id !== undefined && Object.keys(lu).length && !out.has(id)) out.set(id, lu);
		}
	}
	return out;
}

/**
 * Limited-use features as the sheet counts them: a proficiency-bonus or ability-modifier count as a resource, a count
 * that grows by level as the class table's `<feature>_uses` column (`table`), a fixed count as a resource.
 */
function resourcesOf(features: FeatureDef[], uses: Map<number, Obj>, table: boolean): { resources: ClassResource5e[]; columns: FeatureDef[] } {
	const resources: ClassResource5e[] = [];
	const columns: FeatureDef[] = [];
	for (const f of features) {
		const lu = f.id !== undefined ? uses.get(f.id) : undefined;
		if (!lu) continue;
		const reset = num(lu.resetType) === 1 ? 'short' : 'long';
		const base = { name: f.name, ...(f.level > 1 ? { level: f.level } : {}), reset } as const;
		const stat = ABBR_BY_ID[num(lu.statModifierUsesId) ?? 0];
		if (lu.useProficiencyBonus === true) resources.push({ ...base, uses: 'PB' });
		else if (stat) resources.push({ ...base, uses: stat, min: 1 });
		else if (table && f.scales.some(s => num(s.fixedValue) !== undefined)) columns.push(f);
		else if ((num(lu.maxUses) ?? 0) > 0) resources.push({ ...base, uses: num(lu.maxUses)! });
	}
	return { resources, columns };
}

// ----------------------------------------------------------------------------
// Each kind

function classEntries(c: Obj): DdbContentEntry[] {
	const out: DdbContentEntry[] = [];
	const uses = limitedUses(c);
	const classMods = objs(obj(c.modifiers).class);
	for (const x of objs(c.classes)) {
		const def = obj(x.definition);
		const name = clean(str(def.name));
		if (!name) continue;
		const level = clampLevel(num(x.level));
		const defId = num(def.id);
		const subDef = isObj(x.subclassDefinition) ? x.subclassDefinition : null;
		const subId = subDef ? num(subDef.id) : undefined;
		const own = objs(x.classFeatures).map(f => featureDef(obj(f.definition))).filter((f): f is FeatureDef => !!f);
		// The character's own list holds the subclass's features too: by their flag, their class id, or the subclass's own list.
		const subListed = subDef ? objs(subDef.classFeatures).map(featureDef).filter((f): f is FeatureDef => !!f) : [];
		const isSub = (f: FeatureDef) => f.sub || (subId !== undefined && f.classId === subId)
			|| subListed.some(g => (g.id !== undefined && g.id === f.id) || (same(g.name, f.name) && g.level === f.level));
		const all = joinFeatures([objs(def.classFeatures).map(featureDef).filter((f): f is FeatureDef => !!f), own.filter(f => !isSub(f))]);
		const meta = all.filter(f => META_FEATURE.test(f.name));
		const features = all.filter(f => !META_FEATURE.test(f.name));

		// The numbers and proficiencies: 2024's Core Traits table (in the description), 2014's Proficiencies feature.
		const lv = new Map<string, string>();
		for (const html of [raw(def.description), ...meta.map(f => f.html)]) for (const [k, v] of labelledValues(html)) if (!lv.has(k)) lv.set(k, v);
		const ids = new Set(all.map(f => f.id).filter((n): n is number => n !== undefined));
		let saves = abilitiesIn(pick(lv, /saving throw/));
		if (!saves.length) {
			saves = classMods.filter(m => str(m.type) === 'proficiency' && /-saving-throws$/.test(str(m.subType)) && (ids.has(num(m.componentId) ?? NaN) || x.isStartingClass === true))
				.map(m => abilitiesIn(str(m.subType).replace(/-saving-throws$/, ''))[0]).filter((s): s is string => !!s);
			saves = [...new Set(saves)];
		}
		const proficiencies = [
			...profList(pick(lv, /^armor/), 'armor'),
			...profList(pick(lv, /^weapons?\b/), 'weapons'),
			...profList(pick(lv, /^tools?\b/), 'tools').filter(t => !/\b(choose|one type|any|of your choice)\b/i.test(t)),
		];
		const hitDie = num(def.hitDice) ?? num(/d(\d+)/i.exec(pick(lv, /hit (point )?die|hit dice/))?.[1]) ?? 8;
		const primary = pick(lv, /^primary abilit/) || (Array.isArray(def.primaryAbilities) ? def.primaryAbilities.map(id => NAME_BY_ID[num(id) ?? 0]).filter(Boolean).join(' and ') : '');
		const spellAbility = def.canCastSpells === false ? undefined : ABBR_BY_ID[num(def.spellCastingAbilityId) ?? 0];
		const skillChoice = pick(lv, /^skills?\b/);
		const startingEquipment = startingEquipmentOf(pick(lv, /^starting equipment|^equipment$/));

		// The level table, as far as D&D Beyond gave the class's features.
		const seen = Math.max(level, ...features.map(f => f.level));
		const rules = obj(def.spellRules);
		const at = (list: unknown, l: number): unknown => (Array.isArray(list) ? list[l] : undefined);
		const { resources, columns } = resourcesOf(features, uses, true);
		const levels: ClassLevel5e[] = [];
		for (let l = 1; l <= seen; l++) {
			const row: ClassLevel5e = { level: l, pb: pbAt(l), features: features.filter(f => f.level === l).map(f => f.name) };
			const slots = at(rules.levelSpellSlots, l);
			if (spellAbility && Array.isArray(slots) && slots.some(n => (num(n) ?? 0) > 0)) row.slots = slots.map(n => num(n) ?? 0);
			const cantrips = num(at(rules.levelCantripsKnownMaxes, l)) ?? 0;
			if (spellAbility && cantrips > 0) row.cantrips = cantrips;
			const prepared = num(at(rules.levelPreparedSpellMaxes, l)) ?? num(at(rules.levelSpellKnownMaxes, l)) ?? 0;
			if (spellAbility && prepared > 0) row.prepared = prepared;
			const extra: Record<string, number> = {};
			for (const f of columns) { const v = scaleAt(f, l); if (v !== undefined && f.level <= l) extra[`${snake(f.name)}_uses`] = v; }
			if (Object.keys(extra).length) row.extra = extra;
			levels.push(row);
		}

		const value: Obj = {
			name, ...origin(defId), hitDie,
			...(primary ? { primary } : {}),
			saves,
			...(proficiencies.length ? { proficiencies } : {}),
			...(skillChoice ? { skillChoice } : {}),
			...(spellAbility ? { spellcasting: spellAbility } : {}),
			...(resources.length ? { resources } : {}),
			...(startingEquipment ? { startingEquipment } : {}),
			features: features.map((f): ClassFeature5e => ({ level: f.level, name: f.name, desc: featureText(f) })),
			levels,
		};
		out.push({ kind: 'class', name, ddbId: defId, value, seen, homebrew: def.isHomebrew === true, facts: { hitDie: num(def.hitDice) } });

		if (subDef) {
			const subName = clean(str(subDef.name));
			if (!subName) continue;
			const subFeatures = joinFeatures([subListed, own.filter(isSub)]);
			const first = subFeatures.length ? Math.min(...subFeatures.map(f => f.level)) : 3;
			// 2014 names what a subclass is ("Primal Path"): the class's feature at the level the subclass starts.
			const flavorOf = features.find(f => f.level === first && !/subclass$/i.test(f.name) && (/\b(path|college|domain|circle|archetype|oath|conclave|tradition|patron|origin|order|school|way|pact)\b/i.test(f.name) || /subclass/i.test(htmlToText(f.html))));
			const sub = resourcesOf(subFeatures, uses, false);
			out.push({
				kind: 'subclass', name: subName, ddbId: subId,
				value: {
					name: subName, ...origin(subId), class: name,
					...(flavorOf ? { flavor: flavorOf.name } : {}),
					...(htmlToText(raw(subDef.description)) ? { desc: htmlToText(raw(subDef.description)) } : {}),
					features: subFeatures.map((f): ClassFeature5e => ({ level: f.level, name: f.name, desc: featureText(f) })),
					...(sub.resources.length ? { resources: sub.resources } : {}),
				},
				seen: level,
				homebrew: subDef.isHomebrew === true,
			});
		}
	}
	return out;
}

const SIZE_BY_ID: Record<number, string> = { 2: 'Tiny', 3: 'Small', 4: 'Medium', 5: 'Large', 6: 'Huge', 7: 'Gargantuan' };
/** Traits that only say what the species' fields already hold. */
const FACT_TRAIT = /^(ability score (increase|increases)|speed|size|creature type)$/i;
/** Traits the SRD keeps in a species' description, not its traits (2014's Age, Alignment, Languages). */
const LORE_TRAIT = /^(age|alignment|languages?|life ?span)$/i;

function speciesEntry(c: Obj): DdbContentEntry | null {
	const race = obj(c.race);
	const name = clean(str(race.fullName) || str(race.baseName) || str(race.baseRaceName) || str(race.name));
	if (!name) return null;
	const id = num(race.entityRaceId) ?? num(race.id);
	const traits = objs(race.racialTraits).map(t => obj(t.definition)).map(d => ({ id: num(d.id), name: clean(str(d.name)), html: raw(d.description) || raw(d.snippet) })).filter(t => t.name);
	const lv = labelledValues(raw(race.description));
	const size = SIZE_BY_ID[num(race.sizeId) ?? 0] ?? (str(race.size) || pick(lv, /^size/).split(/[ (]/)[0] || 'Medium');
	const speed = num(obj(obj(race.weightSpeeds).normal).walk) ?? num(/\d+/.exec(pick(lv, /^speed/))?.[0]) ?? 30;
	const type = pick(lv, /^creature type/);
	// 2014's racial bonuses, from the modifiers its traits give ("CON +2, WIS +1").
	const traitIds = new Set(traits.map(t => t.id).filter((n): n is number => n !== undefined));
	const bonuses = objs(obj(c.modifiers).race).filter(m => str(m.type) === 'bonus' && /-score$/.test(str(m.subType)) && (!traitIds.size || traitIds.has(num(m.componentId) ?? NaN)));
	const abilityBonuses = bonuses.map(m => `${abilitiesIn(str(m.subType).replace(/-score$/, ''))[0] ?? ''} +${num(m.value) ?? 0}`).filter(s => /^[A-Z]{3} \+[1-9]/.test(s)).join(', ');
	const desc = [htmlToText(raw(race.description)), ...traits.filter(t => LORE_TRAIT.test(t.name)).map(t => `**${t.name}.** ${htmlToText(t.html)}`)].filter(Boolean).join('\n');
	return {
		kind: 'species', name, ddbId: id, homebrew: race.isHomebrew === true,
		value: {
			name, ...origin(id), size, speed,
			...(type ? { type } : {}),
			...(abilityBonuses ? { abilityBonuses } : {}),
			...(desc ? { desc } : {}),
			traits: traits.filter(t => !FACT_TRAIT.test(t.name) && !LORE_TRAIT.test(t.name)).map(t => ({ name: t.name, desc: htmlToText(t.html) || NO_TEXT })),
		},
	};
}

function backgroundEntry(c: Obj): DdbContentEntry | null {
	const bg = obj(c.background);
	const def = obj(bg.definition);
	const name = clean(str(def.name));
	// A custom background has no definition to import.
	if (!name) return null;
	const id = num(def.id);
	const lv = labelledValues(raw(def.description));
	const skills = splitTop(htmlToText(raw(def.skillProficienciesDescription)) || pick(lv, /^skill prof/), /\s+and\s+/i).map(s => s.replace(/\.$/, ''));
	const toolText = htmlToText(raw(def.toolProficienciesDescription)) || pick(lv, /^tool prof/);
	const tools = splitTop(toolText, /\s+and\s+/i).map(s => s.replace(/\.$/, '')).filter(t => t && !/\b(choose|one type|any|of your choice|none)\b/i.test(t));
	const abilityScores = abilitiesIn(pick(lv, /^ability scores?/));
	const feat = pick(lv, /^feat$/) || clean(str(objs(def.grantedFeats)[0]?.name));
	const equipment = (htmlToText(raw(def.equipmentDescription)) || pick(lv, /^equipment/)).replace(/\*/g, '');
	const startingEquipment = startingEquipmentOf(equipment);
	const featureName = clean(str(def.featureName));
	return {
		kind: 'background', name, ddbId: id, homebrew: def.isHomebrew === true,
		value: {
			name, ...origin(id),
			proficiencies: [...skills.filter(Boolean).map(s => `Skill: ${s}`), ...tools.map(t => `Tool: ${t}`)],
			...(abilityScores.length ? { abilityScores } : {}),
			...(feat ? { feat } : {}),
			...(featureName ? { feature: { name: featureName, desc: htmlToText(raw(def.featureDescription)) || NO_TEXT } } : {}),
			...(equipment ? { equipment } : {}),
			...(startingEquipment ? { startingEquipment } : {}),
			...(tools.length ? { tools } : {}),
		},
	};
}

const FEAT_TYPE: Record<string, string> = { origin: 'origin', general: 'general', 'fighting style': 'fighting-style', 'epic boon': 'epic-boon' };

function featEntries(c: Obj): DdbContentEntry[] {
	const out: DdbContentEntry[] = [];
	for (const f of objs(c.feats)) {
		const def = obj(f.definition);
		const name = clean(str(def.name));
		if (!name || out.some(e => same(e.name, name))) continue;
		const id = num(def.id);
		const prerequisite = objs(def.prerequisites).map(p => str(p.description)).filter(Boolean).join('; ') || str(def.prerequisite);
		const category = objs(def.categories).map(x => str(x.tagName).toLowerCase()).find(t => FEAT_TYPE[t]);
		out.push({
			kind: 'feat', name, ddbId: id, homebrew: def.isHomebrew === true,
			value: { name, ...origin(id), ...(category ? { type: FEAT_TYPE[category] } : {}), ...(prerequisite ? { prerequisite } : {}), desc: htmlToText(raw(def.description)) || htmlToText(raw(def.snippet)) || NO_TEXT },
		});
	}
	return out;
}

const UNIT = (n: number, unit: string) => `${n} ${unit.toLowerCase()}${n === 1 ? '' : 's'}`;

function castingTime(d: Obj, edition: Dnd5eEdition): string {
	const a = obj(d.activation);
	const n = num(a.activationTime) ?? 1;
	const later = edition === '2014';
	switch (num(a.activationType)) {
		case 1: return later ? `${n} action${n === 1 ? '' : 's'}` : n === 1 ? 'Action' : `${n} actions`;
		case 3: return later ? '1 bonus action' : 'Bonus Action';
		case 4: return later ? '1 reaction' : 'Reaction';
		case 6: return UNIT(n, 'minute');
		case 7: return UNIT(n, 'hour');
		default: return str(d.castingTimeDescription) || (later ? '1 action' : 'Action');
	}
}

function rangeText(d: Obj): string {
	const r = obj(d.range);
	const from = str(r.origin);
	const value = num(r.rangeValue) ?? 0;
	const area = str(r.aoeType) && num(r.aoeValue) ? ` (${num(r.aoeValue)}-foot ${str(r.aoeType).toLowerCase()})` : '';
	if (/^ranged$/i.test(from) && value) return value >= 5280 && value % 5280 === 0 ? UNIT(value / 5280, 'mile') : `${value} feet`;
	if (/^self$/i.test(from)) return `Self${area}`;
	return from || 'Self';
}

function durationText(d: Obj): string {
	const t = obj(d.duration);
	const type = str(t.durationType);
	const n = num(t.durationInterval) ?? 1;
	const unit = str(t.durationUnit);
	const span = unit ? UNIT(n, unit) : '';
	if (/^concentration$/i.test(type)) return span ? `Concentration, up to ${span}` : 'Concentration';
	if (/^time$/i.test(type) && span) return span;
	if (/^until dispelled/i.test(type)) return type.charAt(0) + type.slice(1).toLowerCase();
	return type || 'Instantaneous';
}

const HIGHER = /^\*{0,3}(Using a Higher-Level Spell Slot|At Higher Levels|Cantrip Upgrade)[.:]?\*{0,3}[.:]?\s*/i;

function spellEntries(c: Obj, edition: Dnd5eEdition): DdbContentEntry[] {
	const byClassId = new Map<number, string>();
	for (const x of objs(c.classes)) { const id = num(x.id); const n = clean(str(obj(x.definition).name)); if (id !== undefined && n) byClassId.set(id, n); }
	const found = new Map<string, { def: Obj; classes: string[] }>();
	const add = (list: unknown, cls?: string) => {
		for (const s of objs(list)) {
			const def = obj(s.definition);
			const name = clean(str(def.name));
			if (!name) continue;
			const k = key(name);
			const have = found.get(k) ?? { def, classes: [] };
			if (cls && !have.classes.includes(cls)) have.classes.push(cls);
			found.set(k, have);
		}
	};
	for (const block of objs(c.classSpells)) add(block.spells, byClassId.get(num(block.characterClassId) ?? NaN));
	// Spells from species, class features, feats and background; an item's spells belong to the item.
	for (const [from, list] of Object.entries(obj(c.spells))) if (from !== 'item') add(list);
	const out: DdbContentEntry[] = [];
	for (const { def, classes } of found.values()) {
		const name = clean(str(def.name));
		const id = num(def.id);
		const lines = htmlToText(raw(def.description)).split('\n');
		const hi = lines.findIndex(l => HIGHER.test(l));
		const desc = (hi >= 0 ? lines.slice(0, hi) : lines).join('\n').trim();
		const higherLevel = hi >= 0 ? lines.slice(hi).join('\n').replace(HIGHER, '').trim() : '';
		const comps = (Array.isArray(def.components) ? def.components : []).map(n => ({ 1: 'V', 2: 'S', 3: 'M' } as Record<number, string>)[num(n) ?? 0]).filter(Boolean);
		const material = str(def.componentsDescription);
		const components = comps.map(x => (x === 'M' && material ? `M (${material.replace(/\.$/, '')})` : x)).join(', ') || 'V, S';
		const duration = durationText(def);
		const spell: Spell5e & Obj = {
			name, ...origin(id),
			level: Math.max(0, Math.min(9, Math.floor(num(def.level) ?? 0))),
			school: titleCase(str(def.school).toLowerCase()) || 'Evocation',
			castingTime: castingTime(def, edition), range: rangeText(def), components, duration,
			desc: desc || NO_TEXT,
			...(higherLevel ? { higherLevel } : {}),
			classes,
			...(def.concentration === true || /^concentration/i.test(duration) ? { concentration: true } : {}),
			...(def.ritual === true ? { ritual: true } : {}),
		};
		out.push({ kind: 'spell', name, ddbId: id, value: spell, homebrew: def.isHomebrew === true, facts: { level: num(def.level), school: str(def.school) || undefined } });
	}
	return out;
}

const ARMOR: Record<number, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy', 4: 'Shield' };

function itemEntries(c: Obj): DdbContentEntry[] {
	const out: DdbContentEntry[] = [];
	for (const it of objs(c.inventory)) {
		const def = obj(it.definition);
		const name = clean(str(def.name));
		if (!name || out.some(e => same(e.name, name))) continue;
		const id = num(def.id);
		const desc = htmlToText(raw(def.description)) || htmlToText(raw(def.snippet));
		const filter = str(def.filterType);
		const base = str(def.type);
		if (def.magic === true) {
			const type = /^(weapon|armor)$/i.test(filter) && base && !same(base, filter) ? `${filter} (${base})` : filter || base || 'Wondrous item';
			const att = def.canAttune === true ? (str(def.attunementDescription) ? `by ${str(def.attunementDescription).replace(/^by\s+/i, '')}` : true) : undefined;
			out.push({
				kind: 'item', name, ddbId: id, homebrew: def.isHomebrew === true, facts: { rarity: str(def.rarity) || undefined },
				value: { name, ...origin(id), rarity: str(def.rarity) || 'Uncommon', type, desc: desc || NO_TEXT, ...(att !== undefined ? { attunement: att } : {}) },
			});
			continue;
		}
		const e: Equipment5e & Obj = { name, ...origin(id), category: 'Adventuring Gear' };
		const armor = ARMOR[num(def.armorTypeId) ?? 0];
		if (/^weapon$/i.test(filter) || obj(def.damage).diceString) {
			e.category = `${num(def.categoryId) === 2 ? 'Martial' : 'Simple'} ${num(def.attackType) === 2 ? 'Ranged' : 'Melee'} Weapon`;
			e.weaponCategory = num(def.categoryId) === 2 ? 'Martial' : 'Simple';
			e.weaponRange = num(def.attackType) === 2 ? 'Ranged' : 'Melee';
			const dice = str(obj(def.damage).diceString);
			if (dice) e.damage = `${dice}${str(def.damageType) ? ` ${str(def.damageType).toLowerCase()}` : ''}`;
			const props = objs(def.properties);
			if (props.length) e.properties = props.map(p => str(p.name)).filter(Boolean);
			const versatile = str(props.find(p => /versatile/i.test(str(p.name)))?.notes);
			if (versatile) e.versatile = versatile;
			const range = num(def.range);
			const long = num(def.longRange);
			if (range && long && long !== range) e.range = `${range}/${long}`;
		} else if (armor) {
			e.category = armor === 'Shield' ? 'Shield' : `${armor} Armor`;
			e.armorCategory = armor;
			const ac = num(def.armorClass);
			if (ac !== undefined) e.ac = armor === 'Shield' ? { base: ac, dex: false } : { base: ac, dex: armor !== 'Heavy', ...(armor === 'Medium' ? { max: 2 } : {}) };
			const strMin = num(def.strengthRequirement);
			if (strMin) e.strMin = strMin;
			if (num(def.stealthCheck) === 2) e.stealthDisadvantage = true;
		} else if (filter && !/^other gear$/i.test(filter)) {
			e.category = filter;
		}
		const cost = num(def.cost);
		if (cost) e.cost = `${cost} gp`;
		const weight = num(def.weight);
		if (weight) e.weight = weight;
		if (desc) e.desc = desc;
		out.push({ kind: 'equipment', name, ddbId: id, value: e, homebrew: def.isHomebrew === true, facts: { damage: str(obj(def.damage).diceString) || undefined } });
	}
	return out;
}

/**
 * Everything a D&D Beyond character (the object import-ddb.ts's `ddbCharacterOf` gives) carries for the compendium:
 * classes, subclasses, species, background, feats, spells and items, in that order.
 */
export function ddbContent(c: Obj, edition: Dnd5eEdition): DdbContentEntry[] {
	return [
		...classEntries(c),
		...[speciesEntry(c), backgroundEntry(c)].filter((e): e is DdbContentEntry => !!e),
		...featEntries(c),
		...spellEntries(c, edition),
		...itemEntries(c),
	].filter(hasSubstance);
}

/** D&D Beyond gave something to import: text or rules, not only a name (a trimmed-down JSON, a custom item). */
function hasSubstance(e: DdbContentEntry): boolean {
	const v = e.value;
	const list = (k: string) => Array.isArray(v[k]) && v[k].length > 0;
	const text = (k: string) => typeof v[k] === 'string' && v[k].trim() !== '' && v[k] !== NO_TEXT;
	switch (e.kind) {
		case 'class': return list('features');
		case 'subclass': return list('features') || text('desc');
		case 'species': return list('traits') || text('desc');
		case 'background': return list('proficiencies') || !!v.feature || text('equipment') || list('abilityScores') || text('feat');
		case 'equipment': return text('desc') || !!v.damage || !!v.ac;
		default: return text('desc');
	}
}

// ----------------------------------------------------------------------------
// The plan: what to add, what's already here

export type DdbPlanStatus = 'new' | 'update' | 'same' | 'srd' | 'yours';

/** What the vault and the SRD already have, for planning an import. */
export interface DdbHave {
	/** The SRD's entry of a kind by name (for the edition), or undefined. */
	srd(kind: DdbContentKind, name: string): Record<string, unknown> | undefined;
	/** Your entries (the content folder's blocks, your spells and items): imported ones carry `imported` and `ddbId`. */
	mine: { kind: DdbContentKind; name: string; value: Record<string, unknown>; file: string }[];
}

export interface DdbPlanItem {
	entry: DdbContentEntry;
	status: DdbPlanStatus;
	/** What gets written: the entry, or for an update the note's entry with what's new added. */
	value: Record<string, unknown>;
	/** Its name in the vault, when that isn't D&D Beyond's (an SRD name whose text differs is imported as "Name (D&D Beyond)"). */
	name: string;
	/** The note an update rewrites. */
	file?: string;
	/** For an update: what's new ("levels 8–10"). */
	what?: string;
	/** Ticked to start with: what's new, and what fills in. */
	on: boolean;
}

/** Spells by themselves; magic items and equipment share the ```5e-item block, so a name is one of either. */
const groupOf = (k: DdbContentKind) => (k === 'equipment' ? 'item' : k);
const numOf = (v: unknown) => num(v);

/**
 * An SRD name whose D&D Beyond version is clearly something else: its homebrew, or another hit die, spell level or
 * school, rarity or damage die than the SRD's, as D&D Beyond itself says (never a default filled in here).
 */
function differs(e: DdbContentEntry, srd: Record<string, unknown>): boolean {
	if (e.homebrew) return true;
	const f = e.facts ?? {};
	const ne = (a: unknown, b: unknown) => a !== undefined && b !== undefined && str(a).toLowerCase() !== str(b).toLowerCase();
	switch (e.kind) {
		case 'class': return ne(f.hitDie, srd.hitDie);
		case 'spell': return ne(f.level, srd.level) || ne(f.school, srd.school);
		case 'item': return ne(f.rarity, srd.rarity);
		case 'equipment': return ne(f.damage, str(srd.damage).split(' ')[0] || undefined);
		default: return false;
	}
}

type Keyed = Record<string, unknown>;
const listOf = (v: unknown): Keyed[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** A list with the items another adds (by key), in order of `sort`. */
function unite(old: unknown, next: unknown, k: (x: Keyed) => string, sort?: (x: Keyed) => number): Keyed[] {
	const a = listOf(old);
	const have = new Set(a.map(k));
	const out = [...a, ...listOf(next).filter(x => !have.has(k(x)))];
	return sort ? out.sort((x, y) => sort(x) - sort(y)) : out;
}

/** "levels 8–10", "level 8". */
const levelsText = (ls: number[]) => (ls.length === 1 ? `level ${ls[0]}` : `levels ${ls[0]}–${ls[ls.length - 1]}`);

/**
 * An earlier import of a class or subclass with what this one adds: the levels and features it didn't have (the
 * note's own text and fields stay as they are), and what that is.
 */
export function fillIn(old: Record<string, unknown>, next: Record<string, unknown>, kind: DdbContentKind): { value: Record<string, unknown>; what?: string } {
	if (kind !== 'class' && kind !== 'subclass') return { value: old };
	const fk = (x: Keyed) => `${str(x.level)}|${key(str(x.name))}`;
	const features = unite(old.features, next.features, fk, x => numOf(x.level) ?? 0);
	const added = features.length - listOf(old.features).length;
	const value: Record<string, unknown> = { ...old, features };
	const resources = unite(old.resources, next.resources, x => key(str(x.name)));
	if (resources.length) value.resources = resources;
	let newLevels: number[] = [];
	if (kind === 'class') {
		const before = new Set(listOf(old.levels).map(x => numOf(x.level)));
		const levels = unite(old.levels, next.levels, x => str(x.level), x => numOf(x.level) ?? 0);
		newLevels = levels.map(x => numOf(x.level) ?? 0).filter(l => !before.has(l));
		value.levels = levels;
	} else {
		newLevels = [...new Set(listOf(next.features).filter(x => !listOf(old.features).some(o => fk(o) === fk(x))).map(x => numOf(x.level) ?? 0))].sort((a, b) => a - b);
	}
	const what = newLevels.length ? levelsText(newLevels) : added > 0 ? `${added} feature${added === 1 ? '' : 's'}` : resources.length > listOf(old.resources).length ? 'limited uses' : undefined;
	return { value, what };
}

/**
 * What to do with each entry: new (ticked); an update to an earlier import that gains levels or features (ticked);
 * already imported and complete, already in the SRD, or already yours (a note of yours by that name; never touched).
 * An SRD name whose version is clearly different is imported as "Name (D&D Beyond)" so the SRD's stays as it is.
 */
export function planDdbContent(entries: DdbContentEntry[], have: DdbHave): DdbPlanItem[] {
	return entries.map((entry): DdbPlanItem => {
		const g = groupOf(entry.kind);
		const mineOf = have.mine.filter(m => groupOf(m.kind) === g);
		const imported = mineOf.filter(m => typeof m.value.imported === 'string');
		const earlier = (entry.ddbId !== undefined ? imported.find(m => numOf(m.value.ddbId) === entry.ddbId) : undefined)
			?? imported.find(m => same(m.name, entry.name) && (entry.ddbId === undefined || numOf(m.value.ddbId) === undefined));
		if (earlier) {
			const { value, what } = fillIn(earlier.value, entry.value, entry.kind);
			return what
				? { entry, status: 'update', value, name: earlier.name, file: earlier.file, what, on: true }
				: { entry, status: 'same', value: earlier.value, name: earlier.name, file: earlier.file, on: false };
		}
		const yours = mineOf.find(m => same(m.name, entry.name));
		if (yours) return { entry, status: 'yours', value: yours.value, name: yours.name, file: yours.file, on: false };
		const srd = have.srd(entry.kind, entry.name);
		if (srd && !differs(entry, srd)) return { entry, status: 'srd', value: entry.value, name: entry.name, on: false };
		if (srd) {
			const name = `${entry.name} (${DDB_ORIGIN})`;
			const taken = mineOf.find(m => same(m.name, name));
			if (taken) return { entry, status: typeof taken.value.imported === 'string' ? 'same' : 'yours', value: taken.value, name: taken.name, file: taken.file, on: false };
			return { entry, status: 'new', value: { ...entry.value, name }, name, on: true };
		}
		return { entry, status: 'new', value: entry.value, name: entry.name, on: true };
	});
}

/** A class or subclass whose features stop before level 20, by name, and where they stop (for "levels 1–7 seen"). */
export function levelsMissing(plan: DdbPlanItem[]): { name: string; kind: DdbContentKind; seen: number }[] {
	return plan.filter(p => p.entry.kind === 'class' && (p.entry.seen ?? 20) < 20 && p.status !== 'srd' && p.status !== 'yours')
		.map(p => ({ name: p.name, kind: p.entry.kind, seen: maxLevel(p.value) }))
		.filter(x => x.seen < 20);
}

/** The highest level a class's table (or a subclass's features) reaches. */
export function maxLevel(value: Record<string, unknown>): number {
	const ls = [...listOf(value.levels), ...listOf(value.features)].map(x => numOf(x.level) ?? 0);
	return ls.length ? Math.max(...ls) : 0;
}

// ----------------------------------------------------------------------------
// Writing

/** The block an entry is written as: ```5e-<kind> (YAML) for classes and the rest, ```5e-spell and ```5e-item for spells and items. */
export function ddbBlock(kind: DdbContentKind, value: Record<string, unknown>, edition: Dnd5eEdition): { lang: string; body: string } {
	const { name, imported, ddbId, ...rest } = value;
	const first = { name, imported, ddbId };
	switch (kind) {
		case 'spell': return { lang: SPELL_LANG, body: spellSource5e(value as unknown as Spell5e, edition) };
		case 'item': return { lang: ITEM_LANG, body: itemSource5e(value as unknown as Parameters<typeof itemSource5e>[0]) };
		case 'equipment': return { lang: ITEM_LANG, body: equipmentSource5e(value as unknown as Equipment5e) };
		default: return { lang: `5e-${kind}`, body: toYaml({ ...first, ...rest }) };
	}
}

/**
 * A note's text with one block replaced: the first ```lang block that says this `ddbId` (else this `name`) becomes
 * `fenced` (the whole block, fences and all). Null when there's no such block.
 */
export function replaceBlock(content: string, lang: string, find: { ddbId?: number; name: string }, fenced: string): string | null {
	const lines = content.split('\n');
	const blocks = fencedBlocks(content, new Set([lang]));
	const says = (body: string, re: RegExp) => body.split('\n').some(l => re.test(l.trim()));
	const esc = find.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const b = (find.ddbId !== undefined ? blocks.find(x => says(x.body, new RegExp(`^ddbId:\\s*${find.ddbId}$`, 'i'))) : undefined)
		?? blocks.find(x => says(x.body, new RegExp(`^name:\\s*["']?${esc}["']?$`, 'i')));
	if (!b) return null;
	const end = b.line + (b.body ? b.body.split('\n').length : 0) + 1;
	return [...lines.slice(0, b.line), ...fenced.split('\n'), ...lines.slice(end + 1)].join('\n');
}

/**
 * Names in a character note's properties, as the vault has them ("Fireball" → "Fireball (D&D Beyond)"): `items` are
 * the entries that are in the vault under their own name (the ones being imported, and earlier imports).
 */
export function renameInFrontmatter(fm: Record<string, unknown>, items: DdbPlanItem[]): void {
	const renames = items.filter(p => p.name !== p.entry.name);
	if (!renames.length) return;
	const to = (kind: DdbContentKind[], v: unknown): unknown => {
		if (typeof v !== 'string') return v;
		const r = renames.find(p => kind.includes(p.entry.kind) && same(p.entry.name, v));
		return r ? r.name : v;
	};
	for (const [field, kinds] of [['class', ['class']], ['subclass', ['subclass']], ['species', ['species']], ['race', ['species']], ['background', ['background']]] as const) {
		if (field in fm) fm[field] = to([...kinds], fm[field]);
	}
	if (Array.isArray(fm.feats)) fm.feats = fm.feats.map((f: unknown) => to(['feat'], f));
	if (Array.isArray(fm.spells)) fm.spells = fm.spells.map((s: unknown) => to(['spell'], s));
	if (Array.isArray(fm.inventory)) fm.inventory = fm.inventory.map((i: unknown) => (isObj(i) ? { ...i, name: to(['item', 'equipment'], i.name) } : to(['item', 'equipment'], i)));
	if (Array.isArray(fm.classes)) fm.classes = fm.classes.map((x: unknown) => (isObj(x) ? { ...x, name: to(['class'], x.name), ...(x.subclass ? { subclass: to(['subclass'], x.subclass) } : {}) } : x));
}

