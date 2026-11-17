// Nimble's wiring, done by its register() (the contract's): its views, the
// ```nimble stat block, `nimble:` references and autocomplete, builders,
// homebrew and saved-fight blocks, character features, and its monster index
// kept current. main.ts only sets up what every game shares.

import { TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { addEditButton, registerBuilders } from './builder-register';
import { registerCharacterFeatures } from './character-register';
import { watchArt } from './compendium-art';
import { invalidateCompendium } from './compendium-browser';
import { setCompendiumDrafts, setHomebrew } from './compendium-data';
import { COMPENDIUM_VIEW_TYPE, CompendiumView } from './compendium-view';
import { registerHomebrewBlocks } from './homebrew-block';
import { nimbleRefProvider } from './inline-ref';
import { readStatblock } from './parser';
import { registerFightBlock } from './saved-fight';
import { renderStatblockIssues } from './statblock-issues';
import { InlineRefSuggest } from './suggest';
import { ENCOUNTER_VIEW_TYPE, EncounterTrackerView } from './tracker-view';

export function registerNimble(plugin: EmberVaultPlugin): void {
	plugin.registerView(ENCOUNTER_VIEW_TYPE, (leaf) => new EncounterTrackerView(leaf, plugin));
	plugin.registerView(COMPENDIUM_VIEW_TYPE, (leaf) => new CompendiumView(leaf, plugin));
	watchArt(plugin);
	// The compendium's entries are built once; anything that changes them throws them away.
	plugin.registerEvent(plugin.index.on('changed', () => { setHomebrew(plugin.index.homebrew()); invalidateCompendium(); }));
	plugin.registerEvent(plugin.campaigns.on('changed', () => invalidateCompendium()));
	plugin.registerMarkdownCodeBlockProcessor('nimble', (source, el, ctx) => {
		const { monster, issues } = readStatblock(source);
		if (!monster) {
			const err = el.createDiv({ cls: 'nimble-error' });
			err.createEl('strong', { text: 'Nimble stat block needs a name. ' });
			err.appendText('Add a line like "name: Goblin" to this block.');
			renderStatblockIssues(plugin, el, issues, source, ctx);
			return;
		}
		plugin.renderStatblock(el, monster, ctx.sourcePath, 'block', (ev) => {
			void plugin.addToEncounter(monster, ctx.sourcePath, ev.shiftKey ? 2 : 1);
		});
		if (plugin.settings.statblockHints) renderStatblockIssues(plugin, el, issues, source, ctx);
		if (!plugin.playerView(ctx.sourcePath)) addEditButton(plugin, el, ctx, { kind: 'monster', lang: 'nimble', source, seed: { monster, copyName: true, editing: true }, unread: new Set(issues.map(i => i.line)).size });
	});
	registerFightBlock(plugin);
	setCompendiumDrafts(plugin.settings.compendiumDrafts);
	registerCharacterFeatures(plugin);
	registerBuilders(plugin);
	registerHomebrewBlocks(plugin);
	// Reading view: `nimble:Name` inline references
	plugin.inlineRefs.add(nimbleRefProvider(plugin));
	plugin.registerEditorSuggest(new InlineRefSuggest(plugin.app, plugin));
	// Core tells systems about the party and the active campaign; Nimble's encounters follow.
	plugin.registerEvent(plugin.events.on('party-changed', () => plugin.encounters.trigger('changed')));
	plugin.registerEvent(plugin.events.on('active-campaign-changed', () => plugin.loadBundledBestiary()));
	// Campaigns keep their monsters to themselves: a name in Brakka's Journal never opens the GM's
	// Quicksilver Construct. A monster written in a campaign's notes is seen only from that campaign;
	// one in a loose note, from campaigns you run (and notes outside any). The bestiary is seen everywhere.
	plugin.index.setScope((filePath, from) => plugin.canSee(filePath, from));
	// Which monsters a lookup sees follows the active campaign and the campaigns' folders and roles.
	let scope = '';
	plugin.registerEvent(plugin.campaigns.on('changed', () => {
		const next = JSON.stringify([plugin.campaigns.active?.folder ?? null, plugin.campaigns.campaigns.map(c => [c.folder, c.role])]);
		if (next === scope) return;
		scope = next;
		plugin.index.trigger('changed');
	}));

	plugin.registerEvent(plugin.index.on('changed', () => plugin.refsChanged()));
	plugin.app.workspace.onLayoutReady(async () => {
		await plugin.index.build();
		plugin.registerEvent(plugin.app.vault.on('modify', f => { if (f instanceof TFile) void plugin.index.update(f); }));
		plugin.registerEvent(plugin.app.vault.on('create', f => { if (f instanceof TFile) void plugin.index.update(f); }));
		plugin.registerEvent(plugin.app.vault.on('delete', f => plugin.index.remove(f.path)));
		plugin.registerEvent(plugin.app.vault.on('rename', (f, oldPath) => {
			plugin.index.remove(oldPath, false);
			if (f instanceof TFile) void plugin.index.update(f);
			renameSourceFile(plugin, oldPath, f.path);
		}));
	});
}

/** A note moved: the encounters that came from it follow. */
function renameSourceFile(plugin: EmberVaultPlugin, oldPath: string, newPath: string): void {
	let changed = false;
	for (const enc of plugin.settings.encounters) {
		if (enc.sourcePath === oldPath) { enc.sourcePath = newPath; changed = true; }
		for (const c of enc.creatures) {
			if (c.sourceFile === oldPath) { c.sourceFile = newPath; changed = true; }
		}
	}
	if (changed) void plugin.saveSettings();
}
