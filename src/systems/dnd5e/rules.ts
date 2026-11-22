// 5e rules used by stat blocks, the encounter rating and the tracker.
// Pure functions only (no Obsidian imports), so every rule here is unit-tested.

import type { Dnd5eEdition } from './editions';
import { ABILITIES, AbilityKey, Dnd5eMonster } from './types';

export function abilityMod(score: number): number {
	return Math.floor((score - 10) / 2);
}

/** +2, −1, +0 (a real minus sign, as the books print it). */
export function formatMod(n: number): string {
	return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

export function scoreOf(m: Dnd5eMonster, a: AbilityKey): number {
	return m.abilities[ABILITIES.indexOf(a)] ?? 10;
}

/** A save: the listed bonus, else the ability modifier. */
export function saveOf(m: Dnd5eMonster, a: AbilityKey): number {
	return m.saves?.[a] ?? abilityMod(scoreOf(m, a));
}

/** Initiative: the listed bonus, else the Dexterity modifier. */
export function initiativeOf(m: Dnd5eMonster): number {
	return m.initiative ?? abilityMod(scoreOf(m, 'dex'));
}

/** "1/4" → 0.25, "10" → 10; anything else → undefined. */
export function crValue(cr: string | number | undefined): number | undefined {
	if (cr === undefined) return undefined;
	const s = String(cr).trim();
	const frac = /^1\s*\/\s*(2|4|8)$/.exec(s);
	if (frac) return 1 / Number(frac[1]);
	const n = Number(s);
	return Number.isFinite(n) && n >= 0 && s !== '' ? n : undefined;
}

/** 0.25 → "1/4". */
export function crLabel(cr: number): string {
	return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
}

const XP_BY_CR: Record<string, number> = {
	'0': 10, '0.125': 25, '0.25': 50, '0.5': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900,
	'9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000,
	'19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000,
	'29': 135000, '30': 155000,
};

/** XP for a challenge rating (the monster's own XP wins when it's written down). */
export function xpForCr(cr: string | number | undefined): number {
	const v = crValue(cr);
	return v === undefined ? 0 : XP_BY_CR[String(v)] ?? 0;
}

export function xpOf(m: Dnd5eMonster): number {
	return m.xp ?? xpForCr(m.cr);
}

/** Proficiency bonus by challenge rating. */
export function pbForCr(cr: string | number | undefined): number {
	const v = crValue(cr) ?? 0;
	return v < 5 ? 2 : Math.min(9, 2 + Math.ceil((v - 4) / 4));
}

// ----------------------------------------------------------------------------
// Encounter difficulty

/** 2014: XP thresholds per character (Easy, Medium, Hard, Deadly), levels 1–20. */
const THRESHOLDS_2014: [number, number, number, number][] = [
	[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
	[300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
	[800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
	[1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];

/** 2024: XP budget per character (Low, Moderate, High), levels 1–20. */
const BUDGET_2024: [number, number, number][] = [
	[50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
	[600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
	[1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
	[3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

/** 2014 encounter multipliers by number of monsters, one step per row. */
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
function multiplierStep(count: number): number {
	return count <= 0 ? 1 : count === 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
}

/** 2014 multiplier for a fight: fewer than 3 heroes shift it up a step, 6 or more down a step. */
export function encounterMultiplier(monsterCount: number, partySize: number): number {
	let step = multiplierStep(monsterCount);
	if (partySize < 3) step++;
	else if (partySize >= 6) step--;
	return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, step))];
}

const clampLevel = (l: number) => Math.max(1, Math.min(20, Math.floor(l) || 1));

export type Difficulty2014 = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly';
/** Below the Low budget is 'Trivial'; the book's three are Low, Moderate and High (pct > 1 is past High). */
export type Difficulty2024 = 'Trivial' | 'Low' | 'Moderate' | 'High';

export interface Rating5e {
	edition: Dnd5eEdition;
	/** The monsters' XP, added up. */
	xp: number;
	/** 2014: XP × the multiplier, the number compared to the thresholds. 2024: the same as xp. */
	adjusted: number;
	multiplier: number;
	label: Difficulty2014 | Difficulty2024;
	/** The party's thresholds, in order (2014: Easy…Deadly; 2024: Low…High). */
	thresholds: { label: string; xp: number }[];
	/** Where `adjusted` sits against the top threshold (1 = the top, Deadly or High). */
	pct: number;
}

/** Rate a fight: monsters (each with how many) against the heroes' levels. */
export function rateEncounter5e(groups: { monster: Dnd5eMonster; count: number }[], partyLevels: number[], edition: Dnd5eEdition): Rating5e {
	const levels = partyLevels.length ? partyLevels.map(clampLevel) : [1];
	const xp = groups.reduce((sum, g) => sum + xpOf(g.monster) * Math.max(0, g.count), 0);
	const count = groups.reduce((n, g) => n + Math.max(0, g.count), 0);
	if (edition === '2014') {
		const multiplier = encounterMultiplier(count, levels.length);
		const adjusted = Math.round(xp * multiplier);
		const sum = (i: number) => levels.reduce((s, l) => s + THRESHOLDS_2014[l - 1][i], 0);
		const thresholds = (['Easy', 'Medium', 'Hard', 'Deadly'] as const).map((label, i) => ({ label, xp: sum(i) }));
		let label: Difficulty2014 = 'Trivial';
		for (const t of thresholds) if (adjusted >= t.xp) label = t.label;
		return { edition, xp, adjusted, multiplier, label, thresholds, pct: thresholds[3].xp ? adjusted / thresholds[3].xp : 0 };
	}
	const sum = (i: number) => levels.reduce((s, l) => s + BUDGET_2024[l - 1][i], 0);
	const thresholds = (['Low', 'Moderate', 'High'] as const).map((label, i) => ({ label, xp: sum(i) }));
	let label: Difficulty2024 = 'Trivial';
	for (const t of thresholds) if (xp >= t.xp) label = t.label;
	return { edition, xp, adjusted: xp, multiplier: 1, label, thresholds, pct: thresholds[2].xp ? xp / thresholds[2].xp : 0 };
}
