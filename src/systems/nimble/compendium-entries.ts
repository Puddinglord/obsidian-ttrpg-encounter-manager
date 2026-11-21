// Everything the compendium can show, as one list of entries: monsters (bundled
// and your own), NPCs, companions, spells, items, class features, classes and
// subclasses, ancestries and backgrounds, boons, conditions and rules. Each
// entry carries the facets the search filters on (type, level, school, die…)
// and the values it sorts by. Pure: no Obsidian imports.

import { CompendiumHit, CompendiumKind, Compendium, Item, Spell, ClassEntry, Subclass, Ancestry, Background, Boon, tierLabel, weaponDamage, nameKey } from './compendium';
import type { MonsterIndexEntry, NimbleCondition } from './types';
import { formatLevel, levelValue, monsterRole } from './rules';
import { HOMEBREW } from '../../core/content/blocks';

/** The tabs of the compendium. */
export type Segment = 'all' | 'adversaries' | 'npcs' | 'companions' | 'spells' | 'items' | 'features' | 'classes' | 'origins' | 'rules';

export interface SegmentDef {
	id: Segment;
	label: string;
	/** Players look creatures up; they don't fight them. */
	playerLabel?: string;
	/** Its tab's icon: one of ours (core/icons.ts), as `ev-<name>`. */
	icon: string;
	/** Typed as `in:<word>` (any of these). */
	words: string[];
}

export const SEGMENTS: SegmentDef[] = [
	{ id: 'all', label: 'All', icon: 'ev-books', words: ['all', 'everything'] },
	{ id: 'adversaries', label: 'Adversaries', playerLabel: 'Creatures', icon: 'ev-skull', words: ['adversaries', 'monsters', 'creatures', 'bestiary', 'foes'] },
	{ id: 'npcs', label: 'NPCs', icon: 'ev-user', words: ['npcs', 'people', 'characters'] },
	{ id: 'companions', label: 'Companions', icon: 'ev-paw-print', words: ['companions', 'pets', 'allies'] },
	{ id: 'spells', label: 'Spells', icon: 'ev-spell', words: ['spells', 'magic'] },
	{ id: 'items', label: 'Items', icon: 'ev-backpack', words: ['items', 'gear', 'equipment', 'weapons', 'armor'] },
	{ id: 'features', label: 'Features', icon: 'ev-sparkle', words: ['features', 'abilities', 'options', 'boons'] },
	{ id: 'classes', label: 'Classes', icon: 'ev-shield-star', words: ['classes', 'subclasses'] },
	{ id: 'origins', label: 'Origins', icon: 'ev-users-three', words: ['origins', 'ancestries', 'backgrounds'] },
	{ id: 'rules', label: 'Rules', icon: 'ev-scales', words: ['rules', 'conditions'] },
];

export function segmentDef(id: Segment): SegmentDef {
	return SEGMENTS.find(s => s.id === id) ?? SEGMENTS[0];
}

export type EntryKind = 'monster' | 'npc' | 'condition' | 'rule' | CompendiumKind;

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
	monster: 'Adversary', npc: 'NPC', condition: 'Condition', rule: 'Rule',
	class: 'Class', subclass: 'Subclass', ancestry: 'Ancestry', background: 'Background',
	item: 'Item', spell: 'Spell', feature: 'Feature', boon: 'Boon',
};

/** An NPC note, as the campaigns index knows it. */
export interface NpcLike {
	path: string;
	name: string;
	aliases: string[];
	role?: string;
	campaign?: string;
}

/** A rules section (a skill, "Inventory", "Adventuring Companions"…). */
export interface RuleEntry {
	name: string;
	text: string;
	topic: string;
	source?: string;
	page?: number | null;
	draft?: boolean;
	/** From a content pack (its name). */
	pack?: string;
	/** Written in your note (homebrew). */
	note?: string;
}

export interface Entry {
	/** Unique and stable: "monster:goblin", "spell:fireball", "feature:oathsworn:layonhands". */
	id: string;
	kind: EntryKind;
	/** Every tab it shows in besides All. */
	segments: Segment[];
	name: string;
	/** A short line under the name. */
	detail: string;
	/** Text on the badge left of the name: a level, a tier. */
	badge?: string;
	/** Facet key → values as shown ("Goblins", "Fire"). */
	facets: Record<string, string[]>;
	/** Numbers for comparisons and sorting: level, tier, price, hp… */
	nums: Record<string, number>;
	/** `is:` words: minion, legendary, cantrip, concentration, draft, mine… */
	flags: string[];
	/** Lower-cased text beyond the name that a search can find (abilities, rules text). */
	text: string;
	monster?: MonsterIndexEntry;
	/** Players: every printing of this creature (both books, several levels). */
	printings?: MonsterIndexEntry[];
	/** Players: you've written notes on this creature. */
	noted?: boolean;
	npc?: NpcLike;
	hit?: CompendiumHit;
	condition?: NimbleCondition;
	rule?: RuleEntry;
}

export interface BuildInput {
	monsters: MonsterIndexEntry[];
	npcs?: NpcLike[];
	compendium?: Compendium;
	conditions?: NimbleCondition[];
	/** Player view: monsters as lore (no levels or stats), one entry per creature. */
	lore?: boolean;
	/** Player view: lower-cased base names of creatures with notes. */
	noted?: Set<string>;
	/** Campaign folder → name, for the NPC facet. */
	campaignNames?: Map<string, string>;
}

// ----------------------------------------------------------------------------
// Monsters

/** "Bandit (GM Guide)" and "Ogre (lvl 5)" are the same creature as "Bandit" and "Ogre" to a player. */
export function baseCreatureName(name: string): string {
	return name.replace(/\s+\((?:GM Guide|lvl [^)]*)\)$/i, '').trim();
}

/** Which book a monster is from (a content pack's name, or "Your note"), short and long. */
export function bookOf(e: MonsterIndexEntry): { short: string; long: string } {
	if (e.pack) return { short: e.pack, long: e.pack };
	if (!e.bundled) return { short: 'Note', long: 'Your note' };
	const gmg = e.monster.source?.startsWith('GM');
	return gmg ? { short: 'GMG', long: e.monster.source ?? 'GM Guide' } : { short: 'M&M', long: e.monster.source ?? 'Monsters & More' };
}

/** A creature's identity: `nimble: companion` stat blocks, or a type or group that says companion, are companions. */
export function isCompanionMonster(e: MonsterIndexEntry): boolean {
	if (e.bundled) return false;
	const m = e.monster;
	return /\bcompanions?\b/i.test(`${m.type ?? ''} ${m.group ?? ''} ${m.roleLabel ?? ''}`);
}

const DIE_RE = /\b\d*d(4|6|8|10|12|20|100)\b/gi;
function dice(text: string | undefined): string[] {
	if (!text) return [];
	return [...new Set([...text.matchAll(DIE_RE)].map(m => `d${m[1]}`))];
}

/** A monster's compendium entry id: the books' by their id, a pack's by its name, a note's by its file. */
export function monsterEntryId(e: MonsterIndexEntry): string {
	return `monster:${e.monster.bundledId || (e.pack && !e.filePath ? `pack:${e.name.toLowerCase()}` : `vault:${e.filePath}#${e.name}`)}`;
}

function monsterEntry(e: MonsterIndexEntry, lore: boolean): Entry {
	const m = e.monster;
	const role = monsterRole(m);
	const lv = levelValue(m.level);
	const book = bookOf(e);
	const types = [m.group, m.type].filter((x): x is string => !!x);
	const facets: Record<string, string[]> = {
		kind: ['Adversary'],
		type: types,
		size: m.size ? [m.size] : [],
		habitat: m.habitat ? [m.habitat] : [],
		source: [book.short, book.long.replace(/\s*p\.?\s*\d+$/, '')],
	};
	const nums: Record<string, number> = {};
	const flags: string[] = [e.pack ? 'pack' : book.short === 'Note' ? 'mine' : 'bundled'];
	if (!lore) {
		facets.role = [role === 'legendary' ? (m.roleLabel || 'Legendary') : role[0].toUpperCase() + role.slice(1)];
		if (role === 'legendary' && m.roleLabel && m.roleLabel !== 'Legendary') facets.role.push('Legendary');
		facets.armor = [m.armor === 'none' ? 'None' : m.armor === 'medium' ? 'Medium' : 'Heavy'];
		facets.resist = m.resistances ?? [];
		facets.immune = m.immunities ?? [];
		facets.vuln = m.vulnerabilities ?? [];
		facets.die = dice([...(m.attacks ?? []).map(a => a.raw), m.minionDie ? `d${m.minionDie}` : ''].join(' '));
		if (lv !== null) nums.level = lv;
		if (m.hp) nums.hp = m.hpPerHero ?? m.hp;
		flags.push(role);
		if (m.roleLabel) flags.push(m.roleLabel.toLowerCase());
		if (m.armor !== 'none') flags.push('armored');
		if (/fly/i.test(m.movement ?? '')) flags.push('flying');
	}
	const text = lore
		? [m.type, m.group, m.habitat, m.size, m.description].filter(Boolean).join(' ')
		: [m.type, m.group, m.habitat, m.size, m.description,
			...(m.abilities ?? []).map(a => `${a.name} ${a.description}`),
			...(m.attacks ?? []).map(a => a.raw), m.bloodied, m.lastStand].filter(Boolean).join(' ');
	const lvl = formatLevel(m.level);
	const detail = lore
		? [m.group, [m.size !== 'Medium' ? m.size : '', m.type].filter(Boolean).join(' '), m.habitat].filter(Boolean).join(' · ')
		: [m.group, role === 'legendary' ? (m.roleLabel || 'Legendary') : role === 'minion' ? 'Minion' : '', m.type && m.type !== m.group ? m.type : '',
			role !== 'minion' ? (m.hpPerHero ? `${m.hpPerHero} HP/hero` : m.hp ? `${m.hp} HP` : '') : '',
			m.armor !== 'none' ? (m.armor === 'medium' ? 'Armor M' : 'Armor H') : ''].filter(Boolean).join(' · ');
	return {
		id: monsterEntryId(e),
		kind: 'monster',
		segments: isCompanionMonster(e) ? ['companions'] : ['adversaries'],
		name: lore ? baseCreatureName(e.name) : e.name,
		detail,
		badge: lore ? undefined : (lvl || (role === 'minion' ? 'min' : '–')),
		facets, nums, flags,
		text: text.toLowerCase(),
		monster: e,
	};
}

/**
 * One entry per creature for players: a creature printed in both books (or at
 * two levels) is the same creature to a hero. Your own note wins, then the
 * printing with the most lore, then Monsters & More.
 */
export function mergePrintings(list: MonsterIndexEntry[]): { best: MonsterIndexEntry; all: MonsterIndexEntry[] }[] {
	const groups = new Map<string, MonsterIndexEntry[]>();
	for (const e of list) {
		const k = baseCreatureName(e.name).toLowerCase();
		groups.set(k, [...(groups.get(k) ?? []), e]);
	}
	return [...groups.values()].map(all => ({
		all,
		best: [...all].sort((a, b) => Number(!!a.bundled) - Number(!!b.bundled)
			|| (b.monster.description?.length ?? 0) - (a.monster.description?.length ?? 0)
			|| Number(!!a.monster.source?.startsWith('GM')) - Number(!!b.monster.source?.startsWith('GM')))[0],
	}));
}

// ----------------------------------------------------------------------------
// Compendium

/** "2-handed (Req. 2 STR)" → "2-handed", "Range 8" → "Range", "Load: 1 action" → "Load". */
export function propertyName(p: string): string {
	return p.replace(/\s*\(.*\)\s*$/, '').replace(/(?:\s*:\s*|\s+)\d.*$/, '').replace(/^stack of$/i, 'Stack').trim();
}

/** "12 gp" → 12, "5 sp" → 0.5, "50 cp" → 0.5. */
export function priceGp(cost: string | undefined): number | undefined {
	const m = cost?.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(gp|sp|cp)?/i);
	if (!m) return undefined;
	const n = Number(m[1]);
	const unit = (m[2] ?? 'gp').toLowerCase();
	return unit === 'sp' ? n / 10 : unit === 'cp' ? n / 100 : n;
}

const CAP = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

/** Companion features: Beastmaster's companions, the Shepherd's spirit, and anything else naming a companion. */
function isCompanionHit(h: CompendiumHit): boolean {
	if (h.kind !== 'feature' && h.kind !== 'subclass') return false;
	if (h.kind === 'subclass') return /beastmaster/i.test(h.name);
	return /\bcompanion\b|lifebinding spirit/i.test(`${h.name} ${h.group ?? ''}`) || /^summon a (spirit )?companion/i.test(h.text ?? '');
}

function hitEntry(h: CompendiumHit, seen: Map<string, number>): Entry {
	const facets: Record<string, string[]> = { kind: [ENTRY_KIND_LABEL[h.kind]], source: h.pack ? [h.pack] : h.note ? [HOMEBREW] : h.source ? [h.source] : [] };
	const nums: Record<string, number> = {};
	const flags: string[] = [];
	if (h.draft) flags.push('draft');
	// A content pack's entry says which pack; yours says Homebrew.
	if (h.note) flags.push('homebrew');
	else if (h.pack) flags.push('pack');
	let badge: string | undefined;
	let segments: Segment[] = [];
	const extra: string[] = [];
	switch (h.kind) {
		case 'spell': {
			const s = h.entry as Spell;
			segments = ['spells'];
			facets.school = s.school ? [s.school] : [];
			facets.tier = [tierLabel(s.tier)];
			nums.tier = s.tier ?? 0;
			facets.action = s.actions ? [s.actions] : [];
			facets.class = s.class ? [s.class] : [];
			facets.die = dice(`${s.damage ?? ''} ${s.text ?? ''}`);
			if (!s.tier) flags.push('cantrip');
			if (s.utility) flags.push('utility');
			if (s.concentration) flags.push('concentration');
			if (s.secret) flags.push('secret');
			if (s.aoe) flags.push('aoe');
			if (s.actions && /reaction/i.test(s.actions)) flags.push('reaction');
			badge = s.tier ? `T${s.tier}` : 'C';
			extra.push(s.school ?? '', s.range ?? '', s.aoe ?? '', s.higherLevels ?? '', s.cantripScaling ?? '');
			break;
		}
		case 'item': {
			const it = h.entry as Item;
			segments = ['items'];
			facets.category = it.category ? [CAP(it.category)] : [];
			if (it.subcategory) facets.category.push(CAP(it.subcategory));
			facets.stat = it.stat ? it.stat.split(/[/\s,]+/).filter(Boolean).map(x => x.toUpperCase()) : [];
			facets.die = dice(it.damage);
			facets.damage = it.damageType ? [CAP(it.damageType)] : [];
			facets.prop = [...new Set((it.properties ?? []).map(propertyName).filter(Boolean))];
			facets.rarity = it.rarity ? [CAP(it.rarity)] : [];
			const price = priceGp(it.cost);
			if (price !== undefined) nums.price = price;
			const req = (it.properties ?? []).join(' ').match(/Req\.\s*(\d+)\s*STR/i)?.[1] ?? (it.strength ? String(it.strength) : undefined);
			if (req) { nums.str = Number(req); flags.push('heavy'); }
			if (it.armor) nums.armor = Number(String(it.armor).match(/\d+/)?.[0] ?? NaN);
			if (it.slots !== undefined) nums.slots = it.slots;
			for (const p of facets.prop) flags.push(nameKey(p));
			if (it.category === 'magic' || it.rarity) flags.push('magic');
			badge = it.damage ? (facets.die[0] ?? undefined) : undefined;
			extra.push(it.category ?? '', it.subcategory ?? '', weaponDamage(it), (it.properties ?? []).join(' '));
			break;
		}
		case 'feature': {
			segments = ['features'];
			facets.class = h.className ? [h.className] : [];
			facets.subclass = h.subclass ? [h.subclass] : [];
			facets.group = h.group ? [h.group] : [];
			const cost = h.cost ?? '';
			facets.action = cost ? [cost] : [];
			if (h.level !== undefined) { nums.level = h.level; badge = String(h.level); }
			flags.push(h.group ? 'option' : 'feature');
			if (h.subclass) flags.push('subclass');
			if (/passive/i.test(cost)) flags.push('passive');
			if (/reaction/i.test(cost) || /^\s*\(?reaction\b/i.test(h.text ?? '')) flags.push('reaction');
			extra.push(h.className ?? '', h.subclass ?? '', h.group ?? '');
			break;
		}
		case 'boon': {
			const b = h.entry as Boon;
			segments = ['features'];
			facets.group = b.kind ? [`${CAP(b.kind)} boon`] : ['Boon'];
			flags.push('boon');
			extra.push(b.requirement ?? '');
			break;
		}
		case 'class': {
			const c = h.entry as ClassEntry;
			segments = ['classes'];
			facets.class = [c.name];
			facets.stat = c.keyStats ?? [];
			facets.die = c.hitDie ? [`d${c.hitDie}`] : [];
			facets.school = c.casting?.schools ?? [];
			if (c.complexity) nums.complexity = c.complexity;
			if (c.casting) flags.push('caster');
			extra.push(c.tagline ?? '', c.armor ?? '', c.weapons ?? '', (c.subclasses ?? []).map(s => s.name).join(' '),
				...(c.levels ?? []).flatMap(l => (l.features ?? []).map(f => f.name)));
			break;
		}
		case 'subclass': {
			const s = h.entry as Subclass;
			segments = ['classes'];
			facets.class = h.className ? [h.className] : [];
			if (s.story) flags.push('story');
			extra.push(h.className ?? '', s.intro ?? '', ...(s.levels ?? []).flatMap(l => (l.features ?? []).map(f => `${f.name} ${f.text}`)));
			break;
		}
		case 'ancestry': {
			const a = h.entry as Ancestry;
			segments = ['origins'];
			facets.size = a.size ? a.size.split(/[/,]|\bor\b/).map(x => x.trim()).filter(Boolean) : [];
			facets.rarity = a.rarity ? [CAP(a.rarity)] : [];
			extra.push(a.flavor ?? '');
			break;
		}
		case 'background': {
			const b = h.entry as Background;
			segments = ['origins'];
			if (b.category) facets.group = [b.category];
			extra.push(b.requirement ?? '');
			break;
		}
	}
	if (isCompanionHit(h)) segments.push('companions');
	const owner = h.subclass ?? h.className ?? '';
	const base = `${h.kind}:${owner ? `${nameKey(owner)}:` : ''}${nameKey(h.name)}`;
	const n = (seen.get(base) ?? 0) + 1;
	seen.set(base, n);
	return {
		id: n > 1 ? `${base}:${n}` : base,
		kind: h.kind, segments, name: h.name, detail: h.detail, badge, facets, nums, flags,
		text: [h.detail, h.text, ...extra].filter(Boolean).join(' ').toLowerCase(),
		hit: h,
	};
}

// ----------------------------------------------------------------------------
// Rules

/** Monsters & More (draft) prints how Adventuring Companions work; the companions themselves aren't printed yet. */
const COMPANION_RULES: RuleEntry[] = [
	{
		name: 'Adventuring Companions', topic: 'Companions', source: 'Monsters & More', page: 196, draft: true,
		text: 'Adventuring Companions are NPCs that join the party, temporarily or permanently as it suits the story. They play simply like a monster\'s stat block, but with added survivability and utility of a hero.\n\n**When to use a Companion.**\n• **Solo or small groups.** If you are playing with a solo hero (or duo) and a GM, a Companion can maintain the teamwork and tactical feel of a larger group, and helps keep the expected balance of Solo/Legendary encounters.\n• **Adoption.** If your party adopts a pet or makes a good friend, consider adding it as a companion. Use no more than ONE Adventuring Companion at a time in a party (possibly two, if the party is very small).\n• **Quest reward.** An Adventuring Companion (permanent or temporary) can make a fantastic quest reward.',
	},
	{
		name: 'How Companions Work', topic: 'Companions', source: 'Monsters & More', page: 196, draft: true,
		text: 'Companions are controlled by the GM outside of combat, and by the heroes while in combat.\n• **Combat.** Companions act similar to monsters. Instead of 3 actions like heroes, they simply do whatever their stat block says. Any hero can decide when a companion takes their turn in a round (the party should generally agree).\n• **Initiative.** Companions don\'t roll initiative; they act as normal on their first turn.\n• **Saves & Skills.** Companions roll their saves with a flat d20. Some may have advantaged and disadvantaged saves/skills.\n• **Death & Dying.** While Dying, their actions are not limited nor do they need to make STR saves to perform actions; however, taking too many Wounds may cause them to permanently die.\n• **Resting.** Companions regain LVL HP at the end of each encounter, or all their HP when Making Camp.\n• **Leveling up.** Temporary companions don\'t level up; permanent Companions level up whenever the heroes do.',
	},
	{
		name: 'Companions and Encounter Balance', topic: 'Companions', source: 'Monsters & More', page: 197, draft: true,
		text: 'For solo or legendary encounters, there is no need to make any changes. Companions are not heroes, so solo monsters do not act after a companion\'s turn. Regular combat encounters will be slightly easier with an Adventuring Companion (but not as easy as with an additional hero): consider increasing the difficulty one step (easy » medium » hard » deadly) or add 1/2 an additional hero to the encounter guidelines.\n\n**GM Note.** Adventuring Companions are there to help the heroes shine; they are NOT heroes themselves. They should look up to and follow the heroes, add richness to the story, and may come with their own price, foibles, quests and goals.',
	},
];

/** The core rules sections the compendium data carries, as entries. */
export function ruleEntries(comp: Compendium | undefined): RuleEntry[] {
	const out: RuleEntry[] = [];
	const r = comp?.rules;
	if (r) {
		const src = { source: typeof r.source === 'string' ? r.source : 'Core', page: typeof r.page === 'number' ? r.page : undefined };
		const list = (v: unknown) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : []);
		const s = (v: unknown) => (typeof v === 'string' ? v : '');
		for (const st of list(r.stats)) if (s(st.name)) out.push({ name: `${s(st.name)}${st.abbr ? ` (${s(st.abbr)})` : ''}`, text: s(st.text), topic: 'Stats', ...src });
		for (const sk of list(r.skills)) if (s(sk.name)) out.push({ name: s(sk.name), text: `${sk.stat ? `**${s(sk.stat)} skill.** ` : ''}${s(sk.text)}`, topic: 'Skills', ...src });
		const langs = list(r.languages);
		if (langs.length) out.push({ name: 'Languages', topic: 'Heroes', ...src, text: [s(r.languagesText), ...langs.map(l => `• **${s(l.name)}.** ${s(l.speakers)}`)].filter(Boolean).join('\n') });
		const lvl = Array.isArray(r.levelUp) ? r.levelUp.filter((x): x is string => typeof x === 'string') : [];
		if (lvl.length || s(r.levelUpText)) out.push({ name: 'Leveling Up', topic: 'Heroes', ...src, text: [s(r.levelUpText), ...lvl.map(l => `• ${l}`)].filter(Boolean).join('\n') });
		if (s(r.inventory)) out.push({ name: 'Inventory', topic: 'Equipment', ...src, text: s(r.inventory) });
		if (s(r.defaults)) out.push({ name: 'Character Defaults', topic: 'Heroes', ...src, text: s(r.defaults) });
		if (s(r.startingGold)) out.push({ name: 'Starting Gold', topic: 'Equipment', ...src, text: s(r.startingGold) });
		for (const e of list(r.equipmentRules)) if (s(e.name)) out.push({ name: s(e.name), text: s(e.text), topic: 'Equipment', ...src });
		for (const e of list(r.magicRules)) if (s(e.name)) out.push({ name: s(e.name), text: s(e.text), topic: 'Magic', ...src });
		// Rules a content pack adds, under the topic it gives them.
		for (const e of list(r.packRules)) if (s(e.name)) out.push({ name: s(e.name), text: s(e.text), topic: s(e.topic) || 'Rules', source: s(e.pack), page: typeof e.page === 'number' ? e.page : undefined, pack: s(e.pack), ...(s(e.note) ? { note: s(e.note) } : {}) });
		for (const p of comp.properties) if (p.text) out.push({ name: p.name, text: p.text, topic: 'Weapon properties', source: p.source, page: p.page, draft: p.draft, ...(p.pack ? { pack: p.pack } : {}), ...(p.note ? { note: p.note } : {}) });
	}
	return [...out, ...COMPANION_RULES];
}

function ruleEntry(r: RuleEntry): Entry {
	const companions = r.topic === 'Companions';
	return {
		id: `rule:${nameKey(r.topic)}:${nameKey(r.name)}`,
		kind: 'rule',
		segments: companions ? ['rules', 'companions'] : ['rules'],
		name: r.name,
		detail: [r.topic, r.source].filter(Boolean).join(' · '),
		facets: { kind: ['Rule'], topic: [r.topic], source: r.source ? [r.source] : [] },
		nums: {},
		flags: [...(r.draft ? ['draft'] : []), ...(r.note ? ['homebrew'] : r.pack ? ['pack'] : [])],
		text: `${r.topic} ${r.text}`.toLowerCase(),
		rule: r,
	};
}

// ----------------------------------------------------------------------------

/** Every entry, in no particular order (the search sorts). */
export function buildEntries(input: BuildInput): Entry[] {
	const out: Entry[] = [];
	const lore = !!input.lore;
	if (lore) {
		for (const { best, all } of mergePrintings(input.monsters)) {
			const e = monsterEntry(best, true);
			e.printings = all;
			e.facets.source = [...new Set(all.flatMap(x => { const b = bookOf(x); return [b.short, b.long.replace(/\s*p\.?\s*\d+$/, '')]; }))];
			e.noted = !!input.noted?.has(baseCreatureName(best.name).toLowerCase());
			if (e.noted) e.flags.push('noted');
			out.push(e);
		}
	} else {
		for (const m of input.monsters) out.push(monsterEntry(m, false));
	}
	for (const n of input.npcs ?? []) {
		const campaign = n.campaign ? (input.campaignNames?.get(n.campaign) ?? n.campaign.replace(/^.*\//, '')) : '';
		out.push({
			id: `npc:${n.path}`,
			kind: 'npc', segments: ['npcs'], name: n.name,
			detail: [n.role, n.aliases.length ? `aka ${n.aliases.join(', ')}` : '', campaign].filter(Boolean).join(' · ') || 'NPC',
			// An NPC's role is a line of prose ("Master assayer of the Alchemists' Guild"), not a facet: it's found by
			// searching, never offered as a role: filter beside Minion and Legendary.
			facets: { kind: ['NPC'], campaign: campaign ? [campaign] : [] },
			nums: {}, flags: ['mine'],
			text: [n.role, ...n.aliases, campaign].filter(Boolean).join(' ').toLowerCase(),
			npc: n,
		});
	}
	const seen = new Map<string, number>();
	for (const h of input.compendium?.all() ?? []) out.push(hitEntry(h, seen));
	for (const c of input.conditions ?? []) {
		if (c.auto) continue;
		out.push({
			id: `condition:${nameKey(c.name)}`,
			kind: 'condition', segments: ['rules'], name: c.name,
			detail: c.minor ? 'Minor condition' : 'Condition',
			facets: { kind: ['Condition'], topic: ['Conditions'] },
			nums: {}, flags: c.minor ? ['condition', 'minor'] : ['condition'],
			text: c.description.toLowerCase(),
			condition: c,
		});
	}
	for (const r of ruleEntries(input.compendium)) out.push(ruleEntry(r));
	return out;
}

/** The entries a tab shows. */
export function inSegment(e: Entry, seg: Segment): boolean {
	return seg === 'all' || e.segments.includes(seg);
}

// ----------------------------------------------------------------------------
// How a result looks in the list: a few pills and a line of its own text

export interface Pill {
	text: string;
	/** A colour for the few pills that mean something at a glance: a spell school, Legendary, Minion. */
	tone?: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\*\*|__|\[\[|\]\]|`/g, '').replace(/\s+/g, ' ').trim();

/**
 * The facts worth seeing before opening an entry, short enough to scan in a
 * cluster: a spell's school, cast time and range; a weapon's damage and
 * properties; a monster's family, role and HP. At most five.
 */
export function entryPills(e: Entry, lore = false): Pill[] {
	const out: Pill[] = [];
	const add = (text: string | undefined | null, tone?: string) => { const t = clean(text ?? ''); if (t && !out.some(p => p.text === t)) out.push({ text: t, tone }); };
	if (e.monster) {
		const m = e.monster.monster;
		// Most useful first (pills that don't fit drop off the end): family, role, HP, armor, then flavour.
		add(m.group);
		if (lore) {
			if (m.type && m.type !== m.group) add(m.type);
			if (m.size && m.size !== 'Medium') add(m.size);
			add(m.habitat);
		} else {
			const role = monsterRole(m);
			if (role === 'legendary') add(m.roleLabel || 'Legendary', 'legendary');
			if (role === 'minion') add('Minion', 'minion');
			if (role !== 'minion') add(m.hpPerHero ? `${m.hpPerHero} HP/hero` : m.hp ? `${m.hp} HP` : '');
			if (m.armor !== 'none') add(m.armor === 'medium' ? 'Medium armor' : 'Heavy armor');
			if (m.type && m.type !== m.group) add(m.type);
			if (m.size && m.size !== 'Medium') add(m.size);
		}
	} else if (e.npc) {
		add(e.npc.role);
		add(e.facets.campaign?.[0]);
		if (e.npc.aliases.length) add(`aka ${e.npc.aliases[0]}`);
	} else if (e.hit) {
		const h = e.hit;
		switch (h.kind) {
			case 'spell': {
				const s = h.entry as Spell;
				add(s.school, `school-${(s.school ?? '').toLowerCase()}`);
				if (s.utility) add('Utility');
				add(s.actions);
				add(s.range ? (/^\d+$/.test(s.range) ? `Range ${s.range}` : s.range) : '');
				add(e.facets.die?.[0]);
				if (s.concentration) add('Concentration');
				break;
			}
			case 'item': {
				const it = h.entry as Item;
				add(it.subcategory && it.category !== 'gear' ? `${CAP(it.category ?? '')} · ${it.subcategory}` : CAP(it.category ?? ''));
				if (it.damage) add(weaponDamage(it));
				if (it.armor) add(`${it.armor} armor`);
				for (const p of it.properties ?? []) add(p.replace(/\s*\(.*\)$/, ''));
				add(it.cost);
				break;
			}
			case 'feature':
				add(h.subclass ?? h.className);
				if (h.subclass && h.className) add(h.className);
				add(h.group);
				add(h.cost);
				break;
			case 'class': {
				const c = h.entry as ClassEntry;
				if (c.keyStats?.length) add(c.keyStats.join(' · '));
				if (c.hitDie) add(`d${c.hitDie} hit die`);
				if (c.casting) add('Caster');
				if (c.subclasses?.length) add(`${c.subclasses.length} subclasses`);
				break;
			}
			case 'subclass': add(h.className); if ((h.entry as Subclass).story) add('Story'); break;
			case 'ancestry': { const a = h.entry as Ancestry; add(a.size); add(a.rarity ? CAP(a.rarity) : ''); break; }
			case 'background': add((h.entry as Background).requirement); break;
			case 'boon': { const b = h.entry as Boon; add(b.kind ? `${CAP(b.kind)} boon` : 'Boon'); add(b.requirement); break; }
		}
	} else if (e.condition) {
		add(e.condition.minor ? 'Minor condition' : 'Condition');
	} else if (e.rule) {
		add(e.rule.topic);
		add(e.rule.source);
	}
	if (e.flags.includes('draft')) out.push({ text: 'Draft', tone: 'draft' });
	return out.slice(0, 5);
}

/** One line of the entry's own words: a spell's effect, a monster's lore, a feature's rules. */
export function entrySnippet(e: Entry, lore = false): string {
	if (e.monster) {
		const m = e.monster.monster;
		if (m.description) return clean(m.description);
		if (lore) return '';
		return clean([...(m.abilities ?? []).map(a => `${a.name}. ${a.description}`), ...(m.attacks ?? []).map(a => a.raw)][0]);
	}
	if (e.hit) {
		const h = e.hit;
		if (h.kind === 'class') return clean((h.entry as ClassEntry).tagline ?? h.text);
		if (h.kind === 'subclass') return clean((h.entry as Subclass).flavor ?? h.text);
		// A spell's range (and damage dice) are already pills; start where its words do.
		if (h.kind === 'spell') return clean(h.text).replace(/^(?:(?:Range|Reach):?\s*\d+[^.]*\.\s*)?(?:Damage:\s*[^.]*\.\s*)?/i, '');
		return clean(h.text);
	}
	if (e.condition) return clean(e.condition.description);
	if (e.rule) return clean(e.rule.text);
	return '';
}

/**
 * The key your own art for an entry is saved under. A creature is one key
 * across its printings (and on both sides of the table); everything else is
 * its id ("spell:fireball", "feature:oathsworn:layonhands").
 */
export function artKey(e: Entry): string {
	if (e.monster) return `creature:${baseCreatureName(e.monster.name).toLowerCase()}`;
	if (e.hit) return hitArtKey(e.hit);
	return e.id;
}

/** The same key for a compendium hit or a condition, where only the card is at hand (the quick look). */
export function hitArtKey(h: CompendiumHit | { name: string; description: string }): string {
	if (!('kind' in h)) return `condition:${nameKey(h.name)}`;
	const owner = h.subclass ?? h.className ?? '';
	return `${h.kind}:${owner ? `${nameKey(owner)}:` : ''}${nameKey(h.name)}`;
}
