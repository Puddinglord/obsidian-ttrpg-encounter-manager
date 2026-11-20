// 5e's character wizards on core's builder: New character (who, abilities,
// skills, tools and languages, class choices and spells, the increases for
// the levels it starts past, and starting equipment, with the sheet's numbers
// as the preview) and Level up (hit points, a subclass when it's time, an
// increase or a feat, expertise, the class's choices, new cantrips and
// spells). The rules are in character-draft.ts; both read the compendium, so
// content packs' classes and subclasses work the same.

import { Notice, TFile } from 'obsidian';
import type { NewCharacterRequest } from '../contract';
import { openBuilder, registerKind } from '../../core/builder/frame';
import { EntitySchema, FieldDef, schemaKind } from '../../core/builder/schema';
import { Frontmatter, readSheet5e, SKILLS, STANDARD_ARRAY } from './character';
import {
	ABILITY_OF, allSkills, applyLevelUp5e, asiLevels, assignByClass, averageGain, backgroundCreation, backgroundOf, backgroundSkills, Character5eDraft, characterFm, characterMissing, classCreation,
	classOf, classSpells, expertiseAt, expertiseCount, featIncrease, featuresGained, fightingStyleAt, finalScores, givenLanguages, givenTools, hasAsi, hasVersatile, increaseLevels, languageChoice,
	LevelUp5eDraft, levelOptions, magicInitiate, masteryCount, masteryWeapons, needsSubclass, newCantrips, newCharacter5e, newLevelUp5e, newMasteries, newSpellCount, newSpellLevel, optionGroups,
	plusOf, settleIncreases, skillChoice, speciesChoices, speciesOf, spellCount, spellsAt, startingEquipment, subclassLevel, toolChoices,
} from './character-draft';
import { compendium5e } from './compendium';
import type { Dnd5eEdition } from './editions';
import { formatMod } from './rules';
import type { Dnd5eRuntime } from './runtime';
import { SHEET_LANG } from './sheet';
import { ABILITIES, ABILITY_NAME, AbilityKey } from './types';
import { abilityCards, equipmentGroups, groupChips, increaseCards, levelUpBrief, pointBudget, rollRow, sheetBrief, spellLevelLabel } from './wizard-ui';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const short = (a: AbilityKey) => a.toUpperCase();
const titleCase = (a: string) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
/** "Fighting Style: Archery" → Archery, "Dragon Ancestor: Red - Fire Damage" → Red - Fire Damage. */
const optionName = (v: string) => v.replace(/^[^:]+:\s*/, '');

/** A class's spells up to a level, under their levels' headings. */
function spellGroups(edition: Dnd5eEdition, cls: string, upTo: number, without: string[] = []): { label: string; options: string[] }[] {
	const all = new Set(classSpells(edition, cls, upTo, false).filter(n => !without.some(k => same(k, n))));
	const levels = new Map<number, string[]>();
	for (const sp of compendium5e(edition).spells) if (all.has(sp.name)) levels.set(sp.level, [...(levels.get(sp.level) ?? []), sp.name]);
	return [...levels.keys()].sort((x, y) => x - y).map(l => ({ label: spellLevelLabel(l, edition), options: [...new Set(levels.get(l))].sort() }));
}

/** Feats a level's increase can take instead: 2024's general feats (and Epic Boons at 19), the SRD's one feat in 2014. */
function featsAt(edition: Dnd5eEdition, level: number): string[] {
	return compendium5e(edition).feats
		.filter(f => f.type !== 'origin' && f.type !== 'fighting-style' && f.name !== 'Ability Score Improvement' && (f.type !== 'epic-boon' || level >= 19))
		.map(f => f.name);
}
const featsOfType = (edition: Dnd5eEdition, type: string) => compendium5e(edition).feats.filter(f => f.type === type).map(f => f.name);
const spellWord = (kind: string | undefined) => (kind === 'spellbook' ? 'Spellbook' : kind === 'known' ? 'Spells known' : 'Prepared spells');

// ----------------------------------------------------------------------------
// New character

/** The background's abilities for its +2 or +1, after "the best for your class". */
function plusOptions(d: Character5eDraft, which: 'p2' | 'p1'): { value: string; label: string }[] {
	const auto = plusOf(settle(d))[which];
	const offered = backgroundOf(d)?.abilityScores ?? ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
	return [{ value: '', label: `Best for your class${auto ? ` (${auto.toUpperCase()})` : ''}` }, ...offered.map(s => ({ value: ABILITY_OF[s.toUpperCase()] ?? s, label: s }))];
}

/**
 * Keep a draft consistent with its choices: the array (or the rolls) follow the class until moved by hand; a +2/+1
 * the background doesn't offer goes back to automatic; picks that no longer apply (another class's skills, a
 * subrace's language) drop off, and each list stops at its count.
 */
export function settle(d: Character5eDraft): Character5eDraft {
	if ((d.method === 'array' || d.method === 'roll') && !d.arranged) assignByClass(d, d.method === 'roll' && d.rolled?.length ? d.rolled : STANDARD_ARRAY);
	const offered = (backgroundOf(d)?.abilityScores ?? []).map(s => ABILITY_OF[s.toUpperCase()]).filter(Boolean);
	if (d.plus2 && !offered.includes(d.plus2 as AbilityKey)) d.plus2 = '';
	if (d.plus1 && !offered.includes(d.plus1 as AbilityKey)) d.plus1 = '';
	const sp = speciesOf(d);
	if (sp && d.subspecies && !sp.subspecies.some(x => same(x.name, d.subspecies))) d.subspecies = '';
	const ch = speciesChoices(d);
	d.raceUp = (d.raceUp ?? []).filter(a => ch.abilityChoices?.from.some(x => same(x, a))).slice(0, ch.abilityChoices?.count ?? 0);
	const sc = skillChoice(classOf(d.edition, d.className)?.skillChoice ?? '');
	const fixed = [...backgroundSkills(backgroundOf(d)), ...(ch.skills ?? [])];
	d.skills = d.skills.filter(s => sc.from.includes(s) && !fixed.includes(s)).slice(0, sc.count);
	d.speciesSkills = (d.speciesSkills ?? []).filter(s => ch.skillChoices?.from.includes(s) && !fixed.includes(s) && !d.skills.includes(s)).slice(0, ch.skillChoices?.count ?? 0);
	d.expertise = (d.expertise ?? []).filter(s => allSkills(d).includes(s)).slice(0, expertiseCount(d));
	const tc = toolChoices(d);
	d.tools = (d.tools ?? []).filter(t => tc.some(g => g.from.includes(t)));
	const lc = languageChoice(d);
	d.languages = (d.languages ?? []).filter(l => lc.from.includes(l)).slice(0, lc.count);
	if (d.ancestry && !ch.traitChoices?.from.includes(d.ancestry)) d.ancestry = '';
	if (d.raceCantrip && !ch.cantripChoices?.from.includes(d.raceCantrip)) d.raceCantrip = '';
	settleIncreases(d);
	return d;
}

export function characterSchema(rt: Dnd5eRuntime): EntitySchema<Character5eDraft & { folder?: string }> {
	const comp = (d: { edition: Dnd5eEdition }) => compendium5e(d.edition);
	const cls = (x: Character5eDraft) => classOf(x.edition, x.className);
	const lv = (x: Character5eDraft) => x.level ?? 1;
	return {
		kind: 'character', noun: 'character', icon: 'user-round',
		blank: (_p, path) => newCharacter5e(rt.edition(path)),
		seed: (seed, _p, path) => {
			const r = (seed as { request?: NewCharacterRequest } | undefined)?.request;
			if (!r) return undefined;
			const ed = rt.edition(r.folder ?? path);
			return { ...newCharacter5e(ed, { name: r.name, level: r.level, mine: r.mine }), folder: r.folder };
		},
		steps: d => {
			settle(d);
			const ch = speciesChoices(d);
			const k = cls(d);
			const options = optionGroups(k, lv(d) >= subclassLevel(k) ? d.subclass : '', lv(d));
			const mi = magicInitiate(d);
			const count = spellCount(d.edition, k, lv(d), d);
			return [
				{
					id: 'who', label: 'Who', icon: 'user-round', title: 'Who are they?', sub: `${d.edition} rules`,
					rows: [
						{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ilse Vane' },
						[
							{ type: 'choice', rebuilds: true, key: 'className', label: 'Class', dropdown: true, options: x => comp(x).classes.map(c => ({ value: c.name, label: `${c.name} (d${c.hitDie})` })), hint: x => { const sv = cls(x)?.saves ?? []; return sv.length ? `Saves ${sv.map(titleCase).join(', ')}` : ''; } },
							{ type: 'number', rebuilds: true, key: 'level', label: 'Level', min: 1, max: 20, placeholder: () => '1' },
						],
						[
							{ type: 'choice', rebuilds: true, key: 'species', label: d.edition === '2014' ? 'Race' : 'Species', dropdown: true, options: x => comp(x).species.map(s => ({ value: s.name, label: s.name })) },
							{ type: 'choice', rebuilds: true, key: 'subspecies', label: d.edition === '2014' ? 'Subrace' : 'Lineage', dropdown: true, show: x => (speciesOf(x)?.subspecies.length ?? 0) > 0, options: x => [{ value: '', label: '—' }, ...(speciesOf(x)?.subspecies ?? []).map(s => ({ value: s.name, label: s.name.replace(/^[^:]+:\s*/, '') }))] },
						],
						...(ch.traitChoices ? [{ type: 'choice' as const, key: 'ancestry', label: ch.traitChoices.label, dropdown: true, options: () => [{ value: '', label: 'Choose' }, ...ch.traitChoices!.from.map(v => ({ value: v, label: v.replace(/^.*\((.*)\)$/, '$1') }))] }] : []),
						{ type: 'choice', rebuilds: true, key: 'background', label: 'Background', dropdown: true, options: x => comp(x).backgrounds.map(b => ({ value: b.name, label: b.name })), hint: x => { const b = backgroundOf(x); const sk = backgroundSkills(b); return [sk.length ? sk.join(', ') : '', b?.feat ?? ''].filter(Boolean).join(' · '); } },
					],
				},
				{
					id: 'abilities', label: 'Abilities', icon: 'bar-chart-3', title: 'Ability scores',
					rows: [
						{
							type: 'choice', rebuilds: true, key: 'method', label: 'Scores',
							options: () => [{ value: 'array', label: 'Standard array' }, { value: 'pointbuy', label: 'Point buy' }, { value: 'roll', label: 'Roll' }, { value: 'manual', label: 'Your own' }],
						},
						{ type: 'custom', wide: true, key: 'points', label: 'Points', show: x => x.method === 'pointbuy', draw: (el, x, ui) => pointBudget(el, x, ui) },
						{ type: 'custom', wide: true, key: 'rolls', label: 'Rolls', show: x => x.method === 'roll', draw: (el, x, ui) => rollRow(el, x, ui, v => assignByClass(x, v)) },
						{ type: 'custom', wide: true, key: 'abilities', label: 'Abilities', draw: (el, x, ui) => abilityCards(el, x, ui, settle) },
						...(d.edition === '2024' ? [
							{ type: 'choice' as const, rebuilds: true, key: 'spread', label: 'Background increases', options: () => [{ value: '21', label: '+2 and +1' }, { value: '111', label: '+1 to three' }], hint: (x: Character5eDraft) => (backgroundOf(x)?.abilityScores ?? []).join(', ') },
							...(d.spread !== '111' ? [[
								{ type: 'choice' as const, key: 'plus2', label: '+2 to', dropdown: true, options: (x: Character5eDraft) => plusOptions(x, 'p2') },
								{ type: 'choice' as const, key: 'plus1', label: '+1 to', dropdown: true, options: (x: Character5eDraft) => plusOptions(x, 'p1') },
							]] : []),
						] : []),
						...(ch.abilityChoices ? [{
							type: 'chips' as const, key: 'raceUp', label: `+${ch.abilityChoices.bonus} to ${ch.abilityChoices.count}`, options: () => ch.abilityChoices!.from, max: () => ch.abilityChoices!.count,
							hint: (x: Character5eDraft) => `${(x.raceUp ?? []).length} of ${ch.abilityChoices!.count}`,
						}] : []),
					],
				},
				{
					id: 'skills', label: 'Skills', icon: 'target', title: 'Skills',
					rows: [
						{
							type: 'chips', key: 'skills', label: 'Class skills', options: x => { const fixed = [...backgroundSkills(backgroundOf(x)), ...(speciesChoices(x).skills ?? [])]; return skillChoice(cls(x)?.skillChoice ?? '').from.filter(s => !fixed.includes(s)); },
							max: x => skillChoice(cls(x)?.skillChoice ?? '').count,
							hint: x => `${x.skills.length} of ${skillChoice(cls(x)?.skillChoice ?? '').count}`,
							fixed: x => ({ values: [...backgroundSkills(backgroundOf(x)), ...(speciesChoices(x).skills ?? [])], why: 'From your background or species' }),
							meta: opt => titleCase(SKILLS.find(s => same(s.name, opt))?.ability ?? ''),
						},
						...(ch.skillChoices ? [{
							type: 'chips' as const, key: 'speciesSkills', label: `From your ${d.edition === '2014' ? 'race' : 'species'}`, max: () => ch.skillChoices!.count,
							options: (x: Character5eDraft) => ch.skillChoices!.from.filter(s => !x.skills.includes(s) && !backgroundSkills(backgroundOf(x)).includes(s)),
							hint: (x: Character5eDraft) => `${(x.speciesSkills ?? []).length} of ${ch.skillChoices!.count}`,
						}] : []),
						...(expertiseCount(d) ? [{
							type: 'chips' as const, key: 'expertise', label: 'Expertise', options: (x: Character5eDraft) => allSkills(x), max: (x: Character5eDraft) => expertiseCount(x),
							hint: (x: Character5eDraft) => `${(x.expertise ?? []).length} of ${expertiseCount(x)}`,
						}] : []),
					],
				},
				{
					id: 'proficiencies', label: 'Tools', icon: 'book-open', title: 'Tools and languages',
					rows: [
						...(toolChoices(d).length || givenTools(d).length ? [{
							type: 'custom' as const, wide: true, key: 'tools', label: 'Tools',
							draw: (el: HTMLElement, x: Character5eDraft, ui: Parameters<typeof groupChips>[4]) => groupChips(el, x, 'tools', [
								...(givenTools(x).length ? [{ label: 'Yours', count: 0, from: [], given: givenTools(x) }] : []),
								...toolChoices(x).map(g => ({ label: g.label, count: g.count, from: g.from.filter(t => !givenTools(x).includes(t)) })),
							], ui),
						}] : []),
						{
							type: 'custom', wide: true, key: 'languages', label: 'Languages',
							draw: (el, x, ui) => groupChips(el, x, 'languages', [{ label: languageChoice(x).count ? `Choose ${languageChoice(x).count}` : 'Known', count: languageChoice(x).count, from: languageChoice(x).from, given: givenLanguages(x) }], ui),
						},
					],
				},
				{
					id: 'class', label: 'Class', icon: 'graduation-cap', title: 'Class choices and spells',
					rows: [
						{ type: 'choice', rebuilds: true, key: 'subclass', label: 'Subclass', dropdown: true, show: x => lv(x) >= subclassLevel(cls(x)) && (cls(x)?.subclasses.length ?? 0) > 0, options: x => [{ value: '', label: 'Choose later' }, ...(cls(x)?.subclasses ?? []).map(s => ({ value: s.name, label: s.name }))] },
						...(options.length ? [{
							type: 'custom' as const, wide: true, key: 'choices', label: 'Features',
							draw: (el: HTMLElement, x: Character5eDraft, ui: Parameters<typeof groupChips>[4]) => groupChips(el, x, 'choices', options.map(g => ({ label: g.group, count: g.count, from: g.from, name: optionName })), ui),
						}] : []),
						...(fightingStyleAt(d.edition, k, lv(d)) ? [{ type: 'choice' as const, key: 'styleFeat', label: 'Fighting Style', dropdown: true, options: () => [{ value: '', label: 'Choose' }, ...featsOfType(d.edition, 'fighting-style').map(f => ({ value: f, label: f }))] }] : []),
						...(hasVersatile(d) ? [{ type: 'choice' as const, rebuilds: true, key: 'originFeat', label: 'Origin feat', dropdown: true, options: () => [{ value: '', label: 'Choose' }, ...featsOfType(d.edition, 'origin').map(f => ({ value: f, label: f }))] }] : []),
						...(mi ? [
							...(/^Magic Initiate$/i.test(d.originFeat ?? '') && !/^Magic Initiate/i.test(backgroundOf(d)?.feat ?? '') ? [{ type: 'choice' as const, rebuilds: true, key: 'miClass', label: 'Magic Initiate list', options: () => ['Cleric', 'Druid', 'Wizard'].map(c => ({ value: c, label: c })) }] : []),
							{ type: 'chips' as const, key: 'miCantrips', label: `Magic Initiate cantrips (${mi})`, options: (x: Character5eDraft) => classSpells(x.edition, mi, 0, true).filter(n => !x.cantrips.includes(n)), max: () => 2, hint: (x: Character5eDraft) => `${(x.miCantrips ?? []).length} of 2` },
							{ type: 'chips' as const, key: 'miSpell', label: `Magic Initiate spell (${mi})`, options: (x: Character5eDraft) => compendium5e(x.edition).spells.filter(s => s.level === 1 && s.classes.some(c => same(c, mi)) && !x.spells.includes(s.name)).map(s => s.name).sort(), max: () => 1 },
						] : []),
						...(ch.cantripChoices ? [{ type: 'choice' as const, key: 'raceCantrip', label: 'Race cantrip', dropdown: true, options: () => [{ value: '', label: 'Choose' }, ...ch.cantripChoices!.from.map(v => ({ value: v, label: v }))] }] : []),
						...(masteryCount(d.edition, k, lv(d)) ? [{
							type: 'chips' as const, key: 'masteries', label: 'Weapon Mastery', options: (x: Character5eDraft) => masteryWeapons(x.edition, x.className), max: (x: Character5eDraft) => masteryCount(x.edition, cls(x), lv(x)),
							hint: (x: Character5eDraft) => `${(x.masteries ?? []).length} of ${masteryCount(x.edition, cls(x), lv(x))}`,
						}] : []),
						{ type: 'chips', key: 'cantrips', label: 'Cantrips', show: x => spellsAt(cls(x), lv(x)).cantrips > 0, options: x => classSpells(x.edition, x.className, 0, true), max: x => spellsAt(cls(x), lv(x)).cantrips, hint: x => `${x.cantrips.length} of ${spellsAt(cls(x), lv(x)).cantrips}` },
						{
							type: 'chips', key: 'spells', label: spellWord(count?.kind), show: x => spellsAt(cls(x), lv(x)).maxLevel > 0,
							options: x => classSpells(x.edition, x.className, spellsAt(cls(x), lv(x)).maxLevel, false),
							groups: x => spellGroups(x.edition, x.className, spellsAt(cls(x), lv(x)).maxLevel),
							max: x => spellCount(x.edition, cls(x), lv(x), settledScores(x))?.count ?? 99,
							hint: x => `${x.spells.length} of ${spellCount(x.edition, cls(x), lv(x), settledScores(x))?.count ?? 0}`,
						},
					],
				},
				...(increaseLevels(d).length ? [{
					id: 'increases', label: 'Increases', icon: 'trending-up', title: 'Ability score increases',
					rows: [{ type: 'custom' as const, wide: true, key: 'increases', label: 'Levels', draw: (el: HTMLElement, x: Character5eDraft, ui: Parameters<typeof groupChips>[4]) => increaseCards(el, x, ui, l => featsAt(x.edition, l)) }],
				}] : []),
				{
					id: 'equipment', label: 'Equipment', icon: 'backpack', title: 'Starting equipment',
					rows: [{
						type: 'custom', wide: true, key: 'equipment', label: 'Gold', hint: x => `${startingEquipment(x).gold} gp`,
						draw: (el, x, ui) => {
							const c = classCreation(x.edition, x.className), b = backgroundCreation(x.edition, x.background);
							equipmentGroups(el, x, ui, x.className, 'c', c?.equipment ?? [], c?.items ?? []);
							equipmentGroups(el, x, ui, x.background, 'b', b?.equipment ?? [], [...(b?.items ?? []), ...(b?.gold ? [{ name: `${b.gold} GP`, qty: 1 }] : [])]);
						},
					}],
				},
			];
		},
		preview(el, d) {
			settle(d);
			const fm = characterFm({ ...d, name: d.name || 'New hero' });
			const s = readSheet5e(fm, d.edition, d.name || 'New hero');
			const eq = startingEquipment(d);
			sheetBrief(el, s, `Level ${s.level} ${[d.edition === '2014' && d.subspecies ? d.subspecies : d.species, d.className].filter(Boolean).join(' ')}${s.subclass ? ` (${s.subclass})` : ''}${d.background ? ` · ${d.background}` : ''}`, eq);
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

/** The scores a spell count reads (Wis for a 2014 cleric's prepared spells): the final ones. */
const settledScores = (d: Character5eDraft): Record<AbilityKey, number> => finalScores(d);

// ----------------------------------------------------------------------------
// Level up

export function levelUpSchema(rt: Dnd5eRuntime): EntitySchema<LevelUp5eDraft> {
	const cls = (x: LevelUp5eDraft) => classOf(x.edition, x.className);
	return {
		kind: 'level-up', noun: 'level up', icon: 'trending-up',
		blank: (_p, path) => newLevelUp5e({}, rt.edition(path)),
		seed: (seed) => {
			const s = seed as { fm?: Frontmatter; edition?: Dnd5eEdition; name?: string } | undefined;
			return s?.fm ? newLevelUp5e(s.fm, s.edition ?? '2024', s.name) : undefined;
		},
		steps: d => {
			const options = levelOptions(d);
			const expert = expertiseAt(cls(d), d.level);
			const featUps = d.asi === 'feat' ? featIncrease(d.edition, d.feat) : [];
			const choiceRows: (FieldDef<LevelUp5eDraft> | FieldDef<LevelUp5eDraft>[])[] = [
				...(options.length ? [{
					type: 'custom' as const, wide: true, key: 'choices', label: 'Features',
					draw: (el: HTMLElement, x: LevelUp5eDraft, ui: Parameters<typeof groupChips>[4]) => groupChips(el, x, 'choices', options.map(g => ({ label: g.group, count: g.count, from: g.from, name: optionName })), ui),
				}] : []),
				...(fightingStyleAt(d.edition, cls(d), d.level, d.level - 1) ? [{ type: 'choice' as const, key: 'styleFeat', label: 'Fighting Style', dropdown: true, options: () => [{ value: '', label: 'Choose' }, ...featsOfType(d.edition, 'fighting-style').map(f => ({ value: f, label: f }))] }] : []),
				...(expert ? [{ type: 'chips' as const, key: 'expertise', label: 'Expertise', options: (x: LevelUp5eDraft) => x.skillsNow.filter(s => !x.expertiseNow.includes(s)), max: () => expert, hint: (x: LevelUp5eDraft) => `${x.expertise.length} of ${expert}` }] : []),
				...(newMasteries(d) ? [{ type: 'chips' as const, key: 'masteries', label: 'Weapon Mastery', options: (x: LevelUp5eDraft) => masteryWeapons(x.edition, x.className).filter(w => !x.masteriesNow.includes(w)), max: () => newMasteries(d), hint: (x: LevelUp5eDraft) => `${x.masteries.length} of ${newMasteries(d)}` }] : []),
			];
			return [
				{
					id: 'hp', label: 'Hit points', icon: 'heart', title: `${d.name} reaches level ${d.level}`,
					rows: [
						{ type: 'choice', key: 'hp', label: 'Hit points', options: x => [{ value: 'average', label: `Take ${averageGain(x)}` }, { value: 'roll', label: `Roll 1d${x.hitDie}${x.conMod ? ` ${formatMod(x.conMod)}` : ''}` }, { value: 'manual', label: 'Rolled at the table' }] },
						{ type: 'number', key: 'manual', label: `What the d${d.hitDie} showed`, min: 1, max: d.hitDie, placeholder: x => String(Math.floor(x.hitDie / 2) + 1), show: x => x.hp === 'manual', hint: x => `+${Math.max(1, (x.manual ?? Math.floor(x.hitDie / 2) + 1) + x.conMod)} HP` },
					],
				},
				...(needsSubclass(d) ? [{
					id: 'subclass', label: 'Subclass', icon: 'git-branch', title: 'Choose a subclass',
					rows: [{ type: 'choice' as const, rebuilds: true, key: 'subclass', label: 'Subclass', dropdown: true, options: (x: LevelUp5eDraft) => [{ value: '', label: 'Choose later' }, ...(cls(x)?.subclasses ?? []).map(s => ({ value: s.name, label: s.name }))] }],
				}] : []),
				...(hasAsi(d) ? [{
					id: 'asi', label: d.level === 19 && d.edition === '2024' ? 'Epic Boon' : 'Increase', icon: 'arrow-up-circle', title: d.level === 19 && d.edition === '2024' ? 'An Epic Boon, or an increase' : 'Ability Score Improvement',
					rows: [
						{ type: 'choice' as const, rebuilds: true, key: 'asi', label: 'Take', options: () => [{ value: 'plus2', label: '+2 to one' }, { value: 'plus1', label: '+1 to two' }, { value: 'feat', label: 'A feat' }] },
						[
							{ type: 'choice' as const, key: 'a1', label: 'Ability', dropdown: true, show: (x: LevelUp5eDraft) => x.asi !== 'feat', options: (x: LevelUp5eDraft) => ABILITIES.map(a => ({ value: a, label: `${ABILITY_NAME[a]} (${x.scores[a]})` })) },
							{ type: 'choice' as const, key: 'a2', label: 'And', dropdown: true, show: (x: LevelUp5eDraft) => x.asi === 'plus1', options: (x: LevelUp5eDraft) => ABILITIES.map(a => ({ value: a, label: `${ABILITY_NAME[a]} (${x.scores[a]})` })) },
						],
						{ type: 'choice' as const, rebuilds: true, key: 'feat', label: 'Feat', dropdown: true, show: (x: LevelUp5eDraft) => x.asi === 'feat', options: (x: LevelUp5eDraft) => [{ value: '', label: '—' }, ...featsAt(x.edition, x.level).map(f => ({ value: f, label: f }))] },
						...(featUps.length ? [{ type: 'choice' as const, key: 'featUp', label: '+1 to', dropdown: true, options: (x: LevelUp5eDraft) => [{ value: '', label: 'Choose' }, ...featUps.map(a => ({ value: a, label: `${ABILITY_NAME[a]} (${x.scores[a]})` }))] }] : []),
					],
				}] : []),
				...(choiceRows.length ? [{ id: 'features', label: 'Features', icon: 'sparkles', title: 'New choices', rows: choiceRows }] : []),
				...(newSpellLevel(d) > 0 || newCantrips(d) > 0 ? [{
					id: 'spells', label: 'Spells', icon: 'wand-2', title: 'New spells',
					rows: [
						...(newCantrips(d) ? [{ type: 'chips' as const, key: 'cantrips', label: 'Cantrips', options: (x: LevelUp5eDraft) => classSpells(x.edition, x.className, 0, true).filter(n => !x.known.some(k => same(k, n))), max: () => newCantrips(d), hint: (x: LevelUp5eDraft) => `${x.cantrips.length} of ${newCantrips(d)}` }] : []),
						...(newSpellLevel(d) > 0 ? [{
							type: 'chips' as const, key: 'spells', label: spellWord(spellCount(d.edition, cls(d), d.level, d.scores)?.kind), max: () => newSpellCount(d) || 99,
							hint: (x: LevelUp5eDraft) => (newSpellCount(x) ? `${x.spells.length} of ${newSpellCount(x)}` : `${x.spells.length} picked`),
							options: (x: LevelUp5eDraft) => classSpells(x.edition, x.className, newSpellLevel(x), false).filter(n => !x.known.some(k => same(k, n))),
							groups: (x: LevelUp5eDraft) => spellGroups(x.edition, x.className, newSpellLevel(x), x.known),
						}] : []),
					],
				}] : []),
			];
		},
		preview(el, d) {
			const k = cls(d);
			const gain = d.hp === 'roll' ? `1d${d.hitDie}${d.conMod ? ` ${formatMod(d.conMod)}` : ''}` : `+${d.hp === 'manual' ? Math.max(1, (d.manual ?? Math.floor(d.hitDie / 2) + 1) + d.conMod) : averageGain(d)}`;
			const slotsNow = k?.levels.find(l => l.level === d.level)?.slots ?? [];
			const slotsWas = k?.levels.find(l => l.level === d.level - 1)?.slots ?? [];
			const slotText = slotsNow.map((n, i) => (n ? `${spellLevelLabel(i + 1, d.edition)}: ${n}${n > (slotsWas[i] ?? 0) ? ` (+${n - (slotsWas[i] ?? 0)})` : ''}` : '')).filter(Boolean).join(' · ');
			const changed = slotsNow.some((n, i) => n !== (slotsWas[i] ?? 0));
			levelUpBrief(el, d, {
				gained: featuresGained(d),
				hpGain: gain,
				subclass: needsSubclass(d) ? d.subclass : undefined,
				increase: !hasAsi(d) ? undefined : d.asi === 'feat' ? `${d.feat || 'Not chosen yet'}${d.featUp ? ` (+1 ${short(d.featUp as AbilityKey)})` : ''}`
					: d.asi === 'plus2' ? `${short(d.a1 as AbilityKey)} ${d.scores[d.a1 as AbilityKey]} → ${Math.min(20, d.scores[d.a1 as AbilityKey] + 2)}`
						: d.a1 === d.a2 ? `${short(d.a1 as AbilityKey)} ${d.scores[d.a1 as AbilityKey]} → ${Math.min(20, d.scores[d.a1 as AbilityKey] + 2)}`
							: `${short(d.a1 as AbilityKey)} +1, ${short(d.a2 as AbilityKey)} +1`,
				nextIncrease: asiLevels(k).find(l => l > d.level),
				slots: changed ? slotText : undefined,
				picks: uniq([...d.cantrips, ...d.spells, ...d.choices.map(optionName), ...(d.styleFeat ? [d.styleFeat] : []), ...d.expertise.map(x => `${x} (expertise)`), ...d.masteries]),
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
