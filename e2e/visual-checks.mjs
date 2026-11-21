// The visual checks e2e/visual.mjs runs on every screenshot. Each export runs in the page
// (page.evaluate), so each is self-contained: no imports, no shared helpers.
//
// The surface being checked carries `data-vis-root` (markRoot); every check looks inside it,
// and at the scrolling or clipping boxes around it.

/** Mark the first visible match of `sel` as the surface (and unmark any other). True when found. */
export function markRoot(sel) {
	document.querySelectorAll('[data-vis-root]').forEach(n => n.removeAttribute('data-vis-root'));
	const el = [...document.querySelectorAll(sel)].find(n => { const r = n.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(n).visibility !== 'hidden'; });
	if (!el) return false;
	el.setAttribute('data-vis-root', '');
	return true;
}

/**
 * Scroll the surface's top into view in whatever scrolls it, and say how much of it is still
 * out of sight (below the window, under a clipping parent, or inside one of its own scrolling
 * boxes), so the runner can make the window taller and catch all of it.
 */
export function frameRoot({ pad }) {
	const root = document.querySelector('[data-vis-root]');
	if (!root) return null;
	for (let a = root.parentElement; a && a !== document.body; a = a.parentElement) {
		const cs = getComputedStyle(a);
		if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) {
			// Only when its top is out of sight: where the note puts it is where a reader sees it (under a phone's
			// floating buttons is not).
			const top = root.getBoundingClientRect().top, ar = a.getBoundingClientRect();
			if (top < ar.top || top > ar.bottom - 40) a.scrollTop += top - ar.top - pad - 4;
			break;
		}
	}
	let r = root.getBoundingClientRect();
	// A note's sizer pads its bottom so you can scroll past the end: the surface ends at its last child.
	if (parseFloat(getComputedStyle(root).paddingBottom) > 40) {
		const kids = [...root.children].map(k => k.getBoundingClientRect()).filter(b => b.height > 0);
		if (kids.length) r = { left: r.left, right: r.right, top: r.top, bottom: Math.min(r.bottom, Math.max(...kids.map(b => b.bottom)) + 8) };
	}
	let hidden = Math.max(0, r.bottom + pad - innerHeight);
	for (let a = root.parentElement; a && a !== document.body; a = a.parentElement) {
		if (getComputedStyle(a).overflowY !== 'visible') hidden = Math.max(hidden, r.bottom + pad - a.getBoundingClientRect().bottom);
	}
	// Its own scrolling boxes (a builder's panel, the tracker's list): grow until they stop scrolling,
	// unless they hold something meant to scroll (a 500-row list).
	for (const e of [root, ...root.querySelectorAll('*')]) {
		if (e.clientHeight < 60) continue;
		const cs = getComputedStyle(e);
		const more = e.scrollHeight - e.clientHeight;
		if (/(auto|scroll)/.test(cs.overflowY) && more > 1 && more < 3000) hidden = Math.max(hidden, more);
	}
	return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, hidden: Math.round(hidden), vw: innerWidth, vh: innerHeight };
}

/**
 * Elements that look like pills (a small rounded box with a fill, border or shadow and a short label) but aren't in
 * PILL_SELECTORS, nor in NOT_PILLS (pill-like but not pills: align.mjs says why). Marks them `data-vis-pill` so
 * pillOffenders measures them too.
 */
export function markPillLikes({ selectors, notPills = [] }) {
	const root = document.querySelector('[data-vis-root]');
	document.querySelectorAll('[data-vis-pill]').forEach(n => n.removeAttribute('data-vis-pill'));
	if (!root) return [];
	const known = selectors.join(',');
	const not = notPills.join(',');
	const cv = document.createElement('canvas'); cv.width = cv.height = 1;
	const cx = cv.getContext('2d', { willReadFrequently: true });
	const alpha = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); return cx.getImageData(0, 0, 1, 1).data[3] / 255; };
	const found = new Map();
	for (const e of root.querySelectorAll('*')) {
		if (e.matches(known) || (not && e.matches(not)) || e.closest('svg') || /^(INPUT|SELECT|TEXTAREA|IMG|CANVAS|OPTION|LABEL)$/.test(e.tagName)) continue;
		if (e.closest('.mod-header, .mod-footer, .metadata-container, .embedded-backlinks, .modal-close-button')) continue;
		// Inside a known pill: measured with it.
		if (e.parentElement?.closest(known)) continue;
		const r0 = e.getBoundingClientRect();
		if (r0.right <= 0 || r0.bottom <= 0 || r0.left >= innerWidth || r0.top >= innerHeight) continue;
		const cs = getComputedStyle(e);
		const button = e.tagName === 'BUTTON' || e.getAttribute('role') === 'button' || e.getAttribute('role') === 'tab';
		if (!button && !/^(inline-flex|flex|inline-block|inline-grid)$/.test(cs.display)) continue;
		if (cs.display === 'none' || cs.visibility === 'hidden') continue;
		const r = e.getBoundingClientRect();
		if (r.height < 12 || r.height > 44 || r.width < 10 || r.width > 280) continue;
		const text = e.textContent.replace(/\s+/g, ' ').trim();
		if (text.length > 32 || (!text && !e.querySelector('svg'))) continue;
		if (e.querySelectorAll('*').length > 8) continue;
		// Words in two sizes (a big 19 over a small /19) are set on one baseline, not centred each on their own;
		// words on two rows (a choice's name over its numbers) make a card, not a pill.
		const sizes = new Set(), rows = [];
		for (const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); w.nextNode();) {
			if (!w.currentNode.textContent.trim()) continue;
			sizes.add(Math.round(parseFloat(getComputedStyle(w.currentNode.parentElement).fontSize)));
			const rg = document.createRange(); rg.selectNodeContents(w.currentNode);
			rows.push(...[...rg.getClientRects()].filter(x => x.width > 0));
		}
		if (Math.max(...sizes) - Math.min(...sizes) > 1) continue;
		if (rows.some(a => rows.some(b => b.top >= a.bottom - 1))) continue;
		// A shape drawn behind its label (a die face, a shield) centres the label on the shape's own middle, not the box's.
		if ([...e.querySelectorAll('svg')].some(g => { const b = g.getBoundingClientRect(); return b.width * b.height >= r.width * r.height * 0.6; })) continue;
		const fill = alpha(cs.backgroundColor) > 0.05 || cs.backgroundImage !== 'none';
		const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && alpha(cs.borderTopColor) > 0.05;
		// A ring drawn with a shadow (0 0 0 1px) outlines a chip; an underline drawn with one (a rules term) doesn't.
		const shadow = /0px 0px 0px [0-9.]+px/.test(cs.boxShadow);
		if (!(button || ((fill || border || shadow) && parseFloat(cs.borderTopLeftRadius) >= 3))) continue;
		// A box of icons and words laid out in rows is a card, not a pill.
		if ([...e.children].some(c => /^(block|flex|grid)$/.test(getComputedStyle(c).display) && c.getBoundingClientRect().height > r.height * 0.7 && c.children.length > 2)) continue;
		e.setAttribute('data-vis-pill', '');
		const cls = [...e.classList].filter(c => !/^(is-|mod-|has-|vis-)/.test(c));
		const key = cls.length ? `.${cls[0]}` : `${e.parentElement?.classList[0] ? `.${e.parentElement.classList[0]} > ` : ''}${e.tagName.toLowerCase()}`;
		found.set(key, (found.get(key) ?? 0) + 1);
	}
	// Pills scrolled away inside a list or off the window aren't in the shot: pillOffenders skips them.
	document.querySelectorAll('[data-vis-offscreen]').forEach(n => n.removeAttribute('data-vis-offscreen'));
	for (const e of root.querySelectorAll(`${known}, [data-vis-pill]`)) {
		const r = e.getBoundingClientRect();
		let shown = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
		for (let a = e.parentElement; shown && a && a !== document.body; a = a.parentElement) {
			const cs = getComputedStyle(a);
			if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
			const ar = a.getBoundingClientRect();
			if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) shown = false;
		}
		if (!shown) e.setAttribute('data-vis-offscreen', '');
	}
	return [...found].map(([sel, n]) => ({ sel, n }));
}

/**
 * Every check but pill centring (pillOffenders in align.mjs does that). Returns issues:
 * { kind, sev, sel, path, text, detail, rect }.
 *
 *   clipped    text cut by its own box or a box around it (no ellipsis), or spilling out of its box
 *   truncated  a name cut short with an ellipsis where there's room for it (`room`)
 *   wrap       a single-line thing on two lines: pill, tab and button labels, numbers, names and labels
 *   spill      an element sticking out past the surface's sides; sideways scroll on the surface or the page
 *   overlap    siblings drawn over each other
 *   crushed    text squeezed to nothing or to a sliver
 *   contrast   a tag's label too faint on its fill
 */
export function visualChecks({ room, pillSelectors }) {
	const root = document.querySelector('[data-vis-root]');
	if (!root) return [{ kind: 'harness', sev: 5, sel: '', path: '', text: '', detail: 'the surface is gone', rect: null }];
	const rr = root.getBoundingClientRect();
	const out = [];
	const known = pillSelectors.join(',');
	const cv = document.createElement('canvas'); cv.width = cv.height = 1;
	const cx = cv.getContext('2d', { willReadFrequently: true });
	const rgba = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
	const sig = (e) => {
		const cls = [...e.classList].filter(c => !/^vis-/.test(c)).slice(0, 4).join('.');
		return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
	};
	const pathOf = (e) => { const p = []; for (let n = e; n && p.length < 3; n = n.parentElement) { p.unshift(sig(n)); if (n === root) break; } return p.join(' > '); };
	const box = (r) => r && { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
	const words = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
	// Only what the shot shows: not rows scrolled away inside a list, nor anything off the window.
	const shown = (e, r) => {
		if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
		for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
			const acs = getComputedStyle(a);
			if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
			const ar = a.getBoundingClientRect();
			if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) return false;
		}
		return true;
	};
	const add = (kind, sev, e, detail, rect) => {
		const r = rect ?? e.getBoundingClientRect();
		const rr2 = { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height };
		if (e !== document.body && !shown(e, rr2)) return;
		out.push({ kind, sev, sel: sig(e), path: pathOf(e), text: words(e), detail, rect: box(r) });
	};

	// Visible: has boxes, not hidden, not see-through (opacity anywhere up to the surface).
	const vis = new Map();
	const visible = (e) => {
		if (vis.has(e)) return vis.get(e);
		let v = e.getClientRects().length > 0;
		if (v) {
			const cs = getComputedStyle(e);
			v = cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
			// Hidden on purpose: a screen-reader label (a 1px clipped box), or a label squeezed shut with overflow hidden.
			const r = e.getBoundingClientRect();
			if (v && (r.width <= 1 || r.height <= 1) && (cs.overflow !== 'visible' || cs.clip !== 'auto')) v = false;
		}
		if (v && e !== root && e.parentElement) v = visible(e.parentElement);
		vis.set(e, v);
		return v;
	};
	// Obsidian's own parts of a note (its title, the Properties box, backlinks) aren't ours to check.
	const theirs = '.mod-header, .mod-footer, .metadata-container, .inline-title, .embedded-backlinks, .markdown-preview-pusher, .modal-close-button';
	// Only what's in the shot: rows scrolled away inside a long list are skipped (and checking them all is slow).
	const scroller = new Map();
	const nearestScroller = (e) => {
		const p = e.parentElement;
		if (!p || p === document.body) return null;
		if (scroller.has(p)) return scroller.get(p);
		const cs = getComputedStyle(p);
		// Anything that scrolls or clips: what's wholly outside it isn't drawn (a list's far rows, a wizard's other steps).
		const v = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? p : nearestScroller(p);
		scroller.set(p, v);
		return v;
	};
	const inShot = (e) => {
		const r = e.getBoundingClientRect();
		if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return !r.width && !r.height;
		for (let a = nearestScroller(e); a; a = nearestScroller(a)) {
			const ar = a.getBoundingClientRect();
			if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) return false;
		}
		return true;
	};
	const all = [root, ...root.querySelectorAll('*')].filter(e => !(e.closest('svg') && e.tagName.toLowerCase() !== 'svg') && !e.closest('[data-vis-overlay]') && !e.closest(theirs) && visible(e) && (e === root || inShot(e)));

	const pillish = (e) => e.matches(known) || e.hasAttribute('data-vis-pill') || !!e.closest('button, [role="tab"], [role="button"], [data-vis-pill]') || (!!e.parentElement && e.parentElement.matches(known));
	// A name or a label: a class token that says so (ns-rc-name, ev-cq-kicker, nimble-map-token-name…).
	const NAMEISH = /(^|-)(name|title|label|tab|badge|chip|tag|kicker|value|num|count|level|cost|pill)s?$/;
	const nameish = (e) => {
		const own = [...e.classList];
		return (own.length ? own : [...(e.parentElement?.classList ?? [])]).some(c => NAMEISH.test(c));
	};
	// A web address or a path may break anywhere; that's how it fits. A hyphenated word ("10-foot") breaks at its hyphen.
	const urlish = (w) => (/^[a-z]+:\/\/|[/\\]/.test(w) && w.length > 12) || /[-‐–—]/.test(w);
	// A compact control (a pill, a button in a row): a short label, not a card or a drop zone that holds a sentence.
	// (A term or link inline in a sentence wraps with the sentence: not a control.)
	const compact = (c) => !!c && getComputedStyle(c).display !== 'inline' && c.textContent.trim().length <= 32 && c.getBoundingClientRect().height <= 52;
	const numberish = (t) => /^[+−–-]?\d[\d,./×x+−–-]*\s?(ft\.?|gp|sp|cp|%)?$/.test(t);

	// ---- text: cut off, spilling, wrapped ----
	const scrolls = (v) => /(auto|scroll)/.test(v);
	for (const e of all) {
		for (const t of e.childNodes) {
			if (t.nodeType !== 3 || !t.textContent.trim()) continue;
			const range = document.createRange();
			range.selectNodeContents(t);
			const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
			if (!rects.length) continue;
			const u = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
			const cs = getComputedStyle(e);
			const fs = parseFloat(cs.fontSize) || 14;
			// A line's content area is taller than its letters; only count what reaches past that.
			const tolY = Math.max(1, fs * 0.22);
			const text = t.textContent.replace(/\s+/g, ' ').trim();
			// Cut by a box around it that clips (not one that scrolls: that's scrolled-away content).
			for (let a = e; a && a !== document.body; a = a.parentElement) {
				const acs = getComputedStyle(a);
				if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
				if (scrolls(acs.overflowX) || scrolls(acs.overflowY)) break;
				const ar = a.getBoundingClientRect();
				const L = ar.left + a.clientLeft, T = ar.top + a.clientTop, Rt = L + a.clientWidth, B = T + a.clientHeight;
				if (!a.clientWidth || !a.clientHeight) break; // a collapsed box hides on purpose
				const outside = u.right <= L || u.left >= Rt || u.bottom - tolY <= T || u.top + tolY >= B;
				if (outside) break; // hidden on purpose (a closed fold, a slid-away panel)
				const cutX = u.right > Rt + 1 || u.left < L - 1;
				const cutY = u.bottom - tolY > B + 2 || u.top + tolY < T - 2;
				if (!cutX && !cutY) continue;
				const ellipsis = acs.textOverflow === 'ellipsis' || cs.textOverflow === 'ellipsis' || (acs.webkitLineClamp && acs.webkitLineClamp !== 'none');
				if (ellipsis && !(cutY && !acs.webkitLineClamp)) {
					// Truncated on purpose. A name truncated where there's room is still wrong.
					if (room && nameish(e) && text.length <= 40) add('truncated', 2, e, `"${text.slice(0, 30)}" ends in … (${Math.round(u.right - Rt)}px cut) at a width with room for it`, { left: L, top: T, width: Rt - L, height: B - T });
				} else {
					const px = cutX ? Math.max(u.right - Rt, L - u.left) : Math.max(u.bottom - tolY - B, T - u.top - tolY);
					add('clipped', 5, e, `"${text.slice(0, 30)}" cut ${Math.round(px)}px ${cutX ? 'sideways' : 'top/bottom'} by ${a === e ? 'its own box' : sig(a)}`, { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top });
				}
				break;
			}
			// Spilling out of its own box (overflow visible): text wider than the block that holds it,
			// or past the edge of the nearest box drawn around it (a fill or a border the eye sees).
			if (!/^inline/.test(cs.display) && e.clientWidth > 0) {
				const er = e.getBoundingClientRect();
				const L = er.left + e.clientLeft, Rt = L + e.clientWidth;
				if ((u.right > Rt + 2 || u.left < L - 2) && cs.overflowX === 'visible') {
					add('clipped', 4, e, `"${text.slice(0, 30)}" runs ${Math.round(Math.max(u.right - Rt, L - u.left))}px out of its box`, { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top });
				}
			}
			for (let a = e; a && a !== root.parentElement; a = a.parentElement) {
				const acs = getComputedStyle(a);
				if (acs.overflowX !== 'visible') break; // clipped (or truncated) before it gets there: the check above has it
				const drawn = rgba(acs.backgroundColor)[3] > 0.05 || (parseFloat(acs.borderRightWidth) > 0 && acs.borderRightStyle !== 'none' && rgba(acs.borderRightColor)[3] > 0.05);
				if (!drawn || /^inline/.test(acs.display)) continue;
				const ar = a.getBoundingClientRect();
				const L = ar.left + a.clientLeft, Rt = L + a.clientWidth;
				// A box at least as wide as a word, that the text starts in and runs out of (not a thin marker it's centred on).
				const startsIn = u.right > Rt + 2 ? u.left >= L - 1 : u.right <= Rt + 1;
				if (a !== e && a.clientWidth >= 24 && (u.right > Rt + 2 || u.left < L - 2) && startsIn && u.left < Rt && u.right > L) {
					add('clipped', 4, e, `"${text.slice(0, 30)}" runs ${Math.round(Math.max(u.right - Rt, L - u.left))}px past the edge of ${sig(a)}`, { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top });
				}
				break;
			}
			// Wrapped: more than one line where one is meant.
			const tops = [];
			for (const r of [...rects].sort((x, y) => x.top - y.top)) if (!tops.length || r.top > tops[tops.length - 1] + r.height * 0.5) tops.push(r.top);
			// Longer text may wrap, but never mid-word (only possible where overflow-wrap or word-break allow it).
			if (tops.length > 1 && text.length > 48 && /(anywhere|break-word|break-all)/.test(`${cs.overflowWrap} ${cs.wordBreak}`)) {
				for (const m of t.textContent.matchAll(/\S{4,}/g)) {
					if (urlish(m[0])) continue;
					const wr = document.createRange();
					wr.setStart(t, m.index); wr.setEnd(t, m.index + m[0].length);
					const bs = [...wr.getClientRects()].filter(x => x.width > 0);
					if (bs.length > 1 && bs.some(x => x.top > bs[0].top + bs[0].height * 0.5)) { add('wrap', 4, e, `"${m[0]}" broken mid-word in "${text.slice(0, 30)}…"`); break; }
				}
			}
			if (tops.length > 1 && text.length <= 48) {
				const lh = parseFloat(cs.lineHeight);
				// A small label set solid (line-height about 1) is meant to sit on one line; a big title may wrap when it must.
				const tight = lh && lh <= fs * 1.15 && fs <= 16;
				const whole = (e.textContent || '').trim().length;
				// Which words landed on which line: a number left alone on a line, away from its label ("Level / 2").
				const lineOf = [];
				let broken = null;
				for (const m of t.textContent.matchAll(/\S+/g)) {
					const wr = document.createRange();
					wr.setStart(t, m.index); wr.setEnd(t, m.index + m[0].length);
					const bs = [...wr.getClientRects()].filter(x => x.width > 0);
					const b = bs[0];
					// One word on two lines: broken mid-word ("Adventurin / g").
					if (bs.length > 1 && bs.some(x => x.top > b.top + b.height * 0.5) && m[0].length > 3 && !urlish(m[0])) broken ??= m[0];
					if (b) lineOf.push([m[0], tops.findIndex((top, k) => k === tops.length - 1 || b.top < tops[k + 1] - 1)]);
				}
				const lines = tops.map((_, k) => lineOf.filter(([, l]) => l === k).map(([w]) => w));
				const orphan = lines.findIndex((ws, k) => k > 0 && ws.length === 1 && /^[+−–-]?\d[\d/]*$/.test(ws[0]) && /[A-Za-z]$/.test(lines[k - 1][lines[k - 1].length - 1] ?? ''));
				if (broken) add('wrap', 4, e, `"${broken}" broken mid-word in "${text.slice(0, 30)}"`);
				else if (orphan > 0) add('wrap', 3, e, `"${lines[orphan][0]}" left alone on its own line, away from "${lines[orphan - 1][lines[orphan - 1].length - 1]}"`);
				else if (!/\s/.test(text) && text.length > 1) add('wrap', 4, e, `"${text}" broken mid-word over ${tops.length} lines`);
				else if (numberish(text) && whole <= 24) add('wrap', 4, e, `the number "${text}" wraps onto ${tops.length} lines`);
				else if (pillish(e) && text.length <= 32 && compact(e.closest(`button, [role="tab"], [role="button"], [data-vis-pill], ${known}`))) add('wrap', 3, e, `the label "${text}" wraps onto ${tops.length} lines`);
				else if (nameish(e) && (room || tight) && text.length <= 40) add('wrap', 2, e, `"${text}" wraps onto ${tops.length} lines${tight ? ' (its line-height says one line)' : ''}`);
			}
		}
	}

	// ---- spill past the surface, sideways scroll ----
	const clippedBetween = (e) => { for (let p = e.parentElement; p && p !== root; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true; return false; };
	const spill = new Set();
	for (const e of all) {
		if (e === root) continue;
		const cs = getComputedStyle(e);
		if (cs.position === 'fixed' || cs.display === 'inline') continue;
		const r = e.getBoundingClientRect();
		if (!r.width || !r.height) continue;
		if ((r.right > rr.right + 2 || r.left < rr.left - 2) && !clippedBetween(e)) spill.add(e);
	}
	for (const e of spill) {
		if (e.parentElement && spill.has(e.parentElement)) continue;
		const r = e.getBoundingClientRect();
		add('spill', 5, e, `sticks out ${Math.round(Math.max(r.right - rr.right, rr.left - r.left))}px past the ${r.right > rr.right ? 'right' : 'left'} side of the surface`);
	}
	for (let a = root; a && a !== document.documentElement; a = a.parentElement) {
		const cs = getComputedStyle(a);
		if (scrolls(cs.overflowX) && a.scrollWidth > a.clientWidth + 1 && (a === root || !root.contains(a))) {
			add('spill', 5, a, `scrolls sideways: ${a.scrollWidth}px of content in ${a.clientWidth}px`);
		}
	}
	// Strips that scroll sideways (step dots, tabs) are fine, as long as the current one is in sight.
	for (const e of all) {
		if (e === root) continue;
		const cs = getComputedStyle(e);
		if (!scrolls(cs.overflowX) || e.scrollWidth <= e.clientWidth + 4 || !e.clientWidth) continue;
		const on = e.querySelector('.is-active, .is-current, [aria-selected="true"], [aria-current="step"], [aria-current="page"]');
		if (!on) continue;
		const er = e.getBoundingClientRect(), or = on.getBoundingClientRect();
		// (Often after the window narrowed: the strip keeps its scroll.)
		if (or.right > er.right + 2 || or.left < er.left - 2) add('spill', 2, on, `the current one is scrolled out of sight in ${sig(e)} (${e.scrollWidth}px of content in ${e.clientWidth}px)`, er);
	}
	const doc = document.scrollingElement;
	if (doc && doc.scrollWidth > innerWidth + 1) add('spill', 5, document.body, `the window scrolls sideways (${doc.scrollWidth}px in ${innerWidth}px)`, { left: 0, top: 0, width: innerWidth, height: 4 });

	// ---- crushed (layout-sweep's thresholds) ----
	for (const e of all) {
		const cs = getComputedStyle(e);
		if (cs.display === 'inline' || cs.position === 'fixed') continue;
		const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
		if (own.length < 4) continue;
		const r = e.getBoundingClientRect();
		const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 20;
		if (r.width < 16) add('crushed', 4, e, `${Math.round(r.width)}px wide for "${own.slice(0, 24)}"`);
		else if (own.length >= 6 && own.length < 40 && r.width < 70 && r.height > lh * 3.5) add('crushed', 4, e, `${Math.round(r.width)}×${Math.round(r.height)}px: "${own.slice(0, 24)}" squeezed into a column`);
	}

	// ---- siblings drawn over each other ----
	const inflow = (c) => {
		const cs = getComputedStyle(c);
		if (/^(absolute|fixed|sticky)$/.test(cs.position) || cs.display === 'inline' || cs.display === 'contents') return null;
		if (['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].some(k => parseFloat(cs[k]) < -0.5)) return null; // overlapping on purpose
		const r = c.getBoundingClientRect();
		return r.width > 1 && r.height > 1 ? { r, cs } : null;
	};
	for (const p of all) {
		const kids = [...p.children].filter(c => all.includes(c));
		if (kids.length < 2 || kids.length > 80) continue;
		const grid = /grid/.test(getComputedStyle(p).display);
		const boxes = kids.map(c => [c, inflow(c)]).filter(([, b]) => b);
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const [a, A] = boxes[i], [b, B] = boxes[j];
				const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
				const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
				if (w <= 3 || h <= 3) continue; // a hairline (borders meeting, a label tucked 3px under its pin)
				// Grid items put in the same cell on purpose (a stack).
				if (grid && A.cs.gridRowStart !== 'auto' && A.cs.gridRowStart === B.cs.gridRowStart && A.cs.gridColumnStart === B.cs.gridColumnStart) continue;
				add('overlap', 4, b, `overlaps ${sig(a)}${a.textContent.trim() ? ` "${words(a).slice(0, 20)}"` : ''} by ${Math.round(w)}×${Math.round(h)}px`, { left: Math.max(A.r.left, B.r.left), top: Math.max(A.r.top, B.r.top), width: w, height: h });
			}
		}
	}

	// ---- a tag's label on its fill ----
	const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
	const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
	const backdrop = (e) => {
		for (let a = e.parentElement; a; a = a.parentElement) { const c = rgba(getComputedStyle(a).backgroundColor); if (c[3] > 0.9) return c; }
		return document.body.classList.contains('theme-dark') ? [30, 30, 30, 1] : [255, 255, 255, 1];
	};
	for (const e of all) {
		if (!(e.matches(known) || e.hasAttribute('data-vis-pill'))) continue;
		const cs = getComputedStyle(e);
		if (cs.backgroundImage !== 'none') continue;
		const fill = rgba(cs.backgroundColor);
		if (fill[3] < 0.5) continue;
		const bg = fill[3] < 1 ? over(fill, backdrop(e)) : fill;
		// The label's colour (the first text node's parent), over the fill.
		const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
		let tn = walker.nextNode();
		while (tn && !tn.textContent.trim()) tn = walker.nextNode();
		if (!tn) continue;
		const fg = over(rgba(getComputedStyle(tn.parentElement).color), bg);
		const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
		const ratio = (l1 + 0.05) / (l2 + 0.05);
		const dark = lum(bg) < 0.2;
		const need = dark ? 4.5 : 3;
		if (ratio < need) add('contrast', 3, e, `label ${ratio.toFixed(2)}:1 on its ${dark ? 'dark ' : ''}fill (needs ${need}:1)`);
	}
	return out;
}

/** Draw a numbered outline over each issue's box (fixed, on top, never moving anything). */
export function drawOutlines(issues) {
	const colour = { clipped: '#e11d48', spill: '#e11d48', wrap: '#f59e0b', pill: '#7c3aed', overlap: '#0ea5e9', crushed: '#e11d48', contrast: '#16a34a', truncated: '#f59e0b', harness: '#000' };
	issues.forEach((i, n) => {
		if (!i.rect) return;
		const d = document.createElement('div');
		d.setAttribute('data-vis-overlay', '');
		const c = colour[i.kind] ?? '#e11d48';
		d.style.cssText = `position:fixed;left:${i.rect.x - 2}px;top:${i.rect.y - 2}px;width:${i.rect.w + 4}px;height:${i.rect.h + 4}px;outline:2px solid ${c};background:${c}22;z-index:2147483646;pointer-events:none;box-sizing:border-box;`;
		const tag = document.createElement('div');
		tag.textContent = String(n + 1);
		tag.style.cssText = `position:absolute;left:-2px;top:-14px;font:700 10px/12px system-ui,sans-serif;color:#fff;background:${c};padding:0 3px;border-radius:3px;`;
		d.append(tag);
		document.body.append(d);
	});
}

export function clearOutlines() {
	document.querySelectorAll('[data-vis-overlay]').forEach(n => n.remove());
}

/** Wait for running animations and transitions (a pip bouncing, a panel sliding) to finish, up to `max` ms. */
export async function settle(max) {
	const running = document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity));
	await Promise.race([Promise.all(running.map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, max))]);
}
