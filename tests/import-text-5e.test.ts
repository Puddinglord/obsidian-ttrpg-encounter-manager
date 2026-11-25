import { describe, expect, it } from 'vitest';
import { checkBundle } from '../src/core/import/bundle';
import { KINDS_5E } from '../src/systems/dnd5e/content';
import { read5eText, split5eText, text5eImporter } from '../src/systems/dnd5e/import-text';
import { writeEntry5e } from '../src/systems/dnd5e/import-write';
import { parseStatblock5e } from '../src/systems/dnd5e/parser';

const games = { resolve: () => ({ id: 'dnd5e', kinds: KINDS_5E }) };

// From the SRD 5.1 (CC-BY-4.0), as a PDF copies it: lines wrapped where the column ended.
const goblin2014 = `Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (−1) 14 (+2) 10 (+0) 10 (+0) 8 (−1) 8 (−1)
Skills Stealth +6
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or
Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one
target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320
ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

// From the SRD 5.2 (CC-BY-4.0), as its layout copies.
const goblin2024 = `Goblin Warrior
Small Fey (Goblinoid), Chaotic Neutral
AC 15 Initiative +2 (12)
HP 10 (3d6)
Speed 30 ft.
MOD SAVE MOD SAVE MOD SAVE
Str 8 −1 −1 Dex 15 +2 +2 Con 10 +0 +0
Int 10 +0 +0 Wis 8 −1 −1 Cha 8 −1 −1
Skills Stealth +6
Senses Darkvision 60 ft.; Passive Perception 9
Languages Common, Goblin
CR 1/4 (XP 50; PB +2)
Actions
Scimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.
Bonus Actions
Nimble Escape. The goblin takes the Disengage or Hide action.`;

describe('a 5e stat block pasted as text', () => {
	it('2014: the table, the long labels, a trait before Actions, wrapped lines joined', () => {
		const r = read5eText(goblin2014)!;
		expect(r.notes).toEqual([]);
		expect(r.entry).toEqual({
			kind: 'monster', name: 'Goblin', size: 'Small', type: 'humanoid (goblinoid)', alignment: 'neutral evil',
			ac: 15, acNote: 'leather armor, shield', hp: 7, hpFormula: '2d6', speed: '30 ft.', abilities: [8, 14, 10, 10, 8, 8],
			skills: { Stealth: 6 }, senses: 'darkvision 60 ft., passive Perception 9', languages: 'Common, Goblin', cr: '1/4', xp: 50,
			traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' }],
			actions: [
				{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
				{ name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
			],
		});
	});

	it('2024: AC with Initiative, the Str/Dex rows, CR with XP, Bonus Actions', () => {
		const r = read5eText(goblin2024)!;
		expect(r.notes).toEqual([]);
		expect(r.entry).toMatchObject({ name: 'Goblin Warrior', size: 'Small', type: 'Fey (Goblinoid)', alignment: 'Chaotic Neutral', ac: 15, initiative: 2, hp: 10, hpFormula: '3d6', abilities: [8, 15, 10, 10, 8, 8], cr: '1/4', xp: 50 });
		expect(r.entry.saves).toBeUndefined();
		expect(r.entry.bonusActions).toEqual([{ name: 'Nimble Escape', desc: 'The goblin takes the Disengage or Hide action.' }]);
	});

	it('the engine takes it, and it writes as a ```5e block that reads back', async () => {
		expect(text5eImporter.detect({ files: [], text: goblin2014 })).toBe(0.55);
		const read = await text5eImporter.read({ files: [], text: `${goblin2014}\n\n${goblin2024}` }, { plugin: null, sourcePath: '' });
		if (!('bundle' in read)) throw new Error('no bundle');
		const c = checkBundle(read.bundle, games);
		expect(c.records.map(r => [r.name, r.errors])).toEqual([['Goblin', []], ['Goblin Warrior', []]]);
		const out = writeEntry5e('monster', c.records[0].value!, '2014')!;
		expect(parseStatblock5e(out.body)).toMatchObject({ name: 'Goblin', ac: 15, hp: 7, cr: '1/4' });
	});

	it('several pasted together come apart at each name', () => {
		expect(split5eText(`${goblin2014}\n\n${goblin2024}`).map(s => s.trim().split('\n')[0])).toEqual(['Goblin', 'Goblin Warrior']);
	});

	it('our own ```5e block text reads too', async () => {
		const block = '```5e\nname: Bog Wisp\nac: 13\nhp: 9\ncr: 1/2\n```';
		expect(text5eImporter.detect({ files: [], text: block })).toBe(0.9);
		expect(text5eImporter.detect({ files: [], text: block.replace(/```5e\n|\n```/g, '') })).toBe(0.7);
		expect(text5eImporter.detect({ files: [], text: '```nimble\nname: X\nlevel: 1\nhp: 9\n```' })).toBe(0);
		const read = await text5eImporter.read({ files: [], text: block }, { plugin: null, sourcePath: '' });
		expect('bundle' in read && read.bundle.content?.[0]).toMatchObject({ name: 'Bog Wisp', statblock: 'name: Bog Wisp\nac: 13\nhp: 9\ncr: 1/2' });
	});

	it('plain notes aren\'t a stat block', () => {
		expect(text5eImporter.detect({ files: [], text: 'The goblins attack at dawn. Bring rope.' })).toBe(0);
	});
});
