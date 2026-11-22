// 5e data types. Pure: no Obsidian imports.

import type { Dnd5eEdition } from './editions';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAME: Record<AbilityKey, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

/** A trait, action, bonus action, reaction or legendary action: a name and its text. */
export interface Feature5e {
	name: string;
	desc: string;
}

export interface Dnd5eMonster {
	name: string;
	size?: string;
	/** "humanoid (goblinoid)". */
	type?: string;
	alignment?: string;
	ac: number;
	/** "natural armor", "leather armor, shield". */
	acNote?: string;
	hp: number;
	/** "2d6", "19d12 + 133". */
	hpFormula?: string;
	/** "30 ft., fly 60 ft.". */
	speed?: string;
	/** STR, DEX, CON, INT, WIS, CHA scores. */
	abilities: [number, number, number, number, number, number];
	/** Saving throw bonuses that differ from the ability modifier (proficient saves). */
	saves?: Partial<Record<AbilityKey, number>>;
	/** Skill name → bonus. */
	skills?: Record<string, number>;
	vulnerabilities?: string[];
	resistances?: string[];
	immunities?: string[];
	conditionImmunities?: string[];
	senses?: string;
	languages?: string;
	/** "1/4", "10". */
	cr: string;
	xp?: number;
	/** 2024: XP when fought in its lair. */
	xpLair?: number;
	pb?: number;
	/** Initiative bonus when it isn't the Dexterity modifier. */
	initiative?: number;
	/** 2024: "Leather Armor, Scimitar". */
	gear?: string;
	traits?: Feature5e[];
	actions?: Feature5e[];
	bonusActions?: Feature5e[];
	reactions?: Feature5e[];
	legendaryActions?: Feature5e[];
	legendaryIntro?: string;
	description?: string;
	/** Which rules it's written for; shapes how it's laid out. */
	edition?: Dnd5eEdition;
	/** "SRD 5.2". */
	source?: string;
	/** Stable id for monsters that ship with the plugin: "2024:goblin-warrior". */
	bundledId?: string;
}

/** A monster as the index knows it: where it's written, and whether it ships with the plugin. */
export interface Dnd5eEntry {
	name: string;
	/** Vault path, or '' for bundled monsters. */
	filePath: string;
	monster: Dnd5eMonster;
	bundled?: boolean;
	/** From this content pack. */
	pack?: string;
}
