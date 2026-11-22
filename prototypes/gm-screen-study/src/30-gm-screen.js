/* ============================================================================
   Screens: the recommended one (screens of columns) and the three directions
   it came from (tri-fold, board, drawer), each in a real Obsidian window.
   ========================================================================== */

/** The four columns a GM arranged for their Combat screen. Fewer fit: columns merge in order, nothing is hidden. */
function gmColumns(g) {
	const d = GM_DATA[g];
	const rules = d.rules.slice(0, 2).map(r => GW.rule(g, r));
	return [
		[GW.fight(g, d.fight), GW.party(g, d.party)],
		[...rules, GW.table(g, d.table)],
		[GW.monster(g, d.monster), GW.npc(g, d.npc)],
		[GW.note(g, d), GW.clocks(g, d.clocks), GW.dice(g, d.rolls)],
	];
}
function mergeCols(cols, n) {
	if (n >= cols.length) return cols;
	if (n === 3) return [cols[0], cols[1], [...cols[2], ...cols[3]]];
	if (n === 2) return [[...cols[0], ...cols[2]], [...cols[1], ...cols[3]]];
	return [cols.flat()];
}

/** The screen's top: its name, its screens as tabs, Edit, a window of its own, more. */
function gmTop(g, { tab = 0, edit = false, name } = {}) {
	const d = GM_DATA[g];
	return h('div.gm-top',
		h('h2.gm-name', name || d.screen),
		h('div.gm-tabs', d.screens.map((s, i) => h('span.gm-tab' + (i === tab ? '.on' : ''), s)), h('span.gm-tab.add', icon('plus', 14))),
		h('div.gm-acts',
			h('span.gm-ib' + (edit ? '.on' : ''), icon('edit', 15), edit ? 'Done' : 'Edit'),
			h('span.gm-ib', { title: 'In a window of its own' }, icon('open', 15)),
			h('span.gm-ib', icon('more', 15))));
}

/** Recommended: screens of columns. */
function gmScreen(g, { cols = 3, edit = false, tab = 0 } = {}) {
	const columns = mergeCols(gmColumns(g), cols);
	return h('div.gm' + (edit ? '.is-edit' : ''), { style: { '--gm-cols': cols } },
		gmTop(g, { tab, edit }),
		h('div.gm-cols', columns.map((c, i) => h('div.gm-col', c, edit && i === columns.length - 1 ? h('div.gm-slot', icon('pin', 15), 'Pin here') : null))));
}

/** Direction A: the tri-fold. Fixed panels, each a kind of thing, like the cardboard screen. */
function gmTrifold(g) {
	const d = GM_DATA[g];
	const panel = (t, kids) => h('div.gm-col', h('div.gm-meta', { style: { fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: '11px' } }, t), kids);
	return h('div.gm', { style: { '--gm-cols': 4 } },
		h('div.gm-top', h('h2.gm-name', d.screen)),
		h('div.gm-cols', panel('Rules', [GW.rule(g, d.rules[0]), GW.table(g, d.table)]), panel('Monsters', [GW.monster(g, d.monster)]), panel('Party', [GW.party(g, d.party)]), panel('Notes', [GW.note(g, d)])));
}

/** Direction B: the board. Tiles in sizes, packed. */
function gmBoard(g) {
	const d = GM_DATA[g];
	const sized = (el, s) => { el.classList.add('s-' + s); return el; };
	return h('div.gm', { style: { '--gm-cols': 4 } },
		gmTop(g),
		h('div.gm-board', sized(GW.fight(g, d.fight), '1x2'), sized(GW.party(g, d.party), '2x1'), sized(GW.rule(g, d.rules[0]), '1x1'), sized(GW.monster(g, d.monster), '1x2'), sized(GW.table(g, d.table), '2x1'), sized(GW.dice(g, d.rolls), '1x1'), sized(GW.clocks(g, d.clocks), '1x1')));
}

/** Direction C: the drawer. The screen slides over whatever note you're in. */
function gmDrawer(g) {
	const d = GM_DATA[g];
	return h('div.gm-drawer-wrap',
		h('div.sh-note-in', { style: { padding: '28px 40px', maxWidth: '640px' } }, proseWith(...GM_NOTE[g])),
		h('div.gm-drawer.g-' + g, h('div.gm', { style: { '--gm-cols': 1, height: '100%' } }, gmTop(g), h('div.gm-cols', h('div.gm-col', GW.fight(g, d.fight), GW.rule(g, d.rules[0]), GW.table(g, d.table))))));
}

/** In a laptop window: the screen as a page in a tab (left sidebar open or not), at its real width. */
function gmWindow(g, content, { w = 1440, ht = 900, left = false, title = 'GM screen', note } = {}) {
	const panes = [h('div.ob-pane', h('div.ob-tabs', h('span.ob-tab.on', obIcon(note ? 'book' : 'grid', 13), title), h('span.ob-tab', obIcon('book', 13), GM_DATA[g].session.split(':')[0])), h('div.ev-view.mt.g-' + g, content))];
	return obsWindow({ w, h: ht, left, panes });
}
/** Main area width for a window, the way the design study counts it. */
function gmMain(w, left) { return w - RIBBON_W - (left ? LEFT_W : 0); }
function colsFor(width) { return width >= 1180 ? 4 : width >= 860 ? 3 : width >= 560 ? 2 : 1; }
