// How a compendium entry looks: its name, a line about it, the rules text, and
// where it comes from (book, page, a Draft badge for playtest books). Used for
// the sheet's expandable rows, the pickers' previews and Spotlight's card.
// Rules text goes through appendRichText, never innerHTML.

import { App, Modal } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import {
	Ancestry, Background, Boon, ClassEntry, CompendiumHit, Item, KIND_LABEL, Spell, Subclass, tierLabel, weaponDamage,
} from './compendium';
import { appendRichText } from './markdown';

export interface CardOptions {
	/** Roll a dice expression found in the text. */
	onDice?: (el: HTMLElement, expression: string) => void;
	keywords?: RegExp;
	onKeyword?: (el: HTMLElement, word: string) => void;
}

/** "Core p. 35" with a Draft badge when the book is a playtest draft. */
export function renderSource(parent: HTMLElement, e: { source?: string; page?: number | null; draft?: boolean }): void {
	if (!e.source && !e.page && !e.draft) return;
	const row = parent.createDiv({ cls: 'nimble-cmp-source' });
	if (e.source || e.page) row.createSpan({ text: [e.source, e.page ? `p. ${e.page}` : ''].filter(Boolean).join(' · ') });
	if (e.draft) row.createSpan({ cls: 'nimble-cmp-draft', text: 'Draft', attr: { title: 'From a playtest draft: may change before release' } });
}

/** Paragraphs of rules text ("\n\n" between paragraphs, "\n" kept as line breaks, "•" bullets as a list). */
export function renderRulesText(parent: HTMLElement, text: string | undefined, o: CardOptions = {}): void {
	if (!text) return;
	for (const para of text.split(/\n{2,}/)) {
		const lines = para.split('\n');
		if (lines.length > 1 && lines.slice(1).every(l => /^\s*[•\-–]\s/.test(l))) {
			if (lines[0].trim()) appendRichText(parent.createEl('p', { cls: 'nimble-cmp-text' }), lines[0], o);
			const ul = parent.createEl('ul', { cls: 'nimble-cmp-list' });
			for (const l of lines.slice(1)) appendRichText(ul.createEl('li'), l.replace(/^\s*[•\-–]\s*/, ''), o);
			continue;
		}
		const p = parent.createEl('p', { cls: 'nimble-cmp-text' });
		lines.forEach((l, i) => { if (i) p.createEl('br'); appendRichText(p, l, o); });
	}
}

/** The body of a card for any compendium hit (no title). */
export function renderHitBody(parent: HTMLElement, hit: CompendiumHit, o: CardOptions = {}): void {
	const facts = parent.createDiv({ cls: 'nimble-cmp-facts' });
	const fact = (label: string, value: string | number | undefined) => {
		if (value === undefined || value === '') return;
		const f = facts.createSpan({ cls: 'nimble-cmp-fact' });
		f.createSpan({ cls: 'nimble-cmp-fact-label', text: label });
		f.createSpan({ cls: 'nimble-cmp-fact-value', text: String(value) });
	};
	switch (hit.kind) {
		case 'item': {
			const it = hit.entry as Item;
			fact('Type', [it.category, it.subcategory].filter(Boolean).join(' · '));
			fact('Damage', weaponDamage(it));
			fact('Armor', it.armor);
			fact('Range', it.range);
			fact('Req.', it.strength ? `${it.strength} STR` : undefined);
			fact('Slots', it.slots);
			fact('Rarity', it.rarity);
			fact('Cost', it.cost);
			if (it.properties?.length) fact('Properties', it.properties.join(', '));
			renderRulesText(parent, it.text, o);
			break;
		}
		case 'spell': {
			const s = hit.entry as Spell;
			fact('School', s.school);
			fact('Tier', s.utility ? `Utility ${tierLabel(s.tier).toLowerCase()}` : tierLabel(s.tier));
			fact('Cost', s.tier ? `${s.tier} mana` : undefined);
			fact('Cast', s.actions);
			fact('Range', s.range);
			fact('Area', s.aoe);
			fact('Concentration', s.concentration);
			fact('Damage', s.damage);
			renderRulesText(parent, s.text, o);
			if (s.higherLevels) renderLabelled(parent, 'Upcast', s.higherLevels, o);
			if (s.cantripScaling) renderLabelled(parent, 'Higher levels', s.cantripScaling, o);
			break;
		}
		case 'class': {
			const c = hit.entry as ClassEntry;
			if (c.tagline) parent.createDiv({ cls: 'nimble-cmp-tagline', text: c.tagline });
			fact('Key stats', c.keyStats?.join(', '));
			fact('Hit die', c.hitDie ? `d${c.hitDie}` : undefined);
			fact('Starting HP', c.startingHp);
			fact('Saves', c.saves ? [c.saves.adv ? `${c.saves.adv} ▲` : '', c.saves.dis ? `${c.saves.dis} ▼` : ''].filter(Boolean).join(' · ') : undefined);
			fact('Armor', c.armor);
			fact('Weapons', c.weapons);
			if (c.casting?.mana) fact('Mana', c.casting.mana);
			if (c.startingGear?.length) fact('Starting gear', c.startingGear.join(', '));
			renderRulesText(parent, c.flavor, o);
			if (c.subclasses?.length) renderLabelled(parent, 'Subclasses', c.subclasses.map(s => s.name).join(', '), o);
			break;
		}
		case 'subclass': {
			const s = hit.entry as Subclass;
			renderRulesText(parent, s.flavor, o);
			if (s.intro) renderRulesText(parent, s.intro, o);
			for (const l of s.levels ?? []) for (const f of l.features ?? []) renderLabelled(parent, `${f.name} (level ${l.level})`, f.text, o);
			break;
		}
		case 'ancestry': {
			const a = hit.entry as Ancestry;
			fact('Size', a.size);
			fact('Rarity', a.rarity);
			renderRulesText(parent, a.flavor, o);
			for (const t of a.traits ?? []) renderLabelled(parent, t.name, t.text, o);
			break;
		}
		case 'background': {
			const b = hit.entry as Background;
			if (b.requirement) fact('Requirement', b.requirement);
			renderRulesText(parent, b.text, o);
			break;
		}
		case 'boon': {
			const b = hit.entry as Boon;
			fact('Kind', b.kind);
			if (b.requirement) fact('Requirement', b.requirement);
			renderRulesText(parent, b.text, o);
			break;
		}
		default: {
			fact('Class', hit.className);
			fact('Subclass', hit.subclass);
			fact('From', hit.group);
			fact('Level', hit.level);
			fact('Cost', hit.cost);
			renderRulesText(parent, hit.text, o);
		}
	}
	if (!facts.childElementCount) facts.remove();
	renderSource(parent, hit);
}

function renderLabelled(parent: HTMLElement, label: string, text: string, o: CardOptions): void {
	const p = parent.createEl('p', { cls: 'nimble-cmp-text' });
	p.createEl('strong', { text: `${label}. ` });
	appendRichText(p, text, o);
}

/** A whole card: kind, name, detail line, body. */
export function renderHitCard(parent: HTMLElement, hit: CompendiumHit, o: CardOptions = {}): HTMLElement {
	const card = parent.createDiv({ cls: `nimble-cmp-card kind-${hit.kind}` });
	const head = card.createDiv({ cls: 'nimble-cmp-head' });
	head.createDiv({ cls: 'nimble-cmp-kind', text: KIND_LABEL[hit.kind] });
	head.createDiv({ cls: 'nimble-cmp-name', text: hit.name });
	if (hit.detail) head.createDiv({ cls: 'nimble-cmp-detail', text: hit.detail });
	renderHitBody(card.createDiv({ cls: 'nimble-cmp-body' }), hit, o);
	return card;
}

/** Spotlight's Enter on a compendium row: the card in a modal, with an optional action. */
export class CompendiumCardModal extends Modal {
	constructor(app: App, private plugin: NimbleStatblocksPlugin, private hit: CompendiumHit, private action?: { label: string; run: () => void }) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-cmp-modal');
		renderHitCard(this.contentEl, this.hit, {
			onDice: (el, expr) => {
				el.addClass('is-clickable');
				el.setAttr('role', 'button');
				el.addEventListener('click', () => { this.plugin.rollDice(expr, this.hit.name); });
			},
			keywords: this.plugin.conditionKeywords(),
			onKeyword: (el, word) => {
				el.addClass('nimble-condition-ref');
				el.addEventListener('click', () => this.plugin.showConditionInfo(el, word));
			},
		});
		const a = this.action;
		if (a) {
			const row = this.contentEl.createDiv({ cls: 'nimble-cmp-actions' });
			const b = row.createEl('button', { cls: 'mod-cta', text: a.label });
			b.onclick = () => { this.close(); a.run(); };
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
