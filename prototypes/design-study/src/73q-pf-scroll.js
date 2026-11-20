/* ============================================================================
   PF2e class scrollwork: ornaments either side of a class's name, the way a
   quest title is flanked in Skyrim, dressed as Pathfinder's heraldry. One
   build for every class (a gold stud, a rule, a crimson lozenge with gold
   rims holding the class's motif, then paired C-scrolls on a tapering stem);
   only the motif changes. All drawn here: no Paizo class icons, nothing
   traced. The left half is drawn; the right is the same SVG mirrored.
   ========================================================================== */
const PF_CLASSES = ['Alchemist', 'Barbarian', 'Bard', 'Champion', 'Cleric', 'Druid', 'Fighter', 'Investigator', 'Monk', 'Oracle', 'Ranger', 'Rogue', 'Sorcerer', 'Swashbuckler', 'Witch', 'Wizard'];

/** Each class's motif on a 24 grid: filled shapes (m) and knock-outs in the lozenge's crimson (k). */
const PF_MOTIF = {
	Alchemist: { m: ['M9 2.5h6v2h-1.2v4.4l5.3 8.6a2.4 2.4 0 0 1-2 3.6H6.9a2.4 2.4 0 0 1-2-3.6l5.3-8.6V4.5H9z'], k: ['M8.2 15.2h7.6l1.6 2.6c.2.4 0 .8-.5.8H7.1c-.5 0-.7-.4-.5-.8z'] },
	Barbarian: { m: ['M11 2.5h2v19h-2z', 'M10.6 5.2C6.8 4 3.6 6 2.6 10c1 3.6 4.4 5.4 8 4.4z', 'M13.4 5.2c3.8-1.2 7 .8 8 4.8-1 3.6-4.4 5.4-8 4.4z'] },
	Bard: { m: ['M6.2 3.4 8 2.6c1.6 3 1.6 6.6.6 9.6H15.4c-1-3-1-6.6.6-9.6l1.8.8c-2 3.6-1.4 8.6 1.4 11.4-1.8 2.2-4.2 3.2-7.2 3.2s-5.4-1-7.2-3.2c2.8-2.8 3.4-7.8 1.4-11.4z', 'M9 20h6v2H9z'], k: ['M9.6 14.2h.9v3h-.9zM11.55 14.2h.9v3.3h-.9zM13.5 14.2h.9v3h-.9z'] },
	Champion: { m: ['M12 2l8.5 3.2v6.2c0 5.2-3.6 8.9-8.5 11.2-4.9-2.3-8.5-6-8.5-11.2V5.2z'], k: ['M11 6.5h2v4.2h3.6v2H13v5.3h-2v-5.3H7.4v-2H11z'] },
	Cleric: { m: [(() => { let d = 'M12 7.6a4.4 4.4 0 1 1 0 8.8a4.4 4.4 0 1 1 0-8.8z'; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a), r1 = 5.6, r2 = i % 2 ? 9.2 : 10.6, w = .9; const p = (r, o) => `${(12 + r * c - o * s).toFixed(2)} ${(12 + r * s + o * c).toFixed(2)}`; d += `M${p(r1, -w)}L${p(r2, 0)}L${p(r1, w)}Z`; } return d; })()] },
	Druid: { m: ['M12 2C5.8 6 5 14.2 11 19.6V22h2v-2.4C19 14.2 18.2 6 12 2z'], k: ['M11.45 6.5h1.1v12.3h-1.1zM12.3 11.4l2.6-1.8.6.8-3.2 2.2zM11.7 14l-2.6-1.8-.6.8 3.2 2.2z'] },
	Fighter: { m: ['M11 2h2l.6 12.6h-3.2z', 'M6.4 14.6h11.2v2H6.4z', 'M11 16.6h2v3.4h-2z', 'M10.2 20h3.6v2.2h-3.6z'] },
	Investigator: { m: ['M10 2.8a7.2 7.2 0 1 1 0 14.4a7.2 7.2 0 1 1 0-14.4zm0 2.6a4.6 4.6 0 1 0 0 9.2a4.6 4.6 0 1 0 0-9.2z', 'M14.4 15.9l1.9-1.9 5.6 5.6-1.9 1.9z'] },
	Monk: { m: ['M12 3c2.6 3.2 2.6 8.6 0 12.6-2.6-4-2.6-9.4 0-12.6z', 'M3.4 9.4c4.2-.2 7.4 2.8 8.2 7-4.2.2-7.4-2.8-8.2-7z', 'M20.6 9.4c-4.2-.2-7.4 2.8-8.2 7 4.2.2 7.4-2.8 8.2-7z', 'M4.6 18.6h14.8v2.2H4.6z'] },
	Oracle: { m: ['M1.8 12C4.8 6.8 8.6 5 12 5s7.2 1.8 10.2 7c-3 5.2-6.8 7-10.2 7S4.8 17.2 1.8 12z'], k: ['M12 8.4a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2z'], m2: ['M12 10.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2z'] },
	Ranger: { m: ['M20.8 3.2 21 10l-2.4-2.4L6.4 19.8 4.2 17.6 16.4 5.4 14 3z', 'M5.6 14.8 3 15.4l-.8 2.4 2.4-.4zM9.2 18.4l-.6 2.6-2.4.8.4-2.4z'] },
	Rogue: { m: ['M1.8 9.2c3.2-2.4 7-2.4 10.2-.2 3.2-2.2 7-2.2 10.2.2-.4 5.4-4.2 7.8-7.4 5.6-1.2-.8-1.8-2-2.8-2s-1.6 1.2-2.8 2C6 17 2.2 14.6 1.8 9.2z'], k: ['M7 9.6c1.6 0 2.8.8 3.2 1.8-1.2 1-3.6 1.2-5.2-.2.4-1 1-1.6 2-1.6zM17 9.6c-1.6 0-2.8.8-3.2 1.8 1.2 1 3.6 1.2 5.2-.2-.4-1-1-1.6-2-1.6z'] },
	Sorcerer: { m: ['M12.4 1.8c1 4.2 6.4 6.2 6.4 12.4a6.8 6.8 0 0 1-13.6 0c0-3.2 1.8-5.4 3.2-6.6 0 2.2 1 3.4 2.2 3.6-.2-4 .2-6.8 1.8-9.4z'], k: ['M12 13.2c.6 1.8 2.8 2.6 2.8 4.8a2.8 2.8 0 0 1-5.6 0c0-1.6 1.6-2.8 2.8-4.8z'] },
	Swashbuckler: { m: ['M11.2 1.6h1.6l.5 12.2h-2.6z', 'M12 11.4a5.4 5.4 0 0 1 5.4 5.4h-2.2a3.2 3.2 0 0 0-6.4 0H6.6A5.4 5.4 0 0 1 12 11.4z', 'M5 16.4h14v1.8H5z', 'M11 18.2h2v2.8h-2z', 'M12 20.6a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z'] },
	Witch: { m: ['M14.6 2.6a9.6 9.6 0 1 0 6.8 15.6A7.6 7.6 0 1 1 14.6 2.6z', 'M18.6 3.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'] },
	Wizard: { m: ['M12.4 1.8 18 14.6H6.2z', 'M2.6 15.4h18.8v2.6H2.6z', 'M5.6 18h12.8l-1 2.6H6.6z'], k: ['M12 7.6l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'] },
};

/** The motif inside its lozenge, as SVG markup centred on (cx, cy), `s` px across. */
GPS.motif = (cls, cx, cy, s) => {
	const g = PF_MOTIF[cls] || PF_MOTIF.Fighter, k = s / 24;
	const t = `translate(${(cx - s / 2).toFixed(2)} ${(cy - s / 2).toFixed(2)}) scale(${k.toFixed(4)})`;
	return `<g transform="${t}"><path class="mo" d="${g.m.join('')}"/>${g.k ? `<path class="mk" d="${g.k.join('')}"/>` : ''}${g.m2 ? `<path class="mo" d="${g.m2.join('')}"/>` : ''}</g>`;
};

/**
 * One half of the scrollwork (the left; CSS mirrors it for the right), drawn from the title outwards.
 * size: 'full' (laptop and iPad, 176 × 36) | 'compact' (phone, 72 × 28). The lozenge holds its motif
 * with a clear margin inside the rims; each part has air around it.
 */
GPS.scrollHalf = (cls, size = 'full') => {
	if (size === 'compact') {
		const W = 72, H = 28, c = H / 2, mx = 42, r = 12.5, a = mx - r - 2.5;
		const m = `<path class="sd" d="M68 ${c - 2.4} 70.4 ${c} 68 ${c + 2.4} 65.6 ${c}Z"/>
			<path class="st" d="M62 ${c - .55} ${mx + r + 3} ${c - .3} ${mx + r + 3} ${c + .3} 62 ${c + .55}Z"/>
			<path class="lz" d="M${mx} ${c - r} ${mx + r} ${c} ${mx} ${c + r} ${mx - r} ${c}Z"/>
			<path class="lzi" d="M${mx} ${c - r + 2.8} ${mx + r - 2.8} ${c} ${mx} ${c + r - 2.8} ${mx - r + 2.8} ${c}Z"/>
			${GPS.motif(cls, mx, c, 11.5)}
			<path class="st" d="M${mx - r} ${c - .7} 3 ${c} ${mx - r} ${c + .7}Z"/>
			<path class="sc" d="M${a} ${c - .8}C${a - 3} ${c - 8.5} ${a - 12} ${c - 10} ${a - 14} ${c - 6.2}C${a - 15.2} ${c - 4} ${a - 13} ${c - 2.8} ${a - 11.8} ${c - 4.2}"/>
			<path class="sc" d="M${a} ${c + .8}C${a - 3} ${c + 8.5} ${a - 12} ${c + 10} ${a - 14} ${c + 6.2}C${a - 15.2} ${c + 4} ${a - 13} ${c + 2.8} ${a - 11.8} ${c + 4.2}"/>
			<circle class="sd" cx="1.6" cy="${c}" r="1.3"/>`;
		return svg(m, W, H);
	}
	const W = 176, H = 36, c = H / 2, mx = 110, r = 16.5, a = mx - r - 5, b2 = a - 35, n = mx + r;
	const m = `<path class="sd" d="M170 ${c - 3} 173 ${c} 170 ${c + 3} 167 ${c}Z"/>
		<path class="st" d="M162 ${c - .7} ${n + 6} ${c - .35} ${n + 6} ${c + .35} 162 ${c + .7}Z"/>
		<path class="sc" d="M${n + 13} ${c - 1.2}C${n + 11} ${c - 5.6} ${n + 6} ${c - 6.8} ${n + 2.5} ${c - 5}"/>
		<path class="sc" d="M${n + 13} ${c + 1.2}C${n + 11} ${c + 5.6} ${n + 6} ${c + 6.8} ${n + 2.5} ${c + 5}"/>
		<path class="lz" d="M${mx} ${c - r} ${n} ${c} ${mx} ${c + r} ${mx - r} ${c}Z"/>
		<path class="lzi" d="M${mx} ${c - r + 3.4} ${n - 3.4} ${c} ${mx} ${c + r - 3.4} ${mx - r + 3.4} ${c}Z"/>
		${GPS.motif(cls, mx, c, 15.5)}
		<path class="st" d="M${mx - r} ${c - 1.1} 5 ${c} ${mx - r} ${c + 1.1}Z"/>
		<path class="sc" d="M${a} ${c - 1}C${a - 4} ${c - 12.5} ${a - 26} ${c - 15} ${a - 29.5} ${c - 9.6}C${a - 31.2} ${c - 6.4} ${a - 28} ${c - 4.4} ${a - 26.2} ${c - 6.6}"/>
		<path class="sc" d="M${a} ${c + 1}C${a - 4} ${c + 12.5} ${a - 26} ${c + 15} ${a - 29.5} ${c + 9.6}C${a - 31.2} ${c + 6.4} ${a - 28} ${c + 4.4} ${a - 26.2} ${c + 6.6}"/>
		<path class="sc t" d="M${b2} ${c - .8}C${b2 - 3} ${c - 8} ${b2 - 11.5} ${c - 9.2} ${b2 - 13.5} ${c - 5.4}C${b2 - 14.6} ${c - 3.4} ${b2 - 12.4} ${c - 2.2} ${b2 - 11.3} ${c - 3.6}"/>
		<path class="sc t" d="M${b2} ${c + .8}C${b2 - 3} ${c + 8} ${b2 - 11.5} ${c + 9.2} ${b2 - 13.5} ${c + 5.4}C${b2 - 14.6} ${c + 3.4} ${b2 - 12.4} ${c + 2.2} ${b2 - 11.3} ${c + 3.6}"/>
		<path class="sd" d="M20 ${c - 2.4} 22.4 ${c} 20 ${c + 2.4} 17.6 ${c}Z"/>
		<circle class="sd" cx="2.4" cy="${c}" r="1.7"/>`;
	return svg(m, W, H);
};

/**
 * A class's name as a heading, flanked by its scrollwork.
 * size: 'full' | 'compact' | 'auto' (full, compact in a narrow container). tag: the heading element.
 */
GPS.classTitle = (cls, text, opts = {}) => {
	const size = opts.size || 'auto';
	const half = side => h('span.pfs-sw.' + side, { 'aria-hidden': 'true' },
		size !== 'compact' ? h('span.f', GPS.scrollHalf(cls, 'full')) : null,
		size !== 'full' ? h('span.c', GPS.scrollHalf(cls, 'compact')) : null);
	return h((opts.tag || 'div') + '.pfs-ct.is-' + size + (opts.cls ? '.' + opts.cls : ''), { title: opts.title },
		half('l'), h('span.pfs-ct-t', text || cls), half('r'));
};

/* Its homes: the level-up dialog's heading and a class page in the compendium */
GPS.levelUp = () => h('div.pfs-lu.g-pf',
	GPS.classTitle('Druid', 'Druid', { tag: 'h3', size: 'compact' }),
	h('div.pfs-lu-sub', 'Level 2 · Wren Halloway'),
	h('div.pfs-lu-row', h('b', 'Hit points'), h('span', '+9 (8 + Con 1)')),
	h('div.pfs-lu-row', h('b', 'Class feat'), h('span', 'Choose one')),
	h('div.pfs-lu-row', h('b', 'Skill feat'), h('span', 'Choose one')),
	h('div.pfs-lu-row', h('b', 'Spell slots'), h('span', '1st rank: 3')),
	clusters(cluster([btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ kind: 'primary', icon: 'arrow-right', text: 'Next: class feat' })], { end: true })));
GPS.classPage = () => h('div.pfs-cp.g-pf',
	GPS.classTitle('Druid', 'Druid', { tag: 'h2' }),
	h('div.pfs-cp-sub', h('span', h('b', 'Key attribute'), 'Wisdom'), h('span', h('b', 'Hit points'), '8 + Con'), h('span', h('b', 'Perception'), 'Trained')),
	GP.tags([{ name: 'Primal', cls: 'x' }, { name: 'Spellcaster', cls: 'x' }]),
	h('p', 'The sample class page: a class name is a heading, so it gets its scrollwork; every other heading on the page stays plain.'));

/** The design-system gallery: every class at full size, then the compact form, then where it lives. */
GPS.gallery = () => h('div.g-pf', { style: { background: 'var(--g-bg)', color: 'var(--g-text)', borderRadius: '12px', padding: '20px', border: '1px solid var(--p-line)' } },
	h('div.pfs-gal', PF_CLASSES.map(c => h('div.pfs-gal-t', GPS.classTitle(c, c, { size: 'full' }), GPS.classTitle(c, c, { size: 'compact' }), h('small', 'Laptop, then phone')))),
	h('div.pfs-gal-ctx',
		h('div', GPS.levelUp(), h('small', 'Level-up dialog: the compact form, so the title never crowds')),
		h('div', GPS.classPage(), h('small', 'A class page in the compendium'))));

/* The sheet: the class leaves the banner (which keeps the level medallion) for its own scrolled line under it */
GPS.sheet = (orig => (state, opts = {}) => {
	const el = orig(state, opts);
	const cls = el.querySelector('.pfs-cls > span:first-child');
	if (cls) cls.remove();
	const ban = el.querySelector('.pfs-ban');
	if (ban) ban.after(GPS.classTitle('Druid', 'Druid', { cls: 'pfs-classline', size: opts.phone ? 'compact' : 'auto' }));
	return el;
})(GPS.sheet);

/* The gallery on PF2e's design-system page */
gamePage = (orig => def => {
	const p = orig(def);
	if (def.id === 'pf') add(p, [
		h('h2.sec', 'Class scrollwork'),
		h('p.kicker', 'Every class name that is a heading gets the same ornament either side, the way a quest title is flanked in Skyrim: a gold stud, a rule, a crimson lozenge with the class’s own motif, paired C-scrolls on a tapering stem. One build, sixteen motifs, all drawn for this study: no Paizo class icons, nothing traced. The right half is the left mirrored. Gold is --pf-gold, the lozenge --pf-rib, the motif --pfs-motif; it follows the theme. On a phone the compact form keeps one scroll pair, so the title keeps its room.'),
		GPS.gallery(),
		h('h3.sub', 'Critique passes'),
		h('ul.prose', [
			'<b>Pass 1 (every class, laptop and phone, light):</b> motifs at 14px in a 26px lozenge were too small to tell apart, so the lozenge grew to 29px and the motif to 17px (13.5px on a phone). The bow-and-arrow Ranger and the swept-hilt Swashbuckler blurred into crosses; Ranger is now one bold arrow, Swashbuckler a thin blade in a cup guard, so neither is confused with Fighter’s broadsword. The pale gold sat at about 2:1 on light parchment; the scrolls now draw in a deeper gilt (#A47B2A) in light and the brighter gold in dark. Gallery tiles were too narrow for Investigator and Swashbuckler at full size, so they widened to 480px.',
			'<b>Pass 2 (alignment and context, light and dark):</b> each half is measured against the title’s capitals, not the font box: 68 halves on this page and 12 on the sheet, all within 0.65px. The class page’s Marcellus title set its capitals higher than Barlow, 1.6px off, so its scrolls skip the Barlow offset. On the sheet the class left the banner (which keeps the level medallion) for its own scrolled line; on a phone the compact form keeps one scroll pair and the title never truncates.',
		].map(t => h('li', htmlSpan(t))))]);
	return p;
})(gamePage);
