// A D&D Beyond character (the JSON its character service gives for a public
// character) as a 5e character note's frontmatter, in the format character.ts
// reads. Pure: no Obsidian imports, and no network: the user brings the JSON.
//
// Only names and numbers are copied. D&D Beyond's JSON also carries the books'
// text (class features, spell and item descriptions); that text is copyrighted
// and never goes into the note. Names that match the SRD or a content pack
// resolve on the sheet by themselves.
//
// Where things are in the JSON (the payload is usually under `data`):
//   name, classes[].definition.name / .level / .subclassDefinition.name / .isStartingClass
//   race.fullName (2014 "Hill Dwarf"), race.baseRaceName, race.isLegacy, race.sources[].sourceId
//   background.definition.name, background.customBackground.name
//   stats / bonusStats / overrideStats: [{ id: 1–6, value }] (Str … Cha)
//   modifiers.{race,class,background,item,feat,condition}[]: { type, subType, value, componentId }
//     type "bonus", subType "strength-score": a racial, feat or ASI bonus
//     type "set", subType "strength-score": a score set by an item (Belt of Giant Strength)
//     type "proficiency" / "expertise", subType "stealth": skills
//     type "bonus", subType "hit-points-per-level": Tough, Dwarven Toughness
//   baseHitPoints, bonusHitPoints, overrideHitPoints, removedHitPoints, temporaryHitPoints
//   classSpells[].spells[].definition.name, spells.{race,class,feat,background}[].definition.name
//   inventory[]: { definition: { id, name, canAttune }, quantity, equipped, isAttuned }
//   customItems[]: { name, quantity }
//   currencies: { cp, sp, ep, gp, pp }
//   feats[].definition.name
// Source ids 145 and up are the 2024 books (145 PHB 2024, 148 the 2024 free rules).

import { SKILLS, type Frontmatter } from './character';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, type AbilityKey } from './types';
import { abilityMod } from './rules';

export interface DdbImport {
	frontmatter: Frontmatter;
	/** The character's name, for the note's file name. */
	name: string;
	edition: Dnd5eEdition;
	/** Plain-language warnings about what didn't carry over. */
	notes: string[];
}

export interface DdbImportOptions {
	/** Read the character with these rules, whatever its books say. */
	edition?: Dnd5eEdition;
	/** Mark the note as the player's own character (`mine: true`). */
	mine?: boolean;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);
const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const num = (v: unknown): number | undefined => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
};
/** D&D Beyond marks 2014 printings "(Legacy)" in some places; the SRD names don't. */
const clean = (s: string) => s.replace(/\s*[([]legacy[)\]]\s*$/i, '').trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const STAT_NAME: Record<number, string> = { 1: 'strength', 2: 'dexterity', 3: 'constitution', 4: 'intelligence', 5: 'wisdom', 6: 'charisma' };
const ABILITY_BY_ID: Record<number, AbilityKey> = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };

// ----------------------------------------------------------------------------
// The link or id the user has → the URL of the JSON.

/**
 * The character service URL for a character's link or id, or null:
 * `https://www.dndbeyond.com/characters/123456789`, `…/characters/123456789/AbCd`,
 * `https://dndbeyond.com/profile/someone/characters/123456789`, `ddb.ac/characters/123456789/x`,
 * the service URL itself, or `123456789`.
 */
export function ddbJsonUrl(linkOrId: string): string | null {
	const s = (linkOrId ?? '').trim();
	const service = (id: string) => `https://character-service.dndbeyond.com/character/v5/character/${id}`;
	if (/^\d+$/.test(s)) return service(s);
	const m = /^(?:https?:\/\/)?([a-z0-9.-]+)(\/[^?#\s]*)?/i.exec(s);
	if (!m) return null;
	const host = m[1].toLowerCase();
	if (!/(^|\.)dndbeyond\.com$|(^|\.)ddb\.ac$/.test(host)) return null;
	const id = /\/characters?\/(\d+)(?:\/|$)/.exec(m[2] ?? '');
	return id ? service(id[1]) : null;
}

// ----------------------------------------------------------------------------
// Reading the JSON.

/** The character object from the pasted text or parsed JSON. Throws a plain Error when it isn't one. */
export function ddbCharacterOf(input: unknown): Obj {
	let raw = input;
	if (typeof raw === 'string') {
		const text = raw.trim();
		if (!text) throw new Error('There is nothing to import. Paste the character’s JSON, or choose its file.');
		try { raw = JSON.parse(text) as unknown; } catch {
			throw new Error('That isn’t JSON. Open the character’s JSON link, copy all of the page, and paste it here.');
		}
	}
	if (!isObj(raw)) throw new Error('That isn’t a D&D Beyond character.');
	// The service wraps the character: { id, success, message, data }.
	if (raw.success === false) {
		throw new Error('D&D Beyond didn’t share that character. Set its privacy to Public on D&D Beyond, then get the JSON again.');
	}
	const c = isObj(raw.data) ? raw.data : isObj(raw.character) ? raw.character : raw;
	const looksLikeOne = (Array.isArray(c.stats) || Array.isArray(c.classes)) && ('race' in c || 'classes' in c || 'baseHitPoints' in c);
	if (!looksLikeOne) throw new Error('That isn’t a D&D Beyond character. Use the JSON from the character service link, not the character page.');
	return c;
}

/** Every modifier, from race, class, background, feats, items and conditions. Item modifiers only count for items in use. */
function modifiersOf(c: Obj): Obj[] {
	const groups = isObj(c.modifiers) ? c.modifiers : {};
	const active = new Set<number>();
	for (const it of objs(c.inventory)) {
		const def = isObj(it.definition) ? it.definition : {};
		const id = num(def.id);
		if (id === undefined || it.equipped !== true) continue;
		if (def.canAttune === true && it.isAttuned !== true) continue;
		active.add(id);
	}
	const out: Obj[] = [];
	for (const [group, list] of Object.entries(groups)) {
		for (const m of objs(list)) {
			if (group === 'item' && !active.has(num(m.componentId) ?? NaN)) continue;
			out.push(m);
		}
	}
	return out;
}

const modsOf = (mods: Obj[], type: string, subType: string) =>
	mods.filter(m => str(m.type).toLowerCase() === type && str(m.subType).toLowerCase() === subType);

/** A stat list ([{ id, value }]) as id → value; null values are left out. */
function statMap(v: unknown): Map<number, number> {
	const out = new Map<number, number>();
	for (const s of objs(v)) {
		const id = num(s.id);
		const value = num(s.value);
		if (id !== undefined && value !== undefined && s.value !== null) out.set(id, value);
	}
	return out;
}

interface DdbClass { name: string; level: number; subclass: string; starting: boolean; sources: number[]; hitDiceUsed: number }

function classesOf(c: Obj): DdbClass[] {
	const out = objs(c.classes).map((x): DdbClass | null => {
		const def = isObj(x.definition) ? x.definition : {};
		const name = clean(str(def.name));
		if (!name) return null;
		const sub = isObj(x.subclassDefinition) ? clean(str(x.subclassDefinition.name)) : '';
		return {
			name,
			level: Math.max(1, Math.min(20, Math.floor(num(x.level) ?? 1))),
			subclass: sub,
			starting: x.isStartingClass === true,
			sources: sourceIds(def),
			hitDiceUsed: Math.max(0, Math.floor(num(x.hitDiceUsed) ?? 0)),
		};
	}).filter((x): x is DdbClass => !!x);
	// The class the character started with first: it gave the saves and proficiencies.
	return out.sort((a, b) => Number(b.starting) - Number(a.starting));
}

function sourceIds(def: unknown): number[] {
	return isObj(def) ? objs(def.sources).map(s => num(s.sourceId)).filter((n): n is number => n !== undefined) : [];
}

/** 2014 or 2024, from the books the race, classes and background come from. Undefined when nothing says. */
function editionOf(c: Obj, classes: DdbClass[]): Dnd5eEdition | undefined {
	const vote = (ids: number[]): Dnd5eEdition | undefined => (!ids.length ? undefined : ids.some(id => id >= 145) ? '2024' : '2014');
	const race = isObj(c.race) ? c.race : undefined;
	if (race?.isLegacy === true) return '2014';
	const bg = isObj(c.background) ? c.background.definition : undefined;
	return vote(sourceIds(race)) ?? vote(classes.flatMap(x => x.sources)) ?? vote(sourceIds(bg));
}

function speciesOf(c: Obj): string {
	const race = isObj(c.race) ? c.race : {};
	return clean(str(race.fullName) || str(race.baseName) || str(race.baseRaceName) || str(race.name));
}

function backgroundOf(c: Obj): string {
	const bg = isObj(c.background) ? c.background : {};
	const custom = isObj(bg.customBackground) ? str(bg.customBackground.name) : '';
	const def = isObj(bg.definition) ? str(bg.definition.name) : '';
	return clean(bg.hasCustomBackground === true && custom ? custom : def || custom);
}

/** Final scores: an override wins; else the base (or a higher set-base) plus every bonus; then items that set a score. */
function scoresOf(c: Obj, mods: Obj[]): Record<AbilityKey, number> {
	const base = statMap(c.stats);
	const bonus = statMap(c.bonusStats);
	const override = statMap(c.overrideStats);
	const out = {} as Record<AbilityKey, number>;
	for (let id = 1; id <= 6; id++) {
		const a = ABILITY_BY_ID[id];
		const sub = `${STAT_NAME[id]}-score`;
		const ov = override.get(id);
		if (ov !== undefined && ov > 0) { out[a] = ov; continue; }
		const setBase = Math.max(0, ...modsOf(mods, 'set-base', sub).map(m => num(m.value) ?? 0));
		let score = (setBase || base.get(id) || 10) + (bonus.get(id) ?? 0);
		for (const m of modsOf(mods, 'bonus', sub)) score += num(m.value) ?? 0;
		const set = Math.max(0, ...modsOf(mods, 'set', sub).map(m => num(m.value) ?? 0));
		out[a] = Math.max(1, Math.min(30, Math.max(score, set)));
	}
	return out;
}

/** Skill names (as the sheet spells them) from proficiency or expertise modifiers. */
function skillsOf(mods: Obj[], type: 'proficiency' | 'expertise'): string[] {
	const names: string[] = [];
	for (const m of mods) {
		if (str(m.type).toLowerCase() !== type) continue;
		const sub = key(str(m.subType) || str(m.friendlySubtypeName));
		const skill = SKILLS.find(s => key(s.name) === sub);
		if (skill && !names.includes(skill.name)) names.push(skill.name);
	}
	return SKILLS.map(s => s.name).filter(n => names.includes(n));
}

function spellsOf(c: Obj): string[] {
	const seen = new Map<string, string>();
	const add = (entries: unknown) => {
		for (const s of objs(entries)) {
			const name = isObj(s.definition) ? str(s.definition.name) : str(s.name);
			if (name && !seen.has(key(name))) seen.set(key(name), name);
		}
	};
	for (const block of objs(c.classSpells)) add(block.spells);
	// Spells from race, class features, feats and background; items' spells belong to the item.
	if (isObj(c.spells)) for (const [origin, list] of Object.entries(c.spells)) if (origin !== 'item') add(list);
	return [...seen.values()];
}

type InventoryEntry = { name: string; qty?: number; equipped?: true };

function inventoryOf(c: Obj): InventoryEntry[] {
	const out: InventoryEntry[] = [];
	const push = (name: string, qty: number, equipped: boolean) => {
		if (!name) return;
		const have = out.find(i => key(i.name) === key(name) && !!i.equipped === equipped);
		if (have) { have.qty = (have.qty ?? 1) + qty; return; }
		out.push({ name, ...(qty !== 1 ? { qty } : {}), ...(equipped ? { equipped: true as const } : {}) });
	};
	for (const it of objs(c.inventory)) {
		const def = isObj(it.definition) ? it.definition : {};
		const qty = Math.max(1, Math.floor(num(it.quantity) ?? 1));
		push(str(def.name) || str(it.name), qty, it.equipped === true);
	}
	for (const it of objs(c.customItems)) push(str(it.name), Math.max(1, Math.floor(num(it.quantity) ?? 1)), false);
	for (const i of out) if (i.qty === 1) delete i.qty;
	return out;
}

/** Every coin in gold pieces, to the copper. */
function goldOf(c: Obj): number {
	const cur = isObj(c.currencies) ? c.currencies : {};
	const n = (k: string) => Math.max(0, num(cur[k]) ?? 0);
	const cp = n('pp') * 1000 + n('gp') * 100 + n('ep') * 50 + n('sp') * 10 + n('cp');
	return Math.round(cp) / 100;
}

function featsOf(c: Obj): string[] {
	const names: string[] = [];
	for (const f of objs(c.feats)) {
		const name = clean(isObj(f.definition) ? str(f.definition.name) : str(f.name));
		if (name && !names.some(n => key(n) === key(name))) names.push(name);
	}
	return names;
}

/**
 * A D&D Beyond character (pasted JSON text or the parsed object) as a 5e
 * character note's frontmatter. Forgiving: anything missing gets a default.
 * Throws a plain Error only when the input isn't a D&D Beyond character.
 */
export function importDdbCharacter(input: unknown, opts: DdbImportOptions = {}): DdbImport {
	const c = ddbCharacterOf(input);
	const notes: string[] = [];
	const name = str(c.name) || 'Imported character';
	const classes = classesOf(c);
	const level = Math.max(1, Math.min(20, classes.reduce((t, x) => t + x.level, 0) || 1));
	const first = classes[0];

	const found = editionOf(c, classes);
	const edition: Dnd5eEdition = opts.edition ?? found ?? '2024';
	if (!opts.edition && !found) notes.push('Couldn’t tell which rules this character uses, so it uses the 2024 rules. Change `edition` on the note if it’s a 2014 character.');

	const mods = modifiersOf(c);
	const scores = scoresOf(c, mods);

	// Hit points: D&D Beyond's override, else base + Con per level + bonuses.
	const override = num(c.overrideHitPoints) ?? 0;
	const perLevel = modsOf(mods, 'bonus', 'hit-points-per-level').reduce((t, m) => t + (num(m.value) ?? 0), 0);
	const flat = modsOf(mods, 'bonus', 'hit-points').reduce((t, m) => t + (num(m.value) ?? 0), 0);
	const computed = (num(c.baseHitPoints) ?? 0) + abilityMod(scores.con) * level + perLevel * level + flat + (num(c.bonusHitPoints) ?? 0);
	const hpMax = Math.max(1, Math.floor(override > 0 ? override : computed));
	const hp = Math.max(0, Math.min(hpMax, hpMax - Math.max(0, num(c.removedHitPoints) ?? 0)));
	const temp = Math.max(0, Math.floor(num(c.temporaryHitPoints) ?? 0));
	if (override <= 0 && !(num(c.baseHitPoints) ?? 0)) notes.push('D&D Beyond didn’t give base hit points; check `hp_max` on the note.');

	const fm: Frontmatter = { nimble: 'character', system: '5e', edition, cssclasses: ['nimble-sheet-note'] };
	if (opts.mine) fm.mine = true;
	if (first) fm.class = first.name;
	else notes.push('No class found. Fill in `class` on the note.');
	if (first?.subclass) fm.subclass = first.subclass;
	fm.level = level;
	if (classes.length > 1) {
		fm.classes = classes.map(x => ({ name: x.name, level: x.level, ...(x.subclass ? { subclass: x.subclass } : {}) }));
		const others = classes.slice(1).map(x => `${x.name} ${x.level}`).join(', ');
		notes.push(`Multiclass: the sheet shows ${first.name} at level ${level}; ${others} ${classes.length > 2 ? 'are' : 'is'} listed under classes. Its spell slots and features follow ${first.name} only.`);
	}
	const species = speciesOf(c);
	if (species) fm[edition === '2014' ? 'race' : 'species'] = species;
	const background = backgroundOf(c);
	if (background) fm.background = background;
	for (const a of ABILITIES) fm[a] = scores[a];

	const skills = skillsOf(mods, 'proficiency');
	const expertise = skillsOf(mods, 'expertise');
	// Expertise means proficiency too.
	fm.skills = SKILLS.map(s => s.name).filter(n => skills.includes(n) || expertise.includes(n));
	if (expertise.length) fm.expertise = expertise;

	fm.hp = hp;
	fm.hp_max = hpMax;
	if (temp) fm.temp_hp = temp;
	const hitDiceUsed = Math.min(level, classes.reduce((t, x) => t + x.hitDiceUsed, 0));
	if (hitDiceUsed) fm.hit_dice_used = hitDiceUsed;
	if (c.inspiration === true) fm.inspiration = true;

	// Spent spell slots, per level.
	const used: number[] = [];
	for (const s of objs(c.spellSlots)) {
		const lv = Math.floor(num(s.level) ?? 0);
		const u = Math.max(0, Math.floor(num(s.used) ?? 0));
		if (lv >= 1 && lv <= 9 && u) used[lv - 1] = u;
	}
	if (used.length) fm.slots_used = Array.from(used, v => v ?? 0);

	fm.spells = spellsOf(c);
	fm.inventory = inventoryOf(c);
	fm.gold = goldOf(c);

	const feats = featsOf(c);
	if (feats.length) {
		// The sheet finds each feat's text in the compendium (the SRD's, or a content pack's).
		fm.feats = feats;
	}

	return { frontmatter: fm, name, edition, notes };
}
