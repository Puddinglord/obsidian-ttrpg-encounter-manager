import { describe, expect, it } from 'vitest';
import { dcPills } from '../src/tables';

function table(head: string[], rows: string[][]): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
	return el;
}
const cells = (el: HTMLElement, col: number) => [...el.querySelectorAll('tbody tr')].map(tr => tr.children[col].innerHTML);

describe('DC pills', () => {
	it('turns numbers and dashes in a DC column into pills', () => {
		const el = table(['Check', 'DC'], [['Climb', ' 12 '], ['Swim', '—'], ['Walk', '-']]);
		dcPills(el);
		expect(cells(el, 1)).toEqual(['<span class="nimble-dc">12</span>', '<span class="nimble-dc is-none">—</span>', '<span class="nimble-dc is-none">-</span>']);
		expect(el.querySelector('thead th:nth-child(2)')!.className).toBe('nimble-dc-cell');
		expect(cells(el, 0)).toEqual(['Climb', 'Swim', 'Walk']);
	});

	it('leaves links, bold, words and empty cells as written', () => {
		const rows = [['a', '<a href="x">Goblin</a>'], ['b', '<strong>15</strong>'], ['c', 'the gate'], ['d', 'DC 12'], ['e', '']];
		const el = table(['Who', 'Target'], rows);
		dcPills(el);
		expect(cells(el, 1)).toEqual(rows.map(r => r[1]));
		expect(el.querySelector('.nimble-dc-cell')).toBeNull();
	});

	it('ignores tables without a DC column and is safe to run twice', () => {
		const plain = table(['Name', 'HP'], [['Goblin', '12']]);
		dcPills(plain);
		expect(cells(plain, 1)).toEqual(['12']);
		const el = table(['Difficulty', 'Task'], [['10', 'Easy']]);
		dcPills(el);
		dcPills(el);
		expect(cells(el, 0)).toEqual(['<span class="nimble-dc">10</span>']);
	});
});
