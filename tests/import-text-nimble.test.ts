import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { checkBundle } from '../src/core/import/bundle';
import { KINDS_NIMBLE } from '../src/systems/nimble/content';
import { readNimbleText, splitNimbleText, textNimbleImporter } from '../src/systems/nimble/import-text';
import { writeEntryNimble } from '../src/systems/nimble/import-write';
import { parseStatblock } from '../src/systems/nimble/parser';

const games = { resolve: () => ({ id: 'nimble', kinds: KINDS_NIMBLE }) };
const ctx = { plugin: null, sourcePath: '' };

// Made up, laid out as the Nimble books print a stat block (the PDF's icons come through as [hp], [ar], [mv]…).
const hag = `Mire Hag
lvl 3, Medium Fey
[hp]30 [ar]M [mv]6 [swm]8 [sv]WIL+
Bog-born. Ignores difficult terrain in water and
mud.
Actions: Choose one.
• Claw. Reach 1. 1d8+2.
• Hex. Range 8. The target is Dazed until the
hag's next turn.
Bloodied: She sinks into the mud and gains [ar]H until her next turn.`;

const king = `The Drowned King
Lvl 6 Legendary Large Undead
[hp]40/hero [ar]H [mv]6 [sv]ALL++
ACTIONS: After each hero's turn, choose one:
• Tide. 2d10 to everything within Reach 3.
Last Stand: He regains 20 HP per hero and acts twice.`;

describe('a Nimble stat block pasted as text', () => {
	it('the header, the stat tokens, a passive, actions with their intro, Bloodied; wrapped lines joined', () => {
		const r = readNimbleText(hag)!;
		expect(r.entry).toEqual({
			kind: 'monster', name: 'Mire Hag', role: 'regular', level: '3', size: 'Medium', type: 'Fey',
			hp: 30, armor: 'medium', speed: 6, swim: 8, saves: 'WIL+',
			traits: [{ name: 'Bog-born', text: 'Ignores difficult terrain in water and mud.' }],
			actionsIntro: 'Choose one.',
			actions: [{ name: 'Claw', text: 'Reach 1. 1d8+2.' }, { name: 'Hex', text: 'Range 8. The target is Dazed until the hag\'s next turn.' }],
			bloodied: 'She sinks into the mud and gains [ar]H until her next turn.',
		});
	});

	it('a legendary one: HP per hero, Last Stand', () => {
		expect(readNimbleText(king)!.entry).toMatchObject({ name: 'The Drowned King', role: 'legendary', level: '6', size: 'Large', type: 'Undead', hpPerHero: 40, armor: 'heavy', saves: 'ALL++', lastStand: 'He regains 20 HP per hero and acts twice.' });
	});

	it('several at once come apart; the engine takes them; they write as ```nimble blocks that read back', async () => {
		expect(splitNimbleText(`${hag}\n\n${king}`).map(s => s.trim().split('\n')[0])).toEqual(['Mire Hag', 'The Drowned King']);
		expect(textNimbleImporter.detect({ files: [], text: hag })).toBe(0.55);
		const read = await textNimbleImporter.read({ files: [], text: `${hag}\n\n${king}` }, ctx);
		if (!('bundle' in read)) throw new Error('no bundle');
		const c = checkBundle(read.bundle, games);
		expect(c.records.map(r => [r.name, r.errors])).toEqual([['Mire Hag', []], ['The Drowned King', []]]);
		const block = writeEntryNimble('monster', c.records[0].value!)!.body;
		expect(parseStatblock(block)).toMatchObject({ name: 'Mire Hag', level: '3', hp: 30, armor: 'medium' });
	});

	it('our own ```nimble block, from the sample vault, reads back the same', async () => {
		const note = readFileSync('sample-vault/Campaigns/The Old Quarter/Monsters/Mercury Ooze.md', 'utf8');
		const fenced = /```nimble\n[\s\S]*?\n```/.exec(note)![0];
		expect(textNimbleImporter.detect({ files: [], text: fenced })).toBe(0.9);
		expect(textNimbleImporter.detect({ files: [], text: '```5e\nname: X\nac: 12\nhp: 9\n```' })).toBe(0);
		const read = await textNimbleImporter.read({ files: [], text: fenced }, ctx);
		if (!('bundle' in read)) throw new Error('no bundle');
		const c = checkBundle(read.bundle, games);
		expect(c.records[0].errors).toEqual([]);
		const body = fenced.replace(/^```nimble\n|\n```$/g, '');
		expect(parseStatblock(writeEntryNimble('monster', c.records[0].value!)!.body)?.name).toBe(parseStatblock(body)?.name);
	});

	it('plain notes aren\'t a stat block', () => {
		expect(textNimbleImporter.detect({ files: [], text: 'Level 3 of the dungeon has a hag.' })).toBe(0);
	});
});
