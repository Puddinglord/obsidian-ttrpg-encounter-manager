// The dice workshop: a modal for trying the 3D dice. Build a pool and throw
// it, stage a crit chain, a miss, a max or a min roll, swap looks, and pick
// the effect for each moment with an instant preview. Effects, size and
// motion changed here are saved to settings; the look picker only tries a
// look out unless you choose "Use for all dice". Dice roll above the modal.

import { Modal, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { showSliderValue } from './compat';
import { allStyles, DIE_KEYS, EFFECTS, EffectId, RollEvent } from './dice3d/styles';

const SIZES = [4, 6, 8, 10, 12, 20];

const MOMENTS: { event: RollEvent; label: string; desc: string }[] = [
	{ event: 'crit', label: 'Crit', desc: 'An attack die on max explodes into more dice.' },
	{ event: 'miss', label: 'Miss', desc: 'An attack die lands on 1.' },
	{ event: 'max', label: 'Max roll', desc: 'Every die on its highest face.' },
	{ event: 'min', label: 'Min roll', desc: 'Every die on a 1.' },
];

export class DiceWorkshopModal extends Modal {
	/** Look to try ('' = the dice as set up). */
	private style = '';
	private pool = new Map<number, number>([[20, 1]]);
	/** Die size for crits and misses. */
	private attackDie = 20;
	private explosions = 2;
	private resultEl!: HTMLElement;

	constructor(private plugin: NimbleStatblocksPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-dice-workshop');
		this.titleEl.setText('Dice workshop');
		this.draw();
	}

	onClose(): void { this.contentEl.empty(); }

	private get d() { return this.plugin.settings.dice; }

	private async save(): Promise<void> { await this.plugin.saveSettings(); }

	private show(text: string): void { this.resultEl.setText(text); }

	private poolText(): string {
		return [...this.pool.entries()].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]).map(([s, n]) => `${n}d${s}`).join(' + ') || 'No dice';
	}

	private rollPool(test?: RollEvent): void {
		const pool = [...this.pool.entries()].filter(([, n]) => n > 0).map(([sides, count]) => ({ sides, count }));
		if (!pool.length) { this.show('Add some dice first.'); return; }
		const r = this.plugin.workshopRoll({ style: this.style || undefined, pool, test });
		this.show(`${this.poolText()}: ${r.values.join(', ')}${test ? ` (${MOMENTS.find(m => m.event === test)?.label.toLowerCase()})` : ''}`);
	}

	private moment(event: RollEvent): void {
		if (event === 'crit' || event === 'miss') {
			const r = this.plugin.workshopRoll({ style: this.style || undefined, test: event, sides: this.attackDie, explosions: this.explosions });
			this.show(event === 'crit'
				? `Crit on a d${this.attackDie}: ${r.values.join(', ')} (${r.values.length - 1} explosion${r.values.length === 2 ? '' : 's'})`
				: `Miss on a d${this.attackDie}: 1`);
		} else this.rollPool(event);
	}

	private draw(): void {
		const c = this.contentEl;
		c.empty();
		c.createEl('p', { cls: 'setting-item-description', text: 'Try your dice. Rolls here are just for show: nothing is logged. Effects, size and motion you change here are saved.' });

		const body = c.createDiv({ cls: 'nimble-workshop-body' });
		const left = body.createDiv({ cls: 'nimble-workshop-col' });
		const right = body.createDiv({ cls: 'nimble-workshop-col' });

		// Look
		new Setting(left).setName('Look').setDesc('Try any look on every die, or keep your dice as set up.').addDropdown(dd => {
			dd.addOption('', 'My dice (as set up)');
			for (const s of allStyles(this.d)) dd.addOption(s.id, s.model ? `${s.name} (3D models)` : s.name);
			dd.setValue(this.style).onChange(v => { this.style = v; this.draw(); });
		});
		if (this.style) {
			new Setting(left).addButton(b => b.setButtonText('Use for all dice').onClick(async () => {
				this.d.normal = this.style; this.d.primary = ''; this.d.crit = '';
				for (const k of DIE_KEYS) delete this.d.perDie[k];
				await this.save();
				this.show('Saved: every die uses this look now.');
			}));
		}

		// Pool
		left.createDiv({ cls: 'nimble-workshop-heading', text: 'Roll a pool' });
		const pool = left.createDiv({ cls: 'nimble-workshop-pool' });
		for (const sides of SIZES) {
			const n = this.pool.get(sides) ?? 0;
			const cell = pool.createDiv({ cls: `nimble-workshop-die${n ? ' has-dice' : ''}`, attr: { 'data-sides': String(sides) } });
			const add = cell.createEl('button', { cls: 'nimble-workshop-die-add', attr: { 'aria-label': `Add a d${sides}` } });
			add.createSpan({ cls: 'nimble-workshop-die-name', text: `d${sides}` });
			if (n) add.createSpan({ cls: 'nimble-workshop-die-count', text: `×${n}` });
			add.addEventListener('click', () => { if (this.total() < 12) this.pool.set(sides, n + 1); this.draw(); });
			const minus = cell.createEl('button', { cls: 'nimble-workshop-die-minus', text: '−', attr: { 'aria-label': `Remove a d${sides}` } });
			minus.disabled = !n;
			minus.addEventListener('click', () => { this.pool.set(sides, Math.max(0, n - 1)); this.draw(); });
		}
		new Setting(left).setName(this.poolText()).setDesc('Up to 12 dice.')
			.addButton(b => b.setButtonText('Clear').onClick(() => { this.pool.clear(); this.draw(); }))
			.addButton(b => b.setButtonText('Roll').setCta().onClick(() => this.rollPool()));

		// Moments
		left.createDiv({ cls: 'nimble-workshop-heading', text: 'Test a moment' });
		new Setting(left).setName('Attack die').setDesc('The die crits and misses use.')
			.addDropdown(dd => { for (const s of SIZES) dd.addOption(String(s), `d${s}`); dd.setValue(String(this.attackDie)).onChange(v => { this.attackDie = Number(v); }); })
			.addDropdown(dd => { for (let i = 1; i <= 5; i++) dd.addOption(String(i), `${i} explosion${i > 1 ? 's' : ''}`); dd.setValue(String(this.explosions)).onChange(v => { this.explosions = Number(v); }); });
		const moments = left.createDiv({ cls: 'nimble-workshop-moments' });
		for (const m of MOMENTS) {
			const b = moments.createEl('button', { cls: `nimble-workshop-moment is-${m.event}`, attr: { 'data-event': m.event, 'aria-label': m.desc } });
			b.createSpan({ cls: 'nimble-workshop-moment-label', text: m.label });
			b.createSpan({ cls: 'nimble-workshop-moment-desc', text: m.desc });
			b.addEventListener('click', () => this.moment(m.event));
		}

		// Effects
		right.createDiv({ cls: 'nimble-workshop-heading', text: 'Effects' });
		for (const m of MOMENTS) {
			new Setting(right).setName(m.label).setClass('nimble-workshop-effect')
				.addDropdown(dd => {
					for (const e of EFFECTS) dd.addOption(e.id, e.label);
					dd.selectEl.setAttr('data-event', m.event);
					dd.setValue(this.d.effects[m.event]).onChange(async v => {
						this.d.effects[m.event] = v as EffectId;
						await this.save();
						this.moment(m.event); // see it straight away
					});
				})
				.addExtraButton(b => b.setIcon('play').setTooltip(`Preview the ${m.label.toLowerCase()} effect`).onClick(() => this.moment(m.event)));
		}

		// Motion
		right.createDiv({ cls: 'nimble-workshop-heading', text: 'Size and motion' });
		new Setting(right).setName('Dice size').addSlider(sl => showSliderValue(sl.setLimits(50, 300, 10).setValue(Math.round(this.d.size * 100))).onChange(async v => { this.d.size = v / 100; await this.save(); }));
		new Setting(right).setName('Speed').addSlider(sl => showSliderValue(sl.setLimits(50, 200, 10).setValue(Math.round(this.d.speed * 100))).onChange(async v => { this.d.speed = v / 100; await this.save(); }));
		new Setting(right).setName('Throw').addDropdown(dd => dd.addOptions({ gentle: 'Gentle', normal: 'Normal', strong: 'Hard' }).setValue(this.d.throwForce)
			.onChange(async v => { this.d.throwForce = v as 'gentle' | 'normal' | 'strong'; await this.save(); }));
		new Setting(right).setName('Shadows').addDropdown(dd => dd.addOptions({ off: 'Off', soft: 'Soft', sharp: 'Sharp' }).setValue(this.d.shadows)
			.onChange(async v => { this.d.shadows = v as 'off' | 'soft' | 'sharp'; await this.save(); }));
		new Setting(right).setName('Stay on screen').addSlider(sl => showSliderValue(sl.setLimits(1, 8, 0.5).setValue(this.d.stayMs / 1000)).onChange(async v => { this.d.stayMs = v * 1000; await this.save(); }));

		this.resultEl = c.createDiv({ cls: 'nimble-workshop-result', attr: { 'aria-live': 'polite' } });
		if (!this.plugin.settings.dice3d) this.show('3D dice are off in settings, so nothing will appear on screen.');
	}

	private total(): number {
		let n = 0;
		for (const v of this.pool.values()) n += v;
		return n;
	}
}
