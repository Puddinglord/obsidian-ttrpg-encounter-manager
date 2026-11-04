import { Events, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import {
	DEFAULT_SETTINGS, NIMBLE_CONDITIONS, NimbleCondition, NimbleMonster, NimbleStatblocksSettings, RollLogEntry, uid,
} from './src/types';
import { parseStatblock } from './src/parser';
import { DiceKind, renderStatblock } from './src/render';
import { MonsterIndex } from './src/monster-index';
import { EncounterStore } from './src/encounters';
import { ENCOUNTER_VIEW_TYPE, EncounterTrackerView } from './src/tracker-view';
import { createInlineRef, HoverPreview, parseInlineRef, refreshInlineRefs } from './src/inline-ref';
import { inlineRefLivePreview } from './src/live-preview';
import { AddMonsterModal, InlineRefSuggest } from './src/suggest';
import { NimbleSettingsTab } from './src/settings-tab';
import { parseDice, rollNimbleAttack, rollPlain } from './src/dice';

const ROLL_LOG_LIMIT = 30;

const MONSTER_TEMPLATE = `\`\`\`nimble
name: Monster
type: Beast
size: Medium
level: 1
armor: none
hp: 20
movement: 6
str: +
dex: +
will: -
attacks:
- Bite 1d6 piercing
abilities:
- Keen Senses: Advantage on Perception
\`\`\`
`;

const SOLO_TEMPLATE = `\`\`\`nimble
name: Solo Monster
monsterType: solo
level: 5
size: Large
type: Dragon
armor: medium
hp: 100
movement: 8, fly 12
str: ++
dex: +
will: +
legendaryResistances: 3
attacks:
- **Claw.** 2d8 slashing
- **Breath.** 6d6 fire, Dex save for half
abilities:
- Terrifying Presence: Creatures that start their turn within 6 spaces make a Will save or are Frightened
bloodied: The monster roars and its next attack deals double damage
lastStand: The monster lashes out at every adjacent creature for 3d6
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

	async onload() {
		await this.loadSettings();

		this.index = new MonsterIndex(this.app);
		this.encounters = new EncounterStore(() => this.settings, () => this.saveSettings());
		this.hover = new HoverPreview(this);

		this.registerView(ENCOUNTER_VIEW_TYPE, (leaf) => new EncounterTrackerView(leaf, this));
		this.addRibbonIcon('swords', 'Nimble encounter tracker', () => this.activateEncounterView());
		this.registerHoverLinkSource('nimble-statblocks', { display: 'Nimble Statblocks', defaultMod: true });

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
		this.registerEditorSuggest(new InlineRefSuggest(this.app, this));

		this.registerCommands();
		this.addSettingTab(new NimbleSettingsTab(this.app, this));

		this.registerEvent(this.index.on('changed', () => {
			this.indexVersion++;
			refreshInlineRefs(this);
			this.pokeEditors();
		}));

		this.app.workspace.onLayoutReady(async () => {
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

	private registerCommands(): void {
		this.addCommand({ id: 'open-tracker', name: 'Open encounter tracker', callback: () => this.activateEncounterView() });
		this.addCommand({ id: 'add-monster', name: 'Add monster to encounter…', callback: () => this.openAddMonsterModal() });
		this.addCommand({
			id: 'next-round',
			name: 'Next round',
			checkCallback: (checking) => {
				const enc = this.encounters.active;
				if (!enc) return false;
				if (!checking) this.encounters.setRound(enc.id, (enc.round ?? 1) + 1);
				return true;
			},
		});
		this.addCommand({
			id: 'insert-template',
			name: 'Insert monster template',
			editorCallback: (editor) => editor.replaceSelection(MONSTER_TEMPLATE),
		});
		this.addCommand({
			id: 'insert-solo-template',
			name: 'Insert solo monster template',
			editorCallback: (editor) => editor.replaceSelection(SOLO_TEMPLATE),
		});
		this.addCommand({
			id: 'insert-reference',
			name: 'Insert monster reference',
			editorCallback: (editor) => editor.replaceSelection('`nimble:'),
		});
		this.addCommand({ id: 'clear-roll-log', name: 'Clear roll log', callback: () => this.clearRollLog() });
	}

	// ------------------------------------------------------------------------
	// Settings

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.customConditions = this.settings.customConditions || [];
		this.settings.encounters = this.settings.encounters || [];
		this.settings.rollLog = this.settings.rollLog || [];
		for (const enc of this.settings.encounters) {
			enc.creatures = enc.creatures || [];
			for (const c of enc.creatures) c.conditions = c.conditions || [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getAllConditions(): NimbleCondition[] {
		return [...NIMBLE_CONDITIONS, ...(this.settings.customConditions || [])];
	}

	// ------------------------------------------------------------------------
	// Rendering

	renderStatblock(
		container: HTMLElement,
		monster: NimbleMonster,
		sourcePath: string,
		variant: 'block' | 'inline' | 'hover',
		onAdd?: (ev: MouseEvent) => void,
	): HTMLElement {
		return renderStatblock(container, monster, {
			app: this.app,
			sourcePath,
			variant,
			compact: this.settings.statblockStyle === 'compact',
			onAdd,
			onDice: this.settings.clickableDice ? (el, expr, label, kind) => this.wireDice(el, expr, label, kind) : undefined,
		});
	}

	private wireDice(el: HTMLElement, expression: string, label: string, kind: DiceKind): void {
		el.addClass('is-clickable');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		el.setAttr('aria-label', `Roll ${expression}${label ? ` for ${label}` : ''}`);
		const nimble = kind === 'attack' && this.settings.nimbleAttackRolls;
		el.setAttr('title', nimble ? `Roll ${expression} (Nimble attack: 1 misses, max crits)` : `Roll ${expression}`);
		const roll = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			this.rollDice(expression, label, kind);
		};
		el.addEventListener('click', roll);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') roll(e); });
	}

	rollDice(expression: string, label: string, kind: DiceKind = 'effect'): RollLogEntry | null {
		const dice = parseDice(expression);
		if (!dice) {
			new Notice(`Can't roll "${expression}"`);
			return null;
		}
		const result = kind === 'attack' && this.settings.nimbleAttackRolls ? rollNimbleAttack(dice) : rollPlain(dice);
		const entry: RollLogEntry = {
			id: uid(),
			time: Date.now(),
			label: label || result.expression,
			expression: result.expression,
			total: result.total,
			detail: result.detail,
			outcome: result.outcome,
		};
		this.settings.rollLog = [entry, ...(this.settings.rollLog || [])].slice(0, ROLL_LOG_LIMIT);
		void this.saveSettings();
		this.events.trigger('roll-log-changed');

		const frag = createFragment(f => {
			f.createDiv({ cls: 'nimble-roll-notice-label', text: entry.label });
			f.createDiv({
				cls: 'nimble-roll-notice-total',
				text: entry.outcome === 'miss' ? 'MISS' : entry.outcome === 'crit' ? `${entry.total} CRIT!` : String(entry.total),
			});
			f.createDiv({ cls: 'nimble-roll-notice-detail', text: `${entry.expression}: ${entry.detail}` });
		});
		const notice = new Notice(frag, 6000);
		notice.noticeEl.addClass('nimble-roll-notice');
		if (entry.outcome) notice.noticeEl.addClass(`is-${entry.outcome}`);
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const cm = (view.editor as any)?.cm as EditorView | undefined;
			cm?.dispatch({});
		});
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

	async addToEncounter(monster: NimbleMonster, sourceFile?: string, count = 1): Promise<void> {
		if (this.settings.multipleEncounters && !this.encounters.active) {
			new Notice('Create or select an encounter first');
			await this.activateEncounterView();
			return;
		}
		const added = this.encounters.add(monster, sourceFile, count);
		if (!added.length) return;
		// Make sure the tracker is visible (even in a collapsed sidebar) without
		// pulling keyboard focus away from the note.
		const leaf = this.app.workspace.getLeavesOfType(ENCOUNTER_VIEW_TYPE)[0] ?? await this.activateEncounterView(false);
		if (leaf && !leaf.view.containerEl.isShown()) await this.app.workspace.revealLeaf(leaf);
		new Notice(`Added ${added.map(c => c.label).join(', ')}`);
	}

	openAddMonsterModal(): void {
		new AddMonsterModal(this.app, this).open();
	}

	/** Keep "open source note" links in the tracker working after a file move. */
	private renameSourceFile(oldPath: string, newPath: string): void {
		let changed = false;
		for (const enc of this.settings.encounters) {
			for (const c of enc.creatures) {
				if (c.sourceFile === oldPath) { c.sourceFile = newPath; changed = true; }
			}
		}
		if (changed) void this.saveSettings();
	}
}
