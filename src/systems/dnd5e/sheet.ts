// The ```5e-sheet block: a 5e character sheet drawn from its note's
// frontmatter (character.ts does the rules). Rolls go through the plugin's dice;
// every change is a frontmatter edit, so the note stays the source of truth and
// the sheet redraws when it changes.
//
// The layout is the design study's (prototypes/design-study, 70-5e-sheets), one
// layout for 2014 and 2024: an oxblood banner (portrait in a gold medallion, the
// name in Garamond small caps, AC in a gold-rimmed shield, Initiative, Speed and
// Proficiency on gold plates, the rests), a framed vitals band overlapping its
// foot (core's HP meter, hit dice or death saves, Passive Perception, size,
// Heroic Inspiration), conditions, six ability plaques with their saves and
// skills, the class's scrollwork heading, then tabs: actions grouped as the book
// groups them, spells by level with their slots, features that open to their
// own words, and the inventory.

import { MarkdownPostProcessorContext, MarkdownRenderChild, Menu, Notice, setIcon, setTooltip, TFile } from 'obsidian';
import {
	addItem, addListEntry, changeHp, cycleSkill, equipsWhenAdded, Frontmatter, longRest, readSheet5e, removeListEntry, setDeathSaves, setExhaustion, setHitDiceLeft, setItem, Sheet5e, SheetItem, SheetSkill, shortRest, useSlot,
} from './character';
import { Hit5e, Spell5e } from './compendium';
import { conditionsFor } from './conditions';
import { asEdition } from './editions';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { openLevelUp5e } from './character-wizard';
import { openCompendium5eModal } from './compendium-modal';
import type { Entry5e } from './compendium-entries';
import { ABILITIES, ABILITY_NAME } from './types';
import { ABILITY_SHORT, ACTION_GROUPS, formatDice, Resource5e, resources5e, restoreUses, setUsesLeft, SheetAction5e, sheetActions5e, slotFor, spellEffect } from './sheet-actions';
import { acShield, corners, damageButton, plateFrame, profMark } from './sheet-parts';
import { classScroll } from './scroll';
import { renderText5e } from './cards';
import { markTerm, termContext, TermContext } from '../../core/rule-term-ui';
import { renderPipRow } from '../../core/pip-row';
import { pill } from '../../core/pill';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';
import { resolvePortrait } from '../../core/npc-card';
import { openHpPad } from '../../core/tracker/hp-pad';
import type { HpCommand } from '../../core/tracker/hp';
import { renderMeter, VitalsMemory } from '../../core/vitals/meter';
import { markSheetPage, unmarkSheetPage } from '../../core/sheet-page';
import { onLongPress } from '../../core/touch';

export const SHEET_LANG = '5e-sheet';
const d20 = (mod: number) => (mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`);
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
/** "Ilse Vane" → "IV". */
const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
/** A five-pointed star (Heroic Inspiration), drawn on a 16 × 15 grid. */
const STAR = 'M8 0l1.9 5.6H16l-4.9 3.6 1.9 5.8L8 11.4 3 15l1.9-5.8L0 5.6h6.1z';

type Tab = 'actions' | 'spells' | 'features' | 'inventory';
/** Each note's open tab and whether its properties show, kept across redraws (and the block being drawn again). */
const tabOf = new Map<string, Tab>();
const propsShownOf = new Map<string, boolean>();
/** Features opened to their text, per note. */
const openFeatures = new Map<string, Set<string>>();

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
		return readSheet5e(fm, edition, this.file?.basename ?? 'Hero', this.rt.homebrew.library(this.path));
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
		const b = parent.createEl('button', { cls: `dnd5e-sheet-roll ${cls}`.trim(), attr: { 'aria-label': `Roll ${label}` } });
		b.createSpan({ text });
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
		const sheet = el.createDiv({ cls: `dnd5e-sheet ed-${s.edition}` });
		applyLook(sheet, 'dnd5e');
		sheet.toggleClass('is-down', s.hp === 0);
		// The sheet is the width container; the page inside it (paper, padding) follows its width.
		const root = sheet.createDiv({ cls: 'dnd5e-sheet-page' });
		this.markPage();
		// A block is drawn before it's attached to the note; mark the page again once it is.
		window.requestAnimationFrame(() => this.markPage());
		const terms = termContext(this.rt.plugin, this.path);

		this.renderBanner(root.createDiv({ cls: 'dnd5e-banner' }), s, terms);
		this.renderBand(root.createDiv({ cls: 'dnd5e-band ev-vitals' }), s, terms);
		this.renderConditions(root.createDiv({ cls: 'dnd5e-conditions-row' }), s, terms);
		this.renderAbilities(root.createDiv({ cls: 'dnd5e-abilities' }), s, terms);
		if (s.className) classScroll(root, s.cls?.name ?? s.className, 'is-in-sheet');
		this.renderTabs(root, s, terms);
	}

	// Banner ---------------------------------------------------------------------

	private renderBanner(banner: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const port = banner.createDiv({ cls: 'dnd5e-port' });
		const pic = port.createDiv({ cls: 'dnd5e-portrait' });
		const portrait = resolvePortrait(this.rt.plugin.app, this.fm, this.path);
		if (portrait) {
			const img = pic.createEl('img', { attr: { src: portrait.src, alt: '', draggable: 'false' } });
			const pos = this.fm['portrait-position'];
			if (typeof pos === 'string' && pos.trim()) img.setCssProps({ '--nimble-portrait-position': pos });
		}
		else pic.createSpan({ cls: 'dnd5e-portrait-initial', text: initials(s.name) });

		const id = banner.createDiv({ cls: 'dnd5e-id' });
		id.createDiv({ cls: 'dnd5e-sheet-name', text: s.name });
		// "Level 5 Elf Wizard (Evoker)": each name opens its compendium card.
		const sub = id.createDiv({ cls: 'dnd5e-sheet-sub' });
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
			const bg = id.createDiv({ cls: 'dnd5e-hero-meta' });
			this.linkCard(bg.createSpan({ text: s.background }), s.background, 'background');
			bg.appendText(' background');
		}

		const acts = banner.createDiv({ cls: 'dnd5e-sheet-actions' });
		const act = (label: string, icon: string, run: () => void, title: string) => {
			const b = pill(acts, { tag: 'button', icon, text: label, cls: 'dnd5e-rest-btn', title });
			b.onclick = (e) => { e.preventDefault(); run(); };
		};
		act('Short rest', evIcon('moon'), () => this.shortRest(s), s.hitDiceLeft ? `Spend a hit die (${s.hitDiceLeft} left)` : 'No hit dice left');
		act('Long rest', evIcon('bed'), () => { this.edit(longRest); new Notice(`${s.name} takes a long rest.`); }, 'Hit points, slots, uses and hit dice back');
		if (s.level < 20) act('Level up', evIcon('arrow-up'), () => this.levelUp(s), `Level ${s.level + 1}`);
		const shown = propsShownOf.get(this.path) ?? false;
		const eye = acts.createEl('button', { cls: `dnd5e-props-btn${shown ? ' is-active' : ''}` });
		setIcon(eye, evIcon(shown ? 'eye' : 'list'));
		setTooltip(eye, shown ? 'Hide properties' : 'Show properties', { delay: 350 });
		eye.onclick = (e) => { e.preventDefault(); propsShownOf.set(this.path, !shown); this.render(); };

		// The numbers you look up most: AC on its shield, then gold plates.
		const crest = banner.createDiv({ cls: 'dnd5e-crest' });
		const ac = crest.createDiv({ cls: 'dnd5e-sheet-box is-ac' });
		acShield(ac, s.ac, 58, `Armor Class ${s.ac} (${s.acFrom})`);
		markTerm(ac.createEl('small', { cls: 'dnd5e-sheet-box-label', text: s.acFrom === 'set by hand' ? 'Armor Class' : s.acFrom }), terms, 'Armor Class');
		// A plate: the gold frame, its number over it (a button when it rolls), its label under it.
		const plate = (key: string, label: string, rule: string, value: string, roll?: () => void, title?: string): HTMLElement => {
			const box = crest.createDiv({ cls: `dnd5e-sheet-box dnd5e-plate is-${key}` });
			const v = box.createSpan({ cls: 'dnd5e-plate-v' });
			plateFrame(v);
			const n = roll ? v.createEl('button', { cls: 'dnd5e-plate-n is-roll', attr: { 'aria-label': title ?? label } }) : v.createSpan({ cls: 'dnd5e-plate-n' });
			n.createSpan({ text: value });
			if (roll) n.onclick = (e) => { e.preventDefault(); roll(); };
			markTerm(box.createEl('small', { cls: 'dnd5e-sheet-box-label', text: label }), terms, rule);
			return box;
		};
		plate('init', 'Initiative', 'Initiative', formatMod(s.initiative), () => this.roll(d20(s.initiative), this.who(s, 'initiative')), `Roll ${this.who(s, 'initiative')}`);
		plate('speed', 'Speed', 'Speed', `${s.speed} ft`);
		plate('prof', 'Proficiency', s.edition === '2014' ? 'Proficiency Bonus' : 'Proficiency', formatMod(s.pb));
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

	// Vitals band ----------------------------------------------------------------

	private renderBand(band: HTMLElement, s: Sheet5e, terms: TermContext): void {
		corners(band);
		const hp = band.createDiv({ cls: 'dnd5e-band-hp' });
		const dead = s.deathSaves.failure >= 3;
		const stable = s.hp === 0 && !dead && s.deathSaves.success >= 3;
		const meter = renderMeter(hp, {
			key: 'hp', cls: 'is-hp', icon: evIcon('heart'), label: 'Hit points', cur: s.hp, max: s.hpMax,
			extra: s.tempHp, extraLabel: `${s.tempHp} temp`,
			state: s.hp > 0 ? undefined : dead ? 'Dead' : stable ? 'Stable' : 'Dying',
			bar: 'dnd5e-sheet-hp', minus: 'Take 1 damage', plus: 'Heal 1',
			calc: `Hit points ${s.hp} of ${s.hpMax}${s.tempHp ? `, ${s.tempHp} temp` : ''}. Damage, heal or temp HP`,
			minusOff: s.hp === 0 && !s.tempHp, plusOff: s.hp >= s.hpMax,
			icons: { minus: evIcon('minus'), plus: evIcon('plus'), calc: evIcon('keypad') },
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
		meter.toggleClass('is-low', pct > 0 && pct <= 0.5);
		const label = meter.querySelector<HTMLElement>('.ns-meter-label span:last-child');
		if (label) markTerm(label, terms, 'Hit Points');

		if (s.hp === 0) {
			// At 0 hit points death saves take the hit dice's place.
			const ds = hp.createDiv({ cls: 'dnd5e-sheet-death' });
			markTerm(ds.createSpan({ cls: 'dnd5e-foot-label', text: 'Death saves' }), terms, s.edition === '2014' ? 'Dropping to 0 Hit Points' : 'Death Saving Throw');
			renderPipRow(ds, { key: `death-ok:${this.path}`, name: 'Successes', label: true, count: s.deathSaves.success, max: 3, cls: 'is-success', set: v => this.edit(fm => setDeathSaves(fm, v, s.deathSaves.failure)) });
			renderPipRow(ds, { key: `death-fail:${this.path}`, name: 'Failures', label: true, count: s.deathSaves.failure, max: 3, cls: 'is-failure', set: v => this.edit(fm => setDeathSaves(fm, s.deathSaves.success, v)) });
			if (!dead && !stable) {
				const r = pill(ds, { tag: 'button', icon: evIcon('d20'), text: 'Roll save', cls: 'dnd5e-sheet-death-roll' });
				r.onclick = (e) => {
					e.preventDefault();
					const n = this.roll('1d20', this.who(s, 'death save'));
					if (n === undefined) return;
					if (n === 20) this.edit(fm => { fm.hp = 1; delete fm.death_saves; });
					else this.edit(fm => setDeathSaves(fm, s.deathSaves.success + (n >= 10 ? 1 : 0), s.deathSaves.failure + (n === 1 ? 2 : n < 10 ? 1 : 0)));
				};
			}
		} else {
			// Hit dice: a filled pip spends one, an empty one gets one back. Short rest rolls one.
			const hd = hp.createDiv({ cls: 'dnd5e-hit-dice' });
			markTerm(hd.createSpan({ cls: 'dnd5e-foot-label', text: 'Hit dice' }), terms, s.edition === '2014' ? 'Hit Points' : 'Hit Point Dice');
			renderPipRow(hd, { key: `hit-dice:${this.path}`, name: 'Hit dice', count: s.hitDiceLeft, max: s.level, cls: 'is-hit-dice', set: n => this.edit((fm, now) => setHitDiceLeft(fm, now, n)) });
			const count = hd.createSpan({ cls: 'dnd5e-foot-count' });
			count.createEl('b', { text: `${s.hitDiceLeft} of ${s.level}` });
			count.createSpan({ cls: 'dnd5e-foot-die', text: ` d${s.hitDie}` });
		}

		// Facts a GM asks for without a roll.
		const facts = band.createDiv({ cls: 'dnd5e-facts' });
		const fact = (label: string, value: string, rule?: string) => {
			const f = facts.createDiv({ cls: 'dnd5e-fact' });
			const l = f.createSpan({ cls: 'dnd5e-fact-label', text: label });
			if (rule) markTerm(l, terms, rule);
			f.createEl('b', { text: value });
		};
		fact('Passive Perception', String(s.passivePerception), 'Passive Perception');
		if (s.size) fact('Size', s.size, 'Size');
		const insp = pill(facts, { tag: 'button', text: 'Heroic Inspiration', cls: `dnd5e-insp${s.inspiration ? ' is-on' : ''}`, title: s.inspiration ? 'Use Heroic Inspiration' : 'Gain Heroic Inspiration', attr: { 'aria-pressed': String(s.inspiration) } });
		// A five-pointed star, hollow until it's earned (no icon set has the book's).
		const icon = createSpan({ cls: 'ev-pill-icon dnd5e-insp-icon', attr: { 'aria-hidden': 'true' } });
		icon.createSvg('svg', { cls: 'dnd5e-insp-star', attr: { viewBox: '-0.7 -0.7 17.4 16.4' } }).createSvg('path', { attr: { d: STAR } });
		insp.prepend(icon);
		insp.onclick = (e) => { e.preventDefault(); this.edit(fm => { if (s.inspiration) delete fm.inspiration; else fm.inspiration = true; }); };
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
		for (const c of s.conditions) {
			const chip = list.createSpan({ cls: 'dnd5e-sheet-condition' });
			markTerm(chip.createSpan({ cls: 'dnd5e-sheet-condition-name', text: c }), terms, c);
			const x = chip.createEl('button', { cls: 'dnd5e-sheet-condition-x', attr: { 'aria-label': `End ${c}` } });
			setIcon(x, evIcon('x'));
			x.onclick = (e) => { e.preventDefault(); this.edit(fm => removeListEntry(fm, 'conditions', c)); };
		}
		if (s.exhaustion) {
			const chip = list.createSpan({ cls: 'dnd5e-sheet-condition is-exhaustion' });
			markTerm(chip.createSpan({ cls: 'dnd5e-sheet-condition-name', text: 'Exhaustion' }), terms, 'Exhaustion');
			renderPipRow(chip, { key: `exhaustion:${this.path}`, name: 'Exhaustion', count: s.exhaustion, max: 6, cls: 'is-exhaustion', set: n => this.edit(fm => setExhaustion(fm, n)) });
		}
		const add = pill(list, { tag: 'button', icon: evIcon('plus'), text: 'Add', cls: 'dnd5e-sheet-condition-add', attr: { 'aria-label': 'Add a condition' } });
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

	/** Six plaques: the name, the modifier large (it rolls a check), the score in a lozenge; then the save and the skills. */
	private renderAbilities(grid: HTMLElement, s: Sheet5e, terms: TermContext): void {
		for (const a of ABILITIES) {
			const box = grid.createDiv({ cls: `dnd5e-sheet-ability is-${a}` });
			corners(box);
			const top = box.createDiv({ cls: 'dnd5e-ability-top' });
			const name = top.createSpan({ cls: 'dnd5e-sheet-ability-name', text: ABILITY_NAME[a] });
			markTerm(name, terms, ABILITY_SHORT[a].toUpperCase());
			this.rollable(top, formatMod(s.mods[a]), d20(s.mods[a]), this.who(s, `${ABILITY_NAME[a]} check`), 'is-mod');
			top.createSpan({ cls: 'dnd5e-sheet-ability-score', text: String(s.scores[a]), attr: { 'aria-label': `${ABILITY_NAME[a]} score ${s.scores[a]}` } });

			const rows = box.createDiv({ cls: 'dnd5e-ability-rows' });
			const save = rows.createDiv({ cls: `dnd5e-sheet-save${s.saves[a].proficient ? ' is-prof' : ''}` });
			profMark(save, s.saves[a].proficient ? 1 : 0);
			markTerm(save.createSpan({ cls: 'dnd5e-row-name', text: 'Save' }), terms, 'Saving Throw');
			this.rollable(save, formatMod(s.saves[a].bonus), d20(s.saves[a].bonus), this.who(s, `${ABILITY_NAME[a]} save`), 'is-bonus');
			for (const k of s.skills.filter(x => x.ability === a)) this.renderSkill(rows, s, k, terms);
		}
	}

	/** A skill: the mark cycles proficiency (none, proficient, expertise), the name says what it is, the bonus rolls. */
	private renderSkill(parent: HTMLElement, s: Sheet5e, k: SheetSkill, terms: TermContext): void {
		const state = k.expertise ? 'expertise' : k.proficient ? 'proficient' : 'not proficient';
		const row = parent.createDiv({ cls: `dnd5e-sheet-skill${k.proficient ? ' is-prof' : ''}${k.expertise ? ' is-expert' : ''}` });
		const dot = profMark(row, k.expertise ? 2 : k.proficient ? 1 : 0, 'button', `${k.name}: ${state}. Change`);
		dot.addClass('dnd5e-skill-dot');
		dot.onclick = (e) => { e.preventDefault(); this.edit(fm => cycleSkill(fm, k.name)); };
		markTerm(row.createSpan({ cls: 'dnd5e-row-name dnd5e-skill-name', text: k.name }), terms, k.name);
		this.rollable(row, formatMod(k.bonus), d20(k.bonus), this.who(s, k.name), 'is-bonus');
	}

	// Tabs ----------------------------------------------------------------------

	private renderTabs(root: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const caster = !!s.spellcasting || s.spells.length > 0;
		const tabs: { id: Tab; label: string }[] = [
			{ id: 'actions', label: 'Actions' },
			...(caster ? [{ id: 'spells' as const, label: 'Spells' }] : []),
			{ id: 'features', label: 'Features' },
			{ id: 'inventory', label: 'Inventory' },
		];
		let current = tabOf.get(this.path) ?? 'actions';
		if (!tabs.some(t => t.id === current)) current = 'actions';
		const bar = root.createDiv({ cls: 'dnd5e-tabs', attr: { role: 'tablist' } });
		for (const t of tabs) {
			const b = pill(bar, { tag: 'button', text: t.label, cls: `dnd5e-tab${t.id === current ? ' is-active' : ''}`, attr: { role: 'tab', 'aria-selected': String(t.id === current), 'data-tab': t.id } });
			b.onclick = (e) => { e.preventDefault(); tabOf.set(this.path, t.id); this.render(); };
		}
		const panel = root.createDiv({ cls: `dnd5e-panel is-${current}`, attr: { role: 'tabpanel' } });
		if (current === 'actions') this.renderActions(panel, s, terms);
		else if (current === 'spells') this.renderSpells(panel, s, terms);
		else if (current === 'features') this.renderFeatures(panel, s);
		else this.renderInventory(panel, s);
	}

	/** A group's heading: small caps over an oxblood rule, with room on the right for its controls. */
	private section(parent: HTMLElement, title: string, terms?: TermContext, rule?: string): { head: HTMLElement; end: HTMLElement } {
		const head = parent.createDiv({ cls: 'dnd5e-sheet-section' });
		const t = head.createSpan({ cls: 'dnd5e-section-title', text: title });
		if (terms && rule) markTerm(t, terms, rule);
		return { head, end: head.createSpan({ cls: 'dnd5e-section-end' }) };
	}

	private renderActions(panel: HTMLElement, s: Sheet5e, terms: TermContext): void {
		const rows = sheetActions5e(s);
		// One grid for every group, so the columns line up down the tab.
		const grid = panel.createDiv({ cls: 'dnd5e-act-grid' });
		if (!rows.some(r => r.group !== 'limited')) {
			this.section(grid, 'Actions', terms, 'Action');
			grid.createDiv({ cls: 'dnd5e-sheet-empty', text: 'Equip a weapon in the inventory to see it here.' });
		} else {
			const head = grid.createDiv({ cls: 'dnd5e-act-row is-head', attr: { 'aria-hidden': 'true' } });
			for (const h of ['Name', 'Range, notes', 'Hit / DC', 'Damage']) head.createSpan({ text: h });
		}
		for (const g of ACTION_GROUPS) {
			const here = rows.filter(r => r.group === g.id);
			if (!here.length) continue;
			this.section(grid, g.label, terms, g.id === 'action' ? 'Action' : g.id === 'bonus' ? 'Bonus Action' : g.id === 'reaction' ? 'Reaction' : undefined);
			for (const r of here) this.renderAction(grid, s, r);
		}
	}

	/** One row: its name, range and notes, then its to-hit (or save DC), then its damage, Cast, or uses. */
	private renderAction(list: HTMLElement, s: Sheet5e, r: SheetAction5e): void {
		const row = list.createDiv({ cls: `dnd5e-sheet-attack dnd5e-act-row is-${r.kind}` });
		const name = row.createSpan({ cls: 'dnd5e-sheet-attack-name', text: r.name });
		if (r.kind === 'weapon') this.linkCard(name, r.name, 'equipment');
		else if (r.kind === 'spell') this.linkCard(name, r.name, 'spell');
		const note = row.createDiv({ cls: 'dnd5e-act-note' });
		note.createSpan({ cls: 'dnd5e-row-meta', text: r.note });
		const hit = row.createDiv({ cls: 'dnd5e-act-hit' });
		const end = row.createDiv({ cls: 'dnd5e-act-end' });
		// A leveled spell that also deals damage (a reaction's Hellish Rebuke): Cast first, its roll or DC in the notes.
		const castFirst = !!(r.damage && r.slotLevel);
		if (castFirst) {
			this.castButton(hit, s, r.slotLevel!, r.name);
			const meta = note.querySelector('.dnd5e-row-meta');
			if (r.hit !== undefined) meta?.appendText(` · ${formatMod(r.hit)} to hit`);
			else if (r.save) meta?.setText(r.note.replace(`${ABILITY_SHORT[r.save.ability]} save`, `DC ${r.save.dc} ${ABILITY_SHORT[r.save.ability]} save`));
		}
		else if (r.hit !== undefined) this.rollable(hit, formatMod(r.hit), d20(r.hit), this.who(s, `${r.name} (attack)`), 'is-hit');
		else if (r.save) pill(hit, { text: `DC ${r.save.dc}`, cls: 'dnd5e-dc', title: `${ABILITY_NAME[r.save.ability]} save, DC ${r.save.dc}` });
		if (r.damage) damageButton(end, r.damage, r.damageType, () => this.roll(r.damage!, this.who(s, `${r.name} damage`)));
		else if (r.slotLevel) this.castButton(end, s, r.slotLevel, r.name);
		else if (r.resource) this.usePips(end, r.resource);
	}

	/** Cast: spends the lowest slot at or above the spell's level. */
	private castButton(parent: HTMLElement, s: Sheet5e, level: number, name: string): HTMLElement {
		const slot = slotFor(s, level);
		const b = pill(parent, { tag: 'button', text: 'Cast', cls: 'dnd5e-cast-btn', title: slot === undefined ? 'No slots left' : slot === level ? `Spend a level ${slot} slot` : `Spend a level ${slot} slot (none left at ${level})` });
		if (slot === undefined) b.setAttr('disabled', 'true');
		b.addEventListener('click', (e) => {
			e.preventDefault();
			if (slot === undefined) return;
			this.edit((fm, now) => useSlot(fm, now, slot, 1));
			new Notice(`${s.name} casts ${name}.`);
		});
		return b;
	}

	private usePips(parent: HTMLElement, r: Resource5e): void {
		renderPipRow(parent, { key: `uses:${this.path}:${r.name}`, name: r.name, count: r.max - r.used, max: r.max, cls: 'is-uses', set: n => this.edit(fm => setUsesLeft(fm, r, n)) });
	}

	private renderSpells(panel: HTMLElement, s: Sheet5e, terms: TermContext): void {
		if (s.spellcasting) {
			const sc = s.spellcasting;
			const cast = panel.createDiv({ cls: 'dnd5e-sheet-cast' });
			const fact = (label: string, rule: string | undefined, fill: (v: HTMLElement) => void) => {
				const f = cast.createDiv({ cls: 'dnd5e-cast-fact' });
				const l = f.createSpan({ cls: 'dnd5e-cast-label', text: label });
				if (rule) markTerm(l, terms, rule);
				fill(f);
			};
			fact('Spellcasting', undefined, v => markTerm(v.createEl('b', { cls: 'dnd5e-cast-value', text: ABILITY_NAME[sc.ability] }), terms, ABILITY_SHORT[sc.ability].toUpperCase()));
			fact('Save DC', undefined, v => { v.createEl('b', { cls: 'dnd5e-cast-value', text: String(sc.dc) }); });
			fact('Spell attack', 'Attack Roll', v => { this.rollable(v, formatMod(sc.attack), d20(sc.attack), this.who(s, 'spell attack'), 'is-hit'); });
		}

		// Spells by level, each level with its slots. A homebrew spell is found through the runtime.
		const spells = s.spells.map(sp => {
			const hit = sp.spell ? undefined : this.rt.findHit(sp.name, this.path, 'spell');
			return { name: sp.name, spell: sp.spell ?? (hit?.kind === 'spell' ? hit.spell : undefined) };
		});
		const levels = new Set<number>([...spells.filter(x => x.spell).map(x => x.spell!.level), ...s.slots.map(x => x.level)]);
		for (const level of [...levels].sort((a, b) => a - b)) {
			const lv = panel.createDiv({ cls: 'dnd5e-spell-level' });
			const { end } = this.section(lv, level === 0 ? 'Cantrips' : `Level ${level}`, terms, level === 0 ? 'Cantrip' : undefined);
			const sl = s.slots.find(x => x.level === level);
			if (sl) {
				const left = sl.max - sl.used;
				const g = end.createDiv({ cls: 'dnd5e-slot-group' });
				// A filled pip spends a slot, an empty one gets one back (core's pips).
				renderPipRow(g, { key: `slots:${this.path}:${sl.level}`, name: `${ordinal(sl.level)} level slots`, count: left, max: sl.max, cls: 'is-slot', set: n => this.edit((fm, sh) => useSlot(fm, sh, sl.level, n < left ? 1 : -1)) });
				g.createSpan({ cls: 'dnd5e-slot-count', text: `${left} of ${sl.max} left` });
			}
			const list = lv.createDiv({ cls: 'dnd5e-spell-list' });
			const here = spells.filter(x => x.spell?.level === level).sort((a, b) => a.name.localeCompare(b.name));
			if (!here.length) list.createDiv({ cls: 'dnd5e-sheet-empty', text: 'No spells of this level.' });
			for (const sp of here) this.renderSpell(list, s, sp.name, sp.spell);
		}
		const unknown = spells.filter(x => !x.spell);
		if (unknown.length) {
			this.section(panel, 'Not in the compendium');
			const list = panel.createDiv({ cls: 'dnd5e-spell-list' });
			for (const sp of unknown) this.renderSpell(list, s, sp.name, undefined);
		}
		if (!s.spells.length && !s.slots.length) panel.createDiv({ cls: 'dnd5e-sheet-empty', text: 'No spells yet.' });
		const add = pill(panel, { tag: 'button', icon: evIcon('plus'), text: 'Add spell', cls: 'dnd5e-sheet-add' });
		add.onclick = (e) => { e.preventDefault(); this.pick('spell', s, (hit) => this.edit(fm => addListEntry(fm, 'spells', hit.name))); };
	}

	/** A spell: its name (the card on hover), Concentration and Ritual marks, what it does, and Cast for a slot. */
	private renderSpell(list: HTMLElement, s: Sheet5e, name: string, spell: Spell5e | undefined): void {
		const row = list.createDiv({ cls: 'dnd5e-sheet-spell' });
		const link = row.createSpan({ cls: 'dnd5e-sheet-spell-name', text: name });
		if (!this.linkCard(link, name, 'spell')) link.addClass('is-unresolved');
		const tags = row.createSpan({ cls: 'dnd5e-spell-tags' });
		if (spell?.concentration) setTooltip(tags.createSpan({ cls: 'dnd5e-sheet-tag', text: 'C' }), 'Concentration', { delay: 350 });
		if (spell?.ritual) setTooltip(tags.createSpan({ cls: 'dnd5e-sheet-tag', text: 'R' }), 'Ritual', { delay: 350 });
		const note: string[] = [];
		if (spell) {
			const fx = spellEffect(spell, s.level);
			note.push(spell.range.replace(/(\d+)\s*feet\b/gi, '$1 ft'));
			if (fx.save && s.spellcasting) note.push(`DC ${s.spellcasting.dc} ${ABILITY_SHORT[fx.save]}`);
			else if (fx.attack && s.spellcasting) note.push(`${formatMod(s.spellcasting.attack)} to hit`);
			if (fx.damage) note.push(`${formatDice(fx.damage)} ${fx.damageType ?? ''}`.trim());
		}
		row.createSpan({ cls: 'dnd5e-row-meta', text: note.join(' · ') });
		const end = row.createDiv({ cls: 'dnd5e-spell-end' });
		if (spell && spell.level > 0 && s.slots.length) this.castButton(end, s, spell.level, name);
		const x = end.createEl('button', { cls: 'dnd5e-sheet-x', attr: { 'aria-label': `Remove ${name}` } });
		setIcon(x, evIcon('x'));
		x.onclick = (e) => { e.preventDefault(); this.edit(fm => removeListEntry(fm, 'spells', name)); };
	}

	/** Features grouped by where they come from; each name opens its row to the feature's own words. */
	private renderFeatures(panel: HTMLElement, s: Sheet5e): void {
		if (!s.cls) panel.createDiv({ cls: 'dnd5e-sheet-empty', text: `No ${s.edition} class called "${s.className}": set class: in the note's properties.` });
		const uses = new Map(resources5e(s).map(r => [r.name.toLowerCase(), r]));
		const opened = openFeatures.get(this.path) ?? new Set<string>();
		openFeatures.set(this.path, opened);
		const groups = new Map<string, typeof s.features>();
		for (const f of s.features) groups.set(f.source, [...(groups.get(f.source) ?? []), f]);
		const card = this.rt.cardOptions(this.path);
		for (const [source, list] of groups) {
			this.section(panel, source === 'Yours' ? 'Your own' : source === 'Feat' ? 'Feats' : source);
			const wrap = panel.createDiv({ cls: 'dnd5e-feature-list' });
			for (const f of list) {
				const id = `${source}:${f.name}`;
				const open = opened.has(id);
				const row = wrap.createDiv({ cls: `dnd5e-sheet-feature${open ? ' is-open' : ''}` });
				const head = row.createDiv({ cls: 'dnd5e-feature-head' });
				const toggle = pill(head, { tag: 'button', icon: evIcon('chevron-right'), text: f.name, cls: 'dnd5e-feature-toggle', attr: { 'aria-expanded': String(open) } });
				if (!f.desc) toggle.setAttr('disabled', 'true');
				const r = uses.get(f.name.replace(/\s*\(\d+\s+uses?\)\s*$/i, '').toLowerCase());
				if (r) this.usePips(head, r);
				if (f.level) head.createSpan({ cls: 'dnd5e-sheet-feature-src', text: `Level ${f.level}` });
				toggle.onclick = (e) => {
					e.preventDefault();
					if (opened.has(id)) opened.delete(id); else opened.add(id);
					this.render();
				};
				if (open && f.desc) renderText5e(row.createDiv({ cls: 'dnd5e-sheet-feature-text' }), f.desc, `${s.name}: ${f.name}`, card);
			}
		}
		// What the character is trained in: the class's armor and weapons, tools, languages, and 2024's weapon masteries.
		const profs: [string, string[]][] = [['Armor and weapons', s.proficiencies], ['Tools', s.tools], ['Languages', s.languages], ['Weapon Mastery', s.masteries]];
		if (profs.some(([, v]) => v.length)) {
			this.section(panel, 'Proficiencies');
			const dl = panel.createDiv({ cls: 'dnd5e-prof-list' });
			for (const [label, values] of profs) {
				if (!values.length) continue;
				const row = dl.createDiv({ cls: 'dnd5e-prof-row' });
				row.createSpan({ cls: 'dnd5e-prof-label', text: label });
				row.createSpan({ cls: 'dnd5e-prof-values', text: values.join(', ') });
			}
		}
	}

	private renderInventory(panel: HTMLElement, s: Sheet5e): void {
		const { end } = this.section(panel, 'Equipment');
		pill(end, { text: `${s.gold} gp`, cls: 'dnd5e-sheet-gold', attr: { 'aria-label': `${s.gold} gold pieces` } });
		const list = panel.createDiv({ cls: 'dnd5e-item-list' });
		if (!s.inventory.length) list.createDiv({ cls: 'dnd5e-sheet-empty', text: 'Nothing carried yet.' });
		for (const it of s.inventory) this.renderItem(list, it);
		const add = pill(panel, { tag: 'button', icon: evIcon('plus'), text: 'Add item', cls: 'dnd5e-sheet-add' });
		add.onclick = (e) => { e.preventDefault(); this.pick('item', s, (hit) => this.edit(fm => addItem(fm, hit.name, { equipped: equipsWhenAdded(hit, s.edition, this.rt.homebrew.library(this.path)) }))); };
	}

	private renderItem(list: HTMLElement, it: SheetItem): void {
		const row = list.createDiv({ cls: `dnd5e-sheet-item${it.equipped ? ' is-equipped' : ''}` });
		const eq = row.createEl('button', { cls: `dnd5e-equip${it.equipped ? ' is-on' : ''}`, attr: { 'aria-pressed': String(it.equipped), 'aria-label': it.equipped ? `Unequip ${it.name}` : `Equip ${it.name}` } });
		setIcon(eq, evIcon(it.equipment?.damage ? 'swords' : it.equipment?.ac ? 'shield' : it.item ? 'sparkle' : 'tag'));
		eq.onclick = (e) => { e.preventDefault(); this.edit(fm => setItem(fm, it.index, { equipped: !it.equipped })); };
		const who = row.createDiv({ cls: 'dnd5e-item-who' });
		const name = who.createSpan({ cls: 'dnd5e-sheet-item-name', text: it.name });
		this.linkCard(name, it.name, it.item ? 'item' : 'equipment');
		const meta = it.equipment
			? [it.equipment.damage ?? '', it.equipment.ac ? `AC ${it.equipment.ac.base}${it.equipment.ac.dex ? ' + Dex' : ''}` : '', it.equipment.weight ? `${it.equipment.weight} lb.` : ''].filter(Boolean).join(' · ')
			: it.item ? [it.item.type, it.item.rarity].filter(Boolean).join(' · ') : '';
		if (meta || it.equipped) {
			const m = who.createDiv({ cls: 'dnd5e-row-meta' });
			if (it.equipped) m.createSpan({ cls: 'dnd5e-equipped-tag', text: 'Equipped' });
			if (meta) m.appendText(it.equipped ? ` · ${meta}` : meta);
		}
		if (it.qty !== 1) row.createSpan({ cls: 'dnd5e-qty', text: `×${it.qty}` });
		const more = row.createEl('button', { cls: 'dnd5e-item-more', attr: { 'aria-label': `${it.name}: more` } });
		setIcon(more, evIcon('more'));
		const menu = (e: MouseEvent | PointerEvent) => {
			e.preventDefault();
			const m = new Menu();
			m.addItem(i => i.setTitle(it.equipped ? 'Unequip' : 'Equip').setIcon(it.equipped ? 'circle' : 'check-circle').onClick(() => this.edit(fm => setItem(fm, it.index, { equipped: !it.equipped }))));
			m.addItem(i => i.setTitle('One more').setIcon('plus').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty + 1 }))));
			m.addItem(i => i.setTitle(it.qty > 1 ? 'One fewer' : 'Remove').setIcon(it.qty > 1 ? 'minus' : 'trash-2').onClick(() => this.edit(fm => setItem(fm, it.index, { qty: it.qty - 1 }))));
			m.showAtMouseEvent(e);
		};
		more.onclick = menu;
		row.addEventListener('contextmenu', menu);
		onLongPress(row, menu);
	}

	/** A short rest: spend a hit die (healing a roll + Con), and the uses a short rest brings back come back. */
	private shortRest(s: Sheet5e): void {
		const backUses = resources5e(s).some(r => r.used && (r.per === 'short' || r.shortOne));
		if (!s.hitDiceLeft) {
			if (backUses) this.edit((fm, sh) => restoreUses(fm, sh, 'short'));
			new Notice(`${s.name} has no hit dice left.`);
			return;
		}
		const mod = s.mods.con;
		const total = this.roll(`1d${s.hitDie}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`, `${s.name}: hit die`);
		if (total === undefined) return;
		this.edit((fm, sh) => { shortRest(fm, sh, 1, Math.max(0, total)); restoreUses(fm, sh, 'short'); });
	}

	/** The level-up wizard: hit points, a subclass when it's time, an increase or a feat, new spells. */
	private levelUp(s: Sheet5e): void {
		const file = this.file;
		if (!file) return;
		openLevelUp5e(this.rt, file, { ...this.fm }, s.edition, s.name);
	}

	/** Add a spell or an item: the compendium, on its Spells tab (the class's own list first) or its items and equipment. */
	private pick(kind: 'spell' | 'item', s: Sheet5e, onPick: (hit: Hit5e) => void): void {
		const cls = s.className;
		const common = { path: this.path, edition: s.edition, pickLabel: 'Add', pick: (e: Entry5e) => { if (e.hit) onPick(e.hit); } };
		if (kind === 'spell') {
			openCompendium5eModal(this.rt, {
				...common, title: `Add a spell to ${s.name}`, segment: 'spells', only: (e) => e.hit?.kind === 'spell',
				prefer: cls ? { label: `${cls} spells`, test: (e) => e.hit?.kind === 'spell' && e.hit.spell.classes.includes(cls) } : undefined,
			});
			return;
		}
		openCompendium5eModal(this.rt, {
			...common, title: `Add an item to ${s.name}`, segment: 'all', segments: ['all', 'items', 'equipment'],
			only: (e) => e.hit?.kind === 'item' || e.hit?.kind === 'equipment', placeholder: 'Search items and equipment… try rarity:rare, weapon:martial',
		});
	}
}
