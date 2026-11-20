/* ============================================================================
   5e renderers: concept A (card and queue), B (ribbon), C (ledger)
   The book's look: EB Garamond small caps, gold-leaf frames, oxblood rules.
   ========================================================================== */
const G5 = {};

/* The plugin would bundle OFL subsets of these two faces; the study loads them from Google Fonts. */
(() => {
	if (document.querySelector('link[data-ev-5e-fonts]')) return;
	const l = document.createElement('link');
	l.rel = 'stylesheet';
	l.setAttribute('data-ev-5e-fonts', '');
	l.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400;1,500;1,700;1,800&display=swap';
	document.head.append(l);
})();

/** The oxblood rule: a diamond, then a taper (the 2014 books' bar, thinned). */
G5.taper = () => {
	const s = svg('<path d="M0 0.6 L312 2.5 L0 4.4 Z" fill="currentColor"/>', 312, 5);
	s.setAttribute('preserveAspectRatio', 'none');
	return h('span.x5-rule', svg('<path d="M4.5 0 9 4.5 4.5 9 0 4.5Z" fill="currentColor"/><path d="M4.5 2.4 6.6 4.5 4.5 6.6 2.4 4.5Z" fill="var(--g-surface)"/>', 9, 9), s);
};
/** Initiative: a faceted gem with a gold rim. */
G5.lozenge = n => h('span.x5-init', { title: 'Initiative' },
	svg('<path class="rim" d="M1 16 9.5 1.5h31L49 16l-8.5 14.5h-31Z"/><path class="in" d="M4.6 16l7-11.6h26.8l7 11.6-7 11.6H11.6Z"/><path class="fac" d="M11.6 4.4 4.6 16M38.4 4.4 45.4 16"/>', 50, 32), h('b', String(n)));
/** Heater-shield path inside a w×h box, inset i. */
G5.shieldPath = (w, ht, i) => {
	const x0 = i, x1 = w - i, y0 = i, y1 = ht - i, W = x1 - x0, H = y1 - y0, cx = w / 2, r = W * 0.1;
	const f = n => n.toFixed(2);
	return `M${f(x0)} ${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}H${f(x1 - r)}Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}V${f(y0 + H * 0.46)}C${f(x1)} ${f(y0 + H * 0.78)} ${f(cx + W * 0.24)} ${f(y0 + H * 0.92)} ${f(cx)} ${f(y1)}C${f(cx - W * 0.24)} ${f(y0 + H * 0.92)} ${f(x0)} ${f(y0 + H * 0.78)} ${f(x0)} ${f(y0 + H * 0.46)}Z`;
};
/** AC: a gold-rimmed shield with a tinted chief, "AC" on the larger sizes. */
G5.shield = (n, size = 40, opts = {}) => {
	const w = size, ht = Math.round(size * (size >= 38 ? 1.2 : 1.16)), sm = size < 32;
	const rimW = sm ? 1.3 : size >= 52 ? 2.6 : 2;
	const face = G5.shieldPath(w, ht, rimW);
	const i2 = rimW + (sm ? 0 : 0.5);
	const bandH = ht * 0.25;
	const parts = [`<path class="rim" d="${G5.shieldPath(w, ht, 0.4)}"/>`, `<path class="face" d="${face}"/>`];
	if (!sm) {
		const r = (w - 2 * i2) * 0.1;
		parts.push(`<path class="band" d="M${i2} ${i2 + r}Q${i2} ${i2} ${i2 + r} ${i2}H${w - i2 - r}Q${w - i2} ${i2} ${w - i2} ${i2 + r}V${i2 + bandH}H${i2}Z"/>`);
		parts.push(`<path class="edge" d="${G5.shieldPath(w, ht, rimW + 2.2)}"/>`);
	}
	return h('span.x5-shield' + (sm ? '.is-sm' : ''), { style: { width: w + 'px', height: ht + 'px' }, title: 'Armor Class' },
		svg(parts.join(''), w, ht), !sm && size >= 38 && !opts.bare ? h('small', 'AC') : null, h('b', String(n)));
};
/** The round, as a medallion. */
G5.medal = (n, label = 'Round') => h('span.x5-medal', { title: `${label} ${n}` },
	svg('<circle class="rim" cx="20" cy="20" r="19"/><circle class="in" cx="20" cy="20" r="15.5"/><path d="M20 .2l1.6 1.6L20 3.4l-1.6-1.6z" fill="var(--x5-gold)"/>', 40, 40), h('small', label), h('b', String(n)));

G5.head = (enc, opts = {}) => {
	const c = byId(enc, enc.turn.activeId);
	return h('div.x5-headwrap', h('div.x5-head',
		h('div.x5-head-t', h('h1.x5-title', enc.name)),
		btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add a creature' }),
		btn({ icon: 'users', kind: 'quiet icon', size: 'sm', title: 'Party' }),
		btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
	opts.setup ? ticker({ round: 'Setting up', turn: '3 heroes, 5 monsters', cls: 'x5-tick' })
		: ticker({ round: enc.turn.round, turn: h('span.x5-round', `${c.name}’s turn`), note: h('span.x5-ed', enc.edition || '2024'), cls: 'x5-tick' }));
};

G5.hpBlock = c => {
	const low = c.hp.value > 0 && c.hp.value <= c.hp.max / 2;
	return h('div.x5-hp',
		h('div.x5-hp-num.ev-num', h('b', String(c.hp.value)), h('span', `/ ${c.hp.max}`),
			c.hp.temp ? h('em.temp', `+${c.hp.temp} temp`) : low ? h('em', 'Bloodied') : null),
		bar({ value: c.hp.value, max: c.hp.max, temp: c.hp.temp }));
};

/** The type line under a name, in the stat block's italic. */
G5.typeLine = c => ({ hag: 'Medium Fey, Neutral Evil · CR 5', boss: 'Small Fey (Goblinoid) · CR 1', gob1: 'Small Fey (Goblinoid) · CR ¼', gob2: 'Small Fey (Goblinoid) · CR ¼', gob3: 'Small Fey (Goblinoid) · CR ¼', ilse: 'Elf Wizard 5 · Evoker', corin: 'Human Cleric 5 · Life', mara: 'Halfling Rogue 5 · Thief' })[c.id] || c.meta;

G5.focus = (enc, c, opts = {}) => {
	const dying = c.hp.value <= 0 && c.kind === 'pc';
	return h('div.x5-focus' + (dying ? '.is-dying' : ''),
		h('div.x5-f-top',
			G5.lozenge(c.order.value),
			h('div.x5-f-name', h('h2', c.name), h('p', G5.typeLine(c))),
			btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'Stat block, remove, duplicate' })),
		G5.taper(),
		h('div.x5-vitals', G5.shield(c.ac, 46), G5.hpBlock(c)),
		dying ? h('div.x5-dying',
			h('div.x5-dying-head', h('span', 'Dying · death saves'), btn({ icon: 'dice', text: 'Roll', size: 'sm', kind: 'primary' })),
			h('div.x5-ds', h('span', 'Successes'), pips({ max: 3, on: c.death.ok, style: { '--pip-on': 'var(--g-ok)' } }), h('span', 'Failures'), pips({ max: 3, on: c.death.fail, style: { '--pip-on': 'var(--g-danger-text)' } }))) : null,
		c.legendary || c.resist ? h('div.x5-res',
			c.legendary ? h('div.x5-res-row', h('span', icon('crown', 14), 'Legendary actions'), pips({ max: c.legendary.max, on: c.legendary.left })) : null,
			c.resist ? h('div.x5-res-row', h('span', icon('shield', 14), 'Legendary resistance'), pips({ max: c.resist.max, on: c.resist.left })) : null) : null,
		(c.conds || []).length ? h('div.x5-f-chips', chips(c.conds)) : null,
		opts.noActs ? null : h('div.x5-acts', clusters(cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })], { joined: true }), cluster([btn({ icon: 'condition', kind: 'icon', title: 'Add condition' }), btn({ icon: 'statblock', kind: 'icon', title: 'Stat block' })], { fixed: true }))));
};

G5.row = (c, opts = {}) => {
	const low = c.hp.value > 0 && c.hp.value <= c.hp.max / 2, zero = c.hp.value <= 0;
	const cls = ['x5-row'];
	if (low) cls.push('is-low'); if (zero) cls.push('is-zero');
	if (opts.next) cls.push('is-next');
	if (opts.state) cls.push('is-' + opts.state);
	const sub = [];
	const acting = (c.conds || []).filter(x => x.trigger);
	for (const x of (c.conds || [])) sub.push(h('span' + (x.trigger ? '.acts' : ''), x.trigger ? icon(x.trigger === 'damage' ? 'flame' : 'save', 12) : null, x.name + (x.value ? ' ' + x.value : '') + (x.rounds ? ` · ${x.rounds} rd` : '')));
	if (zero && c.kind === 'pc') sub.unshift(h('span', { style: { color: 'var(--g-danger-text)', fontWeight: 600 } }, `Dying · ${c.death ? c.death.ok : 0}✓ ${c.death ? c.death.fail : 0}✗`));
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 16)) : null,
		h('span.i', String(c.order.value)),
		h('span.n', h('b', c.name, c.kind === 'pc' ? h('small', c.meta.split(' ')[0]) : null), sub.length ? h('span.sub', sub) : null),
		G5.shield(c.ac, 24),
		h('span.hp.ev-num', h('b', String(c.hp.value)), c.hp.temp ? h('small', ` +${c.hp.temp}`) : h('small', ` /${c.hp.max}`)));
};

G5.queue = (enc, opts = {}) => {
	const q = queue(enc);
	const out = [h('div.x5-qhead', h('b', 'Up next'), h('span', `${q.filter(e => e.c).length} to go`))];
	const list = h('div.x5-q');
	let first = true;
	for (const e of q) {
		if (e.round) list.append(h('div.x5-round-div', `Round ${e.round}`));
		else if (e.lair) list.append(h('div.x5-lair', h('span.i', '20'), h('span', icon('castle', 15), e.lair.name)));
		else { list.append(G5.row(e.c, { next: first, state: opts.states && opts.states[e.c.id] })); first = false; }
	}
	out.push(list);
	const dead = enc.combatants.filter(isOut);
	if (dead.length) out.push(h('div.x5-defeated', icon('chevron-right', 14), `${dead.length} defeated`));
	return out;
};

G5.foot = (enc, label) => {
	const n = nextUp(enc);
	return h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: label || `Next: ${n ? n.name : ''}` }));
};

/* ---- Concept A: the card and the queue (recommended) ---- */
G5.A = (enc, view = 'mid', kind = 'sidebar') => {
	enc = clone(enc);
	const c = byId(enc, enc.turn.activeId);
	if (view === 'setup') return G5.setup(enc);
	let overlay = null;
	if (view === 'dying' || view === 'prompt') {
		const corin = byId(enc, 'corin'); corin.hp.value = 0; corin.death = { ok: 1, fail: 1 }; corin.conds = [{ name: 'Unconscious' }];
	}
	if (view === 'dying') enc.turn.activeId = 'corin';
	if (view === 'prompt') enc.turn.activeId = 'boss';
	if (view === 'prompt') overlay = sheet('End of Goblin Boss’s turn', h('div',
		promptCard({ ic: 'dice', title: h('span', 'Goblin Boss, ', h('em', 'Paralyzed')), text: 'Hold Person, from Ilse. Wisdom save DC 15; a success ends it.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll the save (+1)' }), btn({ size: 'sm', icon: 'check', text: 'Passed' }), btn({ size: 'sm', icon: 'x', text: 'Failed' })] }),
		promptCard({ ic: 'heart-crack', title: h('span', 'Corin is ', h('em', 'dying')), text: 'Start of Corin’s turn: roll a death save. 1 success, 1 failure so far.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll death save' }), btn({ size: 'sm', text: 'Later' })] })));
	if (view === 'keypad') {
		const ilse = byId(enc, 'ilse');
		overlay = sheet('Ilse', hpPad({ who: h('span', h('b', '22'), ' / 31 HP → ', h('b', '10')), amount: '12', extra: quickActs('If Ilse says she casts Shield', [['Shield', '+5 AC \u00b7 spends her reaction']]), hint: 'Ilse is concentrating on Hold Person: Constitution save DC 10 after this.', go: btn({ kind: 'primary', text: 'Apply 12 damage' }) }));
	}
	if (view === 'picker') {
		overlay = sheet('Goblin B: add a condition', picker({ query: '', items: [
			{ name: 'Charmed', text: 'Can’t attack the charmer', icon: 'sparkle' },
			{ name: 'Frightened', text: 'Disadvantage while it can see the source; can’t move closer', icon: 'eye', on: true },
			{ name: 'Grappled', text: 'Speed 0', icon: 'hand' },
			{ name: 'Poisoned', text: 'Disadvantage on attacks and checks', icon: 'droplet' },
		], timing: [
			['Lasts', stepper('10 rounds')],
			['Counts down', segs(['Start', 'End'], 'End')],
			['On whose turn', segs(['Its own', 'Bog Hag'], 'Bog Hag')],
			['Each turn', h('b', 'Wisdom save DC 13 ends it')],
		] }));
	}
	const cur = byId(enc, enc.turn.activeId);
	const focus = G5.focus(enc, cur);
	const q = G5.queue(enc);
	const body = kind === 'wide' ? h('div.x5-wide', h('div', focus), h('div', q)) : [focus, q];
	return { children: [G5.head(enc), body], foot: G5.foot(enc), overlay };
};

G5.setup = enc => {
	const party = enc.combatants.filter(c => c.side === 'party');
	const foes = enc.combatants.filter(c => c.side === 'foe');
	const pin = (b, v, cls = '') => h('div.x5-iin', h('small', b), h('span.box' + cls, v));
	return {
		children: [
			G5.head(enc, { setup: true }),
			h('div.x5-setup-h', h('b', 'Party'), h('span', 'Players roll; type what they say')),
			h('div.x5-setup-group', party.map((c, i) => h('div.x5-irow', h('span', h('b', c.name), h('small', c.meta)), i === 0 ? pin('+3', '19') : i === 1 ? pin('+0', '', '.empty.focus') : pin('+4', '–', '.empty')))),
			h('div.x5-setup-h', h('b', 'Monsters'), btn({ icon: 'dice', text: 'Roll all', size: 'sm', kind: 'quiet' })),
			h('div.x5-setup-group',
				h('div.x5-irow', h('span', h('b', 'Bog Hag'), h('small', 'Legendary · CR 5 · lair at 20')), pin('+1', '17')),
				h('div.x5-irow', h('span', h('b', 'Goblin Boss'), h('small', 'CR 1')), pin('+2', '15')),
				h('div.x5-irow', h('span', h('b', 'Goblins ×3'), h('small', 'CR ¼ · one roll for the group')), pin('+2', '12'))),
			h('p.x5-setup-note', 'Ties go to the higher modifier; drag to settle the rest once the fight starts.'),
		],
		foot: h('div.ev-foot', btn({ icon: 'x', kind: 'icon', title: 'Cancel' }), btn({ icon: 'play', kind: 'primary', text: 'Start combat', sub: '· 2 to roll' })),
	};
};

/* ---- Concept B: the initiative ribbon ---- */
G5.B = enc => {
	enc = clone(enc);
	const list = ordered(enc).filter(c => !isOut(c));
	const i = list.findIndex(c => c.id === enc.turn.activeId);
	const rot = list.slice(i).concat(list.slice(0, i));
	const ring = (c, size) => {
		const r = size / 2 + 1.5, C = 2 * Math.PI * r, f = Math.max(0, c.hp.value / c.hp.max);
		const col = c.hp.value <= c.hp.max / 2 ? 'var(--g-track-low)' : 'var(--g-track)';
		return svg(`<circle cx="${size / 2 + 3}" cy="${size / 2 + 3}" r="${r}" fill="none" stroke="var(--g-track-empty)" stroke-width="3"/><circle cx="${size / 2 + 3}" cy="${size / 2 + 3}" r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 ${size / 2 + 3} ${size / 2 + 3})"/>`, size + 6, size + 6);
	};
	const toks = [];
	rot.forEach((c, k) => {
		if (k > 0 && list.indexOf(c) < list.indexOf(rot[k - 1])) toks.push(h('div.x5b-sep', h('span', 'R3')));
		const cur = k === 0;
		toks.push(h('div.x5b-tok' + (cur ? '.is-current' : '') + (c.side === 'party' ? '.is-party' : ''),
			h('div.disc', ring(c, cur ? 58 : 46), h('span.lab', c.name.split(' ').map(w => w[0]).join('').slice(0, 2))),
			h('span.nm', c.name.replace('Goblin ', 'Gob. '))));
	});
	const c = rot[0];
	return {
		children: [G5.head(enc), h('div.x5b-ribbon', toks),
			h('div.x5b-block',
				h('div.x5-f-top', h('div.x5-f-name', h('h2', c.name), h('p', c.meta)), btn({ icon: 'more', kind: 'quiet icon', size: 'sm' })),
				G5.taper(),
				h('div.x5b-tiles', h('div', h('small', 'AC'), h('b', String(c.ac))), h('div', h('small', 'HP'), h('b', `${c.hp.value}`)), h('div', h('small', 'Speed'), h('b', '30'))),
				h('div.x5-res.stack', h('div.x5-res-row', h('span', 'Legendary actions'), pips({ max: 3, on: 2 })), h('div.x5-res-row', h('span', 'Legendary resistance'), pips({ max: 3, on: 2 }))),
				h('div', { style: { marginTop: '12px' } },
					h('div.x5b-act', h('b', 'Claw.'), h('span.cost', '1 action'), '+6 to hit, 2d8 + 4 slashing.'),
					h('div.x5b-act', h('b', 'Mire.'), h('span.cost', '2 actions'), 'The ground within 20 ft becomes difficult terrain.'),
					h('div.x5b-act', h('b', 'Sink.'), h('span.cost', 'lair'), 'One creature makes a DC 14 Str save or is restrained.')))],
		foot: G5.foot(enc),
	};
};

/* ---- Concept C: the ledger ---- */
G5.C = enc => {
	enc = clone(enc);
	const rows = [h('div.x5c-r.h', h('span.i', 'Init'), h('span.n', 'Name'), h('span.a', 'AC'), h('span.p', 'HP'))];
	const list = ordered(enc);
	const gob = list.filter(c => c.name.startsWith('Goblin ') && c.id.startsWith('gob'));
	let gobDone = false;
	rows.push(h('div.x5c-r', h('span.i', '20'), h('span.n', { style: { color: 'var(--g-text-2)' } }, 'Lair action'), h('span.a', ''), h('span.p', '')));
	for (const c of list) {
		if (gob.includes(c)) {
			if (gobDone) continue; gobDone = true;
			rows.push(h('div.x5c-r.grp', h('span.i', '12'), h('span.n', 'Goblins', h('small', '2 of 3 up')), h('span.a', '15'), h('span.p', h('b', '9'), h('small', ' /14'))));
			for (const g of gob) rows.push(h('div.x5c-r.sub' + (isOut(g) ? '.out' : ''), h('span.i', ''), h('span.n', g.name.replace('Goblin ', ''), g.conds.length ? h('span.c', g.conds[0].name) : null), h('span.a', ''), h('span.p', h('b', String(g.hp.value)))));
			continue;
		}
		const cur = c.id === enc.turn.activeId, low = c.hp.value > 0 && c.hp.value <= c.hp.max / 2, zero = c.hp.value <= 0;
		rows.push(h('div.x5c-r' + (cur ? '.cur' : '') + (low ? '.low' : '') + (zero ? '.zero' : ''),
			h('span.i', String(c.order.value)),
			h('span.n', c.name, c.conds.length ? h('span.c', c.conds.map(x => x.name).join(', ')) : null),
			h('span.a', String(c.ac)),
			h('span.p', h('b', String(c.hp.value)), h('small', ` /${c.hp.max}`))));
	}
	return {
		children: [G5.head(enc), h('div.x5c-table', rows),
			h('div.x5c-detail', h('div.x5-res-row', h('span', 'Bog Hag · legendary actions'), pips({ max: 3, on: 2 })), h('div.x5-res-row', h('span', 'Legendary resistance'), pips({ max: 3, on: 2 })))],
		foot: G5.foot(enc),
	};
};

/* Component states, for the design-system section */
G5.states = () => {
	const base = clone(byId(FIGHT_5E, 'boss'));
	const low = clone(byId(FIGHT_5E, 'gob2'));
	const dying = clone(byId(FIGHT_5E, 'corin')); dying.hp.value = 0; dying.death = { ok: 1, fail: 2 }; dying.conds = [];
	const dead = clone(byId(FIGHT_5E, 'gob3'));
	const wrap = el => h('div.x5-q', { style: { padding: 0 } }, el);
	return [
		['Default', wrap(G5.row(base))],
		['Hover (touch: always shows the grip on long-press)', wrap(G5.row(base, { state: 'hovered' }))],
		['Up next', wrap(G5.row(low, { next: true }))],
		['Selected (quick look open)', wrap(G5.row(base, { state: 'selected' }))],
		['Dragging', wrap(h('div', G5.row(base, { state: 'dragging' }), h('div.ev-drop-line', { style: { marginTop: '6px' } })))],
		['Dying', wrap(G5.row(dying))],
		['Defeated', wrap(G5.row(dead, { state: 'out' }))],
		['Current turn (in the compact ledger)', wrap(G5.row(base, { state: 'current' }))],
	];
};
