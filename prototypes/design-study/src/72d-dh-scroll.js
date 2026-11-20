/* ============================================================================
   Daggerheart class scrollwork (pass 6): ornamental flourishes either side of a
   class name, one build for every class, the class's own motif in it.
   The build (one side, the other mirrored): a tapering gold stem; two pairs of
   C-scrolls, mirrored top and bottom about the title's centre line; beads; a
   diamond medallion beside the title holding the class mark, ringed in one of
   the class's two domain colours (left side the first domain, right side the
   second); the class mark again, small, as the outer terminal.
   Classes and domains from the Core Rulebook (pp.28–50, and the overview p.9).
   Our own drawing: not traced from any game or book.
   ========================================================================== */
const DH_CLASSES = {
	Bard: { doms: ['Grace', 'Codex'], mark: '<path d="M7.6 2.4v6.2"/><circle cx="5.7" cy="8.7" r="1.9"/><path d="M7.6 2.4 10.2 3.6"/>' },
	Druid: { doms: ['Sage', 'Arcana'], mark: '<path d="M2.4 9.6C2.4 5 5 2.4 9.6 2.4c0 4.6-2.6 7.2-7.2 7.2Z"/><path d="M2.4 9.6 6.6 5.4"/>' },
	Guardian: { doms: ['Valor', 'Blade'], mark: '<path d="M6 1.8 10 3.2v3c0 2.4-1.7 3.9-4 5-2.3-1.1-4-2.6-4-5v-3Z"/>' },
	Ranger: { doms: ['Bone', 'Sage'], mark: '<path d="M2.2 9.8 9.8 2.2"/><path d="M6.4 2.2h3.4v3.4"/><path d="M2.2 6.8v3h3"/>' },
	Rogue: { doms: ['Midnight', 'Grace'], mark: '<path d="M10 2 4.8 7.2"/><path d="M10 2 9.2 4.4 6.6 5.4"/><path d="M3.4 5.8l2.8 2.8"/><path d="M4.2 7.8 2 10"/>' },
	Seraph: { doms: ['Splendor', 'Valor'], mark: '<path d="M2 9.6C2.8 5.4 5.8 2.6 10 2.2c-.5 2-1.6 3.3-3.1 4 1 .2 1.9 0 2.6-.3C8.5 8.1 5.8 9.8 2 9.6Z"/>' },
	Sorcerer: { doms: ['Arcana', 'Midnight'], mark: '<path d="M6 1.6c.4 2 2.7 3 2.7 5.7a2.7 2.7 0 0 1-5.4 0c0-1.6 1.2-2.4 1.6-3.6.5 1 .6 1.6 1 2.1"/>' },
	Warrior: { doms: ['Blade', 'Bone'], mark: '<path d="M2.2 2.2 9.8 9.8M9.8 2.2 2.2 9.8"/><path d="M2.4 7.6l2 2M9.6 7.6l-2 2"/>' },
	Wizard: { doms: ['Codex', 'Splendor'], mark: '<path d="M6 1.6 7.3 4.7 10.4 6 7.3 7.3 6 10.4 4.7 7.3 1.6 6 4.7 4.7Z"/>' },
};
/* Domain accents: the domain's colour, lifted for indigo (dark) and deepened for parchment (light). */
const DH_DOM_ACCENT = {
	Valor: ['#EE8A45', '#B4501A'], Blade: ['#EC5E63', '#A8262A'], Grace: ['#E07CB6', '#A43B78'], Codex: ['#7FA2EC', '#2B4C8C'], Sage: ['#6FBF7B', '#2F6B3A'],
	Arcana: ['#AE93F5', '#5B3CA8'], Bone: ['#CFC9BD', '#6D6A64'], Midnight: ['#A49DD6', '#3A3460'], Splendor: ['#F0C94A', '#8F6A0A'],
};

/** One side of the scrollwork, drawn for the left; the right is the same drawing mirrored.
    viewBox 180 × 36, the title's centre line at y = 18, the title past x = 180 and the gap. */
GDS.scrollSide = (cls, side = 'left', opts = {}) => {
	const c = DH_CLASSES[cls];
	const dom = c.doms[side === 'left' ? 0 : 1];
	const mark = (x, y, s, cl) => `<g class="${cl}" transform="translate(${x} ${y}) scale(${s / 12})">${c.mark}</g>`;
	const curl = dir => {
		// the scrolls leave the stem and curl outward; dir 1 = up, -1 = down (mirrored about the centre line, y 18)
		const Y = v => +(18 + (v - 18) * dir).toFixed(2);
		const X = (v, dx) => +(v + dx).toFixed(2);
		const big = 12, small = 20, tip = 10, leaf = 15;
		return `<path class="ln" d="M${X(66, big)} ${Y(17.3)} C${X(53, big)} ${Y(16.4)} ${X(42.6, big)} ${Y(10.6)} ${X(44.4, big)} ${Y(4.8)} C${X(45.9, big)} ${Y(0.9)} ${X(52.8, big)} ${Y(1.4)} ${X(53, big)} ${Y(6)} C${X(53.2, big)} ${Y(9)} ${X(49.8, big)} ${Y(10)} ${X(48.4, big)} ${Y(7.8)}"/>`
			+ `<path class="ln th" d="M${X(100, small)} ${Y(17.5)} C${X(92.4, small)} ${Y(15.4)} ${X(88.8, small)} ${Y(10.6)} ${X(91.4, small)} ${Y(7.8)} C${X(93.6, small)} ${Y(5.6)} ${X(97.2, small)} ${Y(7.2)} ${X(96.2, small)} ${Y(10)}"/>`
			+ `<path class="ln th" d="M${X(36, tip)} ${Y(17.6)} C${X(29.6, tip)} ${Y(16)} ${X(26.4, tip)} ${Y(12.4)} ${X(28.4, tip)} ${Y(10)} C${X(29.8, tip)} ${Y(8.4)} ${X(32, tip)} ${Y(9.6)} ${X(31.2, tip)} ${Y(11.2)}"/>`
			+ `<path class="leaf" d="M${X(75, leaf)} ${Y(16.8)} C${X(76.5, leaf)} ${Y(12.6)} ${X(80.6, leaf)} ${Y(10.8)} ${X(84.4, leaf)} ${Y(11.4)} C${X(82.6, leaf)} ${Y(14.6)} ${X(79, leaf)} ${Y(16.6)} ${X(75, leaf)} ${Y(16.8)}Z"/>`
			+ `<circle class="acc" cx="${X(49.2, big)}" cy="${Y(5.6)}" r="1.9"/><circle class="acc" cx="${X(93.6, small)}" cy="${Y(9)}" r="1.4"/>`;
	};
	// 180 × 36: tip, scrolls, beads, then the medallion (centre 158) with clear space before the title
	const markup = `<path class="stem" d="M18 18 Q80 15.9 145 16.4 L145 19.6 Q80 20.1 18 18Z"/>`
		+ curl(1) + curl(-1)
		+ `<circle class="bead" cx="87.5" cy="18" r="1.9"/><circle class="bead" cx="132" cy="18" r="2.4"/><circle class="bead" cx="139" cy="18" r="1.5"/><circle class="bead" cx="23" cy="18" r="1.4"/>`
		+ `<path class="med" d="M158 2.8 173.2 18 158 33.2 142.8 18Z"/><path class="med-r" d="M158 6.6 169.4 18 158 29.4 146.6 18Z"/>`
		+ (side === 'right' ? `<g transform="translate(316 0) scale(-1 1)">${mark(152.6, 12.6, 10.8, 'mk')}</g>` : mark(152.6, 12.6, 10.8, 'mk'))
		+ (side === 'right' ? `<g transform="translate(15.6 0) scale(-1 1)">${mark(1.6, 11.8, 12.4, 'tm')}</g>` : mark(1.6, 11.8, 12.4, 'tm'));
	// the right side is the left mirrored; its two marks are flipped back so they read the right way round
	const s = svg(markup, 180, 36, 'xsc-s xsc-' + side);
	if (opts.compact) s.setAttribute('viewBox', '137 0 43 36');
	else if (opts.mid) s.setAttribute('viewBox', '85 0 95 36');
	else s.setAttribute('preserveAspectRatio', 'xMaxYMid slice'); // narrow: the outer tips give way, the medallion keeps its size
	s.removeAttribute('width'); s.removeAttribute('height');
	s.style.setProperty('--acc-d', DH_DOM_ACCENT[dom][0]);
	s.style.setProperty('--acc-l', DH_DOM_ACCENT[dom][1]);
	s.setAttribute('data-domain', dom);
	return s;
};

/** A class name between its scrollwork. size: 'lg' (class page, level up), 'md' (headings), 'sm' (the hero band's class line).
    compact: the phone form, only the medallion and its beads. band: always on indigo. */
GDS.classTitle = (cls, text, opts = {}) => h('span.xsc.is-' + (opts.size || 'md') + (opts.compact ? '.is-compact' : '') + (opts.mid ? '.is-mid' : '') + (opts.band ? '.on-band' : ''),
	{ title: `${cls} · ${DH_CLASSES[cls].doms.join(' & ')}` },
	GDS.scrollSide(cls, 'left', opts), h('span.xsc-t', text || cls), GDS.scrollSide(cls, 'right', opts));

/** A class page's heading: the scrollwork, the class name, its two domains under it. */
GDS.classHead = (cls, opts = {}) => h('div.xsc-head' + (opts.compact ? '.is-compact' : ''),
	GDS.classTitle(cls, cls, { size: opts.size || 'lg', compact: opts.compact }),
	h('div.xsc-doms', DH_CLASSES[cls].doms.map(d => h('span.xsc-dom.d-' + d.toLowerCase(), GDS.glyph(d, 13), h('span', d)))));

/* ---------- Where class names are headings ---------- */
/* The sheet's hero band: the class line between its scrollwork. */
GDS.band = (orig => (c, opts = {}) => {
	const el = orig(c, opts);
	const l = el.querySelector('.xds-id .l');
	if (l) { l.textContent = ''; l.append(GDS.classTitle(c.cls, `${c.cls} (${c.sub})`, { size: 'sm', band: true, compact: !!opts.phone, mid: !opts.phone })); }
	return el;
})(GDS.band);

/** Level up: the class heading leads the dialog. */
GDS.levelUp = (opts = {}) => h((opts.phone ? 'div' : 'div.sh-modal') + '.xd-paper.xsc-lvl' + (opts.phone ? '.is-phone' : ''),
	h('div.xsc-lvl-band',
		opts.phone ? null : btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' }),
		GDS.classTitle('Guardian', 'Guardian', { size: opts.phone ? 'md' : 'lg', band: true, compact: !!opts.phone }),
		h('div.xsc-lvl-sub', 'Level 2 → 3 · Stalwart, tier 2')),
	h('div.xsc-lvl-body',
		h('p.xds-hint', 'Choose two advancements'),
		h('div.xsc-opts', [['+1 to two traits', 'Agility and Presence', true], ['+1 HP slot', '7 → 8', true], ['+1 Stress slot', '6 → 7'], ['+1 to an Experience', 'Shield-wall veteran +3'], ['A new domain card', 'Valor or Blade, level 3 or lower'], ['+1 Evasion', '9 → 10']].map(([n, d, on]) => h('div.xsc-opt' + (on ? '.on' : ''), h('span.ev-mark' + (on ? '.is-acted' : ''), on ? icon('check', 12, 3) : null), h('b', n), h('small', d)))),
		clusters(cluster([btn({ kind: 'primary', icon: 'arrow-up', text: 'Level up' })]), cluster([btn({ text: 'Later', kind: 'quiet' })], { end: true }))));

/** The gallery: every class, full size and compact, as a class page heads it. */
GDS.scrollGallery = (opts = {}) => {
	const el = h('div.xsc-gal' + (opts.band ? '.on-band' : ''),
		h('div.xsc-gal-grid', Object.keys(DH_CLASSES).map(k => h('div.xsc-cell', GDS.classHead(k, { size: opts.size })))),
		h('div.xsc-gal-h', 'Compact (phone): the medallions only, never wider than the name'),
		h('div.xsc-gal-compact', Object.keys(DH_CLASSES).map(k => GDS.classTitle(k, k, { size: 'md', compact: true }))));
	if (opts.span) setTimeout(() => { const st = el.closest('.state'); if (st) { st.style.gridColumn = '1 / -1'; } }, 0);
	return el;
};

/* ---------- Pages ---------- */
DEFS.dh.sheet.notes = (DEFS.dh.sheet.notes || []).concat([
	'<b>Class scrollwork.</b> Every class name that heads something (the sheet’s class line, level up, a class page) sits between symmetrical gold flourishes: one build for all nine classes, the class’s own mark in the medallion and at the outer tip, the two domains’ colours on the medallion rings (first domain left, second right). On a phone only the medallions stay, so the name keeps its room.',
]);
DEFS.dh.sheet.shots.push(
	{ device: 'note-landscape', title: 'Kael Ardent', cap: 'Level up, headed by the class', sub: 'The Guardian’s scrollwork on the dialog’s indigo band: shield marks, Valor orange on the left medallion, Blade red on the right.', render: () => GDS.sheet(), overlay: () => GDS.levelUp() },
	{ custom: () => h('div.sh-pair', { style: { alignItems: 'flex-start', flexWrap: 'wrap' } },
		h('div', h('div.g-dh.xdh-stage', { style: { width: '1320px' } }, GDS.scrollGallery({ band: true })), h('div.view-cap', h('b', 'Class pages, on indigo'), 'All nine classes. Gold filigree; each class’s mark in its medallions and at the tips; the medallion rings in its two domains’ colours.'))),
		cap: 'Class scrollwork: one build, nine classes', sub: 'Bard (Grace, Codex), Druid (Sage, Arcana), Guardian (Valor, Blade), Ranger (Bone, Sage), Rogue (Midnight, Grace), Seraph (Splendor, Valor), Sorcerer (Arcana, Midnight), Warrior (Blade, Bone), Wizard (Codex, Splendor). CR pp.28–50.' },
	{ device: 'note-phone', title: 'Level up', cap: 'Phone: level up, compact scrollwork', sub: 'Only the medallions flank the name, so the title never crowds.', render: () => GDS.sheet('full', { phone: true }), overlay: () => sheet('Level up', GDS.levelUp({ phone: true })) },
);
/* The design-system page: the gallery spans the states grid and follows the page's theme. */
GD.states = (orig => () => [['Class scrollwork: all nine classes, full and compact (follows the theme)', GDS.scrollGallery({ span: true, size: 'md' })], ...orig()])(GD.states);
DEFS.dh.states = GD.states;
