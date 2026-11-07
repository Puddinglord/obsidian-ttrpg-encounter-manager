import { describe, expect, it } from 'vitest';
import { attackDiceKind, DiceKind, renderStatblock } from '../src/render';
import { NimbleMonster } from '../src/types';

describe('attackDiceKind', () => {
	it('treats a plain attack as an attack', () => {
		expect(attackDiceKind('**Claws.** 2d10+10')).toBe('attack');
	});

	it('treats save-based attacks as effects', () => {
		expect(attackDiceKind('Fire Breath. (1 use, Cone 5) 7d10, DC 15 DEX save for half.')).toBe('effect');
		expect(attackDiceKind('Immensity. (Reach 12) 3d20, Prone on failed DC 20 STR save. Half on save.')).toBe('effect');
		expect(attackDiceKind('Spores. (AoE 2) 2d6')).toBe('effect');
	});

	it('ignores a save in an on-hit rider', () => {
		expect(attackDiceKind('**Bite.** 1d6+2. On a hit: STR save DC 12 or Slowed for 1d4 rounds.')).toBe('attack');
		expect(attackDiceKind('Sting. 1d8+3. On hit, DC 13 STR save or Poisoned.')).toBe('attack');
	});

	it('ignores a save made to Interpose', () => {
		expect(attackDiceKind('Doomblade. 1d10+20 (Req: DC 14 WIL save to Interpose). On damage, 1 Wound.')).toBe('attack');
	});
});

describe('stat block dice', () => {
	const hound = {
		name: 'Quicksilver Hound', level: 1, hp: 16, armor: 'none',
		attacks: [{ raw: '**Bite.** 1d6+2. On a hit: STR save DC 12 or Slowed for 1d4 rounds.' }],
	} as unknown as NimbleMonster;

	it('rolls the attack as an attack and its rider dice as effects', () => {
		const seen: [string, DiceKind][] = [];
		renderStatblock(document.createElement('div'), hound, {
			app: {} as never, sourcePath: '', variant: 'block',
			onDice: (_el, expr, _label, kind) => seen.push([expr, kind]),
		});
		expect(seen).toEqual([['1d6+2', 'attack'], ['1d4', 'effect']]);
	});
});
