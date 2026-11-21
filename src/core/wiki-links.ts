// [[Wiki links]] inside text the plugin renders itself (stat blocks, cards):
// resolved against the vault, opened like Obsidian's own links, with hover previews.
// A link to a note that doesn't exist says so, rather than making an empty note
// wherever new notes go (the vault's root, by default).

import { App, Notice, PaneType } from 'obsidian';

/** The note a link's text points at ("Lower Gate#Cells|cells" → "Lower Gate"). */
const linkpathOf = (linktext: string) => linktext.split('|')[0].split('#')[0].trim();

/** Does a link go somewhere? A link to a heading of this note ("#Cells") always does. */
export function linkResolves(app: App, linktext: string, sourcePath: string): boolean {
	const path = linkpathOf(linktext);
	return !path || !!app.metadataCache.getFirstLinkpathDest(path, sourcePath);
}

/** Say a link goes nowhere. */
export function noteMissing(linktext: string): void {
	new Notice(`No note called "${linkpathOf(linktext)}".`);
}

/** Open a link from one of our blocks as Obsidian does, except a link to nothing: a notice, not a new empty note. */
export function openLink(app: App, linktext: string, sourcePath: string, newLeaf: boolean | PaneType = false): void {
	if (!linkResolves(app, linktext, sourcePath)) { noteMissing(linktext); return; }
	void app.workspace.openLinkText(linktext, sourcePath, newLeaf);
}

/**
 * Obsidian's own links drawn inside one of our blocks (a box, an NPC card's rows): a click on one
 * that goes nowhere says so instead of making the note.
 */
export function guardLinks(el: HTMLElement, app: App, sourcePath: string): void {
	const stop = (e: MouseEvent) => {
		const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.internal-link');
		if (!a || !el.contains(a)) return;
		const target = a.dataset.href ?? a.getAttr('href') ?? '';
		if (linkResolves(app, target, sourcePath)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.type === 'click' || e.button === 1) noteMissing(target);
	};
	el.addEventListener('click', stop, true);
	el.addEventListener('auxclick', stop, true);
}

export function wireWikiLinks(container: HTMLElement, app: App, sourcePath: string): void {
	container.querySelectorAll<HTMLAnchorElement>('a.nimble-wikilink').forEach((anchor) => {
		const target = anchor.dataset.link || anchor.textContent || '';
		const linkpath = target.split('#')[0];
		const resolved = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		anchor.dataset.href = target;
		// Never put raw link text in href: [[javascript:...]] must not be followable.
		anchor.setAttr('href', resolved ? resolved.path : '#');
		if (!resolved) anchor.addClass('is-unresolved');

		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			openLink(app, target, sourcePath, e.metaKey || e.ctrlKey);
		});
		anchor.addEventListener('auxclick', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.button === 1) openLink(app, target, sourcePath, true);
		});
		anchor.addEventListener('mouseover', (event) => {
			app.workspace.trigger('hover-link', {
				event,
				source: 'nimble-gm',
				hoverParent: container,
				targetEl: anchor,
				linktext: target,
				sourcePath,
			});
		});
	});
}
