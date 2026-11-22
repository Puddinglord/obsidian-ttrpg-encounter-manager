// How class dice behave at the table, from the class audit
// (scripts/compendium/raw/resources.json). Pure: no Obsidian imports.
//
// Two kinds of dice pool:
// - Rolled when spent (Judgment Dice, Combat Dice): the sheet keeps how many you
//   have, and they're rolled with the attack they go into.
// - Rolled when gained (Fury Dice, Swarm Dice): you roll them as you get them and
//   set them aside, so the sheet keeps their faces and a roll adds those faces.

import { ClassResource, nameKey } from './compendium';

export type RollKind = 'attack' | 'spell' | 'save' | 'check';

export interface ResourceRule {
	match: RegExp;
	rolledWhen: 'gained' | 'spent';
	/** Rolls the dice go into. */
	on: RollKind[];
	/** How many go in: every held die, any number of them, or one. */
	amount: 'all' | 'any' | 'one';
	/** Stays held after the roll (Fury Dice add to every STR attack while Raging). */
	keep?: boolean;
	/** Switched on in the roll dialog: always, never, or while a condition is on the hero. */
	autoOn: boolean | RegExp;
	/** "radiant": shown with the dice in the dialog and the roll log. */
	damageType?: string;
	/** Dice gained at once ("roll and set aside 2d6"); only when you hold none. */
	gain?: { count: number | 'max'; onlyWhenEmpty?: boolean; label: string };
	/** Why it's in the roll ("while Raging"). */
	note?: string;
	/** Only melee and Reach attacks and spells, not ranged ones. */
	reachOnly?: boolean;
	/** The most you can hold, by the rules, at a level and subclass (the compendium's number is only the base). */
	maxAt?: (level: number, subclass: string) => number;
	/** More held on top of the resource's own max, from a level and for a subclass (a class's `maxSteps`). */
	maxAdd?: (level: number, subclass: string) => number;
	/** Gone after a fight, so empty after a Safe Rest. */
	clearsOnRest?: boolean;
	/** The die by level ("d6 from level 1, d8 from 3…"), from the class tables. */
	dieByLevel?: Record<number, string>;
	/** The class features whose words explain these dice, shown under the name on the sheet. */
	rules?: string[];
}

const RULES: ResourceRule[] = [
	// Oathsworn p.4: gained when an enemy attacks you, expended on your next Reach attack (weapon or spell) as
	// extra radiant damage, lost on a miss. Kept as a count and rolled with the attack.
	{ match: /^judgment dice$/i, rolledWhen: 'spent', on: ['attack', 'spell'], amount: 'any', autoOn: true, damageType: 'radiant', reachOnly: true, clearsOnRest: true,
		// Radiant Judgment: 2 dice; Aura of Zeal (Oath of Vengeance, level 3) and Radiant Judgment (6) (level 14) roll 1 more each.
		maxAt: (level, subclass) => 2 + (/vengeance/i.test(subclass) && level >= 3 ? 1 : 0) + (level >= 14 ? 1 : 0),
		dieByLevel: { 1: 'd6', 3: 'd8', 5: 'd10', 8: 'd12', 10: 'd20' }, rules: ['Radiant Judgment'] },
	// Berserker p.4: Rage: roll a Fury Die and set it aside; add it to every STR attack you make (kept, not spent).
	{ match: /^fury dice$/i, rolledWhen: 'gained', on: ['attack'], amount: 'all', keep: true, autoOn: /rag(e|ing)/i, note: 'while Raging',
		gain: { count: 1, label: 'Rage' }, dieByLevel: { 1: 'd4', 6: 'd6', 9: 'd8', 13: 'd10', 17: 'd12' }, rules: ['That all you got?!'] },
	// Commander: roll and expend 1 Combat Die per attack, through a Combat Tactic.
	{ match: /^combat dice$/i, rolledWhen: 'spent', on: ['attack'], amount: 'one', autoOn: false,
		dieByLevel: { 2: 'd6', 5: 'd8', 9: 'd10', 13: 'd12', 17: 'd20' }, rules: ['Fit for Any Battlefield'] },
	// Shadowmancer (Endless Swarm): expend any of them to increase an attack's damage.
	{ match: /^swarm dice$/i, rolledWhen: 'gained', on: ['attack', 'spell'], amount: 'any', autoOn: false, gain: { count: 1, label: 'Swarm' },
		dieByLevel: { 3: 'd4', 15: 'd8' } },
];

export function resourceRule(resource: string): ResourceRule | undefined {
	return RULES.find(r => r.match.test(resource.trim()));
}

const ROLLS: RollKind[] = ['attack', 'spell', 'save', 'check'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Dice described as data (a homebrew or content pack class's `dice`), as a rule like the books' own. */
export function ruleFromData(r: Pick<ClassResource, 'name' | 'dice'>): ResourceRule | undefined {
	const d = r.dice;
	if (!d || (d.rolled !== 'spent' && d.rolled !== 'gained')) return undefined;
	const on = (d.addTo ?? []).map(x => String(x).toLowerCase()).filter((x): x is RollKind => (ROLLS as string[]).includes(x));
	const byLevel = (d.byLevel ?? []).filter(x => Number.isFinite(x?.level) && /^d\d+$/i.test(String(x?.die ?? '').trim()));
	const steps = (d.maxSteps ?? []).filter(x => Number.isFinite(x?.level) && Number.isFinite(x?.add));
	return {
		match: new RegExp(`^${escape(r.name.trim())}$`, 'i'),
		rolledWhen: d.rolled,
		on: on.length ? on : ['attack'],
		amount: d.use ?? 'one',
		...(d.keep ? { keep: true } : {}),
		autoOn: d.onWhile?.trim() ? new RegExp(`^${escape(d.onWhile.trim())}$`, 'i') : !!d.on,
		...(d.damageType ? { damageType: d.damageType } : {}),
		...(d.gain ? { gain: { count: d.gain, label: d.gainLabel?.trim() || 'Gain' } } : {}),
		...(d.reachOnly ? { reachOnly: true } : {}),
		...(d.clearsOnRest ? { clearsOnRest: true } : {}),
		...(byLevel.length ? { dieByLevel: Object.fromEntries(byLevel.map(x => [x.level, x.die.trim().toLowerCase()])) } : {}),
		...(d.rules?.length ? { rules: d.rules } : {}),
		...(steps.length ? { maxAdd: (level: number, subclass: string) => steps.filter(x => level >= x.level && (!x.subclass || nameKey(x.subclass) === nameKey(subclass))).reduce((n, x) => n + x.add, 0) } : {}),
	};
}

/** A resource's dice rule: its own (from data), else the books' by its name. */
export function ruleOf(r: { name: string; rule?: ResourceRule }): ResourceRule | undefined {
	return r.rule ?? resourceRule(r.name);
}

/** Is `resource` a pool of dice you can put into a roll of this kind? */
export function spendsOn(resource: string, kind: RollKind): boolean {
	return !!resourceRule(resource)?.on.includes(kind);
}

/** Is the dice pool switched on in the roll dialog, given the hero's conditions? */
export function startsOn(rule: ResourceRule, conditions: string[]): boolean {
	return typeof rule.autoOn === 'boolean' ? rule.autoOn : conditions.some(c => (rule.autoOn as RegExp).test(c));
}

/**
 * The faces a hero holds: the note's rolled faces, as many as they have dice.
 * Missing faces (a count set by hand) come back as 0, meaning "not rolled yet".
 */
export function heldFaces(current: number, rolled: number[] | undefined): number[] {
	const r = (rolled ?? []).filter(n => Number.isFinite(n) && n > 0).map(Math.round);
	return Array.from({ length: Math.max(0, current) }, (_, i) => r[i] ?? 0);
}


/**
 * The die a pool uses at this level, from its table (undefined when the rule has none). Below the table's first level,
 * the resource's own die (`base`: a class's "d6" that grows to d8 at 5), else the table's first.
 */
export function dieAt(rule: ResourceRule | undefined, level: number, base?: string): string | undefined {
	if (!rule?.dieByLevel) return undefined;
	let die: string | undefined;
	for (const [lv, d] of Object.entries(rule.dieByLevel).sort((a, b) => Number(a[0]) - Number(b[0]))) if (level >= Number(lv)) die = d;
	return die ?? base ?? Object.values(rule.dieByLevel)[0];
}
