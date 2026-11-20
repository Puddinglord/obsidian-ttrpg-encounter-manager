/* ============================================================================
   Builders and dialogs, for Nimble and 5e (design pass, wave 2): the roll
   dialog and its toast, Add several, the encounter builder, references and
   their hover cards, homebrew blocks, the entity builder, the party editor,
   and maps with pins and tokens. Designed in the plugin, so archived as
   screenshots of it (36-img-shot.js; PNGs in ../shots, taken by
   e2e/tools-shots.mjs from the sample vault).
   ========================================================================== */
const TOOL_SHOT = (file, w, cap, sub) => ({ device: 'img', src: `design-study/shots/${file}.png`, w, cap, sub });

DEFS.nimble.tools = {
	title: 'Builders and dialogs',
	lede: 'Everything you open to make or roll something, in Nimble’s look: parchment, charcoal, Vollkorn heavy italic names, red for HP and blue for mana. Every dialog is one frame (core/dialog.ts), so the roll dialog, Add several, the encounter builder and the party read as one product with the sheet and the tracker.',
	notes: [
		'<b>One dialog frame for every game.</b> <code>gameDialog()</code> puts Obsidian’s modal on the game’s paper (its <code>--modal-background</code> follows the game), sets the title in the game’s name type, and gives it the HP keypad’s footer: on a keypad-sized dialog Cancel and the main button fill the row, 1 : 2; on a wide one Cancel sits left and the actions right, as in the builder. Labels sit over their controls with their value beside them (“Advantage Normal”), never stretched to the far edge.',
		'<b>Roll dialog.</b> The dice are on a screen in Nimble’s figures (“2d20 keep 1 high + 3”), so the Roll button carries a d20 for a d20 roll and the dice icon otherwise. Check | Save and Advantage (−3 to +3) are sliding segments, as the keypad’s modes. Advantage isn’t green or red: its value and the sheet’s ▲ / ▼ say it. Modifier is on the keypad’s keys. Dice to spend (Judgment, Fury) are tiles you tap in: a tick and a full outline when they’re in, the damage type as its icon.',
		'<b>The roll’s toast</b> is the study’s: the die (a d20 for a d20 roll), what was rolled, then the dice and the total in the game’s figures. A crit or a miss is a tag after the total, and “= 17 CRIT” never splits across lines.',
		'<b>Add several.</b> The count on the keypad’s keys (the number takes typing and ↑ ↓), Strength as three equal segments with what you’d get beside its label (“Lvl 2 · 19 HP each”), the total above the footer. The line that explained the arrow keys is gone.',
		'<b>Encounter builder.</b> The rating is the encounter block’s dark tag with a coloured dot, over a charcoal meter on the HP bar’s empty track; ticks mark where the bands start and the band it’s in is named under it (only that one when the dialog is narrow). The budget and the party are one line, the party a link to edit it. The bestiary is a list of rows (level as a dark tag, the name in Vollkorn), the fight a list with the keypad’s keys. Balance’s targets slide; each suggestion is a card with the tag it lands on. “Add the party when run” is the keypad’s quiet chip: dashed, then solid with a tick.',
		'<b>References</b> keep one anatomy in every game and take its colours: charcoal for monsters, mana blue for spells, ochre for items. The hover card’s frame (its bar, paper and edge) follows the game of what it shows.',
		'<b>Homebrew spells and items</b> are the compendium’s card for the same kind of thing, framed in the note as the encounter block is. The Edit pencil sits on the card’s corner, on its paper.',
		'<b>The builder.</b> Kinds, steps and controls draw Phosphor Bold (<code>gameIcon()</code> maps the Lucide names a system passes). Step headings and the check’s value are set in Vollkorn heavy italic, field labels in the sheet’s condensed capitals. The verdict is a dark tag with its tone as a dot; each meter’s label sits beside its value, and HP’s bar is red. Help that repeated a field’s placeholder is gone.',
		'<b>Character wizard.</b> New character and Level up are one carousel in a game dialog: step chips along the top (charcoal for the one on show, a green tick when done), one decision a step, and Back | Next in the keypad’s footer. Stats draw the sheet’s own boxes and save triangles; KEY is ochre, the class’s colour, and so is the subclass you choose. HP is red, schools and spells blue, everything else charcoal. Names are Vollkorn, labels the condensed capitals; nothing explains a label or prints a formula.',
		'<b>Party editor.</b> A game dialog in the look of the game being played: column heads as labels, names in Vollkorn, numbers in the figures, Add hero and Level up as the dialog’s buttons. The settings page keeps Obsidian’s own look.',
		'<b>Maps.</b> The map wears its campaign’s game: the toolbar as pill buttons (the one that’s on a full charcoal tint), charcoal pins with red for encounters and danger and ochre for treasure, labels as dark tags in the condensed face. Monsters are charcoal discs with white initials, heroes sit on parchment, a legendary monster’s ring is ochre; the tray’s names are in Vollkorn.',
		'<b>Measured.</b> Every new pill, tag and compact button is in the shared centring rule and in <code>PILL_SELECTORS</code>; the e2e test “pills: builders and dialogs line up” measures Add several, the encounter builder, the party, both games’ builders, the roll toast and both games’ maps within 1px.',
	],
	shots: [
		TOOL_SHOT('nimble-roll-dialog', 452, 'Roll dialog: a check', 'The dice on the screen, Check | Save as halves, Advantage and Modifier over their controls, Cancel | Roll with a d20.'),
		TOOL_SHOT('nimble-roll-dialog-phone', 390, 'Roll dialog on a phone: a save', 'Save takes its ▲ from the sheet and the dialog keeps its height.'),
		TOOL_SHOT('nimble-roll-result', 230, 'Where a roll lands', 'The die, what was rolled, the dice and the total in Nimble’s figures.'),
		TOOL_SHOT('nimble-add-several', 452, 'Add several', 'The keypad’s keys around the count; Strength as three equal segments, what you’d get beside its label.'),
		TOOL_SHOT('nimble-encounter-builder', 932, 'Encounter builder', 'The rating as the encounter block’s tag over a charcoal meter, balance suggestions as cards, the bestiary and the fight as lists of rows.'),
		TOOL_SHOT('nimble-encounter-builder-dark', 932, 'Encounter builder, dark', 'The same tokens, dark: the paper, the charcoal turned light, the tags still dark with light text.'),
		TOOL_SHOT('nimble-encounter-builder-phone', 390, 'Encounter builder on a phone', 'One column: the fight first, then the bestiary; only the band it’s in is named under the meter.'),
		TOOL_SHOT('nimble-refs', 720, 'References in a sentence', 'One anatomy, Nimble’s colours: monsters charcoal with their level, the spell in mana blue, the item in ochre.'),
		TOOL_SHOT('nimble-hover', 444, 'A reference’s hover card', 'The stat block in its frame, the frame on Nimble’s paper.'),
		TOOL_SHOT('nimble-homebrew-spell', 664, 'A homebrew spell (```nimble-spell)', 'The compendium’s spell card, framed as a card in the note.'),
		TOOL_SHOT('nimble-homebrew-item', 664, 'A homebrew item (```nimble-item)', 'The compendium’s item card in the same frame.'),
		TOOL_SHOT('nimble-builder-monster', 1080, 'New monster: Start', 'Phosphor icons on kinds and steps, the heading in Vollkorn, labels in condensed capitals, the verdict as a dark tag, HP’s bar red.'),
		TOOL_SHOT('nimble-builder-spell', 1080, 'New spell: Start', 'The schools keep their colours on their icons; the check reads the tier from the damage.'),
		TOOL_SHOT('party-editor', 812, 'Party editor', 'A game dialog: names in Vollkorn, numbers in the figures, Add hero and Level up as its buttons.'),
		TOOL_SHOT('nimble-new-character', 852, 'New character: Stats', 'The sheet’s own stat boxes and save triangles; the array starts where the class puts it, KEY in ochre under the key stats, and two taps swap a pair (the first tapped lifts in an ochre ring).'),
		TOOL_SHOT('nimble-new-character-phone', 390, 'New character on a phone', 'The same boxes four across; step chips scroll sideways and the steps swipe.'),
		TOOL_SHOT('nimble-level-up', 852, 'Level up: the subclass', 'Each subclass on a charcoal band, its name in Vollkorn; the one chosen gets an ochre ring and its levels in this run an ochre tint. No stripes, no rainbow.'),
		TOOL_SHOT('nimble-map', 716, 'A GM map with the encounter as tokens', 'Charcoal pins, red for encounters and danger; monsters as charcoal discs, the tray’s names in Vollkorn.'),
	],
};

DEFS['5e'].tools = {
	title: 'Builders and dialogs',
	lede: 'The same frames in the book’s dress: oxblood and gold, EB Garamond small caps for names and labels, Alegreya Sans for the text. One anatomy, 5e’s look.',
	notes: [
		'<b>The same dialog frame.</b> A 5e dialog’s title is EB Garamond small caps in oxblood over a gold hairline; its labels are small caps too, as the sheet sets them. The footer and segments are the keypad’s.',
		'<b>References</b> take 5e’s colours: oxblood for monsters (with their CR), spells and the rest of the compendium; gold for items. The hover card’s frame is on 5e’s paper.',
		'<b>Homebrew spells and items</b> (```5e-spell, ```5e-item) are the compendium’s card on the book’s paper with the NPC card’s gold hairline. They say <b>Homebrew</b> where the SRD’s say SRD 5.2, in the block and in the compendium. The Edit pencil shows on hover, as it does on Nimble’s blocks (it didn’t on 5e’s before).',
		'<b>The builder</b> draws Phosphor icons; labels are small caps in oxblood, the edition is a dark oxblood tag, and HP’s bar is green, 5e’s HP colour, as on the 5e sheet and tracker.',
		'<b>The roll’s toast</b> sets the total in EB Garamond; a crit’s tag is oxblood.',
		'<b>Maps</b> in a 5e campaign: oxblood pins with a gold ring, labels in Garamond small caps on a dark oxblood tag, monsters as oxblood discs with a gold ring, heroes on the paper in oxblood.',
	],
	shots: [
		TOOL_SHOT('5e-refs', 720, 'References in a sentence', 'Monsters with their CR in oxblood, the spell in oxblood, the item in gold.'),
		TOOL_SHOT('5e-hover', 444, 'A reference’s hover card', 'The 2024 stat block, its frame on 5e’s paper.'),
		TOOL_SHOT('5e-roll-result', 236, 'Where a roll lands', 'A d20 for a d20 roll, the total in EB Garamond.'),
		TOOL_SHOT('5e-homebrew-spell', 664, 'A homebrew spell (```5e-spell)', 'The compendium’s card with the gold hairline; Homebrew, not SRD 5.2.'),
		TOOL_SHOT('5e-homebrew-item', 664, 'A homebrew item (```5e-item)', 'The same frame.'),
		TOOL_SHOT('5e-builder-monster', 1080, 'New monster: Basics', 'Labels in small caps, the edition as an oxblood tag, the stat block the book’s.'),
		TOOL_SHOT('5e-builder-spell', 1080, 'New spell', 'The same frame for a spell.'),
		TOOL_SHOT('5e-builder-phone', 390, 'New monster on a phone', 'Full screen; the preview is a button in the footer.'),
		TOOL_SHOT('5e-map', 716, 'A GM map with the fight as tokens', 'Oxblood pins with a gold ring; the fight’s monsters as oxblood discs, their names in Garamond small caps.'),
	],
};
