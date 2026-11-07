import { App, Modal, Notice, PluginSettingTab, requireApiVersion, Setting } from 'obsidian';
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import { showSliderValue } from './compat';
import type NimbleStatblocksPlugin from '../main';
import { NIMBLE_CONDITIONS, NimbleCondition } from './types';
import { renderPartyEditor } from './party';
import { DICE3D_MATERIALS } from './dice3d';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';

/** One settings row. `block` rows draw their own content instead of a name and controls. */
interface Row {
	name: string;
	desc?: string;
	visible?: () => boolean;
	searchable?: boolean;
	cls?: string;
	render?: (setting: Setting) => void;
	block?: (el: HTMLElement) => void;
}
interface Section { heading?: string; cls?: string; rows: Row[] }

/**
 * Obsidian 1.13 and later read getSettingDefinitions(), which puts these settings
 * in the settings search. Older versions call display(), which draws the same
 * rows the old way.
 */
export class NimbleSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
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
		const { containerEl } = this;
		containerEl.empty();
		for (const section of this.sections()) {
			if (section.heading) new Setting(containerEl).setName(section.heading).setHeading();
			const parent = section.cls ? containerEl.createDiv({ cls: section.cls }) : containerEl;
			for (const row of section.rows) {
				if (row.visible && !row.visible()) continue;
				if (row.block) { row.block(parent); continue; }
				const setting = new Setting(parent);
				if (row.name) setting.setName(row.name);
				if (row.desc) setting.setDesc(row.desc);
				if (row.cls) setting.setClass(row.cls);
				row.render?.(setting);
			}
		}
	}

	/** Redraw after a change that adds, removes or hides rows. */
	private refresh(): void {
		// 1.13+: rebuild the definitions and redraw the open page.
		if (requireApiVersion('1.13.0')) this.update();
		else this.display();
	}

	private sections(): Section[] {
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		const toggle = (get: () => boolean, set: (v: boolean) => void, after?: () => void) => (setting: Setting) => {
			setting.addToggle(t => t.setValue(get()).onChange(async (v) => { set(v); await save(); after?.(); }));
		};

		return [
			{ rows: [{
				name: 'Nimble attribution',
				searchable: false,
				block: (el) => {
					const notice = el.createDiv({ cls: 'nimble-notice' });
					notice.createDiv({ text: NIMBLE_ATTRIBUTION });
					const support = notice.createDiv({ text: `${NIMBLE_SUPPORT_NOTICE.replace(' at nimbleRPG.com.', '')} ` });
					support.createEl('a', { text: 'nimbleRPG.com', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
				},
			}] },
			{ heading: 'Bestiary', rows: [
				{
					name: 'Include the Nimble bestiary',
					desc: 'Over 500 monsters from the GM Guide and Monsters & More, searchable in the bestiary and usable anywhere with nimble: references. A note in your vault with the same name replaces the bundled version.',
					render: toggle(() => s.bundledBestiary, v => { s.bundledBestiary = v; }, () => this.plugin.loadBundledBestiary()),
				},
				{
					name: 'Nimble slash commands',
					desc: 'Nimble commands in the / menu.',
					render: toggle(() => s.slashCommands, v => { s.slashCommands = v; }),
				},
			] },
			{ heading: 'Campaigns', rows: [
				{
					name: 'Campaigns folder',
					desc: 'Where New campaign creates folders.',
					render: (setting) => setting.addText(t => t.setPlaceholder('Campaigns').setValue(s.campaignsFolder).onChange(async (v) => {
						s.campaignsFolder = v.trim() || 'Campaigns';
						await save();
					})),
				},
				{
					name: 'Link NPC names as you read',
					desc: 'Notes with "nimble: npc" (or #npc) are linked wherever they\'re mentioned. Files aren\'t changed.',
					render: toggle(() => s.autoLinkNpcs, v => { s.autoLinkNpcs = v; }, () => this.plugin.rerenderNotes()),
				},
			] },
			{ heading: 'Party', rows: this.partyRows() },
			{ heading: 'Notes', rows: [
				{
					name: 'Styled tables',
					desc: 'Applies to every table in your notes.',
					render: toggle(() => s.styleTables, v => { s.styleTables = v; }, () => this.containerEl.doc.body.toggleClass('nimble-tables', s.styleTables)),
				},
			] },
			{ heading: 'Stat blocks', rows: [
				{
					name: 'Stat block style',
					render: (setting) => setting.addDropdown(d => d
						.addOption('book', 'Book')
						.addOption('compact', 'Compact')
						.setValue(s.statblockStyle)
						.onChange(async (v) => {
							s.statblockStyle = v as 'book' | 'compact';
							await save();
							this.plugin.rerenderNotes();
						})),
				},
				{
					name: 'Clickable dice',
					render: toggle(() => s.clickableDice, v => { s.clickableDice = v; }, () => this.plugin.rerenderNotes()),
				},
				{
					name: 'Nimble attack rolls',
					desc: 'Attack dice miss on 1 and explode on max.',
					render: toggle(() => s.nimbleAttackRolls, v => { s.nimbleAttackRolls = v; }, () => this.plugin.rerenderNotes()),
				},
				{
					name: '3D dice',
					render: toggle(() => s.dice3d, v => { s.dice3d = v; }, () => this.refresh()),
				},
				...this.diceRows(),
				{
					name: 'Keep the screen on during combat',
					desc: 'Phones and tablets, while combat is running.',
					render: toggle(() => s.keepScreenOn, v => { s.keepScreenOn = v; }, () => this.plugin.syncWakeLock()),
				},
			] },
			{ heading: 'Encounters', rows: [
				{
					name: 'Multiple encounters',
					render: toggle(() => s.multipleEncounters, v => { s.multipleEncounters = v; }, () => this.plugin.encounters.trigger('changed')),
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
			] },
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
				render: (setting) => setting.addSlider(sl => showSliderValue(sl.setLimits(1, 8, 1).setValue(this.plugin.settings.defaultPartySize))
					.onChange(async v => {
						this.plugin.settings.defaultPartySize = v;
						await this.plugin.saveSettings();
						this.plugin.encounters.trigger('changed');
					})),
			},
		];
	}

	private diceRows(): Row[] {
		const s = this.plugin.settings;
		const visible = () => s.dice3d;
		type ColourKey = 'dicePrimaryColor' | 'diceColor' | 'diceExplosionColor';
		type MaterialKey = 'diceMaterialPrimary' | 'diceMaterialNormal' | 'diceMaterialCrit';
		const role = (name: string, colourKey: ColourKey, materialKey: MaterialKey): Row => ({
			name, visible, cls: 'nimble-dice-colour',
			render: (setting) => setting
				.addDropdown(d => {
					for (const m of DICE3D_MATERIALS) d.addOption(m.id, m.label);
					d.setValue(s[materialKey]).onChange(async (v) => { s[materialKey] = v; await this.plugin.saveSettings(); });
				})
				.addColorPicker(c => c.setValue(s[colourKey]).onChange(async (v) => {
					s[colourKey] = v;
					await this.plugin.saveSettings();
				})),
		});
		return [
			role('Primary die', 'dicePrimaryColor', 'diceMaterialPrimary'),
			role('Other dice', 'diceColor', 'diceMaterialNormal'),
			role('Crit dice', 'diceExplosionColor', 'diceMaterialCrit'),
			{
				name: '',
				searchable: false,
				visible, cls: 'nimble-dice-colour',
				render: (setting) => setting
					.addButton(b => b.setButtonText('Test roll: 2d6 attack').onClick(() => this.plugin.rollDice('2d6+2', 'Test roll', 'attack')))
					.addButton(b => b.setButtonText('Test a crit').onClick(() => this.plugin.rollDice('2d6+2', 'Test crit', 'attack', [6, 3, 6, 2]))),
			},
		];
	}

	private conditionSections(): Section[] {
		let name = '';
		let desc = '';
		const add: Section = { heading: 'Custom conditions', cls: 'custom-condition-add', rows: [
			{ name: 'Condition name', render: (setting) => setting.addText(t => t.setPlaceholder('e.g., Burning').onChange(v => { name = v; })) },
			{ name: 'Description', render: (setting) => setting.addTextArea(t => t
				.setPlaceholder('e.g., Takes 1d6 fire damage at the start of each turn.')
				.onChange(v => { desc = v; })) },
			{
				name: '',
				searchable: false,
				render: (setting) => setting.addButton(btn => btn
					.setButtonText('Add condition')
					.setCta()
					.onClick(async () => {
						const trimmed = name.trim();
						if (!trimmed) { new Notice('Please enter a condition name'); return; }
						if (this.plugin.getAllConditions().some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
							new Notice('A condition with this name already exists');
							return;
						}
						this.plugin.settings.customConditions.push({ name: trimmed, description: desc.trim() || 'No description provided.' });
						await this.plugin.saveSettings();
						this.refresh();
						new Notice(`Added condition: ${trimmed}`);
					})),
			},
		] };

		const custom = this.plugin.settings.customConditions;
		if (!custom.length) return [add];
		const list: Section = { cls: 'custom-conditions-list', rows: custom.map((condition, i) => ({
			name: condition.name,
			desc: condition.description,
			render: (setting) => setting
				.addExtraButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => this.openEditModal(i)))
				.addExtraButton(b => b.setIcon('trash').setTooltip('Delete').onClick(async () => {
					custom.splice(i, 1);
					await this.plugin.saveSettings();
					this.refresh();
					new Notice(`Deleted condition: ${condition.name}`);
				})),
		})) };
		return [add, list];
	}

	private openEditModal(index: number): void {
		const custom = this.plugin.settings.customConditions;
		const condition = custom[index];
		if (!condition) return;
		new EditConditionModal(this.app, condition, async (name, description) => {
			const others = [...NIMBLE_CONDITIONS, ...custom.filter((_, i) => i !== index)];
			if (others.some(c => c.name.toLowerCase() === name.toLowerCase())) {
				new Notice('A condition with this name already exists');
				return false;
			}
			custom[index] = { name, description };
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

	constructor(app: App, condition: NimbleCondition, private onSave: (name: string, description: string) => Promise<boolean>) {
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
