// Shared note kinds with system fields (core/note-kinds.ts), and 5e's NPC stats.
import { describe, expect, it } from 'vitest';
import { fieldDefaults, fieldText, NoteField, noteStats, SHARED_NOTE_KINDS } from '../src/core/note-kinds';
import { SHIPPED_SYSTEMS } from '../src/app/systems';
import { locationNote, mapNote, npcNote, questNote } from '../src/core/campaign-templates';
import { npcMonster5e, readHp, statblockName } from '../src/systems/dnd5e/npc';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import { npcMonster as nimbleNpcMonster, readArmor, statblockName as nimbleStatblockName } from '../src/systems/nimble/npc';
import type { NimbleMonster } from '../src/systems/nimble/types';

const F: NoteField[] = [
	{ key: 'ac', label: 'AC', type: 'number', gmOnly: true },
	{ key: 'hp', label: 'HP' },
	{ key: 'tags', label: 'Tags' },
];

describe('note kind fields', () => {
	it('reads values as card text', () => {
		expect(fieldText(F[0], 15)).toBe('15');
		expect(fieldText(F[0], ' 15 ')).toBe('15');
		expect(fieldText(F[0], 'fifteen')).toBe('');
		expect(fieldText(F[1], '22 (4d8 + 4)')).toBe('22 (4d8 + 4)');
		expect(fieldText(F[2], ['a', 'b'])).toBe('a, b');
		expect(fieldText(F[1], null)).toBe('');
		expect(fieldText(F[1], undefined)).toBe('');
	});
	it('shows the stats with values, in order, without GM-only ones for players', () => {
		const fm = { ac: 15, hp: '22', tags: '' };
		expect(noteStats(F, fm, false)).toEqual([{ key: 'ac', label: 'AC', value: '15' }, { key: 'hp', label: 'HP', value: '22' }]);
		expect(noteStats(F, fm, true)).toEqual([{ key: 'hp', label: 'HP', value: '22' }]);
		expect(noteStats(undefined, fm, false)).toEqual([]);
	});
	it('gives new notes empty properties, leaving GM-only ones out of players\' notes', () => {
		expect(fieldDefaults(F, 'gm')).toEqual({ ac: '""', hp: '""', tags: '""' });
		expect(fieldDefaults(F, 'player')).toEqual({ hp: '""', tags: '""' });
	});
});

describe('note templates with a system\'s extras', () => {
	const fields = fieldDefaults(F, 'gm');
	it('add the system\'s properties after core\'s', () => {
		const n = npcNote('Marta', 'gm', { fields });
		expect(n).toMatch(/attitude: neutral\nac: ""\nhp: ""\ntags: ""\n---/);
		expect(questNote('Caravan', 'gm', { fields })).toMatch(/hp: ""/);
		expect(locationNote('Phandalin', 'gm', { fields })).toMatch(/ac: ""/);
		expect(mapNote('Hideout', undefined, { fields })).toMatch(/ac: ""/);
	});
	it('start with a ```nimble-note block when the system draws the kind\'s card', () => {
		for (const t of [locationNote('P', 'gm', { card: true }), questNote('Q', 'player', { card: true }), mapNote('M', undefined, { card: true })]) {
			expect(t).toMatch(/^---\n[\s\S]*?\n---\n\n```nimble-note\n```\n/);
		}
		expect(locationNote('P')).not.toContain('nimble-note');
	});
	it('are unchanged with no extras', () => {
		expect(npcNote('Marta')).toBe(npcNote('Marta', 'gm', {}));
		expect(locationNote('P', 'player')).toBe(locationNote('P', 'player', { fields: {} }));
	});
});

describe.each(SHIPPED_SYSTEMS.map(s => [s.id, s] as const))('%s note kinds', (_id, system) => {
	it('extends only the shared kinds, with lowercase keys core doesn\'t already use for that kind', () => {
		// What core's own notes of each kind already hold (a quest's `level` is the quest's, so an NPC may have its own).
		const shared = ['nimble', 'title', 'status', 'secret'];
		const core: Record<string, string[]> = {
			npc: [...shared, 'role', 'portrait', 'aliases', 'ancestry', 'pronouns', 'age', 'faction', 'location', 'attitude', 'first_met'],
			location: [...shared, 'type', 'region', 'image', 'leads'],
			quest: [...shared, 'type', 'giver', 'location', 'reward', 'level'],
			session: [...shared, 'date', 'party', 'quests', 'loot', 'next'],
			map: [...shared],
		};
		for (const [kind, ext] of Object.entries(system.noteKinds ?? {})) {
			expect(SHARED_NOTE_KINDS).toContain(kind);
			for (const f of ext?.fields ?? []) {
				expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
				expect(core[kind]).not.toContain(f.key);
			}
		}
	});
});

describe('5e NPCs', () => {
	it('reads HP as a number, a number with its dice, or dice', () => {
		expect(readHp(22)).toEqual({ hp: 22 });
		expect(readHp('22 (4d8 + 4)')).toEqual({ hp: 22, formula: '4d8 + 4' });
		expect(readHp('4d8+4')).toEqual({ hp: 22, formula: '4d8+4' });
		expect(readHp('')).toBeUndefined();
		expect(readHp('lots')).toBeUndefined();
	});
	it('reads the stat block a property names, however it\'s written', () => {
		for (const v of ['Veteran', '[[Veteran]]', '[[Veteran|the old soldier]]', '`5e:Veteran`', '5e:Veteran']) expect(statblockName(v)).toBe('Veteran');
		expect(statblockName('')).toBe('');
	});
	it('fights with its stat block under its own name, AC and HP', () => {
		const base = bundledMonsters('2024').find(e => e.name === 'Bandit')!.monster;
		const m = npcMonster5e('Marta', { ac: 14, hp: '30' }, base)!;
		expect(m).toMatchObject({ name: 'Marta', ac: 14, hp: 30, cr: base.cr, actions: base.actions });
		expect(m.acNote).toBeUndefined();
		expect(npcMonster5e('Marta', {}, base)).toMatchObject({ name: 'Marta', ac: base.ac, hp: base.hp });
	});
	it('fights with plain stats from AC and HP alone, and not at all with neither', () => {
		expect(npcMonster5e('Innkeeper', { ac: 10, hp: '4 (1d8)' })).toMatchObject({ name: 'Innkeeper', ac: 10, hp: 4, hpFormula: '1d8', cr: '0', abilities: [10, 10, 10, 10, 10, 10] });
		expect(npcMonster5e('Innkeeper', { ac: 10 })).toBeUndefined();
		expect(npcMonster5e('Innkeeper', {})).toBeUndefined();
	});
});

describe('Nimble NPCs', () => {
	it('reads armor however it\'s written', () => {
		for (const v of ['M', 'm', 'medium', 'Medium armor']) expect(readArmor(v)).toBe('medium');
		for (const v of ['H', 'heavy', 'Heavy Armour']) expect(readArmor(v)).toBe('heavy');
		for (const v of ['none', '-', '–']) expect(readArmor(v)).toBe('none');
		expect(readArmor('')).toBeUndefined();
		expect(readArmor('plate')).toBeUndefined();
	});
	it('reads the monster block a property names, however it\'s written', () => {
		for (const v of ['Vault Captain', '[[Vault Captain]]', '[[Vault Captain|the captain]]', '`nimble:Vault Captain`', 'nimble:Vault Captain']) expect(nimbleStatblockName(v)).toBe('Vault Captain');
	});
	it('fights with its block under its own name, level, armor and HP', () => {
		const base: NimbleMonster = { name: 'Goblin Boss', level: 2, armor: 'medium', hp: 36, movement: '6', attacks: [{ raw: 'Scimitar 1d6+2' }] };
		expect(nimbleNpcMonster('Krogg', { level: 3, armor: 'H', hp: 40 }, base)).toMatchObject({ name: 'Krogg', level: '3', armor: 'heavy', hp: 40, attacks: [{ raw: 'Scimitar 1d6+2' }] });
		expect(nimbleNpcMonster('Krogg', {}, base)).toMatchObject({ name: 'Krogg', level: 2, armor: 'medium', hp: 36 });
		const solo = nimbleNpcMonster('Grell', { hp: 90 }, { name: 'Matron', armor: 'none', hp: 120, hpPerHero: 30, movement: '6' })!;
		expect(solo.hp).toBe(90);
		expect(solo.hpPerHero).toBeUndefined();
	});
	it('fights with plain numbers from HP alone, and not at all without', () => {
		expect(nimbleNpcMonster('Ollo', { hp: 12, armor: 'M', level: 1 })).toMatchObject({ name: 'Ollo', hp: 12, armor: 'medium', level: '1', movement: '6' });
		expect(nimbleNpcMonster('Ollo', { armor: 'M' })).toBeUndefined();
	});
});
