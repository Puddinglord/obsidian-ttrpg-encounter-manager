// Import content…: pick or paste a content pack, see what it adds and what was
// left out (and why), then add it to the content folder. A game can read other
// apps' files here too (5e: a D&D Beyond character's JSON, `importFrom` in the
// contract): it draws what the file brings and adds what's chosen.

import { App, Modal, Notice, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { LoadedPack, packSummary } from './packs';

/** Content a game read from another app's file, for Import content… (GameContent.importFrom). */
export interface ContentImport {
	/** Draw what it brings into `el` (emptied first), with the choice of what to add; call `changed` when that changes. */
	render(el: HTMLElement, changed: () => void): void;
	/** How many entries are chosen: Add is off at none. */
	chosen(): number;
	/** Write what's chosen; the sentence for the notice. */
	add(): Promise<string>;
}

export class ImportContentModal extends Modal {
	private text = '';
	private fileName = 'content.json';
	private pack: LoadedPack | null = null;
	/** Another app's file a game read instead of a pack. */
	private foreign: ContentImport | null = null;
	private reportEl!: HTMLElement;
	private addBtn!: HTMLButtonElement;

	constructor(private plugin: EmberVaultPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('nimble-import-content');
		this.titleEl.setText('Import content');
		const el = this.contentEl;
		el.createEl('p', { cls: 'nimble-import-lead', text: `Content packs are JSON files for one game. They go in ${this.plugin.content.folder()}.` });
		const pick = el.createDiv({ cls: 'nimble-import-pick' });
		const input = pick.createEl('input', { type: 'file', attr: { accept: '.json,application/json', 'aria-label': 'Choose a pack file' } });
		input.addEventListener('change', () => {
			const f = input.files?.[0];
			if (!f) return;
			void f.text().then(t => { this.fileName = f.name; area.value = t; this.set(t); });
		});
		const area = el.createEl('textarea', { cls: 'nimble-import-text', attr: { rows: '8', placeholder: 'Or paste the JSON here', spellcheck: 'false' } });
		area.addEventListener('input', () => { this.fileName = 'content.json'; this.set(area.value); });
		this.reportEl = el.createDiv({ cls: 'nimble-import-report' });
		const foot = el.createDiv({ cls: 'modal-button-container' });
		this.addBtn = foot.createEl('button', { cls: 'mod-cta', text: 'Add to vault' });
		this.addBtn.disabled = true;
		this.addBtn.addEventListener('click', () => void this.add());
		foot.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
	}

	private set(text: string): void {
		this.text = text;
		this.foreign = text.trim() ? this.readForeign(text) : null;
		if (this.foreign) {
			this.pack = null;
			const foreign = this.foreign;
			const changed = () => { this.addBtn.disabled = !foreign.chosen(); };
			this.reportEl.empty();
			foreign.render(this.reportEl, changed);
			changed();
			return;
		}
		this.pack = text.trim() ? this.plugin.content.check(text, this.fileName) : null;
		renderPackReport(this.reportEl, this.pack);
		this.addBtn.disabled = !this.pack || !!this.pack.error || !this.pack.entries.length;
	}

	/** The first game that reads this text as its own kind of file. */
	private readForeign(text: string): ContentImport | null {
		for (const sys of this.plugin.systems.all()) {
			try {
				const found = sys.content?.importFrom?.(this.plugin, text);
				if (found) return found;
			} catch (e) {
				console.error('Ember Vault: could not read the file', e);
			}
		}
		return null;
	}

	private async add(): Promise<void> {
		if (this.foreign) {
			try {
				new Notice(await this.foreign.add());
				this.close();
			} catch (e) {
				console.error('Ember Vault: could not import the content', e);
				new Notice('Couldn\'t finish the import.');
			}
			return;
		}
		const pack = this.pack;
		if (!pack || pack.error || !pack.entries.length) return;
		try {
			const path = await this.plugin.content.save(this.text, pack);
			new Notice(`Added ${pack.name}: ${packSummary(pack)}. Saved as ${path}.`);
			this.close();
		} catch (e) {
			console.error('Ember Vault: could not save the content pack', e);
			new Notice('Couldn\'t save the pack. Nothing was written.');
		}
	}
}

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
