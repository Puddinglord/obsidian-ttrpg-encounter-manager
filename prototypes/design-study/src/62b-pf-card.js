/* ============================================================================
   PF2e tracker as the card and the queue, in the new sheet's clothes: the
   current creature's card on top (its banner, the crimson AC shield, HP,
   saves as capped plates, the linked diamonds, its trait bar, clustered
   buttons), then the queue in strict initiative order, split into still to
   act and acted. The round sits in the shared ticker, dressed as a ribbon.
   ========================================================================== */
const PF_SAVES = { valka: ['+11', '+9', '+8'], champ: ['+6', '+7', '+4'], rook: ['+8', '+12', '+9'], sela: ['+7', '+8', '+11'], acolyte: ['+6', '+7', '+4'], zom1: ['+6', '+3', '+2'], zom2: ['+6', '+3', '+2'], pell: ['+10', '+7', '+9'] };

GP.head = (enc, sub) => {
	const cur = enc.combatants.find(c => c.id === enc.turn.activeId);
	return h('div.xp-hd',
		h('div.xp-head',
			h('div.xp-head-t', h('h1.xp-title', enc.name)),
			btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' })),
		sub ? ticker({ round: sub, cls: 'xp-tick' })
			: ticker({ round: enc.turn.round, turn: cur ? `${cur.name}’s turn` : '', note: h('span.xp-tick-th', 'Severe', GP.threat(4)), cls: 'xp-tick' }));
};

/** The card for whoever is acting. */
GP.card = (c, enc) => {
	const dying = (c.conds || []).find(x => x.name === 'Dying');
	const used = c.actions.used, left = 3 - used;
	const sv = PF_SAVES[c.id] || ['+6', '+7', '+4'];
	const head = h('div.xp-card-h',
		h('span.xp-card-i', { title: 'Initiative' }, h('b.ev-num', String(c.order.value))),
		h('span.xp-card-n', h('b', c.name), h('small', c.meta)),
		btn({ icon: 'statblock', kind: 'quiet icon', size: 'sm', title: c.side === 'party' ? 'Open the sheet' : 'Open the stat block' }));
	const def = h('div.xp-card-def',
		GPS.shield(c.ac, 52),
		h('div.xp-card-hp' + (c.hp.value <= 0 ? '.is-zero' : c.hp.value <= c.hp.max / 2 ? '.is-low' : ''),
			h('span.pfs-cap', 'Hit points'),
			h('span.v', h('b.ev-num', String(c.hp.value)), h('small.ev-num', `/${c.hp.max}`)),
			dying ? GPS.track('Dying', dying.value, 4) : bar({ value: c.hp.value, max: c.hp.max })),
		h('div.xp-card-sv', [['Fort', sv[0]], ['Ref', sv[1]], ['Will', sv[2]]].map(([k, v]) => h('button.xp-sv', { title: `Roll ${k}` }, h('span', k), h('b.ev-num', v)))));
	let body;
	if (dying) {
		body = h('div.xp-open', { style: { '--glyph-cut': 'var(--g-now)' } },
			h('p.xp-card-rule', h('b', 'Recovery check'), ` · flat DC ${10 + dying.value} (10 + dying ${dying.value})`),
			GP.tags([dying, { name: 'Wounded', value: 1, bad: true }, { name: 'Unconscious', bad: true }]),
			clusters(
				cluster([btn({ kind: 'primary', icon: 'dice', text: 'Roll d20' })]),
				cluster([GP.deg('Crit success', 'dying −2'), GP.deg('Success', 'dying −1')], { joined: true, label: 'Rolled at the table' }),
				cluster([GP.deg('Failure', 'dying +1'), GP.deg('Crit failure', 'dying +2')], { joined: true, label: 'Rolled at the table' })),
			clusters(cluster([btn({ text: 'Heal' }), btn({ icon: 'sparkle', text: 'Hero point' })])));
	} else {
		body = h('div.xp-open', { style: { '--glyph-cut': 'var(--g-now)' } },
			h('div.xp-turn', GP.acts(left, c.reaction, 18), h('span.lbl', h('b', `${left} action${left === 1 ? '' : 's'} left`), c.reaction ? ' · reaction ready' : ' · reaction used')),
			GP.tags(c.conds),
			clusters(
				cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })], { joined: true }),
				cluster([btn({ icon: 'condition', text: 'Condition' }), btn({ icon: 'hourglass', text: 'Delay' }), btn({ icon: 'statblock', text: 'Stat block' })], { joined: true })));
	}
	return h('div.xp-card' + (dying ? '.is-dying' : ''), GPS.corner('tl'), GPS.corner('tr'), head, def, body);
};
/** One degree of success, as a button the GM taps after a roll at the table. */
GP.deg = (t, sub) => h('button.ev-btn.xp-deg', h('span', t), h('small', sub));

/** The queue: still to act in initiative order, then acted. */
GP.queue = (enc) => {
	const act = enc.turn.acted || [];
	const all = ordered(enc).filter(c => !isOut(c) && c.id !== enc.turn.activeId);
	const toAct = all.filter(c => !act.includes(c.id));
	const acted = all.filter(c => act.includes(c.id));
	const out = [sec('Still to act', `${toAct.length} this round`), h('div.ev-sec-hint', 'Tap anyone to make them active')];
	out.push(toAct.length ? h('div.xp-list', toAct.map((c, i) => GP.row(c, { next: i === 0 }))) : h('div.xp-round-div', `Round ${enc.turn.round + 1} next`));
	if (acted.length) out.push(sec('Acted this round', String(acted.length), { acted: true }), h('div.xp-list', acted.map(c => GP.row(c, { acted: true }))));
	const dead = enc.combatants.filter(isOut);
	if (dead.length) out.push(h('div.xp-defeated', icon('chevron-right', 14), `${dead.length} defeated`));
	return out;
};
GP.stage = enc => {
	const cur = enc.combatants.find(c => c.id === enc.turn.activeId);
	return [cur ? GP.card(cur, enc) : null, ...GP.queue(enc)];
};
