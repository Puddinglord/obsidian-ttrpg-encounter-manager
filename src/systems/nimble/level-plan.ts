// What a level brings, worked out from the compendium: the new features, a
// subclass to choose, picks from an option group ("Choose 1 ability from the
// Savage Arsenal"), stat increases ("+1 STR or DEX"), an Epic Boon. Then what
// the player chose for a run of levels (one level up, or a new hero's levels 1
// to N), written to the note in one go. Pure: no Obsidian imports, so the
// wizard's rules are unit-tested.
//
// Core Rules 3.3, Leveling Up: roll the Hit Die with advantage (or take the flat
// bonus), +1 max Hit Die, 1 skill point (and you may move 1 point from one skill
// to another), and the class's features for the level.

import type { Boon, ClassOption, Compendium, OptionGroup, ResolvedFeature, Subclass } from './compendium';
import { nameKey, STATS, StatKey } from './compendium';
import { addFeature, addSchools, addSpell, Frontmatter, hpAverage, levelUp, readCharacter, setSkill, setStat } from './character-def';

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
	/** Spell schools and Utility Spells to choose ("Choose 1 Radiant Utility Spell"). */
	spells: SpellPick[];
	/** Utility Spells the level gives outright ("You know all Necrotic Utility Spells"): their schools. */
	spellGrants: { feature: string; schools: string[] | 'known' }[];
	/** Options the level gives outright ("You know all Chimeric Boons"). */
	grants: string[];
	/** The Hit Die and its average, for the HP step. */
	hitDie: number;
	average: number;
}

/**
 * A spell school or Utility Spells to choose. `schools` is the list offered, or what the hero knows by then
 * ('known'), a school they don't know yet ('new'), or any school ('any').
 */
export interface SpellPick {
	/** Stable in a run: `${level}|${feature}|${n}`. */
	key: string;
	level: number;
	feature: string;
	/** 'school': learn a spell school; 'utilities': learn every Utility Spell of one school; 'utility': Utility Spells by name. */
	kind: 'school' | 'utilities' | 'utility';
	schools: string[] | 'known' | 'new' | 'any';
	/** One pick for each school the hero knows ("a Utility Spell from each spell school you know"). */
	each?: boolean;
	count: number;
}

/** An option that can be chosen more than once ("+1 max Combat Dice"). */
export interface RepeatableOption extends ClassOption { repeatable?: boolean }

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

/** A feature used in play ("(1/round) On your turn…", "Action: …"), not a choice made when levelling. */
const inPlay = (text: string): boolean =>
	/^\s*\((?:\d+|[A-Z]{3}|\d+×[A-Z]{3})\s*(?:times?\s*)?\/\s*(?:turn|round|encounter|Safe Rest|day|location)/i.test(text)
	|| /^\s*(?:\d\+?\s+)?(?:Actions?|Reaction)\s*:/i.test(text);

/**
 * The option groups a feature hands out picks from. A group counts when every
 * word of its name (made singular) shows up in the feature ("Choose 1 Greater
 * Shadow Invocation" → Greater Invocations); failing that, when its last word
 * does ("Choose 1 new Invention AND 1 new Gadget" → Major Inventions, Gadgets).
 * Only a feature that says to choose, learn or pick gives a pick ("Weapon
 * Mastery (3). You have complete mastery of all weapon types." doesn't).
 */
export function groupsFor(feature: { name: string; text: string }, groups: OptionGroup[]): OptionGroup[] {
	const verb = feature.text.match(/\b(?:choose|learn|pick|select)\b([^.]*)/i);
	if (!verb || inPlay(feature.text)) return [];
	// What's chosen is named after the verb: "Choose 2 Chimeric Boons. Whenever you Beastshift into a Direbeast form…".
	const words = new Set(stems(verb[1]));
	const name = (g: OptionGroup) => stems(g.name).filter(w => !['a', 'the', 'of'].includes(w));
	const full = groups.filter(g => name(g).length > 0 && name(g).every(w => words.has(w)));
	const last = groups.filter(g => { const n = name(g); return n.length > 0 && words.has(n[n.length - 1]); });
	// "1 new Invention AND 1 new Gadget": two lists named in one feature.
	if (last.length > 1 && /\b(AND|OR)\b/.test(verb[1])) return last;
	if (full.length) {
		// The most specific name wins ("Greater Invocations" over "Invocations").
		const best = Math.max(...full.map(g => name(g).length));
		return full.filter(g => name(g).length === best).slice(0, 1);
	}
	if (last.length) return last;
	// "Savage Arsenal (2). Choose a 2nd ability." names its list in the feature's name.
	return groups.filter(g => nameKey(feature.name).startsWith(nameKey(g.name))).slice(0, 1);
}

/** The group a phrase names ("the Savage Arsenal", "Combat Tactic", "your Lyrical Weaponry abilities"), if any. */
function groupNamed(phrase: string, groups: OptionGroup[]): OptionGroup | undefined {
	const words = new Set(stems(phrase));
	const name = (g: OptionGroup) => stems(g.name).filter(w => !['a', 'the', 'of'].includes(w));
	const hits = groups.filter(g => name(g).length > 0 && name(g).every(w => words.has(w)));
	return hits.sort((x, y) => name(y).length - name(x).length)[0];
}

/**
 * What a subclass does to the class's lists (the 3.x class books): lists it gives up ("You lose access to the
 * Savage Arsenal", "You forgo all Commander’s Orders"), and what you choose instead ("For every Underhanded
 * Ability you would have…, choose an Honorable Gambit instead"; "Whenever you could choose a Combat Tactic or
 * Weapon Mastery, instead choose another Commander’s Order"). `instead` maps a list to the one chosen in its place.
 */
export function subclassSwaps(texts: string[], groups: OptionGroup[]): { lost: Set<string>; instead: Map<string, string> } {
	const lost = new Set<string>();
	const instead = new Map<string, string>();
	for (const t of texts) {
		for (const m of t.matchAll(/\b(?:lose access to|forgo(?: all)?|give up)\s+(.+?)(?=,?\s+(?:but|in exchange)\b|[.;:]|$)/gi)) {
			for (const part of m[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
				const g = groupNamed(part, groups);
				if (g) lost.add(g.name);
			}
		}
		for (const m of t.matchAll(/For every ([^,.(]+?) you would have\b[^.]*?\bchoose an? ([^.,]+?) instead/gi)) {
			const from = groupNamed(m[1], groups);
			const to = groupNamed(m[2], groups);
			if (from && to) instead.set(from.name, to.name);
		}
		for (const m of t.matchAll(/Whenever you could choose an? ([^,.]+?), instead choose (?:another |an? )?([^,.]+?)(?=\s+or\b|[.,])/gi)) {
			const to = groupNamed(m[2], groups);
			if (!to) continue;
			for (const part of m[1].split(/\s+or\s+(?:an?\s+)?/)) {
				const from = groupNamed(part, groups);
				if (from) instead.set(from.name, to.name);
			}
		}
	}
	return { lost, instead };
}

export const SPELL_SCHOOLS = ['Fire', 'Ice', 'Lightning', 'Wind', 'Radiant', 'Necrotic'];
const schoolNamed = (w: string): string | undefined => SPELL_SCHOOLS.find(x => x.toLowerCase() === w.toLowerCase());
const N = '(?:\\d+|a|an|one|another|a \\d+(?:st|nd|rd|th))';

/** The spell schools and Utility Spells a feature has you choose, or gives outright. */
export function spellChoices(f: { name: string; text: string }, level: number): { picks: SpellPick[]; grants: LevelPlan['spellGrants'] } {
	const t = f.text;
	const picks: SpellPick[] = [];
	const grants: LevelPlan['spellGrants'] = [];
	const add = (p: Omit<SpellPick, 'key' | 'level' | 'feature'>) => picks.push({ key: `${level}|${f.name}|${picks.length}`, level, feature: f.name, ...p });
	const count = (w: string) => (/^\d+$/.test(w) ? Number(w) : 1);
	let m: RegExpMatchArray | null;
	if ((m = t.match(new RegExp(`Choose (${N}) additional spell schools? to learn`, 'i')))) add({ kind: 'school', schools: 'new', count: count(m[1]) });
	else if ((m = t.match(/Choose the (\w+) or (\w+) school to learn/i)) && schoolNamed(m[1]) && schoolNamed(m[2])) add({ kind: 'school', schools: [schoolNamed(m[1])!, schoolNamed(m[2])!], count: 1 });
	if (new RegExp(`Learn the Utility Spells from ${N} spell school you know`, 'i').test(t)) add({ kind: 'utilities', schools: 'known', count: 1 });
	else if (new RegExp(`(?:Choose|Learn) ${N} Utility Spell from each spell school you know`, 'i').test(t)) add({ kind: 'utility', schools: 'known', each: true, count: 1 });
	else if ((m = t.match(new RegExp(`Choose ${N} (\\w+) and ${N} (\\w+) Utility Spells?`, 'i'))) && schoolNamed(m[1]) && schoolNamed(m[2])) {
		add({ kind: 'utility', schools: [schoolNamed(m[1])!], count: 1 });
		add({ kind: 'utility', schools: [schoolNamed(m[2])!], count: 1 });
	} else if ((m = t.match(new RegExp(`Choose (${N}) (\\w+) Utility Spells?`, 'i'))) && schoolNamed(m[2])) add({ kind: 'utility', schools: [schoolNamed(m[2])!], count: count(m[1]) });
	else if ((m = t.match(new RegExp(`Learn any (${N}) Utility Spells?`, 'i')))) add({ kind: 'utility', schools: 'any', count: count(m[1]) });
	if ((m = t.match(/You know all (\w+)(?: and (\w+))? Utility Spells/i)) && schoolNamed(m[1])) grants.push({ feature: f.name, schools: [schoolNamed(m[1])!, ...(m[2] && schoolNamed(m[2]) ? [schoolNamed(m[2])!] : [])] });
	else if (/You know all Utility Spells from the spell schools you know/i.test(t)) grants.push({ feature: f.name, schools: 'known' });
	return { picks, grants };
}

/** The single group a feature picks from (see groupsFor), if there's exactly one. */
export function groupFor(feature: { name: string; text: string }, groups: OptionGroup[]): OptionGroup | undefined {
	const gs = groupsFor(feature, groups);
	return gs.length === 1 ? gs[0] : undefined;
}

/** "+1 STR or DEX." → STR, DEX ×1; "+1 to any 2 of your stats" → all four ×2. The feature may be "Key Stat Increase" or "+Key Stat". */
export function statIncrease(feature: { name: string; text: string }): StatIncrease | undefined {
	const t = feature.text;
	// "+1 to any 2 of your stats" (Psion, Revenant…), "Increase any 2 stats by 1" (Hexbinder, Manawright).
	const any = t.match(/\+1 to any (\d+|two) of your stats/i) ?? t.match(/increase any (\d+|two) (?:of your )?stats by 1/i);
	if (any) return { feature: feature.name, options: [...STATS], count: any[1].toLowerCase() === 'two' ? 2 : Number(any[1]) };
	if (!/stat/i.test(feature.name) && !/^\s*\+1\s+(STR|DEX|INT|WIL)\b/i.test(t)) return undefined;
	const m = t.match(/\+1\s+((?:STR|DEX|INT|WIL)(?:\s*(?:,|or|\/)\s*(?:STR|DEX|INT|WIL))*)/i);
	if (!m) return undefined;
	const options = [...new Set((m[1].toUpperCase().match(/STR|DEX|INT|WIL/g) ?? []) as StatKey[])];
	return options.length ? { feature: feature.name, options, count: 1 } : undefined;
}

export interface PlanOptions {
	className: string;
	/** The subclass the hero has. */
	subclass: string;
	level: number;
	hitDie: number;
	average: number;
	/** The subclass chosen earlier in this run of levels: its features and lists come along. */
	chosen?: string;
	/** A new hero's background, for what it has them choose at level 1 ("Learn any 1 Utility Spell"). */
	background?: { name: string; text?: string };
	/** An earlier level in this run already offered the subclass (levels 7, 11 and 15 say "Subclass" too). */
	subclassOffered?: boolean;
}

const offersSubclass = (f: { name: string; text: string }): boolean => /^(?:\w+ )?subclass$/i.test(f.name.trim()) || /\bchoose an? .*subclass\b/i.test(f.text);

/** The level a class has you choose its subclass (3 in every 3.x book). */
export function subclassLevel(comp: Compendium, className: string): number {
	const cls = comp.classByName(className);
	const lv = (cls?.levels ?? []).filter(l => (l.features ?? []).some(f => offersSubclass({ name: f.name ?? '', text: f.text ?? '' }))).map(l => l.level ?? 99);
	return lv.length ? Math.min(...lv) : 3;
}

export function levelPlan(comp: Compendium, o: PlanOptions): LevelPlan {
	const level = o.level;
	const cls = comp.classByName(o.className);
	// A subclass chosen in this run only counts from the level it's chosen at.
	const sub = o.subclass || (o.chosen && level >= subclassLevel(comp, o.className) ? o.chosen : '');
	const subEntry = comp.subclass(o.className, sub);
	const features = comp.featuresAt(o.className, sub, level);
	const choosesSubclass = !o.subclass && !o.subclassOffered && features.some(f => f.from === 'class' && offersSubclass(f));
	const subclasses = choosesSubclass ? (cls?.subclasses ?? []) : [];
	// The class's lists, then the subclass's own (not one that only holds what it gives you, like a Gadgeteer's Cheer Bot).
	const classGroups = cls?.optionGroups ?? [];
	const lastWord = (g: OptionGroup) => stems(g.name).slice(-1)[0];
	const groups = [...classGroups, ...(subEntry?.optionGroups ?? []).filter(g => !classGroups.some(c => lastWord(c) === lastWord(g)))];
	// Tiers of a list that open as you level ("Unlock Greater Psionic Abilities"): picks from the list come from every tier open by now.
	const unlocked: OptionGroup[] = [];
	for (const f of comp.featuresFor(o.className, sub, level)) {
		for (const m of f.text.matchAll(/\bUnlock ([^.,]+)/gi)) {
			const g = groupNamed(m[1], groups);
			if (g && !unlocked.includes(g)) unlocked.push(g);
		}
	}
	const widen = (g: OptionGroup): OptionGroup => {
		const tiers = unlocked.filter(u => u !== g && nameKey(u.name).endsWith(nameKey(g.name)));
		return tiers.length ? { name: g.name, intro: g.intro, options: tiers.flatMap(u => u.options ?? []) } : g;
	};
	// What the subclass changes, from everything it says up to this level.
	const subTexts = subEntry ? [subEntry.intro ?? '', ...(subEntry.levels ?? []).filter(l => (l.level ?? 0) <= level).flatMap(l => (l.features ?? []).map(f => f.text ?? ''))] : [];
	const swaps = subclassSwaps(subTexts, groups);
	// Lists the hero knows all of by now ("You know all Chimeric Boons") have nothing left to choose.
	const knowAll = new Set<string>();
	for (const f of comp.featuresFor(o.className, sub, level)) {
		const m = f.text.match(/You know all ([^.,]+)/i);
		const g = m && !/utility spells/i.test(m[1]) ? groupNamed(m[1], groups) : undefined;
		if (g) knowAll.add(g.name);
	}
	const picks: OptionPick[] = [];
	const stats: StatIncrease[] = [];
	const spells: SpellPick[] = [];
	const spellGrants: LevelPlan['spellGrants'] = [];
	const grants: string[] = [];
	let boons: Boon[] = [];
	const pickFrom = (f: { name: string; text: string; from?: string }, g: OptionGroup, count: number) => {
		// The subclass's own features say exactly what to choose ("Old Habits… Choose 1 Underhanded Ability").
		const own = f.from === 'subclass';
		const to = own ? undefined : swaps.instead.get(g.name);
		const group = to ? groups.find(x => x.name === to) : swaps.lost.has(g.name) && !own ? undefined : g;
		if (!group || knowAll.has(group.name)) return;
		// "Learn the Pestilent Affliction", "Learn Telekinetic Bastion": that one, given rather than chosen.
		const named = /\bchoose\b/i.test(f.text) ? undefined : groups.flatMap(x => x.options ?? []).find(x => nameKey(f.text).includes(nameKey(x.name)));
		if (named) { grants.push(named.name); return; }
		picks.push({ feature: f.name, group: widen(group), count });
	};
	const texts: { name: string; text: string; from?: string }[] = [...features];
	if (level === 1 && o.background?.text) texts.push({ name: o.background.name, text: o.background.text });
	for (const f of texts) {
		const sp = spellChoices(f, level);
		spells.push(...sp.picks);
		spellGrants.push(...sp.grants);
		if (/epic boon/i.test(`${f.name} ${f.text}`) && /\bchoose\b/i.test(f.text)) { boons = comp.boons.filter(b => /epic/i.test(b.kind ?? '')); continue; }
		const inc = statIncrease(f);
		if (inc) { stats.push(inc); continue; }
		const known = f.text.match(/You know all ([^.,]+)/i);
		const all = known && !/utility spells/i.test(known[1]) ? groupNamed(known[1], groups) : undefined;
		if (all) { grants.push(...(all.options ?? []).map(x => x.name)); continue; }
		// "You know the Withered and Frenzied Afflictions": those, given.
		const given = /^\s*You know the\b/i.test(f.text) ? groupNamed(f.text.split('.')[0], groups) : undefined;
		if (given) {
			const at = (x: { name: string }) => nameKey(f.text).indexOf(nameKey(x.name));
			grants.push(...(given.options ?? []).filter(x => at(x) >= 0).sort((a, b) => at(a) - at(b)).map(x => x.name));
			continue;
		}
		// "Choose another Combat Ability or gain +1 max Combat Dice" (Commander): an Order or a Tactic, or the die.
		const either = f.text.match(/Choose another Combat Ability or gain (\+1 max [^.]+)/i);
		if (either) {
			const die = either[1].trim();
			const lists = groups.filter(g => /order|tactic/i.test(g.name) && !swaps.lost.has(g.name));
			const options: RepeatableOption[] = [...lists.flatMap(g => g.options ?? []), { name: die, text: `Gain ${die}.`, repeatable: true }];
			picks.push({ feature: f.name, group: { name: 'Combat Abilities', options }, count: 1 });
			continue;
		}
		const gs = groupsFor(f, groups);
		if (gs.length === 1) pickFrom(f, gs[0], chooseCount(f.text));
		else if (gs.length > 1 && /\bor\b/i.test(f.text)) {
			// "1 new Invention OR 1 new Gadget": one pick from either list.
			picks.push({ feature: f.name, group: { name: gs.map(g => g.name).join(' or '), options: gs.flatMap(g => g.options ?? []) }, count: 1 });
		} else for (const g of gs) pickFrom(f, g, 1);
	}
	// A subclass that has you choose a companion when you take it (Beastmaster): one of its companion lists.
	if (subEntry && choosesSubclass && /\bchoose an? [^.]*\bas your companion\b/i.test(subEntry.intro ?? '')) {
		const companions = (subEntry.optionGroups ?? []).filter(g => /companion$/i.test(g.name));
		if (companions.length) {
			const options = companions.map(g => ({ name: g.name, text: g.intro ?? '', requirement: /Req\. Lvl \d+/i.exec(g.intro ?? '')?.[0] }));
			picks.push({ feature: subEntry.name, group: { name: 'Companion', options }, count: 1 });
		}
	}
	return { level, features, subclasses, picks, stats, boons, spells, spellGrants, grants, hitDie: o.hitDie, average: o.average };
}

/**
 * Every level from `from` to `to`, in order: one level up (from = to = the next level), or a new hero's levels
 * 1 to N. `chosen` is the subclass picked in this run, so the levels after it get its features and lists.
 */
export function levelPlans(comp: Compendium, o: { className: string; subclass: string; from: number; to: number; hitDie: number; chosen?: string; background?: PlanOptions['background'] }): LevelPlan[] {
	const out: LevelPlan[] = [];
	const average = hpAverage(o.hitDie, comp);
	for (let level = Math.max(1, o.from); level <= Math.min(20, o.to); level++) {
		const subclassOffered = out.some(p => p.subclasses.length > 0);
		out.push(levelPlan(comp, { className: o.className, subclass: o.subclass, chosen: o.chosen, level, hitDie: o.hitDie, average, background: o.background, subclassOffered }));
	}
	return out;
}

/** The picks of a run of levels from one list, together: one level's "Choose 2", or a new level 8 hero's four Savage Arsenal abilities. */
export interface PickGroup {
	/** The list's name ("Savage Arsenal"), which keys its choices. */
	name: string;
	group: OptionGroup;
	/** How many to choose, over the whole run. */
	count: number;
	/** Where they come from: the feature and its level, in order. */
	from: { level: number; feature: string; count: number }[];
}

/** A run's picks, a list at a time, in the order their lists first come up. */
export function pickGroups(plans: LevelPlan[]): PickGroup[] {
	const out = new Map<string, PickGroup>();
	for (const p of plans) for (const pick of p.picks) {
		const g = out.get(pick.group.name) ?? { name: pick.group.name, group: { ...pick.group, options: [] }, count: 0, from: [] };
		// A list can grow as levels unlock more of it (a Psion's Greater abilities at level 5): every option offered.
		for (const o of pick.group.options ?? []) if (!g.group.options.some(x => x.name === o.name)) g.group.options.push(o);
		g.count += pick.count;
		g.from.push({ level: p.level, feature: pick.feature, count: pick.count });
		out.set(g.name, g);
	}
	return [...out.values()];
}

/** A stat increase's place in a run of levels. */
export const increaseKey = (level: number, inc: StatIncrease): string => `${level}|${inc.feature}`;

/** What the player chose for a run of levels. */
export interface LevelChoices {
	/** HP gained at each level past the first in the run, in order (missing: the flat bonus). */
	hp: number[];
	/** The subclass, at the level that offers one. */
	subclass?: string;
	/** Options chosen, by list (PickGroup.name). An option that can be taken again may be in it more than once. */
	picks: Record<string, string[]>;
	/** Stats raised by one, by increaseKey. */
	stats: Record<string, StatKey[]>;
	/** Spell schools or Utility Spells chosen, by SpellSlot.key. */
	spells: Record<string, string[]>;
	/** The Epic Boon, at level 19. */
	boon?: string;
	/** Skill points: +n placed on a skill, −n moved off one. */
	skills: Record<string, number>;
}

export const noChoices = (): LevelChoices => ({ hp: [], picks: {}, stats: {}, spells: {}, skills: {} });

/** The levels in a run that are gained by levelling up (a new hero's level 1 isn't). */
export const gainedLevels = (plans: LevelPlan[]): LevelPlan[] => plans.filter(p => p.level > 1);

/** One spell choice as the wizard shows it: what's offered (school names, or Utility Spells by name) and how many. */
export interface SpellSlot {
	key: string;
	level: number;
	feature: string;
	kind: SpellPick['kind'];
	options: string[];
	count: number;
	/** The school of a "from each spell school you know" slot. */
	school?: string;
}

/** A school's Utility Spells, in book order. */
export const utilitySpells = (comp: Compendium, school: string): string[] =>
	comp.spells.filter(sp => sp.utility && !sp.secret && nameKey(sp.school ?? '') === nameKey(school)).map(sp => sp.name);

/**
 * A run's spell choices, worked out in level order: the schools a "spell school you know" pick offers include the
 * ones chosen at earlier levels (a Songweaver's level 2 school, at level 3). `known` is what the hero knows before
 * the run. Also the Utility Spells the run gives outright ("You know all Necrotic Utility Spells").
 */
export function spellSlots(comp: Compendium, plans: LevelPlan[], known: string[], c: Pick<LevelChoices, 'spells'>): { slots: SpellSlot[]; granted: string[] } {
	const schools = [...known];
	const taken = new Set<string>();
	const slots: SpellSlot[] = [];
	const granted: string[] = [];
	const has = (x: string) => schools.some(k => nameKey(k) === nameKey(x));
	for (const p of plans) {
		for (const pick of p.spells) {
			const from = pick.schools === 'known' ? [...schools] : pick.schools === 'new' ? SPELL_SCHOOLS.filter(x => !has(x)) : pick.schools === 'any' ? [...SPELL_SCHOOLS] : pick.schools;
			const base = { key: pick.key, level: p.level, feature: pick.feature, kind: pick.kind, count: pick.count };
			if (pick.kind === 'school') {
				slots.push({ ...base, options: from });
				for (const x of (c.spells[pick.key] ?? []).slice(0, pick.count)) if (from.includes(x) && !has(x)) schools.push(x);
			} else if (pick.kind === 'utilities') {
				const open = from.filter(x => !taken.has(nameKey(x)) || (c.spells[pick.key] ?? []).includes(x));
				slots.push({ ...base, options: open });
				for (const x of c.spells[pick.key] ?? []) taken.add(nameKey(x));
			} else if (pick.each) {
				for (const sc of from) slots.push({ ...base, key: `${pick.key}|${sc}`, options: utilitySpells(comp, sc), school: sc });
			} else {
				slots.push({ ...base, options: from.flatMap(sc => utilitySpells(comp, sc)) });
			}
		}
		for (const g of p.spellGrants) for (const sc of g.schools === 'known' ? [...schools] : g.schools) granted.push(...utilitySpells(comp, sc));
	}
	return { slots, granted };
}

/** A repeatable option taken again: "+1 max Combat Dice", then "+1 max Combat Dice (2)"… */
function addAgain(fm: Frontmatter, name: string, text: string | undefined): void {
	const nameOf = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && 'name' in v && typeof v.name === 'string' ? v.name : '');
	const have = new Set(list(fm.features).map(v => nameKey(nameOf(v))));
	let n = 1;
	while (have.has(nameKey(n === 1 ? name : `${name} (${n})`))) n++;
	addFeature(fm, { name: n === 1 ? name : `${name} (${n})`, text });
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Write a run of levels to a character's frontmatter: each level's HP and Hit Die (Core Rules 3.3), then the
 * subclass, the options picked, spell schools and Utility Spells, the Epic Boon, the stat increases and the skill
 * points. `plans` start at the level after the note's (or at 1 for a hero being made, whose level 1 is written).
 */
export function applyLevelChoices(fm: Frontmatter, comp: Compendium, plans: LevelPlan[], c: LevelChoices): void {
	const known = readCharacter(fm, comp).schools;
	gainedLevels(plans).forEach((p, i) => {
		const gain = c.hp[i];
		levelUp(fm, readCharacter(fm, comp), Number.isFinite(gain) ? gain : p.average);
	});
	if (c.subclass && plans.some(p => p.subclasses.some(sc => sc.name === c.subclass))) fm.subclass = c.subclass;
	for (const g of pickGroups(plans)) {
		for (const name of (c.picks[g.name] ?? []).slice(0, g.count)) {
			const o: RepeatableOption | undefined = (g.group.options ?? []).find(x => x.name === name);
			// A choice that isn't one of the class's options (a companion, "+1 max Combat Dice") keeps its text.
			const own = o && !comp.option(o.name);
			if (o?.repeatable) addAgain(fm, o.name, o.text);
			else addFeature(fm, own ? { name, text: o.text } : name);
		}
	}
	for (const p of plans) for (const name of p.grants) addFeature(fm, name);
	const { slots, granted } = spellSlots(comp, plans, known, c);
	for (const slot of slots) {
		const chosen = (c.spells[slot.key] ?? []).filter(x => slot.options.includes(x)).slice(0, slot.count);
		if (slot.kind === 'school') addSchools(fm, chosen);
		else if (slot.kind === 'utilities') for (const sc of chosen) for (const sp of utilitySpells(comp, sc)) addSpell(fm, sp);
		else for (const sp of chosen) addSpell(fm, sp);
	}
	for (const sp of granted) addSpell(fm, sp);
	const boon = c.boon ? plans.flatMap(p => p.boons).find(b => b.name === c.boon) : undefined;
	if (boon) addFeature(fm, { name: boon.name, text: boon.text });
	for (const p of plans) for (const inc of p.stats) {
		for (const k of [...new Set(c.stats[increaseKey(p.level, inc)] ?? [])].filter(x => inc.options.includes(x)).slice(0, inc.count)) {
			setStat(fm, k, readCharacter(fm, comp).stats[k] + 1);
		}
	}
	const s = readCharacter(fm, comp);
	for (const [k, n] of Object.entries(c.skills)) {
		const sk = s.skills.find(x => x.key === k);
		if (sk && n) setSkill(fm, k, sk.points + n);
	}
}

/** Skill points a run of levels gives: one a level gained, plus any extra (Heroic Skills, at level 1). */
export const skillPointsFor = (plans: LevelPlan[], extra = 0): number => gainedLevels(plans).length + Math.max(0, extra);

/** What a subclass gives at each of its levels, for side-by-side comparison. */
export function subclassTimeline(sc: Subclass): { level: number; features: { name: string; text: string }[] }[] {
	return (sc.levels ?? []).slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map(l => ({ level: l.level, features: l.features ?? [] }));
}

/** Options a hero can still take from a group (ones they know already are left out). */
export function openOptions(group: OptionGroup, known: string[]): { option: ClassOption; taken: boolean }[] {
	const have = new Set(known.map(nameKey));
	return (group.options ?? []).map(option => ({ option, taken: have.has(nameKey(option.name)) }));
}
