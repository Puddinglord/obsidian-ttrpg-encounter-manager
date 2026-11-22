// Nimble's rules words for core's clickable terms (core/rule-terms.ts): its
// conditions, the four stats, skills, languages, and the magic and equipment
// rules its text names. Each term's id is its compendium entry's id, so Open
// in compendium goes straight to the page. Pure: no Obsidian imports.

import type { RuleTerm } from '../../core/rule-terms';
import type { ConditionDef } from '../../core/types';
import { Compendium, nameKey } from './compendium';
import { ruleEntries } from './compendium-entries';

/** Rules also marked in running text (abilities, spells, features), besides conditions and stats. */
const PROSE = new Set(['Concentration', 'Smoldering', 'Hampered', 'Charged', 'Half on Save', 'Unarmed Strikes']);
/** Other ways Nimble's text names a rule. */
const ALIASES: Record<string, string[]> = {
	'Unarmed Strikes': ['Unarmed Strike'],
	'Armor & Defense': ['Defense'],
	'Concentration': ['concentrating'],
};

const ruleId = (topic: string, name: string) => `rule:${nameKey(topic)}:${nameKey(name)}`;

export function nimbleRuleTerms(comp: Compendium | undefined, conditions: readonly ConditionDef[]): RuleTerm[] {
	const out: RuleTerm[] = [];
	const seen = new Set<string>();
	const add = (t: RuleTerm) => {
		const k = t.name.toLowerCase();
		if (seen.has(k)) return;
		seen.add(k);
		out.push(t);
	};
	for (const c of conditions) {
		if (c.auto) continue;
		add({ id: `condition:${nameKey(c.name)}`, name: c.name, tag: 'Condition', text: c.description, prose: true });
	}
	const rules = ruleEntries(comp);
	for (const r of rules) {
		if (r.topic === 'Stats') {
			// "Strength (STR)"
			const m = /^(.*?)\s*\((\w+)\)$/.exec(r.name);
			const name = m ? m[1] : r.name;
			add({ id: ruleId(r.topic, r.name), name, names: m ? [m[2]] : [], tag: 'Stat', text: r.text, prose: true });
		} else if (r.topic === 'Skills') {
			add({ id: ruleId(r.topic, r.name), name: r.name, tag: 'Skill', text: r.text });
		} else if (r.topic === 'Magic' || r.topic === 'Equipment' || (r.pack && r.topic !== 'Weapon properties')) {
			add({ id: ruleId(r.topic, r.name), name: r.name, names: ALIASES[r.name], tag: 'Rule', text: r.text, prose: PROSE.has(r.name) });
		}
	}
	// Languages share one page; each gets a card of its own.
	const page = rules.find(r => r.name === 'Languages');
	const list = Array.isArray(comp?.rules?.languages) ? comp.rules.languages as { name?: unknown; speakers?: unknown }[] : [];
	const intro = typeof comp?.rules?.languagesText === 'string' ? comp.rules.languagesText : '';
	for (const l of list) {
		if (typeof l.name !== 'string') continue;
		const speakers = typeof l.speakers === 'string' ? `**Spoken by.** ${l.speakers}` : '';
		add({ id: page ? ruleId(page.topic, page.name) : `language:${nameKey(l.name)}`, name: l.name, tag: 'Language', text: [speakers, intro].filter(Boolean).join('\n') });
	}
	return out;
}
