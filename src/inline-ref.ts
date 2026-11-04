// `nimble:Monster Name` inline references and their hover previews. Used by
// both Reading view (post processor) and Live Preview (editor widget).

import { Platform } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';

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
		unknown.setAttr('title', plugin.index.ready
			? `No stat block named "${monsterName}" found in this vault`
			: 'Indexing monsters…');
		return container;
	}

	container.addClass('nimble-inline-found');
	const name = container.createEl('a', { text: entry.name, cls: 'nimble-inline-name', attr: { href: '#', role: 'link' } });

	name.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (Platform.isMobile && plugin.settings.mobileTapToPreview) {
			if (name.dataset.previewShowing === 'true') {
				plugin.hover.hide();
				plugin.app.workspace.openLinkText(entry.filePath, sourcePath);
			} else {
				plugin.hover.show(name, entry);
				name.dataset.previewShowing = 'true';
			}
			return;
		}
		plugin.hover.hide();
		plugin.app.workspace.openLinkText(entry.filePath, sourcePath, e.metaKey || e.ctrlKey);
	});
	plugin.hover.attach(name, entry);

	const add = container.createEl('button', {
		text: '+',
		cls: 'nimble-inline-add-btn',
		attr: { 'aria-label': `Add ${entry.name} to encounter`, title: 'Add to encounter (Shift-click to add 2)' },
	});
	add.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor cursor where it is
	add.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void plugin.addToEncounter(entry.monster, entry.filePath, e.shiftKey ? 2 : 1);
	});

	return container;
}

/** Re-render every inline reference on screen, e.g. after the index changes. */
export function refreshInlineRefs(plugin: NimbleStatblocksPlugin, root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>('.nimble-inline-ref[data-nimble-ref]').forEach((el) => {
		if (el.closest('.cm-content')) return; // Live Preview widgets refresh themselves
		if (plugin.hover.isAnchoredIn(el)) plugin.hover.hide();
		const fresh = createInlineRef(plugin, el.dataset.nimbleRef || '', el.dataset.sourcePath || '');
		el.replaceWith(fresh);
	});
}

// ----------------------------------------------------------------------------

/** Owns the single floating stat block preview. */
export class HoverPreview {
	private el: HTMLElement | null = null;
	private anchor: HTMLElement | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;

	constructor(private plugin: NimbleStatblocksPlugin) {
		plugin.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.el) this.hide();
		});
		plugin.registerDomEvent(document, 'scroll', (e: Event) => {
			if (this.el && !this.el.contains(e.target as Node)) this.hide();
		}, { capture: true });
		plugin.registerDomEvent(document, 'click', (e: MouseEvent) => {
			const t = e.target as HTMLElement;
			if (this.el && !this.el.contains(t) && !t.closest('.nimble-inline-name')) this.hide();
		});
		plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', () => this.hide()));
		plugin.registerEvent(plugin.app.workspace.on('file-open', () => this.hide()));
		plugin.register(() => this.hide());
	}

	get isOpen(): boolean { return !!this.el; }

	/** True when the open preview belongs to an element inside `root`. */
	isAnchoredIn(root: Node): boolean {
		return !!this.anchor && root.contains(this.anchor);
	}

	attach(anchor: HTMLElement, entry: MonsterIndexEntry): void {
		if (Platform.isMobile) return;
		anchor.addEventListener('mouseenter', () => {
			this.cancelHide();
			if (this.showTimer) window.clearTimeout(this.showTimer);
			this.showTimer = window.setTimeout(() => this.show(anchor, entry), 300);
		});
		anchor.addEventListener('mouseleave', (e) => {
			if (this.showTimer) { window.clearTimeout(this.showTimer); this.showTimer = null; }
			const to = e.relatedTarget as Node | null;
			if (this.el && to && this.el.contains(to)) return;
			this.scheduleHide();
		});
	}

	show(anchor: HTMLElement, entry: MonsterIndexEntry): void {
		this.hide();
		this.anchor = anchor;
		const el = document.body.createDiv({ cls: 'nimble-hover-preview' });
		el.id = 'nimble-hover-preview-active';
		this.plugin.renderStatblock(el, entry.monster, entry.filePath, 'hover');
		el.addEventListener('mouseenter', () => this.cancelHide());
		el.addEventListener('mouseleave', (e) => {
			const to = e.relatedTarget as Node | null;
			if (to && anchor.contains(to)) return;
			this.scheduleHide();
		});
		this.el = el;
		this.position(el, anchor);
	}

	hide(): void {
		this.cancelHide();
		if (this.showTimer) { window.clearTimeout(this.showTimer); this.showTimer = null; }
		this.el?.remove();
		this.el = null;
		if (this.anchor) delete this.anchor.dataset.previewShowing;
		this.anchor = null;
		document.querySelectorAll<HTMLElement>('[data-preview-showing]').forEach(n => delete n.dataset.previewShowing);
	}

	private scheduleHide(): void {
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => this.hide(), 150);
	}

	private cancelHide(): void {
		if (this.hideTimer) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
	}

	private position(preview: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 12;
		preview.style.left = `${Math.max(margin, rect.left)}px`;
		preview.style.top = `${rect.bottom + 8}px`;

		const r = preview.getBoundingClientRect();
		if (r.right > vw - margin) preview.style.left = `${Math.max(margin, vw - r.width - margin)}px`;
		if (r.bottom > vh - margin) {
			const above = rect.top - r.height - 8;
			// Prefer above; if it doesn't fit either, pin to the top and let it scroll.
			preview.style.top = `${above >= margin ? above : margin}px`;
			if (above < margin) preview.style.maxHeight = `${vh - margin * 2}px`;
		}
	}
}
