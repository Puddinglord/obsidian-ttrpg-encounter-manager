// The contract between core and a game system. Core knows systems only through
// this interface (and the registry); everything a system does that core asks for
// is a member here. It starts with what core actually calls today and grows as
// each new system needs more: write members from real call sites, not guesses.
//
// Layers (enforced by eslint, see eslint.config.mjs):
//   src/core/**        shared by every system; imports no system
//   src/systems/<id>/  one game system; imports core and the contract, never another system
//   src/app/** + main  wiring: may import core and any system

import type { MarkdownPostProcessorContext, Modal, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import type { ConditionDef, PartyMember } from '../core/types';
import type { EncounterDef } from '../core/encounter-def';
import type { SlashCommand } from '../core/slash';
import type { NoteKindExtensions } from '../core/note-kinds';
import type { KindSpec } from '../core/content/spec';
import type { BlockSpec } from '../core/content/blocks';
import type { ContentImport } from '../core/content/import-modal';
import type { SettingsPart } from '../core/settings';
import type { SettingsSection } from '../core/settings-ui';
import type { CombatTokens } from '../core/tracker/tokens';
import type { OmnisearchSource } from '../core/omnisearch-source';
import type { RuleTerm, RuleTerms } from '../core/rule-terms';

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

/** A game's per-campaign state (GameSystem.campaignState). */
export interface CampaignState {
	take(plugin: EmberVaultPlugin): unknown;
	put(plugin: EmberVaultPlugin, state: unknown): void;
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
	/** Open a quick look on a note (an NPC, a hero). Returns the dialog (Omnisearch comes back when it's closed with Escape). */
	quickLook(plugin: EmberVaultPlugin, target: QuickLookNote): Modal | void;
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
	/**
	 * Its part of Omnisearch (Cmd/Ctrl+K) in its campaigns: its monsters and compendium as
	 * rows (how each looks, Enter, Cmd/Ctrl+Enter), adding several ("3 goblin"), typed
	 * filters with chips, and the "Search the compendium" row. Asked each time Omnisearch opens.
	 */
	omnisearch?(plugin: EmberVaultPlugin): OmnisearchSource;
	/** The system's words for things core shows: the party table's defense column ("DEF", "AC"). */
	readonly vocabulary?: { readonly defense?: string };
	/**
	 * What it adds to the shared note kinds (NPC, location, quest, map): properties new
	 * notes get and their cards show, and optionally its own drawing of a kind's card.
	 */
	readonly noteKinds?: NoteKindExtensions;
	/**
	 * The stat block a new Monster note starts with (New → Monster in the Campaign panel), fenced, in the
	 * note's edition, so the system's own bestiary picks the note up. Without it, the note starts with no block.
	 */
	monsterStarter?(name: string, edition?: string): string;
	/** How attack rolls go in its campaigns: 'exploding' (a 1 on the primary die misses, its max explodes), else plain. */
	attackRolls?(plugin: EmberVaultPlugin): 'exploding' | undefined;
	/** Its running fight's combatants as tokens for GM maps (core/tracker/tokens.ts); null with no fight. */
	combatTokens?(plugin: EmberVaultPlugin): CombatTokens | null;
	/** Is one of its fights running (the screen stays awake on phones)? Trigger `plugin.events` 'combat-changed' when it changes. */
	inCombat?(plugin: EmberVaultPlugin): boolean;
	/**
	 * What it keeps per campaign (its fight). When the active campaign changes, core takes the old campaign's
	 * state, saves it with that campaign, and puts the next campaign's back (undefined: it has none yet, start
	 * fresh). Return plain JSON; redraw your views in `put`.
	 */
	readonly campaignState?: CampaignState;
	/** Its tracker's view type: an open tracker switches to the active campaign's game. */
	readonly trackerView?: string;
	/** Your character, its own way (Nimble's Character panel); without it, your character note opens. */
	openMyCharacter?(plugin: EmberVaultPlugin): Promise<void>;
	/** Its fields in the plugin's settings: defaults and migration (declare the fields by augmenting EmberVaultSettings, core/settings.ts). */
	readonly settings?: SettingsPart;
	/**
	 * Its rules words for a note (abilities, senses, languages, conditions, actions…), in the
	 * note's edition. Stat blocks, sheets and cards mark them, and a click shows the rule
	 * (core/rule-terms.ts, core/rule-term-ui.ts).
	 */
	ruleTerms?(plugin: EmberVaultPlugin, path?: string): RuleTerms;
	/** Opens a term's full page in its compendium; undefined when it has none (the card then has no button). */
	ruleTermPage?(plugin: EmberVaultPlugin, term: RuleTerm, path?: string): (() => void) | undefined;
	/** Its sections on the settings page, after the shared ones (core/settings-ui.ts). */
	settingsSections?(plugin: EmberVaultPlugin): SettingsSection[];
	/**
	 * What it takes in content packs (JSON files in the vault): each kind and its
	 * fields. Packs are checked against these; the system reads the packs a
	 * campaign uses from `plugin.content.enabled(id, path)`.
	 */
	readonly content?: GameContent;
}

/** A game's content: the kinds packs and blocks hold, how it writes them as blocks, and how a block's entry looks. */
export interface GameContent {
	readonly kinds: readonly KindSpec[];
	/**
	 * The kinds written in notes as ```<prefix>-<kind> blocks (core/content/blocks.ts). Core indexes them in the
	 * content folder (they come back from `plugin.content.enabled` as the Homebrew pack, last), draws them with
	 * `card`, and New on a compendium tab writes a starter one (core/content/new-entry.ts).
	 */
	readonly blocks?: BlockSpec;
	/**
	 * Draw a block's entry as its compendium card, in the game's look. `value` holds only the fields that checked
	 * out (the block may have errors), so read it defensively: a missing field is never a crash.
	 */
	card?(el: HTMLElement, entry: { kind: string; value: Record<string, unknown> }, ctx: { plugin: EmberVaultPlugin; sourcePath: string }): void;
	/**
	 * Content in another app's file that this game reads (5e: a D&D Beyond character's JSON, whose class, subclass,
	 * species, background, feats, spells and items join the compendium), for Import content…: null when the text
	 * isn't one. It draws what the file brings, with a choice of what to add, and adds it as content blocks.
	 */
	importFrom?(plugin: EmberVaultPlugin, text: string): ContentImport | null;
	/**
	 * The seed the game's builder opens on to edit a block (`value`: the fields that checked out). A kind with a guided
	 * builder (core/builder, registered under the kind's id) and a seed gets the Edit pencil on its block, and Save
	 * writes the builder's body over the block. Undefined: no pencil.
	 */
	editSeed?(entry: { kind: string; value: Record<string, unknown> }): unknown;
}
