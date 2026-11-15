// Autocomplete for `nimble:` references: monsters, spells, items, features…

import {
	App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile,
} from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';
import { formatLevel, monsterRole } from './rules';
import { compendiumEntries, entryReference } from './compendium-browser';
import { Entry, ENTRY_KIND_LABEL } from './compendium-entries';
import { fuzzyRank, search } from './compendium-query';
import { REF_KINDS } from './compendium-ref';

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

export class InlineRefSuggest extends EditorSuggest<Entry> {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
		this.limit = 50;
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to insert' },
			{ command: 'spell:', purpose: 'only spells (item:, feature:, class:…)' },
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

	/** Monsters and everything else in the compendium, through the compendium's search. `spell:fire` searches spells only. */
	getSuggestions(ctx: EditorSuggestContext): Entry[] {
		const lore = this.plugin.hideStats('', ctx.file?.path);
		const all = compendiumEntries(this.plugin, lore);
		const typed = ctx.query.trim();
		const kinded = typed.match(/^([a-z]+):(.*)$/i);
		const kind = kinded && (REF_KINDS as string[]).includes(kinded[1].toLowerCase()) ? kinded[1].toLowerCase() : null;
		const query = kind ? kinded![2] : typed;
		const only = (e: Entry) => !e.npc && !!entryReference(e) && (!kind || e.kind === kind);
		return search(all, query, { segment: 'all', only, lore, limit: 50 }).entries;
	}

	renderSuggestion(e: Entry, el: HTMLElement): void {
		el.addClass('nimble-suggestion');
		el.createDiv({ text: e.name, cls: 'nimble-suggestion-name' });
		const where = e.monster ? (e.monster.bundled ? e.monster.monster.source || 'Bestiary' : e.monster.filePath) : ENTRY_KIND_LABEL[e.kind];
		el.createDiv({ text: [e.detail, where].filter(Boolean).join(' · '), cls: 'nimble-suggestion-note' });
	}

	selectSuggestion(e: Entry): void {
		const ctx = this.context;
		if (!ctx) return;
		const { editor, start, end } = ctx;
		const ref = (entryReference(e) ?? '').replace(/^`nimble:|`$/g, '');
		if (!ref) return;
		const after = editor.getLine(end.line).slice(end.ch);
		// Consume any partial name typed after the cursor up to the closing backtick.
		const tail = after.match(/^[^`\s]*`?/)?.[0] ?? '';
		const closes = tail.endsWith('`');
		editor.replaceRange(`${ref}\``, start, { line: end.line, ch: end.ch + (closes ? tail.length : 0) });
		editor.setCursor({ line: start.line, ch: start.ch + ref.length + 1 });
	}
}

/** Bestiary entries for a search: names first (prefix, then word, then anywhere), then type and group; typos forgiven when nothing matches outright. */
export function searchMonsters(all: MonsterIndexEntry[], query: string, limit = 60): MonsterIndexEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...all].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
	return fuzzyRank(all, q, e => [e.name, e.monster.group ?? '', e.monster.type ?? ''], limit).map(x => x.item);
}
