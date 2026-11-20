// Nimble's words for core's keypad (core/tracker/hp-pad.ts): tap Damage or
// Heal on the tracker's card, or anyone's HP, and it opens beside it (a bottom
// sheet on phones). Monsters' armor and Vulnerable/Resisted show in the
// preview; minions are hit or brought back; a hero's keypad has the players'
// answers as quiet chips (Defend takes their Armor off, Interpose sends the
// hit to a friend), never a prompt. Typing works too, with the same shorthand
// as always: 12, 12!, +5, =20, t5, 12v, 12r, then Enter.

import { DamageMod, HpCommand, monsterRole } from './rules';
import { EncounterCreature } from './types';
import { defendedDamage, HeroReaction, isHero, isMinionGroup, monsterHit } from './encounters';
import { closePopover } from '../../core/popover';
import { HpPadModeInfo, HpPadPicks, HpPadQuick, openHpPad } from '../../core/tracker/hp-pad';

export type { HeroReaction } from './encounters';

type Mode = 'damage' | 'heal' | 'set' | 'temp';

/** The chips picked on the keypad, as the store reads them. */
function reactionOf(picks: HpPadPicks): HeroReaction {
	const r: HeroReaction = {};
	if (picks.defend !== undefined) r.defend = true;
	if (typeof picks.interpose === 'string' && picks.interpose) r.interpose = picks.interpose;
	return r;
}

export function openHpCalculator(
	anchor: HTMLElement,
	c: EncounterCreature,
	autoArmor: boolean,
	apply: (cmd: HpCommand, react: HeroReaction) => void,
	opts: { start?: 'damage' | 'heal'; friends?: EncounterCreature[]; label?: string } = {},
): void {
	// The name as the tracker shows it (a lone monster without its number).
	const name = opts.label ?? c.label;
	const minions = isMinionGroup(c);
	const hero = isHero(c);
	const modes: Partial<Record<Mode, HpPadModeInfo>> = minions
		? {
			damage: { label: 'Hit', sign: '−', verb: n => `Hit for ${n}` },
			heal: { label: 'Bring back', sign: '+', verb: n => `Bring back ${n}` },
			set: { label: 'Set', sign: '=', verb: n => `Set ${n} standing` },
		}
		: {
			damage: { label: 'Damage', sign: '−', verb: n => `Deal ${n} damage` },
			heal: { label: 'Heal', sign: '+', verb: n => `Heal ${n}` },
			set: { label: 'Set', sign: '=', verb: n => `Set HP to ${n}` },
			temp: { label: 'Temp', sign: 't', verb: n => `Give ${n} temp HP` },
		};
	const friends = opts.friends ?? [];
	const quick: HpPadQuick[] = hero ? [
		{ id: 'defend', text: 'Defend', sub: c.defense !== undefined ? `−${c.defense} · 1 action` : '1 action' },
		...(friends.length ? [{ id: 'interpose', text: 'Interpose', sub: 'a friend takes it', choices: friends.map(f => ({ id: f.id, text: f.label })) }] : []),
	] : [];

	openHpPad(anchor, {
		id: c.id,
		label: name,
		system: 'nimble',
		start: opts.start,
		sub: minions
			? `${c.alive} of ${c.count} standing · any hit drops one`
			: `HP ${c.currentHp} of ${c.maxHp}${c.tempHp ? ` +${c.tempHp} temp` : ''}${!hero && c.monster.armor !== 'none' ? ` · ${c.monster.armor === 'medium' ? 'Medium' : 'Heavy'} armor` : ''}`,
		modes,
		// Minions can't crit; heroes and minions have no vulnerable/resisted (armor is a monster's).
		crit: !minions,
		mods: !minions && !hero ? { vulnerable: 'Vulnerable +10', resisted: 'Resisted −10' } : null,
		quick: quick.length ? { label: `If ${name} says so at the table`, items: quick } : null,
		command: (mode, v, crit, mod) => {
			if (mode === 'damage') return minions ? { kind: 'damage', amount: Math.max(1, v), crit: false } : v > 0 ? { kind: 'damage', amount: v, crit, type: mod } : null;
			if (mode === 'heal') return v > 0 || minions ? { kind: 'heal', amount: Math.max(1, v) } : null;
			if (mode === 'set') return { kind: 'set', amount: v };
			if (mode === 'temp') return v > 0 ? { kind: 'temp', amount: v } : null;
			return null;
		},
		preview: (mode, v, crit, mod, picks) => previewText(c, mode, v, crit, mod, autoArmor, reactionOf(picks), friends),
		sideOf: anchor.closest<HTMLElement>('.nimble-encounter-tracker'),
		apply: (cmd, picks) => apply(cmd, reactionOf(picks)),
	});
}

export function previewText(c: EncounterCreature, mode: Mode, v: number, crit: boolean, mod: DamageMod | undefined, autoArmor: boolean, react: HeroReaction = {}, friends: EncounterCreature[] = []): string {
	if (isMinionGroup(c)) {
		const alive = c.alive ?? 0;
		if (mode === 'damage') return `Drops at least 1 of ${alive}`;
		if (mode === 'heal') return `${Math.min(c.count ?? 0, alive + Math.max(1, v))} of ${c.count} standing`;
		return `${Math.min(c.count ?? 0, v)} of ${c.count} standing`;
	}
	if (!v && mode !== 'set') return react.interpose === '' ? 'Who steps in?' : '';
	if (mode === 'heal') return `→ ${Math.min(c.maxHp, c.currentHp + v)}/${c.maxHp}`;
	if (mode === 'set') return `→ ${Math.min(c.maxHp, v)}/${c.maxHp}`;
	if (mode === 'temp') return `→ ${c.currentHp}/${c.maxHp} +${v} temp`;
	if (isHero(c)) {
		const friend = react.interpose ? friends.find(f => f.id === react.interpose) : undefined;
		const t = friend ?? c;
		const amount = react.defend ? defendedDamage(v, t.defense, crit) : v;
		const who = friend ? `${friend.label} takes it: ` : '';
		const defend = react.defend ? (crit ? 'crit: Armor doesn\'t help · ' : `${v} − ${t.defense ?? 0} = ${amount} · `) : '';
		if (t.currentHp <= 0) return `${who}${defend}hit while Dying: +${crit ? 3 : 2} Wounds`;
		const left = Math.max(0, t.currentHp + (t.tempHp ?? 0) - amount);
		return `${who}${defend}${left <= 0 ? `drops ${t.label} to 0: Dying, +1 Wound` : `→ ${Math.min(left, t.currentHp)}/${t.maxHp}`}`;
	}
	// The store's own maths (armor, then temp HP), so the preview is what Apply does.
	const r = monsterHit(c, v, crit, { autoArmor, mod });
	let text = `${r.breakdown}${r.absorbed ? ` − ${r.absorbed} temp` : ''} → ${r.hp}/${c.maxHp}`;
	if (monsterRole(c.monster) === 'legendary' && r.hp <= c.maxHp / 2 && c.currentHp > c.maxHp / 2) text += ' · Bloodied';
	return text;
}

export { closePopover as closeHpCalculator };

export type ManaCommand = { kind: 'spend' | 'regain' | 'set'; amount: number };

/**
 * The same keypad for a hero's mana: Spend, Regain or Set, an amount, and a
 * preview of where it lands ("5 → 2 of 8 mana"). Opened from the character sheet.
 */
export function openManaCalculator(anchor: HTMLElement, hero: { name: string; mana: number; max: number }, apply: (cmd: ManaCommand) => void): void {
	const kind = (m: Mode): ManaCommand['kind'] => m === 'damage' ? 'spend' : m === 'heal' ? 'regain' : 'set';
	const command = (m: Mode, v: number): ManaCommand | null => {
		const k = kind(m);
		if (k === 'set') return { kind: 'set', amount: v };
		if (v <= 0) return null;
		if (k === 'spend' && v > hero.mana) return null;
		return { kind: k, amount: v };
	};
	openHpPad(anchor, {
		id: `mana-${hero.name}`,
		label: hero.name,
		system: 'nimble',
		cls: 'nimble-mana-pad',
		sub: `${hero.mana}/${hero.max} mana`,
		modes: {
			damage: { label: 'Spend', sign: '−', verb: n => `Spend ${n} mana` },
			heal: { label: 'Regain', sign: '+', verb: n => `Regain ${n} mana` },
			set: { label: 'Set', sign: '=', verb: n => `Set mana to ${n}` },
		},
		crit: false,
		// The pad speaks HP commands; mana rides on them and is read back in apply.
		command: (m, v) => {
			const cmd = command(m, v);
			if (!cmd) return null;
			return cmd.kind === 'spend' ? { kind: 'damage', amount: cmd.amount, crit: false } : cmd.kind === 'regain' ? { kind: 'heal', amount: cmd.amount } : { kind: 'set', amount: cmd.amount };
		},
		preview: (m, v) => {
			const k = kind(m);
			if (k === 'spend' && v > hero.mana) return `Only ${hero.mana} mana left`;
			if (!v && k !== 'set') return '';
			const after = k === 'spend' ? hero.mana - v : k === 'regain' ? Math.min(hero.max, hero.mana + v) : Math.min(hero.max, v);
			return `${hero.mana} → ${Math.max(0, after)} of ${hero.max} mana`;
		},
		apply: (cmd) => {
			if (cmd.kind === 'damage') apply({ kind: 'spend', amount: cmd.amount });
			else if (cmd.kind === 'heal') apply({ kind: 'regain', amount: cmd.amount });
			else if (cmd.kind === 'set') apply({ kind: 'set', amount: cmd.amount });
		},
	});
}
