// Core's schema builder (core/builder/schema.ts) drawing 5e's builders: every
// step of every kind draws, its fields write the draft, formulas show as
// hints, lists add and remove, and the preview and output follow.
import { describe, expect, it } from 'vitest';
import type EmberVaultPlugin from '../main';
import type { BuilderUI } from '../src/core/builder/frame';
import { EntitySchema, SchemaBuilder } from '../src/core/builder/schema';
import { itemSchema, monsterSchema, spellSchema } from '../src/systems/dnd5e/builders';
import type { Monster5eDraft } from '../src/systems/dnd5e/builder-model';
import { renderStatblock5e } from '../src/systems/dnd5e/render';
import type { Dnd5eRuntime } from '../src/systems/dnd5e/runtime';
import { parseStatblock5e } from '../src/systems/dnd5e/parser';
import { parseItem5e, parseSpell5e } from '../src/systems/dnd5e/homebrew';

const app = { workspace: { getActiveFile: () => null }, metadataCache: { getFirstLinkpathDest: () => null } };
const plugin = { app, campaigns: { active: null } } as unknown as EmberVaultPlugin;
const rt = (edition: '2024' | '2014') => ({
	plugin, edition: () => edition,
	render: (el: HTMLElement, m: Parameters<typeof renderStatblock5e>[1], o: { edition?: '2024' | '2014' }) => renderStatblock5e(el, m, { app, sourcePath: '', variant: 'block', edition: o.edition ?? edition } as unknown as Parameters<typeof renderStatblock5e>[2]),
	cardOptions: () => ({ app, sourcePath: '' }),
}) as unknown as Dnd5eRuntime;

/** A builder frame stand-in: live updaters run on every change, rebuild redraws the step. */
function harness<M extends Record<string, unknown>>(schema: EntitySchema<M>, seed?: unknown) {
	const b = new SchemaBuilder(plugin, schema, seed);
	let lives: (() => void)[] = [];
	let rebuilds = 0;
	const panel = document.createElement('div');
	let step = b.steps()[0].id;
	const ui: BuilderUI = {
		plugin, sourcePath: '', phone: false,
		changed: () => lives.forEach(f => f()),
		rebuild: () => { rebuilds++; draw(step); },
		live: (f) => { lives.push(f); f(); },
		go: () => {}, nudge: () => {},
	};
	const draw = (id: string) => { step = id; lives = []; panel.empty(); b.renderStep(id, panel, ui); };
	return { b, ui, panel, draw, rebuilds: () => rebuilds };
}
const input = (panel: HTMLElement, key: string) => panel.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-key="${key}"] input, [data-key="${key}"] textarea, [data-key="${key}"] select`)!;
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input')); };

describe.each(['2024', '2014'] as const)('5e builders drawn by the schema engine (%s)', (ed) => {
	for (const [name, make] of [['monster', monsterSchema], ['spell', spellSchema], ['item', itemSchema]] as const) {
		it(`${name}: every step draws, with a field for each of its keys, and the preview renders`, () => {
			const schema = (make as (r: Dnd5eRuntime) => EntitySchema<Record<string, unknown>>)(rt(ed));
			const h = harness(schema);
			for (const s of h.b.steps()) {
				h.draw(s.id);
				expect(h.panel.querySelectorAll('.eb-field').length, s.id).toBeGreaterThan(0);
				for (const row of h.panel.querySelectorAll<HTMLElement>('[data-key]')) expect(row.querySelector('.eb-label')?.textContent).toBeTruthy();
			}
			const preview = document.createElement('div');
			h.b.renderPreview(preview, h.ui);
			expect(preview.childElementCount).toBeGreaterThan(0);
			expect(h.b.missing()).toMatch(/Name the/);
		});
	}

	it('monster: typing writes the draft, hints follow the formulas, the output reads back', () => {
		const h = harness(monsterSchema(rt(ed)));
		const d = h.b.draft as Monster5eDraft;
		h.draw('basics');
		type(input(h.panel, 'name') as HTMLInputElement, 'Ember Hound');
		const cr = input(h.panel, 'cr') as HTMLSelectElement;
		cr.value = '5';
		cr.dispatchEvent(new Event('change'));
		expect(d.cr).toBe('5');
		expect(h.panel.querySelector('[data-key="cr"] .eb-aside')!.textContent).toBe('PB +3 · 1,800 XP');
		h.draw('stats');
		type(input(h.panel, 'con') as HTMLInputElement, '16');
		expect(d.con).toBe(16);
		expect(h.panel.querySelector('[data-key="con"] .eb-aside')!.textContent).toBe('+3');
		expect(h.panel.querySelector('[data-key="hp"] .eb-aside')!.textContent).toBe(ed === '2014' ? '4d8 + 12' : '4d8 + 12');
		h.draw('proficiencies');
		h.panel.querySelector<HTMLButtonElement>('[data-key="saves"] .eb-pick[data-value="Con"]')!.click();
		expect(d.saves).toEqual(['Con']);
		expect(h.panel.querySelector('[data-key="saves"] .eb-aside')!.textContent).toBe('Con +6');
		// Expertise shows once there's a skill.
		expect(h.panel.querySelector('[data-key="expertise"]')!.classList.contains('is-hidden')).toBe(true);
		h.panel.querySelector<HTMLButtonElement>('[data-key="skills"] .eb-pick[data-value="Perception"]')!.click();
		expect(h.panel.querySelector('[data-key="expertise"]')!.classList.contains('is-hidden')).toBe(false);
		h.draw('actions');
		h.panel.querySelector<HTMLButtonElement>('[data-key="traits"] .eb-list-add')!.click();
		expect(d.traits.length).toBe(1);
		expect(h.rebuilds()).toBe(1);
		const out = h.b.output();
		expect(out.lang).toBe('5e');
		const m = parseStatblock5e(out.body)!;
		expect(m).toMatchObject({ name: 'Ember Hound', cr: '5', hp: 30, saves: { con: 6 }, skills: { Perception: 3 }, edition: ed });
		expect(m.actions![0].desc).toMatch(ed === "2014" ? /\+3 to hit/ : /Attack Roll: \+3/);
		expect(h.b.missing()).toBeNull();
	});

	it('monster: the Edit button opens it with the block\'s stats', () => {
		const h = harness(monsterSchema(rt(ed)), { monster: parseStatblock5e('name: Ogre\nsize: Large\ntype: giant\nac: 11\nhp: 59 (7d10 + 21)\nstr: 19\ncon: 16\ncr: 2\nactions:\n- Club: It hits.') });
		const d = h.b.draft as Monster5eDraft;
		expect(d).toMatchObject({ name: 'Ogre', size: 'Large', type: 'Giant', ac: 11, hitDice: 7, str: 19, con: 16, cr: '2' });
		expect(d.hp).toBeUndefined();
		expect(parseStatblock5e(h.b.output().body)).toMatchObject({ name: 'Ogre', hp: 59, hpFormula: '7d10 + 21', actions: [{ name: 'Club', desc: 'It hits.' }] });
	});

	it('spell: chips and toggles write the draft; the block reads back', () => {
		const h = harness(spellSchema(rt(ed)));
		h.draw('basics');
		type(input(h.panel, 'name') as HTMLInputElement, 'Ember Lash');
		h.panel.querySelector<HTMLButtonElement>('[data-key="classes"] .eb-pick[data-value="Wizard"]')!.click();
		h.draw('casting');
		expect(h.panel.querySelector('[data-key="material"]')!.classList.contains('is-hidden')).toBe(true);
		h.panel.querySelector<HTMLButtonElement>('[data-key="components"] .eb-pick[data-value="M"]')!.click();
		expect(h.panel.querySelector('[data-key="material"]')!.classList.contains('is-hidden')).toBe(false);
		type(input(h.panel, 'material') as HTMLInputElement, 'a pinch of ash');
		h.draw('effect');
		type(input(h.panel, 'desc') as HTMLTextAreaElement, 'A whip of fire.');
		const s = parseSpell5e(h.b.output().body)!;
		expect(s).toMatchObject({ name: 'Ember Lash', classes: ['Wizard'], components: 'V, S, M (a pinch of ash)', desc: 'A whip of fire.' });
		expect(h.b.output().lang).toBe('5e-spell');
	});

	it('item: attunement by someone shows on the item line', () => {
		const h = harness(itemSchema(rt(ed)));
		h.draw('basics');
		type(input(h.panel, 'name') as HTMLInputElement, 'Ember Blade');
		Object.assign(h.b.draft, { type: 'Weapon', subtype: 'Longsword', rarity: 'Rare', attunement: true, attunedBy: 'a Paladin' });
		const i = parseItem5e(h.b.output().body, ed)!;
		expect(i).toMatchObject({ name: 'Ember Blade', type: 'Weapon (Longsword)', rarity: 'Rare', attunement: true });
		expect(i.line).toBe(ed === '2014' ? 'Weapon (Longsword), rare (requires attunement by a Paladin)' : 'Weapon (Longsword), Rare (Requires Attunement by a Paladin)');
	});
});

// ----------------------------------------------------------------------------
// The engine's own controls: grouped, fixed and labelled chips, and a system's own field.

describe('schema chips and custom fields', () => {
	type D = { picks: string[]; drew: number };
	const schema = (groups: boolean): EntitySchema<D> => ({
		kind: 'test', noun: 'test', icon: 'x', blank: () => ({ picks: [], drew: 0 }),
		steps: () => [{
			id: 'one', label: 'One', icon: 'x', rows: [
				{
					type: 'chips', key: 'picks', label: 'Picks', options: () => ['A', 'B', 'C', 'D'], max: () => 2,
					groups: groups ? () => [{ label: 'First', options: ['A', 'B'] }, { label: 'Empty', options: [] }, { label: 'Second', options: ['C', 'D'] }] : undefined,
					fixed: () => ({ values: ['Z'], why: 'Already yours' }),
					meta: o => (o === 'A' ? 'Str' : ''),
				},
				{ type: 'custom', key: 'own', label: 'Own', draw: (el, m) => { m.drew++; el.createDiv({ cls: 'own-thing', text: 'mine' }); } },
			],
		}],
		preview: () => {}, missing: () => null, output: () => ({ lang: 'x', body: '', name: '', frontmatter: {}, folder: '' }),
	});

	it('groups chips under headings (empty groups left out), counting the picks in each', () => {
		const h = harness(schema(true));
		h.draw('one');
		expect([...h.panel.querySelectorAll('.eb-pick-head-label')].map(e => e.textContent)).toEqual(['First', 'Second']);
		h.panel.querySelector<HTMLButtonElement>('.eb-pick[data-value="C"]')!.click();
		h.panel.querySelector<HTMLButtonElement>('.eb-pick[data-value="D"]')!.click();
		expect(h.b.draft.picks).toEqual(['C', 'D']);
		expect([...h.panel.querySelectorAll('.eb-pick-head-count')].map(e => e.textContent)).toEqual(['', '2 picked']);
		// At the limit the rest wait; the fixed one is never a button.
		expect(h.panel.querySelector<HTMLButtonElement>('.eb-pick[data-value="A"]')!.disabled).toBe(true);
		expect(h.panel.querySelector('.eb-pick-given')!.tagName).toBe('SPAN');
	});

	it('shows fixed chips first, a chip\'s word, and draws a system\'s own field', () => {
		const h = harness(schema(false));
		h.draw('one');
		const first = h.panel.querySelector<HTMLElement>('[data-key="picks"] .eb-picks')!.firstElementChild as HTMLElement;
		expect(first.classList.contains('eb-pick-given')).toBe(true);
		expect(first.dataset.fixed).toBe('Z');
		expect(h.panel.querySelectorAll('[data-key="picks"] .eb-pick').length).toBe(4);
		expect(h.panel.querySelector('.eb-pick[data-value="A"] .eb-pick-meta')?.textContent).toBe('Str');
		expect(h.panel.querySelector('.eb-pick[data-value="B"] .eb-pick-meta')).toBeNull();
		expect(h.panel.querySelector('[data-key="own"] .own-thing')?.textContent).toBe('mine');
		expect(h.b.draft.drew).toBe(1);
	});
});
