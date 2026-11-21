/* ============================================================================
   Nimble renderers: concept A (sides), B (board)
   ========================================================================== */
const GN = {};

/* Names are set in Vollkorn Black Italic, the nearest open face to the books' Beaufort Pro Heavy Italic.
   The plugin would bundle an OFL subset; the study loads it from Google Fonts. */
(() => {
	if (document.querySelector('link[data-ev-nimble-fonts]')) return;
	const l = document.createElement('link');
	l.rel = 'stylesheet';
	l.setAttribute('data-ev-nimble-fonts', '');
	l.href = 'https://fonts.googleapis.com/css2?family=Vollkorn:ital,wght@0,800;0,900;1,800;1,900&display=swap';
	document.head.append(l);
})();

/** HP's heart, filled, as the books draw it. */
GN.heartPath = 'M12 21.2s-7.6-4.6-9.7-9.3C.8 8.5 2.9 4.4 6.7 4.4c2.2 0 3.7 1.2 5.3 3 1.6-1.8 3.1-3 5.3-3 3.8 0 5.9 4.1 4.4 7.5-2.1 4.7-9.7 9.3-9.7 9.3Z';
GN.heart = (size = 16) => { const el = svg(`<path d="${GN.heartPath}" fill="currentColor"/>`, 24, 24, 'xn-heart'); el.setAttribute('width', size); el.setAttribute('height', size); return el; };

GN.acts = (max, left, lg) => h('span.xn-acts' + (lg ? '.lg' : ''), { title: `${left} of ${max} actions` },
	Array.from({ length: 3 }, (_, i) => h('i' + (i < left ? '.on' : i >= max ? '.lost' : ''))));

/** Wounds: five linked circles and a skull, as on the sheet. */
GN.wounds = (on, size = 1) => {
	const r = 4.5 * size, step = 13 * size, y = 7 * size;
	let m = `<line x1="${r + 1}" y1="${y}" x2="${r + 1 + step * 5}" y2="${y}" stroke="currentColor" stroke-width="${1.5 * size}"/>`;
	for (let i = 0; i < 5; i++) {
		const filled = i < on;
		m += `<circle cx="${r + 1 + i * step}" cy="${y}" r="${r}" fill="${filled ? 'var(--g-red)' : 'var(--g-surface)'}" stroke="${filled ? 'var(--g-red)' : 'currentColor'}" stroke-width="${1.5 * size}"/>`;
	}
	const sx = r + 1 + step * 5 - 6 * size, dead = on >= 6;
	m += `<g transform="translate(${sx} ${y - 6.5 * size}) scale(${0.54 * size})" fill="var(--g-surface)" stroke="${dead ? 'var(--g-red)' : 'currentColor'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICONS.skull}</g>`;
	return h('span.xn-wounds', { title: `${on} of 6 Wounds` }, svg(m, Math.ceil(r * 2 + 2 + step * 5 + 2), Math.ceil(14 * size)));
};

/** Armor: the books' filled shield with the letter (M, H) in it; an outline with a dash for none. */
GN.armorPath = 'M11 1.6c3.2 1.5 6.1 2.1 9.4 2.1v7.6c0 5.6-3.9 9.4-9.4 11.3-5.5-1.9-9.4-5.7-9.4-11.3V3.7c3.3 0 6.2-.6 9.4-2.1Z';
GN.armor = t => {
	const letter = t === 'medium' ? 'M' : t === 'heavy' ? 'H' : '–';
	return h('span.xn-armor.is-' + (t || 'none'), { title: t === 'none' || !t ? 'No armor' : t === 'medium' ? 'Medium armor' : 'Heavy armor' },
		svg(`<path d="${GN.armorPath}"/>`, 22, 24), h('b', letter));
};

GN.head = (enc, sub) => h('div.xn-head',
	h('div.xn-head-t', h('h1.xn-title', enc.name), h('div.xn-sub', sub || `Round ${enc.turn.round}`)),
	btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' }));

GN.sides = (enc, setup) => {
	const heroes = enc.combatants.filter(c => c.side === 'heroes');
	const done = enc.turn.done.length;
	return h('div.xn-sides',
		h('div.xn-side' + (enc.turn.side === 'heroes' && !setup ? '.on' : ''), h('span', 'Heroes'), h('small', setup ? `${heroes.length}` : `${done} of ${heroes.length} done`)),
		h('div.xn-side' + (enc.turn.side === 'monsters' && !setup ? '.on' : ''), h('span', 'Monsters'), h('small', setup ? '4 groups' : 'waiting')));
};

GN.hpLine = (c, big) => h('div.xn-hp-row',
	h('span.heart', GN.heart(big ? 20 : 15)),
	h('b', String(c.hp.value)), h('span', `/ ${c.hp.max}`),
	c.wounds ? h('span.w', 'Wounds', GN.wounds(c.wounds.on)) : null);

GN.focus = (c, opts = {}) => {
	const dying = c.status === 'dying';
	return h('div.xn-focus',
		h('div.xn-f-top',
			h('div.nm', h('h2', c.name), h('p', c.meta, h('span', '·'), `Defense ${c.armor}`)),
			h('div.acts', GN.acts(c.actions.max, c.actions.left, true), h('small', dying ? '1 action while Dying' : `${c.actions.left} actions left`))),
		h('div.xn-hp', GN.hpLine(c, true), bar({ value: c.hp.value, max: c.hp.max })),
		dying ? h('div.xn-dying', 'Dying: 2 Wounds of 6', h('span', 'Any hit adds 2 Wounds, 3 on a crit. Healing brings Wren back up.')) : null,
		h('div.xn-f-chips', h('div.ev-chips', (c.conds || []).filter(x => x.name !== 'Dying').map(x => chip(x)), h('span.ev-chip.is-add', icon('plus', 13), 'Condition'))),
		h('div.xn-f-btns', clusters(cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })], { joined: true }), cluster([btn({ icon: 'check', text: 'Done', cls: 'done' })], { fixed: true }))));
};

GN.row = (c, opts = {}) => {
	const cls = ['xn-row'];
	const hero = c.side === 'heroes';
	if (opts.done) cls.push('is-done');
	if (opts.state) cls.push('is-' + opts.state);
	if (c.hp && c.hp.value > 0 && c.hp.value <= c.hp.max / 2) cls.push('is-low');
	const conds = (c.conds || []).map(x => x.bad ? h('span.bad', x.name) : x.trigger ? h('span.acts-t', icon('flame', 12), `${x.name} ${x.value || ''}`) : h('span', x.name + (x.value ? ' ' + x.value : '') + (x.rounds ? ` · ${x.rounds} rd` : '')));
	let lead;
	if (hero) lead = h('span.tick', opts.done ? icon('check', 13, 3) : null);
	else lead = GN.armor(c.armorType);
	let right;
	if (c.group) right = h('span.hp', h('span.xn-minions', Array.from({ length: c.group.count }, (_, i) => h('i' + (i < c.group.alive ? '' : '.off')))));
	else right = h('span.hp', h('b', String(c.hp.value)), h('small', `/${c.hp.max}`), bar({ value: c.hp.value, max: c.hp.max }));
	const mid = hero ? GN.acts(c.actions.max, opts.done ? 0 : c.actions.left) : c.group ? h('span.lvl', `${c.group.alive} left`) : h('span.lvl', c.meta.replace('Level ', 'L').replace('Legendary · ', ''));
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 14)) : null,
		lead,
		h('span.nm', h('b', c.name), h('small', hero ? [c.meta] : [], conds.length ? conds : (hero ? null : c.kind === 'legendary' ? 'Bloodied at 48 · then Last Stand' : c.kind === 'minions' ? 'Die to any damage · d6 each' : null))),
		hero && c.wounds && c.wounds.on ? h('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' } }, mid) : mid,
		right);
};

GN.legendaryNote = (name, after) => h('div.xn-legend', icon('crown', 16), `${name} acts`, h('small', after));

/* ---- Concept A: sides (recommended) ---- */
GN.A = (enc, view = 'mid', kind = 'sidebar') => {
	enc = clone(enc);
	if (view === 'setup') return GN.setup(enc);
	let overlay = null;
	if (view === 'dying') { enc.turn.acting = 'wren'; enc.turn.done = ['tamsin', 'brakka']; }
	const acting = byId(enc, enc.turn.acting);
	if (view === 'prompt') {
		enc.turn.done = ['tamsin', 'brakka']; enc.turn.acting = null;
		overlay = sheet('Brakka is done', h('div',
			promptCard({ ic: 'crown', title: h('span', 'The Alchemist acts'), text: 'Legendary monsters act after each hero’s turn. Choose one:', acts: [btn({ size: 'sm', text: 'Spray', sub: '2d6' }), btn({ size: 'sm', text: 'Transmute' }), btn({ size: 'sm', text: 'Retreat' })] }),
			promptCard({ ic: 'flame', title: h('span', 'Brakka, ', h('em', 'Raging')), text: 'Ends unless Brakka attacked or took damage this turn.', acts: [btn({ size: 'sm', icon: 'check', text: 'Keep' }), btn({ size: 'sm', icon: 'x', text: 'End it' })] })));
	}
	if (view === 'keypad') overlay = sheet('The Alchemist', hpPad({ who: h('span', 'Medium armor: ', h('b', '15 − 10 = 5')), amount: '15', modes: ['Damage', 'Heal', 'Temp'], hint: 'A crit ignores armor. 5 brings it to 55: still above Bloodied (48).', go: btn({ kind: 'primary', text: 'Apply 5 damage' }) }));
	if (view === 'picker') overlay = sheet('Quicksilver Hound: add a condition', picker({ items: [
		{ name: 'Dazed', text: 'Can’t use reactions; 1 fewer action', icon: 'sparkle' },
		{ name: 'Smoldering', text: 'Takes X fire damage at the end of its turn', icon: 'flame', on: true },
		{ name: 'Taunted', text: 'Disadvantage against anyone else', icon: 'target' },
		{ name: 'Prone', text: 'Costs 1 action to stand', icon: 'footprints' },
	], timing: [['Value', stepper(2)], ['Lasts', segs(['Until removed', 'Rounds'], 'Until removed')], ['End of its turn', h('b', '2 fire damage')]] }));

	const heroes = enc.combatants.filter(c => c.side === 'heroes');
	const monsters = enc.combatants.filter(c => c.side === 'monsters');
	const toGo = heroes.filter(c => !enc.turn.done.includes(c.id) && c.id !== enc.turn.acting);
	const done = heroes.filter(c => enc.turn.done.includes(c.id));
	const heroesBlock = [
		acting ? GN.focus(acting) : null,
		toGo.length ? [h('div.xn-label', h('b', 'Still to act'), h('span', 'any order')), h('div.xn-list', toGo.map(c => GN.row(c)))] : null,
		done.length ? [h('div.xn-label', h('b', 'Done'), h('span', '')), h('div.xn-list', done.flatMap(c => [GN.row(c, { done: true }), GN.legendaryNote('The Alchemist', `after ${c.name}`)]))] : null,
	];
	const monstersBlock = [h('div.xn-label', h('b', 'Monsters'), h('span', 'their turn is next')), h('div.xn-list', monsters.map(c => GN.row(c)))];
	const body = kind === 'wide' ? h('div.xn-wide', h('div', heroesBlock), h('div', monstersBlock)) : [heroesBlock, monstersBlock];
	return {
		children: [GN.head(enc), GN.sides(enc), body, h('div', { style: { height: '14px' } })],
		foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Monsters’ turn' })),
		overlay,
	};
};

GN.setup = enc => {
	const heroes = enc.combatants.filter(c => c.side === 'heroes');
	const rolls = [14, 21, null, 7];
	return {
		children: [GN.head(enc, 'Setting up'), GN.sides(enc, true),
			h('div.xn-label', h('b', 'Initiative'), h('span', 'sets first-turn actions')),
			h('div.xn-list', heroes.map((c, i) => h('div.xn-row', h('span', icon('dice', 18)), h('span.nm', h('b', c.name), h('small', c.meta)),
				rolls[i] ? GN.acts(3, rolls[i] >= 20 ? 3 : rolls[i] >= 10 ? 2 : 1) : h('span.lvl', 'waiting'),
				h('span.xn-init', h('span.roll' + (rolls[i] ? '' : '.empty'), rolls[i] ? String(rolls[i]) : '–'))))),
			h('p.xn-note', '1–9: one action on the first turn. 10–19: two. 20 or a natural 20: all three. Everyone has three after that.'),
			h('div.xn-label', h('b', 'Monsters'), h('span', '5 rats, 3 others')),
			h('div.xn-list', enc.combatants.filter(c => c.side === 'monsters').map(c => GN.row(c)))],
		foot: h('div.ev-foot', btn({ icon: 'x', kind: 'icon', title: 'Cancel' }), btn({ icon: 'play', kind: 'primary', text: 'Heroes go first' })),
	};
};

/* ---- Concept B: the board ---- */
GN.B = enc => {
	enc = clone(enc);
	const heroes = enc.combatants.filter(c => c.side === 'heroes');
	const tile = c => {
		const done = enc.turn.done.includes(c.id), on = enc.turn.acting === c.id;
		return h('div.xnb-tile' + (on ? '.on' : '') + (done ? '.done' : ''),
			done ? h('span.ck', icon('check', 12, 3)) : null,
			h('h4', c.name), h('div.m', c.meta),
			h('div.hp', h('b', String(c.hp.value)), h('small', `/${c.hp.max}`), done ? null : GN.acts(c.actions.max, c.actions.left)),
			bar({ value: c.hp.value, max: c.hp.max }),
			h('div.ft', GN.wounds(c.wounds.on, 0.8), c.conds.length ? h('span', { style: { font: '600 12px var(--g-font-ui)', color: c.status === 'dying' ? 'var(--g-danger-text)' : 'var(--g-text-2)' } }, c.conds[0].name) : null));
	};
	const m = enc.combatants.filter(c => c.side === 'monsters');
	const alch = m[0];
	const mtile = c => h('div.xnb-tile.xnb-mon', h('h4', c.name), h('div.m', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, GN.armor(c.armorType), c.conds.length ? c.conds.map(x => x.name + (x.value ? ' ' + x.value : '')).join(', ') : c.meta),
		c.group ? h('div.hp', h('span.xn-minions', Array.from({ length: c.group.count }, (_, i) => h('i' + (i < c.group.alive ? '' : '.off'))))) : [h('div.hp', h('b', String(c.hp.value)), h('small', `/${c.hp.max}`)), bar({ value: c.hp.value, max: c.hp.max })]);
	return {
		children: [GN.head(enc), GN.sides(enc), h('div', { style: { height: '10px' } }),
			h('div.xnb-grid', heroes.map(tile)),
			h('div.xn-label', h('b', 'Monsters'), h('span', '')),
			h('div.xnb-grid',
				h('div.xnb-tile.xnb-mon.wide', h('h4', alch.name), h('div.m', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, GN.armor('medium'), 'Legendary · acts after each hero'),
					h('div.hp', h('b', '60'), h('small', '/96')), GN.phased(alch)),
				m.slice(1).map(mtile))],
		foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Monsters’ turn' })),
	};
};

GN.phased = c => {
	const b = bar({ value: c.hp.value, max: c.hp.max });
	const wrap = h('div.xn-phased', b, h('span.mark', { style: { left: (100 * c.bloodied / c.hp.max) + '%' } }));
	return h('div', wrap, h('div.xn-phase', h('span', 'Last Stand at 0: +7 HP per hero'), h('span', 'Bloodied at 48')));
};

GN.states = () => {
	const hero = clone(byId(FIGHT_NIMBLE, 'orren'));
	const hurt = clone(byId(FIGHT_NIMBLE, 'task'));
	const dying = clone(byId(FIGHT_NIMBLE, 'wren'));
	const mins = clone(byId(FIGHT_NIMBLE, 'rats'));
	const dead = clone(hurt); dead.hp.value = 0; dead.conds = [];
	const w = el => h('div.xn-list', { style: { margin: 0 } }, el);
	return [
		['Hero, ready (three actions)', w(GN.row(hero))],
		['Hover (touch: long-press for the menu)', w(GN.row(hero, { state: 'hovered' }))],
		['Hero, done', w(GN.row(byId(FIGHT_NIMBLE, 'tamsin'), { done: true }))],
		['Selected', w(GN.row(hurt, { state: 'selected' }))],
		['Dragging (order within a side)', w(h('div', GN.row(hero, { state: 'dragging' }), h('div.ev-drop-line')))],
		['Dying: one action, Wounds showing', w(GN.row(dying))],
		['Minions: no HP, any damage kills one', w(GN.row(mins))],
		['Defeated', w(GN.row(dead, { state: 'out' }))],
	];
};
