// Drag to reorder a list: any game's tracker (or any list) can use it.
//
// Pointer events, so mouse, pen and touch work alike. A mouse drags from
// anywhere on an item that isn't a control; touch and pen drag from the
// handle only (`.ev-sort-handle` by default, which takes `touch-action: none`),
// so a finger anywhere else still scrolls and long-presses as before. The item
// lifts and follows the pointer, the others slide apart to open its slot, a
// dashed slot shows where it will land, the list scrolls near its edges, and
// Escape puts everything back. On a drop the host changes its data (`onDrop`)
// and redraws; the moved item then settles from where it was let go. Reduced
// motion keeps the moves and drops the animation.
//
// Nothing here is game-specific. CSS: the "Sortable lists" section of styles.css.

export interface SortableOptions {
	/** The items: a selector for the list's children that can be dragged (and dropped between). */
	items: string;
	/** Where a touch or pen drag starts, and a mouse drag from inside a control. Default `.ev-sort-handle`. */
	handle?: string;
	/** A mouse press on these doesn't start a drag (they keep their clicks). */
	ignore?: string;
	/** An item's key. Default: its `data-id`. */
	key?: (item: HTMLElement) => string;
	/** The item as redrawn after a drop, so it can settle into place. Default: the same key in the list, if it's still there. */
	find?: (key: string) => HTMLElement | null | undefined;
	/** Called once on a drop that changes the order: the item's key, where it goes and where it was (indexes among the items). */
	onDrop: (key: string, to: number, from: number) => void;
	/** Called when an item lifts (close a hover card, a popover). */
	onStart?: (key: string) => void;
}

const IGNORE = 'button, input, textarea, select, a, label, [role="button"], [contenteditable="true"], .ev-sort-ignore';
/** How far a press moves before it's a drag: a mouse needs a little more, so clicks stay clicks. */
const SLOP = { mouse: 5, other: 3 };
/** Auto-scroll zone at the scroller's top and bottom, and the fastest it scrolls per frame. */
const EDGE = 48;
const SPEED = 16;
const SETTLE_MS = 180;

interface Press { id: number; x: number; y: number; item: HTMLElement; mouse: boolean }
interface Drag {
	item: HTMLElement;
	all: HTMLElement[];
	from: number;
	to: number;
	/** Each item's top (relative to the list), height and top margin when the drag began. */
	tops: number[];
	heights: number[];
	margins: number[];
	gap: number;
	startRel: number;
	y: number;
	slot: HTMLElement;
	scroller: HTMLElement | null;
	frame: number;
}

const isEl = (n: Element | null | undefined): n is HTMLElement => !!n && 'dataset' in n;

function reducedMotion(win: Window): boolean {
	return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** The nearest ancestor that scrolls vertically. */
function scrollParent(el: HTMLElement): HTMLElement | null {
	const win = el.ownerDocument.defaultView;
	for (let p = el.parentElement; p; p = p.parentElement) {
		const oy = win?.getComputedStyle(p).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
	}
	return null;
}

/** Make `list`'s children sortable by dragging. Returns a function that stops it. Call again after redrawing the list. */
export function makeSortable(list: HTMLElement, opts: SortableOptions): () => void {
	const doc = list.ownerDocument;
	const win = doc.defaultView ?? window;
	const handleSel = opts.handle ?? '.ev-sort-handle';
	const ignoreSel = opts.ignore ?? IGNORE;
	const keyOf = opts.key ?? ((el: HTMLElement) => el.dataset.id ?? '');
	const items = () => Array.from(list.children).filter((c): c is HTMLElement => isEl(c) && c.matches(opts.items));
	let press: Press | null = null;
	let drag: Drag | null = null;

	list.classList.add('ev-sortable');

	const listen = (on: boolean) => {
		const m = on ? 'addEventListener' : 'removeEventListener';
		doc[m]('pointermove', onMove, true);
		doc[m]('pointerup', onUp, true);
		doc[m]('pointercancel', onCancel, true);
		doc[m]('keydown', onKey, true);
	};

	const onDown = (e: PointerEvent) => {
		if (press || drag || !e.isPrimary) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const target = e.target as Element | null;
		const item = target?.closest(opts.items);
		if (!isEl(item) || item.parentElement !== list) return;
		const handle = target?.closest(handleSel);
		const onHandle = !!handle && item.contains(handle);
		const mouse = e.pointerType === 'mouse';
		if (!onHandle && (!mouse || target?.closest(ignoreSel))) return;
		// A finger on the handle drags; the item's own long-press (a menu) waits for a press elsewhere.
		if (onHandle && !mouse) e.stopPropagation();
		press = { id: e.pointerId, x: e.clientX, y: e.clientY, item, mouse };
		listen(true);
	};

	const onMove = (e: PointerEvent) => {
		if (!press || e.pointerId !== press.id) return;
		if (!drag) {
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < (press.mouse ? SLOP.mouse : SLOP.other)) return;
			if (!begin()) { stop(); return; }
		}
		if (!drag) return;
		e.preventDefault();
		drag.y = e.clientY;
		update();
	};

	const onUp = (e: PointerEvent) => {
		if (!press || e.pointerId !== press.id) return;
		if (drag) finish(true); else stop();
	};
	const onCancel = (e: PointerEvent) => { if (press && e.pointerId === press.id) { if (drag) finish(false); else stop(); } };
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		if (drag) { e.preventDefault(); e.stopPropagation(); finish(false); } else stop();
	};

	/** Measure every item and lift the pressed one. False when there's nothing to sort. */
	const begin = (): boolean => {
		if (!press) return false;
		const all = items();
		const from = all.indexOf(press.item);
		if (from < 0 || all.length < 2) return false;
		const listTop = list.getBoundingClientRect().top;
		const tops: number[] = [], heights: number[] = [], margins: number[] = [];
		for (const el of all) {
			const r = el.getBoundingClientRect();
			tops.push(r.top - listTop);
			heights.push(r.height);
			margins.push(parseFloat(win.getComputedStyle(el).marginTop) || 0);
		}
		const gap = parseFloat(win.getComputedStyle(list).rowGap) || 0;
		const slot = list.createDiv({ cls: 'ev-sort-slot', attr: { 'aria-hidden': 'true' } });
		slot.style.top = `${tops[from]}px`;
		slot.style.height = `${heights[from]}px`;
		list.classList.add('is-sorting');
		doc.body.classList.add('ev-is-sorting');
		for (const el of all) el.classList.add(el === press.item ? 'ev-sort-lifted' : 'ev-sort-shifting');
		win.getSelection()?.removeAllRanges();
		drag = { item: press.item, all, from, to: from, tops, heights, margins, gap, startRel: press.y - listTop, y: press.y, slot, scroller: scrollParent(list), frame: 0 };
		drag.frame = win.requestAnimationFrame(tick);
		opts.onStart?.(keyOf(press.item));
		return true;
	};

	/** Follow the pointer, and open the slot where the item would land. */
	const update = () => {
		const d = drag;
		if (!d) return;
		if (!list.isConnected) { teardown(); return; }
		const { from, tops, heights } = d;
		const last = tops.length - 1;
		const rel = d.y - list.getBoundingClientRect().top;
		const lo = tops[0] - tops[from] - 6;
		const hi = tops[last] + heights[last] - (tops[from] + heights[from]) + 6;
		const dy = Math.max(lo, Math.min(hi, rel - d.startRel));
		d.item.style.transform = `translateY(${dy}px)`;
		const centre = tops[from] + dy + heights[from] / 2;
		let to = 0;
		for (let j = 0; j < d.all.length; j++) if (j !== from && tops[j] + heights[j] / 2 < centre) to++;
		if (to !== d.to) { d.to = to; layout(); }
	};

	/** Where everyone stands with the item at `to`: the others slide, the slot moves. */
	const layout = () => {
		const d = drag;
		if (!d) return;
		const seq = d.all.map((_, i) => i).filter(i => i !== d.from);
		seq.splice(d.to, 0, d.from);
		let cursor = d.tops[0] - d.margins[0];
		for (const i of seq) {
			const top = cursor + d.margins[i];
			if (i === d.from) d.slot.style.top = `${top}px`;
			else d.all[i].style.transform = top === d.tops[i] ? '' : `translateY(${top - d.tops[i]}px)`;
			cursor = top + d.heights[i] + d.gap;
		}
	};

	/** Scroll the list's scroller while the pointer is near its top or bottom. */
	const tick = () => {
		const d = drag;
		if (!d) return;
		const s = d.scroller;
		if (s) {
			const r = s.getBoundingClientRect();
			let v = 0;
			if (d.y < r.top + EDGE) v = -Math.ceil(((r.top + EDGE - d.y) / EDGE) * SPEED);
			else if (d.y > r.bottom - EDGE) v = Math.ceil(((d.y - (r.bottom - EDGE)) / EDGE) * SPEED);
			v = Math.max(-SPEED, Math.min(SPEED, v));
			if (v) {
				const before = s.scrollTop;
				s.scrollTop = before + v;
				if (s.scrollTop !== before) update();
			}
		}
		d.frame = win.requestAnimationFrame(tick);
	};

	/** Clear every mark the drag left on the list. With `slide`, the others glide home rather than jump. */
	const teardown = (slide = false) => {
		const d = drag;
		drag = null;
		stop();
		if (!d) return;
		win.cancelAnimationFrame(d.frame);
		d.slot.remove();
		list.classList.remove('is-sorting');
		doc.body.classList.remove('ev-is-sorting');
		for (const el of d.all) {
			el.classList.remove('ev-sort-lifted');
			if (!slide) el.classList.remove('ev-sort-shifting');
			el.style.removeProperty('transform');
		}
		if (slide) win.setTimeout(() => { for (const el of d.all) el.classList.remove('ev-sort-shifting'); }, SETTLE_MS);
	};

	/** Settle `el` into place from `dy` px away. */
	const settle = (el: HTMLElement, dy: number) => {
		if (!dy || typeof el.animate !== 'function') return;
		el.classList.add('ev-sort-settling');
		const anim = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: SETTLE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
		anim.onfinish = anim.oncancel = () => el.classList.remove('ev-sort-settling');
	};

	/** Drop (or put back). A real drag never also clicks what it started on. */
	const finish = (commit: boolean) => {
		const d = drag;
		if (!d) { stop(); return; }
		swallowClick();
		// Redrawn under the pointer (the data changed elsewhere): the indexes are stale, so nothing drops.
		if (!list.isConnected) { teardown(); return; }
		const still = reducedMotion(win);
		const key = keyOf(d.item);
		const at = d.item.getBoundingClientRect().top;
		if (commit && d.to !== d.from) {
			teardown();
			opts.onDrop(key, d.to, d.from);
			const el = opts.find ? opts.find(key) : (list.isConnected ? items().find(x => keyOf(x) === key) : undefined);
			if (el && !still) settle(el, at - el.getBoundingClientRect().top);
			return;
		}
		// Put back: everyone slides home.
		teardown(!still);
		if (!still) settle(d.item, at - d.item.getBoundingClientRect().top);
	};

	const swallowClick = () => {
		const eat = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
		doc.addEventListener('click', eat, true);
		win.setTimeout(() => doc.removeEventListener('click', eat, true), 0);
	};

	const stop = () => {
		press = null;
		listen(false);
	};

	// A long press on the handle is the start of a drag, not a context menu.
	const onContext = (e: Event) => {
		const t = e.target as Element | null;
		if (press && t?.closest(handleSel)) { e.preventDefault(); e.stopPropagation(); }
	};
	const onNativeDrag = (e: DragEvent) => { if (press) e.preventDefault(); };

	list.addEventListener('pointerdown', onDown, true);
	list.addEventListener('contextmenu', onContext, true);
	list.addEventListener('dragstart', onNativeDrag);
	return () => {
		if (drag) teardown(); else stop();
		list.removeEventListener('pointerdown', onDown, true);
		list.removeEventListener('contextmenu', onContext, true);
		list.removeEventListener('dragstart', onNativeDrag);
	};
}
