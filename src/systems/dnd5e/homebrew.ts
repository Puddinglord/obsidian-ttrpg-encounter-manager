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
// Pure: no Obsidian imports.

import type { Item5e, Spell5e } from './compendium';
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
	return spell;
}

/** A spell as ```5e-spell block text (the body). The higher-level paragraph is worded for the edition. */
export function spellSource5e(s: Spell5e, edition: Dnd5eEdition = '2024'): string {
	const lines = [
		`name: ${s.name}`,
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
	if (!name) return null;
	const type = props.get('type') ?? 'Wondrous item';
	const rarity = props.get('rarity') ?? 'Uncommon';
	const att = attunementOf(props.get('attunement'));
	const item: Item5e = { name, type, rarity, desc: text, line: itemLine5e(type, rarity, att, edition) };
	if (att.on) item.attunement = true;
	return item;
}

/** "Weapon (Longsword), rare (requires attunement by a paladin)": 2014 lower-cases the rarity, 2024 doesn't. */
export function itemLine5e(type: string, rarity: string, att: { on: boolean; by?: string }, edition: Dnd5eEdition): string {
	const r = edition === '2014' ? rarity.toLowerCase() : rarity;
	const a = att.on ? ` (${edition === '2014' ? 'requires attunement' : 'Requires Attunement'}${att.by ? ` by ${att.by}` : ''})` : '';
	return `${type}, ${r}${a}`;
}

/** An item as ```5e-item block text (the body). */
export function itemSource5e(i: { name: string; type: string; rarity: string; attunement?: boolean | string; desc: string }): string {
	const lines = [`name: ${i.name}`, `type: ${i.type}`, `rarity: ${i.rarity}`];
	if (i.attunement) lines.push(`attunement: ${i.attunement === true ? 'yes' : `by ${String(i.attunement).replace(/^by\s+/i, '')}`}`);
	return `${lines.join('\n')}\n\n${i.desc.trim()}`.trim();
}

/** One of yours, marked as homebrew: its card says Homebrew where the SRD's say SRD 5.1 or 5.2. */
export function homebrewSource<T extends object>(x: T): T & { source: string } {
	return Object.assign({}, x, { source: 'Homebrew' });
}

/** Find every block of a language in a note. */
export function extractBlocks(content: string, lang: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`^(\\s*)(\`{3,}|~{3,})\\s*${lang.replace(/[-]/g, '\\-')}\\s*$([\\s\\S]*?)^\\1\\2\\s*$`, 'gm');
	for (let m = re.exec(content); m; m = re.exec(content)) out.push(m[3].replace(/^\n/, ''));
	return out;
}
