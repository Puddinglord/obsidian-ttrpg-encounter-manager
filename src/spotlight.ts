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
//
// openSpotlight(plugin, { kinds, title, onPick }) is the filtered mode the
// character sheet's Add buttons use: only those compendium kinds, filter chips,
// and Enter picks (Cmd/Ctrl+Enter picks and keeps the box open).

import { Notice, Platform, prepareFuzzySearch, setIcon, SuggestModal, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { KIND_ICON } from './campaign-ui';
import type { NoteRef } from './campaign-model';
import type { NpcInfo } from './campaigns';
import { chooseSelected, pluginCommands, runCommand } from './internals';
import { portraitOf, renderAvatar } from './npc-card';
import { openRecord } from './record-modal';
import { formatLevel, monsterRole } from './rules';
import { orderPicks, parseSpotlight, rankByName, SpotlightQuery } from './spotlight-def';
import { CompendiumHit, CompendiumKind, Item as CompendiumItem, KIND_LABEL } from './compendium';
import { bundledCompendium } from './compendium-data';
import { CompendiumCardModal } from './compendium-card';
import { describeMonster, searchMonsters } from './suggest';
import type { MonsterIndexEntry, NimbleCondition } from './types';

type Item =
	| { kind: 'roll'; expression: string }
	| { kind: 'monster'; entry: MonsterIndexEntry; count: number; add: boolean }
	| { kind: 'npc'; npc: NpcInfo }
	| { kind: 'note'; note: NoteRef; where: string }
	| { kind: 'condition'; condition: NimbleCondition }
	| { kind: 'command'; id: string; name: string; icon?: string }
	| { kind: 'compendium'; hit: CompendiumHit }
	| { kind: 'custom'; name: string }
	| { kind: 'hint'; icon: string; title: string; detail: string; fill: string };

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';

/** The filtered mode: a picker over some compendium kinds. */
export interface SpotlightPick {
	kinds: CompendiumKind[];
	/** Placeholder and heading: "Add to Thorga's inventory". */
	title: string;
	onPick: (hit: CompendiumHit) => void;
	/** Entries to list first (the class's own options, the caster's schools); also a filter chip. */
	prefer?: (hit: CompendiumHit) => boolean;
	preferLabel?: string;
	/** Already on the sheet: tagged "Added" and listed after the rest. */
	isTaken?: (hit: CompendiumHit) => boolean;
	/** Offer "Add “what you typed”" when it isn't in the compendium. */
	allowCustom?: boolean;
}

interface Chip { label: string; test: (h: CompendiumHit) => boolean }

const KIND_ICON_CMP: Record<CompendiumKind, string> = {
	item: 'backpack', spell: 'wand-2', feature: 'sparkles', class: 'graduation-cap', subclass: 'git-branch',
	ancestry: 'users', background: 'scroll-text', boon: 'gem',
};

/** Icon for a compendium entry (items by category). */
export function compendiumIcon(h: CompendiumHit): string {
	if (h.kind === 'item') {
		const c = (h.entry as CompendiumItem).category;
		return c === 'weapon' ? 'sword' : c === 'armor' ? 'shirt' : c === 'shield' ? 'shield' : c === 'consumable' ? 'flask-conical' : c === 'magic' ? 'sparkle' : c === 'scroll' ? 'scroll' : c === 'wand' ? 'wand' : 'backpack';
	}
	return KIND_ICON_CMP[h.kind];
}

/** Open Spotlight, optionally as a filtered compendium picker. */
export function openSpotlight(plugin: NimbleStatblocksPlugin, pick?: SpotlightPick): SpotlightModal {
	const m = new SpotlightModal(plugin, undefined, pick);
	m.open();
	return m;
}
const QUICK_DICE = ['1d20', '1d4', '1d6', '1d8', '1d10', '1d12', '2d6'];

export class SpotlightModal extends SuggestModal<Item> {
	private q: SpotlightQuery = parseSpotlight('');
	private diceRow: HTMLElement | null = null;
	private chips: Chip[] = [];
	private chip = 0;

	constructor(private plugin: NimbleStatblocksPlugin, private onClosed?: () => void, private pick?: SpotlightPick) {
		super(plugin.app);
		this.modalEl.addClass('nimble-spotlight');
		if (pick) {
			this.modalEl.addClass('is-picker');
			this.setPlaceholder(`${pick.title}: type to search`);
			this.limit = 60;
			this.emptyStateText = pick.allowCustom ? 'Nothing in the compendium matches.' : 'Nothing matches.';
			this.setInstructions([
				{ command: '↵', purpose: 'add' },
				{ command: `${MOD} ↵`, purpose: 'add and keep open' },
				{ command: 'esc', purpose: 'close' },
			]);
			this.chips = this.makeChips(pick);
			this.scope.register(['Mod'], 'Enter', (e) => { chooseSelected(this, e); return false; });
			return;
		}
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
		if (this.pick) { this.renderChips(); return; }
		// Dice one tap away, without typing.
		const row = createDiv({ cls: 'nimble-spotlight-dice' });
		for (const d of QUICK_DICE) {
			const b = row.createEl('button', { cls: 'nimble-spotlight-die', text: d.replace(/^1d/, 'd'), attr: { 'aria-label': `Roll ${d}`, tabindex: '-1' } });
			b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in the search box
			b.addEventListener('click', () => this.roll(d, true));
		}
		this.inputEl.parentElement?.after(row);
		this.diceRow = row;
	}

	onClose(): void {
		super.onClose();
		this.onClosed?.();
	}

	// ------------------------------------------------------------------------
	// Results

	getSuggestions(input: string): Item[] {
		if (this.pick) return this.picks(input);
		const q = this.q = parseSpotlight(input);
		if (q.roll) return [{ kind: 'roll', expression: q.roll }];
		if (q.commandsOnly) return this.commands(q.text, 40);
		if (!q.text) return this.home();

		// Monsters whose name holds what was typed. The bestiary search also returns loose (scattered-letter)
		// matches, which are noise beside a real hit; they're only a fallback for when nothing matches outright.
		const found = searchMonsters(this.plugin.index.all(), q.text, q.counted ? 20 : 8);
		const named = found.filter(e => e.name.toLowerCase().includes(q.text));
		// Players look monsters up; they don't add them to fights.
		const player = this.plugin.playerView();
		const asItems = (list: MonsterIndexEntry[]): Item[] => list.map(entry => ({ kind: 'monster', entry, count: q.count, add: q.counted && !player }));
		if (q.counted && !player) return asItems(named.length ? named : found.slice(0, 5)); // "3 goblin" is about adding monsters

		const npcs: Item[] = rankByName(this.npcs(), q.text, n => [n.name, ...n.aliases], 5).map(npc => ({ kind: 'npc', npc }));
		const notes: Item[] = rankByName(this.notes(), q.text, n => [n.note.title, n.note.area ? `${n.note.area} ${n.note.title}` : ''], 6);
		const conditions: Item[] = rankByName(this.plugin.getAllConditions().filter(c => !c.auto), q.text, c => [c.name], 3)
			.map(condition => ({ kind: 'condition', condition }));
		const commands = this.commands(q.text, 5, false);
		const compendium: Item[] = bundledCompendium().search(q.text, undefined, 6).map(hit => ({ kind: 'compendium', hit }));
		const all = [...asItems(named), ...npcs, ...notes, ...conditions, ...compendium, ...commands];
		if (!all.length) return [...asItems(found.slice(0, 5)), ...this.commands(q.text, 3)]; // a typo still finds something
		// An exact name wins the top spot whatever it is; otherwise adversaries lead.
		const exact = (i: Item) => this.title(i).toLowerCase() === q.text;
		return [...all.filter(exact), ...all.filter(i => !exact(i))];
	}

	/** With nothing typed: what's most useful right now. */
	private home(): Item[] {
		const player = this.plugin.playerView();
		const ids = player
			? ['open-my-character', 'add-item-to-character', 'new-session', 'new-npc', 'new-location', 'open-bestiary', 'continue-campaign', 'dice-workshop']
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

	/** Scenes, maps, locations and other notes of the active campaign (NPCs have their own rows). */
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
			case 'condition': return i.condition.name;
			case 'command': return i.name;
			case 'compendium': return i.hit.name;
			case 'custom': return i.name;
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
				if (this.pick && h.text) text.createDiv({ cls: 'nimble-spot-meta is-long is-text', text: h.text.replace(/\s+/g, ' ') });
				if (this.pick?.isTaken?.(h)) { el.addClass('is-taken'); tag('Added'); } else tag(KIND_LABEL[h.kind]);
				break;
			}
			case 'custom':
				setIcon(icon, 'pen-line');
				name.setText(`Add “${i.name}”`);
				meta('Not in the compendium: added by name. You can write its details in the note.');
				tag('Custom');
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
		if (i.kind === 'hint') { this.fill(i.fill); return; }
		if (i.kind === 'roll' && mod) { this.roll(i.expression, true); return; }
		if (i.kind === 'monster' && mod && !this.plugin.playerView()) { this.add(i); return; } // add and keep searching, to build a fight in one go
		if (this.pick && mod && (i.kind === 'compendium' || i.kind === 'custom')) {
			// Pick and keep going (several items at once).
			this.pick.onPick(i.kind === 'compendium' ? i.hit : this.customHit(i.name));
			window.setTimeout(() => this.inputEl.dispatchEvent(new Event('input')), 400);
			return;
		}
		super.selectSuggestion(i, evt);
	}

	onChooseSuggestion(i: Item, evt: MouseEvent | KeyboardEvent): void {
		const mod = evt.metaKey || evt.ctrlKey;
		switch (i.kind) {
			case 'roll': this.roll(i.expression, false); break;
			case 'monster':
				if (i.add) void this.plugin.addToEncounter(i.entry.monster, i.entry.filePath || undefined, i.count);
				else openRecord(this.plugin, { kind: 'monster', entry: i.entry });
				break;
			case 'npc': {
				const f = this.app.vault.getAbstractFileByPath(i.npc.path);
				if (!(f instanceof TFile)) break;
				if (mod) void this.plugin.campaigns.open(f.path, true);
				else openRecord(this.plugin, { kind: 'note', file: f, subtitle: i.npc.role });
				break;
			}
			case 'note': void this.plugin.campaigns.open(i.note.path, mod); break;
			case 'condition': new Notice(`${i.condition.name}: ${i.condition.description}`, 12000); break;
			case 'compendium':
				if (this.pick) this.pick.onPick(i.hit);
				else new CompendiumCardModal(this.app, this.plugin, i.hit).open();
				break;
			case 'custom': this.pick?.onPick(this.customHit(i.name)); break;
			case 'command':
				if (!runCommand(this.app, i.id)) new Notice(`Couldn't run "${i.name}"`);
				break;
			default: break;
		}
	}

	// ------------------------------------------------------------------------
	// Filtered mode

	private makeChips(pick: SpotlightPick): Chip[] {
		const chips: Chip[] = [{ label: 'All', test: () => true }];
		if (pick.prefer) chips.push({ label: pick.preferLabel ?? 'Suggested', test: pick.prefer });
		if (pick.kinds.length > 1) for (const k of pick.kinds) chips.push({ label: `${KIND_LABEL[k]}s`, test: h => h.kind === k });
		if (pick.kinds.length === 1 && pick.kinds[0] === 'item') {
			const cats = [...new Set(bundledCompendium().items.map(it => it.category).filter((c): c is string => !!c))];
			const label: Record<string, string> = { weapon: 'Weapons', armor: 'Armor', shield: 'Shields', gear: 'Gear', consumable: 'Consumables', magic: 'Magic', scroll: 'Scrolls', wand: 'Wands', story: 'Story', combat: 'Combat' };
			for (const c of cats) chips.push({ label: label[c] ?? c[0].toUpperCase() + c.slice(1), test: h => (h.entry as CompendiumItem).category === c });
		}
		if (pick.kinds.length === 1 && pick.kinds[0] === 'spell') {
			const schools = [...new Set(bundledCompendium().spells.map(sp => sp.school).filter((c): c is string => !!c))];
			for (const sc of schools) chips.push({ label: sc, test: h => (h.entry as { school?: string }).school === sc });
		}
		return chips;
	}

	private renderChips(): void {
		const row = createDiv({ cls: 'nimble-spotlight-chips', attr: { role: 'radiogroup', 'aria-label': 'Filter' } });
		const draw = () => {
			row.empty();
			if (this.pick) row.createDiv({ cls: 'nimble-spotlight-title', text: this.pick.title });
			if (this.chips.length < 2) return;
			this.chips.forEach((c, i) => {
				const b = row.createEl('button', { cls: `nimble-spotlight-chip${i === this.chip ? ' is-active' : ''}`, text: c.label, attr: { role: 'radio', 'aria-checked': String(i === this.chip), tabindex: '-1' } });
				b.addEventListener('mousedown', (e) => e.preventDefault()); // keep typing in the box
				b.addEventListener('click', () => { this.chip = i; draw(); this.inputEl.dispatchEvent(new Event('input')); this.inputEl.focus(); });
			});
		};
		draw();
		this.inputEl.parentElement?.after(row);
	}

	private picks(input: string): Item[] {
		const pick = this.pick!;
		const q = input.trim();
		const chip = this.chips[this.chip] ?? this.chips[0];
		const hits = bundledCompendium().search(q, pick.kinds, q ? 80 : 400).filter(h => !chip || chip.test(h));
		const ordered = orderPicks(hits, q, pick.prefer, pick.isTaken).slice(0, 60);
		const out: Item[] = ordered.map(hit => ({ kind: 'compendium', hit }));
		if (pick.allowCustom && q && !ordered.some(h => h.name.toLowerCase() === q.toLowerCase())) out.push({ kind: 'custom', name: q });
		return out;
	}

	private customHit(name: string): CompendiumHit {
		return { kind: this.pick?.kinds[0] ?? 'item', name, detail: '', entry: {} };
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
		void this.plugin.addToEncounter(i.entry.monster, i.entry.filePath || undefined, i.count);
		this.fill('');
	}
}
