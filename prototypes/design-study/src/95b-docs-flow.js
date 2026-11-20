/* The flow pattern, the sync model and the breakpoints, added to the Shared page. */
SPEC.components.splice(1, 1,
	['ActiveCard', 'Whoever is active, at full size: hero or monster, PC or adversary, even a moment (the lair, a legendary beat). Same frame for all: name and meta, defense, HP, resources, conditions, actions as numbered buttons, quick actions.', 'participant, kicker, actions[]', 'creature, moment, dying, legendary beat', '--g-now, --g-surface, display type'],
	['ParticipantList', 'Two sections under the card: Still to act (in the game’s order, or any order) and Acted (greyed, checked, shorter). Tap any row to make it active.', 'sections, nextId', 'to act, next, acted, out, moment', '--g-text-2, --g-surface-2'],
	['TurnMark', 'The 20px mark at the left of every row in every game: a ring (to act), an accent ring (next), a check (acted), a cross (out), a spark (a moment).', 'state', 'to act, next, acted, out, moment, now', '--g-line-strong, --g-accent-text, --g-text-2']);

sharedPage = (orig => () => {
	const page = orig();
	const st = (label, el) => h('div.state', h('span', label), h('div.spec-stage.g-base', { style: { padding: '8px 0' } }, el));
	const flow = h('div',
		h('h2.sec', { style: { marginTop: 0 } }, 'The flow pattern'),
		h('p.kicker', 'One way of running every game, decided with the user: the table runs the game and the plugin never enforces it.'),
		h('div.grid2',
			h('div', h('ol.prose', { style: { paddingLeft: '18px', margin: 0 } },
				h('li', h('b', 'The big card is whoever is active. '), 'Hero or monster, PC or adversary, or a moment (2014 lair, a legendary beat). Same card, same places, in every game.'),
				h('li', h('b', 'Still to act, then Acted. '), 'Acted rows are grey, checked and shorter, in every game, so the split is visible from across the table. Still to act keeps the game’s order (initiative, DEX) or none at all (Nimble’s heroes).'),
				h('li', h('b', 'Tap anyone to make them active. '), 'Acted or not, in or out of order. Nothing reshuffles: whoever was next stays next.'),
				h('li', h('b', 'Next = done + advance. '), 'It marks the active one acted and moves to the first still to act; with nobody left it starts the next round, side or turn. The button says where it goes ("Next: Corin", "Done · the Alchemist acts", "Next: Archers · 1 Fear").'),
				h('li', h('b', 'Moments sit in the flow, never in the way. '), 'Lair at 20, the legendary beat, a legendary action after a turn, the end of a round: shown where they happen, one tap or skip, never blocking Next.'),
				h('li', h('b', 'Aids are optional and quiet. '), 'Counts, tokens and reminders are settings; no button is ever disabled because a rule says so. Back undoes any step.'))),
			h('div.states', { style: { gridTemplateColumns: 'repeat(2, minmax(0,1fr))' } },
				st('Still to act', h('div.gl-r', { style: { border: 0, padding: '0 12px' } }, mark(''), h('span.nm', 'Goblin Boss'), h('em', '15'))),
				st('Next (what Next goes to)', h('div.gl-r', { style: { border: 0, padding: '0 12px' } }, mark('next'), h('span.nm', 'Corin'), h('em', '14'))),
				st('Acted this round', h('div.gl-r.acted', { style: { border: 0, padding: '0 12px', opacity: .62 } }, mark('acted'), h('span.nm', 'Ilse'), h('em', '19'))),
				st('Out', h('div.gl-r.acted', { style: { border: 0, padding: '0 12px' } }, mark('out'), h('span.nm', { style: { textDecoration: 'line-through' } }, 'Goblin C'), h('em', '0'))),
				st('A moment', h('div.gl-r', { style: { border: 0, padding: '0 12px' } }, mark('moment'), h('span.nm', 'Lair action'), h('em', '20'))),
				st('Now (on the open row)', h('div.gl-r', { style: { border: 0, padding: '0 12px' } }, h('span.ev-mark.is-now', icon('play', 10, 2.6)), h('span.nm', 'Skeletal champion'), h('em', '19'))))),
		h('h2.sec', 'One fight, many views'),
		h('p.kicker', 'The sidebar, a main tab and the player-safe view are the same view type drawing the same fight store. Every change goes through the store and is pushed to every open view; nothing waits for focus (the gap that leaves other Obsidian trackers stale on a second screen).'),
		h('div.sync-diagram',
			h('div.sd-store', h('b', 'Fight store'), h('small', 'one per campaign · every change, its log, Back'), h('code', 'changed → every view')),
			h('div.sd-views',
				h('div', h('b', 'Main tab'), h('small', 'runs the fight: card, lists, actions, keys')),
				h('div', h('b', 'Sidebar'), h('small', 'the glance: now, next, round; or the full panel when no main tab is open')),
				h('div', h('b', 'Player-safe'), h('small', 'a toggle on the main tab, nothing else: no controls, labels for monster health')))),
		h('ul.prose', { style: { paddingLeft: '18px' } },
			h('li', 'Selection is shared: tapping a creature in one view highlights it in the others.'),
			h('li', 'When a main tab is running the fight, the sidebar switches to the glance by itself, and back to the full panel when the tab closes.'),
			h('li', 'Encounter settings belong to the fight and apply to every view at once.')),
		h('h2.sec', 'Breakpoints'),
		h('table.slots-map', h('thead', h('tr', h('th', 'Main area width'), h('th', 'Where you meet it'), h('th', 'Layout'))), h('tbody',
			h('tr', h('td', 'under 480'), h('td', 'The sidebar (300\u2013420), a phone, a narrow split'), h('td', 'The sidebar layout: header, economy strip, the active card, the lists, the pinned footer.')),
			h('tr', h('td', '480\u2013660'), h('td', 'Laptop with both sidebars open (596 at 1280), iPad portrait with a pinned panel (520), splits'), h('td', 'One column: the active card first, then the lists, then the log or prompts.')),
			h('tr', h('td', '660\u20131000'), h('td', 'Laptop with one sidebar open, iPad portrait (820), iPad landscape with a pinned panel (880)'), h('td', 'Two columns: the lists beside the card; the third column folds under the card.')),
			h('tr', h('td', '1000 and up'), h('td', 'Laptop with no sidebars or the right one, iPad landscape (1180)'), h('td', 'Ribbon or band on top, then three columns: the lists, the card with actions, and the log, prompts or the boss pane.')))),
		h('p.note', 'See \u201cWidths: every sidebar configuration\u201d above for the full matrix.'),
		h('h2.sec', 'Naming'),
		h('p.prose', 'The plugin’s Cmd/Ctrl+K search box is called Omnisearch. In this study "spotlight" only ever means Daggerheart’s spotlight.'));
	page.prepend(flow);
	return page;
})(sharedPage);
