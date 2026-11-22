/* ============================================================================
   Daggerheart flow: the spotlight moves by hand. The big card is whoever holds
   it (a PC, or on the GM's turn an adversary). Not yet / had it. Encounter
   settings for the optional aids. Fear as a slot whose details come later.
   ========================================================================== */
const ADVACT = {
	brute: [['Standard attack', '+3 · 1d10+3 phy', ''], ['Thorn snare', 'Restrain a target in Close', '1 Fear'], ['Momentum', 'Reaction: on a hit, gain a Fear', 'reaction']],
	archers: [['Volley', '+2 · 1d8+2 phy, Far', ''], ['Pin down', 'Target is Restrained until it moves', '1 Fear']],
};

GD.fearLater = (n, max, gm) => later(GD.fear(n, max, gm));

/** Party card with the spotlight count and the shared mark. */
GD.pcFlow = (c, opts = {}) => {
	const el = GD.pc(c);
	if (opts.acted) el.classList.add('is-acted');
	el.prepend(h('span.xd-pc-mark', opts.count !== undefined ? h('span.xd-count-n', `×${opts.count}`) : null, mark(opts.acted ? 'acted' : opts.next ? 'next' : '')));
	return el;
};

/** A reaction roll the players make at the table: each target gets its own Passed / Failed. */
GD.reactRoll = () => h('div.xd-react',
	h('div.xd-react-h', h('b', 'Thorn snare'), h('span', 'Agility reaction roll · Difficulty 13'), h('em.fear', '1 Fear spent')),
	[['Kael', 'fail', 'Restrained'], ['Nim', 'pass', null], ['Tobin', null, null]].map(([n, on, res]) => h('div.xd-react-r', h('span.who', h('b', n), res ? h('span.res', res) : h('span.res.dim', on === 'pass' ? 'Shrugs it off' : 'Rolling…')), GD.passFail(on))),
	h('p.xd-react-n', 'Mark each as the players call it. Failed applies Restrained; nothing is rolled for them.'));

/** The adversary as the big card: the same frame as the spotlit PC, a dark Difficulty crest, its actions. */
GD.spotAdv = (c, opts = {}) => GD.spotCard({
	flag: 'The GM’s spotlight', flagCls: 'fear', name: c.name, line: c.meta,
	crests: [GD.crest('heater', c.difficulty, 'Difficulty', { size: 54, foe: true })],
	body: [
		h('div.xd-tracks',
			h('span', 'HP'), GD.slots('hp', c.hp.max, c.hp.marked, true), h('b', `${c.hp.marked}/${c.hp.max}`),
			h('span', 'Stress'), GD.slots('stress', c.stress.max, c.stress.marked, true), h('b', `${c.stress.marked}/${c.stress.max}`)),
		h('div.xd-thresh', h('span', 'Minor'), h('b', String(c.thresholds[0])), h('span', 'Major'), h('b', String(c.thresholds[1])), h('span', 'Severe')),
		opts.react ? GD.reactRoll() : h('div.xd-acts', (ADVACT[c.id] || []).map(([n, d, cost], i) => h('button.xd-act', h('kbd', String(i + 1)), h('b', n), h('span', d), cost ? h('em' + (cost === '1 Fear' ? '.fear' : ''), cost) : null))),
		(c.conds || []).length ? h('div', { style: { marginTop: '10px' } }, chips(c.conds)) : null,
		GD.acts([[btn({ icon: 'damage', text: 'Damage' }), btn({ icon: 'heal', text: 'Heal' })], [btn({ icon: 'roll', text: 'Roll' })], [btn({ icon: 'condition', text: 'Condition' })]], 'three')],
});

GD.state = (name) => {
	const enc = clone(FIGHT_DH);
	enc.turn.counts = { kael: 2, nim: 1, maren: 1, tobin: 0 };
	enc.turn.had = ['nim', 'maren'];
	if (name === 'start') { enc.turn.counts = { kael: 0, nim: 0, maren: 0, tobin: 0 }; enc.turn.had = []; enc.turn.spotlit = 'nim'; }
	if (name === 'gm' || name === 'reaction') { enc.turn.holder = 'gm'; enc.turn.spotlit = 'brute'; enc.turn.fear = 6; enc.turn.had = ['nim', 'maren', 'kael']; }
	if (name === 'reaction') { enc.turn.fear = 5; enc.turn.react = true; }
	return enc;
};

GD.partyList = (enc, opts = {}) => {
	const t = enc.turn;
	const pcs = enc.combatants.filter(c => c.side === 'party' && c.id !== (t.holder === 'players' ? t.spotlit : null));
	const notYet = pcs.filter(c => !t.had.includes(c.id)).sort((a, b) => t.counts[a.id] - t.counts[b.id]);
	const had = pcs.filter(c => t.had.includes(c.id));
	const cols = opts.cols || 3;
	const out = [];
	if (notYet.length) {
		out.push(sec('Not yet in the spotlight', `${notYet.length}`));
		out.push(h('div.xd-party', { style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } }, notYet.map((c, i) => GD.pcFlow(c, { count: t.counts[c.id], next: i === 0 && t.holder === 'players' }))));
	}
	if (had.length) {
		out.push(sec('Had the spotlight', `${had.length}`, { acted: true }));
		out.push(h('div.xd-party', { style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } }, had.map(c => GD.pcFlow(c, { count: t.counts[c.id], acted: true }))));
	}
	return { els: out, next: notYet[0] };
};

GD.advList = (enc) => {
	const t = enc.turn;
	const foes = enc.combatants.filter(c => c.side === 'foe' && c.id !== t.spotlit);
	if (t.holder !== 'gm') return [GD.banner('Adversaries', 'waiting for the GM’s turn'), foes.map(c => GD.adv(c))];
	return [GD.banner('Not yet this GM turn', `${foes.length} · 1 Fear each`), foes.map(c => { const a = GD.adv(c); const b = a.querySelector('.bars'); if (b) b.append(h('span.xd-adv-cost', '1 Fear')); return a; }),
		h('div.ev-sec-hint', { style: { marginTop: '4px' } }, 'The first adversary was free. Bandits can Group Attack: 1 Fear for every lackey in Close.')];
};

GD.flow = (name) => {
	const enc = GD.state(name);
	const t = enc.turn, gm = t.holder === 'gm';
	const P = GD.partyList(enc);
	const cur = byId(enc, t.spotlit);
	const card = gm ? GD.spotAdv(cur, { react: t.react }) : GD.spot(cur);
	const head = GD.head(enc, gm ? h('span', h('b.gm', 'The GM'), ' has the spotlight') : h('span', h('b', cur.name), ' has the spotlight'));
	const tick = typeof ticker === 'function' ? ticker({ round: gm ? 'GM’s turn' : 'Players’ spotlight', turn: gm ? cur.name : `${cur.name} ×${t.counts[cur.id]}`, note: gm ? 'first one free' : `${P.els.length ? (enc.combatants.filter(c => c.side === 'party' && !t.had.includes(c.id) && c.id !== cur.id).length) : 0} yet to have it`, cls: 'xd-tick' }) : null;
	const body = gm
		? [GD.fearLater(t.fear, t.fearMax, true), h('div', { style: { height: '10px' } }), tick, card, GD.advList(enc), GD.banner('Party', 'waiting'), P.els]
		: [GD.fearLater(t.fear, t.fearMax), GD.counts(enc.countdowns), h('div', { style: { height: '12px' } }), tick, card, h('div.ev-sec-hint', { style: { marginTop: '10px' } }, 'Tap anyone to hand them the spotlight'), P.els, GD.advList(enc)];
	const foot = gm
		? h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ text: 'Players', cls: 'is-second', title: 'Back to the players' }), btn({ icon: 'next', kind: 'primary', text: 'Next: Archers', title: 'Next: Thorn archers (1 Fear)' }))
		: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ text: 'GM’s turn', cls: 'is-second' }), btn({ icon: 'next', kind: 'primary', text: P.next ? `Next: ${P.next.name}` : 'GM’s turn' }));
	return { children: [head, body, h('div', { style: { height: '12px' } })], foot };
};

/** Encounter settings: the spotlight aids, all optional, and the Fear tracker left for later. */
GD.settings = () => h('div.set-modal.g-dh',
	h('div.set-head', h('h3', 'Encounter settings'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
	h('p', { style: { margin: '0 22px 6px', fontSize: '13px', color: 'var(--g-text-2)' } }, 'Daggerheart · these only change what the tracker shows. Nothing here stops anyone acting.'),
	h('div.set-sec', 'Spotlight'),
	h('div.set-row', h('span', h('b', 'Count spotlights'), h('small', 'Shows ×2 on each player’s card and lists whoever has had it least first.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Spotlight Tracker tokens'), h('small', 'The book’s optional tracker: each player spends a token per action; everyone refills when all are spent.')), toggle('', false)),
	h('div.set-row.sub', { style: { opacity: .5 } }, h('span', h('b', 'Tokens per player'), h('small', 'The book suggests 3.')), stepper(3)),
	h('div.set-row', h('span', h('b', 'Action tracker'), h('small', 'The playtest’s GM tokens for activating adversaries. Off in the final rules; here if your table still uses it.')), toggle('', false)),
	h('div.set-row', h('span', h('b', 'Move the spotlight from roll results', h('span.set-tag.idea', 'Idea · off by default')), h('small', 'Logging a roll with Fear or a failure would hand the spotlight to the GM. You could still move it by hand at any time.')), toggle('', false)),
	h('div.set-sec', 'Fear'),
	h('div.set-row.later', h('span', h('b', 'Fear tracker', h('span.set-tag', 'Coming later')), h('small', 'The GM’s Fear pool, visible to the table: the band at the top of the main tab and in the player-safe view. How it’s shown and changed is still to figure out.')), h('span')),
	h('div.set-sec', 'Player-safe view'),
	h('div.set-row', h('span', h('b', 'Adversary health'), h('small', 'What the table sees instead of slots.')), segs(['Hidden', 'Labels', 'Slots'], 'Labels')),
	h('div', { style: { height: '10px' } }));

/* ---------- Main tab ---------- */
GD.main = (device, name = 'players', opts = {}) => {
	const enc = GD.state(name);
	const t = enc.turn, gm = t.holder === 'gm';
	const cur = byId(enc, t.spotlit);
	const P = GD.partyList(enc, { cols: device === 'portrait' ? 3 : 3 });
	const top = h('div.mt-top.xd-mtop', h('div.ttl', h('h1.xd-title', { style: { fontSize: '24px', lineHeight: '28px' } }, enc.name), h('div.xd-sub', gm ? h('span', h('b.gm', 'The GM'), ' has the spotlight') : h('span', h('b', cur.name), ' has the spotlight'))),
		toggle('Player-safe', false), btn({ icon: 'sliders', text: 'Encounter settings', size: 'sm' }), btn({ icon: 'plus', kind: 'icon', size: 'sm', title: 'Add' }));
	const band = h('div.xd-band', h('div', GD.fearLater(t.fear, t.fearMax, gm)), GD.counts(enc.countdowns));
	const card = gm ? GD.spotAdv(cur) : GD.spot(cur);
	const right = h('div', h('div.ev-sec-hint', { style: { padding: '12px 16px 0' } }, 'Tap anyone to hand them the spotlight'), gm ? [GD.advList(enc), GD.banner('Party', 'waiting for the players’ spotlight'), P.els] : [P.els, GD.banner('Adversaries', 'waiting for the GM’s turn'), h('div.xd-advgrid', enc.combatants.filter(c => c.side === 'foe').map(c => GD.adv(c)))]);
	const cols = mtLayout('k2', [h('div', h('div', { style: { padding: '14px 4px 0' } }, card)), h('div', right)]);
	const foot = h('div.mt-foot', h('span.keys', h('span', h('kbd', 'N'), 'next player'), h('span', h('kbd', 'G'), 'GM’s turn'), h('span', h('kbd', 'Z'), 'undo')), btn({ icon: 'undo', kind: 'icon', title: 'Back' }),
		gm ? btn({ text: 'To the players' }) : btn({ text: 'GM’s turn' }), btn({ icon: 'next', kind: 'primary', text: gm ? 'Next: Thorn archers' : `Next: ${P.next.name}`, sub: gm ? '1 Fear' : null }));
	return [top, band, cols, foot];
};
GD.glance = () => glance({ round: 'The players’ spotlight', kicker: 'In the spotlight', name: 'Kael',
	extra: h('div', { style: { display: 'grid', gap: '6px' } }, GD.hope(6, 3), GD.slots('hp', 7, 2), GD.slots('stress', 6, 1)),
	rows: [{ sec: 'Not yet', small: '1' }, { name: 'Tobin', em: '×0', next: true }, { sec: 'Had it', small: '2' }, { name: 'Nim', em: '×1', acted: true }, { name: 'Maren', em: '×1', acted: true }, { sec: 'Fear', small: 'later' }, { name: 'GM’s Fear', em: '5' }] });

/** Player-safe: the spotlight, the party’s own tracks, adversaries as labels, Fear in its (later) slot. */
GD.safe = () => {
	const enc = GD.state('players');
	const pcs = enc.combatants.filter(c => c.side === 'party');
	const foes = enc.combatants.filter(c => c.side === 'foe');
	const lab = c => c.group ? `${c.group.alive} left` : c.hp.marked === 0 ? 'Unhurt' : c.hp.marked >= c.hp.max - 1 ? 'Nearly down' : 'Hurt';
	return [h('div.mt-top', h('div.ttl', h('h1.xd-title', { style: { fontSize: '28px', lineHeight: '34px' } }, enc.name), h('div.xd-sub', { style: { fontSize: '16px' } }, h('b', 'Kael'), ' has the spotlight')), h('span.ps-badge', icon('eye', 14, 2.2), 'Player-safe')),
		h('div.ps.xd-ps',
			h('div.xd-ps-l', (() => { const k = GD.spot(byId(enc, 'kael')); const b = k.querySelector('.xd-spot-btns'); if (b) b.remove(); return k; })(),
				h('div', { style: { marginTop: '16px' } }, GD.fearLater(5, 12))),
			h('div.xd-ps-r',
				h('div.xd-party', { style: { gridTemplateColumns: 'repeat(4, minmax(0,1fr))', margin: 0 } }, pcs.map(c => GD.pc(c))),
				h('div.xd-banner', { style: { margin: '18px 0 8px' } }, h('span', 'Adversaries')),
				h('div.xd-ps-foes', foes.map(c => GD.cut('div.xd-ps-foe', null, h('b', c.name + (c.count ? ` ×${c.count}` : '')), h('span.ps-hp' + (lab(c) === 'Nearly down' ? '.low' : ''), lab(c))))))),
	];
};
