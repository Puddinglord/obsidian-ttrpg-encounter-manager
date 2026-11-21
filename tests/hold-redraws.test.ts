import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'obsidian';
import { holdRedraws } from '../src/core/hold-redraws';

function setup() {
	const root = document.body.appendChild(document.createElement('div'));
	const button = root.appendChild(document.createElement('button'));
	const cleanups: (() => void)[] = [];
	const owner = { register: (cb: () => void) => { cleanups.push(cb); } } as unknown as Component;
	const redraw = vi.fn();
	const changed = holdRedraws(owner, root, redraw);
	const press = (el: Element, type: 'pointerdown' | 'pointerup' | 'pointercancel', isPrimary = true) =>
		el.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary }));
	return { root, button, redraw, changed, press, unload: () => cleanups.forEach(c => c()) };
}

describe('holdRedraws', () => {
	afterEach(() => { vi.useRealTimers(); document.body.empty(); });

	it('redraws straight away when nothing is pressed', () => {
		const t = setup();
		t.changed();
		expect(t.redraw).toHaveBeenCalledTimes(1);
	});

	it('holds a change while a finger is down inside the view, then redraws once after the release', () => {
		vi.useFakeTimers();
		const t = setup();
		t.press(t.button, 'pointerdown');
		t.changed();
		t.changed();
		expect(t.redraw).not.toHaveBeenCalled();
		t.press(document.body, 'pointerup');
		// Not yet: the tap's click comes first, in the same task as the release.
		expect(t.redraw).not.toHaveBeenCalled();
		vi.runOnlyPendingTimers();
		expect(t.redraw).toHaveBeenCalledTimes(1);
	});

	it('a release with nothing held redraws nothing', () => {
		vi.useFakeTimers();
		const t = setup();
		t.press(t.button, 'pointerdown');
		t.press(t.button, 'pointerup');
		vi.runAllTimers();
		expect(t.redraw).not.toHaveBeenCalled();
	});

	it('a change asked for during the release (a drop) redraws straight away', () => {
		const t = setup();
		t.press(t.button, 'pointerdown');
		document.addEventListener('pointerup', () => t.changed(), { capture: true, once: true });
		t.press(t.button, 'pointerup');
		expect(t.redraw).toHaveBeenCalledTimes(1);
	});

	it('a cancelled press (a scroll) lets the held change through', () => {
		vi.useFakeTimers();
		const t = setup();
		t.press(t.button, 'pointerdown');
		t.changed();
		t.press(t.button, 'pointercancel');
		vi.runOnlyPendingTimers();
		expect(t.redraw).toHaveBeenCalledTimes(1);
	});

	it('a press outside the view, or by a second finger, holds nothing', () => {
		const t = setup();
		t.press(document.body, 'pointerdown');
		t.changed();
		expect(t.redraw).toHaveBeenCalledTimes(1);
		t.press(t.button, 'pointerdown', false);
		t.changed();
		expect(t.redraw).toHaveBeenCalledTimes(2);
	});

	it("a release it never hears about doesn't hold the view for good", () => {
		vi.useFakeTimers();
		const t = setup();
		t.press(t.button, 'pointerdown');
		t.changed();
		vi.advanceTimersByTime(4000);
		expect(t.redraw).toHaveBeenCalledTimes(1);
		t.changed();
		expect(t.redraw).toHaveBeenCalledTimes(2);
	});

	it('stops listening when the view unloads', () => {
		const t = setup();
		t.unload();
		t.press(t.button, 'pointerdown');
		t.changed();
		expect(t.redraw).toHaveBeenCalledTimes(1);
	});
});
