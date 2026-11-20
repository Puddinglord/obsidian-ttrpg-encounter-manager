/* ============================================================================
   PF2e and Call of Cthulhu: the shared pattern, lighter. Marks and acted rows
   in the sidebar; a laptop main tab with the turn ribbon.
   ========================================================================== */
function orderRibbon(enc, opts = {}) {
	const act = enc.turn.acted || [];
	const all = ordered(enc).filter(c => !isOut(c));
	return h('div.rib', all.map(c => {
		const now = c.id === enc.turn.activeId, acted = act.includes(c.id);
		return h('div.rib-i' + (now ? '.now' : '') + (acted ? '.acted' : ''),
			h('span.o', h('span', opts.order ? opts.order(c) : String(c.order.value)), acted ? icon('check', 12, 2.6) : now ? h('span', { style: { color: 'var(--g-accent-text)' } }, 'Now') : opts.extra ? opts.extra(c) : null),
			h('b', c.name), bar({ value: Math.max(0, c.hp.value), max: c.hp.max }));
	}), h('div.rib-sep', h('span', `Round ${enc.turn.round + 1}`)));
}

/* PF2e */
GP.flow = (name) => {
	const enc = clone(FIGHT_PF);
	if (name === 'start') { enc.turn.round = 4; enc.turn.activeId = 'valka'; enc.turn.acted = []; }
	if (name === 'mid') { enc.turn.activeId = 'acolyte'; enc.turn.acted = ['valka', 'champ', 'rook', 'sela']; }
	const r = GP.view(enc, 'mid');
	return r;
};
GP.main = () => {
	const enc = clone(FIGHT_PF);
	const step = (t, i, done) => h('div.xp-step' + (done ? '.done' : ''), h('span.n', String(i + 1)), h('span', t));
	const steps = h('div.xp-steps',
		GP.rib(h('span', 'End of the champion’s turn'), null),
		h('div.xp-steps-l', [['Sustain: nothing sustained', 1], ['Persistent damage: none', 1], [h('span', h('span.xp-tag', h('span', 'Frightened'), h('b', '1')), ' → 0, by itself'), 0], ['Reactions: Rook’s comes back at the start of his turn', 0]].map(([t, d], i) => step(t, i, d))),
		GP.rib(h('span', 'Start of Rook’s turn'), null),
		h('div.xp-steps-l', ['Durations he created drop by 1', h('span', 'Regains ', h('span.xp-glyph', GP.glyph(3, 12)), ' and ', h('span.xp-glyph', GP.glyph('reaction', 12)))].map((t, i) => step(t, i, 0))));
	return [GP.head(enc),
		mtLayout('k2r', [h('div.xp-mt-col', GP.stage(enc)), h('div', steps)]),
		h('div.mt-foot', h('span.keys', h('span', h('kbd', 'N'), 'next'), h('span', h('kbd', 'R'), 'log a reaction'), h('span', h('kbd', 'Z'), 'undo')), btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Next: Rook' }))];
};

/* Call of Cthulhu */
GC.main = () => {
	const enc = clone(FIGHT_COC);
	const head = GC.head(enc);
	const side = h('div.xc-side',
		GC.band('The ghoul attacks Jonah', null, '.xc-side-b'),
		h('div.xc-side-in',
			h('p.xc-note', { style: { margin: '0 0 8px' } }, 'Jonah responds: Dodge or Fight Back. He has already dodged once this round, so the ghoul’s claws get a bonus die.'),
			h('div.xc-def', h('span', 'Dodge'), GC.cbox(35)), h('div.xc-def', h('span', 'Fighting (Brawl)'), GC.cbox(25)),
			h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } }, btn({ size: 'sm', text: 'Dodge' }), btn({ size: 'sm', text: 'Fight back' }), btn({ size: 'sm', kind: 'quiet', text: 'No response' }))),
		GC.band('End of round 2', null, '.xc-side-b'),
		h('div.xc-side-in',
			h('div.xc-def', h('span', h('b', 'Amos'), ', dying: CON roll'), GC.cbox(55)),
			h('div.xc-def', h('span', 'Harriet’s gun is drawn: DEX 110 next round'), h('span'))));
	return [head[0], orderRibbon(enc, { order: c => String(c.order.value), extra: c => c.order.readied ? icon('gun', 12) : null }),
		mtLayout('k2r', [h('div.xc-mt-col', head[1], GC.stage(enc)), h('div', side)]),
		h('div.mt-foot', h('span.keys', h('span', h('kbd', 'N'), 'next'), h('span', h('kbd', 'Z'), 'undo')), btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Next: Prof. Amos Wray' }))];
};

Object.assign(DEFS.pf, {
	flowIntro: 'The card and the queue, the one layout every game shares: the acting creature’s card on top, dressed like the sheet (its banner, the crimson AC shield, saves as capped plates, the linked diamonds, its trait bar); under it the queue in strict initiative order, split into still to act and acted. Tap anyone to make them active; Next closes this turn and opens the next.',
	flowNotes: ['The same marks as every game: a ring for still to act, the accent ring for next, a check for acted.', 'Delay takes a row out of the order into a "Delayed" tray; Return puts it back after any turn. Knocked out moves a hero before the current turn.', 'Turn boundaries run in the book’s order (persistent damage, flat check, frightened −1) in one prompt.'],
	flow: [
		{ cap: 'Start of round 4', sub: 'Everyone has a ring; Valka opens first.', render: () => GP.flow('start') },
		{ cap: 'Mid-round', sub: 'Four have acted, the acolyte is open, the zombie is next.', render: () => GP.flow('mid'), rec: true },
	],
	mainIntro: 'Laptop: the turn ribbon with reaction marks, the list with the open row, and the turn-boundary steps beside it.',
	main: [{ device: 'laptop', cap: 'Laptop main tab', sub: 'The steps column is what PF2e modules keep adding: the book’s order, shown once per boundary.', render: () => GP.main(), side: () => glance({ round: 'Round 3', kicker: 'Now', name: 'Skeletal champion', hp: 25, max: 40, rows: [{ sec: 'Still to act' }, { name: 'Rook', em: '18', next: true }, { name: 'Sela', em: 'Dying 2' }, { name: 'Cult acolyte', em: '12' }, { name: 'Zombie A', em: '9' }, { name: 'Pell', em: '7' }, { sec: 'Acted' }, { name: 'Valka', em: '23', acted: true }] }) }],
});
Object.assign(DEFS.coc, {
	flowIntro: 'The card and the queue: the acting combatant’s card on top, framed like the sheet with a brass hairline; under it the form in strict DEX order, split into still to act (the end of the round ruled in at the bottom) and acted. Tap anyone to make them active (holding is allowed); Next moves down the form.',
	flowNotes: ['Defending happens inside the attacker’s turn: Dodge or Fight Back for the target, with the Outnumbered bonus die noted once they’ve already responded this round.', 'A drawn gun re-sorts the next round, not this one.', 'The end of the round is a ruled line with its CON rolls and madness counts.'],
	flow: [{ cap: 'Round 2: the ghoul’s turn', sub: 'Three entries acted (checked, quiet); the ghoul is open; Amos is next.', render: () => GC.page(FIGHT_COC, 'mid'), rec: true }],
	mainIntro: 'Laptop: the page, with a ribbon of DEX slots above and the defender’s choice beside it.',
	main: [{ device: 'laptop', cap: 'Laptop main tab', sub: 'The right column is the per-attack pause: the target’s Dodge and Fighting as Regular | Hard | Extreme, then what the end of the round holds.', render: () => GC.main(), side: () => glance({ round: 'Round 2 · DEX order', kicker: 'Now', name: 'Ghoul', hp: 9, max: 13, rows: [{ sec: 'Still to act' }, { name: 'Prof. Amos Wray', em: 'Dying', next: true }, { sec: 'Acted' }, { name: 'Harriet Cole', em: '110', acted: true }, { name: 'Cultist with a shotgun', em: '100', acted: true }, { name: 'Jonah Pike', em: '70', acted: true }] }) }],
});
