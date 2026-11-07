// "Type a slash. Get a tool." A small note on the landing page where "/" opens
// the plugin's slash menu. Command names, icons and descriptions are the real
// ones (src/slash.ts, src/box-def.ts), and every pick renders with the
// plugin's own code: rated encounter blocks, stat blocks, dice and boxes.

import './obsidian-shim';
import { setIcon } from 'obsidian';
import { renderStatblock, DiceKind } from '../src/render';
import { appendRichText } from '../src/markdown';
import { extractNimbleBlocks, parseStatblock, toStatblockSource } from '../src/parser';
import { formatLevel, monsterRole, rateEncounter } from '../src/rules';
import { DiceResult, parseDice, rollNimbleAttack, rollPlain } from '../src/dice';
import { dice3dSupported, roll3d, diceForRoll } from '../src/dice3d';
import { ratingChip } from '../src/encounter-block';
import { encounterBlockSource, EncounterDef, parseMonsterLine } from '../src/encounter-def';
import { BOX_PRESETS, boxColor, resolveBox } from '../src/box-def';
import { describeMonster } from '../src/suggest';
import type { MonsterIndexEntry, NimbleMonster } from '../src/types';

import hound from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Hound.md';
import construct from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Construct.md';
import droplet from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Droplet.md';
import phantom from '../sample-vault/Campaigns/The Old Quarter/Monsters/Ash Phantom.md';
import ooze from '../sample-vault/Campaigns/The Old Quarter/Monsters/Mercury Ooze.md';
import elemental from '../sample-vault/Campaigns/The Old Quarter/Monsters/Mercury Elemental.md';

// ---------------------------------------------------------------------------
// Shared with tiles.ts: dice, the roll notice and boxes.

const DICE_COLORS = { primaryColor: '#f2621a', diceColor: '#ece6d8', explosionColor: '#ff3d2e' };

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Roll with the plugin's rules. When `threeD` (and WebGL, and motion is welcome), 3D dice show it; `landed` resolves when they settle. */
export function roll(expression: string, kind: DiceKind = 'effect', threeD = true): { result: DiceResult; landed: Promise<unknown> } | null {
	const dice = parseDice(expression);
	if (!dice) return null;
	const nimble = kind === 'attack';
	const result = nimble ? rollNimbleAttack(dice) : rollPlain(dice);
	let landed: Promise<unknown> = Promise.resolve();
	if (threeD && dice3dSupported()) {
		const d3 = diceForRoll(dice.sides, dice.count, result.rolls, nimble, 'lava');
		const thrown = roll3d(d3, { ...DICE_COLORS, materials: { primary: 'classic', normal: 'classic', explosion: 'lava' } }).catch(() => undefined);
		// Background tabs pause animation, so don't wait forever for the dice to land.
		landed = Promise.race([thrown, new Promise(r => window.setTimeout(r, activeDocument.hidden ? 500 : 20000))]);
	}
	return { result, landed };
}

/** The plugin's roll notice body (same markup as logRoll). */
export function rollNotice(parent: HTMLElement, label: string, r: DiceResult): HTMLElement {
	const body = parent.createDiv({ cls: r.outcome ? ['nimble-roll-notice', `is-${r.outcome}`] : 'nimble-roll-notice' });
	body.createDiv({ cls: 'nimble-roll-notice-label', text: label });
	body.createDiv({ cls: 'nimble-roll-notice-total', text: r.outcome === 'miss' ? 'MISS' : r.outcome === 'crit' ? `${r.total} CRIT!` : String(r.total) });
	body.createDiv({ cls: 'nimble-roll-notice-detail', text: `${r.expression}: ${r.detail}` });
	return body;
}

type OnDice = (el: HTMLElement, expression: string) => void;

/** A ```box with the plugin's markup and its preset's icon, colour, style and font. */
export function renderBox(parent: HTMLElement, type: string, text: string, onDice?: OnDice): HTMLElement {
	const r = resolveBox({ type });
	const box = parent.createDiv({ cls: `nimble-box box-${r.type} box-style-${r.style} box-font-${r.font}` });
	box.style.setProperty('--box-color', boxColor(r.color));
	box.toggleClass('is-italic', r.italic);
	const head = box.createDiv({ cls: 'nimble-box-head' });
	setIcon(head.createSpan({ cls: 'nimble-box-icon', attr: { 'aria-hidden': 'true' } }), r.icon);
	head.createDiv({ cls: 'nimble-box-title', text: r.title });
	const body = box.createDiv({ cls: 'nimble-box-body markdown-rendered' });
	let list: HTMLElement | null = null;
	for (const line of text.split('\n')) {
		const item = line.match(/^[-*]\s+(.*)$/);
		if (item) { list ??= body.createEl('ul'); appendRichText(list.createEl('li'), item[1], { onDice }); continue; }
		list = null;
		if (line.trim()) appendRichText(body.createEl('p'), line, { onDice });
	}
	return box;
}

// ---------------------------------------------------------------------------
// Monsters from the sample vault, parsed by the plugin's parser.

const entries: MonsterIndexEntry[] = [hound, construct, droplet, phantom, ooze, elemental]
	.map(md => parseStatblock(extractNimbleBlocks(md)[0] ?? ''))
	.filter((m): m is NimbleMonster => !!m)
	.map(monster => ({ name: monster.name, filePath: `Monsters/${monster.name}.md`, monster }));

/** Same search as the plugin's slash menu. */
function searchMonsters(q: string, limit = 30): MonsterIndexEntry[] {
	const query = q.trim().toLowerCase();
	if (!query) return entries.slice(0, limit);
	const words = query.split(/\s+/);
	return entries
		.filter(e => words.every(w => e.name.toLowerCase().includes(w)))
		.sort((a, b) => {
			const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
			return (an.startsWith(query) ? 0 : an.includes(query) ? 1 : 2) - (bn.startsWith(query) ? 0 : bn.includes(query) ? 1 : 2) || an.length - bn.length;
		})
		.slice(0, limit);
}

const PARTY = [2, 2, 2, 2];

const app = {
	workspace: { openLinkText: async () => undefined, trigger: () => undefined },
	metadataCache: { getFirstLinkpathDest: () => null },
};

// ---------------------------------------------------------------------------
// Commands: a handful of the plugin's, with its names, aliases, icons and text.

type Arg = 'list' | 'monster' | 'dice';
interface Cmd { name: string; aliases?: string[]; icon: string; desc: string; hint?: string; arg?: Arg; example?: string; box?: string }
interface Item { icon: string; title: string; detail?: string; badge?: { text: string; cls?: string; color?: string }; complete?: string; select?: [number, number]; run?: () => void }

const boxCmd = (id: string): Cmd => ({ name: id, aliases: BOX_PRESETS[id].aliases, icon: BOX_PRESETS[id].icon, desc: BOX_PRESETS[id].desc, box: id });

// In the plugin's menu order.
const CMDS: Cmd[] = [
	{ name: 'encounter', aliases: ['enc'], icon: 'shield-alert', desc: 'Encounter block', hint: '/encounter 3 goblin, 2 wolf', arg: 'list', example: '4 hound' },
	boxCmd('read-aloud'),
	boxCmd('treasure'),
	{ name: 'statblock', aliases: ['sb', 'block'], icon: 'scroll-text', desc: 'Full stat block', hint: '/statblock krogg', arg: 'monster', example: 'hound' },
	{ name: 'roll', aliases: ['r', 'dice'], icon: 'dices', desc: 'Roll and write the result', hint: '/roll 2d6+3', arg: 'dice', example: '2d6' },
	boxCmd('trap'),
	boxCmd('clue'),
];

const BOX_TEXT: Record<string, string> = {
	'read-aloud': 'Stone steps descend into darkness, each tread marked with alchemical symbols that pulse weakly when touched. A brass brazier burns with green flame.',
	treasure: '- **Silver ring** (300 gp), glinting beneath the mercury.\n- **3 random potions**, in the one crate that doesn\'t smoke.',
	trap: '**Trigger:** opening more than two crates.\n**Effect:** STR save DC 15 or take 3d6 poison damage.',
	clue: 'The chains hang in the same pattern as the silver inlay in the Sacred Circle. **Lore** DC 12 finds its weak point.',
};

function commandMatches(c: Cmd, q: string): number {
	const names = [c.name, ...(c.aliases || [])];
	if (!q) return 1;
	if (names.some(n => n === q)) return 0;
	if (names.some(n => n.startsWith(q))) return 1;
	if (names.some(n => n.includes(q)) || c.desc.toLowerCase().includes(q)) return 2;
	return -1;
}

// ---------------------------------------------------------------------------
// The playground.

function build(root: HTMLElement): void {
	root.empty();
	root.addClass('is-live');
	const win = root.createDiv({ cls: 'sd-window obs' });
	const tabs = win.createDiv({ cls: 'sd-tabs' });
	tabs.createDiv({ cls: 'obs-dots', attr: { 'aria-hidden': 'true' } }).append(createSpan(), createSpan(), createSpan());
	tabs.createDiv({ cls: 'sd-tab', text: 'Session prep' });

	const scroller = win.createDiv({ cls: 'sd-scroll' });
	const note = scroller.createDiv({ cls: 'sd-note markdown-rendered' });
	note.createEl('h1', { text: 'Session prep' });
	const blocksEl = note.createDiv({ cls: 'sd-blocks', attr: { 'aria-live': 'polite' } });
	const line = note.createDiv({ cls: 'sd-line' });
	const input = line.createEl('input', {
		cls: 'sd-input',
		attr: {
			type: 'text', placeholder: 'Type / to start', 'aria-label': 'Note line. Type / for commands',
			autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'enter',
			role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'sd-menu-list',
		},
	});
	// After the input, so the CSS can hide it while the input has focus or text.
	line.createSpan({ cls: 'sd-caret', attr: { 'aria-hidden': 'true' } });

	const menu = win.createDiv({ cls: 'suggestion-container sd-menu', attr: { hidden: 'true' } });
	const list = menu.createDiv({ cls: 'suggestion', attr: { id: 'sd-menu-list', role: 'listbox', 'aria-label': 'Slash commands' } });
	const instructions = menu.createDiv({ cls: 'prompt-instructions' });
	for (const [k, v] of [['↑↓', 'navigate'], ['↵', 'choose'], ['esc', 'dismiss']]) {
		const i = instructions.createDiv({ cls: 'prompt-instruction' });
		i.createSpan({ cls: 'prompt-instruction-command', text: k });
		i.createSpan({ text: v });
	}
	const notices = win.createDiv({ cls: 'sd-notices', attr: { 'aria-live': 'polite' } });

	const bar = root.createDiv({ cls: 'sd-bar' });
	const key = bar.createEl('button', { cls: 'sd-key', text: '/', attr: { type: 'button', 'aria-label': 'Type a slash' } });
	const hint = bar.createDiv({ cls: 'sd-hint' });
	hint.appendText('Try ');
	hint.createEl('code', { text: '/encounter 2 hound, 1 ooze' });
	hint.appendText(' or ');
	hint.createEl('code', { text: '/roll 4d6' });
	const reset = bar.createEl('button', { cls: 'sd-reset', attr: { type: 'button' } });
	setIcon(reset.createSpan({ cls: 'sd-reset-icon', attr: { 'aria-hidden': 'true' } }), 'rotate-ccw');
	reset.appendText('Reset');

	// ---- Menu state ----
	let items: Item[] = [];
	let selected = 0;
	let dismissed = false;
	const coarse = window.matchMedia('(pointer: coarse)').matches;

	const isOpen = () => !menu.hasAttribute('hidden');
	const close = () => {
		menu.setAttribute('hidden', 'true');
		input.setAttr('aria-expanded', 'false');
		input.removeAttribute('aria-activedescendant');
	};

	function suggestions(value: string): Item[] | null {
		const m = value.match(/^\/([a-z-]*)(?: ([^/]*))?$/i);
		if (!m) return null;
		const head = m[1].toLowerCase();
		const arg = m[2];
		if (arg === undefined) {
			const found = CMDS
				.map((c, i) => ({ c, i, score: commandMatches(c, head) }))
				.filter(x => x.score >= 0)
				.sort((a, b) => a.score - b.score || a.i - b.i)
				.map(({ c }) => commandItem(c));
			return found.length ? found : [{ icon: 'search', title: `No command "/${head}" here`, detail: 'This demo has encounter, statblock, roll and four box types' }];
		}
		const cmd = CMDS.find(c => c.name === head || c.aliases?.includes(head));
		if (!cmd) return null;
		if (!cmd.arg) return [commandItem(cmd)];
		if (cmd.arg === 'list') return encounterItems(arg);
		if (cmd.arg === 'monster') return monsterItems(arg);
		return diceItems(arg);
	}

	function commandItem(c: Cmd): Item {
		const item: Item = { icon: c.icon, title: `/${c.name}`, detail: c.hint ? `${c.desc} · ${c.hint}` : c.desc };
		if (c.arg) {
			const base = `/${c.name} `;
			item.complete = base + (c.example ?? '');
			item.select = [base.length, item.complete.length];
		}
		if (c.box) item.run = () => insertBox(c.box!);
		return item;
	}

	function encounterItems(arg: string): Item[] {
		const def: EncounterDef = { name: 'New encounter', party: true, monsters: [] };
		const missing: string[] = [];
		for (const part of arg.split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
			const parsed = parseMonsterLine(part);
			if (!parsed) continue;
			const hit = searchMonsters(parsed.name, 1)[0];
			if (!hit) { missing.push(parsed.name); continue; }
			const ex = def.monsters.find(x => x.name === hit.name);
			if (ex) ex.count += parsed.count; else def.monsters.push({ name: hit.name, count: Math.min(parsed.count, 20) });
		}
		if (!def.monsters.length) {
			return [{ icon: 'shield-alert', title: 'Empty encounter block', detail: missing.length ? `Not in this demo: ${missing.join(', ')}. Try hound, construct, ooze or phantom` : 'e.g. 3 hound, 1 construct', run: () => insertEncounter(def) }];
		}
		const rating = rateEncounter(groups(def), PARTY);
		return [{
			icon: 'shield-alert',
			title: def.monsters.map(x => `${x.count} ${x.name}`).join(', '),
			detail: `Insert encounter block · ${rating.value.toFixed(1)} of ${rating.budget} budget${missing.length ? ` · not found: ${missing.join(', ')}` : ''}`,
			badge: { text: `${rating.label} ${Math.round(rating.pct * 100)}%`, cls: `diff-${rating.label.toLowerCase().replace(/\s+/g, '-')}` },
			run: () => insertEncounter(def),
		}];
	}

	function monsterItems(arg: string): Item[] {
		const found = searchMonsters(arg);
		if (!found.length) return [{ icon: 'search', title: `No "${arg.trim()}" in this demo`, detail: 'Try hound, construct, ooze or phantom' }];
		return found.map(e => ({
			icon: 'scroll-text', title: e.name, detail: describeMonster(e), badge: { text: 'note' },
			run: () => insertStatblock(e),
		}));
	}

	function diceItems(arg: string): Item[] {
		const expr = arg.trim().replace(/\s+/g, '') || '1d20';
		if (!parseDice(expr)) return [{ icon: 'dices', title: `Can't roll "${arg.trim()}"`, detail: 'Try 2d6+3, d20, 4d4-1' }];
		return [
			{ icon: 'dices', title: `Roll ${expr}`, detail: '', run: () => insertRoll(expr, 'effect') },
			{ icon: 'swords', title: `Attack roll ${expr}`, detail: 'Nimble rules: a 1 misses, max explodes', run: () => insertRoll(expr, 'attack') },
		];
	}

	function render(): void {
		list.empty();
		items.forEach((item, i) => {
			const el = list.createDiv({ cls: 'suggestion-item nimble-slash-item', attr: { id: `sd-opt-${i}`, role: 'option' } });
			if (!item.run && !item.complete) el.addClass('is-inert');
			setIcon(el.createDiv({ cls: 'nimble-slash-icon', attr: { 'aria-hidden': 'true' } }), item.icon);
			const text = el.createDiv({ cls: 'nimble-slash-text' });
			text.createDiv({ cls: 'nimble-slash-title', text: item.title });
			if (item.detail) text.createDiv({ cls: 'nimble-slash-detail', text: item.detail });
			if (item.badge?.color) el.createDiv({ cls: 'nimble-slash-swatch', attr: { style: `background: ${item.badge.color}` } });
			else if (item.badge) el.createDiv({ cls: `nimble-slash-badge ${item.badge.cls || ''}`, text: item.badge.text });
			el.addEventListener('mousemove', () => { if (selected !== i) { selected = i; highlight(); } });
			el.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the line
			el.addEventListener('click', () => choose(i));
		});
		highlight();
	}

	function highlight(): void {
		list.querySelectorAll<HTMLElement>('.suggestion-item').forEach((el, i) => {
			el.toggleClass('is-selected', i === selected);
			el.setAttr('aria-selected', String(i === selected));
		});
		const el = list.querySelector<HTMLElement>(`#sd-opt-${selected}`);
		if (!el) return;
		input.setAttr('aria-activedescendant', el.id);
		// Keep the selection in view without scrolling the page.
		if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 4;
		else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
	}

	function place(): void {
		const w = win.getBoundingClientRect();
		const l = input.getBoundingClientRect();
		const width = Math.min(380, w.width - 16);
		const left = Math.max(8, Math.min(l.left - w.left - 6, w.width - width - 8));
		menu.style.width = `${width}px`;
		menu.style.left = `${left}px`;
		const below = l.top - w.top < w.height * 0.55;
		menu.toggleClass('is-above', !below);
		if (below) { menu.style.top = `${l.bottom - w.top + 6}px`; menu.style.removeProperty('bottom'); }
		else { menu.style.bottom = `${w.bottom - l.top + 6}px`; menu.style.removeProperty('top'); }
	}

	function update(): void {
		const next = dismissed ? null : suggestions(input.value);
		if (!next) { close(); return; }
		const sameShape = isOpen() && next.length === items.length && next.every((x, i) => x.title === items[i].title);
		items = next;
		if (!sameShape) selected = 0;
		selected = Math.min(selected, items.length - 1);
		render();
		if (!isOpen()) {
			menu.removeAttribute('hidden');
			input.setAttr('aria-expanded', 'true');
		}
		place();
	}

	function choose(i: number): void {
		const item = items[i];
		if (!item) return;
		if (item.complete !== undefined) {
			input.value = item.complete;
			input.focus({ preventScroll: true });
			const [a, b] = item.select ?? [item.complete.length, item.complete.length];
			input.setSelectionRange(a, b);
			update();
			return;
		}
		if (!item.run) return;
		input.value = '';
		close();
		item.run();
		// Phones: drop the keyboard so the result is visible.
		if (coarse) input.blur();
	}

	input.addEventListener('input', () => { dismissed = false; update(); });
	input.addEventListener('focus', () => update());
	input.addEventListener('blur', () => close());
	input.addEventListener('keydown', (e) => {
		if (isOpen()) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
				highlight();
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				choose(selected);
				return;
			}
			if (e.key === 'Escape') { e.preventDefault(); dismissed = true; close(); return; }
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const text = input.value.trim();
			if (!text) return;
			input.value = '';
			const p = blocksEl.createEl('p', { cls: 'sd-block sd-text' });
			appendRichText(p, text, { onDice: wireDice });
			trim();
			scroller.scrollTop = scroller.scrollHeight;
		}
	});

	key.addEventListener('mousedown', (e) => e.preventDefault());
	key.addEventListener('click', () => {
		if (!input.value.startsWith('/')) input.value = '/';
		dismissed = false;
		scroller.scrollTop = Math.max(scroller.scrollTop, line.offsetTop + line.offsetHeight - scroller.clientHeight + 24);
		input.focus({ preventScroll: true });
		input.setSelectionRange(input.value.length, input.value.length);
		update();
	});

	reset.addEventListener('click', () => {
		blocksEl.empty();
		notices.empty();
		input.value = '';
		dismissed = false;
		close();
		scroller.scrollTop = 0;
	});

	// ---- Writing into the note ----

	const scrollTo = (top: number) => scroller.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });

	function trim(): void {
		while (blocksEl.children.length > 5) blocksEl.firstElementChild?.remove();
	}

	/** Show the Markdown that was written, then swap in what the plugin renders from it. */
	function insert(source: string, fill: (out: HTMLElement) => void, after?: () => void): void {
		const block = blocksEl.createDiv({ cls: 'sd-block' });
		const src = block.createDiv({ cls: 'sd-src' }).createDiv({ cls: 'sd-src-inner' });
		const code = src.createEl('pre').createEl('code');
		for (const l of source.split('\n')) {
			const row = code.createSpan({ cls: /^(```|…)/.test(l) ? 'sd-fence' : 'sd-md' });
			const kv = l.match(/^(\w[\w ]*:)(.*)$/);
			if (kv && !/^(```|…)/.test(l)) { row.createSpan({ cls: 'sd-yaml-key', text: kv[1] }); row.appendText(kv[2]); }
			else row.setText(l);
			code.appendText('\n');
		}
		const out = block.createDiv({ cls: 'sd-out' }).createDiv({ cls: 'sd-out-inner' });
		fill(out);
		trim();
		scrollTo(block.offsetTop - 12);
		window.setTimeout(() => {
			block.addClass('is-rendered');
			window.setTimeout(() => scrollTo(Math.max(0, block.offsetTop - 12)), reducedMotion() ? 0 : 420);
			after?.();
		}, reducedMotion() ? 450 : 900);
	}

	function insertBox(type: string): void {
		const text = BOX_TEXT[type] ?? '';
		insert(`\`\`\`box ${type}\n${text}\n\`\`\``, (out) => renderBox(out, type, text, wireDice));
	}

	const groups = (def: EncounterDef) => def.monsters.flatMap(m => {
		const e = entries.find(x => x.name === m.name);
		return e ? [{ monster: e.monster, count: m.count }] : [];
	});

	function insertEncounter(def: EncounterDef): void {
		insert(`\`\`\`nimble-encounter\n${encounterBlockSource(def)}\n\`\`\``, (out) => {
			const card = out.createDiv({ cls: 'nimble-encounter-block' });
			const head = card.createDiv({ cls: 'encounter-block-head' });
			setIcon(head.createSpan({ cls: 'encounter-block-icon' }), 'swords');
			head.createSpan({ cls: 'encounter-block-name', text: def.name });
			const rating = rateEncounter(groups(def), PARTY);
			if (def.monsters.length) ratingChip(head, rating.label, rating.pct);
			const listEl = card.createDiv({ cls: 'encounter-block-monsters' });
			for (const m of def.monsters) {
				const e = entries.find(x => x.name === m.name);
				const role = e ? monsterRole(e.monster) : 'unknown';
				const chip = listEl.createDiv({ cls: `encounter-chip role-${role}` });
				chip.createSpan({ cls: 'encounter-count', text: `${m.count}×` });
				const ref = chip.createSpan({ cls: `nimble-inline-ref role-${role}` });
				const lvl = e ? formatLevel(e.monster.level) : '';
				if (lvl) ref.createSpan({ cls: 'nimble-inline-level', text: role === 'minion' ? 'min' : lvl });
				ref.createSpan({ cls: 'nimble-inline-name', text: m.name });
			}
			if (!def.monsters.length) listEl.createDiv({ cls: 'encounter-block-empty', text: 'No monsters yet.' });
			card.createDiv({ cls: 'encounter-block-meta', text: `${rating.value.toFixed(1)} of ${/^(8|11|18)/.test(String(rating.budget)) ? 'an' : 'a'} ${rating.budget}-level budget · ${PARTY.length} heroes, level ${PARTY[0]}` });
			for (const w of rating.warnings) card.createDiv({ cls: 'encounter-block-warning', text: w });
		});
	}

	function insertStatblock(e: MonsterIndexEntry): void {
		const src = toStatblockSource(e.monster).split('\n');
		const shown = src.length > 6 ? [...src.slice(0, 5), `… ${src.length - 5} more lines`] : src;
		insert(`\`\`\`nimble\n${shown.join('\n')}\n\`\`\``, (out) => {
			renderStatblock(out, e.monster, { app: app as never, sourcePath: 'Session prep.md', variant: 'block', partySize: PARTY.length, onDice: (el, expr, label, kind) => wireDice(el, expr, label, kind) });
		});
	}

	function insertRoll(expr: string, kind: DiceKind): void {
		const rolled = roll(expr, kind);
		if (!rolled) return;
		const r = rolled.result;
		const text = kind === 'attack'
			? `🎲 ${r.expression} → **${r.outcome === 'miss' ? 'MISS' : r.total}**${r.outcome === 'crit' ? ' (crit!)' : ''} (${r.detail})`
			: `🎲 ${r.expression} → **${r.total}** (${r.detail})`;
		insert(text, (out) => appendRichText(out.createEl('p', { cls: 'sd-roll-line' }), text));
		void rolled.landed.then(() => notify(kind === 'attack' ? `Attack ${expr}` : `Roll ${expr}`, r));
	}

	function notify(label: string, r: DiceResult): void {
		const n = notices.createDiv({ cls: 'notice' });
		rollNotice(n, label, r);
		while (notices.children.length > 3) notices.firstElementChild?.remove();
		window.setTimeout(() => { n.addClass('is-leaving'); window.setTimeout(() => n.remove(), 300); }, 5000);
	}

	/** Dice in rendered blocks roll on click, like in the plugin. */
	function wireDice(el: HTMLElement, expression: string, label = '', kind: DiceKind = 'effect'): void {
		el.addClass('is-clickable');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		el.setAttr('title', `Roll ${expression}`);
		const go = (e: Event) => {
			e.preventDefault(); e.stopPropagation();
			const rolled = roll(expression, kind);
			if (rolled) void rolled.landed.then(() => notify(label || `Roll ${expression}`, rolled.result));
		};
		el.addEventListener('click', go);
		el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
	}

	window.addEventListener('resize', () => { if (isOpen()) place(); });
}

const root = activeDocument.getElementById('slash-demo');
if (root) build(root);
