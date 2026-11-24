import { describe, expect, it } from 'vitest';
import { changedFields, recordFact } from '../src/core/import/facts';
import { groupSources, sizeText, Source } from '../src/core/import/sources';
import type { CheckedRecord } from '../src/core/import/bundle';

const file = (name: string, text?: string): Source => ({ id: name, kind: 'file', name, ...(text !== undefined ? { text } : { data: new Uint8Array([1]) }), size: 1 });

describe('reading what was given, a group each', () => {
	it('a picture goes with the data file of its name; the rest are read on their own', () => {
		const groups = groupSources([file('crypt.json', '{}'), file('mire-hag.json', '{}'), file('crypt.png'), file('region.webp'), { id: 't', kind: 'text', name: 'Pasted', text: 'x', size: 1 }]);
		expect(groups.map(g => g.sources.map(s => s.name))).toEqual([['crypt.json', 'crypt.png'], ['mire-hag.json'], ['Pasted'], ['region.webp']]);
		expect(groups[0].input).toEqual({ files: [{ name: 'crypt.json', text: '{}' }, { name: 'crypt.png', data: new Uint8Array([1]) }] });
		expect(groups[2].input).toEqual({ files: [], text: 'x' });
	});
	it('a lone picture goes with the one data file that takes pictures, not with a monster', () => {
		const takes = (s: Source) => s.name === 'dungeon.json';
		expect(groupSources([file('dungeon.json', '{}'), file('scan.png')], takes).map(g => g.sources.length)).toEqual([2]);
		expect(groupSources([file('nexus.json', '{}'), file('scan.png')], takes).map(g => g.sources.map(s => s.name))).toEqual([['nexus.json'], ['scan.png']]);
	});
	it('sizes read plainly', () => {
		expect([sizeText(820), sizeText(14_000), sizeText(1_258_291)]).toEqual(['820 bytes', '14 KB', '1.2 MB']);
	});
});

describe('the fact under each row', () => {
	const rec = (o: Partial<CheckedRecord>): CheckedRecord => ({ type: 'content', kind: 'monster', name: 'X', at: '', errors: [], warnings: [], value: {}, ...o });
	it('says the one useful thing for each kind', () => {
		expect(recordFact(rec({ value: { level: '4', type: 'Fey', role: 'regular' } }), 'Monster')).toBe('Monster · Level 4 · Fey');
		expect(recordFact(rec({ value: { level: '1', role: 'minion' } }), 'Monster')).toBe('Monster · Level 1 · Minion');
		expect(recordFact(rec({ value: { cr: '1/2', type: 'undead' } }), 'Monster')).toBe('Monster · CR 1/2 · undead');
		expect(recordFact(rec({ type: 'map', kind: 'map', value: { pins: [{}, {}], grid: '30x20' } }), 'Map')).toBe('Map · 2 pins · 30 × 20');
		expect(recordFact(rec({ type: 'note', kind: 'npc', value: { fields: { role: 'Cleric of the Tide' } } }), 'NPC')).toBe('NPC · Cleric of the Tide');
		expect(recordFact(rec({ kind: 'spell', value: { level: 0, school: 'Evocation' } }), 'Spell')).toBe('Spell · Cantrip · Evocation');
		expect(recordFact(rec({ kind: 'item', value: { rarity: 'very rare', subcategory: 'Lantern' } }), 'Item')).toBe('Item · Very rare · Lantern');
		expect(recordFact(rec({ value: undefined, errors: ['"hp" is missing'] }), 'Monster')).toBe('Monster · Left out');
	});
	it('what an update changes, without its import fields', () => {
		expect(changedFields({ name: 'A', hp: 9, imported: 'X' }, { name: 'A', hp: 12, speed: 6, importId: 'y' })).toEqual([{ key: 'hp', before: 9, after: 12 }, { key: 'speed', before: undefined, after: 6 }]);
	});
});
