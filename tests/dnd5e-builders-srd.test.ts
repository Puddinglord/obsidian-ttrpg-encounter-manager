// 5e's builders checked against the SRD itself: monsters built from scratch
// come out with the book's numbers and wording (both editions), SRD blocks
// open in the builder as fields, spells get the SRD's sentences for attacks,
// saves and higher levels, and items their bonuses, charges, weapons and armor.
import { describe, expect, it } from 'vitest';
import { acNoteOf, acOf, Action5eDraft, fromMonster5e, Monster5eDraft, newAction5e, newMonster5e, saveText, toMonster5e } from '../src/systems/dnd5e/builder-model';
import { bundledMonsters } from '../src/systems/dnd5e/bestiary';
import { readSheet5e } from '../src/systems/dnd5e/character';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';
import { equipmentSource5e, parseEquipment5e, parseItem5e } from '../src/systems/dnd5e/homebrew';
import {
	areaText, fromEquipment5e, fromItem5e, fromSpell5e, Item5eDraft, newItem5e, newSpell5e, rangeText, rulesSentence, Spell5eDraft, toEquipment5e, toItem5e, toSpell5e, upcastSentence,
} from '../src/systems/dnd5e/homebrew-draft';

const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
function sweep<T>(cases: T[], check: (c: T) => void): void {
	const fails: string[] = [];
	for (const c of cases) {
		try { check(c); } catch (e) { fails.push(`${JSON.stringify(c).slice(0, 160)}: ${(e as Error).message.split('\n')[0]}`); }
	}
	expect(fails.slice(0, 5), `${fails.length} of ${cases.length} failed`).toEqual([]);
}
const srd = (ed: Dnd5eEdition, name: string) => bundledMonsters(ed).find(e => e.monster.name === name)!.monster;

describe('5e monster builder: SRD monsters built from scratch match the book', () => {
	it('2014 Goblin: leather armor and a shield, Stealth expertise, finesse attacks', () => {
		const d: Monster5eDraft = {
			...newMonster5e('2014'), name: 'Goblin', size: 'Small', type: 'Humanoid', tags: '(goblinoid)', alignment: 'neutral evil', cr: '1/4', armor: 'Leather Armor', shield: true, hitDice: 2,
			str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, skills: ['Stealth'], expertise: ['Stealth'], darkvision: 60, languages: 'Common, Goblin',
			traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' }],
			actions: [
				{ ...newAction5e('melee'), name: 'Scimitar', ability: 'finesse', count: 1, sides: '6', damageType: 'Slashing' },
				{ ...newAction5e('ranged'), name: 'Shortbow', ability: 'dex', range: '80/320', count: 1, sides: '6', damageType: 'Piercing' },
			],
		};
		const m = toMonster5e(d), b = srd('2014', 'Goblin');
		expect([m.ac, m.acNote, m.hp, m.hpFormula, m.speed, m.skills, m.senses, m.xp, m.type]).toEqual([b.ac, b.acNote, b.hp, b.hpFormula, b.speed, b.skills, b.senses, b.xp, b.type]);
		expect(m.actions).toEqual(b.actions);
	});
	it.each(EDITIONS)('%s Ogre: hide armor (2014), a thrown javelin as "melee or ranged"', (ed) => {
		const d: Monster5eDraft = {
			...newMonster5e(ed), name: 'Ogre', size: 'Large', type: 'Giant', alignment: 'chaotic evil', cr: '2', armor: ed === '2014' ? 'Hide Armor' : '', ac: ed === '2014' ? undefined : 11,
			hitDice: ed === '2014' ? 7 : 8, walk: 40, str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7, darkvision: 60, languages: 'Common, Giant', gear: ed === '2024' ? 'Greatclub, Javelins (3)' : '',
			actions: [
				{ ...newAction5e('melee'), name: 'Greatclub', count: 2, sides: '8', damageType: 'Bludgeoning' },
				{ ...newAction5e('both'), name: 'Javelin', ability: 'str', range: '30/120', count: 2, sides: '6', damageType: 'Piercing' },
			],
		};
		const m = toMonster5e(d), b = srd(ed, 'Ogre');
		expect([m.ac, m.acNote, m.hp, m.speed, m.xp, m.pb, m.gear]).toEqual([b.ac, b.acNote, b.hp, b.speed, b.xp, b.pb, b.gear]);
		expect(m.senses).toBe(ed === '2014' ? b.senses : 'Darkvision 60 ft.; Passive Perception 8');
		expect(m.actions).toEqual(b.actions);
	});
	it('2014 Adult Red Dragon: saves, expertise, speeds, senses, extra fire damage, a breath weapon\'s DC and damage', () => {
		const d: Monster5eDraft = {
			...newMonster5e('2014'), name: 'Adult Red Dragon', size: 'Huge', type: 'Dragon', alignment: 'chaotic evil', cr: '17', armor: 'natural', ac: 19, hitDice: 19,
			str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21, walk: 40, climb: 40, fly: 80, saves: ['Dex', 'Con', 'Wis', 'Cha'], skills: ['Perception', 'Stealth'], expertise: ['Perception'],
			immune: ['Fire'], blindsight: 60, darkvision: 120, languages: 'Common, Draconic', traits: [{ name: 'Legendary Resistance', uses: '3/Day', desc: 'If the dragon fails a saving throw, it can choose to succeed instead.' }],
			actions: [
				{ ...newAction5e('melee'), name: 'Bite', reach: 10, count: 2, sides: '10', damageType: 'Piercing', plusCount: 2, plusSides: '6', plusType: 'Fire' },
				{ ...newAction5e('melee'), name: 'Claw', reach: 5, count: 2, sides: '6', damageType: 'Slashing' },
				{ ...newAction5e('melee'), name: 'Tail', reach: 15, count: 2, sides: '8', damageType: 'Bludgeoning' },
				{ ...newAction5e('save'), name: 'Fire Breath', uses: 'Recharge 5–6', save: 'dex', dcAbility: 'con', area: 'the dragon exhales fire in a 60-foot cone. Each creature in that area', count: 18, sides: '6', damageType: 'Fire' },
			],
			legendary: [{ name: 'Detect', desc: 'The dragon makes a Wisdom (Perception) check.' }],
		};
		const m = toMonster5e(d), b = srd('2014', 'Adult Red Dragon');
		expect([m.ac, m.acNote, m.hp, m.hpFormula?.replace(/ /g, ''), m.speed, m.saves, m.skills, m.immunities, m.senses, m.xp, m.pb, m.legendaryIntro])
			.toEqual([b.ac, b.acNote, b.hp, b.hpFormula, b.speed, b.saves, b.skills, b.immunities, b.senses, b.xp, b.pb, b.legendaryIntro]);
		expect(m.traits).toEqual(b.traits);
		for (const n of ['Bite', 'Claw', 'Tail', 'Fire Breath (Recharge 5–6)']) expect(m.actions!.find(a => a.name === n)!.desc).toBe(b.actions!.find(a => a.name === n)!.desc);
	});
	it('2024 Adult Red Dragon: initiative with expertise, a lair\'s XP and uses, Rend plus fire, the breath\'s Failure and Success, spellcasting', () => {
		const d: Monster5eDraft = {
			...newMonster5e('2024'), name: 'Adult Red Dragon', size: 'Huge', type: 'Dragon', alignment: 'chaotic evil', cr: '17', armor: 'natural', ac: 19, hitDice: 19, lair: true, initProf: 2,
			str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 23, walk: 40, climb: 40, fly: 80, saves: ['Dex', 'Wis'], skills: ['Perception', 'Stealth'], expertise: ['Perception'],
			immune: ['Fire'], blindsight: 60, darkvision: 120, languages: 'Common, Draconic',
			actions: [
				{ ...newAction5e('melee'), name: 'Rend', reach: 10, count: 1, sides: '10', damageType: 'Slashing', plusCount: 2, plusSides: '4', plusType: 'Fire' },
				{ ...newAction5e('save'), name: 'Fire Breath', uses: 'Recharge 5–6', save: 'dex', dcAbility: 'con', area: 'each creature in a 60-foot Cone', count: 17, sides: '6', damageType: 'Fire' },
			],
			spellAbility: 'cha', noMaterial: true, atWill: 'Command (level 2 version), Detect Magic, Scorching Ray', day1: 'Fireball (level 6 version)',
			legendary: [{ name: 'Pounce', desc: 'The dragon moves up to half its Speed, and it makes one Rend attack.' }],
		};
		const m = toMonster5e(d), b = srd('2024', 'Adult Red Dragon');
		// SRD 5.2.1 prints Initiative +12 (22) and "Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 23".
		expect([m.ac, m.hp, m.speed, m.saves, m.skills, m.xp, m.xpLair, m.pb, m.initiative, m.legendaryIntro])
			.toEqual([b.ac, b.hp, b.speed, b.saves, b.skills, b.xp, b.xpLair, b.pb, 12, b.legendaryIntro]);
		// The book prints "Immunities Fire" (the data has it in lower case).
		expect(m.immunities).toEqual(['Fire']);
		expect(m.senses).toBe('Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 23');
		for (const n of ['Rend', 'Fire Breath (Recharge 5–6)']) expect(m.actions!.find(a => a.name === n)!.desc).toBe(b.actions!.find(a => a.name === n)!.desc);
		// DC 8 + PB 6 + Cha 6 = 20 in the book's 2024 dragon (Cha 23 is +6): the builder works it out the same way.
		expect(m.actions!.at(-1)).toEqual({
			name: 'Spellcasting',
			desc: 'The adult red dragon casts one of the following spells, requiring no Material components and using Charisma as the spellcasting ability (spell save DC 20, +12 to hit with spell attacks):\n- **At Will:** Command (level 2 version), Detect Magic, Scorching Ray\n- **1/Day Each:** Fireball (level 6 version)',
		});
		expect(b.actions!.find(a => a.name === 'Spellcasting')!.desc).toMatch(/spell save DC 20, \+12 to hit/);
	});
	it('2024 Goblin Warrior: armor and shield go in its gear; extra damage "if the attack roll had Advantage"', () => {
		const d: Monster5eDraft = {
			...newMonster5e('2024'), name: 'Goblin Warrior', size: 'Small', type: 'Fey', alignment: 'chaotic neutral', cr: '1/4', armor: 'Leather Armor', shield: true, hitDice: 3,
			str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8, skills: ['Stealth'], expertise: ['Stealth'], darkvision: 60, languages: 'Common, Goblin', gear: 'Scimitar, Shortbow',
			actions: [
				{ ...newAction5e('melee'), name: 'Scimitar', ability: 'finesse', count: 1, sides: '6', damageType: 'Slashing', plusCount: 1, plusSides: '4', plusType: 'Slashing', plusWhen: 'if the attack roll had Advantage' },
				{ ...newAction5e('ranged'), name: 'Shortbow', ability: 'dex', range: '80/320', count: 1, sides: '6', damageType: 'Piercing', plusCount: 1, plusSides: '4', plusType: 'Piercing', plusWhen: 'if the attack roll had Advantage' },
			],
			bonusActions: [{ name: 'Nimble Escape', desc: 'The goblin takes the Disengage or Hide action.' }],
		};
		const m = toMonster5e(d), b = srd('2024', 'Goblin Warrior');
		expect([m.ac, m.acNote, m.hp, m.hpFormula, m.skills, m.gear, m.senses, m.xp]).toEqual([b.ac, undefined, b.hp, b.hpFormula, b.skills, b.gear, b.senses, b.xp]);
		expect(m.actions).toEqual(b.actions);
		expect(m.bonusActions).toEqual(b.bonusActions);
	});
});

describe('5e monster builder: AC, speeds, uses, saving throws and spellcasting', () => {
	const base = (ed: Dnd5eEdition): Monster5eDraft => ({ ...newMonster5e(ed), name: 'Guard', dex: 16 });
	it('AC from armor: Dex in full (light), up to 2 (medium), none (heavy), +2 for a shield; typed wins', () => {
		expect(acOf({ ...base('2024'), armor: 'Studded Leather Armor' })).toBe(12 + 3);
		expect(acOf({ ...base('2024'), armor: 'Breastplate', shield: true })).toBe(14 + 2 + 2);
		expect(acOf({ ...base('2024'), armor: 'Plate Armor' })).toBe(18);
		expect(acOf({ ...base('2024'), armor: '' })).toBe(13);
		expect(acOf({ ...base('2024'), armor: 'Plate Armor', ac: 20 })).toBe(20);
		expect(acNoteOf({ ...base('2014'), armor: 'Chain Mail', shield: true })).toBe('chain mail, shield');
		expect(acNoteOf({ ...base('2014'), armor: 'natural' })).toBe('natural armor');
		expect(acNoteOf({ ...base('2024'), armor: 'Chain Mail' })).toBe('');
		expect(toMonster5e({ ...base('2024'), armor: 'Chain Mail', shield: true, gear: 'Longsword' }).gear).toBe('Chain Mail, Longsword, Shield');
	});
	it('speeds and uses, each edition\'s way', () => {
		expect(toMonster5e({ ...base('2014'), walk: 10, fly: 60, hover: true, swim: 30 }).speed).toBe('10 ft., fly 60 ft. (hover), swim 30 ft.');
		expect(toMonster5e({ ...base('2024'), walk: 10, fly: 60, hover: true, swim: 30 }).speed).toBe('10 ft., Fly 60 ft. (hover), Swim 30 ft.');
		const m = toMonster5e({ ...base('2024'), actions: [{ ...newAction5e('save'), name: 'Breath', uses: 'Recharge 5–6', count: 4, sides: '6', damageType: 'Cold' }], reactions: [{ name: 'Parry', uses: '3/Day', desc: 'It parries.' }] });
		expect(m.actions![0].name).toBe('Breath (Recharge 5–6)');
		expect(m.reactions![0].name).toBe('Parry (3/Day)');
		const back = fromMonster5e(m, '2024');
		expect([back.actions[0].name, back.actions[0].uses, back.reactions[0].uses]).toEqual(['Breath', 'Recharge 5–6', '3/Day']);
	});
	it('a saving throw with no damage, and one with damage and no half', () => {
		const d = { ...base('2014'), cr: '5', cha: 16 };
		const fear: Action5eDraft = { ...newAction5e('save'), name: 'Frightful Presence', save: 'wis', dcAbility: 'cha', area: 'each creature of its choice within 120 feet', sides: '', effect: 'become frightened for 1 minute' };
		expect(saveText(d, fear)).toBe('Each creature of its choice within 120 feet must succeed on a DC 14 Wisdom saving throw or become frightened for 1 minute.');
		expect(saveText({ ...d, edition: '2024' }, { ...fear, effect: 'The target has the Frightened condition until the end of its next turn.' }))
			.toBe('Wisdom Saving Throw: DC 14, each creature of its choice within 120 feet. Failure: The target has the Frightened condition until the end of its next turn.');
		expect(saveText(d, { ...fear, count: 3, sides: '6', damageType: 'Poison', half: false, area: '', effect: '' })).toBe('The target must succeed on a DC 14 Wisdom saving throw or take 10 (3d6) poison damage.');
	});
	it('2014 spellcasting is an Innate Spellcasting trait with its DC and attack, and opens as fields', () => {
		const m = toMonster5e({ ...base('2014'), name: 'Couatl', cr: '4', cha: 18, spellAbility: 'cha', atWill: 'detect magic', day3: 'bless, shield', day1: 'dream' });
		expect(m.traits!.at(-1)).toEqual({ name: 'Innate Spellcasting', desc: 'The couatl\'s innate spellcasting ability is Charisma (spell save DC 14, +6 to hit with spell attacks). It can innately cast the following spells:\n\nAt will: detect magic\n3/day each: bless, shield\n1/day each: dream' });
		const back = fromMonster5e(m, '2014');
		expect([back.spellAbility, back.atWill, back.day3, back.day1, back.traits.length]).toEqual(['cha', 'detect magic', 'bless, shield', 'dream', 0]);
	});
	it.each(EDITIONS)('%s: opening an SRD block reads most of its attacks back as fields', (ed) => {
		let attacks = 0, read = 0;
		for (const { monster } of bundledMonsters(ed)) {
			const d = fromMonster5e(monster, ed);
			attacks += (monster.actions ?? []).filter(a => /Attack Roll:|Weapon Attack:/.test(a.desc)).length;
			read += d.actions.filter(a => a.kind === 'melee' || a.kind === 'ranged' || a.kind === 'both').length;
		}
		// The rest are worded in ways the builder doesn't write (two targets, versatile damage); they stay as written.
		expect(read / attacks).toBeGreaterThan(ed === '2014' ? 0.65 : 0.75);
	});
});

describe('5e spell builder: the SRD\'s sentences', () => {
	it.each(EDITIONS)('%s: attack, save with half, save without, area, and higher levels', (ed) => {
		const d: Spell5eDraft = { ...newSpell5e(ed), name: 'Ember Lash', level: 2, attack: 'ranged', dmgCount: 3, dmgSides: '8', dmgType: 'Fire', upcast: 1, desc: 'A lash of fire.' };
		expect(rulesSentence(d)).toBe(`Make a ranged spell attack against the target. On a hit, the target takes 3d8 ${ed === '2014' ? 'fire' : 'Fire'} damage.`);
		expect(toSpell5e(d).desc).toBe(`A lash of fire. ${rulesSentence(d)}`);
		expect(toSpell5e(d).higherLevel).toBe(ed === '2014' ? 'When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd.' : 'The damage increases by 1d8 for each spell slot level above 2.');
		const save: Spell5eDraft = { ...d, attack: 'save', save: 'dex', area: 'cone', areaSize: 15 };
		expect(rulesSentence(save)).toBe(ed === '2014'
			? 'Each creature in a 15-foot cone must make a Dexterity saving throw. A target takes 3d8 fire damage on a failed save, or half as much damage on a successful one.'
			: 'Each creature in a 15-foot Cone makes a Dexterity saving throw, taking 3d8 Fire damage on a failed save or half as much damage on a successful one.');
		expect(rulesSentence({ ...save, area: 'sphere', areaSize: 20 })).toContain(ed === '2014' ? 'a 20-foot-radius sphere' : 'a 20-foot-radius Sphere');
		expect(rulesSentence({ ...save, half: false, area: '' })).toBe(ed === '2014' ? 'The target must succeed on a Dexterity saving throw or take 3d8 fire damage.' : 'The target makes a Dexterity saving throw. On a failed save, the target takes 3d8 Fire damage.');
		const cantrip: Spell5eDraft = { ...d, level: 0, dmgCount: 1, dmgSides: '10' };
		expect(upcastSentence(cantrip)).toBe(ed === '2014' ? 'This spell\'s damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).' : 'The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).');
		// What you type yourself wins.
		expect(toSpell5e({ ...d, higherLevel: 'It burns hotter.' }).higherLevel).toBe('It burns hotter.');
	});
	it('a reaction\'s trigger, ranges and areas', () => {
		const d = newSpell5e('2024');
		expect(toSpell5e({ ...d, castingTime: 'Reaction', trigger: 'when you are hit by an attack roll' }).castingTime).toBe('Reaction, which you take when you are hit by an attack roll');
		expect(toSpell5e({ ...d, castingTime: 'Reaction', trigger: 'which you take when you fall' }).castingTime).toBe('Reaction, which you take when you fall');
		expect(toSpell5e({ ...newSpell5e('2014'), castingTime: 'Reaction', trigger: 'when you fall' }).castingTime).toBe('1 reaction, which you take when you fall');
		expect(rangeText({ ...d, rangeKind: 'self' })).toBe('Self');
		expect(rangeText({ ...d, rangeKind: 'miles', distance: 1 })).toBe('1 mile');
		expect(rangeText({ ...d, rangeKind: 'feet', distance: 150 })).toBe('150 feet');
		expect(areaText({ ...d, area: 'line', areaSize: 100 })).toBe('a 100-foot-long, 5-foot-wide Line');
		const back = fromSpell5e(toSpell5e({ ...d, castingTime: 'Reaction', trigger: 'when you fall' }), '2024');
		expect([back.castingTime, back.trigger]).toEqual(['Reaction', 'which you take when you fall']);
	});
	it('2024 Burning Hands and Fire Bolt open as fields that write them back exactly', () => {
		for (const name of ['Burning Hands', 'Fire Bolt']) {
			const s = compendium5e('2024').spells.find(x => x.name === name)!;
			const d = fromSpell5e(s, '2024');
			expect(d.attack, name).toBe(name === 'Fire Bolt' ? 'ranged' : 'save');
			expect(toSpell5e(d)).toEqual(s);
		}
		const bh = fromSpell5e(compendium5e('2024').spells.find(x => x.name === 'Burning Hands')!, '2024');
		expect([bh.area, bh.areaSize, bh.dmgCount, bh.dmgSides, bh.upcast, bh.higherLevel]).toEqual(['cone', 15, 3, '6', 1, '']);
		// Changing a field rewrites the sentence where it stands.
		const hotter = toSpell5e({ ...bh, dmgCount: 4, area: 'sphere', areaSize: 20 });
		expect(hotter.desc).toMatch(/^A thin sheet of flames shoots forth from you\. Each creature in a 20-foot-radius Sphere makes a Dexterity saving throw, taking 4d6 Fire damage on a failed save or half as much damage on a successful one\.\n {2}Flammable/);
	});
});

describe('5e item builder: magic bonuses, charges, weapons and armor', () => {
	it.each(EDITIONS)('%s: a +2 weapon, armor, charges, and opening them again', (ed) => {
		const sword: Item5eDraft = { ...newItem5e(ed), name: 'Ember Blade', type: 'Weapon', subtype: 'Longsword', rarity: 'Rare', bonus: 2, charges: 3, regain: '1d3', desc: 'It burns.' };
		const i = toItem5e(sword);
		expect(i.desc).toBe(`${ed === '2014' ? 'You have a +2 bonus to attack and damage rolls made with this magic weapon.' : 'You have a +2 bonus to attack rolls and damage rolls made with this magic weapon.'}\n\nIt burns.\n\nThis item has 3 charges and regains 1d3 expended charges daily at dawn.`);
		const back = fromItem5e(i, ed);
		expect([back.bonus, back.charges, back.regain, back.desc]).toEqual([2, 3, '1d3', 'It burns.']);
		expect(toItem5e({ ...newItem5e(ed), type: 'Armor', subtype: 'Plate', bonus: 1 }).desc).toBe('You have a +1 bonus to Armor Class while wearing this armor.');
		expect(toItem5e({ ...newItem5e(ed), type: 'Wand', charges: 7, regain: '1d6 + 1' }).desc).toBe('This wand has 7 charges and regains 1d6 + 1 expended charges daily at dawn.');
	});
	it.each(EDITIONS)('%s: every SRD weapon and armor goes through the builder with its numbers', (ed) => {
		const gear = compendium5e(ed).equipment.filter(e => (e.damage && /^\d+d\d+/.test(e.damage)) || e.ac);
		sweep(gear, (e) => {
			const d = fromEquipment5e(e, ed);
			const back = parseEquipment5e(equipmentSource5e(toEquipment5e(d)))!;
			expect(back.damage ?? '').toBe(e.damage ?? '');
			expect(back.versatile ?? '').toBe(e.versatile ?? '');
			expect(back.range ?? '').toBe(e.range ?? '');
			expect(back.properties ?? []).toEqual((e.properties ?? []).filter(p => p !== 'Monk'));
			expect(back.mastery ?? '').toBe(ed === '2024' ? e.mastery ?? '' : '');
			expect(back.ac).toEqual(e.ac);
			expect(back.strMin).toBe(e.strMin);
			expect(!!back.stealthDisadvantage).toBe(!!e.stealthDisadvantage);
			expect([back.cost, back.weight]).toEqual([e.cost, e.weight]);
		});
	});
	it('a weapon block is equipment, not a magic item; a shield adds to AC', () => {
		const body = equipmentSource5e(toEquipment5e({ ...newItem5e('2024'), kind: 'weapon', name: 'Ember Pike', weaponCategory: 'Martial', dmgCount: 1, dmgSides: '10', dmgType: 'Piercing', properties: ['Heavy', 'Reach', 'Two-Handed'], mastery: 'Cleave', cost: '20 gp', weight: 18 }));
		expect(body).toBe('name: Ember Pike\ncategory: Martial Melee Weapon\ndamage: 1d10 piercing\nproperties: Heavy, Reach, Two-Handed\nmastery: Cleave\ncost: 20 gp\nweight: 18 lb.');
		expect(parseItem5e(body)).toBeNull();
		expect(parseEquipment5e(body)).toMatchObject({ name: 'Ember Pike', weaponCategory: 'Martial', weaponRange: 'Melee', damage: '1d10 piercing', mastery: 'Cleave' });
		const shield = parseEquipment5e(equipmentSource5e(toEquipment5e({ ...newItem5e('2014'), kind: 'armor', name: 'Tower Shield', armorCategory: 'Shield', acBase: 3 })))!;
		expect(shield.ac).toEqual({ base: 3, dex: false });
	});
});

describe('your items on a character sheet', () => {
	it('a homebrew weapon, a magic longsword with its +2, and a homebrew shield count on the sheet', () => {
		const pike = toEquipment5e({ ...newItem5e('2024'), kind: 'weapon', name: 'Ember Pike', weaponCategory: 'Martial', dmgCount: 1, dmgSides: '10', dmgType: 'Piercing', properties: ['Heavy', 'Reach', 'Two-Handed'] });
		const blade = toItem5e({ ...newItem5e('2024'), name: 'Ember Blade', type: 'Weapon', subtype: 'Longsword', rarity: 'Rare', bonus: 2 });
		const tower = toEquipment5e({ ...newItem5e('2024'), kind: 'armor', name: 'Tower Shield', armorCategory: 'Shield', acBase: 3 });
		const fm = { class: 'Fighter', level: 1, str: 16, dex: 10, inventory: [{ name: 'Ember Pike', equipped: true }, { name: 'Ember Blade', equipped: true }, { name: 'Tower Shield', equipped: true }] };
		const s = readSheet5e(fm, '2024', 'Vex', { equipment: [pike, tower], items: [blade] });
		expect(s.attacks.map(a => [a.name, a.toHit, a.damage, a.damageType])).toEqual([['Ember Pike', 5, '1d10+3', 'piercing'], ['Ember Blade', 7, '1d8+5', 'slashing']]);
		expect(s.ac).toBe(10 + 0 + 3);
	});
});
