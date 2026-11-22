/* ============================================================================
   Research boards: what each game actually looks like, with sources. Values
   marked "approx" are read by eye from photos or PDFs; the rest come from
   stylesheets and source files.
   ========================================================================== */
const S = (label, url) => ({ label, url });
const RESEARCH = {};

RESEARCH['5e'] = {
	cards: [
		{ t: 'Palette', sw: [['#EEE5CE', '2014 parchment'], ['#58180D', 'heading oxblood'], ['#9C2B1B', 'rule red'], ['#C0AD6A', 'gold underline'], ['#F6F3EE', '2024 card'], ['#5B160C', '2024 header']],
			li: [
				['The 2014 books: parchment, oxblood headings, a red rule, a gold underline under section heads.', S('Homebrewery 5ePHB theme', 'https://github.com/naturalcrit/homebrewery/blob/master/themes/V3/5ePHB/style.less')],
				['2024 stat blocks are calmer: a flat warm card (#F6F3EE), a 1px inset double border, 8px radius, a 2px rule under headers. Physical abilities warm, mental abilities cool.', S('D&D Beyond compendium CSS', 'https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024')],
				['Foundry’s 5e meters are colour-coded: HP green, hit dice maroon, spell slots purple, temp HP teal (#007F7F). Dark mode is blue-grey with a gold accent.', S('foundryvtt/dnd5e base.less', 'https://github.com/foundryvtt/dnd5e/blob/master/less/variables/base.less')],
			] },
		{ t: 'Type', li: [
			['2014: Mrs Eaves small caps for headings (a Baskerville revival), Bookmania body, Scala Sans for tables; stat-block names in small caps.', S('Solbera font notes', 'https://github.com/jonathonf/solbera-dnd-fonts')],
			['D&D Beyond’s UI is Roboto Condensed for uppercase labels and Roboto for text; 2024 stat-block headers are bold condensed caps.', S('DDB site CSS', 'https://www.dndbeyond.com')],
			['Foundry v3+: Modesto Condensed for names, Roboto Slab and Roboto elsewhere.', S('dnd5e character.less', 'https://github.com/foundryvtt/dnd5e')],
		] },
		{ t: 'Iconography and ornament', li: [
			['The 2014 tapered red bar above and below a stat block is the motif everyone remembers. 2024 dropped it for a plain rule.', S('Homebrewery', 'https://homebrewery.naturalcrit.com')],
			['D&D Beyond draws sheet boxes as SVG frames with notched corners; Foundry uses a shield badge for AC, gold lozenges for initiative and speed.', S('dnd5e ui/ assets', 'https://github.com/foundryvtt/dnd5e')],
			['Condition icons in Foundry are filled single-path silhouettes.', S('Foundry statuses', 'https://foundryvtt.com/article/combat/')],
		] },
		{ t: 'Sheet conventions', li: [
			['AC in a shield; current, max and temp HP as separate boxes; three-and-three death save circles.', S('Sheet walkthrough', 'https://olddungeonmaster.com/2015/02/14/dd-5e-character-sheet-instructions/')],
			['2024 stat blocks put initiative near the top, next to AC.', S('DDB preview', 'https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024')],
		] },
		{ t: 'Trackers people use', li: [
			['DDB Maps lists name, AC, HP and initiative for the DM; players see portrait flags. Complaints: no reordering, no conditions, a tracker "too large to get an overview".', S('DDB feedback thread', 'https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/147289-feedback-combat-tracker')],
			['Lair actions at initiative 20 have been requested since 2020 and still get forgotten.', S('DDB changelog comments', 'https://www.dndbeyond.com/old-changelog/733-combat-tracker-alpha-change-log?page=11')],
			['Foundry 5e groups identical monsters with a count; Shieldmaiden fires reminders (concentration on damage, start-of-turn effects).', S('Shieldmaiden', 'https://shieldmaiden.app/tools/combat-tracker')],
		] },
		{ t: 'What players feel', li: [
			['Fans rebuilt the 2014 fonts and theme by hand (Homebrewery, GM Binder): the parchment-and-oxblood look is loved.', S('Homebrewery', 'https://homebrewery.naturalcrit.com')],
			['The 2014 textures and image bars read as dated; 2024 captions are called too small.', S('necropraxis', 'https://necropraxis.com/2024/09/')],
		] },
	],
	borrow: ['A warm card on a warm page, oxblood for names and the one primary action', 'Small-caps serif names (Baskerville is what Mrs Eaves revives)', 'AC in a shield, beside HP', 'Three-and-three death saves', 'One thin rule under the current creature’s name, as the 2024 blocks do', 'Group identical monsters; keep lair actions in the order'],
	avoid: ['Parchment texture, image bars, notched frames on every box', 'Pure #BC0F0F red as a large field', 'Uppercase condensed labels everywhere', 'Colour-coding every meter (it fights the oxblood)', 'Official fonts, the ampersand, the name “D&D”'],
	direction: ['<b>The 2024 stat block, at the table.</b> A calm warm card with one oxblood voice. Names in Baskerville small caps, numbers in a clean sans. The only ornament is the single rule under whoever is acting.', 'The fight reads like the book: initiative down the left, AC in a shield, HP at the right edge.'],
};

RESEARCH.nimble = {
	cards: [
		{ t: 'Palette', sw: [['#EFF0F5', 'site off-white'], ['#000000', 'site black'], ['#E32402', 'site red'], ['#ECE5D2', 'book page (approx)'], ['#4A4A4A', 'sheet charcoal (approx)'], ['#D9906A', 'emblem copper (approx)']],
			li: [
				['The site is red, black and off-white: most sections #eff0f5 with red #e32402 buttons; a green #15a908 call to action.', S('nimblerpg.com page source', 'https://nimblerpg.com')],
				['The books are cream pages with black text and grey rounded callouts; class emblems are black plus a copper tone.', S('Store photos', 'https://nimblerpg.com')],
				['The official character sheet is pure greyscale: charcoal bars, white boxes, light-grey labels.', S('Character sheets PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/CharacterSheets.pdf')],
			] },
		{ t: 'Type', li: [
			['Quickstart PDF: headings in Beaufort Pro Heavy Italic small caps; body in <b>Avenir Next Condensed</b>.', S('Basic rules PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/NimbleBasicRules.pdf')],
			['The site sets headings in a heavy italic sans (Alegreya Sans 900 italic) over Archivo.', S('nimblerpg.com', 'https://nimblerpg.com')],
			['The sheet’s labels are condensed caps reversed out in white on charcoal bars.', S('Character sheets PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/CharacterSheets.pdf')],
		] },
		{ t: 'Iconography', li: [
			['On the sheet: a heart over Hit Points, a blood drop for Wounds; small filled glyphs on a line-drawn sheet.', S('Character sheets PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/CharacterSheets.pdf')],
			['Monster cards put HP in a heart and armor as a one-letter flag: M or H.', S('Monster cards photo', 'https://nimblerpg.com')],
			['Wounds on the sheet are five circles joined by a bar, ending in a skull: the sixth is death.', S('Character sheets PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/CharacterSheets.pdf')],
		] },
		{ t: 'Rules that shape the panel', li: [
			['Heroes act, then monsters. Initiative sets how many actions you get on your first turn (1, 2 or 3), not when you act.', S('Basic rules PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/NimbleBasicRules.pdf')],
			['Legendary monsters act after <i>each</i> hero’s turn and change at Bloodied (half HP) and Last Stand.', S('Nimble blog: legendary monsters', 'https://nimblerpg.com/blogs/news/legendary-monsters-in-5e-how-to-fix-them')],
			['Minions have no HP: any damage kills one. Armor is none, Medium or Heavy.', S('Basic rules PDF', 'https://cdn.shopify.com/s/files/1/0679/1456/3753/files/NimbleBasicRules.pdf')],
		] },
		{ t: 'Other tools', li: [
			['The official Foundry system shows combat as a horizontal strip of cards: heroes with a d20 and “3/3”, then monsters; solo monsters slot in after each hero.', S('FoundryVTT-Nimble docs', 'https://github.com/Nimble-Co/FoundryVTT-Nimble')],
			['Foundry’s monster sheet splits Features, Actions, then Bloodied in red and Last Stand in orange.', S('FoundryVTT-Nimble', 'https://github.com/Nimble-Co/FoundryVTT-Nimble')],
			['NimbleRPG.app (an Improved Initiative fork) runs “Heroes → Monsters → Combat” with Last Stand HP.', S('nimblerpg.app', 'https://nimblerpg.app/')],
		] },
		{ t: 'What players feel', li: [
			['“Slay the TTRPG slog”, “Attacks. Just. Hit.” The pitch is speed: monsters easy to run, no lookups mid-fight.', S('EN World thread', 'https://www.enworld.org/goto/post?id=9837353')],
			['Physical action cards “keep things flowing”: the three actions are something you hold.', S('EN World thread', 'https://www.enworld.org/goto/post?id=9837353')],
		] },
	],
	borrow: ['Heavy italic for names (sentence case, not caps)', 'Avenir Next Condensed for data, as the books set it', 'Charcoal bars with white type for the side whose turn it is', 'Three big action marks per hero', 'Wounds as linked circles ending in a skull', 'Armor as a letter (M, H); Bloodied and Last Stand as marks on the HP bar', 'Red #E32402 in small doses: Wounds, Last Stand'],
	avoid: ['Screaming condensed caps for everything', 'Parchment and filigree', 'An initiative number as the sort key: Nimble doesn’t have one', 'Red and green as large fields', 'The wordmark, the action-card art, the class emblems'],
	direction: ['<b>The game sheet, sped up.</b> Greyscale and ink like the official sheet, with one red for blood. The side whose turn it is wears the sheet’s charcoal bar; names are heavy italic and quick to read.', 'The three actions are the biggest thing on a hero, because they are what a Nimble player is thinking about.'],
};

RESEARCH.pf = {
	cards: [
		{ t: 'Palette', sw: [['#5E0000', 'trait tag'], ['#D8C384', 'tag border gold'], ['#171F69', 'navy secondary'], ['#C45500', 'uncommon'], ['#0C1466', 'rare'], ['#F8F4F1', 'Foundry background']],
			li: [
				['Trait tags are dark oxblood with a gold double border and white type: Archives of Nethys (#531004) and Foundry (#5e0000) arrive at the same thing.', S('AoN Typography.css', 'https://2e.aonprd.com/Styles/Typography.css')],
				['Foundry’s base: primary #5e0000 (also the HP bar), navy #171f69 (headers, temp HP), parchment gold #e9d7a1. Rarity: uncommon orange, rare navy, unique purple.', S('foundryvtt/pf2e _colors.scss', 'https://github.com/foundryvtt/pf2e/blob/master/src/styles/_colors.scss')],
				['Threat in Foundry’s tracker: trivial aqua through extreme red, on a dark panel.', S('foundryvtt/pf2e styles', 'https://github.com/foundryvtt/pf2e')],
			] },
		{ t: 'Type', li: [
			['Books (pre-Remaster): Taroca headers, Good OT for tables and feats, Sabon body.', S('Paizo forum thread', 'https://paizo.com/threads/rzs42rpd')],
			['Foundry substitutes Eczar for display, Gelasio for body, Roboto Condensed for UI. Trait text: 10px, uppercase, 0.05em tracking, weight 500, 2px radius.', S('pf2e _typography.scss', 'https://github.com/foundryvtt/pf2e/blob/master/src/styles/mixins/_typography.scss')],
			['AoN sets trait tags in bold small caps.', S('AoN', 'https://2e.aonprd.com')],
		] },
		{ t: 'Iconography', li: [
			['The action marks: a notched diamond for one action, two or three linked diamonds, a hollow diamond for free, a hooked arrow for a reaction.', S('RPGBot on actions', 'https://rpgbot.net/p2/how-to-play/actions-reactions-and-activities/')],
			['The glyph font is licensed only under the Compatibility License and can’t be altered or redistributed; the Community Use Package has no action icons. <b>We draw our own marks.</b>', S('Paizo Community Use Policy', 'https://paizo.com/licenses/communityuse')],
			['Foundry’s condition icons come from game-icons.net (CC-BY).', S('pf2e conditions REFERENCE', 'https://github.com/foundryvtt/pf2e')],
		] },
		{ t: 'Stat-block conventions', li: [
			['Name left, “Creature 2” right, on one line; then the traits row; rules between Perception, AC/saves/HP, and actions.', S('AoN monster page', 'https://2e.aonprd.com/Monsters.aspx?ID=2778')],
			['Conditions are named with numbers: frightened 2, dying 1.', S('AoN conditions', 'https://2e.aonprd.com/Conditions.aspx?ID=76')],
		] },
		{ t: 'Rules that shape the panel', li: [
			['Dying 4 kills, minus Doomed; recovery check is a flat DC 10 + dying; losing Dying adds Wounded 1.', S('AoN: Dying', 'https://2e.aonprd.com/Conditions.aspx?ID=69')],
			['Persistent damage at the end of your turn, then a DC 15 flat check to end it. Frightened drops by 1 at the end of your turn.', S('AoN: Persistent damage', 'https://2e.aonprd.com/Conditions.aspx?ID=86')],
			['Delay takes you out of the order; you come back after anyone’s turn. Threat budgets: trivial 40, low 60, moderate 80, severe 120, extreme 160.', S('AoN: Delay', 'https://2e.aonprd.com/Actions.aspx?ID=2294')],
		] },
		{ t: 'Other tools', li: [
			['Foundry pf2e uses the core tracker; modules add action pips, Slowed and Stunned at turn start, Delay and Return buttons.', S('pf2e-auto-action-tracker', 'https://foundryvtt.com/packages/pf2e-auto-action-tracker')],
			['Stat blocks are called cluttered and HP “buried”; the Remaster is praised as cleaner.', S('EN World thread', 'https://www.enworld.org/threads/lets-look-at-some-monster-stat-blocks-for-pathfinder-2.665409')],
		] },
	],
	borrow: ['Trait-style tags for conditions with values (FRIGHTENED 1): the one place uppercase is native', 'Oxblood for tags, navy for the current turn and actions', 'Three action marks and a reaction on every turn, drawn by us', 'Name and “Creature 2” on one line', 'Dying as four steps with Wounded beside it', 'The threat word (Severe) in the header'],
	avoid: ['The Pathfinder-Icons font or traced glyphs', 'Copying the books’ trade dress (the policy forbids it)', 'Foundry’s neon threat colours', 'Proficiency boxes and stat-block walls in a sidebar', 'Burying HP under text'],
	direction: ['<b>A precise instrument.</b> Cool white, crisp lines, small radii. Navy carries the turn; oxblood belongs to conditions. Every row shows its action economy, because in PF2e the question is always “how many actions are left?”', 'The densest of the five, with the most information per row, but the same layout, so it never turns into a stat-block wall.'],
};
