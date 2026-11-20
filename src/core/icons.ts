// The icons every game's surfaces draw: Phosphor Bold (see icons-data.ts), registered with
// Obsidian as `ev-<name>` so setIcon() and pill() draw them like any other icon. Obsidian's own
// chrome (ribbon, view headers, menus) keeps Lucide; sheets, trackers, cards and blocks use these.
// The design study (prototypes/design-study) is where each one's use is decided.

import { addIcon } from 'obsidian';
import { PHOSPHOR_BOLD } from './icons-data';

export type EvIconName = keyof typeof PHOSPHOR_BOLD | 'd20';

/** The Obsidian icon id for one of ours: pass it to setIcon() or pill({ icon }). */
export function evIcon(name: EvIconName): string {
	return `ev-${name}`;
}

/** A d20 seen from above (Initiative and other d20 rolls), drawn as lines on a 16 × 16 grid. */
const D20 = '<path d="M8 1.3 14.2 4.9v6.2L8 14.7 1.8 11.1V4.9Z"/><path d="M8 1.3 4.6 10.4h6.8ZM1.8 4.9l2.8 5.5M14.2 4.9l-2.8 5.5M4.6 10.4 8 14.7l3.4-4.3"/>';

/** Register every icon with Obsidian. Called once at load. Obsidian draws icons on a 100 × 100 grid. */
export function registerIcons(): void {
	for (const [name, paths] of Object.entries(PHOSPHOR_BOLD)) {
		// Phosphor's shapes are filled; Obsidian's icon CSS strokes and doesn't fill, so the group says otherwise.
		addIcon(evIcon(name as EvIconName), `<g fill="currentColor" stroke="none" transform="scale(0.390625)">${paths}</g>`);
	}
	addIcon(evIcon('d20'), `<g fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" transform="scale(6.25)">${D20}</g>`);
}

const DAMAGE: Record<string, string> = {
	fire: 'fire', cold: 'cold', lightning: 'lightning', electricity: 'lightning', thunder: 'thunder', sonic: 'thunder',
	acid: 'acid', poison: 'poison', necrotic: 'necrotic', void: 'necrotic', negative: 'necrotic', radiant: 'radiant', vitality: 'radiant', positive: 'radiant',
	psychic: 'psychic', mental: 'psychic', force: 'force', spirit: 'force', piercing: 'piercing', pierc: 'piercing', p: 'piercing',
	slashing: 'slashing', slash: 'slashing', s: 'slashing', bludgeoning: 'bludgeoning', bludg: 'bludgeoning', b: 'bludgeoning',
	phy: 'slashing', physical: 'slashing', mag: 'force', magic: 'force', magical: 'force',
};
const DAMAGE_LABEL: Record<string, string> = {
	fire: 'Fire', cold: 'Cold', lightning: 'Lightning', thunder: 'Thunder', acid: 'Acid', poison: 'Poison', necrotic: 'Necrotic', radiant: 'Radiant',
	psychic: 'Psychic', force: 'Force', piercing: 'Piercing', slashing: 'Slashing', bludgeoning: 'Bludgeoning',
};

/** The icon for a damage word ("fire", "Piercing", "pierc."), with its name for the tooltip; null for a word we don't draw. */
export function damageIcon(word: string | undefined): { icon: string; label: string } | null {
	const key = DAMAGE[String(word ?? '').toLowerCase().replace(/[^a-z]/g, '')];
	return key ? { icon: evIcon(`dmg-${key}` as EvIconName), label: `${DAMAGE_LABEL[key]} damage` } : null;
}
