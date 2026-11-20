Object.assign(DEFS['5e'], {
	flowIntro: 'Initiative order, with the shared pattern on top: the big card is whoever is active; below it, who still has to act this round, in order, then who has acted, greyed with a check. Tap anyone to make them active; Next finishes the turn and moves to the first who hasn’t acted.',
	flowNotes: [
		'<b>Still to act</b> keeps initiative order; <b>Acted</b> keeps it too, so the round reads top to bottom. When nobody is left, Next starts the next round and everyone moves back up.',
		'<b>Tapping out of order</b> never reshuffles anything: the tapped creature acts now and is marked acted; whoever was next stays next.',
		'<b>Identical monsters share one initiative</b> (both editions): one row, "2 of 3 up", one Next for the group or step through the members on the card.',
		'<b>Legendary actions</b> are a quiet strip after every other creature’s turn while uses remain. One tap uses one; it never blocks Next.',
		'<b>Edition:</b> 2014 puts a lair row at initiative 20 (losing ties), as a moment with the same card; 2024 has no lair row and gives the hag a 4th legendary use in its lair.',
	],
	flow: [
		{ cap: 'Start of round 3 (2014): the lair acts', sub: 'A moment is active the same way a creature is: the card holds the lair’s options; the one used last round is greyed.', render: () => G5.flow('start14'), height: 860 },
		{ cap: 'Mid-round (2024): the boss’s turn', sub: 'Ilse and the hag have acted: grey, checked, short. The goblins are one row with one initiative.', render: () => G5.flow('mid'), rec: true, height: 860 },
		{ cap: 'A legendary beat', sub: 'The boss is done; before Corin, the hag may react. One tap, or carry on with Next.', render: () => G5.flow('legendary'), height: 860 },
		{ cap: 'Tapped out of order', sub: 'The GM tapped Mara (she’s readied). She acts now; the Goblin Boss is still next.', render: () => G5.flow('tap'), height: 860 },
	],
	mainIntro: 'The same view type, open in a main tab, drawing the same fight store. The sidebar can stay open beside it as a glance: round, who’s active, who’s next. Everything happens in both at once.',
	main: [
		{ device: 'laptop', cap: 'Laptop (1440 wide): main tab and sidebar, in sync', sub: 'Main tab: the turn ribbon on top (acted greyed, now, the round marker, the lair slot in 2014), the participants on the left, the active card with its stat-block actions as numbered buttons in the middle. The sidebar shows the glance. Select or advance in either; the other follows.', render: () => G5.main('laptop'), side: () => G5.glance() },
		{ device: 'landscape', cap: 'iPad landscape (1180 × 820): three columns', sub: 'No sidebar (Obsidian’s side panels are drawers on iPad), so the log and prompts get the third column.', render: () => G5.main('landscape') },
		{ device: 'portrait', cap: 'iPad portrait (820 × 1180): two columns', sub: 'Participants and the active card side by side under the ribbon; the log moves behind the ⋯ menu.', render: () => G5.main('portrait') },
		{ device: 'tv', cap: 'Player-safe, on a TV or a turned laptop', sub: 'The same main tab with Player-safe on: no controls, no AC, monster HP as Unhurt / Bloodied / Down, the party’s own HP shown. Who’s up and who’s on deck in big type.', render: () => G5.safe() },
	],
});
