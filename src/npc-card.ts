// ```nimble-npc blocks: a character card with the NPC's portrait, name, role
// and a few rows (look, wants, voice, secret…). The portrait lives in the
// note's `portrait` property, so the Campaign panel and hover previews can use
// it too. With no portrait the card offers to add one: upload an image (it's
// copied into the vault, following your attachment settings), pick one already
// in the vault, or drop an image file on the frame.

import {
	App, FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer, Menu, Modal, Notice, Platform,
	setIcon, TFile,
} from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { fmText, safeName } from './campaign-model';
import { IMAGE_EXTENSIONS, isRemote, parseNpcCard, portraitLink, SECRET_KEYS } from './npc-card-def';

export function registerNpcCard(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-npc', (source, el, ctx) => {
		ctx.addChild(new NpcCard(plugin, el, source, ctx));
	});
}

export interface Portrait {
	/** Something an <img> can load. */
	src: string;
	file?: TFile;
}

/** The portrait a note's properties point at, if it's an image we can show. */
export function resolvePortrait(app: App, fm: Record<string, unknown> | undefined, sourcePath: string): Portrait | null {
	const link = portraitLink(fm?.portrait ?? fm?.image);
	if (!link) return null;
	if (isRemote(link)) return { src: link };
	const file = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
	if (!file || !IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) return null;
	return { src: app.vault.getResourcePath(file), file };
}

/** Portrait of the note at `path`, from its cached properties. */
export function portraitOf(app: App, path: string): Portrait | null {
	const file = app.vault.getFileByPath(path);
	if (!file) return null;
	return resolvePortrait(app, app.metadataCache.getFileCache(file)?.frontmatter, path);
}

/** A small round avatar, for lists and hover cards. */
export function renderAvatar(parent: HTMLElement, p: Portrait, cls = ''): HTMLElement {
	const el = parent.createSpan({ cls: `nimble-npc-avatar ${cls}`.trim() });
	el.createEl('img', { attr: { src: p.src, alt: '', draggable: 'false', loading: 'lazy' } });
	return el;
}

class NpcCard extends MarkdownRenderChild {
	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	private get app() { return this.plugin.app; }

	onload(): void {
		this.render();
		// Adding a portrait changes the note's properties, not this block's text, so Obsidian won't re-render it for us.
		let last = this.portraitKey();
		this.registerEvent(this.app.metadataCache.on('changed', (f) => {
			if (f.path !== this.ctx.sourcePath) return;
			const key = this.portraitKey();
			if (key !== last) { last = key; this.render(); }
		}));
	}

	private note(): TFile | null {
		return this.app.vault.getFileByPath(this.ctx.sourcePath);
	}

	private frontmatter(): Record<string, unknown> {
		const f = this.note();
		return (f && this.app.metadataCache.getFileCache(f)?.frontmatter) || {};
	}

	private portraitKey(): string {
		const fm = this.frontmatter();
		return `${fmText(fm.portrait ?? fm.image)}|${fmText(fm['portrait-position'])}|${fmText(fm.role)}`;
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		const fm = this.frontmatter();
		const def = parseNpcCard(this.source);
		const name = def.name || this.note()?.basename || 'NPC';
		const role = def.role || fmText(fm.role);

		const card = el.createDiv({ cls: 'nimble-npc-card' });
		this.renderPortrait(card.createDiv({ cls: 'nimble-npc-portrait' }), fm, name, role);

		const info = card.createDiv({ cls: 'nimble-npc-info' });
		const head = info.createDiv({ cls: 'nimble-npc-head' });
		head.createDiv({ cls: 'nimble-npc-name', text: name });
		if (role) head.createDiv({ cls: 'nimble-npc-role', text: role });

		if (!def.fields.length) return;
		const rows = info.createDiv({ cls: 'nimble-npc-fields' });
		for (const f of def.fields) {
			const secret = SECRET_KEYS.includes(f.key);
			const row = rows.createDiv({ cls: 'nimble-npc-field' });
			row.dataset.field = f.key;
			const label = row.createDiv({ cls: 'nimble-npc-label' });
			if (secret) setIcon(label.createSpan({ cls: 'nimble-npc-label-icon' }), 'eye-off');
			label.createSpan({ text: f.label });
			const value = row.createDiv({ cls: 'nimble-npc-value' });
			if (!f.value) { value.addClass('is-empty'); value.setText('—'); continue; }
			if (secret) this.hideSecret(row, value);
			void MarkdownRenderer.render(this.app, f.value, value, this.ctx.sourcePath, this);
		}
	}

	/** Secrets stay blurred (handy when the screen is shared) until clicked. */
	private hideSecret(row: HTMLElement, value: HTMLElement): void {
		row.addClass('is-secret');
		value.setAttr('aria-label', 'Click to reveal');
		value.addEventListener('click', (e) => {
			if (row.hasClass('is-revealed')) return;
			e.preventDefault();
			e.stopPropagation();
			row.addClass('is-revealed');
			value.removeAttribute('aria-label');
		});
	}

	private renderPortrait(frame: HTMLElement, fm: Record<string, unknown>, name: string, role: string): void {
		const portrait = resolvePortrait(this.app, fm, this.ctx.sourcePath);
		if (portrait) {
			const img = frame.createEl('img', { attr: { src: portrait.src, alt: `Portrait of ${name}`, draggable: 'false' } });
			const pos = fmText(fm['portrait-position']);
			if (pos) img.setCssProps({ '--nimble-portrait-position': pos });
			frame.setAttr('aria-label', 'Click to enlarge');
			frame.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); new PortraitModal(this.app, portrait, name, role).open(); });
			const edit = frame.createEl('button', { cls: 'nimble-npc-portrait-edit clickable-icon', attr: { 'aria-label': 'Change portrait' } });
			setIcon(edit, 'image-plus');
			edit.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.menu(e, portrait); });
			frame.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(e, portrait); });
		} else {
			frame.addClass('is-empty');
			setIcon(frame.createDiv({ cls: 'nimble-npc-portrait-icon' }), 'user-round');
			frame.createDiv({ cls: 'nimble-npc-portrait-hint', text: Platform.isMobile ? 'Add portrait' : 'Add portrait or drop an image' });
			frame.setAttr('role', 'button');
			frame.setAttr('tabindex', '0');
			frame.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.menu(e, null); });
			frame.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.upload(); } });
		}
		this.acceptDrops(frame);
	}

	private menu(e: MouseEvent, current: Portrait | null): void {
		const m = new Menu();
		m.addItem(i => i.setTitle(current ? 'Upload a new portrait…' : 'Upload an image…').setIcon('upload').onClick(() => this.upload()));
		m.addItem(i => i.setTitle('Choose from vault…').setIcon('image').onClick(() => {
			new ImagePicker(this.app, (f) => void this.setPortrait(f)).open();
		}));
		if (current?.file) {
			const file = current.file;
			m.addSeparator();
			m.addItem(i => i.setTitle('Open image').setIcon('file-image').onClick(() => void this.app.workspace.getLeaf('tab').openFile(file)));
		}
		if (current) {
			m.addItem(i => i.setTitle('Remove portrait').setIcon('trash-2').onClick(() => void this.setPortrait(null)));
		}
		m.showAtMouseEvent(e);
	}

	private upload(): void {
		const input = this.containerEl.createEl('input', { type: 'file', cls: 'nimble-hidden', attr: { accept: 'image/*' } });
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			input.remove();
			if (file) void this.importImage(file);
		});
		input.click();
	}

	private acceptDrops(frame: HTMLElement): void {
		frame.addEventListener('dragover', (e) => {
			if (!e.dataTransfer?.types.includes('Files')) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			frame.addClass('is-drop-target');
		});
		frame.addEventListener('dragleave', () => frame.removeClass('is-drop-target'));
		frame.addEventListener('drop', (e) => {
			frame.removeClass('is-drop-target');
			const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
			if (!file) return;
			e.preventDefault();
			e.stopPropagation();
			void this.importImage(file);
		});
	}

	/** Copy an image from outside the vault in, then point the portrait at it. */
	private async importImage(file: File): Promise<void> {
		const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? file.type.split('/')[1] ?? 'png').toLowerCase();
		if (!IMAGE_EXTENSIONS.includes(ext)) { new Notice(`${file.name} isn't an image Obsidian can show`); return; }
		const base = this.note()?.basename ?? 'NPC';
		try {
			const path = await this.app.fileManager.getAvailablePathForAttachment(`${safeName(base)} portrait.${ext}`, this.ctx.sourcePath);
			const created = await this.app.vault.createBinary(path, await file.arrayBuffer());
			await this.setPortrait(created);
			new Notice(`Saved portrait to ${created.path}`);
		} catch (err) {
			console.error('Nimble GM: could not save the portrait', err);
			new Notice("Couldn't save the portrait. See the developer console for details.");
		}
	}

	private async setPortrait(img: TFile | null): Promise<void> {
		const note = this.note();
		if (!note) return;
		await this.app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
			if (img) fm.portrait = `[[${this.app.metadataCache.fileToLinktext(img, note.path, false)}]]`;
			else delete fm.portrait;
		});
	}
}

/** The portrait, big: for a closer look, or to turn the screen to the players. */
class PortraitModal extends Modal {
	constructor(app: App, private portrait: Portrait, private name: string, private role: string) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-portrait-modal');
		const { contentEl } = this;
		contentEl.createEl('img', { cls: 'nimble-portrait-full', attr: { src: this.portrait.src, alt: `Portrait of ${this.name}` } });
		const cap = contentEl.createDiv({ cls: 'nimble-portrait-caption' });
		cap.createDiv({ cls: 'nimble-npc-name', text: this.name });
		if (this.role) cap.createDiv({ cls: 'nimble-npc-role', text: this.role });
		const file = this.portrait.file;
		if (file && Platform.isDesktopApp) {
			const btn = cap.createEl('button', { cls: 'nimble-portrait-popout' });
			setIcon(btn.createSpan(), 'picture-in-picture-2');
			btn.createSpan({ text: 'Show in its own window' });
			btn.addEventListener('click', () => {
				this.close();
				void this.app.workspace.openPopoutLeaf().openFile(file);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ImagePicker extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (f: TFile) => void) {
		super(app);
		this.setPlaceholder('Pick an image for the portrait');
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles()
			.filter(f => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(f: TFile): string {
		return f.path;
	}

	onChooseItem(f: TFile): void {
		this.onPick(f);
	}
}
