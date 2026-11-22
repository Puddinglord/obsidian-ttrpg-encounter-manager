/* ============================================================================
   PF2e character sheet, redesigned: the pregen made live and dressed as the
   book. A parchment page in an ornamental frame; a crimson heraldic banner
   with gold edges for the name, class and level; a big crimson AC shield;
   T / E / M / L as the blank sheet's rank boxes everywhere a proficiency
   applies; our own action diamonds on every Strike, spell and feat; trait
   bars on their gold band; condensed caps for every label. Wren is ours.
   ========================================================================== */
const sgnP = n => n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
const PF_RANKS = ['T', 'E', 'M', 'L'];
const PF_RANK_NAME = { U: 'Untrained', T: 'Trained', E: 'Expert', M: 'Master', L: 'Legendary' };

/** The blank sheet's rank boxes: T E M L, filled up to the rank, in the rank's colour. */
GPS.teml = (r, opts = {}) => {
	const n = r === 'U' ? 0 : PF_RANKS.indexOf(r) + 1;
	return h('span.pfs-teml.r-' + r + (opts.sm ? '.sm' : ''), { title: PF_RANK_NAME[r] },
		PF_RANKS.map((k, i) => h('i' + (i < n ? '.on' : ''), k)));
};
/** Kept for the tracker and older calls: one rank letter. */
GPS.prof = r => GPS.teml(r, { sm: true });

/**
 * A ribbon end, drawn as a rolled scroll: the ribbon runs into a rolled cylinder (lit on its near
 * side, shadowed under), its tail turns back behind the roll and ends in a notch, the end of the
 * roll shows its curl, and a gold flourish springs from the top. Gold edges throughout. Our own
 * drawing: it evokes the pregens' heraldic scrolls without tracing them. side: 'l' | 'r' (mirrored).
 */
let pfsEndN = 0;
GPS.end = (side, ht = 30, u = 1) => {
	const H = ht, f = v => +v.toFixed(2), e = 3.5;
	const T = Math.ceil(H * 0.34) + 2, B = Math.ceil(H * 0.17) + 2, W = Math.ceil(29.5 * u);
	const id = 'pfse' + (++pfsEndN);
	const x = k => f(k * u), y = k => f(k * H);
	const cx = x(12), r = f(Math.min(3 * u, H * 0.12)), cy = f(H + y(0.06) - r - 1.2);
	const m = `<defs>
		<linearGradient id="${id}r" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color: var(--pf-rib-hi)"/><stop offset=".45" style="stop-color: var(--pf-rib)"/><stop offset="1" style="stop-color: var(--pfs-fold)"/></linearGradient>
		<linearGradient id="${id}s" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
		<linearGradient id="${id}t" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color: var(--pfs-fold)"/><stop offset="1" style="stop-color: var(--pf-rib)"/></linearGradient>
	</defs>
	<g transform="translate(0 ${T})">
		<path class="t" fill="url(#${id}t)" d="M${x(10)} ${y(0.2)} L${x(29)} ${y(0.12)} L${x(22.5)} ${y(0.6)} L${x(29)} ${y(1.16)} L${x(10)} ${y(1.1)} Z"/>
		<path class="te" d="M${x(16.5)} ${f(y(0.2) + e * 0.7)} L${x(26.2)} ${f(y(0.14) + e * 0.75)} M${x(16.5)} ${f(y(1.1) - e * 0.7)} L${x(26.2)} ${f(y(1.15) - e * 0.75)}"/>
		<rect class="b" x="0" y="0" width="${x(10)}" height="${H}"/>
		<path class="e" d="M0 ${e}H${x(10)}M0 ${f(H - e)}H${x(10)}"/>
		<rect fill="url(#${id}s)" x="${x(4)}" y="0" width="${x(4)}" height="${H}"/>
		<rect class="roll" fill="url(#${id}r)" x="${x(7.5)}" y="${y(-0.1)}" width="${x(9)}" height="${y(1.16)}" rx="${x(4.5)}"/>
		<path class="hl" d="M${x(9.8)} ${f(y(-0.02) + 2)} V${f(H * 0.62)}"/>
		<path class="c" d="M${cx} ${f(cy - r)} A${r} ${r} 0 1 1 ${f(cx - r)} ${cy} A${f(r * 0.62)} ${f(r * 0.62)} 0 0 1 ${f(cx + r * 0.22)} ${f(cy - r * 0.42)}"/>
		<path class="fl" d="M${x(13.6)} ${y(-0.09)} C${x(17)} ${y(-0.31)} ${x(25.5)} ${y(-0.31)} ${x(24.6)} ${y(-0.09)} C${x(24.1)} ${y(0.02)} ${x(21.2)} ${y(-0.01)} ${x(21.9)} ${y(-0.13)}"/>
		<path class="d" d="M${x(13.6)} ${f(y(-0.09) - 1.8)} l1.8 1.8 l-1.8 1.8 l-1.8 -1.8Z"/>
	</g>`;
	return h('span.pfs-end.' + side, { style: { width: W + 'px', height: H + 'px', '--t': T } }, svg(m, W, H + T + B));
};
/** A section ribbon: crimson, gold edges, notched ends, flared caps. */
GPS.rib = (title, right, cls = '') => h('div.pfs-rib' + cls, GPS.end('l'), h('div.pfs-rib-m', h('span.t', title), right ? h('span.r', right) : null), GPS.end('r'));

/** The big AC shield: crimson, a gold rim, AC in caps over the number. */
GPS.shield = (n, s = 88) => {
	const w = s, ht = Math.round(s * 1.14), c = w / 2;
	const outer = `M${c} 2 L${w - 3} ${ht * 0.13} V${ht * 0.46} C${w - 3} ${ht * 0.74} ${w * 0.74} ${ht * 0.9} ${c} ${ht - 2} C${w * 0.26} ${ht * 0.9} 3 ${ht * 0.74} 3 ${ht * 0.46} V${ht * 0.13}Z`;
	// The inner rim scales with the shield, and small shields (an NPC card, a row) leave it out: it only crowds them.
	const k = Math.max(5, s * 0.1), t = k + 1;
	const inner = `M${c} ${k} L${w - t} ${ht * 0.17} V${ht * 0.46} C${w - t} ${ht * 0.7} ${w * 0.71} ${ht * 0.84} ${c} ${ht - t} C${w * 0.29} ${ht * 0.84} ${t} ${ht * 0.7} ${t} ${ht * 0.46} V${ht * 0.17}Z`;
	return h('span.pfs-shield' + (s < 64 ? '.is-small' : ''), { style: { width: w + 'px', height: ht + 'px', '--s': s }, title: 'Armor Class' },
		svg(`<path class="o" d="${outer}"/>${s < 64 ? '' : `<path class="i" d="${inner}"/>`}`, w, ht),
		h('span.pfs-shield-in', h('small', 'AC'), h('b.ev-num', String(n))));
};

/** Dying and Wounded as the sheet's tracks: always there, filled when they apply. */
GPS.track = (label, v, max, doom = 0) => {
	let m = '';
	for (let i = 0; i < max; i++) {
		const x = 7 + i * 14, on = i < v, dm = i >= max - doom;
		m += on ? `<path d="${pfDia(x, 7, 6)}" fill="currentColor"/>` : `<path d="${pfDia(x, 7, 5.2)}" fill="none" stroke="currentColor" stroke-width="1.4" ${dm ? 'stroke-dasharray="2 1.6"' : ''}/>`;
	}
	return h('span.pfs-track' + (v ? '.on' : ''), { title: `${label} ${v} of ${max}` }, h('span.pfs-cap', label), svg(m, 14 + (max - 1) * 14, 14));
};

/** A defence plate: a crimson cap with its name, the modifier big, the rank boxes under it. Taps roll. */
GPS.plate = (label, v, r, sub) => h('button.pfs-plate', { title: `Roll ${label}` },
	h('span.pfs-plate-cap', label),
	h('b.ev-num', sgnP(v)),
	GPS.teml(r, { sm: true }),
	sub ? h('small', sub) : null);

/** An ability plaque: the pregen's maroon badge, the modifier in its notched white box. */
GPS.abil = (k, full, mod) => h('button.pfs-ab', { title: `Roll ${full}` },
	h('span.pfs-ab-k', h('b', k), h('small', full)),
	h('span.pfs-ab-v.ev-num', sgnP(mod)));

/** A Strike: the action, name, its trait bar, then the three attacks as one cluster and the damage beside. */
GPS.strike = (name, kind, traits, hit, map, dmg) => h('div.pfs-strike',
	h('span.pfs-glyph', GP.glyph(1, 15)),
	h('span.pfs-strike-n', h('b', name), h('small', kind)),
	GP.tags(traits.map(t => ({ name: t, cls: 'x' }))),
	h('span.pfs-map', { title: 'First, second and third attack this turn' },
		map.map((m, i) => h('button.pfs-map-b' + (i === 0 ? '.first' : ''), h('small', ['1st', '2nd', '3rd'][i]), h('b.ev-num', sgnP(hit + m))))),
	(() => { const [dice, t] = String(dmg).split(/\s+(?=[A-Za-z]+$)/); const ic = t ? dmgIcon(t, 15) : null; return h('button.pfs-dmg', { title: `Roll ${dmg} damage` }, h('b.ev-num', dice), ic ? h('span.sh-dmg-t', ic) : null); })());

/** A spell, feat or action, the way the book sets it: the name, then its glyph, then a note. */
GPS.glyphFor = g => g === null ? null : typeof g === 'string' && g.includes('-')
	? h('span.pfs-glyph.range', GP.glyph(Number(g[0]), 13), h('i', 'to'), GP.glyph(Number(g[2]), 13))
	: h('span.pfs-glyph', GP.glyph(g, 13));
GPS.act = (glyph, name, note) => h('button.pfs-act', { title: name },
	h('span.pfs-act-n', h('b', name), GPS.glyphFor(glyph)),
	note ? h('small', note) : null);

GPS.skill = (n, a, v, r) => h('button.pfs-sk' + (r === 'U' ? '.u' : ''), { title: `Roll ${n}` },
	GPS.teml(r, { sm: true }),
	h('span.pfs-sk-n', n, h('small', a)),
	h('b.pfs-sk-v.ev-num', sgnP(v)));

/** A corner ornament for the page frame: a gold lozenge with two scrolls. */
GPS.corner = pos => h('span.pfs-corner.' + pos, svg('<path class="s" d="M2 22 C2 10 10 2 22 2"/><path class="s" d="M7 22 C7 13 13 7 22 7"/><path class="d" d="M5 5 L9 1 L13 5 L9 9Z"/>', 24, 24));

GPS.sheet = (state = 'full', opts = {}) => {
	const dying = state === 'dying';
	const ph = !!opts.phone;
	return h('div.pfs' + (ph ? '.is-phone' : ''),
		['tl', 'tr', 'bl', 'br'].map(GPS.corner),
		/* The banner: portrait medallion, the name in flared caps, class and the level medallion */
		h('header.pfs-ban',
			h('span.pfs-medal', portrait('Wren Halloway', ph ? 54 : 74)),
			h('div.pfs-ban-m',
				h('h1', 'Wren Halloway'),
				h('span.pfs-cls', h('span', 'Druid'), h('span.pfs-lv', { title: 'Level 1' }, h('small', 'Level'), h('b', '1')))),
			GPS.end('r', ph ? 52 : 60, ph ? 1.35 : 1.55)),
		h('div.pfs-under',
			GP.tags([{ name: 'Small', cls: 'size' }, { name: 'Halfling', cls: 'x' }, { name: 'Humanoid', cls: 'x' }]),
			h('span.pfs-hero', h('span.pfs-cap', 'Hero points'), pips({ max: 3, on: 1, cls: 'pfs-pips' })),
			h('span.pfs-under-acts', btn({ icon: 'arrow-up', text: 'Level up', size: 'sm' }))),
		h('div.pfs-id', [['Ancestry', 'Halfling · gutsy'], ['Background', 'Nomad'], ['Size · Speed', 'Small · 25 feet'], ['Class DC', h('span.pfs-iv', h('b.ev-num', '17'), GPS.teml('T', { sm: true }))], ['Deity', 'Gozreh'], ['Languages', 'Common, Halfling, Druidic']].map(([k, v]) => h('div', h('span.pfs-cap', k), h('span.v', v)))),

		/* Defence: the shield, hit points, then saves and Perception as plates */
		h('div.pfs-def',
			h('div.pfs-ac',
				GPS.shield(16, ph ? 72 : 92),
				h('div.pfs-ac-x',
					h('span.pfs-cap', 'Armor class'),
					h('span.pfs-ac-raise', h('b.ev-num', '18'), ' with shield raised'),
					h('span.pfs-ac-sh', h('span.pfs-glyph', GP.glyph('reaction', 13)), 'Shield block · Hardness 3 · HP 12 · BT 6'),
					GPS.teml('T'))),
			h('div.pfs-hp' + (dying ? '.is-zero' : ''),
				h('div.pfs-hp-h', h('span.pfs-cap', 'Hit points'), h('span.pfs-res', h('span.pfs-cap', 'Resistances'), ' none')),
				meter({ value: dying ? 0 : 11, max: 15, label: 'Hit points' }),
				h('div.pfs-dw', GPS.track('Dying', dying ? 1 : 0, 4), GPS.track('Wounded', dying ? 1 : 0, 3), GPS.track('Doomed', 0, 3)))),
		dying ? h('div.pfs-dying', h('span.pfs-glyph', GP.glyph(1, 14)), h('span', h('b', 'Recovery check'), ' at the start of your turn: flat DC 11 (10 + dying 1).'), h('span.pfs-dying-acts', btn({ size: 'sm', kind: 'primary', icon: 'dice', text: 'Roll d20' }))) : null,
		h('div.pfs-plates',
			GPS.plate('Fortitude', 4, 'T', 'Con'), GPS.plate('Reflex', 5, 'T', 'Dex'), GPS.plate('Will', 9, 'E', 'Wis'),
			GPS.plate('Perception', 9, 'E', 'Wis · low-light vision')),

		/* Attributes: six maroon plaques */
		h('div.pfs-abil', [['Str', 'Strength', 0], ['Dex', 'Dexterity', 2], ['Con', 'Constitution', 1], ['Int', 'Intelligence', 0], ['Wis', 'Wisdom', 4], ['Cha', 'Charisma', 1]].map(([k, f, v]) => GPS.abil(k, f, v))),

		GPS.rib('Strikes', h('span', 'Multiple attack penalty')),
		h('div.pfs-strikes',
			GPS.strike('Sickle', 'Melee', ['Agile', 'Finesse', 'Trip'], 5, [0, -4, -8], '1d4 S'),
			GPS.strike('Sling', 'Ranged', ['Propulsive', 'Range 50 ft'], 5, [0, -5, -10], '1d6 B')),

		h('div.pfs-cols',
			h('div.pfs-col',
				GPS.rib('Skills', h('span.pfs-teml-key', PF_RANKS.map(r => h('i.r-' + r, r)))),
				h('div.pfs-skills', [['Nature', 'Wis', 7, 'T'], ['Medicine', 'Wis', 7, 'T'], ['Survival', 'Wis', 7, 'T'], ['Stealth', 'Dex', 5, 'T'], ['Diplomacy', 'Cha', 4, 'T'], ['Herbalism Lore', 'Int', 3, 'T'], ['Athletics', 'Str', 0, 'U'], ['Acrobatics', 'Dex', 2, 'U'], ['Arcana', 'Int', 0, 'U']].map(([n, a, v, r]) => GPS.skill(n, a, v, r)))),
			h('div.pfs-col',
				GPS.rib('Spells', h('span', 'Primal · DC 17 · attack +7')),
				h('div.pfs-slots',
					h('div', h('span.pfs-cap', 'Cantrips'), h('small', 'at will')),
					h('div', h('span.pfs-cap', '1st rank'), pips({ max: 2, on: 1, cls: 'pfs-pips' })),
					h('div', h('span.pfs-cap', 'Focus'), pips({ max: 1, on: 1, cls: 'pfs-pips' }))),
				h('div.pfs-acts',
					GPS.act(2, 'Produce flame', 'cantrip · fire'),
					GPS.act(2, 'Tangle vine', 'cantrip · plant'),
					GPS.act('1-3', 'Heal', '1st rank'),
					GPS.act(1, 'Goodberry', 'focus')),
				GPS.rib('Feats and abilities'),
				h('div.pfs-acts',
					GPS.act('reaction', 'Shield Block', 'general feat'),
					GPS.act(1, 'Wild Empathy', 'druid'),
					GPS.act(null, 'Natural Medicine', 'skill feat'),
					GPS.act(null, 'Gutsy halfling', 'heritage')))));
};
