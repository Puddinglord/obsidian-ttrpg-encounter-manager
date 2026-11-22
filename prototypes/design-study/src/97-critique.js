CRITIQUE.push(['Pass 2 · every page, light and dark, 1x; every frame in dark, 2x', [
	'Overview: the five thumbnails ran past the right edge and clipped PF2e’s HP column. Scale and gap tightened so all five fit in 1320px.',
	'Design-system pages: the "current" state of Call of Cthulhu’s entry pushed the page 24px wider than the window; state cells were narrower than a real row. States now render at the real row width (336px), three across.',
	'5e: with no conditions, "+ Condition" sat alone on a line and pushed the round marker below the fold. It became an icon button beside Damage and Heal; the chip row appears only when there is something on the creature.',
	'5e dark: the oxblood names needed lifting to stay above 4.5:1 on the dark card (now #E79A86, 6.9:1). The primary button stays a deeper red with white text.',
	'Nimble dark: the white primary button is now the brightest thing in the panel. Kept deliberately: the sheet’s inversion (dark bar, light text) flips in dark mode, and the main button should be the loudest control.',
	'Call of Cthulhu: the keypad’s third mode said "Armour", which isn’t a mode. It is now "Impale" (an extreme success with an impaling weapon), which really changes the sum.',
	'Daggerheart: the footer read "GM’s turn ·+1 Fear" with the dot crowding the number. The dot is gone; the +1 Fear is a lighter second label.',
	'Spec: the Track model still offered a "numbers" drawing for CoC after research showed Chaosium dropped number tracks. It is now "box" (Max | Current), as drawn.',
]]);
CRITIQUE.push(['Pass 3 · overlays and edge states, light and dark, 2x; the squint test', [
	'PF2e: the four degrees of success squeezed "Crit success" onto two lines in a 75px cell. They are a 2×2 grid with the book’s full words.',
	'Nimble: the keypad offered Crit twice (as a mode and as a key). Crit stays a key, as in every other game; the modes are Damage, Heal, Temp.',
	'Squint test (6px blur): all five are still told apart by shape and colour alone: the warm card and oxblood bar; the charcoal switch and black action cards; the airy olive-ruled page; the gold-edged card and indigo tokens; the dense cool list with oxblood tags.',
	'Checked every overlay against its panel: prompts, keypads and pickers leave the header visible, so the GM always knows whose sheet is open.',
	'Contrast, measured on the surface each role sits on, in both themes: three shape roles failed 3:1. The 5e dark button (2.8) and PF2e dark button (2.9) were lifted to #B84A3B and #4F5FDA, with white text still above 4.5:1. Daggerheart’s gold (1.8–1.9 on parchment) keeps its fill but gains a darker edge: #A87A1E on the Hope diamonds, #AD7D22 for the spotlight edge. Every role in every game now passes.',
	'Left as known gaps: a 7th or 8th combatant scrolls under the 5e card at 720px tall (Compact density is the answer); Daggerheart’s countdowns take two rows when there are three or more.',
]]);
