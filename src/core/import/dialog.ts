// Import…: one dialog for everything that comes from somewhere else. Choose
// files (several at once: a dungeon's JSON and its picture), paste text, or
// paste a link. Every importer is asked how sure it is the input is its kind;
// the surest reads it (a switch offers the others when more than one fits).
// What it read is planned against the vault (new, update, already imported,
// already yours) and shown as a checklist; Import writes what's ticked.
// Importers that need a review of their own (a D&D Beyond character, a content
// pack) draw it here instead.

import { Modal, Notice, setIcon, TFile } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { dialogFoot, gameDialog } from '../dialog';
import { evIcon, EvIconName } from '../icons';
import { pill } from '../pill';
import { bundleSummary, CheckedBundle, checkBundle, CheckedRecord } from './bundle';
import { detectImporters, Importer, ImportFile, ImportInput, ImportRead, linkImporter } from './importer';
import { planRecords, PlanItem, planResultText } from './plan';
import { vaultHave, writePlan } from './write';

export interface ImportDialogOptions {
	/** An importer's id to read with (a command for one format): its hint shows, and it's tried first. */
	prefer?: string;
}

/** Every importer: the games' own, then mapping files, then core's (bundles, packs, maps), in that order so a game's wins a tie. */
export function allImporters(plugin: EmberVaultPlugin): Importer[] {
	return [...plugin.systems.all().flatMap(s => s.importers ?? []), ...plugin.mappings.importers(), ...plugin.importers];
}

/** What a bundle's records' kinds are called: "Monster", "NPC", "Map". */
function kindLabel(plugin: EmberVaultPlugin, system: string | undefined, r: CheckedRecord): string {
	if (r.type === 'map') return 'Map';
	if (r.type === 'note') return r.kind === 'npc' ? 'NPC' : r.kind.charAt(0).toUpperCase() + r.kind.slice(1);
	return plugin.systems.get(system ?? '')?.content?.kinds.find(k => k.kind === r.kind)?.label ?? r.kind;
}

const ICON: Record<string, EvIconName> = { monster: 'skull', spell: 'spell', item: 'gem', equipment: 'gem', npc: 'user', location: 'map-pin', quest: 'scroll', note: 'note', map: 'map-pin', class: 'book', subclass: 'book' };

export class ImportDialog extends Modal {
	private input: ImportInput = { files: [] };
	private importer: Importer | null = null;
	private candidates: Importer[] = [];
	private read: ImportRead | null = null;
	private bundle: CheckedBundle | null = null;
	private plan: PlanItem[] = [];
	private picked = new Set<PlanItem>();
	private hintEl!: HTMLElement;
	private linkEl!: HTMLElement;
	private reportEl!: HTMLElement;
	private mainBtn!: HTMLButtonElement;
	private area!: HTMLTextAreaElement;
	private sourcePath: string;
	/** Each read gets a number; a slower earlier read that finishes late is dropped. */
	private reading = 0;

	constructor(private plugin: EmberVaultPlugin, private o: ImportDialogOptions = {}) {
		super(plugin.app);
		this.sourcePath = plugin.app.workspace.getActiveFile()?.path ?? plugin.campaigns.active?.home.path ?? '';
	}

	private get preferred(): Importer | undefined {
		return this.o.prefer ? allImporters(this.plugin).find(i => i.id === this.o.prefer) : undefined;
	}

	onOpen(): void {
		const pref = this.preferred;
		gameDialog(this, this.plugin.system(this.sourcePath).id, { cls: 'nimble-import-content ev-import' });
		this.modalEl.toggleClass('dnd5e-import', pref?.system === 'dnd5e');
		this.titleEl.setText(pref ? `Import ${/^(a|an|the) /i.test(pref.label) ? pref.label : `from ${pref.label}`}` : 'Import');
		const el = this.contentEl;
		if (!pref?.hint) el.createEl('p', { cls: 'nimble-import-lead', text: pref ? 'Choose the file, or paste it below.' : 'Choose files, paste text, or paste a link. Monsters, spells, items, NPCs, maps and content packs.' });
		this.hintEl = el.createDiv({ cls: 'ev-import-hint' });
		pref?.hint?.(this.hintEl);
		const pick = el.createDiv({ cls: 'nimble-import-pick' });
		const file = pick.createEl('input', { type: 'file', attr: { multiple: '', 'aria-label': 'Choose files' } });
		file.addEventListener('change', () => { void this.takeFiles(file.files ? Array.from(file.files) : []); });
		this.area = el.createEl('textarea', { cls: 'nimble-import-text', attr: { rows: '8', placeholder: 'Or paste it here', spellcheck: 'false' } });
		this.area.addEventListener('input', () => { this.input = { files: this.input.files, text: this.area.value }; this.detect(); });
		// Files dropped anywhere on the dialog, as if chosen.
		this.modalEl.addEventListener('dragover', (e) => { e.preventDefault(); });
		this.modalEl.addEventListener('drop', (e) => {
			const files = e.dataTransfer?.files;
			if (!files?.length) return;
			e.preventDefault();
			void this.takeFiles(Array.from(files));
		});
		this.linkEl = el.createDiv({ cls: 'ev-import-link' });
		this.reportEl = el.createDiv({ cls: 'nimble-import-report' });
		this.mainBtn = dialogFoot(el, { cancel: () => this.close(), main: { text: 'Import', icon: evIcon('check'), onClick: () => void this.add() } }).main;
		this.mainBtn.disabled = true;
	}

	/** Files as the input: text formats read as text, the rest as bytes. Pasted text stays. */
	private async takeFiles(list: File[]): Promise<void> {
		const files: ImportFile[] = [];
		for (const f of list) {
			const textual = /\.(json|ya?ml|md|txt|html?|csv|xml|dd2vtt|uvtt|df2vtt)$/i.test(f.name) || f.type.startsWith('text/') || f.type === 'application/json';
			files.push(textual ? { name: f.name, text: await f.text() } : { name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
		}
		this.input = { files, text: this.area.value };
		this.detect();
	}

	/** Which importers fit, then read with the preferred one if it fits, else the surest. */
	private detect(): void {
		this.linkEl.empty();
		const text = this.input.text?.trim() ?? '';
		const importers = allImporters(this.plugin);
		// A pasted link: offer to fetch it (never fetched without the click).
		if (!this.input.files.length && /^https?:\/\/\S+$/i.test(text) && !this.input.url) {
			this.showLink(text, importers);
			this.candidates = [];
			this.importer = null;
			this.read = null;
			this.render();
			return;
		}
		const found = detectImporters(this.input, importers).map(d => d.importer);
		const pref = this.preferred;
		this.candidates = pref && found.includes(pref) ? [pref, ...found.filter(i => i !== pref)] : found;
		// Opened for one format and nothing fits: that format says what's wrong with it.
		const first = this.candidates[0] ?? (pref && text ? pref : null);
		void this.readWith(text || this.input.files.length ? first : null);
	}

	private showLink(url: string, importers: Importer[]): void {
		const hit = linkImporter(url, importers);
		const host = (() => { try { return new URL(url).host; } catch { return url; } })();
		if (!hit) {
			this.linkEl.createDiv({ cls: 'ev-import-link-none', text: `Ember Vault can't read links from ${host}. Download the export there, then choose the file.` });
			return;
		}
		const row = this.linkEl.createDiv({ cls: 'ev-import-link-row' });
		row.createSpan({ cls: 'ev-import-link-text', text: `A ${hit.importer.label} link.` });
		const go = pill(row, { tag: 'button', cls: 'ev-import-fetch', icon: evIcon('link'), text: `Fetch from ${host}` }) as HTMLButtonElement;
		go.addEventListener('click', () => {
			go.disabled = true;
			void this.plugin.importFetch(hit.dataUrl).then(res => {
				if (!res.ok) { this.linkEl.empty(); this.linkEl.createDiv({ cls: 'ev-import-link-none', text: res.error }); return; }
				this.input = { files: [], text: res.text, url };
				const found = detectImporters(this.input, importers).map(d => d.importer);
				this.candidates = found.includes(hit.importer) ? [hit.importer, ...found.filter(i => i !== hit.importer)] : found;
				this.linkEl.empty();
				this.linkEl.createDiv({ cls: 'ev-import-link-done', text: `Fetched from ${host}.` });
				void this.readWith(this.candidates[0] ?? null);
			});
		});
	}

	private async readWith(importer: Importer | null): Promise<void> {
		const n = ++this.reading;
		this.importer = importer;
		this.read = null;
		this.bundle = null;
		this.plan = [];
		if (importer) {
			try {
				const read = await importer.read(this.input, { plugin: this.plugin, sourcePath: this.sourcePath });
				if (n !== this.reading) return;
				this.read = read;
				if ('bundle' in read) {
					const plugin = this.plugin;
					this.bundle = checkBundle(read.bundle, {
						resolve: (id) => {
							const g = plugin.systems.get(id);
							return g ? { id: g.id, kinds: g.content?.kinds ?? [], editions: g.editions?.map(e => e.id) } : undefined;
						},
					});
					this.plan = this.bundle.error ? [] : planRecords(this.bundle.records, vaultHave(plugin, this.bundle.system));
					this.picked = new Set(this.plan.filter(p => p.on));
				}
			} catch (e) {
				if (n !== this.reading) return;
				console.error('Ember Vault: could not read the import', e);
				this.read = { error: e instanceof Error ? e.message : 'Couldn\'t read that.' };
			}
		}
		this.render();
	}

	private changed = (): void => {
		const r = this.read;
		this.mainBtn.disabled = !r || 'error' in r || ('custom' in r ? !r.custom.chosen() : !this.picked.size);
	};

	private render(): void {
		const el = this.reportEl;
		el.empty();
		const r = this.read;
		const said = !!(this.input.text?.trim() || this.input.files.length);
		this.area.rows = r && !('error' in r) ? 3 : 8;
		if (said && !this.importer && !this.linkEl.childElementCount) {
			this.head(el, 'warning', 'Ember Vault doesn\'t recognise this.', true, 'It reads Ember Vault bundles, content packs, and the formats listed in the import guide.');
		}
		if (this.candidates.length > 1) this.switcher(el);
		if (r && 'error' in r) this.head(el, 'warning', r.error, true);
		else if (r && 'custom' in r) {
			this.mainBtn.querySelector('.ev-pill-text')?.setText(r.custom.action ?? 'Import');
			r.custom.render(el, this.changed);
		} else if (r && this.bundle) {
			this.mainBtn.querySelector('.ev-pill-text')?.setText('Import');
			this.renderBundle(el, this.bundle, r.notes ?? []);
		}
		this.changed();
	}

	/** "Read as: Fantasy Statblocks ▾" when more than one importer fits. */
	private switcher(el: HTMLElement): void {
		const row = el.createDiv({ cls: 'ev-import-as' });
		row.createSpan({ cls: 'ev-import-as-label', text: 'Read as' });
		const sel = row.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Read as' } });
		for (const i of this.candidates) sel.createEl('option', { text: i.label, value: i.id });
		sel.value = this.importer?.id ?? '';
		sel.addEventListener('change', () => { void this.readWith(this.candidates.find(i => i.id === sel.value) ?? null); });
	}

	private head(el: HTMLElement, icon: EvIconName, name: string, error = false, summary?: string): void {
		const head = el.createDiv({ cls: `nimble-pack-head${error ? ' is-error' : ''}` });
		setIcon(head.createSpan({ cls: 'nimble-pack-icon' }), evIcon(icon));
		const t = head.createDiv();
		t.createDiv({ cls: error ? 'nimble-pack-summary' : 'nimble-pack-name', text: name });
		if (summary) t.createDiv({ cls: 'nimble-pack-summary', text: summary });
	}

	private renderBundle(el: HTMLElement, b: CheckedBundle, notes: string[]): void {
		if (b.error) { this.head(el, 'warning', b.error, true); return; }
		const from = b.source?.name ?? this.importer?.label ?? 'Import';
		const game = b.system ? this.plugin.systems.get(b.system)?.name : undefined;
		const summary = bundleSummary(b.records);
		this.head(el, 'books', from, false, [summary.charAt(0).toUpperCase() + summary.slice(1), game, b.edition ? `${b.edition} rules` : undefined].filter(Boolean).join(' · '));
		if (b.source?.license) el.createDiv({ cls: 'ev-import-license', text: b.source.license });
		const offered = this.plan.filter(p => p.status === 'new' || p.status === 'update');
		const box = el.createDiv({ cls: 'ev-import-content' });
		if (offered.length) {
			const list = box.createDiv({ cls: 'ev-import-list' });
			for (const p of offered) {
				const row = list.createEl('label', { cls: 'ev-import-row' });
				const check = row.createEl('input', { type: 'checkbox', attr: { 'data-kind': p.record.kind, 'data-name': p.record.name } });
				check.checked = this.picked.has(p);
				check.addEventListener('change', () => {
					if (check.checked) this.picked.add(p); else this.picked.delete(p);
					this.changed();
				});
				setIcon(row.createSpan({ cls: 'ev-import-icon' }), evIcon(ICON[p.record.kind] ?? 'note'));
				const name = row.createSpan({ cls: 'ev-import-name' });
				name.createSpan({ text: p.record.name });
				name.createSpan({ cls: 'ev-import-kind', text: kindLabel(this.plugin, b.system, p.record) });
				if (p.status === 'update') pill(row, { tag: 'span', cls: 'ev-import-tag', icon: evIcon('arrow-up'), text: 'Update' });
				else if (p.record.converted) pill(row, { tag: 'span', cls: 'ev-import-tag', icon: evIcon('sparkle'), text: 'Converted' });
			}
		} else if (this.plan.length) {
			box.createDiv({ cls: 'ev-import-none', text: 'Nothing new: the vault has all of it.' });
		}
		const names = (status: PlanItem['status']) => this.plan.filter(p => p.status === status).map(p => p.record.name);
		for (const [status, label] of [['same', 'Already imported'], ['yours', 'Already yours, so left alone']] as const) {
			const list = names(status);
			if (!list.length) continue;
			const line = box.createDiv({ cls: `ev-import-skip is-${status}` });
			line.createSpan({ cls: 'ev-import-skip-label', text: `${label}: ` });
			line.createSpan({ text: list.join(', ') });
		}
		const left = b.records.filter(r => !r.value);
		const warned = b.records.filter(r => r.value && r.warnings.length);
		const say = (title: string, cls: string, rows: { at: string; text: string }[]) => {
			if (!rows.length) return;
			const n = el.createDiv({ cls: `nimble-pack-notes ${cls}` });
			n.createDiv({ cls: 'nimble-pack-notes-title', text: title });
			for (const x of rows.slice(0, 40)) {
				const row = n.createDiv({ cls: 'nimble-pack-note' });
				if (x.at) { row.createSpan({ cls: 'nimble-pack-at', text: x.at }); row.createSpan({ text: `: ${x.text}` }); } else row.setText(x.text);
			}
			if (rows.length > 40) n.createDiv({ cls: 'nimble-pack-note', text: `and ${rows.length - 40} more` });
		};
		say('Left out', 'is-rejected', left.map(r => ({ at: r.at, text: r.errors.join('; ') })));
		say('Worth a look', 'is-warning', [...b.warnings.map(text => ({ at: '', text })), ...notes.map(text => ({ at: '', text })), ...warned.map(r => ({ at: r.at, text: r.warnings.join('; ') }))]);
	}

	private async add(): Promise<void> {
		const r = this.read;
		if (!r || 'error' in r) return;
		this.mainBtn.disabled = true;
		try {
			if ('custom' in r) {
				new Notice(await r.custom.add());
				this.close();
				return;
			}
			if (!this.bundle) return;
			const chosen = this.plan.filter(p => this.picked.has(p));
			const pictures = new Map(this.input.files.filter(f => f.data).map(f => [f.name.replace(/^.*[\\/]/, '').toLowerCase(), f.data!]));
			const res = await writePlan(this.plugin, this.bundle, chosen, { files: pictures });
			this.close();
			if (res.files.length === 1) await openNote(this.plugin, res.files[0]);
			const failed = res.failed.length ? ` ${res.failed.length} couldn't be written: ${res.failed.slice(0, 3).join('; ')}.` : '';
			new Notice(`${planResultText(res)}${failed}`);
		} catch (e) {
			console.error('Ember Vault: import failed', e);
			new Notice('Couldn\'t finish the import.');
			this.changed();
		}
	}
}

async function openNote(plugin: EmberVaultPlugin, file: TFile): Promise<void> {
	await plugin.app.workspace.getLeaf(false).openFile(file);
}

/** Open Import…, for one format when `prefer` names its importer. */
export function openImport(plugin: EmberVaultPlugin, o: ImportDialogOptions = {}): void {
	new ImportDialog(plugin, o).open();
}
