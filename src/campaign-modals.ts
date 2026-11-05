// Small dialogs for campaigns: create one, name a new chapter/scene/NPC,
// and pick a campaign or chapter from a list.

import { App, FuzzySuggestModal, Modal, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Campaign, Chapter } from './campaign-model';
import { isTouch } from './touch';

/** One text field and a button. Enter submits. */
export class NamePrompt extends Modal {
	constructor(app: App, private title: string, private placeholder: string, private initial: string, private cta: string,
		private onSubmit: (value: string) => void, private extra?: (el: HTMLElement) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.modalEl.addClass('nimble-name-prompt');
		const input = this.contentEl.createEl('input', { type: 'text', cls: 'nimble-name-input', attr: { placeholder: this.placeholder, 'aria-label': this.title } });
		input.value = this.initial;
		this.extra?.(this.contentEl);
		const submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } this.close(); this.onSubmit(v); };
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText(this.cta).setCta().onClick(submit));
		window.setTimeout(() => { input.focus(); input.select(); }, 0);
	}

	onClose(): void { this.contentEl.empty(); }
}

export class NewCampaignModal extends Modal {
	private name = '';
	private level = 1;
	private heroes = 4;
	private starter = true;
	private firstChapter = 'Chapter 1';

	constructor(private plugin: NimbleStatblocksPlugin) {
		super(plugin.app);
		this.heroes = plugin.settings.defaultPartySize || 4;
	}

	onOpen(): void {
		this.titleEl.setText('New campaign');
		this.modalEl.addClass('nimble-new-campaign');
		const c = this.contentEl;
		c.createEl('p', {
			cls: 'setting-item-description',
			text: `A campaign is a folder in "${this.plugin.settings.campaignsFolder || 'Campaigns'}". Chapters are folders inside it, and any note you put in a chapter becomes one of its scenes. Each campaign keeps its own party.`,
		});
		new Setting(c).setName('Name').addText(t => {
			t.setPlaceholder('e.g. Vecna: Eve of Ruin').onChange(v => { this.name = v; });
			window.setTimeout(() => t.inputEl.focus(), 0);
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.create(); } });
		});
		new Setting(c).setName('Starting level').setDesc('Encounters are rated against this until you add the heroes.')
			.addText(t => { t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.inputMode = 'numeric'; t.setValue(String(this.level)).onChange(v => { this.level = Math.max(1, parseInt(v, 10) || 1); }); });
		new Setting(c).setName('Heroes')
			.addText(t => { t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.inputMode = 'numeric'; t.setValue(String(this.heroes)).onChange(v => { this.heroes = Math.max(1, parseInt(v, 10) || 4); }); });
		const first = new Setting(c).setName('First chapter').addText(t => t.setValue(this.firstChapter).onChange(v => { this.firstChapter = v; }));
		new Setting(c).setName('Starter folders').setDesc('NPCs, Locations, Sessions, Monsters and Assets, plus a first chapter with an opening scene.')
			.addToggle(t => t.setValue(this.starter).onChange(v => { this.starter = v; first.settingEl.toggle(v); }));
		new Setting(c)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Create campaign').setCta().onClick(() => void this.create()));
	}

	private async create(): Promise<void> {
		if (!this.name.trim()) return;
		this.close();
		const home = await this.plugin.campaigns.createCampaign({ name: this.name, level: this.level, heroes: this.heroes, starter: this.starter, firstChapter: this.firstChapter });
		await this.plugin.app.workspace.getLeaf(false).openFile(home);
		void this.plugin.openCampaignView();
	}

	onClose(): void { this.contentEl.empty(); }
}

export class CampaignPicker extends FuzzySuggestModal<Campaign> {
	constructor(app: App, private items: Campaign[], private onPick: (c: Campaign) => void) {
		super(app);
		this.setPlaceholder('Switch campaign…');
	}
	getItems(): Campaign[] { return this.items; }
	getItemText(c: Campaign): string { return c.name; }
	onChooseItem(c: Campaign): void { this.onPick(c); }
}

export class ChapterPicker extends FuzzySuggestModal<Chapter> {
	constructor(app: App, private items: Chapter[], private onPick: (c: Chapter) => void) {
		super(app);
		this.setPlaceholder('Add the scene to which chapter?');
	}
	getItems(): Chapter[] { return this.items; }
	getItemText(c: Chapter): string { return c.label ? `${c.label} · ${c.name}` : c.name; }
	onChooseItem(c: Chapter): void { this.onPick(c); }
}

/** Touch screens get a bigger hit area in lists; desktop keeps them compact. */
export const listDensity = () => (isTouch() ? 'is-touch' : 'is-compact');
