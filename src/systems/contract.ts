// The contract between core and a game system. Core knows systems only through
// this interface (and the registry); everything a system does that core asks for
// is a member here. It starts with what core actually calls today and grows as
// each new system needs more: write members from real call sites, not guesses.
//
// Layers (enforced by eslint, see eslint.config.mjs):
//   src/core/**        shared by every system; imports no system
//   src/systems/<id>/  one game system; imports core and the contract, never another system
//   src/app/** + main  wiring: may import core and any system

import type { MarkdownPostProcessorContext, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import type { ConditionDef, PartyMember } from '../core/types';
import type { EncounterDef } from '../core/encounter-def';
import type { SlashCommand } from '../core/slash';
import type { NoteKindExtensions } from '../core/note-kinds';
import type { KindSpec } from '../core/content/spec';
import type { SettingsPart } from '../core/settings';
import type { SettingsSection } from '../core/settings-ui';
import type { CombatTokens } from '../core/tracker/tokens';

/** Who wrote the system's text and where to buy it. Shown wherever its content is. */
export interface Attribution {
	/** The licence line. */
	text: string;
	/** "Support the creators: buy the books at …". */
	supportNotice: string;
	storeUrl: string;
	storeLabel: string;
}

/** What "New character" makes, and where. */
export interface NewCharacterRequest {
	/** Folder for the note; the system picks one when missing. */
	folder?: string;
	/** Your character, or another member of the party. */
	mine: boolean;
	name?: string;
	level?: number;
	onCreated?: (file: TFile) => void;
}

export interface CharacterCapability {
	/** Ask for a new character (the system's own dialog) and make its note. */
	promptNew(plugin: EmberVaultPlugin, request: NewCharacterRequest): void;
	/** Make a character note for a hero entered by hand, keeping what the party row knows. */
	createFromPartyMember(plugin: EmberVaultPlugin, member: PartyMember, folder: string): Promise<TFile>;
	/** A character note as an encounter party member (level, max HP, armor). */
	partyMember(plugin: EmberVaultPlugin, frontmatter: Record<string, unknown>, file: TFile): PartyMember;
}

/** Something to show in a quick look (a modal over whatever you're doing). */
export interface QuickLookNote {
	kind: 'note';
	file: TFile;
	sourcePath?: string;
	subtitle?: string;
}

/** One version of a system's rules (5e: the 2014 and 2024 rules). */
export interface Edition {
	/** As written in a campaign's `edition:` property: "2024". */
	readonly id: string;
	/** In pickers: "2024 rules (SRD 5.2)". */
	readonly label: string;
}

export interface GameSystem {
	/** Stable id. A campaign's `system:` property may name it by this or by an alias. */
	readonly id: string;
	readonly name: string;
	/** Other names a campaign may use in `system:` ("5e", "D&D 5e"). Matched like the id: case and spaces don't matter. */
	readonly aliases?: readonly string[];
	/** The system's rules versions, newest first; the first is the default. None: the system has one version. */
	readonly editions?: readonly Edition[];
	readonly attribution: Attribution;
	/** The rules' conditions for an edition (the default one when missing), before any the GM adds in settings. */
	conditions(edition?: string): readonly ConditionDef[];
	readonly characters?: CharacterCapability;
	/** Open a quick look on a note (an NPC, a hero). */
	quickLook(plugin: EmberVaultPlugin, target: QuickLookNote): void;
	/** Wire the system into the plugin at load: its code blocks, references, indexes, views. Called once. */
	register?(plugin: EmberVaultPlugin): void;
	/** Draw a ```nimble-encounter block in one of this system's campaigns (difficulty by its rules, Run into its tracker). */
	encounterBlock?(plugin: EmberVaultPlugin, def: EncounterDef, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string): void;
	/** Show this system's combat tracker (Open encounter tracker, the ribbon). */
	openTracker?(plugin: EmberVaultPlugin): Promise<void>;
	/** Show this system's compendium (Open compendium, the ribbon). */
	openCompendium?(plugin: EmberVaultPlugin): Promise<void>;
	/** "/" commands in its campaigns, added to core's base ones (a command with a base command's name replaces it). */
	slashCommands?(plugin: EmberVaultPlugin): SlashCommand[];
	/** The system's words for things core shows: the party table's defense column ("DEF", "AC"). */
	readonly vocabulary?: { readonly defense?: string };
	/**
	 * What it adds to the shared note kinds (NPC, location, quest, map): properties new
	 * notes get and their cards show, and optionally its own drawing of a kind's card.
	 */
	readonly noteKinds?: NoteKindExtensions;
	/** How attack rolls go in its campaigns: 'exploding' (a 1 on the primary die misses, its max explodes), else plain. */
	attackRolls?(plugin: EmberVaultPlugin): 'exploding' | undefined;
	/** Its running fight's combatants as tokens for GM maps (core/tracker/tokens.ts); null with no fight. */
	combatTokens?(plugin: EmberVaultPlugin): CombatTokens | null;
	/** Is one of its fights running (the screen stays awake on phones)? Trigger `plugin.events` 'combat-changed' when it changes. */
	inCombat?(plugin: EmberVaultPlugin): boolean;
	/** Your character, its own way (Nimble's Character panel); without it, your character note opens. */
	openMyCharacter?(plugin: EmberVaultPlugin): Promise<void>;
	/** Its fields in the plugin's settings: defaults and migration (declare the fields by augmenting EmberVaultSettings, core/settings.ts). */
	readonly settings?: SettingsPart;
	/** Its sections on the settings page, after the shared ones (core/settings-ui.ts). */
	settingsSections?(plugin: EmberVaultPlugin): SettingsSection[];
	/**
	 * What it takes in content packs (JSON files in the vault): each kind and its
	 * fields. Packs are checked against these; the system reads the packs a
	 * campaign uses from `plugin.content.enabled(id, path)`.
	 */
	readonly content?: { readonly kinds: readonly KindSpec[] };
}
