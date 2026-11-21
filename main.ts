import { debounce, Events, MarkdownView, normalizePath, Notice, Platform, Plugin, WorkspaceLeaf } from 'obsidian';
import { editorSuggests, editorView, findCommand, openPluginSettings } from './src/core/internals';
import { mergeParty, PartyMember, RollLogEntry, uid } from './src/core/types';
import { EmberVaultSettings, migrateSettings, SettingsPart } from './src/core/settings';
import { InlineRefs, inlineRefsLivePreview } from './src/core/inline-refs';
import { HoverPreview } from './src/core/hover-preview';
import { registerIcons } from './src/core/icons';
import { SlashSuggest } from './src/core/slash';
import { EmberVaultSettingsTab } from './src/app/settings-tab';
import { parseDice, rollDie, rollPlain } from './src/core/dice';
import { DiceKind, rollExplodingAttack } from './src/core/dice-attack';
import { EdgeRollInput, EdgeRollResult, rollEdge } from './src/core/dice-edge';
import { registerEncounterBlocks } from './src/app/encounter-blocks';
import { PartyModal } from './src/core/party';
import { rollToast } from './src/core/roll-toast';
import { registerMapBlock } from './src/app/map-block';
import { CampaignStore } from './src/core/campaigns';
import { registerBoxBlock } from './src/core/box-block';
import { registerNpcCard } from './src/core/npc-card';
import { registerTrackerFollow } from './src/core/tracker/follow';
import { registerNoteCard } from './src/core/note-card';
import { NpcLinker } from './src/core/npc-links';
import { npcLivePreview } from './src/core/npc-live-preview';
import { SpotlightModal } from './src/app/spotlight';
import { registerTables, styleTablesIn } from './src/core/tables';
import { registerTooltips, watchTooltips } from './src/core/tooltips';
import { canRoll3d, dice3dLastStats, dice3dSupported, diceForRoll, landedWithin, roll3d, warm3d } from './src/core/dice3d';
import { dressDice, rollEvent, rollOptions } from './src/core/dice3d/looks';
import type { Die3d } from './src/core/dice3d';
import type { DieLook } from './src/core/dice3d/renderer';
import { inkOn } from './src/core/die-shape';
import type { RollEvent } from './src/core/dice3d/styles';
import { DiceWorkshopModal } from './src/core/dice-workshop';
import { CAMPAIGN_VIEW_TYPE, CampaignBlock, CampaignView } from './src/core/campaign-view';
import { CampaignPicker, NewCampaignModal } from './src/core/campaign-modals';
import { newSceneAnywhere, promptCharacter, promptChapter, promptSectionNote } from './src/core/campaign-ui';
import { registerReadingMode } from './src/core/reading-mode';
import { noteKind } from './src/core/campaign-model';
import { registerBuilderCommands } from './src/core/builder/commands';
import { ContentStore } from './src/core/content/store';
import { ImportContentModal } from './src/core/content/import-modal';
import { registerContentBlocks } from './src/core/content/blocks-ui';
import type { GameSystem } from './src/systems/contract';
import { createSystems } from './src/app/systems';
import { resolveEdition } from './src/systems/registry';

const ROLL_LOG_LIMIT = 30;

const INSERT_LINK = 'editor:insert-link';

export default class EmberVaultPlugin extends Plugin {
	settings: EmberVaultSettings;
	hover: HoverPreview;
	/** Each game system's live state, by id (`runtime('nimble')`), for tools and tests. Systems set it in register(). */
	readonly runtimes = new Map<string, unknown>();
	/** Plugin-wide events: 'roll-log-changed'. */
	events = new Events();
	/** Bumped whenever the monster index changes; Live Preview widgets watch it. */
	indexVersion = 0;
	campaigns!: CampaignStore;
	/** Inline references (`nimble:Goblin`, `5e:Goblin`): each system adds its prefix. */
	readonly inlineRefs = new InlineRefs();
	/** The game systems the plugin knows. Nimble is the default (and, for now, the only one). */
	readonly systems = createSystems();
	/** Content packs in the vault (JSON), for the systems that take them. */
	readonly content = new ContentStore(this);
	/** Bumped when the NPC list changes; Live Preview decorations watch it. */
	npcVersion = 0;
	private wakeLock: WakeLockSentinel | null = null;
	private wakePending = false;
	private settingsTab?: EmberVaultSettingsTab;
	/** data.json couldn't be read and couldn't be copied aside: nothing is saved, so the file isn't overwritten. */
	private settingsReadOnly = false;

	/** Hold a screen wake lock on mobile while a fight is on (any game's: `inCombat`). */
	syncWakeLock(): void {
		const want = Platform.isMobile && this.settings.keepScreenOn && activeDocument.visibilityState === 'visible'
			&& this.systems.all().some(s => s.inCombat?.(this));
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

	/**
	 * Can a lookup from the note `from` (or, with none, the active campaign) see
	 * something written in the note `filePath`? Campaigns keep their monsters to
	 * themselves: one written in a campaign's notes is seen only from that
	 * campaign; one in a loose note, from campaigns you run (and notes outside
	 * any). Bundled monsters (no path) are seen everywhere.
	 */
	canSee(filePath: string, from?: string): boolean {
		const cs = this.campaigns;
		if (!filePath || !cs) return true;
		const here = (from ? cs.of(from) : undefined) ?? cs.active;
		const home = cs.of(filePath);
		if (home) return home.folder === here?.folder;
		return here?.role !== 'player';
	}

	/** A game system's live state (its index, its fight…), for tools and tests. */
	runtime<T = unknown>(id: string): T | undefined {
		return this.runtimes.get(id) as T | undefined;
	}

	/** What references point at changed (an index was rebuilt): redraw every reference pill. */
	refsChanged(): void {
		this.indexVersion++;
		this.inlineRefs.refresh();
		this.pokeEditors();
	}

	/**
	 * The game system for a note: its campaign's, else (outside any campaign, or
	 * with no note) the active campaign's, else the default. The same fallback
	 * as campaigns.role().
	 */
	system(path?: string): GameSystem {
		const campaign = (path ? this.campaigns?.of(path) : undefined) ?? this.campaigns?.active;
		return this.systems.resolve(campaign?.system);
	}

	/** The rules version for a note (same fallback as system()); undefined for a system with one version. */
	edition(path?: string): string | undefined {
		const campaign = (path ? this.campaigns?.of(path) : undefined) ?? this.campaigns?.active;
		return resolveEdition(this.systems.resolve(campaign?.system), campaign?.edition);
	}

	async onload() {
		registerIcons();
		await this.loadSettings();

		this.campaigns = new CampaignStore(this);
		this.hover = new HoverPreview(this);

		this.registerView(CAMPAIGN_VIEW_TYPE, (leaf) => new CampaignView(leaf, this));
		this.addRibbonIcon('castle', 'Campaign', () => this.openCampaignView());
		const trackerRibbon = this.addRibbonIcon('swords', 'Encounter tracker', () => void this.openTracker());
		// The tracker is a GM tool: its ribbon button hides while you're in a campaign you play in.
		const syncRibbon = () => trackerRibbon.toggle(!this.playerView());
		this.registerEvent(this.campaigns.on('changed', syncRibbon));
		// Campaigns you run: the encounter party is read from the campaign's character sheets (when it has any).
		const syncParty = debounce(() => this.syncPartyFromSheets(), 300, true);
		this.registerEvent(this.campaigns.on('changed', syncParty));
		this.registerEvent(this.app.metadataCache.on('changed', (_f, _d, cache) => { if (noteKind(cache.frontmatter ?? {}) === 'character') syncParty(); }));
		syncRibbon();
		this.addRibbonIcon('book-open', 'Compendium', () => void this.openSystemCompendium());
		this.registerHoverLinkSource('nimble-gm', { display: 'Ember Vault', defaultMod: true });

		registerEncounterBlocks(this);
		registerBoxBlock(this);
		registerNpcCard(this);
		registerNoteCard(this);
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
		registerBuilderCommands(this);
		registerReadingMode(this);
		registerTrackerFollow(this);

		// The other game systems wire in their own blocks, references and indexes.
		for (const system of this.systems.all()) system.register?.(this);
		this.content.register();
		registerContentBlocks(this);
		this.addCommand({ id: 'import-content', name: 'Import content…', icon: 'package-plus', callback: () => new ImportContentModal(this).open() });
		this.registerMarkdownPostProcessor((el, ctx) => this.inlineRefs.process(el, ctx.sourcePath));

		// Live Preview + autocomplete
		this.registerEditorExtension(inlineRefsLivePreview(this.inlineRefs, {
			version: () => this.indexVersion,
			// Don't strand a hover card whose reference just got re-rendered.
			onDestroy: (dom) => { if (this.hover.isAnchoredIn(dom)) this.hover.hide(); },
		}));
		this.registerEditorExtension(npcLivePreview(this));
		this.registerEvent(this.campaigns.on('changed', () => { this.npcVersion++; this.pokeEditors(); }));
		const slash = new SlashSuggest(this.app, this);
		this.registerEditorSuggest(slash);
		// Put ours ahead of Obsidian's core "/" menu; it only claims input that matches a Nimble command.
		const suggests = editorSuggests(this.app.workspace);
		if (suggests?.includes(slash)) { suggests.remove(slash); suggests.unshift(slash); }

		this.registerCommands();
		this.settingsTab = new EmberVaultSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		// Phones and tablets: keep the screen awake while combat is running.
		// A game's fight started or ended (systems trigger 'combat-changed').
		this.registerEvent(this.events.on('combat-changed', () => this.syncWakeLock()));
		this.registerDomEvent(activeDocument, 'visibilitychange', () => { this.wakeLock = null; this.syncWakeLock(); });
		this.register(() => { void this.wakeLock?.release().catch(() => undefined); this.wakeLock = null; });
		this.app.workspace.onLayoutReady(() => this.syncWakeLock());


		this.app.workspace.onLayoutReady(async () => {
			this.campaigns.start();
			// First run in a vault with campaigns: show the Campaign panel once.
			if (!this.settings.campaignPanelShown && this.campaigns.campaigns.length) {
				this.settings.campaignPanelShown = true;
				void this.saveSettings();
				if (!this.app.workspace.getLeavesOfType(CAMPAIGN_VIEW_TYPE).length) void this.openCampaignView();
			}
		});
	}

	onunload() {
		this.hover?.hide();
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
		this.addCommand({ id: 'open-tracker', name: 'Open encounter tracker', checkCallback: gm(() => void this.openTracker()) });
		this.addCommand({ id: 'open-bestiary', name: 'Open compendium', icon: 'book-open', callback: () => void this.openSystemCompendium() });
		this.addCommand({ id: 'edit-party', name: 'Edit party…', callback: () => this.openParty() });
		this.addCommand({ id: 'open-settings', name: 'Open settings', callback: () => this.openSettings() });
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
		this.addCommand({ id: 'new-quest', name: 'New quest…', checkCallback: inCampaign(c => promptSectionNote(this, c, 'quest')) });
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

	/** Open Spotlight with `query` already typed (coming back to it from something it opened). */
	openSpotlight(query = ''): void {
		if (this.spotlight) return;
		const modal = this.spotlight = new SpotlightModal(this, () => { if (this.spotlight === modal) this.spotlight = null; });
		modal.open();
		if (query) modal.setQuery(query);
	}

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
		let next: EmberVaultSettings;
		let ok = true;
		try {
			const raw: unknown = await this.loadData();
			// Obsidian hands back nothing for a file it can't parse, the same as for no file at all.
			// Tell them apart, or the next save would quietly replace the damaged file with defaults.
			if (raw == null && await this.settingsFileUnreadable()) throw new Error('data.json is not valid JSON');
			next = migrateSettings(raw, this.settingsParts());
		} catch (e) {
			console.error('Ember Vault: could not read settings', e);
			if (this.settings) return false;
			ok = false;
			next = migrateSettings(null, this.settingsParts());
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

	/** Each game system's part of the settings (its fields' defaults and migration). */
	private settingsParts(): SettingsPart[] {
		return this.systems.all().flatMap(s => (s.settings ? [s.settings] : []));
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
			console.error('Ember Vault: could not copy the unreadable settings file', e);
			return null;
		}
	}

	/** data.json changed outside this window (sync from another device): take it in, so the next save doesn't undo it. */
	async onExternalSettingsChange(): Promise<void> {
		if (!(await this.loadSettings())) return;
		// Each game takes in its part of the settings.
		this.events.trigger('settings-reloaded');
		this.events.trigger('roll-log-changed');
		this.campaigns.trigger('changed');
		(this as unknown as { applyTableStyle?: () => void }).applyTableStyle?.();
		this.settingsTab?.externalChange();
		this.rerenderNotes();
	}

	async saveSettings() {
		// Games drop what they built from settings (Nimble's compendium: custom conditions, drafts…).
		this.events.trigger('settings-saving');
		if (this.settingsReadOnly) return;
		await this.saveData(this.settings);
	}





	// ------------------------------------------------------------------------
	// Rendering




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




	rollDice(expression: string, label: string, kind: DiceKind = 'effect', forced?: number[]): RollLogEntry | null {
		const dice = parseDice(expression);
		if (!dice) {
			new Notice(`Can't roll "${expression}"`);
			return null;
		}
		// Attacks roll the active game's way (Nimble's explode on a max and miss on a 1).
		const nimble = kind === 'attack' && this.system().attackRolls?.(this) === 'exploding';
		// `forced` feeds set values to the roller (the settings' "Test a crit" button).
		const rng = forced ? (() => { let i = 0; return () => (forced[i++ % forced.length] - 0.5) / dice.sides; })() : undefined;
		const result = nimble ? rollExplodingAttack(dice, rng) : rollPlain(dice, rng);
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
		return roll3d(dice, rollOptions(d)).catch((e) => { console.warn('Ember Vault: 3D dice failed', e); });
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
		return { values, landed: roll3d(dressed, rollOptions(d, event)).catch((e) => { console.warn('Ember Vault: 3D dice failed', e); }) };
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
		const nimble = input.attack && this.system().attackRolls?.(this) === 'exploding';
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
			.catch((e) => { console.warn('Ember Vault: 3D dice failed, showing the result only', e); });
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
		// moved (noticeEl → messageEl) in Obsidian 1.8.7. In the look of the game being played.
		const frag = rollToast(entry, this.system(this.app.workspace.getActiveFile()?.path).id);
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
		this.inlineRefs.refresh();
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




	/** GM: the party editor. Player: your character (or a prompt to add one). */
	openParty(): void {
		const c = this.campaigns.active;
		if (c?.role === 'player') {
			const mine = this.campaigns.myCharacter(c);
			if (mine) void this.campaigns.open(mine.path);
			else promptCharacter(this, c, true);
			return;
		}
		// A campaign you run: its party is its character sheets (and any heroes entered by hand), in the Campaign panel.
		if (c) {
			if (this.campaigns.characters(c).length || this.settings.party.length) void this.openCampaignView();
			else promptCharacter(this, c, false);
			return;
		}
		new PartyModal(this.app, this).open();
	}

	/**
	 * The active campaign you run, as an encounter party: a hero for each of its
	 * character sheets, with the sheet's level, max HP, armor and max Wounds, then
	 * any heroes entered by hand that no sheet has replaced yet (mergeParty).
	 * This owns `settings.party` for a campaign you run: the Settings party editor
	 * leaves the sheet heroes read-only, and edits to the others are kept.
	 */
	syncPartyFromSheets(): void {
		const c = this.campaigns?.active;
		if (!c || c.role === 'player') return;
		// Each sheet is read by the campaign's own system (Nimble: armor and Wounds; 5e: AC).
		const characters = this.system(c.folder).characters;
		if (!characters) return;
		const party: PartyMember[] = [];
		for (const h of this.campaigns.characters(c)) {
			const f = this.app.vault.getFileByPath(h.path);
			if (!f) continue;
			party.push(characters.partyMember(this, this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}, f));
		}
		const next = mergeParty(party, this.settings.party);
		if (JSON.stringify(next) === JSON.stringify(this.settings.party)) return;
		this.settings.party = next;
		void this.saveSettings();
		this.events.trigger('party-changed');
		this.campaigns.trigger('changed');
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





	// ------------------------------------------------------------------------
	// Encounters


	/** New character: the active campaign's system's dialog. */
	newCharacter(): void {
		const system = this.system();
		if (system.characters) system.characters.promptNew(this, { mine: true });
		else new Notice(`${system.name} has no characters yet.`);
	}

	/** Your character: the system's own view of it (Nimble's Character panel), else your character note. */
	async openMyCharacter(): Promise<void> {
		const system = this.system();
		if (system.openMyCharacter) { await system.openMyCharacter(this); return; }
		const mine = this.campaigns.myCharacter();
		if (!mine) { new Notice('No character of yours in this campaign yet: make one with "New character".'); return; }
		await this.campaigns.open(mine.path);
	}

	/** The active campaign's compendium. */
	async openSystemCompendium(): Promise<void> {
		const system = this.system();
		if (system.openCompendium) await system.openCompendium(this);
		else new Notice(`${system.name} has no compendium yet.`);
	}

	/** The active campaign's combat tracker. */
	async openTracker(): Promise<void> {
		const system = this.system();
		if (system.openTracker) await system.openTracker(this);
		else new Notice(`${system.name} has no tracker yet.`);
	}





}
