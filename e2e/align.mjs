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
	'.ns-actions-end', '.ns-reaction-used', '.rd-cost', '.rd-roll',
	'.ns-btn', '.ns-state', '.ns-cond-name', '.ns-rc-cost', '.ns-turn-pair', '.ev-face', '.ev-face-remove',
	'.nimble-npc-pill', '.campaign-role-pill', '.campaign-hero-you', '.lore-tag', '.battle-outcome', '.battle-fact',
	'.lu-tag', '.lu-gain', '.lu-count', '.lu-dot', '.lu-back', '.lu-next', '.lu-sub-tab', '.lu-sub-band-choose', '.lu-skill-budget', '.lu-skill-move', '.lu-skill-reset',
	'.lu-step-btn', '.lu-celebrate-chip', '.lu-view-toggle button', '.lu-badge', '.lu-chip', '.lu-key-tag', '.lu-level-tag', '.lu-reset', '.lu-view-btn', '.lu-compare-choose', '.lu-option-less',
	'.nimble-omnisearch-chip', '.nimble-difficulty', '.encounter-count', '.bestiary-tag', '.statblock-action', '.rd-seg-btn', '.rd-mode-btn',
	'.nimble-cmpx-chip', '.nimble-cmpx-pill', '.nimble-cmpx-tag', '.nimble-cmpx-pill-tag', '.nimble-cmp-back', '.nimble-count-seg', '.ev-term-tag',
	'.nimble-inline-ref', '.nimble-cmpx-seg', '.nimble-cmpx-row-badge', '.nimble-slash-badge', '.nimble-spot-tag', '.encounter-chip',
	'.dnd5e-death-stable', '.dnd5e-death-dead', '.dnd5e-condition', '.dnd5e-condition-add', '.dnd5e-hp-text', '.dnd5e-death-roll', '.dnd5e-tracker-combat button',
	'.dnd5e-encounter-actions button', '.dnd5e-sheet-actions button', '.dnd5e-sheet-roll', '.dnd5e-sheet-tag', '.dnd5e-cmp-badge', '.dnd5e-sheet-add',
	'.dnd5e-sheet-toggle', '.dnd5e-cmp-editions button', '.dnd5e-npc-fight', '.record-btn', '.stat-badge', '.add-btn',
	'.eb-pick', '.eb-pick-given', '.dnd5e-brief-chip', '.dnd5e-roll-btn',
	'.dnd5e-tab', '.dnd5e-sheet-condition', '.dnd5e-sheet-condition-add', '.dnd5e-sheet-death-roll', '.dnd5e-turn-action', '.dnd5e-sheet-gold', '.dnd5e-qty',
	'.ev-cond-add-trigger', '.ev-cond-apply', '.ev-cond-new', '.ev-effect-actions button', '.ev-effect-done',
	// 5e's sheet and NPC mini sheet (design pass): damage rolls, Cast, save DCs, Inspiration, feature and action names, the NPC's buttons.
	'.dnd5e-dmg', '.dnd5e-cast-btn', '.dnd5e-dc', '.dnd5e-insp', '.dnd5e-feature-toggle', '.dnd5e-rest-btn', '.dnd5e-npc-btn', '.dnd5e-npc-fold',
	'.dnd5e-npc-roll', '.dnd5e-npc-act-name', '.dnd5e-npc-skill', '.dnd5e-npc-empty', '.dnd5e-npc-save', '.dnd5e-plate-n', '.dnd5e-npc-ab-m',
	// NPC cards, campaign notes and the Campaign panel (the armor chip's letter sits on its shield: measured on its own).
	'.nimble-npc-stat:not(.is-armor)', '.nimble-npc-fight', '.nimble-npc-link', '.save-mark',
	'.ev-cq-kicker', '.ev-cq-fact', '.ev-cq-who', '.ev-cq-stamp', '.ev-cq-change', '.ev-cq-loot-item', '.ev-cq-secret-label', '.ev-cq-read-label',
	'.ev-cq-mons-label', '.campaign-quest', '.campaign-continue', '.campaign-switch-btn', '.campaign-search',
	// The trackers (core/tracker/flow.ts and each game's view): the card's buttons, the turn control, the ticker,
	// conditions on the card, the side switch, moments, the keypad's quiet chips, the encounter blocks' buttons.
	'.ev-card-btn', '.ev-foot-primary', '.ev-foot-second', '.ev-ticker', '.condition-tag', '.phase-pill', '.nimble-phase-chip', '.group-attack',
	'.laststand-btn', '.ev-moment-btn', '.hp-pad-qa', '.hp-pad-choice', '.dnd5e-ribbon', '.dnd5e-roll-all', '.encounter-block-btn', '.dnd5e-init-roll', '.dnd5e-init-set',
	// Builders and dialogs (design pass): the game dialog's buttons, the roll dialog, Add several, the encounter builder and its
	// balance, the party editor's buttons, the map's toolbar, pin labels and tokens, the Edit pencil, the roll toast's tag.
	'.ev-dialog-btn', '.rd-mode-btn', '.builder-party', '.builder-level', '.builder-pick-meta', '.balance-targets > button', '.nimble-party-btn',
	'.nimble-map-btn', '.nimble-map-pin-label', '.ev-roll-tag', '.eb-verdict', '.eb-check-tag',
	// The compendiums (design pass): a card's kind, facts, tags and level boxes; Omnisearch's and the slash menu's
	// squares; the browser's keys, sort buttons, art level chip, group headings and a card's folding rows.
	'.nimble-cmp-kind', '.nimble-cmp-fact', '.nimble-cmp-tag', '.nimble-cmp-draft', '.nimble-cmp-count', '.nimble-cmp-level-badge', '.nimble-cmp-summary',
	'.nimble-spot-icon', '.nimble-slash-icon', '.nimble-omnisearch-die', '.nimble-cmpx-kbd', '.nimble-cmpx-sort-dir', '.nimble-cmpx-sort-add', '.nimble-cmpx-sort-reset',
	'.nimble-art-level', '.nimble-cmpx-group', '.bestiary-back',
	// Importing a D&D Beyond character: the checklist's New and "levels 8–9" tags.
	'.dnd5e-ddb-tag',
	// Nimble's builders for a hero's content: what a level grants in the check, a feature's grants, the stats said, the level ladder.
	'.ncb-grant', '.ncb-grant-label', '.ncb-grant-add', '.ncb-said', '.ncb-rung',
	// The builders (core/builder/frame.ts): step dots, kinds, segments, the footer's buttons and the phone sheet's, steppers,
	// text buttons, the level chip, Edit and the review's fixes, the dice field, speed modes, the book's average, a class's motifs.
	'.eb-dot', '.eb-kind', '.eb-seg-btn', '.eb-back', '.eb-next', '.eb-create', '.eb-preview-btn', '.eb-sheet-close', '.eb-num-btn', '.eb-icon-btn',
	'.eb-text-btn', '.eb-chip', '.eb-review-edit', '.eb-note-fix', '.eb-df-step', 'button.eb-df-seg', '.eb-mode-toggle', '.eb-pill', '.eb-auto', '.ncb-motif',
	// Sheets: Nimble's feature names, a reaction card's foot and the head's tools; 5e's spell remove, equip and item menu buttons,
	// the NPC's ability scores, temp HP.
	'.ns-feat-name', '.ns-rc-foot', '.ns-icon-btn', '.dnd5e-sheet-x', '.dnd5e-equip', '.dnd5e-item-more', '.dnd5e-npc-ab-s', '.ns-meter-extra',
	// Rolls and dice in rules text, DC pills in tables, the condition picker's durations, the 5e tracker's initiative (not
	// its gem: the number sits on the gem's shape).
	'.dnd5e-roll', '.nimble-dice', '.nimble-dc', '.nimble-segmented > button', '.dnd5e-init:not(.dnd5e-gem)',
	// The HP keypad's keys, modes, toggles and buttons; the trackers' card icons and Back; key steppers in dialogs.
	'.hp-pad-keys > button', '.hp-pad-mode', '.hp-pad-toggles > button', '.hp-pad-close', '.hp-pad-cancel', '.hp-pad-apply',
	'.ev-card-icon', '.ev-foot-back', '.ev-keys > button', '.rd-step-btn',
	// A dialog's segmented choice on one line, not a choice's name over its numbers (New character's arrays). The wizard's
	// (.lu-seg) stack their lines in a column, so they keep their own rule; the rest are in the shared one.
	'.ev-seg > button:not(:has(.lu-seg-sub))',
	// Edit pencils and small buttons on notes: a stat block's hint fixes, a box's icon, an NPC portrait's edit, a rules card's link.
	'.nimble-issue-fix', '.nimble-block-edit', '.nimble-box-icon', '.nimble-npc-portrait-edit', '.ev-term-open',
	// A map token's letter and a party member's avatar: centred in their disc.
	'.nimble-map-token-text', '.campaign-hero-avatar',
	// Measured but not in the shared rule: links to notes sit on their sentence's baseline (like .nimble-inline-ref), and
	// Obsidian's icon buttons (ours wear its class too) are Obsidian's to centre.
	'.nimble-note-link', '.clickable-icon',
];

/**
 * Pill-like to the visual check's eye (a small rounded box with a short label) but not a pill, so it's neither measured
 * as one nor listed as missing from PILL_SELECTORS. Each with why.
 */
export const NOT_PILLS = [
	// A rules word you can tap (core/rule-term-ui.ts): a word in its sentence, or a label, underlined. Text, not a pill.
	'.ev-term',
	// Boxes that hold pills, each measured on its own: segmented controls, the builder's speed modes, the compendium's search field.
	'.eb-seg', '.eb-mode', '.nimble-segmented', '.dnd5e-cmp-editions', '.nimble-cmpx-field',
	// Rows, names and two-line buttons: a sheet row (its name over its detail), the conditions row, a Campaign panel note, the 5e tracker's name.
	'.ns-row-toggle', '.ns-conds-row', '.campaign-note', '.dnd5e-combatant-name',
	// A box's heading (tapped, it folds the box): a title across the box's head.
	'.nimble-box-title',
	// Checkboxes and marks: a quest objective's box, the tracker's turn mark.
	'.ev-cq-box', '.ev-mark',
	// A map pin: its icon sits in the pin's round head, not its box's middle (its label is .nimble-map-pin-label).
	'.nimble-map-pin-icon',
	// Obsidian's own buttons in its own rows (a modal's, a setting's): its look and its centring.
	'.modal-button-container > button', '.setting-item-control > button',
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
		// Where it is, so a report can outline it.
		const rect = { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) };
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
			if (Math.abs(offset) > tolerance) out.push({ el: name(el), part, offset: Math.round(offset * 10) / 10, rect });
		}
		// An icon and its label have to agree with each other too, not just each be near the middle.
		if (offs.length > 1) {
			const spread = Math.max(...offs.map(([, v]) => v)) - Math.min(...offs.map(([, v]) => v));
			if (spread > tolerance) out.push({ el: name(el), part: 'icon vs text', offset: Math.round(spread * 10) / 10, rect });
		}
		// And an icon keeps clear of its label: at least `gap` px between the icon's box and the nearest word.
		const texts = parts.filter(([part, r]) => part === 'text' && r.height).map(([, r]) => r);
		for (const [part, r] of parts) {
			if (part !== 'icon' || !r.width || !texts.length) continue;
			const space = Math.min(...texts.map(t => Math.max(t.left - r.right, r.left - t.right)));
			if (space < gap) out.push({ el: name(el), part: 'icon gap', offset: Math.round(space * 10) / 10, rect });
		}
	}
	return out;
}
