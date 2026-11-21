// A Nimble character note: its frontmatter is the data. This module reads that
// frontmatter into a full sheet (filling in what the rules and the compendium
// say when a value is missing) and holds every change the sheet can make, as
// functions that edit a frontmatter object in place, for
// app.fileManager.processFrontMatter. Pure: no Obsidian imports.
//
// Writes keep the YAML tidy: numbers stay numbers, and a key that would only
// repeat its default isn't added (a key the player already wrote is kept).
//
// Rules (Core Rules 3.3, "The Character Sheet"): Defense = armor (DEX if
// unarmored); Initiative = DEX; Speed 6; 6 Wounds; Hit Dice max = level; 10 + STR
// inventory slots; skills are their stat + points + the class's Skilled Hero
// adjustments; one ▲ and one ▼ save from the class; Common + 1 language per
// point of INT.

import {
	Ancestry, Background, ClassEntry, ClassOption, Compendium, Item, nameKey, ResolvedFeature, Spell, STATS, StatKey,
} from './compendium';
import { heroDamage } from './rules';
import { fmTrue } from '../../core/campaign-model';
import { dieAt, resourceRule, ResourceRule, ruleFromData, ruleOf } from './resource-def';

export type Frontmatter = Record<string, unknown>;

export const SKILLS: { name: string; key: string; stat: StatKey }[] = [
	{ name: 'Arcana', key: 'arcana', stat: 'INT' },
	{ name: 'Examination', key: 'examination', stat: 'INT' },
	{ name: 'Finesse', key: 'finesse', stat: 'DEX' },
	{ name: 'Influence', key: 'influence', stat: 'WIL' },
	{ name: 'Insight', key: 'insight', stat: 'WIL' },
	{ name: 'Lore', key: 'lore', stat: 'INT' },
	{ name: 'Might', key: 'might', stat: 'STR' },
	{ name: 'Naturecraft', key: 'naturecraft', stat: 'WIL' },
	{ name: 'Perception', key: 'perception', stat: 'WIL' },
	{ name: 'Stealth', key: 'stealth', stat: 'DEX' },
];

/** Flat HP bonus instead of rolling at level-up (Core Rules 3.3: d4 2, d6 3, d8 4, d10 5, d12 6, d20 10). */
export const HP_AVERAGE: Record<number, number> = { 4: 2, 6: 3, 8: 4, 10: 5, 12: 6, 20: 10 };
export const hpAverage = (die: number, comp?: Compendium): number =>
	Number(comp?.rules.hpAverage?.[String(die)]) || HP_AVERAGE[die] || Math.floor(die / 2);

export const DEFAULT_SPEED = 6;
export const DEFAULT_WOUNDS = 6;
export const DEFAULT_HIT_DIE = 8;

export interface InventoryEntry {
	/** Position in the frontmatter list, for edits. */
	index: number;
	name: string;
	qty: number;
	equipped: boolean;
	slots?: number;
	note?: string;
	item?: Item;
	/** Inventory slots this line takes. */
	slotsUsed: number;
}

export interface Attack {
	name: string;
	/** Dice to roll, e.g. "1d10+2". */
	expression: string;
	/** "slashing · 2-handed". */
	detail: string;
	stat?: StatKey;
	/** A ranged weapon (Range 12): not a Reach attack. */
	ranged?: boolean;
	inventoryIndex: number;
	/** "slashing": shown as an icon on the damage button. */
	damageType?: string;
	/** What else the sheet says about it: its properties and stat ("2-handed · STR"), without the damage type. */
	props?: string;
}

export interface KnownSpell {
	name: string;
	spell?: Spell;
	/** Granted by the class (its schools and tiers) rather than listed in the note. */
	granted: boolean;
	tier: number;
	school: string;
	/** Mana to cast: the tier (cantrips are free). */
	cost: number;
}

export type FeatureGroup = 'Ancestry' | 'Background' | 'Class' | 'Subclass' | 'Chosen' | 'Custom';

export interface SheetFeature {
	name: string;
	text: string;
	group: FeatureGroup;
	level?: number;
	source?: string;
	page?: number | null;
	draft?: boolean;
	/** "Passive", "1 Action", "Reaction"… for class options. */
	cost?: string;
	/** Option group the choice came from ("Savage Arsenal"). */
	optionGroup?: string;
	/** Index in the frontmatter `features` list, for the ones the note lists. */
	index?: number;
}

export interface Resource {
	name: string;
	current: number;
	max?: number;
	die?: string;
	reset?: string;
	/** Dice rolled as you gain them (Judgment Dice): the faces set aside, one per die held (0 = not rolled). */
	rolled?: number[];
	/** How the max is worked out, as the book writes it ("KEY", "5×LVL"): the name's tooltip on the sheet. */
	formula?: string;
	/** Uses of a feature ("(1/Safe Rest)"): the feature they belong to. */
	feature?: string;
	/** How its dice behave, when the class describes them itself (homebrew, content packs); else the books' by name (resource-def.ts). */
	rule?: ResourceRule;
}

export interface CharacterSheet {
	name: string;
	player: string;
	mine: boolean;
	ancestry: string;
	className: string;
	subclass: string;
	level: number;
	background: string;
	size: string;
	height: string;
	weight: string;
	portrait: string;
	stats: Record<StatKey, number>;
	/** The better of the class's key stats (KEY in rules text). */
	key: number;
	saves: Record<StatKey, 'adv' | 'dis' | null>;
	hp: number;
	hpMax: number;
	tempHp: number;
	wounds: number;
	woundsMax: number;
	dying: boolean;
	dead: boolean;
	hitDie: number;
	hitDice: number;
	hitDiceMax: number;
	armor: number;
	initiative: number;
	speed: number;
	caster: boolean;
	mana: number;
	manaMax: number;
	/** Highest spell tier the class can cast at this level (0: cantrips only). */
	maxTier: number;
	skills: { name: string; key: string; stat: StatKey; points: number; total: number }[];
	languages: string[];
	/** How many languages INT allows (Common + 1 per point). */
	languagesMax: number;
	gp: number;
	sp: number;
	cp: number;
	conditions: string[];
	/** Actions left this turn (a hero starts each turn with 3; reactions between turns spend them). */
	actions: number;
	/** Heroic reactions already used this round (each is 1/round). */
	reactionsUsed: string[];
	/** The Hunter's marked Quarry (`quarry:`), or ''. */
	quarry: string;
	inventory: InventoryEntry[];
	slots: { used: number; max: number };
	attacks: Attack[];
	spells: KnownSpell[];
	/** The spell schools the hero knows: the class's, and any the note adds (`schools`, chosen as they level). */
	schools: string[];
	features: SheetFeature[];
	resources: Resource[];
	/** Frontmatter keys present in the note (so the sheet can show what's overridden). */
	set: Set<string>;
	cls?: ClassEntry;
	anc?: Ancestry;
	bg?: Background;
}

// ----------------------------------------------------------------------------
// Reading values

export function num(v: unknown): number | undefined {
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v.trim().replace(/^\+/, '').replace(/[–−]/g, '-'));
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

export function text(v: unknown): string {
	if (typeof v === 'string') return v.trim();
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return '';
}

function list(v: unknown): unknown[] {
	if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined && x !== '');
	if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean);
	return [];
}

function statKey(v: unknown): StatKey | null {
	const s = text(v).toUpperCase().slice(0, 3);
	return (STATS as string[]).includes(s) ? s as StatKey : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Signed number in rules text: "+2", "–1", "−1". */
const signed = (s: string): number => Number(s.replace(/[–−]/, '-'));

/**
 * Bonuses printed in ancestry traits and backgrounds that change the sheet's
 * numbers: "+2 max Hit Dice, +1 max Wounds, –1 Speed", "+1 to all skills and
 * Initiative", "+1 Defense", "+1 Might".
 */
/** Words that make a bonus situational rather than always on. */
const CONDITIONAL = /\b(if|while|when|whenever|as long as|until|unless|during|after|before|against|instead|each time|for each)\b/i;

export function traitBonuses(texts: string[]): { hitDice: number; wounds: number; speed: number; initiative: number; armor: number; allSkills: number; skills: Record<string, number> } {
	const out = { hitDice: 0, wounds: 0, speed: 0, initiative: 0, armor: 0, allSkills: 0, skills: {} as Record<string, number> };
	const N = '([+–−-]\\d+)';
	// Only bonuses that always apply count; "+2 Defense if you moved last turn" is situational.
	const sentences = texts.flatMap(t => (t ?? '').match(/[^.!?\n]+[.!?]?/g) ?? []).filter(x => !CONDITIONAL.test(x));
	for (const t of sentences) {
		if (!t) continue;
		for (const m of t.matchAll(new RegExp(`${N} max Hit Dic?e?`, 'gi'))) out.hitDice += signed(m[1]);
		for (const m of t.matchAll(new RegExp(`${N} max Wounds?`, 'gi'))) out.wounds += signed(m[1]);
		for (const m of t.matchAll(new RegExp(`${N} Speed\\b`, 'gi'))) out.speed += signed(m[1]);
		for (const m of t.matchAll(new RegExp(`${N} Defense\\b`, 'gi'))) out.armor += signed(m[1]);
		for (const m of t.matchAll(new RegExp(`${N} (?:to )?Initiative\\b`, 'gi'))) out.initiative += signed(m[1]);
		for (const m of t.matchAll(new RegExp(`${N} to all skills( and Initiative)?`, 'gi'))) {
			out.allSkills += signed(m[1]);
			if (m[2]) out.initiative += signed(m[1]);
		}
		for (const sk of SKILLS) {
			for (const m of t.matchAll(new RegExp(`${N} (?:to )?${sk.name}\\b`, 'gi'))) out.skills[sk.key] = (out.skills[sk.key] ?? 0) + signed(m[1]);
		}
	}
	return out;
}

/**
 * Evaluate a compendium formula ("INT*3+LVL", "KEY", "(INT×3)+LVL"). Only
 * numbers, + - * / ( ) and the names STR DEX INT WIL KEY LVL; anything else
 * gives undefined. Never uses eval.
 */
export function evalFormula(formula: string | number | undefined, vars: Record<string, number>): number | undefined {
	if (typeof formula === 'number') return formula;
	if (!formula) return undefined;
	const src = formula.replace(/×/g, '*').replace(/[–−]/g, '-').toUpperCase();
	const tokens = src.match(/\d+(?:\.\d+)?|[A-Z]+|[-+*/()]|\S/g) ?? [];
	let i = 0;
	const peek = () => tokens[i];
	const fail = { bad: false };
	const atom = (): number => {
		const t = tokens[i++];
		if (t === undefined) { fail.bad = true; return 0; }
		if (t === '(') { const v = sum(); if (tokens[i++] !== ')') fail.bad = true; return v; }
		if (t === '-') return -atom();
		if (t === '+') return atom();
		if (/^\d/.test(t)) return Number(t);
		if (t in vars) return vars[t];
		fail.bad = true;
		return 0;
	};
	const product = (): number => {
		let v = atom();
		while (peek() === '*' || peek() === '/') {
			const op = tokens[i++];
			const r = atom();
			v = op === '*' ? v * r : r === 0 ? 0 : v / r;
		}
		return v;
	};
	const sum = (): number => {
		let v = product();
		while (peek() === '+' || peek() === '-') {
			const op = tokens[i++];
			const r = product();
			v = op === '+' ? v + r : v - r;
		}
		return v;
	};
	const v = sum();
	if (fail.bad || i !== tokens.length) return undefined;
	return Math.floor(v);
}

/** An armor value as printed: "6+DEX (max 2)", "2+DEX", "10", "+2". */
export function parseArmor(s: string | undefined): { base: number; dex: boolean; dexMax?: number; bonus: boolean } | null {
	if (!s) return null;
	const t = s.replace(/[–−]/g, '-').trim();
	const bonus = t.match(/^\+\s*(\d+)/);
	if (bonus) return { base: Number(bonus[1]), dex: false, bonus: true };
	const m = t.match(/^(\d+)\s*(\+\s*DEX)?(?:\s*\(max\.?\s*(\d+)\))?/i);
	if (!m) return null;
	return { base: Number(m[1]), dex: !!m[2], dexMax: m[3] ? Number(m[3]) : undefined, bonus: false };
}

/** Weapon damage as printed: "1d10+STR slashing", "1d6+STR/DEX piercing", "1d10". */
export function parseDamage(damage: string | undefined, stat?: string): { dice: string; stats: StatKey[]; type: string } | null {
	if (!damage) return null;
	const m = damage.trim().match(/^(\d*d\d+(?:\s*[+-]\s*\d+)?)(?:\s*\+\s*((?:STR|DEX|INT|WIL|KEY)(?:\s*\/\s*(?:STR|DEX|INT|WIL))*))?\s*(.*)$/i);
	if (!m) return null;
	const named = (m[2] || stat || '').toUpperCase().split(/[/\s]+/).filter(s => (STATS as string[]).includes(s)) as StatKey[];
	return { dice: m[1].replace(/\s+/g, '').replace(/^d/, '1d'), stats: named, type: m[3].trim() };
}

/**
 * A damage line made rollable for this hero: "1d10" → 1d10, "3d6+INT" → 3d6+2,
 * "10+KEY" → a flat 13. Words after the numbers ("cold/piercing, Slowed") are ignored.
 */
export function damageRoll(damage: string | undefined, s: Pick<CharacterSheet, 'stats' | 'key' | 'level'>): { expression?: string; flat?: number } | null {
	if (!damage) return null;
	const TERM = '(?:\\d*d\\d+|\\d+|STR|DEX|INT|WIL|KEY|LVL)';
	const m = damage.replace(/[–−]/g, '-').match(new RegExp(`^\\s*(${TERM}(?:\\s*[+-]\\s*${TERM})*)(?![\\w])`, 'i'));
	if (!m) return null;
	let dice = '';
	let sum = 0;
	for (const t of m[1].replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? []) {
		const sign = t.startsWith('-') ? -1 : 1;
		const body = t.replace(/^[+-]/, '').toUpperCase();
		if (/D/.test(body)) { if (!dice) dice = body.toLowerCase().replace(/^d/, '1d'); continue; }
		const v = /^\d+$/.test(body) ? Number(body) : body === 'KEY' ? s.key : body === 'LVL' ? s.level : s.stats[body as StatKey] ?? 0;
		sum += sign * v;
	}
	if (!dice) return { flat: sum };
	return { expression: `${dice}${signedMod(sum)}` };
}

function signedMod(n: number): string {
	return n > 0 ? `+${n}` : n < 0 ? `${n}` : '';
}

/** "+2", "0", "−1" for display. */
/**
 * A feature you use a few times between Safe Rests: "(1/Safe Rest)", "(WIL/Safe Rest)",
 * "(2×WIL times/Safe Rest)" anywhere in its text. The formula as written, or null.
 */
export function featureUses(text: string | undefined): { formula: string } | null {
	const m = String(text ?? '').match(/\(\s*(\d+|(?:\d+\s*[×x*]\s*)?(?:STR|DEX|INT|WIL|KEY|LVL))(?:\s+times?)?\s*\/\s*Safe Rest\s*\)/i);
	return m ? { formula: m[1].replace(/\s+/g, '').replace(/^(\d+)[x*]/i, '$1×').toUpperCase() } : null;
}

export function fmtMod(n: number): string {
	return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '+0';
}

/** Read an inventory line: a string ("Battleaxe", "4 Javelins") or {name, qty, equipped, slots, note}. */
export function readInventoryEntry(v: unknown, index: number): Omit<InventoryEntry, 'slotsUsed' | 'item'> | null {
	if (isObj(v)) {
		const name = text(v.name);
		if (!name) return null;
		return {
			index, name, qty: Math.max(0, num(v.qty) ?? 1), equipped: v.equipped === true || v.equipped === 'true',
			slots: num(v.slots), note: text(v.note) || undefined,
		};
	}
	const s = text(v);
	if (!s) return null;
	const m = s.match(/^(\d+)\s*[x×]?\s+([^\d].*)$/i) ?? s.match(/^(.*\S)\s+[x×]\s*(\d+)$/i);
	if (m) {
		const lead = /^\d/.test(m[1]);
		return { index, name: (lead ? m[2] : m[1]).trim(), qty: Number(lead ? m[1] : m[2]), equipped: false };
	}
	return { index, name: s, qty: 1, equipped: false };
}

function isTwoHanded(item?: Item): boolean {
	// "2-handed (1-handed: Req. 2 STR)" can be carried in one hand, so it isn't counted as bulky.
	return !!item?.properties?.some(p => /^2-handed\b(?!\s*\(1-handed)/i.test(p));
}

function isArmorItem(item?: Item): boolean {
	return !!item && (item.category === 'armor' || item.category === 'shield' || !!item.armor);
}

function slotsFor(e: Omit<InventoryEntry, 'slotsUsed'>): number {
	if (e.slots !== undefined) return Math.max(0, e.slots);
	if (e.item?.slots !== undefined) return Math.max(0, e.item.slots);
	// Core Rules: 2 potions per slot; 2-handed weapons and unworn armor take 2; stacks and small kit take 1.
	if (e.item && /potion/i.test(`${e.item.subcategory ?? ''} ${e.item.name}`)) return Math.ceil(Math.max(1, e.qty) / 2);
	if (isTwoHanded(e.item)) return 2;
	if (e.item?.category === 'armor' && !e.equipped) return 2;
	return 1;
}

// ----------------------------------------------------------------------------
// The sheet

/** Everything the sheet shows, from a note's frontmatter and the compendium. */
export function readCharacter(fmIn: Frontmatter | null | undefined, comp: Compendium, fallbackName = 'Unnamed hero'): CharacterSheet {
	const fm: Frontmatter = isObj(fmIn) ? fmIn : {};
	const set = new Set(Object.keys(fm));
	const level = Math.max(1, Math.min(30, Math.floor(num(fm.level) ?? 1)));
	const className = text(fm.class);
	const subclass = text(fm.subclass);
	const cls = comp.classByName(className) ?? (subclass ? comp.classOfSubclass(subclass) : undefined);
	const anc = comp.ancestry(text(fm.ancestry));
	const bg = comp.background(text(fm.background));

	const stats = { STR: 0, DEX: 0, INT: 0, WIL: 0 } as Record<StatKey, number>;
	for (const s of STATS) stats[s] = Math.floor(num(fm[s.toLowerCase()]) ?? 0);
	// KEY is the better of the class's key stats.
	const keyVals = (cls?.keyStats ?? []).map(k => statKey(k)).filter((k): k is StatKey => !!k).map(k => stats[k]);
	const vars = { ...stats, KEY: keyVals.length ? Math.max(...keyVals) : 0, LVL: level };

	const bonus = traitBonuses([...(anc?.traits ?? []).map(t => `${t.text}`), bg?.text ?? '']);

	// Saves: the class's ▲ and ▼ unless the note says otherwise ("none" clears one).
	const adv = 'save_adv' in fm ? statKey(fm.save_adv) : statKey(cls?.saves?.adv);
	const dis = 'save_dis' in fm ? statKey(fm.save_dis) : statKey(cls?.saves?.dis);
	const saves = { STR: null, DEX: null, INT: null, WIL: null } as CharacterSheet['saves'];
	if (dis) saves[dis] = 'dis';
	if (adv) saves[adv] = 'adv';

	const hitDie = num(fm.hit_die) ?? cls?.hitDie ?? DEFAULT_HIT_DIE;
	const hpMax = Math.max(1, num(fm.hp_max) ?? ((cls?.startingHp ?? 10) + (level - 1) * hpAverage(hitDie, comp)));
	const hp = Math.max(0, Math.min(hpMax, num(fm.hp) ?? hpMax));
	const woundsMax = Math.max(1, num(fm.wounds_max) ?? DEFAULT_WOUNDS + bonus.wounds);
	const wounds = Math.max(0, Math.min(woundsMax, num(fm.wounds) ?? 0));
	const hitDiceMax = Math.max(0, num(fm.hit_dice_max) ?? level + bonus.hitDice);
	const hitDice = Math.max(0, Math.min(hitDiceMax, num(fm.hit_dice) ?? hitDiceMax));

	// Inventory
	const inventory: InventoryEntry[] = [];
	list(fm.inventory).forEach((v, i) => {
		const e = readInventoryEntry(v, i);
		if (!e) return;
		const item = comp.item(e.name);
		const full = { ...e, item };
		inventory.push({ ...full, slotsUsed: slotsFor(full) });
	});
	const slots = { used: inventory.reduce((a, e) => a + e.slotsUsed, 0), max: 10 + stats.STR };

	// Defense: DEX + armor. Worn armor replaces the bare DEX ("6+DEX (max 2)", or a flat "10"); shields add.
	let armorCalc = stats.DEX;
	let shields = 0;
	for (const e of inventory) {
		if (!e.equipped || !isArmorItem(e.item)) continue;
		const a = parseArmor(e.item?.armor);
		if (!a) continue;
		if (a.bonus || e.item?.category === 'shield') shields += a.base;
		else armorCalc = a.base + (a.dex ? Math.min(stats.DEX, a.dexMax ?? Infinity) : 0);
	}
	const armor = num(fm.armor) ?? armorCalc + shields + bonus.armor;
	const initiative = num(fm.initiative) ?? stats.DEX + bonus.initiative;
	const speed = num(fm.speed) ?? DEFAULT_SPEED + bonus.speed;

	// Features: class (up to this level) and subclass from the compendium.
	const classFeatures: ResolvedFeature[] = cls ? comp.featuresFor(cls.name, subclass, level) : [];

	// Spellcasting: tiers unlock with "Tier N Spells" / "may now cast spells up to tier N" features.
	let maxTier = 0;
	for (const f of classFeatures) {
		// "Tier 2 Spells", "Mana and Unlock Tier 1 Spells"; "You may now cast spells up to tier 3"; "You know Radiant cantrips and tier 1 spells".
		const m = f.name.match(/\btier (\d+) spells\b/i)
			?? f.text.match(/may now cast (?:spells up to )?tier (\d+)/i)
			?? f.text.match(/\b(?:know|learn|unlock)\b[^.]*?\btier (\d+)\b[^.]*?\bspells\b/i);
		if (m) maxTier = Math.max(maxTier, Number(m[1]));
	}
	const casting = cls?.casting;
	const manaFrom = casting?.manaFromLevel ?? 1;
	const manaCalc = casting?.manaFormula && level >= manaFrom ? Math.max(0, evalFormula(casting.manaFormula, vars) ?? 0) : 0;
	const manaMax = Math.max(0, num(fm.mana_max) ?? manaCalc);
	const mana = Math.max(0, Math.min(manaMax, num(fm.mana) ?? manaMax));

	const spells: KnownSpell[] = [];
	const seenSpell = new Set<string>();
	const pushSpell = (name: string, sp: Spell | undefined, granted: boolean) => {
		const k = nameKey(name);
		if (seenSpell.has(k)) return;
		seenSpell.add(k);
		const tier = sp?.tier ?? 0;
		// Classes without a mana pool (Shadowmancer) cast another way, so their spells show no mana cost.
		spells.push({ name: sp?.name ?? name, spell: sp, granted, tier, school: sp?.school ?? '', cost: usesMana ? tier : 0 });
	};
	const usesMana = !!casting?.manaFormula || manaMax > 0;
	// The class's schools, then any the note adds (a Songweaver's second school, a Stormshifter's Deepening Study).
	const schoolsKnown = [...new Set([...(casting?.schools ?? []), ...list(fm.schools).map(text).filter(Boolean)])];
	if (cls && casting) {
		// What the class knows: its schools, its spell list, and spells printed for it — up to the tier it has unlocked.
		// Utility spells are chosen (Elemental Mastery…), and GM secret spells are rewards, so neither comes automatically.
		const schools = new Set(schoolsKnown.map(nameKey));
		const listed = new Set((cls.spellList ?? []).map(nameKey));
		for (const sp of comp.spells) {
			if (sp.utility || sp.secret || (sp.tier ?? 0) > maxTier) continue;
			if (schools.has(nameKey(sp.school ?? '')) || listed.has(nameKey(sp.name)) || (sp.class && nameKey(sp.class) === nameKey(cls.name))) pushSpell(sp.name, sp, true);
		}
	}
	for (const sp of cls?.spells ?? []) if ((sp.tier ?? 0) <= maxTier && typeof sp.name === 'string' && !sp.utility) pushSpell(sp.name, comp.spell(sp.name) ?? sp, true);
	for (const v of list(fm.spells)) {
		const name = isObj(v) ? text(v.name) : text(v);
		if (name) pushSpell(name, comp.spell(name), false);
	}
	// A spell named in the note but already granted counts as granted; one only in the note keeps its place.
	const caster = !!casting || spells.length > 0 || manaMax > 0;

	// Skills: stat + points (+ ancestry/background bonuses and the class's Skilled Hero adjustments).
	const pts = isObj(fm.skills) ? fm.skills : {};
	const classSkills: Record<string, number> = {};
	for (const [name, v] of Object.entries(cls?.skillMods ?? {})) if (typeof v === 'number') classSkills[name.toLowerCase()] = v;
	const skillPoints = (k: string): number => {
		for (const [name, v] of Object.entries(pts)) if (name.toLowerCase() === k) return num(v) ?? 0;
		return 0;
	};
	const skills = SKILLS.map(s => {
		const points = skillPoints(s.key);
		return { ...s, points, total: stats[s.stat] + points + bonus.allSkills + (bonus.skills[s.key] ?? 0) + (classSkills[s.key] ?? 0) };
	});

	// Languages: Common, plus the ancestry's own when INT isn't negative ("You know Dwarvish if your INT isn't negative").
	let languages = list(fm.languages).map(text).filter(Boolean);
	if (!('languages' in fm)) {
		languages = ['Common'];
		for (const t of anc?.traits ?? []) {
			const m = t.text?.match(/You know (\w[\w’']*) if your INT isn[’']t negative/i);
			if (m && stats.INT >= 0) languages.push(m[1]);
		}
	}
	const languagesMax = 1 + Math.max(0, stats.INT);

	// Attacks: weapons in the inventory with their damage dice + the better of their stats.
	const attacks: Attack[] = [];
	for (const e of inventory) {
		const it = e.item;
		if (!it || !(it.category === 'weapon' || it.damage)) continue;
		const d = parseDamage(it.damage, it.stat);
		if (!d) continue;
		const best = d.stats.length ? d.stats.reduce((a, b) => (stats[b] > stats[a] ? b : a)) : undefined;
		const mod = best ? stats[best] : 0;
		attacks.push({
			name: e.qty > 1 && !/s$/i.test(e.name) ? `${e.name} ×${e.qty}` : e.name,
			expression: `${d.dice}${signedMod(mod)}`,
			detail: [d.type || it.damageType, ...(it.properties ?? [])].filter(Boolean).join(' · '),
			stat: best,
			ranged: (it.properties ?? []).some(p => /^range\b/i.test(p)),
			inventoryIndex: e.index,
			damageType: d.type || it.damageType || undefined,
			props: [...(it.properties ?? []), best ?? ''].filter(Boolean).join(' · '),
		});
	}

	// Features: ancestry, background, class + subclass up to this level, then what the note lists.
	const features: SheetFeature[] = [];
	for (const t of anc?.traits ?? []) features.push({ name: t.name, text: t.text, group: 'Ancestry', source: anc?.source, page: anc?.page, draft: anc?.draft });
	if (bg) features.push({ name: bg.name, text: [bg.requirement, bg.text].filter(Boolean).join(' '), group: 'Background', source: bg.source, page: bg.page, draft: bg.draft });
	const hasSubclass = classFeatures.some(f => f.from === 'subclass');
	for (const f of classFeatures) {
		// "Subclass: Choose a Berserker subclass" / "Gain your subclass feature" says nothing once the subclass's own features are listed.
		if (hasSubclass && f.from === 'class' && /^subclass$/i.test(f.name)) continue;
		features.push({ name: f.name, text: f.text, group: f.from === 'class' ? 'Class' : 'Subclass', level: f.level, source: f.source, page: f.page, draft: f.draft });
	}
	list(fm.features).forEach((v, index) => {
		const name = isObj(v) ? text(v.name) : text(v);
		if (!name) return;
		const own = isObj(v) ? text(v.text) : '';
		const opt = comp.option(name, cls?.name);
		if (opt) {
			features.push({ name: opt.option.name, text: own || opt.option.text, group: 'Chosen', cost: opt.option.cost, optionGroup: opt.group.name, source: opt.option.source ?? opt.subclass?.source ?? opt.cls.source, page: opt.subclass?.page ?? opt.cls.page, draft: opt.cls.draft, index });
			return;
		}
		const any = comp.search(name, ['feature', 'boon'], 5).find(h => nameKey(h.name) === nameKey(name));
		if (any && !own) features.push({ name: any.name, text: any.text ?? '', group: 'Chosen', cost: any.cost, optionGroup: any.group, source: any.source, page: any.page, draft: any.draft, index });
		else features.push({ name, text: own, group: 'Custom', index });
	});

	// Class resources (Fury Dice…): the max from the compendium, the current value from the note.
	const resources: Resource[] = [];
	const fmRes = isObj(fm.resources) ? fm.resources : {};
	const faces = (v: unknown): number[] | undefined => Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n)) : undefined;
	const resValue = (name: string): { current?: number; max?: number; rolled?: number[] } => {
		for (const [k, v] of Object.entries(fmRes)) {
			if (nameKey(k) !== nameKey(name)) continue;
			return isObj(v) ? { current: num(v.current), max: num(v.max), rolled: faces(v.rolled) } : { current: num(v) };
		}
		return {};
	};
	for (const r of cls?.resources ?? []) {
		if (!r?.name) continue;
		const v = resValue(r.name);
		const own = ruleFromData(r);
		const rule = own ?? resourceRule(r.name);
		// "+1 max Combat Dice", chosen instead of an ability (Commander's Fit for Any Battlefield), once per pick.
		const extra = features.filter(f => new RegExp(`^\\+(\\d+) max ${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/s$/i, '')}s?\\b`, 'i').test(f.name))
			.reduce((n, f) => n + Number(/^\+(\d+)/.exec(f.name)?.[1] ?? 0), 0);
		const base = v.max ?? (rule?.maxAt ? rule.maxAt(level, text(fm.subclass)) : evalFormula(r.max, vars));
		const max = base !== undefined && v.max === undefined ? base + extra : base;
		// Dice that grow with level: "Your Fury Dice are now d6s."
		let die = r.die;
		for (const f of classFeatures) {
			const m = f.text.match(new RegExp(`${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} are now (d\\d+)`, 'i'));
			if (m) die = m[1];
		}
		die = dieAt(rule, level) ?? die;
		const startsEmpty = (/ends?\b/i.test(r.reset ?? '') && !/rest/i.test(r.reset ?? '')) || rule?.rolledWhen === 'gained' || !!rule?.clearsOnRest;
		const current = Math.max(0, Math.min(max ?? Infinity, v.current ?? (startsEmpty ? 0 : max ?? 0)));
		resources.push({ name: r.name, current, max: max !== undefined ? Math.max(0, max) : undefined, die, reset: r.reset, rolled: v.rolled?.slice(0, current), formula: r.max !== undefined ? String(r.max) : undefined, ...(own ? { rule: own } : {}) });
	}
	// Class features you can use a few times between Safe Rests ("(1/Safe Rest)", "(WIL/Safe Rest)"): uses, kept like a resource.
	for (const f of features) {
		if (f.group !== 'Class' && f.group !== 'Subclass' && f.group !== 'Chosen') continue;
		const u = featureUses(f.text);
		if (!u || resources.some(r => nameKey(r.name) === nameKey(f.name))) continue;
		const max = Math.max(0, evalFormula(u.formula, vars) ?? 0);
		if (!max) continue;
		const v = resValue(f.name);
		resources.push({ name: f.name, current: Math.max(0, Math.min(max, v.current ?? max)), max, reset: 'Safe Rest', formula: u.formula, feature: f.name });
	}
	for (const [k, v] of Object.entries(fmRes)) {
		if (resources.some(r => nameKey(r.name) === nameKey(k))) continue;
		const cur = isObj(v) ? num(v.current) : num(v);
		const max = isObj(v) ? num(v.max) : undefined;
		resources.push({ name: k, current: Math.max(0, cur ?? 0), max, rolled: isObj(v) ? faces(v.rolled) : undefined });
	}

	return {
		name: text(fm.title) || text(fm.name) || fallbackName,
		player: text(fm.player),
		mine: fmTrue(fm.mine),
		ancestry: anc?.name ?? text(fm.ancestry),
		className: cls?.name ?? className,
		subclass: (cls && comp.subclass(cls.name, subclass)?.name) || subclass,
		level,
		background: bg?.name ?? text(fm.background),
		size: text(fm.size) || (anc?.size && !/ or /i.test(anc.size) ? anc.size : ''),
		height: text(fm.height),
		weight: text(fm.weight),
		portrait: text(fm.portrait),
		stats, key: vars.KEY, saves,
		hp, hpMax, tempHp: Math.max(0, num(fm.temp_hp) ?? 0),
		wounds, woundsMax, dying: hp <= 0 && wounds < woundsMax, dead: wounds >= woundsMax,
		hitDie, hitDice, hitDiceMax,
		armor, initiative, speed,
		caster, mana, manaMax, maxTier,
		skills,
		languages, languagesMax,
		gp: num(fm.gp) ?? 0, sp: num(fm.sp) ?? 0, cp: num(fm.cp) ?? 0,
		conditions: list(fm.conditions).map(text).filter(Boolean),
		actions: Math.max(0, Math.min(9, Math.floor(num(fm.actions) ?? ACTIONS_PER_TURN))),
		reactionsUsed: list(fm.reactions_used).map(text).filter(Boolean),
		quarry: text(fm.quarry),
		inventory, slots, attacks, spells, schools: schoolsKnown, features, resources,
		set, cls, anc, bg,
	};
}

// ----------------------------------------------------------------------------
// Changes. Each edits `fm` in place; `s` is the sheet read from the same note
// just before, for the derived values (max HP, max Wounds…).

/** Write a number, unless it's the default and the note never had the key. */
function put(fm: Frontmatter, key: string, value: number, dflt?: number): void {
	if (key in fm || value !== dflt) fm[key] = value;
}

/** Damage: temp HP first, then HP; at 0 HP the hero is Dying and takes Wounds (the tracker's rules). */
export function applyDamage(fm: Frontmatter, s: CharacterSheet, amount: number, crit = false): string[] {
	amount = Math.max(0, Math.floor(amount));
	if (!amount) return [];
	const events: string[] = [];
	let rest = amount;
	if (s.tempHp > 0) {
		const absorbed = Math.min(s.tempHp, rest);
		rest -= absorbed;
		put(fm, 'temp_hp', s.tempHp - absorbed, 0);
		events.push(`${absorbed} absorbed by temp HP`);
		if (!rest) return events;
	}
	const r = heroDamage(s.hp, s.wounds, s.woundsMax, rest, crit);
	put(fm, 'hp', r.hp, s.hpMax);
	put(fm, 'wounds', r.wounds, 0);
	return [...events, ...r.events];
}

export function heal(fm: Frontmatter, s: CharacterSheet, amount: number): void {
	put(fm, 'hp', Math.min(s.hpMax, s.hp + Math.max(0, Math.floor(amount))), s.hpMax);
}

export function setHp(fm: Frontmatter, s: CharacterSheet, value: number): void {
	put(fm, 'hp', Math.max(0, Math.min(s.hpMax, Math.floor(value))), s.hpMax);
}

/** Temp HP don't stack: the new amount replaces the old (the player picks which to keep). */
export function setTempHp(fm: Frontmatter, value: number): void {
	put(fm, 'temp_hp', Math.max(0, Math.floor(value)), 0);
}

export function setWounds(fm: Frontmatter, s: CharacterSheet, value: number): void {
	put(fm, 'wounds', Math.max(0, Math.min(s.woundsMax, Math.floor(value))), 0);
}

/** Spend mana; false (and nothing written) when there isn't enough. */
export function spendMana(fm: Frontmatter, s: CharacterSheet, amount: number): boolean {
	amount = Math.max(0, Math.floor(amount));
	if (amount > s.mana) return false;
	put(fm, 'mana', s.mana - amount, s.manaMax);
	return true;
}

export function regainMana(fm: Frontmatter, s: CharacterSheet, amount: number): void {
	put(fm, 'mana', Math.min(s.manaMax, s.mana + Math.max(0, Math.floor(amount))), s.manaMax);
}

export function setMana(fm: Frontmatter, s: CharacterSheet, value: number): void {
	put(fm, 'mana', Math.max(0, Math.min(s.manaMax, Math.floor(value))), s.manaMax);
}

/** Add `delta` to a class resource (Fury Dice), kept between 0 and its max. */
export function adjustResource(fm: Frontmatter, s: CharacterSheet, name: string, delta: number): void {
	const r = s.resources.find(x => nameKey(x.name) === nameKey(name));
	const current = Math.max(0, Math.min(r?.max ?? Infinity, (r?.current ?? 0) + delta));
	setResource(fm, name, current);
}

export function setResource(fm: Frontmatter, name: string, current: number): void {
	const res = isObj(fm.resources) ? fm.resources : (fm.resources = {});
	const key = Object.keys(res).find(k => nameKey(k) === nameKey(name)) ?? name;
	const prev = res[key];
	if (isObj(prev)) {
		prev.current = current;
		// Held faces follow the count: spent dice go from the end; none left, none kept.
		if (Array.isArray(prev.rolled)) {
			prev.rolled = prev.rolled.slice(0, current);
			if (!current) delete prev.rolled;
		}
	} else res[key] = current;
}

/** Set the dice a hero holds by their faces (rolled as they're gained): the count follows. */
export function setRolled(fm: Frontmatter, name: string, faces: number[]): void {
	const res = isObj(fm.resources) ? fm.resources : (fm.resources = {});
	const key = Object.keys(res).find(k => nameKey(k) === nameKey(name)) ?? name;
	const prev = res[key];
	const entry: Record<string, unknown> = isObj(prev) ? prev : {};
	entry.current = faces.length;
	if (faces.length) entry.rolled = faces.slice();
	else delete entry.rolled;
	res[key] = entry;
}

/**
 * Field Rest (Catch Breath): spend `dice` Hit Dice and heal `healed` (the roll
 * plus STR per die, worked out by whoever rolled). Make Camp passes the max.
 */
export function fieldRest(fm: Frontmatter, s: CharacterSheet, dice: number, healed: number): void {
	dice = Math.max(0, Math.min(s.hitDice, Math.floor(dice)));
	if (!dice) return;
	put(fm, 'hit_dice', s.hitDice - dice, s.hitDiceMax);
	heal(fm, s, Math.max(0, healed));
}

/** What a set of Hit Dice heals: each die plus STR, never below 0. */
export function hitDiceHealing(rolls: number[], str: number): number {
	return rolls.reduce((a, r) => a + Math.max(0, r + str), 0);
}

/** Safe Rest: all HP, Hit Dice, mana and class resources back, heal 1 Wound, temp HP gone. */
export function safeRest(fm: Frontmatter, s: CharacterSheet): void {
	put(fm, 'hp', s.hpMax, s.hpMax);
	put(fm, 'temp_hp', 0, 0);
	put(fm, 'hit_dice', s.hitDiceMax, s.hitDiceMax);
	// No known mana pool (say the class is a hidden draft): leave whatever mana the note has alone.
	if (s.manaMax > 0) put(fm, 'mana', s.manaMax, s.manaMax);
	put(fm, 'wounds', Math.max(0, s.wounds - 1), 0);
	for (const r of s.resources) {
		const rule = ruleOf(r);
		// Class dice (Judgment Dice, Fury Dice) don't outlast a fight, and resources that reset when
		// something ends (Rage) start empty; the rest refill.
		const empty = (/ends?\b/i.test(r.reset ?? '') && !/rest/i.test(r.reset ?? '')) || rule?.rolledWhen === 'gained' || !!rule?.clearsOnRest;
		if (r.max === undefined && !empty) continue;
		if (isObj(fm.resources) && Object.keys(fm.resources).some(k => nameKey(k) === nameKey(r.name))) setResource(fm, r.name, empty ? 0 : r.max ?? 0);
	}
}

/**
 * Level up: +1 level, max HP up by `hpGain` (a Hit Die rolled with advantage,
 * or the average), current HP up by the same. The Hit Dice max goes up by one
 * (it follows the level unless the note sets it); dice already spent stay
 * spent. Optionally +1 point in a skill.
 */
export function levelUp(fm: Frontmatter, s: CharacterSheet, hpGain: number, skill?: string): void {
	fm.level = s.level + 1;
	fm.hp_max = s.hpMax + Math.max(0, Math.floor(hpGain));
	if ('hp' in fm) fm.hp = s.hp + Math.max(0, Math.floor(hpGain));
	if ('hit_dice_max' in fm) fm.hit_dice_max = s.hitDiceMax + 1;
	if (skill) setSkill(fm, skill, (s.skills.find(k => k.key === skill.toLowerCase())?.points ?? 0) + 1);
}

// Inventory --------------------------------------------------------------------

function inventoryList(fm: Frontmatter): unknown[] {
	if (!Array.isArray(fm.inventory)) fm.inventory = list(fm.inventory);
	return fm.inventory as unknown[];
}

/** The entry at `index` if it still has that name, else the first with the name (the note may have changed). */
function findEntry(fm: Frontmatter, ref: { index: number; name: string }): number {
	const inv = inventoryList(fm);
	const at = readInventoryEntry(inv[ref.index], ref.index);
	if (at && nameKey(at.name) === nameKey(ref.name)) return ref.index;
	return inv.findIndex((v, i) => nameKey(readInventoryEntry(v, i)?.name ?? '') === nameKey(ref.name));
}

const ENTRY_KEYS = ['name', 'qty', 'equipped', 'slots', 'note'];

/**
 * A line as tidy as it can be: a plain name when it's just the name. `orig` is
 * the line it replaces; any keys the player added to it (charges, cost…) are kept.
 */
function writeEntry(e: { name: string; qty: number; equipped: boolean; slots?: number; note?: string }, orig?: unknown): unknown {
	const extra = isObj(orig) ? Object.fromEntries(Object.entries(orig).filter(([k]) => !ENTRY_KEYS.includes(k))) : {};
	const hasExtra = Object.keys(extra).length > 0;
	if (!hasExtra && e.qty === 1 && !e.equipped && e.slots === undefined && !e.note) return e.name;
	const out: Record<string, unknown> = { name: e.name };
	if (e.qty !== 1) out.qty = e.qty;
	if (e.equipped) out.equipped = true;
	if (e.slots !== undefined) out.slots = e.slots;
	if (e.note) out.note = e.note;
	return hasExtra ? { ...out, ...extra } : out;
}

/** Add an item; one already carried gets its quantity raised instead. Armor and shields go on equipped when nothing else is worn. */
export function addItem(fm: Frontmatter, name: string, qty = 1, opts: { equip?: boolean } = {}): void {
	const inv = inventoryList(fm);
	const i = inv.findIndex((v, n) => nameKey(readInventoryEntry(v, n)?.name ?? '') === nameKey(name));
	if (i >= 0) {
		const e = readInventoryEntry(inv[i], i)!;
		inv[i] = writeEntry({ ...e, qty: e.qty + qty }, inv[i]);
		return;
	}
	inv.push(writeEntry({ name, qty, equipped: !!opts.equip }));
}

export function removeItem(fm: Frontmatter, ref: { index: number; name: string }): void {
	const i = findEntry(fm, ref);
	if (i >= 0) inventoryList(fm).splice(i, 1);
	if (!inventoryList(fm).length) delete fm.inventory;
}

/** Set a quantity; 0 removes the line. */
export function setQty(fm: Frontmatter, ref: { index: number; name: string }, qty: number): void {
	const i = findEntry(fm, ref);
	if (i < 0) return;
	qty = Math.max(0, Math.floor(qty));
	if (!qty) { removeItem(fm, ref); return; }
	const inv = inventoryList(fm);
	inv[i] = writeEntry({ ...readInventoryEntry(inv[i], i)!, qty }, inv[i]);
}

export function setEquipped(fm: Frontmatter, ref: { index: number; name: string }, equipped: boolean): void {
	const i = findEntry(fm, ref);
	if (i < 0) return;
	const inv = inventoryList(fm);
	inv[i] = writeEntry({ ...readInventoryEntry(inv[i], i)!, equipped }, inv[i]);
}

// Spells and features ------------------------------------------------------------

function nameList(fm: Frontmatter, key: string): unknown[] {
	if (!Array.isArray(fm[key])) fm[key] = list(fm[key]);
	return fm[key] as unknown[];
}

const entryName = (v: unknown): string => (isObj(v) ? text(v.name) : text(v));

export function addSpell(fm: Frontmatter, name: string): void {
	const l = nameList(fm, 'spells');
	if (!l.some(v => nameKey(entryName(v)) === nameKey(name))) l.push(name);
}

/** Spell schools the hero learns as they level (`schools: [Fire]`), on top of the class's. */
export function addSchools(fm: Frontmatter, names: string[]): void {
	if (!names.length) return;
	const l = nameList(fm, 'schools');
	for (const n of names) if (!l.some(v => nameKey(text(v)) === nameKey(n))) l.push(n);
}

export function removeSpell(fm: Frontmatter, name: string): void {
	const l = nameList(fm, 'spells').filter(v => nameKey(entryName(v)) !== nameKey(name));
	if (l.length) fm.spells = l; else delete fm.spells;
}

/** Add a chosen option by name, or a custom ability with its own text. */
export function addFeature(fm: Frontmatter, f: string | { name: string; text?: string }): void {
	const l = nameList(fm, 'features');
	const name = typeof f === 'string' ? f : f.name;
	if (l.some(v => nameKey(entryName(v)) === nameKey(name))) return;
	l.push(typeof f === 'string' || !f.text ? name : { name: f.name, text: f.text });
}

export function removeFeature(fm: Frontmatter, ref: { index?: number; name: string }): void {
	const l = nameList(fm, 'features');
	const i = ref.index !== undefined && nameKey(entryName(l[ref.index])) === nameKey(ref.name) ? ref.index : l.findIndex(v => nameKey(entryName(v)) === nameKey(ref.name));
	if (i >= 0) l.splice(i, 1);
	if (!l.length) delete fm.features;
}

// Details, stats, skills, conditions, coins -----------------------------------------

/** Text details (name, player, ancestry, class…). Empty removes the key. */
export function setField(fm: Frontmatter, key: string, value: string | number | boolean | null | undefined): void {
	if (value === '' || value === null || value === undefined) { delete fm[key]; return; }
	const n = typeof value === 'string' && /^[+-]?\d+$/.test(value.trim()) && NUMERIC_FIELDS.has(key) ? Number(value) : value;
	fm[key] = n;
}

/** Fields written as numbers when typed as digits. */
export const NUMERIC_FIELDS = new Set(['level', 'speed', 'hp', 'hp_max', 'temp_hp', 'wounds', 'wounds_max', 'hit_die', 'hit_dice', 'hit_dice_max', 'armor', 'initiative', 'mana', 'mana_max', 'gp', 'sp', 'cp', 'str', 'dex', 'int', 'wil']);

/** An override ("armor", "initiative", "hp_max"…): a number sets it, undefined goes back to the computed value. */
export function setOverride(fm: Frontmatter, key: string, value: number | undefined): void {
	if (value === undefined || !Number.isFinite(value)) delete fm[key];
	else fm[key] = Math.floor(value);
}

export function setStat(fm: Frontmatter, stat: StatKey, value: number): void {
	fm[stat.toLowerCase()] = Math.max(-5, Math.min(10, Math.floor(value)));
}

export function setSkill(fm: Frontmatter, skill: string, points: number): void {
	const k = skill.toLowerCase();
	const skills = isObj(fm.skills) ? fm.skills : {};
	const existing = Object.keys(skills).find(x => x.toLowerCase() === k) ?? k;
	points = Math.floor(points);
	if (points) skills[existing] = points; else delete skills[existing];
	if (Object.keys(skills).length) fm.skills = skills; else delete fm.skills;
}

/** ▲/▼ save override. `undefined` goes back to the class's. */
export function setSave(fm: Frontmatter, which: 'adv' | 'dis', stat: StatKey | 'none' | undefined): void {
	const key = which === 'adv' ? 'save_adv' : 'save_dis';
	if (stat === undefined) delete fm[key]; else fm[key] = stat;
}

export function addCondition(fm: Frontmatter, name: string): void {
	const l = nameList(fm, 'conditions');
	if (!l.some(v => text(v).toLowerCase() === name.toLowerCase())) l.push(name);
}

// ----------------------------------------------------------------------------
// Actions: a hero has 3 a turn; reactions (Defend, Interpose…) spend them between turns.

export const ACTIONS_PER_TURN = 3;

/** Set the actions left (0–9). 3, the usual, isn't written. */
export function setActions(fm: Frontmatter, n: number): void {
	put(fm, 'actions', Math.max(0, Math.min(9, Math.floor(n))), ACTIONS_PER_TURN);
}

/** Spend `n` actions (never below 0). Returns how many were actually spent. */
export function spendActions(fm: Frontmatter, s: Pick<CharacterSheet, 'actions'>, n: number): number {
	const spent = Math.max(0, Math.min(s.actions, Math.floor(n)));
	setActions(fm, s.actions - spent);
	return spent;
}

/** A heroic reaction: 1 action, once a round. False when it's used already or there's no action left. */
export function useReaction(fm: Frontmatter, s: Pick<CharacterSheet, 'actions' | 'reactionsUsed'>, name: string): boolean {
	if (s.actions < 1 || s.reactionsUsed.some(r => r.toLowerCase() === name.toLowerCase())) return false;
	setActions(fm, s.actions - 1);
	fm.reactions_used = [...s.reactionsUsed, name];
	return true;
}

/** End of turn: back to 3 actions for the next one, and reactions are available again. */
export function endTurn(fm: Frontmatter): void {
	setActions(fm, ACTIONS_PER_TURN);
	delete fm.reactions_used;
}

/** Mark the Hunter's Quarry (empty clears it). */
export function setQuarry(fm: Frontmatter, name: string): void {
	const v = name.trim();
	if (v) fm.quarry = v;
	else delete fm.quarry;
}

export function removeCondition(fm: Frontmatter, name: string): void {
	const l = nameList(fm, 'conditions').filter(v => text(v).toLowerCase() !== name.toLowerCase());
	if (l.length) fm.conditions = l; else delete fm.conditions;
}

export function setCoins(fm: Frontmatter, coin: 'gp' | 'sp' | 'cp', value: number): void {
	put(fm, coin, Math.max(0, Math.floor(value)), 0);
}

export function addLanguage(fm: Frontmatter, s: CharacterSheet, name: string): void {
	const l = 'languages' in fm ? nameList(fm, 'languages') : (fm.languages = [...s.languages]) as unknown[];
	if (!l.some(v => text(v).toLowerCase() === name.toLowerCase())) l.push(name);
}

export function removeLanguage(fm: Frontmatter, s: CharacterSheet, name: string): void {
	const l = ('languages' in fm ? nameList(fm, 'languages') : [...s.languages]).filter(v => text(v).toLowerCase() !== name.toLowerCase());
	fm.languages = l;
}

// ----------------------------------------------------------------------------
// New characters

export interface NewCharacterOptions {
	name: string;
	player?: string;
	ancestry?: string;
	className?: string;
	background?: string;
	/** "Standard" [2, 2, 0, -1], "Balanced" [2, 1, 1, 0] or "Min-Max" [3, 1, -1, -1]. */
	array?: string;
	/** Where the array's numbers go, as the player placed them. Missing (or not the array's numbers): the class's suggestion. */
	stats?: Partial<Record<StatKey, number>>;
	/** Small or Medium, for an ancestry that can be either. */
	size?: string;
	/** 25 gp a level instead of the class's starting gear (Core Rules 3.3, Equipment & Money). */
	gold?: boolean;
	mine?: boolean;
	/** Start above level 1 (a campaign that starts at level 5); new-character.ts levels the hero up to it. */
	level?: number;
}

export const STAT_ARRAYS: { name: string; values: number[] }[] = [
	{ name: 'Standard', values: [2, 2, 0, -1] },
	{ name: 'Balanced', values: [2, 1, 1, 0] },
	{ name: 'Min-Max', values: [3, 1, -1, -1] },
];

/** The stat arrays (Core Rules 3.3, Basic Details & Stats), as the compendium prints them. */
export function statArrays(comp?: Compendium): { name: string; values: number[] }[] {
	return comp?.rules.statArrays?.length ? comp.rules.statArrays : STAT_ARRAYS;
}

/** An array by name ("min-max" finds Min-Max); the first when there's no such array. */
export function statArray(comp: Compendium | undefined, name: string | undefined): { name: string; values: number[] } {
	const arrays = statArrays(comp);
	return arrays.find(a => nameKey(a.name) === nameKey(name ?? 'Standard')) ?? arrays[0] ?? STAT_ARRAYS[0];
}

/** A class's key stats, in the book's order ("DEX and INT"). */
export function keyStatsOf(cls?: ClassEntry): StatKey[] {
	return [...new Set((cls?.keyStats ?? []).map(k => statKey(k)).filter((k): k is StatKey => !!k))];
}

/**
 * The class's suggested placement of a stat array: the highest values to its key
 * stats (in order), the lowest to its ▼ save stat, the rest in STR, DEX, INT, WIL order.
 */
export function assignStats(values: number[], cls?: ClassEntry): Record<StatKey, number> {
	const sorted = [...values].sort((a, b) => b - a);
	while (sorted.length < 4) sorted.push(0);
	const out = {} as Record<StatKey, number>;
	const order: StatKey[] = keyStatsOf(cls);
	const dis = statKey(cls?.saves?.dis);
	const rest = STATS.filter(s => !order.includes(s) && s !== dis);
	order.push(...rest);
	if (dis && !order.includes(dis)) order.push(dis);
	for (const s of STATS) if (!order.includes(s)) order.push(s);
	order.forEach((s, i) => { out[s] = sorted[i]; });
	return out;
}

/** True when `stats` uses exactly the array's numbers (in any order). */
export function isPlacementOf(stats: Partial<Record<StatKey, number>> | undefined, values: number[]): stats is Record<StatKey, number> {
	if (!stats || STATS.some(k => typeof stats[k] !== 'number' || !Number.isFinite(stats[k]))) return false;
	const a = STATS.map(k => stats[k] as number).sort((x, y) => x - y);
	const b = [...values].sort((x, y) => x - y);
	while (b.length < 4) b.unshift(0);
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Core Rules 3.3: "place the highest numbers in the KEY stats for your class". The
 * stats that break it: each key stat holding less than some other stat does.
 */
export function keyStatsShort(stats: Record<StatKey, number>, cls?: ClassEntry): StatKey[] {
	const keys = keyStatsOf(cls);
	const others = STATS.filter(s => !keys.includes(s));
	const best = others.length ? Math.max(...others.map(s => stats[s])) : -Infinity;
	return keys.filter(k => stats[k] < best);
}

/** Two stats trade their numbers. */
export function swapStats(stats: Record<StatKey, number>, a: StatKey, b: StatKey): Record<StatKey, number> {
	return { ...stats, [a]: stats[b], [b]: stats[a] };
}

/** Where the numbers go for a new hero: the player's placement when it's the array's numbers, else the class's suggestion. */
export function placedStats(o: Pick<NewCharacterOptions, 'array' | 'stats' | 'className'>, comp: Compendium): Record<StatKey, number> {
	const values = statArray(comp, o.array).values;
	return isPlacementOf(o.stats, values) ? { ...o.stats } : assignStats(values, comp.classByName(o.className));
}

/** Starting gold: 25 gp, times the starting level (Core Rules 3.3, Equipment & Money). */
export const startingGold = (level = 1): number => 25 * Math.max(1, Math.floor(level));

/**
 * A new hero at level 1: stats as placed, HP from the class, its starting gear (or
 * the gold instead). new-character.ts takes it on to a higher starting level.
 */
export function levelOneFrontmatter(o: NewCharacterOptions, comp: Compendium): Frontmatter {
	const cls = comp.classByName(o.className);
	const anc = comp.ancestry(o.ancestry);
	const bg = comp.background(o.background);
	const stats = placedStats(o, comp);
	const fm: Frontmatter = { nimble: 'character' };
	if (o.name.trim()) fm.title = o.name.trim();
	if (o.player) fm.player = o.player;
	if (o.mine ?? true) fm.mine = true;
	if (anc || o.ancestry) fm.ancestry = anc?.name ?? o.ancestry;
	if (cls || o.className) fm.class = cls?.name ?? o.className;
	fm.level = 1;
	if (bg || o.background) fm.background = bg?.name ?? o.background;
	const sizes = sizesOf(anc?.size);
	const size = sizes.find(x => nameKey(x) === nameKey(o.size ?? '')) ?? (sizes.length === 1 ? sizes[0] : undefined);
	if (size) fm.size = size;
	for (const s of STATS) fm[s.toLowerCase()] = stats[s];
	const hp = cls?.startingHp ?? 10;
	fm.hp = hp;
	fm.hp_max = hp;
	const gear = (cls?.startingGear ?? []).filter(g => typeof g === 'string' && g.trim());
	if (o.gold) fm.gp = startingGold(o.level);
	else if (gear.length) {
		const inv: unknown[] = [];
		for (const g of gear) {
			const e = readInventoryEntry(g, 0)!;
			const item = comp.item(e.name);
			inv.push(writeEntry({ ...e, equipped: isArmorItem(item) }));
		}
		fm.inventory = inv;
	}
	fm.cssclasses = ['nimble-sheet-note'];
	return fm;
}

/** "Small or Medium" → Small, Medium. */
export function sizesOf(size: string | undefined): string[] {
	return String(size ?? '').split(/\s*(?:,|\bor\b|\/)\s*/i).map(x => x.trim()).filter(Boolean);
}

/** Feature options to pick from (Savage Arsenal…), for the sheet's Add button and the level-up wizard. */
export function classOptions(comp: Compendium, s: CharacterSheet): { group: string; option: ClassOption; taken: boolean }[] {
	const taken = new Set(s.features.filter(f => f.group === 'Chosen').map(f => nameKey(f.name)));
	return comp.optionGroups(s.className, s.subclass).flatMap(g => (g.options ?? []).map(option => ({ group: g.name, option, taken: taken.has(nameKey(option.name)) })));
}
