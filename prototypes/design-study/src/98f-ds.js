/* ============================================================================
   The iPad review pass (design-system lead): decisions, the one layout, clusters,
   the ticker, footers, icons and the alignment pass, at the top of the Shared page.
   ========================================================================== */

/* ---------- The one layout, drawn in the neutral base ---------- */
function cqRow({ name, init, hp, max, state = '', side, note }) {
	return h('div.cq-r' + (state === 'acted' ? '.is-acted' : ''), mark(state),
		init !== undefined ? h('span.cq-i.ev-num', String(init)) : null,
		h('span.cq-n', h('b', name), note ? h('small', note) : null),
		side ? h('span.cq-side', side) : null,
		h('span.cq-hp.ev-num', h('b', String(hp)), h('small', ` /${max}`)));
}
function cqCard({ kicker, name, meta, hp, max, chipsList }) {
	return h('div.cq-card',
		h('div.cq-k', kicker),
		h('div.cq-name', name), h('div.cq-meta', meta),
		h('div.cq-vit', h('span.cq-ac', { title: 'Armor Class' }, ICON('gi-shield', 34), h('b.ev-num', '15')), h('div.cq-hpbig.ev-num', h('b', String(hp)), h('small', ` / ${max}`)), bar({ value: hp, max })),
		chips(chipsList),
		clusters(cluster([btn({ text: 'Damage', icon: 'minus' }), btn({ text: 'Heal', icon: 'plus' })]), cluster([btn({ kind: 'icon', icon: 'tag', title: 'Add condition' }), btn({ kind: 'icon', icon: 'book', title: 'Stat block' })], { fixed: true })));
}
function cqPanel(strict) {
	const kids = strict ? [
		ticker({ round: 2, turn: 'Goblin Boss’s turn', note: '2 of 6 acted' }),
		cqCard({ kicker: 'Now · initiative 15', name: 'Goblin Boss', meta: 'Small fey · CR 1', hp: 15, max: 21, chipsList: [{ name: 'Paralyzed', trigger: 'save', rounds: 3 }] }),
		sec('Still to act', 'initiative order'),
		h('div.cq-q', cqRow({ name: 'Corin', init: 14, hp: 8, max: 38, state: 'next', note: 'Next' }), cqRow({ name: 'Goblins', init: 12, hp: 7, max: 7, note: '2 of 3 up' }), cqRow({ name: 'Mara', init: 8, hp: 27, max: 33 })),
		sec('Acted', '2', { acted: true }),
		h('div.cq-q', cqRow({ name: 'Ilse', init: 19, hp: 22, max: 31, state: 'acted' }), cqRow({ name: 'Bog Hag', init: 17, hp: 64, max: 112, state: 'acted' })),
	] : [
		ticker({ round: 2, turn: 'Heroes’ turn', note: '1 of 3 heroes done' }),
		cqCard({ kicker: 'Now · any hero may go', name: 'Brakka', meta: 'Berserker 4', hp: 31, max: 40, chipsList: [{ name: 'Raging', trigger: 'damage' }] }),
		sec('Heroes · still to act', 'any order'),
		h('div.cq-q', cqRow({ name: 'Orren', hp: 18, max: 26 }), cqRow({ name: 'Wren', hp: 22, max: 22 })),
		sec('Heroes · acted', '1', { acted: true }),
		h('div.cq-q', cqRow({ name: 'Tamsin', hp: 12, max: 24, state: 'acted' })),
		sec('Monsters · waiting', 'their side next'),
		h('div.cq-q', cqRow({ name: 'Alchemist', hp: 58, max: 80, note: 'after each hero' }), cqRow({ name: 'Rat swarm', hp: 9, max: 9 })),
	];
	const f = frame({ game: 'base', children: kids, foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: strict ? 'Next: Corin' : 'Done · next hero' })), height: 760 });
	return f;
}

/* ---------- Icons ---------- */
function lineSvg(inner, size) {
	const s = document.createElementNS(svgNS, 'svg');
	s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
	s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
	s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
	s.innerHTML = inner; return s;
}
function fillSvg(inner, size, vb = 256) {
	const s = document.createElementNS(svgNS, 'svg');
	s.setAttribute('viewBox', `0 0 ${vb} ${vb}`); s.setAttribute('width', size); s.setAttribute('height', size);
	s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
	s.innerHTML = inner; return s;
}
const ICON_COLS = [
	['Lucide', 'today, Obsidian’s own', (p, z) => lineSvg(ICON_COMPARE.lu[p], z)],
	['Tabler', 'outline', (p, z) => lineSvg(ICON_COMPARE.tb[p], z)],
	['Phosphor', 'regular', (p, z) => fillSvg(ICON_COMPARE.ph.regular[p], z)],
	['Phosphor', 'bold · recommended', (p, z) => fillSvg(ICON_COMPARE.ph.bold[p], z), true],
	['Phosphor', 'fill', (p, z) => fillSvg(ICON_COMPARE.ph.fill[p], z)],
	['Phosphor', 'duotone', (p, z) => fillSvg(ICON_COMPARE.ph.duotone[p], z)],
	['game-icons', 'in-world glyphs', (p, z, gi) => gi ? fillSvg(ICON_WORLD[gi][0], z, 512) : h('span', { style: { color: 'var(--p-text-3)' } }, '—')],
];
function iconTable() {
	return h('div.ic-scroll', h('table.ic-table',
		h('thead', h('tr', h('th', ''), ICON_COLS.map(([n, w, , rec]) => h('th' + (rec ? '.is-rec' : ''), n, h('br'), h('small', { style: { fontWeight: 400 } }, w))))),
		h('tbody', ICON_COMPARE.rows.map(([label, p, gi]) => h('tr', h('td', label), ICON_COLS.map(([, , draw, rec]) => h('td' + (rec ? '.is-rec' : ''), draw(p, 24, gi))))))));
}
/** The card's action row, drawn with each set at its real size. */
function iconActionRows() {
	const sets = [
		['Lucide, 2px', 'Obsidian’s set at its default weight', p => lineSvg(ICON_COMPARE.lu[p], 18)],
		['Tabler, 2px', 'Close to Lucide; more icons', p => lineSvg(ICON_COMPARE.tb[p], 18)],
		['Phosphor regular', 'Thinner than Bold; quiet', p => fillSvg(ICON_COMPARE.ph.regular[p], 18)],
		['Phosphor bold', 'Reads at arm’s length on an iPad', p => fillSvg(ICON_COMPARE.ph.bold[p], 18)],
	];
	const b = (svgEl, text, title) => h('button.ev-btn' + (text ? '' : '.is-icon'), { title, 'aria-label': title }, svgEl, text ? h('span', text) : null);
	return h('div', sets.map(([n, d, draw]) => h('div.ic-row', h('span', h('b', n), d),
		h('div.spec-stage.g-5e', { style: { padding: '10px 12px', minHeight: 0, maxWidth: '360px' } }, clusters(
			cluster([b(draw('drop'), 'Damage'), b(draw('first-aid'), 'Heal')]),
			cluster([b(draw('tag'), '', 'Add condition'), b(draw('book-open'), '', 'Stat block')], { fixed: true }))))));
}
function giGallery() {
	const games = ['5e', 'nimble', 'coc', 'dh', 'pf'];
	const pick = ['gi-shield', 'gi-save', 'gi-temp', 'gi-wound', 'gi-heal', 'gi-poison', 'gi-flame', 'gi-skull', 'gi-boss', 'gi-crown', 'gi-swords', 'gi-d20', 'gi-hourglass', 'gi-brain', 'gi-sleep', 'gi-chains', 'gi-lair', 'gi-tentacle', 'gi-pistol', 'gi-sun', 'gi-fear', 'gi-spellbook'];
	return h('div', { style: { display: 'grid', gap: '14px' } },
		h('div.ic-gi', pick.map(k => h('div', { style: { background: 'var(--p-surface)', border: '1px solid var(--p-line)', '--g-text-2': 'var(--p-text-2)' } }, fillSvg(ICON_WORLD[k][0], 32, 512), h('code', k), h('small', `${ICON_WORLD[k][1]} · CC BY 3.0`)))),
		h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } }, games.map(g => h('div.g-' + g, { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'var(--g-bg)', color: 'var(--g-accent-text)', border: '1px solid var(--p-line)' } },
			['gi-shield', 'gi-flame', 'gi-poison', 'gi-skull', 'gi-crown'].map(k => ICON(k, 26)), h('small', { style: { color: 'var(--g-text-2)', fontSize: '12px', fontFamily: 'var(--g-font-ui)' } }, DEFS[g] ? DEFS[g].name : g)))));
}
function iconBytes() {
	const uniq = Object.values(ICON_UI).filter(v => v[0] !== '@');
	const avg = Math.round(uniq.reduce((a, v) => a + v.length, 0) / uniq.length);
	const gw = Object.values(ICON_WORLD).map(v => v[0].length);
	return { n: uniq.length, avg, kb: Math.round(uniq.reduce((a, v) => a + v.length, 0) / 1024), gAvg: Math.round(gw.reduce((a, v) => a + v, 0) / gw.length), gN: gw.length };
}
function iconsSection() {
	const sz = iconBytes();
	return [
		h('h2.sec', { id: 'ds-icons' }, 'Icons'),
		h('p.kicker', 'The same tracker and sheet icons in each candidate set, drawn from the packs’ published SVGs. The page’s icon switch (top right) redraws every panel in the study with Phosphor or with Lucide, so you can compare them in place.'),
		iconTable(),
		h('h3.sub', 'At real size, on a card'),
		h('p.kicker', 'The 5e card’s action row in each set at 18px. The thin sets are what the review called “too thin” for the tag and the book.'),
		iconActionRows(),
		h('h3.sub', 'In-world glyphs (game-icons.net)'),
		h('p.kicker', 'Filled silhouettes for things that are part of the fiction: armor, conditions, damage types, the lair, the boss. Each game tints them with its own accent; under the gallery, the same five glyphs in each game’s colours. They read well at 20px and up and get muddy below 16px, so they’re for badges and chips, not for buttons.'),
		giGallery(),
		h('h3.sub', 'Licences, and what bundling each one needs'),
		h('table.lic', h('thead', h('tr', h('th', 'Pack'), h('th', 'Licence'), h('th', 'To bundle it in the plugin'), h('th', 'Fit'))), h('tbody',
			h('tr', h('td', 'Phosphor'), h('td', 'MIT, © 2023 Phosphor Icons'), h('td', 'Copy the MIT notice into NOTICE.md (and keep it in main.js’s licence comment). Inline only the paths we use: ', `${sz.n} icons here, about ${sz.avg} bytes each, ${sz.kb} KB in all.`), h('td', '1,500+ icons in six weights (thin to bold, fill, duotone). Has Drop, FirstAid, Tag, BookOpen, Shield, ShieldPlus, ShieldCheck, Sword, Skull, Brain, Flask.')),
			h('tr', h('td', 'Tabler'), h('td', 'MIT, © Paweł Kuna'), h('td', 'Same as Phosphor: the MIT notice in NOTICE.md.'), h('td', '5,900+ outline icons at a 2px stroke, ~1,000 filled. Close to Lucide; a medical cross but no first-aid box.')),
			h('tr', h('td', 'Lucide'), h('td', 'ISC (parts MIT, from Feather)'), h('td', 'Nothing: Obsidian ships it, and setIcon(el, name) draws it. Bundling a newer copy needs the ISC notice.'), h('td', 'The most native: Obsidian’s own chrome. One weight (a 2px stroke); Obsidian’s copy can lag the newest icons. No first-aid cross (only “cross”, “hospital”).')),
			h('tr', h('td', 'game-icons.net'), h('td', 'CC BY 3.0 (a few CC0)'), h('td', 'Credit every author whose glyph we ship (Lorc, Delapouite, Sbed, John Colburn…) with a link to the licence, in NOTICE.md and the plugin’s About text; say we changed the colours. ', `${sz.gN} glyphs here, about ${Math.round(sz.gAvg / 100) / 10} KB each.`), h('td', '4,000+ RPG glyphs (shields, swords, dice, skulls, potions, tentacles). Filled, detailed, 512 grid. Not a UI set: no chevrons, undo or menus.')))),
		h('div.card', { style: { marginTop: '24px', maxWidth: '980px' } },
			h('h3.sub', { style: { marginTop: 0 } }, 'Recommendation: Phosphor Bold for the UI, game-icons.net for the world'),
			h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', h('b', 'Phosphor Bold is the one UI set, in every game. '), 'Buttons, rows, prompts and sheets. Its bold weight is what made the tag and the book readable on the iPad, and it has the icons the review asked for: a blood drop for Damage and a first-aid cross for Heal. Fill is for an “on” state (a toggled reaction, a chosen pick); one weight per row, never mixed.'),
				h('li', h('b', 'game-icons.net glyphs are each game’s flavour. '), 'Armor shields, condition badges, damage types, the lair and the boss mark, tinted by the game’s tokens (--g-gi), at 20px and up. This is where a game feels special; the controls stay the same so a GM switching games isn’t lost.'),
				h('li', h('b', 'Obsidian’s chrome stays Lucide. '), 'The ribbon icon, view headers, commands and settings go through setIcon(), as Obsidian draws them. The study’s Obsidian frames already do (obIcon()).'),
				h('li', h('b', 'Cost. '), 'Two notices in NOTICE.md (MIT for Phosphor; CC BY 3.0 with each author’s name for game-icons), and about ', `${sz.kb} KB`, ' of inlined paths for the UI set.'),
				h('li', h('b', 'If nativeness wins instead: '), 'Lucide through setIcon() at a heavier stroke (2.25) costs nothing to ship, but has no first-aid cross and its tag and book stay hairline at 16px.'))),
	];
}

/* ---------- Clusters, ticker and footer specimens ---------- */
function clusterSpecimens() {
	const st = (label, el, w) => h('div.state', h('span', label), h('div.spec-stage.g-base', { style: w ? { width: w + 'px', maxWidth: '100%' } : null }, el));
	return h('div.grid3',
		st('Turn prompt: a roll, then the answer for physical dice', promptCard({ ic: 'dice', title: h('span', 'Goblin, ', h('em', 'Frightened')), text: 'Wisdom save DC 13 at the end of its turn ends it.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll save (+0)' }), btn({ size: 'sm', icon: 'check', text: 'Passed' }), btn({ size: 'sm', icon: 'x', text: 'Failed' })] }), 336),
		st('A pick-one choice is one joined cluster', promptCard({ ic: 'crown', title: 'The Alchemist acts', text: 'Choose one:', acts: [btn({ size: 'sm', text: 'Spray', sub: '2d6' }), btn({ size: 'sm', text: 'Transmute' }), btn({ size: 'sm', text: 'Retreat' })] }), 336),
		st('Quiet trailing actions sit right', promptCard({ ic: 'heart-crack', title: h('span', 'Corin is ', h('em', 'dying')), text: 'Start of his turn: a death save.', acts: [btn({ kind: 'primary', size: 'sm', icon: 'dice', text: 'Roll death save' }), btn({ size: 'sm', text: 'Later' })] }), 336),
		st('Card actions: two clusters', clusters(cluster([btn({ text: 'Damage', icon: 'minus' }), btn({ text: 'Heal', icon: 'plus' })]), cluster([btn({ kind: 'icon', icon: 'tag', title: 'Add condition' }), btn({ kind: 'icon', icon: 'book', title: 'Stat block' })], { fixed: true })), 336),
		st('Ticker', h('div', { style: { margin: '-16px', display: 'grid', gap: '10px' } }, ticker({ round: 3, turn: 'Lair action', note: '0 of 7 acted' }), ticker({ round: 12, turn: 'Prof. Amos Wray’s turn, a very long name that truncates', note: '5 of 6 acted' }), ticker({ round: 'Before the fight', note: '3 of 6 rolled' })), 336),
		st('Footer, wide: Back and the main button on the right', h('div', { style: { margin: '-16px' } }, h('div.mt-foot', h('div.keys', h('span', h('kbd', 'N'), 'next'), h('span', h('kbd', 'Z'), 'back')), btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Next: Corin' }))), 560));
}

/* ---------- Alignment: the pass's numbers (measured in headless Chrome, see the Appendix) ---------- */
const ALIGN_RESULTS = [
	['.ev-btn, .ev-chip, .ev-prompt-head', 'Icons centred on the font’s box, not its capitals: high in Crimson Pro and Barlow, low in Overpass and Avenir Next', 'up to 2.1px', '≤ 1px', '--g-icon-dy per game face, (ascent − descent − cap height) / 2'],
	['ICON() glyphs', 'Ink off the middle of its box: the book 1.1px low in the 36px button (“sits up and to the left” in Lucide, low in Phosphor), the tag 0.8px down-right, chevrons 0.6px, the crown 0.8px high', '1.1px', '0', 'Optical-centring table (ICON_NUDGE) measured with getBBox; drops, play and shields keep their drawn weight'],
	['.ev-pick .ic', 'Picker icons sat left in their 22px column and high on the text line', '2px, 3.3px', '0', 'The cell is a 22px grid that centres its icon'],
	['.sh-toast', 'The dice sat on the middle of a line made tall by the big total', '5.1px', '≤ 1px', 'Baseline-aligned, then lowered to the capitals'],
	['.ev-pad-keys, .ev-segs, .ev-pad-mode', 'Digits and labels alone in fixed boxes rode high or low with the face', '2.1px', '≤ 1px', '--g-num-dy / --g-icon-dy taken out of the padding, so boxes keep their size'],
	['.rib-sep (round marker)', 'The round label was lifted 8px over the ribbon’s edge and clipped', 'clipped', 'inline', 'A label beside a rule inside the ribbon; the ticker carries the round elsewhere'],
	['.ev-chip save trigger', 'A die for “a save each turn”, the same as rolls', '—', '—', 'Shield-check (save); Burning keeps the flame'],
];

sharedPage = (orig => () => {
	const page = orig();
	const top = h('div',
		h('h2.sec', { style: { marginTop: 0 } }, 'After the iPad review'),
		h('p.kicker', 'What changed in the shared design system, and the rules each game now follows.'),
		h('div.toc', [['#ds-layout', 'The one layout'], ['#ds-clusters', 'Clusters and the ticker'], ['#ds-icons', 'Icons'], ['#ds-align', 'Alignment']].map(([href, t]) => h('a', { href: 'javascript:void 0', onclick: () => document.getElementById(href.slice(1)).scrollIntoView() }, t))),
		h('div.ds-new',
			h('div', h('b', 'Card and queue, in every game'), 'The current participant’s card on top, the queue underneath. The other layout concepts are kept as history, folded.'),
			h('div', h('b', 'Clusters, not wrapping rows'), 'Buttons that belong together form a cluster; a cluster that doesn’t fit moves down whole. Passed / Failed is its own cluster, for tables that roll real dice.'),
			h('div', h('b', 'A ticker for round and turn'), 'A muted strip above the card: “Round 3 · Goblin Boss’s turn · 2 of 6 acted”. One line; it never overlaps anything.'),
			h('div', h('b', 'Footers on the right'), 'Back and the main button sit at the right edge at every width; on narrow panels the main button fills the row.'),
			h('div', h('b', 'Short labels'), '“Roll save (+1)”, not “Roll the save (+1)”. No articles on buttons.'),
			h('div', h('b', 'Phosphor Bold icons'), 'A blood drop for Damage, a first-aid cross for Heal, a heavier tag and book. In-world glyphs from game-icons.net, tinted per game.')),
		h('h2.sec', { id: 'ds-layout' }, 'The one layout: card and queue'),
		h('p.kicker', 'Every game, every width. The ticker says where the fight is; the card is whoever acts now (a creature, a hero, an adversary or a moment); the queue is everyone else, split by side and by acted or not. A game decides only whether its queue is strict or free.'),
		h('div', { style: { display: 'flex', gap: '40px', flexWrap: 'wrap', alignItems: 'flex-start' } },
			h('div', cqPanel(true), h('div.view-cap', h('b', 'Strict queue: 5e, PF2e, Call of Cthulhu'), 'Initiative (or DEX) order. Next goes to the first still to act; tapping anyone else makes them active without reshuffling.')),
			h('div', cqPanel(false), h('div.view-cap', h('b', 'Free queue: Nimble, Daggerheart'), 'Split by side, any order within it. Next asks who goes, or hands the turn to the other side.')),
			h('ul.prose', { style: { paddingLeft: '18px', flex: '1 1 300px', margin: 0 } },
				h('li', h('b', 'Ticker. '), 'Round and turn, muted, one line, above the card. It replaces round badges in headers, which were squeezed and clipped.'),
				h('li', h('b', 'Card. '), 'Name, defense, HP, conditions, then the actions as two clusters: Damage and Heal; Add condition and the stat block.'),
				h('li', h('b', 'Queue. '), 'Still to act (with Next marked), then Acted (grey, checked). Sides get their own headings; the side that’s waiting sits last.'),
				h('li', h('b', 'Wider panes. '), 'In a main tab the queue moves beside the card; it’s the same two parts, not another layout.'),
				h('li', h('b', 'Footer. '), 'Back and the main button, on the right.'))),
		h('h2.sec', { id: 'ds-clusters' }, 'Clusters and the ticker'),
		h('p.kicker', 'The shared parts behind the rules above, in the neutral base. Markup and helpers: cluster(), clusters(), ticker() in 35-ui.js; ICON() in 29-icons.js.'),
		clusterSpecimens(),
		h('pre', { style: { marginTop: '20px' } }, `<div class="ev-clusters">
  <div class="ev-cluster" role="group">            <!-- stretches to fill its line -->
    <button class="ev-btn is-primary">Roll save (+1)</button>
  </div>
  <div class="ev-cluster is-joined" role="group" aria-label="Rolled at the table">
    <button class="ev-btn">Passed</button><button class="ev-btn">Failed</button>
  </div>
  <div class="ev-cluster is-end" role="group">      <!-- quiet, pushed right, never stretched -->
    <button class="ev-btn">Later</button>
  </div>
</div>

<div class="ev-ticker" role="status">
  <span class="ev-ticker-round">Round <b>3</b></span>
  <span class="ev-ticker-turn">Goblin Boss’s turn</span>
  <span class="ev-ticker-note">2 of 6 acted</span>
</div>`),
		iconsSection(),
		h('h2.sec', { id: 'ds-align' }, 'Alignment'),
		h('p.kicker', 'Every shared pill, chip and button measured in headless Chrome the way the plugin’s e2e/align.mjs does: the icon’s drawn shape against the capitals of its label, and an icon-only button’s shape against the button’s centre. Tolerance 1px.'),
		alignTable());
	page.prepend(top);
	return page;
})(sharedPage);

function alignTable() {
	if (!ALIGN_RESULTS.length) return h('p.note', 'Measured after this pass: see the Appendix.');
	return h('table.t.al-table', h('thead', h('tr', h('th', 'Component'), h('th', 'Problem found'), h('th', 'Before'), h('th', 'After'), h('th', 'Fix'))),
		h('tbody', ALIGN_RESULTS.map(([c, p, b, a, f]) => h('tr', h('td', h('code', c)), h('td', p), h('td.bad', b), h('td.ok', a), h('td', f)))));
}

CRITIQUE.push(['Pass 7 · the iPad review: shared parts (design-system lead), light and dark, 1180 and 820', [
	'Button rows wrapped into ragged second lines (the turn prompt, legendary choices). Prompts and moments now take clusters: a roll, the answer (Passed | Failed, joined, for physical dice), choices, and quiet trailing actions on the right. A cluster that doesn’t fit moves down whole and stretches to fill its line.',
	'Labels lost their articles: “Roll save (+1)”. btn() drops a leading “the/a/an” after the verb, so every game gets it.',
	'The round badge was squeezed into the header and its colours sat too close to the panel. The ticker replaces it: a muted strip above the card, text measured at 5.1:1 or better in every game and theme, one line, truncating the turn before it would overlap.',
	'iPad portrait: the main tab’s footer put Back and Next at the left once the key hints hid. Footers are right-aligned at every width; checked every bottom bar at 1440, 1180, 820 and 390 in all five games (foot.mjs).',
	'Card and queue is the decision for every game. The 5e and Nimble layout concepts are folded into a “History” block with the decision stated; galleries are titled as moments of one design and lost their “Recommended” tags.',
	'Icons: Phosphor Bold replaces the hairline Lucide set in every panel (the top bar switches back to compare). Damage is a blood drop and Heal a first-aid cross on every card; the tag and the book are the heavier Phosphor glyphs. Obsidian’s chrome in the mocks stays Lucide (obIcon).',
	'Alignment, measured in headless Chrome like the plugin’s e2e/align.mjs (capitals for text, getBBox ink for icons): shared parts were off by up to 2.1px (buttons, chips, prompt heads), 3.3px (picker icons) and 5.1px (the roll toast); after, none is over 1px except where a game swaps the face of a shared part (listed below for each game).',
	'Contrast of the new ticker and the neutral-base specimens re-measured in both themes: every text role passes 4.5:1.',
]]);
CRITIQUE.push(['Open alignment items in the game files (for each game’s owner)', [
	'5e: “1 defeated” chevron 1.6px above its text; the legendary strip’s crown and shield 2.1px high; Heroic Inspiration 2.1px; the speed plate 2.5px; on the sheet, roll buttons and the HP heading 1.7–2.1px high, and the NPC card’s links, Secret and “What we know” 1.4–2.1px high (Garamond small caps in shared parts: set --g-icon-dy ≈ 0.12em on those containers). The round medal in the header should become the ticker.',
	'Nimble: the NPC card’s HP stat heart 1.6px high; the boss heading crown 1px low.',
	'Call of Cthulhu: “1 out of the fight” chevron 2px high; NPC pills 1.2px low (Crimson small caps); the ticker’s “Before the fight” 1.1px high in its strip.',
	'Daggerheart: card-kind tags and reference pills (xdk-tag, xdk-ref) put the glyph 1.6–2.8px low; reaction-cost bolts 1.2–2.4px low; countdown timers 1.2px; the roll toast 1.4px high.',
	'Pathfinder 2e: “1 defeated” chevron 1.8px high.',
]]);
