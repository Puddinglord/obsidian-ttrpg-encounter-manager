/* Second round: the flow pattern and the main tab. */
CRITIQUE.push(['Pass 4 · flows in the sidebar, light, 1x and 2x', [
	'5e: at 720px tall the card pushed the lists below the fold, so the still-to-act / acted split, the point of the pass, wasn’t visible. Flow frames are now 860–900 tall, as a sidebar on a laptop is.',
	'5e: the legendary strip squeezed its sentence into three lines beside two buttons. Moments now put their buttons on a row under the text.',
	'The sidebar glance drew its turn marks as stretched ovals: a flex rule meant for the name hit the mark too. The name has its own class now.',
	'5e: a "Lair · 2014 only" slot showed in a 2024 fight’s ribbon. The lair appears only in 2014 fights.',
	'Nimble: the Done list put Brakka above Tamsin, though Tamsin went first, and the boss’s alternating actions were labelled the wrong way round. Done keeps the order heroes finished in; the boss rows alternate Spray, Transmute.',
	'Nimble: Last Stand still read "30 more damage" (the published GMG). It now follows the 3.x drafts the plugin uses: regains 7 HP per hero.',
	'Daggerheart: on the GM’s turn Kael was listed as "not yet in the spotlight" although he’d just had it. Fixed. The GM’s footer overflowed in the sidebar; it’s "To players" and "Next: Archers · 1 Fear".',
	'First draft hid conditions on acted rows to make them shorter. That hid concentration, persistent fire and a major wound, which the GM still needs. Acted rows now keep everything and are grey, checked and shorter instead.',
]]);
CRITIQUE.push(['Pass 5 · main tab at laptop, iPad landscape and iPad portrait, light and dark', [
	'Player-safe 5e was seven wide rows with the labels floating in the middle of a TV. Redesigned: a big Now panel and On deck beside it, then the order as cards, acted greyed.',
	'Player-safe Daggerheart was a small card in a big empty screen. It now shows Kael’s full spotlight card (without controls) at TV size, the party’s own tracks, and adversaries as labels.',
	'Portrait (820 × 1180) left half of each column empty. The log moves under the active card there, as it does on the laptop when the sidebar is open.',
	'The TV mock was 810 tall with nothing in the bottom third; it’s 640 now, closer to a 16:9 window.',
	'Dark: the "coming later" Fear slot’s dashed outline and the gold spotlight edge both hold up on the indigo-black; Nimble’s inverted primary button stays the loudest control in every device.',
]]);
CRITIQUE.push(['Pass 6 · the study itself on an iPad (1180 and 820 wide)', [
	'The study didn’t reflow: three 360px columns plus padding overflowed a 1180 screen. Grids now auto-fill, research boards drop to two then one column, the design-system grid stacks, and device mocks scale to the window (and rebuild on rotation).',
	'Checked there is no sideways scroll at 1180 and 820 in either theme.',
	'A :has() selector slipped into the Daggerheart CSS; removed (the plugin’s Chromium 124 rule). The component CSS is still free of clip-path, display: contents, column-gap and !important. Contrast re-measured: every role passes in both themes.',
]]);

overviewPage = (orig => () => {
	const page = orig();
	const card = h('div.card', { style: { margin: '8px 0 8px', maxWidth: '980px' } },
		h('h3.sub', { style: { marginTop: 0 } }, 'New in this pass: how each fight flows, and the main tab'),
		h('ul.prose', { style: { paddingLeft: '18px', margin: '0 0 6px' } },
			h('li', h('b', 'One flow pattern for every game: '), 'the big card is whoever is active (hero, monster, adversary or a moment); below it, Still to act and Acted (grey, checked); tap anyone to make them active; Next marks done and moves on. Nothing is ever enforced.'),
			h('li', h('b', 'Per game: '), '5e (2014 lair as a moment, legendary beats, grouped goblins); Nimble (heroes in any order, the boss after each hero, the monsters’ side); Daggerheart (the spotlight moved by hand, the GM’s turn, Encounter settings, Fear as "coming later"); PF2e and Call of Cthulhu with the shared marks.'),
			h('li', h('b', 'Main tab and sidebar together, in sync: '), 'laptop with the sidebar glance, iPad landscape (1180 × 820), iPad portrait (820 × 1180); player-safe mode for 5e and Daggerheart.'),
			h('li', h('b', 'Shared building blocks '), 'now opens with the flow pattern, the sync model and the breakpoints.')));
	page.insertBefore(card, page.children[2]);
	return page;
})(overviewPage);

appendixPage = (orig => () => {
	const page = orig();
	const extra = h('div.card', { style: { marginTop: '20px' } },
		h('h3.sub', { style: { marginTop: 0 } }, 'Building the flow and the main tab'),
		h('ul.prose', { style: { paddingLeft: '18px', margin: 0 } },
			h('li', h('b', 'One view type, two places. '), 'Obsidian lets the same ItemView open in a sidebar leaf or a main tab; the plugin already opens views both ways. Each view picks its layout from its own width (ResizeObserver), not the device.'),
			h('li', h('b', 'Sync. '), 'Every change already goes through the fight store and fires changed; a second open view redraws from that. Selection needs to join the store so a tap in one view highlights in the other.'),
			h('li', h('b', 'Acted state. '), 'Today’s models track whose turn it is, not who has acted. 5e and PF2e need an acted set per round (so tapping out of order works); Nimble’s done list already is one; Daggerheart needs spotlight counts per player and a "had it" set that resets when everyone has.'),
			h('li', h('b', 'Moments. '), 'The lair row, the legendary beat after each hero, legendary actions after a turn and the end of a round are entries the lists can hold without being creatures (the earlier note on core’s queue still applies).'),
			h('li', h('b', 'iPad. '), 'Side panels are drawers on iPad, so the main tab is where a fight runs there; the sidebar glance is a desktop pairing. Player-safe is a toggle on the main tab only: no separate window.'),
			h('li', h('b', 'Keys. '), 'In-view shortcuts (N, Space, 1–9, D, Z) need a focus rule so they never fire while typing in a note, and a setting to turn them off.'),
			h('li', h('b', 'Study-only. '), 'The player-safe Daggerheart mock is enlarged with CSS zoom; the real view would scale its type with a size setting instead.')));
	page.append(extra);
	return page;
})(appendixPage);
