// The builder's numbers: what a monster, spell or item of a given level or
// tier is expected to have, and the other way round, what level a set of stats
// plays like. From the GM Guide 3.0 (Monster Builder p.26-27, Legendary
// Monster Builder p.40, minions p.23), Core Rules 3.3 (spells p.44, items
// p.33-43) and the Creator's Kit (spell damage p.21). Pure, so it's tested
// against the bundled bestiary.

import { ArmorType } from './types';

// ----------------------------------------------------------------------------
// Dice

/** Nimble's d44, d66, d88: a tens die and a ones die (3 and 4 is 34). */
const TENS_ONES: Record<number, number> = { 44: 27.5, 66: 38.5, 88: 49.5 };

/** One die's average: d8 → 4.5, d44 → 27.5. */
export function dieAverage(sides: number): number {
	return TENS_ONES[sides] ?? (sides + 1) / 2;
}

const DICE_RE = /\b(?:(\d+)\s*)?d(\d+)(?:\s*([+\-−])\s*(\d+))?/i;

/** The average of the first dice expression in some text ("2d6+3" → 10, "d44+10" → 37.5), or a flat "20 damage". */
export function diceAverage(text: string | undefined): number | null {
	if (!text) return null;
	const m = DICE_RE.exec(text);
	if (m) {
		const count = m[1] ? parseInt(m[1], 10) : 1;
		const sides = parseInt(m[2], 10);
		if (!count || sides < 2) return null;
		const bonus = m[4] ? parseInt(m[4], 10) * (m[3] === '+' ? 1 : -1) : 0;
		return count * dieAverage(sides) + bonus;
	}
	const flat = text.match(/\b(\d+)\s+(?:\w+\s+)?damage\b/i);
	return flat ? parseInt(flat[1], 10) : null;
}

export interface Dice { count: number; sides: number; bonus: number }

export function formatDiceParts(d: Dice): string {
	const tens = TENS_ONES[d.sides] !== undefined;
	const base = tens && d.count === 1 ? `d${d.sides}` : `${d.count}d${d.sides}`;
	return d.bonus > 0 ? `${base}+${d.bonus}` : d.bonus < 0 ? `${base}−${-d.bonus}` : base;
}

export function parseDiceParts(text: string): Dice | null {
	const m = DICE_RE.exec(text);
	if (!m) return null;
	const count = m[1] ? parseInt(m[1], 10) : 1;
	const sides = parseInt(m[2], 10);
	if (!count || sides < 2) return null;
	return { count, sides, bonus: m[4] ? parseInt(m[4], 10) * (m[3] === '+' ? 1 : -1) : 0 };
}

export const DIE_SIZES = [4, 6, 8, 10, 12, 20] as const;

/**
 * Dice that average about `target`, the way the GM Guide writes them: one or
 * two dice of the monster's die size and a flat bonus (2d6+10, 1d8+20).
 * Small targets drop to a smaller die rather than a negative bonus.
 */
export function suggestDice(target: number, sides = 8): Dice {
	const t = Math.max(1, target);
	if (t < dieAverage(sides)) {
		const fit = [...DIE_SIZES].reverse().find(s => dieAverage(s) <= t + 0.5) ?? 4;
		return { count: 1, sides: fit, bonus: Math.max(0, Math.round(t - dieAverage(fit))) };
	}
	// Two dice once the dice alone are a small share of the damage; never more than the dice can carry.
	const count = t >= dieAverage(sides) * 6 ? 2 : 1;
	return { count, sides, bonus: Math.round(t - count * dieAverage(sides)) };
}

// ----------------------------------------------------------------------------
// Levels

/** Nimble's level ladder for monsters: 1/8, 1/4, 1/3, 1/2, then whole levels. */
export const LEVELS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export function snapLevel(raw: number): number {
	let best = LEVELS[0];
	for (const l of LEVELS) if (Math.abs(l - raw) < Math.abs(best - raw)) best = l;
	return best;
}

export function stepLevel(level: number, step: number): number {
	const i = LEVELS.findIndex(l => Math.abs(l - snapLevel(level)) < 1e-6);
	return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + step))];
}

/** "1/3", "1/2", "4". */
export function levelLabel(level: number): string {
	for (const [v, s] of [[1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2']] as const) if (Math.abs(level - v) < 0.01) return s;
	return String(Math.round(level));
}

// ----------------------------------------------------------------------------
// Regular monsters: GM Guide p.26-27

interface MonsterRow {
	level: number;
	/** HP unarmored, Medium, Heavy (null where the book has "—"). */
	hp: [number, number | null, number | null];
	/** Average damage per attack for a monster making 1, 2 or 3 attacks a turn. */
	dmg: [number, number | null, number | null];
	/** The book's sample dice for 1, 2 or 3 attacks. */
	dice: [string, string | null, string | null];
	dc: number;
}

const row = (level: number, hp: MonsterRow['hp'], dmg: MonsterRow['dmg'], dice: MonsterRow['dice'], dc: number): MonsterRow => ({ level, hp, dmg, dice, dc });

/** The Monster Builder table. 1/8 and 1/4 are Monsters & More's (Commoner, Noble). */
const MONSTER_TABLE: MonsterRow[] = [
	row(1 / 8, [8, null, null], [2.5, null, null], ['1d4', null, null], 10),
	row(1 / 4, [10, null, null], [2.5, null, null], ['1d4', null, null], 10),
	row(1 / 3, [10, null, null], [2.5, null, null], ['1d4', null, null], 10),
	row(1 / 2, [15, null, null], [4.5, null, null], ['1d8', null, null], 11),
	row(1, [21, 12, null], [7, null, null], ['2d6', null, null], 11),
	row(2, [31, 19, null], [10, 4, null], ['3d6', '1d6', null], 11),
	row(3, [41, 27, null], [14, 6, null], ['1d8+10', '1d10', null], 12),
	row(4, [52, 37, 24], [17, 8, null], ['2d6+10', '1d6+5', null], 12),
	row(5, [64, 49, 30], [20, 9, 5], ['1d10+15', '1d6+6', '1d8'], 13),
	row(6, [75, 60, 37], [24, 10, 6], ['1d8+20', '3d6', '1d10'], 13),
	row(7, [87, 72, 44], [27, 12, 7], ['1d12+20', '1d8+8', '1d12'], 13),
	row(8, [100, 84, 60], [30, 13, 7.5], ['2d8+20', '1d6+10', '2d6'], 13),
	row(9, [112, 95, 73], [33, 14, 8], ['1d6+30', '1d8+10', '1d6+5'], 14),
	row(10, [126, 107, 88], [37, 16, 9], ['2d6+30', '1d12+10', '2d8'], 14),
	row(11, [140, 121, 97], [40, 17, 10], ['2d8+30', '1d12+10', '1d10+5'], 14),
	row(12, [155, 135, 105], [43, 19, 11], ['2d12+30', '1d8+15', '1d20'], 15),
	row(13, [170, 150, 112], [46, 20, 12], ['1d20+35', '1d10+15', '1d8+8'], 15),
	row(14, [186, 165, 119], [49, 22, 13], ['1d20+40', '2d8+10', '1d6+10'], 15),
	row(15, [202, 180, 125], [52, 23, 13.5], ['2d10+40', '1d6+20', '1d6+10'], 15),
	row(16, [219, 196, 139], [55, 25, 14], ['1d10+50', '1d8+20', '1d8+10'], 16),
	row(17, [236, 212, 152], [58, 26, 15], ['2d8+50', '1d12+20', '1d10+10'], 16),
	row(18, [254, 230, 167], [61, 27, 16], ['2d10+50', '1d12+20', '1d10+10'], 16),
	row(19, [272, 247, 182], [64, 28, 17], ['1d8+60', '1d6+25', '1d12+10'], 17),
	row(20, [292, 266, 199], [68, 30, 18], ['2d10+60', '1d20+20', '1d12+12'], 18),
];
/** Per level past 20 (GM Guide): HP +20/+19/+16, damage +3/+2/+1 per attack. */
const PAST_20 = { hp: [20, 19, 16], dmg: [3, 2, 1] };

/** Below these levels the book doesn't recommend the armor (GM Guide p.23, 26). */
export const ARMOR_FROM: Record<Exclude<ArmorType, 'none'>, number> = { medium: 3, heavy: 8 };
export const LEGENDARY_ARMOR_FROM: Record<Exclude<ArmorType, 'none'>, number> = { medium: 4, heavy: 7 };

const armorCol = (a: ArmorType | undefined) => (a === 'medium' ? 1 : a === 'heavy' ? 2 : 0);

function tableRow(level: number): MonsterRow {
	const l = snapLevel(level);
	if (l > 20) {
		const top = MONSTER_TABLE[MONSTER_TABLE.length - 1];
		const n = l - 20;
		return {
			level: l,
			hp: top.hp.map((v, i) => (v ?? 0) + PAST_20.hp[i] * n) as MonsterRow['hp'],
			dmg: top.dmg.map((v, i) => (v ?? 0) + PAST_20.dmg[i] * n) as MonsterRow['dmg'],
			dice: [null, null, null] as unknown as MonsterRow['dice'],
			dc: Math.min(25, top.dc + Math.floor(n / 2)),
		};
	}
	return MONSTER_TABLE.find(r => Math.abs(r.level - l) < 1e-6) ?? MONSTER_TABLE[4];
}

/** Armored HP where the book has "—": the unarmored HP at the nearest ratio it does give (Medium about 0.57, Heavy about 0.46). */
function hpFor(r: MonsterRow, armor: ArmorType | undefined): number {
	const c = armorCol(armor);
	return r.hp[c] ?? Math.round(r.hp[0] * (c === 1 ? 0.57 : 0.46));
}

/** Damage per attack where the book has "—" for that many attacks: the one-attack damage shared out. */
function dmgFor(r: MonsterRow, attacks: number): number {
	const c = Math.max(1, Math.min(3, attacks)) - 1;
	return r.dmg[c] ?? Math.max(1, Math.round((r.dmg[0] / (c + 1)) * 2) / 2);
}

export interface RegularExpected {
	hp: number;
	/** Average damage of each attack. */
	perAttack: number;
	perRound: number;
	/** The book's sample dice, rebuilt in the monster's die size. */
	dice: Dice;
	bookDice?: string;
	dc: number;
	/** Fractional monsters can't crit (GM Guide p.26). */
	cantCrit: boolean;
	/** The armor is earlier than the book recommends. */
	armorEarly: boolean;
}

export function expectedRegular(level: number, armor: ArmorType = 'none', attacks = 1, sides = 8): RegularExpected {
	const r = tableRow(level);
	const perAttack = dmgFor(r, attacks);
	const book = r.dice[Math.max(1, Math.min(3, attacks)) - 1] ?? undefined;
	const bookParts = book ? parseDiceParts(book) : null;
	return {
		hp: hpFor(r, armor),
		perAttack,
		perRound: perAttack * Math.max(1, attacks),
		dice: bookParts && bookParts.sides === sides ? bookParts : suggestDice(perAttack, sides),
		bookDice: book,
		dc: r.dc,
		cantCrit: r.level < 1,
		armorEarly: armor !== 'none' && r.level < ARMOR_FROM[armor],
	};
}

// ----------------------------------------------------------------------------
// Legendary and solo monsters: GM Guide p.40

interface LegendaryRow { level: number; hp: [number, number | null, number | null]; last: [number, number | null, number | null]; dc: number; small: number; big: number }
const L = (level: number, hp: LegendaryRow['hp'], last: LegendaryRow['last'], dc: number, small: number, big: number): LegendaryRow => ({ level, hp, last, dc, small, big });

const LEGENDARY_TABLE: LegendaryRow[] = [
	L(1, [22, null, null], [3, null, null], 10, 5, 8),
	L(2, [28, null, null], [7, null, null], 11, 6, 10),
	L(3, [40, null, null], [10, null, null], 11, 8, 14),
	L(4, [44, 28, null], [13, 7, null], 12, 10, 15),
	L(5, [48, 40, null], [17, 11, null], 12, 11, 18),
	L(6, [56, 50, null], [20, 14, null], 13, 13, 21),
	L(7, [64, 58, 42], [23, 17, 10], 13, 14, 22),
	L(8, [71, 64, 50], [27, 19, 14], 14, 16, 25),
	L(9, [79, 71, 58], [30, 22, 17], 14, 17, 27),
	L(10, [86, 77, 64], [33, 24, 20], 15, 19, 30),
	L(11, [94, 85, 70], [37, 27, 22], 15, 20, 32),
	L(12, [102, 92, 76], [40, 29, 24], 16, 22, 34),
	L(13, [109, 98, 82], [43, 31, 26], 16, 23, 36),
	L(14, [117, 105, 88], [47, 34, 28], 17, 24, 39),
	L(15, [125, 112, 94], [50, 36, 30], 17, 26, 41),
	L(16, [132, 119, 99], [53, 38, 32], 18, 28, 44),
	L(17, [140, 126, 105], [57, 41, 34], 18, 30, 48),
	L(18, [147, 133, 110], [60, 43, 36], 19, 32, 50),
	L(19, [155, 141, 116], [63, 46, 38], 19, 34, 53),
	L(20, [166, 151, 124], [67, 49, 40], 20, 37, 58),
];

function legendaryRow(level: number): LegendaryRow {
	const l = Math.max(1, Math.round(level));
	if (l > 20) {
		const top = LEGENDARY_TABLE[19];
		const n = l - 20;
		// Past 20, the table's last few steps carried on: about +8 HP and +3 Last Stand per hero, +2 and +3 damage.
		const grow = (v: number | null, k: number) => (v === null ? null : v + k * n);
		return { level: l, hp: [grow(top.hp[0], 8)!, grow(top.hp[1], 8), grow(top.hp[2], 7)], last: [grow(top.last[0], 3)!, grow(top.last[1], 3), grow(top.last[2], 2)], dc: Math.min(25, top.dc + Math.floor(n / 2)), small: top.small + 2 * n, big: top.big + 3 * n };
	}
	return LEGENDARY_TABLE[l - 1];
}

export interface SoloExpected {
	hpPerHero: number;
	lastStandPerHero: number;
	small: number;
	big: number;
	dc: number;
	armorEarly: boolean;
}

export function expectedSolo(level: number, armor: ArmorType = 'none'): SoloExpected {
	const r = legendaryRow(level);
	const c = armorCol(armor);
	// Where the book has "—" (armor this early), the ratio it uses at the first level it does give.
	const ratio = c === 1 ? 28 / 44 : 42 / 64;
	return {
		hpPerHero: r.hp[c] ?? Math.round(r.hp[0] * ratio),
		lastStandPerHero: r.last[c] ?? Math.round(r.last[0] * (c === 1 ? 7 / 13 : 10 / 23)),
		small: r.small,
		big: r.big,
		dc: r.dc,
		armorEarly: armor !== 'none' && r.level < LEGENDARY_ARMOR_FROM[armor],
	};
}

// ----------------------------------------------------------------------------
// Minions: GM Guide p.23

/** The book's die for minions facing a party of this level (its bands overlap; this takes the lower). */
export function minionDie(partyLevel: number): number {
	const l = Math.max(1, partyLevel);
	if (l <= 3) return 4;
	if (l <= 5) return 6;
	if (l <= 9) return 8;
	if (l <= 12) return 10;
	if (l <= 15) return 12;
	return 20;
}

// ----------------------------------------------------------------------------
// What level a monster plays like

export interface LevelGuess {
	/** Best single guess, on the ladder. */
	level: number;
	/** The band it could be: HP says one thing, damage another. */
	low: number;
	high: number;
	/** What each stat alone says, for the level check card. */
	byHp?: number;
	byDamage?: number;
}

/** Where `value` falls along a column of the table, as a (fractional) level. */
function along(value: number, points: { level: number; v: number }[]): number {
	if (value <= points[0].v) return points[0].level;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (value <= b.v) return a.level + ((value - a.v) / Math.max(1e-6, b.v - a.v)) * (b.level - a.level);
	}
	const last = points[points.length - 1];
	const prev = points[points.length - 2];
	const slope = (last.v - prev.v) / (last.level - prev.level);
	return last.level + (value - last.v) / slope;
}

function combine(byHp: number | undefined, byDamage: number | undefined): LevelGuess {
	const parts = [byHp, byDamage].filter((v): v is number => v !== undefined && Number.isFinite(v));
	if (!parts.length) return { level: 1, low: 1, high: 1 };
	// HP says more about a monster's level than its damage: against the 525 bundled monsters, HP alone lands
	// within a level for about 78%, and leaning 3:1 on HP keeps most of that while damage still counts.
	const raw = byHp !== undefined && byDamage !== undefined ? byHp * 0.75 + byDamage * 0.25 : parts[0];
	return { level: snapLevel(raw), low: snapLevel(Math.min(...parts)), high: snapLevel(Math.max(...parts)), byHp: byHp !== undefined ? snapLevel(byHp) : undefined, byDamage: byDamage !== undefined ? snapLevel(byDamage) : undefined };
}

export function guessRegularLevel(o: { hp?: number; armor?: ArmorType; perAttack?: number; attacks?: number }): LevelGuess {
	const armor = o.armor ?? 'none';
	const c = armorCol(armor);
	const rows = MONSTER_TABLE.filter(r => r.level >= 1 / 3 && (c === 0 || r.level >= 1));
	const byHp = o.hp && o.hp > 0 ? along(o.hp, rows.map(r => ({ level: r.level, v: hpFor(r, armor) }))) : undefined;
	const attacks = Math.max(1, Math.min(3, o.attacks ?? 1));
	const byDamage = o.perAttack && o.perAttack > 0 ? along(o.perAttack, MONSTER_TABLE.filter(r => r.level >= 1 / 3).map(r => ({ level: r.level, v: dmgFor(r, attacks) }))) : undefined;
	return combine(byHp, byDamage);
}

export function guessSoloLevel(o: { hpPerHero?: number; armor?: ArmorType; perAction?: number }): LevelGuess {
	const armor = o.armor ?? 'none';
	const byHp = o.hpPerHero && o.hpPerHero > 0 ? along(o.hpPerHero, LEGENDARY_TABLE.map(r => ({ level: r.level, v: expectedSolo(r.level, armor).hpPerHero }))) : undefined;
	// A solo's actions are a small one and a big one; either is fair, so compare with their middle.
	const byDamage = o.perAction && o.perAction > 0 ? along(o.perAction, LEGENDARY_TABLE.map(r => ({ level: r.level, v: (r.small + r.big) / 2 }))) : undefined;
	const g = combine(byHp, byDamage);
	const whole = (l: number) => Math.max(1, Math.round(l));
	return { ...g, level: whole(g.level), low: whole(g.low), high: whole(g.high), byHp: g.byHp && whole(g.byHp), byDamage: g.byDamage && whole(g.byDamage) };
}

// ----------------------------------------------------------------------------
// Re-levelling a monster (the GM Guide: "use the monster builder charts to
// adjust ... to be appropriate for any level")

/** An attack line with its first dice expression scaled by `ratio`, keeping the die size: "1d6+2" ×2 → "1d6+9". */
export function scaleAttack(raw: string, ratio: number): string {
	const m = DICE_RE.exec(raw);
	if (!m || ratio === 1) return raw;
	const d = parseDiceParts(m[0])!;
	const target = (d.count * dieAverage(d.sides) + d.bonus) * ratio;
	let next: Dice;
	if (target >= d.count * dieAverage(d.sides)) next = { ...d, bonus: Math.round(target - d.count * dieAverage(d.sides)) };
	else next = suggestDice(target, d.sides);
	// Keep how it was written: "d44" stays without a count.
	const text = /^\s*d/i.test(m[0]) && next.count === 1 && TENS_ONES[next.sides] !== undefined ? formatDiceParts(next) : formatDiceParts(next).replace(/^d/, '1d');
	return raw.slice(0, m.index) + text + raw.slice(m.index + m[0].length);
}

export interface Relevelled { hp: number; damageRatio: number; armor: ArmorType }

/**
 * What a regular monster's HP and damage become at another level: each moves
 * by the table's ratio between the two levels, so a glass cannon stays one.
 * Going down, armor drops a step when the new level is below the book's floor for it.
 */
export function relevelRegular(o: { level: number; hp: number; armor: ArmorType; attacks?: number }, to: number): Relevelled {
	// Only on the way down: a monster the book already armors early keeps its armor when it gets tougher.
	let armor = o.armor;
	if (to < o.level && armor === 'heavy' && to < ARMOR_FROM.heavy) armor = to >= ARMOR_FROM.medium ? 'medium' : 'none';
	else if (to < o.level && armor === 'medium' && to < ARMOR_FROM.medium) armor = 'none';
	const from = tableRow(o.level);
	const next = tableRow(to);
	const attacks = o.attacks ?? 1;
	const hpRatio = hpFor(next, armor) / hpFor(from, o.armor);
	return { hp: Math.max(1, Math.round(o.hp * hpRatio)), damageRatio: dmgFor(next, attacks) / dmgFor(from, attacks), armor };
}

export function relevelSolo(o: { level: number; hpPerHero: number; armor: ArmorType }, to: number): { hpPerHero: number; damageRatio: number; lastStandPerHero: number } {
	const a = expectedSolo(o.level, o.armor);
	const b = expectedSolo(to, o.armor);
	const from = legendaryRow(o.level);
	const next = legendaryRow(to);
	return {
		hpPerHero: Math.max(1, Math.round(o.hpPerHero * (b.hpPerHero / a.hpPerHero))),
		damageRatio: (next.small + next.big) / (from.small + from.big),
		lastStandPerHero: b.lastStandPerHero,
	};
}

// ----------------------------------------------------------------------------
// The GM Guide's flavourful monster abilities (p.27): roll 1d20, pick a column.

export const FLAVOR_ABILITIES: { name: string; text: string }[][] = [
	[{ name: 'Acid Blood', text: 'Melee attackers take half the HP lost in return as acid splashes them.' }, { name: 'Hypnotic Gaze', text: 'Forces enemies to make a WIL save or be confused for 1 round (GM spends 1 action for them).' }],
	[{ name: 'Aggressive', text: '+2 Speed if moving toward enemies.' }, { name: 'Hates the Light', text: 'Attacks the hero holding light.' }],
	[{ name: 'Brawler', text: 'Extra damage, can only attack in melee.' }, { name: 'Invulnerable', text: 'Immune to damage until crit.' }],
	[{ name: 'Bloodthirsty', text: 'Has advantage on attacks against damaged targets.' }, { name: 'Mounted', text: 'Faster movement and deals extra damage after moving toward an enemy.' }],
	[{ name: 'Brute', text: 'Attacks also Knockback a number of spaces equal to the Primary Die rolled.' }, { name: 'Obstinate', text: 'When attacking a target with disadvantage, treat the roll as if it had advantage instead.' }],
	[{ name: 'Blinding Spit', text: 'Spits a blinding substance at a target within range. The target must make a save or be Blind for 1 round.' }, { name: 'Standard Bearer', text: 'Buffs nearby allies, reducing the damage they take or increasing the damage they do.' }],
	[{ name: 'Burning Aura', text: 'Creatures that start their turn adjacent to this monster take 1d6 fire damage.' }, { name: 'Silencer', text: 'Attacks Silence the target for the round.' }],
	[{ name: 'Webslinger', text: 'Can immobilize a target with webs when hit or crit.' }, { name: 'Formation', text: 'Armor increases 1 step for each adjacent ally (None, Medium, Heavy).' }],
	[{ name: 'Controlling', text: 'Creates and is immune to Difficult Terrain.' }, { name: 'Savage', text: 'Always crits Grappled creatures.' }],
	[{ name: 'Heavy Blows', text: 'Attacks also Daze the target.' }, { name: 'Retaliate', text: 'Attacks the first creature who attacks them in melee each round.' }],
	[{ name: 'Disintegrating Armor', text: 'Starts with Heavy Armor, on crit degrades to Medium, then to none.' }, { name: 'Shifty', text: 'Can move after being attacked.' }],
	[{ name: 'Doom', text: 'Attacks also Wound the target.' }, { name: 'Parry', text: 'Attacks against them miss on a 1 and 2.' }],
	[{ name: 'Gravity Manipulator', text: 'Can pull or push enemies.' }, { name: 'Sneak', text: 'Invisible until they attack.' }],
	[{ name: 'Fast', text: '(1/round) Reaction (when attacked): It is rerolled with disadvantage.' }, { name: 'Spiked', text: 'When attacked in melee, deal 2 damage in return.' }],
	[{ name: 'Fearsome', text: 'Frighten enemies within Range on a failed WIL save. 1/encounter.' }, { name: 'Pack Tactics', text: 'Advantage on attacks when an ally is adjacent to the target.' }],
	[{ name: 'Flying', text: 'Flying Speed and immune to Opportunity Attacks. May fall when crit (1d6 damage per 2 spaces fallen, and lands Prone).' }, { name: 'Sturdy', text: 'The first time the monster would die, they have 1 HP instead.' }],
	[{ name: 'Ranged', text: 'Extra damage; can only attack at range.' }, { name: 'Summoner', text: 'Calls minions to their aid each round.' }],
	[{ name: 'Frenzied', text: 'Deals extra damage or has faster Speed while damaged.' }, { name: 'Explosive Death', text: 'Explodes on death, dealing 2d6 damage to creatures within reach.' }],
	[{ name: 'Grappler', text: 'On hit, Grapple.' }, { name: 'Vicious', text: 'Crits are Vicious (roll 1 additional die).' }],
	[{ name: 'Tricky', text: 'Can swap places with allies or enemies.' }, { name: 'Warping Touch', text: 'On hit, teleport target 2 spaces.' }],
];

// ----------------------------------------------------------------------------
// Spells: Creator's Kit p.21, Core Rules p.44

/** Average damage of a single-target damage spell: cantrip, then tiers 1-9. */
export const SPELL_DAMAGE = [6, 14, 23, 33, 44, 56, 69, 83, 98, 114];
/** Area spells in Core 3.3 run well under the single-target line (about 0.6 of it); the Creator's Kit asks a drawback of anything above it. */
export const AOE_FACTOR = 0.6;

export interface SpellExpected {
	damage: number;
	dice: Dice;
	actions: number;
	/** "+N damage" per extra mana, or a cantrip's every-5th-level bonus. */
	upcast: number;
	range: number;
	mana: number;
}

export function expectedSpell(tier: number, o: { aoe?: boolean; ranged?: boolean; sides?: number } = {}): SpellExpected {
	const t = Math.max(0, Math.min(9, Math.round(tier)));
	const damage = SPELL_DAMAGE[t] * (o.aoe ? AOE_FACTOR : 1);
	// Upcasting one step should move a spell part of the way to the next tier's damage, not all of it.
	const step = t === 0 ? Math.floor(SPELL_DAMAGE[0] * 0.8) : Math.round(((SPELL_DAMAGE[Math.min(9, t + 1)] - SPELL_DAMAGE[t]) || 16) * 0.6 * (o.aoe ? AOE_FACTOR : 1));
	return {
		damage: Math.round(damage * 2) / 2,
		dice: suggestDice(damage, o.sides ?? (t === 0 ? 10 : 8)),
		actions: t === 0 ? 1 : o.aoe && o.ranged ? 3 : 2,
		upcast: Math.max(1, step),
		range: 8,
		mana: t,
	};
}

/** The tier a damage spell plays like. Area spells count for more than their raw damage. */
export function guessSpellTier(avg: number, aoe = false): number {
	const effective = aoe ? avg / AOE_FACTOR : avg;
	let best = 0;
	for (let t = 0; t < SPELL_DAMAGE.length; t++) if (Math.abs(SPELL_DAMAGE[t] - effective) < Math.abs(SPELL_DAMAGE[best] - effective)) best = t;
	return best;
}

// ----------------------------------------------------------------------------
// Items: Core Rules p.39-43

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary'] as const;
export type Rarity = typeof RARITIES[number];

export const RARITY_GUIDE: Record<Rarity, { levels: string; cost: string }> = {
	common: { levels: 'any level', cost: 'up to 50 gp' },
	uncommon: { levels: 'levels 2–6', cost: '50–500 gp' },
	rare: { levels: 'levels 5–12', cost: '500–5,000 gp' },
	'very rare': { levels: 'levels 8–18', cost: '5,000–500,000 gp' },
	legendary: { levels: 'levels 15–20', cost: '1,000,000+ gp, or priceless' },
};

/** Spell scrolls by tier (Core p.42); a wand of the spell is five times the scroll. */
export const SCROLL_PRICE = [10, 35, 100, 300, 1000, 3000, 10000, 25000, 75000, 200000];
export const WAND_PRICE = SCROLL_PRICE.map(p => p * 5);

/** A weapon's price from its average damage, along Core 3.3's weapon table (1d4 about 3 gp, 1d8 about 30, 2d6 about 100). */
export function weaponPrice(avg: number): number {
	const points: [number, number][] = [[2.5, 3], [3.5, 10], [4.5, 30], [5.5, 45], [6.5, 80], [7, 100], [10.5, 120]];
	if (avg <= points[0][0]) return points[0][1];
	for (let i = 1; i < points.length; i++) {
		const [a0, p0] = points[i - 1];
		const [a1, p1] = points[i];
		if (avg <= a1) {
			const p = p0 + ((avg - a0) / (a1 - a0)) * (p1 - p0);
			return p < 20 ? Math.max(1, Math.round(p)) : Math.round(p / 5) * 5;
		}
	}
	return points[points.length - 1][1];
}
