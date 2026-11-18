// Vertical-centring check for pills, chips and small buttons: every icon and
// line of text inside one should sit on its centre line. Runs in the page.
//
//   import { pillOffenders } from './align.mjs'
//   const bad = await o.page.evaluate(pillOffenders, { root: '.nimble-sheet', tolerance: 1.5 })
//
// `root` may match several elements; each is measured. Returns [{ el, part, offset }] for anything more than `tolerance` px off the
// centre line, an icon and label more than `tolerance` px apart, or an icon closer
// than `gap` px to its label.

/** Selectors for everything that's drawn as a pill, chip or compact button with an icon and/or a label. */
export const PILL_SELECTORS = [
	'.ns-add', '.ns-roll', '.ns-chip', '.ns-cond', '.ns-cond-add', '.ns-cond-x', '.ns-lang', '.ns-coin', '.ns-rest-btn', '.ns-step', '.ns-tab', '.ns-equip', '.ns-remove',
	'.ns-actions-end', '.ns-reaction-cost', '.ns-reaction-used', '.rd-cost', '.rd-roll',
	'.nimble-npc-pill', '.campaign-role-pill', '.campaign-hero-you', '.lore-tag', '.battle-outcome', '.battle-fact',
	'.lu-tag', '.lu-gain', '.lu-count', '.lu-dot', '.lu-back', '.lu-next', '.lu-sub-tab', '.lu-sub-band-choose', '.lu-skill-budget', '.lu-skill-move', '.lu-skill-reset',
	'.lu-step-btn', '.lu-celebrate-chip', '.lu-view-toggle button', '.lu-badge',
	'.nimble-spotlight-chip', '.nimble-difficulty', '.encounter-count', '.bestiary-tag', '.statblock-action', '.rd-seg-btn', '.rd-mode-btn',
	'.nimble-cmpx-chip', '.nimble-cmpx-pill', '.nimble-cmpx-tag', '.nimble-cmpx-pill-tag', '.nimble-cmp-back', '.nimble-count-seg', '.ev-term-tag',
	'.nimble-inline-ref', '.nimble-cmpx-seg', '.nimble-cmpx-row-badge', '.nimble-slash-badge', '.nimble-spot-tag', '.encounter-chip',
	'.dnd5e-cr', '.dnd5e-level', '.dnd5e-death-stable', '.dnd5e-death-dead', '.dnd5e-condition', '.dnd5e-condition-add', '.dnd5e-hp-text', '.dnd5e-death-roll', '.dnd5e-tracker-combat button',
	'.dnd5e-encounter-actions button', '.dnd5e-sheet-actions button', '.dnd5e-sheet-roll', '.dnd5e-sheet-tag', '.dnd5e-cmp-badge', '.dnd5e-sheet-add',
	'.dnd5e-sheet-toggle', '.dnd5e-cmp-editions button', '.dnd5e-npc-fight', '.record-btn', '.stat-badge', '.add-btn',
	'.eb-pick', '.eb-pick-given', '.dnd5e-brief-chip',
];

export function pillOffenders({ root = 'body', tolerance = 1.5, gap = 3, selectors }) {
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
		return { top: baseline - cap, bottom: baseline, height: cap, left: rect.left, right: rect.right };
	};
	// Every match of `root` (hidden ones, like a background tab's reading view, measure nothing).
	const scopes = [...document.querySelectorAll(root)];
	if (!scopes.length) return [{ el: root, part: 'missing root', offset: 0 }];
	const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ''}`;
	for (const el of new Set(scopes.flatMap(scope => [...scope.querySelectorAll(selectors.join(','))]))) {
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
		// And an icon keeps clear of its label: at least `gap` px between the icon's box and the nearest word.
		const texts = parts.filter(([part, r]) => part === 'text' && r.height).map(([, r]) => r);
		for (const [part, r] of parts) {
			if (part !== 'icon' || !r.width || !texts.length) continue;
			const space = Math.min(...texts.map(t => Math.max(t.left - r.right, r.left - t.right)));
			if (space < gap) out.push({ el: name(el), part: 'icon gap', offset: Math.round(space * 10) / 10 });
		}
	}
	return out;
}
