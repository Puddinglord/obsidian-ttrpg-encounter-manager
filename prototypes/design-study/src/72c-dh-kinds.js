/* ============================================================================
   Daggerheart: what kind of thing a stat block is (pass 4).
   From the Core Rulebook, read as data and paraphrased:
     adversaries (p.193 breakdown, p.194 types, p.197 battle points, pp.198–207 each type),
     environments (pp.240–241: breakdown and types), NPCs (pp.166–167: statistics, features).
   The book has no separate hazard or trap block: hazards and traps are environment
   features or a roll Difficulty (pp.158, 240), and so they are here (the user's call).
   Every block name and feature here is original; numbers sit on the book's tier benchmarks
   (adversaries p.208, environments p.242).
   ========================================================================== */
const GDK = {};

/* ---------- The classification ---------- */
/* Our own glyphs, one stroke weight, 24 grid. */
const DHK_GLYPH = {
	Bruiser: '<path d="M3.5 10 10 3.5l4.5 4.5L8 14.5Z"/><path d="m11.5 11 9 9"/>',
	Horde: '<circle cx="6.5" cy="9.5" r="2.3"/><circle cx="17.5" cy="9.5" r="2.3"/><circle cx="12" cy="7.5" r="2.6"/><path d="M2 19c0-2.7 2-4.3 4.5-4.3M22 19c0-2.7-2-4.3-4.5-4.3M6.8 20c0-3.2 2.2-5.4 5.2-5.4s5.2 2.2 5.2 5.4"/>',
	Leader: '<path d="M6 21V3"/><path d="M6 4h12.5l-3 4 3 4H6"/>',
	Minion: '<circle cx="5.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/>',
	Ranged: '<path d="M6 3c6.5 3 6.5 15 0 18"/><path d="M6 3v18" stroke-dasharray="1.5 2"/><path d="M3.5 12h17"/><path d="m17.5 9 3 3-3 3"/>',
	Skulk: '<path d="M3 12s3.5-5 9-5 9 5 9 5"/><path d="M3 12s3.5 5 9 5 9-5 9-5" stroke-dasharray="2 2.4"/><circle cx="12" cy="12" r="2"/>',
	Social: '<path d="M4 5h16v10H10.5L6 19v-4H4Z"/>',
	Solo: '<path d="M12 2.5 20.5 12 12 21.5 3.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
	Standard: '<path d="M12 3 19 5.5v6c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5v-6Z"/><path d="M12 3v18"/>',
	Support: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
	Exploration: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
	'Social scene': '<path d="M3 4h11v7H8.5L5 14v-3H3Z"/><path d="M17 8h4v7h-2v3l-3-3h-5v-2"/>',
	Traversal: '<path d="M2.5 19 9 8l4 6 2.5-3.5 6 8.5Z"/>',
	Event: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5"/>',
	NPC: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
};
GDK.glyph = (t, size = 16) => { const s = svg(`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DHK_GLYPH[t] || DHK_GLYPH.NPC}</g>`, 24, 24, 'xdk-gl'); s.setAttribute('width', size); s.setAttribute('height', size); return s; };

/** The kinds, the types in each, their role (paraphrased), and the battle points they cost (p.197). */
const DHK = {
	adversary: { label: 'Adversary', plural: 'Adversaries', ref: 'CR pp.193–208', note: 'Fights. Difficulty, thresholds, HP, Stress, a standard attack; features the GM spends Stress and Fear on.',
		types: [
			['Bruiser', 'Tough; hits hard up close, often several at once', 4],
			['Horde', 'A crowd as one body: (n/HP); hits softer at half HP', 2],
			['Leader', 'Commands: spotlights, buffs and summons allies', 3],
			['Minion', 'Dropped by any damage; dangerous in numbers', 1, 'per group the party’s size'],
			['Ranged', 'Fragile up close; hits hard from far away', 2],
			['Skulk', 'Ambushes, harries, slips away', 2],
			['Social', 'Beaten by talk: a battle of wits', 1],
			['Solo', 'A fight for the whole party, often Relentless', 5],
			['Standard', 'The rank and file of its side', 2],
			['Support', 'Strengthens allies, hinders the party', 1],
		] },
	environment: { label: 'Environment', plural: 'Environments', ref: 'CR pp.240–242', note: 'A scene, not a body. Difficulty, impulses, potential adversaries, features with questions. No HP, thresholds or Stress.',
		types: [['Exploration', 'Wonders and mysteries to discover'], ['Social scene', 'People and their politics are the challenge'], ['Traversal', 'Getting through the place is the fight'], ['Event', 'Something happening, more than somewhere']] },
	npc: { label: 'NPC', plural: 'NPCs', ref: 'CR pp.166–167', note: 'A person: name, description, motive. A Difficulty if the party rolls against them; Trigger / Effect features if they matter. Stat them as a Social adversary when they fight with words.',
		types: [['NPC', 'Name, look, motive; Difficulty only if needed']] },
};
const DHK_BP = Object.fromEntries(DHK.adversary.types.map(t => [t[0], t[2]]));
GDK.kindOf = t => DHK.adversary.types.some(x => x[0] === t) ? 'adversary' : DHK.environment.types.some(x => x[0] === t) ? 'environment' : 'npc';
const envName = t => t === 'Social scene' ? 'Social' : t;

/** A type tag: the kind's colour, the type's glyph, its name. */
GDK.tag = (type, opts = {}) => h('span.xdk-tag.k-' + GDK.kindOf(type) + (opts.cls ? '.' + opts.cls : ''), { title: opts.title || `${DHK[GDK.kindOf(type)] ? DHK[GDK.kindOf(type)].label : 'NPC'} · ${envName(type)}${DHK_BP[type] ? ` · ${DHK_BP[type]} battle point${DHK_BP[type] > 1 ? 's' : ''}` : ''}` },
	GDK.glyph(type, opts.size || 14), h('span', envName(type)), opts.bp && DHK_BP[type] ? h('b', `${DHK_BP[type]}`) : null);

/* ---------- Rich text in features: costs, dice, rules words ---------- */
/** [[Mark a Stress]] a Stress cost · {{Spend a Fear}} a Fear cost · `2d6 phy` dice · _Restrained_ a rules word · **bold** · ((Countdown 4)) a countdown */
GDK.txt = t => t.split(/(\[\[[^\]]+\]\]|\{\{[^}]+\}\}|`[^`]+`|_[^_]+_|\*\*[^*]+\*\*|\(\([^)]+\)\))/).filter(Boolean).map(x =>
	x.startsWith('[[') ? h('b.cost', x.slice(2, -2)) :
	x.startsWith('{{') ? h('b.cost.fear', x.slice(2, -2)) :
	x.startsWith('`') ? h('b.dice', x.slice(1, -1)) :
	x.startsWith('**') ? h('b', x.slice(2, -2)) :
	x.startsWith('((') ? (() => { const [lab, n] = x.slice(2, -2).split('|'); return h('span.xdk-cd', { title: `${lab} (${n})` }, icon('timer', 12), h('span', `${lab} (${n})`), h('span.d', Array.from({ length: Number(n) }, () => h('i')))); })() :
	x.startsWith('_') ? term(x.slice(1, -1)) : x);

/* ---------- The blocks ---------- */
const DHB_DATA = {
	brute: { name: 'Quarry Brute', tier: 1, type: 'Bruiser', desc: 'A dust-caked hauler who swings a pick-maul like a toy.', mt: 'Crush, guard the cut, hurl stone, shove',
		diff: 12, th: [8, 15], hp: 7, stress: 3, atk: '+1', weapon: 'Pick-Maul', range: 'Very Close', dmg: '1d10+3 phy', exp: [['Hauling', 2]],
		feats: [['Stonehide', 'Passive', 'Physical damage from ranged attacks is reduced by 2.'],
			['Rubble Shove', 'Action', '[[Mark a Stress]] to knock every target within Very Close back to Close range. Each of them marks a Stress.'],
			['Cave-In', 'Action', '{{Spend a Fear}} to bring the ceiling down: everyone within Close makes an Agility reaction roll. On a failure, `2d6+3 phy` and _Restrained_ under the rubble.'],
			['Grudge', 'Reaction', 'When it takes Severe damage, it makes a standard attack against whoever dealt it.']] },
	imps: { name: 'Gravel Imps', tier: 1, type: 'Minion', desc: 'Knee-high grey things that boil out of the scree, giggling.', mt: 'Swarm, steal shiny things, trip, flee',
		diff: 10, th: null, hp: 1, stress: 1, atk: '−2', weapon: 'Claws', range: 'Melee', dmg: '2 phy',
		feats: [['Minion (3)', 'Passive', 'Any damage drops an Imp. For every 3 damage dealt, another Imp the attack would hit drops too.'],
			['Group Attack', 'Action', '{{Spend a Fear}} to pick a target: every Imp within Close of it moves into Melee and they make one attack roll together. On a hit, each deals 2 physical damage; add it up.']],
		group: { count: 6, alive: 4 } },
	swarm: { name: 'Reed Lurker Swarm', tier: 1, type: 'Horde', per: 3, desc: 'Eel-thin things in the shallows, too many to count, all teeth.', mt: 'Drag under, surround, wait in the reeds',
		diff: 10, th: [6, 11], hp: 6, stress: 2, atk: '−1', weapon: 'Needle Teeth', range: 'Very Close', dmg: '2d6+2 phy', exp: [['Ambush in water', 2]],
		feats: [['Horde (1d6+1)', 'Passive', 'Once half its HP is marked, its standard attack deals `1d6+1 phy` instead.'],
			['Drag Under', 'Reaction', 'When it hits a target standing in water, the target is _Restrained_ until it breaks free with a Strength roll.']] },
	wyrm: { name: 'Marsh Wyrm', tier: 1, type: 'Solo', desc: 'A long, mud-coloured serpent that has learned when the ferry runs.', mt: 'Ambush, coil, drag to the deep, wait',
		diff: 14, th: [8, 16], hp: 8, stress: 4, atk: '+3', weapon: 'Jaws', range: 'Very Close', dmg: '1d12+3 phy', exp: [['Ambusher', 2], ['Patient', 2]],
		feats: [['Relentless (2)', 'Passive', 'It can take the spotlight twice in one GM turn; spend Fear as usual.'],
			['Coils', 'Passive', 'While submerged, it resists physical damage.'],
			['Tail Sweep', 'Action', '[[Mark a Stress]] to attack everyone within Close. Those it hits take `1d8+2 phy` and are knocked back to Far.'],
			['Into the Deep', 'Action', '{{Spend a Fear}} to drag a _Restrained_ target under: they mark a Stress at the start of each of its spotlights until they surface.'],
			['Thrash', 'Reaction', 'When it takes Severe damage, you gain a Fear.']] },
	ashby: { name: 'Toll-keeper Ashby', tier: 1, type: 'Social', desc: 'A sharp-eyed woman in an oilskin, ledger in one hand, the rope in the other.', mt: 'Bargain, delay, raise the price, remember debts',
		diff: 12, th: [4, 8], hp: 3, stress: 3, atk: '−3', weapon: 'Cudgel', range: 'Melee', dmg: '1d4+1 phy', exp: [['Knows a price', 3]],
		feats: [['Paid in Full', 'Passive', 'A PC who pays the toll without haggling has advantage on their next Presence roll against her.'],
			['No Credit', 'Reaction', 'When a PC fails a Presence roll against her, they mark a Stress and the toll goes up.']] },
	ferry: { kind: 'environment', name: 'Saltmarsh Toll Ferry', tier: 1, type: 'Traversal', desc: 'A rope-drawn raft over brackish channels, run by a toll-keeper who sets her own price.', imp: 'Delay the crossing, strand the careless, collect the toll',
		diff: 11, pot: [['Reed Lurker Swarm', 'Horde'], ['Marsh Wyrm', 'Solo'], ['Toll-keeper Ashby', 'Social']],
		feats: [['Slick Planks', 'Passive', 'Moving on the raft during a fight takes an Agility roll.', 'Who loses their footing first?'],
			['Snapped Line', 'Action', 'The rope parts and the raft drifts: a ((Progress Countdown|4)) hauls it back.', 'What lies downstream? Who cut the line?'],
			['Something Below', 'Action', '{{Spend a Fear}} to bring a Reed Lurker Swarm up within Close. It takes the spotlight.', 'What did the last passengers drop overboard?']] },
	ambush: { kind: 'environment', name: 'Ambush at the Cut', tier: 1, type: 'Event', desc: 'The quarry road narrows to a cart’s width, and someone has been waiting.', imp: 'Strike first, block the way out, take the cargo',
		diff: 'Special', diffNote: 'the highest Difficulty among the attackers', pot: [['Quarry Brute', 'Bruiser'], ['Gravel Imps', 'Minion']],
		feats: [['Caught in the Open', 'Passive', 'Until a PC reaches cover, attacks against them have advantage.', 'Where is the nearest cover, and what is hiding there?'],
			['Loose Scree', 'Action', 'A trap on the slope above the road. {{Spend a Fear}} when a PC crosses it: Agility reaction roll (13). On a failure, `1d6+1 phy` and they slide to the bottom, Close to whatever waits there.', 'Who loosened the stones? What is buried under them?'],
			['Rockfall Signal', 'Action', '{{Spend a Fear}}: a horn sounds and boulders close the road behind the party. Clearing it takes a ((Progress Countdown|3)).', 'Who blew the horn? What do they want from the cargo?']] },
};

/** The tier: a gold pentagon with a navy TIER banner, after the crests. */
GDK.tier = n => h('span.xdk-tier', { title: `Tier ${n}` }, svg(`<path class="p" d="M24 2.5 45 17.5 37 43H11L3 17.5Z"/><path class="pi" d="M24 6.6 41.2 18.9 34.6 39.6H13.4L6.8 18.9Z"/><text class="t" x="24" y="31">${n}</text><path class="ban" d="M7 40h34l3 4.5-3 4.5H7l-3-4.5Z"/><text class="lab" x="24" y="47.4">TIER</text>`, 48, 50));

const XDK_MARK = {
	Passive: '<circle cx="7" cy="7" r="4.6" fill="none" stroke-width="1.8"/>',
	Action: '<path d="M3.5 2.2 12 7l-8.5 4.8Z" stroke-width="1.2" stroke-linejoin="round"/>',
	Reaction: '<path d="M11.6 9.4A5 5 0 1 1 9.8 3.2" fill="none" stroke-width="1.9" stroke-linecap="round"/><path d="M8 1.2 11.4 3l-2.2 3.2Z" stroke-width="1" stroke-linejoin="round"/>',
};
/** A feature: the shape says passive (ring), action (play), reaction (turning arrow), and so do the colours. */
GDK.feat = ([name, type, text, q]) => h('div.xdk-f.is-' + type.toLowerCase(),
	h('span.mk', { title: type }, svg(XDK_MARK[type], 14, 14)),
	h('p', h('b.nm', name), h('span.xdk-ft', type), ' ', GDK.txt(text)),
	q ? h('p.xdk-q', q) : null);

/** A block, in the book's order: name, tier and type, description, motives, the inset box, Experience, features. */
GDK.block = (id, opts = {}) => {
	const d = DHB_DATA[id];
	const kind = d.kind || 'adversary';
	const env = kind === 'environment';
	const typeLine = `Tier ${d.tier} ${envName(d.type)}${d.per ? ` (${d.per}/HP)` : ''}`;
	const halfMark = d.type === 'Horde' ? Math.ceil(d.hp / 2) : 0;
	const hpSlots = () => { const s = GD.slots('hp', d.hp, opts.hp || 0); if (halfMark) { const i = s.children[halfMark - 1]; if (i) i.classList.add('xdk-half'); } return s; };
	const box = env
		? h('div.xdk-box', h('div.xdk-r1',
			GD.crest('heater', d.diff === 'Special' ? '★' : d.diff, 'Difficulty', { size: 46, foe: true, fs: d.diff === 'Special' ? 18 : 24, title: d.diff === 'Special' ? `Difficulty: ${d.diffNote}` : null }),
			h('div.xdk-cells',
				d.diff === 'Special' ? h('span.xdk-c.wide', h('small', 'Difficulty'), h('span', 'Special: ', d.diffNote)) : null,
				d.pot ? h('span.xdk-c.wide', h('small', 'Potential adversaries'), h('span.xdk-pot', d.pot.map(([n, t]) => h('span.xdk-ref', GDK.glyph(t, 13), h('span', n))))) : null,
				null)))
		: h('div.xdk-box',
			h('div.xdk-r1',
				GD.crest('heater', d.diff, 'Difficulty', { size: 46, foe: true }),
				h('div.xdk-cells',
					h('span.xdk-c', h('small', 'Thresholds'), d.th ? h('span.xdk-th', h('b', String(d.th[0])), h('i', '/'), h('b', String(d.th[1]))) : h('span.xdk-none', 'None')),
					h('span.xdk-c', h('small', `HP ${d.hp}`), hpSlots()),
					h('span.xdk-c', h('small', `Stress ${d.stress}`), GD.slots('stress', d.stress, opts.stress || 0)))),
			h('div.xdk-atk', h('small', 'ATK'), h('b.dice', d.atk), h('span', h('b', d.weapon), ' · ', d.range), h('b.dice', d.dmg)),
			d.exp ? h('div.xdk-exp', h('small', 'Experience'), h('span', d.exp.map(([n, v], i) => [i ? ', ' : '', n, ' ', h('b', `+${v}`)]))) : null);
	return h('div.xdk.xd-paper.k-' + kind + (opts.compact ? '.compact' : ''),
		h('div.xdk-head',
			h('div.xdk-id', h('h2', d.name), h('div.ty', typeLine)),
			GDK.tier(d.tier),
			GDK.tag(d.type, { cls: 'corner' })),
		h('div.xdk-body',
			h('p.desc', d.desc),
			d.mt ? h('p.mot', h('b', 'Motives & tactics: '), d.mt) : d.imp ? h('p.mot', h('b', 'Impulses: '), d.imp) : null,
			box,
			h('div.xdk-fh', h('span', 'Features'), h('span.xdk-key', ['Passive', 'Action', 'Reaction'].map(t => h('span.is-' + t.toLowerCase(), svg(XDK_MARK[t], 14, 14), t)))),
			d.feats.map(GDK.feat),
			d.group ? h('div.xdk-group', h('small', 'In this fight'), h('span.xd-mins', Array.from({ length: d.group.count }, (_, i) => h('i' + (i < d.group.alive ? '' : '.off')))), h('span', `${d.group.alive} of ${d.group.count} standing`)) : null,
			opts.copies ? h('div.xdb-copies', h('div.xdk-fh', h('span', 'In this fight')), opts.copies.map(([n, hp, st]) => h('div', h('b', n), h('small', 'HP'), GD.slots('hp', d.hp, hp), h('small', 'Stress'), GD.slots('stress', d.stress, st)))) : null));
};

/* The old block functions draw the new blocks (the hover card and the quick look call these). */
GDS.adv = (size = 'full', copies) => GDK.block('brute', { compact: size === 'compact', copies: copies ? [['Brute 1', 3, 1], ['Brute 2', 0, 0]] : null });
GDS.env = () => GDK.block('ferry');

/* ---------- The classification, as the GM meets it ---------- */
/** New stat block: pick the kind, then the type. Every type with its glyph, its role, its battle points. */
GDK.chooser = (on = 'Bruiser') => h('div.xdk-choose.xd-paper',
	h('div.xdk-choose-h', h('h3', 'What is it?'), h('span.xdk-choose-s', 'Pick the kind, then the type: the type decides the fields')),
	h('div.xdk-cols',
		['adversary', 'environment', 'npc'].map(k => h('div.xdk-col.k-' + k,
			h('div.xdk-col-h', h('b', DHK[k].plural), h('small', DHK[k].ref)),
			h('p.xdk-col-n', DHK[k].note),
			h('div.xdk-tiles', DHK[k].types.map(([t, role, bp, bpNote]) => h('div.xdk-tile.k-' + GDK.kindOf(t) + (t === on ? '.on' : ''),
				h('span.xdk-tgl', GDK.glyph(t, 18)), h('b', envName(t)), bp ? h('span.bp', { title: `${bp} battle point${bp > 1 ? 's' : ''}${bpNote ? ' ' + bpNote : ''}` }, `${bp} BP`) : null, h('small', role))))))));

/** The GM's notes, sorted by kind and type: the filters are the classification. */
GDK.index = () => {
	const rows = [['brute', 'Quarry Brute'], ['imps', 'Gravel Imps'], ['swarm', 'Reed Lurker Swarm'], ['wyrm', 'Marsh Wyrm'], ['ashby', 'Toll-keeper Ashby'], ['ferry', 'Saltmarsh Toll Ferry'], ['ambush', 'Ambush at the Cut']].map(([id]) => DHB_DATA[id]);
	return h('div.xdk-index.xd-paper',
		h('div.xdk-filters', h('span.on', 'All ', h('b', '9')), h('span', GDK.glyph('Standard', 13), 'Adversaries ', h('b', '5')), h('span', GDK.glyph('Traversal', 13), 'Environments ', h('b', '2')), h('span', GDK.glyph('NPC', 13), 'NPCs ', h('b', '2'))),
		h('div.xdk-filters.sub', ['Bruiser', 'Horde', 'Minion', 'Solo', 'Social', 'Leader', 'Ranged', 'Skulk', 'Standard', 'Support'].map((t, i) => GDK.tag(t, { cls: i > 4 ? 'dim' : '' }))),
		h('div.xdk-rows',
			rows.map(d => h('div.xdk-row', GDK.tag(d.type), h('b', d.name), h('span', `Tier ${d.tier}${d.per ? ` · ${d.per}/HP` : ''}`), h('span.r', d.kind === 'environment' ? `Difficulty ${d.diff === 'Special' ? 'special' : d.diff}` : `${DHK_BP[d.type]} BP${d.type === 'Minion' ? ' per group' : ''}`))),
			h('div.xdk-row', GDK.tag('NPC'), h('b', 'Abbess Corra Vane'), h('span', 'Difficulty 13 · 1 feature'), h('span.r', 'Statted as Social')),
			h('div.xdk-row', GDK.tag('NPC'), h('b', 'Old Fen the ferryman'), h('span', 'No stats'), h('span.r', '—'))));
};

/* ---------- NPC card: its kind, and what it's statted as ---------- */
GDS.npcExtras = () => h('div.xds-npcx',
	h('div.npc-stats.xdk-npcstats', GD.crest('heater', 13, 'Difficulty', { size: 46, foe: true }),
		h('div.xdk-npcclass', h('span.xdk-arrow', 'Statted as'), GDK.tag('Social'), h('span.xdk-ref', icon('book', 13), h('span', 'Her block, tier 1'))),
		btn({ size: 'sm', icon: 'eye', text: 'Show features to players' })),
	GDS.featCard('Old Debts', 'NPC feature', [h('span', h('b', 'Trigger: '), 'a PC asks her for help a second time. '), h('span', h('b', 'Effect: '), 'she names a price; refusing marks a Stress.')]));
/** The shared NPC card with its kind on it: the NPC tag leads the pills, for GM and players alike. */
GDS.npcCard = (mode = 'gm') => {
	const el = npcCard(NPCD, mode === 'gm' ? { extras: GDS.npcExtras() } : { mode: 'player' });
	const pills = el.querySelector('.npc-pills'); if (pills) pills.prepend(GDK.tag('NPC'));
	return el;
};

/* ---------- Pages ---------- */
const xdkStage = (w, ...kids) => h('div.g-dh.xdk-stage', { style: { width: w + 'px' } }, kids);
DEFS.dh.block = {
	title: 'Adversaries, environments and NPCs',
	lede: 'Daggerheart sorts what the GM runs into three kinds, each with its own fields: adversaries (ten types, from Bruiser to Support), environments (four types) and NPCs. The block follows the Core Rulebook’s order exactly; the type tag, its glyph and the kind’s colour say what it is at a glance.',
	research: { cards: [
		{ t: 'Adversaries (CR pp.193–196)', li: [
			['The block, top to bottom: name; "Tier N Type"; a one-line description; Motives & Tactics; an inset box with Difficulty, Thresholds (Major/Severe), HP and Stress, then ATK, the standard attack’s name, range and damage; Experience under a dotted rule; then FEATURES.', S('CR p.193', '#')],
			['Features come in three kinds, written "Name - Passive:", "- Action:", "- Reaction:". Actions need the spotlight; passives and reactions don’t. Costs ("mark a Stress", "spend a Fear") sit in bold inside the text. Fear Features, summons and spotlighting features are actions or reactions with a Fear cost.', S('CR pp.194–196', '#')],
			['Experiences: fewer and broader than a PC’s; the GM spends a Fear to add one to a roll or to the Difficulty.', S('CR p.194', '#')],
		] },
		{ t: 'The ten adversary types (CR p.194, pp.198–207)', li: [
			['Bruiser, Horde, Leader, Minion, Ranged, Skulk, Social, Solo, Standard, Support. The type sits beside the tier in the block and decides its battle-point cost.', S('CR p.194', '#')],
			['Type changes the fields: a <b>Minion</b> has 1 HP, 1 Stress, no thresholds ("None"), "Minion (X)" and Group Attack. A <b>Horde</b> adds "(n/HP)" to its type line and the "Horde (X)" passive (weaker at half HP). A <b>Solo</b> often has "Relentless (X)". A <b>Social</b> adversary has a weak attack and a strong Experience.', S('CR pp.198–205', '#')],
			['Battle points (p.197): Minion group 1, Social and Support 1, Horde, Ranged, Skulk and Standard 2, Leader 3, Bruiser 4, Solo 5. The budget is 3 per PC + 2.', S('CR p.197', '#')],
		] },
		{ t: 'Environments (CR pp.240–242)', li: [
			['Name; "Tier N Type"; a one-line description; Impulses (how the place pushes and pulls); an inset with Difficulty (sometimes "Special") and Potential Adversaries; FEATURES, each followed by italic questions for the GM.', S('CR p.240', '#')],
			['Four types: Exploration, Social, Traversal, Event. No HP, thresholds or Stress. Features are passives, actions and reactions; some are Fear Features; many start a countdown.', S('CR p.241', '#')],
		] },
		{ t: 'NPCs and hazards (CR pp.158, 166–167, 240)', li: [
			['An NPC needs a name, a description and a motive; give them a Difficulty if the party might roll against them. Important NPCs get features written Trigger / Effect (optionally a Choice), shared with the table or kept private. An NPC who needs full numbers borrows an adversary block.', S('CR pp.166–167', '#')],
			['No hazard or trap block: a trap is a roll Difficulty (the table on p.158) or an environment feature. Environments "can represent hazards that originate from the world itself".', S('CR pp.158, 240', '#')],
		] },
	], borrow: ['The block’s order and its inset box, field for field', 'The type beside the tier, and the type’s own fields (Minion, Horde, Solo)', 'Three feature kinds, made visibly different', 'Questions under environment features', 'Battle points per type, for the encounter builder'], avoid: ['One generic "NPC" block for everything', 'Treating environments as adversaries (no HP, no attack)', 'A separate "Fear Feature" badge: the Fear cost in the text says it', 'A trap or hazard block of our own: the book makes them environment features or a roll Difficulty'], direction: ['<b>Three kinds, one frame.</b> Every block is the same paper card in the book’s order. The kind is a colour (crimson adversary, green environment, gold NPC), the type is a glyph and a word on the corner tag, and the type adds its own fields.'] },
	notes: [
		'<b>Kind is a colour, type is a glyph.</b> Crimson for adversaries, green for environments, gold-brown for NPCs. Each type has its own line glyph (ours), on the block’s corner tag, the tracker row and the compendium filters.',
		'<b>Feature kinds read at a glance</b>: Passive is a hollow ring and an outlined label (always on); Action a solid navy play mark and label (it needs the spotlight); Reaction an amber turning arrow and label (it waits for a trigger). A key sits beside FEATURES.',
		'<b>The tier is a bigger pentagon</b> with a TIER banner, in the crests’ language. Experience sits on the left under a dotted rule, as in the book.',
		'<b>Traps and hazards follow the book:</b> an environment feature (Loose Scree in Ambush at the Cut: a Fear, an Agility reaction roll at 13, damage on the tier’s benchmark) or a roll Difficulty from the table on p.158. No block of their own.',
	],
	shots: [
		{ custom: () => xdkStage(1180, GDK.chooser()), cap: 'The classification: kind, then type', sub: 'What the GM sees making a block (and what the compendium filters by): three kinds, each type with its glyph, its role in a line, its battle points. Paraphrased from the Core Rulebook, pages on each column.' },
		{ custom: () => h('div.xdk-grid', xdkStage(560, GDK.block('brute')), xdkStage(560, GDK.block('wyrm'))), cap: 'Adversaries: a Bruiser and a Solo', sub: 'The book’s order. Quarry Brute has a Stress cost and a Fear cost; the Marsh Wyrm is Relentless (2), with two Experiences on the left.' },
		{ custom: () => h('div.xdk-grid', xdkStage(560, GDK.block('imps')), xdkStage(560, GDK.block('swarm', { hp: 3 })), xdkStage(560, GDK.block('ashby'))), cap: 'The types that change the fields: Minion, Horde, Social', sub: 'Gravel Imps: thresholds None, HP 1, Minion (3) and Group Attack, and the bodies left in this fight. Reed Lurker Swarm: (3/HP) in the type line and a mark at half HP, where its Horde passive starts. Ashby: a weak attack, a strong Experience.' },
		{ custom: () => h('div.xdk-grid', xdkStage(560, GDK.block('ferry')), xdkStage(560, GDK.block('ambush'))), cap: 'Environments: a Traversal and an Event (with a trap)', sub: 'No HP or attack: Difficulty, impulses, potential adversaries (links to their blocks), features with the GM’s questions. Countdowns are drawn in place. The trap on the quarry road is an environment feature, as in the book.' },
		{ device: 'hover', title: 'The quarry road', path: 'Campaigns / Thornwatch / Scenes / The quarry road', cap: 'Hover card', sub: 'Hovering dh:Quarry Brute in a scene note.', under: () => proseWith('dh:Quarry Brute', { title: 'The quarry road', text: 'The cut narrows to a single cart’s width. Dust hangs in the air.', text2: 'Two of them work the face. A' }, 'looks up when the stones stop falling.'), render: () => GDS.adv('compact') },
		{ device: 'quick', cap: 'The tracker’s quick look', sub: 'One reference block, then a row of slots per copy in this fight.', tracker: () => GD.flow('gm'), sheetTitle: 'Quarry Brute', render: () => GDS.adv('compact', true) },
	],
};

/* The NPC page: the card's kind, and the GM's notes sorted by kind. */
DEFS.dh.npc.notes = (DEFS.dh.npc.notes || []).concat([
	'<b>Every card says what it is.</b> The NPC tag leads the pills, for the GM and the players. The abbess has a Difficulty and a feature, and a Social adversary block of her own for when the party argues with dice (the crimson tag links to it). An NPC with no stats has just the tag.',
	'<b>The compendium filters by the same classification</b>: kind first, then type, with battle points beside each adversary for building fights.',
]);
DEFS.dh.npc.lede = 'Daggerheart NPCs need little: a name, heritage and pronouns, a role, a description, a motive, and an optional Difficulty (CR p.166). Each card carries its kind as a tag; an NPC who needs numbers is statted as an adversary (usually Social) and the card says so. Trigger / Effect features and the closing question are Daggerheart’s additions.';
(() => { const sh = DEFS.dh.npc.shots[0]; if (sh && sh.items) { sh.items[0].el = () => h('div.g-dh', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, GDS.npcCard('gm')); sh.items[1].el = () => h('div.g-dh', { style: { width: '620px', background: 'var(--g-bg)', padding: '20px', borderRadius: '14px' } }, GDS.npcCard('player')); } })();
DEFS.dh.npc.shots.push({ custom: () => xdkStage(760, GDK.index()), cap: 'The GM’s notes, sorted by kind', sub: 'Filters are the classification: All, Adversaries, Environments, NPCs; then the ten adversary types (the ones in use first). Each row: the type tag, tier, and battle points or Difficulty.' });

/* The design system: the new tokens and marks. */
DEFS.dh.colors.push(['--xd-fear-ink', 'Fear band: ink on its plate', '--xd-fear-plate'], ['--xd-k-adv', 'Adversary tag (white text, 6.6:1)'], ['--xd-k-env', 'Environment tag (white text, 6.5:1)'], ['--xd-k-npc', 'NPC tag (white text, 5.9:1)']);
DEFS.dh.icons.list.push(...['Bruiser', 'Horde', 'Leader', 'Minion', 'Ranged', 'Skulk', 'Social', 'Solo', 'Standard', 'Support', 'Exploration', 'Social scene', 'Traversal', 'Event', 'NPC'].map(t => ({ title: t, el: () => h('span.xdk-tag.k-' + GDK.kindOf(t), { style: { padding: '0 5px' } }, GDK.glyph(t, 18)) })),
	{ title: 'Tier', el: () => GDK.tier(1) }, { title: 'Feature kinds', el: () => h('span.xdk-key', ['Passive', 'Action', 'Reaction'].map(t => h('span.is-' + t.toLowerCase(), svg(XDK_MARK[t], 14, 14)))) });
DEFS.dh.icons.text += ' Pass 4 adds a glyph for each adversary and environment type (ours), the tier pentagon with its banner, and the three feature marks: a ring for passive, a play mark for action, a turning arrow for reaction.';
