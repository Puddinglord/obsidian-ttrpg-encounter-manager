/* ============================================================================
   PF2e: the character sheet, NPC card and creature block, in the books'
   own grammar: a crimson banner, ruled label rows, the official sheet's
   terracotta field with white boxes, maroon ability badges, ribbons for
   sections, trait strips and our own action diamonds. Original characters.
   ========================================================================== */
const GPS = {};
/* The sheet itself lives in 73p-pf-sheet.js. */

/* The creature block: the Bestiary's order and rules */
GPS.block = (size = 'full') => {
	const r = t => h('span.xpb-r', t);
	const p = (...k) => h('p', ...k);
	return h('div.xpb' + (size === 'compact' ? '.compact' : ''),
		GP.tline('Mire Lantern', 'Creature 2'),
		GP.tags([{ name: 'Uncommon', cls: 'unc' }, { name: 'Medium', cls: 'size' }, { name: 'Animal', cls: 'x' }, { name: 'Amphibious', cls: 'x' }]),
		p(h('b', 'Perception'), ' ', r('+8'), '; low-light vision'),
		p(h('b', 'Skills'), ' Athletics ', r('+8'), ', Stealth ', r('+8'), ' (+10 in swamps)'),
		p(h('b', 'Str'), ' +4, ', h('b', 'Dex'), ' +2, ', h('b', 'Con'), ' +4, ', h('b', 'Int'), ' −4, ', h('b', 'Wis'), ' +2, ', h('b', 'Cha'), ' +0'),
		h('div.xpb-rule'),
		p(h('b', 'AC'), ' 18; ', h('b', 'Fort'), ' ', r('+10'), ', ', h('b', 'Ref'), ' ', r('+6'), ', ', h('b', 'Will'), ' ', r('+6')),
		p(h('b', 'HP'), ' 32; ', h('b', 'Weaknesses'), ' cold 3'),
		p(h('b', 'Snap Shut'), ' ', h('span.xp-glyph', GP.glyph('reaction', 12)), ' ', h('b', 'Trigger'), ' A creature within its reach Strikes it; ', h('b', 'Effect'), ' the lantern makes a jaws Strike against it.'),
		h('div.xpb-rule'),
		p(h('b', 'Speed'), ' 20 feet, swim 30 feet'),
		p(h('b', 'Melee'), ' ', h('span.xp-glyph', GP.glyph(1, 12)), ' jaws ', r('+11'), ' ', h('span.xpb-tr', '(reach 5 feet)'), ', ', h('b', 'Damage'), ' ', r('1d10+4'), ' piercing'),
		p(h('b', 'Melee'), ' ', h('span.xp-glyph', GP.glyph(1, 12)), ' tongue ', r('+11'), ' ', h('span.xpb-tr', '(agile, reach 15 feet)'), ', ', h('b', 'Damage'), ' ', r('1d6+4'), ' bludgeoning plus ', term('Grab')),
		p(h('b', 'Lure Light'), ' ', h('span.xp-glyph', GP.glyph(2, 12)), ' ', h('span.xpb-tr', '(mental, visual)'), ' Each creature within 30 feet that sees the glow must succeed at a ', r('DC 18'), ' Will save or be ', term('fascinated'), ' for 1 round.'));
};
const NPCP = { name: 'Ottoline Brask', role: 'Ferry warden of the sunken shrine', facts: 'Dwarf · she/her · old', links: [['castle', 'Found at', 'The causeway'], ['book', 'First met', 'Session 2']], status: 'alive', attitude: 'neutral',
	rows: [['Look', 'Oilskin coat, a lantern on a pole.'], ['Wants', 'Toll paid in lamp oil, not coin.'], ['Voice', 'Speaks only in questions.']], secret: 'She feeds the mire lanterns.', playerRows: [['Look', 'Old dwarf with a lantern.'], ['Said', '"Oil, or will you swim?"']] };
/** PF2e's addition to the shared card: the stat-block heading, its traits, and the three numbers the table needs. */
GPS.npcExtras = () => h('div.npc-stats.xpn',
	GP.tline('Ferry warden', 'Creature 2'),
	GP.tags([{ name: 'Dwarf', cls: 'x' }, { name: 'Humanoid', cls: 'x' }]),
	h('div.xpn-row', GPS.shield(17, 50), h('span.xpn-c', h('span.xp-cap', 'HP'), h('b', '30')), h('span.xpn-c', h('span.xp-cap', 'Perception'), h('b', '+9')), h('span.xpn-c', h('span.xp-cap', 'Will'), h('b', '+11')), h('span.npc-ref', icon('statblock', 13), 'pf2e: Ferry warden')));

Object.assign(DEFS.pf, {
	sheet: { title: 'Character sheet', lede: 'Wren Halloway, level 1 druid, redesigned to look like Pathfinder from across the table: a parchment page in a gold-ruled frame with corner ornaments; a crimson heraldic banner with gold edges and a swallowtail end, the portrait in a gold medallion, the class and a level medallion; a big crimson AC shield; saves and Perception as plates with crimson caps; maroon attribute plaques; T E M L rank boxes wherever a proficiency applies; our own action diamonds on every Strike, spell and feat; trait bars on their gold band; condensed caps for every label.',
		research: { cards: [
			{ t: 'What says Pathfinder (the user’s PDFs)', li: [
				['<b>The pregens:</b> a crimson banner with flourished ends and a gold edge carries the name in flared caps, the class and a white level medallion; crimson ribbons with notched ends head every section; maroon attribute badges; ruled label rows in condensed bold caps; a full-bleed painting beside the stats.', S('Lini and Amiri pregens, levels 1 and 5', '#')],
				['<b>The blank sheet:</b> navy banners on a terracotta field; every number in a white rounded box; AC as a big shield silhouette and HP as a heart; T E M L boxes beside every proficiency; Dying and Wounded as small boxes beside HP; Strikes as weapon blocks with traits.', S('Core Rulebook character sheet (PZO2101)', '#')],
				['<b>The Core Rulebook’s chapter pages:</b> parchment with a darker edge, crimson and gold medallion frames around each class icon, gold rules, condensed bold caps for headings.', S('Core Rulebook p.69, Classes', '#')],
			] },
			{ t: 'What the tools do', li: [
				['<b>Foundry pf2e:</b> an oxblood side panel with gold labels, a shield for AC, proficiency as coloured words, Dying and Wounded as rings that fill. Loved for density, but it reads as an app.', S('foundryvtt.com/packages/pf2e', 'https://foundryvtt.com/packages/pf2e')],
				['<b>Pathbuilder 2e</b> and <b>Demiplane Nexus:</b> dark shells with a crimson rule; the sheets are plain tables. They are fast, not Pathfinder-looking: the identity lives in the books and the pregens.', S('Demiplane Nexus', 'https://app.demiplane.com/nexus/pathfinder2e')],
			] },
			{ t: 'Critique passes', li: [
				['<b>Pass 1 (the old sheet, “not my favourite”):</b> crimson ribbons on a flat cream page with a terracotta field read as a form, not a Pathfinder book: no frame, AC a small outlined shield, ranks as single letters, no action glyphs past the Strikes. Rebuilt around the pregen’s banner, a framed parchment page, a big crimson shield and T E M L boxes.', S('Screens in /tmp/ev-refs/pf/sheet-p1', '#')],
				['<b>Pass 2 (light and dark at laptop, iPad and phone):</b> the plates ended at different heights (only Perception had a note), so every plate now names its attribute; the phone wrapped Level up onto its own line, now beside hero points; six identity rows stacked into a long list on the phone, now two columns with Languages across; the dice and the “to” in Heal’s action range sat 1–2px off, nudged and measured.', S('Screens in /tmp/ev-refs/pf/sheet-p2', '#')],
				['<b>Pass 3 (the tracker and the sheet together):</b> the tracker became the card and the queue; its card wears the sheet’s banner, crimson shield, capped save plates and gold-ruled frame, so the two surfaces are one design.', S('Screens in /tmp/ev-refs/pf/sheet-p3', '#')],
			] },
		],
			borrow: ['The crimson banner with a swallowtail end, the level medallion', 'A parchment page in a gold-ruled frame', 'A big crimson AC shield', 'T E M L boxes beside every proficiency', 'Action diamonds on everything that costs actions', 'Trait bars on their gold band', 'Condensed caps on every label'],
			avoid: ['Paizo’s logo, art and ornamented ribbon scrolls (ours are drawn: a notch and a fold)', 'The Pathfinder-Icons glyphs (ours are drawn)', 'A full terracotta wall: plates carry the colour instead'],
			direction: ['<b>The pregen, made live, on the book’s page.</b> Crimson and gold for who you are, a shield and plates for what keeps you standing, diamonds for what you can do.'] },
		shots: [
			{ device: 'note-laptop', title: 'Wren Halloway', path: 'Campaigns / The sunken shrine / Party / Wren Halloway', cap: 'Laptop: the sheet', sub: 'The three attacks are one cluster (+5, +1, −3 for the agile sickle), damage beside it: the penalty is on the button, not in the player’s head.', render: () => GPS.sheet(), height: 900 },
			{ device: 'note-phone', title: 'Wren Halloway', cap: 'Phone: dying 1', sub: 'The recovery check, with its DC worked out; the Dying track fills one diamond, Wounded waits beside it.', render: () => GPS.sheet('dying', { phone: true }) },
		] },
	npc: { title: 'NPC card', lede: 'The shared card in PF2e’s voice: the stat-block heading (Ferry warden … Creature 2), its trait strip, then AC, HP, Perception and Will in boxes, and the creature block it uses.', research: null,
		shots: [{ device: 'pair', cap: 'GM view and player view', items: [{ el: () => h('div.g-pf', { style: { width: '600px', background: 'var(--g-bg)', padding: '20px', borderRadius: '6px' } }, npcCard(NPCP, { extras: GPS.npcExtras() })), cap: 'GM' }, { el: () => h('div.g-pf', { style: { width: '600px', background: 'var(--g-bg)', padding: '20px', borderRadius: '6px' } }, npcCard(NPCP, { mode: 'player' })), cap: 'Player' }] }] },
	block: { title: 'Creature block', lede: 'The Bestiary’s order and look: NAME … CREATURE N over an ink rule, the trait strip on its gold band (rarity, size, then traits), Perception, skills, attributes; a rule; AC and saves, HP and weaknesses, reactions; a rule; Speed, Strikes and abilities with our action diamonds. Every number rolls.',
		research: { cards: [{ t: 'Bestiary order (pp.5–6)', li: [['Name … CREATURE N in condensed bold caps over a full-width rule; traits row; Perception and senses; languages; skills; attribute modifiers; items; a rule; AC, Fort, Ref, Will; HP, immunities, weaknesses, resistances; reactive abilities; a rule; Speed; Strikes as glyph, name, +attack, (traits), Damage; spells; offensive abilities. Lines after the first are hung.', S('PF2e Bestiary p.29 (Shield Archon)', '#')], ['Trait chips are joined on a gold band: rarity (orange uncommon, navy rare, purple unique), size in green, then maroon traits.', S('Bestiary; Demiplane creature pages', 'https://app.demiplane.com/nexus/pathfinder2e')]] }], borrow: ['The title line and its rule', 'The trait strip, colours by kind', 'Hanging indents and bold inline labels', 'Our own action diamonds'], avoid: ['Paizo’s art and the glyph font'], direction: ['<b>The book’s page, rolls inline.</b>'] },
		shots: [
			{ device: 'pair', cap: 'In a note', items: [{ el: () => h('div.g-pf', { style: { width: '560px', background: 'var(--g-bg)', padding: '22px', borderRadius: '6px' } }, GPS.block()), cap: 'Mire Lantern' }] },
			{ device: 'hover', title: 'The causeway', path: 'Campaigns / The sunken shrine / The causeway', cap: 'Hover card', under: () => proseWith('pf2e:Mire Lantern', { title: 'The causeway', text: 'Fog sits on the water like wool.', text2: 'A light bobs where no boat could be: a' }, 'waiting for someone to follow it.'), render: () => GPS.block('compact') },
		] },
});
