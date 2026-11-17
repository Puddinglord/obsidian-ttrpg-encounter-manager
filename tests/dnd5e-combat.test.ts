import { describe, expect, it } from 'vitest';
import { addCondition, addHero, addMonster, applyHp, current, deathSave, end, legendaryUses, newFight, next, normalizeFight, order, parseHp, previewHp, previous, remove, rollInitiative, setInitiative, start, useLegendary } from '../src/systems/dnd5e/combat';
import type { Dnd5eMonster } from '../src/systems/dnd5e/types';

const goblin: Dnd5eMonster = { name: 'Goblin', ac: 15, hp: 7, cr: '1/4', abilities: [8, 14, 10, 10, 8, 8] };
const dragon: Dnd5eMonster = { name: 'Dragon', ac: 19, hp: 256, cr: '17', abilities: [27, 10, 25, 16, 13, 21], legendaryActions: [{ name: 'Tail', desc: '' }], legendaryIntro: 'Legendary Action Uses: 3 (4 in Lair).' };
/** An RNG that gives these d20 faces in turn. */
const faces = (...ns: number[]) => { let i = 0; return () => (ns[i++ % ns.length] - 0.5) / 20; };

describe('a 5e fight', () => {
	it('labels copies, and orders by initiative: ties to the higher bonus, then heroes', () => {
		const f = newFight();
		const [a, b] = addMonster(f, goblin, 2);
		expect([a.label, b.label]).toEqual(['Goblin', 'Goblin 2']);
		expect(a.initBonus).toBe(2);
		const hero = addHero(f, { name: 'Ilse', maxHp: 20, ac: 16, initBonus: 2 });
		setInitiative(f, a.id, 12); setInitiative(f, b.id, 15); setInitiative(f, hero.id, 12);
		expect(order(f).map(c => c.label)).toEqual(['Goblin 2', 'Ilse', 'Goblin']);
	});
	it('rolls d20 + bonus for monsters; starting rolls for anyone still missing', () => {
		const f = newFight();
		const [g] = addMonster(f, goblin);
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		rollInitiative(f, faces(10));
		expect(g.init).toBe(12);
		expect(h.init).toBeUndefined();
		start(f, faces(5));
		expect(h.init).toBe(5);
		expect(f.round).toBe(1);
		expect(current(f)?.id).toBe(g.id);
	});
	it('passes turns in order, starts a new round after the last, and skips fallen monsters', () => {
		const f = newFight();
		const [g1, g2] = addMonster(f, goblin, 2);
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		setInitiative(f, g1.id, 20); setInitiative(f, h.id, 15); setInitiative(f, g2.id, 10);
		start(f);
		expect(current(f)?.label).toBe('Goblin');
		expect(next(f)?.label).toBe('Bo');
		applyHp(f, g2.id, { kind: 'damage', amount: 10 });
		expect(next(f)?.label).toBe('Goblin');
		expect(f.round).toBe(2);
		expect(previous(f)?.label).toBe('Bo');
		expect(f.round).toBe(1);
	});
	it('a monster killed on its own turn hands over to whoever came next', () => {
		const f = newFight();
		const [g1, g2] = addMonster(f, goblin, 2);
		setInitiative(f, g1.id, 20); setInitiative(f, g2.id, 10);
		start(f);
		applyHp(f, g1.id, { kind: 'damage', amount: 7 });
		expect(next(f)?.id).toBe(g2.id);
	});
	it('counts conditions down at the end of their bearer’s turn', () => {
		const f = newFight();
		const [g] = addMonster(f, goblin);
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		setInitiative(f, g.id, 20); setInitiative(f, h.id, 10);
		addCondition(f, g.id, 'Frightened', { rounds: 1 });
		addCondition(f, h.id, 'Prone');
		start(f);
		next(f); // the goblin's turn ends
		expect(g.conditions).toEqual([]);
		expect(h.conditions.map(c => c.name)).toEqual(['Prone']);
		expect(f.log.some(l => /Frightened ended/.test(l.text))).toBe(true);
	});
	it('mid-fight arrivals roll initiative at once', () => {
		const f = newFight();
		addHero(f, { name: 'Bo', maxHp: 10 });
		start(f, faces(10));
		const [late] = addMonster(f, goblin, 1, { rng: faces(18) });
		expect(late.init).toBe(20);
	});
	it('removing the current combatant moves the turn on', () => {
		const f = newFight();
		const [g1, g2] = addMonster(f, goblin, 2);
		setInitiative(f, g1.id, 20); setInitiative(f, g2.id, 10);
		start(f);
		remove(f, g1.id);
		expect(current(f)?.id).toBe(g2.id);
		end(f);
		expect(f.round).toBe(0);
		expect(current(f)).toBeUndefined();
	});
});

describe('hit points', () => {
	it('reads what is typed: damage, a crit, healing, temp HP, a set value', () => {
		expect(parseHp('7')).toMatchObject({ kind: 'damage', amount: 7, crit: false });
		expect(parseHp('-7')).toMatchObject({ kind: 'damage', amount: 7 });
		expect(parseHp('!7')).toMatchObject({ kind: 'damage', amount: 7, crit: true });
		expect(parseHp('7!')).toMatchObject({ kind: 'damage', amount: 7, crit: true });
		expect(parseHp('7v')).toMatchObject({ kind: 'damage', amount: 7, type: 'vulnerable' });
		expect(parseHp('7r!')).toMatchObject({ kind: 'damage', amount: 7, type: 'resisted', crit: true });
		expect(parseHp('+5')).toEqual({ kind: 'heal', amount: 5 });
		expect(parseHp('t8')).toEqual({ kind: 'temp', amount: 8 });
		expect(parseHp('=3')).toEqual({ kind: 'set', amount: 3 });
		expect(parseHp('lots')).toBeNull();
	});
	it('vulnerable doubles damage; resisted halves it, rounding down', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 30 });
		expect(applyHp(f, h.id, parseHp('7v')!)).toBe('Bo takes 14 (vulnerable)');
		expect(applyHp(f, h.id, parseHp('7r')!)).toBe('Bo takes 3 (resisted)');
		expect(f.combatants[0].hp).toBe(30 - 14 - 3);
	});
	it('previews a change without making it (the HP keypad)', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 20 });
		expect(previewHp(f, h.id, parseHp('7v')!)).toBe('→ 6/20 · takes 14 (vulnerable)');
		expect(previewHp(f, h.id, parseHp('25')!)).toBe('→ 0/20 · takes 25 and falls unconscious');
		expect(f.combatants[0].hp).toBe(20);
		expect(f.log.length).toBe(0);
	});
	it('takes damage from temp HP first; temp HP don’t stack; healing stops at the maximum', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 20 });
		applyHp(f, h.id, { kind: 'temp', amount: 5 });
		applyHp(f, h.id, { kind: 'temp', amount: 3 });
		expect(h.tempHp).toBe(5);
		applyHp(f, h.id, { kind: 'damage', amount: 8 });
		expect([h.tempHp, h.hp]).toEqual([0, 17]);
		applyHp(f, h.id, { kind: 'heal', amount: 10 });
		expect(h.hp).toBe(20);
	});
	it('a hero at 0 makes death saves: damage is a failure (a crit two), a 20 brings them back', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 20 });
		applyHp(f, h.id, { kind: 'damage', amount: 25 });
		expect([h.hp, h.dead, h.deathSaves]).toEqual([0, undefined, { success: 0, failure: 0 }]);
		deathSave(f, h.id, 'success');
		applyHp(f, h.id, { kind: 'damage', amount: 3, crit: true });
		expect(h.deathSaves).toEqual({ success: 1, failure: 2 });
		deathSave(f, h.id, 'nat20');
		expect([h.hp, h.deathSaves]).toEqual([1, undefined]);
	});
	it('three successes stabilise, three failures (a 1 counts twice) kill', () => {
		const f = newFight();
		const a = addHero(f, { name: 'A', maxHp: 10 });
		const b = addHero(f, { name: 'B', maxHp: 10 });
		applyHp(f, a.id, { kind: 'damage', amount: 10 });
		applyHp(f, b.id, { kind: 'damage', amount: 10 });
		for (let i = 0; i < 3; i++) deathSave(f, a.id, 'success');
		expect(a.stable).toBe(true);
		deathSave(f, b.id, 'nat1');
		deathSave(f, b.id, 'failure');
		expect(b.dead).toBe(true);
	});
	it('massive damage kills outright: what is left after 0 is at least the HP maximum', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		applyHp(f, h.id, { kind: 'damage', amount: 20 });
		expect(h.dead).toBe(true);
	});
	it('healing a hero at 0 ends the death saves', () => {
		const f = newFight();
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		applyHp(f, h.id, { kind: 'damage', amount: 10 });
		deathSave(f, h.id, 'failure');
		applyHp(f, h.id, { kind: 'heal', amount: 4 });
		expect([h.hp, h.deathSaves]).toEqual([4, undefined]);
	});
});

describe('legendary actions', () => {
	it('reads the uses from either edition’s wording and refreshes them on the creature’s turn', () => {
		expect(legendaryUses(dragon)).toBe(3);
		expect(legendaryUses({ ...dragon, legendaryIntro: 'The dragon can take 3 legendary actions, choosing from the options below.' })).toBe(3);
		expect(legendaryUses(goblin)).toBeUndefined();
		const f = newFight();
		const [d] = addMonster(f, dragon);
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		setInitiative(f, d.id, 20); setInitiative(f, h.id, 10);
		start(f);
		next(f);
		useLegendary(f, d.id); useLegendary(f, d.id);
		expect(d.legendary?.used).toBe(2);
		next(f);
		expect(d.legendary?.used).toBe(0);
	});
});

describe('saved fights', () => {
	it('come back from whatever was saved, dropping what can’t be used', () => {
		expect(normalizeFight(null)).toBeNull();
		expect(normalizeFight({ name: 'x' })).toBeNull();
		const f = normalizeFight({ id: 'a', edition: '2014', combatants: [null, { id: 'c', label: 'G', conditions: 'bad' }], round: 2 })!;
		expect(f.edition).toBe('2014');
		expect(f.combatants).toHaveLength(1);
		expect(f.combatants[0].conditions).toEqual([]);
		expect(f.combatants[0].tempHp).toBe(0);
	});
});
