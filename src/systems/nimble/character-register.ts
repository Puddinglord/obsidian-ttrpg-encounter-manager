// Character sheets and the compendium: one call from the plugin's onload wires
// the ```nimble-sheet block, the Character panel, the commands and the ribbon.

import { Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { registerSheetBlock } from './character-sheet';
import { CHARACTER_VIEW_TYPE, CharacterView, myCharacter } from './character-view';

import { pickFromCompendium } from './compendium-pickers';
import { addItem, Frontmatter } from './character-def';
import { bundledCompendium } from './compendium-data';

/** Show the Character panel (right sidebar), optionally on a given note. */
export async function openCharacterView(plugin: EmberVaultPlugin, file?: TFile): Promise<void> {
	const ws = plugin.app.workspace;
	let leaf: WorkspaceLeaf | null = ws.getLeavesOfType(CHARACTER_VIEW_TYPE)[0] ?? null;
	if (!leaf) {
		leaf = ws.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: CHARACTER_VIEW_TYPE, active: true });
	}
	await ws.revealLeaf(leaf);
	if (file && leaf.view instanceof CharacterView) leaf.view.show(file);
}

export function registerCharacterFeatures(plugin: EmberVaultPlugin): void {
	registerSheetBlock(plugin);
	plugin.registerView(CHARACTER_VIEW_TYPE, (leaf) => new CharacterView(leaf, plugin));
	plugin.addRibbonIcon('user-round', 'My character', () => void plugin.openMyCharacter());

	plugin.addCommand({ id: 'open-my-character', name: 'Open my character', icon: 'user-round', callback: () => void plugin.openMyCharacter() });
	plugin.addCommand({ id: 'new-character', name: 'New character…', icon: 'user-round-plus', callback: () => plugin.newCharacter() });
	plugin.addCommand({
		id: 'add-item-to-character', name: 'Add item to my character…', icon: 'backpack',
		// Nimble's items, for Nimble characters: other systems' sheets have their own Add item.
		checkCallback: (checking) => {
			if (plugin.system().id !== 'nimble') return false;
			if (checking) return true;
			const file = myCharacter(plugin);
			if (!file) { new Notice('No character of yours yet: make one with "New character", or set mine: true on a character note.'); return; }
			pickFromCompendium(plugin, {
				kinds: ['item'], title: `Add to ${file.basename}'s inventory`, allowCustom: true,
				onPick: (hit) => {
					const it = bundledCompendium(file.path).item(hit.name);
					void plugin.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => addItem(fm, hit.name, 1, { equip: it?.category === 'shield' }))
						.then(() => new Notice(`${hit.name} added to ${file.basename}`));
				},
			});
		},
	});
}
