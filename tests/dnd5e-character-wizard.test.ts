// 5e's character wizards, every permutation: every class × species (and 2014
// subrace) × background × level × edition makes a sheet that reads back right,
// and every class levels from 1 to 20 with each kind of increase. Then the
// wizard's steps, drawn by core's schema builder and driven like a user.
import { describe, expect, it } from 'vitest';
import type EmberVaultPlugin from '../main';
import type { BuilderUI } from '../src/core/builder/frame';
import { SchemaBuilder } from '../src/core/builder/schema';
import { readSheet5e, SKILLS } from '../src/systems/dnd5e/character';
import {
	applyLevelUp5e, asiLevels, averageGain, backgroundOf, backgroundSkills, bonuses, Character5eDraft, characterFm, characterMissing, classOf, finalScores, hasAsi, needsSubclass, newCharacter5e,
	newLevelUp5e, pointsSpent, skillChoice, speciesBonuses, spellsAt, subclassLevel, withArray,
} from '../src/systems/dnd5e/character-draft';
import { characterSchema, levelUpSchema } from '../src/systems/dnd5e/character-wizard';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';
import type { Dnd5eRuntime } from '../src/systems/dnd5e/runtime';
import { ABILITIES } from '../src/systems/dnd5e/types';

const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
function sweep<T>(cases: T[], check: (c: T) => void): void {
	const fails: string[] = [];
	for (const c of cases) {
		try { check(c); } catch (e) { fails.push(`${JSON.stringify(c).slice(0, 140)}: ${(e as Error).message.split('\n')[0]}`); }
	}
	expect(fails.slice(0, 5), `${fails.length} of ${cases.length} failed`).toEqual([]);
}

describe('reading the rules from the compendium', () => {
	it.each(EDITIONS)('%s: every class says how many skills it picks, and from which', (ed) => {
		for (const c of compendium5e(ed).classes) {
			const sc = skillChoice(c.skillChoice);
			expect(sc.count, c.name).toBeGreaterThanOrEqual(2);
			expect(sc.from.length, c.name).toBeGreaterThanOrEqual(sc.count);
			for (const s of sc.from) expect(SKILLS.map(k => k.name)).toContain(s);
		}
		expect(skillChoice('Choose two from Arcana, History, and Insight')).toEqual({ count: 2, from: ['Arcana', 'History', 'Insight'] });
		expect(skillChoice('Choose 3: Acrobatics, Athletics, or Stealth')).toEqual({ count: 3, from: ['Acrobatics', 'Athletics', 'Stealth'] });
		expect(skillChoice('Choose any three').count).toBe(3);
		expect(skillChoice('Choose any three').from.length).toBe(18);
	});
	it('subclass levels, increases and spells by edition', () => {
		expect(subclassLevel(classOf('2014', 'Cleric'))).toBe(1);
		expect(subclassLevel(classOf('2014', 'Wizard'))).toBe(2);
		expect(subclassLevel(classOf('2014', 'Fighter'))).toBe(3);
		for (const c of compendium5e('2024').classes) expect(subclassLevel(c), c.name).toBe(3);
		expect(asiLevels(classOf('2014', 'Fighter'))).toEqual([4, 6, 8, 12, 14, 16, 19]);
		expect(asiLevels(classOf('2024', 'Wizard'))).toEqual([4, 8, 12, 16, 19]);
		expect(spellsAt(classOf('2024', 'Wizard'), 1)).toEqual({ cantrips: 3, maxLevel: 1 });
		expect(spellsAt(classOf('2024', 'Wizard'), 5).maxLevel).toBe(3);
		expect(spellsAt(classOf('2024', 'Fighter'), 5)).toEqual({ cantrips: 0, maxLevel: 0 });
	});
	it('ability bonuses: 2014 from the race text, 2024 from the background', () => {
		expect(speciesBonuses('CON +2')).toEqual({ con: 2 });
		expect(speciesBonuses('Dex +2, Wis +1')).toEqual({ dex: 2, wis: 1 });
		expect(speciesBonuses('All +1')).toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
		const d = { ...newCharacter5e('2024'), plus2: 'int', plus1: 'wis' };
		expect(bonuses(d)).toEqual({ int: 2, wis: 1 });
		expect(bonuses({ ...d, plus1: 'int' })).toEqual({ int: 2 });
		const dw = { ...newCharacter5e('2014'), species: 'Dwarf' };
		expect(bonuses(dw)).toEqual({ con: 2 });
	});
	it('point buy counts 27 points, and over budget can\'t be made', () => {
		const d: Character5eDraft = { ...newCharacter5e('2024'), name: 'P', method: 'pointbuy', str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 };
		expect(pointsSpent(d)).toBe(27);
		expect(characterMissing(d)).toBeNull();
		expect(characterMissing({ ...d, int: 10 })).toMatch(/29 points/);
		expect(characterMissing({ ...d, name: '' })).toMatch(/Name/);
	});
});

describe('every new character makes a sheet that reads back', () => {
	for (const ed of EDITIONS) {
		it(`${ed}: every class × species × background × level`, () => {
			const c = compendium5e(ed);
			const species = c.species.flatMap(s => (ed === '2014' && s.subspecies.length ? s.subspecies.map(x => ({ species: s.name, sub: x.name })) : [{ species: s.name, sub: '' }]));
			const cases = c.classes.flatMap(k => species.flatMap(s => c.backgrounds.flatMap(b => [1, 2, 3, 4, 5, 11, 20].map(level => ({ cls: k.name, ...s, bg: b.name, level })))));
			sweep(cases, ({ cls, species: sp, sub, bg, level }) => {
				const d = withArray({ ...newCharacter5e(ed, { name: 'Tester', level }), className: cls, species: sp, subspecies: sub, background: bg });
				const k = classOf(ed, cls)!;
				const bgSkills = backgroundSkills(c.backgrounds.find(x => x.name === bg));
				const sc = skillChoice(k.skillChoice);
				d.skills = sc.from.filter(s => !bgSkills.includes(s)).slice(0, sc.count);
				if (level >= subclassLevel(k) && k.subclasses.length) d.subclass = k.subclasses[0].name;
				const { cantrips, maxLevel } = spellsAt(k, level);
				const cl = c.spells.filter(s => s.classes.includes(cls));
				d.cantrips = cl.filter(s => s.level === 0).slice(0, cantrips).map(s => s.name);
				d.spells = maxLevel ? cl.filter(s => s.level >= 1 && s.level <= maxLevel).slice(0, 4).map(s => s.name) : [];
				expect(characterMissing(d)).toBeNull();
				const fm = characterFm(d);
				const s = readSheet5e(fm, ed, 'Tester');
				expect(s.level).toBe(level);
				expect(s.className).toBe(cls);
				expect(s.hpMax).toBeGreaterThan(0);
				expect(s.pb).toBe(2 + Math.floor((level - 1) / 4));
				const scores = finalScores(d);
				for (const a of ABILITIES) { expect(s.scores[a]).toBe(scores[a]); expect(scores[a]).toBeLessThanOrEqual(20); }
				for (const sk of [...bgSkills, ...d.skills]) expect(s.skills.find(x => x.name === sk)?.proficient, sk).toBe(true);
				expect(s.skills.filter(x => x.proficient).length).toBe(new Set([...bgSkills, ...d.skills]).size);
				if (d.subclass) expect(s.subclass).toBe(d.subclass);
				expect(s.spells.map(x => x.name)).toEqual([...d.cantrips, ...d.spells]);
				for (const sp2 of s.spells) expect(sp2.spell, sp2.name).toBeDefined();
			});
		});
	}
});

describe('every class levels from 1 to 20', () => {
	for (const ed of EDITIONS) {
		it(`${ed}: hit points, subclass on time, every increase (+2, +1/+1, a feat), spells`, () => {
			const c = compendium5e(ed);
			const takes: ('plus2' | 'plus1' | 'feat')[] = ['plus2', 'plus1', 'feat'];
			sweep(c.classes.flatMap(k => takes.map(take => ({ cls: k.name, take }))), ({ cls, take }) => {
				const fm = characterFm(withArray({ ...newCharacter5e(ed, { name: 'Climber' }), className: cls }));
				const k = classOf(ed, cls)!;
				for (let level = 2; level <= 20; level++) {
					const before = readSheet5e(fm, ed, 'Climber');
					const d = newLevelUp5e(fm, ed, 'Climber');
					expect(d.level).toBe(level);
					expect(needsSubclass(d)).toBe(!before.subclass && k.subclasses.length > 0 && level >= subclassLevel(k));
					if (needsSubclass(d)) d.subclass = k.subclasses[0].name;
					expect(hasAsi(d)).toBe(asiLevels(k).includes(level));
					d.asi = take;
					d.feat = c.feats.find(f => f.type !== 'origin')?.name ?? c.feats[0]?.name ?? '';
					const max = spellsAt(k, level).maxLevel;
					d.spells = max ? c.spells.filter(s => s.classes.includes(cls) && s.level === max && !d.known.includes(s.name)).slice(0, 1).map(s => s.name) : [];
					applyLevelUp5e(fm, d);
					const after = readSheet5e(fm, ed, 'Climber');
					expect(after.level).toBe(level);
					expect(after.hpMax - before.hpMax).toBe(Math.max(1, Math.floor(k.hitDie / 2) + 1 + before.mods.con));
					if (level >= subclassLevel(k) && k.subclasses.length) expect(after.subclass).toBe(k.subclasses[0].name);
					if (hasAsi(d) && take !== 'feat') {
						const gained = ABILITIES.reduce((n, a) => n + after.scores[a] - before.scores[a], 0);
						// +2 in all, unless a score hit the cap of 20.
						const room = take === 'plus2' ? Math.min(2, 20 - before.scores[d.a1 as 'str']) : Math.min(1, 20 - before.scores[d.a1 as 'str']) + Math.min(1, 20 - before.scores[d.a2 as 'str']);
						expect(gained).toBe(Math.min(2, room));
					}
					if (hasAsi(d) && take === 'feat' && d.feat) expect(after.features.some(f => f.name === d.feat && f.source === 'Feat')).toBe(true);
					for (const a of ABILITIES) expect(after.scores[a]).toBeLessThanOrEqual(20);
					for (const s of d.spells) expect(after.spells.map(x => x.name)).toContain(s);
				}
				expect(readSheet5e(fm, ed, 'Climber').level).toBe(20);
				// No level 21.
				const capped = { ...fm };
				applyLevelUp5e(capped, newLevelUp5e(capped, ed, 'Climber'));
				expect(capped.level).toBe(20);
			});
		});
	}
	it('a rolled or table hit die counts as rolled', () => {
		const fm = characterFm(withArray({ ...newCharacter5e('2024', { name: 'R' }), className: 'Fighter' }));
		const hp = Number(fm.hp_max);
		const d = { ...newLevelUp5e(fm, '2024', 'R'), hp: 'roll' as const };
		applyLevelUp5e(fm, d, 7);
		expect(Number(fm.hp_max) - hp).toBe(7 + d.conMod);
		const m = { ...newLevelUp5e(fm, '2024', 'R'), hp: 'manual' as const, manual: 1 };
		const before = Number(fm.hp_max);
		applyLevelUp5e(fm, m);
		expect(Number(fm.hp_max) - before).toBe(Math.max(1, 1 + m.conMod));
	});
});

// ----------------------------------------------------------------------------
// The wizard's steps

const app = { workspace: { getActiveFile: () => null }, metadataCache: { getFirstLinkpathDest: () => null } };
const plugin = { app, campaigns: { active: null } } as unknown as EmberVaultPlugin;
const rt = (ed: Dnd5eEdition) => ({ plugin, edition: () => ed }) as unknown as Dnd5eRuntime;
function harness<M extends Record<string, unknown>>(b: SchemaBuilder<M>) {
	let lives: (() => void)[] = [];
	const panel = document.createElement('div');
	let step = b.steps()[0].id;
	const ui: BuilderUI = { plugin, sourcePath: '', phone: false, changed: () => lives.forEach(f => f()), rebuild: () => draw(step), live: (f) => { lives.push(f); f(); }, go: () => {}, nudge: () => {} };
	const draw = (id: string) => { step = id; lives = []; panel.empty(); b.renderStep(id, panel, ui); };
	return { ui, panel, draw };
}

describe.each(EDITIONS)('the wizards drawn by the schema engine (%s)', (ed) => {
	it('New character: every step draws; class skills stop at the class\'s count; the output is a 5e sheet note', () => {
		const b = new SchemaBuilder(plugin, characterSchema(rt(ed)), { request: { mine: true, name: 'Ilse', level: 3 } });
		const h = harness(b);
		for (const s of b.steps()) { h.draw(s.id); expect(h.panel.querySelectorAll('.eb-field').length, s.id).toBeGreaterThan(0); }
		const d = b.draft;
		d.className = 'Wizard';
		h.draw('skills');
		const picks = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-key="skills"] .eb-pick')];
		const count = skillChoice(classOf(ed, 'Wizard')!.skillChoice).count;
		picks.slice(0, count + 1).forEach(p => p.click());
		expect(d.skills.length).toBe(count);
		expect(picks[count].disabled).toBe(true);
		h.draw('class');
		expect(h.panel.querySelector('[data-key="subclass"]')!.classList.contains('is-hidden')).toBe(false);
		expect(h.panel.querySelector('[data-key="cantrips"]')!.classList.contains('is-hidden')).toBe(false);
		const preview = document.createElement('div');
		b.renderPreview(preview, h.ui);
		expect(preview.textContent).toMatch(/Ilse[\s\S]*Level 3[\s\S]*Wizard/);
		const out = b.output();
		expect(out.lang).toBe('5e-sheet');
		expect(out.properties).toMatchObject({ system: '5e', edition: ed, class: 'Wizard', level: 3, mine: true });
		expect(out.after).toBe('## Notes');
	});
	it('New character: a card per ability, point buy\'s budget, the background\'s skills ticked, spells under their levels', () => {
		const b = new SchemaBuilder(plugin, characterSchema(rt(ed)), { request: { mine: true, name: 'Ilse', level: 5 } });
		const h = harness(b);
		const d = b.draft;
		d.className = 'Wizard';
		h.draw('abilities');
		expect(h.panel.querySelectorAll('.dnd5e-ab-card').length).toBe(6);
		expect(h.panel.querySelector('[data-key="points"]')!.classList.contains('is-hidden')).toBe(true);
		d.method = 'pointbuy';
		h.draw('abilities');
		expect(h.panel.querySelector('[data-key="points"]')!.classList.contains('is-hidden')).toBe(false);
		expect(h.panel.querySelector('.dnd5e-budget-spent')!.textContent).toBe(`${pointsSpent(d)} of 27 points`);
		h.draw('skills');
		expect([...h.panel.querySelectorAll<HTMLElement>('.eb-pick-given')].map(e => e.dataset.fixed)).toEqual(backgroundSkills(backgroundOf(d)));
		h.draw('class');
		const heads = [...h.panel.querySelectorAll('[data-key="spells"] .eb-pick-head-label')].map(e => e.textContent);
		expect(heads).toEqual(ed === '2014' ? ['1st level', '2nd level', '3rd level'] : ['Level 1', 'Level 2', 'Level 3']);
		const preview = document.createElement('div');
		b.renderPreview(preview, h.ui);
		expect(preview.querySelectorAll('.dnd5e-brief-ability').length).toBe(6);
		expect(preview.querySelector('.dnd5e-brief-ability.is-prof .dnd5e-brief-ab-name')?.textContent).toBe('INT');
	});
	it('Level up: the draft knows the hit point maximum, and the summary shows the new one', () => {
		const fm = characterFm(withArray({ ...newCharacter5e(ed, { name: 'Vex', level: 3 }), className: 'Fighter' }));
		const d = newLevelUp5e(fm, ed, 'Vex');
		expect(d.hpMax).toBe(Number(fm.hp_max));
		const b = new SchemaBuilder(plugin, levelUpSchema(rt(ed)), { fm, edition: ed, name: 'Vex' });
		const preview = document.createElement('div');
		b.renderPreview(preview, harness(b).ui);
		expect(preview.textContent).toContain(`max ${Number(fm.hp_max) + averageGain(d)}`);
	});
	it('Level up: steps follow the level (a subclass at 3, an increase at 4), and the output carries the draft', () => {
		const fm = characterFm(withArray({ ...newCharacter5e(ed, { name: 'Vex', level: 3 }), className: 'Fighter' }));
		delete fm.subclass;
		const at3 = new SchemaBuilder(plugin, levelUpSchema(rt(ed)), { fm: { ...fm, level: 2 }, edition: ed, name: 'Vex' });
		expect(at3.steps().map(s => s.id)).toEqual(['hp', 'subclass']);
		const at4 = new SchemaBuilder(plugin, levelUpSchema(rt(ed)), { fm, edition: ed, name: 'Vex' });
		expect(at4.steps().map(s => s.id)).toEqual(['hp', 'subclass', 'asi']);
		const h = harness(at4);
		for (const s of at4.steps()) h.draw(s.id);
		const preview = document.createElement('div');
		at4.renderPreview(preview, h.ui);
		expect(preview.textContent).toMatch(/Vex[\s\S]*level 3 → 4/);
		expect((at4.output() as { data?: unknown }).data).toBe(at4.draft);
	});
});
