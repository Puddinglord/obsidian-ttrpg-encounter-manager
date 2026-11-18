// 5e's rules words for core's clickable terms (core/rule-terms.ts): conditions,
// senses, the six abilities, skills, languages, and the rules a stat block's
// labels name (AC, HP, Speed, CR…). 2024 reads SRD 5.2's Rules Glossary; 2014
// the SRD 5.1's rules sections. Pure: no Obsidian imports.

import type { RuleTerm } from '../../core/rule-terms';
import { abilityText, compendium5e, contentVersion5e, findHit, Hit5e, languageText, Rule5e, skillText } from './compendium';
import { conditionsFor } from './conditions';
import type { Dnd5eEdition } from './editions';

/** 2024 glossary entries also marked in running text (traits, actions, spells), besides conditions and hazards. */
const PROSE_2024 = new Set([
	'Blindsight', 'Darkvision', 'Tremorsense', 'Truesight', 'Passive Perception', 'Telepathy', 'Teleportation',
	'Bright Light', 'Dim Light', 'Darkness', 'Heavily Obscured', 'Lightly Obscured', 'Difficult Terrain', 'Cover',
	'Bloodied', 'Concentration', 'Advantage', 'Disadvantage', 'Critical Hit', 'Temporary Hit Points', 'Hit Point Dice',
	'Opportunity Attacks', 'Resistance', 'Vulnerability', 'Immunity', 'Long Rest', 'Short Rest', 'Unarmed Strike',
	'Death Saving Throw', 'Saving Throw', 'Heroic Inspiration', 'Hover', 'Grappling', 'Ritual', 'Cantrip', 'Surprise',
	'Burrow Speed', 'Climb Speed', 'Fly Speed', 'Swim Speed', 'Dash', 'Disengage', 'Dodge', 'Hide',
	'Cone', 'Cube', 'Cylinder', 'Emanation', 'Line', 'Sphere',
]);

/** Other ways a 2024 stat block writes a glossary entry: labels ("AC", "Immunities") and speeds ("Fly 60 ft."). */
const ALIASES_2024: Record<string, string[]> = {
	'Armor Class': ['AC'],
	'Hit Points': ['HP'],
	'Challenge Rating': ['CR'],
	'Proficiency': ['PB', 'Proficiency Bonus'],
	'Skill': ['Skills'],
	'Saving Throw': ['Saving Throws', 'Saves'],
	'Resistance': ['Resistances'],
	'Vulnerability': ['Vulnerabilities'],
	'Immunity': ['Immunities'],
	'Action': ['Actions'],
	'Bonus Action': ['Bonus Actions'],
	'Reaction': ['Reactions'],
	'Opportunity Attacks': ['Opportunity Attack'],
	'Fly Speed': ['Fly'],
	'Swim Speed': ['Swim'],
	'Climb Speed': ['Climb'],
	'Burrow Speed': ['Burrow'],
	'Cover': ['Half Cover', 'Three-Quarters Cover', 'Total Cover'],
	'Telepathy': ['telepathy'],
	'Experience Points': ['XP'],
};

const SENSES = new Set(['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight', 'Passive Perception']);

/** 2014's rules sections a stat block or text names, and how. */
const RULES_2014: Record<string, { names?: string[]; prose?: boolean; tag?: string }> = {
	'Hit Points': { names: ['HP'] },
	'Initiative': {},
	'Speed': {},
	'Skills': {},
	'Saving Throws': { names: ['Saving Throw', 'saving throw', 'saving throws', 'Saves'], prose: true },
	'Proficiency Bonus': { names: ['PB'] },
	'Difficult Terrain': { names: ['difficult terrain'], prose: true },
	'Cover': { names: ['half cover', 'three-quarters cover', 'total cover'], prose: true },
	'Damage Resistance and Vulnerability': { names: ['Damage Resistances', 'Damage Vulnerabilities', 'resistance', 'vulnerability'], prose: true },
	'Advantage and Disadvantage': { names: ['advantage', 'disadvantage'], prose: true },
	'Temporary Hit Points': { names: ['temporary hit points'], prose: true },
	'Surprise': {},
	'Opportunity Attacks': { names: ['opportunity attack'], prose: true },
	'Passive Checks': { names: ['Passive Perception', 'passive Perception'], tag: 'Sense' },
	'Resting': {},
	'Short Rest': { names: ['short rest'], prose: true },
	'Long Rest': { names: ['long rest'], prose: true },
	'Dropping to 0 Hit Points': {},
	'Death Saving Throws': { names: ['death saving throw', 'death saving throws'], prose: true },
	'Concentration': { names: ['concentration'], prose: true },
};

const cache = new Map<string, RuleTerm[]>();

export function ruleTerms5e(edition: Dnd5eEdition): RuleTerm[] {
	const key = `${edition}:${contentVersion5e()}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const terms = build(edition);
	cache.set(key, terms);
	return terms;
}

function build(edition: Dnd5eEdition): RuleTerm[] {
	const c = compendium5e(edition);
	const out: RuleTerm[] = [];
	const seen = new Set<string>();
	const add = (t: RuleTerm) => {
		const k = t.name.toLowerCase();
		if (seen.has(k)) return;
		seen.add(k);
		out.push(t);
	};

	for (const cond of conditionsFor(edition)) {
		add({
			id: `condition:${cond.name.toLowerCase()}`, name: cond.name, tag: 'Condition', text: cond.description, prose: true,
			// 2014 text writes them in lower case ("knocked prone").
			names: edition === '2014' ? [cond.name.toLowerCase()] : [],
		});
	}

	if (edition === '2024') {
		for (const r of c.rules) {
			if (r.topic !== 'Rules Glossary' || r.tag === 'Condition') continue;
			const tag = SENSES.has(r.name) ? 'Sense' : r.tag ?? 'Rule';
			add({
				id: `rule:${r.name.toLowerCase()}`, name: r.name, tag, text: r.desc,
				names: ALIASES_2024[r.name],
				prose: PROSE_2024.has(r.name) || r.tag === 'Hazard',
			});
		}
	} else {
		const byName = new Map(c.rules.map(r => [r.name, r]));
		for (const [name, how] of Object.entries(RULES_2014)) {
			const r = byName.get(name);
			if (!r) continue;
			const display = name === 'Passive Checks' ? 'Passive Perception' : name;
			add({ id: `rule:${name.toLowerCase()}`, name: display, names: how.names, tag: how.tag ?? 'Rule', text: r.desc, prose: how.prose });
		}
		for (const sense of sensesOf2014(byName.get('Vision and Light'))) add(sense);
	}

	for (const a of c.abilities ?? []) {
		const short = a.abbr.charAt(0) + a.abbr.slice(1).toLowerCase();
		add({ id: `ability:${a.abbr.toLowerCase()}`, name: a.name, names: [a.abbr, short], tag: 'Ability', text: abilityText(a) });
	}
	for (const k of c.skills ?? []) add({ id: `skill:${k.name.toLowerCase()}`, name: k.name, tag: 'Skill', text: skillText(k, c), prose: true });
	for (const l of c.languages ?? []) add({ id: `language:${l.name.toLowerCase()}`, name: l.name, tag: 'Language', text: languageText(l) });
	return out;
}

/** SRD 5.1 keeps blindsight, darkvision and truesight as "#### Name" parts of Vision and Light. */
function sensesOf2014(rule: Rule5e | undefined): RuleTerm[] {
	if (!rule) return [];
	const out: RuleTerm[] = [];
	const parts = rule.desc.split(/^#### /m).slice(1);
	for (const part of parts) {
		const [title, ...rest] = part.split('\n');
		const name = title.trim();
		const text = rest.join('\n').trim();
		if (!name || !text) continue;
		out.push({ id: `rule:vision and light:${name.toLowerCase()}`, name, names: [name.toLowerCase()], tag: 'Sense', text, prose: true });
	}
	return out;
}

/** The compendium page a term opens: its condition, or the rule it's from (2014 senses: Vision and Light). */
export function termPage5e(edition: Dnd5eEdition, term: RuleTerm): Hit5e | undefined {
	if (term.id.startsWith('condition:')) return findHit(edition, term.name, 'condition');
	const [, rule] = term.id.startsWith('rule:') ? term.id.split(':') : [];
	// findHit falls back to the other edition; a term only opens its own edition's page.
	const own = (name: string) => { const h = findHit(edition, name, 'rule'); return h?.edition === edition ? h : undefined; };
	return own(term.name) ?? (rule ? own(rule) : undefined);
}
