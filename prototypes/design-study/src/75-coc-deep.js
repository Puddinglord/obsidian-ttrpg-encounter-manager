/* ============================================================================
   Call of Cthulhu, deep: the defender’s answer as quiet chips on the
   attacker’s turn, group Sanity from the creature, the end of the round,
   iPad layouts, player-safe, Encounter settings, all four sheet states.
   ========================================================================== */
GC.flowX = (name) => {
	const enc = clone(FIGHT_COC);
	if (name === 'start') { enc.turn.round = 1; enc.turn.activeId = 'harriet'; enc.turn.acted = []; byId(enc, 'amos').hp.value = 10; byId(enc, 'amos').status = undefined; byId(enc, 'amos').conds = []; byId(enc, 'cult2').hp.value = 10; byId(enc, 'cult2').status = undefined; }
	if (name === 'eor') { enc.turn.activeId = 'amos'; enc.turn.acted = ['harriet', 'cult1', 'jonah', 'ghoul']; }
	const r = GC.page(enc, 'mid');
	const open = r.children.flat(Infinity).find(e => e && e.classList && e.classList.contains('is-current'));
	if (name === 'attack' && open) {
		const o = open.querySelector('.xc-open');
		o.append(h('div', h('div.xc-sbox-cap', 'Claws on Jonah Pike'), quickActs('If Jonah responds at the table', [['Dodge', '35 · 17 · 7'], ['Fight back', '25 · 12 · 5'], ['No response', '']]), h('p.xc-note', { style: { margin: '4px 0 0' } }, 'Jonah already dodged once this round: the ghoul’s attack gets a bonus die (outnumbered).')));
	}
	if (name === 'sanity' && open) {
		const o = open.querySelector('.xc-open');
		o.prepend(h('div', quickActs('When the investigators first see it', [['Sanity rolls', '0/1D6 · everyone who sees it']])));
	}
	if (name === 'eor') {
		const line = r.children.flat(Infinity).find(e => e && e.classList && e.classList.contains('xc-eor'));
		if (line) line.replaceWith(h('div.xc-eor.big', icon('hourglass', 15), h('span', h('b', 'End of round 2'), h('br'), 'Amos is dying: a CON roll, or he dies. Only First Aid stabilises him.'), btn({ size: 'sm', kind: 'primary', icon: 'dice', text: 'CON 55' })));
	}
	if (name === 'start') {
		r.children.splice(1, 0, h('div.xc-start', icon('gun', 15), h('span', 'Round 1. Harriet and the shotgun cultist had guns drawn: DEX + 50. Drawing one now fires next round.')));
	}
	return r;
};
GC.safe = () => {
	const enc = clone(FIGHT_COC);
	const all = ordered(enc).filter(c => !isOut(c));
	const lab = c => c.side === 'party' ? null : c.hp.value <= 0 ? 'Down' : c.hp.value <= c.hp.max / 2 ? 'Badly hurt' : c.hp.value < c.hp.max ? 'Hurt' : 'Unhurt';
	return [h('div.mt-top', h('div.ttl', h('h1.xc-title', { style: { fontSize: '30px', lineHeight: '36px' } }, enc.name), h('div.xc-sub', { style: { fontSize: '17px' } }, 'Round 2 · the ghoul acts · Amos is next')), h('span.ps-badge', icon('eye', 14, 2.2), 'Player-safe')),
		h('div.ps.xc-ps', h('div.xc-ps-in', all.map(c => {
			const now = c.id === enc.turn.activeId, acted = (enc.turn.acted || []).includes(c.id);
			return h('div.xc-ps-r' + (now ? '.now' : '') + (acted ? '.is-acted' : ''), GC.dex(c), h('b', c.name),
				c.side === 'party' ? h('span.pools', GC.cell('HP', c.hp.value, { tone: c.hp.value < c.hp.max ? 'hurt' : '' }), GC.cell('SAN', c.san.value, { tone: 'san' })) : h('span.ps-hp' + (lab(c) === 'Badly hurt' ? '.low' : ''), lab(c)),
				h('span.st', (c.conds || []).map(x => x.name).join(' · ')));
		})))];
};
GC.settings = () => h('div.set-modal.g-coc',
	h('div.set-head', h('h3', { style: { fontFamily: 'var(--g-font-display)', fontWeight: 500 } }, 'Encounter settings'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
	h('p', { style: { margin: '0 22px 6px', fontSize: '13px', color: 'var(--g-text-2)' } }, 'Call of Cthulhu · optional rules and what the tracker shows. Nothing here stops anyone acting.'),
	h('div.set-sec', 'Order'),
	h('div.set-row', h('span', h('b', 'Roll DEX for initiative'), h('small', 'The optional rule: order by level of success, Extreme first. Off: plain DEX order.')), toggle('', false)),
	h('div.set-row', h('span', h('b', 'Drawn guns at DEX + 50'), h('small', 'A toggle on each combatant; drawing one now takes effect next round.')), toggle('', true)),
	h('div.set-sec', 'Rolls'),
	h('div.set-row', h('span', h('b', 'Spending Luck in combat'), h('small', 'Optional; many Keepers keep it out of fights. On: a quiet "Spend Luck" chip after a failed roll.')), toggle('', false)),
	h('div.set-row', h('span', h('b', 'Note the outnumbered bonus die'), h('small', 'After a target has dodged or fought back once this round.')), toggle('', true)),
	h('div.set-sec', 'Player-safe view'),
	h('div.set-row', h('span', h('b', 'Investigators’ HP and Sanity'), h('small', 'Players see their own numbers; off shows names only.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Creature health'), h('small', 'What the table sees.')), segs(['Hidden', 'Labels'], 'Labels')),
	h('div', { style: { height: '10px' } }));

/* Sheet states */
GCS.modal = () => h('div.sh-modal.g-coc', h('div.ev-sheet-head', h('h3', 'Mabel takes a wound'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	hpPad({ who: h('span', 'HP ', h('b', '11'), ' of 11 → ', h('b', '5')), amount: '6', modes: ['Damage', 'Impale', 'Heal'], hint: '6 is half her maximum or more: a major wound. She falls prone and makes a CON roll or falls unconscious.', go: btn({ kind: 'primary', text: 'Apply 6, major wound' }) }));
GCS.rollState = () => {
	const el = GCS.sheet();
	el.append(rollToast('Library Use', 'd100: 14', 14, 'Hard success (30 or under)'));
	const skills = el.querySelector('.xcs-skills');
	if (skills) skills.before(quickActs('If Mabel’s player wants', [['Push the roll', 'say how she tries harder; failing costs more'], ['Spend Luck', 'off in this campaign']]));
	return el;
};
GCS.dying = () => {
	const el = GCS.sheet();
	const box = el.querySelector('.xcs-pools .xc-sbox');
	if (box) box.replaceWith(GC.box(['max', 'current'], [11, 0], [null, 'hurt']));
	const st = el.querySelector('.xcs-pools .xcs-st');
	if (st) st.replaceWith(h('div.xcs-st', GCS.ck('Major wound', true), GCS.ck('Dying', true), GCS.ck('Unconscious')));
	el.querySelector('.xcs-pools').after(h('div.xc-slip.xcs-note', h('b', 'Dying.'), ' A CON roll at the end of every round, or she dies; only First Aid stabilises her, then Medicine.', btn({ size: 'sm', icon: 'dice', text: 'CON 60' })));
	return el;
};
DEFS.coc.sheet.shots = [
	DEFS.coc.sheet.shots[0],
	{ device: 'note-landscape', title: 'Mabel Ostrander', cap: 'iPad landscape: a wound through the keypad', sub: 'The keypad knows half her maximum and says what a major wound means.', render: () => GCS.sheet(), overlay: () => GCS.modal() },
	{ device: 'note-portrait', title: 'Mabel Ostrander', cap: 'iPad portrait: a skill roll', sub: 'Library Use 14 against 60: a Hard success. Pushing (and Luck, where the Keeper allows it) are the player’s to ask for: quiet chips.', render: () => GCS.rollState() },
	{ device: 'note-phone', title: 'Mabel Ostrander', cap: 'Phone: dying', sub: '0 HP with a major wound: Dying is ticked and the sheet says what each round asks.', render: () => GCS.dying() },
	DEFS.coc.sheet.shots[1],
].concat(DEFS.coc.sheet.shots.slice(2));
DEFS.coc.sheet.shots[4].cap = 'Phone: after a Sanity loss';
DEFS.coc.sheet.notes = ['<b>Every roll shows its three thresholds</b> (Regular | Hard | Extreme); the toast names the level of success.', '<b>Pushing and Luck are the player’s to ask for:</b> quiet chips after a roll, never a prompt. Luck spending is a setting, off by default.', '<b>Wounds and Sanity</b> tick the sheet’s own boxes; the sheet says what the next round asks.'];
DEFS.coc.block.shots.push({ device: 'quick', cap: 'The tracker’s quick look', sub: 'Tapping the creature in the tracker: the same entry over the panel.', tracker: () => GC.page(FIGHT_COC, 'mid'), sheetTitle: 'Silt Congregant', render: () => GCS.block('compact') });
DEFS.coc.npc.research = { cards: [{ t: 'NPCs in the Keeper Rulebook', li: [['Human NPCs: two lines of characteristics (STR CON SIZ DEX INT / APP POW EDU SAN HP), then DB, Build, Move, attacks with Regular/Half/Fifth, Dodge, a few skills.', S('Keeper Rulebook p.362', '#')], ['One block can serve several NPCs; throwaway NPCs need only a name, a job and a few stats on an index card.', S('Keeper Rulebook pp.191, 362', '#')], ['NPCs usually have no Luck.', S('Keeper Rulebook p.200', '#')]] }], borrow: ['The two-line block', 'Only the fields that apply'], avoid: ['A full investigator sheet for NPCs'], direction: ['<b>The index card, on the shared card.</b>'] };

DEFS.coc.flow = [
	{ cap: 'Round 1: drawn guns first', sub: 'Harriet (60 + 50) and the shotgun cultist (50 + 50) act before Jonah’s DEX 70.', render: () => GC.flowX('start'), height: 860 },
	DEFS.coc.flow[0],
	{ cap: 'The ghoul attacks: Jonah answers at the table', sub: 'Dodge, Fight back or nothing: quiet chips with his three thresholds; the outnumbered bonus die is noted, not asked.', render: () => GC.flowX('attack'), height: 860 },
	{ cap: 'First sight: Sanity rolls', sub: 'A chip on the creature opens the group Sanity sheet when the Keeper calls for it.', render: () => GC.flowX('sanity'), height: 860 },
	{ cap: 'End of the round: a dying investigator', sub: 'Amos’s CON roll sits on the end-of-round line, with its threshold.', render: () => GC.flowX('eor'), height: 860 },
];
DEFS.coc.flowNotes.push('<b>Defending is the target’s choice:</b> Dodge or Fight Back as quiet chips on the attacker’s entry, never a pop-up.');
DEFS.coc.main.splice(1, 0,
	{ device: 'landscape', cap: 'iPad landscape (1180 × 820)', sub: 'The page and the defender’s side column.', render: () => GC.main() },
	{ device: 'portrait', cap: 'iPad portrait (820 × 1180)', sub: 'One column: the page, then the defender’s choice and the end of the round.', render: () => GC.main() },
	{ device: 'tv', cap: 'Player-safe', sub: 'DEX order; investigators see their own HP and Sanity; creatures as Unhurt / Hurt / Badly hurt; nothing else.', render: () => GC.safe() },
	{ custom: () => h('div', { style: { display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' } }, GC.settings(), h('div.prose', { style: { maxWidth: '420px', fontSize: '14px' } }, h('p', h('b', 'Encounter settings for Call of Cthulhu.'), ' The optional rules (DEX rolls for order, Luck in combat) are off by default; the reminders are on.'))), cap: 'Encounter settings', sub: 'Order, rolls, player-safe.' });
