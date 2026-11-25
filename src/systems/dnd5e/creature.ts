// A 5e monster in neutral terms (core/import/creature.ts), for converting it
// to another game: its CR, HP and AC, speeds in feet, how many attacks it
// makes (from Multiattack), each attack's average, dice, reach or range, or
// its saving throw, and everything else as text.
// Pure: no Obsidian imports.

import { fraction, NeutralAttack, NeutralCreature } from '../../core/import/creature';
import { parseStatblock5e } from './parser';
import type { Dnd5eMonster, Feature5e } from './types';

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const ABILITY: Record<string, string> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

/** A monster entry's value (fields, or a ```5e block's text) as the 5e monster. */
function monsterOf(v: Record<string, unknown>): Dnd5eMonster | null {
	if (typeof v.statblock === 'string') return parseStatblock5e(v.statblock);
	if (typeof v.name !== 'string') return null;
	return { abilities: [10, 10, 10, 10, 10, 10], ac: 10, hp: 1, cr: '0', ...v } as unknown as Dnd5eMonster;
}

function speeds(s: string | undefined): NeutralCreature['speed'] {
	if (!s) return undefined;
	const out: NonNullable<NeutralCreature['speed']> = {};
	const walk = /^\s*(\d+)\s*ft/i.exec(s);
	if (walk) out.walk = Number(walk[1]);
	for (const k of ['fly', 'swim', 'climb', 'burrow'] as const) { const m = new RegExp(`${k}\\s+(\\d+)`, 'i').exec(s); if (m) out[k] = Number(m[1]); }
	if (/hover/i.test(s)) out.hover = true;
	return out;
}

/** One action as an attack, when it is one: an attack roll with a hit, or a saving throw with damage. */
export function attackOf(f: Feature5e): NeutralAttack | null {
	const d = f.desc;
	const uses = /\(([^)]*(?:recharge|\/day)[^)]*)\)/i.exec(f.name)?.[1];
	const name = f.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
	const hit = /(?:Hit|Failure):\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+)?\s*damage/i.exec(d);
	const isAttack = /attack roll|weapon attack|spell attack|to hit/i.test(d);
	const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)/i.exec(d) ?? /DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(d);
	if (!hit || (!isAttack && !save)) return null;
	const reach = /reach\s+(\d+)\s*ft/i.exec(d);
	const range = /range\s+(\d+)(?:\/\d+)?\s*ft/i.exec(d);
	const area = /(\d+-foot[- ](?:cone|line|cube|sphere|emanation|radius|cylinder)(?:[^.,;]*)?)/i.exec(d)?.[1];
	// What the hit does besides its damage: the sentences after the damage one.
	const after = d.slice((hit.index ?? 0) + hit[0].length).replace(/^[^.]*\.\s*/, '').trim();
	const out: NeutralAttack = { name, avg: Number(hit[1]), dice: hit[2].trim(), ...(hit[3] ? { damageType: hit[3].toLowerCase() } : {}) };
	if (reach) out.reach = Number(reach[1]);
	if (range) out.range = Number(range[1]);
	if (area) out.area = area;
	if (save && !isAttack) {
		const [ab, dc] = /^\d+$/.test(save[1]) ? [save[2], save[1]] : [save[1], save[2]];
		out.save = { ability: ABILITY[ab.toLowerCase()] ?? ab.slice(0, 3).toLowerCase(), dc: Number(dc) };
	}
	if (after) out.rider = after;
	if (uses) out.uses = uses;
	return out;
}

export function creatureOut5e(v: Record<string, unknown>): NeutralCreature | null {
	const m = monsterOf(v);
	if (!m) return null;
	const actions = m.actions ?? [];
	const multi = actions.find(a => /^multiattack/i.test(a.name));
	const attacks = actions.map(attackOf).filter((a): a is NeutralAttack => !!a);
	let perTurn = 1;
	if (multi) {
		const counted = [...multi.desc.matchAll(/\b(one|two|three|four|five|six|\d)\b\s+(?:[A-Z][\w' -]*?\s+)?attacks?/gi)].map(x => WORDS[x[1].toLowerCase()] ?? Number(x[1]));
		perTurn = Math.max(1, counted.reduce((a, b) => a + b, 0) || 2);
	}
	const abilities: NeutralCreature['abilities'] = [
		...(m.traits ?? []).map(f => ({ name: f.name, text: f.desc, when: 'trait' as const })),
		...actions.filter(a => a !== multi && !attackOf(a)).map(f => ({ name: f.name, text: f.desc, when: 'action' as const })),
		...(m.bonusActions ?? []).map(f => ({ name: f.name, text: f.desc, when: 'bonus' as const })),
		...(m.reactions ?? []).map(f => ({ name: f.name, text: f.desc, when: 'reaction' as const })),
		...(m.legendaryActions ?? []).map(f => ({ name: f.name, text: f.desc, when: 'legendary' as const })),
	];
	const solo = !!m.legendaryActions?.length || (m.traits ?? []).some(t => /legendary resistance/i.test(t.name));
	return {
		name: m.name,
		size: m.size,
		type: m.type,
		power: { cr: fraction(m.cr) ?? 0, solo },
		hp: m.hp,
		ac: m.ac,
		speed: speeds(m.speed),
		attacksPerTurn: Math.min(3, perTurn),
		attacks,
		abilities,
		goodSaves: Object.keys(m.saves ?? {}),
		resist: m.resistances, immune: [...(m.immunities ?? []), ...(m.conditionImmunities ?? [])], vuln: m.vulnerabilities,
		senses: m.senses, languages: m.languages,
		flavor: m.description,
	};
}
