// The ```5e-sheet block: a 5e character sheet drawn from its note's
// frontmatter (character.ts does the rules). Rolls go through the plugin's dice;
// every change is a frontmatter edit, so the note stays the source of truth and
// the sheet redraws when it changes.
//
// The layout follows the shared sheet language (Nimble's is the benchmark) in
// 5e's book: a hero card (portrait, name, the numbers you look up most, rests),
// hit points as core's meter with the shared keypad, conditions, the six
// abilities each with its save and skills (as the 2024 sheet groups them), then
// tabs for actions, spells, features and inventory.

import { FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownRenderChild, Menu, Notice, setIcon, TFile } from 'obsidian';
import {
	addItem, addListEntry, changeHp, cycleSkill, Frontmatter, longRest, readSheet5e, removeListEntry, setDeathSaves, setExhaustion, setHitDiceLeft, setItem, Sheet5e, SheetItem, SheetSkill, shortRest, useSlot,
} from './character';
import { Hit5e, KIND5E, Spell5e } from './compendium';
import { conditionsFor } from './conditions';
import { asEdition } from './editions';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { openLevelUp5e } from './character-wizard';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';
import { appendWithTerms, markTerm, termContext, TermContext } from '../../core/rule-term-ui';
import { renderPipRow } from '../../core/pip-row';
import { pill } from '../../core/pill';
import { applyLook } from '../../core/look';
import { resolvePortrait } from '../../core/npc-card';
import { dieShape } from '../../core/die-shape';
import { openHpPad } from '../../core/tracker/hp-pad';
import type { HpCommand } from '../../core/tracker/hp';
import { renderMeter, VitalsMemory } from '../../core/vitals/meter';
import { markSheetPage, unmarkSheetPage } from '../../core/sheet-page';

export const SHEET_LANG = '5e-sheet';
const SHORT: Record<AbilityKey, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const d20 = (mod: number) => (mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`);
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

type Tab = 'actions' | 'spells' | 'features' | 'inventory';
/** Each note's open tab and whether its properties show, kept across redraws (and the block being drawn again). */
const tabOf = new Map<string, Tab>();
const propsShownOf = new Map<string, boolean>();

/** The things anyone can do on their turn, as the edition's rules name them (each opens its rule). */
const TURN_ACTIONS: Record<'2014' | '2024', string[]> = {
	'2024': ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize'],
	'2014': ['Attack', 'Cast a Spell', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Ready', 'Search', 'Use an Object'],
};

export class Dnd5eSheet extends MarkdownRenderChild {
	private vitals = new VitalsMemory();
	private view: HTMLElement | null = null;

	constructor(private rt: Dnd5eRuntime, el: HTMLElement, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	private get path(): string { return this.ctx.sourcePath; }

	private get file(): TFile | null {
		return this.rt.plugin.app.vault.getFileByPath(this.path);
	}

	private get fm(): Frontmatter {
		const f = this.file;
		return (f ? this.rt.plugin.app.metadataCache.getFileCache(f)?.frontmatter : undefined) ?? {};
	}

	private sheet(): Sheet5e {
		const fm = this.fm;
		const edition = fm.edition !== undefined ? asEdition(fm.edition as string) : this.rt.edition(this.path);
		return readSheet5e(fm, edition, this.file?.basename ?? 'Hero');
	}

	onload(): void {
		this.registerEvent(this.rt.plugin.app.metadataCache.on('changed', (f) => { if (f.path === this.path) this.render(); }));
		this.render();
	}

	onunload(): void {
		unmarkSheetPage(this.containerEl, this.view);
	}

	/** Change the note's frontmatter; the 'changed' event redraws. */
	private edit(fn: (fm: Frontmatter, s: Sheet5e) => void): void {
		const f = this.file;
		if (!f) return;
		const s = this.sheet();
		void this.rt.plugin.app.fileManager.processFrontMatter(f, (fm: Frontmatter) => fn(fm, s));
	}

	private roll(expression: string, label: string): number | undefined {
		return this.rt.plugin.rollDice(expression, label, 'effect')?.total;
	}

	/** A number that rolls when clicked. */
	private rollable(parent: HTMLElement, text: string, expression: string, label: string, cls = ''): HTMLButtonElement {
		const b = parent.createEl('button', { cls: `dnd5e-sheet-roll ${cls}`.trim(), text, attr: { 'aria-label': `Roll ${label}` } });
		b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.roll(expression, label); };
		return b;
	}

	/** The note's properties show or hide; the sheet is the page's title either way. */
	private markPage(): void {
		this.view = markSheetPage(this.containerEl, propsShownOf.get(this.path) ?? false) ?? this.view;
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		const s = this.sheet();
		const root = el.createDiv({ cls: `dnd5e-sheet ed-${s.edition}` });
		applyLook(root, 'dnd5e');
		root.toggleClass('is-down', s.hp === 0);
		this.markPage();
		// A block is drawn before it's attached to the note; mark the page again once it is.
		window.requestAnimationFrame(() => this.markPage());
		const terms = termContext(this.rt.plugin, this.path);

		this.renderHero(root.createDiv({ cls: 'dnd5e-card dnd5e-hero' }), s, terms);
		this.renderVitals(root.createDiv({ cls: 'dnd5e-card dnd5e-vitals ev-vitals' }), s, terms);
		this.renderConditions(root.createDiv({ cls: 'dnd5e-conditions-row' }), s, terms);
		this.renderAbilities(root.createDiv({ cls: 'dnd5e-card dnd5e-abilities' }), s, terms);
		this.renderTabs(root, s, terms);
	}

	// Hero ---------------------------------------------------------------------

	private renderHero(card: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const mark = <T extends HTMLElement>(el: T, word: string): T => { markTerm(el, terms, word); return el; };
		const top = card.createDiv({ cls: 'dnd5e-hero-top' });
		const pic = top.createDiv({ cls: 'dnd5e-portrait' });
		const portrait = resolvePortrait(this.rt.plugin.app, this.fm, this.path);
		if (portrait) {
			const img = pic.createEl('img', { attr: { src: portrait.src, alt: '', draggable: 'false' } });
			const pos = this.fm['portrait-position'];
			if (typeof pos === 'string' && pos.trim()) img.setCssProps({ '--nimble-portrait-position': pos });
		}
		else pic.createSpan({ cls: 'dnd5e-portrait-initial', text: (s.name.trim()[0] ?? '?').toUpperCase() });

		const titles = top.createDiv({ cls: 'dnd5e-hero-titles' });
		titles.createDiv({ cls: 'dnd5e-sheet-name', text: s.name });
		// "Level 5 Elf Wizard (Evoker)": each name opens its compendium card.
		const sub = titles.createDiv({ cls: 'dnd5e-sheet-sub' });
		sub.appendText(`Level ${s.level}`);
		const part = (text: string, kind: 'species' | 'class' | 'subclass') => {
			if (!text) return;
			sub.appendText(' ');
			const span = sub.createSpan({ text: kind === 'subclass' ? `(${text})` : text });
			this.linkCard(span, text, kind);
		};
		part(s.species, 'species');
		part(s.className || 'No class', 'class');
		part(s.subclass, 'subclass');
		if (s.background) {
			const bg = titles.createDiv({ cls: 'dnd5e-hero-meta' });
			this.linkCard(bg.createSpan({ text: s.background }), s.background, 'background');
			bg.appendText(' background');
		}

		const tools = top.createDiv({ cls: 'dnd5e-hero-tools' });
		const acts = tools.createDiv({ cls: 'dnd5e-sheet-actions' });
		const act = (label: string, icon: string, run: () => void, title: string) => {
			const b = pill(acts, { tag: 'button', icon, text: label, cls: 'dnd5e-rest-btn', attr: { 'aria-label': title } });
			b.onclick = (e) => { e.preventDefault(); run(); };
		};
		act('Short rest', 'coffee', () => this.shortRest(s), `Short rest: spend a hit die (${s.hitDiceLeft} left)`);
		act('Long rest', 'bed', () => { this.edit(longRest); new Notice(`${s.name} takes a long rest.`); }, 'Long rest: hit points, slots and hit dice back');
		if (s.level < 20) act('Level up', 'trending-up', () => this.levelUp(s), `Level up to ${s.level + 1}`);
		const shown = propsShownOf.get(this.path) ?? false;
		const eye = tools.createEl('button', { cls: `clickable-icon dnd5e-props-btn${shown ? ' is-active' : ''}`, attr: { 'aria-label': shown ? 'Hide properties' : 'Show properties' } });
		setIcon(eye, shown ? 'eye-off' : 'list');
		eye.onclick = (e) => { e.preventDefault(); propsShownOf.set(this.path, !shown); this.render(); };

		// The numbers you look up most, as tiles under a gold rule.
		const stats = card.createDiv({ cls: 'dnd5e-stats' });
		const tile = (key: string, short: string, long: string, rule: string, title?: string) => {
			const t = stats.createDiv({ cls: `dnd5e-sheet-box is-${key}`, attr: title ? { 'aria-label': title } : {} });
			const label = t.createDiv({ cls: 'dnd5e-sheet-box-label' });
			const word = mark(label.createSpan({ text: short }), rule);
			if (long) word.createSpan({ cls: 'dnd5e-box-long', text: long });
			return t;
		};
		// Armor Class on a shield.
		const ac = tile('ac', 'AC', '', 'Armor Class', `Armor Class ${s.ac} (${s.acFrom})`);
		const shield = ac.createDiv({ cls: 'dnd5e-sheet-box-value dnd5e-ac-shield' });
		const svg = shield.createSvg('svg', { cls: 'dnd5e-ac-svg', attr: { viewBox: '0 0 40 46', 'aria-hidden': 'true' } });
		svg.createSvg('path', { attr: { d: 'M20 2.5 L36 8 V21 C36 32 29 39.5 20 43.5 C11 39.5 4 32 4 21 V8 Z' } });
		shield.createSpan({ cls: 'dnd5e-ac-num', text: String(s.ac) });
		ac.createDiv({ cls: 'dnd5e-box-note', text: s.acFrom === 'set by hand' ? 'Set by hand' : s.acFrom });
		this.rollable(tile('init', 'Init', 'iative', 'Initiative').createDiv({ cls: 'dnd5e-sheet-box-value' }), formatMod(s.initiative), d20(s.initiative), this.who(s, 'initiative'), 'is-big');
		const speed = tile('speed', 'Speed', '', 'Speed').createDiv({ cls: 'dnd5e-sheet-box-value' });
		speed.appendText(String(s.speed));
		speed.createSpan({ cls: 'dnd5e-unit', text: 'ft.' });
		tile('prof', 'Prof', 'iciency', s.edition === '2014' ? 'Proficiency Bonus' : 'Proficiency').createDiv({ cls: 'dnd5e-sheet-box-value', text: formatMod(s.pb) });
		const insp = tile('insp', 'Insp', 'iration', 'Heroic Inspiration');
		insp.toggleClass('is-on', s.inspiration);
		const t = insp.createEl('button', { cls: `dnd5e-sheet-box-value dnd5e-sheet-toggle${s.inspiration ? ' is-on' : ''}`, attr: { 'aria-pressed': String(s.inspiration), 'aria-label': s.inspiration ? 'Use Heroic Inspiration' : 'Gain Heroic Inspiration' } });
		setIcon(t.createSpan({ cls: 'dnd5e-insp-icon' }), 'sparkles');
		t.onclick = (e) => { e.preventDefault(); this.edit(fm => { if (s.inspiration) delete fm.inspiration; else fm.inspiration = true; }); };
	}

	/** Hover for a compendium card, click to open it (a name the compendium doesn't know stays plain). */
	private linkCard(el: HTMLElement, name: string, kind: 'species' | 'class' | 'subclass' | 'background' | 'spell' | 'item' | 'equipment'): Hit5e | undefined {
		const hit = this.rt.findHit(name, this.path, kind);
		if (!hit) return undefined;
		el.addClass('dnd5e-card-link');
		el.setAttr('role', 'link');
		el.setAttr('tabindex', '0');
		const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.rt.openCard(hit, this.path); };
		el.addEventListener('click', open);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
		this.rt.plugin.hover.attach(el, () => this.rt.hitHover(hit, this.path));
		return hit;
	}

	private who(s: Sheet5e, what: string): string { return `${s.name}: ${what}`; }

	// Hit points ----------------------------------------------------------------

	private renderVitals(card: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const dead = s.deathSaves.failure >= 3;
		const stable = s.hp === 0 && !dead && s.deathSaves.success >= 3;
		const meter = renderMeter(card, {
			key: 'hp', cls: 'is-hp', icon: 'heart', label: 'Hit points', cur: s.hp, max: s.hpMax,
			extra: s.tempHp, extraLabel: `${s.tempHp} temp`,
			state: s.hp > 0 ? undefined : dead ? 'Dead' : stable ? 'Stable' : 'Dying',
			bar: 'dnd5e-sheet-hp', minus: 'Take 1 damage', plus: 'Heal 1',
			calc: `Hit points ${s.hp} of ${s.hpMax}${s.tempHp ? `, ${s.tempHp} temp` : ''}. Damage, heal or temp HP`,
			minusOff: s.hp === 0 && !s.tempHp, plusOff: s.hp >= s.hpMax,
			onCalc: (a) => this.openHpPad(a, s),
			taps: {
				floor: -(s.hp + s.tempHp), soak: s.tempHp,
				commit: (delta) => {
					if (!delta) { this.render(); return; }
					this.edit((fm, now) => changeHp(fm, now, delta > 0 ? { kind: 'heal', amount: delta } : { kind: 'damage', amount: -delta }));
				},
			},
		}, this.vitals);
		const pct = s.hpMax ? s.hp / s.hpMax : 0;
		meter.toggleClass('is-low', pct > 0 && pct <= 0.25);
		const label = meter.querySelector<HTMLElement>('.ns-meter-label span:last-child');
		if (label) markTerm(label, terms, 'Hit Points');

		const foot = card.createDiv({ cls: 'dnd5e-vitals-foot' });
		// Hit dice: a filled pip spends one, an empty one gets one back. Short rest rolls one.
		const hd = foot.createDiv({ cls: 'dnd5e-hit-dice' });
		const hdLabel = hd.createSpan({ cls: 'dnd5e-foot-label', text: 'Hit dice' });
		markTerm(hdLabel, terms, s.edition === '2014' ? 'Hit Points' : 'Hit Point Dice');
		dieShape(hd, s.hitDie, { cls: 'dnd5e-hit-die' }).setAttr('aria-label', `d${s.hitDie}`);
		renderPipRow(hd, { key: `hit-dice:${this.path}`, name: 'Hit dice', count: s.hitDiceLeft, max: s.level, cls: 'is-hit-dice', set: n => this.edit((fm, now) => setHitDiceLeft(fm, now, n)) });
		hd.createSpan({ cls: 'dnd5e-foot-count', text: `${s.hitDiceLeft}/${s.level}` });

		// At 0 hit points: death saves.
		if (s.hp === 0) {
			const ds = foot.createDiv({ cls: 'dnd5e-sheet-death' });
			markTerm(ds.createSpan({ cls: 'dnd5e-foot-label', text: 'Death saves' }), terms, s.edition === '2014' ? 'Dropping to 0 Hit Points' : 'Death Saving Throw');
			renderPipRow(ds, { key: `death-ok:${this.path}`, name: 'Saves', label: true, count: s.deathSaves.success, max: 3, cls: 'is-success', set: v => this.edit(fm => setDeathSaves(fm, v, s.deathSaves.failure)) });
			renderPipRow(ds, { key: `death-fail:${this.path}`, name: 'Fails', label: true, count: s.deathSaves.failure, max: 3, cls: 'is-failure', set: v => this.edit(fm => setDeathSaves(fm, s.deathSaves.success, v)) });
			if (!dead && !stable) {
				const r = pill(ds, { tag: 'button', icon: 'dices', text: 'Roll save', cls: 'dnd5e-sheet-death-roll' });
				r.onclick = (e) => {
					e.preventDefault();
					const n = this.roll('1d20', this.who(s, 'death save'));
					if (n === undefined) return;
					if (n === 20) this.edit(fm => { fm.hp = 1; delete fm.death_saves; });
					else this.edit(fm => setDeathSaves(fm, s.deathSaves.success + (n >= 10 ? 1 : 0), s.deathSaves.failure + (n === 1 ? 2 : n < 10 ? 1 : 0)));
				};
			}
		}
	}

	/** The shared HP keypad: damage (temp HP first; vulnerable doubles, resisted halves), heal, set, temp HP. */
	private openHpPad(anchor: HTMLElement, s: Sheet5e): void {
		const amount = (cmd: HpCommand): number => cmd.kind !== 'damage' ? cmd.amount : cmd.type === 'vulnerable' ? cmd.amount * 2 : cmd.type === 'resisted' ? Math.floor(cmd.amount / 2) : cmd.amount;
		const change = (cmd: HpCommand) => ({ kind: cmd.kind, amount: amount(cmd) });
		openHpPad(anchor, {
			id: `sheet-${this.path}`, label: s.name,
			sub: `${s.hp}/${s.hpMax} HP${s.tempHp ? ` +${s.tempHp} temp` : ''} · AC ${s.ac}`,
			crit: false, mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
			preview: (mode, v, _crit, mod) => {
				if (mode !== 'set' && v <= 0) return '';
				const cmd: HpCommand = mode === 'damage' ? { kind: 'damage', amount: v, type: mod } : { kind: mode, amount: v };
				const after: Frontmatter = { ...this.fm };
				changeHp(after, s, change(cmd));
				const n = amount(cmd);
				if (cmd.kind === 'damage' && s.hp === 0 && n > Math.min(s.tempHp, n)) return '→ a failed death save';
				const hp = typeof after.hp === 'number' ? after.hp : s.hp;
				const temp = typeof after.temp_hp === 'number' ? after.temp_hp : cmd.kind === 'temp' ? n : s.tempHp;
				const took = cmd.kind === 'damage' && cmd.type ? ` · takes ${n} (${cmd.type})` : '';
				return `→ ${hp}/${s.hpMax}${temp ? ` +${temp} temp` : ''}${took}`;
			},
			apply: (cmd) => this.edit((fm, now) => changeHp(fm, now, change(cmd))),
		});
	}

	// Conditions ----------------------------------------------------------------

	private renderConditions(row: HTMLElement, s: Sheet5e, terms: TermContext): void {
		markTerm(row.createSpan({ cls: 'dnd5e-row-label', text: 'Conditions' }), terms, 'Conditions');
		const list = row.createDiv({ cls: 'dnd5e-condition-list' });
		if (!s.conditions.length && !s.exhaustion) list.createSpan({ cls: 'dnd5e-none', text: 'None' });
		for (const c of s.conditions) {
			const chip = list.createSpan({ cls: 'dnd5e-sheet-condition' });
			markTerm(chip.createSpan({ cls: 'dnd5e-sheet-condition-name', text: c }), terms, c);
			const x = chip.createEl('button', { cls: 'dnd5e-sheet-condition-x', attr: { 'aria-label': `End ${c}` } });
			setIcon(x, 'x');
			x.onclick = (e) => { e.preventDefault(); this.edit(fm => removeListEntry(fm, 'conditions', c)); };
		}
		if (s.exhaustion) {
			const chip = list.createSpan({ cls: 'dnd5e-sheet-condition is-exhaustion' });
			markTerm(chip.createSpan({ cls: 'dnd5e-sheet-condition-name', text: 'Exhaustion' }), terms, 'Exhaustion');
			renderPipRow(chip, { key: `exhaustion:${this.path}`, name: 'Exhaustion', count: s.exhaustion, max: 6, cls: 'is-exhaustion', set: n => this.edit(fm => setExhaustion(fm, n)) });
		}
		const add = pill(list, { tag: 'button', icon: 'plus', text: 'Add', cls: 'dnd5e-sheet-condition-add', attr: { 'aria-label': 'Add a condition' } });
		add.onclick = (e) => {
			e.preventDefault();
			const m = new Menu();
			for (const c of conditionsFor(s.edition)) {
				if (c.name === 'Exhaustion') {
					if (s.exhaustion < 6) m.addItem(i => i.setTitle(s.exhaustion ? `Exhaustion ${s.exhaustion + 1}` : 'Exhaustion').onClick(() => this.edit(fm => setExhaustion(fm, s.exhaustion + 1))));
					continue;
				}
				if (s.conditions.some(x => x.toLowerCase() === c.name.toLowerCase())) continue;
				m.addItem(i => i.setTitle(c.name).onClick(() => this.edit(fm => addListEntry(fm, 'conditions', c.name))));
			}
			m.showAtMouseEvent(e);
		};
	}

	// Abilities, saves and skills -----------------------------------------------

	/** Six cards, each the ability's modifier and score, then its save and its skills (the 2024 sheet's grouping). */
	private renderAbilities(card: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const grid = card.createDiv({ cls: 'dnd5e-ability-grid' });
		for (const a of ABILITIES) {
			const box = grid.createDiv({ cls: `dnd5e-sheet-ability is-${a}` });
			const head = box.createDiv({ cls: 'dnd5e-ability-head' });
			this.rollable(head, formatMod(s.mods[a]), d20(s.mods[a]), this.who(s, `${ABILITY_NAME[a]} check`), 'is-mod');
			const names = head.createDiv({ cls: 'dnd5e-ability-names' });
			const name = names.createDiv({ cls: 'dnd5e-sheet-ability-name' });
			// The full name, or STR on narrow sheets.
			const word = name.createSpan();
			word.createSpan({ cls: 'dnd5e-ability-long', text: ABILITY_NAME[a] });
			word.createSpan({ cls: 'dnd5e-ability-short', text: SHORT[a] });
			markTerm(word, terms, SHORT[a]);
			names.createDiv({ cls: 'dnd5e-sheet-ability-score', text: String(s.scores[a]), attr: { 'aria-label': `${ABILITY_NAME[a]} score ${s.scores[a]}` } });

			const rows = box.createDiv({ cls: 'dnd5e-ability-rows' });
			const save = rows.createDiv({ cls: `dnd5e-sheet-save${s.saves[a].proficient ? ' is-prof' : ''}` });
			save.createSpan({ cls: `dnd5e-prof-mark${s.saves[a].proficient ? ' is-prof' : ''}`, attr: { 'aria-label': s.saves[a].proficient ? 'Proficient' : 'Not proficient' } });
			markTerm(save.createSpan({ cls: 'dnd5e-row-name', text: 'Saving throw' }), terms, 'Saving Throw');
			this.rollable(save, formatMod(s.saves[a].bonus), d20(s.saves[a].bonus), this.who(s, `${ABILITY_NAME[a]} save`), 'is-bonus');
			for (const k of s.skills.filter(x => x.ability === a)) this.renderSkill(rows, s, k, terms);
		}
		// Passive scores: what the GM checks without a roll.
		const passives = card.createDiv({ cls: 'dnd5e-passives' });
		const passive = (name: string, value: number, rule?: string) => {
			const p = passives.createDiv({ cls: 'dnd5e-sheet-passive' });
			p.createSpan({ cls: 'dnd5e-passive-value', text: String(value) });
			const label = p.createSpan({ cls: 'dnd5e-passive-name', text: `Passive ${name}` });
			if (rule) markTerm(label, terms, rule);
		};
		passive('Perception', s.passivePerception, 'Passive Perception');
		passive('Insight', s.passiveInsight);
		passive('Investigation', s.passiveInvestigation);
	}

	/** A skill: the mark cycles proficiency (none, proficient, expertise), the name says what it is, the bonus rolls. */
	private renderSkill(parent: HTMLElement, s: Sheet5e, k: SheetSkill, terms: TermContext): void {
		const state = k.expertise ? 'expertise' : k.proficient ? 'proficient' : 'not proficient';
		const row = parent.createDiv({ cls: `dnd5e-sheet-skill${k.proficient ? ' is-prof' : ''}${k.expertise ? ' is-expert' : ''}` });
		const dot = row.createEl('button', { cls: `dnd5e-skill-dot dnd5e-prof-mark${k.expertise ? ' is-expert' : k.proficient ? ' is-prof' : ''}`, attr: { 'aria-label': `${k.name}: ${state}. Change` } });
		dot.onclick = (e) => { e.preventDefault(); this.edit(fm => cycleSkill(fm, k.name)); };
		markTerm(row.createSpan({ cls: 'dnd5e-row-name dnd5e-skill-name', text: k.name }), terms, k.name);
		this.rollable(row, formatMod(k.bonus), d20(k.bonus), this.who(s, k.name), 'is-bonus');
	}

	// Tabs ----------------------------------------------------------------------

	private renderTabs(root: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const caster = !!s.spellcasting || s.spells.length > 0;
		const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
			{ id: 'actions', label: 'Actions', icon: 'swords' },
			...(caster ? [{ id: 'spells' as const, label: 'Spells', icon: 'sparkles', count: s.spells.length }] : []),
			{ id: 'features', label: 'Features', icon: 'scroll-text', count: s.features.length },
			{ id: 'inventory', label: 'Inventory', icon: 'backpack', count: s.inventory.length },
		];
		let current = tabOf.get(this.path) ?? 'actions';
		if (!tabs.some(t => t.id === current)) current = 'actions';
		const bar = root.createDiv({ cls: 'dnd5e-tabs', attr: { role: 'tablist' } });
		for (const t of tabs) {
			const b = pill(bar, { tag: 'button', icon: t.icon, text: t.label, cls: `dnd5e-tab${t.id === current ? ' is-active' : ''}`, attr: { role: 'tab', 'aria-selected': String(t.id === current), 'data-tab': t.id } });
			if (t.count) b.createSpan({ cls: 'dnd5e-tab-count', text: String(t.count) });
			b.onclick = (e) => { e.preventDefault(); tabOf.set(this.path, t.id); this.render(); };
		}
		const panel = root.createDiv({ cls: `dnd5e-panel is-${current}`, attr: { role: 'tabpanel' } });
		if (current === 'actions') this.renderActions(panel, s, terms);
		else if (current === 'spells') this.renderSpells(panel, s, terms);
		else if (current === 'features') this.renderFeatures(panel, s, terms);
		else this.renderInventory(panel, s);
	}

	/** A section heading with the gold rule after it, and room on the right for its controls. */
	private section(parent: HTMLElement, title: string, terms?: TermContext, rule?: string): { head: HTMLElement; end: HTMLElement } {
		const head = parent.createDiv({ cls: 'dnd5e-sheet-section' });
		const t = head.createSpan({ cls: 'dnd5e-section-title', text: title });
		if (terms && rule) markTerm(t, terms, rule);
		head.createSpan({ cls: 'dnd5e-section-rule' });
		return { head, end: head.createSpan({ cls: 'dnd5e-section-end' }) };
	}

	private renderActions(panel: HTMLElement, s: Sheet5e, terms: TermContext): void {
		this.section(panel, 'Attacks', terms, 'Attack');
		const list = panel.createDiv({ cls: 'dnd5e-attacks' });
		if (!s.attacks.length) list.createDiv({ cls: 'dnd5e-sheet-empty', text: 'Equip a weapon in the inventory to see it here.' });
		for (const a of s.attacks) {
			const row = list.createDiv({ cls: 'dnd5e-sheet-attack' });
			const who = row.createDiv({ cls: 'dnd5e-attack-who' });
			const name = who.createSpan({ cls: 'dnd5e-sheet-attack-name', text: a.name });
			this.linkCard(name, a.name, 'equipment');
			const meta = [a.range ? `${a.range} ft.` : '', ...a.properties].filter(Boolean).join(' · ');
			if (meta) who.createDiv({ cls: 'dnd5e-row-meta', text: meta });
			const hit = this.rollable(row, formatMod(a.toHit), d20(a.toHit), this.who(s, `${a.name} (attack)`), 'is-hit');
			hit.setAttr('title', 'To hit');
			const dmg = this.rollable(row, '', a.damage, this.who(s, `${a.name} damage`), 'is-damage');
			dmg.createSpan({ cls: 'dnd5e-dmg-dice', text: a.damage });
			if (a.damageType) { dmg.appendText(' '); dmg.createSpan({ cls: 'dnd5e-dmg-type', text: a.damageType }); }
		}
		if (s.spellcasting) {
			const row = list.createDiv({ cls: 'dnd5e-sheet-attack is-spell' });
			const who = row.createDiv({ cls: 'dnd5e-attack-who' });
			who.createSpan({ cls: 'dnd5e-sheet-attack-name', text: 'Spell attack' });
			who.createDiv({ cls: 'dnd5e-row-meta', text: `${ABILITY_NAME[s.spellcasting.ability]} · save DC ${s.spellcasting.dc}` });
			this.rollable(row, formatMod(s.spellcasting.attack), d20(s.spellcasting.attack), this.who(s, 'spell attack'), 'is-hit');
			row.createSpan({ cls: 'dnd5e-attack-spacer' });
		}

		// What anyone can do on a turn: each opens its rule.
		const known = TURN_ACTIONS[s.edition].filter(a => terms.terms.get(a));
		if (known.length) {
			this.section(panel, 'On your turn', terms, 'Action');
			const chips = panel.createDiv({ cls: 'dnd5e-turn-actions' });
			for (const a of known) markTerm(chips.createSpan({ cls: 'dnd5e-turn-action', text: a }), terms, a);
		}
	}

	private renderSpells(panel: HTMLElement, s: Sheet5e, terms: TermContext): void {
		if (s.spellcasting) {
			const sc = s.spellcasting;
			const cast = panel.createDiv({ cls: 'dnd5e-sheet-cast' });
			const fact = (label: string, fill: (v: HTMLElement) => void) => {
				const f = cast.createDiv({ cls: 'dnd5e-cast-fact' });
				fill(f.createDiv({ cls: 'dnd5e-cast-value' }));
				f.createDiv({ cls: 'dnd5e-cast-label', text: label });
			};
			fact('Spellcasting', v => markTerm(v.createSpan({ text: ABILITY_NAME[sc.ability] }), terms, SHORT[sc.ability]));
			fact('Save DC', v => v.setText(String(sc.dc)));
			fact('Attack', v => this.rollable(v, formatMod(sc.attack), d20(sc.attack), this.who(s, 'spell attack'), 'is-big'));
		}

		// Spells by level, each level with its slots. A homebrew spell is found through the runtime.
		const spells = s.spells.map(sp => {
			const hit = sp.spell ? undefined : this.rt.findHit(sp.name, this.path, 'spell');
			return { name: sp.name, spell: sp.spell ?? (hit?.kind === 'spell' ? hit.spell : undefined) };
		});
		const levels = new Set<number>([...spells.filter(x => x.spell).map(x => x.spell!.level), ...s.slots.map(x => x.level)]);
		for (const level of [...levels].sort((a, b) => a - b)) {
			const { end } = this.section(panel, level === 0 ? 'Cantrips' : `${ordinal(level)} level`, terms, level === 0 ? 'Cantrip' : undefined);
			const sl = s.slots.find(x => x.level === level);
			if (sl) {
				const left = sl.max - sl.used;
				const g = end.createDiv({ cls: 'dnd5e-slot-group' });
				// A filled pip spends a slot, an empty one gets one back (core's pips).
				renderPipRow(g, { key: `slots:${this.path}:${sl.level}`, name: `${ordinal(sl.level)} level slots`, count: left, max: sl.max, cls: 'is-slot', set: n => this.edit((fm, sh) => useSlot(fm, sh, sl.level, n < left ? 1 : -1)) });
				g.createSpan({ cls: 'dnd5e-slot-count', text: `${left}/${sl.max}` });
			}
			const list = panel.createDiv({ cls: 'dnd5e-spell-list' });
			const here = spells.filter(x => x.spell?.level === level).sort((a, b) => a.name.localeCompare(b.name));
			if (!here.length) list.createDiv({ cls: 'dnd5e-sheet-empty', text: 'No spells of this level.' });
			for (const sp of here) this.renderSpell(list, sp.name, sp.spell);
		}
		const unknown = spells.filter(x => !x.spell);
		if (unknown.length) {
			this.section(panel, 'Not in the compendium');
			const list = panel.createDiv({ cls: 'dnd5e-spell-list' });
			for (const sp of unknown) this.renderSpell(list, sp.name, undefined);
		}
		if (!s.spells.length && !s.slots.length) panel.createDiv({ cls: 'dnd5e-sheet-empty', text: 'No spells yet.' });
		const add = pill(panel, { tag: 'button', icon: 'plus', text: 'Add spell', cls: 'dnd5e-sheet-add' });
		add.onclick = (e) => { e.preventDefault(); this.pick('spell', s, (hit) => this.edit(fm => addListEntry(fm, 'spells', hit.name))); };
	}

	private renderSpell(list: HTMLElement, name: string, spell: Spell5e | undefined): void {
		const row = list.createDiv({ cls: 'dnd5e-sheet-spell' });
		const who = row.createDiv({ cls: 'dnd5e-spell-who' });
		const link = who.createSpan({ cls: 'dnd5e-sheet-spell-name', text: name });
		if (!this.linkCard(link, name, 'spell')) link.addClass('is-unresolved');
		if (spell) who.createDiv({ cls: 'dnd5e-row-meta', text: [spell.school, spell.castingTime.split(',')[0], spell.range].filter(Boolean).join(' · ') });
		const tags = row.createDiv({ cls: 'dnd5e-spell-tags' });
		if (spell?.concentration) tags.createSpan({ cls: 'dnd5e-sheet-tag', text: 'C', attr: { 'aria-label': 'Concentration' } });
		if (spell?.ritual) tags.createSpan({ cls: 'dnd5e-sheet-tag', text: 'R', attr: { 'aria-label': 'Ritual' } });
		const x = row.createEl('button', { cls: 'clickable-icon dnd5e-sheet-x', attr: { 'aria-label': `Remove ${name}` } });
		setIcon(x, 'x');
		x.onclick = (e) => { e.preventDefault(); this.edit(fm => removeListEntry(fm, 'spells', name)); };
	}

	private renderFeatures(panel: HTMLElement, s: Sheet5e, terms: TermContext): void {
		if (!s.cls) panel.createDiv({ cls: 'dnd5e-sheet-empty', text: `No ${s.edition} class called "${s.className}": set class: in the note's properties.` });
		// Grouped by where they come from: the class, the subclass, the species, the background, feats, your own.
		const groups = new Map<string, typeof s.features>();
		for (const f of s.features) groups.set(f.source, [...(groups.get(f.source) ?? []), f]);
		for (const [source, list] of groups) {
			this.section(panel, source === 'Yours' ? 'Your own' : source === 'Feat' ? 'Feats' : source);
			const wrap = panel.createDiv({ cls: 'dnd5e-feature-list' });
			for (const f of list) {
				const d = wrap.createEl('details', { cls: 'dnd5e-sheet-feature' });
				const sum = d.createEl('summary');
				sum.createSpan({ cls: 'dnd5e-sheet-feature-name', text: f.name });
				if (f.level) sum.createSpan({ cls: 'dnd5e-sheet-feature-src', text: `Level ${f.level}` });
				if (f.desc) {
					const body = d.createDiv({ cls: 'dnd5e-sheet-feature-text' });
					for (const para of f.desc.split(/\n{2,}/)) appendWithTerms(body.createDiv({ cls: 'dnd5e-feature-para' }), para, terms, { prose: true });
				}
			}
		}
	}

	private renderInventory(panel: HTMLElement, s: Sheet5e): void {
		const { end } = this.section(panel, 'Equipment');
		const gold = end.createSpan({ cls: 'dnd5e-sheet-gold', attr: { 'aria-label': `${s.gold} gold pieces` } });
		setIcon(gold.createSpan({ cls: 'dnd5e-gold-icon' }), 'coins');
		gold.createSpan({ text: `${s.gold} gp` });
		const list = panel.createDiv({ cls: 'dnd5e-item-list' });
		if (!s.inventory.length) list.createDiv({ cls: 'dnd5e-sheet-empty', text: 'Nothing carried yet.' });
		for (const it of s.inventory) this.renderItem(list, it);
		const add = pill(panel, { tag: 'button', icon: 'plus', text: 'Add item', cls: 'dnd5e-sheet-add' });
		add.onclick = (e) => { e.preventDefault(); this.pick('item', s, (hit) => this.edit(fm => addItem(fm, hit.name, { equipped: hit.kind === 'equipment' && !!(hit.equipment.damage || hit.equipment.ac) }))); };
	}

	private renderItem(list: HTMLElement, it: SheetItem): void {
		const row = list.createDiv({ cls: `dnd5e-sheet-item${it.equipped ? ' is-equipped' : ''}` });
		const eq = row.createEl('button', { cls: `dnd5e-equip${it.equipped ? ' is-on' : ''}`, attr: { 'aria-pressed': String(it.equipped), 'aria-label': it.equipped ? `Unequip ${it.name}` : `Equip ${it.name}` } });
		setIcon(eq, it.equipment?.damage ? 'sword' : it.equipment?.ac ? 'shield' : it.item ? 'gem' : 'package');
		eq.onclick = (e) => { e.preventDefault(); this.edit(fm => setItem(fm, it.index, { equipped: !it.equipped })); };
		const who = row.createDiv({ cls: 'dnd5e-item-who' });
		const name = who.createSpan({ cls: 'dnd5e-sheet-item-name', text: it.name });
		this.linkCard(name, it.name, it.item ? 'item' : 'equipment');
		const meta = it.equipment
			? [it.equipment.damage, it.equipment.ac ? `AC ${it.equipment.ac.base}${it.equipment.ac.dex ? ' + Dex' : ''}` : '', it.equipment.weight ? `${it.equipment.weight} lb.` : ''].filter(Boolean).join(' · ')
			: it.item ? [it.item.type, it.item.rarity].filter(Boolean).join(' · ') : '';
		if (meta || it.equipped) {
			const m = who.createDiv({ cls: 'dnd5e-row-meta' });
			if (it.equipped) m.createSpan({ cls: 'dnd5e-equipped-tag', text: 'Equipped' });
			if (meta) m.appendText(it.equipped ? ` · ${meta}` : meta);
		}
		if (it.qty !== 1) row.createSpan({ cls: 'dnd5e-qty', text: `×${it.qty}` });
		const more = row.createEl('button', { cls: 'clickable-icon dnd5e-item-more', attr: { 'aria-label': `${it.name}: more` } });
		setIcon(more, 'more-horizontal');
		more.onclick = (e) => {
			e.preventDefault();
			const m = new Menu();
			m.addItem(i => i.setTitle(it.equipped ? 'Unequip' : 'Equip').setIcon(it.equipped ? 'circle' : 'check-circle').onClick(() => this.edit(fm => setItem(fm, it.index, { equipped: !it.equipped }))));
			m.addItem(i => i.setTitle('One more').setIcon('plus').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty + 1 }))));
			m.addItem(i => i.setTitle(it.qty > 1 ? 'One fewer' : 'Remove').setIcon(it.qty > 1 ? 'minus' : 'trash-2').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty - 1 }))));
			m.showAtMouseEvent(e);
		};
	}

	/** Spend hit dice: one die per click of the prompt, each healing a roll + Con. */
	private shortRest(s: Sheet5e): void {
		if (!s.hitDiceLeft) { new Notice(`${s.name} has no hit dice left.`); return; }
		const mod = s.mods.con;
		const total = this.roll(`1d${s.hitDie}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`, `${s.name}: hit die`);
		if (total === undefined) return;
		this.edit((fm, sh) => shortRest(fm, sh, 1, Math.max(0, total)));
	}

	/** The level-up wizard: hit points, a subclass when it's time, an increase or a feat, new spells. */
	private levelUp(s: Sheet5e): void {
		const file = this.file;
		if (!file) return;
		openLevelUp5e(this.rt, file, { ...this.fm }, s.edition, s.name);
	}

	private pick(kind: 'spell' | 'item', s: Sheet5e, onPick: (hit: Hit5e) => void): void {
		const all = this.rt.hits(s.edition, this.path).filter(h => kind === 'spell' ? h.kind === 'spell' : h.kind === 'item' || h.kind === 'equipment');
		// A caster's own class list first.
		const mine = kind === 'spell' && s.className ? all.filter(h => h.kind === 'spell' && h.spell.classes.includes(s.className)) : [];
		new HitPicker(this.rt, mine.length ? [...mine, ...all.filter(h => !mine.includes(h))] : all, kind === 'spell' ? 'Add a spell…' : 'Add an item…', onPick).open();
	}
}

class HitPicker extends FuzzySuggestModal<Hit5e> {
	constructor(rt: Dnd5eRuntime, private hits: Hit5e[], placeholder: string, private onPick: (hit: Hit5e) => void) {
		super(rt.plugin.app);
		this.setPlaceholder(placeholder);
	}
	getItems(): Hit5e[] { return this.hits; }
	getItemText(h: Hit5e): string { return `${h.name} (${KIND5E[h.kind].label}: ${h.detail})`; }
	onChooseItem(h: Hit5e): void { this.onPick(h); }
}
