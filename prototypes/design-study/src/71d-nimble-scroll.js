/* ============================================================================
   Nimble: class scrollwork. A class name as a heading sits between two
   engraved scrolls, the left drawn once and mirrored for the right
   (scaleX(-1)). Every class shares the construction (notched tail, bar,
   two pairs of curls, the motif, a diamond tip), so headings line up; the
   motif in the scroll is the class's own, in the Heroes ochre.
   Hook: wraps GNS.classPanel (the sheet's class panel and the class
   gallery both call it) and swaps its heading; adds a gallery to the
   Design system page by wrapping gamePage.
   ========================================================================== */
const NSC = { W: 140, CW: 48, H: 28 };

/* Small geometry helpers for the motifs (24 × 24 box, centre 12,12). */
NSC.dot = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
NSC.star4 = (cx, cy, r, w = 0.28) => { const k = r * w; return `M${cx} ${cy - r}C${cx + k * .35} ${cy - k} ${cx + k} ${cy - k * .35} ${cx + r} ${cy}C${cx + k} ${cy + k * .35} ${cx + k * .35} ${cy + k} ${cx} ${cy + r}C${cx - k * .35} ${cy + k} ${cx - k} ${cy + k * .35} ${cx - r} ${cy}C${cx - k} ${cy - k * .35} ${cx - k * .35} ${cy - k} ${cx} ${cy - r}Z`; };
NSC.cog = (cx, cy, rOut, rIn, teeth) => {
	const pts = [], step = Math.PI * 2 / teeth, f = n => n.toFixed(2);
	for (let i = 0; i < teeth; i++) {
		const a = i * step - Math.PI / 2;
		for (const [da, r] of [[-.30, rIn], [-.17, rOut], [.17, rOut], [.30, rIn]]) pts.push([cx + r * Math.cos(a + da * step * 1.6), cy + r * Math.sin(a + da * step * 1.6)]);
	}
	return 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
};

/** Each class's motif: filled silhouettes (holes cut with evenodd, so any paper shows through), drawn for 22–24px. */
NSC.MOTIFS = {
	// A double axe, a bite out of each blade's edge: the rage is in the edge.
	Berserker: '<path d="M10.9 1.6 12 0l1.1 1.6V23h-2.2z"/><path d="M10.9 8.4C8.6 8 6.4 6.2 4.6 3.2 2.4 5.8 1.4 8.6 1.6 10L4 12l-2.4 2c-.2 1.4.8 4.2 3 6.8 1.8-3 4-4.8 6.3-5.2zM13.1 8.4c2.3-.4 4.5-2.2 6.3-5.2 2.2 2.6 3.2 5.4 3 6.8L20 12l2.4 2c.2 1.4-.8 4.2-3 6.8-1.8-3-4-4.8-6.3-5.2z"/>',
	// A swallowtail banner on a pole, a chevron cut through it.
	Commander: `<path fill-rule="evenodd" d="M5 3.4h2v18.2l-1 2-1-2zM7 4h14.5L17.8 8.6l3.7 4.6H7zM10 6.6l2.8 2.2 2.8-2.2v2.2l-2.8 2.2-2.8-2.2z"/><path d="${NSC.dot(6, 2.4, 1.7)}"/>`,
	// An arrow fletched with two leaves, its head a third leaf; on the scroll it points at the name.
	Hunter: '<path d="M4.6 10.9h13v2.2h-13z"/><path d="M15.4 12c1.6-2.6 4.2-2.8 6.6-1.6l1.8 1.6-1.8 1.6c-2.4 1.2-5 1-6.6-1.6z"/><path d="M8.6 11.2C7 7.4 4.2 5.4.6 5c.4 3.2 2.8 5.8 8 6.2zM8.6 12.8c-1.6 3.8-4.4 5.8-8 6.2.4-3.2 2.8-5.8 8-6.2z"/>',
	// A seal: a ring with four sigil marks, a four-pointed star inside.
	Mage: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="${NSC.star4(12, 12, 7.6, .32)}"/><path d="${NSC.dot(4.9, 4.9, 1.5)}${NSC.dot(19.1, 4.9, 1.5)}${NSC.dot(4.9, 19.1, 1.5)}${NSC.dot(19.1, 19.1, 1.5)}"/>`,
	// A heater shield with the oath ribbon tied across it, swallowtails out each side.
	Oathsworn: '<path fill-rule="evenodd" d="M12 1.8l7.6 2.6V11c0 5.4-3.5 9-7.6 11.4C7.9 20 4.4 16.4 4.4 11V4.4zM4.4 9.3h15.2v6.2H4.4z"/><path d="M.6 10.3h22.8l-2.2 2.1 2.2 2.1H.6l2.2-2.1z"/>',
	// Three hooded shades, the middle one with a face: a horde to spend.
	Shadowmancer: `<path fill-rule="evenodd" d="M12 2.6c3.8 0 5 4 5 7.6V21l-1.7-1.3-1.6 1.3-1.7-1.3-1.7 1.3-1.6-1.3L7 21V10.2c0-3.6 1.2-7.6 5-7.6zM12 7.4c-1.8 0-2.8 1.5-2.8 3.3 0 1.6 1.2 2.9 2.8 2.9s2.8-1.3 2.8-2.9c0-1.8-1-3.3-2.8-3.3z"/><path d="${NSC.dot(10.9, 10.6, .8)}${NSC.dot(13.1, 10.6, .8)}"/><path d="M3.4 8.6c2 0 2.4 2 2.4 3.8v7.4L4.9 19l-.9.8-.9-.8-.9.8-.9-.8-.9.8v-7.4c0-1.8.6-3.8 3.1-3.8zM20.6 8.6c-2 0-2.4 2-2.4 3.8v7.4l.9-.8.9.8.9-.8.9.8.9-.8.9.8v-7.4c0-1.8-.6-3.8-3.1-3.8z" transform="translate(-.3 0)"/>`,
	// A shepherd's crook with a small light caught in its hook.
	Shepherd: `<g transform="translate(-3 0)"><path d="M9.4 22.6V9.2c0-4.6 2.4-7 5.6-7s5.6 2.4 5.6 5.4c0 2.8-1.8 4.4-4 4.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="${NSC.star4(15, 7.4, 2.8, .4)}"/></g>`,
	// A lyre: two horned arms, a crossbar, three strings, a soundbox.
	Songweaver: '<path d="M8 19.6C4.2 17 4 11.4 6.6 8.2 8.2 6.2 7.2 3.6 4.8 2.8M16 19.6c3.8-2.6 4-8.2 1.4-11.4-1.6-2-.6-4.6 1.8-5.4M5.6 6.8h12.8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M10 7v12M12 7v12M14 7v12" stroke="currentColor" stroke-width="1"/><path d="M6.6 18.2h10.8c-.6 3-2.6 4.6-5.4 4.6s-4.8-1.6-5.4-4.6z"/>',
	// A storm cloud with a bolt breaking out of it.
	Stormshifter: '<path fill-rule="evenodd" d="M6.2 13.4C3.2 13.4 2 10.8 3.4 9 3.9 6.6 6.4 5.6 8 6.4c1-2.9 5.6-3.8 7.7-1 2.6-1.1 5.6.9 5.2 3.6 2 .8 1.7 4.4-.7 4.4zM12.2 11.4l-1.4 2.6h3.4l1.8-2.6z"/><path d="M11.6 12.6 8.4 18h3.2l-1.8 5.4 6.6-7.6h-3.3l2-3.2z"/>',
	// A loaded die (three pips) and a dagger, point up.
	'The Cheat': `<g transform="rotate(-14 7 12.5)"><path fill-rule="evenodd" d="M3.4 7h7.2c1.1 0 2 .9 2 2v7.2c0 1.1-.9 2-2 2H3.4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2z${NSC.dot(4.6, 10.1, 1.15)}${NSC.dot(7, 12.6, 1.15)}${NSC.dot(9.4, 15.1, 1.15)}"/></g><path d="M18 1l1.8 3v10h-3.6V4zM13.6 14h8.8v1.8h-8.8zM17.1 15.8h1.8v4.6h-1.8z"/><path d="${NSC.dot(18, 21.7, 1.5)}"/>`,
	// A whirlwind: five strokes winding down to a point.
	Zephyr: '<path d="M2.6 3.6h18.8M5 8h14.6M7.6 12.4h10.6M9.6 16.8h6.6M11.4 21.2h2.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
	// A cog with a crystal set in it: the maker's mana.
	Manawright: `<path fill-rule="evenodd" d="${NSC.cog(12, 12, 11.2, 8.4, 8)}M12 6.6l4.4 5.4-4.4 5.4-4.4-5.4z"/><path d="M12 8.8l2.6 3.2-2.6 3.2-2.6-3.2z"/>`,
	// A hexagon (the hex) binding an open eye.
	Hexbinder: `<path d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path fill-rule="evenodd" d="M5.4 12c2.6-4.2 10.6-4.2 13.2 0-2.6 4.2-10.6 4.2-13.2 0z${NSC.dot(12, 12, 2.5)}"/><path d="${NSC.dot(12, 12, 1.2)}"/>`,
	// A brain seen from above, two hemispheres and their folds.
	Psion: '<path fill-rule="evenodd" d="M11.1 3.2C8 2.4 5.6 3.6 4.6 5.6 2.6 6.2 1.8 8.4 2.6 10.2c-1.2 1.6-1 4 .6 5.2-.2 2.4 1.6 4.4 4 4.4 1.2 1.4 3 1.6 3.9.8zM4.8 9.2c1.6-1 3.6-.8 4.8.4-1.4-.4-3-.4-4.8-.4zM5 15c1.4.2 2.8-.4 3.6-1.6-.2 1.4-1.6 2.4-3.6 1.6zM12.9 3.2c3.1-.8 5.5.4 6.5 2.4 2 .6 2.8 2.8 2 4.6 1.2 1.6 1 4-.6 5.2.2 2.4-1.6 4.4-4 4.4-1.2 1.4-3 1.6-3.9.8zM19.2 9.2c-1.6-1-3.6-.8-4.8.4 1.4-.4 3-.4 4.8-.4zM19 15c-1.4.2-2.8-.4-3.6-1.6.2 1.4 1.6 2.4 3.6 1.6z"/>',
	// A cracked skull: neither living nor dead.
	Revenant: `<path fill-rule="evenodd" d="M12 2.2c-5.2 0-8 3.6-8 8 0 3 1.6 5 3.5 5.8v3.4c0 .9.6 1.6 1.5 1.6h6c.9 0 1.5-.7 1.5-1.6V16c1.9-.8 3.5-2.8 3.5-5.8 0-4.4-2.8-8-8-8z${NSC.dot(8.7, 10.4, 2.3)}${NSC.dot(15.3, 10.4, 2.3)}M12 13l1.1 2.2h-2.2zM10.1 18.2h.9V21h-.9zM13 18.2h.9V21H13zM12.6 2.1l-1.5 2.9 1.6 1.7-1.2 1.9.6.2 1.5-2.1-1.5-1.7 1.2-2.9z"/>`,
};
NSC.ALIASES = { Cheat: 'The Cheat' };
NSC.motif = name => NSC.MOTIFS[NSC.ALIASES[name] || name] || NSC.MOTIFS.Commander;

/* The construction every class shares (left side; the right is the same drawing mirrored with scaleX(-1)).
   Full: a notched end cap, a reach that stretches into the spare width, then the ornament: a pair of volutes,
   the motif with air around it, a short bar and a diamond tip. The title keeps 14px clear of the tip.
   Compact (narrow panels): the end cap, a short bar and the motif, still 10px clear of the title. */
NSC.CAP = '<path class="ink" d="M1 9.6h9v8.8H1a4.4 4.4 0 0 0 0-8.8z"/>';
NSC.REACH = '<path class="ink" d="M0 12.8h100v2.4H0z"/>';
NSC.ORN = [
	'<path class="ink" d="M-1 12.8h5.4l1.6 1.2-1.6 1.2H-1zM65 12.6h18v2.8H65zM85 14l5-5 5 5-5 5z"/>',
	'<path class="curl" stroke-width="2.4" d="M3 12.9c8-.4 14-3.6 17-7.2 2.2-2.7 5.4-3.1 7.2-1.2 1.8 1.9.8 4.9-1.8 4.9-1.8 0-2.6-1.8-1.4-3M3 15.1c8 .4 14 3.6 17 7.2 2.2 2.7 5.4 3.1 7.2 1.2 1.8-1.9.8-4.9-1.8-4.9-1.8 0-2.6 1.8-1.4 3"/>',
].join('');
NSC.OW = 95; NSC.MX = 34;
NSC.COMPACT = '<path class="ink" d="M1 10.4h8v7.2H1a3.6 3.6 0 0 0 0-7.2zM9 13.1h13v1.8H9z"/>';
NSC.CW = 52;

NSC.side = (name, right) => {
	const m = NSC.motif(name);
	const reach = svg(NSC.REACH, 100, NSC.H, 'xsc-reach'); reach.setAttribute('preserveAspectRatio', 'none');
	const full = h('span.xsc-full', svg(NSC.CAP, 10, NSC.H, 'xsc-cap'), reach, svg(NSC.ORN + `<g class="m" transform="translate(${NSC.MX} 2)">${m}</g>`, NSC.OW, NSC.H, 'xsc-orn'));
	const compact = svg(NSC.COMPACT + `<g class="m" transform="translate(28 2)">${m}</g>`, NSC.CW, NSC.H, 'xsc-s xsc-compact');
	return h('span.xsc-side' + (right ? '.is-r' : ''), full, compact);
};
/** The heading: scroll, name, scroll. Keeps the panel's own class so its type and spacing still apply. */
NSC.head = (name, opts = {}) => h('div.xns-class-h.xsc-h' + (opts.cls ? '.' + opts.cls : ''), { title: opts.title || null },
	NSC.side(name), h('b.xsc-t', name), NSC.side(name, true));

/* ---------- Hook: the class panel (sheet and gallery) ---------- */
GNS.classPanel = (orig => c => {
	const el = orig(c);
	const old = el.querySelector('.xns-class-h');
	if (old) old.replaceWith(NSC.head(c.cls));
	return el;
})(GNS.classPanel);

/* ---------- Design system: the gallery ---------- */
NSC.ORDER = ['Berserker', 'Commander', 'Hunter', 'Mage', 'Oathsworn', 'Shadowmancer', 'Shepherd', 'Songweaver', 'Stormshifter', 'The Cheat', 'Zephyr', 'Manawright', 'Hexbinder', 'Psion', 'Revenant'];
NSC.DRAWN = {
	Berserker: 'a double axe, a bite out of each blade (the rage is in the edge)', Commander: 'a swallowtail banner on a pole, a chevron cut through it',
	Hunter: 'an arrow fletched with two leaves, its head a third leaf; it points at the name', Mage: 'a seal: ring, four sigil marks, a four-pointed star',
	Oathsworn: 'a heater shield with the oath ribbon tied across it', Shadowmancer: 'three hooded shades, the middle one with a face: a horde',
	Shepherd: 'a crook with a small light caught in its hook', Songweaver: 'a lyre: horned arms, crossbar, three strings',
	Stormshifter: 'a storm cloud with a bolt breaking out', 'The Cheat': 'a loaded die (three pips) beside a dagger, point up',
	Zephyr: 'a whirlwind, five strokes winding down to a point', Manawright: 'a cog with a mana crystal set in it',
	Hexbinder: 'a hexagon binding an open eye', Psion: 'a brain seen from above, two hemispheres and their folds', Revenant: 'a cracked skull',
};
NSC.panel = (theme, width, names = NSC.ORDER) => h('div.g-nimble.xsc-stage.xsc-' + theme, { style: { width: width + 'px' } },
	h('div.xsc-stage-k', theme === 'light' ? 'Light' : 'Dark', ` · ${width}px`),
	names.map(n => NSC.head(n)));
NSC.motifSheet = () => h('div.g-nimble.xsc-motifs', NSC.ORDER.map(n => h('div.xsc-mt',
	svg(`<g class="m">${NSC.motif(n)}</g>`, 24, 24, 'xsc-m2'), svg(`<g class="m">${NSC.motif(n)}</g>`, 24, 24, 'xsc-m1'),
	h('div', h('b', n), h('small', NSC.DRAWN[n])))));
NSC.inPlace = () => h('div.xsc-places',
	h('figure', h('div.g-nimble.xsc-dlg',
		h('div.xsc-dlg-k', 'Level up · Brakka'),
		NSC.head('Berserker', { cls: 'is-big' }),
		h('div.xsc-dlg-sub', 'Level 3 → 4'),
		h('ul.xsc-dlg-l', ['Enduring Rage', 'Key Stat Increase', 'Savage Arsenal'].map(t => h('li', t)))),
		h('figcaption', 'Level-up dialog: the class you’re levelling heads the list of what’s new.')),
	h('figure', h('div.g-nimble.xsc-comp',
		h('div.xsc-comp-k', 'Compendium · Classes'),
		NSC.head('Shadowmancer', { cls: 'is-big' }),
		h('p', 'A shadowy master of expendable hordes.'),
		h('div.xsc-facts', [['Key stats', 'INT, WIL'], ['Hit die', 'd8'], ['Complexity', '3']].map(([k, v]) => h('span', h('small', k), h('b', v))))),
		h('figcaption', 'Compendium class page: the same heading, larger.')),
	h('figure', h('div.g-nimble.xsc-sheetbox', GNS.classPanel(BRAKKA)),
		h('figcaption', 'Character sheet: the class panel. The class gallery uses the same panel.')));
NSC.LOG = [
	'<b>Construction:</b> one left scroll per class, centre line at y 14 of 28; the right is the same SVG with <code>transform: scaleX(-1)</code>. Ink is the sheet charcoal warmed (#4B4743; a warm grey, #A39B8F, in dark), the motif is the class ochre, nothing else is coloured. Volutes 2.4, bars 2.4 to 3.2: the sheet’s weight, not hairlines.',
	'<b>Scaling:</b> the heading is a size container. Each side is an end cap, a reach and the ornament; the reach stretches into the spare width (up to 150px) so a wide panel gets long scrolls. Under 430px the volutes and tip drop and the compact scroll (cap, short bar, motif) takes over, 10px clear of the title. Level-up and the compendium use the same drawing at 1.3×.',
	'<b>Pass 1 (gallery, light and dark):</b> swallowtail ends plus two pairs of curls pointing the same way read as arrow fletching, not scrollwork; the double axe with saw teeth read as a maple leaf; the wing read as a leaf (too close to the Hunter); the Psion waves read as a Wi-Fi icon. Fixed: a notched end cap (the skills band’s bite), one pair of volutes; an axe whose blades flare from a short grip with one bite each; a whirlwind for the Zephyr; a brain for the Psion.',
	'<b>Pass 2 (breathing room, the user’s note):</b> the motif was packed between bars. Now 6px of air each side of the motif box (glyphs drawn inside 22 of its 24), 14px between the tip and the title (10px compact), and the bar no longer runs through the volutes, so they cradle the motif like a cartouche instead of a trident. Rings in the Mage and Hexbinder motifs brought up to 2px to match the volutes.',
	'<b>Alignment (measured, every heading, both themes):</b> the scroll’s centre line against the middle of the title’s capitals (baseline − cap height ÷ 2), not its line box: 0.09px at sheet size, 0.03px at 1.3×. The title sits on the panel’s centre to 0.01px; sides are equal flex halves, so long names (Shadowmancer, Stormshifter) stay centred.',
];

NSC.gallery = () => [
	h('h4.ds-row', 'Class scrollwork', h('small', 'Every class heading: one construction, the class’s own motif. Left scroll drawn once, mirrored for the right.')),
	h('div.ds-row.xsc-ds',
		h('div.xsc-pair', NSC.panel('light', 560), NSC.panel('dark', 560)),
		h('h5.xsc-h5', 'Compact, at phone width'),
		h('div.xsc-pair', NSC.panel('light', 330), NSC.panel('dark', 330)),
		h('h5.xsc-h5', 'Motifs at 2× and actual size'),
		NSC.motifSheet(),
		h('h5.xsc-h5', 'In place'),
		NSC.inPlace(),
		h('h5.xsc-h5', 'Critique log'),
		h('ul.prose.xsc-log', NSC.LOG.map(t => h('li', htmlSpan(t)))))];

gamePage = (orig => def => {
	const p = orig(def);
	if (def.id === 'nimble') { const ds = p.querySelector('.ds'); if (ds) add(ds, NSC.gallery()); }
	return p;
})(gamePage);
