// What 5e's builders edit, and the formulas that turn a draft into a stat
// block: hit points from hit dice and Constitution, proficiency and XP from the
// challenge rating, saves and skills from abilities, passive Perception, and
// attacks written the way each edition prints them. Pure: no Obsidian imports.

import type { Draft } from '../../core/builder/schema';
import { averageRoll } from './parser';
import { abilityMod, crValue, formatMod, pbForCr, xpForCr } from './rules';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, AbilityKey, Dnd5eMonster, Feature5e } from './types';

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
export const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'] as const;
export const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'] as const;
export const ABILITY_SHORT: Record<AbilityKey, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
export const SKILL_ABILITY: Record<string, AbilityKey> = {
	Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis', Intimidation: 'cha',
	Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha', Religion: 'int', 'Sleight of Hand': 'dex',
	Stealth: 'dex', Survival: 'wis',
};

/** Hit die by size. */
export const HIT_DIE: Record<string, number> = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };

export interface Feature5eDraft extends Draft { name: string; desc: string }

/** An action: an attack the builder words, or text as typed. */
export interface Action5eDraft extends Draft {
	name: string;
	kind: 'melee' | 'ranged' | 'text';
	/** The attack's ability; `finesse` takes the better of Str and Dex. */
	ability: AbilityKey | 'finesse';
	reach?: number;
	/** "80/320". */
	range: string;
	count?: number;
	sides: string;
	damageType: string;
	/** After the damage: "If the target is a creature, it has the Prone condition." */
	extra: string;
	/** For `text` actions (Multiattack, breath weapons…). */
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
	ac?: number;
	acNote: string;
	hitDice?: number;
	/** Typed HP, instead of the hit dice's average. */
	hp?: number;
	speed: string;
	str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
	/** Proficient saves: "Str", "Dex"… */
	saves: string[];
	skills: string[];
	/** Skills with double proficiency. */
	expertise: string[];
	resistances: string;
	immunities: string;
	vulnerabilities: string;
	conditionImmunities: string;
	senses: string;
	languages: string;
	gear: string;
	traits: Feature5eDraft[];
	actions: Action5eDraft[];
	bonusActions: Feature5eDraft[];
	reactions: Feature5eDraft[];
	legendary: Feature5eDraft[];
	legendaryUses?: number;
}

export function newAction5e(kind: Action5eDraft['kind'] = 'melee'): Action5eDraft {
	return { name: '', kind, ability: 'str', reach: 5, range: '80/320', count: 1, sides: '6', damageType: kind === 'ranged' ? 'Piercing' : 'Slashing', extra: '', desc: '' };
}

export function newFeature5e(): Feature5eDraft {
	return { name: '', desc: '' };
}

export function newMonster5e(edition: Dnd5eEdition): Monster5eDraft {
	return {
		edition, name: '', size: 'Medium', type: 'Humanoid', tags: '', alignment: 'Neutral', cr: '1', acNote: '', speed: '30 ft.',
		hitDice: 4, saves: [], skills: [], expertise: [], resistances: '', immunities: '', vulnerabilities: '', conditionImmunities: '',
		senses: '', languages: 'Common', gear: '', traits: [], actions: [{ ...newAction5e(), name: 'Strike' }], bonusActions: [], reactions: [], legendary: [],
	};
}

const score = (d: Monster5eDraft, a: AbilityKey) => d[a] ?? 10;
/** "+ 3", "- 1" (2014) or "− 1" (2024): how each edition writes a modifier inside dice. */
const plus = (d: Monster5eDraft, n: number) => (n ? ` ${n > 0 ? '+' : d.edition === '2014' ? '-' : '−'} ${Math.abs(n)}` : '');
export const modOf = (d: Monster5eDraft, a: AbilityKey) => abilityMod(score(d, a));
export const pbOf = (d: Monster5eDraft) => pbForCr(d.cr);

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

/** The ability an attack uses (finesse: the better of Str and Dex). */
export function attackAbility(d: Monster5eDraft, a: Action5eDraft): AbilityKey {
	if (a.ability !== 'finesse') return a.ability;
	return modOf(d, 'dex') > modOf(d, 'str') ? 'dex' : 'str';
}

export function toHit(d: Monster5eDraft, a: Action5eDraft): number {
	return modOf(d, attackAbility(d, a)) + pbOf(d);
}

/** "6 (1d6 + 3)". */
export function damageText(d: Monster5eDraft, a: Action5eDraft): string {
	const n = Math.max(1, a.count ?? 1);
	const sides = Number(a.sides) || 6;
	const mod = modOf(d, attackAbility(d, a));
	const formula = `${n}d${sides}${plus(d, mod)}`;
	const avg = Math.max(1, (averageRoll(`${n}d${sides}`) ?? n) + mod);
	return `${avg} (${formula})`;
}

/** An attack, worded the way the edition prints it. */
export function attackText(d: Monster5eDraft, a: Action5eDraft): string {
	if (a.kind === 'text') return a.desc.trim();
	const ranged = a.kind === 'ranged';
	const where = ranged ? `range ${a.range.trim() || '30/120'} ft.` : `reach ${a.reach ?? 5} ft.`;
	const hit = formatMod(toHit(d, a));
	const dmg = damageText(d, a);
	const type = a.damageType.trim() || 'Bludgeoning';
	const extra = a.extra.trim() ? ` ${a.extra.trim()}` : '';
	if (d.edition === '2014') {
		return `${ranged ? 'Ranged' : 'Melee'} Weapon Attack: ${hit} to hit, ${where}, one target. Hit: ${dmg} ${type.toLowerCase()} damage.${extra}`;
	}
	return `${ranged ? 'Ranged' : 'Melee'} Attack Roll: ${hit}, ${where} Hit: ${dmg} ${type} damage.${extra}`;
}

const listOf = (s: string) => s.split(/[;,]/).map(x => x.trim()).filter(Boolean);
const features = (xs: Feature5eDraft[]): Feature5e[] => xs.filter(f => f.name.trim() || f.desc.trim()).map(f => ({ name: f.name.trim() || 'Feature', desc: f.desc.trim() }));

/** The draft as a monster. */
export function toMonster5e(d: Monster5eDraft): Dnd5eMonster {
	const name = d.name.trim() || 'Monster';
	const { hp, formula } = hpOf(d);
	const saves: Partial<Record<AbilityKey, number>> = {};
	for (const a of ABILITIES) if (d.saves.includes(ABILITY_SHORT[a])) saves[a] = saveBonus(d, a);
	const skills: Record<string, number> = {};
	for (const s of Object.keys(SKILL_ABILITY)) if (d.skills.includes(s) || d.expertise.includes(s)) skills[s] = skillBonus(d, s);
	const senses = [d.senses.trim(), `Passive Perception ${passivePerception(d)}`].filter(Boolean).join(', ');
	const cr = crValue(d.cr) !== undefined ? d.cr : '0';
	const m: Dnd5eMonster = {
		name,
		size: d.size,
		type: [d.type.toLowerCase(), d.tags.trim()].filter(Boolean).join(' '),
		alignment: d.alignment.trim() || undefined,
		ac: d.ac ?? 10 + modOf(d, 'dex'),
		acNote: d.acNote.trim() || undefined,
		hp,
		hpFormula: formula,
		speed: d.speed.trim() || '30 ft.',
		abilities: ABILITIES.map(a => score(d, a)) as Dnd5eMonster['abilities'],
		cr,
		senses,
		languages: d.languages.trim() || '—',
		xp: xpForCr(cr),
		pb: pbForCr(cr),
		edition: d.edition,
	};
	// The shape the parser reads back: no empty properties.
	for (const k of Object.keys(m) as (keyof Dnd5eMonster)[]) if (m[k] === undefined) delete m[k];
	if (Object.keys(saves).length) m.saves = saves;
	if (Object.keys(skills).length) m.skills = skills;
	const res = listOf(d.resistances), imm = listOf(d.immunities), vul = listOf(d.vulnerabilities), cond = listOf(d.conditionImmunities);
	if (res.length) m.resistances = res;
	if (imm.length) m.immunities = imm;
	if (vul.length) m.vulnerabilities = vul;
	if (cond.length) m.conditionImmunities = cond;
	if (d.edition === '2024' && d.gear.trim()) m.gear = d.gear.trim();
	const traits = features(d.traits);
	const actions = d.actions.filter(a => a.name.trim() || a.desc.trim()).map(a => ({ name: a.name.trim() || 'Attack', desc: attackText(d, a) }));
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
			: `Legendary Action Uses: ${uses}. Immediately after another creature's turn, the ${who} can expend a use to take one of the following actions. The ${who} regains all expended uses at the start of each of its turns.`;
	}
	return m;
}

/** XP shown in the builder's check. */
export function xpOfDraft(d: Monster5eDraft): number {
	return xpForCr(d.cr);
}

/** A monster (a block being edited, a template) as a draft. Actions stay as written. */
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
	d.ac = m.ac;
	d.acNote = m.acNote ?? '';
	const hd = /^(\d+)d(\d+)/.exec(m.hpFormula ?? '');
	d.hitDice = hd ? Number(hd[1]) : undefined;
	if (!hd || hpOf(d).hp !== m.hp) d.hp = m.hp;
	d.speed = m.speed ?? '30 ft.';
	d.saves = ABILITIES.filter(a => m.saves?.[a] !== undefined).map(a => ABILITY_SHORT[a]);
	const pb = pbForCr(m.cr);
	d.skills = [];
	d.expertise = [];
	for (const [s, v] of Object.entries(m.skills ?? {})) {
		const base = abilityMod(m.abilities[ABILITIES.indexOf(SKILL_ABILITY[s] ?? 'wis')]);
		if (v >= base + 2 * pb) d.expertise.push(s); else d.skills.push(s);
	}
	const join = (xs?: string[]) => (xs ?? []).join(xs?.some(x => x.includes(',')) ? '; ' : ', ');
	d.resistances = join(m.resistances);
	d.immunities = join(m.immunities);
	d.vulnerabilities = join(m.vulnerabilities);
	d.conditionImmunities = join(m.conditionImmunities);
	d.senses = (m.senses ?? '').split(/,\s*/).filter(s => !/^passive perception/i.test(s.trim())).join(', ');
	d.languages = m.languages ?? '';
	d.gear = m.gear ?? '';
	const feats = (xs?: Feature5e[]) => (xs ?? []).map(f => ({ name: f.name, desc: f.desc }));
	d.traits = feats(m.traits);
	d.actions = (m.actions ?? []).map(a => ({ ...newAction5e('text'), name: a.name, desc: a.desc }));
	d.bonusActions = feats(m.bonusActions);
	d.reactions = feats(m.reactions);
	d.legendary = feats(m.legendaryActions);
	const uses = /Legendary Action Uses:\s*(\d+)|take (\d+) legendary actions/i.exec(m.legendaryIntro ?? '');
	if (uses) d.legendaryUses = Number(uses[1] ?? uses[2]);
	return d;
}
