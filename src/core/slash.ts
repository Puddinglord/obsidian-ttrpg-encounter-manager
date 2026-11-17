// "/" commands in the editor, for every game system. Core owns the menu
// (matching, the GM/player split, writing text and blocks where the slash was)
// and the commands every game shares: boxes, NPCs, quests, maps, the party,
// dice, conditions. Each game system adds its own through the contract
// (`slashCommands`); a system command with a base command's name replaces it.
//
//   /npc kevori       → [[Kevori]], or a new NPC
//   /quest caravan    → [[The Caravan]]
//   /read-aloud       → a read-aloud box, ready to type in
//   /roll 2d6+3       → rolls and writes the result

import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Notice, setIcon, TFile } from 'obsidian';
import type NimbleStatblocksPlugin from '../../main';
import { BOX_PRESETS, boxColor, newBox } from './box-def';
import { Campaign, fmText, homeFolderFor, NoteRef, questsIn, questState, safeName } from './campaign-model';
import { parseDice } from './dice';
import { insideCodeFence, placeBlock, slashQuery } from './markdown';
import { NPC_CARD_BLOCK } from './npc-card-def';
import { kindsOf, openBuilder } from './builder/frame';

/** One row in the menu. */
export interface SlashItem {
	icon: string;
	title: string;
	detail?: string;
	badge?: { text: string; cls?: string; color?: string };
	/** Choosing it completes the line to this ("/spell "), to type an argument. */
	complete?: string;
	run?: (w: SlashWriter) => void;
}

/** Where a chosen item writes: the slash text and what was typed after it. */
export interface SlashWriter {
	editor: Editor;
	start: EditorPosition;
	end: EditorPosition;
	/** The note the slash was typed in. */
	path?: string;
	/** Replace the slash text with `text`. A block goes on its own lines; `inside` puts the cursor in a fenced box's body. */
	write(text: string, o?: { block?: boolean; inside?: boolean }): void;
	/** Remove the slash text (before opening a dialog). */
	clear(): void;
}

export interface SlashCommand {
	name: string;
	aliases?: string[];
	icon: string;
	desc: string;
	/** Example shown next to commands that take an argument. */
	hint?: string;
	/** Only offered on one side of the table. */
	side?: 'gm' | 'player';
	/** Position in the bare "/" menu, if SLASH_ORDER doesn't list the name (lower first). */
	order?: number;
	/** Takes an argument: the rows for what's typed after the name ("" right after the space). */
	items?: (arg: string, ctx: SlashQuery) => SlashItem[];
	/** Chosen on its own (no argument typed yet). Unset with `items`: completes to "/name ". */
	run?: (w: SlashWriter) => void;
}

export interface SlashQuery {
	plugin: NimbleStatblocksPlugin;
	/** The note being edited. */
	path?: string;
	file: TFile | null;
}

/** The commands for a note: the base ones, then its system's (which win a name). */
export function commandsFor(plugin: NimbleStatblocksPlugin, path: string | undefined): SlashCommand[] {
	const side = plugin.playerView(path) ? 'player' : 'gm';
	const system = plugin.system(path).slashCommands?.(plugin) ?? [];
	const names = new Set(system.flatMap(c => [c.name, ...(c.aliases ?? [])]));
	const base = baseCommands(plugin, path).filter(c => !names.has(c.name));
	return [...system, ...base].filter(c => !c.side || c.side === side);
}

export function commandMatches(c: SlashCommand, q: string): number {
	const names = [c.name, ...(c.aliases || [])];
	if (!q) return 1;
	if (names.some(n => n === q)) return 0;
	if (names.some(n => n.startsWith(q))) return 1;
	if (names.some(n => n.includes(q)) || c.desc.toLowerCase().includes(q)) return 2;
	return -1;
}

/**
 * Menu order for a bare "/": what a GM reaches for at the table first. Names, so
 * every system's /monster or /spell lands in the same place. Unlisted commands
 * follow, in the order they're defined (the system's, then core's).
 */
export const SLASH_ORDER = ['monster', 'spell', 'item', 'feature', 'class', 'compendium', 'fought', 'add', 'encounter', 'read-aloud', 'look', 'treasure', 'npc', 'quest', 'npc-card', 'statblock', 'builder', 'party', 'tracker', 'bestiary', 'condition', 'roll', 'trap', 'secret', 'clue', 'checks', 'exits', 'box', 'map', 'legendary', 'minion', 'new-monster', 'summary', 'party-table', 'settings'];
const rank = (c: SlashCommand) => { const i = SLASH_ORDER.indexOf(c.name); return i !== -1 ? i : c.order ?? SLASH_ORDER.length; };

/** Rows for a query: the matching commands, or (after a space) the command's own rows. */
export function slashItems(plugin: NimbleStatblocksPlugin, query: string, path: string | undefined, file: TFile | null): SlashItem[] {
	const space = query.indexOf(' ');
	const head = (space === -1 ? query : query.slice(0, space)).toLowerCase();
	const arg = space === -1 ? null : query.slice(space + 1);
	const commands = commandsFor(plugin, path);
	if (arg === null) {
		return commands
			.map(c => ({ c, score: commandMatches(c, head) }))
			.filter(x => x.score >= 0)
			.sort((a, b) => a.score - b.score || rank(a.c) - rank(b.c))
			.map(({ c }) => commandItem(c));
	}
	const cmd = commands.find(c => c.name === head || c.aliases?.includes(head));
	if (!cmd) return [];
	return cmd.items ? cmd.items(arg, { plugin, path, file }) : [commandItem(cmd)];
}

function commandItem(c: SlashCommand): SlashItem {
	const item: SlashItem = { icon: c.icon, title: `/${c.name}`, detail: c.hint ? `${c.desc} · ${c.hint}` : c.desc };
	if (c.run) item.run = c.run;
	else if (c.items) item.complete = `/${c.name} `;
	return item;
}

/** Replace the slash text; blocks go on their own lines. The cursor lands at the end (or inside a box). */
export function writeAt(editor: Editor, start: EditorPosition, end: EditorPosition, text: string, block = false, inside = false): void {
	// A block typed in a callout, a list item or an indented line keeps that line's
	// prefix on every line, and goes below any text already on the line.
	const out = block ? placeBlock(editor.getLine(start.line).slice(0, start.ch), text) : text;
	const lines = out.split('\n');
	if (block) lines.pop(); // the line that follows the block
	let cursor = { line: start.line + lines.length - 1, ch: (lines.length === 1 ? start.ch : 0) + lines[lines.length - 1].length };
	if (block) {
		const fenced = /(?:^|\n)(```|~~~)[^\n]*$/.test(text);
		if (fenced && inside && lines.length >= 3) cursor = { line: cursor.line - 1, ch: lines[lines.length - 2].length };
		else if (fenced) cursor = { line: cursor.line + 1, ch: out.length - out.lastIndexOf('\n') - 1 };
	}
	editor.replaceRange(out, start, end);
	editor.setCursor(cursor);
}

export class SlashSuggest extends EditorSuggest<SlashItem> {
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
		// Only keep the menu open for things that are (or could become) our commands.
		const commands = commandsFor(this.plugin, this.app.workspace.getActiveFile()?.path);
		const query = slashQuery(before, (cmd, hasArg) => hasArg
			? commands.some(c => c.name === cmd || !!c.aliases?.includes(cmd))
			: commands.some(c => commandMatches(c, cmd) >= 0));
		if (query === null) return null;
		if (insideCodeFence(i => editor.getLine(i), cursor.line)) return null;
		return { start: { line: cursor.line, ch: cursor.ch - query.length - 1 }, end: cursor, query };
	}

	getSuggestions(ctx: EditorSuggestContext): SlashItem[] {
		return slashItems(this.plugin, ctx.query, ctx.file?.path, ctx.file);
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
		const { editor } = ctx;
		// Obsidian updates the context a moment after each keystroke, so a quick "/spell⏎" would still
		// hold the range of "/spel" and leave the last letter behind. Measure the range again.
		const fresh = this.onTrigger(editor.getCursor(), editor);
		const same = fresh && fresh.start.line === ctx.start.line && fresh.start.ch === ctx.start.ch;
		const { start, end } = same ? fresh : ctx;
		if (item.complete !== undefined) {
			editor.replaceRange(item.complete, start, end);
			editor.setCursor({ line: start.line, ch: start.ch + item.complete.length });
			return;
		}
		item.run?.({
			editor, start, end, path: ctx.file?.path,
			write: (text, o = {}) => writeAt(editor, start, end, text, o.block, o.inside),
			clear: () => editor.replaceRange('', start, end),
		});
	}
}

// ----------------------------------------------------------------------------
// The commands every game shares.

/** Insert a fixed text (no argument). */
const insert = (text: string | ((p: NimbleStatblocksPlugin, w: SlashWriter) => string | null), o: { block?: boolean; inside?: boolean } = {}) =>
	(plugin: NimbleStatblocksPlugin) => (w: SlashWriter) => {
		const t = typeof text === 'string' ? text : text(plugin, w);
		if (t === null) { w.clear(); return; }
		w.write(t, o);
	};

function baseCommands(plugin: NimbleStatblocksPlugin, path?: string): SlashCommand[] {
	const p = plugin;
	return [
		// What the note's system can build (core/builder): /new-monster, /new-spell… The block lands where the slash was.
		...kindsOf(p.system(path).id).map((k): SlashCommand => ({
			name: `new-${k.kind}`, aliases: [`build-${k.kind}`], icon: k.icon, desc: `Build a ${k.label.toLowerCase()} here`, side: k.kind === 'monster' ? 'gm' : undefined,
			run: (w) => {
				w.clear();
				const at = { ...w.start };
				openBuilder(p, { kind: k.kind, sourcePath: w.path, insert: (block) => writeAt(w.editor, at, at, block, true) });
			},
		})),
		{ name: 'npc', aliases: ['who'], icon: 'user-round', desc: 'Link an NPC, or create one', hint: '/npc kevori', items: (arg, q) => npcItems(p, arg, q.path) },
		{ name: 'quest', aliases: ['quests'], icon: 'flag', desc: 'Link a quest', hint: '/quest caravan', items: (arg, q) => questItems(p, arg, q.path) },
		{
			name: 'npc-card', aliases: ['portrait', 'character'], icon: 'contact-round', desc: 'NPC card with portrait',
			run: insert((pl, w) => {
				// In the NPC's own note the card takes the note's name. Anywhere else (a minor character in a scene) it needs its own.
				const own = !!w.path && pl.campaigns.npcs.some(n => n.path === w.path);
				return own ? NPC_CARD_BLOCK : NPC_CARD_BLOCK.replace('\n', '\nname: \n');
			}, { block: true })(p),
		},
		// /quest links a quest note, so the quest box goes by /hook (and /objective). /box quest still finds it.
		...Object.entries(BOX_PRESETS).filter(([id]) => id !== 'npc' && id !== 'note').map(([id, b]): SlashCommand => ({
			...(id === 'quest' ? { name: 'hook', aliases: (b.aliases ?? []).filter(a => a !== 'hook'), desc: 'A quest hook or objective box' } : { name: id, aliases: b.aliases, desc: b.desc }),
			icon: b.icon,
			run: insert(newBox(id), { block: true, inside: true })(p),
		})),
		{ name: 'box', aliases: ['callout'], icon: 'square-dashed', desc: 'Any box type', hint: '/box treasure', items: (arg) => boxItems(arg) },
		{ name: 'map', icon: 'map', desc: 'GM map with pins', hint: '/map hideout', items: (arg) => imageItems(p, arg) },
		{ name: 'roll', aliases: ['r', 'dice'], icon: 'dices', desc: 'Roll and write the result', hint: '/roll 2d6+3', items: (arg) => rollItems(p, arg) },
		{ name: 'condition', aliases: ['cond', 'status'], icon: 'activity', desc: 'Condition rules', hint: '/condition prone', items: (arg, q) => conditionItems(p, arg, q.path) },
		{ name: 'party', aliases: ['heroes', 'pc'], icon: 'user-cog', desc: 'Edit the party', run: (w) => { w.clear(); p.openParty(); } },
		{ name: 'tracker', side: 'gm', aliases: ['combat', 'initiative'], icon: 'swords', desc: 'Open the encounter tracker', run: (w) => { w.clear(); void p.openTracker(); } },
		{ name: 'bestiary', aliases: ['monsters', 'b', 'open-compendium'], icon: 'book-open', desc: 'Open the compendium tab', run: (w) => { w.clear(); void p.openSystemCompendium(); } },
		{ name: 'settings', aliases: ['options'], icon: 'settings', desc: 'Ember Vault settings', run: (w) => { w.clear(); p.openSettings(); } },
		{
			name: 'party-table', side: 'gm', icon: 'users-round', desc: 'Table of your heroes',
			run: insert((pl) => {
				if (!pl.settings.party.length) { new Notice('Set up your party first (/party)'); return null; }
				const def = pl.system().vocabulary?.defense ?? 'Defense';
				const rows = pl.settings.party.map(h => `| ${h.name} | ${h.className ?? ''} | ${h.level} | ${h.maxHp} | ${h.defense ?? ''} |`);
				return ['| Hero | Class | Level | HP | ' + def + ' |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
			}, { block: true })(p),
		},
	];
}

/** The note's system's conditions (and the GM's own), as a callout with the rules text. */
function conditionItems(plugin: NimbleStatblocksPlugin, q: string, path?: string): SlashItem[] {
	const query = q.trim().toLowerCase();
	const list = [...plugin.system(path).conditions(plugin.edition(path)), ...plugin.settings.customConditions];
	return list
		.filter(c => !c.auto && (!query || c.name.toLowerCase().includes(query)))
		.map(c => ({
			icon: 'activity',
			title: c.name,
			detail: c.description,
			run: (w: SlashWriter) => w.write(`> [!nimble-condition] ${c.name}${c.hasValue ? ' X' : ''}\n> ${c.description.replace(/\n/g, '\n> ')}`, { block: true }),
		}));
}

/** /roll: a plain roll. Systems replace /roll to add their own kinds (Nimble's attack rolls, 5e's advantage). */
export function rollItems(plugin: NimbleStatblocksPlugin, arg: string): SlashItem[] {
	const expr = arg.trim().replace(/\s+/g, '') || '1d20';
	if (!parseDice(expr)) return [{ icon: 'dices', title: `Can't roll "${arg.trim()}"`, detail: 'Try 2d6+3, d20, 4d4-1' }];
	return [plainRoll(plugin, expr)];
}

export function plainRoll(plugin: NimbleStatblocksPlugin, expr: string, label = `Roll ${expr}`, title = `Roll ${expr}`): SlashItem {
	return {
		icon: 'dices', title, detail: '',
		run: (w) => {
			const r = plugin.rollDice(expr, label, 'effect');
			w.write(r ? `🎲 ${r.expression} → **${r.total}** (${r.detail})` : '');
		},
	};
}

function boxItems(q: string): SlashItem[] {
	const query = q.trim().toLowerCase();
	return Object.entries(BOX_PRESETS)
		.filter(([id, p]) => !query || id.includes(query) || p.label.toLowerCase().includes(query) || p.aliases?.some(a => a.includes(query)))
		.map(([id, p]) => ({
			icon: p.icon,
			title: p.label,
			detail: p.desc,
			badge: { text: '', color: boxColor(p.color) },
			run: (w: SlashWriter) => w.write(newBox(id), { block: true, inside: true }),
		}));
}

/** NPCs in the note's campaign (or anywhere), plus "create one". */
function npcItems(plugin: NimbleStatblocksPlugin, q: string, here?: string): SlashItem[] {
	const query = q.trim().toLowerCase();
	const store = plugin.campaigns;
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
		run: (w: SlashWriter) => w.write(`[[${n.name}]]`),
	}));
	const name = q.trim();
	if (name && camp && !hits.some(n => n.name.toLowerCase() === query)) {
		items.push({
			icon: 'user-plus',
			title: `New NPC "${name}"`,
			detail: `Creates ${homeFolderFor(camp, 'npc', camp.folder).replace(/^.*\//, '')}/${safeName(name)} in ${camp.name} and links it`,
			run: (w: SlashWriter) => {
				w.write(`[[${safeName(name)}]]`);
				void store.createInSection(camp, 'npc', name).then(() => new Notice(`Created NPC ${name}`));
			},
		});
	}
	items.push({ icon: 'id-card', title: 'NPC card', detail: '', run: (w: SlashWriter) => w.write(newBox('npc'), { block: true, inside: true }) });
	return items;
}

/** Quests in this note's campaign (or the active one), open ones first, as links. */
function questItems(plugin: NimbleStatblocksPlugin, q: string, here = ''): SlashItem[] {
	const query = q.trim().toLowerCase();
	const store = plugin.campaigns;
	const app = plugin.app;
	const camp = (here && store.of(here)) || store.active;
	const pool: { n: NoteRef; c: Campaign }[] = camp ? questsIn(camp).map(n => ({ n, c: camp })) : store.campaigns.flatMap(c => questsIn(c).map(n => ({ n, c })));
	const name = (p: string) => p.replace(/^.*\//, '').replace(/\.md$/i, '');
	const plain = (v: unknown) => fmText(v).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim();
	const hits = pool.filter(({ n }) => !query || n.title.toLowerCase().includes(query) || name(n.path).toLowerCase().includes(query)).slice(0, 30);
	if (!hits.length) {
		return [{ icon: 'flag', title: query ? `No quest matches "${q.trim()}"` : 'No quests yet', detail: 'Make one with the + on the Quests folder in the Campaign panel' }];
	}
	return hits.map(({ n, c }) => {
		const file = app.vault.getFileByPath(n.path);
		const fm = (file && app.metadataCache.getFileCache(file)?.frontmatter) ?? {};
		const state = questState(n.status);
		const giver = plain(fm.giver);
		const link = file ? app.metadataCache.fileToLinktext(file, here) : name(n.path);
		return {
			icon: state === 'done' ? 'circle-check' : state === 'failed' ? 'circle-x' : 'flag',
			title: n.title,
			detail: [n.status, plain(fm.type), giver && `from ${giver}`, camp ? '' : c.name].filter(Boolean).join(' · ') || 'Quest',
			run: (w: SlashWriter) => w.write(n.title !== name(n.path) ? `[[${link}|${n.title}]]` : `[[${link}]]`),
		};
	});
}

function imageItems(plugin: NimbleStatblocksPlugin, q: string): SlashItem[] {
	const query = q.trim().toLowerCase();
	const images = plugin.app.vault.getFiles().filter((f: TFile) => /^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension) && (!query || f.path.toLowerCase().includes(query)));
	const items: SlashItem[] = images.slice(0, 30).map(f => ({
		icon: 'map',
		title: f.name,
		detail: f.parent?.path && f.parent.path !== '/' ? f.parent.path : 'Vault root',
		run: (w: SlashWriter) => w.write(`\`\`\`nimble-map\nimage: [[${f.name}]]\npins:\n\`\`\``, { block: true }),
	}));
	if (!items.length) items.push({ icon: 'map', title: 'Map block', detail: 'No image found', run: (w) => w.write('```nimble-map\nimage: [[map.png]]\npins:\n```', { block: true }) });
	return items;
}
