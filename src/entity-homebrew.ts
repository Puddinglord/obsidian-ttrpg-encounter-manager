// The spell and item builders' drafts. Like the monster draft: what the GM
// typed, with everything else from the books (spell damage by tier from the
// Creator's Kit, actions and range defaults, Core 3.3's item prices and rarity
// bands). Pure, so it's tested.

import { Item, Spell } from './compendium';
import { diceAverage, expectedSpell, formatDiceParts, guessSpellTier, RARITY_GUIDE, Rarity, weaponPrice } from './builder-math';
import { HomebrewItem, ItemKind, itemBlockSource, spellBlockSource } from './homebrew-def';

// ----------------------------------------------------------------------------
// Spells

export const SCHOOLS = ['Fire', 'Ice', 'Lightning', 'Necrotic', 'Radiant', 'Wind'];
export type RangeKind = 'range' | 'reach' | 'self';
export type AreaShape = 'none' | 'aoe' | 'cone' | 'line' | 'square';
export type SaveKey = '' | 'STR' | 'DEX' | 'INT' | 'WIL';

export interface SpellDraft {
	name: string;
	school: string;
	tier: number;
	autoTier: boolean;
	/** A spell that does something other than damage. */
	utility: boolean;
	actions?: number;
	rangeKind: RangeKind;
	distance?: number;
	area: AreaShape;
	areaSize?: number;
	concentration?: string;
	save: SaveKey;
	/** Typed damage dice; unset follows the tier. */
	damage?: string;
	sides: number;
	upcast?: string;
	scaling?: string;
	text: string;
}

export function newSpellDraft(): SpellDraft {
	return { name: '', school: 'Fire', tier: 1, autoTier: false, utility: false, rangeKind: 'range', area: 'none', save: '', sides: 8, text: '' };
}

const aoe = (d: SpellDraft) => d.area !== 'none';

export function spellExpected(d: SpellDraft) {
	return expectedSpell(d.tier, { aoe: aoe(d), ranged: d.rangeKind === 'range', sides: d.tier === 0 ? Math.max(d.sides, 10) : d.tier >= 5 ? 20 : d.sides });
}

export function spellDamage(d: SpellDraft): string | undefined {
	if (d.utility) return d.damage?.trim() || undefined;
	return d.damage?.trim() || formatDiceParts(spellExpected(d).dice).replace(/^d(\d+)$/, '1d$1');
}

export function spellActions(d: SpellDraft): number { return d.actions ?? spellExpected(d).actions; }

export function spellRange(d: SpellDraft): string {
	if (d.rangeKind === 'self') return 'Self';
	const n = d.distance ?? (d.rangeKind === 'reach' ? 1 : spellExpected(d).range);
	return `${d.rangeKind === 'reach' ? 'Reach' : 'Range'} ${n}`;
}

export function spellArea(d: SpellDraft): string | undefined {
	const n = d.areaSize ?? (d.area === 'square' ? 3 : d.area === 'line' ? 8 : 4);
	switch (d.area) {
		case 'aoe': return 'AoE';
		case 'cone': return `Cone ${n}`;
		case 'line': return `Line ${n}`;
		case 'square': return `${n}×${n}`;
		default: return undefined;
	}
}

export function suggestedUpcast(d: SpellDraft): string | undefined {
	if (d.tier === 0 || d.utility) return undefined;
	return `+${spellExpected(d).upcast} damage.`;
}

export function suggestedScaling(d: SpellDraft): string | undefined {
	if (d.tier !== 0 || d.utility) return undefined;
	const avg = diceAverage(spellDamage(d)) ?? spellExpected(d).damage;
	return `+${Math.max(1, Math.floor(avg))} damage every 5 levels.`;
}

export function toSpell(d: SpellDraft): Spell {
	const save = d.save ? `${d.save} save for half.` : '';
	const s: Spell = {
		name: d.name.trim() || 'New spell',
		school: d.school.trim() || undefined,
		tier: d.tier,
		utility: d.utility || undefined,
		actions: `${spellActions(d)} Action${spellActions(d) === 1 ? '' : 's'}`,
		range: spellRange(d),
		aoe: spellArea(d),
		concentration: d.concentration?.trim() || undefined,
		damage: spellDamage(d),
		higherLevels: d.tier ? (d.upcast?.trim() || suggestedUpcast(d)) : undefined,
		cantripScaling: d.tier === 0 ? (d.scaling?.trim() || suggestedScaling(d)) : undefined,
		text: [save, d.text.trim()].filter(Boolean).join(' ') || undefined,
	};
	for (const k of Object.keys(s) as (keyof Spell)[]) if (s[k] === undefined) delete s[k];
	return s;
}

export function spellSource(d: SpellDraft): string { return spellBlockSource(toSpell(d)); }

export interface TierCheck { tier: number; verdict: -1 | 0 | 1; have: number; want: number }

/** What tier the damage plays like. Utility spells have no damage line to read. */
export function tierCheck(d: SpellDraft): TierCheck | null {
	if (d.utility) return null;
	const have = diceAverage(spellDamage(d));
	if (have === null) return null;
	const want = spellExpected(d).damage;
	const tier = guessSpellTier(have, aoe(d));
	return { tier, verdict: tier === d.tier ? 0 : tier > d.tier ? 1 : -1, have, want };
}

export function autoTier(d: SpellDraft): number {
	if (!d.damage?.trim()) return d.tier;
	const avg = diceAverage(d.damage);
	return avg === null ? d.tier : guessSpellTier(avg, aoe(d));
}

// ----------------------------------------------------------------------------
// Items

export const WEAPON_PROPS = ['2-handed', 'Light', 'Vicious', 'Reach 2', 'Thrown 4', 'Range 8', 'Load: 1 action'] as const;

export interface ItemDraft {
	name: string;
	kind: ItemKind;
	rarity: Rarity | '';
	damage?: string;
	stat: 'STR' | 'DEX';
	damageType: string;
	props: string[];
	armor?: string;
	strength?: number;
	cost?: string;
	charges?: string;
	text: string;
	/** The GM Guide: a memorable item has a catch. Shown as its own line. */
	catch: string;
}

export function newItemDraft(kind: ItemKind = 'magic'): ItemDraft {
	return { name: '', kind, rarity: kind === 'magic' ? 'uncommon' : '', stat: 'STR', damageType: '', props: [], text: '', catch: '' };
}

/** A price for the item: weapons along Core's weapon table, magic items at the low end of their rarity's band. */
export function suggestedCost(d: ItemDraft): string | undefined {
	if (d.kind === 'weapon') {
		const avg = diceAverage(d.damage ?? '1d6') ?? 3.5;
		const base = weaponPrice(avg);
		const rarity = d.rarity && d.rarity !== 'common' ? RARITY_LOW[d.rarity] : 0;
		return `${(base + rarity).toLocaleString('en-US')} gp`;
	}
	if (d.kind === 'magic' || d.rarity) return d.rarity && d.rarity !== 'common' ? `${RARITY_LOW[d.rarity].toLocaleString('en-US')} gp` : undefined;
	return undefined;
}

const RARITY_LOW: Record<Exclude<Rarity, 'common'>, number> = { uncommon: 50, rare: 500, 'very rare': 5000, legendary: 1000000 };

export function rarityGuide(d: ItemDraft): string | undefined {
	return d.rarity ? `${d.rarity[0].toUpperCase()}${d.rarity.slice(1)}: found around ${RARITY_GUIDE[d.rarity].levels}, ${RARITY_GUIDE[d.rarity].cost}.` : undefined;
}

export function toItem(d: ItemDraft): HomebrewItem {
	const weapon = d.kind === 'weapon';
	const it: HomebrewItem = {
		name: d.name.trim() || 'New item',
		category: d.kind,
		rarity: d.rarity || undefined,
		damage: weapon ? (d.damage?.trim() || '1d6') : undefined,
		stat: weapon ? d.stat : undefined,
		damageType: weapon ? d.damageType.trim() || undefined : undefined,
		properties: weapon && d.props.length ? [...d.props] : undefined,
		armor: d.kind === 'armor' || d.kind === 'shield' ? (d.armor?.trim() || (d.kind === 'shield' ? '+2' : '3+DEX')) : undefined,
		strength: d.strength || undefined,
		cost: d.cost?.trim() || suggestedCost(d),
		charges: d.charges?.trim() || undefined,
		text: [d.text.trim(), d.catch.trim() ? `**Catch:** ${d.catch.trim()}` : ''].filter(Boolean).join(' ') || undefined,
	};
	for (const k of Object.keys(it) as (keyof HomebrewItem)[]) if (it[k] === undefined) delete it[k];
	return it;
}

export function itemSource(d: ItemDraft): string { return itemBlockSource(toItem(d)); }

/** Book items to compare with: weapons of about the same damage, armor of the same kind, items of the same rarity. */
export function bookPeers(d: ItemDraft, book: Item[]): Item[] {
	if (d.kind === 'weapon') {
		const avg = diceAverage(d.damage ?? '1d6') ?? 3.5;
		return book.filter(i => i.category === 'weapon' && i.damage).sort((a, b) => Math.abs((diceAverage(a.damage) ?? 0) - avg) - Math.abs((diceAverage(b.damage) ?? 0) - avg)).slice(0, 3);
	}
	if (d.kind === 'armor' || d.kind === 'shield') return book.filter(i => i.category === d.kind).slice(0, 4);
	if (d.kind === 'consumable') return book.filter(i => i.category === 'consumable').slice(0, 3);
	if (d.rarity) return book.filter(i => i.rarity === d.rarity).slice(0, 3);
	return [];
}
