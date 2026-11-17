// Small dialogs for campaigns: create one, name a new chapter/scene/NPC,
// and pick a campaign or chapter from a list.

import { App, FuzzySuggestModal, FuzzyMatch, Modal, setIcon, Setting } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { Campaign, Chapter, CampaignRole, FileRef } from './campaign-model';
import { STARTERS, StarterKind } from './campaign-templates';
import { isTouch } from './touch';
import { promptCharacter } from './campaign-ui';
import type { GameSystem } from '../systems/contract';

/** One entry in the Game system picker: a system, and for systems with versions, one of them. */
interface SystemChoice { value: string; label: string; system: GameSystem; edition?: string }

/** Every system and edition the plugin ships, as the Game system picker lists them. */
export function systemChoices(plugin: EmberVaultPlugin): SystemChoice[] {
	return plugin.systems.all().flatMap((system): SystemChoice[] => system.editions?.length
		? system.editions.map(e => ({ value: `${system.id}:${e.id}`, label: `${system.name}, ${e.label}`, system, edition: e.id }))
		: [{ value: system.id, label: system.name, system }]);
}

/** The picker value for a campaign's `system:` and `edition:`. */
function choiceFor(plugin: EmberVaultPlugin, system: string | undefined, edition: string | undefined): string {
	const choices = systemChoices(plugin);
	const s = plugin.systems.resolve(system);
	const ed = s.editions?.length ? (s.editions.find(e => e.id === String(edition ?? '').trim()) ?? s.editions[0]).id : undefined;
	return choices.find(c => c.system === s && c.edition === ed)?.value ?? choices[0].value;
}

/** A Game system dropdown (only when the plugin ships more than one). */
function systemSetting(parent: HTMLElement, plugin: EmberVaultPlugin, value: string, desc: string, onPick: (c: SystemChoice) => void): void {
	const choices = systemChoices(plugin);
	if (choices.length < 2) return;
	new Setting(parent).setName('Game system').setDesc(desc).addDropdown(d => {
		for (const c of choices) d.addOption(c.value, c.label);
		d.setValue(value).onChange(v => { const c = choices.find(x => x.value === v); if (c) onPick(c); });
	});
}

/** The two sides of the table, as the New campaign and Campaign settings dialogs offer them. */
export const ROLE_INFO: Record<CampaignRole, { icon: string; title: string; short: string; desc: string }> = {
	gm: { icon: 'crown', title: 'I run it', short: 'GM', desc: 'Chapters and scenes, encounters, the tracker, full stat blocks.' },
	player: { icon: 'dices', title: 'I play in it', short: 'Player', desc: 'Your character sheet, your party, notes on people, places and fights.' },
};

/** Two big choice cards: GM or player. Calls `onPick` when the choice changes. */
export function rolePicker(parent: HTMLElement, value: CampaignRole, onPick: (r: CampaignRole) => void): void {
	const row = parent.createDiv({ cls: 'nimble-role-pick', attr: { role: 'radiogroup', 'aria-label': 'Your side of the table' } });
	const cards: [CampaignRole, HTMLElement][] = [];
	const select = (r: CampaignRole) => {
		for (const [k, el] of cards) { el.toggleClass('is-active', k === r); el.setAttr('aria-checked', String(k === r)); }
	};
	for (const r of ['gm', 'player'] as CampaignRole[]) {
		const info = ROLE_INFO[r];
		const b = row.createEl('button', { cls: `nimble-role-card role-${r}`, attr: { role: 'radio', type: 'button' } });
		setIcon(b.createSpan({ cls: 'nimble-role-icon' }), info.icon);
		b.createSpan({ cls: 'nimble-role-title', text: info.title });
		b.createSpan({ cls: 'nimble-role-desc', text: info.desc });
		b.addEventListener('click', () => { select(r); onPick(r); });
		cards.push([r, b]);
	}
	select(value);
}

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
	private role: CampaignRole = 'gm';
	private gm = '';
	private character = '';
	private system?: SystemChoice;

	constructor(private plugin: EmberVaultPlugin, role?: CampaignRole) {
		super(plugin.app);
		this.heroes = plugin.settings.defaultPartySize || 4;
		if (role) this.role = role;
	}

	onOpen(): void {
		this.titleEl.setText('New campaign');
		this.modalEl.addClass('nimble-new-campaign');
		const c = this.contentEl;
		rolePicker(c, this.role, (r) => { this.role = r; sync(); });
		const about = c.createEl('p', { cls: 'setting-item-description' });
		new Setting(c).setName('Name').addText(t => {
			t.setPlaceholder('e.g. Vecna: Eve of Ruin').onChange(v => { this.name = v; });
			window.setTimeout(() => t.inputEl.focus(), 0);
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.create(); } });
		});
		systemSetting(c, this.plugin, choiceFor(this.plugin, undefined, undefined), 'Its rules, monsters and character sheets.', (choice) => { this.system = choice; });
		const hero = new Setting(c).setName('Your character').setDesc('Next you\'ll pick their ancestry, class and stats. Their sheet goes in the Party folder.')
			.addText(t => t.setPlaceholder('e.g. Thorga Ironbrow').onChange(v => { this.character = v; }));
		const gm = new Setting(c).setName('Who runs it').addText(t => t.setPlaceholder('GM name (optional)').onChange(v => { this.gm = v; }));
		const level = new Setting(c).setName('Starting level')
			.addText(t => { t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.inputMode = 'numeric'; t.setValue(String(this.level)).onChange(v => { this.level = Math.max(1, parseInt(v, 10) || 1); }); });
		const heroes = new Setting(c).setName('Heroes')
			.addText(t => { t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.inputMode = 'numeric'; t.setValue(String(this.heroes)).onChange(v => { this.heroes = Math.max(1, parseInt(v, 10) || 4); }); });
		const first = new Setting(c).setName('First chapter').addText(t => t.setValue(this.firstChapter).onChange(v => { this.firstChapter = v; }));
		const starter = new Setting(c).setName('Starter folders')
			.addToggle(t => t.setValue(this.starter).onChange(v => { this.starter = v; first.settingEl.toggle(v); }));
		const folder = this.plugin.settings.campaignsFolder || 'Campaigns';
		const sync = () => {
			const player = this.role === 'player';
			about.setText(player
				? `A campaign you play in: a folder in "${folder}" for your character, your party and your notes from the table. Switch sides any time from Campaign settings.`
				: `A campaign is a folder in "${folder}". Chapters are folders inside it, and any note you put in a chapter becomes one of its scenes. Each campaign keeps its own party.`);
			hero.settingEl.toggle(player);
			gm.settingEl.toggle(player);
			heroes.settingEl.toggle(!player);
			level.setDesc(player ? 'Your character\'s level.' : 'Encounters are rated against this until you add the heroes.');
			starter.setDesc(player ? 'Party, Sessions, Quests, NPCs, Locations and Assets, plus a first chapter for your notes.' : 'Quests, NPCs, Locations, Sessions, Monsters and Assets, plus a first chapter with an opening scene.');
		};
		sync();
		new Setting(c)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Create campaign').setCta().onClick(() => void this.create()));
	}

	private async create(): Promise<void> {
		if (!this.name.trim()) return;
		this.close();
		const player = this.role === 'player';
		const home = await this.plugin.campaigns.createCampaign({
			name: this.name, level: this.level, heroes: this.heroes, starter: this.starter, firstChapter: this.firstChapter,
			role: this.role, gm: this.gm,
			system: this.system?.system.name, edition: this.system?.edition,
		});
		await this.plugin.app.workspace.getLeaf(false).openFile(home);
		void this.plugin.openCampaignView();
		// Players go straight on to their character: ancestry, class, stats and starting gear.
		const c = this.plugin.campaigns.of(home.path);
		if (player && c) promptCharacter(this.plugin, c, true, this.character.trim());
	}

	onClose(): void { this.contentEl.empty(); }
}

/** Campaign settings: its name, which side you're on, and the quick facts on its home note. */
export class CampaignSettingsModal extends Modal {
	private role: CampaignRole;
	private title: string;
	private level: string;
	private heroes: string;
	private gm: string;
	private status: string;
	private system?: SystemChoice;

	constructor(private plugin: EmberVaultPlugin, private c: Campaign) {
		super(plugin.app);
		const fm = plugin.app.metadataCache.getCache(c.home.path)?.frontmatter ?? {};
		const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
		this.role = c.role;
		this.title = c.name;
		this.level = c.level !== undefined ? String(c.level) : '';
		this.heroes = c.heroes !== undefined ? String(c.heroes) : '';
		this.gm = text(fm.gm);
		this.status = c.status ?? '';
	}

	onOpen(): void {
		this.titleEl.setText('Campaign settings');
		this.modalEl.addClass('nimble-campaign-settings');
		const el = this.contentEl;
		el.createDiv({ cls: 'nimble-role-heading', text: 'Your side of the table' });
		rolePicker(el, this.role, (r) => { this.role = r; sync(); });
		const hint = el.createEl('p', { cls: 'setting-item-description' });
		new Setting(el).setName('Name').setDesc('Shown in the switcher. The folder keeps its name.').addText(t => t.setValue(this.title).onChange(v => { this.title = v; }));
		systemSetting(el, this.plugin, choiceFor(this.plugin, this.c.system, this.c.edition), 'Notes and stat blocks you already wrote stay as they are.', (choice) => { this.system = choice; });
		const level = new Setting(el).setName('Level').addText(t => { t.inputEl.type = 'number'; t.inputEl.inputMode = 'numeric'; t.setValue(this.level).onChange(v => { this.level = v; }); });
		const heroes = new Setting(el).setName('Heroes').setDesc('Used for encounter maths until the party is filled in.')
			.addText(t => { t.inputEl.type = 'number'; t.inputEl.inputMode = 'numeric'; t.setValue(this.heroes).onChange(v => { this.heroes = v; }); });
		const gm = new Setting(el).setName('Who runs it').addText(t => t.setValue(this.gm).onChange(v => { this.gm = v; }));
		new Setting(el).setName('Status').addDropdown(d => {
			for (const s of ['active', 'paused', 'finished', 'planning']) d.addOption(s, s[0].toUpperCase() + s.slice(1));
			if (this.status && !['active', 'paused', 'finished', 'planning'].includes(this.status)) d.addOption(this.status, this.status);
			d.setValue(this.status || 'active').onChange(v => { this.status = v; });
		});
		const sync = () => {
			const player = this.role === 'player';
			hint.setText(player
				? 'Player view: your character sheet and party, battle notes instead of the encounter tracker, and bestiary entries without stat blocks.'
				: 'GM view: encounters and the tracker, full stat blocks, and the party used for encounter difficulty.');
			heroes.settingEl.toggle(!player);
			gm.settingEl.toggle(player);
			level.setDesc(player ? 'Your character\'s level, if you\'d like it on the home note.' : 'Starting hero level, used until heroes are added.');
		};
		sync();
		new Setting(el)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Save').setCta().onClick(() => void this.save()));
	}

	private async save(): Promise<void> {
		this.close();
		const store = this.plugin.campaigns;
		const num = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
		const fileName = this.c.home.path.replace(/^.*\//, '').replace(/\.md$/, '');
		const title = this.title.trim();
		// Fields hidden for this side are left as they are, so switching back and forth loses nothing.
		const values: Record<string, string | number | undefined> = {
			title: title && title !== fileName ? title : undefined,
			level: num(this.level),
			status: this.status || undefined,
		};
		if (this.role === 'gm') values.heroes = num(this.heroes);
		else values.gm = this.gm.trim() || undefined;
		if (this.system) {
			values.system = this.system.system.name;
			values.edition = this.system.edition;
		}
		await store.setDetails(this.c, values);
		if (this.role !== this.c.role) await store.setRole(this.c, this.role);
	}

	onClose(): void { this.contentEl.empty(); }
}

export class CampaignPicker extends FuzzySuggestModal<Campaign> {
	constructor(app: App, private items: Campaign[], private onPick: (c: Campaign) => void) {
		super(app);
		this.setPlaceholder('Switch campaign…');
	}
	getItems(): Campaign[] { return this.items; }
	getItemText(c: Campaign): string { return `${c.name} (${ROLE_INFO[c.role].short})`; }
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
	/** Name of the folder a starter is filed in when that isn't the one the dialog was opened from, or ''. */
	elsewhere?: (kind: StarterKind) => string;
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

		const dest = c.createDiv({ cls: 'nimble-starter-dest setting-item-description', attr: { 'aria-live': 'polite' } });

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
			const folder = this.o.elsewhere?.(kind) ?? '';
			dest.empty();
			if (folder) {
				setIcon(dest.createSpan({ cls: 'nimble-starter-dest-icon' }), 'folder-input');
				dest.createSpan({ text: `Goes in the campaign's ${folder} folder.` });
			}
			dest.toggle(!!folder);
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
