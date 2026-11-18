// The 5e combat tracker (right sidebar): initiative order, the current turn,
// HP with temporary HP, AC, conditions with durations, concentration, death
// saves for heroes at 0 HP, legendary actions and resistances. Every change
// goes through the store (rt.fights.change), which saves and redraws.
//
// One clean row per combatant: the initiative badge and the name in the book's
// type, then AC in its shield, the HP bar and the HP button (the shared keypad)
// on the line below. Conditions get a line of their own underneath, only when
// there are any. The side shows in the row's colour edge; the stat block or
// sheet (tap the name) has the rest. Drag a row, or Move up/down in its menu,
// to change the order. Wide panes put the vitals beside the name. Defeated
// monsters fold away at the bottom.

import { openHpPad } from '../../core/tracker/hp-pad';
import type { HpCommand } from '../../core/tracker/hp';
import { FuzzySuggestModal, ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import { renderPipRow } from '../../core/pip-row';
import { pill } from '../../core/pill';
import { closePopover, isPopoverOpenFor, openPopover } from '../../core/popover';
import { onLongPress } from '../../core/touch';
import { openGameSettings } from '../../core/settings-ui';
import { isSheetMember, type AppliedCondition, type PartyMember } from '../../core/types';
import { ConditionEditorOptions, keepCustomCondition, openConditionDetails, openConditionPicker } from '../../core/tracker/condition-editor';
import { showEffectPrompts } from '../../core/tracker/effect-prompts';
import { chipSummary, triggerMark } from '../../core/tracker/effects';
import { startRolls5e } from './settings';
import {
	addCondition, addHero, addMonster, applyHp, Combatant5e, concentrationDc, current, damageTaken, deathSave, effectDamage, end, Fight5e, hpState, isDefeated,
	isRunning, moveCombatant, nextTurn, order, previewHp, previous, remove, removeCondition, retimeCondition, rollInitiative, saveBonus5e, setConcentration,
	setDeathSaves5e, setInitiative, startCombat, TurnStep5e, updateCondition, useLegendary, useResistance,
} from './combat';
import { ABILITY_NAME, ABILITIES } from './types';
import { DAMAGE_TYPES } from './builder-model';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';
import { formatMod } from './rules';
import { applyLook } from '../../core/look';
import { makeSortable } from '../../core/tracker/sortable';

export const DND5E_TRACKER_VIEW = 'nimble-dnd5e-tracker';

/** In the turn order's list: everyone but the monsters that are down (they fold away under Defeated). */
const isActiveRow = (c: Combatant5e) => !(c.side === 'monster' && isDefeated(c));

/** AC in a heater shield: a tinted face, a rim and an inner rule in the ornament colour, the number in the face's middle. */
function renderAc(parent: HTMLElement, ac: number): void {
	const el = parent.createSpan({ cls: 'dnd5e-ac', attr: { 'aria-label': `AC ${ac}` } });
	const svg = el.createSvg('svg', { cls: 'dnd5e-ac-shield', attr: { viewBox: '0 0 28 32', 'aria-hidden': 'true' } });
	svg.createSvg('path', { cls: 'dnd5e-ac-face', attr: { d: 'M14 1.6 26.2 5.4V15c0 7.7-5.1 12.9-12.2 15.6C6.9 27.9 1.8 22.7 1.8 15V5.4Z' } });
	svg.createSvg('path', { cls: 'dnd5e-ac-inner', attr: { d: 'M14 4.6 23.4 7.5V15c0 6-3.9 10.2-9.4 12.5C8.5 25.2 4.6 21 4.6 15V7.5Z' } });
	el.createSpan({ cls: 'dnd5e-ac-value', text: String(ac) });
}

export class Dnd5eTrackerView extends ItemView {
	/** Folded sections stay as they were across redraws. */
	private defeatedOpen = false;
	private logOpen = false;

	constructor(leaf: WorkspaceLeaf, private rt: Dnd5eRuntime) {
		super(leaf);
	}

	getViewType(): string { return DND5E_TRACKER_VIEW; }
	getDisplayText(): string { return '5e combat'; }
	getIcon(): string { return 'swords'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.rt.fights.on('changed', () => this.render()));
		this.render();
	}

	private get fight(): Fight5e { return this.rt.fights.fight; }
	private change<T>(fn: (f: Fight5e) => T): T { return this.rt.fights.change(fn); }

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('dnd5e-tracker');
		applyLook(root, 'dnd5e');
		const f = this.fight;
		const running = isRunning(f);
		const cur = current(f);
		const all = order(f);
		const active = all.filter(isActiveRow);
		const defeated = all.filter(c => !isActiveRow(c));

		this.renderHead(root, f, cur, active);
		if (!f.combatants.length) { this.renderEmpty(root); return; }
		this.renderControls(root, f, running);

		const list = root.createDiv({ cls: 'dnd5e-tracker-list' });
		const upNext = running && cur ? this.nextAfter(active, cur) : undefined;
		const sortable = active.length > 1;
		for (const c of active) this.renderRow(list, c, { isTurn: c.id === cur?.id, isNext: c.id === upNext?.id, sortable });
		if (sortable) {
			makeSortable(list, {
				items: '.dnd5e-combatant',
				// A mouse drags the row from its name and empty space; the badges, buttons and chips keep their clicks.
				ignore: 'button, input, a, .dnd5e-condition',
				find: (id) => this.rowEl(id),
				onStart: () => { this.rt.plugin.hover.hide(); closePopover(); },
				onDrop: (id, to) => { this.change(x => moveCombatant(x, id, to, isActiveRow)); },
			});
		}

		if (defeated.length) {
			const box = root.createEl('details', { cls: 'dnd5e-tracker-defeated' });
			box.open = this.defeatedOpen;
			box.addEventListener('toggle', () => { this.defeatedOpen = box.open; });
			const sum = box.createEl('summary');
			sum.createSpan({ cls: 'dnd5e-tracker-fold-label', text: 'Defeated' });
			sum.createSpan({ cls: 'dnd5e-tracker-fold-count', text: String(defeated.length) });
			const dl = box.createDiv({ cls: 'dnd5e-tracker-list is-defeated' });
			for (const c of defeated) this.renderRow(dl, c, { compact: true });
		}

		if (f.log.length) {
			const log = root.createEl('details', { cls: 'dnd5e-tracker-log' });
			log.open = this.logOpen;
			log.addEventListener('toggle', () => { this.logOpen = log.open; });
			const sum = log.createEl('summary');
			sum.createSpan({ cls: 'dnd5e-tracker-fold-label', text: 'Log' });
			sum.createSpan({ cls: 'dnd5e-tracker-fold-count', text: String(f.log.length) });
			const lines = log.createDiv({ cls: 'dnd5e-tracker-log-lines' });
			for (const l of f.log.slice(-20).reverse()) {
				const line = lines.createDiv({ cls: 'dnd5e-tracker-log-line' });
				line.createSpan({ cls: 'dnd5e-tracker-log-round', text: l.round ? `R${l.round}` : '–' });
				line.createSpan({ text: l.text });
			}
		}
	}

	/** Who acts after `cur`, skipping anyone out of the fight. */
	private nextAfter(list: Combatant5e[], cur: Combatant5e): Combatant5e | undefined {
		const turns = list.filter(c => !c.dead);
		if (turns.length < 2) return undefined;
		const i = turns.findIndex(c => c.id === cur.id);
		return turns[(i + 1) % turns.length];
	}

	// ------------------------------------------------------------------------
	// The head: the fight, the round and whose turn, and the controls

	private renderHead(root: HTMLElement, f: Fight5e, cur: Combatant5e | undefined, active: Combatant5e[]): void {
		const head = root.createDiv({ cls: 'dnd5e-tracker-head' });
		const text = head.createDiv({ cls: 'dnd5e-tracker-heading' });
		text.createDiv({ cls: 'dnd5e-tracker-title', text: f.name });
		const status = text.createDiv({ cls: 'dnd5e-tracker-status' });
		if (isRunning(f)) {
			status.createSpan({ cls: 'dnd5e-tracker-round', text: `Round ${f.round}` });
			if (cur) status.createSpan({ cls: 'dnd5e-tracker-turn', text: `${cur.label}'s turn` });
		} else if (f.combatants.length) {
			status.createSpan({ cls: 'dnd5e-tracker-round', text: 'Not started' });
			const monsters = active.filter(c => c.side === 'monster').length;
			const heroes = active.filter(c => c.side === 'hero').length;
			const parts = [monsters ? `${monsters} monster${monsters === 1 ? '' : 's'}` : '', heroes ? `${heroes} hero${heroes === 1 ? '' : 'es'}` : ''].filter(Boolean);
			if (parts.length) status.createSpan({ cls: 'dnd5e-tracker-turn', text: parts.join(', ') });
		} else status.remove();
		if (f.sourcePath) {
			const src = head.createEl('button', { cls: 'clickable-icon dnd5e-tracker-source', attr: { 'aria-label': 'Open the note this fight came from' } });
			setIcon(src, 'file-symlink');
			src.onclick = (e) => void this.app.workspace.openLinkText(f.sourcePath ?? '', '', e.metaKey || e.ctrlKey);
		}
		const more = head.createEl('button', { cls: 'clickable-icon dnd5e-tracker-more', attr: { 'aria-label': 'Fight options' } });
		setIcon(more, 'more-horizontal');
		more.onclick = (e) => this.fightMenu(e);
	}

	/** The fight's controls on one line: the big button is what comes next (Start combat, then Next turn);
	 *  Back and Roll initiative beside it; End, Add monster and Add party as icons. */
	private renderControls(root: HTMLElement, f: Fight5e, running: boolean): void {
		const combat = root.createDiv({ cls: `dnd5e-tracker-combat${running ? ' is-running' : ''}` });
		const btn = (label: string, icon: string, run: () => void, cls = '', iconOnly = false) => {
			const b = pill(combat, { tag: 'button', icon, text: iconOnly ? undefined : label, cls, attr: iconOnly ? { 'aria-label': label } : {} }) as HTMLButtonElement;
			b.onclick = run;
			return b;
		};
		if (!running) {
			const roll = btn('Initiative', 'dices', () => this.change(x => rollInitiative(x)), 'dnd5e-tracker-side');
			roll.setAttr('aria-label', 'Roll initiative');
			roll.disabled = !f.combatants.some(c => c.side === 'monster');
			btn('Start combat', 'swords', () => this.turn(x => startCombat(x, Math.random, startRolls5e(this.rt.plugin))), 'mod-cta dnd5e-tracker-primary');
		} else {
			btn('Back', 'undo-2', () => this.change(x => previous(x)), 'dnd5e-tracker-side').setAttr('aria-label', 'Back a turn');
			btn('Next turn', 'skip-forward', () => this.turn(x => nextTurn(x)), 'mod-cta dnd5e-tracker-primary');
			btn('End combat', 'square', () => this.change(x => end(x)), 'dnd5e-tracker-icon', true);
		}
		btn('Add monster', 'plus', () => this.pickMonster(), 'dnd5e-tracker-icon', true);
		if (!f.combatants.some(c => c.side === 'hero')) btn('Add the party', 'users', () => this.addParty(), 'dnd5e-tracker-icon', true);
	}

	/** A turn changes: run it, then ask what conditions call for (damage, saves; reminders as notices). */
	private turn(step: (f: Fight5e) => TurnStep5e): void {
		const r = this.change(step);
		if (r.prompts.length) showEffectPrompts(this.rt.plugin, r.prompts, this.effectHandlers());
	}

	/** How the prompts reach this fight: damage by 5e's HP rules and the stat block's resistances, a monster's saves. */
	private effectHandlers() {
		return {
			system: 'dnd5e',
			words: { save: 'save' },
			label: (id: string) => this.fight.combatants.find(c => c.id === id)?.label ?? '?',
			damage: (id: string, amount: number, type?: string) => this.change(f => effectDamage(f, id, amount, type)),
			saveBonus: (id: string, ability?: string) => saveBonus5e(this.fight, id, ability),
			endCondition: (id: string, name: string) => this.change(f => removeCondition(f, id, name)),
			log: (text: string) => this.change(f => { f.log.push({ round: f.round, text, time: Date.now() }); }),
		};
	}

	private renderEmpty(root: HTMLElement): void {
		const box = root.createDiv({ cls: 'dnd5e-tracker-empty' });
		setIcon(box.createDiv({ cls: 'dnd5e-tracker-empty-icon' }), 'swords');
		box.createDiv({ cls: 'dnd5e-tracker-empty-title', text: 'No one here yet' });
		box.createDiv({ cls: 'dnd5e-tracker-empty-hint', text: 'Run an encounter block from a note, or add monsters and the party here.' });
		const row = box.createDiv({ cls: 'dnd5e-tracker-empty-actions' });
		pill(row, { tag: 'button', icon: 'plus', text: 'Add monster', cls: 'mod-cta' }).onclick = () => this.pickMonster();
		pill(row, { tag: 'button', icon: 'users', text: 'Add the party' }).onclick = () => this.addParty();
	}

	// ------------------------------------------------------------------------
	// A combatant

	private renderRow(list: HTMLElement, c: Combatant5e, o: { isTurn?: boolean; isNext?: boolean; compact?: boolean; sortable?: boolean }): void {
		const state = hpState(c);
		const row = list.createDiv({ cls: `dnd5e-combatant side-${c.side} hp-${state}` });
		row.dataset.id = c.id;
		row.toggleClass('is-turn', !!o.isTurn);
		row.toggleClass('is-next', !!o.isNext);
		row.toggleClass('is-down', c.hp <= 0);
		row.toggleClass('is-dead', !!c.dead);
		row.toggleClass('is-defeated', !!o.compact);
		if (o.isTurn) row.createDiv({ cls: 'dnd5e-up-now', text: 'Up now' });
		onLongPress(row, (e) => this.rowMenu(e, c));
		// Drag to change the order: a mouse drags the row, a finger the grip. Alt+↑/↓ from the keyboard.
		if (o.sortable) {
			setIcon(row.createDiv({ cls: 'ev-sort-handle dnd5e-grip', attr: { 'aria-hidden': 'true' } }), 'grip-vertical');
			row.addEventListener('keydown', (e) => {
				if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
				e.preventDefault();
				this.moveBy(c, e.key === 'ArrowUp' ? -1 : 1, true);
			});
		}

		this.renderInit(row, c);

		// The name, and how they're doing when it's grave (Dead, Stable).
		const head = row.createDiv({ cls: 'dnd5e-combatant-head' });
		const entry = this.entryFor(c);
		const name = head.createSpan({ cls: 'dnd5e-combatant-name', text: c.label, attr: { role: 'button', tabindex: '0' } });
		const open = (e: MouseEvent | KeyboardEvent) => this.openCombatant(c, entry, e);
		name.onclick = open;
		name.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } };
		if (entry) this.rt.plugin.hover.attach(name, () => this.rt.hover(entry, this.fight.sourcePath ?? ''));
		if (c.dead) head.createSpan({ cls: 'dnd5e-death-dead', text: 'Dead' });
		else if (c.side === 'hero' && c.hp <= 0 && c.stable) head.createSpan({ cls: 'dnd5e-death-stable', text: 'Stable' });

		const more = row.createEl('button', { cls: 'clickable-icon dnd5e-combatant-more', attr: { 'aria-label': `${c.label}: more` } });
		setIcon(more, 'more-vertical');
		more.onclick = (e) => this.rowMenu(e, c);

		// AC, the HP bar (temp HP on the end of it) and the HP button, which opens the keypad.
		const vitals = row.createDiv({ cls: 'dnd5e-combatant-vitals' });
		if (c.ac !== undefined && !o.compact) renderAc(vitals, c.ac);
		if (!o.compact) {
			const bar = vitals.createDiv({ cls: 'dnd5e-hp-bar', attr: { 'aria-hidden': 'true' } });
			const scale = Math.max(1, c.maxHp, c.hp + c.tempHp);
			bar.createDiv({ cls: 'dnd5e-hp-fill' }).setCssStyles({ width: `${(100 * Math.max(0, c.hp)) / scale}%` });
			if (c.tempHp) bar.createDiv({ cls: 'dnd5e-hp-temp' }).setCssStyles({ width: `${(100 * c.tempHp) / scale}%` });
		}
		const hp = vitals.createEl('button', { cls: 'dnd5e-hp-text', text: `${c.hp}/${c.maxHp}`, attr: { 'aria-label': `${c.label}: change HP`, 'aria-haspopup': 'dialog' } });
		if (c.tempHp) hp.createSpan({ cls: 'dnd5e-hp-temp-text', text: `+${c.tempHp}` });
		hp.onclick = () => this.openHp(hp, c);

		if (o.compact) return;
		this.renderConditions(row, head, c);

		// Death saves for a hero at 0 HP; legendary actions and resistances for the monsters that have them.
		const extra = createDiv({ cls: 'dnd5e-combatant-extra' });
		if (c.side === 'hero' && c.hp <= 0 && !c.dead && !c.stable) {
			const ds = extra.createDiv({ cls: 'dnd5e-death' });
			const s = c.deathSaves ?? { success: 0, failure: 0 };
			renderPipRow(ds, { key: `death-ok:${c.id}`, name: 'Saves', label: true, count: s.success, max: 3, cls: 'is-success', set: n => this.change(f => setDeathSaves5e(f, c.id, n, s.failure)) });
			renderPipRow(ds, { key: `death-fail:${c.id}`, name: 'Fails', label: true, count: s.failure, max: 3, cls: 'is-failure', set: n => this.change(f => setDeathSaves5e(f, c.id, s.success, n)) });
			pill(ds, { tag: 'button', icon: 'dices', text: 'Roll save', cls: 'dnd5e-death-roll' }).onclick = () => this.rollDeathSave(c);
		}
		if (c.legendary) {
			const l = c.legendary;
			const left = l.max - l.used;
			renderPipRow(extra.createDiv({ cls: 'dnd5e-legendary' }), {
				key: `legendary:${c.id}`, name: 'Legendary', label: true, count: left, max: l.max, cls: 'is-legendary',
				set: n => this.change(f => useLegendary(f, c.id, left - n)),
			});
		}
		if (c.resistances) {
			const r = c.resistances;
			const left = r.max - r.used;
			renderPipRow(extra.createDiv({ cls: 'dnd5e-resist' }), {
				key: `resist:${c.id}`, name: 'Resistance', label: true, count: left, max: r.max, cls: 'is-resist',
				set: n => this.change(f => useResistance(f, c.id, left - n)),
			});
		}
		if (extra.childElementCount) { row.addClass('has-extra'); row.appendChild(extra); }
	}

	/**
	 * What's on them: concentration and each condition, on a line of their own under the name (no line when
	 * there are none). Adding one is the quiet + after the name: shown on hover, focus and their turn, always on touch.
	 */
	private renderConditions(row: HTMLElement, head: HTMLElement, c: Combatant5e): void {
		const add = head.createEl('button', { cls: 'dnd5e-condition-add', attr: { 'aria-label': 'Add a condition' } });
		setIcon(add, 'plus');
		add.onclick = (e) => { e.stopPropagation(); this.conditionPicker(add, c); };
		if (!c.concentrating && !c.conditions.length) return;
		row.addClass('has-conditions');
		const line = row.createDiv({ cls: 'dnd5e-combatant-conditions' });
		if (c.concentrating) this.renderConcentration(line, c);
		for (const x of c.conditions) this.renderCondition(line, c, x);
	}

	/** Move a combatant up or down the turn order by one place (the row menu, Alt+↑/↓). */
	private moveBy(c: Combatant5e, by: number, refocus = false): void {
		const ids = this.activeRows().map(x => x.id);
		const at = ids.indexOf(c.id);
		if (at < 0 || at + by < 0 || at + by >= ids.length) return;
		this.change(f => moveCombatant(f, c.id, at + by, isActiveRow));
		if (refocus) this.rowEl(c.id)?.querySelector<HTMLElement>('.dnd5e-combatant-name')?.focus();
	}

	/** The rows in the turn order (not the defeated): what a drag and Move up/down count in. */
	private activeRows(): Combatant5e[] {
		return order(this.fight).filter(isActiveRow);
	}

	private rowEl(id: string): HTMLElement | null {
		return this.contentEl.querySelector<HTMLElement>(`.dnd5e-tracker-list > .dnd5e-combatant[data-id="${CSS.escape(id)}"]`);
	}

	/** The initiative badge: the roll, or the bonus while it hasn't been rolled. Tap to type it or roll it. */
	private renderInit(row: HTMLElement, c: Combatant5e): void {
		const set = c.init !== undefined;
		const b = row.createEl('button', {
			cls: `dnd5e-init${set ? '' : ' is-unset'}`,
			text: set ? String(c.init) : formatMod(c.initBonus),
			attr: { 'aria-label': set ? `Initiative ${c.init}` : `Initiative: d20 ${formatMod(c.initBonus)}`, 'aria-haspopup': 'dialog' },
		});
		b.onclick = (e) => { e.stopPropagation(); this.initPopover(b, c); };
	}

	private initPopover(anchor: HTMLElement, c: Combatant5e): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		openPopover(anchor, (el, close) => {
			el.addClass('dnd5e-init-pop');
			applyLook(el, 'dnd5e');
			el.createDiv({ cls: 'popover-title', text: `${c.label}: initiative` });
			const row = el.createDiv({ cls: 'dnd5e-init-pop-row' });
			const input = row.createEl('input', { type: 'number', cls: 'dnd5e-init-input', attr: { 'aria-label': 'Initiative', placeholder: formatMod(c.initBonus), inputmode: 'numeric' } });
			if (c.init !== undefined) input.value = String(c.init);
			const apply = () => {
				const n = parseInt(input.value, 10);
				this.change(f => setInitiative(f, c.id, Number.isFinite(n) ? n : undefined));
				close();
			};
			input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
			pill(row, { tag: 'button', icon: 'check', text: 'Set', cls: 'mod-cta dnd5e-init-set' }).onclick = apply;
			pill(el, { tag: 'button', icon: 'dices', text: `Roll d20 ${formatMod(c.initBonus)}`, cls: 'dnd5e-init-roll' }).onclick = () => { close(); this.rollInit(c); };
			window.setTimeout(() => { input.focus(); input.select(); }, 0);
		}, { width: 230 });
	}

	/** d20 + bonus through the plugin's dice (the 3D dice and the roll log). */
	private rollInit(c: Combatant5e): void {
		const entry = this.rt.plugin.rollDice(`1d20${formatMod(c.initBonus)}`, `${c.label}: initiative`, 'effect');
		if (entry?.total !== undefined) this.change(f => setInitiative(f, c.id, entry.total));
	}

	private openCombatant(c: Combatant5e, entry: Dnd5eEntry | undefined, e: MouseEvent | KeyboardEvent): void {
		e.preventDefault();
		if (entry) { this.rt.quickLook(entry, this.fight.sourcePath ?? ''); return; }
		const hero = this.partyMember(c);
		if (hero && isSheetMember(hero)) void this.app.workspace.openLinkText(hero.id.slice('sheet:'.length), '', e.metaKey || e.ctrlKey);
	}

	private partyMember(c: Combatant5e): PartyMember | undefined {
		if (c.side !== 'hero') return undefined;
		const key = c.name.toLowerCase();
		return this.rt.plugin.settings.party.find(h => h.name.toLowerCase() === key);
	}

	private entryFor(c: Combatant5e): Dnd5eEntry | undefined {
		if (!c.monster) return undefined;
		return { name: c.name, filePath: c.sourceFile ?? '', monster: c.monster, bundled: !!c.monster.bundledId && !c.sourceFile };
	}

	// ------------------------------------------------------------------------
	// HP

	private openHp(anchor: HTMLElement, c: Combatant5e): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		openHpPad(anchor, {
			id: c.id, label: c.label, sub: `${c.hp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${c.ac !== undefined ? ` · AC ${c.ac}` : ''}${c.concentrating ? ' · concentrating' : ''}`,
			crit: true, mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
			preview: (mode, v, crit, mod) => {
				const cmd = mode === 'damage' ? (v > 0 ? { kind: 'damage' as const, amount: v, crit, type: mod } : null) : mode === 'set' ? { kind: 'set' as const, amount: v } : v > 0 ? { kind: mode, amount: v } : null;
				return cmd ? previewHp(this.fight, c.id, cmd) : '';
			},
			sideOf: this.containerEl,
			apply: (cmd) => this.applyHp(c, cmd),
		});
	}

	/** Apply a change; a concentrating creature that's still up gets its save called out. */
	private applyHp(c: Combatant5e, cmd: HpCommand): void {
		const was = !!c.concentrating;
		this.change(f => applyHp(f, c.id, cmd));
		const after = this.fight.combatants.find(x => x.id === c.id);
		if (was && cmd.kind === 'damage' && after?.concentrating) {
			const taken = damageTaken(cmd);
			if (taken > 0) new Notice(`${after.label}: Constitution save DC ${concentrationDc(taken, this.fight.edition)} to keep concentrating`);
		}
	}

	// ------------------------------------------------------------------------
	// Conditions and concentration

	private renderCondition(parent: HTMLElement, c: Combatant5e, x: AppliedCondition): void {
		const chip = parent.createSpan({ cls: 'dnd5e-condition', attr: { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' } });
		chip.createSpan({ cls: 'dnd5e-condition-name', text: `${x.name}${x.value ? ` ${x.value}` : ''}` });
		this.conditionMarks(chip, x);
		this.chipRemove(chip, `Remove ${x.name}`, () => this.change(f => removeCondition(f, c.id, x.name)));
		const open = () => openConditionDetails(chip, this.conditionOptions(c), x);
		chip.onclick = open;
		chip.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
			else if (e.key === 'Delete' || e.key === 'Backspace') this.change(f => removeCondition(f, c.id, x.name));
		};
	}

	/** Rounds left, and a mark when it does something each turn (damage, a save, a reminder). */
	private conditionMarks(chip: HTMLElement, x: AppliedCondition): void {
		const mark = triggerMark(x);
		if (mark) setIcon(chip.createSpan({ cls: `dnd5e-condition-mark is-${mark}`, attr: { 'aria-hidden': 'true' } }), mark === 'damage' ? 'flame' : mark === 'save' ? 'dices' : 'bell');
		if (x.rounds !== undefined) chip.createSpan({ cls: 'dnd5e-condition-rounds', text: String(x.rounds), attr: { 'aria-label': `${x.rounds} round${x.rounds === 1 ? '' : 's'} left` } });
		const summary = chipSummary(x, { save: 'save' });
		if (summary) chip.setAttr('aria-label', `${x.name}: ${summary}`);
	}

	private renderConcentration(parent: HTMLElement, c: Combatant5e): void {
		const chip = parent.createSpan({ cls: 'dnd5e-condition is-concentration', attr: { 'aria-label': 'Concentrating: damage calls for a Constitution save' } });
		setIcon(chip.createSpan({ cls: 'dnd5e-condition-icon' }), 'brain');
		chip.createSpan({ cls: 'dnd5e-condition-name', text: 'Concentrating' });
		this.chipRemove(chip, 'Stop concentrating', () => this.change(f => setConcentration(f, c.id, false)));
	}

	private chipRemove(chip: HTMLElement, label: string, run: () => void): void {
		const x = chip.createSpan({ cls: 'dnd5e-condition-x', attr: { role: 'button', 'aria-label': label } });
		setIcon(x, 'x');
		x.onclick = (e) => { e.stopPropagation(); run(); };
	}

	private conditionDefs() {
		return [...this.rt.plugin.systems.resolve('5e').conditions(this.fight.edition), ...this.rt.plugin.settings.customConditions];
	}

	/** The core condition editor, told 5e's words and how to change this fight. */
	private conditionOptions(c: Combatant5e): ConditionEditorOptions {
		const f = this.fight;
		const words = { save: 'save' };
		return {
			system: 'dnd5e',
			cls: 'dnd5e-condition-pop',
			bearer: { id: c.id, label: c.label },
			defs: this.conditionDefs(),
			customNames: this.rt.plugin.settings.customConditions.map(d => d.name),
			applied: c.conditions,
			others: order(f).filter(x => x.id !== c.id).map(x => ({ id: x.id, label: x.label })),
			currentTurnId: isRunning(f) ? f.turnId : undefined,
			abilities: ABILITIES.map(a => ABILITY_NAME[a]),
			damageTypes: DAMAGE_TYPES,
			words,
			value: { label: 'Level' },
			sideOf: this.containerEl,
			// Concentrating first: it isn't a condition, but it's what the GM reaches for here.
			extra: (grid, close, q) => {
				if (q && !'concentrating'.includes(q)) return;
				const on = !!c.concentrating;
				const b = pill(grid, { tag: 'button', icon: 'brain', text: 'Concentrating', cls: `condition-option dnd5e-cond-concentration${on ? ' is-applied' : ''}`, attr: { 'aria-pressed': String(on) } });
				b.onclick = () => { this.change(x => setConcentration(x, c.id, !on)); close(); };
			},
			add: (name, o) => this.change(x => addCondition(x, c.id, name, { value: o.value, timing: o.timing, sourceId: o.sourceId })),
			update: (name, o) => this.change(x => {
				retimeCondition(x, c.id, name, o.timing, o.sourceId);
				if (o.value !== undefined) updateCondition(x, c.id, name, { value: o.value });
			}),
			remove: (name) => this.change(x => removeCondition(x, c.id, name)),
			saveCustom: (d) => keepCustomCondition(this.rt.plugin, d, words),
		};
	}

	/** The "+" on a row: every condition of the fight's edition, your own, Concentrating, or a new one. */
	private conditionPicker(anchor: HTMLElement, c: Combatant5e): void {
		openConditionPicker(anchor, this.conditionOptions(c));
	}

	// ------------------------------------------------------------------------
	// Menus

	private rowMenu(e: MouseEvent, c: Combatant5e): void {
		const menu = new Menu();
		const entry = this.entryFor(c);
		if (entry) {
			menu.addItem(i => i.setTitle('Stat block').setIcon('scroll-text').onClick(() => this.rt.quickLook(entry, this.fight.sourcePath ?? '')));
			if (c.sourceFile) menu.addItem(i => i.setTitle('Open note').setIcon('file-symlink').onClick(() => void this.app.workspace.openLinkText(c.sourceFile ?? '', '', false)));
		} else {
			const hero = this.partyMember(c);
			if (hero && isSheetMember(hero)) menu.addItem(i => i.setTitle('Open sheet').setIcon('file-symlink').onClick(() => void this.app.workspace.openLinkText(hero.id.slice('sheet:'.length), '', false)));
		}
		menu.addItem(i => i.setTitle('Roll initiative').setIcon('dices').onClick(() => this.rollInit(c)));
		const rows = this.activeRows();
		const at = rows.findIndex(x => x.id === c.id);
		if (at > 0) menu.addItem(i => i.setTitle('Move up').setIcon('arrow-up').onClick(() => this.moveBy(c, -1)));
		if (at >= 0 && at < rows.length - 1) menu.addItem(i => i.setTitle('Move down').setIcon('arrow-down').onClick(() => this.moveBy(c, 1)));
		menu.addSeparator();
		if (at >= 0) menu.addItem(i => i.setTitle('Add a condition…').setIcon('plus').onClick(() => {
			const row = this.rowEl(c.id);
			const anchor = row?.querySelector<HTMLElement>('.dnd5e-condition-add') ?? row;
			if (anchor) this.conditionPicker(anchor, c);
		}));
		menu.addItem(i => i.setTitle('Concentrating').setIcon('brain').setChecked(!!c.concentrating).onClick(() => this.change(f => setConcentration(f, c.id, !c.concentrating))));
		if (c.monster) {
			const m = c.monster;
			menu.addItem(i => i.setTitle('Add another').setIcon('copy-plus').onClick(() => this.change(f => addMonster(f, m, 1, { sourceFile: c.sourceFile }))));
		}
		menu.addSeparator();
		menu.addItem(i => i.setTitle('Remove').setIcon('trash-2').onClick(() => this.change(f => remove(f, c.id))));
		menu.showAtMouseEvent(e);
	}

	/** A d20 for a death save, through the plugin's dice (3D, roll log): 10+ succeeds, a 1 is two failures, a 20 is 1 HP. */
	private rollDeathSave(c: Combatant5e): void {
		const entry = this.rt.plugin.rollDice('1d20', `${c.label}: death save`, 'effect');
		const n = entry?.total;
		if (n === undefined) return;
		this.change(f => deathSave(f, c.id, n === 20 ? 'nat20' : n === 1 ? 'nat1' : n >= 10 ? 'success' : 'failure'));
	}

	/** Every hero in the party, with their HP and AC (Defense in the party editor). */
	private addParty(): void {
		const party = this.rt.plugin.settings.party;
		if (!party.length) { this.rt.plugin.openParty(); return; }
		this.change(f => {
			for (const h of party) if (!f.combatants.some(c => c.side === 'hero' && c.name === h.name)) addHero(f, { name: h.name, maxHp: h.maxHp, ac: h.defense });
		});
	}

	private fightMenu(e: MouseEvent): void {
		const f = this.fight;
		const menu = new Menu();
		menu.addItem(i => i.setTitle('Add the party').setIcon('users').onClick(() => this.addParty()));
		menu.addItem(i => i.setTitle('Add monster…').setIcon('plus').onClick(() => this.pickMonster()));
		if (f.combatants.some(c => c.side === 'monster')) menu.addItem(i => i.setTitle('Roll initiative').setIcon('dices').onClick(() => this.change(x => rollInitiative(x))));
		menu.addItem(i => i.setTitle('Open compendium').setIcon('book-open').onClick(() => void this.rt.openCompendium({ path: f.sourcePath })));
		menu.addItem(i => i.setTitle('Encounter settings…').setIcon('settings').onClick(() => { openGameSettings(this.rt.plugin, f.sourcePath ?? this.rt.plugin.campaigns.active?.home.path, 'encounter'); }));
		if (f.combatants.length) {
			menu.addSeparator();
			if (isRunning(f)) menu.addItem(i => i.setTitle('End combat').setIcon('square').onClick(() => this.change(x => end(x))));
			menu.addItem(i => i.setTitle('Clear the fight').setIcon('trash-2').onClick(() => this.rt.fights.reset('Encounter', f.edition)));
		}
		menu.showAtMouseEvent(e);
	}

	private pickMonster(): void {
		new MonsterPicker(this.rt, this.fight.sourcePath, (e, count) => {
			this.change(f => addMonster(f, e.monster, count, { sourceFile: e.filePath || undefined }));
		}).open();
	}
}

/** Pick a 5e monster to add (Shift+Enter adds two). */
class MonsterPicker extends FuzzySuggestModal<Dnd5eEntry> {
	constructor(private rt: Dnd5eRuntime, private sourcePath: string | undefined, private onPick: (e: Dnd5eEntry, count: number) => void) {
		super(rt.plugin.app);
		this.setPlaceholder('Add a monster…');
		this.setInstructions([{ command: '↵', purpose: 'add one' }, { command: 'shift ↵', purpose: 'add two' }]);
	}

	getItems(): Dnd5eEntry[] {
		return this.rt.index.all(this.rt.edition(this.sourcePath), this.sourcePath);
	}

	getItemText(e: Dnd5eEntry): string {
		return `${e.name} (CR ${e.monster.cr})`;
	}

	onChooseItem(e: Dnd5eEntry, evt: MouseEvent | KeyboardEvent): void {
		this.onPick(e, evt.shiftKey ? 2 : 1);
	}
}
