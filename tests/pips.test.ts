import { describe, expect, it } from 'vitest';
import { pipStep } from '../src/core/pips';
import { renderPipRow } from '../src/core/pip-row';
import { newFight, setDeathSaves5e } from '../src/systems/dnd5e/combat';

/** A live row of pips: re-drawn after every tap, as the views do. */
function row(start: number, max: number) {
	const host = document.createElement('div');
	let count = start;
	const draw = () => { host.empty(); renderPipRow(host, { name: 'Test', count, max, set: n => { count = n; draw(); } }); };
	draw();
	return {
		tap: (i: number) => (host.querySelectorAll('button.ev-pip')[i] as HTMLElement).click(),
		get count() { return count; },
		filled: () => [...host.querySelectorAll('button.ev-pip')].map(p => p.classList.contains('is-on')),
	};
}

describe('pips, every game', () => {
	it('a filled pip takes one away, an empty one adds one, never jumping', () => {
		expect(pipStep(3, true, 3)).toBe(2);
		expect(pipStep(2, false, 3)).toBe(3);
		expect(pipStep(0, true, 3)).toBe(0);
		expect(pipStep(3, false, 3)).toBe(3);
	});
	it('three pips, the way a player taps them', () => {
		const r = row(3, 3);
		r.tap(2); expect(r.count).toBe(2); // the right one unfills
		r.tap(2); expect(r.count).toBe(3); // and fills again
		r.tap(1); expect(r.count).toBe(2); // the middle one, with the right filled: the right one unfills
		r.tap(1); expect(r.count).toBe(1); // the middle one again: it unfills
		r.tap(1); expect(r.count).toBe(2); // and again: it fills
		expect(r.filled()).toEqual([true, true, false]);
	});
	it('tapping far right of the filled ones adds just one', () => {
		const r = row(1, 5);
		r.tap(4);
		expect(r.count).toBe(2);
	});
});

describe('5e death saves by hand', () => {
	const hero = () => {
		const f = newFight('Test', '2024');
		f.combatants.push({ id: 'h', label: 'Mira', side: 'hero', hp: 0, maxHp: 20, conditions: [] } as never);
		return f;
	};
	it('three successes stabilise, three failures kill, and taking one back undoes it', () => {
		const f = hero();
		setDeathSaves5e(f, 'h', 3, 0);
		expect(f.combatants[0].stable).toBe(true);
		setDeathSaves5e(f, 'h', 2, 0);
		expect(f.combatants[0].stable).toBe(false);
		setDeathSaves5e(f, 'h', 2, 3);
		expect(f.combatants[0].dead).toBe(true);
		setDeathSaves5e(f, 'h', 2, 2);
		expect(f.combatants[0].dead).toBe(false);
	});
});

describe('pips animate the one that changed', () => {
	it('the pip that filled or emptied since the last draw, and only that one', async () => {
		const { pipMoved } = await import('../src/core/pips');
		expect([0, 1, 2].map(i => pipMoved(3, i, i < 2))).toEqual([undefined, undefined, 'off']);
		expect([0, 1, 2].map(i => pipMoved(2, i, i < 3))).toEqual([undefined, undefined, 'on']);
		expect(pipMoved(undefined, 0, true)).toBeUndefined();
	});
	it('a keyed row marks the pip that just changed', () => {
		const host = document.createElement('div');
		renderPipRow(host, { key: 't', name: 'T', count: 3, max: 3, set: () => {} });
		host.empty();
		renderPipRow(host, { key: 't', name: 'T', count: 2, max: 3, set: () => {} });
		expect([...host.querySelectorAll('.ev-pip')].map(p => p.className)).toEqual(['ev-pip is-on', 'ev-pip is-on', 'ev-pip just-off']);
	});
});
