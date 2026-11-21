// The guided builders for a hero's content (entity-content.ts): each kind
// built through the builder's model is a block a person could have typed, that
// reads back with nothing wrong and edits back to itself; what's missing is
// said in the builder's words; a class's levels say what Level up will ask;
// and a hero made from a built class, subclass, ancestry and background levels
// 1 → 5 with its dice, states, uses and picks on the class panel.
import { describe, expect, it } from 'vitest';
import { readContentBlock, HOMEBREW } from '../src/core/content/blocks';
import { contentNimble, KINDS_NIMBLE, mergeNimbleData } from '../src/systems/nimble/content';
import { Compendium, CompendiumData, LevelFeatures } from '../src/systems/nimble/compendium';
import {
	addBookRhythm, CONTENT_KINDS, ContentKind, cleanEntry, Draft, draftMissing, draftProblems, entryBody, fromEntry, levelRow, levelRows, newDraft,
	optionLevels, setSubclassLevel, setTierLevel, subclassLevelOf, tierLevels, withDraft,
} from '../src/systems/nimble/entity-content';
import { readCharacter } from '../src/systems/nimble/character-def';
import { applyLevelChoices, increaseKey, levelPlans, noChoices } from '../src/systems/nimble/level-plan';
import { newCharacterFrontmatter } from '../src/systems/nimble/new-character';
import { classPanelRows } from '../src/systems/nimble/class-panel-def';
import BOOKS from '../src/systems/nimble/data/compendium.json';

const books = BOOKS as unknown as CompendiumData;
const spec = (k: ContentKind) => KINDS_NIMBLE.find(x => x.kind === k)!;
/** The block a builder writes, read back the way the content folder reads it. */
const read = (k: ContentKind, d: Draft) => readContentBlock(spec(k), entryBody(k, d));

// ----------------------------------------------------------------------------
// The class, built the way the builder's steps build it

function buildClass(): Draft {
	const d = newDraft('class');
	// Start
	Object.assign(d, { name: 'Lanternkeeper', tagline: 'Carries the light into the dark.', motif: 'Mage', hitDie: 8 });
	// Stats: key stats tapped, ▲ and ▼ saves, Skilled Hero
	d.keyStats = ['WIL', 'DEX'];
	d.saves = { adv: 'WIL', dis: 'STR' };
	d.skillMods = { Perception: 2, Might: -1, Lore: 0 };
	// Gear
	Object.assign(d, { armor: 'Leather Armor', weapons: 'DEX Weapons', startingGear: ['Dagger', 'Rope (50 ft.)'] });
	// Magic: mana from level 2, Fire, tiers at 2 and 4
	d.casting = { mana: 'WIL+LVL', manaFormula: 'WIL+LVL', manaFromLevel: 2, schools: ['Fire'] };
	setTierLevel(d, 1, 2);
	setTierLevel(d, 2, 4);
	// Resources: dice of its own, a pool with its own button, a state and a target
	d.resources = [
		{ name: 'Wick Dice', max: '2', die: 'd6', reset: 'Safe Rest', dice: { rolled: 'gained', addTo: ['attack', 'spell'], use: 'all', keep: true, onWhile: 'Kindled', gain: 1, gainLabel: 'Kindle', byLevel: [{ level: 5, die: 'd8' }], maxSteps: [{ level: 3, add: 1, subclass: 'Hooded Lantern' }] } },
		{ name: 'Oil', max: '3×LVL', reset: 'Safe Rest', spend: 'Pour' },
	];
	d.states = [{ name: 'Kindle', condition: 'Kindled', feature: 'Kindle' }];
	d.target = { name: 'Lit Quarry', feature: 'Spotlight' };
	// Levels
	levelRow(d, 1)!.features = [
		{ name: 'Kindle', text: 'As an action, you become Kindled until the end of the encounter.' },
		{ name: 'Spotlight', text: 'Mark one creature you can see. It can\'t hide from you.', uses: 'WIL' },
	];
	levelRow(d, 2, true)!.features.push({ name: 'Wick Lore', text: 'You learn the old wick-craft.', choose: { from: ['Wicks'], count: 1 } });
	setSubclassLevel(d, 3);
	levelRow(d, 4, true)!.features.push({ name: 'Steady Hand', text: 'Your hands don\'t shake.', increase: { stats: ['WIL', 'DEX'] } });
	levelRow(d, 5, true)!.features.push({ name: 'Ember Lore', text: 'You pick up a little fire magic.', learn: [{ kind: 'utility', from: ['Fire'], count: 1 }] });
	// Options
	d.optionGroups = [{ name: 'Wicks', intro: 'Choose from these.', options: [{ name: 'Red Wick', cost: 'Passive', text: 'Your light is red.' }, { name: 'Long Wick', cost: '1 Action', text: 'Your light lasts all night.' }] }];
	return d;
}

function buildSubclass(): Draft {
	const d = newDraft('subclass', { className: 'Lanternkeeper' });
	Object.assign(d, { name: 'Hooded Lantern', flavor: 'Light only where you want it.' });
	levelRow(d, 3)!.features = [{ name: 'Shutter', text: 'You can hide your light as a free action.' }];
	levelRow(d, 5, true)!.features.push({ name: 'Hood Lore', text: 'You learn a hood.', choose: { from: ['Hoods'] } });
	d.optionGroups = [{ name: 'Hoods', options: [{ name: 'Iron Hood', text: 'Your light can\'t be put out.' }] }];
	return d;
}

const buildAncestry = (): Draft => ({ ...newDraft('ancestry'), name: 'Wickfolk', size: 'Small', rarity: 'uncommon', traits: [{ name: 'Glow', text: 'You shed dim light 2 spaces around you.' }] });
const buildBackground = (): Draft => ({ ...newDraft('background'), name: 'Lamplighter', text: 'You walked the streets lighting lamps.', requirement: 'Req. 0+ WIL.' });
const buildBoon = (): Draft => ({ ...newDraft('boon'), name: 'Undying Light', type: 'epic', text: 'Once a day, when you would drop to 0 HP, drop to 1 instead.' });
const buildOption = (): Draft => ({ ...newDraft('option', { className: 'Lanternkeeper', group: 'Wicks' }), name: 'Blue Wick', cost: 'Reaction', text: 'Your light turns cold.' });

const BUILT: Record<ContentKind, () => Draft> = { class: buildClass, subclass: buildSubclass, option: buildOption, ancestry: buildAncestry, background: buildBackground, boon: buildBoon };

describe('every kind built through the builder is a block a person could type', () => {
	it.each(CONTENT_KINDS)('%s: reads back with nothing wrong, and editing it changes nothing', (k) => {
		const d = BUILT[k]();
		const r = read(k, d);
		expect(r.errors, k).toEqual([]);
		expect(r.warnings, k).toEqual([]);
		expect(draftProblems(k, d)).toEqual([]);
		// Opened again in the builder (the Edit pencil), it writes the same block.
		expect(entryBody(k, fromEntry(k, r.value))).toBe(entryBody(k, d));
	});
	it('writes plain YAML in the kind\'s field order, blanks left out', () => {
		const body = entryBody('class', buildClass());
		expect(body.split('\n').filter(l => /^\w/.test(l)).map(l => l.split(':')[0])).toEqual([
			'name', 'tagline', 'motif', 'keyStats', 'hitDie', 'startingHp', 'saves', 'skillMods', 'armor', 'weapons', 'startingGear', 'casting', 'resources', 'states', 'target', 'levels', 'optionGroups',
		]);
		expect(body).toMatch(/^name: Lanternkeeper\ntagline: Carries the light into the dark\.\nmotif: Mage\nkeyStats: \[WIL, DEX\]\nhitDie: 8\nstartingHp: 13\nsaves:\n {2}adv: WIL\n {2}dis: STR\nskillMods:\n {2}Perception: 2\n {2}Might: -1\n/);
		expect(body).toMatch(/\n {2}- name: Wick Dice\n {4}max: 2\n/);
		expect(entryBody('boon', buildBoon())).toBe('name: Undying Light\ntype: epic\ntext: Once a day, when you would drop to 0 HP, drop to 1 instead.');
	});
	it('a new draft is empty until filled in: blank rows and a level with nothing in it are left out', () => {
		expect(cleanEntry('ancestry', newDraft('ancestry'))).toEqual({ size: 'Medium', rarity: 'common' });
		const d = newDraft('class');
		levelRow(d, 9, true);
		expect(cleanEntry('class', d).levels).toEqual([{ level: 3, features: [{ name: 'Subclass', text: 'Choose a subclass.' }] }]);
	});
	it('keeps what it doesn\'t show: a block\'s subclasses, FAQ and page stay as they were', () => {
		const typed = { ...cleanEntry('class', buildClass()), faq: [{ q: 'Why?', a: 'Light.' }], page: 4, subclasses: [{ name: 'Inline', levels: [{ level: 3, features: [{ name: 'A', text: 'B' }] }] }] };
		const d = fromEntry('class', typed);
		d.tagline = 'A new line.';
		expect(cleanEntry('class', d)).toMatchObject({ tagline: 'A new line.', faq: typed.faq, page: 4, subclasses: typed.subclasses });
	});
});

describe('what\'s missing, in the builder\'s words, with the step to fix it on', () => {
	it('a new class', () => {
		expect(draftProblems('class', newDraft('class'))).toEqual([
			{ text: 'Give it a name.', step: 'start' },
			{ text: 'Pick its key stats.', step: 'stats' },
			{ text: 'Pick a ▲ save and a ▼ save.', step: 'stats' },
		]);
		const d = buildClass();
		levelRow(d, 4)!.features.push({ name: 'Half', text: '' });
		expect(draftMissing('class', d)).toBe('Level 4: a feature needs its text.');
	});
	it('a subclass, an option, a trait', () => {
		expect(draftProblems('subclass', { ...newDraft('subclass'), name: 'X' }).map(p => p.text)).toEqual(['Pick the class it\'s for.', 'Give it a feature.']);
		expect(draftProblems('option', { ...newDraft('option'), name: 'X', class: 'Berserker' }).map(p => p.text)).toEqual(['Pick or name its list.', 'Write what it does.']);
		expect(draftProblems('ancestry', { ...buildAncestry(), traits: [{ name: 'Glow', text: '' }] })).toEqual([{ text: 'A trait needs its text.', step: 'traits' }]);
	});
});

describe('a class\'s levels as the builder edits them', () => {
	it('the subclass level moves its feature; spell tiers are features with their tier', () => {
		const d = buildClass();
		expect(subclassLevelOf(d)).toBe(3);
		setSubclassLevel(d, 5);
		expect(subclassLevelOf(d)).toBe(5);
		expect(levelRow(d, 3)).toBeUndefined();
		expect([...tierLevels(d)]).toEqual([[1, 2], [2, 4]]);
		setTierLevel(d, 2, 6);
		expect([...tierLevels(d)]).toEqual([[1, 2], [2, 6]]);
		expect(levelRow(d, 6)!.features).toEqual([{ name: 'Tier 2 Spells', text: 'You may now cast spells up to tier 2.', spellTier: 2 }]);
		setTierLevel(d, 2, undefined);
		expect([...tierLevels(d)]).toEqual([[1, 2]]);
	});
	it('the books\' rhythm: subclass features, stat increases from the key stats, an Epic Boon', () => {
		const d = buildClass();
		addBookRhythm(d);
		const at = (lv: number) => levelRow(d, lv)?.features.map(f => f.name);
		expect(at(7)).toEqual(['Subclass']);
		expect(at(8)).toEqual(['Key Stat Increase']);
		expect(levelRow(d, 8)!.features[0].text).toBe('+1 WIL or DEX.');
		expect(levelRow(d, 9)!.features[0].text).toBe('+1 STR or INT.');
		expect(levelRow(d, 19)!.features[0]).toMatchObject({ name: 'Epic Boon', boon: 'epic' });
		// Once is enough.
		const n = JSON.stringify(d.levels);
		addBookRhythm(d);
		expect(JSON.stringify(d.levels)).toBe(n);
	});
	it('the check says what each level grants, as Level up will ask it', () => {
		const { comp } = withDraft(books, 'class', buildClass());
		const rows = Object.fromEntries(levelRows(comp, 'Lanternkeeper').map(r => [r.level, r.grants.map(g => `${g.kind}:${g.text}`)]));
		expect(rows[1]).toEqual(['feature:Kindle', 'feature:Spotlight', 'uses:Spotlight: uses per Safe Rest', 'die:Wick Dice: d6', 'state:Kindle', 'target:Lit Quarry']);
		expect(rows[2]).toEqual(['feature:Tier 1 Spells', 'feature:Wick Lore', 'pick:Choose 1 · Wicks', 'tier:Tier 1 spells', 'mana:Mana']);
		expect(rows[3]).toEqual(['subclass:Choose a subclass']);
		expect(rows[4]).toEqual(['feature:Tier 2 Spells', 'feature:Steady Hand', 'stat:+1 WIL or DEX', 'tier:Tier 2 spells']);
		expect(rows[5]).toEqual(['feature:Ember Lore', 'spell:1 Utility Spell (Fire)', 'die:Wick Dice: d8']);
	});
	it('a subclass\'s check: only what it brings', () => {
		const data = mergeNimbleData(books, contentNimble([{ kind: 'class', name: 'Lanternkeeper', value: cleanEntry('class', buildClass()), pack: HOMEBREW }]));
		const { comp } = withDraft(data, 'subclass', buildSubclass());
		expect(levelRows(comp, 'Lanternkeeper', { subclass: 'Hooded Lantern', only: 'subclass' }).map(r => [r.level, r.grants.map(g => g.text)])).toEqual([
			[3, ['Shutter', '+1 Wick Dice']],
			[5, ['Hood Lore', 'Choose 1 · Hoods']],
		]);
	});
	it('an option says where its class offers it', () => {
		const data = mergeNimbleData(books, contentNimble([{ kind: 'class', name: 'Lanternkeeper', value: cleanEntry('class', buildClass()), pack: HOMEBREW }]));
		const { comp } = withDraft(data, 'option', buildOption());
		expect(optionLevels(comp, 'Lanternkeeper', 'Blue Wick')).toEqual([2]);
		// A book class's list: the Berserker picks from the Savage Arsenal at 4, 6, 8…
		const berserk = withDraft(books, 'option', { ...newDraft('option', { className: 'Berserker', group: 'Savage Arsenal' }), name: 'Cleave Through', text: 'Hit two.' });
		expect(optionLevels(berserk.comp, 'Berserker', 'Cleave Through').slice(0, 3)).toEqual([4, 6, 8]);
	});
});

// ----------------------------------------------------------------------------
// A hero from built content, levelled 1 → 5

describe('a hero made from a built class, subclass, ancestry and background', () => {
	const blocks = (['class', 'subclass', 'ancestry', 'background', 'boon', 'option'] as ContentKind[]).map(k => {
		const r = read(k, BUILT[k]());
		return { ...r.entry!, file: `Ember Vault/Content/Nimble/${k}.md`, pack: HOMEBREW };
	});
	const comp = () => new Compendium(mergeNimbleData(books, contentNimble(blocks)));

	it('New character: stats, HP, saves and gear from the class; traits and background; the class panel from its data', () => {
		const c = comp();
		const fm = newCharacterFrontmatter({ name: 'Ilse', className: 'Lanternkeeper', ancestry: 'Wickfolk', background: 'Lamplighter', array: 'Standard' }, c);
		expect(fm).toMatchObject({ class: 'Lanternkeeper', ancestry: 'Wickfolk', background: 'Lamplighter', level: 1, hp_max: 13 });
		const s = readCharacter(fm, c);
		expect(s.saves).toMatchObject({ WIL: 'adv', STR: 'dis' });
		expect(s.features.filter(f => f.group === 'Ancestry').map(f => f.name)).toEqual(['Glow']);
		expect(s.features.filter(f => f.group === 'Background').map(f => f.name)).toEqual(['Lamplighter']);
		expect(s.inventory.map(e => e.name)).toEqual(expect.arrayContaining(['Dagger']));
		expect(s.skills.find(k => k.name === 'Perception')?.total).toBe(s.stats.WIL + 2);
		expect(s.manaMax).toBe(0);
		const rows = classPanelRows(s);
		expect(rows.map(r => [r.kind, r.label])).toEqual([['target', 'Lit Quarry'], ['dice', 'Wick Dice'], ['state', 'Kindle'], ['number', 'Oil'], ['uses', 'Spotlight']]);
		expect(rows.find(r => r.kind === 'dice')).toMatchObject({ sides: 6, rolledWhen: 'gained', max: 2 });
		expect(rows.find(r => r.kind === 'state')).toMatchObject({ condition: 'Kindled', dice: ['Wick Dice'] });
		expect(rows.find(r => r.kind === 'number')).toMatchObject({ spend: 'Pour', max: 3 });
		expect(rows.find(r => r.kind === 'uses')).toMatchObject({ max: s.stats.WIL });
	});
	it('levels up 1 → 5: a Wick at 2 with mana and tier 1, the subclass at 3 (one more Wick Die), +1 WIL and tier 2 at 4, a Hood, a Fire Utility Spell and d8 Wick Dice at 5', () => {
		const c = comp();
		const fm = newCharacterFrontmatter({ name: 'Ilse', className: 'Lanternkeeper', ancestry: 'Wickfolk', background: 'Lamplighter', array: 'Standard' }, c);
		const wil = readCharacter(fm, c).stats.WIL;
		const asked: Record<number, string[]> = {};
		for (const level of [2, 3, 4, 5]) {
			const s = readCharacter(fm, c);
			const [plan] = levelPlans(c, { className: 'Lanternkeeper', subclass: s.subclass, from: level, to: level, hitDie: 8, chosen: level === 3 ? 'Hooded Lantern' : undefined });
			asked[level] = [...plan.subclasses.map(x => `subclass:${x.name}`), ...plan.picks.map(p => `pick:${p.group.name}`), ...plan.stats.map(x => `stat:${x.options.join('/')}`), ...plan.spells.map(x => `spell:${x.kind}`)];
			const choices = { ...noChoices(), hp: [5] };
			if (level === 2) choices.picks = { Wicks: ['Blue Wick'] };
			if (level === 3) choices.subclass = 'Hooded Lantern';
			if (level === 4) choices.stats = { [increaseKey(4, plan.stats[0])]: ['WIL'] };
			if (level === 5) Object.assign(choices, { picks: { Hoods: ['Iron Hood'] }, spells: { [plan.spells[0].key]: ['Kindle'] } });
			applyLevelChoices(fm, c, [plan], choices);
		}
		expect(asked).toEqual({
			2: ['pick:Wicks'],
			3: ['subclass:Hooded Lantern'],
			4: ['stat:WIL/DEX'],
			5: ['pick:Hoods', 'spell:utility'],
		});
		const s = readCharacter(fm, c);
		expect([s.level, s.subclass, s.stats.WIL]).toEqual([5, 'Hooded Lantern', wil + 1]);
		expect(s.features.filter(f => f.group === 'Chosen').map(f => f.name)).toEqual(['Blue Wick', 'Iron Hood']);
		expect(s.features.filter(f => f.group === 'Subclass').map(f => f.name)).toEqual(['Shutter', 'Hood Lore']);
		expect(s.spells.map(x => x.name)).toContain('Kindle');
		expect([s.maxTier, s.manaMax]).toEqual([2, s.stats.WIL + 5]);
		const rows = classPanelRows(s);
		// 2 Wick Dice, +1 for the Hooded Lantern; d8 from level 5.
		expect(rows.find(r => r.kind === 'dice')).toMatchObject({ max: 3, sides: 8 });
		expect(rows.find(r => r.kind === 'number')).toMatchObject({ max: 15 });
		expect(rows.map(r => r.kind)).toEqual(['target', 'pool', 'dice', 'state', 'number', 'uses']);
	});
});
