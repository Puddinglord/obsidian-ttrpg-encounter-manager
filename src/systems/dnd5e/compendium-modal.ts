// The 5e compendium as a dialog, already set to what the caller needs: a monster for an NPC's stat
// block or the tracker's Add monster, a spell or an item for a sheet's Add buttons. The same browser
// as the Compendium tab (core's, over 5e's entries: typed filters, sorting, the page beside the
// list), for the note's campaign and edition, the search focused the moment it opens and Enter (or a
// click on a row) doing the job. See "The compendium is the picker" in CLAUDE_CODE_GUIDE.md.

import { Modal } from 'obsidian';
import { CompendiumBrowser } from '../../core/compendium/browser';
import { applyLook } from '../../core/look';
import type { Entry5e, Segment5e } from './compendium-entries';
import { source5e } from './compendium-view';
import type { Dnd5eEdition } from './editions';
import type { Dnd5eRuntime } from './runtime';

export interface Pick5eOptions {
	/** Heading over the search: "Use the stats of…", "Add a spell". */
	title: string;
	segment: Segment5e;
	/** More than one tab: a segmented control. */
	segments?: Segment5e[];
	/** Only these entries, on top of the tab. */
	only?: (e: Entry5e) => boolean;
	/** Enter, or a click on a row. The dialog closes first. `count` is a leading "3 goblin" when `counts`. */
	pick: (e: Entry5e, count: number, ev: KeyboardEvent | MouseEvent) => void;
	pickLabel: string;
	/** Cmd/Ctrl+Enter: pick and keep the dialog open (several at once). */
	keep?: { label: string; run: (e: Entry5e, count: number) => void };
	/** Listed first, with a chip for just them (a caster's own class list). */
	prefer?: { label: string; test: (e: Entry5e) => boolean };
	/** Already chosen: tagged and listed last. */
	isTaken?: (e: Entry5e) => boolean;
	counts?: boolean;
	query?: string;
	placeholder?: string;
	/** The note it's for: its campaign's monsters, and its edition unless `edition` says. */
	path?: string;
	edition?: Dnd5eEdition;
}

export class Compendium5eModal extends Modal {
	private browser: CompendiumBrowser<Entry5e, Segment5e, object> | null = null;

	constructor(private rt: Dnd5eRuntime, private o: Pick5eOptions) {
		super(rt.plugin.app);
	}

	onOpen(): void {
		const o = this.o;
		this.modalEl.addClass('nimble-cmpx-modal', 'dnd5e-cmpx-modal');
		applyLook(this.modalEl, 'dnd5e');
		this.titleEl.setText(o.title);
		const edition = o.edition ?? this.rt.edition(o.path);
		const path = o.path ?? '';
		const browser = new CompendiumBrowser<Entry5e, Segment5e, object>(this.contentEl, source5e(this.rt, () => edition, () => path), {
			segments: o.segments ?? [o.segment],
			segment: o.segment,
			only: o.only,
			lore: this.rt.plugin.hideStats('', o.path),
			clickPicks: true,
			counts: o.counts,
			prefer: o.prefer,
			isTaken: o.isTaken,
			query: o.query,
			placeholder: o.placeholder,
			primary: () => ({ label: o.pickLabel, run: (e, ev, n) => { this.close(); o.pick(e, n, ev); } }),
			secondary: o.keep ? () => ({ label: o.keep!.label, run: (e, _ev, n) => { o.keep!.run(e, n); window.setTimeout(() => this.browser?.update(), 250); } }) : undefined,
			detail: {},
		});
		this.browser = browser;
		browser.load();
		// Focused and ready to type, whatever opened it.
		window.setTimeout(() => browser.focus(), 0);
	}

	onClose(): void {
		this.browser?.unload();
		this.browser = null;
		this.contentEl.empty();
	}
}

/** Open the 5e compendium as a picker. */
export function openCompendium5eModal(rt: Dnd5eRuntime, o: Pick5eOptions): Compendium5eModal {
	const m = new Compendium5eModal(rt, o);
	m.open();
	return m;
}

/** Pick a 5e monster (an NPC's stat block, a fight's next monster): the Monsters tab, its page beside the list. */
export function pickMonster5e(rt: Dnd5eRuntime, o: Pick<Pick5eOptions, 'title' | 'pickLabel' | 'pick' | 'path' | 'edition' | 'counts' | 'keep' | 'placeholder' | 'query'>): Compendium5eModal {
	return openCompendium5eModal(rt, {
		segment: 'monsters', only: (e) => !!e.monster, placeholder: o.placeholder ?? 'Search monsters… try type:undead cr:1-4', ...o,
	});
}
