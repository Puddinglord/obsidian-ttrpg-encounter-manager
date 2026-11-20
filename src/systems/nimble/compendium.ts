// The player compendium: classes, ancestries, backgrounds, items, spells and
// boons transcribed from the Nimble books (src/data/compendium.json, built by
// scripts/compendium/merge.py; schema in scripts/compendium/EXTRACTION-BRIEF.md).
// Pure: no Obsidian imports. Every collection may be missing, so everything here
// reads defensively and unknown names simply come back undefined.

export type StatKey = 'STR' | 'DEX' | 'INT' | 'WIL';
export const STATS: StatKey[] = ['STR', 'DEX', 'INT', 'WIL'];

/** Where an entry comes from. */
export interface Sourced {
	name: string;
	source?: string;
	page?: number | null;
	draft?: boolean;
}

export interface Feature {
	name: string;
	text: string;
	/**
	 * What the feature has you choose, when its words don't name the lists (the Commander's "another Combat
	 * Ability"): the lists to pick from, how many, a name for them together, and choices offered instead that can be
	 * taken more than once ("+1 max Combat Dice"). Homebrew and imported classes can set it on any feature.
	 */
	choose?: { name?: string; from: string[]; count?: number; or?: string[] };
}
export interface LevelFeatures { level: number; features: Feature[] }

export interface ClassOption extends Sourced { cost?: string; text: string; requirement?: string }
export interface OptionGroup { name: string; intro?: string; options: ClassOption[] }

export interface Subclass extends Sourced {
	flavor?: string;
	complexity?: number;
	story?: boolean;
	intro?: string;
	levels?: LevelFeatures[];
	optionGroups?: OptionGroup[];
}

export interface ClassResource { name: string; max?: string | number; reset?: string; die?: string }

export interface Casting {
	mana?: string;
	manaFormula?: string;
	manaFromLevel?: number;
	schools?: string[];
	notes?: string;
}

export interface ClassEntry extends Sourced {
	tagline?: string;
	flavor?: string;
	complexity?: number;
	keyStats?: string[];
	hitDie?: number;
	startingHp?: number;
	saves?: { adv?: string; dis?: string };
	armor?: string;
	weapons?: string;
	startingGear?: string[];
	casting?: Casting;
	resources?: ClassResource[];
	levels?: LevelFeatures[];
	sidebars?: { title: string; text: string }[];
	optionGroups?: OptionGroup[];
	subclasses?: Subclass[];
	/** Older files printed class spells inline; the merged file has them top-level, tagged with `class`. */
	spells?: Spell[];
	/** Names of the spells the class can use (Core reprints included). */
	spellList?: string[];
	/** The level 1 "Skilled Hero" adjustments (3.x class books): skill name → bonus, e.g. { Might: 2, Finesse: -2 }. */
	skillMods?: Record<string, number>;
	faq?: { q: string; a: string }[];
}

export interface Ancestry extends Sourced { rarity?: string; size?: string; flavor?: string; traits?: Feature[] }
export interface Background extends Sourced { text?: string; requirement?: string; category?: string }
export interface Motivation extends Sourced { text?: string; roll?: string }

export interface Item extends Sourced {
	category?: string;
	subcategory?: string;
	cost?: string;
	damage?: string;
	stat?: string;
	properties?: string[];
	range?: string;
	armor?: string;
	strength?: number;
	slots?: number;
	rarity?: string;
	text?: string;
	damageType?: string;
}

export interface Property extends Sourced { text?: string }

export interface Spell extends Sourced {
	school?: string;
	tier?: number;
	utility?: boolean;
	actions?: string;
	range?: string;
	aoe?: string;
	concentration?: string;
	damage?: string;
	text?: string;
	higherLevels?: string;
	cantripScaling?: string;
	/** Class-only spells name their class. */
	class?: string;
	/** GM's Guide secret spells (rewards). */
	secret?: boolean;
}

export interface Boon extends Sourced { kind?: string; text?: string; requirement?: string }

export interface Rules {
	statArrays?: { name: string; values: number[] }[];
	skills?: { name: string; stat: string; text?: string }[];
	languages?: { name: string; speakers?: string }[];
	levelUp?: string[];
	hpAverage?: Record<string, number>;
	inventory?: string;
	[key: string]: unknown;
}

export interface CompendiumData {
	classes?: ClassEntry[];
	ancestries?: Ancestry[];
	backgrounds?: Background[];
	motivations?: Motivation[];
	items?: Item[];
	properties?: Property[];
	spells?: Spell[];
	boons?: Boon[];
	rules?: Rules;
}

/** What the pickers and Spotlight search over. Options and class/subclass features are both 'feature'. */
export type CompendiumKind = 'class' | 'subclass' | 'ancestry' | 'background' | 'item' | 'spell' | 'feature' | 'boon';
export const COMPENDIUM_KINDS: CompendiumKind[] = ['item', 'spell', 'feature', 'class', 'subclass', 'ancestry', 'background', 'boon'];

export const KIND_LABEL: Record<CompendiumKind, string> = {
	class: 'Class', subclass: 'Subclass', ancestry: 'Ancestry', background: 'Background',
	item: 'Item', spell: 'Spell', feature: 'Feature', boon: 'Boon',
};

/** One searchable entry, with enough context to show and use it. */
export interface CompendiumHit {
	kind: CompendiumKind;
	name: string;
	/** A short line under the name: "Weapon · 1d10+STR slashing", "Fire · Cantrip"… */
	detail: string;
	/** Rules text, when there is some. */
	text?: string;
	source?: string;
	page?: number | null;
	draft?: boolean;
	/** The class a feature, option or subclass belongs to. */
	className?: string;
	/** The subclass a feature belongs to. */
	subclass?: string;
	/** Option group ("Savage Arsenal") for class options. */
	group?: string;
	/** Level a class or subclass feature arrives at. */
	level?: number;
	/** "Passive", "1 Action", "1+ Mana" for options. */
	cost?: string;
	entry: unknown;
}

export interface ResolvedFeature extends Feature {
	level: number;
	from: 'class' | 'subclass';
	className: string;
	subclass?: string;
	source?: string;
	page?: number | null;
	draft?: boolean;
}

/** Lookup key: case, punctuation, curly quotes and spacing don't matter ("Short Sword" = "shortsword"). */
export function nameKey(name: string): string {
	return String(name ?? '').toLowerCase().replace(/[’‘`]/g, '\'').replace(/[^a-z0-9]+/g, '');
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter(x => !!x && typeof x === 'object') : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export function tierLabel(tier: number | undefined): string {
	return !tier ? 'Cantrip' : `Tier ${tier}`;
}

export function itemDetail(it: Item): string {
	const cat = it.category ? it.category[0].toUpperCase() + it.category.slice(1) : 'Item';
	const bits = [it.subcategory && it.category !== 'gear' ? `${cat} (${it.subcategory})` : cat];
	if (it.damage) bits.push(weaponDamage(it));
	if (it.armor) bits.push(`${it.armor} armor`);
	if (it.properties?.length) bits.push(it.properties.join(', '));
	if (it.rarity) bits.push(it.rarity);
	if (it.cost) bits.push(it.cost);
	return bits.join(' · ');
}

/** "1d10+STR slashing", whichever way the file writes it (stat and type inline, or as their own keys). */
export function weaponDamage(it: Item): string {
	if (!it.damage) return '';
	const stat = it.stat && !/\b(STR|DEX|INT|WIL|KEY)\b/i.test(it.damage) ? `+${it.stat}` : '';
	const type = it.damageType && !it.damage.toLowerCase().includes(it.damageType.toLowerCase()) ? ` ${it.damageType}` : '';
	return `${it.damage}${stat}${type}`;
}

export function spellDetail(s: Spell): string {
	return [s.school, s.utility ? `Utility ${tierLabel(s.tier).toLowerCase()}` : tierLabel(s.tier), s.actions, s.range, s.damage].filter(Boolean).join(' · ');
}

export class Compendium {
	readonly classes: ClassEntry[];
	readonly ancestries: Ancestry[];
	readonly backgrounds: Background[];
	readonly motivations: Motivation[];
	readonly items: Item[];
	readonly properties: Property[];
	readonly spells: Spell[];
	readonly boons: Boon[];
	readonly rules: Rules;
	private maps = new Map<string, Map<string, unknown>>();
	private hits: CompendiumHit[] | null = null;

	/**
	 * `drafts: false` leaves out everything from draft books (expansion classes
	 * in playtest), as if it weren't in the file.
	 */
	constructor(data: unknown, opts: { drafts?: boolean } = {}) {
		const d = (data && typeof data === 'object' ? data : {}) as CompendiumData;
		const keep = <T extends Sourced>(list: T[]): T[] => list.filter(e => typeof e.name === 'string' && e.name.trim() && (opts.drafts !== false || !e.draft));
		this.classes = keep(arr<ClassEntry>(d.classes));
		this.ancestries = keep(arr<Ancestry>(d.ancestries));
		this.backgrounds = keep(arr<Background>(d.backgrounds));
		this.motivations = keep(arr<Motivation>(d.motivations));
		this.items = keep(arr<Item>(d.items));
		this.properties = keep(arr<Property>(d.properties));
		// Class books print their own spell lists; they're spells like any other, tagged with the class's source.
		const classSpells = this.classes.flatMap(c => arr<Spell>(c.spells).map(s => ({ source: c.source, draft: c.draft, ...s })));
		this.spells = keep([...arr<Spell>(d.spells), ...classSpells]);
		this.boons = keep(arr<Boon>(d.boons));
		this.rules = (d.rules && typeof d.rules === 'object' ? d.rules : {});
		this.index('class', this.classes);
		this.index('ancestry', this.ancestries);
		this.index('background', this.backgrounds);
		this.index('item', this.items);
		this.index('property', this.properties);
		this.index('spell', this.spells);
		this.index('boon', this.boons);
	}

	get isEmpty(): boolean {
		return !this.classes.length && !this.items.length && !this.spells.length && !this.ancestries.length;
	}

	private index(kind: string, list: Sourced[]): void {
		const m = new Map<string, unknown>();
		for (const e of list) { const k = nameKey(e.name); if (!m.has(k)) m.set(k, e); }
		// "Club/Mace" is also found as "Club" and as "Mace" (class starting gear names one of them).
		for (const e of list) {
			if (!e.name.includes('/')) continue;
			for (const part of e.name.split('/')) { const k = nameKey(part); if (k && !m.has(k)) m.set(k, e); }
		}
		this.maps.set(kind, m);
	}

	private get<T>(kind: string, name: string | undefined | null): T | undefined {
		if (!name) return undefined;
		return this.maps.get(kind)?.get(nameKey(name)) as T | undefined;
	}

	classByName(name: string | undefined | null): ClassEntry | undefined { return this.get('class', name); }
	ancestry(name: string | undefined | null): Ancestry | undefined { return this.get('ancestry', name); }
	background(name: string | undefined | null): Background | undefined { return this.get('background', name); }
	spell(name: string | undefined | null): Spell | undefined { return this.get('spell', name); }
	boon(name: string | undefined | null): Boon | undefined { return this.get('boon', name); }
	property(name: string | undefined | null): Property | undefined {
		// "Range 8", "Thrown 4", "Load: 1 action" are the Range/Thrown/Load properties.
		return this.get('property', name) ?? this.get('property', String(name ?? '').replace(/[:\s]*\d.*$|\s*\(.*\)$/, ''));
	}

	/**
	 * An item by name, forgiving the ways a note writes it: "Rations (meat)" finds
	 * "Rations", "Javelin" finds "Javelins", "Shortsword" finds "Short Sword".
	 */
	item(name: string | undefined | null): Item | undefined {
		if (!name) return undefined;
		const plain = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
		for (const n of [name, plain, `${name}s`, name.replace(/e?s$/i, ''), `${plain}s`, plain.replace(/e?s$/i, '')]) {
			const hit = this.get<Item>('item', n);
			if (hit) return hit;
		}
		return undefined;
	}

	subclass(className: string | undefined | null, name: string | undefined | null): Subclass | undefined {
		if (!name) return undefined;
		const k = nameKey(name);
		const inClass = (c?: ClassEntry) => arr<Subclass>(c?.subclasses).find(s => nameKey(s.name) === k);
		return inClass(this.classByName(className)) ?? this.classes.map(c => inClass(c)).find(Boolean);
	}

	/** The class a subclass belongs to, when only the subclass is known. */
	classOfSubclass(name: string): ClassEntry | undefined {
		const k = nameKey(name);
		return this.classes.find(c => arr<Subclass>(c.subclasses).some(s => nameKey(s.name) === k));
	}

	/** Class features up to `level`, then the subclass's, each in book order. */
	featuresFor(className: string | undefined | null, subclass: string | undefined | null, level: number): ResolvedFeature[] {
		const cls = this.classByName(className);
		if (!cls) return [];
		const out: ResolvedFeature[] = [];
		const add = (levels: LevelFeatures[] | undefined, from: 'class' | 'subclass', src: Sourced, sub?: string) => {
			for (const l of arr<LevelFeatures>(levels).slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0))) {
				if ((l.level ?? 0) > level) continue;
				for (const f of arr<Feature>(l.features)) {
					out.push({ name: str(f.name), text: str(f.text), ...(f.choose ? { choose: f.choose } : {}), level: l.level, from, className: cls.name, subclass: sub, source: src.source ?? cls.source, page: src.page ?? cls.page, draft: src.draft ?? cls.draft });
				}
			}
		};
		add(cls.levels, 'class', cls);
		const sub = this.subclass(cls.name, subclass);
		if (sub) add(sub.levels, 'subclass', sub, sub.name);
		return out;
	}

	/** Features gained exactly at `level` (for the level-up wizard). */
	featuresAt(className: string | undefined | null, subclass: string | undefined | null, level: number): ResolvedFeature[] {
		return this.featuresFor(className, subclass, level).filter(f => f.level === level);
	}

	/** The class's option groups, then its subclass's. */
	optionGroups(className: string | undefined | null, subclass?: string | null): OptionGroup[] {
		const cls = this.classByName(className);
		if (!cls) return [];
		const sub = this.subclass(cls.name, subclass);
		return [...arr<OptionGroup>(cls.optionGroups), ...arr<OptionGroup>(sub?.optionGroups)];
	}

	/** A class option ("Death Blow") anywhere, preferring the given class. */
	option(name: string, className?: string | null): { option: ClassOption; group: OptionGroup; cls: ClassEntry; subclass?: Subclass } | undefined {
		const k = nameKey(name);
		const order = [...this.classes].sort((a, b) => Number(nameKey(b.name) === nameKey(className ?? '')) - Number(nameKey(a.name) === nameKey(className ?? '')));
		for (const cls of order) {
			const groups: [OptionGroup, Subclass | undefined][] = [
				...arr<OptionGroup>(cls.optionGroups).map(g => [g, undefined] as [OptionGroup, undefined]),
				...arr<Subclass>(cls.subclasses).flatMap(s => arr<OptionGroup>(s.optionGroups).map(g => [g, s] as [OptionGroup, Subclass])),
			];
			for (const [group, subclass] of groups) {
				const option = arr<ClassOption>(group.options).find(o => nameKey(o.name) === k);
				if (option) return { option, group, cls, subclass };
			}
		}
		return undefined;
	}

	/** Every entry as a search hit (built once). */
	all(): CompendiumHit[] {
		if (this.hits) return this.hits;
		const out: CompendiumHit[] = [];
		const base = (e: Sourced) => ({ source: e.source, page: e.page, draft: !!e.draft });
		for (const it of this.items) out.push({ kind: 'item', name: it.name, detail: itemDetail(it), text: it.text, ...base(it), entry: it });
		for (const s of this.spells) out.push({ kind: 'spell', name: s.name, detail: spellDetail(s), text: s.text, ...base(s), entry: s });
		for (const c of this.classes) {
			out.push({ kind: 'class', name: c.name, detail: [c.tagline, c.hitDie ? `d${c.hitDie}` : ''].filter(Boolean).join(' · '), text: c.flavor, ...base(c), entry: c });
			for (const l of arr<LevelFeatures>(c.levels)) for (const f of arr<Feature>(l.features)) {
				if (/^(subclass|key stat increase|secondary stat increase|epic boon)$/i.test(f.name)) continue; // placeholders, not abilities
				out.push({ kind: 'feature', name: f.name, detail: `${c.name} · Level ${l.level}`, text: f.text, className: c.name, level: l.level, ...base(c), entry: f });
			}
			for (const g of arr<OptionGroup>(c.optionGroups)) for (const o of arr<ClassOption>(g.options)) {
				out.push({ kind: 'feature', name: o.name, detail: [c.name, g.name, o.cost, o.requirement].filter(Boolean).join(' · '), text: o.text, className: c.name, group: g.name, cost: o.cost, ...base(c), entry: o });
			}
			for (const s of arr<Subclass>(c.subclasses)) {
				const sb = { source: s.source ?? c.source, page: s.page ?? c.page, draft: !!(s.draft ?? c.draft) };
				out.push({ kind: 'subclass', name: s.name, detail: `${c.name} subclass${s.story ? ' · Story' : ''}`, text: s.flavor, className: c.name, ...sb, entry: s });
				for (const l of arr<LevelFeatures>(s.levels)) for (const f of arr<Feature>(l.features)) {
					out.push({ kind: 'feature', name: f.name, detail: `${s.name} · Level ${l.level}`, text: f.text, className: c.name, subclass: s.name, level: l.level, ...sb, entry: f });
				}
				for (const g of arr<OptionGroup>(s.optionGroups)) for (const o of arr<ClassOption>(g.options)) {
					out.push({ kind: 'feature', name: o.name, detail: [s.name, g.name, o.cost].filter(Boolean).join(' · '), text: o.text, className: c.name, subclass: s.name, group: g.name, cost: o.cost, ...sb, entry: o });
				}
			}
		}
		for (const a of this.ancestries) out.push({ kind: 'ancestry', name: a.name, detail: [a.size, a.rarity].filter(Boolean).join(' · '), text: a.traits?.map(t => `${t.name}. ${t.text}`).join('\n') || a.flavor, ...base(a), entry: a });
		for (const b of this.backgrounds) out.push({ kind: 'background', name: b.name, detail: ['Background', b.requirement].filter(Boolean).join(' · '), text: b.text, ...base(b), entry: b });
		for (const b of this.boons) out.push({ kind: 'boon', name: b.name, detail: [b.kind ? `${b.kind[0].toUpperCase()}${b.kind.slice(1)} boon` : 'Boon', b.requirement].filter(Boolean).join(' · '), text: b.text, ...base(b), entry: b });
		this.hits = out;
		return out;
	}

	/**
	 * Entries whose name holds `query`: names that start with it first, then a
	 * word starting with it, then anywhere; shorter names first within each. With
	 * no query, everything of those kinds in name order.
	 */
	search(query: string, kinds?: CompendiumKind[], limit = 50): CompendiumHit[] {
		const want = kinds?.length ? new Set(kinds) : null;
		const pool = this.all().filter(h => !want || want.has(h.kind));
		const q = query.trim().toLowerCase().replace(/[’‘]/g, '\'');
		if (!q) return [...pool].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
		const scored: { h: CompendiumHit; s: number }[] = [];
		for (const h of pool) {
			const n = h.name.toLowerCase().replace(/[’‘]/g, '\'');
			const i = n.indexOf(q);
			let s: number;
			if (i === 0) s = 0;
			else if (i > 0 && /[\s\-_:(/]/.test(n[i - 1])) s = 1;
			else if (i > 0) s = 2;
			else if (nameKey(n).includes(nameKey(q)) && nameKey(q)) s = 3;
			else continue;
			scored.push({ h, s: s * 1000 + n.length });
		}
		return scored.sort((a, b) => a.s - b.s || a.h.name.localeCompare(b.h.name)).slice(0, limit).map(x => x.h);
	}
}
