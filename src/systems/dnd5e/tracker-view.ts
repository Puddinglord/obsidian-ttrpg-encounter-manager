// The 5e combat tracker (right sidebar), as the design study draws it: the
// book at the table. A card for whoever acts now (initiative gem, name in
// small caps over the oxblood rule, AC in a gold-rimmed shield, HP, death
// saves, legendary uses, conditions, then Damage | Heal, a condition and the
// stat block), then the queue: who still has to act this round, in initiative
// order, and who has acted (grey, checked). Tap anyone to make them active
// (nothing reshuffles); Next finishes the turn. Identical monsters share one
// initiative and one row, and the card steps through them one at a time.
// Every change goes through the store (rt.fights.change), which saves and redraws.

import { openHpPad } from '../../core/tracker/hp-pad';
import type { HpCommand } from '../../core/tracker/hp';
import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import { renderPipRow } from '../../core/pip-row';
import { pill } from '../../core/pill';
import { closePopover, isPopoverOpenFor, openPopover } from '../../core/popover';
import { onLongPress } from '../../core/touch';
import { holdRedraws } from '../../core/hold-redraws';
import { openGameSettings } from '../../core/settings-ui';
import { isSheetMember, type AppliedCondition, type PartyMember } from '../../core/types';
import { ConditionEditorOptions, keepCustomCondition, openConditionDetails, openConditionPicker } from '../../core/tracker/condition-editor';
import { showEffectPrompts } from '../../core/tracker/effect-prompts';
import { chipSummary, triggerMark } from '../../core/tracker/effects';
import { cardActions, flowKeys, flowSection, MarkState, renderTicker, selectableRow, trackerFoot, turnMark } from '../../core/tracker/flow';
import { evIcon } from '../../core/icons';
import { startRolls5e } from './settings';
import {
	actedIds, activate, addCondition, addHero, addMonster, applyHp, Combatant5e, concentrationDc, current, damageTaken, deathSave, effectDamage, end, Fight5e, groupOf,
	hpState, isDefeated, isRunning, moveCombatant, nextTurn, order, previewHp, previous, remove, removeCondition, retimeCondition, rollInitiative, saveBonus5e,
	setConcentration, setDeathSaves5e, setInitiative, startCombat, TurnStep5e, updateCondition, upNext, useLegendary, useResistance,
} from './combat';
import { ABILITY_NAME, ABILITIES } from './types';
import { DAMAGE_TYPES } from './builder-model';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';
import type { Entry5e } from './compendium-entries';
import { pickMonster5e } from './compendium-modal';
import { formatMod } from './rules';
import { applyLook } from '../../core/look';
import { makeSortable } from '../../core/tracker/sortable';

export const DND5E_TRACKER_VIEW = 'nimble-dnd5e-tracker';

/** In the turn order's list: everyone but the monsters that are down (they fold away under Defeated). */
const isActiveRow = (c: Combatant5e) => !(c.side === 'monster' && isDefeated(c));

/** A plural for a group's row: "Goblin" → "Goblins". */
const plural = (name: string) => /s$/i.test(name) ? name : `${name}s`;

/** A member of a group, short enough for the card's strip: "Goblin Warrior 2" → "Warrior 2", "Goblin" → "Goblin 1". */
function memberLabel(c: Combatant5e, i: number): string {
	const words = c.name.split(/\s+/);
	const short = words[words.length - 1];
	const n = c.label.startsWith(c.name) ? c.label.slice(c.name.length).trim() || String(i + 1) : '';
	return n ? `${short} ${n}` : c.label;
}

/** A heater-shield path inside a w × h box, inset i (the book's AC shield). */
function shieldPath(w: number, h: number, i: number): string {
	const x0 = i, x1 = w - i, y0 = i, y1 = h - i, W = x1 - x0, H = y1 - y0, cx = w / 2, r = W * 0.1;
	const f = (n: number) => n.toFixed(2);
	return `M${f(x0)} ${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}H${f(x1 - r)}Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}V${f(y0 + H * 0.46)}C${f(x1)} ${f(y0 + H * 0.78)} ${f(cx + W * 0.24)} ${f(y0 + H * 0.92)} ${f(cx)} ${f(y1)}C${f(cx - W * 0.24)} ${f(y0 + H * 0.92)} ${f(x0)} ${f(y0 + H * 0.78)} ${f(x0)} ${f(y0 + H * 0.46)}Z`;
}

/** AC in a gold-rimmed heater shield; the big one has a tinted chief with "AC" in it. */
function renderAc(parent: HTMLElement, ac: number, size: number): HTMLElement {
	const big = size >= 38;
	const w = size, h = Math.round(size * (big ? 1.2 : 1.16));
	const el = parent.createSpan({ cls: `dnd5e-ac dnd5e-shield${big ? ' is-lg' : ' is-sm'}`, attr: { 'aria-label': `AC ${ac}` } });
	el.setCssStyles({ width: `${w}px`, height: `${h}px` });
	const rim = big ? 2.4 : 1.3;
	const svg = el.createSvg('svg', { attr: { viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' } });
	svg.createSvg('path', { cls: 'rim', attr: { d: shieldPath(w, h, 0.4) } });
	svg.createSvg('path', { cls: 'face', attr: { d: shieldPath(w, h, rim) } });
	if (big) {
		const i2 = rim + 0.5, r = (w - 2 * i2) * 0.1, band = h * 0.25;
		svg.createSvg('path', { cls: 'band', attr: { d: `M${i2} ${i2 + r}Q${i2} ${i2} ${i2 + r} ${i2}H${w - i2 - r}Q${w - i2} ${i2} ${w - i2} ${i2 + r}V${i2 + band}H${i2}Z` } });
		svg.createSvg('path', { cls: 'edge', attr: { d: shieldPath(w, h, rim + 2.2) } });
		el.createEl('small', { text: 'AC' });
	}
	el.createEl('b', { text: String(ac) });
	return el;
}

/** Initiative: a faceted gem with a gold rim. */
function renderGem(parent: HTMLElement, text: string, tag: 'button' | 'span' = 'span'): HTMLElement {
	const el = tag === 'button' ? parent.createEl('button', { cls: 'dnd5e-gem dnd5e-init' }) : parent.createSpan({ cls: 'dnd5e-gem' });
	const svg = el.createSvg('svg', { attr: { viewBox: '0 0 50 32', 'aria-hidden': 'true' } });
	svg.createSvg('path', { cls: 'rim', attr: { d: 'M1 16 9.5 1.5h31L49 16l-8.5 14.5h-31Z' } });
	svg.createSvg('path', { cls: 'in', attr: { d: 'M4.6 16l7-11.6h26.8l7 11.6-7 11.6H11.6Z' } });
	svg.createSvg('path', { cls: 'fac', attr: { d: 'M11.6 4.4 4.6 16M38.4 4.4 45.4 16' } });
	el.createEl('b', { text });
	return el;
}

/** The oxblood rule: a diamond, then a taper (the 2014 books' bar, thinned). */
function renderTaper(parent: HTMLElement): void {
	const rule = parent.createDiv({ cls: 'dnd5e-rule', attr: { 'aria-hidden': 'true' } });
	const d = rule.createSvg('svg', { attr: { viewBox: '0 0 9 9', width: '9', height: '9' } });
	d.createSvg('path', { attr: { d: 'M4.5 0 9 4.5 4.5 9 0 4.5Z', fill: 'currentColor' } });
	d.createSvg('path', { cls: 'dnd5e-rule-hole', attr: { d: 'M4.5 2.4 6.6 4.5 4.5 6.6 2.4 4.5Z' } });
	const t = rule.createSvg('svg', { attr: { viewBox: '0 0 312 5', preserveAspectRatio: 'none' } });
	t.createSvg('path', { attr: { d: 'M0 0.6 L312 2.5 L0 4.4 Z', fill: 'currentColor' } });
}

export class Dnd5eTrackerView extends ItemView {
	/** Folded sections stay as they were across redraws. */
	private defeatedOpen = false;
	private logOpen = false;
	/** The legendary-action strip, put away until the turn changes ("Not now"). */
	private momentDismissed = '';
	private primaryRun: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private rt: Dnd5eRuntime) {
		super(leaf);
	}

	getViewType(): string { return DND5E_TRACKER_VIEW; }
	getDisplayText(): string { return '5e combat'; }
	getIcon(): string { return 'swords'; }

	async onOpen(): Promise<void> {
		// The fight redraws the tracker, but not under a finger that's down (it would lose the tap).
		const changed = holdRedraws(this, this.containerEl, () => this.render());
		this.registerEvent(this.rt.fights.on('changed', changed));
		flowKeys(this.contentEl, {
			select: (row) => { const id = row.dataset.flowRow; if (id && isRunning(this.fight)) this.turn(f => activate(f, id)); },
			done: () => this.primaryRun?.(),
			undo: () => { if (isRunning(this.fight)) this.change(x => previous(x)); },
		});
		this.render();
	}

	private get fight(): Fight5e { return this.rt.fights.fight; }
	private change<T>(fn: (f: Fight5e) => T): T { return this.rt.fights.change(fn); }

	render(): void {
		const root = this.contentEl;
		const scroll = root.scrollTop;
		const focused = (root.doc.activeElement as HTMLElement | null)?.dataset?.flowRow;
		root.empty();
		root.addClass('dnd5e-tracker', 'ev-tracker');
		applyLook(root, 'dnd5e');
		this.primaryRun = null;
		const f = this.fight;
		const running = isRunning(f);
		const cur = current(f);

		this.renderHead(root, f);
		if (!f.combatants.length) { this.renderEmpty(root); return; }
		const body = root.createDiv({ cls: 'ev-tracker-body' });
		if (running) this.renderFight(body, f, cur);
		else this.renderSetup(body, f);

		const defeated = order(f).filter(c => !isActiveRow(c));
		if (defeated.length) {
			const box = body.createEl('details', { cls: 'dnd5e-tracker-defeated ev-fold' });
			box.open = this.defeatedOpen;
			box.addEventListener('toggle', () => { this.defeatedOpen = box.open; });
			const sum = box.createEl('summary');
			sum.createSpan({ cls: 'ev-fold-label', text: 'Defeated' });
			sum.createSpan({ cls: 'ev-fold-count dnd5e-tracker-fold-count', text: String(defeated.length) });
			const dl = box.createDiv({ cls: 'dnd5e-tracker-list ev-list is-defeated' });
			for (const c of defeated) this.renderRow(dl, c, { mark: 'out', compact: true });
		}

		if (f.log.length) {
			const log = body.createEl('details', { cls: 'dnd5e-tracker-log ev-fold' });
			log.open = this.logOpen;
			log.addEventListener('toggle', () => { this.logOpen = log.open; });
			const sum = log.createEl('summary');
			sum.createSpan({ cls: 'ev-fold-label', text: 'Log' });
			sum.createSpan({ cls: 'ev-fold-count dnd5e-tracker-fold-count', text: String(f.log.length) });
			const lines = log.createDiv({ cls: 'dnd5e-tracker-log-lines' });
			for (const l of f.log.slice(-20).reverse()) {
				const line = lines.createDiv({ cls: 'dnd5e-tracker-log-line' });
				line.createSpan({ cls: 'dnd5e-tracker-log-round', text: l.round ? `R${l.round}` : '–' });
				line.createSpan({ text: l.text });
			}
		}
		this.renderFoot(root, f, cur);
		root.scrollTop = scroll;
		if (focused) root.querySelector<HTMLElement>(`[data-flow-row="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
	}

	// ------------------------------------------------------------------------
	// The head: the fight's name, Add, the party, More; the ticker under it

	private renderHead(root: HTMLElement, f: Fight5e): void {
		const head = root.createDiv({ cls: 'dnd5e-tracker-head ev-tracker-head' });
		head.createEl('h3', { cls: 'dnd5e-tracker-title encounter-title', text: f.name });
		const btn = (icon: string, label: string, cls: string, run: (e: MouseEvent) => void) => {
			const b = head.createEl('button', { cls: `clickable-icon ${cls}`, attr: { 'aria-label': label } });
			setIcon(b, icon);
			b.onclick = run;
			return b;
		};
		if (f.sourcePath) btn('file-symlink', 'Open the note this fight came from', 'dnd5e-tracker-source', (e) => void this.app.workspace.openLinkText(f.sourcePath ?? '', '', e.metaKey || e.ctrlKey));
		btn(evIcon('plus'), 'Add monster', 'dnd5e-tracker-add', () => this.pickMonster());
		btn(evIcon('users'), 'Add the party', 'dnd5e-tracker-party', () => this.addParty());
		btn(evIcon('more'), 'Fight options', 'dnd5e-tracker-more', (e) => this.fightMenu(e));
	}

	private ticker(body: HTMLElement, f: Fight5e, cur: Combatant5e | undefined): void {
		const running = isRunning(f);
		if (running) {
			const t = renderTicker(body, { round: f.round, turn: cur ? `${cur.label}'s turn` : 'Between turns', note: f.edition, cls: 'dnd5e-tracker-status x5-tick' });
			t.querySelector('.ev-ticker-round')?.addClass('dnd5e-tracker-round');
			t.querySelector('.ev-ticker-note')?.addClass('dnd5e-ed');
			return;
		}
		const active = order(f).filter(isActiveRow);
		const monsters = active.filter(c => c.side === 'monster').length;
		const heroes = active.filter(c => c.side === 'hero').length;
		const parts = [heroes ? `${heroes} hero${heroes === 1 ? '' : 'es'}` : '', monsters ? `${monsters} monster${monsters === 1 ? '' : 's'}` : ''].filter(Boolean);
		const t = renderTicker(body, { round: 'Setting up', turn: parts.join(', '), cls: 'dnd5e-tracker-status x5-tick' });
		t.querySelector('.ev-ticker-round')?.addClass('dnd5e-tracker-round');
	}

	// ------------------------------------------------------------------------
	// Before the fight: who rolls what. Players say their rolls; monsters roll (one roll for identical ones).

	private renderSetup(body: HTMLElement, f: Fight5e): void {
		this.ticker(body, f, undefined);
		const active = order(f).filter(isActiveRow);
		const heroes = active.filter(c => c.side === 'hero');
		const monsters = active.filter(c => c.side === 'monster');
		if (heroes.length) {
			const h = body.createDiv({ cls: 'dnd5e-setup-h' });
			h.createSpan({ cls: 'dnd5e-setup-h-title', text: 'Party' });
			const list = body.createDiv({ cls: 'dnd5e-tracker-list ev-list dnd5e-setup-list' });
			for (const c of heroes) this.renderSetupRow(list, [c]);
		}
		if (monsters.length) {
			const h = body.createDiv({ cls: 'dnd5e-setup-h' });
			h.createSpan({ cls: 'dnd5e-setup-h-title', text: 'Monsters' });
			const roll = pill(h, { tag: 'button', icon: evIcon('dice'), text: 'Roll all', cls: 'dnd5e-roll-all', attr: { 'aria-label': 'Roll initiative' } });
			roll.onclick = () => this.change(x => rollInitiative(x));
			const list = body.createDiv({ cls: 'dnd5e-tracker-list ev-list dnd5e-setup-list' });
			// Identical monsters on one roll: one row, "×3".
			const seen = new Set<string>();
			for (const c of monsters) {
				if (seen.has(c.id)) continue;
				const group = groupOf(f, c.id).filter(isActiveRow);
				for (const g of group) seen.add(g.id);
				this.renderSetupRow(list, group.length ? group : [c]);
			}
		}
	}

	/** One line before the fight: the name (×3 for a group), the bonus, and the roll in its box (tap to type or roll). */
	private renderSetupRow(list: HTMLElement, group: Combatant5e[]): void {
		const c = group[0];
		const row = list.createDiv({ cls: `dnd5e-combatant dnd5e-setup-row side-${c.side}` });
		row.dataset.id = c.id;
		onLongPress(row, (e) => this.rowMenu(e, c));
		const nm = row.createDiv({ cls: 'dnd5e-setup-name' });
		const name = nm.createSpan({ cls: 'dnd5e-combatant-name', text: group.length > 1 ? `${plural(c.name)} ×${group.length}` : c.label, attr: { role: 'button', tabindex: '0' } });
		const entry = this.entryFor(c);
		name.onclick = (e) => this.openCombatant(c, entry, e);
		if (entry) this.rt.plugin.hover.attach(name, () => this.rt.hover(entry, this.fight.sourcePath ?? ''));
		const meta = this.typeLine(c, true);
		if (meta || group.length > 1) nm.createSpan({ cls: 'dnd5e-setup-meta', text: [meta, group.length > 1 ? 'one roll for the group' : ''].filter(Boolean).join(' · ') });
		row.createSpan({ cls: 'dnd5e-setup-bonus', text: formatMod(c.initBonus) });
		this.renderInit(row, c, group);
	}

	// ------------------------------------------------------------------------
	// The fight: ticker, the card, a legendary moment, then still to act and acted

	private renderFight(body: HTMLElement, f: Fight5e, cur: Combatant5e | undefined): void {
		this.ticker(body, f, cur);
		if (cur) this.renderCard(body, f, cur);
		this.renderMoment(body, f, cur);

		const acted = actedIds(f);
		const turns = order(f).filter(isActiveRow).filter(c => c.id !== cur?.id);
		// Identical monsters on one initiative are one row: the group, with the members' HP.
		const curGroup = cur ? groupOf(f, cur.id) : [];
		const entries: { c: Combatant5e; members: Combatant5e[] }[] = [];
		const seen = new Set<string>(curGroup.map(c => c.id));
		for (const c of turns) {
			if (seen.has(c.id)) continue;
			const g = groupOf(f, c.id).filter(x => isActiveRow(x));
			for (const x of g) seen.add(x.id);
			entries.push({ c, members: g.length ? g : [c] });
		}
		// The rest of the current one's group still to act shows on the card's member strip.
		const isActed = (e: { members: Combatant5e[] }) => e.members.every(m => acted.has(m.id) || m.dead);
		const toAct = entries.filter(e => !isActed(e));
		const done = entries.filter(isActed);
		const nxt = upNext(f);

		flowSection(body, 'Still to act', { small: `${toAct.length} this round` });
		const list = body.createDiv({ cls: 'dnd5e-tracker-list ev-list is-to-act' });
		if (toAct.length) for (const e of toAct) this.renderRow(list, e.c, { mark: e.members.some(m => m.id === nxt?.id) ? 'next' : 'todo', members: e.members });
		else list.createDiv({ cls: 'ev-list-empty dnd5e-round-next', text: `Round ${f.round + 1} next` });
		this.sortable(list, toAct.map(e => e.members));

		if (done.length) {
			flowSection(body, 'Acted this round', { small: String(done.length), acted: true });
			const al = body.createDiv({ cls: 'dnd5e-tracker-list ev-list is-acted-list' });
			for (const e of done) this.renderRow(al, e.c, { mark: 'acted', acted: true, members: e.members });
			this.sortable(al, done.map(e => e.members));
		}
	}

	/** Drag rows to change the order: a mouse drags the row, a finger the grip. Alt+↑/↓ from the keyboard. */
	private sortable(list: HTMLElement, groups: Combatant5e[][]): void {
		if (groups.length < 2) return;
		const ids = new Set(groups.flat().map(c => c.id));
		makeSortable(list, {
			items: '.dnd5e-combatant',
			ignore: 'button, input, a, .dnd5e-condition',
			find: (id) => list.querySelector<HTMLElement>(`:scope > .dnd5e-combatant[data-id="${CSS.escape(id)}"]`),
			onStart: () => { this.rt.plugin.hover.hide(); closePopover(); },
			// A group moves as one: its first member lands where the row was dropped, the rest right after it.
			onDrop: (id, to) => {
				const g = groups.find(x => x.some(c => c.id === id));
				if (!g) return;
				const rest = groups.filter(x => x !== g);
				const at = rest.slice(0, Math.max(0, Math.min(to, rest.length))).reduce((n, x) => n + x.length, 0);
				this.change(x => {
					const others = new Set(g.slice(1).map(c => c.id));
					moveCombatant(x, g[0].id, at, c => ids.has(c.id) && !others.has(c.id));
					for (let k = 1; k < g.length; k++) {
						const rows = order(x).filter(c => ids.has(c.id) && c.id !== g[k].id);
						moveCombatant(x, g[k].id, rows.findIndex(c => c.id === g[k - 1].id) + 1, c => ids.has(c.id));
					}
				});
			},
		});
	}

	// ------------------------------------------------------------------------
	// The card: whoever acts now, framed like a page from the book

	private renderCard(body: HTMLElement, f: Fight5e, c: Combatant5e): void {
		const dying = c.side === 'hero' && c.hp <= 0 && !c.dead;
		const card = body.createDiv({ cls: `ev-card dnd5e-focus dnd5e-combatant is-turn side-${c.side} hp-${hpState(c)}` });
		card.toggleClass('is-dying', dying);
		card.toggleClass('is-down', c.hp <= 0);
		card.dataset.id = c.id;
		card.dataset.flowRow = c.id;
		card.setAttr('tabindex', '0');
		card.setAttr('aria-label', `${c.label}, acting now`);
		onLongPress(card, (e) => this.rowMenu(e, c));

		const top = card.createDiv({ cls: 'dnd5e-focus-top' });
		this.renderInit(top, c, groupOf(f, c.id), true);
		const nm = top.createDiv({ cls: 'dnd5e-focus-name' });
		const entry = this.entryFor(c);
		const name = nm.createEl('h2', { cls: 'dnd5e-combatant-name', text: c.label, attr: { role: 'button', tabindex: '0' } });
		name.onclick = (e) => this.openCombatant(c, entry, e);
		name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.openCombatant(c, entry, e); } };
		if (entry) this.rt.plugin.hover.attach(name, () => this.rt.hover(entry, this.fight.sourcePath ?? ''));
		const line = this.typeLine(c);
		if (line) nm.createEl('p', { cls: 'dnd5e-focus-type', text: line });
		const more = top.createEl('button', { cls: 'clickable-icon dnd5e-combatant-more', attr: { 'aria-label': `${c.label}: more` } });
		setIcon(more, evIcon('more'));
		more.onclick = (e) => this.rowMenu(e, c);
		renderTaper(card);

		// A group's turn: the members, one at a time (Next steps through them).
		const group = groupOf(f, c.id);
		if (group.length > 1) {
			const strip = card.createDiv({ cls: 'dnd5e-members', attr: { role: 'group', 'aria-label': `${plural(c.name)}: one initiative` } });
			const acted = actedIds(f);
			for (const m of group) {
				const b = strip.createEl('button', { cls: `dnd5e-member${m.id === c.id ? ' is-on' : ''}${m.hp <= 0 ? ' is-out' : acted.has(m.id) ? ' is-done' : ''}` });
				b.createEl('b', { text: memberLabel(m, group.indexOf(m)) });
				b.createSpan({ text: m.hp <= 0 ? 'down' : `${m.hp} / ${m.maxHp}${m.conditions[0] ? ` · ${m.conditions[0].name}` : ''}` });
				if (m.id !== c.id && m.hp > 0) b.onclick = () => this.turn(x => activate(x, m.id));
				else b.disabled = m.id === c.id;
			}
		}

		// AC in its shield, then HP: the number (tap it for the keypad), Bloodied or temp HP, the framed bar.
		const vitals = card.createDiv({ cls: 'dnd5e-vitals' });
		if (c.ac !== undefined) renderAc(vitals, c.ac, 46);
		const hp = vitals.createDiv({ cls: 'dnd5e-focus-hp' });
		const num = hp.createDiv({ cls: 'dnd5e-focus-hp-num' });
		const hpBtn = num.createEl('button', { cls: 'dnd5e-focus-hp-btn', attr: { 'aria-label': `${c.label}: change HP`, 'aria-haspopup': 'dialog' } });
		hpBtn.createEl('b', { text: String(c.hp) });
		hpBtn.createSpan({ text: `/ ${c.maxHp}` });
		hpBtn.onclick = () => this.openHp(hpBtn, c, 'damage');
		if (c.tempHp) num.createEl('em', { cls: 'dnd5e-ribbon is-temp', text: `+${c.tempHp} temp` });
		else if (c.hp > 0 && c.hp <= c.maxHp / 2) num.createEl('em', { cls: 'dnd5e-ribbon', text: 'Bloodied' });
		this.bar(hp, c);

		// Death saves for a hero at 0 HP.
		if (dying && !c.stable) {
			const ds = card.createDiv({ cls: 'dnd5e-death dnd5e-dying' });
			const h = ds.createDiv({ cls: 'dnd5e-dying-head' });
			h.createSpan({ text: 'Dying · death saves' });
			pill(h, { tag: 'button', icon: evIcon('dice'), text: 'Roll', cls: 'mod-cta dnd5e-death-roll' }).onclick = () => this.rollDeathSave(c);
			const s = c.deathSaves ?? { success: 0, failure: 0 };
			const grid = ds.createDiv({ cls: 'dnd5e-ds' });
			grid.createSpan({ cls: 'dnd5e-ds-label', text: 'Successes' });
			renderPipRow(grid, { key: `death-ok:${c.id}`, name: 'Successes', count: s.success, max: 3, cls: 'is-success', set: n => this.change(x => setDeathSaves5e(x, c.id, n, s.failure)) });
			grid.createSpan({ cls: 'dnd5e-ds-label', text: 'Failures' });
			renderPipRow(grid, { key: `death-fail:${c.id}`, name: 'Failures', count: s.failure, max: 3, cls: 'is-failure', set: n => this.change(x => setDeathSaves5e(x, c.id, s.success, n)) });
		} else if (c.dead) card.createDiv({ cls: 'dnd5e-death-dead dnd5e-focus-state', text: 'Dead' });
		else if (c.side === 'hero' && c.hp <= 0 && c.stable) card.createDiv({ cls: 'dnd5e-death-stable dnd5e-focus-state', text: 'Stable' });

		// Legendary actions and resistance, on one quiet box.
		if (c.legendary || c.resistances) {
			const res = card.createDiv({ cls: 'dnd5e-res' });
			if (c.legendary) {
				const l = c.legendary, left = l.max - l.used;
				const r = res.createDiv({ cls: 'dnd5e-res-row dnd5e-legendary' });
				const label = r.createSpan({ cls: 'dnd5e-res-label' });
				setIcon(label.createSpan({ cls: 'dnd5e-res-icon' }), evIcon('crown'));
				label.createSpan({ text: 'Legendary actions' });
				renderPipRow(r, { key: `legendary:${c.id}`, name: 'Legendary actions', count: left, max: l.max, cls: 'is-legendary', set: n => this.change(x => useLegendary(x, c.id, left - n)) });
			}
			if (c.resistances) {
				const rr = c.resistances, left = rr.max - rr.used;
				const r = res.createDiv({ cls: 'dnd5e-res-row dnd5e-resist' });
				const label = r.createSpan({ cls: 'dnd5e-res-label' });
				setIcon(label.createSpan({ cls: 'dnd5e-res-icon' }), evIcon('shield'));
				label.createSpan({ text: 'Legendary resistance' });
				renderPipRow(r, { key: `resist:${c.id}`, name: 'Legendary resistance', count: left, max: rr.max, cls: 'is-resist', set: n => this.change(x => useResistance(x, c.id, left - n)) });
			}
		}

		if (c.concentrating || c.conditions.length) {
			const chips = card.createDiv({ cls: 'dnd5e-combatant-conditions dnd5e-focus-chips' });
			if (c.concentrating) this.renderConcentration(chips, c);
			for (const x of c.conditions) this.renderCondition(chips, c, x);
		}

		cardActions(card, {
			damage: (b) => this.openHp(b, c, 'damage'),
			heal: (b) => this.openHp(b, c, 'heal'),
			condition: (b) => this.conditionPicker(b, c),
			sheet: entry || this.partyMember(c) ? { label: entry ? 'Stat block' : 'Character sheet', short: entry ? 'Stat block' : 'Sheet', run: (_b, e) => this.openCombatant(c, entry, e) } : undefined,
		});
	}

	/** The line under a name, in the stat block's italic: "Small Fey (Goblinoid) · CR 1", "Cleric 5". */
	private typeLine(c: Combatant5e, short = false): string {
		const m = c.monster;
		if (m) {
			const kind = [m.size, m.type ? m.type.replace(/^./, s => s.toUpperCase()) : ''].filter(Boolean).join(' ');
			const parts = short ? [`CR ${m.cr}`] : [[kind, m.alignment].filter(Boolean).join(', '), `CR ${m.cr}`];
			return parts.filter(Boolean).join(' · ');
		}
		const hero = this.partyMember(c);
		return hero ? [hero.className, hero.level ? String(hero.level) : ''].filter(Boolean).join(' ') : '';
	}

	private bar(parent: HTMLElement, c: Combatant5e): void {
		const bar = parent.createDiv({ cls: `ev-bar dnd5e-hp-bar${c.hp <= 0 ? ' is-zero' : c.hp <= c.maxHp / 2 ? ' is-low' : ''}`, attr: { 'aria-hidden': 'true' } });
		const scale = Math.max(1, c.maxHp, c.hp + c.tempHp);
		bar.createEl('i', { cls: 'dnd5e-hp-fill' }).setCssStyles({ width: `${(100 * Math.max(0, c.hp)) / scale}%` });
		if (c.tempHp) bar.createEl('i', { cls: 'dnd5e-hp-temp' }).setCssStyles({ width: `${(100 * c.tempHp) / scale}%` });
	}

	/** After another creature's turn, a legendary monster may act: one quiet strip, one tap per action, never in the way of Next. */
	private renderMoment(body: HTMLElement, f: Fight5e, cur: Combatant5e | undefined): void {
		const key = `${f.round}:${f.turnId ?? ''}`;
		if (this.momentDismissed === key) return;
		const boss = order(f).find(c => c.legendary && c.legendary.used < c.legendary.max && c.id !== cur?.id && !isDefeated(c) && c.monster?.legendaryActions?.length);
		if (!boss?.legendary || !boss.monster?.legendaryActions) return;
		const after = f.undo?.prev?.turnId && f.undo.turnId === f.turnId ? f.combatants.find(c => c.id === f.undo?.prev?.turnId) : undefined;
		if (after?.id === boss.id) return;
		const left = boss.legendary.max - boss.legendary.used;
		const m = body.createDiv({ cls: 'ev-moment dnd5e-moment' });
		setIcon(m.createSpan({ cls: 'ev-moment-icon', attr: { 'aria-hidden': 'true' } }), evIcon('crown'));
		const main = m.createDiv({ cls: 'ev-moment-body' });
		main.createDiv({ cls: 'ev-moment-title', text: `${boss.label}: a legendary action?` });
		main.createEl('small', { text: `${after ? `After ${after.label}'s turn · ` : ''}${left} of ${boss.legendary.max} uses left` });
		const acts = main.createDiv({ cls: 'ev-moment-acts' });
		for (const a of boss.monster.legendaryActions) {
			const cost = Number(/costs?\s+(\d+)/i.exec(a.name)?.[1] ?? 1);
			const label = a.name.replace(/\s*\(costs?\s+\d+\s+actions?\)/i, '');
			const b = acts.createEl('button', { cls: 'ev-moment-btn', text: label, attr: { title: a.desc } });
			b.disabled = cost > left;
			b.onclick = () => this.change(x => { useLegendary(x, boss.id, cost); x.log.push({ round: x.round, text: `${boss.label}: ${label}`, time: Date.now() }); });
		}
		const x = m.createEl('button', { cls: 'clickable-icon ev-moment-x', attr: { 'aria-label': 'Not now' } });
		setIcon(x, evIcon('x'));
		x.onclick = () => { this.momentDismissed = key; this.render(); };
	}

	// ------------------------------------------------------------------------
	// The turn control

	private renderFoot(root: HTMLElement, f: Fight5e, cur: Combatant5e | undefined): void {
		if (!isRunning(f)) {
			const missing = f.combatants.filter(c => isActiveRow(c) && c.init === undefined).length;
			const start = () => this.turn(x => startCombat(x, Math.random, startRolls5e(this.rt.plugin)));
			trackerFoot(root, { primary: { text: missing ? `Start combat · ${missing} to roll` : 'Start combat', icon: evIcon('play'), run: start, cls: 'dnd5e-tracker-primary dnd5e-start' } });
			this.primaryRun = start;
			return;
		}
		const nxt = upNext(f);
		const next = () => this.turn(x => nextTurn(x));
		const group = nxt ? groupOf(f, nxt.id) : [];
		// A group's first member: the group's name; once it's under way, the member who's next.
		const label = !nxt ? `Round ${f.round + 1}` : group.length > 1 && group[0].id === nxt.id ? `Next: ${plural(nxt.name)}` : `Next: ${nxt.label}`;
		trackerFoot(root, {
			back: { run: () => this.change(x => previous(x)), label: 'Back a turn' },
			primary: { text: label, icon: evIcon('next'), run: next, cls: 'dnd5e-tracker-primary dnd5e-next' },
		});
		this.primaryRun = next;
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
		setIcon(box.createDiv({ cls: 'dnd5e-tracker-empty-icon' }), evIcon('swords'));
		box.createDiv({ cls: 'dnd5e-tracker-empty-title', text: 'No one here yet' });
		box.createDiv({ cls: 'dnd5e-tracker-empty-hint', text: 'Run an encounter block from a note, or add monsters and the party here.' });
		const row = box.createDiv({ cls: 'dnd5e-tracker-empty-actions' });
		pill(row, { tag: 'button', icon: evIcon('plus'), text: 'Add monster', cls: 'mod-cta' }).onclick = () => this.pickMonster();
		pill(row, { tag: 'button', icon: evIcon('users'), text: 'Add the party' }).onclick = () => this.addParty();
	}

	// ------------------------------------------------------------------------
	// A row in the queue: mark, initiative, name (and what's on them), AC, HP

	private renderRow(list: HTMLElement, c: Combatant5e, o: { mark: MarkState; acted?: boolean; compact?: boolean; members?: Combatant5e[] }): void {
		const members = o.members ?? [c];
		const group = members.length > 1;
		const zero = c.hp <= 0;
		const row = list.createDiv({ cls: `dnd5e-combatant dnd5e-row ev-row side-${c.side} hp-${hpState(c)}` });
		row.dataset.id = c.id;
		row.toggleClass('is-acted', !!o.acted);
		row.toggleClass('is-next', o.mark === 'next');
		row.toggleClass('is-down', zero && !group);
		row.toggleClass('is-dead', !!c.dead);
		row.toggleClass('is-defeated', !!o.compact);
		row.toggleClass('is-group', group);
		if (!o.compact) selectableRow(row, c.id, `${group ? plural(c.name) : c.label}: make active`, () => this.turn(x => activate(x, c.id)));
		onLongPress(row, (e) => this.rowMenu(e, c));
		if (!o.compact) setIcon(row.createDiv({ cls: 'ev-sort-handle dnd5e-grip', attr: { 'aria-hidden': 'true' } }), evIcon('grip'));
		row.addEventListener('keydown', (e) => {
			if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
			e.preventDefault();
			this.moveBy(c, e.key === 'ArrowUp' ? -1 : 1, true);
		});

		turnMark(row, o.mark, { cls: 'dnd5e-mark' });
		this.renderInit(row, c, members);

		const n = row.createDiv({ cls: 'dnd5e-row-name' });
		const head = n.createDiv({ cls: 'dnd5e-combatant-head' });
		head.createSpan({ cls: 'dnd5e-combatant-name', text: group ? plural(c.name) : c.label });
		if (c.side === 'hero') { const cls = this.partyMember(c)?.className; if (cls) head.createSpan({ cls: 'dnd5e-row-class', text: cls }); }
		if (c.dead) head.createSpan({ cls: 'dnd5e-death-dead', text: 'Dead' });
		else if (c.side === 'hero' && zero && c.stable) head.createSpan({ cls: 'dnd5e-death-stable', text: 'Stable' });
		const sub = n.createDiv({ cls: 'dnd5e-row-sub dnd5e-conditions-row' });
		if (group) sub.createSpan({ text: `${members.filter(m => m.hp > 0).length} of ${members.length} up` });
		if (c.side === 'hero' && zero && !c.dead && !c.stable) {
			const s = c.deathSaves ?? { success: 0, failure: 0 };
			sub.createSpan({ cls: 'is-bad', text: `Dying · ${s.success}✓ ${s.failure}✗` });
		}
		if (!group) {
			if (c.concentrating) sub.createSpan({ text: 'Concentrating' });
			for (const x of c.conditions) {
				const mark = triggerMark(x);
				const s = sub.createSpan({ cls: mark ? 'is-acts' : '' });
				if (mark) setIcon(s.createSpan({ cls: 'dnd5e-row-cond-icon', attr: { 'aria-hidden': 'true' } }), mark === 'damage' ? evIcon('flame') : mark === 'save' ? evIcon('save') : evIcon('clock'));
				s.createSpan({ text: `${x.name}${x.value ? ` ${x.value}` : ''}${x.rounds !== undefined ? ` · ${x.rounds} rd` : ''}` });
			}
		}
		if (!sub.childElementCount) sub.remove();

		if (c.ac !== undefined && !o.compact) renderAc(row, c.ac, 24);
		else row.createSpan({ cls: 'dnd5e-ac-none' });
		const hp = row.createEl('button', { cls: 'dnd5e-hp-text dnd5e-row-hp', attr: { 'aria-label': `${c.label}: change HP`, 'aria-haspopup': 'dialog' } });
		if (group) {
			hp.createEl('b', { text: members.filter(m => m.hp > 0).map(m => String(m.hp)).join(' · ') || '0' });
			hp.onclick = (e) => { e.stopPropagation(); this.memberPicker(hp, members); };
		} else {
			hp.createEl('b', { text: String(c.hp) });
			hp.createEl('small', { text: c.tempHp ? ` +${c.tempHp}` : `/${c.maxHp}` });
			hp.onclick = (e) => { e.stopPropagation(); this.openHp(hp, c, 'damage'); };
		}
	}

	/** A group's HP: pick the member, then the keypad. */
	private memberPicker(anchor: HTMLElement, members: Combatant5e[]): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		openPopover(anchor, (el, close) => {
			applyLook(el, 'dnd5e');
			el.addClass('dnd5e-member-pop');
			el.createDiv({ cls: 'popover-title', text: 'Which one?' });
			for (const m of members) {
				const b = el.createEl('button', { cls: 'dnd5e-member-pick', text: `${m.label} · ${m.hp}/${m.maxHp}` });
				b.onclick = () => { close(); window.setTimeout(() => this.openHp(anchor, m, 'damage'), 0); };
			}
		}, { width: 220 });
	}

	/** Move a combatant up or down the turn order by one place (the row menu, Alt+↑/↓). */
	private moveBy(c: Combatant5e, by: number, refocus = false): void {
		// One row up or down: a group (one initiative) moves as one, and is passed as one.
		const f = this.fight;
		const unit = groupOf(f, c.id).filter(isActiveRow);
		const ids = new Set(unit.map(x => x.id));
		const rest = this.activeRows().filter(x => !ids.has(x.id));
		const at = this.activeRows().findIndex(x => x.id === unit[0]?.id);
		const neighbour = by < 0 ? this.activeRows()[at - 1] : this.activeRows()[at + unit.length];
		if (!unit.length || !neighbour) return;
		const past = groupOf(f, neighbour.id).filter(isActiveRow);
		const to = by < 0 ? rest.indexOf(past[0]) : rest.indexOf(past[past.length - 1]) + 1;
		this.change(x => {
			const others = new Set(unit.slice(1).map(m => m.id));
			moveCombatant(x, unit[0].id, to, m => isActiveRow(m) && !others.has(m.id));
			for (let k = 1; k < unit.length; k++) {
				const rows = order(x).filter(m => isActiveRow(m) && m.id !== unit[k].id);
				moveCombatant(x, unit[k].id, rows.findIndex(m => m.id === unit[k - 1].id) + 1, isActiveRow);
			}
		});
		if (refocus) this.contentEl.querySelector<HTMLElement>(`[data-flow-row="${CSS.escape(c.id)}"]`)?.focus();
	}

	/** The rows in the turn order (not the defeated): what Move up/down count in. */
	private activeRows(): Combatant5e[] {
		return order(this.fight).filter(isActiveRow);
	}

	/** Initiative: the gem on the card, the number on a row, a box before the fight. Tap to type it or roll it. */
	private renderInit(parent: HTMLElement, c: Combatant5e, group: Combatant5e[], gem = false): void {
		const set = c.init !== undefined;
		const text = set ? String(c.init) : formatMod(c.initBonus);
		const b = gem ? renderGem(parent, text, 'button') : parent.createEl('button', { cls: 'dnd5e-init', text: set ? String(c.init) : '–' });
		b.toggleClass('is-unset', !set);
		b.setAttr('aria-label', set ? `Initiative ${c.init}` : `Initiative: d20 ${formatMod(c.initBonus)}`);
		b.setAttr('aria-haspopup', 'dialog');
		b.onclick = (e) => { e.stopPropagation(); this.initPopover(b, c, group); };
	}

	private initPopover(anchor: HTMLElement, c: Combatant5e, group: Combatant5e[]): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		const all = group.length ? group : [c];
		openPopover(anchor, (el, close) => {
			el.addClass('dnd5e-init-pop');
			applyLook(el, 'dnd5e');
			el.createDiv({ cls: 'popover-title', text: `${all.length > 1 ? plural(c.name) : c.label}: initiative` });
			const row = el.createDiv({ cls: 'dnd5e-init-pop-row' });
			const input = row.createEl('input', { type: 'number', cls: 'dnd5e-init-input', attr: { 'aria-label': 'Initiative', placeholder: formatMod(c.initBonus), inputmode: 'numeric' } });
			if (c.init !== undefined) input.value = String(c.init);
			const apply = () => {
				const n = parseInt(input.value, 10);
				this.change(f => { for (const m of all) setInitiative(f, m.id, Number.isFinite(n) ? n : undefined); });
				close();
			};
			input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
			pill(row, { tag: 'button', icon: evIcon('check'), text: 'Set', cls: 'mod-cta dnd5e-init-set' }).onclick = apply;
			pill(el, { tag: 'button', icon: evIcon('d20'), text: `Roll d20 ${formatMod(c.initBonus)}`, cls: 'dnd5e-init-roll' }).onclick = () => { close(); this.rollInit(c, all); };
			window.setTimeout(() => { input.focus(); input.select(); }, 0);
		}, { width: 230 });
	}

	/** d20 + bonus through the plugin's dice (the 3D dice and the roll log); a group shares the roll. */
	private rollInit(c: Combatant5e, group: Combatant5e[] = [c]): void {
		const entry = this.rt.plugin.rollDice(`1d20${formatMod(c.initBonus)}`, `${group.length > 1 ? plural(c.name) : c.label}: initiative`, 'effect');
		if (entry?.total !== undefined) this.change(f => { for (const m of group) setInitiative(f, m.id, entry.total); });
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

	private openHp(anchor: HTMLElement, c: Combatant5e, start: 'damage' | 'heal'): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		openHpPad(anchor, {
			id: c.id, label: c.label, system: 'dnd5e', start,
			sub: `${c.hp} / ${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${c.ac !== undefined ? ` · AC ${c.ac}` : ''}`,
			crit: true, mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
			preview: (mode, v, crit, mod) => {
				const cmd = mode === 'damage' ? (v > 0 ? { kind: 'damage' as const, amount: v, crit, type: mod } : null) : mode === 'set' ? { kind: 'set' as const, amount: v } : v > 0 ? { kind: mode, amount: v } : null;
				return cmd ? previewHp(this.fight, c.id, cmd) : '';
			},
			// Vulnerable doubles and Resisted halves: the big number and the button say what lands.
			dealt: (v, crit, mod) => damageTaken({ kind: 'damage', amount: v, crit, type: mod }),
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
		const mark = triggerMark(x);
		const chip = parent.createSpan({ cls: `dnd5e-condition${mark ? ' is-acts' : ''}`, attr: { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' } });
		if (mark) setIcon(chip.createSpan({ cls: `dnd5e-condition-mark is-${mark}`, attr: { 'aria-hidden': 'true' } }), mark === 'damage' ? evIcon('flame') : mark === 'save' ? evIcon('save') : evIcon('clock'));
		chip.createSpan({ cls: 'dnd5e-condition-name', text: `${x.name}${x.value ? ` ${x.value}` : ''}` });
		if (x.rounds !== undefined) {
			const t = chip.createSpan({ cls: 'dnd5e-condition-rounds', attr: { 'aria-label': `${x.rounds} round${x.rounds === 1 ? '' : 's'} left` } });
			setIcon(t.createSpan({ cls: 'dnd5e-condition-rounds-icon', attr: { 'aria-hidden': 'true' } }), evIcon('hourglass'));
			t.createSpan({ text: String(x.rounds) });
		}
		const summary = chipSummary(x, { save: 'save' });
		if (summary) chip.setAttr('aria-label', `${x.name}: ${summary}`);
		this.chipRemove(chip, `Remove ${x.name}`, () => this.change(f => removeCondition(f, c.id, x.name)));
		const open = () => openConditionDetails(chip, this.conditionOptions(c), x);
		chip.onclick = open;
		chip.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); }
			else if (e.key === 'Delete' || e.key === 'Backspace') this.change(f => removeCondition(f, c.id, x.name));
		};
	}

	private renderConcentration(parent: HTMLElement, c: Combatant5e): void {
		const chip = parent.createSpan({ cls: 'dnd5e-condition is-concentration', attr: { 'aria-label': 'Concentrating: damage calls for a Constitution save' } });
		setIcon(chip.createSpan({ cls: 'dnd5e-condition-icon' }), evIcon('concentration'));
		chip.createSpan({ cls: 'dnd5e-condition-name', text: 'Concentrating' });
		this.chipRemove(chip, 'Stop concentrating', () => this.change(f => setConcentration(f, c.id, false)));
	}

	private chipRemove(chip: HTMLElement, label: string, run: () => void): void {
		const x = chip.createSpan({ cls: 'dnd5e-condition-x', attr: { role: 'button', 'aria-label': label } });
		setIcon(x, evIcon('x'));
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
				const b = grid.createEl('button', { cls: `condition-option dnd5e-cond-concentration${on ? ' is-applied' : ''}`, attr: { 'aria-pressed': String(on), 'aria-label': 'Concentrating' } });
				setIcon(b.createSpan({ cls: 'condition-option-icon', attr: { 'aria-hidden': 'true' } }), evIcon('concentration'));
				const t = b.createSpan({ cls: 'condition-option-text' });
				t.createEl('b', { text: 'Concentrating' });
				t.createEl('small', { text: 'Damage calls for a Constitution save' });
				if (on) setIcon(b.createSpan({ cls: 'condition-option-check', attr: { 'aria-hidden': 'true' } }), evIcon('check'));
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

	/** Every condition of the fight's edition, your own, Concentrating, or a new one. */
	private conditionPicker(anchor: HTMLElement, c: Combatant5e): void {
		openConditionPicker(anchor, this.conditionOptions(c));
	}

	// ------------------------------------------------------------------------
	// Menus

	private rowMenu(e: MouseEvent | PointerEvent, c: Combatant5e): void {
		const menu = new Menu();
		const f = this.fight;
		if (isRunning(f) && f.turnId !== c.id && isActiveRow(c)) menu.addItem(i => i.setTitle('Act now').setIcon('arrow-up').onClick(() => this.turn(x => activate(x, c.id))));
		const entry = this.entryFor(c);
		if (entry) {
			menu.addItem(i => i.setTitle('Stat block').setIcon('scroll-text').onClick(() => this.rt.quickLook(entry, this.fight.sourcePath ?? '')));
			if (c.sourceFile) menu.addItem(i => i.setTitle('Open note').setIcon('file-symlink').onClick(() => void this.app.workspace.openLinkText(c.sourceFile ?? '', '', false)));
		} else {
			const hero = this.partyMember(c);
			if (hero && isSheetMember(hero)) menu.addItem(i => i.setTitle('Open sheet').setIcon('file-symlink').onClick(() => void this.app.workspace.openLinkText(hero.id.slice('sheet:'.length), '', false)));
		}
		menu.addItem(i => i.setTitle('Roll initiative').setIcon('dices').onClick(() => this.rollInit(c, groupOf(f, c.id))));
		const rows = this.activeRows();
		const unit = groupOf(f, c.id).filter(isActiveRow);
		const at = rows.findIndex(x => x.id === (unit[0] ?? c).id);
		if (at > 0) menu.addItem(i => i.setTitle('Move up').setIcon('arrow-up').onClick(() => this.moveBy(c, -1)));
		if (at >= 0 && at + Math.max(1, unit.length) < rows.length) menu.addItem(i => i.setTitle('Move down').setIcon('arrow-down').onClick(() => this.moveBy(c, 1)));
		menu.addSeparator();
		if (at >= 0) menu.addItem(i => i.setTitle('Add a condition…').setIcon('plus').onClick(() => {
			const anchor = this.contentEl.querySelector<HTMLElement>(`[data-flow-row="${CSS.escape(c.id)}"]`) ?? this.contentEl;
			this.conditionPicker(anchor, c);
		}));
		menu.addItem(i => i.setTitle('Concentrating').setIcon('brain').setChecked(!!c.concentrating).onClick(() => this.change(x => setConcentration(x, c.id, !c.concentrating))));
		if (c.monster) {
			const m = c.monster;
			menu.addItem(i => i.setTitle('Add another').setIcon('copy-plus').onClick(() => this.change(x => addMonster(x, m, 1, { sourceFile: c.sourceFile }))));
		}
		menu.addSeparator();
		menu.addItem(i => i.setTitle('Remove').setIcon('trash-2').onClick(() => this.change(x => remove(x, c.id))));
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

	/** Add monsters from the compendium: "3 goblin" for three, Cmd/Ctrl+Enter to add and keep going. */
	private pickMonster(): void {
		const add = (e: Entry5e, n: number) => this.change(f => addMonster(f, e.monster!.monster, n, { sourceFile: e.monster!.filePath || undefined }));
		pickMonster5e(this.rt, {
			title: 'Add to the fight', pickLabel: 'Add and close', path: this.fight.sourcePath, edition: this.fight.edition, counts: true,
			placeholder: 'Search monsters… try 3 goblin, type:undead cr:1-4',
			pick: (e, n) => add(e, n),
			keep: { label: 'Add and keep open', run: (e, n) => add(e, n) },
		});
	}
}
