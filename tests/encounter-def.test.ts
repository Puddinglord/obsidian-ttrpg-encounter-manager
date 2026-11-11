import { describe, expect, it } from 'vitest';
import { encounterBlockSource, findEncounterFence, parseEncounterBlock, replaceEncounterBlock } from '../src/encounter-def';

/** What a stepper click does: parse, change one count, write. */
function bump(src: string): string {
	const def = parseEncounterBlock(src);
	def.monsters[0].count += 1;
	return encounterBlockSource(def);
}

describe('editing a block keeps what the format does not understand', () => {
	it('keeps a "- 0 Goblin" line in the monsters list', () => {
		const out = bump('name: Den\nmonsters:\n- 2 Cultist\n- 0 Goblin');
		expect(out).toBe('name: Den\nmonsters:\n- 3 Cultist\n- 0 Goblin');
		expect(parseEncounterBlock(out).monsters).toEqual([{ name: 'Cultist', count: 3 }]);
	});

	it('keeps extra keys and unknown sections', () => {
		const src = 'name: Den\nloot: 40 gp\nterrain:\n- mud\n- reeds\nmonsters:\n- 2 Cultist\nnotes: Dark.\nxp: 200';
		const def = parseEncounterBlock(src);
		expect(def.extra).toEqual(['loot: 40 gp', 'terrain:', '- mud', '- reeds', 'xp: 200']);
		expect(def.monsters).toEqual([{ name: 'Cultist', count: 2 }]);
		const out = bump(src);
		for (const line of ['loot: 40 gp', 'terrain:', '- mud', '- reeds', 'xp: 200', '- 3 Cultist', 'notes: Dark.']) expect(out.split('\n')).toContain(line);
		// Stable from then on: a second edit changes only the count.
		expect(bump(out)).toBe(out.replace('- 3 Cultist', '- 4 Cultist'));
		expect(parseEncounterBlock(out)).toEqual({ ...def, monsters: [{ name: 'Cultist', count: 3 }] });
	});

	it('keeps multi-line notes', () => {
		const src = 'name: Den\nmonsters:\n- 2 Cultist\nnotes: The cultists chant.\n  They flee at half strength.\nTactics matter: hold the door.\n  - a list item\n  loot: none';
		const def = parseEncounterBlock(src);
		expect(def.notes).toBe('The cultists chant.\nThey flee at half strength.\nTactics matter: hold the door.\n- a list item\nloot: none');
		expect(def.extra).toBeUndefined();
		const out = encounterBlockSource(def);
		expect(out).toBe('name: Den\nmonsters:\n- 2 Cultist\nnotes: The cultists chant.\n  They flee at half strength.\n  Tactics matter: hold the door.\n  - a list item\n  loot: none');
		expect(parseEncounterBlock(out)).toEqual(def);
	});

	it('reads notes written under a "notes:" heading', () => {
		const def = parseEncounterBlock('name: Den\nnotes:\nFirst line.\nSecond line.\nmonsters:\n- 1 Goblin');
		expect(def.notes).toBe('First line.\nSecond line.');
		expect(def.monsters).toEqual([{ name: 'Goblin', count: 1 }]);
		expect(parseEncounterBlock(encounterBlockSource(def))).toEqual(def);
	});

	it('keeps [[wikilink]] and `nimble:` names as written', () => {
		const src = 'name: Den\nmonsters:\n- 2 [[Goblin]] +1\n- 1 [[Klarg|the boss]]\n- 3 `nimble:Wolf`\n- 1 Ogre';
		const def = parseEncounterBlock(src);
		expect(def.monsters.map(m => m.name)).toEqual(['Goblin', 'Klarg', 'Wolf', 'Ogre']);
		expect(encounterBlockSource(def)).toBe(src);
		expect(bump(src)).toBe(src.replace('- 2 [[Goblin]] +1', '- 3 [[Goblin]] +1'));
	});

	it('writes a plain block exactly as before', () => {
		const src = 'name: Ambush\nparty: true\nmonsters:\n- 2 Goblin\n- 4 Goblin Minion\nnotes: In the reeds.';
		expect(encounterBlockSource(parseEncounterBlock(src))).toBe(src);
	});
});

describe('finding a block in its note', () => {
	const body = 'name: Den\nmonsters:\n- 2 Cultist';
	const next = 'name: Den\nmonsters:\n- 3 Cultist';

	it('a plain block', () => {
		const text = ['Intro', '```nimble-encounter', ...body.split('\n'), '```', 'Outro'].join('\n');
		expect(findEncounterFence(text.split('\n'), 1, 5, body)).toEqual({ open: 1, close: 5, prefix: '' });
		expect(replaceEncounterBlock(text, 1, 5, body, next)).toBe(['Intro', '```nimble-encounter', ...next.split('\n'), '```', 'Outro'].join('\n'));
	});

	it('a block in a callout: the section is the whole callout', () => {
		const lines = ['> [!danger] Ambush', '> Read this first.', '> ```nimble-encounter', ...body.split('\n').map(l => `> ${l}`), '> ```', '> After the fight.'];
		const out = replaceEncounterBlock(lines.join('\n'), 0, lines.length - 1, body, `${next}\nnotes: a\n\n  b`)!.split('\n');
		expect(out).toEqual(['> [!danger] Ambush', '> Read this first.', '> ```nimble-encounter', '> name: Den', '> monsters:', '> - 3 Cultist', '> notes: a', '>', '>   b', '> ```', '> After the fight.']);
	});

	it('a block under a nested list item keeps its indentation', () => {
		const lines = ['- Area 1', '  - The den', '    ~~~nimble-encounter', ...body.split('\n').map(l => `    ${l}`), '    ~~~', '  - The hall', '- Area 2'];
		const out = replaceEncounterBlock(lines.join('\n'), 0, lines.length - 1, body, next)!.split('\n');
		expect(out).toEqual(['- Area 1', '  - The den', '    ~~~nimble-encounter', '    name: Den', '    monsters:', '    - 3 Cultist', '    ~~~', '  - The hall', '- Area 2']);
	});

	it('two blocks in one callout: picks the one whose body matches', () => {
		const other = 'name: Hall\nmonsters:\n- 1 Ogre';
		const block = (b: string) => ['> ```nimble-encounter', ...b.split('\n').map(l => `> ${l}`), '> ```'];
		const lines = ['> [!note]', ...block(other), '> Between.', ...block(body), '> End.'];
		const span = findEncounterFence(lines, 0, lines.length - 1, body)!;
		expect(span.open).toBe(7);
		const out = replaceEncounterBlock(lines.join('\n'), 0, lines.length - 1, body, next)!;
		expect(out.split('\n')).toEqual(['> [!note]', ...block(other), '> Between.', ...block(next), '> End.']);
	});

	it('changes nothing when the block is not there', () => {
		const text = ['> [!note]', '> Just prose now.', '> - 2 Cultist', '> more'].join('\n');
		expect(replaceEncounterBlock(text, 0, 3, body, next)).toBeNull();
		// The note changed under the rendered block: the fence is there but it's a different encounter.
		const moved = ['```nimble-encounter', 'name: Other', 'monsters:', '- 1 Ogre', '```'].join('\n');
		expect(replaceEncounterBlock(moved, 0, 4, body, next)).toBeNull();
		// Stale line numbers pointing at ordinary text.
		const stale = ['a', 'b', 'c', 'd', 'e', '```nimble-encounter', ...body.split('\n'), '```'].join('\n');
		expect(replaceEncounterBlock(stale, 0, 4, body, next)).toBeNull();
		// An unclosed fence is not a block to write into.
		expect(replaceEncounterBlock(['```nimble-encounter', ...body.split('\n')].join('\n'), 0, 3, body, next)).toBeNull();
	});

	it('keeps Windows line endings and longer fences', () => {
		const text = ['````nimble-encounter', ...body.split('\n'), '````', 'x'].join('\r\n');
		expect(replaceEncounterBlock(text, 0, 4, body, next)).toBe(['````nimble-encounter', ...next.split('\n'), '````', 'x'].join('\r\n'));
	});
});
