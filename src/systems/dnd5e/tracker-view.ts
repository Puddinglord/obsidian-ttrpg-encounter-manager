// The 5e combat tracker (right sidebar): initiative order, the current turn,
// HP with temporary HP, AC, conditions with durations, death saves for heroes
// at 0 HP, and legendary action uses. Every change goes through the store.

import { openHpPad } from '../../core/tracker/hp-pad';
import { FuzzySuggestModal, ItemView, Menu, setIcon, WorkspaceLeaf } from 'obsidian';
import { renderPipRow } from '../../core/pip-row';
import { pill } from '../../core/pill';
import { openGameSettings } from '../../core/settings-ui';
import { startRolls5e } from './settings';
import {
	addCondition, addHero, addMonster, applyHp, Combatant5e, current, deathSave, end, Fight5e, isRunning, next, order, parseHp, previewHp,
	previous, remove, removeCondition, rollInitiative, setDeathSaves5e, setInitiative, start, useLegendary,
} from './combat';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';
import { formatMod } from './rules';
import { applyLook } from '../../core/look';

export const DND5E_TRACKER_VIEW = 'nimble-dnd5e-tracker';

export class Dnd5eTrackerView extends ItemView {
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

		// Header: the fight, where it's at, and a menu for the rest.
		const head = root.createDiv({ cls: 'dnd5e-tracker-head' });
		head.createDiv({ cls: 'dnd5e-tracker-title', text: f.name });
		head.createDiv({ cls: 'dnd5e-tracker-round', text: isRunning(f) ? `Round ${f.round}` : f.combatants.length ? 'Not started' : 'No one here yet' });
		const more = head.createEl('button', { cls: 'clickable-icon dnd5e-tracker-more', attr: { 'aria-label': 'Fight options' } });
		setIcon(more, 'more-horizontal');
		more.onclick = (e) => this.fightMenu(e);

		// The fight's controls on one line: the big button is what comes next (Start combat, then
		// Next turn); Back and Roll initiative beside it; End, Add monster and Add party as icons.
		const running = isRunning(f);
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
			const go = btn('Start combat', 'swords', () => this.change(x => start(x, Math.random, startRolls5e(this.rt.plugin))), 'mod-cta dnd5e-tracker-primary');
			go.disabled = !f.combatants.length;
		} else {
			btn('Back', 'undo-2', () => this.change(x => previous(x)), 'dnd5e-tracker-side').setAttr('aria-label', 'Back a turn');
			btn('Next turn', 'skip-forward', () => this.change(x => next(x)), 'mod-cta dnd5e-tracker-primary');
			btn('End combat', 'square', () => this.change(x => end(x)), 'dnd5e-tracker-icon', true);
		}
		btn('Add monster', 'plus', () => this.pickMonster(), 'dnd5e-tracker-icon', true);
		if (!f.combatants.some(c => c.side === 'hero')) btn('Add the party', 'users', () => this.addParty(), 'dnd5e-tracker-icon', true);

		const list = root.createDiv({ cls: 'dnd5e-tracker-list' });
		if (!f.combatants.length) {
			list.createDiv({ cls: 'dnd5e-tracker-empty', text: 'Add monsters here, run an encounter block, or add the party.' });
		}
		const cur = current(f);
		for (const c of order(f)) this.renderRow(list, c, c.id === cur?.id);

		if (f.log.length) {
			const log = root.createEl('details', { cls: 'dnd5e-tracker-log' });
			log.createEl('summary', { text: 'Log' });
			for (const l of f.log.slice(-12).reverse()) log.createDiv({ text: `R${l.round} · ${l.text}` });
		}
	}

	private renderRow(list: HTMLElement, c: Combatant5e, isTurn: boolean): void {
		const row = list.createDiv({ cls: `dnd5e-combatant side-${c.side}` });
		row.dataset.id = c.id;
		row.toggleClass('is-turn', isTurn);
		row.toggleClass('is-down', c.hp <= 0);
		row.toggleClass('is-dead', !!c.dead);

		const init = row.createEl('input', { cls: 'dnd5e-init', type: 'number', attr: { 'aria-label': `${c.label} initiative`, placeholder: formatMod(c.initBonus) } });
		if (c.init !== undefined) init.value = String(c.init);
		init.onchange = () => { const n = parseInt(init.value, 10); this.change(f => setInitiative(f, c.id, Number.isFinite(n) ? n : undefined)); };

		const main = row.createDiv({ cls: 'dnd5e-combatant-main' });
		const top = main.createDiv({ cls: 'dnd5e-combatant-top' });
		const name = top.createEl('a', { cls: 'dnd5e-combatant-name', text: c.label, attr: { href: '#' } });
		const entry = this.entryFor(c);
		name.onclick = (e) => { e.preventDefault(); if (entry) this.rt.quickLook(entry, this.fight.sourcePath ?? ''); };
		if (entry) this.rt.plugin.hover.attach(name, () => this.rt.hover(entry, this.fight.sourcePath ?? ''));
		if (c.ac !== undefined) top.createSpan({ cls: 'dnd5e-ac', text: `AC ${c.ac}`, attr: { title: 'Armor Class' } });
		if (c.monster) top.createSpan({ cls: 'dnd5e-cr', text: `CR ${c.monster.cr}` });

		// HP: a bar, the numbers, and a box that takes damage, healing and temp HP.
		const hp = main.createDiv({ cls: 'dnd5e-hp' });
		const meter = hp.createDiv({ cls: 'dnd5e-hp-bar' });
		meter.createDiv({ cls: 'dnd5e-hp-fill' }).setCssStyles({ width: `${Math.round(100 * Math.max(0, c.hp) / Math.max(1, c.maxHp))}%` });
		// The numbers open the HP keypad (Damage, Heal, Set, Temp; Crit, Vulnerable, Resisted).
		const hpText = hp.createEl('button', { cls: 'dnd5e-hp-text', text: `${c.hp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp}` : ''}`, attr: { 'aria-label': `${c.label}: change HP` } });
		hpText.onclick = () => openHpPad(hpText, {
			id: c.id, label: c.label, sub: `${c.hp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}${c.ac !== undefined ? ` · AC ${c.ac}` : ''}`,
			crit: true, mods: { vulnerable: 'Vulnerable ×2', resisted: 'Resisted ½' },
			preview: (mode, v, crit, mod) => {
				const cmd = mode === 'damage' ? (v > 0 ? { kind: 'damage' as const, amount: v, crit, type: mod } : null) : mode === 'set' ? { kind: 'set' as const, amount: v } : v > 0 ? { kind: mode, amount: v } : null;
				return cmd ? previewHp(this.fight, c.id, cmd) : '';
			},
			sideOf: this.containerEl,
			apply: (cmd) => this.change(f => applyHp(f, c.id, cmd)),
		});
		const box = hp.createEl('input', { cls: 'dnd5e-hp-input', type: 'text', attr: { placeholder: '−dmg +heal', 'aria-label': `${c.label} HP change`, title: 'Damage (7), crit (7!), vulnerable (7v), resisted (7r), heal (+7), temp HP (t7), set (=7); Enter' } });
		box.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			const change = parseHp(box.value);
			if (!change) { box.addClass('is-invalid'); return; }
			this.change(f => applyHp(f, c.id, change));
		});

		// Heroes at 0 HP: death saves.
		if (c.side === 'hero' && c.hp <= 0 && !c.dead) {
			const ds = main.createDiv({ cls: 'dnd5e-death' });
			if (c.stable) ds.createSpan({ cls: 'dnd5e-death-stable', text: 'Stable' });
			else {
				const s = c.deathSaves ?? { success: 0, failure: 0 };
				renderPipRow(ds, { key: `death-ok:${c.id}`, name: 'Saves', label: true, count: s.success, max: 3, cls: 'is-success', set: n => this.change(f => setDeathSaves5e(f, c.id, n, s.failure)) });
				renderPipRow(ds, { key: `death-fail:${c.id}`, name: 'Fails', label: true, count: s.failure, max: 3, cls: 'is-failure', set: n => this.change(f => setDeathSaves5e(f, c.id, s.success, n)) });
				const roll = ds.createEl('button', { cls: 'dnd5e-death-roll', text: 'Roll save' });
				roll.onclick = () => this.rollDeathSave(c);
			}
		}
		if (c.dead) main.createDiv({ cls: 'dnd5e-death-dead', text: 'Dead' });

		// Legendary actions left: core's pips (a filled one spends one, an empty one gives one back).
		if (c.legendary) {
			const left = c.legendary.max - c.legendary.used;
			renderPipRow(main.createDiv({ cls: 'dnd5e-legendary' }), {
				key: `legendary:${c.id}`, name: 'Legendary', label: true, count: left, max: c.legendary.max, cls: 'is-legendary',
				set: n => this.change(f => useLegendary(f, c.id, left - n)),
			});
		}

		// Conditions.
		const conds = main.createDiv({ cls: 'dnd5e-conditions' });
		for (const x of c.conditions) {
			const chip = conds.createSpan({ cls: 'dnd5e-condition', text: `${x.name}${x.value ? ` ${x.value}` : ''}${x.rounds !== undefined ? ` (${x.rounds})` : ''}`, attr: { title: 'Click to remove' } });
			chip.onclick = () => this.change(f => removeCondition(f, c.id, x.name));
		}
		const add = conds.createEl('button', { cls: 'dnd5e-condition-add clickable-icon', attr: { 'aria-label': 'Add a condition' } });
		setIcon(add, 'plus');
		add.onclick = (e) => this.conditionMenu(c, e);

		const del = row.createEl('button', { cls: 'dnd5e-remove clickable-icon', attr: { 'aria-label': `Remove ${c.label}` } });
		setIcon(del, 'x');
		del.onclick = () => this.change(f => remove(f, c.id));
	}

	private entryFor(c: Combatant5e): Dnd5eEntry | undefined {
		if (!c.monster) return undefined;
		return { name: c.name, filePath: c.sourceFile ?? '', monster: c.monster, bundled: !!c.monster.bundledId && !c.sourceFile };
	}

	private conditionMenu(c: Combatant5e, e: MouseEvent): void {
		const menu = new Menu();
		const have = new Set(c.conditions.map(x => x.name.toLowerCase()));
		const list = [...this.rt.plugin.systems.resolve('5e').conditions(this.fight.edition), ...this.rt.plugin.settings.customConditions];
		for (const def of list) {
			if (have.has(def.name.toLowerCase())) continue;
			menu.addItem(i => i.setTitle(def.name).onClick(() => this.change(f => addCondition(f, c.id, def.name, def.hasValue ? { value: 1 } : {}))));
		}
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
