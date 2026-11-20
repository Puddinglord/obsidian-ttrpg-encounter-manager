/* ============================================================================
   5e flow: the shared pattern (active card, still to act / acted, tap anyone,
   Next), moments (lair 2014, legendary after a turn), groups, the main tab.
   ========================================================================== */
const ACT5 = {
	hag: [['Multiattack', 'Claw twice'], ['Claw', '+6 · 2d8 + 4'], ['Mire', 'DC 14 Str · 20 ft']],
	boss: [['Multiattack', 'Scimitar twice'], ['Scimitar', '+4 · 1d6 + 2'], ['Redirect attack', 'reaction']],
	gob: [['Scimitar', '+4 · 1d6 + 2'], ['Shortbow', '+4 · 1d6 + 2'], ['Nimble escape', 'bonus']],
	corin: [['Death save', 'd20'], ['Healing word', 'ally, bonus'], ['Spare the dying', 'ally']],
	ilse: [['Fire bolt', '+7 · 2d10'], ['Hold Person', 'concentrating'], ['Shield', 'reaction']],
	mara: [['Rapier', '+7 · 1d8 + 4'], ['Sneak attack', '3d6'], ['Uncanny dodge', 'reaction']],
};
const LEG5 = [['Claw', '1 use'], ['Mire', '2 uses'], ['Skip', '']];

G5.row = (c, opts = {}) => {
	const low = c.hp.value > 0 && c.hp.value <= c.hp.max / 2, zero = c.hp.value <= 0;
	const cls = ['x5-row'];
	if (low) cls.push('is-low'); if (zero) cls.push('is-zero');
	if (opts.next) cls.push('is-next');
	if (opts.acted) cls.push('is-acted');
	if (opts.state) cls.push('is-' + opts.state);
	const sub = [];
	for (const x of (c.conds || [])) sub.push(h('span' + (x.trigger ? '.acts' : ''), x.trigger ? icon(x.trigger === 'damage' ? 'flame' : 'save', 12) : null, x.name + (x.value ? ' ' + x.value : '') + (x.rounds ? ` · ${x.rounds} rd` : '')));
	if (zero && c.kind === 'pc') sub.unshift(h('span', { style: { color: 'var(--g-danger-text)', fontWeight: 600 } }, `Dying · ${c.death ? c.death.ok : 0}✓ ${c.death ? c.death.fail : 0}✗`));
	if (opts.members) sub.unshift(h('span', opts.members));
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 16)) : null,
		mark(isOut(c) ? 'out' : opts.acted ? 'acted' : opts.next ? 'next' : ''),
		h('span.i', String(c.order.value)),
		h('span.n', h('b', opts.label || c.name, c.kind === 'pc' && !opts.label ? h('small', c.meta.split(' ')[0]) : null), sub.length ? h('span.sub', sub) : null),
		G5.shield(c.ac, 24),
		h('span.hp.ev-num', opts.hpText ? h('b', opts.hpText) : [h('b', String(c.hp.value)), c.hp.temp ? h('small', ` +${c.hp.temp}`) : h('small', ` /${c.hp.max}`)]));
};

G5.lairRow = (acted, next) => h('div.x5-row.x5-moment' + (acted ? '.is-acted' : ''), mark(acted ? 'acted' : next ? 'next' : 'moment'), h('span.i', '20'), h('span.n', h('b', 'Lair action'), h('span.sub', h('span', 'The bog; loses ties'))), h('span'), h('span'));

/** The participants: still to act (in order), then acted. Goblins as one group with one initiative. */
G5.parts = (enc, opts = {}) => {
	const act = enc.turn.acted || [];
	const all = ordered(enc).filter(c => !isOut(c));
	const groupIds = opts.group ? ['gob1', 'gob2'] : [];
	const entries = [];
	for (const c of all) {
		if (groupIds.includes(c.id)) { if (c.id === groupIds[0]) entries.push({ group: true, c, ids: groupIds }); continue; }
		entries.push({ c, ids: [c.id] });
	}
	const isActed = e => e.ids.every(id => act.includes(id));
	const isActive = e => e.ids.includes(enc.turn.activeId);
	const toAct = entries.filter(e => !isActed(e) && !isActive(e));
	const acted = entries.filter(e => isActed(e) && !isActive(e));
	const lair = enc.edition === '2014';
	const lairDone = lair && (enc.turn.lairDone !== false) && enc.turn.activeId !== 'lair';
	const draw = (e, o) => e.group
		? G5.row(e.c, Object.assign({ label: 'Goblins', members: '2 of 3 up', hpText: '7 · 2' }, o))
		: G5.row(e.c, o);
	const out = [];
	out.push(sec('Still to act', `${toAct.length + (lair && !lairDone && enc.turn.activeId !== 'lair' ? 1 : 0)} this round`));
	out.push(h('div.ev-sec-hint', 'Tap anyone to make them active'));
	const q = h('div.x5-q');
	if (lair && !lairDone && enc.turn.activeId !== 'lair') q.append(G5.lairRow(false, true));
	toAct.forEach((e, i) => q.append(draw(e, { next: i === 0 && !(lair && !lairDone) })));
	if (!toAct.length) q.append(h('div.x5-round-div', `Round ${enc.turn.round + 1} next`));
	out.push(q);
	if (acted.length || lairDone) {
		out.push(sec('Acted this round', String(acted.length + (lairDone ? 1 : 0)), { acted: true }));
		const qa = h('div.x5-q');
		if (lairDone) qa.append(G5.lairRow(true));
		acted.forEach(e => qa.append(draw(e, { acted: true })));
		out.push(qa);
	}
	const dead = enc.combatants.filter(isOut);
	if (dead.length) out.push(h('div.x5-defeated', icon('chevron-right', 14), `${dead.length} defeated`));
	return { els: out, next: toAct[0] ? (toAct[0].group ? 'Goblins' : toAct[0].c.name) : `Round ${enc.turn.round + 1}` };
};
G5.queue = (enc, opts = {}) => G5.parts(enc, opts).els;
G5.foot = (enc, label) => {
	const p = G5.parts(enc);
	return h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: label || `Next: ${p.next}` }));
};

/** The lair action as the active card: a moment uses the same card as a creature. */
G5.lairCard = () => h('div.x5-focus',
	h('div.x5-f-top', G5.lozenge(20), h('div.x5-f-name', h('h2', 'Lair action'), h('p', 'The drowned chapel · the Bog Hag’s lair')), btn({ icon: 'more', kind: 'quiet icon', size: 'sm' })),
	G5.taper(),
	h('div.x5-lair-opts',
		h('div.x5-lo', h('b', 'Sink'), h('span', 'One creature: DC 14 Str save or restrained'), btn({ size: 'sm', text: 'Use' })),
		h('div.x5-lo', h('b', 'Fog'), h('span', 'Heavily obscured, 20 ft, until 20 next round'), btn({ size: 'sm', text: 'Use' })),
		h('div.x5-lo.used', h('b', 'Reach'), h('span', 'Used last round: can’t repeat'), h('span'))));

G5.actions = (c) => {
	const list = ACT5[c.id] || ACT5[c.id.startsWith('gob') ? 'gob' : 'gob'];
	return h('div.x5-actions', list.map(([n, d], i) => h('button.x5-act', h('kbd', String(i + 1)), h('b', n), h('span', d))));
};

/** The mid-round states for the flow section. */
G5.flow = (state, kind = 'sidebar') => {
	const enc = clone(FIGHT_5E);
	let strip = null, focus;
	if (state === 'start14') {
		enc.edition = '2014'; enc.turn.round = 3; enc.turn.acted = []; enc.turn.activeId = 'lair'; enc.turn.lairDone = false;
		enc.combatants.find(c => c.id === 'hag').legendary.left = 3;
		focus = G5.lairCard();
	} else if (state === 'mid') {
		enc.turn.activeId = 'boss'; enc.turn.acted = ['ilse', 'hag'];
	} else if (state === 'legendary') {
		enc.turn.activeId = 'corin'; enc.turn.acted = ['ilse', 'hag', 'boss'];
		strip = moment({ ic: 'crown', text: 'Bog Hag: a legendary action?', sub: 'After Goblin Boss’s turn · 2 of 3 uses left', acts: [btn({ size: 'sm', text: 'Claw' }), btn({ size: 'sm', text: 'Mire' }), btn({ size: 'sm', kind: 'quiet icon', icon: 'x', title: 'Not now' })] });
	} else if (state === 'tap') {
		enc.turn.activeId = 'mara'; enc.turn.acted = ['ilse', 'hag'];
	}
	const cur = byId(enc, enc.turn.activeId);
	if (!focus) focus = G5.focus(enc, cur);
	const head = h('div.x5-headwrap', h('div.x5-head',
		h('div.x5-head-t', h('h1.x5-title', enc.name)),
		btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
	ticker({ round: enc.turn.round, turn: h('span.x5-round', state === 'start14' ? 'Lair action' : `${cur.name}’s turn`), note: h('span.x5-ed', enc.edition), cls: 'x5-tick' }));
	const p = G5.parts(enc, { group: true });
	if (state === 'tap') p.els.splice(2, 0, h('div.x5-tapnote', icon('hand', 14), 'Mara was tapped out of order: she acts now; the Goblin Boss stays next.'));
	return { children: [head, focus, strip, p.els], foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: `Next: ${p.next}` })) };
};

/* ---------- The main tab ---------- */
G5.ribbon = (enc, opts = {}) => {
	const act = enc.turn.acted || [];
	const all = ordered(enc).filter(c => !isOut(c));
	const items = [];
	const ps = opts.ps;
	for (const c of all) {
		const now = c.id === enc.turn.activeId, acted = act.includes(c.id);
		const pc = c.side === 'party';
		items.push(h('div.rib-i' + (now ? '.now' : '') + (acted ? '.acted' : ''),
			h('span.o', h('span', String(c.order.value)), acted ? icon('check', 12, 2.6) : now ? h('span', { style: { color: 'var(--g-accent-text)' } }, 'Now') : null),
			h('b', c.name),
			ps && !pc ? h('span', { style: { font: '500 11.5px var(--g-font-ui)', color: 'var(--g-text-2)' } }, c.hp.value <= c.hp.max / 2 ? 'Bloodied' : 'Unhurt') : bar({ value: c.hp.value, max: c.hp.max, temp: c.hp.temp })));
	}
	return h('div.rib', enc.edition === '2014' ? h('div.rib-i.moment', h('span.o', '20', icon('castle', 12)), h('b', 'Lair')) : null, items, h('div.rib-sep', h('span', `Round ${enc.turn.round + 1}`)));
};

G5.main = (device, opts = {}) => {
	const enc = clone(FIGHT_5E);
	enc.turn.activeId = 'boss'; enc.turn.acted = ['ilse', 'hag'];
	const cur = byId(enc, 'boss');
	const p = G5.parts(enc, { group: true });
	const top = h('div.mt-top', G5.medal(enc.turn.round),
		h('div.ttl', h('h1.x5-title', { style: { fontSize: '24px', lineHeight: '28px' } }, enc.name), h('div.x5-round', h('span', 'Goblin Boss’s turn'), h('span.x5-ed', '2024'))),
		toggle('Player-safe', false),
		btn({ icon: 'plus', text: 'Add', size: 'sm' }), btn({ icon: 'more', kind: 'icon', size: 'sm', title: 'Encounter settings' }));
	const focus = h('div', { style: { padding: '14px 4px 0' } }, G5.focus(enc, cur), h('div.x5-actions-h', 'Actions', h('small', 'press 1–3')), G5.actions(cur),
		moment({ ic: 'crown', text: 'After this turn: Bog Hag may use a legendary action', sub: '2 of 3 uses left' }));
	const right = [h('div.mt-col-h', h('span', 'Log and prompts'), h('small', 'Z to undo')),
		h('div.x5-log',
			h('div', h('b', 'Bog Hag'), ' used Mire: Mara is restrained (DC 14 Str)'),
			h('div', h('b', 'Ilse'), ' cast Hold Person on the Goblin Boss'),
			h('div', h('b', 'Goblin C'), ' dropped: 9 fire from Ilse'),
			h('div.dim', 'Round 2 began'))];
	const list = [h('div', { style: { padding: '2px 6px 0' } }, p.els)];
	const cols = mtLayout('k3', [h('div', list), h('div', { style: { padding: '0 14px' } }, focus), h('div', right)]);
	return [top, G5.ribbon(enc), cols,
		h('div.mt-foot', h('span.keys', h('span', h('kbd', 'N'), 'next'), h('span', h('kbd', 'D'), 'damage'), h('span', h('kbd', 'J K'), 'select'), h('span', h('kbd', 'Z'), 'undo')),
			btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: `Next: ${p.next}` }))];
};

G5.glance = () => glance({ round: 'Round 2 · 2024', kicker: 'Now · Goblin Boss', name: 'Goblin Boss', hp: 15, max: 21,
	rows: [{ sec: 'Still to act', small: '3' }, { name: 'Corin', em: '14', next: true }, { name: 'Goblins', em: '12' }, { name: 'Mara', em: '8' }, { sec: 'Acted', small: '2' }, { name: 'Ilse', em: '19', acted: true }, { name: 'Bog Hag', em: '17', acted: true }] });

/** Player-safe: the same main tab with monster numbers as labels and no controls. */
G5.safe = () => {
	const enc = clone(FIGHT_5E);
	enc.turn.activeId = 'boss'; enc.turn.acted = ['ilse', 'hag'];
	const all = ordered(enc).filter(c => !isOut(c));
	const label = c => c.side === 'party' ? `${c.hp.value} / ${c.hp.max}` : c.hp.value <= 0 ? 'Down' : c.hp.value <= c.hp.max / 2 ? 'Bloodied' : 'Unhurt';
	const hpEl = c => c.side === 'party' ? h('span.x5-psn', label(c)) : h('span.ps-hp' + (label(c) === 'Bloodied' ? '.low' : ''), label(c));
	const now = byId(enc, 'boss'), deck = byId(enc, 'corin');
	return [h('div.mt-top', G5.medal(2), h('div.ttl', h('h1.x5-title', { style: { fontSize: '30px', lineHeight: '34px' } }, enc.name)), h('span.ps-badge', icon('eye', 14, 2.2), 'Player-safe')),
		h('div.ps.x5-ps-top',
			h('div.x5-ps-now', h('span.k', 'Now acting'), h('b', now.name), G5.taper(), h('div', hpEl(now), (now.conds || []).map(x => h('span.cs', x.name)))),
			h('div.x5-ps-deck', h('span.k', 'On deck'), h('b', deck.name), h('div', hpEl(deck), (deck.conds || []).map(x => h('span.cs', x.name))))),
		h('div.ps.x5-ps-order', all.map(c => {
			const isNow = c.id === enc.turn.activeId, acted = enc.turn.acted.includes(c.id);
			return h('div.x5-ps-c' + (isNow ? '.now' : '') + (acted ? '.is-acted' : ''), h('span.o', String(c.order.value), acted ? icon('check', 14, 2.6) : null), h('b', c.name), hpEl(c));
		}))];
};
