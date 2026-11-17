// Nimble's "/" commands, added to core's (core/slash.ts) in Nimble campaigns:
//   /monster            → the compendium, set to adversaries; Enter writes `nimble:Goblin`
//   /spell, /item, /feature, /class, /compendium   → the same for the rest of the compendium
//   /monster gob        → `nimble:Goblin`, picked from the menu
//   /add 3 goblin       → three goblins straight into the tracker
//   /encounter 3 goblin, 2 wolf  → an encounter block, rated against the party
//   /statblock krogg    → the full stat block, editable in the note
//   /roll 2d6+3         → plain or Nimble attack roll

import { Notice } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { parseDice } from '../../core/dice';
import { encounterBlockSource, EncounterDef, parseMonsterLine } from '../../core/encounter-def';
import { plainRoll, SlashCommand, SlashItem, SlashWriter, writeAt } from '../../core/slash';
import { BattleNotesModal } from './battle-notes';
import { BuilderModal } from './builder-modal';
import type { Segment } from './compendium-entries';
import { compendiumEntries, entryReference } from './compendium-browser';
import { insertFromCompendium, InsertMode, openAddMonsterPicker } from './compendium-pickers';
import { search as searchCompendium } from './compendium-query';
import { partyLevels, runEncounter } from './encounter-block';
import { EntityKind, openBuilder } from './entity-builder';
import { toStatblockSource } from './parser';
import { formatLevel, rateEncounter } from './rules';
import { describeMonster } from './suggest';
import type { MonsterIndexEntry } from './types';

/** Commands that open the compendium dialog when chosen without an argument. */
interface Picker { segment: Segment; segments?: Segment[]; mode?: InsertMode; title: string }

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

const PICKERS: Record<string, Picker> = {
	monster: { segment: 'adversaries', segments: ['adversaries', 'companions'], title: 'Insert a monster' },
	statblock: { segment: 'adversaries', segments: ['adversaries', 'companions'], mode: 'statblock', title: 'Insert a stat block' },
	spell: { segment: 'spells', title: 'Insert a spell' },
	item: { segment: 'items', title: 'Insert an item' },
	feature: { segment: 'features', title: 'Insert a feature' },
	class: { segment: 'classes', title: 'Insert a class' },
	companion: { segment: 'companions', title: 'Insert a companion' },
	compendium: { segment: 'all', segments: ['all', 'adversaries', 'npcs', 'companions', 'spells', 'items', 'features', 'classes', 'origins', 'rules'], title: 'Insert a reference' },
};

export function nimbleSlashCommands(plugin: EmberVaultPlugin): SlashCommand[] {
	const p = plugin;
	/** The compendium dialog, ready to type in; the pick lands where the slash was. */
	const picker = (name: string) => (w: SlashWriter) => { w.clear(); insertFromCompendium(p, w.editor, w.start, PICKERS[name]); };
	const compendium = (name: string, icon: string, desc: string, aliases: string[], hint?: string): SlashCommand => ({
		name, aliases, icon, desc, hint, run: picker(name), items: (arg, q) => compendiumItems(p, arg, PICKERS[name], icon, q.path),
	});
	const build = (kind: EntityKind) => (w: SlashWriter) => {
		w.clear();
		const at = { ...w.start };
		openBuilder(p, { kind, sourcePath: w.path, insert: (block) => writeAt(w.editor, at, at, block, true) });
	};
	return [
		{ name: 'monster', aliases: ['m', 'adversary'], icon: 'skull', desc: 'Monster reference', hint: '/monster goblin', run: picker('monster'), items: (arg, q) => monsterItems(p, arg, 'ref', q.path) },
		compendium('spell', 'wand-2', 'Spell reference', ['sp'], '/spell school:fire'),
		compendium('item', 'backpack', 'Item reference', ['gear', 'weapon'], '/item stat:str'),
		compendium('feature', 'sparkles', 'Class feature or ability', ['ability', 'abilities', 'feat'], '/feature lay on hands'),
		compendium('class', 'graduation-cap', 'Class or subclass reference', ['subclass'], '/class oathsworn'),
		compendium('companion', 'paw-print', 'Companion reference', ['pet']),
		compendium('compendium', 'library', 'Reference anything in the compendium', ['ref', 'lookup', 'cmp'], '/compendium lay on hands'),
		{ name: 'fought', aliases: ['battle', 'fight-notes', 'encounter'], icon: 'swords', desc: 'Battle notes: who we fought', hint: '/fought 4 goblin, goblin shaman', side: 'player', items: (arg) => foughtItems(p, arg) },
		{ name: 'add', side: 'gm', aliases: ['fight'], icon: 'swords', desc: 'Add to the tracker', hint: '/add 3 goblin', run: (w) => { w.clear(); openAddMonsterPicker(p); }, items: (arg) => addItems(p, arg) },
		{ name: 'encounter', side: 'gm', aliases: ['enc'], icon: 'shield-alert', desc: 'Encounter block', hint: '/encounter 3 goblin, 2 wolf', items: (arg) => encounterItems(p, arg) },
		{ name: 'statblock', side: 'gm', aliases: ['sb', 'block'], icon: 'scroll-text', desc: 'Full stat block', hint: '/statblock krogg', run: picker('statblock'), items: (arg, q) => monsterItems(p, arg, 'statblock', q.path) },
		{ name: 'builder', side: 'gm', icon: 'scale', desc: 'Open the encounter builder', run: (w) => { w.clear(); new BuilderModal(p).open(); } },
		{ name: 'legendary', side: 'gm', aliases: ['boss', 'solo'], icon: 'crown', desc: 'Legendary monster template', run: (w) => w.write(LEGENDARY, { block: true }) },
		{ name: 'minion', side: 'gm', icon: 'users', desc: 'Minion template', run: (w) => w.write(MINION, { block: true }) },
		{ name: 'new-monster', side: 'gm', aliases: ['template', 'build-monster'], icon: 'skull', desc: 'Build a monster here, with the GM Guide\'s numbers', run: build('monster') },
		{ name: 'new-spell', aliases: ['build-spell', 'homebrew-spell'], icon: 'wand-2', desc: 'Build a homebrew spell here', run: build('spell') },
		{ name: 'new-item', aliases: ['build-item', 'homebrew-item'], icon: 'backpack', desc: 'Build a homebrew item here', run: build('item') },
		{
			name: 'summary', side: 'gm', icon: 'clipboard-list', desc: 'Write the current encounter\'s summary',
			run: (w) => {
				const enc = p.encounters.active;
				if (!enc || !enc.creatures.length) { new Notice('No encounter in the tracker'); w.clear(); return; }
				w.write(p.encounters.summary(enc.id));
			},
		},
		{ name: 'roll', aliases: ['r', 'dice'], icon: 'dices', desc: 'Roll and write the result', hint: '/roll 2d6+3', items: (arg) => rollItems(p, arg) },
	];
}

/** /roll: a plain roll, or a Nimble attack (a 1 on the primary die misses, its max explodes). */
function rollItems(plugin: EmberVaultPlugin, arg: string): SlashItem[] {
	const expr = arg.trim().replace(/\s+/g, '') || '1d20';
	if (!parseDice(expr)) return [{ icon: 'dices', title: `Can't roll "${arg.trim()}"`, detail: 'Try 2d6+3, d20, 4d4-1' }];
	return [
		plainRoll(plugin, expr),
		{
			icon: 'swords', title: `Attack roll ${expr}`, detail: '',
			run: (w) => {
				const r = plugin.rollDice(expr, `Attack ${expr}`, 'attack');
				w.write(r ? `🎲 ${r.expression} → **${r.outcome === 'miss' ? 'MISS' : r.total}**${r.outcome === 'crit' ? ' (crit!)' : ''} (${r.detail})` : '');
			},
		},
	];
}

function searchMonsters(plugin: EmberVaultPlugin, q: string, limit = 30): MonsterIndexEntry[] {
	const query = q.trim().toLowerCase();
	const all = plugin.index.all();
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

function monsterBadge(e: MonsterIndexEntry) {
	const lvl = formatLevel(e.monster.level);
	return { text: e.bundled ? (e.monster.source?.startsWith('GM') ? 'GMG' : 'M&M') : 'note', cls: lvl ? '' : 'is-muted' };
}

/** /spell fire, /feature lay on hands: the compendium's search, inline; the last row opens the full dialog. */
function compendiumItems(plugin: EmberVaultPlugin, arg: string, picker: Picker, icon: string, path?: string): SlashItem[] {
	const lore = plugin.hideStats('', path);
	const res = searchCompendium(compendiumEntries(plugin, lore), arg, { segment: picker.segment, only: e => !!entryReference(e), lore, limit: 30 });
	const items: SlashItem[] = res.entries.map(e => ({
		icon: e.monster ? 'skull' : e.npc ? 'user-round' : icon,
		title: e.name,
		detail: e.detail,
		badge: e.badge ? { text: e.badge, cls: 'is-muted' } : undefined,
		run: (w: SlashWriter) => w.write(`${entryReference(e)} `),
	}));
	items.push(moreItem(plugin, arg, picker));
	return items;
}

function moreItem(plugin: EmberVaultPlugin, arg: string, picker: Picker): SlashItem {
	return {
		icon: 'library', title: 'Search the compendium…', detail: 'Filters, sorting and the full page of each entry',
		run: (w) => { w.clear(); insertFromCompendium(plugin, w.editor, w.start, { ...picker, query: arg }); },
	};
}

function monsterItems(plugin: EmberVaultPlugin, q: string, mode: 'ref' | 'statblock', path?: string): SlashItem[] {
	const lore = plugin.hideStats('', path);
	const picker = PICKERS[mode === 'ref' ? 'monster' : 'statblock'];
	// Typed filters ("type:goblin level:3") go through the compendium's search.
	if (/\b[a-z]+:\S/i.test(q)) {
		const res = searchCompendium(compendiumEntries(plugin, lore), q, { segment: 'adversaries', only: e => !!e.monster, lore, limit: 30 });
		return [...res.entries.map(x => monsterItem(x.monster!, mode, lore)), moreItem(plugin, q, picker)];
	}
	return [...searchMonsters(plugin, q).map(e => monsterItem(e, mode, lore)), moreItem(plugin, q, picker)];
}

function monsterItem(e: MonsterIndexEntry, mode: 'ref' | 'statblock', lore: boolean): SlashItem {
	return {
		icon: mode === 'ref' ? 'skull' : 'scroll-text',
		title: e.name,
		detail: lore ? [e.monster.group, e.monster.type].filter(Boolean).join(' · ') : describeMonster(e),
		badge: lore ? undefined : monsterBadge(e),
		run: (w) => {
			if (mode === 'ref') w.write(`\`nimble:${e.name}\` `);
			else w.write(`\`\`\`nimble\n${toStatblockSource(e.monster)}\n\`\`\``, { block: true });
		},
	};
}

function addItems(plugin: EmberVaultPlugin, arg: string): SlashItem[] {
	const m = arg.match(/^(\d+)\s*[x×]?\s*(.*)$/i);
	const count = m ? Math.max(1, Number(m[1])) : 1;
	const q = m ? m[2] : arg;
	return searchMonsters(plugin, q, 20).map(e => ({
		icon: 'swords',
		title: `Add ${count} × ${e.name}`,
		detail: describeMonster(e),
		badge: monsterBadge(e),
		run: (w: SlashWriter) => { w.clear(); void plugin.addToEncounter(e.monster, e.filePath || undefined, count); },
	}));
}

/** Player battle notes: the foes by name, matched to the bestiary when they're in it, kept as typed when not. */
function foughtItems(plugin: EmberVaultPlugin, arg: string): SlashItem[] {
	const def: EncounterDef = { name: 'Battle', party: false, monsters: [], extra: ['outcome: won'] };
	for (const part of arg.split(/[,;]+/).map(x => x.trim()).filter(Boolean)) {
		const parsed = parseMonsterLine(part);
		if (!parsed) continue;
		const hit = plugin.index.get(parsed.name) ?? searchMonsters(plugin, parsed.name, 1)[0];
		const name = hit?.name ?? parsed.name;
		const ex = def.monsters.find(x => x.name.toLowerCase() === name.toLowerCase());
		if (ex) ex.count += parsed.count; else def.monsters.push({ name, count: parsed.count });
	}
	const block = (d: EncounterDef) => `\`\`\`nimble-encounter\n${encounterBlockSource(d)}\n\`\`\``;
	const items: SlashItem[] = [];
	if (def.monsters.length) {
		items.push({ icon: 'swords', title: def.monsters.map(x => `${x.count} ${x.name}`).join(', '), detail: 'Insert battle notes', run: (w) => w.write(block(def), { block: true }) });
	}
	items.push({
		icon: 'pencil', title: def.monsters.length ? 'Fill in the rest…' : 'Battle notes…', detail: 'Pick who you fought, how it went, and what you found',
		run: (w) => {
			w.clear();
			// Written where the cursor is when the dialog is saved (the note may have changed meanwhile), on lines of its own.
			new BattleNotesModal(plugin, def, (d) => {
				const at = w.editor.getCursor();
				writeAt(w.editor, at, at, block(d), true);
			}).open();
		},
	});
	return items;
}

function encounterItems(plugin: EmberVaultPlugin, arg: string): SlashItem[] {
	const parts = arg.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
	const def: EncounterDef = { name: 'New encounter', party: plugin.settings.party.length > 0, monsters: [] };
	const missing: string[] = [];
	for (const part of parts) {
		const parsed = parseMonsterLine(part);
		if (!parsed) continue;
		const hit = plugin.index.get(parsed.name) ?? searchMonsters(plugin, parsed.name, 1)[0];
		if (!hit) { missing.push(parsed.name); continue; }
		const ex = def.monsters.find(x => x.name === hit.name);
		if (ex) ex.count += parsed.count; else def.monsters.push({ name: hit.name, count: parsed.count });
	}
	const groups = def.monsters.map(x => ({ monster: plugin.index.get(x.name)!.monster, count: x.count }));
	const rating = rateEncounter(groups, partyLevels(plugin));
	const block = (d: EncounterDef) => `\`\`\`nimble-encounter\n${encounterBlockSource(d)}\n\`\`\``;
	const items: SlashItem[] = [];
	if (def.monsters.length) {
		items.push({
			icon: 'shield-alert',
			title: def.monsters.map(x => `${x.count} ${x.name}`).join(', '),
			detail: `Insert encounter block · ${rating.value.toFixed(1)} of ${rating.budget} budget${missing.length ? ` · not found: ${missing.join(', ')}` : ''}`,
			badge: { text: `${rating.label} ${Math.round(rating.pct * 100)}%`, cls: `diff-${rating.label.toLowerCase().replace(/\s+/g, '-')}` },
			run: (w) => w.write(block(def), { block: true }),
		});
		items.push({
			icon: 'play', title: 'Insert and run it now', detail: '',
			run: (w) => {
				w.write(block(def), { block: true });
				// The same as pressing Run on the block: asks before replacing a fight in progress, adds the party, opens the tracker.
				void runEncounter(plugin, def, w.path);
			},
		});
	} else {
		items.push({ icon: 'shield-alert', title: 'Empty encounter block', detail: 'e.g. 3 goblin, 2 wolf', run: (w) => w.write(block({ ...def, monsters: [] }), { block: true }) });
	}
	items.push({ icon: 'scale', title: 'Open the encounter builder…', detail: '', run: (w) => { w.clear(); new BuilderModal(plugin, def.monsters.length ? def : undefined).open(); } });
	return items;
}
