import { describe, expect, it } from 'vitest';
import { checkBundle, BundleGames } from '../src/core/import/bundle';
import { linkImporter } from '../src/core/import/importer';
import { KINDS_5E } from '../src/systems/dnd5e/content';
import { writeEntry5e } from '../src/systems/dnd5e/import-write';
import { open5eBundle, open5eImporter, toolsBundle, toolsImporter, untag } from '../src/systems/dnd5e/import-5etools';
import { parseStatblock5e } from '../src/systems/dnd5e/parser';

const games: BundleGames = { resolve: (id) => (id === 'dnd5e' ? { id: 'dnd5e', kinds: KINDS_5E, editions: ['2024', '2014'] } : undefined) };
const clean = (b: ReturnType<typeof toolsBundle>['bundle']) => checkBundle(b, games).records.map(r => [r.name, r.errors]);

// Made up, in 5etools' homebrew shape.
const brew = {
	_meta: { sources: [{ json: 'MireBook', abbreviation: 'MB', full: 'The Mire Book', authors: ['A. Writer'] }] },
	monster: [{
		name: 'Bog Wisp', source: 'MireBook', size: ['T'], type: 'undead', alignment: ['C', 'E'],
		ac: [{ ac: 13, from: ['{@item natural armor|MireBook}'] }], hp: { average: 9, formula: '2d4 + 4' },
		speed: { walk: 0, fly: { number: 40, condition: '(hover)' } },
		str: 3, dex: 16, con: 14, int: 10, wis: 12, cha: 6,
		save: { dex: '+5' }, skill: { stealth: '+7', sleight_of_hand: '+5' }, senses: ['darkvision 60 ft.'], passive: 11,
		immune: ['poison'], conditionImmune: ['{@condition prone}'], languages: ['understands Common but can\'t speak'], cr: '1/2',
		trait: [{ name: 'Flicker', entries: ['It can\'t be seen in {@condition bright light|PHB}.'] }],
		action: [{ name: 'Chill Touch', entries: ['{@atk ms} {@hit 5} to hit, reach 5 ft. {@h}6 ({@damage 1d6 + 3}) cold damage. {@recharge 5}'] }],
		legendary: [{ name: 'Fade', entries: ['The wisp turns invisible.'] }],
	}, { name: 'Bog Wisp Elder', source: 'MireBook', _copy: { name: 'Bog Wisp', source: 'MireBook' } }],
	spell: [{
		name: 'Marsh Light', source: 'MireBook', level: 1, school: 'V', time: [{ number: 1, unit: 'action' }], range: { type: 'point', distance: { type: 'feet', amount: 60 } },
		components: { v: true, m: 'a firefly' }, duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 }, concentration: true }],
		entries: ['A light bobs in the air.', { type: 'list', items: ['It sheds {@b dim} light.', 'It can move 30 feet.'] }],
		entriesHigherLevel: [{ type: 'entries', name: 'Using a Higher-Level Spell Slot', entries: ['One more light per slot level above 1.'] }],
	}],
	item: [{ name: 'Lantern of the Drowned', source: 'MireBook', type: 'OTH', rarity: 'very rare', wondrous: true, reqAttune: true, entries: ['Its light shows the dead as they were.'] },
		{ name: 'Rope', source: 'MireBook', type: 'G', rarity: 'none' }],
};

describe('5etools homebrew', () => {
	it('its markup as our text', () => {
		expect(untag('{@atk mw} {@hit 5} to hit. {@h}7 ({@damage 1d8 + 3}) slashing. {@dc 13} {@condition prone|XPHB}')).toBe('Melee Weapon Attack: +5 to hit. Hit: 7 (1d8 + 3) slashing. DC 13 prone');
		expect(untag('{@atkr m,r} {@hit 4}')).toBe('Melee or Ranged Attack Roll: +4');
		expect(untag('{@creature goblin|MM|the goblins} {@recharge}')).toBe('the goblins (Recharge 6)');
	});

	it('a monster, a spell and a magic item, as 5e content the engine accepts; copies and mundane gear said', () => {
		expect(toolsImporter.detect({ files: [], text: JSON.stringify(brew) })).toBe(0.85);
		const { bundle, notes } = toolsBundle(brew);
		expect(bundle.source).toEqual({ name: 'The Mire Book', license: 'By A. Writer' });
		const [wisp, spell, lantern] = bundle.content!;
		expect(wisp).toMatchObject({
			kind: 'monster', name: 'Bog Wisp', size: 'Tiny', type: 'undead', alignment: 'chaotic evil', ac: 13, acNote: 'natural armor', hp: 9, hpFormula: '2d4 + 4',
			speed: '0 ft., fly 40 ft. (hover)', abilities: [3, 16, 14, 10, 12, 6], saves: { dex: 5 }, skills: { Stealth: 7, 'Sleight Of Hand': 5 },
			immunities: ['Poison'], conditionImmunities: ['Prone'], senses: 'darkvision 60 ft., passive Perception 11', cr: '1/2',
			traits: [{ name: 'Flicker', desc: 'It can\'t be seen in bright light.' }],
			actions: [{ name: 'Chill Touch', desc: 'Melee Spell Attack: +5 to hit, reach 5 ft. Hit: 6 (1d6 + 3) cold damage. (Recharge 5–6)' }],
			legendaryActions: [{ name: 'Fade', desc: 'The wisp turns invisible.' }],
			importedFrom: { name: 'The Mire Book', id: '5etools:monster:mirebook:bog wisp' },
		});
		expect(spell).toMatchObject({ kind: 'spell', level: 1, school: 'Evocation', castingTime: 'Action', range: '60 feet', components: 'V, M (a firefly)', duration: 'Concentration, up to 1 minute', concentration: true, desc: 'A light bobs in the air.\n\n- It sheds **dim** light.\n- It can move 30 feet.', higherLevel: 'One more light per slot level above 1.' });
		expect(lantern).toMatchObject({ kind: 'item', rarity: 'Very Rare', type: 'Wondrous item', attunement: true });
		expect(notes.join(' ')).toMatch(/1 entry is a copy of another book's entry/);
		expect(notes.join(' ')).toMatch(/1 entry was left out: no name, or not a magic item/);
		expect(clean(bundle)).toEqual([['Bog Wisp', []], ['Marsh Light', []], ['Lantern of the Drowned', []]]);
		// The monster writes as a ```5e block that reads back.
		const r = checkBundle(bundle, games).records[0];
		const out = writeEntry5e('monster', r.value!, '2024')!;
		expect(parseStatblock5e(out.body)?.name).toBe('Bog Wisp');
	});
});

// Made up, in Open5e's v2 creature shape.
const creature = {
	key: 'mirebook_bog-wisp', name: 'Bog Wisp',
	document: { name: 'The Mire Book', key: 'mirebook', publisher: { name: 'Small Press' } },
	type: { name: 'Undead', key: 'undead' }, size: { name: 'Tiny', key: 'tiny' }, challenge_rating: 0.5, alignment: 'chaotic evil',
	speed: { walk: 0, fly: 40, hover: true, unit: 'feet' }, languages: { as_string: 'understands Common' },
	armor_class: 13, armor_detail: 'natural armor', hit_points: 9, hit_dice: '2d4 + 4', experience_points: 100, initiative_bonus: 3,
	ability_scores: { strength: 3, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 12, charisma: 6 },
	saving_throws: { dexterity: 5 }, skill_bonuses: { stealth: 7 }, passive_perception: 11, darkvision_range: 60,
	resistances_and_immunities: { damage_immunities: [{ name: 'Poison', key: 'poison' }], condition_immunities_display: 'prone' },
	traits: [{ name: 'Flicker', desc: 'It can\'t be seen in bright light.' }],
	actions: [
		{ name: 'Fade', desc: 'The wisp turns invisible.', action_type: 'LEGENDARY_ACTION', order_in_statblock: 0 },
		{ name: 'Chill Touch', desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Cold damage.', action_type: 'ACTION', order_in_statblock: 1, usage_limits: { type: 'RECHARGE_ON_ROLL', param: 5 } },
		{ name: 'Glow', desc: 'Bright light in 10 feet.', action_type: 'BONUS_ACTION', order_in_statblock: 2, usage_limits: { type: 'PER_DAY', param: 3 } },
	],
};

describe('Open5e', () => {
	it('a creature, by file or a page of results, as 5e content the engine accepts', () => {
		expect(open5eImporter.detect({ files: [], text: JSON.stringify(creature) })).toBe(0.9);
		expect(open5eImporter.detect({ files: [], text: JSON.stringify({ count: 1, next: null, results: [creature] }) })).toBe(0.9);
		const { bundle, notes } = open5eBundle({ count: 30, next: 'https://api.open5e.com/v2/creatures/?page=2', results: [creature] });
		expect(notes).toEqual(['This is one page of results. Open5e has more after it.']);
		expect(bundle.source?.license).toBe('The Mire Book (Small Press)');
		expect(bundle.content![0]).toMatchObject({
			name: 'Bog Wisp', size: 'Tiny', type: 'undead', cr: '1/2', speed: '0 ft., fly 40 ft. (hover)'.replace('0 ft., ', ''), saves: { dex: 5 }, skills: { Stealth: 7 },
			immunities: ['Poison'], conditionImmunities: ['Prone'], senses: 'Darkvision 60 ft., Passive Perception 11', xp: 100, initiative: 3,
			actions: [{ name: 'Chill Touch (Recharge 5–6)', desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Cold damage.' }],
			bonusActions: [{ name: 'Glow (3/Day)', desc: 'Bright light in 10 feet.' }],
			legendaryActions: [{ name: 'Fade', desc: 'The wisp turns invisible.' }],
			source: 'The Mire Book',
			importedFrom: { name: 'Open5e', id: 'open5e:mirebook_bog-wisp', url: 'https://open5e.com/monsters/mirebook_bog-wisp' },
		});
		expect(clean(bundle)).toEqual([['Bog Wisp', []]]);
	});
	it('its links', () => {
		expect(linkImporter('https://api.open5e.com/v2/creatures/srd-2024_aboleth/', [open5eImporter])?.dataUrl).toBe('https://api.open5e.com/v2/creatures/srd-2024_aboleth/?format=json');
		expect(linkImporter('https://open5e.com/monsters/srd-2024_aboleth', [open5eImporter])?.dataUrl).toBe('https://api.open5e.com/v2/creatures/srd-2024_aboleth/?format=json');
	});
});
