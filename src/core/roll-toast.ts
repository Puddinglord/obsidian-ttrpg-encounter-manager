// Where a roll lands: the toast (an Obsidian notice) as the design study draws it (32-sheet.js, rollToast): the
// die (a d20 for a d20 roll), what was rolled, the dice and the total, set in the game's type. A crit or a miss
// gets a tag after the total. Every game's rolls use it; the game is the note's (its look, `.ev-sys-<id>`).

import { setIcon } from 'obsidian';
import type { RollLogEntry } from './types';
import { evIcon } from './icons';
import { applyLook } from './look';

/** The toast's content for a roll, in `systemId`'s look. Classes kept for tests: nimble-roll-notice(-label|-total|-detail). */
export function rollToast(entry: Pick<RollLogEntry, 'label' | 'expression' | 'detail' | 'total' | 'outcome'>, systemId?: string): DocumentFragment {
	return createFragment(f => {
		const body = f.createDiv({ cls: ['nimble-roll-notice', 'ev-roll-toast', ...(entry.outcome ? [`is-${entry.outcome}`] : [])] });
		applyLook(body, systemId);
		const d20 = /(^|[^\d])1?d20\b/i.test(entry.expression);
		setIcon(body.createSpan({ cls: 'ev-roll-icon', attr: { 'aria-hidden': 'true' } }), evIcon(d20 ? 'd20' : 'dice'));
		body.createDiv({ cls: 'nimble-roll-notice-label', text: entry.label });
		const line = body.createDiv({ cls: 'ev-roll-line' });
		line.createSpan({ cls: 'nimble-roll-notice-detail', text: `${entry.expression}: ${entry.detail}` });
		// A miss has no total worth showing: the tag stands where it would be.
		if (entry.outcome !== 'miss') {
			line.createSpan({ cls: 'ev-roll-eq', text: '=' });
			line.createSpan({ cls: 'nimble-roll-notice-total', text: String(entry.total) });
		}
		if (entry.outcome) line.createSpan({ cls: 'ev-roll-tag', text: entry.outcome === 'miss' ? 'MISS' : 'CRIT' });
	});
}
