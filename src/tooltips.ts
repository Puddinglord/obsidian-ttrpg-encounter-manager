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

export function registerTooltips(plugin: NimbleStatblocksPlugin): void {
	const sweep = (root: Element) => {
		if (root.hasAttribute('title')) convert(root);
		root.querySelectorAll?.('[title]').forEach(convert);
	};
	const obs = new MutationObserver((records) => {
		for (const r of records) {
			if (r.type === 'attributes') convert(r.target as Element);
			else r.addedNodes.forEach(n => { if (n.instanceOf(Element)) sweep(n); });
		}
	});
	// The main window, where the plugin loads.
	const body = activeDocument.body;
	obs.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
	plugin.register(() => obs.disconnect());
	plugin.app.workspace.onLayoutReady(() => sweep(body));
}
