// Nimble's wiring, done by its register() (the contract's): its views, the
// ```nimble stat block, `nimble:` references and autocomplete, builders,
// homebrew and saved-fight blocks, character features, and its monster index
// kept current. main.ts only sets up what every game shares.

import { Notice, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { showEffectPrompts } from '../../core/tracker/effect-prompts';
import type { EffectPrompt } from '../../core/tracker/effects';
import { addEditButton, registerBuilders } from './builder-register';
import { registerCharacterFeatures } from './character-register';
import { watchArt } from './compendium-art';
import { invalidateCompendium } from './compendium-browser';
import { setCompendiumDrafts, setHomebrew } from './compendium-data';
import { COMPENDIUM_VIEW_TYPE, CompendiumView } from './compendium-view';
import { registerHomebrewBlocks } from './homebrew-block';
import { nimbleRefProvider } from './inline-ref';
import { readStatblock } from './parser';
import { registerFightBlock, saveFight } from './saved-fight';
import { shownLabel } from './encounters';
import { renderStatblockIssues } from './statblock-issues';
import { createNimbleRuntime, NimbleRuntime } from './runtime';
import { BuilderModal } from './builder-modal';
import { openCompendiumSearch } from './compendium-modal';

import { InlineRefSuggest } from './suggest';
import { ENCOUNTER_VIEW_TYPE, EncounterTrackerView } from './tracker-view';

export function registerNimble(plugin: EmberVaultPlugin): void {
	const nb = createNimbleRuntime(plugin);
	nb.loadBundledBestiary();
	// The plugin's events: settings re-read from disk (sync), about to be saved, and fights for the screen lock.
	plugin.registerEvent(plugin.events.on('settings-reloaded', () => {
		nb.loadBundledBestiary();
		setCompendiumDrafts(plugin.settings.compendiumDrafts);
		nb.encounters.trigger('changed');
	}));
	plugin.registerEvent(plugin.events.on('settings-saving', () => invalidateCompendium()));
	plugin.registerEvent(nb.encounters.on('changed', () => plugin.events.trigger('combat-changed')));
	// A side's turn starting, or a turn marked done: what conditions ask (damage, saves, reminders), once, whichever tracker or command did it.
	plugin.registerEvent(nb.encounters.on('effects', (encId: string, prompts: EffectPrompt[]) => {
		const store = nb.encounters;
		const who = (id: string) => store.creature(encId, id);
		showEffectPrompts(plugin, prompts, {
			system: 'nimble',
			words: { save: 'save' },
			label: (id) => { const c = who(id); const enc = store.find(encId); return c ? (enc ? shownLabel(c, enc.creatures) : c.label) : '?'; },
			// The same as typing the number in its HP box: Nimble's armor, Wounds and minions.
			damage: (id, amount) => store.applyHp(encId, id, { kind: 'damage', amount }).events.join('; ') || undefined,
			endCondition: (id, name) => store.removeCondition(encId, id, name),
			log: (text) => { const enc = store.find(encId); if (enc) store.log(enc, text); },
		});
	}));
	registerNimbleCommands(plugin, nb);
	plugin.registerView(ENCOUNTER_VIEW_TYPE, (leaf) => new EncounterTrackerView(leaf, plugin));
	plugin.registerView(COMPENDIUM_VIEW_TYPE, (leaf) => new CompendiumView(leaf, plugin));
	watchArt(plugin);
	// The compendium's entries are built once; anything that changes them throws them away.
	plugin.registerEvent(nb.index.on('changed', () => { setHomebrew(nb.index.homebrew()); invalidateCompendium(); }));
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
		nb.renderStatblock(el, monster, ctx.sourcePath, 'block', (ev) => {
			void nb.addToEncounter(monster, ctx.sourcePath, ev.shiftKey ? 2 : 1);
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
	plugin.registerEvent(plugin.events.on('party-changed', () => nb.encounters.trigger('changed')));
	plugin.registerEvent(plugin.events.on('active-campaign-changed', () => nb.loadBundledBestiary()));
	// Campaigns keep their monsters to themselves: a name in Brakka's Journal never opens the GM's
	// Quicksilver Construct. A monster written in a campaign's notes is seen only from that campaign;
	// one in a loose note, from campaigns you run (and notes outside any). The bestiary is seen everywhere.
	nb.index.setScope((filePath, from) => plugin.canSee(filePath, from));
	// Which monsters a lookup sees follows the active campaign and the campaigns' folders and roles.
	let scope = '';
	plugin.registerEvent(plugin.campaigns.on('changed', () => {
		const next = JSON.stringify([plugin.campaigns.active?.folder ?? null, plugin.campaigns.campaigns.map(c => [c.folder, c.role])]);
		if (next === scope) return;
		scope = next;
		nb.index.trigger('changed');
	}));

	plugin.registerEvent(nb.index.on('changed', () => plugin.refsChanged()));
	plugin.app.workspace.onLayoutReady(async () => {
		await nb.index.build();
		plugin.registerEvent(plugin.app.vault.on('modify', f => { if (f instanceof TFile) void nb.index.update(f); }));
		plugin.registerEvent(plugin.app.vault.on('create', f => { if (f instanceof TFile) void nb.index.update(f); }));
		plugin.registerEvent(plugin.app.vault.on('delete', f => nb.index.remove(f.path)));
		plugin.registerEvent(plugin.app.vault.on('rename', (f, oldPath) => {
			nb.index.remove(oldPath, false);
			if (f instanceof TFile) void nb.index.update(f);
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

const MONSTER_TEMPLATE = `\`\`\`nimble
name: Monster
level: 1
size: Medium
type: Beast
hp: 21
armor: none
movement: 6
saves: STR+
abilities:
- Keen Senses: Advantage on Perception checks.
attacks:
- **Bite.** 1d8+2.
\`\`\`
`;

const LEGENDARY_TEMPLATE = `\`\`\`nimble
name: Legendary Monster
level: 3
role: legendary
size: Large
type: Owlbear
hp: 40/hero
armor: none
movement: 6
saves: STR+
actionText: After each hero's turn, choose one:
attacks:
- **Beak.** Move 8. Attack for 2d6 damage.
- **Rend & Tear.** Attack for 2d6+5 damage.
bloodied: Gains Savage Screech: (1 use, Reach 12, AoE) 2d6 psychic damage. DC 11 WIL save or Frightened 1 round.
lastStand: Regains 10 HP per hero and rolls d10s instead of d6s.
\`\`\`
`;

const ENCOUNTER_TEMPLATE = `\`\`\`nimble-encounter
name: Goblin ambush
party: true
monsters:
- 2 Goblin
- 4 Goblin Minion
\`\`\`
`;

/** Nimble's own commands (the ids are kept, so hotkeys still work). */
function registerNimbleCommands(plugin: EmberVaultPlugin, nb: NimbleRuntime): void {
	const gm = (fn: () => void) => (checking: boolean) => {
		if (plugin.playerView()) return false;
		if (!checking) fn();
		return true;
	};
	plugin.addCommand({ id: 'search-compendium', name: 'Search the compendium…', icon: 'library', callback: () => openCompendiumSearch(plugin) });
	plugin.addCommand({ id: 'add-monster', name: 'Add monster to encounter…', checkCallback: gm(() => nb.openAddMonsterModal()) });
	plugin.addCommand({ id: 'build-encounter', name: 'Build an encounter…', checkCallback: gm(() => new BuilderModal(plugin).open()) });
	const withActive = (fn: (encId: string) => void) => (checking: boolean) => {
		const enc = nb.encounters.active;
		if (!enc || plugin.playerView()) return false;
		if (!checking) fn(enc.id);
		return true;
	};
	plugin.addCommand({ id: 'next-round', name: 'Next round', checkCallback: withActive(id => nb.encounters.nextRound(id)) });
	plugin.addCommand({ id: 'start-combat', name: 'Start combat (round 1, heroes first)', checkCallback: withActive(id => nb.encounters.start(id)) });
	plugin.addCommand({ id: 'end-combat', name: 'End combat', checkCallback: withActive(id => { nb.encounters.end(id); }) });
	plugin.addCommand({ id: 'resume-combat', name: 'Resume combat', checkCallback: (checking) => {
		const enc = nb.encounters.active;
		if (!enc?.paused) return false;
		if (!checking) nb.encounters.resume(enc.id);
		return true;
	} });
	plugin.addCommand({ id: 'save-fight', name: 'Save fight to a note', checkCallback: withActive(id => {
		const enc = nb.encounters.find(id);
		if (enc) void saveFight(plugin, enc).then(f => { if (f) { plugin.rerenderNotes(); new Notice(`Fight saved to ${f.basename}`); } });
	}) });
	plugin.addCommand({
		id: 'add-party',
		name: 'Add the party to the encounter',
		checkCallback: (checking) => {
			if (plugin.playerView()) return false;
			if (checking) return true;
			if (!plugin.settings.party.length) { new Notice('Set up your party in the plugin settings first.'); return true; }
			const n = nb.encounters.addParty();
			new Notice(n ? `Added ${n} hero${n === 1 ? '' : 'es'}` : 'The whole party is already in this encounter');
			return true;
		},
	});
	plugin.addCommand({
		id: 'copy-summary',
		name: 'Copy encounter summary',
		checkCallback: withActive(id => {
			void navigator.clipboard.writeText(nb.encounters.summary(id));
			new Notice('Encounter summary copied');
		}),
	});
	plugin.addCommand({ id: 'insert-template', name: 'Insert monster template', editorCallback: (editor) => editor.replaceSelection(MONSTER_TEMPLATE) });
	plugin.addCommand({ id: 'insert-legendary-template', name: 'Insert legendary monster template', editorCallback: (editor) => editor.replaceSelection(LEGENDARY_TEMPLATE) });
	plugin.addCommand({ id: 'insert-encounter-template', name: 'Insert encounter block', editorCallback: (editor) => editor.replaceSelection(ENCOUNTER_TEMPLATE) });
	plugin.addCommand({ id: 'insert-reference', name: 'Insert monster reference', editorCallback: (editor) => editor.replaceSelection('`nimble:') });
}
