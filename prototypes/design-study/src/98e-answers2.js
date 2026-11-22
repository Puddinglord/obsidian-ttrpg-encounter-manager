/* The user's answers to the sheets pass. */

/* Daggerheart domain cards stay compact; a tap opens the full card. */
GDS.cardFull = () => h('div.sh-modal.xds-cardq', h('div.ev-sheet-head', h('h3', 'Ringing Blow'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	GD.cut('div.xds-cardbig', null,
		h('div.t', h('span.lv', '1'), h('span.dom.d-blade', 'Blade'), h('span.rc', icon('zap', 14, 2.2), '1')),
		h('b', 'Ringing Blow'), h('small', 'Ability'),
		h('p', 'When you hit with a melee weapon, you can ', h('b', 'spend a Hope'), ' to make the target’s ears ring: until it next takes the spotlight, its attacks against anyone but you have disadvantage.'),
		h('p.dim', 'Recall cost 1: mark a Stress to swap it in from the vault mid-scene.')),
	h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, btn({ text: 'Move to vault', size: 'sm' }), btn({ text: 'Open its note', size: 'sm', kind: 'quiet' })));
DEFS.dh.sheet.shots.splice(4, 0, { device: 'note-landscape', title: 'Kael Ardent', cap: 'iPad landscape: tapping a domain card', sub: 'The loadout stays compact (name, level, domain, recall cost); a tap opens the whole card in a quick look.', render: () => GDS.sheet(), overlay: () => GDS.cardFull() });

/* Player rows on NPC cards: later. */
for (const id of ORDER) {
	const n = DEFS[id].npc;
	if (!n) continue;
	n.notes = (n.notes || []).concat(['<b>Later:</b> players writing their own rows on the shared card (synced into the GM’s vault) belongs to the shared-play discussion; not designed here.']);
}

/* 5e: one sheet for both editions. */
DEFS['5e'].sheet.notes = DEFS['5e'].sheet.notes.map(t => t.startsWith('<b>2014 campaigns</b>') ? '<b>One layout for 2014 and 2024.</b> Only the rules change: the rules words, the actions list, the edition’s conditions, death-save details.' : t);

sharedPage = (orig => () => {
	const p = orig();
	const li = [...p.querySelectorAll('li')].find(x => x.textContent.startsWith('Player view: the same frame'));
	if (li) li.after(h('li', h('b', 'Later: '), 'players writing their own rows on the card, synced into the GM’s vault, is part of the shared-play discussion.'));
	return p;
})(sharedPage);

CRITIQUE.push(['Pass 10 \u00b7 every width, PF2e and Call of Cthulhu deep (laptop 1440 and 1280, iPad both ways, with sidebars), light and dark', [
	'The main tabs chose their layout from the device, so a laptop with both sidebars open (596px) got three squeezed columns. Every main tab now lays out by its own width with container queries: three columns from 1000px, two from 660px, one below (card first), the sidebar layout under 480.',
	'In the stacked layouts the columns squeezed each other to nothing (a fixed-height grid with clipped items): Actions vanished under the 5e card at 596px. Stacked layouts now flow as one scroll.',
	'At narrow widths the header wrapped "Round 2 \u00b7 Goblin Boss\u2019s turn" into three lines beside the controls; the title now keeps its width and the controls move under it.',
	'The width matrix showed an impossible case: iPad portrait with both panels pinned leaves 180px. It\u2019s marked as not offered.',
	'The breakpoint table still said 900; it now matches what the matrix shows (480 / 660 / 1000).',
	'PF2e and CoC sheets kept their three-part band at iPad portrait width, squeezing HP into a sliver; their bands now stack below 880px, as the other games\u2019 do.',
	'PF2e: reactions (Reactive Strike, Shield) and Shield Block are quiet chips; Delay has its tray with a Return chip. CoC: Dodge and Fight Back are quiet chips on the attacker\u2019s entry; Push and Luck after a roll are chips; group Sanity opens from a chip on the creature, when the Keeper calls for it.',
	'Nimble blocks lost their notes about the published books; they show the 3.x numbers only.',
]]);
