// 5e's character wizards, checked against the SRD: every class at level 1 in
// both editions (saves, skills, expertise, spells known or prepared, cantrips,
// subclass when the class gets one at 1, weapon masteries and fighting styles,
// equipment and AC), characters made above level 1 (every increase, expertise
// and feature choice on the way), every class × species × background × level
// reading back, and level-ups at the levels that bring a subclass, an
// increase or a feat, expertise, choices and new spell levels. Then the
// wizard's steps, drawn by core's schema builder and driven like a user.
import { describe, expect, it } from 'vitest';
import type EmberVaultPlugin from '../main';
import type { BuilderUI } from '../src/core/builder/frame';
import { SchemaBuilder } from '../src/core/builder/schema';
import { readSheet5e, SKILLS } from '../src/systems/dnd5e/character';
import {
	allSkills, applyLevelUp5e, asiLevels, averageGain, backgroundCreation, backgroundOf, backgroundSkills, bonuses, Character5eDraft, characterFm, characterMissing, classCreation, classOf,
	expertiseAt, expertiseCount, finalScores, hasAsi, LevelUp5eDraft, levelOptions, magicInitiate, masteryCount, masteryWeapons, needsSubclass, newCantrips, newCharacter5e, newLevelUp5e,
	newMasteries, newSpellCount, optionGroups, pointsSpent, rollScores, settleIncreases, skillChoice, speciesBonuses, speciesChoices, spellCount, spellsAt, startingEquipment, subclassLevel,
	swapScores, toolChoices, languageChoice, withArray,
} from '../src/systems/dnd5e/character-draft';
import { characterSchema, levelUpSchema, settle } from '../src/systems/dnd5e/character-wizard';
import { Class5e, compendium5e, setContentLayer5e } from '../src/systems/dnd5e/compendium';
import { featuresGained } from '../src/systems/dnd5e/character-draft';
import { resources5e } from '../src/systems/dnd5e/sheet-actions';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';
import type { Dnd5eRuntime } from '../src/systems/dnd5e/runtime';
import { ABILITIES } from '../src/systems/dnd5e/types';

const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
function sweep<T>(cases: T[], check: (c: T) => void): void {
	const fails: string[] = [];
	for (const c of cases) {
		try { check(c); } catch (e) { fails.push(`${JSON.stringify(c).slice(0, 140)}: ${(e as Error).message.split('\n')[0]}`); }
	}
	expect(fails.slice(0, 5), `${fails.length} of ${cases.length} failed`).toEqual([]);
}

/** A draft with every choice filled the way a player in a hurry would: the first options. */
function filled(ed: Dnd5eEdition, cls: string, o: { level?: number; species?: string; sub?: string; background?: string } = {}): Character5eDraft {
	const c = compendium5e(ed);
	const d = withArray({ ...newCharacter5e(ed, { name: 'Tester', level: o.level ?? 1 }), className: cls, species: o.species ?? c.species[0].name, subspecies: o.sub ?? '', background: o.background ?? c.backgrounds[0].name });
	settle(d);
	const k = classOf(ed, cls)!;
	const level = d.level ?? 1;
	const fixed = [...backgroundSkills(backgroundOf(d)), ...(speciesChoices(d).skills ?? [])];
	const sc = skillChoice(k.skillChoice);
	d.skills = sc.from.filter(s => !fixed.includes(s)).slice(0, sc.count);
	const ch = speciesChoices(d);
	if (ch.skillChoices) d.speciesSkills = ch.skillChoices.from.filter(s => !fixed.includes(s) && !d.skills.includes(s)).slice(0, ch.skillChoices.count);
	if (ch.abilityChoices) d.raceUp = ch.abilityChoices.from.slice(0, ch.abilityChoices.count);
	d.expertise = allSkills(d).slice(0, expertiseCount(d));
	if (level >= subclassLevel(k) && k.subclasses.length) d.subclass = k.subclasses[0].name;
	d.choices = optionGroups(k, d.subclass, level).flatMap(g => g.from.slice(0, g.count));
	d.masteries = masteryWeapons(ed, cls).slice(0, masteryCount(ed, k, level));
	d.tools = toolChoices(d).flatMap(g => g.from.slice(0, g.count));
	d.languages = languageChoice(d).from.slice(0, languageChoice(d).count);
	const { cantrips, maxLevel } = spellsAt(k, level);
	const cl = c.spells.filter(s => s.classes.includes(cls));
	d.cantrips = cl.filter(s => s.level === 0).slice(0, cantrips).map(s => s.name);
	const count = spellCount(ed, k, level, finalScores(d))?.count ?? 0;
	d.spells = maxLevel ? cl.filter(s => s.level >= 1 && s.level <= maxLevel).slice(0, count).map(s => s.name) : [];
	const mi = magicInitiate(d);
	const taken = [...d.cantrips, ...d.spells];
	if (mi) { d.miCantrips = c.spells.filter(s => s.level === 0 && s.classes.includes(mi) && !taken.includes(s.name)).slice(0, 2).map(s => s.name); d.miSpell = [c.spells.find(s => s.level === 1 && s.classes.includes(mi) && !taken.includes(s.name))!.name]; }
	settleIncreases(d);
	return settle(d);
}
const sheetOf = (d: Character5eDraft) => readSheet5e(characterFm(d), d.edition, 'Tester');

describe('reading the rules from the compendium and the SRD\'s tables', () => {
	it.each(EDITIONS)('%s: every class says how many skills it picks, and from which', (ed) => {
		for (const c of compendium5e(ed).classes) {
			const sc = skillChoice(c.skillChoice);
			expect(sc.count, c.name).toBeGreaterThanOrEqual(2);
			expect(sc.from.length, c.name).toBeGreaterThanOrEqual(sc.count);
			for (const s of sc.from) expect(SKILLS.map(k => k.name)).toContain(s);
		}
		expect(skillChoice('Choose two from Arcana, History, and Insight')).toEqual({ count: 2, from: ['Arcana', 'History', 'Insight'] });
		expect(skillChoice('Choose any three').from.length).toBe(18);
	});
	it('subclass levels, increases and spells by edition', () => {
		expect(subclassLevel(classOf('2014', 'Cleric'))).toBe(1);
		expect(subclassLevel(classOf('2014', 'Sorcerer'))).toBe(1);
		expect(subclassLevel(classOf('2014', 'Warlock'))).toBe(1);
		expect(subclassLevel(classOf('2014', 'Wizard'))).toBe(2);
		expect(subclassLevel(classOf('2014', 'Fighter'))).toBe(3);
		for (const c of compendium5e('2024').classes) expect(subclassLevel(c), c.name).toBe(3);
		expect(asiLevels(classOf('2014', 'Fighter'))).toEqual([4, 6, 8, 12, 14, 16, 19]);
		expect(asiLevels(classOf('2014', 'Rogue'))).toEqual([4, 8, 10, 12, 16, 19]);
		expect(asiLevels(classOf('2024', 'Wizard'))).toEqual([4, 8, 12, 16, 19]);
	});
	it('spells known (2014 tables), prepared (2024\'s column; 2014 Wis or Cha + level), and a Wizard\'s spellbook', () => {
		const scores = { wis: 16, cha: 14, int: 16 };
		// SRD 5.1: Bard 4 known at 1, 22 at 20; Sorcerer 2 at 1; Warlock 2 at 1; Ranger none at 1, 2 at 2.
		expect(spellCount('2014', classOf('2014', 'Bard'), 1, scores)).toEqual({ count: 4, kind: 'known' });
		expect(spellCount('2014', classOf('2014', 'Bard'), 20, scores)).toEqual({ count: 22, kind: 'known' });
		expect(spellCount('2014', classOf('2014', 'Sorcerer'), 1, scores)).toEqual({ count: 2, kind: 'known' });
		expect(spellCount('2014', classOf('2014', 'Warlock'), 1, scores)).toEqual({ count: 2, kind: 'known' });
		expect(spellCount('2014', classOf('2014', 'Ranger'), 1, scores)).toBeNull();
		expect(spellCount('2014', classOf('2014', 'Ranger'), 2, scores)).toEqual({ count: 2, kind: 'known' });
		expect(spellCount('2014', classOf('2014', 'Cleric'), 1, scores)).toEqual({ count: 3 + 1, kind: 'prepared' });
		expect(spellCount('2014', classOf('2014', 'Druid'), 5, scores)).toEqual({ count: 3 + 5, kind: 'prepared' });
		expect(spellCount('2014', classOf('2014', 'Paladin'), 1, scores)).toBeNull();
		expect(spellCount('2014', classOf('2014', 'Paladin'), 5, scores)).toEqual({ count: 2 + 2, kind: 'prepared' });
		expect(spellCount('2014', classOf('2014', 'Wizard'), 1, scores)).toEqual({ count: 6, kind: 'spellbook' });
		expect(spellCount('2014', classOf('2014', 'Wizard'), 5, scores)).toEqual({ count: 14, kind: 'spellbook' });
		// SRD 5.2.1's Prepared Spells columns.
		expect([1, 5, 20].map(l => spellCount('2024', classOf('2024', 'Cleric'), l, scores)?.count)).toEqual([4, 9, 22]);
		expect([1, 2, 20].map(l => spellCount('2024', classOf('2024', 'Paladin'), l, scores)?.count)).toEqual([2, 3, 15]);
		expect([1, 2, 20].map(l => spellCount('2024', classOf('2024', 'Sorcerer'), l, scores)?.count)).toEqual([2, 4, 22]);
		expect([1, 11, 20].map(l => spellCount('2024', classOf('2024', 'Warlock'), l, scores)?.count)).toEqual([2, 11, 15]);
		expect(spellCount('2024', classOf('2024', 'Fighter'), 5, scores)).toBeNull();
		expect(spellCount('2024', classOf('2024', 'Wizard'), 3, scores)).toEqual({ count: 10, kind: 'spellbook' });
		expect(classCreation('2024', 'Wizard')!.prepared).toEqual([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25]);
	});
	it('expertise, weapon masteries and feature choices by level', () => {
		expect([1, 6].map(l => expertiseAt(classOf('2014', 'Rogue'), l))).toEqual([2, 2]);
		expect([3, 10].map(l => expertiseAt(classOf('2014', 'Bard'), l))).toEqual([2, 2]);
		expect([2, 9].map(l => expertiseAt(classOf('2024', 'Bard'), l))).toEqual([2, 2]);
		expect([2, 9].map(l => expertiseAt(classOf('2024', 'Ranger'), l))).toEqual([1, 2]);
		expect([1, 4, 10, 16].map(l => masteryCount('2024', classOf('2024', 'Fighter'), l))).toEqual([3, 4, 5, 6]);
		expect([1, 4, 10].map(l => masteryCount('2024', classOf('2024', 'Barbarian'), l))).toEqual([2, 3, 4]);
		expect(masteryCount('2024', classOf('2024', 'Rogue'), 1)).toBe(2);
		expect(masteryCount('2024', classOf('2024', 'Wizard'), 20)).toBe(0);
		expect(masteryWeapons('2024', 'Rogue')).toContain('Rapier');
		expect(masteryWeapons('2024', 'Rogue')).not.toContain('Greatsword');
		const fighter = optionGroups(classOf('2014', 'Fighter'), '', 1);
		expect(fighter.map(g => [g.group, g.count, g.from.length])).toEqual([['Fighting Style', 1, 6]]);
		const sorc = (l: number, after = 0) => optionGroups(classOf('2014', 'Sorcerer'), 'Draconic', l, after).map(g => [g.group, g.count]);
		expect(sorc(1)).toEqual([['Dragon Ancestor', 1]]);
		expect(sorc(3)).toEqual([['Metamagic', 2], ['Dragon Ancestor', 1]]);
		expect(sorc(10, 9)).toEqual([['Metamagic', 1]]);
		const lock = (l: number, after = 0) => optionGroups(classOf('2014', 'Warlock'), '', l, after).map(g => [g.group, g.count]);
		expect(lock(2)).toEqual([['Eldritch Invocation', 2]]);
		expect(lock(3, 2)).toEqual([['Pact Boon', 1]]);
		expect(lock(5, 4)).toEqual([['Eldritch Invocation', 1]]);
	});
	it('ability bonuses: 2014 from the race, subrace and a half-elf\'s choice; 2024 from the background, +2/+1 or +1/+1/+1', () => {
		expect(speciesBonuses('CON +2')).toEqual({ con: 2 });
		expect(speciesBonuses('All +1')).toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
		expect(bonuses({ ...newCharacter5e('2014'), species: 'Dwarf', subspecies: 'Hill Dwarf' })).toEqual({ con: 2, wis: 1 });
		expect(bonuses({ ...newCharacter5e('2014'), species: 'Elf', subspecies: 'High Elf' })).toEqual({ dex: 2, int: 1 });
		expect(bonuses({ ...newCharacter5e('2014'), species: 'Half-Elf', raceUp: ['STR', 'CON'] })).toEqual({ cha: 2, str: 1, con: 1 });
		const d = { ...newCharacter5e('2024'), background: 'Sage', plus2: 'int', plus1: 'wis' };
		expect(bonuses(d)).toEqual({ int: 2, wis: 1 });
		expect(bonuses({ ...d, spread: '111' as const })).toEqual({ con: 1, int: 1, wis: 1 });
	});
	it('point buy counts 27 points; the array and rolls swap between abilities; a roll is 4d6 drop the lowest', () => {
		const d: Character5eDraft = { ...newCharacter5e('2024'), name: 'P', method: 'pointbuy', str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 };
		expect(pointsSpent(d)).toBe(27);
		expect(characterMissing({ ...d, int: 10 })).toMatch(/29 points/);
		// Set out for the class: a wizard's Int, then Con and Dex.
		const a = withArray({ ...newCharacter5e('2024'), className: 'Wizard' });
		expect([a.int, a.con, a.dex]).toEqual([15, 14, 13]);
		swapScores(a, 'int', 'cha');
		expect([a.int, a.cha, a.arranged]).toEqual([8, 15, true]);
		// Each die shows its count: 1, 2, 3, 4 → the 1 is dropped, 9.
		let n = 0;
		expect(rollScores(() => (n++ % 4) + 1)).toEqual([9, 9, 9, 9, 9, 9]);
	});
	it('creation data: every starting item and pick is in the SRD\'s equipment', () => {
		for (const ed of EDITIONS) {
			const names = new Set(compendium5e(ed).equipment.map(e => e.name));
			for (const c of compendium5e(ed).classes) {
				const cc = classCreation(ed, c.name)!;
				expect(cc.equipment.length, `${ed} ${c.name}`).toBeGreaterThan(0);
				for (const g of cc.equipment) for (const o of g.options) {
					for (const i of o.items) expect(names.has(i.name), `${ed} ${c.name}: ${i.name}`).toBe(true);
					for (const p of o.picks) for (const x of p.from) expect(names.has(x), `${ed} ${c.name}: ${x}`).toBe(true);
				}
			}
			for (const b of compendium5e(ed).backgrounds) expect(backgroundCreation(ed, b.name), b.name).toBeDefined();
		}
	});
});

describe('every class at level 1, as the SRD makes it', () => {
	// What each class brings at level 1: cantrips, spells, subclass, expertise, weapon masteries, a fighting style.
	const L1: Record<Dnd5eEdition, Record<string, { cantrips: number; spells: number; subclass?: boolean; expertise?: number; masteries?: number; options?: string[] }>> = {
		2014: {
			Barbarian: { cantrips: 0, spells: 0 }, Bard: { cantrips: 2, spells: 4 }, Cleric: { cantrips: 3, spells: 1 + 3, subclass: true }, Druid: { cantrips: 2, spells: 1 + 3 },
			Fighter: { cantrips: 0, spells: 0, options: ['Fighting Style'] }, Monk: { cantrips: 0, spells: 0 }, Paladin: { cantrips: 0, spells: 0 }, Ranger: { cantrips: 0, spells: 0 },
			Rogue: { cantrips: 0, spells: 0, expertise: 2 }, Sorcerer: { cantrips: 4, spells: 2, subclass: true, options: ['Dragon Ancestor'] }, Warlock: { cantrips: 2, spells: 2, subclass: true }, Wizard: { cantrips: 3, spells: 6 },
		},
		2024: {
			Barbarian: { cantrips: 0, spells: 0, masteries: 2 }, Bard: { cantrips: 2, spells: 4 }, Cleric: { cantrips: 3, spells: 4 }, Druid: { cantrips: 2, spells: 4 },
			Fighter: { cantrips: 0, spells: 0, masteries: 3 }, Monk: { cantrips: 0, spells: 0 }, Paladin: { cantrips: 0, spells: 2, masteries: 2 }, Ranger: { cantrips: 0, spells: 2, masteries: 2 },
			Rogue: { cantrips: 0, spells: 0, expertise: 2, masteries: 2 }, Sorcerer: { cantrips: 4, spells: 2 }, Warlock: { cantrips: 2, spells: 2 }, Wizard: { cantrips: 3, spells: 6 },
		},
	};
	for (const ed of EDITIONS) {
		it.each(Object.keys(L1[ed]))(`${ed} %s`, (cls) => {
			const want = L1[ed][cls];
			const d = filled(ed, cls, { species: ed === '2014' ? 'Human' : 'Dwarf' });
			const k = classOf(ed, cls)!;
			const fm = characterFm(d);
			const s = readSheet5e(fm, ed, 'Tester');
			// HP: the hit die's maximum plus Con.
			expect(s.hpMax).toBe(k.hitDie + s.mods.con);
			expect(s.saves[k.saves[0].toLowerCase() as 'str'].proficient).toBe(true);
			const spells = s.spells.filter(x => x.spell?.level !== 0 && !(d.miSpell ?? []).includes(x.name));
			const cantrips = s.spells.filter(x => x.spell?.level === 0 && !(d.miCantrips ?? []).includes(x.name));
			expect([cantrips.length, spells.length]).toEqual([want.cantrips, want.spells]);
			expect(!!s.subclass).toBe(!!want.subclass);
			expect(((fm.expertise as string[] | undefined) ?? []).length).toBe(want.expertise ?? 0);
			expect(((fm.masteries as string[] | undefined) ?? []).length).toBe(want.masteries ?? 0);
			expect(optionGroups(k, d.subclass, 1).map(g => g.group)).toEqual(want.options ?? []);
			// Its starting equipment is carried, and its armor (if any) is worn.
			const { items, gold } = startingEquipment(d);
			expect(s.inventory.map(i => i.name)).toEqual(items.map(i => i.name));
			expect(s.gold).toBe(gold);
			if (s.inventory.some(i => i.equipped && i.equipment?.ac && !/shield/i.test(i.name))) expect(s.acFrom).not.toMatch(/^Unarmored/);
		});
	}
	it('2024 Fighter: option A\'s Chain Mail (AC 16) and its weapons, a Fighting Style feat; option C is 155 GP', () => {
		const d = filled('2024', 'Fighter');
		d.styleFeat = 'Defense';
		const s = sheetOf(d);
		expect(s.ac).toBe(16);
		expect(s.attacks.map(a => a.name)).toEqual(['Greatsword', 'Flail', 'Javelin']);
		expect(s.features.some(f => f.name === 'Defense' && f.source === 'Feat')).toBe(true);
		expect(startingEquipment({ ...d, equip: { c0: 'C' } }).gold).toBe(155 + 8);
	});
	it('2014 Fighter: chain mail or leather and a longbow; a martial weapon and shield picked from the list', () => {
		const d = filled('2014', 'Fighter', { species: 'Human' });
		d.equipPicks = { 'c1.A.0': ['Longsword'] };
		const s = sheetOf(d);
		expect(s.ac).toBe(16 + 2);
		expect(s.inventory.map(i => i.name)).toEqual(expect.arrayContaining(['Chain Mail', 'Longsword', 'Shield', 'Crossbow, light', "Dungeoneer's Pack"]));
		// Only the chosen Fighting Style shows on the sheet.
		const style = s.features.filter(f => /^Fighting Style/.test(f.name)).map(f => f.name);
		expect(style).toEqual(['Fighting Style', 'Fighting Style: Archery']);
	});
	it('2014 races: a hill dwarf\'s +1 Wis, an elf\'s Perception, a half-orc\'s Intimidation, a high elf\'s cantrip and language', () => {
		expect(sheetOf(filled('2014', 'Cleric', { species: 'Dwarf', sub: 'Hill Dwarf' })).scores.wis).toBe(15 + 1);
		expect(sheetOf(filled('2014', 'Fighter', { species: 'Elf' })).skills.find(k => k.name === 'Perception')!.proficient).toBe(true);
		expect(sheetOf(filled('2014', 'Fighter', { species: 'Half-Orc' })).skills.find(k => k.name === 'Intimidation')!.proficient).toBe(true);
		const elf = filled('2014', 'Wizard', { species: 'Elf', sub: 'High Elf' });
		elf.raceCantrip = 'Light';
		const fm = characterFm(elf);
		expect(fm.spells).toContain('Light');
		expect((fm.languages as string[]).slice(0, 2)).toEqual(['Common', 'Elvish']);
		expect((fm.languages as string[]).length).toBe(2 + 1 + 2);
	});
	it('2024 origins: a human\'s extra skill and Versatile feat, the Sage\'s Magic Initiate (Wizard) spells, two standard languages', () => {
		const d = filled('2024', 'Fighter', { species: 'Human', background: 'Sage' });
		expect(d.speciesSkills!.length).toBe(1);
		expect(magicInitiate(d)).toBe('Wizard');
		d.originFeat = 'Alert';
		const fm = characterFm(d);
		expect(fm.feats).toEqual(['Alert']);
		expect((fm.spells as string[]).length).toBe(3);
		expect((fm.languages as string[]).length).toBe(3);
		const s = readSheet5e(fm, '2024', 'Tester');
		expect(s.features.filter(f => f.source === 'Feat').map(f => f.name)).toEqual(['Magic Initiate (Wizard)', 'Alert']);
		expect(s.tools).toEqual(["Calligrapher's Supplies"]);
	});
});

describe('a character made above level 1 gets every level\'s choices', () => {
	it('2024 Fighter 6: increases at 4 and 6, a fighting style, four masteries, HP by the average', () => {
		const d = filled('2024', 'Fighter', { level: 6 });
		expect(d.increases!.map(i => i.level)).toEqual([4, 6]);
		const before = finalScores({ ...d, increases: [] });
		const s = sheetOf(d);
		expect(ABILITIES.reduce((n, a) => n + s.scores[a] - before[a], 0)).toBe(4);
		expect(s.hpMax).toBe(10 + s.mods.con + 5 * (6 + s.mods.con));
		expect((characterFm(d).masteries as string[]).length).toBe(4);
		d.increases![1] = { ...d.increases![1], take: 'feat', feat: 'Grappler' };
		expect(characterFm(d).feats).toEqual(['Grappler']);
	});
	it('2014 Bard 10: four expertise picks, the College, spells known 14', () => {
		const d = filled('2014', 'Bard', { level: 10 });
		const fm = characterFm(d);
		expect((fm.expertise as string[]).length).toBe(4);
		expect(fm.subclass).toBe('Lore');
		expect((fm.spells as string[]).filter(n => compendium5e('2014').spells.find(s => s.name === n)!.level > 0).length).toBe(14);
	});
	it('2014 Warlock 5: three invocations and a pact boon, chosen ones only on the sheet', () => {
		const d = filled('2014', 'Warlock', { level: 5 });
		const fm = characterFm(d);
		expect((fm.choices as string[]).filter(c => /^Eldritch Invocation/.test(c)).length).toBe(3);
		expect((fm.choices as string[]).filter(c => /^Pact of/.test(c)).length).toBe(1);
		const s = readSheet5e(fm, '2014', 'Tester');
		expect(s.features.filter(f => /^Eldritch Invocation:|^Pact of/.test(f.name)).length).toBe(4);
	});
});

describe('every new character makes a sheet that reads back', () => {
	for (const ed of EDITIONS) {
		it(`${ed}: every class × species × background × level`, () => {
			const c = compendium5e(ed);
			const species = c.species.flatMap(s => (s.subspecies.length ? s.subspecies.map(x => ({ species: s.name, sub: x.name })) : [{ species: s.name, sub: '' }]));
			const cases = c.classes.flatMap(k => species.flatMap(s => c.backgrounds.flatMap(b => [1, 3, 5, 20].map(level => ({ cls: k.name, ...s, bg: b.name, level })))));
			sweep(cases, ({ cls, species: sp, sub, bg, level }) => {
				const d = filled(ed, cls, { level, species: sp, sub, background: bg });
				expect(characterMissing(d)).toBeNull();
				const fm = characterFm(d);
				const s = readSheet5e(fm, ed, 'Tester');
				expect(s.level).toBe(level);
				expect(s.className).toBe(cls);
				expect(s.pb).toBe(2 + Math.floor((level - 1) / 4));
				const scores = finalScores(d);
				for (const a of ABILITIES) { expect(s.scores[a]).toBe(scores[a]); expect(scores[a]).toBeLessThanOrEqual(20); }
				for (const sk of allSkills(d)) expect(s.skills.find(x => x.name === sk)?.proficient, sk).toBe(true);
				for (const sp2 of s.spells) expect(sp2.spell, sp2.name).toBeDefined();
				const k = classOf(ed, cls)!;
				const { cantrips } = spellsAt(k, level);
				const count = spellCount(ed, k, level, scores)?.count ?? 0;
				const mi = magicInitiate(d) ? 3 : 0;
				expect(s.spells.length).toBeLessThanOrEqual(cantrips + count + mi + (d.raceCantrip ? 1 : 0));
				for (const it of s.inventory) expect(it.equipment ?? it.item, it.name).toBeDefined();
				if (d.subclass) expect(s.subclass).toBe(d.subclass);
			});
		}, 60000);
	}
});

describe('levelling up', () => {
	const climb = (ed: Dnd5eEdition, cls: string, to: number, each?: (d: LevelUp5eDraft, fm: Record<string, unknown>) => void) => {
		const fm = characterFm(filled(ed, cls));
		for (let l = 2; l <= to; l++) {
			const d = newLevelUp5e(fm, ed, 'Climber');
			const k = classOf(ed, cls)!;
			if (needsSubclass(d)) d.subclass = k.subclasses[0].name;
			d.cantrips = classOf(ed, cls) ? compendium5e(ed).spells.filter(s => s.level === 0 && s.classes.includes(cls) && !d.known.includes(s.name)).slice(0, newCantrips(d)).map(s => s.name) : [];
			const max = spellsAt(k, l).maxLevel;
			d.spells = max ? compendium5e(ed).spells.filter(s => s.classes.includes(cls) && s.level >= 1 && s.level <= max && !d.known.includes(s.name)).slice(0, newSpellCount(d)).map(s => s.name) : [];
			d.expertise = d.skillsNow.filter(x => !d.expertiseNow.includes(x)).slice(0, expertiseAt(k, l));
			d.choices = levelOptions(d).flatMap(g => g.from.slice(0, g.count));
			d.masteries = masteryWeapons(ed, cls).filter(w => !d.masteriesNow.includes(w)).slice(0, newMasteries(d));
			each?.(d, fm);
			applyLevelUp5e(fm, d);
		}
		return fm;
	};
	for (const ed of EDITIONS) {
		it(`${ed}: every class climbs to 20 with each kind of increase; HP, subclass, spells, expertise and choices land`, () => {
			const takes: ('plus2' | 'plus1' | 'feat')[] = ['plus2', 'plus1', 'feat'];
			sweep(compendium5e(ed).classes.flatMap(k => takes.map(take => ({ cls: k.name, take }))), ({ cls, take }) => {
				const k = classOf(ed, cls)!;
				let checked = 0;
				const fm = climb(ed, cls, 20, (d, now) => {
					const before = readSheet5e(now, ed, 'Climber');
					expect(hasAsi(d)).toBe(asiLevels(k).includes(d.level));
					d.asi = take;
					d.feat = compendium5e(ed).feats.find(f => f.type !== 'origin' && f.type !== 'fighting-style' && f.name !== 'Ability Score Improvement')?.name ?? '';
					// A level's HP is its die's average plus Con.
					const trial = { ...now };
					applyLevelUp5e(trial, d);
					const after = readSheet5e(trial, ed, 'Climber');
					const conUp = after.mods.con - before.mods.con;
					expect(after.hpMax - before.hpMax).toBe(Math.max(1, Math.floor(k.hitDie / 2) + 1 + before.mods.con) + conUp * d.level);
					if (d.level >= subclassLevel(k)) expect(after.subclass).toBe(k.subclasses[0].name);
					for (const a of ABILITIES) expect(after.scores[a]).toBeLessThanOrEqual(20);
					for (const sp of [...d.cantrips, ...d.spells]) expect(after.spells.map(x => x.name)).toContain(sp);
					checked++;
				});
				expect(checked).toBe(19);
				expect(readSheet5e(fm, ed, 'Climber').level).toBe(20);
				const capped = { ...fm };
				applyLevelUp5e(capped, newLevelUp5e(capped, ed, 'Climber'));
				expect(capped.level).toBe(20);
			});
		});
	}
	it('2014 Wizard: its tradition at 2, 2nd-level spells at 3, an increase at 4, 3rd-level spells at 5', () => {
		const fm = characterFm(filled('2014', 'Wizard'));
		const steps: string[][] = [];
		for (let l = 2; l <= 5; l++) {
			const d = newLevelUp5e(fm, '2014', 'W');
			const b = new SchemaBuilder(plugin, levelUpSchema(rt('2014')), { fm, edition: '2014', name: 'W' });
			steps.push(b.steps().map(s => s.id));
			if (needsSubclass(d)) d.subclass = 'School of Evocation';
			d.spells = ['Shield', 'Misty Step', 'Fireball'].filter(s => !d.known.includes(s)).slice(0, 2);
			applyLevelUp5e(fm, d);
		}
		expect(steps).toEqual([['hp', 'subclass', 'spells'], ['hp', 'spells'], ['hp', 'asi', 'spells'], ['hp', 'spells']]);
		expect(newSpellCount({ ...newLevelUp5e(fm, '2014', 'W') })).toBe(2);
	});
	it('2014 Rogue 6 and 2024 Bard 9 pick expertise; 2014 Sorcerer 3 picks two Metamagic options', () => {
		const rogue = climb('2014', 'Rogue', 5);
		const d6 = newLevelUp5e(rogue, '2014', 'R');
		expect(expertiseAt(classOf('2014', 'Rogue'), d6.level)).toBe(2);
		expect(new SchemaBuilder(plugin, levelUpSchema(rt('2014')), { fm: rogue, edition: '2014', name: 'R' }).steps().map(s => s.id)).toEqual(['hp', 'features']);
		const bard = climb('2024', 'Bard', 8);
		expect(expertiseAt(classOf('2024', 'Bard'), newLevelUp5e(bard, '2024', 'B').level)).toBe(2);
		const sorc = climb('2014', 'Sorcerer', 2);
		const d3 = newLevelUp5e(sorc, '2014', 'S');
		expect(levelOptions(d3).map(g => [g.group, g.count])).toEqual([['Metamagic', 2]]);
		d3.choices = levelOptions(d3)[0].from.slice(0, 3);
		applyLevelUp5e(sorc, d3);
		expect((sorc.choices as string[]).filter(c => /^Metamagic/.test(c)).length).toBe(2);
	});
	it('a higher Constitution raises every level\'s hit points, and a 2024 Epic Boon\'s +1 can pass 20', () => {
		const fm: Record<string, unknown> = { ...characterFm(filled('2024', 'Fighter', { level: 3 })), con: 15 };
		fm.hp_max = 30; fm.hp = 30;
		const d = newLevelUp5e(fm, '2024', 'F');
		Object.assign(d, { asi: 'plus1', a1: 'con', a2: 'str' });
		applyLevelUp5e(fm, d);
		// d10 average 6 + Con +2 for level 4, then +1 for each of 4 levels as Con 15 → 16.
		expect(fm.hp_max).toBe(30 + 8 + 4);
		const boon: Record<string, unknown> = { ...characterFm(filled('2024', 'Wizard', { level: 18 })), int: 20 };
		const b = newLevelUp5e(boon, '2024', 'B');
		Object.assign(b, { asi: 'feat', feat: 'Boon of Fate', featUp: 'int' });
		applyLevelUp5e(boon, b);
		expect([boon.int, (boon.feats as string[]).includes('Boon of Fate')]).toEqual([21, true]);
	});
	it('a rolled or table hit die counts as rolled', () => {
		const fm = characterFm(filled('2024', 'Fighter'));
		const hp = Number(fm.hp_max);
		const d = { ...newLevelUp5e(fm, '2024', 'R'), hp: 'roll' as const };
		applyLevelUp5e(fm, d, 7);
		expect(Number(fm.hp_max) - hp).toBe(7 + d.conMod);
		const m = { ...newLevelUp5e(fm, '2024', 'R'), hp: 'manual' as const, manual: 1 };
		const before = Number(fm.hp_max);
		applyLevelUp5e(fm, m);
		expect(Number(fm.hp_max) - before).toBe(Math.max(1, 1 + m.conMod));
	});
});

// ----------------------------------------------------------------------------
// The wizard's steps

const app = { workspace: { getActiveFile: () => null }, metadataCache: { getFirstLinkpathDest: () => null } };
const plugin = { app, campaigns: { active: null } } as unknown as EmberVaultPlugin;
const rt = (ed: Dnd5eEdition) => ({ plugin, edition: () => ed }) as unknown as Dnd5eRuntime;
function harness<M extends Record<string, unknown>>(b: SchemaBuilder<M>) {
	let lives: (() => void)[] = [];
	const panel = document.createElement('div');
	let step = b.steps()[0].id;
	const ui: BuilderUI = { plugin, sourcePath: '', phone: false, changed: () => lives.forEach(f => f()), rebuild: () => draw(step), live: (f) => { lives.push(f); f(); }, go: () => {}, nudge: () => {} };
	const draw = (id: string) => { step = id; lives = []; panel.empty(); b.renderStep(id, panel, ui); };
	return { ui, panel, draw };
}

describe.each(EDITIONS)('the wizards drawn by the schema engine (%s)', (ed) => {
	it('New character: every step draws; class skills stop at the class\'s count; the output is a 5e sheet note', () => {
		const b = new SchemaBuilder(plugin, characterSchema(rt(ed)), { request: { mine: true, name: 'Ilse', level: 5 } });
		const d = b.draft;
		d.className = 'Wizard';
		expect(b.steps().map(s => s.id)).toEqual(['who', 'abilities', 'skills', 'proficiencies', 'class', 'increases', 'equipment']);
		const h = harness(b);
		for (const s of b.steps()) { h.draw(s.id); expect(h.panel.querySelectorAll('.eb-field').length, s.id).toBeGreaterThan(0); }
		h.draw('skills');
		const picks = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-key="skills"] .eb-pick')];
		const count = skillChoice(classOf(ed, 'Wizard')!.skillChoice).count;
		picks.slice(0, count + 1).forEach(p => p.click());
		expect(d.skills.length).toBe(count);
		expect(picks[count].disabled).toBe(true);
		h.draw('class');
		expect(h.panel.querySelector('[data-key="subclass"]')!.classList.contains('is-hidden')).toBe(false);
		// Spells stop at the spellbook's count: six, and two a level.
		const spells = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-key="spells"] .eb-pick')];
		spells.slice(0, 15).forEach(p => p.click());
		expect(d.spells.length).toBe(14);
		h.draw('increases');
		expect(h.panel.querySelectorAll('.dnd5e-asi-card').length).toBe(1);
		h.draw('equipment');
		expect(h.panel.querySelectorAll('.dnd5e-eq-option').length).toBeGreaterThan(1);
		const preview = document.createElement('div');
		b.renderPreview(preview, h.ui);
		expect(preview.textContent).toMatch(/Ilse[\s\S]*Level 5[\s\S]*Wizard/);
		const out = b.output();
		expect(out.lang).toBe('5e-sheet');
		expect(out.properties).toMatchObject({ system: '5e', edition: ed, class: 'Wizard', level: 5, mine: true });
		expect(out.after).toBe('## Notes');
	});
	it('New character: the array swaps between abilities; point buy\'s budget; rolls set out for the class', () => {
		const b = new SchemaBuilder(plugin, characterSchema(rt(ed)), { request: { mine: true, name: 'Ilse', level: 1 } });
		const h = harness(b);
		const d = b.draft;
		d.className = 'Wizard';
		h.draw('abilities');
		expect(h.panel.querySelectorAll('.dnd5e-ab-card').length).toBe(6);
		const intSel = h.panel.querySelector<HTMLSelectElement>('.dnd5e-ab-card.is-int select')!;
		expect(intSel.selectedOptions[0].textContent).toBe('15');
		intSel.value = 'cha';
		intSel.dispatchEvent(new Event('change'));
		expect([d.int, d.cha]).toEqual([8, 15]);
		d.method = 'pointbuy';
		h.draw('abilities');
		expect(h.panel.querySelector('[data-key="points"]')!.classList.contains('is-hidden')).toBe(false);
		d.method = 'roll';
		h.draw('abilities');
		h.panel.querySelector<HTMLButtonElement>('.dnd5e-roll-btn')!.click();
		expect(d.rolled!.length).toBe(6);
		expect(d.int).toBe(Math.max(...d.rolled!));
	});
	it('Level up: steps follow the level (a subclass at 3, an increase at 4), and the output carries the draft', () => {
		const fm = characterFm(filled(ed, 'Fighter', { level: 3 }));
		delete fm.subclass;
		const at3 = new SchemaBuilder(plugin, levelUpSchema(rt(ed)), { fm: { ...fm, level: 2 }, edition: ed, name: 'Vex' });
		expect(at3.steps().map(s => s.id)).toEqual(['hp', 'subclass']);
		const at4 = new SchemaBuilder(plugin, levelUpSchema(rt(ed)), { fm, edition: ed, name: 'Vex' });
		expect(at4.steps().map(s => s.id)).toEqual(ed === '2024' ? ['hp', 'subclass', 'asi', 'features'] : ['hp', 'subclass', 'asi']);
		const h = harness(at4);
		for (const s of at4.steps()) h.draw(s.id);
		const preview = document.createElement('div');
		at4.renderPreview(preview, h.ui);
		expect(preview.textContent).toMatch(/Vex[\s\S]*level 3 → 4/);
		expect(preview.textContent).toContain(`max ${Number(fm.hp_max) + averageGain(newLevelUp5e(fm, ed, 'Vex'))}`);
		expect((at4.output() as { data?: unknown }).data).toBe(at4.draft);
	});
});

// ----------------------------------------------------------------------------
// A class that isn't in the SRD (a content pack's, a class builder's later) goes through every step like an SRD class.

describe('a content pack\'s own class, made and levelled like the SRD\'s', () => {
	// A homebrew half caster: Paladin spells from level 2 by its own Prepared column and half-caster slots, a subclass at 3,
	// increases at 4 and 8, expertise at 6, a counted feature of its own that comes back on a short rest, and a choice
	// among its own options at 1.
	const halfSlots = (l: number) => (l < 2 ? undefined : [l >= 3 ? 3 : 2, l >= 5 ? 2 : 0, l >= 9 ? 2 : 0, 0, 0, 0, 0, 0, 0]);
	const table: Record<number, string[]> = { 1: ['Cinder Mark', 'Ward Stance'], 2: ['Spellcasting'], 3: ['Warden Order'], 4: ['Ability Score Improvement'], 6: ['Expertise'], 7: ['Warden Order feature'], 8: ['Ability Score Improvement'] };
	const ash: Class5e = {
		name: 'Ash Warden', hitDie: 10, primary: 'Strength or Charisma', saves: ['STR', 'CHA'], proficiencies: ['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons'],
		skillChoice: 'Choose 2: Athletics, Insight, Intimidation, Persuasion, or Survival', spellcasting: 'CHA', spellList: 'Paladin',
		features: [
			{ level: 1, name: 'Cinder Mark', desc: 'You mark a creature you can see. You regain all expended uses when you finish a Short or Long Rest.' },
			{ level: 1, name: 'Ward Stance', desc: 'Choose one of the following options.' },
			{ level: 1, name: 'Ward Stance: Ember', desc: 'Your marked foes burn.' },
			{ level: 1, name: 'Ward Stance: Ash', desc: 'Your marked foes choke.' },
			{ level: 2, name: 'Spellcasting', desc: 'You cast Paladin spells, using Charisma.' },
			{ level: 3, name: 'Warden Order', desc: 'Choose an order.' },
			{ level: 4, name: 'Ability Score Improvement', desc: 'Increase one score by 2, or two by 1.' },
			{ level: 6, name: 'Expertise', desc: 'Choose two of your skill proficiencies.' },
			{ level: 8, name: 'Ability Score Improvement', desc: 'Increase one score by 2, or two by 1.' },
		],
		levels: Array.from({ length: 20 }, (_, i) => {
			const l = i + 1;
			return { level: l, pb: 2 + Math.floor(i / 4), features: table[l] ?? [], slots: halfSlots(l), prepared: l < 2 ? undefined : Math.floor(l / 2) + 1, extra: { cinder_mark_uses: l < 5 ? 2 : 3 } };
		}),
		subclasses: [{ name: 'Order of Embers', flavor: 'Warden Order', desc: '', features: [{ level: 3, name: 'Kindle', desc: 'Your mark sets fires.' }, { level: 7, name: 'Bonfire', desc: 'Your fires spread.' }] }],
	};
	const withPack = (fn: () => void) => {
		setContentLayer5e(() => ({ compendium: { classes: [ash] }, subclasses: [], monsters: [] }));
		try { fn(); } finally { setContentLayer5e(null); }
	};

	it('New character at 1: its skills, its own option, its counted feature, no spells yet; at 5: subclass, increase, prepared spells and slots from its table', () => withPack(() => {
		const d = filled('2024', 'Ash Warden');
		// Set out by its primary abilities: Strength, then Charisma.
		expect([d.str, d.cha]).toEqual([15, 14]);
		expect(optionGroups(classOf('2024', 'Ash Warden'), '', 1)).toEqual([{ group: 'Ward Stance', count: 1, from: ['Ward Stance: Ember', 'Ward Stance: Ash'] }]);
		const s = sheetOf(d);
		expect(s.hpMax).toBe(10 + s.mods.con);
		expect(s.saves.str.proficient && s.saves.cha.proficient).toBe(true);
		expect(s.skills.filter(k => k.proficient).map(k => k.name)).toEqual(expect.arrayContaining(['Athletics', 'Insight']));
		expect(s.features.filter(f => f.source === 'Ash Warden').map(f => f.name)).toEqual(['Cinder Mark', 'Ward Stance', 'Ward Stance: Ember']);
		expect(spellCount('2024', classOf('2024', 'Ash Warden'), 1, s.scores)).toBeNull();
		expect(resources5e(s).map(r => [r.name, r.max, r.per])).toEqual([['Cinder Mark', 2, 'short']]);

		const five = filled('2024', 'Ash Warden', { level: 5 });
		expect(five.subclass).toBe('Order of Embers');
		expect(five.increases!.map(i => i.level)).toEqual([4]);
		const k = classOf('2024', 'Ash Warden')!;
		expect(spellCount('2024', k, 5, finalScores(five))).toEqual({ count: 3, kind: 'prepared' });
		// Its spells come from the Paladin's list, up to 2nd level.
		expect(five.spells.every(n => compendium5e('2024').spells.find(x => x.name === n)!.classes.includes('Paladin'))).toBe(true);
		const s5 = sheetOf(five);
		expect(s5.spells.length).toBe(3);
		expect(s5.slots.map(x => [x.level, x.max])).toEqual([[1, 3], [2, 2]]);
		expect(s5.spellcasting).toEqual({ ability: 'cha', dc: 8 + 3 + s5.mods.cha, attack: 3 + s5.mods.cha });
		expect(s5.features.map(f => f.name)).toContain('Kindle');
		expect(resources5e(s5).find(r => r.name === 'Cinder Mark')!.max).toBe(3);
	}));

	it('Level up 1 → 8: spells by its Prepared column, its subclass at 3, increases at 4 and 8, expertise at 6, the subclass\'s feature at 7', () => withPack(() => {
		const fm = characterFm(filled('2024', 'Ash Warden'));
		const seen: Record<number, string[]> = {};
		for (let l = 2; l <= 8; l++) {
			const d = newLevelUp5e(fm, '2024', 'Ash');
			seen[l] = new SchemaBuilder(plugin, levelUpSchema(rt('2024')), { fm, edition: '2024', name: 'Ash' }).steps().map(x => x.id);
			if (needsSubclass(d)) d.subclass = 'Order of Embers';
			if (l === 7) expect(featuresGained(d)).toEqual(['Bonfire']);
			d.spells = compendium5e('2024').spells.filter(x => x.classes.includes('Paladin') && x.level >= 1 && x.level <= spellsAt(classOf('2024', 'Ash Warden'), l).maxLevel && !d.known.includes(x.name)).slice(0, newSpellCount(d)).map(x => x.name);
			d.expertise = d.skillsNow.slice(0, expertiseAt(classOf('2024', 'Ash Warden'), l));
			applyLevelUp5e(fm, d);
		}
		expect(seen).toEqual({
			2: ['hp', 'spells'], 3: ['hp', 'subclass'], 4: ['hp', 'asi', 'spells'], 5: ['hp'], 6: ['hp', 'features', 'spells'], 7: ['hp'], 8: ['hp', 'asi', 'spells'],
		});
		const s = readSheet5e(fm, '2024', 'Ash');
		// Five prepared at 8 by its column, and the Acolyte's Magic Initiate cantrips and spell.
		expect([s.level, s.subclass, s.spells.length, (fm.expertise as string[]).length]).toEqual([8, 'Order of Embers', 5 + 3, 2]);
		expect(s.hpMax).toBe(10 + s.mods.con + 7 * (6 + s.mods.con));
		expect(s.features.map(f => f.name)).toEqual(expect.arrayContaining(['Kindle', 'Bonfire']));
	}));
});
