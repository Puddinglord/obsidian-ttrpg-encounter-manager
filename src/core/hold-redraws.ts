// A tap is a press and a release on the same element. A view that redraws when its data changes (a note's
// properties, the fight) can replace that element between the two, and the tap is lost: no click, no keypad.
// It happens most right after a change of your own, like the HP bar redrawing just as you tap it again.
//
// holdRedraws keeps those redraws back while a finger, pen or mouse button is down inside the view, and runs the
// last one once it's released, after the tap's click has landed. A redraw asked for during the release itself (a
// drag-to-reorder dropping) runs straight away, as before.

import type { Component } from 'obsidian';

/**
 * Wraps `redraw` for `root`: call what this returns wherever the data changed under the view (a store's or the
 * metadata cache's `changed`). Redraws the view asks for itself (a tab, a toggle) can keep calling `redraw`.
 */
export function holdRedraws(owner: Component, root: HTMLElement, redraw: () => void): () => void {
	const doc = root.ownerDocument;
	const win = doc.defaultView ?? window;
	let down = false;
	let waiting = false;
	let timer = 0;
	const flush = () => {
		win.clearTimeout(timer);
		down = false;
		if (!waiting) return;
		waiting = false;
		redraw();
	};
	const onDown = (e: PointerEvent) => {
		if (!e.isPrimary) return;
		down = true;
		// A release we never hear about (the pointer captured elsewhere, the window left) mustn't hold the view for good.
		win.clearTimeout(timer);
		timer = win.setTimeout(flush, 4000);
	};
	// Registered when the view opens, so this runs before listeners added on the press (a drag's drop).
	const onUp = (e: PointerEvent) => {
		if (!e.isPrimary || !down) return;
		down = false;
		win.clearTimeout(timer);
		// After the click this release makes, which is dispatched in the same task.
		if (waiting) timer = win.setTimeout(flush, 0);
	};
	root.addEventListener('pointerdown', onDown, true);
	doc.addEventListener('pointerup', onUp, true);
	doc.addEventListener('pointercancel', onUp, true);
	owner.register(() => {
		win.clearTimeout(timer);
		root.removeEventListener('pointerdown', onDown, true);
		doc.removeEventListener('pointerup', onUp, true);
		doc.removeEventListener('pointercancel', onUp, true);
	});
	return () => {
		if (down) { waiting = true; return; }
		waiting = false;
		win.clearTimeout(timer);
		redraw();
	};
}
