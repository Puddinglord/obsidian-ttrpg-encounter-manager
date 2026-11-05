// One floating popover at a time (condition info, the condition picker, chip
// editors). Closes on Escape, on a tap/click outside, or when another opens.
// On phones it's a bottom sheet instead of a floating box.

import { isPhone } from './touch';

export interface PopoverHandle {
	el: HTMLElement;
	close: () => void;
}

let current: { el: HTMLElement; cleanup: () => void; anchor: HTMLElement; onClose?: () => void } | null = null;

export function closePopover(): void {
	if (!current) return;
	const c = current;
	current = null;
	c.cleanup();
	c.el.remove();
	c.onClose?.();
}

export function isPopoverOpenFor(anchor: HTMLElement, cls?: string): boolean {
	return !!current && current.anchor === anchor && (!cls || current.el.hasClass(cls));
}

export function openPopover(
	anchor: HTMLElement,
	build: (el: HTMLElement, close: () => void) => void,
	opts: { cls?: string; onClose?: () => void; width?: number } = {},
): PopoverHandle {
	closePopover();
	const doc = anchor.ownerDocument;
	const win = doc.defaultView || window;
	const el = doc.body.createDiv({ cls: `nimble-popover ${opts.cls || ''}` });
	const sheet = isPhone();
	if (sheet) {
		// Phones: a bottom sheet that's easy to reach with a thumb.
		el.addClass('is-sheet');
		el.createDiv({ cls: 'sheet-handle', attr: { 'aria-hidden': 'true' } });
	} else if (opts.width) {
		el.style.width = `${opts.width}px`;
	}
	build(el, closePopover);
	if (!sheet) position(el, anchor, win);

	const onDown = (e: PointerEvent) => {
		const t = e.target as Node;
		if (!el.contains(t) && !anchor.contains(t)) closePopover();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') { e.stopPropagation(); closePopover(); anchor.focus?.(); }
	};
	const timer = win.setTimeout(() => doc.addEventListener('pointerdown', onDown, true), 0);
	doc.addEventListener('keydown', onKey, true);
	current = {
		el,
		anchor,
		onClose: opts.onClose,
		cleanup: () => {
			win.clearTimeout(timer);
			doc.removeEventListener('pointerdown', onDown, true);
			doc.removeEventListener('keydown', onKey, true);
		},
	};
	return { el, close: closePopover };
}

/** Below the anchor if it fits, otherwise above; kept inside the window. */
function position(el: HTMLElement, anchor: HTMLElement, win: Window): void {
	const rect = anchor.getBoundingClientRect();
	const margin = 8;
	el.style.left = `${Math.max(margin, Math.min(rect.left, win.innerWidth - el.offsetWidth - margin))}px`;
	el.style.top = `${rect.bottom + 4}px`;
	const r = el.getBoundingClientRect();
	if (r.bottom > win.innerHeight - margin) {
		const above = rect.top - r.height - 4;
		el.style.top = `${Math.max(margin, above)}px`;
		if (above < margin) el.style.maxHeight = `${win.innerHeight - margin * 2}px`;
	}
}
