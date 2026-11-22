import { describe, expect, it } from 'vitest';
import { averageRoll, extract5eBlocks, parseStatblock5e, toStatblockSource5e } from '../src/systems/dnd5e/parser';
import m2014 from '../src/systems/dnd5e/data/monsters-2014.json';
import m2024 from '../src/systems/dnd5e/data/monsters-2024.json';
import type { Dnd5eMonster } from '../src/systems/dnd5e/types';

const GOBLIN = `name: Goblin
size: Small
type: Humanoid (Goblinoid)
alignment: Neutral Evil
ac: 15 (leather armor, shield)
hp: 7 (2d6)
speed: 30 ft.
str: 8
dex: 14
con: 10
int: 10
wis: 8
cha: 8
skills: Stealth +6
senses: darkvision 60 ft., passive Perception 9
languages: Common, Goblin
cr: 1/4
traits:
- Nimble Escape: The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
actions:
- Scimitar: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
- **Shortbow.** Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target.
  Hit: 5 (1d6 + 2) piercing damage.`;

describe('```5e stat blocks', () => {
	it('reads a hand-written goblin', () => {
		const m = parseStatblock5e(GOBLIN)!;
		expect(m.name).toBe('Goblin');
		expect(m.ac).toBe(15);
		expect(m.acNote).toBe('leather armor, shield');
		expect(m.hp).toBe(7);
		expect(m.hpFormula).toBe('2d6');
		expect(m.abilities).toEqual([8, 14, 10, 10, 8, 8]);
		expect(m.skills).toEqual({ Stealth: 6 });
		expect(m.cr).toBe('1/4');
		expect(m.traits?.[0].name).toBe('Nimble Escape');
		expect(m.actions?.map(a => a.name)).toEqual(['Scimitar', 'Shortbow']);
		expect(m.actions?.[0].desc).toMatch(/^Melee Weapon Attack: \+4 to hit/);
		expect(m.actions?.[1].desc).toMatch(/one target\.\nHit: 5 \(1d6 \+ 2\) piercing damage\.$/);
	});
	it('takes what the books print: Armor Class, Hit Points, Challenge with XP, one-line abilities, saving throws', () => {
		const m = parseStatblock5e(`name: Ogre
Armor Class: 11 (hide armor)
Hit Points: 59 (7d10 + 21)
abilities: 19 8 16 5 7 7
Saving Throws: Str +6, Con −1
Damage Resistances: cold; fire
Challenge: 2 (450 XP)`)!;
		expect([m.ac, m.acNote, m.hp, m.hpFormula]).toEqual([11, 'hide armor', 59, '7d10 + 21']);
		expect(m.abilities).toEqual([19, 8, 16, 5, 7, 7]);
		expect(m.saves).toEqual({ str: 6, con: -1 });
		expect(m.resistances).toEqual(['cold', 'fire']);
		expect([m.cr, m.xp]).toEqual(['2', 450]);
	});
	it('works out HP from a formula, and fills in what a quick note leaves out', () => {
		expect(averageRoll('2d6')).toBe(7);
		expect(averageRoll('19d12+133')).toBe(256);
		const m = parseStatblock5e('name: Rat\nhp: 1d4\ndex: 11')!;
		expect([m.hp, m.ac, m.cr]).toEqual([2, 10, '0']);
		expect(parseStatblock5e('hp: 3')).toBeNull();
	});
	it('keeps the legendary actions\' opening line apart from the actions', () => {
		const m = parseStatblock5e('name: Wyrm\nlegendary actions:\nThe wyrm can take 3 legendary actions.\n- Tail: It attacks.\n- Wing: It flaps.')!;
		expect(m.legendaryIntro).toBe('The wyrm can take 3 legendary actions.');
		expect(m.legendaryActions?.map(a => a.name)).toEqual(['Tail', 'Wing']);
	});
	it('finds ```5e blocks in a note (and not other languages)', () => {
		const note = '# Hi\n```5e\nname: A\n```\n\n```nimble\nname: B\n```\n~~~5e\nname: C\n~~~\n';
		expect(extract5eBlocks(note).map(b => parseStatblock5e(b)?.name)).toEqual(['A', 'C']);
	});
});

describe('every SRD monster survives being written to a note and read back', () => {
	const strip = (m: Dnd5eMonster) => {
		const { source: _s, bundledId: _b, ...rest } = m;
		const out: Record<string, unknown> = { ...rest };
		for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
		return out;
	};
	it.each([['2014', m2014], ['2024', m2024]] as const)('%s', (edition, list) => {
		const bad: string[] = [];
		for (const raw of list as unknown as Dnd5eMonster[]) {
			const m = { ...raw, edition } as Dnd5eMonster;
			const back = parseStatblock5e(toStatblockSource5e(m));
			try { expect(strip(back!)).toEqual(strip(m)); } catch { bad.push(m.name); }
		}
		expect(bad).toEqual([]);
	});
});
