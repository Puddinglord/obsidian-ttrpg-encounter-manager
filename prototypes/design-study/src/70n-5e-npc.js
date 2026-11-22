/* ============================================================================
   5e NPCs with stats: a mini character under the shared NPC card.
   The stats come from a linked SRD stat block (with the NPC's own changes on
   top), are typed into the note, or don't exist (a story-only NPC). GM only.
   ========================================================================== */
const G5N = {};
const ABN = { Str: 'Strength', Dex: 'Dexterity', Con: 'Constitution', Int: 'Intelligence', Wis: 'Wisdom', Cha: 'Charisma' };
const mod5 = s => Math.floor((s - 10) / 2);

/** Odile Varr: the SRD Priest (2014 numbers), with her own AC and HP on top. */
const NPC5_STATS = {
	src: { kind: 'block', ref: 'Priest', ed: '2014', changed: [['AC', 15, 13], ['HP', 30, 27]] },
	ac: 15, acNote: 'chain shirt, shield', hp: { value: 30, max: 30 }, hpDice: '5d8 + 5', speed: '25 ft', init: 0, cr: '2', pb: 2,
	ab: [['Str', 10], ['Dex', 10], ['Con', 12], ['Int', 13], ['Wis', 16], ['Cha', 13]], saves: [],
	skills: [['Int', 'Religion', 4], ['Wis', 'Medicine', 7], ['Cha', 'Persuasion', 3]],
	senses: 'Passive Perception 13', languages: 'Common, Sylvan',
	actions: [
		['Actions', 'Mace', 'Melee · 5 ft', { hit: '+2' }, '1d6', 'bludgeoning'],
		['Actions', 'Sacred Flame', 'Cantrip · 60 ft · Dex save', { dc: 'DC 13' }, '2d8', 'radiant'],
		['Actions', 'Guiding Bolt', '1st-level slot · 120 ft', { hit: '+5' }, '4d6', 'radiant'],
		['Bonus action', 'Divine Eminence', 'Spend a slot: melee hits deal extra radiant this turn', null, '3d6', 'radiant'],
	],
};
/** Brother Hask: typed straight into his note (no stat block). */
const NPC5_HASK = { name: 'Brother Hask', role: 'Bell-ringer of the drowned chapel', facts: 'Dwarf · he/him · 40s',
	links: [['flag', 'Faction', 'The Bell Choir'], ['castle', 'Found at', 'The bell tower']], status: 'alive', attitude: 'hostile',
	rows: [['Look', 'Rope burns on both palms; a hammer on his belt he never puts down.'], ['Wants', 'Nobody touches the bell but him.'], ['Voice', 'Shouts, as if the bell were still ringing.']],
	secret: 'He cut the bell rope himself.' };
const NPC5_HASK_STATS = {
	src: { kind: 'own' },
	ac: 13, acNote: 'leather, shield', hp: { value: 9, max: 19 }, hpDice: '3d8 + 6', speed: '25 ft', init: 1, cr: '1/2', pb: 2,
	ab: [['Str', 15], ['Dex', 12], ['Con', 14], ['Int', 9], ['Wis', 11], ['Cha', 10]], saves: ['Con'],
	skills: [['Str', 'Athletics', 4], ['Wis', 'Perception', 2]],
	senses: 'Darkvision 60 ft · Passive Perception 12', languages: 'Common, Dwarvish',
	actions: [
		['Actions', 'Bell hammer', 'Melee · 5 ft', { hit: '+4' }, '1d8 + 2', 'bludgeoning'],
		['Actions', 'Peal', 'Recharge 5–6 · 10 ft around him · Con save, half on a success', { dc: 'DC 12' }, '2d6', 'thunder'],
	],
};
/** Mother Sel: a story-only NPC. No stats until someone needs them. */
const NPC5_SEL = { name: 'Mother Sel', role: 'Ferrywoman on the reed paths', facts: 'Halfling · she/her · 70s',
	links: [['castle', 'Found at', 'The reed ferry'], ['book', 'First met', 'Session 10']], status: 'alive', attitude: 'friendly',
	rows: [['Look', 'Pole taller than she is; a lantern that never quite goes out.'], ['Wants', 'Fares paid in stories, not coin.']] };

/** A 5e: reference, as the plugin draws it everywhere. */
G5N.ref = name => h('span.npc-ref.x5-ref', h('span.k', '5e'), h('span.v', name));

/** Small fact tiles: a small-caps label over a Garamond value; Initiative rolls. */
G5N.fact = (label, value, opts = {}) => h((opts.roll ? 'button' : 'span') + '.x5n-fact' + (opts.roll ? '.is-roll' : ''), { title: opts.roll ? `Roll ${label.toLowerCase()} ${value}` : label },
	h('small', label), h('b', value));

/** The vitals band: AC shield, HP as the shared meter (−, +, keypad), then Speed, Initiative, CR, PB. */
G5N.vitals = (st, opts = {}) => {
	const acChanged = st.src.changed && st.src.changed.find(c => c[0] === 'AC');
	const hpChanged = st.src.changed && st.src.changed.find(c => c[0] === 'HP');
	return h('div.x5n-vit',
		h('div.x5n-ac', { title: `Armor Class ${st.ac}${st.acNote ? ' (' + st.acNote + ')' : ''}${acChanged ? `; the stat block says ${acChanged[2]}` : ''}` },
			G5.shield(st.ac, opts.compact ? 38 : 44), acChanged ? h('i.x5n-own', { title: `Her own: the ${st.src.ref} block says ${acChanged[2]}` }) : null),
		h('div.x5n-hp', meter({ value: st.hp.value, max: st.hp.max, label: 'Hit points', extra: h('span.x5n-hpd', `(${st.hpDice})`, hpChanged ? h('i.x5n-own', { title: `Her own: the ${st.src.ref} block says ${hpChanged[2]}` }) : null) })),
		h('div.x5n-facts', G5N.fact('Speed', st.speed), G5N.fact('Initiative', sgn(st.init), { roll: true }), G5N.fact('CR', st.cr), G5N.fact('PB', sgn(st.pb))));
};

/** The six abilities as small plaques: modifier large (it rolls), score small; the save under it, marked when proficient. */
G5N.abilities = st => h('div.x5n-ab', st.ab.map(([k, score]) => {
	const m = mod5(score), prof = st.saves.includes(k), save = m + (prof ? st.pb : 0);
	return h('div.x5n-a' + (prof ? '.is-prof' : ''),
		h('div.x5n-a-top', h('span.k', { title: ABN[k] }, k), h('button.m', { title: `Roll ${ABN[k]} ${sgn(m)}` }, sgn(m)), h('span.s', String(score))),
		h('button.x5n-sv', { title: `Roll ${ABN[k]} save ${sgn(save)}${prof ? ' (proficient)' : ''}` }, G5S.mark(prof ? 1 : 0), h('span', 'Save'), h('b', sgn(save))));
}));
/** The NPC's skills: roll buttons, each with the ability it uses. */
G5N.skills = st => h('span.x5n-skills', st.skills.map(([k, n, v]) => h('button.x5n-sk', { title: `Roll ${n} ${sgn(v)} (${ABN[k]})` }, h('span', term(n)), h('small', k), h('b', sgn(v)))));

/** Senses and languages, as the stat block words them. */
G5N.lines = st => h('div.x5n-lines',
	h('div', h('span.l', 'Skills'), G5N.skills(st)),
	h('div', h('span.l', 'Senses'), h('span', st.senses)),
	h('div', h('span.l', 'Languages'), h('span', st.languages)));

/** Actions as roll buttons: to hit (or the save DC), then the shared damage button (dice and the type's icon). */
G5N.actions = st => {
	const out = [];
	let grp = null;
	for (const [g, name, note, hit, dmg, type] of st.actions) {
		if (g !== grp) { grp = g; out.push(h('div.x5n-grp', g)); }
		out.push(h('div.x5n-act', { title: note },
			h('b', name), h('small', note),
			hit && hit.hit ? rollBtn('', hit.hit, { noIcon: true, cls: 'x5n-hit' }) : hit && hit.dc ? h('span.x5n-dc', { title: 'The target saves' }, hit.dc) : h('span'),
			dmgBtn(dmg, type)));
	}
	return h('div.x5n-acts', out);
};

/** The stats block. folded: one summary line. compact: hover card and quick look. */
G5N.stats = (st, opts = {}) => {
	const own = st.src.kind === 'own';
	const head = h('div.x5n-h',
		h('button.x5n-fold', { title: opts.folded ? 'Show stats' : 'Fold stats', 'aria-expanded': String(!opts.folded) }, icon(opts.folded ? 'chevron-right' : 'chevron-down', 14), h('span', 'Stats')),
		own ? h('span.x5n-src', h('small', 'Typed in this note'))
			: h('span.x5n-src', h('small', 'From'), G5N.ref(st.src.ref), st.src.changed ? h('small.x5n-ch', h('i.x5n-own'), `${st.src.changed.map(c => c[0]).join(' and ')} are her own`) : null),
		h('span.x5n-sp'),
		cluster([btn({ size: 'sm', icon: 'swords', text: 'Add to fight' })], { fixed: true }));
	if (opts.folded) return h('section.x5n.is-folded', head,
		h('div.x5n-sum', G5.shield(st.ac, 26), h('span', h('small', 'HP'), h('b', `${st.hp.value}`), h('em', ` / ${st.hp.max}`)), h('span', h('small', 'CR'), h('b', st.cr)), h('span', h('small', 'Init'), h('b', sgn(st.init))), h('span.x5n-sum-a', `${st.actions.length} actions`)));
	return h('section.x5n' + (opts.compact ? '.is-compact' : ''), h('span.x5-corners'), head,
		G5N.vitals(st, opts), G5N.abilities(st), G5N.lines(st), G5N.actions(st));
};

/** No stats yet: one quiet line with the two ways to add them. */
G5N.addStats = () => h('section.x5n.is-empty',
	h('span.x5n-empty-t', icon('statblock', 14), 'A story NPC: no stats'),
	cluster([btn({ size: 'sm', kind: 'quiet', icon: 'plus', text: 'From a stat block' }), btn({ size: 'sm', kind: 'quiet', text: 'Type them in' })], { fixed: true }));

/** The card: the shared NPC card, then the stats as their own block under it (GM only; players never get them). */
G5N.card = (npc, st, opts = {}) => {
	const player = opts.mode === 'player';
	const card = npcCard(npc, { mode: player ? 'player' : 'gm', size: opts.size });
	if (!player) card.append(st ? G5N.stats(st, { folded: opts.folded, compact: opts.size === 'compact' }) : G5N.addStats());
	return card;
};
/** The hover card is a peek: the card's head, what the NPC wants, then the stats. The note has the rest. */
G5N.peek = npc => Object.assign(clone(npc), { rows: npc.rows.filter(r => r[0] === 'Wants'), secret: null, links: npc.links.slice(0, 1) });
/** A card on its own, in a note-like stage that is its own container (so the card's container queries apply). */
G5N.stage = (el, w = 640) => h('div.g-5e.x5-paper.x5n-stage', { style: { width: w + 'px', maxWidth: '100%', padding: '20px', borderRadius: '10px', boxShadow: 'inset 0 0 0 1px var(--g-line)' } }, el);

/** What the NPC note's properties hold. Existing keys keep their names; the new ones are optional. */
G5N.props = kind => {
	const rows = kind === 'block'
		? [['statblock', '5e:Priest', 'existing'], ['ac', '15', 'existing · overrides the block'], ['hp', '30', 'existing · overrides the block'], ['cr', '2', 'existing']]
		: [['ac', '13', 'existing'], ['hp', '19', 'existing'], ['cr', '1/2', 'existing'], ['str … cha', '15, 12, 14, 9, 11, 10', 'new · one key each'], ['saves', 'con', 'new'], ['skills', 'athletics: 4, perception: 2', 'new'], ['speed', '25 ft', 'new'], ['senses', 'darkvision 60 ft', 'new'], ['languages', 'Common, Dwarvish', 'new'], ['actions', '- Bell hammer: +4, 1d8 + 2 bludgeoning', 'new · one line each']];
	return h('div.x5n-props', h('div.x5n-props-h', icon('list', 14), 'Properties'),
		rows.map(([k, v, n]) => h('div.x5n-prop', h('code', k), h('span', v), h('small' + (n.startsWith('new') ? '.new' : ''), n))));
};

/* ---------- The 5e NPC tab ---------- */
Object.assign(DEFS['5e'].npc, {
	title: 'NPC card',
	lede: 'The shared card in 5e’s frame, and under it, for the GM, a mini character: AC in the shield, HP as a meter with − / + and the keypad, speed, initiative, CR and proficiency; six ability plaques with their saves and the NPC’s skills; senses and languages; actions as roll buttons with their damage type. The numbers come from a linked SRD stat block (with the NPC’s own changes marked), from the note itself, or not at all.',
	notes: [
		'<b>Three sources, one block.</b> (a) <i>From a stat block:</i> “From 5e:Priest” in the head; a small oxblood diamond marks every number that is the NPC’s own (AC 15, HP 30 over the Priest’s 13 and 27). (b) <i>Typed in:</i> the same block, labelled “Typed in this note”. (c) <i>None:</i> the card stays light; one quiet line offers “From a stat block” or “Type them in”.',
		'<b>It folds.</b> The head is a button: folded, the block is one line (AC, HP, CR, initiative, how many actions). The fold is remembered per note.',
		'<b>In play.</b> HP is the shared meter and keypad, so damage taken in a note is the same as in the tracker; Add to fight puts the NPC in the active encounter with these numbers.',
		'<b>Players</b> never get the block or the “Add stats” line: their card is their own notes.',
		'<b>Properties</b> (the NPC note’s frontmatter): today the plugin reads <code>statblock</code>, <code>ac</code>, <code>hp</code>, <code>cr</code>; those keep their names and still override the block. New, optional: <code>str</code> <code>dex</code> <code>con</code> <code>int</code> <code>wis</code> <code>cha</code>, <code>saves</code>, <code>skills</code>, <code>speed</code>, <code>senses</code>, <code>languages</code>, <code>actions</code> (one line each, in the stat block’s words). Missing keys fall back to the linked block; with no block and no keys, the NPC is story-only.',
	],
	shots: [
		{ device: 'pair', cap: 'GM view and player view', sub: 'Odile Varr uses the SRD Priest, with her own AC and HP (the oxblood diamonds). Players get their notes and nothing else.', items: [{ el: () => G5N.stage(G5N.card(NPC5, NPC5_STATS), 640), cap: 'GM: from a stat block' }, { el: () => G5N.stage(G5N.card(NPC5, null, { mode: 'player' }), 640), cap: 'Player' }] },
		{ device: 'pair', cap: 'Typed in, and story-only', sub: 'Brother Hask’s numbers live in his note (he has taken 10 damage). Mother Sel has none: one quiet line offers to add them.', items: [{ el: () => G5N.stage(G5N.card(NPC5_HASK, NPC5_HASK_STATS), 640), cap: 'GM: typed in' }, { el: () => h('div', { style: { display: 'grid', gap: '16px' } }, G5N.stage(G5N.card(NPC5_SEL, null), 640), G5N.stage(G5N.card(NPC5, NPC5_STATS, { folded: true }), 640)), cap: 'GM: story-only, and a folded block' }] },
		{ device: 'note-laptop', title: 'Odile Varr', path: 'Campaigns / The drowned chapel / NPCs / Odile Varr', cap: 'Laptop: the NPC’s note', sub: 'The card heads her note; the stats sit under the rows, before the note’s own text.', render: () => G5N.card(NPC5, NPC5_STATS), height: 1080 },
		{ device: 'hover', title: 'Session 12', path: 'Campaigns / The drowned chapel / Sessions / Session 12', cap: 'Hover card', sub: 'Hovering [[Odile Varr]]: a peek (her head, what she wants) and the compact stats: plaques six across, actions on one line each (the note is the tooltip). Her look, voice and secret stay in her note.', under: () => proseWith('Odile Varr', { title: 'Session 12', text: 'The bell rope is cut. The reed paths flood at dusk.', text2: 'In the vestry,' }, 'won’t meet their eyes.'), render: () => { const el = G5N.card(G5N.peek(NPC5), NPC5_STATS, { size: 'compact' }); queueMicrotask(() => { const hc = el.closest('.hc'); if (hc) { hc.style.maxHeight = '900px'; hc.style.top = '96px'; } }); return el; }, height: 1040 },
		{ device: 'quick', cap: 'The tracker’s quick look', sub: 'Brother Hask in the fight: the same peek as the hover card (head, what he wants), then his stats, compact, over the tracker.', tracker: () => G5.flow('mid'), sheetTitle: 'Brother Hask', render: () => G5N.card(G5N.peek(NPC5_HASK), NPC5_HASK_STATS, { size: 'compact' }), height: 1000 },
		{ device: 'note-portrait', title: 'Brother Hask', cap: 'iPad portrait', sub: 'The full block at note width: vitals in one row, six plaques with their saves (Con proficient), skills as roll buttons, each action’s buttons right after its name and the note after them.', render: () => G5N.card(NPC5_HASK, NPC5_HASK_STATS) },
		{ device: 'note-phone', title: 'Session 12', cap: 'Phone: tapping her name in a session note', sub: 'On a phone the hover card is a sheet: the same peek and compact stats. AC beside HP, the facts in a row of four, plaques six across, one line per action.', render: () => G5N.card(G5N.peek(NPC5), NPC5_STATS, { size: 'compact' }) },
		{ device: 'pair', cap: 'What the note’s properties hold', sub: 'Existing keys keep their names; new ones are optional and fall back to the linked block.', items: [{ el: () => G5N.stage(G5N.props('block'), 420), cap: 'From a stat block, with overrides' }, { el: () => G5N.stage(G5N.props('own'), 520), cap: 'Typed in' }] },
	],
});
DEFS['5e'].npc.research.cards.push({ t: 'Visual critique log (NPC stats)', li: [
	['<b>Before:</b> one line of chips (a small AC shield, “HP 27 (5d8 + 5)”, “CR 2”, the Priest reference, Add to fight). It read as an afterthought next to the card’s portrait and Garamond.', S('user screenshot', '#')],
	['<b>Pass 1:</b> the block moved under the rows, full card width, framed like the sheet’s vitals band (gold hairline and corners). Vitals reuse the sheet’s shield, the shared meter and plate-like fact tiles; plaques are the sheet’s, shrunk (modifier 22px, score in a pill), with saves and skills under them.', S('Screenshots, laptop and iPad', '#')],
	['<b>Pass 2:</b> at hover and phone widths the vitals split into two rows and the plaques go three across; action rows put the note under the name. Own-number diamonds checked in dark (oxblood on leather reads). Labels stay with their values: “Save +2” is one centred unit in each plaque, an action’s buttons follow its name in fixed columns (the note comes after), and the story-only line keeps its offer beside its words. Every label, number and icon measured by pixel bounds within 1px of its box’s centre.', S('Hover card, quick look, phone; light and dark', '#')],
] });
DEFS['5e'].npc.research.borrow = DEFS['5e'].npc.research.borrow.concat(['The sheet’s plaques and vitals band, shrunk', 'A marker on numbers the NPC changed from its block']);
DEFS['5e'].npc.research.direction = ['<b>One card, two readers; the GM’s has a mini character.</b> The same numbers, in the same places, as the sheet and the stat block, so an NPC in play reads like a hero.'];

/* The Shared page describes what each game adds to the NPC card; 5e now adds a mini character, not chips. */
document.addEventListener('DOMContentLoaded', () => {
	for (const li of document.querySelectorAll('ul.prose li')) {
		const b = li.querySelector('b');
		if (!b || !/Each game adds, GM only/.test(b.textContent)) continue;
		for (const n of li.childNodes) if (n.nodeType === 3 && n.textContent.includes('5e AC, HP, CR and a stat block')) n.textContent = n.textContent.replace('5e AC, HP, CR and a stat block', '5e a mini character (AC, HP meter, speed, initiative, CR, PB, six ability plaques, senses, languages, actions), from a linked stat block, typed in, or none');
	}
});
