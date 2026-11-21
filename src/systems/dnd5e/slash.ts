// 5e's "/" commands, added to core's (core/slash.ts) in 5e campaigns. They
// search the note's edition (and fall back to the other one, as references do):
//   /monster gob          → `5e:Goblin Warrior` (/monster type:undead cr:1-4 filters, as the compendium does)
//   /spell fire           → `5e:spell:Fireball` (and /item, /equipment, /class, /species, /background, /feat, /rule)
//   /compendium shield    → anything: monsters first, then the compendium
//   /statblock ogre       → the full ```5e stat block, editable in the note
//   /encounter 3 goblin, 2 wolf → an encounter block, rated by the edition's rules
//   /add 3 goblin         → three goblins straight into the 5e tracker
//   /roll +5, /roll 1d20+5 → with advantage or disadvantage

import type EmberVaultPlugin from '../../../main';
import { parseDice } from '../../core/dice';
import { encounterBlockSource, EncounterDef, parseMonsterLine } from '../../core/encounter-def';
import { plainRoll, SlashCommand, SlashItem, SlashWriter, writeAt } from '../../core/slash';
import { BattleNotesModal } from '../../core/battle-notes';
import { rankByName } from '../../core/spotlight-def';
import { addMonster } from './combat';
import { Hit5e, KIND5E, Kind5e } from './compendium';
import { buildEntries5e, QUERY_5E } from './compendium-entries';
import type { Tab } from './compendium-view';
import { battleEdit5e, runEncounter5e } from './encounter-block';
import { toStatblockSource5e } from './parser';
import { rateEncounter5e, xpOf } from './rules';
import { dnd5e, Dnd5eRuntime } from './runtime';
import type { Dnd5eEntry } from './types';

/** A compendium command: which kinds it searches, and the compendium tab "Search the compendium…" opens. */
interface Kinds { kinds: Kind5e[]; tab: Tab }

const KINDS: Record<string, Kinds> = {
	spell: { kinds: ['spell'], tab: 'spells' },
	item: { kinds: ['item'], tab: 'items' },
	equipment: { kinds: ['equipment'], tab: 'equipment' },
	class: { kinds: ['class', 'subclass'], tab: 'classes' },
	species: { kinds: ['species'], tab: 'origins' },
	background: { kinds: ['background'], tab: 'origins' },
	feat: { kinds: ['feat'], tab: 'feats' },
	rule: { kinds: ['rule', 'condition'], tab: 'rules' },
};

export function dnd5eSlashCommands(plugin: EmberVaultPlugin): SlashCommand[] {
	// The runtime is looked up when a command is used: the list is made before 5e registers (and in tests).
	const kind = (name: string, icon: string, desc: string, aliases: string[], hint?: string): SlashCommand => ({
		name, aliases, icon, desc, hint, items: (arg, q) => compendiumItems(dnd5e(), arg, KINDS[name], q.path),
	});
	return [
		{ name: 'monster', aliases: ['m', 'creature'], icon: 'skull', desc: 'Monster reference', hint: '/monster goblin', items: (arg, q) => monsterItems(dnd5e(), arg, 'ref', q.path) },
		kind('spell', 'wand-2', 'Spell reference', ['sp'], '/spell fireball'),
		kind('item', 'gem', 'Magic item reference', ['magic-item'], '/item bag of holding'),
		kind('equipment', 'sword', 'Weapon, armor or gear reference', ['gear', 'weapon', 'armor', 'armour'], '/equipment longsword'),
		kind('class', 'graduation-cap', 'Class or subclass reference', ['subclass'], '/class wizard'),
		kind('species', 'users', 'Species reference', ['race', 'ancestry'], '/species dwarf'),
		kind('background', 'scroll', 'Background reference', ['bg'], '/background sage'),
		kind('feat', 'award', 'Feat reference', [], '/feat alert'),
		kind('rule', 'scale', 'Rule reference', ['rules'], '/rule grappling'),
		{ name: 'compendium', aliases: ['ref', 'lookup', 'cmp'], icon: 'library', desc: 'Reference anything in the compendium', hint: '/compendium shield', items: (arg, q) => anyItems(dnd5e(), arg, q.path) },
		{ name: 'fought', aliases: ['battle', 'fight-notes', 'encounter'], icon: 'swords', desc: 'Battle notes: who we fought', hint: '/fought 4 goblin, bugbear', side: 'player', items: (arg, q) => foughtItems(dnd5e(), arg, q.path) },
		{ name: 'add', side: 'gm', aliases: ['fight'], icon: 'swords', desc: 'Add to the tracker', hint: '/add 3 goblin', items: (arg, q) => addItems(dnd5e(), arg, q.path) },
		{ name: 'encounter', side: 'gm', aliases: ['enc'], icon: 'shield-alert', desc: 'Encounter block', hint: '/encounter 3 goblin, 2 wolf', items: (arg, q) => encounterItems(dnd5e(), arg, q.path) },
		{ name: 'statblock', side: 'gm', aliases: ['sb', 'block'], icon: 'scroll-text', desc: 'Full stat block', hint: '/statblock ogre', items: (arg, q) => monsterItems(dnd5e(), arg, 'statblock', q.path) },
		{ name: 'roll', aliases: ['r', 'dice'], icon: 'dices', desc: 'Roll and write the result', hint: '/roll 1d20+5', items: (arg) => rollItems(plugin, arg) },
	];
}

/** "/roll +5" is a d20 check; a single d20 can be rolled with advantage or disadvantage. */
export function rollExpression5e(arg: string): string {
	const s = arg.trim().replace(/\s+/g, '');
	if (!s) return '1d20';
	return /^[+\-−]\d+$/.test(s) ? `1d20${s.replace('−', '-')}` : s;
}

function rollItems(plugin: EmberVaultPlugin, arg: string): SlashItem[] {
	const expr = rollExpression5e(arg);
	const dice = parseDice(expr);
	if (!dice) return [{ icon: 'dices', title: `Can't roll "${arg.trim()}"`, detail: 'Try 1d20+5, +3, 2d6+3' }];
	const items = [plainRoll(plugin, expr)];
	if (dice.count === 1 && dice.sides === 20) {
		for (const [edge, word] of [[1, 'advantage'], [-1, 'disadvantage']] as const) {
			items.push({
				icon: edge > 0 ? 'chevrons-up' : 'chevrons-down', title: `Roll ${expr} with ${word}`, detail: '',
				run: (w) => {
					const r = plugin.rollWithEdge({ dice, edge, attack: false }, `${expr} with ${word}`);
					w.write(`🎲 ${expr} (${word}) → **${r.total}** (${r.detail})`);
				},
			});
		}
	}
	return items;
}

/** Monsters the note can see, by name or type. */
function searchMonsters(rt: Dnd5eRuntime, q: string, path: string | undefined, limit = 30): Dnd5eEntry[] {
	return rankByName(rt.index.all(rt.edition(path), path), q, e => [e.name, e.monster.type ?? ''], limit);
}

/** A typed name: the monster of that name (either edition), else the best match. */
function findMonster(rt: Dnd5eRuntime, name: string, path: string | undefined): Dnd5eEntry | undefined {
	return rt.get(name, path) ?? searchMonsters(rt, name, path, 1)[0];
}

function describe(e: Dnd5eEntry, lore: boolean): string {
	if (lore) return e.monster.type ?? '';
	return [`CR ${e.monster.cr}`, e.monster.type, e.bundled ? e.monster.source : e.filePath].filter(Boolean).join(' · ');
}

const badge = (e: Dnd5eEntry) => ({ text: e.bundled ? 'SRD' : 'note', cls: 'is-muted' });

/** "type:undead", "cr:1-4": a typed filter. */
const FILTER = /\b[a-z]+:\S/i;

function monsterItems(rt: Dnd5eRuntime, q: string, mode: 'ref' | 'statblock', path?: string): SlashItem[] {
	const lore = rt.plugin.hideStats('', path);
	const found = FILTER.test(q)
		? QUERY_5E.search(buildEntries5e(rt.edition(path), rt.index.all(rt.edition(path), path), lore), q, { segment: 'monsters', lore, limit: 30 }).entries.map(e => e.monster!)
		: searchMonsters(rt, q, path);
	const items = found.map((e): SlashItem => ({
		icon: mode === 'ref' ? 'skull' : 'scroll-text',
		title: e.name,
		detail: describe(e, lore),
		badge: lore ? undefined : badge(e),
		run: (w) => {
			if (mode === 'ref') w.write(`\`5e:${e.name}\` `);
			else w.write(`\`\`\`5e\n${toStatblockSource5e(e.monster)}\n\`\`\``, { block: true });
		},
	}));
	items.push(moreItem(rt, q, 'monsters', path));
	return items;
}

function hitItem(h: Hit5e): SlashItem {
	return {
		icon: KIND5E[h.kind].icon,
		title: h.name,
		detail: h.detail,
		badge: { text: KIND5E[h.kind].label, cls: 'is-muted' },
		run: (w) => w.write(`\`5e:${h.kind}:${h.name}\` `),
	};
}

/** /spell fire: the edition's entries of those kinds; the last row opens the compendium tab. */
function compendiumItems(rt: Dnd5eRuntime, arg: string, k: Kinds, path?: string): SlashItem[] {
	// Typed filters ("school:evocation level:3") go through the compendium's search.
	if (FILTER.test(arg)) {
		const res = QUERY_5E.search(buildEntries5e(rt.edition(path), [], false, rt.homebrew.hits(rt.edition(path), path)), arg, { segment: k.tab, only: e => !!e.hit && k.kinds.includes(e.hit.kind), limit: 30 });
		return [...res.entries.map(e => hitItem(e.hit!)), moreItem(rt, arg, k.tab, path)];
	}
	const hits = rt.hits(rt.edition(path), path).filter(h => k.kinds.includes(h.kind));
	return [...rankByName(hits, arg, h => [h.name], 30).map(hitItem), moreItem(rt, arg, k.tab, path)];
}

/** /compendium: monsters first, then everything else. */
function anyItems(rt: Dnd5eRuntime, arg: string, path?: string): SlashItem[] {
	const monsters = monsterItems(rt, arg, 'ref', path).slice(0, -1).slice(0, 10);
	const hits = rankByName(rt.hits(rt.edition(path), path), arg, h => [h.name], 30).map(hitItem);
	return [...monsters, ...hits].slice(0, 30).concat(moreItem(rt, arg, 'all', path));
}

function moreItem(rt: Dnd5eRuntime, arg: string, tab: Tab, path?: string): SlashItem {
	return {
		icon: 'library', title: 'Search the compendium…', detail: 'Every entry, with its full text',
		run: (w) => { w.clear(); void rt.openCompendium({ tab, query: arg.trim(), path }); },
	};
}

function addItems(rt: Dnd5eRuntime, arg: string, path?: string): SlashItem[] {
	const m = arg.match(/^(\d+)\s*[x×]?\s*(.*)$/i);
	const count = m ? Math.max(1, Math.min(50, Number(m[1]))) : 1;
	const q = m ? m[2] : arg;
	return searchMonsters(rt, q, path, 20).map(e => ({
		icon: 'swords',
		title: `Add ${count} × ${e.name}`,
		detail: describe(e, false),
		badge: badge(e),
		run: (w: SlashWriter) => {
			w.clear();
			rt.fights.change(f => { addMonster(f, e.monster, count, { sourceFile: e.filePath || undefined }); });
			void rt.openTracker();
		},
	}));
}

/** "3 goblin, 2 wolf" → the monsters found (merged by name) and the names that weren't. */
export function parseEncounterArg(arg: string, find: (name: string) => string | undefined, keepMissing = false): { monsters: { name: string; count: number }[]; missing: string[] } {
	const monsters: { name: string; count: number }[] = [];
	const missing: string[] = [];
	for (const part of arg.split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
		const parsed = parseMonsterLine(part);
		if (!parsed) continue;
		const found = find(parsed.name);
		if (!found && !keepMissing) { missing.push(parsed.name); continue; }
		const name = found ?? parsed.name;
		const ex = monsters.find(x => x.name.toLowerCase() === name.toLowerCase());
		if (ex) ex.count += parsed.count; else monsters.push({ name, count: parsed.count });
	}
	return { monsters, missing };
}

const fence = (d: EncounterDef) => `\`\`\`nimble-encounter\n${encounterBlockSource(d)}\n\`\`\``;

function encounterItems(rt: Dnd5eRuntime, arg: string, path?: string): SlashItem[] {
	const { monsters, missing } = parseEncounterArg(arg, n => findMonster(rt, n, path)?.name);
	const def: EncounterDef = { name: 'New encounter', party: rt.plugin.settings.party.length > 0, monsters };
	if (!monsters.length) {
		return [{ icon: 'shield-alert', title: 'Empty encounter block', detail: 'e.g. 3 goblin, 2 wolf', run: (w) => w.write(fence(def), { block: true }) }];
	}
	const groups = monsters.map(x => ({ monster: rt.get(x.name, path)!.monster, count: x.count }));
	const r = rateEncounter5e(groups, rt.partyLevels(), rt.edition(path));
	const xp = groups.reduce((n, g) => n + xpOf(g.monster) * g.count, 0);
	return [
		{
			icon: 'shield-alert',
			title: monsters.map(x => `${x.count} ${x.name}`).join(', '),
			detail: `Insert encounter block · ${xp.toLocaleString('en-US')} XP${missing.length ? ` · not found: ${missing.join(', ')}` : ''}`,
			badge: { text: `${r.label} ${Math.round(r.pct * 100)}%`, cls: `diff-${r.label.toLowerCase()}` },
			run: (w) => w.write(fence(def), { block: true }),
		},
		{
			icon: 'play', title: 'Insert and run it now', detail: '',
			run: (w) => {
				w.write(fence(def), { block: true });
				void runEncounter5e(rt, def, w.path, true);
			},
		},
	];
}

/** Player battle notes: foes matched to the monsters they can see, kept as typed when not. */
function foughtItems(rt: Dnd5eRuntime, arg: string, path?: string): SlashItem[] {
	const { monsters } = parseEncounterArg(arg, n => findMonster(rt, n, path)?.name, true);
	const def: EncounterDef = { name: 'Battle', party: false, monsters, extra: ['outcome: won'] };
	const items: SlashItem[] = [];
	if (monsters.length) items.push({ icon: 'swords', title: monsters.map(x => `${x.count} ${x.name}`).join(', '), detail: 'Insert battle notes', run: (w) => w.write(fence(def), { block: true }) });
	items.push({
		icon: 'pencil', title: monsters.length ? 'Fill in the rest…' : 'Battle notes…', detail: 'Pick who you fought, how it went, and what you found',
		run: (w) => {
			w.clear();
			// Written where the cursor is when the dialog is saved, on lines of its own.
			new BattleNotesModal(rt.plugin.app, def, (d) => {
				const at = w.editor.getCursor();
				writeAt(w.editor, at, at, fence(d), true);
			}, battleEdit5e(rt, path)).open();
		},
	});
	return items;
}
