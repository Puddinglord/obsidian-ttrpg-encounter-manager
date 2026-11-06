// Shared data types and defaults. Nothing in here may import 'obsidian', so the
// pure modules that use it stay unit-testable in plain Node.

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

/** A condition on a combatant. `rounds` counts down at the end of that combatant's turn. */
export interface AppliedCondition {
	name: string;
	rounds?: number;
	/** For "X" conditions: Empowered 2, Weakened 3. */
	value?: number;
	/** Round in which it last ticked, so a turn and the round change never both tick it. */
	tickedRound?: number;
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

export interface MonsterIndexEntry {
	name: string;
	/** Vault path, or '' for monsters bundled with the plugin. */
	filePath: string;
	monster: NimbleMonster;
	bundled?: boolean;
}

export interface NimbleCondition {
	name: string;
	description: string;
	/** Set by the tracker itself (Bloodied, Dying); not in the picker. */
	auto?: boolean;
	/** Takes a number: Empowered X, Weakened X. */
	hasValue?: boolean;
	/** Minor status: does nothing on its own. */
	minor?: boolean;
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

export interface NimbleStatblocksSettings {
	statblockStyle: 'book' | 'compact';
	encounters: Encounter[];
	activeEncounterId: string | null;
	multipleEncounters: boolean;
	customConditions: NimbleCondition[];
	mobileTapToPreview: boolean;
	/** Phones and tablets: keep the screen on while combat is running. */
	keepScreenOn: boolean;
	clickableDice: boolean;
	/** Nimble attack rules for dice in attack lines: 1 on the primary die misses, max explodes. */
	nimbleAttackRolls: boolean;
	rollLog: RollLogEntry[];
	/** Roll 3D dice on screen when you click a dice expression. */
	dice3d: boolean;
	/** 3D dice on phones too (off by default until tested on more devices). */
	dice3dOnPhone: boolean;
	/** Colours of the 3D dice: the primary die of an attack, the others, and crit (exploding) dice. */
	dicePrimaryColor: string;
	diceColor: string;
	diceExplosionColor: string;
	/** Finish (material/shader) per role, e.g. classic, gem, lava. */
	diceMaterialPrimary: string;
	diceMaterialNormal: string;
	diceMaterialCrit: string;
	/** Include the Nimble bestiary that ships with the plugin. */
	bundledBestiary: boolean;
	/** Subtract Medium/Heavy armor from damage typed into the tracker (crits ignore it). */
	autoArmor: boolean;
	/** Big hits on a minion also drop more minions (damage ÷ die size). */
	minionOverkill: boolean;
	party: PartyMember[];
	/** Used for per-hero HP when no party is set up. */
	defaultPartySize: number;
	/** Nimble "/" commands in the editor. */
	slashCommands: boolean;
	/** Give every table in notes the Nimble look (tables in boxes always have it). */
	styleTables: boolean;
	/** Link plain mentions of NPC names in reading view. */
	autoLinkNpcs: boolean;
	/** Folder new campaigns are created in. */
	campaignsFolder: string;
	/** Folder of the active campaign (see campaigns.ts). `party` above is always its party. */
	activeCampaign: string | null;
	/** Per-campaign data, keyed by campaign folder: its party and the last scene opened. */
	campaigns: Record<string, { party: PartyMember[]; last?: string }>;
	/** Set once the Campaign panel has been opened for the user the first time. */
	campaignPanelShown?: boolean;
	/** The party used when no campaign is active. */
	looseParty?: PartyMember[];
	/** Token positions on GM maps: map key → combatant id → percent position. */
	mapTokens?: Record<string, Record<string, { x: number; y: number }>>;
	settingsVersion: number;
}

export const DEFAULT_SETTINGS: NimbleStatblocksSettings = {
	statblockStyle: 'book',
	encounters: [],
	activeEncounterId: null,
	multipleEncounters: false,
	customConditions: [],
	mobileTapToPreview: true,
	keepScreenOn: true,
	clickableDice: true,
	nimbleAttackRolls: true,
	rollLog: [],
	dice3d: true,
	dice3dOnPhone: false,
	dicePrimaryColor: '#7c3aed',
	diceColor: '#ece6d8',
	diceExplosionColor: '#e0a030',
	diceMaterialPrimary: 'classic',
	diceMaterialNormal: 'classic',
	diceMaterialCrit: 'lava',
	bundledBestiary: true,
	autoArmor: true,
	minionOverkill: true,
	party: [],
	defaultPartySize: 4,
	slashCommands: true,
	campaignsFolder: 'Campaigns',
	autoLinkNpcs: true,
	styleTables: true,
	activeCampaign: null,
	campaigns: {},
	settingsVersion: 2,
};

/** Nimble 3.2 core rules conditions, plus the tracker's automatic ones. */
export const NIMBLE_CONDITIONS: NimbleCondition[] = [
	{ name: 'Bloodied', description: 'At half HP or less.', auto: true },
	{ name: 'Dying', description: 'At 0 HP. Max 1 action. Taking damage while Dying causes 2 Wounds; a crit causes 3 instead.', auto: true },
	{ name: 'Blind', description: "Can't see. Attacks against you have advantage, and your attacks have disadvantage." },
	{ name: 'Dazed', description: 'Heroes lose 1 action; monsters lose their move OR 1 attack on their next turn.' },
	{ name: 'Empowered', description: 'Attack damage increased by X.', hasValue: true },
	{ name: 'Frightened', description: 'Disadvantage on rolls when the source of fear is near; Speed halved when moving closer to it.' },
	{ name: 'Grappled', description: 'Attacks against either creature in a grapple have advantage. A smaller grappled creature can\'t move; the same size moves at half Speed together. Escaping takes an action and a STR or DEX save.' },
	{ name: 'Incapacitated', description: "Can't do anything. Attacks against you have advantage, and melee attacks that hit, crit." },
	{ name: 'Invisible', description: 'Cannot be seen. Your attacks have advantage, and attacks against you have disadvantage.' },
	{ name: 'Poisoned', description: 'Disadvantage (typically, healing ends).' },
	{ name: 'Prone', description: 'Movement costs twice as much, and disadvantage on attacks. Melee attacks against you have advantage; Ranged have disadvantage. Spend 3 spaces of your Speed to stand up.' },
	{ name: 'Restrained', description: "Can't move. Attacks against you have advantage." },
	{ name: 'Riding', description: 'You move with the creature you ride, it attacks you with disadvantage, and attacks that miss you strike it.' },
	{ name: 'Silenced', description: "Cannot cast spells or use other abilities that require speaking (e.g., Commander's Orders)." },
	{ name: 'Slowed', description: 'Speed halved during your next turn.' },
	{ name: 'Taunted', description: 'Disadvantage on attacks except against the most recent taunter.' },
	{ name: 'Weakened', description: 'Attack damage reduced by X.', hasValue: true },
	{ name: 'Concentrating', description: 'Concentrating on a spell or activity. Being crit while concentrating forces a save to keep it.' },
	{ name: 'Hidden', description: 'The first attack you make while hidden has advantage. Most creatures will not prioritize finding hidden creatures.' },
	{ name: 'Smoldering', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
	{ name: 'Distracted', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
	{ name: 'Charged', description: 'Minor status. Does nothing on its own; some spells and abilities have additional effects against such targets.', minor: true },
];

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

let idCounter = 0;
/** Collision-free id, even for many calls in the same millisecond. */
export function uid(): string {
	idCounter = (idCounter + 1) % 1679616;
	return Date.now().toString(36) + idCounter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}
