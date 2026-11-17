// [[Wiki links]] inside text the plugin renders itself (stat blocks, cards):
// resolved against the vault, opened like Obsidian's own links, with hover previews.

import { App } from 'obsidian';

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
			const newLeaf = e.metaKey || e.ctrlKey;
			void app.workspace.openLinkText(target, sourcePath, newLeaf);
		});
		anchor.addEventListener('auxclick', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.button === 1) void app.workspace.openLinkText(target, sourcePath, true);
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
