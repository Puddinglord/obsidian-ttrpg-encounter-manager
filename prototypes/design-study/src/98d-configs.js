/* Every game, its worst widths: both sidebars on a 1280 laptop, iPad portrait with the Campaign panel pinned. */
GP.glance = () => glance({ round: 'Round 3', kicker: 'Now', name: 'Skeletal champion', hp: 25, max: 40, rows: [{ sec: 'Still to act' }, { name: 'Rook', em: '18', next: true }, { name: 'Sela', em: 'Dying 2' }, { name: 'Cult acolyte', em: '12' }, { sec: 'Acted' }, { name: 'Valka', em: '23', acted: true }] });
GC.glance = () => glance({ round: 'Round 2 · DEX order', kicker: 'Now', name: 'Ghoul', hp: 9, max: 13, rows: [{ sec: 'Still to act' }, { name: 'Prof. Amos Wray', em: 'Dying', next: true }, { sec: 'Acted' }, { name: 'Harriet Cole', em: '110', acted: true }, { name: 'Jonah Pike', em: '70', acted: true }] });

const WORST = {
	'5e': { main: () => G5.main('laptop'), side: () => G5.glance(), sheet: () => G5S.sheet(), sheetTitle: 'Ilse Vane' },
	nimble: { main: () => GN.main('laptop'), side: () => GN.glance(), sheet: () => GNS.sheet(BRAKKA), sheetTitle: 'Brakka' },
	dh: { main: () => GD.main('laptop'), side: () => GD.glance(), sheet: () => GDS.sheet(), sheetTitle: 'Kael Ardent' },
	pf: { main: () => GP.main('laptop'), side: () => GP.glance(), sheet: () => GPS.sheet(), sheetTitle: 'Wren Halloway' },
	coc: { main: () => GC.main('laptop'), side: () => GC.glance(), sheet: () => GCS.sheet(), sheetTitle: 'Mabel Ostrander' },
};
for (const id of ORDER) {
	const w = WORST[id], def = DEFS[id];
	def.main.push(
		{ device: 'cfg', dev: 'l1280', cfg: 'both', cap: 'Worst case on a laptop: 1280 with both sidebars open', sub: 'The Campaign panel on the left, the tracker glance on the right.', render: w.main, side: w.side },
		{ device: 'cfg', dev: 'ipp', cfg: 'left', cap: 'Worst case on an iPad: portrait with the Campaign panel pinned', render: w.main });
	def.sheet.shots.push(
		{ device: 'cfg', dev: 'l1280', cfg: 'both', kind: 'note', title: w.sheetTitle, cap: 'Worst case on a laptop: 1280 with both sidebars open', sub: 'The sheet reflows by its own width.', render: w.sheet, side: w.side },
		{ device: 'cfg', dev: 'ipp', cfg: 'left', kind: 'note', title: w.sheetTitle, cap: 'Worst case on an iPad: portrait with the Campaign panel pinned', render: w.sheet });
}

/* The width matrix, on the Shared page. */
sharedPage = (orig => () => {
	const p = orig();
	const rows = [...CONFIGS, { id: 'drawer', label: 'iPad: Campaign panel as an overlay drawer' }];
	const cell = (dev, cfg) => {
		if (cfg.id === 'drawer' && dev.kind !== 'ipad') return h('td', h('span.note', 'n/a (laptop sidebars push the main area)'));
		const w = cfg.id === 'drawer' ? dev.w : mainWidth(dev, cfg.id);
		if (w < 300) return h('td', h('span.w', `${w}px`), h('span.lay', 'Not offered: too narrow for a tab; Obsidian on iPad portrait keeps one panel pinned at most.'));
		const lay = layoutFor(w);
		const el = cfg.id === 'drawer' ? obsIpad({ landscape: dev.landscape, panes: [pane({ game: '5e', title: 'Encounter', content: G5.main('laptop') })], drawer: 'left' }) : obsShot({ game: '5e', dev, cfg: cfg.id, main: () => G5.main('laptop'), side: () => G5.glance() });
		return h('td', h('span.w', `${w}px`), h('span.lay' + (lay === 'Three columns' ? '.three' : ''), lay), h('div.thumb', el));
	};
	const sec = h('div',
		h('h2.sec', 'Widths: every sidebar configuration'),
		h('p.kicker', 'Obsidian’s main area shrinks with every sidebar you open. The tracker and the sheets choose their layout from the width they actually get, never from the device. The ribbon is 44px; the left sidebar 300px; the right sidebar 340px. On iPad, sidebars open as drawers over the main area unless pinned (the left/right/both rows below are pinned).'),
		h('table.slots-map', h('thead', h('tr', h('th', 'Main area'), h('th', 'Tracker layout'), h('th', 'Sheet layout'))), h('tbody',
			h('tr', h('td', '1000 and up'), h('td', 'Three columns: lists, the active card, log and prompts (or the boss pane)'), h('td', 'Full sheet: abilities in one row, two columns below')),
			h('tr', h('td', '660–1000'), h('td', 'Two columns: lists beside the card; the third column folds under the card'), h('td', 'Abilities in three columns; one column below')),
			h('tr', h('td', '480–660'), h('td', 'One column: the card first, then the lists, then the log'), h('td', 'Abilities in two columns; actions stack')),
			h('tr', h('td', 'under 480'), h('td', 'The sidebar panel (phone, a narrow split)'), h('td', 'The phone sheet')))),
		h('h3.sub', 'The matrix (5e’s tracker in each)'),
		h('div', { style: { overflowX: 'auto' } }, h('table.wm', h('thead', h('tr', h('th', ''), DEVICES.map(d => h('th', d.label)))), h('tbody', rows.map(cfg => h('tr', h('td', cfg.label), DEVICES.map(d => cell(d, cfg))))))),
		h('p.note', 'Narrowest main area: 596px on a 1280 laptop with both sidebars open, and 520px on an iPad in portrait with the Campaign panel pinned. Both land in the one-column layout; each game’s tab shows its tracker and sheet there.'));
	const bp = [...p.querySelectorAll('h2.sec')].find(x => x.textContent === 'Breakpoints');
	if (bp) bp.parentNode.insertBefore(sec, bp); else p.append(sec);
	return p;
})(sharedPage);
