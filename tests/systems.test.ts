import { describe, expect, it } from 'vitest';
import { SystemRegistry, normalizeSystemId, resolveEdition } from '../src/systems/registry';
import type { GameSystem } from '../src/systems/contract';
import { createSystems, SHIPPED_SYSTEMS } from '../src/app/systems';

const fake = (id: string): GameSystem => ({
	id, name: id,
	attribution: { text: '', supportNotice: '', storeUrl: '', storeLabel: '' },
	conditions: () => [],
	quickLook: () => {},
});

describe('SystemRegistry', () => {
	it('resolves a campaign\'s system, ignoring case and spaces', () => {
		const r = new SystemRegistry('a');
		r.register(fake('a'));
		r.register(fake('b'));
		expect(r.resolve('b').id).toBe('b');
		expect(r.resolve(' B ').id).toBe('b');
		expect(normalizeSystemId(' NimBle ')).toBe('nimble');
	});
	it('falls back to the default for no system or one it doesn\'t have', () => {
		const r = new SystemRegistry('a');
		r.register(fake('a'));
		expect(r.resolve(undefined).id).toBe('a');
		expect(r.resolve('').id).toBe('a');
		expect(r.resolve('gurps').id).toBe('a');
	});
	it('finds a system by any of its aliases, and refuses an alias another system has', () => {
		const r = new SystemRegistry('a');
		r.register({ ...fake('dnd5e'), aliases: ['5e', 'D&D  5e'] });
		expect(r.resolve('5E').id).toBe('dnd5e');
		expect(r.resolve('d&d 5e').id).toBe('dnd5e');
		expect(() => r.register({ ...fake('other'), aliases: ['5e'] })).toThrow(/already names/);
	});
	it('resolves an edition the system has, else its first', () => {
		const s = { ...fake('x'), editions: [{ id: '2024', label: '' }, { id: '2014', label: '' }] };
		expect(resolveEdition(s, '2014')).toBe('2014');
		expect(resolveEdition(s, 2014)).toBe('2014');
		expect(resolveEdition(s, ' 2014 ')).toBe('2014');
		expect(resolveEdition(s, undefined)).toBe('2024');
		expect(resolveEdition(s, '1999')).toBe('2024');
		expect(resolveEdition(fake('y'), '2014')).toBeUndefined();
	});
	it('refuses the same id twice, and a default that was never registered', () => {
		const r = new SystemRegistry('a');
		r.register(fake('a'));
		expect(() => r.register(fake('a'))).toThrow();
		expect(() => new SystemRegistry('missing').default).toThrow();
	});
});

// The conformance suite: every system the plugin ships has to pass these.
describe.each(SHIPPED_SYSTEMS.map(s => [s.id, s] as const))('game system %s', (_id, system) => {
	it('has a lower-case id, a name and attribution', () => {
		expect(system.id).toBe(normalizeSystemId(system.id));
		expect(system.name.trim()).not.toBe('');
		expect(system.attribution.text.trim()).not.toBe('');
		expect(system.attribution.storeUrl).toMatch(/^https:\/\//);
	});
	const editions = system.editions?.map(e => e.id) ?? [undefined];
	it.each(editions)('names each condition once, with a description (edition %s)', (edition) => {
		const list = system.conditions(edition);
		expect(list.length).toBeGreaterThan(0);
		const names = list.map(c => c.name.toLowerCase());
		expect(new Set(names).size).toBe(names.length);
		for (const c of list) expect(c.description.trim()).not.toBe('');
	});
	it('has unique edition ids, each with a label', () => {
		const ids = (system.editions ?? []).map(e => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const e of system.editions ?? []) expect(e.label.trim()).not.toBe('');
	});
	it('can open a quick look', () => {
		expect(typeof system.quickLook).toBe('function');
	});
	it('makes characters both ways, if it has character sheets', () => {
		if (!system.characters) return;
		expect(typeof system.characters.promptNew).toBe('function');
		expect(typeof system.characters.createFromPartyMember).toBe('function');
	});
});

describe('shipped systems', () => {
	it('register without clashing, Nimble first as the default', () => {
		const r = createSystems();
		expect(r.default.id).toBe('nimble');
		expect(r.all().map(s => s.id)).toEqual(SHIPPED_SYSTEMS.map(s => s.id));
	});
	it('read what campaigns write: "Nimble", and "5e" with an edition', () => {
		const r = createSystems();
		expect(r.resolve('Nimble').id).toBe('nimble');
		expect(r.resolve('5e').id).toBe('dnd5e');
		const dnd = r.resolve('5e');
		expect(resolveEdition(dnd, '2014')).toBe('2014');
		expect(resolveEdition(dnd, undefined)).toBe('2024');
		expect(dnd.conditions('2014').find(c => c.name === 'Exhaustion')?.hasValue).toBe(true);
	});
});
