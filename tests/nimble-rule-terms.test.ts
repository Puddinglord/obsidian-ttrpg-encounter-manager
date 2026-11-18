import { describe, expect, it } from 'vitest';
import { ruleTerms } from '../src/core/rule-terms';
import { execWithLead } from '../src/core/markdown';
import { Compendium } from '../src/systems/nimble/compendium';
import { buildEntries } from '../src/systems/nimble/compendium-entries';
import { nimbleRuleTerms } from '../src/systems/nimble/rule-terms';
import { NIMBLE_CONDITIONS } from '../src/systems/nimble/types';
import DATA from '../src/systems/nimble/data/compendium.json';

const comp = new Compendium(DATA as never, { drafts: true });
const terms = nimbleRuleTerms(comp, NIMBLE_CONDITIONS);
const t = ruleTerms(terms);
const marks = (text: string, prose: boolean) => {
	const re = t.pattern(prose);
	const out: string[] = [];
	let rest = text;
	for (let m = re && execWithLead(re, rest); m; m = re && execWithLead(re, rest)) { out.push(m[0]); rest = rest.slice(m.index + m[0].length); }
	return out;
};

describe('Nimble rules words', () => {
	it('every term has text and opens a compendium page', () => {
		const ids = new Set(buildEntries({ monsters: [], compendium: comp, conditions: NIMBLE_CONDITIONS }).map(e => e.id));
		expect(terms.length).toBeGreaterThan(40);
		for (const term of terms) {
			expect(term.text.trim(), term.name).not.toBe('');
			expect(ids.has(term.id), `${term.name} → ${term.id}`).toBe(true);
		}
	});
	it('has every condition, the four stats by name and abbreviation, every skill and language', () => {
		for (const c of NIMBLE_CONDITIONS.filter(c => !c.auto)) expect(t.get(c.name)?.tag, c.name).toBe('Condition');
		for (const [name, abbr] of [['Strength', 'STR'], ['Dexterity', 'DEX'], ['Intelligence', 'INT'], ['Will', 'WIL']]) {
			expect(t.get(name)?.tag).toBe('Stat');
			expect(t.get(abbr)?.name).toBe(name);
		}
		const rules = (DATA as { rules: { skills: { name: string }[]; languages: { name: string }[] } }).rules;
		for (const s of rules.skills) expect(t.get(s.name)?.tag, s.name).toBe('Skill');
		for (const l of rules.languages) expect(t.get(l.name)?.tag, l.name).toBe('Language');
	});
	it('marks conditions, stats and Concentration in running text, and languages only in fields', () => {
		expect(marks('On a failed DC 12 STR save the target is Grappled; it loses Concentration.', true)).toEqual(['STR', 'Grappled', 'Concentration']);
		expect(marks('Common, Goblin', true)).toEqual([]);
		expect(marks('Common, Goblin', false)).toEqual(['Common', 'Goblin']);
	});
	it('takes the GM\'s own conditions too', () => {
		const mine = ruleTerms(nimbleRuleTerms(comp, [...NIMBLE_CONDITIONS, { name: 'Burning', description: 'Takes 1d6 fire damage each turn.' }]));
		expect(mine.get('Burning')?.tag).toBe('Condition');
	});
});
