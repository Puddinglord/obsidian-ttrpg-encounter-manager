// A map in its own tab: the same map as the block, filling the pane, saving
// through the same path into the note it lives in. It remembers which note and
// which block across restarts, and opens a real Obsidian note beside it (the
// campaign's latest session by default) with the Notes button or the
// "Toggle map note panel" hotkey.

import { FuzzySuggestModal, ItemView, MarkdownPostProcessorContext, MarkdownSectionInformation, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type NimbleStatblocksPlugin from '../main';
import { MapBlock, MAP_VIEW_TYPE } from './map-block';
import { parseMapBlock, pickMapFence } from './map-def';

export { MAP_VIEW_TYPE };

interface MapViewState { file?: string; index?: number; image?: string }

export class MapView extends ItemView {
	private file: string | null = null;
	private index = 0;
	private image: string | undefined;
	private child: MapBlock | null = null;
	/** The note split this view opened beside itself, while it's open. */
	private noteLeaf: WorkspaceLeaf | null = null;
	/** The text the map was last drawn from, so our own saves don't redraw it twice. */
	private drawn = '';

	constructor(leaf: WorkspaceLeaf, private plugin: NimbleStatblocksPlugin) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string { return MAP_VIEW_TYPE; }
	getIcon(): string { return 'map'; }
	getDisplayText(): string {
		const name = this.file?.replace(/^.*\//, '').replace(/\.md$/i, '');
		return name ? `${name}` : 'Map';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), file: this.file ?? undefined, index: this.index, image: this.image };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const st = (state ?? {}) as MapViewState;
		const changed = st.file !== this.file || st.index !== this.index;
		this.file = typeof st.file === 'string' ? st.file : null;
		this.index = typeof st.index === 'number' ? st.index : 0;
		this.image = typeof st.image === 'string' ? st.image : undefined;
		await super.setState(state, result);
		if (changed) this.drawn = '';
		await this.render();
		// The tab's title follows the file, but the view header needs a nudge (not in the public API, so only if it's there).
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		this.containerEl.querySelector('.view-header-title')?.setText(this.getDisplayText());
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('nimble-map-view');
		this.registerEvent(this.app.vault.on('modify', (f) => { if (f.path === this.file) void this.render(); }));
		this.registerEvent(this.app.vault.on('rename', (f, old) => {
			if (old !== this.file) return;
			this.file = f.path;
			void this.render();
			this.app.workspace.requestSaveLayout();
		}));
		this.registerEvent(this.app.vault.on('delete', (f) => { if (f.path === this.file) this.leaf.detach(); }));
		await this.render();
	}

	async onClose(): Promise<void> {
		this.child?.unload();
		this.child = null;
	}

	private get mapId(): string { return `${this.file ?? ''}::${this.index}`; }

	private async render(): Promise<void> {
		const el = this.contentEl;
		const file = this.file ? this.app.vault.getFileByPath(this.file) : null;
		if (!file) {
			this.child?.unload();
			this.child = null;
			el.empty();
			el.createDiv({ cls: 'nimble-error', text: this.file ? `Couldn't find ${this.file}.` : 'No map to show.' });
			return;
		}
		const text = await this.app.vault.read(file);
		const fence = pickMapFence(text, this.index, this.image);
		if (fence && fence.body === this.drawn && this.child) return;
		this.child?.unload();
		this.child = null;
		el.empty();
		if (!fence) {
			el.createDiv({ cls: 'nimble-error', text: `There's no map in ${file.basename} any more.` });
			return;
		}
		this.index = fence.index;
		this.image = parseMapBlock(fence.body).image;
		this.drawn = fence.body;
		const host = el.createDiv({ cls: 'nimble-map-view-host' });
		// The block thinks it's in the note: its section is the fence's lines, so saves go through replaceMapBlock.
		const lines = text.split('\n').length;
		const info: MarkdownSectionInformation = { text, lineStart: fence.open, lineEnd: Math.min(fence.close, lines - 1) };
		const ctx = {
			sourcePath: file.path,
			docId: `nimble-map-view-${file.path}`,
			frontmatter: undefined,
			addChild: (c: MapBlock) => this.addChild(c),
			getSectionInfo: () => info,
		} as unknown as MarkdownPostProcessorContext;
		this.child = new MapBlock(this.plugin, host, fence.body, ctx, {
			fill: true,
			notes: { toggle: () => void this.toggleNotes(), isOpen: () => this.notesOpen(), pick: () => this.pickNote() },
			openMap: (link) => this.openMap(link),
		});
		this.addChild(this.child);
	}

	/** A map pin to another map: show that map here (Back returns). */
	private openMap(link: string): boolean {
		const target = this.app.metadataCache.getFirstLinkpathDest(link.split('#')[0], this.file ?? '');
		if (!target) return false;
		void this.leaf.setViewState({ type: MAP_VIEW_TYPE, state: { file: target.path, index: 0 }, active: true });
		return true;
	}

	// ------------------------------------------------------------------------
	// The note beside the map

	notesOpen(): boolean {
		return !!this.noteLeaf && this.app.workspace.getLeavesOfType('markdown').includes(this.noteLeaf);
	}

	/** The note to show: the one picked for this map, else the campaign's latest session. */
	private noteFor(): TFile | null {
		const picked = this.plugin.settings.mapNotes?.[this.mapId];
		const f = picked ? this.app.vault.getFileByPath(picked) : null;
		if (f) return f;
		const c = this.file ? this.plugin.campaigns.of(this.file) ?? this.plugin.campaigns.active : this.plugin.campaigns.active;
		const sessions = c?.sections.find(s => s.notes.some(n => n.kind === 'session'))?.notes.filter(n => n.kind === 'session') ?? [];
		const last = sessions[sessions.length - 1];
		return last ? this.app.vault.getFileByPath(last.path) : null;
	}

	/** Open the note in a split beside the map, or close it. */
	async toggleNotes(): Promise<void> {
		if (this.notesOpen()) {
			this.noteLeaf!.detach();
			this.noteLeaf = null;
			this.redrawToolbar();
			return;
		}
		const file = this.noteFor();
		if (!file) { this.pickNote(); return; }
		await this.showNote(file);
	}

	private async showNote(file: TFile): Promise<void> {
		if (!this.notesOpen()) this.noteLeaf = this.app.workspace.createLeafBySplit(this.leaf, 'vertical');
		await this.noteLeaf!.openFile(file);
		this.redrawToolbar();
	}

	/** Choose the note shown beside this map; the map remembers it. */
	pickNote(): void {
		const campaign = this.file ? this.plugin.campaigns.of(this.file) : undefined;
		new NotePicker(this.app, campaign?.folder, (file) => {
			(this.plugin.settings.mapNotes ||= {})[this.mapId] = file.path;
			void this.plugin.saveSettings();
			void this.showNote(file);
		}).open();
	}

	/** The Notes button shows whether the split is open. */
	private redrawToolbar(): void {
		const b = this.contentEl.querySelector<HTMLElement>('button[aria-label="Notes beside the map"]');
		b?.toggleClass('is-active', this.notesOpen());
		b?.setAttr('aria-pressed', String(this.notesOpen()));
	}
}

/** Any note, the map's campaign's first. */
class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(app: MapView['app'], private folder: string | undefined, private choose: (f: TFile) => void) {
		super(app);
		this.setPlaceholder('Show which note beside the map?');
	}
	getItems(): TFile[] {
		const all = this.app.vault.getMarkdownFiles();
		const inside = (f: TFile) => !!this.folder && f.path.startsWith(`${this.folder}/`);
		return [...all.filter(inside), ...all.filter(f => !inside(f))];
	}
	getItemText(f: TFile): string { return f.path.replace(/\.md$/i, ''); }
	onChooseItem(f: TFile): void { this.choose(f); }
}

/** The "Toggle map note panel" action: works when a map tab is active. */
export function toggleMapNotes(plugin: NimbleStatblocksPlugin, checking: boolean): boolean {
	const view = plugin.app.workspace.getActiveViewOfType(MapView);
	if (!view) return false;
	if (!checking) void view.toggleNotes();
	return true;
}
