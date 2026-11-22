/* ============================================================================
   5e: character sheet, NPC card, stat block (2024 and 2014). SRD content only.
   The sheet opens on an oxblood banner (portrait, name, AC, initiative, speed),
   then a framed vitals band, six ability plaques with their skills, and tabs.
   ========================================================================== */
const G5S = {};
const ILSE = {
	name: 'Ilse Vane', line: 'Level 5 Elf Wizard (Evoker)', bg: 'Sage background · Neutral good', ac: 12, acNote: 'Unarmored',
	hp: { value: 24, max: 32, temp: 5 }, hd: { left: 3, max: 5 }, pb: 3, init: 2, speed: 30, size: 'Medium', pp: 14,
	abilities: [
		['Strength', 8, -1, -1, false, [['Athletics', -1, 0]]],
		['Dexterity', 14, 2, 2, false, [['Acrobatics', 2, 0], ['Sleight of Hand', 2, 0], ['Stealth', 2, 0]]],
		['Constitution', 15, 2, 2, false, []],
		['Intelligence', 18, 4, 7, true, [['Arcana', 10, 2], ['History', 7, 1], ['Investigation', 7, 1], ['Nature', 4, 0], ['Religion', 4, 0]]],
		['Wisdom', 12, 1, 4, true, [['Animal Handling', 1, 0], ['Insight', 4, 1], ['Medicine', 1, 0], ['Perception', 4, 1], ['Survival', 1, 0]]],
		['Charisma', 10, 0, 0, false, [['Deception', 0, 0], ['Intimidation', 0, 0], ['Performance', 0, 0], ['Persuasion', 0, 0]]],
	],
	slots: [[1, 4, 1], [2, 3, 1], [3, 2, 0]],
};
const sgn = n => n >= 0 ? `+${n}` : `−${Math.abs(n)}`;

/** A gold-rimmed plate on the banner: Initiative, Speed, Proficiency. */
G5S.plate = (label, value, opts = {}) => h('div.x5s-plate' + (opts.roll ? '.is-roll' : '') + (opts.cls ? '.' + opts.cls : ''), { title: opts.roll ? `Roll ${label}` : label },
	h('span.x5s-plate-v', svg('<path class="rim" d="M1 16 9 1.5h44L61 16l-8 14.5H9Z"/><path class="in" d="M5 16l6.3-11h39.4L57 16l-6.3 11H11.3Z"/>', 62, 32), h('b', value)),
	h('small', label));

G5S.banner = (c, opts = {}) => h('div.x5s-banner',
	h('span.x5s-port', portrait(c.name, opts.phone ? 64 : 96)),
	h('div.x5s-id', h('h1', c.name), h('div.x5s-line', c.line), h('div.x5s-bg', c.bg)),
	h('div.x5s-crest',
		h('div.x5s-acbox', G5.shield(c.ac, opts.phone ? 46 : 58), h('small', c.acNote)),
		G5S.plate('Initiative', sgn(c.init), { roll: true }), G5S.plate('Speed', `${c.speed} ft`, { cls: 'is-speed' }), G5S.plate('Proficiency', sgn(c.pb))),
	h('div.x5s-acts', btn({ icon: 'moon', text: 'Short rest', size: 'sm' }), btn({ icon: 'bed', text: 'Long rest', size: 'sm' }), btn({ icon: 'arrow-up', text: 'Level up', size: 'sm', cls: opts.levelUp ? 'x5s-lvl' : '' })));

G5S.band = (c, opts = {}) => {
	const dying = c.hp.value <= 0;
	return h('div.x5s-band', h('span.x5-corners'),
		h('div.x5s-hp', meter({ value: c.hp.value, max: c.hp.max, temp: c.hp.temp, extra: dying ? h('span.x5s-dying', 'Dying') : null }),
			dying ? h('div.x5s-ds', h('span.l', 'Death saves'), h('span.ok', 'Successes', pips({ max: 3, on: 1, style: { '--pip-on': 'var(--g-ok)', '--g-pip': '15px' } })), h('span.bad', 'Failures', pips({ max: 3, on: 1, style: { '--pip-on': 'var(--g-danger-text)', '--g-pip': '15px' } })), btn({ icon: 'dice', text: 'Roll save', size: 'sm', kind: 'primary' }))
				: h('div.x5s-hd', h('span.l', 'Hit dice'), pips({ max: c.hd.max, on: c.hd.left, style: { '--g-pip': '12px' } }), h('b', `${c.hd.left} of ${c.hd.max}`, h('small', ' d6')))),
		h('div.x5s-facts',
			h('span', h('small', 'Passive Perception'), h('b', String(c.pp))), h('span', h('small', 'Size'), h('b', c.size)),
			h('span.insp', svg('<path d="M8 0l1.9 5.6H16l-4.9 3.6 1.9 5.8L8 11.4 3 15l1.9-5.8L0 5.6h6.1z"/>', 16, 15), 'Heroic Inspiration')));
};
G5S.conds = (list) => h('div.x5s-conds', h('span.l', 'Conditions'), h('div.ev-chips', list.map(x => chip(x)), h('span.ev-chip.is-add', icon('plus', 13), 'Add')));
G5S.mark = p => h('i.x5s-pm' + (p === 2 ? '.e' : p ? '.p' : ''), { title: p === 2 ? 'Expertise' : p ? 'Proficient' : 'Not proficient' });
G5S.abilities = c => h('div.x5s-abil', c.abilities.map(([n, score, mod, save, prof, skills]) => h('div.x5s-a',
	h('div.x5s-a-top',
		h('span.x5s-a-h', n),
		h('button.x5s-mod', { title: `Roll ${n}` }, sgn(mod)),
		h('span.x5s-score', String(score))),
	h('div.x5s-a-list',
		h('div.x5s-sk.save', G5S.mark(prof ? 1 : 0), h('span', 'Save'), h('b', sgn(save))),
		skills.map(([s, v, p]) => h('div.x5s-sk', G5S.mark(p), h('span', term(s)), h('b', sgn(v))))))));
G5S.tabs = (on) => h('div.x5s-tabs', ['Actions', 'Spells', 'Features', 'Inventory', 'Notes'].map(t => h('span' + (t === on ? '.on' : ''), t)));
G5S.grp = (t, right) => h('div.x5s-grp', h('span', t), right || null);
G5S.actions = () => h('div.x5s-tab',
	h('div.x5s-row.is-head', h('span', 'Name'), h('span', 'Range, notes'), h('span', 'Hit / DC'), h('span', 'Damage')),
	G5S.grp('Actions', h('small', '1 per turn')),
	[['Fire Bolt', 'Cantrip · 120 ft', '+7', '2d10', 'fire'], ['Dagger', 'Finesse, light, thrown · 20/60', '+5', '1d4 + 2', 'piercing'], ['Quarterstaff', 'Versatile · 5 ft', '+2', '1d6 − 1', 'bludgeoning']].map(([n, note, hit, dmg, type]) => h('div.x5s-row', h('b', n), h('small', note), rollBtn('', hit, { noIcon: true }), dmgBtn(dmg, type))),
	G5S.grp('Bonus Actions'), h('div.x5s-row', h('b', 'Misty Step'), h('small', 'Level 2 slot · teleport 30 ft'), h('span'), btn({ size: 'sm', text: 'Cast' })),
	G5S.grp('Reactions'), h('div.x5s-row', h('b', 'Shield'), h('small', 'Level 1 slot · +5 AC until your next turn'), h('span'), btn({ size: 'sm', text: 'Cast' })),
	G5S.grp('Limited use'), h('div.x5s-row', h('b', 'Arcane Recovery'), h('small', 'Once per Long Rest · recover 3 levels of slots'), h('span'), pips({ max: 1, on: 1, style: { '--g-pip': '12px' } })));
G5S.spells = (justCast) => h('div.x5s-tab',
	h('div.x5s-sfacts', h('span', h('small', 'Spellcasting'), h('b', 'Intelligence')), h('span', h('small', 'Save DC'), h('b', '15')), h('span', h('small', 'Spell attack'), rollBtn('', '+7', { noIcon: true }))),
	[[1, 'Magic Missile, Shield, Mage Armor, Detect Magic', 4, 1], [2, 'Misty Step, Scorching Ray', 3, justCast ? 2 : 1], [3, 'Fireball, Counterspell', 2, 0]].map(([lv, names, max, used]) => h('div.x5s-lv',
		h('div.x5s-lv-h', h('b', `Level ${lv}`), pips({ max, on: max - used, style: { '--g-pip': '13px' } }), h('small', `${max - used} of ${max} left`), justCast && lv === 2 ? h('span.x5s-spent', 'just spent') : null),
		names.split(', ').map(s => h('div.x5s-sp', h('i.x5s-sn', s.trim()), s.includes('Detect') ? h('em', { title: 'Ritual' }, 'R') : s.includes('Mage Armor') ? h('em', { title: 'Lasts 8 hours' }, '8 h') : h('span'), h('small', lv === 2 && s.includes('Scorching') ? '3 rays · 2d6 fire each' : s.includes('Fireball') ? '20-ft sphere · DC 15 Dex · 8d6' : ''), btn({ size: 'sm', kind: 'quiet', text: 'Cast' }))))));

G5S.sheet = (state = 'full', opts = {}) => {
	const c = clone(ILSE);
	let conds = [{ name: 'Concentrating', icon: 'target', note: 'Hold Person' }, { name: 'Poisoned', rounds: 2 }];
	if (state === 'dying') { c.hp = { value: 0, max: 32, temp: 0 }; conds = [{ name: 'Unconscious', bad: true }]; }
	if (state === 'spells') return h('div.x5s',
		h('div.x5s-mini', portrait(c.name, 34), h('b', c.name), h('span.ac', G5.shield(c.ac, 28)), h('span.hp', meter({ value: c.hp.value, max: c.hp.max, temp: c.hp.temp, label: 'HP' }))),
		G5S.conds(conds), G5S.tabs('Spells'), G5S.spells(true), rollToast('Scorching Ray, ray 1', 'd20 + 7', 19, 'Hits AC 15: roll 2d6 fire'));
	return h('div.x5s' + (opts.phone ? '.is-phone' : ''),
		G5S.banner(c, opts), G5S.band(c, opts), G5S.conds(conds), G5S.abilities(c),
		G5S.tabs('Actions'), G5S.actions());
};
G5S.modal = () => h('div.sh-modal.x5s-modal', h('span.x5-corners'), h('div.ev-sheet-head', h('h3', 'Ilse · hit points'), btn({ icon: 'x', kind: 'quiet icon', size: 'sm' })),
	hpPad({ who: h('span', h('b', '24'), ' / 32 +5 temp → ', h('b', '21')), amount: '8', extra: quickActs('If Ilse says she casts Shield', [['Shield', '+5 AC · uses her reaction']]), hint: 'Temp HP goes first (5), then 3 from HP. Concentrating on Hold Person: Constitution save DC 10.', go: btn({ kind: 'primary', text: 'Apply 8' }) }));

/* ---------- NPC ---------- */
const NPC5 = {
	name: 'Odile Varr', role: 'Keeper of the drowned chapel', facts: 'Human · she/her · 60s',
	links: [['flag', 'Faction', 'The Bell Choir'], ['castle', 'Found at', 'The drowned chapel'], ['book', 'First met', 'Session 9']],
	status: 'alive', attitude: 'neutral',
	rows: [['Look', 'Wet hems she never wrings out; a ring of iron keys on a cord.'], ['Wants', 'The bell raised before the next flood, by anyone, at any cost.'], ['Voice', 'Low, unhurried; counts under her breath when she lies.'], ['Offers', 'Safe passage through the reed paths, and the old chapel map.']],
	secret: 'She made the bargain with the bog hag. The flood is the price.',
	playerRows: [['Look', 'Old woman, soaked to the knees, lots of keys.'], ['Said', 'She wants the bell raised. Says the flood comes back if it isn’t.'], ['Met', 'At the chapel door, session 9. Gave us the map.'], ['Hunch', 'She counts when she’s nervous. Or lying?']],
};
G5S.npcExtras = () => h('div.npc-stats.x5-npc-stats',
	h('span.x5-npc-ac', G5.shield(10, 30), h('small', 'AC')),
	h('span.npc-stat', h('small', 'HP'), h('b', '27'), h('em', '(5d8 + 5)')), h('span.npc-stat', h('small', 'CR'), h('b', '2')),
	h('span.npc-ref.x5-ref', h('span.k', '5e'), h('span.v', 'Priest')), btn({ size: 'sm', icon: 'swords', text: 'Add to fight' }));
G5S.npc = (mode) => h('div.g-5e.x5-paper', { style: { width: '620px', padding: '20px', borderRadius: '10px', boxShadow: 'inset 0 0 0 1px var(--g-line)' } }, npcCard(NPC5, mode === 'player' ? { mode: 'player' } : { extras: G5S.npcExtras() }));

/* ---------- Stat block (SRD Green Hag) ---------- */
const HAG24 = { name: 'Green Hag', tag: 'Medium Fey, Neutral Evil', ac: 17, init: '+1', initS: '(11)', hp: '82', hpD: '11d8 + 33', speed: '30 ft., Swim 30 ft.', ab: [['Str', 18, 4, 4], ['Dex', 12, 1, 1], ['Con', 16, 3, 3], ['Int', 13, 1, 1], ['Wis', 14, 2, 2], ['Cha', 14, 2, 2]],
	skills: 'Arcana +5, Deception +4, Perception +4, Stealth +3', senses: 'Darkvision 60 ft.; Passive Perception 14', langs: 'Common, Elvish, Sylvan', cr: '3 (XP 700; PB +2)',
	traits: [['Amphibious', 'The hag can breathe air and water.'], ['Mimicry', 'The hag can mimic animal sounds and humanoid voices. A creature that hears the sounds can tell they are imitations only with a successful DC 14 Wisdom (Insight) check.']],
	actions: [['Multiattack', 'The hag makes two Claw attacks.'], ['Claw', [{ i: 'Melee Attack Roll: ' }, ['+6'], ', reach 5 ft. ', { i: 'Hit: ' }, '8 (', ['1d8 + 4'], ') Slashing damage plus 3 (', ['1d6'], ') Poison damage.']],
		['Spellcasting', ['The hag casts one of the following spells, requiring no Material components and using Wisdom as the spellcasting ability (spell save ', ['DC 12'], ', ', ['+4'], ' to hit with spell attacks):']]],
	spells: [['At Will', [{ i: 'Dancing Lights' }, ', ', { i: 'Disguise Self' }, ' (24-hour duration), ', { i: 'Invisibility' }, ' (self only), ', { i: 'Minor Illusion' }, ', ', { i: 'Ray of Sickness' }, ' (level 3 version)']]] };
const HAG14 = { name: 'Green Hag', tag: 'Medium fey, neutral evil', ac: '17 (natural armor)', hp: '82', hpD: '11d8 + 33', speed: '30 ft.', ab: [['STR', 18, 4], ['DEX', 12, 1], ['CON', 16, 3], ['INT', 13, 1], ['WIS', 14, 2], ['CHA', 14, 2]],
	skills: 'Arcana +3, Deception +4, Perception +4, Stealth +3', senses: 'darkvision 60 ft., passive Perception 14', langs: 'Common, Draconic, Sylvan', cr: '3 (700 XP)',
	traits: [['Amphibious', 'The hag can breathe air and water.'], ['Mimicry', 'The hag can mimic animal sounds and humanoid voices. A creature that hears the sounds can tell they are imitations with a successful DC 14 Wisdom (Insight) check.']],
	actions: [['Claws', [{ i: 'Melee Weapon Attack: ' }, ['+6'], ' to hit, reach 5 ft., one target. ', { i: 'Hit: ' }, '13 (', ['2d8 + 4'], ') slashing damage.']], ['Illusory Appearance', 'The hag covers herself and anything she is wearing or carrying with a magical illusion that makes her look like another creature of her general size and humanoid shape.']] };
const rollText = parts => typeof parts === 'string' ? parts : parts.map(p => Array.isArray(p) ? h('span.x5b-r', p[0]) : p && p.i ? h('i', p.i) : p);
const TERMS5 = ['Wisdom (Insight)', 'Darkvision', 'darkvision', 'Passive Perception', 'Slashing', 'Poison'];
const withTerms = text => { if (typeof text !== 'string') return text; for (const t of TERMS5) if (text.includes(t)) { const [a, b] = text.split(t); return [a, term(t), b]; } return text; };

/** The 2014 bar's taper, in the rule red. */
G5S.taper14 = () => { const s = svg('<path d="M0 0.3 L400 2.5 L0 4.7 Z" fill="currentColor"/>', 400, 5, 'x5b-taper'); s.setAttribute('preserveAspectRatio', 'none'); return s; };

G5S.block = (ed = '2024', size = 'full') => {
	const m = ed === '2024' ? HAG24 : HAG14;
	const line = (k, v) => h('div.x5b-l', h('b', k), ' ', v);
	const hp = h('span', m.hp, ' (', h('span.x5b-r', m.hpD), ')');
	if (ed === '2024') {
		const cell = ([k, s, mod, sv], i) => h('div.x5b-ab' + (i >= 3 ? '.mental' : ''), h('b', k), h('span.s', String(s)), h('span.x5b-r', sgn(mod)), h('span.x5b-r.sv', sgn(sv)));
		return h('div.x5b.ed2024' + (size === 'compact' ? '.compact' : ''),
			h('h2', m.name), h('div.x5b-tag', m.tag),
			h('div.x5b-top',
				h('div.x5b-l.x5b-acin', h('span', h('b', 'AC'), ' ', String(m.ac)), h('span', h('b', 'Initiative'), ' ', h('span.x5b-r', m.init), ' ', m.initS)),
				line('HP', hp), line('Speed', m.speed)),
			h('div.x5b-ab24', ['', '', ''].map(() => h('div.x5b-abh', h('span'), h('span'), h('small', 'Mod'), h('small', 'Save'))), m.ab.map(cell)),
			h('div.x5b-top', line('Skills', m.skills), line('Senses', withTerms(m.senses)), line('Languages', m.langs), line('CR', m.cr)),
			h('h3', 'Traits'),
			m.traits.map(([n, t]) => h('p', h('b', n + '.'), ' ', withTerms(t))),
			h('h3', 'Actions'),
			m.actions.map(([n, t]) => h('p', h('b', n + '.'), ' ', rollText(t))),
			m.spells.map(([k, t]) => h('p.x5b-spl', h('b.k', k + ':'), ' ', rollText(t))));
	}
	return h('div.x5b.ed2014' + (size === 'compact' ? '.compact' : ''),
		h('div.x5b-bar'),
		h('h2', m.name), h('div.x5b-tag', m.tag),
		G5S.taper14(),
		line('Armor Class', String(m.ac)), line('Hit Points', hp), line('Speed', m.speed),
		G5S.taper14(),
		h('div.x5b-ab14', m.ab.map(([k, s, mod]) => h('div', h('b', k), h('span', `${s} (`, h('span.x5b-r', sgn(mod)), ')')))),
		G5S.taper14(),
		line('Skills', m.skills), line('Senses', withTerms(m.senses)), line('Languages', m.langs), line('Challenge', m.cr),
		G5S.taper14(),
		m.traits.map(([n, t]) => h('p', h('b', n + '.'), ' ', withTerms(t))),
		h('h3', 'Actions'),
		m.actions.map(([n, t]) => h('p', h('b', n + '.'), ' ', rollText(t))),
		h('div.x5b-bar'));
};
G5S.blockStage = ed => h('div.g-5e.x5-paper', { style: { width: '560px', padding: '22px', borderRadius: '10px', boxShadow: 'inset 0 0 0 1px var(--g-line)' } }, G5S.block(ed));

/* ---------- Definitions for the study ---------- */
Object.assign(DEFS['5e'], {
	sheet: {
		title: 'Character sheet', lede: 'Ilse Vane, level 5 wizard, in a 5e-sheet block that takes over her note. The 2024 sheet’s top band (AC, HP, hit dice, death saves) on one line, abilities with their skills under them, then the tabs a player actually uses at the table.',
		research: {
			cards: [
				{ t: '2024 official sheet', li: [['Top band: AC (with a shield box), Hit Points (current, temp, max), Hit Dice, Death Saves; a second row of Proficiency, Initiative, Speed, Size, Passive Perception.', S('2024 character sheet PDF', 'https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf')], ['Skills sit under their ability, with the saving throw; Heroic Inspiration sits under Constitution.', S('Wargamer on the redesign', 'https://www.wargamer.com/dnd/redesigned-character-sheet-2024')], ['Page 2: spell slots per level as total and expended; spells with C/R/M markers; attunement, coins.', S('2024 sheet PDF', 'https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf')]] },
				{ t: '2014 sheet', li: [['Separate saving throws block and an alphabetical skills list with "(Dex)" labels; death saves next to hit dice; spells on a third page with prepared checkboxes.', S('2014 fillable sheet', 'https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf')], ['Personality, ideals, bonds and flaws take a whole column on the play surface.', S('2014 fillable sheet', 'https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf')]] },
				{ t: 'The plugin today', li: [['A hero card, five big tiles (AC, Initiative, Speed, Proficiency, Inspiration), the shared HP meter and keypad, death saves only at 0 HP, abilities with skills, tabs for Actions, Spells, Features, Inventory.', S('src/systems/dnd5e/sheet.ts', '../src/systems/dnd5e/sheet.ts')], ['Gaps: the five tiles take a lot of height; actions aren’t grouped by Action / Bonus action / Reaction; no limited-use features; no concentration on the sheet.', S('docs/images/feature-5e-sheet.png', '../docs/images/feature-5e-sheet.png')]] },
			],
			borrow: ['The 2024 band: AC, HP, hit dice, death saves on one line', 'Skills under their ability', 'Actions grouped as D&D Beyond does: Action, Bonus action, Reaction, Limited use', 'Slot pips per level, C and R markers'],
			avoid: ['Personality and bonds on the play surface (they go in Notes)', 'Five tall tiles for numbers that rarely change', 'The 2014 separate saves list'],
			direction: ['<b>The 2024 sheet, in one band.</b> The numbers a player looks up mid-fight sit on one line; the rest is a tap away. Same oxblood and Baskerville as the tracker, so the sheet and the fight are one game.'],
		},
		notes: ['<b>Shared parts:</b> the portrait, the HP meter (−, the bar, +, the keypad), pips for slots and hit dice, condition chips, roll buttons, rules words underlined. Each is the same component every game uses.', '<b>Death saves</b> replace the hit dice under the meter only at 0 HP.', '<b>Casting spends the slot</b> with one quiet tap; the pip that changed animates. Nothing asks "are you sure?"; Back undoes.', '<b>2014 campaigns</b> use the same layout; only the rules words, the actions list and the edition’s conditions change.'],
		shots: [
			{ device: 'note-laptop', title: 'Ilse Vane', path: 'Campaigns / The drowned chapel / Party / Ilse Vane', cap: 'Laptop: the full sheet, Actions tab', sub: 'Concentrating and Poisoned in the conditions row; weapons and cantrips with to-hit and damage rolls; Shield under Reaction.', render: () => G5S.sheet('full'), height: 1180 },
			{ device: 'note-landscape', title: 'Ilse Vane', cap: 'iPad landscape: taking a hit through the keypad', sub: 'The same keypad as the tracker. Shield is a quiet chip: Ilse says it, the player taps it. The hint does the temp HP and concentration arithmetic.', render: () => G5S.sheet('full'), overlay: () => G5S.modal() },
			{ device: 'note-portrait', title: 'Ilse Vane', cap: 'iPad portrait: casting, and a roll', sub: 'Scorching Ray spent a 2nd-level slot (the pip that changed is marked); the roll lands in a toast at the bottom.', render: () => G5S.sheet('spells') },
			{ device: 'note-phone', title: 'Ilse Vane', cap: 'Phone: at 0 HP', sub: 'Death saves replace the hit dice; Level up stays in the header as the entry point to the wizard.', render: () => G5S.sheet('dying', { phone: true }) },
		],
	},
	npc: {
		title: 'NPC card', lede: 'The shared card (portrait, role, facts, status and attitude, rows) with 5e’s additions in 5e’s words: AC, HP, CR, a linked stat block, and Add to fight. Players get their own card, written from the outside.',
		research: { cards: [
			{ t: 'The plugin today', li: [['Core card: portrait, name, role in small caps, ancestry · pronouns · age, faction / found at / first met, status and attitude pills, label/value rows, a blurred secret.', S('src/core/npc-card.ts', '../src/core/npc-card.ts')], ['5e adds GM-only AC, HP and CR chips, a statblock: reference with its hover card, and Add to fight.', S('src/systems/dnd5e/npc-card.ts', '../src/systems/dnd5e/npc-card.ts')], ['For players the secret is still drawn, blurred. It should not be there at all.', S('5e research', '../src/core/npc-card.ts')]] },
			{ t: 'How 5e presents NPCs', li: [['Adventures pair a short description and motivation with an SRD stat block by name ("use the Priest stat block").', S('SRD 5.2 creatures', 'https://www.dndbeyond.com/sources/dnd/free-rules')]] },
		], borrow: ['A named SRD stat block as the NPC’s numbers', 'AC, HP, CR at a glance'], avoid: ['Secrets in the player view, even blurred', 'A second stat block layout for NPCs'], direction: ['<b>One card, two readers.</b> The GM’s card carries the numbers and the secret; the player’s carries what the party noticed.'] },
		notes: ['<b>GM view:</b> stats and the stat block link sit under the facts, the secret blurs until tapped.', '<b>Player view:</b> no stats, no secret, not blurred: removed. The rows are the player’s own notes ("Said", "Met", "Hunch").'],
		shots: [{ device: 'pair', cap: 'GM view and player view', sub: 'Same frame, same place for everything; only what’s in it changes.', items: [{ el: () => G5S.npc('gm'), cap: 'GM' }, { el: () => G5S.npc('player'), cap: 'Player' }] }],
	},
	block: {
		title: 'Stat block', lede: 'The SRD Green Hag in both editions. The 2024 block keeps its order (AC and Initiative on one line, the Mod/Save table, CR with XP and PB); the 2014 block keeps the tapered bars and "Challenge". Every number rolls; rules words are underlined.',
		research: { cards: [
			{ t: '2024 order', li: [['Name; Size Type, Alignment; AC | Initiative +X (static); HP; Speed; Str–Cha with score, Mod, Save; Skills; Senses; Languages; CR (XP; PB); Traits, Actions, Bonus Actions, Reactions, Legendary Actions.', S('DDB stat block preview', 'https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024')]] },
			{ t: '2014 order', li: [['Armor Class (note), Hit Points, Speed; six "score (mod)"; Saving Throws, Skills, Senses, Languages; Challenge (XP); traits without a header; Actions, Reactions, Legendary Actions.', S('2014 Basic Rules: monsters', 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters')]] },
			{ t: 'The plugin today', li: [['Both layouts render; rolls everywhere; rules words underlined. Gaps: 2024 initiative falls back to Dex for monsters without a printed value; legendary uses aren’t trackable; 2014 shows a PB line the SRD doesn’t print.', S('src/systems/dnd5e/render.ts', '../src/systems/dnd5e/render.ts')]] },
		], borrow: ['Each edition’s own order and words', 'Static initiative in parentheses', 'Legendary uses as pips (the shared pip spec)'], avoid: ['Computing 2024 initiative from Dex only', 'A PB line in 2014 blocks'], direction: ['<b>The book’s block, alive.</b> Same order and words as the edition, with every number a roll and every rules word a card.'] },
		shots: [
			{ device: 'pair', cap: 'In a note: 2024 and 2014', sub: 'Left: 2024 (the hag’s two Claw attacks, poison rider). Right: 2014 (Claws, natural armor, Challenge 3). Dotted words open their rule; dotted-box numbers roll.', items: [{ el: () => G5S.blockStage('2024'), cap: '2024' }, { el: () => G5S.blockStage('2014'), cap: '2014' }] },
			{ device: 'hover', title: 'Session 12', path: 'Campaigns / The drowned chapel / Sessions / Session 12', cap: 'Hover card', sub: 'Hovering 5e:Green Hag in a session note: the same block, compact.', under: () => proseWith('5e:Green Hag', { title: 'Session 12', text: 'The bell rope is cut. The reed paths flood at dusk.', text2: 'Odile Varr won’t meet their eyes. In the vestry, the' }, 'is waiting, wearing Odile’s face.'), render: () => G5S.block('2024', 'compact') },
			{ device: 'quick', cap: 'The tracker’s quick look', sub: 'Tapping a name in the tracker opens the same block in a sheet over the panel.', tracker: () => G5.flow('mid'), sheetTitle: 'Green Hag', render: () => G5S.block('2024', 'compact') },
		],
	},
});

/* ---------- Visual pass 2: the words that go with the new look ---------- */
DEFS['5e'].sheet.lede = 'Ilse Vane, level 5 wizard, in a 5e-sheet block that takes over her note. It opens on an oxblood banner: her portrait in a gold medallion, her name in Garamond small caps, AC in a gold-rimmed shield and initiative, speed and proficiency as gold plates. A framed vitals band overlaps the banner’s foot (HP, hit dice or death saves, passive Perception); then six ability plaques with their skills under them, and the tabs a player uses at the table.';
DEFS['5e'].sheet.research.cards.unshift({ t: 'What makes a 5e sheet look rich', li: [
	[REF5('foundry-sheet.jpg', 'Foundry dnd5e sheet panels') + 'Foundry: a red banner for the name, parchment panels with notched gold frames, proficiency as filled dots.', S('Foundry: Dungeons & Dragons arrives', 'https://foundryvtt.com/article/dungeons-dragons-arrives/')],
	[REF5('tidy5e-header.jpg', 'Tidy 5e ability plates') + 'Tidy 5e: the modifier big, the score in a small plate under it, the save beneath; AC in a big shield.', S('Tidy 5e Sheets (MIT)', 'https://github.com/kgar/foundry-vtt-tidy-5e-sheets')],
] });
DEFS['5e'].sheet.research.direction = ['<b>The 2024 sheet, in one band, dressed like the book.</b> The numbers a player looks up mid-fight sit in the banner and the band; ability plaques carry their skills; Garamond small caps and gold leaf make it 5e at a glance. Same tokens as the tracker, so the sheet and the fight are one game.'];
DEFS['5e'].sheet.notes = DEFS['5e'].sheet.notes.concat(['<b>Proficiency marks</b> are diamonds: hollow (none), filled (proficient), ringed (expertise). Slot pips and hit dice are diamonds too, following the shared pip spec.', '<b>The HP number</b> sits in a parchment cartouche on the bar, so it reads over green, teal or the empty track.']);
DEFS['5e'].npc.lede = 'The shared card in 5e’s frame: gold corners, the portrait in a double gold mat, the name in Garamond small caps, the role in italic, facts over an oxblood rule. The GM’s card adds AC in the shield, HP with its dice, CR and a 5e: Priest reference; the player’s card is a parchment page of their own notes, in italic.';
DEFS['5e'].block.lede = 'The SRD Green Hag in both editions, each in its own dress. 2024: a warm card with a double hairline, the name over an oxblood rule, AC and Initiative on one line, the Mod/Save table as tinted cells (physical warm, mental cooler), Traits and Actions as small-caps heads. 2014: the amber page, ochre bars, red tapers between sections and "Challenge". Every number rolls (a gold underline); rules words open their card.';
DEFS['5e'].block.research.cards.unshift({ t: 'The look of each edition', li: [
	[REF5('srd52-statblock.jpg', 'SRD 5.2 Green Hag') + 'SRD 5.2: oxblood heads over a thin rule, bold oxblood labels, tinted Mod/Save cells, a humanist sans.', S('SRD 5.2 (CC-BY-4.0)', 'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf')],
	[REF5('homebrewery-2014.jpg', 'A 2014-style block in the Homebrewery') + '2014 (Homebrewery, our text): amber page, ochre bars, red tapers, small-caps name.', S('The Homebrewery', 'https://homebrewery.naturalcrit.com/')],
] });
