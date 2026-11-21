// The guided builders for a hero's content: a class, a subclass, a class's
// option, an ancestry, a background, a boon. A draft is the kind's pack entry
// itself (content.ts KINDS_NIMBLE), so the block a builder writes is exactly
// what a person could type, and editing a block reads it back as it is: fields
// the builder doesn't show stay as they were. Here: new drafts, the draft
// written out (empty fields dropped, in the kind's order), what's still wrong
// in the builder's words, and what a class grants at each level (what Level up
// will ask). Pure: no Obsidian imports.

import type { FieldSpec, KindSpec } from '../../core/content/spec';
import { checkEntry } from '../../core/content/spec';
import { HOMEBREW } from '../../core/content/blocks';
import { toYaml } from '../../core/yaml-lite';
import { contentNimble, KINDS_NIMBLE, mergeNimbleData } from './content';
import { ClassEntry, ClassResource, Compendium, CompendiumData, Feature, LevelFeatures, nameKey, OptionGroup, STATS, Subclass } from './compendium';
import { spellTierOf } from './character-def';
import { boonOf, LevelPlan, levelPlans } from './level-plan';

export type ContentKind = 'class' | 'subclass' | 'option' | 'ancestry' | 'background' | 'boon';
export const CONTENT_KINDS: readonly ContentKind[] = ['class', 'subclass', 'option', 'ancestry', 'background', 'boon'];

/** A draft: the entry as the builder edits it. */
export type Draft = Record<string, unknown>;

export const kindSpec = (kind: ContentKind): KindSpec => KINDS_NIMBLE.find(k => k.kind === kind)!;

/** Each kind's steps, by id (the UI draws them; problems point at them). */
export const STEPS: Record<ContentKind, readonly string[]> = {
	class: ['start', 'stats', 'gear', 'magic', 'resources', 'levels', 'options', 'review'],
	subclass: ['start', 'levels', 'options', 'review'],
	option: ['start', 'review'],
	ancestry: ['start', 'traits', 'review'],
	background: ['start', 'review'],
	boon: ['start', 'review'],
};

/** Starting HP by Hit Die, as the class books give them. */
export const STARTING_HP: Record<number, number> = { 4: 7, 6: 10, 8: 13, 10: 17, 12: 20 };
export const HIT_DICE = [4, 6, 8, 10, 12] as const;
/** The level the books' classes choose a subclass at. */
export const SUBCLASS_LEVEL = 3;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const list = <T = Draft>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** A blank feature row. */
export const blankFeature = (): Draft => ({ name: '', text: '' });
/** The feature that offers the subclass, as the books write it. */
export const subclassFeature = (first = true): Feature => ({ name: 'Subclass', text: first ? 'Choose a subclass.' : 'Gain your subclass feature.' });

/** A new draft. A subclass or option can start in a class (and an option in a list). */
export function newDraft(kind: ContentKind, o: { className?: string; subclass?: string; group?: string } = {}): Draft {
	switch (kind) {
		case 'class':
			return {
				name: '', tagline: '', keyStats: [], hitDie: 8, saves: {},
				levels: [{ level: 1, features: [blankFeature()] }, { level: SUBCLASS_LEVEL, features: [subclassFeature()] }],
			};
		case 'subclass': return { name: '', class: o.className ?? '', flavor: '', levels: [{ level: SUBCLASS_LEVEL, features: [blankFeature()] }] };
		case 'option': return { name: '', class: o.className ?? '', ...(o.subclass ? { subclass: o.subclass } : {}), group: o.group ?? '', cost: '', text: '' };
		case 'ancestry': return { name: '', size: 'Medium', rarity: 'common', flavor: '', traits: [blankFeature()] };
		case 'background': return { name: '', text: '' };
		case 'boon': return { name: '', type: 'epic', text: '' };
	}
}

/** A draft from an entry (a block being edited, or one to copy): its own copy, so the builder can change it freely. */
export function fromEntry(kind: ContentKind, value: unknown): Draft {
	const v = isObj(value) ? JSON.parse(JSON.stringify(value)) as Draft : {};
	return { ...newDraftShape(kind), ...v };
}

/** The fields a builder expects to find (empty), for an entry that left them out. */
function newDraftShape(kind: ContentKind): Draft {
	switch (kind) {
		case 'class': return { name: '', keyStats: [], saves: {}, levels: [] };
		case 'subclass': return { name: '', class: '', levels: [] };
		case 'option': return { name: '', class: '', group: '', text: '' };
		case 'ancestry': return { name: '', traits: [] };
		default: return { name: '', text: '' };
	}
}

// ----------------------------------------------------------------------------
// Writing it out

/** Is a list item nothing yet: only numbers (a level), and a required field missing? */
function hollow(item: Record<string, unknown>, of: Record<string, FieldSpec>): boolean {
	const required = Object.entries(of).filter(([, f]) => f.required).map(([k]) => k);
	return Object.values(item).every(x => typeof x === 'number' || typeof x === 'boolean') && required.some(k => item[k] === undefined);
}

/** A value with its empty parts gone: blank text, empty lists and objects, false, nothing. Objects in their spec's field order. */
function clean(v: unknown, spec?: FieldSpec): unknown {
	if (v === null || v === undefined) return undefined;
	if (typeof v === 'string') {
		const t = v.trim();
		// A number written in a text field (a resource's max of 2) is written as the number a person would type.
		return !t ? undefined : spec?.type === 'string' && !spec.enum && /^-?\d+$/.test(t) && String(Number(t)) === t ? Number(t) : t;
	}
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	if (typeof v === 'boolean') return v || undefined;
	if (Array.isArray(v)) {
		const of = spec?.type === 'list' ? spec.of : undefined;
		const out = v.map(x => (of ? cleanFields(x, of) : clean(x))).filter(x => x !== undefined && !(of && isObj(x) && hollow(x, of)));
		return out.length ? out : undefined;
	}
	if (isObj(v)) {
		if (spec?.type === 'map') {
			const out = Object.fromEntries(Object.entries(v).filter(([k, n]) => k.trim() && typeof n === 'number' && Number.isFinite(n) && n !== 0));
			return Object.keys(out).length ? out : undefined;
		}
		return cleanFields(v, spec?.type === 'object' ? spec.fields : undefined);
	}
	return undefined;
}

function cleanFields(v: unknown, fields?: Record<string, FieldSpec>): unknown {
	if (!isObj(v)) return clean(v);
	const keys = fields ? [...Object.keys(fields).filter(k => k in v), ...Object.keys(v).filter(k => !(k in fields))] : Object.keys(v);
	const out: Record<string, unknown> = {};
	for (const k of keys) {
		const c = clean(v[k], fields?.[k]);
		if (c !== undefined) out[k] = c;
	}
	return Object.keys(out).length ? out : undefined;
}

/** What a class leaves blank that the books fill in: its starting HP from its Hit Die. */
function filled(kind: ContentKind, d: Draft): Draft {
	if (kind !== 'class' || typeof d.startingHp === 'number') return d;
	const hp = STARTING_HP[Number(d.hitDie)];
	return hp ? { ...d, startingHp: hp } : d;
}

/** The draft as its entry: empty fields gone, levels in order, in the kind's field order. */
export function cleanEntry(kind: ContentKind, d: Draft): Draft {
	const spec = kindSpec(kind);
	const v = { ...filled(kind, d) };
	if (Array.isArray(v.levels)) v.levels = sortLevels(v.levels as LevelFeatures[]);
	return (cleanFields(v, spec.fields) as Draft | undefined) ?? {};
}

/** The block's body: the entry as YAML. */
export function entryBody(kind: ContentKind, d: Draft): string {
	return toYaml(cleanEntry(kind, d));
}

export const sortLevels = (levels: LevelFeatures[]): LevelFeatures[] => [...levels].sort((a, b) => (Number(a.level) || 0) - (Number(b.level) || 0));

// ----------------------------------------------------------------------------
// What's still wrong, in the builder's words

export interface Problem { text: string; step: string }

/** "levels item 2: "features" item 1: "text" is missing" → its path and what's wrong. */
function said(e: string): { path: (string | number)[]; what: string } {
	const path: (string | number)[] = [];
	let rest = e;
	for (;;) {
		const m = /^"([^"]+)"\s*(?:item (\d+)(?::)?\s*)?/.exec(rest);
		if (!m) break;
		path.push(m[1]);
		if (m[2]) path.push(Number(m[2]) - 1);
		rest = rest.slice(m[0].length);
	}
	return { path, what: rest.trim() };
}

/** Problems with a draft (the kind's own checks), each with the step to fix it on; empty when it's ready. */
export function draftProblems(kind: ContentKind, d: Draft): Problem[] {
	const entry = cleanEntry(kind, d);
	const checked = checkEntry(kindSpec(kind), entry);
	const out: Problem[] = [];
	const push = (text: string, step: string) => { if (!out.some(p => p.text === text)) out.push({ text, step }); };
	const levels = list<LevelFeatures>(entry.levels);
	for (const e of checked.errors) {
		const { path, what } = said(e);
		const top = String(path[0] ?? '');
		const missing = /^is missing/.test(what);
		if (top === 'name' && path.length === 1) push('Give it a name.', 'start');
		else if (top === 'keyStats') push(missing ? 'Pick its key stats.' : 'Key stats are STR, DEX, INT or WIL.', 'stats');
		else if (top === 'saves') push('Pick a ▲ save and a ▼ save.', 'stats');
		else if (top === 'hitDie' || top === 'startingHp') push(missing ? 'Pick its Hit Die.' : e, 'start');
		else if (top === 'class' && path.length === 1) push(`Pick the class it's for.`, 'start');
		else if (top === 'group') push('Pick or name its list.', 'start');
		else if (top === 'text' && path.length === 1) push(`Write what it does.`, 'start');
		else if (top === 'levels') {
			const lv = typeof path[1] === 'number' ? levels[path[1]]?.level : undefined;
			if (path.length === 1) push(kind === 'class' ? 'Give it a feature at level 1.' : 'Give it a feature.', 'levels');
			else push(`Level ${lv ?? '?'}: ${path.includes('name') ? 'a feature needs a name' : path.includes('text') ? 'a feature needs its text' : what}.`, 'levels');
		} else if (top === 'traits') push(`A trait needs ${path.includes('name') ? 'a name' : 'its text'}.`, 'traits');
		else if (top === 'optionGroups') push(`An option list ${path.includes('options') ? `needs ${path.includes('name') ? 'each option named' : 'each option\'s text'}` : 'needs a name'}.`, 'options');
		else if (top === 'resources') push(`A resource ${path.includes('name') ? 'needs a name' : `: ${what}`}.`, 'resources');
		else if (top === 'states') push('A state needs a name and the condition it puts on.', 'resources');
		else if (top === 'target') push('The target needs a name.', 'resources');
		else if (top === 'casting') push(`Magic: ${what}.`, 'magic');
		else if (top === 'instead' || top === 'lose' || top === 'companions') push('A swap needs both lists.', 'options');
		else push(e, kind === 'class' ? 'review' : 'start');
	}
	return out;
}

/** Why it can't be made yet (the first problem), or null. */
export function draftMissing(kind: ContentKind, d: Draft): string | null {
	return draftProblems(kind, d)[0]?.text ?? null;
}

// ----------------------------------------------------------------------------
// A class's levels, as the builder edits them

/** The level's row in a draft (made, in order, when `make`). */
export function levelRow(d: Draft, level: number, make = false): LevelFeatures | undefined {
	const levels = Array.isArray(d.levels) ? d.levels as LevelFeatures[] : (d.levels = [] as LevelFeatures[]);
	let row = levels.find(l => Number(l.level) === level);
	if (!row && make) {
		row = { level, features: [] };
		levels.push(row);
		d.levels = sortLevels(levels);
	}
	if (row && !Array.isArray(row.features)) row.features = [];
	return row;
}

/** Levels that have a feature with a name or text. */
export function filledLevels(d: Draft): number[] {
	return list<LevelFeatures>(d.levels).filter(l => list<Feature>(l.features).some(f => str(f.name) || str(f.text))).map(l => Number(l.level)).sort((a, b) => a - b);
}

const offersSubclass = (f: Feature): boolean => /^(?:\w+ )?subclass$/i.test(str(f.name));

/** The level a class has you choose its subclass: its first "Subclass" feature's. */
export function subclassLevelOf(d: Draft): number | undefined {
	const lv = list<LevelFeatures>(d.levels).filter(l => list<Feature>(l.features).some(offersSubclass)).map(l => Number(l.level));
	return lv.length ? Math.min(...lv) : undefined;
}

/** Move the subclass choice to a level (or take it out): its "Subclass" feature moves, any later ones stay. */
export function setSubclassLevel(d: Draft, level: number | undefined): void {
	const at = subclassLevelOf(d);
	if (at !== undefined) {
		const row = levelRow(d, at)!;
		const i = row.features.findIndex(offersSubclass);
		const [f] = row.features.splice(i, 1);
		if (level !== undefined) levelRow(d, level, true)!.features.unshift(f);
	} else if (level !== undefined) levelRow(d, level, true)!.features.unshift(subclassFeature());
	pruneLevels(d);
}

/** Levels left with nothing in them are dropped (level 1 stays, for its first feature). */
export function pruneLevels(d: Draft): void {
	if (!Array.isArray(d.levels)) return;
	d.levels = (d.levels as LevelFeatures[]).filter(l => Number(l.level) === 1 || list(l.features).length > 0);
}

/** The level each spell tier comes at, from the features that say so (data or words). */
export function tierLevels(d: Draft): Map<number, number> {
	const out = new Map<number, number>();
	for (const l of sortLevels(list<LevelFeatures>(d.levels))) {
		for (const f of list<Feature>(l.features)) {
			const t = spellTierOf({ name: str(f.name), text: str(f.text), spellTier: f.spellTier });
			if (t && !out.has(t)) out.set(t, Number(l.level));
		}
	}
	return out;
}

/** Put a tier's feature at a level ("Tier 2 Spells", with its `spellTier`), or take it out. */
export function setTierLevel(d: Draft, tier: number, level: number | undefined): void {
	for (const l of list<LevelFeatures>(d.levels)) {
		l.features = list<Feature>(l.features).filter(f => spellTierOf({ name: str(f.name), text: str(f.text), spellTier: f.spellTier }) !== tier);
	}
	if (level !== undefined) {
		levelRow(d, level, true)!.features.push({ name: `Tier ${tier} Spells`, text: `You may now cast spells up to tier ${tier}.`, spellTier: tier });
	}
	pruneLevels(d);
}

/**
 * The books' rhythm, for a class that has none yet: its subclass at 3, 7, 11 and 15, a key stat increase at 4, 8, 12
 * and 16, a secondary one at 5, 9, 13 and 17, and an Epic Boon at 19. Only what isn't there already.
 */
export function addBookRhythm(d: Draft): void {
	const keys = list<string>(d.keyStats).map(s => s.toUpperCase()).filter(s => (STATS as string[]).includes(s));
	const others = STATS.filter(s => !keys.includes(s));
	const has = (level: number, test: (f: Feature) => boolean) => list<Feature>(levelRow(d, level)?.features).some(test);
	if (subclassLevelOf(d) === undefined) setSubclassLevel(d, SUBCLASS_LEVEL);
	for (const lv of [7, 11, 15]) if (!has(lv, offersSubclass)) levelRow(d, lv, true)!.features.unshift(subclassFeature(false));
	const inc = (name: string, stats: string[], levels: number[]) => {
		if (!stats.length) return;
		for (const lv of levels) if (!has(lv, f => nameKey(str(f.name)) === nameKey(name))) levelRow(d, lv, true)!.features.push({ name, text: `+1 ${stats.join(' or ')}.` });
	};
	inc('Key Stat Increase', keys.length ? keys : ['STR', 'DEX'], [4, 8, 12, 16]);
	inc('Secondary Stat Increase', keys.length ? others : ['INT', 'WIL'], [5, 9, 13, 17]);
	if (!list<LevelFeatures>(d.levels).some(l => list<Feature>(l.features).some(f => boonOf({ name: str(f.name), text: str(f.text), boon: f.boon }) === 'epic'))) {
		levelRow(d, 19, true)!.features.push({ name: 'Epic Boon', text: 'Choose an Epic Boon.', boon: 'epic' });
	}
}

// ----------------------------------------------------------------------------
// What each level grants (the check beside the preview)

export type GrantKind = 'feature' | 'subclass' | 'pick' | 'stat' | 'spell' | 'knows' | 'boon' | 'tier' | 'mana' | 'die' | 'more' | 'uses' | 'state' | 'target';
export interface Grant { kind: GrantKind; text: string }
export interface LevelRow { level: number; grants: Grant[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const BOON_WORD: Record<string, string> = { epic: 'An Epic Boon', lodging: 'A Lodging Boon', other: 'A boon' };

/** The books with a draft class (or subclass, option) in front, as the compendium would read it. */
export function withDraft(base: CompendiumData, kind: ContentKind, d: Draft): { comp: Compendium; name: string; className: string } {
	const entry = cleanEntry(kind, d);
	const name = str(entry.name) || `New ${kind}`;
	const className = kind === 'class' ? name : str(entry.class);
	const owner = kind !== 'class' && className && !(base.classes ?? []).some(c => nameKey(c.name) === nameKey(className));
	// A class that isn't in the books yet (only named): a stand-in, so the subclass or option has somewhere to go.
	const data: CompendiumData = owner ? { ...base, classes: [...(base.classes ?? []), { name: className }] } : base;
	return { comp: new Compendium(mergeNimbleData(data, contentNimble([{ kind, name, value: { ...entry, name }, pack: HOMEBREW }]))), name, className };
}

function spellText(p: LevelPlan['spells'][number]): string {
	const from = Array.isArray(p.schools) ? p.schools.join(' or ') : p.schools === 'known' ? 'a school you know' : p.schools === 'new' ? 'a new school' : 'any school';
	if (p.kind === 'school') return p.count > 1 ? `${p.count} spell schools` : 'A spell school';
	if (p.kind === 'utilities') return `The Utility Spells of ${from}`;
	return `${plural(p.count, 'Utility Spell')}${p.each ? ' from each school' : Array.isArray(p.schools) ? ` (${from})` : ''}`;
}

/**
 * What each level grants, as Level up will ask it: features, the subclass, picks from lists, stat increases, spells,
 * what's given outright, a boon, spell tiers, mana, dice that grow, uses, states and a target. For a subclass
 * (`subclass` set and `only: 'subclass'`), only what its own features bring.
 */
export function levelRows(comp: Compendium, className: string, o: { subclass?: string; only?: 'subclass' } = {}): LevelRow[] {
	const cls = comp.classByName(className);
	if (!cls) return [];
	const plans = levelPlans(comp, { className: cls.name, subclass: '', from: 1, to: 20, hitDie: cls.hitDie ?? 8, chosen: o.subclass });
	const sub: Subclass | undefined = o.subclass ? comp.subclass(cls.name, o.subclass) : undefined;
	const onlySub = o.only === 'subclass';
	const resources = list<ClassResource>(cls.resources);
	const out: LevelRow[] = [];
	for (const p of plans) {
		const g: Grant[] = [];
		const level = p.level;
		const own = new Set(p.features.filter(f => f.from === 'subclass').map(f => f.name));
		const mine = (feature: string) => !onlySub || own.has(feature);
		for (const f of p.features) {
			if (onlySub && f.from !== 'subclass') continue;
			if (f.from === 'class' && offersSubclass(f)) continue;
			g.push({ kind: 'feature', text: f.name || 'Unnamed feature' });
		}
		if (!onlySub && p.features.some(f => f.from === 'class' && offersSubclass(f))) {
			const first = !out.some(r => r.grants.some(x => x.kind === 'subclass'));
			g.push({ kind: 'subclass', text: first ? 'Choose a subclass' : 'Subclass feature' });
		}
		for (const pick of p.picks) if (mine(pick.feature)) g.push({ kind: 'pick', text: `Choose ${pick.count} · ${pick.group.name}` });
		for (const s of p.stats) if (mine(s.feature)) g.push({ kind: 'stat', text: s.count > 1 ? `+1 to ${s.count} of ${s.options.join(', ')}` : `+1 ${s.options.join(' or ')}` });
		for (const s of p.spells) if (mine(s.feature)) g.push({ kind: 'spell', text: spellText(s) });
		for (const s of p.spellGrants) if (mine(s.feature)) g.push({ kind: 'knows', text: `Every ${s.schools === 'known' ? 'known school\'s' : s.schools.join(' and ')} Utility Spell` });
		if (p.grants.length && (!onlySub || own.size)) g.push({ kind: 'knows', text: `Knows ${p.grants.join(', ')}` });
		const boonFeature = p.features.find(f => mine(f.name) && boonOf(f));
		if (boonFeature) g.push({ kind: 'boon', text: BOON_WORD[boonOf(boonFeature) ?? ''] ?? `A ${boonOf(boonFeature)} boon` });
		for (const f of p.features) {
			if (!mine(f.name)) continue;
			const t = spellTierOf(f);
			if (t) g.push({ kind: 'tier', text: `Tier ${t} spells` });
			if (f.uses !== undefined && String(f.uses).trim()) g.push({ kind: 'uses', text: `${f.name}: uses per Safe Rest` });
		}
		if (!onlySub) {
			const from = cls.casting?.manaFromLevel ?? 1;
			if ((cls.casting?.manaFormula || cls.casting?.mana) && level === from) g.push({ kind: 'mana', text: 'Mana' });
			for (const r of resources) {
				if (!r?.name) continue;
				const at = list<{ level: number; die: string }>(r.dice?.byLevel).find(x => Number(x.level) === level)?.die;
				if (at) g.push({ kind: 'die', text: `${r.name}: ${at}` });
				else if (level === 1 && r.die) g.push({ kind: 'die', text: `${r.name}: ${r.die}` });
			}
			for (const s of list<{ name: string; level?: number }>(cls.states)) if ((s.level ?? 1) === level && s.name) g.push({ kind: 'state', text: s.name });
			if (cls.target?.name && (cls.target.level ?? 1) === level) g.push({ kind: 'target', text: cls.target.name });
		}
		for (const r of resources) {
			for (const m of list<{ level: number; add: number; subclass?: string }>(r.dice?.maxSteps)) {
				if (Number(m.level) !== level) continue;
				const forSub = m.subclass && sub && nameKey(m.subclass) === nameKey(sub.name);
				if (onlySub ? forSub : !m.subclass || forSub) g.push({ kind: 'more', text: `+${m.add} ${r.name}` });
			}
		}
		if (g.length) out.push({ level, grants: g });
	}
	return out;
}

/** The levels where a class offers an option (picks from its list), for the option builder's check. */
export function optionLevels(comp: Compendium, className: string, option: string, subclass?: string): number[] {
	const cls = comp.classByName(className);
	if (!cls || !option) return [];
	const plans = levelPlans(comp, { className: cls.name, subclass: '', from: 1, to: 20, hitDie: cls.hitDie ?? 8, chosen: subclass || undefined });
	return plans.filter(p => p.picks.some(pick => (pick.group.options ?? []).some(x => nameKey(x.name) === nameKey(option)))).map(p => p.level);
}

/** The lists a class (and one of its subclasses) has: for an option's list, a feature's choice, a subclass's swaps. */
export function classLists(comp: Compendium, className: string, subclass?: string): { name: string; subclass?: string; count: number }[] {
	const cls = comp.classByName(className);
	if (!cls) return [];
	const out: { name: string; subclass?: string; count: number }[] = list<OptionGroup>(cls.optionGroups).map(g => ({ name: g.name, count: list(g.options).length }));
	const sub = subclass ? comp.subclass(cls.name, subclass) : undefined;
	for (const g of list<OptionGroup>(sub?.optionGroups)) out.push({ name: g.name, subclass: sub!.name, count: list(g.options).length });
	return out;
}

/** A class's key stats in the books' order, at most two. */
export function keyStatsOf(d: Draft): string[] {
	const keys = list<string>(d.keyStats).map(s => String(s).toUpperCase());
	return STATS.filter(s => keys.includes(s)).slice(0, 2);
}

/** The class (from the compendium) a subclass or option is for, if it's there. */
export const classIn = (comp: Compendium, name: string): ClassEntry | undefined => (name ? comp.classByName(name) : undefined);
