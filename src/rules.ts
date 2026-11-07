// Nimble 3.2 rules used by the tracker and builder. Pure functions only (no
// Obsidian imports), so every rule here is unit-tested.

import { AppliedCondition, ArmorType, MonsterRole, NimbleMonster } from './types';

// ----------------------------------------------------------------------------
// Monster facts
// ----------------------------------------------------------------------------

export function monsterRole(m: NimbleMonster): MonsterRole {
	if (m.role) return m.role;
	if (m.monsterType === 'solo') return 'legendary';
	return 'regular';
}

/** "1/2" → 0.5, "3" → 3, "3x" → 3, "" or "min" → null. */
export function levelValue(level: number | string | undefined): number | null {
	if (level === undefined || level === null) return null;
	if (typeof level === 'number') return Number.isFinite(level) ? level : null;
	const s = level.trim();
	const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
	if (frac) return Number(frac[1]) / Number(frac[2]);
	const n = s.match(/^\d+(\.\d+)?/);
	return n ? Number(n[0]) : null;
}

export function formatLevel(level: number | string | undefined): string {
	if (level === undefined || level === null || level === '') return '';
	if (typeof level === 'string') return level;
	const fractions: [number, string][] = [[1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4']];
	for (const [v, s] of fractions) if (Math.abs(level - v) < 0.01) return s;
	return String(level);
}

/** Saves as one string: new `saves` field, or the legacy str/dex/will fields. */
export function monsterSaves(m: NimbleMonster): string | undefined {
	if (m.saves?.trim()) return m.saves.trim().replace(/\s+/g, ' ');
	const parts: string[] = [];
	if (m.str) parts.push(`STR${m.str}`);
	if (m.dex) parts.push(`DEX${m.dex}`);
	if (m.will) parts.push(`WIL${m.will}`);
	return parts.length ? parts.join(' ') : undefined;
}

/** HP for a party of `partySize`, honouring per-hero HP. */
export function scaledHp(m: NimbleMonster, partySize: number): number {
	if (m.hpPerHero && m.hpPerHero > 0) return m.hpPerHero * Math.max(1, partySize);
	return m.hp;
}

export function armorReduction(armor: ArmorType | undefined): number {
	if (armor === 'medium') return 10;
	if (armor === 'heavy') return 20;
	return 0;
}

export function armorLabel(armor: ArmorType | undefined): string {
	return armor === 'medium' ? 'Medium armor' : armor === 'heavy' ? 'Heavy armor' : 'No armor';
}

/** Die size a minion attacks with: explicit, or the first die in its actions. */
export function minionDie(m: NimbleMonster): number {
	if (m.minionDie && m.minionDie > 0) return m.minionDie;
	const text = (m.attacks || []).map(a => a.raw).join(' ');
	const d = text.match(/\b\d*d(\d+)\b/);
	return d ? Number(d[1]) : 6;
}

// ----------------------------------------------------------------------------
// HP entry: "7" damage, "7!" crit damage, "+7" heal, "=20" set, "t5" temp HP
// ----------------------------------------------------------------------------

export type HpCommand =
	| { kind: 'damage'; amount: number; crit: boolean; type?: DamageMod }
	| { kind: 'heal'; amount: number }
	| { kind: 'set'; amount: number }
	| { kind: 'temp'; amount: number };

/** v = the attack's damage type is one this creature is vulnerable to; r = resisted. */
export type DamageMod = 'vulnerable' | 'resisted';

export function parseHpCommand(input: string): HpCommand | null {
	let s = input.trim().replace(/−/g, '-').toLowerCase();
	if (!s) return null;
	let crit = false;
	let type: DamageMod | undefined;
	if (s.startsWith('!')) { crit = true; s = s.slice(1).trim(); }
	// suffixes in any order: ! (crit), v (vulnerable), r (resisted)
	for (;;) {
		const last = s.slice(-1);
		if (last === '!') { crit = true; s = s.slice(0, -1).trim(); continue; }
		if (last === 'v' && /\d\s*v$/.test(s)) { type = 'vulnerable'; s = s.slice(0, -1).trim(); continue; }
		if (last === 'r' && /\d\s*r$/.test(s)) { type = 'resisted'; s = s.slice(0, -1).trim(); continue; }
		break;
	}
	const temp = s.match(/^t\s*(\d+)$/);
	if (temp) return { kind: 'temp', amount: Number(temp[1]) };
	const m = s.match(/^([+\-=]?)\s*(\d+)$/);
	if (!m) return null;
	const amount = Number(m[2]);
	if (m[1] === '+') return { kind: 'heal', amount };
	if (m[1] === '=') return { kind: 'set', amount };
	return { kind: 'damage', amount, crit, type };
}

export interface DamageResult {
	/** Damage actually taken after armor and resistances. */
	applied: number;
	/** Human-readable working, e.g. "15 − 10 (Medium armor) = 5". */
	breakdown: string;
}

/** Damage a monster takes from one attack (Nimble 3.2: armor −10/−20, crits ignore it; vulnerable +10, resistant −10). */
export function monsterDamage(armor: ArmorType | undefined, amount: number, crit: boolean, opts: { autoArmor: boolean; mod?: DamageMod }): DamageResult {
	const parts: string[] = [String(amount)];
	let dmg = amount;
	const reduce = opts.autoArmor ? armorReduction(armor) : 0;
	if (reduce) {
		if (crit) parts.push('(crit ignores armor)');
		else { dmg -= reduce; parts.push(`− ${reduce} (${armorLabel(armor)})`); }
	}
	if (opts.mod === 'vulnerable') { dmg += 10; parts.push('+ 10 (vulnerable)'); }
	if (opts.mod === 'resisted') { dmg -= 10; parts.push('− 10 (resistant)'); }
	dmg = Math.max(0, dmg);
	return { applied: dmg, breakdown: parts.length > 1 ? `${parts.join(' ')} = ${dmg}` : String(dmg) };
}

export interface HeroDamageResult {
	hp: number;
	wounds: number;
	/** What happened, for the log: "drops to 0 HP: Dying, 1 Wound". */
	events: string[];
}

/** Nimble heroes: at 0 HP gain 1 Wound and become Dying; damage while Dying adds 2 Wounds (3 on a crit). */
export function heroDamage(hp: number, wounds: number, maxWounds: number, amount: number, crit: boolean): HeroDamageResult {
	const events: string[] = [];
	if (amount <= 0) return { hp, wounds, events };
	if (hp <= 0) {
		const w = crit ? 3 : 2;
		wounds = Math.min(maxWounds, wounds + w);
		events.push(`hit while Dying: +${w} Wounds (${wounds}/${maxWounds})`);
	} else {
		hp = Math.max(0, hp - amount);
		if (hp === 0) {
			wounds = Math.min(maxWounds, wounds + 1);
			events.push(`drops to 0 HP: Dying, ${wounds} Wound${wounds === 1 ? '' : 's'}`);
		}
	}
	if (wounds >= maxWounds) events.push('has taken their last Wound and dies');
	return { hp, wounds, events };
}

/** Minions die to any damage; with overkill, each full die-size of damage drops another. */
export function minionKills(amount: number, die: number, overkill: boolean): number {
	if (amount <= 0) return 0;
	if (!overkill || die <= 0) return 1;
	return Math.max(1, Math.floor(amount / die));
}

export interface GroupAttackResult {
	dice: number[];
	total: number;
	misses: number;
}

/** Minions attacking one target roll together: one die each, 1s miss, no crits. */
export function groupAttack(count: number, die: number, rng: () => number = Math.random): GroupAttackResult {
	const dice = Array.from({ length: Math.max(0, count) }, () => 1 + Math.floor(rng() * die));
	const hits = dice.filter(d => d > 1);
	return { dice, total: hits.reduce((a, b) => a + b, 0), misses: dice.length - hits.length };
}

// ----------------------------------------------------------------------------
// Legendary phases
// ----------------------------------------------------------------------------

export type LastStandEffect =
	| { kind: 'regain'; hp: number }
	| { kind: 'pool'; hp: number; armor?: ArmorType };

/** Reads a Last Stand's text for an HP effect the tracker can apply. */
export function lastStandEffect(text: string | undefined, partySize: number): LastStandEffect | null {
	if (!text) return null;
	const perHero = text.match(/regains?\s+(\d+)\s*HP\s*(?:per|\/)\s*hero/i);
	if (perHero) return { kind: 'regain', hp: Number(perHero[1]) * Math.max(1, partySize) };
	const flat = text.match(/regains?\s+(\d+)\s*HP\b/i);
	if (flat) return { kind: 'regain', hp: Number(flat[1]) };
	const pool = text.match(/(\d+)\s+more\s+damage/i);
	if (pool) {
		const armor = text.match(/\b(Medium|Heavy)\s+armor/i);
		return { kind: 'pool', hp: Number(pool[1]), armor: armor ? (armor[1].toLowerCase() as ArmorType) : undefined };
	}
	return null;
}

// ----------------------------------------------------------------------------
// Conditions
// ----------------------------------------------------------------------------

/** End of a combatant's turn (or the round, if it never marked a turn): count durations down. */
export function tickConditions(conditions: AppliedCondition[], round: number): { kept: AppliedCondition[]; expired: string[] } {
	const kept: AppliedCondition[] = [];
	const expired: string[] = [];
	for (const c of conditions) {
		if (c.rounds === undefined || c.tickedRound === round) { kept.push(c); continue; }
		const left = c.rounds - 1;
		if (left <= 0) expired.push(c.name);
		else kept.push({ ...c, rounds: left, tickedRound: round });
	}
	return { kept, expired };
}

export function conditionLabel(c: AppliedCondition): string {
	return c.value !== undefined ? `${c.name} ${c.value}` : c.name;
}

// ----------------------------------------------------------------------------
// Initiative and encounter difficulty (GM Guide: Combat Encounter Guidelines)
// ----------------------------------------------------------------------------

/** d20 + DEX: single digits start with 1 action, double digits 2, 20+ or a natural 20 all 3. */
export function initiativeActions(total: number, natural20 = false): 1 | 2 | 3 {
	if (natural20 || total >= 20) return 3;
	if (total >= 10) return 2;
	return 1;
}

export type DifficultyLabel = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly' | 'Very Deadly';

/** Monster levels a group is worth against a party. */
export function monsterValue(m: NimbleMonster, count: number, partyLevel: number, partySize: number): number {
	const role = monsterRole(m);
	const lvl = levelValue(m.level) ?? 0;
	// 2 minions per hero count as 1 monster of hero level → each minion is worth half the party's level.
	if (role === 'minion') return count * partyLevel / 2;
	// Legendary monsters are built to take on the whole party.
	if (role === 'legendary') return lvl * Math.max(1, partySize) * count;
	return lvl * count;
}

const budgetShare = (value: number, budget: number) => (budget > 0 ? value / budget : 0);

export function difficulty(value: number, budget: number): { label: DifficultyLabel; pct: number } {
	const pct = budget > 0 ? value / budget : 0;
	const label: DifficultyLabel = pct < 0.3 ? 'Trivial' : pct < 0.625 ? 'Easy' : pct < 0.875 ? 'Medium' : pct < 1.125 ? 'Hard' : pct < 1.375 ? 'Deadly' : 'Very Deadly';
	return { label, pct };
}

export interface EncounterRating {
	budget: number;
	value: number;
	pct: number;
	label: DifficultyLabel;
	warnings: string[];
}

/** "a 6-level budget", "an 8-level budget": the article that reads right before a number. */
export function budgetPhrase(budget: number): string {
	const n = String(Math.round(budget));
	const an = /^8/.test(n) || /^1[18](\d{3})*$/.test(n);
	return `${an ? 'an' : 'a'} ${budget}-level budget`;
}

/** Rate a list of monsters against party levels (one entry per hero). */
export function rateEncounter(groups: { monster: NimbleMonster; count: number }[], partyLevels: number[]): EncounterRating {
	const heroes = partyLevels.length || 1;
	const budget = partyLevels.reduce((a, b) => a + b, 0);
	const avg = partyLevels.length ? budget / heroes : 1;
	let value = 0;
	let nonMinions = 0;
	let hasLegendary = false;
	const warnings: string[] = [];
	for (const { monster, count } of groups) {
		if (count <= 0) continue;
		value += monsterValue(monster, count, avg, heroes);
		const role = monsterRole(monster);
		if (role === 'legendary') hasLegendary = true;
		if (role !== 'minion') nonMinions += count;
		if (monster.armor === 'medium' && avg < 3) warnings.push(`${monster.name} has Medium armor; the GM Guide holds armor back until level 3.`);
		if (monster.armor === 'heavy' && avg < 8) warnings.push(`${monster.name} has Heavy armor; the GM Guide holds it back until level 8.`);
	}
	if (!hasLegendary && nonMinions && nonMinions / heroes > 3) {
		warnings.push(`${nonMinions} monsters for ${heroes} heroes: more than 3 per hero can swamp the party with attacks, whatever the budget says. Consider minions instead.`);
	} else if (!hasLegendary && nonMinions && nonMinions < heroes && budgetShare(value, budget) >= 0.75) {
		warnings.push(`Only ${nonMinions} monster${nonMinions === 1 ? '' : 's'} against ${heroes} heroes: few, strong monsters get focused down fast. The GM Guide suggests 1–3 per hero, or a legendary monster.`);
	}
	const { label, pct } = difficulty(value, budget);
	if (pct > 1.5) warnings.push('Over 150% of the budget: past Very Deadly.');
	return { budget, value, pct, label, warnings };
}

// ----------------------------------------------------------------------------
// Balancing: the smallest edits that bring an encounter to a target difficulty
// ----------------------------------------------------------------------------

export type BalanceTarget = 'Easy' | 'Medium' | 'Hard' | 'Deadly';
/** Budget share at the middle of each band. */
export const BALANCE_TARGETS: Record<BalanceTarget, number> = { Easy: 0.5, Medium: 0.75, Hard: 1, Deadly: 1.25 };

export interface BalanceGroup {
	name: string;
	monster: NimbleMonster;
	count: number;
}

export interface BalanceChange {
	name: string;
	from: number;
	to: number;
}

export interface BalanceSuggestion {
	changes: BalanceChange[];
	counts: { name: string; count: number }[];
	rating: EncounterRating;
}

/** "Remove 3 Goblin Minions", "Add 1 Wolf", "Goblin 2 → 4". */
/** English plural for a monster name's last word: Wolf → Wolves, Harpy → Harpies. */
export function pluralName(name: string): string {
	const m = name.match(/^(.*?)(\w+)(\s*\(.*\))?$/);
	if (!m) return `${name}s`;
	const [, head, word, tail = ''] = m;
	const lower = word.toLowerCase();
	let out: string;
	if (/(?:wolf|elf|dwarf|thief|half)$/.test(lower)) out = word.replace(/f$/i, 'ves');
	else if (/[^aeiou]y$/.test(lower)) out = word.slice(0, -1) + 'ies';
	else if (/(?:s|x|z|ch|sh)$/.test(lower)) out = word + 'es';
	else if (/(?:man)$/.test(lower)) out = word.slice(0, -3) + 'men';
	else out = word + 's';
	return head + out + tail;
}

export function describeChange(c: BalanceChange): string {
	const plural = (n: number, name: string) => `${n} ${n === 1 ? name : pluralName(name)}`;
	if (c.from === 0) return `Add ${plural(c.to, c.name)}`;
	if (c.to === 0) return `Remove ${c.from === 1 ? 'the' : 'all'} ${c.from === 1 ? c.name : plural(c.from, c.name)}`;
	return c.to > c.from ? `Add ${plural(c.to - c.from, c.name)}` : `Remove ${plural(c.from - c.to, c.name)}`;
}

/**
 * Suggest small edits (counts of the monsters already there, plus optional
 * extras like a matching minion type) that land the encounter in the target
 * band. Legendary monsters are kept: they're usually the point of the fight.
 * Returns [] when the encounter is already on target.
 */
export function balanceEncounter(groups: BalanceGroup[], partyLevels: number[], target: BalanceTarget, extras: BalanceGroup[] = [], limit = 3): BalanceSuggestion[] {
	const heroes = Math.max(1, partyLevels.length);
	const current = rateEncounter(groups, partyLevels);
	if (current.label === target) return [];
	const goal = BALANCE_TARGETS[target];

	const all = [...groups, ...extras.filter(x => !groups.some(g => g.name === x.name)).map(x => ({ ...x, count: 0 }))];
	const ranges = all.map(g => {
		const role = monsterRole(g.monster);
		if (role === 'legendary') return [g.count];
		const span = role === 'minion' ? Math.max(6, heroes * 2) : 3;
		const out: number[] = [];
		for (let n = Math.max(0, g.count - span); n <= g.count + span; n++) out.push(n);
		return out;
	});

	// Keep the search bounded: big encounters only vary the first few groups.
	let combos = ranges.reduce((a, r) => a * r.length, 1);
	for (let i = ranges.length - 1; combos > 150_000 && i >= 0; i--) {
		combos /= ranges[i].length;
		ranges[i] = [all[i].count];
	}

	const scored: { s: BalanceSuggestion; score: number }[] = [];
	const counts = new Array<number>(all.length).fill(0);
	const visit = (i: number) => {
		if (i === all.length) {
			if (counts.every(c => c === 0)) return;
			const changes: BalanceChange[] = [];
			all.forEach((g, k) => { if (counts[k] !== g.count) changes.push({ name: g.name, from: g.count, to: counts[k] }); });
			if (!changes.length) return;
			const rating = rateEncounter(all.map((g, k) => ({ monster: g.monster, count: counts[k] })), partyLevels);
			let score = Math.abs(rating.pct - goal) * 10;
			if (rating.label !== target) score += 4;
			score += changes.length * 0.6;
			score += changes.reduce((a, c) => a + Math.abs(c.to - c.from), 0) * 0.08;
			score += changes.filter(c => c.to === 0).length * 0.4;
			score += rating.warnings.filter(w => !/armor/i.test(w)).length * 1.5;
			scored.push({ score, s: { changes, counts: all.map((g, k) => ({ name: g.name, count: counts[k] })).filter(x => x.count > 0), rating } });
			return;
		}
		for (const n of ranges[i]) { counts[i] = n; visit(i + 1); }
	};
	visit(0);

	scored.sort((a, b) => a.score - b.score);
	const out: BalanceSuggestion[] = [];
	const seen = new Set<string>();
	for (const { s } of scored) {
		if (s.rating.label !== target) continue;
		const key = s.changes.map(c => c.name).sort().join('|');
		if (seen.has(key)) continue; // one suggestion per set of monsters touched
		seen.add(key);
		out.push(s);
		if (out.length >= limit) break;
	}
	return out;
}

// ----------------------------------------------------------------------------
// Tougher / weaker monsters: shift a stat block up or down a level.

const LEVEL_LADDER = [1 / 8, 1 / 4, 1 / 3, 1 / 2, ...Array.from({ length: 30 }, (_, i) => i + 1)];

/** The level `shift` steps away on Nimble's ladder (… 1/3, 1/2, 1, 2, 3 …). */
export function shiftLevel(level: number, shift: number): number {
	let i = 0;
	for (let k = 0; k < LEVEL_LADDER.length; k++) if (Math.abs(LEVEL_LADDER[k] - level) < Math.abs(LEVEL_LADDER[i] - level)) i = k;
	return LEVEL_LADDER[Math.max(0, Math.min(LEVEL_LADDER.length - 1, i + shift))];
}

/** Rule of thumb per level: HP ×1.25 (or ÷1.25), and +2 (or −2) damage on every hit. */
export const SHIFT_HP = 1.25;
export const SHIFT_DAMAGE = 2;

export function shiftLabel(shift: number): string {
	return shift > 0 ? `+${shift}` : shift < 0 ? `−${Math.abs(shift)}` : '';
}

/**
 * A copy of `m` made `shift` levels tougher (positive) or weaker (negative).
 * Minions are unchanged (they're valued by the party's level, and die to any hit).
 */
export function shiftMonster(m: NimbleMonster, shift: number): NimbleMonster {
	if (!shift || monsterRole(m) === 'minion') return m;
	const lvl = levelValue(m.level);
	const k = Math.pow(SHIFT_HP, shift);
	const dmg = SHIFT_DAMAGE * shift;
	const note = {
		name: shift > 0 ? `Tougher (${shiftLabel(shift)} level${Math.abs(shift) > 1 ? 's' : ''})` : `Weaker (${shiftLabel(shift)} level${Math.abs(shift) > 1 ? 's' : ''})`,
		description: `${shift > 0 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}% HP and ${dmg > 0 ? '+' : '−'}${Math.abs(dmg)} damage on every hit (minimum 1).`,
	};
	return {
		...m,
		level: lvl === null ? m.level : formatLevel(shiftLevel(lvl, shift)),
		hp: Math.max(1, Math.round((m.hp || 0) * k)),
		hpPerHero: m.hpPerHero ? Math.max(1, Math.round(m.hpPerHero * k)) : m.hpPerHero,
		levelShift: (m.levelShift ?? 0) + shift,
		abilities: [note, ...(m.abilities ?? []).filter(a => !/^(Tougher|Weaker) \(/.test(a.name))],
	};
}
