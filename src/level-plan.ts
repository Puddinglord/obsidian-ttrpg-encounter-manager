// What a level brings, worked out from the compendium: the new features, a
// subclass to choose, picks from an option group ("Choose 1 ability from the
// Savage Arsenal"), stat increases ("+1 STR or DEX"), an Epic Boon. Pure: no
// Obsidian imports, so the level-up wizard's rules are unit-tested.

import type { Boon, ClassOption, Compendium, OptionGroup, ResolvedFeature, Subclass } from './compendium';
import { nameKey, STATS, StatKey } from './compendium';

export interface StatIncrease {
	/** The feature it comes from ("Key Stat Increase"). */
	feature: string;
	/** Stats it can go to, in the order printed. */
	options: StatKey[];
	/** How many different stats get +1 ("+1 to any 2 of your stats" is 2). */
	count: number;
}

export interface OptionPick {
	/** The feature that grants it ("Savage Arsenal (2)"). */
	feature: string;
	group: OptionGroup;
	/** How many to choose. */
	count: number;
}

export interface LevelPlan {
	level: number;
	/** Every feature gained at this level (class first, then subclass). */
	features: ResolvedFeature[];
	/** Subclasses to choose from, when this is the level to pick one (and none is picked yet). */
	subclasses: Subclass[];
	picks: OptionPick[];
	stats: StatIncrease[];
	/** Epic Boons to choose from, when the level grants one. */
	boons: Boon[];
	/** The Hit Die and its average, for the HP step. */
	hitDie: number;
	average: number;
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, another: 1 };

/** "Choose 2 …" → 2, "Choose a 2nd …" → 1, "Learn 1 …" → 1. */
export function chooseCount(text: string): number {
	const m = text.match(/\b(?:choose|learn|pick|gain)\s+(\d+|a|an|one|two|three|four|another)\b(?!\s*(?:st|nd|rd|th)\b)/i);
	if (!m) return 1;
	const n = Number(m[1]);
	return Number.isFinite(n) ? Math.max(1, n) : WORDS[m[1].toLowerCase()] ?? 1;
}

/** Lower-case words, each made singular ("abilities" → "ability", "decrees" → "decree"). */
function stems(text: string): string[] {
	return (text.toLowerCase().replace(/[’']/g, '').match(/[a-z]+/g) ?? []).map(w =>
		w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
}

/**
 * The option groups a feature hands out picks from. A group counts when every
 * word of its name (made singular) shows up in the feature ("Choose 1 Greater
 * Shadow Invocation" → Greater Invocations); failing that, when its last word
 * does ("Choose 1 new Invention AND 1 new Gadget" → Major Inventions, Gadgets).
 */
export function groupsFor(feature: { name: string; text: string }, groups: OptionGroup[]): OptionGroup[] {
	const words = new Set(stems(`${feature.name} ${feature.text}`));
	const named = groups.filter(g => nameKey(feature.name).startsWith(nameKey(g.name)));
	if (!/\b(choose|learn|pick)\b/i.test(feature.text) && !named.length) return [];
	const name = (g: OptionGroup) => stems(g.name).filter(w => !['a', 'the', 'of'].includes(w));
	const full = groups.filter(g => name(g).length > 0 && name(g).every(w => words.has(w)));
	const last = groups.filter(g => { const n = name(g); return n.length > 0 && words.has(n[n.length - 1]); });
	// "1 new Invention AND 1 new Gadget": two lists named in one feature.
	if (last.length > 1 && /\b(AND|OR)\b/.test(feature.text)) return last;
	if (full.length) {
		// The most specific name wins ("Greater Invocations" over "Invocations").
		const best = Math.max(...full.map(g => name(g).length));
		return full.filter(g => name(g).length === best).slice(0, 1);
	}
	return last;
}

/** The single group a feature picks from (see groupsFor), if there's exactly one. */
export function groupFor(feature: { name: string; text: string }, groups: OptionGroup[]): OptionGroup | undefined {
	const gs = groupsFor(feature, groups);
	return gs.length === 1 ? gs[0] : undefined;
}

/** "+1 STR or DEX." → STR, DEX ×1; "+1 to any 2 of your stats" → all four ×2. */
export function statIncrease(feature: { name: string; text: string }): StatIncrease | undefined {
	const t = feature.text;
	const any = t.match(/\+1 to any (\d+|two) of your stats/i);
	if (any) return { feature: feature.name, options: [...STATS], count: any[1] === 'two' ? 2 : Number(any[1]) };
	if (!/stat/i.test(feature.name) && !/^\s*\+1\s+(STR|DEX|INT|WIL)\b/i.test(t)) return undefined;
	const m = t.match(/\+1\s+((?:STR|DEX|INT|WIL)(?:\s*(?:,|or|\/)\s*(?:STR|DEX|INT|WIL))*)/i);
	if (!m) return undefined;
	const options = [...new Set((m[1].toUpperCase().match(/STR|DEX|INT|WIL/g) ?? []) as StatKey[])];
	return options.length ? { feature: feature.name, options, count: 1 } : undefined;
}

export function levelPlan(comp: Compendium, o: { className: string; subclass: string; level: number; hitDie: number; average: number }): LevelPlan {
	const level = o.level;
	const features = comp.featuresAt(o.className, o.subclass, level);
	const cls = comp.classByName(o.className);
	const choosesSubclass = !o.subclass && features.some(f => /^subclass$/i.test(f.name.trim()) || /\bchoose an? .*subclass\b/i.test(f.text));
	const subclasses = choosesSubclass ? (cls?.subclasses ?? []) : [];
	const groups = comp.optionGroups(o.className, o.subclass);
	const picks: OptionPick[] = [];
	const stats: StatIncrease[] = [];
	let boons: Boon[] = [];
	for (const f of features) {
		if (/epic boon/i.test(`${f.name} ${f.text}`) && /\bchoose\b/i.test(f.text)) { boons = comp.boons.filter(b => /epic/i.test(b.kind ?? '')); continue; }
		const inc = statIncrease(f);
		if (inc) { stats.push(inc); continue; }
		const gs = groupsFor(f, groups);
		if (gs.length === 1) picks.push({ feature: f.name, group: gs[0], count: chooseCount(f.text) });
		else if (gs.length > 1 && /\bor\b/i.test(f.text)) {
			// "1 new Invention OR 1 new Gadget": one pick from either list.
			picks.push({ feature: f.name, group: { name: gs.map(g => g.name).join(' or '), options: gs.flatMap(g => g.options ?? []) }, count: 1 });
		} else for (const g of gs) picks.push({ feature: f.name, group: g, count: 1 });
	}
	return { level, features, subclasses, picks, stats, boons, hitDie: o.hitDie, average: o.average };
}

/** What a subclass gives at each of its levels, for side-by-side comparison. */
export function subclassTimeline(sc: Subclass): { level: number; features: { name: string; text: string }[] }[] {
	return (sc.levels ?? []).slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map(l => ({ level: l.level, features: l.features ?? [] }));
}

/** Options a hero can still take from a group (ones they know already are left out). */
export function openOptions(group: OptionGroup, known: string[]): { option: ClassOption; taken: boolean }[] {
	const have = new Set(known.map(nameKey));
	return (group.options ?? []).map(option => ({ option, taken: have.has(nameKey(option.name)) }));
}
