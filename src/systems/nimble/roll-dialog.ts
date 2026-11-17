// The roll dialog: before an attack, a spell, a save or a check, set how much
// advantage or disadvantage you have (a slider, −3 to +3), any situational
// bonus (+/−), and whether to spend dice like Judgment Dice on it. Then roll.

import { App, Modal, setIcon } from 'obsidian';
import type { DiceExpression } from '../../core/dice';
import { edgeLabel, ExtraDice, poolText, Spendable, spendCount } from './roll-def';
import { triangleMark } from '../../core/die-shape';

export type { Spendable };
export { spendCount };

export interface RollRequest {
	title: string;
	dice: DiceExpression;
	attack: boolean;
	/** Starting advantage: +1 for a ▲ save, −1 for an Opportunity Attack… */
	edge?: number;
	/** Why it starts there ("STR save ▲"). */
	edgeReason?: string;
	spendables?: Spendable[];
	/** Shown under the title: "1 action · 2 mana". */
	cost?: string;
	/** Kinds of roll to pick between (a stat's Check or Save), each with its own title and starting advantage. */
	modes?: RollMode[];
	/** The mode it opens on (the first if not given). */
	mode?: string;
	onRoll: (o: { edge: number; bonus: number; extras: ExtraDice[]; spent: { key: string; count: number }[]; title: string; mode?: string }) => void;
}

export interface RollMode {
	key: string;
	label: string;
	title: string;
	edge: number;
	edgeReason?: string;
	/** A small mark beside the label ("▲"). */
	mark?: string;
}

const MAX_EDGE = 3;

export class RollDialog extends Modal {
	private edge: number;
	private bonus = 0;
	private use: Map<string, number>;
	private mode?: RollMode;

	constructor(app: App, private r: RollRequest) {
		super(app);
		this.mode = r.modes?.find(m => m.key === r.mode) ?? r.modes?.[0];
		this.edge = Math.max(-MAX_EDGE, Math.min(MAX_EDGE, this.mode?.edge ?? r.edge ?? 0));
		this.use = new Map((r.spendables ?? []).filter(x => x.on && x.available > 0).map(x => [x.key, spendCount(x)]));
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-roll-dialog');
		this.titleEl.setText(this.mode?.title ?? this.r.title);
		this.scope.register([], 'Enter', () => { this.roll(); return false; });
		this.render();
	}

	private render(): void {
		const c = this.contentEl;
		c.empty();
		// Check or Save (a stat): picking one sets the title and the advantage it starts with.
		if (this.r.modes?.length) {
			const seg = c.createDiv({ cls: 'rd-mode', attr: { role: 'radiogroup', 'aria-label': 'Kind of roll' } });
			for (const m of this.r.modes) {
				const on = m === this.mode;
				const b = seg.createEl('button', { cls: `rd-mode-btn${on ? ' is-on' : ''}`, attr: { role: 'radio', 'aria-checked': String(on) } });
				b.createSpan({ text: m.label });
				if (m.mark) triangleMark(b.createSpan({ cls: `rd-mode-mark ${m.edge > 0 ? 'is-adv' : m.edge < 0 ? 'is-dis' : ''}` }), m.edge < 0 ? 'down' : 'up');
				b.addEventListener('click', () => {
					this.mode = m;
					this.edge = m.edge;
					this.titleEl.setText(m.title);
					this.render();
				});
			}
		}
		const head = c.createDiv({ cls: 'rd-head' });
		head.createSpan({ cls: 'rd-expr', text: this.preview() });
		if (this.r.cost) head.createSpan({ cls: 'rd-cost', text: this.r.cost });

		// Advantage: one slider from Disadvantage 3 to Advantage 3.
		const adv = c.createDiv({ cls: `rd-edge ${this.edge > 0 ? 'is-adv' : this.edge < 0 ? 'is-dis' : ''}` });
		const top = adv.createDiv({ cls: 'rd-edge-top' });
		top.createSpan({ cls: 'rd-label', text: 'Advantage' });
		top.createSpan({ cls: 'rd-edge-value', text: edgeLabel(this.edge) });
		// A segmented control: Disadvantage 3 … Normal … Advantage 3. Arrow keys step through it.
		const seg = adv.createDiv({ cls: 'rd-seg', attr: { role: 'radiogroup', 'aria-label': 'Advantage or disadvantage' } });
		for (let v = -MAX_EDGE; v <= MAX_EDGE; v++) {
			const on = v === this.edge;
			const b = seg.createEl('button', {
				cls: `rd-seg-btn${on ? ' is-on' : ''}${v > 0 ? ' is-adv' : v < 0 ? ' is-dis' : ''}`,
				text: v === 0 ? '0' : v > 0 ? `+${v}` : `−${-v}`,
				attr: { role: 'radio', 'aria-checked': String(on), 'aria-label': edgeLabel(v), tabindex: on ? '0' : '-1' },
			});
			b.addEventListener('click', () => { this.edge = v; this.render(); });
		}
		seg.addEventListener('keydown', (e) => {
			const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
			if (!d) return;
			e.preventDefault();
			this.edge = Math.max(-MAX_EDGE, Math.min(MAX_EDGE, this.edge + d));
			this.render();
			this.contentEl.querySelector<HTMLElement>('.rd-seg-btn.is-on')?.focus();
		});
		// A fixed note for rolls without a Check/Save choice ("Opportunity Attacks have disadvantage"). With the
		// choice, Save and its ▲ / ▼ already say it, and a line that comes and goes would shift the dialog.
		if (!this.r.modes?.length && this.r.edgeReason) adv.createDiv({ cls: 'rd-reason', text: this.r.edgeReason });

		// Situational bonus.
		const mods = c.createDiv({ cls: 'rd-row' });
		mods.createSpan({ cls: 'rd-label', text: 'Modifier' });
		const step = mods.createDiv({ cls: 'rd-step' });
		const minus = step.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': 'Modifier −1' } });
		setIcon(minus, 'minus');
		step.createSpan({ cls: 'rd-step-value', text: this.bonus > 0 ? `+${this.bonus}` : this.bonus < 0 ? `−${-this.bonus}` : '0' });
		const plus = step.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': 'Modifier +1' } });
		setIcon(plus, 'plus');
		minus.addEventListener('click', () => { this.bonus--; this.render(); });
		plus.addEventListener('click', () => { this.bonus++; this.render(); });

		// Dice to spend on it.
		for (const sp of this.r.spendables ?? []) {
			if (sp.available <= 0) continue;
			const n = this.use.get(sp.key) ?? 0;
			const row = c.createDiv({ cls: `rd-row rd-spend${n ? ' is-on' : ''}` });
			const label = row.createDiv({ cls: 'rd-spend-label' });
			label.createSpan({ cls: 'rd-label', text: sp.label });
			const shown = sp.amount === 'any' ? sp.available : spendCount(sp);
			const have = [poolText(sp, shown), sp.damageType, sp.amount === 'all' && !sp.keep && sp.available > 1 ? 'all of them' : '', sp.keep ? 'kept' : '', sp.note].filter(Boolean).join(' · ');
			label.createSpan({ cls: 'rd-spend-have', text: have });
			const ctl = row.createDiv({ cls: 'rd-spend-ctl' });
			if (sp.amount === 'any') {
				const s2 = ctl.createDiv({ cls: 'rd-step' });
				const m2 = s2.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': `One fewer ${sp.label}` } });
				setIcon(m2, 'minus');
				s2.createSpan({ cls: 'rd-step-value', text: n ? `${n}d${sp.sides}` : '0' });
				const p2 = s2.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': `One more ${sp.label}` } });
				setIcon(p2, 'plus');
				m2.disabled = n <= 0;
				p2.disabled = n >= sp.available;
				m2.addEventListener('click', () => { this.use.set(sp.key, Math.max(0, n - 1)); this.render(); });
				p2.addEventListener('click', () => { this.use.set(sp.key, Math.min(sp.available, n + 1)); this.render(); });
			}
			const sw = ctl.createDiv({ cls: `checkbox-container${n ? ' is-enabled' : ''}`, attr: { role: 'switch', 'aria-checked': String(!!n), 'aria-label': `Add ${sp.label}`, tabindex: '0' } });
			const toggle = () => { this.use.set(sp.key, n ? 0 : spendCount(sp)); this.render(); };
			sw.addEventListener('click', toggle);
			sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
		}

		const foot = c.createDiv({ cls: 'modal-button-container' });
		foot.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		const go = foot.createEl('button', { cls: 'mod-cta rd-roll' });
		setIcon(go.createSpan(), 'dices');
		go.createSpan({ text: 'Roll' });
		go.addEventListener('click', () => this.roll());
	}

	/** "2d10 keep 1 + 3 + 2d6" for the header. */
	private preview(): string {
		const d = this.r.dice;
		const base = `${d.count + Math.abs(this.edge)}d${d.sides}${this.edge ? ` keep ${d.count} ${this.edge > 0 ? 'high' : 'low'}` : ''}`;
		const mod = d.modifier + this.bonus;
		const extras = (this.r.spendables ?? []).map(sp => ({ sp, n: this.use.get(sp.key) ?? 0 })).filter(x => x.n).map(x => {
			const f = (x.sp.faces ?? []).slice(0, x.n);
			const dice = f.length === x.n && f.every(v => v > 0) ? String(f.reduce((a, b) => a + b, 0)) : `${x.n}d${x.sp.sides}`;
			return ` + ${dice}${x.sp.damageType ? ` ${x.sp.damageType}` : ''}`;
		}).join('');
		return `${base}${mod > 0 ? ` + ${mod}` : mod < 0 ? ` − ${-mod}` : ''}${extras}`;
	}

	private roll(): void {
		const spent = (this.r.spendables ?? []).map(sp => ({ key: sp.key, count: this.use.get(sp.key) ?? 0, sp })).filter(x => x.count > 0);
		this.close();
		this.r.onRoll({
			edge: this.edge,
			bonus: this.bonus,
			extras: spent.map(x => ({ label: x.sp.label, count: x.count, sides: x.sp.sides, faces: x.sp.faces?.slice(0, x.count), damageType: x.sp.damageType, keep: x.sp.keep })),
			spent: spent.filter(x => !x.sp.keep).map(x => ({ key: x.key, count: x.count })),
			title: this.mode?.title ?? this.r.title,
			mode: this.mode?.key,
		});
	}

	onClose(): void { this.contentEl.empty(); }
}
