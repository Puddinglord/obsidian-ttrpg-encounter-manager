// How an imported Nimble entry is written into a note (GameContent.writeEntry):
// a monster as its ```nimble stat block (the note says its level), spells and
// items as their ```nimble-spell / ```nimble-item blocks. Kinds in
// NIMBLE_BLOCKS are left to core (```nimble-<kind> YAML).
// Pure: no Obsidian imports.

import { packMonster } from './content';
import { ITEM_LANG, itemBlockSource, SPELL_LANG, spellBlockSource } from './homebrew-def';
import type { HomebrewItem } from './homebrew-def';
import { toStatblockSource } from './parser';
import type { Spell } from './compendium';

export function writeEntryNimble(kind: string, value: Record<string, unknown>): { lang: string; body: string; props?: Record<string, unknown> } | null {
	switch (kind) {
		case 'monster': {
			const m = packMonster(value, '');
			if (!m) return null;
			const { pack: _p, ...monster } = m;
			const source = typeof value.source === 'string' && value.source.trim() ? value.source.trim() : undefined;
			return { lang: 'nimble', body: toStatblockSource({ ...monster, source }), props: { ...(monster.level ? { level: monster.level } : {}) } };
		}
		case 'spell': return { lang: SPELL_LANG, body: spellBlockSource(value as unknown as Spell) };
		case 'item': return { lang: ITEM_LANG, body: itemBlockSource(value as unknown as HomebrewItem) };
		default: return null;
	}
}
