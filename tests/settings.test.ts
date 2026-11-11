import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings, NimbleStatblocksSettings } from '../src/types';

describe('reading saved settings', () => {
	it('nothing saved yet gives the defaults, without sharing their lists', () => {
		const s = migrateSettings(null);
		expect(s.dice3d).toBe(true);
		expect(s.dice3dOnPhone).toBe(false);
		expect(s.encounters).toEqual([]);
		s.encounters.push({} as never);
		s.party.push({} as never);
		expect(DEFAULT_SETTINGS.encounters).toEqual([]);
		expect(DEFAULT_SETTINGS.party).toEqual([]);
	});

	it('keeps good data and brings older saves up to date', () => {
		const s = migrateSettings({
			dice3dOnPhone: true,
			encounters: [{ id: 'e', name: 'Fight', creatures: [{ id: 'c', conditions: ['Blinded', { name: 'Dazed' }], lrUsed: 2 }] }],
		});
		expect(s.dice3dOnPhone).toBe(true);
		const c = s.encounters[0].creatures[0];
		expect(c.conditions).toEqual([{ name: 'Blind' }, { name: 'Dazed' }]);
		expect(c.side).toBe('monster');
		expect('lrUsed' in c).toBe(false);
		expect(s.encounters[0].phase).toBe('setup');
		expect(s.encounters[0].log).toEqual([]);
	});

	it('a damaged file loads with the bad parts dropped', () => {
		const s = migrateSettings({
			encounters: [null, 'x', { id: 'e', creatures: 'oops' }, { id: 'f', creatures: [null, { id: 'c' }], log: 5 }],
			rollLog: {}, party: 'four', customConditions: [null, { description: 'no name' }, { name: 'Soaked', description: 'Wet.' }],
			campaigns: [], activeCampaign: 7, dice: { styles: [null] },
		} as unknown as Partial<NimbleStatblocksSettings>);
		expect(s.encounters.map(e => e.id)).toEqual(['e', 'f']);
		expect(s.encounters[0].creatures).toEqual([]);
		expect(s.encounters[1].creatures.map(c => c.id)).toEqual(['c']);
		expect(s.encounters[1].log).toEqual([]);
		expect(s.rollLog).toEqual([]);
		expect(s.party).toEqual([]);
		expect(s.customConditions.map(c => c.name)).toEqual(['Soaked']);
		expect(s.campaigns).toEqual({});
		expect(s.activeCampaign).toBeNull();
		expect(s.dice.styles).toEqual([]);
	});

	it('refuses a file whose top level is not an object, so the caller can fall back', () => {
		expect(() => migrateSettings([1, 2])).toThrow();
		expect(() => migrateSettings('nope')).toThrow();
	});
});
