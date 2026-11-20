/* ============================================================================
   Obsidian as it really is: the ribbon, a left sidebar (our Campaign panel),
   a right sidebar (the compact tracker), split panes, iPad drawers. Every
   main-tab mock can be drawn in every configuration, at its real width.
   ========================================================================== */
const LEFT_W = 300, RIGHT_W = 340, RIBBON_W = 44;

/** Our Campaign panel, in Obsidian’s neutral chrome (a placeholder). */
function leftPanel() {
	const it = (ic, t, n, on) => h('div.ob-li' + (on ? '.on' : ''), icon(ic, 15), h('span', t), n ? h('small', n) : null);
	return h('div.ob-left',
		h('div.ob-top', ['book', 'search', 'tag', 'swords'].map(n => h('span', obIcon(n, 15)))),
		h('div.ob-camp', icon('crown', 15), h('b', 'The drowned chapel'), h('small', 'GM')),
		h('div.ob-search', obIcon('search', 14), 'Omnisearch'),
		h('div.ob-cont', icon('play', 13), 'Continue  Session 12'),
		h('div.ob-h', 'Chapters'), it('book', 'Chapter 2: the flood', '7'),
		h('div.ob-h', 'Campaign'), it('book', 'Sessions', '12'), it('flag', 'Quests', '3'), it('users', 'NPCs', '9'), it('castle', 'Locations', '5'), it('shield', 'Party', '4', true), it('skull', 'Monsters', '14'));
}
/** The right sidebar: whatever the game’s compact tracker shows (or Obsidian’s outline). */
function rightPanel(game, content) {
	return h('div.ob-right', h('div.ev-ob', ['link', 'list', 'tag', 'swords', 'panel'].map(n => h('span' + (n === 'swords' ? '.on' : ''), obIcon(n, 16)))), h('div.ev-view.g-' + game, h('div.ev-scroll', content || outline())));
}
function outline() { return h('div.ob-outline', h('b', 'Outline'), ['The drowned chapel', 'Read-aloud', 'The vestry', 'Treasure'].map((t, i) => h('div', { style: { paddingLeft: (i ? 14 : 0) + 'px' } }, t))); }

/** A pane: its own tab header, and either a main-tab view (mt) or a note. */
function pane({ game, title, ic = 'swords', content, kind = 'mt' }) {
	const view = kind === 'mt' ? h('div.ev-view.mt.g-' + game) : h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', content));
	if (kind === 'mt') add(view, [content]);
	return h('div.ob-pane', h('div.ob-tabs', h('span.ob-tab.on', obIcon(ic, 13), title), h('span.ob-tab', obIcon('book', 13), 'Session 12')), view);
}

/** A laptop window in any configuration. */
function obsWindow({ w = 1440, h: ht = 900, left, right, panes }) {
	return h('div.dev.is-window.ob-win', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-bar.ob-bar', h('span.dev-lights', h('i'), h('i'), h('i'))),
		h('div.dev-body', h('div.dev-ribbon', obIcons()), left ? leftPanel() : null, h('div.ob-panes', panes), right || null));
}
/** An iPad, with drawers that either overlay the main area or are pinned beside it. */
function obsIpad({ landscape = true, leftPinned, rightPinned, drawer, panes }) {
	const w = landscape ? 1180 : 820, ht = landscape ? 820 : 1180;
	const body = h('div.dev-body', leftPinned ? leftPanel() : null, h('div.ob-panes', panes), rightPinned || null);
	const d = h('div.dev.is-ipad.ob-win', { style: { width: w + 'px', height: ht + 'px' } }, h('div.dev-status', h('span', '9:41'), h('span', '100%')), body);
	if (drawer) { d.append(h('div.ob-scrim'), drawer === 'left' ? h('div.ob-drawer.l', leftPanel()) : h('div.ob-drawer.r', drawer)); }
	return d;
}

/** Width maths: what the main area gets in each configuration. */
const CONFIGS = [
	{ id: 'none', label: 'Both sidebars collapsed' },
	{ id: 'left', label: 'Left open (Campaign panel)' },
	{ id: 'right', label: 'Right open (the tracker glance)' },
	{ id: 'both', label: 'Both open' },
	{ id: 'split', label: 'Split: a note beside the encounter' },
];
const DEVICES = [
	{ id: 'l1440', label: 'Laptop 1440', w: 1440, kind: 'laptop' },
	{ id: 'l1280', label: 'Laptop 1280', w: 1280, kind: 'laptop' },
	{ id: 'ipl', label: 'iPad landscape 1180', w: 1180, kind: 'ipad', landscape: true },
	{ id: 'ipp', label: 'iPad portrait 820', w: 820, kind: 'ipad', landscape: false },
];
function mainWidth(dev, cfg) {
	if (dev.kind === 'ipad') {
		// On iPad, sidebars open as drawers over the main area unless pinned; "left/right/both" here means pinned.
		let w = dev.w;
		if (cfg === 'left' || cfg === 'both') w -= LEFT_W;
		if (cfg === 'right' || cfg === 'both') w -= RIGHT_W;
		if (cfg === 'split') w = Math.floor((w - 1) / 2);
		return w;
	}
	let w = dev.w - RIBBON_W;
	if (cfg === 'left' || cfg === 'both') w -= LEFT_W;
	if (cfg === 'right' || cfg === 'both') w -= RIGHT_W;
	if (cfg === 'split') w = Math.floor((w - 1) / 2);
	return w;
}
function layoutFor(w) { return w >= 1000 ? 'Three columns' : w >= 660 ? 'Two columns' : w >= 480 ? 'One column, card first' : 'The sidebar layout'; }

/** Draw a game’s main tab (or a sheet) in a configuration. */
function obsShot({ game, dev, cfg, main, kind = 'mt', title = 'Encounter', side, splitNote }) {
	const right = (cfg === 'right' || cfg === 'both') ? rightPanel(game, side ? side() : null) : null;
	const left = cfg === 'left' || cfg === 'both';
	const p1 = pane({ game, title, ic: kind === 'mt' ? 'swords' : 'book', content: main(), kind });
	const panes = cfg === 'split' ? [h('div.ob-pane', h('div.ob-tabs', h('span.ob-tab.on', obIcon('book', 13), 'Session 12')), h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', splitNote ? splitNote() : proseWith('the bell', { title: 'Session 12', text: 'The reed paths flood at dusk.', text2: 'Odile won’t meet their eyes. She keeps touching' }, 'rope.')))), p1] : [p1];
	if (dev.kind === 'ipad') return obsIpad({ landscape: dev.landscape, leftPinned: left, rightPinned: right, panes });
	return obsWindow({ w: dev.w, h: dev.w >= 1440 ? 900 : 800, left, right, panes });
}

mainShot = (orig => (def, m) => {
	if (m.device !== 'cfg') return orig(def, m);
	const dev = DEVICES.find(d => d.id === m.dev);
	const el = m.cfg === 'drawer'
		? obsIpad({ landscape: dev.landscape, panes: [pane({ game: def.id, title: m.title || 'Encounter', ic: m.kind === 'note' ? 'book' : 'swords', content: m.render(), kind: m.kind || 'mt' })], drawer: 'left' })
		: obsShot({ game: def.id, dev, cfg: m.cfg, main: m.render, kind: m.kind || 'mt', title: m.title, side: m.side });
	for (const t of el.querySelectorAll('.sh-note-in .sh-toast')) t.closest('.sh-note').append(t);
	const w = m.cfg === 'drawer' ? dev.w : mainWidth(dev, m.cfg);
	const cfgLabel = m.cfg === 'drawer' ? 'Campaign panel as an overlay drawer' : CONFIGS.find(c => c.id === m.cfg).label;
	return devShot(el, dev.w, m.cap || `${dev.label} · ${cfgLabel}`, h('span', `Main area ${w}px: `, h('b', { style: { display: 'inline', fontSize: '13px' } }, layoutFor(w).toLowerCase()), '. ', m.sub || ''));
})(mainShot);
