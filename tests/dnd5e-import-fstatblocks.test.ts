import { describe, expect, it } from 'vitest';
import { fantasyStatblockCreatures, importFantasyStatblock, importFantasyStatblocks } from '../src/systems/dnd5e/import-fstatblocks';
import { parseStatblock5e, toStatblockSource5e } from '../src/systems/dnd5e/parser';
import { parseYamlLite } from '../src/core/yaml-lite';
import type { Dnd5eMonster } from '../src/systems/dnd5e/types';

const roundTrips = (m: Dnd5eMonster) => expect(parseStatblock5e(toStatblockSource5e(m))).toEqual(m);

// A made-up creature, written the way Fantasy Statblocks' 5e layout has you write one.
const MIRE_HAG = `\`\`\`statblock
layout: Basic 5e Layout
image: [[Mire Hag.png]]
name: Mire Hag
size: Medium
type: fey
subtype: hag
alignment: neutral evil
ac: 15
hp: 58
hit_dice: 9d8 + 18
speed: 30 ft., swim 30 ft.
stats: [16, 12, 15, 13, 14, 16]
saves:
  - wisdom: 4
  - charisma: 5
skillsaves:
  - deception: 5
  - perception: 4
  - sleight of hand: 3
damage_resistances: cold; bludgeoning, piercing, and slashing from nonmagical attacks
condition_immunities: charmed, frightened
senses: darkvision 60 ft., passive Perception 14
languages: Common, Sylvan
cr: 4
traits:
  - name: Bog Stride
    desc: Difficult terrain made of mud or water doesn't slow the hag.
  - name: "Mimicry"
    desc: >-
      The hag can copy the voice of anyone it has heard,
      well enough to fool a listener who fails a DC 13 Insight check.
actions:
  - name: Multiattack
    desc: "The hag makes two Claw attacks."
  - name: Claw
    desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) slashing damage, and the target can''t regain hit points until the start of the hag''s next turn.'
  - name: Mire Veil (Recharge 5-6)
    desc: |
      The hag fills a 20-foot sphere with stinking fog.

      Each creature in it must make a DC 13 Constitution save. # not a comment
bonus_actions:
  - name: Slip Away
    desc: The hag takes the Hide action.
reactions:
  - name: Reed Shield
    desc: The hag adds 2 to its AC against one attack that would hit it.
legendary_description: The hag can take 2 legendary actions, choosing from the options below.
legendary_actions:
  - name: Croak
    desc: Each creature within 10 feet must succeed on a DC 13 Wisdom save or be frightened.
  - name: Sink (Costs 2 Actions)
    desc: The hag moves up to its swim speed.
spells:
  - "The hag casts one of the following spells, using Charisma as its spellcasting ability (spell save DC 13):"
  - At will: dancing lights, minor illusion
  - 1/day each: fog cloud, sleep
\`\`\`
`;

describe('parseYamlLite', () => {
	it('reads maps, lists, quotes, block text, flow lists and comments', () => {
		expect(parseYamlLite('a: 1\nb: two words # note\nc: "x: y"\nd: \'it\'\'s\'\ne: [1, "2", {f: 3}]\ng: ~\nh: true\ni: 1/4\nj: -0.5\nk: +4')).toEqual({
			a: 1, b: 'two words', c: 'x: y', d: 'it\'s', e: [1, '2', { f: 3 }], g: null, h: true, i: '1/4', j: -0.5, k: 4,
		});
		expect(parseYamlLite('list:\n- a\n- b: 1\n  c: 2\n-\n  - nested\nafter: x')).toEqual({ list: ['a', { b: 1, c: 2 }, ['nested']], after: 'x' });
		expect(parseYamlLite('a: |\n  one\n\n  two\n    indented\nb: >-\n  folded\n  text\n\n  para\nc: |+\n  kept\n\nd: 1')).toEqual({
			a: 'one\n\ntwo\n  indented\n', b: 'folded text\npara', c: 'kept\n\n', d: 1,
		});
		expect(parseYamlLite('a: plain text\n  that runs on\n\n  and on\nb: "quoted\n  over lines"\nc: [1,\n  2]')).toEqual({ a: 'plain text that runs on\nand on', b: 'quoted over lines', c: [1, 2] });
		expect(parseYamlLite('---\nname: A\n---\nname: B')).toEqual({ name: 'A' });
		expect(parseYamlLite('"quoted key": 1\n\'other\': 2\nescapes: "tab\\tnl\\nq\\"u\\u00e9"')).toEqual({ 'quoted key': 1, other: 2, escapes: 'tab\tnl\nq"ué' });
	});
	it('never throws on rubbish', () => {
		for (const s of ['', ':', '- - -', '[[[', '{a: [', '"unclosed', 'a:\n    - b\n  c: d\n e', '\t\tx: y', 'a: |\n', '- a\nb: c', '? complex\n: key']) {
			expect(() => parseYamlLite(s)).not.toThrow();
		}
		expect(parseYamlLite('')).toBeNull();
	});
});

describe('importing a Fantasy Statblocks creature', () => {
	it('reads a whole 5e creature', () => {
		const r = importFantasyStatblock(MIRE_HAG);
		expect(r.name).toBe('Mire Hag');
		expect(r.notes).toEqual([]);
		const m = r.monster;
		expect(m).toMatchObject({
			name: 'Mire Hag', size: 'Medium', type: 'fey (hag)', alignment: 'neutral evil', ac: 15, hp: 58, hpFormula: '9d8 + 18',
			speed: '30 ft., swim 30 ft.', abilities: [16, 12, 15, 13, 14, 16], saves: { wis: 4, cha: 5 },
			skills: { Deception: 5, Perception: 4, 'Sleight of Hand': 3 },
			resistances: ['cold', 'bludgeoning, piercing, and slashing from nonmagical attacks'], conditionImmunities: ['charmed', 'frightened'],
			senses: 'darkvision 60 ft., passive Perception 14', languages: 'Common, Sylvan', cr: '4', xp: 1100, pb: 2,
			legendaryIntro: 'The hag can take 2 legendary actions, choosing from the options below.',
		});
		expect(m.traits?.map(t => t.name)).toEqual(['Bog Stride', 'Mimicry', 'Spellcasting']);
		expect(m.traits?.[1].desc).toBe('The hag can copy the voice of anyone it has heard, well enough to fool a listener who fails a DC 13 Insight check.');
		expect(m.traits?.[2].desc).toBe('The hag casts one of the following spells, using Charisma as its spellcasting ability (spell save DC 13):\nAt will: dancing lights, minor illusion\n1/day each: fog cloud, sleep');
		expect(m.actions?.[1].desc).toMatch(/can't regain hit points until the start of the hag's next turn\.$/);
		expect(m.actions?.[2]).toEqual({ name: 'Mire Veil (Recharge 5-6)', desc: 'The hag fills a 20-foot sphere with stinking fog.\n\nEach creature in it must make a DC 13 Constitution save. # not a comment' });
		expect(m.bonusActions).toEqual([{ name: 'Slip Away', desc: 'The hag takes the Hide action.' }]);
		expect(m.reactions?.length).toBe(1);
		expect(m.legendaryActions?.map(a => a.name)).toEqual(['Croak', 'Sink (Costs 2 Actions)']);
		roundTrips(m);
	});

	it('takes the YAML without its fence, as JSON, or as an object', () => {
		const fenced = importFantasyStatblock(MIRE_HAG).monster;
		const bare = MIRE_HAG.replace(/^```.*\n/gm, '');
		expect(importFantasyStatblock(bare).monster).toEqual(fenced);
		const obj = parseYamlLite(bare);
		expect(importFantasyStatblock(obj).monster).toEqual(fenced);
		expect(importFantasyStatblock(JSON.stringify(obj)).monster).toEqual(fenced);
		expect(importFantasyStatblock({ monster: obj }).monster).toEqual(fenced);
	});

	it('a bestiary export: every creature with a name', () => {
		const all = importFantasyStatblocks(JSON.stringify([{ name: 'A', cr: 1 }, { cr: 2 }, 'x', { name: 'B', cr: 0.25 }]));
		expect(all.map(r => [r.name, r.monster.cr])).toEqual([['A', '1'], ['B', '1/4']]);
	});

	it('sets the edition when asked', () => {
		const m = importFantasyStatblock({ name: 'Rat', cr: 0 }, { edition: '2014' }).monster;
		expect(m.edition).toBe('2014');
		roundTrips(m);
	});

	it('reads the other ways people write the fields', () => {
		const r = importFantasyStatblock({
			name: 'Odd One', ac: '17 (natural armor)', hp: '45 (6d10 + 12)', stats: '[18, 10, 14, 6, 12, 7]',
			saves: { Str: '+6', 'Con Save': 4 }, skillsaves: [{ name: 'Athletics', desc: '+6' }, { 'animal-handling': 3 }],
			damage_immunities: ['poison', 'psychic'], damage_vulnerabilities: 'fire', cr: '1/2', source: ['My Homebrew', 'p. 3'],
		});
		expect(r.source).toBe('My Homebrew, p. 3');
		const m = r.monster;
		expect(m).toMatchObject({
			ac: 17, acNote: 'natural armor', hp: 45, hpFormula: '6d10 + 12', abilities: [18, 10, 14, 6, 12, 7],
			saves: { str: 6, con: 4 }, skills: { Athletics: 6, 'Animal Handling': 3 }, immunities: ['poison', 'psychic'], vulnerabilities: ['fire'],
			cr: '1/2', xp: 100,
		});
		roundTrips(m);
		const ac = importFantasyStatblock({ name: 'Plated', ac_class: [{ ac: 18, armor_type: 'plate armor' }], hit_dice: '4d8' }).monster;
		expect(ac).toMatchObject({ ac: 18, acNote: 'plate armor', hp: 18, hpFormula: '4d8' });
		roundTrips(ac);
	});

	it('fills in what’s missing, and says so', () => {
		const r = importFantasyStatblock('name: Blank');
		expect(r.monster).toEqual({ name: 'Blank', ac: 10, hp: 1, abilities: [10, 10, 10, 10, 10, 10], cr: '0', xp: 10, pb: 2 });
		expect(r.notes).toHaveLength(3);
		roundTrips(r.monster);
		expect(importFantasyStatblock('name: Kin\ncreature: Goblin').notes.some(n => /builds on “Goblin”/.test(n))).toBe(true);
	});

	it('keeps lair actions, regional effects and mythic actions in the description', () => {
		const r = importFantasyStatblock({
			name: 'Old Wyrm', cr: 20,
			lair_actions: [{ name: 'Tremor', desc: 'The ground shakes.\nEverything falls.' }],
			regional_effects: [{ name: 'Fog', desc: 'Fog rolls in.' }],
			mythic_description: 'If its mythic trait is active, it can use these.', mythic_actions: [{ name: 'Roar', desc: 'It roars.' }],
		});
		expect(r.monster.description).toBe('**Lair Actions.**\n- **Tremor.** The ground shakes. Everything falls.\n**Regional Effects.**\n- **Fog.** Fog rolls in.\n**Mythic Actions.** If its mythic trait is active, it can use these.\n- **Roar.** It roars.');
		expect(r.notes).toContain('Lair actions, regional effects and mythic actions are in the description.');
		roundTrips(r.monster);
	});

	it('throws for anything that isn’t a creature', () => {
		expect(() => importFantasyStatblock('')).toThrow(/nothing to import/);
		expect(() => importFantasyStatblock('just some words')).toThrow(/isn’t a Fantasy Statblocks creature/);
		expect(() => importFantasyStatblock('size: Large\ncr: 3')).toThrow(/needs at least a name/);
		expect(() => importFantasyStatblock(null)).toThrow(/isn’t a Fantasy Statblocks creature/);
		expect(() => importFantasyStatblock([])).toThrow(/isn’t a Fantasy Statblocks creature/);
		expect(() => fantasyStatblockCreatures(42)).toThrow();
	});
});

// ----------------------------------------------------------------------------
// Many generated creatures: each must come out of the importer in a form the
// ```5e block reads back exactly, and read the same from YAML as from objects.

function rng(seed: number) {
	let s = seed >>> 0;
	return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const NAMES = ['Gloom Toad', 'Ash-Wight', 'Captain Vey', 'Thing: The Second', 'Moss **Golem**', 'Ogre. Big', 'Ré the Bright'];
const FEATURE_NAMES = ['Bite', 'Multiattack', 'Spit (Recharge 5-6)', 'Variant: Summon', 'Wing Attack (Costs 2 Actions),', 'Keen Smell.', '**Bold Name**', 'A Very Long Name That Goes On And On Because Someone Wrote A Whole Sentence In The Name Field', 'Dot. Inside', ''];
const DESCS = [
	'',
	'Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) piercing damage.',
	'Line one.\nLine two.',
	'Paragraph one.\n\n\nParagraph two after blanks.',
	'Starts here.\nActions: this line looks like a heading.\nSenses: so does this one.',
	'Has a list:\n- first\n- second',
	'  padded text with trailing spaces   \n   and an indented line',
	'Cantrips (at will): light, mage hand\n1st level (2 slots): sleep',
	'Before a gap.\n\nDescription: this would start a description.',
];
const LISTS = ['fire', 'cold, fire', 'poison; psychic', 'bludgeoning, piercing, and slashing from nonmagical attacks', 'acid, cold; bludgeoning, piercing, and slashing from nonmagical attacks that aren\'t silvered', ['lightning', 'thunder'], ''];
const CRS = [0, 0.125, 0.25, 0.5, 1, 3, 10, 30, '1/4', '1/2', '5', '12 (8,400 XP)', '0.5', 'unknown'];
const ABILITY_KEYS = ['str', 'Dexterity', 'con', 'intelligence', 'WIS', 'cha'];
const SKILL_KEYS = ['perception', 'stealth', 'sleight of hand', 'Animal Handling', 'arcana', 'survival'];

function generate(r: () => number): Record<string, unknown> {
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const maybe = (p = 0.5) => r() < p;
	const feats = (n: number) => Array.from({ length: n }, () => ({ name: pick(FEATURE_NAMES), desc: pick(DESCS) }));
	const c: Record<string, unknown> = { name: pick(NAMES) };
	if (maybe(0.8)) c.size = pick(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']);
	if (maybe(0.8)) c.type = pick(['beast', 'undead', 'humanoid', 'fiend (demon)']);
	if (maybe()) c.subtype = pick(['goblinoid', 'shapechanger', '']);
	if (maybe()) c.alignment = pick(['unaligned', 'chaotic evil', 'any alignment']);
	if (maybe(0.9)) c.ac = pick([12, 15, '17 (natural armor)', '13 (leather armor, shield)', '20']);
	if (maybe(0.9)) c.hp = pick([7, 45, '22 (5d8)', '1']);
	if (maybe()) c.hit_dice = pick(['2d6', '9d8 + 18', '19d12 + 133', '1d4 - 1']);
	if (maybe(0.8)) c.speed = pick(['30 ft.', '30 ft., fly 60 ft. (hover)', 40]);
	if (maybe(0.9)) c.stats = Array.from({ length: 6 }, () => 1 + Math.floor(r() * 30));
	if (maybe()) c.saves = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ [pick(ABILITY_KEYS)]: pick([2, 5, '+7', -1]) }));
	if (maybe()) c.skillsaves = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ [pick(SKILL_KEYS)]: pick([3, '+6', 11]) }));
	for (const k of ['damage_vulnerabilities', 'damage_resistances', 'damage_immunities', 'condition_immunities']) if (maybe(0.3)) c[k] = pick(LISTS);
	if (maybe()) c.senses = pick(['darkvision 60 ft., passive Perception 10', 'passive Perception 12']);
	if (maybe()) c.languages = pick(['Common', '—', 'understands Abyssal but can\'t speak']);
	if (maybe(0.9)) c.cr = pick(CRS);
	if (maybe(0.6)) c.traits = feats(1 + Math.floor(r() * 3));
	if (maybe(0.8)) c.actions = feats(1 + Math.floor(r() * 4));
	if (maybe(0.3)) c.bonus_actions = feats(1);
	if (maybe(0.3)) c.reactions = feats(1 + Math.floor(r() * 2));
	if (maybe(0.3)) c.legendary_actions = feats(1 + Math.floor(r() * 3));
	if (maybe(0.3)) c.legendary_description = pick(['It can take 3 legendary actions.', '- odd intro', 'Senses: not an intro', 'Two\nlines']);
	if (maybe(0.2)) c.spells = ['It casts these spells:', { 'At will': 'light' }, '1/day: fog cloud'];
	if (maybe(0.15)) c.lair_actions = feats(1);
	if (maybe(0.1)) c.mythic_actions = feats(1);
	if (maybe(0.2)) c.source = pick(['Homebrew', 'My Book: Chapter 2']);
	return c;
}

/** A small YAML writer for the tests, in the styles people write by hand. */
function toYaml(v: unknown, r: () => number, indent = ''): string {
	const scalar = (x: unknown): string => {
		if (typeof x === 'number' || typeof x === 'boolean' || x === null) return String(x);
		const s = String(x);
		if (/^[A-Za-z][A-Za-z ,.()'-]*$/.test(s) && !/:\s|\s#|^(true|false|null)$/i.test(s) && r() < 0.5) return s;
		return r() < 0.5 || s.includes('\n') ? JSON.stringify(s) : `'${s.replace(/'/g, '\'\'')}'`;
	};
	const lines: string[] = [];
	for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
		const key = /^[a-z_]+$/i.test(k) ? k : JSON.stringify(k);
		if (Array.isArray(val)) {
			if (val.every(x => typeof x === 'number') && r() < 0.5) { lines.push(`${indent}${key}: [${val.join(', ')}]`); continue; }
			lines.push(`${indent}${key}:`);
			const pad = r() < 0.5 ? indent : `${indent}  `;
			for (const item of val) {
				if (item && typeof item === 'object') {
					const body = toYaml(item, r, `${pad}  `).split('\n');
					lines.push(`${pad}- ${body[0].trimStart()}`, ...body.slice(1));
				} else lines.push(`${pad}- ${scalar(item)}`);
			}
		} else if (val && typeof val === 'object') {
			lines.push(`${indent}${key}:`, toYaml(val, r, `${indent}  `));
		} else if (typeof val === 'string' && val.includes('\n') && !/^\s|\s$/.test(val) && !val.split('\n').some(l => /^\s/.test(l) || /\s$/.test(l)) && r() < 0.5) {
			lines.push(`${indent}${key}: |-`, ...val.split('\n').map(l => (l ? `${indent}  ${l}` : '')));
		} else lines.push(`${indent}${key}: ${scalar(val)}`);
	}
	return lines.join('\n');
}

describe('generated creatures round-trip through the ```5e block', () => {
	const N = 600;
	it(`${N} creatures: parseStatblock5e(toStatblockSource5e(m)) equals m`, () => {
		const r = rng(5);
		for (let n = 0; n < N; n++) {
			const c = generate(r);
			const edition = r() < 0.3 ? (r() < 0.5 ? '2014' : '2024') : undefined;
			const m = importFantasyStatblock(c, { edition }).monster;
			const back = parseStatblock5e(toStatblockSource5e(m));
			if (JSON.stringify(back) !== JSON.stringify(m)) expect({ n, back }).toEqual({ n, back: m });
			roundTrips(m);
		}
	});

	it(`${N} creatures: the same from YAML text as from the object`, () => {
		const r = rng(11);
		for (let n = 0; n < N; n++) {
			const c = generate(r);
			const yaml = toYaml(c, r);
			const fromYaml = importFantasyStatblock(r() < 0.5 ? yaml : `\`\`\`statblock\n${yaml}\n\`\`\``).monster;
			const fromObj = importFantasyStatblock(c).monster;
			if (JSON.stringify(fromYaml) !== JSON.stringify(fromObj)) expect({ n, yaml, fromYaml }).toEqual({ n, yaml, fromYaml: fromObj });
		}
	});

	it('every option of every field shows up in some creature', () => {
		const r = rng(5);
		const seen = new Set<string>();
		for (let n = 0; n < N; n++) for (const [k, v] of Object.entries(importFantasyStatblock(generate(r)).monster)) if (v !== undefined) seen.add(k);
		expect([...seen].sort()).toEqual(['abilities', 'ac', 'acNote', 'actions', 'alignment', 'bonusActions', 'conditionImmunities', 'cr', 'description', 'hp', 'hpFormula', 'immunities', 'languages', 'legendaryActions', 'legendaryIntro', 'name', 'pb', 'reactions', 'resistances', 'saves', 'senses', 'size', 'skills', 'speed', 'traits', 'type', 'vulnerabilities', 'xp']);
	});
});
