import { describe, expect, it } from 'vitest';
import { handEnteredLeft, isSheetMember, mergeParty, PartyMember } from '../src/types';

const hand = (name: string, id = name.toLowerCase()): PartyMember => ({ id, name, level: 2, maxHp: 20 });
const sheet = (name: string): PartyMember => ({ id: `sheet:Campaigns/X/Party/${name}.md`, name, level: 3, maxHp: 30 });

describe('the encounter party of a campaign you run', () => {
	it('keeps heroes entered by hand when the first sheet arrives', () => {
		const typed = [hand('Kestrel'), hand('Bram'), hand('Ilse')];
		expect(mergeParty([sheet('Wren')], typed).map(m => m.name)).toEqual(['Wren', 'Kestrel', 'Bram', 'Ilse']);
	});

	it('a sheet replaces the hand-entered hero with its name (ignoring case and spaces)', () => {
		const typed = [hand('Kestrel'), hand('Bram')];
		const merged = mergeParty([sheet('bram ')], typed);
		expect(merged.map(m => m.name)).toEqual(['bram ', 'Kestrel']);
		expect(merged[0].level).toBe(3);
	});

	it('drops sheet heroes whose sheet is gone, and is stable when run again', () => {
		const before = mergeParty([sheet('Wren'), sheet('Tomas')], [hand('Kestrel')]);
		const after = mergeParty([sheet('Wren')], before);
		expect(after.map(m => m.name)).toEqual(['Wren', 'Kestrel']);
		expect(mergeParty([sheet('Wren')], after)).toEqual(after);
	});

	it('with no sheets left, the hand-entered party is all that remains', () => {
		expect(mergeParty([], [sheet('Wren'), hand('Kestrel')]).map(m => m.name)).toEqual(['Kestrel']);
	});

	it('tells sheet heroes from hand-entered ones', () => {
		expect(isSheetMember(sheet('Wren'))).toBe(true);
		expect(isSheetMember(hand('Kestrel'))).toBe(false);
		expect(handEnteredLeft([hand('Kestrel'), sheet('Wren')], ['kestrel'])).toEqual([]);
	});
});
