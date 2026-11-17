// Nimble as a game system: the contract's members, each a thin call into the
// Nimble modules that already do the work.

import type { GameSystem } from '../contract';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';
import { createCharacterNote, NewCharacterModal } from './character-modals';
import { openRecord } from './record-modal';
import { nimbleEncounterBlock } from './encounter-block';
import { NIMBLE_CONDITIONS } from './types';
import { readCharacter } from './character-def';
import { sheetCompendium } from './compendium-data';

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
		openRecord(plugin, target);
	},
	encounterBlock: nimbleEncounterBlock,
};
