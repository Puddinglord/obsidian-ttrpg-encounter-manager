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
	const data: Record<string, string> = PHOSPHOR_BOLD;
	for (const name of Object.keys(data)) {
		// Some names are aliases ("@first-aid"): our word for an icon that's drawn under another name.
		let paths = data[name], hops = 0;
		while (paths.startsWith('@') && hops++ < 4) paths = data[paths.slice(1)] ?? '';
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

/** Lucide names our game surfaces were first written with, and the Phosphor Bold shape we draw for each. */
const FROM_LUCIDE: Record<string, EvIconName> = {
	'wand-2': 'wand', sparkles: 'sparkle', 'bar-chart-3': 'chart', 'chart-bar': 'chart', 'trash-2': 'trash', pencil: 'edit', 'pencil-line': 'edit',
	sword: 'swords', 'flask-conical': 'flask', 'scroll-text': 'scroll', dices: 'dice', 'dice-5': 'dice', save: 'floppy', 'rotate-ccw': 'undo',
	'circle-check': 'check-circle', 'check-circle-2': 'check-circle', 'triangle-alert': 'warning', 'alert-triangle': 'warning', 'file-symlink': 'open',
	'external-link': 'open', maximize: 'fit', 'user-round': 'user', 'sticky-note': 'note', 'trending-up': 'trend-up', 'trending-down': 'trend-down',
	'book-open': 'book', 'shield-half': 'shield', scale: 'scales', 'users-round': 'users', 'circle-plus': 'plus', 'plus-circle': 'plus',
};

/**
 * The icon to draw on a game's surface for a Lucide name: ours (Phosphor Bold) when we have the shape, else the
 * Lucide one. Lets a surface written with Lucide names (the builder's steps, a system's kinds) draw Phosphor.
 */
export function gameIcon(name: string): string {
	if (name.startsWith('ev-')) return name;
	const ours = FROM_LUCIDE[name] ?? (Object.prototype.hasOwnProperty.call(PHOSPHOR_BOLD, name) ? name as EvIconName : undefined);
	return ours ? evIcon(ours) : name;
}
