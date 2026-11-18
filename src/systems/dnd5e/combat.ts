// A 5e fight and every change to it: initiative order, turns and rounds, HP
// with temporary HP, death saves, legendary action uses, conditions with
// durations. Pure: no Obsidian imports, so the rules here are unit-tested.
// Every function changes the fight in place and returns what happened.

import { HpCommand, parseHpCommand } from '../../core/tracker/hp';
import { applyTiming, emptyResult, EffectBearer, mergeResults, retime, turnEvent, TurnEventResult, undoTurnEvent } from '../../core/tracker/effects';
import type { AppliedCondition, ConditionTiming, TurnBoundary } from '../../core/types';
import { uid } from '../../core/types';
import { initiativeOf, saveOf } from './rules';
import type { Dnd5eEdition } from './editions';
import { ABILITIES, ABILITY_NAME, type Dnd5eMonster } from './types';

export type Rng = () => number;

export interface Combatant5e {
	id: string;
	/** As shown: "Goblin 2". */
	label: string;
	/** The monster's or hero's name. */
	name: string;
	side: 'hero' | 'monster';
	/** A snapshot of the stat block it was added from. */
	monster?: Dnd5eMonster;
	sourceFile?: string;
	/** Rolled or typed; undefined until then. */
	init?: number;
	/** Order among those on the same initiative, lowest first: set when the GM drags someone into place. */
	tiebreak?: number;
	initBonus: number;
	hp: number;
	maxHp: number;
	tempHp: number;
	ac?: number;
	conditions: AppliedCondition[];
	/** Heroes at 0 HP. */
	deathSaves?: { success: number; failure: number };
	stable?: boolean;
	dead?: boolean;
	/** Legendary actions: uses per round and how many are spent. */
	legendary?: { max: number; used: number };
	/** Legendary Resistance: uses per day and how many are spent (they don't come back during a fight). */
	resistances?: { max: number; used: number };
	/** Holding concentration on a spell: damage calls for a Constitution save, dropping to 0 ends it. */
	concentrating?: boolean;
	note?: string;
}

export interface FightLogEntry { round: number; text: string; time: number }

export interface Fight5e {
	id: string;
	name: string;
	edition: Dnd5eEdition;
	combatants: Combatant5e[];
	/** 0 before combat starts. */
	round: number;
	/** The current combatant's id, while combat runs. */
	turnId?: string;
	log: FightLogEntry[];
	sourcePath?: string;
	/** What the last Next turn did to conditions, so Back can put them back (one step). */
	undo?: { turnId?: string; round: number; result: TurnEventResult };
}

/** A turn change: who's up now, and what the conditions did (core/tracker/effects.ts). */
export interface TurnStep5e extends TurnEventResult {
	who?: Combatant5e;
}

export function newFight(name = 'Encounter', edition: Dnd5eEdition = '2024'): Fight5e {
	return { id: uid(), name, edition, combatants: [], round: 0, log: [] };
}

export const isRunning = (f: Fight5e) => f.round > 0;

function log(f: Fight5e, text: string): void {
	f.log.push({ round: f.round, text, time: Date.now() });
	if (f.log.length > 200) f.log.splice(0, f.log.length - 200);
}

const d20 = (rng: Rng) => 1 + Math.floor(rng() * 20);

/** Uses per round from the legendary actions' opening line: "can take 3 legendary actions", "Legendary Action Uses: 3". */
export function legendaryUses(m: Dnd5eMonster): number | undefined {
	if (!m.legendaryActions?.length) return undefined;
	const t = m.legendaryIntro ?? '';
	const n = /Legendary Action Uses:\s*(\d+)|take (\d+) legendary actions/i.exec(t);
	return n ? Number(n[1] ?? n[2]) : 3;
}

/** Legendary Resistance uses per day, from its trait: "Legendary Resistance (3/Day, or 4/Day in Lair)". */
export function legendaryResistances(m: Dnd5eMonster): number | undefined {
	const t = m.traits?.find(x => /^legendary resistance\b/i.test(x.name));
	if (!t) return undefined;
	const n = /(\d+)\s*\/\s*day/i.exec(`${t.name} ${t.desc}`);
	return n ? Number(n[1]) : 3;
}

/** The next free label for a name: "Goblin", then "Goblin 2", "Goblin 3"… (the first stays as it is). */
export function nextLabel(f: Fight5e, name: string): string {
	const taken = new Set(f.combatants.map(c => c.label.toLowerCase()));
	if (!taken.has(name.toLowerCase())) return name;
	for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

/** Add `count` of a monster. Mid-fight, each rolls initiative straight away. */
export function addMonster(f: Fight5e, m: Dnd5eMonster, count = 1, opts: { sourceFile?: string; rng?: Rng } = {}): Combatant5e[] {
	const added: Combatant5e[] = [];
	const rng = opts.rng ?? Math.random;
	for (let i = 0; i < Math.max(1, count); i++) {
		const legendary = legendaryUses(m);
		const c: Combatant5e = {
			id: uid(), label: nextLabel(f, m.name), name: m.name, side: 'monster', monster: m, sourceFile: opts.sourceFile,
			initBonus: initiativeOf(m), hp: m.hp, maxHp: m.hp, tempHp: 0, ac: m.ac, conditions: [],
		};
		if (legendary) c.legendary = { max: legendary, used: 0 };
		const resist = legendaryResistances(m);
		if (resist) c.resistances = { max: resist, used: 0 };
		if (isRunning(f)) c.init = d20(rng) + c.initBonus;
		f.combatants.push(c);
		added.push(c);
	}
	if (isRunning(f)) log(f, `${added.map(c => c.label).join(', ')} join${added.length === 1 ? 's' : ''} the fight`);
	return added;
}

export function addHero(f: Fight5e, h: { name: string; maxHp: number; ac?: number; initBonus?: number; heroId?: string }): Combatant5e {
	const c: Combatant5e = { id: h.heroId ?? uid(), label: nextLabel(f, h.name), name: h.name, side: 'hero', initBonus: h.initBonus ?? 0, hp: h.maxHp, maxHp: h.maxHp, tempHp: 0, ac: h.ac, conditions: [] };
	f.combatants.push(c);
	return c;
}

/** Turn order: highest initiative first; ties go to the order the GM dragged them into, then the higher bonus,
 *  then heroes, then by name. Not yet rolled: last. */
export function order(f: Fight5e): Combatant5e[] {
	const tb = (c: Combatant5e) => c.tiebreak ?? Infinity;
	return [...f.combatants].sort((a, b) => {
		if (a.init === undefined || b.init === undefined) {
			if (a.init !== b.init) return a.init === undefined ? 1 : -1;
			return tb(a) === tb(b) ? 0 : tb(a) < tb(b) ? -1 : 1;
		}
		return b.init - a.init || (tb(a) === tb(b) ? 0 : tb(a) < tb(b) ? -1 : 1) || b.initBonus - a.initBonus || (a.side === b.side ? 0 : a.side === 'hero' ? -1 : 1) || a.label.localeCompare(b.label, undefined, { numeric: true });
	});
}

/**
 * Move a combatant to `toIndex` in the turn order, as a drag does. `among` picks the list the index counts in
 * (the tracker's active rows; everyone by default). The moved one takes the initiative of whoever is now just
 * above it (below it, at the top), and everyone on that initiative gets a tiebreak in the order they now stand,
 * so later sorting keeps the drop. The current turn stays with the same creature. Returns whether anything moved.
 */
export function moveCombatant(f: Fight5e, id: string, toIndex: number, among: (c: Combatant5e) => boolean = () => true): boolean {
	const c = find(f, id);
	if (!c) return false;
	const list = order(f).filter(x => x === c || among(x));
	const from = list.indexOf(c);
	const to = Math.max(0, Math.min(list.length - 1, Math.round(toIndex)));
	if (from < 0 || from === to) return false;
	list.splice(from, 1);
	list.splice(to, 0, c);
	const above = list[to - 1];
	const below = list[to + 1];
	// Where it lands among everyone (rows the list doesn't show keep their places): just after the one above, or just before the one below.
	const all = order(f).filter(x => x !== c);
	const at = above ? all.indexOf(above) + 1 : all.indexOf(below);
	all.splice(at, 0, c);
	const init = (above ?? below).init;
	if (init === undefined) delete c.init; else c.init = init;
	let n = 0;
	for (const x of all) if (x.init === init) x.tiebreak = ++n;
	log(f, above ? `${c.label} moves after ${above.label}` : `${c.label} moves to the top`);
	return true;
}

/** Roll initiative (d20 + bonus) for monsters (the GM's dice), or for everyone not yet rolled. */
export function rollInitiative(f: Fight5e, rng: Rng = Math.random, who: 'monsters' | 'missing' = 'monsters', sides: { monsters: boolean; heroes: boolean } = { monsters: true, heroes: true }): void {
	for (const c of f.combatants) {
		if (who === 'monsters' ? c.side === 'monster' : c.init === undefined && (c.side === 'hero' ? sides.heroes : sides.monsters)) { c.init = d20(rng) + c.initBonus; delete c.tiebreak; }
	}
}

/** What Start combat rolls for whoever has no initiative yet (the 5e encounter settings). */
export interface StartRolls { monsters: boolean; heroes: boolean }

export function setInitiative(f: Fight5e, id: string, init: number | undefined): void {
	const c = find(f, id);
	if (!c) return;
	c.init = init;
	delete c.tiebreak;
}

export function find(f: Fight5e, id: string): Combatant5e | undefined {
	return f.combatants.find(c => c.id === id);
}

export function current(f: Fight5e): Combatant5e | undefined {
	return f.turnId ? find(f, f.turnId) : undefined;
}

/** Monsters at 0 HP are out of the fight: their turns are skipped. */
const takesTurns = (c: Combatant5e) => !(c.side === 'monster' && c.hp <= 0) && !c.dead;

/** Start combat: anyone without initiative rolls it, round 1, first in order. */
export function start(f: Fight5e, rng: Rng = Math.random, rolls: StartRolls = { monsters: true, heroes: true }): Combatant5e | undefined {
	return startCombat(f, rng, rolls).who;
}

/** Start combat, and what the first creature's conditions do at the start of its turn. */
export function startCombat(f: Fight5e, rng: Rng = Math.random, rolls: StartRolls = { monsters: true, heroes: true }): TurnStep5e {
	rollInitiative(f, rng, 'missing', rolls);
	f.round = 1;
	delete f.undo;
	const first = order(f).find(takesTurns);
	f.turnId = first?.id;
	log(f, 'Combat starts');
	if (!first) return emptyResult();
	startTurn(f, first);
	return { who: first, ...boundary(f, first.id, 'start') };
}

/** Run a turn boundary through the effects engine: counts down, ends what ran out (logged), and says what to ask. */
export function boundary(f: Fight5e, id: string, when: TurnBoundary): TurnEventResult {
	const bearers: EffectBearer[] = f.combatants.map(c => ({ id: c.id, conditions: c.conditions, out: !takesTurns(c) }));
	const r = turnEvent(bearers, { combatantId: id, when, round: f.round });
	bearers.forEach((b, i) => { f.combatants[i].conditions = b.conditions; });
	const ended = new Map<string, string[]>();
	for (const e of r.expired) ended.set(e.bearerId, [...(ended.get(e.bearerId) ?? []), e.condition.name]);
	for (const [cid, names] of ended) log(f, `${find(f, cid)?.label ?? '?'}: ${names.join(', ')} ended`);
	return r;
}

function startTurn(f: Fight5e, c: Combatant5e): void {
	// Legendary actions come back at the start of the creature's own turn.
	if (c.legendary) c.legendary.used = 0;
}

/** End the current turn and pass to the next combatant (a new round after the last). */
export function next(f: Fight5e): Combatant5e | undefined {
	return nextTurn(f).who;
}

/**
 * End the current turn and pass to the next combatant: the end of this turn
 * and the start of the next run through the effects engine (conditions count
 * down and end; damage, saves and reminders come back to be asked).
 */
export function nextTurn(f: Fight5e): TurnStep5e {
	if (!isRunning(f)) return emptyResult();
	const list = order(f).filter(takesTurns);
	if (!list.length) return emptyResult();
	const cur = current(f);
	const ending = cur ? boundary(f, cur.id, 'end') : emptyResult();
	let i = cur ? list.findIndex(c => c.id === cur.id) : -1;
	// The current one may have dropped out (killed on its own turn): find who came next.
	if (cur && i < 0) {
		const all = order(f);
		const at = all.findIndex(c => c.id === cur.id);
		i = list.findIndex(c => all.indexOf(c) > at) - 1;
		if (i < -1) i = list.length - 1;
	}
	i++;
	if (i >= list.length) { i = 0; f.round++; log(f, `Round ${f.round}`); }
	const nxt = list[i];
	f.turnId = nxt.id;
	startTurn(f, nxt);
	const result = mergeResults(ending, boundary(f, nxt.id, 'start'));
	f.undo = { turnId: nxt.id, round: f.round, result };
	return { who: nxt, ...result };
}

/**
 * Back to the previous combatant (undo a misclick). Right after Next turn, what
 * it did to conditions is put back (counts, and conditions that ran out), but
 * damage, saves and reminders aren't asked again when you step forward.
 */
export function previous(f: Fight5e): Combatant5e | undefined {
	if (!isRunning(f)) return undefined;
	if (f.undo && f.undo.turnId === f.turnId && f.undo.round === f.round) {
		const bearers: EffectBearer[] = f.combatants.map(c => ({ id: c.id, conditions: c.conditions }));
		undoTurnEvent(bearers, f.undo.result);
		bearers.forEach((b, i) => { f.combatants[i].conditions = b.conditions; });
	}
	delete f.undo;
	const list = order(f).filter(takesTurns);
	const cur = current(f);
	let i = cur ? list.findIndex(c => c.id === cur.id) : 0;
	i--;
	if (i < 0) {
		if (f.round <= 1) return cur;
		f.round--;
		i = list.length - 1;
	}
	f.turnId = list[i]?.id;
	return list[i];
}

export function end(f: Fight5e): void {
	log(f, 'Combat ends');
	f.round = 0;
	f.turnId = undefined;
	delete f.undo;
}

export function remove(f: Fight5e, id: string): void {
	if (f.turnId === id && isRunning(f)) next(f);
	f.combatants = f.combatants.filter(c => c.id !== id);
	if (f.turnId === id) f.turnId = undefined;
}

// ----------------------------------------------------------------------------
// Hit points

/** A change to HP, in the HP language every tracker shares (core/tracker/hp.ts). */
export type HpChange = HpCommand;

/** "7" damage, "!7" a crit's, "7v" vulnerable (doubled), "7r" resisted (halved), "+7" heal, "t7" temp HP, "=12" set HP. */
export function parseHp(input: string): HpChange | null {
	return parseHpCommand(input);
}

/** Damage after vulnerability (doubled) or resistance (halved, rounded down). */
export function damageTaken(change: Extract<HpChange, { kind: 'damage' }>): number {
	return change.type === 'vulnerable' ? change.amount * 2 : change.type === 'resisted' ? Math.floor(change.amount / 2) : change.amount;
}

/** Apply a change to HP, following the rules for temporary HP, dropping to 0 and death saves. Returns a log line. */
export function applyHp(f: Fight5e, id: string, change: HpChange): string | undefined {
	const c = find(f, id);
	if (!c) return undefined;
	let text: string;
	switch (change.kind) {
		case 'damage': {
			const taken = damageTaken(change);
			let rest = taken;
			const fromTemp = Math.min(c.tempHp, rest);
			c.tempHp -= fromTemp;
			rest -= fromTemp;
			const wasDown = c.hp <= 0;
			const left = c.hp - rest;
			c.hp = Math.max(0, left);
			text = `${c.label} takes ${taken}${change.type ? ` (${change.type})` : ''}${fromTemp ? ` (${fromTemp} from temp HP)` : ''}`;
			if (c.side === 'hero') {
				if (wasDown && rest > 0) {
					// Damage while at 0 HP is a failed death save; a crit is two.
					c.stable = false;
					c.deathSaves ??= { success: 0, failure: 0 };
					c.deathSaves.failure = Math.min(3, c.deathSaves.failure + (change.crit ? 2 : 1));
					if (-left >= c.maxHp || c.deathSaves.failure >= 3) { c.dead = true; text += ' and dies'; }
					else text += `, ${c.deathSaves.failure} failed death save${c.deathSaves.failure === 1 ? '' : 's'}`;
				} else if (c.hp === 0 && rest > 0) {
					// Massive damage: what's left after reaching 0 is at least their HP maximum.
					if (-left >= c.maxHp) { c.dead = true; text += ' and dies outright'; }
					else { c.deathSaves = { success: 0, failure: 0 }; text += ' and falls unconscious'; }
				}
			} else if (c.hp === 0 && !wasDown) text += ' and drops';
			if (c.concentrating && taken > 0) {
				if (c.hp === 0) { c.concentrating = false; text += ', concentration ends'; }
				else text += `; concentration save DC ${concentrationDc(taken, f.edition)}`;
			}
			break;
		}
		case 'heal': {
			if (c.dead) return undefined;
			const was = c.hp;
			c.hp = Math.min(c.maxHp, c.hp + change.amount);
			if (was <= 0 && c.hp > 0) { c.deathSaves = undefined; c.stable = false; }
			text = `${c.label} heals ${c.hp - was}`;
			break;
		}
		case 'temp':
			// Temporary HP don't stack: keep the larger.
			c.tempHp = Math.max(c.tempHp, change.amount);
			text = `${c.label} has ${c.tempHp} temp HP`;
			break;
		case 'set':
			c.hp = Math.max(0, Math.min(c.maxHp, change.amount));
			if (c.hp > 0) { c.deathSaves = undefined; c.dead = false; c.stable = false; }
			text = `${c.label} HP set to ${c.hp}`;
			break;
	}
	log(f, text);
	return text;
}

export type DeathSave = 'success' | 'failure' | 'nat20' | 'nat1';

/** A death save for a hero at 0 HP: three successes stabilise, three failures kill, a 20 brings them back with 1 HP. */
export function deathSave(f: Fight5e, id: string, result: DeathSave): string | undefined {
	const c = find(f, id);
	if (!c || c.side !== 'hero' || c.hp > 0 || c.dead) return undefined;
	const s = (c.deathSaves ??= { success: 0, failure: 0 });
	let text: string;
	if (result === 'nat20') {
		c.hp = 1;
		c.deathSaves = undefined;
		c.stable = false;
		text = `${c.label} rolls a 20 and is back up with 1 HP`;
	} else if (result === 'success') {
		s.success = Math.min(3, s.success + 1);
		if (s.success >= 3) { c.stable = true; text = `${c.label} is stable`; } else text = `${c.label}: death save success (${s.success})`;
	} else {
		s.failure = Math.min(3, s.failure + (result === 'nat1' ? 2 : 1));
		if (s.failure >= 3) { c.dead = true; text = `${c.label} dies`; } else text = `${c.label}: death save failure (${s.failure})`;
	}
	log(f, text);
	return text;
}

/** Set a hero's death saves by hand (the tracker's pips): three successes stabilise, three failures kill. */
export function setDeathSaves5e(f: Fight5e, id: string, success: number, failure: number): void {
	const c = find(f, id);
	if (!c || c.side !== 'hero' || c.hp > 0) return;
	c.deathSaves = { success: Math.max(0, Math.min(3, success)), failure: Math.max(0, Math.min(3, failure)) };
	c.stable = c.deathSaves.success >= 3;
	c.dead = c.deathSaves.failure >= 3;
}

/** The Constitution save to keep concentrating after taking damage: 10 or half the damage, whichever is higher (2024 caps it at 30). */
export function concentrationDc(taken: number, edition: Dnd5eEdition = '2024'): number {
	const dc = Math.max(10, Math.floor(taken / 2));
	return edition === '2024' ? Math.min(30, dc) : dc;
}

/** Start or stop concentrating. */
export function setConcentration(f: Fight5e, id: string, on: boolean): void {
	const c = find(f, id);
	if (!c || !!c.concentrating === on) return;
	c.concentrating = on || undefined;
	log(f, `${c.label} ${on ? 'is concentrating' : 'stops concentrating'}`);
}

/** Spend a Legendary Resistance (or give one back with -1). */
export function useResistance(f: Fight5e, id: string, delta = 1): void {
	const c = find(f, id);
	if (!c?.resistances) return;
	const was = c.resistances.used;
	c.resistances.used = Math.max(0, Math.min(c.resistances.max, was + delta));
	if (c.resistances.used > was) log(f, `${c.label} uses a Legendary Resistance`);
}

/** How a combatant's HP reads at a glance: Bloodied at half or less (the 2024 term), down at 0. */
export function hpState(c: Combatant5e): 'healthy' | 'bloodied' | 'critical' | 'down' {
	if (c.hp <= 0) return 'down';
	if (c.hp <= c.maxHp / 4) return 'critical';
	if (c.hp <= c.maxHp / 2) return 'bloodied';
	return 'healthy';
}

/** A monster at 0 HP (or anyone dead) is out of the fight. */
export const isDefeated = (c: Combatant5e) => (c.side === 'monster' && c.hp <= 0) || !!c.dead;

/** Spend a legendary action (or give one back with -1). */
export function useLegendary(f: Fight5e, id: string, delta = 1): void {
	const c = find(f, id);
	if (c?.legendary) c.legendary.used = Math.max(0, Math.min(c.legendary.max, c.legendary.used + delta));
}

// ----------------------------------------------------------------------------
// Conditions

/**
 * Put a condition on a combatant, with its timing (a preset's, a custom
 * condition's, or the GM's: core/tracker/effects.ts). `sourceId` is who caused
 * it, for a condition that counts on their turn. Already there: it's updated.
 */
export function addCondition(f: Fight5e, id: string, name: string, o: { rounds?: number; value?: number; timing?: ConditionTiming; sourceId?: string } = {}): void {
	const c = find(f, id);
	if (!c) return;
	const existing = c.conditions.find(x => x.name.toLowerCase() === name.toLowerCase());
	if (existing && !o.timing) { if (o.rounds !== undefined) existing.rounds = o.rounds; if (o.value !== undefined) existing.value = o.value; return; }
	const timing: ConditionTiming = { ...o.timing, ...(o.rounds !== undefined ? { rounds: o.rounds } : {}) };
	const applied = applyTiming(existing?.name ?? name, timing, { ...turnContext(f, id, o.sourceId), value: o.value ?? existing?.value });
	if (existing) {
		if (existing.fired) applied.fired = existing.fired;
		c.conditions[c.conditions.indexOf(existing)] = applied;
		return;
	}
	c.conditions.push(applied);
	log(f, `${c.label} is ${name}${o.value ? ` ${o.value}` : ''}${applied.rounds ? ` (${applied.rounds} round${applied.rounds === 1 ? '' : 's'})` : ''}`);
}

/** Whose turn it is and who caused it, for the effects engine. */
function turnContext(f: Fight5e, id: string, sourceId?: string) {
	const src = sourceId ? find(f, sourceId) : undefined;
	return {
		bearerId: id,
		turn: isRunning(f) && f.turnId ? { combatantId: f.turnId, round: f.round } : undefined,
		source: src ? { id: src.id, label: src.label } : undefined,
	};
}

/** Change how long a condition lasts and what it does (the condition editor, from its chip). */
export function retimeCondition(f: Fight5e, id: string, name: string, timing: ConditionTiming, sourceId?: string): void {
	const x = find(f, id)?.conditions.find(x => x.name.toLowerCase() === name.toLowerCase());
	if (x) retime(x, timing, turnContext(f, id, sourceId));
}

/** A monster's save from the ability's name ("Wisdom", "WIS"): the listed save, else the modifier. Heroes: unknown. */
export function saveBonus5e(f: Fight5e, id: string, ability: string | undefined): number | undefined {
	const m = find(f, id)?.monster;
	const a = ability?.trim().toLowerCase();
	if (!m || !a) return undefined;
	const key = ABILITIES.find(k => k === a.slice(0, 3) || ABILITY_NAME[k].toLowerCase() === a);
	return key ? saveOf(m, key) : undefined;
}

/**
 * Damage from a condition ("1d4 Fire"), through the stat block's immunities,
 * resistances and vulnerabilities to that type. Returns the log line.
 */
export function effectDamage(f: Fight5e, id: string, amount: number, damageType?: string): string | undefined {
	const c = find(f, id);
	if (!c) return undefined;
	const t = damageType?.trim().toLowerCase();
	const has = (list?: string[]) => !!t && !!list?.some(x => x.toLowerCase().split(/[^a-z]+/).includes(t));
	if (has(c.monster?.immunities)) {
		const text = `${c.label} is immune to ${damageType ?? ''} damage`;
		log(f, text);
		return text;
	}
	const mod = has(c.monster?.resistances) ? 'resisted' : has(c.monster?.vulnerabilities) ? 'vulnerable' : undefined;
	return applyHp(f, id, { kind: 'damage', amount, ...(mod ? { type: mod } : {}) });
}

/** Change a condition's duration (null: until removed) or value. */
export function updateCondition(f: Fight5e, id: string, name: string, o: { rounds?: number | null; value?: number }): void {
	const x = find(f, id)?.conditions.find(x => x.name.toLowerCase() === name.toLowerCase());
	if (!x) return;
	if (o.rounds === null) { delete x.rounds; delete x.tickedRound; } else if (o.rounds !== undefined) { x.rounds = o.rounds; delete x.tickedRound; }
	if (o.value !== undefined) x.value = Math.max(1, o.value);
}

export function removeCondition(f: Fight5e, id: string, name: string): void {
	const c = find(f, id);
	if (c) c.conditions = c.conditions.filter(x => x.name.toLowerCase() !== name.toLowerCase());
}

/** Read whatever the store saved (an older version, a hand edit): never throws, drops what it can't use. */
export function normalizeFight(raw: unknown): Fight5e | null {
	if (!raw || typeof raw !== 'object') return null;
	const f = raw as Partial<Fight5e>;
	if (typeof f.id !== 'string') return null;
	return {
		id: f.id,
		name: typeof f.name === 'string' ? f.name : 'Encounter',
		edition: f.edition === '2014' ? '2014' : '2024',
		combatants: Array.isArray(f.combatants) ? f.combatants.filter((c): c is Combatant5e => !!c && typeof c === 'object' && typeof c.id === 'string').map(c => ({ ...c, conditions: Array.isArray(c.conditions) ? c.conditions : [], tempHp: c.tempHp ?? 0, tiebreak: typeof c.tiebreak === 'number' ? c.tiebreak : undefined })) : [],
		round: typeof f.round === 'number' ? f.round : 0,
		turnId: typeof f.turnId === 'string' ? f.turnId : undefined,
		log: Array.isArray(f.log) ? f.log : [],
		sourcePath: typeof f.sourcePath === 'string' ? f.sourcePath : undefined,
		...(f.undo && typeof f.undo === 'object' && f.undo.result && typeof f.undo.round === 'number' ? { undo: f.undo } : {}),
	};
}

/** What a change would do, without doing it: "→ 8/20 · takes 7", for the HP keypad. */
export function previewHp(f: Fight5e, id: string, change: HpChange): string {
	const copy = JSON.parse(JSON.stringify(f)) as Fight5e;
	const said = applyHp(copy, id, change);
	const c = find(copy, id);
	if (!c || !said) return '';
	const what = said.replace(new RegExp(`^${c.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '');
	return `→ ${c.hp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp}` : ''} · ${what}`;
}
