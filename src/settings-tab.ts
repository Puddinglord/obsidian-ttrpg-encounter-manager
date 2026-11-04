import { App, Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { NIMBLE_CONDITIONS, NimbleCondition } from './types';

export class NimbleSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Stat blocks').setHeading();

		new Setting(containerEl)
			.setName('Stat block style')
			.setDesc('Book is roomy and easy to read. Compact uses tighter spacing and smaller text, good for prep notes full of monsters.')
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
			.setDesc('Dice in stat blocks (like 2d6+3) roll when clicked. Results show in a notice and in the tracker\'s roll log.')
			.addToggle(t => t
				.setValue(this.plugin.settings.clickableDice)
				.onChange(async (v) => {
					this.plugin.settings.clickableDice = v;
					await this.plugin.saveSettings();
					this.plugin.rerenderNotes();
				}));

		new Setting(containerEl)
			.setName('Nimble attack rolls')
			.setDesc('Dice in attack lines use Nimble\'s rules: a 1 on the first die is a miss, and its max is a crit that explodes. Attacks that call for a save, and dice in abilities, always roll a plain sum.')
			.addToggle(t => t
				.setValue(this.plugin.settings.nimbleAttackRolls)
				.onChange(async (v) => {
					this.plugin.settings.nimbleAttackRolls = v;
					await this.plugin.saveSettings();
					this.plugin.rerenderNotes();
				}));

		new Setting(containerEl)
			.setName('Tap to preview on mobile')
			.setDesc('On mobile, tap a monster reference once to preview its stat block and again to open its note. When off, tapping opens the note right away.')
			.addToggle(t => t
				.setValue(this.plugin.settings.mobileTapToPreview)
				.onChange(async (v) => {
					this.plugin.settings.mobileTapToPreview = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName('Encounters').setHeading();

		new Setting(containerEl)
			.setName('Multiple encounters')
			.setDesc('Create and switch between named encounters. When off, the tracker holds a single encounter.')
			.addToggle(t => t
				.setValue(this.plugin.settings.multipleEncounters)
				.onChange(async (v) => {
					this.plugin.settings.multipleEncounters = v;
					await this.plugin.saveSettings();
					this.plugin.encounters.trigger('changed');
				}));

		this.renderCustomConditions(containerEl);
	}

	private renderCustomConditions(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Custom conditions')
			.setDesc('Add your own conditions to apply to creatures in encounters.')
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
