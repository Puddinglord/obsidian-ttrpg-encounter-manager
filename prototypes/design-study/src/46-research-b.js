RESEARCH.coc = {
	cards: [
		{ t: 'Palette', sw: [['#FCF9F4', 'book page'], ['#EDE7D9', 'page edge'], ['#525B39', 'heading olive'], ['#C9A24A', 'sheet gold (approx)'], ['#922D2E', 'Foundry HP'], ['#2E4B1F', 'Foundry Sanity']],
			li: [
				['Quick-Start pages are off-white (#FCF9F4) darkening to #EDE7D9 at the edges. Headings are <b>olive green #525B39</b>, not red.', S('7e Quick-Start PDF', 'https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf')],
				['The 1920s investigator sheet uses gold ornaments (#F4BE40), near-black ink and grey box fills.', S('1920s investigator sheet', 'https://downloads.chaosium.com/call-of-cthulhu/cha2300-investigator-sheets/CoC7_Investigator_Sheet_Standard_autocalc.pdf')],
				['Foundry’s CoC7 gives each pool its own muted colour: HP #922D2E, MP #101345, Luck #79501C, Sanity #2E4B1F.', S('CoC7-FoundryVTT globals', 'https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/blob/develop/styles/coc7-globals.less')],
			] },
		{ t: 'Type', li: [
			['Books: Adobe Caslon body; Voltaire (condensed caps) for running heads; small-caps subheads.', S('Quick-Start PDF fonts', 'https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf')],
			['Sheets: Bookmania (a Bookman revival) in letter-spaced small caps for labels; a condensed sans for the tiny Reg / Half / Fifth heads.', S('Modern sheet', 'https://downloads.chaosium.com/call-of-cthulhu/cha2300-investigator-sheets/CoC7_Investigator_Sheet_Modern_autocalc.pdf')],
			['Readers praise the 7e books as easy to read; the old printer-friendly plainness is missed.', S('Keeper Rulebook reviews', 'https://www.chaosium.com/call-of-cthulhu-keeper-rulebook-hardcover/')],
		] },
		{ t: 'Sheet conventions', li: [
			['Every characteristic and skill is a pill split in three: <b>Regular | Half | Fifth</b> (Regular, Hard, Extreme).', S('1920s sheet', 'https://downloads.chaosium.com/call-of-cthulhu/cha2300-investigator-sheets/CoC7_Investigator_Sheet_Standard_autocalc.pdf')],
			['Pools are boxes: HP and MP <i>Maximum | Current</i>, Luck <i>Starting | Current</i>, Sanity <i>Starting | Current | Insane</i>.', S('Modern sheet', 'https://downloads.chaosium.com/call-of-cthulhu/cha2300-investigator-sheets/CoC7_Investigator_Sheet_Modern_autocalc.pdf')],
			['Status is a row of checkboxes in a fixed order: Temporary insanity, Indefinite insanity, Major wound, Unconscious, Dying. The old strike-through number tracks are gone from current sheets.', S('1920s sheet', 'https://downloads.chaosium.com/call-of-cthulhu/cha2300-investigator-sheets/CoC7_Investigator_Sheet_Standard_autocalc.pdf')],
		] },
		{ t: 'Ornament', li: [
			['Books: aged edges, tentacle flourishes on rules, a strip of glyphs in the margins. Sheets: a deco frieze, section labels running vertically down the left edge.', S('Quick-Start PDF', 'https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf')],
			['Chaosium’s fan policy forbids its logos; the Elder Sign is part of its brand presentation.', S('Chaosium fan material policy', 'https://www.chaosium.com/fan-material-policy/')],
		] },
		{ t: 'Rules that shape the panel', li: [
			['DEX order; a gun already drawn adds 50. Firearms can’t be fought back, only dived from.', S('Chaosium wiki: combat', 'https://cocwiki.chaosium.com/rules/combat.html')],
			['A blow of half max HP or more is a <b>major wound</b>: CON roll or fall unconscious. At 0 HP with a major wound you are <b>dying</b>: a CON roll at the end of each round; only First Aid stabilises.', S('Chaosium wiki: wounds', 'https://cthulhuwiki.chaosium.com/rules/hit-points-wounds-and-healing.html')],
			['Sanity loss is written x/y. Losing 5 or more at once calls for an INT roll; success means temporary insanity and a bout of madness.', S('Chaosium wiki: sanity', 'https://cthulhuwiki.chaosium.com/rules/sanity.html')],
		] },
		{ t: 'Other tools', li: [
			['Foundry CoC7 puts a revolver toggle on each combatant: draw the gun, +50, re-sort.', S('CoC7 combat.js', 'https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT')],
			['Its sheet uses parchment backgrounds and coloured ribbon tabs; the investigator sheet’s display face is a vaudeville condensed.', S('CoC7-FoundryVTT', 'https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT')],
		] },
	],
	borrow: ['Olive green for structure; muted per-pool colour for HP and Sanity only', 'Caslon for names, small caps for the few labels, as the books and sheets do', 'The Regular | Half | Fifth pill, wherever a roll is asked', 'Status as the sheet’s checkboxes, in the sheet’s order', 'DEX order with a drawn-gun +50 toggle', 'Rules instead of cards: a page, not a dashboard'],
	avoid: ['Tentacles, glyph strips, the Elder Sign, the wordmark', 'Typewriter fonts, rubber stamps, blood', 'Parchment textures and vignettes', 'Fake number tracks: Chaosium dropped them', 'Anything that makes combat look routine'],
	direction: ['<b>The investigator’s page.</b> Off-white paper, near-black ink, olive rules and Caslon names. No cards: entries on a ruled page, in DEX order, with a lot of air, because a fight in this game is rare and should feel heavy.', 'Colour turns up only when something is wrong: a wound, a lost point of Sanity.'],
};

RESEARCH.dh = {
	cards: [
		{ t: 'Palette', sw: [['#F1ECDF', 'card creator bg'], ['#B0A589', 'border'], ['#6B6247', 'dark border'], ['#F3C267', 'Hope gold'], ['#352AB2', 'Fear indigo'], ['#18162E', 'deep indigo']],
			li: [
				['The official print sheets are greyscale: charcoal header blocks, mid-grey banners, white fields.', S('Character sheets PDF', 'https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf')],
				['The official card creator’s adversary editor is parchment: #f1ecdf, #fcfbf8, borders #b0a589 / #6b6247, text #4a4338. Domains have their own colours (blade #af231c, codex #24395d, sage #244e30…).', S('Card creator', 'https://cardcreator.daggerheart.com/')],
				['The official Foundry system draws Hope as gold (#F3C267) and Fear as indigo (#352AB2 → #18162E).', S('Foundryborne/daggerheart', 'https://github.com/Foundryborne/daggerheart')],
			] },
		{ t: 'Type', li: [
			['Sheets and SRD: <b>Eveleth Clean</b>, a heavy, slightly rough caps display; <b>Overpass</b> (free, OFL) for labels and body.', S('SRD 2.0 PDF', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
			['Chunky all-caps section heads (“DAMAGE & HEALTH”), plain sans text, bold-italic feature names.', S('Character sheets PDF', 'https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf')],
			['Foundry’s Cinzel serif caps are its own choice, not the official look.', S('Foundryborne fonts.less', 'https://github.com/Foundryborne/daggerheart')],
		] },
		{ t: 'Sheet conventions', li: [
			['<b>Hope: six diamonds</b> on a grey band. HP and Stress: rows of rounded rectangles; dashed outlines for slots not yet earned.', S('Character sheets PDF', 'https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf')],
			['Damage thresholds as a strip: MINOR ▸ [5] ▸ MAJOR ▸ [9] ▸ SEVERE, with “Mark 1 / 2 / 3 HP” under each.', S('Character sheets PDF', 'https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf')],
			['Armor slots are small shields; Evasion sits in an arch. Adversary lines read “Difficulty 12 | Thresholds 5/9 | HP 4 | Stress 3”.', S('SRD 2.0', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
		] },
		{ t: 'Ornament', li: [
			['No filigree on the official sheets: chamfered corners, double rules, banners with pointed ends, a charcoal parallelogram header.', S('Character sheets PDF', 'https://www.daggerheart.com/wp-content/uploads/2025/05/Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf')],
			['SRD adversary blocks are light-grey cards with clipped corners.', S('SRD 2.0', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
		] },
		{ t: 'Rules that shape the panel', li: [
			['No initiative. Players keep the spotlight until a roll with Fear or a failure; the GM can spend Fear to interrupt. Fear goes up to 12 and carries over.', S('SRD 2.0, p.46–49', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
			['Damage against thresholds marks 1, 2 or 3 HP; an Armor slot drops it one step. Minion (X): any damage defeats one, every X more takes another.', S('SRD 2.0', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
			['Countdowns tick by boxes or a spinning die; the SRD offers an optional spotlight tracker of tokens per player.', S('SRD 2.0', 'https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf')],
		] },
		{ t: 'Other tools', li: [
			['Foundry: a spotlight tracker with player <i>requests</i>; modules add a big Fear bar and a per-player spotlight count for fairness.', S('Spotlight counter module', 'https://foundryvtt.com/packages/daggerheart-spotlight-counter')],
			['Players praise the tactile tokens and cards; Demiplane’s screen version is called “immaculate”.', S('Wargamer review', 'https://www.wargamer.com/daggerheart/review')],
		] },
	],
	borrow: ['Overpass, the sheets’ own free face; heavy caps only for the two section labels', 'Six diamonds for Hope; rounded slots for HP and Stress', 'Gold for Hope, indigo for Fear, and nothing else saturated', 'The threshold strip, in the damage keypad', 'Chamfered cards, as the sheets and SRD blocks have', 'A spotlight count per player'],
	avoid: ['Initiative numbers and a round-order list', 'Cinzel-style fantasy serifs (that’s Foundry’s look)', 'Skulls for Fear, hue-shifted tokens', 'Glows and purple gradients', 'Domain colours as big fills'],
	direction: ['<b>A table, not a queue.</b> The party sits together as four chamfered cards, the adversaries below, and the GM’s Fear across the top. The spotlight is a gold edge on whoever has it, and the main button passes it.', 'Greyscale like the sheets, with exactly two colours of meaning: Hope’s gold and Fear’s indigo.'],
};

const TRACKER_SURVEY = [
	['Foundry VTT (core)', 'A sidebar list: portrait, name, initiative, hidden and defeated toggles; Begin, Next, End. Players get End turn.', 'Effects show as tiny glyphs; the active row is only tinted. Dock and carousel modules exist because the sidebar feels cramped.', 'https://foundryvtt.com/article/combat/'],
	['Combat Tracker Dock (Foundry module)', 'A horizontal strip of portraits across the top, the current one bigger, one HP bar each.', 'Great on a big shared screen; names and conditions hide in hover.', 'https://foundryvtt.com/packages/combat-tracker-dock'],
	['Owlbear Rodeo initiative', 'A small popover: tokens added from the map, a number to sort, an arrow to advance. Forks add portraits, rounds and an "acted" checkbox mode.', 'HP lives on the tokens, not in the list.', 'https://extensions.owlbear.rodeo/initiative-tracker'],
	['Improved Initiative', 'One dense column (init, name, HP, AC, tags) with the active stat block beside it; keyboard-driven.', 'Tags can last until the start or end of someone’s turn. Free, refined; sync costs money.', 'https://arcaneeye.com/dm-tools-5e/best-dnd-5e-initiative-tracker/'],
	['Shieldmaiden', 'Damage several targets at once, resistances applied, a damage log with undo, reminders on events (concentration, start-of-turn effects), a player screen.', 'The "all-options" tracker; needs an account.', 'https://shieldmaiden.app/tools/combat-tracker'],
	['D&D Beyond (Encounters, Maps)', 'Name, AC, HP, initiative; players see portrait flags; Next with undo.', '"Too large to get an overview", no reordering, no conditions, lair actions forgotten.', 'https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/147289-feedback-combat-tracker'],
	['Roll20 Turn Order', 'A floating list; the top entry moves to the bottom.', 'No round counter, for ten years.', 'https://app.roll20.net/forum/post/6198383/need-a-round-counter-api-script-but-dont-know-what-to-use'],
	['Daggerheart in Foundry', 'Spotlight with requests, Hope and Fear from rolls, countdowns.', 'Modules add a big Fear bar and spotlight counts: core hid the meta-resources.', 'https://www.screenhype.co.uk/daggerheart-on-foundryvtt-tested-fear-never-looked-so-good/'],
	['PF2e in Foundry', 'Core tracker plus modules: action pips, Slowed and Stunned handled at turn start, Delay and Return buttons, threat in the header.', 'The action economy is the thing modules keep adding.', 'https://foundryvtt.com/packages/pf2e-auto-action-tracker'],
	['Nimble in Foundry', 'A horizontal card strip: heroes, then monsters; solo monsters after each hero.', 'Respects sides; cards get small at sidebar width.', 'https://github.com/Nimble-Co/FoundryVTT-Nimble'],
];
const TRACKER_LESSONS = [
	'Overview beats detail: compact rows, detail on demand.',
	'Show the round and who’s next together, always.',
	'Next is the most-pressed control: big, in one place, with Back beside it.',
	'HP is one tap and a number; undo should be one tap too.',
	'Conditions need durations and reminders, or GMs go back to paper.',
	'Things tied to a moment (lair at 20, legendary after each hero) belong in the order, not in memory.',
	'Identical monsters: distinct labels, and a way to group them.',
	'Model the game’s own turn structure; a sorted number list doesn’t fit spotlight or sides.',
	'Meta-resources (Fear, legendary actions) need a glanceable home.',
];
