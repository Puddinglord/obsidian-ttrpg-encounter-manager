// 5e's character wizards on core's builder: New character (who, abilities,
// skills, subclass and spells, with the sheet's numbers as the preview) and
// Level up (hit points, a subclass when it's time, an ability score increase
// or a feat, new spells). The rules are in character-draft.ts; both read the
// compendium, so content packs' classes and subclasses work the same.

import { Notice, TFile } from 'obsidian';
import type { NewCharacterRequest } from '../contract';
import { openBuilder, registerKind } from '../../core/builder/frame';
import { EntitySchema, schemaKind } from '../../core/builder/schema';
import { Frontmatter, readSheet5e, SKILLS } from './character';
import {
	ABILITY_OF, applyLevelUp5e, asiLevels, averageGain, backgroundOf, backgroundSkills, Character5eDraft, characterFm, characterMissing, classOf, classSpells,
	hasAsi, plusOf, LevelUp5eDraft, needsSubclass, newCharacter5e, newLevelUp5e, newSpellLevel, skillChoice, speciesOf, spellsAt, subclassLevel, withArray,
} from './character-draft';
import { compendium5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { SHEET_LANG } from './sheet';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';
import { abilityCards, levelUpBrief, pointBudget, sheetBrief, spellLevelLabel } from './wizard-ui';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const short = (a: AbilityKey) => a.toUpperCase();
const titleCase = (a: string) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase();

/** A class's spells up to a level, under their levels' headings. */
function spellGroups(edition: Dnd5eEdition, cls: string, upTo: number, without: string[] = []): { label: string; options: string[] }[] {
	const all = new Set(classSpells(edition, cls, upTo, false).filter(n => !without.some(k => same(k, n))));
	const levels = new Map<number, string[]>();
	for (const sp of compendium5e(edition).spells) if (all.has(sp.name)) levels.set(sp.level, [...(levels.get(sp.level) ?? []), sp.name]);
	return [...levels.keys()].sort((x, y) => x - y).map(l => ({ label: spellLevelLabel(l, edition), options: [...new Set(levels.get(l))].sort() }));
}

// ----------------------------------------------------------------------------
// New character

/** The background's abilities for its +2 or +1, after "the best for your class". */
function plusOptions(d: Character5eDraft, which: 'p2' | 'p1'): { value: string; label: string }[] {
	const auto = plusOf(settle(d))[which];
	const offered = backgroundOf(d)?.abilityScores ?? ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
	return [{ value: '', label: `Best for your class${auto ? ` (${auto.toUpperCase()})` : ''}` }, ...offered.map(s => ({ value: ABILITY_OF[s.toUpperCase()] ?? s, label: s }))];
}

/** Keep a draft consistent: the array follows the class; a +2/+1 the background doesn't offer goes back to automatic. */
function settle(d: Character5eDraft): Character5eDraft {
	if (d.method === 'array') withArray(d);
	const offered = (backgroundOf(d)?.abilityScores ?? []).map(s => ABILITY_OF[s.toUpperCase()]).filter(Boolean);
	if (d.plus2 && !offered.includes(d.plus2 as AbilityKey)) d.plus2 = '';
	if (d.plus1 && !offered.includes(d.plus1 as AbilityKey)) d.plus1 = '';
	const sp = speciesOf(d);
	if (sp && d.subspecies && !sp.subspecies.some(x => same(x.name, d.subspecies))) d.subspecies = '';
	const sc = skillChoice(classOf(d.edition, d.className)?.skillChoice ?? '');
	const bg = backgroundSkills(backgroundOf(d));
	d.skills = d.skills.filter(s => sc.from.includes(s) && !bg.includes(s)).slice(0, sc.count);
	return d;
}

export function characterSchema(rt: Dnd5eRuntime): EntitySchema<Character5eDraft & { folder?: string }> {
	const comp = (d: { edition: Dnd5eEdition }) => compendium5e(d.edition);
	return {
		kind: 'character', noun: 'character', icon: 'user-round',
		blank: (_p, path) => newCharacter5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const r = (seed as { request?: NewCharacterRequest } | undefined)?.request;
			if (!r) return undefined;
			const ed = rt.edition(r.folder ?? path);
			return { ...newCharacter5e(ed, { name: r.name, level: r.level, mine: r.mine }), folder: r.folder };
		},
		steps: d => [
			{
				id: 'who', label: 'Who', icon: 'user-round', title: 'Who are they?', sub: `${d.edition} rules.`,
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ilse Vane' },
					[
						{ type: 'choice', rebuilds: true, key: 'className', label: 'Class', dropdown: true, options: x => comp(x).classes.map(c => ({ value: c.name, label: `${c.name} (d${c.hitDie})` })), hint: x => { const sv = classOf(x.edition, x.className)?.saves ?? []; return sv.length ? `Saves ${sv.map(titleCase).join(', ')}` : ''; } },
						{ type: 'number', rebuilds: true, key: 'level', label: 'Level', min: 1, max: 20, placeholder: () => '1' },
					],
					[
						{ type: 'choice', rebuilds: true, key: 'species', label: d.edition === '2014' ? 'Race' : 'Species', dropdown: true, options: x => comp(x).species.map(s => ({ value: s.name, label: s.name })) },
						{ type: 'choice', rebuilds: true, key: 'subspecies', label: d.edition === '2014' ? 'Subrace' : 'Lineage', dropdown: true, show: x => (speciesOf(x)?.subspecies.length ?? 0) > 0, options: x => [{ value: '', label: '—' }, ...(speciesOf(x)?.subspecies ?? []).map(s => ({ value: s.name, label: s.name }))] },
					],
					{ type: 'choice', rebuilds: true, key: 'background', label: 'Background', dropdown: true, options: x => comp(x).backgrounds.map(b => ({ value: b.name, label: b.name })), hint: x => { const sk = backgroundSkills(backgroundOf(x)); return sk.length ? `Skills ${sk.join(', ')}` : ''; } },
				],
			},
			{
				id: 'abilities', label: 'Abilities', icon: 'bar-chart-3', title: 'Ability scores',
				rows: [
					{
						type: 'choice', rebuilds: true, key: 'method', label: 'Scores', options: () => [{ value: 'array', label: 'Standard array' }, { value: 'pointbuy', label: 'Point buy' }, { value: 'manual', label: 'Your own' }],
						hint: x => (x.method === 'array' ? 'Set out for your class' : x.method === 'manual' ? 'Rolled or given' : ''),
					},
					{ type: 'custom', key: 'points', label: 'Points', show: x => x.method === 'pointbuy', draw: (el, x, ui) => pointBudget(el, x, ui) },
					{ type: 'custom', key: 'abilities', label: 'Abilities', draw: (el, x, ui) => abilityCards(el, x, ui, settle) },
					...(d.edition === '2024' ? [[
						{ type: 'choice' as const, key: 'plus2', label: '+2 to', dropdown: true, options: (x: Character5eDraft) => plusOptions(x, 'p2') },
						{ type: 'choice' as const, key: 'plus1', label: '+1 to', dropdown: true, options: (x: Character5eDraft) => plusOptions(x, 'p1') },
					]] : []),
				],
			},
			{
				id: 'skills', label: 'Skills', icon: 'target', title: 'Skills',
				rows: [
					{
						type: 'chips', key: 'skills', label: 'Class skills', options: x => { const bg = backgroundSkills(backgroundOf(x)); return skillChoice(classOf(x.edition, x.className)?.skillChoice ?? '').from.filter(s => !bg.includes(s)); },
						max: x => skillChoice(classOf(x.edition, x.className)?.skillChoice ?? '').count,
						hint: x => `${x.skills.length} of ${skillChoice(classOf(x.edition, x.className)?.skillChoice ?? '').count}`,
						fixed: x => ({ values: backgroundSkills(backgroundOf(x)), why: 'From your background' }),
						meta: opt => titleCase(SKILLS.find(k => same(k.name, opt))?.ability ?? ''),
					},
				],
			},
			{
				id: 'class', label: 'Class', icon: 'graduation-cap', title: 'Subclass and spells',
				rows: [
					{ type: 'choice', key: 'subclass', label: 'Subclass', dropdown: true, show: x => (x.level ?? 1) >= subclassLevel(classOf(x.edition, x.className)) && (classOf(x.edition, x.className)?.subclasses.length ?? 0) > 0, options: x => [{ value: '', label: 'Choose later' }, ...(classOf(x.edition, x.className)?.subclasses ?? []).map(s => ({ value: s.name, label: s.name }))] },
					{ type: 'chips', key: 'cantrips', label: 'Cantrips', show: x => spellsAt(classOf(x.edition, x.className), x.level ?? 1).cantrips > 0, options: x => classSpells(x.edition, x.className, 0, true), max: x => spellsAt(classOf(x.edition, x.className), x.level ?? 1).cantrips, hint: x => `${x.cantrips.length} of ${spellsAt(classOf(x.edition, x.className), x.level ?? 1).cantrips}` },
					{
						type: 'chips', key: 'spells', label: 'Spells', show: x => spellsAt(classOf(x.edition, x.className), x.level ?? 1).maxLevel > 0,
						options: x => classSpells(x.edition, x.className, spellsAt(classOf(x.edition, x.className), x.level ?? 1).maxLevel, false),
						groups: x => spellGroups(x.edition, x.className, spellsAt(classOf(x.edition, x.className), x.level ?? 1).maxLevel),
						hint: x => `${x.spells.length} picked`,
					},
				],
			},
		],
		preview(el, d) {
			settle(d);
			const s = readSheet5e(characterFm({ ...d, name: d.name || 'New hero' }), d.edition, d.name || 'New hero');
			sheetBrief(el, s, `Level ${s.level} ${[d.edition === '2014' && d.subspecies ? d.subspecies : d.species, d.className].filter(Boolean).join(' ')}${s.subclass ? ` (${s.subclass})` : ''}${d.background ? ` · ${d.background}` : ''}`);
		},
		chip: d => ({ text: `${d.className} ${d.level ?? 1}`, tone: 'none' }),
		missing: d => characterMissing(settle(d)),
		output: d => {
			settle(d);
			const c = rt.plugin.campaigns.active;
			return {
				lang: SHEET_LANG, body: '', name: d.name.trim(), frontmatter: {}, properties: characterFm(d), after: '## Notes',
				folder: d.folder ?? (c ? `${c.folder}/Party` : ''),
			};
		},
	};
}

// ----------------------------------------------------------------------------
// Level up

export function levelUpSchema(rt: Dnd5eRuntime): EntitySchema<LevelUp5eDraft> {
	return {
		kind: 'level-up', noun: 'level up', icon: 'trending-up',
		blank: (_p, path) => newLevelUp5e({}, rt.edition(path)),
		seed: (seed) => {
			const s = seed as { fm?: Frontmatter; edition?: Dnd5eEdition; name?: string } | undefined;
			return s?.fm ? newLevelUp5e(s.fm, s.edition ?? '2024', s.name) : undefined;
		},
		steps: d => [
			{
				id: 'hp', label: 'Hit points', icon: 'heart', title: `${d.name} reaches level ${d.level}`,
				rows: [
					{ type: 'choice', key: 'hp', label: 'Hit points', options: x => [{ value: 'average', label: `Take ${averageGain(x)}` }, { value: 'roll', label: `Roll 1d${x.hitDie}${x.conMod ? ` ${formatMod(x.conMod)}` : ''}` }, { value: 'manual', label: 'Rolled at the table' }] },
					{ type: 'number', key: 'manual', label: `What the d${d.hitDie} showed`, min: 1, max: d.hitDie, placeholder: x => String(Math.floor(x.hitDie / 2) + 1), show: x => x.hp === 'manual', hint: x => `+${Math.max(1, (x.manual ?? Math.floor(x.hitDie / 2) + 1) + x.conMod)} HP` },
				],
			},
			...(needsSubclass(d) ? [{
				id: 'subclass', label: 'Subclass', icon: 'git-branch', title: 'Choose a subclass',
				rows: [{ type: 'choice' as const, key: 'subclass', label: 'Subclass', dropdown: true, options: (x: LevelUp5eDraft) => [{ value: '', label: 'Choose later' }, ...(classOf(x.edition, x.className)?.subclasses ?? []).map(s => ({ value: s.name, label: s.name }))] }],
			}] : []),
			...(hasAsi(d) ? [{
				id: 'asi', label: d.level === 19 && d.edition === '2024' ? 'Epic Boon' : 'Increase', icon: 'arrow-up-circle', title: d.level === 19 && d.edition === '2024' ? 'An Epic Boon, or an increase' : 'Ability Score Improvement',
				rows: [
					{ type: 'choice' as const, key: 'asi', label: 'Take', options: () => [{ value: 'plus2', label: '+2 to one' }, { value: 'plus1', label: '+1 to two' }, { value: 'feat', label: 'A feat' }] },
					[
						{ type: 'choice' as const, key: 'a1', label: 'Ability', dropdown: true, show: (x: LevelUp5eDraft) => x.asi !== 'feat', options: (x: LevelUp5eDraft) => ABILITIES.map(a => ({ value: a, label: `${ABILITY_NAME[a]} (${x.scores[a]})` })) },
						{ type: 'choice' as const, key: 'a2', label: 'And', dropdown: true, show: (x: LevelUp5eDraft) => x.asi === 'plus1', options: (x: LevelUp5eDraft) => ABILITIES.map(a => ({ value: a, label: `${ABILITY_NAME[a]} (${x.scores[a]})` })) },
					],
					{ type: 'choice' as const, key: 'feat', label: 'Feat', dropdown: true, show: (x: LevelUp5eDraft) => x.asi === 'feat', options: (x: LevelUp5eDraft) => [{ value: '', label: '—' }, ...compendium5e(x.edition).feats.filter(f => f.type !== 'origin' && f.type !== 'fighting-style' && (f.type !== 'epic-boon' || x.level >= 19)).map(f => ({ value: f.name, label: f.name }))] },
				],
			}] : []),
			...(newSpellLevel(d) > 0 ? [{
				id: 'spells', label: 'Spells', icon: 'wand-2', title: 'New spells',
				rows: [{
					type: 'chips' as const, key: 'spells', label: 'Spells', hint: (x: LevelUp5eDraft) => `${x.spells.length} picked`,
					options: (x: LevelUp5eDraft) => classSpells(x.edition, x.className, newSpellLevel(x), false).filter(n => !x.known.some(k => same(k, n))),
					groups: (x: LevelUp5eDraft) => spellGroups(x.edition, x.className, newSpellLevel(x), x.known),
				}],
			}] : []),
		],
		preview(el, d) {
			const cls = classOf(d.edition, d.className);
			const gain = d.hp === 'roll' ? `1d${d.hitDie}${d.conMod ? ` ${formatMod(d.conMod)}` : ''}` : `+${d.hp === 'manual' ? Math.max(1, (d.manual ?? Math.floor(d.hitDie / 2) + 1) + d.conMod) : averageGain(d)}`;
			levelUpBrief(el, d, {
				gained: (cls?.features ?? []).filter(f => f.level === d.level).map(f => f.name),
				hpGain: gain,
				subclass: needsSubclass(d) ? d.subclass : undefined,
				increase: !hasAsi(d) ? undefined : d.asi === 'feat' ? d.feat || 'Not chosen yet'
					: d.asi === 'plus2' ? `${short(d.a1 as AbilityKey)} ${d.scores[d.a1 as AbilityKey]} → ${Math.min(20, d.scores[d.a1 as AbilityKey] + 2)}`
						: d.a1 === d.a2 ? `${short(d.a1 as AbilityKey)} ${d.scores[d.a1 as AbilityKey]} → ${Math.min(20, d.scores[d.a1 as AbilityKey] + 2)}`
							: `${short(d.a1 as AbilityKey)} +1, ${short(d.a2 as AbilityKey)} +1`,
				nextIncrease: asiLevels(cls).find(l => l > d.level),
			});
		},
		chip: d => ({ text: `Level ${d.level}`, tone: 'none' }),
		missing: d => (d.level > 20 || d.level < 2 ? 'This character is already level 20.' : null),
		output: d => ({ lang: '', body: '', name: d.name, frontmatter: {}, folder: '', data: d }),
	};
}

/** 5e's wizards in core's builder: opened from New character and a sheet's Level up, not the kind bar. */
export function registerWizards5e(rt: Dnd5eRuntime): void {
	registerKind('dnd5e', 'character', { label: 'Character', icon: 'user-round', hidden: true }, schemaKind(characterSchema(rt)));
	registerKind('dnd5e', 'level-up', { label: 'Level up', icon: 'trending-up', hidden: true }, schemaKind(levelUpSchema(rt)));
}

/** New character, in the builder. */
export function openNewCharacter5e(rt: Dnd5eRuntime, r: NewCharacterRequest): void {
	openBuilder(rt.plugin, { system: 'dnd5e', kind: 'character', seed: { request: r }, sourcePath: r.folder, onCreated: r.onCreated });
}

/** Level up a character's note, in the builder. */
export function openLevelUp5e(rt: Dnd5eRuntime, file: TFile, fm: Frontmatter, edition: Dnd5eEdition, name: string): void {
	openBuilder(rt.plugin, {
		system: 'dnd5e', kind: 'level-up', seed: { fm, edition, name }, sourcePath: file.path,
		apply: async (out) => {
			const d = (out as { data?: LevelUp5eDraft }).data;
			if (!d) return false;
			let rolled: number | undefined;
			if (d.hp === 'roll') rolled = rt.plugin.rollDice(`1d${d.hitDie}`, `${d.name}: hit points`, 'effect')?.total;
			await rt.plugin.app.fileManager.processFrontMatter(file, (data: Frontmatter) => applyLevelUp5e(data, d, rolled));
			new Notice(`${d.name} is level ${d.level}.${rolled !== undefined ? ` Rolled ${rolled} on the hit die.` : ''}`);
			return true;
		},
	});
}
