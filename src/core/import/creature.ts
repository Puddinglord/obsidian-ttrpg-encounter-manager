// A creature in no game's terms, so content can move between games without a
// converter for every pair: each game says what one of its monsters is in
// these terms (`creatures.out`) and builds one of its own from them
// (`creatures.in`). Ranges are in feet, so 5 feet is a Nimble space.
// Pure: no Obsidian imports.

export interface NeutralAttack {
	name: string;
	/** Average damage of one hit, as the source game has it. */
	avg?: number;
	/** The source's dice: "1d6 + 2". */
	dice?: string;
	/** Its damage type: "slashing". */
	damageType?: string;
	/** Feet. */
	reach?: number;
	range?: number;
	/** A saving throw instead of an attack roll: its ability ("dex") and DC. */
	save?: { ability: string; dc?: number };
	/** Area: "15-foot cone". */
	area?: string;
	/** What else a hit does, as the source says it. */
	rider?: string;
	/** Uses: "Recharge 5–6", "3/Day". */
	uses?: string;
}

export interface NeutralCreature {
	name: string;
	size?: string;
	type?: string;
	/** How tough, in the source game's own measure: 5e's CR. */
	power: { cr?: number; level?: number; solo?: boolean; minion?: boolean };
	hp?: number;
	ac?: number;
	/** Feet. */
	speed?: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
	/** How many attacks it makes in a turn. */
	attacksPerTurn: number;
	attacks: NeutralAttack[];
	/** Everything else it does, as text: traits, other actions, reactions, legendary actions. */
	abilities: { name: string; text: string; when?: 'trait' | 'action' | 'bonus' | 'reaction' | 'legendary' }[];
	/** Saving throws it's good at: "dex", "wis". */
	goodSaves: string[];
	resist?: string[];
	immune?: string[];
	vuln?: string[];
	senses?: string;
	languages?: string;
	flavor?: string;
}

/** A CR or level as a number: "1/4" → 0.25. */
export function fraction(v: unknown): number | undefined {
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	const s = typeof v === 'string' ? v.trim() : '';
	const f = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
	if (f) return Number(f[1]) / Number(f[2]);
	const n = Number(s);
	return s && Number.isFinite(n) ? n : undefined;
}

/** "within 30 feet", "a 15-foot cone", "60 ft." in Nimble's spaces: "within 6 spaces". */
export function feetToSpaces(text: string): string {
	return text
		.replace(/(\d+)-foot\b/g, (_m, n: string) => `${Math.max(1, Math.round(Number(n) / 5))}-space`)
		.replace(/(\d+)\s*(?:feet|foot|ft\.?)(?=[\s,;.)]|$)/g, (_m, n: string) => { const s = Math.max(1, Math.round(Number(n) / 5)); return `${s} space${s === 1 ? '' : 's'}`; });
}
