// Minimal, safe inline markdown for stat block text.
//
// Builds DOM nodes directly instead of producing an HTML string, so text from a
// note can never inject markup or script. Supports ***bold italic***, **bold**,
// *italic* (and the underscore forms), [[wikilinks|with aliases]] and,
// optionally, dice expressions like 2d6+3.

export interface RichTextOptions {
	/** Called for every dice expression found; return nothing. */
	onDice?: (el: HTMLElement, expression: string) => void;
	/** Whole words to mark up (e.g. condition names). Must not use the g flag. */
	keywords?: RegExp;
	/** Called for every keyword found. */
	onKeyword?: (el: HTMLElement, word: string) => void;
}

interface Rule {
	re: RegExp;
	/** Group 1 is leading context standing in for a lookbehind (see execWithLead). */
	lead?: boolean;
	/** Appends what the match renders as to `parent`. */
	build: (m: RegExpExecArray, parent: HTMLElement, opts: RichTextOptions) => void;
}

// No lookbehinds: iOS before 16.4 can't parse them. Patterns that need one
// capture the preceding character (or the start of the text) as group 1
// instead; run them through execWithLead.

/** Dice like 2d6+3. Group 1 is leading context: use execWithLead. */
export const DICE_RE = /(^|[^\w.])(\d{0,3})d(\d{1,3})((?:\s*[+\-−]\s*\d+(?!\d|\s*d\d))*)(?![\w])/i;

/**
 * exec() for a pattern whose group 1 is leading context in place of a
 * lookbehind: returns the match without that context (index moved past it)
 * and the remaining groups shifted down by one, as the lookbehind would have.
 */
export function execWithLead(re: RegExp, text: string): RegExpExecArray | null {
	const m = re.exec(text);
	if (!m) return null;
	const lead = m[1] ?? '';
	const out = m.slice(1) as RegExpExecArray;
	out[0] = m[0].slice(lead.length);
	out.index = m.index + lead.length;
	out.input = m.input;
	return out;
}

function emphasis(tag: 'strong' | 'em' | 'both') {
	return (m: RegExpExecArray, parent: HTMLElement, opts: RichTextOptions): void => {
		const inner = m[1];
		const el = tag === 'both' ? parent.createEl('strong').createEl('em') : parent.createEl(tag);
		appendRichText(el, inner, opts);
	};
}

const RULES: Rule[] = [
	{
		re: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/,
		build: (m, parent) => {
			parent.createEl('a', {
				cls: 'nimble-wikilink internal-link',
				text: (m[2] ?? m[1]).trim(),
				attr: { 'data-link': m[1].trim() },
			});
		},
	},
	{ re: /\*\*\*(.+?)\*\*\*/, build: emphasis('both') },
	{ re: /\*\*(.+?)\*\*/, build: emphasis('strong') },
	{ re: /\*(?!\s)(.+?)\*/, build: emphasis('em') },
	{ re: /(^|\W)___(.+?)___(?!\w)/, lead: true, build: emphasis('both') },
	{ re: /(^|\W)__(.+?)__(?!\w)/, lead: true, build: emphasis('strong') },
	{ re: /(^|\W)_(?!\s)(.+?)_(?!\w)/, lead: true, build: emphasis('em') },
];

const DICE_RULE: Rule = {
	re: DICE_RE,
	lead: true,
	build: (m, parent, opts) => {
		const expression = m[0].replace(/\s+/g, '').replace('−', '-');
		const span = parent.createSpan({ cls: 'nimble-dice', text: m[0], attr: { 'data-dice': expression } });
		opts.onDice?.(span, expression);
	},
};

function keywordRule(re: RegExp): Rule {
	return {
		re,
		lead: true,
		build: (m, parent, opts) => {
			const span = parent.createSpan({ cls: 'nimble-keyword', text: m[0] });
			opts.onKeyword?.(span, m[0]);
		},
	};
}

/** Builds a whole-word, case-sensitive matcher for a list of terms (longest first). Group 1 is leading context. */
export function keywordPattern(words: string[]): RegExp | undefined {
	const list = [...new Set(words.filter(Boolean))].sort((a, b) => b.length - a.length)
		.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return list.length ? new RegExp(`(^|[^\\w-])(?:${list.join('|')})(?![\\w-])`) : undefined;
}

export function appendRichText(parent: HTMLElement, text: string, opts: RichTextOptions = {}): void {
	const doc = parent.ownerDocument;
	const rules = [...RULES];
	if (opts.onDice) rules.push(DICE_RULE);
	if (opts.keywords && opts.onKeyword) rules.push(keywordRule(opts.keywords));
	let rest = text;

	while (rest.length > 0) {
		let best: { m: RegExpExecArray; rule: Rule } | null = null;
		for (const rule of rules) {
			const m = rule.lead ? execWithLead(rule.re, rest) : rule.re.exec(rest);
			if (m && (!best || m.index < best.m.index)) best = { m, rule };
		}
		if (!best) {
			parent.appendChild(doc.createTextNode(rest));
			return;
		}
		if (best.m.index > 0) parent.appendChild(doc.createTextNode(rest.slice(0, best.m.index)));
		best.rule.build(best.m, parent, opts);
		rest = rest.slice(best.m.index + best.m[0].length);
	}
}

// ----------------------------------------------------------------------------
// Note structure, for the "/" commands. Pure, so it can be unit-tested.

/**
 * True when line number `line` is inside a fenced code block. Scans from the
 * top of the note: a fence closes only on the same character, at least as long
 * as the one that opened it (so ```` can wrap ```), and an unclosed fence runs
 * to the end.
 */
export function insideCodeFence(getLine: (i: number) => string, line: number): boolean {
	let fence: { char: string; len: number } | null = null;
	for (let i = 0; i < line; i++) {
		const text = getLine(i);
		if (!fence) {
			const open = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(text);
			// A backtick fence's info string can't contain backticks: ```js``` is inline code.
			if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = { char: open[1][0], len: open[1].length };
		} else {
			const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(text);
			if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
		}
	}
	return !!fence;
}

/**
 * What a block inserted on this line must start each of its lines with to stay
 * inside the callout, quote, list item or indentation it was typed in.
 * `before` is the line up to the insertion point. `fresh` is true when nothing
 * but that structure comes before it, so the block can start right there.
 */
export function blockPrefix(before: string): { prefix: string; fresh: boolean } {
	const m = /^((?:[ \t]*>)*[ \t]*)((?:[-*+]|\d+[.)])[ \t]+)?/.exec(before)!;
	// Under a list item, lines continue at the indentation of the item's text.
	const prefix = m[1] + ' '.repeat(m[2]?.length ?? 0);
	return { prefix, fresh: m[0].length === before.length };
}

/** A block's text placed on (or, after other text, below) a line that starts with `before`. */
export function placeBlock(before: string, text: string): string {
	const { prefix, fresh } = blockPrefix(before);
	const body = text.split('\n').join(`\n${prefix}`);
	return `${fresh ? '' : `\n${prefix}`}${body}\n${prefix}`;
}

/**
 * The slash command being typed at the end of `before` ("map Assets/hideout"),
 * or null. A command starts with "/" at the start of the line or after
 * whitespace, so the slashes in a path or a URL don't start one. The argument
 * may contain "/"; of several candidates the last one `known` accepts wins.
 */
export function slashQuery(before: string, known: (cmd: string, hasArg: boolean) => boolean): string | null {
	const re = /(?:^|\s)\/([a-z-]*)(?= |$)/gi;
	let query: string | null = null;
	for (let m = re.exec(before); m; m = re.exec(before)) {
		const q = before.slice(m.index + m[0].indexOf('/') + 1);
		if (known(m[1].toLowerCase(), q.length > m[1].length)) query = q;
	}
	return query;
}
