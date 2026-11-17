// The monster builder's draft: what the GM has typed, and everything else
// filled in from the GM Guide's numbers for the level. A field left empty
// follows the level; a typed one is kept and the level check says how far it
// is from expected. Pure, so it's unit-tested.

import { ArmorType, NimbleMonster } from './types';
import { toStatblockSource } from './parser';
import { lastStandEffect, levelValue, monsterRole, monsterSaves } from './rules';
import {
	diceAverage, DIE_SIZES, expectedRegular, expectedSolo, formatDiceParts, guessRegularLevel, guessSoloLevel, LevelGuess, levelLabel,
	minionDie, parseDiceParts, relevelRegular, relevelSolo, scaleAttack, snapLevel, stepLevel, suggestDice, ARMOR_FROM, LEGENDARY_ARMOR_FROM,
} from './builder-math';

export type BuildRole = 'regular' | 'solo' | 'minion';
export type SaveStat = 'STR' | 'DEX' | 'INT' | 'WIL';
export const SAVE_STATS: SaveStat[] = ['STR', 'DEX', 'INT', 'WIL'];
export type MoveMode = 'fly' | 'climb' | 'burrow' | 'swim';
export const MOVE_MODES: MoveMode[] = ['fly', 'climb', 'burrow', 'swim'];

export interface AttackDraft {
	name: string;
	/** What the GM wrote after the name. Unset: the suggested dice for the level. */
	body?: string;
	/** From a template: the attack as the book wrote it, re-levelled with the monster until edited. */
	base?: string;
	/** Solos: the small (moves, utility) or big attack (GM Guide p.40). */
	size?: 'small' | 'big';
	/** This attack's die, when it differs from the monster's (d6 claws, a d12 slam). */
	die?: number;
}

export interface MonsterDraft {
	name: string;
	role: BuildRole;
	level: number;
	/** The level follows the stats the GM typed. */
	autoLevel: boolean;
	size: string;
	type: string;
	armor: ArmorType;
	/** Typed HP: the total for regular monsters, per hero for solos. */
	hp?: number;
	speed: number;
	moves: Partial<Record<MoveMode, number>>;
	/** −1 disadvantaged, 1 advantaged, 2 doubly. */
	saves: Partial<Record<SaveStat, number>>;
	attacksPerTurn: number;
	/** The monster's damage die (GM Guide p.26: d8 unless its theme says otherwise). */
	die: number;
	attacks: AttackDraft[];
	actionText?: string;
	abilities: { name: string; text: string }[];
	bloodied?: string;
	lastStand?: string;
	description?: string;
	easier?: string;
	harder?: string;
	group?: string;
	habitat?: string;
	resistances: string[];
	immunities: string[];
	vulnerabilities: string[];
	minionDie?: number;
	/** Copied from this monster; its numbers re-level with the draft's level. */
	template?: { name: string; level: number; hp: number; hpPerHero?: number; armor: ArmorType };
	partyLevel: number;
	partySize: number;
}

export interface Party { level: number; size: number }

const SOLO_ACTION_TEXT = 'After each hero\'s turn, choose one:';

export function newMonsterDraft(party: Party, role: BuildRole = 'regular'): MonsterDraft {
	const level = Math.max(1, Math.round(party.level || 1));
	const d: MonsterDraft = {
		name: '', role, level, autoLevel: false, size: 'Medium', type: '', armor: 'none', speed: 6, moves: {}, saves: {},
		attacksPerTurn: 1, die: 8, attacks: [], abilities: [], resistances: [], immunities: [], vulnerabilities: [],
		partyLevel: level, partySize: Math.max(1, party.size || 4),
	};
	return setRole(d, role);
}

/** Switching role resets the attacks to that role's shape, keeping any the GM has named or written. */
export function setRole(d: MonsterDraft, role: BuildRole): MonsterDraft {
	const kept = d.attacks.filter(a => a.name.trim() || a.body !== undefined || a.base !== undefined);
	const next: MonsterDraft = { ...d, role };
	if (role === 'solo') {
		next.attacks = kept.length ? kept.map((a, i) => ({ ...a, size: a.size ?? (i === 0 ? 'small' : 'big') })) : [{ name: '', size: 'small' }, { name: '', size: 'big' }];
		if (next.attacks.length === 1) next.attacks.push({ name: '', size: 'big' });
		next.level = Math.max(1, Math.round(next.level));
	} else {
		next.attacks = kept.length ? kept.map(a => ({ ...a, size: undefined })) : [{ name: '' }];
		if (role === 'minion') next.attacks = next.attacks.slice(0, 1);
	}
	return next;
}

// ----------------------------------------------------------------------------
// Expected and effective numbers

export interface Expected {
	hp: number;
	/** Solos: per hero. */
	perHero?: number;
	lastStandPerHero?: number;
	/** Damage each attack is expected to average (solos: small and big). */
	perAttack: number;
	small?: number;
	big?: number;
	dc: number;
	cantCrit: boolean;
	armorEarly: boolean;
}

export function expected(d: MonsterDraft): Expected {
	if (d.role === 'solo') {
		const s = expectedSolo(d.level, d.armor);
		return { hp: s.hpPerHero * d.partySize, perHero: s.hpPerHero, lastStandPerHero: s.lastStandPerHero, perAttack: (s.small + s.big) / 2, small: s.small, big: s.big, dc: s.dc, cantCrit: false, armorEarly: s.armorEarly };
	}
	if (d.role === 'minion') {
		const die = d.minionDie ?? minionDie(d.partyLevel);
		return { hp: 1, perAttack: (die + 1) / 2, dc: expectedRegular(d.partyLevel).dc, cantCrit: true, armorEarly: false };
	}
	const r = expectedRegular(d.level, d.armor, d.attacksPerTurn, d.die);
	return { hp: r.hp, perAttack: r.perAttack, dc: r.dc, cantCrit: r.cantCrit, armorEarly: r.armorEarly };
}

/** The HP the stat block will have: typed, re-levelled from a template, or expected. Solos: per hero. */
export function effectiveHp(d: MonsterDraft): number {
	if (d.role === 'minion') return 1;
	if (d.hp !== undefined) return d.hp;
	const t = d.template;
	if (t) {
		if (d.role === 'solo') {
			const perHero = t.hpPerHero ?? Math.max(1, Math.round(t.hp / 4));
			return relevelSolo({ level: t.level, hpPerHero: perHero, armor: t.armor }, d.level).hpPerHero;
		}
		return relevelRegular({ level: t.level, hp: t.hp, armor: t.armor }, d.level).hp;
	}
	const e = expected(d);
	return d.role === 'solo' ? e.perHero! : e.hp;
}

/** How much a template's attacks scale from its level to the draft's. */
function templateRatio(d: MonsterDraft): number {
	const t = d.template;
	if (!t || Math.abs(t.level - d.level) < 1e-6) return 1;
	if (d.role === 'solo') return relevelSolo({ level: t.level, hpPerHero: t.hpPerHero ?? t.hp / 4, armor: t.armor }, d.level).damageRatio;
	return relevelRegular({ level: t.level, hp: t.hp, armor: t.armor, attacks: d.attacksPerTurn }, d.level).damageRatio;
}

/** What one attack should average: the level's damage, or a solo's small or big attack. */
export function attackTarget(d: MonsterDraft, a: AttackDraft): number {
	const e = expected(d);
	if (d.role === 'solo') return a.size === 'big' ? e.big! : e.small!;
	return e.perAttack;
}

/** Suggested dice for an attack in the monster's die. */
export function suggestedDice(d: MonsterDraft, a: AttackDraft): string {
	if (d.role === 'minion') return `1d${d.minionDie ?? minionDie(d.partyLevel)}`;
	return formatDiceParts(suggestDice(attackTarget(d, a), a.die ?? d.die));
}

/** What follows an attack's name in the stat block. */
export function attackBody(d: MonsterDraft, a: AttackDraft): string {
	if (a.body !== undefined) return a.body;
	if (a.base !== undefined) return scaleAttack(a.base, templateRatio(d));
	const dice = suggestedDice(d, a);
	if (d.role === 'minion') return `${dice} (follows minion rules).`;
	if (d.role === 'solo' && a.size === 'small') return `Move ${d.speed}. ${dice}.`;
	const crit = d.role === 'regular' && expected(d).cantCrit ? ' Can\'t crit.' : '';
	return `${dice}.${crit}`;
}

export function attackDice(d: MonsterDraft, a: AttackDraft): string | null {
	const m = /\b(?:\d+\s*)?d\d+(?:\s*[+\-−]\s*\d+)?/i.exec(attackBody(d, a));
	return m ? m[0].replace(/\s+/g, '') : null;
}

/** The body with its dice replaced (or the dice put first when it has none). */
export function withDice(body: string, dice: string): string {
	const re = /\b(?:\d+\s*)?d\d+(?:\s*[+\-−]\s*\d+)?/i;
	return re.test(body) ? body.replace(re, dice) : `${dice}. ${body}`.trim();
}

const NAMES: Record<BuildRole, string[]> = { regular: ['Strike', 'Rend', 'Bash'], solo: ['Lunge', 'Crush', 'Sweep', 'Roar'], minion: ['Stab'] };

export function attackName(d: MonsterDraft, a: AttackDraft, i: number): string {
	const n = a.name.trim() || NAMES[d.role][i % NAMES[d.role].length];
	// One attack made twice a turn reads "Claws (2×)", the way Monsters & More writes it.
	return d.role === 'regular' && d.attacksPerTurn > 1 && d.attacks.length === 1 && !/\(\d\s*[x×]\)/i.test(n) ? `${n} (${d.attacksPerTurn}×)` : n;
}

export function effectiveActionText(d: MonsterDraft): string | undefined {
	if (d.actionText?.trim()) return d.actionText.trim();
	if (d.role === 'solo') return SOLO_ACTION_TEXT;
	if (d.role === 'regular' && d.attacksPerTurn > 1 && d.attacks.length > 1) return d.attacksPerTurn === 2 ? 'Choose twice:' : `Choose ${d.attacksPerTurn} times:`;
	return undefined;
}

const NEXT_DIE: Record<number, number> = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 20, 20: 20 };

/** The GM Guide's legendaries mostly get scarier at half HP by rolling bigger dice (Krogg, Pudge, Grimbeak). */
export function suggestedBloodied(d: MonsterDraft): string {
	const die = attackDie(d) ?? d.die;
	return `Its damage dice grow a size: d${die}s become d${NEXT_DIE[die] ?? die + 2}s.`;
}

export function suggestedLastStand(d: MonsterDraft): string {
	return `Regains ${expected(d).lastStandPerHero ?? 0} HP per hero and fights on.`;
}

function attackDie(d: MonsterDraft): number | null {
	for (const a of d.attacks) {
		const p = parseDiceParts(attackBody(d, a));
		if (p) return p.sides;
	}
	return null;
}

export function movementText(d: MonsterDraft): string {
	const extra = MOVE_MODES.filter(m => d.moves[m] !== undefined).map(m => `${m} ${d.moves[m]}`);
	if (!extra.length) return String(d.speed);
	return [String(d.speed), ...extra].join(', ');
}

export function savesText(d: MonsterDraft): string {
	return SAVE_STATS.filter(s => d.saves[s]).map(s => {
		const v = d.saves[s]!;
		return `${s}${v < 0 ? '-' : '+'.repeat(Math.min(2, v))}`;
	}).join(' ');
}

// ----------------------------------------------------------------------------
// The stat block

export function toMonster(d: MonsterDraft): NimbleMonster {
	const name = d.name.trim() || 'New monster';
	const hp = effectiveHp(d);
	const m: NimbleMonster = {
		name,
		level: d.role === 'minion' ? undefined : levelLabel(d.level),
		role: d.role === 'solo' ? 'legendary' : d.role,
		roleLabel: d.role === 'solo' ? 'Solo' : undefined,
		size: d.size || undefined,
		type: d.type.trim() || undefined,
		armor: d.armor,
		hp: d.role === 'solo' ? hp * d.partySize : hp,
		hpPerHero: d.role === 'solo' ? hp : undefined,
		movement: movementText(d),
		saves: savesText(d) || undefined,
		actionText: effectiveActionText(d),
		attacks: d.attacks.map((a, i) => ({ raw: `**${attackName(d, a, i)}.** ${attackBody(d, a)}`.trim() })),
		abilities: d.abilities.filter(a => a.name.trim() || a.text.trim()).map(a => ({ name: a.name.trim() || 'Ability', description: a.text.trim() })),
		bloodied: d.role === 'solo' ? (d.bloodied?.trim() || suggestedBloodied(d)) : d.bloodied?.trim() || undefined,
		lastStand: d.role === 'solo' ? (d.lastStand?.trim() || suggestedLastStand(d)) : undefined,
		description: d.description?.trim() || undefined,
		group: d.group?.trim() || undefined,
		habitat: d.habitat?.trim() || undefined,
		resistances: d.resistances.length ? d.resistances : undefined,
		immunities: d.immunities.length ? d.immunities : undefined,
		vulnerabilities: d.vulnerabilities.length ? d.vulnerabilities : undefined,
		minionDie: d.role === 'minion' ? d.minionDie ?? minionDie(d.partyLevel) : undefined,
	};
	if (d.easier?.trim() || d.harder?.trim()) m.tactics = { easier: d.easier?.trim() || undefined, harder: d.harder?.trim() || undefined };
	// No empty fields in the block.
	for (const k of Object.keys(m) as (keyof NimbleMonster)[]) if (m[k] === undefined) delete m[k];
	return m;
}

export function toSource(d: MonsterDraft): string {
	return toStatblockSource(toMonster(d));
}

// ----------------------------------------------------------------------------
// The level check

export interface LevelCheck {
	guess: LevelGuess;
	/** -1 weaker than its level, 0 about right, 1 tougher. */
	verdict: -1 | 0 | 1;
	hp: { have: number; want: number };
	damage: { have: number; want: number };
}

export function levelCheck(d: MonsterDraft): LevelCheck | null {
	if (d.role === 'minion') return null;
	const e = expected(d);
	const hp = effectiveHp(d);
	const avgs = d.attacks.map(a => diceAverage(attackBody(d, a)) ?? 0);
	const perAttack = avgs.length ? Math.max(...avgs) : 0;
	const guess = d.role === 'solo'
		? guessSoloLevel({ hpPerHero: hp, armor: d.armor, perAction: avgs.length ? avgs.reduce((x, y) => x + y, 0) / avgs.length : undefined })
		: guessRegularLevel({ hp, armor: d.armor, perAttack: perAttack || undefined, attacks: d.attacksPerTurn });
	const off = guess.level - d.level;
	// Half a level either way still plays as its level (for fractions, the next rung).
	const near = d.level < 1 ? Math.abs(off) < 0.3 : Math.abs(off) < 1 || (d.level >= 10 && Math.abs(off) <= d.level * 0.1);
	return {
		guess,
		verdict: near ? 0 : off > 0 ? 1 : -1,
		hp: { have: hp, want: d.role === 'solo' ? e.perHero! : e.hp },
		damage: { have: d.role === 'solo' ? (avgs.reduce((x, y) => x + y, 0) / Math.max(1, avgs.length)) : perAttack, want: e.perAttack },
	};
}

/**
 * The level to move to so the check agrees. A template's attacks re-level with
 * the level, so this follows the guess until it stops moving.
 */
export function settledLevel(d: MonsterDraft): number {
	let level = d.level;
	for (let i = 0; i < 6; i++) {
		const c = levelCheck({ ...d, level });
		if (!c || c.guess.level === level) break;
		level = c.guess.level;
	}
	return level;
}

/** The level that the stats the GM typed say, for Auto. Nothing typed: the level stays. */
export function autoLevel(d: MonsterDraft): number {
	const typedHp = d.hp !== undefined;
	const typedDice = d.attacks.some(a => a.body !== undefined);
	if (!typedHp && !typedDice) return d.level;
	const hp = typedHp ? d.hp : undefined;
	const avgs = d.attacks.filter(a => a.body !== undefined).map(a => diceAverage(a.body) ?? 0).filter(Boolean);
	if (d.role === 'solo') return guessSoloLevel({ hpPerHero: hp, armor: d.armor, perAction: avgs.length ? avgs.reduce((x, y) => x + y, 0) / avgs.length : undefined }).level;
	return guessRegularLevel({ hp, armor: d.armor, perAttack: avgs.length ? Math.max(...avgs) : undefined, attacks: d.attacksPerTurn }).level;
}

// ----------------------------------------------------------------------------
// From an existing monster

/** A draft copied from a monster, whose HP and attacks re-level as the level moves. */
export function draftFromMonster(m: NimbleMonster, party: Party, copyName = true): MonsterDraft {
	const role: BuildRole = monsterRole(m) === 'legendary' ? 'solo' : monsterRole(m) === 'minion' ? 'minion' : 'regular';
	const lvl = levelValue(m.level);
	const level = lvl === null ? Math.max(1, Math.round(party.level || 1)) : role === 'solo' ? Math.max(1, Math.round(lvl)) : snapLevel(lvl);
	const d = newMonsterDraft(party, role);
	const moves: MonsterDraft['moves'] = {};
	let speed = 6;
	for (const part of (m.movement ?? '6').split(/[,;]/)) {
		const p = part.trim().toLowerCase().match(/^(fly|climb|burrow|swim)?\s*(\d+)/);
		if (!p) continue;
		if (p[1]) moves[p[1] as MoveMode] = Number(p[2]);
		else speed = Number(p[2]);
	}
	const saves: MonsterDraft['saves'] = {};
	for (const s of (monsterSaves(m) ?? '').toUpperCase().replace(/\bWILL\b/g, 'WIL').matchAll(/\b(STR|DEX|INT|WIL|ALL)\s*(\+\+|\+|-|–|−)/g)) {
		const v = s[2] === '++' ? 2 : s[2] === '+' ? 1 : -1;
		for (const k of s[1] === 'ALL' ? SAVE_STATS : [s[1] as SaveStat]) saves[k] = v;
	}
	const multi = (m.attacks ?? []).map(a => a.raw.match(/\((\d)\s*[x×]\)/i)).find(Boolean);
	const firstDie = (m.attacks ?? []).map(a => parseDiceParts(a.raw)?.sides).find((s): s is number => !!s && (DIE_SIZES as readonly number[]).includes(s));
	return {
		...d,
		name: copyName ? m.name : '',
		level,
		size: m.size ?? 'Medium',
		type: m.type ?? '',
		armor: m.armor ?? 'none',
		speed,
		moves,
		saves,
		attacksPerTurn: multi ? Math.min(3, Number(multi[1])) : 1,
		die: firstDie ?? 8,
		attacks: (m.attacks ?? []).map((a, i) => {
			const { name, rest } = splitAttack(a.raw);
			const sides = parseDiceParts(rest)?.sides;
			return { name, base: rest, size: role === 'solo' ? (i === 0 ? 'small' : 'big') : undefined, die: sides && (DIE_SIZES as readonly number[]).includes(sides) ? sides : undefined };
		}),
		actionText: m.actionText,
		abilities: (m.abilities ?? []).map(a => ({ name: a.name, text: a.description })),
		bloodied: m.bloodied,
		lastStand: m.lastStand,
		description: m.description,
		easier: m.tactics?.easier,
		harder: m.tactics?.harder,
		group: m.group,
		habitat: m.habitat,
		resistances: m.resistances ?? [],
		immunities: m.immunities ?? [],
		vulnerabilities: m.vulnerabilities ?? [],
		minionDie: m.minionDie,
		template: { name: m.name, level, hp: m.hp, hpPerHero: m.hpPerHero, armor: m.armor ?? 'none' },
	};
}

/** "**Bite.** 1d6+2, Grappled." → name "Bite", rest "1d6+2, Grappled." (a name without bold is everything before the dice). */
export function splitAttack(raw: string): { name: string; rest: string } {
	const bold = raw.match(/^(\*{1,3}|_{1,3})(.+?)\1\s*[:.]?\s*(.*)$/);
	if (bold) return { name: bold[2].replace(/[.:]\s*$/, '').trim(), rest: bold[3].trim() };
	const colon = raw.match(/^([^:.\d]{1,40})[:.]\s*(.*)$/);
	if (colon) return { name: colon[1].trim(), rest: colon[2].trim() };
	const dice = raw.search(/\b\d*d\d+/i);
	if (dice > 0) return { name: raw.slice(0, dice).trim(), rest: raw.slice(dice).trim() };
	return { name: '', rest: raw.trim() };
}

/** Anything the GM still needs to settle before it's saved. */
export function missing(d: MonsterDraft): string | null {
	if (!d.name.trim()) return 'Give it a name.';
	return null;
}

// ----------------------------------------------------------------------------
// The review: what to look at before saving, each with a fix where there's one

export type ReviewFix =
	| { kind: 'level'; to: number }
	| { kind: 'book-numbers' }
	| { kind: 'book-dice'; attack: number }
	| { kind: 'roll-ability' }
	| { kind: 'hp-step' }
	| { kind: 'armor'; to: ArmorType }
	| { kind: 'last-stand' }
	| { kind: 'add-attack' }
	| { kind: 'go'; step: string; open?: 'saves' };

export interface ReviewNote {
	tone: 'warn' | 'tip' | 'ok';
	text: string;
	fixes: { label: string; fix: ReviewFix }[];
}

/** Everything worth a second look, most important first. */
export function reviewNotes(d: MonsterDraft): ReviewNote[] {
	const notes: ReviewNote[] = [];
	const add = (tone: ReviewNote['tone'], text: string, ...fixes: ReviewNote['fixes']) => notes.push({ tone, text, fixes });
	if (!d.name.trim()) add('warn', 'It has no name yet.', { label: 'Name it', fix: { kind: 'go', step: 'start' } });
	const c = levelCheck(d);
	if (c && c.verdict !== 0) {
		const to = settledLevel(d);
		const lv = levelLabel(d.level);
		add('warn', `Its HP and damage play like level ${levelLabel(c.guess.level)}, not ${lv}${c.verdict > 0 ? ': a harder fight than its level says.' : ': an easier fight than its level says.'}`,
			...(to !== d.level ? [{ label: `Make it level ${levelLabel(to)}`, fix: { kind: 'level', to } as ReviewFix }] : []),
			{ label: `Use level ${lv} numbers`, fix: { kind: 'book-numbers' } });
	}
	if (d.role !== 'minion') {
		d.attacks.forEach((a, i) => {
			const have = diceAverage(attackBody(d, a));
			const want = attackTarget(d, a);
			if (have === null || !want || (c && c.verdict !== 0)) return; // the level note covers it
			if (have > want * 1.4 || have < want * 0.6) add('tip', `${attackName(d, a, i)} averages ${Math.round(have)} damage; the book has ${Math.round(want)} at this level.`, { label: 'Book dice', fix: { kind: 'book-dice', attack: i } });
		});
		const e = expected(d);
		if (e.armorEarly) {
			const from = d.role === 'solo' ? LEGENDARY_ARMOR_FROM : ARMOR_FROM;
			add('warn', `${d.armor === 'heavy' ? 'Heavy' : 'Medium'} armor at level ${levelLabel(d.level)} is earlier than the book uses it (level ${from[d.armor as 'medium' | 'heavy']}): a slog for heroes this early.`,
				...(d.armor === 'heavy' && d.level >= ARMOR_FROM.medium ? [{ label: 'Medium armor', fix: { kind: 'armor', to: 'medium' } as ReviewFix }] : []),
				{ label: 'No armor', fix: { kind: 'armor', to: 'none' } });
		}
		if (!d.abilities.some(a => a.name.trim() || a.text.trim())) {
			add('tip', 'No ability yet. The book\'s numbers assume one simple ability; without one, it gives the monster a level\'s more HP or damage.',
				{ label: 'Roll an ability', fix: { kind: 'roll-ability' } }, ...(d.hp === undefined ? [{ label: 'A level\'s more HP', fix: { kind: 'hp-step' } as ReviewFix }] : []));
		}
	}
	if (d.role === 'solo') {
		if (!savesText(d)) add('tip', 'Legendary monsters usually get one or two advantaged saves.', { label: 'Set saves', fix: { kind: 'go', step: 'tough', open: 'saves' } });
		if (d.attacks.length < 2) add('tip', 'After each hero\'s turn a solo picks between a small attack that moves and a big one.', { label: 'Add an attack', fix: { kind: 'add-attack' } });
		const ls = toMonster(d).lastStand;
		if (ls && !lastStandEffect(ls, d.partySize)) add('tip', 'The tracker can\'t apply this Last Stand. Say "regains N HP per hero" or "N more damage and it dies".', { label: 'Use the suggested one', fix: { kind: 'last-stand' } });
	}
	if (!d.easier?.trim() && !d.harder?.trim() && d.role !== 'minion') add('tip', 'No Easier or Harder tactics: they help tune the fight at the table.', { label: 'Add tactics', fix: { kind: 'go', step: 'story' } });
	if (!notes.some(n => n.tone === 'warn')) notes.unshift({ tone: 'ok', text: d.role === 'minion' ? 'Ready to run.' : `Ready to run as a level ${levelLabel(d.level)} ${d.role === 'solo' ? 'solo' : 'monster'}.`, fixes: [] });
	return notes;
}

/** Apply a review fix to the draft (the UI handles the ones that move between steps). */
export function applyFix(d: MonsterDraft, fix: ReviewFix): MonsterDraft {
	switch (fix.kind) {
		case 'level': return { ...d, level: fix.to, autoLevel: false };
		case 'book-numbers': return { ...d, hp: undefined, template: undefined, autoLevel: false, attacks: d.attacks.map(a => ({ name: a.name, size: a.size, die: a.die })) };
		case 'book-dice': return { ...d, attacks: d.attacks.map((a, i) => (i === fix.attack ? { name: a.name, size: a.size, die: a.die } : a)) };
		case 'hp-step': {
			const next = d.role === 'solo' ? d.level + 1 : stepLevel(d.level, 1);
			return { ...d, hp: effectiveHp({ ...d, level: next, hp: undefined }) };
		}
		case 'armor': return { ...d, armor: fix.to };
		case 'last-stand': return { ...d, lastStand: undefined };
		case 'add-attack': return { ...d, attacks: [...d.attacks, { name: '', size: d.role === 'solo' ? 'big' : undefined }] };
		default: return d;
	}
}

/** The level, armor and HP in the words the stat block uses: "41 HP · Armor: None". */
export function toughnessLine(d: MonsterDraft): string {
	if (d.role === 'minion') return `Minion, d${d.minionDie ?? minionDie(d.partyLevel)} · Armor: ${d.armor === 'none' ? 'None' : d.armor === 'medium' ? 'Medium' : 'Heavy'}`;
	const hp = effectiveHp(d);
	return `${d.role === 'solo' ? `${hp} HP per hero (${hp * d.partySize} for ${d.partySize})` : `${hp} HP`} · Armor: ${d.armor === 'none' ? 'None' : d.armor === 'medium' ? 'Medium' : 'Heavy'}`;
}
