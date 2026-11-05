import { describe, expect, it } from 'vitest';
import { EncounterStore, isDown } from '../src/encounters';
import { parseHpCommand } from '../src/rules';
import { DEFAULT_SETTINGS, NimbleMonster, NimbleStatblocksSettings } from '../src/types';

const goblin: NimbleMonster = { name: 'Goblin', hp: 15, armor: 'none', movement: '6', level: '1/2' };
const knight: NimbleMonster = { name: 'Knight', hp: 40, armor: 'medium', movement: '6', level: 4 };
const minion: NimbleMonster = { name: 'Goblin Minion', hp: 0, armor: 'none', movement: '6', role: 'minion', attacks: [{ raw: '1d6' }] };
const krogg: NimbleMonster = {
	name: 'Krogg', hp: 112, hpPerHero: 28, armor: 'none', movement: '6', role: 'legendary',
	lastStand: 'At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium Armor.',
	bloodied: 'Enraged.',
};

function setup(over: Partial<NimbleStatblocksSettings> = {}) {
	const settings: NimbleStatblocksSettings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...over };
	const store = new EncounterStore(() => settings, async () => {});
	return { settings, store };
}
const dmg = (s: string) => parseHpCommand(s)!;

describe('adding combatants', () => {
	it('groups minions into one row', () => {
		const { store } = setup();
		store.add(minion, undefined, 4);
		store.add(minion, undefined, 2);
		const enc = store.active!;
		expect(enc.creatures).toHaveLength(1);
		expect(enc.creatures[0]).toMatchObject({ count: 6, alive: 6, label: 'Goblin Minion' });
	});

	it('scales legendary HP to the party', () => {
		const { store, settings } = setup();
		settings.party = [1, 2, 3, 4, 5].map(i => ({ id: `h${i}`, name: `H${i}`, level: 2, maxHp: 20 }));
		const [k] = store.add(krogg);
		expect(k.maxHp).toBe(140);
	});

	it('adds the party above the monsters', () => {
		const { store, settings } = setup();
		settings.party = [{ id: 'a', name: 'Brakka', level: 2, maxHp: 28, defense: 2 }];
		store.add(goblin);
		expect(store.addParty()).toBe(1);
		expect(store.addParty()).toBe(0);
		const enc = store.active!;
		expect(enc.creatures[0]).toMatchObject({ label: 'Brakka', side: 'hero', wounds: 0, maxWounds: 6, actions: 3 });
	});
});

describe('damage with Nimble rules', () => {
	it('applies armor unless the hit is a crit', () => {
		const { store } = setup();
		const [k] = store.add(knight);
		const enc = store.active!.id;
		expect(store.applyHp(enc, k.id, dmg('15')).breakdown).toBe('15 − 10 (Medium armor) = 5');
		expect(store.creature(enc, k.id)!.currentHp).toBe(35);
		store.applyHp(enc, k.id, dmg('15!'));
		expect(store.creature(enc, k.id)!.currentHp).toBe(20);
	});

	it('drops minions, with overkill', () => {
		const { store } = setup();
		const [g] = store.add(minion, undefined, 6);
		const enc = store.active!.id;
		store.applyHp(enc, g.id, dmg('3'));
		expect(store.creature(enc, g.id)!.alive).toBe(5);
		store.applyHp(enc, g.id, dmg('13'));
		expect(store.creature(enc, g.id)!.alive).toBe(3);
		store.applyHp(enc, g.id, dmg('+1'));
		expect(store.creature(enc, g.id)!.alive).toBe(4);
		store.applyHp(enc, g.id, dmg('99'));
		expect(isDown(store.creature(enc, g.id)!)).toBe(true);
	});

	it('gives heroes Wounds instead of dying outright', () => {
		const { store, settings } = setup();
		settings.party = [{ id: 'a', name: 'Ilse', level: 2, maxHp: 14 }];
		store.addParty();
		const enc = store.active!.id;
		const hero = store.active!.creatures[0];
		store.applyHp(enc, hero.id, dmg('20'));
		expect(store.creature(enc, hero.id)).toMatchObject({ currentHp: 0, wounds: 1 });
		store.applyHp(enc, hero.id, dmg('3!'));
		expect(store.creature(enc, hero.id)!.wounds).toBe(4);
		store.applyHp(enc, hero.id, dmg('+5'));
		expect(store.creature(enc, hero.id)!.currentHp).toBe(5);
	});

	it('runs a legendary monster through Bloodied and Last Stand', () => {
		const { store } = setup();
		const [k] = store.add(krogg);
		const enc = store.active!.id;
		expect(store.applyHp(enc, k.id, dmg('60')).crossed).toBe('bloodied');
		expect(store.applyHp(enc, k.id, dmg('60')).crossed).toBe('last-stand');
		store.applyLastStand(enc, k.id);
		const after = store.creature(enc, k.id)!;
		expect(after).toMatchObject({ currentHp: 20, lastStand: true });
		expect(after.monster.armor).toBe('medium');
		store.applyHp(enc, k.id, dmg('15'));
		expect(store.creature(enc, k.id)!.currentHp).toBe(15);
	});

	it('uses temp HP first', () => {
		const { store } = setup();
		const [g] = store.add(goblin);
		const enc = store.active!.id;
		store.applyHp(enc, g.id, dmg('t5'));
		store.applyHp(enc, g.id, dmg('7'));
		expect(store.creature(enc, g.id)).toMatchObject({ currentHp: 13, tempHp: 0 });
	});
});

describe('turns, rounds and conditions', () => {
	it('heroes first, then monsters once every hero has gone', () => {
		const { store, settings } = setup();
		settings.party = [{ id: 'a', name: 'A', level: 1, maxHp: 10 }, { id: 'b', name: 'B', level: 1, maxHp: 10 }];
		store.addParty();
		store.add(goblin);
		const enc = store.active!;
		store.start(enc.id);
		expect(enc.phase).toBe('heroes');
		const [a, b] = enc.creatures;
		store.setDone(enc.id, a.id, true);
		expect(enc.phase).toBe('heroes');
		store.setDone(enc.id, b.id, true);
		expect(enc.phase).toBe('monsters');
		store.nextRound(enc.id);
		expect(enc.round).toBe(2);
		expect(enc.phase).toBe('heroes');
		expect(enc.creatures.every(c => !c.done)).toBe(true);
	});

	it('counts condition durations down at the end of a turn, once per round', () => {
		const { store } = setup();
		const [g] = store.add(goblin);
		const enc = store.active!;
		store.start(enc.id);
		store.addCondition(enc.id, g.id, 'Dazed', { rounds: 1 });
		store.addCondition(enc.id, g.id, 'Slowed', { rounds: 2 });
		store.addCondition(enc.id, g.id, 'Empowered', { value: 2 });
		expect(store.setDone(enc.id, g.id, true)).toEqual(['Dazed']);
		// The round ending doesn't tick it a second time.
		store.nextRound(enc.id);
		expect(store.creature(enc.id, g.id)!.conditions).toEqual([
			{ name: 'Slowed', rounds: 1, tickedRound: 1 },
			{ name: 'Empowered', value: 2 },
		]);
		// A creature that never marks its turn still ticks when the round ends.
		store.nextRound(enc.id);
		expect(store.creature(enc.id, g.id)!.conditions.map(c => c.name)).toEqual(['Empowered']);
	});

	it('resets hero actions at the end of their turn', () => {
		const { store, settings } = setup();
		settings.party = [{ id: 'a', name: 'A', level: 1, maxHp: 10 }];
		store.addParty();
		const enc = store.active!;
		const h = enc.creatures[0];
		store.setActions(enc.id, h.id, 1);
		store.setDone(enc.id, h.id, true);
		expect(store.creature(enc.id, h.id)!.actions).toBe(3);
	});

	it('loads a prepared encounter and writes a summary', () => {
		const { store } = setup();
		const enc = store.loadTemplate({ name: 'Ambush', monsters: [{ monster: goblin, count: 2 }, { monster: minion, count: 3 }] }, 'Adventure.md')!;
		expect(enc.creatures.map(c => c.label)).toEqual(['Goblin-1', 'Goblin-2', 'Goblin Minion']);
		expect(enc.sourcePath).toBe('Adventure.md');
		store.applyHp(enc.id, enc.creatures[0].id, dmg('99'));
		store.applyHp(enc.id, enc.creatures[2].id, dmg('2'));
		expect(store.summary(enc.id)).toBe('**Ambush**: 1 round. Defeated: Goblin-1, 1 Goblin Minion. Still standing: Goblin-2 (15/15), 2 Goblin Minions.');
	});
});
