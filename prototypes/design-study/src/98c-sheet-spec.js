/* The Shared page learns about sheets, NPC cards and stat blocks. */
sharedPage = (orig => () => {
	const p = orig();
	const G = ORDER.map(id => DEFS[id].name);
	const fields = [
		['Header', 'Portrait left; name; identity line; level or tier; Rest and Level up on the right', ['Level 5 Elf Wizard (Evoker), Sage', 'Orc · Berserker · Level 3', 'Occupation, age, place, year (no level)', 'Class · Subclass, domains, Level in a shield', 'Traits as tags; Level 1; Hero Points']],
		['Defense', 'First thing in the vitals band', ['AC in a shield', 'Armor (a number for heroes, a letter for monsters)', 'Dodge as a roll pill', 'Evasion in an arch; Armor score + slots', 'AC, and AC with the shield raised']],
		['HP-like tracks', 'The shared meter (− / bar / + / keypad), or slots where the game marks', ['HP + temp; death saves at 0', 'HP + temp; the Wounds chain', 'HP, Sanity, Luck, MP as Max | Current boxes', 'HP and Stress as slots; thresholds strip', 'HP; Dying and Wounded tags']],
		['Stats and skills', 'Rolls on tap, every one', ['Abilities with skills under them', 'Four stat shields with save marks; ten skills with their stat', 'Regular | Half | Fifth pills', 'Six trait banners with verbs; Experiences', 'Attribute mods; skills with T/E/M/L']],
		['Resources', 'Pips (the shared pip spec) or the game’s own marks', ['Spell slots, hit dice, limited uses', 'Three action cards; Fury dice; mana meter', 'Luck spends; MP', 'Hope diamonds; Proficiency; gold', 'Hero Points; focus points; spell slots']],
		['Conditions', 'The shared chips, one row under the vitals', ['Chips; concentration as a chip', 'Chips with values', 'Status boxes in the sheet’s order', 'Chips; Vulnerable when Stress is full', 'Trait-style tags with values']],
		['Player-said actions', 'Quiet chips: the player says it, one tap, nothing asks', ['Shield on the keypad', 'Defend, Interpose on the keypad', '—', 'Hope: Help an ally, Experience, Tag team; Armor slot', 'Raise Shield']],
	];
	const parts = [
		['Portrait', 'The note’s portrait property, or initials on the game’s tint; round on sheets, tall on NPC cards.'],
		['Meter', 'HP and mana: −, the bar with its number and temp, +, the keypad. Taps batch.'],
		['Slots and pips', 'Slots for marked tracks (Stress, HP in Daggerheart), pips for resources; the changed one animates.'],
		['Keypad', 'One keypad everywhere, with the game’s working line and its quiet player-said chips.'],
		['Chips', 'Conditions; the + chip opens the shared picker with timing.'],
		['Roll buttons and the toast', 'Every number that rolls is a button; the result lands in a toast at the bottom of the note and in the roll log.'],
		['Rules words', 'Dotted underline; tap opens the rule’s card (core’s rule terms).'],
		['Compact header', 'When a sheet scrolls, name, AC/defense and HP stick to the top.'],
	];
	const sec = h('div',
		h('h2.sec', 'Sheets, NPCs and stat blocks'),
		h('p.kicker', 'The same rule as the tracker: shared placement so nobody is lost switching games, each game’s own type, colour and marks. A sheet is a block that takes over its note; the layout follows the sheet’s own width (container queries), so the same sheet works in a note, a hover card and on a phone.'),
		h('h3.sub', 'Fields every sheet has, and how each game fills them'),
		h('table.slots-map', h('thead', h('tr', h('th', ''), h('th', 'Same place, every game'), G.map(n => h('th', n)))), h('tbody', fields.map(([f, same, per]) => h('tr', h('td', f), h('td', same), per.map(t => h('td', t)))))),
		h('h3.sub', 'Shared components'),
		h('table.t', h('tbody', parts.map(([n, d]) => h('tr', h('td', h('b', n)), h('td', d))))),
		h('h3.sub', 'The NPC card'),
		h('ul.prose', { style: { paddingLeft: '18px' } },
			h('li', h('b', 'Shared: '), 'portrait, name, role, facts (ancestry · pronouns · age), faction / found at / first met, status and attitude pills, label/value rows, the secret.'),
			h('li', h('b', 'Each game adds, GM only: '), '5e AC, HP, CR and a stat block; Nimble level, armor letter, HP; Daggerheart a Difficulty and Trigger/Effect features (with show-to-players); PF2e Creature N, AC, HP, Perception; Call of Cthulhu the two-line characteristics block.'),
			h('li', h('b', 'Player view: '), 'the same frame with the player’s own notes ("What we know"). Stats and secrets are not drawn at all, not blurred.')),
		h('h3.sub', 'One stat block, three places'),
		h('ul.prose', { style: { paddingLeft: '18px' } },
			h('li', h('b', 'In a note: '), 'full width, the edition’s order and words.'),
			h('li', h('b', 'Hover card: '), 'the same renderer at about 420px (compact type), from any reference (5e:, nimble:, dh:…).'),
			h('li', h('b', 'Quick look: '), 'the same compact block in a sheet over the tracker; Daggerheart adds a row of slots per copy in the fight.'),
			h('li', 'Rolls and rules words work the same in all three.')));
	const keys = [...p.querySelectorAll('h2.sec')].find(x => x.textContent === 'Keys');
	if (keys) keys.parentNode.insertBefore(sec, keys); else p.append(sec);
	return p;
})(sharedPage);

CRITIQUE.push(['Pass 9 · sheets, NPC cards and stat blocks (laptop, iPad, phone), light', [
	'Every sheet collapsed to a sliver on its first render: a flex column with auto margins shrank the container-query box to nothing. The note content now takes the full width up to 920px.',
	'Roll toasts sat at the end of long sheets, out of sight. They now pin to the bottom of the note view, as Obsidian’s notices do.',
	'iPad portrait showed the top of the sheet, not the state it was about (casting, rolling). Scrolled states now show the compact header that sticks to the top: name, AC, HP.',
	'Overpass draws its middle dot hard against the next word ("Guardian ·Stalwart"). A unicode-range face borrows the dot from a system font for Daggerheart only.',
	'Daggerheart: "Motives & tactics" broke onto two lines because the paragraph shared a class with the main-tab layout. Renamed.',
	'5e: "Saving throw" truncated in narrow ability cards; it’s "Save".',
	'Nimble: Bite (2×) read as always-on next to an OR list; it’s now one of three choices under "Choose 1", as the GM’s Guide prints them.',
	'Call of Cthulhu: every status box drew ticked. Unticked boxes are empty now; only Temporary insanity ticks after the Sanity loss.',
	'PF2e: the AC shield had no outline (its stroke colour wasn’t defined for PF2e), and "Wounded 0" showed as a live tag. Fixed; Dying and Wounded appear only when they apply.',
]]);

overviewPage = (orig => () => {
	const p = orig();
	const card = h('div.card', { style: { margin: '8px 0', maxWidth: '980px' } },
		h('h3.sub', { style: { marginTop: 0 } }, 'New: character sheets, NPC cards and stat blocks'),
		h('p', { style: { margin: 0 } }, 'Each game tab now has sub-tabs: Tracker, Character sheet, NPC, Stat block and Design system. Every surface starts from the official sheets and books (the user\u2019s PDFs, cited by page) and shares placement with the others: portrait and name top left, defense and HP in one band, conditions in one row, rolls on every number, player-said actions as quiet chips.'));
	p.insertBefore(card, p.children[2]);
	return p;
})(overviewPage);
