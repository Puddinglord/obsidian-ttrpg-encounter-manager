// The 5e compendium as entries for core's search and browser
// (core/compendium): monsters (the SRD's and your ```5e blocks) and every
// compendium kind, each with the facets you can filter on (cr, school, rarity,
// weapon, damage…), the numbers it sorts by, and its tabs. The two editions
// word things differently ("1 action" and "Action", "Wondrous Items" and
// "Wondrous Item"); the facets read the same in both.
// Pure: no Obsidian imports.

import { CompendiumEntry, createCompendiumQuery, QuerySchema, SegmentDef, SortDef } from '../../core/compendium/query';
import { allHits, contentVersion5e, Hit5e, KIND5E, Kind5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { crLabel, crValue, xpOf } from './rules';
import type { Dnd5eEntry } from './types';

export type Segment5e = 'all' | 'monsters' | 'spells' | 'items' | 'equipment' | 'classes' | 'origins' | 'feats' | 'rules';
export type EntryKind5e = 'monster' | Kind5e;

export interface Entry5e extends CompendiumEntry {
	kind: EntryKind5e;
	segments: Segment5e[];
	monster?: Dnd5eEntry;
	hit?: Hit5e;
}

export const SEGMENTS_5E: SegmentDef<Segment5e>[] = [
	{ id: 'all', label: 'All', icon: 'ev-books', words: ['all', 'everything'] },
	{ id: 'monsters', label: 'Monsters', playerLabel: 'Creatures', icon: 'ev-skull', words: ['monsters', 'creatures', 'bestiary', 'foes'] },
	{ id: 'spells', label: 'Spells', icon: 'ev-spell', words: ['spells', 'magic'] },
	{ id: 'items', label: 'Magic items', icon: 'ev-diamond', words: ['items', 'magic-items', 'treasure'] },
	{ id: 'equipment', label: 'Equipment', icon: 'ev-sword', words: ['equipment', 'gear', 'weapons', 'armor', 'armour', 'tools'] },
	{ id: 'classes', label: 'Classes', icon: 'ev-shield-star', words: ['classes', 'subclasses'] },
	{ id: 'origins', label: 'Origins', icon: 'ev-users-three', words: ['origins', 'species', 'races', 'backgrounds'] },
	{ id: 'feats', label: 'Feats', icon: 'ev-medal', words: ['feats'] },
	{ id: 'rules', label: 'Rules', icon: 'ev-scales', words: ['rules', 'conditions'] },
];

const SEGMENT_OF: Record<EntryKind5e, Segment5e> = {
	monster: 'monsters', spell: 'spells', item: 'items', equipment: 'equipment', class: 'classes', subclass: 'classes',
	species: 'origins', background: 'origins', feat: 'feats', rule: 'rules', condition: 'rules',
};

export const KIND_LABEL_5E = (kind: string): string => (kind === 'monster' ? 'Monster' : KIND5E[kind as Kind5e]?.label ?? kind);

// ----------------------------------------------------------------------------
// Reading the data the same way in both editions

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s: string) => s.split(/([\s-]+)/).map(w => (/^(of|and|or|the)$/i.test(w) ? w.toLowerCase() : cap(w.toLowerCase()))).join('');

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];

/** "Rare (+1), Very Rare (+2), or Legendary (+3)" → Rare, Very Rare, Legendary. */
export function rarities(r: string): string[] {
	let rest = r.toLowerCase();
	const found = new Set<string>();
	if (rest.includes('very rare')) { found.add('Very Rare'); rest = rest.replace(/very rare/g, ''); }
	for (const x of ['Common', 'Uncommon', 'Rare', 'Legendary', 'Artifact']) if (new RegExp(`\\b${x.toLowerCase()}\\b`).test(rest)) found.add(x);
	const out = RARITIES.filter(x => found.has(x));
	return out.length ? out : [/varies/i.test(r) ? 'Varies' : cap(r.trim())];
}

/** "Wondrous Items" → "Wondrous item", "Staffs" → "Staff". */
export function itemType(t: string): string {
	const one = /ss$/i.test(t) ? t : t.replace(/s$/i, '');
	return cap(one.replace(/\bItem$/, 'item').trim());
}

/** "1 action", "Action", "Bonus Action, which you take…" → "Action", "Bonus action"; "1 minute" stays. */
export function castingTime(t: string): string {
	const head = t.split(/,| \(| or /)[0].trim().replace(/^1\s+(action|bonus action|reaction)$/i, '$1');
	return /^(action|bonus action|reaction)$/i.test(head) ? cap(head.toLowerCase()) : head;
}

/** "15 gp" → 15, "1 sp" → 0.1, "5 cp" → 0.05. */
export function priceGp(cost: string | undefined): number | undefined {
	const m = /^([\d,.]+)\s*(cp|sp|ep|gp|pp)\b/i.exec((cost ?? '').trim());
	if (!m) return undefined;
	const n = Number(m[1].replace(/,/g, ''));
	return n * ({ cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 } as Record<string, number>)[m[2].toLowerCase()];
}

const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

/** Damage types named in a list ("bludgeoning, piercing, and slashing from nonmagical attacks"). */
function damageTypes(list: string[] | undefined): string[] {
	const text = (list ?? []).join(' ').toLowerCase();
	return DAMAGE.filter(d => text.includes(d)).map(cap);
}

/** "Simple", "Martial" and "Melee", "Ranged" for a weapon, from either edition's fields. */
function weaponKind(e: { weaponCategory?: string; weaponRange?: string; category: string; tags?: string[]; damage?: string }): { weapon?: string; range?: string } {
	const words = [e.weaponCategory, e.weaponRange, e.category, ...(e.tags ?? [])].filter(Boolean).join(' ');
	if (!e.damage && !/weapon/i.test(words)) return {};
	return {
		weapon: /martial/i.test(words) ? 'Martial' : /simple/i.test(words) ? 'Simple' : undefined,
		range: /ranged/i.test(words) ? 'Ranged' : /melee/i.test(words) ? 'Melee' : undefined,
	};
}

/** One category for every edition's equipment: Weapon, Armor, Tools, Spellcasting focus… */
function equipmentCategory(e: { category: string; armorCategory?: string; ac?: unknown; damage?: string; tags?: string[] }): string {
	const c = e.category;
	if (e.damage || /weapon/i.test(c)) return 'Weapon';
	if (e.armorCategory || e.ac || /armor/i.test(c)) return 'Armor';
	if (/tool|gaming|instrument/i.test(c)) return 'Tools';
	if (/foci/i.test(c)) return 'Spellcasting focus';
	if (/mount|vehicle/i.test(c)) return 'Mounts and vehicles';
	return cap(c.toLowerCase());
}

const FEAT_TYPE: Record<string, string> = { origin: 'Origin', general: 'General', 'fighting-style': 'Fighting Style', 'epic-boon': 'Epic Boon' };

// ----------------------------------------------------------------------------
// Entries

const firstLine = (s: string | undefined, n = 200) => (s ?? '').toLowerCase().slice(0, n);

function monsterEntry(e: Dnd5eEntry, lore: boolean): Entry5e {
	const m = e.monster;
	const cr = crValue(m.cr);
	// "humanoid (goblinoid)" → Humanoid; "Swarm of Tiny Beasts" → Beast, and is:swarm.
	const base = (m.type ?? '').replace(/\s*\(.*$/, '').trim().toLowerCase();
	const swarm = /^swarm of \w+ (.+)$/.exec(base);
	const type = base ? cap(swarm ? swarm[1].replace(/s$/, '') : base) : undefined;
	const facets: Record<string, string[]> = {
		type: type ? [type] : [],
		size: m.size ? [cap(m.size.toLowerCase())] : [],
		source: [e.pack ?? (e.bundled ? (m.source ?? 'SRD') : 'Your notes')],
	};
	const nums: Record<string, number> = {};
	const flags: string[] = [];
	if (!lore) {
		facets.resist = damageTypes(m.resistances);
		facets.immune = [...damageTypes(m.immunities), ...(m.conditionImmunities ?? []).map(c => cap(c.trim().toLowerCase()))];
		facets.vuln = damageTypes(m.vulnerabilities);
		if (cr !== undefined) nums.cr = cr;
		nums.hp = m.hp;
		nums.ac = m.ac;
		nums.xp = xpOf(m);
		if (m.legendaryActions?.length) flags.push('legendary');
		if ((m.traits ?? []).concat(m.actions ?? []).some(f => /spellcasting/i.test(f.name))) flags.push('spellcaster');
	}
	if (!e.bundled && !e.pack) flags.push('mine');
	if (e.pack) flags.push('pack');
	if (swarm) flags.push('swarm');
	return {
		id: `monster:${m.bundledId ?? `${e.filePath}#${e.name}`}`,
		kind: 'monster', segments: ['monsters'], name: e.name,
		detail: lore ? [m.size, m.type].filter(Boolean).join(' ') : [`CR ${m.cr}`, [m.size, m.type].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
		badge: lore ? undefined : cr !== undefined ? crLabel(cr) : m.cr,
		facets, nums, flags,
		text: lore ? '' : [...(m.traits ?? []), ...(m.actions ?? [])].map(f => `${f.name} ${f.desc}`).join(' ').toLowerCase().slice(0, 2000),
		monster: e,
	};
}

function hitEntry(h: Hit5e): Entry5e {
	const facets: Record<string, string[]> = {};
	const nums: Record<string, number> = {};
	const flags: string[] = [];
	let text = '';
	let badge: string | undefined;
	switch (h.kind) {
		case 'spell': {
			const s = h.spell;
			nums.level = s.level;
			badge = s.level === 0 ? 'C' : String(s.level);
			facets.school = [s.school];
			facets.class = s.classes;
			facets.casting = [castingTime(s.castingTime)];
			if (s.concentration) flags.push('concentration');
			if (s.ritual) flags.push('ritual');
			if (s.level === 0) flags.push('cantrip');
			text = firstLine(s.desc, 600);
			break;
		}
		case 'item': {
			const i = h.item;
			facets.rarity = rarities(i.rarity);
			facets.type = [itemType(i.type)];
			if (i.attunement) flags.push('attunement');
			text = firstLine(i.desc, 600);
			break;
		}
		case 'equipment': {
			const e = h.equipment;
			facets.category = [equipmentCategory(e)];
			const w = weaponKind(e);
			if (w.weapon) facets.weapon = [w.weapon];
			if (w.range) facets.range = [w.range];
			if (e.damage) facets.damage = e.damage.split(/\s+/).slice(1).map(cap);
			if (e.properties?.length) facets.prop = e.properties.map(p => p.replace(/\s*\(.*$/, ''));
			if (e.mastery) facets.mastery = [e.mastery];
			// 2014 says armorCategory; 2024 only tags it ("Heavy Armor").
			const armor = e.armorCategory ?? e.tags?.map(t => /^(light|medium|heavy)\s+armor$/i.exec(t)?.[1]).find(Boolean) ?? (/^shield$/i.test(e.name) ? 'Shield' : undefined);
			if (armor) facets.armor = [cap(armor.replace(/\s*armor$/i, '').toLowerCase())];
			const gp = priceGp(e.cost);
			if (gp !== undefined) nums.price = gp;
			if (e.ac) nums.ac = e.ac.base;
			if (e.weight !== undefined) nums.weight = e.weight;
			text = firstLine(e.desc);
			break;
		}
		case 'class':
			facets.die = [`d${h.cls.hitDie}`];
			if (h.cls.spellcasting) flags.push('spellcaster');
			text = h.cls.features.map(f => f.name).join(' ').toLowerCase();
			break;
		case 'subclass':
			facets.class = [h.cls.name];
			text = h.subclass.features.map(f => `${f.name} ${f.desc}`).join(' ').toLowerCase().slice(0, 1500);
			break;
		case 'species':
			facets.size = [h.species.size];
			nums.speed = h.species.speed;
			text = h.species.traits.map(t => t.name).join(' ').toLowerCase();
			break;
		case 'background':
			if (h.background.feat) facets.feat = [h.background.feat];
			break;
		case 'feat':
			facets.category = [FEAT_TYPE[h.feat.type ?? ''] ?? (h.feat.type ? titleCase(h.feat.type) : 'General')];
			if (h.feat.prerequisite) flags.push('prerequisite');
			text = firstLine(h.feat.desc, 600);
			break;
		case 'rule':
			facets.topic = [h.rule.topic ?? h.name];
			text = firstLine(h.rule.desc, 800);
			break;
		case 'condition':
			facets.topic = ['Conditions'];
			text = firstLine(h.desc, 600);
			break;
	}
	// A content pack's entry says which pack; your homebrew (a block in the content folder) says Homebrew.
	const own = Object.values(h).find(v => v && typeof v === 'object' && typeof (v as { source?: unknown }).source === 'string') as { source?: string; note?: string } | undefined;
	if (own?.source) { facets.source = [own.source]; flags.push(own.note ? 'homebrew' : 'pack'); }
	return { id: `${h.kind}:${h.name}`, kind: h.kind, segments: [SEGMENT_OF[h.kind]], name: h.name, detail: h.detail, badge, facets, nums, flags, text, hit: h };
}

const hitCache = new Map<string, Entry5e[]>();

/**
 * Every entry for an edition: the monsters a note can see, your spells and
 * items (`mine`, which replace the SRD's of the same name), then the compendium.
 */
export function buildEntries5e(edition: Dnd5eEdition, monsters: Dnd5eEntry[], lore = false, mine: Hit5e[] = []): Entry5e[] {
	// Content packs change what's in the compendium: the version keeps the cache honest.
	const key = `${edition}:${contentVersion5e()}`;
	let hits = hitCache.get(key);
	if (!hits) { hitCache.clear(); hitCache.set(key, hits = allHits(edition).map(hitEntry)); }
	const yours = mine.map(h => { const e = hitEntry(h); e.id = `mine:${e.id}`; e.facets.source = ['Your notes']; e.flags.push('mine'); return e; });
	const taken = new Set(mine.map(h => `${h.kind}:${h.name.toLowerCase()}`));
	return [...monsters.map(m => monsterEntry(m, lore)), ...yours, ...(taken.size ? hits.filter(e => !taken.has(`${e.kind}:${e.name.toLowerCase()}`)) : hits)];
}

// ----------------------------------------------------------------------------
// The search language's words for 5e

const first = (e: Entry5e, key: string) => e.facets[key]?.[0];
const SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const KIND_ORDER: EntryKind5e[] = ['monster', 'spell', 'item', 'equipment', 'class', 'subclass', 'species', 'background', 'feat', 'rule', 'condition'];
const PLURAL = (k: EntryKind5e) => (k === 'monster' ? 'Monsters' : KIND5E[k].plural);
const spellLevel = (n: number | undefined) => (n === undefined ? 'Other' : n === 0 ? 'Cantrips' : `Level ${n}`);

export const SORTS_5E: SortDef<Entry5e>[] = [
	{ key: 'relevance', label: 'Best match', aliases: ['best', 'match'] },
	{ key: 'name', label: 'Name', aliases: ['az', 'alpha'], value: e => e.name.toLowerCase(), group: e => (/[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : '#') },
	{ key: 'cr', label: 'Challenge', aliases: ['challenge'], value: e => e.nums.cr, group: e => (e.nums.cr === undefined ? 'No CR' : `CR ${crLabel(e.nums.cr)}`) },
	{ key: 'level', label: 'Level', aliases: ['lvl'], value: e => e.nums.level, group: e => spellLevel(e.nums.level) },
	{ key: 'type', label: 'Type', value: e => first(e, 'type')?.toLowerCase(), group: e => first(e, 'type') ?? 'Other' },
	{ key: 'size', label: 'Size', value: e => SIZE_ORDER.indexOf(first(e, 'size') ?? '') + 1 || undefined, group: e => first(e, 'size') ?? 'Any size' },
	{ key: 'hp', label: 'HP', value: e => e.nums.hp },
	{ key: 'school', label: 'School', value: e => first(e, 'school')?.toLowerCase(), group: e => first(e, 'school') ?? 'Other' },
	{ key: 'class', label: 'Class', value: e => first(e, 'class')?.toLowerCase(), group: e => first(e, 'class') ?? 'Any class' },
	{ key: 'rarity', label: 'Rarity', value: e => RARITIES.indexOf(first(e, 'rarity') ?? '') + 1 || undefined, group: e => first(e, 'rarity') ?? 'Other' },
	{ key: 'category', label: 'Category', aliases: ['cat'], value: e => first(e, 'category')?.toLowerCase(), group: e => first(e, 'category') ?? 'Other' },
	{ key: 'price', label: 'Price', aliases: ['cost', 'gp'], value: e => e.nums.price },
	{ key: 'kind', label: 'Kind', value: e => KIND_ORDER.indexOf(e.kind), group: e => PLURAL(e.kind) },
	{ key: 'topic', label: 'Topic', value: e => first(e, 'topic')?.toLowerCase(), group: e => first(e, 'topic') ?? 'Other' },
	{ key: 'source', label: 'Source', aliases: ['book'], value: e => first(e, 'source')?.toLowerCase(), group: e => first(e, 'source') ?? 'Other' },
];

const SORTS_FOR: Record<Segment5e, string[]> = {
	all: ['kind', 'name'],
	monsters: ['cr', 'name', 'type', 'size', 'hp', 'source'],
	spells: ['level', 'name', 'school', 'class'],
	items: ['rarity', 'name', 'type'],
	equipment: ['category', 'name', 'price'],
	classes: ['kind', 'name', 'class'],
	origins: ['kind', 'name', 'size'],
	feats: ['category', 'name'],
	rules: ['topic', 'name'],
};

const NOUN: Record<Segment5e, [string, string]> = {
	all: ['entry', 'entries'], monsters: ['monster', 'monsters'], spells: ['spell', 'spells'], items: ['item', 'items'], equipment: ['item', 'items'],
	classes: ['entry', 'entries'], origins: ['entry', 'entries'], feats: ['feat', 'feats'], rules: ['entry', 'entries'],
};

export const QUERY_SCHEMA_5E: QuerySchema<Entry5e, Segment5e> = {
	segments: SEGMENTS_5E,
	facets: [
		{ key: 'cr', label: 'Challenge', aliases: ['challenge'], numeric: true, hint: '1/4, 5, >10' },
		{ key: 'type', label: 'Type', aliases: ['creature'], hint: 'Undead, Dragon, Wondrous item…' },
		{ key: 'size', label: 'Size', hint: 'Small, Large…' },
		{ key: 'hp', label: 'HP', numeric: true, hint: '>50' },
		{ key: 'ac', label: 'AC', numeric: true, hint: '>=15' },
		{ key: 'xp', label: 'XP', numeric: true, hint: '<500' },
		{ key: 'resist', label: 'Resists', aliases: ['resistance'], hint: 'fire…' },
		{ key: 'immune', label: 'Immune to', aliases: ['immunity'], hint: 'poison…' },
		{ key: 'vuln', label: 'Vulnerable to', aliases: ['vulnerable'], hint: 'radiant…' },
		{ key: 'level', label: 'Spell level', aliases: ['lvl'], numeric: true, hint: 'cantrip, 3, >=5' },
		{ key: 'school', label: 'School', hint: 'Evocation, Necromancy…' },
		{ key: 'class', label: 'Class', hint: 'Wizard, Cleric…' },
		{ key: 'casting', label: 'Casting time', aliases: ['cast', 'time'], hint: 'Action, Reaction…' },
		{ key: 'rarity', label: 'Rarity', hint: 'Rare…' },
		{ key: 'category', label: 'Category', aliases: ['cat'], hint: 'Weapon, Armor, Origin…' },
		{ key: 'weapon', label: 'Weapon', hint: 'Simple, Martial' },
		{ key: 'range', label: 'Range', hint: 'Melee, Ranged' },
		{ key: 'damage', label: 'Damage type', aliases: ['dmg'], hint: 'slashing…' },
		{ key: 'prop', label: 'Property', aliases: ['property', 'properties'], hint: 'Finesse, Light…' },
		{ key: 'mastery', label: 'Mastery', hint: 'Vex, Topple…' },
		{ key: 'armor', label: 'Armor', hint: 'Light, Medium, Heavy' },
		{ key: 'price', label: 'Price (gp)', aliases: ['cost', 'gp'], numeric: true, hint: '<10' },
		{ key: 'die', label: 'Hit die', aliases: ['hitdie'], hint: 'd8, d12…' },
		{ key: 'feat', label: 'Feat', hint: 'Alert…' },
		{ key: 'speed', label: 'Speed', numeric: true, hint: '30' },
		{ key: 'topic', label: 'Topic', hint: 'Combat, Conditions…' },
		{ key: 'source', label: 'Source', aliases: ['book', 'from'], hint: 'SRD 5.2, Your notes' },
		{ key: 'kind', label: 'Kind', hint: 'Spell, Monster…' },
		{ key: 'tag', label: 'Tag', aliases: ['tags', 'keyword'], hint: 'any keyword' },
	],
	sorts: SORTS_5E,
	sortsFor: (seg, lore) => (lore && seg === 'monsters' ? ['name', 'type', 'size', 'source'] : SORTS_FOR[seg]),
	kindLabel: KIND_LABEL_5E,
	noun(seg, n) {
		const [one, many] = NOUN[seg];
		return `${n} ${n === 1 ? one : many}`;
	},
	wordNums: { cantrip: 0, cantrips: 0 },
	valueAlias: (key, b) => (key === 'die' ? b.replace(/^\d*d?(\d+)$/, 'd$1') : b),
	tieBreak: (a, b) => (a.nums.cr ?? a.nums.level ?? 0) - (b.nums.cr ?? b.nums.level ?? 0) || a.name.localeCompare(b.name),
	numText: (key, n) => (key === 'cr' ? crLabel(n) : key === 'level' && n === 0 ? 'Cantrip' : String(n)),
	tokenValue: (key, v) => (key === 'level' && v === 'Cantrip' ? 'cantrip' : v),
	flagHint: 'legendary, concentration, ritual…',
};

/** The search language, bound to 5e's words. */
export const QUERY_5E = createCompendiumQuery(QUERY_SCHEMA_5E);

/** What goes in a note to point at an entry. */
export function entryReference5e(e: Entry5e): string {
	return e.monster ? `\`5e:${e.name}\`` : `\`5e:${e.kind}:${e.name}\``;
}

/** The facts on a row, as pills. */
export function entryPills5e(e: Entry5e, lore: boolean): { text: string; tone?: string }[] {
	const f = (k: string) => e.facets[k] ?? [];
	if (e.monster) {
		const out: { text: string; tone?: string }[] = [...f('size'), ...f('type')].map(text => ({ text }));
		if (!lore && e.nums.xp) out.push({ text: `${e.nums.xp.toLocaleString('en-US')} XP` });
		if (e.flags.includes('legendary')) out.push({ text: 'Legendary', tone: 'legendary' });
		return out;
	}
	const h = e.hit!;
	switch (h.kind) {
		case 'spell': return [...f('school'), ...f('casting'), ...(e.flags.includes('concentration') ? ['Concentration'] : []), ...(e.flags.includes('ritual') ? ['Ritual'] : [])].map(text => ({ text }));
		case 'item': return [...f('rarity'), ...f('type'), ...(e.flags.includes('attunement') ? ['Attunement'] : [])].map(text => ({ text }));
		case 'equipment': return [...f('weapon'), ...f('category'), h.equipment.damage ?? '', h.equipment.cost ?? ''].filter(Boolean).map(text => ({ text }));
		case 'class': return [...f('die').map(d => `${d} hit die`), h.cls.primary ?? ''].filter(Boolean).map(text => ({ text }));
		case 'subclass': return [`${h.cls.name} subclass`].map(text => ({ text }));
		case 'feat': return [...f('category'), h.feat.prerequisite ? `Needs ${h.feat.prerequisite}` : ''].filter(Boolean).map(text => ({ text }));
		default: return [];
	}
}
