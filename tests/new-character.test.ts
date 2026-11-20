import { describe, expect, it } from 'vitest';
import { Compendium, STATS, StatKey } from '../src/systems/nimble/compendium';
import {
	assignStats, Frontmatter, isPlacementOf, keyStatsOf, keyStatsShort, levelOneFrontmatter, readCharacter, statArrays, swapStats,
} from '../src/systems/nimble/character-def';
import {
	applyLevelChoices, increaseKey, LevelChoices, LevelPlan, levelPlans, noChoices, pickGroups, spellSlots, statIncrease, subclassLevel,
} from '../src/systems/nimble/level-plan';
import { heroPlans, newCharacterFrontmatter } from '../src/systems/nimble/new-character';
import BUNDLED from '../src/systems/nimble/data/compendium.json';

const comp = new Compendium(BUNDLED, { drafts: true });
const save = (s: string | undefined) => (s ?? '').toUpperCase() as StatKey;

/** A full set of choices for a run: the first options of every list, the first stats offered, the first spells. */
function chooseAll(plans: LevelPlan[], known: string[], subclass?: string): LevelChoices {
	const c: LevelChoices = { ...noChoices(), subclass };
	for (const g of pickGroups(plans)) c.picks[g.name] = g.group.options.slice(0, g.count).map(o => o.name);
	for (const p of plans) for (const inc of p.stats) c.stats[increaseKey(p.level, inc)] = inc.options.slice(0, inc.count);
	const boon = plans.flatMap(p => p.boons)[0];
	if (boon) c.boon = boon.name;
	// Spells are chosen slot by slot: a school chosen first changes what the later slots offer.
	for (let i = 0; i < 3; i++) for (const slot of spellSlots(comp, plans, known, c).slots) c.spells[slot.key] = slot.options.slice(0, slot.count);
	return c;
}

describe('stat placement (Core Rules 3.3: the highest numbers in the KEY stats)', () => {
	it('every array, every class: the class’s placement puts the highest numbers on its key stats', () => {
		for (const cls of comp.classes) {
			const keys = keyStatsOf(cls);
			expect(keys.length, cls.name).toBe(2);
			for (const arr of statArrays(comp)) {
				const st = assignStats(arr.values, cls);
				expect(isPlacementOf(st, arr.values), `${cls.name} ${arr.name}`).toBe(true);
				expect(keyStatsShort(st, cls), `${cls.name} ${arr.name}`).toEqual([]);
				const top = [...arr.values].sort((a, b) => b - a).slice(0, 2).sort((a, b) => a - b);
				expect(keys.map(k => st[k]).sort((a, b) => a - b), `${cls.name} ${arr.name}`).toEqual(top);
				// The first key stat gets the highest number.
				expect(st[keys[0]]).toBe(Math.max(...arr.values));
				// The ▼ save takes the lowest number left, unless it's a key stat.
				const dis = save(cls.saves?.dis);
				if (!keys.includes(dis)) expect(st[dis], `${cls.name} ${arr.name}`).toBe(Math.min(...arr.values));
			}
		}
	});

	it('the class sets the ▲ and ▼ saves, whatever the placement', () => {
		for (const cls of comp.classes) {
			const fm = levelOneFrontmatter({ name: 'X', className: cls.name, array: 'Min-Max', stats: { STR: 3, DEX: 1, INT: -1, WIL: -1 } }, comp);
			const s = readCharacter(fm, comp);
			expect(s.saves[save(cls.saves?.adv)], cls.name).toBe('adv');
			expect(s.saves[save(cls.saves?.dis)], cls.name).toBe('dis');
			expect(STATS.filter(k => s.saves[k]).length, cls.name).toBe(2);
		}
	});

	it('the book’s example: a Cheat with Min-Max puts +3 in DEX, +1 in INT, −1 in WIL and STR', () => {
		const cheat = comp.classByName('The Cheat');
		expect(assignStats([3, 1, -1, -1], cheat)).toEqual({ DEX: 3, INT: 1, STR: -1, WIL: -1 });
		const fm = newCharacterFrontmatter({ name: 'Stabs', className: 'The Cheat', array: 'Min-Max' }, comp);
		expect([fm.str, fm.dex, fm.int, fm.wil]).toEqual([-1, 3, 1, -1]);
		const s = readCharacter(fm, comp);
		expect(s.saves.DEX).toBe('adv');
		expect(s.saves.WIL).toBe('dis');
	});

	it('keeps the player’s placement: swapping two stats, the key stats swapped between themselves', () => {
		const mage = comp.classByName('Mage');
		const st = assignStats([3, 1, -1, -1], mage);
		expect(st).toEqual({ INT: 3, WIL: 1, DEX: -1, STR: -1 });
		const swapped = swapStats(st, 'INT', 'WIL');
		expect(swapped).toEqual({ INT: 1, WIL: 3, DEX: -1, STR: -1 });
		expect(keyStatsShort(swapped, mage)).toEqual([]);
		const fm = newCharacterFrontmatter({ name: 'Wren', className: 'Mage', array: 'Min-Max', stats: swapped }, comp);
		expect([fm.str, fm.dex, fm.int, fm.wil]).toEqual([-1, -1, 1, 3]);
	});

	it('names the key stat that a placement leaves short, and ignores a placement that isn’t the array', () => {
		const berserker = comp.classByName('Berserker');
		const bad = swapStats(assignStats([2, 1, 1, 0], berserker), 'STR', 'INT');
		expect(keyStatsShort(bad, berserker)).toEqual(['STR', 'DEX']);
		expect(isPlacementOf({ STR: 2, DEX: 2, INT: 2, WIL: 2 }, [2, 2, 0, -1])).toBe(false);
		const fm = newCharacterFrontmatter({ name: 'B', className: 'Berserker', array: 'Standard', stats: { STR: 2, DEX: 2, INT: 2, WIL: 2 } }, comp);
		expect([fm.str, fm.dex, fm.int, fm.wil]).toEqual([2, 2, -1, 0]);
	});
});

describe('every class at level 1', () => {
	it('writes the class’s HP, gear, stats and nothing more', () => {
		for (const cls of comp.classes) {
			const fm = newCharacterFrontmatter({ name: `A ${cls.name}`, className: cls.name, array: 'Standard' }, comp);
			const st = assignStats([2, 2, 0, -1], cls);
			expect(fm.class).toBe(cls.name);
			expect(fm.level).toBe(1);
			expect(fm.hp).toBe(cls.startingHp);
			expect(fm.hp_max).toBe(cls.startingHp);
			for (const k of STATS) expect(fm[k.toLowerCase()], `${cls.name} ${k}`).toBe(st[k]);
			const inv = (fm.inventory as unknown[] | undefined ?? []).map(v => (typeof v === 'string' ? v : (v as { name: string }).name));
			expect(inv, cls.name).toEqual((cls.startingGear ?? []).map(g => g.replace(/^(\d+) /, '$1 ')).map(g => g.trim()).filter(Boolean).map(g => inv.find(x => g.includes(x)) ?? g));
			const s = readCharacter(fm, comp);
			expect(s.hitDie).toBe(cls.hitDie);
			expect(s.hitDiceMax).toBe(1);
			expect(s.level).toBe(1);
			expect(fm.subclass).toBeUndefined();
			expect(fm.skills).toBeUndefined();
		}
	});

	it('takes 25 gp a level instead of the gear when asked', () => {
		const fm = newCharacterFrontmatter({ name: 'Rich', className: 'Berserker', gold: true }, comp);
		expect(fm.gp).toBe(25);
		expect(fm.inventory).toBeUndefined();
		expect(newCharacterFrontmatter({ name: 'Rich', className: 'Berserker', gold: true, level: 5 }, comp).gp).toBe(125);
	});

	it('writes a size only when the ancestry has one, or the player picked one of two', () => {
		expect(newCharacterFrontmatter({ name: 'B', ancestry: 'Birdfolk' }, comp).size).toBeUndefined();
		expect(newCharacterFrontmatter({ name: 'B', ancestry: 'Birdfolk', size: 'Small' }, comp).size).toBe('Small');
		expect(newCharacterFrontmatter({ name: 'B', ancestry: 'Birdfolk', size: 'Large' }, comp).size).toBeUndefined();
		expect(newCharacterFrontmatter({ name: 'D', ancestry: 'Dwarf' }, comp).size).toBe('Medium');
	});
});

describe('levelling up, every class, every level', () => {
	it('writes HP, the Hit Die, the subclass, picks, spells, stat increases and the skill point', () => {
		for (const cls of comp.classes) {
			const sub = cls.subclasses?.[0]?.name;
			let fm: Frontmatter = newCharacterFrontmatter({ name: cls.name, className: cls.name, array: 'Standard' }, comp);
			for (let level = 2; level <= 20; level++) {
				const before = readCharacter(fm, comp);
				const plans = levelPlans(comp, { className: cls.name, subclass: before.subclass, from: level, to: level, hitDie: before.hitDie });
				const c = chooseAll(plans, before.schools, plans.some(p => p.subclasses.length) ? sub : undefined);
				c.hp = [3];
				c.skills = { [before.skills[level % 10].key]: 1 };
				const next = structuredClone(fm);
				applyLevelChoices(next, comp, plans, c);
				const after = readCharacter(next, comp);
				const where = `${cls.name} ${level}`;
				expect(after.level, where).toBe(level);
				expect(after.hpMax, where).toBe(before.hpMax + 3);
				expect(after.hitDiceMax, where).toBe(before.hitDiceMax + 1);
				if (level === subclassLevel(comp, cls.name) && sub) expect(next.subclass, where).toBe(sub);
				for (const names of Object.values(c.picks)) for (const n of names) expect(after.features.some(f => f.name.startsWith(n)), `${where}: ${n}`).toBe(true);
				for (const [key, ks] of Object.entries(c.stats)) for (const k of ks) expect(after.stats[k], `${where}: ${key}`).toBeGreaterThan(before.stats[k]);
				const sk = before.skills[level % 10];
				expect(after.skills.find(x => x.key === sk.key)?.points, where).toBe(sk.points + 1);
				for (const slot of spellSlots(comp, plans, before.schools, c).slots) {
					for (const x of c.spells[slot.key] ?? []) {
						if (slot.kind === 'school') expect(after.schools, where).toContain(x);
						else if (slot.kind === 'utility') expect(after.spells.some(sp => sp.name === x), `${where}: ${x}`).toBe(true);
					}
				}
				fm = next;
			}
			const s = readCharacter(fm, comp);
			expect(s.level).toBe(20);
			for (const n of STATS.map(k => s.stats[k])) expect(Number.isFinite(n)).toBe(true);
		}
	});

	it('the levels each class gains something at', () => {
		const at = (className: string, sub = '') => {
			const out: Record<number, string[]> = {};
			for (const p of levelPlans(comp, { className, subclass: '', chosen: sub || undefined, from: 2, to: 20, hitDie: 8 })) {
				const bits = [
					...(p.subclasses.length ? ['subclass'] : []),
					...p.picks.map(x => `${x.group.name}×${x.count}`),
					...p.stats.map(x => `+${x.options.join('/')}${x.count > 1 ? `×${x.count}` : ''}`),
					...(p.boons.length ? ['boon'] : []),
					...p.spells.map(x => `${x.kind}:${Array.isArray(x.schools) ? x.schools.join('/') : x.schools}${x.each ? ':each' : ''}`),
				];
				if (bits.length) out[p.level] = bits;
			}
			return out;
		};
		expect(at('Berserker')).toEqual({
			3: ['subclass'], 4: ['Savage Arsenal×1', '+STR/DEX'], 5: ['+INT/WIL'], 6: ['Savage Arsenal×1'], 8: ['Savage Arsenal×1', '+STR/DEX'], 9: ['+INT/WIL'],
			10: ['Savage Arsenal×1'], 12: ['Savage Arsenal×1', '+STR/DEX'], 13: ['+INT/WIL'], 14: ['Savage Arsenal×1'], 16: ['Savage Arsenal×1', '+STR/DEX'], 17: ['+INT/WIL'],
			19: ['boon'], 20: ['+STR/DEX/INT/WIL×2'],
		});
		expect(at('Hunter')[2]).toEqual(['Thrill of the Hunt×2']);
		expect(at('Hunter')[10]).toBeUndefined();
		expect(at('Commander')[2]).toEqual(['Combat Tactics×1']);
		expect(at('Commander')[4]).toEqual(['Commander’s Orders×2', '+STR/INT']);
		expect(at('Commander')[6]).toEqual(['Combat Abilities×1', 'Weapon Mastery×1']);
		expect(at('Commander')[14]).toBeUndefined(); // "You have complete mastery of all weapon types."
		expect(at('Mage')[3]).toEqual(['subclass', 'utilities:known']);
		expect(at('Mage')[4]).toEqual(['Spellshaper Abilities×2', '+INT/WIL']);
		expect(at('Oathsworn')[3]).toEqual(['subclass', 'Sacred Decrees×1']);
		expect(at('Oathsworn')[7]).toEqual(['utility:Radiant']);
		expect(at('Shadowmancer')[3]).toEqual(['subclass', 'Lesser Invocations×1']);
		expect(at('Shepherd')[3]).toEqual(['subclass', 'utility:Necrotic', 'utility:Radiant']);
		expect(at('Songweaver')[2]).toEqual(['school:new']);
		expect(at('Songweaver')[3]).toEqual(['subclass', 'utility:known:each']);
		expect(at('Songweaver')[5]).toEqual(['A “People” Person×2', '+STR/DEX']);
		expect(at('Stormshifter')[4]).toEqual(['+WIL/DEX', 'utility:known:each']);
		expect(at('Stormshifter')[6]).toEqual(['Chimeric Boons×2']);
		expect(at('The Cheat')[4]).toEqual(['Underhanded Abilities×1', '+DEX/INT']);
		expect(at('Zephyr')[4]).toEqual(['Martial Arts Abilities×1', '+DEX/STR']);
		expect(at('Manawright')[2]).toEqual(['Major Inventions×1', 'Gadgets×1']);
		expect(at('Manawright')[4]).toEqual(['Major Inventions or Gadgets×1', '+INT/STR']);
		expect(at('Hexbinder')[20]).toEqual(['+STR/DEX/INT/WIL×2']);
		expect(at('Psion')[5]).toEqual(['Psionic Abilities×1', '+STR/DEX']);
		expect(at('Revenant')[4]).toEqual(['Undying Gifts×1', '+WIL/STR']);
	});
});

describe('what a subclass changes', () => {
	const groups = (className: string, sub: string) => Object.fromEntries(pickGroups(levelPlans(comp, { className, subclass: '', chosen: sub, from: 1, to: 20, hitDie: 8 })).map(g => [g.name, g.count]));

	it('Muscle Mage gives up the Savage Arsenal; Herald of Legends its Lyrical Weaponry', () => {
		expect(groups('Berserker', 'Path of the Red Mist')).toEqual({ 'Savage Arsenal': 7 });
		expect(groups('Berserker', 'Muscle Mage')).toEqual({});
		expect(groups('Songweaver', 'Herald of Legends')).toEqual({ 'A “People” Person': 2 });
	});

	it('the Honorseeker chooses an Honorable Gambit for every Underhanded Ability', () => {
		// Old Habits (level 7, the subclass's own) still chooses an Underhanded Ability.
		expect(groups('The Cheat', 'The Honorseeker')).toEqual({ 'Honorable Gambits': 8, 'Underhanded Abilities': 1 });
	});

	it('a Spellblade takes Commander’s Orders in place of Tactics and Weapon Mastery from level 3; the Arena forgoes Orders', () => {
		expect(groups('Commander', 'Spellblade')).toEqual({ 'Combat Tactics': 1, 'Commander’s Orders': 4, 'Combat Abilities': 5 });
		expect(groups('Commander', 'Champion of the Arena')).toEqual({ 'Combat Tactics': 1, 'Combat Abilities': 5, 'Weapon Mastery': 2 });
	});

	it('Fang & Claw knows all Chimeric Boons from level 15, so level 17 has none to choose', () => {
		expect(groups('Stormshifter', 'Circle of Fang & Claw')['Chimeric Boons']).toBe(4);
		const fifteen = levelPlans(comp, { className: 'Stormshifter', subclass: 'Circle of Fang & Claw', from: 15, to: 15, hitDie: 8 })[0];
		expect(fifteen.grants.length).toBeGreaterThan(5);
	});

	it('a Beastmaster chooses a companion once, when taking the subclass', () => {
		const plans = levelPlans(comp, { className: 'Hunter', subclass: '', chosen: 'Beastmaster', from: 1, to: 20, hitDie: 8 });
		const companion = pickGroups(plans).find(g => g.name === 'Companion');
		expect(companion?.count).toBe(1);
		expect(companion?.group.options.map(o => o.name)).toEqual(['Small Companion', 'Medium Companion', 'Large Companion']);
		const fm = newCharacterFrontmatter({ name: 'Lyra', className: 'Hunter', level: 3, choices: { ...noChoices(), subclass: 'Beastmaster', picks: { Companion: ['Medium Companion'] } } }, comp);
		expect(fm.features).toEqual([{ name: 'Medium Companion', text: expect.stringContaining('Wolf') }]);
	});

	it('a Psion’s abilities come from every tier unlocked by then', () => {
		const plans = levelPlans(comp, { className: 'Psion', subclass: '', from: 1, to: 20, hitDie: 8 });
		const two = plans.find(p => p.level === 2)!.picks[0].group.options.map(o => o.name);
		const five = plans.find(p => p.level === 5)!.picks[0].group.options.map(o => o.name);
		expect(two.length).toBe(comp.optionGroups('Psion').find(g => g.name === 'Lesser Psionic Abilities')!.options.length);
		expect(five.length).toBeGreaterThan(two.length);
		expect(pickGroups(plans).find(g => g.name === 'Psionic Abilities')?.count).toBe(9);
	});

	it('gives what the book gives outright: a Hexbinder’s two Afflictions, the Pestilent one for the Hex', () => {
		expect(heroPlans({ className: 'Hexbinder', level: 1 }, comp)[0].grants).toEqual(['Withered', 'Frenzied']);
		const fm = newCharacterFrontmatter({ name: 'Fern', className: 'Hexbinder' }, comp);
		expect(fm.features).toEqual(['Withered', 'Frenzied']);
		const hex = levelPlans(comp, { className: 'Hexbinder', subclass: 'Coven of the Hex', from: 11, to: 11, hitDie: 8 })[0];
		expect(hex.grants).toContain('Pestilent');
		expect(hex.picks).toEqual([]);
	});
});

describe('spell schools and Utility Spells', () => {
	it('a Songweaver learns a second school at 2, then a Utility Spell from each school at 3', () => {
		const plans = heroPlans({ className: 'Songweaver', level: 3 }, comp);
		const c = { ...noChoices(), spells: { [plans[1].spells[0].key]: ['Fire'] } };
		const { slots } = spellSlots(comp, plans, ['Wind'], c);
		expect(slots.map(s => [s.kind, s.school ?? '', s.options.length])).toEqual([['school', '', 5], ['utility', 'Wind', 3], ['utility', 'Fire', 3]]);
		c.spells[slots[1].key] = ['Feather Fall'];
		c.spells[slots[2].key] = ['Kindle'];
		const fm = newCharacterFrontmatter({ name: 'Orin', className: 'Songweaver', level: 3, choices: c }, comp);
		expect(fm.schools).toEqual(['Fire']);
		expect(fm.spells).toEqual(['Feather Fall', 'Kindle']);
		const s = readCharacter(fm, comp);
		expect(s.schools).toEqual(['Wind', 'Fire']);
		expect(s.spells.some(sp => sp.school === 'Fire' && sp.tier === 1)).toBe(true);
	});

	it('a Mage learns every Utility Spell of one school at 3; a Shadowmancer knows them all at 14', () => {
		const plans = heroPlans({ className: 'Mage', level: 6 }, comp);
		const first = spellSlots(comp, plans, ['Fire', 'Ice', 'Lightning'], noChoices()).slots;
		expect(first.map(s => [s.level, s.kind, s.options])).toEqual([[3, 'utilities', ['Fire', 'Ice', 'Lightning']], [6, 'utilities', ['Fire', 'Ice', 'Lightning']]]);
		const c = { ...noChoices(), spells: { [first[0].key]: ['Ice'] } };
		// A school already taken isn't offered again.
		expect(spellSlots(comp, plans, ['Fire', 'Ice', 'Lightning'], c).slots[1].options).toEqual(['Fire', 'Lightning']);
		const fm = newCharacterFrontmatter({ name: 'Rowan', className: 'Mage', level: 3, choices: c }, comp);
		expect(fm.spells).toEqual(['Chillcraft', 'Ice Disk', 'Wintry Scrying']);
		const fm14: Frontmatter = { nimble: 'character', class: 'Shadowmancer', level: 13 };
		applyLevelChoices(fm14, comp, levelPlans(comp, { className: 'Shadowmancer', subclass: '', from: 14, to: 14, hitDie: 8 }), noChoices());
		expect(fm14.spells).toEqual(['Gravecraft', 'False Face', 'Thought Leech']);
	});

	it('an Academy Dropout learns any 1 Utility Spell at level 1', () => {
		const plans = heroPlans({ className: 'Berserker', background: 'Academy Dropout' }, comp);
		const slot = spellSlots(comp, plans, [], noChoices()).slots[0];
		expect(slot.options.length).toBe(18);
		const fm = newCharacterFrontmatter({ name: 'Dropout', className: 'Berserker', background: 'Academy Dropout', choices: { ...noChoices(), spells: { [slot.key]: ['Light'] } } }, comp);
		expect(fm.spells).toEqual(['Light']);
	});
});

describe('Commander: another Combat Ability, or +1 max Combat Dice', () => {
	it('offers the Orders and Tactics and the die, which can be taken more than once and raises the max', () => {
		const plans = levelPlans(comp, { className: 'Commander', subclass: 'Champion of the Bulwark', from: 6, to: 8, hitDie: 10 });
		const g = pickGroups(plans).find(x => x.name === 'Combat Abilities')!;
		expect(g.count).toBe(2);
		expect(g.group.options.some(o => o.name === '+1 max Combat Dice')).toBe(true);
		const fm: Frontmatter = { nimble: 'character', class: 'Commander', subclass: 'Champion of the Bulwark', level: 5, str: 2 };
		const before = readCharacter(fm, comp).resources.find(r => r.name === 'Combat Dice')!.max!;
		applyLevelChoices(fm, comp, plans, { ...noChoices(), picks: { 'Combat Abilities': ['+1 max Combat Dice', '+1 max Combat Dice'] } });
		expect((fm.features as { name: string }[]).map(f => f.name)).toEqual(['+1 max Combat Dice', '+1 max Combat Dice (2)']);
		expect(readCharacter(fm, comp).resources.find(r => r.name === 'Combat Dice')!.max).toBe(before + 2);
	});
});

describe('starting above level 1', () => {
	it('a level 4 Berserker gets every level’s steps: HP, subclass, a Savage Arsenal pick, +1 STR or DEX, 3 skill points', () => {
		const c: LevelChoices = {
			...noChoices(), hp: [6, 6, 6], subclass: 'Path of the Red Mist', picks: { 'Savage Arsenal': ['Whirlwind'] },
			stats: { [increaseKey(4, statIncrease({ name: 'Key Stat Increase', text: '+1 STR or DEX.' })!)]: ['DEX'] }, skills: { might: 2, stealth: 1 },
		};
		const fm = newCharacterFrontmatter({ name: 'Brakka', className: 'Berserker', array: 'Standard', level: 4, choices: c }, comp);
		expect(fm).toMatchObject({ level: 4, hp_max: 38, hp: 38, subclass: 'Path of the Red Mist', features: ['Whirlwind'], str: 2, dex: 3, skills: { might: 2, stealth: 1 } });
		const s = readCharacter(fm, comp);
		expect(s.hitDiceMax).toBe(4);
		// The same as making them at level 1 and levelling up three times.
		let step: Frontmatter = newCharacterFrontmatter({ name: 'Brakka', className: 'Berserker', array: 'Standard' }, comp);
		for (const level of [2, 3, 4]) {
			const plans = levelPlans(comp, { className: 'Berserker', subclass: readCharacter(step, comp).subclass, from: level, to: level, hitDie: 12 });
			applyLevelChoices(step, comp, plans, {
				...noChoices(), hp: [6], subclass: level === 3 ? 'Path of the Red Mist' : undefined,
				picks: level === 4 ? { 'Savage Arsenal': ['Whirlwind'] } : {}, stats: level === 4 ? c.stats : {},
				skills: level === 2 ? { might: 1 } : level === 3 ? { might: 1 } : { stealth: 1 },
			});
		}
		step = { ...step };
		expect(step).toEqual(fm);
	});

	it('without choices, takes the flat bonus and leaves the rest to the sheet', () => {
		const fm = newCharacterFrontmatter({ name: 'Quick', className: 'Mage', level: 5 }, comp);
		expect(fm).toMatchObject({ level: 5, hp_max: 10 + 4 * 3 });
		expect(fm.subclass).toBeUndefined();
		expect(fm.features).toBeUndefined();
	});
});

describe('stat increase wording', () => {
	it('reads every class book’s way of saying it', () => {
		expect(statIncrease({ name: '+Key Stat', text: '+1 INT or STR.' })).toEqual({ feature: '+Key Stat', options: ['INT', 'STR'], count: 1 });
		expect(statIncrease({ name: 'Sage of Banes', text: 'Increase any 2 stats by 1.' })?.count).toBe(2);
		expect(statIncrease({ name: 'Mindmaster', text: '+1 to any 2 of your stats.' })?.options).toEqual(STATS);
	});
});
