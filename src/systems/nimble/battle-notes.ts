// Battle notes: how a ```nimble-encounter block looks in a campaign you play
// in. No difficulty, no Run button, no stats: who you fought, how it went,
// where, and what you found. Monster names open lore cards, not stat blocks.
// The block format is the GM's one (see encounter-def.ts), so the same note
// reads fine on either side of the table.

import { AbstractInputSuggest, App, MarkdownPostProcessorContext, Menu, Modal, setIcon, Setting } from 'obsidian';
import type NimbleStatblocksPlugin from '../../../main';
import { battleField, EncounterDef, OUTCOMES, Outcome, outcomeOf, withBattleField } from '../../core/encounter-def';
import { createInlineRef } from './inline-ref';
import { appendRichText } from '../../core/markdown';
import { wireWikiLinks } from '../../core/wiki-links';
import { searchMonsters } from './suggest';

const OUTCOME_INFO: Record<Outcome, { label: string; icon: string }> = {
	won: { label: 'Won', icon: 'trophy' },
	fled: { label: 'Fled', icon: 'footprints' },
	lost: { label: 'Lost', icon: 'skull' },
	parley: { label: 'Parley', icon: 'handshake' },
	ongoing: { label: 'Ongoing', icon: 'hourglass' },
};

export function renderBattleNotes(plugin: NimbleStatblocksPlugin, el: HTMLElement, def: EncounterDef, ctx: MarkdownPostProcessorContext, save: (next: EncounterDef) => void): void {
	const card = el.createDiv({ cls: 'nimble-encounter-block nimble-battle-notes' });
	const head = card.createDiv({ cls: 'encounter-block-head' });
	setIcon(head.createSpan({ cls: 'encounter-block-icon' }), 'swords');
	head.createSpan({ cls: 'encounter-block-name', text: def.name });

	const raw = battleField(def, 'outcome');
	const outcome = outcomeOf(raw);
	const chip = head.createEl('button', {
		cls: `battle-outcome ${outcome ? `outcome-${outcome}` : raw ? 'outcome-other' : 'outcome-unset'}`,
		attr: { 'aria-label': 'How it went' },
	});
	if (outcome) setIcon(chip.createSpan({ cls: 'battle-outcome-icon' }), OUTCOME_INFO[outcome].icon);
	chip.createSpan({ text: outcome ? OUTCOME_INFO[outcome].label : raw || 'How did it go?' });
	chip.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const m = new Menu();
		for (const o of OUTCOMES) {
			m.addItem(i => i.setTitle(OUTCOME_INFO[o].label).setIcon(o === outcome ? 'check' : OUTCOME_INFO[o].icon)
				.onClick(() => save(withBattleField(def, 'outcome', o))));
		}
		m.showAtMouseEvent(e);
	});

	const list = card.createDiv({ cls: 'encounter-block-monsters' });
	for (const m of def.monsters) {
		const row = list.createDiv({ cls: 'encounter-chip battle-foe' });
		row.createSpan({ cls: 'encounter-count-n battle-foe-count', text: `${m.count}×` });
		// In the bestiary or the player's notes: a lore card on hover. Otherwise just the name as written.
		if (plugin.index.get(m.name, ctx.sourcePath)) row.appendChild(createInlineRef(plugin, m.name, ctx.sourcePath));
		else appendRichText(row.createSpan({ cls: 'battle-foe-name' }), m.written ?? m.name);
	}
	if (!def.monsters.length) list.createDiv({ cls: 'encounter-block-empty', text: 'No foes yet' });

	const facts: [string, string, string][] = [['map-pin', 'Where', battleField(def, 'where')], ['calendar-days', 'When', battleField(def, 'when')], ['gem', 'Loot', battleField(def, 'loot')]];
	const shown = facts.filter(([, , v]) => v);
	if (shown.length) {
		const meta = card.createDiv({ cls: 'battle-facts' });
		for (const [icon, label, value] of shown) {
			const f = meta.createDiv({ cls: 'battle-fact', attr: { 'aria-label': label } });
			setIcon(f.createSpan({ cls: 'battle-fact-icon' }), icon);
			appendRichText(f.createSpan({ cls: 'battle-fact-text' }), value);
		}
		wireWikiLinks(meta, plugin.app, ctx.sourcePath);
	}
	if (def.notes) {
		const n = card.createDiv({ cls: 'encounter-block-notes' });
		appendRichText(n, def.notes);
		wireWikiLinks(n, plugin.app, ctx.sourcePath);
	}

	const bar = card.createDiv({ cls: 'encounter-block-actions' });
	const edit = bar.createEl('button', { attr: { 'aria-label': 'Edit these battle notes' } });
	setIcon(edit.createSpan(), 'pencil');
	edit.createSpan({ text: 'Edit' });
	edit.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); new BattleNotesModal(plugin, def, save).open(); });
}

/** Bestiary names as you type, for the "Add a foe" box. Anything else typed is kept as written. */
class FoeSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, private input: HTMLInputElement, private plugin: NimbleStatblocksPlugin, private onPick: (name: string) => void) {
		super(app, input);
	}

	protected getSuggestions(query: string): string[] {
		return searchMonsters(this.plugin.index.all(), query, 20).map(e => e.name);
	}

	renderSuggestion(name: string, el: HTMLElement): void {
		el.setText(name);
	}

	selectSuggestion(name: string): void {
		this.onPick(name);
		this.input.value = '';
		this.close();
	}
}

/** The battle notes editor: who you fought, how many, how it went, where, loot and notes. */
export class BattleNotesModal extends Modal {
	private draft: EncounterDef;

	constructor(private plugin: NimbleStatblocksPlugin, def: EncounterDef, private onSave: (next: EncounterDef) => void) {
		super(plugin.app);
		this.draft = { ...def, monsters: def.monsters.map(m => ({ ...m })), extra: def.extra ? [...def.extra] : undefined };
	}

	onOpen(): void {
		this.titleEl.setText('Battle notes');
		this.modalEl.addClass('nimble-battle-modal');
		this.render();
	}

	private render(): void {
		const c = this.contentEl;
		c.empty();
		const d = this.draft;
		new Setting(c).setName('Name').addText(t => t.setPlaceholder('e.g. Ambush at the ford').setValue(d.name === 'Battle' ? '' : d.name)
			.onChange(v => { this.draft.name = v.trim() || 'Battle'; }));

		c.createDiv({ cls: 'battle-modal-heading', text: 'Who you fought' });
		const foes = c.createDiv({ cls: 'battle-modal-foes' });
		d.monsters.forEach((m, i) => {
			const row = foes.createDiv({ cls: 'battle-modal-foe' });
			const step = (icon: string, label: string, delta: number) => {
				const b = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
				setIcon(b, icon);
				b.addEventListener('click', () => {
					m.count += delta;
					if (m.count <= 0) d.monsters.splice(i, 1);
					this.render();
				});
			};
			step('minus', `One fewer ${m.name}`, -1);
			row.createSpan({ cls: 'battle-modal-count', text: String(m.count) });
			step('plus', `One more ${m.name}`, 1);
			row.createSpan({ cls: 'battle-modal-name', text: m.name });
			const x = row.createEl('button', { cls: 'clickable-icon battle-modal-remove', attr: { 'aria-label': `Remove ${m.name}` } });
			setIcon(x, 'x');
			x.addEventListener('click', () => { d.monsters.splice(i, 1); this.render(); });
		});
		const add = c.createEl('input', { type: 'text', cls: 'battle-modal-add', attr: { placeholder: 'Add a foe: type a name (bestiary or your own)', 'aria-label': 'Add a foe' } });
		const addFoe = (name: string) => {
			const n = name.trim();
			if (!n) return;
			const ex = d.monsters.find(m => m.name.toLowerCase() === n.toLowerCase());
			if (ex) ex.count += 1; else d.monsters.push({ name: n, count: 1 });
			this.render();
			window.setTimeout(() => this.contentEl.querySelector<HTMLInputElement>('.battle-modal-add')?.focus(), 0);
		};
		new FoeSuggest(this.app, add, this.plugin, addFoe);
		add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); addFoe(add.value); } });

		c.createDiv({ cls: 'battle-modal-heading', text: 'How it went' });
		const seg = c.createDiv({ cls: 'nimble-segmented battle-modal-outcome', attr: { role: 'radiogroup', 'aria-label': 'Outcome' } });
		const current = outcomeOf(battleField(d, 'outcome'));
		for (const o of OUTCOMES) {
			const b = seg.createEl('button', { text: OUTCOME_INFO[o].label, attr: { role: 'radio', 'aria-checked': String(o === current) } });
			b.toggleClass('is-active', o === current);
			b.addEventListener('click', () => { this.draft = withBattleField(this.draft, 'outcome', o === current ? '' : o); this.render(); });
		}

		const field = (key: 'where' | 'when' | 'loot', name: string, placeholder: string) => new Setting(c).setName(name).addText(t => t
			.setPlaceholder(placeholder).setValue(battleField(this.draft, key)).onChange(v => { this.draft = withBattleField(this.draft, key, v); }));
		field('where', 'Where', 'e.g. [[Tresendar Manor]]');
		field('when', 'When', 'e.g. [[Session 3]]');
		field('loot', 'Loot', 'e.g. 40 gp, a silver key');
		new Setting(c).setName('Notes').setClass('battle-modal-notes').addTextArea(t => t.setPlaceholder('What happened, who did what, what we learned')
			.setValue(d.notes ?? '').onChange(v => { this.draft.notes = v.trim() || undefined; }));

		new Setting(c)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Save').setCta().onClick(() => {
				const typed = this.contentEl.querySelector<HTMLInputElement>('.battle-modal-add')?.value.trim();
				if (typed) {
					const ex = this.draft.monsters.find(m => m.name.toLowerCase() === typed.toLowerCase());
					if (ex) ex.count += 1; else this.draft.monsters.push({ name: typed, count: 1 });
				}
				this.close();
				this.onSave(this.draft);
			}));
		if (!d.monsters.length) window.setTimeout(() => add.focus(), 0);
	}

	onClose(): void { this.contentEl.empty(); }
}
