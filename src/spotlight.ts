// Spotlight: one box for everything at the table. Search adversaries, NPCs,
// the campaign's notes and conditions; type dice to roll them; run the
// plugin's commands. Opened with Cmd/Ctrl+K (rebindable under Hotkeys).
//
//   goblin        Enter: quick look · Cmd/Ctrl+Enter: add to the encounter
//   3 goblin      Enter: add three to the encounter
//   2d6+3         Enter: roll (Cmd/Ctrl+Enter rolls and keeps the box open)
//   > next        commands only

import { Notice, Platform, prepareFuzzySearch, setIcon, SuggestModal, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { KIND_ICON } from './campaign-ui';
import type { NoteRef } from './campaign-model';
import type { NpcInfo } from './campaigns';
import { chooseSelected, pluginCommands, runCommand } from './internals';
import { portraitOf, renderAvatar } from './npc-card';
import { openRecord } from './record-modal';
import { formatLevel, monsterRole } from './rules';
import { parseSpotlight, rankByName, SpotlightQuery } from './spotlight-def';
import { describeMonster, searchMonsters } from './suggest';
import type { MonsterIndexEntry, NimbleCondition } from './types';

type Item =
	| { kind: 'roll'; expression: string }
	| { kind: 'monster'; entry: MonsterIndexEntry; count: number; add: boolean }
	| { kind: 'npc'; npc: NpcInfo }
	| { kind: 'note'; note: NoteRef; where: string }
	| { kind: 'condition'; condition: NimbleCondition }
	| { kind: 'command'; id: string; name: string; icon?: string }
	| { kind: 'hint'; icon: string; title: string; detail: string; fill: string };

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';
const QUICK_DICE = ['1d20', '1d4', '1d6', '1d8', '1d10', '1d12', '2d6'];

export class SpotlightModal extends SuggestModal<Item> {
	private q: SpotlightQuery = parseSpotlight('');
	private diceRow: HTMLElement | null = null;

	constructor(private plugin: NimbleStatblocksPlugin, private onClosed?: () => void) {
		super(plugin.app);
		this.modalEl.addClass('nimble-spotlight');
		this.setPlaceholder('Search adversaries, NPCs and notes, type 2d6+3 to roll, or > for commands');
		this.limit = 40;
		this.emptyStateText = 'Nothing matches. Try a monster name, an NPC, 2d6+3, or > and a command.';
		this.setInstructions([
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
		this.scope.register(['Mod'], 'k', () => { if (Date.now() - born > 250) this.close(); return false; });
	}

	onOpen(): void {
		void super.onOpen();
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
		const q = this.q = parseSpotlight(input);
		if (q.roll) return [{ kind: 'roll', expression: q.roll }];
		if (q.commandsOnly) return this.commands(q.text, 40);
		if (!q.text) return this.home();

		// Monsters whose name holds what was typed. The bestiary search also returns loose (scattered-letter)
		// matches, which are noise beside a real hit; they're only a fallback for when nothing matches outright.
		const found = searchMonsters(this.plugin.index.all(), q.text, q.counted ? 20 : 8);
		const named = found.filter(e => e.name.toLowerCase().includes(q.text));
		const asItems = (list: MonsterIndexEntry[]): Item[] => list.map(entry => ({ kind: 'monster', entry, count: q.count, add: q.counted }));
		if (q.counted) return asItems(named.length ? named : found.slice(0, 5)); // "3 goblin" is about adding monsters

		const npcs: Item[] = rankByName(this.npcs(), q.text, n => [n.name, ...n.aliases], 5).map(npc => ({ kind: 'npc', npc }));
		const notes: Item[] = rankByName(this.notes(), q.text, n => [n.note.title, n.note.area ? `${n.note.area} ${n.note.title}` : ''], 6);
		const conditions: Item[] = rankByName(this.plugin.getAllConditions().filter(c => !c.auto), q.text, c => [c.name], 3)
			.map(condition => ({ kind: 'condition', condition }));
		const commands = this.commands(q.text, 5, false);
		const all = [...asItems(named), ...npcs, ...notes, ...conditions, ...commands];
		if (!all.length) return [...asItems(found.slice(0, 5)), ...this.commands(q.text, 3)]; // a typo still finds something
		// An exact name wins the top spot whatever it is; otherwise adversaries lead.
		const exact = (i: Item) => this.title(i).toLowerCase() === q.text;
		return [...all.filter(exact), ...all.filter(i => !exact(i))];
	}

	/** With nothing typed: what's most useful right now. */
	private home(): Item[] {
		const ids = ['next-round', 'start-combat', 'resume-combat', 'end-combat', 'add-monster', 'build-encounter', 'open-tracker', 'open-bestiary', 'new-scene', 'new-npc', 'edit-party', 'dice-workshop'];
		const byId = new Map(this.commands('', 200).map(c => [c.kind === 'command' ? c.id.replace(/^.*:/, '') : '', c]));
		const hints: Item[] = [
			{ kind: 'hint', icon: 'skull', title: 'Search adversaries', detail: 'Type a name. Enter for a quick look, or "3 goblin" to add three to the encounter.', fill: '' },
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
		if (i.kind === 'monster' && mod) { this.add(i); return; } // add and keep searching, to build a fight in one go
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
			case 'command':
				if (!runCommand(this.app, i.id)) new Notice(`Couldn't run "${i.name}"`);
				break;
			default: break;
		}
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
