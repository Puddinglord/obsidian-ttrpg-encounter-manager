// Autocomplete for `nimble:` references and a fuzzy "Add monster" picker.

import {
	App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
	FuzzySuggestModal, FuzzyMatch, TFile, prepareFuzzySearch,
} from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';
import { formatLevel, monsterRole } from './rules';

export function describeMonster(entry: MonsterIndexEntry): string {
	const m = entry.monster;
	const parts: string[] = [];
	const lvl = formatLevel(m.level);
	if (lvl) parts.push(`Lvl ${lvl}`);
	const role = monsterRole(m);
	if (role === 'legendary') parts.push(m.roleLabel || 'Legendary');
	if (role === 'minion') parts.push('Minion');
	if (m.type) parts.push(m.type);
	if (role !== 'minion') parts.push(m.hpPerHero ? `${m.hpPerHero} HP/hero` : `${m.hp} HP`);
	if (m.armor !== 'none') parts.push(m.armor === 'medium' ? 'Armor M' : 'Armor H');
	return parts.join(' · ');
}
const describe = describeMonster;

export class InlineRefSuggest extends EditorSuggest<MonsterIndexEntry> {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to insert monster' },
		]);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = before.match(/`nimble:([^`]*)$/);
		if (!m) return null;
		return {
			start: { line: cursor.line, ch: cursor.ch - m[1].length },
			end: cursor,
			query: m[1],
		};
	}

	getSuggestions(ctx: EditorSuggestContext): MonsterIndexEntry[] {
		const query = ctx.query.trim();
		const all = this.plugin.index.all();
		if (!query) return all.slice(0, 50);
		const search = prepareFuzzySearch(query);
		const q = query.toLowerCase();
		// Prefix matches first, then substring matches, then fuzzy matches.
		const tier = (name: string) => {
			const n = name.toLowerCase();
			if (n.startsWith(q)) return 0;
			if (n.includes(q)) return 1;
			return 2;
		};
		return all
			.map(entry => ({ entry, match: search(entry.name), tier: tier(entry.name) }))
			.filter(x => x.match)
			.sort((a, b) => a.tier - b.tier || b.match!.score - a.match!.score)
			.slice(0, 50)
			.map(x => x.entry);
	}

	renderSuggestion(entry: MonsterIndexEntry, el: HTMLElement): void {
		el.addClass('nimble-suggestion');
		el.createDiv({ text: entry.name, cls: 'nimble-suggestion-name' });
		el.createDiv({ text: `${describe(entry)} · ${entry.bundled ? entry.monster.source || 'Bestiary' : entry.filePath}`, cls: 'nimble-suggestion-note' });
	}

	selectSuggestion(entry: MonsterIndexEntry): void {
		const ctx = this.context;
		if (!ctx) return;
		const { editor, start, end } = ctx;
		const after = editor.getLine(end.line).slice(end.ch);
		// Consume any partial name typed after the cursor up to the closing backtick.
		const tail = after.match(/^[^`\s]*`?/)?.[0] ?? '';
		const closes = tail.endsWith('`');
		editor.replaceRange(`${entry.name}\``, start, { line: end.line, ch: end.ch + (closes ? tail.length : 0) });
		editor.setCursor({ line: start.line, ch: start.ch + entry.name.length + 1 });
	}
}

export class AddMonsterModal extends FuzzySuggestModal<MonsterIndexEntry> {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
		this.setPlaceholder('Add a monster to the encounter…');
		this.setInstructions([
			{ command: '↵', purpose: 'add one' },
			{ command: 'shift ↵', purpose: 'add two' },
			{ command: 'esc', purpose: 'close' },
		]);
		this.emptyStateText = plugin.index.size
			? 'No matching monsters.'
			: 'No monsters found. Turn on the bundled bestiary in settings, or add a ```nimble code block to a note.';
	}

	getItems(): MonsterIndexEntry[] {
		return this.plugin.index.all();
	}

	getItemText(entry: MonsterIndexEntry): string {
		return entry.name;
	}

	renderSuggestion(match: FuzzyMatch<MonsterIndexEntry>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		el.addClass('nimble-suggestion');
		el.createDiv({ text: `${describe(match.item)}${match.item.bundled ? ` · ${match.item.monster.source ?? ''}` : ''}`, cls: 'nimble-suggestion-note' });
	}

	onChooseItem(entry: MonsterIndexEntry, evt: MouseEvent | KeyboardEvent): void {
		void this.plugin.addToEncounter(entry.monster, entry.filePath || undefined, evt.shiftKey ? 2 : 1);
	}
}
