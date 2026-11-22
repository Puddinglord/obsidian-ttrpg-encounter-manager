// The Character side panel: your character's sheet beside your session notes.
// It shows the note you picked, or else your character (`mine: true`) in the
// active campaign, or else any `mine: true` character, or else an empty state
// with a New character button.

import { ItemView, Menu, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { CharacterSheetRenderer } from './character-sheet';
import { NewCharacterModal } from './character-wizard';
import { fmTrue } from '../../core/campaign-model';

export const CHARACTER_VIEW_TYPE = 'nimble-character';

function isMine(plugin: EmberVaultPlugin, f: TFile): boolean {
	return fmTrue(plugin.app.metadataCache.getFileCache(f)?.frontmatter?.mine);
}

const isCharacter = (plugin: EmberVaultPlugin, path: string) =>
	String(plugin.app.metadataCache.getCache(path)?.frontmatter?.nimble ?? '').toLowerCase().trim() === 'character';

/** Character notes in the vault, yours first, then the active campaign's, then by name. */
export function characterNotes(plugin: EmberVaultPlugin): TFile[] {
	const app = plugin.app;
	const active = plugin.settings.activeCampaign;
	const inActive = (f: TFile) => !!active && f.path.startsWith(`${active}/`);
	const mine = (f: TFile) => isMine(plugin, f);
	return app.vault.getMarkdownFiles()
		.filter(f => String(app.metadataCache.getFileCache(f)?.frontmatter?.nimble ?? '').toLowerCase().trim() === 'character')
		.sort((a, b) => Number(mine(b) && inActive(b)) - Number(mine(a) && inActive(a)) || Number(mine(b)) - Number(mine(a))
			|| Number(inActive(b)) - Number(inActive(a)) || a.basename.localeCompare(b.basename));
}

/** "My character": yours in the active campaign, else any of yours. */
export function myCharacter(plugin: EmberVaultPlugin): TFile | null {
	const list = characterNotes(plugin);
	const mine = (f: TFile) => isMine(plugin, f);
	const active = plugin.settings.activeCampaign;
	return list.find(f => mine(f) && !!active && f.path.startsWith(`${active}/`)) ?? list.find(mine) ?? null;
}

export class CharacterView extends ItemView {
	/** The note picked in this panel; null follows "my character". */
	private chosen: string | null = null;
	private sheet: CharacterSheetRenderer | null = null;
	private shownPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: EmberVaultPlugin) {
		super(leaf);
	}

	getViewType(): string { return CHARACTER_VIEW_TYPE; }
	getDisplayText(): string { return 'Character'; }
	getIcon(): string { return 'user-round'; }

	getState(): Record<string, unknown> {
		return { ...super.getState(), file: this.chosen };
	}

	async setState(state: unknown, result: { history: boolean }): Promise<void> {
		const f = (state as { file?: unknown } | null)?.file;
		this.chosen = typeof f === 'string' ? f : null;
		this.refresh(true);
		await super.setState(state, result);
	}

	/** Show a particular character note. */
	show(file: TFile): void {
		this.chosen = file.path;
		this.refresh(true);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('nimble-character-view');
		this.refresh(true);
		// A character appearing or changing campaigns can change which note this shows.
		// Only character notes can change which one this shows; other edits are left alone (no vault scan per keystroke).
		this.registerEvent(this.app.metadataCache.on('changed', (f) => { if (f.path !== this.shownPath && isCharacter(this.plugin, f.path)) this.refresh(); }));
		this.registerEvent(this.app.vault.on('delete', (f) => { if (f.path === this.chosen) this.chosen = null; this.refresh(); }));
		this.registerEvent(this.app.vault.on('rename', (f, old) => { if (old === this.chosen) this.chosen = f.path; if (old === this.shownPath) this.shownPath = f.path; }));
		let active = this.plugin.settings.activeCampaign;
		this.registerEvent(this.plugin.campaigns.on('changed', () => {
			if (this.plugin.settings.activeCampaign === active) return;
			active = this.plugin.settings.activeCampaign;
			this.refresh();
		}));
	}

	async onClose(): Promise<void> {
		this.sheet?.unload();
		this.sheet = null;
	}

	private target(): TFile | null {
		if (this.chosen) {
			const f = this.app.vault.getFileByPath(this.chosen);
			if (f) return f;
		}
		return myCharacter(this.plugin);
	}

	/** Redraw when the note to show changed (or always, with `force`). The sheet keeps itself current. */
	private refresh(force = false): void {
		const file = this.target();
		if (!force && (file?.path ?? null) === this.shownPath && (file || this.contentEl.querySelector('.nimble-character-empty'))) return;
		this.shownPath = file?.path ?? null;
		this.sheet?.unload();
		this.sheet = null;
		const el = this.contentEl;
		el.empty();
		const bar = el.createDiv({ cls: 'nimble-character-bar' });
		const pick = bar.createEl('button', { cls: 'nimble-character-pick' });
		setIcon(pick.createSpan(), 'users');
		pick.createSpan({ text: file ? file.basename : 'Choose a character' });
		setIcon(pick.createSpan({ cls: 'nimble-character-pick-chev' }), 'chevron-down');
		pick.addEventListener('click', (e) => this.menu(e));
		const open = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open note' } });
		setIcon(open, 'file-symlink');
		open.disabled = !file;
		open.addEventListener('click', (e) => { if (file) void this.app.workspace.openLinkText(file.path, '', e.metaKey || e.ctrlKey); });

		if (!file) {
			const empty = el.createDiv({ cls: 'nimble-character-empty' });
			setIcon(empty.createDiv({ cls: 'nimble-character-empty-icon' }), 'user-round-plus');
			empty.createDiv({ cls: 'nimble-character-empty-title', text: 'No character yet' });
			empty.createDiv({ cls: 'nimble-character-empty-body', text: 'Make one, or mark a character note as yours with "mine: true" in its properties.' });
			const b = empty.createEl('button', { cls: 'mod-cta', text: 'New character' });
			b.addEventListener('click', () => new NewCharacterModal(this.plugin, undefined, (f) => this.show(f)).open());
			return;
		}
		const host = el.createDiv();
		this.sheet = new CharacterSheetRenderer(this.plugin, host, file, { inPanel: true });
		this.sheet.load();
	}

	private menu(e: MouseEvent): void {
		const m = new Menu();
		const current = this.target();
		for (const f of characterNotes(this.plugin)) m.addItem(i => i.setTitle(f.basename).setChecked(f.path === current?.path).onClick(() => this.show(f)));
		m.addSeparator();
		m.addItem(i => i.setTitle('New character…').setIcon('user-round-plus').onClick(() => new NewCharacterModal(this.plugin, undefined, (f) => this.show(f)).open()));
		if (this.chosen) m.addItem(i => i.setTitle('Follow my character').setIcon('locate').onClick(() => { this.chosen = null; this.refresh(true); }));
		m.showAtMouseEvent(e);
	}
}
