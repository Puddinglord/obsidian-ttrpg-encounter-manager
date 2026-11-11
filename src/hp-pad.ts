// The HP calculator: tap a combatant's HP and a small keypad opens next to it
// (a bottom sheet on phones). It starts on Damage; switch to Heal, Set or Temp
// HP, toggle Crit / Vulnerable / Resisted, and the preview shows the armor math
// before you apply it. Typing works too, with the same shorthand as always:
// 12, 12!, +5, =20, t5, 12v, 12r, then Enter.

import { DamageMod, HpCommand, monsterRole } from './rules';
import { EncounterCreature } from './types';
import { isHero, isMinionGroup, monsterHit } from './encounters';
import { closePopover, openPopover } from './popover';
import { setIcon } from 'obsidian';
import { slideThumb } from './segmented';

type Mode = 'damage' | 'heal' | 'set' | 'temp';

interface ModeInfo { label: string; verb: (n: number) => string; sign: string }

export function openHpCalculator(
	anchor: HTMLElement,
	c: EncounterCreature,
	autoArmor: boolean,
	apply: (cmd: HpCommand) => void,
): void {
	const minions = isMinionGroup(c);
	const hero = isHero(c);
	const modes: Partial<Record<Mode, ModeInfo>> = minions
		? {
			damage: { label: 'Hit', sign: '−', verb: n => `Hit for ${n}` },
			heal: { label: 'Bring back', sign: '+', verb: n => `Bring back ${n}` },
			set: { label: 'Set', sign: '=', verb: n => `Set ${n} standing` },
		}
		: {
			damage: { label: 'Damage', sign: '−', verb: n => `Deal ${n} damage` },
			heal: { label: 'Heal', sign: '+', verb: n => `Heal ${n}` },
			set: { label: 'Set', sign: '=', verb: n => `Set HP to ${n}` },
			temp: { label: 'Temp', sign: 't', verb: n => `Give ${n} temp HP` },
		};

	let mode: Mode = 'damage';
	let amount = '';
	let crit = false;
	let mod: DamageMod | undefined;
	const n = () => Number(amount || '0');

	const command = (): HpCommand | null => {
		const v = n();
		if (mode === 'damage') return minions ? { kind: 'damage', amount: Math.max(1, v), crit: false } : v > 0 ? { kind: 'damage', amount: v, crit, type: mod } : null;
		if (mode === 'heal') return v > 0 || minions ? { kind: 'heal', amount: Math.max(1, v) } : null;
		if (mode === 'set') return { kind: 'set', amount: v };
		if (mode === 'temp') return v > 0 ? { kind: 'temp', amount: v } : null;
		return null;
	};

	openPopover(anchor, (el, close) => {
		el.addClass('nimble-hp-pad');
		el.setAttr('tabindex', '-1');
		el.setAttr('role', 'dialog');

		const head = el.createDiv({ cls: 'hp-pad-head' });
		const nameId = `hp-pad-name-${c.id}`;
		head.createDiv({ cls: 'hp-pad-name', text: c.label, attr: { id: nameId } });
		el.setAttr('aria-labelledby', nameId);
		head.createDiv({
			cls: 'hp-pad-sub',
			text: minions
				? `${c.alive} of ${c.count} standing · any hit drops one`
				: `${c.currentHp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${!hero && c.monster.armor !== 'none' ? ` · ${c.monster.armor === 'medium' ? 'Medium' : 'Heavy'} armor` : ''}`,
		});

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

		// Vulnerable / Resisted (monsters only). The row keeps its space in every
		// mode so switching to Heal doesn't make the keypad jump.
		const toggles: { b: HTMLButtonElement; on: () => boolean }[] = [];
		const toggleRow = !minions && !hero ? el.createDiv({ cls: 'hp-pad-toggles' }) : null;
		if (toggleRow) {
			const toggle = (label: string, on: () => boolean, flip: () => void) => {
				const b = toggleRow.createEl('button', { text: label, attr: { 'aria-pressed': 'false' } });
				b.onclick = () => { flip(); refresh(); };
				toggles.push({ b, on });
			};
			toggle('Vulnerable +10', () => mod === 'vulnerable', () => { mod = mod === 'vulnerable' ? undefined : 'vulnerable'; });
			toggle('Resisted −10', () => mod === 'resisted', () => { mod = mod === 'resisted' ? undefined : 'resisted'; });
		}

		// Crit sits on the keypad (where Clear used to be); minions can't crit, so they keep Clear.
		const keys = el.createDiv({ cls: 'hp-pad-keys' });
		let critKey: HTMLButtonElement | null = null;
		for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', minions ? 'C' : 'Crit', '0', '00']) {
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
			apply(cmd);
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
			go.setText(cmd ? modes[mode]!.verb(mode === 'damage' && minions ? Math.max(1, v) : v) : modes[mode]!.verb(0).replace(/\s*\b0\b\s*/, ' ').trim());
			go.disabled = !cmd;
			const text = previewText(c, mode, v, crit, mod, autoArmor);
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
			else if (e.key === '!' && !minions) { mode = 'damage'; crit = !crit; refresh(); }
			else if (e.key.toLowerCase() === 'v' && !minions && !hero) { mode = 'damage'; mod = mod === 'vulnerable' ? undefined : 'vulnerable'; refresh(); }
			else if (e.key.toLowerCase() === 'r' && !minions && !hero) { mode = 'damage'; mod = mod === 'resisted' ? undefined : 'resisted'; refresh(); }
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
	}, { cls: 'nimble-hp-pop', placement: 'side', sideOf: anchor.closest<HTMLElement>('.nimble-encounter-tracker'), width: matchMedia('(pointer: coarse)').matches ? 300 : 264 });
}

export function previewText(c: EncounterCreature, mode: Mode, v: number, crit: boolean, mod: DamageMod | undefined, autoArmor: boolean): string {
	if (isMinionGroup(c)) {
		const alive = c.alive ?? 0;
		if (mode === 'damage') return `Drops at least 1 of ${alive}`;
		if (mode === 'heal') return `${Math.min(c.count ?? 0, alive + Math.max(1, v))} of ${c.count} standing`;
		return `${Math.min(c.count ?? 0, v)} of ${c.count} standing`;
	}
	if (!v && mode !== 'set') return '';
	if (mode === 'heal') return `→ ${Math.min(c.maxHp, c.currentHp + v)}/${c.maxHp}`;
	if (mode === 'set') return `→ ${Math.min(c.maxHp, v)}/${c.maxHp}`;
	if (mode === 'temp') return `→ ${c.currentHp}/${c.maxHp} +${v} temp`;
	if (isHero(c)) {
		if (c.currentHp <= 0) return `Hit while Dying: +${crit ? 3 : 2} Wounds`;
		const left = Math.max(0, c.currentHp + (c.tempHp ?? 0) - v);
		return left <= 0 ? `Drops ${c.label} to 0: Dying, +1 Wound` : `→ ${Math.min(left, c.currentHp)}/${c.maxHp}`;
	}
	// The store's own maths (armor, then temp HP), so the preview is what Apply does.
	const r = monsterHit(c, v, crit, { autoArmor, mod });
	let text = `${r.breakdown}${r.absorbed ? ` − ${r.absorbed} temp` : ''} → ${r.hp}/${c.maxHp}`;
	if (monsterRole(c.monster) === 'legendary' && r.hp <= c.maxHp / 2 && c.currentHp > c.maxHp / 2) text += ' · Bloodied';
	return text;
}

export { closePopover as closeHpCalculator };
