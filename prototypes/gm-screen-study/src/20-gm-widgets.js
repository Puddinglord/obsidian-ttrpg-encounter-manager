/* ============================================================================
   What each game's screen holds (sample campaigns: Nimble's The Old Quarter,
   5e's Waymoot Road), and the cards: one function per kind, one anatomy for
   every game, the game's look from the .g-<game> around it.
   Rules text: Nimble Core 3.3 (with permission), the 5e SRD 5.2 (CC-BY-4.0).
   ========================================================================== */

const GM_DATA = {
	nimble: {
		campaign: 'The Old Quarter', screen: 'GM screen', screens: ['Combat', 'Exploring', 'Town'],
		session: 'Session 5: The Quicksilver Vaults',
		plan: [['Recap: Wick’s note, the copper tubes', true], ['Q6 Storage Vault: the hounds', true], ['Q7 Sacred Circle: the Alchemist', false], ['If they rest: the guild’s messenger', false]],
		rules: [
			{ name: 'Dazed', from: 'Condition', text: [['', 'Heroes lose 1 action; monsters lose their move OR 1 attack on their next turn.']] },
			{ name: 'Grappled', from: 'Condition', text: [['', 'Attacks against either creature in a grapple have advantage. A smaller grappled creature can’t move; the same size moves at half Speed together. Escaping takes an action and a STR or DEX save.']] },
			{ name: 'Prone', from: 'Condition', text: [['', 'Movement costs twice as much, and disadvantage on attacks. Melee attacks against you have advantage; Ranged have disadvantage. Spend 3 spaces of your Speed to stand up.']] },
		],
		table: { name: 'Heroic reactions', from: 'Core 3.3', head: ['Reaction', 'What it does'], rows: [
			['Defend', 'Reduce damage from one attack by your Defense. Crits ignore Defense.'],
			['Interpose', 'A creature within Reach 2 would be hit: take its place, and the hit.'],
			['Help', 'Let an ally reroll if you can explain how you help.'],
			['Opportunity', 'A melee attack with disadvantage as a creature moves away.'],
		] },
		monster: { name: 'Quicksilver Hound', kicker: 'Level 1 · Beast', hp: 9, max: 16, armor: '–', speed: 8, acts: [['Bite', '1d8+2. On a crit, the target is Grappled.'], ['Quicksilver Flow', 'Move through any gap an inch wide.']] },
		npc: { name: 'Magistrix Vess', role: 'The Alchemist, half flesh and half mercury', attitude: 'Hostile', wants: 'The Assayers’ Guild’s charter, burned.', secret: 'She can’t leave the vaults: the mercury holds her together.' },
		party: [
			{ name: 'Brakka', sub: 'Berserker 2 · Rowan', hp: 21, max: 28, stat: ['4', 'Def'], cond: ['Raging'] },
			{ name: 'Ilse', sub: 'Mage 2 · Priya', hp: 14, max: 14, stat: ['2', 'Def'] },
			{ name: 'Tomas', sub: 'Oathsworn 2 · Ben', hp: 24, max: 24, stat: ['6', 'Def'] },
			{ name: 'Wren', sub: 'Hunter 2 · Jo', hp: 19, max: 19, stat: ['3', 'Def'] },
		],
		fight: { round: 'Round 1 · heroes', now: 'Brakka', hp: 21, max: 28, rows: [{ name: 'Ilse', em: '3 actions' }, { name: 'Tomas', em: '3 actions' }, { name: 'Wren', acted: true }, { sec: 'Monsters', small: 'their side is next' }, { name: 'Quicksilver Hound-1', em: 'Bloodied' }, { name: 'Quicksilver Hound-2' }] },
		rolls: [['2d20 keep 1 high + 3', 17], ['Battleaxe 1d12+3', 11], ['d6', 4]],
		random: { name: 'Vault whispers', die: 'd6', rows: ['A valve shrieks open somewhere below.', 'Mercury beads up the walls, then falls like rain.', 'A voice counts in the old guild cant.', 'Copper tubes hum one long note.', 'A hound’s silver shadow slips past the door.', 'Silence. Even the drip stops.'], hit: 3 },
		clocks: [['Mercury rises', 4, 6], ['The guild arrives', 1, 4]],
		quests: [{ name: 'Bring Wick Home', steps: [['Find Wick in the vaults', true], ['Get him past the Alchemist', false]] }, { name: 'The Guild’s Quiet Job', steps: [['Seal the lower vaults', false]] }],
		scratch: ['Brakka owes Tobren 40 gp.', 'Ilse kept the copper key.'],
	},
	'5e': {
		campaign: 'Waymoot Road', screen: 'GM screen', screens: ['Combat', 'Travel', 'Town'],
		session: 'Session 2: The toll house',
		plan: [['Recap: the bridge, Marta’s offer', true], ['Road ambush: goblins, then the ogre', true], ['The toll house cellar', false], ['Old Tam’s ferry, if they ask', false]],
		rules: [
			{ name: 'Grappled', from: 'Condition', text: [['Speed 0.', 'Your Speed is 0 and can’t increase.'], ['Attacks Affected.', 'You have Disadvantage on attack rolls against any target other than the grappler.'], ['Movable.', 'The grappler can drag or carry you when it moves.']] },
			{ name: 'Prone', from: 'Condition', text: [['Restricted Movement.', 'Your only movement options are to crawl or to spend half your Speed to right yourself.'], ['Attacks Affected.', 'You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you; otherwise, it has Disadvantage.']] },
		],
		table: { name: 'Typical DCs', from: 'SRD 5.2', head: ['Task', 'DC'], rows: [['Very easy', '5'], ['Easy', '10'], ['Medium', '15'], ['Hard', '20'], ['Very hard', '25'], ['Nearly impossible', '30']] },
		table2: { name: 'Cover', from: 'SRD 5.2', head: ['Cover', 'Benefit'], rows: [['Half', '+2 AC and Dex saves'], ['Three-quarters', '+5 AC and Dex saves'], ['Total', 'Can’t be targeted directly']] },
		monster: { name: 'Ogre', kicker: 'Large Giant · CR 2', hp: 41, max: 68, ac: 11, speed: '40 ft.', acts: [['Greatclub.', 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.'], ['Javelin.', 'Melee or Ranged Attack Roll: +6. Hit: 11 (2d6 + 4) Piercing damage.']] },
		npc: { name: 'Marta Vey', role: 'Captain of the Waymoot watch', attitude: 'Neutral', wants: 'The bridge toll back.', secret: 'She takes a cut of the toll herself.' },
		party: [
			{ name: 'Bram Holt', sub: 'Fighter 5 · Sam', hp: 44, max: 44, stat: ['18', 'AC'], pp: 13 },
			{ name: 'Ilse Vane', sub: 'Wizard 5 · Priya', hp: 24, max: 32, stat: ['12', 'AC'], pp: 11, cond: ['Concentrating'] },
			{ name: 'Dorn Ashby', sub: 'Fighter 5 · Ben', hp: 0, max: 32, stat: ['16', 'AC'], pp: 12, cond: ['Unconscious'] },
		],
		fight: { round: 'Round 1', now: 'Goblin Warrior', hp: 4, max: 10, rows: [{ name: 'Mage', em: '9' }, { name: 'Ogre', em: '8' }, { name: 'Young Red Dragon', em: '2' }] },
		rolls: [['d20+5 Perception', 19], ['Greatclub 2d8+4', 13], ['d4', 3]],
		random: { name: 'Road encounters', die: 'd6', rows: ['A merchant’s cart, one wheel off.', 'Two goblins arguing over a boot.', 'A riderless horse, saddled.', 'Tolls posted on a tree: 2 cp a head.', 'Smoke from a farm to the east.', 'Nothing but rain.'], hit: 1 },
		clocks: [['Goblin reinforcements', 2, 4], ['The bridge burns', 0, 6]],
		quests: [{ name: 'Clear the Bridge', steps: [['Find out who holds the bridge', true], ['Drive the goblins off', false], ['Tell Marta', false]] }],
		scratch: ['Bram wants the ogre’s war horn.', 'Toll house key: Marta has it.'],
	},
};

/** A card: its icon and title, where it's from, actions; then its body. */
function gmCard({ ic, title, from, wide, size, body, actions = ['open', 'more'] }) {
	return h('div.gm-card' + (wide ? '.is-wide' : '') + (size ? '.s-' + size : ''),
		h('div.gm-card-h',
			h('span.gm-grip', icon('grip', 14)),
			icon(ic, 15),
			h('span.gm-card-t', title),
			from ? h('span.gm-card-from', from) : null,
			h('span.gm-size', ['S', 'M', 'L'].map((s, i) => h('span' + (i === (wide ? 2 : 1) ? '.on' : ''), s))),
			actions.map(a => h('span.gm-x', { title: a === 'open' ? 'Open' : 'More' }, icon(a === 'open' ? 'open' : 'more', 14)))),
		h('div.gm-card-b', body));
}

const GW = {
	/** A pinned note: its first lines, or the part you pinned (a heading, a list). */
	note: (g, d) => gmCard({ ic: 'note', title: d.session.split(':')[0], from: 'Note', body: [h('div.gm-meta', { style: { marginBottom: '6px' } }, 'Tonight'), d.plan.map(([t, done]) => h('div.gm-check' + (done ? '.done' : ''), h('i'), h('span', t)))] }),
	/** A rule from the compendium, in the book's words. */
	rule: (g, r) => gmCard({ ic: 'condition', title: r.name, from: r.from, body: h('div.gm-rule', r.text.map(([lead, t]) => h('p', lead ? h('span.lead', lead + ' ') : null, t))) }),
	/** A table from the compendium or a note. */
	table: (g, t, wide) => gmCard({ ic: 'list', title: t.name, from: t.from, wide, body: h('table.gm-table', h('thead', h('tr', t.head.map(x => h('th', x)))), h('tbody', t.rows.map(r => h('tr', r.map((c, i) => h('td' + (i === r.length - 1 && /^\d+$/.test(c) ? '.n' : ''), c)))))) }),
	/** A monster: what the table needs (HP, armor, its actions), the whole block one tap away. */
	monster: (g, m) => gmCard({ ic: 'skull', title: m.name, from: m.kicker, body: [
		h('div.gm-mon-top',
			m.ac !== undefined ? shieldNum(m.ac, 26) : h('div.gm-stat', h('b', m.armor), h('small', 'Armor')),
			h('div.gm-hp', h('span', h('b', String(m.hp)), h('small', ` / ${m.max} HP`)), bar({ value: m.hp, max: m.max })),
			h('div.gm-stat', h('b', String(m.speed)), h('small', 'Speed'))),
		m.acts.map(([n, t]) => h('div.gm-mon-act', h('b', n + ' '), t)),
		h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } }, btn({ icon: 'plus', text: 'Add to fight', size: 'sm' }), btn({ icon: 'book', text: 'Stat block', size: 'sm' }))] }),
	/** An NPC: who, how they feel about the party, what they want, the secret. */
	npc: (g, n) => gmCard({ ic: 'user', title: n.name, from: 'NPC', body: [
		h('div.gm-meta', n.role), h('div.ev-chips', { style: { margin: '6px 0' } }, chip({ name: n.attitude })),
		h('p', h('span.lead', { style: { fontWeight: 700 } }, 'Wants '), n.wants), h('p', h('span.lead', { style: { fontWeight: 700 } }, 'Secret '), n.secret)] }),
	/** The party at a glance, from their sheets. */
	party: (g, list) => gmCard({ ic: 'users', title: 'Party', from: `${list.length} heroes`, actions: ['more'], body: h('div.gm-rows', list.map(p => h('div.gm-row',
		h('div.gm-who', h('b', p.name), h('small', p.sub), p.cond ? h('div.gm-cond', p.cond.map(c => chip({ name: c }))) : null),
		p.pp ? h('div.gm-stat', h('b', String(p.pp)), h('small', 'PP')) : h('span'),
		h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, h('div.gm-stat', h('b', p.stat[0]), h('small', p.stat[1])), h('div.gm-hp', h('span', h('b', String(p.hp)), h('small', `/${p.max}`)), bar({ value: p.hp, max: p.max }))))))
	}),
	/** The fight: whose turn, who's next; the tracker one tap away. */
	fight: (g, f) => gmCard({ ic: 'swords', title: 'Fight', from: f.round, body: [
		h('div.gm-who', { style: { marginBottom: '6px' } }, h('small', 'Now'), h('b', { style: { fontSize: '16px', lineHeight: '21px' } }, f.now)),
		bar({ value: f.hp, max: f.max }),
		h('div.gm-rows', { style: { marginTop: '8px' } }, f.rows.map(r => r.sec ? h('div.gm-meta', { style: { padding: '6px 0 2px', fontWeight: 600 } }, r.sec, r.small ? ` · ${r.small}` : '') : h('div.gm-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('span', { style: r.acted ? { color: 'var(--g-text-2)', textDecoration: 'line-through' } : null }, r.name), h('span.gm-meta', r.em || '')))),
		h('div', { style: { marginTop: '8px' } }, btn({ icon: 'open', text: 'Open the tracker', size: 'sm' }))] }),
	/** Dice: a tray, and the last rolls (the roll log). */
	dice: (g, rolls) => gmCard({ ic: 'dice', title: 'Dice', actions: ['more'], body: [
		h('div.gm-dice', ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6'].map(d => h('span.gm-die', d))),
		h('div.gm-rolls', rolls.map(([what, n]) => h('div.gm-roll', h('span', what), h('b', String(n)))))] }),
	/** A random table (any table in a note): Roll, and the row it landed on. */
	random: (g, t) => gmCard({ ic: 'dice', title: t.name, from: t.die, body: [
		h('div.gm-rand-h', h('span.gm-meta', `Rolled ${t.hit + 1}`), btn({ icon: 'dice', text: 'Roll', size: 'sm' })),
		h('table.gm-table', h('tbody', t.rows.map((r, i) => h('tr' + (i === t.hit ? '.hit' : ''), h('td.n', { style: { width: '22px', textAlign: 'left' } }, String(i + 1)), h('td', r)))))] }),
	/** Clocks: segments you fill by hand, one tap each. */
	clocks: (g, list) => gmCard({ ic: 'clock', title: 'Clocks', actions: ['more'], body: h('div.gm-clocks', list.map(([n, on, max]) => h('div.gm-clock', gmClock(on, max), h('span', h('b', n), h('small', `${on} of ${max}`))))) }),
	/** Quests: the open ones, objectives ticked into their notes. */
	quests: (g, list) => gmCard({ ic: 'flag', title: 'Open quests', actions: ['more'], body: list.map(q => h('div.gm-quest', h('b', q.name), q.steps.map(([t, done]) => h('div.gm-check' + (done ? '.done' : ''), h('i'), h('span', t))))) }),
	/** A scratchpad: what you jot at the table, kept in the session note. */
	scratch: (g, lines) => gmCard({ ic: 'notepad', title: 'Scratch', from: 'into the session note', actions: ['more'], body: h('div.gm-scratch', lines.map(l => h('div', l)), h('div', h('span.cur'))) }),
};

/** A clock as segments in a ring (filled = ticked). */
function gmClock(on, max, size = 34) {
	const r = size / 2 - 2, c = size / 2, seg = [];
	for (let i = 0; i < max; i++) {
		const a0 = (i / max) * Math.PI * 2 - Math.PI / 2 + 0.06, a1 = ((i + 1) / max) * Math.PI * 2 - Math.PI / 2 - 0.06;
		const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
		seg.push(`<path d="M${c} ${c} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z" fill="${i < on ? 'var(--g-accent)' : 'none'}" stroke="var(--g-line-strong)" stroke-width="1.2"/>`);
	}
	return svg(seg.join(''), size, size, 'gm-clock-svg');
}
