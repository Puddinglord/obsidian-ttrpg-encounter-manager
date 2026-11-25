import { App, Modal, Notice, PluginSettingTab, requireApiVersion, Setting } from 'obsidian';
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import { showSliderValue } from '../core/compat';
import type EmberVaultPlugin from '../../main';
import type { ConditionDef } from '../core/types';
import { drawSections, renderAttribution, SettingsRow as Row, SettingsSection as Section, settingToggle } from '../core/settings-ui';
import { renderPartyEditor } from '../core/party';
import { diceAssignmentRows, diceMotionRows, renderDiceStudio } from '../core/dice-settings';
import { confirmAction } from '../core/touch';
import { FINISHES } from '../core/dice3d/styles';
import { DEFAULT_CONTENT_FOLDER } from '../core/content/store';
import { PackReportModal } from '../core/content/import-modal';
import { openImport } from '../core/import/dialog';
import { packSummary } from '../core/content/packs';

/**
 * Obsidian 1.13 and later read getSettingDefinitions(), which puts these settings
 * in the settings search. Older versions call display(), which draws the same
 * rows the old way.
 */
export class EmberVaultSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: EmberVaultPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.sections().map((section): SettingDefinitionGroup => ({
			type: 'group',
			heading: section.heading,
			cls: section.cls,
			items: section.rows.map((row): SettingDefinition => ({
				name: row.name,
				desc: row.desc,
				visible: row.visible,
				searchable: row.searchable,
				render: (setting) => {
					if (row.cls) setting.setClass(row.cls);
					if (row.block) {
						setting.settingEl.empty();
						setting.settingEl.addClass('nimble-setting-block');
						row.block(setting.settingEl);
					} else row.render?.(setting);
				},
			})),
		}));
	}

	/** Obsidian before 1.13. */
	display(): void {
		this.drawLegacy();
	}

	/** Draws every row into the settings page, for Obsidian before 1.13. */
	private drawLegacy(): void {
		this.containerEl.empty();
		drawSections(this.containerEl, this.sections());
	}

	/** Settings were re-read from disk (another device synced them): redraw the page if it's open. */
	externalChange(): void {
		if (this.containerEl.isConnected) this.refresh();
	}

	/** Redraw after a change that adds, removes or hides rows. */
	private refresh(): void {
		// 1.13+: rebuild the definitions and redraw the open page.
		if (requireApiVersion('1.13.0')) this.update();
		else this.drawLegacy();
	}

	private sections(): Section[] {
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		const toggle = (get: () => boolean, set: (v: boolean) => void, after?: () => void) => settingToggle(this.plugin, get, set, after);
		const systems = this.plugin.systems.all();

		return [
			{ rows: systems.map((sys): Row => ({
				name: `${sys.name} attribution`,
				searchable: false,
				block: (el) => renderAttribution(el, sys.attribution),
			})) },
			{ heading: 'General', rows: [
				{
					name: 'Slash commands',
					desc: 'Your game\'s commands in the / menu.',
					render: toggle(() => s.slashCommands, v => { s.slashCommands = v; }),
				},
				{
					name: 'Open Omnisearch with Cmd/Ctrl+K',
					desc: 'Omnisearch searches adversaries, NPCs and notes, rolls dice and runs commands. Cmd/Ctrl+K is Obsidian\'s Insert Markdown link key: with this on, it opens Omnisearch when no text is selected, and still makes a link when some is. You can also give the Omnisearch command any key under Hotkeys.',
					render: toggle(() => s.spotlightKey, v => { s.spotlightKey = v; }, () => this.plugin.campaigns.trigger('changed')), // the Campaign panel's search bar shows the key
				},
				{
					name: 'Theme Obsidian to match the game',
					desc: 'Notes, sidebars and tabs take the colours and headings of the game your active campaign plays.',
					render: toggle(() => s.appLook, v => { s.appLook = v; }, () => this.plugin.applyAppLook()),
				},
				{
					name: 'Styled tables',
					desc: 'Applies to every table in your notes.',
					render: toggle(() => s.styleTables, v => { s.styleTables = v; }, () => this.containerEl.doc.body.toggleClass('nimble-tables', s.styleTables)),
				},
			] },
			{ heading: 'Campaigns', rows: [
				{
					name: 'Campaigns folder',
					desc: 'Where New campaign creates folders.',
					render: (setting) => {
						setting.addText(t => t.setPlaceholder('Campaigns').setValue(s.campaignsFolder).onChange(async (v) => {
							s.campaignsFolder = v.trim() || 'Campaigns';
							await save();
						}));
					},
				},
				{
					name: 'Link NPC names as you read',
					desc: 'Notes with "nimble: npc" (or #npc) are linked wherever they\'re mentioned. Files aren\'t changed.',
					render: toggle(() => s.autoLinkNpcs, v => { s.autoLinkNpcs = v; }, () => this.plugin.rerenderNotes()),
				},
				{
					name: 'Open campaign pages in reading view',
					desc: 'Characters, chapters, scenes, NPCs, locations, quests, maps and handouts open ready to read; use Obsidian\'s edit button to change them. Session logs and notes you\'ve just made open for editing as usual.',
					render: toggle(() => s.readingView, v => { s.readingView = v; }),
				},
				{
					name: 'Properties as tags',
					desc: 'In reading view, a campaign note\'s properties show as a tidy row of tags instead of the Properties form. Switch to editing to change them.',
					render: toggle(() => s.tagProperties, v => { s.tagProperties = v; }, () => this.plugin.campaigns.trigger('changed')),
				},
				{
					name: 'Stat blocks in campaigns you play in',
					desc: 'In a player campaign, monsters show as lore cards (what your hero could know) instead of stat blocks. Turn this on if you don\'t mind spoilers.',
					render: toggle(() => s.playerStatblocks, v => { s.playerStatblocks = v; }, () => { this.plugin.refreshSide(); this.plugin.campaigns.trigger('changed'); }),
				},
			] },
			{ heading: 'Party', rows: this.partyRows() },
			{ heading: 'Content packs', rows: [
				{
					name: 'Content folder',
					desc: 'JSON files here add monsters, spells, subclasses and more to a game. A campaign can pick its packs with "packs:" on its home note.',
					render: (setting) => {
						setting.addText(t => t.setPlaceholder(DEFAULT_CONTENT_FOLDER).setValue(s.contentFolder ?? '').onChange(async (v) => {
							s.contentFolder = v.trim() || undefined;
							await save();
							void this.plugin.content.load();
						}));
						setting.addButton(b => b.setButtonText('Import…').onClick(() => openImport(this.plugin)));
					},
				},
				{
					name: 'Packs',
					block: (el) => renderPackList(el, this.plugin),
				},
				{
					name: 'Mapping files',
					desc: `Teach Import… another tool's format. Put them in ${this.plugin.mappings.folder()}.`,
					block: (el) => renderMappingList(el, this.plugin),
				},
			] },
			{ heading: 'Dice', rows: [
				{
					name: 'Clickable dice',
					render: toggle(() => s.clickableDice, v => { s.clickableDice = v; }, () => this.plugin.rerenderNotes()),
				},
				{
					name: 'Class dice',
					desc: 'Dice a class gains and spends: their colour on the sheet and how they look in 3D.',
					render: (setting: Setting) => {
						setting.addColorPicker(c => c.setValue(s.classDice.color).onChange(async (v) => { s.classDice.color = v; await save(); this.plugin.rerenderNotes(); }));
						setting.addDropdown(d => {
							for (const f of FINISHES) d.addOption(f.id, f.label);
							d.setValue(s.classDice.finish).onChange(async (v) => { s.classDice.finish = v; await save(); });
						});
					},
				},
				{
					name: '3D dice',
					render: toggle(() => s.dice3d, v => { s.dice3d = v; }, () => this.refresh()),
				},
				{
					name: '3D dice on phones',
					desc: 'Phones show just the result notice unless this is on. Tablets and computers always get 3D dice.',
					visible: () => s.dice3d,
					render: toggle(() => s.dice3dOnPhone, v => { s.dice3dOnPhone = v; }),
				},
				...this.diceRows(),
			] },
			{ heading: 'Combat', rows: [
				{
					name: 'Keep the screen on during combat',
					desc: 'Phones and tablets, while combat is running.',
					render: toggle(() => s.keepScreenOn, v => { s.keepScreenOn = v; }, () => this.plugin.syncWakeLock()),
				},
			] },
			...systems.flatMap(sys => sys.settingsSections?.(this.plugin) ?? []),
			...this.conditionSections(),
		];
	}

	private partyRows(): Row[] {
		return [
			{
				name: 'Campaign party',
				searchable: false,
				visible: () => !!this.plugin.campaigns?.active,
				block: (el) => {
					const camp = this.plugin.campaigns?.active;
					if (camp) el.createEl('p', { cls: 'setting-item-description', text: `Party for ${camp.name}` });
				},
			},
			{
				name: 'Heroes',
				desc: 'Names, classes, levels, HP, defense and wounds for the party.',
				block: (el) => renderPartyEditor(el, this.plugin, () => this.refresh()),
			},
			{
				name: 'Party size when no party is set',
				desc: 'Used until heroes are added.',
				render: (setting) => {
					setting.addSlider(sl => showSliderValue(sl.setLimits(1, 8, 1).setValue(this.plugin.settings.defaultPartySize))
						.onChange(async v => {
							this.plugin.settings.defaultPartySize = v;
							await this.plugin.saveSettings();
							this.plugin.events.trigger('party-changed');
						}));
				},
			},
		];
	}

	private diceRows(): Row[] {
		const visible = () => this.plugin.settings.dice3d;
		return [
			{
				name: 'Dice looks', searchable: false, visible,
				block: (el) => renderDiceStudio(el, this.plugin, () => this.refresh()),
			},
			...diceAssignmentRows(this.plugin, visible, () => this.refresh()),
			...diceMotionRows(this.plugin, visible),
		];
	}

	private conditionSections(): Section[] {
		let name = '';
		let desc = '';
		const add: Section = { heading: 'Custom conditions', cls: 'custom-condition-add', rows: [
			{ name: 'Condition name', render: (setting) => { setting.addText(t => t.setPlaceholder('e.g., Burning').onChange(v => { name = v; })); } },
			{ name: 'Description', render: (setting) => {
				setting.addTextArea(t => t
					.setPlaceholder('e.g., Takes 1d6 fire damage at the start of each turn.')
					.onChange(v => { desc = v; }));
			} },
			{
				name: '',
				searchable: false,
				render: (setting) => {
					setting.addButton(btn => btn
						.setButtonText('Add condition')
						.setCta()
						.onClick(async () => {
							const trimmed = name.trim();
							if (!trimmed) { new Notice('Please enter a condition name'); return; }
							if (this.knownConditions().some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
								new Notice('A condition with this name already exists');
								return;
							}
							this.plugin.settings.customConditions.push({ name: trimmed, description: desc.trim() || 'No description provided.' });
							await this.plugin.saveSettings();
							this.refresh();
							new Notice(`Added condition: ${trimmed}`);
						}));
				},
			},
		] };

		const custom = this.plugin.settings.customConditions;
		if (!custom.length) return [add];
		const list: Section = { cls: 'custom-conditions-list', rows: custom.map((condition, i) => ({
			name: condition.name,
			desc: condition.description,
			render: (setting) => {
				setting
					.addExtraButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => this.openEditModal(i)))
					.addExtraButton(b => b.setIcon('trash').setTooltip('Delete').onClick(async () => {
						if (!(await confirmAction(this.app, `Delete "${condition.name}"?`, 'Combatants that already have it keep it.', 'Delete', true))) return;
						const at = custom.indexOf(condition);
						if (at < 0) return;
						custom.splice(at, 1);
						await this.plugin.saveSettings();
						this.refresh();
						new Notice(`Deleted condition: ${condition.name}`);
					}));
			},
		})) };
		return [add, list];
	}

	/** The active game's conditions and the ones added here. */
	private knownConditions(): readonly ConditionDef[] {
		return [...this.plugin.system().conditions(), ...this.plugin.settings.customConditions];
	}

	private openEditModal(index: number): void {
		const custom = this.plugin.settings.customConditions;
		const condition = custom[index];
		if (!condition) return;
		new EditConditionModal(this.app, condition, async (name, description) => {
			const others = [...this.plugin.system().conditions(), ...custom.filter((_, i) => i !== index)];
			if (others.some(c => c.name.toLowerCase() === name.toLowerCase())) {
				new Notice('A condition with this name already exists');
				return false;
			}
			// Keep what it does each turn (set in a tracker's condition editor).
			custom[index] = { ...condition, name, description };
			await this.plugin.saveSettings();
			this.refresh();
			new Notice(`Updated condition: ${name}`);
			return true;
		}).open();
	}
}

class EditConditionModal extends Modal {
	private nameValue: string;
	private descValue: string;

	constructor(app: App, condition: ConditionDef, private onSave: (name: string, description: string) => Promise<boolean>) {
		super(app);
		this.nameValue = condition.name;
		this.descValue = condition.description;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText('Edit condition');
		new Setting(contentEl).setName('Name').addText(t => t.setValue(this.nameValue).onChange(v => { this.nameValue = v; }));
		new Setting(contentEl).setName('Description').addTextArea(t => t.setValue(this.descValue).onChange(v => { this.descValue = v; }));
		new Setting(contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Save').setCta().onClick(async () => {
				if (!this.nameValue.trim()) { new Notice('Please enter a condition name'); return; }
				// Keep the modal open when the save is rejected (e.g. duplicate name).
				if (await this.onSave(this.nameValue.trim(), this.descValue.trim() || 'No description provided.')) this.close();
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** The packs in the content folder: each one's game and what it adds, and a click for what was left out. */
function renderMappingList(el: HTMLElement, plugin: EmberVaultPlugin): void {
	const list = el.createDiv({ cls: 'nimble-pack-list' });
	const draw = () => {
		list.empty();
		const files = plugin.mappings.reports();
		if (!files.length) { list.createDiv({ cls: 'nimble-pack-empty', text: 'None yet.' }); return; }
		for (const m of files) {
			const row = list.createDiv({ cls: `nimble-pack-row${m.errors.length ? ' is-error' : ''}` });
			const text = row.createDiv({ cls: 'nimble-pack-text' });
			text.createDiv({ cls: 'nimble-pack-name', text: m.label ?? m.file?.replace(/^.*\//, '') ?? '' });
			text.createDiv({ cls: 'nimble-pack-summary', text: m.errors.length ? m.errors.join(' ') : `Reads ${m.label ?? 'its format'} in Import…` });
		}
	};
	draw();
	const ref = plugin.mappings.on('changed', () => { if (!list.isConnected) plugin.mappings.offref(ref); else draw(); });
}

function renderPackList(el: HTMLElement, plugin: EmberVaultPlugin): void {
	const list = el.createDiv({ cls: 'nimble-pack-list' });
	const draw = () => {
		list.empty();
		const packs = plugin.content.all();
		if (!packs.length) { list.createDiv({ cls: 'nimble-pack-empty', text: `No packs yet. Put a pack's .json file in ${plugin.content.folder()}, or use Import….` }); return; }
		for (const p of packs) {
			const row = list.createDiv({ cls: `nimble-pack-row${p.error ? ' is-error' : p.rejected.length ? ' is-partial' : ''}` });
			const text = row.createDiv({ cls: 'nimble-pack-text' });
			text.createDiv({ cls: 'nimble-pack-name', text: `${p.name}${p.system ? ` · ${plugin.systems.get(p.system)?.name ?? p.system}${p.edition ? ` ${p.edition}` : ''}` : ''}` });
			text.createDiv({ cls: 'nimble-pack-summary', text: packSummary(p) });
			if (p.error || p.rejected.length || p.warnings.length) {
				const b = row.createEl('button', { text: 'Details' });
				b.addEventListener('click', () => new PackReportModal(plugin.app, p).open());
			}
		}
	};
	draw();
	const ref = plugin.content.on('changed', () => { if (!list.isConnected) plugin.content.offref(ref); else draw(); });
}
