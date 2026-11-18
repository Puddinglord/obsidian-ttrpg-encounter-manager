// The plugin's settings (data.json). Core owns the fields every game shares:
// the party and campaigns, dice and the roll log, Spotlight, reading options.
// Each game system adds its own fields to this interface (TypeScript module
// augmentation, see nimble/settings.ts) and gives their defaults and
// migration through the contract's `settings`. data.json stays one flat
// object, so nothing users already have moves. Pure: no Obsidian imports.

import { DEFAULT_DICE, DiceSettings, migrateDice } from './dice3d/styles';
import type { ConditionDef, PartyMember, RollLogEntry } from './types';

 
export interface EmberVaultSettings {
	customConditions: ConditionDef[];
	mobileTapToPreview: boolean;
	/** Phones and tablets: keep the screen on while combat is running. */
	keepScreenOn: boolean;
	clickableDice: boolean;
	rollLog: RollLogEntry[];
	/** Roll 3D dice on screen when you click a dice expression. */
	dice3d: boolean;
	/** 3D dice on phones too (off by default until tested on more devices). */
	dice3dOnPhone: boolean;
	/** How the 3D dice look and move: styles, presets, imported sets, size, speed, effects. */
	dice: DiceSettings;
	/** 1.0.3 and before: per-role colours and looks. Read once to fill in `dice`, then removed. */
	dicePrimaryColor?: string;
	diceColor?: string;
	diceExplosionColor?: string;
	diceMaterialPrimary?: string;
	diceMaterialNormal?: string;
	diceMaterialCrit?: string;
	/** Extra dice added to a roll (a class's, a feature's): their colour on the sheet and in 3D, and their 3D finish. */
	classDice: { color: string; finish: string };
	party: PartyMember[];
	/** Used for per-hero HP when no party is set up. */
	defaultPartySize: number;
	/** "/" commands in the editor. */
	slashCommands: boolean;
	/** Cmd/Ctrl+K opens Spotlight instead of inserting an empty Markdown link (selected text still becomes a link). */
	spotlightKey: boolean;
	/** The one-time "Use Cmd/Ctrl+K for Spotlight?" offer has been shown. */
	spotlightOffered: boolean;
	/** Give every table in notes the plugin's look (tables in boxes always have it). */
	styleTables: boolean;
	/** Link plain mentions of NPC names in reading view. */
	autoLinkNpcs: boolean;
	/** Folder new campaigns are created in. */
	campaignsFolder: string;
	/** Campaign pages (characters, chapters, scenes, NPCs…) open in reading view; editing is Obsidian's edit toggle. */
	readingView: boolean;
	/** Campaign notes show their properties as tags in reading view. */
	tagProperties: boolean;
	/** In player campaigns, show full stat blocks instead of lore cards (for GMs who don't mind spoilers). */
	playerStatblocks: boolean;
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
	/** Each other game system's own saved state, by system id (5e: its current fight). Each system reads its own defensively. */
	systemData?: Record<string, Record<string, unknown>>;
	/** Where content packs (JSON) live; empty means Ember Vault/Content. */
	contentFolder?: string;
	settingsVersion: number;
}

/** A game system's part of the settings: its fields' defaults, and how to read an older or damaged save. */
export interface SettingsPart {
	defaults: Record<string, unknown>;
	migrate?(saved: Record<string, unknown>, s: EmberVaultSettings): void;
}

export const CORE_DEFAULTS = {
	customConditions: [] as ConditionDef[],
	mobileTapToPreview: true,
	keepScreenOn: true,
	clickableDice: true,
	rollLog: [] as RollLogEntry[],
	dice3d: true,
	dice3dOnPhone: false,
	dice: DEFAULT_DICE,
	classDice: { color: '#d4a72c', finish: 'metal' },
	party: [] as PartyMember[],
	defaultPartySize: 4,
	slashCommands: true,
	spotlightKey: false,
	spotlightOffered: false,
	campaignsFolder: 'Campaigns',
	playerStatblocks: false,
	readingView: true,
	tagProperties: true,
	autoLinkNpcs: true,
	styleTables: true,
	activeCampaign: null as string | null,
	campaigns: {} as Record<string, { party: PartyMember[]; last?: string }>,
	settingsVersion: 2,
};

/**
 * Settings from whatever data.json holds (nothing yet, an older version, or a
 * file that was damaged or edited by hand). Lists that aren't lists become
 * empty and entries that aren't objects are dropped, so one bad value can't
 * stop the plugin loading. Each system's part fills in and checks its own
 * fields. Throws if the file's top level isn't an object.
 */
export function migrateSettings(saved: unknown, parts: readonly SettingsPart[] = []): EmberVaultSettings {
	if (saved != null && (typeof saved !== 'object' || Array.isArray(saved))) throw new Error('Saved settings are not an object');
	const data = (saved ?? {}) as Record<string, unknown>;
	const s = Object.assign({}, CORE_DEFAULTS, ...parts.map(p => p.defaults), data) as EmberVaultSettings;
	const items = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
	const record = <T extends object>(v: T | undefined): T => (v && typeof v === 'object' && !Array.isArray(v) ? v : {} as T);
	s.customConditions = items(s.customConditions).filter(c => typeof c.name === 'string');
	s.rollLog = items(s.rollLog);
	s.party = items(s.party);
	s.campaigns = record(s.campaigns);
	s.activeCampaign = typeof s.activeCampaign === 'string' ? s.activeCampaign : null;
	if (s.systemData !== undefined) s.systemData = Object.fromEntries(Object.entries(record(s.systemData)).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)));
	const cd = record(data.classDice as Record<string, unknown> | undefined);
	s.classDice = {
		color: typeof cd.color === 'string' && /^#[0-9a-f]{6}$/i.test(cd.color) ? cd.color : CORE_DEFAULTS.classDice.color,
		finish: typeof cd.finish === 'string' && cd.finish ? cd.finish : CORE_DEFAULTS.classDice.finish,
	};
	// 1.0.4 dice styles; older saves only have per-role colours, which carry over.
	s.dice = migrateDice(data.dice, data);
	for (const k of ['dicePrimaryColor', 'diceColor', 'diceExplosionColor', 'diceMaterialPrimary', 'diceMaterialNormal', 'diceMaterialCrit'] as const) delete s[k];
	for (const p of parts) p.migrate?.(data, s);
	s.settingsVersion = CORE_DEFAULTS.settingsVersion;
	return s;
}
