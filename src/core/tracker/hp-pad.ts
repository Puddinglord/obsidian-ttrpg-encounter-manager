// The HP keypad every tracker shares: tap Damage or Heal on a card (or a row's HP)
// and a keypad opens beside it (a bottom sheet on phones). It reads like the
// design study's: who and where it lands on the left, the amount on the right,
// the modes, the quiet chips for what a player says at the table (Defend,
// Interpose), the keys, then Cancel and Apply. Switch to Heal, Set or Temp HP,
// toggle Crit (and Vulnerable / Resisted where the game has them). Typing works
// too, with the HP language (core/tracker/hp.ts): 12, 12!, +5, =20, t5, 12v,
// 12r, then Enter. Each game says what the modes are called, whether there's a
// Crit key, what the preview says, and which quick chips it offers.

import { setIcon } from 'obsidian';
import { applyLook } from '../look';
import { evIcon } from '../icons';
import { closePopover, openPopover } from '../popover';
import { slideThumb } from '../segmented';
import type { DamageMod, HpCommand } from './hp';

export type HpPadMode = 'damage' | 'heal' | 'set' | 'temp';
type Mode = HpPadMode;
export interface HpPadModeInfo { label: string; verb: (n: number) => string; sign: string }
type ModeInfo = HpPadModeInfo;

/**
 * A quiet chip on the damage keypad: what a player says at the table ("I Defend"), one tap, never a
 * prompt. It changes what Apply does (the game reads `picks`); with `choices` a tap asks which one
 * (Interpose: which friend takes it).
 */
export interface HpPadQuick {
	id: string;
	text: string;
	/** A lighter second label: "−3 · costs 1 action". */
	sub?: string;
	choices?: { id: string; text: string }[];
}
/** The chips picked: their id, and the choice where they have one. */
export type HpPadPicks = Record<string, string | true>;

export interface HpPadSpec {
	/** For ids in the keypad. */
	id: string;
	label: string;
	/** Where they stand now: "12/20 HP +3 temp". */
	sub: string;
	/** The game, for its look ('nimble', 'dnd5e'). */
	system?: string;
	/** Classes for the keypad (a game's own, or a kind: the mana pad). */
	cls?: string;
	/** The mode it opens on (Damage by default; the card's Heal opens on Heal). */
	start?: Mode;
	/** The modes offered, in order, with their words (the default: damage, heal, set, temp). */
	modes?: Partial<Record<Mode, ModeInfo>>;
	/** A Crit key (else Clear). */
	crit: boolean;
	/** Vulnerable and Resisted toggles, with their labels ("Vulnerable ×2"); none without. */
	mods?: { vulnerable: string; resisted: string } | null;
	/** Quiet chips under the modes while dealing damage: "If Orren says so at the table". */
	quick?: { label: string; items: HpPadQuick[] } | null;
	/** What the keypad's state means (the default: any amount above 0, set to anything). */
	command?: (mode: Mode, amount: number, crit: boolean, mod: DamageMod | undefined, picks: HpPadPicks) => HpCommand | null;
	/** Where it lands: "→ 8/20". Empty for the hint. */
	preview: (mode: Mode, amount: number, crit: boolean, mod: DamageMod | undefined, picks: HpPadPicks) => string;
	/** The tracker the keypad sits beside. */
	sideOf?: HTMLElement | null;
	apply: (cmd: HpCommand, picks: HpPadPicks) => void;
}

export const HP_PAD_MODES: Record<Mode, ModeInfo> = {
	damage: { label: 'Damage', sign: '−', verb: n => `Deal ${n} damage` },
	heal: { label: 'Heal', sign: '+', verb: n => `Heal ${n}` },
	set: { label: 'Set', sign: '=', verb: n => `Set HP to ${n}` },
	temp: { label: 'Temp', sign: 't', verb: n => `Give ${n} temp HP` },
};

function defaultCommand(mode: Mode, v: number, crit: boolean, mod: DamageMod | undefined): HpCommand | null {
	if (mode === 'damage') return v > 0 ? { kind: 'damage', amount: v, crit, type: mod } : null;
	if (mode === 'heal') return v > 0 ? { kind: 'heal', amount: v } : null;
	if (mode === 'set') return { kind: 'set', amount: v };
	return v > 0 ? { kind: 'temp', amount: v } : null;
}

export function openHpPad(anchor: HTMLElement, s: HpPadSpec): void {
	const modes = s.modes ?? HP_PAD_MODES;
	let mode: Mode = s.start && modes[s.start] ? s.start : (Object.keys(modes)[0] as Mode);
	let amount = '';
	let crit = false;
	let mod: DamageMod | undefined;
	const picks: HpPadPicks = {};
	const n = () => Number(amount || '0');

	const command = (): HpCommand | null => s.command ? s.command(mode, n(), crit, mod, picks) : defaultCommand(mode, n(), crit, mod);

	openPopover(anchor, (el, close) => {
		el.addClass('nimble-hp-pad');
		if (s.cls) el.addClasses(s.cls.split(/\s+/).filter(Boolean));
		// The game's look: the one asked for, else the surface the keypad was opened from.
		const from = anchor.closest<HTMLElement>('[class*="ev-sys-"]');
		applyLook(el, s.system ?? Array.from(from?.classList ?? []).find(c => c.startsWith('ev-sys-'))?.slice('ev-sys-'.length));
		el.setAttr('tabindex', '-1');
		el.setAttr('role', 'dialog');

		const head = el.createDiv({ cls: 'hp-pad-head' });
		const nameId = `hp-pad-name-${s.id}`;
		head.createDiv({ cls: 'hp-pad-name', text: s.label, attr: { id: nameId } });
		el.setAttr('aria-labelledby', nameId);
		const x = head.createEl('button', { cls: 'hp-pad-close clickable-icon', attr: { 'aria-label': 'Close' } });
		setIcon(x, evIcon('x'));
		x.onclick = () => close();

		// Where it lands, and the amount: the read-out the GM checks before Apply.
		const read = el.createDiv({ cls: 'hp-pad-read' });
		const who = read.createDiv({ cls: 'hp-pad-who' });
		who.createDiv({ cls: 'hp-pad-sub', text: s.sub });
		const preview = who.createDiv({ cls: 'hp-pad-preview' });
		const screen = read.createDiv({ cls: 'hp-pad-screen' });
		const sign = screen.createSpan({ cls: 'hp-pad-sign' });
		const display = screen.createSpan({ cls: 'hp-pad-display', attr: { 'aria-live': 'polite' } });

		const seg = el.createDiv({ cls: 'hp-pad-modes', attr: { role: 'radiogroup' } });
		const modeButtons = new Map<Mode, HTMLButtonElement>();
		for (const [m, info] of Object.entries(modes) as [Mode, ModeInfo][]) {
			const b = seg.createEl('button', { cls: `hp-pad-mode mode-${m}`, text: info.label, attr: { role: 'radio' } });
			b.onclick = () => { mode = m; refresh(); };
			modeButtons.set(m, b);
		}

		// What a player says at the table: quiet chips, only while dealing damage.
		const quick = s.quick?.items.length ? s.quick : null;
		const quickBox = quick ? el.createDiv({ cls: 'hp-pad-quick' }) : null;
		const quickChips: { q: HpPadQuick; b: HTMLButtonElement }[] = [];
		const choiceRow = quick ? createDiv({ cls: 'hp-pad-choices' }) : null;
		if (quick && quickBox && choiceRow) {
			quickBox.createDiv({ cls: 'hp-pad-quick-label', text: quick.label });
			const row = quickBox.createDiv({ cls: 'hp-pad-quick-row' });
			for (const q of quick.items) {
				const b = row.createEl('button', { cls: `hp-pad-qa qa-${q.id}`, attr: { 'aria-pressed': 'false' } });
				b.createSpan({ cls: 'hp-pad-qa-text', text: q.text });
				if (q.sub) b.createSpan({ cls: 'hp-pad-qa-sub', text: q.sub });
				b.onclick = () => {
					if (picks[q.id] !== undefined) delete picks[q.id];
					else if (q.choices?.length === 1) picks[q.id] = q.choices[0].id;
					else picks[q.id] = q.choices?.length ? '' : true;
					mode = 'damage';
					refresh();
				};
				quickChips.push({ q, b });
			}
			quickBox.appendChild(choiceRow);
		}

		// Vulnerable / Resisted, when the game has them here. The row keeps its space in every
		// mode so switching to Heal doesn't make the keypad jump.
		const toggles: { b: HTMLButtonElement; on: () => boolean }[] = [];
		const mods = s.mods;
		const toggleRow = mods ? el.createDiv({ cls: 'hp-pad-toggles' }) : null;
		if (toggleRow && mods) {
			const toggle = (label: string, on: () => boolean, flip: () => void) => {
				const b = toggleRow.createEl('button', { text: label, attr: { 'aria-pressed': 'false' } });
				b.onclick = () => { flip(); refresh(); };
				toggles.push({ b, on });
			};
			toggle(mods.vulnerable, () => mod === 'vulnerable', () => { mod = mod === 'vulnerable' ? undefined : 'vulnerable'; });
			toggle(mods.resisted, () => mod === 'resisted', () => { mod = mod === 'resisted' ? undefined : 'resisted'; });
		}

		// The keys, as a phone lays them out; Crit where the game has crits (else Clear), and delete.
		const keys = el.createDiv({ cls: 'hp-pad-keys' });
		let critKey: HTMLButtonElement | null = null;
		for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', s.crit ? 'Crit' : 'C', '0', '⌫']) {
			const b = keys.createEl('button', { cls: k === 'C' || k === '⌫' ? 'is-fn' : k === 'Crit' ? 'is-fn hp-pad-crit' : '' });
			if (k === '⌫') {
				b.addClass('hp-pad-back');
				b.setAttr('aria-label', 'Delete');
				setIcon(b, evIcon('delete'));
				b.onclick = () => key('⌫');
				// Hold to clear.
				let hold = 0;
				b.addEventListener('pointerdown', () => { hold = window.setTimeout(() => { hold = 0; key('C'); }, 450); });
				for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (hold) window.clearTimeout(hold); hold = 0; });
				continue;
			}
			b.setText(k);
			if (k === 'Crit') {
				critKey = b;
				b.setAttr('aria-pressed', 'false');
				b.onclick = () => { if (mode === 'damage') { crit = !crit; refresh(); } };
			} else b.onclick = () => key(k);
		}

		const go = el.createDiv({ cls: 'hp-pad-go' });
		const cancel = go.createEl('button', { cls: 'hp-pad-cancel', text: 'Cancel' });
		cancel.onclick = () => close();
		const apply = go.createEl('button', { cls: 'hp-pad-apply mod-cta' });
		const submit = () => {
			const cmd = command();
			if (!cmd) { el.addClass('is-shake'); window.setTimeout(() => el.removeClass('is-shake'), 300); return; }
			close();
			s.apply(cmd, { ...picks });
		};
		apply.onclick = submit;

		function key(k: string): void {
			if (k === 'C') amount = '';
			else if (k === '⌫') amount = amount.slice(0, -1);
			else if ((amount + k).length <= 4) amount = (amount + k).replace(/^0+(?=\d)/, '');
			refresh();
		}

		function drawChoices(): void {
			if (!choiceRow) return;
			choiceRow.empty();
			const open = quickChips.find(({ q }) => q.choices && q.choices.length > 1 && picks[q.id] !== undefined);
			if (!open) { choiceRow.hide(); return; }
			choiceRow.show();
			for (const c of open.q.choices ?? []) {
				const b = choiceRow.createEl('button', { cls: 'hp-pad-choice', text: c.text, attr: { 'aria-pressed': String(picks[open.q.id] === c.id) } });
				b.toggleClass('is-active', picks[open.q.id] === c.id);
				b.onclick = () => { picks[open.q.id] = c.id; refresh(); };
			}
		}

		function refresh(): void {
			const modeList = [...modeButtons.keys()];
			for (const [m, b] of modeButtons) {
				b.toggleClass('is-active', m === mode);
				b.setAttr('aria-checked', String(m === mode));
			}
			slideThumb(seg, modeList.indexOf(mode), modeList.length);
			el.dataset.mode = mode;
			sign.setText(modes[mode]?.sign ?? '');
			display.setText(amount || '0');
			display.toggleClass('is-empty', !amount);
			toggleRow?.toggleClass('is-off', mode !== 'damage');
			quickBox?.toggleClass('is-off', mode !== 'damage');
			if (mode !== 'damage') for (const k of Object.keys(picks)) delete picks[k];
			for (const { q, b } of quickChips) {
				const on = picks[q.id] !== undefined;
				b.toggleClass('is-active', on);
				b.setAttr('aria-pressed', String(on));
			}
			drawChoices();
			if (critKey) {
				critKey.toggleClass('is-active', crit && mode === 'damage');
				critKey.setAttr('aria-pressed', String(crit && mode === 'damage'));
				critKey.disabled = mode !== 'damage';
			}
			for (const t of toggles) {
				const on = t.on();
				t.b.toggleClass('is-active', on);
				t.b.setAttr('aria-pressed', String(on));
			}
			const v = n();
			const cmd = command();
			apply.setText(cmd ? modes[mode]!.verb(cmd.kind === 'damage' || cmd.kind === 'heal' ? cmd.amount : v) : modes[mode]!.verb(0).replace(/\s*\b0\b\s*/, ' ').trim());
			apply.disabled = !cmd;
			const text = s.preview(mode, v, crit, mod, picks);
			preview.setText(text || 'Tap or type an amount');
			preview.toggleClass('is-hint', !text);
		}

		// Keyboard: digits and the old shorthand. Capture so nothing else (the editor, hotkeys) sees these keys.
		const doc = anchor.ownerDocument;
		const onKey = (e: KeyboardEvent) => {
			if (!el.isConnected) { doc.removeEventListener('keydown', onKey, true); return; }
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			let handled = true;
			if (/^\d$/.test(e.key)) key(e.key);
			else if (e.key === 'Backspace') key('⌫');
			else if (e.key === 'Delete') key('C');
			else if (e.key === 'Enter') submit();
			else if (e.key === '-' && modes.damage) { mode = 'damage'; refresh(); }
			else if (e.key === '+' && modes.heal) { mode = 'heal'; refresh(); }
			else if (e.key === '=' && modes.set) { mode = 'set'; refresh(); }
			else if (e.key.toLowerCase() === 't' && modes.temp) { mode = 'temp'; refresh(); }
			else if (e.key === '!' && s.crit) { mode = 'damage'; crit = !crit; refresh(); }
			else if (e.key.toLowerCase() === 'v' && mods) { mode = 'damage'; mod = mod === 'vulnerable' ? undefined : 'vulnerable'; refresh(); }
			else if (e.key.toLowerCase() === 'r' && mods) { mode = 'damage'; mod = mod === 'resisted' ? undefined : 'resisted'; refresh(); }
			else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				const list = [...modeButtons.keys()];
				mode = list[(list.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
				refresh();
			} else handled = false;
			if (handled) { e.preventDefault(); e.stopPropagation(); }
		};
		doc.addEventListener('keydown', onKey, true);

		refresh();
		window.setTimeout(() => el.focus({ preventScroll: true }), 0);
	}, { cls: 'nimble-hp-pop', placement: 'side', sideOf: s.sideOf ?? null, width: matchMedia('(pointer: coarse)').matches ? 312 : 280 });
}

export { closePopover as closeHpPad };
