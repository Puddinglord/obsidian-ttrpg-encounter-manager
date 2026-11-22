/* ============================================================================
   Refinement: keep the table talking. Quiet reaction actions, 5e group
   members, Nimble's by-target setting, Daggerheart's Fear controls sketched,
   simpler keys.
   ========================================================================== */

/** What a player says at the table ("I Defend"), as one quiet tap on the damage sheet. Never a prompt. */
function quickActs(label, items) {
	return h('div.ev-qa', h('span.ev-qa-l', label), items.map(([b, sm]) => h('button.ev-qa-b', h('b', b), sm ? h('small', sm) : null)));
}

/** The key hint every main tab shows. Shortcuts work only while the encounter tab has focus. */
function keysHint(space = 'done') {
	return h('span.keys', h('span', h('kbd', '↑↓'), 'move'), h('span', h('kbd', '↵'), 'make active'), h('span', h('kbd', 'Space'), space), h('span', h('kbd', 'Z'), 'undo'), h('span', h('kbd', 'Esc'), 'close'));
}
mainShot = (orig => (def, m) => {
	const el = orig(def, m);
	for (const k of el.querySelectorAll('.mt-foot .keys')) k.replaceWith(keysHint(def.id === 'dh' ? 'next player' : 'done'));
	for (const s of el.querySelectorAll('.x5-actions-h small')) s.remove();
	return el;
})(mainShot);

/* ---------- 5e: Next steps through a group's members on the card ---------- */
G5.groupCard = () => {
	const enc = clone(FIGHT_5E);
	const a = byId(enc, 'gob1');
	a.conds = [];
	return h('div.x5-focus',
		h('div.x5-f-top', G5.lozenge(12), h('div.x5-f-name', h('h2', 'Goblin A'), h('p', 'Goblins · one initiative · 1 of 2')), btn({ icon: 'more', kind: 'quiet icon', size: 'sm' })),
		G5.taper(),
		h('div.x5-members', [['A', '7 / 7', 'on'], ['B', '2 / 7 · Prone', ''], ['C', 'down', 'out']].map(([n, hp, st]) => h('span' + (st ? '.' + st : ''), h('b', `Goblin ${n}`), hp))),
		h('div.x5-vitals', shieldNum(15, 40), G5.hpBlock(a)),
		h('div.x5-acts', btn({ icon: 'minus', text: 'Damage' }), btn({ icon: 'plus', text: 'Heal' }), btn({ icon: 'tag', kind: 'icon', title: 'Add a condition' }), btn({ icon: 'book', kind: 'icon', title: 'Stat block' })));
};
G5.flow = (orig => (state, kind) => {
	if (state !== 'group') return orig(state, kind);
	const r = orig('mid', kind);
	const enc = clone(FIGHT_5E);
	enc.turn.activeId = 'gob1'; enc.turn.acted = ['ilse', 'hag', 'boss', 'corin'];
	const p = G5.parts(enc, { group: true });
	const head = r.children[0];
	head.querySelector('.x5-round').replaceWith(h('div.x5-round', h('b', 'Round 2'), h('span', '·'), h('span', 'The goblins’ turn'), h('span.x5-ed', '2024')));
	return { children: [head, G5.groupCard(), p.els], foot: h('div.ev-foot', btn({ icon: 'undo', kind: 'icon', title: 'Back' }), btn({ icon: 'next', kind: 'primary', text: 'Next: Goblin B' })) };
})(G5.flow);

/* ---------- Nimble: a hero takes a hit; the by-target setting ---------- */
GN.flowHit = () => {
	const r = GN.flow('monsters');
	r.overlay = sheet('Orren takes a hit', hpPad({ who: h('span', 'HP ', h('b', '30'), ' of 30 → ', h('b', '21')), amount: '9', modes: ['Damage', 'Heal', 'Temp'],
		extra: quickActs('If Orren says so at the table', [['Defend', '−9 · costs 1 action'], ['Interpose', 'a friend takes it']]),
		hint: 'One tap applies it and takes the action from Orren’s next turn. Nothing asks; the player answers at the table.',
		go: btn({ kind: 'primary', text: 'Apply 9 damage' }) }));
	return r;
};
GN.settings = () => h('div.set-modal.g-nimble',
	h('div.set-head', h('h3', { style: { fontFamily: 'var(--g-font-display)', fontStyle: 'italic' } }, 'Encounter settings'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
	h('p', { style: { margin: '0 22px 6px', fontSize: '13px', color: 'var(--g-text-2)' } }, 'Nimble · these change what the tracker shows, never who can act.'),
	h('div.set-sec', 'Turns'),
	h('div.set-row', h('span', h('b', 'The legendary beat after each hero'), h('small', 'Done on a hero turns the card to the boss. Off: the boss is a row you tap when you want it.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Run the monsters’ side by target', h('span.set-tag', 'Use with care · off by default')), h('small', 'Groups the monsters by the hero they attack, as the GM’s Guide suggests for minion packs. It decides more for the table than anything else here; most tables are better off saying it out loud.')), toggle('', false)),
	h('div.set-sec', 'Player-safe view'),
	h('div.set-row', h('span', h('b', 'Monster health'), h('small', 'What the table sees instead of HP.')), segs(['Hidden', 'Labels', 'Exact'], 'Labels')),
	h('div', { style: { height: '10px' } }));

/* ---------- Daggerheart: Fear's controls, sketched (still coming later) ---------- */
GD.fearLater = (n, max, gm) => {
	const el = GD.fear(n, max, gm);
	el.querySelector('.l').append(h('span.xd-fear-ctl', btn({ icon: 'minus', kind: 'icon', size: 'sm', title: 'Spend a Fear' }), btn({ icon: 'plus', kind: 'icon', size: 'sm', title: 'Gain a Fear' })));
	return later(el);
};
GD.fearVague = () => later(GD.cut('div.xd-fear-ps', null, h('span', { style: { font: '700 14px var(--g-font-ui)' } }, 'The GM’s Fear'), h('span', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('span.xd-vague', h('i.on'), h('i.on'), h('i')), h('b', 'rising')), h('small', 'Players see: Vague (Encounter settings). Exact would show 5; Hidden shows nothing.')));
GD.safe = (orig => () => {
	const arr = orig();
	const f = arr[1] && arr[1].querySelector('.later-slot');
	if (f) f.replaceWith(GD.fearVague());
	return arr;
})(GD.safe);
GD.settings = () => h('div.set-modal.g-dh',
	h('div.set-head', h('h3', 'Encounter settings'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm', title: 'Close' })),
	h('p', { style: { margin: '0 22px 6px', fontSize: '13px', color: 'var(--g-text-2)' } }, 'Daggerheart · these only change what the tracker shows. Nothing here stops anyone acting.'),
	h('div.set-sec', 'Spotlight'),
	h('div.set-row', h('span', h('b', 'Count spotlights'), h('small', 'Shows ×2 on each player’s card and lists whoever has had it least first.')), toggle('', true)),
	h('div.set-row', h('span', h('b', 'Spotlight Tracker tokens'), h('small', 'The book’s optional tracker: each player spends a token per action; everyone refills when all are spent.')), toggle('', false)),
	h('div.set-row.sub', { style: { opacity: .5 } }, h('span', h('b', 'Tokens per player'), h('small', 'The book suggests 3.')), stepper(3)),
	h('div.set-row', h('span', h('b', 'Action tracker'), h('small', 'The playtest’s GM tokens for activating adversaries. Off in the final rules; here if your table still uses it.')), toggle('', false)),
	h('div.set-row', h('span', h('b', 'Move the spotlight from roll results', h('span.set-tag.idea', 'Idea · off by default')), h('small', 'Logging a roll with Fear or a failure would hand the spotlight to the GM. You could still move it by hand at any time.')), toggle('', false)),
	h('div.set-sec', 'Fear · coming later, a sketch'),
	h('div.set-row.later', h('span', h('b', 'Change Fear by hand'), h('small', '− and + on the Fear band, always there.')), h('span', { style: { fontSize: '12.5px', color: 'var(--g-text-2)' } }, 'Always')),
	h('div.set-row.later', h('span', h('b', 'Also from logged rolls', h('span.set-tag', 'Option · off')), h('small', 'A roll logged "with Fear" adds one. Off, the GM adds it by hand, as at the table.')), toggle('', false)),
	h('div.set-row.later', h('span', h('b', 'What players see'), h('small', 'In player-safe mode. Vague shows low, rising or high instead of the number.')), segs(['Exact', 'Vague', 'Hidden'], 'Vague')),
	h('div.set-sec', 'Player-safe view'),
	h('div.set-row', h('span', h('b', 'Adversary health'), h('small', 'What the table sees instead of slots.')), segs(['Hidden', 'Labels', 'Slots'], 'Labels')),
	h('div', { style: { height: '10px' } }));

/* ---------- The game pages: notes and new states ---------- */
DEFS['5e'].flowNotes = DEFS['5e'].flowNotes.map(t => t.startsWith('<b>Identical') ? '<b>A group shares one initiative</b> (both editions) and one row in the lists. On its turn, Next steps through the members on the card (Goblin A, then B; C is down), each with its own HP and conditions.' : t);
DEFS['5e'].flowNotes.push('<b>Reactions are the player’s to say.</b> On the damage sheet, Shield is one quiet tap that spends Ilse’s reaction; nothing pops up to ask.');
DEFS['5e'].flow.push({ cap: 'A group’s turn: one member at a time', sub: 'Goblin A on the card with its own HP; the strip shows B to come and C down. Next goes to Goblin B, then to Mara.', render: () => G5.flow('group'), height: 860 });
DEFS['5e'].flow = DEFS['5e'].flow.filter(v => v.cap !== 'Tapped out of order').concat(DEFS['5e'].flow.filter(v => v.cap === 'Tapped out of order'));

DEFS.nimble.flowNotes = DEFS.nimble.flowNotes.map(t => t.startsWith('<b>Monsters’ side') ? '<b>Monsters’ side, same pattern:</b> monsters one at a time, Next or tap any. The legendary monster has no turn here; it’s listed, greyed, as "acts after heroes". Running the side by target is a setting, off by default.' : t);
DEFS.nimble.flowNotes.push('<b>Defend and Interpose are the player’s call.</b> When a monster hits a hero, the damage sheet has them as quiet one-tap actions that spend the hero’s next-turn action. No prompt, ever.');
DEFS.nimble.flow.push({ cap: 'A monster hits a hero', sub: 'Orren says he Defends: one tap on the damage sheet applies his armor and takes an action from his next turn.', render: () => GN.flowHit(), height: 900 });
DEFS.nimble.main.push({ custom: () => h('div', { style: { display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' } }, GN.settings(), h('div.prose', { style: { maxWidth: '420px', fontSize: '14px' } },
	h('p', h('b', 'Encounter settings for Nimble.'), ' Running the monsters’ side by target stays out of the main design: it makes choices the table usually talks through. It’s here, off, for groups that want it.'))),
	cap: 'Encounter settings', sub: 'The legendary beat (on), by target (off, use with care), and what the table sees in player-safe mode.' });

DEFS.dh.flowNotes = DEFS.dh.flowNotes.map(t => t.startsWith('<b>Fear</b>') ? '<b>Fear</b> keeps its place at the top, still marked as coming later. The sketch: − and + by hand, always; optionally from logged rolls; and a GM setting for what players see (exact, vague, hidden), which player-safe follows.' : t);
DEFS.dh.flowNotes.push('<b>Armor is the player’s choice.</b> On the damage sheet, marking an Armor slot is one quiet tap that drops the damage a step and marks the slot.');
for (const m of DEFS.dh.main) {
	if (m.device === 'tv') m.sub = 'Who has the spotlight, very large; the party’s own Hope, HP and Stress; adversaries as Unhurt / Hurt / Nearly down; Fear as the Encounter settings say (here: Vague, "rising"). A toggle on the main tab; no separate window.';
	if (m.custom) m.sub = 'Spotlight aids (all optional), the auto-move idea (off), and the Fear sketch: by hand always, from rolls as an option, and how much players see.';
}
for (const m of DEFS['5e'].main) if (m.device === 'tv') m.cap = 'Player-safe: a toggle on the main tab';

/* ---------- Principle and keys on the Overview and Shared pages ---------- */
function talkCard() {
	return h('div.talk',
		h('h3', 'Keep the table talking'),
		h('p', 'VTT tools cut out too much table talk. The tracker supports the conversation; it doesn’t do the talking. Most things should be subtle.'),
		h('ul',
			h('li', 'Anything that says or decides for players is at most a setting, off by default, with a reason: running Nimble’s monsters by target, moving Daggerheart’s spotlight from rolls, Fear from logged rolls.'),
			h('li', 'Reactions are the player’s to say. Defend, Interpose, Shield and Armor slots are quiet one-tap actions on the damage sheet, never prompts.'),
			h('li', 'Nothing blocks. Any creature can act at any time; Back undoes anything.'),
			h('li', 'A shared player experience (players seeing or tapping from their own devices) is a later discussion.')));
}
overviewPage = (orig => () => { const p = orig(); p.insertBefore(talkCard(), p.children[2]); return p; })(overviewPage);
sharedPage = (orig => () => {
	const p = orig();
	const keys = [h('h2.sec', 'Keys'), h('p.kicker', 'Simple and obvious. They work only while the encounter tab has focus, so typing in a note never triggers them.'),
		h('table.slots-map', h('thead', h('tr', h('th', 'Key'), h('th', 'Does'))), h('tbody',
			[['↑ ↓', 'Move through the participants'], ['Enter or →', 'Make the highlighted one active'], ['Space', 'Done: mark the active one and go to the next (Daggerheart: the next player)'], ['Z', 'Undo the last step'], ['Esc', 'Close a sheet, the keypad or the picker']].map(([k, d]) => h('tr', h('td', h('code', k)), h('td', d))))),
		h('p.note', { style: { marginTop: '10px' } }, 'Secondary, not in the hint strip: number keys pick an action on the active card.')];
	const bp = [...p.querySelectorAll('h2.sec')].find(x => x.textContent === 'Naming');
	if (bp) for (const k of keys) bp.parentNode.insertBefore(k, bp); else p.append(...keys);
	p.prepend(h('div', { style: { marginBottom: '40px' } }, talkCard()));
	return p;
})(sharedPage);

CRITIQUE.push(['Pass 7 · keep the table talking (the user’s review), light and dark, laptop, iPad and sidebar', [
	'New top principle on the Overview and the Shared page. Checked every screen against it: what could do the talking for the table?',
	'Damage sheets: the first draft of Daggerheart’s armor was a highlighted box with a button, which reads like a question. All reactions are now one dashed chip under "If Kael marks armor" / "If Orren says so": present, not asking. Added to 5e (Shield) and Nimble (Defend, Interpose).',
	'Nimble: by target is out of the main design and into Encounter settings, off, "use with care".',
	'5e: a group’s turn now steps through its members on the card (Goblin A, B; C down), each with its own HP and conditions; Next says "Next: Goblin B".',
	'Daggerheart: the Fear band gained a quiet −/+ (by hand); settings sketch "from logged rolls" (off) and what players see (exact, vague, hidden); player-safe follows it and shows "rising".',
	'Keys: the hint strip had N, D, J/K and 1–9. Now ↑↓ move, Enter make active, Space done, Z undo, Esc close; the number badges are gone from the action buttons (still a secondary shortcut).',
	'Player-safe is described as a toggle on the main tab only; the popout mentions are gone.',
]]);
