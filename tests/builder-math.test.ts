import { describe, expect, it } from 'vitest';
import BESTIARY from '../src/data/bestiary.json';
import { bestiaryEntries } from '../src/bestiary';
import {
	diceAverage, dieAverage, expectedRegular, expectedSolo, expectedSpell, formatDiceParts, guessRegularLevel, guessSoloLevel,
	guessSpellTier, levelLabel, minionDie, relevelRegular, relevelSolo, scaleAttack, snapLevel, stepLevel, suggestDice, weaponPrice,
} from '../src/builder-math';
import { levelValue, monsterRole } from '../src/rules';

describe('dice', () => {
	it('reads Nimble dice, including the tens-and-ones d44/d66/d88', () => {
		expect(diceAverage('2d6+3')).toBe(10);
		expect(diceAverage('**Bite.** 1d8+20 damage')).toBe(24.5);
		expect(diceAverage('d44+10')).toBe(37.5);
		expect(diceAverage('Deals 20 fire damage')).toBe(20);
		expect(diceAverage('No numbers here')).toBeNull();
		expect(dieAverage(66)).toBe(38.5);
	});

	it('suggests dice the way the GM Guide writes them', () => {
		expect(formatDiceParts(suggestDice(24, 8))).toBe('1d8+20');
		expect(formatDiceParts(suggestDice(37, 6))).toBe('2d6+30');
		expect(formatDiceParts(suggestDice(2.5, 8))).toBe('1d4');
		expect(formatDiceParts(suggestDice(4.5, 6))).toBe('1d6+1'); // the book: "1d6+1 or 1d8"
		expect(formatDiceParts(suggestDice(2.5, 6))).toBe('1d4'); // below the die: a smaller die, not a negative bonus
	});
});

describe('levels', () => {
	it('walks the ladder', () => {
		expect(snapLevel(0.3333)).toBeCloseTo(1 / 3);
		expect(stepLevel(1, -1)).toBe(0.5);
		expect(stepLevel(1 / 3, 1)).toBe(0.5);
		expect(levelLabel(1 / 3)).toBe('1/3');
		expect(levelLabel(7)).toBe('7');
	});
});

describe('expected stats (GM Guide tables)', () => {
	it('matches the Monster Builder table', () => {
		expect(expectedRegular(5)).toMatchObject({ hp: 64, perAttack: 20, perRound: 20, dc: 13, cantCrit: false, armorEarly: false });
		expect(expectedRegular(10, 'heavy', 3)).toMatchObject({ hp: 88, perAttack: 9, perRound: 27 });
		expect(formatDiceParts(expectedRegular(6, 'none', 1, 8).dice)).toBe('1d8+20'); // the book's own sample when the die matches
		expect(expectedRegular(1 / 2).cantCrit).toBe(true);
		expect(expectedRegular(2, 'medium').armorEarly).toBe(true);
		expect(expectedRegular(22).hp).toBe(332); // +20 a level past 20
	});

	it('matches the Legendary Monster Builder table', () => {
		expect(expectedSolo(10)).toEqual({ hpPerHero: 86, lastStandPerHero: 33, small: 19, big: 30, dc: 15, armorEarly: false });
		expect(expectedSolo(10, 'heavy')).toMatchObject({ hpPerHero: 64, lastStandPerHero: 20 });
		expect(expectedSolo(2, 'medium').armorEarly).toBe(true);
	});

	it('gives the minion die for the party level', () => {
		expect([1, 4, 8, 11, 14, 18].map(minionDie)).toEqual([4, 6, 8, 10, 12, 20]);
	});
});

describe('level guesses', () => {
	it('reads the table back', () => {
		expect(guessRegularLevel({ hp: 64, perAttack: 20 }).level).toBe(5);
		expect(guessRegularLevel({ hp: 88, armor: 'heavy', perAttack: 9, attacks: 3 }).level).toBe(10);
		expect(guessSoloLevel({ hpPerHero: 86, perAction: 24.5 }).level).toBe(10);
	});

	it('says a glass cannon is somewhere between its HP and its damage', () => {
		const g = guessRegularLevel({ hp: 41, perAttack: 27 }); // level 3 HP, level 7 damage
		expect([g.byHp, g.byDamage]).toEqual([3, 7]);
		expect(g.low).toBe(3);
		expect(g.high).toBe(7);
		expect(g.level).toBe(4);
	});

	it('lands near the book level for most bundled regular monsters', () => {
		const rows = bestiaryEntries(BESTIARY as never).map(e => e.monster)
			.filter(m => monsterRole(m) === 'regular' && levelValue(m.level) !== null && m.hp > 0);
		let within1 = 0;
		let within2 = 0;
		let n = 0;
		for (const m of rows) {
			const perAttack = Math.max(0, ...(m.attacks ?? []).map(a => diceAverage(a.raw) ?? 0));
			const g = guessRegularLevel({ hp: m.hp, armor: m.armor, perAttack: perAttack || undefined });
			const truth = levelValue(m.level)!;
			const off = Math.abs(g.level - truth);
			n++;
			if (off <= 1 || (truth >= 10 && off <= truth * 0.15)) within1++;
			if (off <= 2 || (truth >= 10 && off <= truth * 0.25)) within2++;
		}
		expect(n).toBeGreaterThan(400);
		expect(within1 / n).toBeGreaterThan(0.65);
		expect(within2 / n).toBeGreaterThan(0.8);
	});
});

describe('re-levelling', () => {
	it('moves HP and damage along the table, keeping the die', () => {
		const r = relevelRegular({ level: 4, hp: 52, armor: 'none' }, 10);
		expect(r.hp).toBe(126);
		expect(r.damageRatio).toBeCloseTo(37 / 17);
		expect(scaleAttack('**Bite.** 1d6+2, Grappled.', 2)).toBe('**Bite.** 1d6+8, Grappled.');
		expect(scaleAttack('Slam d44+10.', 1.5)).toBe('Slam d44+29.');
		expect(scaleAttack('Peck 2d6+10.', 0.3)).toBe('Peck 1d6+2.');
	});

	it('drops armor the book holds back at low levels', () => {
		expect(relevelRegular({ level: 9, hp: 73, armor: 'heavy' }, 5).armor).toBe('medium');
		expect(relevelRegular({ level: 5, hp: 49, armor: 'medium' }, 2).armor).toBe('none');
		expect(relevelRegular({ level: 1, hp: 8, armor: 'heavy' }, 2).armor).toBe('heavy'); // tougher keeps it
	});

	it('re-levels solos by the legendary table', () => {
		expect(relevelSolo({ level: 2, hpPerHero: 28, armor: 'none' }, 10)).toMatchObject({ hpPerHero: 86, lastStandPerHero: 33 });
	});
});

describe('spells and items', () => {
	it('expects the Creator\'s Kit damage by tier, less for areas', () => {
		expect(expectedSpell(3)).toMatchObject({ damage: 33, actions: 2, mana: 3, range: 8 });
		expect(expectedSpell(0).actions).toBe(1);
		expect(expectedSpell(4, { aoe: true, ranged: true })).toMatchObject({ damage: 26.5, actions: 3 });
		expect(guessSpellTier(33)).toBe(3);
		expect(guessSpellTier(20, true)).toBe(3);
	});

	it('prices weapons along the Core table', () => {
		expect(weaponPrice(2.5)).toBe(3);
		expect(weaponPrice(7)).toBe(100);
	});
});
