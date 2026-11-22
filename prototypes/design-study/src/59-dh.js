/* ============================================================================
   Daggerheart renderer: the spotlight table, in the game's own dress.
   Crests (Evasion arch, Armor shield, Level, trait banners, Difficulty) are
   inline SVG; ribbons are CSS. Original drawings, after the sheet's shapes.
   ========================================================================== */
const GD = {};

/* ---------- Shapes ---------- */
const XC = {
	// Evasion: the sheet's arch, with the little shoulder tabs
	arch: { face: 'M12 63V30C12 18.4 21 9 32 9s20 9.4 20 21v33Z', inner: 'M15.5 61V30.5C15.5 20.6 23 12.6 32 12.6s16.5 8 16.5 17.9V61', notch: 'M8.5 35h4v11h-4ZM51.5 35h4v11h-4Z', numY: 43 },
	// Armor: a shield with a crowned top
	shield: { face: 'M9 13 20.5 8.4 32 3.6l11.5 4.8L55 13v21.5c0 13.6-9.6 23.6-23 30.4C18.6 58.1 9 48.1 9 34.5Z', inner: 'M12.8 15.6 32 7.6l19.2 8v18.9c0 11.4-7.8 19.9-19.2 25.8-11.4-5.9-19.2-14.4-19.2-25.8Z', numY: 40 },
	// Level: a tall shield with clipped corners
	level: { face: 'M15 4h34l6 6v27c0 13.4-9.6 22.6-23 29C18.6 59.6 9 50.4 9 37V10Z', inner: 'M16.6 7.8h30.8l3.8 3.8v25.2c0 11.4-7.9 19.4-19.2 25-11.3-5.6-19.2-13.6-19.2-25V11.6Z', notch: 'M5 22h4v12H5ZM55 22h4v12h-4Z', numY: 38 },
	// A trait: banner on top, a shield below
	trait: { face: 'M10 15h44v23c0 12.4-9 21.2-22 27.4C19 59.2 10 50.4 10 38Z', inner: 'M13.6 18.4h36.8V38c0 10.4-7.6 18-18.4 23.4C21.2 56 13.6 48.4 13.6 38Z', numY: 46 },
	// An adversary's Difficulty: a heater shield, dark
	heater: { face: 'M32 4 55 12.5v22c0 14-9.8 24.4-23 31C18.8 58.9 9 48.5 9 34.5v-22Z', inner: 'M32 8 51.2 15.2v19.3c0 11.8-8 20.6-19.2 26.4-11.2-5.8-19.2-14.6-19.2-26.4V15.2Z', numY: 42 },
};
/** A crest: the shape, a number, and a navy banner with its label (below, or on top for traits). */
GD.crest = (shape, n, label, opts = {}) => {
	const s = XC[shape];
	const size = opts.size || 56;
	const top = shape === 'trait';
	const banner = label && !top ? `<path class="ban" d="M5 50h54l4 6.6-4 6.6H5l-4-6.6Z"/><text class="lab" x="32" y="59.4"${label.length > 7 ? ' textLength="46" lengthAdjust="spacingAndGlyphs"' : ''}>${label}</text>` : '';
	// A trait: the banner centred over the shield; the level-up mark sits on the shield's bottom point.
	const tab = top ? `<path class="ban" d="M6 2.5h52v13H6Z"/><text class="lab" x="32" y="12"${label.length > 6 ? ` textLength="${Math.min(46, label.length * 5.6)}" lengthAdjust="spacingAndGlyphs"` : ''}>${label}</text>` : '';
	const markDot = top ? `<circle class="dot${opts.mark ? ' on' : ''}" cx="32" cy="65.4" r="5.2"/>` : '';
	const numY = label && !top ? s.numY - 3 : s.numY;
	const markup = `<path class="face" d="${s.face}"/>${s.inner ? `<path class="inner" d="${s.inner}"/>` : ''}<path class="rim" d="${s.face}"/>${s.notch ? `<path class="notch" d="${s.notch}"/>` : ''}${tab}${banner}<text class="num" x="32" y="${numY}" style="font-size:${opts.fs || 24}px">${n}</text>${markDot}`;
	const vbTop = top ? 0 : label ? 2 : 2;
	const vbH = top ? 72 : label ? 64 : 64;
	const el = svg(markup, 64, vbH);
	el.setAttribute('viewBox', `0 ${vbTop} 64 ${vbH}`);
	el.setAttribute('width', size); el.setAttribute('height', Math.round(size * vbH / 64));
	return h('span.xc.xc-' + shape + (opts.foe ? '.is-foe' : '') + (opts.cls ? '.' + opts.cls : ''), { title: opts.title || (label ? `${label} ${n}` : String(n)) }, el);
};

/* ---------- Ribbons ---------- */
GD.rib = (text, cls = '', ic) => h('span.xd-rib' + (cls ? '.' + cls.split(' ').join('.') : ''), ic ? h('span.ic', icon(ic, 13, 2.2)) : null, text);
GD.banner = (label, small) => h('div.xd-banner', h('span', label), small ? (typeof small === 'string' ? h('small', small) : small) : null);
/** A paper panel with its ribbon on the top edge. */
GD.panel = (title, kids, opts = {}) => h('section.xd-panel.xd-paper' + (opts.cls ? '.' + opts.cls : ''), GD.rib(title, opts.lg ? 'lg' : ''), kids);

/* ---------- Tokens and slots ---------- */
GD.hope = (max, on, lg) => h('span.xd-hope' + (lg ? '.lg' : ''), { title: `Hope ${on} of ${max}` }, Array.from({ length: max }, (_, i) => h('i' + (i < on ? '.on' : ''))));
GD.slots = (kind, max, on, lg) => slots({ max, on, cls: 'xd-slots.' + kind + (lg ? '.lg' : '') });
GD.armorIcon = (on, w = 14) => {
	const s = svg(`<path d="M7 1.2 12.4 3v4.4c0 3.3-2.3 5.1-5.4 6.3C3.9 12.5 1.6 10.7 1.6 7.4V3Z" stroke-width="1.4" stroke-linejoin="round"/>`, 14, 15);
	s.setAttribute('width', w); s.setAttribute('height', Math.round(w * 15 / 14));
	if (on) s.classList.add('on');
	return s;
};
GD.armor = (max, marked, w) => h('span.xd-armor', { title: `Armor slots: ${marked} of ${max} marked` }, Array.from({ length: max }, (_, i) => GD.armorIcon(i < marked, w)));

/** Buttons in clusters: the ones that belong together share one outline; clusters never wrap into a ragged row.
    groups: [[btn, btn], [btn]]. Uses the shared .ev-cluster when the design system publishes it. */
GD.acts = (groups, cls = '') => {
	const row = clusters(groups.map(g => cluster(g, { joined: g.length > 1 })));
	row.classList.add('xd-spot-acts'); if (cls) row.classList.add(cls);
	return row;
};
/** Passed / Failed for a roll made at the table: its own joined cluster, never mixed with the card's actions. */
GD.passFail = (on) => cluster([
	h('button.ev-btn.is-pass' + (on === 'pass' ? '.on' : ''), ICONX('check', 14), h('span', 'Passed')),
	h('button.ev-btn.is-fail' + (on === 'fail' ? '.on' : ''), ICONX('x', 14), h('span', 'Failed'))], { joined: true, fixed: true, label: 'Rolled at the table' });
/** The shared icon module when present (29-icons.js), the old icon() otherwise. */
function ICONX(name, size = 16, opts) { return typeof ICON === 'function' ? ICON(name, size, opts) : icon(name, size); }

/* Kept for the shared refinements: a plain card, and a framed one. */
GD.cut = (tag, attrs, ...kids) => h(tag + '.xd-cut', attrs, ...kids);
GD.edge = (inner, cls = '') => h('div.xd-edge' + cls, inner);

GD.head = (enc, sub) => h('div.xd-head',
	h('div.xd-head-t', h('h1.xd-title', enc.name), h('div.xd-sub', sub)),
	btn({ icon: 'plus', kind: 'quiet icon', size: 'sm', title: 'Add' }), btn({ icon: 'more', kind: 'quiet icon', size: 'sm', title: 'More' }));

GD.fear = (n, max, gm) => h('div.xd-fear' + (gm ? '.is-gm' : ''),
	h('span.n', String(n)),
	h('span.l', 'Fear', h('small', gm ? 'Spend 1 to spotlight another' : 'The GM’s, up to 12')),
	h('span.xd-tokens', Array.from({ length: max }, (_, i) => h('i' + (i < n ? '.on' : '')))));

GD.counts = list => h('div.xd-counts', list.map(c => h('div.xd-count', h('b', c.name),
	h('div.boxes', Array.from({ length: c.max }, (_, i) => h('i' + (i < c.left ? '.on' : ''))), h('span', String(c.left))))));

/** The big card: a paper card in a gold frame, a ribbon on top, crests on the right. */
GD.spotCard = ({ flag, flagCls = '', name, line, sub2, crests, body }) => h('div.xd-spot',
	GD.rib(flag, 'xd-spot-flag ' + flagCls, 'sparkle'),
	h('div.xd-spot-in.xd-paper',
		h('div.xd-spot-top',
			h('div.nm', h('h2', name), h('p', h('span', line), sub2 ? h('span.sub2', sub2) : null)),
			h('div.crests', crests)),
		body));

GD.spot = (c, opts = {}) => GD.spotCard({
	flag: 'In the spotlight', name: c.name, line: c.meta.replace(/ (\d+)$/, ' · Level $1'),
	crests: [GD.crest('arch', c.evasion, 'Evasion', { size: 54 })],
	body: [
		h('div.xd-tracks',
			h('span', 'Hope'), GD.hope(c.hope.max, c.hope.on, true), h('b', `${c.hope.on}`),
			h('span', 'HP'), GD.slots('hp', c.hp.max, c.hp.marked, true), h('b', `${c.hp.marked}/${c.hp.max}`),
			h('span', 'Stress'), GD.slots('stress', c.stress.max, c.stress.marked, true), h('b', `${c.stress.marked}/${c.stress.max}`),
			h('span', 'Armor'), GD.armor(c.armor.max, c.armor.marked, 16), h('b', `${c.armor.marked}/${c.armor.max}`)),
		h('div.xd-thresh', h('span', 'Minor'), h('b', String(c.thresholds[0])), h('span', 'Major'), h('b', String(c.thresholds[1])), h('span', 'Severe')),
		(c.conds || []).length ? h('div', { style: { marginTop: '10px' } }, chips(c.conds)) : null,
		typeof hopeChips === 'function' ? hopeChips(c.name) : null,
		GD.acts([[btn({ icon: 'damage', text: 'Damage' }), btn({ icon: 'heal', text: 'Heal' })], [btn({ icon: 'condition', text: 'Condition' })]])],
});

GD.pc = (c, opts = {}) => {
	const last = c.hp.marked >= c.hp.max - 1;
	return h('div.xd-pc' + (last ? '.is-low' : ''),
		h('h4', c.name), h('div.cl', c.meta),
		h('div.rows', GD.hope(c.hope.max, c.hope.on), GD.slots('hp', c.hp.max, c.hp.marked), GD.slots('stress', c.stress.max, c.stress.marked)),
		h('div.ev', (c.conds || []).length ? h('span.xd-flag' + (c.conds[0].bad ? '.bad' : ''), c.conds[0].name) : h('span', 'Evasion'), h('span.xd-evb', { title: `Evasion ${c.evasion}` }, String(c.evasion))));
};

GD.adv = (c, opts = {}) => {
	const cls = ['xd-adv'];
	if (opts.state) cls.push('is-' + opts.state);
	const el = h('div.' + cls.join('.'),
		opts.state === 'dragging' ? h('span.grip', icon('grip', 14)) : null,
		h('span.xd-diff', GD.crest('heater', c.difficulty, null, { size: 34, fs: 26, foe: true, title: `Difficulty ${c.difficulty}` })),
		h('span', { style: { minWidth: 0 } }, h('h4', c.name, c.count ? h('small', `×${c.count}`) : c.group ? h('small', `${c.group.alive} of ${c.group.count}`) : null), h('div.ty', typeof GDK !== 'undefined' ? h('span.xd-tyg.k-adversary', GDK.glyph(c.meta.split(',')[0], 13)) : null, c.meta)),
		c.group ? h('span.th.min', `Minion (${c.group.per})`) : h('span.th', { title: 'Damage thresholds: Major, Severe' }, h('b', String(c.thresholds[0])), h('i', '/'), h('b', String(c.thresholds[1]))),
		h('div.bars', c.group ? h('span.xd-mins', Array.from({ length: c.group.count }, (_, i) => h('i' + (i < c.group.alive ? '' : '.off')))) : [h('span', 'HP', GD.slots('hp', c.hp.max, c.hp.marked)), h('span', 'Stress', GD.slots('stress', c.stress.max, c.stress.marked))]),
		(c.conds || []).length ? h('div.chips', chips(c.conds)) : null);
	return opts.spot ? GD.edge(el, '.xd-adv-wrap.is-spot') : el;
};

/** The damage keypad's threshold strip, lit on the band the damage falls in. */
GD.padStrip = (th, on = 1) => h('div.xd-pad-th', h('div.strip',
	h('span' + (on === 0 ? '.on' : ''), 'Minor', h('small', 'mark 1')), h('b', String(th[0])), h('span' + (on === 1 ? '.on' : ''), 'Major', h('small', 'mark 2')), h('b', String(th[1])), h('span' + (on === 2 ? '.on' : ''), 'Severe', h('small', 'mark 3'))));

GD.table = (enc, view = 'players', kind = 'sidebar') => {
	enc = clone(enc);
	if (view === 'setup') return GD.setup(enc);
	const pcs = enc.combatants.filter(c => c.side === 'party');
	const foes = enc.combatants.filter(c => c.side === 'foe');
	let overlay = null, gm = view === 'gm';
	if (view === 'dying') { const m = byId(enc, 'maren'); m.hp.marked = 6; enc.turn.spotlit = 'maren'; }
	if (view === 'prompt') overlay = sheet('Nim rolled with Fear', h('div',
		promptCard({ ic: 'dice', title: h('span', '14 with Fear: ', h('em', 'a success, but…')), text: 'The GM gains a Fear and takes the spotlight.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'arrow-right', text: 'GM’s turn, Fear 6' }), btn({ size: 'sm', text: 'Not yet' })] }),
		promptCard({ ic: 'timer', title: h('span', 'The bridge gives way ', h('em', '3 → 2')), text: 'This countdown ticks on every roll with Fear.', acts: [btn({ size: 'sm', icon: 'check', text: 'Tick it' }), btn({ size: 'sm', text: 'Skip' })] })));
	if (view === 'keypad') overlay = sheet('Kael takes damage', h('div',
		GD.padStrip([9, 17], 1),
		h('p', { style: { margin: '-2px 2px 10px', font: 'italic 600 13px/18px var(--g-font-ui)', color: 'var(--g-text-2)' } }, h('b', { style: { color: 'var(--g-text)', fontStyle: 'normal' } }, '11'), ' is Major: mark 2 HP.'),
		hpPad({ who: h('span', 'HP marked ', h('b', '2'), ' of 7'), amount: '11', modes: ['Damage', 'Clear HP', 'Stress'], extra: quickActs('If Kael marks armor', [['Armor slot', 'Major → Minor · 2 left']]), go: btn({ kind: 'primary', text: 'Mark 2 HP' }) })));
	if (view === 'picker') overlay = sheet('Bramble brute', picker({ items: [
		{ name: 'Hidden', text: 'Rolls against it have disadvantage', icon: 'eye' },
		{ name: 'Restrained', text: 'Can’t move; can still act', icon: 'lock', on: true },
		{ name: 'Vulnerable', text: 'Rolls against it have advantage', icon: 'target' },
		{ name: 'Burning (custom)', text: 'A temporary tag you make up', icon: 'flame' },
	], timing: [['Ends', segs(['When cleared', 'Countdown'], 'When cleared')], ['Clear it with', h('b', 'a Strength roll (13)')]] }));

	const spotId = enc.turn.spotlit;
	const spotPc = pcs.find(c => c.id === spotId);
	const children = [GD.head(enc, gm ? h('span', h('b.gm', 'The GM'), ' has the spotlight') : h('span', h('b', 'The players'), ' have the spotlight')), GD.fear(enc.turn.fear + (gm ? 1 : 0), enc.turn.fearMax, gm), GD.counts(enc.countdowns)];
	const partyBlock = [GD.banner('Party', gm ? 'waiting' : 'tap a card to pass it on'),
		!gm && spotPc ? GD.spot(spotPc) : null,
		h('div.xd-party', { style: gm ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } : { marginTop: '10px' } }, pcs.filter(c => gm || c.id !== spotId).map(c => GD.pc(c)))];
	const advBlock = [GD.banner('Adversaries', gm ? '1 spotlit · Fear for more' : ''),
		foes.map((c, i) => GD.adv(c, { spot: gm && i === 0 }))];
	if (view === 'dying') {
		overlay = sheet('Maren marks her last HP', h('div',
			h('p', { style: { margin: '0 0 10px', color: 'var(--g-text-2)', fontSize: '13.5px', fontStyle: 'italic', fontWeight: 600 } }, 'She chooses a death move:'),
			promptCard({ ic: 'flame', title: 'Blaze of Glory', text: 'One last action, a critical success; then she dies.' }),
			promptCard({ ic: 'moon', title: 'Avoid Death', text: 'Falls unconscious; roll her Hope die for a scar.' }),
			promptCard({ ic: 'dice', title: 'Risk It All', text: 'Roll Duality: Hope higher, she stands; Fear higher, she dies.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll Duality' })] })));
	}
	const body = gm ? [advBlock, partyBlock] : [partyBlock, advBlock];
	return {
		children: [children, kind === 'wide' ? h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start' } }, h('div', partyBlock), h('div', advBlock)) : body, h('div', { style: { height: '10px' } })],
		foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), gm ? btn({ icon: 'arrow-right', kind: 'primary', text: 'Back to the players' }) : btn({ icon: 'arrow-right', kind: 'primary', text: 'GM’s turn', sub: '+1 Fear' })),
		overlay,
	};
};

GD.setup = enc => {
	const foes = enc.combatants.filter(c => c.side === 'foe');
	return {
		children: [GD.head(enc, 'Setting the scene'), GD.fear(4, 12),
			h('p.xd-note', 'Fear carries over from last session. No initiative: the players start with the spotlight.'),
			GD.banner('Countdowns', btn({ icon: 'plus', size: 'sm', kind: 'quiet', text: 'Add' })), GD.counts(enc.countdowns.map(c => ({ ...c, left: c.max }))),
			GD.banner('Adversaries', 'Battle points 9 of 10'), foes.map(c => GD.adv(c)),
			GD.banner('Party', '4 at level 2'), h('div.xd-party', { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }, enc.combatants.filter(c => c.side === 'party').map(c => GD.pc(c)))],
		foot: h('div.ev-foot', btn({ icon: 'x', kind: 'icon', title: 'Cancel' }), btn({ icon: 'sparkle', kind: 'primary', text: 'Spotlight to the players' })),
	};
};

GD.states = () => {
	const b = clone(byId(FIGHT_DH, 'archers'));
	const brute = clone(byId(FIGHT_DH, 'brute'));
	const m = clone(byId(FIGHT_DH, 'bandits'));
	const w = el => h('div', { style: { margin: '0 -12px' } }, el);
	const pad = el => h('div', { style: { padding: '14px 4px 6px' } }, el);
	return [
		['Ribbons: large, section, small', pad(h('div', { style: { display: 'grid', gap: '14px', justifyItems: 'center' } }, GD.rib('Damage & health', 'lg'), GD.rib('Active weapons'), GD.rib('Features', 'sm'), GD.rib('The GM’s spotlight', 'fear', 'sparkle')))],
		['Section head: ribbon, rule, note', h('div', { style: { margin: '0 -12px' } }, GD.banner('Adversaries', 'waiting for the GM’s turn'))],
		['Crests: Evasion, Armor, Level, a trait, Difficulty', pad(h('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' } }, GD.crest('arch', 9, 'Evasion', { size: 56 }), GD.crest('shield', 4, 'Armor', { size: 56 }), GD.crest('level', 2, 'Level', { size: 52, fs: 28 }), GD.crest('trait', '+2', 'Strength', { size: 60, mark: true }), GD.crest('heater', 12, 'Difficulty', { size: 52, foe: true })))],
		['Threshold plates and the Hope bar', pad(h('div.xd-paper', { style: { padding: '12px' } }, h('div.xd-thresh', { style: { marginTop: 0 } }, h('span', 'Minor'), h('b', '9'), h('span', 'Major'), h('b', '17'), h('span', 'Severe')), h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '12px' } }, GD.hope(6, 3, true))))],
		['Buttons: primary, default, quiet chip', pad(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, btn({ kind: 'primary', icon: 'next', text: 'Next: Tobin' }), btn({ icon: 'minus', text: 'Damage' }), quickActs('', [['Help an ally', '1 Hope']])))],
		['Tabs: gold-outlined pills on a rule', pad(GDS.tabs('Main', ['Main', 'Features', 'Inventory']))],
		['Fear (coming later) and a countdown', pad(h('div', { style: { display: 'grid', gap: '8px', margin: '0 -12px' } }, GD.fear(5, 12), GD.counts([{ name: 'The bridge gives way', left: 3, max: 6 }])))],
		['A domain card (in the hand, 120px)', pad(h('div', { style: { display: 'flex', justifyContent: 'center' } }, GDS.dcard('ring', { w: 120 })))],
		['Loadout alternative: a grid (the fan is the default everywhere)', pad(GDS.hand(KAEL_HAND.slice(0, 3), 'grid', { w: 92, tip: false }))],
		['Loadout alternative: a carousel', pad(GDS.hand(KAEL_HAND, 'carousel', { w: 150, tip: false }))],
		['Kinds and types: tags', pad(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ['Bruiser', 'Horde', 'Minion', 'Solo', 'Social', 'Traversal', 'Event', 'NPC'].map(t => GDK.tag(t))))],
		['Feature kinds: passive, action, reaction', h('div.xdk.xd-paper', { style: { margin: '6px -4px', padding: '6px 12px', boxShadow: 'none' } }, GDK.feat(['Stonehide', 'Passive', 'Always on.']), GDK.feat(['Rubble Shove', 'Action', '[[Mark a Stress]] in the spotlight.']), GDK.feat(['Grudge', 'Reaction', 'On a trigger.']))],
		['Passed / Failed (a roll made at the table)', pad(h('div.xd-paper', { style: { padding: '12px', display: 'flex', gap: '8px', alignItems: 'center' } }, GD.passFail(), GD.passFail('fail')))],
		['Adversary', w(GD.adv(b))],
		['Hover', w(GD.adv(b, { state: 'hovered' }))],
		['In the spotlight (GM’s turn)', w(GD.adv(brute, { spot: true }))],
		['Selected', w(GD.adv(b, { state: 'selected' }))],
		['Minions: one row, many bodies', w(GD.adv(m))],
		['Dragging (to set the GM’s order)', w(h('div', GD.adv(b, { state: 'dragging' }), h('div.ev-drop-line', { style: { margin: '0 12px' } })))],
		['Defeated', w(GD.adv(Object.assign(clone(b), { hp: { max: 3, marked: 3 } }), { state: 'out' }))],
		['Player character, last HP', h('div', { style: { width: '128px' } }, GD.pc(byId(FIGHT_DH, 'maren')))],
	];
};

/* Overpass's light and heavy cuts (OFL) for the caps: the plugin would bundle a Latin subset. */
if (!document.getElementById('xd-fonts')) document.head.append(h('link', { id: 'xd-fonts', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Overpass:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700;1,800;1,900&display=swap' }));
