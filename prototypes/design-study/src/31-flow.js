/* ============================================================================
   Shared flow helpers: the turn mark, sections, moments, devices, the glance.
   ========================================================================== */

/** The turn mark at the left of every row: to act (ring), next (accent ring), acted (check). */
function mark(state) {
	if (state === 'acted') return h('span.ev-mark.is-acted', { title: 'Acted this round' }, icon('check', 12, 3));
	if (state === 'next') return h('span.ev-mark.is-next', { title: 'Next up' });
	if (state === 'out') return h('span.ev-mark.is-out', icon('x', 12, 2.2));
	if (state === 'moment') return h('span.ev-mark.is-moment', icon('sparkle', 14));
	return h('span.ev-mark', { title: 'Still to act' });
}
function sec(title, small, opts = {}) {
	return h('div.ev-sec' + (opts.acted ? '.is-acted' : ''), h('span', title), small ? h('small', small) : null);
}
function moment({ ic = 'crown', text, sub, acts = [] }) {
	return h('div.ev-moment', icon(ic, 16), h('span', text, sub ? h('small', sub) : null), acts.length ? h('div.acts', toClusters(acts)) : null);
}

/* ---------- Devices ---------- */
function obIcons() { return ['file', 'search', 'swords', 'book', 'users'].map(n => obIcon(n === 'file' ? 'book' : n === 'search' ? 'search' : n, 18)); }

/** A laptop window: Obsidian with the encounter in a main tab, and optionally the sidebar beside it. */
function windowFrame({ game, w = 1440, h: ht = 900, tab = 'Encounter', note = 'Session 12', main, side }) {
	const view = h('div.ev-view.mt.g-' + game);
	add(view, [main]);
	const body = h('div.dev-body',
		h('div.dev-ribbon', obIcons()),
		h('div.dev-main', view));
	if (side) {
		const sv = h('div.ev-view.g-' + game, h('div.ev-scroll', side));
		body.append(h('div.dev-side', h('div.ev-ob', ['link', 'list', 'tag', 'swords', 'panel'].map(n => h('span' + (n === 'swords' ? '.on' : ''), obIcon(n, 16)))), sv));
	}
	return h('div.dev.is-window', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-bar', h('span.dev-lights', h('i'), h('i'), h('i')),
			h('span.dev-tab', obIcon('book', 13), note + '.md'),
			h('span.dev-tab.on', obIcon('swords', 13), tab)),
		body);
}

/** An iPad, landscape or portrait: the main tab full screen (Obsidian's side panels are drawers there). */
function ipadFrame({ game, landscape = true, title = 'Encounter', main, drawer }) {
	const w = landscape ? 1180 : 820, ht = landscape ? 820 : 1180;
	const view = h('div.ev-view.mt.g-' + game);
	add(view, [main]);
	const dev = h('div.dev.is-ipad', { style: { width: w + 'px', height: ht + 'px' } },
		h('div.dev-status', h('span', '9:41'), h('span', '100%')),
		h('div.dev-mtop', obIcon('panel', 18), h('b', title), obIcon('more', 18)),
		h('div.dev-main', view));
	if (drawer) dev.append(drawer);
	return dev;
}

/** Show a device scaled to fit the page column (the iPad reviewer sees it whole). */
function fit(dev, w, max = Math.min(1320, (window.innerWidth || 1440) - 48)) {
	const z = Math.min(1, max / w);
	return h('div', { style: { zoom: String(z), width: 'max-content' } }, dev);
}
function devShot(dev, w, cap, sub) {
	return h('div.dev-wrap', fit(dev, w), h('div.dev-cap', h('b', cap), sub || null));
}

/** The sidebar while the fight runs in a main tab: round, now, what's next. Same store, same selection. */
function glance({ round, kicker = 'Now', name, hp, max, extra, rows, open = 'Running in the main tab' }) {
	return h('div.gl',
		h('div.gl-h', h('b', round), h('span.gl-open', icon('arrow-right', 13), open)),
		h('div.gl-now', h('div.k', kicker), h('div.n', name),
			hp !== undefined ? [h('div.hp', String(hp), h('small', `/ ${max}`)), bar({ value: hp, max })] : null, extra || null),
		h('div.gl-next', rows.map(r => r.sec ? h('div.ev-sec', { style: { padding: '8px 4px 2px' } }, h('span', r.sec), r.small ? h('small', r.small) : null)
			: h('div.gl-r' + (r.acted ? '.acted' : ''), mark(r.acted ? 'acted' : r.next ? 'next' : ''), h('span.nm', r.name), h('em', r.em || '')))));
}

/** Dashed "coming later" slot around something whose details are still open. */
function later(el, label = 'Coming later · to figure out') {
	el.classList.add('later-slot');
	el.prepend(h('span.later-flag', label));
	return el;
}
function toggle(label, on) { return h('span.ev-toggle' + (on ? '.on' : ''), h('i'), label ? h('span', label) : null); }

/** Main-tab columns that follow the tab's own width (container queries), never the device. */
function mtLayout(kind, cols) {
	return h('div.mt-cols.' + kind, cols.map((c, i) => { c.classList.add('mt-col', 'ar-' + 'abc'[i]); return c; }));
}
