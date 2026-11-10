import { Events, MarkdownView, Menu, normalizePath, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { editorSuggests, editorView, openPluginSettings } from './src/internals';
import {
	DEFAULT_SETTINGS, MonsterIndexEntry, NIMBLE_CONDITIONS, NimbleCondition, NimbleMonster, NimbleStatblocksSettings, normalizeConditions,
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
import { parseDice, rollNimbleAttack, rollPlain } from './src/dice';
import { BestiaryEntry, bestiaryEntries } from './src/bestiary';
import { BESTIARY_VIEW_TYPE, BestiaryView } from './src/bestiary-view';
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
import { registerTables } from './src/tables';
import { registerTooltips } from './src/tooltips';
import { monsterRole, shiftMonster } from './src/rules';
import { dice3dLastStats, dice3dSupported, diceForRoll, roll3d } from './src/dice3d';
import { dressDice, rollEvent, rollOptions } from './src/dice3d/looks';
import type { Die3d } from './src/dice3d';
import type { RollEvent } from './src/dice3d/styles';
import { DiceWorkshopModal } from './src/dice-workshop';
import { migrateDice } from './src/dice3d/styles';
import { CAMPAIGN_VIEW_TYPE, CampaignBlock, CampaignView } from './src/campaign-view';
import { CampaignPicker, NewCampaignModal } from './src/campaign-modals';
import { newSceneAnywhere, promptChapter, promptSectionNote } from './src/campaign-ui';
import BESTIARY from './src/data/bestiary.json';

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
		this.addRibbonIcon('swords', 'Nimble encounter tracker', () => this.activateEncounterView());
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
		this.registerMarkdownCodeBlockProcessor('nimble-campaign', (_source, el, ctx) => ctx.addChild(new CampaignBlock(this, el, ctx)));
		registerMapBlock(this);

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
		this.addSettingTab(new NimbleSettingsTab(this.app, this));

		// Phones and tablets: keep the screen awake while combat is running.
		this.registerEvent(this.encounters.on('changed', () => this.syncWakeLock()));
		this.registerDomEvent(activeDocument, 'visibilitychange', () => { this.wakeLock = null; this.syncWakeLock(); });
		this.register(() => { void this.wakeLock?.release().catch(() => undefined); this.wakeLock = null; });
		this.app.workspace.onLayoutReady(() => this.syncWakeLock());

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
		this.addCommand({ id: 'open-tracker', name: 'Open encounter tracker', callback: () => this.activateEncounterView() });
		this.addCommand({ id: 'open-bestiary', name: 'Open bestiary', callback: () => this.openBestiary() });
		this.addCommand({ id: 'add-monster', name: 'Add monster to encounter…', callback: () => this.openAddMonsterModal() });
		this.addCommand({ id: 'build-encounter', name: 'Build an encounter…', callback: () => new BuilderModal(this).open() });
		this.addCommand({ id: 'edit-party', name: 'Edit party…', callback: () => this.openParty() });
		this.addCommand({ id: 'open-settings', name: 'Open Nimble settings', callback: () => this.openSettings() });
		const withActive = (fn: (encId: string) => void) => (checking: boolean) => {
			const enc = this.encounters.active;
			if (!enc) return false;
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
			callback: () => {
				if (!this.settings.party.length) { new Notice('Set up your party in the plugin settings first.'); return; }
				const n = this.encounters.addParty();
				new Notice(n ? `Added ${n} hero${n === 1 ? '' : 'es'}` : 'The whole party is already in this encounter');
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

	// ------------------------------------------------------------------------
	// Settings

	async loadSettings() {
		const data = ((await this.loadData()) || {}) as Partial<NimbleStatblocksSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		const s = this.settings;
		s.customConditions = s.customConditions || [];
		s.encounters = s.encounters || [];
		s.rollLog = s.rollLog || [];
		s.party = s.party || [];
		s.campaigns = s.campaigns || {};
		s.activeCampaign = s.activeCampaign ?? null;
		// 1.0.4 dice styles; older saves only have per-role colours, which carry over.
		s.dice = migrateDice(data.dice, data);
		for (const k of ['dicePrimaryColor', 'diceColor', 'diceExplosionColor', 'diceMaterialPrimary', 'diceMaterialNormal', 'diceMaterialCrit'] as const) delete s[k];
		// Older conditions were renamed in the 3.2 rules.
		const renamed: Record<string, string> = { Blinded: 'Blind' };
		for (const enc of s.encounters) {
			enc.creatures = enc.creatures || [];
			enc.phase = enc.phase || 'setup';
			enc.log = enc.log || [];
			for (const c of enc.creatures) {
				c.conditions = normalizeConditions(c.conditions).map(x => ({ ...x, name: renamed[x.name] ?? x.name }));
				c.side = c.side || 'monster';
				delete (c as { lrUsed?: number }).lrUsed;
			}
		}
		s.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
	}

	async saveSettings() {
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
		return renderStatblock(container, monster, {
			app: this.app,
			sourcePath,
			variant,
			compact: this.settings.statblockStyle === 'compact',
			onAdd,
			onDice: this.settings.clickableDice ? (el, expr, label, kind) => this.wireDice(el, expr, label, kind) : undefined,
			keywords: this.conditionKeywords(),
			onKeyword: (el, word) => this.wireKeyword(el, word),
			partySize: this.encounters.partySize(this.encounters.active),
			...extra,
		});
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
	monsterActions(entry: MonsterIndexEntry, opts: { inBestiary?: boolean } = {}): StatblockAction[] {
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
	private show3dDice(sides: number, count: number, rolls: number[], nimble: boolean, outcome?: 'miss' | 'crit'): Promise<void> | undefined {
		const s = this.settings;
		if (!s.dice3d || (Platform.isPhone && !s.dice3dOnPhone) || !dice3dSupported()) return undefined;
		const dice = dressDice(this, diceForRoll(sides, count, rolls, nimble), outcome === 'crit');
		return roll3d(dice, rollOptions(s.dice, rollEvent(sides, rolls.slice(0, count), outcome)))
			.catch((e) => { console.warn('Nimble: 3D dice failed, showing the result only', e); });
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

	/** Ask every open editor to rebuild its decorations. */
	private pokeEditors(): void {
		this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			editorView(view.editor)?.dispatch({});
		});
	}

	openParty(): void {
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
