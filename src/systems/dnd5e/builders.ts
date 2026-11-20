// 5e's builders: a monster, a spell and an item, as schemas for core's builder
// (core/builder/schema.ts). The numbers and the wording come from
// builder-model.ts (monsters) and homebrew-draft.ts (spells and items); the
// previews are the stat block and the compendium cards themselves.

import { checkHead, homeFolder, registerKind, statTiles } from '../../core/builder/frame';
import { EntitySchema, FieldDef, schemaKind } from '../../core/builder/schema';
import {
	ABILITY_SHORT, acNoteOf, acOf, Action5eDraft, ALIGNMENTS, ARMOR_5E, CONDITIONS_5E, CREATURE_TYPES, CRS, DAMAGE_TYPES, damageText, dcOf, Feature5eDraft, fromMonster5e, hpOf, HIT_DIE,
	initiativeOfDraft, modOf, Monster5eDraft, newAction5e, newFeature5e, newMonster5e, passivePerception, pbOf, saveBonus, SIZES, SKILL_ABILITY, skillBonus, toHit, toMonster5e, USES_5E, xpOfDraft,
} from './builder-model';
import { renderCard5e } from './cards';
import { Equipment5e, equipmentLine, Item5e, Spell5e, spellLine } from './compendium';
import { equipmentSource5e, ITEM_LANG, ITEM_TYPES_5E, itemSource5e, RARITIES_5E, SCHOOLS_5E, SPELL_CLASSES_5E, SPELL_LANG, spellSource5e } from './homebrew';
import {
	ARMOR_CATEGORIES_5E, BONUS_RARITY, CASTING_TIMES, fromEquipment5e, fromItem5e, fromSpell5e, Item5eDraft, MASTERIES_5E, newItem5e, newSpell5e, rulesSentence, Spell5eDraft,
	SPELL_AREAS, SPELL_DURATIONS, toEquipment5e, toItem5e, toSpell5e, upcastSentence, weaponProperties5e,
} from './homebrew-draft';
import { toStatblockSource5e } from './parser';
import { formatMod, xpForCr } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { ABILITIES, ABILITY_NAME, AbilityKey, Dnd5eMonster } from './types';

export { fromItem5e, fromSpell5e, newItem5e, newSpell5e, toItem5e, toSpell5e };
export type { Item5eDraft, Spell5eDraft };

const opts = (xs: readonly string[]) => () => xs.map(x => ({ value: x, label: x }));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DICE = ['4', '6', '8', '10', '12', '20'];
const dieOpts = (none?: string) => () => [...(none !== undefined ? [{ value: '', label: none }] : []), ...DICE.map(s => ({ value: s, label: `d${s}` }))];
const abilityOpts = () => ABILITIES.map(a => ({ value: a, label: ABILITY_NAME[a] }));
const usesField = (): FieldDef => ({ type: 'choice', key: 'uses', label: 'Uses', dropdown: true, options: () => [{ value: '', label: 'Any time' }, ...USES_5E.map(u => ({ value: u, label: u }))] });
const features = (key: string, label: string, add: string): FieldDef<Monster5eDraft> => ({
	type: 'list', key, label, add, blank: newFeature5e,
	title: (f, i) => { const x = f as Feature5eDraft; return `${x.name || `${label} ${i + 1}`}${x.uses ? ` (${x.uses})` : ''}`; },
	item: () => [[{ type: 'text', key: 'name', label: 'Name', words: true }, usesField()], { type: 'textarea', key: 'desc', label: 'Text', rows: 2 }],
});

// ----------------------------------------------------------------------------
// Monsters

export function monsterSchema(rt: Dnd5eRuntime): EntitySchema<Monster5eDraft> {
	const ability = (a: AbilityKey): FieldDef<Monster5eDraft> => ({
		type: 'number', key: a, label: ABILITY_SHORT[a].toUpperCase(), min: 1, max: 30, placeholder: () => '10', hint: d => formatMod(modOf(d, a)),
	});
	const speed = (key: 'walk' | 'burrow' | 'climb' | 'fly' | 'swim', label: string): FieldDef<Monster5eDraft> => ({ type: 'number', key, label, min: 0, max: 300, step: 5, placeholder: () => (key === 'walk' ? '30' : '—') });
	const sense = (key: 'blindsight' | 'darkvision' | 'tremorsense' | 'truesight', label: string): FieldDef<Monster5eDraft> => ({ type: 'number', key, label, min: 0, max: 500, step: 10, placeholder: () => '—' });
	return {
		kind: 'monster', noun: 'monster', icon: 'skull',
		blank: (_p, path) => newMonster5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const m = (seed as { monster?: Dnd5eMonster } | undefined)?.monster;
			return m ? fromMonster5e(m, rt.edition(path)) : undefined;
		},
		steps: d => [
			{
				id: 'basics', label: 'Basics', icon: 'sparkles', title: 'What is it?',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Hound' },
					{ type: 'choice', key: 'size', label: 'Size', options: opts(SIZES), hint: x => `d${HIT_DIE[x.size] ?? 8} hit dice` },
					[
						{ type: 'choice', key: 'type', label: 'Type', options: x => [...new Set([...CREATURE_TYPES, x.type])].map(t => ({ value: t, label: t })), dropdown: true },
						{ type: 'text', key: 'tags', label: 'Tags', placeholder: '(goblinoid)' },
					],
					[
						{ type: 'choice', key: 'cr', label: 'Challenge', options: () => CRS.map(c => ({ value: c, label: `CR ${c}` })), dropdown: true, hint: x => `PB ${formatMod(pbOf(x))} · ${xpOfDraft(x).toLocaleString('en-US')} XP` },
						{ type: 'choice', key: 'alignment', label: 'Alignment', dropdown: true, options: x => [...new Set([...ALIGNMENTS, x.alignment].filter(Boolean))].map(a => ({ value: a, label: cap(a) })) },
					],
					...(d.edition === '2024' ? [{ type: 'toggle' as const, key: 'lair', label: 'Has a lair', hint: (x: Monster5eDraft) => (x.lair ? `${xpForCr(CRS[Math.min(CRS.length - 1, CRS.indexOf(x.cr) + 1)]).toLocaleString('en-US')} XP in its lair` : '') }] : []),
				],
			},
			{
				id: 'defense', label: 'Armor', icon: 'shield', title: 'Armor, hit points and speed',
				rows: [
					[
						{ type: 'choice', key: 'armor', label: 'Armor', dropdown: true, options: () => [{ value: '', label: 'None' }, { value: 'natural', label: 'Natural armor' }, ...Object.keys(ARMOR_5E).map(a => ({ value: a, label: a }))] },
						{ type: 'toggle', key: 'shield', label: 'Shield' },
					],
					[
						{ type: 'number', key: 'ac', label: 'AC', min: 1, max: 30, placeholder: x => String(acOf({ ...x, ac: undefined })) },
						{ type: 'text', key: 'acNote', label: 'AC note', placeholder: d.edition === '2014' ? 'natural armor' : 'mage armor', show: x => x.edition === '2014' || x.armor === 'natural' || !!x.acNote, hint: x => (x.acNote ? '' : acNoteOf(x)) },
					],
					[
						{ type: 'number', key: 'hitDice', label: 'Hit dice', min: 1, max: 99, placeholder: () => '1', hint: x => `d${HIT_DIE[x.size] ?? 8}` },
						{ type: 'number', key: 'hp', label: 'HP', min: 1, max: 9999, placeholder: x => String(hpOf({ ...x, hp: undefined }).hp), hint: x => hpOf(x).formula ?? 'typed' },
					],
					[speed('walk', 'Speed'), speed('fly', 'Fly'), { type: 'toggle', key: 'hover', label: 'Hover', show: x => !!x.fly }],
					[speed('climb', 'Climb'), speed('swim', 'Swim'), speed('burrow', 'Burrow')],
					{ type: 'text', key: 'speed', label: 'Other speed', placeholder: '30 ft. in wolf form' },
				],
			},
			{
				id: 'abilities', label: 'Abilities', icon: 'bar-chart-3', title: 'Abilities and saving throws',
				rows: [
					[ability('str'), ability('dex'), ability('con')],
					[ability('int'), ability('wis'), ability('cha')],
					{ type: 'chips', key: 'saves', label: 'Saving throw proficiencies', options: () => ABILITIES.map(a => ABILITY_SHORT[a]), meta: (s, x) => formatMod(saveBonus({ ...x, saves: [...new Set([...x.saves, s])] }, ABILITIES.find(a => ABILITY_SHORT[a] === s)!)) },
					...(d.edition === '2024' ? [[
						{ type: 'choice' as const, key: 'initProf', label: 'Initiative', numeric: true, options: () => ['Dex', 'Proficient', 'Expertise'].map((label, n) => ({ value: String(n), label })), hint: (x: Monster5eDraft) => `${formatMod(initiativeOfDraft(x))} (${10 + initiativeOfDraft(x)})` },
						{ type: 'number' as const, key: 'init', label: 'Typed', min: -10, max: 30, placeholder: (x: Monster5eDraft) => String(initiativeOfDraft({ ...x, init: undefined })) },
					]] : []),
				],
			},
			{
				id: 'senses', label: 'Skills', icon: 'target', title: 'Skills, senses and languages',
				rows: [
					{ type: 'chips', key: 'skills', label: 'Skills', options: () => Object.keys(SKILL_ABILITY), meta: (s, x) => formatMod(skillBonus({ ...x, skills: [...new Set([...x.skills, s])] }, s)) },
					{ type: 'chips', key: 'expertise', label: 'Expertise', options: x => x.skills, show: x => x.skills.length > 0, meta: (s, x) => formatMod(skillBonus({ ...x, expertise: [...new Set([...x.expertise, s])] }, s)) },
					[sense('darkvision', 'Darkvision'), sense('blindsight', 'Blindsight'), { type: 'toggle', key: 'blind', label: 'Blind beyond it', show: x => !!x.blindsight }],
					[sense('tremorsense', 'Tremorsense'), sense('truesight', 'Truesight')],
					[
						{ type: 'text', key: 'senses', label: 'Other senses', placeholder: 'unimpeded by magical darkness', hint: x => `Passive Perception ${passivePerception(x)}` },
						{ type: 'text', key: 'languages', label: 'Languages', placeholder: 'Common, Draconic' },
					],
				],
			},
			{
				id: 'defenses', label: 'Defenses', icon: 'shield-star', title: 'Resistances and immunities',
				rows: [
					{ type: 'chips', key: 'resist', label: 'Resistances', options: () => [...DAMAGE_TYPES] },
					{ type: 'chips', key: 'immune', label: 'Damage immunities', options: () => [...DAMAGE_TYPES] },
					{ type: 'chips', key: 'vulnerable', label: 'Vulnerabilities', options: () => [...DAMAGE_TYPES] },
					{ type: 'chips', key: 'condImmune', label: 'Condition immunities', options: () => [...CONDITIONS_5E] },
					[
						{ type: 'text', key: 'resistances', label: 'Other resistances', placeholder: d.edition === '2014' ? 'bludgeoning from nonmagical attacks' : '' },
						{ type: 'text', key: 'immunities', label: 'Other immunities', placeholder: '' },
					],
					{ type: 'text', key: 'gear', label: 'Gear', placeholder: 'Scimitar, Shortbow', show: x => x.edition === '2024' },
				],
			},
			{
				id: 'actions', label: 'Actions', icon: 'swords', title: 'Traits and actions',
				rows: [
					features('traits', 'Traits', 'Add a trait'),
					{
						type: 'list', key: 'actions', label: 'Actions', add: 'Add an action', blank: () => newAction5e(),
						title: (a, i) => {
							const x = a as Action5eDraft;
							const name = `${x.name || `Action ${i + 1}`}${x.uses ? ` (${x.uses})` : ''}`;
							if (x.kind === 'text') return name;
							if (x.kind === 'save') return `${name} · DC ${dcOf(d, x.dcAbility ?? 'con')} ${ABILITY_SHORT[x.save ?? 'dex']}`;
							return `${name} · ${formatMod(toHit(d, x))} · ${damageText(d, x)} ${x.damageType}`;
						},
						item: (a) => {
							const x = a as Action5eDraft;
							const attack = () => x.kind === 'melee' || x.kind === 'ranged' || x.kind === 'both';
							return [
								[
									{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Bite' },
									usesField(),
								],
								{ type: 'choice', key: 'kind', label: 'Kind', options: () => [{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }, { value: 'both', label: 'Both' }, { value: 'save', label: 'Save' }, { value: 'text', label: 'Other' }] },
								[
									{ type: 'choice', key: 'ability', label: 'Ability', show: attack, options: () => [...(['str', 'dex'] as AbilityKey[]).map(k => ({ value: k, label: ABILITY_SHORT[k] })), { value: 'finesse', label: 'Better of Str/Dex' }, ...(['con', 'int', 'wis', 'cha'] as AbilityKey[]).map(k => ({ value: k, label: ABILITY_SHORT[k] }))], dropdown: true, hint: () => `${formatMod(toHit(d, x))} to hit` },
									{ type: 'number', key: 'reach', label: 'Reach (ft.)', min: 5, max: 30, step: 5, placeholder: () => '5', show: () => x.kind === 'melee' || x.kind === 'both' },
									{ type: 'text', key: 'range', label: 'Range (ft.)', placeholder: x.kind === 'both' ? '20/60' : '80/320', show: () => x.kind === 'ranged' || x.kind === 'both' },
								],
								[
									{ type: 'choice', key: 'save', label: 'Save', dropdown: true, show: () => x.kind === 'save', options: abilityOpts },
									{ type: 'choice', key: 'dcAbility', label: 'DC from', dropdown: true, show: () => x.kind === 'save', options: abilityOpts, hint: () => `DC ${dcOf(d, x.dcAbility ?? 'con')}` },
								],
								{ type: 'text', key: 'area', label: d.edition === '2014' ? 'Who saves' : 'Who and where', show: () => x.kind === 'save', placeholder: d.edition === '2014' ? 'each creature in a 60-foot cone' : 'each creature in a 60-foot Cone' },
								[
									{ type: 'number', key: 'count', label: 'Dice', min: 0, max: 40, placeholder: () => '1', show: () => x.kind !== 'text' },
									{ type: 'choice', key: 'sides', label: 'Die', dropdown: true, show: () => x.kind !== 'text', options: dieOpts(x.kind === 'save' ? 'None' : undefined) },
									{ type: 'choice', key: 'damageType', label: 'Damage', show: () => x.kind !== 'text', options: opts(DAMAGE_TYPES), dropdown: true, hint: () => damageText(d, x) },
								],
								{ type: 'toggle', key: 'half', label: 'Half damage on a success', show: () => x.kind === 'save' },
								{ type: 'toggle', key: 'spell', label: 'Spell attack', show: () => attack() && d.edition === '2014' },
								[
									{ type: 'number', key: 'plusCount', label: 'Extra dice', min: 1, max: 40, placeholder: () => '1', show: attack },
									{ type: 'choice', key: 'plusSides', label: 'Extra die', dropdown: true, show: attack, options: dieOpts('None') },
									{ type: 'choice', key: 'plusType', label: 'Extra damage', dropdown: true, show: () => attack() && !!x.plusSides, options: opts(DAMAGE_TYPES) },
								],
								{ type: 'text', key: 'plusWhen', label: 'Extra damage when', placeholder: 'if the attack roll had Advantage', show: () => attack() && !!x.plusSides },
								{ type: 'text', key: 'extra', label: 'And then', placeholder: 'If the target is a creature, it has the Prone condition.', show: attack },
								{ type: 'text', key: 'effect', label: 'On a failure', show: () => x.kind === 'save', placeholder: d.edition === '2014' ? 'become frightened for 1 minute' : 'The target has the Frightened condition until the end of its next turn.' },
								{ type: 'textarea', key: 'desc', label: 'Text', rows: 2, show: () => x.kind === 'text', placeholder: 'The dragon makes three Rend attacks.' },
							];
						},
					},
				],
			},
			{
				id: 'spells', label: 'Spells', icon: 'wand-2', title: 'Spellcasting',
				rows: [
					[
						{ type: 'choice', key: 'spellAbility', label: 'Spellcasting ability', dropdown: true, options: () => [{ value: '', label: 'None' }, ...(['int', 'wis', 'cha'] as AbilityKey[]).map(a => ({ value: a, label: ABILITY_NAME[a] }))], hint: x => { const a = ABILITIES.find(k => k === x.spellAbility); return a ? `DC ${dcOf(x, a)} · ${formatMod(pbOf(x) + modOf(x, a))} to hit` : ''; } },
						{ type: 'toggle', key: 'noMaterial', label: 'No material components', show: x => !!x.spellAbility },
					],
					{ type: 'text', key: 'atWill', label: 'At will', placeholder: 'Detect Magic, Mage Hand', show: x => !!x.spellAbility },
					{ type: 'text', key: 'day3', label: '3/Day each', placeholder: 'Misty Step', show: x => !!x.spellAbility },
					{ type: 'text', key: 'day2', label: '2/Day each', placeholder: '', show: x => !!x.spellAbility },
					{ type: 'text', key: 'day1', label: '1/Day each', placeholder: 'Fireball', show: x => !!x.spellAbility },
				],
			},
			{
				id: 'reactions', label: 'Reactions', icon: 'zap', title: 'Bonus actions and reactions',
				rows: [
					features('bonusActions', 'Bonus actions', 'Add a bonus action'),
					features('reactions', 'Reactions', 'Add a reaction'),
				],
			},
			{
				id: 'legendary', label: 'Legendary', icon: 'crown', title: 'Legendary actions',
				rows: [
					{ type: 'number', key: 'legendaryUses', label: 'Uses per round', min: 1, max: 5, placeholder: () => '3', show: x => x.legendary.length > 0 },
					features('legendary', 'Legendary actions', 'Add a legendary action'),
				],
			},
		],
		preview(el, d) {
			rt.render(el, toMonster5e(d), { sourcePath: '', variant: 'block', edition: d.edition });
		},
		check(el, d) {
			const m = toMonster5e(d);
			checkHead(el, { kicker: 'Challenge', value: `CR ${d.cr}`, tag: `${d.edition} rules` });
			statTiles(el, [
				{ label: 'XP', value: xpOfDraft(d).toLocaleString('en-US'), lead: true, sub: m.xpLair ? `${m.xpLair.toLocaleString('en-US')} in lair` : undefined },
				{ label: 'AC', value: String(m.ac), sub: m.acNote || undefined },
				{ label: 'HP', value: String(m.hp), sub: m.hpFormula || undefined },
				...(d.edition === '2024' ? [{ label: 'Init', value: formatMod(initiativeOfDraft(d)) }] : []),
				{ label: 'PB', value: formatMod(pbOf(d)) },
			]);
		},
		chip: d => ({ text: `CR ${d.cr} · ${xpOfDraft(d).toLocaleString('en-US')} XP`, tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the monster first.'),
		output: d => ({ lang: '5e', body: toStatblockSource5e(toMonster5e(d)), name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Monsters', 'Bestiary') }),
	};
}

// ----------------------------------------------------------------------------
// Spells

const ORD = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function spellSchema(rt: Dnd5eRuntime): EntitySchema<Spell5eDraft> {
	return {
		kind: 'spell', noun: 'spell', icon: 'wand-2',
		blank: (_p, path) => newSpell5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const s = (seed as { spell?: Spell5e } | undefined)?.spell;
			return s ? fromSpell5e(s, rt.edition(path)) : undefined;
		},
		steps: d => [
			{
				id: 'basics', label: 'Basics', icon: 'sparkles', title: 'What are you casting?',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Lash' },
					[
						{ type: 'choice', key: 'level', label: 'Level', dropdown: true, numeric: true, rebuilds: true, options: x => ORD.map((o, i) => ({ value: String(i), label: i === 0 ? 'Cantrip' : x.edition === '2014' ? `${o} level` : `Level ${i}` })) },
						{ type: 'choice', key: 'school', label: 'School', options: opts(SCHOOLS_5E), dropdown: true },
					],
					{ type: 'chips', key: 'classes', label: 'Classes', options: () => [...SPELL_CLASSES_5E] },
				],
			},
			{
				id: 'casting', label: 'Casting', icon: 'hand', title: 'Casting',
				rows: [
					[
						{ type: 'choice', key: 'castingTime', label: 'Casting time', options: x => [...new Set([...CASTING_TIMES, x.castingTime])].map(c => ({ value: c, label: c })), dropdown: true },
						{ type: 'toggle', key: 'ritual', label: 'Ritual' },
					],
					{ type: 'text', key: 'trigger', label: 'Taken when', placeholder: 'you are hit by an attack roll', show: x => /reaction|bonus action/i.test(x.castingTime) },
					[
						{ type: 'choice', key: 'rangeKind', label: 'Range', dropdown: true, show: x => !x.range, options: () => [{ value: 'self', label: 'Self' }, { value: 'touch', label: 'Touch' }, { value: 'feet', label: 'Feet' }, { value: 'miles', label: 'Miles' }, { value: 'sight', label: 'Sight' }, { value: 'unlimited', label: 'Unlimited' }, { value: 'special', label: 'Special' }] },
						{ type: 'number', key: 'distance', label: 'How far', min: 0, max: 5000, step: 5, placeholder: () => '60', show: x => !x.range && (x.rangeKind === 'feet' || x.rangeKind === 'miles') },
					],
					{ type: 'text', key: 'range', label: 'Range as written', show: x => !!x.range, placeholder: '60 feet' },
					[
						{ type: 'choice', key: 'area', label: 'Area', dropdown: true, options: () => [{ value: '', label: 'None' }, ...SPELL_AREAS.map(a => ({ value: a, label: cap(a) }))] },
						{ type: 'number', key: 'areaSize', label: 'Size (ft.)', min: 5, max: 500, step: 5, placeholder: () => '20', show: x => !!x.area },
					],
					{ type: 'chips', key: 'components', label: 'Components', options: () => ['V', 'S', 'M'] },
					{ type: 'text', key: 'material', label: 'Material', placeholder: 'a pinch of ash', show: x => x.components.includes('M') },
					[
						{ type: 'choice', key: 'duration', label: 'Duration', dropdown: true, options: x => [...new Set([...SPELL_DURATIONS, x.duration])].map(v => ({ value: v, label: v })) },
						{ type: 'toggle', key: 'concentration', label: 'Concentration' },
					],
				],
			},
			{
				id: 'effect', label: 'Effect', icon: 'flame', title: 'What it does',
				rows: [
					[
						{ type: 'choice', key: 'attack', label: 'Attack or save', dropdown: true, options: () => [{ value: '', label: 'Neither' }, { value: 'melee', label: 'Melee spell attack' }, { value: 'ranged', label: 'Ranged spell attack' }, { value: 'save', label: 'Saving throw' }] },
						{ type: 'choice', key: 'save', label: 'Save', dropdown: true, show: x => x.attack === 'save', options: abilityOpts },
					],
					[
						{ type: 'number', key: 'dmgCount', label: 'Dice', min: 1, max: 40, placeholder: () => '1', show: x => !!x.attack },
						{ type: 'choice', key: 'dmgSides', label: 'Die', dropdown: true, show: x => !!x.attack, options: dieOpts('No damage') },
						{ type: 'choice', key: 'dmgType', label: 'Damage', dropdown: true, show: x => !!x.attack && !!x.dmgSides, options: opts(DAMAGE_TYPES) },
					],
					[
						{ type: 'toggle', key: 'half', label: 'Half on a success', show: x => x.attack === 'save' && !!x.dmgSides },
						{ type: 'number', key: 'upcast', label: d.level === 0 ? 'Dice at 5, 11, 17' : 'Dice per slot level', min: 0, max: 10, placeholder: () => '0', show: x => !!x.attack && !!x.dmgSides },
					],
					{ type: 'textarea', key: 'desc', label: 'Text', rows: 5, placeholder: d.attack ? 'A whip of fire lashes out at a creature you can see within range.' : 'Each creature in a 20-foot-radius Sphere makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save…', hint: x => (rulesSentence(x) ? 'Worded for you' : '') },
					{ type: 'textarea', key: 'higherLevel', label: d.level === 0 ? 'Cantrip upgrade' : d.edition === '2014' ? 'At higher levels' : 'Using a higher-level spell slot', rows: 2, placeholder: upcastSentence(d) || (d.level === 0 ? 'The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).' : 'The damage increases by 1d6 for each spell slot level above 3.') },
				],
			},
		],
		preview(el, d) {
			// Yours, not the SRD's: the card's foot says so.
			const spell = Object.assign(toSpell5e(d), { source: 'Homebrew' });
			renderCard5e(el, { kind: 'spell', name: spell.name, edition: d.edition, detail: spellLine(spell, d.edition), spell }, rt.cardOptions(''));
		},
		chip: d => ({ text: d.level === 0 ? 'Cantrip' : `Level ${d.level ?? 1}`, tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the spell first.'),
		output: d => ({ lang: SPELL_LANG, body: spellSource5e(toSpell5e(d), d.edition), name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Homebrew', 'Homebrew') }),
	};
}

// ----------------------------------------------------------------------------
// Items: magic items, weapons, armor and gear

export function itemSchema(rt: Dnd5eRuntime): EntitySchema<Item5eDraft> {
	const magic = (x: Item5eDraft) => x.kind === 'magic';
	const bonusable = (x: Item5eDraft) => magic(x) && ['Weapon', 'Armor', 'Ammunition'].includes(x.type);
	return {
		kind: 'item', noun: 'item', icon: 'gem',
		blank: (_p, path) => newItem5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const s = seed as { item?: Item5e; equipment?: Equipment5e } | undefined;
			return s?.item ? fromItem5e(s.item, rt.edition(path)) : s?.equipment ? fromEquipment5e(s.equipment, rt.edition(path)) : undefined;
		},
		steps: d => [
			{
				id: 'basics', label: 'Item', icon: 'gem', title: 'What is it?',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: magic(d) ? 'Ember Blade' : 'Ember Pike' },
					{ type: 'choice', key: 'kind', label: 'Kind', rebuilds: true, options: () => [{ value: 'magic', label: 'Magic item' }, { value: 'weapon', label: 'Weapon' }, { value: 'armor', label: 'Armor' }, { value: 'gear', label: 'Gear' }] },
					...(magic(d) ? [
						[
							{ type: 'choice' as const, key: 'type', label: 'Type', options: opts(ITEM_TYPES_5E), dropdown: true },
							{ type: 'text' as const, key: 'subtype', label: 'Which', placeholder: 'Longsword, any heavy armor…' },
						],
						{ type: 'choice' as const, key: 'rarity', label: 'Rarity', options: opts(RARITIES_5E), hint: (x: Item5eDraft) => { const b = BONUS_RARITY[/shield/i.test(x.subtype) ? 'Shield' : x.type]; return bonusable(x) && x.bonus && b ? `+${x.bonus}: ${b[x.bonus - 1]} in the book` : ''; } },
						[
							{ type: 'toggle' as const, key: 'attunement', label: 'Attunement' },
							{ type: 'text' as const, key: 'attunedBy', label: 'By', placeholder: 'a Paladin', show: (x: Item5eDraft) => x.attunement },
						],
					] : [
						[
							{ type: 'text' as const, key: 'cost', label: 'Cost', placeholder: '15 gp' },
							{ type: 'number' as const, key: 'weight', label: 'Weight (lb.)', min: 0, max: 2000, placeholder: () => '—' },
						],
					]),
				],
			},
			...(magic(d) ? [{
				id: 'magic', label: 'Magic', icon: 'sparkles', title: 'What it does',
				rows: [
					[
						{ type: 'choice' as const, key: 'bonus', label: 'Bonus', show: bonusable, numeric: true, options: () => [0, 1, 2, 3].map(n => ({ value: String(n), label: n ? `+${n}` : 'None' })) },
						{ type: 'number' as const, key: 'charges', label: 'Charges', min: 0, max: 50, placeholder: () => '—' },
						{ type: 'text' as const, key: 'regain', label: 'Regains at dawn', placeholder: '1d6 + 1', show: (x: Item5eDraft) => !!x.charges },
					],
					{ type: 'textarea' as const, key: 'desc', label: 'Text', rows: 7, placeholder: 'While you hold this blade, it sheds Bright Light in a 10-foot radius…' },
				],
			}] : []),
			...(d.kind === 'weapon' ? [{
				id: 'weapon', label: 'Weapon', icon: 'sword', title: 'The weapon',
				rows: [
					[
						{ type: 'choice' as const, key: 'weaponCategory', label: 'Category', options: () => [{ value: 'Simple', label: 'Simple' }, { value: 'Martial', label: 'Martial' }] },
						{ type: 'toggle' as const, key: 'ranged', label: 'Ranged' },
					],
					[
						{ type: 'number' as const, key: 'dmgCount', label: 'Dice', min: 1, max: 6, placeholder: () => '1' },
						{ type: 'choice' as const, key: 'dmgSides', label: 'Die', dropdown: true, options: dieOpts() },
						{ type: 'choice' as const, key: 'dmgType', label: 'Damage', dropdown: true, options: () => ['Bludgeoning', 'Piercing', 'Slashing'].map(v => ({ value: v, label: v })) },
					],
					{ type: 'chips' as const, key: 'properties', label: 'Properties', options: (x: Item5eDraft) => weaponProperties5e(x.edition) },
					[
						{ type: 'text' as const, key: 'versatile', label: 'Two-handed damage', placeholder: '1d10', show: (x: Item5eDraft) => x.properties.includes('Versatile') },
						{ type: 'number' as const, key: 'rangeNormal', label: 'Range (ft.)', min: 5, max: 1000, step: 5, placeholder: () => '20', show: (x: Item5eDraft) => x.ranged || x.properties.some(p => ['Thrown', 'Ammunition', 'Range'].includes(p)) },
						{ type: 'number' as const, key: 'rangeLong', label: 'Long range', min: 5, max: 2000, step: 5, placeholder: () => '60', show: (x: Item5eDraft) => x.ranged || x.properties.some(p => ['Thrown', 'Ammunition', 'Range'].includes(p)) },
					],
					...(d.edition === '2024' ? [{ type: 'choice' as const, key: 'mastery', label: 'Mastery', dropdown: true, options: () => [{ value: '', label: 'None' }, ...MASTERIES_5E.map(m => ({ value: m, label: m }))] }] : []),
					{ type: 'textarea' as const, key: 'desc', label: 'Text', rows: 3, placeholder: '' },
				],
			}] : []),
			...(d.kind === 'armor' ? [{
				id: 'armor', label: 'Armor', icon: 'shield', title: 'The armor',
				rows: [
					{ type: 'choice' as const, key: 'armorCategory', label: 'Category', options: opts(ARMOR_CATEGORIES_5E) },
					[
						{ type: 'number' as const, key: 'acBase', label: 'AC', min: 1, max: 30, placeholder: (x: Item5eDraft) => (x.armorCategory === 'Shield' ? '2' : x.armorCategory === 'Heavy' ? '16' : x.armorCategory === 'Medium' ? '14' : '11'), hint: (x: Item5eDraft) => (x.armorCategory === 'Shield' ? 'added to AC' : x.armorCategory === 'Heavy' ? '' : x.armorCategory === 'Medium' ? '+ Dex (max 2)' : '+ Dex') },
						{ type: 'number' as const, key: 'strMin', label: 'Strength', min: 0, max: 20, placeholder: () => '—', show: (x: Item5eDraft) => x.armorCategory !== 'Shield' },
						{ type: 'toggle' as const, key: 'stealth', label: 'Stealth disadvantage', show: (x: Item5eDraft) => x.armorCategory !== 'Shield' },
					],
					{ type: 'textarea' as const, key: 'desc', label: 'Text', rows: 3, placeholder: '' },
				],
			}] : []),
			...(d.kind === 'gear' ? [{
				id: 'gear', label: 'Gear', icon: 'backpack', title: 'What it does',
				rows: [{ type: 'textarea' as const, key: 'desc', label: 'Text', rows: 6, placeholder: 'A rope of braided ember-silk, 50 feet long…' }],
			}] : []),
		],
		preview(el, d) {
			if (d.kind === 'magic') {
				const item = Object.assign(toItem5e(d), { source: 'Homebrew' });
				renderCard5e(el, { kind: 'item', name: item.name, edition: d.edition, detail: item.line ?? '', item }, rt.cardOptions(''));
				return;
			}
			const equipment = Object.assign(toEquipment5e(d), { source: 'Homebrew' });
			renderCard5e(el, { kind: 'equipment', name: equipment.name, edition: d.edition, detail: equipmentLine(equipment), equipment }, rt.cardOptions(''));
		},
		chip: d => ({ text: d.kind === 'magic' ? d.rarity : cap(d.kind), tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the item first.'),
		output: d => ({
			lang: ITEM_LANG,
			body: d.kind === 'magic' ? itemSource5e({ ...toItem5e(d), attunement: d.attunement ? (d.attunedBy.trim() || true) : false }) : equipmentSource5e(toEquipment5e(d)),
			name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Homebrew', 'Homebrew'),
		}),
	};
}

/** 5e's kinds in core's builder. */
export function registerBuilders5e(rt: Dnd5eRuntime): void {
	registerKind('dnd5e', 'monster', { label: 'Monster', icon: 'skull' }, schemaKind(monsterSchema(rt)));
	registerKind('dnd5e', 'spell', { label: 'Spell', icon: 'wand-2' }, schemaKind(spellSchema(rt)));
	registerKind('dnd5e', 'item', { label: 'Item', icon: 'gem' }, schemaKind(itemSchema(rt)));
}
