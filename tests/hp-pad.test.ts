import { afterEach, describe, expect, it } from 'vitest';
import { closeHpPad, openHpPad } from '../src/core/tracker/hp-pad';
import type { HpCommand } from '../src/core/tracker/hp';
import { damageTaken } from '../src/systems/dnd5e/combat';
import { dealtDamage, openHpCalculator } from '../src/systems/nimble/hp-pad';
import type { EncounterCreature } from '../src/systems/nimble/types';

// The keypad's big number, its button and the sum in its preview are one number: the damage that lands.

const hound: EncounterCreature = {
	id: 'h3', side: 'monster', label: 'Quicksilver Hound-3', monster: { name: 'Quicksilver Hound', armor: 'none', hp: 16, movement: '8' },
	currentHp: 16, maxHp: 16, conditions: [],
};
const knight: EncounterCreature = { ...hound, id: 'k', label: 'Knight', monster: { name: 'Knight', armor: 'medium', hp: 40, movement: '6' }, currentHp: 40, maxHp: 40 };
const brakka: EncounterCreature = {
	id: 'b', side: 'hero', label: 'Brakka', monster: { name: 'Brakka', armor: 'none', hp: 28, movement: '6' }, currentHp: 21, maxHp: 28, conditions: [], defense: 4, wounds: 0, maxWounds: 6,
};

const pad = () => document.querySelector<HTMLElement>('.nimble-hp-pad')!;
const buttons = (sel: string) => Array.from(pad().querySelectorAll<HTMLButtonElement>(sel));
const press = (...keys: string[]) => { for (const k of keys) buttons('.hp-pad-keys button').find(b => b.textContent === k)!.click(); };
const tap = (sel: string, text: string) => buttons(sel).find(b => b.textContent!.startsWith(text))!.click();
const read = () => ({
	screen: pad().querySelector('.hp-pad-display')!.textContent,
	button: pad().querySelector('.hp-pad-apply')!.textContent,
	sum: pad().querySelector('.hp-pad-preview')!.textContent,
});

afterEach(() => { closeHpPad(); document.body.empty(); });

describe('Nimble keypad: what lands', () => {
	it('Vulnerable adds 10: the screen, the button and the sum all say 19', () => {
		let applied: HpCommand | null = null;
		openHpCalculator(document.body.createDiv(), hound, true, (cmd) => { applied = cmd; });
		press('9');
		expect(read()).toEqual({ screen: '9', button: 'Deal 9 damage', sum: '9 → 7/16' });
		tap('.hp-pad-toggles button', 'Vulnerable');
		expect(read()).toEqual({ screen: '19', button: 'Deal 19 damage', sum: '9 + 10 (vulnerable) = 19 → 0/16' });
		pad().querySelector<HTMLButtonElement>('.hp-pad-apply')!.click();
		// The command stays what was typed; the store adds the 10 (the preview is its own maths).
		expect(applied).toEqual({ kind: 'damage', amount: 9, crit: false, type: 'vulnerable' });
	});

	it('armor comes off, and a crit ignores it', () => {
		openHpCalculator(document.body.createDiv(), knight, true, () => {});
		press('1', '5');
		expect(read()).toEqual({ screen: '5', button: 'Deal 5 damage', sum: '15 − 10 (Medium armor) = 5 → 35/40' });
		press('Crit');
		expect(read().screen).toBe('15');
		expect(read().button).toBe('Deal 15 damage');
	});

	it("a hero's Defend takes their Defense off the hit", () => {
		openHpCalculator(document.body.createDiv(), brakka, true, () => {});
		press('9');
		tap('.hp-pad-qa', 'Defend');
		expect(read()).toEqual({ screen: '5', button: 'Deal 5 damage', sum: '9 − 4 = 5 · → 16/28' });
		expect(dealtDamage(brakka, 9, true, undefined, true, { defend: true })).toBe(9);
	});

	it('healing shows what was typed', () => {
		openHpCalculator(document.body.createDiv(), hound, true, () => {}, { start: 'heal' });
		press('4');
		expect(read().screen).toBe('4');
		expect(read().button).toBe('Heal 4');
	});
});

describe('5e keypad: Vulnerable doubles, Resisted halves', () => {
	it('says what lands on the screen and the button', () => {
		openHpPad(document.body.createDiv(), {
			id: 'ogre', label: 'Ogre', sub: '59 / 59 HP', system: 'dnd5e', crit: true, mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
			preview: (mode, v, crit, mod) => (mode === 'damage' && v ? `takes ${damageTaken({ kind: 'damage', amount: v, crit, type: mod })}` : ''),
			dealt: (v, crit, mod) => damageTaken({ kind: 'damage', amount: v, crit, type: mod }),
			apply: () => {},
		});
		press('9');
		tap('.hp-pad-toggles button', 'Vulnerable');
		expect(read()).toEqual({ screen: '18', button: 'Deal 18 damage', sum: 'takes 18' });
		tap('.hp-pad-toggles button', 'Resisted');
		expect(read()).toEqual({ screen: '4', button: 'Deal 4 damage', sum: 'takes 4' });
	});
});
