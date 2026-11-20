/* The user's answers: Fear shown (exact) or hidden; groups one member at a time; Hope as a quiet chip. */

/** Hope: what the player says ("I'll spend a Hope to help"), one quiet tap. */
function hopeChips(name) {
	return quickActs(`If ${name} spends Hope`, [['Help an ally', '1 Hope'], ['Use an Experience', '1 Hope'], ['Tag team', '3 Hope']]);
}
GD.spot = (orig => (c, opts) => {
	const el = orig(c, opts);
	const btns = el.querySelector('.xd-spot-btns');
	if (btns) {
		btns.replaceWith(hopeChips(c.name), h('div.xd-spot-btns', { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }, btn({ icon: 'minus', text: 'Damage' }), btn({ icon: 'plus', text: 'Condition' })));
	}
	return el;
})(GD.spot);

/* Fear for players: shown (the exact number) or hidden. No vague words. */
GD.safe = () => {
	const enc = GD.state('players');
	const pcs = enc.combatants.filter(c => c.side === 'party');
	const foes = enc.combatants.filter(c => c.side === 'foe');
	const lab = c => c.group ? `${c.group.alive} left` : c.hp.marked === 0 ? 'Unhurt' : c.hp.marked >= c.hp.max - 1 ? 'Nearly down' : 'Hurt';
	const kael = GD.spot(byId(enc, 'kael'));
	for (const x of kael.querySelectorAll('.xd-spot-btns, .ev-qa')) x.remove();
	return [h('div.mt-top', h('div.ttl', h('h1.xd-title', { style: { fontSize: '28px', lineHeight: '34px' } }, enc.name), h('div.xd-sub', { style: { fontSize: '16px' } }, h('b', 'Kael'), ' has the spotlight')), h('span.ps-badge', icon('eye', 14, 2.2), 'Player-safe')),
		h('div.ps.xd-ps',
			h('div.xd-ps-l', kael, h('div', { style: { marginTop: '16px' } }, later(GD.cut('div.xd-fear-ps', null, h('span', { style: { font: '700 14px var(--g-font-ui)' } }, 'The GM’s Fear'), h('b', { style: { fontSize: '30px', lineHeight: '32px' } }, '5'), h('small', 'Show Fear to players is on (the default), so the table sees the exact number. Off, this panel isn’t here at all.'))))),
			h('div.xd-ps-r',
				h('div.xd-party', { style: { gridTemplateColumns: 'repeat(4, minmax(0,1fr))', margin: 0 } }, pcs.map(c => GD.pc(c))),
				h('div.xd-banner', { style: { margin: '18px 0 8px' } }, h('span', 'Adversaries')),
				h('div.xd-ps-foes', foes.map(c => GD.cut('div.xd-ps-foe', null, h('b', c.name + (c.count ? ` ×${c.count}` : '')), h('span.ps-hp' + (lab(c) === 'Nearly down' ? '.low' : ''), lab(c))))))),
	];
};
GD.settings = (orig => () => {
	const el = orig();
	const rows = [...el.querySelectorAll('.set-row')];
	const seeRow = rows.find(r => r.textContent.includes('What players see'));
	if (seeRow) seeRow.replaceWith(h('div.set-row.later', h('span', h('b', 'Show Fear to players'), h('small', 'On: the exact number, on the band and in player-safe mode. Off: hidden from the table.')), toggle('', true)));
	return el;
})(GD.settings);

for (const m of DEFS.dh.main) {
	if (m.device === 'tv') m.sub = 'Who has the spotlight, very large; the party’s own Hope, HP and Stress; adversaries as Unhurt / Hurt / Nearly down; the GM’s Fear as the exact number (Show Fear to players is on by default; off hides it). A toggle on the main tab; no separate window.';
	if (m.custom) m.sub = 'Spotlight aids (all optional), the auto-move idea (off), and the Fear sketch: by hand always, from rolls as an option, and Show Fear to players (on, exact number).';
}
DEFS.dh.flowNotes = DEFS.dh.flowNotes.map(t => t.startsWith('<b>Fear</b>') ? '<b>Fear</b> keeps its place at the top, still marked as coming later. The sketch: − and + by hand, always; optionally from logged rolls; and one GM setting, Show Fear to players (on by default), which shows the exact number or nothing.' : t);
DEFS.dh.flowNotes.push('<b>Hope is the player’s to spend.</b> On the spotlit card, Help an ally, Use an Experience and Tag team are quiet chips: the player says it, the GM taps once, nothing asks.');
DEFS['5e'].flowNotes = DEFS['5e'].flowNotes.map(t => t.startsWith('<b>A group shares') ? t.replace('On its turn, Next steps through the members', 'On its turn, Next always steps through the members one at a time') : t);

CRITIQUE.push(['Pass 8 · the user’s answers', [
	'Fear: "Vague" (low, rising, high) is gone. One setting, Show Fear to players, on by default: the exact number, or nothing. Player-safe shows 5.',
	'5e groups: always one member at a time; no mob option.',
	'Daggerheart Hope: the Hope button on the spotlit card became quiet chips (Help an ally, Use an Experience, Tag team), the same pattern as reactions. The character sheet uses it too.',
]]);
