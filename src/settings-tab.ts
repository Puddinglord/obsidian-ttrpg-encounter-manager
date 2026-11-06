import { App, Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { NIMBLE_CONDITIONS, NimbleCondition } from './types';
import { renderPartyEditor } from './party';
import { DICE3D_MATERIALS } from './dice3d';
import { NIMBLE_ATTRIBUTION, NIMBLE_STORE_URL, NIMBLE_SUPPORT_NOTICE } from './bestiary';

export class NimbleSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const notice = containerEl.createDiv({ cls: 'nimble-notice' });
		notice.createDiv({ text: NIMBLE_ATTRIBUTION });
		const support = notice.createDiv({ text: `${NIMBLE_SUPPORT_NOTICE.replace(' at nimbleRPG.com.', '')} ` });
		support.createEl('a', { text: 'nimbleRPG.com', href: NIMBLE_STORE_URL, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });

		new Setting(containerEl).setName('Bestiary').setHeading();

		new Setting(containerEl)
			.setName('Include the Nimble bestiary')
			.setDesc(`Over 500 monsters from the GM Guide and Monsters & More, searchable in the bestiary and usable anywhere with nimble: references. A note in your vault with the same name replaces the bundled version.`)
			.addToggle(t => t
				.setValue(this.plugin.settings.bundledBestiary)
				.onChange(async (v) => {
					this.plugin.settings.bundledBestiary = v;
					await this.plugin.saveSettings();
					this.plugin.loadBundledBestiary();
				}));

		new Setting(containerEl)
			.setName('Nimble slash commands')
			.setDesc('Nimble commands in the / menu.')
			.addToggle(t => t
				.setValue(this.plugin.settings.slashCommands)
				.onChange(async (v) => { this.plugin.settings.slashCommands = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl).setName('Campaigns').setHeading();
		new Setting(containerEl)
			.setName('Campaigns folder')
			.setDesc('Where New campaign creates folders.')
			.addText(t => t.setPlaceholder('Campaigns').setValue(this.plugin.settings.campaignsFolder).onChange(async (v) => {
				this.plugin.settings.campaignsFolder = v.trim() || 'Campaigns';
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Link NPC names as you read')
			.setDesc('Notes with "nimble: npc" (or #npc) are linked wherever they\'re mentioned. Files aren\'t changed.')
			.addToggle(t => t.setValue(this.plugin.settings.autoLinkNpcs).onChange(async (v) => {
				this.plugin.settings.autoLinkNpcs = v;
				await this.plugin.saveSettings();
				this.plugin.rerenderNotes();
			}));

		new Setting(containerEl).setName('Party').setHeading();
		this.renderParty(containerEl);

		new Setting(containerEl).setName('Notes').setHeading();
		new Setting(containerEl)
			.setName('Styled tables')
			.setDesc('Applies to every table in your notes.')
			.addToggle(t => t.setValue(this.plugin.settings.styleTables).onChange(async (v) => {
				this.plugin.settings.styleTables = v;
				await this.plugin.saveSettings();
				this.containerEl.doc.body.toggleClass('nimble-tables', v);
			}));

		new Setting(containerEl).setName('Stat blocks').setHeading();

		new Setting(containerEl)
			.setName('Stat block style')
			.addDropdown(d => d
				.addOption('book', 'Book')
				.addOption('compact', 'Compact')
				.setValue(this.plugin.settings.statblockStyle)
				.onChange(async (v) => {
					this.plugin.settings.statblockStyle = v as 'book' | 'compact';
					await this.plugin.saveSettings();
					this.plugin.rerenderNotes();
				}));

		new Setting(containerEl)
			.setName('Clickable dice')
			.addToggle(t => t
				.setValue(this.plugin.settings.clickableDice)
				.onChange(async (v) => {
					this.plugin.settings.clickableDice = v;
					await this.plugin.saveSettings();
					this.plugin.rerenderNotes();
				}));

		new Setting(containerEl)
			.setName('Nimble attack rolls')
			.setDesc('Attack dice miss on 1 and explode on max.')
			.addToggle(t => t
				.setValue(this.plugin.settings.nimbleAttackRolls)
				.onChange(async (v) => {
					this.plugin.settings.nimbleAttackRolls = v;
					await this.plugin.saveSettings();
					this.plugin.rerenderNotes();
				}));

		new Setting(containerEl)
			.setName('3D dice')
			.addToggle(t => t
				.setValue(this.plugin.settings.dice3d)
				.onChange(async (v) => {
					this.plugin.settings.dice3d = v;
					await this.plugin.saveSettings();
					this.display();
				}));
		if (this.plugin.settings.dice3d) {
			type ColourKey = 'dicePrimaryColor' | 'diceColor' | 'diceExplosionColor';
			type MaterialKey = 'diceMaterialPrimary' | 'diceMaterialNormal' | 'diceMaterialCrit';
			const role = (name: string, colourKey: ColourKey, materialKey: MaterialKey) => new Setting(containerEl)
				.setName(name).setClass('nimble-dice-colour')
				.addDropdown(d => {
					for (const m of DICE3D_MATERIALS) d.addOption(m.id, m.label);
					d.setValue(this.plugin.settings[materialKey]).onChange(async (v) => { this.plugin.settings[materialKey] = v; await this.plugin.saveSettings(); });
				})
				.addColorPicker(c => c.setValue(this.plugin.settings[colourKey]).onChange(async (v) => {
					this.plugin.settings[colourKey] = v;
					await this.plugin.saveSettings();
				}));
			role('Primary die', 'dicePrimaryColor', 'diceMaterialPrimary');
			role('Other dice', 'diceColor', 'diceMaterialNormal');
			role('Crit dice', 'diceExplosionColor', 'diceMaterialCrit');
			new Setting(containerEl).setClass('nimble-dice-colour').addButton(b => b.setButtonText('Test roll: 2d6 attack').onClick(() => this.plugin.rollDice('2d6+2', 'Test roll', 'attack')))
				.addButton(b => b.setButtonText('Test a crit').onClick(() => this.plugin.rollDice('2d6+2', 'Test crit', 'attack', [6, 3, 6, 2])));
		}


		new Setting(containerEl)
			.setName('Keep the screen on during combat')
			.setDesc('Phones and tablets, while combat is running.')
			.addToggle(t => t
				.setValue(this.plugin.settings.keepScreenOn)
				.onChange(async (v) => {
					this.plugin.settings.keepScreenOn = v;
					await this.plugin.saveSettings();
					this.plugin.syncWakeLock();
				}));

		new Setting(containerEl).setName('Encounters').setHeading();

		new Setting(containerEl)
			.setName('Multiple encounters')
			.addToggle(t => t
				.setValue(this.plugin.settings.multipleEncounters)
				.onChange(async (v) => {
					this.plugin.settings.multipleEncounters = v;
					await this.plugin.saveSettings();
					this.plugin.encounters.trigger('changed');
				}));

		new Setting(containerEl)
			.setName('Apply monster armor automatically')
			.setDesc('Typed damage: ! crit, v vulnerable, r resisted.')
			.addToggle(t => t
				.setValue(this.plugin.settings.autoArmor)
				.onChange(async (v) => { this.plugin.settings.autoArmor = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName('Minion overkill')
			.setDesc('One more minion drops per full die of damage.')
			.addToggle(t => t
				.setValue(this.plugin.settings.minionOverkill)
				.onChange(async (v) => { this.plugin.settings.minionOverkill = v; await this.plugin.saveSettings(); }));

		this.renderCustomConditions(containerEl);
	}

	private renderParty(containerEl: HTMLElement): void {
		const camp = this.plugin.campaigns?.active;
		if (camp) containerEl.createEl('p', { cls: 'setting-item-description', text: `Party for ${camp.name}` });
		renderPartyEditor(containerEl, this.plugin, () => this.display());
		const save = async () => { await this.plugin.saveSettings(); this.plugin.encounters.trigger('changed'); };
		new Setting(containerEl)
			.setName('Party size when no party is set')
			.setDesc('Used until heroes are added.')
			.addSlider(sl => sl.setLimits(1, 8, 1).setValue(this.plugin.settings.defaultPartySize).setDynamicTooltip()
				.onChange(async v => { this.plugin.settings.defaultPartySize = v; await save(); }));
	}

	private renderCustomConditions(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Custom conditions')
			.setHeading();

		const add = containerEl.createDiv({ cls: 'custom-condition-add' });
		let name = '';
		let desc = '';
		new Setting(add).setName('Condition name').addText(t => t.setPlaceholder('e.g., Burning').onChange(v => { name = v; }));
		new Setting(add).setName('Description').addTextArea(t => t
			.setPlaceholder('e.g., Takes 1d6 fire damage at the start of each turn.')
			.onChange(v => { desc = v; }));
		new Setting(add).addButton(btn => btn
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
				this.display();
				new Notice(`Added condition: ${trimmed}`);
			}));

		const custom = this.plugin.settings.customConditions;
		if (!custom.length) return;
		const list = containerEl.createDiv({ cls: 'custom-conditions-list' });
		custom.forEach((condition, i) => {
			new Setting(list)
				.setName(condition.name)
				.setDesc(condition.description)
				.addExtraButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => this.openEditModal(i)))
				.addExtraButton(b => b.setIcon('trash').setTooltip('Delete').onClick(async () => {
					custom.splice(i, 1);
					await this.plugin.saveSettings();
					this.display();
					new Notice(`Deleted condition: ${condition.name}`);
				}));
		});
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
			this.display();
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
