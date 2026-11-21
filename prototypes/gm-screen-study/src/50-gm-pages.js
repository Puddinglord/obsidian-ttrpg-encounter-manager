/* ============================================================================
   The study's pages.
   ========================================================================== */

const GM_NOTE = {
	nimble: ['nimble:Quicksilver Hound', { title: 'Q6 Storage Vault', text: 'Shelves of sealed jars line the walls, and copper tubes connect the containers in a maze-like pattern.', text2: 'Four' }, 'lurk among the crates, hunting as a pack.'],
	'5e': ['5e:Ogre', { title: 'Road ambush', text: 'Goblins spring from the ditch while their mage holds back.', text2: 'On round two an' }, 'lumbers out of the trees.'],
};
const shot = (g, content, o = {}) => devShot(gmWindow(g, content, o), o.w || 1440, o.cap, o.sub);
const list = (items) => h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } }, items.map(t => h('li', htmlSpan(t))));
const card2 = (title, items) => h('div.card', h('h3.sub', { style: { marginTop: 0 } }, title), list(items));

function gmBrief() {
	return h('section',
		h('p.lede', 'A GM screen for Ember Vault: one page where you pin what you reach for at the table (a rule, a table, a monster, the party, the fight, a note, dice, clocks) and nothing else. It belongs to the base plugin, so it works the same in every game, and each game dresses it and adds its own cards.'),
		h('p', 'The Campaign panel already is the campaign’s home: its chapters, sessions, quests and people. The screen is what you keep open while you run it. Use Light / Dark at the top; every screen here is drawn at its real width.'),
		h('h2.sec', 'The recommendation'),
		shot('nimble', gmScreen('nimble', { cols: 4 }), { cap: 'Nimble · the Combat screen, as a page', sub: 'Screens as tabs (Combat, Exploring, Town); four columns you arrange; each card a pinned rule, table, monster, NPC or note, or a widget (the fight, the party, clocks, dice).' }),
		h('div.grid2', { style: { marginTop: '24px' } },
			card2('What it is', [
				'<b>Screens of columns.</b> Tabs across the top, one per kind of scene (Combat, Exploring, Town); each a few columns of cards you arrange.',
				'<b>Pin anything.</b> A note or a heading in one, a compendium entry (rule, condition, table, monster, spell, item), a quest, an NPC. Or add a widget: the fight, the party, dice, clocks, a random table, a scratchpad.',
				'<b>Each card is the thing itself, live.</b> The party’s HP comes from their sheets, the fight from the tracker, a ticked objective goes into the quest note. Tap a card’s name to open the whole of it.',
				'<b>A page, a drawer, or its own window.</b> A tab like the tracker’s page; or slid over the note you’re reading; or popped out onto a second screen.',
			]),
			card2('What it isn’t', [
				'<b>Not a dashboard.</b> No counts or charts about the campaign; the Campaign panel and its home note do that.',
				'<b>Not a second copy.</b> Cards show the notes and entries they pin; editing happens where the thing lives.',
				'<b>Not a rules engine.</b> It follows the table: nothing is blocked, nothing pops up. A clock ticks when you tap it.',
				'<b>Not for the players’ eyes.</b> It’s the GM’s side of the screen. A player campaign gets the same thing for its player: their screen (see Open questions).',
			])),
		h('h2.sec', 'What GMs use now'),
		h('div.grid2',
			card2('Borrow', [
				'The cardboard screen’s idea: <b>the few tables you look up most</b>, always in the same place (conditions, DCs, cover, actions).',
				'Foundry’s GM Screen module: <b>a grid of entries in tabs</b>, opened as a drawer over the map.',
				'D&D Beyond’s DM screen: <b>cards you choose</b> from rules and tools, a few columns, easy to rearrange.',
				'Obsidian’s Canvas and Dataview homepages: <b>your own notes as the building blocks</b>.',
			]),
			card2('Avoid', [
				'A fixed set of panels the GM can’t change (the cardboard screen’s limit).',
				'A free-form canvas: arranging boxes becomes a job, and nothing reflows on an iPad.',
				'Copies of rules text that drift from the compendium, and widgets that duplicate the tracker.',
				'Anything that only works in one game.',
			])));
}

function gmDirections() {
	const g = 'nimble';
	const dir = (t, el, cap, sub, pros, cons) => [h('h2.sec', t), devShot(el, 1280, cap, sub), h('div.grid2', { style: { marginTop: '14px' } }, card2('For', pros), card2('Against', cons))];
	return h('section',
		h('p.lede', 'Four ways to lay out a screen, each drawn in Nimble’s look on a 1280px laptop. The recommendation (D) keeps what each of the first three gets right.'),
		dir('A · The tri-fold', gmWindow(g, gmTrifold(g), { w: 1280, ht: 800 }), 'Four fixed panels: Rules, Monsters, Party, Notes', 'Like the cardboard screen: each panel is a kind of thing.',
			['Instantly familiar.', 'You always know where a rule is.'],
			['The panels are the plugin’s idea of your game, not yours.', 'A combat screen and a town screen want different panels.']),
		dir('B · The board', gmWindow(g, gmBoard(g), { w: 1280, ht: 800 }), 'Tiles in sizes, packed into a grid', 'Small, wide, tall and big tiles; the grid packs them.',
			['Dense: lots fits on one screen.', 'Sizes say what matters.'],
			['Tiles cut text off at their size; rules and tables need to scroll inside a tile.', 'Packing jumps around when a tile changes size; on an iPad it reflows unpredictably.']),
		dir('C · The drawer', gmWindow(g, gmDrawer(g), { w: 1280, ht: 800, title: 'Q6 Storage Vault', note: true }), 'Over the note you’re running', 'A key or the ribbon slides it in from the right; Escape slides it away.',
			['The note stays in view.', 'Nothing to arrange: one column.'],
			['One column is little room.', 'Covers what you’re reading while it’s open.']),
		dir('D · Screens of columns (recommended)', gmWindow(g, gmScreen(g, { cols: 3 }), { w: 1280, ht: 800 }), 'Tabs of screens; each a few columns of cards you arrange', 'Three columns at this width; four on a wider window, one on a phone.',
			['Yours: you choose the cards and their order.', 'Reflows cleanly: columns merge in order as the width shrinks, nothing hides.', 'Cards keep their full height, so a rule reads whole.', 'Opens as a page, as C’s drawer, or in its own window.'],
			['Less dense than B.', 'A screen per kind of scene is a little setup (each campaign starts with one, filled from its game’s defaults).']));
}

function gmScreenPage() {
	const out = [h('p.lede', 'The recommended screen in each game: the same anatomy, the game’s paper, type and colours, and each game’s own cards. Both are a page in a tab, opened from the Campaign panel’s GM screen button or the ribbon.')];
	for (const g of ['nimble', '5e']) {
		const name = g === 'nimble' ? 'Nimble' : '5e';
		out.push(h('h2.sec', name), shot(g, gmScreen(g, { cols: 4 }), { cap: `${name} · the Combat screen`, sub: g === 'nimble' ? 'The fight and the party; Dazed, Grappled and the heroic reactions; a hound and the Alchemist; tonight’s plan, the clocks, dice.' : 'The fight and the party (AC, passive Perception); Grappled, Prone and the DCs; the ogre and Marta; tonight’s plan, the clocks, dice.' }));
	}
	out.push(h('h2.sec', 'Editing'),
		h('p.kicker', 'Edit turns every card into something you can move (drag its header), size (S keeps it to its first lines, M is its full height, L spans two columns) or take off (⋯ › Unpin). Each column ends in Pin here. Done puts it back.'),
		shot('5e', gmScreen('5e', { cols: 3, edit: true }), { w: 1280, cap: '5e · editing the Combat screen', sub: 'Dashed outlines, grips, sizes; Pin here at the foot of the last column.' }),
		h('h2.sec', 'As a drawer'),
		h('p.kicker', 'While you read a note: the screen’s key (or Shift-click on its button) slides it in from the right, one column, the current screen. Escape slides it away.'),
		shot('5e', gmDrawer('5e'), { w: 1280, title: 'Road ambush', note: true, cap: '5e · the drawer over the road ambush', sub: 'Its first column only; the tabs still switch screens.' }));
	return h('section', out);
}

function gmCardsPage() {
	const pair = (t, sub, make) => [h('h2.sec', t), h('p.kicker', sub), h('div.gm-pair', ['nimble', '5e'].map(g => h('div', h('div.gm-stage.g-' + g, { style: { background: 'var(--g-bg)' } }, h('div.gm', { style: { minHeight: 0, background: 'none' } }, make(g))), h('p.gm-cap', h('b', g === 'nimble' ? 'Nimble' : '5e')))))];
	return h('section',
		h('p.lede', 'Every card, in both games. The base plugin draws the anatomy (a header with its icon, its name, where it’s from, Open and ⋯; then its body); the game gives the look and, for some cards, the content.'),
		pair('A note', 'A note, or the part of it under a heading. Checkboxes tick into the note.', g => GW.note(g, GM_DATA[g])),
		pair('A rule', 'Any compendium entry: a condition, a rule, an action. The book’s words, as the compendium shows them.', g => GW.rule(g, GM_DATA[g].rules[0])),
		pair('A table', 'A table from the compendium or any note.', g => GW.table(g, GM_DATA[g].table)),
		pair('A monster', 'The numbers you need at the table and its actions; Add to fight and the whole stat block a tap away.', g => GW.monster(g, GM_DATA[g].monster)),
		pair('An NPC', 'From their note: role, attitude, what they want, the secret.', g => GW.npc(g, GM_DATA[g].npc)),
		pair('The party', 'From their sheets, live. Each game adds what it needs: Defense in Nimble; AC and passive Perception in 5e.', g => GW.party(g, GM_DATA[g].party)),
		pair('The fight', 'The tracker’s glance: whose turn, who’s next. Open the tracker for the rest.', g => GW.fight(g, GM_DATA[g].fight)),
		pair('Dice', 'A tray and the roll log.', g => GW.dice(g, GM_DATA[g].rolls)),
		pair('A random table', 'Any table in a note whose first column counts up; Roll picks a row.', g => GW.random(g, GM_DATA[g].random)),
		pair('Clocks', 'Segments you tick by hand (the pip spec: tap a filled one to take it away).', g => GW.clocks(g, GM_DATA[g].clocks)),
		pair('Quests', 'The open ones; objectives tick into their notes.', g => GW.quests(g, GM_DATA[g].quests)),
		pair('Scratch', 'What you jot at the table, kept in the session note under Notes.', g => GW.scratch(g, GM_DATA[g].scratch)));
}

function gmPinPage() {
	const g = '5e';
	const menu = (items) => h('div.gm-menu', items.map(i => i === '-' ? h('hr') : h('div' + (i[2] ? '.on' : ''), icon(i[0], 15), i[1])));
	const stage = (el, cap, sub) => h('div', h('div.gm-stage.g-' + g, { style: { background: 'var(--g-bg)' } }, el), h('p.gm-cap', h('b', cap), ' ', sub));
	const kinds = [['note', 'A note…', 'Or a heading in one'], ['book', 'From the compendium…', 'A rule, condition, table, monster'], ['flag', 'Quests', 'The open ones'], ['users', 'The party', 'From their sheets'], ['swords', 'The fight', 'The tracker’s glance'], ['dice', 'Dice', 'Tray and roll log'], ['clock', 'Clocks', 'Tick by hand'], ['list', 'A random table…', 'From a note'], ['notepad', 'Scratch', 'Into the session note']];
	return h('section',
		h('p.lede', 'Pinning is one action wherever the thing is, and the screen has its own Add for widgets. Pinning from a note or the compendium goes to the screen you last had open; ⋯ › Pin to… asks which.'),
		h('div.gm-pagegrid',
			stage(menu([['open', 'Open in new tab'], ['copy', 'Copy link'], '-', ['pin', 'Pin to GM screen', true], ['pin', 'Pin to…'], '-', ['trash', 'Delete']]), 'A note’s ⋯ menu', 'and the file explorer’s, and a heading’s menu in reading view.'),
			stage(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, btn({ icon: 'plus', text: 'Add to fight', size: 'sm' }), btn({ icon: 'pin', text: 'Pin', size: 'sm' }), btn({ icon: 'open', text: 'Open page', size: 'sm' })), 'A compendium card or stat block', 'Pin beside Add to fight and Open page.'),
			stage(h('div.gm-searchbar', icon('search', 15), 'grappled', h('kbd', '⌘P Pin')), 'Omnisearch', 'Cmd/Ctrl+P on any row pins it.')),
		h('h2.sec', 'Add to the screen'),
		h('p.kicker', 'The screen’s own Add (and Pin here in edit mode): widgets, or something to pin through the compendium dialog, which is the picker for everything (the compendium-is-the-picker rule). Cards a game adds are listed with a dashed edge.'),
		h('div.g-' + g, { style: { maxWidth: '640px', padding: '18px', background: 'var(--g-bg)', borderRadius: '12px' } },
			h('div.gm-kinds', kinds.map(([ic, t, s]) => h('div.gm-kind', h('b', icon(ic, 15), t), h('small', s))), h('div.gm-kind.from-game', h('b', icon('shield', 15), 'Cover and DCs'), h('small', 'From 5e')), h('div.gm-kind.from-game', h('b', icon('hourglass', 15), 'Exhaustion'), h('small', 'From 5e')))));
}

function gmPanelPage() {
	const panel = (g, { after, player }) => {
		const d = GM_DATA[g];
		return h('div.gm-panel.g-' + g,
			h('div', { style: { display: 'flex', gap: '8px' } }, h('div.gm-switch', { style: { flex: 1 } }, icon('crown', 15), h('b', d.campaign), h('span.gm-tagdark', player ? 'PLAYER' : 'GM'), icon('chevron-down', 14)), after ? null : h('span.gm-home', icon('castle', 16))),
			h('div.gm-searchbar', icon('search', 15), 'Search or roll dice…', h('kbd', '⌘K')),
			after ? h('div.gm-open' + (player ? '.is-quiet' : ''), icon('grid', 16), player ? 'My screen' : 'GM screen', h('kbd', '⌘G')) : null,
			h('div.gm-panel-sec', 'Party'),
			h('div.gm-meta', d.party.map(p => p.name).join(' · ')));
	};
	const row = (g) => h('div.gm-pair', h('div', panel(g, {}), h('p.gm-cap', h('b', 'Before'), ' The switcher shares its row with the home button.')), h('div', panel(g, { after: true }), h('p.gm-cap', h('b', 'After'), ' The switcher alone, then Omnisearch, then the GM screen.')));
	return h('section',
		h('p.lede', 'The top of the Campaign panel: the campaign switcher on its own row, then Omnisearch, then the GM screen. The home button goes: the panel is the campaign’s home, and its home note opens from the switcher’s menu (Open campaign note).'),
		h('h2.sec', 'Nimble'), row('nimble'),
		h('h2.sec', '5e'), row('5e'),
		h('h2.sec', 'In a campaign you play in'),
		h('p.kicker', 'The same place opens the player’s screen: their sheet’s glance, their spells, the rules they look up. Quieter, since it isn’t the main thing a player opens.'),
		h('div', { style: { maxWidth: '340px' } }, panel('5e', { after: true, player: true })));
}

/** Other games: the same anatomy and cards, each game's own on top. */
function gmGamesPage() {
	const mini = (g, title, cards) => h('div', h('div.g-' + g, { style: { background: 'var(--g-bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--g-line)' } }, h('div.gm', { style: { '--gm-cols': 2, minHeight: 0 } }, h('div.gm-top', h('h2.gm-name', 'GM screen'), h('div.gm-tabs', h('span.gm-tab.on', 'Combat'), h('span.gm-tab', 'Exploring'))), h('div.gm-cols', cards))), h('p.gm-cap', h('b', title)));
	const rule = (name, from, text) => gmCard({ ic: 'condition', title: name, from, body: h('div.gm-rule', h('p', text)) });
	const tbl = (name, from, head, rows) => gmCard({ ic: 'list', title: name, from, body: h('table.gm-table', h('thead', h('tr', head.map(x => h('th', x)))), h('tbody', rows.map(r => h('tr', r.map((c, i) => h('td' + (i === r.length - 1 ? '.n' : ''), c)))))) });
	const clock = (title, list) => gmCard({ ic: 'clock', title, body: h('div.gm-clocks', list.map(([n, on, max]) => h('div.gm-clock', gmClock(on, max), h('span', h('b', n), h('small', `${on} of ${max}`))))) });
	const fear = gmCard({ ic: 'skull', title: 'Fear', from: 'GM', body: [h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } }, h('b', { style: { fontSize: '26px', lineHeight: '30px' } }, '5'), h('span.gm-meta', 'of 12')), h('div', { style: { marginTop: '6px' } }, pips({ max: 12, on: 5 }))] });
	return h('section',
		h('p.lede', 'The screen is the base plugin’s. A game adds cards (its widgets and its default screen) and its look; nothing else changes. Three of the games the design study plans for, in their looks.'),
		h('div.gm-pagegrid',
			mini('dh', 'Daggerheart · Fear and countdowns are its own cards', h('div.gm-col', fear, clock('Countdowns', [['The bridge gives', 3, 6], ['Reinforcements', 1, 4]])), h('div.gm-col', rule('Vulnerable', 'Condition', 'Rolls against you have advantage.'))),
			mini('pf', 'Pathfinder 2e · DCs by level, a table the GM reaches for constantly', h('div.gm-col', tbl('DCs by level', 'GM Core', ['Level', 'DC'], [['1', '15'], ['2', '16'], ['3', '18'], ['4', '19'], ['5', '20']])), h('div.gm-col', rule('Frightened', 'Condition', 'A status penalty equal to its value to all checks and DCs; it drops by 1 at the end of each of your turns.'))),
			mini('coc', 'Call of Cthulhu · Sanity and Luck, the investigators’ tracks', h('div.gm-col', clock('Night’s end', [['Dawn', 2, 8]])), h('div.gm-col', tbl('Sanity loss', 'Keeper', ['Saw', 'Loss'], [['A corpse', '0/1d3'], ['A ghoul', '0/1d6'], ['Something worse', '1d6/1d20']])))));
}

function gmWidthsPage() {
	const g = 'nimble';
	const ipad = obsIpad({ landscape: false, panes: [h('div.ob-pane', h('div.ob-tabs', h('span.ob-tab.on', obIcon('grid', 13), 'GM screen')), h('div.ev-view.mt.g-' + g, gmScreen(g, { cols: 2 })))] });
	return h('section',
		h('p.lede', 'Columns merge in order as the width shrinks (four, three, two, one), so a card never hides and its neighbours stay its neighbours. A column is at least 260px.'),
		devShot(gmWindow(g, gmScreen(g, { cols: colsFor(gmMain(1440, false)) })), 1440, 'Laptop 1440, sidebars shut: four columns', `Main area ${gmMain(1440, false)}px.`),
		devShot(gmWindow(g, gmScreen(g, { cols: colsFor(gmMain(1280, true)) }), { w: 1280, ht: 800, left: true }), 1280, 'Laptop 1280, Campaign panel open: three columns', `Main area ${gmMain(1280, true)}px; columns 3 and 4 share the last column.`),
		devShot(ipad, 820, 'iPad portrait: two columns', 'Columns 1 and 3, then 2 and 4.'),
		devShot(notePhone({ game: g, title: 'GM screen', content: gmScreen(g, { cols: 1 }) }), 390, 'Phone: one column', 'The cards in column order; each folds to its header with a tap on its name.'));
}

function gmFormatPage() {
	const code = (t) => h('div.gm-code', t);
	return h('section',
		h('p.lede', 'A screen is a note. Each campaign gets one (GM Screen.md beside its home note), so it syncs, versions and travels with the campaign like everything else, and you can read or edit it as text.'),
		h('h2.sec', 'The note'),
		code(['```gm-screen', 'screens:', '  - name: Combat', '    columns:', '      - [fight, party]', '      - ["nimble:Dazed", "nimble:Grappled", "nimble:rule:Heroic reactions"]', '      - ["nimble:Quicksilver Hound", "[[Magistrix Vess]]"]', '      - ["[[Session 5]]#Tonight", clocks, dice]', '  - name: Exploring', '    columns:', '      - ["[[Vault whispers]]", party]', '      - ["nimble:rule:Resting", quests, scratch]', '```'].join('\n')),
		h('p.kicker', 'Pins are the references the plugin already reads (nimble:, 5e:, [[links]] with headings); widgets are words. A card’s size is a suffix (party:L). Columns are lists, so reordering is moving a line. Clocks keep their counts in the note’s properties.'),
		h('h2.sec', 'The engine'),
		h('div.grid2',
			card2('Core (every game)', [
				'The view (a page, a drawer, a window), screens, columns, edit mode, the Add dialog, Pin from notes, the compendium and Omnisearch.',
				'The cards that are the same everywhere: a note, a heading, a quest list, an NPC, dice and the roll log, clocks, a random table from a note, scratch.',
				'Drawing a pinned compendium entry or stat block by asking its game (as hover cards and quick looks do now).',
			]),
			card2('A game (through GameSystem)', [
				'<code>screenCards</code>: its own cards (Daggerheart’s Fear and countdowns; 5e’s Cover and DCs; Nimble’s heroic reactions).',
				'<code>screenDefaults</code>: the screen a new campaign starts with.',
				'What the party and fight cards show for its heroes (Defense or AC, passive Perception, Hope and Stress), from the sheet and tracker it already has.',
			])));
}

function gmQuestions() {
	const q = (t, opts) => h('div.card', { style: { marginBottom: '14px' } }, h('h3.sub', { style: { marginTop: 0 } }, t), list(opts));
	return h('section',
		h('p.lede', 'What the study leaves for you to decide.'),
		q('1. Which layout?', ['<b>D, screens of columns</b> (recommended), with the drawer and a window of its own as ways to open it.', 'A, the tri-fold, if fixed kinds of panel suit you better.', 'B, the board, if density matters more than reading a rule whole.']),
		q('2. Where it opens by default', ['A page in a tab (like the tracker from the ribbon); the drawer on Shift-click (recommended).', 'The drawer first.']),
		q('3. A player’s screen', ['Yes: the same view in a campaign you play in, called My screen, with the player’s sheet glance and the rules they look up (recommended).', 'Not yet: GM only.']),
		q('4. Its button', ['GM screen as the third row of the Campaign panel, under Omnisearch, with its key (recommended).', 'Also in the ribbon.']),
		q('5. The home button', ['Remove it; Open campaign note moves to the switcher’s menu (recommended).', 'Keep it beside the GM screen button.']),
		q('6. One screen note per campaign, or shared', ['One per campaign (recommended): each game’s rules differ.', 'Also a vault-wide screen for things you use everywhere.']));
}

const GM_PAGES = [
	['brief', 'Brief', () => gmBrief()],
	['directions', 'Directions', () => gmDirections()],
	['screen', 'The screen', () => gmScreenPage()],
	['cards', 'Cards', () => gmCardsPage()],
	['pin', 'Pinning', () => gmPinPage()],
	['panel', 'Campaign panel', () => gmPanelPage()],
	['games', 'Every game', () => gmGamesPage()],
	['widths', 'Widths', () => gmWidthsPage()],
	['format', 'Format', () => gmFormatPage()],
	['questions', 'Open questions', () => gmQuestions()],
];
