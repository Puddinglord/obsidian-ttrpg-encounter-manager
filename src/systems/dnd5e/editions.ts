// The two versions of the 5e rules the plugin ships. Pure: no Obsidian imports.

import type { Edition } from '../contract';

export type Dnd5eEdition = '2024' | '2014';

/** Newest first: a 5e campaign with no `edition:` plays the 2024 rules. */
export const EDITIONS: readonly (Edition & { id: Dnd5eEdition })[] = [
	{ id: '2024', label: '2024 rules (SRD 5.2)' },
	{ id: '2014', label: '2014 rules (SRD 5.1)' },
];

export const DEFAULT_EDITION: Dnd5eEdition = '2024';

/** "2014" and 2014 mean the 2014 rules; anything else is the default. */
export function asEdition(e: string | number | undefined): Dnd5eEdition {
	return String(e ?? '').trim() === '2014' ? '2014' : DEFAULT_EDITION;
}
