// Spotlight: one box for everything at the table. Search adversaries, NPCs,
// the campaign's notes and conditions, and the player compendium (items,
// spells, classes, features…); type dice to roll them; run the plugin's
// commands. Opened with Cmd/Ctrl+K (rebindable under Hotkeys).
//
//   goblin        Enter: quick look · Cmd/Ctrl+Enter: add to the encounter
//   3 goblin      Enter: add three to the encounter
//   2d6+3         Enter: roll (Cmd/Ctrl+Enter rolls and keeps the box open)
//   > next        commands only
//   battleaxe     Enter: the compendium card
//   school:fire   typed filters: "Search the compendium" opens it with them
//
// The compendium's own dialog does the pickers; this box is for getting anywhere fast.
//
// Spotlight knows no game: the campaign's system gives its own rows (monsters,
// its compendium), adding several, and its search language for typed filters,
// through the contract's `spotlight` member (core/spotlight-source.ts).

import { Modal, Notice, Platform, prepareFuzzySearch, setIcon, SuggestModal, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { KIND_ICON } from '../core/campaign-ui';
import type { NoteRef } from '../core/campaign-model';
import type { NpcInfo } from '../core/campaigns';
import { suggestionIcon } from '../core/compendium/browser';
import { FilterField } from '../core/compendium/filter-field';
import { evIcon } from '../core/icons';
import { applyLook } from '../core/look';
import type { Suggestion } from '../core/compendium/query';
import { chooseSelected, pluginCommands, runCommand, setSuggestSelection } from '../core/internals';
import { portraitOf, renderAvatar } from '../core/npc-card';
import { parseSpotlight, rankByName, rankSpotlight, SpotlightCandidate, SpotlightQuery } from '../core/spotlight-def';
import type { SpotlightFilters, SpotlightRow, SpotlightSource } from '../core/spotlight-source';
import type { ConditionDef } from '../core/types';

type Item =
	| { kind: 'roll'; expression: string }
	| { kind: 'row'; row: SpotlightRow }
	| { kind: 'npc'; npc: NpcInfo }
	| { kind: 'note'; note: NoteRef; where: string }
	| { kind: 'condition'; condition: ConditionDef }
	| { kind: 'command'; id: string; name: string; icon?: string }
	| { kind: 'lookup'; query: string }
	| { kind: 'filter'; s: Suggestion }
	| { kind: 'hint'; icon: string; title: string; detail: string; fill: string };

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';

const QUICK_DICE = ['1d20', '1d4', '1d6', '1d8', '1d10', '1d12', '2d6'];

export class SpotlightModal extends SuggestModal<Item> {
	private q: SpotlightQuery = parseSpotlight('');
	/** What the campaign's game system puts here: its monsters, its compendium, typed filters. */
	private source: SpotlightSource | undefined;
	private diceRow: HTMLElement | null = null;
	/** The compendium's search field (chips for filters) on Spotlight's own box. */
	private field: FilterField | null = null;
	/** Re-running the search ourselves (after the field turned text into a chip). */
	private rerunning = false;
	/** Arrow keys used since the last keystroke: the first ↓ after typing goes to the top filter suggestion. */
	private navigated = false;
	/** Filter suggestion rows at the top of the list right now. */
	private filterRows = 0;
	/** Where the selection started after the last keystroke. */
	private startSel = 0;

	constructor(private plugin: EmberVaultPlugin, private onClosed?: () => void) {
		super(plugin.app);
		this.modalEl.addClass('nimble-spotlight');
		// The rows are the campaign's game (its monsters, its compendium): Spotlight wears its look.
		applyLook(this.modalEl, plugin.system().id);
		this.source = plugin.system().spotlight?.(plugin);
		const player = plugin.playerView();
		this.setPlaceholder(player
			? 'Search creatures, people, places, spells and items, type 2d6+3 to roll, or > for commands'
			: 'Search adversaries, NPCs and notes, type 2d6+3 to roll, or > for commands');
		this.limit = 40;
		this.emptyStateText = 'Nothing matches. Try a monster name, an NPC, 2d6+3, or > and a command.';
		this.setInstructions(player ? [
			{ command: '↵', purpose: 'open or roll' },
			{ command: `${MOD} ↵`, purpose: 'roll and keep open' },
			{ command: '>', purpose: 'commands' },
		] : [
			{ command: '↵', purpose: 'open or roll' },
			{ command: `${MOD} ↵`, purpose: 'add or roll, and keep open' },
			{ command: '3 goblin', purpose: 'add several' },
			{ command: '>', purpose: 'commands' },
		]);
		// Cmd/Ctrl+Enter is the row's second action.
		this.scope.register(['Mod'], 'Enter', (e) => { chooseSelected(this, e); return false; });
		// The key that opens Spotlight also closes it (hotkeys don't reach commands while a dialog is open).
		// The keypress that opened it can arrive here too, so it's ignored for a moment.
		const born = Date.now();
		this.scope.register(['Mod'], 'k', () => { if (Date.now() - born > 150) this.close(); return false; });
	}

	onOpen(): void {
		void super.onOpen();
		const filters = this.source?.filters;
		if (filters) this.chips(filters);
		// Dice one tap away, without typing.
		const row = createDiv({ cls: 'nimble-spotlight-dice' });
		for (const d of QUICK_DICE) {
			const b = row.createEl('button', { cls: 'nimble-spotlight-die', text: d.replace(/^1d/, 'd'), attr: { 'aria-label': `Roll ${d}`, tabindex: '-1' } });
			b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in the search box
			b.addEventListener('click', () => this.roll(d, true));
		}
		(this.inputEl.closest('.prompt-input-container') ?? this.inputEl.parentElement)?.after(row);
		this.diceRow = row;
	}

	/** The system's typed filters, as chips exactly as in the compendium. */
	private chips(filters: SpotlightFilters): void {
		// The chips sit in the box, before the text.
		const chipsEl = createDiv({ cls: 'nimble-cmpx-chips nimble-spot-chips' });
		this.inputEl.before(chipsEl);
		chipsEl.appendChild(this.inputEl);
		this.inputEl.addClass('nimble-cmpx-input');
		this.field = new FilterField({
			input: this.inputEl,
			chipsEl,
			query: filters.query,
			isValue: (key, value) => filters.isValue(key, value),
			onChange: () => {
				this.navigated = false;
				if (this.rerunning) return;
				this.rerunning = true;
				this.inputEl.dispatchEvent(new Event('input'));
				this.rerunning = false;
			},
		});
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Backspace' && this.field?.key(e)) e.preventDefault();
		});
		// Obsidian moves the selection on keydown, before any listener of ours; so on keyup, the first ↓
		// after typing is moved on to the top filter suggestion when it started from a result.
		this.inputEl.addEventListener('keyup', (e) => {
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
			if (e.key === 'ArrowDown' && !this.navigated && this.filterRows && this.startSel >= this.filterRows) setSuggestSelection(this, 0);
			this.navigated = true;
		});
	}

	onClose(): void {
		super.onClose();
		this.onClosed?.();
	}

	// ------------------------------------------------------------------------
	// Results

	getSuggestions(input: string): Item[] {
		const items = this.suggestionsFor(input);
		// Filter suggestions sit at the top. A filter being typed starts on them; a plain word starts on its best result.
		const filters = this.filterRows = items.findIndex(i => i.kind !== 'filter') < 0 ? items.length : items.findIndex(i => i.kind !== 'filter');
		const tok = this.field?.token();
		const startOnFilter = !!this.field?.pending || /:/.test(tok?.text ?? '') || items.slice(0, filters).some(i => i.kind === 'filter' && i.s.kind === 'key');
		this.startSel = filters && !startOnFilter && items.length > filters ? filters : 0;
		if (this.startSel) queueMicrotask(() => setSuggestSelection(this, this.startSel));
		return items;
	}

	/** Filter suggestions for what's being typed, counted against the rest of the query. */
	private filterSuggestions(): Item[] {
		const f = this.field;
		const filters = this.source?.filters;
		const tok = f?.token();
		if (!f || !filters || !tok?.text || (!f.pending && !/:/.test(tok.text) && tok.text.length < 2)) return [];
		if (!f.pending && (/^\d/.test(tok.text) || tok.text.startsWith('>'))) return [];
		return filters.suggest(tok.text, f.rest(), { applied: f.chips, limit: /:/.test(tok.text) ? 8 : 3 }).map(s => ({ kind: 'filter', s }));
	}

	/** "Search the compendium for …", when the game has a compendium to search. */
	private lookup(query: string): Item[] {
		return this.source?.lookup ? [{ kind: 'lookup', query }] : [];
	}

	private suggestionsFor(input: string): Item[] {
		const f = this.field;
		const filters = this.source?.filters;
		// With filters (chips, or one being typed), Spotlight searches the compendium with them: monsters, NPCs, spells, rules…
		if (f && filters && (f.chips.length || f.pending)) {
			const rows = filters.search(f.query(), 30);
			// The lookup carries the chips as chips (and a filter still being typed as unfinished).
			return [...this.filterSuggestions(), ...rows.map(row => ({ kind: 'row' as const, row })), ...this.lookup(f.serialize())];
		}
		const suggested = this.filterSuggestions();
		return [...suggested, ...this.plainSuggestions(input)];
	}

	private plainSuggestions(input: string): Item[] {
		const q = this.q = parseSpotlight(input);
		if (q.roll) return [{ kind: 'roll', expression: q.roll }];
		if (q.commandsOnly) return this.commands(q.text, 40);
		if (!q.text) return this.home();

		const asItems = (rows: SpotlightRow[]): Item[] => rows.map(row => ({ kind: 'row', row }));
		// "3 goblin" is about adding monsters, where the game adds them (not for players).
		const adding = q.counted ? this.source?.adding?.(q) : undefined;
		if (adding) return asItems(adding);

		// The game's own things (monsters, its compendium), typo matches ("zombieq") included.
		const res = this.source?.results(q, input) ?? { rows: [] };
		// Typed filters ("school:fire") are the compendium's language: hand them over.
		const lookup = this.lookup(input.trim());
		if (res.only) return [...asItems(res.rows), ...lookup];

		// One list, ranked by how well each name matches, whatever kind of thing it is (rankSpotlight).
		// Ties go to adversaries, then people, places, rules, the compendium, commands.
		const found: SpotlightCandidate<Item>[] = res.rows.map(row => ({ item: { kind: 'row', row }, names: row.names, others: row.others, order: row.order }));
		for (const npc of this.npcs()) found.push({ item: { kind: 'npc', npc }, names: [npc.name, ...npc.aliases], order: 1 });
		for (const n of this.notes()) found.push({ item: n, names: [n.note.title], others: [n.note.area ? `${n.note.area} ${n.note.title}` : ''], order: 2 });
		const conditions = [...this.plugin.system().conditions(this.plugin.edition()), ...this.plugin.settings.customConditions];
		for (const condition of conditions.filter(c => !c.auto)) found.push({ item: { kind: 'condition', condition }, names: [condition.name], order: 3 });
		for (const c of this.commands(q.text, 8)) if (c.kind === 'command') found.push({ item: c, names: [c.name], order: 5 });
		return [...rankSpotlight(found, q.text), ...lookup];
	}

	/** With nothing typed: what's most useful right now. */
	private home(): Item[] {
		const player = this.plugin.playerView();
		const ids = player
			? ['open-my-character', 'add-item-to-character', 'new-session', 'new-quest', 'new-npc', 'new-location', 'open-bestiary', 'continue-campaign', 'dice-workshop']
			: ['next-round', 'start-combat', 'resume-combat', 'end-combat', 'add-monster', 'build-encounter', 'open-tracker', 'open-bestiary', 'new-scene', 'new-npc', 'edit-party', 'dice-workshop'];
		const byId = new Map(this.commands('', 200).map(c => [c.kind === 'command' ? c.id.replace(/^.*:/, '') : '', c]));
		const hints: Item[] = [
			player
				? { kind: 'hint', icon: evIcon('statblock'), title: 'Look something up', detail: 'Type a name: creatures, people and places from your notes, spells, items, classes and rules.', fill: '' }
				: { kind: 'hint', icon: evIcon('skull'), title: 'Search adversaries', detail: 'Type a name. Enter for a quick look, or "3 goblin" to add three to the encounter.', fill: '' },
			{ kind: 'hint', icon: evIcon('dice'), title: 'Roll dice', detail: 'Type 2d6+3 or d20 and press Enter.', fill: '2d6+3' },
		];
		return [...hints, ...ids.map(id => byId.get(id)).filter((c): c is Item => !!c)];
	}

	private npcs(): NpcInfo[] {
		const active = this.plugin.settings.activeCampaign;
		// The active campaign's NPCs first.
		return [...this.plugin.campaigns.npcs].sort((a, b) => Number(b.campaign === active) - Number(a.campaign === active) || a.name.localeCompare(b.name));
	}

	/** Scenes, maps, locations, quests and other notes of the active campaign (NPCs have their own rows). */
	private notes(): Extract<Item, { kind: 'note' }>[] {
		const c = this.plugin.campaigns.active;
		if (!c) return [];
		const npc = new Set(this.plugin.campaigns.npcs.map(n => n.path));
		const out: Extract<Item, { kind: 'note' }>[] = [{ kind: 'note', note: c.home, where: 'Campaign' }];
		for (const ch of c.chapters) {
			out.push({ kind: 'note', note: ch.home, where: 'Chapter' });
			for (const n of [...ch.scenes, ...ch.maps]) out.push({ kind: 'note', note: n, where: ch.name });
		}
		for (const s of c.sections) for (const n of s.notes) out.push({ kind: 'note', note: n, where: s.name });
		for (const n of c.loose) out.push({ kind: 'note', note: n, where: c.name });
		return out.filter(x => !npc.has(x.note.path));
	}

	/** The plugin's commands that can run right now. Editor-only ones are left to the editor. */
	private commands(query: string, limit: number, allowLoose = true): Item[] {
		const list = pluginCommands(this.app, this.plugin.manifest.id)
			.filter(c => !c.id.endsWith(':spotlight') && !c.editorCallback && !c.editorCheckCallback)
			.filter(c => { try { return !c.checkCallback || c.checkCallback(true) !== false; } catch { return false; } })
			.map(c => ({ kind: 'command' as const, id: c.id, name: c.name.replace(/^[^:]+:\s*/, ''), icon: c.icon }));
		if (!query) return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
		const direct = rankByName(list, query, c => [c.name], limit);
		// Loose matches only when nothing matches outright ("nxt rnd"), so "> new" lists the New… commands and nothing else.
		if (direct.length || !allowLoose) return direct;
		const fuzzy = prepareFuzzySearch(query);
		const loose = list.filter(c => !direct.includes(c)).map(c => ({ c, r: fuzzy(c.name) })).filter(x => !!x.r)
			.sort((a, b) => (b.r?.score ?? 0) - (a.r?.score ?? 0)).map(x => x.c);
		return [...direct, ...loose].slice(0, limit);
	}

	// ------------------------------------------------------------------------
	// Rows

	renderSuggestion(i: Item, el: HTMLElement): void {
		el.addClass('nimble-spot-row', `spot-${i.kind === 'row' ? i.row.look.kind : i.kind}`);
		const icon = el.createSpan({ cls: 'nimble-spot-icon' });
		const text = el.createDiv({ cls: 'nimble-spot-text' });
		const name = text.createDiv({ cls: 'nimble-spot-name' });
		const meta = (t: string) => { if (t) text.createDiv({ cls: 'nimble-spot-meta', text: t }); };
		const tag = (t: string) => el.createSpan({ cls: 'nimble-spot-tag', text: t });
		switch (i.kind) {
			case 'roll':
				setIcon(icon, evIcon('dice'));
				name.setText(`Roll ${i.expression}`);
				meta(`Enter rolls it. ${MOD}+Enter rolls and keeps this open.`);
				tag('Dice');
				break;
			case 'row': {
				const l = i.row.look;
				if (l.iconClass) icon.addClass(...l.iconClass);
				if (l.badge !== undefined) icon.setText(l.badge);
				else if (l.icon) setIcon(icon, l.icon);
				name.setText(l.title);
				if (l.draft) name.createSpan({ cls: 'nimble-cmp-draft', text: 'Draft' });
				meta(l.meta ?? '');
				if (l.tag) tag(l.tag);
				break;
			}
			case 'npc': {
				const portrait = portraitOf(this.app, i.npc.path);
				if (portrait) renderAvatar(icon, portrait, 'nimble-spot-avatar');
				else setIcon(icon, evIcon('user'));
				name.setText(i.npc.name);
				meta([i.npc.role, i.npc.aliases.length ? `aka ${i.npc.aliases.join(', ')}` : ''].filter(Boolean).join(' · '));
				tag('NPC');
				break;
			}
			case 'note':
				setIcon(icon, KIND_ICON[i.note.kind] ?? 'file-text');
				name.setText(i.note.area && !i.note.title.startsWith(i.note.area) ? `${i.note.area} ${i.note.title}` : i.note.title);
				meta(i.where);
				tag(i.note.kind === 'note' ? 'Note' : i.note.kind[0].toUpperCase() + i.note.kind.slice(1));
				break;
			case 'condition':
				setIcon(icon, evIcon('condition'));
				name.setText(i.condition.name);
				text.createDiv({ cls: 'nimble-spot-meta is-long', text: i.condition.description });
				tag('Condition');
				break;
			case 'command':
				setIcon(icon, i.icon || 'terminal');
				name.setText(i.name);
				tag('Command');
				break;
			case 'filter': {
				el.addClass('is-filter');
				setIcon(icon, suggestionIcon(i.s));
				const m = i.s.label.match(/^([-!]?[a-z]+:)(.*)$/i);
				if (m) { name.createSpan({ cls: 'nimble-cmpx-token-key', text: m[1] }); name.createSpan({ text: m[2] }); } else name.setText(i.s.label);
				meta(i.s.detail);
				tag(i.s.kind === 'key' ? 'Filter by' : 'Filter');
				break;
			}
			case 'lookup':
				setIcon(icon, evIcon('books'));
				name.setText(`Search the compendium for “${i.query.trim()}”`);
				meta('Every monster, spell, item, feature and rule, with filters and sorting');
				tag('Compendium');
				break;
			default:
				setIcon(icon, i.icon);
				name.setText(i.title);
				meta(i.detail);
		}
	}

	// ------------------------------------------------------------------------
	// Actions

	/** Choosing a hint or a kept-open roll shouldn't close the box. */
	selectSuggestion(i: Item, evt: MouseEvent | KeyboardEvent): void {
		const mod = evt.metaKey || evt.ctrlKey;
		// A filter becomes a chip (Spotlight stays open); Enter on a value typed for a waiting chip finishes it as typed.
		if (i.kind === 'filter') { this.field?.apply(i.s); return; }
		if (this.field?.pending && i.kind !== 'lookup') { this.field.commit(); return; }
		if (i.kind === 'hint') { this.fill(i.fill); return; }
		if (i.kind === 'roll' && mod) { this.roll(i.expression, true); return; }
		// The row's second action, keeping Spotlight open (Nimble: add and keep searching, to build a fight in one go).
		if (i.kind === 'row' && mod && i.row.alt) { i.row.alt(); this.fill(''); return; }
		super.selectSuggestion(i, evt);
	}

	onChooseSuggestion(i: Item, evt: MouseEvent | KeyboardEvent): void {
		const mod = evt.metaKey || evt.ctrlKey;
		switch (i.kind) {
			case 'roll': this.roll(i.expression, false); break;
			case 'row': { const m = i.row.open(); if (m) this.escapeBack(m); break; }
			case 'npc': {
				const f = this.app.vault.getAbstractFileByPath(i.npc.path);
				if (!(f instanceof TFile)) break;
				if (mod) void this.plugin.campaigns.open(f.path, true);
				else { const m = this.plugin.system(f.path).quickLook(this.plugin, { kind: 'note', file: f, subtitle: i.npc.role }); if (m) this.escapeBack(m); }
				break;
			}
			case 'note': void this.plugin.campaigns.open(i.note.path, mod); break;
			case 'condition': new Notice(`${i.condition.name}: ${i.condition.description}`, 12000); break;
			case 'lookup': { const m = this.source?.lookup?.(i.query); if (m) this.escapeBack(m); break; }
			case 'command':
				if (!runCommand(this.app, i.id)) new Notice(`Couldn't run "${i.name}"`);
				break;
			default: break;
		}
	}

	/** Type `text` into the box as if typed (coming back to Spotlight). */
	setQuery(text: string): void {
		if (this.field) this.field.set(text);
		else this.inputEl.value = text;
		this.inputEl.dispatchEvent(new Event('input'));
		this.inputEl.select();
	}

	/**
	 * Something opened from here (a card, a quick look, the compendium):
	 * closing it with Escape comes back to Spotlight with the same search, so
	 * you can look at the next result. Closing it any other way doesn't.
	 */
	private escapeBack(modal: Modal): void {
		// Chips and all: finished filters come back as chips (a trailing space finishes the last one).
		const query = this.field ? this.field.serialize() : this.inputEl.value;
		const win = activeWindow;
		// Obsidian closes a modal on Escape in its own key handler, which runs before any listener of ours.
		// So note the Escape when it reaches us (just after), and decide once the close has finished.
		let escaped = false;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			escaped = true;
			// An Escape that only closed a popover inside the modal doesn't count for long.
			window.setTimeout(() => { if (modal.containerEl.isConnected) escaped = false; }, 0);
		};
		win.addEventListener('keydown', onKey, true);
		const close = modal.onClose.bind(modal);
		modal.onClose = () => {
			close();
			window.setTimeout(() => {
				win.removeEventListener('keydown', onKey, true);
				if (escaped) this.plugin.openSpotlight(query);
			}, 0);
		};
	}

	private fill(text: string): void {
		this.inputEl.value = text;
		this.inputEl.dispatchEvent(new Event('input'));
		this.inputEl.focus();
		this.inputEl.select();
	}

	/** Roll through the plugin, so the result goes to the notice, the roll log and the 3D dice like any other roll. */
	private roll(expression: string, stay: boolean): void {
		const r = this.plugin.rollDice(expression, '');
		if (!stay || !r) return;
		// Kept open: show the last result where the eyes already are.
		let out = this.diceRow?.querySelector<HTMLElement>('.nimble-spotlight-result');
		if (!out && this.diceRow) out = this.diceRow.createSpan({ cls: 'nimble-spotlight-result', attr: { 'aria-live': 'polite' } });
		out?.setText(`${r.expression} → ${r.total}${r.detail && r.detail !== String(r.total) ? `  (${r.detail})` : ''}`);
	}}
