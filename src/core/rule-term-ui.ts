// Clickable rules words: a game's terms (rule-terms.ts) underlined in stat blocks,
// sheets and cards; a click (or Enter) opens the term's card, where the terms in
// its text are clickable too, with Back, and Open in compendium when the game
// has a page for it.

import type EmberVaultPlugin from '../../main';
import { appendRichText, RichTextOptions } from './markdown';
import { openPopover } from './popover';
import { RuleTerm, RuleTerms, ruleTerms } from './rule-terms';
import { wireWikiLinks } from './wiki-links';

/** A note's game and its terms: what marking text needs. */
export interface TermContext {
	plugin: EmberVaultPlugin;
	/** The note the text is shown for (its campaign picks the game and edition). */
	path: string;
	terms: RuleTerms;
}

const NONE = ruleTerms([]);

export function termContext(plugin: EmberVaultPlugin, path: string): TermContext {
	return { plugin, path, terms: plugin.system(path).ruleTerms?.(plugin, path) ?? NONE };
}

/**
 * Text with the game's terms clickable, plus whatever else `opts` asks for
 * (dice). Running text (`prose`, the default) marks only terms meant for it;
 * fields like Senses or Languages mark every term.
 */
export function appendWithTerms(parent: HTMLElement, text: string, ctx: TermContext, opts: RichTextOptions & { prose?: boolean } = {}): void {
	const keywords = ctx.terms.pattern(opts.prose ?? true);
	if (!keywords) { appendRichText(parent, text, opts); return; }
	appendRichText(parent, text, { ...opts, keywords, onKeyword: (el, word) => markTerm(el, ctx, word) });
}

/** A label or value that names a term ("Str", "AC"): marked when the game knows `word`, plain text otherwise. */
export function termSpan(parent: HTMLElement, text: string, ctx: TermContext, word = text, cls?: string): HTMLElement {
	const el = parent.createSpan({ cls, text });
	markTerm(el, ctx, word);
	return el;
}

/** Make `el` open the card for the term named `word` (nothing when the game has no such term). */
export function markTerm(el: HTMLElement, ctx: TermContext, word: string): void {
	const term = ctx.terms.get(word);
	if (!term) return;
	el.addClass('ev-term');
	el.setAttr('role', 'button');
	el.setAttr('tabindex', '0');
	el.setAttr('aria-label', `${term.name}: what it means`);
	const show = (e: Event) => { e.preventDefault(); e.stopPropagation(); showTerm(el, term, ctx); };
	el.addEventListener('click', show);
	el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') show(e); });
}

/** The term's card, beside the word that was clicked. Terms in its text open in the same place, with Back. */
export function showTerm(anchor: HTMLElement, term: RuleTerm, ctx: TermContext, history: RuleTerm[] = []): void {
	const system = ctx.plugin.system(ctx.path);
	openPopover(anchor, (el, close) => {
		el.addClass('ev-term-card');
		const head = el.createDiv({ cls: 'ev-term-head' });
		if (history.length) {
			const back = head.createEl('button', { cls: 'ev-term-back clickable-icon', text: '‹', attr: { 'aria-label': `Back to ${history[history.length - 1].name}` } });
			back.addEventListener('click', (e) => { e.stopPropagation(); showTerm(anchor, history[history.length - 1], ctx, history.slice(0, -1)); });
		}
		head.createDiv({ cls: 'popover-title', text: term.name });
		if (term.tag) head.createSpan({ cls: 'ev-term-tag', text: term.tag });
		const body = el.createDiv({ cls: 'popover-body ev-term-body' });
		const nested: TermContext = { ...ctx, terms: withoutSelf(ctx.terms, term) };
		for (const para of term.text.split('\n')) {
			const p = body.createDiv({ cls: para.startsWith('- ') ? 'ev-term-item' : 'ev-term-para' });
			appendRichText(p, para.replace(/^- /, ''), {
				keywords: nested.terms.pattern(true),
				onKeyword: (span, word) => {
					const next = ctx.terms.get(word);
					if (!next) return;
					span.addClass('ev-term');
					span.setAttr('role', 'button');
					span.setAttr('tabindex', '0');
					const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); showTerm(anchor, next, ctx, [...history, term]); };
					span.addEventListener('click', go);
					span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
				},
			});
		}
		wireWikiLinks(body, ctx.plugin.app, ctx.path);
		const page = system.ruleTermPage?.(ctx.plugin, term, ctx.path);
		if (page) {
			const open = el.createEl('button', { cls: 'ev-term-open', text: 'Open in compendium' });
			open.addEventListener('click', (e) => { e.stopPropagation(); close(); page(); });
		}
	}, { cls: 'ev-term-popover', width: 340 });
}

/** The same terms minus one, so a card doesn't link to itself. */
function withoutSelf(terms: RuleTerms, self: RuleTerm): RuleTerms {
	return ruleTerms(terms.all().filter(t => t.id !== self.id));
}
