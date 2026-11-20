/* ============================================================================
   Call of Cthulhu tracker as the card and the queue. The acting combatant's
   card on top, framed like the sheet; then the form in strict DEX order,
   split into still to act and acted, with the end of the round ruled in.
   Every cell sits in a column: the pools are a three-slot grid (HP, SAN,
   Luck), so the same figure is in the same place on every row.
   ========================================================================== */
GC.head = (enc, sub) => {
	const cur = enc.combatants.find(c => c.id === enc.turn.activeId);
	return [h('div.xc-head',
		h('div.xc-head-t', h('h1.xc-title', enc.name), sub ? h('div.xc-sub', sub) : null),
		btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
	sub ? ticker({ round: 'Before the fight', cls: 'xc-tick' })
		: ticker({ round: enc.turn.round, turn: cur ? `${cur.name}’s turn` : '', note: 'DEX order', cls: 'xc-tick' })];
};

/** The pools in fixed slots: HP | SAN | Luck. A creature's Sanity loss takes the last two. */
GC.pools = c => {
	const hurt = c.hp.value < c.hp.max;
	const slot = (label, value, opts = {}) => h('span.xc-slot' + (opts.wide ? '.wide' : ''), h('i', label), h('b' + (opts.tone ? '.' + opts.tone : '') + (opts.of ? '.of' : ''), h('span', String(value), opts.of ? h('small', opts.of) : null)));
	return h('div.xc-pools',
		slot('HP', c.hp.value, { of: `/${c.hp.max}`, tone: hurt ? 'hurt' : '' }),
		c.san ? slot('SAN', c.san.value, { tone: 'san' }) : null,
		c.luck ? slot('Luck', c.luck) : null,
		c.sanLoss ? slot('San loss', c.sanLoss.toUpperCase(), { wide: true }) : null);
};

/** The levels of success as one joined answer, for a roll made at the table. */
GC.levels = () => cluster(['Fail', 'Regular', 'Hard', 'Extreme'].map(t => btn({ text: t, cls: 'xc-lvl' })), { joined: true, label: 'Rolled at the table' });

GC.card = (c, enc) => {
	const dying = c.status === 'dying';
	let body;
	if (dying) body = h('div.xc-open',
		h('div.xc-slip', h('b', 'Dying.'), ' A CON roll at the end of every round, or he dies. Only First Aid stabilises him.'),
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, 'hurt'])),
		GC.statuses(c),
		h('div.xc-attack', h('span', 'Constitution'), GC.cbox(55)),
		clusters(cluster([btn({ icon: 'dice', text: 'Roll CON' })]), cluster([btn({ text: 'Passed' }), btn({ text: 'Failed' })], { joined: true, label: 'Rolled at the table' }), cluster([btn({ icon: 'bandage', text: 'First Aid' }), btn({ text: 'Heal' })])));
	else if (c.side === 'foe') body = h('div.xc-open',
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, c.hp.value < c.hp.max ? 'hurt' : null]), c.sanLoss ? GC.box(['Sanity loss'], [c.sanLoss.toUpperCase()]) : null),
		GC.statuses(c),
		h('div.xc-attack', h('span', 'Fighting'), GC.cbox(40), c.attacks ? h('span.w', c.attacks + ' · ' + String(c.armor).toLowerCase()) : null),
		clusters(cluster([btn({ icon: 'dice', text: 'Roll Fighting' })]), GC.levels(), cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })])));
	else body = h('div.xc-open',
		h('div.xc-boxes', GC.box(['HP max', 'Current'], [c.hp.max, c.hp.value], [null, c.hp.value < c.hp.max ? 'hurt' : null]), GC.box(['San start', 'Current'], [c.san.start, c.san.value], [null, 'san'])),
		GC.statuses(c),
		clusters(cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })]), cluster([btn({ icon: 'dice', text: `Spend Luck (${c.luck})` })])));
	return h('div.xc-card.is-current' + (dying ? '.is-dying' : ''),
		h('div.xc-card-h',
			GC.dex(c),
			h('div.xc-name', h('h3', c.name), c.meta ? h('span', c.meta) : null),
			btn({ icon: 'statblock', kind: 'quiet icon', size: 'sm', title: c.side === 'party' ? 'Open the sheet' : 'Open the entry' })),
		body);
};

/** The form under the card: still to act in DEX order, the end of the round, then acted. */
GC.queue = enc => {
	const act = enc.turn.acted || [];
	const all = ordered(enc).filter(c => !isOut(c) && c.id !== enc.turn.activeId);
	const toAct = all.filter(c => !act.includes(c.id));
	const acted = all.filter(c => act.includes(c.id));
	const dying = enc.combatants.filter(c => c.status === 'dying').map(c => c.name.split(' ').slice(-2, -1)[0] || c.name);
	const out = [sec('Still to act', `${toAct.length} this round`), h('div.ev-sec-hint', 'Tap anyone to make them active')];
	out.push(h('div.xc-form.xc-q',
		toAct.map((c, i) => GC.entry(c, { next: i === 0 })),
		h('div.xc-eor', icon('hourglass', 15), h('span', h('b', 'End of round'), dying.length ? ' · Amos, CON roll (dying)' : ' · bouts of madness count down'))));
	if (acted.length) out.push(sec('Acted this round', String(acted.length), { acted: true }), h('div.xc-form.xc-q', acted.map(c => GC.entry(c, { acted: true }))));
	const dead = enc.combatants.filter(isOut);
	if (dead.length) out.push(h('div.xc-defeated', icon('chevron-right', 14), `${dead.length} out of the fight`));
	return out;
};
GC.stage = enc => {
	const cur = enc.combatants.find(c => c.id === enc.turn.activeId);
	return [cur ? GC.card(cur, enc) : null, ...GC.queue(enc)];
};
