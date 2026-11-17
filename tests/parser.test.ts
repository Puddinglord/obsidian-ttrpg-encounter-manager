import { describe, expect, it } from 'vitest';
import { extractNimbleBlocks, normalizeArmor, parseAbility, parseMovement, parseStatblock, readStatblock, toStatblockSource, applyStatblockFix } from '../src/parser';

describe('parseStatblock', () => {
	it('parses the README goblin', () => {
		const m = parseStatblock(`name: Goblin
type: Humanoid
size: Small
armor: none
hp: 12
movement: 6
str: -
dex: ++
will: -
attacks:
- Shortsword 1d6 slashing
- Shortbow 1d6 piercing
abilities:
- Nimble Escape: Can Disengage or Hide as a bonus action`)!;
		expect(m.name).toBe('Goblin');
		expect(m.hp).toBe(12);
		expect(m.armor).toBe('none');
		expect(m.dex).toBe('++');
		expect(m.attacks?.map(a => a.raw)).toEqual(['Shortsword 1d6 slashing', 'Shortbow 1d6 piercing']);
		expect(m.abilities?.[0]).toEqual({ name: 'Nimble Escape', description: 'Can Disengage or Hide as a bonus action' });
	});

	it('returns null without a name', () => {
		expect(parseStatblock('hp: 10')).toBeNull();
	});

	it('keeps hp 0 and defaults missing hp to 10', () => {
		expect(parseStatblock('name: A\nhp: 0')!.hp).toBe(0);
		expect(parseStatblock('name: A')!.hp).toBe(10);
		expect(parseStatblock('name: A\nhp: lots')!.hp).toBe(10);
	});

	it('handles CRLF line endings', () => {
		const m = parseStatblock('name: Crab\r\nhp: 8\r\nattacks:\r\n- Pinch 1d4\r\n')!;
		expect(m.hp).toBe(8);
		expect(m.attacks?.[0].raw).toBe('Pinch 1d4');
	});

	it('parses solo fields (old monsterType key) as legendary', () => {
		const m = parseStatblock(`name: Dragon
monsterType: Solo
bloodied: Gets angry
lastStand: Explodes
actionText: Pick two:`)!;
		expect(m.role).toBe('legendary');
		expect(m.roleLabel).toBe('Solo');
		expect(m.bloodied).toBe('Gets angry');
		expect(m.lastStand).toBe('Explodes');
		expect(m.actionText).toBe('Pick two:');
	});

	it('keeps colons in values', () => {
		expect(parseStatblock('name: A\ndescription: Note: it bites')!.description).toBe('Note: it bites');
	});
});

describe('parseAbility', () => {
	it('marks legendary abilities', () => {
		expect(parseAbility('Wing Attack (L): Knocks prone')).toEqual({ name: 'Wing Attack', description: 'Knocks prone', isLegendary: true });
	});
	it('keeps markdown in descriptions', () => {
		expect(parseAbility('Rage: Deals **double** damage').description).toBe('Deals **double** damage');
	});
	it('handles "***Name.*** text" style', () => {
		expect(parseAbility('***Pack Tactics.*** Advantage near allies')).toEqual({ name: 'Pack Tactics', description: 'Advantage near allies' });
	});
});

describe('normalizeArmor', () => {
	it.each([
		['none', 'none'], ['N', 'none'], ['M', 'medium'], ['medium', 'medium'], ['H', 'heavy'], ['heavy', 'heavy'], ['15', 'none'], ['18', 'none'], ['??', 'none'],
	])('%s -> %s', (input, out) => expect(normalizeArmor(input)).toBe(out));
});

describe('parseMovement', () => {
	it.each([
		['6', null], ['walk 6', null], ['8', '8'], ['fly 12', 'FLY 12'], ['fly', 'FLY'], ['8, fly 16', '8, fly 16'],
	])('%s -> %s', (input, display) => expect(parseMovement(input).display).toBe(display));
});

describe('extractNimbleBlocks', () => {
	it('finds backtick, tilde and long fences, ignores other languages', () => {
		const note = [
			'```nimble', 'name: A', '```',
			'```js', 'const x = 1', '```',
			'~~~nimble', 'name: B', '~~~',
			'````nimble', 'name: C', '```', 'still C', '````',
			'  ```Nimble', 'name: D', '  ```',
		].join('\r\n');
		expect(extractNimbleBlocks(note)).toEqual(['name: A', 'name: B', 'name: C\n```\nstill C', 'name: D']);
	});

	it('finds blocks indented under list items', () => {
		expect(extractNimbleBlocks('- Camp\n    ```nimble\n    name: Goblin\n    ```\n\t```nimble\n\tname: Tab\n\t```')).toEqual(['    name: Goblin', '\tname: Tab']);
	});

	it('ignores one-line ```code``` that is not a fence', () => {
		expect(extractNimbleBlocks('```js```\n```nimble\nname: A\n```')).toEqual(['name: A']);
	});

	it('does not end a backtick fence with tildes', () => {
		expect(extractNimbleBlocks('```nimble\nname: A\n~~~\nhp: 3\n```')).toEqual(['name: A\n~~~\nhp: 3']);
	});
});

describe('Nimble 3.2 stat block fields', () => {
	it('parses per-hero HP, role, saves, minion die and tactics', () => {
		const m = parseStatblock(`name: Krogg
level: 2
role: solo
hp: 28/hero
saves: STR+ DEX+
minion die: d8
easier: Spread damage around.
harder: Focus the weakest hero.
source: GM Guide p.14`)!;
		expect(m.role).toBe('legendary');
		expect(m.roleLabel).toBe('Solo');
		expect(m.hpPerHero).toBe(28);
		expect(m.hp).toBe(112);
		expect(m.saves).toBe('STR+ DEX+');
		expect(m.minionDie).toBe(8);
		expect(m.tactics).toEqual({ easier: 'Spread damage around.', harder: 'Focus the weakest hero.' });
		expect(m.source).toBe('GM Guide p.14');
	});

	it('round-trips through toStatblockSource', () => {
		const original = parseStatblock(`name: Ogre
level: 5
size: Large
armor: M
hp: 64
movement: 8
saves: STR+
abilities:
- Thick Skull: Can't be Dazed.
attacks:
- **Club.** Reach 2. 2d10+4.
vulnerabilities:
- fire`)!;
		const again = parseStatblock(toStatblockSource(original))!;
		expect(again).toEqual(original);
	});
});

describe('forgiving input', () => {
	it('parses the example in docs/bestiary.md as written, comments and all', async () => {
		const { readFileSync } = await import('node:fs');
		const doc = readFileSync('docs/bestiary.md', 'utf8');
		const src = /```nimble\n([\s\S]*?)\n```/.exec(doc)![1];
		expect(src).toContain('# e.g. 8, fly 10'); // the example still has its comments
		const m = parseStatblock(src)!;
		expect(m.name).toBe('Krogg, Goblin King');
		expect(m.movement).toBe('6');
		expect(m.armor).toBe('none');
		expect(m.hpPerHero).toBe(28);
		expect(m.role).toBe('legendary');
		expect(m.roleLabel).toBe('Solo');
		expect(m.attacks).toHaveLength(2);
	});

	it('drops a trailing comment from short values only', () => {
		const m = parseStatblock(`name: Wolf # 3
armor: heavy   # none, medium (M) or heavy (H)
role: regular  # regular, minion, legendary or solo
hp: 20 # flat
movement: 8, fly 10 # fast
type: Beast #pack
saves: STR+ # strong
description: Pick door # 2 or [[Lair#Den]].
bloodied: At 10 HP # it howls.`)!;
		expect(m.name).toBe('Wolf # 3');
		expect(m.armor).toBe('heavy');
		expect(m.role).toBe('regular');
		expect(m.hp).toBe(20);
		expect(m.movement).toBe('8, fly 10');
		expect(m.type).toBe('Beast #pack');
		expect(m.saves).toBe('STR+');
		expect(m.description).toBe('Pick door # 2 or [[Lair#Den]].');
		expect(m.bloodied).toBe('At 10 HP # it howls.');
	});

	it('keeps a "#" that is part of the value', () => {
		const m = parseStatblock('name: Imp\ngroup: [[Fiends#Lesser]]\nhabitat: #swamp\nattacks:\n- Sting 1d4 # not a comment')!;
		expect(m.group).toBe('[[Fiends#Lesser]]');
		expect(m.habitat).toBe('#swamp');
		expect(m.attacks?.[0].raw).toBe('Sting 1d4 # not a comment');
	});

	it('accepts * and + bullets', () => {
		const m = parseStatblock(`name: Goblin
attacks:
* Shortsword 1d6
+ **Shortbow.** 1d6
abilities:
* Nimble Escape: Can hide
- **Sneaky.** Hard to spot`)!;
		expect(m.attacks?.map(a => a.raw)).toEqual(['Shortsword 1d6', '**Shortbow.** 1d6']);
		expect(m.abilities).toEqual([{ name: 'Nimble Escape', description: 'Can hide' }, { name: 'Sneaky', description: 'Hard to spot' }]);
	});

	it('accepts defence lists on one line', () => {
		const m = parseStatblock('name: Elemental\nresistances: fire, cold\nimmunities: poison\nvulnerabilities: thunder; radiant  # ouch\nhp: 30')!;
		expect(m.resistances).toEqual(['fire', 'cold']);
		expect(m.immunities).toEqual(['poison']);
		expect(m.vulnerabilities).toEqual(['thunder', 'radiant']);
		expect(m.hp).toBe(30);
	});

	it('still reads defence lists as bullets', () => {
		const m = parseStatblock('name: Elemental\nresistances:\n- fire\n* cold')!;
		expect(m.resistances).toEqual(['fire', 'cold']);
	});
});

describe('readStatblock: forgiving, then friendly about what is left', () => {
	// Issue #17: the stat block a GM wrote from the guide's example.
	const BEAR = `name: Misha's Bear
level: 2
role: solo              # regular, minion, legendary or solo
size: Large
type: Angry Brown Bear
hp: 25             # or a flat number
armor: none             # none, medium (M) or heavy (H)
movement: 6/10 charge             # e.g. 8, fly 10
saves: STR+
actionText:
- **Charge:** When first encountered, it can charge up to 10 in a
direct line and hit with its paw. If hit, knocked prone unless you
make a STR or Dex save vs DC 12
Attack either
- **Paw** 3d6+2 (12).
- **Bite** 1d6+2 (5).

**BLOODIED:** (12) If bloodied, it can bite as a free
action.
easier: Have the Manglemaul jam after using Crack Skulls.
harder: Move often; end turns out of melee reach.`;

	it('shows the bear from issue #17: attacks under a bare actionText, wrapped lines, bold Bloodied', () => {
		const { monster: m, issues } = readStatblock(BEAR);
		expect(m!.movement).toBe('6/10 charge');
		expect(m!.attacks?.map(a => a.raw)).toEqual([
			'**Charge:** When first encountered, it can charge up to 10 in a direct line and hit with its paw. If hit, knocked prone unless you make a STR or Dex save vs DC 12',
			'**Paw** 3d6+2 (12).',
			'**Bite** 1d6+2 (5).',
		]);
		expect(m!.bloodied).toBe('(12) If bloodied, it can bite as a free action.');
		// Only "Attack either" is left over, with a way to join it to the line above.
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ line: 13, text: 'Attack either' });
		expect(issues[0].fix?.label).toBe('Join to the line above');
	});

	it('reads field names written with spaces, bold or different case', () => {
		const { monster: m, issues } = readStatblock('**Name:** Ogre\nLast Stand: Keeps swinging.\nMinion Die: d8\nHP per hero: 20\nArmour: H\n**Legendary Actions:**\n- Smash 2d10');
		expect(issues).toEqual([]);
		expect(m).toMatchObject({ name: 'Ogre', lastStand: 'Keeps swinging.', minionDie: 8, hpPerHero: 20, armor: 'heavy' });
		expect(m!.attacks?.[0].raw).toBe('Smash 2d10');
	});

	it('adds a second attacks: list to the first', () => {
		expect(readStatblock('name: A\nattacks:\n- One\nabilities:\n- X: y\nattacks:\n- Two').monster!.attacks?.map(a => a.raw)).toEqual(['One', 'Two']);
	});

	it('takes a sentence field written as a heading, and its wrapped lines', () => {
		const m = readStatblock('name: A\ndescription:\nA big bear that\nlikes honey.\nbloodied:\n- Roars.\n- Bites twice.').monster!;
		expect(m.description).toBe('A big bear that likes honey.');
		expect(m.bloodied).toBe('Roars. Bites twice.');
	});

	it('suggests the field a misspelling meant, with a fix', () => {
		const { issues } = readStatblock('name: A\nmovment: 8');
		expect(issues[0]).toMatchObject({ line: 1, mark: 'movment', hint: 'Did you mean movement?' });
		expect(issues[0].fix).toEqual({ label: 'Change to movement:', start: 1, end: 1, lines: ['movement: 8'] });
	});

	it('spots a missing colon', () => {
		const { issues } = readStatblock('name: A\nlevel 2');
		expect(issues[0].message).toBe('“level” needs a colon after it, so this line isn\'t shown.');
		expect(issues[0].fix?.lines).toEqual(['level: 2']);
	});

	it('says when list items have no heading, and offers one', () => {
		const { monster: m, issues } = readStatblock('name: A\nsaves: STR+\n- Bite 1d6\n- Claw 1d4');
		expect(m!.attacks).toBeUndefined();
		expect(issues[0].message).toBe('These 2 list items aren\'t under a heading, so they aren\'t shown.');
		expect(issues[0].fix?.lines).toEqual(['attacks:', '- Bite 1d6']);
	});

	it('says when a list is under a heading stat blocks do not show', () => {
		const { issues } = readStatblock('name: A\nabilitys:\n- Keen: Smells.');
		expect(issues[0]).toMatchObject({ line: 1, hint: 'Did you mean abilities:?' });
	});

	it('keeps attacks under a "Choose one:" line, and reads it as the attacks intro', () => {
		for (const intro of ['Choose one:', '**Pick two:**', 'Choose 1:', "After each hero's turn, choose one:"]) {
			const { monster: m, issues } = readStatblock(`name: Ogre\nattacks:\n${intro}\n- Club 2d6\n- Rock 1d8`);
			expect(m!.attacks?.map(a => a.raw)).toEqual(['Club 2d6', 'Rock 1d8']);
			expect(m!.actionText).toBe(intro.replace(/\*/g, ''));
			expect(issues).toEqual([]);
		}
	});

	it('leaves an attack that ends "or choose twice:" as an attack', () => {
		const { monster: m } = readStatblock('name: Eye\nattacks:\n- **Eye Rays.** (Reach 10) roll 2d6 or choose twice:\n- Bite 1d6\nchoose twice:');
		expect(m!.attacks?.map(a => a.raw)).toEqual(['**Eye Rays.** (Reach 10) roll 2d6 or choose twice:', 'Bite 1d6']);
	});

	it('still flags other headings after attacks: as lists that are not shown', () => {
		const { monster: m, issues } = readStatblock('name: Knight\nattacks:\n- Sword 1d10\nReactions:\n- Parry: +2 armor');
		expect(m!.attacks?.map(a => a.raw)).toEqual(['Sword 1d10']);
		expect(issues[0]).toMatchObject({ line: 3, text: 'Reactions:' });
	});

	it('joins a stray line only to the line right above, never across another stray line', () => {
		const lines = ['name: Bear', 'attacks:', '- Bite 1d6+2 piercing.', 'On a crit, the target is grappled.', "It can't move until freed."];
		const { issues } = readStatblock(lines.join('\n'));
		expect(issues.map(i => i.line)).toEqual([3, 4]);
		expect(issues[0].fix).toEqual({ label: 'Join to the line above', start: 2, end: 3, lines: ['- Bite 1d6+2 piercing. On a crit, the target is grappled.'] });
		// The second line can't join past the first, so no Fix can delete it.
		expect(issues[1].fix).toBeUndefined();
	});

	it('still joins a wrapped lower-case line onto the attack, past a line that is not shown', () => {
		const { monster: m, issues } = readStatblock('name: Bear\nattacks:\n- Bite 1d6+2.\nOn a crit, grappled.\nand also prone.');
		expect(m!.attacks?.map(a => a.raw)).toEqual(['Bite 1d6+2. and also prone.']);
		expect(issues.map(i => i.line)).toEqual([3]);
	});

	it('points at bold that never closes', () => {
		const { issues } = readStatblock('name: A\nattacks:\n- **Paw 3d6+2.\n- ***Bite.*** 1d6');
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ line: 2, mark: '**Paw', message: 'The bold here isn\'t closed: “**Paw” has ** in front but not after.' });
	});

	it('explains values Nimble does not know, and duplicates', () => {
		const { issues } = readStatblock('name: A\nhp: lots\narmor: leather\nrole: elite\nlevel: high\nsize: Small\nsize: Large');
		expect(issues.map(i => i.line)).toEqual([1, 2, 3, 4, 6]);
		expect(issues[0].message).toBe('“lots” isn\'t a number, so it has 10 HP for now.');
		expect(issues[4].message).toBe('There are two “size” lines. Only this one, the last, is used.');
	});

	it('finds nothing to say about good blocks', async () => {
		const { readFileSync } = await import('node:fs');
		const doc = readFileSync('docs/bestiary.md', 'utf8');
		expect(readStatblock(/```nimble\n([\s\S]*?)\n```/.exec(doc)![1]).issues).toEqual([]);
		expect(readStatblock('name: Goblin\nlevel: 1/2\nhp: 12\nattacks:\n- Shortsword 1d6\nresistances: fire, cold').issues).toEqual([]);
	});

	it('finds nothing to say about any bundled monster written back out', async () => {
		const { bestiaryEntries } = await import('../src/bestiary');
		const raw = (await import('../src/data/bestiary.json')).default as unknown as Parameters<typeof bestiaryEntries>[0];
		const noisy = bestiaryEntries(raw).map(e => ({ name: e.name, issues: readStatblock(toStatblockSource(e.monster)).issues })).filter(r => r.issues.length);
		expect(noisy.slice(0, 5)).toEqual([]);
	});
});

describe('applyStatblockFix in a note', () => {
	it('rewrites only the ```nimble block it came from, inside a callout too', async () => {
		const { replaceEncounterBlock } = await import('../src/encounter-def');
		const source = 'name: A\nmovment: 8';
		const issue = readStatblock(source).issues[0];
		const note = '```nimble-encounter\nname: Fight\n```\n> ```nimble\n> name: A\n> movment: 8\n> ```\n';
		expect(replaceEncounterBlock(note, 3, 6, source, applyStatblockFix(source, issue.fix!), 'nimble'))
			.toBe('```nimble-encounter\nname: Fight\n```\n> ```nimble\n> name: A\n> movement: 8\n> ```\n');
	});
});
