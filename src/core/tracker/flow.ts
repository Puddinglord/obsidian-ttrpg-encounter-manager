// The parts every tracker's card and queue share, as the design study draws them
// (prototypes/design-study: Ticker, TurnControl, Focus actions, the Row's turn mark,
// sections and the keys). A game draws its own card and rows with these, in its own
// look (`.ev-sys-<id>` on the tracker); who acts when stays the game's.
//
//   ticker      round and turn, a muted strip above the card
//   turnMark    the 20px mark at the left of a row: to act, next, acted, out, a moment
//   flowSection "Still to act" / "Acted", with a count and an optional hint
//   cardActions Damage | Heal (one joined 50/50 pair), then Condition and the stat block or sheet
//   trackerFoot Back, and the one primary button that says what comes next
//   flowKeys    ↑↓ move through the participants, Enter (or →) makes one active, Space done, Z undo

import { setIcon, setTooltip } from 'obsidian';
import { cluster, clusters } from '../cluster';
import { evIcon } from '../icons';
import { pill } from '../pill';

export interface TickerSpec {
	/** A round number ("Round 3"), or a word ("Setting up"). */
	round: number | string;
	/** Whose turn: "Goblin Boss's turn". */
	turn?: string;
	/** A quiet note at the end ("2024", "2 of 6 acted"). */
	note?: string;
	cls?: string;
}

/** The round and the turn, as one quiet line above the card. */
export function renderTicker(parent: HTMLElement, t: TickerSpec): HTMLElement {
	const el = parent.createDiv({ cls: ['ev-ticker', ...(t.cls ? t.cls.split(/\s+/) : [])], attr: { role: 'status' } });
	const round = el.createSpan({ cls: 'ev-ticker-round round-label' });
	if (typeof t.round === 'number') {
		round.appendText('Round ');
		round.createEl('b', { text: String(t.round) });
	} else round.createEl('b', { text: t.round });
	if (t.turn) el.createSpan({ cls: 'ev-ticker-turn', text: t.turn });
	if (t.note) el.createSpan({ cls: 'ev-ticker-note', text: t.note });
	return el;
}

export type MarkState = 'todo' | 'next' | 'acted' | 'out' | 'moment';

/**
 * The turn mark at the left of a row: a ring (still to act), an accent ring (next), a check
 * (acted), a cross (out of the fight) or a sparkle (a moment, not a creature). With `onClick`
 * it's a button that marks the turn done or not.
 */
export function turnMark(parent: HTMLElement, state: MarkState, o: { onClick?: () => void; label?: string; cls?: string } = {}): HTMLElement {
	const cls = ['ev-mark', `is-${state}`, ...(o.cls ? o.cls.split(/\s+/) : [])];
	const el = o.onClick ? parent.createEl('button', { cls }) : parent.createSpan({ cls });
	if (state === 'acted') setIcon(el, evIcon('check'));
	else if (state === 'out') setIcon(el, evIcon('x'));
	else if (state === 'moment') setIcon(el, evIcon('sparkle'));
	const label = o.label ?? (state === 'acted' ? 'Acted this round' : state === 'next' ? 'Next up' : state === 'out' ? 'Out of the fight' : state === 'moment' ? 'Not a turn of its own' : 'Still to act');
	el.setAttr('aria-label', label);
	if (o.onClick) {
		el.setAttr('aria-pressed', String(state === 'acted'));
		el.addEventListener('click', (e) => { e.stopPropagation(); o.onClick?.(); });
	}
	return el;
}

/** A section of the queue: "Still to act · 3 this round", then an optional hint line. */
export function flowSection(parent: HTMLElement, title: string, o: { small?: string; acted?: boolean; hint?: string; cls?: string } = {}): HTMLElement {
	const el = parent.createDiv({ cls: ['ev-sec', ...(o.acted ? ['is-acted'] : []), ...(o.cls ? o.cls.split(/\s+/) : [])] });
	el.createSpan({ cls: 'ev-sec-title', text: title });
	if (o.small) el.createEl('small', { text: o.small });
	if (o.hint) parent.createDiv({ cls: 'ev-sec-hint', text: o.hint });
	return el;
}

export interface CardActionSpec {
	damage: (anchor: HTMLElement) => void;
	heal: (anchor: HTMLElement) => void;
	condition: (anchor: HTMLElement) => void;
	/** The stat block (monsters) or the character sheet (heroes). */
	sheet?: { label: string; run: (anchor: HTMLElement, e: MouseEvent) => void };
	/** Extra icon buttons after these (a game's own). */
	extra?: { icon: string; label: string; cls?: string; run: (anchor: HTMLElement) => void }[];
}

/** The card's buttons: Damage | Heal joined and equal, then Condition and the stat block at the right edge. */
export function cardActions(parent: HTMLElement, a: CardActionSpec): HTMLElement {
	const row = clusters(parent, 'ev-card-acts');
	const pair = cluster(row, { joined: true, fill: true, cls: 'ev-card-pair', label: 'HP' });
	const dmg = pill(pair, { tag: 'button', icon: evIcon('drop'), text: 'Damage', cls: 'ev-card-btn ev-card-damage' });
	dmg.addEventListener('click', () => a.damage(dmg));
	const heal = pill(pair, { tag: 'button', icon: evIcon('first-aid'), text: 'Heal', cls: 'ev-card-btn ev-card-heal' });
	heal.addEventListener('click', () => a.heal(heal));
	const side = cluster(row, { cls: 'ev-card-tools' });
	const iconBtn = (icon: string, label: string, cls: string, run: (b: HTMLElement, e: MouseEvent) => void) => {
		const b = side.createEl('button', { cls: `ev-card-icon ${cls}`, attr: { 'aria-label': label } });
		setIcon(b, icon);
		setTooltip(b, label, { delay: 350 });
		b.addEventListener('click', (e) => run(b, e));
		return b;
	};
	iconBtn(evIcon('tag-bold'), 'Add a condition', 'ev-card-condition add-condition-btn', (b) => a.condition(b));
	if (a.sheet) { const s = a.sheet; iconBtn(evIcon('book-bold'), s.label, 'ev-card-sheet', (b, e) => s.run(b, e)); }
	for (const x of a.extra ?? []) iconBtn(x.icon, x.label, x.cls ?? '', (b) => x.run(b));
	return row;
}

export interface FootButton {
	text: string;
	icon: string;
	run: () => void;
	disabled?: boolean;
	cls?: string;
}

/** The turn control: Back on the left of the one primary button that says what comes next. */
export function trackerFoot(parent: HTMLElement, o: { back?: { run: () => void; disabled?: boolean; label?: string }; primary: FootButton; second?: FootButton }): HTMLElement {
	const foot = parent.createDiv({ cls: 'ev-foot' });
	if (o.back) {
		const back = foot.createEl('button', { cls: 'ev-foot-back', attr: { 'aria-label': o.back.label ?? 'Back a step' } });
		setIcon(back, evIcon('undo'));
		setTooltip(back, o.back.label ?? 'Back a step (Z)', { delay: 350 });
		back.disabled = !!o.back.disabled;
		back.addEventListener('click', () => o.back?.run());
	}
	if (o.second) {
		const b = pill(foot, { tag: 'button', icon: o.second.icon, text: o.second.text, cls: `ev-foot-second ${o.second.cls ?? ''}` }) as HTMLButtonElement;
		b.disabled = !!o.second.disabled;
		b.addEventListener('click', () => o.second?.run());
	}
	const p = pill(foot, { tag: 'button', icon: o.primary.icon, text: o.primary.text, cls: `mod-cta ev-foot-primary ${o.primary.cls ?? ''}` }) as HTMLButtonElement;
	p.disabled = !!o.primary.disabled;
	p.addEventListener('click', () => o.primary.run());
	return foot;
}

export interface FlowKeyHandlers {
	/** Make this row's participant the active one. */
	select(row: HTMLElement): void;
	/** Done / Next: what the footer's primary button does. */
	done(): void;
	undo(): void;
}

/** An event's target as an element (in any window, popouts too). */
const elementOf = (t: EventTarget | null): HTMLElement | null => (t && 'instanceOf' in t && (t as Node).instanceOf(HTMLElement) ? t as HTMLElement : null);
const typing = (t: EventTarget | null) => { const el = elementOf(t); return !!el && (el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"]')); };

/**
 * The tracker's keys, live only while focus is inside it (typing in a note never triggers them):
 * ↑ ↓ move through the participants (`[data-flow-row]`), Enter or → makes the focused one active,
 * Space is Done (the footer's primary), Z undoes the last step. Buttons keep their own Space and Enter.
 */
export function flowKeys(scope: HTMLElement, h: FlowKeyHandlers): void {
	scope.addEventListener('keydown', (e) => {
		if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
		const rows = Array.from(scope.querySelectorAll<HTMLElement>('[data-flow-row]'));
		const t = elementOf(e.target);
		const row = t?.closest<HTMLElement>('[data-flow-row]') ?? null;
		const onButton = !!t && t !== row && !!t.closest('button, a, [role="button"]');
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (!rows.length) return;
			const at = row ? rows.indexOf(row) : -1;
			const to = e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at < 0 ? rows.length - 1 : at - 1);
			rows[to]?.focus();
			rows[to]?.scrollIntoView({ block: 'nearest' });
			e.preventDefault();
		} else if ((e.key === 'Enter' || e.key === 'ArrowRight') && row && !onButton) {
			h.select(row);
			e.preventDefault();
		} else if (e.key === ' ' && !onButton) {
			h.done();
			e.preventDefault();
		} else if (e.key.toLowerCase() === 'z' && !onButton) {
			h.undo();
			e.preventDefault();
		}
	});
}

/** Make `row` a participant the keys and a tap can pick: focusable, and a click (not on its buttons) selects it. */
export function selectableRow(row: HTMLElement, id: string, label: string, select: () => void): void {
	row.dataset.flowRow = id;
	row.setAttr('tabindex', '0');
	row.setAttr('aria-label', label);
	row.addEventListener('click', (e) => {
		const t = elementOf(e.target);
		if (t && t !== row && t.closest('button, a, input, [role="button"]')) return;
		select();
	});
}
