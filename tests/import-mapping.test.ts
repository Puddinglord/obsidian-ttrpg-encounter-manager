import { readFileSync, writeFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { applyField, detectMapping, fillTemplate, getPath, mappingImporter, mappingSchema, readMapping, runMapping } from '../src/core/import/mapping';
import { checkBundle, BundleGames } from '../src/core/import/bundle';
import { KINDS_NIMBLE } from '../src/systems/nimble/content';
import { KINDS_5E } from '../src/systems/dnd5e/content';

const games: BundleGames = {
	resolve: (id) => (id === 'nimble' ? { id: 'nimble', kinds: KINDS_NIMBLE } : id === '5e' ? { id: 'dnd5e', kinds: KINDS_5E, editions: ['2024', '2014'] } : undefined),
};
const example = JSON.parse(readFileSync('docs/import/examples/lantern-forge-mapping.json', 'utf8')) as unknown;
const exportText = readFileSync('tests/fixtures/lantern-forge-export.json', 'utf8');

describe('paths', () => {
	const d = { a: { b: [{ c: 1 }, { c: 2 }] }, x: '', y: 'why', list: ['p', 'q'] };
	it('dots, an index, a fan-out, the first that has a value, the record itself', () => {
		expect(getPath(d, 'a.b[1].c')).toBe(2);
		expect(getPath(d, 'a.b[*].c')).toEqual([1, 2]);
		expect(getPath(d, 'x | y')).toBe('why');
		expect(getPath(d, 'missing | list[0]')).toBe('p');
		expect(getPath(d, '$')).toBe(d);
		expect(getPath(d, 'a.nope.deeper')).toBeUndefined();
		expect(getPath(d, 'a.b[9]')).toBeUndefined();
	});
});

describe('field rules', () => {
	const r = { hp: '30 hp', armour: 'Heavy', tags: 'fey, bog ,  hag', moves: [{ label: 'Claw', detail: '<b>1d8</b>' }, { label: '', detail: '' }], open: 'yes', lvl: 3, none: null };
	it('every transform', () => {
		expect(applyField({ path: 'hp', as: 'integer' }, r)).toBe(30);
		expect(applyField({ path: 'hp', as: 'number' }, r)).toBe(30);
		expect(applyField({ path: 'armour', as: 'lower' }, r)).toBe('heavy');
		expect(applyField({ path: 'armour', as: 'upper' }, r)).toBe('HEAVY');
		expect(applyField({ path: 'open', as: 'boolean' }, r)).toBe(true);
		expect(applyField({ path: 'lvl', as: 'string' }, r)).toBe('3');
		expect(applyField({ value: 'Hit: 2d6 + 3 fire', as: 'dice' }, r)).toBe('2d6+3');
		expect(applyField({ path: 'lvl', as: 'list' }, r)).toEqual([3]);
		expect(applyField({ value: '<p>One &amp; <em>two</em></p>', as: 'html' }, r)).toBe('One & *two*');
	});
	it('a lookup with a catch-all, split and join, the first, a default', () => {
		expect(applyField({ path: 'armour', map: { heavy: 'heavy', '*': 'none' } }, r)).toBe('heavy');
		expect(applyField({ value: 'Leather', map: { heavy: 'heavy', '*': 'none' } }, r)).toBe('none');
		expect(applyField({ path: 'tags', split: ',' }, r)).toEqual(['fey', 'bog', 'hag']);
		expect(applyField({ path: 'tags', split: ',', join: ' / ' }, r)).toBe('fey / bog / hag');
		expect(applyField({ path: 'tags', split: ',', first: true }, r)).toBe('fey');
		expect(applyField({ path: 'none', default: 6 }, r)).toBe(6);
	});
	it('lists of objects drop empty items; objects take their fields from the same record', () => {
		expect(applyField({ path: 'moves', each: { name: 'label', text: { path: 'detail', as: 'html' } } }, r)).toEqual([{ name: 'Claw', text: '**1d8**' }]);
		expect(applyField({ fields: { easier: 'armour', harder: 'nope' } }, r)).toEqual({ easier: 'Heavy' });
	});
	it('templates fill their slots, and tidy around an empty one', () => {
		expect(fillTemplate('lf:{lvl}', r)).toBe('lf:3');
		expect(fillTemplate('{armour} ({none})', r)).toBe('Heavy');
		expect(applyField({ path: 'armour', template: 'Armour: {$}' }, r)).toBe('Armour: Heavy');
	});
});

describe('reading a mapping file', () => {
	it('the example is a good mapping', () => {
		expect(readMapping(example).errors).toEqual([]);
	});
	it('says what\'s wrong, where', () => {
		expect(readMapping([]).errors[0]).toMatch(/JSON object/);
		expect(readMapping({ format: 'x' }).errors[0]).toMatch(/"format" should be "ember-vault-mapping"/);
		const bad = readMapping({
			format: 'ember-vault-mapping', version: 1, id: 'has spaces', label: '', detect: {}, links: [{ match: '([', data: 'http://plain' }],
			kind: 'monster', fields: { hp: { path: 'hp', as: 'roman' }, name: { pth: 'name' }, level: 7 },
		}).errors.join('\n');
		expect(bad).toMatch(/"id" should be a short name/);
		expect(bad).toMatch(/"label" should say/);
		expect(bad).toMatch(/"detect" needs "all" or "any"/);
		expect(bad).toMatch(/links 1: "match" isn't a pattern/);
		expect(bad).toMatch(/links 1: "data" should be an https address/);
		expect(bad).toMatch(/fields\.hp: "as" should be one of/);
		expect(bad).toMatch(/fields\.name has "pth", which isn't part of a field rule/);
		expect(bad).toMatch(/fields\.level should be a path or an object/);
		expect(bad).toMatch(/"system" should name the game/);
	});
	it('a note mapping needs no game; its kind must be a note kind', () => {
		const base = { format: 'ember-vault-mapping', version: 1, id: 'npcs', label: 'NPCs', detect: { all: ['n'] }, into: 'note', fields: { name: 'n' } };
		expect(readMapping({ ...base, kind: 'npc' }).errors).toEqual([]);
		expect(readMapping({ ...base, kind: 'villain' }).errors.join()).toMatch(/note's "kind" should be one of/);
	});
});

describe('running a mapping', () => {
	const m = readMapping(example).mapping!;
	const imp = mappingImporter(m);
	const input = { files: [{ name: 'export.json', text: exportText }] };

	it('recognises its file, and not another', () => {
		expect(detectMapping(m, input)).toBe(0.7);
		expect(imp.detect({ files: [{ name: 'export.yaml', text: exportText }] })).toBe(0);
		expect(imp.detect({ files: [], text: '{"items":[{"type":"creature","creature":{"name":"x"}}]}' })).toBe(0);
		expect(imp.detect({ files: [], text: 'not json' })).toBe(0);
	});

	it('makes a bundle the engine accepts: content with fields and sources, notes with their card and text; strays said', () => {
		const { bundle, notes } = runMapping(m, JSON.parse(exportText));
		expect(bundle.system).toBe('nimble');
		expect(bundle.source).toEqual({ name: 'Lantern Forge', license: 'Made up for this example' });
		expect(bundle.content).toEqual([{
			kind: 'monster', name: 'Mire Hag', level: '3', hp: 30, armor: 'medium', size: 'medium', type: 'Fey', speed: 6,
			actions: [{ name: 'Claw', text: '**1d8+2** slashing.' }, { name: 'Hex', text: 'Range 8. The target is *Dazed*.' }],
			traits: [{ name: 'Bog-born', text: 'Ignores difficult terrain in water.' }],
			flavor: 'She trades in names & teeth.',
			from: { id: 'lantern-forge:41', url: 'https://lanternforge.example/creatures/mire-hag' },
		}]);
		expect(bundle.notes).toEqual([{
			kind: 'npc', name: 'Irinia', fields: { role: 'Cleric', faction: 'The Gate', level: 1 },
			card: { look: 'Grey robes, a mace', wants: 'Hold the gate', voice: 'Low and even' }, body: 'Clever, wise and discerning.',
			from: { id: 'lantern-forge:52' },
		}]);
		expect(notes).toEqual(['A record with no name was left out.']);
		const checked = checkBundle(bundle, games);
		expect(checked.records.map(r => [r.name, r.errors, r.warnings])).toEqual([['Mire Hag', [], []], ['Irinia', [], []]]);
	});

	it('fetches its links, and a fetched file says where it came from', async () => {
		expect(imp.links?.[0].match.test('https://lanternforge.example/creatures/mire-hag')).toBe(true);
		expect(imp.links?.[0].dataUrl('https://lanternforge.example/creatures/mire-hag')).toBe('https://lanternforge.example/creatures/mire-hag.json');
		const read = await imp.read({ files: [], text: exportText, url: 'https://lanternforge.example/creatures/mire-hag' }, { plugin: null, sourcePath: '' });
		expect('bundle' in read && read.bundle.source?.url).toBe('https://lanternforge.example/creatures/mire-hag');
	});

	it('a file with nothing it can read says so', async () => {
		const read = await imp.read({ files: [], text: '{"items":[]}' }, { plugin: null, sourcePath: '' });
		expect(read).toEqual({ error: 'Nothing in this file reads as Lantern Forge.' });
	});

	it('reads YAML files too', () => {
		const yaml = 'items:\n  - id: 1\n    type: creature\n    creature:\n      title: Bog Wisp\n      lvl: 1\n      health: 9\n';
		const y = { files: [{ name: 'wisp.yaml', text: yaml }] };
		const ym = readMapping({ ...(example as object), detect: { all: ['creature.title', 'creature.lvl'], files: ['.yaml'] } }).mapping!;
		expect(detectMapping(ym, y)).toBe(0.7);
		expect(runMapping(ym, { items: [{ id: 1, type: 'creature', creature: { title: 'Bog Wisp', lvl: 1, health: 9 } }] }).bundle.content?.[0]).toMatchObject({ name: 'Bog Wisp', hp: 9 });
	});
});

describe('the published mapping schema', () => {
	it('matches the code (UPDATE_SCHEMAS=1 writes it again)', () => {
		const schema = `${JSON.stringify(mappingSchema(), null, '\t')}\n`;
		const file = 'docs/import/mapping.schema.json';
		if (process.env.UPDATE_SCHEMAS) writeFileSync(file, schema);
		expect(readFileSync(file, 'utf8')).toBe(schema);
	});
});
