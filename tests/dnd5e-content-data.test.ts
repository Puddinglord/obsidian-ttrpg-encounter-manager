// 5e content that used to be read from creation.json or by a feature's name,
// now data a pack or a block can give: a species', subspecies' or
// background's own skill, language, tool and cantrip choices; how many
// options a feature gives (`choose`) or the table column counting them
// (`known`); the AC a feature gives without armor (`unarmored`); a feat's
// Ability Score Increase; a subclass's always-prepared spells. The SRD's
// classes carry the same data, and read the same as before.
import { afterEach, describe, expect, it } from 'vitest';
import { readSheet5e } from '../src/systems/dnd5e/character';
import {
	alwaysPrepared, applyLevelUp5e, bonuses, canSwapSpell, characterFm, classOf, classSpells, featIncrease, swapChoices, swappable, givenLanguages, languageChoice, newCharacter5e, newLevelUp5e, optionGroups, speciesChoices, toolChoices,
} from '../src/systems/dnd5e/character-draft';
import { settle } from '../src/systems/dnd5e/character-wizard';
import { setContentLayer5e, setSpellLibrary5e, Spell5e } from '../src/systems/dnd5e/compendium';
import { content5e } from '../src/systems/dnd5e/content';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';

afterEach(() => setContentLayer5e(null));

const homebrew = (entries: { kind: string; name: string; value: Record<string, unknown> }[]) =>
	setContentLayer5e(() => content5e(entries.map(e => ({ ...e, value: { name: e.name, ...e.value }, pack: 'Homebrew' }))));

describe('a species, subspecies or background says what a new character chooses', () => {
	it('2024: a species\' skill and cantrip choices, a lineage\'s own skill', () => {
		homebrew([{ kind: 'species', name: 'Emberfolk', value: {
			size: 'Small', speed: 30, traits: [{ name: 'Spark', desc: 'You know a fire cantrip.' }],
			skillChoices: { count: 1, from: ['Arcana', 'Survival'] }, cantripChoices: { count: 1, from: ['Fire Bolt', 'Produce Flame'] },
			subspecies: [{ name: 'Ashborn', traits: [{ name: 'Soot', desc: 'You blend into smoke.' }], skills: ['Stealth'] }],
		} }]);
		const d = { ...newCharacter5e('2024', { name: 'Kel' }), species: 'Emberfolk', subspecies: 'Ashborn', speciesSkills: ['Survival'], raceCantrip: 'Fire Bolt' };
		settle(d);
		const ch = speciesChoices(d);
		expect(ch.skillChoices).toEqual({ count: 1, from: ['Arcana', 'Survival'] });
		expect(ch.cantripChoices?.from).toEqual(['Fire Bolt', 'Produce Flame']);
		expect(ch.skills).toEqual(['Stealth']);
		expect(d.speciesSkills).toEqual(['Survival']);
		const fm = characterFm(d);
		expect(fm.skills).toEqual(expect.arrayContaining(['Stealth', 'Survival']));
		expect(fm.lineage).toBe('Ashborn');
	});

	it('2014: a race\'s languages, a language choice from its own list, tools, a subrace\'s bonus and a half-elf-like choice', () => {
		homebrew([
			{ kind: 'species', name: 'Cinderkin', value: {
				size: 'Medium', speed: 30, abilityBonuses: 'CON +2', languages: ['Common', 'Ignan'], languageChoices: { count: 1, from: ['Elvish', 'Sylvan'] },
				toolChoices: { count: 1, from: ['Smith\'s Tools', 'Glassblower\'s Tools'] }, abilityChoices: { count: 1, bonus: 1, from: ['STR', 'WIS'] },
				traits: [], subspecies: [{ name: 'Deep Cinderkin', traits: [], abilityBonuses: 'WIS +1' }],
			} },
			{ kind: 'background', name: 'Lamplighter', value: { proficiencies: ['Skill: Perception', 'Skill: Stealth'], languages: ['Halfling'] } },
		]);
		const d = { ...newCharacter5e('2014', { name: 'Ash' }), species: 'Cinderkin', subspecies: 'Deep Cinderkin', background: 'Lamplighter', raceUp: ['STR'], languages: ['Sylvan'], tools: ['Smith\'s Tools'] };
		settle(d);
		expect(bonuses(d)).toEqual({ con: 2, wis: 1, str: 1 });
		expect(givenLanguages(d)).toEqual(['Common', 'Ignan', 'Halfling']);
		expect(languageChoice(d)).toEqual({ count: 1, from: ['Elvish', 'Sylvan'] });
		expect(toolChoices(d).map(t => t.label)).toEqual(['Deep Cinderkin']);
		const fm = characterFm(d);
		expect(fm.languages).toEqual(['Common', 'Ignan', 'Halfling', 'Sylvan']);
		expect(fm.tools).toContain('Smith\'s Tools');
	});

	it('the SRD\'s species read as before (creation.json)', () => {
		const d = { ...newCharacter5e('2014', { name: 'E' }), species: 'Elf', subspecies: 'High Elf' };
		expect(speciesChoices(d).languages).toEqual(['Common', 'Elvish']);
		expect(speciesChoices(d).cantripChoices?.count).toBe(1);
		const h = { ...newCharacter5e('2014', { name: 'H' }), species: 'Dwarf', subspecies: 'Hill Dwarf' };
		expect(bonuses(h)).toEqual({ con: 2, wis: 1 });
	});
});

describe('how many options a feature gives is data', () => {
	const counts = (ed: Dnd5eEdition, cls: string, level: number, after = 0, sub = '') => optionGroups(classOf(ed, cls), sub, level, after).map(g => [g.group, g.count]);
	it('the SRD\'s Metamagic (choose: 2) and Eldritch Invocations (known: invocations_known)', () => {
		expect(classOf('2014', 'Sorcerer')!.features.find(f => f.name === 'Metamagic')?.choose).toBe(2);
		expect(counts('2014', 'Sorcerer', 3)).toContainEqual(['Metamagic', 2]);
		expect(counts('2014', 'Sorcerer', 17)).toContainEqual(['Metamagic', 4]);
		expect(counts('2014', 'Sorcerer', 10, 9)).toContainEqual(['Metamagic', 1]);
		expect(counts('2014', 'Warlock', 2)).toContainEqual(['Eldritch Invocation', 2]);
		expect(counts('2014', 'Warlock', 5, 4)).toContainEqual(['Eldritch Invocation', 1]);
		expect(counts('2014', 'Warlock', 18)).toContainEqual(['Eldritch Invocation', 8]);
	});
	it('a class of your own: choose, more from the table, or a column', () => {
		homebrew([{ kind: 'class', name: 'Hearth Warden', value: {
			hitDie: 10, saves: ['STR', 'WIS'],
			features: [
				{ level: 1, name: 'Warding Style', desc: 'Choose two.', choose: 2 },
				{ level: 1, name: 'Ember Guard', desc: 'x', group: 'Warding Style' },
				{ level: 1, name: 'Ash Step', desc: 'x', group: 'Warding Style' },
				{ level: 1, name: 'Kindle', desc: 'x', group: 'Warding Style' },
				{ level: 2, name: 'Hearth Songs', desc: 'Learn songs.', known: 'songs_known' },
				{ level: 2, name: 'Song of Rest', desc: 'x', group: 'Hearth Songs' },
				{ level: 2, name: 'Song of Ash', desc: 'x', group: 'Hearth Songs' },
				{ level: 2, name: 'Song of Iron', desc: 'x', group: 'Hearth Songs' },
			],
			levels: [
				{ level: 1, pb: 2, features: ['Warding Style'] },
				{ level: 2, pb: 2, features: ['Hearth Songs'], extra: { songs_known: 1 } },
				{ level: 3, pb: 2, features: [], extra: { songs_known: 1 } },
				{ level: 4, pb: 2, features: ['Warding Style'], extra: { songs_known: 2 } },
			],
		} }]);
		expect(counts('2024', 'Hearth Warden', 1)).toEqual([['Warding Style', 2]]);
		expect(counts('2024', 'Hearth Warden', 2, 1)).toEqual([['Hearth Songs', 1]]);
		expect(counts('2024', 'Hearth Warden', 4, 3)).toEqual([['Warding Style', 1], ['Hearth Songs', 1]]);
		expect(counts('2024', 'Hearth Warden', 4)).toEqual([['Warding Style', 3], ['Hearth Songs', 2]]);
	});
});

describe('AC without armor is data', () => {
	const sheet = (ed: Dnd5eEdition, cls: string, o: Record<string, unknown> = {}) => readSheet5e({ class: cls, level: 1, dex: 14, con: 16, wis: 16, cha: 16, ...o }, ed);
	it('the SRD\'s Barbarian and Monk, and a Draconic Sorcerer in each edition', () => {
		for (const ed of ['2024', '2014'] as const) {
			expect(sheet(ed, 'Barbarian').ac).toBe(15);
			expect(sheet(ed, 'Barbarian').acFrom).toBe('Unarmored Defense');
			expect(sheet(ed, 'Monk').ac).toBe(15);
			expect(sheet(ed, 'Monk', { inventory: [{ name: 'Shield', equipped: true }] }).acFrom).toBe('Unarmored + Shield');
		}
		expect(sheet('2014', 'Sorcerer', { subclass: 'Draconic', level: 1 }).ac).toBe(15);
		expect(sheet('2024', 'Sorcerer', { subclass: 'Draconic Sorcery', level: 3 }).ac).toBe(15);
		expect(sheet('2024', 'Sorcerer', { subclass: 'Draconic Sorcery', level: 2 }).ac).toBe(12);
	});
	it('a class of your own, and one written before `unarmored` (read from its words)', () => {
		homebrew([
			{ kind: 'class', name: 'Bark Warden', value: { hitDie: 8, saves: ['DEX', 'WIS'], features: [{ level: 1, name: 'Barkskin Hide', desc: 'Tough skin.', unarmored: { base: 12, add: ['WIS'], shield: false } }], levels: [] } },
			{ kind: 'class', name: 'Old Brawler', value: { hitDie: 10, saves: ['STR', 'CON'], features: [{ level: 1, name: 'Unarmored Defense', desc: 'While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier.' }], levels: [] } },
		]);
		expect(sheet('2024', 'Bark Warden').ac).toBe(17);
		expect(sheet('2024', 'Bark Warden').acFrom).toBe('Barkskin Hide');
		expect(sheet('2024', 'Old Brawler').ac).toBe(15);
	});
});

describe('a feat\'s increase and a subclass\'s spells are data', () => {
	it('a feat\'s `increase` is what Level up offers; an SRD feat still reads its words', () => {
		homebrew([{ kind: 'feat', name: 'Kindler', value: { type: 'general', desc: 'You light fires with a word.', increase: ['CON', 'Wisdom'] } }]);
		expect(featIncrease('2024', 'Kindler')).toEqual(['con', 'wis']);
		expect(featIncrease('2024', 'Grappler')).toEqual(['str', 'dex']);
	});
	it('always-prepared spells join the sheet when the subclass is chosen, and as levels bring more', () => {
		homebrew([{ kind: 'subclass', name: 'Hearth Domain', value: {
			class: 'Cleric', features: [{ level: 3, name: 'Warm Welcome', desc: 'x' }],
			spells: [{ level: 3, spells: ['Burning Hands', 'Sanctuary'] }, { level: 5, spells: ['Fireball'] }],
		} }]);
		const cls = classOf('2024', 'Cleric');
		expect(alwaysPrepared(cls, 'Hearth Domain', 4)).toEqual(['Burning Hands', 'Sanctuary']);
		const d = { ...newCharacter5e('2024', { name: 'Ama', level: 3 }), className: 'Cleric', subclass: 'Hearth Domain' };
		settle(d);
		const fm = characterFm(d);
		expect(fm.spells).toEqual(expect.arrayContaining(['Burning Hands', 'Sanctuary']));
		expect(fm.spells).not.toContain('Fireball');
		applyLevelUp5e(fm, newLevelUp5e(fm, '2024', 'Ama'));
		expect(fm.level).toBe(4);
		expect(fm.spells).not.toContain('Fireball');
		applyLevelUp5e(fm, newLevelUp5e(fm, '2024', 'Ama'));
		expect(fm.level).toBe(5);
		expect(fm.spells).toContain('Fireball');
	});
});

describe('your ```5e-spell blocks are in the wizards\' spell picks', () => {
	afterEach(() => setSpellLibrary5e(null));
	const spell = (name: string, level: number, classes: string[]): Spell5e => ({ name, level, classes, school: 'Evocation', castingTime: 'Action', range: '60 feet', components: 'V', duration: 'Instantaneous', desc: 'x' });
	it('a homebrew spell naming an SRD class is offered to it; one with the SRD\'s name replaces it', () => {
		setSpellLibrary5e(() => [spell('Ember Lash', 1, ['Wizard', 'Sorcerer']), spell('Ash Mote', 0, ['Wizard']), spell('Sleep', 1, ['Bard'])]);
		expect(classSpells('2024', 'Wizard', 1, false)).toContain('Ember Lash');
		expect(classSpells('2024', 'Wizard', 0, true)).toContain('Ash Mote');
		expect(classSpells('2024', 'Cleric', 1, false)).not.toContain('Ember Lash');
		// Sleep is now only the Bard's (the block replaces the SRD's, which the Wizard had).
		expect(classSpells('2024', 'Wizard', 1, false)).not.toContain('Sleep');
		expect(classSpells('2024', 'Bard', 1, false)).toContain('Sleep');
	});
	it('an imported or homebrew caster class gets its own spells, and a class borrowing a list gets both', () => {
		homebrew([
			{ kind: 'class', name: 'Hollowblade', value: { hitDie: 8, saves: ['DEX', 'INT'], spellcasting: 'INT', features: [], levels: [{ level: 1, pb: 2, features: [], slots: [2], cantrips: 2 }] } },
			{ kind: 'class', name: 'Hearth Warden', value: { hitDie: 10, saves: ['STR', 'WIS'], spellcasting: 'WIS', spellList: 'Ranger', features: [], levels: [{ level: 1, pb: 2, features: [], slots: [2] }] } },
		]);
		setSpellLibrary5e(() => [spell('Hollow Cut', 1, ['Hollowblade']), spell('Shade Whisper', 0, ['Hollowblade']), spell('Hearth Ward', 1, ['Hearth Warden'])]);
		expect(classSpells('2024', 'Hollowblade', 1, false)).toEqual(['Hollow Cut']);
		expect(classSpells('2024', 'Hollowblade', 0, true)).toEqual(['Shade Whisper']);
		const warden = classSpells('2024', 'Hearth Warden', 1, false);
		expect(warden).toContain('Hearth Ward');
		expect(warden).toContain('Hunter\'s Mark');
	});
});

describe('Level up can swap a spell known for another', () => {
	const sorcerer = (level: number, spells: string[]) => ({ class: 'Sorcerer', level, cha: 16, con: 14, hp: 20, hp_max: 20, spells });
	it('2014 Sorcerer: one known spell for another of a level it has slots for; the sheet keeps its place', () => {
		const fm: Record<string, unknown> = sorcerer(4, ['Fire Bolt', 'Light', 'Burning Hands', 'Shield', 'Magic Missile', 'Misty Step', 'Mirror Image']);
		const up = newLevelUp5e(fm, '2014', 'S');
		expect(canSwapSpell(up)).toBe(true);
		expect(swappable(up)).toEqual(['Burning Hands', 'Shield', 'Magic Missile', 'Misty Step', 'Mirror Image']);
		expect(swapChoices(up)).toContain('Fireball');
		expect(swapChoices(up)).not.toContain('Shield');
		up.swapOut = 'Burning Hands';
		up.swapIn = 'Fireball';
		applyLevelUp5e(fm, up);
		expect((fm.spells as string[]).slice(0, 4)).toEqual(['Fire Bolt', 'Light', 'Fireball', 'Shield']);
		expect(fm.spells).not.toContain('Burning Hands');
	});
	it('only where the class says so: 2024 Sorcerer yes, 2024 Cleric (a Long Rest) and Wizard (a spellbook) no, nor before it has spells', () => {
		expect(canSwapSpell(newLevelUp5e(sorcerer(4, ['Shield']), '2024', 'S'))).toBe(true);
		expect(canSwapSpell(newLevelUp5e({ class: 'Cleric', level: 4, wis: 16, spells: ['Bless'] }, '2024', 'C'))).toBe(false);
		expect(canSwapSpell(newLevelUp5e({ class: 'Wizard', level: 4, int: 16, spells: ['Shield'] }, '2024', 'W'))).toBe(false);
		expect(canSwapSpell(newLevelUp5e({ class: 'Ranger', level: 1, wis: 16, spells: [] }, '2014', 'R'))).toBe(false);
		expect(canSwapSpell(newLevelUp5e({ class: 'Ranger', level: 2, wis: 16, spells: ['Hunter\'s Mark'] }, '2014', 'R'))).toBe(true);
	});
	it('a swap that isn\'t allowed is left alone', () => {
		const fm: Record<string, unknown> = sorcerer(2, ['Fire Bolt', 'Shield', 'Magic Missile']);
		const up = newLevelUp5e(fm, '2014', 'S');
		up.swapOut = 'Fire Bolt';
		up.swapIn = 'Fireball';
		applyLevelUp5e(fm, up);
		expect(fm.spells).toEqual(['Fire Bolt', 'Shield', 'Magic Missile']);
	});
});
