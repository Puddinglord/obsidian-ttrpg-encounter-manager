// "Add several…" from a monster's Add menu: how many to add to the current
// encounter, and optionally a level tougher or weaker (shiftMonster, as the
// menu's own Add tougher / Add weaker do). Enter adds, Escape cancels.

import { App, Modal, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import type { NimbleMonster } from './types';
import { formatLevel, monsterRole, shiftMonster } from './rules';

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
	private strengthDesc: HTMLElement | null = null;

	constructor(app: App, private plugin: NimbleStatblocksPlugin, private monster: NimbleMonster, private filePath?: string) {
		super(app);
	}

	/** Rows like Obsidian's settings: what it is (and what it does) on the left, the control on the right. */
	private row(parent: HTMLElement, name: string): { info: HTMLElement; desc: HTMLElement; control: HTMLElement } {
		const row = parent.createDiv({ cls: 'nimble-count-row' });
		const info = row.createDiv({ cls: 'nimble-count-info' });
		info.createDiv({ cls: 'nimble-count-name', text: name });
		const desc = info.createDiv({ cls: 'nimble-count-desc' });
		const control = row.createDiv({ cls: 'nimble-count-control' });
		return { info, desc, control };
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-count-modal');
		this.titleEl.setText(`Add ${this.monster.name}`);
		const c = this.contentEl;
		const enc = this.plugin.encounters.active;
		const here = (enc?.creatures ?? []).filter(x => x.monster.name === this.monster.name).reduce((n, x) => n + (x.count ?? 1), 0);
		c.createDiv({ cls: 'nimble-count-to', text: [enc?.name ? `To ${enc.name}` : 'To the current encounter', here ? `${here} already in the fight` : ''].filter(Boolean).join(' · ') });

		const rows = c.createDiv({ cls: 'nimble-count-rows' });
		const how = this.row(rows, 'How many');
		how.desc.setText('Type a number, or use ↑ ↓');
		const stepper = how.control.createDiv({ cls: 'nimble-count-stepper' });
		this.minus = this.stepButton(stepper, 'minus', 'One fewer', -1);
		this.input = stepper.createEl('input', {
			cls: 'nimble-count-input',
			type: 'number',
			attr: { min: String(COUNT_MIN), max: String(COUNT_MAX), step: '1', inputmode: 'numeric' },
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
			const str = this.row(rows, 'Strength');
			this.strengthDesc = str.desc;
			const seg = str.control.createDiv({ cls: 'nimble-count-shift', attr: { role: 'radiogroup' } });
			for (const sh of SHIFTS) {
				const b = seg.createEl('button', { cls: 'nimble-count-seg', attr: { role: 'radio', 'aria-label': sh.title, 'data-shift': String(sh.shift) } });
				b.createSpan({ text: sh.label });
				b.addEventListener('click', () => { this.shift = sh.shift; this.refresh(); this.input.focus(); });
			}
		}

		const foot = c.createDiv({ cls: 'nimble-count-actions' });
		this.summary = foot.createDiv({ cls: 'nimble-count-summary' });
		foot.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		this.addBtn = foot.createEl('button', { cls: 'mod-cta nimble-count-add' });
		this.addBtn.addEventListener('click', () => this.submit());

		this.refresh();
		window.setTimeout(() => { this.input.focus(); this.input.select(); }, 0);
	}

	private stepButton(parent: HTMLElement, icon: string, label: string, by: number): HTMLButtonElement {
		const b = parent.createEl('button', { cls: 'nimble-count-step', attr: { 'aria-label': label } });
		setIcon(b, icon);
		b.addEventListener('click', () => this.step(by));
		return b;
	}

	private step(by: number): void {
		this.count = clamp(this.count + by);
		this.refresh();
		this.input.select();
	}

	/** Sync the field (unless the user is mid-typing), the − / + limits, the strength buttons and the Add label. */
	private refresh(writeInput = true): void {
		if (writeInput) this.input.value = String(this.count);
		this.minus.disabled = this.count <= COUNT_MIN;
		this.plus.disabled = this.count >= COUNT_MAX;
		this.contentEl.querySelectorAll<HTMLElement>('.nimble-count-seg').forEach(b => {
			const on = Number(b.dataset.shift) === this.shift;
			b.toggleClass('is-active', on);
			b.setAttr('aria-checked', String(on));
		});
		const which = this.shift > 0 ? 'tougher ' : this.shift < 0 ? 'weaker ' : '';
		this.addBtn.setText(`Add ${this.count} ${which}`.trimEnd());
		// What you'd actually get: the level and HP after the shift, per monster and in total.
		const m = shiftMonster(this.monster, this.shift);
		const lvl = formatLevel(m.level);
		const hp = m.hpPerHero ? `${m.hpPerHero} HP/hero` : `${m.hp} HP`;
		this.strengthDesc?.setText(`${this.shift ? (this.shift > 0 ? '+1 level' : '−1 level') : 'As written'}${lvl ? ` · Lvl ${lvl}` : ''} · ${hp} each`);
		const total = !m.hpPerHero && m.hp && monsterRole(m) !== 'minion' ? ` · ${m.hp * this.count} HP in all` : '';
		this.summary.setText(`${this.count} × ${this.monster.name}${total}`);
	}

	private submit(): void {
		const n = parseInt(this.input.value, 10);
		if (Number.isFinite(n)) this.count = clamp(n);
		const monster = shiftMonster(this.monster, this.shift);
		this.close();
		void this.plugin.addToEncounter(monster, this.filePath, this.count);
	}

	onClose(): void { this.contentEl.empty(); }
}
