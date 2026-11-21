// Autocomplete for `5e:` references: type `5e:gob` and pick a monster.

import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { rankByName } from '../../core/omnisearch-def';
import type { Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';
import { Hit5e, KIND5E, kindFromWord } from './compendium';

/** A monster, or a compendium entry (inserted as `5e:spell:Name`). */
type Pick = { monster: Dnd5eEntry } | { hit: Hit5e };

export class Dnd5eRefSuggest extends EditorSuggest<Pick> {
	constructor(app: App, private rt: Dnd5eRuntime) {
		super(app);
		this.limit = 50;
		this.setInstructions([{ command: '↑↓', purpose: 'to navigate' }, { command: '↵', purpose: 'to insert' }]);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const m = editor.getLine(cursor.line).slice(0, cursor.ch).match(/`5e:([^`]*)$/i);
		return m ? { start: { line: cursor.line, ch: cursor.ch - m[1].length }, end: cursor, query: m[1] } : null;
	}

	/** `5e:gob` searches monsters first, then the compendium; `5e:spell:fire` only spells. */
	getSuggestions(ctx: EditorSuggestContext): Pick[] {
		const path = ctx.file?.path;
		const edition = this.rt.edition(path);
		const typed = /^([a-z]+):(.*)$/i.exec(ctx.query);
		const kind = typed ? kindFromWord(typed[1]) : undefined;
		const query = kind ? typed![2] : ctx.query;
		const hits = this.rt.hits(edition, path).filter(h => !kind || h.kind === kind);
		const fromHits = rankByName(hits, query, h => [h.name], 50).map((hit): Pick => ({ hit }));
		if (kind) return fromHits;
		const monsters = rankByName(this.rt.index.all(edition, path), query, e => [e.name, e.monster.type ?? ''], 50).map((monster): Pick => ({ monster }));
		return [...monsters, ...fromHits].slice(0, 50);
	}

	renderSuggestion(p: Pick, el: HTMLElement): void {
		el.addClass('nimble-suggestion');
		if ('hit' in p) {
			el.createDiv({ text: p.hit.name, cls: 'nimble-suggestion-name' });
			el.createDiv({ text: `${KIND5E[p.hit.kind].label} · ${p.hit.detail}`, cls: 'nimble-suggestion-note' });
			return;
		}
		const e = p.monster;
		el.createDiv({ text: e.name, cls: 'nimble-suggestion-name' });
		el.createDiv({ text: [`CR ${e.monster.cr}`, e.monster.type, e.bundled ? e.monster.source : e.filePath].filter(Boolean).join(' · '), cls: 'nimble-suggestion-note' });
	}

	selectSuggestion(p: Pick): void {
		const ctx = this.context;
		if (!ctx) return;
		const { editor, start, end } = ctx;
		// A monster by its name; anything else with its kind, so it can't be taken for a monster.
		const e = { name: 'hit' in p ? `${p.hit.kind}:${p.hit.name}` : p.monster.name };
		// Consume any partial name typed after the cursor up to the closing backtick.
		const tail = editor.getLine(end.line).slice(end.ch).match(/^[^`\s]*`?/)?.[0] ?? '';
		const closes = tail.endsWith('`');
		editor.replaceRange(`${e.name}\``, start, { line: end.line, ch: end.ch + (closes ? tail.length : 0) });
		editor.setCursor({ line: start.line, ch: start.ch + e.name.length + 1 });
	}
}
