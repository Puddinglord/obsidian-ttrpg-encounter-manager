// 5e's builders: a monster, a spell and a magic item, as schemas for core's
// builder (core/builder/schema.ts). The numbers come from builder-model.ts;
// the previews are the stat block and the compendium cards themselves.

import { homeFolder, registerKind } from '../../core/builder/frame';
import { EntitySchema, FieldDef, schemaKind } from '../../core/builder/schema';
import {
	ABILITY_SHORT, Action5eDraft, attackAbility, CREATURE_TYPES, CRS, DAMAGE_TYPES, damageText, Feature5eDraft, fromMonster5e, hpOf, HIT_DIE, modOf, Monster5eDraft,
	newAction5e, newFeature5e, newMonster5e, passivePerception, pbOf, saveBonus, SIZES, SKILL_ABILITY, skillBonus, toHit, toMonster5e, xpOfDraft,
} from './builder-model';
import { renderCard5e } from './cards';
import { Item5e, Spell5e, spellLine } from './compendium';
import type { Dnd5eEdition } from './editions';
import { ITEM_LANG, ITEM_TYPES_5E, itemLine5e, itemSource5e, RARITIES_5E, SCHOOLS_5E, SPELL_CLASSES_5E, SPELL_LANG, spellSource5e } from './homebrew';
import { toStatblockSource5e } from './parser';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { ABILITIES, AbilityKey, Dnd5eMonster } from './types';

const opts = (xs: readonly string[]) => () => xs.map(x => ({ value: x, label: x }));
const features = (key: string, label: string, add: string): FieldDef<Monster5eDraft> => ({
	type: 'list', key, label, add, blank: newFeature5e,
	title: (f, i) => (f as Feature5eDraft).name || `${label} ${i + 1}`,
	item: () => [{ type: 'text', key: 'name', label: 'Name', words: true }, { type: 'textarea', key: 'desc', label: 'Text', rows: 2 }],
});

// ----------------------------------------------------------------------------
// Monsters

export function monsterSchema(rt: Dnd5eRuntime): EntitySchema<Monster5eDraft> {
	const ability = (a: AbilityKey): FieldDef<Monster5eDraft> => ({
		type: 'number', key: a, label: ABILITY_SHORT[a].toUpperCase(), min: 1, max: 30, placeholder: () => '10', hint: d => formatMod(modOf(d, a)),
	});
	return {
		kind: 'monster', noun: 'monster', icon: 'skull',
		blank: (_p, path) => newMonster5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const m = (seed as { monster?: Dnd5eMonster } | undefined)?.monster;
			return m ? fromMonster5e(m, rt.edition(path)) : undefined;
		},
		steps: d => [
			{
				id: 'basics', label: 'Basics', icon: 'sparkles', title: 'What is it?', sub: 'Pick a size, type and challenge rating; proficiency, XP, hit points and attacks follow from them.',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Hound' },
					[{ type: 'choice', key: 'size', label: 'Size', options: opts(SIZES) }],
					[
						{ type: 'choice', key: 'type', label: 'Type', options: opts(CREATURE_TYPES), dropdown: true },
						{ type: 'text', key: 'tags', label: 'Tags', placeholder: '(goblinoid)' },
					],
					[
						{ type: 'choice', key: 'cr', label: 'Challenge', options: () => CRS.map(c => ({ value: c, label: `CR ${c}` })), dropdown: true, hint: x => `PB ${formatMod(pbOf(x))} · ${xpOfDraft(x).toLocaleString('en-US')} XP` },
						{ type: 'text', key: 'alignment', label: 'Alignment', placeholder: 'Neutral' },
					],
				],
			},
			{
				id: 'stats', label: 'Stats', icon: 'bar-chart-3', title: 'Abilities, armor and hit points',
				rows: [
					[ability('str'), ability('dex'), ability('con')],
					[ability('int'), ability('wis'), ability('cha')],
					[
						{ type: 'number', key: 'ac', label: 'AC', min: 1, max: 30, placeholder: x => String(10 + modOf(x, 'dex')) },
						{ type: 'text', key: 'acNote', label: 'Armor', placeholder: 'natural armor' },
					],
					[
						{ type: 'number', key: 'hitDice', label: 'Hit dice', min: 1, max: 99, placeholder: () => '1', hint: x => `d${HIT_DIE[x.size] ?? 8} each` },
						{ type: 'number', key: 'hp', label: 'HP', min: 1, max: 9999, placeholder: x => String(hpOf({ ...x, hp: undefined }).hp), hint: x => hpOf(x).formula ?? 'typed' },
					],
					{ type: 'text', key: 'speed', label: 'Speed', placeholder: '30 ft., fly 60 ft.' },
				],
			},
			{
				id: 'proficiencies', label: 'Skills', icon: 'target', title: 'Saves, skills and senses',
				rows: [
					{ type: 'chips', key: 'saves', label: 'Saving throws', options: () => ABILITIES.map(a => ABILITY_SHORT[a]), hint: x => x.saves.map(s => `${s} ${formatMod(saveBonus(x, ABILITIES.find(a => ABILITY_SHORT[a] === s)!))}`).join(', ') },
					{ type: 'chips', key: 'skills', label: 'Skills', options: () => Object.keys(SKILL_ABILITY), hint: x => x.skills.map(s => `${s} ${formatMod(skillBonus(x, s))}`).join(', ') },
					{ type: 'chips', key: 'expertise', label: 'Expertise', help: 'Double proficiency.', options: () => Object.keys(SKILL_ABILITY), show: x => x.skills.length > 0 },
					[
						{ type: 'text', key: 'senses', label: 'Senses', placeholder: 'Darkvision 60 ft.', hint: x => `Passive Perception ${passivePerception(x)}` },
						{ type: 'text', key: 'languages', label: 'Languages', placeholder: 'Common' },
					],
					[
						{ type: 'text', key: 'resistances', label: 'Resistances', placeholder: 'Fire, Poison' },
						{ type: 'text', key: 'immunities', label: 'Immunities', placeholder: 'Poison' },
					],
					[
						{ type: 'text', key: 'vulnerabilities', label: 'Vulnerabilities', placeholder: 'Cold' },
						{ type: 'text', key: 'conditionImmunities', label: 'Condition immunities', placeholder: 'Poisoned' },
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
							if (x.kind === 'text') return x.name || `Action ${i + 1}`;
							return `${x.name || `Attack ${i + 1}`} · ${formatMod(toHit(d, x))} · ${damageText(d, x)} ${x.damageType}`;
						},
						item: (a) => {
							const x = a as Action5eDraft;
							return [
								[
									{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Bite' },
									{ type: 'choice', key: 'kind', label: 'Kind', options: () => [{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }, { value: 'text', label: 'Other' }] },
								],
								[
									{ type: 'choice', key: 'ability', label: 'Uses', show: () => x.kind !== 'text', options: () => [...(['str', 'dex'] as AbilityKey[]).map(k => ({ value: k, label: ABILITY_SHORT[k] })), { value: 'finesse', label: 'Better of Str/Dex' }, ...(['con', 'int', 'wis', 'cha'] as AbilityKey[]).map(k => ({ value: k, label: ABILITY_SHORT[k] }))], dropdown: true, hint: () => `${ABILITY_SHORT[attackAbility(d, x)]} ${formatMod(toHit(d, x))} to hit` },
									{ type: 'number', key: 'reach', label: 'Reach (ft.)', min: 5, max: 30, step: 5, placeholder: () => '5', show: () => x.kind === 'melee' },
									{ type: 'text', key: 'range', label: 'Range (ft.)', placeholder: '80/320', show: () => x.kind === 'ranged' },
								],
								[
									{ type: 'number', key: 'count', label: 'Dice', min: 1, max: 40, placeholder: () => '1', show: () => x.kind !== 'text' },
									{ type: 'choice', key: 'sides', label: 'Die', show: () => x.kind !== 'text', options: () => ['4', '6', '8', '10', '12', '20'].map(s => ({ value: s, label: `d${s}` })) },
									{ type: 'choice', key: 'damageType', label: 'Damage', show: () => x.kind !== 'text', options: opts(DAMAGE_TYPES), dropdown: true, hint: () => damageText(d, x) },
								],
								{ type: 'text', key: 'extra', label: 'And then', placeholder: 'If the target is a creature, it has the Prone condition.', show: () => x.kind !== 'text' },
								{ type: 'textarea', key: 'desc', label: 'Text', rows: 2, show: () => x.kind === 'text' },
							];
						},
					},
					features('bonusActions', 'Bonus actions', 'Add a bonus action'),
					features('reactions', 'Reactions', 'Add a reaction'),
				],
			},
			{
				id: 'legendary', label: 'Legendary', icon: 'crown', title: 'Legendary actions', sub: 'Leave empty for an ordinary monster.',
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
			el.createDiv({ cls: 'eb-check-line', text: `CR ${d.cr} · ${xpOfDraft(d).toLocaleString('en-US')} XP · PB ${formatMod(pbOf(d))}` });
			el.createDiv({ cls: 'eb-check-line is-muted', text: `AC ${m.ac} · ${m.hp} HP · ${d.edition} rules` });
		},
		chip: d => ({ text: `CR ${d.cr} · ${xpOfDraft(d).toLocaleString('en-US')} XP`, tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the monster first.'),
		output: d => ({ lang: '5e', body: toStatblockSource5e(toMonster5e(d)), name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Monsters', 'Bestiary') }),
	};
}

// ----------------------------------------------------------------------------
// Spells

export interface Spell5eDraft extends Record<string, unknown> {
	edition: Dnd5eEdition;
	name: string;
	level?: number;
	school: string;
	castingTime: string;
	range: string;
	components: string[];
	material: string;
	duration: string;
	concentration: boolean;
	ritual: boolean;
	classes: string[];
	desc: string;
	higherLevel: string;
}

const CASTING = ['Action', 'Bonus Action', 'Reaction', '1 minute', '10 minutes', '1 hour'];

export function newSpell5e(edition: Dnd5eEdition): Spell5eDraft {
	return {
		edition, name: '', level: 1, school: 'Evocation', castingTime: edition === '2014' ? '1 action' : 'Action', range: '60 feet', components: ['V', 'S'], material: '',
		duration: 'Instantaneous', concentration: false, ritual: false, classes: [], desc: '', higherLevel: '',
	};
}

/** The draft as a spell. 2014 writes "1 action" and "Concentration, up to 1 minute"; so does this. */
export function toSpell5e(d: Spell5eDraft): Spell5e {
	const comps = ['V', 'S', 'M'].filter(c => d.components.includes(c)).map(c => (c === 'M' && d.material.trim() ? `M (${d.material.trim()})` : c)).join(', ') || 'V';
	const casting = d.edition === '2014' && /^(action|bonus action|reaction)$/i.test(d.castingTime) ? `1 ${d.castingTime.toLowerCase()}` : d.castingTime;
	const duration = d.concentration && !/^concentration/i.test(d.duration) ? `Concentration, up to ${d.duration.replace(/^up to\s+/i, '')}` : d.duration;
	const s: Spell5e = {
		name: d.name.trim() || 'Spell', level: d.level ?? 1, school: d.school, castingTime: casting, range: d.range.trim() || 'Self', components: comps,
		duration: duration.trim() || 'Instantaneous', desc: d.desc.trim(), classes: SPELL_CLASSES_5E.filter(c => d.classes.includes(c)),
	};
	if (d.higherLevel.trim()) s.higherLevel = d.higherLevel.trim();
	if (d.concentration || /^concentration/i.test(duration)) s.concentration = true;
	if (d.ritual) s.ritual = true;
	return s;
}

export function fromSpell5e(s: Spell5e, edition: Dnd5eEdition): Spell5eDraft {
	const m = /\bM\s*\(([^)]*)\)/.exec(s.components);
	return {
		...newSpell5e(edition), name: s.name, level: s.level, school: s.school, castingTime: s.castingTime.replace(/^1 (action|bonus action|reaction)$/i, (_x, w: string) => w.replace(/\b\w/g, c => c.toUpperCase())),
		range: s.range, components: ['V', 'S', 'M'].filter(c => new RegExp(`\\b${c}\\b`).test(s.components)), material: m?.[1] ?? '',
		duration: s.duration.replace(/^concentration,\s*up to\s+/i, ''), concentration: !!s.concentration, ritual: !!s.ritual, classes: [...s.classes], desc: s.desc, higherLevel: s.higherLevel ?? '',
	};
}

export function spellSchema(rt: Dnd5eRuntime): EntitySchema<Spell5eDraft> {
	return {
		kind: 'spell', noun: 'spell', icon: 'wand-2',
		blank: (_p, path) => newSpell5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const s = (seed as { spell?: Spell5e } | undefined)?.spell;
			return s ? fromSpell5e(s, rt.edition(path)) : undefined;
		},
		steps: () => [
			{
				id: 'basics', label: 'Basics', icon: 'sparkles', title: 'What are you casting?',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Lash' },
					[
						{ type: 'number', key: 'level', label: 'Level', min: 0, max: 9, placeholder: () => '1', hint: d => (d.level === 0 ? 'Cantrip' : `Level ${d.level ?? 1}`) },
						{ type: 'choice', key: 'school', label: 'School', options: opts(SCHOOLS_5E), dropdown: true },
					],
					{ type: 'chips', key: 'classes', label: 'Classes', options: () => [...SPELL_CLASSES_5E] },
				],
			},
			{
				id: 'casting', label: 'Casting', icon: 'hand', title: 'Casting',
				rows: [
					[
						{ type: 'choice', key: 'castingTime', label: 'Casting time', options: d => [...new Set([...CASTING, d.castingTime])].map(c => ({ value: c, label: c })), dropdown: true },
						{ type: 'text', key: 'range', label: 'Range', placeholder: '60 feet' },
					],
					{ type: 'chips', key: 'components', label: 'Components', options: () => ['V', 'S', 'M'] },
					{ type: 'text', key: 'material', label: 'Material', placeholder: 'a pinch of ash', show: d => d.components.includes('M') },
					[
						{ type: 'text', key: 'duration', label: 'Duration', placeholder: 'Instantaneous, 1 minute…' },
						{ type: 'toggle', key: 'concentration', label: 'Concentration' },
						{ type: 'toggle', key: 'ritual', label: 'Ritual' },
					],
				],
			},
			{
				id: 'effect', label: 'Effect', icon: 'flame', title: 'What it does',
				rows: [
					{ type: 'textarea', key: 'desc', label: 'Text', rows: 6, placeholder: 'Each creature in a 20-foot-radius Sphere makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save…' },
					{ type: 'textarea', key: 'higherLevel', label: 'At higher levels', rows: 2, placeholder: 'The damage increases by 1d6 for each spell slot level above 3.' },
				],
			},
		],
		preview(el, d) {
			const spell = toSpell5e(d);
			renderCard5e(el, { kind: 'spell', name: spell.name, edition: d.edition, detail: spellLine(spell, d.edition), spell }, rt.cardOptions(''));
		},
		chip: d => ({ text: d.level === 0 ? 'Cantrip' : `Level ${d.level ?? 1}`, tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the spell first.'),
		output: d => ({ lang: SPELL_LANG, body: spellSource5e(toSpell5e(d), d.edition), name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Homebrew', 'Homebrew') }),
	};
}

// ----------------------------------------------------------------------------
// Magic items

export interface Item5eDraft extends Record<string, unknown> {
	edition: Dnd5eEdition;
	name: string;
	type: string;
	/** "(Longsword)", "(any heavy armor)". */
	subtype: string;
	rarity: string;
	attunement: boolean;
	attunedBy: string;
	desc: string;
}

export function newItem5e(edition: Dnd5eEdition): Item5eDraft {
	return { edition, name: '', type: 'Wondrous item', subtype: '', rarity: 'Uncommon', attunement: false, attunedBy: '', desc: '' };
}

export function itemTypeText(d: Item5eDraft): string {
	const sub = d.subtype.trim();
	return sub ? `${d.type} ${/^\(.*\)$/.test(sub) ? sub : `(${sub})`}` : d.type;
}

export function toItem5e(d: Item5eDraft): Item5e {
	const att = { on: d.attunement, by: d.attunedBy.trim() || undefined };
	const item: Item5e = { name: d.name.trim() || 'Item', type: itemTypeText(d), rarity: d.rarity, desc: d.desc.trim(), line: itemLine5e(itemTypeText(d), d.rarity, att, d.edition) };
	if (d.attunement) item.attunement = true;
	return item;
}

export function fromItem5e(i: Item5e, edition: Dnd5eEdition): Item5eDraft {
	const m = /^(.*?)\s*(\(.*\))?$/.exec(i.type.trim());
	const by = /requires attunement by ([^)]*)\)/i.exec(i.line ?? '')?.[1];
	return {
		...newItem5e(edition), name: i.name, type: ITEM_TYPES_5E.find(t => t.toLowerCase() === (m?.[1] ?? '').toLowerCase().replace(/s$/, '')) ?? (m?.[1] || 'Wondrous item'),
		subtype: m?.[2] ?? '', rarity: RARITIES_5E.find(r => r.toLowerCase() === i.rarity.toLowerCase()) ?? i.rarity, attunement: !!i.attunement, attunedBy: by ?? '', desc: i.desc,
	};
}

export function itemSchema(rt: Dnd5eRuntime): EntitySchema<Item5eDraft> {
	return {
		kind: 'item', noun: 'item', icon: 'gem',
		blank: (_p, path) => newItem5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const i = (seed as { item?: Item5e } | undefined)?.item;
			return i ? fromItem5e(i, rt.edition(path)) : undefined;
		},
		steps: () => [
			{
				id: 'basics', label: 'Item', icon: 'gem', title: 'What is it?',
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Blade' },
					[
						{ type: 'choice', key: 'type', label: 'Type', options: opts(ITEM_TYPES_5E), dropdown: true },
						{ type: 'text', key: 'subtype', label: 'Which', placeholder: 'Longsword, any heavy armor…' },
					],
					{ type: 'choice', key: 'rarity', label: 'Rarity', options: opts(RARITIES_5E) },
					[
						{ type: 'toggle', key: 'attunement', label: 'Attunement' },
						{ type: 'text', key: 'attunedBy', label: 'By', placeholder: 'a Paladin', show: d => d.attunement },
					],
					{ type: 'textarea', key: 'desc', label: 'Text', rows: 6, placeholder: 'You gain a +1 bonus to attack and damage rolls made with this magic weapon…' },
				],
			},
		],
		preview(el, d) {
			const item = toItem5e(d);
			renderCard5e(el, { kind: 'item', name: item.name, edition: d.edition, detail: item.line ?? '', item }, rt.cardOptions(''));
		},
		chip: d => ({ text: d.rarity, tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the item first.'),
		output: d => ({ lang: ITEM_LANG, body: itemSource5e({ ...toItem5e(d), attunement: d.attunement ? (d.attunedBy.trim() || true) : false }), name: d.name.trim(), frontmatter: {}, folder: homeFolder(rt.plugin, 'Homebrew', 'Homebrew') }),
	};
}

/** 5e's kinds in core's builder. */
export function registerBuilders5e(rt: Dnd5eRuntime): void {
	registerKind('dnd5e', 'monster', { label: 'Monster', icon: 'skull' }, schemaKind(monsterSchema(rt)));
	registerKind('dnd5e', 'spell', { label: 'Spell', icon: 'wand-2' }, schemaKind(spellSchema(rt)));
	registerKind('dnd5e', 'item', { label: 'Magic item', icon: 'gem' }, schemaKind(itemSchema(rt)));
}
