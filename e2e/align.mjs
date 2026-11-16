// Vertical-centring check for pills, chips and small buttons: every icon and
// line of text inside one should sit on its centre line. Runs in the page.
//
//   import { pillOffenders } from './align.mjs'
//   const bad = await o.page.evaluate(pillOffenders, { root: '.nimble-sheet', tolerance: 1.5 })
//
// Returns [{ el, part, offset }] for anything more than `tolerance` px off the
// centre line, or an icon and label more than `tolerance` px apart.

/** Selectors for everything that's drawn as a pill, chip or compact button with an icon and/or a label. */
export const PILL_SELECTORS = [
	'.ns-add', '.ns-roll', '.ns-chip', '.ns-cond', '.ns-cond-add', '.ns-cond-x', '.ns-lang', '.ns-coin', '.ns-rest-btn', '.ns-step', '.ns-tab', '.ns-equip', '.ns-remove',
	'.ns-actions-end', '.ns-reaction-cost', '.ns-reaction-used', '.rd-cost', '.rd-roll',
	'.nimble-npc-pill', '.campaign-role-pill', '.campaign-hero-you', '.lore-tag', '.battle-outcome', '.battle-fact',
	'.lu-tag', '.lu-gain', '.lu-count', '.lu-dot', '.lu-back', '.lu-next', '.lu-sub-tab', '.lu-sub-band-choose', '.lu-skill-budget', '.lu-skill-move', '.lu-skill-reset',
	'.lu-step-btn', '.lu-celebrate-chip', '.lu-view-toggle button', '.lu-badge',
	'.nimble-spotlight-chip', '.nimble-difficulty', '.encounter-count', '.bestiary-tag', '.statblock-action', '.rd-seg-btn', '.rd-mode-btn',
	'.nimble-cmpx-chip', '.nimble-cmpx-pill', '.nimble-cmpx-tag', '.nimble-cmpx-pill-tag', '.nimble-cmp-back', '.nimble-count-seg',
	'.nimble-map-btn', '.nimble-map-seg', '.nimble-map-chip', '.nimble-clock-step',
];

export function pillOffenders({ root = 'body', tolerance = 1.5, selectors }) {
	const out = [];
	// Where the letters actually are, not the line box: the capitals' middle is what the eye centres on.
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	// The font's ascent as layout uses it (canvas metrics are rounded differently), measured once per font
	// in a plain block of text: a baseline marker's top minus the text's top.
	const ascents = new Map();
	const layoutAscent = (cs) => {
		const key = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		if (ascents.has(key)) return ascents.get(key);
		const probe = document.createElement('div');
		probe.style.cssText = `position:absolute;left:-9999px;top:0;display:block;line-height:normal;font:${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily};`;
		const text = document.createTextNode('Hg');
		const mark = document.createElement('span');
		mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
		probe.append(text, mark);
		document.body.append(probe);
		const r = document.createRange();
		r.selectNodeContents(probe);
		const top = r.getClientRects()[0].top;
		const a = mark.getBoundingClientRect().top - top;
		probe.remove();
		ascents.set(key, a);
		return a;
	};
	const glyphBox = (textNode, rect) => {
		const cs = getComputedStyle(textNode.parentElement);
		ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		// Text is centred optically on its capitals (baseline to cap height); descenders and ascenders don't count.
		const cap = ctx.measureText('H').actualBoundingBoxAscent;
		const baseline = rect.top + layoutAscent(cs);
		return { top: baseline - cap, bottom: baseline, height: cap };
	};
	const scope = document.querySelector(root);
	if (!scope) return [{ el: root, part: 'missing root', offset: 0 }];
	const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ''}`;
	for (const el of scope.querySelectorAll(selectors.join(','))) {
		const box = el.getBoundingClientRect();
		if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
		const cs = getComputedStyle(el);
		// The content box's centre: padding can be uneven on purpose, borders are symmetric.
		const top = box.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
		const bottom = box.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
		const mid = (top + bottom) / 2;
		const parts = [];
		const walk = (node) => {
			for (const n of node.childNodes) {
				if (n.nodeType === 3 && n.textContent.trim()) {
					const r = document.createRange();
					r.selectNodeContents(n);
					const rects = [...r.getClientRects()];
					// One line only: wrapped text is centred as a block, not per line.
					if (rects.length === 1) parts.push(['text', glyphBox(n, rects[0])]);
				} else if (n.nodeType === 1) {
					const c = n;
					if (getComputedStyle(c).display === 'none') continue;
					if (c.tagName.toLowerCase() === 'svg') parts.push(['icon', c.getBoundingClientRect()]);
					else walk(c);
				}
			}
		};
		walk(el);
		const offs = parts.filter(([, r]) => r.height).map(([part, r]) => [part, (r.top + r.bottom) / 2 - mid]);
		for (const [part, offset] of offs) {
			if (Math.abs(offset) > tolerance) out.push({ el: name(el), part, offset: Math.round(offset * 10) / 10 });
		}
		// An icon and its label have to agree with each other too, not just each be near the middle.
		if (offs.length > 1) {
			const spread = Math.max(...offs.map(([, v]) => v)) - Math.min(...offs.map(([, v]) => v));
			if (spread > tolerance) out.push({ el: name(el), part: 'icon vs text', offset: Math.round(spread * 10) / 10 });
		}
	}
	return out;
}
