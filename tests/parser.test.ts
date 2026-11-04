import { describe, expect, it } from 'vitest';
import { extractNimbleBlocks, normalizeArmor, parseAbility, parseMovement, parseStatblock } from '../src/parser';

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

	it('parses solo fields', () => {
		const m = parseStatblock(`name: Dragon
monsterType: Solo
legendaryResistances: 2
bloodied: Gets angry
lastStand: Explodes
actionText: Pick two:`)!;
		expect(m.monsterType).toBe('solo');
		expect(m.legendaryResistances).toBe(2);
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
		['none', 'none'], ['N', 'none'], ['M', 'medium'], ['medium', 'medium'], ['H', 'heavy'], ['12', 'none'], ['15', 'medium'], ['18', 'heavy'], ['??', 'none'],
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
