// Nimble's part of the plugin's settings: its fields (added to core's
// EmberVaultSettings, so plugin.settings has them), their defaults, and how
// an older or damaged save is read. data.json keeps them where they always
// were. Pure: no Obsidian imports.

import type { SettingsPart } from '../../core/settings';
import { normalizeConditions } from '../../core/types';
import type { Encounter } from './types';

declare module '../../core/settings' {
	interface EmberVaultSettings {
		statblockStyle: 'book' | 'compact';
		encounters: Encounter[];
		activeEncounterId: string | null;
		multipleEncounters: boolean;
		/** Under a stat block you wrote, a quiet note about lines it couldn't use (with fixes). */
		statblockHints: boolean;
		/** Nimble attack rules for dice in attack lines: 1 on the primary die misses, max explodes. */
		nimbleAttackRolls: boolean;
		/** Include the Nimble bestiary that ships with the plugin. */
		bundledBestiary: boolean;
		/** Subtract Medium/Heavy armor from damage typed into the tracker (crits ignore it). */
		autoArmor: boolean;
		/** Big hits on a minion also drop more minions (damage ÷ die size). */
		minionOverkill: boolean;
		/** Character sheets: ask for advantage, modifiers and dice to spend before every roll. */
		rollDialog: boolean;
		/** Offer the expansion-draft classes (and their spells) on character sheets and in Spotlight. */
		compendiumDrafts: boolean;
		/** Your own art for compendium entries: entry key (see artKey) → image path in the vault. */
		compendiumArt: Record<string, string>;
		/** Where uploaded compendium art is saved. */
		compendiumArtFolder: string;
	}
}

export const NIMBLE_DEFAULTS = {
	statblockStyle: 'book' as 'book' | 'compact',
	encounters: [] as Encounter[],
	activeEncounterId: null as string | null,
	multipleEncounters: false,
	statblockHints: true,
	nimbleAttackRolls: true,
	bundledBestiary: true,
	autoArmor: true,
	minionOverkill: true,
	rollDialog: true,
	compendiumDrafts: true,
	compendiumArt: {} as Record<string, string>,
	compendiumArtFolder: 'Ember Vault/Compendium Art',
};

export const NIMBLE_SETTINGS: SettingsPart = {
	defaults: NIMBLE_DEFAULTS,
	migrate(_saved, s) {
		// Compendium art: only text paths, a fresh object (never the defaults' own).
		const art = s.compendiumArt && typeof s.compendiumArt === 'object' && !Array.isArray(s.compendiumArt) ? s.compendiumArt : {};
		s.compendiumArt = Object.fromEntries(Object.entries(art).filter((kv): kv is [string, string] => typeof kv[1] === 'string' && !!kv[1]));
		if (typeof s.compendiumArtFolder !== 'string' || !s.compendiumArtFolder.trim()) s.compendiumArtFolder = NIMBLE_DEFAULTS.compendiumArtFolder;
		const items = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
		s.encounters = items(s.encounters);
		// Older conditions were renamed in the 3.2 rules.
		const renamed: Record<string, string> = { Blinded: 'Blind' };
		for (const enc of s.encounters) {
			enc.creatures = items(enc.creatures);
			enc.phase = enc.phase || 'setup';
			enc.log = Array.isArray(enc.log) ? enc.log : [];
			for (const c of enc.creatures) {
				c.conditions = normalizeConditions(c.conditions).map(x => ({ ...x, name: renamed[x.name] ?? x.name }));
				c.side = c.side || 'monster';
				delete (c as { lrUsed?: number }).lrUsed;
			}
		}
	},
};
