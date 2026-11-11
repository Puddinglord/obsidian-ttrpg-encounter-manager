// Encounter state and every mutation of it. Views subscribe to 'changed' and
// re-render; nothing here touches the DOM. The rules themselves live in rules.ts.

import { Events } from 'obsidian';
import {
	AppliedCondition, Encounter, EncounterCreature, EncounterPhase, NimbleMonster, NimbleStatblocksSettings, PartyMember, Side, uid,
} from './types';
import {
	DamageMod, HpCommand, heroDamage, lastStandEffect, minionDie, minionKills, monsterDamage, monsterRole, parseHpCommand, scaledHp, tickConditions,
	shiftMonster,
} from './rules';

export type HpThreshold = 'bloodied' | 'last-stand' | 'recovered' | null;

const LOG_LIMIT = 200;

/** Next free "<name>-N" label, so removing Goblin-1 never yields two Goblin-3s. */
export function nextLabel(existing: string[], name: string): string {
	const prefix = `${name}-`;
	let max = 0;
	for (const label of existing) {
		if (!label.startsWith(prefix)) continue;
		const n = Number(label.slice(prefix.length));
		if (Number.isInteger(n) && n > max) max = n;
	}
	return `${name}-${max + 1}`;
}

/**
 * Parse quick HP entry without any armor rules. "7" or "-7" is damage, "+7"
 * heals, "=20" sets HP. Returns the new HP (clamped) or null.
 */
export function applyHpInput(input: string, current: number, max: number): number | null {
	const cmd = parseHpCommand(input);
	if (!cmd) return null;
	let next: number;
	if (cmd.kind === 'heal') next = current + cmd.amount;
	else if (cmd.kind === 'set') next = cmd.amount;
	else if (cmd.kind === 'temp') return null;
	else next = current - cmd.amount;
	return Math.max(0, Math.min(max, next));
}

/** Which legendary phase boundary (if any) an HP change crossed. */
export function crossedThreshold(before: number, after: number, max: number): HpThreshold {
	const half = max / 2;
	if (after === 0 && before > 0) return 'last-stand';
	if (after <= half && before > half) return 'bloodied';
	if (after > half && before <= half) return 'recovered';
	return null;
}

/**
 * What a hit does to a monster: armor first, then temp HP soaks what's left.
 * The store applies this and the HP pad previews it, so the two always agree.
 */
export function monsterHit(c: Pick<EncounterCreature, 'monster' | 'currentHp' | 'tempHp'>, amount: number, crit: boolean, opts: { autoArmor: boolean; mod?: DamageMod }): {
	/** After armor and Vulnerable/Resisted. */
	applied: number;
	/** Soaked by temp HP. */
	absorbed: number;
	/** What actually comes off HP. */
	taken: number;
	hp: number;
	breakdown: string;
} {
	const r = monsterDamage(c.monster.armor, amount, crit, opts);
	const absorbed = Math.min(c.tempHp ?? 0, r.applied);
	const taken = r.applied - absorbed;
	return { applied: r.applied, absorbed, taken, hp: Math.max(0, c.currentHp - taken), breakdown: r.breakdown };
}

/** True when loading something else over this encounter would lose a fight: it has started, was ended mid-way, or someone is hurt. */
export function fightInProgress(enc: Encounter | null | undefined): boolean {
	if (!enc || !enc.creatures.length) return false;
	if ((enc.phase && enc.phase !== 'setup') || enc.paused) return true;
	return enc.creatures.some(c => isMinionGroup(c) ? (c.alive ?? 0) < (c.count ?? 0) : c.currentHp < c.maxHp || (c.wounds ?? 0) > 0);
}

/**
 * Whether two encounter states are the same fight at different moments.
 * Combatant ids survive saving and restoring, and are new for every freshly
 * loaded encounter, so they tell fights apart even in single-encounter mode,
 * where every encounter shares one id.
 */
export function sameFight(a: Encounter, b: Encounter): boolean {
	if (!a.creatures?.length || !b.creatures?.length) return a.id === b.id && !a.creatures?.length === !b.creatures?.length;
	const ids = new Set(a.creatures.map(c => c.id));
	return b.creatures.some(c => ids.has(c.id));
}

export const isMinionGroup = (c: EncounterCreature) => c.count !== undefined;
export const isHero = (c: EncounterCreature) => c.side === 'hero';
/** A legendary monster at 0 HP whose Last Stand hasn't been played yet is still in the fight. */
export const awaitingLastStand = (c: EncounterCreature) =>
	!isHero(c) && !isMinionGroup(c) && c.currentHp <= 0 && !!c.monster.lastStand && !c.lastStand && monsterRole(c.monster) === 'legendary';
export const isDown = (c: EncounterCreature) =>
	isMinionGroup(c) ? (c.alive ?? 0) <= 0 : isHero(c) ? (c.wounds ?? 0) >= (c.maxWounds ?? 6) : c.currentHp <= 0 && !awaitingLastStand(c);

export interface HpResult {
	crossed: HpThreshold;
	/** Working shown to the GM: "15 − 10 (Medium armor) = 5". */
	breakdown?: string;
	events: string[];
}

export interface EncounterTemplate {
	name: string;
	monsters: { monster: NimbleMonster; count: number; sourceFile?: string }[];
	/** Add the party's heroes too. */
	withParty?: boolean;
}

export class EncounterStore extends Events {
	constructor(private settings: () => NimbleStatblocksSettings, private persist: () => Promise<void>,
		private defaults: () => { level: number; heroes: number } = () => ({ level: 1, heroes: 4 })) {
		super();
	}

	private get s() { return this.settings(); }

	private commit(): void {
		void this.persist();
		this.trigger('changed');
	}

	get encounters(): Encounter[] { return this.s.encounters; }

	get active(): Encounter | null {
		const id = this.s.activeEncounterId;
		return (id && this.s.encounters.find(e => e.id === id)) || null;
	}

	/** Heroes in the party, or the default size when no party is set up. */
	partySize(enc?: Encounter | null): number {
		const heroesHere = enc?.creatures.filter(isHero).length ?? 0;
		return heroesHere || this.s.party.length || this.defaults().heroes || this.s.defaultPartySize || 4;
	}

	/** In single-encounter mode there is always exactly one active encounter. */
	ensureActive(): Encounter | null {
		if (this.s.multipleEncounters) return this.active;
		if (this.s.encounters.length === 0) {
			this.s.encounters = [this.blank('Current Encounter', 'single-encounter')];
			this.s.activeEncounterId = 'single-encounter';
			void this.persist();
		} else if (!this.active) {
			this.s.activeEncounterId = this.s.encounters[0].id;
			void this.persist();
		}
		return this.active;
	}

	private blank(name: string, id = uid()): Encounter {
		return { id, name, creatures: [], round: 1, phase: 'setup', log: [] };
	}

	setActive(id: string | null): void {
		this.s.activeEncounterId = id;
		this.commit();
	}

	create(name: string): Encounter {
		const enc = this.blank(name);
		this.s.encounters.push(enc);
		this.s.activeEncounterId = enc.id;
		this.commit();
		return enc;
	}

	delete(id: string): void {
		this.s.encounters = this.s.encounters.filter(e => e.id !== id);
		if (this.s.activeEncounterId === id) this.s.activeEncounterId = this.s.encounters[0]?.id ?? null;
		this.commit();
	}

	clear(encId: string): void {
		const enc = this.find(encId);
		if (!enc) return;
		enc.creatures = [];
		enc.round = 1;
		enc.phase = 'setup';
		enc.log = [];
		delete enc.paused; // or the emptied encounter would still offer "Resume round N"
		this.commit();
	}

	rename(encId: string, name: string): void {
		const enc = this.find(encId);
		if (!enc || !name.trim()) return;
		enc.name = name.trim();
		this.commit();
	}

	find(encId: string): Encounter | undefined {
		return this.s.encounters.find(e => e.id === encId);
	}

	creature(encId: string, creatureId: string): EncounterCreature | undefined {
		return this.find(encId)?.creatures.find(c => c.id === creatureId);
	}

	// ------------------------------------------------------------------------
	// Adding combatants

	private newMonster(enc: Encounter, monster: NimbleMonster, sourceFile?: string): EncounterCreature {
		const hp = scaledHp(monster, this.partySize(enc));
		return {
			id: uid(),
			side: 'monster',
			monster: JSON.parse(JSON.stringify(monster)) as NimbleMonster,
			label: nextLabel(enc.creatures.map(c => c.label), monster.name),
			currentHp: hp,
			maxHp: hp,
			sourceFile,
			conditions: [],
		};
	}

	/** Adds `count` of a monster to an encounter (the active one by default). Minions join one group. */
	add(monster: NimbleMonster, sourceFile?: string, count = 1, encId?: string): EncounterCreature[] {
		const enc = encId ? this.find(encId) : this.ensureActive();
		if (!enc || count <= 0) return [];
		const added: EncounterCreature[] = [];
		if (monsterRole(monster) === 'minion') {
			let group = enc.creatures.find(c => isMinionGroup(c) && c.monster.name === monster.name);
			if (group) {
				group.count = (group.count ?? 0) + count;
				group.alive = (group.alive ?? 0) + count;
			} else {
				group = {
					...this.newMonster(enc, monster, sourceFile),
					label: monster.name,
					count,
					alive: count,
				};
				enc.creatures.push(group);
			}
			group.currentHp = group.alive!;
			group.maxHp = group.count!;
			this.log(enc, `${count} × ${monster.name} join${count === 1 ? 's' : ''} the fight`, false);
			added.push(group);
		} else {
			for (let i = 0; i < count; i++) {
				const c = this.newMonster(enc, monster, sourceFile);
				enc.creatures.push(c);
				added.push(c);
			}
			if (enc.phase && enc.phase !== 'setup') this.log(enc, `${added.map(c => c.label).join(', ')} join${added.length === 1 ? 's' : ''} the fight`, false);
		}
		this.commit();
		return added;
	}

	addHero(member: PartyMember, encId?: string): EncounterCreature | null {
		const enc = encId ? this.find(encId) : this.ensureActive();
		if (!enc) return null;
		const existing = enc.creatures.find(c => c.heroId === member.id);
		if (existing) return existing;
		const hero: EncounterCreature = {
			id: uid(),
			side: 'hero',
			heroId: member.id,
			monster: { name: member.name, armor: 'none', hp: member.maxHp, movement: '6', type: member.className, level: member.level },
			label: member.name,
			currentHp: member.maxHp,
			maxHp: member.maxHp,
			conditions: [],
			wounds: 0,
			maxWounds: member.maxWounds || 6,
			actions: 3,
			defense: member.defense,
		};
		// Heroes act first in Nimble, so keep them at the top.
		const firstMonster = enc.creatures.findIndex(c => !isHero(c));
		if (firstMonster === -1) enc.creatures.push(hero);
		else enc.creatures.splice(firstMonster, 0, hero);
		this.commit();
		return hero;
	}

	/** Adds every party member who isn't already in the encounter. */
	addParty(encId?: string): number {
		let n = 0;
		for (const m of this.s.party) {
			const enc = encId ? this.find(encId) : this.ensureActive();
			if (enc && !enc.creatures.some(c => c.heroId === m.id)) { this.addHero(m, encId); n++; }
		}
		return n;
	}

	/** Load a prepared encounter: a new tracker encounter (multi mode) or a fresh active one (single mode). */
	loadTemplate(t: EncounterTemplate, sourcePath?: string): Encounter | null {
		let enc: Encounter | null;
		if (this.s.multipleEncounters) {
			enc = this.blank(t.name);
			this.s.encounters.push(enc);
			this.s.activeEncounterId = enc.id;
		} else {
			enc = this.ensureActive();
			if (!enc) return null;
			Object.assign(enc, this.blank(t.name, enc.id));
			delete enc.paused;
		}
		enc.sourcePath = sourcePath;
		if (t.withParty) for (const m of this.s.party) this.addHero(m, enc.id);
		for (const g of t.monsters) this.add(g.monster, g.sourceFile, g.count, enc.id);
		this.log(enc, `Encounter loaded: ${t.name}`, false);
		this.commit();
		return enc;
	}

	remove(encId: string, creatureId: string): void {
		const enc = this.find(encId);
		if (!enc) return;
		enc.creatures = enc.creatures.filter(c => c.id !== creatureId);
		this.commit();
	}

	renameCreature(encId: string, creatureId: string, label: string): void {
		const c = this.creature(encId, creatureId);
		if (!c || !label.trim()) return;
		c.label = label.trim();
		this.commit();
	}

	/** @deprecated kept for older callers; use renameCreature */
	renameLabel(encId: string, creatureId: string, label: string): void {
		this.renameCreature(encId, creatureId, label);
	}

	/** Make a monster tougher or weaker by a level; current HP scales in proportion. */
	shiftLevel(encId: string, creatureId: string, delta: number): void {
		const c = this.creature(encId, creatureId);
		if (!c || isHero(c) || isMinionGroup(c)) return;
		const before = c.maxHp || 1;
		c.monster = shiftMonster(c.monster, delta);
		const enc = this.find(encId);
		c.maxHp = c.monster.hpPerHero ? scaledHp(c.monster, this.partySize(enc)) : c.monster.hp;
		c.currentHp = Math.max(0, Math.round(c.currentHp * (c.maxHp / before)));
		if (enc) this.log(enc, `${c.label} is now ${delta > 0 ? 'tougher' : 'weaker'} (level ${c.monster.level})`, false);
		this.commit();
	}

	duplicate(encId: string, creatureId: string): EncounterCreature | null {
		const c = this.creature(encId, creatureId);
		if (!c || isHero(c)) return null;
		return this.add(c.monster, c.sourceFile, 1, encId)[0] ?? null;
	}

	// ------------------------------------------------------------------------
	// HP

	/** Sets HP directly (no armor rules) and reports which phase was crossed. */
	setHp(encId: string, creatureId: string, hp: number): HpThreshold {
		const c = this.creature(encId, creatureId);
		if (!c) return null;
		const before = c.currentHp;
		c.currentHp = Math.max(0, Math.min(c.maxHp, Math.round(hp)));
		if (isMinionGroup(c)) c.alive = c.currentHp;
		this.commit();
		return crossedThreshold(before, c.currentHp, c.maxHp);
	}

	adjustHp(encId: string, creatureId: string, delta: number): HpThreshold {
		const c = this.creature(encId, creatureId);
		if (!c) return null;
		return this.setHp(encId, creatureId, c.currentHp + delta);
	}

	/** Apply a typed command ("12", "12!", "+5", "=20", "t5") with Nimble rules for this combatant. */
	applyHp(encId: string, creatureId: string, cmd: HpCommand): HpResult {
		const enc = this.find(encId);
		const c = enc?.creatures.find(x => x.id === creatureId);
		if (!enc || !c) return { crossed: null, events: [] };
		const events: string[] = [];
		let breakdown: string | undefined;
		const before = c.currentHp;

		if (isMinionGroup(c)) {
			const alive = c.alive ?? 0;
			if (cmd.kind === 'damage') {
				const die = minionDie(c.monster);
				const kills = Math.min(alive, minionKills(cmd.amount, die, this.s.minionOverkill));
				c.alive = alive - kills;
				breakdown = kills > 1 ? `${cmd.amount} damage ÷ d${die} = ${kills} down` : kills === 1 ? '1 down' : undefined;
				if (kills) events.push(`${kills} ${c.monster.name}${kills === 1 ? '' : 's'} down (${c.alive} left)`);
			} else if (cmd.kind === 'heal') {
				c.alive = Math.min(c.count ?? 0, alive + cmd.amount);
			} else if (cmd.kind === 'set') {
				c.alive = Math.max(0, Math.min(c.count ?? 0, cmd.amount));
			}
			c.currentHp = c.alive ?? 0;
		} else if (isHero(c)) {
			if (cmd.kind === 'damage') {
				let amount = cmd.amount;
				if (c.tempHp) {
					const absorbed = Math.min(c.tempHp, amount);
					c.tempHp -= absorbed;
					amount -= absorbed;
				}
				const r = heroDamage(c.currentHp, c.wounds ?? 0, c.maxWounds ?? 6, amount, cmd.crit);
				c.currentHp = r.hp;
				c.wounds = r.wounds;
				events.push(...r.events.map(e => `${c.label} ${e}`));
				if (!r.events.length) events.push(`${c.label} takes ${amount}${cmd.crit ? ' (crit)' : ''} → ${c.currentHp}/${c.maxHp}`);
			} else if (cmd.kind === 'heal') {
				const was = c.currentHp;
				c.currentHp = Math.min(c.maxHp, c.currentHp + cmd.amount);
				events.push(`${c.label} heals ${c.currentHp - was}${was === 0 && c.currentHp > 0 ? ' and is no longer Dying' : ''}`);
			} else if (cmd.kind === 'set') {
				c.currentHp = Math.max(0, Math.min(c.maxHp, cmd.amount));
			} else if (cmd.kind === 'temp') {
				c.tempHp = cmd.amount;
			}
		} else {
			if (cmd.kind === 'damage') {
				const r = monsterHit(c, cmd.amount, cmd.crit, { autoArmor: this.s.autoArmor, mod: cmd.type });
				const amount = r.taken;
				if (c.tempHp) c.tempHp -= r.absorbed;
				c.currentHp = r.hp;
				breakdown = r.breakdown !== String(r.applied) ? r.breakdown : undefined;
				events.push(`${c.label} takes ${amount}${cmd.crit ? ' (crit)' : ''}${breakdown ? ` [${breakdown}]` : ''} → ${c.currentHp}/${c.maxHp}`);
				if (c.currentHp === 0 && before > 0 && !(monsterRole(c.monster) === 'legendary' && c.monster.lastStand && !c.lastStand)) {
					events.push(`${c.label} is defeated`);
				}
			} else if (cmd.kind === 'heal') {
				c.currentHp = Math.min(c.maxHp, c.currentHp + cmd.amount);
				events.push(`${c.label} regains ${cmd.amount} → ${c.currentHp}/${c.maxHp}`);
			} else if (cmd.kind === 'set') {
				c.currentHp = Math.max(0, Math.min(c.maxHp, cmd.amount));
			} else if (cmd.kind === 'temp') {
				c.tempHp = cmd.amount;
			}
		}

		for (const e of events) this.log(enc, e, false);
		const crossed = isMinionGroup(c) || isHero(c) ? null : crossedThreshold(before, c.currentHp, c.maxHp);
		if (crossed === 'bloodied') this.log(enc, `${c.label} is Bloodied`, false);
		if (crossed === 'last-stand' && c.monster.lastStand && !c.lastStand) this.log(enc, `${c.label} reaches 0 HP: Last Stand`, false);
		this.commit();
		return { crossed, breakdown, events };
	}

	setAlive(encId: string, creatureId: string, alive: number): void {
		const c = this.creature(encId, creatureId);
		if (!c || !isMinionGroup(c)) return;
		c.alive = Math.max(0, Math.min(c.count ?? 0, alive));
		c.currentHp = c.alive;
		this.commit();
	}

	/** Legendary at 0 HP: apply what its Last Stand text says (regain HP per hero, or a final damage pool). */
	applyLastStand(encId: string, creatureId: string): string | null {
		const enc = this.find(encId);
		const c = enc?.creatures.find(x => x.id === creatureId);
		if (!enc || !c || c.lastStand) return null; // a Last Stand happens once
		const effect = lastStandEffect(c.monster.lastStand, this.partySize(enc));
		c.lastStand = true;
		let msg = `${c.label} makes a Last Stand`;
		if (effect) {
			c.currentHp = effect.hp;
			c.maxHp = Math.max(c.maxHp, effect.hp);
			if (effect.kind === 'pool' && effect.armor) c.monster.armor = effect.armor;
			msg += effect.kind === 'regain' ? ` and regains ${effect.hp} HP` : ` (${effect.hp} more damage to finish${effect.armor ? `, now ${effect.armor} armor` : ''})`;
		}
		this.log(enc, msg, false);
		this.commit();
		return msg;
	}

	// ------------------------------------------------------------------------
	// Heroes

	setWounds(encId: string, creatureId: string, wounds: number): void {
		const c = this.creature(encId, creatureId);
		if (!c) return;
		c.wounds = Math.max(0, Math.min(c.maxWounds ?? 6, wounds));
		this.commit();
	}

	setActions(encId: string, creatureId: string, actions: number): void {
		const c = this.creature(encId, creatureId);
		if (!c) return;
		c.actions = Math.max(0, Math.min(3, actions));
		this.commit();
	}

	setNote(encId: string, creatureId: string, note: string): void {
		const c = this.creature(encId, creatureId);
		if (!c) return;
		c.note = note.trim() || undefined;
		this.commit();
	}

	// ------------------------------------------------------------------------
	// Conditions

	addCondition(encId: string, creatureId: string, name: string, opts: { rounds?: number; value?: number } = {}): void {
		const enc = this.find(encId);
		const c = enc?.creatures.find(x => x.id === creatureId);
		if (!enc || !c) return;
		const applied: AppliedCondition = { name };
		if (opts.rounds && opts.rounds > 0) applied.rounds = opts.rounds;
		if (opts.value !== undefined) applied.value = opts.value;
		const i = c.conditions.findIndex(x => x.name === name);
		if (i === -1) c.conditions.push(applied);
		else c.conditions[i] = applied;
		this.log(enc, `${c.label} is ${name}${opts.value !== undefined ? ` ${opts.value}` : ''}${applied.rounds ? ` (${applied.rounds} round${applied.rounds === 1 ? '' : 's'})` : ''}`, false);
		this.commit();
	}

	removeCondition(encId: string, creatureId: string, name: string): void {
		const enc = this.find(encId);
		const c = enc?.creatures.find(x => x.id === creatureId);
		if (!enc || !c || !c.conditions.some(x => x.name === name)) return;
		c.conditions = c.conditions.filter(x => x.name !== name);
		this.log(enc, `${c.label} is no longer ${name}`, false);
		this.commit();
	}

	updateCondition(encId: string, creatureId: string, name: string, patch: { rounds?: number | null; value?: number | null }): void {
		const c = this.creature(encId, creatureId);
		const cond = c?.conditions.find(x => x.name === name);
		if (!cond) return;
		if (patch.rounds !== undefined) {
			if (patch.rounds === null || patch.rounds <= 0) delete cond.rounds;
			else cond.rounds = patch.rounds;
			delete cond.tickedRound;
		}
		if (patch.value !== undefined) {
			if (patch.value === null) delete cond.value;
			else cond.value = patch.value;
		}
		this.commit();
	}

	/** Compatibility helper: on/off with no duration. */
	toggleCondition(encId: string, creatureId: string, name: string, on: boolean): void {
		const has = !!this.creature(encId, creatureId)?.conditions.some(x => x.name === name);
		if (on === has) return;
		if (on) this.addCondition(encId, creatureId, name);
		else this.removeCondition(encId, creatureId, name);
	}

	// ------------------------------------------------------------------------
	// Turns and rounds (Nimble: heroes act first, in any order; then the monsters)

	setPhase(encId: string, phase: EncounterPhase): void {
		const enc = this.find(encId);
		if (!enc || enc.phase === phase) return;
		enc.phase = phase;
		if (phase === 'heroes') this.log(enc, `Round ${enc.round ?? 1}: heroes' turn`, false);
		if (phase === 'monsters') this.log(enc, `Round ${enc.round ?? 1}: monsters' turn`, false);
		this.commit();
	}

	/** Pick an ended fight back up at the round and turn it stopped on. */
	resume(encId: string): boolean {
		const enc = this.find(encId);
		if (!enc?.paused) return false;
		enc.round = enc.paused.round;
		enc.phase = enc.paused.phase;
		delete enc.paused;
		this.log(enc, `Combat resumes. Round ${enc.round}: ${enc.phase === 'heroes' ? 'heroes\'' : 'monsters\''} turn`, false);
		this.commit();
		return true;
	}

	/**
	 * Put a saved fight back in the tracker exactly as it was: a new encounter
	 * in multi mode, or the active one in single mode.
	 */
	restore(snapshot: Encounter): Encounter | null {
		const copy = JSON.parse(JSON.stringify(snapshot)) as Encounter;
		let enc: Encounter | null;
		if (this.s.multipleEncounters) {
			enc = { ...copy, id: uid() };
			this.s.encounters.push(enc);
			this.s.activeEncounterId = enc.id;
		} else {
			enc = this.ensureActive();
			if (!enc) return null;
			Object.assign(enc, copy, { id: enc.id });
			if (!copy.paused) delete enc.paused;
		}
		enc.creatures = enc.creatures || [];
		enc.log = enc.log || [];
		this.log(enc, `Fight restored from a saved note (round ${enc.round ?? 1})`, false);
		this.commit();
		return enc;
	}

	/** Start combat: round 1, heroes first. */
	start(encId: string): void {
		const enc = this.find(encId);
		if (!enc) return;
		delete enc.paused;
		enc.round = 1;
		for (const c of enc.creatures) c.done = false;
		enc.phase = 'heroes';
		this.log(enc, 'Combat starts. Round 1: heroes\' turn', false);
		this.commit();
	}

	/** End combat: back to setup. Combatants, HP and the log stay. Returns the rounds fought. */
	end(encId: string): number {
		const enc = this.find(encId);
		if (!enc || !enc.phase || enc.phase === 'setup') return 0;
		const rounds = enc.round ?? 1;
		enc.paused = { round: rounds, phase: enc.phase };
		enc.phase = 'setup';
		for (const c of enc.creatures) c.done = false;
		this.log(enc, `Combat ends after ${rounds} round${rounds === 1 ? '' : 's'}`, false);
		this.commit();
		return rounds;
	}

	/** Mark a combatant's turn done (or undo it). Ending a turn counts its conditions down. Returns expired condition names. */
	setDone(encId: string, creatureId: string, done: boolean): string[] {
		const enc = this.find(encId);
		const c = enc?.creatures.find(x => x.id === creatureId);
		if (!enc || !c) return [];
		c.done = done;
		let expired: string[] = [];
		if (done) {
			const r = tickConditions(c.conditions, enc.round ?? 1);
			c.conditions = r.kept;
			expired = r.expired;
			if (isHero(c)) c.actions = 3; // heroes regain all 3 actions at the end of their turn
			this.log(enc, `${c.label} ${isMinionGroup(c) ? 'have' : 'has'} gone${expired.length ? `; ${expired.join(', ')} wore off` : ''}`, false);
			// Once every hero has gone, it's the monsters' turn.
			const heroes = enc.creatures.filter(isHero).filter(h => !isDown(h));
			if (enc.phase === 'heroes' && heroes.length && heroes.every(h => h.done)) {
				enc.phase = 'monsters';
				this.log(enc, `Round ${enc.round ?? 1}: monsters' turn`, false);
			}
		}
		this.commit();
		return expired;
	}

	/** Next round: anyone who didn't mark their turn still ticks conditions; everyone is ready again. */
	nextRound(encId: string): string[] {
		const enc = this.find(encId);
		if (!enc) return [];
		const round = enc.round ?? 1;
		const expiredAll: string[] = [];
		for (const c of enc.creatures) {
			if (!c.done) {
				const r = tickConditions(c.conditions, round);
				c.conditions = r.kept;
				if (r.expired.length) expiredAll.push(...r.expired.map(n => `${c.label}: ${n}`));
			}
			c.done = false;
		}
		enc.round = round + 1;
		enc.phase = 'heroes';
		this.log(enc, `Round ${enc.round} begins${expiredAll.length ? `; wore off: ${expiredAll.join(', ')}` : ''}`, false);
		this.commit();
		return expiredAll;
	}

	setRound(encId: string, round: number): void {
		const enc = this.find(encId);
		if (!enc) return;
		enc.round = Math.max(1, round);
		this.commit();
	}

	reorder(encId: string, draggedId: string, targetId: string): void {
		const enc = this.find(encId);
		if (!enc) return;
		const from = enc.creatures.findIndex(c => c.id === draggedId);
		const to = enc.creatures.findIndex(c => c.id === targetId);
		if (from === -1 || to === -1 || from === to) return;
		const [moved] = enc.creatures.splice(from, 1);
		enc.creatures.splice(to, 0, moved);
		this.commit();
	}

	// ------------------------------------------------------------------------
	// Log and summary

	log(enc: Encounter, text: string, save = true): void {
		enc.log = [{ round: enc.round ?? 1, text, time: Date.now() }, ...(enc.log || [])].slice(0, LOG_LIMIT);
		if (save) this.commit();
	}

	/** One paragraph a GM can paste into session notes. */
	summary(encId: string): string {
		const enc = this.find(encId);
		if (!enc) return '';
		const monsters = enc.creatures.filter(c => !isHero(c));
		const down: string[] = [];
		const standing: string[] = [];
		for (const c of monsters) {
			if (isMinionGroup(c)) {
				const dead = (c.count ?? 0) - (c.alive ?? 0);
				if (dead) down.push(`${dead} ${c.monster.name}${dead === 1 ? '' : 's'}`);
				if (c.alive) standing.push(`${c.alive} ${c.monster.name}${c.alive === 1 ? '' : 's'}`);
			} else if (c.currentHp <= 0) down.push(c.label);
			else standing.push(`${c.label} (${c.currentHp}/${c.maxHp})`);
		}
		const heroes = enc.creatures.filter(isHero).filter(h => (h.wounds ?? 0) > 0).map(h => `${h.label} ${h.wounds} Wound${h.wounds === 1 ? '' : 's'}`);
		const parts = [`**${enc.name}**: ${enc.round ?? 1} round${(enc.round ?? 1) === 1 ? '' : 's'}.`];
		if (down.length) parts.push(`Defeated: ${down.join(', ')}.`);
		if (standing.length) parts.push(`Still standing: ${standing.join(', ')}.`);
		if (heroes.length) parts.push(`Hero Wounds: ${heroes.join(', ')}.`);
		return parts.join(' ');
	}

	/** Sides in display order: heroes, then monsters. */
	static sides(enc: Encounter): { side: Side; creatures: EncounterCreature[] }[] {
		return [
			{ side: 'hero', creatures: enc.creatures.filter(isHero) },
			{ side: 'monster', creatures: enc.creatures.filter(c => !isHero(c)) },
		];
	}
}
