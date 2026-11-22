// The roll dialog: before an attack, a spell, a save or a check, set how much
// advantage or disadvantage you have (−3 to +3), any situational bonus (+/−),
// and whether to spend dice like Judgment Dice on it. Then roll. Drawn as a
// game dialog (core/dialog.ts) in Nimble's look: the dice on a screen, labels
// over their controls, Cancel | Roll as the keypad's footer.

import { App, Modal, setIcon } from 'obsidian';
import type { DiceExpression } from '../../core/dice';
import { edgeLabel, ExtraDice, poolText, Spendable, spendCount } from './roll-def';
import { triangleMark } from '../../core/die-shape';
import { dialogFoot, dialogLabel, gameDialog } from '../../core/dialog';
import { damageIcon, evIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { slideThumb } from '../../core/segmented';

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
		gameDialog(this, 'nimble', { cls: 'nimble-roll-dialog', compact: true });
		this.titleEl.setText(this.mode?.title ?? this.r.title);
		this.scope.register([], 'Enter', () => { this.roll(); return false; });
		this.render();
	}

	/** Draw it. `prevEdge` and `prevMode` are where the thumbs were, so they slide from there. */
	private render(prevEdge?: number, prevMode?: number): void {
		const c = this.contentEl;
		c.empty();
		// Check or Save (a stat): picking one sets the title and the advantage it starts with. Two halves, 50/50.
		const modes = this.r.modes ?? [];
		if (modes.length) {
			const seg = c.createDiv({ cls: 'rd-mode', attr: { role: 'radiogroup', 'aria-label': 'Kind of roll' } });
			for (const m of modes) {
				const on = m === this.mode;
				const b = seg.createEl('button', { cls: `rd-mode-btn${on ? ' is-on' : ''}`, attr: { role: 'radio', 'aria-checked': String(on) } });
				b.createSpan({ cls: 'rd-mode-text', text: m.label });
				if (m.mark) triangleMark(b.createSpan({ cls: `rd-mode-mark ${m.edge > 0 ? 'is-adv' : m.edge < 0 ? 'is-dis' : ''}` }), m.edge < 0 ? 'down' : 'up');
				b.addEventListener('click', () => {
					if (m === this.mode) return;
					const from = this.mode ? modes.indexOf(this.mode) : 0;
					const edgeFrom = this.edge;
					this.mode = m;
					this.edge = m.edge;
					this.titleEl.setText(m.title);
					this.render(edgeFrom, from);
				});
			}
			slideThumb(seg, Math.max(0, this.mode ? modes.indexOf(this.mode) : 0), modes.length, prevMode);
		}

		// The screen: the dice as they'll be rolled, and what the roll costs.
		const head = c.createDiv({ cls: 'rd-head' });
		head.createSpan({ cls: 'rd-expr', text: this.preview() });
		if (this.r.cost) pill(head, { cls: 'rd-cost', text: this.r.cost });

		// Advantage: one control from Disadvantage 3 to Advantage 3, its value beside its label.
		const adv = c.createDiv({ cls: `rd-edge ${this.edge > 0 ? 'is-adv' : this.edge < 0 ? 'is-dis' : ''}` });
		dialogLabel(adv, 'Advantage', edgeLabel(this.edge), 'rd-edge-value');
		const seg = adv.createDiv({ cls: 'rd-seg', attr: { role: 'radiogroup', 'aria-label': 'Advantage or disadvantage' } });
		for (let v = -MAX_EDGE; v <= MAX_EDGE; v++) {
			const on = v === this.edge;
			const b = seg.createEl('button', {
				cls: `rd-seg-btn${on ? ' is-on' : ''}${v > 0 ? ' is-adv' : v < 0 ? ' is-dis' : ''}`,
				text: v === 0 ? '0' : v > 0 ? `+${v}` : `−${-v}`,
				attr: { role: 'radio', 'aria-checked': String(on), 'aria-label': edgeLabel(v), tabindex: on ? '0' : '-1' },
			});
			b.addEventListener('click', () => { const from = this.edge; this.edge = v; this.render(from); });
		}
		slideThumb(seg, this.edge + MAX_EDGE, MAX_EDGE * 2 + 1, prevEdge !== undefined ? prevEdge + MAX_EDGE : undefined);
		seg.addEventListener('keydown', (e) => {
			const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
			if (!d) return;
			e.preventDefault();
			const from = this.edge;
			this.edge = Math.max(-MAX_EDGE, Math.min(MAX_EDGE, this.edge + d));
			this.render(from);
			this.contentEl.querySelector<HTMLElement>('.rd-seg-btn.is-on')?.focus();
		});
		// A fixed note for rolls without a Check/Save choice ("Opportunity Attacks have disadvantage"). With the
		// choice, Save and its ▲ / ▼ already say it, and a line that comes and goes would shift the dialog.
		if (!modes.length && this.r.edgeReason) adv.createDiv({ cls: 'rd-reason', text: this.r.edgeReason });

		// Situational bonus: a label over its stepper.
		const mods = c.createDiv({ cls: 'rd-mod' });
		dialogLabel(mods, 'Modifier');
		this.stepper(mods, this.bonus > 0 ? `+${this.bonus}` : this.bonus < 0 ? `−${-this.bonus}` : '0', 'Modifier', () => { this.bonus--; this.render(); }, () => { this.bonus++; this.render(); });

		// Dice to spend on it: each pool a tile you tap to put it in (a full outline and a tick when it's in).
		for (const sp of this.r.spendables ?? []) {
			if (sp.available <= 0) continue;
			const n = this.use.get(sp.key) ?? 0;
			const row = c.createDiv({ cls: `rd-spend${n ? ' is-on' : ''}`, attr: { role: 'switch', 'aria-checked': String(!!n), 'aria-label': `Add ${sp.label}`, tabindex: '0' } });
			const check = row.createSpan({ cls: 'rd-spend-check', attr: { 'aria-hidden': 'true' } });
			setIcon(check, evIcon('check'));
			const label = row.createDiv({ cls: 'rd-spend-label' });
			const name = label.createDiv({ cls: 'rd-spend-name' });
			name.createSpan({ cls: 'rd-spend-title', text: sp.label });
			const dmg = damageIcon(sp.damageType);
			if (dmg) setIcon(name.createSpan({ cls: 'rd-spend-dmg', attr: { 'aria-label': dmg.label } }), dmg.icon);
			const shown = sp.amount === 'any' ? sp.available : spendCount(sp);
			const have = [poolText(sp, shown), sp.damageType, sp.amount === 'all' && !sp.keep && sp.available > 1 ? 'all of them' : '', sp.keep ? 'kept' : '', sp.note].filter(Boolean).join(' · ');
			label.createSpan({ cls: 'rd-spend-have', text: have });
			if (sp.amount === 'any') {
				const s2 = this.stepper(row, n ? `${n}d${sp.sides}` : '0', sp.label, () => { this.use.set(sp.key, Math.max(0, n - 1)); this.render(); }, () => { this.use.set(sp.key, Math.min(sp.available, n + 1)); this.render(); });
				s2.minus.disabled = n <= 0;
				s2.plus.disabled = n >= sp.available;
				s2.el.addEventListener('click', (e) => e.stopPropagation());
			}
			const toggle = () => { this.use.set(sp.key, n ? 0 : spendCount(sp)); this.render(); };
			row.addEventListener('click', toggle);
			row.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggle(); } });
		}

		// Roll: a d20 on the button for a d20 roll (the dice themselves are on the screen above).
		dialogFoot(c, { cancel: () => this.close(), main: { text: 'Roll', icon: evIcon(this.r.dice.sides === 20 ? 'd20' : 'dice'), cls: 'rd-roll', onClick: () => this.roll() } });
	}

	/** − value +, the keypad's keys. */
	private stepper(parent: HTMLElement, value: string, what: string, down: () => void, up: () => void): { el: HTMLElement; minus: HTMLButtonElement; plus: HTMLButtonElement } {
		const el = parent.createDiv({ cls: 'rd-step' });
		const minus = el.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': `${what} −1` } });
		setIcon(minus, evIcon('minus'));
		el.createSpan({ cls: 'rd-step-value', text: value });
		const plus = el.createEl('button', { cls: 'rd-step-btn', attr: { 'aria-label': `${what} +1` } });
		setIcon(plus, evIcon('plus'));
		minus.addEventListener('click', down);
		plus.addEventListener('click', up);
		return { el, minus, plus };
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
