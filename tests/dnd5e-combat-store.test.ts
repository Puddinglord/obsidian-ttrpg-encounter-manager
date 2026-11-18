import { describe, expect, it } from 'vitest';
import type EmberVaultPlugin from '../main';
import { FightStore } from '../src/systems/dnd5e/combat-store';

function plugin(): EmberVaultPlugin {
	return { settings: {}, saveSettings: async () => {}, events: { trigger: () => {} } } as unknown as EmberVaultPlugin;
}

describe('5e FightStore', () => {
	it('saves each change under systemData.dnd5e.fight', () => {
		const p = plugin();
		const store = new FightStore(p);
		store.reset('Ambush', '2024');
		store.change(f => { f.round = 2; });
		expect((p.settings as unknown as { systemData: { dnd5e: { fight: { name: string; round: number } } } }).systemData.dnd5e.fight).toMatchObject({ name: 'Ambush', round: 2 });
	});
	it('reads the fight again when the saved one is replaced (a sync) or removed', () => {
		const p = plugin();
		const store = new FightStore(p);
		store.reset('Ambush', '2024');
		const data = (p.settings as unknown as { systemData: { dnd5e: Record<string, unknown> } }).systemData.dnd5e;
		data.fight = { ...(data.fight as object), name: 'Synced' };
		expect(store.fight.name).toBe('Synced');
		delete data.fight;
		expect(store.fight.name).not.toBe('Synced');
		expect(store.fight.combatants).toEqual([]);
	});
	it('starts afresh when a fight it saved itself is removed', () => {
		const p = plugin();
		const store = new FightStore(p);
		store.reset('Ambush', '2024');
		delete (p.settings as unknown as { systemData: { dnd5e: Record<string, unknown> } }).systemData.dnd5e.fight;
		expect(store.fight.name).not.toBe('Ambush');
	});
	it('a new fight wins over one re-read from disk (Run after settings synced)', () => {
		const p = plugin();
		const store = new FightStore(p);
		store.reset('Old', '2024');
		const data = (p.settings as unknown as { systemData: { dnd5e: Record<string, unknown> } }).systemData.dnd5e;
		data.fight = { ...(data.fight as object), name: 'Synced' }; // settings re-read: a new object, not yet read by the store
		store.reset('Bridge', '2024');
		expect(store.fight.name).toBe('Bridge');
		expect((data.fight as { name: string }).name).toBe('Bridge');
	});
});
