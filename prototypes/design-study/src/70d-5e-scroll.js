/* ============================================================================
   5e: class scrollwork. "The book, at the table": gold-leaf filigree, fine
   engraved lines, the oxblood taper and diamonds. A class name as a heading
   sits between two scrolls, the left drawn once and mirrored for the right
   (scaleX(-1)). Every class shares the construction; the motif is the class's.
   Hooks: wraps G5S.sheet and adds the class heading above the sheet's tabs
   (the 5e sheet had no class heading); adds a gallery to the Design system
   page by wrapping gamePage. SRD classes only; every drawing is our own.
   ========================================================================== */
const X5SC = { H: 28 };
X5SC.dot = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
X5SC.star4 = (cx, cy, r, w = 0.3) => { const k = r * w; return `M${cx} ${cy - r}C${cx + k * .35} ${cy - k} ${cx + k} ${cy - k * .35} ${cx + r} ${cy}C${cx + k} ${cy + k * .35} ${cx + k * .35} ${cy + k} ${cx} ${cy + r}C${cx - k * .35} ${cy + k} ${cx - k} ${cy + k * .35} ${cx - r} ${cy}C${cx - k} ${cy - k * .35} ${cx - k * .35} ${cy - k} ${cx} ${cy - r}Z`; };
X5SC.sun = (cx, cy, n = 12) => {
	const f = v => v.toFixed(2); let d = X5SC.dot(cx, cy, 4.4);
	for (let i = 0; i < n; i++) {
		const a = i * Math.PI * 2 / n - Math.PI / 2, r0 = 6, r1 = i % 2 ? 8.6 : 11.2, w = i % 2 ? .16 : .2;
		const p = (ang, r) => `${f(cx + r * Math.cos(ang))} ${f(cy + r * Math.sin(ang))}`;
		d += `M${p(a - w, r0)}L${p(a, r1)}L${p(a + w, r0)}Z`;
	}
	return d;
};

/** Each class's motif, 24 × 24: gold silhouettes with engraved cuts (evenodd holes, so any paper shows through). */
X5SC.MOTIFS = {
	// A horned helm with a T visor.
	Barbarian: '<path fill-rule="evenodd" d="M6 19.6v-6C6 8.6 8.6 5.4 12 5.4s6 3.2 6 8.2v6zM8.2 12.4h7.6V14h-2.9v3.8h-1.8V14H8.2z"/><path d="M6.6 11.2C3.2 10.6 1.4 7.6 1.8 3c1.4 3 2.8 4.6 5.6 5.2zM17.4 11.2c3.4-.6 5.2-3.6 4.8-8.2-1.4 3-2.8 4.6-5.6 5.2z"/>',
	// A lute, its soundhole and bridge cut in.
	Bard: '<g transform="rotate(-38 12 12)"><path fill-rule="evenodd" d="M12 23c-4.4 0-6-3.4-5.6-6.4.4-3 2.8-5 4.7-5.8V3.4h1.8v7.4c1.9.8 4.3 2.8 4.7 5.8.4 3-1.2 6.4-5.6 6.4zM12 14.2a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8zM10.2 20h3.6v1h-3.6z"/><path d="M10.4.8h3.2l-.4 3h-2.4z"/></g>',
	// A sun disc with long and short rays: no one faith's symbol.
	Cleric: `<path d="${X5SC.sun(12, 12)}"/>`,
	// An acorn between two oak leaves.
	Druid: '<path d="M8.2 12.8h7.6c.4 4.2-1.4 7.8-3.8 9.8-2.4-2-4.2-5.6-3.8-9.8z"/><path d="M7 11.8C7 8.8 9.2 7 12 7s5 1.8 5 4.8z"/><path d="M11.5 7.4l.3-3.8h1l-.1 3.8z"/><path d="M6.6 7.8C3.8 8.8 1.2 7.2.6 3.8c3-.6 5.4.8 6 4zM17.4 7.8c2.8 1 5.4-.6 6-4-3-.6-5.4.8-6 4z"/>',
	// Two longswords crossed.
	Fighter: (() => { const s = `<path d="M12 1.2l1.6 2.4V15h-3.2V3.6zM7.4 15h9.2v2H7.4zM11.1 17h1.8v3.9h-1.8z${X5SC.dot(12, 21.9, 1.3)}"/>`; return `<g transform="rotate(42 12 12)">${s}</g><g transform="rotate(-42 12 12)">${s}</g>`; })(),
	// An open hand, a ki spiral in the palm.
	Monk: `<path d="M8.3 12V5.4M11 12V3.8M13.7 12V4.6M16.3 12V6.8M7.4 17.2 3.8 11.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path fill-rule="evenodd" d="M7.2 10.8h10.2v5.6c0 3.4-2.3 5.6-5.1 5.6s-5.1-2-5.1-4.6z${X5SC.dot(12.3, 15.8, 2.1)}"/><path d="${X5SC.dot(12.3, 15.8, .9)}"/>`,
	// A longsword held upright before a shield: the oath.
	Paladin: '<path fill-rule="evenodd" d="M12 3.4c2.8 1 5.4 1.4 7.8 1.2v6.8c0 5-3.4 8.4-7.8 10.4-4.4-2-7.8-5.4-7.8-10.4V4.6c2.4.2 5-.2 7.8-1.2zM9.8 1.6h4.4v13.4h3.8v4.6h-3.8v4h-4.4v-4H6v-4.6h3.8z"/><path d="M12 .2l1.5 2.2v13.4h-3V2.4zM6.8 15.8h10.4v2H6.8zM11.2 17.8h1.6v3.4h-1.6z"/><path d="M10.6 22.4a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0z"/>',
	// A longbow, strung, an arrow nocked.
	Ranger: '<path d="M7.2 2C13.4 5.6 13.4 18.4 7.2 22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M7.2 2v20" stroke="currentColor" stroke-width=".9"/><path d="M3 11.1h15.4v1.8H3zM17.8 9.4l5.6 2.6-5.6 2.6zM3.4 12 1 9.4h2.6L6 12l-2.4 2.6H1z"/>',
	// A domino mask with its ties.
	Rogue: '<path fill-rule="evenodd" d="M1.8 9.4C5 7.4 9 7.8 12 9.6c3-1.8 7-2.2 10.2-.2.6 4-1.8 7.6-5.4 7.6-2.4 0-3.8-1.4-4.8-3-1 1.6-2.4 3-4.8 3-3.6 0-6-3.6-5.4-7.6zM5 12c1.2-1.5 3.8-1.6 5.2 0-1.4 1.5-4 1.5-5.2 0zM13.8 12c1.4-1.6 4-1.5 5.2 0-1.2 1.5-3.8 1.5-5.2 0z"/><path d="M2.2 10.4.4 14.6l1 .4 1.9-3.8zM21.8 10.4l1.8 4.2-1 .4-1.9-3.8z"/>',
	// A flame with a second flame inside: magic in the blood.
	Sorcerer: '<path fill-rule="evenodd" d="M12 1.6c1 4 6.6 6.4 6.6 12.6 0 4.6-3 7.8-6.6 7.8s-6.6-3.2-6.6-7.4c0-3 1.7-5 3.1-6.2 0 2.2.8 3.6 2 4.2C9.9 8.6 10.9 5 12 1.6zM12 12c1.4 2 3.4 3.4 3.2 5.6-.2 1.8-1.6 2.8-3.2 2.8s-3-1-3-2.6c0-1.4.8-2.2 1.6-2.8.2 1 .7 1.6 1.3 1.8-.4-1.8-.3-3.4.1-4.8z"/>',
	// The patron's eye, slit pupil, rays above and below.
	Warlock: '<path fill-rule="evenodd" d="M1.6 12C5 6.6 19 6.6 22.4 12 19 17.4 5 17.4 1.6 12zM12 7.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 1 0 0-8.2z"/><path d="M12 8.6c1.2 1.6 1.2 5.2 0 6.8-1.2-1.6-1.2-5.2 0-6.8z"/><path d="M12 1.4v3M6.2 2.6l1.4 2.6M17.8 2.6l-1.4 2.6M12 22.6v-3M6.2 21.4l1.4-2.6M17.8 21.4l-1.4-2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
	// A pointed hat, a star cut in it and a star beside it.
	Wizard: `<path fill-rule="evenodd" d="M13 1.6c-.6 4 1.6 9 4.6 13.6H6.4C9 11.6 10.4 6.6 13 1.6zM7.4 12.4h9.2l.8 1.4H6.6z${X5SC.star4(12.6, 9.2, 1.9, .34)}"/><path d="M1.8 17.8c0-1.8 4.6-2.8 10.2-2.8s10.2 1 10.2 2.8-4.6 2.8-10.2 2.8S1.8 19.6 1.8 17.8z"/><path d="${X5SC.star4(19.4, 5, 2.6, .34)}"/>`,
};
X5SC.ORDER = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
X5SC.DRAWN = {
	Barbarian: 'a horned helm with a T visor', Bard: 'a lute, its soundhole and bridge cut in', Cleric: 'a sun disc with long and short rays (no one faith’s symbol)',
	Druid: 'an acorn between two oak leaves', Fighter: 'two longswords crossed', Monk: 'an open hand, a ki spiral in the palm',
	Paladin: 'a longsword held upright before a shield', Ranger: 'a strung longbow, an arrow nocked', Rogue: 'a domino mask with its ties',
	Sorcerer: 'a flame with a second flame inside: magic in the blood', Warlock: 'the patron’s eye, slit pupil, rays above and below', Wizard: 'a pointed hat, a star cut in it and a star beside it',
};
X5SC.motif = name => X5SC.MOTIFS[name] || X5SC.MOTIFS.Fighter;

/* The construction every class shares (left side; the right is the same drawing mirrored with scaleX(-1)).
   Full: a gold diamond, the oxblood taper (it stretches into the spare width), then the ornament: the taper's
   point, gold tendrils with a leaf each curling round the motif, the motif with air around it, an engraved
   rule and an oxblood diamond rimmed in gold. The title keeps 14px clear of it.
   Compact: the taper, a gold diamond and the motif, 10px clear of the title. */
X5SC.CAP = '<path class="gd" d="M1 14l4-4 4 4-4 4z"/>';
X5SC.REACH = '<path class="ox" d="M0 14 100 12.7v2.6z"/>';
X5SC.ORN = [
	'<path class="ox" d="M-1 12.7 18 12.3l4 1.7-4 1.7-19-.4z"/>',
	'<path class="fil" d="M3 12.5c8-.4 14.4-2.6 18.6-6 3-2.4 7-3 9 -1 2 2 .6 5-2 4.8-1.8-.2-2.4-2.2-1-3M3 15.5c8 .4 14.4 2.6 18.6 6 3 2.4 7 3 9 1 2-2 .6-5-2-4.8-1.8.2-2.4 2.2-1 3"/>',
	'<path class="fil" d="M11.6 11C9.8 9.2 10 6.6 12 6.1c1.5-.4 2.4 1.2 1.4 2.1M11.6 17c-1.8 1.8-1.6 4.4.4 4.9 1.5.4 2.4-1.2 1.4-2.1"/>',
	'<path class="gd" d="M23.4 14l2.4-2.4 2.4 2.4-2.4 2.4z"/>',
	'<path class="gd" d="M33.4 3.2l1.2-1.2 1.2 1.2-1.2 1.2zM33.4 24.8l1.2-1.2 1.2 1.2-1.2 1.2z"/>',
	'<path class="fil" d="M67 14h22" stroke-width=".9"/><path class="gd" d="M76.4 14l1.6-1.6 1.6 1.6-1.6 1.6z"/>',
	'<path class="ox" stroke="var(--x5-gold)" stroke-width=".9" d="M92 14l4.5-4.5L101 14l-4.5 4.5z"/>',
].join('');
X5SC.OW = 102; X5SC.MX = 38;
X5SC.COMPACT = '<path class="ox" d="M1 14l21-1.3v2.6z"/><path class="gd" d="M23 14l2.6-2.6 2.6 2.6-2.6 2.6z"/>';
X5SC.CW = 58; X5SC.CMX = 34;

X5SC.side = (name, right) => {
	const m = X5SC.motif(name);
	const reach = svg(X5SC.REACH, 100, X5SC.H, 'x5sc-reach'); reach.setAttribute('preserveAspectRatio', 'none');
	const full = h('span.x5sc-full', svg(X5SC.CAP, 10, X5SC.H, 'x5sc-cap'), reach, svg(X5SC.ORN + `<g class="m" transform="translate(${X5SC.MX} 2)">${m}</g>`, X5SC.OW, X5SC.H, 'x5sc-orn'));
	const compact = svg(X5SC.COMPACT + `<g class="m" transform="translate(${X5SC.CMX} 2)">${m}</g>`, X5SC.CW, X5SC.H, 'x5sc-compact');
	return h('span.x5sc-side' + (right ? '.is-r' : ''), full, compact);
};
X5SC.head = (name, opts = {}) => h('div.x5sc-h' + (opts.cls ? '.' + opts.cls : ''), X5SC.side(name), h('b.x5sc-t', name), X5SC.side(name, true));
X5SC.classOf = line => X5SC.ORDER.find(n => new RegExp(`\\b${n}\\b`).test(line || ''));

/* ---------- Hook: the sheet gets its class heading above the tabs ---------- */
G5S.sheet = (orig => (state = 'full', opts = {}) => {
	const el = orig(state, opts);
	const tabs = el.querySelector(':scope > .x5s-tabs');
	const cls = X5SC.classOf(ILSE.line);
	if (tabs && cls && state !== 'spells') tabs.before(X5SC.head(cls, { cls: 'in-sheet' }));
	return el;
})(G5S.sheet);

/* ---------- Design system: the gallery ---------- */
X5SC.panel = (theme, width) => h('div.g-5e.x5sc-stage.x5sc-' + theme, { style: { width: width + 'px' } },
	h('div.x5sc-stage-k', theme === 'light' ? 'Light' : 'Dark', ` · ${width}px`),
	X5SC.ORDER.map(n => X5SC.head(n)));
X5SC.motifSheet = () => h('div.g-5e.x5sc-motifs', X5SC.ORDER.map(n => h('div.x5sc-mt',
	svg(`<g class="m">${X5SC.motif(n)}</g>`, 24, 24, 'x5sc-m2'), svg(`<g class="m">${X5SC.motif(n)}</g>`, 24, 24, 'x5sc-m1'),
	h('div', h('b', n), h('small', X5SC.DRAWN[n])))));
X5SC.inPlace = () => h('div.x5sc-places',
	h('figure', h('div.g-5e.x5-paper.x5sc-dlg',
		h('div.x5sc-dlg-k', 'Level up · Ilse Vane'),
		X5SC.head('Wizard', { cls: 'is-big' }),
		h('div.x5sc-dlg-sub', 'Level 5 → 6'),
		h('ul.x5sc-dlg-l', [['Hit points', '+1d6 + 2'], ['Evoker', 'Sculpt Spells'], ['Spell slots', 'a third level-3 slot']].map(([k, v]) => h('li', h('small', k), h('b', v))))),
		h('figcaption', 'Level-up dialog: the class you’re levelling heads what’s new.')),
	h('figure', h('div.g-5e.x5-paper.x5sc-comp',
		h('div.x5sc-dlg-k', 'Compendium · Classes · SRD 5.2'),
		X5SC.head('Paladin', { cls: 'is-big' }),
		h('div.x5sc-facts', [['Primary ability', 'Strength and Charisma'], ['Hit die', 'd10'], ['Saves', 'Wisdom, Charisma']].map(([k, v]) => h('span', h('small', k), h('b', v))))),
		h('figcaption', 'Compendium class page: the same heading, larger.')),
	h('figure', h('div.g-5e.x5-paper.x5sc-sheetbox', h('div.x5s', X5SC.head('Wizard', { cls: 'in-sheet' }), G5S.tabs('Actions'))),
		h('figcaption', 'Character sheet: the class heading above the tabs (Ilse, a Wizard).')));
X5SC.LOG = [
	'<b>Construction:</b> one left scroll per class, centre line at y 14 of 28; the right is the same SVG with <code>transform: scaleX(-1)</code>. Gold leaf (<code>--x5-gold</code>) for the filigree, diamonds and motif; oxblood (<code>--g-rule</code>) for the taper and the tip. Filigree at 1.1, the engraved rule at 0.9: fine lines, the book’s weight; motifs are solid gold with engraved cuts so they hold up at 22px.',
	'<b>Scaling:</b> each side is a gold diamond, the oxblood taper and the ornament; the taper stretches into the spare width (up to 150px), so it stays a taper at any length. Under 440px the tendrils and rule drop and the compact scroll (taper, diamond, motif) takes over, 10px clear of the title. Level-up and the compendium use the same drawing at 1.3×.',
	'<b>Pass 1 (gallery, light and dark):</b> leaves on the tendrils beside the taper’s point read as an arrow’s fletching; the triple engraved rule read as a menu icon; the Paladin’s sword cut into a shield read as a cross. Fixed: counter-curls and a gold bead in place of the leaves, one fine rule with a bead, and the Paladin as a longsword held upright in front of the shield, its blade and pommel past the shield’s edges.',
	'<b>Pass 2 (breathing room, actual size):</b> 6px of air each side of the motif box, 14px from the tip to the title (10px compact). Fighter blades, the Ranger’s bow and shaft thickened: at 22px the 1.3px blades broke up.',
	'<b>Alignment (measured, every heading, both themes):</b> the scroll’s centre line against the middle of the title’s capitals, not its line box: 0.11px at sheet size, 0.18px at 1.3×. The title sits on the centre to 0.01px.',
];

X5SC.gallery = () => [
	h('h4.ds-row', 'Class scrollwork', h('small', 'Every SRD class heading: one construction, the class’s own motif. Left scroll drawn once, mirrored for the right.')),
	h('div.ds-row.x5sc-ds',
		h('div.x5sc-pair', X5SC.panel('light', 580), X5SC.panel('dark', 580)),
		h('h5.x5sc-h5', 'Compact, at phone width'),
		h('div.x5sc-pair', X5SC.panel('light', 340), X5SC.panel('dark', 340)),
		h('h5.x5sc-h5', 'Motifs at 2× and actual size'),
		X5SC.motifSheet(),
		h('h5.x5sc-h5', 'In place'),
		X5SC.inPlace(),
		h('h5.x5sc-h5', 'Critique log'),
		h('ul.prose.x5sc-log', X5SC.LOG.map(t => h('li', htmlSpan(t)))))];

gamePage = (orig => def => {
	const p = orig(def);
	if (def.id === '5e') { const ds = p.querySelector('.ds'); if (ds) add(ds, X5SC.gallery()); }
	return p;
})(gamePage);
