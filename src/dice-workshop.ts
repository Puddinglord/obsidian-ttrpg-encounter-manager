// The Dice Workshop: a modal for trying the 3D dice. Each test (crit, miss,
// max, min, or a pool of your own) sits next to the effect it plays, so you
// can pick an effect and see it at once. Effects, size and motion are saved;
// the look picker only tries a look until "Use for all dice". Dice roll above
// the modal. Nothing here is logged.

import { Modal, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { allStyles, DIE_KEYS, EFFECTS, EffectId, RollEvent } from './dice3d/styles';
import { onLongPress } from './touch';

const SIZES = [4, 6, 8, 10, 12, 20];
const MAX_POOL = 12;

type Test = RollEvent | 'pool';
const TESTS: { id: Test; label: string }[] = [
	{ id: 'crit', label: 'Crit' },
	{ id: 'miss', label: 'Miss' },
	{ id: 'max', label: 'Max' },
	{ id: 'min', label: 'Min' },
	{ id: 'pool', label: 'Pool' },
];

export class DiceWorkshopModal extends Modal {
	/** Look to try ('' = the dice as set up). */
	private style = '';
	private pool = new Map<number, number>([[6, 2], [20, 1]]);
	/** Die for crits and misses. */
	private primary = 4;
	private explosions = 2;
	private resultEl!: HTMLElement;

	constructor(private plugin: NimbleStatblocksPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-dice-workshop');
		this.titleEl.setText('Dice Workshop');
		this.draw();
	}

	onClose(): void { this.contentEl.empty(); }

	private get d() { return this.plugin.settings.dice; }

	private save(): void { void this.plugin.saveSettings(); }

	private poolList(): { sides: number; count: number }[] {
		return [...this.pool.entries()].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]).map(([sides, count]) => ({ sides, count }));
	}

	private poolText(): string {
		return this.poolList().map(p => `${p.count}d${p.sides}`).join(' + ');
	}

	private run(test: Test): void {
		const style = this.style || undefined;
		if (test === 'crit' || test === 'miss') {
			const r = this.plugin.workshopRoll({ style, test, sides: this.primary, explosions: this.explosions });
			this.resultEl.setText(test === 'crit' ? `Crit · d${this.primary} · ${r.values.join(', ')}` : `Miss · d${this.primary} · 1`);
			return;
		}
		const pool = this.poolList();
		if (!pool.length) { this.resultEl.setText('Add dice to the pool first.'); return; }
		const r = this.plugin.workshopRoll({ style, pool, test: test === 'pool' ? undefined : test });
		this.resultEl.setText(`${TESTS.find(t => t.id === test)?.label} · ${this.poolText()} · ${r.values.join(', ')}`);
	}

	private select(parent: HTMLElement, label: string, options: Record<string, string>, value: string, onChange: (v: string) => void, attr: Record<string, string> = {}): HTMLSelectElement {
		const sel = parent.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label, ...attr } });
		for (const [v, text] of Object.entries(options)) sel.createEl('option', { value: v, text });
		sel.value = value;
		sel.addEventListener('change', () => onChange(sel.value));
		return sel;
	}

	private field(parent: HTMLElement, label: string): HTMLElement {
		const f = parent.createDiv({ cls: 'nimble-workshop-field' });
		f.createSpan({ cls: 'nimble-workshop-label', text: label });
		return f;
	}

	private draw(): void {
		const c = this.contentEl;
		c.empty();

		// Look and primary die
		const top = c.createDiv({ cls: 'nimble-workshop-top' });
		const looks: Record<string, string> = { '': 'My dice' };
		for (const s of allStyles(this.d)) looks[s.id] = s.model ? `${s.name} (3D)` : s.name;
		const look = this.field(top, 'Look');
		this.select(look, 'Look', looks, this.style, v => { this.style = v; this.draw(); }, { 'data-field': 'look' });
		if (this.style) {
			const keep = look.createEl('button', { cls: 'nimble-workshop-keep', text: 'Use for all dice' });
			keep.addEventListener('click', () => {
				this.d.normal = this.style; this.d.primary = ''; this.d.crit = '';
				for (const k of DIE_KEYS) delete this.d.perDie[k];
				this.save();
				this.resultEl.setText('Every die uses this look now.');
			});
		}
		const prim = this.field(top, 'Primary die');
		this.select(prim, 'Primary die', Object.fromEntries(SIZES.map(s => [String(s), `d${s}`])), String(this.primary), v => { this.primary = Number(v); }, { 'data-field': 'primary' });
		this.select(prim, 'Explosions', Object.fromEntries([1, 2, 3, 4, 5].map(n => [String(n), `${n} explosion${n > 1 ? 's' : ''}`])), String(this.explosions), v => { this.explosions = Number(v); }, { 'data-field': 'explosions' });

		// Tests, each beside its effect
		const list = c.createDiv({ cls: 'nimble-workshop-tests' });
		const head = list.createDiv({ cls: 'nimble-workshop-row is-head' });
		head.createSpan({ text: 'Test' });
		head.createSpan({ text: 'Effect' });
		const effects = Object.fromEntries(EFFECTS.map(e => [e.id, e.label]));
		for (const t of TESTS) {
			const row = list.createDiv({ cls: `nimble-workshop-row is-${t.id}` });
			const go = row.createEl('button', { cls: `nimble-workshop-moment is-${t.id}`, attr: { 'data-event': t.id, 'aria-label': `Roll: ${t.label}` } });
			setIcon(go.createSpan({ cls: 'nimble-workshop-play' }), 'play');
			go.createSpan({ text: t.label });
			go.addEventListener('click', () => this.run(t.id));
			if (t.id === 'pool') { this.drawPool(row); continue; }
			const ev = t.id;
			this.select(row, `${t.label} effect`, effects, this.d.effects[ev], v => {
				this.d.effects[ev] = v as EffectId;
				this.save();
				this.run(ev); // see it straight away
			}, { 'data-event': ev });
		}

		// Size and motion
		const motion = c.createDiv({ cls: 'nimble-workshop-motion' });
		const slider = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) => {
			const f = this.field(motion, label);
			const input = f.createEl('input', { type: 'range', cls: 'slider', attr: { min: String(min), max: String(max), step: String(step), 'aria-label': label } });
			input.value = String(value);
			const out = f.createSpan({ cls: 'nimble-workshop-value' });
			const show = () => out.setText(label === 'Stay' ? `${input.value}s` : `${input.value}%`);
			show();
			input.addEventListener('input', show);
			input.addEventListener('change', () => { set(Number(input.value)); this.save(); });
		};
		slider('Size', 50, 300, 10, Math.round(this.d.size * 100), v => { this.d.size = v / 100; });
		slider('Speed', 50, 200, 10, Math.round(this.d.speed * 100), v => { this.d.speed = v / 100; });
		slider('Stay', 1, 8, 0.5, this.d.stayMs / 1000, v => { this.d.stayMs = v * 1000; });
		const throwF = this.field(motion, 'Throw');
		this.select(throwF, 'Throw', { gentle: 'Gentle', normal: 'Normal', strong: 'Hard' }, this.d.throwForce, v => { this.d.throwForce = v as 'gentle' | 'normal' | 'strong'; this.save(); });
		const shadowF = this.field(motion, 'Shadows');
		this.select(shadowF, 'Shadows', { off: 'Off', soft: 'Soft', sharp: 'Sharp' }, this.d.shadows, v => { this.d.shadows = v as 'off' | 'soft' | 'sharp'; this.save(); });

		this.resultEl = c.createDiv({ cls: 'nimble-workshop-result', attr: { 'aria-live': 'polite' } });
		if (!this.plugin.settings.dice3d) this.resultEl.setText('3D dice are off in settings.');
	}

	/** Dice chips: click adds one, right-click or long-press takes one away. */
	private drawPool(row: HTMLElement): void {
		const pool = row.createDiv({ cls: 'nimble-workshop-pool' });
		let total = 0;
		for (const n of this.pool.values()) total += n;
		for (const sides of SIZES) {
			const n = this.pool.get(sides) ?? 0;
			const chip = pool.createEl('button', { cls: `nimble-workshop-die${n ? ' has-dice' : ''}`, attr: { 'data-sides': String(sides), 'aria-label': `d${sides}: ${n} (click to add, right-click or long-press to remove)` } });
			chip.createSpan({ cls: 'nimble-workshop-die-name', text: `d${sides}` });
			if (n) chip.createSpan({ cls: 'nimble-workshop-die-count', text: String(n) });
			chip.addEventListener('click', () => { if (total < MAX_POOL) { this.pool.set(sides, n + 1); this.draw(); } });
			onLongPress(chip, () => { this.pool.set(sides, Math.max(0, n - 1)); this.draw(); });
		}
		const clear = pool.createEl('button', { cls: 'nimble-workshop-clear clickable-icon', attr: { 'aria-label': 'Clear the pool' } });
		setIcon(clear, 'x');
		clear.addEventListener('click', () => { this.pool.clear(); this.draw(); });
	}
}
