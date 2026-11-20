/* ============================================================================
   The shared model. One shape of encounter for every game; each game fills in
   the parts it uses. The panels below are drawn from these objects.
   ========================================================================== */

const clone = o => JSON.parse(JSON.stringify(o));

/** Turn order for 'order' fights (5e, PF2e, CoC): highest first, then the dragged tiebreak. */
function ordered(enc) {
	return enc.combatants.filter(c => c.order).slice().sort((a, b) => (b.order.value - a.order.value) || ((a.order.tie || 0) - (b.order.tie || 0)));
}
const isOut = c => c.status === 'dead' || c.status === 'out';
const byId = (enc, id) => enc.combatants.find(c => c.id === id);

/**
 * Who comes after the active combatant, wrapping into the next round, with a
 * marker where the round turns over. Defeated creatures are left out.
 */
function queue(enc) {
	const list = ordered(enc).filter(c => !isOut(c));
	const i = list.findIndex(c => c.id === enc.turn.activeId);
	const after = list.slice(i + 1), before = list.slice(0, i);
	const out = after.map(c => ({ c }));
	if (before.length || enc.lair) out.push({ round: enc.turn.round + 1 });
	if (enc.lair) out.push({ lair: enc.lair });
	for (const c of before) out.push({ c });
	return out;
}
function nextUp(enc) { const q = queue(enc).find(e => e.c); return q ? q.c : null; }

/* ---------------------------------------------------------------------------
   5e: The Drowned Chapel. Round 2, the hag's turn.
   ------------------------------------------------------------------------- */
const FIGHT_5E = {
	id: 'drowned-chapel', name: 'The drowned chapel', game: '5e',
	turn: { kind: 'order', label: 'Initiative', round: 2, activeId: 'hag', acted: ['ilse'] }, edition: '2024',
	lair: { name: 'Lair action', note: 'Initiative 20: the bog pulls one creature under' },
	combatants: [
		{ id: 'ilse', name: 'Ilse', meta: 'Wizard 5', side: 'party', kind: 'pc', order: { value: 19 }, ac: 13, hp: { value: 22, max: 31 }, conc: 'Hold Person', conds: [{ name: 'Concentrating', icon: 'target', note: 'Hold Person' }] },
		{ id: 'hag', name: 'Bog Hag', meta: 'Legendary · CR 5', side: 'foe', kind: 'legendary', order: { value: 17 }, ac: 17, hp: { value: 64, max: 112 }, legendary: { max: 3, left: 2 }, resist: { max: 3, left: 2 }, conds: [] },
		{ id: 'boss', name: 'Goblin Boss', meta: 'CR 1', side: 'foe', kind: 'monster', order: { value: 15 }, ac: 17, hp: { value: 15, max: 21 }, conds: [{ name: 'Paralyzed', trigger: 'save', note: 'Hold Person, from Ilse. Wisdom save DC 15 at the end of each turn ends it.' }] },
		{ id: 'corin', name: 'Corin', meta: 'Cleric 5', side: 'party', kind: 'pc', order: { value: 14 }, ac: 18, hp: { value: 8, max: 38 }, conds: [{ name: 'Poisoned', rounds: 1 }] },
		{ id: 'gob1', name: 'Goblin A', meta: 'CR ¼', side: 'foe', kind: 'monster', order: { value: 12, tie: 0 }, ac: 15, hp: { value: 7, max: 7 }, conds: [] },
		{ id: 'gob2', name: 'Goblin B', meta: 'CR ¼', side: 'foe', kind: 'monster', order: { value: 12, tie: 1 }, ac: 15, hp: { value: 2, max: 7 }, conds: [{ name: 'Prone' }] },
		{ id: 'gob3', name: 'Goblin C', meta: 'CR ¼', side: 'foe', kind: 'monster', order: { value: 12, tie: 2 }, ac: 15, hp: { value: 0, max: 7 }, status: 'dead', conds: [] },
		{ id: 'mara', name: 'Mara', meta: 'Rogue 5', side: 'party', kind: 'pc', order: { value: 8 }, ac: 15, hp: { value: 27, max: 33, temp: 5 }, conds: [{ name: 'Burning', trigger: 'damage', note: '1d4 fire at the start of each turn' }] },
	],
};

/* ---------------------------------------------------------------------------
   Nimble: The copper vaults. Round 2, heroes' turn; Brakka is acting.
   ------------------------------------------------------------------------- */
const FIGHT_NIMBLE = {
	id: 'copper-vaults', name: 'The copper vaults', game: 'nimble',
	turn: { kind: 'sides', round: 2, side: 'heroes', acting: 'brakka', done: ['tamsin'] },
	combatants: [
		{ id: 'brakka', name: 'Brakka', meta: 'Berserker 3', side: 'heroes', kind: 'hero', armor: 4, hp: { value: 21, max: 28 }, wounds: { max: 6, on: 0 }, actions: { max: 3, left: 3 }, conds: [{ name: 'Raging', icon: 'flame' }] },
		{ id: 'tamsin', name: 'Tamsin', meta: 'Mage 3', side: 'heroes', kind: 'hero', armor: 1, hp: { value: 14, max: 18 }, wounds: { max: 6, on: 1 }, actions: { max: 3, left: 0 }, mana: { max: 8, left: 5 }, conds: [] },
		{ id: 'orren', name: 'Orren', meta: 'Oathsworn 3', side: 'heroes', kind: 'hero', armor: 9, hp: { value: 30, max: 30 }, wounds: { max: 6, on: 0 }, actions: { max: 3, left: 3 }, conds: [] },
		{ id: 'wren', name: 'Wren', meta: 'Hunter 3', side: 'heroes', kind: 'hero', armor: 3, hp: { value: 0, max: 20 }, wounds: { max: 6, on: 2 }, actions: { max: 1, left: 1 }, status: 'dying', conds: [{ name: 'Dying', bad: true }] },
		{ id: 'alch', name: 'The Alchemist', meta: 'Legendary · Level 5', side: 'monsters', kind: 'legendary', armorType: 'medium', hp: { value: 60, max: 96 }, bloodied: 48, lastStand: 7, actionsAfter: [{ name: 'Quicksilver spray', dice: '2d6', note: 'Range 6, one target' }, { name: 'Transmute', dice: '', note: 'Turn 1 hero\u2019s armor to lead: Slowed', last: true }], conds: [] },
		{ id: 'task', name: 'Goblin Taskmaster', meta: 'Level 3', side: 'monsters', kind: 'monster', armorType: 'medium', hp: { value: 22, max: 34 }, conds: [{ name: 'Dazed', rounds: 1 }] },
		{ id: 'hound', name: 'Quicksilver Hound', meta: 'Level 1', side: 'monsters', kind: 'monster', armorType: 'none', hp: { value: 10, max: 16 }, conds: [{ name: 'Smoldering', value: 2, trigger: 'damage' }] },
		{ id: 'rats', name: 'Copper rats', meta: 'Minions · Level ½', side: 'monsters', kind: 'minions', armorType: 'none', group: { count: 5, alive: 3, die: 6 }, conds: [] },
	],
};

/* ---------------------------------------------------------------------------
   Call of Cthulhu: The Ashcombe farmhouse. Round 2, the ghoul's turn.
   ------------------------------------------------------------------------- */
const FIGHT_COC = {
	id: 'ashcombe', name: 'The Ashcombe farmhouse', game: 'coc',
	turn: { kind: 'order', label: 'DEX', round: 2, activeId: 'ghoul', acted: ['harriet', 'cult1', 'jonah'] },
	combatants: [
		{ id: 'harriet', name: 'Harriet Cole', meta: 'Antiquarian', side: 'party', kind: 'pc', order: { value: 110, dex: 60, readied: '.38 revolver' }, hp: { value: 9, max: 11 }, san: { value: 52, start: 60 }, luck: 45, mp: 12, conds: [] },
		{ id: 'cult1', name: 'Cultist with a shotgun', meta: '', side: 'foe', kind: 'npc', order: { value: 100, dex: 50, readied: 'Shotgun' }, hp: { value: 11, max: 11 }, armor: 0, conds: [] },
		{ id: 'jonah', name: 'Jonah Pike', meta: 'Journalist', side: 'party', kind: 'pc', order: { value: 70, dex: 70 }, hp: { value: 5, max: 12 }, major: true, san: { value: 44, start: 55 }, luck: 60, mp: 10, conds: [{ name: 'Major wound', bad: true }, { name: 'Prone' }] },
		{ id: 'ghoul', name: 'Ghoul', meta: 'Corpse-eater', side: 'foe', kind: 'monster', order: { value: 65, dex: 65 }, hp: { value: 9, max: 13 }, armor: 'Guns do half', sanLoss: '0/1d6', attacks: 'Claws 1d6 + 1d4 · Bite 1d4', conds: [] },
		{ id: 'cult2', name: 'Cultist with a knife', meta: '', side: 'foe', kind: 'npc', order: { value: 55, dex: 55 }, hp: { value: 0, max: 10 }, status: 'out', conds: [] },
		{ id: 'amos', name: 'Prof. Amos Wray', meta: 'Professor', side: 'party', kind: 'pc', order: { value: 40, dex: 40 }, hp: { value: 0, max: 10 }, major: true, status: 'dying', san: { value: 58, start: 61 }, luck: 35, mp: 13, conds: [{ name: 'Dying', bad: true }] },
	],
};

/* ---------------------------------------------------------------------------
   Daggerheart: Thornwatch bridge. The players hold the spotlight; Kael acts.
   ------------------------------------------------------------------------- */
const FIGHT_DH = {
	id: 'thornwatch', name: 'Thornwatch bridge', game: 'dh',
	turn: { kind: 'spotlight', holder: 'players', spotlit: 'kael', fear: 5, fearMax: 12 },
	countdowns: [{ name: 'The bridge gives way', left: 3, max: 6 }, { name: 'Reinforcements', left: 2, max: 4 }],
	combatants: [
		{ id: 'kael', name: 'Kael', meta: 'Guardian 2', side: 'party', kind: 'pc', evasion: 9, thresholds: [9, 17], hp: { max: 7, marked: 2 }, stress: { max: 6, marked: 1 }, hope: { max: 6, on: 3 }, armor: { max: 4, marked: 2 }, spot: 2, conds: [] },
		{ id: 'nim', name: 'Nim', meta: 'Rogue 2', side: 'party', kind: 'pc', evasion: 13, thresholds: [6, 12], hp: { max: 6, marked: 1 }, stress: { max: 6, marked: 3 }, hope: { max: 6, on: 4 }, armor: { max: 3, marked: 0 }, spot: 1, conds: [{ name: 'Hidden' }] },
		{ id: 'maren', name: 'Maren', meta: 'Sorcerer 2', side: 'party', kind: 'pc', evasion: 10, thresholds: [5, 11], hp: { max: 6, marked: 5 }, stress: { max: 6, marked: 6 }, hope: { max: 6, on: 1 }, armor: { max: 3, marked: 3 }, spot: 1, conds: [{ name: 'Vulnerable', bad: true }] },
		{ id: 'tobin', name: 'Tobin', meta: 'Ranger 2', side: 'party', kind: 'pc', evasion: 12, thresholds: [7, 14], hp: { max: 6, marked: 0 }, stress: { max: 6, marked: 2 }, hope: { max: 6, on: 5 }, armor: { max: 3, marked: 1 }, spot: 0, conds: [] },
		{ id: 'brute', name: 'Bramble brute', meta: 'Bruiser, tier 1', side: 'foe', kind: 'adversary', difficulty: 13, thresholds: [8, 15], hp: { max: 7, marked: 3 }, stress: { max: 3, marked: 1 }, atk: '+3', conds: [{ name: 'Restrained', rounds: undefined }] },
		{ id: 'archers', name: 'Thorn archers', meta: 'Ranged, tier 1', side: 'foe', kind: 'adversary', difficulty: 12, thresholds: [4, 9], hp: { max: 3, marked: 1 }, stress: { max: 2, marked: 0 }, atk: '+2', count: 2, conds: [] },
		{ id: 'bandits', name: 'Bandit lackeys', meta: 'Minion, tier 1', side: 'foe', kind: 'minion', difficulty: 10, group: { count: 6, alive: 4, per: 4 }, atk: '+0', conds: [] },
	],
};

/* ---------------------------------------------------------------------------
   PF2e: The sunken shrine. Round 3, the skeletal champion's turn.
   ------------------------------------------------------------------------- */
const FIGHT_PF = {
	id: 'sunken-shrine', name: 'The sunken shrine', game: 'pf',
	turn: { kind: 'order', label: 'Initiative', round: 3, activeId: 'champ', threat: 'Severe', acted: ['valka'] },
	combatants: [
		{ id: 'valka', name: 'Valka', meta: 'Fighter 4', side: 'party', kind: 'pc', order: { value: 23, skill: 'Perception' }, ac: 22, hp: { value: 41, max: 64 }, actions: { max: 3, used: 0 }, reaction: true, conds: [{ name: 'Persistent fire', value: '1d6', trigger: 'damage', note: 'End of turn: take 1d6 fire, then a DC 15 flat check ends it' }] },
		{ id: 'champ', name: 'Skeletal champion', meta: 'Creature 2', side: 'foe', kind: 'monster', order: { value: 19, skill: 'Perception' }, ac: 19, hp: { value: 25, max: 40 }, actions: { max: 3, used: 1 }, reaction: true, conds: [{ name: 'Frightened', value: 1, note: 'Goes down by 1 at the end of its turn' }] },
		{ id: 'rook', name: 'Rook', meta: 'Rogue 4', side: 'party', kind: 'pc', order: { value: 18, skill: 'Stealth' }, ac: 21, hp: { value: 50, max: 52 }, actions: { max: 3, used: 0 }, reaction: false, conds: [{ name: 'Hidden' }] },
		{ id: 'sela', name: 'Sela', meta: 'Cleric 4', side: 'party', kind: 'pc', order: { value: 15, skill: 'Perception' }, ac: 20, hp: { value: 0, max: 50 }, status: 'dying', actions: { max: 3, used: 0 }, reaction: false, conds: [{ name: 'Dying', value: 2, bad: true }, { name: 'Wounded', value: 1 }] },
		{ id: 'acolyte', name: 'Cult acolyte', meta: 'Creature 1', side: 'foe', kind: 'monster', order: { value: 12 }, ac: 16, hp: { value: 18, max: 18 }, actions: { max: 3, used: 0 }, reaction: true, conds: [] },
		{ id: 'zom1', name: 'Zombie shambler A', meta: 'Creature −1', side: 'foe', kind: 'monster', order: { value: 9, tie: 0 }, ac: 13, hp: { value: 12, max: 20 }, actions: { max: 3, used: 0 }, reaction: false, conds: [{ name: 'Slowed', value: 1 }] },
		{ id: 'zom2', name: 'Zombie shambler B', meta: 'Creature −1', side: 'foe', kind: 'monster', order: { value: 9, tie: 1 }, ac: 13, hp: { value: 0, max: 20 }, status: 'dead', actions: { max: 3, used: 0 }, conds: [] },
		{ id: 'pell', name: 'Pell', meta: 'Wizard 4', side: 'party', kind: 'pc', order: { value: 7, skill: 'Perception' }, ac: 17, hp: { value: 28, max: 38 }, actions: { max: 3, used: 0 }, reaction: true, conds: [{ name: 'Frightened', value: 2 }] },
	],
};

/* ---------------------------------------------------------------------------
   The spec as data, so the Shared page and the panels read the same words.
   ------------------------------------------------------------------------- */
const SPEC = {
	model: `interface Encounter {
  id: string; name: string; game: SystemId;
  phase: 'setup' | 'running' | 'ended';
  turn: TurnState;                 // the one part each game owns
  combatants: Combatant[];
  pools?: Pool[];                  // Fear, legendary actions shared by a side, lair
  countdowns?: Countdown[];        // Daggerheart; any game may use them
  log: LogEntry[];                 // every change, so Back can undo it
}

type TurnState =
  | { kind: 'order';     round: number; activeId: string; label: 'Initiative' | 'DEX' | 'Perception' }
  | { kind: 'sides';     round: number; side: SideId; acting?: string; done: string[] }
  | { kind: 'spotlight'; holder: 'players' | 'gm'; spotlit?: string; fear: number };

interface Combatant {
  id: string; name: string; meta: string;   // "Cleric 5", "Legendary · CR 5"
  side: SideId;                              // party | foe | ally (games name them)
  kind: string;                              // pc, monster, minion, legendary, solo…
  order?: { value: number; base?: number; bonus?: string; tie?: number };
  defense: Stat[];                           // AC 17 · Armor Medium · Evasion 12 · Difficulty 13
  tracks: Track[];                           // HP first; then Stress, Sanity, Wounds…
  resources: Resource[];                     // actions, legendary, Hope, death saves
  conditions: AppliedCondition[];            // core's, with timing
  status: 'ok' | 'down' | 'dying' | 'dead' | 'out';
  group?: { count: number; alive: number };  // minions: one row, many bodies
}

interface Track {                            // a bar or marked slots: same data, two drawings
  id: 'hp' | 'stress' | 'sanity' | 'wounds' | string;
  draw: 'bar' | 'slots' | 'box';         // box: CoC's Max | Current
  value: number; max: number; temp?: number;
  thresholds?: number[];                     // Daggerheart's Major / Severe, CoC's major wound
}
interface Resource { id: string; max: number; left: number; refresh: 'turn' | 'round' | 'rest' }`,
	components: [
		['TurnControl', 'The footer: Back and one primary button that says what comes next ("Next: Mara", "Monsters’ turn", "Pass to the GM").', 'label, next, onBack', 'default, disabled (setup), pending prompt', '--g-accent, --g-on-accent, --g-r-md'],
		['Focus', 'Whoever acts now, at full size: name, defense, HP, resources, conditions, quick actions. Every game has exactly one.', 'combatant, actions[]', 'current, dying, out, legendary', '--g-now, --g-surface, display type'],
		['Row', 'One combatant in the queue: order, name, defense, HP number. Tap to select; drag to reorder.', 'combatant, density', 'default, hover, selected, dragging, dying, out, next', '--g-row, --g-line, --g-text-2'],
		['Track', 'HP and friends. draw="bar" (5e, PF2e, Nimble HP), "slots" (Daggerheart HP and Stress, Nimble Wounds), "box" (CoC\u2019s Max | Current).', 'value, max, temp, thresholds, draw', 'full, low (≤ half), zero, temp, marked', '--g-track, --g-track-low, --g-track-empty, --g-temp'],
		['Pips', 'Resources that refresh: actions, legendary actions and resistances, Hope, death saves. Tap a filled pip to spend one.', 'max, left, tone', 'available, spent, changed (animates)', '--g-pip, --g-accent'],
		['Chip', 'A condition: name, value (Frightened 2), rounds left (hourglass), and an icon when it acts at a turn boundary.', 'condition', 'plain, valued, timed, acts, bad', '--g-chip-bg, --g-chip-text, --g-r-chip'],
		['TurnPrompt', 'At a turn boundary, a sheet rises with what the conditions ask: roll damage, a save, a check.', 'prompts[]', 'pending, rolled, resolved', '--g-surface, --g-accent-text'],
		['HpPad', 'Tap the HP number: a keypad with Damage / Heal / Temp, Crit, and the game’s own working (armor, thresholds).', 'target, mode, rule', 'damage, heal, temp, with working', '--g-surface-2, --g-danger-text'],
		['ConditionPicker', 'Search, pick, then time it: rounds, start or end of whose turn, damage or a save each turn.', 'conditions[], timing', 'searching, picked, timing open', '--g-now, --g-accent-text'],
		['QuickLook', 'Long-press or tap a name: the stat block or sheet in a sheet over the panel.', 'combatant', 'monster, player character', '--g-surface'],
	],
};

const DEFS = {};
