// A quick look on a note: its portrait, name, a line about it, and the page
// rendered in a modal over whatever you're doing, with Open page. The same look
// as Nimble's quick look (record-* classes), for systems with no stat-aware one.

import { App, Component, MarkdownRenderer, Modal, TFile } from 'obsidian';
import { portraitOf, renderAvatar } from './npc-card';
import { closePopover } from './popover';
import { pill } from './pill';
import { applyLook } from './look';
import { gameIcon } from './icons';

export interface NoteQuickLookTarget {
	file: TFile;
	sourcePath?: string;
	subtitle?: string;
	/** The game whose look the sheet takes (core/look.ts). */
	system?: string;
}

export function openNoteQuickLook(app: App, target: NoteQuickLookTarget): Modal {
	closePopover();
	const m = new NoteQuickLook(app, target);
	m.open();
	return m;
}

class NoteQuickLook extends Modal {
	private component = new Component();

	constructor(app: App, private target: NoteQuickLookTarget) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-record-modal');
		applyLook(this.modalEl, this.target.system);
		this.component.load();
		void this.render();
	}

	onClose(): void {
		this.component.unload();
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const { file, sourcePath = '' } = this.target;
		const el = this.contentEl;
		el.empty();
		const head = el.createDiv({ cls: 'record-head' });
		const portrait = portraitOf(this.app, file.path);
		if (portrait) renderAvatar(head, portrait, 'record-avatar');
		const titles = head.createDiv({ cls: 'record-titles' });
		titles.createDiv({ cls: 'record-title', text: file.basename });
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const sub = this.target.subtitle ?? (typeof fm?.role === 'string' ? fm.role : '');
		if (sub) titles.createDiv({ cls: 'record-sub', text: sub });
		const open = pill(head.createDiv({ cls: 'record-actions' }), { tag: 'button', cls: 'record-btn mod-cta', icon: this.target.system ? gameIcon('file-symlink') : 'file-symlink', text: 'Open page' });
		open.onclick = (e) => { this.close(); void this.app.workspace.openLinkText(file.path, sourcePath, e.metaKey || e.ctrlKey); };
		const text = await this.app.vault.cachedRead(file);
		const md = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
		await MarkdownRenderer.render(this.app, md || '*This page is empty.*', el.createDiv({ cls: 'record-body' }).createDiv({ cls: 'record-note markdown-rendered' }), file.path, this.component);
	}
}
