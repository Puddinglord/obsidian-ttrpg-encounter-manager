// 5e as a game system: the 2024 rules (SRD 5.2) and the 2014 rules (SRD 5.1).
// Only what the SRDs publish under CC-BY-4.0 ships with the plugin.

import type { ConditionDef } from '../../core/types';
import { openNoteQuickLook } from '../../core/note-quick-look';
import type { GameSystem } from '../contract';
import { DND5E_ATTRIBUTION } from './attribution';
import { conditionsFor } from './conditions';
import { DEFAULT_EDITION, EDITIONS } from './editions';
import { dnd5e, registerDnd5e } from './runtime';

export const dnd5eSystem: GameSystem = {
	id: 'dnd5e',
	name: '5e',
	aliases: ['5e', '5.5e', 'dnd 5e', 'd&d 5e', 'dnd5e 2024', 'dnd5e 2014', 'fifth edition'],
	editions: EDITIONS,
	attribution: DND5E_ATTRIBUTION,
	conditions: (edition?: string): readonly ConditionDef[] => conditionsFor(edition ?? DEFAULT_EDITION),
	quickLook(plugin, target) {
		openNoteQuickLook(plugin.app, target);
	},
	register(plugin) {
		registerDnd5e(plugin);
	},
	encounterBlock(_plugin, def, el, ctx) {
		dnd5e().encounterBlock(def, el, ctx);
	},
	async openTracker() {
		await dnd5e().openTracker();
	},
};
