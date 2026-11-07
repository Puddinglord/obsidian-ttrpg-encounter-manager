// Nimble "/" commands in the editor. Type "/" at the start of a line or after a
// space: commands take arguments and search as you type, e.g.
//   /monster gob        → `nimble:Goblin`
//   /add 3 goblin       → three goblins straight into the tracker
//   /encounter 3 goblin, 2 wolf  → an encounter block, rated against the party
//   /statblock krogg    → the full stat block, editable in the note
//   /roll 2d6+3         → rolls and writes the result

import {
	App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Notice, setIcon, TFile,
} from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MonsterIndexEntry, NimbleCondition } from './types';
import { toStatblockSource } from './parser';
import { encounterBlockSource, EncounterDef, parseMonsterLine } from './encounter-def';
import { partyLevels } from './encounter-block';
import { formatLevel, rateEncounter } from './rules';
import { describeMonster } from './suggest';
import { BuilderModal } from './builder-modal';
import { parseDice } from './dice';
import { BOX_PRESETS, boxColor, newBox } from './box-def';
import { safeName } from './campaign-model';
import { NPC_CARD_BLOCK } from './npc-card-def';

type ArgKind = 'monster' | 'add' | 'list' | 'condition' | 'image' | 'dice' | 'box' | 'npc';

interface SlashCommand {
	name: string;
	aliases?: string[];
	icon: string;
	desc: string;
	/** Example shown next to commands that take an argument. */
	hint?: string;
	arg?: ArgKind;
	/** Commands without an argument: text to insert (block = on its own line) or an action. */
	insert?: (p: NimbleStatblocksPlugin) => { text: string; block?: boolean; cursorBack?: number; inside?: boolean } | null;
	action?: (p: NimbleStatblocksPlugin) => void;
}

interface SlashItem {
	icon: string;
	title: string;
	detail?: string;
	badge?: { text: string; cls?: string; color?: string };
	/** Selecting a command that needs an argument completes it to "/name ". */
	complete?: string;
	run?: (editor: Editor, start: EditorPosition, end: EditorPosition) => void;
}

const LEGENDARY = `\`\`\`nimble
name: Legendary Monster
level: 3
role: legendary
size: Large
hp: 40/hero
saves: STR+
actionText: After each hero's turn, choose one:
attacks:
- **Rend.** Move 8. 2d6+5.
- **Roar.** (Reach 6, AoE) DC 12 WIL save or Frightened 1 round.
bloodied: Its damage dice become d8s.
lastStand: Regains 10 HP per hero and moves after every hero's turn.
\`\`\``;

const MINION = `\`\`\`nimble
name: Minion
role: minion
size: Small
attacks:
- **Stab.** 1d6 (follows minion rules).
\`\`\``;

const NEW_MONSTER = `\`\`\`nimble
name: New Monster
level: 1
size: Medium
type: Beast
hp: 21
saves: DEX+
abilities:
- Pack Hunter: Advantage on attacks against a target next to another ally.
attacks:
- **Bite.** 1d8+2.
\`\`\``;

const COMMANDS: SlashCommand[] = [
	{ name: 'monster', aliases: ['m', 'ref'], icon: 'skull', desc: 'Monster reference', hint: '/monster goblin', arg: 'monster' },
	{ name: 'add', aliases: ['fight'], icon: 'swords', desc: 'Add to the tracker', hint: '/add 3 goblin', arg: 'add' },
	{ name: 'encounter', aliases: ['enc'], icon: 'shield-alert', desc: 'Encounter block', hint: '/encounter 3 goblin, 2 wolf', arg: 'list' },
	{ name: 'statblock', aliases: ['sb', 'block'], icon: 'scroll-text', desc: 'Full stat block', hint: '/statblock krogg', arg: 'monster' },
	{ name: 'builder', icon: 'scale', desc: 'Open the encounter builder', action: (p) => new BuilderModal(p).open() },
	{ name: 'legendary', aliases: ['boss', 'solo'], icon: 'crown', desc: 'Legendary monster template', insert: () => ({ text: LEGENDARY, block: true }) },
	{ name: 'minion', icon: 'users', desc: 'Minion template', insert: () => ({ text: MINION, block: true }) },
	{ name: 'new-monster', aliases: ['template'], icon: 'file-plus', desc: 'Blank monster stat block', insert: () => ({ text: NEW_MONSTER, block: true }) },
	{ name: 'condition', aliases: ['cond', 'status'], icon: 'activity', desc: 'Condition rules', hint: '/condition dazed', arg: 'condition' },
	{ name: 'box', aliases: ['callout'], icon: 'square-dashed', desc: 'Any box type', hint: '/box treasure', arg: 'box' },
	{ name: 'npc', aliases: ['who'], icon: 'user-round', desc: 'Link an NPC, or create one', hint: '/npc kevori', arg: 'npc' },
	{ name: 'npc-card', aliases: ['portrait', 'character'], icon: 'contact-round', desc: 'NPC card with portrait', insert: () => ({ text: NPC_CARD_BLOCK, block: true }) },
	...Object.entries(BOX_PRESETS).filter(([id]) => id !== 'npc' && id !== 'note').map(([id, p]): SlashCommand => ({
		name: id, aliases: p.aliases, icon: p.icon, desc: p.desc,
		insert: () => ({ text: newBox(id), block: true, inside: true }),
	})),
	{ name: 'map', icon: 'map', desc: 'GM map with pins', hint: '/map hideout', arg: 'image' },
	{ name: 'roll', aliases: ['r', 'dice'], icon: 'dices', desc: 'Roll and write the result', hint: '/roll 2d6+3', arg: 'dice' },
	{ name: 'summary', icon: 'clipboard-list', desc: 'Write the current encounter\'s summary', insert: (p) => {
		const enc = p.encounters.active;
		if (!enc || !enc.creatures.length) { new Notice('No encounter in the tracker'); return null; }
		return { text: p.encounters.summary(enc.id) };
	} },
	{ name: 'party', aliases: ['heroes', 'pc'], icon: 'user-cog', desc: 'Edit the party', action: (p) => p.openParty() },
	{ name: 'bestiary', aliases: ['monsters', 'b'], icon: 'book-open', desc: 'Open the bestiary', action: (p) => void p.openBestiary() },
	{ name: 'tracker', aliases: ['combat', 'initiative'], icon: 'swords', desc: 'Open the encounter tracker', action: (p) => void p.activateEncounterView() },
	{ name: 'settings', aliases: ['options'], icon: 'settings', desc: 'Ember Vault settings', action: (p) => p.openSettings() },
	{ name: 'party-table', icon: 'users-round', desc: 'Table of your heroes', insert: (p) => {
		if (!p.settings.party.length) { new Notice('Set up your party in the plugin settings first'); return null; }
		const rows = p.settings.party.map(h => `| ${h.name} | ${h.className ?? ''} | ${h.level} | ${h.maxHp} | ${h.defense ?? ''} |`);
		return { text: ['| Hero | Class | Level | HP | DEF |', '| --- | --- | --- | --- | --- |', ...rows].join('\n'), block: true };
	} },
];

/** Menu order for a bare "/": what a GM reaches for at the table first. */
const ORDER = ['monster', 'add', 'encounter', 'read-aloud', 'look', 'treasure', 'npc', 'npc-card', 'statblock', 'builder', 'party', 'tracker', 'bestiary', 'condition', 'roll', 'trap', 'secret', 'clue', 'checks', 'exits', 'box', 'map', 'legendary', 'minion', 'new-monster', 'summary', 'party-table', 'settings'];
const rank = (c: SlashCommand) => { const i = ORDER.indexOf(c.name); return i === -1 ? ORDER.length : i; };

function commandMatches(c: SlashCommand, q: string): number {
	const names = [c.name, ...(c.aliases || [])];
	if (!q) return 1;
	if (names.some(n => n === q)) return 0;
	if (names.some(n => n.startsWith(q))) return 1;
	if (names.some(n => n.includes(q)) || c.desc.toLowerCase().includes(q)) return 2;
	return -1;
}

/** True when the cursor is inside a fenced code block. */
function inCodeFence(editor: Editor, line: number): boolean {
	let open = false;
	for (let i = Math.max(0, line - 400); i < line; i++) {
		if (/^\s*(```|~~~)/.test(editor.getLine(i))) open = !open;
	}
	return open;
}

export class NimbleSlashSuggest extends EditorSuggest<SlashItem> {
	constructor(app: App, private plugin: NimbleStatblocksPlugin) {
		super(app);
		this.limit = 40;
		this.setInstructions([
			{ command: '↑↓', purpose: 'navigate' },
			{ command: '↵', purpose: 'choose' },
			{ command: 'esc', purpose: 'dismiss' },
		]);
	}

	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.slashCommands) return null;
		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = before.match(/(?:^|\s)\/([a-z-]*(?: [^/]*)?)$/i);
		if (!m) return null;
		const query = m[1];
		const cmd = query.split(' ')[0].toLowerCase();
		// Only keep the menu open for things that are (or could become) our commands.
		if (!COMMANDS.some(c => commandMatches(c, cmd) >= 0)) return null;
		if (inCodeFence(editor, cursor.line)) return null;
		return { start: { line: cursor.line, ch: cursor.ch - query.length - 1 }, end: cursor, query };
	}

	getSuggestions(ctx: EditorSuggestContext): SlashItem[] {
		const raw = ctx.query;
		const space = raw.indexOf(' ');
		const head = (space === -1 ? raw : raw.slice(0, space)).toLowerCase();
		const arg = space === -1 ? null : raw.slice(space + 1);

		if (arg === null) {
			return COMMANDS
				.map(c => ({ c, score: commandMatches(c, head) }))
				.filter(x => x.score >= 0)
				.sort((a, b) => a.score - b.score || rank(a.c) - rank(b.c))
				.map(({ c }) => this.commandItem(c));
		}
		const cmd = COMMANDS.find(c => c.name === head || c.aliases?.includes(head));
		if (!cmd) return [];
		if (!cmd.arg) return [this.commandItem(cmd)];
		switch (cmd.arg) {
			case 'monster': return this.monsterItems(arg, cmd.name === 'statblock' ? 'statblock' : 'ref');
			case 'add': return this.addItems(arg);
			case 'list': return this.encounterItems(arg);
			case 'condition': return this.conditionItems(arg);
			case 'image': return this.imageItems(arg);
			case 'dice': return this.diceItems(arg);
			case 'box': return this.boxItems(arg);
			case 'npc': return this.npcItems(arg);
		}
		return [];
	}

	renderSuggestion(item: SlashItem, el: HTMLElement): void {
		el.addClass('nimble-slash-item');
		setIcon(el.createDiv({ cls: 'nimble-slash-icon' }), item.icon);
		const text = el.createDiv({ cls: 'nimble-slash-text' });
		text.createDiv({ cls: 'nimble-slash-title', text: item.title });
		if (item.detail) text.createDiv({ cls: 'nimble-slash-detail', text: item.detail });
		if (item.badge?.color) el.createDiv({ cls: 'nimble-slash-swatch', attr: { style: `background: ${item.badge.color}` } });
		else if (item.badge) el.createDiv({ cls: `nimble-slash-badge ${item.badge.cls || ''}`, text: item.badge.text });
	}

	selectSuggestion(item: SlashItem): void {
		const ctx = this.context;
		if (!ctx) return;
		const { editor, start, end } = ctx;
		if (item.complete !== undefined) {
			editor.replaceRange(item.complete, start, end);
			editor.setCursor({ line: start.line, ch: start.ch + item.complete.length });
			return;
		}
		item.run?.(editor, start, end);
	}

	// ------------------------------------------------------------------------

	private commandItem(c: SlashCommand): SlashItem {
		const item: SlashItem = { icon: c.icon, title: `/${c.name}`, detail: c.hint ? `${c.desc} · ${c.hint}` : c.desc };
		if (c.arg) item.complete = `/${c.name} `;
		else if (c.action) item.run = (editor, start, end) => { editor.replaceRange('', start, end); c.action!(this.plugin); };
		else if (c.insert) item.run = (editor, start, end) => {
			const r = c.insert!(this.plugin);
			if (!r) { editor.replaceRange('', start, end); return; }
			this.write(editor, start, end, r.text, r.block, r.inside);
		};
		return item;
	}

	/** Replace the slash text; blocks go on their own lines. The cursor lands at the end. */
	private write(editor: Editor, start: EditorPosition, end: EditorPosition, text: string, block = false, inside = false): void {
		let out = text;
		if (block && editor.getLine(start.line).slice(0, start.ch).trim()) out = `\n${out}`;
		// Callouts and references: the cursor stays at the end, ready to type into them.
		// Fenced blocks: the cursor moves below the closing fence.
		const lines = out.split('\n');
		let cursor = { line: start.line + lines.length - 1, ch: (lines.length === 1 ? start.ch : 0) + lines[lines.length - 1].length };
		if (block) {
			const fenced = /^(```|~~~)/.test(lines[lines.length - 1]);
			out += '\n';
			// Boxes: the cursor goes inside, at the end of the body, ready to type.
			if (fenced && inside && lines.length >= 3) cursor = { line: cursor.line - 1, ch: lines[lines.length - 2].length };
			else if (fenced) cursor = { line: cursor.line + 1, ch: 0 };
		}
		editor.replaceRange(out, start, end);
		editor.setCursor(cursor);
	}

	private searchMonsters(q: string, limit = 30): MonsterIndexEntry[] {
		const query = q.trim().toLowerCase();
		const all = this.plugin.index.all();
		if (!query) return all.slice(0, limit);
		const words = query.split(/\s+/);
		return all
			.filter(e => words.every(w => e.name.toLowerCase().includes(w) || (e.monster.group || '').toLowerCase().includes(w)))
			.sort((a, b) => {
				const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
				return (an.startsWith(query) ? 0 : an.includes(query) ? 1 : 2) - (bn.startsWith(query) ? 0 : bn.includes(query) ? 1 : 2) || an.length - bn.length;
			})
			.slice(0, limit);
	}

	private monsterBadge(e: MonsterIndexEntry) {
		const lvl = formatLevel(e.monster.level);
		return { text: e.bundled ? (e.monster.source?.startsWith('GM') ? 'GMG' : 'M&M') : 'note', cls: lvl ? '' : 'is-muted' };
	}

	private monsterItems(q: string, mode: 'ref' | 'statblock'): SlashItem[] {
		return this.searchMonsters(q).map(e => ({
			icon: mode === 'ref' ? 'skull' : 'scroll-text',
			title: e.name,
			detail: describeMonster(e),
			badge: this.monsterBadge(e),
			run: (editor, start, end) => {
				if (mode === 'ref') this.write(editor, start, end, `\`nimble:${e.name}\` `);
				else this.write(editor, start, end, `\`\`\`nimble\n${toStatblockSource(e.monster)}\n\`\`\``, true);
			},
		}));
	}

	private addItems(arg: string): SlashItem[] {
		const m = arg.match(/^(\d+)\s*[x×]?\s*(.*)$/i);
		const count = m ? Math.max(1, Number(m[1])) : 1;
		const q = m ? m[2] : arg;
		return this.searchMonsters(q, 20).map(e => ({
			icon: 'swords',
			title: `Add ${count} × ${e.name}`,
			detail: describeMonster(e),
			badge: this.monsterBadge(e),
			run: (editor, start, end) => {
				editor.replaceRange('', start, end);
				void this.plugin.addToEncounter(e.monster, e.filePath || undefined, count);
			},
		}));
	}

	private encounterItems(arg: string): SlashItem[] {
		const parts = arg.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
		const def: EncounterDef = { name: 'New encounter', party: this.plugin.settings.party.length > 0, monsters: [] };
		const missing: string[] = [];
		for (const part of parts) {
			const parsed = parseMonsterLine(part);
			if (!parsed) continue;
			const hit = this.plugin.index.get(parsed.name) ?? this.searchMonsters(parsed.name, 1)[0];
			if (!hit) { missing.push(parsed.name); continue; }
			const ex = def.monsters.find(x => x.name === hit.name);
			if (ex) ex.count += parsed.count; else def.monsters.push({ name: hit.name, count: parsed.count });
		}
		const groups = def.monsters.map(x => ({ monster: this.plugin.index.get(x.name)!.monster, count: x.count }));
		const rating = rateEncounter(groups, partyLevels(this.plugin));
		const items: SlashItem[] = [];
		const insert = (d: EncounterDef): SlashItem['run'] => (editor, start, end) =>
			this.write(editor, start, end, `\`\`\`nimble-encounter\n${encounterBlockSource(d)}\n\`\`\``, true);
		if (def.monsters.length) {
			items.push({
				icon: 'shield-alert',
				title: def.monsters.map(x => `${x.count} ${x.name}`).join(', '),
				detail: `Insert encounter block · ${rating.value.toFixed(1)} of ${rating.budget} budget${missing.length ? ` · not found: ${missing.join(', ')}` : ''}`,
				badge: { text: `${rating.label} ${Math.round(rating.pct * 100)}%`, cls: `diff-${rating.label.toLowerCase().replace(/\s+/g, '-')}` },
				run: insert(def),
			});
			items.push({
				icon: 'play', title: 'Insert and run it now', detail: '',
				run: (editor, start, end) => {
					insert(def)!(editor, start, end);
					for (const g of def.monsters) {
						const e = this.plugin.index.get(g.name);
						if (e) this.plugin.encounters.add(e.monster, e.filePath || undefined, g.count);
					}
					void this.plugin.showTracker();
				},
			});
		} else {
			items.push({ icon: 'shield-alert', title: 'Empty encounter block', detail: 'e.g. 3 goblin, 2 wolf', run: insert({ ...def, monsters: [] }) });
		}
		items.push({ icon: 'scale', title: 'Open the encounter builder…', detail: '', run: (editor, start, end) => { editor.replaceRange('', start, end); new BuilderModal(this.plugin, def.monsters.length ? def : undefined).open(); } });
		return items;
	}

	private conditionItems(q: string): SlashItem[] {
		const query = q.trim().toLowerCase();
		return this.plugin.getAllConditions()
			.filter((c: NimbleCondition) => !c.auto && (!query || c.name.toLowerCase().includes(query)))
			.map(c => ({
				icon: 'activity',
				title: c.name,
				detail: c.description,
				run: (editor: Editor, start: EditorPosition, end: EditorPosition) => this.write(editor, start, end, `> [!nimble-condition] ${c.name}${c.hasValue ? ' X' : ''}\n> ${c.description}`, true),
			}));
	}

	private boxItems(q: string): SlashItem[] {
		const query = q.trim().toLowerCase();
		return Object.entries(BOX_PRESETS)
			.filter(([id, p]) => !query || id.includes(query) || p.label.toLowerCase().includes(query) || p.aliases?.some(a => a.includes(query)))
			.map(([id, p]) => ({
				icon: p.icon,
				title: p.label,
				detail: p.desc,
				badge: { text: '', color: boxColor(p.color) },
				run: (editor: Editor, start: EditorPosition, end: EditorPosition) => this.write(editor, start, end, newBox(id), true, true),
			}));
	}

	/** NPCs in the active campaign (or anywhere), plus "create one". */
	private npcItems(q: string): SlashItem[] {
		const query = q.trim().toLowerCase();
		const store = this.plugin.campaigns;
		const here = this.app.workspace.getActiveFile()?.path;
		const camp = here ? store.of(here) : store.active;
		const pool = store.npcs.filter(n => !camp || n.campaign === camp.folder || !n.campaign);
		const hits = pool
			.filter(n => !query || n.name.toLowerCase().includes(query) || n.aliases.some(a => a.toLowerCase().includes(query)))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 30);
		const items: SlashItem[] = hits.map(n => ({
			icon: 'user-round',
			title: n.name,
			detail: [n.role, n.aliases.length ? `aka ${n.aliases.join(', ')}` : ''].filter(Boolean).join(' · ') || 'NPC',
			run: (editor: Editor, start: EditorPosition, end: EditorPosition) => this.write(editor, start, end, `[[${n.name}]]`),
		}));
		const name = q.trim();
		if (name && camp && !hits.some(n => n.name.toLowerCase() === query)) {
			items.push({
				icon: 'user-plus',
				title: `New NPC "${name}"`,
				detail: `Creates ${camp.name}/NPCs/${safeName(name)} and links it`,
				run: (editor: Editor, start: EditorPosition, end: EditorPosition) => {
					this.write(editor, start, end, `[[${safeName(name)}]]`);
					void store.createInSection(camp, 'npc', name).then(() => new Notice(`Created NPC ${name}`));
				},
			});
		}
		items.push({
			icon: 'id-card',
			title: 'NPC card',
			detail: '',
			run: (editor: Editor, start: EditorPosition, end: EditorPosition) => this.write(editor, start, end, newBox('npc'), true, true),
		});
		return items;
	}

	private imageItems(q: string): SlashItem[] {
		const query = q.trim().toLowerCase();
		const images = this.app.vault.getFiles().filter((f: TFile) => /^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension) && (!query || f.path.toLowerCase().includes(query)));
		const items: SlashItem[] = images.slice(0, 30).map(f => ({
			icon: 'map',
			title: f.name,
			detail: f.parent?.path && f.parent.path !== '/' ? f.parent.path : 'Vault root',
			run: (editor: Editor, start: EditorPosition, end: EditorPosition) => this.write(editor, start, end, `\`\`\`nimble-map\nimage: [[${f.name}]]\npins:\n\`\`\``, true),
		}));
		if (!items.length) items.push({ icon: 'map', title: 'Map block', detail: 'No image found', run: (e, s, en) => this.write(e, s, en, '```nimble-map\nimage: [[map.png]]\npins:\n```', true) });
		return items;
	}

	private diceItems(arg: string): SlashItem[] {
		const expr = arg.trim().replace(/\s+/g, '') || '1d20';
		const dice = parseDice(expr);
		if (!dice) return [{ icon: 'dices', title: `Can't roll "${arg.trim()}"`, detail: 'Try 2d6+3, d20, 4d4-1' }];
		return [
			{
				icon: 'dices', title: `Roll ${expr}`, detail: '',
				run: (editor, start, end) => {
					const r = this.plugin.rollDice(expr, `Roll ${expr}`, 'effect');
					editor.replaceRange(r ? `🎲 ${r.expression} → **${r.total}** (${r.detail})` : '', start, end);
				},
			},
			{
				icon: 'swords', title: `Attack roll ${expr}`, detail: '',
				run: (editor, start, end) => {
					const r = this.plugin.rollDice(expr, `Attack ${expr}`, 'attack');
					editor.replaceRange(r ? `🎲 ${r.expression} → **${r.outcome === 'miss' ? 'MISS' : r.total}**${r.outcome === 'crit' ? ' (crit!)' : ''} (${r.detail})` : '', start, end);
				},
			},
		];
	}
}
