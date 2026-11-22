// Your own 5e spells and magic items, written in notes:
//
//   ```5e-spell
//   name: Ember Lash
//   level: 2
//   school: Evocation
//   casting time: Action
//   range: 60 feet
//   components: V, S, M (a pinch of ash)
//   duration: Concentration, up to 1 minute
//   classes: Sorcerer, Wizard
//
//   A whip of fire lashes out…
//
//   Using a Higher-Level Spell Slot: The damage increases by 1d6 for each spell slot level above 2.
//   ```
//
//   ```5e-item
//   name: Ember Blade
//   type: Weapon (Longsword)
//   rarity: Rare
//   attunement: yes
//
//   You gain a +1 bonus to attack and damage rolls…
//   ```
//
// The properties come first, one per line; everything after the first blank
// line is the text. A note's spell or item replaces the SRD's of the same name.
// One imported from a D&D Beyond character says so after its name
// (`imported: D&D Beyond`, `ddbId: 2120`), and is tagged Imported.
// Pure: no Obsidian imports.

import type { Equipment5e, Item5e, Spell5e } from './compendium';
import { HOMEBREW, IMPORTED } from '../../core/content/blocks';
import type { Dnd5eEdition } from './editions';

export const SPELL_LANG = '5e-spell';
export const ITEM_LANG = '5e-item';

export const SCHOOLS_5E = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] as const;
export const SPELL_CLASSES_5E = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'] as const;
export const ITEM_TYPES_5E = ['Wondrous item', 'Armor', 'Weapon', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Ammunition'] as const;
export const RARITIES_5E = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'] as const;

const HIGHER = /^(?:\*\*)?(Using a Higher-Level Spell Slot|At Higher Levels|Cantrip Upgrade)[.:]?(?:\*\*)?[.:]?\s*/i;

/** Properties (key: value lines up to the first blank line) and the text after them. */
function split(source: string): { props: Map<string, string>; text: string } {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const props = new Map<string, string>();
	let i = 0;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) { i++; break; }
		const m = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(line);
		if (!m) break;
		props.set(m[1].toLowerCase(), m[2].trim());
	}
	return { props, text: lines.slice(i).join('\n').trim() };
}

const yes = (v: string | undefined) => !!v && !/^(no|false|0|none)$/i.test(v.trim());

/** Where an imported block came from (`imported: D&D Beyond`, `ddbId: 2120`), when it says. */
function originOf(props: Map<string, string>): { imported?: string; ddbId?: number } {
	const imported = props.get('imported')?.trim();
	const id = Number(props.get('ddbid'));
	return { ...(imported ? { imported } : {}), ...(Number.isFinite(id) && props.get('ddbid')?.trim() ? { ddbId: id } : {}) };
}

/** The lines that say where an imported block came from, after its name. */
function originLines(x: { imported?: string; ddbId?: number }): string[] {
	return [...(x.imported ? [`imported: ${x.imported}`] : []), ...(x.ddbId !== undefined ? [`ddbId: ${x.ddbId}`] : [])];
}
const list = (v: string | undefined) => (v ?? '').split(',').map(x => x.trim()).filter(Boolean);

export function parseSpell5e(source: string): Spell5e | null {
	const { props, text } = split(source);
	const name = props.get('name');
	if (!name) return null;
	const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
	const hi = paras.findIndex(p => HIGHER.test(p));
	const desc = (hi >= 0 ? paras.slice(0, hi) : paras).join('\n\n');
	const level = /cantrip/i.test(props.get('level') ?? '') ? 0 : Math.max(0, Math.min(9, parseInt(props.get('level') ?? '1', 10) || 0));
	const duration = props.get('duration') ?? 'Instantaneous';
	const spell: Spell5e = {
		name, level,
		school: props.get('school') ?? 'Evocation',
		castingTime: props.get('casting time') ?? props.get('casting') ?? 'Action',
		range: props.get('range') ?? 'Self',
		components: props.get('components') ?? 'V, S',
		duration,
		desc,
		classes: list(props.get('classes')),
	};
	if (hi >= 0) spell.higherLevel = paras.slice(hi).join('\n\n').replace(HIGHER, '');
	if (/^concentration/i.test(duration) || yes(props.get('concentration'))) spell.concentration = true;
	if (yes(props.get('ritual'))) spell.ritual = true;
	return Object.assign(spell, originOf(props));
}

/** A spell as ```5e-spell block text (the body). The higher-level paragraph is worded for the edition. */
export function spellSource5e(s: Spell5e, edition: Dnd5eEdition = '2024'): string {
	const lines = [
		`name: ${s.name}`,
		...originLines(s),
		`level: ${s.level === 0 ? 'cantrip' : s.level}`,
		`school: ${s.school}`,
		`casting time: ${s.castingTime}`,
		`range: ${s.range}`,
		`components: ${s.components}`,
		`duration: ${s.duration}`,
	];
	if (s.classes.length) lines.push(`classes: ${s.classes.join(', ')}`);
	if (s.ritual) lines.push('ritual: yes');
	if (s.concentration && !/^concentration/i.test(s.duration)) lines.push('concentration: yes');
	const body = [s.desc.trim()];
	if (s.higherLevel?.trim()) body.push(`${s.level === 0 ? 'Cantrip Upgrade' : edition === '2014' ? 'At Higher Levels' : 'Using a Higher-Level Spell Slot'}: ${s.higherLevel.trim()}`);
	return `${lines.join('\n')}\n\n${body.filter(Boolean).join('\n\n')}`.trim();
}

/** "requires attunement by a wizard": yes, and who. */
function attunementOf(v: string | undefined): { on: boolean; by?: string } {
	if (!yes(v)) return { on: false };
	const by = /^(?:yes|true)?\s*,?\s*(?:by\s+)?(.*)$/i.exec(v!.trim())?.[1]?.trim();
	return by ? { on: true, by: by.replace(/^by\s+/i, '') } : { on: true };
}

export function parseItem5e(source: string, edition: Dnd5eEdition = '2024'): Item5e | null {
	const { props, text } = split(source);
	const name = props.get('name');
	// A weapon, armor or gear has a category instead of a rarity: equipment, not a magic item.
	if (!name || props.has('category')) return null;
	const type = props.get('type') ?? 'Wondrous item';
	const rarity = props.get('rarity') ?? 'Uncommon';
	const att = attunementOf(props.get('attunement'));
	const item: Item5e = { name, type, rarity, desc: text, line: itemLine5e(type, rarity, att, edition) };
	if (att.on) item.attunement = true;
	return Object.assign(item, originOf(props));
}

/** "Weapon (Longsword), rare (requires attunement by a paladin)": 2014 lower-cases the rarity, 2024 doesn't. */
export function itemLine5e(type: string, rarity: string, att: { on: boolean; by?: string }, edition: Dnd5eEdition): string {
	const r = edition === '2014' ? rarity.toLowerCase() : rarity;
	const a = att.on ? ` (${edition === '2014' ? 'requires attunement' : 'Requires Attunement'}${att.by ? ` by ${att.by}` : ''})` : '';
	return `${type}, ${r}${a}`;
}

/** An item as ```5e-item block text (the body). */
export function itemSource5e(i: { name: string; type: string; rarity: string; attunement?: boolean | string; desc: string; imported?: string; ddbId?: number }): string {
	const lines = [`name: ${i.name}`, ...originLines(i), `type: ${i.type}`, `rarity: ${i.rarity}`];
	if (i.attunement) lines.push(`attunement: ${i.attunement === true ? 'yes' : `by ${String(i.attunement).replace(/^by\s+/i, '')}`}`);
	return `${lines.join('\n')}\n\n${i.desc.trim()}`.trim();
}

// Weapons, armor and gear: a ```5e-item block with a category, and the numbers the SRD's equipment has.
//
//   ```5e-item
//   name: Ember Pike
//   category: Martial Melee Weapon
//   damage: 1d10 piercing
//   properties: Heavy, Reach, Two-Handed
//   mastery: Cleave
//   cost: 20 gp
//   weight: 18 lb.
//   ```

/** "14 + Dex (max 2)", "11 + Dex", "16", "+2" (a shield). */
export function acText(ac: NonNullable<Equipment5e['ac']>, shield: boolean): string {
	if (shield) return `+${ac.base}`;
	return ac.dex ? `${ac.base} + Dex${ac.max !== undefined ? ` (max ${ac.max})` : ''}` : String(ac.base);
}

export function parseEquipment5e(source: string): Equipment5e | null {
	const { props, text } = split(source);
	const name = props.get('name');
	const category = props.get('category');
	if (!name || !category) return null;
	const e: Equipment5e = { name, category };
	const weapon = /weapon/i.exec(category);
	if (weapon) {
		e.weaponCategory = /martial/i.test(category) ? 'Martial' : 'Simple';
		e.weaponRange = /ranged/i.test(category) ? 'Ranged' : 'Melee';
	}
	const armor = /^(light|medium|heavy)\s+armor$|^shields?$/i.exec(category.trim());
	if (armor) e.armorCategory = armor[1] ? armor[1].charAt(0).toUpperCase() + armor[1].slice(1).toLowerCase() : 'Shield';
	if (props.get('damage')) e.damage = props.get('damage');
	if (props.get('versatile')) e.versatile = props.get('versatile');
	if (props.get('properties')) e.properties = list(props.get('properties'));
	if (props.get('range')) e.range = props.get('range')!.replace(/\s*ft\.?$/i, '');
	if (props.get('mastery')) e.mastery = props.get('mastery');
	const ac = /^\+?(\d+)\s*(\+\s*dex(?:terity)?(?:\s*modifier)?)?\s*(?:\(max\s*(\d+)\))?/i.exec(props.get('ac') ?? '');
	if (ac) e.ac = { base: Number(ac[1]), dex: !!ac[2], ...(ac[3] ? { max: Number(ac[3]) } : {}) };
	const str = /(\d+)/.exec(props.get('strength') ?? '');
	if (str) e.strMin = Number(str[1]);
	if (yes(props.get('stealth')) && !/^no/i.test(props.get('stealth') ?? '')) e.stealthDisadvantage = true;
	if (props.get('cost')) e.cost = props.get('cost');
	const w = /([\d.]+)/.exec(props.get('weight') ?? '');
	if (w) e.weight = Number(w[1]);
	if (text) e.desc = text;
	return Object.assign(e, originOf(props));
}

/** Equipment as ```5e-item block text (the body). */
export function equipmentSource5e(e: Equipment5e): string {
	const lines = [`name: ${e.name}`, ...originLines(e), `category: ${e.category}`];
	const add = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== '') lines.push(`${k}: ${v}`); };
	add('damage', e.damage);
	add('versatile', e.versatile);
	add('properties', e.properties?.join(', '));
	add('range', e.range);
	add('mastery', e.mastery);
	if (e.ac) add('ac', acText(e.ac, e.armorCategory === 'Shield' || /shield/i.test(e.category)));
	add('strength', e.strMin);
	if (e.stealthDisadvantage) add('stealth', 'disadvantage');
	add('cost', e.cost);
	if (e.weight !== undefined) add('weight', `${e.weight} lb.`);
	return `${lines.join('\n')}${e.desc?.trim() ? `\n\n${e.desc.trim()}` : ''}`;
}

/** One of yours, marked as homebrew (or as imported, when it says where from): its card says so where the SRD's say SRD 5.1 or 5.2. */
export function homebrewSource<T extends { imported?: string }>(x: T): T & { source: string } {
	return Object.assign({}, x, { source: x.imported ? IMPORTED : HOMEBREW });
}

/** Find every block of a language in a note. */
export function extractBlocks(content: string, lang: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`^(\\s*)(\`{3,}|~{3,})\\s*${lang.replace(/[-]/g, '\\-')}\\s*$([\\s\\S]*?)^\\1\\2\\s*$`, 'gm');
	for (let m = re.exec(content); m; m = re.exec(content)) out.push(m[3].replace(/^\n/, ''));
	return out;
}
