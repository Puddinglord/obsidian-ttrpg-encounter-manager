/* ============================================================================
   Call of Cthulhu renderer: the investigator's form. Every number sits in a
   box; every characteristic and skill is the sheet's split box (Regular,
   then Half over Fifth); statuses are tick boxes; sections are the sheet's
   hatched bands. Printed parts in Crimson Pro, typed parts in Courier Prime.
   ========================================================================== */
const GC = {};
const third = v => [v, Math.floor(v / 2), Math.floor(v / 5)];
/** The sheet's characteristic box: Regular large, Half over Fifth beside it. */
GC.cbox = (v, opts = {}) => { const [a, b, c] = third(v); return h('span.xc-cb' + (opts.cls ? '.' + opts.cls : ''), { title: `Regular ${a} · Hard ${b} · Extreme ${c}` }, h('b', String(a)), h('span.hf', h('i', String(b)), h('i', String(c)))); };
GC.pill = v => GC.cbox(v);
/** A pool box: labelled cells, typed values (HP Max | Current, Sanity Start | Current | Insane). */
GC.box = (labels, values, cls = []) => h('span.xc-sbox', { style: { gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` } }, labels.map((l, i) => h('span', h('small', l), h('b' + (cls[i] ? '.' + cls[i] : ''), String(values[i])))));
/** A tick box with its label, ticked in the sheet's ink (oxblood for wounds). */
GC.tick = on => h('i.xc-tk' + (on ? '.on' : ''), on ? svg('<path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>', 12, 12) : null);
GC.check = (t, plain) => h('span.xc-box' + (plain ? '.plain' : ''), GC.tick(true), t);
/** The sheet's section band: hatched grey, an Art Nouveau title. */
GC.band = (title, right, cls = '') => h('div.xc-band' + cls, h('span.t', title), right ? h('span.r', right) : null);
/** A small labelled cell: the label in its own grey sub-box, the value typed. */
GC.cell = (label, value, opts = {}) => h('span.xc-cell' + (opts.cls ? '.' + opts.cls : ''), h('i', label), h('b' + (opts.tone ? '.' + opts.tone : ''), String(value)), opts.of ? h('small', opts.of) : null);

GC.head = (enc, sub) => [h('div.xc-head',
	h('div.xc-head-t', h('h1.xc-title', enc.name), h('div.xc-sub', sub || `Round ${enc.turn.round}, in DEX order`)),
	btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
GC.band(sub ? 'Before the fight' : `Round ${enc.turn.round}`, sub ? null : 'DEX order', '.xc-head-band')];

GC.dex = c => h('div.xc-dex' + (c.order.readied ? '.gun' : ''), h('i', c.order.readied ? 'DEX+50' : 'DEX'), h('b', String(c.order.value)), c.order.readied ? h('small', icon('gun', 11), String(c.order.dex)) : null);

GC.pools = c => {
	const hurt = c.hp.value < c.hp.max;
	return h('div.xc-pools',
		GC.cell('HP', c.hp.value, { of: `/${c.hp.max}`, tone: hurt ? 'hurt' : '' }),
		c.san ? GC.cell('SAN', c.san.value, { of: c.san.value < c.san.start ? `−${c.san.start - c.san.value}` : '', tone: 'san' }) : null,
		c.luck ? GC.cell('Luck', c.luck) : null,
		c.sanLoss ? GC.cell('San loss', c.sanLoss.toUpperCase(), { cls: 'wide' }) : null);
};

GC.statuses = c => {
	const s = (c.conds || []);
	if (!s.length) return null;
	return h('div.xc-status', s.map(x => GC.check(x.name, !x.bad)));
};

GC.entry = (c, opts = {}) => {
	const cls = ['xc-entry'];
	if (opts.current) cls.push('is-current');
	if (opts.acted) cls.push('is-acted');
	if (isOut(c)) cls.push('is-out');
	if (opts.state) cls.push('is-' + opts.state);
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 14)) : null,
		h('span.xc-mk', opts.current ? h('span.ev-mark.is-now', icon('play', 10, 2.6)) : mark(isOut(c) ? 'out' : opts.acted ? 'acted' : opts.next ? 'next' : '')),
		GC.dex(c),
		h('div.xc-body',
			h('div.xc-name', h('h3', c.name), c.meta ? h('span', c.meta) : null),
			isOut(c) ? h('div.xc-note', 'Unconscious, out of the fight') : [opts.current ? null : GC.pools(c), GC.statuses(c)],
			opts.current ? GC.open(c, opts) : null));
};

GC.open = (c, opts) => {
	if (c.status === 'dying') return h('div.xc-open',
		h('div.xc-slip', h('b', 'Dying.'), ' A CON roll at the end of every round, or he dies. Only First Aid stabilises him.'),
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, 'hurt'])),
		h('div.xc-attack', h('span', 'Constitution'), GC.cbox(55)),
		h('div.xc-acts', btn({ icon: 'bandage', text: 'First Aid' }), btn({ text: 'Heal' })));
	if (c.side === 'foe') return h('div.xc-open',
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, 'hurt']), c.sanLoss ? GC.box(['Sanity loss'], [c.sanLoss.toUpperCase()]) : null),
		h('div.xc-attack', h('span', 'Fighting'), GC.cbox(40), h('span.w', c.attacks + ' · ' + c.armor.toLowerCase())),
		h('div.xc-acts', btn({ text: 'Damage' }), btn({ icon: 'dice', text: 'Attack' }), btn({ icon: 'statblock', kind: 'icon', title: 'Notes' })));
	return h('div.xc-open',
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, c.hp.value < c.hp.max ? 'hurt' : null]), GC.box(['San start', 'Current'], [c.san.start, c.san.value], [null, 'san'])),
		h('div.xc-acts', btn({ text: 'Damage' }), btn({ icon: 'dice', text: 'Luck' }), btn({ icon: 'statblock', kind: 'icon', title: 'Sheet' })));
};

GC.page = (enc, view = 'mid') => {
	enc = clone(enc);
	if (view === 'setup') return GC.setup(enc);
	if (view === 'dying') enc.turn.activeId = 'amos';
	let overlay = null;
	if (view === 'prompt') overlay = sheet('The ghoul is seen', h('div',
		h('div.xc-slip', { style: { margin: '0 0 8px' } }, h('b', 'Sanity loss 0/1D6.'), ' First sight of a ghoul. Each investigator rolls against their current Sanity.'),
		h('div.xc-form', 
			h('div.xc-san', h('span', h('b', 'Harriet Cole'), h('small', 'rolled 31 against 52')), h('span.res.r-ok', 'Passed · loses 0')),
			h('div.xc-san', h('span', h('b', 'Prof. Amos Wray'), h('small', 'unconscious; doesn’t see it')), h('span.res', '—')),
			h('div.xc-san', h('span', h('b', 'Jonah Pike'), h('small', 'rolled 78 against 44')), h('span.res.r-bad', 'Failed · 1D6 → 5'),
				h('div.full', h('span', 'Five or more at once: an INT roll. If it passes, he understands what he saw, and goes temporarily insane.'), btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'INT 70' }))))));
	if (view === 'keypad') overlay = sheet('Harriet Cole', hpPad({ who: h('span', 'HP ', h('b', '9'), ' of 11 → ', h('b', '3')), amount: '6', modes: ['Damage', 'Impale', 'Heal'], hint: '6 is half her maximum or more: a major wound. She falls prone and makes a CON roll or falls unconscious.', go: btn({ kind: 'primary', text: 'Apply 6, major wound' }) }));
	if (view === 'picker') overlay = sheet('Jonah Pike', picker({ items: [
		{ name: 'Major wound', text: 'Prone; a CON roll or unconscious', icon: 'heart-crack' },
		{ name: 'Bout of madness', text: '1D10 rounds of the Keeper’s choosing', icon: 'moon', on: true },
		{ name: 'Diving for cover', text: 'Loses the next attack', icon: 'arrow-up' },
		{ name: 'Outnumbered', text: 'Attacks after the first get a bonus die', icon: 'users' },
	], timing: [['Lasts', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, btn({ icon: 'dice', size: 'sm', text: '1D10' }), stepper(6))], ['Counts down', h('b', 'End of each round')]] }));
	const n = queue(enc).find(e => e.c);
	return { children: [...GC.head(enc), ...GC.stage(enc), h('div.xc-foot-note', 'Fighting back and dodging are free; each investigator responds once a round before attacks get a bonus die.')], foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: `Next: ${n ? n.c.name : ''}` })), overlay };
};

GC.setup = enc => {
	const row = (c, gun, dex) => h('div.xc-entry', h('span.xc-mk'), GC.dex({ order: { value: dex + (gun ? 50 : 0), dex, readied: gun } }),
		h('div.xc-body', h('div.xc-name', h('h3', c.name), c.meta ? h('span', c.meta) : null), h('div.xc-toggle', h('span.xc-switch' + (gun ? '.on' : '')), icon('gun', 15), gun ? `Gun drawn: ${c.order.readied}` : 'Gun drawn')));
	const list = [['harriet', true, 60], ['cult1', true, 50], ['jonah', false, 70], ['ghoul', false, 65], ['cult2', false, 55], ['amos', false, 40]];
	list.sort((a, b) => (b[2] + (b[1] ? 50 : 0)) - (a[2] + (a[1] ? 50 : 0)));
	return {
		children: [...GC.head(enc, 'Before the first round'), h('div.xc-form', list.map(([id, gun, dex]) => row(byId(enc, id), gun, dex))),
			h('div.xc-foot-note', 'DEX sets the order. A gun already drawn fires at DEX + 50; drawing it this round costs the bonus.')],
		foot: h('div.ev-foot', btn({ icon: 'x', kind: 'icon', title: 'Cancel' }), btn({ icon: 'play', kind: 'primary', text: 'Begin the round' })),
	};
};

GC.states = () => {
	const j = clone(byId(FIGHT_COC, 'jonah'));
	const g = clone(byId(FIGHT_COC, 'cult1'));
	const a = clone(byId(FIGHT_COC, 'amos'));
	const o = clone(byId(FIGHT_COC, 'cult2'));
	const w = el => h('div.xc-form', { style: { margin: 0 } }, el);
	return [
		['Default (a drawn gun lifts it +50)', w(GC.entry(g))],
		['Hover', w(GC.entry(g, { state: 'hovered' }))],
		['Wounded: major wound, prone', w(GC.entry(j))],
		['Selected', w(GC.entry(g, { state: 'selected' }))],
		['Dragging (ties in DEX)', w(h('div', GC.entry(g, { state: 'dragging' }), h('div.ev-drop-line')))],
		['Dying', w(GC.entry(a))],
		['Out of the fight', w(GC.entry(o))],
		['Current (the entry opens)', w(GC.entry(byId(FIGHT_COC, 'ghoul'), { current: true }))],
	];
};
