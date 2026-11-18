import { describe, expect, it } from 'vitest';
import { RuleTerm, ruleTerms } from '../src/core/rule-terms';
import { execWithLead } from '../src/core/markdown';

const T: RuleTerm[] = [
	{ id: 'darkvision', name: 'Darkvision', names: ['darkvision'], tag: 'Sense', text: 'See in the dark.', prose: true },
	{ id: 'ac', name: 'Armor Class', names: ['AC'], tag: 'Rule', text: 'How hard you are to hit.' },
	{ id: 'dim', name: 'Dim Light', tag: 'Rule', text: 'Lightly Obscured.', prose: true },
];

const found = (re: RegExp | undefined, text: string) => {
	const out: string[] = [];
	let rest = text;
	for (let m = re && execWithLead(re, rest); m; m = re && execWithLead(re, rest)) { out.push(m[0]); rest = rest.slice(m.index + m[0].length); }
	return out;
};

describe('rule terms', () => {
	it('finds a term by its name or any other name, then ignoring case', () => {
		const t = ruleTerms(T);
		expect(t.get('Darkvision')?.id).toBe('darkvision');
		expect(t.get('darkvision')?.id).toBe('darkvision');
		expect(t.get('AC')?.id).toBe('ac');
		expect(t.get('armor class')?.id).toBe('ac');
		expect(t.get('Truesight')).toBeUndefined();
	});
	it('marks every term in a field, and only running-text terms in prose', () => {
		const t = ruleTerms(T);
		expect(found(t.pattern(false), 'AC 15; Darkvision 60 ft. in Dim Light')).toEqual(['AC', 'Darkvision', 'Dim Light']);
		expect(found(t.pattern(true), 'AC 15; Darkvision 60 ft. in Dim Light')).toEqual(['Darkvision', 'Dim Light']);
	});
	it('matches whole words as written, longest first', () => {
		const t = ruleTerms([...T, { id: 'dim2', name: 'Dim', text: '' }]);
		expect(found(t.pattern(false), 'Dim Light, Dimly, ACE, dim light')).toEqual(['Dim Light']);
	});
	it('is made once per list', () => {
		expect(ruleTerms(T)).toBe(ruleTerms(T));
		expect(ruleTerms([]).pattern(false)).toBeUndefined();
	});
});
