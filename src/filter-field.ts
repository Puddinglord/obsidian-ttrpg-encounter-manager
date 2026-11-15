// The search field the compendium and Spotlight share: filters are chips from
// the moment you name one. Accept "type" (or type "type:") and a chip waits for
// its value; everything typed next is that value, with its values suggested,
// and Enter or Tab completes it. Nothing half-typed is ever left in the box.
//
//   [Type: Undead ×] [Type: …|und]      a chip, and one waiting for its value
//   Backspace (empty box)               cancel the waiting chip, or reopen the last chip to edit it
//   Escape                              cancel the waiting chip
//
// The host owns the list (suggestion rows and results) and the arrow keys; it
// calls apply() for a suggestion and commit() for Enter on a typed value.

import { setIcon } from 'obsidian';
import { canonicalKey, facetByKey, finishedFilters, parseFilterToken, quoteValue, Suggestion, tokenAt, tokenize } from './compendium-query';

export interface FilterFieldOptions {
	input: HTMLInputElement;
	/** Where chips go; the input must be inside it (chips are inserted before it). */
	chipsEl: HTMLElement;
	/** The query changed (typing, a chip added or removed). */
	onChange: () => void;
	/** A finished filter the host handles itself (in:, sort:, is:suggested). Return true to swallow it. */
	consume?: (token: string) => boolean;
	/** Is this a whole value for the key? A space after one finishes the waiting chip ("category:weapon "). */
	isValue?: (key: string, value: string) => boolean;
	/** Chips the host draws first (the picker's "Your class"), with how to remove them. */
	extraChips?: () => { label: string; remove: () => void }[];
}

/** "Type", "not Level", "Is". */
function keyLabel(key: string): string {
	const neg = /^[-!]/.test(key);
	const k = key.replace(/^[-!]/, '');
	const label = facetByKey(k)?.label ?? (k === 'is' ? 'Is' : k === 'in' ? 'In' : k === 'sort' ? 'Sort' : k);
	return `${neg ? 'not ' : ''}${label}`;
}

export class FilterField {
	/** Finished chips, as tokens ("type:Goblins", "-role:minion") or plain words. */
	chips: string[] = [];
	/** A filter named but not yet given a value ("type", "-school"). */
	pending: string | null = null;
	private drawn: string | null = null;

	constructor(private o: FilterFieldOptions) {
		o.input.addEventListener('input', () => this.onInput());
	}

	get input(): HTMLInputElement { return this.o.input; }

	/** The whole query: chips, then the filter being typed or the free text. */
	query(): string {
		const t = this.o.input.value.trim();
		const tail = this.pending ? (t ? `${this.pending}:${quoteValue(t)}` : '') : this.o.input.value;
		return [...this.chips, tail].join(' ').trim();
	}

	/** The field as text that set() turns back into the same chips (finished ones end with a space). */
	serialize(): string {
		const t = this.o.input.value;
		const tail = this.pending ? `${this.pending}:${t}` : t;
		return this.chips.length ? `${this.chips.join(' ')} ${tail}` : tail;
	}

	/** The token suggestions complete: "type:und" while a chip waits for its value, else the word at the caret. */
	token(): { text: string; key?: string } | null {
		if (this.pending) return { text: `${this.pending}:${this.o.input.value}`, key: this.pending.replace(/^[-!]/, '') };
		const t = tokenAt(this.o.input.value, this.o.input.selectionStart ?? this.o.input.value.length);
		if (!t) return null;
		const k = t.text.match(/^[-!]?([a-z]+):/i)?.[1];
		return { text: t.text, key: k ? canonicalKey(k) : undefined };
	}

	/**
	 * The query without the token being typed, for counting suggestions. Chips of the
	 * same key are left out too: values of one key are alternatives (type:undead
	 * type:crabmen is either), so a type: chip mustn't narrow type: suggestions to itself.
	 */
	rest(): string {
		const tok = this.token();
		const same = (c: string) => { const f = parseFilterToken(c); return !!tok?.key && !!f && 'key' in f && f.key === tok.key; };
		const chips = this.chips.filter(c => !same(c));
		if (this.pending) return chips.join(' ');
		const v = this.o.input.value;
		const t = tokenAt(v, this.o.input.selectionStart ?? v.length);
		const text = t ? `${v.slice(0, t.start)} ${v.slice(t.end)}` : v;
		return [...chips, text].join(' ').trim();
	}

	/** Set the whole query as if typed: finished filters become chips; a trailing "key:value" waits for more. */
	set(query: string): void {
		this.chips = [];
		this.pending = null;
		this.o.input.value = query;
		// As if typed: filters followed by more become chips; the last one, unfinished, waits for its value.
		this.o.input.setSelectionRange(query.length, query.length);
		this.absorb(false);
		this.startPending();
		this.draw();
	}

	clear(): void {
		this.chips = [];
		this.pending = null;
		this.o.input.value = '';
		this.draw();
	}

	/** Add a finished filter (or the host's own token) as a chip. */
	add(token: string): void {
		if (this.o.consume?.(token)) return;
		if (!this.chips.some(c => c.toLowerCase() === token.toLowerCase())) this.chips.push(token);
	}

	remove(token: string): void {
		this.chips = this.chips.filter(c => c.toLowerCase() !== token.toLowerCase());
	}

	has(token: string): boolean {
		return this.chips.some(c => c.toLowerCase() === token.toLowerCase());
	}

	/** Use a suggestion: a key starts a chip waiting for its value; anything else is a finished chip. */
	apply(s: Suggestion): void {
		const input = this.o.input;
		if (s.kind === 'key') {
			this.wordsToChip(this.caretToken());
			this.pending = s.token.replace(/:$/, '');
			input.value = '';
		} else {
			if (this.pending) { this.pending = null; input.value = ''; } else this.dropCaretToken();
			this.add(s.token);
		}
		this.draw();
		input.focus();
		this.o.onChange();
	}

	/** Enter on a typed value with no suggestion for it ("level:>3"): finish the waiting chip as typed. */
	commit(): boolean {
		if (!this.pending) return false;
		const v = this.o.input.value.trim();
		if (!v) return false;
		const token = `${this.pending}:${quoteValue(v)}`;
		if (!parseFilterToken(token)) return false;
		this.pending = null;
		this.o.input.value = '';
		this.add(token);
		this.draw();
		this.o.onChange();
		return true;
	}

	/** Backspace and Escape. True when it handled the key. */
	key(e: KeyboardEvent): boolean {
		const input = this.o.input;
		const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
		if (e.key === 'Escape' && this.pending) {
			// Cancel the waiting chip and its half-typed value.
			this.pending = null;
			input.value = '';
			this.draw();
			this.o.onChange();
			return true;
		}
		if (e.key !== 'Backspace' || !atStart) return false;
		if (this.pending) {
			if (input.value) return false;
			// Cancel the waiting chip.
			this.pending = null;
		} else if (this.chips.length) {
			// Reopen the last chip: a filter waits for its value again, a plain word goes back to the text.
			const last = this.chips.pop()!;
			const m = last.match(/^([-!]?[a-z]+):(.*)$/i);
			if (m) {
				this.pending = m[1];
				input.value = m[2].replace(/^"|"$/g, '');
			} else input.value = `${last}${input.value ? ` ${input.value}` : ''}`;
			input.setSelectionRange(input.value.length, input.value.length);
		} else {
			const extra = this.o.extraChips?.() ?? [];
			if (!extra.length) return false;
			extra[extra.length - 1].remove();
		}
		this.draw();
		this.o.onChange();
		return true;
	}

	// --------------------------------------------------------------------------

	private onInput(): void {
		// A space after a whole value finishes the waiting chip; a partial one ("fiendish ") keeps going ("tyrants").
		const v = this.o.input.value;
		if (this.pending && /\S\s$/.test(v) && this.o.isValue?.(this.pending, v.trim())) {
			const token = `${this.pending}:${quoteValue(v.trim())}`;
			this.pending = null;
			this.o.input.value = '';
			this.add(token);
		}
		this.absorb(false);
		this.startPending();
		this.draw();
		this.o.onChange();
	}

	/** Finished filters typed or pasted into the text ("type:goblin " with a space after) become chips. */
	private absorb(all: boolean): void {
		if (this.pending) return;
		const input = this.o.input;
		const v = input.value;
		const caret = all ? -1 : (input.selectionStart ?? v.length);
		const done = all ? tokenize(v).filter(t => parseFilterToken(t.text)) : finishedFilters(v, caret);
		if (!done.length) return;
		let text = v;
		const found: string[] = [];
		for (const t of [...done].reverse()) {
			found.unshift(t.text);
			text = text.slice(0, t.start) + text.slice(t.end);
		}
		for (const t of found) this.add(t);
		input.value = text.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
		input.setSelectionRange(input.value.length, input.value.length);
	}

	/** "type:" (or "type:und") at the caret: a chip waiting for its value, the rest of the text becoming a word chip. */
	private startPending(): void {
		if (this.pending) return;
		const t = this.caretToken();
		const m = t?.text.match(/^([-!]?)([a-z]+):(.*)$/i);
		if (!t || !m) return;
		const key = canonicalKey(m[2]);
		if (!key) return;
		this.wordsToChip(t);
		this.pending = `${m[1]}${key}`;
		this.o.input.value = m[3].replace(/^"|"$/g, '');
		this.o.input.setSelectionRange(this.o.input.value.length, this.o.input.value.length);
	}

	private caretToken() {
		const v = this.o.input.value;
		return tokenAt(v, this.o.input.selectionStart ?? v.length);
	}

	/** Words in the box besides the token being turned into a chip are kept as a plain-words chip. */
	private wordsToChip(except: { start: number; end: number } | null): void {
		const v = this.o.input.value;
		const words = (except ? `${v.slice(0, except.start)} ${v.slice(except.end)}` : '').replace(/\s+/g, ' ').trim();
		if (words) this.chips.push(words);
	}

	private dropCaretToken(): void {
		const input = this.o.input;
		const t = this.caretToken();
		if (!t) return;
		input.value = `${input.value.slice(0, t.start)}${input.value.slice(t.end)}`.replace(/\s{2,}/g, ' ').trim();
		input.setSelectionRange(input.value.length, input.value.length);
	}

	/** Chips change only when one is added or removed (only new ones animate); typing never redraws them. */
	draw(): void {
		const extra = this.o.extraChips?.() ?? [];
		const sig = [...extra.map(x => `\u0000${x.label}`), ...this.chips, this.pending ? `\u0001${this.pending}` : ''].join('\u0002');
		if (sig === this.drawn) return;
		const before = new Set((this.drawn ?? '').split('\u0002'));
		const first = this.drawn === null;
		this.drawn = sig;
		const host = this.o.chipsEl;
		host.querySelectorAll(':scope > .nimble-cmpx-chip').forEach(c => c.remove());
		const isNew = (id: string) => !first && !before.has(id);
		const chip = (id: string, cls: string, key: string | null, value: string, remove: () => void) => {
			const el = host.createDiv({ cls: `nimble-cmpx-chip${cls}${isNew(id) ? ' is-new' : ''}` });
			if (key) el.createSpan({ cls: 'nimble-cmpx-chip-key', text: key });
			if (value) el.createSpan({ cls: 'nimble-cmpx-chip-value', text: value });
			const x = el.createEl('button', { cls: 'nimble-cmpx-chip-x', attr: { 'aria-label': 'Remove filter', tabindex: '-1' } });
			setIcon(x, 'x');
			x.addEventListener('mousedown', (e) => e.preventDefault());
			x.addEventListener('click', () => { remove(); this.draw(); this.o.input.focus(); this.o.onChange(); });
			host.insertBefore(el, this.o.input);
		};
		for (const x of extra) chip(`\u0000${x.label}`, '', null, x.label, x.remove);
		for (const token of [...this.chips]) {
			const m = token.match(/^([-!]?)([a-z]+):(.*)$/i);
			if (m) chip(token, m[1] ? ' is-negated' : '', keyLabel(`${m[1]}${m[2]}`), m[3].replace(/^"|"$/g, ''), () => this.remove(token));
			else chip(token, ' is-words', null, `“${token}”`, () => this.remove(token));
		}
		if (this.pending) chip(`\u0001${this.pending}`, ' is-pending', `${keyLabel(this.pending)}:`, '', () => { this.pending = null; });
		const hasChips = this.chips.length + extra.length > 0 || !!this.pending;
		this.o.input.toggleClass('has-chips', hasChips);
		host.toggleClass('has-chips', hasChips);
	}
}
