// Import…: one dialog for everything that comes in from elsewhere, as the
// import study draws it (prototypes/import-study). A fixed frame: the title,
// what was given (chips: files, pairs of a data file and its picture, pasted
// text, a link), what it was read as, the body, and the footer. The body is
// the start (a drop zone that is also the file chooser, and a paste box), a
// status card (a link to fetch, an error with its evidence), the review (the
// records grouped by what will happen, beside a preview of the selected one),
// or what was written. Each data file is read by its own importer, so files
// of different formats dropped together all come in.

import { Component, Modal, Notice, Platform, setIcon } from 'obsidian';
import type EmberVaultPlugin from '../../../main';
import { dialogFoot, gameDialog } from '../dialog';
import { evIcon, EvIconName } from '../icons';
import { pill } from '../pill';
import { bundleSummary, CheckedBundle, checkBundle, CheckedRecord } from './bundle';
import { convertBundle, Converted } from './convert';
import { changedFields, recordFact } from './facts';
import { detectImporters, extOf, Importer, ImportRead, linkImporter } from './importer';
import { planRecords, PlanItem, PlanStatus } from './plan';
import { blockFor, drawChanges, drawCode, drawPreview, jsonErrorLine, PreviewContext } from './preview';
import { groupSources, isPicture, Source, SourceGroup, sourceId, sizeText } from './sources';
import { vaultHave, writePlan, WriteResult } from './write';

export interface ImportDialogOptions {
	/** An importer's id to read with (a command for one format): its hint shows, and it's tried first. */
	prefer?: string;
}

/** Every importer: the games' own, then mapping files, then core's (bundles, packs, maps), in that order so a game's wins a tie. */
export function allImporters(plugin: EmberVaultPlugin): Importer[] {
	return [...plugin.systems.all().flatMap(s => s.importers ?? []), ...plugin.mappings.importers(), ...plugin.importers];
}

const ICON: Record<string, EvIconName> = { monster: 'skull', spell: 'spell', item: 'gem', equipment: 'gem', npc: 'user', location: 'map-pin', quest: 'scroll', note: 'note', map: 'image', class: 'book', subclass: 'book' };
const GROUPS: { status: PlanStatus; title: string; open: boolean }[] = [
	{ status: 'new', title: 'New', open: true },
	{ status: 'update', title: 'Updates', open: true },
	{ status: 'same', title: 'Already imported', open: false },
	{ status: 'yours', title: 'Already yours', open: false },
	{ status: 'unusable', title: 'Left out', open: true },
];
const TAG: Record<PlanStatus, string> = { new: 'New', update: 'Update', same: 'Imported', yours: 'Yours', unusable: 'Left out' };
const GUIDE = 'https://puddinglord.github.io/obsidian-ttrpg-encounter-manager/docs/import.html';

/** One group of sources, as read. */
interface Read {
	group: SourceGroup;
	candidates: Importer[];
	importer: Importer | null;
	read: ImportRead | null;
	bundle?: CheckedBundle;
	plan: PlanItem[];
	/** It's another game's content that the campaign's game can convert: the two games' names. */
	canConvert?: { from: string; to: string; fromName: string; toName: string };
	/** Convert it (on unless switched off). */
	convert?: boolean;
	converted?: Converted;
}

/** A row of the list: a plan item and the read it came from. */
interface Row { item: PlanItem; read: Read }

interface PendingLink { url: string; host: string; importer?: Importer; dataUrl?: string; state: 'ready' | 'fetching' | 'failed'; error?: string }

type Tab = 'preview' | 'changes' | 'original' | 'source';

const ticked = (it: PlanItem, picked: ReadonlySet<PlanItem>) => picked.has(it) && (it.status !== 'yours' || !!it.copy);
const offerable = (it: PlanItem) => it.status === 'new' || it.status === 'update' || it.status === 'yours';

export class ImportDialog extends Modal {
	private sources: Source[] = [];
	private reads: Read[] = [];
	private link: PendingLink | null = null;
	private picked = new Set<PlanItem>();
	private selected: Row | null = null;
	private tab: Tab = 'preview';
	private closedGroups = new Set<PlanStatus>(GROUPS.filter(g => !g.open).map(g => g.status));
	private filter = '';
	private lookOpen = false;
	private done: WriteResult | null = null;
	private reading = 0;
	private sourcePath: string;
	private urls = new Map<string, string>();
	private preview = new Component();
	private pasteText = '';
	private sourcesEl!: HTMLElement;
	private readEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private footEl!: HTMLElement;
	private dragEl!: HTMLElement;
	private fileInput!: HTMLInputElement;
	private resize?: ResizeObserver;

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
		el.addClass('ev-import-frame');
		this.sourcesEl = el.createDiv({ cls: 'ev-import-sources', attr: { role: 'list', 'aria-label': 'What you gave' } });
		this.readEl = el.createDiv({ cls: 'ev-import-read' });
		this.bodyEl = el.createDiv({ cls: 'ev-import-body' });
		this.footEl = el.createDiv({ cls: 'ev-import-foot-wrap' });
		this.fileInput = el.createEl('input', { type: 'file', cls: 'ev-import-file', attr: { multiple: '', 'aria-label': 'Choose files', tabindex: '-1' } });
		this.fileInput.addEventListener('change', () => {
			const files = this.fileInput.files ? Array.from(this.fileInput.files) : [];
			this.fileInput.value = '';
			void this.addFiles(files);
		});
		this.dragEl = this.modalEl.createDiv({ cls: 'ev-import-drag', attr: { 'aria-hidden': 'true' } });
		this.wireDrop();
		this.wireKeys();
		this.resize = new ResizeObserver(() => this.modalEl.toggleClass('is-narrow', this.modalEl.clientWidth < 720));
		this.resize.observe(this.modalEl);
		this.preview.load();
		this.render();
	}

	onClose(): void {
		this.resize?.disconnect();
		this.preview.unload();
		for (const u of this.urls.values()) URL.revokeObjectURL(u);
		this.urls.clear();
		this.contentEl.empty();
	}

	// ------------------------------------------------------------------------
	// Input

	private wireDrop(): void {
		const m = this.modalEl;
		let depth = 0;
		const count = (e: DragEvent) => Array.from(e.dataTransfer?.items ?? []).filter(i => i.kind === 'file').length;
		m.addEventListener('dragenter', (e) => {
			const n = count(e);
			if (!n) return;
			e.preventDefault();
			depth++;
			this.dragEl.setText(this.sources.length ? `Drop to add ${n === 1 ? '1 more file' : `${n} more files`}` : `Drop to add ${n === 1 ? 'the file' : `${n} files`}`);
			m.addClass('is-dragging');
		});
		m.addEventListener('dragover', (e) => { if (count(e)) e.preventDefault(); });
		m.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; m.removeClass('is-dragging'); } });
		m.addEventListener('drop', (e) => {
			depth = 0;
			m.removeClass('is-dragging');
			const files = e.dataTransfer?.files;
			if (!files?.length) return;
			e.preventDefault();
			void this.addFiles(Array.from(files));
		});
		// ⌘V outside a text box: text into the paste box, a copied picture as a file.
		m.addEventListener('paste', (e) => {
			const t = (e.target as Node | null)?.instanceOf(HTMLElement) ? e.target as HTMLElement : null;
			if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
			const files = Array.from(e.clipboardData?.files ?? []);
			const text = e.clipboardData?.getData('text/plain') ?? '';
			if (!files.length && !text.trim()) return;
			e.preventDefault();
			if (files.length) void this.addFiles(files);
			else this.setPaste(text);
		});
	}

	private wireKeys(): void {
		this.modalEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.importChosen(); return; }
			if (e.key === 'Escape' && this.modalEl.hasClass('is-detail-open') && this.modalEl.hasClass('is-narrow')) {
				e.preventDefault();
				e.stopPropagation();
				this.modalEl.removeClass('is-detail-open');
			}
		}, true);
	}

	private chooseFiles(): void {
		this.fileInput.click();
	}

	private async addFiles(list: File[]): Promise<void> {
		for (const f of list) {
			const textual = /\.(json|ya?ml|md|txt|html?|csv|xml|dd2vtt|uvtt|df2vtt)$/i.test(f.name) || f.type.startsWith('text/') || f.type === 'application/json';
			const name = f.name || (f.type.startsWith('image/') ? `pasted.${f.type.slice(6).replace('jpeg', 'jpg')}` : 'file');
			try {
				this.sources.push(textual
					? { id: sourceId(), kind: 'file', name, text: await f.text(), size: f.size }
					: { id: sourceId(), kind: 'file', name, data: new Uint8Array(await f.arrayBuffer()), size: f.size });
			} catch {
				this.sources.push({ id: sourceId(), kind: 'file', name, size: f.size });
			}
		}
		this.done = null;
		void this.readAll();
	}

	/** Pasted text: a link waits for Fetch; anything else is read as it's typed. */
	private setPaste(text: string): void {
		this.pasteText = text;
		this.sources = this.sources.filter(s => s.kind !== 'text');
		this.link = null;
		const t = text.trim();
		if (/^https?:\/\/\S+$/i.test(t)) {
			const host = (() => { try { return new URL(t).host; } catch { return t; } })();
			const hit = linkImporter(t, allImporters(this.plugin));
			this.link = { url: t, host, state: 'ready', ...(hit ? { importer: hit.importer, dataUrl: hit.dataUrl } : {}) };
		} else if (t) {
			const lines = text.split('\n').length;
			this.sources.push({ id: sourceId(), kind: 'text', name: `Pasted text · ${lines} line${lines === 1 ? '' : 's'}`, text, size: text.length });
		}
		this.done = null;
		void this.readAll();
	}

	private fetchLink(): void {
		const l = this.link;
		if (!l?.dataUrl) return;
		l.state = 'fetching';
		l.error = undefined;
		this.render();
		void this.plugin.importFetch(l.dataUrl).then(res => {
			if (this.link !== l || l.state !== 'fetching') return;
			if (!res.ok) { l.state = 'failed'; l.error = res.error; this.render(); return; }
			this.link = null;
			this.pasteText = '';
			this.sources.push({ id: sourceId(), kind: 'link', name: l.host, text: res.text, url: l.url, size: res.text.length });
			void this.readAll(l.importer);
		});
	}

	private removeSource(id: string): void {
		const s = this.sources.find(x => x.id === id);
		this.sources = this.sources.filter(x => x.id !== id);
		if (s?.kind === 'text') this.pasteText = '';
		const u = this.urls.get(id);
		if (u) { URL.revokeObjectURL(u); this.urls.delete(id); }
		void this.readAll();
	}

	/** A picture's blob address, made once. */
	private urlOf(s: Pick<Source, 'id' | 'name' | 'data'>): string | undefined {
		if (!s.data) return undefined;
		let u = this.urls.get(s.id);
		if (!u) {
			const ext = extOf(s.name);
			const type = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
			u = URL.createObjectURL(new Blob([s.data.buffer.slice(s.data.byteOffset, s.data.byteOffset + s.data.byteLength) as ArrayBuffer], { type }));
			this.urls.set(s.id, u);
		}
		return u;
	}

	// ------------------------------------------------------------------------
	// Reading

	private async readAll(prefer?: Importer): Promise<void> {
		const n = ++this.reading;
		const importers = allImporters(this.plugin);
		const takesPicture = (s: Source) => detectImporters({ files: [{ name: s.name, text: s.text }] }, importers).some(d => ['watabou-dungeon', 'donjon-dungeon'].includes(d.importer.id));
		const groups = groupSources(this.sources, takesPicture);
		const reads: Read[] = [];
		for (const group of groups) {
			// Equally sure: the campaign's own game first.
			const game = this.plugin.system(this.sourcePath).id;
			const found = detectImporters(group.input, importers).sort((a, b) => b.score - a.score || Number(b.importer.system === game) - Number(a.importer.system === game)).map(d => d.importer);
			const want = prefer ?? this.preferred;
			const candidates = want && found.includes(want) ? [want, ...found.filter(i => i !== want)] : found;
			// Opened for one format and nothing fits: that format says what's wrong with it.
			const first = candidates[0] ?? (this.preferred && groups.length === 1 ? this.preferred : null);
			reads.push(await this.readGroup({ group, candidates, importer: first, read: null, plan: [] }));
			if (n !== this.reading) return;
		}
		if (n !== this.reading) return;
		const keyOf = (p: PlanItem) => `${p.record.type}|${p.record.kind}|${p.record.name}`;
		const was = new Map(this.reads.flatMap(r => r.plan.map(p => [keyOf(p), this.picked.has(p)] as const)));
		this.reads = reads;
		this.picked = new Set(reads.flatMap(r => r.plan).filter(p => was.get(keyOf(p)) ?? p.on));
		const rows = this.rows();
		this.selected = rows.find(r => r.item.status === 'new' || r.item.status === 'update') ?? rows[0] ?? null;
		this.tab = this.defaultTab();
		this.render();
	}

	private async readGroup(r: Read): Promise<Read> {
		if (!r.importer) return r;
		try {
			r.read = await r.importer.read(r.group.input, { plugin: this.plugin, sourcePath: this.sourcePath });
			r.bundle = undefined;
			r.plan = [];
			r.canConvert = undefined;
			r.converted = undefined;
			if ('bundle' in r.read) {
				const plugin = this.plugin;
				// Another game's monsters, in a campaign of a game that can build them: converted unless switched off.
				const src = r.read.bundle.system ? plugin.systems.get(r.read.bundle.system) : undefined;
				const dst = plugin.system(this.sourcePath);
				const out = src?.content?.creatures?.out;
				const into = dst.content?.creatures?.in;
				let raw = r.read.bundle;
				if (src && src.id !== dst.id && out && into && (raw.content ?? []).some(e => e.kind === 'monster')) {
					r.canConvert = { from: src.id, to: dst.id, fromName: src.name, toName: dst.name };
					if (r.convert !== false) {
						r.converted = convertBundle(raw, { from: src.id, to: dst.id, out, in: into });
						raw = r.converted.bundle;
					}
				}
				r.bundle = checkBundle(raw, {
					resolve: (id) => {
						const g = plugin.systems.get(id);
						return g ? { id: g.id, kinds: g.content?.kinds ?? [], editions: g.editions?.map(e => e.id) } : undefined;
					},
				});
				if (r.converted) {
					// What the conversion changed, first among what's worth a look.
					for (const rec of r.bundle.records) rec.warnings = [...(r.converted.notes.get(rec.name) ?? []), ...rec.warnings];
					r.bundle.warnings.push(...r.converted.said);
				}
				r.plan = r.bundle.error ? [] : planRecords(r.bundle.records, vaultHave(plugin, r.bundle.system));
			}
		} catch (e) {
			console.error('Ember Vault: could not read the import', e);
			r.read = { error: e instanceof Error ? e.message : 'Couldn\'t read that.' };
		}
		return r;
	}

	/** After a group is read again: its new records ticked as they start, the selection on its first. */
	private refreshPicks(read: Read): void {
		this.picked = new Set([...this.picked].filter(p => this.reads.some(r => r.plan.includes(p))));
		for (const p of read.plan) if (p.on) this.picked.add(p);
		this.selected = this.rows()[0] ?? null;
		this.tab = this.defaultTab();
		this.render();
	}

	private async readAs(read: Read, id: string, list: Importer[] = read.candidates): Promise<void> {
		read.candidates = list;
		read.importer = list.find(i => i.id === id) ?? null;
		await this.readGroup(read);
		this.picked = new Set([...this.picked].filter(p => this.reads.some(r => r.plan.includes(p))));
		for (const p of read.plan) if (p.on) this.picked.add(p);
		this.selected = this.rows()[0] ?? null;
		this.tab = this.defaultTab();
		this.render();
	}

	/** Every record of every bundle read, in the order the groups were given. */
	private rows(): Row[] {
		return this.reads.flatMap(read => read.plan.map(item => ({ item, read })));
	}

	/** The one review an importer draws itself (a D&D Beyond character, a content pack), when that's all there is. */
	private custom(): Extract<ImportRead, { custom: unknown }>['custom'] | undefined {
		const r = this.reads.length === 1 ? this.reads[0].read : null;
		return r && 'custom' in r ? r.custom : undefined;
	}

	private chosen(): PlanItem[] {
		return this.rows().map(r => r.item).filter(p => offerable(p) && ticked(p, this.picked));
	}

	private defaultTab(): Tab {
		const s = this.selected?.item.status;
		return s === 'update' ? 'changes' : s === 'unusable' ? 'source' : 'preview';
	}

	// ------------------------------------------------------------------------
	// Drawing

	private render(): void {
		this.drawSources();
		this.drawRead();
		this.drawBody();
		this.drawFoot();
	}

	private drawSources(): void {
		const el = this.sourcesEl;
		el.empty();
		el.toggleClass('is-hidden', !this.sources.length || !!this.done);
		if (!this.sources.length || this.done) return;
		const shown = new Set<string>();
		const chip = (parent: HTMLElement, s: Source, read?: Read) => {
			shown.add(s.id);
			const c = parent.createDiv({ cls: 'ev-import-source', attr: { role: 'listitem' } });
			const thumb = c.createDiv({ cls: 'ev-import-source-thumb' });
			const url = isPicture(s) ? this.urlOf(s) : undefined;
			if (url) thumb.createEl('img', { attr: { src: url, alt: '' } });
			else setIcon(thumb, evIcon(s.kind === 'text' ? 'clipboard-text' : s.kind === 'link' ? 'globe-simple' : /^(json|ya?ml|dd2vtt|uvtt|df2vtt|xml)$/.test(extOf(s.name)) ? 'file-code' : 'file-text'));
			const t = c.createDiv({ cls: 'ev-import-source-text' });
			t.createDiv({ cls: 'ev-import-source-name', text: s.name });
			const what = this.whatItIs(s, read);
			const meta = t.createDiv({ cls: `ev-import-source-meta${what.bad ? ' is-bad' : ''}`, text: [s.kind === 'file' ? sizeText(s.size) : '', what.text].filter(Boolean).join(' · ') });
			meta.setAttr('title', what.text);
			const x = c.createEl('button', { cls: 'ev-import-source-remove clickable-icon', attr: { 'aria-label': `Remove ${s.name}` } });
			setIcon(x, evIcon('x'));
			x.addEventListener('click', () => this.removeSource(s.id));
		};
		for (const read of this.reads) {
			const g = read.group;
			if (g.sources.length > 1 && !g.sources.every(isPicture)) {
				const pair = el.createDiv({ cls: 'ev-import-pair' });
				g.sources.forEach((s, i) => {
					if (i) setIcon(pair.createSpan({ cls: 'ev-import-pair-link', attr: { 'aria-label': 'Read together' } }), evIcon('link'));
					chip(pair, s, read);
				});
			} else for (const s of g.sources) chip(el, s, read);
		}
		for (const s of this.sources) if (!shown.has(s.id)) chip(el, s);
		const add = pill(el, { tag: 'button', cls: 'ev-import-add', icon: evIcon('plus'), text: 'Add' });
		add.addEventListener('click', () => this.chooseFiles());
	}

	/** What a chip says it is: the format it was read as, or what's wrong. */
	private whatItIs(s: Source, read?: Read): { text: string; bad?: boolean } {
		if (s.kind === 'file' && s.text === undefined && !s.data) return { text: 'Couldn\'t be read', bad: true };
		if (isPicture(s) && read && read.group.sources[0] !== s) return { text: 'its picture' };
		if (!read) return { text: '' };
		if (!read.importer) return { text: 'Not recognised', bad: true };
		if (read.read && 'error' in read.read) return { text: read.read.error, bad: true };
		if (this.reads.length > 1 && read.read && 'custom' in read.read) return { text: `${read.importer.label}: import it on its own`, bad: true };
		return { text: read.importer.label.replace(/^(a|an) /i, '') };
	}

	private drawRead(): void {
		const el = this.readEl;
		el.empty();
		const reads = this.reads.filter(r => r.read && !('error' in r.read));
		// A review an importer draws itself says what it read itself, unless it hands the frame a head.
		const show = !!reads.length && !this.done && !this.link && !(this.custom() && !this.custom()?.head);
		el.toggleClass('is-hidden', !show);
		if (!show) return;
		const custom = this.custom();
		const one = reads.length === 1 ? reads[0] : undefined;
		const head = custom?.head;
		setIcon(el.createDiv({ cls: 'ev-import-read-icon' }), evIcon(head?.icon ?? 'books'));
		const text = el.createDiv({ cls: 'ev-import-read-text' });
		const b = one?.bundle;
		text.createDiv({ cls: 'ev-import-read-name', text: head?.title ?? (one ? b?.source?.name ?? one.importer?.label ?? 'Import' : `${this.sources.length} sources`) });
		const sub = text.createDiv({ cls: 'ev-import-read-sub' });
		const bit = (t?: string, icon?: EvIconName, href?: string) => {
			if (!t) return;
			const s = sub.createSpan({ cls: 'ev-import-read-bit' });
			if (icon) setIcon(s.createSpan({ cls: 'ev-import-read-bit-icon' }), evIcon(icon));
			if (href) s.createEl('a', { text: t, href, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
			else s.createSpan({ text: t });
		};
		const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
		if (head) bit(head.summary);
		else if (one) {
			bit(cap(one.importer?.label.replace(/^(a|an) /i, '') ?? ''));
			if (b) bit(cap(bundleSummary(b.records)));
			bit(b?.system ? this.plugin.systems.get(b.system)?.name : undefined);
			bit(b?.edition ? `${b.edition} rules` : undefined);
			bit(b?.source?.license, 'scales');
			const url = b?.source?.url ?? one.group.input.url;
			if (url) bit(url.replace(/^https:\/\//, '').replace(/\/$/, ''), 'link', url);
		} else {
			bit(cap(bundleSummary(this.rows().map(r => r.item.record))));
			bit([...new Set(reads.map(r => r.importer?.label.replace(/^(a|an) /i, '')))].join(', '));
		}
		const tools = el.createDiv({ cls: 'ev-import-read-tools' });
		if (one && one.candidates.length > 1) this.readAsChoice(tools, one);
		for (const r of reads.filter(x => x.canConvert)) {
			const sw = tools.createEl('label', { cls: 'ev-import-switch ev-import-convert' });
			const box = sw.createEl('input', { type: 'checkbox' });
			box.checked = r.convert !== false;
			sw.createSpan({ text: `Convert to ${r.canConvert!.toName}` });
			box.addEventListener('change', () => { r.convert = box.checked; void this.readGroup(r).then(() => { this.refreshPicks(r); }); });
		}
		const looks = reads.flatMap(r => [...(r.bundle?.warnings ?? []), ...(r.read && 'notes' in r.read ? r.read.notes ?? [] : [])]);
		if (looks.length) {
			const t = pill(tools, { tag: 'button', cls: 'ev-import-look-toggle', icon: evIcon('warning'), text: `${looks.length} to look at` });
			t.setAttr('aria-expanded', String(this.lookOpen));
			t.addEventListener('click', () => { this.lookOpen = !this.lookOpen; this.drawRead(); });
			if (this.lookOpen) {
				const box = el.createDiv({ cls: 'ev-import-look' });
				for (const l of looks) box.createDiv({ cls: 'ev-import-look-row', text: l });
			}
		}
	}

	private drawBody(): void {
		const el = this.bodyEl;
		this.preview.unload();
		this.preview = new Component();
		this.preview.load();
		el.empty();
		this.modalEl.removeClass('is-start', 'is-review', 'is-status', 'is-done', 'is-custom');
		if (this.done) { this.modalEl.addClass('is-done'); this.drawDone(el); return; }
		if (this.link) { this.modalEl.addClass('is-status'); this.drawLink(el); return; }
		if (!this.sources.length) { this.modalEl.addClass('is-start'); this.drawStart(el); return; }
		const custom = this.custom();
		if (custom) {
			this.modalEl.addClass('is-custom');
			const col = el.createDiv({ cls: 'ev-import-custom' }).createDiv({ cls: 'ev-import-custom-col nimble-import-report' });
			custom.render(col, () => this.drawFoot());
			return;
		}
		if (!this.rows().length) { this.modalEl.addClass('is-status'); this.drawProblem(el); return; }
		this.modalEl.addClass('is-review');
		this.drawReview(el);
	}

	private drawStart(el: HTMLElement): void {
		const start = el.createDiv({ cls: 'ev-import-start' });
		const pref = this.preferred;
		const drop = start.createDiv({ cls: 'ev-import-drop', attr: { role: 'button', tabindex: '0', 'aria-label': 'Choose files, or drop them here' } });
		setIcon(drop.createDiv({ cls: 'ev-import-drop-icon' }), evIcon('tray-arrow-down'));
		drop.createDiv({ cls: 'ev-import-drop-title', text: Platform.isMobile ? 'Choose files' : 'Drop files here' });
		drop.createDiv({ cls: 'ev-import-drop-sub', text: 'Several at once: a dungeon and its picture' });
		const choose = pill(drop, { tag: 'button', cls: 'ev-import-choose', icon: evIcon('folder-simple'), text: 'Choose files' });
		choose.addEventListener('click', (e) => { e.stopPropagation(); this.chooseFiles(); });
		drop.addEventListener('click', () => this.chooseFiles());
		drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.chooseFiles(); } });
		const box = start.createDiv({ cls: 'ev-import-pastebox' });
		if (pref?.hint) pref.hint(box.createDiv({ cls: 'ev-import-hint' }));
		const label = box.createEl('label', { cls: 'ev-import-label' });
		setIcon(label.createSpan({ cls: 'ev-import-label-icon' }), evIcon('clipboard-text'));
		label.createSpan({ text: 'Or paste' });
		const area = box.createEl('textarea', { cls: 'ev-import-paste nimble-import-text', attr: { placeholder: pref?.id === 'ddb-character' ? 'The character\'s data' : 'A stat block, JSON, or a link', spellcheck: 'false', 'aria-label': 'Paste text or a link' } });
		area.value = this.pasteText;
		let timer = 0;
		area.addEventListener('input', () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => this.setPaste(area.value), 250);
		});
		const formats = start.createDiv({ cls: 'ev-import-formats' });
		formats.createSpan({ cls: 'ev-import-formats-label', text: 'Reads ' });
		const labels = [...new Set(allImporters(this.plugin).map(i => i.label.replace(/^(a|an) /i, '')))];
		formats.appendText(`${labels.join(', ')}. `);
		formats.createEl('a', { text: 'Import guide', href: GUIDE, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
		window.setTimeout(() => (pref ? area : drop).focus(), 0);
	}

	private card(el: HTMLElement, icon: EvIconName, title: string, o: { bad?: boolean; url?: string; text?: string } = {}): HTMLElement {
		const card = el.createDiv({ cls: 'ev-import-card', attr: { role: o.bad ? 'alert' : 'status' } });
		setIcon(card.createDiv({ cls: `ev-import-card-icon${o.bad ? ' is-bad' : ''}` }), evIcon(icon));
		card.createDiv({ cls: 'ev-import-card-title', text: title });
		if (o.url) card.createDiv({ cls: 'ev-import-card-url', text: o.url });
		if (o.text) card.createDiv({ cls: 'ev-import-card-text', text: o.text });
		return card.createDiv({ cls: 'ev-import-card-actions' });
	}

	private drawLink(el: HTMLElement): void {
		const l = this.link!;
		const wrap = el.createDiv({ cls: 'ev-import-status' });
		const back = (actions: HTMLElement) => {
			const b = pill(actions, { tag: 'button', cls: 'ev-import-btn', text: 'Paste something else' });
			b.addEventListener('click', () => { this.link = null; this.pasteText = ''; this.render(); });
		};
		if (/(^|\.)dndbeyond\.com$/i.test(l.host)) {
			const actions = this.card(wrap, 'globe-simple', 'A D&D Beyond link', { url: l.url, text: 'Ember Vault never connects to D&D Beyond. Open your character\'s data in the browser, copy all of it, and paste it here.' });
			allImporters(this.plugin).find(i => i.id === 'ddb-character')?.hint?.(actions);
			back(actions);
			return;
		}
		if (!l.dataUrl) {
			back(this.card(wrap, 'globe-simple', `Ember Vault can't read links from ${l.host}`, { url: l.url, text: 'Download the export there, then choose the file.', bad: true }));
			return;
		}
		if (l.state === 'fetching') {
			wrap.addClass('is-fetching');
			const actions = this.card(wrap, 'circle-notch', `Fetching from ${l.host}…`, { url: l.url });
			const stop = pill(actions, { tag: 'button', cls: 'ev-import-btn', text: 'Stop' });
			stop.addEventListener('click', () => { l.state = 'ready'; this.render(); });
			return;
		}
		const failed = l.state === 'failed';
		const actions = this.card(wrap, failed ? 'warning' : 'globe-simple', failed ? 'Couldn\'t fetch it' : `A ${l.importer?.label ?? 'supported'} link`, {
			url: l.url, bad: failed,
			text: failed ? l.error : `Ember Vault asks ${l.host} for it once, when you choose Fetch.`,
		});
		const go = pill(actions, { tag: 'button', cls: 'ev-import-fetch mod-cta', icon: evIcon(failed ? 'arrows-clockwise' : 'arrow-square-out'), text: failed ? 'Try again' : `Fetch from ${l.host}` });
		go.addEventListener('click', () => this.fetchLink());
		back(actions);
	}

	/** Nothing to review: what was given couldn't be read, with its evidence. */
	private drawProblem(el: HTMLElement): void {
		const wrap = el.createDiv({ cls: 'ev-import-status' });
		const r = this.reads.find(x => !x.importer || (x.read && 'error' in x.read)) ?? this.reads[0];
		const src = r?.group.sources.find(s => s.text !== undefined);
		const who = src ? (src.kind === 'text' ? 'The pasted text' : src.name) : 'This';
		if (r && r.read && 'error' in r.read) {
			const bad = src?.text && /^\s*[[{]/.test(src.text) ? jsonErrorLine(src.text) : { message: '' };
			const title = bad.message ? `${who} isn't JSON Ember Vault can read` : r.read.error;
			const actions = this.card(wrap, 'warning', title, { bad: true, text: bad.message ? `${bad.line ? `Line ${bad.line}. ` : ''}Check for a missing comma, quote or bracket there.` : undefined });
			this.readAsChoice(actions, r, allImporters(this.plugin));
			if (src?.text) drawCode(wrap, src.text, { mark: bad.line });
			return;
		}
		if (r && !r.importer) {
			const actions = this.card(wrap, 'question', 'Ember Vault doesn\'t recognise this', { text: 'Pick the format it should be, and it says what doesn\'t fit.' });
			this.readAsChoice(actions, r, allImporters(this.plugin));
			actions.createEl('a', { text: 'Import guide', href: GUIDE, cls: 'external-link', attr: { target: '_blank', rel: 'noopener' } });
			if (src?.text) drawCode(wrap, src.text);
			return;
		}
		this.card(wrap, 'warning', r?.bundle?.error ?? 'There\'s nothing in this to import.', { bad: true });
	}

	private readAsChoice(el: HTMLElement, r: Read, list: Importer[] = r.candidates): void {
		if (!list.length) return;
		const as = el.createEl('label', { cls: 'ev-import-as' });
		as.createSpan({ cls: 'ev-import-as-label', text: 'Read as' });
		const sel = as.createEl('select', { cls: 'dropdown' });
		if (!r.importer || !list.includes(r.importer)) sel.createEl('option', { text: 'Choose a format', value: '' });
		for (const i of list) sel.createEl('option', { text: i.label, value: i.id });
		sel.value = r.importer && list.includes(r.importer) ? r.importer.id : '';
		sel.addEventListener('change', () => { if (sel.value) void this.readAs(r, sel.value, list); });
	}

	// ------------------------------------------------------------------------
	// Review

	private label(row: Row): string {
		const r = row.item.record;
		if (r.type === 'map') return 'Map';
		if (r.type === 'note') return r.kind === 'npc' ? 'NPC' : r.kind.charAt(0).toUpperCase() + r.kind.slice(1);
		return this.plugin.systems.get(row.read.bundle?.system ?? '')?.content?.kinds.find(k => k.kind === r.kind)?.label ?? r.kind;
	}

	private drawReview(el: HTMLElement): void {
		const review = el.createDiv({ cls: 'ev-import-review' });
		const rail = review.createDiv({ cls: 'ev-import-rail' });
		const detail = review.createDiv({ cls: 'ev-import-detail' });
		const rows = this.rows();
		const offered = rows.filter(r => r.item.status === 'new' || r.item.status === 'update');
		const tools = rail.createDiv({ cls: 'ev-import-tools' });
		const all = tools.createEl('label', { cls: 'ev-import-all' });
		const box = all.createEl('input', { type: 'checkbox', attr: { 'aria-label': 'Import all' } });
		const on = offered.filter(r => this.picked.has(r.item)).length;
		box.checked = !!offered.length && on === offered.length;
		box.indeterminate = on > 0 && on < offered.length;
		box.disabled = !offered.length;
		all.createSpan({ text: `All ${offered.length}` });
		box.addEventListener('change', () => {
			for (const r of offered) { if (box.checked) this.picked.add(r.item); else this.picked.delete(r.item); }
			this.drawBody();
			this.drawFoot();
		});
		const list = rail.createDiv({ cls: 'ev-import-list', attr: { role: 'listbox', 'aria-label': 'What it brings' } });
		if (rows.length > 6) {
			const f = tools.createEl('input', { type: 'search', cls: 'ev-import-filter', attr: { placeholder: 'Filter', 'aria-label': 'Filter' } });
			f.value = this.filter;
			f.addEventListener('input', () => { this.filter = f.value; this.drawList(list, rows); });
		}
		this.drawList(list, rows);
		this.drawDetail(detail);
	}

	private drawList(list: HTMLElement, rows: Row[]): void {
		list.empty();
		const q = this.filter.trim().toLowerCase();
		const shown = rows.filter(r => !q || r.item.record.name.toLowerCase().includes(q) || this.label(r).toLowerCase().includes(q));
		for (const g of GROUPS) {
			const in_ = shown.filter(r => r.item.status === g.status);
			if (!in_.length) continue;
			const closed = this.closedGroups.has(g.status) && !q;
			const group = list.createDiv({ cls: `ev-import-group${closed ? ' is-closed' : ''}`, attr: { 'data-status': g.status } });
			const head = group.createEl('button', { cls: 'ev-import-group-head', attr: { 'aria-expanded': String(!closed) } });
			head.createSpan({ cls: 'ev-import-group-title', text: g.title });
			head.createSpan({ cls: 'ev-import-group-count', text: String(in_.length) });
			setIcon(head.createSpan({ cls: 'ev-import-group-caret' }), evIcon(closed ? 'caret-right' : 'caret-down'));
			head.addEventListener('click', () => { if (closed) this.closedGroups.delete(g.status); else this.closedGroups.add(g.status); this.drawList(list, rows); });
			if (closed) continue;
			for (const row of in_) this.drawRow(group, row, list, rows);
		}
	}

	private drawRow(parent: HTMLElement, row: Row, list: HTMLElement, rows: Row[]): void {
		const it = row.item;
		const r = it.record;
		const selected = this.selected?.item === it;
		const on = ticked(it, this.picked);
		const el = parent.createDiv({ cls: `ev-import-row${selected ? ' is-selected' : ''}${on ? '' : ' is-off'}`, attr: { role: 'option', tabindex: selected ? '0' : '-1', 'aria-selected': String(selected), 'data-kind': r.kind, 'data-name': r.name } });
		if (offerable(it)) {
			const box = el.createEl('input', { type: 'checkbox', attr: { 'data-kind': r.kind, 'data-name': r.name, 'aria-label': it.status === 'yours' ? `Import ${r.name} as a copy` : `Import ${r.name}` } });
			box.checked = on;
			box.addEventListener('click', (e) => e.stopPropagation());
			box.addEventListener('change', () => this.tick(it, box.checked));
		} else {
			setIcon(el.createSpan({ cls: 'ev-import-row-state', attr: { 'aria-label': TAG[it.status], title: TAG[it.status] } }), evIcon(it.status === 'same' ? 'check-circle' : 'prohibit'));
		}
		setIcon(el.createSpan({ cls: 'ev-import-row-icon' }), evIcon(ICON[r.kind] ?? 'note'));
		const text = el.createDiv({ cls: 'ev-import-row-text' });
		text.createDiv({ cls: 'ev-import-row-name', text: r.name || r.at });
		const fact = it.status === 'update' && it.before && r.value ? `${this.label(row)} · ${changesText(it.before, r.value)}`
			: it.status === 'unusable' ? `${this.label(row)} · ${r.errors[0] ?? 'In this import twice'}`
				: recordFact(r, this.label(row));
		text.createDiv({ cls: 'ev-import-row-meta', text: fact });
		const end = el.createDiv({ cls: 'ev-import-row-end' });
		if (r.converted) pill(end, { tag: 'span', cls: 'ev-import-tag', icon: evIcon('sparkle'), text: 'Converted' });
		if (r.value && r.warnings.length) setIcon(end.createSpan({ cls: 'ev-import-row-warn', attr: { 'aria-label': 'Worth a look', title: r.warnings[0] } }), evIcon('warning'));
		setIcon(end.createSpan({ cls: 'ev-import-row-go' }), evIcon('caret-right'));
		el.addEventListener('click', () => this.select(row, true));
		el.addEventListener('keydown', (e) => {
			const order = rows.filter(x => !this.closedGroups.has(x.item.status));
			const i = order.findIndex(x => x.item === it);
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				const next = order[i + (e.key === 'ArrowDown' ? 1 : -1)];
				if (next) this.select(next, false);
			} else if (e.key === ' ' && offerable(it)) { e.preventDefault(); this.tick(it, !on); }
			else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); this.select(row, true); }
		});
	}

	private tick(it: PlanItem, on: boolean): void {
		if (on) this.picked.add(it); else this.picked.delete(it);
		if (it.status === 'yours') it.copy = on;
		this.drawBody();
		this.drawFoot();
		this.bodyEl.querySelector<HTMLElement>('.ev-import-row.is-selected')?.focus();
	}

	private select(row: Row, open: boolean): void {
		this.selected = row;
		this.tab = this.defaultTab();
		if (open) this.modalEl.addClass('is-detail-open');
		this.drawBody();
		this.bodyEl.querySelector<HTMLElement>('.ev-import-row.is-selected')?.focus();
	}

	private drawDetail(el: HTMLElement): void {
		const row = this.selected;
		if (!row) return;
		const it = row.item;
		const r = it.record;
		const head = el.createDiv({ cls: 'ev-import-detail-head' });
		const back = head.createEl('button', { cls: 'ev-import-back clickable-icon', attr: { 'aria-label': 'Back to the list' } });
		setIcon(back, evIcon('arrow-left'));
		back.addEventListener('click', () => this.modalEl.removeClass('is-detail-open'));
		const title = head.createDiv({ cls: 'ev-import-detail-title' });
		title.createDiv({ cls: 'ev-import-detail-name', text: r.name || r.at });
		const meta = title.createDiv({ cls: 'ev-import-detail-meta' });
		pill(meta, { tag: 'span', cls: `ev-import-tag is-${it.status}`, text: TAG[it.status] });
		meta.createSpan({ cls: 'ev-import-detail-fact', text: recordFact(r, this.label(row)) });
		if (offerable(it)) {
			const tick = head.createEl('label', { cls: 'ev-import-detail-tick' });
			const box = tick.createEl('input', { type: 'checkbox' });
			box.checked = ticked(it, this.picked);
			box.addEventListener('change', () => this.tick(it, box.checked));
			tick.createSpan({ text: it.status === 'yours' ? 'Import as a copy' : 'Import' });
		}
		const tabs = el.createDiv({ cls: 'ev-import-tabs' }).createDiv({ cls: 'ev-import-seg', attr: { role: 'tablist' } });
		const avail: { id: Tab; label: string; icon: EvIconName }[] = [
			...(it.status === 'update' && it.before ? [{ id: 'changes' as const, label: 'Changes', icon: 'swap' as const }] : []),
			...(r.value ? [{ id: 'preview' as const, label: 'Preview', icon: 'eye' as const }] : []),
			...(r.converted && row.read.converted?.originals.has(r.name) ? [{ id: 'original' as const, label: 'Original', icon: 'swap' as const }] : []),
			{ id: 'source', label: 'Source', icon: 'code' },
		];
		if (!avail.some(a => a.id === this.tab)) this.tab = avail[0].id;
		for (const a of avail) {
			const b = pill(tabs, { tag: 'button', icon: evIcon(a.icon), text: a.label, cls: a.id === this.tab ? 'is-active' : '' });
			b.setAttr('role', 'tab');
			b.setAttr('aria-selected', String(a.id === this.tab));
			b.addEventListener('click', () => { this.tab = a.id; this.drawBody(); });
		}
		const pane = el.createDiv({ cls: 'ev-import-pane', attr: { role: 'tabpanel' } });
		// Notes first: why it was left out, what's already there, what's worth a look.
		const from = r.source?.name ?? row.read.bundle?.source?.name ?? 'Imported';
		if (it.status === 'unusable') this.note(pane, 'prohibit', 'Left out', r.errors.join('; ') || 'It\'s in this import twice; the first one counts.', 'is-bad');
		if (it.status === 'same') this.note(pane, 'check-circle', 'Imported before', 'Unchanged, so it\'s left as it is.', '', it.file);
		if (it.status === 'yours') this.note(pane, 'lock-simple', 'The vault has its own', `Yours is never changed. Tick Import as a copy to add this one beside it, as "${r.name} (${from})".`, '', it.file);
		if (r.value && r.warnings.length) this.note(pane, 'warning', 'Worth a look', r.warnings.join(' '), 'is-look');
		if (this.tab === 'changes' && it.before && r.value) drawChanges(pane, it.before, r.value);
		else if (this.tab === 'preview') drawPreview(pane, r, this.previewContext(row));
		else if (this.tab === 'original') this.drawOriginal(pane, row);
		else this.drawSource(pane, row);
		const pins = r.type === 'map' && r.value && Array.isArray(r.value.pins) ? r.value.pins as { text?: string }[] : [];
		if (this.tab === 'preview' && offerable(it) && pins.some(p => p.text)) {
			const sw = pane.createEl('label', { cls: 'ev-import-switch' });
			const box = sw.createEl('input', { type: 'checkbox', cls: 'ev-import-room-notes' });
			box.checked = !!it.roomNotes;
			box.addEventListener('change', () => { it.roomNotes = box.checked; });
			sw.createSpan({ text: 'A location note for each room, linked from its pin' });
		}
	}

	/** A converted record as its own game drew it. */
	private drawOriginal(el: HTMLElement, row: Row): void {
		const orig = row.read.converted?.originals.get(row.item.record.name);
		if (!orig || !row.read.canConvert) return;
		const { kind, from: _f, converted: _c, ...value } = orig;
		const rec: CheckedRecord = { type: 'content', kind, name: orig.name, at: '', value: value, errors: [], warnings: [] };
		drawPreview(el, rec, { ...this.previewContext(row), system: row.read.canConvert.from, edition: undefined });
	}

	private note(el: HTMLElement, icon: EvIconName, title: string, text: string, cls = '', file?: string): void {
		const n = el.createDiv({ cls: `ev-import-note ${cls}`.trim() });
		setIcon(n.createSpan({ cls: 'ev-import-note-icon' }), evIcon(icon));
		const t = n.createDiv({ cls: 'ev-import-note-text' });
		t.createDiv({ cls: 'ev-import-note-title', text: title });
		t.createDiv({ text });
		if (file) {
			const open = pill(n, { tag: 'button', cls: 'ev-import-open', icon: evIcon('arrow-square-out'), text: 'Open' });
			open.addEventListener('click', () => { const f = this.app.vault.getFileByPath(file); if (f) void this.app.workspace.getLeaf('tab').openFile(f); });
		}
	}

	private previewContext(row: Row): PreviewContext {
		const pics = new Map<string, string>();
		for (const s of row.read.group.sources) {
			const u = isPicture(s) ? this.urlOf(s) : undefined;
			if (u) pics.set(s.name.replace(/^.*[\\/]/, '').toLowerCase(), u);
		}
		for (const f of row.read.bundle?.files ?? []) {
			const key = f.name.toLowerCase();
			if (pics.has(key)) continue;
			if (f.bytes) { const u = this.urlOf({ id: `bundle:${row.read.group.sources[0]?.id}:${key}`, name: f.name, data: f.bytes }); if (u) pics.set(key, u); }
			else if (f.data) pics.set(key, `data:${extOf(f.name) === 'svg' ? 'image/svg+xml' : `image/${extOf(f.name)}`};base64,${f.data}`);
		}
		return { plugin: this.plugin, system: row.read.bundle?.system, edition: row.read.bundle?.edition, sourcePath: this.sourcePath, component: this.preview, picture: (name) => pics.get(name.toLowerCase()) };
	}

	private drawSource(el: HTMLElement, row: Row): void {
		const r = row.item.record;
		const whole = row.read.group.sources.find(s => s.text !== undefined)?.text ?? '';
		const bar = el.createDiv({ cls: 'ev-import-code-bar' });
		const block = r.type === 'content' ? blockFor(this.plugin, row.read.bundle?.system, r, row.read.bundle?.edition) : null;
		const views: { id: string; label: string; text: string }[] = [
			...(block ? [{ id: 'note', label: 'As written', text: block }] : []),
			...(r.value ? [{ id: 'record', label: 'As read', text: JSON.stringify(r.value, null, 2) }] : []),
			...(whole ? [{ id: 'file', label: 'Whole file', text: whole }] : []),
		];
		if (!views.length) return;
		let view = views[0].id;
		const seg = bar.createDiv({ cls: 'ev-import-seg is-small' });
		const code = el.createDiv({ cls: 'ev-import-code-wrap' });
		const show = () => {
			code.empty();
			seg.querySelectorAll('button').forEach(b => b.toggleClass('is-active', b.dataset.view === view));
			drawCode(code, views.find(v => v.id === view)!.text);
		};
		for (const v of views) {
			const b = pill(seg, { tag: 'button', text: v.label });
			b.dataset.view = v.id;
			b.addEventListener('click', () => { view = v.id; show(); });
		}
		const copy = pill(bar, { tag: 'button', cls: 'ev-import-btn', icon: evIcon('copy'), text: 'Copy' });
		copy.addEventListener('click', () => { void navigator.clipboard.writeText(views.find(v => v.id === view)!.text).then(() => new Notice('Copied.')); });
		show();
	}

	// ------------------------------------------------------------------------
	// Footer, importing, done

	private drawFoot(): void {
		const el = this.footEl;
		el.empty();
		if (this.done) {
			const files = this.done.files;
			const one = files.length === 1 ? files[0] : null;
			const { main } = dialogFoot(el, {
				cancel: false,
				second: [{ text: 'Import more', cls: 'ev-import-more', onClick: () => this.reset() }],
				main: { text: one ? `Open ${one.basename}` : 'Done', icon: evIcon(one ? 'arrow-square-out' : 'check'), onClick: () => { this.close(); if (one) void this.app.workspace.getLeaf(false).openFile(one); } },
			});
			main.addClass('ev-import-main');
			return;
		}
		const custom = this.custom();
		const n = custom ? custom.chosen() : this.chosen().length;
		const label = custom ? custom.action ?? 'Import' : n ? `Import ${n}` : 'Import';
		const { main, foot } = dialogFoot(el, { cancel: () => this.close(), main: { text: label, icon: evIcon('check'), onClick: () => void this.importChosen() } });
		main.addClass('ev-import-main');
		main.disabled = !n;
		if (!Platform.isMobile) foot.insertBefore(createSpan({ cls: 'ev-import-kbd', text: Platform.isMacOS ? '⌘↵' : 'Ctrl+↵' }), main);
	}

	private reset(): void {
		for (const u of this.urls.values()) URL.revokeObjectURL(u);
		this.urls.clear();
		this.sources = [];
		this.reads = [];
		this.link = null;
		this.pasteText = '';
		this.picked.clear();
		this.selected = null;
		this.done = null;
		this.modalEl.removeClass('is-detail-open');
		this.render();
	}

	private async importChosen(): Promise<void> {
		const main = this.footEl.querySelector<HTMLButtonElement>('.ev-import-main');
		if (!main || main.disabled || this.done) return;
		main.disabled = true;
		const custom = this.custom();
		try {
			if (custom) {
				new Notice(await custom.add());
				this.close();
				return;
			}
			const total: WriteResult = { added: 0, updated: 0, files: [], failed: [] };
			for (const read of this.reads) {
				if (!read.bundle) continue;
				const items = read.plan.filter(p => offerable(p) && ticked(p, this.picked));
				if (!items.length) continue;
				const pictures = new Map(read.group.sources.filter(s => s.data).map(s => [s.name.replace(/^.*[\\/]/, '').toLowerCase(), s.data!]));
				const res = await writePlan(this.plugin, read.bundle, items, { files: pictures });
				total.added += res.added;
				total.updated += res.updated;
				total.files.push(...res.files);
				total.failed.push(...res.failed);
			}
			this.done = total;
			this.modalEl.removeClass('is-detail-open');
			if (!this.modalEl.isConnected) new Notice(doneText(total));
			this.render();
		} catch (e) {
			console.error('Ember Vault: import failed', e);
			new Notice('Couldn\'t finish the import.');
			this.drawFoot();
		}
	}

	private drawDone(el: HTMLElement): void {
		const result = this.done!;
		const wrap = el.createDiv({ cls: 'ev-import-done' });
		setIcon(wrap.createDiv({ cls: `ev-import-card-icon${result.files.length ? '' : ' is-bad'}` }), evIcon(result.files.length ? 'check-circle' : 'warning'));
		wrap.createDiv({ cls: 'ev-import-card-title', text: doneText(result) });
		const list = wrap.createDiv({ cls: 'ev-import-written' });
		for (const f of result.files) {
			const row = list.createDiv({ cls: 'ev-import-written-row' });
			const kind = this.app.metadataCache.getFileCache(f)?.frontmatter?.nimble as unknown;
			setIcon(row.createSpan({ cls: 'ev-import-written-icon' }), evIcon(ICON[typeof kind === 'string' ? kind : ''] ?? (f.extension === 'md' ? 'note' : 'image')));
			const t = row.createDiv({ cls: 'ev-import-written-text' });
			t.createDiv({ cls: 'ev-import-written-name', text: f.basename });
			t.createDiv({ cls: 'ev-import-written-path', text: f.parent?.path ?? '' });
			const open = pill(row, { tag: 'button', cls: 'ev-import-open', icon: evIcon('arrow-square-out'), text: 'Open' });
			open.addEventListener('click', () => { void this.app.workspace.getLeaf('tab').openFile(f); });
		}
		for (const f of result.failed) {
			const row = list.createDiv({ cls: 'ev-import-written-row is-bad' });
			setIcon(row.createSpan({ cls: 'ev-import-written-icon' }), evIcon('warning'));
			row.createDiv({ cls: 'ev-import-written-text', text: f });
		}
	}
}

/** "2 changes". */
function changesText(before: Record<string, unknown>, after: Record<string, unknown>): string {
	const n = changedFields(before, after).length;
	return `${n} change${n === 1 ? '' : 's'}`;
}

function doneText(r: WriteResult): string {
	const parts = [r.added ? `Added ${r.added}` : '', r.updated ? `${r.added ? 'updated' : 'Updated'} ${r.updated}` : ''].filter(Boolean);
	const s = parts.length ? `${parts.join(', ')}.` : 'Nothing was written.';
	return r.failed.length ? `${s} ${r.failed.length} couldn't be written.` : s;
}

/** Open Import…, for one format when `prefer` names its importer. */
export function openImport(plugin: EmberVaultPlugin, o: ImportDialogOptions = {}): void {
	new ImportDialog(plugin, o).open();
}
