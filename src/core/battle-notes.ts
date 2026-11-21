// Battle notes: a ```nimble-encounter block in a campaign you play in. No difficulty, no Run, no
// stats: who you fought, how it went, where, when, and what you found. The format is the GM's
// (encounter-def.ts), so the same note reads fine on either side of the table. Each game draws the
// card in its own look and its foes as its own lore references; the parts here are the same in every
// game: the outcome pill, the facts, the notes, Edit and its dialog, and writing the block back.

import { AbstractInputSuggest, App, MarkdownPostProcessorContext, Menu, Modal, Notice, setIcon, Setting } from 'obsidian';
import { battleField, EncounterDef, encounterBlockSource, OUTCOMES, Outcome, outcomeOf, replaceEncounterBlock, withBattleField } from './encounter-def';
import { appendRichText } from './markdown';
import { wireWikiLinks } from './wiki-links';
import { EvIconName, evIcon } from './icons';
import { pill } from './pill';
import { linkPill } from './campaign-model';
import { dialogFoot, gameDialog } from './dialog';

/** Each outcome: its word, its Lucide icon for Obsidian's menu, and its Phosphor glyph on the card. */
export const OUTCOME_INFO: Record<Outcome, { label: string; icon: string; glyph: EvIconName }> = {
	won: { label: 'Won', icon: 'trophy', glyph: 'medal' },
	fled: { label: 'Fled', icon: 'footprints', glyph: 'footprints' },
	lost: { label: 'Lost', icon: 'skull', glyph: 'skull' },
	parley: { label: 'Parley', icon: 'handshake', glyph: 'hand' },
	ongoing: { label: 'Ongoing', icon: 'hourglass', glyph: 'hourglass' },
};

/**
 * Rewrite an encounter block's body in its note. For a block in a callout or a list the section
 * Obsidian reports is the whole callout or list, so the block's own fence is looked up (by its
 * source) and nothing else is touched.
 */
export async function writeEncounterBlock(app: App, el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, next: EncounterDef): Promise<void> {
	const info = ctx.getSectionInfo(el);
	const file = app.vault.getFileByPath(ctx.sourcePath);
	if (!info || !file) { new Notice('Could not find this block in the note to update it.'); return; }
	let ok = false;
	try {
		await app.vault.process(file, (text) => {
			const out = replaceEncounterBlock(text, info.lineStart, info.lineEnd, source, encounterBlockSource(next));
			ok = out !== null;
			return out ?? text;
		});
	} catch (e) {
		console.error('Ember Vault: could not update the encounter block', e);
	}
	if (!ok) new Notice('Couldn\'t update this encounter: the note changed. Nothing was written. Try again.');
}

/** How it went, as a tag in the card's head: a click picks another outcome. */
export function outcomePill(head: HTMLElement, def: EncounterDef, save: (next: EncounterDef) => void): HTMLElement {
	const raw = battleField(def, 'outcome');
	const outcome = outcomeOf(raw);
	const chip = pill(head, {
		tag: 'button',
		cls: `battle-outcome ${outcome ? `outcome-${outcome}` : raw ? 'outcome-other' : 'outcome-unset'}`,
		icon: outcome ? evIcon(OUTCOME_INFO[outcome].glyph) : undefined,
		text: outcome ? OUTCOME_INFO[outcome].label : raw || 'How did it go?',
		attr: { 'aria-label': 'How it went' },
	});
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
	return chip;
}

/** A value that's one link to a campaign note of a kind (a location, a quest…), which reading view draws as a chip with its kind's icon. */
function linksToChip(app: App, value: string, sourcePath: string): boolean {
	const m = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/.exec(value);
	const dest = m ? app.metadataCache.getFirstLinkpathDest(m[1].trim(), sourcePath) : null;
	return !!dest && !!linkPill(app.metadataCache.getFileCache(dest)?.frontmatter);
}

/** Where, when and loot, each with its icon (links work); nothing when none is set. */
export function battleFacts(card: HTMLElement, app: App, def: EncounterDef, sourcePath: string): void {
	const facts: [EvIconName, string, string][] = [['map-pin', 'Where', battleField(def, 'where')], ['clock', 'When', battleField(def, 'when')], ['gem', 'Loot', battleField(def, 'loot')]];
	const shown = facts.filter(([, , v]) => v);
	if (!shown.length) return;
	const meta = card.createDiv({ cls: 'battle-facts' });
	for (const [icon, label, value] of shown) {
		const f = meta.createDiv({ cls: 'battle-fact', attr: { 'aria-label': label } });
		// A place's link draws as a chip with its own pin (npc-links.ts): one pin is enough.
		if (!linksToChip(app, value, sourcePath)) setIcon(f.createSpan({ cls: 'battle-fact-icon' }), evIcon(icon));
		appendRichText(f.createSpan({ cls: 'battle-fact-text' }), value);
	}
	wireWikiLinks(meta, app, sourcePath);
}

/** The block's notes, as rich text with working links, in `cls`. */
export function battleNotesText(card: HTMLElement, app: App, def: EncounterDef, sourcePath: string, cls: string): void {
	if (!def.notes) return;
	const n = card.createDiv({ cls });
	appendRichText(n, def.notes);
	wireWikiLinks(n, app, sourcePath);
}

export interface BattleEditOptions {
	/** The game whose look the dialog takes. */
	system: string;
	/** Names for the "Add a foe" box as you type (the game's bestiary); anything else is kept as typed. */
	suggest: (query: string) => string[];
}

/** Edit: the battle notes dialog. */
export function battleEditButton(bar: HTMLElement, app: App, def: EncounterDef, save: (next: EncounterDef) => void, o: BattleEditOptions, cls = 'encounter-block-btn'): HTMLElement {
	const edit = pill(bar, { tag: 'button', cls, icon: evIcon('edit'), text: 'Edit', attr: { 'aria-label': 'Edit these battle notes' } });
	edit.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); new BattleNotesModal(app, def, save, o).open(); });
	return edit;
}

/** The game's names as you type, for the "Add a foe" box. Anything else typed is kept as written. */
class FoeSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, private input: HTMLInputElement, private suggest: (q: string) => string[], private onPick: (name: string) => void) {
		super(app, input);
	}

	protected getSuggestions(query: string): string[] {
		return this.suggest(query);
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

	constructor(app: App, def: EncounterDef, private onSave: (next: EncounterDef) => void, private o: BattleEditOptions) {
		super(app);
		this.draft = { ...def, monsters: def.monsters.map(m => ({ ...m })), extra: def.extra ? [...def.extra] : undefined };
	}

	onOpen(): void {
		this.titleEl.setText('Battle notes');
		gameDialog(this, this.o.system, { cls: 'nimble-battle-modal' });
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
			const step = (icon: 'minus' | 'plus', label: string, delta: number) => {
				const b = row.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
				setIcon(b, evIcon(icon));
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
			setIcon(x, evIcon('x'));
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
		new FoeSuggest(this.app, add, this.o.suggest, addFoe);
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

		dialogFoot(c, {
			cancel: () => this.close(),
			main: {
				text: 'Save', icon: evIcon('check'), cls: 'battle-modal-save',
				onClick: () => {
					const typed = this.contentEl.querySelector<HTMLInputElement>('.battle-modal-add')?.value.trim();
					if (typed) {
						const ex = this.draft.monsters.find(m => m.name.toLowerCase() === typed.toLowerCase());
						if (ex) ex.count += 1; else this.draft.monsters.push({ name: typed, count: 1 });
					}
					this.close();
					this.onSave(this.draft);
				},
			},
		});
		if (!d.monsters.length) window.setTimeout(() => add.focus(), 0);
	}

	onClose(): void { this.contentEl.empty(); }
}
