// Shared data types and defaults. Nothing in here may import 'obsidian', so the
// pure modules that use it stay unit-testable in plain Node.
import { CORE_DEFAULTS, EmberVaultSettings, migrateSettings as migrateCore } from '../../core/settings';
import { NIMBLE_DEFAULTS, NIMBLE_SETTINGS } from './settings';
import { AppliedCondition, ConditionDef } from '../../core/types';

// The shared types live in core; re-exported so Nimble modules keep one import.
export { handEnteredLeft, isSheetMember, mergeParty, normalizeConditions, uid } from '../../core/types';
export type { AppliedCondition, ConditionDef, PartyMember, RollLogEntry } from '../../core/types';
/** Nimble's name for a condition definition. */
export type NimbleCondition = ConditionDef;

export type ArmorType = 'none' | 'medium' | 'heavy';
/** How a monster plays at the table. Solo is the Monsters & More name for a legendary monster. */
export type MonsterRole = 'regular' | 'minion' | 'legendary';

export interface NimbleAttack {
	raw: string;
}

export interface NimbleAbility {
	name: string;
	description: string;
	isLegendary?: boolean;
}

export interface NimbleMonster {
	name: string;
	/** As printed: "1/2", "3", "3x". */
	level?: number | string;
	size?: string;
	/** Creature type or descriptor ("Goblin", "Angry Bugbear"). */
	type?: string;
	role?: MonsterRole;
	/** Header word for legendary monsters: "Legendary" (GM Guide) or "Solo" (Monsters & More). */
	roleLabel?: string;
	armor: ArmorType;
	/** Flat HP. For legendary monsters with per-hero HP this is the value for the default party size. */
	hp: number;
	/** Levels this copy was shifted from its stat block (tougher +, weaker −). */
	levelShift?: number;
	/** "[hp]28/hero": HP scales with the number of heroes. */
	hpPerHero?: number;
	movement: string;
	/** Nimble saves as written, e.g. "STR+ DEX-". */
	saves?: string;
	/** Damage die for minions (d6 → 6); used for group attacks and overkill. */
	minionDie?: number;
	attacks?: NimbleAttack[];
	/** Sentence printed before the actions ("After each hero's turn, choose one:"). */
	actionText?: string;
	abilities?: NimbleAbility[];
	resistances?: string[];
	immunities?: string[];
	vulnerabilities?: string[];
	senses?: string;
	languages?: string;
	bloodied?: string;
	lastStand?: string;
	description?: string;
	tactics?: { easier?: string; harder?: string };
	/** "Monsters & More p.6". */
	source?: string;
	/** Family heading in the book ("Goblins", "Forest Wolves"). */
	group?: string;
	habitat?: string;
	/** Stable id for monsters that ship with the plugin. */
	bundledId?: string;

	// Legacy fields from older notes, still read for back-compat (not @deprecated
	// on purpose: the parser and renderer have to keep using them).
	/** Legacy: new notes use `role`. */
	monsterType?: 'regular' | 'solo';
	/** Legacy: new notes use `saves`. */
	str?: string;
	/** Legacy: new notes use `saves`. */
	dex?: string;
	/** Legacy: new notes use `saves`. */
	will?: string;
	/** D&D challenge rating from older notes; shown only if a note still has it. */
	cr?: number | string;
	multiattack?: string;
}

export type Side = 'hero' | 'monster';

export interface EncounterCreature {
	id: string;
	side?: Side;
	monster: NimbleMonster;
	label: string;
	currentHp: number;
	maxHp: number;
	tempHp?: number;
	sourceFile?: string;
	conditions: AppliedCondition[];
	/** Has taken its turn this round. */
	done?: boolean;
	/** Minion groups: how many there were and how many are still up. */
	count?: number;
	alive?: number;
	/** Legendary: Last Stand has been triggered. */
	lastStand?: boolean;
	/** Heroes only. */
	heroId?: string;
	wounds?: number;
	maxWounds?: number;
	actions?: number;
	defense?: number;
	note?: string;
	/** Heroes: the Initiative roll typed before the fight (it sets their first turn's actions). */
	init?: number;
	/** Legendary: the action it used after the last hero, so the next beat suggests the other one. */
	lastAction?: string;
}

export type EncounterPhase = 'setup' | 'heroes' | 'monsters';

export interface EncounterLogEntry {
	round: number;
	text: string;
	time: number;
}

export interface Encounter {
	id: string;
	name: string;
	creatures: EncounterCreature[];
	round?: number;
	phase?: EncounterPhase;
	/** Note this encounter was loaded from, if any. */
	sourcePath?: string;
	log?: EncounterLogEntry[];
	/** Set when combat was ended, so it can be resumed where it stopped. */
	paused?: { round: number; phase: 'heroes' | 'monsters' };
	/** Whoever is on the tracker's card now (a creature id). None: nobody picked yet. */
	acting?: string;
	/** The legendary beat: a legendary monster acting after a hero's turn (`after`: that hero). */
	beat?: { after: string };
}

export interface MonsterIndexEntry {
	name: string;
	/** Vault path, or '' for monsters bundled with the plugin. */
	filePath: string;
	monster: NimbleMonster;
	bundled?: boolean;
}

/** The plugin's settings, with Nimble's fields (core/settings.ts and ./settings.ts). */
export type NimbleStatblocksSettings = EmberVaultSettings;

/** Core's defaults and Nimble's, together (tests and older callers). */
export const DEFAULT_SETTINGS = { ...CORE_DEFAULTS, ...NIMBLE_DEFAULTS } as EmberVaultSettings;

/** Nimble 3.3 core rules conditions, plus the tracker's automatic ones. */
export const NIMBLE_CONDITIONS: NimbleCondition[] = [
	{ name: 'Bloodied', description: 'At half HP or less.', auto: true },
	{ name: 'Dying', description: 'At 0 HP. Max 1 action. Taking damage while Dying causes 2 Wounds; a crit causes 3 instead.', auto: true },
	{ name: 'Blind', description: "Can't see. Attacks against you have advantage, and your attacks have disadvantage." },
	{ name: 'Dazed', description: 'Heroes lose 1 action; monsters lose their move OR 1 attack on their next turn.' },
	{ name: 'Empowered', description: 'Attack damage increased by X.', hasValue: true },
	{ name: 'Frightened', description: 'Disadvantage on rolls when the source of fear is near; Speed halved when moving closer to it.' },
	{ name: 'Grappled', description: 'Attacks against either creature in a grapple have advantage. A smaller grappled creature can\'t move; the same size moves at half Speed together. Escaping takes an action and a STR or DEX save.' },
	{ name: 'Incapacitated', description: "Can't do anything. Attacks against you have advantage, and melee attacks that hit, crit." },
	{ name: 'Invisible', description: 'Can\'t be seen. Your attacks have advantage, and attacks against you have disadvantage.' },
	{ name: 'Poisoned', description: 'Disadvantage on all rolls (typically, healing ends).' },
	{ name: 'Prone', description: 'Movement costs twice as much, and disadvantage on attacks. Melee attacks against you have advantage; Ranged have disadvantage. Spend 3 spaces of your Speed to stand up.' },
	{ name: 'Restrained', description: "Can't move. Attacks against you have advantage." },
	{ name: 'Riding', description: 'You move with the creature you ride, it attacks you with disadvantage, and attacks that miss you strike it.' },
	{ name: 'Silenced', description: "Can't cast spells or use other abilities that require speaking (e.g., Commander's Orders)." },
	{ name: 'Slowed', description: 'Speed halved during your next turn.' },
	{ name: 'Taunted', description: 'Disadvantage on attacks except against the most recent taunter.' },
	{ name: 'Weakened', description: 'Attack damage reduced by X.', hasValue: true },
	{ name: 'Concentrating', description: 'Concentrating on a spell or activity. Being crit while concentrating forces a save to keep it.' },
	{ name: 'Hidden', description: 'The first attack you make while hidden has advantage. Most creatures will not prioritize finding hidden creatures.' },
	{ name: 'Smoldering', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
	{ name: 'Distracted', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
	{ name: 'Charged', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
	{ name: 'Guilty', description: 'A creature who crits is Guilty until Condemned (the Condemn spell deals its damage to a Guilty target).', minor: true },
];

/** Settings from whatever data.json holds, with Nimble's part (core/settings.ts migrateSettings). */
export function migrateSettings(saved: unknown): EmberVaultSettings {
	return migrateCore(saved, [NIMBLE_SETTINGS]);
}
