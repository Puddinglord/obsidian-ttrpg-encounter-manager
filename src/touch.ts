// Touch and small-screen helpers. Desktop with a mouse is unaffected.

import { App, Modal, Platform, Setting } from 'obsidian';

/** A coarse pointer (finger) is the main input: phones, tablets, touch laptops. */
export function isTouch(): boolean {
	return Platform.isMobile || (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
}

/** Phone-sized screen: popovers become bottom sheets, two-pane views stack. */
export function isPhone(): boolean {
	return Platform.isPhone || (typeof activeDocument !== 'undefined' && activeDocument.body.hasClass('is-phone'));
}

/**
 * Long-press (or right-click) opens a menu. Touch users can't right-click, so
 * anything behind a context menu must also be reachable this way.
 */
export function onLongPress(el: HTMLElement, handler: (e: MouseEvent | PointerEvent) => void, ms = 480): void {
	let timer: number | null = null;
	let start: { x: number; y: number; id: number } | null = null;
	let fired = false;
	const doc = el.ownerDocument;
	// Listen on the document while a press is pending: a parent (e.g. the map) may
	// capture the pointer for a pan or pinch, and those moves must still cancel us.
	const onMove = (e: PointerEvent) => {
		if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
	};
	const onDown = (e: PointerEvent) => { if (start && e.pointerId !== start.id) cancel(); }; // a second finger: pinch, not a press
	const cancel = () => {
		if (timer) window.clearTimeout(timer);
		timer = null;
		start = null;
		doc.removeEventListener('pointermove', onMove, true);
		doc.removeEventListener('pointerdown', onDown, true);
		doc.removeEventListener('pointerup', cancel, true);
		doc.removeEventListener('pointercancel', cancel, true);
	};
	el.addEventListener('pointerdown', (e) => {
		if (e.pointerType === 'mouse') return;
		cancel();
		fired = false;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
		doc.addEventListener('pointermove', onMove, true);
		doc.addEventListener('pointerdown', onDown, true);
		doc.addEventListener('pointerup', cancel, true);
		doc.addEventListener('pointercancel', cancel, true);
		timer = window.setTimeout(() => { cancel(); fired = true; handler(e); }, ms);
	});
	// The click that follows a long-press shouldn't also open the link.
	el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
	// Mouse right-click, and Android's own long-press: one menu, not two.
	el.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		const pending = !!timer;
		cancel();
		if (!fired || pending) { fired = e.pointerType !== 'mouse' && !!pending; handler(e); }
	});
}

/** Obsidian-styled confirm dialog (window.confirm isn't reliable in the mobile app). */
export function confirmAction(app: App, title: string, body: string, cta = 'OK', warning = false): Promise<boolean> {
	return new Promise((resolve) => {
		let answered = false;
		const modal = new (class extends Modal {
			onOpen() {
				this.titleEl.setText(title);
				if (body) this.contentEl.createEl('p', { text: body });
				new Setting(this.contentEl)
					.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
					.addButton(b => {
						b.setButtonText(cta).onClick(() => { answered = true; resolve(true); this.close(); });
						if (warning) b.setWarning(); else b.setCta();
					});
			}
			onClose() { if (!answered) resolve(false); this.contentEl.empty(); }
		})(app);
		modal.open();
	});
}
