/* ============================================================================
   Daggerheart: the visual brief. What makes it look like Daggerheart, from the
   user's reference, Demiplane (the official toolset), the print sheet and book,
   Foundryborne and the community tools. Described, never copied; no art.
   Screenshots of public pages: /tmp/ev-refs/dh/web/ (not embedded).
   ========================================================================== */
const DHB = {
	demi: S('Demiplane sheet, via GamingTrend', 'https://gamingtrend.com/editorials/is-demiplanes-daggerheart-tool-set-going-beyond-d-d-beyond'),
	demiTr: S('Demiplane sheet, via TechRaptor', 'https://techraptor.net/tabletop/guides/daggerheart-rpg-character-creation-guide'),
	demiR20: S('Demiplane in Roll20', 'https://help.roll20.net/hc/en-us/articles/30050730960151'),
	nexus: S('Daggerheart Nexus', 'https://app.demiplane.com/nexus/daggerheart'),
	site: S('daggerheart.com', 'https://www.daggerheart.com/'),
	sheet: S('Core Rulebook p.343–344 (class sheets pp.371–384)', '#'),
	book: S('Core Rulebook pp.26–27, 193, 210, 243', '#'),
	fb: S('Foundryborne', 'https://foundryvtt.com/packages/daggerheart'),
	fcg: S('FreshCutGrass encounter manager', 'https://freshcutgrass.app/encounter-manager'),
	user: S('the user’s companion-app reference', '#'),
};
DEFS.dh.research = {
	cards: [
		{ t: 'The bar: a companion app the user likes', li: [
			['A deep indigo ground (#1A1531) with a lighter indigo hero band (#2D235D → #211A44) that ends on a slant. Gold trim everywhere (#F2C167, warming to amber #E38B3C at the tips).', DHB.user],
			['Cream crests with gold rims and navy banner labels for Evasion, Armor, Level and the six traits; the verbs in small type underneath. A round portrait in a gold ring; the name in heavy caps; the class in italic gold caps.', DHB.user],
			['Gold-outlined pill tabs on a gold rule (active: royal indigo with gold text). Cream panels with navy ribbon headers whose ends are chevrons; navy table heads with white caps; alternating cream rows; gold heart and shield slot icons.', DHB.user],
		] },
		{ t: 'Demiplane, the official toolset', li: [
			['The same grammar: gold-rimmed crests with dark plates, black ribbons with arrow-cut ends and gold edges, heavy geometric caps. Gold corner filigree around the whole sheet.', DHB.demi],
			['Damage thresholds are royal-purple chevron plates (≈#4B2FA0) with white number boxes between them; Hope is six diamonds on a purple bar, gold when filled. Feature cards: a dark title bar with a small gold tag ("ABILITY") over a white body.', DHB.demiTr],
			['Adversary and environment blocks are cream cards with heavy black caps, italic tier lines and bold-italic feature names; dice in small outlined boxes.', DHB.demiR20],
			['The Nexus: purple gradients, bevelled gold buttons in italic heavy caps, gold tracked caps for titles.', DHB.nexus],
		] },
		{ t: 'The print sheet and the book', li: [
			['Every stat sits in a shape: Evasion an arch with shoulder tabs, Armor a crowned shield with twelve small shield slots, Level a tall shield, each trait a banner tab (with a mark circle) over a pointed shield. Section heads are long plaques with chevron ends on hairline panels.', DHB.sheet],
			['The class block is a dark slab with a slanted edge: the class in heavy caps, the domains in light caps beside two domain glyphs.', DHB.sheet],
			['Domain cards: a coloured pennant at top left with the level and domain mark, a round recall token with a bolt, a type plate on a gold band, the name in heavy caps. The Domain Circle page is gold linework on royal indigo: the brand’s two colours.', DHB.book],
			['Stat blocks: heavy caps name, italic "Tier 1 Bruiser", italic description, an inset box for Difficulty, thresholds, HP, Stress and the attack, then FEATURES.', DHB.book],
		] },
		{ t: 'Foundryborne and the community', li: [
			['Foundryborne: navy-black windows with thin gold borders, Cinzel-style gold serif names (its own choice), shield badges with gold label tabs, a MINOR · MAJOR · SEVERE strip under the portrait.', DHB.fb],
			['FreshCutGrass: white adversary cards with a gold top edge, an angled role tab (SOLO, BRUISER) at the top right, a gold pentagon for the tier, grey chevron threshold plates, dashed "FEATURES" dividers. Painted blue ground.', DHB.fcg],
			['daggerheart.com: an indigo hexagon nav plaque with gold outline; gold buttons in black heavy caps.', DHB.site],
		] },
		{ t: 'Palette', sw: [['#14102B', 'night ground'], ['#2F2667', 'hero band'], ['#0F0C24', 'navy (dark)'], ['#1C1745', 'navy (light)'], ['#F2C167', 'gold'], ['#E38B3C', 'amber'], ['#2C2660', 'ink plate (thresholds, Hope bar)'], ['#3D3196', 'royal'], ['#FBF8F0', 'paper'], ['#ECE4D1', 'parchment'], ['#1D1842', 'ink'], ['#43329A', 'Fear plate (dark)'], ['#E3DAFF', 'Fear plate (light)'], ['#B9A6FF', 'Fear rim (dark)'], ['#5A3CC8', 'Fear (paper)'], ['#A8262A', 'adversary tag'], ['#2F6B3A', 'environment tag'], ['#8A5A0E', 'NPC tag'], ['#B8333C', 'HP'], ['#8A5A0E', 'gold text on paper']],
			li: [['Indigo and gold carry the identity; paper carries the reading. Saturated colour means something: gold Hope, violet Fear, red marked HP. Domain colours only on domain cards.', DHB.user]] },
		{ t: 'Shapes', li: [
			['<b>Crests</b> (inline SVG, no clip-path): arch for Evasion, crowned shield for Armor, tall clipped shield for Level, banner-over-shield for traits, a dark heater shield for an adversary’s Difficulty. Cream face, 2.4px gold rim, a thin inner line, a navy banner with a gold edge.', DHB.sheet],
			['<b>Ribbons</b> (CSS only): a navy plaque with gold top and bottom edges; each end a rotated square half-filled navy, outlined gold on its outer sides, with two box-shadows giving the gap and the amber chevron outside.', DHB.user],
			['<b>Domain cards</b> (pass 4): the book’s card frame at any width from one variable: a swallowtail pennant (SVG) with the level over the domain’s mark, a cream recall pill with a bolt, a gold band across the middle with a hexagonal type plate, the name in heavy caps, the feature. The art is a placeholder: the domain’s colour, a soft light, its mark large and faint.', S('CR p.26', '#')],
			['<b>Type glyphs</b> (pass 4): fifteen line glyphs of our own (one per adversary and environment type, and NPC) on a tag in the kind’s colour.', S('CR pp.194, 241', '#')],
			['<b>Plates</b>: threshold blocks with border-triangle arrows; the Hope bar a royal plate with triangle ends. <b>Bands</b>: a hard-stop gradient for the slanted hero edge.', DHB.demi],
		] },
		{ t: 'Type', li: [
			['Overpass (OFL) everywhere, as the sheets use it: Black 900 caps for names, ribbons, tabs, crest labels and buttons; 800 italic caps in gold for class lines; 600 italic for every explaining sentence. Closest free stand-ins for the book’s display caps: Overpass Black, then Montserrat ExtraBold.', DHB.sheet],
			['Bundle a Latin subset of 400, 600, 800, 900 and 600/800 italic. Not Cinzel: that is Foundry’s voice, not the game’s.', DHB.fb],
		] },
		{ t: 'Panels, tables, tabs', li: [
			['A panel is paper with a 1.5px gold edge and a 10px radius; its ribbon sits centred on the top edge. Paper resets every token to ink-on-cream, so it reads the same in both themes.', DHB.user],
			['Tables: a navy head with white tracked caps; rows alternate paper and a warm grey, each with a royal 3px tick on the left. Numbers in white boxes outlined royal.', DHB.demi],
			['Tabs: navy pills with a gold outline sitting on a gold rule; the active one royal with gold text and a soft gold halo. On parchment, inactive tabs turn paper.', DHB.user],
		] },
		{ t: 'Ornament, icons, density', li: [
			['Ornament is structural, not filigree: gold rims, amber chevrons, a gold rule fading out, one gold frame for the spotlight. No glow except Fear’s gems and the lit Hope diamonds.', DHB.demi],
			['Icons are line icons at 1.9, gold on navy. Game marks are our own: Hope diamonds, armor shields, violet Fear gems, simple domain glyphs drawn fresh. No book art, no logos.', DHB.book],
			['Dense like a sheet: 6px between cards, 9–14px inside, rows of 52px, tap targets of 30px and up.', DHB.user],
		] },
		{ t: 'Critique log: six passes against the references', li: [
			['<b>Pass 1 (tracker).</b> Side by side with the companion app it read as Daggerheart at once. Fixed: caps buttons overflowing the spotlit card, Hope chips wrapping one per line, the "coming later" flag unreadable on the violet Fear pool. From Demiplane: threshold blocks became royal plates with white number boxes, and the Hope bar a royal plate.', S('shots: /tmp/ev-refs/dh/p1', '#')],
			['<b>Pass 2 (sheet, blocks, design system).</b> Weapons became the reference’s rows (name, then "trait · range · feature" under it) instead of a three-column table that crushed the names. Lit Hope diamonds were dark inside the bar. Contrast: gold trim on parchment was 2.2:1, now #A87420 at 3.1:1; party cards got an Evasion arch badge (the mini crest was too small to read).', S('shots: /tmp/ev-refs/dh/p2–p4', '#')],
			['<b>Pass 4 (the user’s feedback).</b> Contrast: the Fear band was #251C5C on #14102B with #5A48B8 empty gems, so everything sank; it is now a mid-violet plate with a lavender rim and light gems in dark, lavender vellum with deep violet ink in light. The spotlit card was cream with saturated royal (#3B2C93) plates, a royal Hope bar and heavy navy buttons; plates and the bar are now ink indigo (#2C2660) with gold hairlines, number boxes cream with gold edges, and the buttons paper (cream, gold edge, ink) in joined clusters (Damage | Heal). Adversary rows were #110E26 on #14102B; lifted to #1B1640. The loadout became a fanned hand of real domain cards in the book’s frame (pennant, recall token, type plate, gold band), with grid and carousel alternatives. NPCs and blocks got the book’s classification: three kinds (colour) and their types (glyph), the block in the book’s exact order, Experience on the left, a bigger tier pentagon, and passive / action / reaction as ring / play / turning arrow in outline / navy / amber.', S('shots: /tmp/ev-refs/dh/q0 (before), q1–q3, c1', '#')],
			['<b>Pass 5 (every device, both themes, measured).</b> iPad portrait lost its footer below the fold; it is pinned, Back and Next on the right. GM’s turn on the main tab listed the party first; adversaries now lead. The fan overflowed its panel at 3 cards and floated low; its spread follows the hand size. The opened card sat under the lifted one; fixed. The ticker truncated the brute’s name; shortened. Centring: Overpass sits about 0.12–0.2em high in any box, so 574 numbers, labels and icons were measured in headless Chrome and nudged; all within 1px in both themes, and the shared checker reports none. No sideways scroll at 820, 1180 or 1440.', S('shots: /tmp/ev-refs/dh/c2, final4; /tmp/ev-dh-tools/align.mjs', '#')],
			['<b>Pass 6 (class scrollwork, two critiques).</b> One build for all nine classes (CR pp.28–50): a tapering gold stem, two pairs of C-scrolls mirrored about the title’s centre line, a leaf, beads, and a diamond medallion holding the class’s mark, ringed in its first domain’s colour on the left and its second on the right; the mark again as the outer tip. Critique 1: the first drawing read as a thin line with tiny curls beside a 30px name, and the compact form leaked the whole drawing (the SVG overflowed its cropped viewBox); the scrolls grew to the full height, the strokes heavier, the medallion larger, and the SVG now clips. Critique 2: mirrored marks read backwards on the right (a reversed note, a reversed arrow), so the right side’s marks are flipped back; the scrolls sat 1.5–2.8px below the capitals’ centre (Overpass again), so each size rises by what was measured, now within 0.3px; the phone level up was a stray modal, now a bottom sheet with the compact form. No left-edge stripes anywhere (the user’s rule).', S('shots: /tmp/ev-refs/dh/t04', '#')],
			['<b>Pass 7 (breathing room).</b> The build grew from 140 to 180 units a side: the scrolls reach further out, the medallion is larger (30 units tall) with more air round its mark (an inner ring at 11.4 against a 10.8 mark), and clear space separates it from the name; gaps went from 0.16 to 0.34 of the height. Critique: narrowing first sliced through a curl, so the hero band now uses a mid form (bead, leaf, small scrolls, medallion) that ends cleanly; wider spaces let the outer tips go first and the medallion never shrinks. The phone form keeps only the medallion, with a little air from the name. Still within 0.3px of the capitals’ centre.', S('shots: /tmp/ev-refs/dh/t04b', '#')],
			['<b>Pass 3 (every device, both themes).</b> The ribbon of the spotlit card touched the section ribbon above it; spaced. Phone sheet: six trait crests in one row without verbs; slots narrower. The roll toast, the quick look and the hover card took the navy-and-gold dress. Checked at 1440 and 1280 with both sidebars, iPad both ways, phone.', S('shots: /tmp/ev-refs/dh/p5–p6', '#')],
		] },
		RESEARCH.dh.cards.find(c => c.t === 'Rules that shape the panel'),
		RESEARCH.dh.cards.find(c => c.t === 'Other tools'),
	].filter(Boolean),
	borrow: ['Indigo ground, gold trim, cream paper: the companion app’s and Demiplane’s look', 'Crests with banner labels for every number on the sheet', 'Ribbons with chevron ends for every section head', 'Royal threshold plates with white number boxes; six Hope diamonds on a plate', 'Gold-outlined pill tabs; navy table heads', 'Domain cards with a pennant, a recall token and a type plate'],
	avoid: ['Book or card art, logos, the book’s domain icons', 'Cinzel-style serifs (Foundry’s choice)', 'Skulls for Fear', 'Greyscale: the print sheet is grey only because it’s for printers', 'Glow and gradients on anything but Fear and the gold frame', 'Domain colours outside domain cards'],
	direction: ['<b>The game’s own clothes.</b> A night-indigo table trimmed in gold. Everything you read sits on cream paper with a navy ribbon; every number sits in a crest. Gold is Hope and the spotlight, violet is Fear. Light is the same sheet on parchment, with the hero band still indigo.'],
};
