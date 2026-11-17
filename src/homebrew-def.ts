// Homebrew spells and items: ```nimble-spell and ```nimble-item blocks in
// notes, written the way a stat block is (a field, a colon, the value), with
// the rules text last. They join the compendium as if they were in the book.
// Pure, so it's tested.
//
//   ```nimble-spell
//   name: Ember Lash
//   school: Fire
//   tier: 1
//   actions: 2
//   range: Range 8
//   damage: 3d6+4
//   upcast: +5 damage.
//   text: A whip of flame cracks across one target. On a crit, it's Smoldering.
//   ```

import { Item, Spell } from './compendium';
import { fieldKey } from './parser';

export const SPELL_LANG = 'nimble-spell';
export const ITEM_LANG = 'nimble-item';

/** Where a homebrew entry was written. */
export interface Homebrew { filePath?: string }
export type HomebrewSpell = Spell & Homebrew;
export type HomebrewItem = Item & Homebrew & { charges?: string };

export const HOMEBREW_SOURCE = 'Homebrew';

/** Splits a block into fields and the rules text (everything from `text:` on, which may run several lines). */
function fields(body: string): { values: Map<string, string>; text: string } {
	const values = new Map<string, string>();
	const lines = body.split(/\r?\n/);
	let text: string[] | null = null;
	for (const line of lines) {
		if (text) { text.push(line); continue; }
		const m = line.match(/^\s*([A-Za-z][\w *-]*?)\s*:\s*(.*)$/);
		if (!m) continue;
		const key = fieldKey(m[1]);
		if (key === 'text' || key === 'description' || key === 'effect') { text = [m[2]]; continue; }
		values.set(key, m[2].trim());
	}
	return { values, text: (text ?? []).join('\n').replace(/^\s+|\s+$/g, '') };
}

const KNOWN: Record<'spell' | 'item', Set<string>> = {
	spell: new Set(['name', 'school', 'tier', 'utility', 'actions', 'cost', 'range', 'reach', 'aoe', 'area', 'concentration', 'damage', 'upcast', 'higherlevels', 'scaling', 'cantripscaling', 'class', 'source']),
	item: new Set(['name', 'category', 'kind', 'type', 'subcategory', 'rarity', 'cost', 'price', 'damage', 'damagetype', 'stat', 'properties', 'range', 'armor', 'defense', 'strength', 'str', 'slots', 'charges', 'source']),
};

/** Lines above `text:` that the block doesn't read (unknown fields, repeats, lines without a colon): Edit can't write them back. */
export function unreadLines(body: string, kind: 'spell' | 'item'): number {
	let n = 0;
	const seen = new Set<string>();
	for (const line of body.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const m = line.match(/^\s*([A-Za-z][\w *-]*?)\s*:\s*(.*)$/);
		const key = m ? fieldKey(m[1]) : '';
		if (key === 'text' || key === 'description' || key === 'effect') break;
		if (!m || !KNOWN[kind].has(key) || seen.has(key)) n++;
		seen.add(key);
	}
	return n;
}

const yes = (v: string | undefined) => !!v && /^(yes|true|y|1|utility)$/i.test(v.trim());

/** "1", "Tier 1", "cantrip" → 0..9. */
export function readTier(v: string | undefined): number {
	if (!v) return 0;
	if (/cantrip/i.test(v)) return 0;
	const n = parseInt(v.replace(/[^\d]/g, ''), 10);
	return Number.isNaN(n) ? 0 : Math.max(0, Math.min(9, n));
}

/** "2" → "2 Actions"; already worded ("1 Action", "Reaction") stays. */
function actionsText(v: string | undefined): string | undefined {
	if (!v) return undefined;
	const n = v.trim().match(/^(\d+)$/);
	return n ? `${n[1]} Action${n[1] === '1' ? '' : 's'}` : v.trim();
}

export function parseSpellBlock(body: string): HomebrewSpell | null {
	const { values: v, text } = fields(body);
	const name = v.get('name')?.trim();
	if (!name) return null;
	const s: HomebrewSpell = {
		name,
		school: v.get('school') || undefined,
		tier: readTier(v.get('tier')),
		utility: yes(v.get('utility')) || undefined,
		actions: actionsText(v.get('actions') ?? v.get('cost')),
		range: v.get('range') || v.get('reach') && `Reach ${v.get('reach')}` || undefined,
		aoe: v.get('aoe') || v.get('area') || undefined,
		concentration: v.get('concentration') || undefined,
		damage: v.get('damage') || undefined,
		higherLevels: v.get('upcast') || v.get('higherlevels') || undefined,
		cantripScaling: v.get('scaling') || v.get('cantripscaling') || undefined,
		class: v.get('class') || undefined,
		text: text || undefined,
		source: v.get('source') || HOMEBREW_SOURCE,
	};
	for (const k of Object.keys(s) as (keyof HomebrewSpell)[]) if (s[k] === undefined) delete s[k];
	return s;
}

export function spellBlockSource(s: Spell): string {
	const out = [`name: ${s.name}`];
	const kv = (k: string, val: string | number | undefined) => { if (val !== undefined && val !== '') out.push(`${k}: ${String(val).replace(/\s*\n\s*/g, ' ')}`); };
	kv('school', s.school);
	kv('tier', s.tier ? s.tier : 'cantrip');
	if (s.utility) kv('utility', 'yes');
	kv('actions', s.actions);
	kv('range', s.range);
	kv('aoe', s.aoe);
	kv('concentration', s.concentration);
	kv('damage', s.damage);
	kv('upcast', s.higherLevels);
	kv('scaling', s.cantripScaling);
	kv('class', s.class);
	if (s.source && s.source !== HOMEBREW_SOURCE) kv('source', s.source);
	if (s.text?.trim()) out.push(`text: ${s.text.trim()}`);
	return out.join('\n');
}

export const ITEM_KINDS = ['weapon', 'armor', 'shield', 'consumable', 'magic', 'gear'] as const;
export type ItemKind = typeof ITEM_KINDS[number];

export function parseItemBlock(body: string): HomebrewItem | null {
	const { values: v, text } = fields(body);
	const name = v.get('name')?.trim();
	if (!name) return null;
	const num = (k: string) => { const n = parseInt(v.get(k) ?? '', 10); return Number.isNaN(n) ? undefined : n; };
	const props = v.get('properties');
	const it: HomebrewItem = {
		name,
		category: (v.get('category') || v.get('kind') || v.get('type') || 'gear').toLowerCase(),
		subcategory: v.get('subcategory') || undefined,
		rarity: v.get('rarity')?.toLowerCase() || undefined,
		cost: v.get('cost') || v.get('price') || undefined,
		damage: v.get('damage') || undefined,
		damageType: v.get('damagetype') || undefined,
		stat: v.get('stat')?.toUpperCase() || undefined,
		properties: props ? props.split(/[,;]/).map(p => p.trim()).filter(Boolean) : undefined,
		range: v.get('range') || undefined,
		armor: v.get('armor') || v.get('defense') || undefined,
		strength: num('strength') ?? num('str'),
		slots: num('slots'),
		charges: v.get('charges') || undefined,
		text: text || undefined,
		source: v.get('source') || HOMEBREW_SOURCE,
	};
	for (const k of Object.keys(it) as (keyof HomebrewItem)[]) if (it[k] === undefined) delete it[k];
	return it;
}

export function itemBlockSource(it: HomebrewItem): string {
	const out = [`name: ${it.name}`];
	const kv = (k: string, val: string | number | undefined) => { if (val !== undefined && val !== '') out.push(`${k}: ${String(val).replace(/\s*\n\s*/g, ' ')}`); };
	kv('category', it.category);
	kv('subcategory', it.subcategory);
	kv('rarity', it.rarity);
	kv('damage', it.damage);
	kv('stat', it.stat);
	kv('damage type', it.damageType);
	kv('properties', it.properties?.join(', '));
	kv('range', it.range);
	kv('armor', it.armor);
	kv('strength', it.strength);
	kv('slots', it.slots);
	kv('charges', it.charges);
	kv('cost', it.cost);
	if (it.source && it.source !== HOMEBREW_SOURCE) kv('source', it.source);
	if (it.text?.trim()) out.push(`text: ${it.text.trim()}`);
	return out.join('\n');
}

/** An item as the compendium shows it: charges lead the rules text. */
export function itemForCompendium(it: HomebrewItem): HomebrewItem {
	return it.charges ? { ...it, text: [`**Charges:** ${it.charges}.`, it.text].filter(Boolean).join(' ') } : it;
}
