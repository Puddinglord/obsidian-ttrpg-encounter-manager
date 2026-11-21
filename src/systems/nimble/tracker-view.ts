// The encounter tracker sidebar: a card for whoever is acting, then the queue
// (the design study's card and queue, Nimble's way). Heroes go first, in any
// order: the tracker never assumes one, and any hero is on the card in one tap.
// Done on a hero turns the card to a legendary monster's beat, if one is in the
// fight; the monsters' side has Next, or tap any monster. Acted rows are grey
// and checked. Every change goes through nimble().encounters.

import { App, ItemView, Menu, Modal, Notice, Setting, setIcon, setTooltip, WorkspaceLeaf } from 'obsidian';
import { openGameSettings } from '../../core/settings-ui';
import type EmberVaultPlugin from '../../../main';
import { AppliedCondition, Encounter, EncounterCreature, MonsterIndexEntry } from './types';
import {
	actingCreature, awaitingLastStand, heroesToAct, HpResult, isDown, isHero, isMinionGroup, legendaryUp, nextMonster, shownLabel,
} from './encounters';
import { conditionLabel, formatLevel, groupAttack, lastStandEffect, minionDie, monsterRole, parseHpCommand, pipStep } from './rules';
import { appendRichText } from '../../core/markdown';
import { closePopover, isPopoverOpenFor, openPopover } from '../../core/popover';
import { HeroReaction, openHpCalculator } from './hp-pad';
import { confirmAction, isTouch, onLongPress } from '../../core/touch';
import { HpCommand } from './rules';
import { openPluginSettings } from '../../core/internals';
import { slideThumb } from '../../core/segmented';
import { ConditionEditorOptions, keepCustomCondition, openConditionDetails, openConditionPicker } from '../../core/tracker/condition-editor';
import { chipSummary, triggerMark } from '../../core/tracker/effects';
import { cardActions, flowKeys, flowSection, MarkState, renderTicker, selectableRow, trackerFoot, turnMark } from '../../core/tracker/flow';
import { applyLook } from '../../core/look';
import { evIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { saveFight } from './saved-fight';
import { openRecord } from './record-modal';
import { attachMonsterHover } from './inline-ref';
import { nimble } from './runtime';

export const ENCOUNTER_VIEW_TYPE = 'nimble-encounter-tracker';

export function hpClass(current: number, max: number): string {
	const ratio = max > 0 ? current / max : 0;
	if (ratio > 0.5) return 'hp-healthy';
	if (ratio > 0.25) return 'hp-wounded';
	if (ratio > 0) return 'hp-critical';
	return 'hp-dead';
}

interface Prompt {
	id: string;
	kind: 'bloodied' | 'laststand' | 'info';
	title: string;
	/** Rules text with clickable dice. */
	text?: string;
	/** Action lines (legendary choices) with clickable dice. */
	lines?: string[];
	creatureId?: string;
	label?: string;
	monsterName?: string;
	action?: { label: string; run: () => void };
}

/** A stat block action's name: "**Manglemaul.** Move 6…" → "Manglemaul". */
export function actionName(raw: string): string {
	const bold = /^\s*\*\*(.+?)\*\*/.exec(raw);
	if (bold) return bold[1].replace(/[.:]\s*$/, '').trim();
	const plain = raw.replace(/[*_]/g, '').trim();
	const m = /^([^.:(]{1,40}?)[.:]/.exec(plain);
	return (m ? m[1] : plain.split(/\s+\d/)[0]).trim().slice(0, 40);
}

/** A name short enough for a button: "Krogg, Goblin King-1" → "Krogg". */
function shortName(label: string): string {
	return label.split(',')[0].replace(/-\d+$/, '').trim() || label;
}

/** The armor as the books draw it: a filled shield with the letter (M, H), an outline with a dash for none. */
function armorShield(parent: HTMLElement, armor: string): HTMLElement {
	const el = parent.createSpan({ cls: `nimble-armor is-${armor}`, attr: { 'aria-label': armor === 'none' ? 'No armor' : armor === 'medium' ? 'Medium armor: −10 damage per hit. Crits ignore it.' : 'Heavy armor: −20 damage per hit. Crits ignore it.' } });
	const svg = el.createSvg('svg', { attr: { viewBox: '0 0 22 24', 'aria-hidden': 'true' } });
	svg.createSvg('path', { attr: { d: 'M11 1.6c3.2 1.5 6.1 2.1 9.4 2.1v7.6c0 5.6-3.9 9.4-9.4 11.3-5.5-1.9-9.4-5.7-9.4-11.3V3.7c3.3 0 6.2-.6 9.4-2.1Z' } });
	el.createEl('b', { text: armor === 'medium' ? 'M' : armor === 'heavy' ? 'H' : '–' });
	return el;
}

export class EncounterTrackerView extends ItemView {
	private prompts: Prompt[] = [];
	private flash = new Map<string, string>();
	private logOpen = false;
	/** Last side shown, so the side switch can slide from it. */
	private lastTurn: number | undefined;
	/** What Space and the footer's main button do right now. */
	private primaryRun: (() => void) | null = null;
	/** Pip counts as last drawn, so the one that changed animates. */
	private pipMem = new Map<string, number>();

	constructor(leaf: WorkspaceLeaf, private plugin: EmberVaultPlugin) {
		super(leaf);
	}

	getViewType(): string { return ENCOUNTER_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Encounters'; }
	getIcon(): string { return 'swords'; }

	async onOpen(): Promise<void> {
		this.registerEvent(nimble().encounters.on('changed', () => this.render()));
		this.registerEvent(this.plugin.events.on('roll-log-changed', () => this.renderRollLog()));
		this.registerEvent(this.plugin.campaigns.on('changed', () => { if (this.plugin.playerView() !== this.playerShown) this.render(); }));
		flowKeys(this.root, {
			select: (row) => { const enc = this.store.active; if (enc && row.dataset.flowRow) this.store.setActing(enc.id, row.dataset.flowRow); },
			done: () => this.primaryRun?.(),
			undo: () => { const enc = this.store.active; if (enc) this.store.back(enc.id); },
		});
		this.render();
	}

	/** Whether the last render was the player-view placeholder. */
	private playerShown = false;

	async onClose(): Promise<void> {
		closePopover();
	}

	private get store() { return nimble().encounters; }
	private get root() { return this.containerEl.children[1] as HTMLElement; }

	render(): void {
		const container = this.root;
		const scrollTop = container.scrollTop;
		const active = container.doc.activeElement as HTMLElement | null;
		const focusedHp = active?.dataset?.hpFor;
		const focusedRow = active?.dataset?.flowRow;
		container.empty();
		container.addClass('nimble-encounter-tracker', 'ev-tracker');
		applyLook(container, 'nimble');
		this.primaryRun = null;

		// The tracker belongs to campaigns you run. Fights in progress are kept for when you switch back.
		this.playerShown = this.plugin.playerView();
		if (this.playerShown) {
			const c = this.plugin.campaigns.active;
			const empty = container.createDiv({ cls: 'empty-message tracker-player-note' });
			empty.createEl('p', { text: `You're playing in ${c?.name ?? 'this campaign'}.` });
			empty.createEl('p', { cls: 'empty-hint', text: 'The encounter tracker is for campaigns you run. Note who you fought with /fought in your session notes.' });
			if (c) {
				const b = empty.createEl('button', { text: 'Switch to GM view' });
				b.addEventListener('click', () => void this.plugin.campaigns.setRole(c, 'gm'));
			}
			return;
		}

		const multiMode = this.plugin.settings.multipleEncounters;
		const enc = this.store.ensureActive();

		this.renderHeader(container, enc);
		if (multiMode) this.renderEncounterPicker(container);

		if (enc) {
			const body = container.createDiv({ cls: 'ev-tracker-body' });
			if (enc.creatures.length === 0) this.renderEmpty(body);
			else if (!enc.phase || enc.phase === 'setup') this.renderSetup(body, enc);
			else this.renderFight(body, enc);
			this.renderLog(body, enc);
			body.createDiv({ cls: 'roll-log-holder' });
			this.renderRollLog();
			if (enc.creatures.length) this.renderFoot(container, enc);
		} else if (multiMode) {
			container.createEl('p', { text: 'Create or select an encounter to get started.', cls: 'empty-message' });
		}

		container.scrollTop = scrollTop;
		if (this.scrollToPrompts) {
			this.scrollToPrompts = false;
			container.querySelector('.tracker-prompt')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
		if (focusedHp) container.querySelector<HTMLElement>(`[data-hp-for="${focusedHp}"]`)?.focus();
		else if (focusedRow) container.querySelector<HTMLElement>(`[data-flow-row="${focusedRow}"]`)?.focus({ preventScroll: true });
	}

	// ------------------------------------------------------------------------
	// Header, encounter picker, menus

	private renderHeader(container: HTMLElement, enc: Encounter | null): void {
		const header = container.createDiv({ cls: 'encounter-header ev-tracker-head' });
		const title = header.createEl('h3', { text: enc?.name || 'Encounter Tracker', cls: 'encounter-title' });
		if (enc) title.addEventListener('click', () => this.renameEncounter(title, enc));
		if (enc?.sourcePath) {
			const src = this.headButton(header, 'file-symlink', 'Open the note this encounter came from', 'tracker-source');
			src.onclick = () => {
				// openLinkText on a path that's gone would create an empty note there.
				const file = this.app.vault.getFileByPath(enc.sourcePath!);
				if (file) void this.app.workspace.openLinkText(file.path, '', false);
				else new Notice('The note this encounter came from has been moved or deleted.');
			};
		}
		if (enc) {
			this.headButton(header, evIcon('plus'), 'Add monster', 'tracker-add-monster').onclick = () => nimble().openAddMonsterModal();
			if (this.plugin.settings.party.length && !enc.creatures.some(isHero)) {
				this.headButton(header, evIcon('users'), 'Add the party', 'quick-add-party').onclick = () => this.store.addParty(enc.id);
			}
		}
		const more = this.headButton(header, evIcon('more'), 'Encounter options', 'tracker-more');
		more.onclick = (e) => this.encounterMenu(e, enc);
	}

	private headButton(parent: HTMLElement, icon: string, label: string, cls: string): HTMLButtonElement {
		const b = parent.createEl('button', { cls: `clickable-icon ${cls}`, attr: { 'aria-label': label } });
		setIcon(b, icon);
		return b;
	}

	private encounterMenu(e: MouseEvent, enc: Encounter | null): void {
		const menu = new Menu();
		if (enc) {
			const inCombat = !!enc.phase && enc.phase !== 'setup';
			if (this.plugin.settings.party.length) {
				menu.addItem(i => i.setTitle('Add the party').setIcon('users').onClick(() => {
					const n = this.store.addParty(enc.id);
					new Notice(n ? `Added ${n} hero${n === 1 ? '' : 'es'}` : 'The whole party is already here');
				}));
			}
			menu.addItem(i => i.setTitle(this.plugin.settings.party.length ? 'Edit party…' : 'Set up your party…').setIcon('user-cog').onClick(() => this.plugin.openParty()));
			menu.addItem(i => i.setTitle('Add monster…').setIcon('plus').onClick(() => nimble().openAddMonsterModal()));
			menu.addItem(i => i.setTitle('Open compendium').setIcon('book-open').onClick(() => void nimble().openBestiary()));
			menu.addItem(i => i.setTitle('Encounter settings…').setIcon('settings').onClick(() => { openGameSettings(this.plugin, enc.sourcePath, 'encounter'); }));
			if (inCombat) {
				menu.addSeparator();
				const round = enc.round ?? 1;
				menu.addItem(i => i.setTitle(`Next round (${round + 1})`).setIcon('skip-forward').onClick(() => this.nextRound(enc)));
				if (round > 1) menu.addItem(i => i.setTitle(`Back to round ${round - 1}`).setIcon('rotate-ccw').onClick(() => this.store.setRound(enc.id, round - 1)));
			}
			menu.addSeparator();
			menu.addItem(i => i.setTitle('Copy summary').setIcon('copy').onClick(() => {
				void navigator.clipboard.writeText(this.store.summary(enc.id));
				new Notice('Encounter summary copied');
			}));
			if (enc.sourcePath) {
				menu.addItem(i => i.setTitle('Append summary to source note').setIcon('file-plus').onClick(() => void this.appendSummary(enc)));
			}
			menu.addItem(i => i.setTitle('Save fight to a note').setIcon('save').onClick(() => void this.saveToNote(enc)));
			menu.addSeparator();
			if (inCombat) menu.addItem(i => i.setTitle('End combat').setIcon('square').onClick(() => this.endCombat(enc)));
			menu.addItem(i => i.setTitle('Restart (round 1, keep combatants)').setIcon('rotate-ccw').onClick(() => this.store.start(enc.id)));
			menu.addItem(i => i.setTitle(this.plugin.settings.multipleEncounters ? 'Delete encounter' : 'Clear encounter').setIcon('trash-2').onClick(async () => {
				const verb = this.plugin.settings.multipleEncounters ? 'Delete' : 'Clear';
				if (!await confirmAction(this.app, `${verb} "${enc.name}"?`, 'Everyone in it and its combat log will be removed.', verb, true)) return;
				this.prompts = [];
				if (this.plugin.settings.multipleEncounters) this.store.delete(enc.id);
				else this.store.clear(enc.id);
			}));
		}
		menu.showAtMouseEvent(e);
	}

	private openSettings(): void {
		openPluginSettings(this.app, this.plugin.manifest.id);
	}

	private async appendSummary(enc: Encounter): Promise<void> {
		const file = enc.sourcePath ? this.app.vault.getFileByPath(enc.sourcePath) : null;
		if (!file) { new Notice('Source note not found'); return; }
		const summary = this.store.summary(enc.id);
		await this.app.vault.process(file, text => `${text.replace(/\s*$/, '')}\n\n> [!note] Encounter result\n> ${summary}\n`);
		new Notice(`Added the summary to ${file.basename}`);
	}

	private renameEncounter(title: HTMLElement, enc: Encounter): void {
		const input = createEl('input', { type: 'text', cls: 'encounter-title-input', value: enc.name });
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			if (save && input.value.trim() && input.value.trim() !== enc.name) this.store.rename(enc.id, input.value);
			else this.render();
		};
		input.onblur = () => finish(true);
		input.onkeydown = (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
		title.replaceWith(input);
		input.focus();
		input.select();
	}

	private renderEncounterPicker(container: HTMLElement): void {
		const row = container.createDiv({ cls: 'encounter-picker' });
		const select = row.createEl('select', { cls: 'encounter-select dropdown', attr: { 'aria-label': 'Encounter' } });
		select.createEl('option', { text: 'Select encounter…', value: '' });
		for (const e of this.store.encounters) {
			const opt = select.createEl('option', { text: `${e.name} (${e.creatures.length})`, value: e.id });
			opt.selected = e.id === this.plugin.settings.activeEncounterId;
		}
		select.onchange = () => { this.prompts = []; this.store.setActive(select.value || null); };
		const add = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'New encounter' } });
		setIcon(add, 'plus');
		add.onclick = () => { this.prompts = []; this.store.create(`Encounter ${this.store.encounters.length + 1}`); };
	}

	private renderEmpty(body: HTMLElement): void {
		const box = body.createDiv({ cls: 'empty-message ev-tracker-empty' });
		box.createEl('p', { text: 'No one here yet.' });
		box.createEl('p', { cls: 'empty-hint', text: 'Use Add monster, or Run an encounter block in a note.' });
		const row = box.createDiv({ cls: 'ev-tracker-empty-actions' });
		pill(row, { tag: 'button', icon: evIcon('plus'), text: 'Add monster', cls: 'mod-cta' }).onclick = () => nimble().openAddMonsterModal();
		if (this.plugin.settings.party.length) {
			const enc = this.store.active;
			pill(row, { tag: 'button', icon: evIcon('users'), text: 'Add the party' }).onclick = () => { if (enc) this.store.addParty(enc.id); };
		}
	}

	// ------------------------------------------------------------------------
	// Before the fight: heroes' Initiative (it sets their first-turn actions), then the monsters

	private renderSetup(body: HTMLElement, enc: Encounter): void {
		const heroes = enc.creatures.filter(isHero);
		const monsters = enc.creatures.filter(c => !isHero(c));
		const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
		renderTicker(body, {
			round: enc.paused ? `Ended in round ${enc.paused.round}` : 'Setting up',
			turn: [heroes.length ? count(heroes.length, 'hero', 'heroes') : '', monsters.length ? count(monsters.length, 'monster', 'monsters') : ''].filter(Boolean).join(', '),
		});
		// Before the fight a tap still puts anyone on the card: set up HP, conditions, a note.
		const cur = actingCreature(enc);
		if (cur) this.renderCard(body, enc, cur, { beat: false });
		this.renderPrompts(body, enc);
		if (heroes.length) {
			const sec = flowSection(body, 'Initiative', { small: 'sets first-turn actions' });
			sec.setAttr('title', '1–9: one action on the first turn. 10–19: two. 20 or a natural 20: all three. Everyone has three after that.');
			const list = body.createDiv({ cls: 'ev-list creature-list side-hero' });
			for (const c of heroes) if (c.id !== cur?.id) this.renderInitRow(list, enc, c);
		}
		const shown = monsters.filter(c => c.id !== cur?.id);
		if (shown.length) {
			flowSection(body, 'Monsters', { small: `${monsters.length}` });
			const list = body.createDiv({ cls: 'ev-list creature-list side-monster' });
			for (const c of shown) this.renderRow(list, enc, c, { mark: isDown(c) ? 'out' : 'todo', setup: true });
		}
	}

	/** A hero before the fight: what they rolled for Initiative, and the actions it gives them. */
	private renderInitRow(list: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const row = list.createDiv({ cls: 'creature-item ev-row nimble-row nimble-init-row role-hero' });
		row.dataset.creatureId = c.id;
		selectableRow(row, c.id, `${this.nm(enc, c)}: put on the card`, () => this.store.setActing(enc.id, c.id));
		onLongPress(row, (e) => this.creatureMenu(e, enc, c));
		const die = row.createSpan({ cls: 'nimble-init-die', attr: { 'aria-hidden': 'true' } });
		setIcon(die, evIcon('d20'));
		const name = row.createDiv({ cls: 'creature-name-box' });
		name.createSpan({ cls: 'creature-label', text: this.nm(enc, c) });
		if (c.monster.type) name.createSpan({ cls: 'creature-sub', text: `${c.monster.type}${c.monster.level ? ` ${String(c.monster.level)}` : ''}` });
		const mid = row.createDiv({ cls: 'nimble-row-mid' });
		if (c.init !== undefined) this.actionCards(mid, c.actions ?? 3, 3);
		else mid.createSpan({ cls: 'nimble-lvl', text: 'waiting' });
		this.initInput(row, enc, c);
	}

	/** The Initiative box: what they rolled; Enter or leaving it sets their first-turn actions. */
	private initInput(parent: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const box = parent.createEl('input', { type: 'number', cls: 'nimble-init-input', attr: { 'aria-label': `${this.nm(enc, c)}: Initiative`, inputmode: 'numeric', placeholder: '–' } });
		if (c.init !== undefined) box.value = String(c.init);
		box.addEventListener('change', () => {
			const n = parseInt(box.value, 10);
			this.store.setInitiative(enc.id, c.id, Number.isFinite(n) ? n : null);
		});
		box.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.blur(); });
	}

	// ------------------------------------------------------------------------
	// The fight: ticker, the sides, the card, then the queue

	private renderFight(body: HTMLElement, enc: Encounter): void {
		const round = enc.round ?? 1;
		const cur = actingCreature(enc);
		const beat = !!enc.beat && !!cur;
		const after = enc.beat ? enc.creatures.find(c => c.id === enc.beat?.after) : undefined;
		const heroSide = enc.phase !== 'monsters';
		renderTicker(body, {
			round,
			turn: beat ? `After ${after ? this.nm(enc, after) : 'a hero'}'s turn` : cur ? `${this.nm(enc, cur)}'s turn` : heroSide ? "Heroes' side" : "Monsters' side",
			note: heroSide ? 'heroes' : 'monsters',
		});
		this.renderSides(body, enc);
		if (cur) this.renderCard(body, enc, cur, { beat, after });
		else this.renderEmptyCard(body, enc);
		this.renderPrompts(body, enc);

		const heroes = enc.creatures.filter(isHero);
		const monsters = enc.creatures.filter(c => !isHero(c));
		const heroBlock = (el: HTMLElement) => {
			if (!heroes.length) return;
			if (heroSide) {
				const toGo = heroes.filter(c => !c.done && c.id !== cur?.id && !isDown(c));
				flowSection(el, 'Heroes still to act', { small: `${toGo.length} · any order` });
				const list = el.createDiv({ cls: 'ev-list creature-list side-hero' });
				if (toGo.length) for (const c of toGo) this.renderRow(list, enc, c, { mark: 'todo' });
				else list.createDiv({ cls: 'ev-list-empty', text: monsters.length ? 'Every hero has gone. Next: the monsters.' : 'Every hero has gone.' });
			}
			const done = heroes.filter(c => (c.done || isDown(c)) && c.id !== cur?.id);
			if (done.length) {
				flowSection(el, heroSide ? 'Done' : 'Heroes, done this round', { small: String(done.length), acted: true });
				const list = el.createDiv({ cls: 'ev-list creature-list side-hero is-done-list' });
				for (const c of done) this.renderRow(list, enc, c, { mark: isDown(c) ? 'out' : 'acted', acted: true });
			}
			if (!heroSide) {
				const waiting = heroes.filter(c => !c.done && !isDown(c) && c.id !== cur?.id);
				if (waiting.length) {
					flowSection(el, 'Heroes', { small: 'not marked done' });
					const list = el.createDiv({ cls: 'ev-list creature-list side-hero' });
					for (const c of waiting) this.renderRow(list, enc, c, { mark: 'todo' });
				}
			}
		};
		const monsterBlock = (el: HTMLElement) => {
			if (!monsters.length) return;
			if (heroSide) {
				const shown = monsters.filter(c => c.id !== cur?.id);
				if (!shown.length) return;
				flowSection(el, 'Monsters', { small: 'their side is next' });
				const list = el.createDiv({ cls: 'ev-list creature-list side-monster' });
				for (const c of shown) this.renderRow(list, enc, c, { mark: isDown(c) ? 'out' : c.done ? 'acted' : 'todo', acted: c.done || isDown(c) });
				return;
			}
			const legendary = (c: EncounterCreature) => monsterRole(c.monster) === 'legendary';
			const toGo = monsters.filter(c => !c.done && !isDown(c) && !legendary(c) && c.id !== cur?.id);
			const nxt = cur ? nextMonster(enc, cur.id) : undefined;
			flowSection(el, 'Monsters still to act', { small: `${toGo.length} · any order` });
			const list = el.createDiv({ cls: 'ev-list creature-list side-monster' });
			if (toGo.length) for (const c of toGo) this.renderRow(list, enc, c, { mark: c.id === nxt?.id ? 'next' : 'todo' });
			else list.createDiv({ cls: 'ev-list-empty', text: `Everyone has acted. Next: round ${(enc.round ?? 1) + 1}.` });
			const acted = monsters.filter(c => (c.done || isDown(c) || legendary(c)) && c.id !== cur?.id);
			if (acted.length) {
				flowSection(el, 'Acted', { small: String(acted.filter(c => c.done).length), acted: true });
				const al = el.createDiv({ cls: 'ev-list creature-list side-monster is-done-list' });
				for (const c of acted) {
					const moment = legendary(c) && !c.done && !isDown(c);
					this.renderRow(al, enc, c, { mark: isDown(c) ? 'out' : moment ? 'moment' : 'acted', acted: !moment, note: moment ? 'Acts after heroes' : undefined });
				}
			}
		};
		if (heroSide) { heroBlock(body); monsterBlock(body); } else { monsterBlock(body); heroBlock(body); }
	}

	/** The side switch: the sheet's charcoal bar. Tap a side to move to it (nothing is enforced). */
	private renderSides(body: HTMLElement, enc: Encounter): void {
		const seg = body.createDiv({ cls: 'turn-segmented nimble-sides', attr: { role: 'radiogroup', 'aria-label': 'Whose side' } });
		const heroes = enc.creatures.filter(isHero).filter(c => !isDown(c));
		const monsters = enc.creatures.filter(c => !isHero(c) && !isDown(c) && monsterRole(c.monster) !== 'legendary');
		// The count in words, and short ("2/4") for a narrow sidebar.
		const side = (phase: 'heroes' | 'monsters', text: string, count: string, short: string) => {
			const on = enc.phase === phase;
			const b = seg.createEl('button', { cls: `phase-pill phase-${phase}${on ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(on), 'aria-pressed': String(on), 'aria-label': `${text}: ${count}` } });
			b.createSpan({ cls: 'phase-pill-text', text });
			const n = b.createSpan({ cls: 'phase-pill-count' });
			n.createSpan({ cls: 'phase-pill-long', text: count });
			if (short) n.createSpan({ cls: 'phase-pill-short', text: short });
			b.onclick = () => this.store.setPhase(enc.id, phase);
		};
		const done = (list: EncounterCreature[]) => `${list.filter(c => c.done).length} of ${list.length} done`;
		const frac = (list: EncounterCreature[]) => `${list.filter(c => c.done).length}/${list.length}`;
		side('heroes', 'Heroes', heroes.length ? done(heroes) : 'none', heroes.length ? frac(heroes) : '');
		side('monsters', 'Monsters', enc.phase === 'monsters' ? done(monsters) : 'waiting', enc.phase === 'monsters' ? frac(monsters) : '');
		const turn = enc.phase === 'monsters' ? 1 : 0;
		seg.dataset.phase = enc.phase;
		slideThumb(seg, turn, 2, this.lastTurn);
		this.lastTurn = turn;
	}

	/** Nobody on the card: the heroes go in whatever order the table says. */
	private renderEmptyCard(body: HTMLElement, enc: Encounter): void {
		const card = body.createDiv({ cls: 'ev-card nimble-card is-empty' });
		const heroSide = enc.phase !== 'monsters';
		const left = heroesToAct(enc);
		const anyDone = enc.creatures.some(c => isHero(c) && c.done);
		const text = heroSide
			? left.length ? (anyDone ? 'Who goes next? Tap whoever speaks up.' : 'Nobody has gone yet: tap whoever speaks up.') : 'Every hero has gone.'
			: 'Every monster has acted.';
		const k = card.createDiv({ cls: 'ev-card-kicker' });
		setIcon(k.createSpan({ cls: 'ev-card-kicker-icon' }), evIcon(heroSide ? 'hand' : 'check'));
		k.createSpan({ text });
	}

	// ------------------------------------------------------------------------
	// The card: whoever acts now, at full size, the same way for every participant

	private renderCard(body: HTMLElement, enc: Encounter, c: EncounterCreature, o: { beat: boolean; after?: EncounterCreature }): void {
		const hero = isHero(c);
		const role = hero ? 'hero' : monsterRole(c.monster);
		const card = body.createDiv({ cls: `ev-card nimble-card creature-item role-${role}${o.beat ? ' is-beat' : ''}` });
		card.dataset.creatureId = c.id;
		card.dataset.flowRow = c.id;
		card.setAttr('tabindex', '0');
		const shown = this.nm(enc, c);
		card.setAttr('aria-label', `${shown}, acting now`);
		if (!hero && !isMinionGroup(c)) card.addClass(hpClass(c.currentHp, c.maxHp));
		if (isDown(c)) card.addClass('is-down');
		if (c.done) card.addClass('is-done');
		onLongPress(card, (e) => this.creatureMenu(e, enc, c));

		if (o.beat) {
			const k = card.createDiv({ cls: 'ev-card-kicker is-beat' });
			setIcon(k.createSpan({ cls: 'ev-card-kicker-icon' }), evIcon('crown'));
			k.createSpan({ text: `After ${o.after ? this.nm(enc, o.after) : 'the hero'}'s turn` });
		}

		// Name and what they are; a hero's actions (or a legendary's phase) on the right.
		const top = card.createDiv({ cls: 'nimble-card-top' });
		const nm = top.createDiv({ cls: 'nimble-card-name creature-name-box' });
		const name = nm.createEl('h2', { cls: 'creature-label', text: shown });
		if (!hero) attachMonsterHover(this.plugin, name, () => this.entryFor(c));
		const meta = nm.createDiv({ cls: 'nimble-card-meta creature-meta' });
		const part = (text: string) => { if (meta.childElementCount) meta.createSpan({ cls: 'meta-sep', text: '·' }); return meta.createSpan({ text }); };
		if (hero) {
			const cls = [c.monster.type, c.monster.level !== undefined ? String(c.monster.level) : ''].filter(Boolean).join(' ');
			if (cls) part(cls);
			if (c.defense !== undefined) part(`Armor ${c.defense}`);
		} else {
			const lvl = formatLevel(c.monster.level);
			if (role === 'legendary') part(`${c.monster.roleLabel || 'Legendary'}${lvl ? ` · Level ${lvl}` : ''}`);
			else if (role === 'minion') part(`Minions${lvl ? ` · Level ${lvl}` : ''}`);
			else if (lvl) part(`Level ${lvl}`);
			if (role !== 'minion') armorShield(meta, c.monster.armor).addClass('armor-chip', `armor-${c.monster.armor}`);
		}
		const right = top.createDiv({ cls: 'nimble-card-side' });
		if (hero) {
			const dying = c.currentHp <= 0 && !isDown(c);
			const left = c.actions ?? 3;
			const setup = !enc.phase || enc.phase === 'setup';
			const acts = setup ? right.createDiv({ cls: 'nimble-card-init' }) : right;
			this.actionCards(acts, left, 3, { big: true, key: `act:${c.id}`, set: (n) => this.store.setActions(enc.id, c.id, n), blocked: dying ? 1 : 3 });
			if (setup) this.initInput(acts, enc, c);
			right.createEl('small', { text: dying ? '1 action while Dying' : setup ? 'Initiative sets first-turn actions' : `${left} action${left === 1 ? '' : 's'} left` });
		} else if (role === 'legendary') {
			// Its phase, in the line under the name: the name keeps the card's width.
			const bloodied = c.currentHp <= c.maxHp / 2;
			const chip = meta.createSpan({ cls: `nimble-phase-chip phase-chip${bloodied || c.lastStand ? ' is-on' : ''}`, text: c.lastStand ? 'Last Stand' : bloodied ? 'Bloodied' : 'Normal' });
			const rules = c.lastStand ? c.monster.lastStand : c.monster.bloodied;
			if (rules) this.ruleChip(chip, c.lastStand ? 'Last Stand' : 'Bloodied', rules, shown);
		}
		if (!right.childElementCount) right.remove();
		const more = top.createEl('button', { cls: 'clickable-icon creature-more', attr: { 'aria-label': `${shown}: more` } });
		setIcon(more, evIcon('more'));
		more.onclick = (e) => this.creatureMenu(e, enc, c);

		// HP: the heart and the number (tap it for the keypad), Wounds for heroes, then the bar.
		const hp = card.createDiv({ cls: 'nimble-card-hp' });
		if (isMinionGroup(c)) {
			const line = hp.createDiv({ cls: 'nimble-card-hp-row' });
			const squares = line.createDiv({ cls: 'nimble-minions is-lg', attr: { role: 'group', 'aria-label': `${c.alive} of ${c.count} standing` } });
			for (let i = 0; i < (c.count ?? 0); i++) {
				const up = i < (c.alive ?? 0);
				const pip = squares.createEl('button', { cls: `minion-pip${up ? ' is-on' : ''}`, attr: { 'aria-pressed': String(up), 'aria-label': up ? 'Drop one' : 'Bring one back' } });
				pip.onclick = () => this.store.setAlive(enc.id, c.id, pipStep(c.alive ?? 0, up, c.count ?? 0));
			}
			this.hpButton(line, enc, c, 'nimble-card-hp-num');
			line.createSpan({ cls: 'nimble-card-hp-of', text: 'left' });
		} else {
			const line = hp.createDiv({ cls: 'nimble-card-hp-row' });
			// HP's heart, filled, as the books draw it.
			const heart = line.createSpan({ cls: 'nimble-heart', attr: { 'aria-hidden': 'true' } }).createSvg('svg', { attr: { viewBox: '0 0 24 24' } });
			heart.createSvg('path', { attr: { d: 'M12 21.2s-7.6-4.6-9.7-9.3C.8 8.5 2.9 4.4 6.7 4.4c2.2 0 3.7 1.2 5.3 3 1.6-1.8 3.1-3 5.3-3 3.8 0 5.9 4.1 4.4 7.5-2.1 4.7-9.7 9.3-9.7 9.3Z', fill: 'currentColor' } });
			this.hpButton(line, enc, c, 'nimble-card-hp-num');
			if (hero) this.woundPips(line, enc, c);
			this.hpBar(hp, c, role === 'legendary');
			if (role === 'legendary' && c.monster.lastStand && !c.lastStand) {
				const effect = lastStandEffect(c.monster.lastStand, this.store.partySize(enc));
				const phase = hp.createDiv({ cls: 'nimble-phase legendary-line' });
				phase.createSpan({ text: effect ? (effect.kind === 'regain' ? `Last Stand at 0: +${effect.hp} HP` : `Last Stand at 0: ${effect.hp} more to finish`) : 'Last Stand at 0' });
				phase.createSpan({ cls: 'phase-chip', text: `Bloodied at ${Math.floor(c.maxHp / 2)}` });
			}
		}
		if (hero && c.currentHp <= 0 && !isDown(c)) {
			const d = card.createDiv({ cls: 'nimble-card-dying', attr: { title: 'Attacking costs a Wound unless a DC 10 STR save. Any hit adds 2 Wounds, 3 on a crit. Healing brings them back up.' } });
			d.setText(`Dying · ${c.wounds ?? 0} of ${c.maxWounds ?? 6} Wounds`);
		}
		if (role === 'legendary' && c.currentHp === 0 && !c.lastStand && c.monster.lastStand) {
			const b = pill(card, { tag: 'button', icon: evIcon('crown'), text: 'Trigger Last Stand', cls: 'mod-warning laststand-btn' });
			const effect = lastStandEffect(c.monster.lastStand, this.store.partySize(enc));
			if (effect) b.setAttr('title', effect.kind === 'regain' ? `Regains ${effect.hp} HP` : `${effect.hp} more damage to finish`);
			b.onclick = () => { const msg = this.store.applyLastStand(enc.id, c.id); if (msg) new Notice(msg); };
		}

		// What a monster does: its stat block's actions, dice to roll. The beat suggests the one it didn't use last.
		if (!hero) this.renderActions(card, enc, c, o.beat);

		const flash = this.flash.get(c.id);
		if (flash) card.createDiv({ cls: 'creature-flash', text: flash });
		this.renderConditions(card, enc, c);
		if (c.note) card.createDiv({ cls: 'creature-note', text: c.note });

		cardActions(card, {
			damage: (b) => this.openHp(b, enc, c, 'damage'),
			heal: (b) => this.openHp(b, enc, c, 'heal'),
			condition: (b) => this.showConditionPicker(b, enc, c),
			sheet: { label: hero ? 'Character sheet' : 'Stat block', short: hero ? 'Sheet' : 'Stat block', run: () => openRecord(this.plugin, { kind: 'combatant', encId: enc.id, creatureId: c.id }) },
		});
	}

	/** A monster's actions on its card: the book's intro ("After each hero's turn, choose one:"), then each action. */
	private renderActions(card: HTMLElement, enc: Encounter, c: EncounterCreature, beat: boolean): void {
		const m = c.monster;
		const role = monsterRole(m);
		if (isMinionGroup(c)) {
			const menu = card.createDiv({ cls: 'nimble-card-menu' });
			menu.createDiv({ cls: 'nimble-card-menu-h', text: `All ${m.name}s on one hero` });
			this.groupAttackButton(menu, c);
			return;
		}
		const list = m.attacks ?? [];
		if (!list.length && !m.multiattack) return;
		const menu = card.createDiv({ cls: 'nimble-card-menu' });
		const intro = role === 'legendary' ? (m.actionText || "After each hero's turn, choose one:") : m.actionText;
		const who = this.nm(enc, c);
		if (intro) this.rich(menu.createDiv({ cls: 'nimble-card-menu-h' }), intro, who);
		if (m.multiattack) this.rich(menu.createDiv({ cls: 'nimble-card-menu-h' }), m.multiattack, who);
		const names = list.map(a => actionName(a.raw));
		const usedLast = role === 'legendary' ? c.lastAction : undefined;
		for (const [i, atk] of list.entries()) {
			const name = names[i];
			const used = !!usedLast && name === usedLast;
			const pick = beat && !!usedLast && !used && names.length === 2;
			const row = menu.createDiv({ cls: `nimble-card-act${used ? ' is-used' : ''}${pick ? ' is-pick' : ''}`, attr: { role: 'button', tabindex: '0' } });
			const mark = () => { if (role === 'legendary') this.store.useBeatAction(enc.id, c.id, name); };
			// The action's name in the book's face: bold already ("**Bite.** 2d6"), or the words before its dice.
			const raw = !/^\s*\*\*/.test(atk.raw) && name && atk.raw.startsWith(name) ? `**${name}**${atk.raw.slice(name.length)}` : atk.raw;
			this.rich(row, raw, who, 'attack', role === 'legendary' ? mark : undefined);
			if (used) row.createSpan({ cls: 'nimble-card-act-note', text: 'used last' });
			if (role === 'legendary') {
				row.setAttr('aria-label', `${name}: use it`);
				row.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.is-clickable')) mark(); });
				row.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); mark(); } });
			}
		}
	}

	private groupAttackButton(parent: HTMLElement, c: EncounterCreature): void {
		const attack = pill(parent, { tag: 'button', icon: evIcon('dice'), text: `Group attack ×${c.alive}`, cls: 'group-attack nimble-card-act-btn' }) as HTMLButtonElement;
		attack.disabled = !c.alive;
		const roll = (n: number) => {
			const die = minionDie(c.monster);
			const r = groupAttack(Math.min(n, c.alive ?? 0), die);
			this.plugin.logRoll({
				label: `${n} ${c.monster.name}${n === 1 ? '' : 's'} attack together`,
				expression: `${n}d${die}`,
				total: r.total,
				detail: `[${r.dice.join(', ')}]${r.misses ? `, ${r.misses} miss${r.misses === 1 ? '' : 'es'}` : ''}. One Defend covers it`,
			});
		};
		attack.onclick = (e) => {
			// Shift-click (or any tap on touch screens) asks how many attack this target.
			if ((!e.shiftKey && !isTouch()) || (c.alive ?? 0) <= 1) { roll(c.alive ?? 0); return; }
			openPopover(attack, (el, close) => {
				el.createDiv({ cls: 'popover-title', text: `How many ${c.monster.name}s attack this target?` });
				const all = el.createEl('button', { cls: 'mod-cta group-attack-all', text: `All ${c.alive}` });
				all.onclick = () => { close(); roll(c.alive ?? 0); };
				const seg = el.createDiv({ cls: 'nimble-segmented' });
				for (let n = 1; n < (c.alive ?? 0); n++) {
					const b = seg.createEl('button', { text: String(n) });
					b.onclick = () => { close(); roll(n); };
				}
			}, { width: 260 });
		};
	}

	/** Three action cards: filled for those left. On the card they're buttons (one step a tap). */
	private actionCards(parent: HTMLElement, left: number, max: number, o: { big?: boolean; key?: string; set?: (n: number) => void; blocked?: number } = {}): HTMLElement {
		const el = parent.createSpan({ cls: `nimble-acts${o.big ? ' is-lg' : ''} action-pips`, attr: { role: o.set ? 'group' : 'img', 'aria-label': `${left} of ${max} actions` } });
		const was = o.key ? this.pipMem.get(o.key) : undefined;
		if (o.key) this.pipMem.set(o.key, left);
		for (let i = 0; i < max; i++) {
			const on = i < left;
			const changed = was !== undefined && was !== left && i === (left > was ? left - 1 : left) ? (left > was ? ' is-in' : ' is-out') : '';
			const cls = `action-pip${on ? ' is-on' : ''}${o.blocked !== undefined && i >= o.blocked ? ' is-blocked' : ''}${changed}`;
			if (o.set) {
				const b = el.createEl('button', { cls, attr: { 'aria-pressed': String(on), 'aria-label': on ? 'Spend an action' : 'Get an action back' } });
				const set = o.set;
				b.onclick = (e) => { e.stopPropagation(); set(pipStep(left, on, max)); };
			} else el.createEl('i', { cls });
		}
		return el;
	}

	/** Wounds: five linked pips and a skull, one step a tap. */
	private woundPips(parent: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const max = c.maxWounds ?? 6;
		const wounds = c.wounds ?? 0;
		const box = parent.createDiv({ cls: 'nimble-wounds' });
		box.createSpan({ cls: 'nimble-wounds-label', text: 'Wounds' });
		const row = box.createDiv({ cls: 'nimble-wound-row wound-pips', attr: { role: 'group', 'aria-label': `${wounds} of ${max} Wounds` } });
		const key = `wounds:${c.id}`;
		const was = this.pipMem.get(key);
		this.pipMem.set(key, wounds);
		for (let i = 0; i < max; i++) {
			const on = i < wounds;
			const skull = i === max - 1;
			const changed = was !== undefined && was !== wounds && i === (wounds > was ? wounds - 1 : wounds) ? (wounds > was ? ' is-in' : ' is-out') : '';
			const pip = row.createEl('button', { cls: `wound-pip${on ? ' is-on' : ''}${skull ? ' is-skull' : ''}${changed}`, attr: { 'aria-pressed': String(on), 'aria-label': on ? 'Remove a Wound' : 'Add a Wound' } });
			if (skull) setIcon(pip, evIcon('skull'));
			pip.onclick = (e) => { e.stopPropagation(); this.store.setWounds(enc.id, c.id, pipStep(wounds, on, max)); };
		}
	}

	private hpBar(parent: HTMLElement, c: EncounterCreature, phased: boolean): void {
		if (phased) parent = parent.createDiv({ cls: 'nimble-phased' });
		const bar = parent.createDiv({ cls: `ev-bar creature-hp-bar${c.currentHp <= 0 ? ' is-zero' : c.maxHp > 0 && c.currentHp <= c.maxHp / 2 ? ' is-low' : ''}`, attr: { 'aria-hidden': 'true' } });
		const scale = Math.max(1, c.maxHp, c.currentHp + (c.tempHp ?? 0));
		bar.createEl('i', { cls: 'creature-hp-fill' }).setCssStyles({ width: `${(100 * Math.max(0, c.currentHp)) / scale}%` });
		if (c.tempHp) bar.createEl('i', { cls: 'is-temp' }).setCssStyles({ width: `${(100 * c.tempHp) / scale}%` });
		if (phased && c.maxHp > 0) parent.createDiv({ cls: 'hp-half-mark', attr: { 'aria-label': 'Bloodied' } });
	}

	/** The HP number as a button: tap it for the keypad. Its text reads "12/20". */
	private hpButton(parent: HTMLElement, enc: Encounter, c: EncounterCreature, cls: string): HTMLButtonElement {
		const minions = isMinionGroup(c);
		const b = parent.createEl('button', { cls: `hp-display ${cls}`, attr: { 'data-hp-for': c.id, 'aria-haspopup': 'dialog', 'aria-label': `${this.nm(enc, c)}: HP` } });
		b.createEl('b', { text: minions ? String(c.alive ?? 0) : c.maxHp > 0 ? String(c.currentHp) : '—' });
		if (minions || c.maxHp > 0) b.createEl('small', { text: `/${minions ? c.count : c.maxHp}` });
		if (c.tempHp) b.createSpan({ cls: 'hp-temp', text: ` +${c.tempHp}` });
		b.onclick = (e) => { e.stopPropagation(); this.openHp(b, enc, c, 'damage'); };
		return b;
	}

	// ------------------------------------------------------------------------
	// The queue's rows

	private renderRow(list: HTMLElement, enc: Encounter, c: EncounterCreature, o: { mark: MarkState; acted?: boolean; note?: string; setup?: boolean }): void {
		const hero = isHero(c);
		const role = hero ? 'hero' : monsterRole(c.monster);
		const row = list.createDiv({ cls: `creature-item ev-row nimble-row role-${role}` });
		row.dataset.creatureId = c.id;
		if (!hero && !isMinionGroup(c)) row.addClass(hpClass(c.currentHp, c.maxHp));
		if (c.done) row.addClass('is-done');
		if (o.acted) row.addClass('is-acted');
		if (isDown(c)) row.addClass('is-down');
		if (c.maxHp > 0 && c.currentHp > 0 && c.currentHp <= c.maxHp / 2 && !isMinionGroup(c)) row.addClass('is-low');
		const waiting = (enc.phase === 'heroes' && !hero) || (enc.phase === 'monsters' && hero);
		if (waiting && !c.done) row.addClass('is-waiting');
		const shown = this.nm(enc, c);
		selectableRow(row, c.id, `${shown}: put on the card`, () => this.store.setActing(enc.id, c.id));
		onLongPress(row, (e) => this.creatureMenu(e, enc, c));
		this.makeDraggable(row, list, enc, c);

		turnMark(row, o.mark, {
			cls: `turn-toggle${c.done ? ' is-done' : ''}`,
			label: c.done ? 'Undo turn' : 'Mark turn done',
			onClick: o.setup ? undefined : () => this.toggleDone(enc, c),
		});

		const nameBox = row.createDiv({ cls: 'creature-name-box' });
		const label = nameBox.createSpan({ cls: 'creature-label', text: shown });
		if (!hero) attachMonsterHover(this.plugin, label, () => this.entryFor(c));
		const sub = nameBox.createDiv({ cls: 'creature-sub conditions-row' });
		if (hero && c.monster.type) sub.createSpan({ cls: 'creature-class', text: `${c.monster.type}${c.monster.level !== undefined ? ` ${String(c.monster.level)}` : ''}` });
		for (const name of this.autoConditions(c)) sub.createSpan({ cls: 'row-cond is-bad auto-condition', text: name });
		for (const x of c.conditions) {
			const s = sub.createSpan({ cls: `row-cond${triggerMark(x) ? ' is-acts' : ''}` });
			const mark = triggerMark(x);
			if (mark) setIcon(s.createSpan({ cls: 'row-cond-icon', attr: { 'aria-hidden': 'true' } }), mark === 'damage' ? evIcon('flame') : mark === 'save' ? evIcon('save') : evIcon('clock'));
			s.createSpan({ text: `${conditionLabel(x)}${x.rounds ? ` · ${x.rounds} rd` : ''}` });
		}
		const note = o.note ?? (c.conditions.length || this.autoConditions(c).length ? undefined : hero ? undefined : role === 'legendary' ? 'Acts after each hero' : role === 'minion' ? 'Die to any damage' : undefined);
		if (note) sub.createSpan({ cls: 'row-note', text: note });
		if (!sub.childElementCount) sub.remove();

		// The middle: a hero's actions; a monster's level and armor; how many minions are left.
		const mid = row.createDiv({ cls: 'nimble-row-mid' });
		if (hero) {
			const dying = c.currentHp <= 0 && !isDown(c);
			this.actionCards(mid, o.acted ? 0 : Math.min(c.actions ?? 3, dying ? 1 : 3), 3, { blocked: dying ? 1 : undefined });
		}
		else if (isMinionGroup(c)) mid.createSpan({ cls: 'nimble-lvl', text: `${c.alive} left` });
		else {
			const lvl = formatLevel(c.monster.level);
			if (lvl) mid.createSpan({ cls: 'nimble-lvl', text: `L${lvl}` });
			armorShield(mid, c.monster.armor);
		}

		// HP: the number (tap for the keypad) over a thin bar; minions as squares.
		const hp = row.createDiv({ cls: 'nimble-row-hp' });
		const btn = this.hpButton(hp, enc, c, 'nimble-row-hp-num');
		if (isMinionGroup(c)) {
			btn.empty();
			btn.setAttr('aria-label', `${this.nm(enc, c)}: ${c.alive} of ${c.count} standing`);
			btn.createSpan({ cls: 'nimble-minions-text', text: `${c.alive}/${c.count}` });
			const sq = btn.createSpan({ cls: 'nimble-minions', attr: { 'aria-hidden': 'true' } });
			for (let i = 0; i < (c.count ?? 0); i++) sq.createEl('i', { cls: i < (c.alive ?? 0) ? 'is-on' : '' });
		} else if (c.maxHp > 0) this.hpBar(hp, c, false);

		const flash = this.flash.get(c.id);
		if (flash) nameBox.createDiv({ cls: 'creature-flash', text: flash });
		if (c.note) nameBox.createDiv({ cls: 'creature-note', text: c.note });
	}

	/** What the tracker knows on its own: Dying, Dead, Bloodied, Defeated, Last Stand. */
	private autoConditions(c: EncounterCreature): string[] {
		const auto: string[] = [];
		if (isHero(c)) {
			if (isDown(c)) auto.push('Dead');
			else if (c.currentHp <= 0 && c.maxHp > 0) auto.push('Dying');
		} else if (!isMinionGroup(c)) {
			if (awaitingLastStand(c)) auto.push('Last Stand ready');
			else if (c.currentHp <= 0) auto.push(monsterRole(c.monster) === 'legendary' && c.lastStand ? 'Last Stand' : 'Defeated');
			else if (c.currentHp <= c.maxHp / 2 && monsterRole(c.monster) !== 'legendary') auto.push('Bloodied');
		}
		return auto;
	}

	private toggleDone(enc: Encounter, c: EncounterCreature): void {
		const inCombat = !!enc.phase && enc.phase !== 'setup';
		if (inCombat && enc.acting === c.id && !c.done) { this.next(enc); return; }
		const expired = this.store.setDone(enc.id, c.id, !c.done);
		if (expired.length) new Notice(`${this.nm(enc, c)}: ${expired.join(', ')} wore off`);
	}

	// ------------------------------------------------------------------------
	// The turn control

	private renderFoot(container: HTMLElement, enc: Encounter): void {
		const inCombat = !!enc.phase && enc.phase !== 'setup';
		const round = enc.round ?? 1;
		const back = { run: () => this.store.back(enc.id), disabled: !this.store.canGoBack(enc.id) };
		let primary: { text: string; icon: string; run: () => void; disabled?: boolean };
		let second: { text: string; icon: string; run: () => void; cls?: string } | undefined;
		if (!inCombat) {
			if (enc.paused) {
				primary = { text: `Resume round ${enc.paused.round}`, icon: evIcon('play'), run: () => { this.prompts = []; this.store.resume(enc.id); } };
				second = { text: 'New fight', icon: 'rotate-ccw', cls: 'tracker-new-fight', run: () => { this.prompts = []; this.store.start(enc.id); } };
			} else {
				const heroes = enc.creatures.some(isHero);
				primary = { text: heroes ? 'Heroes go first' : 'Start combat', icon: evIcon('play'), run: () => { this.prompts = []; this.store.start(enc.id); }, disabled: !enc.creatures.length };
			}
			trackerFoot(container, { primary: { ...primary, cls: 'round-action' }, second });
			this.primaryRun = primary.disabled ? null : primary.run;
			return;
		}
		const cur = actingCreature(enc);
		const next = () => this.next(enc);
		if (enc.phase !== 'monsters') {
			const boss = this.plugin.settings.legendaryBeat !== false ? legendaryUp(enc) : undefined;
			if (enc.beat && cur) primary = heroesToAct(enc).length ? { text: 'Back to heroes', icon: evIcon('arrow-right'), run: next } : { text: "Monsters' turn", icon: evIcon('next'), run: next };
			else if (cur && isHero(cur)) primary = { text: boss && boss.id !== cur.id ? `Done · ${shortName(this.nm(enc, boss))} acts` : 'Done', icon: evIcon('check'), run: next };
			else if (cur) primary = { text: 'Done', icon: evIcon('check'), run: next };
			else primary = { text: "Monsters' turn", icon: evIcon('next'), run: next };
		} else {
			const nxt = nextMonster(enc, cur?.id);
			primary = cur && nxt ? { text: `Next: ${this.nm(enc, nxt)}`, icon: evIcon('next'), run: next } : { text: `Round ${round + 1}`, icon: evIcon('next'), run: () => cur ? next() : this.nextRound(enc) };
		}
		trackerFoot(container, { back, primary: { ...primary, cls: 'round-action' } });
		this.primaryRun = primary.run;
	}

	/** The main button's step; whatever wore off on the way is said, as marking a turn done says it. */
	private next(enc: Encounter): void {
		for (const line of this.store.next(enc.id)) new Notice(line);
	}

	private nextRound(enc: Encounter): void {
		const expired = this.store.nextRound(enc.id);
		if (expired.length) new Notice(`Wore off: ${expired.join(', ')}`);
	}

	private endCombat(enc: Encounter): void {
		this.store.end(enc.id);
		this.prompts = [];
	}

	private async saveToNote(enc: Encounter): Promise<void> {
		const file = await saveFight(this.plugin, enc);
		if (!file) return;
		this.plugin.rerenderNotes(); // the source note's encounter block now offers Resume
		let notice: Notice | null = null;
		notice = new Notice(createFragment(f => {
			f.appendText(`Fight saved to ${file.basename}. `);
			const open = f.createEl('a', { text: 'Open it', href: '#' });
			open.addEventListener('click', (e) => { e.preventDefault(); void this.app.workspace.getLeaf('tab').openFile(file); notice?.hide(); });
		}), 6000);
	}

	// ------------------------------------------------------------------------
	// Prompts (Bloodied, Last Stand): quiet moments under the card, never in the way

	private pushPrompt(p: Prompt): void {
		this.prompts = [p, ...this.prompts.filter(x => x.id !== p.id)].slice(0, 6);
		this.scrollToPrompts = true;
	}

	private scrollToPrompts = false;

	private renderPrompts(container: HTMLElement, enc: Encounter): void {
		this.prompts = this.prompts.filter(p => !p.creatureId || enc.creatures.some(c => c.id === p.creatureId));
		// A Last Stand already played (from the card's own button, or another tracker pane) needs no prompt.
		this.prompts = this.prompts.filter(p => p.kind !== 'laststand' || !enc.creatures.find(c => c.id === p.creatureId)?.lastStand);
		for (const p of this.prompts) {
			const box = container.createDiv({ cls: `tracker-prompt ev-moment prompt-${p.kind}` });
			setIcon(box.createSpan({ cls: 'ev-moment-icon', attr: { 'aria-hidden': 'true' } }), evIcon(p.kind === 'laststand' ? 'skull' : 'crown'));
			const main = box.createDiv({ cls: 'ev-moment-body' });
			const head = main.createDiv({ cls: 'prompt-head' });
			head.createSpan({ cls: 'prompt-title', text: p.title });
			const x = box.createEl('button', { cls: 'clickable-icon ev-moment-x', attr: { 'aria-label': 'Dismiss' } });
			setIcon(x, evIcon('x'));
			x.onclick = () => { this.prompts = this.prompts.filter(q => q !== p); this.render(); };
			const creature = p.creatureId ? enc.creatures.find(c => c.id === p.creatureId) : undefined;
			const name = (creature ? this.nm(enc, creature) : '') || p.monsterName || '';
			if (p.text) this.rich(main.createDiv({ cls: 'prompt-text' }), p.text, name);
			if (p.lines?.length) {
				const ul = main.createEl('ul', { cls: 'prompt-lines' });
				for (const l of p.lines) this.rich(ul.createEl('li'), l, name, 'attack');
			}
			if (p.action) {
				const b = main.createEl('button', { cls: 'mod-cta prompt-action', text: p.action.label });
				b.onclick = () => { p.action!.run(); this.prompts = this.prompts.filter(q => q !== p); this.render(); };
			}
		}
	}

	/** Rules text with clickable dice and condition names. */
	private rich(el: HTMLElement, text: string, label: string, kind: 'attack' | 'effect' = 'effect', onRoll?: () => void): void {
		appendRichText(el, text, {
			onDice: this.plugin.settings.clickableDice ? (span, expr) => {
				span.addClass('is-clickable');
				span.setAttr('role', 'button');
				span.setAttr('tabindex', '0');
				span.setAttr('title', `Roll ${expr}`);
				span.onclick = (e) => { e.stopPropagation(); this.plugin.rollDice(expr, label, kind); onRoll?.(); };
			} : undefined,
			keywords: nimble().conditionKeywords(),
			onKeyword: (span, word) => nimble().markWord(span, word),
		});
	}

	/** The name as shown: a lone monster without its number ("Goblin", not "Goblin-1"). */
	private nm(enc: Encounter, c: EncounterCreature): string {
		return shownLabel(c, enc.creatures);
	}

	private entryFor(c: EncounterCreature): MonsterIndexEntry {
		return { name: c.monster.name, filePath: c.sourceFile || '', monster: c.monster, bundled: !c.sourceFile && !!c.monster.bundledId };
	}

	/** A chip whose rules text shows on hover (title) and on tap (popover), since touch has no hover. */
	private ruleChip(chip: HTMLElement, title: string, text: string, label: string): void {
		chip.setAttr('title', text.replace(/\*\*/g, ''));
		chip.setAttr('role', 'button');
		chip.setAttr('tabindex', '0');
		const show = () => {
			if (isPopoverOpenFor(chip)) { closePopover(); return; }
			openPopover(chip, (el) => {
				el.createDiv({ cls: 'popover-title', text: title });
				this.rich(el.createDiv({ cls: 'popover-body' }), text, label);
			}, { width: 300 });
		};
		chip.addEventListener('click', show);
		chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
	}

	private creatureMenu(e: MouseEvent | PointerEvent, enc: Encounter, c: EncounterCreature): void {
		const menu = new Menu();
		const inCombat = !!enc.phase && enc.phase !== 'setup';
		if (inCombat && enc.acting !== c.id) menu.addItem(i => i.setTitle('Put on the card').setIcon('arrow-up').onClick(() => this.store.setActing(enc.id, c.id)));
		menu.addItem(i => i.setTitle(c.done ? 'Undo turn' : 'Mark turn done').setIcon('check').onClick(() => this.toggleDone(enc, c)));
		if (!isHero(c)) {
			menu.addItem(i => i.setTitle('View stat block').setIcon('scroll').onClick(() => openRecord(this.plugin, { kind: 'combatant', encId: enc.id, creatureId: c.id })));
			const entry = this.entryFor(c);
			if (entry.bundled || c.sourceFile) menu.addItem(i => i.setTitle(entry.bundled ? 'Open in bestiary' : 'Open note').setIcon(entry.bundled ? 'book-open' : 'file-symlink').onClick(() => nimble().openMonster(entry)));
			menu.addItem(i => i.setTitle(isMinionGroup(c) ? 'Add one more' : 'Duplicate').setIcon('copy-plus').onClick(() => this.store.duplicate(enc.id, c.id)));
			if (!isMinionGroup(c)) {
				menu.addItem(i => i.setTitle('Make tougher (+1 level)').setIcon('trending-up').onClick(() => this.store.shiftLevel(enc.id, c.id, 1)));
				menu.addItem(i => i.setTitle('Make weaker (−1 level)').setIcon('trending-down').onClick(() => this.store.shiftLevel(enc.id, c.id, -1)));
			}
		} else {
			menu.addItem(i => i.setTitle('Character sheet').setIcon('scroll').onClick(() => openRecord(this.plugin, { kind: 'combatant', encId: enc.id, creatureId: c.id })));
		}
		menu.addItem(i => i.setTitle('Rename').setIcon('pencil').onClick(() => this.startRename(enc, c)));
		const side = enc.creatures.filter(x => isHero(x) === isHero(c));
		const at = side.indexOf(c);
		if (at > 0) menu.addItem(i => i.setTitle('Move up').setIcon('arrow-up').onClick(() => this.store.reorder(enc.id, c.id, side[at - 1].id)));
		if (at < side.length - 1) menu.addItem(i => i.setTitle('Move down').setIcon('arrow-down').onClick(() => this.store.reorder(enc.id, c.id, side[at + 1].id)));
		menu.addItem(i => i.setTitle(c.note ? 'Edit note' : 'Add note').setIcon('sticky-note').onClick(() => {
			new NoteModal(this.app, this.nm(enc, c), c.note || '', (note) => this.store.setNote(enc.id, c.id, note)).open();
		}));
		menu.addSeparator();
		menu.addItem(i => i.setTitle('Remove').setIcon('trash-2').onClick(() => {
			this.store.remove(enc.id, c.id);
		}));
		menu.showAtMouseEvent(e);
	}

	// ------------------------------------------------------------------------
	// HP entry

	private applyInput(enc: Encounter, c: EncounterCreature, input: string): boolean {
		const cmd = parseHpCommand(input);
		if (!cmd) return false;
		this.applyCmd(enc, c, cmd);
		return true;
	}

	private applyCmd(enc: Encounter, c: EncounterCreature, cmd: HpCommand, react: HeroReaction = {}): void {
		const r: HpResult = isHero(c) && cmd.kind === 'damage' && (react.defend || react.interpose)
			? this.store.heroHit(enc.id, c.id, cmd, react)
			: this.store.applyHp(enc.id, c.id, cmd);
		const after = this.store.creature(enc.id, c.id);
		if (r.breakdown) {
			this.flash.set(c.id, r.breakdown);
			// The working fades after a while; not under a name being typed (the next redraw drops it).
			window.setTimeout(() => { this.flash.delete(c.id); if (this.flash.size === 0 && !this.root.querySelector('.label-edit-input')) this.render(); }, 5000);
			this.render();
		}
		if (!after) return;
		const m = after.monster;
		if (r.crossed === 'bloodied' && m.bloodied) {
			this.pushPrompt({ id: `blood-${c.id}`, kind: 'bloodied', creatureId: c.id, title: `${this.nm(enc, after)} is Bloodied`, text: m.bloodied });
			this.render();
		} else if (r.crossed === 'last-stand' && m.lastStand && !after.lastStand) {
			const effect = lastStandEffect(m.lastStand, this.store.partySize(enc));
			this.pushPrompt({
				id: `last-${c.id}`, kind: 'laststand', creatureId: c.id, title: `${this.nm(enc, after)}: Last Stand!`, text: m.lastStand,
				action: { label: effect ? (effect.kind === 'regain' ? `Apply: regain ${effect.hp} HP` : `Apply: ${effect.hp} more damage to finish`) : 'Mark Last Stand', run: () => { this.store.applyLastStand(enc.id, c.id); } },
			});
			this.render();
		}
	}

	/** The keypad beside whatever was tapped (a bottom sheet on phones). A hero's has Defend and Interpose as quiet chips. */
	private openHp(anchor: HTMLElement, enc: Encounter, c: EncounterCreature, start: 'damage' | 'heal'): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		const friends = isHero(c) ? enc.creatures.filter(x => isHero(x) && x.id !== c.id && !isDown(x)) : [];
		openHpCalculator(anchor, c, this.plugin.settings.autoArmor, (cmd, react) => this.applyCmd(enc, c, cmd, react), { start, friends, label: this.nm(enc, c) });
	}

	// ------------------------------------------------------------------------
	// Conditions

	/** The card's chips: what the tracker knows (Bloodied, Dying), then each condition (tap for its details). */
	private renderConditions(card: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const auto = this.autoConditions(c).filter(n => n !== 'Dying');
		if (!auto.length && !c.conditions.length) return;
		const row = card.createDiv({ cls: 'conditions-row nimble-card-chips' });
		for (const name of auto) row.createSpan({ cls: 'condition-tag auto-condition is-bad', text: name });
		for (const applied of c.conditions) this.renderConditionChip(row, enc, c, applied);
	}

	private renderConditionChip(row: HTMLElement, enc: Encounter, c: EncounterCreature, applied: AppliedCondition): void {
		const cond = nimble().condition(applied.name);
		const mark = triggerMark(applied);
		const tag = row.createSpan({ cls: `condition-tag${mark ? ' is-acts' : ''}`, attr: { role: 'button', tabindex: '0' } });
		if (cond?.minor) tag.addClass('is-minor');
		if (mark) setIcon(tag.createSpan({ cls: `condition-mark is-${mark}`, attr: { 'aria-hidden': 'true' } }), mark === 'damage' ? evIcon('flame') : mark === 'save' ? evIcon('save') : evIcon('clock'));
		tag.createSpan({ cls: 'condition-name', text: conditionLabel(applied) });
		if (applied.rounds) {
			const t = tag.createSpan({ cls: 'condition-rounds', attr: { 'aria-label': `${applied.rounds} round${applied.rounds === 1 ? '' : 's'} left` } });
			setIcon(t.createSpan({ cls: 'condition-rounds-icon', attr: { 'aria-hidden': 'true' } }), evIcon('hourglass'));
			t.createSpan({ text: String(applied.rounds) });
		}
		const summary = chipSummary(applied, { save: 'save' });
		if (summary) tag.setAttr('aria-label', `${conditionLabel(applied)}: ${summary}`);
		const x = tag.createSpan({ cls: 'remove-condition', attr: { 'aria-label': `Remove ${applied.name}`, role: 'button' } });
		setIcon(x, evIcon('x'));
		x.onclick = (e) => { e.stopPropagation(); this.store.removeCondition(enc.id, c.id, applied.name); };
		const open = () => openConditionDetails(tag, this.conditionOptions(enc, c), applied);
		tag.onclick = open;
		tag.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); } else if (e.key === 'Delete' || e.key === 'Backspace') this.store.removeCondition(enc.id, c.id, applied.name); };
	}

	/** Core's condition editor (core/tracker/condition-editor.ts), told Nimble's words and how to change this fight. */
	private conditionOptions(enc: Encounter, c: EncounterCreature): ConditionEditorOptions {
		const words = { save: 'save' };
		return {
			system: 'nimble',
			bearer: { id: c.id, label: this.nm(enc, c) },
			defs: nimble().getAllConditions(),
			customNames: this.plugin.settings.customConditions.map(d => d.name),
			applied: c.conditions,
			others: enc.creatures.filter(x => x.id !== c.id).map(x => ({ id: x.id, label: this.nm(enc, x) })),
			abilities: ['STR', 'DEX', 'INT', 'WIL'],
			words,
			value: { label: 'X =', ask: true },
			quick: [['Until removed', undefined], ['1 rd', 1], ['2', 2], ['3', 3]],
			placement: 'side',
			sideOf: this.containerEl,
			add: (name, o) => this.store.addCondition(enc.id, c.id, name, { value: o.value, timing: o.timing, sourceId: o.sourceId }),
			update: (name, o) => {
				this.store.retimeCondition(enc.id, c.id, name, o.timing, o.sourceId);
				if (o.value !== undefined) this.store.updateCondition(enc.id, c.id, name, { value: o.value });
			},
			remove: (name) => this.store.removeCondition(enc.id, c.id, name),
			saveCustom: (d) => keepCustomCondition(this.plugin, d, words),
		};
	}

	private showConditionPicker(anchor: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		openConditionPicker(anchor, this.conditionOptions(enc, c));
	}

	// ------------------------------------------------------------------------

	private startRename(enc: Encounter, c: EncounterCreature): void {
		const label = this.root.querySelector<HTMLElement>(`[data-creature-id="${c.id}"] .creature-label`);
		if (!label) return;
		// The name as it's shown; it's only saved if it changes.
		const shown = this.nm(enc, c);
		const input = createEl('input', { type: 'text', cls: 'label-edit-input', value: shown });
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			if (save && input.value.trim() && input.value.trim() !== shown) this.store.renameCreature(enc.id, c.id, input.value);
			else this.render();
		};
		input.onblur = () => finish(true);
		input.onkeydown = (e) => {
			if (e.key === 'Enter') finish(true);
			else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
		};
		input.onclick = (e) => e.stopPropagation();
		label.replaceWith(input);
		input.focus();
		input.select();
	}

	private makeDraggable(item: HTMLElement, list: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		item.setAttr('draggable', 'true');
		item.ondragstart = (e) => {
			if ((e.target as HTMLElement).closest('input, button')) { e.preventDefault(); return; }
			item.addClass('dragging');
			e.dataTransfer?.setData('text/plain', c.id);
		};
		item.ondragend = () => {
			item.removeClass('dragging');
			list.querySelectorAll('.drag-over').forEach(el => el.removeClass('drag-over'));
		};
		item.ondragover = (e) => {
			e.preventDefault();
			const dragging = list.querySelector('.dragging');
			if (dragging && dragging !== item) item.addClass('drag-over');
		};
		item.ondragleave = () => item.removeClass('drag-over');
		item.ondrop = (e) => {
			e.preventDefault();
			item.removeClass('drag-over');
			const draggedId = e.dataTransfer?.getData('text/plain');
			if (draggedId && draggedId !== c.id) this.store.reorder(enc.id, draggedId, c.id);
		};
	}

	// ------------------------------------------------------------------------
	// Logs

	private renderLog(container: HTMLElement, enc: Encounter): void {
		const log = enc.log || [];
		if (!log.length) return;
		const details = container.createEl('details', { cls: 'combat-log ev-fold' });
		details.open = this.logOpen;
		details.addEventListener('toggle', () => { this.logOpen = details.open; });
		const sum = details.createEl('summary');
		sum.createSpan({ cls: 'ev-fold-label', text: 'Combat log' });
		sum.createSpan({ cls: 'ev-fold-count', text: String(log.length) });
		const ul = details.createEl('ul');
		for (const entry of log.slice(0, 40)) {
			const li = ul.createEl('li');
			li.createSpan({ cls: 'log-round', text: `R${entry.round}` });
			li.appendText(` ${entry.text}`);
		}
	}

	private renderRollLog(): void {
		const holder = this.root.querySelector<HTMLElement>('.roll-log-holder');
		if (!holder) return;
		holder.empty();
		const log = this.plugin.settings.rollLog || [];
		if (!log.length) return;
		const section = holder.createDiv({ cls: 'roll-log' });
		const header = section.createDiv({ cls: 'roll-log-header' });
		header.createEl('h4', { text: 'Recent rolls' });
		const clear = header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Clear roll log' } });
		setIcon(clear, 'trash-2');
		setTooltip(clear, 'Clear roll log', { delay: 350 });
		clear.onclick = () => this.plugin.clearRollLog();
		const list = section.createEl('ul', { cls: 'roll-log-list' });
		for (const entry of log.slice(0, 8)) {
			const li = list.createEl('li', { cls: 'roll-log-entry' });
			if (entry.outcome) li.addClass(`is-${entry.outcome}`);
			const top = li.createDiv({ cls: 'roll-log-top' });
			top.createSpan({ cls: 'roll-log-label', text: entry.label });
			top.createSpan({ cls: 'roll-log-total', text: entry.outcome === 'miss' ? 'MISS' : entry.outcome === 'crit' ? `${entry.total} CRIT` : String(entry.total) });
			li.createDiv({ cls: 'roll-log-detail', text: `${entry.expression}: ${entry.detail}` });
			li.oncontextmenu = (e) => {
				const menu = new Menu();
				menu.addItem(i => i.setTitle('Copy result').setIcon('copy').onClick(() => {
					void navigator.clipboard.writeText(`${entry.label}: ${entry.total} (${entry.expression}: ${entry.detail})`);
				}));
				menu.showAtMouseEvent(e);
			};
		}
	}
}

/** A short note on a combatant ("hiding behind the crates", "charmed by Ilse"). */
class NoteModal extends Modal {
	constructor(app: App, private label: string, private value: string, private onSave: (note: string) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Note for ${this.label}`);
		const area = this.contentEl.createEl('textarea', { cls: 'nimble-note-input', attr: { rows: '3', placeholder: 'e.g. Hiding behind the crates; charmed by Ilse' } });
		area.value = this.value;
		area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.save(area.value); } });
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Save').setCta().onClick(() => this.save(area.value)));
		window.setTimeout(() => area.focus(), 0);
	}

	private save(note: string): void {
		this.onSave(note);
		this.close();
	}

	onClose(): void { this.contentEl.empty(); }
}
