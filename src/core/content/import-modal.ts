// A content pack's report: what it adds and what was left out (and why). Import…
// (core/import/dialog.ts) shows it for a pack; settings shows it for one loaded.

import { App, Modal, setIcon } from 'obsidian';
import { LoadedPack, packSummary } from './packs';

/** What a pack adds, and every entry left out with its reasons. */
export function renderPackReport(el: HTMLElement, pack: LoadedPack | null): void {
	el.empty();
	if (!pack) return;
	const head = el.createDiv({ cls: `nimble-pack-head${pack.error ? ' is-error' : ''}` });
	setIcon(head.createSpan({ cls: 'nimble-pack-icon' }), pack.error ? 'circle-alert' : 'package');
	const t = head.createDiv();
	t.createDiv({ cls: 'nimble-pack-name', text: pack.name });
	t.createDiv({ cls: 'nimble-pack-summary', text: packSummary(pack) });
	const list = (title: string, notes: LoadedPack['rejected'], cls: string) => {
		if (!notes.length) return;
		const box = el.createDiv({ cls: `nimble-pack-notes ${cls}` });
		box.createDiv({ cls: 'nimble-pack-notes-title', text: title });
		for (const n of notes.slice(0, 50)) {
			const row = box.createDiv({ cls: 'nimble-pack-note' });
			row.createSpan({ cls: 'nimble-pack-at', text: n.at });
			row.createSpan({ text: `: ${n.reasons.join('; ')}` });
		}
		if (notes.length > 50) box.createDiv({ cls: 'nimble-pack-note', text: `and ${notes.length - 50} more` });
	};
	list('Left out', pack.rejected, 'is-rejected');
	list('Added, with something ignored', pack.warnings, 'is-warning');
}

/** For other views (settings): a quick look at one pack's report. */
export class PackReportModal extends Modal {
	constructor(app: App, private pack: LoadedPack) { super(app); }
	onOpen(): void {
		this.titleEl.setText(this.pack.name);
		renderPackReport(this.contentEl, this.pack);
	}
}
