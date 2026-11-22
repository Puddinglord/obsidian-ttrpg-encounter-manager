/* ============================================================================
   Daggerheart: character sheet, NPC card, adversary and environment blocks.
   Original names; numbers on the Core Rulebook’s benchmarks. Dressed as the
   game: a hero band, crests, gold-outlined tabs, paper panels with ribbons.
   ========================================================================== */
const GDS = {};
const KAEL = { name: 'Kael Ardent', cls: 'Guardian', sub: 'Stalwart', heritage: 'Ridgeborne · Human', pronouns: 'he/him', domains: ['Valor', 'Blade'], level: 2,
	evasion: 9, armorScore: 4, armorMarked: 2, thresholds: [9, 17], hp: { max: 7, marked: 2 }, stress: { max: 6, marked: 1 }, hope: 3, prof: 2,
	traits: [['Agility', 0, 'Sprint · Leap · Maneuver'], ['Strength', 2, 'Lift · Smash · Grapple', true], ['Finesse', -1, 'Control · Hide · Tinker'], ['Instinct', 1, 'Perceive · Sense · Navigate'], ['Presence', 1, 'Charm · Perform · Deceive', true], ['Knowledge', 0, 'Recall · Analyze · Comprehend']],
	exps: [['Shield-wall veteran', 2], ['Knows every ridge pass', 2], ['Owes the abbess a life', 2]],
	weapons: [['Primary', 'Warden’s Halberd', 'Strength', 'Very Close', '2d10+2 phy', 'Two-handed'], ['Secondary', 'Tower Shield', 'Strength', 'Melee', '1d4 phy', '+1 Armor score']],
	cards: [['Valor', 1, 'Ability', 'Hold the Gate', 0], ['Blade', 1, 'Ability', 'Ringing Blow', 1], ['Valor', 2, 'Ability', 'Shoulder to Shoulder', 1]] };

/* Domain marks: our own simple glyphs, not the book's. */
const DOM_GLYPH = {
	Valor: '<path d="M12 2.5 19.5 5v6.2c0 4.6-3.2 7.6-7.5 9.8-4.3-2.2-7.5-5.2-7.5-9.8V5Z"/><path d="m8.2 9.6 3.8 3 3.8-3"/>',
	Blade: '<path d="M18.5 3.5 9.8 12.2"/><path d="M19.8 2.2 21 3.4l-1.4 3.1-3.1 1.4"/><path d="m6.6 11.6 5.8 5.8"/><path d="m8.4 15.6-4.2 4.2"/><circle cx="3.6" cy="20.4" r="1.2"/>',
};
GDS.glyph = (dom, size = 22) => { const s = svg(`<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${DOM_GLYPH[dom] || ''}</g>`, 24, 24); s.setAttribute('width', size); s.setAttribute('height', size); return s; };

GDS.slotsRow = (kind, max, on) => GD.slots(kind, max, on, true);
const xdSgn = v => v >= 0 ? `+${v}` : `−${Math.abs(v)}`;
GDS.trait = ([n, v, verbs, mark]) => h('div.xds-trait', GD.crest('trait', xdSgn(v), n, { size: 70, mark, fs: 25, title: `${n} ${xdSgn(v)}${mark ? ' · marked at level-up' : ''}` }), h('small', verbs.split(' · ').map(x => h('span', x))));
GDS.traits = c => h('div.xds-traits', c.traits.map(GDS.trait));

/** A domain card, small: the domain's pennant with the level, the recall token, the type plate, the name. */
GDS.cardEl = ([dom, lv, type, name, recall], opts = {}) => h('div.xds-card.d-' + dom.toLowerCase() + (opts.vault ? '.vault' : ''),
	h('span.pen', h('b', String(lv)), GDS.glyph(dom, 13)),
	h('span.rc', { title: `Recall cost ${recall}` }, String(recall), icon('zap', 10, 2.4)),
	h('span.ty', type),
	h('b.nm', name),
	h('small.dm', dom));

/** Gold: handfuls, bags, a chest, drawn as the sheet does. */
const GOLD_ICON = {
	handful: '<circle cx="7" cy="7" r="5.2"/><path d="M4.8 7h4.4"/>',
	bag: '<path d="M4.6 3.2h4.8L8.3 5c2.7 1.1 4 3.1 4 5.4 0 1.9-1.4 2.9-3.3 2.9H5c-1.9 0-3.3-1-3.3-2.9 0-2.3 1.3-4.3 4-5.4Z"/>',
	chest: '<path d="M1.8 6.2h10.4v6.2H1.8Z"/><path d="M1.8 6.2C1.8 3.4 3.6 2 7 2s5.2 1.4 5.2 4.2"/><path d="M6 7.6h2v2H6Z"/>',
};
GDS.gold = (kind, max, on) => h('span.xds-goldrow', Array.from({ length: max }, (_, i) => { const s = svg(`<g stroke-width="1.3" stroke-linejoin="round">${GOLD_ICON[kind]}</g>`, 14, 14); if (i < on) s.classList.add('on'); return s; }));

/** A dark table header, as the reference app and the Demiplane sheet draw them. */
GDS.thead = (...cols) => h('div.xds-thead.c' + cols.length, cols.map(c => h('span', c)));

GDS.tabs = (on = 'Main', list = ['Main', 'Features', 'Domain cards', 'Inventory', 'Story', 'Advancement']) => h('nav.xd-tabs', list.map(t => h('span' + (t === on ? '.on' : ''), t)));

GDS.band = (c, opts = {}) => h('header.xds-band',
	h('span.xds-ring', portrait(c.name, opts.phone ? 64 : 84)),
	h('div.xds-id',
		h('h1', c.name),
		h('div.l', `${c.cls} (${c.sub})`),
		h('div.s', `${c.heritage} · ${c.pronouns} · `, h('span', c.domains.join(' & ')))),
	h('div.xds-doms', c.domains.map(d => h('span', { title: d }, GDS.glyph(d, opts.phone ? 22 : 30)))),
	h('div.xds-acts', btn({ icon: 'moon', text: 'Rest', size: 'sm' }), btn({ icon: 'arrow-up', text: 'Level up', size: 'sm' })),
	h('div.xds-lvl', GD.crest('level', c.level, 'Level', { size: opts.phone ? 50 : 60, fs: 28 })));

GDS.stats = c => h('div.xds-stats',
	h('div.xds-def',
		GD.crest('arch', c.evasion, 'Evasion', { size: 66, fs: 27 }),
		GD.crest('shield', c.armorScore, 'Armor', { size: 66, fs: 27 }),
		h('div.xds-aslots', GD.armor(c.armorScore, c.armorMarked, 18), h('small', `${c.armorMarked} of ${c.armorScore} marked`))),
	GDS.traits(c));

GDS.sheet = (state = 'full', opts = {}) => {
	const c = clone(KAEL);
	if (state === 'last') { c.hp.marked = 6; }
	if (state === 'roll') c.hope = 4;
	const left = [
		GD.panel('Damage & health', [
			h('p.xds-hint', 'Add your level to your damage thresholds'),
			h('div.xd-thresh.xds-th', h('span', 'Minor', h('small', 'mark 1 HP')), h('b', String(c.thresholds[0])), h('span', 'Major', h('small', 'mark 2 HP')), h('b', String(c.thresholds[1])), h('span', 'Severe', h('small', 'mark 3 HP'))),
			h('div.xds-track', h('span.l', 'HP'), GDS.slotsRow('hp', c.hp.max, c.hp.marked), h('b', `${c.hp.marked}/${c.hp.max}`)),
			h('div.xds-track', h('span.l', 'Stress'), GDS.slotsRow('stress', c.stress.max, c.stress.marked), h('b', `${c.stress.marked}/${c.stress.max}`)),
			state === 'last' ? h('div.xds-death', h('b', 'One HP left'), h('span', 'Marking it means a death move: Blaze of Glory, Avoid Death, or Risk It All.')) : null]),
		GD.panel('Hope', [
			h('p.xds-hint', state === 'roll' ? '+1 from that roll' : 'Spend a Hope to use an Experience or help an ally'),
			h('div.xds-hope', GD.hope(6, c.hope, true), h('b', String(c.hope))),
			h('p.xds-feat', h('b', 'Frontline Tank: '), h('strong', 'Spend 3 Hope'), ' to clear 2 Armor Slots.'),
			hopeChips('Kael')]),
		GD.panel('Experience', [
			GDS.thead('Experience', 'Mod'),
			h('div.xds-rows', c.exps.map(([n, v]) => h('div.xds-exp', h('span', n), h('b.tag', `+${v}`))))]),
		GD.panel('Gold', [
			h('div.xds-gold', h('span', GDS.gold('handful', 9, 4), h('small', 'Handfuls')), h('span', GDS.gold('bag', 9, 1), h('small', 'Bags')), h('span', GDS.gold('chest', 1, 0), h('small', 'Chest')))]),
	];
	const right = [
		GD.panel('Active weapons', [
			h('div.xds-prof', h('span', 'Proficiency'), pips({ max: 6, on: c.prof })),
			GDS.thead('Name', 'Roll'),
			h('div.xds-rows', c.weapons.map(([slot, n, trait, range, dmg, feat]) => h('div.xds-weap',
				h('div.n', h('small', slot), h('b', n), h("span", `${trait} · ${range} · `, h("i", feat))),
				h('div.r', rollBtn('', 'Duality'), (() => { const [dice, t] = String(dmg).split(/\s+(?=[a-z]+$)/i); return dmgBtn(dice, t, { cls: 'dmg', typeLabel: /^mag/i.test(t) ? 'Magic' : 'Physical' }); })()))))]),
		GD.panel('Active armor', [
			GDS.thead('Name', 'Score'),
			h('div.xds-rows', h('div.xds-weap.arm', h('div.n', h('small', 'Armor'), h('b', 'Ridge Scale'), h('span', 'Base thresholds 7 / 15 · ', h('i', 'Heavy: −1 Evasion'))), h('div.r', h('b.tag', '3'))))]),
		GD.panel('Loadout', [
			h('p.xds-hint', '3 of 5 · swapping one in from the vault marks Stress equal to its recall cost'),
			h('div.xds-cards', c.cards.map(x => GDS.cardEl(x)), h('div.xds-card.empty', icon('plus', 18)), h('div.xds-card.empty', icon('plus', 18))),
			h('div.xds-vault', h('span', 'Vault'), GDS.cardEl(['Blade', 1, 'Ability', 'Whirlwind', 0], { vault: true }))]),
	];
	return h('div.xds' + (opts.phone ? '.is-phone' : ''),
		GDS.band(c, opts),
		GDS.stats(c),
		GDS.tabs(),
		h('div.xds-cols', h('div.xds-col', left), h('div.xds-col', right)),
		state === 'roll' ? rollToast('Strength · Duality', 'Hope 9, Fear 4, +2', 15, 'With Hope: Kael gains a Hope') : null);
};
GDS.modal = () => h('div.sh-modal.xd-paper', h('div.ev-sheet-head', h('h3', 'Kael takes damage'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	GD.padStrip([9, 17], 1),
	hpPad({ who: h('span', 'HP marked ', h('b', '2'), ' of 7'), amount: '11', modes: ['Damage', 'Clear HP', 'Stress'], extra: quickActs('If Kael marks armor', [['Armor slot', 'Major → Minor · 2 left']]), go: btn({ kind: 'primary', text: 'Mark 2 HP' }) }));

/* ---------- NPC ---------- */
const NPCD = { name: 'Abbess Corra Vane', role: 'Keeper of the ridge abbey', facts: 'Ridgeborne Human · she/her', links: [['castle', 'Found at', 'Thornwatch abbey'], ['book', 'First met', 'Session 1']],
	status: 'alive', attitude: 'friendly', rows: [['Look', 'Grey habit, a ledger under one arm, ink on every finger.'], ['Wants', 'The bridge kept open, whatever the toll.'], ['Question', h('i', 'What did Kael promise her the night the abbey burned?')]], secret: 'She pays the bandits to keep the bridge dangerous.',
	playerRows: [['Look', 'Tired, kind, ink-stained.'], ['Said', 'Kael owes her a life. She won’t say for what.'], ['Met', 'Session 1, she hid us in the abbey.']] };
/** A feature card as Demiplane draws them: a navy title bar with a gold tag, a cream body. */
GDS.featCard = (name, tag, body) => h('div.xds-fc', h('div.xds-fc-h', h('b', name), h('span', tag)), h('div.xds-fc-b', body));
GDS.npcExtras = () => h('div.xds-npcx',
	h('div.npc-stats', GD.crest('heater', 13, 'Difficulty', { size: 46, foe: true }), h('span.npc-ref', icon('book', 13), 'Social adversary: Courtier'), btn({ size: 'sm', icon: 'eye', text: 'Show features to players' })),
	GDS.featCard('Old Debts', 'NPC feature', [h('span', h('b', 'Trigger: '), 'a PC asks her for help a second time. '), h('span', h('b', 'Effect: '), 'she names a price; refusing marks a Stress.')]));

/* ---------- Adversary and environment ---------- */
/** The tier as a small gold pentagon (the community tools' badge), the type as an angled tab. */
GDS.tier = n => h('span.xdb-tier', { title: `Tier ${n}` }, svg(`<path d="M12 1.5 22.5 9 18.5 22h-13L1.5 9Z" class="p"/><text x="12" y="16.6" class="t">${n}</text>`, 24, 24));
GDS.blockHead = (name, tier, type) => h('div.xdb-head', h('div', h('h2', name), h('div.ty', `Tier ${tier} ${type}`)), h('span.xdb-role', type), GDS.tier(tier));
const xdCost = (t, fear) => h('b.cost' + (fear ? '.fear' : ''), t);
const xdFeat = (name, type, ...text) => h('p.xdb-f', h('b', name), h('span.xdb-ft', type), ' ', ...text);
GDS.adv = (size = 'full', copies) => h('div.xdb.xd-paper' + (size === 'compact' ? '.compact' : ''),
	GDS.blockHead('Quarry Brute', 1, 'Bruiser'),
	h('div.xdb-body',
		h('p.desc', 'A dust-caked hauler who swings a pick-maul like a toy.'),
		h('p.mot', h('b', 'Motives & tactics: '), h('i', 'crush, guard the cut, hurl stone, shove')),
		h('div.xdb-stats',
			GD.crest('heater', 12, 'Difficulty', { size: 50, foe: true }),
			h('div.xdb-sv', h('div.xd-thresh.xdb-th', h('span', 'Minor'), h('b', '8'), h('span', 'Major'), h('b', '15'), h('span', 'Severe')),
				h('div.xdb-hs', h('span', h('small', 'HP'), GD.slots('hp', 7, 0)), h('span', h('small', 'Stress'), GD.slots('stress', 3, 0))))),
		h('div.xdb-atk', h('span', h('small', 'ATK'), h('b.dice', '+1')), h('span', h('b', 'Pick-Maul'), ' · Very Close'), h('b.dice', '1d10+3 phy'), h('span.exp', h('small', 'Experience'), 'Hauling +2')),
		h('div.xdb-fh', GD.rib('Features', 'sm')),
		xdFeat('Stonehide', 'Passive', 'Reduce physical damage from ranged attacks by 2.'),
		xdFeat('Rubble Shove', 'Action', xdCost('Mark a Stress'), ' to knock every target within Very Close back to Close. They mark a Stress.'),
		xdFeat('Cave-In', 'Action', xdCost('Spend a Fear', true), ' to bring the ceiling down: everyone in Close makes an Agility reaction roll; on a failure, ', h('b.dice', '2d6+3 phy'), ' and ', term('Restrained'), '.'),
		xdFeat('Grudge', 'Reaction', 'When it takes Severe damage, it makes a standard attack against the attacker.'),
		copies ? h('div.xdb-copies', h('div.xdb-fh', GD.rib('In this fight', 'sm')), [['Brute 1', 3, 1], ['Brute 2', 0, 0]].map(([n, hp, st]) => h('div', h('b', n), h('small', 'HP'), GD.slots('hp', 7, hp), h('small', 'Stress'), GD.slots('stress', 3, st)))) : null));
GDS.env = () => h('div.xdb.xd-paper.env',
	GDS.blockHead('Saltmarsh Toll Ferry', 1, 'Traversal'),
	h('div.xdb-body',
		h('p.desc', 'A rope-drawn raft over brackish channels, run by a ferryman who sets his own price.'),
		h('p.mot', h('b', 'Impulses: '), h('i', 'delay the crossing, strand the careless, extract a toll')),
		h('div.xdb-stats', GD.crest('heater', 11, 'Difficulty', { size: 50, foe: true }), h('div.xdb-sv', h('p.xdb-pot', h('b', 'Potential adversaries'), 'Reed Lurker horde, Quarry Brute, lackeys'))),
		h('div.xdb-fh', GD.rib('Features', 'sm')),
		xdFeat('Slick Planks', 'Passive', 'Moving on the raft in a fight takes an Agility roll.'), h('p.q', 'Who loses their footing first?'),
		xdFeat('Snapped Line', 'Action', 'The raft drifts; a Progress Countdown (4) hauls it back.'), h('p.q', 'What lies downstream?'),
		xdFeat('Something Below', 'Action', xdCost('Spend a Fear', true), ' to bring a Reed Lurker horde up within Close. It takes the spotlight.'), h('p.q', 'What did the last passengers drop?')));

Object.assign(DEFS.dh, {
	sheet: {
		title: 'Character sheet', lede: 'Kael, level 2 Guardian, in a dh-sheet block. The final sheet’s layout (Core Rulebook p.343): Evasion in its arch, the Armor shield with its slots, six trait banners with their verbs, the damage strip, HP and Stress, Hope, Experiences, gold, and on the right the weapons, armor and the domain-card loadout.',
		research: { cards: [
			{ t: 'The final sheet (CR p.343–344)', li: [['Top: name, pronouns, heritage, subclass; Level in a shield. Row 2: Evasion in an arch, Armor score in a shield with 12 small slot shields, six trait banners each with three verbs and a mark circle.', S('Daggerheart Core Rulebook p.343', '#')], ['Left: the damage strip MINOR · [n] · MAJOR · [n] · SEVERE with "mark 1/2/3 HP"; HP and Stress as 12 boxes (dashed beyond what’s unlocked); Hope as six diamonds and a Hope feature; Experiences with modifiers; gold as handfuls, bags and a chest.', S('CR p.344', '#')], ['Right: Active weapons with Proficiency dots, Active armor, inventory. Domain cards sit on a loadout sheet beside it: 5 active, the rest in the vault; swapping in mid-scene marks Stress equal to the recall cost.', S('CR pp.25, 101', '#')]] },
			{ t: 'Rules on the sheet', li: [['Thresholds are the armor’s base plus your level; every class starts with 6 Stress and 2 Hope; Hope caps at 6; Proficiency rises at levels 2, 5 and 8.', S('CR pp.18–19, 109', '#')], ['The playtest sheet (Minor threshold, armor dice, Hoards/Fortune) is not the final one.', S('DH-AllSheets playtest PDF', '#')]] },
			{ t: 'What players touch', li: [['Hope (gained on rolls with Hope, spent to help or use an Experience), HP, Stress, Armor slots, the weapon’s attack and damage, Experiences, the loadout.', S('CR p.347 quick reference', '#')]] },
		], borrow: ['The arch, the shield and its slots, the trait banners with verbs', 'The left-to-right threshold strip with two numbers', 'Hope as six diamonds', 'Loadout cards with level, domain and recall cost', 'Gold that rolls over'], avoid: ['Twelve fixed boxes with dashed ones: show what’s unlocked and add one at level-up', 'A Minor threshold number, armor dice (playtest)', 'Typing thresholds by hand: armor base + level'], direction: ['<b>The sheet, made live, in the game’s clothes.</b> An indigo hero band with the portrait in a gold ring; crests for Evasion, Armor, Level and the traits; gold-outlined pill tabs; paper panels with navy ribbons; navy table heads. Gold for Hope, Overpass throughout; every number that rolls, rolls Duality.'] },
		notes: ['<b>Hope is the player’s to spend:</b> Help an ally, Use an Experience and Tag team are quiet chips, the same as on the tracker’s spotlit card.', '<b>Duality rolls</b> come back as "with Hope" or "with Fear" in the toast; a roll with Hope adds the Hope by itself. Nothing moves the spotlight (that’s the GM’s, by hand).', '<b>Shared parts:</b> the portrait (in Daggerheart’s gold ring), slots (HP, Stress), the keypad (with the threshold plates on top), chips, roll buttons, rules words. Daggerheart only restyles them; the flow is the same as every game’s.'],
		shots: [
			{ device: 'note-laptop', title: 'Kael Ardent', path: 'Campaigns / Thornwatch / Party / Kael Ardent', cap: 'Laptop: the full sheet', sub: 'Evasion, Armor and its slots, traits; damage and health, Hope with its quiet chips, Experiences, gold; weapons with Duality and damage rolls, armor, the loadout (3 of 5) and the vault.', render: () => GDS.sheet(), height: 1120 },
			{ device: 'note-landscape', title: 'Kael Ardent', cap: 'iPad landscape: taking damage', sub: 'The threshold strip lights Major; marking an Armor slot is one quiet chip.', render: () => GDS.sheet(), overlay: () => GDS.modal() },
			{ device: 'note-portrait', title: 'Kael Ardent', cap: 'iPad portrait: a Duality roll', sub: '15 with Hope: the toast says so, and Hope went from 3 to 4 on its own.', render: () => GDS.sheet('roll') },
			{ device: 'note-phone', title: 'Kael Ardent', cap: 'Phone: one HP left', sub: 'Six of seven marked; the sheet says what the last one means.', render: () => GDS.sheet('last', { phone: true }) },
		],
	},
	npc: {
		title: 'NPC card', lede: 'Daggerheart NPCs need little: a name, heritage and pronouns, a role, a description, a motive, and an optional Difficulty. The book’s NPC features (Trigger / Effect) and its habit of ending on a question are Daggerheart’s additions to the shared card.',
		research: { cards: [{ t: 'The book on NPCs', li: [['No stat block required: a name, a description, a motive; add a Difficulty if the PCs might roll against them.', S('CR p.166', '#')], ['Important NPCs can have features written Choice / Trigger / Effect, shown to the table or kept hidden.', S('CR p.167', '#')], ['Adventures present NPCs as Name, Community Ancestry (pronouns), a role line, a short description, and an italic question.', S('Wish Thief adventure p.2', '#')]] }, { t: 'Statted NPCs', li: [['When an NPC needs numbers they become a Social adversary (the Courtier is the book’s example).', S('CR p.211', '#')]] }], borrow: ['Heritage and pronouns in one line', 'An italic question as a row', 'Trigger / Effect features, with a show-to-players toggle', 'Difficulty only when needed'], avoid: ['A full stat block for every NPC'], direction: ['<b>Light by default.</b> The card stays a card; numbers appear only when the NPC needs them.'] },
		shots: [{ device: 'pair', cap: 'GM view and player view', sub: 'The abbess with her Difficulty, an NPC feature and her question; the players’ notes without the secret.', items: [{ el: () => h('div.g-dh', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCD, { extras: GDS.npcExtras() })), cap: 'GM' }, { el: () => h('div.g-dh', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, npcCard(NPCD, { mode: 'player' })), cap: 'Player' }] }],
	},
	block: {
		title: 'Adversary and environment', lede: 'The book’s order: name, tier and type, a line of description, motives and tactics, the inset box (Difficulty, thresholds, HP, Stress; ATK, weapon, range, damage), Experience, then features as "Name – Type:" with their costs in bold. Environments add impulses, potential adversaries and a question under each feature.',
		research: { cards: [{ t: 'Adversary block (CR pp.193–196)', li: [['NAME; Tier N Type; description; Motives & Tactics; the inset box; Experience; Features labelled Passive, Action or Reaction, costs bolded inline ("Mark a Stress", "Spend a Fear").', S('CR p.194', '#')], ['Minions: thresholds none, HP 1, "Minion (X)" and Group Attack. Hordes: "(5/HP)" in the type line.', S('CR pp.199, 211', '#')], ['In play the Quickstart shows one reference block and a row of slots per copy.', S('Quickstart pp.27, 35', '#')]] }, { t: 'Environment block (CR pp.240–243)', li: [['NAME; Tier N type (Exploration, Social, Traversal, Event); description; impulses; Difficulty and potential adversaries; features, each followed by italic questions.', S('CR p.241', '#')]] }], borrow: ['The inset box', '"Name – Type:" with bold costs, Fear in indigo', 'One block, a row per copy', 'Questions under environment features'], avoid: ['A separate Fear Feature badge', 'Evasion on adversaries (they use Difficulty)'], direction: ['<b>The book’s block, with the copies under it.</b>'] },
		shots: [
			{ device: 'pair', cap: 'In a note: an adversary and an environment', sub: 'Quarry Brute (a Bruiser, with a Stress cost and a Fear cost) and the Saltmarsh Toll Ferry (Traversal, with its questions).', items: [{ el: () => h('div.g-dh', { style: { width: '540px', background: 'var(--g-bg)', padding: '22px', borderRadius: '14px' } }, GDS.adv()), cap: 'Adversary' }, { el: () => h('div.g-dh', { style: { width: '540px', background: 'var(--g-bg)', padding: '22px', borderRadius: '14px' } }, GDS.env()), cap: 'Environment' }] },
			{ device: 'hover', title: 'The quarry road', path: 'Campaigns / Thornwatch / Scenes / The quarry road', cap: 'Hover card', sub: 'Hovering dh:Quarry Brute in a scene note.', under: () => proseWith('dh:Quarry Brute', { title: 'The quarry road', text: 'The cut narrows to a single cart’s width. Dust hangs in the air.', text2: 'Two of them work the face. A' }, 'looks up when the stones stop falling.'), render: () => GDS.adv('compact') },
			{ device: 'quick', cap: 'The tracker’s quick look', sub: 'One reference block, then a row of slots per copy in this fight.', tracker: () => GD.flow('gm'), sheetTitle: 'Quarry Brute', render: () => GDS.adv('compact', true) },
		],
	},
});
