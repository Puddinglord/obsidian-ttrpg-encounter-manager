/* ============================================================================
   Nimble flow: one active card for heroes and monsters alike, heroes in any
   order (still to act / done), the legendary beat after each hero, the
   monsters' side, and the main tab.
   ========================================================================== */
const ACTN = {
	task: { intro: 'Choose 1', list: [['Whip crack', '1d8 + 3', 'Reach 2'], ['Get in here!', '', 'Call a goblin minion'], ['Rally', '', 'Allies +1 action']] },
	hound: { intro: 'Choose 1', list: [['Bite', '2d6', ''], ['Quicksilver dash', '', 'Move 8, no attacks against it']] },
	rats: { intro: 'All rats on one hero', list: [['Gnaw (3 rats)', '3d6, drop 1s', 'One Defend for the pack']] },
};

GN.row = (c, opts = {}) => {
	if (opts.done) opts = Object.assign({}, opts, { acted: true });
	const cls = ['xn-row'];
	const hero = c.side === 'heroes';
	if (opts.acted) cls.push('is-acted');
	if (opts.state) cls.push('is-' + opts.state);
	if (c.hp && c.hp.value > 0 && c.hp.value <= c.hp.max / 2) cls.push('is-low');
	const conds = (c.conds || []).map(x => x.bad ? h('span.bad', x.name) : x.trigger ? h('span.acts-t', icon('flame', 12), `${x.name} ${x.value || ''}`) : h('span', x.name + (x.value ? ' ' + x.value : '') + (x.rounds ? ` · ${x.rounds} rd` : '')));
	let right;
	if (c.group) right = h('span.hp', h('span.xn-minions', Array.from({ length: c.group.count }, (_, i) => h('i' + (i < c.group.alive ? '' : '.off')))));
	else right = h('span.hp', h('b', String(c.hp.value)), h('small', `/${c.hp.max}`), bar({ value: c.hp.value, max: c.hp.max }));
	const mid = hero ? GN.acts(c.actions.max, opts.acted ? 0 : c.actions.left)
		: h('span.xn-mid', c.group ? h('span.lvl', `${c.group.alive} left`) : h('span.lvl', c.meta.replace('Level ', 'L').replace('Legendary · ', '')), GN.armor(c.armorType));
	const note = opts.note || (conds.length ? conds : hero ? null : c.kind === 'legendary' ? 'Acts after each hero' : c.kind === 'minions' ? 'Die to any damage' : null);
	return h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 14)) : null,
		mark(opts.mark || (opts.acted ? 'acted' : opts.next ? 'next' : '')),
		h('span.nm', h('b', c.name), h('small', hero ? [c.meta] : [], note)),
		mid, right);
};

/** The one active card, for a hero or a monster: same frame, same places. */
GN.card = (c, opts = {}) => {
	const hero = c.side === 'heroes';
	const dying = c.status === 'dying';
	const kicker = opts.kicker;
	const actions = !hero ? (opts.beat ? { intro: 'After each hero: choose 1 (alternate)', list: c.actionsAfter.map(a => [a.name, a.dice, a.last ? 'Used after Orren' : a.note, a.last]) } : ACTN[c.id]) : null;
	return h('div.xn-focus' + (opts.beat ? '.is-beat' : ''),
		kicker ? h('div.xn-kicker', icon(opts.beat ? 'crown' : 'zap', 14), kicker) : null,
		h('div.xn-f-top',
			h('div.nm', h('h2', c.name), h('p', hero ? [c.meta, h('span', '·'), `Armor ${c.armor}`] : [c.meta, GN.armor(c.armorType)])),
			hero ? h('div.acts', GN.acts(c.actions.max, c.actions.left, true), h('small', dying ? '1 action while Dying' : `${c.actions.left} actions left`))
				: c.kind === 'legendary' ? h('div.acts', h('span.xn-phase-chip', c.hp.value <= c.bloodied ? 'Bloodied' : 'Normal'), h('small', 'Last Stand: +7 HP per hero')) : null),
		h('div.xn-hp', c.group ? h('div.xn-hp-row', h('span.xn-minions.lg', Array.from({ length: c.group.count }, (_, i) => h('i' + (i < c.group.alive ? '' : '.off')))), h('span', `${c.group.alive} of ${c.group.count} left`))
			: [GN.hpLine(c, true), c.kind === 'legendary' ? GN.phased(c) : bar({ value: c.hp.value, max: c.hp.max })]),
		dying ? h('div.xn-dying', 'Dying: 2 Wounds of 6', h('span', 'Attacking costs a Wound unless a DC 10 STR save. Any hit adds 2 Wounds, 3 on a crit.')) : null,
		actions ? h('div.xn-menu', h('div.xn-menu-h', actions.intro), actions.list.map(([n, d, note, used], i) => h('button.xn-mi' + (used ? '.used' : '') + (opts.beat && !used ? '.pick' : ''), h('kbd', String(i + 1)), h('b', n), d ? h('span.d', d) : null, note ? h('small', note) : null))) : null,
		(c.conds || []).filter(x => x.name !== 'Dying').length ? h('div.xn-f-chips', chips(c.conds.filter(x => x.name !== 'Dying'))) : null,
		GN.cardActs(null, hero));
};
/** The card's buttons: Damage and Heal joined (the same keypad, two modes), conditions and the block on their own. */
GN.cardActs = (extra, hero) => h('div.xn-f-btns', clusters(cluster([btn({ text: 'Damage' }), btn({ text: 'Heal' })], { joined: true }), cluster([btn({ icon: 'condition', kind: 'icon', title: 'Add condition' }), btn({ icon: 'statblock', kind: 'icon', title: hero ? 'Character sheet' : 'Stat block' }), extra || null], { fixed: true })));

/** One state of the fight, for the flow section and the main tab. */
GN.state = (name) => {
	const enc = clone(FIGHT_NIMBLE);
	const t = enc.turn;
	t.mdone = [];
	if (name === 'start') { t.round = 3; t.done = []; t.acting = 'brakka'; enc.combatants.forEach(c => { if (c.actions && c.status !== 'dying') c.actions.left = 3; }); }
	if (name === 'mid') { t.done = ['tamsin', 'brakka']; t.acting = 'orren'; }
	if (name === 'beat') { t.done = ['tamsin', 'brakka']; t.acting = 'alch'; t.beat = 'Brakka'; }
	if (name === 'monsters') { t.side = 'monsters'; t.done = ['tamsin', 'brakka', 'orren', 'wren']; t.acting = 'task'; t.mdone = ['hound']; }
	if (name === 'dying') { t.done = ['tamsin', 'brakka']; t.acting = 'wren'; }
	return enc;
};

GN.lists = (enc, opts = {}) => {
	const t = enc.turn;
	const heroes = enc.combatants.filter(c => c.side === 'heroes');
	const mons = enc.combatants.filter(c => c.side === 'monsters');
	const out = [];
	const heroSide = t.side === 'heroes';
	const toGo = heroes.filter(c => !t.done.includes(c.id) && c.id !== t.acting);
	const done = t.done.map(id => byId(enc, id));
	const legend = (after, what) => h('div.xn-legend', icon('crown', 15), h('span', 'The Alchemist', h('small', ` · ${what} after ${after}`)));
	const heroBlock = [];
	if (heroSide) {
		heroBlock.push(sec('Heroes still to act', `${toGo.length} · any order`));
		heroBlock.push(h('div.xn-list', toGo.length ? toGo.map((c, i) => GN.row(c, { next: i === 0 })) : h('div.xn-empty', 'Every hero has gone. Next: the monsters.')));
	}
	if (done.length) {
		heroBlock.push(sec(heroSide ? 'Done' : 'Heroes, done this round', String(done.length), { acted: true }));
		const items = [];
		done.forEach((c, i) => { items.push(GN.row(c, { acted: true })); if (heroSide || i < 4) items.push(legend(c.name, t.beat && i === done.length - 1 ? 'acting now' : i % 2 === 0 ? 'Spray' : 'Transmute')); });
		heroBlock.push(h('div.xn-list.is-done', items));
	}
	const mToGo = mons.filter(c => c.kind !== 'legendary' && !t.mdone.includes(c.id) && c.id !== t.acting);
	const mDone = mons.filter(c => c.kind !== 'legendary' && t.mdone.includes(c.id));
	const boss = mons.find(c => c.kind === 'legendary');
	const monBlock = [];
	if (heroSide) {
		monBlock.push(sec('Monsters', 'their side is next'));
		monBlock.push(h('div.xn-list', mons.filter(c => c.id !== t.acting).map(c => GN.row(c, { mark: '' }))));
	} else {
		monBlock.push(sec('Monsters still to act', `${mToGo.length} · any order`));
		monBlock.push(h('div.xn-list', mToGo.map((c, i) => GN.row(c, { next: i === 0 }))));
		monBlock.push(sec('Acted', String(mDone.length), { acted: true }));
		monBlock.push(h('div.xn-list', mDone.map(c => GN.row(c, { acted: true })), GN.row(boss, { mark: 'moment', note: 'Acts after heroes' })));
	}
	let next;
	if (t.acting === 'alch') next = `Back to heroes: ${toGo[0] ? toGo[0].name : 'monsters'}`;
	else if (heroSide) next = boss ? `Done · the Alchemist acts` : `Next: ${toGo[0].name}`;
	else next = mToGo[0] ? `Next: ${mToGo[0].name}` : 'Round 3';
	if (heroSide && t.acting && !toGo.length && t.acting !== 'alch') next = 'Done · the Alchemist acts';
	return { heroBlock, monBlock, next, heroSide };
};

GN.sideSwitch = (enc) => {
	const t = enc.turn, heroes = enc.combatants.filter(c => c.side === 'heroes');
	return h('div.xn-sides',
		h('div.xn-side' + (t.side === 'heroes' ? '.on' : ''), h('span', 'Heroes'), h('small', `${t.done.length} of ${heroes.length} done`)),
		h('div.xn-side' + (t.side === 'monsters' ? '.on' : ''), h('span', 'Monsters'), h('small', t.side === 'monsters' ? `${t.mdone.length} of 3 done` : 'waiting')));
};

GN.flow = (name) => {
	const enc = GN.state(name);
	const t = enc.turn;
	const cur = byId(enc, t.acting);
	const L = GN.lists(enc);
	const card = GN.card(cur, { beat: t.acting === 'alch', kicker: t.acting === 'alch' ? `After ${t.beat}’s turn` : name === 'start' ? 'Nobody has gone yet: tap whoever speaks up' : null });
	const body = L.heroSide ? [card, L.heroBlock, L.monBlock] : [card, L.monBlock, L.heroBlock];
	return { children: [GN.head(enc, `Round ${t.round} · ${L.heroSide ? 'heroes’ side' : 'monsters’ side'}`), GN.sideSwitch(enc), h('div', { style: { height: '10px' } }), body, h('div', { style: { height: '14px' } })],
		foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: t.acting === 'alch' ? 'arrow-right' : 'next', kind: 'primary', text: L.next })) };
};

/* ---------- Main tab ---------- */
GN.main = (device, name = 'mid') => {
	const enc = GN.state(name);
	const t = enc.turn;
	const cur = byId(enc, t.acting);
	const L = GN.lists(enc);
	const boss = byId(enc, 'alch');
	const top = h('div.mt-top', h('div.ttl', h('h1.xn-title', { style: { fontSize: '24px', lineHeight: '28px' } }, enc.name), h('div.xn-sub', `Round ${t.round} · heroes’ side`)),
		h('div', { style: { width: device === 'portrait' ? '300px' : '380px' } }, GN.sideSwitch(enc)), btn({ icon: 'plus', text: 'Add', size: 'sm' }), btn({ icon: 'more', kind: 'icon', size: 'sm' }));
	const bossPane = h('div.xn-boss', h('div.xn-boss-h', icon('crown', 15), h('b', 'The Alchemist'), h('small', 'after every hero')), GN.phased(boss),
		h('div.xn-boss-a', boss.actionsAfter.map(a => h('span' + (a.last ? '.used' : '.pick'), h('b', a.name), a.dice ? ` ${a.dice}` : '', a.last ? h('small', ' used last') : h('small', ' next')))));
	const card = h('div', { style: { padding: '14px 4px' } }, GN.card(cur, { beat: t.acting === 'alch', kicker: t.acting === 'alch' ? `After ${t.beat}’s turn` : null }),
		h('div.xn-log', h('div.xn-log-h', 'Log'), h('div', h('b', 'The Alchemist'), ' Transmute on Brakka: Slowed'), h('div', h('b', 'Brakka'), ' 15 to the Alchemist: 15 − 10 Medium armor = 5'), h('div', h('b', 'The Alchemist'), ' Spray on Tamsin: 7'), h('div.dim', 'Round 2: heroes’ side')));
	const cols = mtLayout('k3', [h('div', L.heroBlock), h('div', { style: { padding: '0 14px' } }, card), h('div', h('div', { style: { padding: '14px 12px 0' } }, bossPane), L.monBlock)]);
	return [top, cols, h('div.mt-foot', h('span.keys', h('span', h('kbd', 'Space'), 'done'), h('span', h('kbd', '1–9'), 'pick'), h('span', h('kbd', 'D'), 'damage'), h('span', h('kbd', 'Z'), 'undo')), btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: L.next }))];
};
GN.glance = (name = 'mid') => {
	const enc = GN.state(name), t = enc.turn, cur = byId(enc, t.acting);
	return glance({ round: `Round ${t.round} · heroes`, kicker: 'Now · acting', name: cur.name, hp: cur.hp.value, max: cur.hp.max,
		extra: h('div', { style: { marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: '600 12px var(--g-font-ui)', color: 'var(--g-text-2)' } }, GN.acts(3, 3), 'then the Alchemist'),
		rows: [{ sec: 'Still to act', small: 'any order' }, { name: 'Wren', em: 'Dying', next: true }, { sec: 'Done', small: '2' }, { name: 'Tamsin', em: '14/18', acted: true }, { name: 'Brakka', em: '21/28', acted: true }, { sec: 'Monsters', small: 'waiting' }, { name: 'The Alchemist', em: '60/96' }, { name: 'Goblin Taskmaster', em: '22/34' }, { name: 'Quicksilver Hound', em: '10/16' }, { name: 'Copper rats', em: '3 left' }] });
};
