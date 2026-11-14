import { describe, expect, it } from 'vitest';
import { Compendium } from '../src/compendium';
import {
	addCondition, addFeature, addItem, addLanguage, addSpell, adjustResource, applyDamage, assignStats, classOptions, damageRoll, evalFormula,
	fieldRest, fmtMod, Frontmatter, heal, hitDiceHealing, hpAverage, levelUp, newCharacterFrontmatter, parseArmor, parseDamage, readCharacter,
	readInventoryEntry, regainMana, removeCondition, removeFeature, removeItem, removeLanguage, removeSpell, safeRest, setCoins,
	setEquipped, setField, setHp, setMana, setOverride, setQty, setResource, setSave, setSkill, setStat, setTempHp, setWounds,
	spendMana, traitBonuses,
} from '../src/character-def';
import { FIXTURE } from './compendium-fixture';
import BUNDLED from '../src/data/compendium.json';

const comp = new Compendium(FIXTURE);

/** Thorga from the design doc. */
const thorga = (): Frontmatter => ({
	nimble: 'character', title: 'Thorga Ironbrow', player: 'Dakotah', mine: true,
	ancestry: 'Dwarf', class: 'Berserker', subclass: 'Path of the Red Mist', level: 3, background: 'Taste for the Finer Things',
	str: 2, dex: 2, int: -1, wil: 0,
	hp: 20, hp_max: 20, wounds: 0,
	skills: { might: 2, insight: 2 },
	inventory: ['Battleaxe', { name: 'Rations (meat)', qty: 3 }, { name: 'Rusty Mail', equipped: true }],
	features: ['Death Blow', { name: 'Bear Hug', text: 'Custom text.' }],
	resources: { 'Fury Dice': 2 },
});

const read = (fm: Frontmatter) => readCharacter(fm, comp, 'File name');

describe('reading a character', () => {
	it('fills every gap with a default, so an empty note still renders', () => {
		const s = read({});
		expect(s).toMatchObject({
			name: 'File name', level: 1, stats: { STR: 0, DEX: 0, INT: 0, WIL: 0 },
			hp: 10, hpMax: 10, tempHp: 0, wounds: 0, woundsMax: 6, hitDie: 8, hitDice: 1, hitDiceMax: 1,
			armor: 0, initiative: 0, speed: 6, mana: 0, manaMax: 0, caster: false, gp: 0, languages: ['Common'], languagesMax: 1,
			slots: { used: 0, max: 10 }, dying: false,
		});
		expect(s.skills).toHaveLength(10);
		expect(s.saves).toEqual({ STR: null, DEX: null, INT: null, WIL: null });
		expect(read(null as unknown as Frontmatter).name).toBe('File name');
	});

	it('takes numbers written as text, and clamps nonsense', () => {
		const s = read({ level: '4', str: '+2', dex: '−1', hp: 99, hp_max: '30', wounds: -3 });
		expect(s.level).toBe(4);
		expect(s.stats.STR).toBe(2);
		expect(s.stats.DEX).toBe(-1);
		expect(s.hp).toBe(30);
		expect(s.wounds).toBe(0);
	});

	it('derives Thorga: saves, skills, armor, speed, hit dice, wounds, languages', () => {
		const s = read(thorga());
		expect(s.name).toBe('Thorga Ironbrow');
		expect(s.className).toBe('Berserker');
		expect(s.saves).toMatchObject({ STR: 'adv', INT: 'dis', DEX: null, WIL: null });
		expect(s.hitDie).toBe(12);
		// Dwarf: +2 max Hit Dice, +1 max Wounds, –1 Speed; Dwarvish with INT -1? No.
		expect(s.hitDiceMax).toBe(5);
		expect(s.woundsMax).toBe(7);
		expect(s.speed).toBe(5);
		expect(s.languages).toEqual(['Common']);
		// Rusty Mail 6+DEX (max 2) with DEX 2.
		expect(s.armor).toBe(8);
		expect(s.initiative).toBe(2);
		const sk = Object.fromEntries(s.skills.map(k => [k.key, k.total]));
		expect(sk).toMatchObject({ might: 4, insight: 2, arcana: -1, stealth: 2, finesse: 2 });
		expect(s.slots).toEqual({ used: 2 + 1 + 1, max: 12 });
	});

	it('lets the note override saves, armor, initiative, hit die and more', () => {
		const s = read({ ...thorga(), save_adv: 'dex', save_dis: 'none', armor: 3, initiative: 5, hit_die: 10, hit_dice_max: 2, hit_dice: 1, speed: 8, wounds_max: 6, mana_max: 4 });
		expect(s.saves).toMatchObject({ DEX: 'adv', STR: null, INT: null });
		expect(s).toMatchObject({ armor: 3, initiative: 5, hitDie: 10, hitDiceMax: 2, hitDice: 1, speed: 8, woundsMax: 6, manaMax: 4, mana: 4 });
		expect(s.set.has('armor')).toBe(true);
	});

	it('applies ancestry and background bonuses', () => {
		const human = read({ ancestry: 'Human', dex: 1, int: 2, background: 'Survivalist' });
		expect(human.initiative).toBe(2);
		expect(human.skills.find(k => k.key === 'lore')?.total).toBe(3);
		expect(human.hitDiceMax).toBe(2);
		expect(human.languagesMax).toBe(3);
		const dwarf = read({ ancestry: 'Dwarf', int: 0 });
		expect(dwarf.languages).toEqual(['Common', 'Dwarvish']);
		expect(read({ ancestry: 'Dwarf', languages: ['Common', 'Elvish'] }).languages).toEqual(['Common', 'Elvish']);
		expect(traitBonuses(['+1 Might. +1 Defense. +2 Speed.'])).toMatchObject({ armor: 1, speed: 2, skills: { might: 1 } });
	});

	it('works out armor: bare DEX, worn armor, flat armor, shields', () => {
		expect(read({ dex: 3 }).armor).toBe(3);
		expect(read({ dex: 3, inventory: [{ name: 'Rusty Mail', equipped: true }] }).armor).toBe(8);
		expect(read({ dex: 1, inventory: [{ name: 'Adventurer’s Garb', equipped: true }, { name: 'Wooden Buckler', equipped: true }] }).armor).toBe(5);
		expect(read({ dex: 3, inventory: [{ name: 'Rusty Plate', equipped: true }] }).armor).toBe(10);
		expect(read({ dex: 1, inventory: ['Rusty Mail'] }).armor).toBe(1);
		expect(parseArmor('6+DEX (max 2)')).toEqual({ base: 6, dex: true, dexMax: 2, bonus: false });
		expect(parseArmor('+2')).toEqual({ base: 2, dex: false, bonus: true });
		expect(parseArmor('nonsense')).toBeNull();
	});

	it('counts inventory slots: 2-handed and unworn armor take 2, potions 2 per slot', () => {
		const s = read({ str: 1, inventory: ['Battleaxe', 'Rusty Mail', { name: 'Healing Potion', qty: 3 }, '4 Javelins', { name: 'Thing', slots: 3 }, 'Short Sword'] });
		expect(s.inventory.map(e => e.slotsUsed)).toEqual([2, 2, 2, 1, 3, 1]);
		expect(s.slots).toEqual({ used: 11, max: 11 });
		expect(s.inventory[3]).toMatchObject({ name: 'Javelins', qty: 4 });
		expect(readInventoryEntry('Rope x2', 0)).toMatchObject({ name: 'Rope', qty: 2 });
		expect(readInventoryEntry({ name: 'Shield', equipped: 'true' }, 1)).toMatchObject({ equipped: true });
		expect(readInventoryEntry({}, 0)).toBeNull();
	});

	it('builds weapon attacks with the better stat', () => {
		const s = read({ str: 2, dex: 3, inventory: ['Battleaxe', 'Short Sword', 'Staff', 'Mystery Stick'] });
		expect(s.attacks.map(a => [a.name, a.expression, a.stat])).toEqual([
			['Battleaxe', '1d10+2', 'STR'], ['Short Sword', '1d6+3', 'DEX'], ['Staff', '1d8+2', 'STR'],
		]);
		expect(s.attacks[0].detail).toBe('slashing · 2-handed');
		expect(parseDamage('1d6+STR/DEX piercing')).toEqual({ dice: '1d6', stats: ['STR', 'DEX'], type: 'piercing' });
		expect(parseDamage('d8')).toEqual({ dice: '1d8', stats: [], type: '' });
		expect(parseDamage('lots')).toBeNull();
	});

	it('lists features: ancestry, background, class to this level, subclass, chosen, custom', () => {
		const s = read(thorga());
		expect(s.features.map(f => `${f.group}:${f.name}`)).toEqual([
			'Ancestry:Stout', 'Background:Taste for the Finer Things',
			'Class:Rage', 'Class:That all you got?!', 'Class:Intensifying Fury', 'Class:Bloodlust',
			'Subclass:Blood Frenzy', 'Chosen:Death Blow', 'Custom:Bear Hug',
		]);
		expect(s.features.find(f => f.name === 'Death Blow')).toMatchObject({ cost: 'Passive', optionGroup: 'Savage Arsenal', index: 0 });
		expect(s.features.find(f => f.name === 'Bear Hug')).toMatchObject({ text: 'Custom text.', index: 1 });
		expect(classOptions(comp, s).map(o => [o.option.name, o.taken])).toEqual([['Death Blow', true], ['Whirlwind', false]]);
	});

	it('tracks class resources with their max and growing die', () => {
		expect(read(thorga()).resources).toEqual([{ name: 'Fury Dice', current: 2, max: 2, die: 'd4', reset: 'Rage ends' }]);
		const lvl6 = read({ ...thorga(), level: 6, resources: {} });
		expect(lvl6.resources[0]).toMatchObject({ current: 0, die: 'd6' });
		const extra = read({ resources: { Luck: { current: 1, max: 3 } } });
		expect(extra.resources).toEqual([{ name: 'Luck', current: 1, max: 3 }]);
	});

	it('casts: mana from the formula once the pool arrives, spells by school and tier', () => {
		const lvl1 = read({ class: 'Mage', int: 2 });
		expect(lvl1).toMatchObject({ caster: true, manaMax: 0, maxTier: 0 });
		expect(lvl1.spells.map(s => s.name)).toEqual(['Flame Dart', 'Ice Lance']);
		const lvl4 = read({ class: 'Mage', level: 4, int: 2, mana: 3, spells: ['Zap', 'Flame Dart'] });
		expect(lvl4.manaMax).toBe(10);
		expect(lvl4.mana).toBe(3);
		expect(lvl4.maxTier).toBe(2);
		expect(lvl4.spells.map(s => `${s.name}:${s.granted}:${s.cost}`)).toEqual(['Flame Dart:true:0', 'Ignite:true:1', 'Enchant Weapon:true:2', 'Ice Lance:true:0', 'Zap:false:0']);
		const fighter = read({ class: 'Berserker', spells: ['Mystery Spell'] });
		expect(fighter.caster).toBe(true);
		expect(fighter.spells[0]).toMatchObject({ name: 'Mystery Spell', spell: undefined, granted: false });
	});

	it('evaluates formulas without eval', () => {
		const v = { STR: 2, DEX: 1, INT: 3, WIL: 0, KEY: 3, LVL: 5 };
		expect(evalFormula('INT*3+LVL', v)).toBe(14);
		expect(evalFormula('(INT×3)+LVL', v)).toBe(14);
		expect(evalFormula('KEY', v)).toBe(3);
		expect(evalFormula('2*(STR+DEX)-1', v)).toBe(5);
		expect(evalFormula('LVL/2', v)).toBe(2);
		expect(evalFormula(4, v)).toBe(4);
		expect(evalFormula('alert(1)', v)).toBeUndefined();
		expect(evalFormula('INT*', v)).toBeUndefined();
		expect(evalFormula(undefined, v)).toBeUndefined();
	});

	it('formats modifiers', () => {
		expect([fmtMod(2), fmtMod(0), fmtMod(-1)]).toEqual(['+2', '+0', '−1']);
	});
});

describe('changing a character', () => {
	it('damage: temp HP first, then HP; 0 HP is Dying with a Wound; hits while Dying add 2 (3 on a crit)', () => {
		const fm: Frontmatter = { ...thorga(), temp_hp: 5 };
		let ev = applyDamage(fm, read(fm), 3);
		expect(fm).toMatchObject({ temp_hp: 2, hp: 20 });
		expect(ev).toEqual(['3 absorbed by temp HP']);
		applyDamage(fm, read(fm), 7);
		expect(fm).toMatchObject({ temp_hp: 0, hp: 15 });
		ev = applyDamage(fm, read(fm), 40);
		expect(fm).toMatchObject({ hp: 0, wounds: 1 });
		expect(read(fm).dying).toBe(true);
		expect(ev.join()).toMatch(/Dying/);
		applyDamage(fm, read(fm), 5, true);
		expect(fm.wounds).toBe(4);
		expect(applyDamage(fm, read(fm), 0)).toEqual([]);
	});

	it('damage on a fresh note writes only what changed', () => {
		const fm: Frontmatter = {};
		applyDamage(fm, read(fm), 4);
		expect(fm).toEqual({ hp: 6 });
	});

	it('heal, set HP and temp HP stay in range', () => {
		const fm: Frontmatter = { hp: 3, hp_max: 20 };
		heal(fm, read(fm), 5);
		expect(fm.hp).toBe(8);
		heal(fm, read(fm), 50);
		expect(fm.hp).toBe(20);
		setHp(fm, read(fm), -4);
		expect(fm.hp).toBe(0);
		setTempHp(fm, 6);
		expect(fm.temp_hp).toBe(6);
		const fresh: Frontmatter = {};
		heal(fresh, read(fresh), 5);
		setTempHp(fresh, 0);
		expect(fresh).toEqual({});
	});

	it('wounds clamp to the max', () => {
		const fm = thorga();
		setWounds(fm, read(fm), 3);
		expect(fm.wounds).toBe(3);
		setWounds(fm, read(fm), 99);
		expect(fm.wounds).toBe(7);
		expect(read(fm).dead).toBe(true);
		setWounds(fm, read(fm), -1);
		expect(fm.wounds).toBe(0);
	});

	it('mana: spend refuses to overdraw; regain and set cap at the max', () => {
		const fm: Frontmatter = { class: 'Mage', level: 2, int: 1 };
		expect(read(fm).manaMax).toBe(5);
		expect(spendMana(fm, read(fm), 2)).toBe(true);
		expect(fm.mana).toBe(3);
		expect(spendMana(fm, read(fm), 9)).toBe(false);
		expect(fm.mana).toBe(3);
		regainMana(fm, read(fm), 10);
		expect(fm.mana).toBe(5);
		setMana(fm, read(fm), 1);
		expect(fm.mana).toBe(1);
	});

	it('resources go up and down within their max, keeping {current, max} form', () => {
		const fm = thorga();
		adjustResource(fm, read(fm), 'Fury Dice', -1);
		expect(fm.resources).toEqual({ 'Fury Dice': 1 });
		adjustResource(fm, read(fm), 'fury dice', 5);
		expect(fm.resources).toEqual({ 'Fury Dice': 2 });
		const custom: Frontmatter = { resources: { Luck: { current: 1, max: 3 } } };
		adjustResource(custom, read(custom), 'Luck', 1);
		expect(custom.resources).toEqual({ Luck: { current: 2, max: 3 } });
		const fresh: Frontmatter = { class: 'Berserker', str: 2 };
		adjustResource(fresh, read(fresh), 'Fury Dice', 1);
		expect(fresh.resources).toEqual({ 'Fury Dice': 1 });
		setResource(fresh, 'Fury Dice', 0);
		expect(fresh.resources).toEqual({ 'Fury Dice': 0 });
	});

	it('field rest spends Hit Dice and heals each die + STR (never below 0 a die)', () => {
		const fm = { ...thorga(), hp: 5 };
		fieldRest(fm, read(fm), 2, hitDiceHealing([7, 4], 2));
		expect(fm).toMatchObject({ hit_dice: 3, hp: 20 });
		expect(hitDiceHealing([1, 5], -2)).toBe(3);
		const none: Frontmatter = { ...thorga(), hit_dice: 0 };
		fieldRest(none, read(none), 1, 10);
		expect(none.hp).toBe(20);
	});

	it('safe rest: everything back, one Wound healed, temp HP gone, rage dice emptied', () => {
		const fm = { ...thorga(), hp: 2, temp_hp: 4, wounds: 2, hit_dice: 0, class: 'Berserker', resources: { 'Fury Dice': 2 } };
		safeRest(fm, read(fm));
		expect(fm).toMatchObject({ hp: 20, temp_hp: 0, wounds: 1, hit_dice: 5, resources: { 'Fury Dice': 0 } });
		const mage: Frontmatter = { class: 'Mage', level: 2, int: 1, mana: 0 };
		safeRest(mage, read(mage));
		expect(mage.mana).toBe(5);
		const fresh: Frontmatter = {};
		safeRest(fresh, read(fresh));
		expect(fresh).toEqual({});
	});

	it('level up: +1 level, HP up by the gain, hit dice max follows, a skill point', () => {
		const fm = { ...thorga(), hp: 12, hit_dice: 2 };
		levelUp(fm, read(fm), 8, 'Might');
		expect(fm).toMatchObject({ level: 4, hp_max: 28, hp: 20, hit_dice: 2, skills: { might: 3, insight: 2 } });
		expect(read(fm).hitDiceMax).toBe(6);
		const set = { ...thorga(), hit_dice_max: 3 };
		levelUp(set, read(set), 5);
		expect(set.hit_dice_max).toBe(4);
		const fresh: Frontmatter = { class: 'Mage' };
		levelUp(fresh, read(fresh), 4);
		expect(fresh).toEqual({ class: 'Mage', level: 2, hp_max: 14 });
	});

	it('inventory: add (stacking), quantity, equip, remove', () => {
		const fm = thorga();
		addItem(fm, 'Healing Potion', 2);
		addItem(fm, 'rations (meat)');
		expect((fm.inventory as unknown[]).slice(1)).toEqual([{ name: 'Rations (meat)', qty: 4 }, { name: 'Rusty Mail', equipped: true }, { name: 'Healing Potion', qty: 2 }]);
		setQty(fm, { index: 3, name: 'Healing Potion' }, 1);
		expect((fm.inventory as unknown[])[3]).toBe('Healing Potion');
		setEquipped(fm, { index: 2, name: 'Rusty Mail' }, false);
		expect((fm.inventory as unknown[])[2]).toBe('Rusty Mail');
		setEquipped(fm, { index: 9, name: 'Battleaxe' }, true); // stale index: found by name
		expect((fm.inventory as unknown[])[0]).toEqual({ name: 'Battleaxe', equipped: true });
		setQty(fm, { index: 3, name: 'Healing Potion' }, 0);
		removeItem(fm, { index: 0, name: 'Battleaxe' });
		expect(fm.inventory).toEqual([{ name: 'Rations (meat)', qty: 4 }, 'Rusty Mail']);
		const one: Frontmatter = { inventory: ['Rope'] };
		removeItem(one, { index: 0, name: 'Rope' });
		expect(one).toEqual({});
		const fresh: Frontmatter = {};
		addItem(fresh, 'Wooden Buckler', 1, { equip: true });
		expect(fresh.inventory).toEqual([{ name: 'Wooden Buckler', equipped: true }]);
	});

	it('spells and features: add once, remove by name', () => {
		const fm: Frontmatter = {};
		addSpell(fm, 'Flame Dart');
		addSpell(fm, 'flame dart');
		expect(fm.spells).toEqual(['Flame Dart']);
		removeSpell(fm, 'Flame Dart');
		expect(fm).toEqual({});
		addFeature(fm, 'Whirlwind');
		addFeature(fm, { name: 'Bear Hug', text: 'Squeeze.' });
		addFeature(fm, { name: 'Plain' });
		expect(fm.features).toEqual(['Whirlwind', { name: 'Bear Hug', text: 'Squeeze.' }, 'Plain']);
		removeFeature(fm, { index: 1, name: 'Bear Hug' });
		removeFeature(fm, { name: 'whirlwind' });
		removeFeature(fm, { name: 'Plain' });
		expect(fm).toEqual({});
	});

	it('details, stats, skills, saves and overrides', () => {
		const fm: Frontmatter = { skills: { Might: 1 } };
		setField(fm, 'player', 'Sam');
		setField(fm, 'level', '3');
		setField(fm, 'height', '4\'5"');
		setStat(fm, 'STR', 3);
		setStat(fm, 'DEX', 99);
		setSkill(fm, 'might', 2);
		setSkill(fm, 'stealth', 1);
		setSave(fm, 'adv', 'WIL');
		setOverride(fm, 'armor', 4);
		expect(fm).toEqual({ skills: { Might: 2, stealth: 1 }, player: 'Sam', level: 3, height: '4\'5"', str: 3, dex: 10, save_adv: 'WIL', armor: 4 });
		setField(fm, 'player', '');
		setSkill(fm, 'Might', 0);
		setSkill(fm, 'stealth', 0);
		setSave(fm, 'adv', undefined);
		setOverride(fm, 'armor', undefined);
		expect(fm).toEqual({ level: 3, height: '4\'5"', str: 3, dex: 10 });
	});

	it('conditions, coins and languages', () => {
		const fm: Frontmatter = { conditions: 'Dazed' };
		addCondition(fm, 'Prone');
		addCondition(fm, 'prone');
		expect(fm.conditions).toEqual(['Dazed', 'Prone']);
		removeCondition(fm, 'Dazed');
		removeCondition(fm, 'Prone');
		expect(fm).toEqual({});
		setCoins(fm, 'gp', 12);
		setCoins(fm, 'sp', 0);
		expect(fm).toEqual({ gp: 12 });
		const d: Frontmatter = { ancestry: 'Dwarf' };
		addLanguage(d, read(d), 'Elvish');
		expect(d.languages).toEqual(['Common', 'Dwarvish', 'Elvish']);
		removeLanguage(d, read(d), 'Common');
		expect(d.languages).toEqual(['Dwarvish', 'Elvish']);
	});
});

describe('new characters', () => {
	it('assigns stat arrays key stats first and the ▼ save stat last', () => {
		expect(assignStats([2, 2, 0, -1], comp.classByName('Berserker'))).toEqual({ STR: 2, DEX: 2, WIL: 0, INT: -1 });
		expect(assignStats([3, 1, -1, -1], comp.classByName('Mage'))).toEqual({ INT: 3, WIL: 1, DEX: -1, STR: -1 });
		expect(assignStats([2, 1, 1, 0])).toEqual({ STR: 2, DEX: 1, INT: 1, WIL: 0 });
	});

	it('writes a tidy level 1 hero with HP and starting gear', () => {
		const fm = newCharacterFrontmatter({ name: 'Thorga', ancestry: 'dwarf', className: 'Berserker', background: 'Survivalist', array: 'Standard', player: 'Dakotah' }, comp);
		expect(fm).toEqual({
			nimble: 'character', title: 'Thorga', player: 'Dakotah', mine: true, ancestry: 'Dwarf', class: 'Berserker', level: 1,
			background: 'Survivalist', size: 'Medium', str: 2, dex: 2, int: -1, wil: 0, hp: 20, hp_max: 20,
			inventory: ['Battleaxe', 'Rations (meat)', 'Rope (50 ft.)'], cssclasses: ['nimble-sheet-note'],
		});
		const mage = newCharacterFrontmatter({ name: 'Wren', className: 'Mage', array: 'Min-Max' }, comp);
		expect(mage.inventory).toEqual([{ name: 'Adventurer’s Garb', equipped: true }, 'Staff']);
		expect(read(mage).armor).toBe(2 + -1);
		const bare = newCharacterFrontmatter({ name: '' }, comp);
		expect(bare.title).toBeUndefined();
		expect(bare.hp).toBe(10);
	});
});

describe('spell damage', () => {
	const s = { stats: { STR: 1, DEX: 0, INT: 2, WIL: -1 }, key: 2, level: 4 };
	it('turns damage lines into rolls for this hero', () => {
		expect(damageRoll('1d10', s)).toEqual({ expression: '1d10' });
		expect(damageRoll('3d6+INT', s)).toEqual({ expression: '3d6+2' });
		expect(damageRoll('2d20+10', s)).toEqual({ expression: '2d20+10' });
		expect(damageRoll('d8 − WIL cold', s)).toEqual({ expression: '1d8+1' });
		expect(damageRoll('10+KEY', s)).toEqual({ flat: 12 });
		expect(damageRoll('4d10 to a Smoldering target', s)).toEqual({ expression: '4d10' });
		expect(damageRoll('half on a save', s)).toBeNull();
		expect(damageRoll(undefined, s)).toBeNull();
	});
});

describe('every bundled class', () => {
	const real = new Compendium(BUNDLED);
	it('makes level 1 and level 10 heroes that read, rest and level up cleanly', () => {
		expect(real.classes.length).toBeGreaterThan(0);
		for (const cls of real.classes) {
			for (const level of [1, 10]) {
				const fm = newCharacterFrontmatter({ name: `${cls.name} ${level}`, className: cls.name, ancestry: real.ancestries[0]?.name, background: real.backgrounds[0]?.name, array: 'Standard' }, real);
				fm.level = level;
				if (cls.subclasses?.[0]) fm.subclass = cls.subclasses[0].name;
				delete fm.hp_max;
				delete fm.hp;
				const s = readCharacter(fm, real);
				const nums = [s.hp, s.hpMax, s.armor, s.initiative, s.speed, s.mana, s.manaMax, s.hitDice, s.hitDiceMax, s.woundsMax, s.slots.used, s.maxTier, ...s.skills.map(k => k.total), ...s.resources.map(r => r.current)];
				for (const n of nums) expect(Number.isFinite(n), `${cls.name} ${level}: ${JSON.stringify(nums)}`).toBe(true);
				expect(s.className).toBe(cls.name);
				expect(s.features.length).toBeGreaterThan(0);
				for (const sp of s.spells) expect(sp.tier).toBeLessThanOrEqual(s.maxTier);
				for (const a of s.attacks) expect(a.expression).toMatch(/^\d+d\d+([+-]\d+)?$/);
				safeRest(fm, s);
				applyDamage(fm, readCharacter(fm, real), 5);
				levelUp(fm, readCharacter(fm, real), 4);
				expect(readCharacter(fm, real).level).toBe(level + 1);
			}
		}
	});

	it('gives casters spells and mana where their class says so', () => {
		const mage = readCharacter({ class: 'Mage', level: 4, int: 2 }, real);
		expect(mage.maxTier).toBe(2);
		expect(mage.manaMax).toBe(10);
		expect(mage.spells.some(sp => sp.name === 'Flame Dart')).toBe(true);
		expect(mage.spells.every(sp => !sp.spell?.utility)).toBe(true);
		const berserker = readCharacter({ class: 'Berserker', str: 2, inventory: ['Battleaxe'] }, real);
		expect(berserker.attacks[0]).toMatchObject({ expression: '1d10+2', detail: 'slashing · 2-handed' });
	});
});

describe('review fixes', () => {
	it('only counts bonuses that always apply', async () => {
		const { traitBonuses } = await import('../src/character-def');
		expect(traitBonuses(['Gain +2 Defense if you moved on your last turn. +1 Speed.']).armor).toBe(0);
		expect(traitBonuses(['Gain +2 Defense if you moved on your last turn. +1 Speed.']).speed).toBe(1);
		expect(traitBonuses(['You can survive +3 max Wounds as long as they are nearby.']).wounds).toBe(0);
		expect(traitBonuses(['+2 max Hit Dice, +1 max Wounds, –1 Speed.'])).toMatchObject({ hitDice: 2, wounds: 1, speed: -1 });
	});

	it('keeps keys the player added to an inventory line when it changes', async () => {
		const { addItem, setEquipped, setQty } = await import('../src/character-def');
		const fm: Record<string, unknown> = { inventory: [{ name: 'Longsword', charges: 3, cost: '15 gp' }, 'Rope (50 ft.)'] };
		setEquipped(fm, { index: 0, name: 'Longsword' }, true);
		expect((fm.inventory as unknown[])[0]).toEqual({ name: 'Longsword', equipped: true, charges: 3, cost: '15 gp' });
		setQty(fm, { index: 0, name: 'Longsword' }, 2);
		addItem(fm, 'Longsword');
		expect((fm.inventory as unknown[])[0]).toEqual({ name: 'Longsword', qty: 3, equipped: true, charges: 3, cost: '15 gp' });
		setEquipped(fm, { index: 0, name: 'Longsword' }, false);
		setQty(fm, { index: 0, name: 'Longsword' }, 1);
		expect((fm.inventory as unknown[])[0]).toEqual({ name: 'Longsword', charges: 3, cost: '15 gp' });
		expect((fm.inventory as unknown[])[1]).toBe('Rope (50 ft.)');
	});
});

describe('starting above level 1', () => {
	it('levels a new hero up to the campaign level with the flat HP bonus', () => {
		const comp = new Compendium(BUNDLED);
		const fm = newCharacterFrontmatter({ name: 'Brakka', className: 'Berserker', level: 3 }, comp);
		expect(fm.level).toBe(3);
		expect(fm.hp_max).toBe(20 + 6 + 6); // Core Rules 3.3: d12 +6 a level
		expect(fm.hp).toBe(fm.hp_max);
		expect(readCharacter(fm, comp).hitDiceMax).toBe(3);
	});
});

describe('Core Rules 3.3 and the 3.x class books', () => {
	const comp = new Compendium(BUNDLED);

	it('adds the class\'s Skilled Hero adjustments to skills', () => {
		const s = readCharacter({ nimble: 'character', class: 'Berserker', level: 1, str: 2, dex: 2, int: -1, wil: 0 }, comp);
		const sk = Object.fromEntries(s.skills.map(k => [k.key, k.total]));
		// +2 Might, +1 Naturecraft; –2 Finesse, –1 Influence
		expect(sk).toMatchObject({ might: 4, naturecraft: 1, finesse: 0, influence: -1, arcana: -1 });
	});

	it('gives every updated core class its Skilled Hero line', () => {
		for (const name of ['Berserker', 'Commander', 'Mage', 'Shadowmancer', 'Shepherd', 'Songweaver', 'Stormshifter', 'Zephyr']) {
			const cls = comp.classByName(name);
			expect(cls?.skillMods, name).toBeTruthy();
			expect(cls?.levels?.[0].features?.some(f => f.name === 'Skilled Hero'), name).toBe(true);
		}
	});

	it('takes Initiative off Human Tenacious', () => {
		const s = readCharacter({ nimble: 'character', ancestry: 'Human', dex: 1 }, comp);
		expect(s.initiative).toBe(1);
		expect(s.skills.find(k => k.key === 'stealth')?.total).toBe(2);
	});

	it('uses the 3.3 flat HP bonus table', () => {
		expect([4, 6, 8, 10, 12, 20].map(d => hpAverage(d, comp))).toEqual([2, 3, 4, 5, 6, 10]);
	});
});
