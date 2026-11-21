// 5e as a game system: the 2024 rules (SRD 5.2) and the 2014 rules (SRD 5.1).
// Only what the SRDs publish under CC-BY-4.0 ships with the plugin.

import type { ConditionDef } from '../../core/types';
import { openNoteQuickLook } from '../../core/note-quick-look';
import type { GameSystem } from '../contract';
import { DND5E_ATTRIBUTION } from './attribution';
import { trackerConditionsFor } from './conditions';
import { DEFAULT_EDITION, EDITIONS } from './editions';
import { dnd5e, registerDnd5e } from './runtime';
import { isRunning } from './combat';
import { dnd5eTokens } from './map-tokens';
import { readSheet5e } from './character';
import { asEdition } from './editions';
import { createCharacterNote5e } from './new-character';
import { openNewCharacter5e } from './character-wizard';
import { dnd5eSlashCommands } from './slash';
import { dnd5eSpotlight } from './spotlight';
import { BLOCKS_5E, KINDS_5E } from './content';
import { draw5eContent } from './content-blocks';
import { NPC_FIELDS_5E } from './npc';
import { drawNpc5e } from './npc-card';
import { ruleTerms5e, termPage5e } from './rule-terms';
import { settingsSections5e } from './settings';
import { ruleTerms } from '../../core/rule-terms';
import { DND5E_TRACKER_VIEW } from './tracker-view';
import { drawLocation5e, LOCATION_FIELDS_5E } from './location-card';

export const dnd5eSystem: GameSystem = {
	id: 'dnd5e',
	name: '5e',
	aliases: ['5e', '5.5e', 'dnd 5e', 'd&d 5e', 'dnd5e 2024', 'dnd5e 2014', 'fifth edition'],
	editions: EDITIONS,
	attribution: DND5E_ATTRIBUTION,
	vocabulary: { defense: 'AC' },
	content: { kinds: KINDS_5E, blocks: BLOCKS_5E, card: draw5eContent },
	slashCommands: dnd5eSlashCommands,
	spotlight: dnd5eSpotlight,
	settingsSections: settingsSections5e,
	ruleTerms: (_plugin, path) => ruleTerms(ruleTerms5e(dnd5e().edition(path))),
	ruleTermPage(_plugin, term, path) {
		const rt = dnd5e();
		const hit = termPage5e(rt.edition(path), term);
		return hit ? () => { rt.openCard(hit, path ?? ''); } : undefined;
	},
	noteKinds: {
		npc: { fields: NPC_FIELDS_5E, card: (el, ctx) => drawNpc5e(dnd5e(), el, ctx) },
		// A place opens on its boxed read-aloud, as 5e adventures key their areas.
		location: { fields: LOCATION_FIELDS_5E, card: drawLocation5e },
	},
	conditions: (edition?: string): readonly ConditionDef[] => trackerConditionsFor(edition ?? DEFAULT_EDITION),
	quickLook(plugin, target) {
		return openNoteQuickLook(plugin.app, { ...target, system: 'dnd5e' });
	},
	characters: {
		promptNew(_plugin, r) {
			openNewCharacter5e(dnd5e(), r);
		},
		async createFromPartyMember(plugin, h, folder) {
			const rt = dnd5e();
			const edition = rt.edition(folder);
			const fm: Record<string, unknown> = { nimble: 'character', system: '5e', edition, cssclasses: ['nimble-sheet-note'], class: h.className ?? '', level: h.level, hp: h.maxHp, hp_max: h.maxHp };
			if (h.defense !== undefined) fm.ac = h.defense;
			return createCharacterNote5e(rt, fm, h.name, folder);
		},
		partyMember(plugin, fm, file) {
			const edition = fm.edition !== undefined ? asEdition(fm.edition as string) : dnd5e().edition(file.path);
			const s = readSheet5e(fm, edition, file.basename, dnd5e().homebrew.library(file.path));
			return { id: `sheet:${file.path}`, name: s.name, level: s.level, maxHp: s.hpMax, defense: s.ac, ...(s.className ? { className: s.className } : {}) };
		},
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
	async openCompendium() {
		await dnd5e().openCompendium();
	},
	combatTokens: (plugin) => dnd5eTokens(plugin),
	inCombat() {
		return isRunning(dnd5e().fights.fight);
	},
	campaignState: {
		take: () => dnd5e().fights.take(),
		put: (_plugin, state) => dnd5e().fights.put(state),
	},
	trackerView: DND5E_TRACKER_VIEW,
};
