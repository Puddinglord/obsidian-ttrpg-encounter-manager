// "Add several…" from a monster's Add menu: how many to add to the current
// encounter, and optionally a level tougher or weaker (shiftMonster, as the
// menu's own Add tougher / Add weaker do). Enter adds, Escape cancels. A game
// dialog (core/dialog.ts): the count on the keypad's keys, Strength as three
// equal segments, Cancel | Add.

import { App, Modal, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import type { NimbleMonster } from './types';
import { formatLevel, monsterRole, shiftMonster } from './rules';
import { nimble } from './runtime';
import { dialogFoot, dialogLabel, gameDialog } from '../../core/dialog';
import { evIcon } from '../../core/icons';
import { setPill } from '../../core/pill';
import { slideThumb } from '../../core/segmented';

export const COUNT_MIN = 1;
export const COUNT_MAX = 50;

const SHIFTS: { shift: number; label: string; title: string }[] = [
	{ shift: -1, label: 'Weaker', title: 'One level weaker' },
	{ shift: 0, label: 'Normal', title: 'As written' },
	{ shift: 1, label: 'Tougher', title: 'One level tougher' },
];

const clamp = (n: number) => Math.min(COUNT_MAX, Math.max(COUNT_MIN, Math.round(n)));

export class AddSeveralModal extends Modal {
	private count = 2;
	private shift = 0;
	private input!: HTMLInputElement;
	private minus!: HTMLButtonElement;
	private plus!: HTMLButtonElement;
	private addBtn!: HTMLButtonElement;
	private summary!: HTMLElement;
	private seg: HTMLElement | null = null;
	private strengthDesc: HTMLElement | null = null;

	constructor(app: App, private plugin: EmberVaultPlugin, private monster: NimbleMonster, private filePath?: string) {
		super(app);
	}

	onOpen(): void {
		gameDialog(this, 'nimble', { cls: 'nimble-count-modal', compact: true });
		this.titleEl.setText(`Add ${this.monster.name}`);
		const c = this.contentEl;
		const enc = nimble().encounters.active;
		const here = (enc?.creatures ?? []).filter(x => x.monster.name === this.monster.name).reduce((n, x) => n + (x.count ?? 1), 0);
		c.createDiv({ cls: 'nimble-count-to', text: [enc?.name ? `To ${enc.name}` : 'To the current encounter', here ? `${here} already in the fight` : ''].filter(Boolean).join(' · ') });

		// How many: the keypad's − and + either side of the number, which takes typing and ↑ ↓.
		const how = c.createDiv({ cls: 'nimble-count-row' });
		dialogLabel(how, 'How many');
		const stepper = how.createDiv({ cls: 'nimble-count-stepper ev-keys' });
		this.minus = this.stepButton(stepper, 'minus', 'One fewer', -1);
		this.input = stepper.createEl('input', {
			cls: 'nimble-count-input',
			type: 'number',
			attr: { min: String(COUNT_MIN), max: String(COUNT_MAX), step: '1', inputmode: 'numeric', 'aria-label': 'How many' },
		});
		this.plus = this.stepButton(stepper, 'plus', 'One more', 1);
		this.input.addEventListener('input', () => {
			const n = parseInt(this.input.value, 10);
			if (Number.isFinite(n)) { this.count = clamp(n); this.refresh(false); }
		});
		this.input.addEventListener('blur', () => this.refresh());
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault();
				this.step(e.key === 'ArrowUp' ? 1 : -1);
			} else if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				this.submit();
			}
		});

		// Minions don't scale by level (shiftMonster leaves them as they are).
		if (monsterRole(this.monster) !== 'minion') {
			const str = c.createDiv({ cls: 'nimble-count-row' });
			this.strengthDesc = dialogLabel(str, 'Strength', '', 'nimble-count-desc').value;
			this.seg = str.createDiv({ cls: 'nimble-count-shift ev-seg', attr: { role: 'radiogroup', 'aria-label': 'Strength' } });
			for (const sh of SHIFTS) {
				const b = this.seg.createEl('button', { cls: 'nimble-count-seg', attr: { role: 'radio', 'aria-label': sh.title, 'data-shift': String(sh.shift) } });
				b.createSpan({ text: sh.label });
				b.addEventListener('click', () => { const from = this.shift; this.shift = sh.shift; this.refresh(true, from); this.input.focus(); });
			}
		}

		this.summary = c.createDiv({ cls: 'nimble-count-summary' });
		this.addBtn = dialogFoot(c, { cancel: () => this.close(), main: { text: 'Add', icon: evIcon('plus'), cls: 'nimble-count-add', onClick: () => this.submit() } }).main;

		this.refresh();
		window.setTimeout(() => { this.input.focus(); this.input.select(); }, 0);
	}

	private stepButton(parent: HTMLElement, icon: 'minus' | 'plus', label: string, by: number): HTMLButtonElement {
		const b = parent.createEl('button', { cls: 'nimble-count-step', attr: { 'aria-label': label } });
		setIcon(b, evIcon(icon));
		b.addEventListener('click', () => this.step(by));
		return b;
	}

	private step(by: number): void {
		this.count = clamp(this.count + by);
		this.refresh();
		this.input.select();
	}

	/** Sync the field (unless the user is mid-typing), the − / + limits, the strength buttons and the Add label. */
	private refresh(writeInput = true, fromShift?: number): void {
		if (writeInput) this.input.value = String(this.count);
		this.minus.disabled = this.count <= COUNT_MIN;
		this.plus.disabled = this.count >= COUNT_MAX;
		this.contentEl.querySelectorAll<HTMLElement>('.nimble-count-seg').forEach(b => {
			const on = Number(b.dataset.shift) === this.shift;
			b.toggleClass('is-active', on);
			b.setAttr('aria-checked', String(on));
		});
		if (this.seg) slideThumb(this.seg, this.shift + 1, SHIFTS.length, fromShift !== undefined ? fromShift + 1 : undefined);
		const which = this.shift > 0 ? 'tougher ' : this.shift < 0 ? 'weaker ' : '';
		setPill(this.addBtn, { icon: evIcon('plus'), text: `Add ${this.count} ${which}`.trimEnd() });
		// What you'd actually get: the level and HP after the shift, per monster and in total.
		const m = shiftMonster(this.monster, this.shift);
		const lvl = formatLevel(m.level);
		const hp = m.hpPerHero ? `${m.hpPerHero} HP/hero` : `${m.hp} HP`;
		this.strengthDesc?.setText(`${lvl ? `Lvl ${lvl} · ` : ''}${hp} each`);
		const total = !m.hpPerHero && m.hp && monsterRole(m) !== 'minion' ? ` · ${m.hp * this.count} HP in all` : '';
		this.summary.setText(`${this.count} × ${this.monster.name}${total}`);
	}

	private submit(): void {
		const n = parseInt(this.input.value, 10);
		if (Number.isFinite(n)) this.count = clamp(n);
		const monster = shiftMonster(this.monster, this.shift);
		this.close();
		void nimble().addToEncounter(monster, this.filePath, this.count);
	}

	onClose(): void { this.contentEl.empty(); }
}
