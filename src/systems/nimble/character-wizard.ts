// Nimble's character wizard: New character and Level up, one carousel of steps
// with a decision on each, in the sheet's look (a game dialog on Nimble's paper,
// Vollkorn names, the sheet's stat boxes and save triangles, Phosphor icons).
//
// New character (Core Rules 3.3, Character Creation): who they are, then the
// stat array placed by tapping two stats to swap them (the class's key stats
// take the highest numbers; its ▲ and ▼ saves show on the boxes), then, for a
// hero who starts above level 1, the same steps as levelling up for each level.
// Level up: what the level brings, Hit points, the subclass, the class's picks,
// spells, stat increases, an Epic Boon, skill points, then a review.
//
// What each level asks for comes from level-plan.ts (pure, tested); nothing is
// written until the last step's button: new-character.ts makes the note,
// applyLevelChoices writes a level up.

import { Menu, Modal, Notice, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { Compendium, nameKey, ResolvedFeature, STATS, StatKey, Subclass } from './compendium';
import { heroCompendium } from './compendium-data';
import { renderRulesText, renderSource } from './compendium-card';
import {
	assignStats, CharacterSheet, fmtMod, Frontmatter, isPlacementOf, keyStatsOf, keyStatsShort, levelOneFrontmatter, NewCharacterOptions,
	readCharacter, sizesOf, startingGold, statArray, statArrays, swapStats,
} from './character-def';
import {
	applyLevelChoices, gainedLevels, increaseKey, LevelChoices, LevelPlan, levelPlans, noChoices, PickGroup, pickGroups,
	RepeatableOption, skillPointsFor, SpellSlot, spellSlots, subclassTimeline, utilitySpells,
} from './level-plan';
import { heroPlans, NewHero } from './new-character';
import { createCharacterNote, defaultCharacterFolder } from './character-modals';
import { plainMod, saveTriangle } from './sheet-marks';
import { dialogFoot, dialogLabel, gameDialog } from '../../core/dialog';
import { damageIcon, evIcon, EvIconName } from '../../core/icons';
import { pill, setPill } from '../../core/pill';
import { cluster } from '../../core/cluster';
import { slideThumb } from '../../core/segmented';
import { drawSvg } from '../../core/svg';
import { dieShape } from '../../core/die-shape';
import { isTouch } from '../../core/touch';
import { rollDie } from '../../core/dice';
import { accentPalette, confettiBurst } from '../../core/celebrate';

type StepKind = 'hero' | 'stats' | 'overview' | 'hp' | 'subclass' | 'pick' | 'spells' | 'increase' | 'boon' | 'skill' | 'review';
interface Step { kind: StepKind; label: string; icon: EvIconName; group?: string }

const STAT_NAME: Record<StatKey, string> = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence', WIL: 'Will' };
const HEROIC_MAX = 4;

/** A subclass's name as a title: "Path of the Red Mist" → small "Path of the", big "Red Mist" (any "X of (the)" lead). */
function splitTitle(name: string): { lead: string; main: string } {
	const m = name.match(/^(\S+\s+of(?:\s+the)?)\s+(.+)$/i);
	return m ? { lead: m[1], main: m[2] } : { lead: '', main: name };
}

/** A spell school's icon: its damage type's (Ice is cold), Wind its own. */
function schoolIcon(school: string): string {
	if (/wind/i.test(school)) return evIcon('wind');
	return damageIcon(/ice/i.test(school) ? 'cold' : school)?.icon ?? evIcon('spell');
}

interface HpDraft { how: 'roll' | 'average' | 'manual' | null; rolls: number[][]; manual: string }

interface LevelTarget { s: CharacterSheet; fm: Frontmatter; mutate: (fn: (fm: Frontmatter, s: CharacterSheet) => void) => Promise<void> }
interface NewTarget { folder?: string; onCreated?: (f: TFile) => void }

/** The wizard for both: `level` levels a sheet up by one, `hero` makes a new one. */
class CharacterWizard extends Modal {
	protected comp: Compendium;
	protected hero: NewHero = { name: '', array: 'Standard', mine: true };
	/** Heroic Skills (Core Rules 3.3, optional): extra skill points at level 1. */
	protected heroic = 0;
	/** The stat tapped first, waiting for the one to swap with. */
	private picked: StatKey | null = null;
	/** The two stats that just swapped, to animate. */
	private swapped: StatKey[] = [];
	private plans: LevelPlan[] = [];
	private groups: PickGroup[] = [];
	private slots: SpellSlot[] = [];
	private granted: string[] = [];
	private hp: HpDraft = { how: null, rolls: [], manual: '' };
	private choices: LevelChoices = noChoices();
	private steps: Step[] = [];
	private at = 0;
	private seen = new Set<string>();
	private panels: HTMLElement[] = [];
	private subclassView: 'cards' | 'compare' = 'cards';
	private viewSub = -1;
	private dots!: HTMLElement;
	private viewport!: HTMLElement;
	private track!: HTMLElement;
	private backBtn!: HTMLElement;
	private nextBtn!: HTMLButtonElement;
	private sub!: HTMLElement;
	private stopShow: (() => void) | null = null;

	/**
	 * `comp` is everything a hero can be made of (classes, subclasses, ancestries, backgrounds, option lists, spells,
	 * rules), looked up once through heroCompendium: the bundled books today, homebrew and imports as they come.
	 */
	constructor(protected plugin: EmberVaultPlugin, protected level: LevelTarget | null, protected make: NewTarget | null, initial: Partial<NewCharacterOptions> = {}, comp?: Compendium) {
		super(plugin.app);
		Object.assign(this.hero, initial);
		this.comp = comp ?? heroCompendium({ path: make?.folder, className: level?.s.className });
		this.replan();
		// A hero made above level 1 takes the flat HP bonus unless the player rolls.
		if (!level) this.hp.how = 'average';
	}

	// ------------------------------------------------------------------------
	// What the run of levels asks for

	private get isNew(): boolean { return !this.level; }
	private get cls() { return this.comp.classByName(this.isNew ? this.hero.className : this.level?.s.className); }
	private get nextLevel(): number { return (this.level?.s.level ?? 0) + 1; }
	private get gained(): LevelPlan[] { return gainedLevels(this.plans); }

	/** The note before this run: the sheet's, or the new hero at level 1. */
	private baseFm(): Frontmatter {
		return this.level ? structuredClone(this.level.fm) : levelOneFrontmatter({ ...this.hero, stats: this.placement() }, this.comp);
	}

	private baseSheet(): CharacterSheet {
		return this.level ? this.level.s : readCharacter(this.baseFm(), this.comp, this.hero.name || 'New hero');
	}

	/** The hero as they'll be, with everything chosen so far but the skill points. */
	private previewSheet(): CharacterSheet {
		const fm = this.baseFm();
		applyLevelChoices(fm, this.comp, this.plans, { ...this.choices, hp: this.gains(), skills: {} });
		return readCharacter(fm, this.comp, this.level?.s.name ?? (this.hero.name || 'New hero'));
	}

	private replan(): void {
		if (this.isNew) {
			this.plans = heroPlans(this.hero, this.comp, this.choices.subclass);
		} else {
			const s = this.level!.s;
			this.plans = levelPlans(this.comp, { className: s.className, subclass: s.subclass, from: s.level + 1, to: s.level + 1, hitDie: s.hitDie, chosen: this.choices.subclass });
		}
		this.groups = pickGroups(this.plans);
		const sp = spellSlots(this.comp, this.plans, this.baseSheet().schools, this.choices);
		this.slots = sp.slots;
		this.granted = sp.granted;
		this.prune();
	}

	/** Drop choices the run no longer asks for (another class, a lower level, another subclass). */
	private prune(): void {
		const c = this.choices;
		if (c.subclass && !this.plans.some(p => p.subclasses.some(sc => sc.name === c.subclass))) c.subclass = undefined;
		for (const k of Object.keys(c.picks)) {
			const g = this.groups.find(x => x.name === k);
			if (!g) delete c.picks[k];
			else c.picks[k] = c.picks[k].filter(n => g.group.options.some(o => o.name === n)).slice(0, g.count);
		}
		const incs = new Set(this.plans.flatMap(p => p.stats.map(inc => increaseKey(p.level, inc))));
		for (const k of Object.keys(c.stats)) if (!incs.has(k)) delete c.stats[k];
		for (const k of Object.keys(c.spells)) {
			const slot = this.slots.find(x => x.key === k);
			if (!slot) delete c.spells[k];
			else c.spells[k] = c.spells[k].filter(n => slot.options.includes(n)).slice(0, slot.count);
		}
		if (c.boon && !this.plans.some(p => p.boons.some(b => b.name === c.boon))) c.boon = undefined;
		if (this.hp.how === 'roll' && this.hp.rolls.length !== this.gained.length) this.hp = { how: this.isNew ? 'average' : null, rolls: [], manual: '' };
		if (this.skillBudget() < 0) c.skills = {};
	}

	/** HP gained at each level, once decided (null: not yet). */
	private gains(): number[] {
		const n = this.gained.length;
		if (this.hp.how === 'roll' && this.hp.rolls.length === n) return this.hp.rolls.map(r => Math.max(...r));
		if (this.hp.how === 'average') return this.gained.map(p => p.average);
		if (this.hp.how === 'manual') {
			const total = this.manualTotal();
			if (total !== null) return [total, ...Array<number>(Math.max(0, n - 1)).fill(0)];
		}
		return [];
	}

	private gain(): number | null {
		if (!this.gained.length) return 0;
		const g = this.gains();
		return g.length === this.gained.length ? g.reduce((a, b) => a + b, 0) : null;
	}

	private manualTotal(): number | null {
		const n = this.gained.length;
		const die = this.gained[0]?.hitDie ?? 8;
		const v = Math.floor(Number(this.hp.manual));
		return this.hp.manual.trim() !== '' && Number.isFinite(v) && v >= n && v <= n * die ? v : null;
	}

	/** Where the array's numbers are: the player's swaps, or the class's suggestion. */
	private placement(): Record<StatKey, number> {
		const values = statArray(this.comp, this.hero.array).values;
		return isPlacementOf(this.hero.stats, values) ? { ...this.hero.stats } : assignStats(values, this.comp.classByName(this.hero.className));
	}

	/** Skill points still to place: the run's (and Heroic Skills'), plus any moved off a skill, minus those placed. */
	private skillBudget(): number {
		const v = Object.values(this.choices.skills);
		return skillPointsFor(this.plans, this.isNew ? this.heroic : 0) + v.filter(n => n < 0).reduce((a, n) => a - n, 0) - v.filter(n => n > 0).reduce((a, n) => a + n, 0);
	}

	/** Points moved off a skill: one a level gained, when levelling up (a new hero has nothing to move). */
	private movesLeft(): number {
		if (this.isNew) return 0;
		const moved = Object.values(this.choices.skills).filter(n => n < 0).reduce((a, n) => a - n, 0);
		return Math.max(0, this.gained.length - moved);
	}

	// ------------------------------------------------------------------------
	// The frame

	onOpen(): void {
		gameDialog(this, 'nimble', { cls: `nimble-wizard ${this.isNew ? 'nimble-newchar-modal' : 'nimble-levelup'}` });
		this.titleEl.setText(this.isNew ? (this.hero.mine === false ? 'New party member' : 'New character') : `${this.level!.s.name} reaches level ${this.nextLevel}`);
		const c = this.contentEl;
		this.sub = c.createDiv({ cls: 'lu-sub' });
		this.dots = c.createDiv({ cls: 'lu-dots', attr: { role: 'tablist' } });
		this.viewport = c.createDiv({ cls: 'lu-viewport' });
		this.track = this.viewport.createDiv({ cls: 'lu-track' });
		const foot = dialogFoot(c, {
			cancel: () => (this.at === 0 ? this.close() : this.go(this.at - 1)),
			main: { text: 'Next', cls: 'lu-next', onClick: () => (this.steps[this.at]?.kind === 'review' ? void this.finish() : this.go(this.at + 1)) },
		});
		this.nextBtn = foot.main;
		this.backBtn = foot.foot.querySelector<HTMLElement>('.is-cancel') ?? foot.main;
		this.backBtn.addClass('lu-back');

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
			// Not inside something that scrolls sideways itself (the compare table, the step chips), nor the stats.
			if ((e.target as HTMLElement | null)?.closest('.lu-compare, .lu-place-row')) return;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) this.go(this.at + (dx < 0 ? 1 : -1));
		});
		this.rebuild();
		this.go(0, false);
		if (this.isNew && !isTouch()) window.setTimeout(() => this.panels[0]?.querySelector<HTMLInputElement>('input.lu-name-input')?.focus(), 0);
		const die = this.gained[0]?.hitDie;
		if (die) this.plugin.warmDice([die, die]);
	}

	private typing(e: KeyboardEvent): boolean {
		const t = e.target as HTMLElement | null;
		return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
	}

	private buildSteps(): Step[] {
		const steps: Step[] = [];
		if (this.isNew) {
			steps.push({ kind: 'hero', label: 'Hero', icon: 'user' }, { kind: 'stats', label: 'Stats', icon: 'chart' });
		} else steps.push({ kind: 'overview', label: 'Overview', icon: 'sparkle' });
		if (this.gained.length) steps.push({ kind: 'hp', label: 'Hit points', icon: 'heart' });
		if (this.plans.some(p => p.subclasses.length)) steps.push({ kind: 'subclass', label: 'Subclass', icon: 'path' });
		for (const g of this.groups) steps.push({ kind: 'pick', label: g.name, icon: 'list', group: g.name });
		if (this.slots.length) steps.push({ kind: 'spells', label: 'Spells', icon: 'spell' });
		if (this.plans.some(p => p.stats.length)) steps.push({ kind: 'increase', label: 'Increases', icon: 'trend-up' });
		if (this.plans.some(p => p.boons.length)) steps.push({ kind: 'boon', label: 'Epic Boon', icon: 'gem' });
		steps.push({ kind: 'skill', label: 'Skills', icon: 'target' });
		steps.push({ kind: 'review', label: 'Review', icon: 'check-check' });
		return steps;
	}

	private stepId = (st: Step | undefined): string => (st ? `${st.kind}|${st.group ?? ''}` : '');

	/** Work the steps out again (a class, level or subclass changed), keep the step on show, and redraw. */
	private rebuild(): void {
		const current = this.stepId(this.steps[this.at]);
		const focus = activeDocument.activeElement?.getAttribute('data-k') ?? null;
		this.replan();
		this.steps = this.buildSteps();
		const i = this.steps.findIndex(st => this.stepId(st) === current);
		this.at = i >= 0 ? i : Math.min(this.at, this.steps.length - 1);
		this.track.empty();
		this.panels = this.steps.map(() => this.track.createDiv({ cls: 'lu-panel' }));
		this.steps.forEach((_, k) => this.renderPanel(k));
		this.track.setCssProps({ '--lu-at': String(this.at) });
		this.panels.forEach((p, k) => { p.toggleClass('is-active', k === this.at); if (k === this.at) p.removeAttribute('inert'); else p.setAttr('inert', ''); });
		this.renderChrome();
		if (focus) this.panels[this.at]?.querySelector<HTMLElement>(`[data-k="${CSS.escape(focus)}"]`)?.focus();
	}

	private go(i: number, animate = true): void {
		if (i < 0 || i >= this.steps.length) return;
		// Levelling up, Hit points are settled before going past them.
		const hpAt = this.steps.findIndex(s => s.kind === 'hp');
		if (!this.isNew && hpAt >= 0 && i > hpAt && this.gain() === null && this.at <= hpAt) { i = hpAt; this.flash(hpAt); }
		this.seen.add(this.stepId(this.steps[this.at]));
		this.at = i;
		this.picked = null;
		this.track.toggleClass('no-anim', !animate);
		this.track.setCssProps({ '--lu-at': String(i) });
		this.panels.forEach((p, k) => { p.toggleClass('is-active', k === i); if (k === i) p.removeAttribute('inert'); else p.setAttr('inert', ''); });
		// Steps that show what the others decided are drawn as they come up.
		if (['review', 'skill', 'increase', 'stats', 'spells'].includes(this.steps[i].kind)) this.renderPanel(i);
		this.renderChrome();
	}

	private flash(i: number): void {
		const p = this.panels[i];
		p.removeClass('is-shake');
		void p.offsetWidth;
		p.addClass('is-shake');
	}

	private renderChrome(): void {
		// The line under the title: who, and what's chosen (a subclass).
		this.sub.empty();
		if (this.level) {
			const s = this.level.s;
			const badge = this.sub.createSpan({ cls: 'lu-badge', attr: { 'aria-label': `Level ${s.level} to ${this.nextLevel}` } });
			badge.createSpan({ cls: 'lu-badge-from', text: String(s.level) });
			setIcon(badge.createSpan({ cls: 'lu-badge-arrow' }), evIcon('arrow-right'));
			badge.createSpan({ cls: 'lu-badge-to', text: String(this.nextLevel) });
			this.sub.createSpan({ cls: 'lu-sub-text', text: [s.className, s.subclass || this.choices.subclass].filter(Boolean).join(' · ') });
		} else {
			const h = this.hero;
			this.sub.createSpan({ cls: 'lu-sub-text', text: [h.ancestry, h.className, this.choices.subclass].filter(Boolean).join(' · ') || ' ' });
			if ((h.level ?? 1) > 1) pill(this.sub, { cls: 'lu-level-tag', text: `Level ${h.level}` });
		}
		this.dots.empty();
		this.steps.forEach((st, i) => {
			const on = i === this.at;
			const done = this.done(i);
			const d = pill(this.dots, { tag: 'button', icon: evIcon(done && !on ? 'check' : st.icon), text: st.label, cls: `lu-dot${on ? ' is-active' : ''}${done ? ' is-done' : ''}`, attr: { role: 'tab', 'aria-selected': String(on) } });
			d.addEventListener('click', () => this.go(i));
		});
		this.dots.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
		setPill(this.backBtn, this.at === 0 ? { text: 'Cancel' } : { icon: evIcon('chevron-left'), text: 'Back' });
		const st = this.steps[this.at];
		const after = this.steps[this.at + 1];
		if (st?.kind === 'review') setPill(this.nextBtn, this.isNew ? { icon: evIcon('user-plus'), text: 'Create' } : { icon: evIcon('crown'), text: `Reach level ${this.nextLevel}` });
		else setPill(this.nextBtn, { text: after ? `Next: ${after.label}` : 'Next' });
		this.nextBtn.disabled = !this.isNew && st?.kind === 'hp' && this.gain() === null;
	}

	private done(i: number): boolean {
		const st = this.steps[i];
		const c = this.choices;
		switch (st.kind) {
			case 'hero': return !!this.hero.name.trim() && !!this.cls;
			case 'stats': return this.seen.has(this.stepId(st)) && !keyStatsShort(this.placement(), this.cls).length;
			case 'hp': return this.gain() !== null;
			case 'subclass': return !!c.subclass;
			case 'pick': { const g = this.groups.find(x => x.name === st.group); return !!g && (c.picks[g.name]?.length ?? 0) >= g.count; }
			case 'spells': return this.slots.every(s => (c.spells[s.key]?.length ?? 0) >= Math.min(s.count, s.options.length));
			case 'increase': return this.plans.every(p => p.stats.every(inc => (c.stats[increaseKey(p.level, inc)]?.length ?? 0) >= inc.count));
			case 'boon': return !!c.boon;
			case 'skill': return this.skillBudget() === 0 && (this.seen.has(this.stepId(st)) || Object.keys(c.skills).length > 0);
			default: return this.seen.has(this.stepId(st)) && i !== this.at;
		}
	}

	/** Redraw one step, keeping its scroll position and focus, and the chrome around it. */
	private refresh(i = this.at): void {
		const panel = this.panels[i];
		const top = panel.scrollTop;
		const focus = activeDocument.activeElement?.getAttribute('data-k') ?? null;
		this.renderPanel(i);
		panel.scrollTop = top;
		if (focus) panel.querySelector<HTMLElement>(`[data-k="${CSS.escape(focus)}"]`)?.focus();
		this.renderChrome();
	}

	private renderPanel(i: number): void {
		const panel = this.panels[i];
		if (!panel) return;
		panel.empty();
		const st = this.steps[i];
		switch (st.kind) {
			case 'hero': this.renderHero(panel); break;
			case 'stats': this.renderStats(panel); break;
			case 'overview': this.renderOverview(panel); break;
			case 'hp': this.renderHp(panel); break;
			case 'subclass': this.renderSubclass(panel); break;
			case 'pick': this.renderPick(panel, this.groups.find(g => g.name === st.group)); break;
			case 'spells': this.renderSpells(panel); break;
			case 'increase': this.renderIncreases(panel); break;
			case 'boon': this.renderBoon(panel); break;
			case 'skill': this.renderSkills(panel); break;
			case 'review': this.renderReview(panel); break;
		}
	}

	/** The step's title, and a counter tag ("0 / 1") when the step has a number to reach. */
	private stepHead(panel: HTMLElement, title: string, count?: { have: number; need: number }): HTMLElement {
		const h = panel.createDiv({ cls: 'lu-step-head' });
		h.createDiv({ cls: 'lu-step-title', text: title });
		if (count) pill(h, { cls: `lu-count${count.have >= count.need ? ' is-done' : ''}`, icon: count.have >= count.need ? evIcon('check') : undefined, text: `${count.have} / ${count.need}` });
		return h;
	}

	// ------------------------------------------------------------------------
	// New character: who they are

	private renderHero(panel: HTMLElement): void {
		const h = this.hero;
		const comp = this.comp;
		const form = panel.createDiv({ cls: 'lu-form' });
		const field = (label: string, cls = '') => { const f = form.createDiv({ cls: `lu-field ${cls}`.trim() }); dialogLabel(f, label); return f; };

		const name = field('Name', 'is-wide').createEl('input', { type: 'text', cls: 'lu-input lu-name-input', attr: { placeholder: 'Thorga Ironbrow', 'data-k': 'name', 'aria-label': 'Name', autocomplete: 'off' } });
		name.value = h.name;
		name.addEventListener('input', () => { h.name = name.value; this.renderChrome(); });
		name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.go(this.at + 1); } });

		const select = (label: string, key: string, options: { value: string; label: string }[], value: string | undefined, set: (v: string) => void, cls = '') => {
			const f = field(label, cls);
			const el = f.createEl('select', { cls: 'dropdown lu-select', attr: { 'data-k': key, 'aria-label': label } });
			el.createEl('option', { value: '', text: '—' });
			for (const o of options) el.createEl('option', { value: o.value, text: o.label });
			el.value = value ?? '';
			el.addEventListener('change', () => set(el.value));
			return f;
		};
		select('Ancestry', 'ancestry', comp.ancestries.map(a => ({ value: a.name, label: a.name })), h.ancestry, v => {
			h.ancestry = v || undefined;
			if (!sizesOf(comp.ancestry(v)?.size).includes(h.size ?? '')) h.size = undefined;
			this.rebuild();
		});
		select('Class', 'class', comp.classes.map(c => ({ value: c.name, label: `${c.name}${c.draft ? ' (draft)' : ''}` })), h.className, v => {
			h.className = v || undefined;
			h.stats = undefined;
			this.choices = noChoices();
			this.hp = { how: 'average', rolls: [], manual: '' };
			this.rebuild();
		});
		const bgField = select('Background', 'background', comp.backgrounds.map(b => ({ value: b.name, label: b.name })), h.background, v => { h.background = v || undefined; this.rebuild(); });
		const bgNote = this.backgroundNote();
		if (bgNote) bgField.createDiv({ cls: `lu-field-note${bgNote.unmet ? ' is-warn' : ''}`, text: bgNote.text });

		// Level: the keypad's − / + around the number.
		const lv = field('Level', 'is-level');
		const keys = lv.createDiv({ cls: 'ev-keys lu-level-keys' });
		const minus = keys.createEl('button', { attr: { 'aria-label': 'One level lower', 'data-k': 'level-minus' } });
		setIcon(minus, evIcon('minus'));
		const num = keys.createEl('input', { type: 'number', cls: 'lu-level-input', attr: { min: '1', max: '20', inputmode: 'numeric', 'aria-label': 'Level', 'data-k': 'level' } });
		num.value = String(h.level ?? 1);
		const plus = keys.createEl('button', { attr: { 'aria-label': 'One level higher', 'data-k': 'level-plus' } });
		setIcon(plus, evIcon('plus'));
		const setLevel = (n: number) => { h.level = Math.max(1, Math.min(20, Math.floor(n) || 1)); this.rebuild(); };
		minus.disabled = (h.level ?? 1) <= 1;
		plus.disabled = (h.level ?? 1) >= 20;
		minus.addEventListener('click', () => setLevel((h.level ?? 1) - 1));
		plus.addEventListener('click', () => setLevel((h.level ?? 1) + 1));
		num.addEventListener('change', () => setLevel(Number(num.value)));

		const player = field('Player').createEl('input', { type: 'text', cls: 'lu-input', attr: { placeholder: 'Who plays them', 'data-k': 'player', 'aria-label': 'Player' } });
		player.value = h.player ?? '';
		player.addEventListener('input', () => { h.player = player.value.trim() || undefined; });

		// Small or Medium, for an ancestry that can be either.
		const sizes = sizesOf(comp.ancestry(h.ancestry)?.size);
		if (sizes.length > 1) {
			const f = field('Size', 'is-wide');
			this.segments(f, sizes.map(x => ({ value: x, label: x })), h.size ?? '', v => { h.size = v; this.refresh(); }, 'size');
		}

		const cls = this.cls;
		if (cls) this.classCard(panel, cls.name);

		// Starting gear, or the gold to buy it (25 gp a level).
		const gear = (cls?.startingGear ?? []).filter(g => typeof g === 'string' && g.trim());
		const gf = panel.createDiv({ cls: 'lu-field lu-gear' });
		dialogLabel(gf, 'Starting gear');
		this.segments(gf, [{ value: 'gear', label: cls ? 'Class gear' : 'Gear' }, { value: 'gold', label: `${startingGold(h.level)} gp` }], h.gold ? 'gold' : 'gear', v => { h.gold = v === 'gold'; this.refresh(); }, 'gear');
		if (!h.gold && gear.length) {
			const chips = gf.createDiv({ cls: 'lu-chips' });
			for (const g of gear) pill(chips, { cls: 'lu-chip', icon: evIcon('backpack'), text: g });
		}
	}

	/** A background's requirement ("Req. 0 or negative INT at character creation"), and whether the stats meet it. */
	private backgroundNote(): { text: string; unmet: boolean } | null {
		const bg = this.comp.background(this.hero.background);
		if (!bg?.requirement) return null;
		const m = bg.requirement.match(/0 or negative (STR|DEX|INT|WIL)/i);
		const unmet = !!m && this.placement()[m[1].toUpperCase() as StatKey] > 0;
		return { text: bg.requirement.replace(/^Req\.\s*/i, 'Needs '), unmet };
	}

	/** The class at a glance: its Hit Die, HP, key stats, saves, armor and weapons. */
	private classCard(parent: HTMLElement, className: string): void {
		const cls = this.comp.classByName(className);
		if (!cls) return;
		const card = parent.createDiv({ cls: 'lu-class' });
		const top = card.createDiv({ cls: 'lu-class-top' });
		top.createDiv({ cls: 'lu-class-name', text: cls.name });
		if (cls.tagline) top.createDiv({ cls: 'lu-class-tagline', text: cls.tagline });
		const facts = card.createDiv({ cls: 'lu-facts' });
		const fact = (label: string, draw: (v: HTMLElement) => void, cls2 = '') => {
			const f = facts.createDiv({ cls: `lu-fact ${cls2}`.trim() });
			f.createDiv({ cls: 'lu-fact-label', text: label });
			draw(f.createDiv({ cls: 'lu-fact-value' }));
		};
		fact('Hit Die', v => { dieShape(v, cls.hitDie ?? 8); v.createSpan({ text: `d${cls.hitDie ?? 8}` }); });
		fact('HP', v => { setIcon(v.createSpan({ cls: 'lu-fact-icon is-hp' }), evIcon('heart')); v.createSpan({ text: String(cls.startingHp ?? 10) }); });
		fact('Key', v => { for (const k of keyStatsOf(cls)) pill(v, { cls: 'lu-key-tag', text: k }); });
		fact('Saves', v => {
			const adv = (cls.saves?.adv ?? '').toUpperCase();
			const dis = (cls.saves?.dis ?? '').toUpperCase();
			if (adv) { const s = v.createSpan({ cls: 'lu-save' }); drawSvg(s, saveTriangle('up'), 22, 10, 'lu-tri is-on'); s.createSpan({ text: adv }); }
			if (dis) { const s = v.createSpan({ cls: 'lu-save' }); drawSvg(s, saveTriangle('down'), 22, 10, 'lu-tri is-on'); s.createSpan({ text: dis }); }
		});
		if (cls.armor) fact('Armor', v => v.setText(cls.armor ?? ''), 'is-wide');
		if (cls.weapons) fact('Weapons', v => v.setText(cls.weapons ?? ''), 'is-wide');
	}

	/** A row of equal segments (the keypad's), its thumb sliding to the one picked. */
	private segments(parent: HTMLElement, options: { value: string; label: string; sub?: string }[], value: string, set: (v: string) => void, key: string): HTMLElement {
		const seg = parent.createDiv({ cls: 'ev-seg lu-seg', attr: { role: 'radiogroup' } });
		const at = options.findIndex(o => o.value === value);
		options.forEach((o, i) => {
			const on = i === at;
			const b = seg.createEl('button', { cls: on ? 'is-on' : '', attr: { role: 'radio', 'aria-checked': String(on), 'data-k': `${key}-${o.value}` } });
			b.createSpan({ cls: 'lu-seg-label', text: o.label });
			if (o.sub) b.createSpan({ cls: 'lu-seg-sub', text: o.sub });
			b.addEventListener('click', () => { if (!on) set(o.value); });
		});
		if (at >= 0) slideThumb(seg, at, options.length);
		return seg;
	}

	// ------------------------------------------------------------------------
	// New character: the stat array, placed

	private renderStats(panel: HTMLElement): void {
		const h = this.hero;
		const cls = this.cls;
		const stats = this.placement();
		const keys = keyStatsOf(cls);
		const suggested = assignStats(statArray(this.comp, h.array).values, cls);

		const arr = panel.createDiv({ cls: 'lu-field' });
		dialogLabel(arr, 'Array');
		this.segments(arr, statArrays(this.comp).map(a => ({ value: a.name, label: a.name, sub: a.values.map(plainMod).join(' ') })), statArray(this.comp, h.array).name, v => {
			h.array = v;
			h.stats = undefined;
			this.picked = null;
			this.refresh();
		}, 'array');

		const place = panel.createDiv({ cls: 'lu-field' });
		const label = dialogLabel(place, 'Stats', this.picked ? `Swap ${this.picked} with…` : 'Tap two to swap', 'lu-place-hint');
		label.el.addClass('lu-place-label');
		const sheet = place.createDiv({ cls: 'nimble-sheet ns-sheet lu-sheet' });
		const row = sheet.createDiv({ cls: 'ns-stats lu-place-row' });
		for (const stat of STATS) {
			const save = cls?.saves?.adv?.toUpperCase() === stat ? 'adv' : cls?.saves?.dis?.toUpperCase() === stat ? 'dis' : null;
			const key = keys.includes(stat);
			const cell = row.createDiv({ cls: `ns-stat lu-place${save ? ` is-${save}` : ''}${key ? ' is-key' : ''}${this.picked === stat ? ' is-picked' : ''}${this.swapped.includes(stat) ? ' is-swapped' : ''}` });
			const box = cell.createEl('button', {
				cls: 'ns-stat-box',
				attr: {
					'data-k': `stat-${stat}`, 'aria-pressed': String(this.picked === stat),
					'aria-label': `${STAT_NAME[stat]} ${fmtMod(stats[stat])}${key ? ', a key stat' : ''}${save === 'adv' ? ', advantaged save' : save === 'dis' ? ', disadvantaged save' : ''}`,
				},
			});
			const face = box.createSpan({ cls: 'ns-stat-face' });
			face.createSpan({ cls: 'ns-stat-value', text: plainMod(stats[stat]) });
			face.createSpan({ cls: 'ns-stat-label', text: stat });
			for (const dir of ['up', 'down'] as const) drawSvg(box, saveTriangle(dir), 22, 10, `ns-tri is-${dir}${(dir === 'up' ? save === 'adv' : save === 'dis') ? ' is-on' : ''}`);
			box.addEventListener('click', () => this.tapStat(stat));
			cell.createDiv({ cls: 'lu-key-mark', text: key ? 'Key' : '' });
		}
		this.swapped = [];

		const short = keyStatsShort(stats, cls);
		const bg = this.backgroundNote();
		const notes = place.createDiv({ cls: 'lu-place-notes' });
		if (short.length) {
			notes.createDiv({ cls: 'lu-warn', text: `${short.join(' and ')} ${short.length > 1 ? 'are key stats' : 'is a key stat'}: give ${short.length > 1 ? 'them' : 'it'} your highest numbers.` });
		}
		if (bg?.unmet) notes.createDiv({ cls: 'lu-warn', text: `${h.background}: ${bg.text.toLowerCase()}.` });
		if (STATS.some(k => stats[k] !== suggested[k])) {
			const reset = pill(notes, { tag: 'button', cls: 'lu-reset', icon: evIcon('undo'), text: 'Class’s placement', attr: { 'data-k': 'reset' } });
			reset.addEventListener('click', () => { h.stats = undefined; this.picked = null; this.refresh(); });
		}
	}

	/** Tap a stat, then another: they trade numbers. Tapping the first again lets it go. */
	private tapStat(stat: StatKey): void {
		if (!this.picked) this.picked = stat;
		else if (this.picked === stat) this.picked = null;
		else {
			this.hero.stats = swapStats(this.placement(), this.picked, stat);
			this.swapped = [this.picked, stat];
			this.picked = null;
		}
		this.refresh();
	}

	// ------------------------------------------------------------------------
	// Level up: what it brings

	private renderOverview(panel: HTMLElement): void {
		const p = this.plans[0];
		this.stepHead(panel, `Level ${this.nextLevel}`);
		const gains = panel.createDiv({ cls: 'lu-gains' });
		const gain = (icon: EvIconName, text: string, tone = '') => pill(gains, { cls: `lu-gain ${tone}`.trim(), icon: evIcon(icon), text });
		gain('heart', `More HP (d${p?.hitDie ?? this.level?.s.hitDie})`, 'is-hp');
		gain('dice', '+1 Hit Die');
		if (p?.subclasses.length) gain('path', 'Your subclass', 'is-big');
		for (const g of this.groups) gain('list', `${g.name} ×${g.count}`);
		if (this.slots.length) gain('spell', 'Spells to learn');
		for (const inc of p?.stats ?? []) gain('trend-up', inc.count > 1 ? `+1 to ${inc.count} stats` : `+1 ${inc.options.join(' or ')}`);
		if (p?.boons.length) gain('gem', 'An Epic Boon', 'is-big');
		gain('target', 'Skill point');
		const feats = this.featuresNow();
		if (!feats.length) {
			panel.createDiv({ cls: 'lu-empty', text: this.level?.s.cls ? 'No new class features are listed for this level.' : 'Pick a class on the sheet to see what each level brings.' });
			return;
		}
		dialogLabel(panel, 'New features').el.addClass('lu-section-label');
		const list = panel.createDiv({ cls: 'lu-features' });
		for (const f of feats) this.featureCard(list, f);
	}

	/** Features at the new level(s), the chosen subclass's included. */
	private featuresNow(): ResolvedFeature[] {
		return this.plans.flatMap(p => p.features).filter(f => !(f.from === 'class' && /^(?:\w+ )?subclass$/i.test(f.name.trim())));
	}

	private featureCard(parent: HTMLElement, f: { name: string; text: string; from?: string; level?: number }): void {
		const card = parent.createDiv({ cls: `lu-feature${f.from === 'subclass' ? ' is-subclass' : ''}` });
		const top = card.createDiv({ cls: 'lu-feature-top' });
		top.createSpan({ cls: 'lu-feature-name', text: f.name });
		if (f.from === 'subclass') pill(top, { cls: 'lu-tag', text: 'Subclass' });
		if (this.isNew && f.level) pill(top, { cls: 'lu-tag is-quiet', text: `Level ${f.level}` });
		renderRulesText(card.createDiv({ cls: 'lu-feature-text' }), f.text);
	}

	// ------------------------------------------------------------------------
	// Hit points

	private renderHp(panel: HTMLElement): void {
		const n = this.gained.length;
		const die = this.gained[0]?.hitDie ?? 8;
		const avg = this.gained.reduce((a, p) => a + p.average, 0);
		const hp = this.hp;
		this.stepHead(panel, 'Hit points');
		const opts = panel.createDiv({ cls: 'lu-hp-options' });
		const card = (how: HpDraft['how'], icon: EvIconName, title: string) => {
			const c = opts.createDiv({ cls: `lu-hp-option${hp.how === how ? ' is-picked' : ''}`, attr: { role: 'button', tabindex: '0', 'aria-pressed': String(hp.how === how), 'data-k': `hp-${how}` } });
			setIcon(c.createDiv({ cls: 'lu-hp-icon' }), evIcon(icon));
			c.createDiv({ cls: 'lu-hp-title', text: title });
			return c;
		};

		// Roll ▲: two of the Hit Die, the higher kept, for each level.
		const roll = card('roll', 'dice', n > 1 ? `Roll ${n} × d${die} ▲` : `Roll d${die} ▲`);
		const dice = roll.createDiv({ cls: `lu-dice${n > 1 ? ' is-many' : ''}` });
		if (hp.how === 'roll' && hp.rolls.length === n) {
			for (const pair of hp.rolls) {
				const kept = pair.indexOf(Math.max(...pair));
				const g = dice.createSpan({ cls: 'lu-dice-pair' });
				pair.forEach((v, k) => dieShape(g, die, { value: v, cls: `lu-die${k === kept ? ' is-kept' : ' is-dropped'}` }));
			}
			roll.createDiv({ cls: 'lu-hp-value', text: `+${hp.rolls.reduce((a, r) => a + Math.max(...r), 0)}` });
			const more = roll.createEl('button', { cls: 'clickable-icon lu-hp-more', attr: { 'aria-label': 'Roll options' } });
			setIcon(more, evIcon('more'));
			more.addEventListener('click', (e) => {
				e.stopPropagation();
				const m = new Menu();
				m.addItem(it => it.setTitle('Roll again').setIcon('dices').onClick(() => { hp.rolls = []; doRoll(); }));
				m.addItem(it => it.setTitle('Clear roll').setIcon('rotate-ccw').onClick(() => { this.hp = { how: this.isNew ? 'average' : null, rolls: [], manual: hp.manual }; this.refresh(); }));
				const r = more.getBoundingClientRect();
				m.showAtPosition({ x: r.right, y: r.bottom });
			});
		} else {
			const g = dice.createSpan({ cls: 'lu-dice-pair' });
			dieShape(g, die, { cls: 'lu-die is-blank' });
			dieShape(g, die, { cls: 'lu-die is-blank' });
		}
		const doRoll = () => {
			if (hp.rolls.length === n) { hp.how = 'roll'; this.refresh(); return; } // one roll per level
			const who = this.level?.s.name ?? (this.hero.name || 'New hero');
			if (n === 1) {
				const r = this.plugin.rollWithAdvantage(die, `${who} · Level ${this.gained[0].level} HP`);
				hp.rolls = [r.rolls];
			} else {
				hp.rolls = this.gained.map(() => [rollDie(die), rollDie(die)]);
				const total = hp.rolls.reduce((a, r) => a + Math.max(...r), 0);
				this.plugin.logRoll({ label: `${who} · Levels ${this.gained[0].level}–${this.gained[n - 1].level} HP`, expression: `${n} × 1d${die} ▲`, total, detail: hp.rolls.map(r => `[${r.join(', ')}] keep ${Math.max(...r)}`).join('; ') });
			}
			hp.how = 'roll';
			this.refresh();
		};

		// The flat bonus (Core Rules 3.3 "Hit Die Size" table).
		const flat = card('average', 'scales', 'Take the flat bonus');
		flat.createDiv({ cls: 'lu-hp-value', text: `+${avg}` });
		const doAvg = () => { hp.how = 'average'; this.refresh(); };

		// Rolled at the table: the kept die (or the total, over several levels).
		const man = card('manual', 'edit', n > 1 ? 'I rolled them' : 'I rolled it');
		const input = man.createEl('input', { type: 'number', cls: 'lu-hp-input', attr: { min: String(n), max: String(n * die), inputmode: 'numeric', placeholder: `${n}–${n * die}`, 'aria-label': n > 1 ? 'Your total' : 'Your roll', 'data-k': 'hp-input' } });
		input.value = hp.manual;
		const takeManual = () => {
			hp.manual = input.value;
			hp.how = this.manualTotal() !== null ? 'manual' : hp.how === 'manual' ? null : hp.how;
			if (this.isNew && hp.how === null) hp.how = 'average';
			man.toggleClass('is-invalid', !!input.value && this.manualTotal() === null);
			opts.querySelectorAll('.lu-hp-option').forEach(o => o.toggleClass('is-picked', o.getAttribute('data-k') === `hp-${hp.how}`));
			this.drawHpResult(result);
			this.renderChrome();
		};
		input.addEventListener('input', takeManual);
		input.addEventListener('click', (e) => e.stopPropagation());
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && this.gain() !== null) this.go(this.at + 1); });

		const wire = (el: HTMLElement, fn: () => void) => {
			el.addEventListener('click', fn);
			el.addEventListener('keydown', (e) => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); } });
		};
		wire(roll, doRoll);
		wire(flat, doAvg);
		wire(man, () => { input.focus(); if (input.value) takeManual(); });

		const result = panel.createDiv({ cls: 'lu-hp-result' });
		this.drawHpResult(result);
	}

	private drawHpResult(el: HTMLElement): void {
		el.empty();
		const before = this.isNew ? (this.cls?.startingHp ?? 10) : this.level!.s.hpMax;
		const g = this.gain();
		el.toggleClass('is-set', g !== null);
		dialogLabel(el, 'Max HP');
		const nums = el.createDiv({ cls: 'lu-hp-result-nums' });
		nums.createSpan({ cls: 'lu-hp-old', text: String(before) });
		setIcon(nums.createSpan({ cls: 'lu-hp-arrow' }), evIcon('arrow-right'));
		nums.createSpan({ cls: `lu-hp-new${g === null ? ' is-pending' : ''}`, text: g === null ? '—' : String(before + g) });
		const bar = el.createDiv({ cls: 'lu-hp-bar' });
		const total = before + (g ?? 0);
		bar.createDiv({ cls: 'lu-hp-bar-old' }).setCssProps({ '--w': `${(before / Math.max(1, total)) * 100}%` });
		bar.createDiv({ cls: 'lu-hp-bar-new' }).setCssProps({ '--w': `${((g ?? 0) / Math.max(1, total)) * 100}%` });
	}

	// ------------------------------------------------------------------------
	// Subclass

	private renderSubclass(panel: HTMLElement): void {
		const subs = this.plans.find(p => p.subclasses.length)?.subclasses ?? [];
		const head = this.stepHead(panel, 'Choose your subclass');
		const seg = cluster(head, { joined: true, cls: 'lu-view-toggle', label: 'View' });
		for (const [v, label, icon] of [['cards', 'One at a time', 'tabs'], ['compare', 'Compare', 'list']] as const) {
			const b = pill(seg, { tag: 'button', icon: evIcon(icon), text: label, cls: `lu-view-btn${this.subclassView === v ? ' is-on' : ''}`, attr: { 'aria-pressed': String(this.subclassView === v) } });
			b.addEventListener('click', () => { this.subclassView = v; this.refresh(); });
		}
		const pick = (sc: Subclass) => {
			this.choices.subclass = this.choices.subclass === sc.name ? undefined : sc.name;
			this.rebuild();
		};
		if (this.subclassView === 'compare') { this.renderCompare(panel, subs, pick); return; }

		if (this.viewSub < 0 || this.viewSub >= subs.length) this.viewSub = Math.max(0, subs.findIndex(sc => sc.name === this.choices.subclass));
		const tabs = panel.createDiv({ cls: 'lu-sub-tabs', attr: { role: 'tablist', 'aria-label': 'Subclasses' } });
		subs.forEach((sc, k) => {
			const on = k === this.viewSub;
			const chosen = this.choices.subclass === sc.name;
			const tab = pill(tabs, { tag: 'button', icon: chosen ? evIcon('check') : undefined, text: splitTitle(sc.name).main, cls: `lu-sub-tab${on ? ' is-active' : ''}${chosen ? ' is-chosen' : ''}`, attr: { role: 'tab', 'aria-selected': String(on) } });
			tab.addEventListener('click', () => { this.viewSub = k; this.refresh(); });
		});

		const sc = subs[this.viewSub] ?? subs[0];
		if (!sc) return;
		const chosen = this.choices.subclass === sc.name;
		const view = panel.createDiv({ cls: `lu-sub-view${chosen ? ' is-chosen' : ''}` });
		const band = view.createDiv({ cls: 'lu-sub-band' });
		const titles = band.createDiv({ cls: 'lu-sub-titles' });
		const t = splitTitle(sc.name);
		if (t.lead) titles.createDiv({ cls: 'lu-sub-lead', text: t.lead });
		titles.createDiv({ cls: 'lu-sub-name', text: t.main });
		const meta = titles.createDiv({ cls: 'lu-sub-meta' });
		if (sc.story) pill(meta, { cls: 'lu-tag is-light', text: 'Story-based' });
		if (sc.draft) pill(meta, { cls: 'lu-tag is-light', text: 'Draft' });
		if (sc.complexity) {
			const cx = meta.createSpan({ cls: 'lu-complexity', attr: { 'aria-label': `Complexity ${sc.complexity} of 4` } });
			cx.createSpan({ cls: 'lu-complexity-label', text: 'Complexity' });
			for (let n = 1; n <= 4; n++) cx.createSpan({ cls: `lu-pip${n <= (sc.complexity ?? 0) ? ' is-on' : ''}` });
		}
		const choose = pill(band, { tag: 'button', icon: evIcon(chosen ? 'check' : 'plus'), text: chosen ? 'Chosen' : `Choose ${t.main}`, cls: `lu-sub-band-choose${chosen ? ' is-chosen' : ''}`, attr: { 'aria-pressed': String(chosen) } });
		choose.addEventListener('click', () => pick(sc));
		if (sc.flavor) band.createDiv({ cls: 'lu-sub-flavor', text: sc.flavor });

		const body = view.createDiv({ cls: 'lu-sub-body' });
		if (sc.intro) renderRulesText(body.createDiv({ cls: 'lu-sub-intro' }), sc.intro);
		const now = new Set(this.plans.map(p => p.level));
		const grid = body.createDiv({ cls: 'lu-sub-levels' });
		for (const lv of subclassTimeline(sc)) {
			const block = grid.createDiv({ cls: `lu-sub-level${now.has(lv.level) ? ' is-now' : ''}` });
			const lh = block.createDiv({ cls: 'lu-sub-level-head' });
			pill(lh, { cls: 'lu-tag lu-level-pill', text: `Level ${lv.level}` });
			if (now.has(lv.level)) pill(lh, { cls: 'lu-tag lu-now-pill', text: this.isNew ? 'Yours' : 'Now' });
			for (const f of lv.features) {
				const fe = block.createDiv({ cls: 'lu-sub-feat' });
				fe.createDiv({ cls: 'lu-feature-name', text: f.name });
				renderRulesText(fe.createDiv({ cls: 'lu-feature-text' }), f.text);
			}
		}
		if (!grid.childElementCount) grid.remove();
		renderSource(body, sc);
	}

	/** Every subclass side by side, level by level. */
	private renderCompare(panel: HTMLElement, subs: Subclass[], pick: (sc: Subclass) => void): void {
		const wrap = panel.createDiv({ cls: 'lu-compare' });
		const table = wrap.createEl('table');
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { cls: 'lu-compare-corner', text: 'Level' });
		for (const sc of subs) {
			const th = head.createEl('th');
			th.createDiv({ cls: 'lu-compare-name', text: splitTitle(sc.name).main });
			if (sc.complexity) {
				const cx = th.createDiv({ cls: 'lu-complexity' });
				for (let n = 1; n <= 4; n++) cx.createSpan({ cls: `lu-pip${n <= (sc.complexity ?? 0) ? ' is-on' : ''}` });
			}
			const chosen = this.choices.subclass === sc.name;
			const b = pill(th, { tag: 'button', icon: chosen ? evIcon('check') : undefined, text: chosen ? 'Chosen' : 'Choose', cls: `lu-compare-choose${chosen ? ' is-chosen' : ''}` });
			b.addEventListener('click', () => pick(sc));
		}
		const now = new Set(this.plans.map(p => p.level));
		const levels = [...new Set(subs.flatMap(sc => subclassTimeline(sc).map(l => l.level)))].sort((a, b) => a - b);
		const body = table.createEl('tbody');
		for (const lv of levels) {
			const tr = body.createEl('tr', { cls: now.has(lv) ? 'is-now' : '' });
			tr.createEl('th', { cls: 'lu-compare-level', text: String(lv) });
			for (const sc of subs) {
				const td = tr.createEl('td', { cls: this.choices.subclass === sc.name ? 'is-chosen' : '' });
				for (const f of subclassTimeline(sc).find(l => l.level === lv)?.features ?? []) {
					const fe = td.createDiv({ cls: 'lu-sub-feat' });
					fe.createDiv({ cls: 'lu-feature-name', text: f.name });
					renderRulesText(fe.createDiv({ cls: 'lu-feature-text' }), f.text);
				}
			}
		}
	}

	// ------------------------------------------------------------------------
	// Picks from a list (Savage Arsenal, Sacred Decrees…), and spells

	private renderPick(panel: HTMLElement, g: PickGroup | undefined): void {
		if (!g) return;
		const chosen = (this.choices.picks[g.name] ??= []);
		const known = new Set(this.baseSheet().features.map(f => nameKey(f.name)));
		this.stepHead(panel, g.name, { have: chosen.length, need: g.count });
		if (this.isNew && g.from.length > 1) panel.createDiv({ cls: 'lu-from', text: g.from.map(f => `Level ${f.level}${f.count > 1 ? ` ×${f.count}` : ''}`).join(' · ') });
		if (g.group.intro) renderRulesText(panel.createDiv({ cls: 'lu-intro' }), g.group.intro);
		const grid = panel.createDiv({ cls: 'lu-options' });
		const full = chosen.length >= g.count;
		for (const o of g.group.options as RepeatableOption[]) {
			const times = chosen.filter(n => n === o.name).length;
			this.optionCard(grid, o, {
				taken: !o.repeatable && known.has(nameKey(o.name)),
				chosen: times > 0,
				times: o.repeatable ? times : undefined,
				full,
				toggle: () => {
					const at = chosen.indexOf(o.name);
					if (o.repeatable && !full) chosen.push(o.name);
					else if (at >= 0) chosen.splice(at, 1);
					else { if (full) chosen.shift(); chosen.push(o.name); }
					this.refresh();
				},
				less: o.repeatable && times > 0 ? () => { chosen.splice(chosen.indexOf(o.name), 1); this.refresh(); } : undefined,
			});
		}
	}

	private optionCard(grid: HTMLElement, o: { name: string; text?: string; cost?: string; requirement?: string; school?: string }, st: { taken: boolean; chosen: boolean; full: boolean; times?: number; toggle: () => void; less?: () => void }): void {
		const card = grid.createDiv({
			cls: `lu-option${st.chosen ? ' is-chosen' : ''}${st.taken ? ' is-taken' : ''}${st.full && !st.chosen ? ' is-dim' : ''}`,
			attr: { role: 'button', tabindex: st.taken ? '-1' : '0', 'aria-pressed': String(st.chosen), 'data-k': `opt-${o.name}` },
		});
		const top = card.createDiv({ cls: 'lu-option-top' });
		top.createDiv({ cls: 'lu-option-name', text: o.name });
		const tags = top.createDiv({ cls: 'lu-option-tags' });
		if (st.taken) pill(tags, { cls: 'lu-tag is-quiet', text: 'Known' });
		else if (o.cost) pill(tags, { cls: 'lu-tag', text: o.cost });
		if (o.school) pill(tags, { cls: 'lu-tag is-school', icon: schoolIcon(o.school), text: o.school });
		if (st.times !== undefined && st.times > 0) pill(tags, { cls: 'lu-tag is-count', text: `×${st.times}` });
		if (st.chosen) setIcon(top.createSpan({ cls: 'lu-option-check' }), evIcon('check'));
		if (o.requirement) card.createDiv({ cls: 'lu-option-req', text: o.requirement });
		renderRulesText(card.createDiv({ cls: 'lu-option-text' }), o.text ?? '');
		if (st.less) {
			const less = pill(card, { tag: 'button', cls: 'lu-option-less', icon: evIcon('minus'), text: 'One fewer' });
			less.addEventListener('click', (e) => { e.stopPropagation(); st.less?.(); });
		}
		if (st.taken) return;
		card.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a, button')) return; st.toggle(); });
		card.addEventListener('keydown', (e) => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.toggle(); } });
	}

	private renderSpells(panel: HTMLElement): void {
		const c = this.choices;
		const need = this.slots.reduce((a, s) => a + Math.min(s.count, s.options.length), 0);
		const have = this.slots.reduce((a, s) => a + Math.min(c.spells[s.key]?.length ?? 0, s.count), 0);
		this.stepHead(panel, 'Spells', { have, need });
		const known = new Set(this.baseSheet().spells.map(sp => nameKey(sp.name)));
		for (const g of this.granted) known.add(nameKey(g));
		for (const slot of this.slots) {
			const chosen = (c.spells[slot.key] ??= []);
			const box = panel.createDiv({ cls: 'lu-spell-box' });
			const label = dialogLabel(box, [this.isNew ? `Level ${slot.level}` : '', slot.feature, slot.school ?? ''].filter(Boolean).join(' · '), `${chosen.length} / ${Math.min(slot.count, slot.options.length)}`, 'lu-spell-count');
			label.el.addClass('lu-spell-label');
			const set = (name: string) => {
				const at = chosen.indexOf(name);
				if (at >= 0) chosen.splice(at, 1);
				else { if (chosen.length >= slot.count) chosen.shift(); chosen.push(name); }
				// A school chosen here changes what later picks offer ("each spell school you know").
				if (slot.kind === 'school') this.rebuild(); else this.refresh();
			};
			if (slot.kind === 'school' || slot.kind === 'utilities') {
				const chips = box.createDiv({ cls: 'lu-chips' });
				for (const sc of slot.options) {
					const on = chosen.includes(sc);
					const b = pill(chips, { tag: 'button', icon: schoolIcon(sc), text: sc, cls: `lu-chip lu-school${on ? ' is-on' : ''}`, attr: { 'aria-pressed': String(on), 'data-k': `${slot.key}-${sc}` } });
					b.addEventListener('click', () => set(sc));
				}
				if (!slot.options.length) box.createDiv({ cls: 'lu-empty', text: 'Every school you know is taken.' });
				// Every Utility Spell of the school chosen, to read.
				if (slot.kind === 'utilities') for (const sc of chosen) {
					const grid = box.createDiv({ cls: 'lu-options is-compact' });
					for (const name of utilitySpells(this.comp, sc)) this.spellCard(grid, name, { taken: known.has(nameKey(name)), chosen: true, full: true, toggle: () => undefined });
				}
			} else {
				const grid = box.createDiv({ cls: 'lu-options is-compact' });
				for (const name of slot.options) {
					this.spellCard(grid, name, { taken: known.has(nameKey(name)), chosen: chosen.includes(name), full: chosen.length >= slot.count, toggle: () => set(name) });
				}
			}
		}
		if (this.granted.length) {
			dialogLabel(panel, 'You also learn').el.addClass('lu-section-label');
			const chips = panel.createDiv({ cls: 'lu-chips' });
			for (const name of this.granted) pill(chips, { cls: 'lu-chip', icon: schoolIcon(this.comp.spell(name)?.school ?? ''), text: name });
		}
	}

	private spellCard(grid: HTMLElement, name: string, st: { taken: boolean; chosen: boolean; full: boolean; toggle: () => void }): void {
		const sp = this.comp.spell(name);
		this.optionCard(grid, { name, text: sp?.text, cost: sp?.actions, school: sp?.school }, st);
	}

	// ------------------------------------------------------------------------
	// Stat increases, the Epic Boon, skills

	private renderIncreases(panel: HTMLElement): void {
		this.stepHead(panel, 'Stat increases');
		// Each increase shows the stat as it will be by then (a level 8 hero's second +1 DEX starts where the first left it).
		const running = { ...(this.isNew ? this.placement() : this.level!.s.stats) };
		for (const p of this.plans) for (const inc of p.stats) {
			const key = increaseKey(p.level, inc);
			const chosen = (this.choices.stats[key] ??= []);
			const box = panel.createDiv({ cls: 'lu-stat-box' });
			const label = dialogLabel(box, this.isNew ? `Level ${p.level} · ${inc.feature}` : inc.feature, `${chosen.length} / ${inc.count}`, `lu-stat-count${chosen.length >= inc.count ? ' is-done' : ''}`);
			label.el.addClass('lu-stat-label');
			const row = box.createDiv({ cls: 'lu-stats' });
			for (const k of inc.options) {
				const on = chosen.includes(k);
				const b = row.createEl('button', { cls: `lu-stat${on ? ' is-chosen' : ''}`, attr: { 'aria-pressed': String(on), 'data-k': `${key}-${k}` } });
				b.createDiv({ cls: 'lu-stat-key', text: k });
				const nums = b.createDiv({ cls: 'lu-stat-nums' });
				nums.createSpan({ cls: 'lu-stat-old', text: plainMod(running[k]) });
				setIcon(nums.createSpan({ cls: 'lu-stat-arrow' }), evIcon('arrow-right'));
				nums.createSpan({ cls: 'lu-stat-new', text: plainMod(running[k] + 1) });
				b.addEventListener('click', () => {
					const at = chosen.indexOf(k);
					if (at >= 0) chosen.splice(at, 1);
					else { if (chosen.length >= inc.count) chosen.shift(); chosen.push(k); }
					this.refresh();
				});
			}
			for (const k of chosen) running[k] += 1;
		}
	}

	private renderBoon(panel: HTMLElement): void {
		const boons = this.plans.flatMap(p => p.boons);
		this.stepHead(panel, 'Epic Boon', { have: this.choices.boon ? 1 : 0, need: 1 });
		const known = new Set(this.baseSheet().features.map(f => nameKey(f.name)));
		const grid = panel.createDiv({ cls: 'lu-options' });
		for (const b of boons) this.optionCard(grid, { name: b.name, text: b.text, requirement: b.requirement }, {
			taken: known.has(nameKey(b.name)),
			chosen: this.choices.boon === b.name,
			full: !!this.choices.boon,
			toggle: () => { this.choices.boon = this.choices.boon === b.name ? undefined : b.name; this.refresh(); },
		});
	}

	private renderSkills(panel: HTMLElement): void {
		const d = this.choices;
		const budget = this.skillBudget();
		const moves = this.movesLeft();
		const head = this.stepHead(panel, 'Skills');
		const status = head.createDiv({ cls: 'lu-skill-status' });
		pill(status, { cls: `lu-skill-budget${budget > 0 ? ' is-open' : ''}`, icon: evIcon('plus'), text: `${budget} to place`, attr: { 'aria-label': `${budget} to place` } });
		if (!this.isNew) pill(status, { cls: `lu-skill-move${moves ? '' : ' is-used'}`, icon: evIcon('arrows-down-up'), text: `${moves} ${moves === 1 ? 'move' : 'moves'} left` });
		if (Object.keys(d.skills).length) {
			const reset = pill(status, { tag: 'button', cls: 'lu-skill-reset', icon: evIcon('undo'), text: 'Reset' });
			reset.addEventListener('click', () => { d.skills = {}; this.refresh(); });
		}
		// Heroic Skills (Core Rules 3.3, optional): the GM may give 1–4 more points at level 1.
		if (this.isNew) {
			const hs = panel.createDiv({ cls: 'lu-heroic' });
			dialogLabel(hs, 'Heroic Skills', this.heroic ? `+${this.heroic}` : 'None');
			const keys = hs.createDiv({ cls: 'ev-keys' });
			const minus = keys.createEl('button', { attr: { 'aria-label': 'One fewer Heroic Skill point', 'data-k': 'heroic-minus' } });
			setIcon(minus, evIcon('minus'));
			const plus = keys.createEl('button', { attr: { 'aria-label': 'One more Heroic Skill point', 'data-k': 'heroic-plus' } });
			setIcon(plus, evIcon('plus'));
			minus.disabled = this.heroic <= 0;
			plus.disabled = this.heroic >= HEROIC_MAX;
			minus.addEventListener('click', () => { this.heroic = Math.max(0, this.heroic - 1); if (this.skillBudget() < 0) d.skills = {}; this.refresh(); });
			plus.addEventListener('click', () => { this.heroic = Math.min(HEROIC_MAX, this.heroic + 1); this.refresh(); });
		}

		const before = this.baseSheet();
		const after = this.previewSheet();
		const list = panel.createDiv({ cls: 'lu-skill-list' });
		for (const sk of after.skills) {
			const delta = d.skills[sk.key] ?? 0;
			const points = before.skills.find(x => x.key === sk.key)?.points ?? 0;
			const row = list.createDiv({ cls: `lu-skill-row${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}` });
			const label = row.createDiv({ cls: 'lu-skill-label' });
			label.createSpan({ cls: 'lu-skill-stat', text: sk.stat });
			label.createSpan({ cls: 'lu-skill-name', text: sk.name });
			const nums = row.createDiv({ cls: 'lu-stat-nums' });
			nums.createSpan({ cls: 'lu-stat-old', text: fmtMod(sk.total) });
			if (delta) {
				setIcon(nums.createSpan({ cls: 'lu-stat-arrow' }), evIcon('arrow-right'));
				nums.createSpan({ cls: 'lu-stat-new', text: fmtMod(sk.total + delta) });
			}
			const step = row.createDiv({ cls: 'ev-keys lu-skill-step' });
			// − takes back a placed point, or (levelling up) moves one off a skill you put points in.
			const canMinus = delta > 0 || (delta <= 0 && moves > 0 && points + delta > 0);
			const minus = step.createEl('button', { cls: 'lu-step-btn', attr: { 'aria-label': delta > 0 ? `Take the point back from ${sk.name}` : `Move a point off ${sk.name}`, 'data-k': `sk-${sk.key}-minus` } });
			setIcon(minus, evIcon('minus'));
			minus.disabled = !canMinus;
			const plus = step.createEl('button', { cls: 'lu-step-btn is-plus', attr: { 'aria-label': `Put a point in ${sk.name}`, 'data-k': `sk-${sk.key}-plus` } });
			setIcon(plus, evIcon('plus'));
			plus.disabled = !(delta < 0 || budget > 0);
			const set = (n: number) => { if (n) d.skills[sk.key] = n; else delete d.skills[sk.key]; this.refresh(); };
			minus.addEventListener('click', () => set(delta - 1));
			plus.addEventListener('click', () => set(delta + 1));
		}
	}

	// ------------------------------------------------------------------------
	// Review

	private renderReview(panel: HTMLElement): void {
		const c = this.choices;
		this.stepHead(panel, 'Review');
		const list = panel.createDiv({ cls: 'lu-review' });
		const line = (icon: EvIconName, label: string, value: string, kind: StepKind, group?: string, missing = false) => {
			const r = list.createEl('button', { cls: `lu-review-row${missing ? ' is-missing' : ''}` });
			setIcon(r.createSpan({ cls: 'lu-review-icon' }), evIcon(icon));
			r.createSpan({ cls: 'lu-review-label', text: label });
			r.createSpan({ cls: 'lu-review-value', text: value });
			setIcon(r.createSpan({ cls: 'lu-review-go' }), evIcon('chevron-right'));
			r.addEventListener('click', () => this.go(this.steps.findIndex(st => st.kind === kind && (group === undefined || st.group === group))));
		};
		const after = this.previewSheet();
		if (this.isNew) {
			const h = this.hero;
			line('user', 'Hero', [h.name.trim() || 'No name yet', h.ancestry, h.className, h.background].filter(Boolean).join(' · '), 'hero', undefined, !h.name.trim() || !h.className);
			const st = this.placement();
			line('chart', 'Stats', STATS.map(k => `${k} ${plainMod(st[k])}`).join(' · '), 'stats', undefined, keyStatsShort(st, this.cls).length > 0);
			const gear = (this.cls?.startingGear ?? []).filter(Boolean);
			line('backpack', 'Starting gear', h.gold ? `${startingGold(h.level)} gp` : gear.join(', ') || 'None', 'hero');
		}
		const g = this.gain();
		if (this.gained.length) {
			const before = this.isNew ? (this.cls?.startingHp ?? 10) : this.level!.s.hpMax;
			const how = this.hp.how === 'roll' ? 'rolled' : this.hp.how === 'average' ? 'flat bonus' : 'your roll';
			line('heart', 'Max HP', g === null ? 'Not set' : `${before} → ${before + g} (+${g}, ${how})`, 'hp', undefined, g === null);
			if (!this.isNew) line('dice', 'Hit Dice', `${this.level!.s.hitDiceMax} → ${this.level!.s.hitDiceMax + this.gained.length} d${this.level!.s.hitDie}`, 'overview');
		}
		if (this.plans.some(p => p.subclasses.length)) line('path', 'Subclass', c.subclass || 'Choose later', 'subclass', undefined, !c.subclass);
		for (const gp of this.groups) line('list', gp.name, c.picks[gp.name]?.length ? c.picks[gp.name].join(', ') : 'Choose later', 'pick', gp.name, (c.picks[gp.name]?.length ?? 0) < gp.count);
		if (this.slots.length) {
			const names = this.slots.flatMap(s => c.spells[s.key] ?? []);
			line('spell', 'Spells', names.length ? names.join(', ') : 'Choose later', 'spells', undefined, !this.done(this.steps.findIndex(s => s.kind === 'spells')));
		}
		const incs = this.plans.flatMap(p => p.stats.map(inc => ({ inc, chosen: c.stats[increaseKey(p.level, inc)] ?? [] })));
		if (incs.length) {
			const base = this.isNew ? this.placement() : this.level!.s.stats;
			const raised = STATS.filter(k => after.stats[k] !== base[k]);
			line('trend-up', 'Increases', raised.length ? raised.map(k => `${k} ${plainMod(base[k])} → ${plainMod(after.stats[k])}`).join(', ') : 'Not chosen', 'increase', undefined, incs.some(x => x.chosen.length < x.inc.count));
		}
		if (this.plans.some(p => p.boons.length)) line('gem', 'Epic Boon', c.boon || 'Choose later', 'boon', undefined, !c.boon);
		const skills = Object.entries(c.skills).map(([k, n]) => { const sk = after.skills.find(x => x.key === k); return sk ? `${sk.name} ${fmtMod(sk.total)} → ${fmtMod(sk.total + n)}` : ''; }).filter(Boolean).join(', ');
		line('target', 'Skills', skills || (this.skillBudget() ? 'Not placed' : 'No points'), 'skill', undefined, this.skillBudget() !== 0);
		// Features that were a step of their own are in the list above already.
		if (!this.isNew) {
			const stepped = new Set([...this.plans.flatMap(p => p.picks.map(x => x.feature)), ...this.plans.flatMap(p => p.stats.map(x => x.feature)), ...this.slots.map(s => s.feature)]);
			const feats = this.featuresNow().filter(f => !stepped.has(f.name));
			if (feats.length) {
				dialogLabel(panel, 'You also gain').el.addClass('lu-section-label');
				const fl = panel.createDiv({ cls: 'lu-features' });
				for (const f of feats) this.featureCard(fl, f);
			}
		}
	}

	// ------------------------------------------------------------------------
	// Finishing

	private async finish(): Promise<void> {
		const gains = this.gains();
		if (this.gained.length && gains.length !== this.gained.length) { this.go(this.steps.findIndex(st => st.kind === 'hp')); return; }
		const choices: LevelChoices = { ...this.choices, hp: gains };
		if (this.level) {
			const plans = this.plans;
			await this.level.mutate((fm) => applyLevelChoices(fm, this.comp, plans, choices));
			this.celebrate();
			return;
		}
		const h = this.hero;
		if (!h.name.trim()) {
			new Notice('Give your character a name first.');
			this.go(0);
			window.setTimeout(() => this.panels[0]?.querySelector<HTMLInputElement>('input.lu-name-input')?.focus(), 400);
			return;
		}
		try {
			const file = await createCharacterNote(this.plugin, { ...h, stats: this.placement(), choices }, this.make?.folder, this.comp);
			this.close();
			if (this.make?.onCreated) this.make.onCreated(file);
			else await this.app.workspace.getLeaf(false).openFile(file);
		} catch (e) {
			console.error('Ember Vault: could not create the character', e);
			new Notice('Couldn\'t create the character note.');
		}
	}

	/** A moment of glory: the level bubble pops in, and a burst of confetti comes out from behind it. */
	private celebrate(): void {
		const c = this.choices;
		const g = this.gain();
		this.contentEl.empty();
		this.modalEl.addClass('is-celebrating');
		const done = this.contentEl.createDiv({ cls: 'lu-celebrate' });
		const canvas = done.createEl('canvas', { cls: 'lu-confetti', attr: { 'aria-hidden': 'true' } });
		const inner = done.createDiv({ cls: 'lu-celebrate-inner' });
		const bubble = inner.createDiv({ cls: 'lu-celebrate-level', text: String(this.nextLevel) });
		inner.createDiv({ cls: 'lu-celebrate-text', text: `${this.level?.s.name} is now level ${this.nextLevel}!` });
		const gains = inner.createDiv({ cls: 'lu-celebrate-gains' });
		const chip = (icon: EvIconName, text: string) => pill(gains, { cls: 'lu-celebrate-chip', icon: evIcon(icon), text });
		if (g) chip('heart', `+${g} HP`);
		if (c.subclass) chip('path', c.subclass);
		for (const list of Object.values(c.picks)) for (const n of list) chip('sparkle', n);
		for (const list of Object.values(c.spells)) for (const n of list) chip('spell', n);
		for (const list of Object.values(c.stats)) for (const k of list) chip('trend-up', `+1 ${k}`);
		if (c.boon) chip('gem', c.boon);
		if (!gains.childElementCount) gains.remove();
		const ok = pill(inner, { tag: 'button', cls: 'ev-dialog-btn is-main mod-cta lu-celebrate-ok', text: 'Back to the sheet' });
		ok.addEventListener('click', () => this.close());
		if (!isTouch()) window.setTimeout(() => ok.focus(), 0);
		window.requestAnimationFrame(() => {
			const box = canvas.getBoundingClientRect();
			const b = bubble.getBoundingClientRect();
			this.stopShow = confettiBurst(canvas, accentPalette(done), { x: b.left + b.width / 2 - box.left, y: b.top + b.height / 2 - box.top, delayMs: 420 });
		});
		new Notice(`${this.level?.s.name} is now level ${this.nextLevel}.`);
	}

	onClose(): void {
		this.stopShow?.();
		this.contentEl.empty();
	}
}

/** Level up: one level, from the sheet's Camp (or the party editor). */
export class LevelUpWizard extends CharacterWizard {
	constructor(plugin: EmberVaultPlugin, s: CharacterSheet, mutate: LevelTarget['mutate'], fm: Frontmatter = {}, comp?: Compendium) {
		super(plugin, { s, fm, mutate }, null, {}, comp);
	}
}

/** New character: `initial` pre-fills it (a party member is `{ mine: false }`, a name typed elsewhere carries over). */
export class NewCharacterModal extends CharacterWizard {
	constructor(plugin: EmberVaultPlugin, folder?: string, onCreated?: (f: TFile) => void, initial: Partial<NewCharacterOptions> = {}) {
		super(plugin, null, { folder: folder ?? defaultCharacterFolder(plugin), onCreated }, initial);
	}
}
