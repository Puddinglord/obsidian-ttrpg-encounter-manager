/* ============================================================================
   The study's pages, drawn from the game definitions.
   ========================================================================== */

const ORDER = ['5e', 'nimble', 'coc', 'dh', 'pf'];

function sources(items) { return items; }
function link(s) { return !s.url || s.url === '#' ? h('span', s.label) : h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label); }
function htmlSpan(markup) { const s = h('span'); s.innerHTML = markup; return s; } // our own copy only

function researchBoard(r) {
	const cards = r.cards.map(c => h('div.obs',
		h('h4', c.t),
		c.sw ? h('div.sw', c.sw.map(([hx, l]) => h('span', h('i', { style: { background: hx } }), `${hx} ${l}`))) : null,
		h('ul', c.li.map(([t, s]) => h('li', htmlSpan(t), ' ', h('span.src', '— ', link(s)))))));
	return [h('div.board', cards),
		h('div.verdict',
			h('div', h('h4', 'Borrow'), h('ul', r.borrow.map(t => h('li', t)))),
			h('div', h('h4', 'Avoid'), h('ul', r.avoid.map(t => h('li', t)))),
			h('div.dir', h('h4', 'So the direction is'), r.direction.map(t => h('p', htmlSpan(t)))))];
}

/** Read every colour role in both themes and check contrast against its surface. */
function colorTable(def) {
	const scope = h('div.g-' + def.id, { style: { position: 'absolute', left: '-9999px' } });
	document.body.append(scope);
	const root = document.documentElement, was = root.dataset.theme;
	const read = theme => {
		root.dataset.theme = theme;
		const bgOf = name => blend(tokenColor(scope, name, 'background-color'), { r: 255, g: 255, b: 255, a: 1 });
		return def.colors.map(([tok, role, on, kind]) => {
			const c = tokenColor(scope, tok, 'background-color');
			const base = on ? bgOf(on) : null;
			const col = base ? blend(c, base) : c;
			return { hex: hex(col), ratio: base ? ratio(col, base) : null };
		});
	};
	const L = read('light'), D = read('dark');
	root.dataset.theme = was;
	scope.remove();
	const rows = def.colors.map(([tok, role, on, kind], i) => {
		const need = kind === 'ui' ? 3 : 4.5;
		const cell = v => v.ratio === null ? h('td.num', '—') : h('td.num', h('span.' + (v.ratio >= need ? 'p-pass' : 'p-fail'), v.ratio.toFixed(1) + ':1'));
		return h('tr',
			h('td', h('code', tok)),
			h('td', role),
			h('td', h('span.swatch', h('i', { style: { background: L[i].hex } }), h('span.mono', L[i].hex))),
			cell(L[i]),
			h('td', h('span.swatch', h('i', { style: { background: D[i].hex } }), h('span.mono', D[i].hex))),
			cell(D[i]),
			h('td.note', on ? `on ${on.replace('--g-', '')}${kind === 'ui' ? ' (3:1, a shape)' : ''}` : 'surface'));
	});
	return h('table.t', h('thead', h('tr', h('th', 'Token'), h('th', 'Role'), h('th', 'Light'), h('th', ''), h('th', 'Dark'), h('th', ''), h('th', 'Checked'))), h('tbody', rows));
}

function typeScale(def) {
	return h('div.g-' + def.id, { style: { background: 'var(--g-bg)', color: 'var(--g-text)', borderRadius: '12px', padding: '6px 22px', border: '1px solid var(--p-line)' } },
		def.type.map(([role, sample, style, spec]) => h('div', { style: { display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 260px', gap: '16px', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid var(--g-line)' } },
			h('span', { style: { fontSize: '12.5px', color: 'var(--g-text-2)', fontFamily: 'var(--p-ui)' } }, role),
			h('span', { style: Object.assign({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, style) }, sample),
			h('span.mono', { style: { fontSize: '11.5px', color: 'var(--g-text-2)' } }, spec))));
}

function spacingBlock(def) {
	const sp = [2, 4, 8, 12, 16, 24, 32];
	return h('div.grid2',
		h('div', h('div.scale', sp.map(n => h('div', h('i', { style: { width: n + 'px', height: n + 'px', borderRadius: '2px' } }), n))),
			h('p.note', { style: { marginTop: '12px' } }, 'One 4px scale for every game (2 for hairline gaps). Text sits on a 4px baseline: line heights are 16, 20, 24, 28 or 32.')),
		h('div', h('div.scale.g-' + def.id, def.radii.map(([n, label]) => h('div', h('i', { style: { width: '44px', height: '44px', borderRadius: n + 'px', background: 'var(--g-surface)', boxShadow: 'inset 0 0 0 1.5px var(--g-line-strong)', opacity: 1 } }), `${n} ${label}`))),
			h('p.note', { style: { marginTop: '12px' } }, def.density)));
}

function iconBlock(def) {
	return h('div.g-' + def.id, { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' } },
		def.icons.list.map(n => typeof n === 'string'
			? h('span', { title: n, style: { width: '44px', height: '44px', display: 'grid', placeItems: 'center', borderRadius: '10px', background: 'var(--g-surface)', border: '1px solid var(--g-line)', color: 'var(--g-text)' } }, icon(n, 22))
			: h('span', { title: n.title, style: { minWidth: '44px', height: '44px', padding: '0 10px', display: 'grid', placeItems: 'center', borderRadius: '10px', background: 'var(--g-surface)', border: '1px solid var(--g-line)', color: 'var(--g-text)' } }, n.el())));
}

function statesBlock(def) {
	return h('div.states', def.states().map(([label, el]) => h('div.state', h('span', label), h('div.state-stage.g-' + def.id, { style: { background: 'var(--g-bg)', color: 'var(--g-text)', fontFamily: 'var(--g-font-ui)' } }, el))));
}

function viewTile(def, v) {
	const r = v.render();
	const f = frame({ game: def.id, kind: v.kind || 'sidebar', title: v.title, height: v.height, children: r.children, foot: r.foot, overlay: r.overlay });
	// A gallery shows states of one design: the title names the moment, the line under it says what's different.
	// Nothing is being chosen, so no "Recommended" tag (v.rec is ignored; history tiles get "Chosen").
	return h('div', f, h('div.view-cap', h('b', v.state || v.cap, v.chosen ? h('span.rec', 'Chosen') : null), v.diff || v.sub || null));
}

/** Layouts compared before the decision. Kept as history, folded: the decision is card and queue, in every game. */
function historyBlock(def) {
	const tiles = def.concepts.map((c, i) => Object.assign({}, c, { chosen: i === 0, rec: false }));
	return h('details.history',
		h('summary', h('span.history-t', 'History: layouts compared before the decision'), h('span.history-d', `${def.concepts.length} concepts · decided: card and queue`)),
		h('div.decision', icon('check', 16), h('span', h('b', 'Decided: card and queue, in every game. '), 'The current participant’s card on top, the queue underneath. The other concepts are kept here as the record of what was tried, not as options.')),
		def.conceptsIntro ? h('p.kicker', def.conceptsIntro) : null,
		h('div.concepts', tiles.map(c => h('div', viewTile(def, c), h('div.concept-notes', h('ul.plus', c.plus.map(t => h('li', t))), h('ul.minus', c.minus.map(t => h('li', t))))))),
		def.recommend ? h('div.card', { style: { marginTop: '28px', maxWidth: '900px' } }, h('h3.sub', { style: { marginTop: 0 } }, 'Why A'), def.recommend.map(t => h('p', htmlSpan(t)))) : null);
}

function gamePage(def) {
	const p = h('section.page', { id: 'p-' + def.id });
	add(p, [
		h('p', { style: { margin: '0 0 6px', color: 'var(--p-text-2)', fontSize: '13px' } }, def.long),
		h('h2.sec', { style: { marginTop: 0 } }, def.title),
		h('p.lede', def.lede),
		h('h2.sec', 'Research board'),
		h('p.kicker', 'What the game looks like where its players already are: the books, the official sheets, the publisher’s tools and the most-used VTT system. Described, not copied.'),
		researchBoard(def.research),
		h('h3.sub', 'Rules that shape the panel'),
		h('ul.prose', def.rules.map(t => h('li', htmlSpan(t)))),
		def.flow ? [h('h2.sec', 'How a fight runs'), h('p.kicker', def.flowIntro),
			h('ul.prose', def.flowNotes.map(t => h('li', htmlSpan(t)))),
			h('div.views', { style: { marginTop: '24px' } }, def.flow.map(v => viewTile(def, v)))] : null,
		def.main ? [h('h2.sec', 'Main tab and sidebar'), h('p.kicker', def.mainIntro), def.main.map(m => mainShot(def, m))] : null,
		h('h2.sec', def.flow ? 'More moments in a fight' : 'The encounter manager'),
		h('p.kicker', h('b', 'One design, nothing to choose. '), 'Each panel is the same card and queue at a different moment; the line under each says what’s different. ', def.viewsIntro ? htmlSpan(String(def.viewsIntro).replace(/^Concept A,? recommended(,? at sidebar width \(360px\))?[,.]? ?/i, '')) : null),
		h('div.views', def.views.map(v => viewTile(def, v))),
		def.extra ? h('div', { style: { display: 'flex', gap: '40px', marginTop: '44px', alignItems: 'flex-start', flexWrap: 'wrap' } }, def.extra.map(v => viewTile(def, v))) : null,
		def.concepts ? historyBlock(def) : null,
		h('h2.sec', 'Design system'),
		h('p.kicker', 'Tokens are the --g-* set every shared component reads; this game sets them, and adds the few structural rules below.'),
		h('div.ds',
			h('h4', 'Voice and principles', h('small', def.voice)),
			h('ol.principles', def.principles.map(([b, s]) => h('li', h('b', b), h('span', s)))),
			h('h4.ds-row', 'Type scale', h('small', def.typeNote)), h('div.ds-row', typeScale(def)),
			h('h4.ds-row', 'Colour roles', h('small', 'Each text colour is measured against the surface it sits on, in both themes. Text needs 4.5:1; shapes need 3:1.')), h('div.ds-row', colorTable(def)),
			h('h4.ds-row', 'Spacing, radius, density'), h('div.ds-row', spacingBlock(def)),
			h('h4.ds-row', 'Iconography', h('small', def.icons.text)), h('div.ds-row', iconBlock(def)),
			h('h4.ds-row', 'Motion'), h('ul.ds-row.prose', { style: { margin: 0 } }, def.motion.map(t => h('li', t))),
			h('h4.ds-row', 'Components in their states', h('small', def.statesNote)), h('div.ds-row', statesBlock(def))),
	]);
	return p;
}

function mainShot(def, m) {
	if (m.custom) return h('div.dev-wrap', m.custom(), h('div.dev-cap', h('b', m.cap), m.sub || null));
	let dev, w;
	if (m.device === 'laptop') { w = 1440; dev = windowFrame({ game: def.id, w: 1440, h: m.height || 900, main: m.render(), side: m.side ? m.side() : null }); }
	else if (m.device === 'tv') { w = 1440; dev = windowFrame({ game: def.id, w: 1440, h: m.height || 640, main: m.render(), tab: 'Encounter \u00b7 player-safe' }); }
	else { const land = m.device === 'landscape'; w = land ? 1180 : 820; dev = ipadFrame({ game: def.id, landscape: land, main: m.render(), drawer: m.drawer ? m.drawer() : null }); }
	if (m.sync) dev.append(...m.sync());
	return devShot(dev, w, m.cap, m.sub);
}
