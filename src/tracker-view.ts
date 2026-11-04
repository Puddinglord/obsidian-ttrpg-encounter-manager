// The encounter tracker sidebar.

import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { Encounter, EncounterCreature } from './types';
import { applyHpInput, HpThreshold } from './encounters';

export const ENCOUNTER_VIEW_TYPE = 'nimble-encounter-tracker';

export function hpClass(current: number, max: number): string {
	const ratio = max > 0 ? current / max : 0;
	if (ratio > 0.5) return 'hp-healthy';
	if (ratio > 0.25) return 'hp-wounded';
	if (ratio > 0) return 'hp-critical';
	return 'hp-dead';
}

export class EncounterTrackerView extends ItemView {
	viewingCreatureId: string | null = null;
	viewingCondition: string | null = null;
	private picker: HTMLElement | null = null;
	private pickerCleanup: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
	}

	getViewType(): string { return ENCOUNTER_VIEW_TYPE; }
	getDisplayText(): string { return 'Nimble Encounters'; }
	getIcon(): string { return 'swords'; }

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.encounters.on('changed', () => this.render()));
		this.registerEvent(this.plugin.events.on('roll-log-changed', () => this.render()));
		this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.picker) {
				e.preventDefault();
				this.closePicker();
			}
		});
		this.render();
	}

	async onClose(): Promise<void> {
		this.closePicker();
	}

	private get store() { return this.plugin.encounters; }

	render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		this.closePicker();
		container.empty();
		container.addClass('nimble-encounter-tracker');

		const multiMode = this.plugin.settings.multipleEncounters;
		const enc = this.store.ensureActive();

		this.renderViewers(container, enc);
		this.renderHeader(container, enc);
		if (multiMode) this.renderEncounterPicker(container);

		if (enc) {
			this.renderToolbar(container, enc);
			if (enc.creatures.length === 0) {
				const empty = container.createDiv({ cls: 'empty-message' });
				empty.createEl('p', { text: 'No creatures yet.' });
				empty.createEl('p', { text: 'Click "+ Add to Encounter" on a stat block, the + on an inline reference, or use "Add monster…" above.', cls: 'empty-hint' });
			} else {
				this.renderCreatureList(container, enc);
			}
		} else if (multiMode) {
			container.createEl('p', { text: 'Create or select an encounter to get started.', cls: 'empty-message' });
		}

		this.renderRollLog(container);

		container.scrollTop = scrollTop;
	}

	// ------------------------------------------------------------------------

	private renderViewers(container: HTMLElement, enc: Encounter | null): void {
		const cond = this.viewingCondition ? this.plugin.getAllConditions().find(c => c.name === this.viewingCondition) : null;
		if (cond) {
			const viewer = container.createDiv({ cls: 'condition-viewer' });
			const header = viewer.createDiv({ cls: 'viewer-header' });
			header.createSpan({ text: cond.name, cls: 'viewer-title condition-title' });
			this.closeButton(header, () => { this.viewingCondition = null; this.render(); });
			viewer.createEl('p', { text: cond.description, cls: 'condition-description' });
			viewer.createEl('hr', { cls: 'viewer-divider' });
		}

		const creature = enc?.creatures.find(c => c.id === this.viewingCreatureId);
		if (creature) {
			const viewer = container.createDiv({ cls: 'statblock-viewer' });
			const header = viewer.createDiv({ cls: 'viewer-header' });
			header.createSpan({ text: creature.label, cls: 'viewer-title' });
			if (creature.sourceFile) {
				const open = header.createEl('button', { cls: 'clickable-icon viewer-open-btn', attr: { 'aria-label': 'Open source note' } });
				setIcon(open, 'file-symlink');
				open.onclick = () => this.app.workspace.openLinkText(creature.sourceFile!, '', false);
			}
			this.closeButton(header, () => { this.viewingCreatureId = null; this.render(); });
			const body = viewer.createDiv({ cls: 'viewer-statblock' });
			this.plugin.renderStatblock(body, creature.monster, creature.sourceFile || '', 'inline');
			viewer.createEl('hr', { cls: 'viewer-divider' });
		}
	}

	private closeButton(parent: HTMLElement, onClick: () => void): void {
		const btn = parent.createEl('button', { text: '✕', cls: 'close-viewer-btn small', attr: { 'aria-label': 'Close' } });
		btn.onclick = onClick;
	}

	private renderHeader(container: HTMLElement, enc: Encounter | null): void {
		const header = container.createDiv({ cls: 'encounter-header' });
		header.createEl('h3', { text: 'Encounter Tracker' });
		if (!enc) return;

		const round = enc.round ?? 1;
		const roundBox = header.createDiv({ cls: 'round-counter' });
		const prev = roundBox.createEl('button', { cls: 'round-btn', text: '‹', attr: { 'aria-label': 'Previous round' } });
		prev.disabled = round <= 1;
		prev.onclick = () => this.store.setRound(enc.id, round - 1);
		roundBox.createSpan({ cls: 'round-label', text: `Round ${round}` });
		const next = roundBox.createEl('button', { cls: 'round-btn', text: '›', attr: { 'aria-label': 'Next round' } });
		next.onclick = () => this.store.setRound(enc.id, round + 1);

		if (enc.creatures.length) {
			const alive = enc.creatures.filter(c => c.currentHp > 0).length;
			const hp = enc.creatures.reduce((s, c) => s + c.currentHp, 0);
			const max = enc.creatures.reduce((s, c) => s + c.maxHp, 0);
			const summary = container.createDiv({ cls: 'encounter-summary' });
			summary.createSpan({ text: `${alive}/${enc.creatures.length} standing` });
			summary.createSpan({ text: `${hp}/${max} HP` });
			const bar = summary.createDiv({ cls: 'encounter-hp-bar' });
			bar.createDiv({ cls: 'encounter-hp-fill' }).style.width = `${max ? (hp / max) * 100 : 0}%`;
		}
	}

	private renderEncounterPicker(container: HTMLElement): void {
		const form = container.createDiv({ cls: 'new-encounter-form' });
		const input = form.createEl('input', { type: 'text', placeholder: 'New encounter name...', cls: 'encounter-name-input' });
		const addBtn = form.createEl('button', { text: '+', cls: 'add-encounter-btn', attr: { 'aria-label': 'Create encounter' } });
		const create = () => {
			const name = input.value.trim();
			if (!name) return;
			this.viewingCreatureId = null;
			this.store.create(name);
		};
		addBtn.onclick = create;
		input.onkeydown = (e) => { if (e.key === 'Enter') create(); };

		const select = container.createDiv({ cls: 'encounter-selector' }).createEl('select', { cls: 'encounter-select dropdown' });
		select.createEl('option', { text: 'Select encounter...', value: '' });
		for (const e of this.store.encounters) {
			const opt = select.createEl('option', { text: `${e.name} (${e.creatures.length})`, value: e.id });
			opt.selected = e.id === this.plugin.settings.activeEncounterId;
		}
		select.onchange = () => {
			this.viewingCreatureId = null;
			this.viewingCondition = null;
			this.store.setActive(select.value || null);
		};
	}

	private renderToolbar(container: HTMLElement, enc: Encounter): void {
		const bar = container.createDiv({ cls: 'encounter-toolbar' });
		const addBtn = bar.createEl('button', { cls: 'toolbar-btn add-monster-btn' });
		setIcon(addBtn.createSpan(), 'plus');
		addBtn.createSpan({ text: 'Add monster…' });
		addBtn.onclick = () => this.plugin.openAddMonsterModal();

		const clearHolder = bar.createDiv({ cls: 'clear-btn-container' });
		const multi = this.plugin.settings.multipleEncounters;
		if (!multi && enc.creatures.length === 0) return;
		const danger = clearHolder.createEl('button', { text: multi ? 'Delete encounter' : 'Clear all', cls: 'delete-encounter-btn' });
		danger.onclick = () => {
			clearHolder.empty();
			const confirm = clearHolder.createEl('button', { text: '✓ Confirm', cls: 'confirm-btn' });
			const cancel = clearHolder.createEl('button', { text: '✕ Cancel', cls: 'cancel-btn' });
			confirm.onclick = () => {
				this.viewingCreatureId = null;
				this.viewingCondition = null;
				if (multi) this.store.delete(enc.id);
				else this.store.clear(enc.id);
			};
			cancel.onclick = () => this.render();
			confirm.focus();
		};
	}

	// ------------------------------------------------------------------------

	private renderCreatureList(container: HTMLElement, enc: Encounter): void {
		const list = container.createEl('ul', { cls: 'creature-list' });
		for (const creature of enc.creatures) this.renderCreature(list, enc, creature);
	}

	private renderCreature(list: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const item = list.createEl('li', { cls: 'creature-item' });
		item.addClass(hpClass(creature.currentHp, creature.maxHp));
		if (creature.monster.monsterType === 'solo') item.addClass('is-solo');
		item.dataset.creatureId = creature.id;
		this.makeDraggable(item, list, enc, creature);

		// Header
		const header = item.createDiv({ cls: 'creature-header' });
		header.createSpan({ cls: 'drag-handle', text: '⋮⋮', attr: { title: 'Drag to reorder', 'aria-hidden': 'true' } });
		const labelBox = header.createDiv({ cls: 'label-container' });
		const label = labelBox.createEl('button', { text: creature.label, cls: 'creature-label', attr: { title: 'View stat block' } });
		if (this.viewingCreatureId === creature.id) label.addClass('viewing');
		label.onclick = () => { this.viewingCreatureId = creature.id; this.render(); };

		const buttons = header.createDiv({ cls: 'creature-buttons' });
		const edit = buttons.createEl('button', { cls: 'edit-btn', attr: { 'aria-label': `Rename ${creature.label}` } });
		setIcon(edit, 'pencil');
		edit.onclick = () => this.startRename(labelBox, enc, creature);
		const remove = buttons.createEl('button', { text: '✕', cls: 'remove-btn', attr: { 'aria-label': `Remove ${creature.label}` } });
		remove.onclick = () => {
			if (this.viewingCreatureId === creature.id) this.viewingCreatureId = null;
			this.store.remove(enc.id, creature.id);
		};

		// HP controls
		const hpRow = item.createDiv({ cls: 'hp-controls' });
		const hpButton = (text: string, delta: number) => {
			const b = hpRow.createEl('button', { text, cls: 'hp-btn', attr: { 'aria-label': `${delta < 0 ? 'Damage' : 'Heal'} ${Math.abs(delta)}` } });
			b.onclick = () => this.changeHp(enc, creature, creature.currentHp + delta);
		};
		hpButton('-5', -5);
		hpButton('-1', -1);
		const display = hpRow.createEl('button', {
			text: `${creature.currentHp} / ${creature.maxHp}`,
			cls: 'hp-display',
			attr: {
				'aria-label': `${creature.label} HP ${creature.currentHp} of ${creature.maxHp}. Click to type damage or healing.`,
				title: 'Click to type: 7 deals 7 damage, +7 heals 7, =20 sets HP',
			},
		});
		display.onclick = () => this.startHpEntry(display, enc, creature);
		hpButton('+1', 1);
		hpButton('+5', 5);

		const bar = item.createDiv({ cls: 'creature-hp-bar' });
		bar.createDiv({ cls: 'creature-hp-fill' }).style.width = `${creature.maxHp ? (creature.currentHp / creature.maxHp) * 100 : 0}%`;

		// Solo extras
		if (creature.monster.monsterType === 'solo') this.renderSoloExtras(item, enc, creature);

		// Conditions
		this.renderConditions(item, enc, creature);
	}

	private renderSoloExtras(item: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const m = creature.monster;
		const lr = m.legendaryResistances || 0;
		if (lr > 0) {
			const used = creature.lrUsed || 0;
			const row = item.createDiv({ cls: 'legendary-row' });
			row.createSpan({ text: 'Legendary resistance', cls: 'legendary-label' });
			for (let i = 0; i < lr; i++) {
				const spent = i < used;
				const pip = row.createEl('button', {
					cls: `legendary-pip${spent ? ' is-spent' : ''}`,
					attr: { 'aria-label': spent ? `Restore legendary resistance ${i + 1}` : `Spend legendary resistance ${i + 1}`, 'aria-pressed': String(spent) },
				});
				pip.onclick = () => this.store.setLegendaryUsed(enc.id, creature.id, spent ? i : i + 1);
			}
		}
		const half = creature.currentHp <= creature.maxHp / 2;
		if (creature.currentHp === 0 && m.lastStand) {
			this.phaseBanner(item, 'LAST STAND', m.lastStand, 'laststand-section', creature);
		} else if (half && m.bloodied) {
			this.phaseBanner(item, 'BLOODIED', m.bloodied, 'bloodied-section', creature);
		}
	}

	private phaseBanner(item: HTMLElement, label: string, text: string, cls: string, creature: EncounterCreature): void {
		const el = item.createDiv({ cls: `phase-banner ${cls}` });
		el.createEl('strong', { text: `${label}: ` });
		el.appendText(text);
		el.setAttr('title', `${creature.label} ${label.toLowerCase()}`);
	}

	/** Swap the HP readout for a text box: "7" damages, "+7" heals, "=20" sets. */
	private startHpEntry(display: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const input = createEl('input', {
			type: 'text',
			cls: 'hp-input',
			attr: {
				placeholder: 'dmg / +heal',
				inputmode: 'text',
				enterkeyhint: 'done',
				'aria-label': `Change HP for ${creature.label}: 7 deals damage, +7 heals, =20 sets`,
			},
		});
		let done = false;
		// Cancelling puts the readout back in place instead of re-rendering, so a
		// click elsewhere in the tracker that caused the blur isn't swallowed.
		const cancel = () => {
			if (done) return;
			done = true;
			if (input.isConnected) input.replaceWith(display);
		};
		const apply = () => {
			if (done) return;
			if (input.value.trim() === '') { cancel(); return; }
			const next = applyHpInput(input.value, creature.currentHp, creature.maxHp);
			if (next === null) { input.addClass('is-invalid'); return; }
			done = true;
			this.changeHp(enc, creature, next);
		};
		input.onkeydown = (e) => {
			if (e.key === 'Enter') { e.preventDefault(); apply(); }
			else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); display.focus(); }
		};
		input.oninput = () => input.removeClass('is-invalid');
		input.onblur = cancel;
		display.replaceWith(input);
		input.focus();
	}

	private changeHp(enc: Encounter, creature: EncounterCreature, hp: number): void {
		const crossed: HpThreshold = this.store.setHp(enc.id, creature.id, hp);
		const m = creature.monster;
		if (crossed === 'bloodied' && m.bloodied) new Notice(`${creature.label} is Bloodied!\n${m.bloodied}`, 8000);
		else if (crossed === 'last-stand' && m.lastStand) new Notice(`${creature.label}: Last Stand!\n${m.lastStand}`, 8000);
	}

	private renderConditions(item: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const row = item.createDiv({ cls: 'conditions-row' });
		const conditions = creature.conditions || [];
		const isDying = creature.currentHp === 0;
		const isBloodied = !isDying && creature.currentHp <= creature.maxHp / 2;

		const shown: { name: string; auto: boolean }[] = [];
		if (isDying && !conditions.includes('Dying')) shown.push({ name: 'Dying', auto: true });
		if (isBloodied && !conditions.includes('Bloodied')) shown.push({ name: 'Bloodied', auto: true });
		for (const c of conditions) shown.push({ name: c, auto: false });

		for (const { name, auto } of shown) {
			const cond = this.plugin.getAllConditions().find(c => c.name === name);
			const tag = row.createSpan({ cls: 'condition-tag', attr: { role: 'button', tabindex: '0' } });
			tag.createSpan({ text: name });
			if (cond) tag.setAttr('title', cond.description);
			if (auto) {
				tag.addClass('auto-condition');
			} else {
				const x = tag.createSpan({ text: '×', cls: 'remove-condition', attr: { 'aria-label': `Remove ${name}` } });
				x.onclick = (e) => {
					e.stopPropagation();
					this.store.toggleCondition(enc.id, creature.id, name, false);
				};
			}
			const view = () => {
				this.viewingCondition = this.viewingCondition === name ? null : name;
				this.render();
			};
			tag.onclick = view;
			tag.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view(); } };
		}

		const add = row.createEl('button', { text: '+', cls: 'add-condition-btn', attr: { 'aria-label': `Add condition to ${creature.label}` } });
		add.onclick = (e) => {
			e.stopPropagation();
			this.showConditionPicker(add, enc, creature);
		};
	}

	private showConditionPicker(button: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const wasOpenForThis = this.picker?.dataset.creatureId === creature.id;
		this.closePicker();
		if (wasOpenForThis) return;

		const available = this.plugin.getAllConditions()
			.filter(c => !c.auto && !(creature.conditions || []).includes(c.name))
			.sort((a, b) => a.name.localeCompare(b.name));

		const picker = document.body.createDiv({ cls: 'condition-picker' });
		picker.dataset.creatureId = creature.id;
		picker.setAttr('role', 'listbox');
		if (available.length === 0) {
			picker.createDiv({ cls: 'picker-empty', text: 'All conditions applied' });
		}
		for (const cond of available) {
			const opt = picker.createDiv({ cls: 'picker-option', text: cond.name, attr: { title: cond.description, role: 'option', tabindex: '0' } });
			const choose = () => {
				this.closePicker();
				this.store.toggleCondition(enc.id, creature.id, cond.name, true);
			};
			opt.onclick = choose;
			opt.onkeydown = (e) => { if (e.key === 'Enter') choose(); };
		}

		const rect = button.getBoundingClientRect();
		picker.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
		picker.style.top = `${rect.bottom + 4}px`;
		requestAnimationFrame(() => {
			const r = picker.getBoundingClientRect();
			if (r.bottom > window.innerHeight - 8) {
				picker.style.top = `${Math.max(8, rect.top - r.height - 4)}px`;
			}
		});

		const outside = (e: MouseEvent) => {
			if (!picker.contains(e.target as Node) && e.target !== button) this.closePicker();
		};
		const timer = window.setTimeout(() => document.addEventListener('click', outside, true), 0);
		this.picker = picker;
		this.pickerCleanup = () => {
			window.clearTimeout(timer);
			document.removeEventListener('click', outside, true);
		};
	}

	private closePicker(): void {
		this.pickerCleanup?.();
		this.pickerCleanup = null;
		this.picker?.remove();
		this.picker = null;
	}

	private startRename(labelBox: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		const input = createEl('input', { type: 'text', cls: 'label-edit-input', value: creature.label });
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			if (save && input.value.trim() && input.value.trim() !== creature.label) {
				this.store.rename(enc.id, creature.id, input.value);
			} else {
				this.render();
			}
		};
		input.onblur = () => finish(true);
		input.onkeydown = (e) => {
			if (e.key === 'Enter') finish(true);
			else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
		};
		labelBox.empty();
		labelBox.appendChild(input);
		input.focus();
		input.select();
	}

	private makeDraggable(item: HTMLElement, list: HTMLElement, enc: Encounter, creature: EncounterCreature): void {
		item.setAttr('draggable', 'true');
		item.ondragstart = (e) => {
			item.addClass('dragging');
			e.dataTransfer?.setData('text/plain', creature.id);
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
			if (draggedId && draggedId !== creature.id) this.store.reorder(enc.id, draggedId, creature.id);
		};
	}

	// ------------------------------------------------------------------------

	private renderRollLog(container: HTMLElement): void {
		const log = this.plugin.settings.rollLog || [];
		if (!log.length) return;
		const section = container.createDiv({ cls: 'roll-log' });
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
