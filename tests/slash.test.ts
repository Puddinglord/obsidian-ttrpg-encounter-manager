// The "/" menu engine (core/slash.ts): base commands, a system's own commands
// (which replace a base command of the same name), the GM/player split, and
// the menu order. Then each shipped system's commands, and 5e's helpers.
import { describe, expect, it } from 'vitest';
import type NimbleStatblocksPlugin from '../main';
import { commandsFor, SLASH_ORDER, SlashCommand, slashItems } from '../src/core/slash';
import { SHIPPED_SYSTEMS } from '../src/app/systems';
import { parseEncounterArg, rollExpression5e } from '../src/systems/dnd5e/slash';

/** Just enough plugin for the menu: a system per note and a player-view switch. */
function fakePlugin(o: { commands?: SlashCommand[]; player?: boolean } = {}): NimbleStatblocksPlugin {
	const system = { id: 'x', slashCommands: o.commands ? () => o.commands! : undefined, conditions: () => [{ id: 'prone', name: 'Prone', description: 'Down.' }], vocabulary: { defense: 'AC' } };
	return {
		playerView: () => !!o.player,
		system: () => system,
		edition: () => undefined,
		settings: { party: [], customConditions: [] },
		campaigns: { npcs: [] },
	} as unknown as NimbleStatblocksPlugin;
}

const names = (cs: SlashCommand[]) => cs.map(c => c.name);
const titles = (p: NimbleStatblocksPlugin, q: string) => slashItems(p, q, 'note.md', null).map(i => i.title);

describe('slash engine', () => {
	it('offers the base commands with no system commands', () => {
		const n = names(commandsFor(fakePlugin(), 'note.md'));
		for (const c of ['npc', 'quest', 'box', 'map', 'roll', 'condition', 'party', 'tracker', 'bestiary', 'settings', 'read-aloud', 'hook']) expect(n).toContain(c);
		expect(n).not.toContain('monster');
	});

	it('lets a system command replace a base command of the same name or alias', () => {
		const roll: SlashCommand = { name: 'roll', icon: 'dices', desc: 'Mine', items: () => [{ icon: 'x', title: 'my roll' }] };
		const tracker: SlashCommand = { name: 'fight-board', aliases: ['tracker'], icon: 'x', desc: 'Mine' };
		const cs = commandsFor(fakePlugin({ commands: [roll, tracker] }), 'note.md');
		expect(cs.filter(c => c.name === 'roll')).toEqual([roll]);
		expect(names(cs)).not.toContain('tracker');
		expect(titles(fakePlugin({ commands: [roll] }), 'roll 2d6')).toEqual(['my roll']);
	});

	it('hides GM commands from players and player commands from the GM', () => {
		const gm: SlashCommand = { name: 'secret-gm', side: 'gm', icon: 'x', desc: '' };
		const pl: SlashCommand = { name: 'notes-pl', side: 'player', icon: 'x', desc: '' };
		expect(names(commandsFor(fakePlugin({ commands: [gm, pl] }), 'n'))).toContain('secret-gm');
		expect(names(commandsFor(fakePlugin({ commands: [gm, pl] }), 'n'))).not.toContain('notes-pl');
		const player = names(commandsFor(fakePlugin({ commands: [gm, pl], player: true }), 'n'));
		expect(player).toContain('notes-pl');
		expect(player).not.toContain('secret-gm');
		expect(player).not.toContain('tracker');
	});

	it('orders the bare menu by SLASH_ORDER, wherever a command was defined', () => {
		const monster: SlashCommand = { name: 'monster', icon: 'x', desc: '' };
		const odd: SlashCommand = { name: 'zzz-odd', icon: 'x', desc: '', order: 0 };
		const t = titles(fakePlugin({ commands: [odd, monster] }), '');
		expect(t[0]).toBe('/zzz-odd');
		expect(t[1]).toBe('/monster');
		expect(t.indexOf('/npc')).toBeLessThan(t.indexOf('/roll'));
		expect(t.indexOf('/roll')).toBeLessThan(t.indexOf('/settings'));
	});

	it('matches exact names, then prefixes, then anywhere in the name or description', () => {
		const t = titles(fakePlugin(), 'rol');
		expect(t[0]).toBe('/roll');
		expect(titles(fakePlugin(), 'r')).toContain('/read-aloud');
		expect(titles(fakePlugin(), 'nothing-like-this')).toEqual([]);
	});

	it('completes a command that takes an argument, and runs one that doesn\'t', () => {
		const items = slashItems(fakePlugin(), 'condi', 'n', null);
		expect(items[0].complete).toBe('/condition ');
		expect(slashItems(fakePlugin(), 'party', 'n', null)[0].run).toBeTypeOf('function');
	});

	it('reads conditions from the note\'s system', () => {
		expect(titles(fakePlugin(), 'condition pro')).toEqual(['Prone']);
	});

	it('gives an unknown command\'s argument no rows', () => {
		expect(slashItems(fakePlugin(), 'nope 3 goblin', 'n', null)).toEqual([]);
	});
});

describe.each(SHIPPED_SYSTEMS.map(s => [s.id, s] as const))('%s slash commands', (_id, system) => {
	const cs = system.slashCommands?.(fakePlugin()) ?? [];
	it('has commands for its compendium', () => {
		for (const n of ['monster', 'spell', 'item', 'compendium', 'encounter', 'add', 'statblock', 'roll']) expect(names(cs)).toContain(n);
	});
	it('names each command once, across names and aliases on the same side', () => {
		for (const side of ['gm', 'player']) {
			const seen = cs.filter(c => !c.side || c.side === side).flatMap(c => [c.name, ...(c.aliases ?? [])]);
			expect(seen.length).toBe(new Set(seen).size);
		}
	});
	it('places every shared command in the menu order', () => {
		for (const n of ['monster', 'spell', 'item', 'compendium', 'encounter', 'add', 'statblock', 'roll']) expect(SLASH_ORDER).toContain(n);
	});
	it('says what its heroes\' defense is called', () => {
		expect(system.vocabulary?.defense).toBeTruthy();
	});
});

describe('5e slash helpers', () => {
	it('reads "/roll +5" as a d20 check', () => {
		expect(rollExpression5e('')).toBe('1d20');
		expect(rollExpression5e('+5')).toBe('1d20+5');
		expect(rollExpression5e(' -1 ')).toBe('1d20-1');
		expect(rollExpression5e('−2')).toBe('1d20-2');
		expect(rollExpression5e('2d6 + 3')).toBe('2d6+3');
	});
	it('parses "/encounter 3 goblin, 2 wolf", merging repeats and listing what wasn\'t found', () => {
		const known: Record<string, string> = { goblin: 'Goblin Warrior', 'goblin warrior': 'Goblin Warrior', wolf: 'Wolf' };
		const find = (n: string) => known[n.toLowerCase()];
		expect(parseEncounterArg('3 goblin, 2 wolf; goblin warrior, 2 tarrasque-ish', find)).toEqual({
			monsters: [{ name: 'Goblin Warrior', count: 4 }, { name: 'Wolf', count: 2 }],
			missing: ['tarrasque-ish'],
		});
		expect(parseEncounterArg('2 strange thing', find, true).monsters).toEqual([{ name: 'strange thing', count: 2 }]);
		expect(parseEncounterArg('', find)).toEqual({ monsters: [], missing: [] });
	});
});
