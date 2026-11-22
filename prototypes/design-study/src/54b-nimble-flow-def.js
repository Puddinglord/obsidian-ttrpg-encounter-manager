Object.assign(DEFS.nimble, {
	flowIntro: 'Sides, and no order inside a side. The big card is whoever is acting right now, hero or monster, in the same frame. Below it: who hasn’t gone this side, then who has, greyed with a check. Tap anyone to make them active; Next marks the active one done and moves on.',
	flowNotes: [
		'<b>Heroes go in any order.</b> The table decides ("I’ll go next"); the plugin never assumes a seat order. Next just picks the first hero still to act, and a tap picks anyone else.',
		'<b>The legendary beat is part of Next.</b> With a legendary monster in the fight, Done on a hero turns the card to the boss: "After Brakka’s turn", its two actions, the one used last time greyed and the other picked (the GM’s Guide says alternate). Next goes back to the heroes. Done rows show which action followed which hero.',
		'<b>Monsters’ side, same pattern:</b> monsters still to act, then acted. Packs of minions act together on one hero: one summed roll, one Defend. The legendary monster has no turn here; it’s listed, greyed, as "acts after each hero".',
		'<b>Rules from the 3.x drafts</b>, as the plugin uses them: Medium armor −10 and Heavy −20 for monsters, Last Stand regains 7 HP per hero, 1/round reactions reset at the end of your turn.',
		'Nothing is enforced. A monster can be tapped during the heroes’ side (some act sooner), the boss beat can be skipped, and Back undoes any step.',
	],
	flow: [
		{ cap: 'Start of round 3: heroes’ side', sub: 'Nobody has gone. The card shows the first hero only as a default; whoever speaks up gets tapped.', render: () => GN.flow('start'), height: 900 },
		{ cap: 'Mid-side: Orren acting', sub: 'Tamsin and Brakka are done (grey, checked), each followed by the Alchemist’s action. Next says what happens: Done, then the boss.', render: () => GN.flow('mid'), rec: true, height: 900 },
		{ cap: 'The legendary beat', sub: 'After Brakka: the boss in the same card, two actions, the alternate one picked. Next returns to the heroes.', render: () => GN.flow('beat'), height: 900 },
		{ cap: 'Monsters’ side', sub: 'The Taskmaster acts with its action menu on the card; the hound has acted; the rats go as a pack.', render: () => GN.flow('monsters'), height: 900 },
	],
	mainIntro: 'The main tab gives each part of a Nimble round its own place: heroes on the left, the active card in the middle, and on the right the boss, permanently, because it acts after every hero, over the monsters as big targets for damage.',
	main: [
		{ device: 'laptop', cap: 'Laptop: main tab and sidebar, in sync', sub: 'Three columns in the main tab; the sidebar shows the glance. Space is Done, 1–9 picks a monster action.', render: () => GN.main('laptop'), side: () => GN.glance() },
		{ device: 'landscape', cap: 'iPad landscape (1180 × 820): the legendary beat', sub: 'Same three columns. Here Brakka has just finished: the card is the boss, the boss pane shows the alternate pick.', render: () => GN.main('landscape', 'beat') },
		{ device: 'portrait', cap: 'iPad portrait (820 × 1180): two columns', sub: 'Card and heroes on the left; the boss pane and monsters on the right.', render: () => GN.main('portrait') },
	],
});
