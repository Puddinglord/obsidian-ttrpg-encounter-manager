/* ============================================================================
   Sample campaigns, one per game: the same three notes (a quest, a location,
   a session) written as each game's books would, with what each game adds.
   All fiction here is ours.
   ========================================================================== */
const CQSRC = (t) => S(t, '#');

/* ---------- 5e: read-aloud boxes, gold and XP ---------- */
CQ.readAloud = t => h('div.cq-read', h('span.k', icon('feather', 13), 'Read aloud'), h('p', t));
DEFS['5e'].campaign = CQ.section('5e', {
	lede: 'The Campaign panel, a quest, a location and a session log in 5e’s look: the book’s red and gold, Garamond small caps, and the boxed read-aloud text adventures use for a place.',
	research: { cards: [{ t: 'Adventures and the DM’s notes', li: [['Places are keyed and open with a boxed paragraph to read aloud, then what the DM knows.', CQSRC('5e adventure layout')], ['Rewards are gold, magic items and XP or a milestone; quests are rarely tracked on paper beyond a note.', CQSRC('SRD 5.2: Rewards')]] }], borrow: ['Read-aloud box for a place', 'Red small-caps headings over a gold rule', 'Gold and items as the reward line'], avoid: ['A quest log that looks like a task app'], direction: ['<b>The DM’s binder, wired up.</b> The same cards as every game; 5e’s are the book’s red, gold and Garamond.'] },
	questSub: 'The open quests sit in the Campaign panel with their status; the quest note opens with its card (who, where, reward, objectives, the DM’s secret).',
	placeSub: 'The lighthouse with its read-aloud box, who’s there and where it leads.',
	sessionSub: 'Session 12: who played, what happened, which quests moved, the loot.',
	campaign: { name: 'The Sunken Bells', next: 'Session 13', emblem: 'crown', words: { quest: 'Quest', quests: 'Quests' }, chapters: [['Chapter 3: Gullhaven', 9]], open: [['Ring the drowned bell', 'active', true], ['The keeper’s debt', 'active'], ['Smugglers’ tithe', 'done']], sections: [['book', 'Sessions', 12], ['users', 'NPCs', 14], ['castle', 'Locations', 7], ['shield', 'Party', 4], ['skull', 'Monsters', 11]] },
	quest: { title: 'Ring the drowned bell', path: 'Campaigns / The Sunken Bells / Quests / Ring the drowned bell', kicker: 'Quest · Chapter 3', status: 'active', statusText: 'Active', giver: 'Abbess Morwen', where: 'Gullhaven Chapel', reward: '250 gp and the Tidecaller shield', rewardIcon: 'sparkle',
		objectives: [['Find the bell rope in the flooded vestry', true], ['Learn who cut it', true], ['Raise the bell at low tide', false]],
		secret: 'The Abbess cut the rope herself: the bell calls the drowned, and she owes them.',
		prose: [CQ.h2('Notes'), CQ.p('Morwen asked us at the [[Gullhaven Chapel]] door. She wouldn’t say why the bell stopped; [[Old Pell]] says it was the night the [[Gullhaven Lighthouse]] went dark.'), CQ.p('Low tide is at dawn on the third day.')] },
	place: { name: 'Gullhaven Lighthouse', kicker: 'Location · Gullhaven', emblem: 'castle', facts: [['flag', 'Region', 'The Shingle Coast'], ['skull', 'Danger', 'Drowned keepers']],
		extra: () => CQ.readAloud('Salt has eaten the door to a lace of rust. Inside, the stair climbs into darkness, and somewhere above you a lamp is still being trimmed.'),
		here: ['Old Pell', 'The last keeper'], leads: ['Gullhaven Chapel', 'The Shingle Caves'], secret: 'The keeper’s log names the night the bell went quiet.',
		prose: [CQ.h2('Keyed areas'), CQ.p('1. The stair: 90 steps, the 40th gone. 2. The lamp room: the keeper trims a lamp that isn’t lit.')] },
	session: { title: 'The keeper’s last log', kicker: 'Session 12 · 14 November', party: ['Mara', 'Orren', 'Tamsin', 'Wren'],
		recap: ['Climbed the lighthouse; Orren fell through the 40th step.', 'The keeper’s ghost let us read his log.', 'Found the cut bell rope in the vestry.'],
		threads: [['Ring the drowned bell', 'Advanced', 'up'], ['The keeper’s debt', 'New', 'new']], loot: ['120 gp', 'Keeper’s brass lantern', 'Potion of water breathing'], nextUp: 'Low tide at dawn: raise the bell.' },
});

/* ---------- Nimble: monster refs, khaki ribbons ---------- */
CQ.monsters = list => h('div.cq-mons', h('small', 'Monsters here'), list.map(([n, lvl]) => h('span.cq-mon', icon('skull', 12), h('b', n), h('small', lvl))));
DEFS.nimble.campaign = CQ.section('nimble', {
	lede: 'The Campaign panel, a quest, a location and a session log in Nimble’s look: the sheet’s charcoal and parchment, Vollkorn names, khaki ribbons for headings, and the monsters a place holds as links to their blocks.',
	research: { cards: [{ t: 'The books', li: [['Adventures are short and direct: a place, who’s there, what they want, the monsters to use by name.', CQSRC('Nimble GMG pp.25–34')], ['Side notes and passives sit on a khaki band; the same band heads sections here.', CQSRC('Nimble Core p.13')]] }], borrow: ['Khaki ribbon headings', 'Charcoal stamps', 'Monsters by name, one tap to the block'], avoid: ['Extra fields the GM won’t fill'], direction: ['<b>The sheet’s language on every note.</b>'] },
	questSub: 'The panel lists open quests; the quest’s card uses the sheet’s charcoal and the khaki ribbon.',
	placeSub: 'The lower gate: who’s there, the monsters to use (tap for their blocks), where it leads.',
	sessionSub: 'Session 7 in Nimble’s ink.',
	campaign: { name: 'The Copper Vaults', next: 'Session 8', emblem: 'castle', words: { quest: 'Quest', quests: 'Quests' }, chapters: [['Part 2: Below the gate', 6]], open: [['The missing assayer', 'active', true], ['Rats in the counting house', 'active'], ['Krenn’s whistle', 'failed']], sections: [['book', 'Sessions', 7], ['users', 'NPCs', 9], ['castle', 'Locations', 5], ['shield', 'Party', 4], ['skull', 'Monsters', 14]] },
	quest: { title: 'The missing assayer', path: 'Campaigns / The Copper Vaults / Quests / The missing assayer', kicker: 'Quest · Part 2', status: 'active', statusText: 'Active', giver: 'Captain Ysolde Krenn', where: 'The Lower Gate', reward: '60 gp and a vault key', rewardIcon: 'sparkle',
		objectives: [['Get past the Lower Gate', true], ['Find Assayer Dunn', false], ['Bring back her ledger', false]],
		secret: 'Dunn isn’t missing. She’s hiding from Krenn, with proof Krenn skims the ingots.',
		prose: [CQ.h2('Notes'), CQ.p('Krenn wants the ledger more than she wants [[Assayer Dunn]]. The rats in the [[Counting House]] came up from below the same night Dunn vanished.')] },
	place: { name: 'The Lower Gate', kicker: 'Location · The Copper Vaults', emblem: 'lock', facts: [['flag', 'Part', 'Below the gate'], ['skull', 'Danger', 'Level 3']],
		extra: () => CQ.monsters([['Vault Rat', 'Lvl 1/2'], ['Copper Golem', 'Lvl 3'], ['Bramblehound', 'Lvl 3']]),
		here: ['Captain Ysolde Krenn', 'Gatekeeper Ollo'], leads: ['The Counting House', 'The Smelting Pits'], secret: 'The golem obeys whoever holds Krenn’s whistle.',
		prose: [CQ.h2('The gate'), CQ.p('Two doors of green copper, a wheel to turn them, and a golem that hasn’t moved in a year. [[Gatekeeper Ollo]] sleeps in the gatehouse.')] },
	session: { title: 'Through the Lower Gate', kicker: 'Session 7 · 12 November', party: ['Brakka', 'Tamsin Reed', 'Orren', 'Wren'],
		recap: ['Talked Ollo into opening the gate.', 'Brakka raged at the golem; it didn’t move.', 'Found Dunn’s ink on the counting-house floor.'],
		threads: [['The missing assayer', 'Advanced', 'up'], ['Krenn’s whistle', 'Failed', 'failed']], loot: ['40 gp', 'A copper vault key', 'Dunn’s spectacles'], nextUp: 'Down to the smelting pits.' },
});

/* ---------- Call of Cthulhu: case files, leads, sanity ---------- */
CQ.sanity = (t) => h('div.cq-san', icon('eye', 14), h('small', 'Sanity at stake'), h('b', t));
CQ.clues = list => h('div.cq-clues', CQ.sec('Hidden here'), list.map(([skill, t, found]) => h('div.cq-clue' + (found ? '.found' : ''), h('span.sk', skill), h('span', t))));
CQ.sanLost = list => h('div.cq-sanlost', h('small', 'Sanity lost'), list.map(([n, v]) => h('span', h('b', n), ' ', v)));
DEFS.coc.campaign = CQ.section('coc', {
	lede: 'The Campaign panel, a case, a location and an investigation log in Call of Cthulhu’s look: a manila case file, typed fields, a rubber stamp for the status, leads instead of objectives, the clues a place hides and the skill that finds them, and the Sanity at stake.',
	research: { cards: [{ t: 'Scenarios and the Keeper', li: [['A scenario is an investigation: the Keeper knows the truth, the investigators follow leads. Clues are found with skills (Library Use, Spot Hidden).', CQSRC('CoC 7e Keeper Rulebook: Clues')], ['Horrors cost Sanity as “success/failure” (0/1d6).', CQSRC('CoC 7e: Sanity')]] }], borrow: ['The case file: manila, a tab, typed labels', 'A stamp for Open / Closed / Cold', 'Leads, clues by skill, Sanity at stake'], avoid: ['Fantasy words: quest, reward, loot'], direction: ['<b>The Keeper’s case files.</b> The same cards, in the language of an investigation.'] },
	questSub: 'A quest is a case: retained by, where, the fee, leads, the Sanity at stake, and the Keeper’s truth.',
	placeSub: 'Harrow House: who’s there, the clues it hides and the skill that finds each, where it leads.',
	sessionSub: 'Day 3 of the investigation: who was there, what was found, the Sanity it cost.',
	campaign: { name: 'The Harrow House Affair', next: 'Day 4', emblem: 'eye', role: 'Keeper', words: { quest: 'Case', quests: 'Cases' }, chapters: [['Arkham, October 1924', 8]], open: [['The disappearance of Edith Harrow', 'active', true], ['The Dunwich letters', 'active'], ['The drowned sailor', 'failed']], sections: [['book', 'Investigation log', 3], ['users', 'People', 11], ['castle', 'Places', 6], ['shield', 'Investigators', 3], ['skull', 'Things', 2]] },
	quest: { title: 'The disappearance of Edith Harrow', path: 'Campaigns / Harrow House / Cases / Edith Harrow', kicker: 'Case file · Arkham, 1924', kickIcon: 'book', status: 'active', statusText: 'Open', giver: 'Silas Harrow', giverLabel: 'Retained by', where: 'Harrow House', reward: '$40 and expenses', rewardIcon: 'flag', rewardLabel: 'Fee', objLabel: 'Leads',
		objectives: [['The maid saw Edith go down to the cellar', true], ['A library card for the Miskatonic restricted stacks', true], ['Who rents the boathouse?', false]],
		extra: () => CQ.sanity('0/1d6 · what waits under the cellar'),
		secret: 'Edith went willingly. The thing under the cellar has been teaching her to breathe water.',
		prose: [CQ.h2('Keeper’s notes'), CQ.p('Silas lies about the last time he saw his sister. The library card leads to [[Miskatonic University Library]], where Edith read the same book three times.')] },
	place: { name: 'Harrow House', kicker: 'Place · Arkham, French Hill', emblem: 'castle', facts: [['flag', 'Owner', 'Silas Harrow'], ['clock', 'Open', 'By invitation']],
		extra: () => CQ.clues([['Spot Hidden', 'Wet footprints on the cellar stair, going down only', true], ['Library Use', 'Edith’s diary, hidden in the study’s false-bottomed drawer', false], ['Listen', 'Something breathing under the cellar floor at night', false]]),
		here: ['Silas Harrow', 'Mrs. Pike, the maid'], leads: ['The boathouse', 'Miskatonic University Library'], secret: 'The cellar floor is newer than the house.',
		prose: [CQ.h2('Description'), CQ.p('A narrow brick house on French Hill. Every clock has stopped at 3:10. [[Mrs. Pike]] won’t go below the ground floor.')] },
	session: { title: 'The cellar stair', kicker: 'Log · Day 3 · 14 Oct 1924', party: ['Eleanor Vance', 'Joe Kowalski', 'Ruth Abbot'], atLabel: 'Investigators',
		extra: () => CQ.sanLost([['Vance', '−3'], ['Kowalski', '0'], ['Abbot', '−1']]),
		recap: ['Searched the cellar; found the footprints.', 'Kowalski broke into the boathouse. Empty, but wet.', 'Vance read three pages of Edith’s book and stopped.'],
		recapLabel: 'Findings', threads: [['The disappearance of Edith Harrow', 'New lead', 'up'], ['The drowned sailor', 'Gone cold', 'failed']], threadsLabel: 'Cases', loot: null, nextUp: 'Night watch at the boathouse.', nextLabel: 'Next' },
});

/* ---------- Daggerheart: Environments and countdowns ---------- */
CQ.countdown = (name, left, max, note) => h('div.cq-count', h('div.cq-count-h', icon('hourglass', 14), h('b', name), h('small', note)), h('div.cq-pips', Array.from({ length: max }, (_, i) => h('i' + (i < max - left ? '.on' : '')))), h('small.cq-cleft', `${left} left`));
CQ.environment = e => h('div.cq-env',
	h('div.cq-env-h', h('span.tier', `Tier ${e.tier}`), h('b', e.type), h('span.diff', h('small', 'Difficulty'), h('b', String(e.difficulty)))),
	h('div.cq-env-i', h('small', 'Impulses'), h('span', e.impulses)),
	h('div.cq-env-i', h('small', 'Potential adversaries'), h('span', e.adversaries)),
	e.features.map(([n, kind, t]) => h('div.cq-env-f', h('b', n), h('span.kind.is-' + kind.toLowerCase(), kind), h('span', t))));
CQ.fearLeft = (fear, hope) => h('div.cq-fear', h('span', h('small', 'Fear at the end'), h('b', String(fear))), h('span', h('small', 'Hope spent'), h('b', String(hope))));
DEFS.dh.campaign = CQ.section('dh', {
	lede: 'The Campaign panel, a quest, a location and a session log in Daggerheart’s look: gold rules and filigree, navy ink, a quest with a countdown, and a location written as the book writes an Environment (tier, type, difficulty, impulses, features).',
	research: { cards: [{ t: 'Environments and countdowns', li: [['Places that act are Environments: a tier and type (exploration, social, traversal, event), a difficulty, impulses, potential adversaries and features (passive, action, reaction).', CQSRC('Daggerheart Core: Environments')], ['Countdowns tick toward something happening; the GM shows or hides them.', CQSRC('Daggerheart Core: Countdowns')]] }], borrow: ['The Environment block for a location', 'A countdown on a quest', 'Gold rules, navy ink, the card look'], avoid: ['Quest XP (Daggerheart has none)'], direction: ['<b>The GM’s cards.</b> Every note reads like a Daggerheart card.'] },
	questSub: 'A quest with a countdown (The Long Night, 3 of 6 left) under its facts.',
	placeSub: 'The Glimmerwood Shallows as an Environment: tier, type, difficulty, impulses, adversaries, features.',
	sessionSub: 'Session 4: who played, what happened, Fear at the end and Hope spent.',
	campaign: { name: 'Embers of Vel', next: 'Session 5', emblem: 'flame', words: { quest: 'Quest', quests: 'Quests' }, chapters: [['Act I: The Long Night', 5]], open: [['Light the seven beacons', 'active', true], ['The ferryman’s price', 'active'], ['Ivo’s brother', 'done']], sections: [['book', 'Sessions', 4], ['users', 'NPCs', 8], ['castle', 'Environments', 5], ['shield', 'Party', 4], ['skull', 'Adversaries', 10]] },
	quest: { title: 'Light the seven beacons', path: 'Campaigns / Embers of Vel / Quests / Light the seven beacons', kicker: 'Quest · Act I', status: 'active', statusText: 'Active', giver: 'Warden Ashe', where: 'The Beacon Road', reward: 'The Wardens’ favour', rewardIcon: 'sparkle',
		extra: () => CQ.countdown('The Long Night', 3, 6, 'ticks each night unlit'),
		objectives: [['Light the beacon at Hollow Ford', true], ['Light the beacon at Glimmerwood', true], ['Reach the beacon on Cinder Tor', false]],
		secret: 'Ashe knows the seventh beacon was never built.',
		prose: [CQ.h2('Notes'), CQ.p('Every unlit night the dark comes a mile closer to [[Vel]]. The ferryman at [[The Glimmerwood Shallows]] wants a memory for the crossing.')] },
	place: { name: 'The Glimmerwood Shallows', kicker: 'Environment · The Beacon Road', emblem: 'sparkle', facts: null,
		extra: () => CQ.environment({ tier: 1, type: 'Traversal', difficulty: 11, impulses: 'Lure travellers off the path; hide the drowned beacon', adversaries: 'Glimmer wisps, a mire hag, the ferryman',
			features: [['Lantern lights', 'Passive', 'Lights float above the water. A PC who follows one must mark a Stress or lose the path.'], ['The water rises', 'Action', 'Spend a Fear: the shallows rise to the waist. Movement through them is a Difficulty 12 Agility roll.'], ['The ferryman’s price', 'Reaction', 'When a PC asks to cross, the ferryman asks for a memory they will lose.']] }),
		here: ['The ferryman', 'Mire hag'], leads: ['Hollow Ford', 'Cinder Tor'], secret: 'The ferryman is the first beacon’s keeper, drowned.',
		prose: [] },
	session: { title: 'The ferryman’s price', kicker: 'Session 4 · 13 November', party: ['Sable', 'Kestrel', 'Ivo', 'Marigold'],
		extra: () => CQ.fearLeft(5, 7),
		recap: ['Crossed the Shallows; Kestrel gave the ferryman a memory of her mother.', 'Lit the Glimmerwood beacon.', 'The mire hag followed us out.'],
		threads: [['Light the seven beacons', 'Advanced', 'up'], ['Ivo’s brother', 'Done', 'done']], loot: ['A lantern that won’t go out', '2 handfuls of gold'], nextUp: 'Cinder Tor, before the Long Night ends.' },
});

/* ---------- Pathfinder 2e: settlements, traits, XP ---------- */
CQ.traits = list => h('div.cq-traits', [...list].sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0)).map(([t, rare]) => h('span' + (rare ? '.is-' + rare : ''), t)));
CQ.settlement = s => h('div.cq-settle',
	h('div.cq-settle-h', h('span', `Settlement ${s.level}`), CQ.traits(s.traits)),
	s.rows.map(([k, v]) => h('div.cq-settle-r', h('b', k), ' ', v)));
CQ.xp = (gain, total, level) => h('div.cq-xp', h('span', h('small', 'XP this session'), h('b', `+${gain}`)), h('span.bar', h('i', { style: { width: (total / 10) + '%' } })), h('small', `Level ${level} · ${total} / 1000`));
DEFS.pf.campaign = CQ.section('pf', {
	lede: 'The Campaign panel, a quest, a location and a session log in Pathfinder’s look: maroon trait boxes, Marcellus small caps, a location with the book’s settlement line (level, traits, government, population), and XP on the session.',
	research: { cards: [{ t: 'Settlements and XP', li: [['Settlements have a stat block: a name and level, traits, government, population, languages, religions, threats, and its people.', CQSRC('GM Core: Settlements')], ['Parties earn XP for encounters and story; 1,000 XP is a level.', CQSRC('Player Core: Experience')]] }], borrow: ['The settlement line for a location', 'Trait boxes', 'XP gained on the session log'], avoid: ['Plain lists where the book uses a stat block'], direction: ['<b>The book’s blocks, everywhere.</b> Locations read like settlement entries.'] },
	questSub: 'A quest with its traits and the party level it’s meant for.',
	placeSub: 'Brindlemark with its settlement line: level, traits, government, population, languages, religions.',
	sessionSub: 'Session 9: XP gained, the party’s progress to level 4.',
	campaign: { name: 'The Ashen Crown', next: 'Session 10', emblem: 'crown', words: { quest: 'Quest', quests: 'Quests' }, chapters: [['Book 1: Salt and Cinders', 10]], open: [['Escort the salt caravan', 'active', true], ['The lamplighters’ strike', 'active'], ['A crown of ash', 'active']], sections: [['book', 'Sessions', 9], ['users', 'NPCs', 15], ['castle', 'Locations', 8], ['shield', 'Party', 4], ['skull', 'Creatures', 18]] },
	quest: { title: 'Escort the salt caravan', path: 'Campaigns / The Ashen Crown / Quests / Escort the salt caravan', kicker: 'Quest · Book 1', status: 'active', statusText: 'Active', giver: 'Factor Imrie', where: 'Brindlemark', reward: '75 gp and a +1 striking rune', rewardIcon: 'sparkle',
		extra: () => h('div.cq-pfline', h('span.cq-lvl', 'Party level 3'), CQ.traits([['Escort'], ['Uncommon', 'uncommon']])),
		objectives: [['Meet the caravan at Brindlemark', true], ['Cross the Ashfall Flats', false], ['Deliver the salt to Kettering', false]],
		secret: 'Half the barrels hold no salt: Imrie is smuggling cinderdust.',
		prose: [CQ.h2('Notes'), CQ.p('[[Factor Imrie]] pays half up front. The road through the [[Ashfall Flats]] has been quiet for a month, which worries the drivers more than raids would.')] },
	place: { name: 'Brindlemark', kicker: 'Location · The Salt Road', emblem: 'castle', facts: null,
		extra: () => CQ.settlement({ name: 'Brindlemark', level: 4, traits: [['Town'], ['Human'], ['Halfling']], rows: [['Government', 'Council of factors'], ['Population', '1,240'], ['Languages', 'Common, Halfling'], ['Religions', 'Erastil, Abadar'], ['Threats', 'Cinderdust smugglers; the Flats’ ash storms']] }),
		here: ['Factor Imrie', 'Captain Hale'], leads: ['Ashfall Flats', 'Kettering'], secret: 'The council knows about the cinderdust and takes a cut.',
		prose: [CQ.h2('Description'), CQ.p('A salt town on a crossroads, all warehouses and wagon yards. [[Captain Hale]] runs the caravan guard and drinks at the Brine & Barrel.')] },
	session: { title: 'Ash hounds at first camp', kicker: 'Session 9 · 15 November', party: ['Aldric', 'Nim', 'Sorrel', 'Yara'],
		extra: () => CQ.xp(120, 640, 3),
		recap: ['Met Imrie; took the job.', 'Fought off ash hounds at the first camp.', 'Nim noticed a barrel that doesn’t slosh.'],
		threads: [['Escort the salt caravan', 'Advanced', 'up'], ['The lamplighters’ strike', 'New', 'new']], loot: ['3 lesser healing potions', '42 gp', 'Ash hound pelts'], nextUp: 'Across the Ashfall Flats.' },
});
