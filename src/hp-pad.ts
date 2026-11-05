// Touch-friendly HP entry: a keypad sheet with big Damage / Heal / Set / Temp
// buttons and Crit / Vulnerable / Resisted toggles. No on-screen keyboard needed.

import { App, Modal } from 'obsidian';
import { EncounterCreature } from './types';
import { DamageMod, HpCommand, monsterDamage, monsterRole } from './rules';
import { isHero, isMinionGroup } from './encounters';

export class HpPadModal extends Modal {
	private amount = '';
	private crit = false;
	private mod: DamageMod | undefined;
	private display!: HTMLElement;
	private preview!: HTMLElement;
	private toggles: HTMLButtonElement[] = [];

	constructor(app: App, private c: EncounterCreature, private autoArmor: boolean, private apply: (cmd: HpCommand) => void) {
		super(app);
	}

	onOpen(): void {
		const c = this.c;
		this.modalEl.addClass('nimble-hp-pad');
		const minions = isMinionGroup(c);
		this.titleEl.setText(c.label);
		const sub = this.contentEl.createDiv({ cls: 'hp-pad-sub' });
		sub.setText(minions ? `${c.alive} of ${c.count} standing · any hit drops one`
			: `${c.currentHp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${!isHero(c) && c.monster.armor !== 'none' ? ` · ${c.monster.armor === 'medium' ? 'Medium' : 'Heavy'} armor` : ''}`);

		this.display = this.contentEl.createDiv({ cls: 'hp-pad-display', attr: { 'aria-live': 'polite' } });
		this.preview = this.contentEl.createDiv({ cls: 'hp-pad-preview' });

		if (!minions) {
			const row = this.contentEl.createDiv({ cls: 'hp-pad-toggles' });
			const toggle = (label: string, on: () => boolean, flip: () => void, title: string) => {
				const b = row.createEl('button', { text: label, attr: { 'aria-pressed': 'false', title } });
				b.onclick = () => { flip(); this.refresh(); };
				(b as HTMLButtonElement & { isOn?: () => boolean }).isOn = on;
				this.toggles.push(b);
			};
			toggle('Crit', () => this.crit, () => { this.crit = !this.crit; }, isHero(c) ? 'A crit while Dying adds 3 Wounds' : 'Crits ignore armor');
			if (!isHero(c)) {
				toggle('Vulnerable', () => this.mod === 'vulnerable', () => { this.mod = this.mod === 'vulnerable' ? undefined : 'vulnerable'; }, '+10 damage');
				toggle('Resisted', () => this.mod === 'resisted', () => { this.mod = this.mod === 'resisted' ? undefined : 'resisted'; }, '−10 damage');
			}
		}

		const keys = this.contentEl.createDiv({ cls: 'hp-pad-keys' });
		for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']) {
			const b = keys.createEl('button', { text: k, cls: k === 'C' || k === '⌫' ? 'is-fn' : '', attr: { 'aria-label': k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k } });
			b.onclick = () => this.key(k);
		}

		const actions = this.contentEl.createDiv({ cls: 'hp-pad-actions' });
		const act = (label: string, cls: string, cmd: () => HpCommand | null) => {
			const b = actions.createEl('button', { text: label, cls });
			b.onclick = () => { const x = cmd(); if (x) { this.apply(x); this.close(); } };
		};
		const n = () => Number(this.amount || '0');
		if (minions) {
			act('Hit', 'mod-warning', () => n() >= 0 ? { kind: 'damage', amount: Math.max(1, n()), crit: false } : null);
			act('Bring back', '', () => ({ kind: 'heal', amount: Math.max(1, n()) }));
			act('Set standing', '', () => ({ kind: 'set', amount: n() }));
		} else {
			act('Damage', 'mod-warning', () => n() > 0 ? { kind: 'damage', amount: n(), crit: this.crit, type: this.mod } : null);
			act('Heal', 'mod-cta', () => n() > 0 ? { kind: 'heal', amount: n() } : null);
			act('Set HP', '', () => ({ kind: 'set', amount: n() }));
			act('Temp HP', '', () => ({ kind: 'temp', amount: n() }));
		}
		// iPad keyboards and desktops can type too.
		this.scope.register([], 'Enter', () => { actions.querySelector<HTMLButtonElement>('button')?.click(); return false; });
		for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace']) {
			this.scope.register([], k, () => { this.key(k === 'Backspace' ? '⌫' : k); return false; });
		}
		this.refresh();
	}

	private key(k: string): void {
		if (k === 'C') this.amount = '';
		else if (k === '⌫') this.amount = this.amount.slice(0, -1);
		else if (this.amount.length < 4) this.amount = (this.amount + k).replace(/^0+(?=\d)/, '');
		this.refresh();
	}

	private refresh(): void {
		const c = this.c;
		this.display.setText(this.amount || '0');
		this.display.toggleClass('is-empty', !this.amount);
		for (const b of this.toggles) {
			const on = (b as HTMLButtonElement & { isOn?: () => boolean }).isOn?.() ?? false;
			b.toggleClass('is-active', on);
			b.setAttr('aria-pressed', String(on));
		}
		const n = Number(this.amount || '0');
		let text = '';
		if (n > 0 && !isMinionGroup(c) && !isHero(c)) {
			const r = monsterDamage(c.monster.armor, n, this.crit, { autoArmor: this.autoArmor, mod: this.mod });
			text = `Damage: ${r.breakdown} → ${Math.max(0, c.currentHp - r.applied)}/${c.maxHp}`;
			if (monsterRole(c.monster) === 'legendary' && c.currentHp - r.applied <= c.maxHp / 2 && c.currentHp > c.maxHp / 2) text += ' · Bloodied';
		} else if (n > 0 && isHero(c)) {
			text = c.currentHp > 0 && n >= c.currentHp ? `Damage drops ${c.label} to 0: Dying, +1 Wound` : c.currentHp <= 0 ? `Hit while Dying: +${this.crit ? 3 : 2} Wounds` : `Damage → ${c.currentHp - n}/${c.maxHp}`;
		}
		this.preview.setText(text);
	}

	onClose(): void { this.contentEl.empty(); }
}
