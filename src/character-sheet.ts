// The interactive Nimble character sheet. It reads a character note's
// frontmatter (character-def.ts does the rules) and draws the official sheet's
// pieces: stat shields with ▲▼ saves, the HP shield, Armor and Initiative, the
// Wounds track with its skull, the ten-skill strip; then tabs for Actions,
// Features, Spells, Inventory and Notes, and a Rest & Level bar.
//
// Every change goes through app.fileManager.processFrontMatter, so the note
// stays the source of truth; the sheet redraws when the note's metadata
// changes. Every roll goes through plugin.rollDice (3D dice, roll log).
// Note text is only ever set with createEl/setText or appendRichText.

import { App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, Modal, Notice, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Compendium, CompendiumHit, CompendiumKind, nameKey, STATS, StatKey, tierLabel, weaponDamage } from './compendium';
import { compendiumFor } from './compendium-data';
import { renderHitBody, renderRulesText, renderSource } from './compendium-card';
import {
	addCondition, addFeature, addItem, addLanguage, addSpell, adjustResource, applyDamage, CharacterSheet, damageRoll, fieldRest, fmtMod, Frontmatter,
	heal, hitDiceHealing, KnownSpell, readCharacter, regainMana, removeCondition, removeFeature, removeItem, removeLanguage, removeSpell,
	safeRest, setCoins, setEquipped, setField, setHp, setMana, setOverride, setQty, setSave, setSkill, setStat, setTempHp, setWounds,
	SheetFeature, spendMana, spendActions, setActions, endTurn, useReaction, ACTIONS_PER_TURN, Resource, setRolled,
} from './character-def';
import { openHpCalculator, openManaCalculator } from './hp-pad';
import { closePopover } from './popover';
import { confirmAction, isTouch, onLongPress } from './touch';
import { resolvePortrait } from './npc-card';
import type { EncounterCreature } from './types';
import { openSpotlight } from './spotlight';
import { CustomFeatureModal } from './character-modals';
import { RollDialog, RollRequest, Spendable, spendCount } from './roll-dialog';
import { actionCost, EdgeRollResult, ExtraDice } from './roll-def';
import { parseDice } from './dice';
import { heldFaces, resourceRule, spendsOn, startsOn } from './resource-def';
import { dieShape, inkOn, triangleMark } from './die-shape';
import { iconStep, renderActionDots, renderMeter, renderWoundPips, VitalsMemory } from './vitals-ui';
import { LevelUpWizard } from './level-up';

export type SheetTab = 'actions' | 'features' | 'spells' | 'inventory' | 'notes';

/**
 * Anything with more than one step (rests, conditions, coins, languages)
 * opens in a dialog rather than a popover, so it has room to explain itself
 * and works the same with a mouse or a thumb.
 */
class SheetDialog extends Modal {
	constructor(app: App, private heading: string, private build: (el: HTMLElement, close: () => void) => void, private cls = '') {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		this.modalEl.addClass('nimble-sheet-dialog');
		if (this.cls) this.modalEl.addClass(this.cls);
		this.build(this.contentEl, () => this.close());
	}

	onClose(): void { this.contentEl.empty(); }
}

const dialog = (app: App, heading: string, build: (el: HTMLElement, close: () => void) => void, cls = '') => new SheetDialog(app, heading, build, cls).open();

interface SheetState {
	tab: SheetTab;
	editing: boolean;
	open: Set<string>;
	propsShown: boolean;
}

/** Per-note UI state, kept across redraws (a frontmatter change can re-create the block). */
const STATE = new Map<string, SheetState>();
function stateFor(path: string): SheetState {
	let s = STATE.get(path);
	if (!s) STATE.set(path, s = { tab: 'actions', editing: false, open: new Set(), propsShown: false });
	return s;
}

const STAT_NAME: Record<StatKey, string> = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence', WIL: 'Will' };

/** Character notes the sheet can show: `nimble: character` in the frontmatter. */
export function isCharacterNote(plugin: NimbleStatblocksPlugin, file: TFile): boolean {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	return String(fm?.nimble ?? '').toLowerCase().trim() === 'character';
}

export interface SheetOptions {
	/** Shown in the Character panel rather than inside the note: no Properties toggle, a link to the note. */
	inPanel?: boolean;
}

/**
 * Draws the sheet for a note into `root` and keeps it current. Owned by a
 * Component (the code block's render child, or the panel), which unloads it.
 */
export class CharacterSheetRenderer extends Component {
	/** Bars and pips as last drawn (so changes animate), and − / + taps not applied yet. */
	private vitals = new VitalsMemory();
	private sheet!: CharacterSheet;
	private fm: Frontmatter = {};
	private state: SheetState;

	constructor(private plugin: NimbleStatblocksPlugin, private root: HTMLElement, private file: TFile, private opts: SheetOptions = {}) {
		super();
		this.state = stateFor(file.path);
	}

	private get app() { return this.plugin.app; }
	/** The hero's compendium: drafts stay in for a hero who plays a draft class (compendiumFor). */
	private get comp(): Compendium { return compendiumFor(this.fm.class); }

	onload(): void {
		this.render();
		this.registerEvent(this.app.metadataCache.on('changed', (f) => { if (f.path === this.file.path) this.render(); }));
		this.registerEvent(this.app.vault.on('rename', (f, old) => {
			if (old !== this.file.path || !(f instanceof TFile)) return;
			STATE.set(f.path, this.state);
			this.file = f;
			this.render();
		}));
		this.register(() => closePopover());
	}

	// ------------------------------------------------------------------------
	// Data

	private read(): void {
		const fm = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		this.fm = fm ? { ...fm } : {};
		this.sheet = readCharacter(this.fm, this.comp, this.file.basename);
	}

	/** Change the note's frontmatter. `fn` gets the frontmatter and the sheet read from it. */
	async mutate(fn: (fm: Frontmatter, s: CharacterSheet) => void): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm: Frontmatter) => {
				fn(fm, readCharacter(fm, this.comp, this.file.basename));
			});
		} catch (e) {
			console.error('Nimble: could not update the character', e);
			new Notice(`Couldn't update ${this.file.basename}: its properties may not be valid YAML.`);
		}
	}

	/** Roll through the plugin (notice, roll log, 3D dice) with a clear label. */
	private roll(expression: string, what: string, kind: 'attack' | 'effect' = 'effect'): void {
		this.plugin.rollDice(expression, `${this.sheet.name} · ${what}`, kind);
	}

	/**
	 * A stat: a Check (no advantage) or a Save, which starts with the hero's ▲ or ▼
	 * for that stat. The roll dialog opens on Check, with Save one tap away.
	 */
	rollStat(stat: StatKey): void {
		const s = this.sheet;
		const save = s.saves[stat];
		const v = s.stats[stat];
		this.rollWith({
			title: `${s.name} · ${stat} check`,
			dice: { count: 1, sides: 20, modifier: v },
			attack: false,
			mode: 'check',
			modes: [
				{ key: 'check', label: 'Check', title: `${s.name} · ${stat} check`, edge: 0 },
				{
					key: 'save', label: 'Save', title: `${s.name} · ${stat} save`, edge: save === 'adv' ? 1 : save === 'dis' ? -1 : 0, mark: save === 'adv' ? '▲' : save === 'dis' ? '▼' : undefined,
				},
			],
		});
	}

	/** A save or check: d20 + modifier, starting at advantage for a ▲ save and disadvantage for a ▼ one. */
	rollD20(mod: number, what: string, edge: 'adv' | 'dis' | null): void {
		this.rollWith({
			title: `${this.sheet.name} · ${what}`,
			dice: { count: 1, sides: 20, modifier: mod },
			attack: false,
			edge: edge === 'adv' ? 1 : edge === 'dis' ? -1 : 0,
			edgeReason: edge === 'adv' ? `${what.split(' ')[0]} is your ▲ save` : edge === 'dis' ? `${what.split(' ')[0]} is your ▼ save` : undefined,
		});
	}

	/**
	 * Every roll from the sheet goes through here: the roll dialog (advantage,
	 * modifiers, dice to spend), unless it's turned off in settings, then the
	 * plugin's roller. `after` runs once rolled (spend actions, mana, dice).
	 */
	rollWith(r: Omit<RollRequest, 'onRoll'>, after?: (o: { spent: { key: string; count: number }[]; result: EdgeRollResult }) => void): void {
		const run = (o: { edge: number; bonus: number; extras: ExtraDice[]; spent: { key: string; count: number }[]; title?: string }) => {
			const result = this.plugin.rollWithEdge({ dice: r.dice, edge: o.edge, attack: r.attack, bonus: o.bonus, extras: o.extras }, o.title ?? r.title);
			after?.({ spent: o.spent, result });
		};
		if (!this.plugin.settings.rollDialog) {
			const mode = r.modes?.find(m => m.key === r.mode) ?? r.modes?.[0];
			if (mode) { run({ edge: mode.edge, bonus: 0, extras: [], spent: [], title: mode.title }); return; }
			const extras = (r.spendables ?? []).filter(x => x.on && x.available > 0).map(x => ({ sp: x, n: spendCount(x) }));
			run({
				edge: r.edge ?? 0, bonus: 0,
				extras: extras.map(({ sp, n }) => ({ label: sp.label, count: n, sides: sp.sides, faces: sp.faces?.slice(0, n), damageType: sp.damageType, keep: sp.keep })),
				spent: extras.filter(x => !x.sp.keep).map(({ sp, n }) => ({ key: sp.key, count: n })),
			});
			return;
		}
		new RollDialog(this.app, { ...r, onRoll: run }).open();
	}

	/** Dice from class resources that can go into this roll (Judgment Dice on an attack…). */
	private spendablesFor(kind: 'attack' | 'spell' | 'save' | 'check', o: { ranged?: boolean } = {}): Spendable[] {
		const s = this.sheet;
		return s.resources.flatMap((r): Spendable[] => {
			const rule = resourceRule(r.name);
			if (!rule || !r.die || r.current <= 0 || !spendsOn(r.name, kind)) return [];
			// Judgment Dice go on Reach attacks: not a bow shot or a Range spell.
			if (rule.reachOnly && o.ranged) return [];
			return [{
				key: r.name, label: r.name, sides: Number(r.die.replace(/^d/i, '')) || 6, available: r.current,
				on: startsOn(rule, s.conditions), amount: rule.amount, keep: rule.keep, damageType: rule.damageType, note: rule.note,
				faces: rule.rolledWhen === 'gained' ? heldFaces(r.current, r.rolled) : undefined,
			}];
		});
	}

	/** Spend what the roll used: dice from resources, and actions. */
	private afterRoll(actions: number, spent: { key: string; count: number }[], mana = 0): void {
		if (!actions && !spent.length && !mana) return;
		void this.mutate((fm, cur) => {
			for (const x of spent) {
				// Dice held by their faces go in first to last, so the ones left are the rest.
				const r = cur.resources.find(y => y.name === x.key);
				if (r?.rolled?.length && resourceRule(r.name)?.rolledWhen === 'gained') setRolled(fm, r.name, heldFaces(r.current, r.rolled).slice(x.count));
				else adjustResource(fm, cur, x.key, -x.count);
			}
			if (mana) spendMana(fm, cur, mana);
			if (actions) spendActions(fm, cur, actions);
		});
	}

	// ------------------------------------------------------------------------
	// Layout

	render(): void {
		// Redrawing empties the sheet for a moment; the panel or note around it mustn't scroll because of that,
		// and the field you're typing in (edit mode saves each field as you leave it) mustn't lose focus or text.
		const keep = this.holdScroll();
		const focus = this.holdFocus();
		try {
			this.draw();
			// What each field was drawn with, so a redraw can tell text you've typed from what the note says.
			this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(f => { f.dataset.drawn = f.value; });
		} finally {
			keep();
			focus();
		}
	}

	/**
	 * Keep the field you're in across a redraw: its focus, the caret, and anything
	 * typed that isn't saved yet. Fields are found again by their place among the
	 * sheet's fields (the layout doesn't change between redraws of the same mode).
	 */
	private holdFocus(): () => void {
		const root = this.root;
		type Field = HTMLInputElement | HTMLTextAreaElement;
		const isField = (el: Element | null): el is Field => !!el && (el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement));
		const active = root.ownerDocument.activeElement;
		if (!isField(active) || !root.contains(active)) return () => undefined;
		const fields = (): Field[] => [...root.querySelectorAll<Field>('input, textarea')];
		const index = fields().indexOf(active);
		const kind = active.getAttribute('type') ?? active.tagName;
		const typed = active.value !== (active.dataset.drawn ?? active.value) ? active.value : null;
		const caret = safeSelection(active);
		return () => {
			const next = fields()[index];
			if (!next || (next.getAttribute('type') ?? next.tagName) !== kind) return;
			if (typed !== null) next.value = typed;
			next.focus({ preventScroll: true });
			if (caret) {
				try { next.setSelectionRange(caret[0], caret[1]); } catch { /* number inputs have no caret */ }
			}
		};
	}

	/**
	 * Keep whatever scrolls around the sheet where it is across a redraw: the
	 * sheet holds its height while it's rebuilt, then the scroll position goes back.
	 */
	private holdScroll(): () => void {
		const root = this.root;
		const scrollers: { el: HTMLElement; top: number }[] = [];
		for (let el = root.parentElement; el; el = el.parentElement) {
			if (el.scrollTop > 0) scrollers.push({ el, top: el.scrollTop });
		}
		const height = root.offsetHeight;
		if (height) root.setCssProps({ 'min-height': `${height}px` });
		return () => {
			root.setCssProps({ 'min-height': '' });
			for (const x of scrollers) if (x.el.scrollTop !== x.top) x.el.scrollTop = x.top;
		};
	}

	private draw(): void {
		this.read();
		const s = this.sheet;
		const st = this.state;
		const root = this.root;
		root.empty();
		root.addClass('nimble-sheet');
		root.toggleClass('is-editing', st.editing);
		root.toggleClass('is-dying', s.dying);
		root.toggleClass('is-dead', s.dead);
		root.toggleClass('in-panel', !!this.opts.inPanel);
		root.toggleClass('is-touch', isTouch());
		this.applyProps();
		root.setCssProps({ '--ns-class-dice': this.plugin.settings.classDice.color, '--ns-class-dice-ink': inkOn(this.plugin.settings.classDice.color) });
		// A block is drawn before it's attached to the note; apply again once it is.
		window.requestAnimationFrame(() => this.applyProps());

		// The hero card: who they are, with Armor, Initiative and Speed beside.
		const hero = root.createDiv({ cls: 'ns-hero' });
		this.renderHeader(hero.createDiv({ cls: 'ns-head' }));
		// Beside the name: the buttons (Camp, properties, edit) over Armor, Initiative and Speed.
		const side = hero.createDiv({ cls: 'ns-hero-side' });
		const buttons = hero.querySelector('.ns-head-actions');
		if (buttons) side.appendChild(buttons);
		this.renderBoxes(side);
		// Hit points (with Wounds) and mana.
		this.renderMeters(root.createDiv({ cls: 'ns-meters' }));
		// Stats and skills: everything you roll a d20 for.
		const abilities = root.createDiv({ cls: 'ns-abilities' });
		this.renderStats(abilities.createDiv({ cls: 'ns-stats' }));
		this.renderSkills(abilities.createDiv({ cls: 'ns-skills' }));
		// This turn: actions left, Hit Dice and class dice; then conditions.
		const turn = root.createDiv({ cls: 'ns-turn' });
		this.renderActionsCard(turn.createDiv({ cls: 'ns-actions-card' }));
		this.renderStrip(turn.createDiv({ cls: 'ns-strip' }));
		if (this.comp.isEmpty) root.createDiv({ cls: 'ns-empty-note', text: 'The compendium is empty, so classes, items and spells show as plain names.' });
		this.renderTabs(root);
	}

	/** Character notes hide their Properties box (cssclass nimble-sheet-note); the sheet's eye button shows it. */
	private applyProps(): void {
		const leaf = this.root.closest('.workspace-leaf-content');
		leaf?.querySelectorAll('.nimble-sheet-note').forEach(el => el.toggleClass('nimble-show-props', this.state.propsShown));
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: (e: MouseEvent) => void, cls = ''): HTMLButtonElement {
		const b = parent.createEl('button', { cls: `ns-icon-btn clickable-icon ${cls}`.trim(), attr: { 'aria-label': label, title: label } });
		setIcon(b, icon);
		b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
		return b;
	}

	// Header -------------------------------------------------------------------

	private renderHeader(head: HTMLElement): void {
		const s = this.sheet;
		const st = this.state;
		const portrait = resolvePortrait(this.app, this.fm, this.file.path);
		const pic = head.createDiv({ cls: 'ns-portrait' });
		if (portrait) pic.createEl('img', { attr: { src: portrait.src, alt: '', draggable: 'false' } });
		else pic.createSpan({ cls: 'ns-initials', text: initials(s.name) });

		const titles = head.createDiv({ cls: 'ns-titles' });
		if (st.editing) {
			this.renderDetailEditor(titles);
		} else {
			const name = titles.createDiv({ cls: 'ns-name', text: s.name });
			if (this.opts.inPanel) {
				name.addClass('is-link');
				name.setAttr('role', 'link');
				name.setAttr('tabindex', '0');
				name.addEventListener('click', (e) => void this.app.workspace.openLinkText(this.file.path, '', e.metaKey || e.ctrlKey));
			}
			const line = titles.createDiv({ cls: 'ns-line' });
			const bits = [s.ancestry, s.className, `Level ${s.level}`].filter(Boolean);
			line.setText(bits.join(' · '));
			const sub = [s.subclass, s.background].filter(Boolean).join(' · ');
			if (sub) titles.createDiv({ cls: 'ns-sub', text: sub });
			const meta = [s.player ? `Played by ${s.player}` : '', s.size, s.height, s.weight].filter(Boolean).join(' · ');
			if (meta) titles.createDiv({ cls: 'ns-meta', text: meta });
		}

		const actions = head.createDiv({ cls: 'ns-head-actions' });
		// Camp: Field rest, Safe rest and Level up, in one place.
		if (!st.editing) {
			const camp = actions.createEl('button', { cls: 'ns-camp', attr: { 'aria-label': 'Camp: rest or level up' } });
			setIcon(camp.createSpan({ cls: 'ns-camp-icon' }), 'tent');
			camp.createSpan({ cls: 'ns-camp-label', text: 'Camp' });
			camp.addEventListener('click', (e) => { e.stopPropagation(); this.openCamp(); });
		}
		if (!this.opts.inPanel) {
			this.iconButton(actions, st.propsShown ? 'eye-off' : 'list', st.propsShown ? 'Hide properties' : 'Show properties', () => {
				st.propsShown = !st.propsShown;
				this.render();
			}, st.propsShown ? 'is-active' : '');
		}
		this.iconButton(actions, st.editing ? 'check' : 'pencil', st.editing ? 'Done editing' : 'Edit details and stats', () => {
			st.editing = !st.editing;
			this.render();
		}, st.editing ? 'is-active mod-cta' : '');
		// Touch: long-press the header to edit.
		onLongPress(titles, () => { st.editing = !st.editing; this.render(); });
	}

	private renderDetailEditor(parent: HTMLElement): void {
		const s = this.sheet;
		const grid = parent.createDiv({ cls: 'ns-edit-grid' });
		const field = (label: string, key: string, value: string, opts: { list?: string[]; type?: string; wide?: boolean; placeholder?: string } = {}) => {
			const wrap = grid.createEl('label', { cls: `ns-field${opts.wide ? ' is-wide' : ''}` });
			wrap.createSpan({ cls: 'ns-field-label', text: label });
			const input = wrap.createEl('input', { type: opts.type ?? 'text', value, attr: { placeholder: opts.placeholder ?? '', 'data-key': key } });
			if (opts.list?.length) {
				const id = `ns-list-${key}-${Math.random().toString(36).slice(2, 8)}`;
				const dl = wrap.createEl('datalist', { attr: { id } });
				for (const o of opts.list) dl.createEl('option', { attr: { value: o } });
				input.setAttr('list', id);
			}
			input.addEventListener('change', () => {
				const v = input.value.trim();
				void this.mutate(fm => setField(fm, key, v));
			});
			return input;
		};
		field('Name', 'title', s.name === this.file.basename && !this.fm.title ? '' : s.name, { wide: true, placeholder: this.file.basename });
		field('Ancestry', 'ancestry', s.ancestry, { list: this.comp.ancestries.map(a => a.name) });
		field('Class', 'class', s.className, { list: this.comp.classes.map(c => c.name) });
		field('Subclass', 'subclass', s.subclass, { list: (s.cls?.subclasses ?? []).map(x => x.name) });
		field('Level', 'level', String(s.level), { type: 'number' });
		field('Background', 'background', s.background, { list: this.comp.backgrounds.map(b => b.name), wide: true });
		field('Player', 'player', s.player);
		field('Size', 'size', s.size);
		field('Height', 'height', s.height);
		field('Weight', 'weight', s.weight);
		field('Portrait', 'portrait', s.portrait, { wide: true, placeholder: '[[image.png]]' });
	}

	// Stats ---------------------------------------------------------------------

	private renderStats(row: HTMLElement): void {
		const s = this.sheet;
		for (const stat of STATS) {
			const save = s.saves[stat];
			const v = s.stats[stat];
			const cell = row.createDiv({ cls: `ns-stat${save ? ` is-${save}` : ''}` });
			const box = cell.createEl(this.state.editing ? 'div' : 'button', { cls: 'ns-stat-box' });
			const statLabel = box.createSpan({ cls: 'ns-stat-label', text: stat });
			const label = save === 'adv' ? 'with advantage' : save === 'dis' ? 'with disadvantage' : '';
			if (this.state.editing) {
				const input = box.createEl('input', { cls: 'ns-stat-input', type: 'number', value: String(v), attr: { 'aria-label': STAT_NAME[stat] } });
				input.addEventListener('change', () => void this.mutate(fm => setStat(fm, stat, Number(input.value) || 0)));
				// Which save is advantaged (▲) or disadvantaged (▼).
				const tris = box.createDiv({ cls: 'ns-stat-tris' });
				for (const dir of ['up', 'down'] as const) {
					const on = dir === 'up' ? save === 'adv' : save === 'dis';
					const t = tris.createEl('button', { cls: `ns-tri is-${dir}${on ? ' is-on' : ''} is-editable`, text: dir === 'up' ? '▲' : '▼', attr: { 'aria-pressed': String(on), 'aria-label': `${on ? 'Clear' : 'Set'} ${stat} as the ${dir === 'up' ? 'advantaged' : 'disadvantaged'} save` } });
					t.addEventListener('click', () => void this.mutate(fm => setSave(fm, dir === 'up' ? 'adv' : 'dis', on ? 'none' : stat)));
				}
			} else {
				box.createSpan({ cls: 'ns-stat-value', text: fmtMod(v).replace('+0', '0') });
				box.setAttr('aria-label', `${STAT_NAME[stat]} ${fmtMod(v)}. Roll a ${stat} check or save${label ? ` (saves ${label})` : ''}`);
				box.addEventListener('click', () => this.rollStat(stat));
				// ▲ / ▼ marks the advantaged and disadvantaged saves: in the tile's corner, or beside the name on thin sheets.
				if (save) triangleMark(statLabel.createSpan({ cls: 'ns-stat-save', attr: { 'aria-hidden': 'true' } }), save === 'adv' ? 'up' : 'down');
			}
		}
	}

	// HP and mana bars ------------------------------------------------------------

	/**
	 * Hit points and mana as two big bars, each with − and + either side and a
	 * calculator. Tapping the bar opens the calculator too: damage, heal, set or
	 * temp HP; spend, regain or set mana.
	 */
	private renderMeters(wrap: HTMLElement): void {
		const s = this.sheet;
		const hpPct = s.hpMax ? s.hp / s.hpMax : 0;
		const hp = renderMeter(wrap, {
			key: 'hp', cls: 'is-hp', icon: 'heart', label: 'Hit points', cur: s.hp, max: s.hpMax, extra: s.tempHp, extraLabel: `${s.tempHp} temp`,
			state: s.dying ? (s.dead ? 'Dead' : 'Dying') : undefined,
			bar: 'ns-hp', minus: 'Take 1 damage', plus: 'Heal 1', calc: `Hit points ${s.hp} of ${s.hpMax}${s.tempHp ? `, ${s.tempHp} temp` : ''}. Damage, heal or temp HP`,
			minusOff: s.dead, plusOff: s.hp >= s.hpMax,
			onCalc: (a) => this.openHpPad(a),
			// Damage from − works like the calculator: temp HP first, Wounds at 0.
			taps: {
				floor: -(s.hp + s.tempHp), soak: s.tempHp,
				commit: (delta) => {
					if (!delta) { this.render(); return; }
					void this.mutate((fm, now) => {
						if (delta > 0) { heal(fm, now, delta); return; }
						const said = applyDamage(fm, now, -delta, false).filter(e => !/absorbed/.test(e));
						if (said.length) new Notice(`${now.name} ${said.join('; ')}`);
					});
				},
			},
		}, this.vitals);
		hp.toggleClass('is-low', hpPct > 0 && hpPct <= 0.25);
		// Wounds: top right of the Hit points card, or under the bar when it's narrow.
		this.renderWounds(hp);
		if (s.manaMax > 0) {
			renderMeter(wrap, {
				key: 'mana', cls: 'is-mana', icon: 'sparkles', label: 'Mana', cur: s.mana, max: s.manaMax,
				bar: 'ns-mana', minus: 'Spend 1 mana', plus: 'Regain 1 mana', calc: `Mana ${s.mana} of ${s.manaMax}. Spend, regain or set`,
				minusOff: s.mana <= 0, plusOff: s.mana >= s.manaMax,
				onCalc: (a) => openManaCalculator(a, { name: s.name, mana: s.mana, max: s.manaMax }, (cmd) => void this.mutate((fm, cur) => {
					if (cmd.kind === 'spend') spendMana(fm, cur, cmd.amount);
					else if (cmd.kind === 'regain') regainMana(fm, cur, cmd.amount);
					else setMana(fm, cur, cmd.amount);
				})),
				taps: {
					floor: -s.mana,
					commit: (delta) => {
						if (!delta) { this.render(); return; }
						void this.mutate((fm, now) => { if (delta < 0) spendMana(fm, now, -delta); else regainMana(fm, now, delta); });
					},
				},
			}, this.vitals);
		}
	}

	private openHpPad(anchor: HTMLElement): void {
		const s = this.sheet;
		const c: EncounterCreature = {
			id: `sheet-${nameKey(this.file.path)}`, side: 'hero', label: s.name,
			// The pad only reads the monster's name and armor for heroes.
			monster: { name: s.name, armor: 'none', hp: s.hpMax, movement: String(s.speed) },
			currentHp: s.hp, maxHp: s.hpMax, tempHp: s.tempHp, wounds: s.wounds, maxWounds: s.woundsMax, conditions: [],
		};
		openHpCalculator(anchor, c, false, (cmd) => {
			void this.mutate((fm, cur) => {
				if (cmd.kind === 'damage') {
					const ev = applyDamage(fm, cur, cmd.amount, cmd.crit);
					const said = ev.filter(e => !/absorbed/.test(e));
					if (said.length) new Notice(`${cur.name} ${said.join('; ')}`);
				} else if (cmd.kind === 'heal') heal(fm, cur, cmd.amount);
				else if (cmd.kind === 'set') setHp(fm, cur, cmd.amount);
				else if (cmd.kind === 'temp') setTempHp(fm, cmd.amount);
			});
		});
	}

	// Armor, Initiative -----------------------------------------------------------

	private renderBoxes(parent: HTMLElement): void {
		const s = this.sheet;
		const boxes = parent.createDiv({ cls: 'ns-boxes' });
		const box = (label: string, value: string, key: string, onClick?: () => void, title?: string, icon?: string) => {
			const el = boxes.createEl(onClick && !this.state.editing ? 'button' : 'div', { cls: `ns-box ns-box-${key}` });
			const head = el.createDiv({ cls: 'ns-box-label' });
			if (icon) setIcon(head.createSpan({ cls: 'ns-box-icon' }), icon);
			// "Initiative" doesn't fit a narrow tile: "Init" plus the rest, which narrow sheets hide.
			const short = label === 'Initiative' ? 'Init' : label;
			const name = head.createSpan({ text: short });
			if (short !== label) name.createSpan({ cls: 'ns-box-long', text: label.slice(short.length) });
			if (this.state.editing) {
				const input = el.createEl('input', { cls: 'ns-box-input', type: 'number', value: s.set.has(key) ? String(this.fm[key]) : '', attr: { placeholder: value.replace('+', ''), 'aria-label': `${label} (blank: worked out)` } });
				input.addEventListener('change', () => void this.mutate(fm => setOverride(fm, key, input.value.trim() === '' ? undefined : Number(input.value))));
			} else {
				el.createDiv({ cls: 'ns-box-value', text: value });
				if (title) el.setAttr('aria-label', title);
				if (onClick) el.addEventListener('click', onClick);
			}
		};
		box('Armor', String(s.armor), 'armor', undefined, `Armor ${s.armor}`, 'shield');
		box('Initiative', fmtMod(s.initiative), 'initiative', () => this.rollD20(s.initiative, 'Initiative', null), `Initiative ${fmtMod(s.initiative)}. Roll initiative`, 'zap');
		box('Speed', String(s.speed), 'speed', undefined, `Speed ${s.speed}`, 'footprints');
	}

	// Wounds ----------------------------------------------------------------------

	/** Wounds as a row of pips (the last is a skull) in the Hit points header. Tap one to set them. */
	private renderWounds(parent: HTMLElement): void {
		const s = this.sheet;
		const w = renderWoundPips(parent, {
			wounds: s.wounds, max: s.woundsMax, count: !this.state.editing,
			set: (n) => void this.mutate((fm, cur) => setWounds(fm, cur, Math.min(cur.woundsMax, n))),
		}, this.vitals);
		if (this.state.editing) {
			const input = w.createEl('input', { cls: 'ns-wounds-max', type: 'number', value: s.set.has('wounds_max') ? String(this.fm.wounds_max) : '', attr: { placeholder: `Max ${s.woundsMax}`, 'aria-label': 'Max Wounds (blank: worked out)' } });
			input.addEventListener('change', () => void this.mutate(fm => setOverride(fm, 'wounds_max', input.value.trim() === '' ? undefined : Number(input.value))));
		}
	}

	// Actions: three a turn ----------------------------------------------------------------

	/**
	 * Three big dots: the actions left this turn. Tap one to set how many are
	 * left (a fix when something went wrong); attacks, spells and reactions
	 * spend them; End turn fills them back up for the next turn.
	 */
	private renderActionsCard(card: HTMLElement): void {
		const s = this.sheet;
		card.createSpan({ cls: 'ns-chip-label ns-actions-label', text: 'Actions' });
		renderActionDots(card, { count: s.actions, perTurn: ACTIONS_PER_TURN, set: (n) => void this.mutate(fm => setActions(fm, n)) }, this.vitals);
		if (s.reactionsUsed.length) {
			const used = card.createDiv({ cls: 'ns-reactions-used' });
			for (const r of s.reactionsUsed) used.createSpan({ cls: 'ns-reaction-used', text: r });
		}
		const end = card.createEl('button', { cls: 'ns-actions-end', attr: { 'aria-label': `End turn: back to ${ACTIONS_PER_TURN} actions and reactions` } });
		setIcon(end.createSpan({ cls: 'ns-actions-end-icon' }), 'refresh-ccw');
		// "End turn"; thin sheets show just "End" so it fits beside the dots.
		end.createSpan({ text: 'End' }).createSpan({ cls: 'ns-actions-end-long', text: '\u00a0turn' });
		end.addEventListener('click', () => void this.mutate(fm => endTurn(fm)));
	}

	/** Heroic reactions (Core Rules p.15): each costs 1 action, once a round. */
	private renderReactions(panel: HTMLElement): void {
		const s = this.sheet;
		const sec = this.section(panel, 'Reactions');
		const grid = sec.createDiv({ cls: 'ns-reactions' });
		const melee = s.attacks.find(a => !a.ranged);
		const list: { name: string; icon: string; effect: string; run?: () => void }[] = [
			{ name: 'Defend', icon: 'shield', effect: s.armor > 0 ? `−${s.armor} damage from one attack. Crits ignore it.` : `Your armor (0) takes nothing off; wear some to block damage.` },
			{ name: 'Interpose', icon: 'shield-plus', effect: 'Step in and take the hit for a creature within Reach 2.' },
			{ name: 'Opportunity Attack', icon: 'swords', effect: melee ? `${melee.name} with disadvantage as an enemy moves away.` : 'A melee attack with disadvantage as an enemy moves away.',
				run: melee ? () => this.attack(melee.name, melee.expression, { edge: -1, edgeReason: 'Opportunity Attacks have disadvantage', title: `${s.name} · Opportunity Attack (${melee.name})`, actions: 0 }) : undefined },
			{ name: 'Help', icon: 'hand-helping', effect: 'An ally rerolls, if you can explain how you help.' },
		];
		for (const r of list) {
			const used = s.reactionsUsed.some(x => x.toLowerCase() === r.name.toLowerCase());
			const card = grid.createEl('button', { cls: `ns-reaction${used ? ' is-used' : ''}`, attr: { 'aria-label': `${r.name}: 1 action. ${r.effect}` } });
			const top = card.createDiv({ cls: 'ns-reaction-top' });
			setIcon(top.createSpan({ cls: 'ns-reaction-icon' }), r.icon);
			top.createSpan({ cls: 'ns-reaction-name', text: r.name });
			card.createDiv({ cls: 'ns-reaction-effect', text: r.effect });
			card.createSpan({ cls: 'ns-reaction-cost', text: used ? 'Used' : '1 action' });
			card.disabled = used || s.actions < 1;
			card.addEventListener('click', () => {
				// Only once the reaction is actually taken (not used yet this round, an action to spend, the note saved).
				let used = false;
				void this.mutate((fm, cur) => { used = useReaction(fm, cur, r.name); }).then(() => {
					if (!used) return;
					new Notice(`${s.name} uses ${r.name}.`);
					r.run?.();
				});
			});
		}
	}

	// Speed, hit dice, mana, resources, conditions ---------------------------------------

	private renderStrip(strip: HTMLElement): void {
		const s = this.sheet;
		const chip = (cls: string, label: string, value: string, onClick?: (el: HTMLElement) => void, aria?: string) => {
			const el = strip.createEl(onClick ? 'button' : 'div', { cls: `ns-chip ${cls}` });
			el.createSpan({ cls: 'ns-chip-label', text: label });
			el.createSpan({ cls: 'ns-chip-value', text: value });
			if (aria) el.setAttr('aria-label', aria);
			if (onClick) el.addEventListener('click', () => onClick(el));
			return el;
		};
		if (this.state.editing) {
			const edit = (label: string, key: string, current: number) => {
				const el = strip.createEl('label', { cls: 'ns-chip is-edit' });
				el.createSpan({ cls: 'ns-chip-label', text: label });
				const input = el.createEl('input', { type: 'number', value: s.set.has(key) ? String(this.fm[key]) : '', attr: { placeholder: String(current), 'aria-label': `${label} (blank: worked out)` } });
				input.addEventListener('change', () => void this.mutate(fm => setOverride(fm, key, input.value.trim() === '' ? undefined : Number(input.value))));
			};
			edit('Max HP', 'hp_max', s.hpMax);
			edit('Hit die d', 'hit_die', s.hitDie);
			edit('Max hit dice', 'hit_dice_max', s.hitDiceMax);
			edit('Max mana', 'mana_max', s.manaMax);
			return;
		}
		chip('ns-hitdice', 'Hit dice', `${s.hitDice}/${s.hitDiceMax} d${s.hitDie}`, () => this.openFieldRest(), `Hit dice ${s.hitDice} of ${s.hitDiceMax}, d${s.hitDie}. Field rest`);
		for (const r of s.resources) {
			if (r.die && resourceRule(r.name)) this.renderHeldDice(strip, r);
			else this.renderResource(strip, r.name, r.current, r.max, r.die);
		}
		// Conditions get their own row: a tag cloud under the numbers, labelled, so they never get lost among them.
		const host = strip.closest<HTMLElement>('.ns-turn') ?? strip;
		host.parentElement?.querySelector(':scope > .ns-conds-row')?.remove();
		const row = createDiv({ cls: 'ns-conds-row' });
		host.after(row);
		row.createSpan({ cls: 'ns-chip-label ns-conds-label', text: 'Conditions' });
		const conds = row.createDiv({ cls: 'ns-conds' });
		for (const c of s.conditions) {
			const tag = conds.createSpan({ cls: 'ns-cond' });
			const name = tag.createEl('button', { cls: 'ns-cond-name', text: c });
			name.addEventListener('click', () => this.plugin.showConditionInfo(name, c));
			const x = iconStep(tag, 'x', { 'aria-label': `Remove ${c}` }, 'ns-cond-x');
			x.addEventListener('click', () => void this.mutate(fm => removeCondition(fm, c)));
		}
		if (!s.conditions.length) conds.createSpan({ cls: 'ns-conds-none', text: 'None' });
		const add = conds.createEl('button', { cls: 'ns-cond-add', attr: { 'aria-label': 'Add a condition' } });
		setIcon(add, 'plus');
		add.createSpan({ text: 'Add' });
		add.addEventListener('click', () => this.openConditionPicker());
	}

	private renderResource(strip: HTMLElement, name: string, current: number, max: number | undefined, die?: string): void {
		const r = strip.createDiv({ cls: 'ns-res' });
		const label = r.createEl(die ? 'button' : 'span', { cls: 'ns-chip-label', text: die ? `${name} ${die}` : name });
		if (die) {
			label.setAttr('aria-label', `Roll a ${name.replace(/s$/, '')} (${die})`);
			label.addEventListener('click', () => this.roll(`1${die}`, name.replace(/ice$/, 'ie')));
		}
		const minus = iconStep(r, 'minus', { 'aria-label': `${name} −1` });
		if (max !== undefined && max > 0 && max <= 8) {
			const pips = r.createSpan({ cls: 'ns-res-pips' });
			for (let i = 0; i < max; i++) pips.createSpan({ cls: `ns-res-pip${i < current ? ' is-on' : ''}` });
		} else r.createSpan({ cls: 'ns-res-value', text: max !== undefined ? `${current}/${max}` : String(current) });
		const plus = iconStep(r, 'plus', { 'aria-label': `${name} +1` });
		minus.disabled = current <= 0;
		plus.disabled = max !== undefined && current >= max;
		minus.addEventListener('click', () => void this.mutate((fm, cur) => adjustResource(fm, cur, name, -1)));
		plus.addEventListener('click', () => void this.mutate((fm, cur) => adjustResource(fm, cur, name, 1)));
	}

	/**
	 * A pool of class dice, drawn as dice of their size in the class dice colour.
	 * Judgment Dice are a count (rolled with the attack they go into): + and −.
	 * Fury Dice are rolled as you gain them, so they show their faces: + rolls one,
	 * and tapping one changes its face.
	 */
	private renderHeldDice(strip: HTMLElement, res: Resource): void {
		const rule = resourceRule(res.name)!;
		const sides = Number(res.die!.replace(/^d/i, '')) || 6;
		const rolledNow = rule.rolledWhen === 'gained';
		const faces = rolledNow ? heldFaces(res.current, res.rolled) : Array.from({ length: res.current }, () => 0);
		const box = strip.createDiv({ cls: 'ns-res ns-held' });
		box.createSpan({ cls: 'ns-chip-label', text: `${res.name} ${res.die}` });
		const minus = iconStep(box, 'minus', { 'aria-label': `${res.name} −1` });
		const dice = box.createSpan({ cls: 'ns-held-dice' });
		faces.forEach((f, i) => {
			const d = dieShape(dice, sides, { value: f || undefined, cls: rolledNow ? 'is-rolled' : '' });
			if (!rolledNow) {
				// Like any pip: tapping a filled die takes one away.
				d.addClass('is-clickable');
				d.setAttr('role', 'button');
				d.setAttr('tabindex', '0');
				d.setAttr('aria-label', `Remove a ${res.name.replace(/ice$/, 'ie')} (${faces.length} held)`);
				const drop = () => void this.mutate((fm, cur) => adjustResource(fm, cur, res.name, -1));
				d.addEventListener('click', drop);
				d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(); } });
				return;
			}
			d.addClass('is-clickable');
			d.setAttr('role', 'button');
			d.setAttr('tabindex', '0');
			d.setAttr('aria-label', `${res.name}: ${f || 'not rolled'}. Change the face`);
			const edit = () => this.promptNumber(`${res.name} face (1–${sides})`, f || sides, (n) => void this.mutate((fm, cur) => {
				const now = cur.resources.find(y => y.name === res.name);
				const held = heldFaces(now?.current ?? 0, now?.rolled);
				held[i] = Math.max(1, Math.min(sides, Math.round(n)));
				setRolled(fm, res.name, held);
			}));
			d.addEventListener('click', edit);
			d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } });
		});
		// Room left in a capped pool (Combat Dice up to STR): faint outlines.
		if (res.max !== undefined && res.max <= 10) {
			for (let i = faces.length; i < res.max; i++) {
				// Like any pip: tapping an outline adds one (rolled, for dice you roll as you gain them).
				const d = dieShape(dice, sides, { cls: 'is-empty is-clickable' });
				d.setAttr('role', 'button');
				d.setAttr('tabindex', '0');
				d.setAttr('aria-label', rolledNow ? `Roll a ${res.name.replace(/ice$/, 'ie')}` : `Add a ${res.name.replace(/ice$/, 'ie')} (${faces.length} held)`);
				const add = () => { if (rolledNow) this.gainDice(res, 1); else void this.mutate((fm, cur) => adjustResource(fm, cur, res.name, 1)); };
				d.addEventListener('click', add);
				d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
			}
		}
		if (!faces.length && (res.max === undefined || res.max > 10)) dice.createSpan({ cls: 'ns-held-none', text: 'None' });
		const plus = iconStep(box, 'plus', { 'aria-label': rolledNow ? `Roll 1 more ${res.name.replace(/ice$/, 'ie')}` : `${res.name} +1` });
		minus.disabled = !faces.length;
		plus.disabled = res.max !== undefined && faces.length >= res.max;
		minus.addEventListener('click', () => void this.mutate((fm, cur) => {
			if (rolledNow) setRolled(fm, res.name, faces.slice(0, -1));
			else adjustResource(fm, cur, res.name, -1);
		}));
		plus.addEventListener('click', () => {
			if (rolledNow) this.gainDice(res, 1);
			else void this.mutate((fm, cur) => adjustResource(fm, cur, res.name, 1));
		});
	}

	/** Roll `n` dice of a held pool and set them aside. */
	private gainDice(res: Resource, n: number): void {
		const sides = Number(res.die!.replace(/^d/i, '')) || 6;
		const r = this.plugin.rollWithEdge({ dice: { count: n, sides, modifier: 0 }, edge: 0, attack: false }, `${this.sheet.name} · ${res.name}`);
		void this.mutate((fm, cur) => {
			const now = cur.resources.find(y => y.name === res.name);
			const held = heldFaces(now?.current ?? 0, now?.rolled);
			const room = now?.max !== undefined ? Math.max(0, now.max - held.length) : r.kept.length;
			setRolled(fm, res.name, [...held, ...r.kept.slice(0, room)]);
		});
	}

	private openConditionPicker(): void {
		const s = this.sheet;
		dialog(this.app, `Conditions for ${s.name}`, (el, close) => {
			el.addClass('condition-picker');
			const search = el.createEl('input', { type: 'search', cls: 'condition-search', attr: { placeholder: `Condition for ${s.name}…` } });
			const grid = el.createDiv({ cls: 'condition-grid' });
			const draw = () => {
				grid.empty();
				const q = search.value.trim().toLowerCase();
				for (const cond of this.plugin.getAllConditions().filter(x => !x.auto && (!q || x.name.toLowerCase().includes(q)))) {
					const has = s.conditions.some(x => x.toLowerCase() === cond.name.toLowerCase());
					const b = grid.createEl('button', { cls: `condition-option${has ? ' is-applied' : ''}`, text: cond.name, attr: { title: cond.description, 'aria-pressed': String(has) } });
					b.addEventListener('click', () => { close(); void this.mutate(fm => (has ? removeCondition(fm, cond.name) : addCondition(fm, cond.name))); });
				}
			};
			search.addEventListener('input', draw);
			search.addEventListener('keydown', (e) => {
				if (e.key !== 'Enter' || !search.value.trim()) return;
				const first = grid.querySelector<HTMLButtonElement>('button');
				if (first) first.click();
				else { close(); void this.mutate(fm => addCondition(fm, search.value.trim())); }
			});
			draw();
			if (!isTouch()) window.setTimeout(() => search.focus(), 0);
		}, 'ns-condition-dialog');
	}

	/** A small number editor. */
	private promptNumber(label: string, value: number, done: (n: number) => void): void {
		dialog(this.app, label, (el, close) => {
			el.addClass('ns-number-pop');
			const row = el.createDiv({ cls: 'popover-row' });
			const input = row.createEl('input', { type: 'number', value: String(value) });
			const ok = row.createEl('button', { cls: 'mod-cta', text: 'Set' });
			const go = () => { const n = Number(input.value); close(); if (Number.isFinite(n)) done(n); };
			ok.addEventListener('click', go);
			input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
			window.setTimeout(() => { input.focus(); input.select(); }, 0);
		}, 'ns-small-dialog');
	}

	// Skills -----------------------------------------------------------------------

	private renderSkills(row: HTMLElement): void {
		const s = this.sheet;
		for (const sk of s.skills) {
			const cell = row.createEl(this.state.editing ? 'div' : 'button', { cls: 'ns-skill' });
			cell.createSpan({ cls: 'ns-skill-stat', text: sk.stat });
			if (this.state.editing) {
				const step = cell.createDiv({ cls: 'ns-skill-step' });
				const minus = iconStep(step, 'minus', { 'aria-label': `${sk.name} −1 point` });
				step.createSpan({ cls: 'ns-skill-points', text: String(sk.points) });
				const plus = iconStep(step, 'plus', { 'aria-label': `${sk.name} +1 point` });
				minus.addEventListener('click', () => void this.mutate(fm => setSkill(fm, sk.key, sk.points - 1)));
				plus.addEventListener('click', () => void this.mutate(fm => setSkill(fm, sk.key, sk.points + 1)));
			} else {
				cell.createSpan({ cls: 'ns-skill-total', text: fmtMod(sk.total) });
				cell.setAttr('aria-label', `${sk.name} ${fmtMod(sk.total)} (${sk.stat}${sk.points ? ` + ${sk.points}` : ''}). Roll a check`);
				cell.addEventListener('click', () => this.rollD20(sk.total, `${sk.name} check`, null));
			}
			cell.createSpan({ cls: 'ns-skill-name', text: sk.name });
		}
	}

	// Tabs -------------------------------------------------------------------------

	private renderTabs(root: HTMLElement): void {
		const s = this.sheet;
		const st = this.state;
		const tabs: { id: SheetTab; label: string; icon: string; count?: number }[] = [
			{ id: 'actions', label: 'Actions', icon: 'swords' },
			{ id: 'features', label: 'Features', icon: 'sparkles', count: s.features.length },
			...(s.caster || s.spells.length ? [{ id: 'spells' as const, label: 'Spells', icon: 'wand-2', count: s.spells.length }] : []),
			{ id: 'inventory', label: 'Inventory', icon: 'backpack' },
			{ id: 'notes', label: 'Notes', icon: 'notebook-pen' },
		];
		if (!tabs.some(t => t.id === st.tab)) st.tab = 'actions';
		const bar = root.createDiv({ cls: 'ns-tabs', attr: { role: 'tablist' } });
		for (const t of tabs) {
			const b = bar.createEl('button', { cls: `ns-tab${t.id === st.tab ? ' is-active' : ''}`, attr: { role: 'tab', 'aria-selected': String(t.id === st.tab), 'data-tab': t.id } });
			setIcon(b.createSpan({ cls: 'ns-tab-icon' }), t.icon);
			b.createSpan({ cls: 'ns-tab-label', text: t.label });
			if (t.id === 'inventory') b.createSpan({ cls: `ns-tab-count${s.slots.used > s.slots.max ? ' is-over' : ''}`, text: `${s.slots.used}/${s.slots.max}` });
			b.addEventListener('click', () => { st.tab = t.id; this.render(); });
		}
		const panel = root.createDiv({ cls: `ns-panel ns-tabpanel-${st.tab}`, attr: { role: 'tabpanel' } });
		switch (st.tab) {
			case 'actions': this.renderActions(panel); break;
			case 'features': this.renderFeatures(panel); break;
			case 'spells': this.renderSpells(panel); break;
			case 'inventory': this.renderInventory(panel); break;
			case 'notes': this.renderNotes(panel); break;
		}
	}

	private section(panel: HTMLElement, title: string, add?: { label: string; run: () => void }): HTMLElement {
		const sec = panel.createDiv({ cls: 'ns-section' });
		const head = sec.createDiv({ cls: 'ns-section-head' });
		head.createSpan({ cls: 'ns-section-title', text: title });
		if (add) {
			const b = head.createEl('button', { cls: 'ns-add' });
			setIcon(b.createSpan(), 'plus');
			b.createSpan({ text: add.label });
			b.addEventListener('click', add.run);
		}
		return sec.createDiv({ cls: 'ns-rows' });
	}

	/**
	 * A row that expands to show its compendium text. `key` keeps it open across
	 * redraws. `right` builds the row's buttons (roll, cast, steppers…).
	 */
	private row(parent: HTMLElement, key: string, o: {
		name: string; tags?: string[]; detail?: string; cls?: string;
		body?: (el: HTMLElement) => void; right?: (el: HTMLElement) => void; lead?: (el: HTMLElement) => void;
	}): HTMLElement {
		const open = this.state.open.has(key);
		const row = parent.createDiv({ cls: `ns-row${open ? ' is-open' : ''}${o.cls ? ` ${o.cls}` : ''}` });
		const main = row.createDiv({ cls: 'ns-row-main' });
		o.lead?.(main);
		const toggle = main.createEl('button', { cls: 'ns-row-toggle', attr: { 'aria-expanded': String(open) } });
		const title = toggle.createDiv({ cls: 'ns-row-title' });
		title.createSpan({ cls: 'ns-row-name', text: o.name });
		for (const t of o.tags ?? []) if (t) title.createSpan({ cls: `ns-tag${t === 'Draft' ? ' is-draft' : ''}`, text: t });
		if (o.detail) toggle.createDiv({ cls: 'ns-row-detail', text: o.detail });
		if (o.body) {
			const chev = main.createSpan({ cls: 'ns-row-chev', attr: { 'aria-hidden': 'true' } });
			setIcon(chev, 'chevron-down');
		}
		toggle.addEventListener('click', () => {
			if (!o.body) return;
			if (open) this.state.open.delete(key); else this.state.open.add(key);
			this.render();
		});
		if (o.right) o.right(main.createDiv({ cls: 'ns-row-right' }));
		if (open && o.body) o.body(row.createDiv({ cls: 'ns-row-body' }));
		return row;
	}

	private richOpts() {
		return {
			onDice: (el: HTMLElement, expr: string) => {
				el.addClass('is-clickable');
				el.setAttr('role', 'button');
				el.setAttr('tabindex', '0');
				el.addEventListener('click', (e) => { e.stopPropagation(); this.roll(expr, el.closest('.ns-row')?.querySelector('.ns-row-name')?.textContent ?? 'Roll'); });
			},
			keywords: this.plugin.conditionKeywords(),
			onKeyword: (el: HTMLElement, word: string) => {
				el.addClass('nimble-condition-ref');
				el.addEventListener('click', (e) => { e.stopPropagation(); this.plugin.showConditionInfo(el, word); });
			},
		};
	}

	private rollButton(parent: HTMLElement, label: string, aria: string, run: () => void, cls = ''): HTMLButtonElement {
		const b = parent.createEl('button', { cls: `ns-roll ${cls}`.trim(), attr: { 'aria-label': aria, title: aria } });
		setIcon(b.createSpan({ cls: 'ns-roll-icon' }), 'dices');
		b.createSpan({ text: label });
		b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
		return b;
	}

	// Actions -------------------------------------------------------------------------

	private renderActions(panel: HTMLElement): void {
		const s = this.sheet;
		this.renderReactions(panel);
		const weapons = this.section(panel, 'Weapons', { label: 'Item', run: () => this.addFromCompendium(['item']) });
		if (!s.attacks.length) weapons.createDiv({ cls: 'ns-none', text: 'No weapons. Add one from the compendium, or carry something with a damage roll.' });
		for (const a of s.attacks) {
			const e = s.inventory.find(x => x.index === a.inventoryIndex);
			this.row(weapons, `w:${a.inventoryIndex}:${a.name}`, {
				name: a.name, detail: a.detail, cls: 'is-weapon',
				body: e?.item ? (el) => renderHitBody(el, this.hitFor('item', e.item!.name) ?? fakeHit('item', a.name), this.richOpts()) : undefined,
				right: (el) => this.rollButton(el, a.expression, `Attack with ${a.name}: ${a.expression}`, () => this.attack(a.name, a.expression, { ranged: a.ranged }), 'is-attack'),
			});
		}

		if (s.caster) {
			const castable = s.spells.filter(sp => sp.cost <= Math.max(s.mana, 0) || sp.cost === 0);
			const sec = this.section(panel, 'Spells you can cast');
			if (!castable.length) sec.createDiv({ cls: 'ns-none', text: s.spells.length ? 'Not enough mana for any of your spells.' : 'No spells yet.' });
			for (const sp of castable) this.spellRow(sec, sp, 'a');
		}

		const acts = s.features.filter(f => isActionFeature(f));
		if (acts.length) {
			const sec = this.section(panel, 'Abilities');
			for (const f of acts) this.featureRow(sec, f, 'a');
		}
	}

	// Features -------------------------------------------------------------------------

	private renderFeatures(panel: HTMLElement): void {
		const s = this.sheet;
		const groups: [string, SheetFeature[]][] = [];
		const by = new Map<string, SheetFeature[]>();
		for (const f of s.features) {
			const g = f.group === 'Chosen' ? (f.optionGroup ?? 'Chosen') : f.group === 'Class' ? `${s.className || 'Class'}` : f.group === 'Subclass' ? (s.subclass || 'Subclass') : f.group === 'Ancestry' ? (s.ancestry || 'Ancestry') : f.group === 'Background' ? 'Background' : 'Your abilities';
			if (!by.has(g)) { by.set(g, []); groups.push([g, by.get(g)!]); }
			by.get(g)!.push(f);
		}
		const top = panel.createDiv({ cls: 'ns-panel-actions' });
		const add = top.createEl('button', { cls: 'ns-add is-big' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: 'Add feature' });
		add.addEventListener('click', () => this.addFeaturePicker());
		const custom = top.createEl('button', { cls: 'ns-add' });
		setIcon(custom.createSpan(), 'pen-line');
		custom.createSpan({ text: 'Custom ability' });
		custom.addEventListener('click', () => new CustomFeatureModal(this.app, (f) => void this.mutate(fm => addFeature(fm, f))).open());
		if (!groups.length) panel.createDiv({ cls: 'ns-none', text: 'Pick a class and ancestry (pencil above) to see their features here.' });
		for (const [g, list] of groups) {
			const sec = this.section(panel, g);
			for (const f of list) this.featureRow(sec, f, 'f');
		}
	}

	private featureRow(parent: HTMLElement, f: SheetFeature, prefix: string): void {
		const removable = f.index !== undefined;
		this.row(parent, `${prefix}:${f.group}:${f.name}`, {
			name: f.name,
			tags: [f.level ? `Lvl ${f.level}` : '', f.cost ?? '', f.draft ? 'Draft' : ''],
			cls: `is-feature group-${f.group.toLowerCase()}`,
			body: (el) => {
				if (f.text) renderRulesText(el, f.text, this.richOpts());
				else el.createDiv({ cls: 'ns-none', text: 'No text. Write it in the note\'s features list as {name, text}.' });
				renderSource(el, f);
				if (removable) {
					const row = el.createDiv({ cls: 'ns-row-actions' });
					const rm = row.createEl('button', { cls: 'ns-remove', text: 'Remove' });
					rm.addEventListener('click', () => void this.mutate(fm => removeFeature(fm, { index: f.index, name: f.name })));
				}
			},
		});
	}

	private addFeaturePicker(): void {
		const s = this.sheet;
		const groups = new Set(this.comp.optionGroups(s.className, s.subclass).map(g => nameKey(g.name)));
		const taken = new Set(s.features.map(f => nameKey(f.name)));
		openSpotlight(this.plugin, {
			kinds: ['feature', 'boon'],
			title: `Add a feature to ${s.name}`,
			prefer: (h) => !!h.group && groups.has(nameKey(h.group)) && nameKey(h.className ?? '') === nameKey(s.className),
			preferLabel: s.cls?.optionGroups?.[0]?.name ?? 'Your class',
			isTaken: (h) => taken.has(nameKey(h.name)),
			onPick: (h) => void this.mutate(fm => addFeature(fm, h.name)).then(() => new Notice(`${h.name} added to ${s.name}`)),
		});
	}

	// Spells ---------------------------------------------------------------------------

	private renderSpells(panel: HTMLElement): void {
		const s = this.sheet;
		const top = panel.createDiv({ cls: 'ns-panel-actions' });
		const add = top.createEl('button', { cls: 'ns-add is-big' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: 'Add spell' });
		add.addEventListener('click', () => this.addFromCompendium(['spell']));
		if (s.manaMax > 0) top.createSpan({ cls: 'ns-panel-note', text: `${s.mana} / ${s.manaMax} mana · tier ${s.maxTier} spells` });
		else if (s.cls?.casting) top.createSpan({ cls: 'ns-panel-note', text: s.maxTier ? `Up to tier ${s.maxTier}` : 'Cantrips only for now' });
		if (!s.spells.length) { panel.createDiv({ cls: 'ns-none', text: 'No spells known.' }); return; }
		const bySchool = new Map<string, KnownSpell[]>();
		for (const sp of s.spells) {
			const k = sp.school || 'Other';
			if (!bySchool.has(k)) bySchool.set(k, []);
			bySchool.get(k)!.push(sp);
		}
		for (const [school, list] of bySchool) {
			const sec = this.section(panel, `${school} spells`);
			for (const sp of [...list].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))) this.spellRow(sec, sp, 's');
		}
	}

	private spellRow(parent: HTMLElement, sp: KnownSpell, prefix: string): void {
		const s = this.sheet;
		const spell = sp.spell;
		const short = spell ? [spell.actions, spell.range, spell.damage].filter(Boolean).join(' · ') : 'Not in the compendium';
		this.row(parent, `${prefix}:sp:${sp.name}`, {
			name: sp.name,
			tags: [tierLabel(sp.tier), sp.cost ? `${sp.cost} mana` : '', spell?.concentration ? 'Conc.' : '', spell?.draft ? 'Draft' : ''],
			detail: short,
			cls: `is-spell tier-${sp.tier}`,
			body: (el) => {
				if (spell) renderHitBody(el, this.hitFor('spell', sp.name) ?? fakeHit('spell', sp.name), this.richOpts());
				if (!sp.granted) {
					const row = el.createDiv({ cls: 'ns-row-actions' });
					const rm = row.createEl('button', { cls: 'ns-remove', text: 'Forget spell' });
					rm.addEventListener('click', () => void this.mutate(fm => removeSpell(fm, sp.name)));
				}
			},
			right: (el) => {
				const can = sp.cost <= s.mana;
				const b = this.rollButton(el, spell?.damage ? 'Cast' : 'Cast', `Cast ${sp.name}${sp.cost ? ` (${sp.cost} mana)` : ''}`, () => this.cast(sp), 'is-cast');
				b.toggleClass('is-short', !can);
				if (!can) b.setAttr('title', `Needs ${sp.cost} mana (you have ${s.mana})`);
			},
		});
	}

	/** A weapon attack: the roll dialog, then 1 action and any dice spent on it. */
	attack(name: string, expression: string, o: { edge?: number; edgeReason?: string; title?: string; actions?: number; ranged?: boolean } = {}): void {
		const dice = parseDice(expression);
		if (!dice) { this.roll(expression, name, 'attack'); return; }
		const actions = o.actions ?? 1;
		this.rollWith({
			title: o.title ?? `${this.sheet.name} · ${name}`, dice, attack: true, edge: o.edge, edgeReason: o.edgeReason,
			cost: actions ? `${actions} action${actions === 1 ? '' : 's'}` : undefined,
			spendables: this.spendablesFor('attack', { ranged: o.ranged }),
		}, ({ spent }) => this.afterRoll(actions, spent));
	}

	/** Cast: the roll dialog for its damage, then its mana and actions (spell attacks crit and miss like weapons). */
	private cast(sp: KnownSpell): void {
		const s = this.sheet;
		if (sp.cost > s.mana) { new Notice(`${sp.name} needs ${sp.cost} mana; ${s.name} has ${s.mana}.`); return; }
		const actions = actionCost(sp.spell?.actions);
		const dmg = damageRoll(sp.spell?.damage, s);
		const dice = dmg?.expression ? parseDice(dmg.expression) : null;
		const cost = [actions ? `${actions} action${actions === 1 ? '' : 's'}` : '', sp.cost ? `${sp.cost} mana` : ''].filter(Boolean).join(' · ');
		if (dice) {
			// Spells that deal damage are attacks (a 1 misses, max crits) unless the target saves for half.
			const save = /\bsave\b/i.test(`${sp.spell?.damage ?? ''} ${sp.spell?.text ?? ''}`);
			this.rollWith({ title: `${s.name} · ${sp.name}`, dice, attack: !save, cost, spendables: this.spendablesFor('spell', { ranged: /^range\b/i.test(sp.spell?.range ?? '') }) },
				({ spent }) => this.afterRoll(actions, spent, sp.cost));
			return;
		}
		new Notice(`${s.name} casts ${sp.name}${dmg?.flat !== undefined ? `: ${dmg.flat} damage` : ''}${cost ? ` (${cost})` : ''}`);
		this.afterRoll(actions, [], sp.cost);
	}

	// Inventory ------------------------------------------------------------------------

	private renderInventory(panel: HTMLElement): void {
		const s = this.sheet;
		const head = panel.createDiv({ cls: 'ns-inv-head' });
		const slots = head.createDiv({ cls: `ns-slots${s.slots.used > s.slots.max ? ' is-over' : ''}` });
		slots.createSpan({ cls: 'ns-chip-label', text: 'Slots' });
		const bar = slots.createDiv({ cls: 'ns-slots-bar' });
		bar.createDiv({ cls: 'ns-slots-fill' }).setCssProps({ '--ns-fill': `${Math.min(100, Math.round((s.slots.used / Math.max(1, s.slots.max)) * 100))}%` });
		slots.createSpan({ cls: 'ns-slots-text', text: `${s.slots.used} / ${s.slots.max}` });
		const coins = head.createDiv({ cls: 'ns-coins' });
		for (const coin of ['gp', 'sp', 'cp'] as const) {
			const c = coins.createEl('button', { cls: `ns-coin is-${coin}`, attr: { 'aria-label': `${coin.toUpperCase()}: ${s[coin]}. Change` } });
			c.createSpan({ cls: 'ns-coin-value', text: String(s[coin]) });
			c.createSpan({ cls: 'ns-coin-label', text: coin });
			c.addEventListener('click', () => this.promptCoins(coin));
		}
		const top = panel.createDiv({ cls: 'ns-panel-actions' });
		const add = top.createEl('button', { cls: 'ns-add is-big' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: 'Add item' });
		add.addEventListener('click', () => this.addFromCompendium(['item']));
		const rows = panel.createDiv({ cls: 'ns-rows' });
		if (!s.inventory.length) rows.createDiv({ cls: 'ns-none', text: 'Nothing carried.' });
		for (const e of s.inventory) {
			const ref = { index: e.index, name: e.name };
			const it = e.item;
			const wearable = !!it && (it.category === 'armor' || it.category === 'shield' || it.category === 'weapon' || !!it.armor);
			this.row(rows, `i:${e.index}:${e.name}`, {
				name: e.name,
				tags: [e.equipped ? 'Equipped' : '', it?.draft ? 'Draft' : ''],
				detail: [it ? (it.damage ? weaponDamage(it) : it.armor ? `${it.armor} armor` : it.category ?? '') : 'Your own item', e.note ?? '', `${e.slotsUsed} slot${e.slotsUsed === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
				cls: `is-item${e.equipped ? ' is-equipped' : ''}`,
				lead: wearable || e.equipped ? (el) => {
					const eq = el.createEl('button', { cls: `ns-equip${e.equipped ? ' is-on' : ''}`, attr: { 'aria-pressed': String(e.equipped), 'aria-label': e.equipped ? `Unequip ${e.name}` : `Equip ${e.name}`, title: e.equipped ? 'Equipped' : 'Not equipped' } });
					setIcon(eq, it?.category === 'shield' ? 'shield' : it?.category === 'weapon' ? 'sword' : 'shirt');
					eq.addEventListener('click', (ev) => { ev.stopPropagation(); void this.mutate(fm => setEquipped(fm, ref, !e.equipped)); });
				} : (el) => el.createSpan({ cls: 'ns-equip-spacer' }),
				body: (el) => {
					const hit = it ? this.hitFor('item', it.name) : undefined;
					if (hit) renderHitBody(el, hit, this.richOpts());
					else el.createDiv({ cls: 'ns-none', text: 'Your own item. Add a note in the frontmatter: {name, qty, note}.' });
					const row = el.createDiv({ cls: 'ns-row-actions' });
					const rm = row.createEl('button', { cls: 'ns-remove', text: 'Remove' });
					rm.addEventListener('click', () => void this.mutate(fm => removeItem(fm, ref)));
				},
				right: (el) => {
					const step = el.createDiv({ cls: 'ns-qty' });
					const minus = iconStep(step, 'minus', { 'aria-label': `One fewer ${e.name}` });
					step.createSpan({ cls: 'ns-qty-n', text: String(e.qty) });
					const plus = iconStep(step, 'plus', { 'aria-label': `One more ${e.name}` });
					minus.addEventListener('click', (ev) => {
						ev.stopPropagation();
						void (async () => {
							if (e.qty <= 1 && !(await confirmAction(this.app, `Remove ${e.name}?`, '', 'Remove', true))) return;
							await this.mutate(fm => setQty(fm, ref, e.qty - 1));
						})();
					});
					plus.addEventListener('click', (ev) => { ev.stopPropagation(); void this.mutate(fm => setQty(fm, ref, e.qty + 1)); });
				},
			});
		}
	}

	private promptCoins(coin: 'gp' | 'sp' | 'cp'): void {
		const cur = this.sheet[coin];
		const names = { gp: 'Gold', sp: 'Silver', cp: 'Copper' };
		dialog(this.app, `${names[coin]}: ${cur} ${coin}`, (el, close) => {
			el.addClass('ns-number-pop');
			const row = el.createDiv({ cls: 'popover-row' });
			const input = row.createEl('input', { type: 'number', attr: { placeholder: 'Amount' } });
			const apply = (sign: 1 | -1 | 0) => {
				const n = Math.abs(Number(input.value) || 0);
				close();
				void this.mutate(fm => setCoins(fm, coin, sign === 0 ? n : cur + sign * n));
			};
			const buttons = el.createDiv({ cls: 'popover-row ns-coin-buttons' });
			for (const [label, sign] of [['Spend', -1], ['Gain', 1], ['Set', 0]] as const) {
				const b = buttons.createEl('button', { text: label, cls: sign === 1 ? 'mod-cta' : '' });
				b.addEventListener('click', () => apply(sign));
			}
			input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(1); });
			window.setTimeout(() => input.focus(), 0);
		}, 'ns-small-dialog');
	}

	// Notes ------------------------------------------------------------------------------

	private renderNotes(panel: HTMLElement): void {
		const s = this.sheet;
		const langs = this.section(panel, `Languages · ${s.languages.length} of ${s.languagesMax}`);
		const chips = langs.createDiv({ cls: 'ns-langs' });
		for (const l of s.languages) {
			const tag = chips.createSpan({ cls: 'ns-lang' });
			tag.createSpan({ text: l });
			const x = iconStep(tag, 'x', { 'aria-label': `Remove ${l}` }, 'ns-cond-x');
			x.addEventListener('click', () => void this.mutate((fm, cur) => removeLanguage(fm, cur, l)));
		}
		const add = chips.createEl('button', { cls: 'ns-cond-add', attr: { 'aria-label': 'Add a language' } });
		setIcon(add, 'plus');
		add.addEventListener('click', () => this.promptLanguage());

		const details = this.section(panel, 'Details');
		const grid = details.createDiv({ cls: 'ns-details' });
		const d = (label: string, value: string) => { if (!value) return; const r = grid.createDiv({ cls: 'ns-detail' }); r.createSpan({ cls: 'ns-detail-label', text: label }); r.createSpan({ text: value }); };
		d('Player', s.player);
		d('Size', s.size);
		d('Height', s.height);
		d('Weight', s.weight);
		d('Speed', String(s.speed));
		d('Background', s.background);
		if (!grid.childElementCount) grid.createDiv({ cls: 'ns-none', text: 'Use the pencil to fill in size, height, weight and more.' });

		const notes = this.section(panel, 'In this note');
		const headings = (this.app.metadataCache.getFileCache(this.file)?.headings ?? []).filter(h => h.level <= 3);
		if (!headings.length) notes.createDiv({ cls: 'ns-none', text: 'Write your backstory and notes under headings in this note; they\'ll be listed here.' });
		for (const h of headings) {
			const b = notes.createEl('button', { cls: 'ns-jump' });
			setIcon(b.createSpan(), 'hash');
			b.createSpan({ text: h.heading });
			b.addEventListener('click', (e) => void this.app.workspace.openLinkText(`${this.file.path}#${h.heading}`, '', e.metaKey || e.ctrlKey));
		}
	}

	private promptLanguage(): void {
		const known = new Set(this.sheet.languages.map(l => l.toLowerCase()));
		dialog(this.app, 'Add a language', (el, close) => {
			el.addClass('ns-lang-pop');
			const input = el.createEl('input', { type: 'text', attr: { placeholder: 'Language' } });
			const grid = el.createDiv({ cls: 'condition-grid' });
			for (const l of this.comp.rules.languages ?? []) {
				if (known.has(l.name.toLowerCase())) continue;
				const b = grid.createEl('button', { cls: 'condition-option', text: l.name, attr: { title: l.speakers ?? '' } });
				b.addEventListener('click', () => { close(); void this.mutate((fm, cur) => addLanguage(fm, cur, l.name)); });
			}
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && input.value.trim()) { const v = input.value.trim(); close(); void this.mutate((fm, cur) => addLanguage(fm, cur, v)); }
			});
			if (!isTouch()) window.setTimeout(() => input.focus(), 0);
		}, 'ns-small-dialog');
	}

	// Rest & level --------------------------------------------------------------------

	/**
	 * Camp: three cards. Field rest shows the Hit Dice you can spend (as dice),
	 * Safe rest what it would bring back, Level up the level you'd reach.
	 */
	private openCamp(): void {
		const s = this.sheet;
		dialog(this.app, 'Camp', (el, close) => {
			const grid = el.createDiv({ cls: 'ns-camp-grid' });
			const card = (cls: string, icon: string, title: string, run: () => void, disabled = false) => {
				const b = grid.createEl('button', { cls: `ns-camp-card ${cls}`, attr: { 'aria-label': title } });
				b.disabled = disabled;
				const head = b.createDiv({ cls: 'ns-camp-card-head' });
				setIcon(head.createDiv({ cls: 'ns-camp-card-icon' }), icon);
				head.createDiv({ cls: 'ns-camp-card-title', text: title });
				b.addEventListener('click', () => { close(); run(); });
				return b.createDiv({ cls: 'ns-camp-card-body' });
			};

			// Field rest: the Hit Dice, spent ones as outlines.
			const field = card('is-field', 'flame-kindling', 'Field rest', () => this.openFieldRest(), s.hitDice <= 0);
			const dice = field.createDiv({ cls: 'ns-camp-dice' });
			const shown = Math.min(s.hitDiceMax, 8);
			for (let i = 0; i < shown; i++) dieShape(dice, s.hitDie, { cls: i < s.hitDice ? '' : 'is-empty' });
			if (s.hitDiceMax > shown) dice.createSpan({ cls: 'ns-camp-more', text: `+${s.hitDiceMax - shown}` });
			field.createDiv({ cls: 'ns-camp-line', text: s.hitDice ? `${s.hitDice} of ${s.hitDiceMax} d${s.hitDie} Hit Dice` : 'No Hit Dice left' });

			// Safe rest: only what would change.
			const safe = card('is-safe', 'bed-double', 'Safe rest', () => this.doSafeRest());
			const changes: [string, string, string][] = [];
			if (s.hp < s.hpMax) changes.push(['heart', 'HP', `${s.hp} → ${s.hpMax}`]);
			if (s.manaMax > 0 && s.mana < s.manaMax) changes.push(['sparkles', 'Mana', `${s.mana} → ${s.manaMax}`]);
			if (s.hitDice < s.hitDiceMax) changes.push(['dices', 'Hit Dice', `${s.hitDice} → ${s.hitDiceMax}`]);
			if (s.wounds > 0) changes.push(['droplet', 'Wounds', `${s.wounds} → ${s.wounds - 1}`]);
			if (changes.length) {
				const list = safe.createDiv({ cls: 'ns-camp-changes' });
				for (const [ic, label, value] of changes) {
					const row = list.createDiv({ cls: 'ns-camp-change' });
					setIcon(row.createSpan({ cls: 'ns-camp-change-icon' }), ic);
					row.createSpan({ cls: 'ns-camp-change-label', text: label });
					row.createSpan({ cls: 'ns-camp-change-value', text: value });
				}
			} else safe.createDiv({ cls: 'ns-camp-line', text: 'Already fully rested' });

			// Level up: where you'd get to.
			const max = s.level >= 20;
			const level = card('is-level', 'biceps-flexed', 'Level up',
				() => new LevelUpWizard(this.plugin, readCharacter(this.fm, this.comp, this.file.basename), (fn) => this.mutate(fn)).open(), max);
			const big = level.createDiv({ cls: 'ns-camp-levels' });
			big.createSpan({ cls: 'ns-camp-level-from', text: String(s.level) });
			setIcon(big.createSpan({ cls: 'ns-camp-level-arrow' }), 'arrow-right');
			big.createSpan({ cls: 'ns-camp-level-to', text: max ? '—' : String(s.level + 1) });
			level.createDiv({ cls: 'ns-camp-line', text: max ? 'Level 20 is the most' : `${s.className || 'Hero'} level ${s.level + 1}` });
		}, 'ns-camp-dialog');
	}

	/** Safe rest: show what comes back before it happens. */
	private doSafeRest(): void {
		const s = this.sheet;
		dialog(this.app, `Safe rest for ${s.name}`, (el, close) => {
			const list = el.createDiv({ cls: 'ns-rest-changes' });
			const line = (label: string, from: string, to: string) => {
				const r = list.createDiv({ cls: `ns-rest-change${from === to ? ' is-same' : ''}` });
				r.createSpan({ cls: 'ns-rest-label', text: label });
				r.createSpan({ cls: 'ns-rest-from', text: from });
				setIcon(r.createSpan({ cls: 'ns-rest-arrow' }), 'arrow-right');
				r.createSpan({ cls: 'ns-rest-to', text: to });
			};
			line('Hit points', `${s.hp}/${s.hpMax}`, `${s.hpMax}/${s.hpMax}`);
			if (s.tempHp) line('Temp HP', String(s.tempHp), '0');
			line('Hit Dice', `${s.hitDice}/${s.hitDiceMax}`, `${s.hitDiceMax}/${s.hitDiceMax}`);
			if (s.manaMax > 0) line('Mana', `${s.mana}/${s.manaMax}`, `${s.manaMax}/${s.manaMax}`);
			line('Wounds', String(s.wounds), String(Math.max(0, s.wounds - 1)));
			if (s.resources.length) el.createDiv({ cls: 'ns-dialog-note', text: `${s.resources.map(r => r.name).join(', ')} reset too.` });
			const bar = el.createDiv({ cls: 'modal-button-container' });
			bar.createEl('button', { text: 'Cancel' }).addEventListener('click', close);
			const go = bar.createEl('button', { cls: 'mod-cta', text: 'Rest' });
			go.addEventListener('click', () => {
				close();
				void this.mutate((fm, cur) => safeRest(fm, cur)).then(() => new Notice(`${s.name} is rested.`));
			});
			window.setTimeout(() => go.focus(), 0);
		}, 'ns-small-dialog');
	}

	/** Field rest: spend Hit Dice. Roll them (each + STR), or take the max when making camp. */
	private openFieldRest(): void {
		const s = this.sheet;
		let n = Math.min(1, s.hitDice);
		dialog(this.app, `Field rest for ${s.name}`, (el, close) => {
			el.addClass('ns-rest-pop');
			el.createDiv({ cls: 'popover-body', text: `Spend Hit Dice to heal: each d${s.hitDie} ${s.stats.STR >= 0 ? '+' : '−'} ${Math.abs(s.stats.STR)} (STR). ${s.hitDice} of ${s.hitDiceMax} left.` });
			const row = el.createDiv({ cls: 'popover-row ns-rest-row' });
			const minus = iconStep(row, 'minus', { 'aria-label': 'One fewer die' });
			const count = row.createSpan({ cls: 'ns-rest-n' });
			const plus = iconStep(row, 'plus', { 'aria-label': 'One more die' });
			const buttons = el.createDiv({ cls: 'popover-row ns-rest-actions' });
			const roll = buttons.createEl('button', { cls: 'mod-cta' });
			const camp = buttons.createEl('button', { attr: { title: 'At least 8 hours with food and sleep: each die counts as its max' } });
			const draw = () => {
				count.setText(`${n} × d${s.hitDie}`);
				minus.disabled = n <= 1;
				plus.disabled = n >= s.hitDice;
				roll.setText(`Roll ${n}d${s.hitDie}`);
				camp.setText(`Make camp (+${n * Math.max(0, s.hitDie + s.stats.STR)})`);
				roll.disabled = camp.disabled = !s.hitDice;
			};
			minus.addEventListener('click', () => { n = Math.max(1, n - 1); draw(); });
			plus.addEventListener('click', () => { n = Math.min(s.hitDice, n + 1); draw(); });
			roll.addEventListener('click', () => {
				close();
				const str = s.stats.STR;
				const r = this.plugin.rollDice(`${n}d${s.hitDie}`, `${s.name} · Field rest (${n} Hit ${n === 1 ? 'Die' : 'Dice'}${str ? `, ${fmtMod(str)} each` : ''})`);
				if (!r) return;
				const healed = hitDiceHealing(r.detail.match(/\d+/g)?.slice(0, n).map(Number) ?? [r.total], str);
				void this.mutate((fm, cur) => fieldRest(fm, cur, n, healed)).then(() => new Notice(`${s.name} heals ${healed} HP`));
			});
			camp.addEventListener('click', () => {
				close();
				const healed = n * Math.max(0, s.hitDie + s.stats.STR);
				void this.mutate((fm, cur) => fieldRest(fm, cur, n, healed)).then(() => new Notice(`${s.name} makes camp and heals ${healed} HP`));
			});
			if (!s.hitDice) el.createDiv({ cls: 'popover-body', text: 'No Hit Dice left. A safe rest brings them back.' });
			draw();
		}, 'ns-small-dialog');
	}

	// Pickers -------------------------------------------------------------------------------

	private hitFor(kind: CompendiumKind, name: string): CompendiumHit | undefined {
		return this.comp.search(name, [kind], 20).find(h => nameKey(h.name) === nameKey(name));
	}

	/** Items or spells from Spotlight, written to the note. */
	addFromCompendium(kinds: CompendiumKind[]): void {
		const s = this.sheet;
		const spell = kinds.includes('spell');
		const known = new Set(s.spells.map(x => nameKey(x.name)));
		const schools = new Set((s.cls?.casting?.schools ?? []).map(nameKey));
		openSpotlight(this.plugin, {
			kinds,
			title: spell ? `Add a spell to ${s.name}` : `Add to ${s.name}'s inventory`,
			prefer: spell ? (h) => schools.has(nameKey((h.entry as { school?: string }).school ?? '')) : undefined,
			preferLabel: spell ? 'Your schools' : undefined,
			isTaken: spell ? (h) => known.has(nameKey(h.name)) : undefined,
			allowCustom: true,
			onPick: (h) => {
				const name = h.name;
				void this.mutate(fm => {
					if (spell) addSpell(fm, name);
					else {
						const it = this.comp.item(name);
						const wearsNothing = !readCharacter(fm, this.comp).inventory.some(x => x.equipped && x.item?.category === it?.category);
						addItem(fm, name, 1, { equip: !!it && (it.category === 'armor' || it.category === 'shield') && wearsNothing });
					}
				}).then(() => new Notice(`${name} added to ${s.name}`));
			},
		});
	}
}

// ----------------------------------------------------------------------------
// Helpers

function initials(name: string): string {
	return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}

function fakeHit(kind: CompendiumKind, name: string): CompendiumHit {
	return { kind, name, detail: '', entry: {} };
}

/** Features that are things you do on your turn: costed options, "Action:" / "Reaction:" lead-ins. */
function isActionFeature(f: SheetFeature): boolean {
	if (f.cost && /action|reaction|mana/i.test(f.cost)) return true;
	return /^(\([^)]*\)\s*)?(\d+\s+)?(actions?|reaction|free action)\s*:/i.test(f.text ?? '');
}

// ----------------------------------------------------------------------------
// The ```nimble-sheet block

class SheetBlock extends MarkdownRenderChild {
	constructor(private plugin: NimbleStatblocksPlugin, el: HTMLElement, private source: string, private ctx: MarkdownPostProcessorContext) {
		super(el);
	}

	onload(): void {
		// `character: [[Other note]]` shows another note's sheet; otherwise the note's own.
		const link = this.source.match(/^\s*(?:character|note)\s*:\s*(.+?)\s*$/im)?.[1]?.replace(/^"|"$/g, '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');
		const file = link ? this.plugin.app.metadataCache.getFirstLinkpathDest(link, this.ctx.sourcePath) : this.plugin.app.vault.getFileByPath(this.ctx.sourcePath);
		if (!file) {
			const err = this.containerEl.createDiv({ cls: 'nimble-error' });
			err.createEl('strong', { text: 'Character sheet: ' });
			err.appendText(link ? `no note called "${link}".` : 'save this note first.');
			return;
		}
		const host = this.containerEl.createDiv();
		this.addChild(new CharacterSheetRenderer(this.plugin, host, file, { inPanel: !!link }));
	}
}

export function registerSheetBlock(plugin: NimbleStatblocksPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('nimble-sheet', (source, el, ctx) => {
		ctx.addChild(new SheetBlock(plugin, el, source, ctx));
	});
}

/** Where the caret is in a field, or null for fields without one (number inputs). */
function safeSelection(el: HTMLInputElement | HTMLTextAreaElement): [number, number] | null {
	try {
		return el.selectionStart !== null && el.selectionEnd !== null ? [el.selectionStart, el.selectionEnd] : null;
	} catch {
		return null;
	}
}

