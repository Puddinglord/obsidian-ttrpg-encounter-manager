import { describe, expect, it } from 'vitest';
import { encounterBlockSource, parseEncounterBlock, parseMonsterLine } from '../src/encounter-def';
import { shiftLevel, shiftMonster } from '../src/rules';
import type { NimbleMonster } from '../src/types';

describe('level shifts in encounter blocks', () => {
	it('reads +N / -N / (−N) at the end of a line', () => {
		expect(parseMonsterLine('- 2 Cultist +1')).toEqual({ name: 'Cultist', count: 2, shift: 1 });
		expect(parseMonsterLine('- 3 Zombie (-1)')).toEqual({ name: 'Zombie', count: 3, shift: -1 });
		expect(parseMonsterLine('- Zalryr (−2)')).toEqual({ name: 'Zalryr', count: 1, shift: -2 });
		// Names with numbers in them are left alone.
		expect(parseMonsterLine('- 1 Mage (lvl 2)')).toEqual({ name: 'Mage (lvl 2)', count: 1 });
		expect(parseMonsterLine('- 2 Goblin')).toEqual({ name: 'Goblin', count: 2 });
	});

	it('round-trips through the block source', () => {
		const src = 'name: Den\nmonsters:\n- 2 Cultist +1\n- 3 Zombie -1\n- 1 Goblin';
		const def = parseEncounterBlock(src);
		expect(def.monsters.map(m => m.shift ?? 0)).toEqual([1, -1, 0]);
		expect(encounterBlockSource(def)).toBe(src);
	});
});

describe('shiftMonster', () => {
	const base: NimbleMonster = { name: 'Cultist', level: 1, hp: 20, armor: 'none', abilities: [], attacks: [] } as unknown as NimbleMonster;

	it('moves along the level ladder', () => {
		expect(shiftLevel(1, 1)).toBe(2);
		expect(shiftLevel(1, -1)).toBe(1 / 2);
		expect(shiftLevel(1 / 2, -1)).toBe(1 / 3);
		expect(shiftLevel(30, 1)).toBe(30);
	});

	it('scales HP, records the shift and explains it on the stat block', () => {
		const up = shiftMonster(base, 1);
		expect(up.level).toBe('2');
		expect(up.hp).toBe(25);
		expect(up.levelShift).toBe(1);
		expect(up.abilities?.[0].name).toBe('Tougher (+1 level)');
		const down = shiftMonster(base, -1);
		expect(down.level).toBe('1/2');
		expect(down.hp).toBe(16);
		expect(down.abilities?.[0].name).toMatch(/^Weaker/);
		// Shifting again replaces the note instead of stacking two.
		expect(shiftMonster(up, 1).abilities?.filter(a => /Tougher|Weaker/.test(a.name)).length).toBe(1);
	});

	it('leaves minions and zero shifts alone', () => {
		const minion = { ...base, role: 'minion' } as NimbleMonster;
		expect(shiftMonster(minion, 1)).toBe(minion);
		expect(shiftMonster(base, 0)).toBe(base);
	});
});
