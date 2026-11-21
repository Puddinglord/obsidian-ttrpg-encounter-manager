// What 5e takes in content packs: monsters, spells, magic items, equipment,
// feats, backgrounds, species, classes and subclasses, with the same fields as
// the SRD data (compendium.ts, types.ts). A monster can also be given as a
// `statblock`: the text of a ```5e block. Pure: no Obsidian imports.

import type { PackEntry } from '../../core/content/packs';
import type { FieldSpec, KindSpec } from '../../core/content/spec';
import type { BlockSpec } from '../../core/content/blocks';
import type { Background5e, Class5e, Compendium5e, Equipment5e, Feat5e, Item5e, Species5e, Spell5e, Subclass5e } from './compendium';
import { SCHOOLS_5E } from './homebrew';
import { parseStatblock5e } from './parser';
import { crValue } from './rules';
import type { Dnd5eMonster } from './types';

const text = (description?: string, required = false): FieldSpec => ({ type: 'string', required, description });
const named = (extra: Record<string, FieldSpec> = {}): Record<string, FieldSpec> => ({ name: text('The name, as references use it.', true), ...extra });
const feature = { name: text(undefined, true), desc: text('The text. Markdown is fine.', true) };
const levelFeature = {
	level: { type: 'number', integer: true, min: 1, max: 20, required: true } as FieldSpec, ...feature,
	group: text('This feature is one choice of the feature named here ("Ward Stance"), for options not named "Ward Stance: Ember".'),
};
/** Limited-use features the level table doesn't count. */
const resources: FieldSpec = {
	type: 'list',
	description: 'Limited-use features the level table doesn\'t count, with pips on the sheet.',
	of: {
		name: text(undefined, true),
		uses: text('How many: a number, or a formula of ability modifiers, PB and level: "CHA", "Charisma modifier", "PB", "2 + WIS".', true),
		min: { type: 'number', integer: true, min: 0, description: 'At least this many (1 for "minimum of once").' },
		level: { type: 'number', integer: true, min: 1, max: 20, description: 'The class level it starts at (1 if left out).' },
		reset: { type: 'string', enum: ['short', 'long'], description: 'What brings them all back: a short or a long rest (long if left out).' },
		shortFrom: { type: 'number', integer: true, min: 1, max: 20, description: 'From this level a short rest brings them all back.' },
		shortOne: { type: 'boolean', description: 'A short rest brings back one.' },
	},
};
/** Starting equipment: a choice (A or B), each option's items ("2 Javelin"), picks from a list, and gold. */
const startingEquipment: FieldSpec = {
	type: 'list',
	description: 'What a new character starts with: each entry is one choice ("A or B"); an option gives items ("2 Javelin" for two), picks from a list, and gold.',
	of: {
		label: text('The choice as the book writes it: "(A) Chain Mail and a Shield; or (B) 75 GP".'),
		options: { type: 'list', required: true, of: {
			label: text('"A", "B".', true), items: { type: 'strings', description: 'Items by name; a number first for several: "2 Javelin".' },
			picks: { type: 'list', of: { label: text('"Musical Instrument".'), count: { type: 'number', integer: true, min: 1 }, from: { type: 'strings', required: true } } },
			gold: { type: 'number', min: 0 },
		} },
	},
};
const toolChoices: FieldSpec = { type: 'object', description: 'Tools to choose: how many, from which.', fields: { count: { type: 'number', integer: true, min: 1, required: true }, from: { type: 'strings', required: true } } };

export const KINDS_5E: KindSpec[] = [
	{
		kind: 'monster', label: 'Monster', description: 'A stat block. Give the fields, or "statblock" with the text of a ```5e block.',
		fields: named({
			statblock: text('The whole stat block in the ```5e block format, instead of the fields below.'),
			size: text('Tiny, Small, Medium, Large, Huge or Gargantuan.'), type: text('"humanoid (goblinoid)"'), alignment: text(),
			ac: { type: 'number', integer: true, min: 0, max: 40 }, acNote: text('"natural armor"'),
			hp: { type: 'number', integer: true, min: 1 }, hpFormula: text('"4d8 + 4"'), speed: text('"30 ft., fly 60 ft."'),
			abilities: { type: 'numbers', length: 6, description: 'Str, Dex, Con, Int, Wis, Cha scores.' },
			saves: { type: 'map', description: 'Saving throw bonuses that differ from the modifier: { "dex": 5 }.' },
			skills: { type: 'map', description: '{ "Stealth": 6 }' },
			vulnerabilities: { type: 'strings' }, resistances: { type: 'strings' }, immunities: { type: 'strings' }, conditionImmunities: { type: 'strings' },
			senses: text(), languages: text(), cr: text('"1/4", "5"'), xp: { type: 'number', integer: true, min: 0 }, pb: { type: 'number', integer: true },
			initiative: { type: 'number', integer: true }, gear: text(),
			traits: { type: 'list', of: feature }, actions: { type: 'list', of: feature }, bonusActions: { type: 'list', of: feature },
			reactions: { type: 'list', of: feature }, legendaryActions: { type: 'list', of: feature }, legendaryIntro: text(), description: text(), source: text(),
		}),
		check: (v) => {
			if (typeof v.statblock === 'string') return parseStatblock5e(v.statblock) ? [] : ['"statblock" isn\'t a 5e stat block: it starts with "name: …"'];
			const missing = ['ac', 'hp', 'abilities', 'cr'].filter(k => v[k] === undefined);
			if (missing.length) return [`Give "statblock", or ${missing.map(k => `"${k}"`).join(', ')}`];
			return crValue(v.cr as string) === undefined ? [`"cr" should be a challenge rating, like "1/4" or "5" (it says "${String(v.cr)}")`] : [];
		},
	},
	{
		kind: 'spell', label: 'Spell', description: 'A spell, as the compendium shows it.',
		fields: named({
			level: { type: 'number', integer: true, min: 0, max: 9, required: true, description: '0 for a cantrip.' },
			school: { type: 'string', enum: SCHOOLS_5E, required: true }, castingTime: text('"Action", "1 minute"', true), range: text('"60 feet"', true),
			components: text('"V, S, M (a pinch of ash)"', true), duration: text('"Instantaneous", "Concentration, up to 1 minute"', true),
			desc: text(undefined, true), higherLevel: text('What a higher-level slot adds.'), classes: { type: 'strings' }, concentration: { type: 'boolean' }, ritual: { type: 'boolean' },
		}),
	},
	{
		kind: 'item', label: 'Magic item', description: 'A magic item.',
		fields: named({ rarity: text('Common, Uncommon, Rare, Very Rare, Legendary or Artifact.', true), type: text('"Wondrous item", "Weapon (Longsword)"', true), desc: text(undefined, true), attunement: { type: 'boolean' }, line: text('The line under the name, if not the usual "Weapon (Longsword), rare".') }),
	},
	{
		kind: 'equipment', label: 'Equipment', description: 'A weapon, armor, tool or piece of gear.',
		fields: named({
			category: text('"Weapon", "Armor", "Adventuring Gear", "Tools"', true), cost: text('"15 gp"'), weight: { type: 'number', min: 0 },
			weaponCategory: text('Simple or Martial.'), weaponRange: text('Melee or Ranged.'), damage: text('"1d8 slashing"'), versatile: text(), range: text(),
			properties: { type: 'strings' }, mastery: text(), armorCategory: text('Light, Medium, Heavy or Shield.'),
			ac: { type: 'object', fields: { base: { type: 'number', integer: true, required: true }, dex: { type: 'boolean', required: true }, max: { type: 'number', integer: true } } },
			strMin: { type: 'number', integer: true }, stealthDisadvantage: { type: 'boolean' }, desc: text(),
		}),
	},
	{
		kind: 'feat', label: 'Feat', description: 'A feat.',
		fields: named({ desc: text(undefined, true), prerequisite: text(), type: text('origin, general, fighting-style, epic-boon') }),
		starter: { type: 'general', prerequisite: '', desc: '' },
	},
	{
		kind: 'background', label: 'Background', description: 'A background.',
		fields: named({
			proficiencies: { type: 'strings' }, abilityScores: { type: 'strings' }, feat: text(), feature: { type: 'object', fields: feature }, equipment: text('The equipment as the book writes it.'),
			startingEquipment, tools: { type: 'strings', description: 'Tools it gives.' }, toolChoices,
		}),
		starter: { abilityScores: [], feat: '', proficiencies: [], equipment: '' },
	},
	{
		kind: 'species', label: 'Species', description: 'A species (2014: a race).',
		fields: named({
			size: text(undefined, true), speed: { type: 'number', integer: true, min: 0, required: true }, type: text(), abilityBonuses: text(), desc: text(),
			traits: { type: 'list', of: feature }, subspecies: { type: 'list', of: { name: text(undefined, true), desc: text(), traits: { type: 'list', of: feature } } },
		}),
		starter: { size: 'Medium', speed: 30, type: 'Humanoid', desc: '', traits: [{ name: '', desc: '' }] },
	},
	{
		kind: 'class', label: 'Class', description: 'A whole class, with its features and level table.',
		fields: named({
			hitDie: { type: 'number', integer: true, min: 4, max: 12, required: true }, primary: text(), saves: { type: 'strings', required: true },
			proficiencies: { type: 'strings' }, skillChoice: text(), spellcasting: text(), spellList: text('The class whose spell list it casts from, when it isn\'t its own: "Paladin".'),
			resources, startingEquipment, toolChoices,
			features: { type: 'list', of: levelFeature, required: true },
			levels: { type: 'list', of: {
				level: { type: 'number', integer: true, min: 1, max: 20, required: true }, pb: { type: 'number', integer: true, required: true }, features: { type: 'strings' }, slots: { type: 'numbers' },
				cantrips: { type: 'number', integer: true }, prepared: { type: 'number', integer: true, min: 0, description: 'Spells known or prepared at this level (its table\'s column).' },
				extra: { type: 'map', description: 'The class\'s own numbers at this level. A name ending in _uses is a limited-use feature: { "blood_maledict_uses": 2 }.' },
			} },
			subclasses: { type: 'list', of: { name: text(undefined, true), flavor: text(), desc: text(), features: { type: 'list', of: levelFeature }, resources } },
		}),
		starter: {
			hitDie: 8, primary: '', saves: [], proficiencies: [], skillChoice: '',
			features: [{ level: 1, name: '', desc: '' }],
			levels: [{ level: 1, pb: 2, features: [] }, { level: 2, pb: 2, features: [] }, { level: 3, pb: 2, features: [] }],
		},
	},
	{
		kind: 'subclass', label: 'Subclass', description: 'A subclass for a class (the SRD\'s or a pack\'s), by the class\'s name.',
		fields: named({ class: text('The class it belongs to: "Barbarian".', true), flavor: text('"Primal Path"'), desc: text(), features: { type: 'list', of: levelFeature, required: true }, resources }),
		starter: { class: '', flavor: '', desc: '', features: [{ level: 3, name: '', desc: '' }] },
	},
];

/** The kinds written as ```5e-<kind> blocks (monsters, spells and items have their own: ```5e, ```5e-spell, ```5e-item). */
export const BLOCKS_5E: BlockSpec = { prefix: '5e', folder: '5e', kinds: ['class', 'subclass', 'feat', 'species', 'background'] };

/** What the packs add to an edition's compendium (subclasses by their class's name), and their monsters. */
export interface Content5e {
	compendium: Partial<Pick<Compendium5e, 'spells' | 'items' | 'equipment' | 'feats' | 'backgrounds' | 'species' | 'classes'>>;
	subclasses: { className: string; subclass: Subclass5e }[];
	monsters: { monster: Dnd5eMonster; pack: string }[];
}

/** Pack entries (in order: later packs win a name) as 5e content. */
export function content5e(entries: (PackEntry & { pack: string })[]): Content5e {
	const out: Content5e = { compendium: {}, subclasses: [], monsters: [] };
	const put = <K extends keyof Content5e['compendium']>(k: K, v: NonNullable<Content5e['compendium'][K]>[number] & { name: string }) => {
		const list = (out.compendium[k] ??= [] as never) as { name: string }[];
		const i = list.findIndex(x => x.name.toLowerCase() === v.name.toLowerCase());
		if (i >= 0) list[i] = v; else list.push(v);
	};
	for (const e of entries) {
		// Where it's from, for the card and the compendium's tag; your homebrew names its note.
		const v = e.kind === 'monster' ? e.value : { ...e.value, source: e.pack, ...(e.file ? { note: e.file } : {}) };
		switch (e.kind) {
			case 'monster': {
				const m = typeof v.statblock === 'string' ? parseStatblock5e(v.statblock) : ({ ...v, cr: String(v.cr), source: v.source ?? e.pack } as unknown as Dnd5eMonster);
				if (m) out.monsters.push({ monster: { ...m, name: m.name || e.name, source: m.source ?? e.pack }, pack: e.pack });
				break;
			}
			case 'spell': put('spells', { classes: [], ...v } as unknown as Spell5e); break;
			case 'item': put('items', v as unknown as Item5e); break;
			case 'equipment': put('equipment', v as unknown as Equipment5e); break;
			case 'feat': put('feats', v as unknown as Feat5e); break;
			case 'background': put('backgrounds', { proficiencies: [], ...v } as unknown as Background5e); break;
			case 'species': put('species', { traits: [], subspecies: [], ...v } as unknown as Species5e); break;
			case 'class': put('classes', { proficiencies: [], skillChoice: '', levels: [], subclasses: [], ...v } as unknown as Class5e); break;
			case 'subclass': out.subclasses.push({ className: String(v.class), subclass: { flavor: '', desc: '', ...v } as unknown as Subclass5e }); break;
		}
	}
	return out;
}

/** An edition's compendium with content on top: a pack's entry replaces the SRD's of the same name, and subclasses join their class. */
export function mergeCompendium5e(base: Compendium5e, add: Content5e): Compendium5e {
	const merge = <T extends { name: string }>(a: T[], b: T[] | undefined): T[] => {
		if (!b?.length) return a;
		const names = new Set(b.map(x => x.name.toLowerCase()));
		return [...a.filter(x => !names.has(x.name.toLowerCase())), ...b];
	};
	const classes = merge(base.classes, add.compendium.classes).map(c => {
		const subs = add.subclasses.filter(s => s.className.toLowerCase() === c.name.toLowerCase()).map(s => s.subclass);
		return subs.length ? { ...c, subclasses: merge(c.subclasses, subs) } : c;
	});
	return {
		...base,
		spells: merge(base.spells, add.compendium.spells),
		items: merge(base.items, add.compendium.items),
		equipment: merge(base.equipment, add.compendium.equipment),
		feats: merge(base.feats, add.compendium.feats),
		backgrounds: merge(base.backgrounds, add.compendium.backgrounds),
		species: merge(base.species, add.compendium.species),
		classes,
	};
}
