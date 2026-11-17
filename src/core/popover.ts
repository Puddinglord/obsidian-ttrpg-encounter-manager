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
	opts: { cls?: string; onClose?: () => void; width?: number; placement?: 'below' | 'side'; sideOf?: HTMLElement | null } = {},
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
	if (!sheet) position(el, anchor, win, opts.placement ?? 'below', opts.sideOf ?? null);

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

/**
 * Below the anchor if it fits, otherwise above; kept inside the window.
 * 'side' puts it beside the anchor, or beside `sideOf` (left first), so the
 * list the anchor sits in stays visible; it falls back to below when there's no room.
 */
function position(el: HTMLElement, anchor: HTMLElement, win: Window, placement: 'below' | 'side', sideOf: HTMLElement | null): void {
	const rect = anchor.getBoundingClientRect();
	const margin = 8;
	if (placement === 'side') {
		const w = el.offsetWidth, h = el.offsetHeight;
		// Beside the whole panel (`sideOf`) when given, so none of it is covered.
		const box = (sideOf ?? anchor).getBoundingClientRect();
		const left = box.left - w - 10 >= margin ? box.left - w - 10 : box.right + 10 + w <= win.innerWidth - margin ? box.right + 10 : null;
		if (left !== null) {
			const top = Math.max(margin, Math.min(rect.top + rect.height / 2 - h / 2, win.innerHeight - h - margin));
			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			if (h > win.innerHeight - margin * 2) el.style.maxHeight = `${win.innerHeight - margin * 2}px`;
			return;
		}
	}
	el.style.left = `${Math.max(margin, Math.min(rect.left, win.innerWidth - el.offsetWidth - margin))}px`;
	el.style.top = `${rect.bottom + 4}px`;
	const r = el.getBoundingClientRect();
	if (r.bottom > win.innerHeight - margin) {
		const above = rect.top - r.height - 4;
		el.style.top = `${Math.max(margin, above)}px`;
		if (above < margin) el.style.maxHeight = `${win.innerHeight - margin * 2}px`;
	}
}
