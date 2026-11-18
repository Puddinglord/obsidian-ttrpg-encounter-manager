// Timed conditions for every tracker: how long a condition lasts (until
// removed, N rounds, until a save ends it), when it counts down (the start or
// end of a turn, its bearer's or the creature that caused it), and what it does
// at the start or end of its bearer's turn (damage, a save, a reminder).
//
// The trackers keep their own turn order (5e's initiative, Nimble's sides) and
// call turnEvent() at each turn boundary; it counts down, ends what ran out and
// says what to ask the GM, and core's prompt (effect-prompts.ts) asks it. The
// timing lives on core's AppliedCondition as optional fields, so fights saved
// before this load as they were: a `rounds` with nothing else counts down at the
// end of its bearer's turn, as it always did. Pure: no Obsidian imports.

import { parseDice } from '../dice';
import type { AppliedCondition, ConditionDef, ConditionTiming, EffectTrigger, TurnBoundary } from '../types';

/** A combatant as the engine sees it: any tracker's combatant has these. */
export interface EffectBearer {
	id: string;
	conditions: AppliedCondition[];
	/** Takes no turns now (a monster at 0 HP, the dead): conditions it caused count on their bearer's turns instead. */
	out?: boolean;
}

/** A turn starting or ending. */
export interface TurnMoment {
	/** Whose turn it is. */
	combatantId: string;
	when: TurnBoundary;
	round: number;
}

/** Something to ask the GM about: a damage roll, a save, a reminder. */
export interface EffectPrompt {
	bearerId: string;
	/** The condition's name. */
	condition: string;
	trigger: EffectTrigger;
}

/** A count that went down: the values it had before, and the round it ticked in. */
export interface Ticked { bearerId: string; name: string; rounds: number; tickedRound?: number; round: number }
export interface Expired { bearerId: string; condition: AppliedCondition }

/** What a turn boundary did: what counted down, what ran out, and what to ask. */
export interface TurnEventResult {
	/** Conditions that counted down, with the values they had before (for Back). */
	ticked: Ticked[];
	/** Conditions that ran out, as they were before (for Back). */
	expired: Expired[];
	prompts: EffectPrompt[];
}

export const emptyResult = (): TurnEventResult => ({ ticked: [], expired: [], prompts: [] });

/** Fold several boundaries (an end of turn, then the next start) into one result. */
export function mergeResults(...rs: TurnEventResult[]): TurnEventResult {
	return { ticked: rs.flatMap(r => r.ticked), expired: rs.flatMap(r => r.expired), prompts: rs.flatMap(r => r.prompts) };
}

const endsAt = (c: AppliedCondition): TurnBoundary => c.ends ?? 'end';

/** Whose turn a condition counts down on: its source's, while the source is still taking turns; else its bearer's. */
export function anchorOf(c: AppliedCondition, bearerId: string, fighters: readonly EffectBearer[]): string {
	if (c.whose !== 'source' || !c.sourceId || c.sourceId === bearerId) return bearerId;
	const src = fighters.find(f => f.id === c.sourceId);
	return src && !src.out ? src.id : bearerId;
}

/**
 * A turn starts or ends: count down what counts on this turn, end what runs
 * out, and gather the effects of the creature whose turn it is.
 *
 * - A condition counts down once a round (`tickedRound`), at `ends` of `whose`
 *   turn, and ends when it reaches 0.
 * - At a turn's start, what ends there ends first: "until the start of its next
 *   turn" doesn't reach into that turn, so its start effects don't happen. At a
 *   turn's end, the effects happen first: the turn was spent under it.
 * - A save that would only end a condition that's ending anyway isn't asked.
 * - Effects fire once per round and boundary (`fired`), so Back then Next, or a
 *   turn marked done twice, never asks twice.
 *
 * Changes the fighters' conditions in place and returns what happened.
 */
export function turnEvent(fighters: EffectBearer[], ev: TurnMoment): TurnEventResult {
	const out = emptyResult();
	for (const b of fighters) {
		const kept: AppliedCondition[] = [];
		for (const c of b.conditions) {
			const counts = c.rounds !== undefined && endsAt(c) === ev.when && c.tickedRound !== ev.round && anchorOf(c, b.id, fighters) === ev.combatantId;
			const runsOut = counts && (c.rounds ?? 0) - 1 <= 0;
			const own = b.id === ev.combatantId;
			// At the end of a turn, effects first; at the start, an ending condition has no effects.
			if (own && !(runsOut && ev.when === 'start')) fire(c, b.id, ev, runsOut, out.prompts);
			if (counts) {
				out.ticked.push({ bearerId: b.id, name: c.name, rounds: c.rounds ?? 0, tickedRound: c.tickedRound, round: ev.round });
				if (runsOut) {
					out.expired.push({ bearerId: b.id, condition: { ...c, rounds: c.rounds } });
					continue;
				}
				c.rounds = (c.rounds ?? 0) - 1;
				c.tickedRound = ev.round;
			}
			kept.push(c);
		}
		if (kept.length !== b.conditions.length) b.conditions = kept;
	}
	return out;
}

function fire(c: AppliedCondition, bearerId: string, ev: TurnMoment, endingNow: boolean, prompts: EffectPrompt[]): void {
	const due = (c.triggers ?? []).filter(t => t.at === ev.when && !(endingNow && t.kind === 'save' && t.endsOnSave));
	if (!due.length || c.fired?.[ev.when] === ev.round) return;
	c.fired = { ...c.fired, [ev.when]: ev.round };
	for (const t of due) prompts.push({ bearerId, condition: c.name, trigger: t });
}

/**
 * Back: put conditions as they were before a turn change (a count goes back
 * up, one that ran out comes back), keeping what the GM did since (a condition
 * added or removed by hand stays so) and the `fired` marks, so stepping forward
 * again doesn't ask the same things twice.
 */
export function undoTurnEvent(fighters: EffectBearer[], r: TurnEventResult): void {
	const byId = new Map(fighters.map(f => [f.id, f]));
	const find = (id: string, name: string) => byId.get(id)?.conditions.find(c => c.name.toLowerCase() === name.toLowerCase());
	for (const t of r.ticked) {
		const c = find(t.bearerId, t.name);
		// Only the one that ticked: not one the GM has since put on again, or retimed.
		if (!c || c.rounds !== t.rounds - 1 || c.tickedRound !== t.round) continue;
		c.rounds = t.rounds;
		if (t.tickedRound === undefined) delete c.tickedRound;
		else c.tickedRound = t.tickedRound;
	}
	for (const e of r.expired) {
		const b = byId.get(e.bearerId);
		if (!b || find(e.bearerId, e.condition.name)) continue;
		const back: AppliedCondition = { ...e.condition };
		const was = r.ticked.find(t => t.bearerId === e.bearerId && t.name === e.condition.name);
		if (was?.tickedRound === undefined) delete back.tickedRound;
		else back.tickedRound = was.tickedRound;
		b.conditions = [...b.conditions, back];
	}
}

/** A save's answer: a success ends the condition when it says so. Returns whether it ended. */
export function saveEnds(trigger: EffectTrigger, passed: boolean): boolean {
	return trigger.kind === 'save' && passed && !!trigger.endsOnSave;
}

/** A save rolled against its DC; without a DC there's no telling, so undefined. */
export function savePassed(total: number, dc: number | undefined): boolean | undefined {
	return dc === undefined ? undefined : total >= dc;
}

/** The damage a trigger deals, as something to roll ("1d4") or a flat number. */
export function damageRoll(t: EffectTrigger): { dice?: string; flat?: number } {
	const s = (t.dice ?? '').trim();
	if (/^\d+$/.test(s)) return { flat: Number(s) };
	return parseDice(s) ? { dice: s.replace(/\s+/g, '') } : {};
}

// ----------------------------------------------------------------------------
// Applying a condition

export interface ApplyContext {
	/** Who it's going on. */
	bearerId: string;
	/** The combatant whose turn it is now, and the round (undefined outside combat). */
	turn?: { combatantId: string; round: number };
	value?: number;
	source?: { id: string; label: string };
}

/**
 * A condition to put on a combatant, from its timing (the game's preset, a
 * custom condition's, or what the GM chose). Only what differs from the old
 * meaning is written, so a plain condition saves as `{ name }`.
 *
 * Applied during the turn it counts on, it doesn't count that turn's end:
 * "1 round" then means "until the end of its next turn", as the books put it.
 */
export function applyTiming(name: string, timing: ConditionTiming | undefined, ctx: ApplyContext): AppliedCondition {
	const t = cleanTiming(timing);
	const c: AppliedCondition = { name };
	if (ctx.value !== undefined) c.value = ctx.value;
	if (t.rounds !== undefined) c.rounds = t.rounds;
	if (t.ends === 'start') c.ends = 'start';
	const src = t.whose === 'source' && ctx.source && ctx.source.id !== ctx.bearerId ? ctx.source : undefined;
	if (src) { c.whose = 'source'; c.sourceId = src.id; c.sourceLabel = src.label; }
	if (t.triggers?.length) c.triggers = t.triggers.map(x => ({ ...x }));
	const anchor = src?.id ?? ctx.bearerId;
	if (c.rounds !== undefined && endsAt(c) === 'end' && ctx.turn && ctx.turn.combatantId === anchor) c.tickedRound = ctx.turn.round;
	return c;
}

/** The timing part of an applied condition (to edit it, or to save it as a custom condition's default). */
export function timingOf(c: ConditionTiming): ConditionTiming {
	return cleanTiming(c);
}

/**
 * Change an applied condition's timing in place: a new count starts fresh, the
 * marks of what already fired this round stay.
 */
export function retime(c: AppliedCondition, timing: ConditionTiming, ctx: ApplyContext): void {
	const next = applyTiming(c.name, timing, { ...ctx, value: c.value });
	// The same count on the same turn: keep the tick it had, so editing a reminder doesn't restart the clock.
	const same = c.rounds !== undefined && next.rounds === c.rounds && endsAt(c) === endsAt(next) && c.sourceId === next.sourceId;
	const tick = c.tickedRound;
	for (const k of ['rounds', 'ends', 'whose', 'sourceId', 'sourceLabel', 'triggers', 'tickedRound'] as const) delete c[k];
	Object.assign(c, next);
	if (same) {
		if (tick === undefined) delete c.tickedRound;
		else c.tickedRound = tick;
	}
}

/** Read timing from anywhere (a custom condition in data.json, a hand edit): drops what it can't use. */
export function cleanTiming(raw: unknown): ConditionTiming {
	if (!raw || typeof raw !== 'object') return {};
	const r = raw as Record<string, unknown>;
	const t: ConditionTiming = {};
	if (typeof r.rounds === 'number' && Number.isFinite(r.rounds) && r.rounds >= 1) t.rounds = Math.floor(r.rounds);
	if (r.ends === 'start' || r.ends === 'end') t.ends = r.ends;
	if (r.whose === 'source' || r.whose === 'self') t.whose = r.whose;
	if (Array.isArray(r.triggers)) {
		const list = r.triggers.map(cleanTrigger).filter((x): x is EffectTrigger => !!x);
		if (list.length) t.triggers = list;
	}
	return t;
}

function cleanTrigger(raw: unknown): EffectTrigger | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (r.kind !== 'damage' && r.kind !== 'save' && r.kind !== 'reminder') return null;
	const t: EffectTrigger = { kind: r.kind, at: r.at === 'end' ? 'end' : 'start' };
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
	if (r.kind === 'damage') {
		const dice = str(r.dice);
		if (!dice) return null;
		t.dice = dice;
		const type = str(r.damageType);
		if (type) t.damageType = type;
	} else if (r.kind === 'save') {
		const ability = str(r.ability);
		if (ability) t.ability = ability;
		if (typeof r.dc === 'number' && Number.isFinite(r.dc)) t.dc = Math.round(r.dc);
		if (r.endsOnSave) t.endsOnSave = true;
	} else {
		const text = str(r.text);
		if (!text) return null;
		t.text = text;
	}
	return t;
}

/** A custom condition from what was applied: its timing becomes the default next time. */
export function customDef(name: string, timing: ConditionTiming, words: EffectWords = {}): ConditionDef {
	const t = cleanTiming(timing);
	const def: ConditionDef = { name: name.trim(), description: describeTiming(t, words) || 'A condition of your own.' };
	if (Object.keys(t).length) def.timing = t;
	return def;
}

/** A condition's timing, from its def; custom ones are read defensively (they come from data.json). */
export function presetTiming(def: ConditionDef | undefined): ConditionTiming | undefined {
	if (!def?.timing) return undefined;
	const t = cleanTiming(def.timing);
	return Object.keys(t).length ? t : undefined;
}

// ----------------------------------------------------------------------------
// Words

/** The game's words for a few things, so the text reads like its book. */
export interface EffectWords {
	/** "save" (5e, Nimble), "roll". */
	save?: string;
}

/** "1d4 Fire damage", "Wisdom save DC 13", "Can't take reactions". */
export function describeTrigger(t: EffectTrigger, words: EffectWords = {}): string {
	if (t.kind === 'damage') return `${t.dice ?? '?'}${t.damageType ? ` ${t.damageType}` : ''} damage`;
	if (t.kind === 'save') return [t.ability, words.save ?? 'save', t.dc !== undefined ? `DC ${t.dc}` : ''].filter(Boolean).join(' ') + (t.endsOnSave ? ' ends it' : '');
	return t.text ?? '';
}

const turnWord = (at: TurnBoundary) => (at === 'start' ? 'the start' : 'the end');

/** One line per effect, for a description: "1d4 Fire damage at the start of its turns." */
export function describeTiming(t: ConditionTiming, words: EffectWords = {}, sourceLabel?: string): string {
	const parts: string[] = [];
	for (const x of t.triggers ?? []) parts.push(`${describeTrigger(x, words)} at ${turnWord(x.at)} of its turns.`);
	if (t.rounds !== undefined) {
		const whose = t.whose === 'source' ? `${sourceLabel ? `${sourceLabel}'s` : 'the source\'s'} turn` : 'its turn';
		parts.push(`Lasts ${t.rounds} round${t.rounds === 1 ? '' : 's'}, counting down at ${turnWord(t.ends ?? 'end')} of ${whose}.`);
	}
	return parts.join(' ');
}

/** The short form for a chip's tooltip: "2 rounds left · 1d4 Fire damage at start". */
export function chipSummary(c: AppliedCondition, words: EffectWords = {}): string {
	const parts: string[] = [];
	if (c.rounds !== undefined) parts.push(`${c.rounds} round${c.rounds === 1 ? '' : 's'} left${c.whose === 'source' && c.sourceLabel ? ` (${c.sourceLabel}'s turn)` : ''}`);
	for (const t of c.triggers ?? []) parts.push(`${describeTrigger(t, words)} at ${t.at}`);
	return parts.join(' · ');
}

/** Which mark a chip shows for its effects: the first trigger's kind, or none. */
export function triggerMark(c: AppliedCondition): EffectTrigger['kind'] | undefined {
	return c.triggers?.[0]?.kind;
}

/** A condition ends when a save succeeds (and has no rounds): "until saved". */
export const untilSaved = (t: ConditionTiming) => t.rounds === undefined && !!t.triggers?.some(x => x.kind === 'save' && x.endsOnSave);
