// Content written in notes, in our syntax (core/content/blocks.ts): the YAML
// reader and writer, fenced blocks, every block kind of both games (a good one
// kept, a bad one left out with reasons), starters, where New puts a note, the
// content folder's notes as the Homebrew pack (store.ts: scope, packs:,
// precedence over packs and the books), Homebrew tags, block cards that never
// crash on a half-written block, and a hand-typed class block in each game
// driving New character and its level ups.
import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { blockLang, contentNotePath, fencedBlocks, HOMEBREW, readContentBlock, readContentNote, starterBody } from '../src/core/content/blocks';
import { checkEntry, KindSpec, starterEntry } from '../src/core/content/spec';
import type { PackEntry } from '../src/core/content/packs';
import { ContentStore } from '../src/core/content/store';
import { parseYamlLite, readYaml, toYaml } from '../src/core/yaml-lite';
import { BLOCKS_5E, content5e, KINDS_5E } from '../src/systems/dnd5e/content';
import { compendium5e, contentHit5e, findHit, Kind5e, KIND5E, setContentLayer5e } from '../src/systems/dnd5e/compendium';
import { buildEntries5e } from '../src/systems/dnd5e/compendium-entries';
import {
	allSkills, applyLevelUp5e, backgroundSkills, backgroundOf, characterFm, classCreation, classOf, newCharacter5e, newLevelUp5e, needsSubclass, optionGroups, settleIncreases,
	skillChoice, speciesChoices, startingEquipment, toolChoices, withArray, expertiseCount,
} from '../src/systems/dnd5e/character-draft';
import { settle } from '../src/systems/dnd5e/character-wizard';
import { readSheet5e } from '../src/systems/dnd5e/character';
import { evalUses5e, resources5e } from '../src/systems/dnd5e/sheet-actions';
import { contentNimble, contentTarget, KINDS_NIMBLE, mergeNimbleData, NIMBLE_BLOCKS } from '../src/systems/nimble/content';
import { Compendium, CompendiumData } from '../src/systems/nimble/compendium';
import { bundledCompendium, setContentLayer } from '../src/systems/nimble/compendium-data';
import { buildEntries } from '../src/systems/nimble/compendium-entries';
import { readCharacter } from '../src/systems/nimble/character-def';
import { applyLevelChoices, increaseKey, levelPlans, noChoices } from '../src/systems/nimble/level-plan';
import { newCharacterFrontmatter } from '../src/systems/nimble/new-character';
import { classPanelRows } from '../src/systems/nimble/class-panel-def';
import BOOKS from '../src/systems/nimble/data/compendium.json';
import NIMBLE_EXAMPLE from '../docs/content/examples/nimble-lantern-road.json';
import FIVE_E_EXAMPLE from '../docs/content/examples/5e-hearth-and-cinder.json';

const books = BOOKS as unknown as CompendiumData;
const kindOf = (list: readonly KindSpec[], k: string) => list.find(x => x.kind === k)!;
const block = (list: readonly KindSpec[], k: string, body: string) => readContentBlock(kindOf(list, k), body);

afterEach(() => { setContentLayer(null); setContentLayer5e(null); });

// ----------------------------------------------------------------------------

describe('the YAML reader says which lines it couldn\'t read', () => {
	it('reads what people type, and points at lines that don\'t fit', () => {
		expect(readYaml('name: Ember Knight\nhitDie: 10\nsaves: [STR, WIS]\n').skipped).toEqual([]);
		// A key under a list that isn't one of its items.
		const r = readYaml('name: Ember Knight\nhitDie: 10\nfeatures:\n  - name: A\n    desc: x\n  stray: line\nsaves: [STR]\n');
		expect(r.value).toMatchObject({ name: 'Ember Knight', hitDie: 10, features: [{ name: 'A', desc: 'x' }], saves: ['STR'] });
		expect(r.skipped).toEqual([6]);
		// A line with no colon ends what can be read; everything from it is reported.
		expect(readYaml('a: 1\nno colon here\nb: 2').skipped).toEqual([2, 3]);
		// An indented line after a value is more of that value, as in YAML.
		expect(readYaml('name: Ember\n  Knight').value).toEqual({ name: 'Ember Knight' });
		// A line after the document's end, and one at the wrong indent under a list, are skipped too.
		expect(readYaml('a: 1\n---\nb: 2').value).toEqual({ a: 1 });
		expect(readYaml('list:\n  - 1\n - 2\nnext: 3').skipped).toEqual([3]);
	});
	it('comments, blank lines and block scalars are never "skipped"', () => {
		expect(readYaml('# a comment\nname: x\n\ntext: |\n  one\n\n  two\n# end').skipped).toEqual([]);
	});
});

describe('the YAML writer writes what the reader reads back the same', () => {
	const same = (v: unknown) => expect(parseYamlLite(toYaml(v)), toYaml(v)).toEqual(v);
	it('awkward text: colons, hashes, leading marks, numbers and words that look like values, lines', () => {
		for (const s of ['a: b', 'x #y', '- dash', '#hash', '1/2', '12', 'true', 'null', '~', '', ' padded', 'trailing ', 'tab\there', 'quote "this"', 'it\'s', '[not a list]', '{nor a map}',
			'two\nlines', 'ends with a break\n', 'two breaks\n\n', 'para\n\npara', '  indented first\nline', 'line with trailing space \nnext', '*star', '&amp', '!bang', '%pct', '@at', '`tick`', '>fold', '|pipe', '?q', 'a, b']) {
			same({ s });
			same({ list: [s, 'plain'] });
		}
		same({ n: 3, f: 2.5, neg: -1, yes: true, no: false, nested: { deep: { er: [1, 2, { k: 'v' }] } }, empty: [], none: {} });
		expect(toYaml({ saves: ['STR', 'WIS'] })).toBe('saves: [STR, WIS]');
	});
	it('every class in the Nimble books, and every 5e SRD class, round-trips', () => {
		for (const c of books.classes ?? []) same(c);
		for (const ed of ['2024', '2014'] as const) for (const c of compendium5e(ed).classes) same(c);
	});
	it('every entry of both example packs round-trips, so any pack entry can be written as a block', () => {
		for (const e of [...NIMBLE_EXAMPLE.entries, ...FIVE_E_EXAMPLE.entries]) same(e);
	});
});

describe('fenced blocks in a note', () => {
	it('finds the languages asked for, with longer and tilde fences, and skips the rest', () => {
		const note = [
			'# Notes', '```5e-feat', 'name: A', '```', '', '~~~5e-class', 'name: B', '~~~', '````5e-species', 'name: C', '```', 'still C', '````',
			'```5e', 'name: Goblin', '```', '```5e-featx', 'name: no', '```',
		].join('\n');
		const found = fencedBlocks(note, new Set(['5e-feat', '5e-class', '5e-species']));
		expect(found.map(b => [b.lang, b.line, b.body])).toEqual([
			['5e-feat', 1, 'name: A'], ['5e-class', 5, 'name: B'], ['5e-species', 8, 'name: C\n```\nstill C'],
		]);
	});
	it('an unclosed block runs to the end of the note', () => {
		expect(fencedBlocks('```nimble-boon\nname: X\ntype: epic', new Set(['nimble-boon']))[0].body).toBe('name: X\ntype: epic');
	});
});

// ----------------------------------------------------------------------------
// Every block kind: a good one is an entry, a bad one says why

describe('5e blocks', () => {
	it('class', () => {
		expect(block(KINDS_5E, 'class', 'name: Hearth Warden\nhitDie: 10\nsaves: [STR, WIS]\nfeatures:\n  - level: 1\n    name: Hearthfire\n    desc: Warm.').errors).toEqual([]);
		expect(block(KINDS_5E, 'class', 'name: Half\nhitDie: 30\nfeatures: []').errors).toEqual(['"hitDie" should be at most 12', '"saves" is missing']);
	});
	it('subclass', () => {
		expect(block(KINDS_5E, 'subclass', 'name: Path of Cinders\nclass: Barbarian\nfeatures:\n  - { level: 3, name: Ash, desc: x }').entry).toMatchObject({ kind: 'subclass', name: 'Path of Cinders' });
		expect(block(KINDS_5E, 'subclass', 'name: Orphan\nfeatures:\n  - { level: three, name: Ash, desc: x }').errors).toEqual(['"class" is missing', '"features" item 1: "level" should be a number']);
	});
	it('feat', () => {
		expect(block(KINDS_5E, 'feat', 'name: Kindler\ntype: general\ndesc: |\n  You light fires.\n  Quickly.').entry?.value).toEqual({ name: 'Kindler', type: 'general', desc: 'You light fires.\nQuickly.\n' });
		expect(block(KINDS_5E, 'feat', 'name: Wordless').errors).toEqual(['"desc" is missing']);
	});
	it('species', () => {
		expect(block(KINDS_5E, 'species', 'name: Emberfolk\nsize: Small\nspeed: 30\ntraits:\n  - name: Warm\n    desc: x').errors).toEqual([]);
		expect(block(KINDS_5E, 'species', 'name: Slow\nsize: Small\nspeed: fast').errors).toEqual(['"speed" should be a number']);
	});
	it('background', () => {
		expect(block(KINDS_5E, 'background', 'name: Lamplighter\nabilityScores: [WIS, DEX, CON]\nfeat: Alert\nproficiencies: ["Skill: Perception"]').errors).toEqual([]);
		expect(block(KINDS_5E, 'background', 'name: Odd\nproficiencies: { a: b }').errors).toEqual(['"proficiencies" should be a list of text']);
	});
	it('says what it left out: a field that isn\'t one, a line it couldn\'t read, a kind that isn\'t this block\'s', () => {
		const r = block(KINDS_5E, 'feat', 'kind: spell\nname: Odd\ndesc: x\ncolour: red\nwhat no colon\nmore after');
		expect(r.entry?.name).toBe('Odd');
		expect(r.warnings).toEqual(['Lines 5 and 6 weren\'t read: check the indent, and the colon after each field\'s name', '"kind" isn\'t needed here: this block is a feat', '"colour" isn\'t a field here, so it was left out']);
	});
	it('text that isn\'t YAML says how to write it', () => {
		expect(block(KINDS_5E, 'feat', 'Just some words about a feat.').errors).toEqual(['Write one field on each line, like "name: Ember Knight".']);
		expect(block(KINDS_5E, 'feat', '').errors).toEqual(['"name" is missing']);
	});
});

describe('Nimble blocks', () => {
	const good: Record<string, string> = {
		class: 'name: Cinderwright\nkeyStats: [STR, WIL]\nhitDie: 10\nstartingHp: 17\nsaves: { adv: STR, dis: DEX }\nlevels:\n  - level: 1\n    features:\n      - name: Strike\n        text: Hit it.',
		subclass: 'name: Anvil Oath\nclass: Cinderwright\nlevels:\n  - level: 3\n    features:\n      - { name: Unbreakable, text: x }',
		option: 'name: Cleave Through\nclass: Berserker\ngroup: Savage Arsenal\ncost: 1 Action\ntext: Hit two.',
		ancestry: 'name: Emberkin\nsize: Small\ntraits:\n  - name: Warm\n    text: x',
		background: 'name: Ferryman\ntext: You know the river.',
		boon: 'name: Undying Flame\ntype: epic\ntext: You burn on.',
		property: 'name: Brittle\ntext: Breaks on a 1.',
		language: 'name: Ashcant\nspeakers: Smiths.',
		rule: 'name: Lamplight\ntopic: Travel\ntext: Light carries 8 spaces.',
		condition: 'name: Soot-Blind\ntext: You can\'t see past 2 spaces.\nminor: true',
	};
	const bad: Record<string, [string, string[]]> = {
		class: ['name: Odd\nkeyStats: [CHA]\nhitDie: 8\nstartingHp: 13\nsaves: { adv: WIL, dis: STR }\nlevels: []', ['"keyStats" should be STR, DEX, INT or WIL (it says "CHA")']],
		subclass: ['name: Orphan\nlevels: []', ['"class" is missing']],
		option: ['name: Listless\nclass: Berserker\ntext: x', ['"group" is missing']],
		ancestry: ['name: Traitless\ntraits:\n  - text: x', ['"traits" item 1: "name" is missing']],
		background: ['name: Blank', ['"text" is missing']],
		boon: ['name: Odd Boon\ntype: legendary\ntext: x', ['"type" should be one of: epic, lodging, other (it says "legendary")']],
		property: ['name: Wordless', ['"text" is missing']],
		language: ['speakers: Nobody', ['"name" is missing']],
		rule: ['name: Untold', ['"text" is missing']],
		condition: ['name: Odd\ntext: x\nminor: maybe', ['"minor" should be true or false']],
	};
	it.each(NIMBLE_BLOCKS.kinds)('%s: a good block is an entry; a bad one says why', (k) => {
		const r = block(KINDS_NIMBLE, k, good[k]);
		expect(r.errors, k).toEqual([]);
		expect(r.warnings, k).toEqual([]);
		expect(r.entry?.kind).toBe(k);
		const [body, why] = bad[k];
		const b = block(KINDS_NIMBLE, k, body);
		expect(b.entry).toBeUndefined();
		expect(b.errors).toEqual(why);
	});
});

// ----------------------------------------------------------------------------

describe('starters and where New puts a note', () => {
	const kinds = [...BLOCKS_5E.kinds.map(k => kindOf(KINDS_5E, k)), ...NIMBLE_BLOCKS.kinds.map(k => kindOf(KINDS_NIMBLE, k))];
	it.each(kinds.map(k => [k.label, k] as const))('%s: its starter reads back as fields of the kind, with its name, and asks only for what\'s missing', (_l, kind) => {
		const r = readContentBlock(kind, starterBody(kind, 'Ember Thing'));
		expect(r.value.name).toBe('Ember Thing');
		expect(r.warnings).toEqual([]);
		for (const e of r.errors) expect(e).toMatch(/is missing$/);
		// Everything a starter holds is a field of its kind.
		expect(checkEntry(kind, starterEntry(kind, 'X')).warnings).toEqual([]);
	});
	it('a starter is plain YAML a person can fill in', () => {
		expect(starterBody(kindOf(KINDS_5E, 'feat'), 'Kindler')).toBe('name: Kindler\ntype: general\nprerequisite: ""\ndesc: ""');
		expect(starterBody(kindOf(KINDS_NIMBLE, 'ancestry'), 'Emberkin')).toBe('name: Emberkin\nsize: Medium\nrarity: common\nflavor: ""\ntraits:\n  - name: ""\n    text: ""');
	});
	it('notes go under the content folder, by game and kind', () => {
		expect(contentNotePath('Ember Vault/Content', BLOCKS_5E, kindOf(KINDS_5E, 'class'), 'Hearth Warden')).toBe('Ember Vault/Content/5e/Classes/Hearth Warden.md');
		expect(contentNotePath('Ember Vault/Content', BLOCKS_5E, kindOf(KINDS_5E, 'species'), 'Ember: Kin?')).toBe('Ember Vault/Content/5e/Species/Ember Kin.md');
		expect(contentNotePath('Ember Vault/Content', NIMBLE_BLOCKS, kindOf(KINDS_NIMBLE, 'option'), 'Cleave')).toBe('Ember Vault/Content/Nimble/Class options/Cleave.md');
		expect(contentNotePath('Homebrew', NIMBLE_BLOCKS, kindOf(KINDS_NIMBLE, 'ancestry'), 'Emberkin')).toBe('Homebrew/Nimble/Ancestries/Emberkin.md');
		expect(contentNotePath('Homebrew', NIMBLE_BLOCKS, kindOf(KINDS_NIMBLE, 'property'), 'Brittle')).toBe('Homebrew/Nimble/Weapon properties/Brittle.md');
	});
	it('every block language is the game\'s prefix and the kind', () => {
		expect(BLOCKS_5E.kinds.map(k => blockLang(BLOCKS_5E.prefix, k))).toEqual(['5e-class', '5e-subclass', '5e-feat', '5e-species', '5e-background']);
		expect(NIMBLE_BLOCKS.kinds.map(k => blockLang(NIMBLE_BLOCKS.prefix, k))).toContain('nimble-ancestry');
		// Never the fences the games already have.
		for (const lang of [...BLOCKS_5E.kinds.map(k => blockLang('5e', k)), ...NIMBLE_BLOCKS.kinds.map(k => blockLang('nimble', k))]) expect(['5e', '5e-spell', '5e-item', '5e-sheet', 'nimble', 'nimble-spell', 'nimble-item', 'nimble-sheet', 'nimble-npc', 'nimble-note', 'nimble-encounter', 'nimble-map', 'nimble-campaign']).not.toContain(lang);
	});
});

// ----------------------------------------------------------------------------
// The content folder's notes, as the Homebrew pack

function fakePlugin(files: Record<string, string>, o: { campaigns?: { folder: string; home: string }[]; active?: string; packs?: Record<string, unknown> } = {}) {
	const tfile = (path: string) => Object.assign(new TFile(), { path, extension: path.split('.').pop() ?? '' });
	const camps = (o.campaigns ?? []).map(c => ({ folder: c.folder, home: { path: c.home } }));
	const systems = [
		{ id: 'dnd5e', name: '5e', content: { kinds: KINDS_5E, blocks: BLOCKS_5E } },
		{ id: 'nimble', name: 'Nimble', content: { kinds: KINDS_NIMBLE, blocks: NIMBLE_BLOCKS } },
	];
	return {
		settings: { contentFolder: '' },
		systems: { get: (n: string) => systems.find(s => s.id === n || s.name.toLowerCase() === n.toLowerCase()), all: () => systems },
		campaigns: {
			campaigns: camps,
			of: (p: string) => camps.find(c => p.startsWith(`${c.folder}/`)),
			get active() { return camps.find(c => c.folder === o.active); },
			on: () => ({}),
		},
		app: {
			vault: { getFiles: () => Object.keys(files).map(tfile), cachedRead: async (f: TFile) => files[f.path], getFileByPath: (p: string) => (p in files || camps.some(c => c.home.path === p) ? tfile(p) : null) },
			metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: o.packs?.[f.path] !== undefined ? { packs: o.packs[f.path] } : {} }), on: () => ({}) },
			workspace: { onLayoutReady: () => {} },
		},
		registerEvent: () => {}, register: () => {},
	};
}

const featBlock = (name: string, desc: string) => `\`\`\`5e-feat\nname: ${name}\ndesc: ${desc}\n\`\`\``;

describe('the content folder\'s notes are the Homebrew pack', () => {
	it('indexes blocks in the content folder only, each entry with its note; left-out blocks say why', async () => {
		const store = new ContentStore(fakePlugin({
			'Ember Vault/Content/5e/Feats/Kindler.md': featBlock('Kindler', 'You light fires.'),
			'Ember Vault/Content/5e/Feats/Broken.md': '```5e-feat\nname: Broken\n```',
			'Ember Vault/Content/Nimble/Ancestries/Emberkin.md': '```nimble-ancestry\nname: Emberkin\nsize: Small\n```',
			'Elsewhere/Stray.md': featBlock('Stray', 'Not in the folder.'),
		}) as never);
		await store.load();
		const brew = store.enabled('dnd5e');
		expect(brew.map(p => [p.name, p.homebrew])).toEqual([[HOMEBREW, true]]);
		expect(brew[0].entries).toEqual([{ kind: 'feat', name: 'Kindler', value: { name: 'Kindler', desc: 'You light fires.' }, file: 'Ember Vault/Content/5e/Feats/Kindler.md' }]);
		expect(brew[0].rejected).toEqual([{ at: 'Broken, line 1 (Feat)', reasons: ['"desc" is missing'] }]);
		expect(store.enabled('nimble')[0].entries.map(e => e.name)).toEqual(['Emberkin']);
		// The same pack until a note changes (so the games' layers can tell).
		expect(store.enabled('dnd5e')[0]).toBe(brew[0]);
	});
	it('comes after the packs; a campaign\'s packs: can leave it out by name; a note in a campaign\'s folder is that campaign\'s', async () => {
		const plugin = fakePlugin({
			'Ember Vault/Content/a.json': JSON.stringify({ pack: 'Pack A', system: '5e', entries: [{ kind: 'feat', name: 'Kindler', desc: 'Pack text.' }] }),
			'Ember Vault/Content/5e/Feats/Kindler.md': featBlock('Kindler', 'My text.'),
		}, { campaigns: [{ folder: 'Ash', home: 'Ash/Ash.md' }, { folder: 'Dust', home: 'Dust/Dust.md' }], packs: { 'Ash/Ash.md': ['Pack A'], 'Dust/Dust.md': 'none' } });
		const store = new ContentStore(plugin as never);
		await store.load();
		expect(store.enabled('dnd5e').map(p => p.name)).toEqual(['Pack A', HOMEBREW]);
		expect(store.enabled('dnd5e', 'Ash/Session.md').map(p => p.name)).toEqual(['Pack A']);
		expect(store.enabled('dnd5e', 'Dust/Session.md')).toEqual([]);
		// Named, Homebrew is picked like any pack.
		const named = new ContentStore(fakePlugin({ 'Ember Vault/Content/5e/Feats/Kindler.md': featBlock('Kindler', 'x') }, { campaigns: [{ folder: 'Ash', home: 'Ash/Ash.md' }], packs: { 'Ash/Ash.md': ['homebrew'] } }) as never);
		await named.load();
		expect(named.enabled('dnd5e', 'Ash/x.md').map(p => p.name)).toEqual([HOMEBREW]);
	});
	it('a content folder inside a campaign: its notes are that campaign\'s alone', async () => {
		const plugin = fakePlugin({ 'Ash/Ember Vault/Content/5e/Feats/Kindler.md': featBlock('Kindler', 'x') }, { campaigns: [{ folder: 'Ash', home: 'Ash/Ash.md' }, { folder: 'Dust', home: 'Dust/Dust.md' }] });
		plugin.settings.contentFolder = 'Ash/Ember Vault/Content';
		const store = new ContentStore(plugin as never);
		await store.load();
		expect(store.enabled('dnd5e', 'Ash/x.md').map(p => p.entries.length)).toEqual([1]);
		expect(store.enabled('dnd5e', 'Dust/x.md')).toEqual([]);
	});
	it('the first note (by path) wins a name, as with every other note', () => {
		const kinds = new Map([['5e-feat', kindOf(KINDS_5E, 'feat')]]);
		const a = readContentNote(`${featBlock('Kindler', 'one')}\n${featBlock('Kindler', 'two')}`, 'x/a.md', kinds);
		expect(a.entries.map(e => e.value.desc)).toEqual(['one', 'two']);
	});
});

describe('a note beats a pack beats the books, in both games, tagged Homebrew', () => {
	const asHomebrew = (e: PackEntry, file: string) => ({ ...e, file, pack: HOMEBREW });
	it('5e: your feat replaces a pack\'s, which replaces the SRD\'s; yours is tagged Homebrew with its note', () => {
		const pack = { kind: 'feat', name: 'Alert', value: { name: 'Alert', desc: 'Pack text.' }, pack: 'Pack A' };
		const mine = asHomebrew(block(KINDS_5E, 'feat', 'name: Alert\ndesc: My text.').entry!, 'Ember Vault/Content/5e/Feats/Alert.md');
		setContentLayer5e(() => content5e([pack]));
		expect(findHit('2024', 'Alert', 'feat')).toMatchObject({ feat: { desc: 'Pack text.', source: 'Pack A' } });
		setContentLayer5e(() => content5e([pack, mine]));
		expect(findHit('2024', 'Alert', 'feat')).toMatchObject({ feat: { desc: 'My text.', source: HOMEBREW, note: 'Ember Vault/Content/5e/Feats/Alert.md' } });
		const e = buildEntries5e('2024', []).find(x => x.name === 'Alert')!;
		expect(e.flags).toContain('homebrew');
		expect(e.flags).not.toContain('pack');
		expect(e.facets.source).toEqual([HOMEBREW]);
	});
	it('Nimble: your class replaces a pack\'s of the same name, which replaces the books\'; it\'s tagged Homebrew and searchable as source:Homebrew', () => {
		const pack = NIMBLE_EXAMPLE.entries.find(x => x.kind === 'class')!;
		const packEntry = { kind: 'class', name: pack.name, value: pack as unknown as Record<string, unknown>, pack: 'The Lantern Road' };
		const mine = asHomebrew(block(KINDS_NIMBLE, 'class', 'name: Lamplighter\nkeyStats: [INT]\nhitDie: 6\nstartingHp: 10\nsaves: { adv: INT, dis: STR }\nlevels:\n  - level: 1\n    features:\n      - { name: Mine, text: x }').entry!, 'Ember Vault/Content/Nimble/Classes/Lamplighter.md');
		const comp = new Compendium(mergeNimbleData(books, contentNimble([packEntry, mine])));
		expect(comp.classByName('Lamplighter')).toMatchObject({ hitDie: 6, pack: HOMEBREW, note: 'Ember Vault/Content/Nimble/Classes/Lamplighter.md' });
		const book = asHomebrew(block(KINDS_NIMBLE, 'background', 'name: Fearless\ntext: My take.').entry!, 'n.md');
		expect(new Compendium(mergeNimbleData(books, contentNimble([book]))).background('Fearless')?.text).toBe('My take.');
		const entries = buildEntries({ monsters: [], compendium: comp });
		const e = entries.find(x => x.kind === 'class' && x.name === 'Lamplighter')!;
		expect(e.flags).toContain('homebrew');
		expect(e.facets.source).toEqual([HOMEBREW]);
		// Its features and options carry the note too, so they're tagged the same.
		expect(entries.find(x => x.name === 'Mine')?.hit?.note).toBe('Ember Vault/Content/Nimble/Classes/Lamplighter.md');
	});
	it('Nimble: rules, properties and conditions written in notes keep their note', () => {
		const c = contentNimble(['rule', 'property', 'condition'].map(k => asHomebrew({ kind: k, name: `My ${k}`, value: { name: `My ${k}`, text: 'x' } }, `n/${k}.md`)));
		expect(c.rules[0].note).toBe('n/rule.md');
		expect(c.conditions[0]).toMatchObject({ note: 'n/condition.md', pack: HOMEBREW });
		const entries = buildEntries({ monsters: [], compendium: new Compendium(mergeNimbleData(books, c)) });
		expect(entries.find(x => x.name === 'My rule')?.flags).toContain('homebrew');
		expect(entries.find(x => x.name === 'My property')?.flags).toContain('homebrew');
	});
});

// ----------------------------------------------------------------------------

describe('a block\'s card draws what checked out, whatever is missing', () => {
	it.each(NIMBLE_BLOCKS.kinds)('Nimble %s: from nothing, from a name, from a class with half its fields', (k) => {
		const label = kindOf(KINDS_NIMBLE, k).label;
		for (const v of [{}, { name: 'X' }, { name: 'X', class: 'Berserker', group: 'Savage Arsenal', levels: [{ level: 1 }], traits: [{}] }]) {
			expect(() => contentTarget(k, v, label)).not.toThrow();
		}
		expect(contentTarget(k, { name: 'Ember' }, label)).not.toBeNull();
	});
	it('Nimble: a subclass shows in its class, an option in its list', () => {
		const sub = contentTarget('subclass', { name: 'Anvil Oath', class: 'Cinderwright', levels: [] }, 'Subclass');
		expect(sub && 'hit' in sub && sub.hit).toMatchObject({ kind: 'subclass', className: 'Cinderwright', source: HOMEBREW });
		const opt = contentTarget('option', { name: 'Cleave Through', class: 'Berserker', group: 'Savage Arsenal', text: 'x' }, 'Class option');
		expect(opt && 'hit' in opt && opt.hit).toMatchObject({ kind: 'feature', group: 'Savage Arsenal', className: 'Berserker' });
	});
	it.each(BLOCKS_5E.kinds)('5e %s: from nothing, from a name, from half a class', (k) => {
		const label = KIND5E[k as Kind5e].label;
		for (const v of [{}, { name: 'X' }, { name: 'X', class: 'Fighter', levels: [{ level: 1 }], subspecies: [{ name: 'Y' }], features: [{ level: 1 }] }]) {
			expect(() => contentHit5e(k as Kind5e, v, '2024', label)).not.toThrow();
		}
		expect(contentHit5e(k as Kind5e, { name: 'Ember' }, '2024', label)).toMatchObject({ kind: k, name: 'Ember' });
	});
});

// ----------------------------------------------------------------------------
// A class typed by hand, in each game, through New character and level ups

const HEARTH_WARDEN = `name: Hearth Warden
hitDie: 10
primary: Wisdom
saves: [STR, WIS]
proficiencies: [Light Armor, Medium Armor, Shields, Simple Weapons, Martial Weapons]
skillChoice: "Choose 2: Athletics, Insight, Medicine, Perception, or Survival"
spellcasting: WIS
spellList: Ranger
resources:
  - name: Hearthfire
    uses: Wisdom modifier
    min: 1
    shortFrom: 5
startingEquipment:
  - label: "(A) Chain Mail, Longsword, Shield and 2 Javelins; or (B) 100 GP"
    options:
      - label: A
        items: [Chain Mail, Longsword, Shield, 2 Javelin]
      - label: B
        gold: 100
toolChoices: { count: 1, from: [Cook's Utensils, Woodcarver's Tools] }
features:
  - level: 1
    name: Hearthfire
    desc: As a Bonus Action, you kindle a warding flame around an ally you can see within 30 feet.
  - level: 1
    name: Warding Style
    desc: Choose one of the following options.
  - level: 1
    name: Ember Guard
    group: Warding Style
    desc: While your flame burns around an ally, attacks against them have disadvantage.
  - level: 1
    name: Ash Step
    group: Warding Style
    desc: You can teleport to an ally your flame warms.
  - level: 2
    name: Spellcasting
    desc: You cast Ranger spells, using Wisdom.
  - level: 3
    name: Warden Circle
    desc: Choose a circle.
  - level: 4
    name: Ability Score Improvement
    desc: Increase one score by 2, or two scores by 1.
levels:
  - { level: 1, pb: 2, features: [Hearthfire, Warding Style] }
  - { level: 2, pb: 2, features: [Spellcasting], slots: [2], prepared: 2 }
  - { level: 3, pb: 2, features: [Warden Circle], slots: [3], prepared: 3 }
  - { level: 4, pb: 2, features: [Ability Score Improvement], slots: [3], prepared: 3 }
  - { level: 5, pb: 3, features: [], slots: [4, 2], prepared: 4 }
subclasses:
  - name: Circle of Embers
    flavor: Warden Circle
    features:
      - { level: 3, name: Banked Coals, desc: Your flame lingers a round after it ends. }
`;

describe('a 5e class typed in a ```5e-class block: New character and level ups', () => {
	const typed = block(KINDS_5E, 'class', HEARTH_WARDEN);
	const withBlock = (fn: () => void) => {
		setContentLayer5e(() => content5e([{ ...typed.entry!, file: 'Ember Vault/Content/5e/Classes/Hearth Warden.md', pack: HOMEBREW }]));
		try { fn(); } finally { setContentLayer5e(null); }
	};
	const made = (level = 1) => {
		const d = withArray({ ...newCharacter5e('2024', { name: 'Tess', level }), className: 'Hearth Warden', species: 'Human', background: 'Acolyte' });
		settle(d);
		const k = classOf('2024', 'Hearth Warden')!;
		const fixed = [...backgroundSkills(backgroundOf(d)), ...(speciesChoices(d).skills ?? [])];
		const sc = skillChoice(k.skillChoice);
		d.skills = sc.from.filter(s => !fixed.includes(s)).slice(0, sc.count);
		d.expertise = allSkills(d).slice(0, expertiseCount(d));
		d.choices = optionGroups(k, d.subclass, level).flatMap(g => g.from.slice(0, g.count));
		d.tools = toolChoices(d).flatMap(g => g.from.slice(0, g.count));
		settleIncreases(d);
		return settle(d);
	};

	it('reads with nothing left out', () => {
		expect(typed.errors).toEqual([]);
		expect(typed.warnings).toEqual([]);
	});
	it('New character: its options by `group`, its own equipment and tools, Hearthfire\'s uses from Wisdom', () => withBlock(() => {
		expect(classOf('2024', 'Hearth Warden')?.note).toBe('Ember Vault/Content/5e/Classes/Hearth Warden.md');
		expect(optionGroups(classOf('2024', 'Hearth Warden'), '', 1)).toEqual([{ group: 'Warding Style', count: 1, from: ['Ember Guard', 'Ash Step'] }]);
		const d = made();
		expect(classCreation('2024', 'Hearth Warden')?.equipment.map(g => g.options.map(o => o.label))).toEqual([['A', 'B']]);
		expect(startingEquipment(d).items).toEqual(expect.arrayContaining([{ name: 'Chain Mail', qty: 1 }, { name: 'Javelin', qty: 2 }]));
		expect(toolChoices(d)).toEqual([{ count: 1, from: ['Cook\'s Utensils', 'Woodcarver\'s Tools'], label: 'Hearth Warden' }]);
		const fm = characterFm(d);
		expect(fm.tools).toContain('Cook\'s Utensils');
		const s = readSheet5e(fm, '2024', 'Tess');
		expect(s.hpMax).toBe(10 + s.mods.con);
		expect(s.features.filter(f => f.source === 'Hearth Warden').map(f => f.name)).toEqual(['Hearthfire', 'Warding Style', 'Ember Guard']);
		expect(resources5e(s).find(r => r.name === 'Hearthfire')).toMatchObject({ max: Math.max(1, s.mods.wis), per: 'long' });
	}));
	it('levels up 1 → 5: spells by its Prepared column, its subclass at 3, an increase at 4; Hearthfire back on a short rest from 5', () => withBlock(() => {
		const fm = characterFm(made());
		for (let l = 2; l <= 5; l++) {
			const d = newLevelUp5e(fm, '2024', 'Tess');
			if (needsSubclass(d)) d.subclass = 'Circle of Embers';
			d.spells = compendium5e('2024').spells.filter(x => x.classes.includes('Ranger') && x.level === 1 && !d.known.includes(x.name)).slice(0, 1).map(x => x.name);
			applyLevelUp5e(fm, d);
		}
		const s = readSheet5e(fm, '2024', 'Tess');
		expect([s.level, s.subclass]).toEqual([5, 'Circle of Embers']);
		expect(s.slots.map(x => [x.level, x.max])).toEqual([[1, 4], [2, 2]]);
		expect(s.features.map(f => f.name)).toContain('Banked Coals');
		expect(resources5e(s).find(r => r.name === 'Hearthfire')?.per).toBe('short');
	}));
});

describe('5e uses written as a formula', () => {
	const v = { mods: { str: 3, dex: 1, con: 2, int: 0, wis: 2, cha: -1 }, pb: 3, level: 6 };
	it.each([
		['CHA', -1], ['Charisma modifier', -1], ['your Wisdom modifier', 2], ['PB', 3], ['proficiency bonus', 3], ['level', 6], ['2 + WIS', 4], ['WIS × 2', 4], ['level / 2', 3], ['PB + CON - 1', 4], ['(level + 1) / 2', 3], [4, 4], ['5', 5],
	] as const)('%s → %d', (f, n) => expect(evalUses5e(f, v)).toBe(n));
	it('words it doesn\'t know are no count at all', () => {
		expect(evalUses5e('lots', v)).toBeUndefined();
		expect(evalUses5e('', v)).toBeUndefined();
		expect(evalUses5e('2 +', v)).toBeUndefined();
	});
	it('the SRD\'s Bardic Inspiration and 2014 Wild Shape are class data now, as a pack\'s would be', () => {
		const bard = (ed: '2024' | '2014', level: number) => readSheet5e({ class: 'Bard', level, cha: 16 }, ed, 'B');
		expect(resources5e(bard('2024', 1)).find(r => r.name === 'Bardic Inspiration')).toMatchObject({ max: 3, per: 'long' });
		expect(resources5e(bard('2014', 5)).find(r => r.name === 'Bardic Inspiration')).toMatchObject({ max: 3, per: 'short' });
		expect(resources5e(readSheet5e({ class: 'Druid', level: 2 }, '2014', 'D')).find(r => r.name === 'Wild Shape')).toMatchObject({ max: 2, per: 'short' });
		expect(resources5e(readSheet5e({ class: 'Druid', level: 1 }, '2014', 'D')).find(r => r.name === 'Wild Shape')).toBeUndefined();
		// A pack's Bard without the resource doesn't get the SRD's.
		setContentLayer5e(() => content5e([{ kind: 'class', name: 'Bard', value: { name: 'Bard', hitDie: 8, saves: ['DEX'], features: [] }, pack: 'P' }]));
		expect(resources5e(bard('2024', 1)).find(r => r.name === 'Bardic Inspiration')).toBeUndefined();
	});
});

const CINDERWRIGHT = `name: Cinderwright
tagline: A smith who hammers fire into the fight.
keyStats: [STR, WIL]
hitDie: 10
startingHp: 17
saves: { adv: STR, dis: DEX }
armor: Mail, Shields
weapons: STR weapons
startingGear: [Club/Mace, Chain Shirt]
resources:
  - name: Forge Dice
    max: 2
    die: d6
    reset: Safe Rest
    dice:
      rolled: spent
      addTo: [attack]
      use: any
      rules: [Strike the Anvil]
      maxSteps:
        - { level: 3, add: 1, subclass: Anvil Oath }
        - { level: 5, add: 1 }
  - name: Ember Mend
    max: 5×LVL
    reset: Safe Rest
    spend: Mend
states:
  - { name: Forgeheat, condition: Forgeheated, feature: Forgeheat }
target: { name: Branded Foe, feature: Brand }
levels:
  - level: 1
    features:
      - name: Strike the Anvil
        text: When you hit with a melee attack, spend any number of Forge Dice and add them to the damage.
      - name: Forgeheat
        text: As an action, you become Forgeheated until the end of the encounter.
      - name: Brand
        text: Mark one creature you can see. Your attacks against it ignore cover.
        uses: WIL
  - level: 2
    features:
      - name: Tempered Will
        text: Your will hardens with the iron.
        increase: { stats: [STR, WIL] }
      - name: Spark Lore
        text: You pick up a little fire magic.
        learn:
          - { kind: utility, from: [Fire], count: 1 }
  - level: 3
    features:
      - name: Subclass
        text: Choose a Cinderwright oath.
  - level: 4
    features:
      - name: Hot Iron
        text: Your Forge Dice are hotter.
  - level: 5
    features:
      - name: Second Anvil
        text: You hold one more Forge Die.
subclasses:
  - name: Anvil Oath
    levels:
      - level: 3
        features:
          - { name: Unbreakable, text: You can't be knocked prone. }
`;

describe('a Nimble class typed in a ```nimble-class block: New character and level ups', () => {
	const typed = block(KINDS_NIMBLE, 'class', CINDERWRIGHT);
	const content = () => contentNimble([{ ...typed.entry!, file: 'Ember Vault/Content/Nimble/Classes/Cinderwright.md', pack: HOMEBREW }]);
	const comp = () => new Compendium(mergeNimbleData(books, content()));

	it('reads with nothing left out', () => {
		expect(typed.errors).toEqual([]);
		expect(typed.warnings).toEqual([]);
	});
	it('joins the compendium every hero reads (the layer the runtime sets)', () => {
		setContentLayer(() => ({ key: 'brew', content: content() }));
		expect(bundledCompendium().classByName('Cinderwright')).toMatchObject({ pack: HOMEBREW, note: 'Ember Vault/Content/Nimble/Classes/Cinderwright.md' });
	});
	it('New character: stats, HP, gear; the class panel from its data (dice, a number with its own word, a state, a target, uses from data)', () => {
		const c = comp();
		const fm = newCharacterFrontmatter({ name: 'Brann', className: 'Cinderwright', array: 'Standard' }, c);
		expect(fm).toMatchObject({ class: 'Cinderwright', level: 1, hp_max: 17 });
		const s = readCharacter(fm, c);
		expect(s.saves).toMatchObject({ STR: 'adv', DEX: 'dis' });
		expect(s.resources.find(r => r.name === 'Forge Dice')).toMatchObject({ max: 2, die: 'd6' });
		expect(s.resources.find(r => r.name === 'Brand')).toMatchObject({ max: s.stats.WIL, reset: 'Safe Rest', feature: 'Brand' });
		const rows = classPanelRows(s);
		expect(rows.map(r => [r.kind, r.label])).toEqual([
			['target', 'Branded Foe'], ['state', 'Forgeheat'], ['dice', 'Forge Dice'], ['number', 'Ember Mend'], ['uses', 'Brand'],
		]);
		expect(rows.find(r => r.kind === 'number')).toMatchObject({ spend: 'Mend', max: 5 });
		expect(rows.find(r => r.kind === 'state')).toMatchObject({ on: false, condition: 'Forgeheated', dice: [], rules: [{ name: 'Forgeheat' }] });
		expect(rows.find(r => r.kind === 'target')).toMatchObject({ rules: [{ name: 'Brand' }] });
		// Switched on: the hero is Forgeheated.
		expect(classPanelRows(readCharacter({ ...fm, conditions: ['Forgeheated'] }, c)).find(r => r.kind === 'state')).toMatchObject({ on: true });
	});
	it('levels up 1 → 5: an increase and a Utility Spell from its data, the subclass at 3, Forge Dice growing by level and subclass', () => {
		const c = comp();
		let fm = newCharacterFrontmatter({ name: 'Brann', className: 'Cinderwright', array: 'Standard' }, c);
		const two = levelPlans(c, { className: 'Cinderwright', subclass: '', from: 2, to: 2, hitDie: 10 })[0];
		expect(two.stats).toEqual([{ feature: 'Tempered Will', options: ['STR', 'WIL'], count: 1 }]);
		expect(two.spells).toEqual([{ key: '2|Spark Lore|0', level: 2, feature: 'Spark Lore', kind: 'utility', schools: ['Fire'], count: 1 }]);
		const wil = readCharacter(fm, c).stats.WIL;
		for (const level of [2, 3, 4, 5]) {
			const s = readCharacter(fm, c);
			const step = levelPlans(c, { className: 'Cinderwright', subclass: s.subclass, from: level, to: level, hitDie: 10, chosen: level === 3 ? 'Anvil Oath' : undefined });
			const choices = { ...noChoices(), hp: [6] };
			if (level === 2) Object.assign(choices, { stats: { [increaseKey(2, step[0].stats[0])]: ['WIL'] }, spells: { '2|Spark Lore|0': ['Kindle'] } });
			if (level === 3) choices.subclass = 'Anvil Oath';
			applyLevelChoices(fm, c, step, choices);
			fm = { ...fm };
		}
		const s = readCharacter(fm, c);
		expect([s.level, s.subclass, s.stats.WIL]).toEqual([5, 'Anvil Oath', wil + 1]);
		expect(s.spells.map(x => x.name)).toContain('Kindle');
		expect(s.features.map(f => f.name)).toContain('Unbreakable');
		// 2, +1 for the Anvil Oath from 3, +1 for everyone from 5.
		expect(s.resources.find(r => r.name === 'Forge Dice')!.max).toBe(4);
		const other = readCharacter({ ...fm, subclass: '' }, c);
		expect(other.resources.find(r => r.name === 'Forge Dice')!.max).toBe(3);
	});
});
