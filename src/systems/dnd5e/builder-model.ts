// What 5e's monster builder edits, and the formulas that turn a draft into a
// stat block the way each edition prints it: AC from armor (or natural armor),
// hit points from hit dice and Constitution, proficiency and XP from the
// challenge rating, 2024's initiative, saves and skills from abilities, passive
// Perception, speeds and senses, damage and condition immunities, attacks (to
// hit, damage averages, extra damage), saving throw actions (DC from an
// ability), spellcasting (save DC and spell attack), uses (Recharge 5–6,
// 3/Day) and legendary actions. Pure: no Obsidian imports.

import type { Draft } from '../../core/builder/schema';
import { averageRoll } from './parser';
import { abilityMod, crValue, formatMod, pbForCr, xpForCr } from './rules';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, ABILITY_NAME, AbilityKey, Dnd5eMonster, Feature5e } from './types';

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
export const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'] as const;
export const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'] as const;
export const CONDITIONS_5E = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'] as const;
/** As the SRD's stat blocks write them (lower case; the block shows them as written). */
export const ALIGNMENTS = ['unaligned', 'lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil', 'any alignment'] as const;
/** How often an action or trait can be used: after its name, in brackets. */
export const USES_5E = ['Recharge 5–6', 'Recharge 6', 'Recharge 4–6', '1/Day', '2/Day', '3/Day', '3/Day, or 4/Day in Lair', 'Recharges after a Short or Long Rest'] as const;
export const SPEED_KINDS = ['burrow', 'climb', 'fly', 'swim'] as const;
export const SENSE_KINDS = ['blindsight', 'darkvision', 'tremorsense', 'truesight'] as const;
export const ABILITY_SHORT: Record<AbilityKey, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
export const SKILL_ABILITY: Record<string, AbilityKey> = {
	Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis', Intimidation: 'cha',
	Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha', Religion: 'int', 'Sleight of Hand': 'dex',
	Stealth: 'dex', Survival: 'wis',
};

/** Hit die by size. */
export const HIT_DIE: Record<string, number> = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };

/** The SRD's armor: AC, and how much Dex it lets in (both editions; "Half Plate" is "Half-Plate" in 2024's equipment). */
export const ARMOR_5E: Record<string, { base: number; dex: boolean; max?: number }> = {
	'Padded Armor': { base: 11, dex: true }, 'Leather Armor': { base: 11, dex: true }, 'Studded Leather Armor': { base: 12, dex: true },
	'Hide Armor': { base: 12, dex: true, max: 2 }, 'Chain Shirt': { base: 13, dex: true, max: 2 }, 'Scale Mail': { base: 14, dex: true, max: 2 },
	Breastplate: { base: 14, dex: true, max: 2 }, 'Half Plate Armor': { base: 15, dex: true, max: 2 },
	'Ring Mail': { base: 14, dex: false }, 'Chain Mail': { base: 16, dex: false }, 'Splint Armor': { base: 17, dex: false }, 'Plate Armor': { base: 18, dex: false },
};

export interface Feature5eDraft extends Draft { name: string; desc: string; uses?: string }

/** An action: an attack or a saving throw the builder words, or text as typed. */
export interface Action5eDraft extends Draft {
	name: string;
	kind: 'melee' | 'ranged' | 'both' | 'save' | 'text';
	/** "Recharge 5–6", "3/Day"… */
	uses?: string;
	/** The attack's ability; `finesse` takes the better of Str and Dex. */
	ability: AbilityKey | 'finesse';
	/** 2014: a spell attack ("Melee Spell Attack") rather than a weapon attack. */
	spell?: boolean;
	reach?: number;
	/** "80/320". */
	range: string;
	count?: number;
	sides: string;
	damageType: string;
	/** The ability's modifier is added to the damage (unset: yes). */
	addMod?: boolean;
	/** Extra damage: "plus 7 (2d6) Fire damage". */
	plusCount?: number;
	plusSides?: string;
	plusType?: string;
	/** "if the attack roll had Advantage". */
	plusWhen?: string;
	/** After the damage: "If the target is a creature, it has the Prone condition." */
	extra: string;
	/** A saving throw: which, the ability its DC comes from, who makes it, half damage on a success, and what else a failure does. */
	save?: AbilityKey;
	dcAbility?: AbilityKey;
	area?: string;
	half?: boolean;
	effect?: string;
	/** For `text` actions (Multiattack…). */
	desc: string;
}

export interface Monster5eDraft extends Draft {
	edition: Dnd5eEdition;
	name: string;
	size: string;
	type: string;
	/** "(goblinoid)", "any alignment"… */
	tags: string;
	alignment: string;
	cr: string;
	/** 2024: fought in its lair (the next CR's XP, and legendary uses +1 in its lair). */
	lair?: boolean;
	/** Typed AC, instead of the armor's. */
	ac?: number;
	/** '' (none), 'natural', or one of ARMOR_5E. */
	armor?: string;
	shield?: boolean;
	/** Typed AC note ("natural armor", "mage armor"), instead of the armor's. */
	acNote: string;
	hitDice?: number;
	/** Typed HP, instead of the hit dice's average. */
	hp?: number;
	/** 2024: proficiency in initiative (0, 1 or 2 × PB), or a typed bonus. */
	initProf?: number;
	init?: number;
	walk?: number; burrow?: number; climb?: number; fly?: number; swim?: number;
	hover?: boolean;
	/** Any other speed text ("(hover)" on a swim speed, "30 ft. in jackal form"). */
	speed: string;
	str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
	/** Proficient saves: "Str", "Dex"… */
	saves: string[];
	skills: string[];
	/** Skills with double proficiency. */
	expertise: string[];
	/** Damage types and conditions picked as chips; the text fields hold anything else ("…from nonmagical attacks"). */
	resist?: string[]; immune?: string[]; vulnerable?: string[]; condImmune?: string[];
	resistances: string;
	immunities: string;
	vulnerabilities: string;
	conditionImmunities: string;
	blindsight?: number; darkvision?: number; tremorsense?: number; truesight?: number;
	/** Blindsight: "(blind beyond this radius)". */
	blind?: boolean;
	/** Other senses, as written. */
	senses: string;
	languages: string;
	gear: string;
	traits: Feature5eDraft[];
	actions: Action5eDraft[];
	/** Spellcasting: the ability (none: no spellcasting), and spells by how often. */
	spellAbility?: string;
	atWill?: string; day3?: string; day2?: string; day1?: string;
	noMaterial?: boolean;
	bonusActions: Feature5eDraft[];
	reactions: Feature5eDraft[];
	legendary: Feature5eDraft[];
	legendaryUses?: number;
}

export function newAction5e(kind: Action5eDraft['kind'] = 'melee'): Action5eDraft {
	return {
		name: '', kind, ability: kind === 'ranged' ? 'dex' : 'str', reach: 5, range: '80/320', count: 1, sides: '6', damageType: kind === 'ranged' ? 'Piercing' : 'Slashing',
		extra: '', desc: '', save: 'dex', dcAbility: 'con', area: '', half: true, effect: '', plusSides: '', plusType: 'Fire', plusWhen: '',
	};
}

export function newFeature5e(): Feature5eDraft {
	return { name: '', desc: '', uses: '' };
}

export function newMonster5e(edition: Dnd5eEdition): Monster5eDraft {
	return {
		edition, name: '', size: 'Medium', type: 'Humanoid', tags: '', alignment: 'neutral', cr: '1', acNote: '', armor: '', shield: false, walk: 30, speed: '',
		hitDice: 4, saves: [], skills: [], expertise: [], resist: [], immune: [], vulnerable: [], condImmune: [], resistances: '', immunities: '', vulnerabilities: '', conditionImmunities: '',
		senses: '', languages: 'Common', gear: '', traits: [], actions: [{ ...newAction5e(), name: 'Strike' }], bonusActions: [], reactions: [], legendary: [],
		spellAbility: '', atWill: '', day3: '', day2: '', day1: '',
	};
}

const score = (d: Monster5eDraft, a: AbilityKey) => d[a] ?? 10;
/** "+ 3", "- 1" (2014) or "− 1" (2024): how each edition writes a modifier inside dice. */
const plus = (d: Monster5eDraft, n: number) => (n ? ` ${n > 0 ? '+' : d.edition === '2014' ? '-' : '−'} ${Math.abs(n)}` : '');
export const modOf = (d: Monster5eDraft, a: AbilityKey) => abilityMod(score(d, a));
export const pbOf = (d: Monster5eDraft) => pbForCr(d.cr);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const word = (d: Monster5eDraft, s: string) => (d.edition === '2014' ? s.toLowerCase() : cap(s));
const named = (name: string, uses?: string) => (uses?.trim() && !/\([^)]*\)\s*$/.test(name) ? `${name} (${uses.trim()})` : name);

/** Hit points: typed, else the hit dice's average plus Constitution per die (at least 1). */
export function hpOf(d: Monster5eDraft): { hp: number; formula?: string } {
	const n = Math.max(1, d.hitDice ?? 1);
	const die = HIT_DIE[d.size] ?? 8;
	const bonus = n * modOf(d, 'con');
	const formula = `${n}d${die}${plus(d, bonus)}`;
	const avg = Math.max(1, Math.floor(n * (die + 1) / 2) + bonus);
	if (d.hp !== undefined) return d.hp === avg ? { hp: avg, formula } : { hp: d.hp };
	return { hp: avg, formula };
}

/** AC from the armor worn (Dex as it allows) and a shield; typed AC wins. */
export function acOf(d: Monster5eDraft): number {
	if (d.ac !== undefined) return d.ac;
	const shield = d.shield ? 2 : 0;
	const a = ARMOR_5E[d.armor ?? ''];
	if (!a) return 10 + modOf(d, 'dex') + shield;
	const dex = a.dex ? (a.max !== undefined ? Math.min(a.max, modOf(d, 'dex')) : modOf(d, 'dex')) : 0;
	return a.base + dex + shield;
}

/** The note after the AC: typed, else (2014) the armor and shield, or natural armor. 2024 blocks don't print one. */
export function acNoteOf(d: Monster5eDraft): string {
	if (d.acNote.trim()) return d.acNote.trim();
	if (d.edition !== '2014') return '';
	const parts = [d.armor === 'natural' ? 'natural armor' : d.armor ? d.armor.toLowerCase() : '', d.shield ? 'shield' : ''].filter(Boolean);
	return parts.join(', ');
}

/** 2024: the gear line, with the armor and shield in it, in the book's order (alphabetical). */
export function gearOf(d: Monster5eDraft): string {
	if (d.edition === '2014') return '';
	const items = d.gear.split(',').map(s => s.trim()).filter(Boolean);
	let added = false;
	const add = (x: string) => { if (!items.some(i => i.toLowerCase().startsWith(x.toLowerCase()))) { items.push(x); added = true; } };
	if (d.armor && ARMOR_5E[d.armor]) add(d.armor.replace('Half Plate', 'Half-Plate'));
	if (d.shield) add('Shield');
	return (added ? items.sort((a, b) => a.localeCompare(b)) : items).join(', ');
}

/** 2024: initiative, the Dex modifier plus PB once or twice; typed wins. */
export function initiativeOfDraft(d: Monster5eDraft): number {
	if (d.init !== undefined) return d.init;
	return modOf(d, 'dex') + (d.initProf ?? 0) * pbOf(d);
}

/** "30 ft., climb 40 ft., fly 80 ft. (hover)": the edition's casing, in the book's order. */
export function speedOf(d: Monster5eDraft): string {
	const parts: string[] = [];
	if (d.walk !== undefined) parts.push(`${d.walk} ft.`);
	for (const k of SPEED_KINDS) {
		const v = d[k];
		if (v === undefined || v === 0) continue;
		parts.push(`${word(d, k)} ${v} ft.${k === 'fly' && d.hover ? ' (hover)' : ''}`);
	}
	if (d.speed.trim()) parts.push(d.speed.trim());
	return parts.join(', ') || '30 ft.';
}

/** A save's bonus: the ability's modifier, plus proficiency when proficient. */
export function saveBonus(d: Monster5eDraft, a: AbilityKey): number {
	return modOf(d, a) + (d.saves.includes(ABILITY_SHORT[a]) ? pbOf(d) : 0);
}

export function skillBonus(d: Monster5eDraft, skill: string): number {
	const a = SKILL_ABILITY[skill] ?? 'wis';
	return modOf(d, a) + (d.expertise.includes(skill) ? 2 * pbOf(d) : d.skills.includes(skill) ? pbOf(d) : 0);
}

export function passivePerception(d: Monster5eDraft): number {
	return 10 + skillBonus(d, 'Perception');
}

/** "Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 23" (2024) or "blindsight 60 ft., darkvision 120 ft., passive Perception 23" (2014). */
export function sensesOf(d: Monster5eDraft): string {
	const parts: string[] = [];
	for (const k of SENSE_KINDS) {
		const v = d[k];
		if (v) parts.push(`${word(d, k)} ${v} ft.${k === 'blindsight' && d.blind ? ' (blind beyond this radius)' : ''}`);
	}
	if (d.senses.trim()) parts.push(d.senses.trim());
	const pp = `${d.edition === '2014' ? 'passive' : 'Passive'} Perception ${passivePerception(d)}`;
	return parts.length ? `${parts.join(', ')}${d.edition === '2014' ? ', ' : '; '}${pp}` : pp;
}

/** A save DC from an ability: 8 + PB + the ability's modifier. */
export function dcOf(d: Monster5eDraft, a: AbilityKey): number {
	return 8 + pbOf(d) + modOf(d, a);
}

/** The ability an attack uses (finesse: the better of Str and Dex). */
export function attackAbility(d: Monster5eDraft, a: Action5eDraft): AbilityKey {
	if (a.ability !== 'finesse') return a.ability;
	return modOf(d, 'dex') > modOf(d, 'str') ? 'dex' : 'str';
}

export function toHit(d: Monster5eDraft, a: Action5eDraft): number {
	return modOf(d, attackAbility(d, a)) + pbOf(d);
}

/** "6 (1d6 + 3)": the average, rounded down, and the dice. */
export function damageText(d: Monster5eDraft, a: Action5eDraft): string {
	const n = Math.max(1, a.count ?? 1);
	const sides = Number(a.sides) || 6;
	const mod = a.addMod === false || a.kind === 'save' ? 0 : modOf(d, attackAbility(d, a));
	const formula = `${n}d${sides}${plus(d, mod)}`;
	const avg = Math.max(1, (averageRoll(`${n}d${sides}`) ?? n) + mod);
	return `${avg} (${formula})`;
}

/** "plus 7 (2d6) Fire damage" (and when), or ''. */
function plusDamage(d: Monster5eDraft, a: Action5eDraft): string {
	const sides = Number(a.plusSides);
	if (!sides) return '';
	const n = Math.max(1, a.plusCount ?? 1);
	const avg = averageRoll(`${n}d${sides}`) ?? n;
	const when = a.plusWhen?.trim();
	return `${when ? ',' : ''} plus ${avg} (${n}d${sides}) ${word(d, a.plusType?.trim() || 'Fire')} damage${when ? ` ${when}` : ''}`;
}

const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

/** An attack or a saving throw, worded the way the edition prints it. */
export function attackText(d: Monster5eDraft, a: Action5eDraft): string {
	if (a.kind === 'text') return a.desc.trim();
	if (a.kind === 'save') return saveText(d, a);
	const where = a.kind === 'both' ? `reach ${a.reach ?? 5} ft. or range ${a.range.trim() || '20/60'} ft.` : a.kind === 'ranged' ? `range ${a.range.trim() || '30/120'} ft.` : `reach ${a.reach ?? 5} ft.`;
	const hit = formatMod(toHit(d, a));
	const dmg = damageText(d, a);
	const type = word(d, a.damageType.trim() || 'Bludgeoning');
	const extra = a.extra.trim() ? ` ${a.extra.trim()}` : '';
	const kind = a.kind === 'both' ? 'Melee or Ranged' : a.kind === 'ranged' ? 'Ranged' : 'Melee';
	if (d.edition === '2014') {
		return `${kind} ${a.spell ? 'Spell' : 'Weapon'} Attack: ${hit} to hit, ${where}, one target. Hit: ${dmg} ${type} damage${plusDamage(d, a)}.${extra}`;
	}
	return `${kind} Attack Roll: ${hit}, ${where} Hit: ${dmg} ${type} damage${plusDamage(d, a)}.${extra}`;
}

/**
 * A saving throw action. 2024: "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage.
 * Success: Half damage." 2014: "Each creature in a 60-foot cone must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire
 * damage on a failed save, or half as much damage on a successful one."
 */
export function saveText(d: Monster5eDraft, a: Action5eDraft): string {
	const save = a.save ?? 'dex';
	const dc = dcOf(d, a.dcAbility ?? 'con');
	const dmg = Number(a.sides) && (a.count ?? 1) > 0 && a.damageType ? `${damageText(d, a)} ${word(d, a.damageType)}` : '';
	const effect = a.effect?.trim() ?? '';
	const half = a.half !== false && !!dmg;
	if (d.edition === '2014') {
		const who = cap(a.area?.trim() || 'the target');
		if (dmg && half) return `${who} must make a DC ${dc} ${ABILITY_NAME[save]} saving throw, taking ${dmg} damage on a failed save, or half as much damage on a successful one.${effect ? ` ${sentence(effect)}` : ''}`;
		if (dmg) return `${who} must succeed on a DC ${dc} ${ABILITY_NAME[save]} saving throw or take ${dmg} damage.${effect ? ` ${sentence(effect)}` : ''}`;
		return `${who} must succeed on a DC ${dc} ${ABILITY_NAME[save]} saving throw${effect ? ` or ${effect.replace(/\.$/, '')}` : ''}.`;
	}
	const area = a.area?.trim() || 'one creature within 30 feet';
	const failure = [dmg ? `${dmg} damage.` : '', sentence(effect)].filter(Boolean).join(' ');
	return `${ABILITY_NAME[save]} Saving Throw: DC ${dc}, ${area}.${failure ? ` Failure: ${failure}` : ''}${half ? ' Success: Half damage.' : ''}`;
}

/** Spellcasting, as the edition writes it: 2024 an action, 2014 an Innate Spellcasting trait. Null without an ability or spells. */
export function spellcastingOf(d: Monster5eDraft): Feature5e | null {
	const ab = ABILITIES.find(a => a === d.spellAbility);
	const lists: [string, string | undefined][] = [['At Will', d.atWill], ['3/Day Each', d.day3], ['2/Day Each', d.day2], ['1/Day Each', d.day1]];
	const used = lists.filter(([, v]) => v?.trim());
	if (!ab || !used.length) return null;
	const who = (d.name.trim() || 'monster').toLowerCase();
	const dc = dcOf(d, ab), hit = formatMod(pbOf(d) + modOf(d, ab));
	if (d.edition === '2014') {
		const lines = used.map(([k, v]) => `${k.replace(' Each', ' each').replace('At Will', 'At will').replace('/Day', '/day')}: ${v!.trim()}`);
		return { name: 'Innate Spellcasting', desc: `The ${who}'s innate spellcasting ability is ${ABILITY_NAME[ab]} (spell save DC ${dc}, ${hit} to hit with spell attacks). It can innately cast the following spells${d.noMaterial ? ', requiring no material components' : ''}:\n\n${lines.join('\n')}` };
	}
	const lines = used.map(([k, v]) => `- **${k}:** ${v!.trim()}`);
	return { name: 'Spellcasting', desc: `The ${who} casts one of the following spells, ${d.noMaterial ? 'requiring no Material components and ' : ''}using ${ABILITY_NAME[ab]} as the spellcasting ability (spell save DC ${dc}, ${hit} to hit with spell attacks):\n${lines.join('\n')}` };
}

const features = (xs: Feature5eDraft[]): Feature5e[] => xs.filter(f => f.name.trim() || f.desc.trim()).map(f => ({ name: named(f.name.trim() || 'Feature', f.uses), desc: f.desc.trim() }));
/** Picked chips (in the edition's case), then anything typed. */
const picked = (d: Monster5eDraft, chips: string[] | undefined, text: string) => [...(chips ?? []).map(c => (d.edition === '2014' ? c.toLowerCase() : c)), ...(text.includes(';') ? text.split(';') : text.split(',')).map(s => s.trim()).filter(Boolean)];

/** The next challenge rating's XP (2024's XP in a lair). */
function lairXp(cr: string): number {
	const i = CRS.indexOf(cr);
	return xpForCr(CRS[Math.min(CRS.length - 1, i + 1)]);
}

/** XP shown in the builder's check. */
export function xpOfDraft(d: Monster5eDraft): number {
	return xpForCr(d.cr);
}

/** The draft as a monster. */
export function toMonster5e(d: Monster5eDraft): Dnd5eMonster {
	const name = d.name.trim() || 'Monster';
	const { hp, formula } = hpOf(d);
	const saves: Partial<Record<AbilityKey, number>> = {};
	for (const a of ABILITIES) if (d.saves.includes(ABILITY_SHORT[a])) saves[a] = saveBonus(d, a);
	const skills: Record<string, number> = {};
	for (const s of Object.keys(SKILL_ABILITY)) if (d.skills.includes(s) || d.expertise.includes(s)) skills[s] = skillBonus(d, s);
	const cr = crValue(d.cr) !== undefined ? d.cr : '0';
	const m: Dnd5eMonster = {
		name,
		size: d.size,
		type: [d.type.toLowerCase(), d.tags.trim()].filter(Boolean).join(' '),
		alignment: d.alignment.trim() || undefined,
		ac: acOf(d),
		acNote: acNoteOf(d) || undefined,
		hp,
		hpFormula: formula,
		speed: speedOf(d),
		abilities: ABILITIES.map(a => score(d, a)) as Dnd5eMonster['abilities'],
		cr,
		senses: sensesOf(d),
		languages: d.languages.trim() || '—',
		xp: xpForCr(cr),
		pb: pbForCr(cr),
		edition: d.edition,
	};
	if (d.edition === '2024') {
		const init = initiativeOfDraft(d);
		if (init !== modOf(d, 'dex')) m.initiative = init;
		if (d.lair) m.xpLair = lairXp(cr);
	}
	// The shape the parser reads back: no empty properties.
	for (const k of Object.keys(m) as (keyof Dnd5eMonster)[]) if (m[k] === undefined) delete m[k];
	if (Object.keys(saves).length) m.saves = saves;
	if (Object.keys(skills).length) m.skills = skills;
	const res = picked(d, d.resist, d.resistances), imm = picked(d, d.immune, d.immunities), vul = picked(d, d.vulnerable, d.vulnerabilities), cond = picked(d, d.condImmune, d.conditionImmunities);
	if (res.length) m.resistances = res;
	if (imm.length) m.immunities = imm;
	if (vul.length) m.vulnerabilities = vul;
	if (cond.length) m.conditionImmunities = cond;
	const gear = gearOf(d);
	if (gear) m.gear = gear;
	const spells = spellcastingOf(d);
	const traits = [...features(d.traits), ...(spells && d.edition === '2014' ? [spells] : [])];
	const actions = [
		...d.actions.filter(a => a.name.trim() || a.desc.trim()).map(a => ({ name: named(a.name.trim() || 'Attack', a.uses), desc: attackText(d, a) })),
		...(spells && d.edition !== '2014' ? [spells] : []),
	];
	const bonus = features(d.bonusActions), reactions = features(d.reactions), legendary = features(d.legendary);
	if (traits.length) m.traits = traits;
	if (actions.length) m.actions = actions;
	if (bonus.length) m.bonusActions = bonus;
	if (reactions.length) m.reactions = reactions;
	if (legendary.length) {
		m.legendaryActions = legendary;
		const uses = d.legendaryUses ?? 3;
		const who = name.toLowerCase();
		m.legendaryIntro = d.edition === '2014'
			? `The ${who} can take ${uses} legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The ${who} regains spent legendary actions at the start of its turn.`
			: `Legendary Action Uses: ${uses}${d.lair ? ` (${uses + 1} in Lair)` : ''}. Immediately after another creature's turn, the ${who} can expend a use to take one of the following actions. The ${who} regains all expended uses at the start of each of its turns.`;
	}
	return m;
}

// ----------------------------------------------------------------------------
// Reading a monster back into a draft. Each part is read into the builder's
// fields only when they write it back exactly as it was; otherwise it stays as
// written, so nothing in a block is ever lost by opening it in the builder.

/** How an armor is written in a 2024 gear line ("half-plate armor"), lower case. */
const armorWord = (a: string) => a.replace('Half Plate', 'Half-Plate').toLowerCase();

/** "Bite (Recharge 5–6)" → Bite and Recharge 5–6. */
function splitUses(name: string): { name: string; uses: string } {
	const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
	if (m && USES_5E.some(u => u.toLowerCase() === m[2].toLowerCase())) return { name: m[1], uses: USES_5E.find(u => u.toLowerCase() === m[2].toLowerCase())! };
	return { name, uses: '' };
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s.replace('−', '-').replace(/\s/g, '')));

/** An attack's text as builder fields, if the builder words it the same way. */
function readAttack(d: Monster5eDraft, name: string, desc: string): Action5eDraft | null {
	const head = /^(Melee or Ranged|Melee|Ranged) (?:(Weapon|Spell) Attack|Attack Roll):\s*([+\-−]\d+)/.exec(desc);
	const hit = /Hit: (\d+) \((\d+)d(\d+)(?: ([+\-−]) (\d+))? ?\) (\w+) damage/.exec(desc);
	if (!head || !hit) return null;
	const kind: Action5eDraft['kind'] = head[1] === 'Melee or Ranged' ? 'both' : head[1] === 'Ranged' ? 'ranged' : 'melee';
	const toHit = num(head[3])!;
	const dmgMod = hit[4] ? (hit[4] === '+' ? 1 : -1) * Number(hit[5]) : 0;
	const reach = /reach (\d+) ft/.exec(desc)?.[1];
	const range = /range ([\d/]+) ft/.exec(desc)?.[1];
	const pl = /plus (\d+) \((\d+)d(\d+)\) (\w+) damage(?: ([^.]*))?\./.exec(desc);
	const rest = /damage(?:,? plus \d+ \(\d+d\d+\) \w+ damage(?: [^.]*)?)?\.\s?(.*)$/s.exec(desc.slice(hit.index))?.[1] ?? '';
	const pb = pbOf(d);
	const fits = (k: AbilityKey) => modOf(d, k) + pb === toHit;
	const order: (AbilityKey | 'finesse')[] = kind === 'ranged' ? ['dex', 'str', 'finesse', 'con', 'int', 'wis', 'cha'] : ['str', 'dex', 'finesse', 'con', 'int', 'wis', 'cha'];
	for (const addMod of [true, false]) {
		for (const ability of order) {
			const base: Action5eDraft = {
				...newAction5e(kind), name, kind, ability, spell: head[2] === 'Spell', reach: reach ? Number(reach) : 5, range: range ?? '', count: Number(hit[2]), sides: hit[3],
				damageType: cap(hit[6]), addMod: addMod ? undefined : false, extra: rest.trim(),
				plusCount: pl ? Number(pl[2]) : undefined, plusSides: pl ? pl[3] : '', plusType: pl ? cap(pl[4]) : 'Fire', plusWhen: pl?.[5]?.trim() ?? '',
			};
			const k = attackAbility(d, base);
			if (!fits(k) || (addMod ? modOf(d, k) !== dmgMod : dmgMod !== 0)) continue;
			if (attackText(d, base) === desc) return base;
		}
	}
	return null;
}

/** A saving throw action's text as builder fields, if the builder words it the same way. */
function readSave(d: Monster5eDraft, name: string, desc: string): Action5eDraft | null {
	const s = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (?:Saving Throw: DC|saving throw)/i.exec(desc);
	const dc = /DC (\d+)/.exec(desc);
	if (!s || !dc) return null;
	const save = ABILITIES.find(a => ABILITY_NAME[a].toLowerCase() === s[1].toLowerCase())!;
	const dmg = /(\d+) \((\d+)d(\d+)\) (\w+) damage/.exec(desc);
	const dcAbility = ABILITIES.find(a => dcOf(d, a) === Number(dc[1]));
	if (!dcAbility) return null;
	let area = '', effect = '';
	if (d.edition === '2014') {
		area = /^(.*?) must (?:make|succeed on)/.exec(desc)?.[1] ?? '';
		effect = dmg ? (/damage(?: on a failed save, or half as much damage on a successful one)?\.\s?(.*)$/s.exec(desc)?.[1] ?? '') : (/saving throw or (.*)\.$/s.exec(desc)?.[1] ?? '');
		if (area && area !== cap(area)) return null;
		area = area.charAt(0).toLowerCase() + area.slice(1);
	} else {
		area = /DC \d+, (.*?)\.(?: Failure:|$)/s.exec(desc)?.[1] ?? '';
		effect = (dmg ? /Failure: \d+ \(\d+d\d+\) \w+ damage\.\s?(.*?)(?: Success: Half damage\.)?$/s : /Failure: (.*?)(?: Success: Half damage\.)?$/s).exec(desc)?.[1] ?? '';
	}
	const a: Action5eDraft = {
		...newAction5e('save'), name, kind: 'save', save, dcAbility, area, effect: effect.trim(), half: /half/i.test(desc),
		count: dmg ? Number(dmg[2]) : 0, sides: dmg ? dmg[3] : '', damageType: dmg ? cap(dmg[4]) : '',
	};
	return saveText(d, a) === desc ? a : null;
}

/** A spellcasting action or trait as builder fields, if the builder words it the same way. */
function readSpellcasting(d: Monster5eDraft, f: Feature5e): boolean {
	if (!/^(Innate )?Spellcasting$/.test(f.name)) return false;
	const ab = ABILITIES.find(a => new RegExp(ABILITY_NAME[a]).test(f.desc));
	if (!ab) return false;
	const get = (re: RegExp) => re.exec(f.desc)?.[1]?.trim() ?? '';
	const was = { spellAbility: d.spellAbility, atWill: d.atWill, day3: d.day3, day2: d.day2, day1: d.day1, noMaterial: d.noMaterial };
	Object.assign(d, {
		spellAbility: ab, noMaterial: /requiring no material components/i.test(f.desc),
		atWill: get(/At will:\**\s*(.*)$/im), day3: get(/3\/day each:\**\s*(.*)$/im), day2: get(/2\/day each:\**\s*(.*)$/im), day1: get(/1\/day each:\**\s*(.*)$/im),
	});
	const back = spellcastingOf(d);
	if (back && back.name === f.name && back.desc === f.desc) return true;
	Object.assign(d, was);
	return false;
}

/** A monster (a block being edited, a template) as a draft. */
export function fromMonster5e(m: Dnd5eMonster, edition: Dnd5eEdition): Monster5eDraft {
	const d = newMonster5e(m.edition ?? edition);
	const [str, dex, con, int, wis, cha] = m.abilities;
	Object.assign(d, { str, dex, con, int, wis, cha });
	const type = (m.type ?? '').trim();
	const tm = /^(\S+)\s*(.*)$/.exec(type);
	d.name = m.name;
	d.size = SIZES.find(s => (m.size ?? '').toLowerCase().startsWith(s.toLowerCase())) ?? 'Medium';
	d.type = CREATURE_TYPES.find(t => t.toLowerCase() === (tm?.[1] ?? '').toLowerCase()) ?? (tm?.[1] ? tm[1][0].toUpperCase() + tm[1].slice(1) : 'Humanoid');
	d.tags = tm?.[2] ?? '';
	d.alignment = m.alignment ?? '';
	d.cr = m.cr;
	if (d.edition === '2024' && m.xpLair) d.lair = true;
	const hd = /^(\d+)d(\d+)/.exec(m.hpFormula ?? '');
	d.hitDice = hd ? Number(hd[1]) : undefined;
	if (!hd || hpOf(d).hp !== m.hp) d.hp = m.hp;

	// AC: armor (and a shield) when they make the AC and its note (2014) or gear (2024); else as written.
	d.gear = m.gear ?? '';
	d.ac = m.ac;
	d.acNote = m.acNote ?? '';
	const note = (m.acNote ?? '').toLowerCase();
	const gearItems = (m.gear ?? '').split(',').map(s => s.trim()).filter(Boolean);
	const inGear = (a: string) => gearItems.some(g => g.toLowerCase().startsWith(armorWord(a)));
	const candidates = ['natural', ...Object.keys(ARMOR_5E)].filter(a => (d.edition === '2014' ? note.includes(a === 'natural' ? 'natural armor' : a.toLowerCase()) : a !== 'natural' && inGear(a)));
	for (const armor of candidates.length ? candidates : ['']) {
		const shield = d.edition === '2014' ? /\bshield\b/.test(note) : gearItems.some(g => g.toLowerCase() === 'shield');
		const rest = gearItems.filter(g => !(ARMOR_5E[armor] && g.toLowerCase().startsWith(armorWord(armor))) && !(shield && g.toLowerCase() === 'shield'));
		const trial: Monster5eDraft = { ...d, armor, shield, ac: armor === 'natural' ? m.ac : undefined, acNote: '', gear: rest.join(', ') };
		if (acOf(trial) === m.ac && acNoteOf(trial) === (m.acNote ?? '') && gearOf(trial) === (m.gear ?? '')) {
			Object.assign(d, { armor, shield, ac: trial.ac, acNote: '', gear: trial.gear });
			break;
		}
	}

	// Initiative (2024): proficiency once or twice, else typed.
	if (m.initiative !== undefined) {
		const over = m.initiative - abilityMod(dex);
		const pb = pbForCr(m.cr);
		if (over === pb) d.initProf = 1; else if (over === 2 * pb) d.initProf = 2; else d.init = m.initiative;
	}

	// Speed: as fields when they write it back the same.
	const sp = m.speed ?? '30 ft.';
	const trySpeed: Monster5eDraft = { ...d, walk: undefined, speed: '', hover: false };
	let ok = true;
	for (const part of sp.split(/,\s*/)) {
		const w = /^(\d+) ft\.$/.exec(part);
		const k = /^(burrow|climb|fly|swim) (\d+) ft\.( \(hover\))?$/i.exec(part);
		if (w && trySpeed.walk === undefined) trySpeed.walk = Number(w[1]);
		else if (k && !(k[3] && k[1].toLowerCase() !== 'fly')) { trySpeed[k[1].toLowerCase() as 'fly'] = Number(k[2]); if (k[3]) trySpeed.hover = true; }
		else ok = false;
	}
	if (ok && speedOf(trySpeed) === sp) Object.assign(d, { walk: trySpeed.walk, burrow: trySpeed.burrow, climb: trySpeed.climb, fly: trySpeed.fly, swim: trySpeed.swim, hover: trySpeed.hover, speed: '' });
	else Object.assign(d, { walk: undefined, speed: sp });

	d.saves = ABILITIES.filter(a => m.saves?.[a] !== undefined).map(a => ABILITY_SHORT[a]);
	const pb = pbForCr(m.cr);
	d.skills = [];
	d.expertise = [];
	for (const [s, v] of Object.entries(m.skills ?? {})) {
		const base = abilityMod(m.abilities[ABILITIES.indexOf(SKILL_ABILITY[s] ?? 'wis')]);
		if (v >= base + 2 * pb) d.expertise.push(s); else d.skills.push(s);
	}

	// Damage types and conditions as chips; anything else as written.
	const split = (xs: string[] | undefined, known: readonly string[]) => {
		const chips: string[] = [], other: string[] = [];
		for (const x of xs ?? []) { const k = known.find(t => t.toLowerCase() === x.trim().toLowerCase()); if (k) chips.push(k); else other.push(x); }
		return { chips, text: other.join(other.some(x => x.includes(',')) ? '; ' : ', ') };
	};
	const r = split(m.resistances, DAMAGE_TYPES), i = split(m.immunities, [...DAMAGE_TYPES, ...CONDITIONS_5E]), v = split(m.vulnerabilities, DAMAGE_TYPES), c = split(m.conditionImmunities, CONDITIONS_5E);
	// 2024 blocks put conditions in Immunities: they stay there.
	Object.assign(d, { resist: r.chips, resistances: r.text, immune: i.chips, immunities: i.text, vulnerable: v.chips, vulnerabilities: v.text, condImmune: c.chips, conditionImmunities: c.text });

	// Senses: as fields when every one of them is a sense the builder knows.
	const senses = (m.senses ?? '').split(/[,;]\s*/).map(s => s.trim()).filter(s => s && !/^passive perception/i.test(s));
	const other: string[] = [];
	for (const s of senses) {
		const k = /^(blindsight|darkvision|tremorsense|truesight) (\d+) ft\.( \(blind beyond this radius\))?$/i.exec(s);
		if (k) { d[k[1].toLowerCase() as 'darkvision'] = Number(k[2]); if (k[3]) d.blind = true; } else other.push(s);
	}
	d.senses = other.join(', ');
	d.languages = m.languages ?? '';

	const feats = (xs?: Feature5e[]) => (xs ?? []).map(f => ({ ...splitUses(f.name), desc: f.desc }));
	// Spellcasting is written last of its list (2024's actions, 2014's traits), so only the last one is read as fields.
	const lastIs = (xs: Feature5e[] | undefined, f: Feature5e) => xs?.[xs.length - 1] === f;
	d.traits = feats((m.traits ?? []).filter(f => !(d.edition === '2014' && lastIs(m.traits, f) && readSpellcasting(d, f))));
	d.actions = (m.actions ?? []).filter(a => !(d.edition !== '2014' && lastIs(m.actions, a) && readSpellcasting(d, a))).map(a => {
		const { name, uses } = splitUses(a.name);
		const read = readAttack(d, name, a.desc) ?? readSave(d, name, a.desc);
		return read ? { ...read, uses } : { ...newAction5e('text'), name, uses, desc: a.desc };
	});
	d.bonusActions = feats(m.bonusActions);
	d.reactions = feats(m.reactions);
	d.legendary = feats(m.legendaryActions);
	const uses = /Legendary Action Uses:\s*(\d+)|take (\d+) legendary actions/i.exec(m.legendaryIntro ?? '');
	if (uses) d.legendaryUses = Number(uses[1] ?? uses[2]);
	if (d.edition === '2024' && /\(\d+ in Lair\)/i.test(m.legendaryIntro ?? '')) d.lair = true;
	return d;
}
