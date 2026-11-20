/* Call of Cthulhu: sheets, NPC card and monster entry (split from 73-pf-coc-sheets.js). */
const GCS = {};
/* ---------- Call of Cthulhu ---------- */
GCS.ck = (t, on) => h('span.xc-box' + (on ? '' : '.plain.off'), GC.tick(on), t);
/** A ruled form field: printed label, typed value on the line. */
GCS.field = (k, v, cls = '') => h('div.xcs-f' + cls, h('span.k', k), h('span.v', v));
/** The sepia photograph: a white border and paper corners. */
GCS.photo = (name, size = 96) => h('div.xcs-photo', { style: { width: size + 'px', height: Math.round(size * 1.22) + 'px' } }, portrait(name, size - 12, 'square'), h('span.clip', { 'aria-hidden': 'true' }), h('i.c1'), h('i.c2'), h('i.c3'), h('i.c4'));
GCS.sheet = (state = 'full', opts = {}) => {
	const lost = state === 'san';
	const chars = [['STR', 45], ['DEX', 70], ['INT', 75, 'Idea'], ['CON', 60], ['APP', 50], ['POW', 65], ['SIZ', 55], ['EDU', 80, 'Know']];
	return h('div.xcs',
		h('div.xcs-top',
			h('div.xcs-id', h('div.xcs-era', '1920s era investigator'),
				GCS.field('Name', 'Mabel Ostrander', '.name'), GCS.field('Occupation', 'Telephone-exchange supervisor'),
				h('div.xcs-f2', GCS.field('Age', '34'), GCS.field('Pronoun', 'she/her')), GCS.field('Residence', 'Arkham, Mass.'), GCS.field('Birthplace', 'Providence, R.I.')),
			h('div.xcs-chars-w', GC.band('Characteristics', null, '.center'),
				h('div.xcs-chars', chars.map(([k, v, sub]) => h('div', h('span.k', h('span', k, sub ? h('small', sub) : null)), GC.cbox(v, { cls: 'lg' }))),
					h('div.mv', h('span.k', h('span', 'Move')), h('span.xcs-round', '8')))),
			GCS.photo('Mabel Ostrander', opts.phone ? 76 : 104)),
		h('div.xcs-acts', btn({ icon: 'statblock', text: 'Backstory', size: 'sm' }), btn({ icon: 'check', text: 'Improvements', size: 'sm' })),
		h('div.xcs-pools',
			h('div.xcs-pool', GC.band('Hit Points'), h('div.in', GC.box(['Max', 'Current'], [11, 11]), h('div.xcs-st', GCS.ck('Major wound'), GCS.ck('Dying'), GCS.ck('Unconscious')))),
			h('div.xcs-pool', GC.band('Sanity'), h('div.in', GC.box(['Start', 'Current', 'Insane'], [65, lost ? 59 : 65, 13], [null, lost ? 'hurt' : 'san', null]), h('div.xcs-st', GCS.ck('Temporary insanity', lost), GCS.ck('Indefinite insanity')))),
			h('div.xcs-pool', GC.band('Luck'), h('div.in', GC.box(['Start', 'Current'], [55, 55]), h('div.xcs-st', GCS.ck('Out of luck')))),
			h('div.xcs-pool', GC.band('Magic Points'), h('div.in', GC.box(['Max', 'Current'], [13, 13])))),
		lost ? h('div.xc-slip.xcs-note', h('b', 'Lost 6 Sanity at once.'), ' An INT roll: if it succeeds she understands what she saw, and is temporarily insane. ', btn({ size: 'sm', icon: 'dice', text: 'INT 75' })) : null,
		GC.band('Investigator Skills', 'tick a skill when it succeeds', '.xcs-skh'),
		h('div.xcs-skills', [['Accounting', 5, 0, -1], ['Credit Rating', 0, 30, -1], ['Fighting (Brawl)', 25, 25, 0], ['Firearms (Handgun)', 20, 30, 0], ['First Aid', 30, 30, 0], ['Library Use', 20, 60, 1], ['Listen', 20, 50, 0], ['Occult', 5, 25, 0], ['Persuade', 10, 40, 1], ['Psychology', 10, 45, 0], ['Spot Hidden', 25, 55, 1], ['Stealth', 20, 20, 0]].map(([n, base, v, ck]) => h('div.xcs-sk', ck >= 0 ? GC.tick(ck === 1) : h('span.nt'), h('span.n', n, h('small', ` (${String(base).padStart(2, '0')}%)`)), v ? GC.cbox(v) : h('span.xc-cb.empty', h('b', '—'), h('span.hf', h('i'), h('i')))))),
		h('div.xcs-bottom',
			h('div.xcs-weap', GC.band('Weapons'),
				h('div.xcs-wt', h('div.xcs-wr.h', ['Weapon', 'Regular', 'Damage', 'Range', 'Att.', 'Ammo', 'Malf.'].map(t => h('span', t))),
					[['Unarmed', 25, '1D3 + DB', '—', '1', '—', '—'], ['.32 revolver', 30, '1D8', '15 yd', '1 (3)', '6', '100']].map(([n, v, d, r, a, am, m]) => h('div.xcs-wr', h('span.n', n), GC.cbox(v), rollBtn('', d, { noIcon: false }), h('span', r), h('span', a), h('span', am), h('span', m))))),
			h('div.xcs-combat', GC.band('Combat'),
				h('div.in', h('div', h('span.k', 'Damage bonus'), h('span.xcs-round', 'None')), h('div', h('span.k', 'Build'), h('span.xcs-round', '0')), h('div', h('span.k', 'Dodge'), GC.cbox(40, { cls: 'lg' }))))));
};
GCS.block = (size = 'full') => h('div.xcb' + (size === 'compact' ? '.compact' : ''),
	h('h2', 'Silt Congregant', h('span', ', drowned parishioners of the lake')),
	h('div.ep', '“Still singing, under the water, the hymn they drowned on.”'),
	// In play only the number matters; the book's roll (for rolling up a distinct individual) stays in the tooltip.
	h('div.xcb-chars',
		[['STR', 80, '3D6+6 ×5'], ['CON', 90, '4D6+4 ×5'], ['SIZ', 70, '2D6+6 ×5'], ['DEX', 40, '2D6+1 ×5'], ['INT', 30, '1D6+3 ×5'], ['POW', 50, '3D6 ×5']].map(([k, v, r]) => h('div.xcb-ch', { title: `${k} ${v} (rolled ${r} for a new one)` }, h('span.k', k), h('b', String(v))))),
	h('div.xcb-stats', GC.cell('HP', 16), GC.cell('Damage bonus', '+1D4'), GC.cell('Build', 1), GC.cell('MP', 10), GC.cell('Move', '6 / 8 swim')),
	h('div.xcb-h', 'Attacks'),
	h('p', h('b', 'Attacks per round:'), ' 2'),
	h('div.xcb-att', h('span', h('b', 'Fighting'), h('small', 'clutching, waterlogged hands')), GC.cbox(45), rollBtn('', '1D6 + DB')),
	h('div.xcb-att', h('span', h('b', 'Drag under (mnvr)'), h('small', 'held; a CON roll each round or 1D6 drowning')), GC.cbox(45), h('span')),
	h('div.xcb-att', h('span', h('b', 'Dodge')), GC.cbox(20), h('span')),
	h('p', h('b', 'Armor:'), ' 2 (bloated flesh); impaling weapons do minimum damage.'),
	h('p', h('b', 'Skills:'), ' Stealth 60%.'),
	h('div.xc-slip.xcb-san', h('b', 'Sanity loss:'), ' 1/1D8 Sanity points to see a congregant rise from the water.'));
/** The Keeper Rulebook's two-line block for a human NPC, as ruled cells. */
GCS.npcExtras = () => h('div.npc-stats.xcn',
	h('div.xcn-g', [['STR', 50], ['CON', 55], ['SIZ', 60], ['DEX', 45], ['INT', 70], ['APP', 55], ['POW', 80], ['EDU', 75], ['SAN', 22], ['HP', 11]].flatMap(([k, v]) => [h('i', k), h('b', String(v))])),
	h('div.xcn-r', h('span.xcn-a', 'Fighting (Brawl)', GC.cbox(25)), h('span.xcn-a', 'Dodge', GC.cbox(22)), h('span.npc-ref', icon('statblock', 13), 'coc: Father Crane')));
const NPCC = { name: 'Father Elias Crane', role: 'Rector of the lakeside chapel', facts: 'American · he/him · 60s', links: [['castle', 'Found at', 'St. Brendan’s'], ['book', 'First met', 'Session 4']], status: 'alive', attitude: 'friendly',
	rows: [['Look', 'Wet cuffs; smells of lake water and tallow.'], ['Wants', 'The choir to sing again, all of them.'], ['Voice', 'Soft, kind, a little too slow.']], secret: 'He drowned them. He wants them back.', playerRows: [['Look', 'Kindly old priest, damp clothes.'], ['Said', 'His choir drowned in the flood of ’23.']] };

Object.assign(DEFS.coc, {
	sheet: { title: 'Investigator sheet', lede: 'Mabel Ostrander, 1925, on the 1920s form itself: the black era tab and typed fields, a sepia photograph with paper corners, the Characteristics band with every value in the split box (Regular, Half over Fifth), the four pools with their status boxes in the sheet’s order, combat (Move, Build, Damage bonus, Dodge), weapons, skills with improvement ticks.',
		research: { cards: [{ t: 'The investigator sheet (Keeper Rulebook pp.430–432)', li: [['Identity; characteristics STR, DEX, INT (Idea), CON, APP, POW, SIZ, EDU (Know) each with Regular, Half and Fifth; Move.', S('Keeper Rulebook p.430', '#')], ['HP with Major Wound, Dying, Unconscious; Sanity with Temp. and Indef. Insane; Luck with Out of Luck; Magic Points. Printed there as strike-through number grids; the current sheets use Max | Current boxes.', S('Keeper Rulebook p.430', '#')], ['Skills grid with an improvement checkbox and base %; weapons table with Regular, Hard, Extreme, damage, range, attacks, ammo, malfunction; combat box with Damage Bonus, Build, Dodge.', S('Keeper Rulebook p.430', '#')], ['Page 2: backstory as structured fields.', S('Keeper Rulebook p.431', '#')]] }],
			borrow: ['Regular | Half | Fifth everywhere', 'Status boxes in the sheet’s order', 'Improvement ticks', 'Backstory as its own page'], avoid: ['The Elder Sign, the Art Nouveau frame, the "Fellow Investigators" web'], direction: ['<b>The form, filled in:</b> boxes, bands and ticks from the sheet; typed figures; colour only for wounds and lost Sanity.'] },
		shots: [
			{ device: 'note-laptop', title: 'Mabel Ostrander', path: 'Campaigns / Ashcombe / Investigators / Mabel Ostrander', cap: 'Laptop: the sheet', sub: 'The form as the 1920s sheet draws it: typed identity under the black tab, every characteristic in the split box (Regular, Half over Fifth), the four pools in their framed boxes with tick boxes below.', render: () => GCS.sheet(), height: 860 },
			{ device: 'note-phone', title: 'Mabel Ostrander', cap: 'Phone: after a Sanity loss', sub: 'Sanity 65 → 59 in one roll: the sheet says what follows, quietly.', render: () => GCS.sheet('san', { phone: true }) },
		] },
	npc: { title: 'NPC card', lede: 'The Keeper Rulebook suggests an index card for throwaway NPCs, so the shared card becomes one: a sepia photograph, the name typed over a red head rule, the notes typed on blue lines, and the Rulebook’s two-line block as ruled cells with Fighting and Dodge in the split box.', research: null,
		shots: [{ device: 'pair', cap: 'GM view and player view', items: [{ el: () => h('div.g-coc', { style: { width: '600px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCC, { extras: GCS.npcExtras() })), cap: 'GM' }, { el: () => h('div.g-coc', { style: { width: '600px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCC, { mode: 'player' })), cap: 'Player' }] }] },
	block: { title: 'Monster entry', lede: 'The Keeper Rulebook’s monster entry: characteristics, HP, DB, Build, MP, Move; attacks per round, Fighting and manoeuvres in the split box, Dodge, Armor, Skills, and Sanity loss as success/failure.',
		research: { cards: [{ t: 'Monster entries (Keeper Rulebook ch.14)', li: [['Characteristics table; HP, average Damage Bonus, Build, Magic Points, Move; ATTACKS: attacks per round, Fighting with (Regular/Half/Fifth) and damage, manoeuvres marked (mnvr), Dodge; Armor; Skills; Spells; Sanity Loss as 1/1D6.', S('Keeper Rulebook pp.282–284', '#')], ['Human NPCs: two lines of characteristics, then attacks, Dodge, a short skills list; one block can serve several NPCs.', S('Keeper Rulebook p.362', '#')]] }], borrow: ['(mnvr) tags', 'Sanity loss last, as it is in the book'], avoid: ['Copying book monsters: only original or user-entered creatures ship'], direction: ['<b>An entry on the page.</b>'] },
		shots: [
			{ device: 'pair', cap: 'In a note', items: [{ el: () => h('div.g-coc', { style: { width: '560px', background: 'var(--g-bg)', padding: '22px', borderRadius: '14px' } }, GCS.block()), cap: 'Silt Congregant' }] },
			{ device: 'hover', title: 'St. Brendan’s', path: 'Campaigns / Ashcombe / Places / St. Brendan’s', cap: 'Hover card', under: () => proseWith('coc:Silt Congregant', { title: 'St. Brendan’s', text: 'The pews are wet. Someone has been sitting in them.', text2: 'When the organ starts, a' }, 'rises from the font.'), render: () => GCS.block('compact') },
		] },
});
