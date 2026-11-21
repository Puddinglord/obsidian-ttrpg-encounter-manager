/* ============================================================================
   Nimble: character sheet, NPC card, monster and legendary blocks.
   ========================================================================== */
const GNS = {};
const BRAKKA = { name: 'Brakka', line: 'Orc · Berserker · Level 3', sub: 'Path of the Red Mist · Made a bad choice', stats: [['STR', 3, 'up'], ['DEX', 1], ['INT', -1, 'down'], ['WIL', -1]],
	hp: { value: 21, max: 28, temp: 0 }, armor: 4, init: 1, speed: 6, wounds: 0, hd: { left: 2, max: 3, die: 'd12' },
	skills: [['INT', 'Arcana', -1], ['INT', 'Examination', -1], ['DEX', 'Finesse', -1], ['WIL', 'Influence', -2], ['WIL', 'Insight', -1], ['INT', 'Lore', -1], ['STR', 'Might', 7], ['WIL', 'Naturecraft', -1], ['WIL', 'Perception', -1], ['DEX', 'Stealth', 1]],
	actions: 3, cls: 'Berserker',
	features: [
		{ kind: 'dice', label: 'Fury dice', sub: 'd4 · hold up to 3 (STR)', rules: [['That all you got?!', 'When you are attacked, you may expend 1 or more Fury Dice to reduce the damage taken by STR+DEX for each die spent.']], held: [3, 1], max: 3, die: 4, acts: [{ icon: 'dice', text: 'Roll one' }, { text: 'Spend' }] },
		{ kind: 'state', label: 'Rage', sub: 'ends if you neither attack nor take damage', rules: [['Rage', '(1/turn) Action: Roll a Fury Die (1d4) and set it aside (max of STR Fury Dice); they are lost when your Rage ends. Add your Fury Dice to every STR attack you make.']], on: true, text: 'Raging', acts: [{ text: 'End rage' }] },
		{ kind: 'uses', label: 'One with the Ancients', sub: '1 / Safe Rest', rules: [['One with the Ancients', '(1/Safe Rest) When faced with a decision about which direction or course of action to take, you can call upon your ancestors to guide you toward the most dangerous or challenging path.']], max: 1, left: 1, acts: [{ text: 'Use' }] },
	] };
const TAMSIN = { name: 'Tamsin Reed', line: 'Human · Mage · Level 3', sub: 'Control · Former archivist', stats: [['STR', -1, 'down'], ['DEX', 0], ['INT', 2, 'up'], ['WIL', 2]],
	hp: { value: 14, max: 19, temp: 3 }, armor: 2, init: 0, speed: 6, wounds: 1, extraWounds: 2, hd: { left: 3, max: 3, die: 'd6' },
	skills: [['INT', 'Arcana', 4], ['INT', 'Examination', 3], ['DEX', 'Finesse', 0], ['WIL', 'Influence', 2], ['WIL', 'Insight', 3], ['INT', 'Lore', 3], ['STR', 'Might', -1], ['WIL', 'Naturecraft', 2], ['WIL', 'Perception', 3], ['DEX', 'Stealth', 0]],
	actions: 2, cls: 'Mage',
	features: [
		{ kind: 'pool', tone: 'mana', label: 'Mana', sub: 'INT × 3 + level · back on a Safe Rest', rules: [['Mana', 'Powerful Tiered spells require mana (a portion of the spellcaster’s life force) to fuel them. A spell’s mana cost is equal to its Tier. Heroes gain mana as they level up. Cantrips cost no mana.']], value: 6, max: 9 },
		{ kind: 'uses', open: true, label: 'Steel Will', sub: '1 / Safe Rest · pass a failed save', rules: [['Steel Will', 'Whenever you roll a 1 on an Elemental Surge die, you may reroll it once. (1/Safe Rest) If you would fail a save, you succeed instead.']], max: 1, left: 0, acts: [{ text: 'Use' }] },
	] };
const sg = n => n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
const sgPlain = n => n > 0 ? String(n) : n < 0 ? `−${Math.abs(n)}` : '0';

/** A joined row of buttons that belong together (the shared cluster once it lands; ours until then). */
GNS.cluster = (items, cls = '') => { const c = cluster(items.map(b => btn(Object.assign({ size: 'sm' }, b))), { joined: items.length > 1, fixed: true }); if (cls) c.classList.add(cls); return c; };

/** STR, DEX, INT, WIL as the official sheet draws them: a box with notched corners over a dark band,
 *  and the save marks built in: a filled triangle above for an advantaged save, below for a disadvantaged one. */
GNS.tri = (on, down) => svg(`<path d="${down ? 'M1 .75 11 9.25l10-8.5' : 'M1 9.25 11 .75l10 8.5'}" class="${on ? 'on' : ''}"/>`, 22, 10, 'tri' + (down ? ' dn' : ' up'));
GNS.statBox = ([k, v, save]) => h('button.xns-stat' + (save ? '.is-' + save : ''), { title: `${k} save${save === 'up' ? ', advantage' : save === 'down' ? ', disadvantage' : ''}: roll ${sg(v)}` },
	h('span.face', h('b.v.ev-num', sgPlain(v)), h('span.k', k)),
	GNS.tri(save === 'up', false), GNS.tri(save === 'down', true));
/** Hit points: the sheet's shield, heart on top, Temp in the lower half, a dark foot. HP is the red on the page. */
GNS.hpShield = (hp, W = 104) => {
	const c = W / 2, x1 = W - 2, bw = W - 32;
	const pct = Math.max(0, Math.min(1, hp.value / hp.max));
	return h('button.xns-hp' + (hp.value <= 0 ? '.is-zero' : hp.value <= hp.max / 2 ? '.is-low' : ''), { style: { width: W + 'px' }, title: 'Hit points: tap for the keypad' },
		svg(`<path class="bx" d="M2 11 ${c} 2.5 ${x1} 11v91l-${c - 2} 17.5L2 102Z"/>
			<path class="bd" d="M2 94H${x1}v8l-${c - 2} 17.5L2 102Z"/>
			<path class="dv" d="M2 66H${x1}"/>
			<rect class="tr" x="16" y="57" width="${bw}" height="4" rx="2"/>
			<rect class="fl" x="16" y="57" width="${(bw * pct).toFixed(1)}" height="4" rx="2"/>
			<path class="ht" transform="translate(${c - 8.5} -2.5) scale(.71)" d="${GN.heartPath}"/>`, W, 122, 'xns-hp-bg'),
		h('span.l', 'Hit points'),
		h('span.n', h('b.ev-num', String(hp.value)), h('i'), h('span.ev-num', String(hp.max))),
		h('span.t', icon('heal', 13), h('span', 'Temp'), h('b.ev-num' + (hp.temp ? '' : '.none'), String(hp.temp || 0))));
};
/** A d20, for the rolls that are a d20 (Initiative). */
GNS.d20 = (size = 13) => { const el = svg('<path d="M8 1.3 14.2 4.9v6.2L8 14.7 1.8 11.1V4.9Z"/><path d="M8 1.3 4.6 10.4h6.8ZM1.8 4.9l2.8 5.5M14.2 4.9l-2.8 5.5M4.6 10.4 8 14.7l3.4-4.3"/>', 16, 16, 'xns-d20'); el.setAttribute('width', size); el.setAttribute('height', size); return el; };
/** Hit points, wide: the sheet's box (heart beside its label as Wounds has its drop, dark foot with Temp) around a bar like mana's:
 *  − takes damage, + heals, the keypad for a number. Red is HP. */
GNS.hpBar = hp => {
	const pct = 100 * Math.max(0, hp.value) / Math.max(hp.max, hp.value + hp.temp), tpct = 100 * hp.temp / Math.max(hp.max, hp.value + hp.temp);
	return h('div.xns-hpw' + (hp.value <= 0 ? '.is-zero' : hp.value <= hp.max / 2 ? '.is-low' : ''),
		h('span.l', GN.heart(13), 'Hit points'),
		h('div.r',
			btn({ icon: 'minus', kind: 'icon', size: 'sm', title: 'Damage' }),
			h('button.bar', { title: 'Hit points: tap for the keypad' }, h('i', { style: { width: pct + '%' } }), hp.temp ? h('i.t', { style: { left: pct + '%', width: tpct + '%' } }) : null,
				h('b.ev-num', String(hp.value), h('small', ` / ${hp.max}`))),
			btn({ icon: 'plus', kind: 'icon', size: 'sm', title: 'Heal' }),
			btn({ icon: 'keypad', kind: 'icon', size: 'sm', title: 'Keypad', cls: 'sh-pad' })),
		h('span.f', icon('heal', 12), h('span', 'Temp'), h('b.ev-num' + (hp.temp ? '' : '.none'), String(hp.temp || 0))));
};
/** Defense and Initiative: boxes with the sheet's dark foot. Initiative rolls. */
GNS.box = (label, value, opts = {}) => h((opts.roll ? 'button' : 'div') + '.xns-box' + (opts.roll ? '.is-roll' : ''), { title: opts.title || label },
	h('span.l', label), h('b.ev-num', value), h('span.f', opts.roll ? GNS.d20(13) : null));
/** Wounds: the chain of circles ending in a skull, in a box whose top dips for its label. */
/** Extra Wound slots from a feature: the sheet's dashed circles, drawn only when a hero has them.
 *  They fill after the five chain circles; the skull is still the last Wound. */
GNS.extraWounds = (n, on) => {
	const r = 6.5, step = 19, w = Math.ceil(r * 2 + 3 + step * (n - 1));
	let m = '';
	for (let i = 0; i < n; i++) m += `<circle cx="${(r + 1.5 + i * step).toFixed(1)}" cy="${r + 1.5}" r="${r}" class="${i < on ? 'on' : ''}"/>`;
	return svg(m, w, Math.ceil(r * 2 + 3), 'xns-wx-c');
};
GNS.woundsBox = (on, W = 190, extra = 0) => {
	const total = 6 + extra, dead = on >= total;
	return h('div.xns-wbox' + (extra ? '.has-extra' : ''), { title: `${on} of ${total} Wounds${extra ? ` (${extra} extra from a feature)` : ''}` },
		(() => { const el = svg(`<path class="bx" vector-effect="non-scaling-stroke" d="M2 10h30c4 0 4 9 8 9H${W - 40}c4 0 4-9 8-9h30v66H2Z"/><path class="bd" d="M2 61H${W - 2}v15H2Z"/>`, W, 77, 'xns-wbox-bg'); el.setAttribute('preserveAspectRatio', 'none'); return el; })(),
		h('span.l', icon('drop', 12), 'Wounds'), h('span.c', GN.wounds(dead ? 6 : Math.min(on, 5), 1.45)), h('span.f', h('b.ev-num', String(on)), ` of ${total}`),
		extra ? h('span.x', { title: `${extra} extra Wounds` }, GNS.extraWounds(extra, dead ? extra : Math.max(0, on - 5))) : null);
};

/** The ten skills: one band with notched end caps, each skill's stat above its number. */
GNS.skills = list => h('div.xns-skills',
	h('i.cap.l'),
	h('div.xns-sk-row', list.map(([st, n, v]) => h('button.xns-sk', { title: `Roll ${n} ${sg(v)}` }, h('span.w', h('small', st), h('b.ev-num', sg(v))), h('span.n', n)))),
	h('i.cap.r'));

/** A die you hold (Fury, Judgment): its shape with the face up. Tap one to change it; tap the empty slot to add a die
 *  you rolled at the table. */
GNS.die = (n, sides = 4, opts = {}) => {
	const shape = sides === 4 ? '<path d="M15 2.5 27.5 25H2.5Z"/>' : sides === 6 ? '<rect x="3" y="3" width="24" height="22" rx="3"/>' : '<path d="M15 2 27 10v10l-12 7-12-7V10Z"/>';
	return h('button.xns-die' + (opts.empty ? '.is-empty' : '') + '.d' + sides, { type: 'button', title: opts.empty ? `Add a d${sides} you rolled` : `d${sides} showing ${n}: tap to change`, 'data-v': opts.empty ? '' : String(n), onclick: opts.onclick },
		svg(shape, 30, 28), opts.empty ? h('span.plus', icon('plus', 11, 2.6)) : h('b.ev-num', String(n)));
};
/** Entering a die by hand: the faces as buttons under the row (1–4 for a d4, a grid up to 20 for a d20).
 *  Changing a die shows its face pressed and offers Remove; the empty slot adds one. */
GNS.facePicker = (f, slot, cur, done) => h('div.xns-pick' + (f.die > 6 ? '.is-many' : ''),
	// Rows that come out even: all the faces in one row when they fit, else half (d12: 12 or 6; d20: 10 or 5)
	{ style: { '--faces': String(f.die > 12 ? f.die / 2 : f.die), '--faces-narrow': String(f.die > 12 ? f.die / 4 : f.die / 2) } },
	h('span.l', cur ? `${f.label.replace(/s$/, '').replace(/ dice$/i, ' die')}: change it to` : `Add a ${f.label.replace(/ dice$/i, ' die')} you rolled`),
	h('div.faces', Array.from({ length: f.die }, (_, i) => h('button.face' + (cur === i + 1 ? '.on' : ''), { type: 'button', 'aria-pressed': cur === i + 1 ? 'true' : 'false', onclick: () => done(i + 1) }, h('b.ev-num', String(i + 1))))),
	cur ? btn({ size: 'sm', text: 'Remove', cls: 'rm', onclick: () => done(0) }) : null);
/** One class feature, in the frame the Fury dice set: label and rule on the left, the objects, a cluster of buttons. */
GNS.feature = f => {
	let body = null;
	let pick = null;
	if (f.kind === 'dice') {
		// The study keeps the held dice in f.held; tapping one (or the empty slot) opens the face picker under the row.
		const draw = () => { body.replaceChildren(...f.held.map((n, i) => GNS.die(n, f.die, { onclick: () => open(i) })), ...Array.from({ length: Math.max(0, f.max - f.held.length) }, () => GNS.die(0, f.die, { empty: true, onclick: () => open(f.held.length) }))); };
		const open = slot => { const cur = f.held[slot] || 0; const el = GNS.facePicker(f, slot, cur, v => { if (v) f.held[slot] = v; else f.held.splice(slot, 1); el.remove(); pick = null; draw(); mark(); }); if (pick) pick.remove(); pick = el; row.append(el); mark(slot); };
		const mark = slot => body.querySelectorAll('.xns-die').forEach((d, i) => d.classList.toggle('is-picking', i === slot));
		body = h('div.o'); f.held = f.held.slice(); draw();
		if (f.picking !== undefined) queueMicrotask(() => open(f.picking));
	}
	if (f.kind === 'pool') body = h('div.o.wide', meter({ value: f.value, max: f.max, label: f.label, icon: f.tone === 'mana' ? 'sparkle' : 'heal', low: 0 }));
	if (f.kind === 'number') body = h('div.o', h('span.xns-pool', h('b.ev-num', String(f.value)), h('small', `of ${f.max}`)), stepper(f.step || 1));
	if (f.kind === 'uses' || f.kind === 'charges') body = h('div.o', pips({ max: f.max, on: f.left, cls: 'xns-pips' }), h('small.c', `${f.left} of ${f.max}`));
	if (f.kind === 'state') body = h('div.o', h('span.xns-state' + (f.on ? '.on' : ''), icon(f.icon || 'flame', 14), f.on ? f.text : 'Not ' + f.text.toLowerCase()));
	if (f.kind === 'target') body = h('div.o', h('span.xns-state.on.is-target', { title: f.target }, icon('target', 14), h('span.t', f.target)));
	// A feature with book text gets a chevron on its name; tapping it opens the row to the rules.
	const row = h('div.xns-feat.is-' + f.kind + (f.tone ? '.is-' + f.tone : '') + (f.rules && f.open ? '.is-open' : ''));
	const name = f.rules
		? h('button.lb', { title: f.sub, 'aria-expanded': f.open ? 'true' : 'false', onclick: () => { const o = row.classList.toggle('is-open'); name.setAttribute('aria-expanded', String(o)); } }, (() => { const w = f.label.split(' '), last = w.pop(); return h('b', w.length ? w.join(' ') + ' ' : '', h('span.nw', last, icon('chevron-down', 12, 2.4))); })())
		: h('div.lb', f.sub ? { title: f.sub } : {}, h('b', f.label));
	// append() prints null as the text "null": hand it only the parts this feature has
	row.append(...[name, body || h('span'), f.acts ? GNS.cluster(f.acts) : h('span'),
		f.hint ? h('small.hint', f.hint) : null,
		f.rules ? h('div.xns-rule', f.rules.map(([n, t]) => h('p', n !== f.label ? h('b', n + '. ') : null, t))) : null].filter(Boolean));
	return row;
};
GNS.classPanel = c => h('section.xns-class',
	h('div.xns-class-h', h('span.orn', svg('<path d="M0 5h22M48 5h22" stroke="currentColor" stroke-width="1"/><path d="M35 0l5 5-5 5-5-5Z" fill="currentColor"/>', 70, 10)), h('b', c.cls), h('span.orn', svg('<path d="M0 5h22M48 5h22" stroke="currentColor" stroke-width="1"/><path d="M35 0l5 5-5 5-5-5Z" fill="currentColor"/>', 70, 10))),
	c.features.map(f => GNS.feature(f)));

/** Every class's own things in the one frame: dice you hold, a pool, uses per rest, charges per fight, a marked target. */
GNS.CLASSES = [
	{ cls: 'Berserker', features: [{ kind: 'dice', picking: 1, label: 'Fury dice', sub: 'd4 · hold up to STR', rules: [['That all you got?!', 'When you are attacked, you may expend 1 or more Fury Dice to reduce the damage taken by STR+DEX for each die spent.']], held: [4, 2], max: 3, die: 4, acts: [{ icon: 'dice', text: 'Roll one' }, { text: 'Spend' }] }] },
	{ cls: 'Oathsworn', features: [
		{ kind: 'number', label: 'Lay on Hands', sub: '5 × level · back on a Safe Rest', rules: [['Lay on Hands', 'Gain a magical pool of healing power. This pool’s maximum is always equal to 5×LVL and recharges on a Safe Rest. Action: Touch a target and spend any amount of remaining healing power to restore that many HP.']], value: 11, max: 15, acts: [{ text: 'Heal' }] },
		{ kind: 'dice', label: 'Judgment dice', sub: 'd6 · up to 2', rules: [['Radiant Judgment', 'Whenever an enemy attacks you, roll and set aside 2d6 Judgment Dice (if you currently have none). They are expended on your next Reach attack this encounter, dealing their total as extra radiant damage (they are lost on a miss).']], held: [5], max: 2, die: 6, acts: [{ icon: 'dice', text: 'Roll' }, { text: 'Spend' }] }] },
	{ cls: 'Hunter', features: [
		{ kind: 'target', label: 'Hunter’s Mark', sub: 'one quarry for a day', rules: [['Hunter’s Mark', 'Action: A creature you can see is marked as your Quarry for 1 day (or until you mark another creature). It can’t be hidden from you, and your attacks against it gain your choice of advantage OR +LVL damage (choose before each attack).']], target: 'Goblin Taskmaster', acts: [{ text: 'Move mark' }] },
		{ kind: 'charges', label: 'Thrill of the Hunt', sub: 'charges · lost when the fight ends', rules: [['Thrill of the Hunt', 'Gain a charge to use your Thrill of the Hunt abilities during that encounter whenever you HIT your Quarry in melee, CRIT your Quarry at Range, or your Quarry dies. Unused charges are lost when combat ends.']], max: 3, left: 2, acts: [{ text: 'Gain' }, { text: 'Spend' }] }] },
	{ cls: 'Commander', features: [{ kind: 'uses', label: 'Coordinated Strike', sub: 'INT times / Safe Rest', rules: [['Coordinated Strike!', '(1/encounter) You and an ally within Reach 6 both immediately make a weapon/Unarmed Strike or cast a cantrip for free.']], max: 3, left: 2, acts: [{ text: 'Use' }] }] },
	{ cls: 'Shepherd', features: [{ kind: 'pool', tone: 'mana', label: 'Mana', sub: 'WIL × 3 + level', rules: [['Mana', 'Powerful Tiered spells require mana (a portion of the spellcaster’s life force) to fuel them. A spell’s mana cost is equal to its Tier. Heroes gain mana as they level up. Cantrips cost no mana.']], value: 5, max: 9 }] },
];
GNS.classGallery = () => h('div.xns.xns-gallery', GNS.CLASSES.map(c => GNS.classPanel(c)));

GNS.sheet = (c, state = 'full', opts = {}) => {
	c = clone(c);
	if (state === 'dying') { c.hp.value = 0; c.wounds = 2; c.actions = 1; }
	return h('div.xns',
		h('div.xns-hero', portrait(c.name, opts.phone ? 60 : 78),
			h('div.xns-id', h('h1', c.name), h('div.l', c.line), h('div.s', c.sub)),
			h('div.xns-acts', GNS.cluster([{ icon: 'moon', text: 'Camp' }, { icon: 'arrow-up', text: 'Level up', cls: opts.levelUp ? 'xns-lvl' : '' }]))),
		// The boxes (stats, Defense, Initiative, Wounds) pack above; Hit points is the wide bar along the bottom.
		h('div.xns-band',
			h('div.xns-stats', c.stats.map(st => GNS.statBox(st))),
			h('div.xns-ai', GNS.box('Defense', String(c.armor), { title: 'Defense: Defend takes this off a hit' }), GNS.box('Initiative', sg(c.init), { roll: true, title: `Roll initiative ${sg(c.init)}` })),
			GNS.woundsBox(c.wounds, 190, c.extraWounds || 0),
			GNS.hpBar(c.hp)),
		state === 'dying' ? h('div.xns-dying', h('b', 'Dying'), h('span', '1 action at most. Attacking costs a Wound unless you pass a DC 10 STR save; damage adds 2 Wounds, 3 on a crit.')) : null,
		GNS.skills(c.skills),
		h('div.xns-turn', h('span.l', 'Actions'), GN.acts(3, c.actions, true), h('small', state === 'dying' ? '1 while Dying' : `${c.actions} left this turn`), btn({ size: 'sm', icon: 'undo', text: 'End turn' }), h('span.sep'),
			h('span.hds', h('span.hd', h('span.l', 'Speed'), h('b.ev-num', String(c.speed))), h('span.hd', h('span.l', 'Hit dice'), h('b.ev-num', `${c.hd.left}`), h('i'), h('b.ev-num', `${c.hd.max}${c.hd.die}`)))),
		GNS.classPanel(c),
		h('div.xns-conds', h('span.l', 'Conditions'), h('div.ev-chips', state === 'mana' ? chip({ name: 'Concentrating', icon: 'concentration' }) : chip({ name: 'Raging', icon: 'flame' }), h('span.ev-chip.is-add', icon('plus', 13), 'Add'))),
		h('div.x5s-tabs.xns-tabs', ['Actions', 'Abilities', 'Spells', 'Inventory 6/13', 'Notes'].map(t => h('span' + (t === (state === 'mana' ? 'Spells' : 'Actions') ? '.on' : ''), t))),
		state === 'mana' ? GNS.spells() : GNS.actionsTab(),
		state === 'mana' ? rollToast('Forked Spark', '2d8: 8, 8, 5 (exploded)', 21) : null);
};
/** Heroic reactions as cards: the name, what it costs (actions come off your next turn), the book's rule (Core 3.3 p.15). */
GNS.REACTIONS = [
	['Defend', 'shield', 1, () => ['Reduce damage from one attack by your ', term('Defense'), '. Crits ignore Defense, as may psychic damage and some areas.']],
	['Interpose', 'users', 1, () => ['When a creature within Reach 2 would be hit, take its place and become the target. It moves to a space beside you.']],
	['Help', 'hand', 1, () => ['Let an ally reroll if you can explain how you help. The GM may ask for a check. One Help per roll.']],
	['Opportunity Attack', 'swords', 1, () => ['A melee attack with ', term('disadvantage'), ' on an adjacent creature that willingly moves away.']],
];
/** The cost in a card's dark foot: the Actions bar's squares, then the words. Actions come off your next turn. */
GNS.actCost = n => h('span.xns-cost', { title: `${n} action${n > 1 ? 's' : ''}, taken from your next turn` }, Array.from({ length: n }, () => h('i')), h('span', `${n} action${n > 1 ? 's' : ''}`));
/** Reactions as playing cards: portrait, the sheet's charcoal frame, an emblem and the name on top, the rule in the
 *  middle, the cost in a dark foot like the stat boxes'. Four across when they fit, two by two when not. */
GNS.reactions = () => h('div.xns-rcards', GNS.REACTIONS.map(([n, ic, cost, text]) => h('div.xns-rcard',
	h('div.rc-top', h('span.rc-em', icon(ic, 20, 2)), h('b', n)),
	h('span.rc-orn', svg('<path d="M0 5h22M48 5h22" stroke="currentColor" stroke-width="1"/><path d="M35 0l5 5-5 5-5-5Z" fill="currentColor"/>', 70, 10)),
	h('p', text()),
	h('div.rc-foot', GNS.actCost(cost)))));
GNS.actionsTab = () => h('div.xns-tab',
	h('div.xns-grp', 'Reactions', h('small', 'on someone else’s turn · each 1/round')),
	GNS.reactions(),
	h('div.xns-grp', 'Weapons'),
	h('div.xns-row', h('b', 'Greataxe'), h('small', '2-handed · STR'), rollBtn('', '1d12 + 3'), h('small.x', '')),
	h('div.xns-row', h('b', 'Throwing axe'), h('small', 'Range 4 · STR'), rollBtn('', '1d6 + 3'), h('small.x', '')),
	h('div.xns-grp', 'Abilities'),
	h('div.xns-row', h('b', 'Rage'), h('small', '1 action · until you end it or take no damage for a turn'), btn({ size: 'sm', text: 'Use' }), h('small.x', 'Fury dice add to damage')));
GNS.spells = () => h('div.xns-tab',
	h('div.xns-grp', 'Cantrips', h('small', 'no mana')),
	h('div.xns-row', h('b', 'Cinder Flick'), h('small', '1 action · Range 8'), rollBtn('', '1d10'), h('small.x', 'crit: Smoldering')),
	h('div.xns-grp', 'Tier 1', h('small', '1 mana each')),
	h('div.xns-row.just', h('b', 'Forked Spark'), h('small', '2 actions · Range 12 · arcs for half'), rollBtn('', '2d8'), h('small.x', '1 mana spent')),
	h('div.xns-row', h('b', 'Frost Snare'), h('small', '1 action · Range 6 · Slowed'), rollBtn('', '1d6'), h('small.x', '')));
GNS.modal = () => h('div.sh-modal.g-nimble', h('div.ev-sheet-head', h('h3', 'Brakka takes a hit'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	hpPad({ who: h('span', h('b', '21'), ' / 28 → ', h('b', '12')), amount: '9', modes: ['Damage', 'Heal', 'Temp'], extra: quickActs('If Brakka says he Defends', [['Defend', '−4 armor · 1 action next turn']]), go: btn({ kind: 'primary', text: 'Apply 9' }) }));

/* ---------- NPC ---------- */
const NPCN = { name: 'Captain Ysolde Krenn', role: 'Commander of the copper-vault guard', facts: 'Dwarf · she/her · 40s', links: [['flag', 'Faction', 'The Assayers’ Guild'], ['castle', 'Found at', 'The copper vaults'], ['book', 'First met', 'Session 3']],
	status: 'alive', attitude: 'hostile', rows: [['Look', 'Scale mail gone green at the seams; a whistle on a chain.'], ['Wants', 'Nobody leaves the vaults with a single ingot.'], ['Voice', 'Short orders, never repeated.'], ['Tactics', 'Holds the door; whistles the rats in when bloodied.']], secret: 'She’s skimming the ingots herself.',
	playerRows: [['Look', 'Dwarf in green-stained armor. Whistle.'], ['Said', '"Nobody leaves with copper."'], ['Met', 'At the vault gate, session 3. Turned us away.']] };
GNS.npcExtras = () => h('div.npc-stats', h('span.npc-stat', 'Level ', h('b', '3')), h('span.npc-stat', GN.armor('medium'), ' Armor'), h('span.npc-stat', h('span', { style: { color: 'var(--g-hp)', display: 'inline-flex' } }, GN.heart(14)), h('b', '33')), h('span.npc-ref', icon('book', 13), 'nimble: Vault Captain'), btn({ size: 'sm', icon: 'swords', text: 'Add to fight' }));

/* ---------- Blocks ---------- */
/** The books' block: a box with cut corners, the name in heavy italic small caps, the level beside it,
 *  icons on the right (HP in a red heart, the armor shield, speed), passives in a khaki ribbon that pokes out of the box. */
GNS.icons = (hp, armor, extra) => h('div.xnb-ic',
	h('span.hp', { title: 'Hit points' }, GN.heart(16), h('b.ev-num', String(hp))),
	armor ? GN.armor(armor) : null,
	extra || null);
GNS.ribbon = (name, text) => h('div.xnb-banner', h('b', name), ' ', text);
GNS.block = (kind = 'regular', size = 'full') => kind === 'regular'
	? h('div.xnb' + (size === 'compact' ? '.compact' : ''),
		h('div.xnb-h', h('h2', 'Bramblehound', h('small', 'Lvl 3, beast')), GNS.icons(33, 'medium', h('span.sp', { title: 'Speed 8' }, icon('footprints', 15), h('b.ev-num', '8')))),
		GNS.ribbon('Burr Coat.', ['A melee attacker who rolls a 1 takes ', h('span.x5b-r', '1d4'), '.']),
		h('div.xnb-sec', 'Choose 1'),
		h('div.xnb-or', h('p', '• ', h('b', 'Bite (2×).'), ' ', h('span.x5b-r', '1d8 + 4'), ' each. On a crit: ', term('Grappled'), '.'), h('small', 'or'), h('p', '• ', h('b', 'Maul.'), ' ', h('span.x5b-r', '2d8 + 6'), '.'), h('small', 'or'), h('p', '• ', h('b', 'Thorn Spray.'), ' ', h('span.x5b-r', '1d8 + 4'), ' (Range 6).')))
	: h('div.xnb.leg' + (size === 'compact' ? '.compact' : ''),
		h('div.xnb-h', h('div', h('div.k', 'Level 3 Solo · Large · Swamp Matron'), h('h2', 'Old Mother Grell')), GNS.icons(100, 'medium', h('span.sv', { title: 'Saves: STR advantaged, INT disadvantaged' }, 'STR', GNS.tri(true, false), ' INT', GNS.tri(true, true)))),
		GNS.ribbon('Slick Hide.', 'Grapples against her are made with disadvantage.'),
		h('div.xnb-cols',
			h('div', h('div.xnb-sec', 'Actions', h('small', 'after each hero’s turn, choose one')),
				h('p', '• ', h('b', 'Tongue Lash.'), ' Move 4, Reach 4, ', h('span.x5b-r', '1d10 + 4'), '. On damage: pulled adjacent.'),
				h('p', '• ', h('b', 'Gulp.'), ' ', h('span.x5b-r', '2d10 + 9'), ' to an adjacent creature. ', h('span.x5b-r', 'DC 11'), ' STR save or ', term('Grappled'), ' (swallowed).')),
			h('div.xnb-phases',
				h('div.xnb-phase', h('b', 'Bloodied'), h('span', 'At ', h('em', '50 HP'), ' she belches out anyone swallowed; Tongue Lash hits 2 targets.')),
				h('div.xnb-phase.ls', h('b', 'Last Stand'), h('span', 'Grell is dying! She regains ', h('em', '7 HP per hero'), ' and uses Gulp after every turn until she drops.')))));

Object.assign(DEFS.nimble, {
	sheet: {
		title: 'Character sheet', lede: 'Brakka, level 3 Berserker, in a nimble-sheet block. This pass follows the official sheet closely: the four stat boxes with notched corners and a dark band, the save marks built into each box as triangles, Defense (Core 3.3’s word for it), Initiative and Wounds as boxes with the same dark foot (Wounds a chain ending in a skull), Hit Points as a wide red bar like mana’s along the bottom, and the ten skills as one band with notched end caps. HP is red and mana is blue; the rest is the sheet’s charcoal on the books’ parchment.',
		research: { cards: [
			{ t: 'The official sheet (premade characters, Core p.20)', sw: [['#545454', 'sheet charcoal'], ['#969696', 'stat over a skill'], ['#FCFCFC', 'paper']], li: [['Stat boxes: a value area with its two bottom corners bitten by round notches, over a dark band with the stat name. A triangle sits on top of each box and another hangs under it: filled above for an advantaged save, filled below for a disadvantaged one, outlines otherwise.', S('Premade characters p.1', '#')], ['Hit Points is a shield: a peaked top with a heart on it, the max after a slash, Temp HP in the lower half, a dark foot with a point. Armor and Initiative are boxes with a dark foot. Wounds: five circles joined in a chain, a skull at the end, the label sitting in a dip in the box’s top edge.', S('Premade characters p.1', '#')], ['Skills: one charcoal band, ten white cells, the stat small and grey above the number, the name on the band below; round bites where the cells meet; notched end caps.', S('Premade characters p.1–3', '#')]] },
			{ t: 'The books’ colour', sw: [['#F0EAD8', 'parchment'], ['#D8D2BA', 'khaki banner'], ['#D02020', 'callout red'], ['#D09040', 'Heroes ochre']], li: [['Every page is a warm parchment, never white; side notes and monster passives sit on a khaki band. Spot colour is rare: red for the sheet callouts and Bloodied numbers, an ochre in the Heroes class ornaments.', S('Core p.13, 20; GMG p.33, 46; Heroes p.55', '#')], ['Names are Beaufort Pro Heavy Italic in small caps (monsters) and Beaufort Heavy (headings); everything else is Avenir Next Condensed.', S('fonts embedded in the PDFs', '#')]] },
			{ t: 'Class resources (Heroes)', li: [['Not every class has Fury dice. Dice you roll and hold: Fury (Berserker), Judgment (Oathsworn). Pools: mana (Mage, Shepherd, Songweaver, Stormshifter), Lay on Hands (Oathsworn, 5 × level). Uses per Safe Rest: Coordinated Strike, Inspiration, many 1/Safe Rest features. Charges for one fight: Thrill of the Hunt. A marked target: Hunter’s Mark.', S('Heroes pp.8, 22, 28, 32, 40', '#')]] },
			{ t: 'Critique log', li: [['<b>Pass 1 (user):</b> too stark (pure black and white), stat shields with too much empty space, green and red save arrows that float off the shields, the medium armor M off centre. Loved: the Fury dice section.', S('user review', '#')], ['<b>Pass 2 (beside the official sheet):</b> shapes now match the sheet; save triangles enlarged to the sheet’s size; the band reached the skills’ width at every device; end-cap seams fixed. Charcoal warmed to #4B4743 (the sheet’s #545454, not black); the Actions bar moved to the khaki banner so only the sheet’s own shapes are dark.', S('/tmp/ev-t02/compare-official-vs-study.png', '#')], ['<b>Pass 3 (alignment):</b> every number, label and icon in the band, the skills, the dice and the buttons measured in headless Chrome by pixel bounds; all within 1px. Avenir Next sits button labels 1.8px high, so Nimble’s buttons move label and icon down together.', S('measure2.mjs', '#')]] },
		], borrow: ['The sheet’s shapes, drawn not boxed: notched stat boxes, the HP shield, dark feet, the Wounds chain, the skills band', 'Save marks as triangles in the box', 'Parchment and khaki from the books', 'Beaufort-style heavy italic names (Vollkorn)'], avoid: ['Pure black on pure white', 'Colour that isn’t HP, mana or a class’s own thing', 'Save arrows detached from the stat', 'A class panel that only fits Fury dice'], direction: ['<b>The official sheet, warmed and wired up.</b> The band is the paper sheet’s band; the Actions bar, class panel and tabs add what paper can’t: the three actions, every class’s dice, pools and uses, rolls.'] },
		notes: ['<b>Colour has jobs:</b> red is HP (the heart, the number, its bar, Damage’s drop, Wounds); blue is mana; ochre marks class things (held dice, uses, a state like Raging). Everything else is charcoal on parchment.', '<b>Class panel:</b> one frame for every class: the feature’s name and rule on the left, its objects (dice, a pool, pips, a state, a target), a cluster of buttons on the right. The gallery below shows six classes in it.', '<b>Rolls explode:</b> the toast shows each die; a 1 on the primary die misses.', '<b>Reactions are listed, not asked:</b> Defend and Interpose show here as what they cost; the keypad offers them as quiet chips when you take a hit.'],
		shots: [
			{ device: 'note-laptop', title: 'Brakka', path: 'Campaigns / Brakka’s journal / Party / Brakka', cap: 'Laptop: the full sheet', sub: 'The official band, the skills band, three actions with End turn and hit dice, the Berserker panel (Fury dice, Rage, One with the Ancients).', render: () => GNS.sheet(BRAKKA), height: 1060 },
			{ device: 'note-landscape', title: 'Brakka', cap: 'iPad landscape: a hit, and Defend', sub: 'Tapping the HP bar or the keypad button opens the shared keypad, with Defend as a quiet chip.', render: () => GNS.sheet(BRAKKA), overlay: () => GNS.modal() },
			{ device: 'note-portrait', title: 'Tamsin Reed', cap: 'iPad portrait: a mage spends mana', sub: 'Tamsin’s Mage panel: mana in blue, Steel Will spent. She has 2 extra Wounds from a feature, so the sheet’s dashed circles appear under her Wounds chain (8 in all); heroes without extras don’t get the row.', render: () => GNS.sheet(TAMSIN, 'mana') },
			{ device: 'note-phone', title: 'Brakka', cap: 'Phone: Dying', sub: 'Stats across the top, then Defense, Initiative and Wounds 2 of 6, then the HP bar across the width.', render: () => GNS.sheet(BRAKKA, 'dying', { phone: true }) },
			{ device: 'pair', cap: 'One frame for every class', sub: 'Fury and Judgment dice, Lay on Hands, Hunter’s Mark, Thrill of the Hunt charges, Coordinated Strike uses, a Shepherd’s mana. Same columns, same clusters.', items: [{ el: () => h('div.g-nimble', { style: { width: '700px', background: 'var(--g-bg)', padding: '16px 20px', borderRadius: '14px' } }, GNS.classGallery()), cap: 'Class panels' }] },
		],
	},
	npc: {
		title: 'NPC card', lede: 'The shared card in Nimble’s ink: heavy italic name, the sheet’s grey. Nimble adds a level, the armor letter, HP in a heart and a link to the monster block, and Add to fight. Nimble adds nothing today; this is new.',
		research: { cards: [{ t: 'The plugin today', li: [['The core NPC card with no Nimble extras: a Nimble NPC has no stats line.', S('src/core/npc-card.ts', '../src/core/npc-card.ts')], ['Players see the same card with the secret blurred, not removed.', S('src/core/note-kinds.ts', '../src/core/note-kinds.ts')]] }, { t: 'The books', li: [['Monster blocks carry the numbers; NPCs in adventures are a name, a line of look and what they want, then a block to use.', S('GMG pp.25–34', '#')]] }], borrow: ['Level, armor letter, heart HP', 'A block to use, by name'], avoid: ['Stats or secrets for players'], direction: ['<b>The same card, Nimble’s numbers.</b>'] },
		shots: [{ device: 'pair', cap: 'GM view and player view', sub: 'The captain’s numbers and tactics for the GM; the party’s own notes for the players.', items: [{ el: () => h('div.g-nimble', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCN, { extras: GNS.npcExtras() })), cap: 'GM' }, { el: () => h('div.g-nimble', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCN, { mode: 'player' })), cap: 'Player' }] }],
	},
	block: {
		title: 'Monster blocks', lede: 'A regular monster and a legendary one, drawn like the GM’s Guide: a box with cut corners, the name in heavy italic small caps with its level beside it, HP in a red heart, the armor shield with its letter, passives on a khaki ribbon that pokes out past the box, and for legendaries the after-each-hero actions beside Bloodied and Last Stand.',
		research: { cards: [
			{ t: 'Regular monsters (GMG pp.25, 33–34)', li: [['Name and level inline; icons on the right for armor (M/H), HP and speed; defaults (no armor, speed 6) are left off.', S('GMG p.33', '#')], ['Passives in a pointed grey banner; actions as one line, "(2×)", bullet choices ending in OR, or Then: sequences.', S('GMG p.34', '#')], ['Minions: no HP, any damage kills one; one die each, no crits, miss on a 1.', S('GMG p.25', '#')]] },
			{ t: 'Legendary monsters (GMG pp.43–47)', li: [['A kicker ("Level 4 Solo Human Criminal"), the big name, icons for HP, armor and saves.', S('GMG p.45', '#')], ['"Actions: after each hero’s turn, choose one", 2–3 bullets, one may be "(1 use)"; then Bloodied at half HP and Last Stand, numbers in red.', S('GMG p.45', '#')]] },
			{ t: 'The plugin today', li: [['The renderer labels legendary actions "Legendary:" where the book says "Actions:"; armor uses the 3.x draft numbers (−10 / −20).', S('src/systems/nimble/render.ts', '../src/systems/nimble/render.ts')]] },
		], borrow: ['The khaki ribbon that pokes out of the box', 'Cut corners on the box', 'Names in heavy italic small caps, level in small caps beside', 'Filled icons: heart for HP, shield with M or H for armor', 'Actions beside Bloodied and Last Stand, numbers in red'], avoid: ['Printing default stats', 'The label "Legendary:" for the after-hero actions', 'An outline shield with a letter that floats off centre'], direction: ['<b>The book’s block, every number a roll.</b> Draft rules called out where they differ.'] },
		shots: [
			{ device: 'pair', cap: 'In a note: regular and legendary', sub: 'Bramblehound (Bite twice, or a Maul/Thorn Spray choice) and Old Mother Grell (two after-hero actions, Bloodied, Last Stand).', items: [{ el: () => h('div.g-nimble', { style: { width: '540px', background: 'var(--g-bg)', padding: '22px', borderRadius: '14px' } }, GNS.block('regular')), cap: 'Regular' }, { el: () => h('div.g-nimble', { style: { width: '540px', background: 'var(--g-bg)', padding: '22px', borderRadius: '14px' } }, GNS.block('legendary')), cap: 'Legendary' }] },
			{ device: 'hover', title: 'Q7 The bog', path: 'Campaigns / The copper vaults / Q7 The bog', cap: 'Hover card', sub: 'Hovering nimble:Old Mother Grell in a location note.', under: () => proseWith('nimble:Old Mother Grell', { title: 'Q7 The bog', text: 'Reeds close over the path behind you. Something hums under the water.', text2: 'At the centre of the bog,' }, 'waits for the heroes to come to her.'), render: () => GNS.block('legendary', 'compact') },
			{ device: 'quick', cap: 'The tracker’s quick look', sub: 'Tapping a legendary monster in the tracker opens the same block over the panel.', tracker: () => GN.flow('mid'), sheetTitle: 'Old Mother Grell', render: () => GNS.block('legendary', 'compact') },
		],
	},
});
