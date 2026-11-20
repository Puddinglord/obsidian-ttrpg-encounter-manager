import { describe, expect, it } from 'vitest';
import * as c5flow from '../src/systems/dnd5e/combat';
import { addCondition, addHero, concentrationDc, hpState, isDefeated, legendaryResistances, setConcentration, updateCondition, useResistance, addMonster, applyHp, current, deathSave, end, legendaryUses, newFight, next, normalizeFight, order, parseHp, previewHp, previous, remove, rollInitiative, setInitiative, start, useLegendary } from '../src/systems/dnd5e/combat';
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

describe('Start combat follows the encounter settings', async () => {
	const { newFight, addMonster, addHero, start } = await import('../src/systems/dnd5e/combat');
	const fight = () => {
		const f = newFight('T', '2024');
		addHero(f, { name: 'Mira', maxHp: 17, ac: 12 });
		const m = { name: 'Goblin', ac: 15, hp: 7, cr: '1/4', abilities: [8, 14, 10, 10, 8, 8] } as never;
		addMonster(f, m, 1);
		return f;
	};
	it('rolls both by default', () => {
		const f = fight();
		start(f, () => 0.5);
		expect(f.combatants.every(c => c.init !== undefined)).toBe(true);
	});
	it('leaves heroes blank for players to fill in', () => {
		const f = fight();
		start(f, () => 0.5, { monsters: true, heroes: false });
		expect(f.combatants.find(c => c.side === 'hero')!.init).toBeUndefined();
		expect(f.combatants.find(c => c.side === 'monster')!.init).toBeDefined();
	});
	it('leaves monsters blank too when asked', () => {
		const f = fight();
		start(f, () => 0.5, { monsters: false, heroes: false });
		expect(f.combatants.every(c => c.init === undefined)).toBe(true);
	});
});

describe('5e concentration, Legendary Resistance and HP at a glance', () => {
	const lich: Dnd5eMonster = { ...dragon, name: 'Lich', traits: [{ name: 'Legendary Resistance (4/Day, or 5/Day in Lair)', desc: 'If the lich fails a saving throw, it can choose to succeed instead.' }] };
	it('reads Legendary Resistance uses from the trait, in either edition\'s wording', () => {
		expect(legendaryResistances(lich)).toBe(4);
		expect(legendaryResistances({ ...goblin, traits: [{ name: 'Legendary Resistance', desc: '(3/Day). If the dragon fails a saving throw, it can choose to succeed instead.' }] })).toBe(3);
		expect(legendaryResistances(goblin)).toBeUndefined();
		const f = newFight();
		const [l] = addMonster(f, lich);
		expect(l.resistances).toEqual({ max: 4, used: 0 });
		useResistance(f, l.id);
		useResistance(f, l.id);
		useResistance(f, l.id, -1);
		expect(l.resistances?.used).toBe(1);
		expect(f.log.at(-1)?.text).toBe('Lich uses a Legendary Resistance');
		// They don't come back at the start of its turn, unlike legendary actions.
		start(f, faces(10));
		next(f);
		expect(l.resistances?.used).toBe(1);
	});
	it('asks for a concentration save on damage, and ends concentration at 0 HP', () => {
		expect(concentrationDc(7)).toBe(10);
		expect(concentrationDc(31)).toBe(15);
		expect(concentrationDc(80, '2024')).toBe(30);
		expect(concentrationDc(80, '2014')).toBe(40);
		const f = newFight();
		const [g] = addMonster(f, { ...goblin, hp: 40 });
		setConcentration(f, g.id, true);
		expect(g.concentrating).toBe(true);
		expect(applyHp(f, g.id, { kind: 'damage', amount: 24 })).toBe('Goblin takes 24; concentration save DC 12');
		expect(applyHp(f, g.id, { kind: 'damage', amount: 30 })).toBe('Goblin takes 30 and drops, concentration ends');
		expect(g.concentrating).toBeFalsy();
		setConcentration(f, g.id, false);
		expect(f.log.filter(l => /concentrat/.test(l.text)).length).toBe(3);
	});
	it('changes a condition\'s duration or value, and back to until removed', () => {
		const f = newFight();
		const [g] = addMonster(f, goblin);
		addCondition(f, g.id, 'Exhaustion', { value: 1 });
		updateCondition(f, g.id, 'exhaustion', { rounds: 2, value: 3 });
		expect(g.conditions[0]).toMatchObject({ name: 'Exhaustion', rounds: 2, value: 3 });
		updateCondition(f, g.id, 'Exhaustion', { rounds: null });
		expect(g.conditions[0].rounds).toBeUndefined();
	});
	it('reads HP as healthy, bloodied, critical or down; monsters at 0 and the dead are defeated', () => {
		const f = newFight();
		const [g] = addMonster(f, { ...goblin, hp: 20 });
		const h = addHero(f, { name: 'Bo', maxHp: 10 });
		expect(hpState(g)).toBe('healthy');
		g.hp = 10; expect(hpState(g)).toBe('bloodied');
		g.hp = 5; expect(hpState(g)).toBe('critical');
		g.hp = 0; expect(hpState(g)).toBe('down');
		expect(isDefeated(g)).toBe(true);
		h.hp = 0;
		expect(isDefeated(h)).toBe(false);
		h.dead = true;
		expect(isDefeated(h)).toBe(true);
	});
});

describe('dragging someone in the turn order', async () => {
	const { moveCombatant } = await import('../src/systems/dnd5e/combat');
	/** Goblin 20, Bo 15, Goblin 2 10, Ilse 5. */
	const fight = () => {
		const f = newFight();
		const [g1, g2] = addMonster(f, goblin, 2);
		const bo = addHero(f, { name: 'Bo', maxHp: 10 });
		const ilse = addHero(f, { name: 'Ilse', maxHp: 12 });
		setInitiative(f, g1.id, 20); setInitiative(f, bo.id, 15); setInitiative(f, g2.id, 10); setInitiative(f, ilse.id, 5);
		return { f, g1, g2, bo, ilse };
	};
	const labels = (f: ReturnType<typeof newFight>) => order(f).map(c => c.label);

	it('takes the initiative of the one now above it, and stays exactly where it was dropped', () => {
		const { f, ilse } = fight();
		expect(moveCombatant(f, ilse.id, 1)).toBe(true);
		expect(labels(f)).toEqual(['Goblin', 'Ilse', 'Bo', 'Goblin 2']);
		expect(ilse.init).toBe(20);
		// Sorting again (as every redraw does) keeps the drop.
		expect(labels(f)).toEqual(['Goblin', 'Ilse', 'Bo', 'Goblin 2']);
	});
	it('at the top, it takes the initiative of the one below and goes first', () => {
		const { f, g2 } = fight();
		moveCombatant(f, g2.id, 0);
		expect(labels(f)).toEqual(['Goblin 2', 'Goblin', 'Bo', 'Ilse']);
		expect(g2.init).toBe(20);
		expect(g2.tiebreak).toBe(1);
	});
	it('moving down lands after the one it was dropped below, even against a higher bonus', () => {
		const { f, g1, bo } = fight();
		bo.initBonus = 5;
		moveCombatant(f, g1.id, 2);
		expect(labels(f)).toEqual(['Bo', 'Goblin 2', 'Goblin', 'Ilse']);
		expect(g1.init).toBe(10);
		moveCombatant(f, g1.id, 0);
		expect(labels(f)).toEqual(['Goblin', 'Bo', 'Goblin 2', 'Ilse']);
		expect(g1.init).toBe(15);
	});
	it('does nothing when dropped where it was, or for someone not in the fight', () => {
		const { f, bo } = fight();
		expect(moveCombatant(f, bo.id, 1)).toBe(false);
		expect(moveCombatant(f, 'nobody', 0)).toBe(false);
		expect(bo.tiebreak).toBeUndefined();
	});
	it('the current turn stays with the same creature, and Next turn follows the new order', () => {
		const { f, g1, ilse } = fight();
		start(f);
		expect(current(f)?.id).toBe(g1.id);
		moveCombatant(f, ilse.id, 1);
		expect(current(f)?.id).toBe(g1.id);
		expect(next(f)?.label).toBe('Ilse');
		expect(next(f)?.label).toBe('Bo');
		expect(labels(f)).toEqual(['Goblin', 'Ilse', 'Bo', 'Goblin 2']);
	});
	it('counts in the list it is given: rows the tracker folds away keep their places', () => {
		const { f, g2, ilse } = fight();
		applyHp(f, g2.id, { kind: 'damage', amount: 10 });
		const active = (c: { side: string; hp: number }) => !(c.side === 'monster' && c.hp <= 0);
		// The active rows are Goblin, Bo, Ilse: Ilse to the middle lands between Goblin and Bo.
		moveCombatant(f, ilse.id, 1, active);
		expect(labels(f).filter(l => l !== 'Goblin 2')).toEqual(['Goblin', 'Ilse', 'Bo']);
		expect(ilse.init).toBe(20);
	});
	it('a new roll or a typed initiative drops the tiebreak', () => {
		const { f, ilse } = fight();
		moveCombatant(f, ilse.id, 0);
		expect(ilse.tiebreak).toBe(1);
		setInitiative(f, ilse.id, 3);
		expect(ilse.tiebreak).toBeUndefined();
		expect(labels(f).at(-1)).toBe('Ilse');
	});
	it('among those not yet rolled, keeps the dropped order', () => {
		const f = newFight();
		const [a, b, c] = addMonster(f, goblin, 3);
		moveCombatant(f, c.id, 0);
		expect(order(f).map(x => x.id)).toEqual([c.id, a.id, b.id]);
		expect(c.init).toBeUndefined();
	});
	it('old saved fights without tiebreaks load and sort as before', () => {
		const f = normalizeFight({ id: 'x', combatants: [{ id: 'a', label: 'A', side: 'monster', init: 10, initBonus: 0, conditions: [] }, { id: 'b', label: 'B', side: 'monster', init: 10, initBonus: 3, conditions: [], tiebreak: 'bad' }] })!;
		expect(f.combatants[1].tiebreak).toBeUndefined();
		expect(order(f).map(c => c.id)).toEqual(['b', 'a']);
	});
});

describe('timed conditions in the 5e tracker (core/tracker/effects.ts)', async () => {
	const c5 = await import('../src/systems/dnd5e/combat');
	const { trackerConditionsFor, conditionsFor } = await import('../src/systems/dnd5e/conditions');
	const burn = { kind: 'damage' as const, at: 'start' as const, dice: '1d4', damageType: 'Fire' };
	const hold = { kind: 'save' as const, at: 'end' as const, ability: 'Wisdom', dc: 13, endsOnSave: true };
	/** Goblin (20), Bo (15), Ogre (10), combat started: the goblin's turn. */
	const fight = () => {
		const f = newFight();
		const [g] = addMonster(f, goblin);
		const h = addHero(f, { name: 'Bo', maxHp: 20 });
		const [o] = addMonster(f, { ...goblin, name: 'Ogre', hp: 59, resistances: ['fire'], immunities: ['poison'], vulnerabilities: ['cold'], saves: { con: 6 } });
		setInitiative(f, g.id, 20); setInitiative(f, h.id, 15); setInitiative(f, o.id, 10);
		return { f, g, h, o };
	};

	it('starting combat asks for the first creature’s start-of-turn effects', () => {
		const { f, g } = fight();
		addCondition(f, g.id, 'Burning', { timing: { triggers: [burn] } });
		const r = c5.startCombat(f);
		expect(r.who?.id).toBe(g.id);
		expect(r.prompts).toEqual([{ bearerId: g.id, condition: 'Burning', trigger: burn }]);
	});

	it('Next turn ends this turn (end effects, counts) and starts the next (start effects)', () => {
		const { f, g, h } = fight();
		addCondition(f, g.id, 'Held', { timing: { triggers: [hold] } });
		addCondition(f, h.id, 'Burning', { timing: { triggers: [burn] } });
		c5.startCombat(f);
		const r = c5.nextTurn(f);
		expect(r.who?.id).toBe(h.id);
		expect(r.prompts.map(p => `${p.condition}@${p.trigger.at}`)).toEqual(['Held@end', 'Burning@start']);
	});

	it('a condition put on during its own turn lasts through its next turn; on another’s, it ends at the end of its own', () => {
		const { f, g, h } = fight();
		c5.startCombat(f); // the goblin's turn
		addCondition(f, g.id, 'Dodging', { rounds: 1 });
		addCondition(f, h.id, 'Frightened', { rounds: 1 });
		next(f); // the goblin's turn ends: Dodging stays
		expect(g.conditions.map(x => x.name)).toEqual(['Dodging']);
		next(f); // Bo's turn ends: Frightened ends
		expect(h.conditions).toEqual([]);
		next(f); next(f); // round 2: the goblin's turn ends
		expect(g.conditions).toEqual([]);
	});

	it('counts on the source’s turn, and on the bearer’s once the source is down', () => {
		const { f, g, h, o } = fight();
		c5.startCombat(f);
		addCondition(f, h.id, 'Hexed', { timing: { rounds: 2, whose: 'source' }, sourceId: o.id });
		expect(h.conditions[0]).toMatchObject({ whose: 'source', sourceId: o.id, sourceLabel: 'Ogre' });
		next(f); next(f); // Bo's turn ends: not the Ogre's
		expect(h.conditions[0].rounds).toBe(2);
		next(f); // the Ogre's turn ends
		expect(h.conditions[0].rounds).toBe(1);
		applyHp(f, o.id, { kind: 'damage', amount: 100 }); // the Ogre drops and takes no more turns
		next(f); next(f); // Bo's turn ends: now it counts there
		expect(h.conditions).toEqual([]);
	});

	it('Back puts back what the last Next did to conditions, and Next again doesn’t ask twice', () => {
		const { f, g, h } = fight();
		addCondition(f, g.id, 'Dazed', { rounds: 1 });
		addCondition(f, h.id, 'Burning', { timing: { triggers: [burn] } });
		c5.startCombat(f);
		expect(c5.nextTurn(f).prompts).toHaveLength(1);
		expect(g.conditions).toEqual([]);
		previous(f);
		expect(current(f)?.id).toBe(g.id);
		expect(g.conditions).toEqual([{ name: 'Dazed', rounds: 1 }]);
		const again = c5.nextTurn(f);
		expect(again.prompts).toEqual([]);
		expect(g.conditions).toEqual([]);
		// Only one step back is undone: a second Back just moves.
		previous(f);
		previous(f);
		expect(f.undo).toBeUndefined();
	});

	it('effect damage follows the stat block: resisted, vulnerable, immune', () => {
		const { f, o, h } = fight();
		expect(c5.effectDamage(f, o.id, 4, 'Fire')).toMatch(/takes 2 \(resisted\)/);
		expect(c5.effectDamage(f, o.id, 4, 'cold')).toMatch(/takes 8 \(vulnerable\)/);
		expect(c5.effectDamage(f, o.id, 4, 'Poison')).toBe('Ogre is immune to Poison damage');
		expect(o.hp).toBe(59 - 2 - 8);
		expect(c5.effectDamage(f, h.id, 3, 'Fire')).toMatch(/Bo takes 3/);
		expect(h.hp).toBe(17);
	});

	it('knows a monster’s save by the ability’s name or its short form; not a hero’s', () => {
		const { f, g, o, h } = fight();
		expect(c5.saveBonus5e(f, o.id, 'Constitution')).toBe(6);
		expect(c5.saveBonus5e(f, o.id, 'CON')).toBe(6);
		expect(c5.saveBonus5e(f, g.id, 'Dexterity')).toBe(2);
		expect(c5.saveBonus5e(f, g.id, 'Luck')).toBeUndefined();
		expect(c5.saveBonus5e(f, h.id, 'Wisdom')).toBeUndefined();
	});

	it('retimes a condition from its chip; a fight saved with an undo step loads with it', () => {
		const { f, g } = fight();
		addCondition(f, g.id, 'Prone');
		c5.retimeCondition(f, g.id, 'Prone', { rounds: 2, ends: 'start' });
		expect(g.conditions).toEqual([{ name: 'Prone', rounds: 2, ends: 'start' }]);
		c5.startCombat(f);
		next(f);
		expect(normalizeFight(JSON.parse(JSON.stringify(f)))?.undo?.turnId).toBe(f.turnId);
		expect(normalizeFight({ ...JSON.parse(JSON.stringify(f)), undo: 'junk' })?.undo).toBeUndefined();
	});

	it('2024 offers Burning from the SRD 5.2 glossary with its effect; 2014 has nothing like it', () => {
		const b = trackerConditionsFor('2024').find(c => c.name === 'Burning');
		expect(b?.timing).toEqual({ triggers: [burn] });
		expect(b?.description).toMatch(/1d4 Fire damage at the start of each of its turns/);
		expect(trackerConditionsFor('2014').some(c => c.name === 'Burning')).toBe(false);
		expect(conditionsFor('2024').some(c => c.name === 'Burning')).toBe(false); // not a condition in the rules' sense
	});
});

describe('the card and the queue (5e)', () => {
	const setupFight = () => {
		const f = newFight();
		const [g1, g2] = addMonster(f, goblin, 2);
		const a = addHero(f, { name: 'Ari', maxHp: 10 });
		const b = addHero(f, { name: 'Bo', maxHp: 10 });
		setInitiative(f, a.id, 20); setInitiative(f, g1.id, 15); setInitiative(f, g2.id, 15); setInitiative(f, b.id, 5);
		start(f);
		return { f, a, b, g1, g2 };
	};

	it('tapped out of order: they act now, whoever was up stays still to act, Next goes back to them', () => {
		const { f, a, b, g1 } = setupFight();
		expect(current(f)?.id).toBe(a.id);
		c5flow.activate(f, b.id);
		expect(current(f)?.id).toBe(b.id);
		expect(c5flow.upNext(f)?.id).toBe(a.id);
		next(f);
		expect(current(f)?.id).toBe(a.id);
		expect(c5flow.actedIds(f).has(b.id)).toBe(true);
		next(f);
		expect(current(f)?.id).toBe(g1.id);
	});

	it('Back after a tap puts the turn and the acted set back', () => {
		const { f, a, b } = setupFight();
		next(f);
		c5flow.activate(f, b.id);
		previous(f);
		expect(current(f)?.label).toBe('Goblin');
		expect([...c5flow.actedIds(f)]).toEqual([a.id]);
	});

	it('the round ends when everyone has acted, whatever the order', () => {
		const { f, b } = setupFight();
		c5flow.activate(f, b.id);
		next(f); next(f); next(f);
		expect(f.round).toBe(1);
		next(f);
		expect(f.round).toBe(2);
		expect(c5flow.actedIds(f).size).toBe(0);
	});

	it('identical monsters share one roll and one row, and are run one member at a time', () => {
		const f = newFight();
		const [g1, g2, g3] = addMonster(f, goblin, 3);
		addHero(f, { name: 'Bo', maxHp: 10 });
		rollInitiative(f, faces(10, 3, 17));
		expect(new Set([g1.init, g2.init, g3.init]).size).toBe(1);
		expect(c5flow.groupOf(f, g2.id).map(c => c.id)).toEqual([g1.id, g2.id, g3.id]);
		start(f, faces(1));
		expect(current(f)?.id).toBe(g1.id);
		expect(c5flow.upNext(f)?.id).toBe(g2.id);
	});

	it('a fight saved before the acted set reads everyone before the turn as acted', () => {
		const { f, a, g1 } = setupFight();
		next(f);
		delete f.acted;
		expect([...c5flow.actedIds(f)]).toEqual([a.id]);
		expect(current(f)?.id).toBe(g1.id);
		const back = normalizeFight(JSON.parse(JSON.stringify({ ...f, acted: [a.id, 7] })))!;
		expect(back.acted).toEqual([a.id]);
	});
});
