// The HP keypad every tracker shares: tap a combatant's HP and a small keypad
// opens next to it (a bottom sheet on phones). It starts on Damage; switch to
// Heal, Set or Temp HP, toggle Crit (and Vulnerable / Resisted where the game
// has them), and the preview shows where it lands before you apply it. Typing
// works too, with the HP language (core/tracker/hp.ts): 12, 12!, +5, =20, t5,
// 12v, 12r, then Enter. Each game says what the modes are called, whether
// there's a Crit key, and what the preview says.

import { setIcon } from 'obsidian';
import { openPopover } from '../popover';
import { slideThumb } from '../segmented';
import type { DamageMod, HpCommand } from './hp';

export type HpPadMode = 'damage' | 'heal' | 'set' | 'temp';
type Mode = HpPadMode;
export interface HpPadModeInfo { label: string; verb: (n: number) => string; sign: string }
type ModeInfo = HpPadModeInfo;

export interface HpPadSpec {
	/** For ids in the keypad. */
	id: string;
	label: string;
	/** Under the name: "12/20 HP +3 temp". */
	sub: string;
	/** The modes offered, in order, with their words (the default: damage, heal, set, temp). */
	modes?: Partial<Record<Mode, ModeInfo>>;
	/** A Crit key (else Clear). */
	crit: boolean;
	/** Vulnerable and Resisted toggles, with their labels ("Vulnerable ×2"); none without. */
	mods?: { vulnerable: string; resisted: string } | null;
	/** What the keypad's state means (the default: any amount above 0, set to anything). */
	command?: (mode: Mode, amount: number, crit: boolean, mod: DamageMod | undefined) => HpCommand | null;
	/** Where it lands: "→ 8/20". Empty for the hint. */
	preview: (mode: Mode, amount: number, crit: boolean, mod: DamageMod | undefined) => string;
	/** The tracker the keypad sits beside. */
	sideOf?: HTMLElement | null;
	apply: (cmd: HpCommand) => void;
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
	let mode: Mode = 'damage';
	let amount = '';
	let crit = false;
	let mod: DamageMod | undefined;
	const n = () => Number(amount || '0');

	const command = (): HpCommand | null => (s.command ?? defaultCommand)(mode, n(), crit, mod);

	openPopover(anchor, (el, close) => {
		el.addClass('nimble-hp-pad');
		el.setAttr('tabindex', '-1');
		el.setAttr('role', 'dialog');

		const head = el.createDiv({ cls: 'hp-pad-head' });
		const nameId = `hp-pad-name-${s.id}`;
		head.createDiv({ cls: 'hp-pad-name', text: s.label, attr: { id: nameId } });
		el.setAttr('aria-labelledby', nameId);
		head.createDiv({ cls: 'hp-pad-sub', text: s.sub });

		const seg = el.createDiv({ cls: 'hp-pad-modes', attr: { role: 'radiogroup' } });
		const modeButtons = new Map<Mode, HTMLButtonElement>();
		for (const [m, info] of Object.entries(modes) as [Mode, ModeInfo][]) {
			const b = seg.createEl('button', { cls: `hp-pad-mode mode-${m}`, text: info.label, attr: { role: 'radio' } });
			b.onclick = () => { mode = m; refresh(); };
			modeButtons.set(m, b);
		}

		const screen = el.createDiv({ cls: 'hp-pad-screen' });
		const sign = screen.createSpan({ cls: 'hp-pad-sign' });
		const display = screen.createSpan({ cls: 'hp-pad-display', attr: { 'aria-live': 'polite' } });
		const back = screen.createEl('button', { cls: 'hp-pad-back clickable-icon', attr: { 'aria-label': 'Delete' } });
		setIcon(back, 'delete');
		back.onclick = () => key('⌫');
		// Hold to clear.
		let hold = 0;
		back.addEventListener('pointerdown', () => { hold = window.setTimeout(() => { hold = 0; key('C'); }, 450); });
		for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) back.addEventListener(ev, () => { if (hold) window.clearTimeout(hold); hold = 0; });

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

		// Crit sits on the keypad (where Clear used to be); without crits (minions), Clear.
		const keys = el.createDiv({ cls: 'hp-pad-keys' });
		let critKey: HTMLButtonElement | null = null;
		for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', s.crit ? 'Crit' : 'C', '0', '00']) {
			const b = keys.createEl('button', { text: k, cls: k === 'C' ? 'is-fn' : k === 'Crit' ? 'is-fn hp-pad-crit' : '' });
			if (k === 'Crit') {
				critKey = b;
				b.setAttr('aria-pressed', 'false');
				b.onclick = () => { if (mode === 'damage') { crit = !crit; refresh(); } };
			} else b.onclick = () => key(k);
		}

		const preview = el.createDiv({ cls: 'hp-pad-preview' });
		const go = el.createEl('button', { cls: 'hp-pad-apply mod-cta' });
		const submit = () => {
			const cmd = command();
			if (!cmd) { el.addClass('is-shake'); window.setTimeout(() => el.removeClass('is-shake'), 300); return; }
			close();
			s.apply(cmd);
		};
		go.onclick = submit;

		function key(k: string): void {
			if (k === 'C') amount = '';
			else if (k === '⌫') amount = amount.slice(0, -1);
			else if ((amount + k).length <= 4) amount = (amount + k).replace(/^0+(?=\d)/, '');
			refresh();
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
			go.setText(cmd ? modes[mode]!.verb(cmd.kind === 'damage' || cmd.kind === 'heal' ? cmd.amount : v) : modes[mode]!.verb(0).replace(/\s*\b0\b\s*/, ' ').trim());
			go.disabled = !cmd;
			const text = s.preview(mode, v, crit, mod);
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
	}, { cls: 'nimble-hp-pop', placement: 'side', sideOf: s.sideOf ?? null, width: matchMedia('(pointer: coarse)').matches ? 300 : 264 });
}
