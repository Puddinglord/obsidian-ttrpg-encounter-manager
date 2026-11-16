import { describe, expect, it } from 'vitest';
import { readStatblock } from '../src/parser';
import {
	attackBody, autoLevel, draftFromMonster, effectiveHp, levelCheck, newMonsterDraft, setRole, splitAttack, toMonster, toSource, withDice,
} from '../src/entity-monster';

const party = { level: 4, size: 4 };

describe('quick build', () => {
	it('fills a regular monster from the GM Guide table, and the block reads back clean', () => {
		const d = { ...newMonsterDraft(party), name: 'Cave Bear' };
		const src = toSource(d);
		expect(src).toBe('name: Cave Bear\nlevel: 4\nsize: Medium\nhp: 52\nattacks:\n- **Strike.** 1d8+13.');
		const { monster, issues } = readStatblock(src);
		expect(issues).toEqual([]);
		expect(monster!.hp).toBe(52);
		expect(levelCheck(d)!.verdict).toBe(0);
	});

	it('makes a solo with HP per hero, small and big attacks, Bloodied and a Last Stand the tracker can use', () => {
		const d = { ...newMonsterDraft({ level: 10, size: 4 }, 'solo'), name: 'Wyrm' };
		const m = toMonster(d);
		expect(m).toMatchObject({ role: 'legendary', roleLabel: 'Solo', hpPerHero: 86, hp: 344, actionText: 'After each hero\'s turn, choose one:' });
		expect(m.attacks?.map(a => a.raw)).toEqual(['**Lunge.** Move 6. 1d8+15.', '**Crush.** 2d8+21.']);
		expect(m.lastStand).toBe('Regains 33 HP per hero and fights on.');
		expect(m.bloodied).toBe('Its damage dice grow a size: d8s become d10s.');
		expect(readStatblock(toSource(d)).issues).toEqual([]);
	});

	it('makes minions with the party level\'s die', () => {
		const m = toMonster({ ...newMonsterDraft({ level: 6, size: 4 }, 'minion'), name: 'Rat' });
		expect(m).toMatchObject({ role: 'minion', minionDie: 8 });
		expect(m.level).toBeUndefined();
		expect(m.attacks?.[0].raw).toBe('**Stab.** 1d8 (follows minion rules).');
	});

	it('writes one attack made twice a turn as (2×), and several as "Choose twice"', () => {
		const d = { ...newMonsterDraft(party), name: 'Wolf', attacksPerTurn: 2 };
		expect(toMonster(d).attacks?.[0].raw).toBe('**Strike (2×).** 1d8+4.'); // the table's 8 a hit at level 4, in d8s
		const two = { ...d, attacks: [{ name: 'Bite' }, { name: 'Claw' }] };
		expect(toMonster(two).actionText).toBe('Choose twice:');
	});
});

describe('stats first', () => {
	it('says what typed stats play like, and Auto follows them', () => {
		const d = { ...newMonsterDraft(party), name: 'Brute', hp: 100, attacks: [{ name: 'Slam', body: '2d8+20.' }] };
		const c = levelCheck(d)!;
		expect(c.guess.level).toBe(8);
		expect(c.verdict).toBe(1);
		expect(autoLevel(d)).toBe(8);
		expect(autoLevel(newMonsterDraft(party))).toBe(4); // nothing typed: stays
	});

	it('keeps typed numbers when the level moves, and moves the rest', () => {
		const d = { ...newMonsterDraft(party), hp: 30 };
		const up = { ...d, level: 8 };
		expect(effectiveHp(up)).toBe(30);
		expect(attackBody(up, up.attacks[0])).toBe('2d8+21.');
	});
});

describe('from a template', () => {
	const goblin = readStatblock('name: Goblin\nlevel: 1/2\nsize: Small\ntype: Humanoid\nhp: 15\nmovement: 6, climb 4\nsaves: DEX+\nattacks:\n- **Stab.** 1d6+1. Can\'t crit.\nabilities:\n- Haha!: Deals 2 psychic damage when missed.').monster!;

	it('copies everything, and re-levels HP and attacks when the level moves', () => {
		const d = draftFromMonster(goblin, party, false);
		expect(d).toMatchObject({ level: 0.5, size: 'Small', type: 'Humanoid', speed: 6, moves: { climb: 4 }, saves: { DEX: 1 }, die: 6 });
		expect(effectiveHp(d)).toBe(15);
		expect(attackBody(d, d.attacks[0])).toBe('1d6+1. Can\'t crit.');
		const big = { ...d, name: 'Goblin Brute', level: 3 };
		expect(effectiveHp(big)).toBe(41);
		expect(attackBody(big, big.attacks[0])).toBe('1d6+11. Can\'t crit.');
		expect(toMonster(big).abilities?.[0]).toEqual({ name: 'Haha!', description: 'Deals 2 psychic damage when missed.' });
		expect(readStatblock(toSource(big)).monster!.movement).toBe('6, climb 4');
	});

	it('reads attack names written several ways', () => {
		expect(splitAttack('**Bite.** 2d6')).toEqual({ name: 'Bite', rest: '2d6' });
		expect(splitAttack('Claw: 1d8 slashing')).toEqual({ name: 'Claw', rest: '1d8 slashing' });
		expect(splitAttack('Shortsword 1d6 slashing')).toEqual({ name: 'Shortsword', rest: '1d6 slashing' });
	});
});

describe('editing', () => {
	it('swaps dice in an attack, or puts them first', () => {
		expect(withDice('Move 6. 2d6+2, Grappled.', '1d8+4')).toBe('Move 6. 1d8+4, Grappled.');
		expect(withDice('Knocks prone.', '1d10')).toBe('1d10. Knocks prone.');
	});

	it('keeps named attacks when the role changes', () => {
		const d = setRole({ ...newMonsterDraft(party), attacks: [{ name: 'Bite' }] }, 'solo');
		expect(d.attacks.map(a => [a.name, a.size])).toEqual([['Bite', 'small'], ['', 'big']]);
	});
});
