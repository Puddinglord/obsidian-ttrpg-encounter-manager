import { describe, expect, it } from 'vitest';
import { ruleTerms } from '../src/core/rule-terms';
import { execWithLead } from '../src/core/markdown';
import { compendium5e } from '../src/systems/dnd5e/compendium';
import { conditionsFor } from '../src/systems/dnd5e/conditions';
import { ruleTerms5e, termPage5e } from '../src/systems/dnd5e/rule-terms';
import type { Dnd5eEdition } from '../src/systems/dnd5e/editions';

const EDITIONS: Dnd5eEdition[] = ['2024', '2014'];
const marks = (edition: Dnd5eEdition, text: string, prose: boolean) => {
	const re = ruleTerms(ruleTerms5e(edition)).pattern(prose);
	const out: string[] = [];
	let rest = text;
	for (let m = re && execWithLead(re, rest); m; m = re && execWithLead(re, rest)) { out.push(m[0]); rest = rest.slice(m.index + m[0].length); }
	return out;
};

describe.each(EDITIONS)('5e rules words, %s', (edition) => {
	const terms = ruleTerms5e(edition);
	const t = ruleTerms(terms);

	it('every term has text and a compendium page in its own edition', () => {
		for (const term of terms) {
			expect(term.text.trim(), term.name).not.toBe('');
			const page = termPage5e(edition, term);
			expect(page, `${term.name} has a page`).toBeDefined();
			expect(page!.edition).toBe(edition);
		}
	});
	it('has every condition, ability, skill and language', () => {
		const c = compendium5e(edition);
		for (const cond of conditionsFor(edition)) expect(t.get(cond.name)?.tag, cond.name).toBe('Condition');
		expect(c.abilities).toHaveLength(6);
		for (const a of c.abilities!) {
			const short = a.abbr.charAt(0) + a.abbr.slice(1).toLowerCase();
			for (const word of [a.name, a.abbr, short]) expect(t.get(word)?.tag, word).toBe('Ability');
		}
		expect(c.skills).toHaveLength(18);
		for (const k of c.skills!) expect(t.get(k.name)?.tag, k.name).toBe('Skill');
		expect(c.languages!.length).toBeGreaterThanOrEqual(16);
		for (const l of c.languages!) expect(t.get(l.name)?.tag, l.name).toBe('Language');
	});
	it('knows the senses a stat block lists', () => {
		for (const s of ['Darkvision', 'Blindsight', 'Truesight', 'Passive Perception']) expect(t.get(s)?.tag, s).toBe('Sense');
	});
	it('marks a stat block\'s fields as each edition writes them', () => {
		if (edition === '2024') {
			expect(marks(edition, 'Darkvision 60 ft.; Passive Perception 8', false)).toEqual(['Darkvision', 'Passive Perception']);
			expect(marks(edition, '40 ft., Fly 60 ft., Swim 30 ft.', false)).toEqual(['Fly', 'Swim']);
			expect(marks(edition, 'Common, Giant; telepathy 60 ft.', false)).toEqual(['Common', 'Giant', 'telepathy']);
		} else {
			expect(marks(edition, 'darkvision 60 ft., passive Perception 8', false)).toEqual(['darkvision', 'passive Perception']);
			expect(marks(edition, 'Common, Giant', false)).toEqual(['Common', 'Giant']);
		}
	});
	it('marks rules in running text, but not everyday words', () => {
		const text = edition === '2024'
			? 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 Bludgeoning damage, and the target has the Prone condition. The creature can take the Magic action while in Dim Light.'
			: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: the target is knocked prone and has disadvantage on its next saving throw.';
		const got = marks(edition, text, true);
		expect(got).toContain(edition === '2024' ? 'Prone' : 'prone');
		for (const plain of ['Attack Roll', 'Magic', 'target', 'Target', 'creature', 'Creature', 'reach', 'Hit']) expect(got, plain).not.toContain(plain);
	});
});

describe('5e rules words, 2024 glossary', () => {
	it('every SRD 5.2 glossary entry is a term (conditions as conditions)', () => {
		const t = ruleTerms(ruleTerms5e('2024'));
		const glossary = compendium5e('2024').rules.filter(r => r.topic === 'Rules Glossary');
		expect(glossary.length).toBe(155);
		for (const g of glossary) expect(t.get(g.name), g.name).toBeDefined();
	});
	it('reads stat block labels as their rules', () => {
		const t = ruleTerms(ruleTerms5e('2024'));
		for (const [label, rule] of [['AC', 'Armor Class'], ['HP', 'Hit Points'], ['CR', 'Challenge Rating'], ['PB', 'Proficiency'], ['Immunities', 'Immunity'], ['Bonus Actions', 'Bonus Action'], ['Initiative', 'Initiative']]) {
			expect(t.get(label)?.name, label).toBe(rule);
		}
	});
});
