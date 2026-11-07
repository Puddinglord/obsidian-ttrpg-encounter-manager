// `nimble:Monster Name` inline references and their hover previews. Used by
// both Reading view (post processor) and Live Preview (editor widget).

import { Component, MarkdownRenderer, Platform, setIcon, TFile } from 'obsidian';
import { openRecord } from './record-modal';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';
import { formatLevel, monsterRole } from './rules';
import { isPhone, isTouch } from './touch';

export const INLINE_PREFIX = 'nimble:';

export function parseInlineRef(text: string): string | null {
	if (!text.startsWith(INLINE_PREFIX)) return null;
	const name = text.slice(INLINE_PREFIX.length).trim();
	return name || null;
}

export function createInlineRef(plugin: NimbleStatblocksPlugin, monsterName: string, sourcePath: string): HTMLElement {
	const container = createSpan({ cls: 'nimble-inline-ref' });
	container.dataset.nimbleRef = monsterName;
	container.dataset.sourcePath = sourcePath;
	const entry = plugin.index.get(monsterName);

	if (!entry) {
		container.addClass('nimble-inline-unresolved');
		container.createSpan({ text: monsterName, cls: 'nimble-inline-name unresolved' });
		const unknown = container.createSpan({ text: '?', cls: 'nimble-inline-unknown' });
		unknown.setAttr('aria-label', 'Unknown monster');
		unknown.setAttr('title', plugin.index.ready ? 'Not found' : 'Indexing…');
		return container;
	}

	container.addClass('nimble-inline-found');
	if (entry.bundled) container.addClass('is-bundled');
	const role = monsterRole(entry.monster);
	container.addClass(`role-${role}`);
	const lvl = formatLevel(entry.monster.level);
	if (lvl || role === 'minion') {
		container.createSpan({
			cls: 'nimble-inline-level',
			text: lvl || 'min',
			attr: { title: role === 'legendary' ? `Level ${lvl} ${entry.monster.roleLabel || 'Legendary'}` : role === 'minion' ? 'Minion' : `Level ${lvl}` },
		});
	}
	const name = container.createEl('a', { text: entry.name, cls: 'nimble-inline-name', attr: { href: '#', role: 'link' } });

	name.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		plugin.hover.hide();
		// Cmd/Ctrl-click goes straight to the page; a plain click opens the quick look.
		if (e.metaKey || e.ctrlKey) { plugin.openMonster(entry, sourcePath, true); return; }
		openRecord(plugin, { kind: 'monster', entry, sourcePath });
	});
	plugin.hover.attach(name, entry);

	const add = container.createEl('button', {
		cls: 'nimble-inline-add-btn',
		attr: { 'aria-label': `Add ${entry.name}`, title: 'Add to encounter' },
	});
	setIcon(add, 'plus');
	add.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor cursor where it is
	add.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void plugin.addToEncounter(entry.monster, entry.filePath, e.shiftKey ? 2 : 1);
	});

	return container;
}

/** Re-render every inline reference on screen, e.g. after the index changes. */
export function refreshInlineRefs(plugin: NimbleStatblocksPlugin, root?: ParentNode): void {
	// By default, every window with a leaf in it: the main one and any popouts.
	const roots = new Set<ParentNode>(root ? [root] : [activeDocument]);
	if (!root) plugin.app.workspace.iterateAllLeaves((leaf) => { roots.add(leaf.view.containerEl.doc); });
	roots.forEach(r => r.querySelectorAll<HTMLElement>('.nimble-inline-ref[data-nimble-ref]').forEach((el) => {
		if (el.closest('.cm-content')) return; // Live Preview widgets refresh themselves
		if (plugin.hover.isAnchoredIn(el)) plugin.hover.hide();
		const fresh = createInlineRef(plugin, el.dataset.nimbleRef || '', el.dataset.sourcePath || '');
		el.replaceWith(fresh);
	}));
}

// ----------------------------------------------------------------------------

/**
 * Owns the single floating stat block preview. It stays open while the pointer
 * is over it, so dice, condition names and the action bar can be clicked.
 * Clicking inside pins it until Escape, ✕, or a click elsewhere.
 */
export class HoverPreview {
	private el: HTMLElement | null = null;
	private anchor: HTMLElement | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private pinned = false;
	private cleanup: (() => void) | null = null;
	/** Documents (main window, popouts) that already have the dismiss listeners. */
	private listening = new Set<Document>();

	constructor(private plugin: NimbleStatblocksPlugin) {
		this.listen(activeDocument);
		plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', () => { if (!this.pinned) this.hide(); }));
		plugin.registerEvent(plugin.app.workspace.on('file-open', () => this.hide()));
		plugin.register(() => this.hide());
	}

	/** Escape, scrolling away and clicking elsewhere close the preview. Once per window. */
	private listen(doc: Document): void {
		if (this.listening.has(doc)) return;
		this.listening.add(doc);
		const plugin = this.plugin;
		plugin.registerDomEvent(doc, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.el && !this.el.doc.querySelector('.nimble-popover')) this.hide();
		});
		plugin.registerDomEvent(doc, 'scroll', (e: Event) => {
			if (this.el && !this.pinned && !this.el.contains(e.target as Node)) this.hide();
		}, { capture: true });
		plugin.registerDomEvent(doc, 'pointerdown', (e: PointerEvent) => {
			const t = e.target as HTMLElement;
			if (!this.el || this.el.contains(t) || t.closest('.nimble-popover')) return;
			if (this.anchor && this.anchor.contains(t)) return;
			this.hide();
		});
	}

	get isOpen(): boolean { return !!this.el; }

	/** True when the open preview belongs to an element inside `root`. */
	isAnchoredIn(root: Node): boolean {
		return !!this.anchor && root.contains(this.anchor);
	}

	/** Show the preview after a short hover. `entry` may be a function so callers can resolve late. */
	attach(anchor: HTMLElement, entry: MonsterIndexEntry | (() => MonsterIndexEntry | undefined)): void {
		if (Platform.isMobile) return;
		anchor.addEventListener('mouseenter', () => {
			this.cancelHide();
			if (this.el && this.anchor === anchor) return;
			if (this.showTimer) window.clearTimeout(this.showTimer);
			this.showTimer = window.setTimeout(() => {
				const e = typeof entry === 'function' ? entry() : entry;
				if (e && anchor.isConnected) this.show(anchor, e);
			}, 350);
		});
		anchor.addEventListener('mouseleave', (e) => {
			if (this.showTimer) { window.clearTimeout(this.showTimer); this.showTimer = null; }
			const to = e.relatedTarget as Node | null;
			if (this.el && to && this.el.contains(to)) return;
			if (!this.pinned) this.scheduleHide();
		});
	}

	show(anchor: HTMLElement, entry: MonsterIndexEntry, pinned = false): void {
		const body = this.frame(anchor, entry.name, `${entry.name} stat block`, pinned,
			() => this.plugin.openMonster(entry, anchor.closest<HTMLElement>('[data-source-path]')?.dataset.sourcePath ?? ''));
		this.plugin.renderStatblock(body, entry.monster, entry.filePath, 'hover', undefined, {
			actions: this.plugin.monsterActions(entry),
		});
		this.finish(anchor);
	}

	/** A note (an NPC, a place) in the same card: tap a link once to look, again to go. */
	showNote(anchor: HTMLElement, file: TFile, sourcePath: string, subtitle?: string): void {
		// The card has its own title, so the bar stays empty.
		const body = this.frame(anchor, '', file.basename, true,
			() => void this.plugin.app.workspace.openLinkText(file.path, sourcePath, false));
		const card = body.createDiv({ cls: 'hover-note' });
		const head = card.createDiv({ cls: 'hover-note-head' });
		setIcon(head.createSpan({ cls: 'hover-note-icon' }), 'user-round');
		const t = head.createDiv({ cls: 'hover-note-titles' });
		t.createDiv({ cls: 'hover-note-title', text: file.basename });
		if (subtitle) t.createDiv({ cls: 'hover-note-sub', text: subtitle });
		const content = card.createDiv({ cls: 'hover-note-body markdown-rendered' });
		const component = new Component();
		component.load();
		this.cleanup = () => component.unload();
		void this.plugin.app.vault.cachedRead(file).then((text) => {
			if (!this.el || !content.isConnected) return;
			const md = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
			void MarkdownRenderer.render(this.plugin.app, md || '*Empty note*', content, file.path, component);
		});
		const actions = card.createDiv({ cls: 'statblock-actions' });
		const open = actions.createEl('button', { cls: 'statblock-action mod-cta' });
		setIcon(open.createSpan({ cls: 'statblock-action-icon' }), 'file-symlink');
		open.createSpan({ text: 'Open note' });
		open.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.hide(); void this.plugin.app.workspace.openLinkText(file.path, sourcePath, e.metaKey || e.ctrlKey); });
		this.finish(anchor);
	}

	/** The card's shell: header bar (with Open on touch), body. */
	private frame(anchor: HTMLElement, name: string, label: string, pinned: boolean, openIt: () => void): HTMLElement {
		this.hide();
		this.anchor = anchor;
		this.pinned = pinned;
		// In the anchor's own window, so it shows up in popouts too.
		this.listen(anchor.doc);
		const el = anchor.doc.body.createDiv({ cls: 'nimble-hover-preview' });
		el.id = 'nimble-hover-preview-active';
		el.setAttr('role', 'dialog');
		el.setAttr('aria-label', label);
		const bar = el.createDiv({ cls: 'hover-preview-bar' });
		bar.createSpan({ cls: 'hover-preview-hint', text: isPhone() ? name : pinned ? 'Pinned' : '' });
		if (isTouch()) {
			const go = bar.createEl('button', { cls: 'hover-preview-open', text: 'Open' });
			go.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); openIt(); });
		}
		const close = bar.createEl('button', { cls: 'clickable-icon hover-preview-close', attr: { 'aria-label': 'Close preview' } });
		setIcon(close, 'x');
		close.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
		this.makeDraggable(el, bar);
		const body = el.createDiv({ cls: 'hover-preview-body' });
		el.addEventListener('mouseenter', () => this.cancelHide());
		el.addEventListener('mouseleave', (e) => {
			const to = e.relatedTarget as Node | null;
			if (this.pinned) return;
			if (to && (anchor.contains(to) || (to as HTMLElement).closest?.('.nimble-popover'))) return;
			this.scheduleHide();
		});
		el.addEventListener('mousedown', () => this.pin());
		if (pinned) el.addClass('is-pinned');
		this.el = el;
		anchor.dataset.previewShowing = 'true';
		return body;
	}

	private finish(anchor: HTMLElement): void {
		const el = this.el;
		if (!el) return;
		if (isPhone()) {
			// Phones: a bottom sheet. Scroll the note so what you tapped stays visible above it,
			// so a second tap on it opens the page.
			el.addClass('is-sheet');
			el.prepend(createDiv({ cls: 'sheet-handle', attr: { 'aria-hidden': 'true' } }));
			this.pin();
			el.win.requestAnimationFrame(() => this.keepAnchorVisible(anchor, el));
		} else {
			this.position(el, anchor);
		}
	}

	private keepAnchorVisible(anchor: HTMLElement, sheet: HTMLElement): void {
		const scroller = anchor.closest<HTMLElement>('.markdown-preview-view, .cm-scroller, .view-content');
		if (!scroller || !anchor.isConnected) return;
		const a = anchor.getBoundingClientRect();
		const sheetTop = sheet.getBoundingClientRect().top;
		// On phones the view header floats over the note; land just below it.
		const header = anchor.closest('.workspace-leaf-content')?.querySelector('.view-header')?.getBoundingClientRect().bottom ?? 0;
		const top = Math.max(scroller.getBoundingClientRect().top, header) + 16;
		if (a.top >= top && a.bottom < sheetTop - 12) return;
		scroller.scrollBy({ top: a.top - top, behavior: 'smooth' });
	}

	/** Drag the card by its top bar (that also pins it). Not on phones, where it's a sheet. */
	private makeDraggable(el: HTMLElement, bar: HTMLElement): void {
		bar.addClass('is-draggable');
		bar.addEventListener('pointerdown', (e: PointerEvent) => {
			if (el.hasClass('is-sheet') || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
			e.preventDefault();
			this.pin();
			const r = el.getBoundingClientRect();
			const dx = e.clientX - r.left, dy = e.clientY - r.top;
			el.addClass('is-dragging');
			bar.setPointerCapture(e.pointerId);
			const win = el.win;
			const move = (ev: PointerEvent) => {
				const x = Math.max(4 - r.width + 60, Math.min(win.innerWidth - 60, ev.clientX - dx));
				const y = Math.max(4, Math.min(win.innerHeight - 40, ev.clientY - dy));
				el.style.left = `${x}px`;
				el.style.top = `${y}px`;
				el.style.maxHeight = `${Math.max(200, win.innerHeight - y - 12)}px`;
			};
			const up = () => { el.removeClass('is-dragging'); bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
			bar.addEventListener('pointermove', move);
			bar.addEventListener('pointerup', up);
			bar.addEventListener('pointercancel', up);
		});
	}

	pin(): void {
		if (!this.el || this.pinned) return;
		this.pinned = true;
		this.cancelHide();
		this.el.addClass('is-pinned');
		const hint = this.el.querySelector('.hover-preview-hint');
		if (hint && !this.el.hasClass('is-sheet')) hint.textContent = 'Pinned';
	}

	hide(): void {
		const doc = this.el?.doc ?? this.anchor?.doc ?? activeDocument;
		this.cancelHide();
		if (this.showTimer) { window.clearTimeout(this.showTimer); this.showTimer = null; }
		this.el?.remove();
		this.el = null;
		this.cleanup?.();
		this.cleanup = null;
		this.pinned = false;
		if (this.anchor) delete this.anchor.dataset.previewShowing;
		this.anchor = null;
		doc.querySelectorAll<HTMLElement>('[data-preview-showing]').forEach(n => delete n.dataset.previewShowing);
	}

	private scheduleHide(): void {
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => {
			// Leave it while a condition popover opened from inside is showing.
			if (this.el && this.el.doc.querySelector('.nimble-popover') && this.el.matches(':hover')) return;
			this.hide();
		}, 300);
	}

	private cancelHide(): void {
		if (this.hideTimer) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
	}

	/** Below the anchor if it fits, else above; never on top of the anchor (it would block clicks on it). */
	private position(preview: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const vw = anchor.win.innerWidth;
		const vh = anchor.win.innerHeight;
		const margin = 12;
		const gap = 6;
		preview.style.left = `${Math.max(margin, rect.left)}px`;
		const r = preview.getBoundingClientRect();
		if (r.right > vw - margin) preview.style.left = `${Math.max(margin, vw - r.width - margin)}px`;

		const below = vh - rect.bottom - gap - margin;
		const above = rect.top - gap - margin;
		if (r.height <= below || below >= above) {
			preview.style.top = `${rect.bottom + gap}px`;
			if (r.height > below) preview.style.maxHeight = `${Math.max(160, below)}px`;
		} else {
			const h = Math.min(r.height, above);
			preview.style.top = `${rect.top - gap - h}px`;
			if (r.height > above) preview.style.maxHeight = `${above}px`;
		}
	}
}
