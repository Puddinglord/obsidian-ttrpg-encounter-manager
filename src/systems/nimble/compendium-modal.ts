// The compendium as a dialog, already set to what the caller needs: monsters
// for "Add to the encounter" and /monster, spells for /spell and the sheet's
// Add spell, and so on. The same browser as the Compendium tab (smart search,
// typed filters, sorting, the page of the selected entry beside the list),
// with the search box focused the moment it opens and Enter doing the job.

import { Component, Modal, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { BrowserOptions, CompendiumBrowser, insertReference, renderEntryDetail } from './compendium-browser';
import type { Entry, Segment } from './compendium-entries';
import { CompendiumCardModal } from './compendium-card';
import { openRecord } from './record-modal';
import { applyLook } from '../../core/look';

export interface PickOptions {
	/** Heading over the search: "Add to the encounter", "Insert a spell". */
	title: string;
	segment: Segment;
	/** More than one tab: a segmented control (e.g. /compendium). */
	segments?: Segment[];
	only?: (e: Entry) => boolean;
	/** Enter. The dialog closes first, so an editor can take focus back. */
	pick: (e: Entry, count: number, ev: KeyboardEvent | MouseEvent) => void;
	pickLabel: string;
	/** Cmd/Ctrl+Enter: pick and keep the dialog open (several at once). */
	keep?: { label: string; run: (e: Entry, count: number) => void };
	prefer?: BrowserOptions['prefer'];
	isTaken?: BrowserOptions['isTaken'];
	/** "Add “what you typed”" for things not in the compendium. */
	custom?: { label: (text: string) => string; run: (text: string) => void };
	counts?: boolean;
	rowButton?: BrowserOptions['rowButton'];
	decorate?: BrowserOptions['decorate'];
	query?: string;
	placeholder?: string;
	/** Runs when the dialog closes without a pick (Escape). */
	onCancel?: () => void;
}

export class CompendiumModal extends Modal {
	private browser: CompendiumBrowser | null = null;
	private picked = false;

	constructor(private plugin: EmberVaultPlugin, private o: PickOptions) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-cmpx-modal');
		applyLook(this.modalEl, 'nimble');
		this.titleEl.setText(this.o.title);
		const o = this.o;
		const lore = this.plugin.hideStats();
		const browser = new CompendiumBrowser(this.plugin, this.contentEl, {
			segments: o.segments ?? [o.segment],
			segment: o.segment,
			only: o.only,
			lore,
			clickPicks: true,
			counts: o.counts,
			prefer: o.prefer,
			isTaken: o.isTaken,
			rowButton: o.rowButton,
			decorate: o.decorate,
			query: o.query,
			placeholder: o.placeholder,
			primary: () => ({ label: o.pickLabel, run: (e, ev, n) => { this.picked = true; this.close(); o.pick(e, n, ev); } }),
			secondary: o.keep ? () => ({ label: o.keep!.label, run: (e, _ev, n) => { o.keep!.run(e, n); window.setTimeout(() => this.browser?.update(), 250); } }) : undefined,
			custom: o.custom ? {
				label: o.custom.label,
				run: (text, ev) => {
					if (ev.metaKey || ev.ctrlKey) { o.custom!.run(text); return; }
					this.picked = true;
					this.close();
					o.custom!.run(text);
				},
			} : undefined,
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
		if (!this.picked) this.o.onCancel?.();
	}
}

export function openCompendiumModal(plugin: EmberVaultPlugin, o: PickOptions): CompendiumModal {
	const m = new CompendiumModal(plugin, o);
	m.open();
	return m;
}

/** An entry in a window of its own: a monster's quick look, an NPC's note, a compendium card, a rule. */
export function openEntry(plugin: EmberVaultPlugin, e: Entry): Modal | undefined {
	if (e.monster) return openRecord(plugin, { kind: 'monster', entry: e.monster });
	if (e.npc) {
		const f = plugin.app.vault.getAbstractFileByPath(e.npc.path);
		return f instanceof TFile ? openRecord(plugin, { kind: 'note', file: f, subtitle: e.npc.role }) : undefined;
	}
	plugin.hover.hide();
	const m = e.hit || e.condition ? new CompendiumCardModal(plugin.app, plugin, (e.hit ?? e.condition)!) : new EntryModal(plugin, e);
	m.open();
	return m;
}

/** Anything else (a rule) as a card in a dialog. */
class EntryModal extends Modal {
	private component = new Component();

	constructor(private plugin: EmberVaultPlugin, private entry: Entry) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-cmp-modal');
		applyLook(this.modalEl, 'nimble');
		this.component.load();
		renderEntryDetail(this.contentEl, this.entry, { plugin: this.plugin, component: this.component, lore: this.plugin.hideStats() });
	}

	onClose(): void {
		this.component.unload();
		this.contentEl.empty();
	}
}

/** The search-everything dialog (the "Search the compendium" command): Enter opens the page, Cmd/Ctrl+Enter inserts a reference. */
export function openCompendiumSearch(plugin: EmberVaultPlugin, query = '', segment: Segment = 'all'): CompendiumModal {
	return openCompendiumModal(plugin, {
		title: 'Compendium',
		segment,
		segments: ['all', 'adversaries', 'npcs', 'companions', 'spells', 'items', 'features', 'classes', 'origins', 'rules'],
		query,
		pickLabel: 'Open',
		pick: (e) => openEntry(plugin, e),
		keep: { label: 'Insert reference', run: (e) => insertReference(plugin, e) },
	});
}
