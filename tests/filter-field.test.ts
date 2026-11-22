import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; } }));

import { FilterField } from '../src/systems/nimble/filter-field';

function field() {
	const chipsEl = document.body.createDiv();
	const input = chipsEl.createEl('input');
	let changes = 0;
	const f = new FilterField({ input, chipsEl, onChange: () => { changes++; } });
	const type = (text: string) => { input.value += text; input.setSelectionRange(input.value.length, input.value.length); input.dispatchEvent(new Event('input')); };
	const key = (k: string) => f.key(new KeyboardEvent('keydown', { key: k }));
	return { f, input, chipsEl, type, key, changes: () => changes };
}

describe('the shared search field', () => {
	it('turns "type:" into a chip waiting for its value; the value completes it and nothing is left in the box', () => {
		const { f, input, type } = field();
		type('type:');
		expect(f.pending).toBe('type');
		expect(input.value).toBe('');
		type('und');
		expect(f.token()?.text).toBe('type:und');
		f.apply({ kind: 'value', token: 'type:Undead', label: 'type:Undead', detail: '' });
		expect(f.chips).toEqual(['type:Undead']);
		expect(f.pending).toBeNull();
		expect(input.value).toBe('');
		expect(f.query()).toBe('type:Undead');
	});

	it('starts a waiting chip from a key suggestion, and keeps earlier words as their own chip', () => {
		const { f, input, type } = field();
		type('goblin ty');
		f.apply({ kind: 'key', token: 'type:', label: 'type:', detail: '' });
		expect(f.chips).toEqual(['goblin']);
		expect(f.pending).toBe('type');
		expect(input.value).toBe('');
	});

	it('finishes a typed value with no suggestion as typed (level:>3)', () => {
		const { f, input, type } = field();
		type('level:');
		type('>3');
		expect(f.commit()).toBe(true);
		expect(f.chips).toEqual(['level:>3']);
		expect(input.value).toBe('');
	});

	it('Backspace cancels a waiting chip, then reopens the last chip to edit its value', () => {
		const { f, input, type, key } = field();
		f.set('type:Undead role:minion ');
		expect(f.chips).toEqual(['type:Undead', 'role:minion']);
		type('size:');
		expect(key('Backspace')).toBe(true);
		expect(f.pending).toBeNull();
		expect(key('Backspace')).toBe(true);
		expect(f.pending).toBe('role');
		expect(input.value).toBe('minion');
		expect(f.chips).toEqual(['type:Undead']);
	});

	it('Escape cancels a waiting chip with its half-typed value', () => {
		const { f, input, type, key } = field();
		type('school:nec');
		expect(key('Escape')).toBe(true);
		expect(f.pending).toBeNull();
		expect(input.value).toBe('');
	});

	it('counts suggestions without chips of the key being typed (values of one key are alternatives)', () => {
		const { f, type } = field();
		f.set('type:Undead level:3 ');
		type('type:cr');
		expect(f.rest()).toBe('level:3');
	});

	it('takes a whole query at once: finished filters become chips, a trailing one waits for more', () => {
		const { f, input } = field();
		f.set('role:minion goblin type:gob');
		expect(f.chips).toEqual(['role:minion', 'goblin']);
		expect(f.pending).toBe('type');
		expect(input.value).toBe('gob');
	});

	it('draws a chip per filter, plus the waiting one, and only redraws when they change', () => {
		const { f, chipsEl, type } = field();
		f.set('type:Undead ');
		type('school:');
		expect(chipsEl.querySelectorAll('.nimble-cmpx-chip').length).toBe(2);
		expect(chipsEl.querySelectorAll('.nimble-cmpx-chip.is-pending').length).toBe(1);
		const first = chipsEl.querySelector('.nimble-cmpx-chip');
		type('n');
		expect(chipsEl.querySelector('.nimble-cmpx-chip')).toBe(first);
	});
});

describe('a space after a whole value', () => {
	it('finishes the waiting chip; a partial value keeps going', () => {
		const chipsEl = document.body.createDiv();
		const input = chipsEl.createEl('input');
		const f = new FilterField({ input, chipsEl, onChange: () => undefined, isValue: (k, v) => k === 'type' && v.toLowerCase() === 'fiendish tyrants' || k === 'category' && v === 'weapon' });
		const type = (t: string) => { input.value += t; input.dispatchEvent(new Event('input')); };
		type('category:weapon ');
		expect(f.chips).toEqual(['category:weapon']);
		expect(f.pending).toBeNull();
		type('type:');
		type('fiendish ');
		expect(f.pending).toBe('type');
		type('tyrants ');
		expect(f.chips).toEqual(['category:weapon', 'type:"fiendish tyrants"']);
	});
});

