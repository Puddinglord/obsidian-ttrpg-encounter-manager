import { describe, expect, it } from 'vitest';
import BESTIARY from '../src/data/bestiary.json';
import { BestiaryEntry, fromBestiary } from '../src/bestiary';
import { encounterBlockSource, parseEncounterBlock, parseMonsterLine } from '../src/encounter-def';
import { parseStatblock, toStatblockSource } from '../src/parser';
import { monsterRole } from '../src/rules';

const raw = BESTIARY as unknown as BestiaryEntry[];

describe('bundled bestiary data', () => {
	it('has hundreds of monsters with unique ids and names', () => {
		expect(raw.length).toBeGreaterThan(500);
		expect(new Set(raw.map(e => e.id)).size).toBe(raw.length);
		expect(new Set(raw.map(e => e.name.toLowerCase())).size).toBe(raw.length);
	});

	it('converts every entry into a usable monster', () => {
		for (const e of raw) {
			const m = fromBestiary(e);
			expect(m.name, e.id).toBeTruthy();
			expect(['none', 'medium', 'heavy']).toContain(m.armor);
			expect(m.source, e.id).toMatch(/^(Monsters & More|GM Guide)/);
			expect((m.attacks?.length ?? 0) + (m.abilities?.length ?? 0), e.id).toBeGreaterThan(0);
		}
	});

	it('keeps legendary and minion roles', () => {
		const roles = raw.map(e => monsterRole(fromBestiary(e)));
		expect(roles.filter(r => r === 'legendary').length).toBeGreaterThan(30);
		expect(roles.filter(r => r === 'minion').length).toBeGreaterThan(10);
	});

	it('survives a copy to the vault and back', () => {
		const krogg = raw.find(e => e.id === 'krogg-goblin-king')!;
		const m = fromBestiary(krogg);
		const again = parseStatblock(toStatblockSource(m))!;
		expect(again.name).toBe(m.name);
		expect(again.role).toBe('legendary');
		expect(again.hp).toBe(m.hp);
		expect(again.attacks).toEqual(m.attacks);
		expect(again.lastStand).toBe(m.lastStand);
	});
});

describe('nimble-encounter blocks', () => {
	it.each([
		['- 2 Goblin', { name: 'Goblin', count: 2 }],
		['- 3x Goblin Minion', { name: 'Goblin Minion', count: 3 }],
		['- 4 × Kobold', { name: 'Kobold', count: 4 }],
		['- Ogre x2', { name: 'Ogre', count: 2 }],
		['- [[Klarg|the boss]]', { name: 'Klarg', count: 1 }],
		['- `nimble:Krogg, Goblin King`', { name: 'Krogg, Goblin King', count: 1 }],
	])('%s', (line, out) => expect(parseMonsterLine(line)).toEqual(out));

	it('parses and writes a block', () => {
		const def = parseEncounterBlock('name: Ambush\nparty: yes\nmonsters:\n- 2 Goblin\n- 1 Goblin\n- 4 Goblin Minion\nnotes: In the reeds.');
		expect(def).toEqual({ name: 'Ambush', party: true, monsters: [{ name: 'Goblin', count: 3 }, { name: 'Goblin Minion', count: 4 }], notes: 'In the reeds.' });
		expect(parseEncounterBlock(encounterBlockSource(def))).toEqual(def);
	});
});
