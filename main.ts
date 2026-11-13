import { Component, Events, MarkdownRenderer, MarkdownView, Menu, normalizePath, Notice, Platform, Plugin, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { editorSuggests, editorView, findCommand, openPluginSettings } from './src/internals';
import {
	migrateSettings, MonsterIndexEntry, NIMBLE_CONDITIONS, NimbleCondition, NimbleMonster, NimbleStatblocksSettings,
	RollLogEntry, uid,
} from './src/types';
import { parseStatblock, toStatblockSource } from './src/parser';
import { DiceKind, renderStatblock, RenderOptions, StatblockAction } from './src/render';
import { MonsterIndex } from './src/monster-index';
import { EncounterStore } from './src/encounters';
import { ENCOUNTER_VIEW_TYPE, EncounterTrackerView } from './src/tracker-view';
import { createInlineRef, HoverPreview, parseInlineRef, refreshInlineRefs } from './src/inline-ref';
import { inlineRefLivePreview } from './src/live-preview';
import { AddMonsterModal, InlineRefSuggest } from './src/suggest';
import { NimbleSlashSuggest } from './src/slash';
import { NimbleSettingsTab } from './src/settings-tab';
import { parseDice, rollDie, rollNimbleAttack, rollPlain } from './src/dice';
import { EdgeRollInput, EdgeRollResult, rollEdge } from './src/roll-def';
import { BestiaryEntry, bestiaryEntries } from './src/bestiary';
import { baseCreatureName, BESTIARY_VIEW_TYPE, BestiaryView, bookOf } from './src/bestiary-view';
import { notesBody } from './src/creature-notes';
import { registerEncounterBlock } from './src/encounter-block';
import { BuilderModal } from './src/builder-modal';
import { PartyModal } from './src/party';
import { registerMapBlock } from './src/map-block';
import { keywordPattern } from './src/markdown';
import { openPopover } from './src/popover';
import { CampaignStore } from './src/campaigns';
import { registerBoxBlock } from './src/box-block';
import { registerNpcCard } from './src/npc-card';
import { registerFightBlock, saveFight } from './src/saved-fight';
import { NpcLinker } from './src/npc-links';
import { npcLivePreview } from './src/npc-live-preview';
import { SpotlightModal } from './src/spotlight';
import { registerTables, styleTablesIn } from './src/tables';
import { registerTooltips, watchTooltips } from './src/tooltips';
import { monsterRole, shiftMonster } from './src/rules';
import { canRoll3d, dice3dLastStats, dice3dSupported, diceForRoll, landedWithin, roll3d, warm3d } from './src/dice3d';
import { dressDice, rollEvent, rollOptions } from './src/dice3d/looks';
import type { Die3d } from './src/dice3d';
import type { DieLook } from './src/dice3d/renderer';
import { inkOn } from './src/die-shape';
import type { RollEvent } from './src/dice3d/styles';
import { DiceWorkshopModal } from './src/dice-workshop';
import { CAMPAIGN_VIEW_TYPE, CampaignBlock, CampaignView } from './src/campaign-view';
import { CampaignPicker, NewCampaignModal } from './src/campaign-modals';
import { newSceneAnywhere, promptCharacter, promptChapter, promptSectionNote } from './src/campaign-ui';
import BESTIARY from './src/data/bestiary.json';
import { registerCharacterFeatures } from './src/character-register';
import { registerReadingMode } from './src/reading-mode';
import { safeName } from './src/campaign-model';
import { creatureNote } from './src/campaign-templates';
import { bundledCompendium, setCompendiumDrafts } from './src/compendium-data';

const ROLL_LOG_LIMIT = 30;

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

const INSERT_LINK = 'editor:insert-link';

export default class NimbleStatblocksPlugin extends Plugin {
	settings: NimbleStatblocksSettings;
	index: MonsterIndex;
	encounters: EncounterStore;
	hover: HoverPreview;
	/** Plugin-wide events: 'roll-log-changed'. */
	events = new Events();
	/** Bumped whenever the monster index changes; Live Preview widgets watch it. */
	indexVersion = 0;
	private keywordCache: { key: string; re: RegExp | undefined } | null = null;
	campaigns!: CampaignStore;
	/** Bumped when the NPC list changes; Live Preview decorations watch it. */
	npcVersion = 0;
	private wakeLock: WakeLockSentinel | null = null;
	private wakePending = false;
	private settingsTab?: NimbleSettingsTab;
	/** data.json couldn't be read and couldn't be copied aside: nothing is saved, so the file isn't overwritten. */
	private settingsReadOnly = false;
	/** The bundled player compendium (classes, items, spells…). */
	get compendium() { return bundledCompendium(); }

	/** Hold a screen wake lock on mobile while the active encounter is in combat. */
	syncWakeLock(): void {
		const enc = this.encounters?.active;
		const want = Platform.isMobile && this.settings.keepScreenOn && activeDocument.visibilityState === 'visible'
			&& !!enc && !!enc.phase && enc.phase !== 'setup';
		const api = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
		if (want && !this.wakeLock && !this.wakePending && api) {
			this.wakePending = true;
			api.request('screen').then((lock) => {
				this.wakePending = false;
				this.wakeLock = lock;
				if (!Platform.isMobile || !this.settings.keepScreenOn) { this.syncWakeLock(); return; }
				lock.addEventListener('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
			}).catch(() => { this.wakePending = false; }); // not allowed (battery saver, old iOS): nothing to do
		} else if (!want && this.wakeLock) {
			const lock = this.wakeLock;
			this.wakeLock = null;
			void lock.release().catch(() => undefined);
		}
	}

	async onload() {
		await this.loadSettings();

		this.index = new MonsterIndex(this.app);
		this.campaigns = new CampaignStore(this);
		this.encounters = new EncounterStore(() => this.settings, () => this.saveSettings(), () => this.campaigns.defaults());
		this.hover = new HoverPreview(this);
		this.loadBundledBestiary();

		this.registerView(ENCOUNTER_VIEW_TYPE, (leaf) => new EncounterTrackerView(leaf, this));
		this.registerView(BESTIARY_VIEW_TYPE, (leaf) => new BestiaryView(leaf, this));
		this.registerView(CAMPAIGN_VIEW_TYPE, (leaf) => new CampaignView(leaf, this));
		this.addRibbonIcon('castle', 'Nimble campaign', () => this.openCampaignView());
		const trackerRibbon = this.addRibbonIcon('swords', 'Nimble encounter tracker', () => this.activateEncounterView());
		// The tracker is a GM tool: its ribbon button hides while you're in a campaign you play in.
		const syncRibbon = () => trackerRibbon.toggle(!this.playerView());
		this.registerEvent(this.campaigns.on('changed', syncRibbon));
		syncRibbon();
		this.addRibbonIcon('book-open', 'Nimble bestiary', () => this.openBestiary());
		this.registerHoverLinkSource('nimble-gm', { display: 'Ember Vault', defaultMod: true });

		this.registerMarkdownCodeBlockProcessor('nimble', (source, el, ctx) => {
			const monster = parseStatblock(source);
			if (!monster) {
				const err = el.createDiv({ cls: 'nimble-error' });
				err.createEl('strong', { text: 'Nimble stat block needs a name. ' });
				err.appendText('Add a line like "name: Goblin" to this block.');
				return;
			}
			this.renderStatblock(el, monster, ctx.sourcePath, 'block', (ev) => {
				void this.addToEncounter(monster, ctx.sourcePath, ev.shiftKey ? 2 : 1);
			});
		});
		registerEncounterBlock(this);
		registerBoxBlock(this);
		registerNpcCard(this);
		registerFightBlock(this);
		new NpcLinker(this);
		registerTables(this);
		registerTooltips(this);
		// Pop-out windows opened later get table styling and tooltips too.
		this.registerEvent(this.app.workspace.on('window-open', (_w, win) => {
			styleTablesIn(this, win.document);
			watchTooltips(this, win.document);
		}));
		this.registerMarkdownCodeBlockProcessor('nimble-campaign', (_source, el, ctx) => ctx.addChild(new CampaignBlock(this, el, ctx)));
		registerMapBlock(this);
		setCompendiumDrafts(this.settings.compendiumDrafts);
		registerCharacterFeatures(this);
		registerReadingMode(this);

		// Reading view: `nimble:Name` inline references
		this.registerMarkdownPostProcessor((el, ctx) => {
			el.querySelectorAll('code').forEach((codeEl) => {
				if (codeEl.closest('pre')) return; // skip code blocks
				const name = parseInlineRef(codeEl.textContent || '');
				if (name) codeEl.replaceWith(createInlineRef(this, name, ctx.sourcePath));
			});
		});

		// Live Preview + autocomplete
		this.registerEditorExtension(inlineRefLivePreview(this));
		this.registerEditorExtension(npcLivePreview(this));
		this.registerEvent(this.campaigns.on('changed', () => { this.npcVersion++; this.pokeEditors(); }));
		this.registerEditorSuggest(new InlineRefSuggest(this.app, this));
		const slash = new NimbleSlashSuggest(this.app, this);
		this.registerEditorSuggest(slash);
		// Put ours ahead of Obsidian's core "/" menu; it only claims input that matches a Nimble command.
		const suggests = editorSuggests(this.app.workspace);
		if (suggests?.includes(slash)) { suggests.remove(slash); suggests.unshift(slash); }

		this.registerCommands();
		this.settingsTab = new NimbleSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		// Phones and tablets: keep the screen awake while combat is running.
		this.registerEvent(this.encounters.on('changed', () => this.syncWakeLock()));
		this.registerDomEvent(activeDocument, 'visibilitychange', () => { this.wakeLock = null; this.syncWakeLock(); });
		this.register(() => { void this.wakeLock?.release().catch(() => undefined); this.wakeLock = null; });
		this.app.workspace.onLayoutReady(() => this.syncWakeLock());

		// Campaigns keep their monsters to themselves: a name in Brakka's Journal never opens the GM's
		// Quicksilver Construct. A monster written in a campaign's notes is seen only from that campaign;
		// one in a loose note, from campaigns you run (and notes outside any). The bestiary is seen everywhere.
		this.index.setScope((filePath, from) => {
			const cs = this.campaigns;
			if (!filePath || !cs) return true;
			const here = (from ? cs.of(from) : undefined) ?? cs.active;
			const home = cs.of(filePath);
			if (home) return home.folder === here?.folder;
			return here?.role !== 'player';
		});
		// Which monsters a lookup sees follows the active campaign and the campaigns' folders and roles.
		let scope = '';
		this.registerEvent(this.campaigns.on('changed', () => {
			const next = JSON.stringify([this.campaigns.active?.folder ?? null, this.campaigns.campaigns.map(c => [c.folder, c.role])]);
			if (next === scope) return;
			scope = next;
			this.index.trigger('changed');
		}));

		this.registerEvent(this.index.on('changed', () => {
			this.indexVersion++;
			refreshInlineRefs(this);
			this.pokeEditors();
		}));

		this.app.workspace.onLayoutReady(async () => {
			this.campaigns.start();
			// First run in a vault with campaigns: show the Campaign panel once.
			if (!this.settings.campaignPanelShown && this.campaigns.campaigns.length) {
				this.settings.campaignPanelShown = true;
				void this.saveSettings();
				if (!this.app.workspace.getLeavesOfType(CAMPAIGN_VIEW_TYPE).length) void this.openCampaignView();
			}
			await this.index.build();
			this.registerEvent(this.app.vault.on('modify', f => { if (f instanceof TFile) void this.index.update(f); }));
			this.registerEvent(this.app.vault.on('create', f => { if (f instanceof TFile) void this.index.update(f); }));
			this.registerEvent(this.app.vault.on('delete', f => this.index.remove(f.path)));
			this.registerEvent(this.app.vault.on('rename', (f, oldPath) => {
				this.index.remove(oldPath, false);
				if (f instanceof TFile) void this.index.update(f);
				this.renameSourceFile(oldPath, f.path);
			}));
		});
	}

	onunload() {
		this.hover?.hide();
	}

	/** (Re)load the bundled Nimble bestiary, or clear it when the setting is off. */
	loadBundledBestiary(): void {
		const entries = this.settings.bundledBestiary
			? bestiaryEntries(BESTIARY as unknown as BestiaryEntry[], this.encounters.partySize())
			: [];
		this.index.setBundled(entries);
	}

	private registerCommands(): void {
		// Spotlight: search and actions in one box. Any hotkey can be set for it; Cmd/Ctrl+K is shared with Insert link (see shareInsertLinkKey).
		this.addCommand({ id: 'spotlight', name: 'Spotlight: search adversaries, roll dice and more', icon: 'search', callback: () => this.toggleSpotlight() });
		this.app.workspace.onLayoutReady(() => { this.shareInsertLinkKey(); this.offerSpotlightKey(); });
		// GM tools are left out of the palette while you're in a campaign you play in.
		const gm = (fn: () => void) => (checking: boolean) => {
			if (this.playerView()) return false;
			if (!checking) fn();
			return true;
		};
		this.addCommand({ id: 'open-tracker', name: 'Open encounter tracker', checkCallback: gm(() => void this.activateEncounterView()) });
		this.addCommand({ id: 'open-bestiary', name: 'Open bestiary', callback: () => this.openBestiary() });
		this.addCommand({ id: 'add-monster', name: 'Add monster to encounter…', checkCallback: gm(() => this.openAddMonsterModal()) });
		this.addCommand({ id: 'build-encounter', name: 'Build an encounter…', checkCallback: gm(() => new BuilderModal(this).open()) });
		this.addCommand({ id: 'edit-party', name: 'Edit party…', callback: () => this.openParty() });
		this.addCommand({ id: 'open-settings', name: 'Open Nimble settings', callback: () => this.openSettings() });
		const withActive = (fn: (encId: string) => void) => (checking: boolean) => {
			const enc = this.encounters.active;
			if (!enc || this.playerView()) return false;
			if (!checking) fn(enc.id);
			return true;
		};
		this.addCommand({ id: 'next-round', name: 'Next round', checkCallback: withActive(id => this.encounters.nextRound(id)) });
		this.addCommand({ id: 'start-combat', name: 'Start combat (round 1, heroes first)', checkCallback: withActive(id => this.encounters.start(id)) });
		this.addCommand({ id: 'end-combat', name: 'End combat', checkCallback: withActive(id => { this.encounters.end(id); }) });
		this.addCommand({ id: 'resume-combat', name: 'Resume combat', checkCallback: (checking) => {
			const enc = this.encounters.active;
			if (!enc?.paused) return false;
			if (!checking) this.encounters.resume(enc.id);
			return true;
		} });
		this.addCommand({ id: 'save-fight', name: 'Save fight to a note', checkCallback: withActive(id => {
			const enc = this.encounters.find(id);
			if (enc) void saveFight(this, enc).then(f => { if (f) { this.rerenderNotes(); new Notice(`Fight saved to ${f.basename}`); } });
		}) });
		this.addCommand({
			id: 'add-party',
			name: 'Add the party to the encounter',
			checkCallback: (checking) => {
				if (this.playerView()) return false;
				if (checking) return true;
				if (!this.settings.party.length) { new Notice('Set up your party in the plugin settings first.'); return true; }
				const n = this.encounters.addParty();
				new Notice(n ? `Added ${n} hero${n === 1 ? '' : 'es'}` : 'The whole party is already in this encounter');
				return true;
			},
		});
		this.addCommand({
			id: 'copy-summary',
			name: 'Copy encounter summary',
			checkCallback: withActive(id => {
				void navigator.clipboard.writeText(this.encounters.summary(id));
				new Notice('Encounter summary copied');
			}),
		});
		this.addCommand({ id: 'insert-template', name: 'Insert monster template', editorCallback: (editor) => editor.replaceSelection(MONSTER_TEMPLATE) });
		this.addCommand({ id: 'insert-legendary-template', name: 'Insert legendary monster template', editorCallback: (editor) => editor.replaceSelection(LEGENDARY_TEMPLATE) });
		this.addCommand({ id: 'insert-encounter-template', name: 'Insert encounter block', editorCallback: (editor) => editor.replaceSelection(ENCOUNTER_TEMPLATE) });
		this.addCommand({ id: 'insert-reference', name: 'Insert monster reference', editorCallback: (editor) => editor.replaceSelection('`nimble:') });
		this.addCommand({ id: 'clear-roll-log', name: 'Clear roll log', callback: () => this.clearRollLog() });
		this.addCommand({ id: 'dice-workshop', name: 'Open Dice Workshop', callback: () => this.openDiceWorkshop() });

		// Campaigns
		const inCampaign = (fn: (c: NonNullable<CampaignStore['active']>) => void) => (checking: boolean) => {
			const c = this.campaigns.active;
			if (!c) return false;
			if (!checking) fn(c);
			return true;
		};
		this.addCommand({ id: 'open-campaign', name: 'Open campaign panel', callback: () => this.openCampaignView() });
		this.addCommand({ id: 'new-campaign', name: 'New campaign…', callback: () => this.newCampaign() });
		this.addCommand({
			id: 'switch-campaign', name: 'Switch campaign…',
			callback: () => new CampaignPicker(this.app, this.campaigns.campaigns, (c) => { void (async () => { await this.campaigns.setActive(c.folder); await this.campaigns.open(c.home.path); })(); }).open(),
		});
		this.addCommand({ id: 'new-chapter', name: 'New chapter…', checkCallback: inCampaign(c => promptChapter(this, c)) });
		this.addCommand({ id: 'new-scene', name: 'New scene…', callback: () => newSceneAnywhere(this) });
		this.addCommand({ id: 'new-npc', name: 'New NPC…', checkCallback: inCampaign(c => promptSectionNote(this, c, 'npc')) });
		this.addCommand({ id: 'new-location', name: 'New location…', checkCallback: inCampaign(c => promptSectionNote(this, c, 'location')) });
		this.addCommand({ id: 'new-session', name: 'New session log…', checkCallback: inCampaign(c => promptSectionNote(this, c, 'session')) });
		this.addCommand({
			id: 'continue-campaign', name: 'Continue where you left off',
			checkCallback: inCampaign(c => { const p = this.campaigns.lastScene(c) ?? c.chapters[0]?.scenes[0]?.path; if (p) void this.campaigns.open(p); }),
		});
		const stepCmd = (dir: 1 | -1) => (checking: boolean) => {
			const f = this.app.workspace.getActiveFile();
			const c = f && this.campaigns.of(f.path);
			if (!c) return false;
			if (!checking && !this.campaigns.step(dir)) new Notice(dir === 1 ? 'That was the last scene' : 'This is the first scene');
			return true;
		};
		this.addCommand({ id: 'next-scene', name: 'Next scene', checkCallback: stepCmd(1) });
		this.addCommand({ id: 'previous-scene', name: 'Previous scene', checkCallback: stepCmd(-1) });
	}

	private spotlight: SpotlightModal | null = null;

	/** Open Spotlight, or close it if it's already up. */
	toggleSpotlight(): void {
		if (this.spotlight) { this.spotlight.close(); return; }
		const modal = this.spotlight = new SpotlightModal(this, () => { if (this.spotlight === modal) this.spotlight = null; });
		modal.open();
	}

	/**
	 * Cmd/Ctrl+K belongs to Obsidian's "Insert Markdown link". The key reaches the
	 * page in every focus state, and Obsidian's hotkey manager runs that command's
	 * checkCallback (the macOS menu item only shows the key; Obsidian ignores menu
	 * clicks that come from a modified accelerator). So that one command is wrapped:
	 * with the setting on and no text selected (an empty link is all it would
	 * insert), it opens Spotlight; with text selected it makes the link as always.
	 * Undone when the plugin unloads, and it changes none of the user's hotkeys.
	 */
	private shareInsertLinkKey(): void {
		const cmd = findCommand(this.app, INSERT_LINK);
		const original = cmd?.checkCallback;
		if (!cmd || !original) return;
		const wantsLink = () => {
			const editor = this.app.workspace.activeEditor?.editor;
			return !this.spotlight && !!editor && editor.hasFocus() && editor.somethingSelected();
		};
		const wrapped = (checking: boolean): boolean | void => {
			if (!this.settings.spotlightKey || wantsLink()) return original.call(cmd, checking);
			if (!checking) this.toggleSpotlight();
			return true;
		};
		cmd.checkCallback = wrapped;
		this.register(() => { if (cmd.checkCallback === wrapped) cmd.checkCallback = original; });
	}

	/** Once, after the update that adds Spotlight: offer Cmd/Ctrl+K rather than taking it. */
	private offerSpotlightKey(): void {
		if (this.settings.spotlightOffered) return;
		this.settings.spotlightOffered = true;
		void this.saveSettings();
		if (this.settings.spotlightKey) return;
		const key = Platform.isMacOS ? '⌘K' : 'Ctrl+K';
		const frag = createFragment((f) => {
			f.createDiv({ text: 'New in Ember Vault: Spotlight', cls: 'nimble-notice-title' });
			f.createDiv({ text: `Search adversaries, roll dice and run commands from one box. ${key} is Obsidian's Insert link key; Spotlight can share it (selected text still becomes a link).` });
			const row = f.createDiv({ cls: 'nimble-notice-actions' });
			const use = row.createEl('button', { cls: 'mod-cta', text: `Use ${key}` });
			use.addEventListener('click', () => {
				this.settings.spotlightKey = true;
				void this.saveSettings();
				this.campaigns.trigger('changed'); // the Campaign panel's search bar shows the key
				new Notice(`${key} now opens Spotlight. You can turn that off in the plugin's settings.`);
			});
			row.createEl('button', { text: 'Not now' });
		});
		new Notice(frag, 0);
	}

	// ------------------------------------------------------------------------
	// Settings

	/**
	 * Read settings from data.json. False when the file couldn't be read: at
	 * startup the plugin then runs on defaults (the damaged file is copied aside
	 * first); later on, the settings already in memory are kept.
	 */
	async loadSettings(): Promise<boolean> {
		let next: NimbleStatblocksSettings;
		let ok = true;
		try {
			const raw: unknown = await this.loadData();
			// Obsidian hands back nothing for a file it can't parse, the same as for no file at all.
			// Tell them apart, or the next save would quietly replace the damaged file with defaults.
			if (raw == null && await this.settingsFileUnreadable()) throw new Error('data.json is not valid JSON');
			next = migrateSettings(raw);
		} catch (e) {
			console.error('Nimble: could not read settings', e);
			if (this.settings) return false;
			ok = false;
			next = migrateSettings(null);
			next.spotlightOffered = true; // one notice about the settings is enough
			const copy = await this.keepBrokenSettings();
			this.settingsReadOnly = !copy;
			new Notice(`Ember Vault couldn't read its settings, so it's using the defaults for now. ${copy
				? `Your old settings file was kept as ${copy} in the plugin folder.`
				: 'Nothing will be saved until data.json in the plugin folder is repaired or removed, so it isn\'t overwritten.'}`, 0);
		}
		// Keep the same object when re-reading, so anything holding `plugin.settings` sees the new data.
		if (this.settings) {
			const live = this.settings as unknown as Record<string, unknown>;
			for (const k of Object.keys(live)) delete live[k];
			Object.assign(live, next);
		} else this.settings = next;
		return ok;
	}

	private settingsPath(name = 'data.json'): string {
		return normalizePath(`${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/${name}`);
	}

	/** Is there a data.json with something in it that Obsidian couldn't read? */
	private async settingsFileUnreadable(): Promise<boolean> {
		try {
			const path = this.settingsPath();
			if (!(await this.app.vault.adapter.exists(path))) return false;
			const text = (await this.app.vault.adapter.read(path)).trim();
			return text !== '' && text !== 'null';
		} catch {
			return false;
		}
	}

	/** Copy an unreadable data.json aside before anything saves over it. Returns the copy's name. */
	private async keepBrokenSettings(): Promise<string | null> {
		try {
			const name = `data.broken-${Date.now()}.json`;
			await this.app.vault.adapter.copy(this.settingsPath(), this.settingsPath(name));
			return name;
		} catch (e) {
			console.error('Nimble: could not copy the unreadable settings file', e);
			return null;
		}
	}

	/** data.json changed outside this window (sync from another device): take it in, so the next save doesn't undo it. */
	async onExternalSettingsChange(): Promise<void> {
		if (!(await this.loadSettings())) return;
		this.loadBundledBestiary();
		setCompendiumDrafts(this.settings.compendiumDrafts);
		this.encounters.trigger('changed');
		this.events.trigger('roll-log-changed');
		this.campaigns.trigger('changed');
		(this as unknown as { applyTableStyle?: () => void }).applyTableStyle?.();
		this.settingsTab?.externalChange();
		this.rerenderNotes();
	}

	async saveSettings() {
		if (this.settingsReadOnly) return;
		await this.saveData(this.settings);
	}

	getAllConditions(): NimbleCondition[] {
		return [...NIMBLE_CONDITIONS, ...(this.settings.customConditions || [])];
	}

	condition(name: string): NimbleCondition | undefined {
		return this.getAllConditions().find(c => c.name.toLowerCase() === name.toLowerCase());
	}

	/** Matches condition names in rules text ("Grappled", "Prone", "Dazed"…). */
	conditionKeywords(): RegExp | undefined {
		const names = this.getAllConditions().filter(c => !c.auto).map(c => c.name);
		const key = names.join('|');
		if (this.keywordCache?.key !== key) this.keywordCache = { key, re: keywordPattern(names) };
		return this.keywordCache.re;
	}

	/** A small popover with a condition's rules text. */
	showConditionInfo(anchor: HTMLElement, name: string): void {
		const cond = this.condition(name);
		if (!cond) return;
		openPopover(anchor, (el) => {
			el.addClass('condition-info');
			el.createDiv({ cls: 'popover-title', text: cond.name });
			el.createDiv({ cls: 'popover-body', text: cond.description });
		}, { width: 280 });
	}

	// ------------------------------------------------------------------------
	// Rendering

	renderStatblock(
		container: HTMLElement,
		monster: NimbleMonster,
		sourcePath: string,
		variant: 'block' | 'inline' | 'hover',
		onAdd?: (ev: MouseEvent) => void,
		extra: Partial<RenderOptions> = {},
	): HTMLElement {
		// A note's own stat block is always shown; looked-up monsters are lore cards for players.
		const lore = extra.lore ?? (variant !== 'block' && this.hideStats(sourcePath));
		const block = renderStatblock(container, monster, {
			app: this.app,
			sourcePath,
			variant,
			lore,
			compact: this.settings.statblockStyle === 'compact',
			onAdd,
			onDice: this.settings.clickableDice ? (el, expr, label, kind) => this.wireDice(el, expr, label, kind) : undefined,
			keywords: this.conditionKeywords(),
			onKeyword: (el, word) => this.wireKeyword(el, word),
			partySize: this.encounters.partySize(this.encounters.active),
			// Lore cards list every book the creature is in, wherever they show.
			sources: lore ? extra.sources ?? this.printingsOf(monster) : undefined,
			...extra,
		});
		// …and your own notes on it, under the card (bestiary, hover preview, quick look alike).
		if (lore) {
			const note = this.creatureNote(baseCreatureName(monster.name));
			if (note) void this.renderCreatureNotes(container, block, note);
		}
		return block;
	}

	/** Every book a bundled creature is printed in ("Monsters & More p.6", "GM Guide p.30"). */
	printingsOf(monster: NimbleMonster): string[] | undefined {
		if (!monster.bundledId) return undefined;
		const base = baseCreatureName(monster.name).toLowerCase();
		const all = this.index.all().filter(e => e.bundled && baseCreatureName(e.name).toLowerCase() === base);
		return all.length > 1 ? [...new Set(all.map(e => bookOf(e).long))] : undefined;
	}

	/** "Your notes" under a lore card: the note's text (without its empty template parts) and a button to open it. */
	private async renderCreatureNotes(container: HTMLElement, after: HTMLElement, file: TFile): Promise<void> {
		const text = await this.app.vault.cachedRead(file);
		if (!after.parentElement) return;
		const body = notesBody(text);
		const box = createDiv({ cls: 'nimble-creature-notes' });
		after.after(box);
		const head = box.createDiv({ cls: 'nimble-creature-notes-head' });
		setIcon(head.createSpan({ cls: 'nimble-creature-notes-icon' }), 'notebook-pen');
		head.createSpan({ cls: 'nimble-creature-notes-title', text: 'Your notes' });
		const open = head.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open your notes' } });
		setIcon(open, 'external-link');
		open.addEventListener('click', (ev) => { this.hover.hide(); void this.app.workspace.getLeaf(ev.metaKey || ev.ctrlKey).openFile(file); });
		const md = box.createDiv({ cls: 'nimble-creature-notes-body markdown-rendered' });
		if (!body) { md.createDiv({ cls: 'nimble-creature-notes-empty', text: 'Nothing written yet.' }); return; }
		// Rendered once into a card that's thrown away; the component goes with it.
		const owner = new Component();
		owner.load();
		await MarkdownRenderer.render(this.app, body, md, file.path, owner);
		const gone = new MutationObserver(() => { if (!box.isConnected) { owner.unload(); gone.disconnect(); } });
		gone.observe(box.ownerDocument.body, { childList: true, subtree: true });
	}

	/**
	 * Is the active campaign one you play in? Pass a note path to ask about that
	 * note's campaign instead (notes outside any campaign follow the active one).
	 */
	playerView(path?: string): boolean {
		return this.campaigns?.role(path) === 'player';
	}

	/**
	 * Should a monster from `monsterPath` be shown as a lore card? Yes when the
	 * note it's shown in (`viewPath`; the active campaign for panels and dialogs
	 * with no note) is in a campaign you play in, unless it's a stat block the
	 * player keeps in a campaign they play in (their own notes), or they've
	 * asked to see stats.
	 */
	hideStats(monsterPath = '', viewPath?: string): boolean {
		if (this.settings.playerStatblocks || !this.playerView(viewPath)) return false;
		return !(monsterPath && this.campaigns.of(monsterPath)?.role === 'player');
	}

	private wireKeyword(el: HTMLElement, word: string): void {
		const cond = this.condition(word);
		if (!cond) return;
		el.addClass('nimble-condition-ref');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		const show = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.showConditionInfo(el, word); };
		el.addEventListener('click', show);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') show(e); });
	}

	/** Buttons shown under a hover preview or bestiary stat block. */
	monsterActions(entry: MonsterIndexEntry, opts: { inBestiary?: boolean; viewPath?: string } = {}): StatblockAction[] {
		if (this.hideStats(entry.filePath, opts.viewPath)) {
			// Players can't add monsters to a fight; they can look them up and open their own notes.
			const out: StatblockAction[] = [];
			if (entry.bundled && !opts.inBestiary) out.push({ label: 'Bestiary', icon: 'book-open', onClick: () => { this.hover.hide(); void this.openBestiary(entry.monster.bundledId); } });
			if (!entry.bundled && entry.filePath) out.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { this.hover.hide(); void this.app.workspace.openLinkText(entry.filePath, '', ev.metaKey || ev.ctrlKey); } });
			const name = baseCreatureName(entry.name);
			const noted = !!this.creatureNote(name);
			out.push({ label: noted ? 'Open notes' : 'Add notes', icon: noted ? 'notebook-pen' : 'notebook', onClick: () => { this.hover.hide(); void this.openCreatureNote(name); } });
			return out;
		}
		const actions: StatblockAction[] = [
			{
				label: 'Add', icon: 'plus', cls: 'mod-cta',
				onClick: (ev) => void this.addToEncounter(entry.monster, entry.filePath || undefined, ev.shiftKey ? 2 : 1),
				menu: (ev) => {
					const m = new Menu();
					const add = (title: string, icon: string, n: number, shift = 0) => m.addItem(i => i.setTitle(title).setIcon(icon)
						.onClick(() => void this.addToEncounter(shiftMonster(entry.monster, shift), entry.filePath || undefined, n)));
					add('Add 2', 'copy-plus', 2);
					if (monsterRole(entry.monster) !== 'minion') {
						m.addSeparator();
						add('Add tougher (+1 level)', 'trending-up', 1, 1);
						add('Add weaker (−1 level)', 'trending-down', 1, -1);
					}
					m.showAtMouseEvent(ev);
				},
			},
		];
		if (entry.bundled) {
			if (!opts.inBestiary) actions.push({ label: 'Bestiary', icon: 'book-open', onClick: () => { this.hover.hide(); void this.openBestiary(entry.monster.bundledId); } });
			actions.push({ label: 'Copy to vault', icon: 'file-plus', onClick: () => { this.hover.hide(); void this.copyMonsterToVault(entry.monster); } });
		} else if (entry.filePath) {
			actions.push({ label: 'Open note', icon: 'file-symlink', onClick: (ev) => { this.hover.hide(); void this.app.workspace.openLinkText(entry.filePath, '', ev.metaKey || ev.ctrlKey); } });
		}
		return actions;
	}

	private wireDice(el: HTMLElement, expression: string, label: string, kind: DiceKind): void {
		el.addClass('is-clickable');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		el.setAttr('aria-label', `Roll ${expression}`);
		el.setAttr('title', `Roll ${expression}`);
		const roll = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			this.rollDice(expression, label, kind);
		};
		el.addEventListener('click', roll);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') roll(e); });
	}

	rollDice(expression: string, label: string, kind: DiceKind = 'effect', forced?: number[]): RollLogEntry | null {
		const dice = parseDice(expression);
		if (!dice) {
			new Notice(`Can't roll "${expression}"`);
			return null;
		}
		const nimble = kind === 'attack' && this.settings.nimbleAttackRolls;
		// `forced` feeds set values to the roller (the settings' "Test a crit" button).
		const rng = forced ? (() => { let i = 0; return () => (forced[i++ % forced.length] - 0.5) / dice.sides; })() : undefined;
		const result = nimble ? rollNimbleAttack(dice, rng) : rollPlain(dice, rng);
		// The roll is decided here; 3D dice just show it, and the notice waits for them to land.
		const landed = this.show3dDice(dice.sides, dice.count, result.rolls, nimble, result.outcome);
		return this.logRoll({ label: label || result.expression, expression: result.expression, total: result.total, detail: result.detail, outcome: result.outcome }, landed);
	}

	/** Timings and results of the last 3D roll (for tuning and tests). */
	diceStats() {
		return dice3dLastStats();
	}

	/**
	 * Show off a look: one of each die (d4 to d20) in it, thrown on screen. Values
	 * are given in that order, or random. Nothing is logged; it's just the dice.
	 */
	rollLookPreview(styleId: string, values?: number[]): Promise<void> | undefined {
		if (!dice3dSupported()) return undefined;
		const d = this.settings.dice;
		const prev = { normal: d.normal, primary: d.primary, perDie: d.perDie };
		d.normal = styleId; d.primary = ''; d.perDie = {};
		const dice = dressDice(this, [4, 6, 8, 10, 12, 20].map((sides, i) => ({ sides, role: 'normal' as const, value: values?.[i] ?? 1 + Math.floor(Math.random() * sides) })), false);
		Object.assign(d, prev);
		return roll3d(dice, rollOptions(d)).catch((e) => { console.warn('Nimble: 3D dice failed', e); });
	}

	/**
	 * Dice workshop: throw dice for show (nothing is logged). A pool of dice, or a
	 * staged moment (a crit chain, a miss, every die on max or min), optionally in
	 * one look instead of the configured ones. Returns the values thrown.
	 */
	workshopRoll(o: { style?: string; pool?: { sides: number; count: number }[]; test?: RollEvent; sides?: number; explosions?: number }): { values: number[]; landed?: Promise<void> } {
		const d = this.settings.dice;
		const sides = o.sides ?? 20;
		let dice: Die3d[];
		let event: RollEvent | undefined;
		if (o.test === 'crit') {
			// A Nimble crit chain: the primary die and every explosion but the last land on max.
			const n = Math.max(1, Math.min(5, o.explosions ?? 1));
			const rolls = [...Array<number>(n).fill(sides), 1 + Math.floor(Math.random() * (sides - 1))];
			dice = diceForRoll(sides, 1, rolls, true);
			event = 'crit';
		} else if (o.test === 'miss') {
			dice = diceForRoll(sides, 1, [1], true);
			event = 'miss';
		} else {
			const pool = (o.pool?.length ? o.pool : [{ sides, count: 1 }]).flatMap(p => Array.from({ length: p.count }, () => p.sides)).slice(0, 12);
			dice = pool.map(n => ({ sides: n, role: 'normal' as const, value: o.test === 'max' ? n : o.test === 'min' ? 1 : 1 + Math.floor(Math.random() * n) }));
			event = o.test ?? (dice.every(x => x.value === x.sides) ? 'max' : dice.every(x => x.value === 1) && dice.some(x => x.sides > 2) ? 'min' : undefined);
		}
		const values = dice.map(x => x.value);
		if (!dice3dSupported() || !dice.length) return { values };
		const prev = { normal: d.normal, primary: d.primary, crit: d.crit, perDie: d.perDie };
		if (o.style) { d.normal = o.style; d.primary = ''; d.crit = ''; d.perDie = {}; }
		const dressed = dressDice(this, dice, event === 'crit');
		Object.assign(d, prev);
		return { values, landed: roll3d(dressed, rollOptions(d, event)).catch((e) => { console.warn('Nimble: 3D dice failed', e); }) };
	}

	openDiceWorkshop(): void {
		new DiceWorkshopModal(this).open();
	}

	/** Roll 3D dice for a result. Resolves when they've landed (at once when 3D is off). */
	/**
	 * A roll with stacked advantage/disadvantage, situational bonuses and extra
	 * dice (Judgment Dice…), from the roll dialog. Every die rolled tumbles in 3D;
	 * the notice and log show what was kept and dropped.
	 */
	rollWithEdge(input: EdgeRollInput, label: string): EdgeRollResult {
		const r = rollEdge(input);
		// The opening throw (the dice kept, then any dropped by advantage), then each crit explosion in turn:
		// the roller chains explosions one at a time after the throw lands.
		const thrown = [...r.kept, ...r.dropped];
		const all = [...thrown, ...r.explosions];
		const nimble = input.attack && this.settings.nimbleAttackRolls;
		// Class dice put into the roll (Judgment Dice) tumble with it, in their own colour.
		const extra = r.extras.filter(x => !x.held).flatMap(x => x.rolls.map(value => ({ sides: x.sides, value })));
		const landed = this.show3dDice(input.dice.sides, thrown.length, all, nimble, r.outcome, extra);
		this.logRoll({ label, expression: r.expression, total: r.total, detail: r.detail, outcome: r.outcome }, landed);
		return r;
	}

	/**
	 * Roll with advantage: two dice of `sides`, keep the higher (a Hit Die when
	 * levelling up). Both dice tumble; the notice and log show the one kept.
	 */
	rollWithAdvantage(sides: number, label: string): { rolls: number[]; kept: number } {
		const rolls = [rollDie(sides), rollDie(sides)];
		const kept = Math.max(...rolls);
		const landed = this.show3dDice(sides, 2, rolls, false);
		this.logRoll({ label, expression: `1d${sides} ▲`, total: kept, detail: `2d${sides}: [${rolls.join(', ')}], keep ${kept}` }, landed);
		return { rolls, kept };
	}

	/** Get 3D dice ready for a roll that's coming (the level-up Hit Die), when they're on. */
	warmDice(sides: number[]): void {
		const s = this.settings;
		if (!s.dice3d || (Platform.isPhone && !s.dice3dOnPhone) || !sides.length) return;
		// The same dice, in the same looks, as the roll that's coming.
		const dice = dressDice(this, diceForRoll(sides[0], sides.length, sides.map(() => 1), false), false);
		void warm3d(dice, rollOptions(s.dice)).catch(() => undefined);
	}

	private show3dDice(sides: number, count: number, rolls: number[], nimble: boolean, outcome?: 'miss' | 'crit', extra: { sides: number; value: number }[] = []): Promise<void> | undefined {
		const s = this.settings;
		if (!s.dice3d || (Platform.isPhone && !s.dice3dOnPhone) || !dice3dSupported()) return undefined;
		const thrown = diceForRoll(sides, count, rolls, nimble);
		const classDice: Die3d[] = extra.map(x => ({ sides: x.sides, value: x.value, role: 'normal' }));
		// A d100, or more dice than fit on the table, would show faces that contradict the result.
		if (!canRoll3d([...thrown, ...classDice])) return undefined;
		const dice = [...dressDice(this, thrown, outcome === 'crit'), ...this.classDiceLook(dressDice(this, classDice, false))];
		const landed = roll3d(dice, rollOptions(s.dice, rollEvent(sides, rolls.slice(0, count), outcome)))
			.catch((e) => { console.warn('Nimble: 3D dice failed, showing the result only', e); });
		// Dice that never land (a minimised window draws no frames) mustn't hold the result back for good.
		return landedWithin(landed, (6000 + 2000 * Math.max(0, rolls.length - count)) / (s.dice.speed || 1));
	}

	/** Class dice (Judgment Dice…) in their colour and finish from settings, whatever the normal dice look like. */
	private classDiceLook(dice: Die3d[]): Die3d[] {
		const { color, finish } = this.settings.classDice;
		const label = inkOn(color);
		return dice.map(d => ({
			...d, modelUrl: undefined,
			look: d.look ? { ...d.look, body: [color], label, outline: '', edge: '', finish: finish as DieLook['finish'], texture: 'none', textureUrl: undefined } : d.look,
		}));
	}

	/** Record a roll (from the dice roller or the tracker) and show it, after `wait` if given. */
	logRoll(r: Omit<RollLogEntry, 'id' | 'time'>, wait?: Promise<void>): RollLogEntry {
		const entry: RollLogEntry = { id: uid(), time: Date.now(), ...r };
		this.settings.rollLog = [entry, ...(this.settings.rollLog || [])].slice(0, ROLL_LOG_LIMIT);
		void this.saveSettings();
		this.events.trigger('roll-log-changed');

		// Classes go on our own wrapper rather than the notice element, which
		// moved (noticeEl → messageEl) in Obsidian 1.8.7.
		const frag = createFragment(f => {
			const body = f.createDiv({ cls: entry.outcome ? ['nimble-roll-notice', `is-${entry.outcome}`] : 'nimble-roll-notice' });
			body.createDiv({ cls: 'nimble-roll-notice-label', text: entry.label });
			body.createDiv({
				cls: 'nimble-roll-notice-total',
				text: entry.outcome === 'miss' ? 'MISS' : entry.outcome === 'crit' ? `${entry.total} CRIT!` : String(entry.total),
			});
			body.createDiv({ cls: 'nimble-roll-notice-detail', text: `${entry.expression}: ${entry.detail}` });
		});
		const show = () => { new Notice(frag, 6000); };
		if (wait) void wait.then(show); else show();
		return entry;
	}

	clearRollLog(): void {
		this.settings.rollLog = [];
		void this.saveSettings();
		this.events.trigger('roll-log-changed');
	}

	/** Re-render open notes, e.g. after a display setting changes. */
	rerenderNotes(): void {
		this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView) view.previewMode.rerender(true);
		});
		this.pokeEditors();
	}

	/**
	 * A campaign changed sides (or the stat block setting did): every view that
	 * shows monsters or encounter blocks differently for players redraws.
	 * Live Preview keeps rendered code blocks until their text changes, so its
	 * views are rebuilt outright; this only happens on a deliberate switch.
	 */
	refreshSide(): void {
		this.indexVersion++;
		refreshInlineRefs(this);
		this.rerenderNotes();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'source') {
				void (leaf as unknown as { rebuildView?: () => Promise<void> }).rebuildView?.();
			}
		}
	}

	/** Ask every open editor to rebuild its decorations. */
	private pokeEditors(): void {
		this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			editorView(view.editor)?.dispatch({});
		});
	}

	/** Your notes on creatures, by lower-case creature name (notes with `nimble: creature`; the active campaign's win). */
	creatureNotes(): Map<string, TFile> {
		const active = this.settings.activeCampaign;
		const out = new Map<string, TFile>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			if (!fm || String(fm.nimble ?? '').toLowerCase() !== 'creature') continue;
			const k = String(fm.creature ?? f.basename).trim().toLowerCase();
			if (!out.has(k) || (active && f.path.startsWith(`${active}/`))) out.set(k, f);
		}
		return out;
	}

	/** Your notes on one creature, if you've written any. */
	creatureNote(name: string): TFile | null {
		return this.creatureNotes().get(name.trim().toLowerCase()) ?? null;
	}

	/** Open your notes on a creature, making them (in the campaign's Bestiary folder) the first time. */
	async openCreatureNote(name: string): Promise<void> {
		let file = this.creatureNote(name);
		if (!file) {
			const c = this.campaigns.active;
			const folder = normalizePath(c ? `${c.folder}/Bestiary` : 'Bestiary');
			if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder).catch(() => undefined);
			let path = normalizePath(`${folder}/${safeName(name)}.md`);
			for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${safeName(name)} ${i}.md`);
			file = await this.app.vault.create(path, creatureNote(name));
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** GM: the party editor. Player: your character (or a prompt to add one). */
	openParty(): void {
		const c = this.campaigns.active;
		if (c?.role === 'player') {
			const mine = this.campaigns.myCharacter(c);
			if (mine) void this.campaigns.open(mine.path);
			else promptCharacter(this, c, true);
			return;
		}
		new PartyModal(this.app, this).open();
	}

	openSettings(): void {
		openPluginSettings(this.app, this.manifest.id);
	}

	// ------------------------------------------------------------------------
	// Campaigns

	private openingCampaignView: Promise<void> | null = null;

	/** Show the Campaign panel, opening it if needed. Two calls at once still give one panel. */
	openCampaignView(): Promise<void> {
		this.openingCampaignView ??= (async () => {
			// Shown once is enough: don't auto-open a second panel after an update or reload.
			if (!this.settings.campaignPanelShown) { this.settings.campaignPanelShown = true; await this.saveSettings(); }
			let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(CAMPAIGN_VIEW_TYPE)[0] ?? null;
			if (!leaf) {
				leaf = this.app.workspace.getLeftLeaf(false);
				if (!leaf) return;
				await leaf.setViewState({ type: CAMPAIGN_VIEW_TYPE, active: true });
			}
			await this.app.workspace.revealLeaf(leaf);
		})().finally(() => { this.openingCampaignView = null; });
		return this.openingCampaignView;
	}

	newCampaign(): void {
		new NewCampaignModal(this).open();
	}

	// ------------------------------------------------------------------------
	// Bestiary

	async openBestiary(monsterId?: string): Promise<void> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(BESTIARY_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: BESTIARY_VIEW_TYPE, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
		if (monsterId && leaf.view instanceof BestiaryView) leaf.view.select(monsterId);
	}

	/** Open a monster wherever it lives: its note, or the bestiary for bundled ones. */
	openMonster(entry: MonsterIndexEntry, sourcePath = '', newLeaf = false): void {
		if (entry.bundled || !entry.filePath) void this.openBestiary(entry.monster.bundledId);
		else void this.app.workspace.openLinkText(entry.filePath, sourcePath, newLeaf);
	}

	/** Write a monster to an editable note in the vault and open it. */
	async copyMonsterToVault(monster: NimbleMonster): Promise<void> {
		const folder = normalizePath('Bestiary');
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		const safe = monster.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Monster';
		let path = normalizePath(`${folder}/${safe}.md`);
		for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${safe} ${i}.md`);
		const fm = ['---', 'nimble: monster', `level: "${monster.level ?? ''}"`, `role: ${monster.role ?? 'regular'}`];
		if (monster.group) fm.push(`group: "${monster.group.replace(/"/g, '\'')}"`);
		if (monster.source) fm.push(`source: "${monster.source}"`);
		fm.push('---', '');
		const body = `${fm.join('\n')}# ${monster.name}\n\n\`\`\`nimble\n${toStatblockSource(monster)}\n\`\`\`\n`;
		const file = await this.app.vault.create(path, body);
		await this.app.workspace.getLeaf('tab').openFile(file);
		new Notice(`Created ${file.path}. Edits here replace the bestiary version everywhere.`);
	}

	// ------------------------------------------------------------------------
	// Encounters

	getEncounterView(): EncounterTrackerView | null {
		const leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0];
		return leaf?.view instanceof EncounterTrackerView ? leaf.view : null;
	}

	async activateEncounterView(focus = true): Promise<WorkspaceLeaf | null> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: ENCOUNTER_VIEW_TYPE, active: focus });
		}
		if (focus) await this.app.workspace.revealLeaf(leaf);
		return leaf;
	}

	/** Make sure the tracker is visible (even in a collapsed sidebar) without stealing focus. */
	async showTracker(): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0] ?? await this.activateEncounterView(false);
		if (leaf && !leaf.view.containerEl.isShown()) await this.app.workspace.revealLeaf(leaf);
	}

	async addToEncounter(monster: NimbleMonster, sourceFile?: string, count = 1): Promise<void> {
		if (this.settings.multipleEncounters && !this.encounters.active) {
			new Notice('Create or select an encounter first');
			await this.activateEncounterView();
			return;
		}
		const added = this.encounters.add(monster, sourceFile, count);
		if (!added.length) return;
		await this.showTracker();
		new Notice(added.length === 1 && added[0].count !== undefined
			? `${count} × ${monster.name} added (${added[0].alive} in the group)`
			: `Added ${added.map(c => c.label).join(', ')}`);
	}

	openAddMonsterModal(): void {
		new AddMonsterModal(this.app, this).open();
	}

	/** Keep "open source note" links in the tracker working after a file move. */
	private renameSourceFile(oldPath: string, newPath: string): void {
		let changed = false;
		for (const enc of this.settings.encounters) {
			if (enc.sourcePath === oldPath) { enc.sourcePath = newPath; changed = true; }
			for (const c of enc.creatures) {
				if (c.sourceFile === oldPath) { c.sourceFile = newPath; changed = true; }
			}
		}
		if (changed) void this.saveSettings();
	}
}
