Object.assign(DEFS.dh, {
	flowIntro: 'No initiative and no rounds; the spotlight moves when the GM moves it. The big card is whoever has it: a player character, or on the GM’s turn an adversary, in the same frame. Below: who hasn’t had the spotlight yet, then who has. Tap anyone to hand it to them.',
	flowNotes: [
		'<b>The spotlight moves by hand, every time.</b> The tracker never moves it from a roll. Next hands it to the player who has had it least; GM’s turn hands it to the GM; a tap hands it to anyone.',
		'<b>"Had the spotlight"</b> is the acted state here: a check and a grey card, with a count (×2). When everyone has had it, the list starts again. Counting is a setting; so are the book’s Spotlight Tracker tokens and the playtest’s action tracker.',
		'<b>The GM’s turn</b> uses the same pattern with adversaries: the first spotlight is free, each extra adversary shows "1 Fear", and Next moves to the next one. Nothing checks the Fear; the GM decides.',
		'<b>Fear</b> keeps its place at the top, marked as coming later: the GM’s pool, visible to the table, details to figure out.',
		'Moving the spotlight from logged rolls is shown in the settings as an idea, off by default.',
	],
	flow: [
		{ state: 'Start of the fight', diff: 'Nobody has had the spotlight. Nim started (the party spotted them first); the others wait, least-spotlit first.', render: () => GD.flow('start'), height: 900 },
		{ state: 'Players’ spotlight: Kael has it', diff: 'Nim and Maren have had it (×1, grey, checked); Tobin hasn’t, so Next names him. GM’s turn sits beside it.', render: () => GD.flow('players'), rec: true, height: 900 },
		{ state: 'A reaction roll: Passed / Failed', diff: 'The brute’s Thorn snare calls for Agility reaction rolls. The players roll at the table; the GM marks each target Passed or Failed in its own joined cluster, and Failed applies the condition.', render: () => GD.flow('reaction'), height: 900 },
		{ state: 'The GM’s turn', diff: 'The brute has the spotlight, in the same big card: Difficulty in the arch, its actions with their Fear costs. The other adversaries cost 1 Fear each.', render: () => GD.flow('gm'), height: 900 },
	],
	mainIntro: 'Wide, Daggerheart becomes a table: the spotlit card on the left, the party and the adversaries to its right, Fear and countdowns as a band across the top. Encounter settings are one button away.',
	main: [
		{ device: 'laptop', cap: 'Laptop: main tab and sidebar, in sync', sub: 'Kael has the spotlight in both. The sidebar glance shows who hasn’t had it yet.', render: () => GD.main('laptop'), side: () => GD.glance() },
		{ device: 'landscape', cap: 'iPad landscape (1180 × 820): the GM’s turn', sub: 'The brute in the big card; the other adversaries with their Fear cost; the party waits.', render: () => GD.main('landscape', 'gm') },
		{ device: 'portrait', cap: 'iPad portrait (820 × 1180): one column', sub: 'The band, then the spotlit card, then the party in a row of three, then the adversaries.', render: () => GD.main('portrait') },
		{ device: 'tv', cap: 'Player-safe', sub: 'Who has the spotlight, very large; the party’s own Hope, HP and Stress; adversaries as Unhurt / Hurt / Nearly down; Fear in its slot (coming later). No controls.', render: () => GD.safe() },
		{ custom: () => h('div', { style: { display: 'flex', gap: '40px', alignItems: 'flex-start' } }, GD.settings(), h('div.prose', { style: { maxWidth: '420px', fontSize: '14px' } },
			h('p', h('b', 'Encounter settings for Daggerheart.'), ' Opened from the main tab’s button or the sidebar’s ⋯ menu. Every aid is optional and quiet: counts, tokens and the action tracker change what the cards show, never what the GM can do.'),
			h('p', 'Moving the spotlight from roll results is listed as an idea, off by default, so a table that wants it can try it. Fear has a reserved row, striped: it’s coming, and how it works is still open.'))),
			cap: 'Encounter settings', sub: 'Spotlight counts, Spotlight Tracker tokens (and how many each), the action tracker, the auto-move idea, and the Fear tracker placeholder.' },
	],
});
