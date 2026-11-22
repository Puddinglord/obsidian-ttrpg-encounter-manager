import { describe, expect, it } from 'vitest';
import { EncounterStore, fightInProgress, isDown, monsterHit, sameFight } from '../src/systems/nimble/encounters';
import { parseHpCommand } from '../src/systems/nimble/rules';
import { DEFAULT_SETTINGS, NimbleMonster, NimbleStatblocksSettings } from '../src/systems/nimble/types';

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

describe('review fixes', () => {
	it('a cleared or freshly loaded encounter does not offer to resume the old fight', () => {
		const { store } = setup();
		store.add(goblin);
		const enc = store.active!;
		store.start(enc.id);
		store.end(enc.id);
		expect(enc.paused).toBeTruthy();
		store.clear(enc.id);
		expect(enc.paused).toBeUndefined();

		store.add(goblin);
		store.start(enc.id);
		store.end(enc.id);
		const loaded = store.loadTemplate({ name: 'Ambush', monsters: [{ monster: goblin, count: 1 }] })!;
		expect(loaded.id).toBe(enc.id);
		expect(loaded.paused).toBeUndefined();
		expect(store.resume(loaded.id)).toBe(false);
	});

	it('Last Stand applies once', () => {
		const { store } = setup();
		const [k] = store.add(krogg);
		const enc = store.active!.id;
		store.applyHp(enc, k.id, dmg('200'));
		expect(store.applyLastStand(enc, k.id)).toContain('Last Stand');
		store.applyHp(enc, k.id, dmg('15!'));
		const logged = store.active!.log!.length;
		expect(store.applyLastStand(enc, k.id)).toBeNull();
		expect(store.creature(enc, k.id)!.currentHp).toBe(5);
		expect(store.active!.log!.length).toBe(logged);
	});

	it('knows when replacing the tracker would lose a fight', () => {
		const { store, settings } = setup();
		expect(fightInProgress(store.active)).toBe(false);
		const [g] = store.add(goblin);
		const enc = store.active!;
		expect(fightInProgress(enc)).toBe(false); // set up, untouched: nothing to lose
		store.applyHp(enc.id, g.id, dmg('3'));
		expect(fightInProgress(enc)).toBe(true); // damage in setup
		store.applyHp(enc.id, g.id, dmg('+3'));
		expect(fightInProgress(enc)).toBe(false);
		store.start(enc.id);
		expect(fightInProgress(enc)).toBe(true); // running
		store.end(enc.id);
		expect(fightInProgress(enc)).toBe(true); // ended part-way: Resume is on offer
		store.clear(enc.id);
		expect(fightInProgress(enc)).toBe(false);

		settings.party = [{ id: 'h1', name: 'Ana', level: 1, maxHp: 10 }];
		const hero = store.addHero(settings.party[0])!;
		store.setWounds(enc.id, hero.id, 1);
		expect(fightInProgress(enc)).toBe(true); // Wounds
		store.setWounds(enc.id, hero.id, 0);
		const [m] = store.add(minion, undefined, 3);
		expect(fightInProgress(enc)).toBe(false);
		store.setAlive(enc.id, m.id, 2);
		expect(fightInProgress(enc)).toBe(true); // a minion down
	});

	it('tells one fight from another, even when both use the single tracker encounter', () => {
		const { store } = setup();
		store.loadTemplate({ name: 'Current Encounter', monsters: [{ monster: goblin, count: 2 }] });
		const first = JSON.parse(JSON.stringify(store.active!));
		store.applyHp(store.active!.id, store.active!.creatures[0].id, dmg('5'));
		expect(sameFight(first, store.active!)).toBe(true); // later in the same fight
		store.loadTemplate({ name: 'Current Encounter', monsters: [{ monster: goblin, count: 2 }] });
		expect(store.active!.id).toBe(first.id);
		expect(sameFight(first, store.active!)).toBe(false); // same name and id, a new fight
		// Restored from a note (a new id in multi mode), it's still the fight that was saved.
		const multi = setup({ multipleEncounters: true });
		const restored = multi.store.restore(first)!;
		expect(restored.id).not.toBe(first.id);
		expect(sameFight(first, restored)).toBe(true);
	});

	it('a hit on a monster with temp HP: the preview maths is what gets applied', () => {
		const { store } = setup();
		const [k] = store.add(knight);
		const enc = store.active!.id;
		store.applyHp(enc, k.id, dmg('t5'));
		const before = store.creature(enc, k.id)!;
		const hit = monsterHit(before, 20, false, { autoArmor: true }); // Medium armor takes 10 off
		expect(hit).toMatchObject({ applied: 10, absorbed: 5, taken: 5, hp: 35 });
		store.applyHp(enc, k.id, dmg('20'));
		expect(store.creature(enc, k.id)).toMatchObject({ currentHp: hit.hp, tempHp: 0 });
		// No temp HP left: nothing absorbed.
		expect(monsterHit(store.creature(enc, k.id)!, 20, false, { autoArmor: true })).toMatchObject({ absorbed: 0, taken: 10, hp: 25 });
	});
});

describe('timed conditions on Nimble’s sides (core/tracker/effects.ts)', () => {
	const burn = { kind: 'damage' as const, at: 'start' as const, dice: '1d4', damageType: 'Fire' };
	const save = { kind: 'save' as const, at: 'end' as const, ability: 'STR', dc: 12, endsOnSave: true };
	const party = (settings: NimbleStatblocksSettings) => { settings.party = [{ id: 'a', name: 'A', level: 1, maxHp: 10 }]; };
	const listen = (store: EncounterStore) => {
		const got: string[] = [];
		store.on('effects', (...args: unknown[]) => { for (const p of args[1] as { condition: string; trigger: { at: string } }[]) got.push(`${p.condition}@${p.trigger.at}`); });
		return got;
	};

	it('start effects fire when the creature’s side begins its turn, once a round', () => {
		const { store, settings } = setup();
		party(settings);
		store.addParty();
		const [g] = store.add(goblin);
		const enc = store.active!;
		const got = listen(store);
		store.addCondition(enc.id, g.id, 'Burning', { timing: { triggers: [burn] } });
		store.start(enc.id);
		expect(got).toEqual([]); // heroes go first
		store.setDone(enc.id, enc.creatures[0].id, true); // the last hero is done: the monsters' turn starts
		expect(enc.phase).toBe('monsters');
		expect(got).toEqual(['Burning@start']);
		store.setPhase(enc.id, 'heroes');
		store.setPhase(enc.id, 'monsters'); // toggled back: not asked twice in a round
		expect(got).toEqual(['Burning@start']);
		store.nextRound(enc.id);
		store.setPhase(enc.id, 'monsters');
		expect(got).toEqual(['Burning@start', 'Burning@start']);
	});

	it('end effects fire when the turn is marked done, or when the round ends without it', () => {
		const { store } = setup();
		const [g, g2] = store.add(goblin, undefined, 2);
		const enc = store.active!;
		const got = listen(store);
		store.addCondition(enc.id, g.id, 'Held', { timing: { triggers: [save] } });
		store.addCondition(enc.id, g2.id, 'Held', { timing: { triggers: [save] } });
		store.start(enc.id);
		store.setDone(enc.id, g.id, true);
		expect(got).toEqual(['Held@end']);
		store.setDone(enc.id, g.id, false);
		store.setDone(enc.id, g.id, true); // undone and done again: asked once
		expect(got).toEqual(['Held@end']);
		store.nextRound(enc.id); // g2 never marked its turn
		expect(got).toEqual(['Held@end', 'Held@end']);
	});

	it('a condition can count down on the turn of the creature that caused it', () => {
		const { store, settings } = setup();
		party(settings);
		store.addParty();
		const [g] = store.add(goblin);
		const enc = store.active!;
		const hero = enc.creatures[0];
		store.addCondition(enc.id, g.id, 'Frightened', { timing: { rounds: 1, whose: 'source' }, sourceId: hero.id });
		expect(store.creature(enc.id, g.id)!.conditions[0]).toMatchObject({ rounds: 1, whose: 'source', sourceId: hero.id, sourceLabel: hero.label });
		store.start(enc.id);
		store.setDone(enc.id, hero.id, true);
		expect(store.creature(enc.id, g.id)!.conditions).toEqual([]);
		expect(enc.log?.some(l => /Goblin.*: Frightened wore off/.test(l.text))).toBe(true);
	});

	it('changes a condition’s timing from its chip', () => {
		const { store } = setup();
		const [g] = store.add(goblin);
		const enc = store.active!;
		store.addCondition(enc.id, g.id, 'Dazed', { rounds: 2 });
		store.retimeCondition(enc.id, g.id, 'Dazed', { triggers: [burn] });
		expect(store.creature(enc.id, g.id)!.conditions).toEqual([{ name: 'Dazed', triggers: [burn] }]);
	});
});

describe('the card and the queue (Nimble)', () => {
	const heroes = (settings: NimbleStatblocksSettings) => {
		settings.party = [
			{ id: 'a', name: 'Aria', level: 2, maxHp: 10, defense: 3 },
			{ id: 'b', name: 'Bram', level: 2, maxHp: 20, defense: 5 },
		];
	};
	const fight = (over: Partial<NimbleStatblocksSettings> = {}, boss = false) => {
		const { store, settings } = setup(over);
		heroes(settings);
		store.addParty();
		const [g1] = store.add(goblin);
		const [g2] = store.add(knight);
		const k = boss ? store.add(krogg)[0] : undefined;
		const enc = store.active!;
		const [aria, bram] = enc.creatures;
		store.start(enc.id);
		return { store, settings, enc, aria, bram, g1, g2, k };
	};

	it('assumes no order among heroes: nobody is on the card until someone is tapped', () => {
		const { store, enc, aria, bram } = fight();
		expect(enc.acting).toBeUndefined();
		store.setActing(enc.id, bram.id);
		expect(enc.acting).toBe(bram.id);
		store.next(enc.id); // Done
		expect(store.creature(enc.id, bram.id)!.done).toBe(true);
		expect(enc.acting).toBeUndefined();
		expect(enc.phase).toBe('heroes');
		store.setActing(enc.id, aria.id);
		store.next(enc.id);
		expect(enc.phase).toBe('monsters');
	});

	it('the monsters’ side: the first monster is up, Next goes down the list, the last one starts the next round', () => {
		const { store, enc, aria, bram, g1, g2 } = fight();
		store.setDone(enc.id, aria.id, true);
		store.setDone(enc.id, bram.id, true);
		expect(enc.phase).toBe('monsters');
		expect(enc.acting).toBe(g1.id);
		store.next(enc.id);
		expect(store.creature(enc.id, g1.id)!.done).toBe(true);
		expect(enc.acting).toBe(g2.id);
		store.next(enc.id);
		expect(enc.round).toBe(2);
		expect(enc.phase).toBe('heroes');
		expect(enc.acting).toBeUndefined();
		expect(enc.creatures.every(c => !c.done)).toBe(true);
	});

	it('Next says what wore off: on the creature whose turn ended, and at the round\'s end', () => {
		const { store, enc, aria, bram, g1, g2 } = fight();
		store.addCondition(enc.id, g1.id, 'Dazed', { rounds: 1 });
		store.addCondition(enc.id, g2.id, 'Prone', { rounds: 1 });
		store.setDone(enc.id, aria.id, true);
		store.setDone(enc.id, bram.id, true);
		expect(enc.acting).toBe(g1.id);
		expect(store.next(enc.id)).toEqual(['Goblin: Dazed wore off']); // a lone goblin is shown without its number
		expect(store.creature(enc.id, g1.id)!.conditions).toEqual([]);
		// The last monster's Next ends its turn too, then starts the round.
		expect(store.next(enc.id)).toEqual([expect.stringMatching(/^\S.*: Prone wore off$/)]);
		expect(enc.round).toBe(2);
		expect(store.next(enc.id)).toEqual([]);
	});

	it('any monster can be tapped, on either side; nothing is enforced', () => {
		const { store, enc, g2 } = fight();
		store.setActing(enc.id, g2.id);
		expect(enc.acting).toBe(g2.id);
		expect(enc.phase).toBe('heroes');
		store.next(enc.id);
		expect(store.creature(enc.id, g2.id)!.done).toBe(true);
		expect(enc.acting).toBeUndefined();
	});

	it('the legendary beat: Done on a hero turns the card to the boss; Next goes back to the heroes', () => {
		const { store, enc, aria, bram, k } = fight({}, true);
		store.setActing(enc.id, aria.id);
		store.next(enc.id);
		expect(enc.acting).toBe(k!.id);
		expect(enc.beat).toEqual({ after: aria.id });
		store.useBeatAction(enc.id, k!.id, 'Crack Skulls');
		expect(store.creature(enc.id, k!.id)!.lastAction).toBe('Crack Skulls');
		store.next(enc.id);
		expect(enc.beat).toBeUndefined();
		expect(enc.acting).toBeUndefined();
		expect(enc.phase).toBe('heroes');
		// After the last hero, the beat, then the monsters' side (the boss has no turn of its own there).
		store.setActing(enc.id, bram.id);
		store.next(enc.id);
		expect(enc.acting).toBe(k!.id);
		store.next(enc.id);
		expect(enc.phase).toBe('monsters');
		expect(enc.acting).not.toBe(k!.id);
	});

	it('the beat can be turned off', () => {
		const { store, enc, aria, k } = fight({ legendaryBeat: false }, true);
		store.setActing(enc.id, aria.id);
		store.next(enc.id);
		expect(enc.acting).toBeUndefined();
		expect(k).toBeDefined();
	});

	it('Back undoes a step: who was on the card, who had gone, and a hero’s actions', () => {
		const { store, enc, aria } = fight();
		store.setActing(enc.id, aria.id);
		store.setActions(enc.id, aria.id, 1);
		store.addCondition(enc.id, aria.id, 'Dazed', { rounds: 1 });
		store.next(enc.id);
		expect(store.creature(enc.id, aria.id)!.conditions).toEqual([]);
		expect(store.canGoBack(enc.id)).toBe(true);
		expect(store.back(enc.id)).toBe(true);
		const a = store.creature(enc.id, aria.id)!;
		expect(a.done).toBe(false);
		expect(a.actions).toBe(1);
		expect(a.conditions.map(c => [c.name, c.rounds])).toEqual([['Dazed', 1]]);
		expect(enc.acting).toBe(aria.id);
		expect(store.canGoBack(enc.id)).toBe(false);
	});

	it('Initiative before the fight sets a hero’s first-turn actions', () => {
		const { store, settings } = setup();
		heroes(settings);
		store.addParty();
		const enc = store.active!;
		const a = enc.creatures[0];
		store.setInitiative(enc.id, a.id, 7);
		expect(store.creature(enc.id, a.id)).toMatchObject({ init: 7, actions: 1 });
		store.setInitiative(enc.id, a.id, 14);
		expect(store.creature(enc.id, a.id)!.actions).toBe(2);
		store.setInitiative(enc.id, a.id, 22);
		expect(store.creature(enc.id, a.id)!.actions).toBe(3);
	});

	it('Defend takes the hero’s Armor off and costs an action; Interpose sends the hit to a friend', () => {
		const { store, enc, aria, bram } = fight();
		store.heroHit(enc.id, aria.id, dmg('5'), { defend: true });
		expect(store.creature(enc.id, aria.id)).toMatchObject({ currentHp: 8, actions: 2 });
		store.heroHit(enc.id, aria.id, dmg('5!'), { defend: true });
		expect(store.creature(enc.id, aria.id)!.currentHp).toBe(3); // a crit: Armor doesn't help
		store.heroHit(enc.id, aria.id, dmg('9'), { interpose: bram.id, defend: true });
		expect(store.creature(enc.id, aria.id)!.currentHp).toBe(3);
		expect(store.creature(enc.id, bram.id)).toMatchObject({ currentHp: 16, actions: 1 });
	});
});
