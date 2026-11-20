/* ============================================================================
   COMPENDIUM: the compendium tab, its dialog, entry cards and class pages, and
   the result rows of Spotlight and the "/" menu, in each game's look. Designed in
   the plugin (core/compendium/browser.ts, each game's cards), so the shots are
   screenshots of the real plugin with the sample vault (shots/*.png).
   ========================================================================== */

DEFS.nimble.compendium = {
	title: 'Compendium',
	lede: 'The compendium tab, its dialog, every entry’s card and the class pages, in the sheet’s language: parchment, charcoal, Vollkorn names, khaki ribbons. The same browser runs every game; the campaign it’s opened from gives it its look (.ev-sys-nimble), so Spotlight and the "/" menu’s rows match it too.',
	notes: [
		'<b>One browser, the game’s look.</b> The browser takes its game from the system’s compendium source, so the tab, the dialog and every picker (Add monster, /spell, the sheet’s + Item) sit on the sheet’s parchment in its type and colours. Spotlight and each "/" row wear the look of the campaign or note they’re opened from.',
		'<b>Tabs are the sheet’s tabs.</b> A word each in the condensed face on a hairline; the chosen one underlined by a bar that slides to it. When ten tabs don’t fit, they turn to Phosphor icons.',
		'<b>The search box is the Campaign panel’s</b>, and a typed filter becomes one of the sheet’s chips: square corners, its name quiet and its value bold.',
		'<b>Rows sit on hairlines; the chosen one is the tracker’s “now”</b>: a white card outlined in charcoal. The old accent stripe on its left edge is gone.',
		'<b>The square at the left says what it is.</b> A monster’s level in a box framed like the sheet’s stat boxes (a legendary’s box is charcoal, a minion’s dashed); a spell’s tier in mana blue, since casting is mana; a class’s own things (classes, subclasses, features, boons) in ochre; everything else charcoal on khaki. Your art takes the square when you’ve added some, the level on a chip in the same frame.',
		'<b>Tags lead, facts follow.</b> What it is (on All), Legendary, Minion or Draft, and the book (M&M, GMG) are tags, dark with white text, at the start of the line; the facts follow as chips and a chip that doesn’t fit drops out whole. A spell’s school carries its icon (fire, ice, lightning, necrotic, radiant, wind).',
		'<b>Group headings are the khaki ribbon</b> (Tier 3, Level 1/4) and stay put while their rows scroll.',
		'<b>A card is a page framed in charcoal</b>, like the campaign cards: the kind over the name in Vollkorn heavy italic, then the facts as chips, each label kept with its value (a spell’s mana cost in blue). No detail line repeating the chips. Rules text keeps the stat block’s measure: rolls boxed, rules words dotted, a run-in name (“Upcast.”) in Vollkorn.',
		'<b>A class page carries its name between the class’s scrollwork</b>, as the sheet’s class panel does; a subclass page uses its class’s motif. Sections sit under khaki ribbons, each level in a charcoal box, feature names in Vollkorn, option groups, subclasses and the FAQ as framed rows that fold open.',
		'<b>Icons are Phosphor Bold</b> for the game’s things: kinds (backpack, wand, sparkle, shield, path, scroll…), the tabs, the search and sort controls. The buttons under a page keep the stat block’s row of actions.',
		'<b>Spotlight and the “/” menu</b> use the same squares and names in the game’s face; what a row is sits on the right in quiet small capitals; the chosen row is “now”. A “/” badge is a tag, a difficulty keeping its colour as a dot, as the encounter blocks show it; commands stay in the interface face.',
		'<b>Measured:</b> every chip, tag, square, key, level box and folding row is centred on its capitals within 1px (the pills e2e tests cover the tab, its panels, a spell, a class page, Spotlight and the “/” menu). Vollkorn’s capitals sit about 1px high in a centred line, so the ribbons and folding rows nudge their words down.',
	],
	shots: [
		{ device: 'img', src: 'design-study/shots/nimble-compendium-spells.png', w: 900, cap: 'The tab: Spells, a school filter as a chip, Pyroclasm’s card', sub: 'Tiers under khaki ribbons; tiers in mana blue; the school as an icon; the chosen row outlined, not striped.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-class.png', w: 900, cap: 'A class page', sub: 'Berserker between its scrollwork, facts as chips, Levels under a ribbon, each level in a charcoal box.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-adversaries.png', w: 900, cap: 'Adversaries', sub: 'Levels framed like the stat boxes; a minion’s dashed; the book as a tag before the facts.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-dialog.png', w: 760, cap: 'The dialog at 760px wide', sub: 'Too narrow for a page beside the list, so the list alone; the tabs as icons; on All each row leads with its kind.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-sidebar.png', w: 340, cap: 'In a sidebar, 340px', sub: 'One column; facts that don’t fit drop out whole.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-card-dark.png', w: 620, cap: 'A subclass card, dark', sub: 'Its class’s motif around its name.' },
		{ device: 'img', src: 'design-study/shots/nimble-spotlight.png', w: 620, cap: 'Spotlight', sub: 'The compendium’s squares; the kind in quiet small capitals.' },
		{ device: 'img', src: 'design-study/shots/nimble-slash.png', w: 420, cap: 'The “/” menu', sub: 'The chosen row’s square in charcoal.' },
		{ device: 'img', src: 'design-study/shots/nimble-compendium-phone.png', w: 320, cap: 'Phone', sub: 'The page alone, Back to the list above it.' },
	],
};

DEFS['5e'].compendium = {
	title: 'Compendium',
	lede: 'The same browser in 5e’s look: Garamond small caps, oxblood and gold on the book’s paper. Every entry reads like the SRD, in the stat block’s dress for its edition, and a class page carries the class’s scrollwork.',
	notes: [
		'<b>The tabs are the sheet’s</b>: small caps on a gold hairline; the open tab carries the oxblood bar and its diamond, sliding to the tab you pick. The rules edition sits above them as a small joined switch, oxblood when chosen.',
		'<b>Rows</b>: names in Garamond (spells in the book’s italic); a CR framed in gold, a spell’s level and the kinds’ icons on the stat block’s cells in the book’s red. Tags (what it is on All, SRD, a pack) are oxblood with white text; facts are outlined in gold like the sheet’s tags. The chosen row is the tracker’s “now”, outlined all round.',
		'<b>Group headings</b> (CR 1/4, Level 3) are red small caps over the rule, staying put while their rows scroll.',
		'<b>A card is drawn as the SRD sets it, in its edition’s dress.</b> 2024: the warm card with the double gold hairline, the name in Garamond small caps over an oxblood rule, the italic line under it (a spell’s classes in it, as SRD 5.2 writes them: “Level 3 Evocation (Sorcerer, Wizard)”). 2014: the amber page between ochre bars, a red taper under the head, and the classes after the text.',
		'<b>Labels in the book’s red, run-in headings in bold italic</b>: “Using a Higher-Level Spell Slot.”, a species’ traits, a weapon’s properties. Every roll a gold wash, rules words a dotted gold line, as in the stat blocks.',
		'<b>A class page carries its name between the class’s scrollwork</b> (the sheet’s); a subclass page uses its class’s motif. The level table sets its heads in small caps over a gold rule, rows in alternating cells, and scrolls sideways in a narrow pane instead of crushing its columns.',
		'<b>Spotlight and the “/” menu</b> share the rows: the CR in its gold frame, kinds on the stat block’s cells, names in Garamond; the kind on the right in quiet small capitals.',
	],
	shots: [
		{ device: 'img', src: 'design-study/shots/5e-compendium-spells.png', w: 900, cap: 'The tab: Fireball, 2024', sub: 'The double gold hairline, the oxblood rule, the classes in the italic line, a run-in heading.' },
		{ device: 'img', src: 'design-study/shots/5e-compendium-class.png', w: 900, cap: 'A class page', sub: 'Wizard between its scrollwork; the level table in the book’s cells.' },
		{ device: 'img', src: 'design-study/shots/5e-compendium-2014.png', w: 900, cap: 'Fireball, 2014', sub: 'The amber page, ochre bars, a red taper; the classes after the text.' },
		{ device: 'img', src: 'design-study/shots/5e-compendium-monsters-dark.png', w: 900, cap: 'Monsters by challenge, dark', sub: 'CRs in gold frames, red small-caps headings, SRD as a tag.' },
		{ device: 'img', src: 'design-study/shots/5e-compendium-sidebar.png', w: 340, cap: 'In a sidebar, 340px', sub: 'The tabs as icons with the oxblood bar.' },
		{ device: 'img', src: 'design-study/shots/5e-spotlight.png', w: 620, cap: 'Spotlight', sub: 'Garamond names, kinds on the book’s cells.' },
		{ device: 'img', src: 'design-study/shots/5e-slash.png', w: 420, cap: '“/spell fire”', sub: 'The chosen row in oxblood; the kind said quietly.' },
	],
};
