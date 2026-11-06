// Autocomplete for `nimble:` references and a fuzzy "Add monster" picker.

import {
	App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
	SuggestModal, TFile, prepareFuzzySearch, setIcon,
} from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry } from './types';
import { formatLevel, monsterRole } from './rules';
import { parseCountQuery } from './tracker-text';
import { isHero as isHeroCreature } from './encounters';

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

/** Bestiary entries for a search: name matches first (prefix before substring), then fuzzy ones. */
export function searchMonsters(all: MonsterIndexEntry[], query: string, limit = 60): MonsterIndexEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...all].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
	const direct = all.filter(e => e.name.toLowerCase().includes(q))
		.sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || a.name.length - b.name.length);
	if (direct.length >= limit) return direct.slice(0, limit);
	const seen = new Set(direct);
	const fuzzy = prepareFuzzySearch(q);
	const loose = all.filter(e => !seen.has(e))
		.map(e => ({ e, r: fuzzy(`${e.name} ${e.monster.type ?? ''} ${e.monster.group ?? ''}`) }))
		.filter((x): x is { e: MonsterIndexEntry; r: NonNullable<typeof x.r> } => !!x.r)
		.sort((a, b) => b.r.score - a.r.score)
		.map(x => x.e);
	return [...direct, ...loose].slice(0, limit);
}

type RoleFilter = 'all' | 'regular' | 'minion' | 'legendary' | 'mine';

/**
 * The tracker's Add monster dialog: search the bestiary, filter by role, and
 * add from any row with its own quantity. Row buttons keep the dialog open so
 * a whole fight can be built in one go; Enter adds the selected row and closes.
 */
export class AddMonsterModal extends SuggestModal<MonsterIndexEntry> {
	private count = 1;
	private counts = new Map<string, number>();
	private role: RoleFilter = 'all';

	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
		this.modalEl.addClass('nimble-add-monster-modal');
		this.setPlaceholder('Search the bestiary');
		this.limit = 60;
		this.setInstructions([
			{ command: '↑↓', purpose: 'move' },
			{ command: '↵', purpose: 'add and close' },
			{ command: '3 goblin', purpose: 'add several' },
		]);
		this.emptyStateText = plugin.index.size
			? 'No matching monsters.'
			: 'No monsters found. Turn on the bundled bestiary in settings, or add a ```nimble code block to a note.';
		this.renderFilters();
	}

	private key(e: MonsterIndexEntry): string { return `${e.filePath}|${e.name}`; }

	private renderFilters(): void {
		const bar = createDiv({ cls: 'nimble-add-filters' });
		const options: [RoleFilter, string][] = [['all', 'All'], ['regular', 'Regular'], ['minion', 'Minion'], ['legendary', 'Legendary'], ['mine', 'My monsters']];
		for (const [role, label] of options) {
			const b = bar.createEl('button', { cls: `nimble-add-filter${role === this.role ? ' is-active' : ''}`, text: label });
			b.addEventListener('mousedown', (e) => e.preventDefault()); // keep typing in the search box
			b.addEventListener('click', () => {
				this.role = role;
				bar.querySelectorAll('.nimble-add-filter').forEach(x => x.toggleClass('is-active', x === b));
				this.inputEl.dispatchEvent(new Event('input'));
				this.inputEl.focus();
			});
		}
		this.inputEl.parentElement?.after(bar);
	}

	private inFight(e: MonsterIndexEntry): number {
		const enc = this.plugin.encounters.active;
		return (enc?.creatures ?? []).filter(c => !isHeroCreature(c) && c.monster.name === e.monster.name)
			.reduce((n, c) => n + (c.count ?? 1), 0);
	}

	getSuggestions(input: string): MonsterIndexEntry[] {
		const { count, query } = parseCountQuery(input);
		this.count = count;
		let all = this.plugin.index.all();
		if (this.role === 'mine') all = all.filter(e => !e.bundled);
		else if (this.role !== 'all') all = all.filter(e => monsterRole(e.monster) === this.role);
		return searchMonsters(all, query, this.limit);
	}

	renderSuggestion(entry: MonsterIndexEntry, el: HTMLElement): void {
		const m = entry.monster;
		const role = monsterRole(m);
		el.addClass('nimble-add-row');
		el.createSpan({ cls: `nimble-add-level role-${role}`, text: formatLevel(m.level) || '–' });
		const text = el.createDiv({ cls: 'nimble-add-text' });
		const name = text.createDiv({ cls: 'nimble-add-name' });
		name.createSpan({ text: entry.name });
		const here = this.inFight(entry);
		const badge = name.createSpan({ cls: 'nimble-add-here', text: here ? `${here} in fight` : '' });
		text.createDiv({ cls: 'nimble-add-meta', text: `${describe(entry)}${entry.bundled && m.source ? ` · ${m.source}` : !entry.bundled ? ' · your note' : ''}` });

		// Quantity: − n +, starting from the count typed in the search ("3 goblin").
		const k = this.key(entry);
		const n = () => this.counts.get(k) ?? this.count;
		const qty = el.createDiv({ cls: 'nimble-add-qty' });
		const stop = (b: HTMLElement) => {
			b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
			b.addEventListener('mousemove', (e) => e.stopPropagation());
		};
		const minus = qty.createEl('button', { cls: 'nimble-add-step', attr: { 'aria-label': 'One fewer' } });
		setIcon(minus, 'minus');
		const val = qty.createSpan({ cls: 'nimble-add-n', text: String(n()) });
		const plus = qty.createEl('button', { cls: 'nimble-add-step', attr: { 'aria-label': 'One more' } });
		setIcon(plus, 'plus');
		const set = (v: number) => { this.counts.set(k, Math.max(1, Math.min(50, v))); val.setText(String(n())); add.lastElementChild?.setText(`Add ${n()}`); };
		for (const b of [minus, plus]) stop(b);
		minus.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); set(n() - 1); });
		plus.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); set(n() + 1); });

		const add = el.createEl('button', { cls: 'nimble-add-btn mod-cta' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: n() > 1 ? `Add ${n()}` : 'Add' });
		stop(add);
		add.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.plugin.addToEncounter(entry.monster, entry.filePath || undefined, n()).then(() => {
				const total = this.inFight(entry);
				badge.setText(total ? `${total} in fight` : '');
				el.addClass('is-added');
				add.lastElementChild?.setText('Added');
				window.setTimeout(() => { el.removeClass('is-added'); add.lastElementChild?.setText(n() > 1 ? `Add ${n()}` : 'Add'); }, 1100);
			});
		});
	}

	onChooseSuggestion(entry: MonsterIndexEntry, evt: MouseEvent | KeyboardEvent): void {
		const n = this.counts.get(this.key(entry)) ?? (evt.shiftKey && this.count === 1 ? 2 : this.count);
		void this.plugin.addToEncounter(entry.monster, entry.filePath || undefined, n);
	}
}
