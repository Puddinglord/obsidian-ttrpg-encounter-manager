// The landing page's live demo: a scene note from the sample adventure, running
// the plugin's own stat block renderer, hover previews, dice rules, 3D dice and
// encounter maths in the browser. `obsidian` is aliased to ./obsidian-shim.

import './obsidian-shim';
import { setIcon, Notice, Events } from 'obsidian';
import { createInlineRef, HoverPreview } from '../src/inline-ref';
import { renderStatblock, DiceKind, RenderOptions } from '../src/render';
import { appendRichText } from '../src/markdown';
import { extractNimbleBlocks, parseStatblock } from '../src/parser';
import { monsterRole, rateEncounter, shiftMonster, shiftLabel, SHIFT_DAMAGE, SHIFT_HP } from '../src/rules';
import { parseDice, rollNimbleAttack, rollPlain } from '../src/dice';
import { dice3dSupported, roll3d, diceForRoll } from '../src/dice3d';
import { closePopover, isPopoverOpenFor, openPopover } from '../src/popover';
import { renderBalance } from '../src/balance-ui';
import { EncounterDef } from '../src/encounter-def';
import { DEFAULT_SETTINGS, MonsterIndexEntry, NIMBLE_CONDITIONS, NimbleMonster, NimbleStatblocksSettings, PartyMember, RollLogEntry } from '../src/types';
import { EncounterStore, isHero } from '../src/encounters';
import { EncounterTrackerView } from '../src/tracker-view';
import { keywordPattern } from '../src/markdown';
import sampleSettings from 'sample-vault-settings';

import hound from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Hound.md';
import construct from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Construct.md';
import droplet from '../sample-vault/Campaigns/The Old Quarter/Monsters/Quicksilver Droplet.md';
import phantom from '../sample-vault/Campaigns/The Old Quarter/Monsters/Ash Phantom.md';
import ooze from '../sample-vault/Campaigns/The Old Quarter/Monsters/Mercury Ooze.md';
import elemental from '../sample-vault/Campaigns/The Old Quarter/Monsters/Mercury Elemental.md';

const SOURCE = 'Q6 Storage Vault.md';

// ---------------------------------------------------------------------------
// Monsters, parsed from the sample vault's notes by the plugin's own parser.

const entries: MonsterIndexEntry[] = [hound, construct, droplet, phantom, ooze, elemental]
	.map(md => parseStatblock(extractNimbleBlocks(md)[0] ?? ''))
	.filter((m): m is NimbleMonster => !!m)
	.map(monster => ({ name: monster.name, filePath: `Monsters/${monster.name}.md`, monster }));
const byName = new Map(entries.map(e => [e.name.toLowerCase(), e]));

// ---------------------------------------------------------------------------
// Party and encounter state.

// The sample vault's party, plus a few spares when you add heroes.
const ROSTER: PartyMember[] = [
	...sampleSettings.party,
	{ id: 'hero-pell', name: 'Pell', className: 'Shepherd', level: 2, maxHp: 22, defense: 13, maxWounds: 6 },
	{ id: 'hero-orla', name: 'Orla', className: 'Shadowmancer', level: 2, maxHp: 16, defense: 12, maxWounds: 6 },
	{ id: 'hero-kit', name: 'Kit', className: 'Cheat', level: 2, maxHp: 17, defense: 13, maxWounds: 6 },
	{ id: 'hero-bram', name: 'Bram', className: 'Commander', level: 2, maxHp: 26, defense: 16, maxWounds: 6 },
];
const party = { heroes: 4, level: 2 };
const partyMembers = (): PartyMember[] => ROSTER.slice(0, party.heroes).map(h => ({ ...h, level: party.level, maxHp: Math.round(h.maxHp * (1 + (party.level - 2) * 0.4)) }));

const settings: NimbleStatblocksSettings = {
	...structuredClone(DEFAULT_SETTINGS),
	party: partyMembers(),
	encounters: [],
	activeEncounterId: '',
	rollLog: [],
	multipleEncounters: false,
	clickableDice: true,
};
const syncParty = () => { settings.party = partyMembers(); };

let def: EncounterDef = {
	name: 'Hounds among the crates',
	party: true,
	monsters: [{ name: 'Quicksilver Hound', count: 4 }],
	notes: 'They slip through the gaps between crates to come at heroes from two sides. When two are down, the rest flee through the copper tubes.',
};

// ---------------------------------------------------------------------------
// Dice: the plugin's rules decide the roll, 3D dice show it, a notice reports it.

const DICE_COLORS = { primaryColor: '#f2621a', diceColor: '#ece6d8', explosionColor: '#ff3d2e' };

const events = new Events();

/** Record a roll and show it once `wait` (the 3D dice) is done. Same as the plugin's logRoll. */
function logRoll(r: Omit<RollLogEntry, 'id' | 'time'>, wait?: Promise<unknown>): RollLogEntry {
	const entry: RollLogEntry = { id: Math.random().toString(36).slice(2), time: Date.now(), ...r };
	settings.rollLog = [entry, ...settings.rollLog].slice(0, 30);
	events.trigger('roll-log-changed');
	const show = () => {
		const frag = createFragment(f => {
			const body = f.createDiv({ cls: entry.outcome ? ['nimble-roll-notice', `is-${entry.outcome}`] : 'nimble-roll-notice' });
			body.createDiv({ cls: 'nimble-roll-notice-label', text: entry.label });
			body.createDiv({ cls: 'nimble-roll-notice-total', text: entry.outcome === 'miss' ? 'MISS' : entry.outcome === 'crit' ? `${entry.total} CRIT!` : String(entry.total) });
			body.createDiv({ cls: 'nimble-roll-notice-detail', text: `${entry.expression}: ${entry.detail}` });
		});
		new Notice(frag, 6000);
	};
	if (wait) void wait.then(show); else show();
	return entry;
}

/** The roll is decided by the plugin's rules; 3D dice just show it. Crits explode into extra dice. */
function rollDice(expression: string, label: string, kind: DiceKind = 'effect'): RollLogEntry | null {
	const dice = parseDice(expression);
	if (!dice) return null;
	const nimble = kind === 'attack';
	const result = nimble ? rollNimbleAttack(dice) : rollPlain(dice);
	markDone('dice');
	let landed: Promise<unknown> | undefined;
	if (dice3dSupported()) {
		const d3 = diceForRoll(dice.sides, dice.count, result.rolls, nimble, 'lava');
		const thrown = roll3d(d3, { ...DICE_COLORS, materials: { primary: 'classic', normal: 'classic', explosion: 'lava' } }).catch(() => undefined);
		// Background tabs pause animation, so don't wait forever for the dice to land.
		landed = Promise.race([thrown, new Promise(r => window.setTimeout(r, activeDocument.hidden ? 500 : 20000))]);
	}
	return logRoll({ label: label || result.expression, expression: result.expression, total: result.total, detail: result.detail, outcome: result.outcome }, landed);
}

function wireDice(el: HTMLElement, expression: string, label: string, kind: DiceKind): void {
	el.addClass('is-clickable');
	el.setAttr('role', 'button');
	el.setAttr('tabindex', '0');
	el.setAttr('title', `Roll ${expression}`);
	const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); rollDice(expression, label, kind); };
	el.addEventListener('click', go);
	el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
}

// ---------------------------------------------------------------------------
// Just enough of the plugin object for the shared UI modules.

const noop = () => undefined;
const plugin = {
	app: {
		workspace: { on: () => ({}), iterateAllLeaves: noop, openLinkText: async () => undefined, trigger: noop },
		vault: { cachedRead: async () => '' },
		metadataCache: { getFirstLinkpathDest: () => null },
	},
	manifest: { id: 'nimble-gm' },
	settings,
	events,
	encounters: null as unknown as EncounterStore,
	campaigns: null,
	rollDice,
	logRoll,
	clearRollLog: () => { settings.rollLog = []; events.trigger('roll-log-changed'); },
	getAllConditions: () => NIMBLE_CONDITIONS,
	condition: (name: string) => NIMBLE_CONDITIONS.find(c => c.name.toLowerCase() === name.toLowerCase()),
	conditionKeywords: () => keywordPattern(NIMBLE_CONDITIONS.filter(c => !c.auto).map(c => c.name)),
	showConditionInfo: (anchor: HTMLElement, name: string) => {
		const cond = plugin.condition(name);
		if (cond) openPopover(anchor, (el) => { el.addClass('condition-info'); el.createDiv({ cls: 'popover-title', text: cond.name }); el.createDiv({ cls: 'popover-body', text: cond.description }); }, { width: 280 });
	},
	openAddMonsterModal: () => { new Notice('In Obsidian, this opens a searchable list of all 525 monsters.'); },
	openParty: noop,
	openBestiary: noop,
	rerenderNotes: noop,
	activateEncounterView: async () => undefined,
	showTracker: async () => { showSide(true); },
	index: { ready: true, get: (n: string) => byName.get(n.toLowerCase()), all: () => entries },
	register: noop,
	registerEvent: noop,
	registerDomEvent: (el: EventTarget, type: string, cb: EventListener, opts?: AddEventListenerOptions) => el.addEventListener(type, cb, opts),
	hover: null as unknown as HoverPreview,
	monsterActions: (entry: MonsterIndexEntry) => [{ label: 'Add to fight', icon: 'plus', cls: 'mod-cta', onClick: () => { plugin.hover.hide(); addMonster(entry.name); } }],
	openMonster: noop,
	addToEncounter: (m: NimbleMonster) => { addMonster(m.name); },
	renderStatblock: (container: HTMLElement, monster: NimbleMonster, sourcePath: string, variant: RenderOptions['variant'], _onAdd?: unknown, extra: Partial<RenderOptions> = {}) =>
		renderStatblock(container, monster, { app: plugin.app as never, sourcePath, variant, onDice: wireDice, partySize: party.heroes, ...extra }),
};
plugin.hover = new HoverPreview(plugin as never);
plugin.encounters = new EncounterStore(() => settings, async () => undefined, () => ({ level: party.level, heroes: party.heroes }));
plugin.encounters.on('changed', () => {
	if (plugin.encounters.active?.creatures.some(c => !isHero(c) && c.currentHp < c.maxHp)) markDone('damage');
});

// ---------------------------------------------------------------------------
// The scene note.

function box(parent: HTMLElement, type: string, icon: string, color: string, title: string, fill: (body: HTMLElement) => void, font = 'sans'): void {
	const el = parent.createDiv({ cls: `nimble-box box-${type} box-style-card box-font-${font}` });
	el.style.setProperty('--box-color', color);
	const head = el.createDiv({ cls: 'nimble-box-head' });
	setIcon(head.createSpan({ cls: 'nimble-box-icon' }), icon);
	head.createDiv({ cls: 'nimble-box-title', text: title });
	fill(el.createDiv({ cls: 'nimble-box-body markdown-rendered' }));
}

function para(parent: HTMLElement, parts: (string | { ref: string } | { text: string })[]): HTMLElement {
	const p = parent.createEl('p');
	for (const part of parts) {
		if (typeof part === 'string') p.appendText(part);
		else if ('ref' in part) p.appendChild(createInlineRef(plugin as never, part.ref, SOURCE));
		else appendRichText(p, part.text, { onDice: (el, expr) => wireDice(el, expr, 'Toxic gas', 'effect') });
	}
	return p;
}

let encounterEl: HTMLElement;
let winEl: HTMLElement;
let sideEl: HTMLElement;

/** Narrow screens show the note or the tracker, one at a time. */
function showSide(on: boolean): void {
	winEl?.toggleClass('show-side', on);
	winEl?.querySelectorAll('.obs-tab').forEach(t => t.toggleClass('is-active', t.hasClass('is-tracker-tab') === on));
}

function addMonster(name: string): void {
	const hit = def.monsters.find(m => m.name.toLowerCase() === name.toLowerCase());
	def = { ...def, monsters: hit ? def.monsters.map(m => m === hit ? { ...m, count: m.count + 1 } : m) : [...def.monsters, { name, count: 1 }] };
	renderEncounter();
	encounterEl.addClass('is-bumped');
	window.setTimeout(() => encounterEl.removeClass('is-bumped'), 500);
}

function stepper(parent: HTMLElement, label: string, get: () => number, set: (n: number) => void, min: number, max: number): void {
	const row = parent.createDiv({ cls: 'ece-row' });
	row.createSpan({ cls: 'ece-label', text: label });
	const s = row.createDiv({ cls: 'ece-stepper' });
	const minus = s.createEl('button', { cls: 'ece-step', attr: { 'aria-label': `Fewer ${label}` } });
	setIcon(minus, 'minus');
	const n = s.createSpan({ cls: 'ece-n' });
	const plus = s.createEl('button', { cls: 'ece-step', attr: { 'aria-label': `More ${label}` } });
	setIcon(plus, 'plus');
	const refresh = () => { n.setText(String(get())); minus.disabled = get() <= min; plus.disabled = get() >= max; };
	minus.addEventListener('click', () => { set(get() - 1); refresh(); });
	plus.addEventListener('click', () => { set(get() + 1); refresh(); });
	refresh();
}

function renderEncounter(): void {
	encounterEl.empty();
	const card = encounterEl.createDiv({ cls: 'nimble-encounter-block' });
	const head = card.createDiv({ cls: 'encounter-block-head' });
	setIcon(head.createSpan({ cls: 'encounter-block-icon' }), 'swords');
	head.createSpan({ cls: 'encounter-block-name', text: def.name });

	const found = def.monsters.flatMap(m => { const e = byName.get(m.name.toLowerCase()); return e ? [{ monster: shiftMonster(e.monster, m.shift ?? 0), count: m.count }] : []; });
	const levels = partyMembers().map(p => p.level);
	const rating = rateEncounter(found, levels);
	const chip = head.createEl('button', { cls: `nimble-difficulty diff-${rating.label.toLowerCase().replace(/\s+/g, '-')} is-button`, attr: { 'aria-label': 'Balance', title: 'Balance' } });
	chip.createSpan({ text: `${rating.label} · ${Math.round(rating.pct * 100)}%` });
	setIcon(chip.createSpan({ cls: 'diff-chevron' }), 'sliders-horizontal');
	chip.addEventListener('click', (e) => {
		e.preventDefault(); e.stopPropagation();
		if (isPopoverOpenFor(chip)) { closePopover(); return; }
		openPopover(chip, (pop, close) => renderBalance(pop, plugin as never, def, (next) => { close(); def = next; renderEncounter(); }), { width: 340, cls: 'balance-popover' });
		markDone('balance');
	});

	const list = card.createDiv({ cls: 'encounter-block-monsters' });
	def.monsters.forEach((m, i) => {
		const entry = byName.get(m.name.toLowerCase());
		const c = list.createDiv({ cls: `encounter-chip role-${entry ? monsterRole(entry.monster) : 'unknown'}` });
		const count = c.createEl('button', { cls: 'encounter-count', attr: { 'aria-label': `${m.count} ${m.name}` } });
		count.createSpan({ cls: 'encounter-count-n', text: `${m.count}×` });
		if (m.shift) count.createSpan({ cls: `encounter-shift ${m.shift > 0 ? 'is-up' : 'is-down'}`, text: shiftLabel(m.shift) });
		count.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation();
			if (isPopoverOpenFor(count)) { closePopover(); return; }
			const minion = entry ? monsterRole(entry.monster) === 'minion' : false;
			const draft = { count: m.count, shift: m.shift ?? 0 };
			const save = () => { def = { ...def, monsters: draft.count ? def.monsters.map((x, j) => j === i ? { ...x, count: draft.count, shift: draft.shift || undefined } : x) : def.monsters.filter((_, j) => j !== i) }; };
			openPopover(count, (pop) => {
				pop.addClass('encounter-count-editor');
				pop.createDiv({ cls: 'popover-title', text: m.name });
				stepper(pop, 'How many', () => draft.count, (n) => { draft.count = n; }, 1, 12);
				const lvl = pop.createDiv({ cls: 'ece-row' });
				lvl.createSpan({ cls: 'ece-label', text: 'Level' });
				const seg = lvl.createDiv({ cls: 'ece-shift' });
				const hint = pop.createDiv({ cls: 'ece-hint' });
				const buttons = ([[-1, 'Weaker'], [0, 'As written'], [1, 'Tougher']] as [number, string][]).map(([v, label]) => {
					const b = seg.createEl('button', { cls: 'ece-shift-btn', text: label, attr: { 'data-shift': String(v) } });
					b.disabled = minion && v !== 0;
					b.addEventListener('click', () => { draft.shift = v; refresh(); });
					return b;
				});
				const refresh = () => {
					buttons.forEach(b => b.toggleClass('is-active', Number(b.dataset.shift) === draft.shift));
					hint.setText(minion ? 'Minions don\'t scale by level.'
						: draft.shift > 0 ? `+1 level: ${Math.round((SHIFT_HP - 1) * 100)}% more HP and +${SHIFT_DAMAGE} damage on every hit.`
							: draft.shift < 0 ? `−1 level: ${Math.round((1 - 1 / SHIFT_HP) * 100)}% less HP and −${SHIFT_DAMAGE} damage on every hit.`
								: 'Its stat block as written.');
				};
				const remove = pop.createEl('button', { cls: 'ece-remove', text: `Remove ${m.name}` });
				remove.addEventListener('click', () => { draft.count = 0; closePopover(); });
				refresh();
			}, { width: 280, onClose: () => { save(); renderEncounter(); } });
		});
		c.appendChild(createInlineRef(plugin as never, m.name, SOURCE));
	});
	const add = list.createEl('button', { cls: 'encounter-add demo-add', attr: { 'aria-label': 'Add a monster', title: 'Add a monster' } });
	setIcon(add, 'plus');
	add.addEventListener('click', (e) => {
		e.preventDefault(); e.stopPropagation();
		if (isPopoverOpenFor(add)) { closePopover(); return; }
		openPopover(add, (pop, close) => {
			pop.addClass('demo-pick');
			pop.createDiv({ cls: 'popover-title', text: 'Add a monster' });
			for (const e of entries) {
				const b = pop.createEl('button', { cls: 'demo-pick-item' });
				b.createSpan({ cls: 'demo-pick-lvl', text: monsterRole(e.monster) === 'minion' ? 'min' : String(e.monster.level ?? '') });
				b.createSpan({ text: e.name });
				b.addEventListener('click', () => { close(); addMonster(e.name); });
			}
		}, { width: 260 });
	});

	const meta = card.createDiv({ cls: 'encounter-block-meta' });
	meta.appendText(`${rating.value.toFixed(1)} of a ${rating.budget}-level budget · `);
	const who = meta.createEl('a', { cls: 'encounter-block-party', text: `${party.heroes} heroes, level ${party.level}`, attr: { href: '#', role: 'button' } });
	who.addEventListener('click', (e) => {
		e.preventDefault(); e.stopPropagation();
		if (isPopoverOpenFor(who)) { closePopover(); return; }
		openPopover(who, (pop) => {
			pop.addClass('encounter-count-editor');
			pop.createDiv({ cls: 'popover-title', text: 'Your party' });
			stepper(pop, 'Heroes', () => party.heroes, (n) => { party.heroes = n; syncParty(); }, 1, 8);
			stepper(pop, 'Level', () => party.level, (n) => { party.level = n; syncParty(); }, 1, 20);
		}, { width: 260, onClose: () => renderEncounter() });
		markDone('party');
	});
	for (const w of rating.warnings) card.createDiv({ cls: 'encounter-block-warning', text: w });
	if (def.notes) card.createDiv({ cls: 'encounter-block-notes', text: def.notes });

	const actions = card.createDiv({ cls: 'encounter-block-actions' });
	const run = actions.createEl('button', { cls: 'mod-cta encounter-run' });
	setIcon(run.createSpan({ cls: 'encounter-btn-icon' }), 'play');
	run.createSpan({ text: 'Run' });
	run.addEventListener('click', () => {
		plugin.encounters.loadTemplate({
			name: def.name,
			monsters: def.monsters.flatMap(m => { const e = byName.get(m.name.toLowerCase()); return e ? [{ monster: shiftMonster(e.monster, m.shift ?? 0), count: m.count, sourceFile: e.filePath }] : []; }),
			withParty: true,
		}, SOURCE);
		showSide(true);
		markDone('run');
		sideEl.addClass('is-flash');
		window.setTimeout(() => sideEl.removeClass('is-flash'), 700);
	});
}

// ---------------------------------------------------------------------------
// "Try it" checklist.

const done = new Set<string>();
function markDone(key: string): void {
	if (done.has(key)) return;
	done.add(key);
	activeDocument.querySelector(`.demo-try [data-try="${key}"]`)?.classList.add('is-done');
}

function build(root: HTMLElement): void {
	root.empty();
	root.addClass('is-live', 'obs');
	const win = winEl = root.createDiv({ cls: 'obs-window' });

	const tabs = win.createDiv({ cls: 'obs-tabs' });
	tabs.createDiv({ cls: 'obs-dots' }).append(createSpan(), createSpan(), createSpan());
	const tab = tabs.createEl('button', { cls: 'obs-tab is-active' });
	tab.createSpan({ text: 'Q6 Storage Vault' });
	setIcon(tab.createSpan({ cls: 'obs-tab-x' }), 'x');
	tab.addEventListener('click', () => showSide(false));
	const trackerTab = tabs.createEl('button', { cls: 'obs-tab is-tracker-tab' });
	setIcon(trackerTab.createSpan({ cls: 'obs-tab-icon' }), 'swords');
	trackerTab.createSpan({ text: 'Tracker' });
	trackerTab.addEventListener('click', () => showSide(true));
	setIcon(tabs.createSpan({ cls: 'obs-tab-new' }), 'plus');

	const bodyWrap = win.createDiv({ cls: 'obs-body' });
	const ribbon = bodyWrap.createDiv({ cls: 'obs-ribbon' });
	for (const i of ['book-open', 'swords', 'dice-5', 'users']) setIcon(ribbon.createSpan(), i);

	const view = bodyWrap.createDiv({ cls: 'obs-view' });
	view.createDiv({ cls: 'obs-crumbs', text: 'Campaigns / The Old Quarter / 1 The Quicksilver Vaults / Q6 Storage Vault' });
	const note = view.createDiv({ cls: 'obs-note markdown-rendered', attr: { 'data-source-path': SOURCE } });
	note.createEl('h1', { text: 'Q6 Storage Vault' });

	box(note, 'read-aloud', 'book-open-text', '#7c5ce0', 'Read aloud', (b) => {
		b.createEl('p', { text: 'Metal-bound crates leak coloured smoke, each a different hue. Glass jars line copper shelves, holding preserved specimens that still move.' });
	}, 'serif');

	para(note, ['Four ', { ref: 'Quicksilver Hound' }, ' lurk among the crates. They formed from spilled mercury, and they hunt as a pack. If the fight drags on, a ', { ref: 'Quicksilver Construct' }, ' lumbers in from the north.']);

	encounterEl = note.createDiv({ cls: 'demo-encounter' });
	renderEncounter();

	box(note, 'trap', 'triangle-alert', '#d9534f', 'Toxic gas', (b) => {
		para(b, [{ text: '**Trigger:** opening more than two crates.' }]);
		para(b, [{ text: '**Effect:** every creature in the room makes a STR save DC 15 or takes 3d6 poison damage.' }]);
	});

	box(note, 'treasure', 'gem', '#c89a2c', 'Treasure', (b) => {
		para(b, [{ text: '**3 random potions**, in the one crate that doesn\'t smoke. Roll 1d6 for each.' }]);
	});

	// The right sidebar: the plugin's real encounter tracker.
	sideEl = bodyWrap.createDiv({ cls: 'obs-side' });
	const sideTabs = sideEl.createDiv({ cls: 'obs-side-tabs' });
	for (const [icon, active] of [['book-open', false], ['dice-5', false], ['swords', true]] as [string, boolean][]) {
		setIcon(sideTabs.createSpan({ cls: active ? 'is-active' : '' }), icon);
	}
	const tracker = new EncounterTrackerView({ app: plugin.app } as never, plugin as never);
	sideEl.appendChild(tracker.containerEl);
	void tracker.onOpen();

	win.createDiv({ cls: 'demo-notices' });

	// A plain click on a monster name pins its stat block (in Obsidian it opens the quick look).
	note.addEventListener('click', (e) => {
		const name = (e.target as HTMLElement).closest<HTMLElement>('.nimble-inline-name');
		if (!name) return;
		e.preventDefault();
		e.stopPropagation();
		const ref = name.closest<HTMLElement>('.nimble-inline-ref');
		const entry = byName.get((ref?.dataset.nimbleRef ?? '').toLowerCase());
		if (entry) plugin.hover.show(name, entry, true);
		markDone('hover');
	}, true);

	// Hovering (or tapping) a monster counts as trying it.
	note.addEventListener('pointerover', (e) => { if ((e.target as HTMLElement).closest('.nimble-inline-name')) markDone('hover'); });
}

// Touch screens can't hover: say "tap".
if (window.matchMedia('(hover: none)').matches) {
	const hint = activeDocument.querySelector('.demo-try [data-try="hover"]');
	if (hint?.lastChild) hint.lastChild.textContent = 'Tap a monster';
}

const root = activeDocument.getElementById('demo-root');
if (root) build(root);
import './slash-demo'; import './tiles';
