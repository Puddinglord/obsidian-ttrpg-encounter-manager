// Small dialogs for campaigns: create one, name a new chapter/scene/NPC,
// and pick a campaign or chapter from a list.

import { App, FuzzySuggestModal, FuzzyMatch, Modal, setIcon, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Campaign, Chapter, FileRef } from './campaign-model';
import { STARTERS, StarterKind } from './campaign-templates';
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

export interface NewNoteOptions {
	/** Where it goes, for the title: "Factions", "Chapter 1". */
	where: string;
	/** Starters to offer, in order. */
	kinds: StarterKind[];
	/** The one picked when the dialog opens. */
	kind: StarterKind;
	/** A suggested name for a starter (e.g. "Session 4"), or ''. */
	suggest?: (kind: StarterKind) => string;
	/** Images in the campaign, offered as the picture for a new map. */
	images: FileRef[];
	onSubmit: (kind: StarterKind, name: string, extra: { image?: string }) => void;
	/** When set, a link to add files from the device instead. */
	onAddFiles?: () => void;
}

/**
 * New note, guided: pick what it is (a starter NPC, location, map… or a blank
 * note), name it, done. The folder you came from decides the starting pick.
 */
export class NewNoteModal extends Modal {
	private kind: StarterKind;
	private image = '';

	constructor(app: App, private o: NewNoteOptions) {
		super(app);
		this.kind = o.kinds.includes(o.kind) ? o.kind : o.kinds[0];
	}

	onOpen(): void {
		this.titleEl.setText(`New in ${this.o.where}`);
		this.modalEl.addClass('nimble-new-note');
		const c = this.contentEl;
		const starters = STARTERS.filter(s => this.o.kinds.includes(s.kind));
		const grid = c.createDiv({ cls: 'nimble-starter-grid', attr: { role: 'radiogroup', 'aria-label': 'What to create' } });
		const tiles = new Map<StarterKind, HTMLElement>();
		for (const s of starters) {
			const b = grid.createEl('button', { cls: 'nimble-starter', attr: { role: 'radio', 'data-kind': s.kind } });
			setIcon(b.createSpan({ cls: 'nimble-starter-icon' }), s.icon);
			b.createSpan({ cls: 'nimble-starter-label', text: s.label });
			b.addEventListener('click', () => pick(s.kind, true));
			tiles.set(s.kind, b);
		}
		// Arrow keys move between tiles, like any radio group.
		grid.addEventListener('keydown', (e) => {
			const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
			if (!step) return;
			e.preventDefault();
			const i = starters.findIndex(s => s.kind === this.kind);
			const next = starters[(i + step + starters.length) % starters.length].kind;
			pick(next, false);
			tiles.get(next)?.focus();
		});

		const input = c.createEl('input', { type: 'text', cls: 'nimble-name-input', attr: { 'aria-label': 'Name' } });
		let typed = false;
		input.addEventListener('input', () => { typed = true; });

		const mapRow = c.createDiv({ cls: 'nimble-starter-map' });
		if (this.o.images.length) {
			new Setting(mapRow).setName('Map image').addDropdown(d => {
				d.addOption('', 'Choose later');
				for (const img of this.o.images) d.addOption(img.path, img.name);
				d.onChange(v => { this.image = v; });
			});
		} else {
			mapRow.createDiv({ cls: 'setting-item-description', text: 'Add the map picture to your vault (an Assets folder works), then set image: in the note.' });
		}

		const pick = (kind: StarterKind, focusName: boolean) => {
			this.kind = kind;
			for (const [k, el] of tiles) {
				el.toggleClass('is-active', k === kind);
				el.setAttr('aria-checked', String(k === kind));
				el.tabIndex = k === kind ? 0 : -1;
			}
			const s = STARTERS.find(x => x.kind === kind);
			input.placeholder = s?.placeholder ?? 'Name';
			if (!typed) { input.value = this.o.suggest?.(kind) ?? ''; }
			mapRow.toggle(kind === 'map');
			if (focusName) { input.focus(); input.select(); }
		};

		const submit = () => {
			const v = input.value.trim();
			if (!v) { input.focus(); return; }
			this.close();
			this.o.onSubmit(this.kind, v, { image: this.kind === 'map' && this.image ? this.image : undefined });
		};
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

		const footer = new Setting(c);
		if (this.o.onAddFiles) {
			const add = footer.infoEl.createEl('a', { cls: 'nimble-starter-files', text: 'Add files from this device instead', href: '#' });
			add.addEventListener('click', (e) => { e.preventDefault(); this.close(); this.o.onAddFiles?.(); });
		}
		footer
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Create').setCta().onClick(submit));

		pick(this.kind, false);
		window.setTimeout(() => { input.focus(); input.select(); }, 0);
	}

	onClose(): void { this.contentEl.empty(); }
}

/** A place in the campaign a note can be moved to. */
export interface MoveTarget {
	folder: string;
	label: string;
	detail: string;
}

/** "Move to…": every chapter and folder in the campaign. The touch and keyboard way to do what drag and drop does. */
export class MovePicker extends FuzzySuggestModal<MoveTarget> {
	constructor(app: App, private items: MoveTarget[], private onPick: (t: MoveTarget) => void) {
		super(app);
		this.setPlaceholder('Move to which chapter or folder?');
	}
	getItems(): MoveTarget[] { return this.items; }
	getItemText(t: MoveTarget): string { return t.label; }
	renderSuggestion(m: FuzzyMatch<MoveTarget>, el: HTMLElement): void {
		el.createDiv({ text: m.item.label });
		el.createEl('small', { cls: 'nimble-move-detail', text: m.item.detail });
	}
	onChooseItem(t: MoveTarget): void { this.onPick(t); }
}

/** Ask for files from the device (any type). Resolves with none if the picker is cancelled. */
export function pickFiles(): Promise<File[]> {
	return new Promise((resolve) => {
		const input = createEl('input', { type: 'file' });
		input.multiple = true;
		input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
		input.addEventListener('cancel', () => resolve([]));
		input.click();
	});
}

/** Touch screens get a bigger hit area in lists; desktop keeps them compact. */
export const listDensity = () => (isTouch() ? 'is-touch' : 'is-compact');
