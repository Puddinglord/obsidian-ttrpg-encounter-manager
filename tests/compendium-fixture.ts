// A small compendium for unit tests, so they don't depend on the bundled
// src/data/compendium.json (which is replaced by the full transcription).
import type { CompendiumData } from '../src/compendium';

export const FIXTURE: CompendiumData = {
	classes: [
		{
			name: 'Berserker', source: 'Berserker 3.0', page: 4, draft: false,
			tagline: 'High-damage, high-survivability, melee-focused class.',
			keyStats: ['STR', 'DEX'], hitDie: 12, startingHp: 20,
			saves: { adv: 'STR', dis: 'INT' },
			startingGear: ['Battleaxe', 'Rations (meat)', 'Rope (50 ft.)'],
			resources: [{ name: 'Fury Dice', max: 'KEY', reset: 'Rage ends', die: 'd4' }],
			levels: [
				{ level: 1, features: [{ name: 'Rage', text: '(1/turn) Action: Roll a Fury Die (1d4) and set it aside.' }, { name: 'That all you got?!', text: 'When you are attacked, you may expend 1 or more Fury Dice.' }] },
				{ level: 2, features: [{ name: 'Intensifying Fury', text: 'If you are Raging at the start of your turn, roll 1 Fury Die for free.' }] },
				{ level: 3, features: [{ name: 'Subclass', text: 'Choose a Berserker subclass.' }, { name: 'Bloodlust', text: 'Expend 1 or more Fury Dice on your turn.' }] },
				{ level: 6, features: [{ name: 'Intensifying Fury (2)', text: 'Your Fury Dice are now d6s.' }] },
			],
			optionGroups: [{
				name: 'Savage Arsenal',
				options: [
					{ name: 'Death Blow', cost: 'Passive', text: 'Whenever you crit, you may double the damage from your Fury Dice.' },
					{ name: 'Whirlwind', cost: '2 Actions', text: 'AoE. Attack ALL targets within your melee weapon’s Reach.' },
				],
			}],
			subclasses: [
				{ name: 'Path of the Red Mist', page: 9, levels: [{ level: 3, features: [{ name: 'Blood Frenzy', text: '(1/turn) While Raging, whenever you crit or kill an enemy, gain 1 Fury Die.' }] }, { level: 7, features: [{ name: 'Unstoppable Brutality', text: 'While Raging, you may gain 1 Wound to reroll.' }] }] },
				{ name: 'Path of the Mountainheart', page: 8, levels: [{ level: 3, features: [{ name: 'Stone’s Resilience', text: 'Whenever you expend Fury Dice…' }] }] },
			],
		},
		{
			name: 'Mage', source: 'Mage 3.0', page: 4, draft: false,
			keyStats: ['INT', 'WIL'], hitDie: 6, startingHp: 10, saves: { adv: 'INT', dis: 'STR' },
			startingGear: ['Adventurer’s Garb', 'Staff'],
			casting: { mana: '(INT×3)+LVL', manaFormula: 'INT*3+LVL', manaFromLevel: 2, schools: ['Fire', 'Ice'] },
			levels: [
				{ level: 1, features: [{ name: 'Elemental Spellcasting', text: 'You know the Fire, Ice, and Lightning spell schools and can cast cantrips from them.' }] },
				{ level: 2, features: [{ name: 'Mana and Unlock Tier 1 Spells', text: 'You may now cast tier 1 spells and gain a mana pool to cast them.' }] },
				{ level: 4, features: [{ name: 'Tier 2 Spells', text: 'You may now cast spells up to tier 2.' }] },
			],
			optionGroups: [{ name: 'Spellshaper', options: [{ name: 'Echo Casting', cost: '2×Mana (min. 1)', text: 'Cast a copy of it on a 2nd target.' }] }],
		},
		{ name: 'Hexbinder', source: 'Hexbinder 3.0', page: 2, draft: true, hitDie: 8, startingHp: 13, levels: [] },
	],
	ancestries: [
		{ name: 'Dwarf', rarity: 'common', size: 'Medium', traits: [{ name: 'Stout', text: '+2 max Hit Dice, +1 max Wounds, –1 Speed. You know Dwarvish if your INT isn’t negative.' }], source: 'Core', page: 23, draft: false },
		{ name: 'Human', rarity: 'common', size: 'Medium', traits: [{ name: 'Tenacious', text: '+1 to all skills and Initiative.' }], source: 'Core', page: 23, draft: false },
	],
	backgrounds: [
		{ name: 'Taste for the Finer Things', text: 'Advantage on Influence checks with the upper class.', source: 'Core', page: 29, draft: false },
		{ name: 'Survivalist', text: 'Advantage against poison saves. +1 max Hit Die.', source: 'Core', page: 28, draft: false },
	],
	items: [
		{ name: 'Battleaxe', category: 'weapon', damage: '1d10+STR slashing', properties: ['2-handed'], cost: '30 gp', source: 'Core', page: 35, draft: false },
		{ name: 'Short Sword', category: 'weapon', damage: '1d6+STR/DEX piercing', properties: ['Light'], cost: '15 gp', source: 'Core', page: 35, draft: false },
		{ name: 'Javelins', category: 'weapon', damage: '1d6+STR piercing', properties: ['Range 8', 'Stack of 4'], source: 'Core', page: 35, draft: false },
		{ name: 'Staff', category: 'weapon', damage: '1d8', stat: 'STR', properties: ['2-handed'], source: 'Core', page: 35, draft: false },
		{ name: 'Rusty Mail', category: 'armor', armor: '6+DEX (max 2)', source: 'Core', page: 34, draft: false },
		{ name: 'Rusty Plate', category: 'armor', armor: '10', strength: 2, source: 'Core', page: 34, draft: false },
		{ name: 'Adventurer’s Garb', category: 'armor', armor: '2+DEX', source: 'Core', page: 34, draft: false },
		{ name: 'Wooden Buckler', category: 'shield', armor: '+2', source: 'Core', page: 34, draft: false },
		{ name: 'Healing Potion', category: 'consumable', subcategory: 'potion', text: '(action) Heal 2d4+4 HP.', source: 'Core', page: 36, draft: false },
		{ name: 'Rations', category: 'gear', source: 'Core', page: 36, draft: false },
		{ name: 'Rope (50 ft.)', category: 'gear', text: 'You always need rope.', source: 'Core', page: 36, draft: false },
		{ name: 'Hex Bag', category: 'gear', source: 'Hexbinder 3.0', page: 3, draft: true },
	],
	spells: [
		{ name: 'Flame Dart', school: 'Fire', tier: 0, actions: '1 Action', damage: '1d10', source: 'Core', page: 46, draft: false },
		{ name: 'Ignite', school: 'Fire', tier: 1, actions: '2 Actions', damage: '4d10', source: 'Core', page: 46, draft: false },
		{ name: 'Enchant Weapon', school: 'Fire', tier: 2, source: 'Core', page: 46, draft: false },
		{ name: 'Ice Lance', school: 'Ice', tier: 0, damage: '1d6', source: 'Core', page: 47, draft: false },
		{ name: 'Warm Hands', school: 'Fire', tier: 0, utility: true, source: 'Core', page: 46, draft: false },
		{ name: 'Zap', school: 'Lightning', tier: 0, source: 'Core', page: 48, draft: false },
	],
	boons: [{ name: 'Boon of Fortitude', kind: 'epic', text: '+1 max Wounds.', source: 'GMG', page: 75, draft: false }],
	rules: {
		statArrays: [{ name: 'Standard', values: [2, 2, 0, -1] }, { name: 'Balanced', values: [2, 1, 1, 0] }, { name: 'Min-Max', values: [3, 1, -1, -1] }],
		hpAverage: { 4: 3, 6: 4, 8: 5, 10: 7, 12: 8 },
	},
};
