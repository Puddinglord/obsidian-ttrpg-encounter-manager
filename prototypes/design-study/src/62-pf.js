/* ============================================================================
   PF2e renderer: the Bestiary page. The turn opens in place as a stat-block
   heading; conditions are trait strips; actions are our own linked diamonds.
   ========================================================================== */
const GP = {};
/** One diamond, centred at (x, y), half-size r. */
const pfDia = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y}Z`;
/**
 * Our own action glyphs (not the publisher's font, not traced): linked diamonds that overlap,
 * a hollow diamond for a free action, a hooked arrow for a reaction.
 * kind: 1 | 2 | 3 | 'free' | 'reaction'. `spent` (array of booleans) draws used actions hollow.
 */
GP.glyph = (kind, s = 14, spent = []) => {
	if (kind === 'reaction') {
		const el = svg(`<path d="M${s * 0.2} ${s * 0.86} C${s * 0.12} ${s * 0.3} ${s * 0.86} ${s * 0.12} ${s * 0.86} ${s * 0.58}" fill="none" stroke="currentColor" stroke-width="${Math.max(1.6, s / 8)}" stroke-linecap="round"/><path d="M${s * 0.62} ${s * 0.46} L${s * 0.86} ${s * 0.74} L${s * 1.06} ${s * 0.44}" fill="none" stroke="currentColor" stroke-width="${Math.max(1.6, s / 8)}" stroke-linecap="round" stroke-linejoin="round"/>`, s + 2, s);
		return el;
	}
	const r = s / 2, n = kind === 'free' ? 1 : kind, step = r * 1.15, w = Math.round(r * 2 + step * (n - 1) + 2);
	let m = '';
	for (let i = 0; i < n; i++) {
		const x = r + 1 + i * step, hollow = kind === 'free' || spent[i];
		// each later diamond is cut from the one before by a stroke in the surface colour, so they read as linked
		m += `<path d="${pfDia(x, r + 1, r)}" style="stroke: var(--glyph-cut, var(--g-surface)); stroke-width: 2.4px; paint-order: stroke; fill: ${hollow ? 'var(--glyph-cut, var(--g-surface))' : 'currentColor'}"/>`;
		if (hollow) m += `<path d="${pfDia(x, r + 1, r - 1.3)}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
	}
	const el = svg(m, w, s + 2);
	return el;
};
/** Kept for the sheets: a single action mark. */
GP.diamond = (on, s = 12) => GP.glyph(on ? 1 : 'free', s);
GP.acts = (left, reaction, s = 12) => h('span.xp-acts', { title: `${left} actions left${reaction ? ', reaction ready' : ''}` },
	GP.glyph(3, s, [0, 1, 2].map(i => i >= left)),
	h('span.re' + (reaction ? '' : '.used'), GP.glyph('reaction', s)));
GP.tag = (c) => {
	const cls = c.cls ? '.' + c.cls : (!c.bad && !c.trigger && c.value === undefined ? '.plain' : '');
	return h('span.xp-tag' + cls, { title: c.note || c.name }, c.trigger ? icon('flame', 11, 2.4) : null, h('span', c.name), c.value !== undefined ? h('b', String(c.value)) : null);
};
GP.tags = list => list && list.length ? h('span.xp-tags', list.map(GP.tag)) : null;
GP.dying = (v, max = 4, doom = 0) => {
	let m = '';
	for (let i = 0; i < max; i++) {
		const x = 6 + i * 11, on = i < v, dm = i >= max - doom;
		m += on ? `<path d="${pfDia(x, 7, 5.5)}" fill="currentColor"/>` : `<path d="${pfDia(x, 7, 4.8)}" fill="none" stroke="currentColor" stroke-width="1.3" ${dm ? 'stroke-dasharray="1.5 1.5" opacity=".6"' : ''}/>`;
	}
	return h('span.xp-dying', { title: `Dying ${v} of ${max}` }, svg(m, 12 + (max - 1) * 11, 14));
};
GP.shield = (n, s = 26) => {
	const w = s, ht = Math.round(s * 1.1);
	return h('span.xp-shield', { style: { width: w + 'px', height: ht + 'px' }, title: 'Armor Class' },
		svg(`<path d="M${w / 2} 1 L${w - 1.5} ${ht * 0.17} V${ht * 0.48} C${w - 1.5} ${ht * 0.76} ${w * 0.72} ${ht * 0.9} ${w / 2} ${ht - 1} C${w * 0.28} ${ht * 0.9} 1.5 ${ht * 0.76} 1.5 ${ht * 0.48} V${ht * 0.17}Z"/>`, w, ht),
		h('b', String(n)));
};
GP.tline = (name, right) => h('div.xp-tline', h('span', name), right ? h('small', right) : null);
GP.rib = (left, right, cls = '') => h('div.xp-rib' + cls, left, right || null);
GP.threat = (n = 4) => h('span.xp-threat', [0, 1, 2, 3, 4].map(i => h('i' + (i < n ? '.on' : ''))));

GP.head = (enc, sub) => h('div.xp-hd',
	h('div.xp-head',
		h('div.xp-head-t', h('h1.xp-title', enc.name)),
		btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
	sub ? GP.rib(h('span.r', sub), null, '.xp-head-rib')
		: GP.rib(h('span.r', `Round ${enc.turn.round}`), h('span.r', 'Severe threat', GP.threat(4)), '.xp-head-rib'));

GP.row = (c, opts = {}) => {
	const cls = ['xp-row'];
	const low = c.hp.value > 0 && c.hp.value <= c.hp.max / 2, zero = c.hp.value <= 0;
	if (low) cls.push('is-low'); if (zero) cls.push('is-zero');
	if (opts.current) cls.push('is-current');
	if (isOut(c)) cls.push('is-out');
	if (opts.state) cls.push('is-' + opts.state);
	if (opts.acted) cls.push('is-acted');
	const dying = (c.conds || []).find(x => x.name === 'Dying');
	const tagsEl = isOut(c) ? null : GP.tags(c.conds);
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 14)) : null,
		opts.current ? h('span.ev-mark.is-now', icon('play', 10, 2.6)) : mark(isOut(c) ? 'out' : opts.acted ? 'acted' : opts.next ? 'next' : ''),
		h('span.i', String(c.order.value)),
		opts.current ? h('span.nm', GP.tline(c.name, c.meta))
			: h('span.nm', h('b', h('span', c.name), !isOut(c) && c.reaction ? h('span.rx', { title: 'Reaction ready' }, GP.glyph('reaction', 11)) : null), tagsEl),
		opts.current ? null : h('span.ac', GP.shield(c.ac)),
		opts.current ? null : h('span.hp', dying ? GP.dying(dying.value) : [h('b', String(c.hp.value)), h('small', `/${c.hp.max}`), bar({ value: c.hp.value, max: c.hp.max })]),
		opts.current ? GP.open(c, opts) : null);
};

GP.field = cells => h('div.xp-field', cells.map(([k, v]) => h('span', h('small', k), h('b', v))));

GP.open = (c, opts) => {
	const dying = (c.conds || []).find(x => x.name === 'Dying');
	if (dying) return h('div.xp-open', { style: { '--glyph-cut': 'var(--g-now)' } },
		h('div.xp-turn', h('span.lbl', h('b', 'Recovery check'), ' · flat DC 12 (10 + dying 2)'), h('span', { style: { marginLeft: 'auto' } }, btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll d20' }))),
		h('div.xp-degrees', h('span', 'Critical success', h('small', 'dying −2')), h('span', 'Success', h('small', 'dying −1')), h('span', 'Failure', h('small', 'dying +1')), h('span', 'Critical failure', h('small', 'dying +2'))),
		GP.tags([dying, { name: 'Wounded', value: 1, bad: true }, { name: 'Unconscious', bad: true }]),
		h('div.xp-btns', btn({ text: 'Heal' }), btn({ icon: 'sparkle', text: 'Hero point' }), btn({ icon: 'more', text: 'More' })));
	const used = c.actions.used;
	return h('div.xp-open', { style: { '--glyph-cut': 'var(--g-now)' } },
		h('div.xp-turn', GP.acts(3 - used, c.reaction, 18), h('span.lbl', h('b', `${3 - used} actions left`), c.reaction ? ' · reaction ready' : '')),
		GP.field([['AC', String(c.ac)], ['HP', `${c.hp.value}/${c.hp.max}`], ['Fort', '+6'], ['Ref', '+7'], ['Will', '+4']]),
		GP.tags(c.conds),
		h('div.xp-btns', btn({ text: 'Damage' }), btn({ icon: 'condition', text: 'Condition' }), btn({ icon: 'hourglass', text: 'Delay' })));
};

GP.list = (enc, opts = {}) => {
	const act = enc.turn.acted || [];
	let nextDone = false;
	return h('div.xp-list', ordered(enc).map(c => {
		const cur = c.id === enc.turn.activeId, acted = act.includes(c.id);
		const next = !cur && !acted && !isOut(c) && !nextDone && ordered(enc).findIndex(x => x.id === c.id) > ordered(enc).findIndex(x => x.id === enc.turn.activeId);
		if (next) nextDone = true;
		return GP.row(c, { current: cur, acted, next });
	}));
};

GP.view = (enc, view = 'mid', kind = 'sidebar') => {
	enc = clone(enc);
	if (view === 'setup') return GP.setup(enc);
	let overlay = null;
	if (view === 'dying') enc.turn.activeId = 'sela';
	if (view === 'prompt') {
		enc.turn.activeId = 'valka';
		overlay = sheet('End of Valka’s turn', h('div',
			promptCard({ ic: 'flame', title: h('span', 'Persistent fire ', h('em', '1d6')), text: 'Take the damage, then a DC 15 flat check to end it.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll 1d6, apply' }), btn({ size: 'sm', icon: 'dice', text: 'Roll flat check' }), btn({ size: 'sm', text: 'Passed' }), btn({ size: 'sm', text: 'Failed' })] }),
			promptCard({ ic: 'activity', title: h('span', 'Valka gets her reaction back'), text: 'Reactions refresh at the start of her next turn; nothing to do now.' })));
	}
	if (view === 'keypad') overlay = sheet('Skeletal champion', h('div',
		h('div.xp-dtypes', h('span', 'Slashing'), h('span.on', icon('sparkle', 13), 'Vitality · weak 5'), h('span', 'Cold · resist 5'), h('span', 'Other')),
		hpPad({ who: h('span', 'HP ', h('b', '25'), ' → ', h('b', '12'), ' · 8 + 5 weakness'), amount: '13', modes: ['Damage', 'Heal', 'Temp'], go: btn({ kind: 'primary', text: 'Apply 13' }) })));
	if (view === 'picker') overlay = sheet('Cult acolyte', picker({ items: [
		{ name: 'Clumsy', text: '−X to Dex-based checks and AC', icon: 'footprints' },
		{ name: 'Frightened', text: '−X to checks and DCs; drops 1 at the end of its turn', icon: 'eye', on: true },
		{ name: 'Off-guard', text: '−2 circumstance to AC', icon: 'shield' },
		{ name: 'Slowed', text: 'Loses X actions each turn', icon: 'hourglass' },
	], timing: [['Value', stepper(2)], ['Each turn', h('b', 'Goes down by 1 at its end')]] }));
	const body = kind === 'wide' ? GP.wide(enc) : GP.stage(enc);
	const n = nextUp(enc);
	return { children: [GP.head(enc), body, h('div', { style: { height: '12px' } })].flat(), foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: `Next: ${n ? n.name : ''}` })), overlay };
};

GP.wide = enc => h('div.xp-list.xp-wide',
	h('div.xp-row.h', h('span'), h('span.i', 'Init'), h('span', 'Name'), h('span.sv', 'AC'), h('span.sv', 'Fort'), h('span.sv', 'Ref'), h('span.sv', 'Will'), h('span', { style: { textAlign: 'right' } }, 'HP')),
	ordered(enc).map(c => {
		const cur = c.id === enc.turn.activeId;
		const r = GP.row(c, { current: cur });
		const ac = r.querySelector('.ac');
		if (ac) ac.replaceWith(h('span.sv', String(c.ac)), ...['+6', '+7', '+4'].map(v => h('span.sv', v)));
		return r;
	}));

GP.setup = enc => {
	const party = enc.combatants.filter(c => c.side === 'party');
	const foes = enc.combatants.filter(c => c.side === 'foe');
	const skillRow = (c, skill, v) => h('div.xp-row', h('span'), h('span.i', v ? String(v) : '–'), h('span.nm', h('b', h('span', c.name)), h('span.xp-skill', ['Perception', 'Stealth', 'Other'].map(s => h('span' + (s === skill ? '.on' : ''), s)))), h('span.ac', GP.shield(c.ac)), h('span.hp', h('b', String(c.hp.max))));
	return {
		children: [GP.head(enc, 'Setting up · 4 players, level 4'),
			h('div.xp-budget', h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, h('span.xp-cap', { style: { color: 'var(--g-text)', fontSize: '13px' } }, 'Severe'), h('span', { style: { color: 'var(--g-text-2)', font: '500 13px/16px var(--g-font-ui)' } }, '120 XP of a 160 budget')),
				h('div.lad', h('span.past', 'Trivial'), h('span.past', 'Low'), h('span.past', 'Moderate'), h('span.on', 'Severe'), h('span', 'Extreme'))),
			h('div.xp-label', h('b', 'Party'), h('span', { style: { textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--g-font-ui)', fontWeight: 500 } }, 'roll the skill they’re using')),
			h('div.xp-list', skillRow(party[0], 'Perception', 23), skillRow(party[1], 'Stealth', 18), skillRow(party[2], 'Perception', null), skillRow(party[3], 'Perception', 7)),
			h('div.xp-label', h('b', 'Creatures'), btn({ icon: 'dice', size: 'sm', kind: 'quiet', text: 'Roll Perception' })),
			h('div.xp-list', foes.filter(c => !isOut(c)).map(c => GP.row(Object.assign(clone(c), { conds: [] }))))],
		foot: h('div.ev-foot', btn({ icon: 'x', kind: 'icon', title: 'Cancel' }), btn({ icon: 'play', kind: 'primary', text: 'Start encounter', sub: '· 1 to roll' })),
	};
};

GP.states = () => {
	const a = clone(byId(FIGHT_PF, 'acolyte'));
	const z = clone(byId(FIGHT_PF, 'zom1'));
	const s = clone(byId(FIGHT_PF, 'sela'));
	const d = clone(byId(FIGHT_PF, 'zom2'));
	const p = clone(byId(FIGHT_PF, 'pell'));
	const w = el => h('div.xp-list', { style: { margin: 0 } }, el);
	return [
		['Default (reaction ready)', w(GP.row(a))],
		['Hover', w(GP.row(a, { state: 'hovered' }))],
		['Valued conditions', w(GP.row(p))],
		['Selected', w(GP.row(a, { state: 'selected' }))],
		['Dragging (Delay: drop to rejoin)', w(h('div', GP.row(a, { state: 'dragging' }), h('div.ev-drop-line')))],
		['Dying 2, Wounded 1', w(GP.row(s))],
		['Defeated', w(GP.row(d))],
		['Bloodied, slowed', w(GP.row(z))],
	];
};
