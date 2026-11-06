// The encounter tracker sidebar. Nimble turn order: heroes act first in any
// order, then the monsters. Every change goes through plugin.encounters.

import { App, ItemView, Menu, Modal, Notice, Setting, setIcon, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { AppliedCondition, Encounter, EncounterCreature, MonsterIndexEntry } from './types';
import { awaitingLastStand, EncounterStore, HpResult, isDown, isHero, isMinionGroup } from './encounters';
import { conditionLabel, formatLevel, groupAttack, lastStandEffect, minionDie, monsterRole, parseHpCommand } from './rules';
import { appendRichText } from './markdown';
import { closePopover, isPopoverOpenFor, openPopover } from './popover';
import { openHpCalculator } from './hp-pad';
import { confirmAction, isTouch } from './touch';
import { HpCommand } from './rules';
import { openPluginSettings } from './internals';
import { slideThumb } from './segmented';
import { saveFight } from './saved-fight';
import { openRecord } from './record-modal';

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

export class EncounterTrackerView extends ItemView {
	private prompts: Prompt[] = [];
	private flash = new Map<string, string>();
	private logOpen = false;
	/** Last turn shown, so the turn control can slide from it. */
	private lastTurn: number | undefined;

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
	}

	getViewType(): string { return ENCOUNTER_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Encounters'; }
	getIcon(): string { return 'swords'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.encounters.on('changed', () => this.render()));
		this.registerEvent(this.plugin.events.on('roll-log-changed', () => this.renderRollLog()));
		this.render();
	}

	async onClose(): Promise<void> {
		closePopover();
	}

	private get store() { return this.plugin.encounters; }
	private get root() { return this.containerEl.children[1] as HTMLElement; }

	render(): void {
		const container = this.root;
		const scrollTop = container.scrollTop;
		const focusedHp = (container.doc.activeElement as HTMLElement | null)?.dataset?.hpFor;
		container.empty();
		container.addClass('nimble-encounter-tracker');

		const multiMode = this.plugin.settings.multipleEncounters;
		const enc = this.store.ensureActive();

		this.renderHeader(container, enc);
		if (multiMode) this.renderEncounterPicker(container);

		if (enc) {
			this.renderControls(container, enc);
			this.renderPrompts(container, enc);
			if (enc.creatures.length === 0) {
				const empty = container.createDiv({ cls: 'empty-message' });
				empty.createEl('p', { text: 'No one here yet.' });
				empty.createEl('p', { cls: 'empty-hint', text: 'Use Add monster, or Run an encounter block in a note.' });
			} else {
				// Whoever's turn it is goes on top.
				const sides = EncounterStore.sides(enc);
				if (enc.phase === 'monsters') sides.reverse();
				for (const { side, creatures } of sides) {
					if (!creatures.length) continue;
					const head = container.createDiv({ cls: 'side-header' });
					head.createSpan({ text: side === 'hero' ? 'Heroes' : 'Monsters' });
					const done = creatures.filter(c => c.done).length;
					const up = creatures.filter(c => !isDown(c)).length;
					head.createSpan({ cls: 'side-count', text: `${done}/${up} gone` });
					const list = container.createEl('ul', { cls: `creature-list side-${side}` });
					for (const c of creatures) this.renderCreature(list, enc, c);
				}
			}
			this.renderLog(container, enc);
		} else if (multiMode) {
			container.createEl('p', { text: 'Create or select an encounter to get started.', cls: 'empty-message' });
		}

		container.createDiv({ cls: 'roll-log-holder' });
		this.renderRollLog();

		container.scrollTop = scrollTop;
		if (this.scrollToPrompts) {
			this.scrollToPrompts = false;
			container.querySelector('.tracker-prompt')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
		if (focusedHp) container.querySelector<HTMLElement>(`[data-hp-for="${focusedHp}"]`)?.focus();
	}

	// ------------------------------------------------------------------------
	// Header, round bar, quick add

	private renderHeader(container: HTMLElement, enc: Encounter | null): void {
		const header = container.createDiv({ cls: 'encounter-header' });
		const title = header.createEl('h3', { text: enc?.name || 'Encounter Tracker', cls: 'encounter-title' });
		if (enc) {
			title.addEventListener('click', () => this.renameEncounter(title, enc));
		}
		if (enc?.sourcePath) {
			const src = header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Open the note this encounter came from' } });
			setIcon(src, 'file-symlink');
			src.onclick = () => this.app.workspace.openLinkText(enc.sourcePath!, '', false);
		}
		const more = header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Encounter options' } });
		setIcon(more, 'more-horizontal');
		more.onclick = (e) => this.encounterMenu(e, enc);
	}

	private encounterMenu(e: MouseEvent, enc: Encounter | null): void {
		const menu = new Menu();
		if (enc) {
			if (this.plugin.settings.party.length) {
				menu.addItem(i => i.setTitle('Add the party').setIcon('users').onClick(() => {
					const n = this.store.addParty(enc.id);
					new Notice(n ? `Added ${n} hero${n === 1 ? '' : 'es'}` : 'The whole party is already here');
				}));
			}
			menu.addItem(i => i.setTitle(this.plugin.settings.party.length ? 'Edit party…' : 'Set up your party…').setIcon('user-cog').onClick(() => this.plugin.openParty()));
			menu.addItem(i => i.setTitle('Add monster…').setIcon('plus').onClick(() => this.plugin.openAddMonsterModal()));
			menu.addItem(i => i.setTitle('Open bestiary').setIcon('book-open').onClick(() => void this.plugin.openBestiary()));
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

	/**
	 * The controls that stay pinned to the top while the list scrolls: the
	 * combat button (Start, or Next round and End), the round, whose turn it is,
	 * and the add buttons.
	 */
	private renderControls(container: HTMLElement, enc: Encounter): void {
		const box = container.createDiv({ cls: 'tracker-controls' });
		const inCombat = !!enc.phase && enc.phase !== 'setup';
		const round = enc.round ?? 1;

		const top = box.createDiv({ cls: 'tracker-combat-row' });
		const primary = top.createEl('button', { cls: 'mod-cta round-action' });
		if (!inCombat && enc.paused) {
			// Ended earlier: pick it back up, or start over.
			setIcon(primary.createSpan({ cls: 'round-action-icon' }), 'play');
			primary.createSpan({ text: `Resume round ${enc.paused.round}` });
			primary.onclick = () => { this.prompts = []; this.store.resume(enc.id); };
			const fresh = top.createEl('button', { cls: 'tracker-end tracker-new-fight' });
			setIcon(fresh.createSpan({ cls: 'round-action-icon' }), 'rotate-ccw');
			fresh.createSpan({ text: 'New fight' });
			fresh.onclick = () => { this.prompts = []; this.store.start(enc.id); };
		} else if (!inCombat) {
			setIcon(primary.createSpan({ cls: 'round-action-icon' }), 'swords');
			primary.createSpan({ text: 'Start combat' });
			primary.disabled = enc.creatures.length === 0;
			primary.onclick = () => { this.prompts = []; this.store.start(enc.id); };
		} else {
			setIcon(primary.createSpan({ cls: 'round-action-icon' }), 'skip-forward');
			primary.createSpan({ text: 'Next round' });
			primary.onclick = () => {
				const expired = this.store.nextRound(enc.id);
				if (expired.length) new Notice(`Wore off: ${expired.join(', ')}`);
			};
			const save = top.createEl('button', { cls: 'tracker-save', attr: { 'aria-label': 'Save the fight to a note' } });
			setIcon(save, 'save');
			save.onclick = () => void this.saveToNote(enc);
			const end = top.createEl('button', { cls: 'tracker-end' });
			setIcon(end.createSpan({ cls: 'round-action-icon' }), 'square');
			end.createSpan({ text: 'End' });
			end.onclick = () => this.endCombat(enc);
		}

		if (inCombat) {
			const stepper = box.createDiv({ cls: 'round-stepper' });
			const prev = stepper.createEl('button', { cls: 'round-btn', attr: { 'aria-label': 'Previous round' } });
			setIcon(prev, 'chevron-left');
			prev.disabled = round <= 1;
			prev.onclick = () => this.store.setRound(enc.id, round - 1);
			stepper.createSpan({ cls: 'round-label', text: `Round ${round}` });
			const next = stepper.createEl('button', { cls: 'round-btn', attr: { 'aria-label': 'Round up' } });
			setIcon(next, 'chevron-right');
			next.onclick = () => this.store.setRound(enc.id, round + 1);

			const seg = box.createDiv({ cls: 'turn-segmented', attr: { role: 'radiogroup' } });
			const side = (phase: 'heroes' | 'monsters', text: string, list: EncounterCreature[]) => {
				const on = enc.phase === phase;
				const b = seg.createEl('button', { cls: `phase-pill phase-${phase}${on ? ' is-active' : ''}`, attr: { role: 'radio', 'aria-checked': String(on), 'aria-pressed': String(on) } });
				b.createSpan({ cls: 'phase-pill-text', text });
				const up = list.filter(c => !isDown(c));
				if (up.length) b.createSpan({ cls: 'phase-pill-count', text: `${up.filter(c => c.done).length}/${up.length}` });
				b.onclick = () => this.store.setPhase(enc.id, phase);
			};
			const heroes = enc.creatures.filter(isHero);
			side('heroes', "Heroes' turn", heroes);
			side('monsters', "Monsters' turn", enc.creatures.filter(c => !isHero(c)));
			const turn = enc.phase === 'monsters' ? 1 : 0;
			seg.dataset.phase = enc.phase;
			slideThumb(seg, turn, 2, this.lastTurn);
			this.lastTurn = turn;
		}

		// Add buttons scroll with the list; only the combat controls stay pinned.
		const tools = container.createDiv({ cls: 'tracker-tools' });
		const add = tools.createEl('button', { cls: 'tracker-add-monster' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: 'Add monster' });
		add.onclick = () => this.plugin.openAddMonsterModal();
		if (this.plugin.settings.party.length && !enc.creatures.some(isHero)) {
			const party = tools.createEl('button', { cls: 'quick-add-party' });
			setIcon(party.createSpan(), 'users');
			party.createSpan({ text: 'Add party' });
			party.onclick = () => this.store.addParty(enc.id);
		}
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
	// Prompts (legendary turns, Bloodied, Last Stand)

	private pushPrompt(p: Prompt): void {
		this.prompts = [p, ...this.prompts.filter(x => x.id !== p.id)].slice(0, 6);
		this.scrollToPrompts = true;
	}

	private scrollToPrompts = false;

	private renderPrompts(container: HTMLElement, enc: Encounter): void {
		this.prompts = this.prompts.filter(p => !p.creatureId || enc.creatures.some(c => c.id === p.creatureId));
		for (const p of this.prompts) {
			const box = container.createDiv({ cls: `tracker-prompt prompt-${p.kind}` });
			const head = box.createDiv({ cls: 'prompt-head' });
			head.createSpan({ cls: 'prompt-title', text: p.title });
			const x = head.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Dismiss' } });
			setIcon(x, 'x');
			x.onclick = () => { this.prompts = this.prompts.filter(q => q !== p); this.render(); };
			const creature = p.creatureId ? enc.creatures.find(c => c.id === p.creatureId) : undefined;
			const name = creature?.label || p.monsterName || '';
			if (p.text) this.rich(box.createDiv({ cls: 'prompt-text' }), p.text, name);
			if (p.lines?.length) {
				const ul = box.createEl('ul', { cls: 'prompt-lines' });
				for (const l of p.lines) this.rich(ul.createEl('li'), l, name, 'attack');
			}
			if (p.action) {
				const b = box.createEl('button', { cls: 'mod-cta prompt-action', text: p.action.label });
				b.onclick = () => { p.action!.run(); this.prompts = this.prompts.filter(q => q !== p); this.render(); };
			}
		}
	}

	/** Rules text with clickable dice and condition names. */
	private rich(el: HTMLElement, text: string, label: string, kind: 'attack' | 'effect' = 'effect'): void {
		appendRichText(el, text, {
			onDice: this.plugin.settings.clickableDice ? (span, expr) => {
				span.addClass('is-clickable');
				span.setAttr('role', 'button');
				span.setAttr('tabindex', '0');
				span.setAttr('title', `Roll ${expr}`);
				span.onclick = (e) => { e.stopPropagation(); this.plugin.rollDice(expr, label, kind); };
			} : undefined,
			keywords: this.plugin.conditionKeywords(),
			onKeyword: (span, word) => {
				span.addClass('nimble-condition-ref');
				span.onclick = (e) => { e.stopPropagation(); this.plugin.showConditionInfo(span, word); };
			},
		});
	}

	private entryFor(c: EncounterCreature): MonsterIndexEntry {
		return { name: c.monster.name, filePath: c.sourceFile || '', monster: c.monster, bundled: !c.sourceFile && !!c.monster.bundledId };
	}

	// ------------------------------------------------------------------------
	// Combatant rows

	private renderCreature(list: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const role = isHero(c) ? 'hero' : monsterRole(c.monster);
		const item = list.createEl('li', { cls: `creature-item role-${role}` });
		item.dataset.creatureId = c.id;
		if (!isHero(c) && !isMinionGroup(c)) item.addClass(hpClass(c.currentHp, c.maxHp));
		if (c.done) item.addClass('is-done');
		if (isDown(c)) item.addClass('is-down');
		const waiting = (enc.phase === 'heroes' && !isHero(c)) || (enc.phase === 'monsters' && isHero(c));
		if (waiting && !c.done) item.addClass('is-waiting');
		this.makeDraggable(item, list, enc, c);

		// Main line: turn toggle, name, HP, menu
		const main = item.createDiv({ cls: 'creature-main' });
		const turn = main.createEl('button', {
			cls: `turn-toggle${c.done ? ' is-done' : ''}`,
			attr: { 'aria-pressed': String(!!c.done), 'aria-label': c.done ? 'Undo turn' : 'Mark turn done' },
		});
		setIcon(turn, c.done ? 'check-circle-2' : 'circle');
		turn.onclick = () => this.toggleDone(enc, c);

		const nameBox = main.createDiv({ cls: 'creature-name-box' });
		const label = nameBox.createEl('button', { cls: 'creature-label', text: c.label, attr: { 'aria-haspopup': 'dialog' } });
		// Their sheet opens over the tracker, with the fight's state; no page jump.
		label.onclick = () => openRecord(this.plugin, { kind: 'combatant', encId: enc.id, creatureId: c.id });
		if (!isHero(c)) this.plugin.hover.attach(label, () => this.entryFor(c));
		const meta = nameBox.createSpan({ cls: 'creature-meta' });
		const part = (text: string) => { if (meta.childElementCount) meta.createSpan({ cls: 'meta-sep', text: '·' }); return meta.createSpan({ text }); };
		if (isHero(c)) {
			if (c.monster.type) part(String(c.monster.type));
			if (c.defense !== undefined) {
				if (meta.childElementCount) meta.createSpan({ cls: 'meta-sep', text: '·' });
				const def = meta.createSpan({ cls: 'meta-defense', attr: { 'aria-label': 'Defense' } });
				setIcon(def.createSpan({ cls: 'meta-icon' }), 'shield');
				def.createSpan({ text: String(c.defense) });
			}
		} else {
			const lvl = formatLevel(c.monster.level);
			if (lvl) part(`Lvl ${lvl}`);
			if (role === 'legendary') part(c.monster.roleLabel || 'Legendary');
			if (role !== 'minion') {
				if (meta.childElementCount) meta.createSpan({ cls: 'meta-sep', text: '·' });
				const armor = c.monster.armor;
				const badge = meta.createSpan({
					cls: `armor-chip armor-${armor}`,
					attr: { 'aria-label': armor === 'none' ? 'No armor' : armor === 'medium' ? 'Medium armor: −10 damage per hit. Crits ignore it.' : 'Heavy armor: −20 damage per hit. Crits ignore it.' },
				});
				setIcon(badge.createSpan({ cls: 'meta-icon' }), armor === 'none' ? 'shield-off' : armor === 'heavy' ? 'shield-plus' : 'shield');
				badge.createSpan({ text: armor === 'none' ? 'No armor' : armor === 'medium' ? 'Medium' : 'Heavy' });
			}
		}
		if (!meta.childElementCount) meta.remove();

		const more = main.createEl('button', { cls: 'clickable-icon creature-more', attr: { 'aria-label': 'More' } });
		setIcon(more, 'more-vertical');
		more.onclick = (e) => this.creatureMenu(e, enc, c);

		// HP line: the bar (or minion pips) with the HP button beside it, so names get the full width above.
		const hpRow = item.createDiv({ cls: 'creature-hp-row' });
		if (isMinionGroup(c)) this.renderMinionPips(hpRow, item, enc, c);
		else {
			const bar = hpRow.createDiv({ cls: 'creature-hp-bar' });
			if (c.maxHp > 0) {
				const fill = bar.createDiv({ cls: 'creature-hp-fill' });
				fill.style.width = `${(c.currentHp / c.maxHp) * 100}%`;
				if (role === 'legendary') bar.createDiv({ cls: 'hp-half-mark', attr: { 'aria-label': 'Bloodied' } });
			}
		}
		this.renderHpButton(hpRow, enc, c);

		if (isHero(c)) this.renderHeroPips(item, enc, c);
		if (role === 'legendary') this.renderLegendaryLine(item, enc, c);

		const flash = this.flash.get(c.id);
		if (flash) item.createDiv({ cls: 'creature-flash', text: flash });

		this.renderConditions(item, enc, c);
		if (c.note) item.createDiv({ cls: 'creature-note', text: c.note });
	}

	private toggleDone(enc: Encounter, c: EncounterCreature): void {
		const done = !c.done;
		const expired = this.store.setDone(enc.id, c.id, done);
		if (expired.length) new Notice(`${c.label}: ${expired.join(', ')} wore off`);
	}

	private renderHpButton(main: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const text = isMinionGroup(c)
			? `${c.alive}/${c.count}`
			: c.maxHp > 0 ? `${c.currentHp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp}` : ''}` : '—';
		const hp = main.createEl('button', {
			cls: 'hp-display',
			text,
			attr: {
				'data-hp-for': c.id,
				'aria-haspopup': 'dialog',
			},
		});
		hp.onclick = () => this.startHpEntry(hp, enc, c);
	}

	private renderMinionPips(hpRow: HTMLElement, item: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const pips = hpRow.createDiv({ cls: 'pips minion-pips', attr: { role: 'group' } });
		const row = item.createDiv({ cls: 'minion-row' });
		for (let i = 0; i < (c.count ?? 0); i++) {
			const up = i < (c.alive ?? 0);
			const pip = pips.createEl('button', { cls: `pip minion-pip${up ? ' is-on' : ''}`, attr: { 'aria-pressed': String(up) } });
			pip.onclick = () => this.store.setAlive(enc.id, c.id, up ? (c.alive ?? 0) - 1 : (c.alive ?? 0) + 1);
		}
		const attack = row.createEl('button', { cls: 'group-attack' });
		setIcon(attack.createSpan(), 'dices');
		attack.createSpan({ text: `Group attack ×${c.alive}` });
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

	private renderHeroPips(item: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const row = item.createDiv({ cls: 'hero-row' });
		const actions = row.createDiv({ cls: 'pips action-pips', attr: { role: 'group' } });
		const al = actions.createSpan({ cls: 'pips-label', attr: { title: 'Actions' } });
		setIcon(al.createSpan({ cls: 'pips-icon' }), 'zap');
		al.createSpan({ cls: 'pips-label-text', text: 'Actions' });
		const dying = c.currentHp <= 0 && !isDown(c);
		for (let i = 0; i < 3; i++) {
			const on = i < (c.actions ?? 3);
			const pip = actions.createEl('button', { cls: `pip action-pip${on ? ' is-on' : ''}`, attr: { 'aria-pressed': String(on) } });
			if (dying && i > 0) pip.addClass('is-blocked');
			pip.onclick = () => this.store.setActions(enc.id, c.id, on ? i : i + 1);
		}
		const max = c.maxWounds ?? 6;
		const wounds = row.createDiv({ cls: 'pips wound-pips', attr: { role: 'group' } });
		const wl = wounds.createSpan({ cls: 'pips-label', attr: { title: 'Wounds' } });
		setIcon(wl.createSpan({ cls: 'pips-icon' }), 'heart-crack');
		wl.createSpan({ cls: 'pips-label-text', text: 'Wounds' });
		for (let i = 0; i < max; i++) {
			const on = i < (c.wounds ?? 0);
			const pip = wounds.createEl('button', { cls: `pip wound-pip${on ? ' is-on' : ''}`, attr: { 'aria-pressed': String(on) } });
			pip.onclick = () => this.store.setWounds(enc.id, c.id, on ? i : i + 1);
		}
	}

	private renderLegendaryLine(item: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const m = c.monster;
		const line = item.createDiv({ cls: 'legendary-line' });
		const bloodied = c.currentHp <= c.maxHp / 2;
		const b = line.createSpan({ cls: `phase-chip${bloodied ? ' is-on' : ''}`, text: bloodied ? 'Bloodied' : `Bloodied at ${Math.floor(c.maxHp / 2)}` });
		if (m.bloodied) this.ruleChip(b, 'Bloodied', m.bloodied, c.label);
		if (m.lastStand) {
			const ls = line.createSpan({ cls: `phase-chip laststand${c.lastStand ? ' is-on' : ''}`, text: c.lastStand ? 'Last Stand' : 'Last Stand at 0' });
			this.ruleChip(ls, 'Last Stand', m.lastStand, c.label);
			if (c.currentHp === 0 && !c.lastStand) {
				const btn = line.createEl('button', { cls: 'mod-warning laststand-btn', text: 'Trigger Last Stand' });
				const effect = lastStandEffect(m.lastStand, this.store.partySize(enc));
				if (effect) btn.setAttr('title', effect.kind === 'regain' ? `Regains ${effect.hp} HP` : `${effect.hp} more damage to finish`);
				btn.onclick = () => { const msg = this.store.applyLastStand(enc.id, c.id); if (msg) new Notice(msg); };
			}
		}
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

	private creatureMenu(e: MouseEvent, enc: Encounter, c: EncounterCreature): void {
		const menu = new Menu();
		if (!isHero(c)) {
			menu.addItem(i => i.setTitle('View stat block').setIcon('scroll').onClick(() => openRecord(this.plugin, { kind: 'combatant', encId: enc.id, creatureId: c.id })));
			const entry = this.entryFor(c);
			if (entry.bundled || c.sourceFile) menu.addItem(i => i.setTitle(entry.bundled ? 'Open in bestiary' : 'Open note').setIcon(entry.bundled ? 'book-open' : 'file-symlink').onClick(() => this.plugin.openMonster(entry)));
			menu.addItem(i => i.setTitle(isMinionGroup(c) ? 'Add one more' : 'Duplicate').setIcon('copy-plus').onClick(() => this.store.duplicate(enc.id, c.id)));
			if (!isMinionGroup(c)) {
				menu.addItem(i => i.setTitle('Make tougher (+1 level)').setIcon('trending-up').onClick(() => this.store.shiftLevel(enc.id, c.id, 1)));
				menu.addItem(i => i.setTitle('Make weaker (−1 level)').setIcon('trending-down').onClick(() => this.store.shiftLevel(enc.id, c.id, -1)));
			}
		}
		menu.addItem(i => i.setTitle('Rename').setIcon('pencil').onClick(() => this.startRename(enc, c)));
		const side = enc.creatures.filter(x => isHero(x) === isHero(c));
		const at = side.indexOf(c);
		if (at > 0) menu.addItem(i => i.setTitle('Move up').setIcon('arrow-up').onClick(() => this.store.reorder(enc.id, c.id, side[at - 1].id)));
		if (at < side.length - 1) menu.addItem(i => i.setTitle('Move down').setIcon('arrow-down').onClick(() => this.store.reorder(enc.id, c.id, side[at + 1].id)));
		menu.addItem(i => i.setTitle(c.note ? 'Edit note' : 'Add note').setIcon('sticky-note').onClick(() => {
			new NoteModal(this.app, c.label, c.note || '', (note) => this.store.setNote(enc.id, c.id, note)).open();
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

	private applyCmd(enc: Encounter, c: EncounterCreature, cmd: HpCommand): void {
		const r: HpResult = this.store.applyHp(enc.id, c.id, cmd);
		const after = this.store.creature(enc.id, c.id);
		if (r.breakdown) {
			this.flash.set(c.id, r.breakdown);
			window.setTimeout(() => { this.flash.delete(c.id); if (this.flash.size === 0) this.render(); }, 5000);
			this.render();
		}
		if (!after) return;
		const m = after.monster;
		if (r.crossed === 'bloodied' && m.bloodied) {
			this.pushPrompt({ id: `blood-${c.id}`, kind: 'bloodied', creatureId: c.id, title: `${after.label} is Bloodied`, text: m.bloodied });
			this.render();
		} else if (r.crossed === 'last-stand' && m.lastStand && !after.lastStand) {
			const effect = lastStandEffect(m.lastStand, this.store.partySize(enc));
			this.pushPrompt({
				id: `last-${c.id}`, kind: 'laststand', creatureId: c.id, title: `${after.label}: Last Stand!`, text: m.lastStand,
				action: { label: effect ? (effect.kind === 'regain' ? `Apply: regain ${effect.hp} HP` : `Apply: ${effect.hp} more damage to finish`) : 'Mark Last Stand', run: () => { this.store.applyLastStand(enc.id, c.id); } },
			});
			this.render();
		}
	}

	/** The HP calculator: a popover beside the HP button (a bottom sheet on phones). */
	private startHpEntry(display: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		if (isPopoverOpenFor(display)) { closePopover(); return; }
		openHpCalculator(display, c, this.plugin.settings.autoArmor, (cmd) => this.applyCmd(enc, c, cmd));
	}

	// ------------------------------------------------------------------------
	// Conditions

	private renderConditions(item: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		const row = item.createDiv({ cls: 'conditions-row' });
		const auto: string[] = [];
		if (isHero(c)) {
			if (isDown(c)) auto.push('Dead');
			else if (c.currentHp <= 0 && c.maxHp > 0) auto.push('Dying');
		} else if (!isMinionGroup(c)) {
			if (awaitingLastStand(c)) auto.push('Last Stand ready');
			else if (c.currentHp <= 0) auto.push(monsterRole(c.monster) === 'legendary' && c.lastStand ? 'Last Stand' : 'Defeated');
			else if (c.currentHp <= c.maxHp / 2 && monsterRole(c.monster) !== 'legendary') auto.push('Bloodied');
		}
		for (const name of auto) row.createSpan({ cls: 'condition-tag auto-condition', text: name });
		for (const applied of c.conditions) this.renderConditionChip(row, enc, c, applied);
		const add = row.createEl('button', { cls: 'add-condition-btn' });
		setIcon(add, 'plus');
		if (!c.conditions.length && !auto.length) add.createSpan({ text: 'Status' });
		else add.setAttr('aria-label', 'Add status');
		add.onclick = (e) => { e.stopPropagation(); this.showConditionPicker(add, enc, c); };
	}

	private renderConditionChip(row: HTMLElement, enc: Encounter, c: EncounterCreature, applied: AppliedCondition): void {
		const cond = this.plugin.condition(applied.name);
		const tag = row.createSpan({ cls: 'condition-tag', attr: { role: 'button', tabindex: '0' } });
		if (cond?.minor) tag.addClass('is-minor');
		tag.createSpan({ text: conditionLabel(applied) });
		if (applied.rounds) tag.createSpan({ cls: 'condition-rounds', text: String(applied.rounds), attr: { 'aria-label': `${applied.rounds} round${applied.rounds === 1 ? '' : 's'} left` } });
		const x = tag.createSpan({ cls: 'remove-condition', text: '×', attr: { 'aria-label': `Remove ${applied.name}` } });
		x.onclick = (e) => { e.stopPropagation(); this.store.removeCondition(enc.id, c.id, applied.name); };
		const open = () => this.showConditionEditor(tag, enc, c, applied);
		tag.onclick = open;
		tag.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } else if (e.key === 'Delete' || e.key === 'Backspace') this.store.removeCondition(enc.id, c.id, applied.name); };
	}

	private showConditionEditor(anchor: HTMLElement, enc: Encounter, c: EncounterCreature, applied: AppliedCondition): void {
		if (isPopoverOpenFor(anchor)) { closePopover(); return; }
		const cond = this.plugin.condition(applied.name);
		openPopover(anchor, (el, close) => {
			el.addClass('condition-editor');
			el.createDiv({ cls: 'popover-title', text: conditionLabel(applied) });
			if (cond) el.createDiv({ cls: 'popover-body', text: cond.description });
			const row = el.createDiv({ cls: 'popover-row' });
			row.createSpan({ cls: 'popover-label', text: 'Lasts' });
			const options: [string, number | null][] = [['Until removed', null], ['1 rd', 1], ['2 rds', 2], ['3 rds', 3], ['10 rds', 10]];
			const seg = row.createDiv({ cls: 'nimble-segmented' });
			for (const [text, rounds] of options) {
				const b = seg.createEl('button', { text });
				if ((applied.rounds ?? null) === rounds) b.addClass('is-active');
				b.onclick = () => { this.store.updateCondition(enc.id, c.id, applied.name, { rounds }); close(); };
			}
			if (cond?.hasValue) {
				const vrow = el.createDiv({ cls: 'popover-row' });
				vrow.createSpan({ cls: 'popover-label', text: 'X =' });
				const seg2 = vrow.createDiv({ cls: 'nimble-segmented' });
				for (const v of [1, 2, 3, 4, 5, 6]) {
					const b = seg2.createEl('button', { text: String(v) });
					if (applied.value === v) b.addClass('is-active');
					b.onclick = () => { this.store.updateCondition(enc.id, c.id, applied.name, { value: v }); close(); };
				}
			}
			const rm = el.createEl('button', { cls: 'mod-warning popover-remove', text: `Remove ${applied.name}` });
			rm.onclick = () => { this.store.removeCondition(enc.id, c.id, applied.name); close(); };
		}, { width: 300 });
	}

	private showConditionPicker(anchor: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		if (isPopoverOpenFor(anchor, 'condition-picker')) { closePopover(); return; }
		let rounds: number | undefined;
		openPopover(anchor, (el, close) => {
			el.addClass('condition-picker');
			el.setAttr('role', 'dialog');
			const search = el.createEl('input', { type: 'search', cls: 'condition-search', attr: { placeholder: `Status for ${c.label}…` } });
			const dur = el.createDiv({ cls: 'popover-row' });
			dur.createSpan({ cls: 'popover-label', text: 'Lasts' });
			const seg = dur.createDiv({ cls: 'nimble-segmented' });
			const opts: [string, number | undefined][] = [['Until removed', undefined], ['1 rd', 1], ['2', 2], ['3', 3]];
			for (const [text, r] of opts) {
				const b = seg.createEl('button', { text });
				if (r === rounds) b.addClass('is-active');
				b.onclick = () => { rounds = r; seg.querySelectorAll('button').forEach(x => x.removeClass('is-active')); b.addClass('is-active'); search.focus(); };
			}
			const grid = el.createDiv({ cls: 'condition-grid' });
			const valueRow = el.createDiv({ cls: 'popover-row condition-value-row' });
			valueRow.hide();
			const draw = () => {
				grid.empty();
				const q = search.value.trim().toLowerCase();
				const all = this.plugin.getAllConditions().filter(x => !x.auto && (!q || x.name.toLowerCase().includes(q)));
				for (const cond of all) {
					const has = c.conditions.some(x => x.name === cond.name);
					const b = grid.createEl('button', { cls: `condition-option${has ? ' is-applied' : ''}${cond.minor ? ' is-minor' : ''}`, text: cond.name, attr: { title: cond.description, 'aria-pressed': String(has) } });
					b.onclick = () => {
						if (has) { this.store.removeCondition(enc.id, c.id, cond.name); close(); return; }
						if (cond.hasValue) {
							valueRow.empty();
							valueRow.show();
							valueRow.createSpan({ cls: 'popover-label', text: `${cond.name} X =` });
							const s2 = valueRow.createDiv({ cls: 'nimble-segmented' });
							for (const v of [1, 2, 3, 4, 5, 6]) {
								const vb = s2.createEl('button', { text: String(v) });
								vb.onclick = () => { this.store.addCondition(enc.id, c.id, cond.name, { rounds, value: v }); close(); };
							}
							return;
						}
						this.store.addCondition(enc.id, c.id, cond.name, { rounds });
						close();
					};
				}
				if (!all.length) grid.createDiv({ cls: 'picker-empty', text: 'No match' });
			};
			search.addEventListener('input', draw);
			search.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') grid.querySelector<HTMLButtonElement>('.condition-option:not(.is-applied)')?.click();
			});
			draw();
			window.setTimeout(() => search.focus(), 0);
		}, { width: 320, cls: 'condition-picker' });
	}

	// ------------------------------------------------------------------------

	private startRename(enc: Encounter, c: EncounterCreature): void {
		const label = this.root.querySelector<HTMLElement>(`[data-creature-id="${c.id}"] .creature-label`);
		if (!label) return;
		const input = createEl('input', { type: 'text', cls: 'label-edit-input', value: c.label });
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			if (save && input.value.trim() && input.value.trim() !== c.label) this.store.renameCreature(enc.id, c.id, input.value);
			else this.render();
		};
		input.onblur = () => finish(true);
		input.onkeydown = (e) => {
			if (e.key === 'Enter') finish(true);
			else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
		};
		label.replaceWith(input);
		input.focus();
		input.select();
	}

	private makeDraggable(item: HTMLElement, list: HTMLElement, enc: Encounter, c: EncounterCreature): void {
		item.setAttr('draggable', 'true');
		item.ondragstart = (e) => {
			if ((e.target as HTMLElement).closest('input, button.pip')) { e.preventDefault(); return; }
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
		const details = container.createEl('details', { cls: 'combat-log' });
		details.open = this.logOpen;
		details.addEventListener('toggle', () => { this.logOpen = details.open; });
		details.createEl('summary', { text: `Combat log (${log.length})` });
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
