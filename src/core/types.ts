// Types every game system shares: conditions, the party, the roll log, ids.
// Nothing here may import 'obsidian' or a system, so core and every system can
// use it, and the pure modules stay testable in plain Node.

/** A start or end of a turn: when a condition ends or counts down, and when its effects happen. */
export type TurnBoundary = 'start' | 'end';

/**
 * Something a condition does at the start or end of its bearer's turn
 * (core/tracker/effects.ts): damage ("1d4" Fire), a save (the game's word for
 * the ability, a DC, and whether a success ends it), or a reminder.
 */
export interface EffectTrigger {
	kind: 'damage' | 'save' | 'reminder';
	/** At the start or the end of the bearer's turn. */
	at: TurnBoundary;
	/** Damage: a dice expression ("1d4", "2d6+1") or a number. */
	dice?: string;
	/** Damage: "Fire". */
	damageType?: string;
	/** Save: the ability as the game names it ("Wisdom", "STR"). */
	ability?: string;
	dc?: number;
	/** Save: a success ends the condition. */
	endsOnSave?: boolean;
	/** Reminder: the text ("Can't take reactions"). */
	text?: string;
}

/**
 * How long a condition lasts and what it does each turn. Every field is
 * optional, and missing means the old meaning: until removed, counting down
 * (when `rounds` is set) at the end of the bearer's own turn.
 */
export interface ConditionTiming {
	/** Rounds left; counts down once a round at `ends` of `whose` turn, and ends at 0. */
	rounds?: number;
	/** Counts down (and ends) at the start or the end of a turn. Missing: the end. */
	ends?: TurnBoundary;
	/** Whose turn it counts on: its bearer's (missing) or the creature that caused it (`sourceId`). */
	whose?: 'self' | 'source';
	triggers?: EffectTrigger[];
}

/** A condition on a combatant. `rounds` counts down at the end of that combatant's turn (or as `ends` and `whose` say). */
export interface AppliedCondition extends ConditionTiming {
	name: string;
	/** For "X" conditions: Empowered 2, Weakened 3. */
	value?: number;
	/** Round in which it last ticked, so a turn and the round change never both tick it. */
	tickedRound?: number;
	/** The combatant that caused it, for `whose: 'source'`. */
	sourceId?: string;
	/** That combatant's name when it was applied, to show. */
	sourceLabel?: string;
	/** The round its start and end effects last fired in, so Back and Next never fire them twice. */
	fired?: { start?: number; end?: number };
}

/** A condition a system defines (or the GM adds in settings). */
export interface ConditionDef {
	name: string;
	description: string;
	/** Set by the tracker itself (Bloodied, Dying); not in the picker. */
	auto?: boolean;
	/** Takes a number: Empowered X, Weakened X. */
	hasValue?: boolean;
	/** Minor status: does nothing on its own. */
	minor?: boolean;
	/** What it does when applied, unless the GM changes it: how long it lasts, damage, saves, reminders. */
	timing?: ConditionTiming;
}

/** Older saves kept conditions as plain names. */
export function normalizeConditions(list: unknown): AppliedCondition[] {
	if (!Array.isArray(list)) return [];
	return list
		.map((c): AppliedCondition | null => {
			if (typeof c === 'string') return { name: c };
			if (c && typeof c === 'object' && typeof (c as AppliedCondition).name === 'string') return c as AppliedCondition;
			return null;
		})
		.filter((c): c is AppliedCondition => !!c);
}

export interface PartyMember {
	id: string;
	name: string;
	level: number;
	maxHp: number;
	defense?: number;
	maxWounds?: number;
	className?: string;
}

/** A party member read from a character sheet: its id is `sheet:<path>`. The rest were entered by hand. */
export function isSheetMember(m: PartyMember): boolean {
	return m.id.startsWith('sheet:');
}

/** Heroes entered by hand that no character sheet has replaced yet (matched by name, ignoring case). */
export function handEnteredLeft(party: PartyMember[], sheetNames: string[]): PartyMember[] {
	const taken = new Set(sheetNames.map(n => n.trim().toLowerCase()));
	return party.filter(m => !isSheetMember(m) && !taken.has(m.name.trim().toLowerCase()));
}

/**
 * The encounter party of a campaign you run: a hero for each character sheet,
 * then the heroes entered by hand that no sheet has replaced yet, so adding the
 * first sheet never loses the rest of a party typed in before.
 */
export function mergeParty(fromSheets: PartyMember[], current: PartyMember[]): PartyMember[] {
	return [...fromSheets, ...handEnteredLeft(current, fromSheets.map(m => m.name))];
}

export interface RollLogEntry {
	id: string;
	time: number;
	label: string;
	expression: string;
	total: number;
	detail: string;
	outcome?: 'miss' | 'crit';
}

let idCounter = 0;
/** Collision-free id, even for many calls in the same millisecond. */
export function uid(): string {
	idCounter = (idCounter + 1) % 1679616;
	return Date.now().toString(36) + idCounter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}
