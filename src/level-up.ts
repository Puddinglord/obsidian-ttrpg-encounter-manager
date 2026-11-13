// The level-up wizard: a carousel of steps, one decision per screen, with
// every choice kept as you move back and forth. What the steps are comes from
// the compendium (level-plan.ts): hit points always, a subclass when it's time,
// option picks, stat increases, an Epic Boon, the skill point, then a review.
// Nothing is written to the note until the review's button is pressed.

import { Menu, Modal, Notice, setIcon } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { nameKey, ResolvedFeature, StatKey, Subclass } from './compendium';
import { bundledCompendium } from './compendium-data';
import { renderRulesText, renderSource } from './compendium-card';
import { addFeature, CharacterSheet, fmtMod, Frontmatter, hpAverage, levelUp, setSkill, setStat } from './character-def';
import { LevelPlan, levelPlan, OptionPick, subclassTimeline } from './level-plan';
import { isTouch } from './touch';
import { accentPalette, confettiBurst } from './celebrate';

type StepKind = 'overview' | 'hp' | 'subclass' | 'pick' | 'stats' | 'boon' | 'skill' | 'review';
interface Step { kind: StepKind; label: string; icon: string; pick?: number }

interface Draft {
	/** HP gained, once decided. */
	gain: number | null;
	how: 'roll' | 'average' | 'manual' | null;
	rolled: number[];
	manual: string;
	subclass: string;
	/** Chosen option names, by index into plan.picks. */
	picks: string[][];
	/** Chosen stats, by index into plan.stats. */
	stats: StatKey[][];
	boon: string;
	/** Skill point changes: +1 for the new point (or two on one skill), −1 on a skill a point was moved from. */
	skills: Record<string, number>;
}

/** Make the subclass name readable as a title: "Path of the Red Mist" → small "Path of the", big "Red Mist". */
function splitTitle(name: string): { lead: string; main: string } {
	const m = name.match(/^((?:path|circle|way|oath|school|college|invoker|order|keeper|herald|luminary|domain)\s+of(?:\s+the)?)\s+(.+)$/i);
	return m ? { lead: m[1], main: m[2] } : { lead: '', main: name };
}

export class LevelUpWizard extends Modal {
	private plan: LevelPlan;
	private steps: Step[] = [];
	private at = 0;
	private draft: Draft;
	private track!: HTMLElement;
	private viewport!: HTMLElement;
	private dots!: HTMLElement;
	private back!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private counter!: HTMLElement;
	private panels: HTMLElement[] = [];
	private subclassView: 'cards' | 'compare' = 'cards';
	private comp = bundledCompendium();

	constructor(
		private plugin: NimbleStatblocksPlugin,
		private s: CharacterSheet,
		private mutate: (fn: (fm: Frontmatter, s: CharacterSheet) => void) => Promise<void>,
	) {
		super(plugin.app);
		const next = s.level + 1;
		this.plan = levelPlan(this.comp, { className: s.className, subclass: s.subclass, level: next, hitDie: s.hitDie, average: hpAverage(s.hitDie, this.comp) });
		this.draft = { gain: null, how: null, rolled: [], manual: '', subclass: '', picks: this.plan.picks.map(() => []), stats: this.plan.stats.map(() => []), boon: '', skills: {} };
	}

	private get nextLevel(): number { return this.s.level + 1; }

	onOpen(): void {
		this.modalEl.addClass('nimble-levelup');
		this.titleEl.empty();
		this.buildSteps();
		const head = this.contentEl.createDiv({ cls: 'lu-head' });
		const badge = head.createDiv({ cls: 'lu-badge', attr: { 'aria-hidden': 'true' } });
		badge.createSpan({ cls: 'lu-badge-from', text: String(this.s.level) });
		setIcon(badge.createSpan({ cls: 'lu-badge-arrow' }), 'chevron-right');
		badge.createSpan({ cls: 'lu-badge-to', text: String(this.nextLevel) });
		const titles = head.createDiv({ cls: 'lu-titles' });
		titles.createDiv({ cls: 'lu-title', text: `${this.s.name} reaches level ${this.nextLevel}` });
		titles.createDiv({ cls: 'lu-sub', text: [this.s.className, this.s.subclass || this.draft.subclass].filter(Boolean).join(' · ') || 'Level up' });
		this.dots = this.contentEl.createDiv({ cls: 'lu-dots', attr: { role: 'tablist', 'aria-label': 'Steps' } });

		this.viewport = this.contentEl.createDiv({ cls: 'lu-viewport' });
		this.track = this.viewport.createDiv({ cls: 'lu-track' });
		this.panels = this.steps.map(() => this.track.createDiv({ cls: 'lu-panel' }));
		this.steps.forEach((_, i) => this.renderPanel(i));

		const foot = this.contentEl.createDiv({ cls: 'lu-foot' });
		this.back = foot.createEl('button', { cls: 'lu-back' });
		this.counter = foot.createDiv({ cls: 'lu-counter' });
		this.nextBtn = foot.createEl('button', { cls: 'mod-cta lu-next' });
		this.back.addEventListener('click', () => (this.at === 0 ? this.close() : this.go(this.at - 1)));
		this.nextBtn.addEventListener('click', () => (this.steps[this.at].kind === 'review' ? void this.apply() : this.go(this.at + 1)));

		// Arrow keys move between steps (not while typing); a sideways swipe does on touch screens.
		this.scope.register([], 'ArrowRight', (e) => { if (this.typing(e)) return true; this.go(this.at + 1); return false; });
		this.scope.register([], 'ArrowLeft', (e) => { if (this.typing(e)) return true; this.go(this.at - 1); return false; });
		let x0: number | null = null;
		let y0 = 0;
		this.viewport.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
		this.viewport.addEventListener('touchend', (e) => {
			if (x0 === null) return;
			const dx = e.changedTouches[0].clientX - x0;
			const dy = e.changedTouches[0].clientY - y0;
			x0 = null;
			// Not inside the compare table, which scrolls sideways itself.
			if ((e.target as HTMLElement | null)?.closest('.lu-compare')) return;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) this.go(this.at + (dx < 0 ? 1 : -1));
		});
		this.go(0, false);
		// The Hit Die roll is a step or two away: get the 3D dice ready so it animates from the first frame.
		this.plugin.warmDice([this.plan.hitDie, this.plan.hitDie]);
	}

	private typing(e: KeyboardEvent): boolean {
		const t = e.target as HTMLElement | null;
		return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
	}

	private buildSteps(): void {
		const p = this.plan;
		const steps: Step[] = [{ kind: 'overview', label: 'Overview', icon: 'sparkles' }, { kind: 'hp', label: 'Hit points', icon: 'heart' }];
		if (p.subclasses.length) steps.push({ kind: 'subclass', label: 'Subclass', icon: 'git-fork' });
		p.picks.forEach((pick, i) => steps.push({ kind: 'pick', label: pick.group.name, icon: 'list-checks', pick: i }));
		if (p.stats.length) steps.push({ kind: 'stats', label: 'Stats', icon: 'trending-up' });
		if (p.boons.length) steps.push({ kind: 'boon', label: 'Epic Boon', icon: 'gem' });
		steps.push({ kind: 'skill', label: 'Skills', icon: 'target' });
		steps.push({ kind: 'review', label: 'Review', icon: 'check-check' });
		this.steps = steps;
	}

	// ------------------------------------------------------------------------
	// Moving between steps

	private go(i: number, animate = true): void {
		if (i < 0 || i >= this.steps.length) return;
		// Hit points have to be settled before going past them.
		const hpAt = this.steps.findIndex(s => s.kind === 'hp');
		if (i > hpAt && this.draft.gain === null && this.at <= hpAt) { i = hpAt; this.flash(hpAt); }
		this.at = i;
		this.track.toggleClass('no-anim', !animate);
		this.track.setCssProps({ '--lu-at': String(i) });
		this.panels.forEach((p, k) => { p.toggleClass('is-active', k === i); if (k === i) p.removeAttribute('inert'); else p.setAttr('inert', ''); });
		// The viewport takes the height of the step on show, so short steps don't leave a gap.
		if (this.steps[i].kind === 'review') this.renderPanel(i);
		this.renderChrome();
	}

	private flash(i: number): void {
		const p = this.panels[i];
		p.removeClass('is-shake');
		void p.offsetWidth;
		p.addClass('is-shake');
	}

	private renderChrome(): void {
		this.dots.empty();
		this.steps.forEach((st, i) => {
			const d = this.dots.createEl('button', { cls: `lu-dot${i === this.at ? ' is-active' : ''}${this.done(i) ? ' is-done' : ''}`, attr: { role: 'tab', 'aria-selected': String(i === this.at), 'aria-label': st.label } });
			setIcon(d.createSpan({ cls: 'lu-dot-icon' }), this.done(i) && i !== this.at ? 'check' : st.icon);
			d.createSpan({ cls: 'lu-dot-label', text: st.label });
			d.addEventListener('click', () => this.go(i));
		});
		this.dots.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
		// On the first step, Back is Cancel and closes the wizard.
		this.back.empty();
		if (this.at === 0) this.back.createSpan({ text: 'Cancel' });
		else { setIcon(this.back.createSpan(), 'chevron-left'); this.back.createSpan({ text: 'Back' }); }
		this.counter.setText(`${this.at + 1} of ${this.steps.length}`);
		const st = this.steps[this.at];
		const after = this.steps[this.at + 1];
		this.nextBtn.empty();
		if (st.kind === 'review') {
			setIcon(this.nextBtn.createSpan(), 'trophy');
			this.nextBtn.createSpan({ text: `Reach level ${this.nextLevel}` });
		} else {
			this.nextBtn.createSpan({ text: after ? `Next: ${after.label}` : 'Next' });
			setIcon(this.nextBtn.createSpan(), 'chevron-right');
		}
		this.nextBtn.disabled = st.kind === 'hp' && this.draft.gain === null;
	}

	private done(i: number): boolean {
		const st = this.steps[i];
		const d = this.draft;
		switch (st.kind) {
			case 'hp': return d.gain !== null;
			case 'subclass': return !!d.subclass;
			case 'pick': return (d.picks[st.pick ?? 0]?.length ?? 0) >= (this.plan.picks[st.pick ?? 0]?.count ?? 1);
			case 'stats': return this.plan.stats.every((inc, k) => d.stats[k].length >= inc.count);
			case 'boon': return !!d.boon;
			case 'skill': return this.skillBudget() === 0;
			default: return i < this.at;
		}
	}

	/** Redraw one step, keeping its scroll position, and the chrome around it. */
	private refresh(i: number): void {
		const panel = this.panels[i];
		// Each step scrolls on its own; a redraw keeps its place.
		const top = panel.scrollTop;
		this.renderPanel(i);
		panel.scrollTop = top;
		this.renderChrome();
	}

	private renderPanel(i: number): void {
		const panel = this.panels[i];
		panel.empty();
		const st = this.steps[i];
		switch (st.kind) {
			case 'overview': this.renderOverview(panel); break;
			case 'hp': this.renderHp(panel, i); break;
			case 'subclass': this.renderSubclass(panel, i); break;
			case 'pick': this.renderPick(panel, i, this.plan.picks[st.pick ?? 0], st.pick ?? 0); break;
			case 'stats': this.renderStats(panel, i); break;
			case 'boon': this.renderBoon(panel, i); break;
			case 'skill': this.renderSkill(panel, i); break;
			case 'review': this.renderReview(panel); break;
		}
	}

	/** The step's title, and a counter pill ("0 / 1") when the step has a number to reach. */
	private stepHead(panel: HTMLElement, title: string, count?: { have: number; need: number }): HTMLElement {
		const h = panel.createDiv({ cls: 'lu-step-head' });
		h.createDiv({ cls: 'lu-step-title', text: title });
		if (count) h.createDiv({ cls: `lu-count${count.have >= count.need ? ' is-done' : ''}`, text: `${count.have} / ${count.need}` });
		return h;
	}

	// ------------------------------------------------------------------------
	// Steps

	private renderOverview(panel: HTMLElement): void {
		const p = this.plan;
		this.stepHead(panel, `Level ${this.nextLevel}`);
		const gains = panel.createDiv({ cls: 'lu-gains' });
		const gain = (icon: string, text: string, tone = '') => {
			const g = gains.createDiv({ cls: `lu-gain ${tone}` });
			setIcon(g.createSpan({ cls: 'lu-gain-icon' }), icon);
			g.createSpan({ text });
		};
		gain('heart', `More HP (d${p.hitDie})`, 'is-hp');
		gain('dice-5', '+1 Hit Die');
		if (p.subclasses.length) gain('git-fork', 'Choose your subclass', 'is-big');
		for (const pick of p.picks) gain('list-checks', `${pick.group.name} ×${pick.count}`);
		for (const inc of p.stats) gain('trending-up', inc.count > 1 ? `+1 to ${inc.count} stats` : `+1 ${inc.options.join(' or ')}`);
		if (p.boons.length) gain('gem', 'An Epic Boon', 'is-big');
		gain('target', 'Skill point');
		const feats = this.featuresNow();
		if (!feats.length) {
			panel.createDiv({ cls: 'lu-empty', text: this.s.cls ? 'No new class features are listed for this level.' : 'Pick a class on the sheet to see what each level brings.' });
			return;
		}
		panel.createDiv({ cls: 'lu-section-label', text: 'New features' });
		const list = panel.createDiv({ cls: 'lu-features' });
		for (const f of feats) this.featureCard(list, f);
	}

	/** Features at the new level, including the chosen subclass's. */
	private featuresNow(): ResolvedFeature[] {
		return this.comp.featuresAt(this.s.className, this.s.subclass || this.draft.subclass, this.nextLevel)
			.filter(f => !(f.from === 'class' && /^subclass$/i.test(f.name.trim())));
	}

	private featureCard(parent: HTMLElement, f: { name: string; text: string; from?: string }): void {
		const card = parent.createDiv({ cls: `lu-feature${f.from === 'subclass' ? ' is-subclass' : ''}` });
		const top = card.createDiv({ cls: 'lu-feature-top' });
		top.createSpan({ cls: 'lu-feature-name', text: f.name });
		if (f.from === 'subclass') top.createSpan({ cls: 'lu-tag', text: 'Subclass' });
		renderRulesText(card.createDiv({ cls: 'lu-feature-text' }), f.text);
	}

	private renderHp(panel: HTMLElement, i: number): void {
		const s = this.s;
		const p = this.plan;
		const d = this.draft;
		this.stepHead(panel, 'Hit points');
		const opts = panel.createDiv({ cls: 'lu-hp-options' });
		const card = (how: Draft['how'], icon: string, title: string) => {
			const c = opts.createDiv({ cls: `lu-hp-option${d.how === how ? ' is-picked' : ''}`, attr: { role: 'button', tabindex: '0' } });
			setIcon(c.createDiv({ cls: 'lu-hp-icon' }), icon);
			c.createDiv({ cls: 'lu-hp-title', text: title });
			return c;
		};

		// Roll ▲
		const roll = card('roll', 'dices', `Roll d${p.hitDie} ▲`);
		if (d.how === 'roll' && d.rolled.length) {
			const dice = roll.createDiv({ cls: 'lu-dice' });
			const kept = Math.max(...d.rolled);
			let keptShown = false;
			for (const v of d.rolled) {
				const isKept = v === kept && !keptShown;
				if (isKept) keptShown = true;
				dice.createSpan({ cls: `lu-die${isKept ? ' is-kept' : ''}`, text: String(v) });
			}
			roll.createDiv({ cls: 'lu-hp-value', text: `+${kept}` });
			// A roll can be taken back: roll again, or clear it.
			const more = roll.createEl('button', { cls: 'clickable-icon lu-hp-more', attr: { 'aria-label': 'Roll options' } });
			setIcon(more, 'more-horizontal');
			more.addEventListener('click', (e) => {
				e.stopPropagation();
				const m = new Menu();
				m.addItem(it => it.setTitle('Roll again').setIcon('dices').onClick(() => { d.rolled = []; d.how = null; d.gain = null; doRoll(); }));
				m.addItem(it => it.setTitle('Clear roll').setIcon('rotate-ccw').onClick(() => { d.rolled = []; d.how = null; d.gain = null; this.refresh(i); }));
				const r = more.getBoundingClientRect();
				m.showAtPosition({ x: r.right, y: r.bottom });
			});
		} else {
			// Before rolling: two blank dice, which is what ▲ (advantage) means.
			const dice = roll.createDiv({ cls: 'lu-dice is-blank' });
			dice.createSpan({ cls: 'lu-die', text: `d${p.hitDie}` });
			dice.createSpan({ cls: 'lu-die', text: `d${p.hitDie}` });
		}
		const doRoll = () => {
			if (d.how === 'roll' && d.rolled.length) { d.gain = Math.max(...d.rolled); this.refresh(i); return; } // one roll per level
			const r = this.plugin.rollWithAdvantage(p.hitDie, `${s.name} · Level ${this.nextLevel} HP`);
			d.rolled = r.rolls;
			d.how = 'roll';
			d.gain = r.kept;
			this.refresh(i);
		};

		// Average
		const avg = card('average', 'scale', 'Take the average');
		avg.createDiv({ cls: 'lu-hp-value', text: `+${p.average}` });
		const doAvg = () => { d.how = 'average'; d.gain = p.average; this.refresh(i); };

		// Manual
		const man = card('manual', 'pencil', 'I rolled it');
		const input = man.createEl('input', { type: 'number', cls: 'lu-hp-input', attr: { min: '1', max: String(p.hitDie), inputmode: 'numeric', placeholder: `1–${p.hitDie}`, 'aria-label': 'Your roll' } });
		input.value = d.manual;
		const takeManual = () => {
			const n = Math.floor(Number(input.value));
			d.manual = input.value;
			if (Number.isFinite(n) && n >= 1 && n <= p.hitDie) { d.how = 'manual'; d.gain = n; }
			else if (d.how === 'manual') { d.gain = null; }
			man.toggleClass('is-invalid', !!input.value && !(n >= 1 && n <= p.hitDie));
			opts.querySelectorAll('.lu-hp-option').forEach(o => o.toggleClass('is-picked', o === man && d.how === 'manual'));
			this.drawHpResult(result);
			this.renderChrome();
		};
		input.addEventListener('input', takeManual);
		input.addEventListener('click', (e) => e.stopPropagation());
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && d.gain !== null) this.go(this.at + 1); });

		const wire = (el: HTMLElement, fn: () => void) => {
			el.addEventListener('click', fn);
			el.addEventListener('keydown', (e) => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); } });
		};
		wire(roll, doRoll);
		wire(avg, doAvg);
		wire(man, () => { input.focus(); if (input.value) takeManual(); });

		const result = panel.createDiv({ cls: 'lu-hp-result' });
		this.drawHpResult(result);
	}

	private drawHpResult(el: HTMLElement): void {
		el.empty();
		const s = this.s;
		const g = this.draft.gain;
		el.toggleClass('is-set', g !== null);
		el.createDiv({ cls: 'lu-hp-result-label', text: 'Max HP' });
		const nums = el.createDiv({ cls: 'lu-hp-result-nums' });
		nums.createSpan({ cls: 'lu-hp-old', text: String(s.hpMax) });
		setIcon(nums.createSpan({ cls: 'lu-hp-arrow' }), 'arrow-right');
		nums.createSpan({ cls: `lu-hp-new${g === null ? ' is-pending' : ''}`, text: g === null ? '—' : String(s.hpMax + g) });
		const bar = el.createDiv({ cls: 'lu-hp-bar' });
		const total = s.hpMax + (g ?? 0);
		bar.createDiv({ cls: 'lu-hp-bar-old' }).setCssProps({ '--w': `${(s.hpMax / Math.max(1, total)) * 100}%` });
		bar.createDiv({ cls: 'lu-hp-bar-new' }).setCssProps({ '--w': `${((g ?? 0) / Math.max(1, total)) * 100}%` });
	}

	private renderSubclass(panel: HTMLElement, i: number): void {
		const subs = this.plan.subclasses;
		const head = this.stepHead(panel, 'Choose your subclass');
		const seg = head.createDiv({ cls: 'nimble-segmented lu-view-toggle', attr: { role: 'radiogroup', 'aria-label': 'View' } });
		for (const [v, label, icon] of [['cards', 'One at a time', 'square'], ['compare', 'Compare', 'columns-3']] as const) {
			const b = seg.createEl('button', { cls: this.subclassView === v ? 'is-active' : '', attr: { role: 'radio', 'aria-checked': String(this.subclassView === v) } });
			setIcon(b.createSpan(), icon);
			b.createSpan({ text: label });
			b.addEventListener('click', () => { this.subclassView = v; this.refresh(i); });
		}
		const hue = (k: number) => String((k * 360) / Math.max(1, subs.length) + 15);
		const pick = (sc: Subclass) => {
			this.draft.subclass = this.draft.subclass === sc.name ? '' : sc.name;
			this.refresh(i);
			this.renderPanel(0); // the overview lists the subclass's features too
		};
		if (this.subclassView === 'compare') { this.renderCompare(panel, subs, pick); return; }

		// Pills pick which subclass is on show; the one on show fills the rest of the step.
		if (this.viewSub < 0) this.viewSub = Math.max(0, subs.findIndex(sc => sc.name === this.draft.subclass));
		const tabs = panel.createDiv({ cls: 'lu-sub-tabs', attr: { role: 'tablist', 'aria-label': 'Subclasses' } });
		subs.forEach((sc, k) => {
			const on = k === this.viewSub;
			const tab = tabs.createEl('button', { cls: `lu-sub-tab${on ? ' is-active' : ''}${this.draft.subclass === sc.name ? ' is-chosen' : ''}`, attr: { role: 'tab', 'aria-selected': String(on) } });
			tab.setCssProps({ '--lu-hue': hue(k) });
			tab.createSpan({ cls: 'lu-sub-tab-dot' });
			tab.createSpan({ text: splitTitle(sc.name).main });
			if (this.draft.subclass === sc.name) setIcon(tab.createSpan({ cls: 'lu-sub-tab-check' }), 'check');
			tab.addEventListener('click', () => { this.viewSub = k; this.refresh(i); });
		});

		const sc = subs[this.viewSub] ?? subs[0];
		const chosen = this.draft.subclass === sc.name;
		const view = panel.createDiv({ cls: `lu-sub-view${chosen ? ' is-chosen' : ''}` });
		view.setCssProps({ '--lu-hue': hue(this.viewSub) });
		const band = view.createDiv({ cls: 'lu-sub-band' });
		const titles = band.createDiv({ cls: 'lu-sub-titles' });
		const t = splitTitle(sc.name);
		if (t.lead) titles.createDiv({ cls: 'lu-sub-lead', text: t.lead });
		titles.createDiv({ cls: 'lu-sub-name', text: t.main });
		const meta = titles.createDiv({ cls: 'lu-sub-meta' });
		if (sc.story) meta.createSpan({ cls: 'lu-tag is-story', text: 'Story-based' });
		if (sc.draft) meta.createSpan({ cls: 'lu-tag', text: 'Draft' });
		if (sc.complexity) {
			const cx = meta.createSpan({ cls: 'lu-complexity', attr: { 'aria-label': `Complexity ${sc.complexity} of 4` } });
			cx.createSpan({ cls: 'lu-complexity-label', text: 'Complexity' });
			for (let n = 1; n <= 4; n++) cx.createSpan({ cls: `lu-pip${n <= (sc.complexity ?? 0) ? ' is-on' : ''}` });
		}
		const choose = band.createEl('button', { cls: `lu-sub-band-choose${chosen ? ' is-chosen' : ''}`, attr: { 'aria-pressed': String(chosen) } });
		setIcon(choose.createSpan(), chosen ? 'check' : 'plus');
		choose.createSpan({ text: chosen ? 'Chosen' : `Choose ${t.main}` });
		choose.addEventListener('click', () => pick(sc));
		if (sc.flavor) band.createDiv({ cls: 'lu-sub-flavor', text: sc.flavor });

		const body = view.createDiv({ cls: 'lu-sub-body' });
		if (sc.intro) renderRulesText(body.createDiv({ cls: 'lu-sub-intro' }), sc.intro);
		// Every level's features, open, one full-width card per level: wide lines, little scrolling.
		const grid = body.createDiv({ cls: 'lu-sub-levels' });
		for (const lv of subclassTimeline(sc)) {
			const now = lv.level === this.nextLevel;
			const block = grid.createDiv({ cls: `lu-sub-level${now ? ' is-now' : ''}` });
			const lh = block.createDiv({ cls: 'lu-sub-level-head' });
			lh.createSpan({ cls: 'lu-tag lu-level-pill', text: `Level ${lv.level}` });
			if (now) lh.createSpan({ cls: 'lu-tag lu-now-pill', text: 'Now' });
			for (const f of lv.features) {
				const fe = block.createDiv({ cls: 'lu-sub-feat' });
				fe.createDiv({ cls: 'lu-feature-name', text: f.name });
				renderRulesText(fe.createDiv({ cls: 'lu-feature-text' }), f.text);
			}
		}
		if (!grid.childElementCount) grid.remove();
		renderSource(body, sc);
	}

	/** Which subclass is on show in the one-at-a-time view (-1: not yet decided). */
	private viewSub = -1;

	/** Every subclass side by side, level by level. */
	private renderCompare(panel: HTMLElement, subs: Subclass[], pick: (sc: Subclass) => void): void {
		const wrap = panel.createDiv({ cls: 'lu-compare' });
		const table = wrap.createEl('table');
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { cls: 'lu-compare-corner', text: 'Level' });
		subs.forEach((sc, k) => {
			const th = head.createEl('th');
			th.setCssProps({ '--lu-hue': String((k * 360) / Math.max(1, subs.length) + 15) });
			const t = splitTitle(sc.name);
			th.createDiv({ cls: 'lu-compare-name', text: t.main });
			if (sc.complexity) {
				const cx = th.createDiv({ cls: 'lu-complexity' });
				for (let n = 1; n <= 4; n++) cx.createSpan({ cls: `lu-pip${n <= sc.complexity ? ' is-on' : ''}` });
			}
			const b = th.createEl('button', { cls: this.draft.subclass === sc.name ? 'mod-cta' : '', text: this.draft.subclass === sc.name ? 'Chosen' : 'Choose' });
			b.addEventListener('click', () => pick(sc));
		});
		const levels = [...new Set(subs.flatMap(sc => subclassTimeline(sc).map(l => l.level)))].sort((a, b) => a - b);
		const body = table.createEl('tbody');
		for (const lv of levels) {
			const tr = body.createEl('tr', { cls: lv === this.nextLevel ? 'is-now' : '' });
			tr.createEl('th', { cls: 'lu-compare-level', text: String(lv) });
			for (const sc of subs) {
				const td = tr.createEl('td', { cls: this.draft.subclass === sc.name ? 'is-chosen' : '' });
				for (const f of subclassTimeline(sc).find(l => l.level === lv)?.features ?? []) {
					const fe = td.createDiv({ cls: 'lu-sub-feat' });
					fe.createDiv({ cls: 'lu-feature-name', text: f.name });
					renderRulesText(fe.createDiv({ cls: 'lu-feature-text' }), f.text);
				}
			}
		}
	}

	private renderPick(panel: HTMLElement, i: number, pick: OptionPick, k: number): void {
		const chosen = this.draft.picks[k];
		const known = new Set(this.s.features.map(f => nameKey(f.name)));
		// Picks made on other steps from the same list count as known here.
		this.draft.picks.forEach((list, j) => { if (j !== k && this.plan.picks[j].group.name === pick.group.name) list.forEach(n => known.add(nameKey(n))); });
		this.stepHead(panel, pick.group.name, { have: chosen.length, need: pick.count });
		if (pick.group.intro) renderRulesText(panel.createDiv({ cls: 'lu-intro' }), pick.group.intro);
		const grid = panel.createDiv({ cls: 'lu-options' });
		for (const o of pick.group.options ?? []) this.optionCard(grid, o, {
			taken: known.has(nameKey(o.name)),
			chosen: chosen.includes(o.name),
			full: chosen.length >= pick.count,
			toggle: () => {
				const at = chosen.indexOf(o.name);
				if (at >= 0) chosen.splice(at, 1);
				else { if (chosen.length >= pick.count) chosen.shift(); chosen.push(o.name); }
				this.refresh(i);
			},
		});
	}

	private optionCard(grid: HTMLElement, o: { name: string; text?: string; cost?: string; requirement?: string }, st: { taken: boolean; chosen: boolean; full: boolean; toggle: () => void }): void {
		const card = grid.createDiv({ cls: `lu-option${st.chosen ? ' is-chosen' : ''}${st.taken ? ' is-taken' : ''}${st.full && !st.chosen ? ' is-dim' : ''}`, attr: { role: 'button', tabindex: st.taken ? '-1' : '0', 'aria-pressed': String(st.chosen) } });
		const top = card.createDiv({ cls: 'lu-option-top' });
		top.createDiv({ cls: 'lu-option-name', text: o.name });
		if (st.taken) top.createSpan({ cls: 'lu-tag', text: 'Known' });
		else if (o.cost) top.createSpan({ cls: 'lu-tag', text: o.cost });
		if (st.chosen) setIcon(top.createSpan({ cls: 'lu-option-check' }), 'check');
		if (o.requirement) card.createDiv({ cls: 'lu-option-req', text: o.requirement });
		renderRulesText(card.createDiv({ cls: 'lu-option-text' }), o.text ?? '');
		if (st.taken) return;
		card.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) return; st.toggle(); });
		card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.toggle(); } });
	}

	private renderStats(panel: HTMLElement, i: number): void {
		this.stepHead(panel, 'Stat increases');
		this.plan.stats.forEach((inc, k) => {
			const chosen = this.draft.stats[k];
			const box = panel.createDiv({ cls: 'lu-stat-box' });
			const label = box.createDiv({ cls: 'lu-section-label lu-stat-label' });
			label.createSpan({ text: inc.feature });
			label.createSpan({ cls: `lu-count${chosen.length >= inc.count ? ' is-done' : ''}`, text: `${chosen.length} / ${inc.count}` });
			const row = box.createDiv({ cls: 'lu-stats' });
			for (const key of inc.options) {
				const on = chosen.includes(key);
				const cur = this.s.stats[key];
				const b = row.createEl('button', { cls: `lu-stat${on ? ' is-chosen' : ''}`, attr: { 'aria-pressed': String(on) } });
				b.createDiv({ cls: 'lu-stat-key', text: key });
				const nums = b.createDiv({ cls: 'lu-stat-nums' });
				nums.createSpan({ cls: 'lu-stat-old', text: fmtMod(cur) });
				setIcon(nums.createSpan({ cls: 'lu-stat-arrow' }), 'arrow-right');
				nums.createSpan({ cls: 'lu-stat-new', text: fmtMod(cur + 1) });
				b.addEventListener('click', () => {
					const at = chosen.indexOf(key);
					if (at >= 0) chosen.splice(at, 1);
					else { if (chosen.length >= inc.count) chosen.shift(); chosen.push(key); }
					this.refresh(i);
				});
			}
		});
	}

	private renderBoon(panel: HTMLElement, i: number): void {
		this.stepHead(panel, 'Epic Boon', { have: this.draft.boon ? 1 : 0, need: 1 });
		const known = new Set(this.s.features.map(f => nameKey(f.name)));
		const grid = panel.createDiv({ cls: 'lu-options' });
		for (const b of this.plan.boons) this.optionCard(grid, { name: b.name, text: b.text, requirement: b.requirement }, {
			taken: known.has(nameKey(b.name)),
			chosen: this.draft.boon === b.name,
			full: !!this.draft.boon,
			toggle: () => { this.draft.boon = this.draft.boon === b.name ? '' : b.name; this.refresh(i); },
		});
	}

	/** Points still to place: the level's new one, plus any moved off another skill, minus those placed. */
	private skillBudget(): number {
		const v = Object.values(this.draft.skills);
		return 1 + v.filter(n => n < 0).reduce((a, n) => a - n, 0) - v.filter(n => n > 0).reduce((a, n) => a + n, 0);
	}

	private renderSkill(panel: HTMLElement, i: number): void {
		const d = this.draft;
		const moved = Object.values(d.skills).some(n => n < 0);
		const budget = this.skillBudget();
		// Two counters say it all: points to place (+), and the one move a level allows (−, then +).
		const status = this.stepHead(panel, 'Skills');
		const pts = status.createDiv({ cls: `lu-skill-budget${budget > 0 ? ' is-open' : ''}`, attr: { 'aria-label': `${budget} to place` } });
		setIcon(pts.createSpan(), 'plus');
		pts.createSpan({ cls: 'lu-skill-budget-n', text: String(budget) });
		pts.createSpan({ text: 'to place' });
		const mv = status.createDiv({ cls: `lu-skill-move${moved ? ' is-used' : ''}`, attr: { 'aria-label': moved ? 'Move used' : '1 move left' } });
		setIcon(mv.createSpan(), 'arrow-left-right');
		mv.createSpan({ cls: 'lu-skill-budget-n', text: moved ? '0' : '1' });
		mv.createSpan({ text: moved ? 'moves left' : 'move left' });
		if (Object.keys(d.skills).length) {
			const reset = status.createEl('button', { cls: 'lu-skill-reset' });
			setIcon(reset.createSpan(), 'rotate-ccw');
			reset.createSpan({ text: 'Reset' });
			reset.addEventListener('click', () => { d.skills = {}; this.refresh(i); });
		}

		const list = panel.createDiv({ cls: 'lu-skill-list' });
		for (const sk of this.s.skills) {
			const delta = d.skills[sk.key] ?? 0;
			const row = list.createDiv({ cls: `lu-skill-row${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}` });
			const label = row.createDiv({ cls: 'lu-skill-label' });
			label.createSpan({ cls: 'lu-skill-stat', text: sk.stat });
			label.createSpan({ cls: 'lu-skill-name', text: sk.name });
			const nums = row.createDiv({ cls: 'lu-stat-nums' });
			nums.createSpan({ cls: 'lu-stat-old', text: fmtMod(sk.total) });
			if (delta) {
				setIcon(nums.createSpan({ cls: 'lu-stat-arrow' }), 'arrow-right');
				nums.createSpan({ cls: 'lu-stat-new', text: fmtMod(sk.total + delta) });
			}
			const step = row.createDiv({ cls: 'lu-skill-step' });
			// − takes back a placed point, or moves one off this skill (once, and only from points you put there).
			const canMinus = delta > 0 || (delta === 0 && !moved && sk.points > 0);
			const minus = step.createEl('button', { cls: 'lu-step-btn', attr: { 'aria-label': delta > 0 ? `Take the point back from ${sk.name}` : `Move a point off ${sk.name}` } });
			setIcon(minus, 'minus');
			minus.disabled = !canMinus;
			if (!canMinus && delta === 0 && sk.points <= 0) minus.setAttr('title', 'No points of yours on this skill to move');
			step.createSpan({ cls: 'lu-skill-delta', text: delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '' });
			const plus = step.createEl('button', { cls: 'lu-step-btn is-plus', attr: { 'aria-label': `Put a point in ${sk.name}` } });
			setIcon(plus, 'plus');
			// + puts back a point you moved off this skill, or places one you have to spare.
			plus.disabled = !(delta < 0 || budget > 0);
			const set = (n: number) => { if (n) d.skills[sk.key] = n; else delete d.skills[sk.key]; this.refresh(i); };
			minus.addEventListener('click', () => set(delta - 1));
			plus.addEventListener('click', () => set(delta + 1));
		}
	}

	/** "Might +1, Stealth +1, Lore −1" for the review. */
	private skillSummary(): string {
		return Object.entries(this.draft.skills).map(([k, n]) => {
			const sk = this.s.skills.find(x => x.key === k);
			return sk ? `${sk.name} ${fmtMod(sk.total)} → ${fmtMod(sk.total + n)}` : '';
		}).filter(Boolean).join(', ');
	}

	private renderReview(panel: HTMLElement): void {
		const d = this.draft;
		const s = this.s;
		this.stepHead(panel, 'Review');
		const list = panel.createDiv({ cls: 'lu-review' });
		const line = (icon: string, label: string, value: string, kind: StepKind, pickIndex?: number, missing = false) => {
			const r = list.createEl('button', { cls: `lu-review-row${missing ? ' is-missing' : ''}` });
			setIcon(r.createSpan({ cls: 'lu-review-icon' }), icon);
			r.createSpan({ cls: 'lu-review-label', text: label });
			r.createSpan({ cls: 'lu-review-value', text: value });
			setIcon(r.createSpan({ cls: 'lu-review-go' }), 'chevron-right');
			r.addEventListener('click', () => this.go(this.steps.findIndex(st => st.kind === kind && (pickIndex === undefined || st.pick === pickIndex))));
		};
		line('heart', 'Max HP', d.gain === null ? 'Not set' : `${s.hpMax} → ${s.hpMax + d.gain} (+${d.gain}, ${d.how === 'roll' ? 'rolled' : d.how === 'average' ? 'average' : 'your roll'})`, 'hp', undefined, d.gain === null);
		line('dice-5', 'Hit Dice', `${s.hitDiceMax} → ${s.hitDiceMax + 1} d${s.hitDie}`, 'overview');
		if (this.plan.subclasses.length) line('git-fork', 'Subclass', d.subclass || 'Choose later', 'subclass', undefined, !d.subclass);
		this.plan.picks.forEach((p, k) => line('list-checks', p.group.name, d.picks[k].length ? d.picks[k].join(', ') : 'Choose later', 'pick', k, d.picks[k].length < p.count));
		this.plan.stats.forEach((inc, k) => line('trending-up', inc.feature, d.stats[k].length ? d.stats[k].map(x => `${x} ${fmtMod(s.stats[x])} → ${fmtMod(s.stats[x] + 1)}`).join(', ') : 'Not chosen', 'stats', undefined, d.stats[k].length < inc.count));
		if (this.plan.boons.length) line('gem', 'Epic Boon', d.boon || 'Choose later', 'boon', undefined, !d.boon);
		const budget = this.skillBudget();
		line('target', 'Skills', this.skillSummary() || 'Not placed', 'skill', undefined, budget !== 0);
		// Features that were a step of their own (a pick, a stat increase) are in the list above already.
		const stepped = new Set([...this.plan.picks.map(p => p.feature), ...this.plan.stats.map(x => x.feature)]);
		const feats = this.featuresNow().filter(f => !stepped.has(f.name));
		if (feats.length) {
			panel.createDiv({ cls: 'lu-section-label', text: 'You also gain' });
			const list = panel.createDiv({ cls: 'lu-features' });
			for (const f of feats) this.featureCard(list, f);
		}
	}

	// ------------------------------------------------------------------------

	private async apply(): Promise<void> {
		const d = this.draft;
		if (d.gain === null) { this.go(this.steps.findIndex(st => st.kind === 'hp')); return; }
		const gain = d.gain;
		const boon = this.plan.boons.find(b => b.name === d.boon);
		await this.mutate((fm, cur) => {
			levelUp(fm, cur, gain);
			for (const [k, n] of Object.entries(d.skills)) {
				const sk = cur.skills.find(x => x.key === k);
				if (sk) setSkill(fm, k, sk.points + n);
			}
			if (d.subclass) fm.subclass = d.subclass;
			for (const list of d.picks) for (const name of list) addFeature(fm, name);
			if (boon) addFeature(fm, { name: boon.name, text: boon.text });
			for (const list of d.stats) for (const k of list) setStat(fm, k, cur.stats[k] + 1);
		});
		this.celebrate();
	}

	/** A moment of glory: the level bubble pops in, and a burst of confetti in the accent colour comes out from behind it. */
	private celebrate(): void {
		const d = this.draft;
		this.contentEl.empty();
		this.modalEl.addClass('is-celebrating');
		const done = this.contentEl.createDiv({ cls: 'lu-celebrate' });
		const canvas = done.createEl('canvas', { cls: 'lu-confetti', attr: { 'aria-hidden': 'true' } });
		const inner = done.createDiv({ cls: 'lu-celebrate-inner' });
		const bubble = inner.createDiv({ cls: 'lu-celebrate-level', text: String(this.nextLevel) });
		inner.createDiv({ cls: 'lu-celebrate-text', text: `${this.s.name} is now level ${this.nextLevel}!` });
		const gains = inner.createDiv({ cls: 'lu-celebrate-gains' });
		const chip = (icon: string, text: string) => { const c = gains.createDiv({ cls: 'lu-celebrate-chip' }); setIcon(c.createSpan(), icon); c.createSpan({ text }); };
		if (d.gain !== null) chip('heart', `+${d.gain} HP`);
		if (d.subclass) chip('git-fork', d.subclass);
		for (const list of d.picks) for (const n of list) chip('sparkles', n);
		for (const list of d.stats) for (const k of list) chip('trending-up', `+1 ${k}`);
		if (d.boon) chip('gem', d.boon);
		if (!gains.childElementCount) gains.remove();
		const ok = inner.createEl('button', { cls: 'mod-cta lu-celebrate-ok', text: 'Back to the sheet' });
		ok.addEventListener('click', () => this.close());
		if (!isTouch()) window.setTimeout(() => ok.focus(), 0);
		// The bubble grows to its peak (see lu-pop in styles.css), then the confetti bursts from behind it.
		window.requestAnimationFrame(() => {
			const box = canvas.getBoundingClientRect();
			const b = bubble.getBoundingClientRect();
			this.stopShow = confettiBurst(canvas, accentPalette(done), { x: b.left + b.width / 2 - box.left, y: b.top + b.height / 2 - box.top, delayMs: 420 });
		});
		new Notice(`${this.s.name} is now level ${this.nextLevel}.`);
	}

	private stopShow: (() => void) | null = null;

	onClose(): void {
		this.stopShow?.();
		this.contentEl.empty();
	}
}

