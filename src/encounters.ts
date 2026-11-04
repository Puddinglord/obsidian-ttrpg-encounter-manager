// Encounter state and every mutation of it. Views subscribe to 'changed' and
// re-render; nothing here touches the DOM.

import { Events } from 'obsidian';
import { Encounter, EncounterCreature, NimbleMonster, NimbleStatblocksSettings, uid } from './types';

export type HpThreshold = 'bloodied' | 'last-stand' | 'recovered' | null;

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
 * Parse quick HP entry. "7" or "-7" is damage, "+7" heals, "=20" sets HP.
 * Returns the new HP (clamped) or null when the input isn't understood.
 */
export function applyHpInput(input: string, current: number, max: number): number | null {
	const s = input.trim().replace('−', '-');
	const m = s.match(/^([+\-=]?)\s*(\d+)$/);
	if (!m) return null;
	const n = parseInt(m[2], 10);
	let next: number;
	if (m[1] === '+') next = current + n;
	else if (m[1] === '=') next = n;
	else next = current - n;
	return Math.max(0, Math.min(max, next));
}

/** Which solo phase boundary (if any) an HP change crossed. */
export function crossedThreshold(before: number, after: number, max: number): HpThreshold {
	const half = max / 2;
	if (after === 0 && before > 0) return 'last-stand';
	if (after <= half && before > half) return 'bloodied';
	if (after > half && before <= half) return 'recovered';
	return null;
}

export class EncounterStore extends Events {
	constructor(private settings: () => NimbleStatblocksSettings, private persist: () => Promise<void>) {
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

	/** In single-encounter mode there is always exactly one active encounter. */
	ensureActive(): Encounter | null {
		if (this.s.multipleEncounters) return this.active;
		if (this.s.encounters.length === 0) {
			this.s.encounters = [{ id: 'single-encounter', name: 'Current Encounter', creatures: [], round: 1 }];
			this.s.activeEncounterId = 'single-encounter';
			void this.persist();
		} else if (!this.active) {
			this.s.activeEncounterId = this.s.encounters[0].id;
			void this.persist();
		}
		return this.active;
	}

	setActive(id: string | null): void {
		this.s.activeEncounterId = id;
		this.commit();
	}

	create(name: string): Encounter {
		const enc: Encounter = { id: uid(), name, creatures: [], round: 1 };
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
		this.commit();
	}

	find(encId: string): Encounter | undefined {
		return this.s.encounters.find(e => e.id === encId);
	}

	creature(encId: string, creatureId: string): EncounterCreature | undefined {
		return this.find(encId)?.creatures.find(c => c.id === creatureId);
	}

	/** Adds `count` copies of a monster to the active encounter. Returns the new creatures. */
	add(monster: NimbleMonster, sourceFile?: string, count = 1): EncounterCreature[] {
		const enc = this.ensureActive();
		if (!enc) return [];
		const added: EncounterCreature[] = [];
		for (let i = 0; i < count; i++) {
			const creature: EncounterCreature = {
				id: uid(),
				monster: JSON.parse(JSON.stringify(monster)),
				label: nextLabel(enc.creatures.map(c => c.label), monster.name),
				currentHp: monster.hp,
				maxHp: monster.hp,
				sourceFile,
				conditions: [],
			};
			enc.creatures.push(creature);
			added.push(creature);
		}
		this.commit();
		return added;
	}

	remove(encId: string, creatureId: string): void {
		const enc = this.find(encId);
		if (!enc) return;
		enc.creatures = enc.creatures.filter(c => c.id !== creatureId);
		this.commit();
	}

	rename(encId: string, creatureId: string, label: string): void {
		const c = this.creature(encId, creatureId);
		if (!c || !label.trim()) return;
		c.label = label.trim();
		this.commit();
	}

	/** Sets HP and reports which solo threshold was crossed, if any. */
	setHp(encId: string, creatureId: string, hp: number): HpThreshold {
		const c = this.creature(encId, creatureId);
		if (!c) return null;
		const before = c.currentHp;
		c.currentHp = Math.max(0, Math.min(c.maxHp, Math.round(hp)));
		this.commit();
		return crossedThreshold(before, c.currentHp, c.maxHp);
	}

	adjustHp(encId: string, creatureId: string, delta: number): HpThreshold {
		const c = this.creature(encId, creatureId);
		if (!c) return null;
		return this.setHp(encId, creatureId, c.currentHp + delta);
	}

	toggleCondition(encId: string, creatureId: string, name: string, on: boolean): void {
		const c = this.creature(encId, creatureId);
		if (!c) return;
		c.conditions = c.conditions || [];
		const has = c.conditions.includes(name);
		if (on && !has) c.conditions.push(name);
		else if (!on && has) c.conditions = c.conditions.filter(x => x !== name);
		else return;
		this.commit();
	}

	setLegendaryUsed(encId: string, creatureId: string, used: number): void {
		const c = this.creature(encId, creatureId);
		if (!c) return;
		const max = c.monster.legendaryResistances || 0;
		c.lrUsed = Math.max(0, Math.min(max, used));
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

	setRound(encId: string, round: number): void {
		const enc = this.find(encId);
		if (!enc) return;
		enc.round = Math.max(1, round);
		this.commit();
	}
}
