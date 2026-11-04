// Shared data types and defaults. Nothing in here may import 'obsidian', so the
// pure modules that use it stay unit-testable in plain Node.

export type ArmorType = 'none' | 'medium' | 'heavy';
export type MonsterType = 'regular' | 'solo';

export interface NimbleAttack {
	raw: string;
}

export interface NimbleAbility {
	name: string;
	description: string;
	isLegendary?: boolean;
	recharge?: string;
}

export interface NimbleMonster {
	name: string;
	type?: string;
	size?: string;
	alignment?: string;
	cr?: number | string;
	level?: number | string;
	armor: ArmorType;
	hp: number;
	movement: string;
	str?: string;
	dex?: string;
	will?: string;
	attacks?: NimbleAttack[];
	multiattack?: string;
	actionText?: string;
	abilities?: NimbleAbility[];
	resistances?: string[];
	immunities?: string[];
	senses?: string;
	languages?: string;
	monsterType?: MonsterType;
	legendaryResistances?: number;
	description?: string;
	bloodied?: string;
	lastStand?: string;
}

export interface EncounterCreature {
	id: string;
	monster: NimbleMonster;
	label: string;
	currentHp: number;
	maxHp: number;
	sourceFile?: string;
	conditions: string[];
	/** Legendary resistances spent so far (solo monsters). */
	lrUsed?: number;
}

export interface Encounter {
	id: string;
	name: string;
	creatures: EncounterCreature[];
	round?: number;
}

export interface MonsterIndexEntry {
	name: string;
	filePath: string;
	monster: NimbleMonster;
}

export interface NimbleCondition {
	name: string;
	description: string;
	auto?: boolean;
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
	clickableDice: boolean;
	/** Nimble attack rules for dice in attack lines: 1 on the primary die misses, max explodes. */
	nimbleAttackRolls: boolean;
	rollLog: RollLogEntry[];
}

export const DEFAULT_SETTINGS: NimbleStatblocksSettings = {
	statblockStyle: 'book',
	encounters: [],
	activeEncounterId: null,
	multipleEncounters: false,
	customConditions: [],
	mobileTapToPreview: true,
	clickableDice: true,
	nimbleAttackRolls: true,
	rollLog: [],
};

export const NIMBLE_CONDITIONS: NimbleCondition[] = [
	{ name: 'Bloodied', description: 'At half HP or less.', auto: true },
	{ name: 'Blinded', description: "Can't see. Attacks against you have advantage, and your attacks have disadvantage." },
	{ name: 'Charmed', description: 'Sees the charmer as an ally. Charmer has advantage on social interactions with you.' },
	{ name: 'Dazed', description: 'Heroes: lose 1 action; monsters: can perform one less action on their next turn.' },
	{ name: 'Dying', description: 'At 0 HP. Taking damage while dying causes 2 Wounds, a crit causes 3 instead.' },
	{ name: 'Frightened', description: 'Disadvantage on rolls when source of fear is nearby; speed halved when moving closer to it.' },
	{ name: 'Grappled', description: 'Cannot move. Attacks against you have advantage.' },
	{ name: 'Hampered', description: 'Any creature with their actions or movement reduced (e.g., Dazed, Grappled, Prone, Difficult Terrain).' },
	{ name: 'Incapacitated', description: "Can't do anything. Attacks against you have advantage, and melee attacks that hit, crit." },
	{ name: 'Invisible', description: 'Cannot be seen. Your attacks have advantage, and attacks against you have disadvantage.' },
	{ name: 'Petrified', description: 'Incapacitated. You have all the benefits and drawbacks of being a rock! Immune to most damage except from large explosions, picks, or similar tools.' },
	{ name: 'Poisoned', description: 'Disadvantage on rolls.' },
	{ name: 'Prone', description: 'Movement costs twice as much, and disadvantage on attacks. Melee attacks against you have advantage; Ranged have disadvantage. Spend 3 spaces of your Speed to stand up.' },
	{ name: 'Restrained', description: 'Cannot move. Attacks against you have advantage.' },
	{ name: 'Riding', description: 'You move with the creature you are riding. Any attacks that miss you, strike them.' },
	{ name: 'Slowed', description: 'Speed halved during your next turn.' },
	{ name: 'Taunted', description: 'Disadvantage on attacks except against the most recent taunter.' },
	{ name: 'Wounded', description: 'Has any Wounds (typically 6 Wounds and a hero is dead).' },
	{ name: 'Smoldering', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
	{ name: 'Charged', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
	{ name: 'Distracted', description: 'Minor status. Does nothing on its own; ends when combat does. Some abilities have additional effects against such targets.' },
];

let idCounter = 0;
/** Collision-free id, even for many calls in the same millisecond. */
export function uid(): string {
	idCounter = (idCounter + 1) % 1679616;
	return Date.now().toString(36) + idCounter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}
