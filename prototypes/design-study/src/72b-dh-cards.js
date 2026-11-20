/* ============================================================================
   Daggerheart domain cards, drawn as cards (pass 4).
   The book's card (CR p.26): a level pennant at the top left with the domain's
   mark under the number, the recall token at the top right, art on the top
   half, a gold band with the type plate, the name in heavy caps, the feature.
   Ours: the same frame, drawn fresh (SVG, no clip-path), with a placeholder
   where the art goes (the player's own art can fill it). Original card text.
   The loadout is a hand: fanned (hover or tap lifts a card; tap again opens
   it), at every width. Grid and carousel live on the design-system page.
   ========================================================================== */
Object.assign(DOM_GLYPH, {
	Arcana: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5 13.4 10.6 17.5 12 13.4 13.4 12 17.5 10.6 13.4 6.5 12 10.6 10.6Z"/>',
	Midnight: '<path d="M15.5 3.5A8.5 8.5 0 1 0 20.5 15 7 7 0 0 1 15.5 3.5Z"/>',
	Sage: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z"/><path d="M5 19 13 11"/>',
	Codex: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5Z"/><path d="M12 6v13"/>',
	Grace: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
	Bone: '<path d="M7 4.5a2 2 0 0 0-2.5 2.5 2 2 0 0 0 1 3.5L14 19a2 2 0 0 0 3.5 1 2 2 0 0 0 2.5-2.5 2 2 0 0 0-1-3.5L10.5 5.5A2 2 0 0 0 7 4.5Z"/>',
	Splendor: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
});

/** Kael's cards. Names and text are ours. */
const DHCARDS = {
	gate: { dom: 'Valor', lv: 1, type: 'Ability', name: 'Hold the Gate', recall: 0, text: [['When an ally within Close would be hit, **mark a Stress** to step in: the attack targets you instead.']] },
	ring: { dom: 'Blade', lv: 1, type: 'Ability', name: 'Ringing Blow', recall: 1, art: 'ridge', text: [['When you hit with a melee weapon, **spend a Hope**: until the target next acts, its attacks on anyone but you have disadvantage.']] },
	shoulder: { dom: 'Valor', lv: 2, type: 'Ability', name: 'Shoulder to Shoulder', recall: 1, text: [['While an ally is in Melee range of you, you both gain **+1** to Evasion.']] },
	iron: { dom: 'Blade', lv: 3, type: 'Ability', name: 'Iron Stance', recall: 1, text: [['**Mark a Stress**: until your next rest, nothing can knock you back or move you against your will.']] },
	banner: { dom: 'Valor', lv: 4, type: 'Spell', name: 'Banner of Embers', recall: 2, text: [['Once per rest, plant your banner. Allies within Close **clear a Stress** and gain a Hope.'], ['The banner burns out when you leave it behind.']] },
	whirl: { dom: 'Blade', lv: 1, type: 'Ability', name: 'Whirlwind', recall: 0, text: [['When you hit, **spend a Hope** to hit every other target within Very Close for half damage.']] },
	// Maren's, for the phone
	veil: { dom: 'Midnight', lv: 1, type: 'Spell', name: 'Ink Veil', recall: 0, text: [['Wrap yourself in shadow: you are _Hidden_ until you next attack or move into the open.']] },
	spark: { dom: 'Arcana', lv: 1, type: 'Spell', name: 'Wild Spark', recall: 1, text: [['Make a Spellcast roll against a target within Far. On a success, **d8+1** magic damage; on a 1 on the d8, it arcs to another.']] },
	hush: { dom: 'Midnight', lv: 2, type: 'Spell', name: 'Hush', recall: 1, text: [['**Mark a Stress**: no sound leaves the area within Close of you until your next turn in the spotlight.']] },
	tide: { dom: 'Arcana', lv: 3, type: 'Spell', name: 'Turning Tide', recall: 2, text: [['When an ally rolls with Fear, **spend 2 Hope** to make it a roll with Hope.']] },
	thread: { dom: 'Midnight', lv: 4, type: 'Grimoire', name: 'Thread of Night', recall: 2, text: [['A cord of darkness binds a target in Close: _Restrained_ until it breaks free (Strength 14).']] },
};
const KAEL_HAND = ['gate', 'ring', 'shoulder', 'iron', 'banner'];
const MAREN_HAND = ['veil', 'spark', 'hush', 'tide', 'thread'];

/** **bold** and _italic_ in card text, as nodes (never innerHTML). */
GDS.rich = t => t.split(/(\*\*[^*]+\*\*|_[^_]+_)/).filter(Boolean).map(x => x.startsWith('**') ? h('b', x.slice(2, -2)) : x.startsWith('_') ? h('i', x.slice(1, -1)) : x);

/* The pennant: domain colour, gold edge, a swallowtail, the level, the domain's mark. */
const XDC_PEN = '<path class="pf" d="M1 0H29V52L15 44.5 1 52Z"/><path class="pl" d="M3.6 0V48.2L15 42 26.4 48.2V0"/>';
const XDC_PLATE = '<path class="pf" d="M9 1H91L99 11 91 21H9L1 11Z"/><path class="pl" d="M11 3.6H89L95.4 11 89 18.4H11L4.6 11Z"/>';
const XDC_BOLT = '<path d="M8.6 1 2.6 8.4H6.6L5.6 15 11.4 7.2H7.4Z"/>';

/** Our own placeholder art, standing in for an image the player drops in (never the book's art). */
GDS.artN = 0;
GDS.art = () => { const k = 'xa' + (++GDS.artN); const s = svg(`<defs><linearGradient id="${k}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2466"/><stop offset=".55" stop-color="#B0546A"/><stop offset="1" stop-color="#F2B36B"/></linearGradient><linearGradient id="${k}-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A4C8E"/><stop offset="1" stop-color="#3A2F6B"/></linearGradient></defs>
	<rect width="100" height="72" fill="url(#${k}-sky)"/><circle cx="66" cy="40" r="11" fill="#FFE2A0" opacity=".95"/>
	<path d="M0 50 18 34l12 9 16-15 18 16 12-8 24 14v22H0Z" fill="url(#${k}-far)"/>
	<path d="M0 58 22 46l14 7 20-11 22 13 22-7v24H0Z" fill="#241B4F"/>
	<path d="M0 66c20-6 38-8 56-5s30 2 44-2v13H0Z" fill="#14102B"/>
	<path d="M60 64 60.8 40h1.4l.8 24Z" fill="#14102B"/><path d="M56.6 44h8.8v1.6h-8.8Z" fill="#14102B"/><path d="M61.5 36.5 63.2 40h-3.4Z" fill="#14102B"/>`, 100, 72, 'xdc-img'); s.setAttribute('preserveAspectRatio', 'xMidYMid slice'); s.removeAttribute('width'); s.removeAttribute('height'); return s; };

/** One domain card. w: its width in px (the height follows the card, 5 × 7). */
GDS.dcard = (id, opts = {}) => {
	const c = typeof id === 'string' ? DHCARDS[id] : id;
	const w = opts.w || 150;
	const pen = svg(XDC_PEN, 30, 53); pen.setAttribute('preserveAspectRatio', 'none'); pen.removeAttribute('width'); pen.removeAttribute('height');
	const plate = svg(XDC_PLATE, 100, 22); plate.setAttribute('preserveAspectRatio', 'none'); plate.removeAttribute('width'); plate.removeAttribute('height');
	const bolt = svg(XDC_BOLT, 14, 16, 'bolt');
	const g = GDS.glyph(c.dom, 24); g.removeAttribute('width'); g.removeAttribute('height'); g.classList.add('xdc-gl');
	const art = (opts.art || c.art) ? GDS.art(opts.art || c.art) : null;
	const artG = GDS.glyph(c.dom, 24); artG.removeAttribute('width'); artG.removeAttribute('height'); artG.classList.add('mark');
	return h('div.xdc.d-' + c.dom.toLowerCase() + (opts.cls ? '.' + opts.cls : ''), {
		style: { '--cw': w + 'px' }, title: opts.title || `${c.name} · ${c.dom} ${c.type}, level ${c.lv} · recall ${c.recall}`, tabindex: opts.tab === false ? null : '0',
		'data-card': typeof id === 'string' ? id : c.name,
		onclick: opts.onclick,
	},
		h('div.xdc-art' + (art ? '.has-art' : ''), art ? art : [artG, h('i.rays')],
			opts.addArt ? h('span.xdc-add', icon('plus', 14), h('span', 'Add art')) : null,
			opts.drop ? h('span.xdc-drop', icon('arrow-up', 18), h('span', 'Drop to set art')) : null),
		h('div.xdc-pen', pen, h('b', String(c.lv)), g),
		h('span.xdc-rc', { title: `Recall cost ${c.recall}` }, h('b', String(c.recall)), bolt),
		h('div.xdc-band', h('span.xdc-plate', plate, h('span', c.type))),
		h('div.xdc-body', h('b.xdc-nm', c.name), (c.text || []).map(p => h('p', GDS.rich(Array.isArray(p) ? p.join('') : p)))),
		h('div.xdc-foot', h('span', c.dom), h('span', `Level ${c.lv}`)));
};

/* ---------- The hand ---------- */
/** Lay a hand out as a fan: each card turned a little, the middle one highest. */
GDS.fanLayout = (el) => {
	const cards = [...el.querySelectorAll(':scope > .xdc')];
	const n = cards.length, mid = (n - 1) / 2;
	const lift = cards.findIndex(c => c.classList.contains('is-lift'));
	cards.forEach((c, i) => {
		const off = i - mid;
		c.style.setProperty('--off', off);
		c.style.setProperty('--arc', Math.abs(off) ** 1.6);
		c.style.setProperty('--push', lift < 0 || i === lift ? 0 : i < lift ? -1 : 1);
		c.style.setProperty('--z', i === lift ? 20 : 1 + i);
	});
};
/** Tap a card: it lifts over the others. Tap it again: it opens. Esc or a tap outside puts it back. */
GDS.handTap = (hand) => (e) => {
	const card = e.currentTarget, fan = card.parentElement;
	if (card.classList.contains('is-lift')) { GDS.openCard(hand, card.dataset.card); return; }
	for (const c of fan.querySelectorAll('.xdc.is-lift')) c.classList.remove('is-lift');
	card.classList.add('is-lift');
	GDS.fanLayout(fan);
	const tip = hand.querySelector('.xdh-tip');
	if (tip) tip.textContent = 'Tap again to open';
};
GDS.openCard = (hand, id) => {
	const old = hand.querySelector('.xdh-open'); if (old) old.remove();
	hand.append(GDS.cardSheet(id, { onclose: () => hand.querySelector('.xdh-open').remove() }));
};
/** The opened card: the whole card large, what you can do with it underneath. */
GDS.cardSheet = (id, opts = {}) => {
	const c = DHCARDS[id];
	return h('div.xdh-open', { onclick: e => { if (e.target === e.currentTarget && opts.onclose) opts.onclose(); } },
		h('div.xdh-open-in',
			GDS.dcard(id, { w: opts.w || 250, tab: false }),
			clusters(cluster([btn({ icon: 'sparkle', kind: 'primary', text: JSON.stringify(c.text || '').includes('Hope') ? 'Spend Hope' : 'Use' }), btn({ text: 'To vault', icon: 'arrow-right' })]), cluster([btn({ icon: 'x', kind: 'quiet icon', title: 'Close', onclick: opts.onclose })], { end: true }))));
};
/**
 * The loadout as a hand. kind: 'fan' | 'grid' | 'carousel'.
 * opts.w: card width; opts.lift: the id lifted to start with; opts.open: open that card; opts.empty: empty slots.
 */
GDS.hand = (ids, kind = 'fan', opts = {}) => {
	const w = opts.w || 120;
	const spread = opts.spread || (ids.length <= 3 ? .8 : ids.length === 4 ? .6 : .46);
	const hand = h('div.xdh.is-' + kind + (opts.cls ? '.' + opts.cls : ''), { style: { '--cw': w + 'px', '--n': ids.length, '--spread': `calc(var(--cw) * ${spread})` } });
	const tap = GDS.handTap(hand);
	const cards = ids.map(id => GDS.dcard(id, { w, cls: id === opts.lift ? 'is-lift' : '', onclick: kind === 'fan' ? tap : () => GDS.openCard(hand, id) }));
	const row = h('div.xdh-row', cards);
	hand.append(row);
	if (kind === 'fan') GDS.fanLayout(row);
	if (opts.empty) row.append(...Array.from({ length: opts.empty }, () => h('div.xdc-empty', icon('plus', 16))));
	if (opts.tip !== false) hand.append(h('div.xdh-tip', opts.tipText || (opts.lift ? 'Tap again to open' : kind === 'fan' ? (opts.touch ? 'Tap a card to lift it' : 'Hover to lift · click to open') : kind === 'carousel' ? 'Swipe for more · tap to open' : 'Tap a card to open it')));
	if (opts.open) hand.append(GDS.cardSheet(opts.open, { w: opts.openW, onclose: () => hand.querySelector('.xdh-open').remove() }));
	return hand;
};

/* The sheet's loadout panel: a fan of what's in the loadout, the vault as a short row. */
GDS.loadout = (ids, opts = {}) => [
	h('p.xds-hint', `${ids.length} of 5 · swapping one in from the vault marks Stress equal to its recall cost`),
	GDS.hand(ids, opts.kind || 'fan', { w: opts.w || 112, lift: opts.lift, touch: opts.touch }),
	h('div.xds-vault', h('span', 'Vault'), GDS.cardEl(['Blade', 1, 'Ability', 'Whirlwind', 0], { vault: true }))];

/* Swap the old compact tiles in the sheet's loadout for the hand. */
GDS.sheet = (orig => (state, opts = {}) => {
	const el = orig(state, opts);
	const old = el.querySelector('.xds-cards');
	if (old) {
		const panel = old.parentElement;
		for (const x of [...panel.children]) if (!x.classList.contains('xd-rib')) x.remove();
		add(panel, GDS.loadout(['gate', 'ring', 'shoulder'], { w: opts.phone ? 96 : 112, touch: !!opts.phone }));
	}
	return el;
})(GDS.sheet);

/* The quick look from a tap (shared answers file, 98e) shows the card itself now. */
Object.defineProperty(GDS, 'cardFull', {
	configurable: true,
	get: () => () => h('div.sh-modal.xds-cardq.xdh-q', h('div.ev-sheet-head', h('h3', 'Ringing Blow'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
		h('div.xdh-q-in', GDS.dcard('ring', { w: 236, tab: false })),
		clusters(cluster([btn({ icon: 'sparkle', text: 'Spend Hope', kind: 'primary' }), btn({ icon: 'arrow-right', text: 'To vault' })]), cluster([btn({ text: 'Open note', kind: 'quiet' })], { end: true }))),
	set: () => {},
});
/* …and its caption says what the loadout is now. */
(shots => { shots.splice = function (i, n, ...items) {
	for (const it of items) if (/tapping a domain card/.test(it.cap || '')) it.sub = 'The loadout is a fanned hand of small cards; the first tap lifts one, the second opens the whole card in a quick look.';
	return Array.prototype.splice.call(this, i, n, ...items);
}; })(DEFS.dh.sheet.shots);

/* ---------- The loadout study: fan, grid, carousel; laptop, iPad, phone ---------- */
GDS.loadoutStudy = () => {
	const panel = (title, kids, w) => h('div.g-dh.xdh-stage', { style: { width: w + 'px' } }, GD.panel(title, kids));
	const phone = (title, content, overlay) => frame({ game: 'dh', kind: 'phone', title, children: h('div.sh-note.sh-note-phone', h('div.sh-note-in', content)), overlay });
	return [
		{ custom: () => h('div.sh-pair', { style: { alignItems: 'flex-start', flexWrap: 'wrap' } },
			h('div', panel('Loadout', [h('p.xds-hint', '5 of 5 · Kael at level 4'), GDS.hand(KAEL_HAND, 'fan', { w: 118 })], 480), h('div.view-cap', h('b', 'Resting'), 'Five cards fanned; each shows its pennant, recall cost, type and name.')),
			h('div', panel('Loadout', [h('p.xds-hint', '5 of 5 · Kael at level 4'), GDS.hand(KAEL_HAND, 'fan', { w: 118, lift: 'iron' })], 480), h('div.view-cap', h('b', 'Hover (or first tap)'), 'Iron Stance lifts above the others, straight and larger; its neighbours lean away.'))),
			cap: 'The loadout as a hand (laptop, in the sheet’s panel)', sub: 'Like a card game’s hand: fanned, the one under the pointer lifts to the top. Click opens it. Real cards at 118px: big enough for the frame and the name; the feature text is for the lifted or opened card.' },
		{ custom: () => h('div.xdh-phones',
			h('div', phone('Maren', [GD.panel('Loadout', [h('p.xds-hint', '5 of 5'), GDS.hand(MAREN_HAND, 'fan', { w: 100, touch: true })])]), h('div.view-cap', h('b', '1 · Resting'), 'Five cards in 330px.')),
			h('div', phone('Maren', [GD.panel('Loadout', [h('p.xds-hint', '5 of 5'), GDS.hand(MAREN_HAND, 'fan', { w: 100, lift: 'hush', touch: true })])]), h('div.view-cap', h('b', '2 · Tap: it lifts'), 'Hush rises over the rest; a second tap opens it.')),
			h('div', phone('Maren', [GD.panel('Loadout', [h('p.xds-hint', '5 of 5'), GDS.hand(MAREN_HAND, 'fan', { w: 100, touch: true, tip: false })])], sheet('Hush', h('div.xdh-sheet', GDS.dcard('hush', { w: 230, tab: false }), clusters(cluster([btn({ icon: 'sparkle', text: 'Use', kind: 'primary' }), btn({ icon: 'arrow-right', text: 'To vault' })]))))), h('div.view-cap', h('b', '3 · Tap again: it opens'), 'The whole card in a bottom sheet, with Use and To vault.'))),
			cap: 'Phone: tap to lift, tap again to open', sub: 'Touch has no hover, so the first tap does what hover does. A tap outside, or on another card, puts it back. Try it: the fans on this page respond to taps and clicks.' },
		{ custom: () => h('div.sh-pair', { style: { alignItems: 'flex-start', flexWrap: 'wrap' } },
			h('div', h('div.g-dh.xdh-stage.xdh-artrow', GDS.dcard('ring', { w: 190, art: 'ridge' }), GDS.dcard('gate', { w: 190, addArt: true }), GDS.dcard('shoulder', { w: 190 })), h('div.view-cap', h('b', 'Your art, an empty slot, the placeholder'), 'Ringing Blow with an image the player dropped in; Hold the Gate under the pointer, offering Add art; Shoulder to Shoulder with no image, so the domain’s placeholder shows.')),
			h('div', h('div.g-dh.xdh-stage.xdh-artrow', GDS.dcard('gate', { w: 190, drop: true })), h('div.view-cap', h('b', 'Dropping an image'), 'Drag a file onto the art, or tap Add art to pick one from the vault.'))),
			cap: 'Your own art on your cards', sub: 'The art area takes the player’s image, as compendium art does in the plugin (pick from the vault, upload, or drop; it follows renames). With none, the domain’s colour and mark stand in. The book’s art never ships. The image here is our own placeholder drawing.' },
	];
};

Object.assign(DEFS.dh.sheet, {
	notes: (DEFS.dh.sheet.notes || []).concat([
		'<b>The loadout is a hand of real cards</b> (pass 4). Each is a small domain card in the book’s frame: the level pennant with the domain’s mark, the recall token, the type plate on a gold band, the name in heavy caps, the feature. Art is a placeholder (the domain’s colour and mark) the player can replace with their own.',
		'<b>The fan, at every width</b> (the user’s call). Grid and carousel stay on the design-system page as alternatives only.', '<b>Your art.</b> The art area takes the player’s own image (pick, upload or drop, as compendium art works); with none, the domain placeholder shows.', '<b>How the fan works.</b> Hover lifts a card over the others (as in a card game’s hand); click or a second tap opens the whole card with Use and To vault. On touch the first tap lifts. Grid and carousel are the alternatives.',
	]),
});
DEFS.dh.sheet.shots.push(...GDS.loadoutStudy());
