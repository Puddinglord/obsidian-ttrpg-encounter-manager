// What Nimble takes in content packs: every kind of thing the books ship as
// data (monsters, spells, items, classes, subclasses, a class's options,
// ancestries, backgrounds, boons, weapon properties, languages, rules and
// conditions), with the same fields as the bundled files (data/compendium.json,
// data/bestiary.json), so a pack's class is as expressive as a book's. A
// monster can also be given as a `statblock`: the text of a ```nimble block.
// Then the pack's entries as Nimble content, and that content put in front of
// the books. Pure: no Obsidian imports.

import type { PackEntry } from '../../core/content/packs';
import type { FieldSpec, KindSpec } from '../../core/content/spec';
import { BlockSpec, HOMEBREW } from '../../core/content/blocks';
import type { ConditionDef } from '../../core/types';
import type { Ancestry, Background, Boon, ClassEntry, ClassOption, CompendiumData, CompendiumHit, Item, OptionGroup, Property, Spell, Subclass } from './compendium';
import { Compendium, nameKey, STATS } from './compendium';
import { parseStatblock } from './parser';
import { levelValue } from './rules';
import type { ArmorType, NimbleMonster } from './types';

const text = (description?: string, required = false): FieldSpec => ({ type: 'string', required, description });
const int = (o: { min?: number; max?: number; required?: boolean; description?: string } = {}): FieldSpec => ({ type: 'number', integer: true, ...o });
const named = (extra: Record<string, FieldSpec> = {}): Record<string, FieldSpec> => ({ name: text('The name, as references use it.', true), ...extra });
const STAT = ['STR', 'DEX', 'INT', 'WIL'] as const;
/** Text a person wrote (or a number), trimmed; undefined for anything else. */
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const page = int({ min: 1, description: 'The page in the book it comes from, if any.' });

/** A named piece of rules text: a feature, a trait, an action. */
const feature = { name: text(undefined, true), text: text('The rules text. Markdown is fine.', true) };
/** What a feature has you choose, when its words don't name the lists (level-plan.ts reads it). */
const choose: FieldSpec = {
	type: 'object',
	description: 'What the feature has you choose, when its words don\'t say: the option lists to pick from, how many, and choices that can be taken more than once instead.',
	fields: {
		from: { type: 'strings', required: true, description: 'Option lists (the class\'s "optionGroups" by name).' },
		count: int({ min: 1, description: 'How many to choose (1 if left out).' }),
		name: text('A name for the lists together: "Combat Abilities".'),
		or: { type: 'strings', description: 'Choices offered instead, that can be taken more than once: "+1 max Combat Dice".' },
	},
};
/** A stat increase, when the words don't say. */
const increase: FieldSpec = {
	type: 'object',
	description: 'A stat increase, when the words don\'t say "+1 STR or DEX": the stats it can go to (STR, DEX, INT, WIL), and how many different ones get +1.',
	fields: { stats: { type: 'strings', required: true }, count: int({ min: 1, max: 4, description: 'How many different stats get +1 (1 if left out).' }) },
};
/** Spell schools and Utility Spells to learn, when the words don't say. */
const learn: FieldSpec = {
	type: 'list',
	description: 'Spell schools or Utility Spells it has you learn, when the words don\'t say: "school" learns a school, "utilities" every Utility Spell of one school, "utility" Utility Spells one by one.',
	of: {
		kind: { type: 'string', enum: ['school', 'utilities', 'utility'], required: true },
		from: { type: 'strings', description: 'Schools by name, or one of "known", "new" (a school not known yet) or "any". Any school if left out.' },
		count: int({ min: 1, description: 'How many (1 if left out).' }),
		each: { type: 'boolean', description: 'One for each school the hero knows.' },
	},
};
/** What a feature gives outright, when the words don't say "You know all …". */
const knows: FieldSpec = {
	type: 'object',
	description: 'What the feature gives outright, when the words don\'t say "You know all …": every option of some lists, options by name, and every Utility Spell of some schools.',
	fields: {
		lists: { type: 'strings', description: 'Option lists it gives every option of ("Chimeric Boons").' },
		options: { type: 'strings', description: 'Options it gives, by name.' },
		utility: { type: 'strings', description: 'Schools whose Utility Spells it gives, or "known" for every school the hero knows.' },
	},
};
const levels: FieldSpec = {
	type: 'list',
	description: 'What each level brings. A feature called "Subclass" offers the subclass; "Key Stat Increase" with "+1 STR or DEX." raises a stat; "Choose 1 Kindling" picks from the option list of that name. When the words don\'t say, a feature can: `choose`, `increase`, `learn`, `uses`, `spellTier`, `unlock`, `knows`, `boon`.',
	of: {
		level: int({ min: 1, max: 20, required: true }),
		features: {
			type: 'list', required: true,
			of: {
				...feature, choose, increase, learn,
				uses: text('Uses between Safe Rests, when the words don\'t say "(1/Safe Rest)": a number or a formula, "WIL", "2×WIL".'),
				spellTier: int({ min: 0, max: 9, description: 'The highest spell tier the hero casts from this level, when the feature isn\'t called "Tier 2 Spells".' }),
				unlock: { type: 'strings', description: 'Option lists it opens, when the words don\'t say "Unlock Greater Psionic Abilities": picks from a list then offer every tier of it open so far.' },
				knows,
				boon: { type: 'string', enum: ['epic', 'lodging', 'other'], description: 'It has you choose a boon of this type, when the words don\'t say "Choose an Epic Boon".' },
			},
		},
	},
};
const option = { name: text(undefined, true), text: text(undefined, true), cost: text('"Passive", "1 Action", "Reaction".'), requirement: text('"Req. level 5".') };
const optionGroups: FieldSpec = {
	type: 'list',
	description: 'Lists the class chooses from as it levels ("Savage Arsenal"): a feature saying "Choose 1 …" with the list\'s name picks from it.',
	of: { name: text(undefined, true), intro: text(), options: { type: 'list', required: true, of: option } },
};
const sidebars: FieldSpec = { type: 'list', of: { title: text(undefined, true), text: text(undefined, true) } };
const casting: FieldSpec = {
	type: 'object',
	description: 'Spellcasting: the mana pool and the schools the class knows.',
	fields: {
		mana: text('How the book writes the pool: "(INT×3)+LVL".'),
		manaFormula: text('The pool as a formula of STR, DEX, INT, WIL, KEY and LVL: "INT*3+LVL".'),
		manaFromLevel: int({ min: 1, max: 20, description: 'The level the pool starts at.' }),
		schools: { type: 'strings', description: 'Spell schools known from level 1.' },
		notes: text(),
	},
};
/** How a class's dice behave at the table (resource-def.ts has the books' own). */
const dice: FieldSpec = {
	type: 'object',
	description: 'For dice: how they\'re rolled and what they go into. Without it they\'re a plain count.',
	fields: {
		rolled: { type: 'string', enum: ['spent', 'gained'], required: true, description: '"spent": rolled with the roll they go into (Judgment Dice); "gained": rolled as you gain them and set aside (Fury Dice).' },
		addTo: { type: 'strings', description: 'Rolls they can go into: attack, spell, save, check.' },
		use: { type: 'string', enum: ['one', 'any', 'all'], description: 'How many go into one roll: one, any number, or every die held.' },
		keep: { type: 'boolean', description: 'They stay after the roll (Fury Dice add to every attack while Raging).' },
		on: { type: 'boolean', description: 'Switched on in the roll dialog from the start.' },
		onWhile: text('Switched on while the hero has this condition: "Raging".'),
		damageType: text('"fire": shown with the dice.'),
		gain: int({ min: 1, description: 'Dice gained at once with the sheet\'s button.' }),
		gainLabel: text('The button\'s word: "Rage".'),
		reachOnly: { type: 'boolean', description: 'Only melee and Reach attacks, not ranged ones.' },
		clearsOnRest: { type: 'boolean', description: 'Gone after a fight, so empty after a Safe Rest.' },
		byLevel: { type: 'list', description: 'The die from each level on.', of: { level: int({ min: 1, max: 20, required: true }), die: text('"d8"', true) } },
		rules: { type: 'strings', description: 'The class features whose words explain these dice.' },
		maxSteps: { type: 'list', description: 'The most held grows: "add" more from a level, for one subclass only when it names one.', of: { level: int({ min: 1, max: 20, required: true }), add: int({ required: true }), subclass: text() } },
	},
};
const resources: FieldSpec = {
	type: 'list',
	description: 'What the class panel on the sheet counts: dice, uses, points.',
	of: {
		name: text(undefined, true),
		max: text('A number, or a formula of STR, DEX, INT, WIL, KEY and LVL: "WIL", "5×LVL".'),
		reset: text('"Safe Rest", "encounter", "Rage ends".'),
		die: text('"d6", for dice.'),
		dice,
		spend: text('The word on a number\'s button: "Heal" (Lay on Hands). "Spend" if left out.'),
	},
};
/** States the class panel switches, and a target it keeps. */
const states: FieldSpec = {
	type: 'list',
	description: 'States the class panel switches on and off: Rage puts Raging on the hero.',
	of: { name: text('The row\'s name: "Rage".', true), condition: text('The condition it puts on the hero: "Raging".', true), feature: text('The feature whose words explain it.'), level: int({ min: 1, max: 20, description: 'From this level (1 if left out).' }) },
};
const target: FieldSpec = {
	type: 'object',
	description: 'A target the class panel keeps, one at a time: Hunter\'s Mark\'s Quarry.',
	fields: { name: text('The row\'s name: "Hunter\'s Mark".', true), feature: text('The feature whose words explain it.'), level: int({ min: 1, max: 20 }), tip: text('"one Quarry at a time, for a day".') },
};
const subclassFields = {
	flavor: text(), complexity: int({ min: 1, max: 4 }), story: { type: 'boolean', description: 'A story subclass.' } as FieldSpec, intro: text(),
	levels, optionGroups, sidebars, casting,
	lose: { type: 'strings', description: 'Its class\'s option lists it gives up, when the words don\'t say "You lose access to …".' } as FieldSpec,
	instead: {
		type: 'list', description: 'A list chosen in another\'s place, when the words don\'t say "Whenever you could choose a Combat Tactic, instead choose …".',
		of: { from: text('The class\'s list: "Combat Tactics".', true), to: text('The list chosen instead.', true) },
	} as FieldSpec,
	companions: { type: 'strings', description: 'Its own option lists that are companions (a Beastmaster\'s): one is chosen with the subclass.' } as FieldSpec,
	page,
};

export const KINDS_NIMBLE: KindSpec[] = [
	{
		kind: 'monster', label: 'Monster', description: 'A stat block. Give the fields, or "statblock" with the text of a ```nimble block.',
		fields: named({
			statblock: text('The whole stat block in the ```nimble block format, instead of the fields below.'),
			level: text('"3", "1/2". Minions can leave it out.'),
			role: { type: 'string', enum: ['regular', 'minion', 'legendary', 'solo'], description: 'Regular if left out. Solo is the Monsters & More word for legendary.' },
			size: text('Tiny, Small, Medium, Large, Huge or Gargantuan.'), type: text('"Undead", "Goblin".'),
			group: text('The family heading in a bestiary: "Goblins".'), habitat: text(),
			armor: { type: 'string', enum: ['none', 'medium', 'heavy'], description: 'None if left out.' },
			hp: int({ min: 1 }), hpPerHero: int({ min: 1, description: 'Legendary monsters: HP for each hero.' }),
			speed: int({ min: 0, description: 'Spaces; 6 if left out.' }), fly: int({ min: 0 }), swim: int({ min: 0 }), climb: int({ min: 0 }), burrow: int({ min: 0 }),
			movement: text('Movement as written, instead of the numbers: "6, fly 8 (hover)".'),
			saves: text('"STR+ DEX-", "ALL++".'), minionDie: int({ min: 2, description: 'A minion\'s die: 8 for d8.' }),
			resist: { type: 'strings' }, vuln: { type: 'strings' }, immune: { type: 'strings' },
			senses: text(), languages: text(),
			traits: { type: 'list', of: feature }, actionsIntro: text('The line over the actions: "Choose 1:".'), actions: { type: 'list', of: feature },
			bloodied: text('What happens when it\'s Bloodied.'), lastStand: text('Legendary: its Last Stand.'),
			flavor: text('Lore.'), tactics: { type: 'object', fields: { easier: text(), harder: text() } }, page,
		}),
		check: (v) => {
			if (typeof v.statblock === 'string') return parseStatblock(v.statblock) ? [] : ['"statblock" isn\'t a Nimble stat block: it starts with "name: …"'];
			const out: string[] = [];
			if (v.level !== undefined && levelValue(v.level as string) === null) out.push(`"level" should be a level, like "3" or "1/2" (it says "${str(v.level) ?? ''}")`);
			if (v.role !== 'minion' && v.hp === undefined && v.hpPerHero === undefined) out.push('Give "statblock", or "hp" ("hpPerHero" for a legendary monster)');
			return out;
		},
	},
	{
		kind: 'spell', label: 'Spell', description: 'A spell, as the compendium shows it. A spell with "class" is that class\'s own.',
		fields: named({
			school: text('"Fire", "Radiant", or a class\'s own school.', true), tier: int({ min: 0, max: 9, required: true, description: '0 for a cantrip.' }),
			utility: { type: 'boolean', description: 'A Utility Spell.' }, actions: text('"1 Action", "2 Actions", "Reaction".'), range: text('"Range 8", "Reach 1", "Self".'),
			aoe: text('"Cone 3".'), concentration: text('"Up to 1 minute".'), damage: text('"2d8".'), text: text(undefined, true),
			higherLevels: text('What casting it at a higher tier adds.'), cantripScaling: text('How a cantrip grows with level.'),
			class: text('The class it belongs to, for a class\'s own spells.'), secret: { type: 'boolean', description: 'A GM\'s secret spell (a reward).' }, page,
		}),
	},
	{
		kind: 'item', label: 'Item', description: 'Gear, a weapon, armor, a shield or a magic item.',
		fields: named({
			category: text('weapon, armor, shield, gear, magic, wand, scroll, consumable…', true), subcategory: text('"melee", "ranged", "cloth", "weapon"…'),
			cost: text('"12 gp".'), damage: text('Weapons: "1d8".'), stat: text('Weapons: STR or DEX.'), damageType: text('"slashing".'),
			properties: { type: 'strings', description: '"2-handed", "Thrown 4", "Light".' }, range: text(), armor: text('Armor: "2+DEX", "6".'),
			strength: int({ min: 0, description: 'STR needed.' }), slots: int({ min: 0 }), rarity: text('common, uncommon, rare, very rare, legendary.'),
			rarityText: text('"Rarity varies".'), tier: int({ min: 0 }), charges: text(), flavor: text(), text: text(), page,
		}),
	},
	{
		kind: 'class', label: 'Class', description: 'A whole class, as the class books write one: key stats, saves, Hit Die, gear, levels, option lists, resources and subclasses.',
		fields: named({
			tagline: text('One line: "High-damage, melee-focused class."'),
			motif: text('The motif in its scrollwork: a book class\'s ("Berserker", "Mage"). A plain one if left out.'), flavor: text(), highlights: { type: 'strings' }, complexity: int({ min: 1, max: 4 }),
			keyStats: { type: 'strings', required: true, description: 'One or two of STR, DEX, INT, WIL.' },
			hitDie: int({ min: 4, max: 20, required: true, description: '8 for d8.' }), startingHp: int({ min: 1, required: true }),
			saves: { type: 'object', required: true, fields: { adv: { type: 'string', enum: STAT, required: true }, dis: { type: 'string', enum: STAT, required: true } }, description: 'The save with advantage, and the one with disadvantage.' },
			skillMods: { type: 'map', description: 'Skilled Hero adjustments: { "Might": 2, "Finesse": -2 }.' },
			armor: text('"Leather, Shields".'), weapons: text('"DEX weapons".'), startingGear: { type: 'strings', description: 'Items by name (the books\' or a pack\'s).' },
			casting, resources, states, target, levels: { ...levels, required: true }, optionGroups, sidebars,
			subclasses: { type: 'list', of: named(subclassFields) },
			spellList: { type: 'strings', description: 'Spells the class can cast besides its schools\', by name.' },
			faq: { type: 'list', of: { q: text(undefined, true), a: text(undefined, true) } }, page,
		}),
		starter: {
			tagline: '', keyStats: ['STR'], hitDie: 8, startingHp: 13, saves: { adv: 'STR', dis: 'INT' }, armor: '', weapons: '', startingGear: [],
			levels: [{ level: 1, features: [{ name: '', text: '' }] }, { level: 3, features: [{ name: 'Subclass', text: 'Choose a subclass.' }] }],
		},
		check: (v) => {
			const stats = (v.keyStats as string[]).map(s => s.toUpperCase());
			const bad = stats.filter(s => !(STATS as string[]).includes(s));
			return bad.length ? [`"keyStats" should be STR, DEX, INT or WIL (it says ${bad.map(b => `"${b}"`).join(', ')})`] : [];
		},
	},
	{
		kind: 'subclass', label: 'Subclass', description: 'A subclass for a class (the books\' or a pack\'s), by the class\'s name.',
		fields: named({ class: text('The class it belongs to: "Berserker".', true), ...subclassFields, levels: { ...levels, required: true } }),
		starter: { class: '', flavor: '', levels: [{ level: 3, features: [{ name: '', text: '' }] }] },
	},
	{
		kind: 'option', label: 'Class option', description: 'One more choice in a class\'s list (a Savage Arsenal ability, a Combat Tactic), by the class\'s and the list\'s names.',
		fields: named({
			class: text('The class: "Berserker".', true), group: text('The list: "Savage Arsenal". A new name makes a new list.', true),
			subclass: text('When the list is a subclass\'s.'), groupIntro: text('The list\'s opening words, for a new list.'),
			text: text(undefined, true), cost: option.cost, requirement: option.requirement, page,
		}),
		starter: { class: '', group: '', cost: '', text: '' },
	},
	{
		kind: 'ancestry', label: 'Ancestry', description: 'An ancestry, with its traits.',
		fields: named({ size: text('"Medium", "Small or Medium".'), rarity: text('common, uncommon, rare.'), flavor: text(), traits: { type: 'list', of: feature }, page }),
		starter: { size: 'Medium', rarity: 'common', flavor: '', traits: [{ name: '', text: '' }] },
	},
	{
		kind: 'background', label: 'Background', description: 'A background.',
		fields: named({ text: text(undefined, true), requirement: text('"Req. 0 or negative INT at character creation."'), category: text(), page }),
		starter: { text: '' },
	},
	{
		kind: 'boon', label: 'Boon', description: 'A boon: an Epic Boon heroes choose at high level, a lodging boon, or another reward.',
		// The boon's own kind is `type`: in a pack, `kind` is the entry's ("boon").
		fields: named({ type: { type: 'string', enum: ['epic', 'lodging', 'other'], description: 'Epic Boons are offered when a class grants one.' }, text: text(undefined, true), requirement: text(), category: text('"Major Boons".'), roll: text(), page }),
		starter: { type: 'epic', text: '' },
	},
	{
		kind: 'property', label: 'Weapon property', description: 'A weapon property items can name ("Thrown 4" finds "Thrown").',
		fields: named({ text: text(undefined, true), page }),
		starter: { text: '' },
	},
	{
		kind: 'language', label: 'Language', description: 'A language heroes can speak.',
		fields: named({ speakers: text('Who speaks it.') }),
		starter: { speakers: '' },
	},
	{
		kind: 'rule', label: 'Rule', description: 'A rule: shown in the compendium\'s Rules tab, and its name is underlined in rules text.',
		fields: named({ text: text(undefined, true), topic: text('"Magic", "Equipment", "Travel". "Rules" if left out.'), page }),
		starter: { topic: 'Rules', text: '' },
	},
	{
		kind: 'condition', label: 'Condition', description: 'A condition the tracker offers, beside the book\'s.',
		fields: named({ text: text(undefined, true), minor: { type: 'boolean', description: 'A minor status that does nothing on its own.' }, value: { type: 'boolean', description: 'Takes a number: "Empowered 2".' } }),
		starter: { text: '' },
	},
];

/** The kinds written as ```nimble-<kind> blocks (spells, items and monsters have their own: ```nimble-spell, ```nimble-item, ```nimble). */
export const NIMBLE_BLOCKS: BlockSpec = {
	prefix: 'nimble', folder: 'Nimble',
	kinds: ['class', 'subclass', 'option', 'ancestry', 'background', 'boon', 'property', 'language', 'rule', 'condition'],
};

// ----------------------------------------------------------------------------
// A pack's entries as Nimble content

/** Where an entry came from, on everything a pack adds (the compendium's tag, the card's source line), and your note, for homebrew. */
interface FromPack { pack: string; note?: string }

export interface PackOption { className: string; subclass?: string; group: string; intro?: string; option: ClassOption }
export interface PackRule { name: string; text: string; topic: string; pack: string; page?: number; note?: string }

/** What the packs a campaign uses add, in order (a later pack wins a name). */
export interface NimbleContent {
	classes: ClassEntry[];
	subclasses: { className: string; subclass: Subclass }[];
	options: PackOption[];
	ancestries: Ancestry[];
	backgrounds: Background[];
	items: Item[];
	spells: Spell[];
	boons: Boon[];
	properties: Property[];
	languages: { name: string; speakers?: string; pack: string }[];
	rules: PackRule[];
	conditions: (ConditionDef & FromPack)[];
	monsters: (NimbleMonster & FromPack)[];
}

export const emptyContent = (): NimbleContent => ({
	classes: [], subclasses: [], options: [], ancestries: [], backgrounds: [], items: [], spells: [], boons: [], properties: [], languages: [], rules: [], conditions: [], monsters: [],
});

/** A monster written field by field, as the bundled bestiary's converter does (bestiary.ts). */
export function packMonster(v: Record<string, unknown>, pack: string): NimbleMonster & FromPack | null {
	if (typeof v.statblock === 'string') {
		const m = parseStatblock(v.statblock);
		return m ? { ...m, name: m.name || String(v.name), source: m.source ?? pack, pack } : null;
	}
	const pairs = (list: unknown) => (Array.isArray(list) ? list as { name: string; text: string }[] : []);
	const role = v.role === 'solo' ? 'legendary' : (v.role as NimbleMonster['role'] | undefined) ?? 'regular';
	const perHero = typeof v.hpPerHero === 'number' ? v.hpPerHero : undefined;
	const move = str(v.movement) ?? [typeof v.speed === 'number' ? String(v.speed) : '6', ...(['fly', 'swim', 'climb', 'burrow'] as const).filter(k => typeof v[k] === 'number' && v[k]).map(k => `${k} ${String(v[k])}`)].join(', ');
	const tactics = v.tactics as { easier?: string; harder?: string } | undefined;
	const list = (x: unknown) => (Array.isArray(x) && x.length ? x as string[] : undefined);
	return {
		name: String(v.name),
		level: str(v.level),
		size: str(v.size),
		type: str(v.type),
		role,
		roleLabel: v.role === 'solo' ? 'Solo' : role === 'legendary' ? 'Legendary' : undefined,
		armor: (str(v.armor)?.toLowerCase() as ArmorType | undefined) ?? 'none',
		hp: perHero ? perHero * 4 : typeof v.hp === 'number' ? v.hp : 0,
		hpPerHero: perHero,
		movement: move,
		saves: str(v.saves),
		minionDie: typeof v.minionDie === 'number' ? v.minionDie : undefined,
		abilities: pairs(v.traits).map(t => ({ name: t.name.trim(), description: t.text.trim() })),
		attacks: pairs(v.actions).map(a => ({ raw: `**${a.name.trim().replace(/[.:]$/, '')}.** ${a.text.trim()}` })),
		actionText: str(v.actionsIntro),
		resistances: list(v.resist), vulnerabilities: list(v.vuln), immunities: list(v.immune),
		senses: str(v.senses), languages: str(v.languages),
		bloodied: str(v.bloodied), lastStand: str(v.lastStand),
		description: str(v.flavor),
		tactics: tactics && (tactics.easier || tactics.harder) ? { easier: tactics.easier || undefined, harder: tactics.harder || undefined } : undefined,
		source: typeof v.page === 'number' ? `${pack} p.${v.page}` : pack,
		group: str(v.group), habitat: str(v.habitat),
		pack,
	};
}

/** Pack entries (in order: later packs win a name) as Nimble content. */
export function contentNimble(entries: (PackEntry & { pack: string })[]): NimbleContent {
	const out = emptyContent();
	const put = <T extends { name: string }>(list: T[], v: T) => {
		const i = list.findIndex(x => nameKey(x.name) === nameKey(v.name));
		if (i >= 0) list[i] = v; else list.push(v);
	};
	for (const e of entries) {
		// Where it's from, for the card and the compendium's tag; your homebrew names its note.
		const from: FromPack = { pack: e.pack, ...(e.file ? { note: e.file } : {}) };
		const v = { ...e.value, source: e.pack, ...from } as Record<string, unknown>;
		switch (e.kind) {
			case 'monster': { const m = packMonster(e.value, e.pack); if (m) put(out.monsters, m); break; }
			case 'spell': put(out.spells, v as unknown as Spell); break;
			case 'item': put(out.items, v as unknown as Item); break;
			case 'class': {
				const c = v as unknown as ClassEntry;
				// Its own subclasses and options are the pack's too.
				put(out.classes, {
					...c, keyStats: c.keyStats?.map(s => s.toUpperCase()),
					subclasses: (c.subclasses ?? []).map(s => ({ ...s, source: e.pack, ...from })),
				});
				break;
			}
			case 'subclass': {
				const { class: className, ...sub } = v;
				const i = out.subclasses.findIndex(s => nameKey(s.className) === nameKey(String(className)) && nameKey(s.subclass.name) === nameKey(e.name));
				const next = { className: String(className), subclass: sub as unknown as Subclass };
				if (i >= 0) out.subclasses[i] = next; else out.subclasses.push(next);
				break;
			}
			case 'option': {
				const { class: className, group, subclass, groupIntro, ...opt } = v;
				out.options.push({ className: String(className), group: String(group), subclass: str(subclass), intro: str(groupIntro), option: opt as unknown as ClassOption });
				break;
			}
			case 'ancestry': put(out.ancestries, { traits: [], ...v } as unknown as Ancestry); break;
			case 'background': put(out.backgrounds, v as unknown as Background); break;
			case 'boon': { const { type, ...b } = v; put(out.boons, { ...b, ...(type ? { kind: type } : {}) } as unknown as Boon); break; }
			case 'property': put(out.properties, v as unknown as Property); break;
			case 'language': put(out.languages, { name: e.name, speakers: str(e.value.speakers), pack: e.pack }); break;
			case 'rule': put(out.rules, { name: e.name, text: String(e.value.text), topic: str(e.value.topic) ?? 'Rules', ...from, page: typeof e.value.page === 'number' ? e.value.page : undefined }); break;
			case 'condition': put(out.conditions, { name: e.name, description: String(e.value.text), ...(e.value.minor ? { minor: true } : {}), ...(e.value.value ? { hasValue: true } : {}), ...from }); break;
		}
	}
	return out;
}

/** Is there anything in it? */
export function hasContent(c: NimbleContent | null | undefined): c is NimbleContent {
	return !!c && Object.values(c).some(list => Array.isArray(list) && list.length > 0);
}

const asList = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/**
 * `base` with `mine` on top: an entry of the same name is replaced where it stands, and new
 * ones go after the rest (the closest one wins, and the books keep their order).
 */
export function onTop<T extends { name: string }>(mine: T[], base: T[]): T[] {
	if (!mine.length) return base;
	const byName = new Map(mine.map(x => [nameKey(x.name), x]));
	const had = new Set(base.map(x => nameKey(x.name)));
	return [...base.map(x => byName.get(nameKey(x.name)) ?? x), ...mine.filter(x => !had.has(nameKey(x.name)))];
}

/** An option put in its list (a new list when there's none of that name). */
function withOption(groups: OptionGroup[] | undefined, o: PackOption): OptionGroup[] {
	const list = asList<OptionGroup>(groups);
	const i = list.findIndex(g => nameKey(g.name) === nameKey(o.group));
	if (i < 0) return [...list, { name: o.group, ...(o.intro ? { intro: o.intro } : {}), options: [o.option] }];
	return list.map((g, k) => (k === i ? { ...g, options: onTop([o.option], asList<ClassOption>(g.options)) } : g));
}

/**
 * The books' data with the packs' content in front: a pack's entry replaces the book's of the
 * same name, subclasses join their class, and options join their class's (or subclass's) list.
 * Classes are copied before they change, so the books' data stays as it was.
 */
export function mergeNimbleData(base: CompendiumData, add: NimbleContent): CompendiumData {
	let classes = onTop(add.classes, asList<ClassEntry>(base.classes));
	if (add.subclasses.length || add.options.length) {
		classes = classes.map(c => {
			const subs = add.subclasses.filter(s => nameKey(s.className) === nameKey(c.name)).map(s => s.subclass);
			const opts = add.options.filter(o => nameKey(o.className) === nameKey(c.name));
			if (!subs.length && !opts.length) return c;
			let subclasses = onTop(subs, asList<Subclass>(c.subclasses));
			let optionGroups = c.optionGroups;
			for (const o of opts) {
				if (o.subclass) subclasses = subclasses.map(s => (nameKey(s.name) === nameKey(o.subclass!) ? { ...s, optionGroups: withOption(s.optionGroups, o) } : s));
				else optionGroups = withOption(optionGroups, o);
			}
			return { ...c, subclasses, optionGroups };
		});
	}
	const rules = { ...(base.rules ?? {}) };
	if (add.languages.length) rules.languages = onTop(add.languages, asList<{ name: string; speakers?: string }>(rules.languages));
	if (add.rules.length) rules.packRules = onTop(add.rules, asList<PackRule>(rules.packRules));
	return {
		...base,
		classes,
		ancestries: onTop(add.ancestries, asList<Ancestry>(base.ancestries)),
		backgrounds: onTop(add.backgrounds, asList<Background>(base.backgrounds)),
		items: onTop(add.items, asList<Item>(base.items)),
		spells: onTop(add.spells, asList<Spell>(base.spells)),
		boons: onTop(add.boons, asList<Boon>(base.boons)),
		properties: onTop(add.properties, asList<Property>(base.properties)),
		rules,
	};
}

// ----------------------------------------------------------------------------
// A block's card

/** What a ```nimble-<kind> block's card shows: a compendium hit (made the way the compendium makes it), a rule, or a condition. */
export type ContentTarget =
	| { hit: CompendiumHit }
	| { rule: { name: string; text: string; topic: string; source: string } }
	| { condition: { name: string; description: string } };

/** A block's entry (only the fields that checked out, maybe) as what its card draws; null when there's nothing to draw. */
export function contentTarget(kind: string, value: Record<string, unknown>, label: string): ContentTarget | null {
	const name = str(value.name) ?? `New ${label.toLowerCase()}`;
	const v: Record<string, unknown> = { ...value, name };
	const said = str(v.text) ?? '';
	switch (kind) {
		case 'rule': return { rule: { name, text: said, topic: str(v.topic) ?? 'Rules', source: HOMEBREW } };
		case 'property': return { rule: { name, text: said, topic: 'Weapon properties', source: HOMEBREW } };
		case 'language': return { rule: { name, text: str(v.speakers) ? `**Speakers.** ${str(v.speakers)}` : '', topic: 'Languages', source: HOMEBREW } };
		case 'condition': return { condition: { name, description: said } };
	}
	const content = contentNimble([{ kind, name, value: v, pack: HOMEBREW }]);
	// A subclass or an option is shown in its class (a stand-in, when it's only named), as the compendium shows it;
	// before the block names its class, on its own.
	const owner = str(v.class);
	if (!owner && kind === 'subclass') return { hit: { kind: 'subclass', name, detail: 'Subclass', text: str(v.flavor), source: HOMEBREW, pack: HOMEBREW, entry: content.subclasses[0]?.subclass ?? v } };
	if (!owner && kind === 'option') return { hit: { kind: 'feature', name, detail: str(v.group) ?? 'Class option', text: said, group: str(v.group), cost: str(v.cost), source: HOMEBREW, pack: HOMEBREW, entry: content.options[0]?.option ?? v } };
	const sub = str(v.subclass);
	const base: CompendiumData = owner && (kind === 'subclass' || kind === 'option') ? { classes: [{ name: owner, ...(sub ? { subclasses: [{ name: sub }] } : {}) }] } : {};
	const want = kind === 'option' ? 'feature' : kind;
	const hit = new Compendium(mergeNimbleData(base, content)).all().find(h => h.kind === want && nameKey(h.name) === nameKey(name) && (kind !== 'option' || !!h.group));
	if (hit) return { hit };
	// An option that names its class but not yet its list.
	return kind === 'option' ? { hit: { kind: 'feature', name, detail: owner ?? 'Class option', text: said, className: owner, source: HOMEBREW, pack: HOMEBREW, entry: v } } : null;
}
