// The Nimble bestiary that ships with the plugin. Text from the Nimble GM Guide
// and Monsters & More, included with permission from Nimble's creator.
// Pure module: no Obsidian imports.

import { formatLevel } from './rules';
import { ArmorType, MonsterIndexEntry, NimbleMonster } from './types';

export const NIMBLE_ATTRIBUTION =
	'Ember Vault is an independent product published under the Nimble 3rd Party Creator License. Nimble TTRPG © Nimble Co. Nimble text is included with permission.';
export const NIMBLE_SUPPORT_NOTICE =
	'This tool is free to use for anyone who already owns the content, is trying the system out, or can\'t afford it right now. If you enjoy Nimble and are able, please support the game by buying the official books at nimbleRPG.com.';
export const NIMBLE_STORE_URL = 'https://nimbleRPG.com';

interface NamedText { name: string; text: string }

/** One stat block as transcribed from the books (see scripts/bestiary). */
export interface BestiaryEntry {
	id: string;
	name: string;
	book: 'M&M' | 'GMG';
	page: number | null;
	group?: string | null;
	habitat?: string | null;
	levelText?: string | null;
	level?: number | null;
	size?: string | null;
	kind?: string | null;
	role: 'regular' | 'minion' | 'legendary' | 'solo';
	armor: 'none' | 'M' | 'H';
	hp?: number | null;
	hpPerHero?: number | null;
	hpText?: string | null;
	speed?: number | null;
	fly?: number | null;
	swim?: number | null;
	climb?: number | null;
	burrow?: number | null;
	movementText?: string | null;
	saves?: string | null;
	resist?: string[];
	vuln?: string[];
	immune?: string[];
	minionDie?: number | null;
	traits?: NamedText[];
	groupTraits?: NamedText[];
	actionsIntro?: string | null;
	actions?: NamedText[];
	bloodied?: NamedText | null;
	lastStand?: NamedText | null;
	flavor?: string | null;
	tactics?: { easier?: string | null; harder?: string | null } | null;
}

const BOOK_NAME: Record<BestiaryEntry['book'], string> = { 'M&M': 'Monsters & More', GMG: 'GM Guide' };
const ARMOR: Record<BestiaryEntry['armor'], ArmorType> = { none: 'none', M: 'medium', H: 'heavy' };

function movement(e: BestiaryEntry): string {
	if (e.movementText) return e.movementText;
	const parts: string[] = [String(e.speed ?? 6)];
	if (e.fly) parts.push(`fly ${e.fly}`);
	if (e.swim) parts.push(`swim ${e.swim}`);
	if (e.climb) parts.push(`climb ${e.climb}`);
	if (e.burrow) parts.push(`burrow ${e.burrow}`);
	return parts.join(', ');
}

/** "Enraged." + text, but don't repeat a generic name like "Bloodied". */
function phaseText(p: NamedText | null | undefined, generic: string): string | undefined {
	if (!p?.text?.trim()) return undefined;
	const name = p.name?.trim();
	if (!name || name.toLowerCase() === generic.toLowerCase()) return p.text.trim();
	return `**${name}.** ${p.text.trim()}`;
}

export function fromBestiary(e: BestiaryEntry, defaultPartySize = 4): NimbleMonster {
	const role = e.role === 'solo' ? 'legendary' : e.role;
	const m: NimbleMonster = {
		name: e.name,
		level: e.levelText?.trim() || (e.level !== null && e.level !== undefined ? formatLevel(e.level) : undefined),
		size: e.size || undefined,
		type: e.kind || undefined,
		role,
		roleLabel: e.role === 'solo' ? 'Solo' : e.role === 'legendary' ? 'Legendary' : undefined,
		armor: ARMOR[e.armor] ?? 'none',
		hp: e.hpPerHero ? e.hpPerHero * defaultPartySize : (e.hp ?? 0),
		hpPerHero: e.hpPerHero || undefined,
		movement: movement(e),
		saves: e.saves ? e.saves.replace(/,/g, ' ').replace(/\s+/g, ' ').trim() : undefined,
		minionDie: e.minionDie || undefined,
		abilities: [...(e.groupTraits || []), ...(e.traits || [])]
			.filter(t => t.text?.trim() || t.name?.trim())
			.map(t => ({ name: t.name.trim(), description: t.text.trim() })),
		attacks: (e.actions || [])
			.filter(a => a.text?.trim() || a.name?.trim())
			.map(a => ({ raw: a.name?.trim() ? `**${a.name.trim().replace(/[.:]$/, '')}.** ${a.text.trim()}` : a.text.trim() })),
		actionText: e.actionsIntro || undefined,
		resistances: e.resist?.length ? e.resist : undefined,
		vulnerabilities: e.vuln?.length ? e.vuln : undefined,
		immunities: e.immune?.length ? e.immune : undefined,
		bloodied: phaseText(e.bloodied, 'Bloodied'),
		lastStand: phaseText(e.lastStand, 'Last Stand'),
		description: e.flavor || undefined,
		tactics: e.tactics && (e.tactics.easier || e.tactics.harder)
			? { easier: e.tactics.easier || undefined, harder: e.tactics.harder || undefined }
			: undefined,
		source: `${BOOK_NAME[e.book]}${e.page ? ` p.${e.page}` : ''}`,
		group: e.group || undefined,
		habitat: e.habitat || undefined,
		bundledId: e.id,
	};
	return m;
}

export function bestiaryEntries(raw: BestiaryEntry[], defaultPartySize = 4): MonsterIndexEntry[] {
	return raw.map(e => ({ name: e.name, filePath: '', monster: fromBestiary(e, defaultPartySize), bundled: true }));
}
