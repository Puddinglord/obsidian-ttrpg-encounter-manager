// How a compendium entry looks: its name, a line about it, the rules text, and
// where it comes from (book, page, a Draft badge for playtest books). Used for
// the sheet's expandable rows, the pickers' previews, Omnisearch's card, the
// card modal and the hover preview of `nimble:spell:…` references. Classes and
// subclasses get a whole page: every level, option group, subclass and FAQ.
// Rules text goes through appendRichText, never innerHTML.

import { App, EventRef, Modal, setIcon } from 'obsidian';
import { evIcon } from '../../core/icons';
import { applyLook } from '../../core/look';
import type EmberVaultPlugin from '../../../main';
import {
	Ancestry, Background, Boon, ClassEntry, ClassOption, CompendiumHit, CompendiumKind, Feature, Item, KIND_LABEL, LevelFeatures,
	nameKey, OptionGroup, Spell, Subclass, tierLabel, weaponDamage,
} from './compendium';
import { bundledCompendium, fullCompendium } from './compendium-data';
import { resolveCompendiumRef } from './compendium-ref';
import { appendRichText } from '../../core/markdown';
import { renderArtSlot } from './compendium-art';
import { hitArtKey } from './compendium-entries';
import { renderClassScroll } from './class-scroll';
import { nimble } from './runtime';

export interface CardOptions {
	/** Roll a dice expression found in the text. */
	onDice?: (el: HTMLElement, expression: string) => void;
	keywords?: RegExp;
	onKeyword?: (el: HTMLElement, word: string) => void;
	/** Open another entry (a feature's class, a class's spell). Names become links when this is set. */
	onOpenHit?: (hit: CompendiumHit) => void;
}

/** A condition, shown as a card like any compendium entry (NimbleCondition fits). */
export interface ConditionInfo { name: string; description: string }

/** Anything a card can show. */
export type CardTarget = CompendiumHit | ConditionInfo;

export function isHit(t: CardTarget): t is CompendiumHit {
	return 'kind' in t && 'entry' in t;
}

const KIND_ICON_CMP: Record<CompendiumKind, string> = {
	item: 'backpack', spell: 'wand-2', feature: 'sparkles', class: 'graduation-cap', subclass: 'git-branch',
	ancestry: 'users', background: 'scroll-text', boon: 'gem',
};

/** Icon for conditions (cards and inline references). */
export const CONDITION_ICON = 'alert-circle';

/** Icon for a compendium entry (items by category), for the editor's chrome: inline references. */
export function compendiumIcon(h: CompendiumHit): string {
	if (h.kind === 'item') {
		const c = (h.entry as Item).category;
		return c === 'weapon' ? 'sword' : c === 'armor' ? 'shirt' : c === 'shield' ? 'shield' : c === 'consumable' ? 'flask-conical' : c === 'magic' ? 'sparkle' : c === 'scroll' ? 'scroll' : c === 'wand' ? 'wand' : 'backpack';
	}
	return KIND_ICON_CMP[h.kind];
}

const KIND_GLYPH: Record<CompendiumKind, Parameters<typeof evIcon>[0]> = {
	item: 'backpack', spell: 'spell', feature: 'sparkle', class: 'shield-star', subclass: 'path',
	ancestry: 'users-three', background: 'scroll', boon: 'diamond',
};

/** The same, in the game's own icons (Phosphor Bold): cards, the compendium's rows, Omnisearch. */
export function compendiumGlyph(h: CompendiumHit): string {
	if (h.kind === 'item') {
		const c = (h.entry as Item).category;
		return evIcon(c === 'weapon' ? 'sword' : c === 'armor' || c === 'shield' ? 'shield' : c === 'consumable' ? 'flask' : c === 'magic' ? 'sparkle' : c === 'scroll' ? 'scroll' : c === 'wand' ? 'wand' : 'backpack');
	}
	return evIcon(KIND_GLYPH[h.kind]);
}

/** A condition's icon on the game's own surfaces. */
export const CONDITION_GLYPH = 'ev-condition';

/**
 * An entry by kind and name (and owning class or subclass), from the bundled
 * compendium, or with drafts included when the setting hides them.
 */
export function findHit(kind: CompendiumKind, name: string | undefined, owner?: string): CompendiumHit | undefined {
	if (!name) return undefined;
	const ref = { kind, name, owner };
	return resolveCompendiumRef(bundledCompendium(), ref) ?? resolveCompendiumRef(fullCompendium(), ref);
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

/** A link to another entry when the card can open one, else plain text. */
function hitLink(parent: HTMLElement, text: string, target: CompendiumHit | undefined, o: CardOptions, cls = ''): HTMLElement {
	if (!target || !o.onOpenHit) return parent.createSpan({ cls, text });
	const open = o.onOpenHit;
	const a = parent.createEl('a', { cls: `nimble-cmp-link ${cls}`.trim(), text, attr: { href: '#', title: `Open ${target.name}` } });
	a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(target); });
	return a;
}

/** The row of small label/value facts at the top of a card. */
function factRow(parent: HTMLElement) {
	const facts = parent.createDiv({ cls: 'nimble-cmp-facts' });
	const fact = (label: string, value: string | number | undefined, link?: CompendiumHit, o: CardOptions = {}, cls = '') => {
		if (value === undefined || value === '') return;
		const f = facts.createSpan({ cls: `nimble-cmp-fact ${cls}`.trim() });
		f.createSpan({ cls: 'nimble-cmp-fact-label', text: label });
		hitLink(f, String(value), link, o, 'nimble-cmp-fact-value');
	};
	return { facts, fact, done: () => { if (!facts.childElementCount) facts.remove(); } };
}

/** The body of a card for any compendium hit (no title). */
export function renderHitBody(parent: HTMLElement, hit: CompendiumHit, o: CardOptions = {}): void {
	const { fact, done } = factRow(parent);
	switch (hit.kind) {
		case 'item': {
			const it = hit.entry as Item;
			fact('Type', [it.category, it.subcategory].filter(Boolean).join(' · '));
			fact('Damage', weaponDamage(it));
			fact('Defense', it.armor);
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
			fact('Cost', s.tier ? `${s.tier} mana` : undefined, undefined, {}, 'is-mana');
			fact('Cast', s.actions);
			fact('Range', s.range);
			fact('Area', s.aoe);
			fact('Concentration', s.concentration);
			fact('Damage', s.damage);
			if (s.class) fact('Class', s.class, findHit('class', s.class), o);
			renderRulesText(parent, s.text, o);
			if (s.higherLevels) renderLabelled(parent, 'Upcast', s.higherLevels, o);
			if (s.cantripScaling) renderLabelled(parent, 'Higher levels', s.cantripScaling, o);
			break;
		}
		case 'class':
			done();
			renderClassPage(parent, hit.entry as ClassEntry, o);
			break;
		case 'subclass': {
			const s = hit.entry as Subclass;
			fact('Class', hit.className, findHit('class', hit.className), o);
			fact('Complexity', s.complexity);
			if (s.story) fact('Kind', 'Story subclass');
			renderSubclassBody(parent, s, o, true);
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
			fact('Category', b.category);
			if (b.requirement) fact('Requirement', b.requirement);
			renderRulesText(parent, b.text, o);
			break;
		}
		case 'boon': {
			const b = hit.entry as Boon;
			fact('Kind', b.kind ? `${b.kind[0].toUpperCase()}${b.kind.slice(1)} boon` : undefined);
			if (b.requirement) fact('Requirement', b.requirement);
			renderRulesText(parent, b.text, o);
			break;
		}
		default: {
			// A class or subclass feature, or a class option.
			const opt = hit.entry as Partial<ClassOption>;
			fact('Class', hit.className, findHit('class', hit.className), o);
			fact('Subclass', hit.subclass, findHit('subclass', hit.subclass, hit.className), o);
			fact('Level', hit.level);
			fact('Option', hit.group);
			fact('Cost', hit.cost);
			fact('Requirement', opt.requirement);
			renderRulesText(parent, hit.text, o);
			const intro = hit.group ? groupOf(hit)?.intro : undefined;
			if (intro) {
				const d = details(parent, `About ${hit.group}`, 'nimble-cmp-group-about');
				renderRulesText(d, intro, o);
			}
		}
	}
	done();
	renderSource(parent, hit);
}

/** The option group a class option comes from (for its intro). */
function groupOf(hit: CompendiumHit): OptionGroup | undefined {
	const cls = bundledCompendium().classByName(hit.className) ?? fullCompendium().classByName(hit.className);
	if (!cls) return undefined;
	const sub = hit.subclass ? cls.subclasses?.find(s => nameKey(s.name) === nameKey(hit.subclass ?? '')) : undefined;
	const k = nameKey(hit.group ?? '');
	return [...(sub?.optionGroups ?? []), ...(cls.optionGroups ?? [])].find(g => nameKey(g.name) === k);
}

function renderLabelled(parent: HTMLElement, label: string, text: string, o: CardOptions): void {
	const p = parent.createEl('p', { cls: 'nimble-cmp-text' });
	p.createEl('strong', { text: `${label}. ` });
	appendRichText(p, text, o);
}

/** A collapsible section's header row: a chevron (turns when open), then the title. */
function summaryRow(d: HTMLDetailsElement, title: string): HTMLElement {
	const s = d.createEl('summary', { cls: 'nimble-cmp-summary' });
	setIcon(s.createSpan({ cls: 'nimble-cmp-summary-chev' }), 'chevron-right');
	s.createSpan({ cls: 'nimble-cmp-summary-title', text: title });
	return s;
}

/** A collapsible section: returns its body. */
function details(parent: HTMLElement, title: string, cls = '', count?: number, open = false): HTMLElement {
	const d = parent.createEl('details', { cls: `nimble-cmp-details ${cls}`.trim() });
	if (open) d.open = true;
	const s = summaryRow(d, title);
	if (count) s.createSpan({ cls: 'nimble-cmp-count', text: String(count) });
	return d.createDiv({ cls: 'nimble-cmp-details-body' });
}

function sectionTitle(parent: HTMLElement, text: string): void {
	parent.createDiv({ cls: 'nimble-cmp-section-title', text });
}

/** Placeholders the class table lists ("Subclass", "Key Stat Increase"): shown quieter than real features. */
const PLACEHOLDER = /^(subclass|key stat increase|secondary stat increase|epic boon)$/i;

/** One named feature or option: name (with cost/requirement tags) then its rules text. */
function renderFeature(parent: HTMLElement, f: Feature | ClassOption, o: CardOptions): void {
	const text = typeof f.text === 'string' ? f.text : '';
	const placeholder = PLACEHOLDER.test(f.name ?? '');
	if (placeholder && !text.trim()) return;
	const el = parent.createDiv({ cls: `nimble-cmp-feature${placeholder ? ' is-placeholder' : ''}` });
	const head = el.createDiv({ cls: 'nimble-cmp-feature-head' });
	head.createSpan({ cls: 'nimble-cmp-feature-name', text: f.name });
	const opt = f as ClassOption;
	if (opt.cost) head.createSpan({ cls: 'nimble-cmp-tag', text: opt.cost });
	if (opt.requirement) head.createSpan({ cls: 'nimble-cmp-tag is-req', text: opt.requirement });
	renderRulesText(el, text, o);
}

/** Levels in order, each with a level badge and its features. */
function renderLevels(parent: HTMLElement, levels: LevelFeatures[] | undefined, o: CardOptions): void {
	const list = (levels ?? []).filter(l => l && Array.isArray(l.features) && l.features.some(f => f && (f.text?.trim() || !PLACEHOLDER.test(f.name ?? ''))))
		.slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
	if (!list.length) return;
	const ol = parent.createEl('ol', { cls: 'nimble-cmp-levels' });
	for (const l of list) {
		const li = ol.createEl('li', { cls: 'nimble-cmp-level' });
		li.createSpan({ cls: 'nimble-cmp-level-badge', text: String(l.level), attr: { title: `Level ${l.level}`, 'aria-label': `Level ${l.level}` } });
		const feats = li.createDiv({ cls: 'nimble-cmp-level-features' });
		for (const f of l.features) if (f && typeof f === 'object') renderFeature(feats, f, o);
	}
}

/** An option group, collapsed: its intro, then every option. */
function renderOptionGroup(parent: HTMLElement, g: OptionGroup, o: CardOptions): void {
	const options = (g.options ?? []).filter(x => x && typeof x === 'object');
	const body = details(parent, g.name, 'nimble-cmp-group', options.length);
	renderRulesText(body, g.intro, o);
	for (const opt of options) renderFeature(body, opt, o);
}

/** A subclass's flavor, intro, levels and option groups. */
function renderSubclassBody(parent: HTMLElement, s: Subclass, o: CardOptions, withFlavor: boolean): void {
	if (withFlavor) renderRulesText(parent, s.flavor, o);
	renderRulesText(parent, s.intro, o);
	renderLevels(parent, s.levels, o);
	for (const g of s.optionGroups ?? []) renderOptionGroup(parent, g, o);
}

/** "STR ▲ · DEX ▼" */
function savesText(c: ClassEntry): string | undefined {
	if (!c.saves) return undefined;
	return [c.saves.adv ? `${c.saves.adv} ▲` : '', c.saves.dis ? `${c.saves.dis} ▼` : ''].filter(Boolean).join(' · ') || undefined;
}

/**
 * A class's whole page: tagline, facts, flavor, every level, option groups,
 * sidebars, subclasses, spell list and FAQ. Long sections are collapsible.
 */
export function renderClassPage(parent: HTMLElement, c: ClassEntry, o: CardOptions = {}): void {
	const page = parent.createDiv({ cls: 'nimble-cmp-page' });
	if (c.tagline) page.createDiv({ cls: 'nimble-cmp-tagline', text: c.tagline });
	const { fact, done } = factRow(page);
	fact('Key stats', c.keyStats?.join(', '));
	fact('Hit die', c.hitDie ? `d${c.hitDie}` : undefined);
	fact('Starting HP', c.startingHp);
	fact('Saves', savesText(c));
	fact('Armor', c.armor);
	fact('Weapons', c.weapons);
	fact('Complexity', c.complexity);
	if (c.casting?.mana) fact('Mana', c.casting.manaFromLevel && c.casting.manaFromLevel > 1 ? `${c.casting.mana} (from level ${c.casting.manaFromLevel})` : c.casting.mana);
	if (c.casting?.schools?.length) fact('Schools', c.casting.schools.join(', '));
	for (const r of c.resources ?? []) {
		if (!r?.name) continue;
		fact(r.name, [r.max !== undefined && r.max !== '' ? `${r.max}${r.die ? ` × ${r.die}` : ''}` : r.die, r.reset ? `resets: ${r.reset}` : ''].filter(Boolean).join(' · ') || '—');
	}
	if (c.startingGear?.length) fact('Starting gear', c.startingGear.join(', '));
	done();

	const highlights = (c as { highlights?: unknown }).highlights;
	if (Array.isArray(highlights) && highlights.length) {
		const ul = page.createEl('ul', { cls: 'nimble-cmp-list nimble-cmp-highlights' });
		for (const h of highlights) if (typeof h === 'string') appendRichText(ul.createEl('li'), h, o);
	}
	renderRulesText(page, c.flavor, o);
	if (c.casting?.notes) renderLabelled(page, 'Spellcasting', c.casting.notes, o);

	if (c.levels?.length) {
		sectionTitle(page, 'Levels');
		renderLevels(page, c.levels, o);
	}

	const groups = (c.optionGroups ?? []).filter(g => g && typeof g === 'object');
	if (groups.length) {
		sectionTitle(page, groups.length > 1 ? 'Options' : groups[0].name);
		for (const g of groups) renderOptionGroup(page, g, o);
	}

	const sidebars = (c.sidebars ?? []).filter(s => s?.title || s?.text);
	if (sidebars.length) {
		sectionTitle(page, 'Notes');
		for (const s of sidebars) renderRulesText(details(page, s.title || 'Note', 'nimble-cmp-sidebar'), s.text, o);
	}

	const subs = (c.subclasses ?? []).filter(s => s?.name);
	if (subs.length) {
		sectionTitle(page, 'Subclasses');
		for (const s of subs) {
			const d = page.createEl('details', { cls: 'nimble-cmp-details nimble-cmp-subclass' });
			const sum = summaryRow(d, s.name);
			if (s.story) sum.createSpan({ cls: 'nimble-cmp-tag', text: 'Story' });
			if (s.draft && !c.draft) sum.createSpan({ cls: 'nimble-cmp-draft', text: 'Draft' });
			const body = d.createDiv({ cls: 'nimble-cmp-details-body' });
			if (s.flavor) body.createDiv({ cls: 'nimble-cmp-subclass-flavor', text: s.flavor });
			renderSubclassBody(body, s, o, false);
			if (s.page && s.page !== c.page) renderSource(body, { source: s.source ?? c.source, page: s.page });
		}
	}

	const spells = (c.spellList ?? []).filter(n => typeof n === 'string' && n.trim());
	if (spells.length) {
		const body = details(page, 'Spell list', 'nimble-cmp-spells', spells.length);
		const row = body.createDiv({ cls: 'nimble-cmp-spell-list' });
		spells.forEach((n, i) => {
			if (i) row.appendText(', ');
			hitLink(row, n, findHit('spell', n), o);
		});
	}

	const faq = (c.faq ?? []).filter(f => f?.q);
	if (faq.length) {
		const body = details(page, 'FAQ', 'nimble-cmp-faq', faq.length);
		for (const f of faq) {
			const item = body.createDiv({ cls: 'nimble-cmp-faq-item' });
			appendRichText(item.createDiv({ cls: 'nimble-cmp-faq-q' }), f.q, o);
			renderRulesText(item, f.a, o);
		}
	}
}

/**
 * A whole card, in the sheet's language (.ev-sys-nimble): the kind, the name in Vollkorn, the body. A class or
 * subclass page carries its name between the class's scrollwork, as the sheet's class panel does. The detail line
 * only shows when the body has no facts to say the same thing.
 */
export function renderHitCard(parent: HTMLElement, hit: CompendiumHit, o: CardOptions = {}): HTMLElement {
	const page = hit.kind === 'class' || hit.kind === 'subclass';
	const card = parent.createDiv({ cls: `nimble-cmp-card kind-${hit.kind}${page ? ' is-page' : ''}` });
	applyLook(card, 'nimble');
	const head = card.createDiv({ cls: 'nimble-cmp-head' });
	const kind = head.createDiv({ cls: 'nimble-cmp-kind' });
	setIcon(kind.createSpan({ cls: 'nimble-cmp-kind-icon' }), compendiumGlyph(hit));
	kind.createSpan({ text: KIND_LABEL[hit.kind] });
	if (page) renderClassScroll(head, hit.name, 'nimble-cmp-name nimble-cmp-scroll', motifFor(hit));
	else head.createDiv({ cls: 'nimble-cmp-name', text: hit.name });
	const body = card.createDiv({ cls: 'nimble-cmp-body' });
	renderHitBody(body, hit, o);
	// A class's detail line is its tagline, which the page leads with anyway; facts say the rest.
	const tagline = hit.kind === 'class' && (hit.entry as ClassEntry).tagline;
	if (hit.detail && !tagline && !body.querySelector('.nimble-cmp-facts')) head.createDiv({ cls: 'nimble-cmp-detail', text: hit.detail });
	return card;
}

/** The motif a class page wears: the one the class names, else its own; a subclass page wears its class's. */
function motifFor(hit: CompendiumHit): string | undefined {
	if (hit.kind === 'class') return (hit.entry as ClassEntry).motif;
	const cls = hit.className ? (findHit('class', hit.className)?.entry as ClassEntry | undefined) : undefined;
	return cls?.motif ?? hit.className;
}

/** A condition as a card: name and rules text (keywords and dice work as in any card). */
export function renderConditionCard(parent: HTMLElement, condition: ConditionInfo, o: CardOptions = {}): HTMLElement {
	const card = parent.createDiv({ cls: 'nimble-cmp-card kind-condition' });
	applyLook(card, 'nimble');
	const head = card.createDiv({ cls: 'nimble-cmp-head' });
	const kind = head.createDiv({ cls: 'nimble-cmp-kind' });
	setIcon(kind.createSpan({ cls: 'nimble-cmp-kind-icon' }), CONDITION_GLYPH);
	kind.createSpan({ text: 'Condition' });
	head.createDiv({ cls: 'nimble-cmp-name', text: condition.name });
	const body = card.createDiv({ cls: 'nimble-cmp-body' });
	// Its own name isn't a link to itself.
	renderRulesText(body, condition.description, { ...o, keywords: undefined, onKeyword: undefined });
	return card;
}

/** A rule (a rules section, a weapon property, a pack's or your own rule) as a card: its topic over its name, the text, where it's from. Fills `card`. */
export function renderRuleCard(card: HTMLElement, rule: { name: string; text: string; topic: string; source?: string; page?: number | null; draft?: boolean }, o: CardOptions = {}): HTMLElement {
	card.addClass('nimble-cmp-card', 'kind-rule');
	applyLook(card, 'nimble');
	const head = card.createDiv({ cls: 'nimble-cmp-head' });
	const kind = head.createDiv({ cls: 'nimble-cmp-kind' });
	setIcon(kind.createSpan({ cls: 'nimble-cmp-kind-icon' }), evIcon('scales'));
	kind.createSpan({ text: rule.topic });
	head.createDiv({ cls: 'nimble-cmp-name', text: rule.name });
	const body = card.createDiv({ cls: 'nimble-cmp-body' });
	renderRulesText(body, rule.text, o);
	renderSource(body, rule);
	return card;
}

/** A card for a compendium hit or a condition. */
export function renderCard(parent: HTMLElement, target: CardTarget, o: CardOptions = {}): HTMLElement {
	return isHit(target) ? renderHitCard(parent, target, o) : renderConditionCard(parent, target, o);
}

/**
 * Card options wired to the plugin: dice roll (labelled with `label`), condition
 * names open their rules. Pass `onOpenHit` to make class/spell names links.
 */
export function pluginCardOptions(plugin: EmberVaultPlugin, label: string, onOpenHit?: (hit: CompendiumHit) => void): CardOptions {
	return {
		onDice: (el, expr) => {
			el.addClass('is-clickable');
			el.setAttr('role', 'button');
			el.setAttr('title', `Roll ${expr}`);
			el.addEventListener('click', (e) => { e.stopPropagation(); plugin.rollDice(expr, label); });
		},
		keywords: nimble().conditionKeywords(),
		onKeyword: (el, word) => nimble().markWord(el, word),
		onOpenHit,
	};
}

/**
 * A compendium entry (or a condition) in a modal, with an optional action.
 * Links on the card (a feature's class, a class's spells) open in the same
 * modal, with a Back button to return.
 */
export class CompendiumCardModal extends Modal {
	private history: CardTarget[] = [];

	constructor(app: App, private plugin: EmberVaultPlugin, private target: CardTarget, private action?: { label: string; run: () => void }) {
		super(app);
	}

	private artRef: EventRef | null = null;

	onOpen(): void {
		this.modalEl.addClass('nimble-cmp-modal');
		applyLook(this.modalEl, 'nimble');
		this.artRef = this.plugin.events.on('compendium-art-changed', () => this.render());
		this.render();
	}

	/** Show another entry in this modal; Back returns to the current one. */
	go(target: CardTarget): void {
		this.history.push(this.target);
		this.target = target;
		this.render();
	}

	private back(): void {
		const prev = this.history.pop();
		if (!prev) return;
		this.target = prev;
		this.render();
	}

	private render(): void {
		const t = this.target;
		this.contentEl.empty();
		this.modalEl.toggleClass('is-page', isHit(t) && (t.kind === 'class' || t.kind === 'subclass'));
		const prev = this.history[this.history.length - 1];
		if (prev) {
			// A bar above the card (it stays put while a long page scrolls), clear of the close button.
			const nav = this.contentEl.createDiv({ cls: 'nimble-cmp-nav' });
			const b = nav.createEl('button', { cls: 'nimble-cmp-back', attr: { 'aria-label': `Back to ${prev.name}` } });
			setIcon(b.createSpan({ cls: 'nimble-cmp-back-icon' }), evIcon('arrow-left'));
			b.createSpan({ cls: 'nimble-cmp-back-label', text: prev.name });
			b.addEventListener('click', () => this.back());
		}
		const card = renderCard(this.contentEl, t, pluginCardOptions(this.plugin, t.name, (hit) => this.go(hit)));
		// Your art beside the title, changeable right here.
		const head = card.querySelector<HTMLElement>('.nimble-cmp-head');
		if (head) renderArtSlot(this.plugin, head, hitArtKey(t), t.name);
		const a = this.action;
		if (a && !this.history.length) {
			const row = this.contentEl.createDiv({ cls: 'nimble-cmp-actions' });
			const b = row.createEl('button', { cls: 'mod-cta', text: a.label });
			b.onclick = () => { this.close(); a.run(); };
		}
		this.contentEl.scrollTop = 0;
		this.modalEl.scrollTop = 0;
	}

	onClose(): void {
		if (this.artRef) this.plugin.events.offref(this.artRef);
		this.contentEl.empty();
	}
}
