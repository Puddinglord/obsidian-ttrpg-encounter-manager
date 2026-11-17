// The spell and item builders' drafts. Like the monster draft: what the GM
// typed, with everything else from the books (spell damage by tier from the
// Creator's Kit, actions and range defaults, Core 3.3's item prices and rarity
// bands). Pure, so it's tested.

import { Item, Spell } from './compendium';
import { diceAverage, expectedSpell, formatDiceParts, guessSpellTier, parseDiceParts, RARITIES, RARITY_GUIDE, Rarity, weaponPrice } from './builder-math';
import { HomebrewItem, ItemKind, itemBlockSource, spellBlockSource } from './homebrew-def';

/** Are these draft fields as they were when the block was read? */
function untouched<T extends object>(d: T, at: T) {
	return (...keys: (keyof T)[]) => keys.every(k => JSON.stringify(d[k]) === JSON.stringify(at[k]));
}

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
	/** Editing a block: the spell as written, and the draft it was read into. Untouched controls write back what was written. */
	orig?: { spell: Spell; at: SpellDraft };
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
	const o = d.orig;
	if (o) {
		const was = o.spell;
		const same = untouched(d, o.at);
		// "Reaction", "1 Minute", "Touch", "Sphere 3": what the controls can't say stays as written until it's changed.
		if (same('actions')) s.actions = was.actions;
		if (same('rangeKind', 'distance')) s.range = was.range;
		if (same('area', 'areaSize')) s.aoe = was.aoe;
		// A spell written without damage or upcast doesn't get the tier's until something they follow changes.
		const follows = ['utility', 'tier', 'area', 'areaSize', 'rangeKind', 'distance', 'sides', 'damage'] as const;
		if (same(...follows)) s.damage = was.damage;
		if (same(...follows, 'upcast')) s.higherLevels = was.higherLevels;
		if (same(...follows, 'scaling')) s.cantripScaling = was.cantripScaling;
		s.class = was.class;
		s.source = was.source;
	}
	for (const k of Object.keys(s) as (keyof Spell)[]) if (s[k] === undefined) delete s[k];
	return s;
}

/** A draft from a spell: a template, or (`editing`) the block being edited, which keeps what the builder has no control for. */
export function fromSpell(s: Spell, editing = false): SpellDraft {
	const d = newSpellDraft();
	const range = s.range?.match(/^(Range|Reach)\s+(\d+)/i);
	const area = s.aoe?.match(/^(Cone|Line)\s+(\d+)/i);
	const sq = s.aoe?.match(/^(\d+)\s*[×x]\s*\d+/);
	const sides = parseDiceParts(s.damage ?? '')?.sides;
	const out: SpellDraft = {
		...d, name: s.name, school: s.school ?? d.school, tier: s.tier ?? 0, utility: !!s.utility,
		actions: parseInt(s.actions ?? '', 10) || undefined,
		rangeKind: /^self/i.test(s.range ?? '') ? 'self' : range ? (range[1].toLowerCase() as RangeKind) : 'range',
		distance: range ? Number(range[2]) : undefined,
		area: area ? (area[1].toLowerCase() as AreaShape) : sq ? 'square' : s.aoe ? 'aoe' : 'none',
		areaSize: area ? Number(area[2]) : sq ? Number(sq[1]) : undefined,
		concentration: s.concentration, damage: s.damage, upcast: s.higherLevels, scaling: s.cantripScaling, sides: sides ?? d.sides,
		// "DEX save for half." leads the text when the builder wrote it: read it back as the save.
		save: (s.text?.match(/^(STR|DEX|INT|WIL) save for half\./)?.[1] ?? '') as SaveKey,
		text: (s.text ?? '').replace(/^(STR|DEX|INT|WIL) save for half\.\s*/, ''),
	};
	if (editing) out.orig = { spell: s, at: { ...out } };
	return out;
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
	/** Editing a block: the item as written and the kind it was read as, for what the builder has no control for. */
	orig?: { item: HomebrewItem; at: ItemDraft };
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
	const o = d.orig;
	if (o) {
		const was = o.item;
		const same = untouched(d, o.at);
		Object.assign(it, { subcategory: was.subcategory, slots: was.slots, range: was.range, source: was.source });
		// "varies", "STR/DEX": what the controls can't say stays while they're as they were read.
		if (same('rarity')) it.rarity = was.rarity;
		if (same('kind')) {
			// A wand stays a wand; a non-weapon's damage and properties have no control here, so they stay too.
			it.category = was.category;
			if (d.kind !== 'weapon') Object.assign(it, { damage: was.damage, stat: was.stat, damageType: was.damageType, properties: was.properties });
			else {
				if (same('damage')) it.damage = was.damage;
				if (same('stat')) it.stat = was.stat;
			}
			if (same('armor')) it.armor = was.armor;
			// No price written: none suggested, until something the price follows changes.
			if (same('rarity', 'damage', 'cost')) it.cost = was.cost;
		}
	}
	for (const k of Object.keys(it) as (keyof HomebrewItem)[]) if (it[k] === undefined) delete it[k];
	return it;
}

/** An item's kind in the builder ("wand" and "scroll" are magic items). */
export function itemKind(category: string | undefined): ItemKind {
	return (['weapon', 'armor', 'shield', 'consumable', 'magic', 'gear'] as ItemKind[]).find(k => k === category) ?? (category === 'wand' || category === 'scroll' ? 'magic' : 'gear');
}

/** A draft from an item: a template, or (`editing`) the block being edited, which keeps what the builder has no control for. */
export function fromItem(it: HomebrewItem, editing = false): ItemDraft {
	const kind = itemKind(it.category);
	// The book stores charges as a number.
	const charges = it.charges !== undefined && it.charges !== null && String(it.charges).trim() ? String(it.charges).trim() : undefined;
	let text = it.text ?? '';
	// The compendium's copy of a homebrew item leads with its charges (itemForCompendium): they're a field here.
	if (charges) text = text.replace(/^\*\*Charges:\*\*[^.]*\.\s*/, '');
	const c = text.match(/\s*\*\*Catch:\*\*\s*(.+)$/);
	const out: ItemDraft = {
		...newItemDraft(kind), name: it.name, rarity: (RARITIES as readonly string[]).includes(it.rarity ?? '') ? it.rarity as Rarity : '',
		damage: it.damage, stat: it.stat === 'DEX' ? 'DEX' : 'STR', damageType: it.damageType ?? '', props: it.properties ?? [], armor: it.armor,
		strength: it.strength, cost: it.cost, charges, text: c ? text.slice(0, c.index).trim() : text, catch: c ? c[1].trim() : '',
	};
	if (editing) out.orig = { item: it, at: { ...out } };
	return out;
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

// ----------------------------------------------------------------------------
// The review: what to look at before saving, each with a fix where there's one

export type HomebrewFix =
	| { kind: 'tier'; to: number }
	| { kind: 'book-damage' }
	| { kind: 'save'; to: SaveKey }
	| { kind: 'actions'; to: number }
	| { kind: 'cost'; to: string }
	| { kind: 'go'; step: string; field?: string };

export interface HomebrewNote { tone: 'warn' | 'tip' | 'ok'; text: string; fixes: { label: string; fix: HomebrewFix }[] }

const tierWord = (t: number) => (t === 0 ? 'cantrip' : `tier ${t} spell`);

export function spellNotes(d: SpellDraft): HomebrewNote[] {
	const notes: HomebrewNote[] = [];
	const add = (tone: HomebrewNote['tone'], text: string, ...fixes: HomebrewNote['fixes']) => notes.push({ tone, text, fixes });
	if (!d.name.trim()) add('warn', 'It has no name yet.', { label: 'Name it', fix: { kind: 'go', step: 'start', field: 'Name' } });
	const c = tierCheck(d);
	if (c && c.verdict !== 0) {
		const more = c.verdict > 0;
		add('warn', `It averages ${Math.round(c.have)} damage, ${more ? 'more' : 'less'} than a ${tierWord(d.tier)} (${Math.round(c.want)}). The Creator's Kit: ${more ? 'give it a drawback, like a short range or a condition to meet' : 'give it a benefit, like ignoring armor or never missing'}.`,
			{ label: `Make it ${tierWord(c.tier).replace(' spell', '')}`, fix: { kind: 'tier', to: c.tier } },
			{ label: `${TIER_NAME(d.tier)} damage`, fix: { kind: 'book-damage' } });
	}
	if (d.tier === 0 && d.save) add('warn', 'Cantrips shouldn\'t ask for a save (the Creator\'s Kit keeps saves for bigger spells).', { label: 'No save', fix: { kind: 'save', to: '' } });
	if (d.area !== 'none' && d.rangeKind === 'range' && spellActions(d) < 3 && d.tier > 0) add('tip', 'Area spells cast at range usually take 3 actions.', { label: '3 actions', fix: { kind: 'actions', to: 3 } });
	if (!d.text.trim()) add(d.utility ? 'warn' : 'tip', d.utility ? 'It doesn\'t say what it does yet.' : 'No effect beyond damage. A rider on a crit or a hit makes it more than a number.', { label: 'Write it', fix: { kind: 'go', step: 'effect', field: 'What it does' } });
	if (!notes.some(n => n.tone === 'warn')) notes.unshift({ tone: 'ok', text: `Ready: a ${d.school ? `${d.school} ` : ''}${tierWord(d.tier)}.`, fixes: [] });
	return notes;
}

const TIER_NAME = (t: number) => (t === 0 ? 'Cantrip' : `Tier ${t}`);

export function applySpellFix(d: SpellDraft, fix: HomebrewFix): SpellDraft {
	switch (fix.kind) {
		case 'tier': return { ...d, tier: fix.to, autoTier: false };
		case 'book-damage': return { ...d, damage: undefined, autoTier: false };
		case 'save': return { ...d, save: fix.to };
		case 'actions': return { ...d, actions: fix.to };
		default: return d;
	}
}

export function itemNotes(d: ItemDraft): HomebrewNote[] {
	const notes: HomebrewNote[] = [];
	const add = (tone: HomebrewNote['tone'], text: string, ...fixes: HomebrewNote['fixes']) => notes.push({ tone, text, fixes });
	if (!d.name.trim()) add('warn', 'It has no name yet.', { label: 'Name it', fix: { kind: 'go', step: 'start', field: 'Name' } });
	const magic = d.kind === 'magic' || (!!d.rarity && d.rarity !== 'common');
	if (magic && !d.text.trim()) add('warn', 'It doesn\'t say what it does yet.', { label: 'Write it', fix: { kind: 'go', step: 'details', field: 'What it does' } });
	if (magic && !d.catch.trim()) add('tip', 'The GM Guide: the memorable items have a trade-off. What does it cost the hero?', { label: 'Add a catch', fix: { kind: 'go', step: 'details', field: 'The catch' } });
	const suggested = suggestedCost(d);
	const typed = d.cost?.match(/[\d,]+/)?.[0];
	const want = suggested?.match(/[\d,]+/)?.[0];
	if (typed && want) {
		const r = Number(typed.replace(/,/g, '')) / Number(want.replace(/,/g, ''));
		if (r > 3 || r < 1 / 3) add('tip', `Priced at ${d.cost}; the book puts an item like this around ${suggested}.`, { label: `Use ${suggested}`, fix: { kind: 'cost', to: suggested } });
	}
	if (!notes.some(n => n.tone === 'warn')) notes.unshift({ tone: 'ok', text: 'Ready to hand out.', fixes: [] });
	return notes;
}

export function applyItemFix(d: ItemDraft, fix: HomebrewFix): ItemDraft {
	return fix.kind === 'cost' ? { ...d, cost: fix.to } : d;
}
