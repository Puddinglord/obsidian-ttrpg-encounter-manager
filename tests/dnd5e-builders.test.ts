// 5e's builders, every permutation: what the builder writes must read back the
// same (block → parser), its numbers must follow the rules (HP, PB, XP, to hit,
// saves, skills), attacks must be worded the edition's way, and every SRD
// monster, spell and item must survive a trip through the builder.
import { describe, expect, it } from 'vitest';
import {
	ABILITY_SHORT, Action5eDraft, attackText, CREATURE_TYPES, CRS, damageText, fromMonster5e, hpOf, Monster5eDraft, newAction5e, newMonster5e, passivePerception,
	SIZES, SKILL_ABILITY, toHit, toMonster5e,
} from '../src/systems/dnd5e/builder-model';
import { fromItem5e, fromSpell5e, Item5eDraft, newItem5e, newSpell5e, Spell5eDraft, toItem5e, toSpell5e } from '../src/systems/dnd5e/builders';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';
import { extractBlocks, ITEM_TYPES_5E, itemSource5e, parseItem5e, parseSpell5e, RARITIES_5E, SCHOOLS_5E, spellSource5e } from '../src/systems/dnd5e/homebrew';
import { averageRoll, parseStatblock5e, toStatblockSource5e } from '../src/systems/dnd5e/parser';
import { abilityMod, crValue, pbForCr, xpForCr } from '../src/systems/dnd5e/rules';
import { ABILITIES } from '../src/systems/dnd5e/types';

const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
/** Every failure in a sweep, so one run shows them all (and a pass costs one expect). */
function sweep<T>(cases: T[], check: (c: T) => void): void {
	const fails: string[] = [];
	for (const c of cases) {
		try { check(c); } catch (e) { fails.push(`${JSON.stringify(c).slice(0, 160)}: ${(e as Error).message.split('\n')[0]}`); }
	}
	expect(fails.slice(0, 5), `${fails.length} of ${cases.length} failed`).toEqual([]);
}
const roundTrip = (d: Monster5eDraft) => {
	const m = toMonster5e(d);
	expect(parseStatblock5e(toStatblockSource5e(m))).toEqual(m);
	return m;
};
const product = <A, B>(as: A[], bs: B[]): [A, B][] => as.flatMap(a => bs.map((b): [A, B] => [a, b]));

describe('5e monster builder: the numbers', () => {
	it('HP is the hit dice average plus Con per die, written the edition\'s way', () => {
		const d = { ...newMonster5e('2024'), size: 'Medium', hitDice: 4, con: 14 };
		expect(hpOf(d)).toEqual({ hp: 26, formula: '4d8 + 8' });
		expect(hpOf({ ...d, con: 8 })).toEqual({ hp: 14, formula: '4d8 − 4' });
		expect(hpOf({ ...d, con: 8, edition: '2014' })).toEqual({ hp: 14, formula: '4d8 - 4' });
		expect(hpOf({ ...d, hitDice: 1, con: 1, size: 'Tiny' })).toEqual({ hp: 1, formula: '1d4 − 5' });
		expect(hpOf({ ...d, hp: 30 })).toEqual({ hp: 30 });
		expect(hpOf({ ...d, hp: 26 })).toEqual({ hp: 26, formula: '4d8 + 8' });
	});
	it('attacks: to hit is the ability plus PB, damage adds the ability', () => {
		const d: Monster5eDraft = { ...newMonster5e('2024'), cr: '5', str: 18, dex: 14 };
		const a: Action5eDraft = { ...newAction5e('melee'), name: 'Slam', count: 2, sides: '6', damageType: 'Bludgeoning' };
		expect(toHit(d, a)).toBe(4 + 3);
		expect(damageText(d, a)).toBe('11 (2d6 + 4)');
		expect(attackText(d, a)).toBe('Melee Attack Roll: +7, reach 5 ft. Hit: 11 (2d6 + 4) Bludgeoning damage.');
		expect(attackText({ ...d, edition: '2014' }, a)).toBe('Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) bludgeoning damage.');
		const bow: Action5eDraft = { ...newAction5e('ranged'), name: 'Longbow', ability: 'dex', count: 1, sides: '8', range: '150/600' };
		expect(attackText(d, bow)).toBe('Ranged Attack Roll: +5, range 150/600 ft. Hit: 6 (1d8 + 2) Piercing damage.');
		expect(toHit(d, { ...a, ability: 'finesse' })).toBe(7);
		expect(toHit({ ...d, dex: 20 }, { ...a, ability: 'finesse' })).toBe(5 + 3);
		expect(attackText(d, { ...a, extra: 'If the target is Large or smaller, it has the Prone condition.' })).toMatch(/damage\. If the target is Large or smaller, it has the Prone condition\.$/);
	});
	it('saves, skills, expertise and passive Perception', () => {
		const d: Monster5eDraft = { ...newMonster5e('2024'), cr: '9', wis: 16, dex: 12, saves: ['Dex', 'Wis'], skills: ['Perception', 'Stealth'], expertise: ['Perception'] };
		const m = toMonster5e(d);
		expect(m.saves).toEqual({ dex: 1 + 4, wis: 3 + 4 });
		expect(m.skills).toEqual({ Perception: 3 + 8, Stealth: 1 + 4 });
		expect(passivePerception(d)).toBe(21);
		expect(m.senses).toBe('Passive Perception 21');
		// 2024 sets Passive Perception off with a semicolon; 2014 writes senses in lower case.
		expect(toMonster5e({ ...d, darkvision: 60, blindsight: 30, blind: true }).senses).toBe('Blindsight 30 ft. (blind beyond this radius), Darkvision 60 ft.; Passive Perception 21');
		expect(toMonster5e({ ...d, edition: '2014', darkvision: 60 }).senses).toBe('darkvision 60 ft., passive Perception 21');
		expect(toMonster5e({ ...d, senses: 'unimpeded by magical darkness' }).senses).toBe('unimpeded by magical darkness; Passive Perception 21');
	});
	it('a blank monster still makes a valid stat block', () => {
		for (const ed of EDITIONS) {
			const m = roundTrip({ ...newMonster5e(ed), actions: [] });
			expect(m).toMatchObject({ name: 'Monster', ac: 10, cr: '1', edition: ed });
		}
	});
	it('legendary actions get the edition\'s opening line, and keep their count', () => {
		const d: Monster5eDraft = { ...newMonster5e('2024'), name: 'Ember Drake', legendary: [{ name: 'Tail', desc: 'It attacks with its tail.' }], legendaryUses: 2 };
		expect(toMonster5e(d).legendaryIntro).toMatch(/^Legendary Action Uses: 2\. .*the ember drake/);
		expect(toMonster5e({ ...d, edition: '2014' }).legendaryIntro).toMatch(/^The ember drake can take 2 legendary actions/);
		expect(fromMonster5e(toMonster5e(d), '2024').legendaryUses).toBe(2);
	});
});

describe('5e monster builder: every permutation reads back', () => {
	it('every size × type × edition', () => {
		sweep(EDITIONS.flatMap(ed => product([...SIZES], [...CREATURE_TYPES]).map(([size, type]) => ({ ed, size, type }))), ({ ed, size, type }) => {
			const m = roundTrip({ ...newMonster5e(ed), name: `${size} ${type}`, size, type, tags: type === 'Humanoid' ? '(goblinoid)' : '' });
			expect(m.type?.toLowerCase().startsWith(type.toLowerCase())).toBe(true);
		});
	});
	it('every CR × edition: PB and XP follow, and HP matches its dice', () => {
		sweep(product(EDITIONS, CRS), ([ed, cr]) => {
			const d = { ...newMonster5e(ed), name: `CR ${cr}`, cr, hitDice: 1 + Math.round((crValue(cr) ?? 0) * 2), con: 10 + Math.round((crValue(cr) ?? 0) / 2) };
			const m = roundTrip(d);
			expect(m.cr).toBe(cr);
			expect(xpForCr(m.cr)).toBe(xpForCr(cr));
			expect(pbForCr(m.cr)).toBe(pbForCr(cr));
			expect(Math.max(1, averageRoll(m.hpFormula!.replace('−', '-'))!)).toBe(m.hp);
		});
	});
	it('every attack kind × ability × die × damage type × edition, worded so the stat block finds the to-hit', () => {
		const kinds: Action5eDraft['kind'][] = ['melee', 'ranged', 'text'];
		const abilities: Action5eDraft['ability'][] = ['str', 'dex', 'finesse', 'con', 'int', 'wis', 'cha'];
		const cases = EDITIONS.flatMap(ed => kinds.flatMap(kind => abilities.flatMap(ability => ['4', '6', '8', '10', '12', '20'].flatMap(sides => ['Acid', 'Slashing', 'Psychic'].map(damageType => ({ ed, kind, ability, sides, damageType }))))));
		sweep(cases, ({ ed, kind, ability, sides, damageType }) => {
			const a: Action5eDraft = { ...newAction5e(kind), name: 'Strike', ability, sides, damageType, count: 2, desc: kind === 'text' ? 'It roars.' : '' };
			const d: Monster5eDraft = { ...newMonster5e(ed), name: 'Tester', str: 16, dex: 8, con: 14, int: 6, wis: 12, cha: 20, actions: [a] };
			const m = roundTrip(d);
			const text = m.actions![0].desc;
			if (kind === 'text') { expect(text).toBe('It roars.'); return; }
			const want = toHit(d, a);
			const found = /([+\-−]\s?\d+) to hit|Attack Roll:\s*([+\-−]\s?\d+)/.exec(text);
			expect(Number((found?.[1] ?? found?.[2] ?? '').replace('−', '-'))).toBe(want);
			expect(text).toMatch(ed === '2014' ? / Weapon Attack: .* to hit, .*one target\. Hit: \d+ \(2d\d+.*\) [a-z]+ damage\.$/ : / Attack Roll: .* Hit: \d+ \(2d\d+.*\) [A-Z][a-z]+ damage\.$/);
			expect(text).toContain(ed === '2014' ? damageType.toLowerCase() : damageType);
		});
	});
	it('every save and skill, alone and all together, with expertise', () => {
		const skills = Object.keys(SKILL_ABILITY);
		const cases = EDITIONS.flatMap(ed => [
			...ABILITIES.map(a => ({ ed, saves: [ABILITY_SHORT[a]], skills: [] as string[], expertise: [] as string[] })),
			...skills.map(s => ({ ed, saves: [] as string[], skills: [s], expertise: [] as string[] })),
			...skills.map(s => ({ ed, saves: [] as string[], skills: [s], expertise: [s] })),
			{ ed, saves: ABILITIES.map(a => ABILITY_SHORT[a]), skills, expertise: [] as string[] },
		]);
		sweep(cases, ({ ed, saves, skills: sk, expertise }) => {
			const d: Monster5eDraft = { ...newMonster5e(ed), name: 'Sage', cr: '13', str: 8, dex: 12, con: 14, int: 20, wis: 17, cha: 11, saves, skills: sk, expertise };
			const m = roundTrip(d);
			for (const s of saves) {
				const a = ABILITIES.find(x => ABILITY_SHORT[x] === s)!;
				expect(m.saves![a]).toBe(abilityMod(d[a]!) + 5);
			}
			for (const s of sk) expect(m.skills![s]).toBe(abilityMod(d[SKILL_ABILITY[s]]!) + (expertise.includes(s) ? 10 : 5));
		});
	});
	it('resistances, immunities and senses, with commas inside an item', () => {
		sweep(EDITIONS, (ed) => {
			roundTrip({
				...newMonster5e(ed), name: 'Golem', resistances: 'Fire; Bludgeoning, Piercing, and Slashing from Nonmagical Attacks', immunities: 'Poison, Psychic',
				vulnerabilities: 'Acid', conditionImmunities: 'Charmed, Exhaustion, Frightened', senses: 'Darkvision 120 ft.', languages: 'understands its creator\'s languages but can\'t speak',
				gear: 'Greatsword', traits: [{ name: 'Immutable Form', desc: 'It can\'t change shape.' }], bonusActions: [{ name: 'Slam', desc: 'One more slam.' }],
				reactions: [{ name: 'Parry', desc: 'Adds 2 to its AC.' }], legendary: [{ name: 'Move', desc: 'It moves.' }],
			});
		});
	});
	it('a monster read back into the builder writes the same stat block', () => {
		sweep(EDITIONS, (ed) => {
			const d: Monster5eDraft = { ...newMonster5e(ed), name: 'Ember Hound', size: 'Large', type: 'Elemental', cr: '4', str: 18, dex: 14, con: 16, wis: 13, ac: 15, acNote: 'natural armor', hitDice: 8, saves: ['Dex'], skills: ['Perception'], darkvision: 60, resist: ['Fire'], actions: [{ ...newAction5e('melee'), name: 'Bite', count: 2, sides: '8', damageType: 'Fire' }] };
			const m = toMonster5e(d);
			expect(toMonster5e(fromMonster5e(m, ed))).toEqual(m);
		});
	});
});

describe.each(EDITIONS)('every %s SRD monster survives the builder', (ed) => {
	const all = bundledMonsters(ed).map(e => e.monster);
	it(`${ed}: name, abilities, AC, HP, CR and every action as written`, () => {
		sweep(all, (m) => {
			const back = toMonster5e(fromMonster5e(m, ed));
			expect(back.name).toBe(m.name);
			expect(back.abilities).toEqual(m.abilities);
			expect(back.ac).toBe(m.ac);
			expect(back.hp).toBe(m.hp);
			expect(back.cr).toBe(m.cr);
			for (const k of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) expect(back[k] ?? []).toEqual(m[k] ?? []);
			expect(parseStatblock5e(toStatblockSource5e(back))).toEqual(back);
		});
	});
});

describe('5e spell builder', () => {
	const components = [['V'], ['S'], ['M'], ['V', 'S'], ['V', 'M'], ['S', 'M'], ['V', 'S', 'M']];
	it('every level × school × components × concentration × ritual × edition reads back', () => {
		const cases = EDITIONS.flatMap(ed => Array.from({ length: 10 }, (_, level) => level).flatMap(level => SCHOOLS_5E.flatMap(school => components.flatMap(comps => [false, true].flatMap(concentration => [false, true].map(ritual => ({ ed, level, school, comps, concentration, ritual })))))));
		sweep(cases, ({ ed, level, school, comps, concentration, ritual }) => {
			const d: Spell5eDraft = { ...newSpell5e(ed), name: `Test ${level}`, level, school, components: comps, material: 'a feather', concentration, ritual, duration: '1 minute', classes: ['Wizard', 'Bard'], desc: 'Something happens.\n\nThen more.', higherLevel: level ? 'More damage per level.' : '' };
			const s = toSpell5e(d);
			expect(parseSpell5e(spellSource5e(s, ed))).toEqual(s);
			expect(toSpell5e(fromSpell5e(s, ed))).toEqual(s);
			if (concentration) expect(s.duration).toBe('Concentration, up to 1 minute');
			if (comps.includes('M')) expect(s.components).toContain('M (a feather)');
			expect(s.classes).toEqual(['Bard', 'Wizard']);
		});
	});
	it('2014 spells take "1 action"; 2024 spells take "Action"', () => {
		expect(toSpell5e({ ...newSpell5e('2014'), castingTime: 'Bonus Action' }).castingTime).toBe('1 bonus action');
		expect(toSpell5e({ ...newSpell5e('2024'), castingTime: 'Bonus Action' }).castingTime).toBe('Bonus Action');
		expect(fromSpell5e(toSpell5e({ ...newSpell5e('2014'), castingTime: 'Reaction' }), '2014').castingTime).toBe('Reaction');
	});
	it.each(EDITIONS)('every %s SRD spell reads back from a ```5e-spell block', (ed) => {
		sweep(compendium5e(ed).spells, (s) => {
			const back = parseSpell5e(spellSource5e(s, ed))!;
			expect(back.name).toBe(s.name);
			expect(back.level).toBe(s.level);
			expect(back.school).toBe(s.school);
			expect(back.castingTime).toBe(s.castingTime);
			expect(back.components).toBe(s.components);
			expect(back.duration).toBe(s.duration);
			expect(back.classes).toEqual(s.classes);
			expect(back.desc).toBe(s.desc.trim());
			expect(back.higherLevel ?? '').toBe((s.higherLevel ?? '').trim());
			expect(!!back.ritual).toBe(!!s.ritual);
		});
	});
});

describe('5e item builder', () => {
	it('every type × rarity × attunement × edition reads back', () => {
		const att: [boolean, string][] = [[false, ''], [true, ''], [true, 'a Paladin']];
		const cases = EDITIONS.flatMap(ed => ITEM_TYPES_5E.flatMap(type => RARITIES_5E.flatMap(rarity => att.flatMap(([on, by]) => ['', 'Longsword'].map(sub => ({ ed, type, rarity, on, by, sub }))))));
		sweep(cases, ({ ed, type, rarity, on, by, sub }) => {
			const d: Item5eDraft = { ...newItem5e(ed), name: `${rarity} ${type}`, type, subtype: sub, rarity, attunement: on, attunedBy: by, desc: 'It glows.\n\nIt hums.' };
			const i = toItem5e(d);
			const body = itemSource5e({ ...i, attunement: on ? (by || true) : false });
			expect(parseItem5e(body, ed)).toEqual(i);
			expect(toItem5e(fromItem5e(i, ed))).toEqual(i);
			expect(i.line).toMatch(ed === '2014' ? new RegExp(`, ${rarity.toLowerCase()}`) : new RegExp(`, ${rarity}`));
			if (by) expect(i.line).toContain(`by ${by}`);
		});
	});
	it.each(EDITIONS)('every %s SRD magic item reads back from a ```5e-item block', (ed) => {
		sweep(compendium5e(ed).items, (i) => {
			const back = parseItem5e(itemSource5e(i), ed)!;
			expect(back.name).toBe(i.name);
			expect(back.type).toBe(i.type);
			expect(back.rarity).toBe(i.rarity);
			expect(back.desc).toBe(i.desc.trim());
			expect(!!back.attunement).toBe(!!i.attunement);
		});
	});
});

describe('homebrew blocks in notes', () => {
	it('finds ```5e-spell and ```5e-item blocks, not other 5e blocks', () => {
		const note = ['# Notes', '```5e-spell', 'name: A', '```', '', '```5e', 'name: Goblin', '```', '~~~5e-item', 'name: B', '~~~', '```5e-spell-list', 'x', '```'].join('\n');
		expect(extractBlocks(note, '5e-spell')).toEqual(['name: A\n']);
		expect(extractBlocks(note, '5e-item')).toEqual(['name: B\n']);
	});
	it('needs a name', () => {
		expect(parseSpell5e('level: 3')).toBeNull();
		expect(parseItem5e('rarity: Rare')).toBeNull();
	});
});
