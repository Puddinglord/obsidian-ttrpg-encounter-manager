// Content packs (core/content): reading a pack keeps what it can use and says
// why it left the rest out; campaigns pick packs; 5e's kinds take the example
// pack whole and put it on top of the SRD; the published JSON Schema matches
// the kinds (run with UPDATE_SCHEMAS=1 to write it again).
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { KindsFor, packsEnabled, packSummary, readPack } from '../src/core/content/packs';
import { checkEntry, packSchema } from '../src/core/content/spec';
import { compendium5e, findHit, setContentLayer5e, allHits } from '../src/systems/dnd5e/compendium';
import { content5e, KINDS_5E } from '../src/systems/dnd5e/content';

const kindsFor: KindsFor = (s) => (s.toLowerCase() === '5e' || s === 'dnd5e' ? { id: 'dnd5e', name: '5e', kinds: KINDS_5E, editions: ['2024', '2014'] } : s === 'daggerheart' ? 'no-packs' : null);
const pack = (o: Record<string, unknown>) => JSON.stringify({ pack: 'Test', system: '5e', ...o });
const EXAMPLE = readFileSync('docs/content/examples/5e-hearth-and-cinder.json', 'utf8');

afterEach(() => setContentLayer5e(null));

describe('reading a pack', () => {
	it('says what\'s wrong with the file as a whole, plainly', () => {
		expect(readPack('{ "pack": "x", ', 'p.json', kindsFor).error).toMatch(/isn't valid JSON.*missing comma or quote/);
		expect(readPack('[]', 'p.json', kindsFor).error).toMatch(/"pack", "system" and "entries"/);
		expect(readPack('{"pack":"x","entries":[]}', 'p.json', kindsFor).error).toMatch(/which game/);
		expect(readPack('{"pack":"x","system":"gurps","entries":[]}', 'p.json', kindsFor).error).toMatch(/doesn't know the game "gurps"/);
		expect(readPack('{"pack":"x","system":"daggerheart","entries":[]}', 'p.json', kindsFor).error).toMatch(/daggerheart doesn't take content packs yet/);
		expect(readPack(pack({ edition: '2018', entries: [] }), 'p.json', kindsFor).error).toMatch(/"edition" should be one of: 2024, 2014/);
		expect(readPack(pack({}), 'p.json', kindsFor).error).toMatch(/no "entries" list/);
	});
	it('keeps good entries and says why each bad one was left out', () => {
		const p = readPack(pack({ entries: [
			{ kind: 'spell', name: 'Good', level: 1, school: 'Evocation', castingTime: 'Action', range: 'Self', components: 'V', duration: 'Instantaneous', desc: 'It works.' },
			{ kind: 'spell', name: 'No Level', school: 'Evocation', castingTime: 'Action', range: 'Self', components: 'V', duration: 'Instantaneous', desc: 'x' },
			{ kind: 'spell', name: 'Bad School', level: 2, school: 'Pyromancy', castingTime: 'Action', range: 'Self', components: 'V', duration: 'Instantaneous', desc: 'x' },
			{ kind: 'spell', name: 'Too High', level: 12, school: 'Evocation', castingTime: 'Action', range: 'Self', components: 'V', duration: 'Instantaneous', desc: 'x' },
			{ kind: 'vehicle', name: 'Cart' },
			{ name: 'No Kind' },
			'just text',
			{ kind: 'monster', name: 'Half', ac: 12 },
			{ kind: 'monster', name: 'Odd CR', ac: 12, hp: 10, abilities: [10, 10, 10, 10, 10, 10], cr: 'huge' },
			{ kind: 'feat', name: 'Extra', desc: 'x', colour: 'red' },
		] }), 'p.json', kindsFor);
		expect(p.error).toBeUndefined();
		expect(p.entries.map(e => e.name)).toEqual(['Good', 'Extra']);
		const why = Object.fromEntries(p.rejected.map(r => [r.at, r.reasons.join(' | ')]));
		expect(why['Entry 2 (No Level)']).toBe('"level" is missing');
		expect(why['Entry 3 (Bad School)']).toMatch(/"school" should be one of: Abjuration, .* \(it says "Pyromancy"\)/);
		expect(why['Entry 4 (Too High)']).toBe('"level" should be at most 9');
		expect(why['Entry 5 (Cart)']).toMatch(/"vehicle" isn't a kind 5e takes: use one of monster, spell, item/);
		expect(why['Entry 6 (No Kind)']).toMatch(/needs a "kind"/);
		expect(why['Entry 7']).toMatch(/An entry is an object/);
		expect(why['Entry 8 (Half)']).toBe('Give "statblock", or "hp", "abilities", "cr"');
		expect(why['Entry 9 (Odd CR)']).toMatch(/"cr" should be a challenge rating/);
		expect(p.warnings).toEqual([{ at: 'Entry 10 (Extra)', reasons: ['"colour" isn\'t a field here, so it was left out'] }]);
		expect(packSummary(p)).toBe('2 entries: 1 spell, 1 feat · 8 left out');
	});
	it('is forgiving about numbers written as text, lists written as text, and a kind\'s case', () => {
		const p = readPack(pack({ entries: [{ kind: 'Spell', name: 'Loose', level: '2', school: 'evocation', castingTime: 'Action', range: 'Self', components: 'V', duration: '1 minute', desc: 'x', classes: 'Wizard, Bard' }] }), 'p.json', kindsFor);
		expect(p.entries[0].value).toMatchObject({ level: 2, school: 'Evocation', classes: ['Wizard', 'Bard'] });
	});
	it('checks nested lists, with where the problem is', () => {
		const c = checkEntry(KINDS_5E.find(k => k.kind === 'subclass')!, { name: 'S', class: 'Fighter', features: [{ level: 3, name: 'A', desc: 'x' }, { level: 'three', name: 'B' }] });
		expect(c.errors).toEqual(['"features" item 2: "level" should be a number', '"features" item 2: "desc" is missing']);
	});
});

describe('campaigns pick their packs (packs: on the home note)', () => {
	const a = readPack(pack({ pack: 'Alpha', entries: [] }), 'C/alpha.json', kindsFor);
	const b = readPack(pack({ pack: 'Beta', entries: [] }), 'C/beta-file.json', kindsFor);
	it('missing, all or true: every pack; none, false or []: none; a list: those, by name or file', () => {
		for (const s of [undefined, null, 'all', true]) expect(packsEnabled(s, [a, b])).toEqual([a, b]);
		for (const s of ['none', false, []]) expect(packsEnabled(s, [a, b])).toEqual([]);
		expect(packsEnabled(['beta'], [a, b])).toEqual([b]);
		expect(packsEnabled('Alpha, beta-file', [a, b])).toEqual([a, b]);
		expect(packsEnabled(['gamma'], [a, b])).toEqual([]);
	});
});

describe('5e takes the example pack whole, and puts it on top of the SRD', () => {
	const ex = readPack(EXAMPLE, 'Ember Vault/Content/5e-hearth-and-cinder.json', kindsFor);
	it('reads every entry, with nothing left out', () => {
		expect(ex.error).toBeUndefined();
		expect(ex.rejected).toEqual([]);
		expect(ex.warnings).toEqual([]);
		expect(ex.entries.map(e => `${e.kind}:${e.name}`)).toEqual(['subclass:Path of the Hearthguard', 'spell:Ember Lash', 'item:Lantern of Steady Light', 'feat:Kindler', 'monster:Cinder Hound']);
	});
	it('the subclass joins its SRD class, the spell and item are findable, a pack entry replaces the SRD\'s', () => {
		const c = content5e(ex.entries.map(e => ({ ...e, pack: ex.name })));
		expect(c.monsters.map(m => m.monster.name)).toEqual(['Cinder Hound']);
		expect(c.monsters[0].monster).toMatchObject({ cr: '1', hp: 27, source: 'Hearth and Cinder' });
		const before = allHits('2024').length;
		setContentLayer5e(() => c);
		const comp = compendium5e('2024');
		expect(comp.classes.find(k => k.name === 'Barbarian')!.subclasses.map(s => s.name)).toContain('Path of the Hearthguard');
		expect(findHit('2024', 'Ember Lash', 'spell')).toMatchObject({ kind: 'spell', spell: { level: 1, source: 'Hearth and Cinder' } });
		expect(findHit('2024', 'Path of the Hearthguard', 'subclass')).toMatchObject({ cls: { name: 'Barbarian' } });
		expect(allHits('2024').length).toBe(before + 4);
		// Same name as the SRD's: the pack's wins.
		setContentLayer5e(() => content5e([{ kind: 'spell', name: 'Fireball', pack: 'P', value: { name: 'Fireball', level: 3, school: 'Evocation', castingTime: 'Action', range: '150 feet', components: 'V', duration: 'Instantaneous', desc: 'Pack fireball.' } }]));
		expect(findHit('2024', 'Fireball', 'spell')).toMatchObject({ spell: { desc: 'Pack fireball.' } });
		expect(allHits('2024').filter(h => h.name === 'Fireball').length).toBe(1);
		setContentLayer5e(null);
		expect(findHit('2024', 'Ember Lash', 'spell')).toBeUndefined();
	});
});

describe('the published JSON Schema', () => {
	it('matches 5e\'s kinds (UPDATE_SCHEMAS=1 writes it again)', () => {
		const schema = `${JSON.stringify(packSchema({ system: '5e', title: 'Ember Vault content pack (5e)', editions: ['2024', '2014'], kinds: KINDS_5E }), null, '\t')}\n`;
		const file = 'docs/content/5e.schema.json';
		if (process.env.UPDATE_SCHEMAS) writeFileSync(file, schema);
		expect(readFileSync(file, 'utf8')).toBe(schema);
	});
});
