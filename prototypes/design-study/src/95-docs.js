/* ============================================================================
   Overview, shared building blocks, side by side, appendix
   ========================================================================== */
const REC = {
	'5e': () => G5.flow('mid'),
	nimble: () => GN.flow('mid'),
	coc: () => GC.page(FIGHT_COC, 'mid'),
	dh: () => GD.flow('players'),
	pf: () => GP.view(FIGHT_PF, 'mid'),
};
function recFrame(id, opts = {}) {
	const r = REC[id]();
	return frame({ game: id, children: r.children, foot: r.foot, overlay: r.overlay, height: opts.height });
}
function miniRow(squint) {
	return h('div.mini-row' + (squint ? '.squint-on' : ''), ORDER.map(id => h('div.mini', recFrame(id), h('div.view-cap', { style: { fontSize: '17px', maxWidth: '360px' } }, h('b', DEFS[id].name), DEFS[id].title))));
}

function overviewPage() {
	const svd = [
		['Where the turn is', 'The acting creature is the first thing under the header, at full size: a card (5e, Nimble), a gold-edged card (Daggerheart), an opened entry (CoC, PF2e).', 'Its shape. Nimble’s card sits under a side switch; Daggerheart’s is whoever holds the spotlight; PF2e opens in place so the order never jumps.'],
		['Where HP is', 'Right edge of every row, number first; big on the acting creature. Tapping it opens the same keypad.', 'Drawing: a bar (5e, PF2e, Nimble), marked slots (Daggerheart), the sheet’s Max | Current box (CoC).'],
		['How conditions read', 'Name, then value, then rounds left; an icon only when it does something at a turn boundary. Same picker and timing editor everywhere.', 'The chip’s dress: plain text (5e), trait tags in caps (PF2e), ticked boxes (CoC), quiet chips (Nimble, Daggerheart).'],
		['The main button', 'Pinned at the bottom, full width, Back beside it, labelled with what happens next.', 'The words: "Next: Mara", "Monsters’ turn", "GM’s turn · +1 Fear", "Next: Prof. Amos Wray".'],
		['Header and economy', 'Title, round or turn state, + and ⋯. A game’s meta-resource sits right under it.', 'What fills it: Fear and countdowns (Daggerheart), the side switch (Nimble), the threat ladder (PF2e), nothing (5e, CoC).'],
		['Interaction', 'Tap HP for the keypad, long-press for the menu, drag to reorder, prompts rise from the bottom at turn boundaries, Back undoes anything.', 'Nothing. A GM who learns one game’s gestures knows them all.'],
		['Type, colour, ornament, density', '—', 'All of it, from each game’s books and sheets: Baskerville small caps and oxblood; condensed heavy italic and ink; Caslon and olive; Overpass, gold and indigo; Charter, navy and trait tags. Density from 38px rows (PF2e) to an airy 64px page (CoC).'],
	];
	return h('section',
		h('p.lede', 'Five tabletop games, one encounter manager in Obsidian’s right sidebar. Each game gets a design system drawn from how that game already looks on its sheets, in its books and in the tools its players use; underneath, they share one data model, one set of components and one way of working.'),
		h('p', 'Every panel on these pages is drawn by plain JS from the shared model, at the real width (360px sidebar, 640px wide, 390px phone). Use Light / Dark at the top. Tabs per game start with the research board, then the panels, then the design system.'),
		h('h2.sec', 'The five, mid-combat'),
		h('p.kicker', 'Each game’s recommended direction at 70% scale, on the same moment: someone’s turn in round two or three.'),
		miniRow(false),
		h('h2.sec', 'Same in every game, and each game’s own'),
		h('p.kicker', 'The research says GMs complain about trackers that hide the overview, bury the current creature, forget lair and legendary moments, and force a sorted number list onto games that don’t have one. The sidebar is 360px. So the skeleton is fixed and the skin and the turn structure are free.'),
		h('table.slots-map', h('thead', h('tr', h('th', ''), h('th', 'Same everywhere, so a GM switching games isn’t lost'), h('th', 'Each game’s own, so it feels like that game'))), h('tbody', svd.map(r => h('tr', r.map(t => h('td', t)))))),
		h('div.grid2', { style: { marginTop: '28px' } },
			h('div.card', h('h3.sub', { style: { marginTop: 0 } }, 'Why fix the skeleton'), h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', 'A GM running Nimble on Tuesday and 5e on Friday reaches for the same places: the acting creature at the top, HP on the right, the button at the bottom.'),
				h('li', 'At 360px there is room for one focal point and one list; anything else is a second scroll.'),
				h('li', 'The bottom is the thumb zone on a phone and the most stable place in a sidebar (the list above it changes; the footer never moves).'))),
			h('div.card', h('h3.sub', { style: { marginTop: 0 } }, 'Why free the skin and the turn'), h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', 'Each game already has a look its players love: 5e fans rebuilt its fonts by hand; Daggerheart’s Hope diamonds and PF2e’s action marks are how players think.'),
				h('li', 'Turn models differ in kind: initiative, DEX with readied guns, sides, the spotlight. Drawing them all as a sorted list is the mistake every generic tracker makes.'),
				h('li', 'The previous attempt was one layout with five palettes. This one changes structure where the rules change, and only there.')))),
		h('h2.sec', 'The directions'),
		h('div.grid3', { style: { gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: '14px' } }, ORDER.map(id => h('div.card', { style: { padding: '16px' } },
			h('div', { style: { fontSize: '12.5px', color: 'var(--p-text-2)' } }, DEFS[id].name),
			h('div', { style: { fontWeight: 600, margin: '2px 0 8px', fontSize: '15px' } }, DEFS[id].title),
			h('div', { style: { fontSize: '13px', color: 'var(--p-text-2)', lineHeight: 1.5 } }, htmlSpan(DEFS[id].research.direction[0]))))));
}

function sharedPage() {
	const st = (label, el) => h('div.state', h('span', label), h('div.spec-stage.g-base', el));
	const specimens = [
		st('Track · bar: full, low (Bloodied), temp', h('div', { style: { display: 'grid', gap: '10px' } }, bar({ value: 30, max: 38 }), bar({ value: 12, max: 38 }), bar({ value: 27, max: 33, temp: 5 }))),
		st('Track · slots: marked from the left', h('div', { style: { display: 'grid', gap: '8px' } }, slots({ max: 6, on: 2 }), slots({ max: 7, on: 6, style: { '--slot-on': 'var(--g-danger-text)' } }))),
		st('Pips: available, spent', h('div', { style: { display: 'grid', gap: '8px' } }, pips({ max: 3, on: 2 }), pips({ max: 6, on: 4 }))),
		st('Chip: plain, valued, timed, acts, bad', chips([{ name: 'Prone' }, { name: 'Frightened', value: 2 }, { name: 'Poisoned', rounds: 3 }, { name: 'Burning', trigger: 'damage' }, { name: 'Dying', bad: true }])),
		st('Buttons in clusters: primary, default, quiet, icon', clusters(cluster([btn({ text: 'Damage', icon: 'minus' }), btn({ text: 'Heal', icon: 'plus' })]), cluster([btn({ kind: 'icon', icon: 'undo', title: 'Back' }), btn({ kind: 'primary', icon: 'next', text: 'Next: Mara' })]), cluster([btn({ kind: 'quiet', text: 'Later' })], { end: true }))),
		st('Turn prompt', promptCard({ ic: 'dice', title: h('span', 'Goblin, ', h('em', 'Frightened')), text: 'Wisdom save DC 13 at the end of its turn ends it.', acts: [btn({ kind: 'primary', size: 'sm', text: 'Roll (+0)' }), btn({ size: 'sm', text: 'Passed' })] })),
	];
	const slotsMap = [
		['Header', 'Title, + and ⋯', 'Title, + and ⋯', 'Title, + and ⋯', 'Title, + and ⋯', 'Title, threat ladder'],
		['Ticker', 'Round · whose turn · acted', 'Round · which side · heroes done', 'Round · whose turn', 'Who has the spotlight · Fear', 'Round · whose turn · acted'],
		['Economy strip', '— (lair lives in the queue)', 'The side switch', '—', 'Fear, countdowns', '—'],
		['Focus', 'Card: AC shield, HP, legendary, death saves', 'Acting hero: three action cards, HP heart, Wounds', 'The acting entry opens: sheet boxes, roll pill', 'Spotlit character, gold edge; on the GM’s turn, the spotlit adversary', 'The row opens: action marks, AC, HP, saves'],
		['Queue', 'Strict: initiative order; still to act, then acted; lair row', 'Free: heroes still to act, heroes done (with legendary rows), monsters', 'Strict: DEX order, end-of-round line', 'Free: not yet in the spotlight, had it, adversaries', 'Strict: initiative order; still to act, then acted'],
		['Footer (right)', 'Back · Next: <name>', 'Back · Monsters’ turn', 'Back · Next: <name>', 'Back · GM’s turn · +1 Fear', 'Back · Next: <name>'],
	];
	const tokens = [
		['--g-bg, --g-surface, --g-surface-2', 'Panel, cards, hover and inset fills'],
		['--g-line, --g-line-strong', 'Hairlines; outlines of controls and empty slots'],
		['--g-text, --g-text-2', 'Ink; secondary text (both checked at 4.5:1)'],
		['--g-accent, --g-accent-hover, --g-on-accent, --g-accent-text', 'The primary button and the one accent used as text'],
		['--g-now, --g-now-line', 'The current turn’s tint and its edge'],
		['--g-danger-text, --g-danger-bg', 'Dying, damage, last HP'],
		['--g-track, --g-track-low, --g-track-empty, --g-temp', 'Bars: healthy, low, empty, temp HP'],
		['--g-chip-bg, --g-chip-text, --g-chip-acts-*', 'Conditions, and conditions that act at a turn boundary'],
		['--g-font-display, --g-font-ui, --g-font-num, --g-display-variant', 'Names, everything else, numbers (always tabular)'],
		['--g-r-sm/md/lg/chip, --g-pad, --g-row', 'Radii, panel padding, row height (density)'],
		['--g-icon-sw, --g-dur, --g-ease', 'Icon stroke weight; motion'],
	];
	return h('section',
		h('p.lede', 'Shared means the data model and the interaction model, not the layout. Each game arranges the same blocks; the blocks read only tokens.'),
		h('h2.sec', 'The model'),
		h('p.kicker', 'One encounter shape for every game. The only part that differs in kind is TurnState: an order, sides, or the spotlight. Everything a panel shows above is read from objects of this shape (see the source of this page).'),
		h('pre', SPEC.model),
		h('h2.sec', 'Layout slots'),
		h('p.kicker', 'Six slots, top to bottom, in every game: card and queue is the one layout. A game decides what fills each slot and whether its queue is strict or free.'),
		h('div', { style: { display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: '32px', alignItems: 'start' } },
			h('div.wire', { style: { gridTemplateRows: 'auto auto auto 1fr auto' } }, h('div', 'Header'), h('div', 'Ticker: round · turn'), h('div', 'Economy strip'), h('div', { style: { display: 'grid', gap: '6px', padding: 0, background: 'none' } }, h('div.focus', { style: { borderRadius: '6px', padding: '6px 8px', background: 'var(--p-text)', color: 'var(--p-bg)', minHeight: '90px' } }, 'Card: who acts now'), h('div', { style: { borderRadius: '6px', padding: '6px 8px', background: 'var(--p-code)', minHeight: '70px' } }, 'Queue: still to act, acted')), h('div.foot', { style: { textAlign: 'right' } }, 'Back · Main button')),
			h('table.slots-map', h('thead', h('tr', h('th', ''), ORDER.map(id => h('th', DEFS[id].name)))), h('tbody', slotsMap.map(r => h('tr', r.map(t => h('td', t))))))),
		h('h2.sec', 'Components'),
		h('p.kicker', 'Written once in core; every game draws them. Props, states, and the tokens each reads.'),
		h('table.t', h('thead', h('tr', h('th', 'Component'), h('th', 'What it is'), h('th', 'Props'), h('th', 'States'), h('th', 'Reads'))),
			h('tbody', SPEC.components.map(([n, w, p, s, t]) => h('tr', h('td', h('b', n)), h('td', w), h('td', h('code', p)), h('td', s), h('td', h('code', t)))))),
		h('h3.sub', 'Specimens, in the neutral base (what a game that sets nothing gets)'),
		h('div.grid3', specimens),
		h('h2.sec', 'Interaction model'),
		h('div.grid2',
			h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', h('b', 'Next and Back. '), 'The footer’s main button runs the game’s turn step; Back undoes the last step, including what a turn boundary did to conditions (core’s undoTurnEvent).'),
				h('li', h('b', 'HP. '), 'Tap the number: the keypad. The same command language everywhere: 7 damage, 7! crit, +7 heal, =20 set, t5 temp. The game supplies the working line (armor, thresholds, weakness, major wound, concentration).'),
				h('li', h('b', 'Conditions. '), 'The + chip opens core’s picker; pick, then time it: rounds, start or end, whose turn, damage or a save each turn. Tap a chip for its card; the × is in the card, not on the chip, so chips stay small.'),
				h('li', h('b', 'Prompts. '), 'At a turn boundary, a sheet rises with everything the conditions ask, in order. Nothing is rolled without a tap.')),
			h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', h('b', 'Reorder. '), 'Drag a row by its grip (mouse) or long-press then drag (touch); the drop line shows where. Ties are settled this way; the model keeps a tiebreak.'),
				h('li', h('b', 'Menus. '), 'Right-click, ⋯, or long-press: quick look, duplicate, remove, hide from players. No control is hover-only on touch.'),
				h('li', h('b', 'Quick look. '), 'Tap a name: the stat block or sheet in a sheet over the panel, Escape to close.'),
				h('li', h('b', 'Motion. '), 'Each game sets duration and easing; all of it turns off with reduced motion.'))),
		h('h2.sec', 'Tokens'),
		h('p.kicker', 'The --g-* contract. In the plugin these become the game-look tokens under .ev-sys-<id> (and .theme-dark .ev-sys-<id>), extending the --ev-* set that exists today.'),
		h('table.t', h('tbody', tokens.map(([t, d]) => h('tr', h('td', h('code', t)), h('td', d))))));
}

function lineupPage() {
	return h('section',
		h('p.lede', 'All five recommended panels on the same moment, at 70%. Then the squint test: blurred until no word is readable. Each should still be recognisable by its structure and colour alone.'),
		h('h2.sec', 'Side by side'), miniRow(false),
		h('h2.sec', 'Squint test'), h('p.kicker', 'Gaussian blur, 6px. 5e: a warm card over a quiet list, one oxblood bar. Nimble: the charcoal side bar and black action cards. CoC: an airy ruled page with an olive margin. Daggerheart: a gold-edged card, indigo tokens, chamfered parchment cards. PF2e: a cool dense list with oxblood tags and a navy edge.'),
		miniRow(true));
}

function appendixPage() {
	return h('section',
		h('h2.sec', { style: { marginTop: 0 } }, 'How other trackers do it'),
		h('p.kicker', 'A survey of the tools GMs use, from their docs, store pages and feedback threads.'),
		h('table.t', h('thead', h('tr', h('th', 'Tool'), h('th', 'How it’s laid out'), h('th', 'Good and bad'))), h('tbody', TRACKER_SURVEY.map(([n, a, b, u]) => h('tr', h('td', h('b', n), h('div', h('a.note', { href: u, target: '_blank' }, 'source'))), h('td', a), h('td', b))))),
		h('h3.sub', 'Lessons we took'),
		h('ol.prose', TRACKER_LESSONS.map(t => h('li', t))),
		h('h2.sec', 'Building it in the plugin'),
		h('div.grid2',
			h('div', h('h3.sub', { style: { marginTop: 0 } }, 'Buildable as drawn'), h('ul.prose', { style: { paddingLeft: '18px' } },
				h('li', 'The component CSS uses no clip-path, display: contents, column-gap, :has() or !important. Daggerheart’s chamfers are two linear gradients; its gold edge is a second chamfered layer 2px larger; banner points are border triangles.'),
				h('li', 'Every game has a light and a dark token set; in the plugin they hang off .theme-dark. Contrast is measured on each game’s page.'),
				h('li', 'No hover-only controls: menus are ⋯, right-click and long-press; drag on touch is long-press then drag.'),
				h('li', 'color-mix() (used for one focus ring) is in Chromium 111+, so fine in 124.'))),
			h('div', h('h3.sub', { style: { marginTop: 0 } }, 'Hard, or needs work'), h('ul.prose', { style: { paddingLeft: '18px' } },
				h('li', h('b', 'Fonts. '), 'The study uses macOS faces (Baskerville, Avenir Next Condensed, Big Caslon, Hoefler Text, Charter) and Overpass from Google Fonts. Obsidian runs on Windows, Linux and phones: ship small subsets of open fonts (Libre Baskerville, Barlow Condensed, Libre Caslon, Overpass, Charter is already free) as data URIs, or accept fallbacks. Plan for about 30–60 KB per game.'),
				h('li', h('b', 'A third turn model. '), 'Daggerheart’s spotlight is neither initiative nor sides; core’s timed conditions need its boundaries (spotlight passes, GM turn) defined.'),
				h('li', h('b', 'Queue knowledge. '), 'The 5e round marker, the lair row and Nimble’s legendary-after-each-hero rows need core’s queue to know about "moments" that aren’t combatants.'),
				h('li', h('b', 'Group prompts. '), 'CoC’s Sanity roll asks every investigator at once; today’s prompts are one per bearer.'),
				h('li', h('b', 'Damage working. '), 'Each game’s keypad line (armor, thresholds, weakness, major wound) wants a contract member: damageRule(target, amount, mode) → { applied, working }.'),
				h('li', h('b', 'Zoom. '), 'The 70% thumbnails on this page use CSS zoom; that’s the study, not the plugin.')))),
		h('h2.sec', 'Critique log'),
		h('p.kicker', 'Three full passes over every view, light and dark, at 1x and 2x, in headless Chrome. What was wrong and what changed.'),
		h('div.log', CRITIQUE.map(([pass, items]) => [h('h4', pass), h('ul', items.map(t => h('li', t)))])),
		h('h2.sec', 'Where the old study went wrong'),
		h('ul.prose', { style: { paddingLeft: '18px' } },
			h('li', 'One layout, five palettes. Now the structure follows the turn model: a queue, sides, a page, a table, an opened row.'),
			h('li', 'Costume instead of craft (stamps, a typewriter, a purple glow). Now each look is traced to the game’s own sheets and books, with sources, and the gimmicks are on the avoid lists.'),
			h('li', 'Micro-labels and four to six colours per row. Now labels are sentence case except where the game’s own convention is caps (PF2e tags, Daggerheart banners), and each game has one accent plus danger.'),
			h('li', 'Swatch dumps. Now each design system has principles, a type scale, colour roles with measured contrast, spacing, icons, motion and component states.')));
}

const CRITIQUE = [];
