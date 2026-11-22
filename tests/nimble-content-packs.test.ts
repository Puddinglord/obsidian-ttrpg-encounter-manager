// Nimble's content packs: every kind's checks (good entries kept, bad ones left
// out with a reason a person can act on), the example pack read whole, pack
// content put on top of the books (a note beats a pack beats the books; each
// campaign's packs; a subclass joins its class, an option its list), pack
// monsters in the monster index, a hero made and levelled from the example
// pack's class, and the published JSON Schema (UPDATE_SCHEMAS=1 writes it).
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { KindsFor, packSummary, readPack } from '../src/core/content/packs';
import { checkEntry, KindSpec, packSchema } from '../src/core/content/spec';
import { Compendium, CompendiumData } from '../src/systems/nimble/compendium';
import { bundledCompendium, heroCompendium, setContentLayer, setHomebrew } from '../src/systems/nimble/compendium-data';
import { contentNimble, emptyContent, KINDS_NIMBLE, mergeNimbleData, NimbleContent, packMonster } from '../src/systems/nimble/content';
import { readCharacter, safeRest } from '../src/systems/nimble/character-def';
import { applyLevelChoices, increaseKey, LevelChoices, levelPlans, noChoices, pickGroups } from '../src/systems/nimble/level-plan';
import { heroPlans, newCharacterFrontmatter } from '../src/systems/nimble/new-character';
import { classPanelRows } from '../src/systems/nimble/class-panel-def';
import { ruleOf } from '../src/systems/nimble/resource-def';
import { buildEntries } from '../src/systems/nimble/compendium-entries';
import { MonsterIndex } from '../src/systems/nimble/monster-index';
import type { MonsterIndexEntry } from '../src/systems/nimble/types';
import BOOKS from '../src/systems/nimble/data/compendium.json';

const kindsFor: KindsFor = (s) => (s.toLowerCase() === 'nimble' ? { id: 'nimble', name: 'Nimble', kinds: KINDS_NIMBLE } : null);
const EXAMPLE = readFileSync('docs/content/examples/nimble-lantern-road.json', 'utf8');
const example = readPack(EXAMPLE, 'Ember Vault/Content/nimble-lantern-road.json', kindsFor);
const asContent = (p = example) => contentNimble(p.entries.map(e => ({ ...e, pack: p.name })));
const kind = (k: string): KindSpec => KINDS_NIMBLE.find(x => x.kind === k)!;
const why = (k: string, entry: Record<string, unknown>) => checkEntry(kind(k), entry).errors;
const ok = (k: string, entry: Record<string, unknown>) => {
	const c = checkEntry(kind(k), entry);
	expect(c.errors, k).toEqual([]);
	expect(c.warnings, k).toEqual([]);
	return c.value!;
};
/** The books with packs on top, for one path or all. */
const layer = (content: NimbleContent | null, key = 'p') => setContentLayer(content ? () => ({ key, content }) : null);

afterEach(() => { setContentLayer(null); setHomebrew({ spells: [], items: [] }); });

describe('every kind takes a good entry and says why a bad one is left out', () => {
	it('monster: fields or a ```nimble stat block', () => {
		ok('monster', { name: 'Bog Imp', level: '1/2', hp: 9, armor: 'medium', actions: [{ name: 'Bite', text: '1d6+1.' }] });
		ok('monster', { name: 'Imp Swarm', role: 'minion', minionDie: 6 });
		ok('monster', { name: 'Imp Queen', level: 5, role: 'solo', hpPerHero: 30 });
		ok('monster', { name: 'Text Imp', statblock: 'name: Text Imp\nlevel: 1\nhp: 12' });
		expect(why('monster', { name: 'No HP', level: '2' })).toEqual(['Give "statblock", or "hp" ("hpPerHero" for a legendary monster)']);
		expect(why('monster', { name: 'Odd', level: 'huge', hp: 3 })).toEqual(['"level" should be a level, like "3" or "1/2" (it says "huge")']);
		expect(why('monster', { name: 'Shiny', hp: 3, armor: 'plate' })).toEqual(['"armor" should be one of: none, medium, heavy (it says "plate")']);
		expect(why('monster', { name: 'Bad Block', statblock: 'just words' })).toEqual(['"statblock" isn\'t a Nimble stat block: it starts with "name: …"']);
		expect(why('monster', { name: 'Fumble', hp: 3, actions: [{ name: 'Swing' }] })).toEqual(['"actions" item 1: "text" is missing']);
	});
	it('spell', () => {
		ok('spell', { name: 'Spark', school: 'Lightning', tier: 0, text: 'Zap.' });
		expect(why('spell', { name: 'Tierless', school: 'Fire', text: 'x' })).toEqual(['"tier" is missing']);
		expect(why('spell', { name: 'Too High', school: 'Fire', tier: 12, text: 'x' })).toEqual(['"tier" should be at most 9']);
		expect(why('spell', { name: 'Wordless', school: 'Fire', tier: 1 })).toEqual(['"text" is missing']);
	});
	it('item', () => {
		ok('item', { name: 'Hook Spear', category: 'weapon', damage: '1d8', stat: 'STR', properties: ['Reach 2'] });
		expect(why('item', { name: 'Thing' })).toEqual(['"category" is missing']);
		expect(why('item', { name: 'Heavy Thing', category: 'gear', strength: 'lots' })).toEqual(['"strength" should be a number']);
	});
	it('class: key stats, saves, Hit Die, starting HP and levels are what a hero needs', () => {
		const lamplighter = example.entries.find(e => e.kind === 'class')!.value;
		expect(checkEntry(kind('class'), lamplighter).errors).toEqual([]);
		expect(why('class', { name: 'Half', keyStats: ['WIL'], hitDie: 8, startingHp: 13, saves: { adv: 'WIL', dis: 'STR' } })).toEqual(['"levels" is missing']);
		expect(why('class', { name: 'Odd Stats', keyStats: ['CHA'], hitDie: 8, startingHp: 13, saves: { adv: 'WIL', dis: 'STR' }, levels: [] })).toEqual(['"keyStats" should be STR, DEX, INT or WIL (it says "CHA")']);
		expect(why('class', { name: 'Odd Save', keyStats: ['WIL'], hitDie: 8, startingHp: 13, saves: { adv: 'LUCK', dis: 'STR' }, levels: [] })).toEqual(['"saves" "adv" should be one of: STR, DEX, INT, WIL (it says "LUCK")']);
		expect(why('class', { name: 'Odd Dice', keyStats: ['WIL'], hitDie: 8, startingHp: 13, saves: { adv: 'WIL', dis: 'STR' }, levels: [], resources: [{ name: 'Sparks', dice: { rolled: 'sometimes' } }] }))
			.toEqual(['"resources" item 1: "dice" "rolled" should be one of: spent, gained (it says "sometimes")']);
		expect(why('class', { name: 'Odd Level', keyStats: ['WIL'], hitDie: 8, startingHp: 13, saves: { adv: 'WIL', dis: 'STR' }, levels: [{ level: 21, features: [] }] }))
			.toEqual(['"levels" item 1: "level" should be at most 20']);
	});
	it('subclass names its class; option names its class and list', () => {
		ok('subclass', { name: 'Path of Ash', class: 'Berserker', levels: [{ level: 3, features: [{ name: 'Ashen', text: 'x' }] }] });
		expect(why('subclass', { name: 'Orphan', levels: [] })).toEqual(['"class" is missing']);
		ok('option', { name: 'Cleave', class: 'Berserker', group: 'Savage Arsenal', text: 'x' });
		expect(why('option', { name: 'Listless', class: 'Berserker', text: 'x' })).toEqual(['"group" is missing']);
	});
	it('ancestry, background, boon, property, language, rule and condition', () => {
		ok('ancestry', { name: 'Mothfolk', size: 'Small', traits: [{ name: 'Dusty', text: 'x' }] });
		expect(why('ancestry', { name: 'Traitless', traits: [{ text: 'x' }] })).toEqual(['"traits" item 1: "name" is missing']);
		ok('background', { name: 'Ferryman', text: 'x' });
		expect(why('background', { name: 'Blank' })).toEqual(['"text" is missing']);
		// A boon's own kind is `type`: in a pack, `kind` is the entry's.
		ok('boon', { name: 'Undying', type: 'epic', text: 'x' });
		expect(why('boon', { name: 'Odd Boon', type: 'legendary', text: 'x' })).toEqual(['"type" should be one of: epic, lodging, other (it says "legendary")']);
		const boons = readPack(JSON.stringify({ pack: 'B', system: 'nimble', entries: [{ kind: 'boon', name: 'Undying', type: 'epic', text: 'x' }] }), 'b.json', kindsFor);
		expect(boons.rejected).toEqual([]);
		expect(boons.entries.map(e => e.value)).toEqual([{ name: 'Undying', type: 'epic', text: 'x' }]);
		ok('property', { name: 'Brittle', text: 'Breaks on a 1.' });
		ok('language', { name: 'Cant', speakers: 'Thieves.' });
		ok('rule', { name: 'Lamplight', text: 'x', topic: 'Travel' });
		ok('condition', { name: 'Soot-Blind', text: 'x', minor: true });
		expect(why('condition', { name: 'Wordless' })).toEqual(['"text" is missing']);
	});
});

describe('the example pack', () => {
	it('reads whole: nothing left out, nothing ignored', () => {
		expect(example.error).toBeUndefined();
		expect(example.rejected).toEqual([]);
		expect(example.warnings).toEqual([]);
		expect(example.entries.map(e => `${e.kind}:${e.name}`)).toEqual([
			'class:Lamplighter', 'subclass:Keeper of the Night Watch', 'option:Banked Fire', 'ancestry:Emberkin', 'background:Night Watch Veteran',
			'spell:Wickflame', 'spell:Lantern Ward', 'item:Everburning Lantern', 'monster:Wick Wraith',
		]);
		expect(packSummary(example)).toBe('9 entries: 1 class, 1 subclass, 1 option, 1 ancestry, 1 background, 2 spells, 1 item, 1 monster');
	});
	it('a pack with bad entries keeps the rest and says why', () => {
		const p = readPack(JSON.stringify({ pack: 'Mixed', system: 'Nimble', entries: [
			{ kind: 'spell', name: 'Good', school: 'Fire', tier: 1, text: 'x' },
			{ kind: 'class', name: 'Classless', keyStats: ['WIL'] },
			{ kind: 'vehicle', name: 'Cart' },
		] }), 'p.json', kindsFor);
		expect(p.entries.map(e => e.name)).toEqual(['Good']);
		expect(p.rejected.map(r => `${r.at}: ${r.reasons.join('; ')}`)).toEqual([
			'Entry 2 (Classless): "hitDie" is missing; "startingHp" is missing; "saves" is missing; "levels" is missing',
			'Entry 3 (Cart): "vehicle" isn\'t a kind Nimble takes: use one of monster, spell, item, class, subclass, option, ancestry, background, boon, property, language, rule, condition.',
		]);
		expect(packSummary(p)).toBe('1 entry: 1 spell · 2 left out');
	});
});

describe('pack content on top of the books', () => {
	const books = BOOKS as unknown as CompendiumData;
	it('adds the class, its own spells, ancestry, background and item, each tagged with the pack', () => {
		const comp = new Compendium(mergeNimbleData(books, asContent()));
		expect(comp.classByName('Lamplighter')).toMatchObject({ hitDie: 8, keyStats: ['WIL', 'DEX'], pack: 'The Lantern Road', source: 'The Lantern Road' });
		expect(comp.ancestry('Emberkin')).toMatchObject({ size: 'Small', pack: 'The Lantern Road' });
		expect(comp.background('Night Watch Veteran')?.pack).toBe('The Lantern Road');
		expect(comp.spell('Wickflame')).toMatchObject({ class: 'Lamplighter', tier: 0 });
		expect(comp.item('Everburning Lantern')?.rarity).toBe('uncommon');
		const hits = comp.all().filter(h => h.pack === 'The Lantern Road').map(h => `${h.kind}:${h.name}`);
		expect(hits).toEqual(expect.arrayContaining(['class:Lamplighter', 'subclass:Keeper of the Night Watch', 'feature:Stoke the Flame', 'feature:Warm Hands', 'feature:Banked Fire', 'ancestry:Emberkin', 'spell:Wickflame', 'item:Everburning Lantern']));
		// The books' data isn't changed.
		expect(new Compendium(books).classByName('Lamplighter')).toBeUndefined();
	});
	it('a subclass joins its class, and an option joins its class\'s list (or makes a new one)', () => {
		const comp = new Compendium(mergeNimbleData(books, asContent()));
		expect(comp.classByName('Lamplighter')!.subclasses!.map(s => s.name)).toEqual(['Keeper of the Night Watch']);
		const arsenal = comp.classByName('Berserker')!.optionGroups!.find(g => g.name === 'Savage Arsenal')!;
		expect(arsenal.options.at(-1)).toMatchObject({ name: 'Banked Fire', pack: 'The Lantern Road' });
		expect(comp.option('Banked Fire', 'Berserker')?.group.name).toBe('Savage Arsenal');
		const book = new Compendium(books).classByName('Berserker')!;
		expect(arsenal.options.length).toBe(book.optionGroups!.find(g => g.name === 'Savage Arsenal')!.options.length + 1);
		// A subclass for a book's class joins it; an option in a list the class doesn't have makes the list.
		const more = contentNimble([
			{ kind: 'subclass', name: 'Path of Ash', pack: 'P', value: { name: 'Path of Ash', class: 'berserker', levels: [{ level: 3, features: [{ name: 'Ashen', text: 'x' }] }] } },
			{ kind: 'option', name: 'Ember Howl', pack: 'P', value: { name: 'Ember Howl', class: 'Berserker', group: 'Howls', groupIntro: 'Choose wisely.', text: 'x' } },
		]);
		const c2 = new Compendium(mergeNimbleData(books, more));
		expect(c2.classByName('Berserker')!.subclasses!.at(-1)!.name).toBe('Path of Ash');
		expect(c2.subclass('Berserker', 'Path of Ash')?.pack).toBe('P');
		expect(c2.optionGroups('Berserker').at(-1)).toMatchObject({ name: 'Howls', intro: 'Choose wisely.', options: [{ name: 'Ember Howl' }] });
	});
	it('a pack\'s entry replaces the book\'s of the same name, where it stands; a later pack wins a name', () => {
		const add = contentNimble([
			{ kind: 'spell', name: 'Ignite', pack: 'A', value: { name: 'Ignite', school: 'Fire', tier: 1, text: 'Pack A.' } },
			{ kind: 'spell', name: 'ignite', pack: 'B', value: { name: 'ignite', school: 'Fire', tier: 1, text: 'Pack B.' } },
		]);
		const comp = new Compendium(mergeNimbleData(books, add));
		expect(comp.spell('Ignite')).toMatchObject({ text: 'Pack B.', pack: 'B' });
		expect(comp.spells.filter(s => s.name.toLowerCase() === 'ignite').length).toBe(1);
		expect(comp.spells.findIndex(s => s.name.toLowerCase() === 'ignite')).toBe(new Compendium(books).spells.findIndex(s => s.name === 'Ignite'));
	});
	it('a note beats a pack beats the books (compendium-data\'s layer)', () => {
		layer(contentNimble([{ kind: 'spell', name: 'Ignite', pack: 'P', value: { name: 'Ignite', school: 'Fire', tier: 1, text: 'From the pack.' } }]));
		expect(bundledCompendium().spell('Ignite')?.text).toBe('From the pack.');
		setHomebrew({ spells: [{ name: 'Ignite', school: 'Fire', tier: 1, text: 'From my note.', filePath: 'Notes/Ignite.md' }], items: [] });
		expect(bundledCompendium().spell('Ignite')?.text).toBe('From my note.');
		layer(null);
		setHomebrew({ spells: [], items: [] });
		expect(bundledCompendium().spell('Ignite')?.text).toMatch(/4d10/);
	});
	it('each campaign sees its own packs', () => {
		const lantern = asContent();
		setContentLayer(path => (path?.startsWith('Lantern/') ? { key: 'lantern', content: lantern } : null));
		expect(heroCompendium({ path: 'Lantern/Party/Wren.md' }).classByName('Lamplighter')).toBeDefined();
		expect(heroCompendium({ path: 'Elsewhere/Party/Brakka.md' }).classByName('Lamplighter')).toBeUndefined();
		expect(bundledCompendium('Lantern/Refs.md').spell('Wickflame')).toBeDefined();
		expect(bundledCompendium('Elsewhere/Refs.md').spell('Wickflame')).toBeUndefined();
	});
	it('rules, languages, properties and conditions join their lists', () => {
		const add = contentNimble([
			{ kind: 'rule', name: 'Lamplight', pack: 'P', value: { name: 'Lamplight', text: 'Light carries 8 spaces at night.', topic: 'Travel' } },
			{ kind: 'language', name: 'Cant', pack: 'P', value: { name: 'Cant', speakers: 'Thieves.' } },
			{ kind: 'property', name: 'Brittle', pack: 'P', value: { name: 'Brittle', text: 'Breaks on a 1.' } },
			{ kind: 'condition', name: 'Soot-Blind', pack: 'P', value: { name: 'Soot-Blind', text: 'Can\'t see past 2 spaces.', minor: true } },
			{ kind: 'boon', name: 'Undying', pack: 'P', value: { name: 'Undying', type: 'epic', text: 'x' } },
		]);
		expect(add.conditions).toEqual([{ name: 'Soot-Blind', description: 'Can\'t see past 2 spaces.', minor: true, pack: 'P' }]);
		const comp = new Compendium(mergeNimbleData(books, add));
		expect(comp.property('Brittle')?.text).toBe('Breaks on a 1.');
		expect(comp.boons.find(b => b.name === 'Undying')?.kind).toBe('epic');
		expect((comp.rules.languages as { name: string }[]).map(l => l.name)).toContain('Cant');
		const entries = buildEntries({ monsters: [], compendium: comp });
		const rule = entries.find(e => e.name === 'Lamplight')!;
		expect(rule).toMatchObject({ kind: 'rule', facets: { topic: ['Travel'], source: ['P'] } });
		expect(rule.flags).toContain('pack');
		expect(entries.find(e => e.name === 'Undying')!.flags).toContain('pack');
	});
});

describe('pack monsters', () => {
	it('written field by field, as the bestiary is', () => {
		const m = asContent().monsters[0];
		expect(m).toMatchObject({
			name: 'Wick Wraith', level: '3', type: 'Undead', group: 'Lantern Haunts', role: 'regular', armor: 'none', hp: 30, movement: '6, fly 6',
			saves: 'WIL+', resistances: ['necrotic'], vulnerabilities: ['radiant'], actionText: 'Choose 1:', source: 'The Lantern Road', pack: 'The Lantern Road',
		});
		expect(m.attacks?.[0].raw).toBe('**Cold Grasp.** 2d8+3 necrotic.');
		expect(m.abilities?.[0]).toEqual({ name: 'Snuff', description: 'Nonmagical flames within 4 spaces of it go out.' });
		expect(packMonster({ name: 'Queen', role: 'solo', hpPerHero: 30, armor: 'heavy' }, 'P')).toMatchObject({ role: 'legendary', roleLabel: 'Solo', hp: 120, hpPerHero: 30, armor: 'heavy' });
		expect(packMonster({ name: 'Imp', statblock: 'name: Imp\nlevel: 1\nhp: 12\narmor: medium' }, 'P')).toMatchObject({ name: 'Imp', hp: 12, armor: 'medium', source: 'P', pack: 'P' });
	});
	it('the index: a note beats a pack beats the books', async () => {
		const files: Record<string, string> = { 'Notes/Goblin.md': '```nimble\nname: Goblin\nlevel: 1\nhp: 99\n```' };
		const app = { vault: { cachedRead: async (f: { path: string }) => files[f.path] } };
		const index = new MonsterIndex(app as never);
		const book: MonsterIndexEntry = { name: 'Goblin', filePath: '', bundled: true, monster: { name: 'Goblin', armor: 'none', hp: 7, movement: '6', bundledId: 'goblin' } };
		const wraith: MonsterIndexEntry = { name: 'Wick Wraith', filePath: '', pack: 'P', monster: asContent().monsters[0] };
		const packGoblin: MonsterIndexEntry = { name: 'Goblin', filePath: '', pack: 'P', monster: { name: 'Goblin', armor: 'none', hp: 20, movement: '6' } };
		index.setBundled([book]);
		index.setPacks(from => new Map(from?.startsWith('Elsewhere/') ? [] : [['wick wraith', wraith], ['goblin', packGoblin]]));
		expect(index.get('Goblin')?.monster.hp).toBe(20);
		expect(index.get('wick wraith')?.pack).toBe('P');
		expect(index.all().map(e => `${e.name}:${e.pack ?? (e.bundled ? 'book' : 'note')}`)).toEqual(['Goblin:P', 'Wick Wraith:P']);
		// Another campaign without the pack sees the book's.
		expect(index.get('Goblin', 'Elsewhere/x.md')?.bundled).toBe(true);
		expect(index.get('Wick Wraith', 'Elsewhere/x.md')).toBeUndefined();
		await index.update({ path: 'Notes/Goblin.md', extension: 'md' } as never);
		expect(index.get('Goblin')?.monster.hp).toBe(99);
		expect(index.all().map(e => e.name)).toEqual(['Goblin', 'Wick Wraith']);
		const entries = buildEntries({ monsters: [wraith] });
		expect(entries[0]).toMatchObject({ id: 'monster:pack:wick wraith', facets: { source: ['P', 'P'] } });
		expect(entries[0].flags).toContain('pack');
	});
});

describe('a hero of the example pack\'s class, through New character and Level up', () => {
	const comp = new Compendium(mergeNimbleData(BOOKS as unknown as CompendiumData, asContent()));
	it('starts at level 1 with the class\'s stats, HP, gear, Ember Dice and its own cantrip', () => {
		const fm = newCharacterFrontmatter({ name: 'Wren', className: 'Lamplighter', ancestry: 'Emberkin', background: 'Night Watch Veteran', array: 'Standard' }, comp);
		expect(fm).toMatchObject({ class: 'Lamplighter', level: 1, hp_max: 13, ancestry: 'Emberkin', background: 'Night Watch Veteran' });
		expect(fm.inventory).toEqual(['Staff', { name: 'Adventurer\'s Garb', equipped: true }, 'Lantern & Oil']);
		const s = readCharacter(fm, comp);
		expect(s.saves).toMatchObject({ WIL: 'adv', STR: 'dis' });
		expect(s.key).toBe(Math.max(s.stats.WIL, s.stats.DEX));
		const ember = s.resources.find(r => r.name === 'Ember Dice')!;
		expect(ember).toMatchObject({ max: s.stats.WIL, current: s.stats.WIL, die: 'd6' });
		expect(ruleOf(ember)).toMatchObject({ rolledWhen: 'spent', on: ['attack', 'spell'], amount: 'one', damageType: 'fire', rules: ['Stoke the Flame'] });
		expect(classPanelRows(s).find(r => r.key === 'res:Ember Dice')).toMatchObject({ kind: 'dice', sides: 6, rolledWhen: 'spent', rules: [{ name: 'Stoke the Flame' }] });
		expect(s.spells.map(x => x.name)).toContain('Wickflame');
		expect(s.spells.map(x => x.name)).not.toContain('Lantern Ward');
		expect(s.features.map(f => f.name)).toEqual(expect.arrayContaining(['Stoke the Flame', 'Lantern Light']));
	});
	it('levels up through a Kindling, the subclass, a stat increase and brighter Ember Dice', () => {
		const plans = heroPlans({ className: 'Lamplighter', level: 5 }, comp, 'Keeper of the Night Watch');
		expect(plans.find(p => p.level === 3)!.subclasses.map(s => s.name)).toEqual(['Keeper of the Night Watch']);
		expect(pickGroups(plans).map(g => [g.name, g.count])).toEqual([['Kindlings', 2]]);
		const four = plans.find(p => p.level === 4)!;
		expect(four.stats[0]).toMatchObject({ options: ['WIL', 'DEX'], count: 1 });

		// Level 1, then up one level at a time, as the sheet's Level up does.
		let fm = newCharacterFrontmatter({ name: 'Wren', className: 'Lamplighter', array: 'Standard' }, comp);
		const picks: Record<number, Partial<LevelChoices>> = {
			2: { picks: { Kindlings: ['Warm Hands'] } },
			3: { subclass: 'Keeper of the Night Watch' },
			4: { picks: { Kindlings: ['Long Wick'] }, stats: { [increaseKey(4, four.stats[0])]: ['WIL'] } },
			5: {},
		};
		for (const level of [2, 3, 4, 5]) {
			const s = readCharacter(fm, comp);
			const step = levelPlans(comp, { className: 'Lamplighter', subclass: s.subclass, from: level, to: level, hitDie: 8, chosen: picks[level].subclass });
			applyLevelChoices(fm, comp, step, { ...noChoices(), hp: [5], ...picks[level] });
		}
		fm = { ...fm };
		const s = readCharacter(fm, comp);
		expect(s).toMatchObject({ level: 5, subclass: 'Keeper of the Night Watch', hpMax: 13 + 4 * 5 });
		expect(s.features.map(f => f.name)).toEqual(expect.arrayContaining(['Warm Hands', 'Long Wick', 'Watchful', 'Ward the Gate', 'Brighter Embers']));
		expect(s.resources.find(r => r.name === 'Ember Dice')).toMatchObject({ die: 'd8', max: s.stats.WIL });
		expect(s.manaMax).toBe(s.stats.WIL + 5);
		expect(s.spells.map(x => x.name)).toEqual(expect.arrayContaining(['Wickflame', 'Lantern Ward']));
		// A Safe Rest brings the Ember Dice back.
		const spent = { ...fm, resources: { 'Ember Dice': 0 } };
		safeRest(spent, readCharacter(spent, comp));
		expect(readCharacter(spent, comp).resources.find(r => r.name === 'Ember Dice')!.current).toBe(s.stats.WIL);
	});
});

describe('the published JSON Schema', () => {
	it('matches Nimble\'s kinds (UPDATE_SCHEMAS=1 writes it again)', () => {
		const schema = `${JSON.stringify(packSchema({ system: 'nimble', name: 'Nimble', title: 'Ember Vault content pack (Nimble)', kinds: KINDS_NIMBLE }), null, '\t')}\n`;
		const file = 'docs/content/nimble.schema.json';
		if (process.env.UPDATE_SCHEMAS) writeFileSync(file, schema);
		expect(readFileSync(file, 'utf8')).toBe(schema);
	});
	it('every field of the bundled data has a field in a kind (a pack class is as expressive as a book\'s)', () => {
		const fields = (k: string) => Object.keys(kind(k).fields);
		const keysOf = (list: unknown) => new Set((list as Record<string, unknown>[]).flatMap(e => Object.keys(e)));
		// Where an entry comes from is the pack; `draft` is the books' own.
		const ours = new Set(['source', 'draft']);
		const b = BOOKS as unknown as Record<string, unknown[]>;
		const missing = (k: string, list: unknown) => [...keysOf(list)].filter(x => !ours.has(x) && !fields(k).includes(x));
		expect(missing('class', b.classes)).toEqual([]);
		expect(missing('subclass', b.classes.flatMap(c => (c as { subclasses: unknown[] }).subclasses))).toEqual([]);
		expect(missing('ancestry', b.ancestries)).toEqual([]);
		expect(missing('background', b.backgrounds)).toEqual([]);
		expect(missing('item', b.items)).toEqual([]);
		expect(missing('spell', b.spells)).toEqual([]);
		// A boon's kind is written `type` (`kind` is the entry's in a pack).
		expect(missing('boon', (b.boons as Record<string, unknown>[]).map(({ kind: k, ...rest }) => ({ ...rest, ...(k ? { type: k } : {}) })))).toEqual([]);
		expect(missing('property', b.properties)).toEqual([]);
	});
});

describe('nothing from packs, nothing changes', () => {
	it('an empty layer is the books', () => {
		layer(emptyContent());
		expect(bundledCompendium().classes.length).toBe(new Compendium(BOOKS).classes.length);
	});
});
