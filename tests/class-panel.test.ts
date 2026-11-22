import { describe, expect, it } from 'vitest';
import { Compendium } from '../src/systems/nimble/compendium';
import { featureUses, Frontmatter, readCharacter, setQuarry } from '../src/systems/nimble/character-def';
import { classPanelRows, rulesFor } from '../src/systems/nimble/class-panel-def';
import { faceRows, renderFacePicker } from '../src/core/face-picker';
import BUNDLED from '../src/systems/nimble/data/compendium.json';

const comp = new Compendium(BUNDLED as never);
const rows = (fm: Frontmatter) => {
	const s = readCharacter(fm, comp, 'Hero');
	return classPanelRows(s, comp.rules.magicRules);
};

describe('the class panel: one frame for every class', () => {
	it('a Berserker holds Fury Dice, with Rage under them and One with the Ancients as a use', () => {
		const r = rows({ class: 'Berserker', level: 3, str: 3, conditions: ['Raging'], resources: { 'Fury Dice': { current: 2, rolled: [3, 1] } } });
		expect(r.map(x => `${x.kind}:${x.label}`)).toEqual(['dice:Fury Dice', 'state:Rage', 'uses:One with the Ancients']);
		const fury = r[0];
		if (fury.kind !== 'dice') throw new Error('dice');
		expect(fury.faces).toEqual([3, 1]);
		expect(fury.sides).toBe(4);
		expect(fury.max).toBe(3);
		expect(fury.roll).toBe(1);
		// No formula under the name: it's the tooltip. The rules are the book's.
		expect(fury.tip).toBe('d4 · up to KEY (3) · lost when your Rage ends');
		expect(fury.rules.map(x => x.name)).toEqual(['That all you got?!']);
		const rage = r[1];
		expect(rage.kind === 'state' && rage.on).toBe(true);
		expect(rage.rules[0].text).toMatch(/^\(1\/turn\) Action: Roll a Fury Die/);
		const uses = r[2];
		expect(uses.kind === 'uses' && [uses.left, uses.max]).toEqual([1, 1]);
	});

	it('a Mage has mana, with the magic rules\' words', () => {
		const r = rows({ class: 'Mage', level: 3, int: 2, mana: 6 });
		const mana = r.find(x => x.key === 'mana');
		expect(mana?.kind).toBe('pool');
		if (mana?.kind !== 'pool') return;
		expect([mana.value, mana.max]).toEqual([6, 9]);
		expect(mana.rules[0].text).toMatch(/^Powerful Tiered spells require mana/);
		expect(mana.tip).toBe('(INT×3)+LVL · back on a Safe Rest');
	});

	it('an Oathsworn holds Judgment Dice (count or faces) and a Lay on Hands pool', () => {
		const r = rows({ class: 'Oathsworn', level: 3, wil: 2, resources: { 'Judgment Dice': { current: 1, rolled: [5] }, 'Lay on Hands': 11 } });
		const judgment = r.find(x => x.label === 'Judgment Dice');
		const loh = r.find(x => x.label === 'Lay on Hands');
		expect(judgment?.kind === 'dice' && judgment.faces).toEqual([5]);
		expect(judgment?.kind === 'dice' && judgment.sides).toBe(8);
		expect(judgment?.rules[0].name).toBe('Radiant Judgment');
		expect(loh?.kind === 'number' && [loh.value, loh.max, loh.spend]).toEqual([11, 15, 'Heal']);
		expect(loh?.rules[0].text).toMatch(/^Gain a magical pool of healing power/);
	});

	it('a Hunter marks a Quarry first, then counts Thrill of the Hunt charges', () => {
		const fm: Frontmatter = { class: 'Hunter', level: 2, resources: { 'Thrill of the Hunt charges': 2 } };
		setQuarry(fm, 'Goblin Taskmaster');
		const r = rows(fm);
		expect(r.map(x => x.kind)).toEqual(['target', 'charges']);
		expect(r[0].kind === 'target' && r[0].target).toBe('Goblin Taskmaster');
		expect(r[1].kind === 'charges' && r[1].value).toBe(2);
		expect(r[1].rules[0].name).toBe('Thrill of the Hunt');
		setQuarry(fm, ' ');
		expect('quarry' in fm).toBe(false);
	});

	it('uses between Safe Rests come from a feature\'s own words', () => {
		expect(featureUses('(1/Safe Rest) When faced with a decision…')).toEqual({ formula: '1' });
		expect(featureUses('Whenever you roll a 1… (WIL/Safe Rest) If you would fail')).toEqual({ formula: 'WIL' });
		expect(featureUses('(2×WIL times/Safe Rest) Inspire')).toEqual({ formula: '2×WIL' });
		expect(featureUses('(1/encounter) Grapple')).toBeNull();
		expect(featureUses('(DEX/Safe Rest)')).toEqual({ formula: 'DEX' });
	});

	it('finds a resource\'s rules by name, by prefix, or by mention', () => {
		const f = [
			{ name: 'Thrill of the Hunt', text: 'Gain a charge…', group: 'Class' as const },
			{ name: 'Coordinated Strike!', text: '(1/encounter) You and an ally…', group: 'Class' as const },
		];
		expect(rulesFor('Thrill of the Hunt charges', f)[0].name).toBe('Thrill of the Hunt');
		expect(rulesFor('Coordinated Strike', f)[0].name).toBe('Coordinated Strike!');
		expect(rulesFor('Nothing', f)).toEqual([]);
	});
});

describe('the face picker (core): dice rolled at the table', () => {
	it('faces come in even rows: one row up to a d12, a d20 in rows of 10; halved on a phone', () => {
		expect(faceRows(4)).toEqual({ wide: 4, narrow: 4 });
		expect(faceRows(6)).toEqual({ wide: 6, narrow: 6 });
		expect(faceRows(8)).toEqual({ wide: 8, narrow: 4 });
		expect(faceRows(10)).toEqual({ wide: 10, narrow: 5 });
		expect(faceRows(12)).toEqual({ wide: 12, narrow: 6 });
		expect(faceRows(20)).toEqual({ wide: 10, narrow: 5 });
	});
	it('changing a die shows its face pressed and offers Remove; adding one doesn\'t', () => {
		const host = document.createElement('div');
		const picked: number[] = [];
		let removed = 0;
		renderFacePicker(host, { sides: 6, current: 4, label: 'Judgment die: change it to', pick: f => picked.push(f), remove: () => { removed++; } });
		const faces = [...host.querySelectorAll<HTMLButtonElement>('button.ev-face')];
		expect(faces.map(b => b.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
		expect(faces.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false', 'false']);
		faces[1].click();
		host.querySelector<HTMLButtonElement>('.ev-face-remove')!.click();
		expect(picked).toEqual([2]);
		expect(removed).toBe(1);
		const add = document.createElement('div');
		renderFacePicker(add, { sides: 20, label: 'Add a die you rolled', pick: () => undefined });
		expect(add.querySelector('.ev-face-remove')).toBeNull();
		expect(add.querySelectorAll('.ev-face').length).toBe(20);
		expect(add.querySelector<HTMLElement>('.ev-face-pick')!.style.getPropertyValue('--ev-faces')).toBe('10');
	});
});
