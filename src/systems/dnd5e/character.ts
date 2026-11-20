// A 5e character note: its frontmatter is the data, plain enough to edit by
// hand. readSheet5e() works out everything the sheet shows (modifiers, saves,
// skills, AC, attacks, spell slots, features) from it and the compendium; the
// edit functions change a frontmatter object in place (for processFrontMatter).
// Pure: no Obsidian imports.
//
//   nimble: character
//   class: Wizard
//   subclass: Evoker
//   level: 3
//   species: Elf            (2014 notes may say race:)
//   background: Sage
//   str: 8 … cha: 10
//   skills: [Arcana, History]
//   expertise: []
//   hp: 17
//   hp_max: 17
//   temp_hp: 0
//   hit_dice_used: 0
//   slots_used: [1, 0]       (per spell level)
//   spells: [Fire Bolt, Magic Missile]
//   feats: [Alert]          (taken at level up; the background's comes on its own)
//   inventory: [{ name: Quarterstaff, equipped: true }, { name: Potion of Healing, qty: 2 }]
//   gold: 10
//   conditions: [Poisoned]  (the rules' conditions on you now)
//   exhaustion: 1           (levels of Exhaustion, 1–6)
//   uses_spent: { Rage: 1 } (limited-use features' spent uses; a rest brings them back)

import { abilityMod } from './rules';
import { Class5e, ClassFeature5e, compendium5e, Equipment5e, Item5e, Spell5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, AbilityKey, Feature5e } from './types';

export type Frontmatter = Record<string, unknown>;

export const SKILLS: readonly { name: string; ability: AbilityKey }[] = [
	{ name: 'Acrobatics', ability: 'dex' }, { name: 'Animal Handling', ability: 'wis' }, { name: 'Arcana', ability: 'int' },
	{ name: 'Athletics', ability: 'str' }, { name: 'Deception', ability: 'cha' }, { name: 'History', ability: 'int' },
	{ name: 'Insight', ability: 'wis' }, { name: 'Intimidation', ability: 'cha' }, { name: 'Investigation', ability: 'int' },
	{ name: 'Medicine', ability: 'wis' }, { name: 'Nature', ability: 'int' }, { name: 'Perception', ability: 'wis' },
	{ name: 'Performance', ability: 'cha' }, { name: 'Persuasion', ability: 'cha' }, { name: 'Religion', ability: 'int' },
	{ name: 'Sleight of Hand', ability: 'dex' }, { name: 'Stealth', ability: 'dex' }, { name: 'Survival', ability: 'wis' },
];

/** The standard array, highest first. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export interface SheetSkill { name: string; ability: AbilityKey; proficient: boolean; expertise: boolean; bonus: number }
export interface SheetAttack { name: string; toHit: number; damage: string; damageType: string; properties: string[]; range?: string }
export interface SheetItem { name: string; qty: number; equipped: boolean; index: number; equipment?: Equipment5e; item?: Item5e }
export interface SheetFeature extends Feature5e { source: string; level?: number }

export interface Sheet5e {
	name: string;
	edition: Dnd5eEdition;
	className: string;
	cls?: Class5e;
	subclass: string;
	level: number;
	species: string;
	background: string;
	pb: number;
	scores: Record<AbilityKey, number>;
	mods: Record<AbilityKey, number>;
	saves: Record<AbilityKey, { bonus: number; proficient: boolean }>;
	skills: SheetSkill[];
	passivePerception: number;
	initiative: number;
	speed: number;
	ac: number;
	/** How AC was worked out: "Leather Armor + Dex", "Unarmored Defense", "set by hand". */
	acFrom: string;
	hp: number;
	hpMax: number;
	tempHp: number;
	hitDie: number;
	hitDiceLeft: number;
	inspiration: boolean;
	deathSaves: { success: number; failure: number };
	spellcasting?: { ability: AbilityKey; dc: number; attack: number };
	/** Slots per spell level 1–9 (only levels with slots), with how many are spent. */
	slots: { level: number; max: number; used: number }[];
	spells: { name: string; spell?: Spell5e }[];
	attacks: SheetAttack[];
	inventory: SheetItem[];
	features: SheetFeature[];
	gold: number;
	/** Conditions on the character now (Exhaustion is `exhaustion`, a level). */
	conditions: string[];
	/** Levels of Exhaustion, 0–6. */
	exhaustion: number;
	/** Passive Insight and Investigation, beside Perception. */
	passiveInsight: number;
	passiveInvestigation: number;
	/** The species' size ("Medium"), when the compendium knows the species. */
	size: string;
	/** Limited-use features' spent uses, by name (sheet-actions.ts works out the features). */
	usesSpent: Record<string, number>;
}

const num = (v: unknown, d: number): number => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : d;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
/** Names match ignoring case, spaces and punctuation: "Half Plate Armor" is "Half-Plate Armor". */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a: string, b: string) => key(a) === key(b);

/** Proficiency bonus by character level. */
export function pbForLevel(level: number): number {
	return 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
}

/** Uses spent so far, from `uses_spent: { Rage: 1 }`. */
export function usesSpent(fm: Frontmatter): Record<string, number> {
	const raw = fm.uses_spent;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const n = num(v, 0);
		if (n > 0) out[k] = Math.floor(n);
	}
	return out;
}

const ABILITY_OF: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha', Strength: 'str', Dexterity: 'dex', Constitution: 'con', Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha' };

/** Inventory entries as written: names, or { name, qty, equipped }. */
function inventoryOf(fm: Frontmatter): { name: string; qty: number; equipped: boolean }[] {
	const raw = Array.isArray(fm.inventory) ? fm.inventory : [];
	return raw.map((x): { name: string; qty: number; equipped: boolean } | null => {
		if (typeof x === 'string') return x.trim() ? { name: x.trim(), qty: 1, equipped: false } : null;
		if (x && typeof x === 'object') {
			const o = x as Record<string, unknown>;
			const name = text(o.name);
			return name ? { name, qty: Math.max(1, num(o.qty, 1)), equipped: o.equipped === true } : null;
		}
		return null;
	}).filter((x): x is { name: string; qty: number; equipped: boolean } => !!x);
}

/** Your own equipment, magic items and spells (```5e-item and ```5e-spell blocks): a sheet finds them before the SRD's. */
export interface Library5e { equipment?: Equipment5e[]; items?: Item5e[]; spells?: Spell5e[] }

/** A magic weapon or armor's base ("Weapon (Longsword)" → Longsword) and its +N from its text. */
function magicBase(item: Item5e | undefined, equipment: Equipment5e[]): { base?: Equipment5e; bonus: number } {
	if (!item) return { bonus: 0 };
	const sub = /\(([^)]*)\)/.exec(item.type)?.[1] ?? '';
	const base = sub ? equipment.find(e => same(e.name, sub) || same(e.name, `${sub} Armor`)) : undefined;
	const bonus = Number(/\+(\d) bonus to (?:attack|Armor Class)/i.exec(item.desc)?.[1] ?? /^\+(\d)\b/.exec(item.name)?.[1] ?? /,\s*\+(\d)\b/.exec(item.name)?.[1] ?? 0);
	return { base, bonus };
}

export function readSheet5e(fm: Frontmatter, edition: Dnd5eEdition, fallbackName = 'Hero', library: Library5e = {}): Sheet5e {
	const c = compendium5e(edition);
	const equipmentList = [...(library.equipment ?? []), ...c.equipment];
	const itemList = [...(library.items ?? []), ...c.items];
	const spellList = [...(library.spells ?? []), ...c.spells];
	const className = text(fm.class);
	const cls = c.classes.find(x => same(x.name, className));
	const level = Math.max(1, Math.min(20, Math.floor(num(fm.level, 1))));
	const pb = pbForLevel(level);
	const scores = Object.fromEntries(ABILITIES.map(a => [a, num(fm[a], 10)])) as Record<AbilityKey, number>;
	const mods = Object.fromEntries(ABILITIES.map(a => [a, abilityMod(scores[a])])) as Record<AbilityKey, number>;
	const saveProf = new Set((cls?.saves ?? []).map(s => ABILITY_OF[s]).filter(Boolean));
	const saves = Object.fromEntries(ABILITIES.map(a => [a, { proficient: saveProf.has(a), bonus: mods[a] + (saveProf.has(a) ? pb : 0) }])) as Sheet5e['saves'];
	const prof = list(fm.skills);
	const exp = list(fm.expertise);
	const skills = SKILLS.map((s): SheetSkill => {
		const proficient = prof.some(p => same(p, s.name));
		const expertise = exp.some(p => same(p, s.name));
		return { ...s, proficient, expertise, bonus: mods[s.ability] + (expertise ? 2 * pb : proficient ? pb : 0) };
	});

	// Inventory, resolved against the compendium: equipment (weapons, armor) and magic items.
	// A magic weapon or armor (Ember Blade, "Weapon (Longsword)") fights as its base, with its bonus.
	const inventory = inventoryOf(fm).map((x, index): SheetItem & { bonus: number } => {
		const item = itemList.find(i => same(i.name, x.name));
		const own = equipmentList.find(e => same(e.name, x.name));
		const magic = own ? { bonus: 0 } : magicBase(item, equipmentList);
		return { ...x, index, equipment: own ?? magic.base, item, bonus: magic.bonus };
	});

	// AC: set by hand, else the armor worn (+ Dex as it allows) and a shield, else unarmored.
	const isShield = (i: (typeof inventory)[number]) => /shield/i.test(i.equipment?.name ?? '') || i.equipment?.armorCategory === 'Shield' || /\bshield\b/i.test(i.name);
	const worn = inventory.find(i => i.equipped && i.equipment?.ac && !isShield(i));
	const held = inventory.find(i => i.equipped && isShield(i));
	const shield = held ? (held.equipment?.ac?.base ?? 2) + held.bonus : 0;
	let ac: number;
	let acFrom: string;
	if (fm.ac !== undefined && fm.ac !== null && fm.ac !== '') { ac = num(fm.ac, 10); acFrom = 'set by hand'; }
	else if (worn?.equipment?.ac) {
		const a = worn.equipment.ac;
		const dex = a.dex ? (a.max !== undefined ? Math.min(a.max, mods.dex) : mods.dex) : 0;
		ac = a.base + dex + shield + worn.bonus;
		acFrom = `${worn.name}${a.dex ? ' + Dex' : ''}${shield ? ' + Shield' : ''}`;
	} else if (cls?.name === 'Barbarian') { ac = 10 + mods.dex + mods.con + shield; acFrom = `Unarmored Defense${shield ? ' + Shield' : ''}`; }
	else if (cls?.name === 'Monk' && !shield) { ac = 10 + mods.dex + mods.wis; acFrom = 'Unarmored Defense'; }
	else { ac = 10 + mods.dex + shield; acFrom = `Unarmored${shield ? ' + Shield' : ''}`; }

	// Spellcasting, from the class.
	const castAbility = cls?.spellcasting ? ABILITY_OF[cls.spellcasting] : undefined;
	const spellcasting = castAbility ? { ability: castAbility, dc: 8 + pb + mods[castAbility], attack: pb + mods[castAbility] } : undefined;
	const row = cls?.levels.find(l => l.level === level);
	const used = Array.isArray(fm.slots_used) ? fm.slots_used.map(v => num(v, 0)) : [];
	const slots = (row?.slots ?? []).map((max, i) => ({ level: i + 1, max, used: Math.min(max, Math.max(0, used[i] ?? 0)) })).filter(s => s.max > 0);

	// Weapons in hand become attacks: Dex for ranged and finesse (if better), else Str.
	const attacks = inventory.filter(i => i.equipped && i.equipment?.damage).map((i): SheetAttack => {
		const e = i.equipment!;
		const props = e.properties ?? [];
		const ranged = /ranged/i.test(`${e.weaponRange ?? ''} ${e.category}`);
		const finesse = props.some(p => /finesse/i.test(p));
		const mod = (ranged ? mods.dex : finesse ? Math.max(mods.str, mods.dex) : mods.str) + i.bonus;
		const [dice, ...type] = (e.damage ?? '').split(' ');
		return { name: i.name, toHit: mod + pb, damage: `${dice}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`, damageType: type.join(' '), properties: props, range: e.range };
	});

	// Features: the class's up to this level, the subclass's, the species' traits, the background's, and your own.
	const subclass = text(fm.subclass);
	const sub = cls?.subclasses.find(s => same(s.name, subclass));
	const species = text(fm.species) || text(fm.race);
	const sp = c.species.find(s => same(s.name, species)) ?? c.species.flatMap(s => s.subspecies.map(x => ({ ...s, name: x.name, traits: [...s.traits, ...x.traits] }))).find(s => same(s.name, species));
	const background = text(fm.background);
	const bg = c.backgrounds.find(b => same(b.name, background));
	const fromClass = (fs: ClassFeature5e[], source: string): SheetFeature[] => fs.filter(f => f.level <= level).map(f => ({ name: f.name, desc: f.desc, source, level: f.level }));
	const own = Array.isArray(fm.features) ? (fm.features as unknown[]).map((f): SheetFeature | null => {
		if (typeof f === 'string') return { name: f, desc: '', source: 'Yours' };
		if (f && typeof f === 'object') { const o = f as Record<string, unknown>; return text(o.name) ? { name: text(o.name), desc: text(o.desc), source: 'Yours' } : null; }
		return null;
	}).filter((f): f is SheetFeature => !!f) : [];
	const features = [
		...(cls ? fromClass(cls.features, cls.name) : []),
		...(sub ? fromClass(sub.features, sub.name) : []),
		...(sp?.traits ?? []).map(t => ({ ...t, source: sp!.name })),
		...(bg?.feature ? [{ ...bg.feature, source: bg.name }] : []),
		// Feats: the background's (2024), then any taken (`feats:`), with their text from the compendium.
		...[...(bg?.feat ? [bg.feat] : []), ...(Array.isArray(fm.feats) ? (fm.feats as unknown[]).map(text) : [])].filter(Boolean).map((name): SheetFeature => {
			const feat = c.feats.find(f => same(f.name, name.replace(/\s*\(.*\)$/, '')));
			return { name, desc: feat?.desc ?? '', source: 'Feat' };
		}),
		...own,
	];

	const hpMax = Math.max(1, num(fm.hp_max, (cls?.hitDie ?? 8) + mods.con));
	const ds = Array.isArray(fm.death_saves) ? fm.death_saves : [];
	const perception = skills.find(s => s.name === 'Perception')!;
	const passive = (name: string) => 10 + skills.find(s => s.name === name)!.bonus;
	return {
		name: text(fm.title) || fallbackName,
		edition,
		className, cls, subclass, level, species, background, pb, scores, mods, saves, skills,
		passivePerception: 10 + perception.bonus,
		passiveInsight: passive('Insight'),
		passiveInvestigation: passive('Investigation'),
		initiative: mods.dex,
		speed: num(fm.speed, sp?.speed ?? 30),
		ac, acFrom,
		hp: Math.max(0, Math.min(hpMax, num(fm.hp, hpMax))),
		hpMax,
		tempHp: Math.max(0, num(fm.temp_hp, 0)),
		hitDie: cls?.hitDie ?? 8,
		hitDiceLeft: Math.max(0, level - num(fm.hit_dice_used, 0)),
		inspiration: fm.inspiration === true,
		deathSaves: { success: Math.min(3, num(ds[0], 0)), failure: Math.min(3, num(ds[1], 0)) },
		spellcasting,
		slots,
		spells: list(fm.spells).map(name => ({ name, spell: spellList.find(s => same(s.name, name)) })),
		attacks,
		inventory,
		features,
		gold: num(fm.gold, 0),
		conditions: list(fm.conditions).filter(c => !/^exhaustion\b/i.test(c)),
		exhaustion: Math.max(0, Math.min(6, Math.floor(num(fm.exhaustion, 0)))),
		size: sp?.size ?? '',
		usesSpent: usesSpent(fm),
	};
}

// ----------------------------------------------------------------------------
// Edits: each changes the frontmatter object in place.

/** Damage (temp HP first), healing, temp HP (the larger), or a set value. At 0 HP, damage is a failed death save. */
export function changeHp(fm: Frontmatter, s: Sheet5e, change: { kind: 'damage' | 'heal' | 'temp' | 'set'; amount: number }): void {
	const n = Math.max(0, Math.floor(change.amount));
	if (change.kind === 'temp') { fm.temp_hp = Math.max(s.tempHp, n); return; }
	if (change.kind === 'set') { fm.hp = Math.min(s.hpMax, n); if (n > 0) delete fm.death_saves; return; }
	if (change.kind === 'heal') {
		fm.hp = Math.min(s.hpMax, s.hp + n);
		if (s.hp === 0 && n > 0) delete fm.death_saves;
		return;
	}
	const fromTemp = Math.min(s.tempHp, n);
	if (s.tempHp) fm.temp_hp = s.tempHp - fromTemp;
	const rest = n - fromTemp;
	if (rest <= 0) return;
	if (s.hp === 0) { fm.death_saves = [s.deathSaves.success, Math.min(3, s.deathSaves.failure + 1)]; return; }
	fm.hp = Math.max(0, s.hp - rest);
}

export function setDeathSaves(fm: Frontmatter, success: number, failure: number): void {
	if (!success && !failure) delete fm.death_saves;
	else fm.death_saves = [Math.max(0, Math.min(3, success)), Math.max(0, Math.min(3, failure))];
}

/** Spend (+1) or restore (−1) a spell slot of a level. */
export function useSlot(fm: Frontmatter, s: Sheet5e, level: number, delta: 1 | -1): void {
	const slot = s.slots.find(x => x.level === level);
	if (!slot) return;
	const used = s.slots.reduce<number[]>((arr, x) => { arr[x.level - 1] = x.used; return arr; }, []);
	for (let i = 0; i < used.length; i++) used[i] ??= 0;
	used[level - 1] = Math.max(0, Math.min(slot.max, slot.used + delta));
	while (used.length && !used[used.length - 1]) used.pop();
	if (used.length) fm.slots_used = used; else delete fm.slots_used;
}

/** Toggle a skill: none → proficient → expertise → none. */
export function cycleSkill(fm: Frontmatter, skill: string): void {
	const prof = list(fm.skills);
	const exp = list(fm.expertise);
	const isProf = prof.some(p => same(p, skill));
	const isExp = exp.some(p => same(p, skill));
	if (!isProf) fm.skills = [...prof, skill];
	else if (!isExp) fm.expertise = [...exp, skill];
	else { fm.skills = prof.filter(p => !same(p, skill)); fm.expertise = exp.filter(p => !same(p, skill)); }
	if (!(fm.expertise as string[] | undefined)?.length) delete fm.expertise;
}

/**
 * A long rest: full HP, no temp HP, every slot and limited use back, death saves
 * cleared, one level of Exhaustion gone, and hit dice back: all of them (2024), or half your
 * level, at least one (2014).
 */
export function longRest(fm: Frontmatter, s: Sheet5e): void {
	fm.hp = s.hpMax;
	if (s.exhaustion) setExhaustion(fm, s.exhaustion - 1);
	delete fm.temp_hp;
	delete fm.slots_used;
	delete fm.death_saves;
	delete fm.uses_spent;
	const back = s.edition === '2024' ? s.level : Math.max(1, Math.floor(s.level / 2));
	const used = Math.max(0, s.level - s.hitDiceLeft - back);
	if (used) fm.hit_dice_used = used; else delete fm.hit_dice_used;
}

/** A short rest: spend hit dice to heal (the rolled total, Con already added per die by the caller). */
export function shortRest(fm: Frontmatter, s: Sheet5e, diceSpent: number, healed: number): void {
	const spend = Math.max(0, Math.min(s.hitDiceLeft, diceSpent));
	if (spend) fm.hit_dice_used = s.level - s.hitDiceLeft + spend;
	fm.hp = Math.min(s.hpMax, s.hp + Math.max(0, healed));
}

/** One level up: HP max grows by the class's average (or a roll), plus Con. */
export function levelUp(fm: Frontmatter, s: Sheet5e, hpGain?: number): void {
	if (s.level >= 20) return;
	const gain = Math.max(1, (hpGain ?? Math.floor(s.hitDie / 2) + 1) + s.mods.con);
	fm.level = s.level + 1;
	fm.hp_max = s.hpMax + gain;
	fm.hp = s.hp + gain;
}

export function addListEntry(fm: Frontmatter, key: 'spells' | 'conditions', name: string): void {
	const now = list(fm[key]);
	if (!now.some(x => same(x, name))) fm[key] = [...now, name];
}

export function removeListEntry(fm: Frontmatter, key: 'spells' | 'conditions', name: string): void {
	const left = list(fm[key]).filter(x => !same(x, name));
	// An empty condition list goes away; spells: [] stays (new notes start with it).
	if (key === 'conditions' && !left.length) delete fm.conditions;
	else fm[key] = left;
}

/** Hit dice left, set from the sheet's pips (0 to level). */
export function setHitDiceLeft(fm: Frontmatter, s: Sheet5e, left: number): void {
	const used = s.level - Math.max(0, Math.min(s.level, Math.floor(left)));
	if (used) fm.hit_dice_used = used; else delete fm.hit_dice_used;
}

/** Levels of Exhaustion (0–6); 0 removes the key. */
export function setExhaustion(fm: Frontmatter, level: number): void {
	const n = Math.max(0, Math.min(6, Math.floor(level)));
	if (n) fm.exhaustion = n; else delete fm.exhaustion;
}

export function addItem(fm: Frontmatter, name: string, o: { qty?: number; equipped?: boolean } = {}): void {
	const inv = inventoryOf(fm);
	const have = inv.find(i => same(i.name, name));
	if (have) have.qty += o.qty ?? 1;
	else inv.push({ name, qty: o.qty ?? 1, equipped: o.equipped ?? false });
	fm.inventory = inv.map(i => ({ name: i.name, ...(i.qty !== 1 ? { qty: i.qty } : {}), ...(i.equipped ? { equipped: true } : {}) }));
}

export function setItem(fm: Frontmatter, index: number, change: { equipped?: boolean; qty?: number }): void {
	const inv = inventoryOf(fm);
	const it = inv[index];
	if (!it) return;
	if (change.equipped !== undefined) it.equipped = change.equipped;
	if (change.qty !== undefined) it.qty = change.qty;
	fm.inventory = inv.filter(i => i.qty > 0).map(i => ({ name: i.name, ...(i.qty !== 1 ? { qty: i.qty } : {}), ...(i.equipped ? { equipped: true } : {}) }));
}

/** A new character's frontmatter. HP at level 1 is the hit die's maximum plus Con; later levels add the average. */
export function newCharacterFm(o: { name: string; className: string; level: number; species: string; background: string; scores: Record<AbilityKey, number>; mine: boolean; edition: Dnd5eEdition }): Frontmatter {
	const cls = compendium5e(o.edition).classes.find(c => same(c.name, o.className));
	const die = cls?.hitDie ?? 8;
	const con = abilityMod(o.scores.con);
	const hp = Math.max(1, die + con + (o.level - 1) * Math.max(1, Math.floor(die / 2) + 1 + con));
	// The sheet-note class keeps Obsidian's property list out of the way of the sheet, as on Nimble character notes.
	const fm: Frontmatter = { nimble: 'character', system: '5e', edition: o.edition, cssclasses: ['nimble-sheet-note'] };
	if (o.mine) fm.mine = true;
	Object.assign(fm, { class: o.className, level: o.level, [o.edition === '2014' ? 'race' : 'species']: o.species, background: o.background });
	for (const a of ABILITIES) fm[a] = o.scores[a];
	Object.assign(fm, { hp, hp_max: hp, skills: [], spells: [], inventory: [], gold: 0 });
	return fm;
}
