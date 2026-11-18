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
// The compendium's own dialog (compendium-modal.ts) does the pickers; this box
// is for getting anywhere fast.

import { Modal, Notice, Platform, prepareFuzzySearch, setIcon, SuggestModal, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../main';
import { KIND_ICON } from '../core/campaign-ui';
import type { NoteRef } from '../core/campaign-model';
import type { NpcInfo } from '../core/campaigns';
import { chooseSelected, pluginCommands, runCommand, setSuggestSelection } from '../core/internals';
import { portraitOf, renderAvatar } from '../core/npc-card';
import { openRecord } from '../systems/nimble/record-modal';
import { formatLevel, monsterRole } from '../systems/nimble/rules';
import { parseSpotlight, rankByName, SpotlightQuery } from '../core/spotlight-def';
import { CompendiumHit, KIND_LABEL } from '../systems/nimble/compendium';
import { compendiumEntries } from '../systems/nimble/compendium-browser';
import { fuzzyRank, isCompleteValue, nameMatch, search as searchCompendium, suggest, Suggestion } from '../systems/nimble/compendium-query';
import { openCompendiumSearch, openEntry } from '../systems/nimble/compendium-modal';
import { Entry, ENTRY_KIND_LABEL } from '../systems/nimble/compendium-entries';
import { FilterField } from '../systems/nimble/filter-field';
import { CompendiumCardModal, compendiumIcon } from '../systems/nimble/compendium-card';
import { describeMonster } from '../systems/nimble/suggest';
import type { MonsterIndexEntry, NimbleCondition } from '../systems/nimble/types';
import { dnd5e } from '../systems/dnd5e/runtime';
import type { Dnd5eEntry } from '../systems/dnd5e/types';
import { Hit5e, KIND5E } from '../systems/dnd5e/compendium';
import { nimble } from '../systems/nimble/runtime';

type Item =
	| { kind: 'roll'; expression: string }
	| { kind: 'monster'; entry: MonsterIndexEntry; count: number; add: boolean }
	| { kind: 'dnd5e'; entry: Dnd5eEntry }
	| { kind: 'dnd5eHit'; hit: Hit5e }
	| { kind: 'npc'; npc: NpcInfo }
	| { kind: 'note'; note: NoteRef; where: string }
	| { kind: 'condition'; condition: NimbleCondition }
	| { kind: 'command'; id: string; name: string; icon?: string }
	| { kind: 'compendium'; hit: CompendiumHit }
	| { kind: 'lookup'; query: string }
	| { kind: 'filter'; s: Suggestion }
	| { kind: 'entry'; entry: Entry }
	| { kind: 'hint'; icon: string; title: string; detail: string; fill: string };

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';

const QUICK_DICE = ['1d20', '1d4', '1d6', '1d8', '1d10', '1d12', '2d6'];

export class SpotlightModal extends SuggestModal<Item> {
	private q: SpotlightQuery = parseSpotlight('');
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
		// Filters as chips, exactly as in the compendium: the chips sit in the box, before the text.
		const chipsEl = createDiv({ cls: 'nimble-cmpx-chips nimble-spot-chips' });
		this.inputEl.before(chipsEl);
		chipsEl.appendChild(this.inputEl);
		this.inputEl.addClass('nimble-cmpx-input');
		this.field = new FilterField({
			input: this.inputEl,
			chipsEl,
			isValue: (key, value) => isCompleteValue(compendiumEntries(this.plugin), key, value),
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
		const tok = f?.token();
		if (!f || !tok?.text || (!f.pending && !/:/.test(tok.text) && tok.text.length < 2)) return [];
		if (!f.pending && (/^\d/.test(tok.text) || tok.text.startsWith('>'))) return [];
		const pool = searchCompendium(compendiumEntries(this.plugin), f.rest(), { segment: 'all' }).entries;
		return suggest(tok.text, pool, 'all', { applied: f.chips, segments: true, limit: /:/.test(tok.text) ? 8 : 3 }).map(s => ({ kind: 'filter', s }));
	}

	private suggestionsFor(input: string): Item[] {
		const f = this.field;
		// With filters (chips, or one being typed), Spotlight searches the compendium with them: monsters, NPCs, spells, rules…
		if (f && (f.chips.length || f.pending)) {
			const res = searchCompendium(compendiumEntries(this.plugin), f.query(), { segment: 'all', limit: 30 });
			// The lookup carries the chips as chips (and a filter still being typed as unfinished).
			return [...this.filterSuggestions(), ...res.entries.map(entry => ({ kind: 'entry' as const, entry })), { kind: 'lookup', query: f.serialize() }];
		}
		const filters = this.filterSuggestions();
		return [...filters, ...this.plainSuggestions(input)];
	}

	private plainSuggestions(input: string): Item[] {
		const q = this.q = parseSpotlight(input);
		if (q.roll) return [{ kind: 'roll', expression: q.roll }];
		if (q.commandsOnly) return this.commands(q.text, 40);
		if (!q.text) return this.home();

		if (this.plugin.system().id === 'dnd5e') return this.dnd5eSuggestions(q.text);

		// Everything is ranked the same forgiving way: names first, and typo matches ("zombieq") only when
		// nothing matches outright, so they never crowd a real hit.
		const mons = fuzzyRank(nimble().index.all(), q.text, e => [e.name, e.monster.group ?? ''], q.counted ? 20 : 8, true);
		const found = mons.map(x => x.item);
		const named = mons.filter(x => !x.fuzzy).map(x => x.item);
		// Players look monsters up; they don't add them to fights.
		const player = this.plugin.playerView();
		const asItems = (list: MonsterIndexEntry[]): Item[] => list.map(entry => ({ kind: 'monster', entry, count: q.count, add: q.counted && !player }));
		if (q.counted && !player) return asItems(named.length ? named : found.slice(0, 5)); // "3 goblin" is about adding monsters

		// One list, ranked by how well each name matches (an exact name, then the start of a name, then the
		// start of a word…), whatever kind of thing it is. A match only in secondary text (a monster's group)
		// ranks below name matches, and typo matches ("compen" for Companions) only show when nothing anywhere
		// matches for real. Ties go to adversaries, then people, places, rules, the compendium, commands.
		type Ranked = { item: Item; score: number; fuzzy: boolean; order: number };
		const ranked: Ranked[] = [];
		const rank = (item: Item, order: number, names: string[], others: string[] = []) => {
			const own = nameMatch(names, q.text);
			const other = own ? null : nameMatch(others, q.text);
			const m = own ?? (other ? { score: other.score + 8, fuzzy: other.fuzzy } : null);
			if (m) ranked.push({ item, score: m.score + (m.fuzzy ? 100 : 0), fuzzy: m.fuzzy, order });
		};
		for (const it of asItems(found)) if (it.kind === 'monster') rank(it, 0, [it.entry.name], [it.entry.monster.group ?? '']);
		for (const npc of this.npcs()) rank({ kind: 'npc', npc }, 1, [npc.name, ...npc.aliases]);
		for (const n of this.notes()) rank(n, 2, [n.note.title], [n.note.area ? `${n.note.area} ${n.note.title}` : '']);
		for (const condition of nimble().getAllConditions().filter(c => !c.auto)) rank({ kind: 'condition', condition }, 3, [condition.name]);
		// Spells, items, class features…: the compendium's own search (typo-tolerant, typed filters).
		const cmp = searchCompendium(compendiumEntries(this.plugin), input.trim(), { segment: 'all', only: e => !!e.hit, limit: 8 });
		for (const e of cmp.entries) rank({ kind: 'compendium', hit: e.hit! }, 4, [e.name], [e.detail]);
		for (const c of this.commands(q.text, 8)) if (c.kind === 'command') rank(c, 5, [c.name]);
		// Typed filters ("school:fire") are the compendium's language: hand them over.
		const lookup: Item[] = [{ kind: 'lookup', query: input.trim() }];
		if (cmp.parsed.filters.length || cmp.parsed.segment) return [...cmp.entries.map(e => ({ kind: 'compendium' as const, hit: e.hit! })), ...lookup];
		const anyReal = ranked.some(r => !r.fuzzy);
		const list = ranked.filter(r => !anyReal || !r.fuzzy).sort((a, b) => a.score - b.score || a.order - b.order).slice(0, 14).map(r => r.item);
		return [...list, ...lookup];
	}

	/**
	 * A 5e campaign: its monsters (your ```5e notes, then the edition's SRD ones), people, places, its
	 * conditions and commands, ranked like everything else. The Nimble bestiary and compendium stay out.
	 */
	private dnd5eSuggestions(text: string): Item[] {
		const rt = dnd5e();
		const path = this.plugin.campaigns.active?.home.path;
		const edition = rt.edition(path);
		type Ranked = { item: Item; score: number; fuzzy: boolean; order: number };
		const ranked: Ranked[] = [];
		const rank = (item: Item, order: number, names: string[], others: string[] = []) => {
			const own = nameMatch(names, text);
			const other = own ? null : nameMatch(others, text);
			const m = own ?? (other ? { score: other.score + 8, fuzzy: other.fuzzy } : null);
			if (m) ranked.push({ item, score: m.score + (m.fuzzy ? 100 : 0), fuzzy: m.fuzzy, order });
		};
		for (const x of fuzzyRank(rt.index.all(edition, path), text, e => [e.name, e.monster.type ?? ''], 10, true)) rank({ kind: 'dnd5e', entry: x.item }, 0, [x.item.name], [x.item.monster.type ?? '']);
		for (const npc of this.npcs()) rank({ kind: 'npc', npc }, 1, [npc.name, ...npc.aliases]);
		for (const n of this.notes()) rank(n, 2, [n.note.title], [n.note.area ? `${n.note.area} ${n.note.title}` : '']);
		const conditions = [...this.plugin.system().conditions(edition), ...this.plugin.settings.customConditions];
		for (const condition of conditions.filter(c => !c.auto)) rank({ kind: 'condition', condition }, 3, [condition.name]);
		// Spells, items, classes, rules…: the edition's compendium (its conditions are listed above).
		for (const x of fuzzyRank(rt.hits(edition, path).filter(h => h.kind !== 'condition'), text, h => [h.name], 8, true)) rank({ kind: 'dnd5eHit', hit: x.item }, 4, [x.item.name], [x.item.detail]);
		for (const c of this.commands(text, 8)) if (c.kind === 'command') rank(c, 5, [c.name]);
		const anyReal = ranked.some(r => !r.fuzzy);
		return ranked.filter(r => !anyReal || !r.fuzzy).sort((a, b) => a.score - b.score || a.order - b.order).slice(0, 14).map(r => r.item);
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
				? { kind: 'hint', icon: 'book-open', title: 'Look something up', detail: 'Type a name: creatures, people and places from your notes, spells, items, classes and rules.', fill: '' }
				: { kind: 'hint', icon: 'skull', title: 'Search adversaries', detail: 'Type a name. Enter for a quick look, or "3 goblin" to add three to the encounter.', fill: '' },
			{ kind: 'hint', icon: 'dices', title: 'Roll dice', detail: 'Type 2d6+3 or d20 and press Enter.', fill: '2d6+3' },
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

	private title(i: Item): string {
		switch (i.kind) {
			case 'roll': return i.expression;
			case 'monster': return i.entry.name;
			case 'npc': return i.npc.name;
			case 'note': return i.note.title;
			case 'dnd5e': return i.entry.name;
			case 'dnd5eHit': return i.hit.name;
			case 'condition': return i.condition.name;
			case 'command': return i.name;
			case 'compendium': return i.hit.name;
			case 'lookup': return i.query;
			case 'filter': return i.s.label;
			case 'entry': return i.entry.name;
			default: return i.title;
		}
	}

	// ------------------------------------------------------------------------
	// Rows

	renderSuggestion(i: Item, el: HTMLElement): void {
		el.addClass('nimble-spot-row', `spot-${i.kind}`);
		const icon = el.createSpan({ cls: 'nimble-spot-icon' });
		const text = el.createDiv({ cls: 'nimble-spot-text' });
		const name = text.createDiv({ cls: 'nimble-spot-name' });
		const meta = (t: string) => { if (t) text.createDiv({ cls: 'nimble-spot-meta', text: t }); };
		const tag = (t: string) => el.createSpan({ cls: 'nimble-spot-tag', text: t });
		switch (i.kind) {
			case 'roll':
				setIcon(icon, 'dices');
				name.setText(`Roll ${i.expression}`);
				meta(`Enter rolls it. ${MOD}+Enter rolls and keeps this open.`);
				tag('Dice');
				break;
			case 'monster': {
				const m = i.entry.monster;
				if (this.plugin.hideStats(i.entry.filePath)) {
					// Player view: what a hero could know, no level.
					setIcon(icon, 'paw-print');
					name.setText(i.entry.name);
					meta([m.group, [m.size !== 'Medium' ? m.size : '', m.type].filter(Boolean).join(' '), m.habitat].filter(Boolean).join(' · '));
					tag('Creature');
					break;
				}
				icon.addClass('nimble-spot-level', `role-${monsterRole(m)}`);
				icon.setText(formatLevel(m.level) || '–');
				name.setText(i.add ? `Add ${i.count} × ${i.entry.name}` : i.entry.name);
				meta(`${describeMonster(i.entry)}${i.entry.bundled ? (m.source ? ` · ${m.source}` : '') : ' · your note'}`);
				tag(i.add ? 'Add to encounter' : 'Adversary');
				break;
			}
			case 'dnd5e': {
				const m = i.entry.monster;
				if (this.plugin.hideStats(i.entry.filePath)) {
					setIcon(icon, 'paw-print');
					name.setText(i.entry.name);
					meta([m.size, m.type].filter(Boolean).join(' '));
					tag('Creature');
					break;
				}
				icon.addClass('nimble-spot-level');
				icon.setText(m.cr);
				name.setText(i.entry.name);
				meta([`CR ${m.cr}`, [m.size, m.type].filter(Boolean).join(' '), i.entry.bundled ? m.source : 'your note'].filter(Boolean).join(' · '));
				tag('Adversary');
				break;
			}
			case 'dnd5eHit':
				setIcon(icon, KIND5E[i.hit.kind].icon);
				name.setText(i.hit.name);
				meta(i.hit.detail);
				tag(KIND5E[i.hit.kind].label);
				break;
			case 'npc': {
				const portrait = portraitOf(this.app, i.npc.path);
				if (portrait) renderAvatar(icon, portrait, 'nimble-spot-avatar');
				else setIcon(icon, 'user-round');
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
				setIcon(icon, 'activity');
				name.setText(i.condition.name);
				text.createDiv({ cls: 'nimble-spot-meta is-long', text: i.condition.description });
				tag('Condition');
				break;
			case 'command':
				setIcon(icon, i.icon || 'terminal');
				name.setText(i.name);
				tag('Command');
				break;
			case 'compendium': {
				const h = i.hit;
				icon.addClass(`cmp-${h.kind}`);
				setIcon(icon, compendiumIcon(h));
				name.setText(h.name);
				if (h.draft) name.createSpan({ cls: 'nimble-cmp-draft', text: 'Draft' });
				meta(h.detail);
				tag(KIND_LABEL[h.kind]);
				break;
			}
			case 'filter': {
				el.addClass('is-filter');
				setIcon(icon, i.s.kind === 'sort' ? 'arrow-up-down' : i.s.kind === 'segment' ? 'panel-top' : i.s.kind === 'key' ? 'filter' : 'list-filter');
				const m = i.s.label.match(/^([-!]?[a-z]+:)(.*)$/i);
				if (m) { name.createSpan({ cls: 'nimble-cmpx-token-key', text: m[1] }); name.createSpan({ text: m[2] }); } else name.setText(i.s.label);
				meta(i.s.detail);
				tag(i.s.kind === 'key' ? 'Filter by' : 'Filter');
				break;
			}
			case 'entry': {
				const e = i.entry;
				if (e.monster && !this.plugin.hideStats(e.monster.filePath)) {
					icon.addClass('nimble-spot-level', `role-${monsterRole(e.monster.monster)}`);
					icon.setText(e.badge ?? '–');
				} else if (e.hit) { icon.addClass(`cmp-${e.hit.kind}`); setIcon(icon, compendiumIcon(e.hit)); }
				else setIcon(icon, e.monster ? 'paw-print' : e.npc ? 'user-round' : e.condition ? 'activity' : 'scale');
				name.setText(e.name);
				meta(e.detail);
				tag(ENTRY_KIND_LABEL[e.kind]);
				break;
			}
			case 'lookup':
				setIcon(icon, 'library');
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
		if (i.kind === 'monster' && mod && !this.plugin.playerView()) { this.add(i); return; } // add and keep searching, to build a fight in one go
		super.selectSuggestion(i, evt);
	}

	onChooseSuggestion(i: Item, evt: MouseEvent | KeyboardEvent): void {
		const mod = evt.metaKey || evt.ctrlKey;
		switch (i.kind) {
			case 'roll': this.roll(i.expression, false); break;
			case 'dnd5e': this.escapeBack(dnd5e().quickLook(i.entry, this.plugin.campaigns.active?.home.path ?? '')); break;
			case 'dnd5eHit': this.escapeBack(dnd5e().openCard(i.hit, this.plugin.campaigns.active?.home.path ?? '')); break;
			case 'monster':
				if (i.add) void nimble().addToEncounter(i.entry.monster, i.entry.filePath || undefined, i.count);
				else this.escapeBack(openRecord(this.plugin, { kind: 'monster', entry: i.entry }));
				break;
			case 'npc': {
				const f = this.app.vault.getAbstractFileByPath(i.npc.path);
				if (!(f instanceof TFile)) break;
				if (mod) void this.plugin.campaigns.open(f.path, true);
				else this.escapeBack(openRecord(this.plugin, { kind: 'note', file: f, subtitle: i.npc.role }));
				break;
			}
			case 'note': void this.plugin.campaigns.open(i.note.path, mod); break;
			case 'condition': new Notice(`${i.condition.name}: ${i.condition.description}`, 12000); break;
			case 'compendium': {
				const m = new CompendiumCardModal(this.app, this.plugin, i.hit);
				m.open();
				this.escapeBack(m);
				break;
			}
			case 'lookup': this.escapeBack(openCompendiumSearch(this.plugin, i.query)); break;
			case 'entry': { const m = openEntry(this.plugin, i.entry); if (m) this.escapeBack(m); break; }
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
	}

	private add(i: Extract<Item, { kind: 'monster' }>): void {
		void nimble().addToEncounter(i.entry.monster, i.entry.filePath || undefined, i.count);
		this.fill('');
	}
}
