// One tooltip per element. Native `title` tooltips show up next to Obsidian's
// own, so anything inside our UI that gets a `title` has it moved into
// Obsidian's tooltip instead.

import { setTooltip } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';

const OURS = '[class*="nimble-"], [class*="campaign-"], [class*="bxe-"], [class*="encounter-"], [class*="bestiary-"], [class*="builder-"], [class*="hp-pad"]';

function convert(el: Element): void {
	if (!el.instanceOf(HTMLElement)) return;
	const title = el.getAttribute('title');
	if (!title || !el.closest(OURS)) return;
	el.removeAttribute('title');
	// One short line. setTooltip also becomes the element's accessible label.
	setTooltip(el, title, { delay: 350 });
}

function sweep(root: Element): void {
	if (root.hasAttribute('title')) convert(root);
	root.querySelectorAll?.('[title]').forEach(convert);
}

/** Documents (main window, pop-outs) already being watched. */
const watched = new WeakSet<Document>();

/** Moves our `title` tooltips into Obsidian's in one window, now and as they appear. Call for each pop-out window. */
export function watchTooltips(plugin: NimbleStatblocksPlugin, doc: Document): void {
	if (watched.has(doc)) return;
	watched.add(doc);
	const obs = new MutationObserver((records) => {
		for (const r of records) {
			if (r.type === 'attributes') convert(r.target as Element);
			else r.addedNodes.forEach(n => { if (n.instanceOf(Element)) sweep(n); });
		}
	});
	obs.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
	plugin.register(() => { obs.disconnect(); watched.delete(doc); });
	sweep(doc.body);
}

export function registerTooltips(plugin: NimbleStatblocksPlugin): void {
	// The main window, where the plugin loads, and any pop-out already open.
	watchTooltips(plugin, activeDocument);
	plugin.app.workspace.onLayoutReady(() => {
		sweep(activeDocument.body);
		plugin.app.workspace.iterateAllLeaves((leaf) => watchTooltips(plugin, leaf.view.containerEl.doc));
	});
}
