import { describe, expect, it } from 'vitest';
import { SystemRegistry, normalizeSystemId } from '../src/systems/registry';
import type { GameSystem } from '../src/systems/contract';
import { createSystems, SHIPPED_SYSTEMS } from '../src/app/systems';

const fake = (id: string): GameSystem => ({
	id, name: id,
	attribution: { text: '', supportNotice: '', storeUrl: '', storeLabel: '' },
	conditions: [],
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
	it('names each condition once, with a description', () => {
		const names = system.conditions.map(c => c.name.toLowerCase());
		expect(new Set(names).size).toBe(names.length);
		for (const c of system.conditions) expect(c.description.trim()).not.toBe('');
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
});
