import { describe, expect, it } from 'vitest';
import {
	anchorOf, applyTiming, chipSummary, cleanTiming, customDef, damageRoll, describeTiming, describeTrigger, EffectBearer, mergeResults, presetTiming,
	retime, saveEnds, savePassed, triggerMark, turnEvent, TurnEventResult, undoTurnEvent, untilSaved,
} from '../src/core/tracker/effects';
import type { AppliedCondition, ConditionTiming, EffectTrigger, TurnBoundary } from '../src/core/types';
import { firstLine } from '../src/core/tracker/condition-editor';
import { trackerConditionsFor } from '../src/systems/dnd5e/conditions';
import { NIMBLE_CONDITIONS } from '../src/systems/nimble/types';

describe('the condition picker\'s one-line rules', () => {
	it('start at what the condition does: past a preamble, a run-in label or a list\'s bullet', () => {
		expect(firstLine("- A blinded creature can't see and automatically fails any ability check that requires sight.\n- Attack rolls against the creature have advantage.")).toBe("A blinded creature can't see and automatically fails any ability check that requires sight");
		expect(firstLine("While you have the Blinded condition, you experience the following effects.\n**Can't See.** You can't see and automatically fail any ability check that requires sight.")).toBe("You can't see and automatically fail any ability check that requires sight");
		for (const c of [...trackerConditionsFor('2014'), ...trackerConditionsFor('2024'), ...NIMBLE_CONDITIONS]) {
			expect(firstLine(c.description), c.name).toMatch(/^[A-Za-z0-9"'(]/);
		}
	});
});

const burn: EffectTrigger = { kind: 'damage', at: 'start', dice: '1d4', damageType: 'Fire' };
const hold: EffectTrigger = { kind: 'save', at: 'end', ability: 'Wisdom', dc: 13, endsOnSave: true };
const note: EffectTrigger = { kind: 'reminder', at: 'start', text: "Can't take reactions" };

const fighter = (id: string, conditions: AppliedCondition[] = [], out = false): EffectBearer => ({ id, conditions, ...(out ? { out } : {}) });

/**
 * A simple initiative loop over `ids`: each turn has a start then an end; the
 * round goes up after the last. Returns every result in order.
 */
function play(fighters: EffectBearer[], ids: string[], rounds: number, from = 1): TurnEventResult[] {
	const out: TurnEventResult[] = [];
	for (let r = from; r < from + rounds; r++) {
		for (const id of ids) {
			out.push(turnEvent(fighters, { combatantId: id, when: 'start', round: r }));
			out.push(turnEvent(fighters, { combatantId: id, when: 'end', round: r }));
		}
	}
	return out;
}

/** In which round and at which boundary of whose turn something happened: "2:a:end". */
function timeline(fighters: EffectBearer[], ids: string[], rounds: number, what: (r: TurnEventResult) => boolean): string[] {
	const out: string[] = [];
	for (let r = 1; r <= rounds; r++) {
		for (const id of ids) {
			for (const when of ['start', 'end'] as TurnBoundary[]) {
				if (what(turnEvent(fighters, { combatantId: id, when, round: r }))) out.push(`${r}:${id}:${when}`);
			}
		}
	}
	return out;
}

describe('durations', () => {
	it('until removed: never counts down or ends', () => {
		const a = fighter('a', [{ name: 'Prone' }]);
		play([a], ['a'], 5);
		expect(a.conditions).toEqual([{ name: 'Prone' }]);
	});

	it('an old saved `rounds` still counts down at the end of its bearer’s turn, once a round', () => {
		const a = fighter('a', [{ name: 'Dazed', rounds: 2 }]);
		const b = fighter('b');
		const ended = timeline([a, b], ['a', 'b'], 3, r => r.expired.length > 0);
		expect(ended).toEqual(['2:a:end']);
		expect(a.conditions).toEqual([]);
	});

	for (const ends of ['start', 'end'] as TurnBoundary[]) {
		for (const whose of ['self', 'source'] as const) {
			for (const rounds of [1, 2, 3]) {
				it(`${rounds} round(s), ending at the ${ends} of ${whose === 'self' ? 'its own' : 'the source’s'} turn, counts down exactly once a round`, () => {
					const cond: AppliedCondition = { name: 'Hexed', rounds, ...(ends === 'start' ? { ends } : {}), ...(whose === 'source' ? { whose, sourceId: 's' } : {}) };
					const a = fighter('a', [cond]);
					const s = fighter('s');
					const fs = [a, s];
					const counts: number[] = [];
					const ended = timeline(fs, ['a', 's'], rounds + 2, r => { if (r.ticked.length) counts.push(r.ticked[0].rounds); return r.expired.length > 0; });
					const anchor = whose === 'self' ? 'a' : 's';
					expect(ended).toEqual([`${rounds}:${anchor}:${ends}`]);
					expect(counts).toEqual(Array.from({ length: rounds }, (_, i) => rounds - i));
					expect(a.conditions).toEqual([]);
				});
			}
		}
	}

	it('the same boundary twice in a round (Back, then Next) counts once', () => {
		const a = fighter('a', [{ name: 'Slowed', rounds: 3 }]);
		turnEvent([a], { combatantId: 'a', when: 'end', round: 1 });
		turnEvent([a], { combatantId: 'a', when: 'end', round: 1 });
		expect(a.conditions[0]).toMatchObject({ rounds: 2, tickedRound: 1 });
	});

	it('a source that leaves the fight hands the count to the bearer’s own turn', () => {
		const a = fighter('a', [{ name: 'Frightened', rounds: 2, whose: 'source', sourceId: 's' }]);
		const s = fighter('s');
		turnEvent([a, s], { combatantId: 'a', when: 'end', round: 1 });
		expect(a.conditions[0].rounds).toBe(2); // the source's turn counts, not a's
		s.out = true;
		expect(anchorOf(a.conditions[0], 'a', [a, s])).toBe('a');
		turnEvent([a, s], { combatantId: 'a', when: 'end', round: 2 });
		expect(a.conditions[0].rounds).toBe(1);
		// Gone from the list entirely, too.
		expect(anchorOf(a.conditions[0], 'a', [a])).toBe('a');
	});

	it('a condition its bearer caused counts on its own turn', () => {
		const c: AppliedCondition = { name: 'Dodging', rounds: 1, ends: 'start', whose: 'source', sourceId: 'a' };
		expect(anchorOf(c, 'a', [fighter('a', [c])])).toBe('a');
	});

	it('until saved: no count, ends only when a save says so', () => {
		const t: ConditionTiming = { triggers: [hold] };
		expect(untilSaved(t)).toBe(true);
		expect(untilSaved({ rounds: 10, triggers: [hold] })).toBe(false);
		expect(untilSaved({ triggers: [{ ...hold, endsOnSave: false }] })).toBe(false);
		const a = fighter('a', [{ name: 'Paralyzed', ...t }]);
		const r = play([a], ['a'], 4);
		expect(r.flatMap(x => x.expired)).toEqual([]);
		expect(r.flatMap(x => x.prompts)).toHaveLength(4);
		expect(saveEnds(hold, true)).toBe(true);
		expect(saveEnds(hold, false)).toBe(false);
		expect(saveEnds({ ...hold, endsOnSave: false }, true)).toBe(false);
		expect(saveEnds(burn, true)).toBe(false);
	});
});

describe('effects at the start and end of the bearer’s turn', () => {
	const kinds: [string, EffectTrigger][] = [['damage', burn], ['save', hold], ['reminder', note]];
	for (const [kind, base] of kinds) {
		for (const at of ['start', 'end'] as TurnBoundary[]) {
			it(`${kind} at the ${at} fires on its bearer’s turn only, once a round`, () => {
				const trigger = { ...base, at };
				const a = fighter('a', [{ name: 'X', triggers: [trigger] }]);
				const b = fighter('b');
				const fired = timeline([a, b], ['a', 'b'], 3, r => r.prompts.length > 0);
				expect(fired).toEqual([`1:a:${at}`, `2:a:${at}`, `3:a:${at}`]);
				// Again in the same round: nothing.
				expect(turnEvent([a, b], { combatantId: 'a', when: at, round: 3 }).prompts).toEqual([]);
				const p = turnEvent([a, b], { combatantId: 'a', when: at, round: 4 }).prompts;
				expect(p).toEqual([{ bearerId: 'a', condition: 'X', trigger }]);
			});
		}
	}

	it('several conditions and triggers come back in order', () => {
		const a = fighter('a', [{ name: 'Burning', triggers: [burn, note] }, { name: 'Poisoned', triggers: [{ kind: 'damage', at: 'start', dice: '2d6', damageType: 'Poison' }] }]);
		const p = turnEvent([a], { combatantId: 'a', when: 'start', round: 1 }).prompts;
		expect(p.map(x => `${x.condition}:${describeTrigger(x.trigger)}`)).toEqual(['Burning:1d4 Fire damage', "Burning:Can't take reactions", 'Poisoned:2d6 Poison damage']);
	});

	it('ending at the start of a turn: gone before that turn’s start effects', () => {
		const a = fighter('a', [{ name: 'Burning', rounds: 2, ends: 'start', triggers: [burn] }]);
		const r = play([a], ['a'], 3);
		expect(r.filter(x => x.prompts.length).length).toBe(1); // round 1's start; round 2's start ends it
		expect(r.flatMap(x => x.expired).length).toBe(1);
	});

	it('ending at the end of a turn: that turn’s effects still happen', () => {
		const a = fighter('a', [{ name: 'Burning', rounds: 2, triggers: [burn, { ...burn, at: 'end' }] }]);
		const r = play([a], ['a'], 3);
		expect(r.flatMap(x => x.prompts).length).toBe(4); // start and end of rounds 1 and 2
	});

	it('a save that would only end a condition that’s ending anyway isn’t asked; damage still is', () => {
		const a = fighter('a', [{ name: 'Hold', rounds: 1, triggers: [hold, { ...burn, at: 'end' }] }]);
		const r = turnEvent([a], { combatantId: 'a', when: 'end', round: 1 });
		expect(r.prompts.map(p => p.trigger.kind)).toEqual(['damage']);
		expect(r.expired).toHaveLength(1);
	});

	it('effects of a source-timed condition still happen on the bearer’s turns', () => {
		const a = fighter('a', [{ name: 'Hexed', rounds: 1, whose: 'source', sourceId: 's', triggers: [note] }]);
		const s = fighter('s');
		const r = play([a, s], ['a', 's'], 2);
		expect(r[0].prompts).toHaveLength(1); // a's start, round 1
		expect(r[3].expired).toHaveLength(1); // s's end, round 1
		expect(r.flatMap(x => x.prompts)).toHaveLength(1);
	});
});

describe('Back', () => {
	it('puts back a count and a condition that ran out, without asking twice', () => {
		const a = fighter('a', [{ name: 'Slowed', rounds: 2 }, { name: 'Dazed', rounds: 1, triggers: [{ ...note, at: 'end' }] }]);
		const step = turnEvent([a], { combatantId: 'a', when: 'end', round: 1 });
		expect(step.prompts).toHaveLength(1);
		expect(a.conditions.map(c => c.name)).toEqual(['Slowed']);
		undoTurnEvent([a], step);
		expect(a.conditions.find(c => c.name === 'Slowed')).toEqual({ name: 'Slowed', rounds: 2 });
		expect(a.conditions.find(c => c.name === 'Dazed')).toMatchObject({ name: 'Dazed', rounds: 1 });
		expect(a.conditions.find(c => c.name === 'Dazed')?.tickedRound).toBeUndefined();
		// Next again: the count goes down again, but the reminder isn't asked twice.
		const again = turnEvent([a], { combatantId: 'a', when: 'end', round: 1 });
		expect(again.prompts).toEqual([]);
		expect(again.expired.map(e => e.condition.name)).toEqual(['Dazed']);
		expect(a.conditions).toEqual([{ name: 'Slowed', rounds: 1, tickedRound: 1 }]);
	});

	it('keeps what the GM changed since: a condition removed or re-added by hand stays as it is', () => {
		const a = fighter('a', [{ name: 'Dazed', rounds: 1 }, { name: 'Slowed', rounds: 2 }]);
		const step = mergeResults(turnEvent([a], { combatantId: 'a', when: 'end', round: 1 }));
		a.conditions = a.conditions.filter(c => c.name !== 'Slowed');
		a.conditions.push({ name: 'Dazed' });
		undoTurnEvent([a], step);
		expect(a.conditions).toEqual([{ name: 'Dazed' }]);
	});
});

describe('applying a condition', () => {
	it('writes only what differs from a plain condition', () => {
		expect(applyTiming('Prone', undefined, { bearerId: 'a' })).toEqual({ name: 'Prone' });
		expect(applyTiming('Dazed', { rounds: 1 }, { bearerId: 'a' })).toEqual({ name: 'Dazed', rounds: 1 });
		expect(applyTiming('Exhaustion', {}, { bearerId: 'a', value: 2 })).toEqual({ name: 'Exhaustion', value: 2 });
		expect(applyTiming('Burning', { triggers: [burn], ends: 'end', whose: 'self' }, { bearerId: 'a' })).toEqual({ name: 'Burning', triggers: [burn] });
	});

	it('applied during the turn it counts on, that turn’s end doesn’t count (“until the end of its next turn”)', () => {
		const c = applyTiming('Frightened', { rounds: 1 }, { bearerId: 'a', turn: { combatantId: 'a', round: 3 } });
		expect(c.tickedRound).toBe(3);
		const a = fighter('a', [c]);
		expect(turnEvent([a], { combatantId: 'a', when: 'end', round: 3 }).expired).toEqual([]);
		expect(turnEvent([a], { combatantId: 'a', when: 'end', round: 4 }).expired).toHaveLength(1);
		// On someone else's turn, its own next end counts.
		expect(applyTiming('Frightened', { rounds: 1 }, { bearerId: 'a', turn: { combatantId: 'b', round: 3 } }).tickedRound).toBeUndefined();
		// Counting at the start: nothing to skip.
		expect(applyTiming('Frightened', { rounds: 1, ends: 'start' }, { bearerId: 'a', turn: { combatantId: 'a', round: 3 } }).tickedRound).toBeUndefined();
	});

	it('remembers the source, and counts on its turn', () => {
		const c = applyTiming('Hexed', { rounds: 2, whose: 'source' }, { bearerId: 'a', source: { id: 's', label: 'Mage' }, turn: { combatantId: 's', round: 1 } });
		expect(c).toEqual({ name: 'Hexed', rounds: 2, whose: 'source', sourceId: 's', sourceLabel: 'Mage', tickedRound: 1 });
		// With no source (or itself), it counts on its own turn.
		expect(applyTiming('Hexed', { rounds: 2, whose: 'source' }, { bearerId: 'a' })).toEqual({ name: 'Hexed', rounds: 2 });
		expect(applyTiming('Hexed', { rounds: 2, whose: 'source' }, { bearerId: 'a', source: { id: 'a', label: 'A' } })).toEqual({ name: 'Hexed', rounds: 2 });
	});

	it('copies triggers, so editing one never changes the preset', () => {
		const preset: ConditionTiming = { triggers: [burn] };
		const c = applyTiming('Burning', preset, { bearerId: 'a' });
		c.triggers![0].dice = '2d4';
		expect(burn.dice).toBe('1d4');
	});

	it('retiming keeps the clock when the count doesn’t change, and restarts it when it does', () => {
		const c: AppliedCondition = { name: 'Slowed', rounds: 2, tickedRound: 4, fired: { start: 4 } };
		retime(c, { rounds: 2, triggers: [note] }, { bearerId: 'a' });
		expect(c).toEqual({ name: 'Slowed', rounds: 2, tickedRound: 4, fired: { start: 4 }, triggers: [note] });
		retime(c, { rounds: 3 }, { bearerId: 'a' });
		expect(c).toEqual({ name: 'Slowed', rounds: 3, fired: { start: 4 } });
		retime(c, {}, { bearerId: 'a' });
		expect(c).toEqual({ name: 'Slowed', fired: { start: 4 } });
	});
});

describe('reading and writing timing', () => {
	it('drops what it can’t use', () => {
		expect(cleanTiming(null)).toEqual({});
		expect(cleanTiming({ rounds: 0, ends: 'middle', whose: 'x' })).toEqual({});
		expect(cleanTiming({ rounds: 2.7, ends: 'start', whose: 'source' })).toEqual({ rounds: 2, ends: 'start', whose: 'source' });
		expect(cleanTiming({ triggers: [null, { kind: 'zap' }, { kind: 'damage' }, { kind: 'reminder', text: ' ' }, { kind: 'damage', dice: '1d4', at: 'end' }, { kind: 'save', ability: 'Wisdom', dc: '13', endsOnSave: 1 }] }))
			.toEqual({ triggers: [{ kind: 'damage', at: 'end', dice: '1d4' }, { kind: 'save', at: 'start', ability: 'Wisdom', endsOnSave: true }] });
	});

	it('makes a custom condition with its timing and a description from it', () => {
		const def = customDef(' Burning ', { triggers: [burn] });
		expect(def).toEqual({ name: 'Burning', description: '1d4 Fire damage at the start of its turns.', timing: { triggers: [burn] } });
		expect(customDef('Marked', {})).toEqual({ name: 'Marked', description: 'A condition of your own.' });
		expect(presetTiming(def)).toEqual({ triggers: [burn] });
		expect(presetTiming({ name: 'x', description: '', timing: { triggers: [{ kind: 'nope' }] } as never })).toBeUndefined();
		expect(presetTiming(undefined)).toBeUndefined();
	});

	it('says what an effect does in the game’s words', () => {
		expect(describeTrigger(burn)).toBe('1d4 Fire damage');
		expect(describeTrigger(hold)).toBe('Wisdom save DC 13 ends it');
		expect(describeTrigger({ kind: 'save', at: 'end', ability: 'STR' }, { save: 'save' })).toBe('STR save');
		expect(describeTrigger(note)).toBe("Can't take reactions");
		expect(describeTiming({ rounds: 1, whose: 'source', ends: 'start' }, {}, 'Mage')).toBe("Lasts 1 round, counting down at the start of Mage's turn.");
		expect(chipSummary({ name: 'B', rounds: 2, triggers: [burn] })).toBe('2 rounds left · 1d4 Fire damage at start');
		expect(triggerMark({ name: 'B', triggers: [hold, burn] })).toBe('save');
		expect(triggerMark({ name: 'B' })).toBeUndefined();
	});

	it('reads damage as dice or a flat number', () => {
		expect(damageRoll(burn)).toEqual({ dice: '1d4' });
		expect(damageRoll({ ...burn, dice: '2d6 + 1' })).toEqual({ dice: '2d6+1' });
		expect(damageRoll({ ...burn, dice: '5' })).toEqual({ flat: 5 });
		expect(damageRoll({ ...burn, dice: 'lots' })).toEqual({});
		expect(savePassed(13, 13)).toBe(true);
		expect(savePassed(12, 13)).toBe(false);
		expect(savePassed(12, undefined)).toBeUndefined();
	});
});
