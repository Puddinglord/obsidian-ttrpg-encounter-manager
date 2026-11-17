// The HP calculator: tap a combatant's HP and a small keypad opens next to it
// (a bottom sheet on phones). It starts on Damage; switch to Heal, Set or Temp
// HP, toggle Crit / Vulnerable / Resisted, and the preview shows the armor math
// before you apply it. Typing works too, with the same shorthand as always:
// 12, 12!, +5, =20, t5, 12v, 12r, then Enter.

import { DamageMod, HpCommand, monsterRole } from './rules';
import { EncounterCreature } from './types';
import { isHero, isMinionGroup, monsterHit } from './encounters';
import { closePopover, openPopover } from '../../core/popover';
import { openHpPad } from '../../core/tracker/hp-pad';
import { setIcon } from 'obsidian';
import { slideThumb } from '../../core/segmented';

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

	openHpPad(anchor, {
		id: c.id,
		label: c.label,
		sub: minions
			? `${c.alive} of ${c.count} standing · any hit drops one`
			: `${c.currentHp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${!hero && c.monster.armor !== 'none' ? ` · ${c.monster.armor === 'medium' ? 'Medium' : 'Heavy'} armor` : ''}`,
		modes,
		// Minions can't crit; heroes and minions have no vulnerable/resisted (armor is a monster's).
		crit: !minions,
		mods: !minions && !hero ? { vulnerable: 'Vulnerable +10', resisted: 'Resisted −10' } : null,
		command: (mode, v, crit, mod) => {
			if (mode === 'damage') return minions ? { kind: 'damage', amount: Math.max(1, v), crit: false } : v > 0 ? { kind: 'damage', amount: v, crit, type: mod } : null;
			if (mode === 'heal') return v > 0 || minions ? { kind: 'heal', amount: Math.max(1, v) } : null;
			if (mode === 'set') return { kind: 'set', amount: v };
			if (mode === 'temp') return v > 0 ? { kind: 'temp', amount: v } : null;
			return null;
		},
		preview: (mode, v, crit, mod) => previewText(c, mode, v, crit, mod, autoArmor),
		sideOf: anchor.closest<HTMLElement>('.nimble-encounter-tracker'),
		apply,
	});
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

export type ManaCommand = { kind: 'spend' | 'regain' | 'set'; amount: number };

/**
 * The same keypad for a hero's mana: Spend, Regain or Set, an amount, and a
 * preview of where it lands ("5 → 2 of 8 mana"). Opened from the character sheet.
 */
export function openManaCalculator(anchor: HTMLElement, hero: { name: string; mana: number; max: number }, apply: (cmd: ManaCommand) => void): void {
	const modes: Record<ManaCommand['kind'], { label: string; sign: string; verb: (n: number) => string }> = {
		spend: { label: 'Spend', sign: '−', verb: n => `Spend ${n} mana` },
		regain: { label: 'Regain', sign: '+', verb: n => `Regain ${n} mana` },
		set: { label: 'Set', sign: '=', verb: n => `Set mana to ${n}` },
	};
	let mode: ManaCommand['kind'] = 'spend';
	let amount = '';
	const n = () => Number(amount || '0');
	const after = (): number => {
		const v = n();
		return mode === 'spend' ? hero.mana - v : mode === 'regain' ? Math.min(hero.max, hero.mana + v) : Math.min(hero.max, v);
	};
	const command = (): ManaCommand | null => {
		const v = n();
		if (mode === 'set') return { kind: 'set', amount: v };
		if (v <= 0) return null;
		if (mode === 'spend' && v > hero.mana) return null;
		return { kind: mode, amount: v };
	};

	openPopover(anchor, (el, close) => {
		el.addClass('nimble-hp-pad', 'nimble-mana-pad');
		el.setAttr('tabindex', '-1');
		el.setAttr('role', 'dialog');
		const head = el.createDiv({ cls: 'hp-pad-head' });
		head.createDiv({ cls: 'hp-pad-name', text: hero.name });
		head.createDiv({ cls: 'hp-pad-sub', text: `${hero.mana}/${hero.max} mana` });
		const seg = el.createDiv({ cls: 'hp-pad-modes', attr: { role: 'radiogroup', 'aria-label': 'Spend, regain or set' } });
		const buttons = new Map<ManaCommand['kind'], HTMLButtonElement>();
		for (const [m, info] of Object.entries(modes) as [ManaCommand['kind'], typeof modes.spend][]) {
			const b = seg.createEl('button', { cls: `hp-pad-mode mode-${m}`, text: info.label, attr: { role: 'radio' } });
			b.onclick = () => { mode = m; refresh(); };
			buttons.set(m, b);
		}
		const screen = el.createDiv({ cls: 'hp-pad-screen' });
		const sign = screen.createSpan({ cls: 'hp-pad-sign' });
		const display = screen.createSpan({ cls: 'hp-pad-display', attr: { 'aria-live': 'polite' } });
		const back = screen.createEl('button', { cls: 'hp-pad-back clickable-icon', attr: { 'aria-label': 'Delete' } });
		setIcon(back, 'delete');
		back.onclick = () => key('⌫');
		const keys = el.createDiv({ cls: 'hp-pad-keys' });
		for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '00']) {
			const b = keys.createEl('button', { text: k, cls: k === 'C' ? 'is-fn' : '' });
			b.onclick = () => key(k);
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
			else if ((amount + k).length <= 3) amount = (amount + k).replace(/^0+(?=\d)/, '');
			refresh();
		}
		function refresh(): void {
			const list = [...buttons.keys()];
			for (const [m, b] of buttons) { b.toggleClass('is-active', m === mode); b.setAttr('aria-checked', String(m === mode)); }
			slideThumb(seg, list.indexOf(mode), list.length);
			el.dataset.mode = mode;
			sign.setText(modes[mode].sign);
			display.setText(amount || '0');
			display.toggleClass('is-empty', !amount);
			const cmd = command();
			go.setText(cmd ? modes[mode].verb(n()) : modes[mode].verb(0).replace(/\s*\b0\b\s*/, ' ').trim());
			go.disabled = !cmd;
			const short = mode === 'spend' && n() > hero.mana;
			preview.setText(short ? `Only ${hero.mana} mana left` : amount || mode === 'set' ? `${hero.mana} → ${Math.max(0, after())} of ${hero.max} mana` : 'Tap or type an amount');
			preview.toggleClass('is-hint', !amount && mode !== 'set');
		}
		const doc = anchor.ownerDocument;
		const onKey = (e: KeyboardEvent) => {
			if (!el.isConnected) { doc.removeEventListener('keydown', onKey, true); return; }
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			let handled = true;
			if (/^\d$/.test(e.key)) key(e.key);
			else if (e.key === 'Backspace') key('⌫');
			else if (e.key === 'Delete') key('C');
			else if (e.key === 'Enter') submit();
			else if (e.key === '-') { mode = 'spend'; refresh(); }
			else if (e.key === '+') { mode = 'regain'; refresh(); }
			else if (e.key === '=') { mode = 'set'; refresh(); }
			else handled = false;
			if (handled) { e.preventDefault(); e.stopPropagation(); }
		};
		doc.addEventListener('keydown', onKey, true);
		refresh();
		window.setTimeout(() => el.focus({ preventScroll: true }), 0);
	}, { cls: 'nimble-hp-pop', placement: 'side', width: matchMedia('(pointer: coarse)').matches ? 300 : 264 });
}
