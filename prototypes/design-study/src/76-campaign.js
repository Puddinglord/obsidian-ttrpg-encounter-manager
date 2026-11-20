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
	h('div.cq-banner', CQ.contours(), h('span.cq-emb', icon(l.emblem || 'castle', 22, 2))),
	h('div.cq-head',
		h('div.cq-kick', icon('castle', 13), l.kicker),
		h('h2.cq-title', l.name)),
	l.facts ? h('div.cq-facts', l.facts.map(([ic, k, v]) => CQ.fact(ic, k, v))) : null,
	l.extra ? l.extra() : null,
	CQ.sec('Who’s here'), h('div.cq-whos', l.here.map(n => CQ.who(n, { size: 26 }))),
	CQ.sec('Leads to'), h('div.cq-leads', l.leads.map(t => CQ.link(t))),
	l.secret ? h('div.cq-secret', h('span.k', icon('eye', 13), 'Secret'), h('span', l.secret)) : null);

/** Contour lines for a banner: drawn, so every game tints them. */
CQ.contours = () => svg('<g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M-10 60c60-30 110 20 170-6s100-34 160-10 120 28 180 4 110-20 160 2"/><path d="M-10 44c60-28 110 18 170-8s100-30 160-8 120 24 180 2 110-18 160 4" opacity=".7"/><path d="M-10 28c60-26 110 16 170-10s100-26 160-6 120 20 180 0 110-16 160 6" opacity=".5"/><path d="M-10 76c60-30 110 22 170-4s100-36 160-12 120 30 180 6 110-22 160 0" opacity=".7"/><ellipse cx="420" cy="40" rx="38" ry="16" opacity=".6"/><ellipse cx="420" cy="40" rx="20" ry="8" opacity=".6"/></g>', 700, 90, 'cq-contours');

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
