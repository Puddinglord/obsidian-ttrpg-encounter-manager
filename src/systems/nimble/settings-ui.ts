// Nimble's sections on the settings page (the contract's `settingsSections`).

import type EmberVaultPlugin from '../../../main';
import { SettingsSection, settingToggle } from '../../core/settings-ui';
import { setCompendiumDrafts } from './compendium-data';
import { nimble } from './runtime';

export function nimbleSettingsSections(plugin: EmberVaultPlugin): SettingsSection[] {
	const s = plugin.settings;
	const toggle = (get: () => boolean, set: (v: boolean) => void, after?: () => void) => settingToggle(plugin, get, set, after);
	return [
		{ heading: 'Nimble bestiary', rows: [
			{
				name: 'Include the Nimble bestiary',
				desc: 'Over 500 monsters from the GM Guide and Monsters & More, searchable in the bestiary and usable anywhere with nimble: references. A note in your vault with the same name replaces the bundled version.',
				render: toggle(() => s.bundledBestiary, v => { s.bundledBestiary = v; }, () => nimble().loadBundledBestiary()),
			},
			{
				name: 'Help with stat blocks you write',
				desc: 'Under a stat block in your notes, a quiet line when something in it couldn\'t be shown as written, with what to change (and a Fix button when the fix is obvious).',
				render: toggle(() => s.statblockHints, v => { s.statblockHints = v; }),
			},
		] },
		{ heading: 'Nimble stat blocks', rows: [
			{
				name: 'Stat block style',
				render: (setting) => {
					setting.addDropdown(d => d
						.addOption('book', 'Book')
						.addOption('compact', 'Compact')
						.setValue(s.statblockStyle)
						.onChange(async (v) => {
							s.statblockStyle = v as 'book' | 'compact';
							await plugin.saveSettings();
							plugin.rerenderNotes();
						}));
				},
			},
			{
				name: 'Nimble attack rolls',
				desc: 'Attack dice miss on 1 and explode on max.',
				render: toggle(() => s.nimbleAttackRolls, v => { s.nimbleAttackRolls = v; }, () => plugin.rerenderNotes()),
			},
		] },
		{ heading: 'Nimble encounters', topic: 'encounter', rows: [
			{
				name: 'Multiple encounters',
				render: toggle(() => s.multipleEncounters, v => { s.multipleEncounters = v; }, () => nimble().encounters.trigger('changed')),
			},
			{
				name: 'Apply monster armor automatically',
				desc: 'Typed damage: ! crit, v vulnerable, r resisted.',
				render: toggle(() => s.autoArmor, v => { s.autoArmor = v; }),
			},
			{
				name: 'Minion overkill',
				desc: 'One more minion drops per full die of damage.',
				render: toggle(() => s.minionOverkill, v => { s.minionOverkill = v; }),
			},
			{
				name: 'Legendary monsters act after each hero',
				desc: 'Done on a hero turns the card to the legendary monster. Off: tap it when you want it.',
				render: toggle(() => s.legendaryBeat, v => { s.legendaryBeat = v; }, () => nimble().encounters.trigger('changed')),
			},
		] },
		{ heading: 'Nimble character sheets', rows: [
			{
				name: 'Ask before rolling',
				desc: 'Attacks, spells, saves and checks open a dialog first: advantage or disadvantage, a situational modifier, and class dice to add (like Judgment Dice). Off rolls straight away.',
				render: toggle(() => s.rollDialog, v => { s.rollDialog = v; }),
			},
			{
				name: 'Include expansion drafts',
				desc: 'The draft classes (Manawright, Hexbinder, Psion, Revenant) and their spells in New character, sheet pickers and Omnisearch. Drafts are marked as such wherever they show. A hero who already plays a draft class keeps their whole sheet either way.',
				render: toggle(() => s.compendiumDrafts, v => { s.compendiumDrafts = v; }, () => { setCompendiumDrafts(s.compendiumDrafts); plugin.rerenderNotes(); }),
			},
			{
				name: 'Compendium art folder',
				desc: 'Where images you upload for compendium entries are saved (click the portrait on any entry\'s page to add one). Moving or renaming an image keeps it linked.',
				render: (setting) => {
					setting.addText(t => t.setPlaceholder('Ember Vault/Compendium Art').setValue(s.compendiumArtFolder).onChange(async (v) => { s.compendiumArtFolder = v.trim() || 'Ember Vault/Compendium Art'; await plugin.saveSettings(); }));
				},
			},
		] },
	];
}
