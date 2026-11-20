/* ============================================================================
   PF2e, deep: Delay and reactions in the flow, iPad layouts, player-safe,
   Encounter settings, all four sheet states, the quick look.
   ========================================================================== */
GP.flowX = (name) => {
	const enc = clone(FIGHT_PF);
	if (name === 'react') { enc.turn.activeId = 'acolyte'; enc.turn.acted = ['valka', 'champ', 'rook', 'sela']; }
	if (name === 'delay') { enc.turn.activeId = 'acolyte'; enc.turn.acted = ['valka', 'champ', 'sela']; const r = byId(enc, 'rook'); r.order = null; }
	if (name === 'boundary') { return GP.view(clone(FIGHT_PF), 'prompt'); }
	const r = GP.view(enc, 'mid');
	const open = r.children.flat(Infinity).find(e => e && e.querySelector && e.querySelector('.xp-open'));
	if (name === 'react' && open) open.querySelector('.xp-open').append(h('div', { style: { marginTop: '12px' } }, quickActs('If someone reacts at the table', [['Valka: Reactive Strike', 'uses her reaction'], ['Pell: Shield', 'uses his reaction']])));
	if (name === 'delay') {
		const tray = h('div.xp-tray', icon('hourglass', 15), h('span', h('b', 'Delayed'), ' Rook left the order on his turn'), h('button.ev-qa-b', h('b', 'Return now'), h('small', 'after any turn')));
		r.children.splice(1, 0, tray);
	}
	return r;
};
GP.safe = () => {
	const enc = clone(FIGHT_PF);
	const all = ordered(enc).filter(c => !isOut(c));
	const lab = c => c.side === 'party' ? `${c.hp.value} / ${c.hp.max}` : c.hp.value <= 0 ? 'Down' : c.hp.value <= c.hp.max / 2 ? 'Hurt' : 'Unhurt';
	return [h('div.mt-top', h('div.ttl', h('h1.xp-title', { style: { fontSize: '28px', lineHeight: '34px' } }, enc.name), h('div.xp-sub', { style: { fontSize: '15px' } }, h('b', 'Round 3'), h('span', '·'), h('span', 'Skeletal champion is up · Rook is on deck'))), h('span.ps-badge', icon('eye', 14, 2.2), 'Player-safe')),
		h('div.ps.xp-ps', all.map(c => {
			const now = c.id === enc.turn.activeId, acted = (enc.turn.acted || []).includes(c.id);
			return h('div.xp-ps-c' + (now ? '.now' : '') + (acted ? '.is-acted' : ''), h('span.o', `Initiative ${c.order.value}`), h('b', c.name), h('span.ps-hp' + (lab(c) === 'Hurt' ? '.low' : ''), lab(c)), GP.tags((c.conds || []).filter(x => x.name !== 'Hidden')));
		}))];
};
GP.settings = () => h('div.set-modal.g-pf',
	h('div.set-head', h('h3', { style: { fontFamily: 'var(--g-font-display)' } }, 'Encounter settings'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
	h('p', { style: { margin: '0 22px 6px', fontSize: '13px', color: 'var(--g-text-2)' } }, 'Pathfinder 2e · what the tracker does for you at turn boundaries. Nothing here stops anyone acting.'),
	h('div.set-sec', 'Turn boundaries'),
	h('div.set-row', h('span', h('b', 'Show the start- and end-of-turn steps'), h('small', 'In the book’s order, in one quiet sheet: durations, recovery checks, persistent damage, frightened.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Frightened drops by 1 by itself'), h('small', 'At the end of the creature’s turn. Off: you change it by hand.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Reaction marks on every row'), h('small', 'A hooked arrow while the reaction is ready; it refreshes at the start of that creature’s turn.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Threat in the header'), h('small', 'Trivial to Extreme, from the encounter’s XP and the party.')), toggle('', true)),
	h('div.set-sec', 'Player-safe view'),
	h('div.set-row', h('span', h('b', 'Creature health'), h('small', 'What the table sees instead of HP.')), segs(['Hidden', 'Labels', 'Exact'], 'Labels')),
	h('div', { style: { height: '10px' } }));

/* Sheet states */
GPS.modal = () => h('div.sh-modal.g-pf', h('div.ev-sheet-head', h('h3', 'Wren takes a hit'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	hpPad({ who: h('span', h('b', '11'), ' / 15 → ', h('b', '4')), amount: '7', modes: ['Damage', 'Heal', 'Temp'], extra: quickActs('If Wren says she blocks', [['Shield Block', '−3 (Hardness) · her reaction · shield takes the rest']]), hint: 'Her shield is raised (AC 18). At 0 she’d gain dying 1 + wounded.', go: btn({ kind: 'primary', text: 'Apply 7' }) }));
GPS.rollState = () => {
	const el = GPS.sheet();
	const b = el.querySelectorAll('.pfs-strike')[0].querySelectorAll('.pfs-map-b')[1];
	if (b) b.classList.add('is-on');
	el.append(rollToast('Sickle, 2nd attack (agile −4)', 'd20 + 1', 15, 'Hits AC 14: roll 1d4 slashing'));
	return el;
};
Object.assign(DEFS.pf.sheet, { notes: ['<b>The multiple attack penalty is on the buttons:</b> each Strike has its first, second and third attack ready to tap; agile weapons show −4 and −8.', '<b>Shield Block is the player’s to say:</b> a quiet chip on the keypad that uses her reaction.', '<b>Dying and wounded</b> appear on the meter only when they apply; the recovery check DC is worked out for you.'] });
DEFS.pf.sheet.shots.splice(1, 0,
	{ device: 'note-landscape', title: 'Wren Halloway', cap: 'iPad landscape: a hit, and Shield Block', sub: 'Shield Block is a quiet chip: Wren says it, the player taps it, her reaction is spent.', render: () => GPS.sheet(), overlay: () => GPS.modal() },
	{ device: 'note-portrait', title: 'Wren Halloway', cap: 'iPad portrait: a second Strike', sub: 'The +1 button (her second attack, agile) is the one tapped; the roll lands in the toast.', render: () => GPS.rollState() });
DEFS.pf.block.shots.push({ device: 'quick', cap: 'The tracker’s quick look', sub: 'Tapping a creature in the tracker: the same block over the panel.', tracker: () => GP.view(FIGHT_PF, 'mid'), sheetTitle: 'Mire Lantern', render: () => GPS.block('compact') });
DEFS.pf.npc.research = { cards: [{ t: 'NPCs in PF2e', li: [['NPCs use the creature block, with a level and the same order; the GM Core’s NPC gallery gives ready blocks by role.', S('PF2e GM Core, NPC gallery', '#')], ['A named NPC in an adventure: a short description, then "use the X stat block, level N".', S('PF2e adventures', '#')]] }], borrow: ['Creature N and the three numbers that matter at the table (AC, HP, Perception)'], avoid: ['A second block layout for NPCs'], direction: ['<b>The shared card, the creature block behind it.</b>'] };

DEFS.pf.flow.push(
	{ cap: 'A reaction, said at the table', sub: 'The acolyte steps away from Valka. If her player says Reactive Strike, one tap logs it and her reaction mark goes.', render: () => GP.flowX('react'), height: 860 },
	{ cap: 'Delay', sub: 'Rook delayed: he leaves the order into a tray, and can come back after any turn.', render: () => GP.flowX('delay'), height: 860 },
	{ cap: 'End of a turn', sub: 'The book’s steps in one sheet: persistent damage, the flat check, then frightened.', render: () => GP.flowX('boundary'), height: 860 });
DEFS.pf.flowNotes.push('<b>Reactions are said at the table:</b> quiet chips on the open row, never prompts.');
DEFS.pf.main.splice(1, 0,
	{ device: 'landscape', cap: 'iPad landscape (1180 × 820)', sub: 'The list with the open row, and the turn steps beside it.', render: () => GP.main() },
	{ device: 'portrait', cap: 'iPad portrait (820 × 1180)', sub: 'One column: the list, then the steps.', render: () => GP.main() },
	{ device: 'tv', cap: 'Player-safe', sub: 'Who’s up and on deck; creatures as Unhurt / Hurt / Down; the party’s own HP; conditions as tags.', render: () => GP.safe() },
	{ custom: () => h('div', { style: { display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' } }, GP.settings(), h('div.prose', { style: { maxWidth: '420px', fontSize: '14px' } }, h('p', h('b', 'Encounter settings for PF2e.'), ' Turn-boundary help is on by default because it’s where GMs forget things; every piece can be turned off.'))), cap: 'Encounter settings', sub: 'Turn-boundary steps, frightened, reaction marks, threat, player-safe.' });
