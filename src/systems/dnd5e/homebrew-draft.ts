// What 5e's spell and item builders edit, and how a draft becomes a spell or
// an item the way each edition writes one. A spell's attack or saving throw,
// damage, area and higher-level damage are worded for you (the SRD's sentences,
// each edition's way); an item's +1 and charges are too; weapons and armor get
// their numbers (damage, properties, mastery, AC, Strength, Stealth, cost and
// weight). Whatever you type yourself is kept. Pure: no Obsidian imports.

import type { Equipment5e, Item5e, Spell5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { ITEM_TYPES_5E, itemLine5e, RARITIES_5E, SPELL_CLASSES_5E } from './homebrew';
import { ABILITIES, ABILITY_NAME } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ORD = ['0th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

// ----------------------------------------------------------------------------
// Spells

export const SPELL_RANGES = ['self', 'touch', 'feet', 'miles', 'sight', 'unlimited', 'special'] as const;
export const SPELL_AREAS = ['cone', 'cube', 'cylinder', 'emanation', 'line', 'sphere'] as const;
export const SPELL_DURATIONS = ['Instantaneous', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours', '7 days', '10 days', '30 days', 'Until dispelled', 'Until dispelled or triggered', 'Special'] as const;
export const CASTING_TIMES = ['Action', 'Bonus Action', 'Reaction', '1 minute', '10 minutes', '1 hour', '8 hours', '12 hours', '24 hours'] as const;

export interface Spell5eDraft extends Record<string, unknown> {
	edition: Dnd5eEdition;
	name: string;
	level?: number;
	school: string;
	castingTime: string;
	/** A reaction's (or bonus action's) trigger: "which you take when you are hit by an attack roll". */
	trigger: string;
	/** Where it reaches: Self, Touch, so many feet or miles, Sight… */
	rangeKind: string;
	distance?: number;
	/** An area (none, cone, sphere…) and its size in feet. */
	area: string;
	areaSize?: number;
	/** A range as written that the fields above don't cover ("Self (15-foot cone)"); used when set. */
	range: string;
	components: string[];
	material: string;
	duration: string;
	concentration: boolean;
	ritual: boolean;
	classes: string[];
	/** Melee or ranged spell attack, a saving throw, or neither. */
	attack: string;
	save: string;
	dmgCount?: number;
	dmgSides: string;
	dmgType: string;
	/** On a successful save: half damage (or none). */
	half: boolean;
	/** Dice added per slot level above the spell's (0: none); cantrips grow at 5, 11 and 17. */
	upcast?: number;
	/** The worded sentence as it stood in `desc` when the spell was opened: changing the fields rewrites it in place. */
	ruleText?: string;
	desc: string;
	higherLevel: string;
}

export function newSpell5e(edition: Dnd5eEdition): Spell5eDraft {
	return {
		edition, name: '', level: 1, school: 'Evocation', castingTime: 'Action', trigger: '', rangeKind: 'feet', distance: 60, area: '', range: '', components: ['V', 'S'], material: '',
		duration: 'Instantaneous', concentration: false, ritual: false, classes: [], attack: '', save: 'dex', dmgSides: '', dmgType: 'Fire', half: true, desc: '', higherLevel: '',
	};
}

/** "150 feet", "Self", "1 mile". */
export function rangeText(d: Spell5eDraft): string {
	if (d.range.trim()) return d.range.trim();
	const n = d.distance ?? 0;
	switch (d.rangeKind) {
		case 'self': return 'Self';
		case 'touch': return 'Touch';
		case 'miles': return `${n || 1} mile${(n || 1) === 1 ? '' : 's'}`;
		case 'sight': return 'Sight';
		case 'unlimited': return 'Unlimited';
		case 'special': return 'Special';
		default: return `${n || 30} feet`;
	}
}

/** "a 20-foot-radius Sphere" (2024 capitalises the shape), or ''. */
export function areaText(d: Spell5eDraft): string {
	const n = d.areaSize ?? 0;
	if (!d.area || !n) return '';
	const shape = d.edition === '2014' ? d.area : cap(d.area);
	const size = d.area === 'line' ? `${n}-foot-long, 5-foot-wide` : ['sphere', 'cylinder'].includes(d.area) || (d.area === 'emanation' && d.edition === '2014') ? `${n}-foot-radius` : `${n}-foot`;
	return `a ${size} ${shape}`;
}

const dice = (d: Spell5eDraft) => (Number(d.dmgSides) && (d.dmgCount ?? 1) > 0 ? `${d.dmgCount ?? 1}d${d.dmgSides}` : '');
const dmgWord = (d: Spell5eDraft) => (d.edition === '2014' ? d.dmgType.toLowerCase() : cap(d.dmgType));

/** The sentence the builder writes for an attack or a saving throw and its damage, the edition's way; '' for neither. */
export function rulesSentence(d: Spell5eDraft): string {
	const dmg = dice(d);
	const save = ABILITIES.find(a => a === d.save) ?? 'dex';
	if (d.attack === 'melee' || d.attack === 'ranged') {
		const hit = dmg ? ` On a hit, the target takes ${dmg} ${dmgWord(d)} damage.` : '';
		return `Make a ${d.attack} spell attack against the target.${hit}`;
	}
	if (d.attack !== 'save') return '';
	const area = areaText(d);
	const who = area ? `Each creature in ${area}` : 'The target';
	const ab = ABILITY_NAME[save];
	if (d.edition === '2014') {
		if (!dmg) return `${who} must succeed on a ${ab} saving throw.`;
		return d.half
			? `${who} must make a ${ab} saving throw. A target takes ${dmg} ${dmgWord(d)} damage on a failed save, or half as much damage on a successful one.`
			: `${who} must succeed on a ${ab} saving throw or take ${dmg} ${dmgWord(d)} damage.`;
	}
	if (!dmg) return `${who} makes a ${ab} saving throw.`;
	return d.half
		? `${who} makes a ${ab} saving throw, taking ${dmg} ${dmgWord(d)} damage on a failed save or half as much damage on a successful one.`
		: `${who} makes a ${ab} saving throw. On a failed save, ${area ? 'a creature' : 'the target'} takes ${dmg} ${dmgWord(d)} damage.`;
}

/** Higher-level damage, worded: per slot level (a levelled spell) or at 5, 11 and 17 (a cantrip); '' for none. */
export function upcastSentence(d: Spell5eDraft): string {
	const sides = Number(d.dmgSides);
	if (!sides || !d.upcast || !d.attack) return '';
	const lv = d.level ?? 1;
	if (lv === 0) {
		const n = d.upcast;
		const at = [5, 11, 17].map((l, i) => [l, `${n * (i + 2)}d${sides}`] as const);
		if (d.edition === '2014') return `This spell's damage increases by ${n}d${sides} when you reach 5th level (${at[0][1]}), 11th level (${at[1][1]}), and 17th level (${at[2][1]}).`;
		return `The damage increases by ${n}d${sides} when you reach levels 5 (${at[0][1]}), 11 (${at[1][1]}), and 17 (${at[2][1]}).`;
	}
	if (d.edition === '2014') return `When you cast this spell using a spell slot of ${ORD[Math.min(9, lv + 1)]} level or higher, the damage increases by ${d.upcast}d${sides} for each slot level above ${ORD[lv]}.`;
	return `The damage increases by ${d.upcast}d${sides} for each spell slot level above ${lv}.`;
}

/**
 * The spell's text: what you wrote, with the worded attack or save at the end of its first paragraph (or where it
 * already stood in a spell opened in the builder, rewritten in place).
 */
export function spellDesc(d: Spell5eDraft): string {
	const rules = rulesSentence(d);
	const text = d.desc.trim();
	if (d.ruleText && text.includes(d.ruleText)) return rules ? text.replace(d.ruleText, rules) : text.replace(` ${d.ruleText}`, '').replace(d.ruleText, '').trim();
	if (!rules) return text;
	if (!text) return rules;
	const nl = text.indexOf('\n');
	return nl < 0 ? `${text} ${rules}` : `${text.slice(0, nl).trimEnd()} ${rules}${text.slice(nl)}`;
}

/** "Reaction, which you take when…"; 2014 says "1 reaction". */
export function castingText(d: Spell5eDraft): string {
	const base = d.edition === '2014' && /^(action|bonus action|reaction)$/i.test(d.castingTime) ? `1 ${d.castingTime.toLowerCase()}` : d.castingTime;
	const trigger = d.trigger.trim().replace(/^,\s*/, '');
	return /reaction|bonus action/i.test(d.castingTime) && trigger ? `${base}, ${/^which/i.test(trigger) ? trigger : `which you take ${trigger}`}` : base;
}

/** The draft as a spell. 2014 writes "1 action" and "Concentration, up to 1 minute"; so does this. */
export function toSpell5e(d: Spell5eDraft): Spell5e {
	const comps = ['V', 'S', 'M'].filter(c => d.components.includes(c)).map(c => (c === 'M' && d.material.trim() ? `M (${d.material.trim()})` : c)).join(', ') || 'V';
	const duration = d.concentration && !/^concentration/i.test(d.duration) ? `Concentration, up to ${d.duration.replace(/^up to\s+/i, '')}` : d.duration;
	const s: Spell5e = {
		name: d.name.trim() || 'Spell', level: d.level ?? 1, school: d.school, castingTime: castingText(d), range: rangeText(d), components: comps,
		duration: duration.trim() || 'Instantaneous', desc: spellDesc(d), classes: SPELL_CLASSES_5E.filter(c => d.classes.includes(c)),
	};
	const higher = d.higherLevel.trim() || upcastSentence(d);
	if (higher) s.higherLevel = higher;
	if (d.concentration || /^concentration/i.test(duration)) s.concentration = true;
	if (d.ritual) s.ritual = true;
	return s;
}

/** A spell (a block being edited, an SRD spell as a template) as a draft. Worded parts it would write the same way become fields again. */
export function fromSpell5e(s: Spell5e, edition: Dnd5eEdition): Spell5eDraft {
	const m = /\bM\s*\(([^)]*)\)/.exec(s.components);
	const ct = /^(?:1 )?(action|bonus action|reaction)(?:,\s*(.*))?$/i.exec(s.castingTime);
	const d: Spell5eDraft = {
		...newSpell5e(edition), name: s.name, level: s.level, school: s.school,
		castingTime: ct ? ct[1].replace(/\b\w/g, c => c.toUpperCase()) : s.castingTime, trigger: ct?.[2] ?? '',
		components: ['V', 'S', 'M'].filter(c => new RegExp(`\\b${c}\\b`).test(s.components)), material: m?.[1] ?? '',
		duration: s.duration.replace(/^concentration,\s*up to\s+/i, ''), concentration: !!s.concentration, ritual: !!s.ritual, classes: [...s.classes], desc: s.desc, higherLevel: s.higherLevel ?? '',
	};
	// The range: as fields when they write it the same, else as written.
	const r = /^(\d+) (feet|miles?)$/.exec(s.range);
	Object.assign(d, r ? { rangeKind: r[2] === 'feet' ? 'feet' : 'miles', distance: Number(r[1]), range: '' } : { rangeKind: 'feet', range: s.range });
	for (const k of ['self', 'touch', 'sight', 'unlimited', 'special']) if (s.range.toLowerCase() === k) Object.assign(d, { rangeKind: k, range: '' });
	if (rangeText(d) !== s.range) Object.assign(d, { range: s.range });
	// The attack or save and its damage: fields again when the text holds the sentence the builder would write.
	const atk = /Make a (melee|ranged) spell attack/i.exec(s.desc)?.[1]?.toLowerCase();
	const sv = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(s.desc)?.[1];
	const dm = /(\d+)d(\d+) (\w+) damage/.exec(s.desc);
	const ar = /Each creature in an? (\d+)-foot(?:-radius|-long, 5-foot-wide)? (cone|cube|cylinder|emanation|line|sphere)/i.exec(s.desc);
	const guess: Spell5eDraft = {
		...d, attack: atk ?? (sv ? 'save' : ''), save: sv ? ABILITIES.find(a => ABILITY_NAME[a].toLowerCase() === sv.toLowerCase()) ?? 'dex' : 'dex',
		dmgCount: dm ? Number(dm[1]) : undefined, dmgSides: dm?.[2] ?? '', dmgType: dm ? cap(dm[3].toLowerCase()) : 'Fire', half: /half as much/i.test(s.desc),
		area: ar ? ar[2].toLowerCase() : '', areaSize: ar ? Number(ar[1]) : undefined,
	};
	const sentence = rulesSentence(guess);
	if (sentence && s.desc.includes(sentence)) Object.assign(d, guess, { ruleText: sentence });
	// Higher-level damage: a field when the sentence is the builder's.
	if (d.attack && d.higherLevel) {
		const up = /increases by (\d+)d\d+/.exec(d.higherLevel);
		if (up && upcastSentence({ ...d, upcast: Number(up[1]) }) === d.higherLevel) Object.assign(d, { upcast: Number(up[1]), higherLevel: '' });
	}
	return d;
}

// ----------------------------------------------------------------------------
// Items: magic items, and weapons, armor and gear

export const ITEM_KINDS = ['magic', 'weapon', 'armor', 'gear'] as const;
export const WEAPON_PROPERTIES_5E = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Range', 'Reach', 'Special', 'Thrown', 'Two-Handed', 'Versatile'] as const;
/** The properties each edition's SRD has (2014's Special lance and net; 2024's Range). */
export const weaponProperties5e = (edition: Dnd5eEdition) => WEAPON_PROPERTIES_5E.filter(p => (edition === '2014' ? p !== 'Range' : p !== 'Special'));
export const MASTERIES_5E = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'] as const;
export const ARMOR_CATEGORIES_5E = ['Light', 'Medium', 'Heavy', 'Shield'] as const;
/** The book's rarity for a +1, +2 or +3 weapon (and ammunition), and for armor and a shield. */
export const BONUS_RARITY: Record<string, [string, string, string]> = {
	Weapon: ['Uncommon', 'Rare', 'Very Rare'], Ammunition: ['Uncommon', 'Rare', 'Very Rare'], Armor: ['Rare', 'Very Rare', 'Legendary'], Shield: ['Uncommon', 'Rare', 'Very Rare'],
};

export interface Item5eDraft extends Record<string, unknown> {
	edition: Dnd5eEdition;
	name: string;
	/** A magic item, or a weapon, armor or gear (equipment with its own numbers). */
	kind: string;
	type: string;
	/** "(Longsword)", "(any heavy armor)". */
	subtype: string;
	rarity: string;
	attunement: boolean;
	attunedBy: string;
	/** A magic weapon, armor or shield's +1, +2 or +3. */
	bonus?: number;
	charges?: number;
	/** "1d6 + 1": charges regained daily at dawn. */
	regain: string;
	desc: string;
	// Weapons
	weaponCategory: string;
	ranged: boolean;
	dmgCount?: number;
	dmgSides: string;
	dmgType: string;
	properties: string[];
	versatile: string;
	rangeNormal?: number;
	rangeLong?: number;
	mastery: string;
	// Armor
	armorCategory: string;
	acBase?: number;
	strMin?: number;
	stealth: boolean;
	cost: string;
	weight?: number;
}

export function newItem5e(edition: Dnd5eEdition): Item5eDraft {
	return {
		edition, name: '', kind: 'magic', type: 'Wondrous item', subtype: '', rarity: 'Uncommon', attunement: false, attunedBy: '', regain: '', desc: '',
		weaponCategory: 'Martial', ranged: false, dmgCount: 1, dmgSides: '8', dmgType: 'Slashing', properties: [], versatile: '', mastery: '',
		armorCategory: 'Light', stealth: false, cost: '',
	};
}

export function itemTypeText(d: Item5eDraft): string {
	const sub = d.subtype.trim();
	return sub ? `${d.type} ${/^\(.*\)$/.test(sub) ? sub : `(${sub})`}` : d.type;
}

/** The +N sentence for a magic weapon, ammunition, armor or shield; '' otherwise. */
export function bonusSentence(d: Item5eDraft): string {
	const n = d.bonus ?? 0;
	if (!n) return '';
	const shield = /shield/i.test(d.subtype) || /shield/i.test(d.type);
	if (d.type === 'Weapon') return d.edition === '2014' ? `You have a +${n} bonus to attack and damage rolls made with this magic weapon.` : `You have a +${n} bonus to attack rolls and damage rolls made with this magic weapon.`;
	if (d.type === 'Ammunition') return `You have a +${n} bonus to attack and damage rolls made with this piece of magic ammunition.`;
	if (d.type === 'Armor' && shield) return `While holding this shield, you have a +${n} bonus to Armor Class. This bonus is in addition to the shield's normal bonus to AC.`;
	if (d.type === 'Armor') return `You have a +${n} bonus to Armor Class while wearing this armor.`;
	return '';
}

/** The charges sentence: "This wand has 7 charges and regains 1d6 + 1 expended charges daily at dawn." */
export function chargesSentence(d: Item5eDraft): string {
	const n = d.charges ?? 0;
	if (!n) return '';
	const what = ['Wondrous item', 'Weapon', 'Armor', 'Ammunition'].includes(d.type) ? 'item' : d.type.toLowerCase();
	const regain = d.regain.trim();
	return `This ${what} has ${n} charge${n === 1 ? '' : 's'}${regain ? ` and regains ${regain} expended charges daily at dawn` : ''}.`;
}

/** The item's text: the +N first, what you wrote, then its charges. */
export function itemDesc(d: Item5eDraft): string {
	return [bonusSentence(d), d.desc.trim(), chargesSentence(d)].filter(Boolean).join('\n\n');
}

export function toItem5e(d: Item5eDraft): Item5e {
	const att = { on: d.attunement, by: d.attunedBy.trim() || undefined };
	const item: Item5e = { name: d.name.trim() || 'Item', type: itemTypeText(d), rarity: d.rarity, desc: itemDesc(d), line: itemLine5e(itemTypeText(d), d.rarity, att, d.edition) };
	if (d.attunement) item.attunement = true;
	return item;
}

export function fromItem5e(i: Item5e, edition: Dnd5eEdition): Item5eDraft {
	const m = /^(.*?)\s*(\(.*\))?$/.exec(i.type.trim());
	const by = /requires attunement by ([^)]*)\)/i.exec(i.line ?? '')?.[1];
	const d: Item5eDraft = {
		...newItem5e(edition), name: i.name, type: ITEM_TYPES_5E.find(t => t.toLowerCase() === (m?.[1] ?? '').toLowerCase().replace(/s$/, '')) ?? (m?.[1] || 'Wondrous item'),
		subtype: m?.[2] ?? '', rarity: RARITIES_5E.find(r => r.toLowerCase() === i.rarity.toLowerCase()) ?? i.rarity, attunement: !!i.attunement, attunedBy: by ?? '', desc: i.desc,
	};
	// The +N and charges sentences become fields again when they're the builder's.
	const paras = i.desc.split(/\n\s*\n/);
	const bonus = /\+(\d) bonus/.exec(paras[0] ?? '');
	if (bonus && bonusSentence({ ...d, bonus: Number(bonus[1]) }) === paras[0]) { d.bonus = Number(bonus[1]); paras.shift(); }
	const last = paras[paras.length - 1] ?? '';
	const ch = /has (\d+) charges?(?: and regains (.*) expended charges daily at dawn)?\.$/.exec(last);
	if (ch && chargesSentence({ ...d, charges: Number(ch[1]), regain: ch[2] ?? '' }) === last) { d.charges = Number(ch[1]); d.regain = ch[2] ?? ''; paras.pop(); }
	d.desc = paras.join('\n\n');
	if (itemDesc(d) !== i.desc.trim()) Object.assign(d, { bonus: undefined, charges: undefined, regain: '', desc: i.desc });
	return d;
}

// Equipment ------------------------------------------------------------------

/** "Martial Melee Weapon", "Light Armor", "Shield", "Adventuring Gear". */
export function equipmentCategory(d: Item5eDraft): string {
	if (d.kind === 'weapon') return `${d.weaponCategory} ${d.ranged ? 'Ranged' : 'Melee'} Weapon`;
	if (d.kind === 'armor') return d.armorCategory === 'Shield' ? 'Shield' : `${d.armorCategory} Armor`;
	return 'Adventuring Gear';
}

/** The draft as equipment (a weapon, armor or gear), shaped like the SRD's. */
export function toEquipment5e(d: Item5eDraft): Equipment5e {
	const e: Equipment5e = { name: d.name.trim() || 'Item', category: equipmentCategory(d) };
	if (d.cost.trim()) e.cost = d.cost.trim();
	if (d.weight !== undefined) e.weight = d.weight;
	if (d.kind === 'weapon') {
		e.weaponCategory = d.weaponCategory;
		e.weaponRange = d.ranged ? 'Ranged' : 'Melee';
		const sides = Number(d.dmgSides) || 6;
		e.damage = `${Math.max(1, d.dmgCount ?? 1)}d${sides} ${d.dmgType.toLowerCase()}`;
		const props = WEAPON_PROPERTIES_5E.filter(p => d.properties.includes(p));
		if (props.length) e.properties = [...props];
		if (props.includes('Versatile') && d.versatile.trim()) e.versatile = d.versatile.trim();
		if ((props.includes('Thrown') || props.includes('Ammunition') || props.includes('Range') || d.ranged) && d.rangeNormal) e.range = `${d.rangeNormal}${d.rangeLong ? `/${d.rangeLong}` : ''}`;
		if (d.edition === '2024' && d.mastery) e.mastery = d.mastery;
	}
	if (d.kind === 'armor') {
		const shield = d.armorCategory === 'Shield';
		e.armorCategory = d.armorCategory;
		e.ac = shield ? { base: d.acBase ?? 2, dex: false } : { base: d.acBase ?? 11, dex: d.armorCategory !== 'Heavy', ...(d.armorCategory === 'Medium' ? { max: 2 } : {}) };
		if (d.strMin) e.strMin = d.strMin;
		if (d.stealth) e.stealthDisadvantage = true;
	}
	if (d.desc.trim()) e.desc = d.desc.trim();
	return e;
}

export function fromEquipment5e(e: Equipment5e, edition: Dnd5eEdition): Item5eDraft {
	const d: Item5eDraft = { ...newItem5e(edition), name: e.name, cost: e.cost ?? '', weight: e.weight, desc: e.desc ?? '' };
	const cat = `${e.category} ${e.weaponCategory ?? ''} ${e.armorCategory ?? ''} ${(e.tags ?? []).join(' ')}`;
	if (e.damage) {
		const dm = /^(\d+)d(\d+)\s+(\w+)/.exec(e.damage);
		Object.assign(d, {
			kind: 'weapon', weaponCategory: /martial/i.test(cat) ? 'Martial' : 'Simple', ranged: /ranged/i.test(e.weaponRange ?? cat),
			dmgCount: dm ? Number(dm[1]) : 1, dmgSides: dm?.[2] ?? '6', dmgType: dm ? cap(dm[3]) : 'Slashing',
			properties: (e.properties ?? []).map(p => WEAPON_PROPERTIES_5E.find(x => p.toLowerCase().startsWith(x.toLowerCase())) ?? p), versatile: e.versatile ?? '', mastery: e.mastery ?? '',
		});
		const r = /^(\d+)(?:\/(\d+))?/.exec(e.range ?? '');
		if (r) Object.assign(d, { rangeNormal: Number(r[1]), rangeLong: r[2] ? Number(r[2]) : undefined });
	} else if (e.ac) {
		// The AC says which: Dex in full is light, up to 2 medium, none heavy (the data's tags aren't always right).
		const shield = /shield/i.test(cat);
		Object.assign(d, {
			kind: 'armor', armorCategory: shield ? 'Shield' : e.ac.dex ? (e.ac.max !== undefined ? 'Medium' : 'Light') : 'Heavy',
			acBase: e.ac.base, strMin: e.strMin, stealth: !!e.stealthDisadvantage,
		});
	} else d.kind = 'gear';
	return d;
}
