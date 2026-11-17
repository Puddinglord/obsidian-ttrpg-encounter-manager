// Autocomplete for `5e:` references: type `5e:gob` and pick a monster.

import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { rankByName } from '../../core/spotlight-def';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';

export class Dnd5eRefSuggest extends EditorSuggest<Dnd5eEntry> {
	constructor(app: App, private rt: Dnd5eRuntime) {
		super(app);
		this.limit = 50;
		this.setInstructions([{ command: '↑↓', purpose: 'to navigate' }, { command: '↵', purpose: 'to insert' }]);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const m = editor.getLine(cursor.line).slice(0, cursor.ch).match(/`5e:([^`]*)$/i);
		return m ? { start: { line: cursor.line, ch: cursor.ch - m[1].length }, end: cursor, query: m[1] } : null;
	}

	getSuggestions(ctx: EditorSuggestContext): Dnd5eEntry[] {
		const path = ctx.file?.path;
		const all = this.rt.index.all(this.rt.edition(path), path);
		return rankByName(all, ctx.query, e => [e.name, e.monster.type ?? ''], 50);
	}

	renderSuggestion(e: Dnd5eEntry, el: HTMLElement): void {
		el.addClass('nimble-suggestion');
		el.createDiv({ text: e.name, cls: 'nimble-suggestion-name' });
		el.createDiv({ text: [`CR ${e.monster.cr}`, e.monster.type, e.bundled ? e.monster.source : e.filePath].filter(Boolean).join(' · '), cls: 'nimble-suggestion-note' });
	}

	selectSuggestion(e: Dnd5eEntry): void {
		const ctx = this.context;
		if (!ctx) return;
		const { editor, start, end } = ctx;
		// Consume any partial name typed after the cursor up to the closing backtick.
		const tail = editor.getLine(end.line).slice(end.ch).match(/^[^`\s]*`?/)?.[0] ?? '';
		const closes = tail.endsWith('`');
		editor.replaceRange(`${e.name}\``, start, { line: end.line, ch: end.ch + (closes ? tail.length : 0) });
		editor.setCursor({ line: start.line, ch: start.ch + e.name.length + 1 });
	}
}
