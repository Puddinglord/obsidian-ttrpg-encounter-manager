// How an imported 5e entry is written into a note (GameContent.writeEntry): a
// monster as its ```5e stat block (the note says its CR and book), spells and
// items as their ```5e-spell / ```5e-item blocks, the rest as ```5e-<kind>.
// Pure: no Obsidian imports.

import type { Dnd5eEdition } from './editions';
import { asEdition } from './editions';
import { ddbBlock, DdbContentKind } from './import-ddb-content';
import { parseStatblock5e, STATBLOCK_LANG, toStatblockSource5e } from './parser';
import type { Dnd5eMonster } from './types';

const BLOCK_KINDS: readonly string[] = ['class', 'subclass', 'species', 'background', 'feat', 'spell', 'item', 'equipment'];

export function writeEntry5e(kind: string, value: Record<string, unknown>, edition?: string): { lang: string; body: string; props?: Record<string, unknown> } | null {
	const ed: Dnd5eEdition = asEdition(edition);
	if (kind === 'monster') {
		const m = typeof value.statblock === 'string'
			? parseStatblock5e(value.statblock)
			: ({ ...value, cr: typeof value.cr === 'string' || typeof value.cr === 'number' ? String(value.cr) : '0' } as unknown as Dnd5eMonster);
		if (!m) return null;
		const name = m.name || (typeof value.name === 'string' ? value.name : '');
		const book = typeof value.source === 'string' && value.source.trim() ? value.source.trim() : m.source;
		return { lang: STATBLOCK_LANG, body: toStatblockSource5e({ ...m, name }), props: { cr: m.cr, ...(book ? { source: book } : {}) } };
	}
	if (BLOCK_KINDS.includes(kind)) return ddbBlock(kind as DdbContentKind, value, ed);
	return null;
}
