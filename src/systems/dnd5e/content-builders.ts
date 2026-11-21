// 5e's guided builders for your own character content: a class, a subclass, a
// feat, a species (2014: a race) and a background, as schemas for core's
// builder. New on the compendium's Classes, Origins and Feats tabs opens them
// (core/content/new-entry.ts), what they write is a ```5e-<kind> block in a
// note in the content folder (so it joins the compendium as Homebrew), and the
// pencil on such a block reopens it here. The rules and the block's fields are
// in content-draft.ts; the preview is the compendium's card, and the check says
// what the thing gives a character (for a class, what a level grants).

import type EmberVaultPlugin from '../../../main';
import { BuilderUI, checkHead, registerKind, segmented, statTiles } from '../../core/builder/frame';
import { EntitySchema, FieldDef, SchemaBuilder } from '../../core/builder/schema';
import { contentFolderFor } from '../../core/content/new-entry';
import { evIcon } from '../../core/icons';
import { pill } from '../../core/pill';
import { toYaml } from '../../core/yaml-lite';
import { classOf } from './character-draft';
import { renderCard5e } from './cards';
import { compendium5e, contentHit5e, Kind5e, KIND5E } from './compendium';
import {
	ABILITY_ABBR, abilityName, ARMOR_5E, atLevel, Background5eDraft, bonusText, cantripNames, Class5eDraft, ClassFeature5eDraft, classMissing, classSpellNames, Column5eDraft, columnKey,
	defaultPrerequisite, Feat5eDraft, FEAT_TYPES, followClass, fromBackgroundEntry, fromClassEntry, fromFeatEntry, fromSpeciesEntry, fromSubclassEntry, increaseText, levelBrief, levelOf,
	maxSpellLevel, newBackground5e, newClass5e, newFeat5e, newFeature5e, newResource5e, newSpecies5e, newSubclass5e, newSubspecies5e, primaryText, replacesSrd, Resource5eDraft,
	SIZES_5E, SKILL_NAMES, slotsAt, Species5eDraft, spellLevelsFor, spellNumbersAt, srdCasters, Steps, subclassLevelsFor, subclassLevelsOf, subclassMissing, subclassTitleFor,
	subclassTitleOf, Subclass5eDraft, toBackgroundEntry, toClassEntry, toFeatEntry, toolNames, toSpeciesEntry, toSubclassEntry, usesValue,
} from './content-draft';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eRuntime } from './runtime';
import { profMark } from './sheet-parts';

type Entry = Record<string, unknown>;
const LEVELS = Array.from({ length: 20 }, (_, i) => String(i + 1));
const opts = (xs: readonly string[]) => () => xs.map(x => ({ value: x, label: x }));
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
/** A builder's seed: the block being edited (`entry`), or the edition the compendium shows. */
interface Seed { entry?: Entry; edition?: Dnd5eEdition }
const seedOf = (seed: unknown): Seed => (seed && typeof seed === 'object' ? seed : {});

// ----------------------------------------------------------------------------
// Shared parts

/** The card the kind's entry will be in the compendium, tagged Homebrew. */
function preview(el: HTMLElement, rt: Dnd5eRuntime, kind: Kind5e, entry: Entry, edition: Dnd5eEdition): void {
	const hit = contentHit5e(kind, { ...entry, source: 'Homebrew' }, edition, KIND5E[kind].label);
	if (hit) renderCard5e(el, hit, rt.cardOptions(''));
}

/** A part of the check: a small-caps heading over chips. Nothing when it has nothing to show. */
function part(el: HTMLElement, title: string, chips: { text: string; icon?: string; on?: boolean; faint?: boolean }[], note?: string): void {
	if (!chips.length) return;
	const sec = el.createDiv({ cls: 'dnd5e-brief-part' });
	const h = sec.createDiv({ cls: 'dnd5e-brief-head' });
	h.createSpan({ cls: 'dnd5e-brief-title', text: title });
	if (note) h.createSpan({ cls: 'dnd5e-brief-note', text: note });
	const box = sec.createDiv({ cls: 'dnd5e-brief-chips' });
	for (const c of chips) pill(box, { text: c.text, icon: c.icon, cls: `dnd5e-brief-chip${c.on ? ' is-on' : ''}${c.faint ? ' is-faint' : ''}` });
}

/** Six abilities as small plaques, a proficiency diamond on those that are (a class's saves, a background's three). */
function abilityRow(el: HTMLElement, title: string, on: string[]): void {
	const row = el.createDiv({ cls: 'dnd5e-cb-abilities' });
	row.createSpan({ cls: 'dnd5e-cb-abilities-title', text: title });
	for (const a of ABILITY_ABBR) {
		const yes = on.includes(a);
		const c = pill(row, { text: a, cls: `dnd5e-brief-chip dnd5e-cb-ability${yes ? ' is-on' : ''}`, title: abilityName(a) });
		profMark(c, yes ? 1 : 0).addClass('dnd5e-brief-pm');
		c.prepend(c.lastChild!);
	}
}

/**
 * Twenty small number fields, one a level, for a number that steps up the levels (a column of uses, cantrips
 * known): type it where it changes, and the levels after follow (shown faint) until the next change.
 */
function levelGrid(control: HTMLElement, label: string, get: () => Steps, ui: BuilderUI): void {
	control.addClass('is-stack');
	const grid = control.createDiv({ cls: 'dnd5e-lv-grid eb-noswipe', attr: { role: 'group', 'aria-label': label } });
	for (const lv of LEVELS) {
		const cell = grid.createEl('label', { cls: 'dnd5e-lv-cell' });
		cell.createSpan({ cls: 'dnd5e-lv-n', text: lv });
		const input = cell.createEl('input', { cls: 'dnd5e-lv-input', attr: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', 'aria-label': `${label} at level ${lv}` } });
		input.dataset.level = lv;
		const sync = () => {
			const steps = get();
			const own = steps[lv];
			if (activeDocument.activeElement !== input) input.value = own === undefined ? '' : String(own);
			const before = atLevel(steps, Number(lv) - 1);
			input.placeholder = String(before);
			cell.toggleClass('is-set', own !== undefined);
		};
		input.addEventListener('input', () => {
			const t = input.value.replace(/[^\d]/g, '');
			if (t !== input.value) input.value = t;
			const steps = get();
			if (t === '') delete steps[lv]; else steps[lv] = Math.min(999, parseInt(t, 10));
			ui.changed();
		});
		input.addEventListener('blur', sync);
		ui.live(sync);
	}
}

/** A resource's fields: how many (a number or an ability's modifier…), from which level, and the rest that brings them back. */
function resourceRows(): (FieldDef | FieldDef[])[] {
	return [
		[
			{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Hearthfire' },
			{
				type: 'choice', key: 'uses', label: 'Uses', dropdown: true, options: (r) => {
					const x = r as Resource5eDraft;
					const base = [
						{ value: 'number', label: 'A number' }, ...ABILITY_ABBR.map(a => ({ value: a, label: `${abilityName(a)} modifier` })),
						{ value: 'PB', label: 'Proficiency bonus' }, { value: 'level', label: 'Class level' }, { value: 'half', label: 'Half class level' },
					];
					return base.some(b => b.value === x.uses) ? base : [...base, { value: x.uses, label: String(usesValue(x)) }];
				},
			},
		],
		[
			{ type: 'number', key: 'count', label: 'How many', min: 0, max: 50, placeholder: () => '1', show: r => (r as Resource5eDraft).uses === 'number' },
			{ type: 'toggle', key: 'min1', label: 'At least 1', show: r => (r as Resource5eDraft).uses !== 'number' },
			{ type: 'number', key: 'level', label: 'From level', min: 1, max: 20, placeholder: () => '1' },
		],
		[
			{ type: 'choice', key: 'reset', label: 'Comes back on', options: () => [{ value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short rest' }] },
			{ type: 'number', key: 'shortFrom', label: 'Short rest from level', min: 2, max: 20, placeholder: () => '—', show: r => (r as Resource5eDraft).reset === 'long' },
		],
		{ type: 'toggle', key: 'shortOne', label: 'One back on a short rest', show: r => (r as Resource5eDraft).reset === 'long' },
	];
}
const resourcesField = (label: string): FieldDef => ({
	type: 'list', key: 'resources', label, add: 'Add a limited use', blank: newResource5e,
	title: (r, i) => { const x = r as Resource5eDraft; return x.name.trim() || `Use ${i + 1}`; },
	item: () => resourceRows(),
});

/** A feature's fields: its level and name, its text, and any options it offers (how many, more at later levels). */
function featureField(o: { label: string; add: string; levels?: () => number[]; columns?: () => Column5eDraft[]; table: boolean; blankLevel: () => number }): FieldDef {
	return {
		type: 'list', key: 'features', label: o.label, add: o.add, blank: () => newFeature5e(o.blankLevel()),
		title: (f, i) => { const x = f as ClassFeature5eDraft; return `Level ${levelOf(x)} · ${x.name.trim() || `Feature ${i + 1}`}${x.options.length ? ` · ${x.options.length} options` : ''}`; },
		item: (f) => {
			const x = f as ClassFeature5eDraft;
			const hasOptions = () => x.options.length > 0;
			const cols = o.columns?.() ?? [];
			return [
				[
					o.levels
						? { type: 'choice', key: 'level', label: 'Level', numeric: true, dropdown: true, rebuilds: true, options: () => [...new Set([...o.levels!(), levelOf(x)])].sort((a, b) => a - b).map(l => ({ value: String(l), label: `Level ${l}` })) }
						: { type: 'number', key: 'level', label: 'Level', min: 1, max: 20, placeholder: () => '1', rebuilds: true },
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Hearthfire' },
				],
				{ type: 'textarea', key: 'desc', label: 'Text', rows: 3, placeholder: 'As a Bonus Action, you kindle a warding flame around an ally you can see within 30 feet.' },
				{
					type: 'list', key: 'options', label: 'Options', add: 'Add an option', blank: () => ({ name: '', desc: '' }),
					title: (op, i) => String((op as { name: string }).name || `Option ${i + 1}`),
					item: () => [{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Ember Guard' }, { type: 'textarea', key: 'desc', label: 'Text', rows: 2 }],
				},
				[
					{ type: 'number', key: 'choose', label: 'Choose', min: 1, max: 20, placeholder: () => '1', show: () => hasOptions() && !x.known },
					...(cols.length && o.table ? [{ type: 'choice' as const, key: 'known', label: 'Or count from', dropdown: true, show: hasOptions, options: () => [{ value: '', label: '—' }, ...cols.map(c => ({ value: columnKey(c), label: c.label.trim() || c.key || '' }))] }] : []),
				],
				...(o.table ? [{ type: 'chips' as const, key: 'more', label: 'One more at', options: () => LEVELS.filter(l => Number(l) > levelOf(x)), show: () => hasOptions() && !x.known }] : []),
			];
		},
	};
}

/** "Level 3, 6, 10 and 14". */
const levelsText = (ls: number[]) => (ls.length ? `Level${ls.length > 1 ? 's' : ''} ${ls.length > 1 ? `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}` : ls[0]}` : '');
const folder = (rt: Dnd5eRuntime, kind: string) => contentFolderFor(rt.plugin, 'dnd5e', kind);
const edOf = (rt: Dnd5eRuntime, seed: unknown, path: string): Dnd5eEdition => seedOf(seed).edition ?? rt.edition(path);

// ----------------------------------------------------------------------------
// A class

export function classSchema(rt: Dnd5eRuntime): EntitySchema<Class5eDraft> {
	return {
		kind: 'class', noun: 'class', icon: KIND5E.class.glyph,
		blank: (_p, path) => newClass5e(rt.edition(path)),
		seed: (seed, _p, path) => { const s = seedOf(seed); const ed = edOf(rt, seed, path); return s.entry ? fromClassEntry(s.entry, ed) : newClass5e(ed); },
		steps: d => {
			// A spellcasting ability brings spell slots, a full caster's until another is picked.
			if (d.castAbility && !d.caster) d.caster = 'full';
			const casters = srdCasters(d.edition);
			return [
				{
					id: 'class', label: 'Class', icon: 'shield-star', title: 'The class', sub: `${d.edition} rules`,
					rows: [
						{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Hearth Warden' },
						{ type: 'choice', key: 'hitDie', label: 'Hit die', numeric: true, options: () => [6, 8, 10, 12].map(n => ({ value: String(n), label: `d${n}` })) },
						{ type: 'chips', key: 'primary', label: 'Primary ability', options: () => [...ABILITY_ABBR], max: () => 2, hint: x => (x.primary.length ? primaryText(x) : '') },
						{ type: 'toggle', key: 'primaryEither', label: 'Either one', show: x => x.primary.length === 2 },
						{ type: 'chips', key: 'saves', label: 'Saving throws', options: () => [...ABILITY_ABBR], max: () => 2 },
					],
				},
				{
					id: 'profs', label: 'Training', icon: 'shield', title: 'Proficiencies',
					rows: [
						{ type: 'chips', key: 'armor', label: 'Armor', options: () => [...ARMOR_5E] },
						{ type: 'chips', key: 'weapons', label: 'Weapons', options: () => ['Simple Weapons', 'Martial Weapons'] },
						[
							{ type: 'text', key: 'otherWeapons', label: 'Other weapons', placeholder: 'Hand Crossbows, Rapiers' },
							{ type: 'text', key: 'tools', label: 'Tools', placeholder: 'Thieves\' Tools' },
						],
						{ type: 'number', key: 'skillCount', label: 'Skills to choose', min: 1, max: 18, placeholder: () => '2' },
						{ type: 'chips', key: 'skillFrom', label: 'From', options: () => [...SKILL_NAMES], hint: x => (x.skillFrom.length ? `${x.skillFrom.length} skills` : 'Any skill') },
						{ type: 'number', key: 'toolCount', label: 'Tools to choose', min: 0, max: 5, placeholder: () => '0' },
						{ type: 'chips', key: 'toolFrom', label: 'Tools from', options: x => toolNames(x.edition), show: x => !!x.toolCount },
					],
				},
				{
					id: 'equipment', label: 'Gear', icon: 'backpack', title: 'Starting equipment',
					rows: [{
						type: 'list', key: 'equipment', label: 'Choices', add: 'Add a choice', blank: () => ({ options: [{ items: '', gold: undefined }, { items: '', gold: d.edition === '2024' ? 100 : undefined }] }),
						title: (c, i) => `Choice ${i + 1}`,
						item: () => [{
							type: 'list', key: 'options', label: 'Options', add: 'Add an option', blank: () => ({ items: '', gold: undefined }),
							title: (_o, i) => `(${'ABCDEFGH'[i]})`,
							item: () => [[
								{ type: 'text', key: 'items', label: 'Items', placeholder: 'Chain Mail, Longsword, Shield, 2 Javelin' },
								{ type: 'number', key: 'gold', label: 'GP', min: 0, max: 9999, placeholder: () => '0' },
							]],
						}],
					}],
				},
				{
					id: 'spells', label: 'Spells', icon: 'wand', title: 'Spellcasting',
					rows: [
						{ type: 'choice', key: 'castAbility', label: 'Spellcasting ability', rebuilds: true, options: () => [{ value: '', label: 'None' }, ...['INT', 'WIS', 'CHA'].map(a => ({ value: a, label: abilityName(a) }))] },
						{
							type: 'choice', key: 'caster', label: 'Spell slots', show: x => !!x.castAbility,
							options: x => [{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }, { value: 'third', label: 'Third' }, { value: 'pact', label: 'Pact' }, ...(x.caster === 'own' ? [{ value: 'own', label: 'As written' }] : [])],
							hint: x => { const s = slotsAt(x, 20); return s ? `${ord(s.reduce((n, v, i) => (v ? i + 1 : n), 0))}-level slots at 20` : ''; },
						},
						[
							{ type: 'choice', key: 'spellList', label: 'Spell list', dropdown: true, show: x => !!x.castAbility && !!x.caster, options: x => [{ value: '', label: x.name.trim() ? `Its own (${x.name.trim()})` : 'Its own' }, ...compendium5e(x.edition).classes.filter(c => c.spellcasting && c.name !== x.name).map(c => ({ value: c.name, label: c.name }))] },
							...(d.edition === '2014' ? [{
								type: 'custom' as const, key: 'spellsKnown', label: 'Spells', show: (x: Class5eDraft) => !!x.castAbility && !!x.caster,
								draw: (c: HTMLElement, x: Class5eDraft, ui: BuilderUI) => { segmented<boolean>(c, [{ value: true, label: 'Known' }, { value: false, label: 'Prepared' }], () => x.spellsKnown, v => { x.spellsKnown = v; }, { label: 'Spells', ui, cls: 'is-compact is-schema' }); },
							}] : []),
						],
						{
							type: 'choice', key: 'spellsLike', label: 'Cantrips and spells like', dropdown: true, show: x => !!x.castAbility && !!x.caster,
							options: () => [...casters.map(c => ({ value: c, label: c })), { value: '', label: 'Its own numbers' }],
							hint: x => { const n = spellNumbersAt(x, 20); return `${n.cantrips} cantrips${n.prepared ? ` · ${n.prepared} ${d.edition === '2014' ? 'known' : 'prepared'}` : ''} at 20`; },
						},
						{ type: 'custom', key: 'cantrips', label: 'Cantrips known', show: x => !!x.castAbility && !!x.caster && !x.spellsLike, draw: (c, x, ui) => levelGrid(c, 'Cantrips known', () => x.cantrips, ui) },
						{
							type: 'custom', key: 'prepared', label: d.edition === '2014' ? 'Spells known' : 'Prepared spells', show: x => !!x.castAbility && !!x.caster && !x.spellsLike && (x.edition === '2024' || x.spellsKnown),
							draw: (c, x, ui) => levelGrid(c, d.edition === '2014' ? 'Spells known' : 'Prepared spells', () => x.prepared, ui),
						},
					],
				},
				{
					id: 'features', label: 'Features', icon: 'sparkle', title: 'Features',
					rows: [featureField({ label: 'By level', add: 'Add a feature', columns: () => d.columns, table: true, blankLevel: () => Math.max(1, ...d.features.map(levelOf), 1) })],
				},
				{
					id: 'table', label: 'Table', icon: 'chart', title: 'The level table',
					rows: [
						[
							{ type: 'text', key: 'subclassTitle', label: 'Subclass called', words: true, placeholder: x => subclassTitleOf(x) },
						],
						{ type: 'chips', key: 'subclassLevels', label: 'Subclass features at', options: () => [...LEVELS], hint: x => levelsText(subclassLevelsOf(x)) },
						{ type: 'chips', key: 'asiLevels', label: 'Ability Score Improvements', options: () => [...LEVELS] },
						...(d.edition === '2024' ? [{ type: 'toggle' as const, key: 'epicBoon', label: 'Epic Boon at 19' }] : []),
						{
							type: 'list', key: 'columns', label: 'Its own columns', add: 'Add a column', blank: () => ({ label: '', uses: true, steps: {} }),
							title: (c, i) => { const x = c as Column5eDraft; return x.label.trim() || `Column ${i + 1}`; },
							item: (c) => [
								[
									{ type: 'text', key: 'label', label: 'Name', words: true, placeholder: 'Coals' },
									{ type: 'toggle', key: 'uses', label: 'Uses with pips' },
								],
								{ type: 'custom', key: 'steps', label: 'By level', draw: (control: HTMLElement, _m: unknown, ui: BuilderUI) => levelGrid(control, (c as Column5eDraft).label || 'Column', () => (c as Column5eDraft).steps, ui) },
							],
						},
					],
				},
				{
					id: 'uses', label: 'Uses', icon: 'zap', title: 'Limited uses',
					rows: [resourcesField('Uses')],
				},
			];
		},
		preview: (el, d) => preview(el, rt, 'class', toClassEntry(d), d.edition),
		check(el, d, ui) {
			const lv = Math.min(20, Math.max(1, d.levelAt || 1));
			const b = levelBrief(d, lv);
			checkHead(el, { kicker: `What level ${lv} grants`, value: d.name.trim() || 'New class', tag: `${d.edition} rules` });
			// The levels as a strip: tap one to see what it grants; a mark on those that grant something.
			const strip = el.createDiv({ cls: 'dnd5e-cb-levels', attr: { role: 'tablist', 'aria-label': 'Level' } });
			for (let l = 1; l <= 20; l++) {
				const x = levelBrief(d, l);
				const busy = x.features.length || x.options.length || x.subclass || x.increase;
				const btn = strip.createEl('button', { cls: `dnd5e-cb-level${l === lv ? ' is-active' : ''}${busy ? ' has-more' : ''}`, text: String(l), attr: { role: 'tab', 'aria-selected': String(l === lv), 'aria-label': `Level ${l}` } });
				btn.addEventListener('click', () => { d.levelAt = l; ui.changed(); });
			}
			const top = b.slots ? b.slots.reduce((n, v, i) => (v ? i + 1 : n), 0) : 0;
			statTiles(el, [
				{ label: 'PB', value: `+${b.pb}`, lead: true },
				{ label: 'Hit die', value: `d${d.hitDie}` },
				...(b.slots ? [{ label: 'Slots', value: b.slots.slice(0, top).join('·'), sub: `up to ${ord(top)}` }] : []),
				...(b.cantrips ? [{ label: 'Cantrips', value: String(b.cantrips) }] : []),
				...(b.prepared ? [{ label: d.edition === '2014' ? 'Known' : 'Prepared', value: String(b.prepared) }] : []),
			]);
			abilityRow(el, 'Saves', d.saves);
			part(el, `New at level ${lv}`, [
				...b.features.map(f => ({ text: f, icon: evIcon('sparkle') })),
				...b.options.map(o => ({ text: `Choose ${o.count}: ${o.group}`, icon: evIcon('list') })),
				...(b.subclass ? [{ text: b.subclass === 'choose' ? subclassTitleOf(d) : 'Subclass feature', icon: evIcon('path'), on: b.subclass === 'choose' }] : []),
				...(b.increase ? [{ text: b.increase === 'epic' ? 'Epic Boon' : 'Ability Score Improvement', icon: evIcon('medal'), on: true }] : []),
				...b.resources.filter(r => r.from).map(r => ({ text: r.name, icon: evIcon('zap') })),
			]);
			part(el, 'Its numbers', b.columns.map(c => ({ text: `${c.label} ${c.value}`, icon: c.uses ? evIcon('zap') : undefined })));
			if (replacesSrd(d.edition, 'classes', d.name) && !d.base) el.createDiv({ cls: 'dnd5e-cb-warn', text: `Yours replaces the SRD's ${d.name.trim()}.` });
		},
		chip: d => ({ text: `d${d.hitDie}${d.saves.length ? ` · ${d.saves.join(' ')}` : ''}`, tone: 'none' }),
		missing: classMissing,
		output: d => ({ lang: '5e-class', body: toYaml(toClassEntry(d)), name: d.name.trim(), frontmatter: {}, folder: folder(rt, 'class') }),
	};
}

// ----------------------------------------------------------------------------
// A subclass

export function subclassSchema(rt: Dnd5eRuntime): EntitySchema<Subclass5eDraft> {
	const cls = (d: Subclass5eDraft) => classOf(d.edition, d.className);
	return {
		kind: 'subclass', noun: 'subclass', icon: KIND5E.subclass.glyph,
		blank: (_p, path) => newSubclass5e(rt.edition(path)),
		seed: (seed, _p, path) => { const s = seedOf(seed); const ed = edOf(rt, seed, path); return s.entry ? fromSubclassEntry(s.entry, ed) : newSubclass5e(ed); },
		steps: d => {
			followClass(d);
			const levels = subclassLevelsFor(cls(d));
			return [
				{
					id: 'subclass', label: 'Subclass', icon: 'path', title: 'The subclass', sub: `${d.edition} rules`,
					rows: [
						{
							type: 'choice', key: 'className', label: 'Class', dropdown: true, rebuilds: true,
							options: x => [...new Set([...compendium5e(x.edition).classes.map(c => c.name), ...(x.className ? [x.className] : [])])].map(c => ({ value: c, label: c })),
							hint: x => levelsText(subclassLevelsFor(cls(x))),
						},
						{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Circle of Embers' },
						{ type: 'text', key: 'flavor', label: 'Title', words: true, placeholder: x => subclassTitleFor(cls(x)) },
						{ type: 'textarea', key: 'desc', label: 'Description', rows: 3, placeholder: 'Wardens of this circle keep a fire that never goes out.' },
					],
				},
				{
					id: 'features', label: 'Features', icon: 'sparkle', title: 'Features',
					rows: [featureField({ label: 'By level', add: 'Add a feature', levels: () => levels, table: false, blankLevel: () => levels.find(l => !d.features.some(f => levelOf(f) === l)) ?? levels[0] ?? 3 })],
				},
				{
					id: 'spells', label: 'Spells', icon: 'wand', title: 'Always prepared',
					rows: [{
						type: 'list', key: 'spells', label: 'Spells by class level', add: 'Add spells at a level',
						blank: () => ({ level: spellLevelsFor(cls(d)).find(l => !d.spells.some(s => levelOf(s) === l)) ?? 1, spells: [] }),
						title: (s) => `Level ${levelOf(s)}`,
						item: (s) => [
							{ type: 'number', key: 'level', label: 'Class level', min: 1, max: 20, placeholder: () => '1', rebuilds: true },
							{
								type: 'chips', key: 'spells', label: 'Spells', options: () => [],
								groups: () => classSpellNames(d.edition, d.className, maxSpellLevel(cls(d), levelOf(s as { level: number })) || Math.min(9, Math.ceil(levelOf(s as { level: number }) / 2))).map(g => ({ label: g.level === 1 ? (d.edition === '2014' ? '1st level' : 'Level 1') : d.edition === '2014' ? `${ord(g.level)} level` : `Level ${g.level}`, options: g.names })),
							},
						],
					}],
				},
				{ id: 'uses', label: 'Uses', icon: 'zap', title: 'Limited uses', rows: [resourcesField('Uses')] },
			];
		},
		preview: (el, d) => preview(el, rt, 'subclass', toSubclassEntry(d), d.edition),
		check(el, d) {
			checkHead(el, { kicker: d.className ? `${d.className} subclass` : 'Subclass', value: d.name.trim() || 'New subclass', tag: `${d.edition} rules` });
			const levels = [...new Set([...subclassLevelsFor(cls(d)), ...d.features.filter(f => f.name.trim()).map(levelOf), ...d.spells.filter(s => s.spells.length).map(levelOf)])].sort((a, b) => a - b);
			// Each level its class gives a subclass feature, and any it adds: what a hero gains there.
			for (const l of levels) {
				const chips = [
					...d.features.filter(f => f.name.trim() && levelOf(f) === l).map(f => ({ text: f.name.trim(), icon: evIcon('sparkle'), on: true })),
					...d.features.filter(f => levelOf(f) === l && f.options.some(o => o.name.trim())).map(f => ({ text: `Choose ${Math.max(1, f.choose ?? 1)}: ${f.name.trim() || 'options'}`, icon: evIcon('list') })),
					...d.spells.filter(s => levelOf(s) === l).flatMap(s => s.spells.map(n => ({ text: n, icon: evIcon('wand') }))),
					...d.resources.filter(r => r.name.trim() && (r.level ?? 1) === l).map(r => ({ text: r.name.trim(), icon: evIcon('zap') })),
				];
				part(el, `Level ${l}`, chips.length ? chips : [{ text: 'Not written yet', faint: true }]);
			}
		},
		chip: d => ({ text: d.className || 'Subclass', tone: 'none' }),
		missing: subclassMissing,
		output: d => ({ lang: '5e-subclass', body: toYaml(toSubclassEntry(d)), name: d.name.trim(), frontmatter: {}, folder: folder(rt, 'subclass') }),
	};
}

// ----------------------------------------------------------------------------
// A feat

export function featSchema(rt: Dnd5eRuntime): EntitySchema<Feat5eDraft> {
	return {
		kind: 'feat', noun: 'feat', icon: KIND5E.feat.glyph,
		blank: (_p, path) => newFeat5e(rt.edition(path)),
		seed: (seed, _p, path) => { const s = seedOf(seed); const ed = edOf(rt, seed, path); return s.entry ? fromFeatEntry(s.entry, ed) : newFeat5e(ed); },
		steps: d => [
			{
				id: 'feat', label: 'Feat', icon: 'medal', title: 'The feat', sub: `${d.edition} rules`,
				rows: [
					{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Kindler' },
					...(d.edition === '2024' ? [{ type: 'choice' as const, key: 'type', label: 'Category', options: () => FEAT_TYPES.map(t => ({ value: t.value, label: t.label })) }] : []),
					[
						{ type: 'text', key: 'prerequisite', label: 'Prerequisite', placeholder: x => defaultPrerequisite(x) || (x.edition === '2014' ? 'Strength 13 or higher' : 'None') },
						{ type: 'toggle', key: 'repeatable', label: 'Repeatable' },
					],
				],
			},
			{
				id: 'benefit', label: 'Benefit', icon: 'sparkle', title: 'What it gives',
				rows: [
					{ type: 'chips', key: 'increase', label: 'Ability Score Increase', options: () => [...ABILITY_ABBR], hint: x => (x.increase.length ? `+1, max ${x.type === 'epic-boon' ? 30 : 20}` : '') },
					{ type: 'textarea', key: 'desc', label: 'Text', rows: 8, placeholder: 'You can light a fire with a word. When a creature you can see within 30 feet of you takes Fire damage, you can add your Proficiency Bonus to the damage.' },
				],
			},
		],
		preview: (el, d) => preview(el, rt, 'feat', toFeatEntry(d), d.edition),
		check(el, d) {
			const type = FEAT_TYPES.find(t => t.value === d.type)?.label ?? 'General';
			checkHead(el, { kicker: d.edition === '2024' ? `${type} feat` : 'Feat', value: d.name.trim() || 'New feat', tag: `${d.edition} rules` });
			const when = d.edition === '2014' ? 'Instead of an increase'
				: d.type === 'origin' ? 'From a background, or a human\'s Versatile'
					: d.type === 'fighting-style' ? 'With a Fighting Style feature'
						: d.type === 'epic-boon' ? 'At level 19' : 'At an Ability Score Improvement';
			part(el, 'Taken', [{ text: when, icon: evIcon('clock'), on: true }, ...(d.repeatable ? [{ text: 'Repeatable', icon: evIcon('undo') }] : [])]);
			if (d.increase.length) part(el, 'Increase', [{ text: increaseText(d), icon: evIcon('chart') }]);
			if (replacesSrd(d.edition, 'feats', d.name) && !d.base) el.createDiv({ cls: 'dnd5e-cb-warn', text: `Yours replaces the SRD's ${d.name.trim()}.` });
		},
		chip: d => ({ text: d.edition === '2024' ? FEAT_TYPES.find(t => t.value === d.type)?.label ?? 'Feat' : 'Feat', tone: 'none' }),
		missing: d => (d.name.trim() ? (d.desc.trim() || d.increase.length ? null : 'Write what the feat does.') : 'Name the feat first.'),
		output: d => ({ lang: '5e-feat', body: toYaml(toFeatEntry(d)), name: d.name.trim(), frontmatter: {}, folder: folder(rt, 'feat') }),
	};
}

// ----------------------------------------------------------------------------
// A species (2014: a race)

const traitsField = (label: string, add: string): FieldDef => ({
	type: 'list', key: 'traits', label, add, blank: () => ({ name: '', desc: '' }),
	title: (t, i) => String((t as { name: string }).name || `Trait ${i + 1}`),
	item: () => [{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Warm Blood' }, { type: 'textarea', key: 'desc', label: 'Text', rows: 2, placeholder: 'You have Resistance to Cold damage.' }],
});
/** 2014's ability bonuses as two picks: +2 to, +1 to. */
function bonusFields(): FieldDef[] {
	const pick = (n: number): FieldDef => ({
		type: 'custom', key: `plus${n}`, label: `+${n} to`, draw: (control, m, ui) => {
			const x = m as { bonuses: Record<string, number> };
			const box = control.createDiv({ cls: 'eb-picks', attr: { role: 'group', 'aria-label': `+${n} to` } });
			for (const a of ABILITY_ABBR) {
				const b = pill(box, { tag: 'button', text: a, cls: 'eb-pick', attr: { type: 'button', 'aria-pressed': 'false' } }) as HTMLButtonElement;
				b.dataset.value = a;
				b.addEventListener('click', () => { if (x.bonuses[a] === n) delete x.bonuses[a]; else x.bonuses[a] = n; ui.changed(); });
				ui.live(() => { const on = x.bonuses[a] === n; b.toggleClass('is-active', on); b.setAttr('aria-pressed', String(on)); });
			}
		},
	});
	return [pick(2), pick(1)];
}

export function speciesSchema(rt: Dnd5eRuntime): EntitySchema<Species5eDraft> {
	return {
		kind: 'species', noun: 'species', icon: KIND5E.species.glyph,
		blank: (_p, path) => newSpecies5e(rt.edition(path)),
		seed: (seed, _p, path) => { const s = seedOf(seed); const ed = edOf(rt, seed, path); return s.entry ? fromSpeciesEntry(s.entry, ed) : newSpecies5e(ed); },
		steps: d => {
			const race = d.edition === '2014';
			const languages = (compendium5e(d.edition).languages ?? []).map(l => l.name);
			return [
				{
					id: 'species', label: race ? 'Race' : 'Species', icon: 'users-three', title: race ? 'The race' : 'The species', sub: `${d.edition} rules`,
					rows: [
						{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Emberfolk' },
						[
							{ type: 'choice', key: 'size', label: 'Size', options: opts(SIZES_5E) },
							{ type: 'number', key: 'speed', label: 'Speed', min: 0, max: 120, step: 5, placeholder: () => '30' },
						],
						[
							{ type: 'text', key: 'type', label: 'Creature type', placeholder: 'Humanoid' },
							{ type: 'choice', key: 'darkvision', label: 'Darkvision', numeric: true, options: () => [0, 60, 120].map(n => ({ value: String(n), label: n ? `${n} ft.` : 'None' })) },
						],
						...(race ? [...bonusFields(), { type: 'number' as const, key: 'abilityChoiceCount', label: '+1 to more of your choice', min: 0, max: 6, placeholder: () => '0' }] : []),
						{ type: 'textarea', key: 'desc', label: 'Description', rows: 2 },
					],
				},
				{ id: 'traits', label: 'Traits', icon: 'sparkle', title: race ? 'Racial traits' : 'Species traits', rows: [traitsField('Traits', 'Add a trait')] },
				{
					id: 'choices', label: 'Choices', icon: 'list', title: 'What it gives and lets you choose',
					rows: [
						{ type: 'chips', key: 'skills', label: 'Skills it gives', options: () => [...SKILL_NAMES] },
						{ type: 'number', key: 'skillCount', label: 'Skills to choose', min: 0, max: 6, placeholder: () => '0' },
						{ type: 'chips', key: 'skillFrom', label: 'From', options: () => [...SKILL_NAMES], show: x => !!x.skillCount },
						{ type: 'chips', key: 'cantripFrom', label: 'A cantrip from', options: x => cantripNames(x.edition), hint: x => (x.cantripFrom.length ? `${x.cantripFrom.length} to pick from` : '') },
						{ type: 'number', key: 'toolCount', label: 'Tools to choose', min: 0, max: 3, placeholder: () => '0' },
						{ type: 'chips', key: 'toolFrom', label: 'Tools from', options: x => toolNames(x.edition), show: x => !!x.toolCount },
						...(race ? [
							{ type: 'chips' as const, key: 'languages', label: 'Languages', options: () => languages },
							{ type: 'number' as const, key: 'languageCount', label: 'More languages to choose', min: 0, max: 4, placeholder: () => '0' },
						] : []),
					],
				},
				{
					id: 'lineages', label: race ? 'Subraces' : 'Lineages', icon: 'path', title: race ? 'Subraces' : 'Lineages',
					rows: [{
						type: 'list', key: 'subspecies', label: race ? 'Subraces' : 'Lineages', add: race ? 'Add a subrace' : 'Add a lineage', blank: newSubspecies5e,
						title: (s, i) => String((s as { name: string }).name || `${race ? 'Subrace' : 'Lineage'} ${i + 1}`),
						item: () => [
							{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: race ? 'Deep Emberfolk' : 'Ember Lineage: Deep' },
							...(race ? bonusFields() : []),
							{ type: 'chips', key: 'skills', label: 'Skills it gives', options: () => [...SKILL_NAMES] },
							{ type: 'chips', key: 'cantripFrom', label: 'A cantrip from', options: () => cantripNames(d.edition) },
							traitsField('Traits', 'Add a trait'),
						],
					}],
				},
			];
		},
		preview: (el, d) => preview(el, rt, 'species', toSpeciesEntry(d), d.edition),
		check(el, d) {
			const race = d.edition === '2014';
			checkHead(el, { kicker: race ? 'Race' : 'Species', value: d.name.trim() || `New ${race ? 'race' : 'species'}`, tag: `${d.edition} rules` });
			statTiles(el, [
				{ label: 'Size', value: d.size.replace(' or ', '/'), lead: true },
				{ label: 'Speed', value: String(d.speed ?? 30), sub: 'feet' },
				{ label: 'Darkvision', value: d.darkvision ? String(d.darkvision) : '—', sub: d.darkvision ? 'feet' : undefined },
			]);
			if (race && (bonusText(d.bonuses) || d.abilityChoiceCount)) part(el, 'Ability scores', [...ABILITY_ABBR.filter(a => d.bonuses[a]).map(a => ({ text: `${a} +${d.bonuses[a]}`, on: true })), ...(d.abilityChoiceCount ? [{ text: `+1 to ${d.abilityChoiceCount} more` }] : [])]);
			part(el, 'Traits', [...(d.darkvision ? ['Darkvision'] : []), ...d.traits.map(t => t.name.trim()).filter(Boolean)].map(t => ({ text: t, icon: evIcon('sparkle') })));
			part(el, 'Proficiencies', [
				...d.skills.map(s => ({ text: s, on: true })), ...(d.skillCount ? [{ text: `${d.skillCount} of ${d.skillFrom.length || 'any'} skills` }] : []),
				...(d.cantripFrom.length ? [{ text: d.cantripFrom.length === 1 ? d.cantripFrom[0] : `A cantrip of ${d.cantripFrom.length}`, icon: evIcon('wand') }] : []),
				...(d.toolCount ? [{ text: `${d.toolCount} tool${d.toolCount > 1 ? 's' : ''}` }] : []),
			]);
			if (race) part(el, 'Languages', [...d.languages.map(l => ({ text: l, on: true })), ...(d.languageCount ? [{ text: `${d.languageCount} more` }] : [])]);
			part(el, race ? 'Subraces' : 'Lineages', d.subspecies.filter(s => s.name.trim()).map(s => ({ text: s.name.trim().replace(/^[^:]+:\s*/, ''), icon: evIcon('path') })));
			if (replacesSrd(d.edition, 'species', d.name) && !d.base) el.createDiv({ cls: 'dnd5e-cb-warn', text: `Yours replaces the SRD's ${d.name.trim()}.` });
		},
		chip: d => ({ text: `${d.size} · ${d.speed ?? 30} ft.`, tone: 'none' }),
		missing: d => (d.name.trim() ? null : `Name the ${d.edition === '2014' ? 'race' : 'species'} first.`),
		output: d => ({ lang: '5e-species', body: toYaml(toSpeciesEntry(d)), name: d.name.trim(), frontmatter: {}, folder: folder(rt, 'species') }),
	};
}

// ----------------------------------------------------------------------------
// A background

/** 2024's origin feats, with Magic Initiate for each of its lists. */
function originFeats(edition: Dnd5eEdition): string[] {
	return compendium5e(edition).feats.filter(f => f.type === 'origin').flatMap(f => (/^Magic Initiate$/i.test(f.name) ? ['Cleric', 'Druid', 'Wizard'].map(c => `${f.name} (${c})`) : [f.name]));
}

export function backgroundSchema(rt: Dnd5eRuntime): EntitySchema<Background5eDraft> {
	return {
		kind: 'background', noun: 'background', icon: KIND5E.background.glyph,
		blank: (_p, path) => newBackground5e(rt.edition(path)),
		seed: (seed, _p, path) => { const s = seedOf(seed); const ed = edOf(rt, seed, path); return s.entry ? fromBackgroundEntry(s.entry, ed) : newBackground5e(ed); },
		steps: d => {
			const now = d.edition === '2024';
			return [
				{
					id: 'background', label: 'Background', icon: 'scroll', title: 'The background', sub: `${d.edition} rules`,
					rows: [
						{ type: 'text', key: 'name', label: 'Name', words: true, placeholder: 'Lamplighter' },
						...(now ? [
							{ type: 'chips' as const, key: 'abilities', label: 'Ability scores', options: () => [...ABILITY_ABBR], max: () => 3, hint: (x: Background5eDraft) => (x.abilities.length < 3 ? `${3 - x.abilities.length} more` : '') },
							{ type: 'choice' as const, key: 'feat', label: 'Origin feat', dropdown: true, options: (x: Background5eDraft) => [{ value: '', label: '—' }, ...[...new Set([...originFeats(x.edition), ...(x.feat ? [x.feat] : [])])].map(f => ({ value: f, label: f }))] },
						] : []),
					],
				},
				{
					id: 'profs', label: 'Training', icon: 'target', title: 'Proficiencies',
					rows: [
						{ type: 'chips', key: 'skills', label: 'Skills', options: () => [...SKILL_NAMES], max: () => 2 },
						{ type: 'chips', key: 'tools', label: now ? 'Tool' : 'Tools', options: x => toolNames(x.edition), max: () => (now ? 1 : 2) },
						{ type: 'chips', key: 'toolFrom', label: 'Or a tool to choose from', options: x => toolNames(x.edition), show: x => !x.tools.length },
						...(now ? [] : [{ type: 'number' as const, key: 'languageCount', label: 'Languages to choose', min: 0, max: 4, placeholder: () => '0' }]),
					],
				},
				...(now ? [] : [{
					id: 'feature', label: 'Feature', icon: 'sparkle', title: 'Its feature',
					rows: [
						{ type: 'text' as const, key: 'featureName', label: 'Name', words: true, placeholder: 'Lamp Lore' },
						{ type: 'textarea' as const, key: 'featureDesc', label: 'Text', rows: 5, placeholder: 'You know every lamp on every street, and who lights it.' },
					],
				}]),
				{
					id: 'equipment', label: 'Gear', icon: 'backpack', title: 'Equipment',
					rows: [
						{ type: 'text', key: 'items', label: now ? 'Option A' : 'Items', placeholder: 'Tinker\'s Tools, Traveler\'s Clothes, 2 Oil' },
						[
							{ type: 'number', key: 'gold', label: now ? 'And GP' : 'GP', min: 0, max: 999, placeholder: () => '0' },
							...(now ? [{ type: 'number' as const, key: 'goldInstead', label: 'Option B: GP', min: 0, max: 999, placeholder: () => '—' }] : []),
						],
					],
				},
			];
		},
		preview: (el, d) => preview(el, rt, 'background', toBackgroundEntry(d), d.edition),
		check(el, d) {
			checkHead(el, { kicker: 'Background', value: d.name.trim() || 'New background', tag: `${d.edition} rules` });
			if (d.edition === '2024') abilityRow(el, 'Ability scores', d.abilities);
			part(el, 'Proficiencies', [
				...d.skills.map(s => ({ text: s, on: true })),
				...d.tools.map(t => ({ text: t })),
				...(d.toolFrom.length ? [{ text: `A tool of ${d.toolFrom.length}` }] : []),
				...(d.languageCount ? [{ text: `${d.languageCount} language${d.languageCount > 1 ? 's' : ''}` }] : []),
			]);
			if (d.edition === '2024' && d.feat) part(el, 'Origin feat', [{ text: d.feat, icon: evIcon('medal'), on: true }]);
			if (d.edition === '2014' && d.featureName.trim()) part(el, 'Feature', [{ text: d.featureName.trim(), icon: evIcon('sparkle'), on: true }]);
			const items = d.items.split(',').map(s => s.trim()).filter(Boolean);
			part(el, 'Equipment', [...items.map(i => ({ text: i })), ...(d.gold ? [{ text: `${d.gold} GP`, icon: evIcon('coins') }] : [])], d.edition === '2024' && d.goldInstead ? `or ${d.goldInstead} GP` : undefined);
			if (replacesSrd(d.edition, 'backgrounds', d.name) && !d.base) el.createDiv({ cls: 'dnd5e-cb-warn', text: `Yours replaces the SRD's ${d.name.trim()}.` });
		},
		chip: d => ({ text: d.skills.length ? d.skills.join(' · ') : 'Background', tone: 'none' }),
		missing: d => (d.name.trim() ? null : 'Name the background first.'),
		output: d => ({ lang: '5e-background', body: toYaml(toBackgroundEntry(d)), name: d.name.trim(), frontmatter: {}, folder: folder(rt, 'background') }),
	};
}

// ----------------------------------------------------------------------------

/** A schema's builder, its noun in the edition's words ("race" in 2014). */
function factory<M extends Record<string, unknown> & { edition: Dnd5eEdition }>(rt: Dnd5eRuntime, schema: EntitySchema<M>, noun2014?: string) {
	return (plugin: EmberVaultPlugin, seed: unknown) => {
		const ed = edOf(rt, seed, plugin.app.workspace.getActiveFile()?.path ?? '');
		return new SchemaBuilder(plugin, noun2014 && ed === '2014' ? { ...schema, noun: noun2014 } : schema, seed);
	};
}

/** 5e's character content in core's builder: New on the Classes, Origins and Feats tabs opens these. */
export function registerContentBuilders5e(rt: Dnd5eRuntime): void {
	const group = 'content';
	registerKind('dnd5e', 'class', { label: 'Class', icon: KIND5E.class.glyph, group }, factory(rt, classSchema(rt)));
	registerKind('dnd5e', 'subclass', { label: 'Subclass', icon: KIND5E.subclass.glyph, group }, factory(rt, subclassSchema(rt)));
	registerKind('dnd5e', 'species', { label: 'Species', icon: KIND5E.species.glyph, group }, factory(rt, speciesSchema(rt), 'race'));
	registerKind('dnd5e', 'background', { label: 'Background', icon: KIND5E.background.glyph, group }, factory(rt, backgroundSchema(rt)));
	registerKind('dnd5e', 'feat', { label: 'Feat', icon: KIND5E.feat.glyph, group }, factory(rt, featSchema(rt)));
}
