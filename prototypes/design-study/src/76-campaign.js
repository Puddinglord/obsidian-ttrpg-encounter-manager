/* ============================================================================
   Campaign notes in each game's look: the Campaign panel, a quest, a location
   and a session log. One set of cards for every game (the plugin's shared note
   kinds), themed by the game's tokens; each game adds what its books add
   (a Daggerheart Environment, a Pathfinder settlement line, a CoC case file).
   ========================================================================== */
const CQ = {};

/** A small portrait chip: initials on the game's tint, then the name as a link. */
CQ.who = (name, opts = {}) => h('span.cq-who' + (opts.dim ? '.is-dim' : ''), portrait(name, opts.size || 22), h('span', name));
/** A wiki link as the note shows it. */
CQ.link = t => h('span.cq-link', t);
/** A fact: icon, small label, value. */
CQ.fact = (ic, label, value) => h('div.cq-fact', icon(ic, 14), h('small', label), h('span.v', value));
/** A section heading inside a card: the game styles it (a red rule, a khaki ribbon, a typed tab…). */
CQ.sec = (t, right) => h('div.cq-sec', h('span', t), right || null);

/** The Campaign panel (left sidebar) in the game's look: the campaign, Continue, chapters, sections, open quests. */
CQ.panel = c => {
	const it = (ic, t, n, on) => h('div.cq-li' + (on ? '.on' : ''), icon(ic, 15), h('span', t), n !== undefined ? h('small', String(n)) : null);
	return h('div.cq-panel',
		h('div.cq-ptop', ['book', 'search', 'tag', 'swords'].map(n => h('span', obIcon(n, 15)))),
		h('div.cq-camp', icon(c.emblem || 'crown', 16), h('b', c.name), h('small', c.role || 'GM')),
		h('div.cq-search', obIcon('search', 14), 'Omnisearch'),
		h('button.cq-cont', icon('play', 13), h('span', 'Continue'), h('b', c.next)),
		h('div.cq-ph', 'Chapters'), c.chapters.map(([t, n], i) => it('book', t, n, false)),
		h('div.cq-ph', c.words.quests, h('small', `${c.open.filter(q => q[1] === 'active').length} open`)),
		c.open.map(([t, st, on]) => h('div.cq-li.cq-q' + (on ? '.on' : ''), h('i.cq-dot.is-' + st), h('span', t))),
		h('div.cq-ph', 'Campaign'), c.sections.map(([ic, t, n]) => it(ic, t, n)));
};

/** A status as the game stamps it: Active, Done, Failed (CoC: Open, Closed, Cold). */
CQ.stamp = (st, text) => h('span.cq-stamp.is-' + st, text);

/** A quest: kicker, title, status; who gave it, where, the reward; the game's own line; objectives; the GM's secret. */
CQ.quest = q => h('div.cq-card.cq-quest',
	h('div.cq-head',
		h('div.cq-kick', icon(q.kickIcon || 'flag', 13), q.kicker),
		h('h2.cq-title', q.title),
		CQ.stamp(q.status, q.statusText)),
	h('div.cq-facts',
		h('div.cq-fact', icon('users', 14), h('small', q.giverLabel || 'Given by'), CQ.who(q.giver)),
		CQ.fact('castle', 'Where', CQ.link(q.where)),
		CQ.fact(q.rewardIcon || 'sparkle', q.rewardLabel || 'Reward', q.reward)),
	q.extra ? q.extra() : null,
	CQ.sec(q.objLabel || 'Objectives', h('small', `${q.objectives.filter(o => o[1]).length} of ${q.objectives.length}`)),
	h('ul.cq-objs', q.objectives.map(([t, done]) => h('li' + (done ? '.done' : ''), h('i.cq-box', done ? icon('check', 12, 3) : null), h('span', t)))),
	q.secret ? h('div.cq-secret', h('span.k', icon('eye', 13), 'Secret'), h('span', q.secret)) : null);

/** A location: a banner (the game's map texture and emblem), kicker, name, facts, the game's own block, who's here, where it leads. */
CQ.place = l => h('div.cq-card.cq-place',
	h('div.cq-banner', CQ.map(), h('span.cq-emb', icon(l.emblem || 'castle', 22, 2))),
	h('div.cq-head',
		h('div.cq-kick', icon('castle', 13), l.kicker),
		h('h2.cq-title', l.name)),
	l.facts ? h('div.cq-facts', l.facts.map(([ic, k, v]) => CQ.fact(ic, k, v))) : null,
	l.extra ? l.extra() : null,
	CQ.sec('Who’s here'), h('div.cq-whos', l.here.map(n => CQ.who(n, { size: 26 }))),
	CQ.sec('Leads to'), h('div.cq-leads', l.leads.map(t => CQ.link(t))),
	l.secret ? h('div.cq-secret', h('span.k', icon('eye', 13), 'Secret'), h('span', l.secret)) : null);

/**
 * A banner's map, as the plugin draws it (src/core/campaign-cards.ts, hexMap): flat-topped hexes fading in past
 * the emblem, and a faint engraved compass rose a fixed distance in from the right edge. Drawn in CSS pixels
 * (no viewBox) so nothing scales with the card's width; ids are numbered so two cards keep their own masks.
 */
CQ.mapSeq = 0;
CQ.map = () => {
	const n = ++CQ.mapSeq, ref = k => `cq-${k}-${n}`, num = v => String(Math.round(v * 100) / 100);
	const R = 13, ROW = 22.5, at = 'transform="translate(-62 5)"';
	const RO = { ring: 21.5, band: 19, outer: 23.5, card: 31, cardW: 3.5, ord: 19, ordW: 2.6 };
	const turn = (x, y, a) => `${num(x * Math.cos(a) - y * Math.sin(a))} ${num(x * Math.sin(a) + y * Math.cos(a))}`;
	const anchor = inner => `<svg x="100%" y="50%" overflow="visible"><g ${at}>${inner}</g></svg>`;
	let hex = '';
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 2; j++) {
		for (const [cx, cy] of [[3 * R * i, ROW * (j + 0.25)], [3 * R * i + 1.5 * R, ROW * (j + 0.75)]]) {
			hex += `M${num(cx - R / 2)} ${num(cy - ROW / 2)}H${num(cx + R / 2)}L${num(cx + R)} ${num(cy)}L${num(cx + R / 2)} ${num(cy + ROW / 2)}`;
		}
	}
	const stops = list => list.map(([o, a]) => `<stop offset="${o}" stop-color="#000" stop-opacity="${a}"/>`).join('');
	let star = '';
	for (let k = 0; k < 4; k++) star += `${k ? 'L' : 'M'}${turn(-RO.cardW, -RO.cardW, k * Math.PI / 2)}L${turn(0, -RO.card, k * Math.PI / 2)}`;
	let ticks = '';
	for (let k = 0; k < 32; k++) if (k % 8) ticks += `M${turn(0, -RO.band, k * Math.PI / 16)}L${turn(0, -RO.ring, k * Math.PI / 16)}`;
	let points = '';
	for (const [t, w, off] of [[RO.ord, RO.ordW, Math.PI / 4], [RO.card, RO.cardW, 0]]) {
		for (let k = 0; k < 4; k++) {
			const a = off + k * Math.PI / 2;
			points += `<path class="cq-paper" d="M0 0L${turn(-w, -w, a)}L${turn(0, -t, a)}Z"/><path class="cq-shade" fill="currentColor" d="M0 0L${turn(0, -t, a)}L${turn(w, -w, a)}Z"/>`;
		}
	}
	const s = document.createElementNS(svgNS, 'svg');
	s.setAttribute('class', 'cq-map');
	s.setAttribute('aria-hidden', 'true');
	s.innerHTML = `<defs>
		<pattern id="${ref('hex')}" width="${3 * R}" height="${2 * ROW}" y="${num(-ROW / 4)}" patternUnits="userSpaceOnUse"><path d="${hex}" fill="none" stroke="currentColor" stroke-width="0.6"/></pattern>
		<linearGradient id="${ref('left')}">${stops([[0, 1], [0.3, 0.92], [0.65, 0.35], [1, 0]])}</linearGradient>
		<linearGradient id="${ref('edges')}" x2="0" y2="1">${stops([[0, 0.3], [0.22, 0], [0.78, 0], [1, 0.3]])}</linearGradient>
		<radialGradient id="${ref('clear')}">${stops([[0, 0.45], [0.5, 0.3], [1, 0]])}</radialGradient>
		<mask id="${ref('fade')}" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
			<rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="100%" fill="url(#${ref('edges')})"/><rect width="260" height="100%" fill="url(#${ref('left')})"/>
			${anchor(`<circle r="70" fill="url(#${ref('clear')})"/><g class="cq-halo" fill="#000" stroke="#000" stroke-width="4" stroke-linejoin="round"><circle r="${RO.outer}"/><path d="${star}Z"/><rect x="-3.5" y="${num(-RO.card - 9.6)}" width="7" height="7"/></g>`)}
		</mask></defs>
		<g class="cq-grid" mask="url(#${ref('fade')})">${anchor(`<rect x="-3000" y="-150" width="3200" height="300" fill="url(#${ref('hex')})"/>`)}</g>
		${anchor(`<g class="cq-rose" fill="none" stroke="currentColor" stroke-width="0.55" stroke-linejoin="round">
			<circle r="${RO.outer}" stroke-width="0.4"/><circle r="${RO.ring}"/><circle r="${RO.band}"/><path d="${ticks}" stroke-width="0.45"/>
			${points}<circle class="cq-paper" r="1.5"/><text class="cq-rose-n" y="${num(-RO.card - 2.6)}" text-anchor="middle" fill="currentColor" stroke="none">N</text></g>`)}`;
	return s;
};

/** A session log: number and date, who was there, what happened, the quests it moved, loot, and what's next. */
CQ.session = s => h('div.cq-card.cq-session',
	h('div.cq-head',
		h('div.cq-kick', icon('book', 13), s.kicker),
		h('h2.cq-title', s.title)),
	h('div.cq-at', h('small', s.atLabel || 'At the table'), h('div.cq-whos', s.party.map(n => CQ.who(n, { size: 26 })))),
	s.extra ? s.extra() : null,
	CQ.sec(s.recapLabel || 'What happened'), h('ul.cq-recap', s.recap.map(t => h('li', t))),
	CQ.sec(s.threadsLabel || 'Quests'), h('div.cq-threads', s.threads.map(([t, change, st]) => h('div.cq-thread', CQ.link(t), h('span.cq-change.is-' + st, change)))),
	s.loot ? [CQ.sec(s.lootLabel || 'Loot'), h('div.cq-loot', s.loot.map(t => h('span', t)))] : null,
	s.nextUp ? h('div.cq-next', h('b', s.nextLabel || 'Next time'), h('span', s.nextUp)) : null);

/** A note page: the card at the top (where the plugin's block sits), then the note's own text. */
CQ.page = (card, prose) => [card, h('div.sh-prose.cq-prose', prose.map(p => typeof p === 'string' ? h('p', p) : p))];
/** Prose helpers: a heading, a paragraph with links ([[like this]]). */
CQ.h2 = t => h('h2', t);
CQ.p = t => h('p', String(t).split(/(\[\[[^\]]+\]\])/).map(x => x.startsWith('[[') ? h('span.sh-link', x.slice(2, -2)) : x));

/** A laptop with the Campaign panel open on the left, in the game's look, and the note on the right. */
function campLaptop({ game, title, path, panel, content, h: ht = 900 }) {
	const view = h('div.ev-view.g-' + game + '.sh-note', h('div.sh-note-in', content));
	return h('div.dev.is-window', { style: { width: '1440px', height: ht + 'px' } },
		h('div.dev-bar', h('span.dev-lights', h('i'), h('i'), h('i')), h('span.dev-tab.on', obIcon('book', 13), title)),
		h('div.dev-body', h('div.dev-ribbon', obIcons()), h('div.cq-left.ev-view.g-' + game, panel), h('div.dev-main', crumbs(path), view)));
}
mainShot = (orig => (def, m) => {
	if (m.device !== 'camp-laptop') return orig(def, m);
	return devShot(campLaptop({ game: def.id, title: m.title, path: m.path, panel: m.panel(), content: m.render(), h: m.height || 900 }), 1440, m.cap, m.sub);
})(mainShot);

/** The campaign tab for one game: research, then the panel with a quest, a location on an iPad, a session on a phone. */
CQ.section = (game, d) => ({
	title: 'Campaign notes', lede: d.lede,
	research: d.research,
	notes: d.notes,
	shots: [
		{ device: 'camp-laptop', title: d.quest.title, path: d.quest.path, cap: `Laptop: the Campaign panel and a ${d.campaign.words.quest.toLowerCase()}`, sub: d.questSub, panel: () => CQ.panel(d.campaign), render: () => CQ.page(CQ.quest(d.quest), d.quest.prose) },
		{ device: 'note-portrait', title: d.place.name, cap: 'iPad portrait: a location', sub: d.placeSub, render: () => CQ.page(CQ.place(d.place), d.place.prose) },
		{ device: 'note-phone', title: d.session.title, cap: 'Phone: a session log', sub: d.sessionSub, render: () => CQ.page(CQ.session(d.session), d.session.prose || []) },
	],
});
