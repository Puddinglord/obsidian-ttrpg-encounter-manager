import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { bundleSchema, bundleSummary, checkBundle, emptyBundle, safeAssetName, BundleGames } from '../src/core/import/bundle';
import { detectImporters, Importer, linkImporter } from '../src/core/import/importer';
import { planRecords, stableText, Have } from '../src/core/import/plan';
import { checkEntry, packSchema } from '../src/core/content/spec';
import { KINDS_5E } from '../src/systems/dnd5e/content';
import { dnd5eSystem } from '../src/systems/dnd5e/system';
import { KINDS_NIMBLE } from '../src/systems/nimble/content';
import { fantasyStatblocksImporter } from '../src/systems/dnd5e/importers';
import { writeEntry5e } from '../src/systems/dnd5e/import-write';
import { writeEntryNimble } from '../src/systems/nimble/import-write';
import { bundleImporter, packImporter } from '../src/core/import/core-importers';

const games: BundleGames = {
	resolve: (id) => {
		const k = id.trim().toLowerCase();
		if (k === 'nimble') return { id: 'nimble', kinds: KINDS_NIMBLE };
		if (k === '5e' || k === 'dnd5e') return { id: 'dnd5e', aliases: dnd5eSystem.aliases, kinds: KINDS_5E, editions: ['2024', '2014'] };
		return undefined;
	},
};

const WISP = 'name: Bog Wisp\nsize: Tiny\ntype: undead\nac: 13\nhp: 9 (2d4 + 4)\nspeed: 0 ft., fly 40 ft. (hover)\nabilities: 3, 16, 14, 10, 12, 6\ncr: 1/2\nactions:\n- Chill Touch: Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Cold damage.';

describe('checking a bundle', () => {
	it('says plainly when it isn\'t one, or names a game we don\'t have', () => {
		expect(checkBundle('nope', games).error).toMatch(/JSON object/);
		expect(checkBundle({ format: 'something-else' }, games).error).toMatch(/"format" should be "ember-vault-bundle"/);
		expect(checkBundle(emptyBundle({ system: 'Call of Cthulhu' }), games).error).toMatch(/doesn't know the game "Call of Cthulhu"/);
	});

	it('reads content against the game\'s kinds, by any of its names, with where it came from', () => {
		const b = checkBundle(emptyBundle({
			system: '5e', edition: '2014', source: { name: 'My Tool', license: 'CC-BY-4.0' },
			content: [
				{ kind: 'monster', name: 'Bog Wisp', statblock: WISP, source: { id: 'tool:wisp', url: 'https://example.com/wisp' } },
				{ kind: 'Monster', name: 'Stone Toad', ac: 14, hp: 22, abilities: [14, 8, 16, 2, 10, 4], cr: '1', source: 'Swamp Book' },
				{ kind: 'starship', name: 'Nostromo' },
				{ kind: 'spell', name: 'Half a Spell' },
			],
		}), games);
		expect(b.system).toBe('dnd5e');
		expect(b.edition).toBe('2014');
		expect(b.source).toEqual({ name: 'My Tool', license: 'CC-BY-4.0' });
		const [wisp, toad, ship, spell] = b.records;
		expect(wisp.value?.statblock).toBe(WISP);
		expect(wisp.source).toEqual({ id: 'tool:wisp', url: 'https://example.com/wisp' });
		// Text "source" is the monster's own field (its book), not where it came from.
		expect(toad.value?.source).toBe('Swamp Book');
		expect(toad.source).toBeUndefined();
		expect(ship.errors[0]).toMatch(/has no "starship" kind/);
		expect(spell.value).toBeUndefined();
		expect(spell.errors.length).toBeGreaterThan(0);
		expect(bundleSummary(b.records)).toBe('2 monsters');
		expect(bundleSummary([{ type: 'note', kind: 'npc', name: 'A', at: '', value: {}, errors: [], warnings: [] }, { type: 'map', kind: 'map', name: 'B', at: '', value: {}, errors: [], warnings: [] }])).toBe('an NPC and a map');
	});

	it('needs a game for content, and says which parts it doesn\'t read yet', () => {
		const b = checkBundle({ ...emptyBundle(), content: [{ kind: 'monster', name: 'X' }], campaign: { chapters: [] }, extra: 1, version: 9 }, games);
		expect(b.records[0].errors[0]).toMatch(/no "system"/);
		expect(b.warnings.join(' ')).toMatch(/version 9 bundle/);
		expect(b.warnings.join(' ')).toMatch(/"campaign" part/);
		expect(b.warnings.join(' ')).toMatch(/"extra" isn't part of a bundle/);
	});

	it('checks notes: kind, name, a card of text, a body', () => {
		const b = checkBundle(emptyBundle({ notes: [
			{ kind: 'npc', name: 'Irinia', fields: { role: 'Cleric', level: 1 }, card: { wants: 'A quiet siege', voice: 'Low' }, body: 'Clever and wise.' },
			{ kind: 'villain', name: 'Morg' },
			{ kind: 'npc', name: '' },
		] as never }), games);
		const [ok, kind, name] = b.records;
		expect(ok.value).toEqual({ kind: 'npc', name: 'Irinia', fields: { role: 'Cleric', level: 1 }, card: { wants: 'A quiet siege', voice: 'Low' }, body: 'Clever and wise.' });
		expect(kind.errors[0]).toMatch(/should be one of: npc, location, quest, note/);
		expect(name.errors[0]).toMatch(/"name" is missing/);
	});

	it('checks maps: pins on the picture, a bad pin left out, a missing picture said', () => {
		const b = checkBundle(emptyBundle({
			maps: [{ name: 'Crypt', image: { file: 'crypt.png' }, grid: '30 x 20', pins: [
				{ x: 41.5, y: 22, label: '1', text: 'A cracked altar' },
				{ x: 120, y: -4, label: '2' },
				{ x: 'left', y: 4, label: '3' } as never,
			] }],
		}), games);
		const m = b.records[0];
		expect(m.value?.grid).toBe('30x20');
		expect(m.value?.pins).toEqual([{ x: 41.5, y: 22, label: '1', text: 'A cracked altar' }, { x: 100, y: 0, label: '2' }]);
		expect(m.warnings.join(' ')).toMatch(/crypt\.png, isn't in the bundle/);
		expect(m.warnings.join(' ')).toMatch(/pin 2 \(2\) is off the map/);
		expect(m.warnings.join(' ')).toMatch(/pin 3 needs "x", "y"/);
	});

	it('keeps file names inside the vault: no folders, no "..", nothing a path can\'t hold', () => {
		expect(safeAssetName('../../.obsidian/plugins/evil.js')).toBe('evil.js');
		expect(safeAssetName('C:\\maps\\crypt.png')).toBe('crypt.png');
		expect(safeAssetName('..')).toBeNull();
		expect(safeAssetName('.hidden')).toBe('hidden');
		const b = checkBundle(emptyBundle({ files: [{ name: '../secret/crypt.png', data: 'AAAA' }, { name: '', data: 'AAAA' }, { name: 'empty.png' }] }), games);
		expect(b.files.map(f => f.name)).toEqual(['crypt.png']);
		expect(b.warnings).toHaveLength(2);
	});

	it('keeps hostile text as text: a script in a name stays a string', () => {
		const b = checkBundle(emptyBundle({ notes: [{ kind: 'npc', name: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>' }] }), games);
		expect(b.records[0].value?.name).toBe('<img src=x onerror=alert(1)>');
		expect(typeof b.records[0].value?.body).toBe('string');
	});
});

describe('where an imported entry came from, on every kind', () => {
	it('a Nimble kind keeps imported and importId without a warning', () => {
		const rule = KINDS_NIMBLE.find(k => k.kind === 'rule')!;
		const c = checkEntry(rule, { name: 'Flanking', text: 'Advantage.', imported: 'Nimble Nexus', importId: 'nexus:rule:7' });
		expect(c.warnings).toEqual([]);
		expect(c.value).toMatchObject({ imported: 'Nimble Nexus', importId: 'nexus:rule:7' });
		expect(checkEntry(rule, { name: 'X', text: 'Y', importId: { id: 1 } }).warnings[0]).toMatch(/"importId" should be text/);
	});
});

describe('planning an import', () => {
	const records = checkBundle(emptyBundle({
		system: '5e',
		content: [
			{ kind: 'monster', name: 'Bog Wisp', statblock: WISP, source: { id: 'tool:wisp' } },
			{ kind: 'monster', name: 'Stone Toad', statblock: WISP.replace('Bog Wisp', 'Stone Toad') },
			{ kind: 'monster', name: 'Goblin Boss', statblock: WISP.replace('Bog Wisp', 'Goblin Boss') },
			{ kind: 'monster', name: 'Marsh Hag', statblock: WISP.replace('Bog Wisp', 'Marsh Hag') },
			{ kind: 'monster', name: 'Marsh Hag', statblock: WISP.replace('Bog Wisp', 'Marsh Hag') },
		],
		notes: [{ kind: 'npc', name: 'Irinia' }],
	}), games).records;

	it('new, an update to an earlier import (by id), unchanged, yours, and the same thing twice', () => {
		const have: Have[] = [
			{ type: 'content', kind: 'monster', name: 'Old Wisp Name', importId: 'tool:wisp', imported: true, file: 'M/Wisp.md', value: { name: 'Bog Wisp', statblock: 'older' } },
			{ type: 'content', kind: 'monster', name: 'Stone Toad', imported: true, file: 'M/Toad.md', value: { ...records[1].value!, imported: 'Elsewhere' } },
			{ type: 'content', kind: 'monster', name: 'goblin boss', imported: false, file: 'M/Goblin Boss.md' },
			{ type: 'note', kind: 'npc', name: 'Irinia', imported: true, file: 'NPCs/Irinia.md' },
		];
		const plan = planRecords(records, have);
		expect(plan.map(p => [p.record.name, p.status, p.on])).toEqual([
			['Bog Wisp', 'update', true],
			['Stone Toad', 'same', false],
			['Goblin Boss', 'yours', false],
			['Marsh Hag', 'new', true],
			['Marsh Hag', 'unusable', false],
			// An NPC imported before is left as it is: it may have been written in since.
			['Irinia', 'same', false],
		]);
		expect(plan[0].file).toBe('M/Wisp.md');
	});

	it('compares values without their import fields or key order', () => {
		expect(stableText({ b: 1, a: [{ y: 2, x: 1 }], imported: 'X' })).toBe(stableText({ a: [{ x: 1, y: 2 }], b: 1, importId: 'z' }));
	});
});

describe('finding the importer', () => {
	const mk = (id: string, score: number): Importer => ({ id, label: id, detect: () => score, read: () => ({ error: '' }) });
	it('surest first; ties keep the order given; a throwing detector counts as no', () => {
		const boom: Importer = { id: 'boom', label: 'boom', detect: () => { throw new Error('x'); }, read: () => ({ error: '' }) };
		const found = detectImporters({ files: [] }, [mk('a', 0.5), boom, mk('b', 0.9), mk('c', 0.5), mk('d', 0)]);
		expect(found.map(f => f.importer.id)).toEqual(['b', 'a', 'c']);
	});
	it('fetches only https links an importer says it reads', () => {
		const nexus: Importer = { ...mk('nexus', 0), links: [{ match: /^https:\/\/nimble\.nexus\/monsters\/(\w+)/, dataUrl: (u) => `${u}.json` }] };
		expect(linkImporter('https://nimble.nexus/monsters/abc', [nexus])).toEqual({ importer: nexus, dataUrl: 'https://nimble.nexus/monsters/abc.json' });
		expect(linkImporter('http://nimble.nexus/monsters/abc', [nexus])).toBeNull();
		expect(linkImporter('https://example.com/x', [nexus])).toBeNull();
	});
	it('a bundle is a bundle; a pack is a pack; neither is the other', () => {
		const bundle = { files: [], text: JSON.stringify(emptyBundle({ system: 'nimble' })) };
		const pack = { files: [], text: JSON.stringify({ pack: 'Mine', system: 'nimble', entries: [] }) };
		expect([bundleImporter.detect(bundle), packImporter.detect(bundle)]).toEqual([1, 0]);
		expect([bundleImporter.detect(pack), packImporter.detect(pack)]).toEqual([0, 0.95]);
	});
});

describe('Fantasy Statblocks, through the engine', () => {
	const block = '```statblock\nname: Bog Wisp\nsize: Tiny\ntype: undead\nac: 13\nhp: 9\nhit_dice: 2d4 + 4\nspeed: 0 ft., fly 40 ft. (hover)\nstats: [3, 16, 14, 10, 12, 6]\ncr: 1/2\nsource: Swamp Book\nactions:\n  - name: Chill Touch\n    desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Cold damage."\n```';
	const ctx = { plugin: { edition: () => '2024' }, sourcePath: '' };

	it('knows its block, and not a bundle or a plain note', () => {
		expect(fantasyStatblocksImporter.detect({ files: [], text: block })).toBeGreaterThan(0.9);
		expect(fantasyStatblocksImporter.detect({ files: [], text: 'Just some notes about a wisp.' })).toBe(0);
	});

	it('reads into a bundle the engine checks, and writes a ```5e monster note with its CR and book', async () => {
		const read = await fantasyStatblocksImporter.read({ files: [], text: block }, ctx);
		if (!('bundle' in read)) throw new Error('no bundle');
		const b = checkBundle(read.bundle, games);
		expect(b.records).toHaveLength(1);
		const r = b.records[0];
		expect(r.errors).toEqual([]);
		expect(b.source?.name).toBe('Fantasy Statblocks');
		const out = writeEntry5e('monster', r.value!, b.edition);
		expect(out?.lang).toBe('5e');
		expect(out?.body).toMatch(/^name: Bog Wisp\n[\s\S]*hp: 9 \(2d4 \+ 4\)[\s\S]*cr: 1\/2/);
		expect(out?.props).toEqual({ cr: '1/2', source: 'Swamp Book' });
	});
});

describe('Nimble writes an imported monster as its own block', () => {
	it('from fields: the ```nimble block, and the note says its level', () => {
		const monster = KINDS_NIMBLE.find(k => k.kind === 'monster')!;
		const c = checkEntry(monster, { name: 'Mire Hag', level: 3, hp: 30, armor: 'medium', actions: [{ name: 'Claw', text: '1d8+2 slashing.' }] });
		expect(c.errors).toEqual([]);
		const out = writeEntryNimble('monster', c.value!);
		expect(out?.lang).toBe('nimble');
		expect(out?.body).toMatch(/^name: Mire Hag/);
		expect(out?.body).toMatch(/Claw/);
		expect(out?.props).toEqual({ level: '3' });
	});
});

describe('the published bundle schema', () => {
	it('matches the code (UPDATE_SCHEMAS=1 writes it again)', () => {
		const schema = `${JSON.stringify(bundleSchema([
			{ id: 'nimble', kinds: KINDS_NIMBLE, packSchema: packSchema({ system: 'nimble', name: 'Nimble', title: 'Nimble', kinds: KINDS_NIMBLE }) },
			{ id: 'dnd5e', aliases: dnd5eSystem.aliases, kinds: KINDS_5E, editions: ['2024', '2014'], packSchema: packSchema({ system: '5e', title: '5e', editions: ['2024', '2014'], kinds: KINDS_5E }) },
		]), null, '\t')}\n`;
		const file = 'docs/import/bundle.schema.json';
		if (process.env.UPDATE_SCHEMAS) { mkdirSync('docs/import', { recursive: true }); writeFileSync(file, schema); }
		expect(readFileSync(file, 'utf8')).toBe(schema);
	});
});
