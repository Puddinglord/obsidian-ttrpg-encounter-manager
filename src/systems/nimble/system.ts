// Nimble as a game system: the contract's members, each a thin call into the
// Nimble modules that already do the work.

import type { GameSystem } from '../contract';
import { nimbleSettingsSections } from './settings-ui';
import { compendiumEntries } from './compendium-browser';
import { openEntry } from './compendium-modal';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';
import { createCharacterNote, NewCharacterModal } from './character-modals';
import { openRecord } from './record-modal';
import { nimbleEncounterBlock } from './encounter-block';
import { nimbleSlashCommands } from './slash';
import { NIMBLE_CONDITIONS } from './types';
import { readCharacter } from './character-def';
import { sheetCompendium } from './compendium-data';
import { registerNimble } from './register';
import { NIMBLE_SETTINGS } from './settings';
import { nimble } from './runtime';
import { nimbleTokens } from './map-tokens';
import { openCharacterView } from './character-register';
import { nimbleSpotlight } from './spotlight';
import { ENCOUNTER_VIEW_TYPE } from './tracker-view';
import { NPC_FIELDS_NIMBLE } from './npc';
import { drawNpcNimble } from './npc-card';
import { drawLocationNimble, LOCATION_FIELDS_NIMBLE } from './location-card';

export const nimbleSystem: GameSystem = {
	id: 'nimble',
	name: 'Nimble',
	attribution: {
		text: NIMBLE_ATTRIBUTION,
		supportNotice: NIMBLE_SUPPORT_NOTICE,
		storeUrl: NIMBLE_STORE_URL,
		storeLabel: 'nimbleRPG.com',
	},
	conditions: () => NIMBLE_CONDITIONS,
	settings: NIMBLE_SETTINGS,
	settingsSections: nimbleSettingsSections,
	ruleTerms: () => nimble().terms(),
	ruleTermPage(plugin, term) {
		const entry = compendiumEntries(plugin).find(e => e.id === term.id);
		return entry ? () => { openEntry(plugin, entry); } : undefined;
	},
	attackRolls: (plugin) => (plugin.settings.nimbleAttackRolls ? 'exploding' : undefined),
	characters: {
		promptNew(plugin, r) {
			new NewCharacterModal(plugin, r.folder, r.onCreated, { mine: r.mine, name: r.name ?? '', level: r.level }).open();
		},
		async createFromPartyMember(plugin, h, folder) {
			const f = await createCharacterNote(plugin, { name: h.name, className: h.className ?? '', level: h.level, mine: false }, folder);
			await plugin.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
				fm.hp_max = h.maxHp;
				fm.hp = h.maxHp;
				if (h.defense !== undefined) fm.armor = h.defense;
				if (h.maxWounds !== undefined) fm.wounds_max = h.maxWounds;
			});
			return f;
		},
		partyMember(_plugin, fm, file) {
			const s = readCharacter(fm, sheetCompendium(), file.basename);
			return { id: `sheet:${file.path}`, name: s.name, level: s.level, maxHp: s.hpMax, defense: s.armor, maxWounds: s.woundsMax, ...(s.className ? { className: s.className } : {}) };
		},
	},
	quickLook(plugin, target) {
		return openRecord(plugin, target);
	},
	register(plugin) {
		registerNimble(plugin);
	},
	async openTracker() {
		await nimble().activateEncounterView();
	},
	async openCompendium() {
		await nimble().openBestiary();
	},
	async openMyCharacter(plugin) {
		await openCharacterView(plugin);
	},
	combatTokens: (plugin) => nimbleTokens(plugin),
	inCombat() {
		const enc = nimble().encounters.active;
		return !!enc?.phase && enc.phase !== 'setup';
	},
	campaignState: {
		take: () => nimble().encounters.take(),
		put: (_plugin, state) => nimble().encounters.put(state),
	},
	trackerView: ENCOUNTER_VIEW_TYPE,
	encounterBlock: nimbleEncounterBlock,
	slashCommands: nimbleSlashCommands,
	spotlight: nimbleSpotlight,
	vocabulary: { defense: 'DEF' },
	noteKinds: {
		// The book's numbers on an NPC: level, the armor letter, HP in a heart, its monster block, Add to fight.
		npc: { fields: NPC_FIELDS_NIMBLE, card: (el, ctx) => drawNpcNimble(nimble().plugin, el, ctx) },
		// The monsters to use at a place, each a reference to its block.
		location: { fields: LOCATION_FIELDS_NIMBLE, card: drawLocationNimble },
	},
};
