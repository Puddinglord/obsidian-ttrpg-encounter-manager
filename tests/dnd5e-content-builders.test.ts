// 5e's builders for your own character content: a class, a subclass, a feat,
// a species and a background, built through the drafts the builder edits.
// What they write is a pack entry that checks out with no warnings and reads
// back the same (as a ```5e-<kind> block), the spell slots follow the books'
// tables, and everything built works in New character, Level up and the
// sheet exactly like the SRD's: a hero is made and levelled with a built
// class, subclass, species, background and feat.
import { afterEach, describe, expect, it } from 'vitest';
import type EmberVaultPlugin from '../main';
import type { BuilderUI } from '../src/core/builder/frame';
import { SchemaBuilder } from '../src/core/builder/schema';
import { backgroundSchema, classSchema, featSchema, speciesSchema, subclassSchema } from '../src/systems/dnd5e/content-builders';
import type { Dnd5eRuntime } from '../src/systems/dnd5e/runtime';
import { readContentBlock } from '../src/core/content/blocks';
import { checkEntry, KindSpec } from '../src/core/content/spec';
import { toYaml } from '../src/core/yaml-lite';
import { readSheet5e } from '../src/systems/dnd5e/character';
import {
	applyLevelUp5e, asiLevels, characterFm, classOf, featIncrease, hasAsi, languageChoice, levelOptions, needsSubclass, newCharacter5e, newLevelUp5e, optionGroups, speciesChoices,
	spellCount, subclassLevel,
} from '../src/systems/dnd5e/character-draft';
import { settle } from '../src/systems/dnd5e/character-wizard';
import { compendium5e, setContentLayer5e } from '../src/systems/dnd5e/compendium';
import { content5e, KINDS_5E } from '../src/systems/dnd5e/content';
import {
	atLevel, casterOf, Class5eDraft, fromBackgroundEntry, fromClassEntry, fromFeatEntry, fromSpeciesEntry, fromSubclassEntry, levelBrief, newBackground5e, newClass5e, newFeat5e, newFeature5e,
	newSpecies5e, newSubclass5e, newSubspecies5e, slotsFor, spellColumns, subclassLevelsFor, toBackgroundEntry, toClassEntry, toFeatEntry, toSpeciesEntry, toSteps, toSubclassEntry,
} from '../src/systems/dnd5e/content-draft';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';
import { resources5e } from '../src/systems/dnd5e/sheet-actions';

afterEach(() => setContentLayer5e(null));
const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
const kind = (k: string) => KINDS_5E.find(x => x.kind === k) as KindSpec;

/** An entry checks out as its kind, with nothing left out, and reads back from its block the same. */
function writes(k: string, entry: Record<string, unknown>): Record<string, unknown> {
	const checked = checkEntry(kind(k), entry);
	expect(checked.errors, `${k} errors`).toEqual([]);
	expect(checked.warnings, `${k} warnings`).toEqual([]);
	const read = readContentBlock(kind(k), toYaml(entry));
	expect(read.errors).toEqual([]);
	expect(read.warnings).toEqual([]);
	expect(read.entry?.value).toEqual(entry);
	return entry;
}
const use = (entries: { kind: string; value: Record<string, unknown> }[]) =>
	setContentLayer5e(() => content5e(entries.map(e => ({ kind: e.kind, name: String(e.value.name), value: e.value, pack: 'Homebrew' }))));

/** A class with a bit of everything: options, a column of uses, a resource, spells like a Ranger's, a subclass at 3. */
function hearthWarden(ed: Dnd5eEdition): Class5eDraft {
	const d = newClass5e(ed);
	Object.assign(d, {
		name: 'Hearth Warden', hitDie: 10, primary: ['STR', 'WIS'], saves: ['STR', 'WIS'], armor: ['Light Armor', 'Medium Armor', 'Shields'], weapons: ['Simple Weapons', 'Martial Weapons'],
		tools: 'Cook\'s Utensils', skillCount: 2, skillFrom: ['Athletics', 'Insight', 'Medicine', 'Survival'],
		equipment: [{ options: [{ items: 'Chain Mail, Longsword, Shield, 2 Javelin', gold: 5 }, { items: '', gold: 100 }] }],
		toolCount: 1, toolFrom: ['Smith\'s Tools', 'Woodcarver\'s Tools'],
		castAbility: 'WIS', caster: 'half', spellList: 'Ranger', spellsLike: 'Ranger', spellsKnown: true,
		subclassTitle: 'Warden Circle', subclassLevels: ['3', '7', '11', '15'],
	});
	d.features = [
		{ ...newFeature5e(1), name: 'Hearthfire', desc: 'As a Bonus Action, you kindle a warding flame around an ally.' },
		{ ...newFeature5e(1), name: 'Warding Style', desc: 'Choose your style.', choose: 2, more: ['10'], options: [
			{ name: 'Ember Guard', desc: 'Attacks against the warmed ally have Disadvantage.' }, { name: 'Ash Step', desc: 'You teleport to the warmed ally.' }, { name: 'Kindle', desc: 'Fire damage +2.' },
		] },
		{ ...newFeature5e(5), name: 'Extra Attack', desc: 'You attack twice.' },
	];
	d.columns = [{ label: 'Coals', uses: true, steps: { 2: 2, 6: 3, 14: 4 } }];
	d.resources = [{ name: 'Hearthfire', uses: 'WIS', min1: true, reset: 'long', shortFrom: 5, shortOne: false }];
	return d;
}

describe('the drafts write entries that check out and read back the same', () => {
	it.each(EDITIONS)('%s: a class, every field, as a block and back', (ed) => {
		const entry = writes('class', toClassEntry(hearthWarden(ed)));
		expect(entry).toMatchObject({
			name: 'Hearth Warden', hitDie: 10, primary: 'Strength and Wisdom', saves: ['STR', 'WIS'], spellcasting: 'WIS', spellList: 'Ranger',
			proficiencies: ['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons', 'Cook\'s Utensils'],
			skillChoice: ed === '2024' ? 'Choose 2: Athletics, Insight, Medicine, or Survival' : 'Choose two from Athletics, Insight, Medicine, and Survival',
			toolChoices: { count: 1, from: ['Smith\'s Tools', 'Woodcarver\'s Tools'] }, subclassTitle: 'Warden Circle', subclassLevels: [3, 7, 11, 15],
			resources: [{ name: 'Hearthfire', uses: 'Wisdom modifier', min: 1, shortFrom: 5 }],
		});
		const levels = entry.levels as { level: number; pb: number; features: string[]; slots?: number[]; prepared?: number; extra?: Record<string, number> }[];
		expect(levels.map(l => l.pb)).toEqual([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
		expect(levels[0].features).toEqual(ed === '2024' ? ['Spellcasting', 'Hearthfire', 'Warding Style'] : ['Hearthfire', 'Warding Style']);
		expect(levels[2].features).toEqual(['Warden Circle']);
		expect(levels[6].features).toEqual([ed === '2024' ? 'Subclass feature' : 'Warden Circle feature']);
		expect(levels[3].features).toEqual(['Ability Score Improvement']);
		expect(levels[9].features).toEqual(['Warding Style']);
		expect(levels[18].features).toEqual([ed === '2024' ? 'Epic Boon' : 'Ability Score Improvement']);
		expect(levels[0].extra).toBeUndefined();
		expect([2, 5, 6, 20].map(l => levels[l - 1].extra?.coals_uses)).toEqual([2, 2, 3, 4]);
		// Half-caster slots, as the Ranger's table has them (2014 from level 2).
		const ranger = classOf(ed, 'Ranger')!;
		for (const l of [1, 2, 5, 9, 17, 20]) expect(levels[l - 1].slots ?? [], `slots at ${l}`).toEqual((ranger.levels[l - 1].slots ?? []).slice(0, (levels[l - 1].slots ?? []).length));
		// Its options carry their group, and the feature says how many.
		const features = entry.features as { level: number; name: string; group?: string; choose?: number }[];
		expect(features.find(f => f.name === 'Warding Style')?.choose).toBe(2);
		expect(features.filter(f => f.group === 'Warding Style').map(f => f.name)).toEqual(['Ember Guard', 'Ash Step', 'Kindle']);
		// Read back, it's the same draft: written again, the same entry.
		const back = fromClassEntry(entry, ed);
		expect(back.features.map(f => [f.name, f.options.length, f.choose, f.more])).toEqual([['Hearthfire', 0, undefined, []], ['Warding Style', 3, 2, ['10']], ['Extra Attack', 0, undefined, []]]);
		expect(back.spellsLike).toBe('Ranger');
		expect(back.caster).toBe('half');
		expect(back.columns.map(c => [c.label, c.uses, atLevel(c.steps, 7)])).toEqual([['Coals', true, 3]]);
		expect(toClassEntry(back)).toEqual(entry);
	});

	it.each(EDITIONS)('%s: a subclass, a feat, a species and a background', (ed) => {
		const sub = newSubclass5e(ed, 'Cleric');
		Object.assign(sub, { name: 'Hearth Domain', desc: 'Keepers of the home fire.' });
		sub.features[0] = { ...sub.features[0], name: 'Warm Welcome', desc: 'Allies near you have Advantage on saves against being Frightened.' };
		sub.spells = [{ level: subclassLevelsFor(classOf(ed, 'Cleric'))[0], spells: ['Burning Hands', 'Sanctuary'] }];
		const s = writes('subclass', toSubclassEntry(sub));
		expect(s).toMatchObject({ name: 'Hearth Domain', class: 'Cleric', features: [{ name: 'Warm Welcome' }] });
		expect(toSubclassEntry(fromSubclassEntry(s, ed))).toEqual(s);

		const feat = { ...newFeat5e(ed), name: 'Kindler', increase: ['CON', 'WIS'], repeatable: true, desc: 'You light a fire with a word.' };
		const f = writes('feat', toFeatEntry(feat));
		expect(f).toMatchObject({ name: 'Kindler', increase: ['CON', 'WIS'], repeatable: true, ...(ed === '2024' ? { type: 'general', prerequisite: 'Level 4+' } : {}) });
		expect(toFeatEntry(fromFeatEntry(f, ed))).toEqual(f);

		const sp = { ...newSpecies5e(ed), name: 'Emberfolk', size: 'Small', speed: 30, darkvision: 60, traits: [{ name: 'Warm Blood', desc: 'You have Resistance to Cold damage.' }], skillCount: 1, skillFrom: ['Arcana', 'Survival'], cantripFrom: ['Fire Bolt', 'Produce Flame'], bonuses: (ed === '2014' ? { CON: 2, WIS: 1 } : {}) as Record<string, number>, languages: ed === '2014' ? ['Common', 'Ignan'] : [] };
		sp.subspecies = [{ ...newSubspecies5e(), name: ed === '2014' ? 'Deep Emberfolk' : 'Ember Lineage: Deep', traits: [{ name: 'Soot', desc: 'You blend into smoke.' }], skills: ['Stealth'] }];
		const spe = writes('species', toSpeciesEntry(sp));
		expect((spe.traits as { name: string }[])[0].name).toBe('Darkvision');
		if (ed === '2014') expect(spe.abilityBonuses).toBe('CON +2, WIS +1');
		const spBack = fromSpeciesEntry(spe, ed);
		expect(spBack.darkvision).toBe(60);
		expect(toSpeciesEntry(spBack)).toEqual(spe);

		const bg = { ...newBackground5e(ed), name: 'Lamplighter', skills: ['Perception', 'Stealth'], tools: ['Tinker\'s Tools'], items: 'Tinker\'s Tools, Traveler\'s Clothes, 2 Oil', gold: 10 };
		if (ed === '2024') Object.assign(bg, { abilities: ['WIS', 'DEX', 'CON'], feat: 'Alert' });
		else Object.assign(bg, { languageCount: 1, featureName: 'Lamp Lore', featureDesc: 'You know every lamp on every street.' });
		const b = writes('background', toBackgroundEntry(bg));
		expect(b).toMatchObject({ name: 'Lamplighter', proficiencies: ['Skill: Perception', 'Skill: Stealth', 'Tool: Tinker\'s Tools'] });
		expect(toBackgroundEntry(fromBackgroundEntry(b, ed))).toEqual(b);
	});

	it('an entry typed by hand keeps the fields the builder doesn\'t edit', () => {
		const typed = { name: 'Odd One', hitDie: 8, saves: ['DEX', 'INT'], features: [{ level: 1, name: 'Odd', desc: 'Odd things.' }], levels: [{ level: 1, pb: 2, features: ['Odd'] }], subclasses: [{ name: 'Odder', features: [] }] };
		const out = toClassEntry(fromClassEntry(typed, '2024'));
		expect(out.subclasses).toEqual([{ name: 'Odder', features: [] }]);
		expect((out.features as { name: string }[]).map(f => f.name)).toContain('Odd');
	});
});

describe('the numbers the books work out', () => {
	it.each(EDITIONS)('%s: full, half and pact casters\' slots are the SRD\'s Wizard, Paladin and Warlock tables', (ed) => {
		const c = compendium5e(ed);
		const table = (name: string) => c.classes.find(x => x.name === name)!.levels;
		expect(casterOf(table('Wizard'), ed)).toBe('full');
		expect(casterOf(table('Bard'), ed)).toBe('full');
		expect(casterOf(table('Paladin'), ed)).toBe('half');
		expect(casterOf(table('Ranger'), ed)).toBe('half');
		expect(casterOf(table('Warlock'), ed)).toBe('pact');
		expect(casterOf(table('Fighter'), ed)).toBe('');
		// A third caster: 2 first-level slots at 3, 3 at 4, second-level at 7, fourth-level at 19.
		expect([3, 4, 7, 19].map(l => slotsFor('third', ed, l)!.filter(Boolean))).toEqual([[2], [3], [4, 2], [4, 3, 3, 1]]);
		expect(slotsFor('third', ed, 2)).toBeUndefined();
	});
	it('spells like an SRD class: its cantrips and its spells known (2014) or prepared (2024)', () => {
		expect(spellColumns('2024', 'Cleric')!.prepared.slice(0, 5)).toEqual([4, 5, 6, 7, 9]);
		expect(spellColumns('2024', 'Cleric')!.cantrips.slice(0, 4)).toEqual([3, 3, 3, 4]);
		expect(spellColumns('2014', 'Sorcerer')!.prepared[0]).toBe(2);
		expect(toSteps([0, 2, 2, 3, 3])).toEqual({ 2: 2, 4: 3 });
		expect([1, 2, 3, 4, 20].map(l => atLevel({ 2: 2, 4: 3 }, l))).toEqual([0, 2, 2, 3, 3]);
	});
	it('the check says what a level grants', () => {
		const d = hearthWarden('2024');
		expect(levelBrief(d, 1)).toMatchObject({ pb: 2, features: ['Spellcasting', 'Hearthfire', 'Warding Style'], options: [{ group: 'Warding Style', count: 2 }], slots: [2, 0, 0, 0, 0, 0, 0, 0, 0] });
		expect(levelBrief(d, 3)).toMatchObject({ subclass: 'choose' });
		expect(levelBrief(d, 4)).toMatchObject({ increase: 'asi' });
		expect(levelBrief(d, 10)).toMatchObject({ options: [{ group: 'Warding Style', count: 1 }] });
		expect(levelBrief(d, 19)).toMatchObject({ increase: 'epic' });
		expect(levelBrief(d, 6).columns).toEqual([{ label: 'Coals', value: 3, uses: true }]);
	});
});

// ----------------------------------------------------------------------------
// Everything built works like the SRD's

describe.each(EDITIONS)('a hero made and levelled with built content (%s)', (ed) => {
	it('New character and Level up read the built class, subclass, species, background and feat', () => {
		const cls = toClassEntry(hearthWarden(ed));
		const subDraft = newSubclass5e(ed);
		use([{ kind: 'class', value: cls }]);
		Object.assign(subDraft, { className: 'Hearth Warden', name: 'Circle of Embers' });
		subDraft.features = subclassLevelsFor(classOf(ed, 'Hearth Warden')).map(l => ({ ...newFeature5e(l), name: `Ember Rite ${l}`, desc: `At level ${l}, the embers answer.` }));
		expect(subDraft.features.map(f => f.level)).toEqual([3, 7, 11, 15]);
		subDraft.spells = [{ level: 3, spells: ['Burning Hands'] }, { level: 5, spells: ['Flaming Sphere'] }];
		subDraft.resources = [{ name: 'Ember Burst', uses: 'PB', min1: false, reset: 'short', shortOne: false }];
		const sub = toSubclassEntry(subDraft);
		const feat = toFeatEntry({ ...newFeat5e(ed), name: 'Kindler', increase: ['WIS'], desc: 'You light a fire with a word.' });
		const species = toSpeciesEntry({ ...newSpecies5e(ed), name: 'Emberfolk', darkvision: 60, traits: [{ name: 'Warm Blood', desc: 'Cold Resistance.' }], skillCount: 1, skillFrom: ['Arcana', 'Survival'], languages: ed === '2014' ? ['Common', 'Ignan'] : [], bonuses: (ed === '2014' ? { WIS: 2, CON: 1 } : {}) as Record<string, number> });
		const bg = toBackgroundEntry({ ...newBackground5e(ed), name: 'Lamplighter', skills: ['Perception', 'Stealth'], tools: ['Tinker\'s Tools'], items: 'Traveler\'s Clothes, 2 Oil', gold: 10, ...(ed === '2024' ? { abilities: ['WIS', 'DEX', 'CON'], feat: 'Alert' } : { languageCount: 1, featureName: 'Lamp Lore', featureDesc: 'Every lamp.' }) });
		use([{ kind: 'class', value: cls }, { kind: 'subclass', value: sub }, { kind: 'feat', value: feat }, { kind: 'species', value: species }, { kind: 'background', value: bg }]);
		const k = classOf(ed, 'Hearth Warden')!;
		expect(k.subclasses.map(s => s.name)).toContain('Circle of Embers');
		expect(subclassLevel(k)).toBe(3);
		expect(asiLevels(k)).toEqual(ed === '2024' ? [4, 8, 12, 16, 19] : [4, 8, 12, 16, 19]);

		// New character at level 1.
		const d = { ...newCharacter5e(ed, { name: 'Tess' }), className: 'Hearth Warden', species: 'Emberfolk', background: 'Lamplighter' };
		settle(d);
		expect(speciesChoices(d).skillChoices).toEqual({ count: 1, from: ['Arcana', 'Survival'] });
		d.skills = ['Athletics', 'Insight'];
		d.speciesSkills = ['Arcana'];
		d.tools = ['Smith\'s Tools'];
		if (ed === '2014') d.languages = languageChoice(d).from.slice(0, 1);
		expect(optionGroups(k, '', 1)).toEqual([{ group: 'Warding Style', count: 2, from: ['Ember Guard', 'Ash Step', 'Kindle'] }]);
		d.choices = ['Ember Guard', 'Kindle'];
		d.cantrips = [];
		const fm = characterFm(d);
		expect(fm).toMatchObject({ class: 'Hearth Warden', [ed === '2014' ? 'race' : 'species']: 'Emberfolk', background: 'Lamplighter', choices: ['Ember Guard', 'Kindle'] });
		expect(fm.skills).toEqual(expect.arrayContaining(['Perception', 'Stealth', 'Arcana', 'Athletics', 'Insight']));
		expect(fm.tools).toEqual(expect.arrayContaining(['Cook\'s Utensils', 'Tinker\'s Tools', 'Smith\'s Tools']));
		expect((fm.inventory as { name: string }[]).map(i => i.name)).toEqual(expect.arrayContaining(['Chain Mail', 'Longsword', 'Shield', 'Javelin', 'Traveler\'s Clothes', 'Oil']));
		let sheet = readSheet5e(fm, ed, 'Tess');
		expect(sheet.hitDie).toBe(10);
		expect(sheet.saves.str.proficient && sheet.saves.wis.proficient).toBe(true);
		expect(sheet.features.map(f => f.name)).toEqual(expect.arrayContaining(['Hearthfire', 'Warding Style', 'Ember Guard', 'Kindle', 'Darkvision', 'Warm Blood']));
		expect(sheet.features.map(f => f.name)).not.toContain('Ash Step');
		expect(sheet.spellcasting?.ability).toBe('wis');
		expect(resources5e(sheet).map(r => r.name)).toContain('Hearthfire');
		if (ed === '2024') expect(spellCount(ed, k, 1, sheet.scores)?.count).toBe(2);

		// Level up to 10: Coals at 2, the subclass and its spells at 3, Kindler at 4, Extra Attack at 5, one more style at 10.
		for (let l = 2; l <= 10; l++) {
			const up = newLevelUp5e(fm, ed, 'Tess');
			expect(up.level).toBe(l);
			expect(needsSubclass(up)).toBe(l === 3);
			if (needsSubclass(up)) up.subclass = 'Circle of Embers';
			expect(hasAsi(up)).toBe(l === 4 || l === 8);
			if (l === 4) { up.asi = 'feat'; up.feat = 'Kindler'; up.featUp = featIncrease(ed, 'Kindler')[0]; }
			const opts = levelOptions(up);
			if (l === 10) expect(opts).toEqual([{ group: 'Warding Style', count: 1, from: ['Ash Step'] }]);
			up.choices = opts.flatMap(g => g.from.slice(0, g.count));
			applyLevelUp5e(fm, up);
		}
		sheet = readSheet5e(fm, ed, 'Tess');
		expect(sheet.level).toBe(10);
		expect(sheet.subclass).toBe('Circle of Embers');
		expect(fm.feats).toContain('Kindler');
		expect(fm.choices).toEqual(['Ember Guard', 'Kindle', 'Ash Step']);
		expect(fm.spells).toEqual(expect.arrayContaining(['Burning Hands', 'Flaming Sphere']));
		expect(sheet.features.map(f => f.name)).toEqual(expect.arrayContaining(['Extra Attack', 'Ember Rite 3', 'Ember Rite 7', 'Kindler']));
		const res = resources5e(sheet);
		expect(res.find(r => r.name === 'Coals')?.max).toBe(3);
		expect(res.find(r => r.name === 'Ember Burst')).toMatchObject({ max: 4, per: 'short' });
		expect(res.find(r => r.name === 'Hearthfire')?.per).toBe('short');
		expect(sheet.slots.map(s => s.max)).toEqual(classOf(ed, 'Ranger')!.levels[9].slots!.filter(Boolean));
	});
});

// ----------------------------------------------------------------------------
// The builders drawn by core's schema engine, driven like a user

const app = { workspace: { getActiveFile: () => null }, metadataCache: { getFirstLinkpathDest: () => null }, vault: { getAbstractFileByPath: () => null } };
const plugin = { app, campaigns: { active: null }, content: { folder: () => 'Ember Vault/Content' }, systems: { get: () => ({ content: { kinds: KINDS_5E, blocks: { prefix: '5e', folder: '5e', kinds: [] } } }) } } as unknown as EmberVaultPlugin;
const rt = (ed: Dnd5eEdition) => ({ plugin, edition: () => ed, cardOptions: () => ({ app, sourcePath: '' }) }) as unknown as Dnd5eRuntime;
function harness<M extends Record<string, unknown>>(b: SchemaBuilder<M>) {
	let lives: (() => void)[] = [];
	const panel = document.createElement('div');
	let step = b.steps()[0].id;
	const ui: BuilderUI = { plugin, sourcePath: '', phone: false, changed: () => lives.forEach(f => f()), rebuild: () => draw(step), live: (f) => { lives.push(f); f(); }, go: () => {}, nudge: () => {} };
	const draw = (id: string) => { step = id; lives = []; panel.empty(); b.renderStep(id, panel, ui); };
	return { ui, panel, draw };
}

describe.each(EDITIONS)('the content builders drawn by the schema engine (%s)', (ed) => {
	const schemas = { class: classSchema, subclass: subclassSchema, feat: featSchema, species: speciesSchema, background: backgroundSchema } as const;
	it.each(Object.keys(schemas) as (keyof typeof schemas)[])('%s: every step draws, the check and preview draw, and Create writes a block that checks out', (k) => {
		const b = new SchemaBuilder(plugin, schemas[k](rt(ed)) as never, { edition: ed }) as SchemaBuilder<Record<string, unknown>>;
		expect(b.draft.edition).toBe(ed);
		b.draft.name = 'Built Thing';
		if (k === 'feat') b.draft.desc = 'It does a thing.';
		const h = harness(b);
		for (const s of b.steps()) { h.draw(s.id); expect(h.panel.querySelectorAll('.eb-field').length, s.id).toBeGreaterThan(0); }
		const check = document.createElement('div');
		b.renderCheck(check, h.ui);
		expect(check.querySelector('.eb-check-value')?.textContent).toBe('Built Thing');
		const out = b.output();
		expect(out.lang).toBe(`5e-${k}`);
		expect(out.folder).toBe(`Ember Vault/Content/5e/${({ class: 'Classes', subclass: 'Subclasses', feat: 'Feats', species: 'Species', background: 'Backgrounds' })[k]}`);
		const read = readContentBlock(kind(k), out.body);
		expect(read.errors).toEqual([]);
		expect(read.warnings).toEqual([]);
		expect(b.missing()).toBeNull();
	});
	it('class: saves stop at two; a spellcasting ability brings a full caster\'s slots; the check\'s level strip moves the level shown', () => {
		const b = new SchemaBuilder(plugin, classSchema(rt(ed)), { edition: ed });
		const h = harness(b);
		h.draw('class');
		const saves = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-key="saves"] .eb-pick')];
		saves.slice(0, 3).forEach(p => p.click());
		expect(b.draft.saves).toEqual(['STR', 'DEX']);
		expect(saves[2].disabled).toBe(true);
		b.draft.castAbility = 'WIS';
		h.draw('spells');
		expect(b.draft.caster).toBe('full');
		const check = document.createElement('div');
		b.renderCheck(check, h.ui);
		expect(check.querySelectorAll('.dnd5e-cb-level').length).toBe(20);
		check.querySelectorAll<HTMLButtonElement>('.dnd5e-cb-level')[4].click();
		expect(b.draft.levelAt).toBe(5);
		const again = document.createElement('div');
		b.renderCheck(again, h.ui);
		expect(again.textContent).toMatch(/What level 5 grants[\s\S]*Slots\s*4·3·2/);
	});
	it('an Edit seed reopens a block\'s fields as they were written', () => {
		const entry = toClassEntry(hearthWarden(ed));
		const b = new SchemaBuilder(plugin, classSchema(rt(ed)), { entry });
		expect(b.draft.name).toBe('Hearth Warden');
		expect(toYaml(toClassEntry(b.draft))).toBe(toYaml(entry));
	});
});
