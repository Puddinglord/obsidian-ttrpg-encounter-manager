import { describe, expect, it } from 'vitest';
import { parseNpcCard, portraitLink } from '../src/core/npc-card-def';

describe('parseNpcCard', () => {
	it('reads label: value rows in order', () => {
		const d = parseNpcCard('look: Tall, one glass eye\nwants: The mill back\nvoice: Clipped.');
		expect(d.fields.map(f => [f.label, f.value])).toEqual([
			['Look', 'Tall, one glass eye'], ['Wants', 'The mill back'], ['Voice', 'Clipped.'],
		]);
	});

	it('takes name and role as overrides, not rows', () => {
		const d = parseNpcCard('name: Marta Hale\nrole: Miller\nwants: Revenge');
		expect(d.name).toBe('Marta Hale');
		expect(d.role).toBe('Miller');
		expect(d.fields).toHaveLength(1);
	});

	it('accepts the bold style used in boxes', () => {
		const d = parseNpcCard('**Look:** Soot on her apron\n- **Secret:** Sold the water rights');
		expect(d.fields).toEqual([
			{ key: 'look', label: 'Look', value: 'Soot on her apron' },
			{ key: 'secret', label: 'Secret', value: 'Sold the water rights' },
		]);
	});

	it('keeps empty rows, so a new card shows what to fill in', () => {
		const d = parseNpcCard('look: \nwants:\n');
		expect(d.fields.map(f => f.value)).toEqual(['', '']);
	});

	it('runs unlabelled lines into the row above', () => {
		const d = parseNpcCard('knows:\n- The wheel turns at night\n- Silt hates fire\nvoice: Low');
		expect(d.fields[0].value).toBe('- The wheel turns at night\n- Silt hates fire');
		expect(d.fields[1].label).toBe('Voice');
	});

	it("doesn't mistake a URL for a label", () => {
		const d = parseNpcCard('look: see\nhttps://example.com/art');
		expect(d.fields).toHaveLength(1);
		expect(d.fields[0].value).toBe('see\nhttps://example.com/art');
	});
});

describe('portraitLink', () => {
	it.each([
		['[[Marta.png]]', 'Marta.png'],
		['![[Assets/Marta.png|200]]', 'Assets/Marta.png'],
		['Assets/Marta.png', 'Assets/Marta.png'],
		['![](Assets/Marta%20Hale.png)', 'Assets/Marta Hale.png'],
		['https://example.com/a.png', 'https://example.com/a.png'],
	])('%s → %s', (input, out) => expect(portraitLink(input)).toBe(out));

	it('uses the first entry of a list and ignores junk', () => {
		expect(portraitLink(['[[a.png]]', '[[b.png]]'])).toBe('a.png');
		expect(portraitLink('')).toBeNull();
		expect(portraitLink(3)).toBeNull();
		expect(portraitLink(null)).toBeNull();
	});
});

describe('npcFacts', () => {
	it('reads the quick facts from properties', async () => {
		const { npcFacts } = await import('../src/core/npc-card-def');
		const f = npcFacts({ ancestry: 'Dwarf', pronouns: 'she/her', age: 54, faction: '[[Zhentarim]]', location: '', status: 'Alive', attitude: 'Hostile', first_met: '[[Session 2]]' });
		expect(f.details).toEqual(['Dwarf', 'she/her', '54 years']);
		expect(f.faction).toBe('[[Zhentarim]]');
		expect(f.location).toBeUndefined();
		expect(f.status).toBe('alive');
		expect(f.attitude).toBe('hostile');
		expect(f.firstMet).toBe('[[Session 2]]');
	});

	it('is empty for a bare note', async () => {
		const { npcFacts } = await import('../src/core/npc-card-def');
		expect(npcFacts({})).toEqual({ details: [] });
	});
});
