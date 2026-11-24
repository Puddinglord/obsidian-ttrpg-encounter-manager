import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { checkBundle, BundleGames } from '../src/core/import/bundle';
import { linkImporter } from '../src/core/import/importer';
import { KINDS_NIMBLE } from '../src/systems/nimble/content';
import { writeEntryNimble } from '../src/systems/nimble/import-write';
import { nexusBundle, nexusImporter, nimbrewBundle, nimbrewImporter, savesText } from '../src/systems/nimble/import-nexus';

const games: BundleGames = { resolve: (id) => (id === 'nimble' ? { id: 'nimble', kinds: KINDS_NIMBLE } : undefined) };
// Made up in Nexus's shape (its public API's JSON:API answer for a collection, with what it holds included).
const text = readFileSync('tests/fixtures/nexus-collection.json', 'utf8');
const input = { files: [], text };

describe('Nimble Nexus', () => {
	it('knows its answers, and not a bundle or Nimbrew', () => {
		expect(nexusImporter.detect(input)).toBe(0.95);
		expect(nexusImporter.detect({ files: [], text: '{"format":"ember-vault-bundle","version":1}' })).toBe(0);
		expect(nimbrewImporter.detect(input)).toBe(0);
	});

	it('a collection: its monsters and items, as Nimble content the engine accepts', () => {
		const { bundle, notes } = nexusBundle(JSON.parse(text));
		expect(notes).toEqual([]);
		expect(bundle.source?.license).toMatch(/3rd Party Creator License/);
		const [hag, wisp, king, lantern] = bundle.content!;
		expect(hag).toEqual({
			kind: 'monster', name: 'Mire Hag', role: 'regular', level: '3', size: 'Medium', type: 'Fey', armor: 'medium', hp: 30, speed: 6, swim: 8,
			saves: 'STR- WIL+',
			traits: [{ name: 'Bog-born', text: 'Ignores difficult terrain in water.' }],
			actions: [{ name: 'Claw', text: '(Reach 2) 1d8+2 slashing.' }, { name: 'Hex', text: '(Range 8) The target is Dazed until the hag\'s next turn.' }],
			actionsIntro: 'Choose one.',
			flavor: 'She keeps a [Bog Wisp](https://nimble.nexus/monsters/7q1demo0bogwisp000000000000) as a lamp.',
			source: { name: 'Nimble Nexus', id: 'nexus:monster:7q1demo0mirehag000000000000', url: 'https://nimble.nexus/monsters/7q1demo0mirehag000000000000' },
		});
		// A minion with one unnamed attack takes its name from the line over it.
		expect(wisp).toMatchObject({ role: 'minion', fly: 8, actions: [{ name: 'Chill', text: '1d4' }] });
		expect(wisp.hp).toBeUndefined();
		expect(king).toMatchObject({ role: 'legendary', hpPerHero: 40, armor: 'heavy', saves: 'ALL++', bloodied: 'The water rises: difficult terrain everywhere.', lastStand: 'He has 20 HP per hero and acts twice.' });
		expect(lantern).toMatchObject({ kind: 'item', category: 'magic', subcategory: 'Wondrous Lantern', rarity: 'very rare', text: 'Its light shows the dead as they were.\n\n**For the GM:** The King wants it back.' });
		const checked = checkBundle(bundle, games);
		expect(checked.records.map(r => [r.name, r.errors])).toEqual([['Mire Hag', []], ['Bog Wisp', []], ['The Drowned King', []], ['Lantern of the Drowned', []]]);
		// And it writes as a ```nimble block the bestiary reads.
		const out = writeEntryNimble('monster', checked.records[0].value!);
		expect(out?.body).toMatch(/^name: Mire Hag\n/);
		expect(out?.body).toMatch(/Claw/);
	});

	it('a collection fetched without what it holds says to paste its link', () => {
		const j = JSON.parse(text);
		delete j.included;
		const { bundle, notes } = nexusBundle(j);
		expect(bundle.content).toEqual([]);
		expect(notes[0]).toMatch(/lists 4 entries, but they weren't in this file\. Paste the collection's link/);
	});

	it('a page\'s link becomes its API address', () => {
		const importers = [nexusImporter];
		expect(linkImporter('https://nimble.nexus/monsters/asuvius-the-magmin-uraniac-7aft60azdm858rdd35qg4bj7kd', importers)?.dataUrl).toBe('https://nimble.nexus/api/monsters/7aft60azdm858rdd35qg4bj7kd');
		expect(linkImporter('https://nimble.nexus/monsters/7aft60azdm858rdd35qg4bj7kd', importers)?.dataUrl).toBe('https://nimble.nexus/api/monsters/7aft60azdm858rdd35qg4bj7kd');
		expect(linkImporter('https://nimble.nexus/collections/marsh-folk-27w2vdztyx9gctpgjkkvgth4qs?tab=monsters', importers)?.dataUrl).toBe('https://nimble.nexus/api/collections/27w2vdztyx9gctpgjkkvgth4qs?include=monsters,items');
		expect(linkImporter('https://nimble.nexus/items/0j894yzp0b992a2tzf79h1yx9v', importers)?.dataUrl).toBe('https://nimble.nexus/api/items/0j894yzp0b992a2tzf79h1yx9v');
		expect(linkImporter('https://nimble.nexus/about', importers)).toBeNull();
	});

	it('saves read the way stat blocks write them', () => {
		expect(savesText({ all: 2 })).toBe('ALL++');
		expect(savesText({ dex: -1, str: 1, int: 0 })).toBe('STR+ DEX-');
		expect(savesText({})).toBeUndefined();
	});
});

describe('Nimbrew', () => {
	const j = {
		name: 'Bog Wisp', CR: 'Level 1/2 Minion Tiny Spirit', armor: '', hp: '', saves: '', speed: 'fly 8',
		passives: [{ type: 'single', name: 'Flicker', desc: 'Can\'t be seen in bright light.' }],
		actions: [{ type: 'multi', name: 'Choose one.', desc: '', actions: [{ type: 'single', name: 'Chill', desc: '1d4 cold.' }, { type: 'single', name: 'Lure.', desc: 'Range 6. The target moves 2 toward it.' }] }],
		theme: { BGColor: '#f2ebda' }, bloodied: '', laststand: '',
	};
	it('knows its shape and reads level, role, size and type from its CR line', () => {
		expect(nimbrewImporter.detect({ files: [], text: JSON.stringify(j) })).toBe(0.9);
		const m = nimbrewBundle(j).bundle.content![0];
		expect(m).toEqual({
			kind: 'monster', name: 'Bog Wisp', role: 'minion', level: '1/2', size: 'Tiny', type: 'Spirit', movement: 'fly 8',
			traits: [{ name: 'Flicker', text: 'Can\'t be seen in bright light.' }],
			actions: [{ name: 'Chill', text: '1d4 cold.' }, { name: 'Lure', text: 'Range 6. The target moves 2 toward it.' }],
			actionsIntro: 'Choose one.',
		});
		expect(checkBundle(nimbrewBundle(j).bundle, games).records[0].errors).toEqual([]);
	});
	it('Solo is legendary', () => {
		expect(nimbrewBundle({ ...j, CR: 'Level 1 Solo Small Elemental', hp: '50' }).bundle.content![0]).toMatchObject({ role: 'legendary', level: '1', size: 'Small', type: 'Elemental', hp: 50 });
	});
});
