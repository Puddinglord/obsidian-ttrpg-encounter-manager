import { describe, expect, it } from 'vitest';
import { actionIntro, renderStatblock } from '../src/systems/nimble/render';
import { parseSaves } from '../src/systems/nimble/book-glyphs';
import { NimbleMonster } from '../src/systems/nimble/types';

const opts = { app: {} as never, sourcePath: '', variant: 'block' as const };

describe('the book block', () => {
	it('reads saves as the book prints them', () => {
		expect(parseSaves('STR+ DEX++ WIL−')).toEqual([{ stat: 'STR', marks: 1 }, { stat: 'DEX', marks: 2 }, { stat: 'WIL', marks: -1 }]);
		expect(parseSaves('ALL++')).toEqual([{ stat: 'ALL', marks: 2 }]);
		expect(parseSaves('str+, int-')).toEqual([{ stat: 'STR', marks: 1 }, { stat: 'INT', marks: -1 }]);
		expect(parseSaves('Advantage')).toEqual([{ stat: 'Advantage', marks: null }]);
	});

	it('words the actions heading as the book does', () => {
		expect(actionIntro('Choose 1:', false)).toBe('Choose 1');
		expect(actionIntro("After each hero's turn, choose one:", true)).toBe("after each hero's turn, choose one");
		expect(actionIntro('After each hero\'s turn, summon 1 bat, then choose 1 (rec. alternate):', true)).toBe('after each hero\'s turn, summon 1 bat, then choose 1 (rec. alternate)');
	});

	const grell = {
		name: 'Old Mother Grell', level: 3, role: 'legendary', size: 'Large', type: 'Swamp Matron', armor: 'medium', hp: 100, movement: '6', saves: 'STR+ INT-',
		abilities: [{ name: 'Slick Hide', description: 'Grapples against her are made with disadvantage.' }],
		attacks: [{ raw: '**Gulp.** 2d10 + 9 piercing to an adjacent creature.' }],
		bloodied: 'At 50 HP she belches out anyone swallowed.',
		lastStand: 'She regains 7 HP per hero.',
	} as unknown as NimbleMonster;

	it('draws a legendary like the GM\'s Guide: kicker, icons, ribbon, actions beside the phases', () => {
		const el = document.createElement('div');
		const b = renderStatblock(el, grell, { ...opts, onDice: () => {} });
		expect(b.classList.contains('ev-sys-nimble')).toBe(true);
		expect(b.querySelector('.monster-kicker')?.textContent).toBe('Level 3 Legendary · Large · Swamp Matron');
		expect(b.querySelector('h2.monster-name')?.textContent).toBe('Old Mother Grell');
		// HP in the heart, the armor letter; speed 6 is the default and is left off.
		expect([...b.querySelectorAll('.monster-badges .badge-value')].map(x => x.textContent)).toEqual(['100', 'M']);
		expect(b.querySelector('.move-badge')).toBeNull();
		expect(b.querySelectorAll('.saves-badge .nb-tri.is-up').length).toBe(1);
		expect(b.querySelectorAll('.saves-badge .nb-tri.is-down').length).toBe(1);
		expect(b.querySelector('.ability-item')?.textContent).toBe('Slick Hide. Grapples against her are made with disadvantage.');
		expect(b.querySelector('.actions-intro')?.textContent).toBe("Actionsafter each hero's turn, choose one");
		expect(b.querySelector('.monster-body')?.classList.contains('is-split')).toBe(true);
		// The numbers a phase triggers at, in red.
		expect([...b.querySelectorAll('.phase-hp')].map(x => x.textContent)).toEqual(['50 HP', '7 HP per hero']);
		// The damage type after the dice carries its icon.
		expect(b.querySelector('.actions-list .monster-damage-type')?.getAttribute('aria-label')).toBe('Piercing damage');
	});

	it('puts a regular monster\'s level beside its name, and an "or" between choices', () => {
		const hound = {
			name: 'Bramblehound', level: 3, type: 'Beast', armor: 'none', hp: 33, movement: '8', actionText: 'Choose 1:',
			attacks: [{ raw: '**Bite.** 1d8 + 4.' }, { raw: '**Maul.** 2d8 + 6.' }],
		} as unknown as NimbleMonster;
		const b = renderStatblock(document.createElement('div'), hound, opts);
		expect(b.querySelector('.monster-title')?.textContent).toBe('BramblehoundLvl 3, Beast');
		expect(b.querySelector('.armor-badge')).toBeNull();
		expect(b.querySelector('.move-badge .badge-value')?.textContent).toBe('8');
		expect(b.querySelector('.actions-intro')?.textContent).toBe('Choose 1');
		expect(b.querySelector('.actions-list')?.classList.contains('is-choice')).toBe(true);
	});

	it('leaves a minion\'s HP off', () => {
		const rat = { name: 'Vault Rat', level: '1/2', role: 'minion', armor: 'none', hp: 1, movement: '6' } as unknown as NimbleMonster;
		const b = renderStatblock(document.createElement('div'), rat, opts);
		expect(b.querySelector('.monster-kicker')?.textContent).toBe('Lvl 1/2 Minion');
		expect(b.querySelector('.hp-badge')).toBeNull();
	});

	it('is a size down in a hover card', () => {
		const b = renderStatblock(document.createElement('div'), grell, { ...opts, variant: 'hover' });
		expect(b.classList.contains('is-compact')).toBe(true);
	});
});
